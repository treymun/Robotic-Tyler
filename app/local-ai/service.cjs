'use strict';
// ROBOTIC TYLER local AI: the service the desktop app uses (v2.38, stage 1: text replies).
//
// One model at a time in one llama-server process. It starts only when a reply (or the speed check)
// needs it, closes after the idle time the owner picks (giving back all of its memory), and closes
// when Tyler is stopped, on the emergency stop and when the app quits.
// Nothing here changes the model or where it runs by itself: a reply that can't be made as chosen
// (not installed, doesn't fit, the card isn't there) fails with the reason. Nothing is ever sent to a
// cloud AI instead; that decision is the caller's, and the caller (background.js) never makes it.
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),{EventEmitter}=require('node:events'),{execFile}=require('node:child_process');
const {Installer,LOCK,GB}=require('./installer.cjs'),{LlamaServer}=require('./server.cjs'),hardware=require('./hardware.cjs');
const MODELS=Object.keys(LOCK.models);
const DEFAULTS={model:null,device:'auto',idleMinutes:10};
const IDLE=[0,1,2,5,10,20,30,60];
const SPEED_PROMPT=[{role:'system',content:'You are ROBOTIC TYLER, a friendly gaming companion in a Steam chat. Reply in one or two short sentences.'},{role:'user',content:'Hey Tyler, say hi to the squad and hype them up for the next match.'}];
const err=(message,code,kind='fatal',extra={})=>Object.assign(Error(message),{code,kind,...extra});
const NO_CLOUD=' Tyler didn’t use a cloud AI instead.';
const WHERE='Settings → On this PC';

/** Processor threads for the engine: the physical cores (about half the logical ones), 1–16. */
// The models' own chat templates (Qwen3.5's among them) refuse a conversation whose
// instructions are not all at the start ("System message must be at the beginning.") or that
// has no user message ("No user query found in messages."). Tyler adds notes later in the list
// (the fresh-reply and rewrite notes), so every instruction moves, in order, into one opening
// block; empty instructions are dropped and a conversation with no user message gets one.
function tidyMessages(list){
 const clean=m=>({role:['system','user','assistant'].includes(m?.role)?m.role:'user',content:String(m?.content??'')});
 const rules=[],talk=[];
 for(const m of (Array.isArray(list)?list:[]).map(clean)){
  if(m.role!=='system')talk.push(m);
  else if(m.content.trim())rules.push(m.content.trim());
 }
 if(!talk.some(m=>m.role==='user'))talk.push({role:'user',content:'Continue.'});
 return rules.length?[{role:'system',content:rules.join('\n\n')},...talk]:talk;
}
function threads(cpus=os.cpus().length){return Math.max(1,Math.min(16,cpus>=4?Math.floor(cpus/2):cpus));}

class LocalAI extends EventEmitter{
 /**
  * @param {object} o
  * @param {string} o.dataDir        …\RoboticTylerHydraCloudV12\LocalAI
  * @param {Function} o.fetch        fetch for downloads
  * @param {Function} o.getSettings  async () => saved localAI settings
  * @param {Function} o.setSettings  async (object) => void
  */
 constructor({dataDir,fetch,getSettings,setSettings,log=()=>{},lock,platform=process.platform,detect=hardware.detect,freemem=os.freemem,startTimeout=180000,retryDelay,serverArgs=[],minuteMs=60000}){
  super();Object.assign(this,{dir:dataDir,getSettingsRaw:getSettings,setSettingsRaw:setSettings,log,detectFn:detect,freemem,startTimeout,serverArgs,minuteMs});
  fs.mkdirSync(dataDir,{recursive:true});
  this.installer=new Installer({dir:dataDir,fetch,log,lock,platform,retryDelay});
  this.lock=this.installer.lock;this.platform=platform;
  this.server=null;this.starting=null;this.loaded=null;this.idleTimer=null;this.installJob=null;this.lastError=null;this.lastInstallError=null;this.hw=null;this.vk=null;
  this.active=new Set();
  this.cleanStale();
 }
 // ── settings ────────────────────────────────────────────────────────────
 async settings(){const s=await this.getSettingsRaw().catch(()=>null);return {...DEFAULTS,...(s&&typeof s==='object'?s:{})};}
 async saveSettings(changes={}){
  const s=await this.settings(),next={...s};
  if(changes.model!==undefined)next.model=MODELS.includes(changes.model)?changes.model:null;
  if(changes.device!==undefined)next.device=changes.device==='cpu'?'cpu':'auto';
  if(changes.idleMinutes!==undefined){const n=Number(changes.idleMinutes);next.idleMinutes=IDLE.includes(n)?n:DEFAULTS.idleMinutes;}
  await this.setSettingsRaw(next);
  // A different model or place takes effect at the next reply: the running one is closed now, so its memory is free.
  if(this.loaded&&(this.loaded.model!==next.model||this.loaded.deviceSetting!==next.device))await this.close('settings changed');
  this.scheduleIdle(next);this.emitStatus();return next;
 }
 // ── this PC ─────────────────────────────────────────────────────────────
 gpuEnv(){const g=this.installer.gpuBackend();return g?{...process.env,GGML_BACKEND_PATH:g}:process.env;}
 /** Vulkan's list of graphics cards, once the engine is installed (cached for a minute). */
 async vulkan(refresh=false){
  if(!this.installer.engineReady()||!this.installer.gpuBackend())return null;
  if(!refresh&&this.vk&&Date.now()-this.vk.at<60000)return this.vk;
  const r=await hardware.vulkanDevices(this.installer.exe(),this.gpuEnv());this.vk={...r,at:Date.now()};return this.vk;
 }
 async hardware(refresh=false){
  if(!this.hw||refresh||Date.now()-this.hw.at>60000){const vk=await this.vulkan(refresh).catch(()=>null);this.hw=await this.detectFn(this.dir,{vulkan:vk});}
  return this.hw;
 }
 // ── plan, install, remove ───────────────────────────────────────────────
 async planFor({model}={}){
  const s=await this.settings(),hw=await this.hardware().catch(()=>null),rec=hw?hardware.suggest(hw):null;
  const key=MODELS.includes(model)?model:s.model||rec?.model||'4b';
  const p=this.installer.plan({model:key});
  return {...p,files:undefined,suggestion:rec,free:hw?.disk?.free??null};
 }
 async install({model,offline=[]}={}){
  if(this.installJob)throw err('Text AI on this PC is already being installed.','busy','turn');
  const ctl=new AbortController();this.installJob={ctl,model,progress:{phase:'start',label:'Checking this PC'}};this.lastInstallError=null;this.emitStatus();
  try{
   if(!MODELS.includes(model))throw err('Choose a model first.','unknown_model');
   const folders=(offline||[]).map(x=>String(x||'').trim().replace(/^["']+|["']+$/g,'')).filter(Boolean);
   for(const f of folders)if(!fs.existsSync(f)||!fs.statSync(f).isDirectory())throw err('The folder “'+f+'” wasn’t found. Check the path (without quotes) and try again.','OFFLINE');
   await this.close('installing'); // nothing may run from the engine while it's replaced
   await this.installer.install({model},{offline:folders,signal:ctl.signal,onProgress:e=>{this.installJob.progress=e;this.emit('install',e);}});
   // Installing a model is choosing it (the owner pressed Install with it selected).
   await this.saveSettings({model});
   this.vk=null;this.hw=null;
   this.emit('install',{phase:'done',label:'Text AI on this PC is ready'});return {ok:true};
  }catch(e){
   const out=e.name==='AbortError'?'Installation stopped. What was downloaded is kept, so it carries on from there next time.':e.message;
   this.lastInstallError={message:out,at:Date.now()};this.emit('install',{phase:'failed',label:out});throw Object.assign(Error(out),{code:e.code});
  }finally{this.installJob=null;this.emitStatus();}
 }
 cancelInstall(){this.installJob?.ctl.abort();}
 async remove(){if(this.installJob)throw err('Stop the installation first.','busy','turn');await this.close('removed');await this.installer.remove();this.vk=null;this.emitStatus();}
 async removeModel(key){if(this.installJob)throw err('Stop the installation first.','busy','turn');if(this.loaded?.model===key)await this.close('model removed');await this.installer.removeModel(key);this.emitStatus();}
 // ── status ──────────────────────────────────────────────────────────────
 async status(){
  const s=await this.settings(),inst=this.installer.status(),hw=this.hw,rec=hw?hardware.suggest(hw):null;
  const model=s.model||rec?.model||'4b',modelOk=!!inst.models[model];
  return {supported:this.supported(),installed:inst.installed,models:inst.models,build:this.lock.engine.build,check:inst.check,
   model,modelChosen:!!s.model,modelLabel:this.lock.models[model]?.label||model,uncensored:!!this.lock.models[model]?.uncensored,
   ready:inst.installed&&modelOk,needs:!inst.installed?'install':!modelOk?'model':null,
   suggestion:rec,hardware:hw?{cpu:hw.cpu,ram:hw.ram,gpus:hw.gpus,disk:hw.disk,vulkanChecked:hw.vulkanChecked}:null,
   running:!!this.server?.alive&&!!this.loaded,starting:!!this.starting,loaded:this.loaded?{model:this.loaded.model,device:this.loaded.device,gpu:this.loaded.gpu||null,since:this.loaded.at,loadMs:this.loaded.loadMs}:null,
   busy:this.active.size>0,installing:this.installJob?{model:this.installJob.model,...this.installJob.progress}:null,installError:this.lastInstallError,lastError:this.lastError,settings:s};
 }
 supported(){try{this.installer.runtimeId();return true;}catch{return false;}}
 emitStatus(){this.status().then(s=>this.emit('status',s)).catch(()=>{});}
 // ── the engine process ──────────────────────────────────────────────────
 /** Where the chosen model runs, decided at start: never moved to the processor quietly. */
 async placement(s){
  if(s.device==='cpu')return {device:'cpu'};
  const vk=await this.vulkan(true).catch(e=>({devices:[],error:e}));
  const cards=(vk?.devices||[]).filter(d=>!d.integrated),any=vk?.devices||[];
  const pick=(cards.length?cards:any).slice().sort((a,b)=>b.vramFree-a.vramFree)[0];
  if(pick)return {device:'gpu',gpuId:pick.id,gpu:pick};
  // "Graphics card when possible": a PC with no card Vulkan can use runs on the processor, and says so.
  // A card that was used before and has gone (a driver problem) is a failure, not a quiet move.
  if(this.installer.state()?.gpuSeen)throw err('The graphics card can’t be used right now: Vulkan found none. Update or reinstall the graphics driver, or choose “Processor only” in '+WHERE+'.'+NO_CLOUD,'no_gpu');
  return {device:'cpu',noCard:true};
 }
 roomFor(key,where){
  const need=hardware.NEEDS[hardware.sizeOf(key)],label=this.lock.models[key].label;
  if(where.device==='gpu'&&where.gpu?.vramFree&&where.gpu.vramFree<need.vram*0.9)
   throw err(label+' needs about '+(need.vram/GB).toFixed(1)+' GB of free graphics memory and '+where.gpu.name+' has '+(where.gpu.vramFree/GB).toFixed(1)+' GB free right now (a game may be using it). Close it'+(hardware.sizeOf(key)==='9b'?', choose a 4B model,':'')+' or choose “Processor only” in '+WHERE+'.'+NO_CLOUD,'out_of_memory');
  if(where.device==='cpu'){const free=this.freemem();if(free<need.ram*0.8)throw err(label+' on the processor needs about '+(need.ram/GB).toFixed(1)+' GB of free memory and '+(free/GB).toFixed(1)+' GB is free. Close some programs'+(hardware.sizeOf(key)==='9b'?', or choose a 4B model':'')+'.'+NO_CLOUD,'out_of_memory');}
 }
 /** The running engine for the chosen model, started if needed (one start at a time). */
 async ensure({onStage}={}){
  const s=await this.settings();
  if(!this.supported())throw err('Text AI on this PC needs Windows.','unsupported');
  const st=this.installer.state(),key=s.model;
  if(!st||!this.installer.engineReady(st))throw err('Text AI on this PC isn’t installed yet. Install it in '+WHERE+'.'+NO_CLOUD,'not_installed');
  if(!key)throw err('No model is chosen for Text AI on this PC. Choose one in '+WHERE+'.'+NO_CLOUD,'no_model');
  if(!this.installer.modelReady(key,st))throw err('The '+this.lock.models[key].label+' model isn’t installed. Install it in '+WHERE+' (Tyler doesn’t switch to another model by himself).'+NO_CLOUD,'model_missing');
  if(this.installJob)throw err('Text AI on this PC is being installed. Try again when it’s done.','installing','turn');
  if(this.server?.alive&&this.loaded&&this.loaded.model===key&&this.loaded.deviceSetting===s.device)return this.server;
  if(this.starting)return this.starting;
  this.starting=(async()=>{
   if(this.server)await this.close('switching');
   const where=await this.placement(s);this.roomFor(key,where);
   onStage?.('Starting the AI on this PC…');
   const srv=new LlamaServer({exe:this.installer.exe(st),model:this.installer.modelFile(key,st),device:where.device,gpuId:where.gpuId,gpuBackend:this.installer.gpuBackend(st),threads:threads(),log:this.log,startTimeout:this.startTimeout,extraArgs:this.serverArgs});
   this.server=srv;
   srv.on('exit',e=>{if(this.server!==srv)return;const wasLoaded=!!this.loaded;this.server=null;this.loaded=null;clearTimeout(this.idleTimer);this.clearPid();
    if(!e.stopped&&wasLoaded){const label=this.lock.models[key].label;
     this.lastError={message:(e.reason==='out_of_memory'?label+' ran out of memory and the AI on this PC closed. Close other programs'+(hardware.sizeOf(key)==='9b'?' or choose a 4B model':'')+' in '+WHERE+'.':'The AI on this PC closed unexpectedly.')+NO_CLOUD+' (Engine: '+srv.lastLines().slice(0,160)+')',code:e.reason,at:Date.now()};
     this.log('Local AI','the engine closed unexpectedly: '+srv.lastLines());}
    this.emitStatus();});
   let r;
   try{r=await srv.start();}
   catch(e){if(this.server===srv)this.server=null;throw this.explain(e,key,where);}
   this.writePid(srv);
   if(where.device==='gpu'&&!st.gpuSeen){const now=this.installer.state();if(now){now.gpuSeen=true;fs.writeFileSync(this.installer.statePath(),JSON.stringify(now,null,1));}}
   this.loaded={model:key,device:where.device,deviceSetting:s.device,gpu:where.gpu?{name:where.gpu.name,id:where.gpu.id}:null,noCard:!!where.noCard,at:Date.now(),loadMs:r.loadMs};
   this.lastError=null;this.scheduleIdle(s);this.emitStatus();return srv;
  })();
  try{return await this.starting;}finally{this.starting=null;}
 }
 /** A failure in words the owner can act on. */
 explain(e,key,where){
  if(e.kind)return e; // already in words (placement, memory check)
  const label=this.lock.models[key]?.label||'The model',detail=String(e.detail||e.message).slice(0,200),gpu=where?.device==='gpu';
  switch(e.code){
   case 'cancelled':return err('Stopped.','cancelled','turn');
   case 'not_installed':return err(e.message+NO_CLOUD,'not_installed');
   case 'start_timeout':return err(e.message+(hardware.sizeOf(key)==='9b'?' A 4B model loads faster.':'')+NO_CLOUD,'start_timeout');
   case 'out_of_memory':{const alt=[hardware.sizeOf(key)==='9b'?'choose a 4B model':null,gpu?'choose “Processor only”':null].filter(Boolean);
    return err(label+' didn’t fit in '+(gpu?'the graphics card’s free memory':'the free memory')+' right now'+(gpu?' (a game may be using it)':'')+'. Close other programs'+(alt.length?', or '+alt.join(', or ')+' in '+WHERE:'')+'.'+NO_CLOUD+' (Engine: '+detail+')','out_of_memory');}
   case 'model_load':return err('The AI engine couldn’t load '+label+'. Remove it and install it again in '+WHERE+'.'+NO_CLOUD+' (Engine: '+detail+')','model_load');
   default:return err('The AI on this PC couldn’t start: '+detail+'.'+NO_CLOUD,e.code||'crashed');
  }
 }
 scheduleIdle(s){clearTimeout(this.idleTimer);const mins=s?.idleMinutes??DEFAULTS.idleMinutes;if(!mins||!this.server)return;
  this.idleTimer=setTimeout(()=>{if(!this.active.size&&!this.starting){this.log('Local AI','idle: closing the engine');void this.close('idle');}else this.scheduleIdle(s);},mins*this.minuteMs);this.idleTimer.unref?.();}
 /** Closes the engine (its memory is given back). Replies in progress end with "Stopped". */
 async close(reason='closed'){
  clearTimeout(this.idleTimer);for(const c of this.active)c.abort();
  const srv=this.server;this.server=null;this.loaded=null;
  if(srv){this.log('Local AI','closing the engine ('+reason+')');await srv.stop();this.clearPid();}
  this.emitStatus();
 }
 /** Tyler was stopped (Pause, Stop, the Steam window closed, the emergency stop): free the memory now. */
 release(reason='Tyler stopped'){return this.close(reason);}
 killNow(){try{this.server?.kill();}catch{}this.clearPid();}
 // A llama-server left behind by a crash of the app (it holds gigabytes): ended at the next start.
 pidPath(){return path.join(this.dir,'running.json');}
 writePid(srv){try{fs.writeFileSync(this.pidPath(),JSON.stringify({pid:srv.proc?.pid,exe:path.basename(srv.exe),at:Date.now()}));}catch{}}
 clearPid(){try{fs.rmSync(this.pidPath(),{force:true});}catch{}}
 cleanStale(){
  let r;try{r=JSON.parse(fs.readFileSync(this.pidPath(),'utf8'));}catch{return;}
  this.clearPid();const pid=Number(r?.pid);if(!Number.isInteger(pid)||pid<=0||pid===process.pid)return;
  const same=name=>String(name||'').toLowerCase().includes(String(r.exe||'llama-server').toLowerCase().replace(/\.exe$/,''));
  if(process.platform==='win32')execFile('tasklist',['/FI','PID eq '+pid,'/FO','CSV','/NH'],{windowsHide:true,timeout:5000},(e,out)=>{if(!e&&same(out))try{process.kill(pid);this.log('Local AI','ended an engine left from before');}catch{}});
  else{try{if(same(fs.readlinkSync('/proc/'+pid+'/exe'))){process.kill(pid,'SIGKILL');this.log('Local AI','ended an engine left from before');}}catch{}}
 }
 // ── replies ─────────────────────────────────────────────────────────────
 /**
  * One reply. body: {messages, max_tokens, temperature?, stream}. onText(fullTextSoFar) while
  * streaming; onStage(text) for "Starting the AI on this PC…". Resolves {text, usage, firstTokenMs,
  * model, label, device, ms}. Fails with {code, kind} and a reason; never anything else.
  */
 async chat({messages,max_tokens,temperature,stream=true,signal,onText,onStage,timeoutMs=85000}={}){
  if(!Array.isArray(messages)||!messages.length)throw err('Nothing to answer.','bad_request','turn');
  const ctl=new AbortController(),started=Date.now();
  const stop=()=>ctl.abort();signal?.addEventListener('abort',stop,{once:true});if(signal?.aborted)ctl.abort();
  const timer=setTimeout(()=>{ctl.timedOut=true;ctl.abort();},timeoutMs);
  this.active.add(ctl);clearTimeout(this.idleTimer);this.emitStatus();let srv=null;
  try{
   // Stop works while the engine is still loading too (the load carries on for the next reply).
   const starting=this.ensure({onStage});starting.catch(()=>{});
   srv=await Promise.race([starting,new Promise((_,j)=>{if(ctl.signal.aborted)j(err('Stopped.','cancelled','turn'));ctl.signal.addEventListener('abort',()=>j(err('Stopped.','cancelled','turn')),{once:true});})]);
   if(ctl.signal.aborted)throw err('Stopped.','cancelled','turn');
   const body={messages:tidyMessages(messages),max_tokens:Math.max(1,Math.min(1024,Number(max_tokens)||220)),stream:stream!==false,...(typeof temperature==='number'&&Number.isFinite(temperature)?{temperature}:{})};
   const r=await srv.chat(body,{signal:ctl.signal,onDelta:onText});
   const text=String(r.text||'').trim();
   if(!text)throw err('The AI on this PC answered without any text. Try again.','empty','turn');
   return {text,usage:r.usage?{prompt:r.usage.prompt_tokens||0,completion:r.usage.completion_tokens||0}:r.timings?{prompt:r.timings.prompt_n||0,completion:r.timings.predicted_n||0}:null,
    timings:r.timings||null,firstTokenMs:r.firstTokenMs,ms:Date.now()-started,model:this.loaded?.model,label:this.lock.models[this.loaded?.model]?.label,device:this.loaded?.device};
  }catch(e){
   if(ctl.timedOut)throw err('The AI on this PC took too long (over '+Math.round(timeoutMs/1000)+' s). A smaller model or the graphics card is faster ('+WHERE+').'+NO_CLOUD,'timeout','turn');
   if(ctl.signal.aborted||e.code==='cancelled')throw err('Stopped.','cancelled','turn');
   if(e.code==='ECONNRESET'||e.code==='not_running'||e.code==='ECONNREFUSED'){
    // The engine ended in the middle of the reply: say why (often memory), don't retry by itself.
    await srv?.waitExit(3000);
    const last=this.lastError?.message||'The AI on this PC stopped in the middle of the reply.';throw err(/cloud AI/.test(last)?last:last+NO_CLOUD,'crashed','turn');}
   if(e.code==='stall')throw err('The AI on this PC stopped answering (nothing for 60 s).'+NO_CLOUD,'stall','turn');
   if(e.kind)throw e;
   throw err('The AI on this PC failed: '+String(e.message||e).slice(0,200)+NO_CLOUD,e.code||'failed','turn');
  }finally{clearTimeout(timer);signal?.removeEventListener('abort',stop);this.active.delete(ctl);this.scheduleIdle(await this.settings());this.emitStatus();}
 }
 /** Settings → Speed check: starts the engine if needed and times one short reply. */
 async speedCheck(){
  const wasRunning=!!this.server?.alive&&!!this.loaded,t0=Date.now();
  const r=await this.chat({messages:SPEED_PROMPT,max_tokens:60,stream:true,timeoutMs:240000});
  const t=r.timings||{},gen=t.predicted_per_second||(t.predicted_n&&t.predicted_ms?t.predicted_n/(t.predicted_ms/1000):null);
  const c={ok:true,at:Date.now(),model:r.model,label:r.label,device:r.device,gpu:this.loaded?.gpu?.name||null,startMs:wasRunning?0:this.loaded?.loadMs||null,
   firstTokenMs:r.firstTokenMs,totalMs:Date.now()-t0,tokensPerSecond:gen?+gen.toFixed(1):null,promptTokensPerSecond:t.prompt_per_second?+t.prompt_per_second.toFixed(1):null,tokens:t.predicted_n||r.usage?.completion||null,text:r.text.slice(0,160)};
  this.installer.saveCheck(c);this.emitStatus();return c;
 }
 async shutdown(){await this.close('quit').catch(()=>{});}
}
module.exports={LocalAI,DEFAULTS,threads,IDLE,tidyMessages};

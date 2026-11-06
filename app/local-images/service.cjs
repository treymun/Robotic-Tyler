'use strict';
// ROBOTIC TYLER images on this PC: the service the desktop app uses (v2.40, stage 3).
//
// One image at a time, each in its own run of the engine (sd-cli): it starts when an image is asked
// for and ends when the image is done, so all of its memory is given back straight away (there's no
// model left loaded and no idle wait). Stop, Pause, the emergency stop and quitting end a running image.
// Before EVERY image, Tyler's image rules (guard.cjs) run: no setting or caller can skip them.
// Nothing here changes the model, the device or the size by itself, and nothing is ever sent to a
// cloud service: an image that can't be made as chosen fails with the reason in plain words.
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto'),{EventEmitter}=require('node:events'),{execFile}=require('node:child_process');
const {Installer,LOCK,GB,WHERE,VC_RUNTIME}=require('./installer.cjs');
const engine=require('./engine.cjs'),guard=require('./guard.cjs'),hardware=require('./hardware.cjs');
const base=require('../theme-voices/hardware.cjs');
const DEFAULTS={model:null,device:'gpu',size:null,friends:false,friendsUncensored:false};
const SIZES=[256,512,640,768,896,1024,1152]; // 256: the quickest, for the processor
const err=(message,code,kind='fatal',extra={})=>Object.assign(Error(message),{code,kind,...extra});
const NOT_ELSE=' Tyler didn’t switch to another model, the other device or a cloud service.';
const MAX_PROMPT=2000,MAX_NEGATIVE=1000;

/** Processor threads for the engine: the physical cores (about half the logical ones), 1–16. */
function threads(cpus=os.cpus().length){return Math.max(1,Math.min(16,cpus>=4?Math.floor(cpus/2):cpus));}
const clean=s=>String(s??'').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g,' ').replace(/\r\n?/g,'\n').trim();

class LocalImages extends EventEmitter{
 /**
  * @param {object} o
  * @param {string} o.dataDir        …\RoboticTylerHydraCloudV12\LocalImages
  * @param {Function} o.fetch        fetch for downloads
  * @param {Function} o.getSettings  async () => saved localImages settings
  * @param {Function} o.setSettings  async (object) => void
  * @param {Function} [o.textVulkan] async () => Text AI's Vulkan list with free memory (when installed), or null
  */
 constructor({dataDir,fetch,getSettings,setSettings,log=()=>{},lock,platform=process.platform,detect=hardware.detect,freemem=os.freemem,retryDelay,dev=false,check,
  textVulkan=async()=>null,cardMemory=null,limits={}}){
  super();Object.assign(this,{dir:dataDir,getSettingsRaw:getSettings,setSettingsRaw:setSettings,log,detectFn:detect,freemem,textVulkan});
  // Safety nets, not targets. The processor is slow (measured on a 4-core PC at 256 × 256: Z-Image Turbo
  // about 23 s a step, Chroma1-HD about 3 minutes a step, so a Chroma picture at 512 × 512 takes hours):
  // a long job that keeps making progress isn't cut off half way, and Stop always works.
  this.limits={gpuMs:15*60000,cpuMs:6*60*60000,gpuStallMs:4*60000,cpuStallMs:60*60000,...limits};
  fs.mkdirSync(dataDir,{recursive:true});
  this.installer=new Installer({dir:dataDir,fetch,log,lock,platform,retryDelay,dev,...(check?{check}:{})});
  this.lock=this.installer.lock;this.platform=platform;
  // Free graphics memory right before an image: NVIDIA's nvidia-smi (fast), and Text AI's Vulkan list when it's there.
  this.cardMemory=cardMemory||(async()=>{const [nv,vk]=await Promise.all([base.detect(this.dir,{others:async()=>[]}).then(h=>h.gpus).catch(()=>[]),this.textVulkan().catch(()=>null)]);return [...(vk?.devices||[]),...nv];});
  this.job=null;this.installJob=null;this.lastError=null;this.lastInstallError=null;this.hw=null;this.sd=null;this.last=null;
  this.cleanStale();
 }
 // ── settings ────────────────────────────────────────────────────────────
 async settings(){const s=await this.getSettingsRaw().catch(()=>null);return {...DEFAULTS,...(s&&typeof s==='object'?s:{})};}
 async saveSettings(changes={}){
  const s=await this.settings(),next={...s};
  if(changes.model!==undefined)next.model=this.installer.modelKeys().includes(changes.model)?changes.model:null;
  if(changes.device!==undefined)next.device=changes.device==='cpu'?'cpu':'gpu';
  if(changes.size!==undefined)next.size=SIZES.includes(Number(changes.size))?Number(changes.size):null;
  if(changes.friends!==undefined)next.friends=changes.friends===true;
  if(changes.friendsUncensored!==undefined)next.friendsUncensored=changes.friendsUncensored===true;
  await this.setSettingsRaw(next);this.emitStatus();return next;
 }
 // ── this PC ─────────────────────────────────────────────────────────────
 gpuEnv(){const g=this.installer.gpuBackend();const e={...process.env};if(g)e.GGML_BACKEND_PATH=g;return e;}
 /** The graphics cards sd-cli sees through Vulkan, once the engine is installed (cached for a minute). */
 async devices(refresh=false){
  if(!this.installer.engineReady()||!this.installer.gpuBackend())return null;
  if(!refresh&&this.sd&&Date.now()-this.sd.at<60000)return this.sd;
  const r=await engine.listDevices(this.installer.exe(),{env:this.gpuEnv()});this.sd={...r,at:Date.now()};return this.sd;
 }
 async hardware(refresh=false){
  if(!this.hw||refresh||Date.now()-this.hw.at>60000){const [sd,vk]=await Promise.all([this.devices(refresh).catch(()=>null),this.textVulkan().catch(()=>null)]);this.hw=await this.detectFn(this.dir,{sd,vulkan:vk});}
  return this.hw;
 }
 // ── plan, install, remove ───────────────────────────────────────────────
 async planFor({model}={}){
  const s=await this.settings(),hw=await this.hardware().catch(()=>null),rec=hw?hardware.suggest(hw,this.lock):null;
  const key=this.installer.modelKeys().includes(model)?model:s.model||rec?.model||'zimage-8gb';
  const p=this.installer.plan({model:key});
  return {...p,files:undefined,suggestion:rec,free:hw?.disk?.free??await this.installer.freeSpace()};
 }
 async install({model,device,offline=[]}={}){
  if(this.installJob)throw err('Images on this PC is already being installed.','busy','turn');
  const ctl=new AbortController();this.installJob={ctl,model,progress:{phase:'start',label:'Checking this PC'}};this.lastInstallError=null;this.emitStatus();
  try{
   if(!this.installer.modelKeys().includes(model))throw err('Choose an image model first.','unknown_model');
   const folders=(offline||[]).map(x=>String(x||'').trim().replace(/^["']+|["']+$/g,'')).filter(Boolean);
   for(const f of folders)if(!fs.existsSync(f)||!fs.statSync(f).isDirectory())throw err('The folder “'+f+'” wasn’t found. Check the path (without quotes) and try again.','OFFLINE');
   await this.cancelJob('installing'); // nothing may run from the engine while it's replaced
   await this.installer.install({model},{offline:folders,signal:ctl.signal,onProgress:e=>{this.installJob.progress=e;this.emit('install',e);}});
   // Installing a model is choosing it (the owner pressed Install with it, and the device, selected).
   await this.saveSettings({model,...(device?{device}:{})});
   this.sd=null;this.hw=null;
   this.emit('install',{phase:'done',label:'Images on this PC is ready'});return {ok:true};
  }catch(e){
   const out=e.name==='AbortError'?'Installation stopped. What was downloaded is kept, so it carries on from there next time.':e.message;
   this.lastInstallError={message:out,code:e.code||null,at:Date.now()};this.emit('install',{phase:'failed',label:out});throw Object.assign(Error(out),{code:e.code});
  }finally{this.installJob=null;this.emitStatus();}
 }
 cancelInstall(){this.installJob?.ctl.abort();}
 async remove(){if(this.installJob)throw err('Stop the installation first.','busy','turn');await this.cancelJob('removed');await this.installer.remove();this.sd=null;this.emitStatus();}
 async removeModel(key){if(this.installJob)throw err('Stop the installation first.','busy','turn');if(this.job?.model===key)await this.cancelJob('model removed');await this.installer.removeModel(key);this.emitStatus();}
 // ── status ──────────────────────────────────────────────────────────────
 async status(){
  const s=await this.settings(),inst=this.installer.status(),hw=this.hw,rec=hw?hardware.suggest(hw,this.lock):null;
  const model=s.model||rec?.model||'zimage-8gb',m=this.lock.models[model],modelOk=!!inst.models[model];
  return {supported:this.supported(),installed:inst.installed,models:inst.models,build:this.lock.engine.build,
   model,modelChosen:!!s.model,modelLabel:m?.label||model,uncensored:!!m?.uncensored,device:s.device,size:s.size||this.defaultSize(m,s.device),
   ready:inst.installed&&modelOk,needs:!inst.installed?'install':!modelOk?'model':null,suggestion:rec,
   hardware:hw?{cpu:hw.cpu,ram:hw.ram,gpus:hw.gpus,disk:hw.disk,sdChecked:hw.sdChecked}:null,
   running:!!this.job,job:this.job?{model:this.job.model,device:this.job.device,started:this.job.started,...this.job.progress}:null,last:this.last,
   installing:this.installJob?{model:this.installJob.model,...this.installJob.progress}:null,installError:this.lastInstallError,lastError:this.lastError,settings:s};
 }
 supported(){try{this.installer.runtimeId();return true;}catch{return false;}}
 emitStatus(){this.status().then(s=>this.emit('status',s)).catch(()=>{});}
 defaultSize(m,device){return m?.size?.[device==='cpu'?'cpu':'gpu']||512;}
 // ── where an image is made ──────────────────────────────────────────────
 /** The card (or the processor) for this image, decided before it starts: never moved quietly. */
 async placement(s){
  if(s.device==='cpu')return {device:'cpu'};
  const sd=await this.devices(true).catch(()=>null);
  const list=(sd?.devices||[]).filter(d=>!hardware.VIRTUAL.test(d.name));
  const mem=await this.cardMemory().catch(()=>[]);
  const withMem=list.map(d=>{const m=mem.find(x=>String(x.name).toLowerCase()===String(d.name).toLowerCase())||mem.find(x=>String(x.name).toLowerCase().includes(String(d.name).toLowerCase())||String(d.name).toLowerCase().includes(String(x.name).toLowerCase()));return {...d,vramFree:m?.vramFree??null,vramTotal:m?.vramTotal??null};});
  const cards=withMem.filter(d=>!d.integrated),pick=(cards.length?cards:withMem).slice().sort((a,b)=>(b.vramFree??-1)-(a.vramFree??-1))[0];
  if(pick)return {device:'gpu',gpuId:pick.id,gpu:pick};
  throw err('No graphics card can be used for images right now: Vulkan found none'+(this.installer.state()?.gpuSeen?' (one was used before: update or reinstall the graphics driver)':'')+'. Choose “Processor only” in '+WHERE+' (much slower).'+NOT_ELSE,'no_gpu');
 }
 roomFor(key,where,{width,height}){
  const need=this.lock.models[key].needs,label=this.lock.models[key].label,scale=Math.max(0.6,(width*height)/(1024*1024));
  const vram=need.vram*(0.75+0.25*scale);
  if(where.device==='gpu'&&where.gpu?.vramFree!=null&&where.gpu.vramFree<vram*0.9)
   throw err(label+' needs about '+(vram/GB).toFixed(1)+' GB of free graphics memory at '+width+' × '+height+', and '+where.gpu.name+' has '+(where.gpu.vramFree/GB).toFixed(1)+' GB free right now (a game may be using it). Close it, choose a smaller size'+(this.lock.models[key].tier==='12gb'?' or the model for 6–8 GB cards':'')+', or choose “Processor only” in '+WHERE+'.'+NOT_ELSE,'out_of_memory');
  const ramNeed=where.device==='cpu'?need.ram:need.ram*0.45,free=this.freemem();
  if(free<ramNeed*0.8)throw err(label+' needs about '+(ramNeed/GB).toFixed(1)+' GB of free memory '+(where.device==='cpu'?'on the processor':'for its text encoder')+' and '+(free/GB).toFixed(1)+' GB is free. Close some programs'+(this.lock.models[key].tier==='12gb'?', or choose the model for 6–8 GB cards':'')+'.'+NOT_ELSE,'out_of_memory');
 }
 /** Checks what the caller asked for; nothing is rounded or changed quietly. */
 request(o,s,m){
  const prompt=clean(o.prompt),negative=clean(o.negative);
  if(!prompt)throw err('Describe the image first.','bad_request','turn');
  if(prompt.length>MAX_PROMPT)throw err('That description is too long (over '+MAX_PROMPT+' characters).','bad_request','turn');
  if(negative.length>MAX_NEGATIVE)throw err('The negative prompt is too long (over '+MAX_NEGATIVE+' characters).','bad_request','turn');
  const size=s.size||this.defaultSize(m,s.device),width=o.width==null?size:Number(o.width),height=o.height==null?size:Number(o.height);
  for(const [k,v] of [['width',width],['height',height]])if(!Number.isInteger(v)||v<256||v>1536||v%64)throw err('The image '+k+' must be a multiple of 64 between 256 and 1536 (it was '+o[k]+').','bad_request','turn');
  if(width*height>1536*1024)throw err('That image is too big: at most 1536 × 1024 (or 1024 × 1536).','bad_request','turn');
  const steps=o.steps==null?m.steps.default:Number(o.steps);
  if(!Number.isInteger(steps)||steps<1||steps>m.steps.max)throw err('Steps must be a whole number from 1 to '+m.steps.max+' for '+m.label+'.','bad_request','turn');
  const seed=o.seed==null||o.seed===''?crypto.randomInt(0,2**31-1):Number(o.seed);
  if(!Number.isInteger(seed)||seed<0||seed>2**31-1)throw err('The seed must be a whole number from 0 to 2147483647.','bad_request','turn');
  return {prompt,negative,width,height,steps,seed};
 }
 // ── images ──────────────────────────────────────────────────────────────
 /**
  * One image. Resolves {png (Buffer), width, height, seed, steps, model, label, uncensored, device, gpu,
  * timings:{totalMs,loadMs,encodeMs,sampleMs,decodeMs,secondsPerStep}, memory}. Fails with {code, kind}
  * and a reason in plain words; never anything else.
  * `names`: the people in the chat and Steam friends, for Tyler's image rules.
  */
 async generate({prompt,negative,width,height,steps,seed,signal,onProgress=()=>{},names=[]}={}){
  const s=await this.settings();
  if(!this.supported())throw err('Images on this PC needs Windows.','unsupported');
  const key=this.installer.modelKeys().includes(s.model)?s.model:null;
  const m=key?this.lock.models[key]:null;
  // Tyler's image rules come first, for every model and everyone (there is no way around them).
  const r=this.request({prompt,negative,width,height,steps,seed},s,m||this.lock.models['zimage-8gb']);
  const g=guard.check({prompt:r.prompt,negative:r.negative,names,uncensored:!!m?.uncensored});
  if(!g.ok){this.log('Images on this PC: refused by Tyler’s image rules ('+g.code+')');throw err(g.reason,'refused','turn',{rule:g.code});}
  const st=this.installer.state();
  if(!st||!this.installer.engineReady(st))throw err('Images on this PC isn’t installed yet. Install it in '+WHERE+'.'+NOT_ELSE,'not_installed');
  if(!key)throw err('No image model is chosen. Choose one in '+WHERE+'.','no_model');
  if(!this.installer.modelReady(key,st))throw err('The '+m.label+' model isn’t installed. Install it in '+WHERE+' (Tyler doesn’t switch to another model by himself).'+NOT_ELSE,'model_missing');
  if(this.installJob)throw err('Images on this PC is being installed. Try again when it’s done.','installing','turn');
  if(this.job)throw err('Tyler is already making an image. Try again when it’s done (or stop it).','busy','turn');
  const ctl=new AbortController(),stop=()=>ctl.abort();signal?.addEventListener('abort',stop,{once:true});if(signal?.aborted)ctl.abort();
  const job={ctl,model:key,device:s.device,started:Date.now(),progress:{phase:'start',label:'Getting ready'},pid:null};this.job=job;this.emitStatus();
  const dir=path.join(this.dir,'jobs',crypto.randomBytes(8).toString('hex'));
  try{
   const where=await this.placement(s);this.roomFor(key,where,r);
   if(ctl.signal.aborted)throw err('Stopped.','cancelled','turn');
   fs.mkdirSync(dir,{recursive:true});
   const promptFile=path.join(dir,'prompt.txt'),negativeFile=path.join(dir,'negative.txt'),output=path.join(dir,'image.png');
   fs.writeFileSync(promptFile,r.prompt,'utf8');
   const neg=guard.negativeFor(m,r.negative);if(neg&&m.negative)fs.writeFileSync(negativeFile,neg,'utf8');
   const args=engine.buildArgs({model:m,files:this.installer.modelFiles(key,st),device:where.device,gpuId:where.gpuId,width:r.width,height:r.height,steps:r.steps,seed:r.seed,
    promptFile,negativeFile:neg&&m.negative?negativeFile:null,output,threads:threads()});
   const gpu=where.device==='gpu',started=Date.now();
   const res=await engine.run({exe:this.installer.exe(st),args,env:engine.env({device:where.device,gpuBackend:this.installer.gpuBackend(st)}),cwd:dir,signal:ctl.signal,
    timeoutMs:gpu?this.limits.gpuMs:this.limits.cpuMs,stallMs:gpu?this.limits.gpuStallMs:this.limits.cpuStallMs,log:this.log,
    onSpawn:p=>{job.pid=p.pid;this.writePid(p.pid);},onProgress:e=>{job.progress=e;this.emit('job',e);try{onProgress(e);}catch{}}});
   this.clearPid();
   if(res.cancelled)throw err('Stopped.','cancelled','turn');
   if(res.timedOut)throw err('The image took too long (over '+Math.round((gpu?this.limits.gpuMs:this.limits.cpuMs)/60000)+' minutes) and was stopped. A smaller size or fewer steps is faster'+(gpu?'':'; the processor is much slower than a graphics card')+'.'+NOT_ELSE,'timeout','turn');
   if(res.stalled)throw err('The image engine stopped making progress and was closed.'+NOT_ELSE,'stall','turn');
   if(res.error)throw err(res.error.code==='ENOENT'?'The image engine is missing. Install it again in '+WHERE+'.':'The image engine couldn’t start: '+res.error.message,res.error.code==='ENOENT'?'not_installed':'spawn');
   let png=null;try{png=fs.readFileSync(output);}catch{}
   const size=engine.pngSize(png);
   if(res.code!==0||!size){throw this.explain(engine.classify(res.tail,res.code),res,m,where,r);}
   if(size.width!==r.width||size.height!==r.height)throw err('The image engine made a '+size.width+' × '+size.height+' image instead of '+r.width+' × '+r.height+'.','bad_output','turn');
   if(gpu)this.installer.markGpuSeen();
   const t=res.timings,sps=t.sampleMs!=null?+(t.sampleMs/1000/r.steps).toFixed(2):res.lastStep?.secondsPerStep??null;
   const out={png,mime:'image/png',bytes:png.length,width:r.width,height:r.height,seed:res.seed??r.seed,steps:r.steps,cfg:m.cfg,model:key,label:m.label,uncensored:!!m.uncensored,
    device:where.device,gpu:where.gpu?{name:where.gpu.name,id:where.gpu.id}:null,negativeUsed:!!(neg&&m.negative),
    timings:{totalMs:Date.now()-started,loadMs:t.loadMs??null,encodeMs:t.encodeMs??null,sampleMs:t.sampleMs??null,decodeMs:t.decodeMs??null,secondsPerStep:sps},memory:res.memory};
   this.last={at:Date.now(),model:key,device:where.device,width:r.width,height:r.height,steps:r.steps,timings:out.timings};this.lastError=null;
   return out;
  }catch(e){
   if(ctl.signal.aborted&&e.code!=='refused')e=err('Stopped.','cancelled','turn');
   if(e.code!=='cancelled')this.lastError={message:e.message,code:e.code,at:Date.now()};
   throw e;
  }finally{
   signal?.removeEventListener('abort',stop);this.clearPid();
   await fs.promises.rm(dir,{recursive:true,force:true,maxRetries:5,retryDelay:200}).catch(()=>{});
   if(this.job===job)this.job=null;this.emitStatus();
  }
 }
 /** A failed run in words the owner can act on. */
 explain(kind,res,m,where,r){
  const gpu=where.device==='gpu',detail=res.tail.filter(Boolean).slice(-3).join(' / ').slice(0,220)||'no message',label=m.label;
  switch(kind){
   case 'runtime_missing':return err(VC_RUNTIME.replace(', then press Install again: what was downloaded is kept',', then try again'),'vc_runtime');
   case 'out_of_memory':return err(label+' didn’t fit in '+(gpu?'the graphics card’s free memory':'the free memory')+' at '+r.width+' × '+r.height+(gpu?' (a game may be using it)':'')+'. Close other programs, choose a smaller size'+(m.tier==='12gb'?', or the model for 6–8 GB cards':'')+(gpu?', or choose “Processor only” in '+WHERE:'')+'.'+NOT_ELSE+' (Engine: '+detail+')','out_of_memory','turn');
   case 'no_gpu':return err('The graphics card can’t be used right now (the engine says: '+detail+'). Update or reinstall the graphics driver, or choose “Processor only” in '+WHERE+'.'+NOT_ELSE,'no_gpu');
   case 'gpu_lost':return err('The graphics card stopped responding while drawing (its driver reset). Try again; if it keeps happening, update the graphics driver or choose a smaller size.'+NOT_ELSE,'gpu_lost','turn');
   case 'model_load':return err('The image engine couldn’t load '+label+'. Remove it and install it again in '+WHERE+'.'+NOT_ELSE+' (Engine: '+detail+')','model_load');
   case 'bad_args':return err('The image engine didn’t accept Tyler’s settings (this is a bug in Tyler): '+detail,'bad_args');
   default:return err((res.code===0?'The image engine finished without an image':'The image engine stopped unexpectedly'+(res.code!=null?' (exit '+res.code+')':res.signal?' ('+res.signal+')':''))+'.'+NOT_ELSE+' (Engine: '+detail+')','crashed','turn');
  }
 }
 /** Ends the running image (Stop, Pause, the Steam window closing, the emergency stop). Resolves once it has ended. */
 async cancelJob(reason='stopped'){
  const j=this.job;if(!j)return;this.log('Images on this PC','stopping the image ('+reason+')');j.ctl.abort();
  for(let i=0;i<100&&this.job===j;i++)await new Promise(r=>setTimeout(r,50));
 }
 release(reason='Tyler stopped'){return this.cancelJob(reason);}
 killNow(){const j=this.job;if(j){try{j.ctl.abort();}catch{}if(j.pid)try{process.kill(j.pid,process.platform==='win32'?undefined:'SIGKILL');}catch{}}this.clearPid();}
 // An engine left behind by a crash of the app: ended at the next start (and its job folders tidied).
 pidPath(){return path.join(this.dir,'running.json');}
 writePid(pid){try{fs.writeFileSync(this.pidPath(),JSON.stringify({pid,exe:path.basename(this.installer.exe()||'sd-cli'),at:Date.now()}));}catch{}}
 clearPid(){try{fs.rmSync(this.pidPath(),{force:true});}catch{}}
 cleanStale(){
  try{fs.rmSync(path.join(this.dir,'jobs'),{recursive:true,force:true});}catch{}
  let r;try{r=JSON.parse(fs.readFileSync(this.pidPath(),'utf8'));}catch{return;}
  this.clearPid();const pid=Number(r?.pid);if(!Number.isInteger(pid)||pid<=0||pid===process.pid)return;
  const same=name=>String(name||'').toLowerCase().includes(String(r.exe||'sd-cli').toLowerCase().replace(/\.exe$/,''));
  if(process.platform==='win32')execFile('tasklist',['/FI','PID eq '+pid,'/FO','CSV','/NH'],{windowsHide:true,timeout:5000},(e,out)=>{if(!e&&same(out))try{process.kill(pid);this.log('Images on this PC','ended an engine left from before');}catch{}});
  else{try{if(same(fs.readlinkSync('/proc/'+pid+'/exe'))){process.kill(pid,'SIGKILL');this.log('Images on this PC','ended an engine left from before');}}catch{}}
 }
 async shutdown(){await this.cancelJob('quit').catch(()=>{});}
}
module.exports={LocalImages,DEFAULTS,SIZES,threads};

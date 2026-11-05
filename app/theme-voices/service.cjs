'use strict';
// ROBOTIC TYLER theme voices: the service the desktop app uses (v2.35).
//
// One shared Qwen3-TTS model (Quality 1.7B or Lightweight 0.6B), one worker process, 25 voice profiles.
// Requests wait in a short queue, one voice is made at a time, and each can be stopped. Finished
// clips are cached, so Replay and repeated lines are instant. The model loads on first use and the
// worker closes after the idle time the owner picks, which gives back all of its memory.
// Nothing here changes the mode or the voice by itself: a request that can't run as asked fails
// with the reason (for example, not enough free graphics memory) instead of using something else.
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto'),{EventEmitter}=require('node:events');
const sapi=require('./sapi.cjs');
const {Installer,plan,LOCK}=require('./installer.cjs'),{WorkerHost}=require('./worker.cjs'),{Voices,THEMES,STATUS}=require('./voices.cjs'),hardware=require('./hardware.cjs');
const GB=1024**3;
const MODES={quality:{model:'quality',label:'Quality',about:'Qwen3-TTS 1.7B: the closest match to each voice.'},light:{model:'light',label:'Lightweight',about:'Qwen3-TTS 0.6B: less memory and faster, a little less like each voice.'}};
const DEFAULTS={mode:null,device:'auto',idleMinutes:5,followTheme:true,override:'',processed:true,nativeVoices:true,chat:false,chatAccess:'everyone',chatAllowed:'',chatCooldown:20,maxChars:400};
const MAX_QUEUE=4,CACHE_LIMIT=300*1024**2,CHECK_LINE='Voice check. Theme voices are ready.';

class ThemeVoices extends EventEmitter{
 /**
  * @param {object} o
  * @param {string} o.dataDir   …\RoboticTylerHydraCloudV12\ThemeVoices
  * @param {string} o.appDir    the app's theme-voices folder (worker/, voices/, engine-lock.json)
  * @param {Function} o.fetch   fetch for downloads
  * @param {Function} o.getSettings  async () => saved themeVoices settings object
  * @param {Function} o.setSettings  async (object) => void
  * @param {Function} [o.theme]  async () => the active theme id
  */
 constructor({dataDir,appDir,fetch,getSettings,setSettings,theme=async()=>'steam',log=()=>{},python=null,detect=hardware.detect,freemem=os.freemem}){
  super();Object.assign(this,{dir:dataDir,appDir,getSettingsRaw:getSettings,setSettingsRaw:setSettings,activeTheme:theme,log,devPython:python,detectFn:detect,freemem});
  fs.mkdirSync(dataDir,{recursive:true});
  this.installer=new Installer({dir:dataDir,fetch,workerDir:path.join(appDir,'worker'),log});
  this.voices=new Voices({builtinDir:path.join(appDir,'voices'),dataDir});
  this.queue=[];this.active=null;this.worker=null;this.loaded=null;this.idleTimer=null;this.hw=null;this.installJob=null;this.lastClip=null;this.lastError=null;this.seq=0;
  this.cacheDir=path.join(dataDir,'cache','clips');this.promptDir=path.join(dataDir,'cache','voices');
 }
 async settings(){const s=await this.getSettingsRaw().catch(()=>null);return {...DEFAULTS,...(s&&typeof s==='object'?s:{})};}
 async saveSettings(changes){
  const s=await this.settings(),next={...s};
  if(changes.mode!==undefined)next.mode=MODES[changes.mode]?changes.mode:null;
  if(changes.device!==undefined)next.device=['auto','cuda','cpu'].includes(changes.device)?changes.device:'auto';
  if(changes.idleMinutes!==undefined){const n=Number(changes.idleMinutes);next.idleMinutes=[0,1,2,5,10,20,30,60].includes(n)?n:5;}
  for(const k of ['followTheme','processed','chat','nativeVoices'])if(changes[k]!==undefined)next[k]=changes[k]===true;
  if(changes.override!==undefined)next.override=THEMES.includes(changes.override)?changes.override:'';
  if(changes.chatAccess!==undefined)next.chatAccess=changes.chatAccess==='selected'?'selected':'everyone';
  if(changes.chatAllowed!==undefined)next.chatAllowed=String(changes.chatAllowed||'').split(/[\s,]+/).filter(id=>/^7656119\d{10}$/.test(id)).slice(0,100).join('\n');
  if(changes.chatCooldown!==undefined){const n=Number(changes.chatCooldown);next.chatCooldown=[0,10,20,30,60,120,300].includes(n)?n:20;}
  await this.setSettingsRaw(next);this.scheduleIdle(next);this.emitStatus();return next;
 }
 async hardware(refresh=false){if(!this.hw||refresh||Date.now()-this.hw.at>60000)this.hw=await this.detectFn(this.dir);return this.hw;}
 runtimeFor(hw,device){
  if(process.platform!=='win32')return 'linux-cpu';
  if(device==='cpu')return 'windows-cpu';
  return hardware.usableGpu(hw).gpu?'windows-cuda':'windows-cpu';
 }
 /** What installing would download for a mode (and optionally the other model too). */
 async planFor({mode,both=false,device}={}){
  const hw=await this.hardware(),rec=hardware.recommend(hw),s=await this.settings();
  const m=MODES[mode]?mode:s.mode||rec.mode,models=both?['quality','light']:[MODES[m].model];
  const p=plan({runtime:this.runtimeFor(hw,device||s.device),models}),need=this.installer.needs(p);
  // What this PC still needs: an engine or model already here (or packages an older engine has) isn't downloaded again.
  return {...p,mode:m,recommendation:rec,hardware:hw,files:undefined,fileCount:need.get.length,download:need.download,reused:need.reused,engineReady:need.engineReady,
   disk:need.engineReady?need.download:p.disk,fullDownload:p.download};
 }
 async status(){
  const s=await this.settings(),inst=this.installer.status(),hw=this.hw,rec=hw?hardware.recommend(hw):null;
  const mode=s.mode||rec?.mode||'quality',modelOk=!!inst.models?.[MODES[mode].model];
  return {installed:!!inst.installed,current:!!inst.current,updateAvailable:!!inst.updateAvailable,runtime:inst.runtime||null,models:inst.models||{},check:inst.check||null,
   mode,modeChosen:!!s.mode,modeLabel:MODES[mode].label,recommendation:rec,hardware:hw?{cpu:hw.cpu,ram:hw.ram,gpus:hw.gpus,disk:hw.disk}:null,
   ready:!!inst.installed&&!!inst.current&&modelOk,needs:!inst.installed?'install':!inst.current?'update':!modelOk?'model':null,
   loaded:this.loaded?{mode:this.loaded.mode,device:this.loaded.device,since:this.loaded.at}:null,
   busy:!!this.active,queued:this.queue.length,installing:this.installJob?this.installJob.progress:null,lastError:this.lastError,settings:s,
   lastClip:this.lastClip?{id:this.lastClip.id,seconds:this.lastClip.seconds,voice:this.lastClip.voiceName,text:this.lastClip.text.slice(0,80)}:null};
 }
 emitStatus(){this.status().then(s=>this.emit('status',s)).catch(()=>{});}
 voiceList(){return this.voices.list();}
 // ── install, repair, remove ──────────────────────────────────────────────
 async install({mode,both=false,offline=[],device}={}){
  if(this.installJob)throw Error('Theme voices are already being installed.');
  const p=await this.planFor({mode,both,device}),full=plan({runtime:p.runtime,models:p.models});
  const ctl=new AbortController();this.installJob={ctl,progress:{phase:'start',label:'Starting',bytes:0,totalBytes:p.download}};this.emitStatus();
  try{
   await this.closeWorker();
   await this.installer.install(full,{offline,signal:ctl.signal,python:this.devPython,onProgress:e=>{this.installJob.progress=e;this.emit('install',e);}});
   if(!(await this.settings()).mode)await this.saveSettings({mode:p.mode});
   this.installJob.progress={phase:'check',label:'Making a test voice'};this.emit('install',this.installJob.progress);
   const check=await this.check();
   this.emit('install',{phase:'done',label:'Theme voices are ready',check});return {ok:true,check};
  }catch(e){const out=e.name==='AbortError'?'Installation stopped. What was downloaded is kept, so it carries on from there next time.':e.message;this.emit('install',{phase:'failed',label:out});throw Error(out);}
  finally{this.installJob=null;this.emitStatus();}
 }
 cancelInstall(){this.installJob?.ctl.abort();}
 /** A real voice from the installed engine: the installer's last step, and Settings → Test. */
 async check(){
  const s=await this.settings(),mode=s.mode||Object.keys(this.installer.status().models||{}).find(k=>this.installer.status().models[k])||'quality';
  const theme=this.voices.get('cs16')?.refPath?'cs16':THEMES.find(t=>this.voices.get(t)?.refPath);
  const started=Date.now();let result;
  try{result=await this.generate({text:CHECK_LINE,theme,mode,noCache:true,purpose:'check'});}
  catch(e){const c={ok:false,error:e.message,code:e.code||null,at:Date.now()};this.saveCheck(c);throw e;}
  const c={ok:true,at:Date.now(),mode,device:this.loaded?.device,seconds:result.seconds,ms:result.ms,totalMs:Date.now()-started,rtf:+(result.ms/1000/Math.max(.1,result.seconds)).toFixed(2),voice:theme};
  this.saveCheck(c);return c;
 }
 saveCheck(c){const st=this.installer.state();if(!st)return;st.check=c;fs.writeFileSync(this.installer.statePath(),JSON.stringify(st,null,1));}
 async verify(onProgress){return this.installer.verify({onProgress});}
 async repair(){const v=await this.installer.verify();if(v.ok)return {ok:true,repaired:false,check:await this.check()};const st=this.installer.state();
  const mode=(await this.settings()).mode||'quality';const models=Object.keys(st?.models||{}).length?Object.keys(st.models):[MODES[mode].model];
  await this.closeWorker();await fs.promises.rm(path.join(this.dir,st?.engine||'none','ok'),{force:true});
  const p=plan({runtime:st?.runtime||this.runtimeFor(await this.hardware(),'auto'),models});
  for(const key of models)for(const f of LOCK.models[key].files){const t=path.join(this.dir,'models',st?.models?.[key]?.dir||'x',f.path);if(fs.existsSync(t)&&v.problems.some(x=>x.includes(f.path)))fs.rmSync(t,{force:true});}
  await this.installer.install(p,{python:this.devPython});return {ok:true,repaired:true,problems:v.count,check:await this.check()};}
 async remove({everything=false}={}){await this.stop();await this.closeWorker();await this.installer.remove({everything});this.lastClip=null;this.emitStatus();}
 async removeModel(key){await this.closeWorker();await this.installer.removeModel(key);this.emitStatus();}

 // ── the worker ───────────────────────────────────────────────────────────
 async workerFor(){
  const st=this.installer.state();if(!st)throw Object.assign(Error('Theme voices aren’t installed yet. Open Settings → Theme voices to install them.'),{code:'not_installed'});
  if(!this.installer.status().current)throw Object.assign(Error('Theme voices need an update for this version of Tyler. Open Settings → Theme voices and press Update.'),{code:'needs_update'});
  if(this.worker?.alive)return this.worker;
  const engine=this.installer.engineDir(st);
  const script=await this.installer.copyWorker(engine);
  this.worker=new WorkerHost({python:this.installer.python(st),script,site:path.join(engine,'site'),cwd:engine,log:this.log});
  this.worker.on('exit',()=>{this.loaded=null;this.emitStatus();});
  await this.worker.start();return this.worker;
 }
 async closeWorker(){clearTimeout(this.idleTimer);const w=this.worker;this.worker=null;this.loaded=null;if(w)await w.quit();this.emitStatus();}
 async device(mode,s){
  const st=this.installer.state(),hw=await this.hardware(true);
  if(s.device==='cpu'||!String(st?.runtime).endsWith('cuda'))return 'cpu';
  const {gpu,why}=hardware.usableGpu(hw);
  if(!gpu){if(s.device==='cuda')throw Object.assign(Error('The graphics card can’t be used right now: '+why),{code:'no_gpu'});return 'cpu';}
  return 'cuda';
 }
 /** Room for the model? Says so plainly instead of quietly using a smaller one. */
 async roomFor(mode,device){
  const hw=await this.hardware(true),need=hardware.NEEDS[mode];
  if(device==='cuda'){const g=hardware.usableGpu(hw).gpu;if(g&&g.vramFree&&g.vramFree<need.vram*0.85)throw Object.assign(Error(MODES[mode].label+' mode needs about '+(need.vram/GB).toFixed(1)+' GB of free graphics memory and '+(g.vramFree/GB).toFixed(1)+' GB is free right now (a game may be using it). Close it, or switch to '+(mode==='quality'?'Lightweight mode':'the processor')+' in Settings → Theme voices.'),{code:'low_vram'});}
  else{const needRam=(mode==='quality'?7.5:3.6)*GB,free=this.freemem();if(free<needRam*0.8)throw Object.assign(Error(MODES[mode].label+' mode on the processor needs about '+(needRam/GB).toFixed(1)+' GB of free memory and '+(free/GB).toFixed(1)+' GB is free. Close some programs'+(mode==='quality'?', or switch to Lightweight mode':'')+'.'),{code:'low_memory'});}
 }
 async ensureLoaded(mode){
  const s=await this.settings(),device=await this.device(mode,s),st=this.installer.state();
  const dir=this.installer.modelDir(MODES[mode].model,st);
  if(!dir||!fs.existsSync(dir))throw Object.assign(Error(MODES[mode].label+' mode’s model isn’t installed. Install it in Settings → Theme voices.'),{code:'model_missing'});
  if(this.loaded&&this.loaded.mode===mode&&this.loaded.device===device&&this.worker?.alive)return this.loaded;
  if(!this.loaded||this.loaded.device!==device||this.loaded.mode!==mode)await this.roomFor(mode,device);
  const w=await this.workerFor();
  const dtype=device==='cuda'?'auto':os.totalmem()>=(mode==='quality'?14:7)*GB?'fp32':'bf16';
  const r=await w.request('load',{model_dir:dir,device,dtype,threads:Math.max(1,os.cpus().length-1)},{timeout:300000});
  this.loaded={mode,device,dtype:r.dtype_used,at:Date.now(),loadMs:r.load_ms};this.emitStatus();return this.loaded;
 }
 scheduleIdle(s){clearTimeout(this.idleTimer);const mins=s?.idleMinutes??5;if(!mins||!this.worker)return;this.idleTimer=setTimeout(()=>{if(!this.active&&!this.queue.length){this.log('Theme voices','idle: closing the voice engine');void this.closeWorker();}},mins*60000);this.idleTimer.unref?.();}

 // ── speaking ─────────────────────────────────────────────────────────────
 /** The theme voice a request should use, decided when the request starts. */
 async resolveTheme(explicit){
  if(explicit){if(!THEMES.includes(explicit))throw Error('Unknown voice “'+explicit+'”.');return explicit;}
  const s=await this.settings();if(!s.followTheme&&s.override)return s.override;
  const t=await this.activeTheme();return THEMES.includes(t)?t:'steam';
 }
 /** Queue a voice message. Resolves with the finished clip ({id,file,seconds,…}). */
 async speak({text,theme,mode,purpose='call',fresh=false}={}){
  const s=await this.settings(),clean=String(text||'').replace(/\s+/g,' ').trim();
  if(!clean)throw Error('Type something for Tyler to say.');if(clean.length>s.maxChars)throw Error('That’s too long for one voice message ('+clean.length+' characters; '+s.maxChars+' at most).');
  const voice=await this.resolveTheme(theme);
  return this.generate({text:clean,theme:voice,mode:mode||s.mode||(await this.status()).mode,purpose,noCache:fresh,seed:fresh?1+Math.floor(Math.random()*1e6):1});
 }
 generate(job){
  if(this.queue.length>=MAX_QUEUE)return Promise.reject(Object.assign(Error('Four voice messages are already waiting. Try again in a moment.'),{code:'busy'}));
  return new Promise((resolve,reject)=>{this.queue.push({...job,id:'v'+(++this.seq),resolve,reject,queuedAt:Date.now()});this.emitStatus();void this.pump();});
 }
 async pump(){
  if(this.active||!this.queue.length)return;
  const job=this.queue.shift();this.active=job;this.emitStatus();clearTimeout(this.idleTimer);
  try{job.resolve(await this.run(job));this.lastError=null;}
  catch(e){this.lastError={message:e.message,code:e.code||null,at:Date.now()};job.reject(e);}
  finally{this.active=null;this.emitStatus();this.scheduleIdle(await this.settings());if(this.queue.length)setImmediate(()=>void this.pump());}
 }
 async run(job){
  const v=this.voices.get(job.theme);if(!v)throw Error('Unknown voice.');
  if(!v.refPath)throw Object.assign(Error((v.name||job.theme)+': '+(v.statusNote||STATUS[v.status]||'no reference recording.')),{code:'no_reference'});
  const s=await this.settings(),mode=MODES[job.mode]?job.mode:'quality';
  const vkey=this.voices.key(v),fx=s.processed&&v.effects?v.effects:null;
  const key=crypto.createHash('sha256').update(JSON.stringify([job.text,vkey,mode,LOCK.models[MODES[mode].model].revision,job.seed||1,fx])).digest('hex').slice(0,24);
  const out=path.join(this.cacheDir,key+'.wav');
  if(!job.noCache&&fs.existsSync(out)){const now=new Date();fs.utimesSync(out,now,now);return this.finish(job,v,{file:out,cached:true,ms:0,seconds:wavSeconds(out),mode,processed:!!fx});}
  if(job.cancelled)throw Object.assign(Error('Stopped.'),{code:'cancelled'});
  // Microsoft Sam and Mary: the real Windows voice when this PC has it (closer than a clone, and instant).
  if(v.native?.sapi&&s.nativeVoices!==false&&!v.custom){
   const n=await sapi.find(v.native.sapi).catch(()=>null);
   if(n){const t0=Date.now(),file=path.join(this.cacheDir,key+'-sapi.wav');if(!job.noCache&&fs.existsSync(file))return this.finish(job,v,{file,cached:true,ms:0,seconds:wavSeconds(file),mode:'native',device:'windows',native:n.name});
    await sapi.speak(n.name,job.text,file);return this.finish(job,v,{file,cached:false,ms:Date.now()-t0,seconds:wavSeconds(file),mode:'native',device:'windows',native:n.name});}
  }
  const loaded=await this.ensureLoaded(mode);
  if(job.cancelled)throw Object.assign(Error('Stopped.'),{code:'cancelled'});
  const w=this.worker;job.workerId=w.nextId();
  const expected=Math.max(1,job.text.length/14.5),rtf=loaded.device==='cuda'?1.5:mode==='quality'?30:15;
  const dry=out.replace(/\.wav$/,fx?'-dry.wav':'.wav');
  this.emit('progress',{id:job.id,phase:'speaking',text:job.text.slice(0,60),voice:v.name});
  const r=await w.request('speak',{text:job.text,ref_audio:v.refPath,ref_text:v.xvectorOnly?'':(v.transcript||''),xvector_only:!!v.xvectorOnly||!v.transcript,cache:path.join(this.promptDir,vkey+'-'+mode+'.safetensors'),
   out:dry,out_fx:fx?out:null,effects:fx,seed:job.seed||1,language:v.language||'English'},
   {timeout:Math.min(20*60000,60000+expected*rtf*3000),onProgress:p=>this.emit('progress',{id:job.id,phase:'speaking',chunk:p.chunk,chunks:p.chunks,step:p.step,steps:p.steps,voice:v.name})});
  this.pruneCache();
  return this.finish(job,v,{file:fx?r.out_fx:r.out,dry:fx?r.out:null,cached:false,ms:r.ms,seconds:r.seconds,mode,device:loaded.device,retries:r.retries,processed:!!fx});
 }
 finish(job,v,r){
  const clip={id:job.id,text:job.text,theme:job.theme,voiceName:v.name,status:v.status,custom:!!v.custom,...r};
  if(job.purpose!=='check')this.lastClip=clip;return clip;
 }
 /** Stops the voice being made and empties the queue. */
 async stop(){
  const waiting=this.queue.splice(0);for(const j of waiting)j.reject(Object.assign(Error('Stopped.'),{code:'cancelled'}));
  const a=this.active;if(a){a.cancelled=true;if(a.workerId&&this.worker)this.worker.cancel(a.workerId);
   // If the engine doesn't stop within 4 seconds (a long step on the processor), close it.
   setTimeout(()=>{if(this.active===a&&this.worker){this.log('Theme voices','stop: closing the engine');void this.closeWorker();}},4000).unref?.();}
  this.emitStatus();return {stopped:!!a,dropped:waiting.length};
 }
 /** Are the original Windows voices (Microsoft Sam, Mary) on this PC? */
 async nativeStatus(){const all=await sapi.voices().catch(()=>({}));const has=n=>Object.keys(all).some(k=>k.toLowerCase().startsWith(n));return {windows:process.platform==='win32',sam:has('microsoft sam'),mary:has('microsoft mary'),voices:Object.keys(all).slice(0,20)};}
 /** Downloads Microsoft's Speech SDK 5.1 (checked against its SHA-256) and returns its path; the owner runs it. */
 async nativeInstaller(){if(process.platform!=='win32')throw Error('Microsoft Sam and Mary are Windows voices.');return this.installer.obtain(LOCK.extras.speechSdk51,{});}
 audio(clip){return fs.readFileSync(clip.file).toString('base64');}
 /** Copies a clip to the Saved folder under a readable name. */
 save(clip){
  const dir=path.join(this.dir,'saved');fs.mkdirSync(dir,{recursive:true});
  const name=(clip.voiceName+' - '+clip.text).replace(/[^\w .,'!?-]+/g,' ').replace(/[.!?]+$/,'').slice(0,70).trim()||'Tyler';
  let file=path.join(dir,name+'.wav'),n=2;while(fs.existsSync(file))file=path.join(dir,name+' ('+(n++)+').wav');
  fs.copyFileSync(clip.file,file);return file;
 }
 pruneCache(){
  try{const files=fs.readdirSync(this.cacheDir).filter(f=>f.endsWith('.wav')).map(f=>{const p=path.join(this.cacheDir,f),st=fs.statSync(p);return {p,size:st.size,t:st.mtimeMs};}).sort((a,b)=>b.t-a.t);
   let total=0;for(const f of files){total+=f.size;if(total>CACHE_LIMIT)fs.rmSync(f.p,{force:true});}}catch{}
 }
 clearCache(){fs.rmSync(path.join(this.dir,'cache'),{recursive:true,force:true});}
 async shutdown(){await this.stop().catch(()=>{});await this.closeWorker();}
}
function wavSeconds(file){try{const b=fs.readFileSync(file);let rate=0;for(let p=12;p+8<=b.length;){const id=b.toString('latin1',p,p+4),n=b.readUInt32LE(p+4);if(id==='fmt ')rate=b.readUInt32LE(p+16);if(id==='data')return +(Math.min(n,b.length-p-8)/rate).toFixed(2);p+=8+n+(n&1);}return 0;}catch{return 0;}}
module.exports={ThemeVoices,MODES,DEFAULTS};

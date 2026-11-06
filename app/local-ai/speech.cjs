'use strict';
// ROBOTIC TYLER local AI, stage 2: hearing and voice on this PC, the service (v2.39).
//
// Two engines, each in its own process (speech-worker.cjs), both on the processor so the graphics
// card stays free for games and the text AI:
//   hearing: NVIDIA Parakeet TDT 0.6B v3 (speech to text for Standard voice calls);
//   voice:   Kokoro-82M (Tyler's spoken replies, with a few of its stock voices).
// Each starts only when a turn (or the quick check) needs it and closes after the idle time the
// owner picks, when Tyler is paused or stopped, on the emergency stop and when the app quits.
// Nothing here switches to a cloud service: a turn that can't be heard or spoken as chosen fails
// with the reason, and the caller (background.js) never asks a cloud service instead.
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),{fork,execFile}=require('node:child_process'),{EventEmitter}=require('node:events');
const {SpeechInstaller,SPEECH_LOCK,PARTS,GB}=require('./speech-installer.cjs');
const DEFAULTS={idleMinutes:10};
const IDLE=[0,1,2,5,10,20,30,60];
const WHERE='Settings → On this PC';
const NO_CLOUD=' Tyler didn’t use a cloud service instead.';
const NAMES={hearing:'Hearing on this PC',voice:'The voice on this PC'};
// Approximate memory while running (measured: Parakeet int8 about 0.9 GB, Kokoro about 0.5 GB).
const NEEDS={hearing:1.0*GB,voice:0.6*GB};
const CHECK_TEXT='Hey Tyler, who wins in a fight, a tank or a sniper?';
const CHECK_LINE='Hey squad, Tyler here. Ready when you are.';
const err=(message,code,kind='turn',extra={})=>Object.assign(Error(message),{code,kind,...extra});
/** Processor threads for one engine: up to 4 (the physical cores, about half the logical ones). */
function speechThreads(cpus=os.cpus().length){return Math.max(1,Math.min(4,cpus>=4?Math.floor(cpus/2):cpus));}
const words=t=>String(t||'').toLowerCase().replace(/[^a-z0-9' ]+/g,' ').split(/\s+/).filter(Boolean);

/** One engine process and its requests (Node's IPC channel; no port, no input). */
class SpeechWorker extends EventEmitter{
 constructor({kind,script,execPath=process.execPath,runtimeDir,log=()=>{},startTimeout=120000}){
  super();Object.assign(this,{kind,script,execPath,runtimeDir,log,startTimeout});
  this.proc=null;this.pending=new Map();this.seq=0;this.tail=[];this.stopping=false;this.ready=null;
 }
 get alive(){return !!this.proc&&this.proc.exitCode===null&&this.proc.signalCode===null;}
 get pid(){return this.proc?.pid||null;}
 env(){
  const keep=['SystemRoot','SYSTEMROOT','WINDIR','TEMP','TMP','LOCALAPPDATA','APPDATA','USERPROFILE','HOME','NUMBER_OF_PROCESSORS','PROCESSOR_ARCHITECTURE'],env={};
  for(const k of keep)if(process.env[k]!==undefined)env[k]=process.env[k];
  // The engine's libraries sit next to the addon; the system folders stay on the path after them.
  const sys=process.platform==='win32'?[path.join(process.env.SystemRoot||'C:\\Windows','System32'),process.env.SystemRoot||'C:\\Windows']:['/usr/bin','/bin'];
  env.PATH=[this.runtimeDir,...sys].join(path.delimiter);
  if(process.platform==='linux')env.LD_LIBRARY_PATH=this.runtimeDir;
  // In the desktop app process.execPath is Tyler's own executable: run it as plain Node.js.
  if(process.versions.electron)env.ELECTRON_RUN_AS_NODE='1';
  return env;
 }
 /** Starts the process and loads the engine. Resolves {loadMs}. */
 start(load){
  if(this.ready)return this.ready;
  this.ready=new Promise((resolve,reject)=>{
   const t0=Date.now();let settled=false;
   const done=(e,v)=>{if(settled)return;settled=true;clearTimeout(timer);e?reject(e):resolve(v);};
   let proc;
   try{proc=fork(this.script,[],{execPath:this.execPath,execArgv:[],cwd:this.runtimeDir,env:this.env(),stdio:['ignore','pipe','pipe','ipc'],windowsHide:true,serialization:'json'});}
   catch(e){this.ready=null;return done(err('The speech engine couldn’t start: '+e.message,'spawn','fatal'));}
   this.proc=proc;this.stopping=false;this.tail=[];
   const keep=d=>{for(const l of String(d).split(/\r?\n/))if(l.trim()){this.tail.push(l.slice(0,300));if(this.tail.length>40)this.tail.shift();}};
   proc.stdout.on('data',keep);proc.stderr.on('data',keep);
   const timer=setTimeout(()=>{done(err(NAMES[this.kind]+' didn’t finish loading within '+Math.round(this.startTimeout/1000)+' seconds.','start_timeout','fatal'));this.kill();},this.startTimeout);
   proc.on('message',m=>{
    if(m?.event==='ready'){this.request('load',load,{timeout:this.startTimeout}).then(r=>done(null,{loadMs:Date.now()-t0,...r}),e=>{done(e);this.kill();});return;}
    if(m?.event==='error'){keep(m.error);return;}
    const job=this.pending.get(m?.id);if(!job)return;
    this.pending.delete(m.id);clearTimeout(job.timer);job.cleanup?.();
    // The engine's own error (no kind yet): the service puts it in words (run()).
    m.ok?job.resolve(m):job.reject(Object.assign(Error(m.error||'the engine failed'),{code:m.code||'engine'}));
   });
   proc.on('error',e=>{this.tail.push(String(e.message));done(err('The speech engine couldn’t start: '+e.message,'spawn','fatal'));});
   proc.on('exit',(code,signal)=>{
    const why=this.stopping?err('Stopped.','cancelled'):err(NAMES[this.kind]+' closed unexpectedly'+(code!=null?' (exit '+code+')':signal?' ('+signal+')':'')+'.'+(this.lastLines()?' Engine: '+this.lastLines():''),'crashed');
    for(const [,job] of this.pending){clearTimeout(job.timer);job.cleanup?.();job.reject(why);}this.pending.clear();
    if(this.proc===proc){this.proc=null;this.ready=null;}
    done(why);this.emit('exit',{code,signal,stopped:this.stopping});
   });
  });
  return this.ready;
 }
 lastLines(){return this.tail.filter(l=>!/^\s*$/.test(l)).slice(-2).join(' / ').slice(0,300);}
 /** One request. A signal or the timeout ends it (the engine is told to stop what it's doing). */
 request(op,payload={},{timeout=60000,signal}={}){
  return new Promise((resolve,reject)=>{
   if(!this.alive)return reject(err(NAMES[this.kind]+' isn’t running.','not_running'));
   const id=++this.seq;
   const abort=()=>{const j=this.pending.get(id);if(!j)return;this.pending.delete(id);clearTimeout(j.timer);j.cleanup();this.cancel(id);reject(err('Stopped.','cancelled'));};
   const timer=setTimeout(()=>{if(!this.pending.has(id))return;this.pending.delete(id);signal?.removeEventListener('abort',abort);this.cancel(id);reject(err(NAMES[this.kind]+' took too long (over '+Math.round(timeout/1000)+' s).'+NO_CLOUD,'timeout'));},timeout);
   this.pending.set(id,{resolve,reject,timer,cleanup:()=>signal?.removeEventListener('abort',abort)});
   if(signal){if(signal.aborted)return abort();signal.addEventListener('abort',abort,{once:true});}
   try{this.proc.send({id,op,...payload});}catch(e){this.pending.delete(id);clearTimeout(timer);reject(err('Couldn’t reach the speech engine: '+e.message,'crashed'));}
  });
 }
 cancel(id){try{if(this.alive)this.proc.send({op:'cancel',target:id});}catch{}}
 /** Asks it to end, waits until it has (its memory is free), then makes sure. */
 async stop(){
  const p=this.proc;if(!p||p.exitCode!==null||p.signalCode!==null)return;
  this.stopping=true;const ended=new Promise(r=>p.once('exit',r));
  try{p.send({op:'quit'});}catch{}
  if(await Promise.race([ended.then(()=>true),new Promise(r=>setTimeout(()=>r(false),3000))]))return;
  try{p.kill();}catch{}
  if(await Promise.race([ended.then(()=>true),new Promise(r=>setTimeout(()=>r(false),3000))]))return;
  try{p.kill('SIGKILL');}catch{}await Promise.race([ended,new Promise(r=>setTimeout(r,2000))]);
 }
 kill(){const p=this.proc;if(!p)return;this.stopping=true;try{p.kill(process.platform==='win32'?undefined:'SIGKILL');}catch{}}
}

class LocalSpeech extends EventEmitter{
 /**
  * @param {object} o
  * @param {string} o.dataDir        …\RoboticTylerHydraCloudV12\LocalAI (this service uses its speech\ folder)
  * @param {Function} o.fetch        fetch for downloads
  * @param {Function} o.getSettings  async () => saved localSpeech settings
  * @param {Function} o.setSettings  async (object) => void
  */
 constructor({dataDir,fetch,getSettings,setSettings,log=()=>{},lock,platform=process.platform,script=path.join(__dirname,'speech-worker.cjs'),execPath=process.execPath,
  minuteMs=60000,startTimeout=120000,threads=speechThreads(),freemem=os.freemem,checkClip=path.join(__dirname,'check-clip.wav'),retryDelay}){
  super();
  Object.assign(this,{getSettingsRaw:getSettings,setSettingsRaw:setSettings,log,script,execPath,minuteMs,startTimeout,threads,freemem,checkClip});
  this.dir=path.join(dataDir,'speech');fs.mkdirSync(this.dir,{recursive:true});
  this.installer=new SpeechInstaller({dir:this.dir,fetch,log,lock,platform,retryDelay});this.lock=this.installer.lock;
  this.workers={hearing:null,voice:null};this.starting={hearing:null,voice:null};this.loaded={hearing:null,voice:null};
  this.idleTimers={};this.active={hearing:new Set(),voice:new Set()};this.lastError={hearing:null,voice:null};
  this.installJob=null;this.lastInstallError=null;
  this.cleanStale();
 }
 // ── settings ────────────────────────────────────────────────────────────
 async settings(){const s=await this.getSettingsRaw().catch(()=>null);return {...DEFAULTS,...(s&&typeof s==='object'?s:{})};}
 async saveSettings(changes={}){
  const next={...await this.settings()};
  if(changes.idleMinutes!==undefined){const n=Number(changes.idleMinutes);next.idleMinutes=IDLE.includes(n)?n:DEFAULTS.idleMinutes;}
  await this.setSettingsRaw({idleMinutes:next.idleMinutes});
  for(const k of PARTS)this.scheduleIdle(k,next);this.emitStatus();return next;
 }
 supported(){try{this.installer.runtimeId();return true;}catch{return false;}}
 voices(){return this.lock.voice.voices;}
 voice(id){return this.voices().find(v=>v.id===id)||this.voices()[0];}
 // ── plan, install, remove ───────────────────────────────────────────────
 async planFor({parts}={}){const p=this.installer.plan({parts});return {...p,files:undefined,free:await this.installer.freeSpace()};}
 async install({parts=PARTS,offline=[]}={}){
  if(this.installJob)throw err('Hearing and voice on this PC are already being installed.','busy');
  const ctl=new AbortController();this.installJob={ctl,parts,progress:{phase:'start',label:'Checking this PC'}};this.lastInstallError=null;this.emitStatus();
  try{
   if(!this.supported())throw err('Hearing and voice on this PC need Windows.','unsupported','fatal');
   const folders=(offline||[]).map(x=>String(x||'').trim().replace(/^["']+|["']+$/g,'')).filter(Boolean);
   for(const f of folders)if(!fs.existsSync(f)||!fs.statSync(f).isDirectory())throw err('The folder “'+f+'” wasn’t found. Check the path (without quotes) and try again.','OFFLINE');
   // Nothing may run from the engine while its files are replaced.
   await this.close('all','installing');
   await this.installer.install({parts},{offline:folders,signal:ctl.signal,onProgress:e=>{this.installJob.progress=e;this.emit('install',e);}});
   this.emit('install',{phase:'done',label:'Hearing and voice on this PC are ready',parts});return {ok:true};
  }catch(e){
   const out=e.name==='AbortError'?'Installation stopped. What was downloaded is kept, so it carries on from there next time.':e.message;
   this.lastInstallError={message:out,at:Date.now()};this.emit('install',{phase:'failed',label:out});throw Object.assign(Error(out),{code:e.code});
  }finally{this.installJob=null;this.emitStatus();}
 }
 cancelInstall(){this.installJob?.ctl.abort();}
 async remove(part){
  if(this.installJob)throw err('Stop the installation first.','busy');
  if(part==='all'){await this.close('all','removed');await this.installer.removeAll();}
  else{if(!PARTS.includes(part))throw Error('Unknown part.');await this.close('all','removed');await this.installer.remove(part);}
  this.emitStatus();
 }
 // ── status ──────────────────────────────────────────────────────────────
 async status(){
  const s=await this.settings(),inst=this.installer.status(),size=f=>f.reduce((n,x)=>n+x.size,0);
  let rt=null;try{rt=this.installer.runtime();}catch{}
  const run=k=>this.workers[k]?.alive&&this.loaded[k]?{since:this.loaded[k].at,loadMs:this.loaded[k].loadMs,voice:this.loaded[k].voice||null}:null;
  return {supported:this.supported(),engine:{name:'sherpa-onnx',version:this.lock.engine.version},
   installed:{runtime:inst.runtime,hearing:inst.hearing,voice:inst.voice},ready:{hearing:inst.hearing,voice:inst.voice},
   running:{hearing:run('hearing'),voice:run('voice')},starting:{hearing:!!this.starting.hearing,voice:!!this.starting.voice},
   sizes:{runtime:rt?.size||0,runtimeUnpacked:rt?.unpacked||0,hearing:size(this.lock.hearing.files),voice:size(this.lock.voice.files)},
   models:{hearing:{label:this.lock.hearing.label,by:this.lock.hearing.by,license:this.lock.hearing.license,credit:this.lock.hearing.credit,languages:this.lock.hearing.languages},
    voice:{label:this.lock.voice.label,by:this.lock.voice.by,license:this.lock.voice.license,credit:this.lock.voice.credit}},
   voices:this.voices().map(v=>({id:v.id,label:v.label,about:v.about,accent:v.accent})),
   checks:inst.checks,installing:this.installJob?{parts:this.installJob.parts,...this.installJob.progress}:null,installError:this.lastInstallError,
   lastError:this.lastError,settings:s};
 }
 emitStatus(){this.status().then(s=>this.emit('status',s)).catch(()=>{});}
 // ── the engine processes ────────────────────────────────────────────────
 config(kind,voice){
  const st=this.installer.state(),f=rel=>this.installer.file(kind,rel,st);
  if(kind==='hearing')return {encoder:f('encoder.int8.onnx'),decoder:f('decoder.int8.onnx'),joiner:f('joiner.int8.onnx'),tokens:f('tokens.txt'),threads:this.threads};
  return {model:f('model.onnx'),voices:f('voices.bin'),tokens:f('tokens.txt'),dataDir:f('espeak-ng-data'),lexicon:f(voice.accent==='gb'?'lexicon-gb-en.txt':'lexicon-us-en.txt'),threads:this.threads};
 }
 /** The running engine for `kind`, started if needed (one start at a time). Voice: for this voice's accent. */
 async ensure(kind,{voice=null,onStage}={}){
  if(!this.supported())throw err('Hearing and voice on this PC need Windows.','unsupported','fatal');
  const st=this.installer.state();
  if(!this.installer.runtimeReady(st)||!this.installer.partReady(kind,st))
   throw err((kind==='hearing'?'Hearing on this PC isn’t installed yet. Install it in '+WHERE+', or choose Hearing → Cloud in Settings → Voice → Standard voice.':'The voice on this PC (Kokoro) isn’t installed yet. Install it in '+WHERE+', or choose another speaking voice in Settings → Voice → Standard voice.')+NO_CLOUD,'not_installed','fatal');
  if(this.installJob)throw err('Hearing and voice on this PC are being installed. Try again when it’s done.','installing');
  const accent=kind==='voice'?(voice?.accent||'us'):null;
  const w=this.workers[kind];
  if(w?.alive&&this.loaded[kind]&&(kind!=='voice'||this.loaded[kind].accent===accent))return w;
  if(this.starting[kind])return this.starting[kind].then(()=>this.ensure(kind,{voice,onStage}));
  this.starting[kind]=(async()=>{
   // Another accent's voice: the engine restarts with that lexicon (the request that asked carries on).
   if(w)await this.close(kind,'switching voice',{abort:false});
   const free=this.freemem();if(free<NEEDS[kind]*0.8)throw err(NAMES[kind]+' needs about '+(NEEDS[kind]/GB).toFixed(1)+' GB of free memory and '+(free/GB).toFixed(1)+' GB is free. Close some programs.'+NO_CLOUD,'out_of_memory','fatal');
   onStage?.(kind==='hearing'?'Starting hearing on this PC…':'Starting the voice on this PC…');
   const worker=new SpeechWorker({kind,script:this.script,execPath:this.execPath,runtimeDir:this.installer.runtimeDir(st),log:this.log,startTimeout:this.startTimeout});
   this.workers[kind]=worker;
   worker.on('exit',e=>{if(this.workers[kind]!==worker)return;const was=!!this.loaded[kind];this.workers[kind]=null;this.loaded[kind]=null;clearTimeout(this.idleTimers[kind]);this.writePids();
    if(!e.stopped&&was){this.lastError[kind]={message:NAMES[kind]+' closed unexpectedly.'+NO_CLOUD+(worker.lastLines()?' (Engine: '+worker.lastLines().slice(0,160)+')':''),code:'crashed',at:Date.now()};this.log('Local speech',kind+' engine closed unexpectedly: '+worker.lastLines());}
    this.emitStatus();});
   let r;
   try{r=await worker.start({kind,addon:this.installer.addon(st),config:this.config(kind,voice)});}
   catch(e){if(this.workers[kind]===worker)this.workers[kind]=null;throw this.explain(e,kind);}
   this.loaded[kind]={at:Date.now(),loadMs:r.loadMs,accent,voice:voice?.id||null,sampleRate:r.sampleRate||null,speakers:r.speakers||null};
   this.writePids();this.lastError[kind]=null;this.scheduleIdle(kind,await this.settings());this.emitStatus();
   this.log('Local speech',kind+' ready after '+r.loadMs+' ms');return worker;
  })();
  try{return await this.starting[kind];}finally{this.starting[kind]=null;}
 }
 /**
  * A voice turn has begun and will be spoken with Kokoro: start the voice engine now, in the background,
  * so it has loaded by the time the reply's first sentence is ready (it would otherwise load only then,
  * about 1.5 s later). Nothing happens if it isn't installed or is already running for this voice's
  * accent; a start that fails is reported by the request that needs it, never here. Returns whether it
  * started one.
  */
 prepare(kind,{voice}={}){
  if(!PARTS.includes(kind)||!this.supported()||this.installJob)return false;
  const st=this.installer.state();if(!this.installer.runtimeReady(st)||!this.installer.partReady(kind,st))return false;
  const v=kind==='voice'?this.voice(voice):null;
  if(this.workers[kind]?.alive&&this.loaded[kind]&&(kind!=='voice'||this.loaded[kind].accent===v.accent))return false;
  if(this.starting[kind])return false;
  this.ensure(kind,{voice:v}).catch(e=>this.log('Local speech',kind+' didn’t start ahead of the turn: '+e.message));
  return true;
 }
 explain(e,kind){
  if(e.code==='cancelled')return err('Stopped.','cancelled');
  if(e.kind==='fatal'||e.code==='out_of_memory')return e;
  const detail=String(e.message||e).slice(0,200);
  if(e.code==='addon')return err('The speech engine couldn’t be loaded on this PC: '+detail+'. Remove hearing and voice in '+WHERE+' and install them again.'+NO_CLOUD,'addon','fatal');
  if(e.code==='model_load')return err('The '+(kind==='hearing'?'hearing':'voice')+' model couldn’t be loaded. Remove it in '+WHERE+' and install it again.'+NO_CLOUD,'model_load','fatal');
  if(e.code==='start_timeout')return e;
  return err(NAMES[kind]+' couldn’t start: '+detail+(/cloud service/.test(detail)?'':NO_CLOUD),e.code||'crashed','fatal');
 }
 scheduleIdle(kind,s){clearTimeout(this.idleTimers[kind]);const mins=s?.idleMinutes??DEFAULTS.idleMinutes;if(!mins||!this.workers[kind])return;
  this.idleTimers[kind]=setTimeout(()=>{if(!this.active[kind].size&&!this.starting[kind]){this.log('Local speech','idle: closing '+kind);void this.close(kind,'idle');}else this.scheduleIdle(kind,s);},mins*this.minuteMs);this.idleTimers[kind].unref?.();}
 /** Closes one engine or both ('all'); work in progress ends with "Stopped". */
 async close(kind='all',reason='closed',{abort=true}={}){
  for(const k of kind==='all'?PARTS:[kind]){
   clearTimeout(this.idleTimers[k]);if(abort)for(const c of this.active[k])c.abort();
   const w=this.workers[k];this.workers[k]=null;this.loaded[k]=null;
   if(w){this.log('Local speech','closing '+k+' ('+reason+')');await w.stop();}
  }
  this.writePids();this.emitStatus();
 }
 release(reason='Tyler stopped'){return this.close('all',reason);}
 killNow(){for(const k of PARTS){try{this.workers[k]?.kill();}catch{}}this.clearPids();}
 async shutdown(){await this.close('all','quit').catch(()=>{});}
 // An engine left behind by a crash of the app: ended at the next start. (Normally an engine ends by
 // itself when the app goes, because its channel to the app closes.) Only a process whose command
 // line is this worker is ended, never another program that got the same number.
 pidPath(){return path.join(this.dir,'running.json');}
 writePids(){const pids=Object.fromEntries(PARTS.filter(k=>this.workers[k]?.pid).map(k=>[k,this.workers[k].pid]));
  try{if(Object.keys(pids).length)fs.writeFileSync(this.pidPath(),JSON.stringify({pids,at:Date.now()}));else fs.rmSync(this.pidPath(),{force:true});}catch{}}
 clearPids(){try{fs.rmSync(this.pidPath(),{force:true});}catch{}}
 cleanStale(){
  let r;try{r=JSON.parse(fs.readFileSync(this.pidPath(),'utf8'));}catch{return;}this.clearPids();
  for(const pid of Object.values(r?.pids||{}).map(Number)){
   if(!Number.isInteger(pid)||pid<=0||pid===process.pid)continue;
   const end=()=>{try{process.kill(pid);this.log('Local speech','ended an engine left from before');}catch{}};
   if(process.platform==='win32')execFile('powershell.exe',['-NoProfile','-NonInteractive','-Command','(Get-CimInstance Win32_Process -Filter "ProcessId='+pid+'").CommandLine'],{windowsHide:true,timeout:8000},(e,out)=>{if(!e&&/speech-worker\.cjs/i.test(String(out)))end();});
   else{try{if(/speech-worker\.cjs/.test(fs.readFileSync('/proc/'+pid+'/cmdline','utf8')))end();}catch{}}
  }
 }
 // ── hearing and speaking ────────────────────────────────────────────────
 /** Runs one request on an engine with Stop, the idle timer and the status kept right. */
 async run(kind,{signal,voice,onStage,timeoutMs},fn){
  const ctl=new AbortController(),stop=()=>ctl.abort();signal?.addEventListener('abort',stop,{once:true});if(signal?.aborted)ctl.abort();
  this.active[kind].add(ctl);clearTimeout(this.idleTimers[kind]);let w=null;
  try{
   const starting=this.ensure(kind,{voice,onStage});starting.catch(()=>{});
   w=await Promise.race([starting,new Promise((_,j)=>{if(ctl.signal.aborted)j(err('Stopped.','cancelled'));ctl.signal.addEventListener('abort',()=>j(err('Stopped.','cancelled')),{once:true});})]);
   return await fn(w,ctl.signal,timeoutMs);
  }catch(e){
   if(ctl.signal.aborted||e.code==='cancelled')throw err('Stopped.','cancelled');
   if(e.code==='crashed'||e.code==='not_running'){const last=this.lastError[kind]?.message;throw err(last||e.message+(/cloud service/.test(e.message)?'':NO_CLOUD),'crashed');}
   if(e.kind)throw e;
   if(e.code==='bad_audio')throw err('Hearing on this PC couldn’t read that recording: '+e.message+'.','bad_audio');
   if(e.code==='empty')throw err('The voice on this PC made no audio for that text.'+NO_CLOUD,'empty');
   if(e.code==='model_load'||e.code==='addon')throw this.explain(e,kind);
   throw err(NAMES[kind]+' failed: '+String(e.message||e).slice(0,200)+NO_CLOUD,e.code||'failed');
  }finally{signal?.removeEventListener('abort',stop);this.active[kind].delete(ctl);this.scheduleIdle(kind,await this.settings());this.emitStatus();}
 }
 /** Speech to text for one clip (base64 WAV). Resolves {text, ms, seconds, startMs}. */
 hear({audio,signal,onStage,timeoutMs=20000}={}){
  if(typeof audio!=='string'||!audio)return Promise.reject(err('Nothing to hear.','bad_request'));
  const t0=Date.now(),was=!!this.loaded.hearing;
  return this.run('hearing',{signal,onStage,timeoutMs},async(w,sig,t)=>{const r=await w.request('hear',{audio},{signal:sig,timeout:t});
   return {text:String(r.text||'').trim().slice(0,1400),ms:r.ms,seconds:r.seconds,startMs:was?0:this.loaded.hearing?.loadMs||null,totalMs:Date.now()-t0,model:this.lock.hearing.label};});
 }
 /** Text to speech (one clip, at most 30 s). Resolves {audio (base64 WAV), seconds, ms, firstMs, voice}. */
 speak({text,voice:id,speed=1,signal,onStage,timeoutMs=60000}={}){
  const t=String(text||'').replace(/\s+/g,' ').trim().slice(0,800);if(!t)return Promise.reject(err('Nothing to say.','bad_request'));
  const v=this.voice(id),t0=Date.now(),was=this.loaded.voice?.accent===v.accent;
  return this.run('voice',{signal,voice:v,onStage,timeoutMs},async(w,sig,tm)=>{const r=await w.request('speak',{text:t,sid:v.sid,speed},{signal:sig,timeout:tm});
   if(typeof r.audio!=='string'||!r.audio)throw err('The voice on this PC made no audio.'+NO_CLOUD,'empty');
   return {audio:r.audio,seconds:r.seconds,ms:r.ms,firstMs:r.firstMs,startMs:was?0:this.loaded.voice?.loadMs||null,totalMs:Date.now()-t0,cut:!!r.cut,voice:{id:v.id,label:v.label},model:this.lock.voice.label};});
 }
 /** Settings → the quick check: hearing transcribes the built-in clip; voice times the first audio of a sentence. */
 async check(part,{voice}={}){
  if(!PARTS.includes(part))throw Error('Unknown part.');
  let c;
  try{
   if(part==='hearing'){
    const audio=fs.readFileSync(this.checkClip).toString('base64'),r=await this.hear({audio,timeoutMs:120000});
    const want=words(CHECK_TEXT),got=new Set(words(r.text)),match=want.filter(w=>got.has(w)).length/want.length;
    c={ok:true,at:Date.now(),seconds:r.seconds,ms:r.ms,startMs:r.startMs,totalMs:r.totalMs,text:r.text.slice(0,160),expected:CHECK_TEXT,words:Math.round(match*100),threads:this.threads};
   }else{
    const r=await this.speak({text:CHECK_LINE,voice,timeoutMs:120000});
    c={ok:true,at:Date.now(),seconds:r.seconds,ms:r.ms,firstMs:r.firstMs,startMs:r.startMs,totalMs:r.totalMs,voice:r.voice.label,threads:this.threads,audio:r.audio};
   }
  }catch(e){c={ok:false,at:Date.now(),error:e.message};}
  const {audio,...saved}=c;this.installer.saveCheck(part,saved);this.emitStatus();
  if(!c.ok)throw Object.assign(Error(c.error),{check:saved});
  return c;
 }
}
module.exports={LocalSpeech,SpeechWorker,speechThreads,DEFAULTS,IDLE,CHECK_TEXT,CHECK_LINE,NEEDS};

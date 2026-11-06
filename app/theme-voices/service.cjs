'use strict';
// ROBOTIC TYLER theme voices: the service the desktop app uses (v2.35).
//
// One shared Qwen3-TTS model (Quality 1.7B or Lightweight 0.6B), one worker process, 25 voice profiles.
// Requests wait in a short queue, one voice is made at a time, and each can be stopped. Finished
// clips are cached, so Replay and repeated lines are instant. The model loads on first use and the
// worker closes after the idle time the owner picks, which gives back all of its memory.
// Nothing here changes the mode or the voice by itself: a request that can't run as asked fails
// with the reason (for example, not enough free graphics memory) instead of using something else.
//
// v2.41: optional character voices. Each theme remembers the character picked for it (settings.characters,
// theme → character id; none means the theme's own voice). The theme and the character are both taken
// when a request starts, so a message, and every part of one spoken reply, keeps one speaker.
//
// v2.44: an optional "sharper voice" for three characters (Medic, Lash, Kelvin): kNN-VC voice conversion run
// in the worker after Qwen3-TTS, matching each frame against the character's own built-in recordings. It needs
// an optional download (the pinned kNN-VC weights, LOCK.components.knnvc) that is installed only when the owner
// asks, and a per-character switch (settings.sharper, "theme/character" → true), off by default. If it's on but
// can't run (not installed, a recording missing, too little free memory, or the conversion fails), the normal
// character voice speaks and the clip says why (never silently).
//
// v2.44 "Runs on" (settings.device): "auto" = the graphics card, or the processor when the card is full (the
// default, and what the old "else the processor" label promised): before loading on the card, the free graphics
// memory is checked against the mode's need; if it doesn't fit, or loading or speaking runs out of graphics memory,
// the same model loads on the processor (standard engine) and every voice status says so. The card is tried again
// at the next load (after the engine closes when idle). "cuda" = the card only (a full card stops with the message,
// as before v2.44). "cpu" = the processor only.
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto'),{EventEmitter}=require('node:events');
const sapi=require('./sapi.cjs');
const {Installer,plan,LOCK}=require('./installer.cjs'),{WorkerHost}=require('./worker.cjs'),{Voices,THEMES,STATUS,CHARACTER_ID}=require('./voices.cjs'),hardware=require('./hardware.cjs');
const GB=1024**3;
const MODES={quality:{model:'quality',label:'Quality',about:'Qwen3-TTS 1.7B: the closest match to each voice.'},light:{model:'light',label:'Lightweight',about:'Qwen3-TTS 0.6B: less graphics memory, a little less like each voice.'}};
const DEFAULTS={mode:null,device:'auto',engine:'standard',idleMinutes:5,followTheme:true,override:'',processed:true,nativeVoices:true,chat:false,chatAccess:'everyone',chatAllowed:'',chatCooldown:20,maxChars:400,characters:{},builtinVersion:{},characterVersion:{},sharper:{}};
const MAX_QUEUE=4,CACHE_LIMIT=300*1024**2,CHECK_LINE='Voice check. Theme voices are ready.';
// v2.44: the voice-conversion component, and the memory it needs on top of the voice model while it runs.
const CONVERSION='knnvc',CONVERSION_RAM=LOCK.components?.[CONVERSION]?.memory?.ram||1.4e9;

class ThemeVoices extends EventEmitter{
 /**
  * @param {object} o
  * @param {string} o.dataDir   …\RoboticTylerHydraCloudV12\ThemeVoices
  * @param {string} o.appDir    the app's theme-voices folder (worker/, voices/, characters/, engine-lock.json)
  * @param {Function} o.fetch   fetch for downloads
  * @param {Function} o.getSettings  async () => saved themeVoices settings object
  * @param {Function} o.setSettings  async (object) => void
  * @param {Function} [o.theme]  async () => the active theme id
  * @param {string} [o.bundledDir] the character clips (v2.43; default: appDir/characters)
  */
 constructor({dataDir,appDir,fetch,getSettings,setSettings,theme=async()=>'steam',log=()=>{},python=null,detect=hardware.detect,freemem=os.freemem,catalogFile,bundledDir}){
  super();Object.assign(this,{dir:dataDir,appDir,getSettingsRaw:getSettings,setSettingsRaw:setSettings,activeTheme:theme,log,devPython:python,detectFn:detect,freemem});
  fs.mkdirSync(dataDir,{recursive:true});
  this.installer=new Installer({dir:dataDir,fetch,workerDir:path.join(appDir,'worker'),log});
  this.voices=new Voices({builtinDir:path.join(appDir,'voices'),dataDir,...(catalogFile?{catalogFile}:{}),...(bundledDir?{bundledDir}:{})});
  this.queue=[];this.active=null;this.worker=null;this.loaded=null;this.idleTimer=null;this.hw=null;this.installJob=null;this.lastClip=null;this.lastError=null;this.seq=0;
  this.cacheDir=path.join(dataDir,'cache','clips');this.promptDir=path.join(dataDir,'cache','voices');
 }
 async settings(){const s=await this.getSettingsRaw().catch(()=>null);return {...DEFAULTS,...(s&&typeof s==='object'?s:{})};}
 async saveSettings(changes){
  const s=await this.settings(),next={...s};
  if(changes.mode!==undefined)next.mode=MODES[changes.mode]?changes.mode:null;
  if(changes.device!==undefined)next.device=['auto','cuda','cpu'].includes(changes.device)?changes.device:'auto';
  if(changes.engine!==undefined)next.engine=changes.engine==='fast'?'fast':'standard';
  if(changes.idleMinutes!==undefined){const n=Number(changes.idleMinutes);next.idleMinutes=[0,1,2,5,10,20,30,60].includes(n)?n:5;}
  for(const k of ['followTheme','processed','chat','nativeVoices'])if(changes[k]!==undefined)next[k]=changes[k]===true;
  if(changes.override!==undefined)next.override=THEMES.includes(changes.override)?changes.override:'';
  if(changes.chatAccess!==undefined)next.chatAccess=changes.chatAccess==='selected'?'selected':'everyone';
  if(changes.chatAllowed!==undefined)next.chatAllowed=String(changes.chatAllowed||'').split(/[\s,]+/).filter(id=>/^7656119\d{10}$/.test(id)).slice(0,100).join('\n');
  if(changes.chatCooldown!==undefined){const n=Number(changes.chatCooldown);next.chatCooldown=[0,10,20,30,60,120,300].includes(n)?n:20;}
  // v2.41: the character picked for each theme ('' = the theme's own voice). Only the themes named change.
  if(changes.characters&&typeof changes.characters==='object'){const c={...(s.characters&&typeof s.characters==='object'?s.characters:{})};
   for(const [t,id] of Object.entries(changes.characters).slice(0,30))if(THEMES.includes(t)){if(id===''||id===null)delete c[t];else if(CHARACTER_ID.test(String(id)))c[t]=String(id);}
   next.characters=c;}
  // v2.41: an improved built-in voice can be set back to its earlier version (its baseline) per theme.
  if(changes.builtinVersion&&typeof changes.builtinVersion==='object'){const b={...(s.builtinVersion&&typeof s.builtinVersion==='object'?s.builtinVersion:{})};
   for(const [t,n] of Object.entries(changes.builtinVersion).slice(0,30))if(THEMES.includes(t)){const k=Number(n);if(!n)delete b[t];else if(Number.isInteger(k)&&k>0&&k<100)b[t]=k;}
   next.builtinVersion=b;}
  // v2.42: a character can be set back to its earlier version ("theme/character" → version; 0 = its current one).
  if(changes.characterVersion&&typeof changes.characterVersion==='object'){const b={...(s.characterVersion&&typeof s.characterVersion==='object'?s.characterVersion:{})};
   for(const [k,n] of Object.entries(changes.characterVersion).slice(0,60)){const [t,id]=String(k).split('/');if(!THEMES.includes(t)||!CHARACTER_ID.test(String(id||'')))continue;const v=Number(n);if(!n)delete b[k];else if(Number.isInteger(v)&&v>0&&v<10)b[k]=v;}
   next.characterVersion=b;}
  // v2.44: the "sharper voice" switch per character ("theme/character" → true). Only the characters that offer it;
  // false (or 0/null) switches it off. Anything else is ignored.
  if(changes.sharper&&typeof changes.sharper==='object'){const offered=new Set(this.voices.characters.sharperIds()),b={...(s.sharper&&typeof s.sharper==='object'?s.sharper:{})};
   for(const [k,on] of Object.entries(changes.sharper).slice(0,60)){if(!offered.has(String(k)))continue;if(on===true)b[k]=true;else if(on===false||on===0||on===null)delete b[k];}
   next.sharper=b;}
  await this.setSettingsRaw(next);this.scheduleIdle(next);this.emitStatus();return next;
 }
 /**
  * v2.44, read-only, for other local AI sharing the graphics card: how much graphics memory theme voices want kept free
  * (hardware.vramNeed: the mode's need, plus voice conversion's when a sharper voice is on and installed; 0 when they
  * run on the processor only), and whether a voice model is on the card right now.
  */
 async vramReserve(){
  const s=await this.settings(),conversion=Object.values(s.sharper||{}).some(x=>x===true)&&this.installer.componentStatus(CONVERSION).current;
  return {bytes:this.deviceFor(s)==='cuda'?hardware.vramNeed(s,{conversion}):0,mode:s.mode||null,device:s.device||'auto',onCard:this.loaded?.device==='cuda',fallback:this.loaded?.fallback?.why||null};
 }
 async hardware(refresh=false){if(!this.hw||refresh||Date.now()-this.hw.at>60000)this.hw=await this.detectFn(this.dir);return this.hw;}
 /** The engine to install. The fast engine (v2.36) is only for an NVIDIA card; a processor-only PC
  *  always gets the standard one (the fast engine's speed comes from the card). */
 runtimeFor(hw,device,engine='standard'){
  const fast=engine==='fast';
  if(process.platform!=='win32')return fast?'linux-cpu-fast':'linux-cpu';
  if(device==='cpu')return 'windows-cpu';
  return hardware.usableGpu(hw).gpu?(fast?'windows-cuda-fast':'windows-cuda'):'windows-cpu';
 }
 static engineOf(runtime){return String(runtime||'').endsWith('-fast')?'fast':'standard';}
 /** What installing would download for a mode (and optionally the other model too). */
 async planFor({mode,both=false,device,engine}={}){
  const hw=await this.hardware(),rec=hardware.recommend(hw),s=await this.settings();
  const m=MODES[mode]?mode:s.mode||rec.mode,models=both?['quality','light']:[MODES[m].model];
  const p=plan({runtime:this.runtimeFor(hw,device||s.device,engine||s.engine),models}),need=this.installer.needs(p);
  // What this PC still needs: an engine or model already here (or packages an older engine has) isn't downloaded again.
  return {...p,mode:m,recommendation:rec,hardware:hw,files:undefined,fileCount:need.get.length,download:need.download,reused:need.reused,engineReady:need.engineReady,
   disk:need.engineReady?need.download:p.disk,fullDownload:p.download};
 }
 async status(){
  const s=await this.settings(),inst=this.installer.status(),hw=this.hw,rec=hw?hardware.recommend(hw):null;
  const mode=s.mode||rec?.mode||'quality',modelOk=!!inst.models?.[MODES[mode].model];
  // The engine in use is the installed one; choosing the other engine takes effect when it's installed (never silently).
  const engine=inst.installed?ThemeVoices.engineOf(inst.runtime):null,wanted=s.engine==='fast'?'fast':'standard';
  const gpu=!!(hw&&hardware.usableGpu(hw).gpu),switchable=!!inst.installed&&!!inst.current&&s.device!=='cpu'&&(gpu||engine==='fast')&&engine!==wanted;
  return {installed:!!inst.installed,current:!!inst.current,updateAvailable:!!inst.updateAvailable,runtime:inst.runtime||null,engine,engineWanted:wanted,engineSwitch:switchable,models:inst.models||{},check:inst.check||null,
   mode,modeChosen:!!s.mode,modeLabel:MODES[mode].label,recommendation:rec,hardware:hw?{cpu:hw.cpu,ram:hw.ram,gpus:hw.gpus,disk:hw.disk}:null,
   ready:!!inst.installed&&!!inst.current&&modelOk,needs:!inst.installed?'install':!inst.current?'update':!modelOk?'model':null,
   loaded:this.loaded?{mode:this.loaded.mode,device:this.loaded.device,engine:this.loaded.engine,since:this.loaded.at,fallback:this.loaded.fallback?.why||null}:null,
   // v2.44: why the voice runs on the processor although "Runs on" allows the card (null when it doesn't).
   deviceNote:this.loaded?.fallback?.note||null,
   busy:!!this.active,queued:this.queue.length,installing:this.installJob?this.installJob.progress:null,installError:this.lastInstallError||null,lastError:this.lastError,settings:s,
   lastClip:this.lastClip?{id:this.lastClip.id,seconds:this.lastClip.seconds,voice:this.lastClip.voiceName,text:this.lastClip.text.slice(0,80)}:null,
   conversion:await this.conversionStatus()};
 }
 /** v2.44: the optional voice conversion: installed? its download size, what a stopped download already has, and the free disk space. */
 async conversionStatus(){
  const c=LOCK.components?.[CONVERSION];if(!c)return null;
  const st=this.installer.componentStatus(CONVERSION),free=await fs.promises.statfs(this.dir).then(x=>x.bavail*x.bsize).catch(()=>null);
  return {installed:st.installed,current:st.current,download:st.bytes,partial:st.partial,free,label:c.label,release:c.release,repo:c.repo,ram:CONVERSION_RAM,
   installing:this.convJob?this.convJob.progress:null,error:this.lastConvError||null,characters:this.voices.characters.sharperIds()};
 }
 emitStatus(){this.status().then(s=>this.emit('status',s)).catch(()=>{});}
 async voiceList(){const s=await this.settings();return this.voices.list({characters:s.characters||{},characterVersion:s.characterVersion||{},sharper:s.sharper||{},conversion:this.installer.componentStatus(CONVERSION).current});}
 /** The voice for theme + character, as a request starting now would use it (v2.41). */
 async voiceFor(theme,character){const s=await this.settings();return this.voices.voiceFor(theme,character,{version:s.builtinVersion?.[theme],characterVersion:character?s.characterVersion?.[theme+'/'+character]:undefined});}
 /** The theme and character a request starting now would use (Tyler's spoken replies pin this once per reply). */
 async resolve({theme,character}={}){const t=await this.resolveTheme(theme||null),s=await this.settings();return {theme:t,character:typeof character==='string'?character:(s.characters?.[t]||'')};}
 /** Imports the owner's character voice pack (its folder or ZIP). v2.43: the recordings are built in; this repairs or adds. */
 async importCharacters(source,onProgress){const r=await this.voices.characters.import(source,{onProgress});this.emitStatus();return r;}
 /** Removes the imported copies only (v2.43: the built-in recordings are part of the app and stay). */
 removeCharacters(){this.voices.characters.remove();this.emitStatus();}
 // ── install, repair, remove ──────────────────────────────────────────────
 async install({mode,both=false,offline=[],device,engine,runtime,models}={}){
  if(this.installJob)throw Error('Theme voices are already being installed.');
  // Claimed at once, so a second press can't start a second install over the same downloads.
  const ctl=new AbortController();this.installJob={ctl,progress:{phase:'start',label:'Checking this PC'}};this.lastInstallError=null;this.emitStatus();
  try{
   const folders=(offline||[]).map(x=>String(x||'').trim().replace(/^["']+|["']+$/g,'')).filter(Boolean);
   let full,chosen=mode;
   if(runtime&&models)full=plan({runtime,models});
   else{const p=await this.planFor({mode,both,device,engine});full=plan({runtime:p.runtime,models:p.models});chosen=p.mode;}
   this.installJob.progress={phase:'start',label:'Starting',bytes:0,totalBytes:this.installer.needs(full).download};this.emitStatus();
   await this.stop();await this.closeWorker(); // nothing may run from the engine while it's replaced
   await this.installer.install(full,{offline:folders,signal:ctl.signal,python:this.devPython,onProgress:e=>{this.installJob.progress=e;this.emit('install',e);}});
   if(!(await this.settings()).mode&&chosen)await this.saveSettings({mode:chosen});
   this.installJob.progress={phase:'check',label:'Making a test voice'};this.emit('install',this.installJob.progress);
   await this.closeWorker(); // the check runs on the engine just installed
   const check=await this.check({signal:ctl.signal}); // Stop installing stops this step too (v2.37.1)
   this.emit('install',{phase:'done',label:'Theme voices are ready',check});return {ok:true,check};
  }catch(e){
   const out=e.name==='AbortError'?'Installation stopped. What was downloaded is kept, so it carries on from there next time.':
    ctl.signal.aborted&&e.code==='cancelled'?'Stopped before the test voice. Everything is installed: press Run a voice check to try it.':e.message;
   this.lastInstallError={message:out,at:Date.now()};this.emit('install',{phase:'failed',label:out});throw Object.assign(Error(out),{code:e.code});
  }
  finally{this.installJob=null;this.emitStatus();}
 }
 cancelInstall(){this.installJob?.ctl.abort();}
 /** A real voice from the installed engine: the installer's last step, and Settings → Test. */
 async check({signal}={}){
  const st=this.installer.status(),s=await this.settings(),have=Object.keys(st.models||{}).filter(k=>st.models[k]);
  const mode=s.mode&&st.models?.[MODES[s.mode].model]?s.mode:have[0]||s.mode||'quality';
  const theme=this.voices.get('cs16')?.refPath?'cs16':THEMES.find(t=>this.voices.get(t)?.refPath);
  const started=Date.now();let result;
  try{result=await this.generate({text:CHECK_LINE,theme,mode,noCache:true,purpose:'check',signal});}
  catch(e){if(e.code!=='cancelled')this.installer.saveCheck({ok:false,error:e.message,code:e.code||null,at:Date.now()});throw e;}
  const c={ok:true,at:Date.now(),mode,device:result.device||this.loaded?.device,engine:this.loaded?.engine||ThemeVoices.engineOf(st.runtime),seconds:result.seconds,ms:result.ms,totalMs:Date.now()-started,rtf:+(result.ms/1000/Math.max(.1,result.seconds)).toFixed(2),voice:theme};
  this.installer.saveCheck(c);return c;
 }
 async verify(onProgress){return this.installer.verify({onProgress});}
 /** Checks every file; re-fetches only what's damaged (the engine only when the engine itself is). */
 async repair(){
  if(this.installJob)throw Error('Theme voices are being installed right now.');
  // v2.44: the optional voice conversion's files are checked too. A damaged one is deleted (it would be refused
  // anyway) and the owner is told to install it again: Repair never downloads it by itself.
  const cv=await this.installer.verifyComponent(CONVERSION).catch(()=>({damaged:[]}));
  if(cv.damaged.length){if(this.worker){await this.stop();await this.closeWorker();}for(const d of cv.damaged)await fs.promises.rm(d.file,{force:true,maxRetries:10});this.emitStatus();}
  const conversion=cv.damaged.length?{damaged:cv.damaged.length,note:'A voice conversion file was damaged and has been removed: install voice conversion again to use the sharper voice.'}:null;
  const v=await this.installer.verify();if(v.ok)return {ok:true,repaired:false,conversion,check:await this.check()};
  const st=this.installer.state();if(!st)throw Error('Theme voices aren’t installed.');
  await this.stop();await this.closeWorker();
  if(!v.engineOk)await fs.promises.rm(path.join(this.dir,st.engine,'ok'),{force:true});
  for(const d of v.damagedModels)await fs.promises.rm(d.file,{force:true,maxRetries:10});
  const models=Object.keys(st.models||{});
  const r=await this.install({runtime:st.runtime,models:models.length?models:[MODES[(await this.settings()).mode||'quality'].model]});
  return {ok:true,repaired:true,problems:v.count,conversion,check:r.check};
 }
 async remove({everything=false}={}){if(this.installJob)throw Error('Stop the installation first.');await this.stop();await this.closeWorker();await this.installer.remove({everything});this.lastClip=null;this.emitStatus();}
 async removeModel(key){if(this.installJob)throw Error('Stop the installation first.');await this.stop();await this.closeWorker();await this.installer.removeModel(key);this.emitStatus();}
 // ── v2.44: the optional voice conversion (the "sharper voice") ─────────────
 /** Downloads the pinned kNN-VC weights (resumable, each checked by SHA-256). Only when the owner asks; never by itself. */
 async installConversion({offline=[]}={}){
  if(this.convJob)throw Error('Voice conversion is already being downloaded.');
  if(!this.installer.state())throw Object.assign(Error('Install theme voices first: voice conversion runs in the theme-voice engine.'),{code:'not_installed'});
  const ctl=new AbortController();this.convJob={ctl,progress:{phase:'start',label:'Starting'}};this.lastConvError=null;this.emitStatus();
  try{
   const folders=(offline||[]).map(x=>String(x||'').trim().replace(/^["']+|["']+$/g,'')).filter(Boolean);
   await this.installer.installComponent(CONVERSION,{offline:folders,signal:ctl.signal,onProgress:e=>{this.convJob.progress=e;this.emit('conversion',e);}});
   this.emit('conversion',{phase:'done',label:'Voice conversion is installed'});return {ok:true};
  }catch(e){
   const out=e.name==='AbortError'?'Stopped. What was downloaded is kept, so it carries on from there next time.':e.message;
   this.lastConvError={message:out,at:Date.now()};this.emit('conversion',{phase:'failed',label:out});throw Object.assign(Error(out),{code:e.code});
  }finally{this.convJob=null;this.emitStatus();}
 }
 cancelConversionInstall(){this.convJob?.ctl.abort();}
 /** Removes only the voice conversion files. The switches stay (they fall back, visibly, until it's installed again). */
 async removeConversion(){
  if(this.convJob)throw Error('Stop the download first.');
  // The engine may have the files open (on Windows they can't be deleted then): close it first.
  if(this.worker){await this.stop();await this.closeWorker();}
  const r=await this.installer.removeComponent(CONVERSION);this.emitStatus();return r;
 }
 /**
  * The conversion a request would use: null (off, or not offered), {note} (on, but it can't run: the normal voice
  * speaks and says why), or {req, key} (what the worker needs, and what the clip's cache key adds).
  */
 conversionFor(theme,v,s){
  if(!v?.characterVoice||!v.character)return null;const id=theme+'/'+v.character;
  if(s.sharper?.[id]!==true)return null;
  const m=this.voices.characters.matching(theme,v.character);if(!m)return null; // not offered for this character (an old setting): nothing changes
  const c=LOCK.components[CONVERSION],st=this.installer.componentStatus(CONVERSION);
  if(!st.current)return {note:'Sharper voice is on, but voice conversion '+(st.installed?'isn’t complete (a file is missing or changed): install it again':'isn’t installed: install it')+' in Settings → Theme voices. This is the normal voice.',code:'not_installed'};
  if(!m.ok)return {note:'Sharper voice is on, but '+m.reason+'. This is the normal voice.',code:'matching'};
  const w=c.files.find(f=>/^WavLM/.test(f.path)),g=c.files.find(f=>!/^WavLM/.test(f.path));
  // The matching set's features are cached by the WavLM checkpoint's SHA-256, the settings and every clip's SHA-256.
  const fkey=crypto.createHash('sha256').update(JSON.stringify([w.sha256,m.settings.layer,7,...m.shas])).digest('hex').slice(0,24);
  return {req:{wavlm:path.join(st.dir,w.path),vocoder:path.join(st.dir,g.path),wavlm_sha256:w.sha256,vocoder_sha256:g.sha256,k:m.k,layer:m.settings.layer,vad:7,match:m.files,
   cache:path.join(this.dir,'cache','conversion',fkey+'.safetensors')},key:['knnvc',c.revision,w.sha256,g.sha256,m.settings,m.shas]};
 }

 // ── the worker ───────────────────────────────────────────────────────────
 async workerFor(){
  const st=this.installer.state();if(!st)throw Object.assign(Error('Theme voices aren’t installed yet. Open Settings → Theme voices to install them.'),{code:'not_installed'});
  if(!this.installer.status().current)throw Object.assign(Error('Theme voices need an update for this version of Tyler. Open Settings → Theme voices and press Update.'),{code:'needs_update'});
  if(this.worker?.alive)return this.worker;
  const engine=this.installer.engineDir(st);
  const script=await this.installer.copyWorker(engine);
  const w=new WorkerHost({python:this.installer.python(st),script,site:path.join(engine,'site'),cwd:engine,log:this.log});
  this.worker=w;
  w.on('exit',()=>{if(this.worker===w){this.worker=null;this.loaded=null;}this.emitStatus();});
  await w.start();return w;
 }
 async closeWorker(){clearTimeout(this.idleTimer);const w=this.worker;this.worker=null;this.loaded=null;if(w)await w.quit();this.emitStatus();}
 /** Ends the engine at once (the app is quitting): no python.exe is left behind holding files. */
 killNow(){try{this.worker?.kill();}catch{}}
 /**
  * Where the model runs. "auto" with the graphics-card engine means the graphics card: if it can't be
  * used, the message fails with the reason instead of quietly moving to the (much slower) processor.
  */
 deviceFor(s){const st=this.installer.state();return s.device==='cpu'||!String(st?.runtime).includes('cuda')?'cpu':'cuda';}
 /** Room for the model? Says so plainly instead of quietly using a smaller one. */
 async roomFor(mode,device){
  const need=hardware.NEEDS[mode];
  if(device==='cuda'){
   const hw=await this.hardware(true).catch(()=>null),g=hw&&hardware.usableGpu(hw).gpu;
   // A probe that finds nothing (nvidia-smi busy or slow during a game) isn't treated as "no card": the engine itself decides when it loads.
   if(g&&g.vramFree&&!hardware.fitsCard(mode,g.vramFree))throw Object.assign(Error(MODES[mode].label+' mode needs about '+(need.vram/GB).toFixed(1)+' GB of free graphics memory and '+(g.vramFree/GB).toFixed(1)+' GB is free right now (a game may be using it). Close it, or switch to '+(mode==='quality'?'Lightweight mode':'the processor')+' in Settings → Theme voices.'),{code:'low_vram',free:g.vramFree,need:need.vram});
  }
  else{const needRam=(mode==='quality'?7.5:3.6)*GB,free=this.freemem();if(free<needRam*0.8)throw Object.assign(Error(MODES[mode].label+' mode on the processor needs about '+(needRam/GB).toFixed(1)+' GB of free memory and '+(free/GB).toFixed(1)+' GB is free. Close some programs'+(mode==='quality'?', or switch to Lightweight mode':'')+'.'),{code:'low_memory'});}
 }
 /** v2.44: "Graphics card, or the processor when the card is full": the default for a graphics-card engine. */
 autoDevice(s){return s.device!=='cpu'&&s.device!=='cuda'&&this.deviceFor(s)==='cuda';}
 /** The note every voice status shows while a voice runs on the processor because the card was full. */
 static cardFullNote({free,need,why}={}){
  const g=n=>(n/GB).toFixed(1)+' GB';
  return (why==='speaking'?'The graphics card ran out of memory while speaking':why==='loading'?'The graphics card ran out of memory loading the voice':'The graphics card was full'+(free&&need?' ('+g(free)+' free, the voice needs about '+g(need)+')':''))+
   ', so this voice runs on the processor: much slower. The card is tried again the next time the engine starts.';
 }
 /**
  * Loads the voice model where settings.device says. With "auto" on a graphics-card engine it falls back to the
  * processor (the same model, the standard engine) when the card is full, and remembers why (loaded.fallback);
  * `cardFull` forces that (the card ran out of memory while speaking).
  */
 async ensureLoaded(mode,{cardFull=null}={}){
  const s=await this.settings(),want=this.deviceFor(s),st=this.installer.state(),engine=ThemeVoices.engineOf(st?.runtime),auto=this.autoDevice(s);
  if(!cardFull&&this.loaded&&this.loaded.mode===mode&&this.loaded.engineAsked===engine&&this.worker?.alive){
   if(this.loaded.device===want)return {loaded:this.loaded,worker:this.worker};
   // A processor fallback is kept until the engine closes (idle, or Close the engine now); then the card is tried again.
   if(auto&&this.loaded.fallback)return {loaded:this.loaded,worker:this.worker};
  }
  const dir=this.installer.modelDir(MODES[mode].model,st);
  if(!dir||!fs.existsSync(dir))throw Object.assign(Error(MODES[mode].label+' mode’s model isn’t installed. Install it in Settings → Theme voices.'),{code:'model_missing'});
  // Another model (or the other device) is loaded: close it first, so its memory counts as free.
  if(this.loaded||cardFull)await this.closeWorker();
  let fallback=cardFull?{why:'speaking',note:ThemeVoices.cardFullNote({why:'speaking'})}:null;
  if(want==='cuda'&&!fallback){
   try{await this.roomFor(mode,'cuda');}
   catch(e){if(!auto||e.code!=='low_vram')throw e;fallback={why:'full',free:e.free,need:e.need,note:ThemeVoices.cardFullNote(e)};}
   if(!fallback){
    try{return await this.loadOn(mode,dir,'cuda',engine,{minFree:auto?Math.round(hardware.NEEDS[mode].vram*hardware.FIT):0});}
    catch(e){
     if(!auto||!['low_vram','out_of_memory'].includes(e.code))throw e;
     // Nothing stays on the card: the engine that tried is closed before the processor load starts.
     await this.closeWorker();
     fallback=e.code==='low_vram'?{why:'full',free:e.info?.free,need:hardware.NEEDS[mode].vram,note:ThemeVoices.cardFullNote({free:e.info?.free,need:hardware.NEEDS[mode].vram})}:{why:'loading',note:ThemeVoices.cardFullNote({why:'loading'})};
    }
   }
  }
  const device=fallback?'cpu':want;
  if(device==='cpu')try{await this.roomFor(mode,'cpu');}catch(e){if(fallback)e.message=fallback.note.replace(/, so this voice runs on the processor.*$/,'')+', and the processor can’t take it either: '+e.message;throw e;}
  // The fast engine needs the card: a processor fallback uses the standard engine (the same model and voice).
  return this.loadOn(mode,dir,device,fallback?'standard':engine,{fallback,engineAsked:engine});
 }
 async loadOn(mode,dir,device,engine,{minFree=0,fallback=null,engineAsked=engine}={}){
  const w=await this.workerFor();
  // On the processor, full precision is faster but bigger: measured, Lightweight (0.6B) in fp32 peaked
  // at 6 GB on a long line (and ran out on an 8 GB machine), Quality (1.7B) in bf16 at 5.3 GB.
  const dtype=device==='cuda'?'auto':os.totalmem()>=(mode==='quality'?20:12)*GB?'fp32':'bf16';
  let r;try{r=await w.request('load',{model_dir:dir,device,dtype,engine,threads:Math.max(1,os.cpus().length-1),...(minFree?{min_free_vram:minFree}:{})},{timeout:300000});}
  catch(e){if(e.code==='no_gpu')throw Object.assign(Error('The graphics card can’t be used right now (the voice engine didn’t find it). Check that the NVIDIA driver is installed and up to date, or choose “Processor only” in Settings → Theme voices.'),{code:'no_gpu'});throw e;}
  if(this.worker!==w)throw Object.assign(Error('Stopped.'),{code:'cancelled'});
  // engine: what actually speaks. The fast engine on the processor speaks the standard way (it has no CUDA graphs there).
  this.loaded={mode,device,dtype:r.dtype_used,engineAsked,engine:r.engine_used==='standard'||!r.engine_used?'standard':'fast',at:Date.now(),loadMs:r.load_ms,fallback};
  if(fallback)this.log('Theme voices','on the processor: '+fallback.note);
  this.emitStatus();return {loaded:this.loaded,worker:w};
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
 async speak({text,theme,character,mode,purpose='call',fresh=false,signal}={}){
  const s=await this.settings(),clean=String(text||'').replace(/\s+/g,' ').trim();
  // Tyler's own spoken replies (v2.36) may be longer than a typed message (up to 800 characters).
  const limit=purpose==='reply'?800:s.maxChars;
  if(!clean)throw Error('Type something for Tyler to say.');if(clean.length>limit)throw Error('That’s too long for one voice message ('+clean.length+' characters; '+limit+' at most).');
  // The theme and the character are taken now, so a change meanwhile doesn't alter a message on its way.
  const who=await this.resolve({theme,character}),v=await this.voiceFor(who.theme,who.character);
  return this.generate({text:clean,theme:who.theme,character:who.character,voice:v,mode:mode||s.mode||(await this.status()).mode,purpose,noCache:fresh,seed:fresh?1+Math.floor(Math.random()*1e6):1,signal});
 }
 generate(job){
  if(job.signal?.aborted)return Promise.reject(Object.assign(Error('Stopped.'),{code:'cancelled'}));
  if(this.queue.length>=MAX_QUEUE)return Promise.reject(Object.assign(Error('Four voice messages are already waiting. Try again in a moment.'),{code:'busy'}));
  return new Promise((resolve,reject)=>{
   const entry={...job,id:'v'+(++this.seq),resolve,reject,queuedAt:Date.now()};
   // One job can be called off on its own (a voice reply that was interrupted), without stopping the rest.
   job.signal?.addEventListener('abort',()=>this.cancelJob(entry),{once:true});
   this.queue.push(entry);this.emitStatus();void this.pump();});
 }
 cancelJob(entry){
  const i=this.queue.indexOf(entry);
  if(i>=0){this.queue.splice(i,1);entry.reject(Object.assign(Error('Stopped.'),{code:'cancelled'}));this.emitStatus();return;}
  if(this.active===entry){entry.cancelled=true;
   if(entry.workerId&&this.worker)this.worker.cancel(entry.workerId);
   // Still starting the engine or loading the model: close it, so Stop takes effect now (v2.37.1).
   else if(this.worker){const w=this.worker;this.worker=null;this.loaded=null;w.kill();this.emitStatus();}}
 }
 async pump(){
  if(this.active||!this.queue.length)return;
  const job=this.queue.shift();this.active=job;this.emitStatus();clearTimeout(this.idleTimer);
  try{job.resolve(await this.run(job));this.lastError=null;}
  catch(e){if(job.cancelled&&e.code!=='cancelled')e=Object.assign(Error('Stopped.'),{code:'cancelled'}); // stopped while the engine was loading
   if(e.code!=='cancelled')this.lastError={message:e.message,code:e.code||null,at:Date.now()};job.reject(e);}
  finally{this.active=null;this.emitStatus();this.scheduleIdle(await this.settings());if(this.queue.length)setImmediate(()=>void this.pump());}
 }
 async run(job){
  const v=job.voice||await this.voiceFor(job.theme,job.character);if(!v)throw Error('Unknown voice.');
  if(!v.refPath)throw Object.assign(Error((v.name||job.theme)+': '+(v.statusNote||STATUS[v.status]||'no reference recording.')),{code:'no_reference'});
  const s=await this.settings(),mode=MODES[job.mode]?job.mode:'quality';
  const vkey=this.voices.key(v),fx=s.processed&&v.effects?v.effects:null;
  // v2.44: the "sharper voice": its settings, model hashes and matching recordings are part of the clip's cache key,
  // so a converted clip and a normal one never answer for each other. With it off, the key is what it always was.
  let conv=this.conversionFor(job.theme,v,s);
  if(conv?.req&&this.deviceFor(s)==='cpu'&&this.freemem()<CONVERSION_RAM*0.8)conv={note:'Sharper voice is on, but there isn’t enough free memory for it right now (it needs about '+(CONVERSION_RAM/GB).toFixed(1)+' GB more): this is the normal voice. Close some programs to use it.',code:'low_memory'};
  const keyOf=c=>crypto.createHash('sha256').update(JSON.stringify([job.text,vkey,mode,LOCK.models[MODES[mode].model].revision,job.seed||1,fx,...(c?[c.key]:[])])).digest('hex').slice(0,24);
  const key=keyOf(conv?.req?conv:null),plainKey=keyOf(null),sharper=conv?.req?{on:true}:conv?.note?{on:false,code:conv.code,note:conv.note}:null;
  const out=path.join(this.cacheDir,key+'.wav');
  if(!job.noCache&&fs.existsSync(out)){const now=new Date();fs.utimesSync(out,now,now);return this.finish(job,v,{file:out,cached:true,ms:0,seconds:wavSeconds(out),mode,processed:!!fx,sharper});}
  if(job.cancelled)throw Object.assign(Error('Stopped.'),{code:'cancelled'});
  if(this.installJob&&job.purpose!=='check')throw Object.assign(Error('Theme voices are being installed. Try again when it’s done.'),{code:'installing'});
  // Microsoft Sam and Mary: the real Windows voice when this PC has it (closer than a clone, and instant).
  if(v.native?.sapi&&s.nativeVoices!==false&&!v.custom&&!v.characterVoice){
   const n=await sapi.find(v.native.sapi).catch(()=>null);
   if(n){const t0=Date.now(),file=path.join(this.cacheDir,key+'-sapi.wav');if(!job.noCache&&fs.existsSync(file))return this.finish(job,v,{file,cached:true,ms:0,seconds:wavSeconds(file),mode:'native',device:'windows',native:n.name});
    await sapi.speak(n.name,job.text,file);if(job.cancelled)throw Object.assign(Error('Stopped.'),{code:'cancelled'});return this.finish(job,v,{file,cached:false,ms:Date.now()-t0,seconds:wavSeconds(file),mode:'native',device:'windows',native:n.name});}
  }
  let {loaded,worker:w}=await this.ensureLoaded(mode);
  if(job.cancelled)throw Object.assign(Error('Stopped.'),{code:'cancelled'});
  const expected=Math.max(1,job.text.length/14.5);
  const dry=out.replace(/\.wav$/,fx?'-dry.wav':'.wav');
  this.emit('progress',{id:job.id,phase:'speaking',text:job.text.slice(0,60),voice:v.name});
  // Converting adds loading WavLM on first use (and the matching set's features, once) and about 0.35–0.6 s per second of speech on a processor.
  const ask=(w,loaded)=>{job.workerId=w.nextId();const rtf=loaded.device==='cuda'?1.5:mode==='quality'?30:15;
   return w.request('speak',{text:job.text,ref_audio:v.refPath,ref_text:v.xvectorOnly?'':(v.transcript||''),xvector_only:!!v.xvectorOnly||!v.transcript,cache:path.join(this.promptDir,vkey+'-'+mode+'.safetensors'),
    out:dry,out_fx:fx?out:null,effects:fx,seed:job.seed||1,language:v.language||'English',gain_db:v.volume||0,...(conv?.req?{convert:conv.req}:{})},
    {timeout:Math.min(20*60000,60000+expected*rtf*3000+(conv?.req?240000+expected*3000:0)),onProgress:p=>this.emit('progress',{id:job.id,phase:p.phase==='convert'?'converting':'speaking',chunk:p.chunk,chunks:p.chunks,step:p.step,steps:p.steps,voice:v.name})});};
  let r;
  try{r=await ask(w,loaded);}
  catch(e){
   // v2.44 "auto": the card ran out of memory while speaking. The same model loads on the processor and this clip is
   // made once more there (it says so); a second failure fails with its reason.
   if(e.code!=='out_of_memory'||loaded.device!=='cuda'||!this.autoDevice(s)||job.cancelled)throw e;
   this.emit('progress',{id:job.id,phase:'speaking',voice:v.name,note:ThemeVoices.cardFullNote({why:'speaking'})});
   ({loaded,worker:w}=await this.ensureLoaded(mode,{cardFull:true}));
   if(job.cancelled)throw Object.assign(Error('Stopped.'),{code:'cancelled'});
   r=await ask(w,loaded);
  }
  if(job.cancelled)throw Object.assign(Error('Stopped.'),{code:'cancelled'});
  let files={file:fx?r.out_fx:r.out,dry:fx?r.out:null},result=sharper;
  if(conv?.req&&!r.converted){
   // The conversion failed: the worker kept the normal take. It's filed under the normal clip's key, so the
   // converted key never holds a clip that wasn't converted, and the next message tries converting again.
   const moved=f=>{if(!f)return null;const to=f.replace(key,plainKey);try{if(fs.existsSync(to))fs.rmSync(f,{force:true});else fs.renameSync(f,to);return to;}catch{return f;}};
   files={file:moved(files.file),dry:moved(files.dry)};
   result={on:false,code:'failed',note:'Sharper voice couldn’t run ('+String(r.convert_error||'unknown error').slice(0,160)+'), so this is the normal voice.'};
  }else if(conv?.req)result={on:true,ms:r.convert_ms||0,features:r.convert_features||null};
  this.pruneCache();
  return this.finish(job,v,{...files,cached:false,ms:r.ms,seconds:r.seconds,mode,device:loaded.device,deviceNote:loaded.fallback?.note||null,retries:r.retries,processed:!!fx,sharper:result});
 }
 finish(job,v,r){
  const clip={id:job.id,text:job.text,theme:job.theme,character:v.character||null,characterVersion:v.characterVersion||null,versionNote:v.versionNote?.text||null,voiceName:v.name,status:v.status,custom:!!v.custom,fallback:v.fallback||null,...r,
   // v2.44: converted (sharper voice), or why not when it's switched on.
   sharper:r.sharper?.on===true,sharperNote:r.sharper&&r.sharper.on===false?r.sharper.note:null};
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
  const name=(clip.voiceName+' - '+clip.text).replace(/[^\w .,'!-]+/g,' ').replace(/[.!?]+$/,'').slice(0,70).trim()||'Tyler';
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

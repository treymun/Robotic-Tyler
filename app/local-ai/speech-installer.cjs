'use strict';
// ROBOTIC TYLER local AI, stage 2: the installer for hearing and voice on this PC (v2.39).
//
// Three things, each pinned in lock.json (speech) with size and SHA-256 and checked before use:
//   - the speech engine: sherpa-onnx's own Node.js addon (one npm package, the build for this PC);
//   - hearing: NVIDIA Parakeet TDT 0.6B v3 (int8 ONNX files, one Hugging Face commit);
//   - voice:   Kokoro-82M v1.0 (ONNX files, one Hugging Face commit; only the English parts).
// Hearing and voice are installed (and removed) separately; the engine comes with whichever is
// installed first and goes when neither is left. The same rules as Text AI on this PC: the plan
// (download and disk space) first, the free space checked, downloads resume, an offline folder is
// used first, a file that doesn't match its SHA-256 is deleted and never used.
//
// Everything lives in LocalAI\speech\ (the text AI's own files are next to it and untouched by this):
//   installed.json              what is installed (and the last quick checks)
//   runtime-1.13.8-<sha8>\      the addon and its libraries (sherpa-onnx.node, onnxruntime, …)
//   hearing-<revision12>\       Parakeet's files
//   voice-<revision12>\         Kokoro's files (model, voices, lexicons, the English espeak-ng data)
//   downloads\                  downloads in progress (resumable)
// Nothing is installed system-wide and nothing changes PATH or the registry.
const fs=require('node:fs'),path=require('node:path');
const {extractTarGz,stripPlace}=require('./tar.cjs');
const {Downloader,sha256File,abortError}=require('./download.cjs');
const {safeJoin:join0}=require('../theme-voices/zip.cjs');
// A path inside a folder; a name that would leave it is refused (the lock's names never do).
const safeJoin=(root,rel)=>{const p=join0(root,rel);if(!p)throw Error('Unsafe file name in the speech lock: '+rel);return p;};
const LOCK=require('./lock.json').speech;
const GB=1024**3,MARGIN=64*1024**2,PARTS=['hearing','voice'];
const rmr=(p)=>fs.promises.rm(p,{recursive:true,force:true,maxRetries:10,retryDelay:300});
const writeJson=(file,data)=>{fs.writeFileSync(file+'.tmp',JSON.stringify(data,null,1));fs.renameSync(file+'.tmp',file);};
const sizeOf=files=>files.reduce((n,f)=>n+f.size,0);

class SpeechInstaller{
 /** @param {{dir:string,fetch:Function,log?:Function,lock?:object,platform?:string,retryDelay?:Function,stallMs?:number}} o  dir: LocalAI\speech */
 constructor({dir,fetch,log=()=>{},lock=LOCK,platform=process.platform,retryDelay,stallMs}){
  Object.assign(this,{dir,log,lock,platform});
  this.downloads=path.join(dir,'downloads');
  this.downloader=new Downloader({dir:this.downloads,fetch,log,...(retryDelay?{retryDelay}:{}),...(stallMs?{stallMs}:{})});
 }
 runtimeId(){if(this.platform==='win32')return 'windows-x64';if(this.platform==='linux')return 'linux-x64';throw Object.assign(Error('Hearing and voice on this PC need Windows.'),{code:'unsupported'});}
 runtime(id=this.runtimeId()){const r=this.lock.engine.runtimes[id];if(!r)throw Error('Unknown speech engine '+id);return r;}
 runtimeName(id=this.runtimeId()){return 'runtime-'+this.lock.engine.version+'-'+this.runtime(id).sha256.slice(0,8);}
 packName(part){return part+'-'+this.lock[part].revision.slice(0,12);}
 statePath(){return path.join(this.dir,'installed.json');}
 state(){try{return JSON.parse(fs.readFileSync(this.statePath(),'utf8'));}catch{return null;}}
 runtimeDir(s=this.state()){return s?.runtime?path.join(this.dir,s.runtime.dir):null;}
 runtimeReady(s=this.state()){const r=s?.runtime;if(!r)return false;let id;try{id=this.runtimeId();}catch{return false;}
  return r.id===id&&r.dir===this.runtimeName(id)&&fs.existsSync(path.join(this.dir,r.dir,'ok'))&&fs.existsSync(path.join(this.dir,r.dir,this.runtime(id).addon));}
 /** The addon (sherpa-onnx.node) the worker loads, or null. */
 addon(s=this.state()){return this.runtimeReady(s)?path.join(this.runtimeDir(s),this.runtime(s.runtime.id).addon):null;}
 packDir(part,s=this.state()){const p=s?.[part];return p?path.join(this.dir,p.dir):null;}
 /** One of a pack's files on disk (by its path in the lock), or null. */
 file(part,rel,s=this.state()){const d=this.packDir(part,s);return d?safeJoin(d,rel):null;}
 partReady(part,s=this.state()){
  const p=s?.[part],l=this.lock[part];if(!p||!l||p.revision!==l.revision||p.dir!==this.packName(part))return false;
  for(const f of l.files){try{if(fs.statSync(safeJoin(path.join(this.dir,p.dir),f.path)).size!==f.size)return false;}catch{return false;}}
  return true;
 }
 status(){
  const s=this.state(),rt=this.runtimeReady(s);
  return {runtime:rt,version:this.lock.engine.version,hearing:rt&&this.partReady('hearing',s),voice:rt&&this.partReady('voice',s),
   hearingFiles:this.partReady('hearing',s),voiceFiles:this.partReady('voice',s),checks:s?.checks||{},at:s?.at||null};
 }
 /** Files of a pack already placed in its unfinished folder (verified when they were downloaded). */
 placed(part,f){try{return fs.statSync(safeJoin(path.join(this.dir,this.packName(part)+'.partial'),f.path)).size===f.size;}catch{return false;}}
 /** What installing `parts` needs on this PC: the files to fetch, the download and the disk space. */
 plan({parts=PARTS}={}){
  parts=[...new Set((Array.isArray(parts)?parts:[parts]).filter(p=>PARTS.includes(p)))];
  if(!parts.length)throw Object.assign(Error('Choose hearing, voice or both.'),{code:'nothing'});
  const id=this.runtimeId(),rt=this.runtime(id),s=this.state(),runtimeReady=this.runtimeReady(s);
  const files=[];let placedBytes=0;const sizes={};
  if(!runtimeReady)files.push({group:'runtime',name:rt.name,url:rt.url,size:rt.size,sha256:rt.sha256});
  for(const part of parts){
   const l=this.lock[part];sizes[part]=this.partReady(part,s)?0:sizeOf(l.files);
   if(this.partReady(part,s))continue;
   for(const f of l.files){if(this.placed(part,f)){placedBytes+=f.size;continue;}files.push({group:part,part,path:f.path,name:f.path,url:f.url,size:f.size,sha256:f.sha256});}
  }
  const have=files.reduce((n,f)=>n+this.downloader.have(f),0)+placedBytes;
  const total=files.reduce((n,f)=>n+f.size,0)+placedBytes;
  return {runtime:id,parts,files,fileCount:files.length,download:total-have,already:have,total,
   disk:files.reduce((n,f)=>n+f.size,0)+(runtimeReady?0:rt.unpacked)+MARGIN,
   runtimeReady,runtimeBytes:runtimeReady?0:rt.size,hearingBytes:sizes.hearing??0,voiceBytes:sizes.voice??0,
   ready:Object.fromEntries(parts.map(p=>[p,this.partReady(p,s)])),engine:this.lock.engine.version};
 }
 async freeSpace(){try{fs.mkdirSync(this.dir,{recursive:true});const s=await fs.promises.statfs(this.dir);return s.bavail*s.bsize;}catch{return null;}}
 /** Install (or finish installing) the engine and the chosen parts. Progress: {phase,label,bytes,totalBytes,done,total}. */
 async install({parts=PARTS}={},{offline=[],signal,onProgress=()=>{}}={}){
  const p=this.plan({parts}),free=await this.freeSpace();
  if(free!==null&&free<p.disk-(p.already||0))throw Object.assign(Error('Not enough free disk space: this needs about '+(p.disk/GB).toFixed(1)+' GB and '+(free/GB).toFixed(1)+' GB is free on that drive.'),{code:'DISK'});
  await fs.promises.mkdir(this.dir,{recursive:true});
  const totalBytes=p.total;let got=p.total-p.files.reduce((n,f)=>n+f.size,0);
  const tick=(phase,label,extra={})=>onProgress({phase,label,bytes:got,totalBytes,...extra});
  // An offline folder may hold the files flat or in their own folders (espeak-ng-data\lang\gmw\en).
  const folders=f=>offline.flatMap(o=>f.path?[o,path.join(o,path.dirname(f.path)),path.join(o,f.part,path.dirname(f.path))]:[o]);
  // 1. The engine first (a few MB), so a check can run as soon as one part is in.
  const id=p.runtime,rt=this.runtime(id),rtName=this.runtimeName(id);let state=this.state()||{format:1};
  let i=0;
  const fetchOne=async f=>{i++;let last=0;tick('download','Downloading '+path.basename(f.name),{done:i-1,total:p.files.length});
   return this.downloader.obtain(f,{offline:folders(f),signal,onBytes:n=>{got+=n;const now=Date.now();if(now-last>250){last=now;tick('download','Downloading '+path.basename(f.name),{done:i-1,total:p.files.length});}}});};
  if(!p.runtimeReady){
   const file=await fetchOne(p.files.find(f=>f.group==='runtime'));
   if(signal?.aborted)throw abortError();
   tick('unpack','Unpacking the speech engine (sherpa-onnx '+this.lock.engine.version+')');
   const target=path.join(this.dir,rtName),tmp=target+'.partial';await rmr(tmp);await fs.promises.mkdir(tmp,{recursive:true});
   await extractTarGz(file,stripPlace(tmp,rt.strip),{signal});
   for(const n of rt.needs||[rt.addon])if(!fs.existsSync(path.join(tmp,n)))throw Error('The speech engine package has no '+n+'.');
   await fs.promises.writeFile(path.join(tmp,'ok'),JSON.stringify({version:this.lock.engine.version,sha256:rt.sha256,at:new Date().toISOString()}));
   await rmr(target);await fs.promises.rename(tmp,target);await rmr(file).catch(()=>{});
   state={...state,runtime:{id,dir:rtName,version:this.lock.engine.version,sha256:rt.sha256}};writeJson(this.statePath(),state);
  }
  // 2. Each part's files, verified and placed in its unfinished folder; the folder is renamed when complete.
  for(const part of p.parts){
   if(p.ready[part])continue;
   const l=this.lock[part],name=this.packName(part),target=path.join(this.dir,name),tmp=target+'.partial';
   await fs.promises.mkdir(tmp,{recursive:true});
   for(const f of p.files.filter(x=>x.part===part)){
    const src=await fetchOne(f);if(signal?.aborted)throw abortError();
    const dest=safeJoin(tmp,f.path);await fs.promises.mkdir(path.dirname(dest),{recursive:true});
    await fs.promises.rename(src,dest).catch(async()=>{await fs.promises.copyFile(src,dest+'.tmp');await fs.promises.rename(dest+'.tmp',dest);await rmr(src);});
   }
   for(const f of l.files)if(!this.placed(part,f))throw Error('A '+part+' file is missing after the download: '+f.path);
   tick('place','Placing '+l.label);
   await rmr(target);await fs.promises.rename(tmp,target);
   state={...this.state()||state,[part]:{dir:name,revision:l.revision,repo:l.repo,at:Date.now()}};writeJson(this.statePath(),state);
  }
  state={...this.state(),at:Date.now()};writeJson(this.statePath(),state);
  // 3. Tidy: older engines and packs from an earlier pinned set.
  const keep=new Set([state.runtime?.dir,state.hearing?.dir,state.voice?.dir,'downloads','installed.json'].filter(Boolean));
  for(const n of fs.readdirSync(this.dir))if(/^(runtime|hearing|voice)-/.test(n)&&!n.endsWith('.partial')&&!keep.has(n))await rmr(path.join(this.dir,n)).catch(e=>this.log('Local speech: an old folder wasn’t removed yet',e.message));
  tick('done','Installed',{done:1,total:1});
  return state;
 }
 /** Checks the installed files against their SHA-256 (slow: it reads every byte). */
 async verify({signal}={}){
  const s=this.state(),problems=[];if(!s)return {ok:false,problems:['Hearing and voice on this PC aren’t installed.']};
  if(!this.runtimeReady(s))problems.push('The speech engine folder is incomplete.');
  for(const part of PARTS){if(!s[part])continue;
   for(const f of this.lock[part].files){const file=this.file(part,f.path,s);
    if(!fs.existsSync(file)){problems.push('Missing '+part+' file '+f.path);continue;}
    if(fs.statSync(file).size!==f.size||await sha256File(file,signal)!==f.sha256)problems.push('Damaged '+part+' file '+f.path);}}
  return {ok:!problems.length,problems};
 }
 /** Removes one part (hearing or voice). The engine and the downloads go too when neither part is left. */
 async remove(part){
  if(!PARTS.includes(part))throw Error('Unknown part '+part);
  const s=this.state()||{};
  for(const n of fs.existsSync(this.dir)?fs.readdirSync(this.dir):[])if(n.startsWith(part+'-'))await rmr(path.join(this.dir,n));
  delete s[part];if(s.checks)delete s.checks[part];
  if(!PARTS.some(p=>s[p])){await this.removeAll();return;}
  writeJson(this.statePath(),s);
  // Downloads of this part's files (finished or partial) go as well.
  if(fs.existsSync(this.downloads))for(const f of this.lock[part].files){const fp=this.downloader.finalPath({...f,name:f.path});await rmr(fp);await rmr(fp+'.partial');}
 }
 /** Removes everything in LocalAI\speech (Tyler's settings are kept: they're in the app's own data). */
 async removeAll(){if(!fs.existsSync(this.dir))return;for(const n of fs.readdirSync(this.dir))await rmr(path.join(this.dir,n));}
 saveCheck(part,c){const s=this.state();if(!s)return;s.checks={...(s.checks||{}),[part]:c};writeJson(this.statePath(),s);}
}
module.exports={SpeechInstaller,SPEECH_LOCK:LOCK,PARTS,GB};

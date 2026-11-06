'use strict';
// ROBOTIC TYLER local AI: the guided installer (v2.38).
//
// Installs, checks and removes the engine (llama.cpp's llama-server, one pinned release build) and
// the models (GGUF files, each from one pinned Hugging Face commit). Every file is listed in
// lock.json with its size and SHA-256 and checked before use; downloads resume; a file already in
// an offline folder is used first. The plan (download size and disk space) is shown before anything
// downloads, and the free disk space is checked first.
//
// Everything lives in its own folder (…\RoboticTylerHydraCloudV12\LocalAI). Nothing is installed
// system-wide, no PATH or registry change is made, and no driver is touched. Removing it deletes
// the folder's engine, models and downloads; Tyler's settings are kept (they're in the app's vault).
//
// Windows uses one download for both "graphics card" and "processor only": llama.cpp's Vulkan build
// carries the same processor backends as its CPU-only build (checked file by file for b11669). The
// Vulkan backend is kept in its own folder (gpu\) and only loaded when the graphics card is used.
const fs=require('node:fs'),path=require('node:path');
const {extract}=require('../theme-voices/zip.cjs');
const {extractTarGz,stripPlace}=require('./tar.cjs');
const {Downloader,sha256File,abortError}=require('./download.cjs');
const LOCK=require('./lock.json');
const GB=1024**3,MARGIN=128*1024**2;
const rmr=(p)=>fs.promises.rm(p,{recursive:true,force:true,maxRetries:10,retryDelay:300});
const writeJson=(file,data)=>{fs.writeFileSync(file+'.tmp',JSON.stringify(data,null,1));fs.renameSync(file+'.tmp',file);};

class Installer{
 /**
  * @param {object} o
  * @param {string} o.dir       the LocalAI folder
  * @param {Function} o.fetch   fetch() for downloads (Electron's net.fetch uses the system proxy)
  * @param {object} [o.lock]    the pinned files (tests pass their own)
  */
 constructor({dir,fetch,log=()=>{},lock=LOCK,platform=process.platform,retryDelay,stallMs}){
  Object.assign(this,{dir,log,lock,platform});
  this.downloads=path.join(dir,'downloads');
  this.downloader=new Downloader({dir:this.downloads,fetch,log,...(retryDelay?{retryDelay}:{}),...(stallMs?{stallMs}:{})});
 }
 /** The engine build for this PC: Windows (Vulkan + processor) or Linux (processor; development only). */
 runtimeId(){if(this.platform==='win32')return 'windows-vulkan';if(this.platform==='linux')return 'linux-cpu';throw Object.assign(Error('Text AI on this PC needs Windows.'),{code:'unsupported'});}
 runtime(id=this.runtimeId()){const r=this.lock.engine.runtimes[id];if(!r)throw Error('Unknown engine '+id);return r;}
 engineName(id=this.runtimeId()){return 'engine-'+this.lock.engine.build+'-'+this.runtime(id).sha256.slice(0,8);}
 modelDirName(key){return key+'-'+this.lock.models[key].revision.slice(0,12);}
 statePath(){return path.join(this.dir,'installed.json');}
 state(){try{return JSON.parse(fs.readFileSync(this.statePath(),'utf8'));}catch{return null;}}
 engineDir(s=this.state()){return s?.engine?path.join(this.dir,s.engine):null;}
 engineReady(s=this.state()){return !!s&&s.engine===this.engineName(s.runtime)&&fs.existsSync(path.join(this.dir,s.engine,'ok'));}
 exe(s=this.state()){const e=this.engineDir(s);return e?path.join(e,this.runtime(s.runtime).exe):null;}
 /** The graphics-card backend (Windows: gpu\ggml-vulkan.dll), or null when this engine has none. */
 gpuBackend(s=this.state()){const e=this.engineDir(s),g=s&&this.runtime(s.runtime).gpuBackend;return e&&g?path.join(e,'gpu',g):null;}
 modelFile(key,s=this.state()){const m=s?.models?.[key];return m?path.join(this.dir,'models',m.dir,m.file):null;}
 modelReady(key,s=this.state()){const m=s?.models?.[key],l=this.lock.models[key];if(!m||!l||m.revision!==l.revision||m.sha256!==l.sha256)return false;const f=this.modelFile(key,s);try{return fs.statSync(f).size===l.size;}catch{return false;}}
 status(){
  const s=this.state();
  const models=Object.fromEntries(Object.keys(this.lock.models).map(k=>[k,this.modelReady(k,s)]));
  return {installed:!!s&&this.engineReady(s),build:s?.build||null,runtime:s?.runtime||null,models,check:s?.check||null,at:s?.at||null,
   engineOutdated:!!s&&!this.engineReady(s)&&!!s.engine};
 }
 /** What installing `model` needs on this PC: the files to fetch, the download and the disk space. */
 plan({model}){
  const m=this.lock.models[model];if(!m)throw Object.assign(Error('Unknown model: '+model),{code:'unknown_model'});
  const id=this.runtimeId(),rt=this.runtime(id),s=this.state();
  const runtimeReady=this.engineReady(s)&&s.runtime===id,modelReady=this.modelReady(model,s);
  const files=[];
  if(!runtimeReady)files.push({group:'runtime',name:rt.name,url:rt.url,size:rt.size,sha256:rt.sha256});
  if(!modelReady)files.push({group:'model',model,name:m.file,url:m.url,size:m.size,sha256:m.sha256});
  const have=files.reduce((n,f)=>n+this.downloader.have(f),0);
  const download=files.reduce((n,f)=>n+f.size,0)-have;
  // On disk while installing: the downloads, plus the unpacked engine next to its archive.
  const disk=files.reduce((n,f)=>n+f.size,0)+(runtimeReady?0:rt.unpacked)+MARGIN;
  return {runtime:id,model,label:m.label,files,fileCount:files.length,download,already:have,disk,runtimeReady,modelReady,
   runtimeBytes:runtimeReady?0:rt.size,modelBytes:modelReady?0:m.size,engine:this.lock.engine.build};
 }
 async freeSpace(){try{fs.mkdirSync(this.dir,{recursive:true});const s=await fs.promises.statfs(this.dir);return s.bavail*s.bsize;}catch{return null;}}
 /** Install (or finish installing) the engine and one model. Progress: {phase,label,bytes,totalBytes,done,total}. */
 async install({model},{offline=[],signal,onProgress=()=>{}}={}){
  const p=this.plan({model}),free=await this.freeSpace();
  if(free!==null&&free<p.disk-(p.already||0))throw Object.assign(Error('Not enough free disk space: this needs about '+(p.disk/GB).toFixed(1)+' GB and '+(free/GB).toFixed(1)+' GB is free on that drive.'),{code:'DISK'});
  const totalBytes=p.files.reduce((n,f)=>n+f.size,0);let got=0;
  const tick=(phase,label,extra={})=>onProgress({phase,label,bytes:got,totalBytes,...extra});
  // 1. Every file, verified.
  const local=new Map();let i=0;
  for(const f of p.files){
   i++;let last=0;tick('download','Downloading '+f.name,{done:i-1,total:p.files.length});
   local.set(f.sha256,await this.downloader.obtain(f,{offline,signal,onBytes:n=>{got+=n;const now=Date.now();if(now-last>250){last=now;tick('download','Downloading '+f.name,{done:i-1,total:p.files.length});}}}));
  }
  tick('download','All files downloaded and checked',{done:p.files.length,total:p.files.length});
  // 2. The engine, unpacked into a fresh folder named after its build.
  const old=this.state(),id=p.runtime,rt=this.runtime(id),engineName=this.engineName(id),engine=path.join(this.dir,engineName);
  if(!p.runtimeReady){
   if(signal?.aborted)throw abortError();
   tick('unpack','Unpacking the AI engine ('+this.lock.engine.build+')');
   const tmp=engine+'.partial';await rmr(tmp);await fs.promises.mkdir(tmp,{recursive:true});
   const file=local.get(rt.sha256);
   if(rt.kind==='zip')await extract(file,stripPlace(tmp,rt.strip),{signal});
   else if(rt.kind==='tar.gz')await extractTarGz(file,stripPlace(tmp,rt.strip),{signal});
   else throw Error('Unknown archive type '+rt.kind);
   const exe=path.join(tmp,rt.exe);if(!fs.existsSync(exe))throw Error('The engine archive has no '+rt.exe+'.');
   // The graphics-card backend goes in its own folder: llama.cpp then loads it only when told to (GGML_BACKEND_PATH).
   if(rt.gpuBackend){const g=path.join(tmp,rt.gpuBackend);if(!fs.existsSync(g))throw Error('The engine archive has no '+rt.gpuBackend+'.');await fs.promises.mkdir(path.join(tmp,'gpu'),{recursive:true});await fs.promises.rename(g,path.join(tmp,'gpu',rt.gpuBackend));}
   if(this.platform!=='win32')fs.chmodSync(exe,0o755);
   await fs.promises.writeFile(path.join(tmp,'ok'),JSON.stringify({build:this.lock.engine.build,sha256:rt.sha256,at:new Date().toISOString()}));
   await rmr(engine);await fs.promises.rename(tmp,engine);
  }
  // 3. The model, moved into place from the verified download.
  const models={...(old?.models||{})};
  if(!p.modelReady){
   if(signal?.aborted)throw abortError();
   const m=this.lock.models[model],dir=path.join(this.dir,'models',this.modelDirName(model));
   tick('model','Placing '+m.label);
   await fs.promises.mkdir(dir,{recursive:true});
   const src=local.get(m.sha256),target=path.join(dir,m.file);
   await fs.promises.rename(src,target).catch(async()=>{await fs.promises.copyFile(src,target+'.tmp');await fs.promises.rename(target+'.tmp',target);await rmr(src);});
   models[model]={dir:this.modelDirName(model),file:m.file,revision:m.revision,sha256:m.sha256,repo:m.repo};
  }
  // Models from an older pinned set aren't used; their entries go (the files are tidied below).
  for(const k of Object.keys(models))if(!this.lock.models[k]||models[k].revision!==this.lock.models[k].revision)delete models[k];
  const state={format:1,build:this.lock.engine.build,runtime:id,engine:engineName,models,at:Date.now(),check:old?.engine===engineName?old?.check||null:null};
  writeJson(this.statePath(),state);
  // 4. Tidy: the engine archive, older engines, and model folders no longer listed.
  for(const f of p.files)if(f.group==='runtime'){const d=local.get(f.sha256);if(d)await rmr(d).catch(()=>{});}
  for(const name of fs.readdirSync(this.dir))if(/^engine-/.test(name)&&name!==engineName)await rmr(path.join(this.dir,name)).catch(e=>this.log('Local AI: old engine not removed yet',e.message));
  const keep=new Set(Object.values(models).map(m=>m.dir)),mdir=path.join(this.dir,'models');
  if(fs.existsSync(mdir))for(const name of fs.readdirSync(mdir))if(!keep.has(name))await rmr(path.join(mdir,name)).catch(()=>{});
  tick('done','Installed',{done:1,total:1});
  return state;
 }
 /** Checks the installed model files against their SHA-256 (slow: it reads every byte). */
 async verify({signal}={}){
  const s=this.state();if(!s)return {ok:false,problems:['Text AI on this PC isn’t installed.']};
  const problems=[];if(!this.engineReady(s))problems.push('The AI engine folder is incomplete.');
  for(const [k,m] of Object.entries(s.models||{})){const f=this.modelFile(k,s),l=this.lock.models[k];
   if(!l)continue;if(!fs.existsSync(f)){problems.push('Missing model file '+m.file);continue;}
   if(fs.statSync(f).size!==l.size||await sha256File(f,signal)!==l.sha256)problems.push('Damaged model file '+m.file);}
  return {ok:!problems.length,problems};
 }
 /**
  * Removes the engine, the models and any downloads. Tyler's settings are kept (they aren't in this
  * folder), and so are hearing and voice on this PC (v2.39: their own speech\ folder).
  */
 async remove(){if(!fs.existsSync(this.dir))return;for(const name of fs.readdirSync(this.dir))if(name!=='speech')await rmr(path.join(this.dir,name));}
 async removeModel(key){const s=this.state();if(!s?.models?.[key])return;await rmr(path.join(this.dir,'models',s.models[key].dir));delete s.models[key];writeJson(this.statePath(),s);}
 saveCheck(c){const s=this.state();if(!s)return;s.check=c;writeJson(this.statePath(),s);}
}
module.exports={Installer,LOCK,GB};

'use strict';
// ROBOTIC TYLER images on this PC: the guided installer (v2.40, stage 3).
//
// Installs, checks and removes the image engine (stable-diffusion.cpp's sd-cli, one pinned release
// build) and the image models. A model is made of parts (the image model itself, its text encoder
// and its image decoder); each part is one file from one pinned Hugging Face commit, listed in
// lock.json with its size and SHA-256 and checked before use. Parts two models share (the FLUX image
// decoder) are kept once. Downloads resume; a file already in an offline folder is used first. The
// plan (download size and disk space) is shown before anything downloads, and the free disk space is
// checked first. The download, verify and resume code is Text AI on this PC's (../local-ai/download.cjs).
//
// Everything lives in its own folder (…\RoboticTylerHydraCloudV12\LocalImages), apart from Text AI
// on this PC (LocalAI), so removing one never touches the other. Nothing is installed system-wide,
// no PATH or registry change is made and no driver is touched. Removing it deletes the engine,
// models and downloads; Tyler's settings are kept (they're in the app's vault).
//
// Windows uses one download for both "graphics card" and "processor only": the Vulkan build carries
// the same processor backends as the CPU-only build (the same 10 ggml-cpu-*.dll files, same sizes).
// The Vulkan backend is moved to its own folder (gpu\) and only loaded when the graphics card is used.
// The web server (sd-server) in the archive isn't unpacked: Tyler runs sd-cli once per image, with no
// network port at all (sd-server has no way to require a key).
const fs=require('node:fs'),path=require('node:path'),{execFile}=require('node:child_process');
const {extract}=require('../theme-voices/zip.cjs');
const {extractTarGz,stripPlace}=require('../local-ai/tar.cjs');
const {Downloader,sha256File,abortError}=require('../local-ai/download.cjs');
const LOCK=require('./lock.json');
const GB=1024**3,MARGIN=256*1024**2;
const WHERE='Settings → AI & personality → AI on this PC → Images on this PC';
// Windows' "a DLL the program needs is missing" (STATUS_DLL_NOT_FOUND), as Node reports the exit code.
const DLL_MISSING=new Set([3221225781,-1073741515]);
// Microsoft's permalink for the latest supported x64 runtime (checked 2026-11-05 on
// learn.microsoft.com/cpp/windows/latest-supported-vc-redist: "Visual C++ v14 Redistributable").
const VC_RUNTIME_URL='https://aka.ms/vc14/vc_redist.x64.exe';
const VC_RUNTIME='The image engine needs a free part of Windows that this PC doesn’t have yet: Microsoft’s Visual C++ Redistributable (x64). Most PCs already have it, because games and many programs install it. Download it from Microsoft ('+VC_RUNTIME_URL+'), run it, then press Install again: what was downloaded is kept. (Tyler never installs system software himself.)';
const rmr=p=>fs.promises.rm(p,{recursive:true,force:true,maxRetries:10,retryDelay:300});
const writeJson=(file,data)=>{fs.writeFileSync(file+'.tmp',JSON.stringify(data,null,1));fs.renameSync(file+'.tmp',file);};

/** Runs `exe --version` (the engine starts and its libraries load). Resolves {ok, out, code}. */
function versionCheck(exe,{env,timeout=30000}={}){
 return new Promise(resolve=>{try{execFile(exe,['--version'],{cwd:path.dirname(exe),env,windowsHide:true,timeout,maxBuffer:1_000_000},(e,out,err)=>resolve({ok:!e,out:String(out||'')+String(err||''),code:e?(typeof e.code==='number'?e.code:e.code||null):0}));}catch(e){resolve({ok:false,out:String(e.message),code:e.code||null});}});
}

class Installer{
 /**
  * @param {object} o
  * @param {string} o.dir       the LocalImages folder
  * @param {Function} o.fetch   fetch() for downloads (Electron's net.fetch uses the system proxy)
  * @param {object} [o.lock]    the pinned files (tests pass their own)
  * @param {boolean} [o.dev]    also offer the development-only model (tests and tools)
  */
 constructor({dir,fetch,log=()=>{},lock=LOCK,platform=process.platform,retryDelay,stallMs,dev=false,check=versionCheck}){
  Object.assign(this,{dir,log,lock,platform,dev,check});
  this.downloads=path.join(dir,'downloads');
  this.downloader=new Downloader({dir:this.downloads,fetch,log:(...a)=>log(...a.map(x=>String(x).replace(/^Local AI/,'Images on this PC'))),...(retryDelay?{retryDelay}:{}),...(stallMs?{stallMs}:{})});
 }
 /** The engine build for this PC: Windows (Vulkan + processor) or Linux (processor; development only). */
 runtimeId(){if(this.platform==='win32')return 'windows-vulkan';if(this.platform==='linux')return 'linux-cpu';throw Object.assign(Error('Images on this PC needs Windows.'),{code:'unsupported'});}
 runtime(id=this.runtimeId()){const r=this.lock.engine.runtimes[id];if(!r)throw Error('Unknown engine '+id);return r;}
 engineName(id=this.runtimeId()){return 'engine-'+this.lock.engine.build+'-'+this.runtime(id).sha256.slice(0,8);}
 /** The models offered here (the development-only one only when asked for). */
 modelKeys(){return Object.keys(this.lock.models).filter(k=>this.dev||!this.lock.models[k].dev);}
 model(key){const m=this.lock.models[key];if(!m||(m.dev&&!this.dev))throw Object.assign(Error('Unknown image model: '+key),{code:'unknown_model'});return m;}
 partDirName(id){return id+'-'+this.lock.parts[id].revision.slice(0,12);}
 statePath(){return path.join(this.dir,'installed.json');}
 state(){try{return JSON.parse(fs.readFileSync(this.statePath(),'utf8'));}catch{return null;}}
 engineDir(s=this.state()){return s?.engine?path.join(this.dir,s.engine):null;}
 engineReady(s=this.state()){return !!s&&s.engine===this.engineName(s.runtime)&&fs.existsSync(path.join(this.dir,s.engine,'ok'));}
 exe(s=this.state()){const e=this.engineDir(s);return e?path.join(e,this.runtime(s.runtime).exe):null;}
 /** The graphics-card backend (Windows: gpu\ggml-vulkan.dll), or null when this engine has none. */
 gpuBackend(s=this.state()){const e=this.engineDir(s),g=s&&this.runtime(s.runtime).gpuBackend;return e&&g?path.join(e,'gpu',g):null;}
 partFile(id,s=this.state()){const p=s?.parts?.[id];return p?path.join(this.dir,'parts',p.dir,p.file):null;}
 partReady(id,s=this.state()){const p=s?.parts?.[id],l=this.lock.parts[id];if(!p||!l||p.revision!==l.revision||p.sha256!==l.sha256)return false;try{return fs.statSync(this.partFile(id,s)).size===l.size;}catch{return false;}}
 modelReady(key,s=this.state()){const m=this.lock.models[key];return !!m&&!!s?.models?.[key]&&m.parts.every(p=>this.partReady(p,s));}
 /** The installed files of a model, by role: {diffusion, llm, t5xxl, vae, model}. */
 modelFiles(key,s=this.state()){const out={};for(const id of this.lock.models[key].parts)out[this.lock.parts[id].role]=this.partFile(id,s);return out;}
 modelBytes(key){return this.lock.models[key].parts.reduce((n,id)=>n+this.lock.parts[id].size,0);}
 status(){
  const s=this.state();
  const models=Object.fromEntries(this.modelKeys().map(k=>[k,this.modelReady(k,s)]));
  return {installed:!!s&&this.engineReady(s),build:s?.build||null,runtime:s?.runtime||null,models,at:s?.at||null,engineOutdated:!!s&&!this.engineReady(s)&&!!s.engine};
 }
 /** What installing `model` needs on this PC: the files to fetch, the download and the disk space. */
 plan({model}){
  const m=this.model(model),id=this.runtimeId(),rt=this.runtime(id),s=this.state();
  const runtimeReady=this.engineReady(s)&&s.runtime===id;
  const parts=m.parts.map(p=>{const l=this.lock.parts[p];return {id:p,label:l.label,role:l.role,size:l.size,license:l.license,ready:this.partReady(p,s)};});
  const files=[];
  if(!runtimeReady)files.push({group:'runtime',name:rt.name,url:rt.url,size:rt.size,sha256:rt.sha256});
  for(const p of parts)if(!p.ready){const l=this.lock.parts[p.id];files.push({group:'part',part:p.id,name:l.file,url:l.url,size:l.size,sha256:l.sha256});}
  const have=files.reduce((n,f)=>n+this.downloader.have(f),0);
  const total=files.reduce((n,f)=>n+f.size,0);
  // On disk while installing: the downloads, plus the unpacked engine next to its archive.
  const disk=total+(runtimeReady?0:rt.unpacked)+MARGIN;
  return {runtime:id,model,label:m.label,uncensored:!!m.uncensored,parts,files,fileCount:files.length,download:total-have,already:have,disk,runtimeReady,modelReady:this.modelReady(model,s),
   runtimeBytes:runtimeReady?0:rt.size,modelBytes:parts.filter(p=>!p.ready).reduce((n,p)=>n+p.size,0),installedSize:this.modelBytes(model),engine:this.lock.engine.build};
 }
 async freeSpace(){try{fs.mkdirSync(this.dir,{recursive:true});const s=await fs.promises.statfs(this.dir);return s.bavail*s.bsize;}catch{return null;}}
 /** Install (or finish installing) the engine and one model. Progress: {phase,label,bytes,totalBytes,done,total}. */
 async install({model},{offline=[],signal,onProgress=()=>{}}={}){
  const p=this.plan({model}),free=await this.freeSpace();
  if(free!==null&&free<p.disk-(p.already||0))throw Object.assign(Error('Not enough free disk space: this needs about '+(p.disk/GB).toFixed(1)+' GB and '+(free/GB).toFixed(1)+' GB is free on that drive.'),{code:'DISK'});
  const totalBytes=p.files.reduce((n,f)=>n+f.size,0);let got=0;
  const tick=(phase,label,extra={})=>onProgress({phase,label,bytes:got,totalBytes,...extra});
  // 1. Every file, verified against its size and SHA-256.
  const local=new Map();let i=0;
  for(const f of p.files){
   i++;let last=0;tick('download','Downloading '+f.name,{done:i-1,total:p.files.length});
   local.set(f.sha256,await this.downloader.obtain(f,{offline,signal,onBytes:n=>{got+=n;const now=Date.now();if(now-last>250){last=now;tick('download','Downloading '+f.name,{done:i-1,total:p.files.length});}}}));
  }
  tick('download','All files downloaded and checked',{done:p.files.length,total:p.files.length});
  // 2. The engine, unpacked into a fresh folder named after its build, and checked that it starts.
  const old=this.state(),id=p.runtime,rt=this.runtime(id),engineName=this.engineName(id),engine=path.join(this.dir,engineName);
  if(!p.runtimeReady){
   if(signal?.aborted)throw abortError();
   tick('unpack','Unpacking the image engine ('+this.lock.engine.build+')');
   const tmp=engine+'.partial';await rmr(tmp);await fs.promises.mkdir(tmp,{recursive:true});
   const file=local.get(rt.sha256),skip=new Set(rt.skip||[]),base=stripPlace(tmp,rt.strip);
   const place=name=>{const n=String(name).replace(/\\/g,'/');return skip.has(n.slice((rt.strip||'').length))?null:base(name);};
   if(rt.kind==='zip')await extract(file,place,{signal});
   else if(rt.kind==='tar.gz')await extractTarGz(file,place,{signal});
   else throw Error('Unknown archive type '+rt.kind);
   const exe=path.join(tmp,rt.exe);if(!fs.existsSync(exe))throw Error('The engine archive has no '+rt.exe+'.');
   // The graphics-card backend goes in its own folder: ggml then loads it only when told to (GGML_BACKEND_PATH).
   if(rt.gpuBackend){const g=path.join(tmp,rt.gpuBackend);if(!fs.existsSync(g))throw Error('The engine archive has no '+rt.gpuBackend+'.');await fs.promises.mkdir(path.join(tmp,'gpu'),{recursive:true});await fs.promises.rename(g,path.join(tmp,'gpu',rt.gpuBackend));}
   if(this.platform!=='win32')fs.chmodSync(exe,0o755); // ZIP files don't carry the "executable" mark
   tick('check','Checking that the image engine starts');
   const env={...process.env};delete env.GGML_BACKEND_PATH;
   const c=await this.check(exe,{env});
   if(!c.ok){
    await rmr(tmp);
    if(DLL_MISSING.has(Number(c.code))&&rt.needsVcRuntime)throw Object.assign(Error(VC_RUNTIME),{code:'vc_runtime'});
    throw Object.assign(Error('The image engine didn’t start on this PC ('+String(c.out||c.code||'no message').trim().split(/\r?\n/).slice(-2).join(' / ').slice(0,200)+'). What was downloaded is kept.'),{code:'engine_check'});
   }
   if(!c.out.includes(this.lock.engine.commit.slice(0,7)))this.log('Images on this PC: the engine reported',c.out.trim().slice(0,120));
   await fs.promises.writeFile(path.join(tmp,'ok'),JSON.stringify({build:this.lock.engine.build,sha256:rt.sha256,version:c.out.trim().slice(0,200),at:new Date().toISOString()}));
   await rmr(engine);await fs.promises.rename(tmp,engine);
  }
  // 3. The model's parts, moved into place from the verified downloads.
  const parts={...(old?.parts||{})};
  for(const pt of p.parts){
   if(pt.ready)continue;if(signal?.aborted)throw abortError();
   const l=this.lock.parts[pt.id],dir=path.join(this.dir,'parts',this.partDirName(pt.id));
   tick('model','Placing '+l.label);
   await fs.promises.mkdir(dir,{recursive:true});
   const src=local.get(l.sha256),target=path.join(dir,l.file);
   await fs.promises.rename(src,target).catch(async()=>{await fs.promises.copyFile(src,target+'.tmp');await fs.promises.rename(target+'.tmp',target);await rmr(src);});
   parts[pt.id]={dir:this.partDirName(pt.id),file:l.file,revision:l.revision,sha256:l.sha256,repo:l.repo};
  }
  // Parts from an older pinned set aren't used; their entries go (the files are tidied below).
  for(const k of Object.keys(parts))if(!this.lock.parts[k]||parts[k].revision!==this.lock.parts[k].revision||parts[k].sha256!==this.lock.parts[k].sha256)delete parts[k];
  const models={...(old?.models||{}),[model]:{at:Date.now()}};
  for(const k of Object.keys(models))if(!this.lock.models[k])delete models[k];
  const state={format:1,build:this.lock.engine.build,runtime:id,engine:engineName,parts,models,at:Date.now(),gpuSeen:old?.engine===engineName?!!old?.gpuSeen:false};
  writeJson(this.statePath(),state);
  // 4. Tidy: the engine archive, older engines, and part folders no longer listed.
  for(const f of p.files)if(f.group==='runtime'){const d=local.get(f.sha256);if(d)await rmr(d).catch(()=>{});}
  for(const name of fs.readdirSync(this.dir))if(/^engine-/.test(name)&&name!==engineName)await rmr(path.join(this.dir,name)).catch(e=>this.log('Images on this PC: old engine not removed yet',e.message));
  const keep=new Set(Object.values(parts).map(x=>x.dir)),pdir=path.join(this.dir,'parts');
  if(fs.existsSync(pdir))for(const name of fs.readdirSync(pdir))if(!keep.has(name))await rmr(path.join(pdir,name)).catch(()=>{});
  tick('done','Installed',{done:1,total:1});
  return state;
 }
 /** Checks the installed parts against their SHA-256 (slow: it reads every byte). */
 async verify({signal}={}){
  const s=this.state();if(!s)return {ok:false,problems:['Images on this PC isn’t installed.']};
  const problems=[];if(!this.engineReady(s))problems.push('The image engine folder is incomplete.');
  for(const [id,p] of Object.entries(s.parts||{})){const f=this.partFile(id,s),l=this.lock.parts[id];
   if(!l)continue;if(!fs.existsSync(f)){problems.push('Missing file '+p.file);continue;}
   if(fs.statSync(f).size!==l.size||await sha256File(f,signal)!==l.sha256)problems.push('Damaged file '+p.file);}
  return {ok:!problems.length,problems};
 }
 /** Removes the engine, every model and any downloads. Tyler's settings are kept (they aren't in this folder). */
 async remove(){if(!fs.existsSync(this.dir))return;for(const name of fs.readdirSync(this.dir))await rmr(path.join(this.dir,name));}
 /** Removes one model: its parts go unless another installed model uses them. */
 async removeModel(key){
  const s=this.state();if(!s?.models?.[key])return;
  delete s.models[key];
  const used=new Set(Object.keys(s.models).flatMap(k=>this.lock.models[k]?.parts||[]));
  for(const id of this.lock.models[key].parts)if(!used.has(id)&&s.parts?.[id]){await rmr(path.join(this.dir,'parts',s.parts[id].dir));delete s.parts[id];}
  writeJson(this.statePath(),s);
 }
 markGpuSeen(){const s=this.state();if(s&&!s.gpuSeen){s.gpuSeen=true;writeJson(this.statePath(),s);}}
}
module.exports={Installer,LOCK,GB,WHERE,VC_RUNTIME,VC_RUNTIME_URL,DLL_MISSING,versionCheck};

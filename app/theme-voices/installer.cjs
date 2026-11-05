'use strict';
// ROBOTIC TYLER theme voices: the guided installer (v2.35).
//
// Installs, repairs and removes the voice engine: an isolated Python (python.org's embeddable build),
// the pinned Python packages (PyPI and download.pytorch.org), and the Qwen3-TTS models (Hugging Face,
// one pinned commit). Every file is listed in engine-lock.json with its size and SHA-256; a file that
// doesn't match is deleted and never used. Downloads resume where they stopped. Files already on this
// PC (an offline bundle folder, or a file shared by two models) are used instead of downloading.
//
// Everything lives in its own folder (…\RoboticTylerHydraCloudV12\ThemeVoices). Nothing is installed
// system-wide, no PATH or registry change is made, and other Python installs are never touched.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {extract,entries,safeJoin}=require('./zip.cjs');
const LOCK=require('./engine-lock.json');
const GB=1024**3;

const lockHash=(runtimeId)=>crypto.createHash('sha256').update(JSON.stringify([LOCK.engine,LOCK.python,LOCK.runtimes[runtimeId]])).digest('hex').slice(0,12);
const modelDirName=key=>key+'-'+LOCK.models[key].revision.slice(0,12);
const abortError=()=>Object.assign(Error('Cancelled.'),{name:'AbortError'});

/** Writes to a file and fails cleanly on any write error (for example a full disk), never crashing. */
function writer(file,flags='w'){
 const out=fs.createWriteStream(file,{flags});let failed=null;out.on('error',e=>{failed=e;});
 const check=()=>{if(failed)throw Object.assign(Error(failed.code==='ENOSPC'?'The disk is full.':'Couldn’t write '+path.basename(file)+': '+failed.message),{code:failed.code==='ENOSPC'?'DISK':'WRITE'});};
 return {
  async write(chunk){check();if(!out.write(chunk))await new Promise(r=>{const done=()=>{out.off('drain',done);out.off('error',done);r();};out.on('drain',done);out.on('error',done);});check();},
  async close(){await new Promise(r=>{if(out.destroyed||out.writableFinished)return r();out.end(r);out.once('error',()=>r());});check();},
  destroy(){try{out.destroy();}catch{}}};
}
const rmr=(p,o={})=>fs.promises.rm(p,{recursive:true,force:true,maxRetries:10,retryDelay:300,...o});
const writeJson=(file,data)=>{fs.writeFileSync(file+'.tmp',JSON.stringify(data,null,1));fs.renameSync(file+'.tmp',file);};
async function sha256File(file,signal){
 const h=crypto.createHash('sha256');
 for await(const chunk of fs.createReadStream(file,{highWaterMark:1<<20})){if(signal?.aborted)throw abortError();h.update(chunk);}
 return h.digest('hex');
}
/** The files a choice needs: the runtime for this PC and the chosen models. */
function plan({runtime,models}){
 const rt=LOCK.runtimes[runtime];if(!rt)throw Error('Unknown voice engine: '+runtime);
 const files=[];
 if(runtime.startsWith('windows'))files.push({...LOCK.python.windows,group:'runtime'});
 for(const f of rt.files)files.push({...f,group:'runtime'});
 for(const key of models){const m=LOCK.models[key];if(!m)throw Error('Unknown model: '+key);for(const f of m.files)files.push({...f,name:key+'/'+f.path,group:'model',model:key});}
 // The same file in two models (the speech tokenizer) is downloaded once.
 const seen=new Map();for(const f of files){if(seen.has(f.sha256))f.sameAs=seen.get(f.sha256);else seen.set(f.sha256,f.name);}
 const download=files.filter(f=>!f.sameAs).reduce((n,f)=>n+f.size,0);
 const runtimeBytes=files.filter(f=>f.group==='runtime').reduce((n,f)=>n+f.size,0),modelBytes=files.filter(f=>f.group==='model').reduce((n,f)=>n+f.size,0);
 // Unpacked Python packages take about 1.9× their download; the largest one is also briefly on disk twice.
 const disk=Math.ceil(runtimeBytes*1.9+modelBytes+Math.max(0,...files.filter(f=>f.group==='runtime').map(f=>f.size)));
 return {runtime,models,files,download,disk,runtimeBytes,modelBytes,lock:lockHash(runtime)};
}

class Installer{
 /**
  * @param {object} o
  * @param {string} o.dir        the ThemeVoices folder
  * @param {Function} o.fetch    fetch() to download with (Electron's net.fetch uses the system proxy)
  * @param {string} o.workerDir  the app's worker folder (copied next to the engine)
  * @param {Function} [o.log]
  */
 constructor({dir,fetch,workerDir,log=()=>{},retryDelay=attempt=>Math.min(20000,1500*attempt*attempt)}){this.dir=dir;this.fetch=fetch;this.workerDir=workerDir;this.log=log;this.retryDelay=retryDelay;this.downloads=path.join(dir,'downloads');}
 statePath(){return path.join(this.dir,'installed.json');}
 state(){try{return JSON.parse(fs.readFileSync(this.statePath(),'utf8'));}catch{return null;}}
 engineDir(s=this.state()){return s?.engine?path.join(this.dir,s.engine):null;}
 modelDir(key,s=this.state()){return s?.models?.[key]?path.join(this.dir,'models',s.models[key].dir):null;}
 /** Installed and current for this app version's lock? */
 status(){
  const s=this.state();if(!s)return {installed:false};
  // Usable as long as the engine generation matches (LOCK.engine changes only when the worker needs a
  // different engine); a newer pinned set within the same generation is offered, never forced.
  const current=!!LOCK.runtimes[s.runtime]&&(s.engineGen??LOCK.engine)===LOCK.engine&&fs.existsSync(path.join(this.dir,s.engine||'none','ok'));
  const models=Object.fromEntries(Object.keys(LOCK.models).map(k=>[k,!!s.models?.[k]&&s.models[k].revision===LOCK.models[k].revision]));
  return {installed:true,current,updateAvailable:current&&s.lock!==lockHash(s.runtime),runtime:s.runtime,models,installedAt:s.at,engine:this.engineDir(s),check:s.check||null};
 }
 python(s=this.state()){const e=this.engineDir(s);if(!e)return null;return s.runtime.startsWith('windows')?path.join(e,'python','python.exe'):(s.python||'python3');}

 // ── downloading ──────────────────────────────────────────────────────────
 /** A verified copy of `f` in downloads/, from an offline folder, a finished earlier download, or the web. */
 async obtain(f,{offline=[],signal,onBytes}){
  const final=path.join(this.downloads,f.sha256.slice(0,16)+'-'+path.basename(f.name));
  await fs.promises.mkdir(this.downloads,{recursive:true});
  if(fs.existsSync(final)&&fs.statSync(final).size===f.size)return final; // verified when it was finished
  for(const folder of offline){
   const whole=path.join(folder,path.basename(f.name)),alt=path.join(folder,f.sha256.slice(0,16)+'-'+path.basename(f.name));
   for(const cand of [whole,alt,path.join(folder,f.name),...(f.path?[path.join(folder,f.path)]:[])])if(fs.existsSync(cand)&&fs.statSync(cand).size===f.size){
    if(await sha256File(cand,signal)===f.sha256){await fs.promises.copyFile(cand,final+'.partial');await fs.promises.rename(final+'.partial',final);onBytes?.(f.size);this.log('Theme voices: used '+cand);return final;}
   }
   // A file too big for one download link is shipped in parts: NAME.001, NAME.002, …
   const first=whole+'.001';if(fs.existsSync(first)){
    const out=writer(final+'.partial');
    try{for(let n=1;;n++){const part=whole+'.'+String(n).padStart(3,'0');if(!fs.existsSync(part))break;for await(const c of fs.createReadStream(part,{highWaterMark:1<<20})){if(signal?.aborted)throw abortError();await out.write(c);}}await out.close();}
    catch(e){out.destroy();await rmr(final+'.partial');throw e;}
    if(fs.statSync(final+'.partial').size===f.size&&await sha256File(final+'.partial',signal)===f.sha256){await fs.promises.rename(final+'.partial',final);onBytes?.(f.size);return final;}
    await fs.promises.rm(final+'.partial',{force:true});
   }
  }
  let lastError=null;
  for(let attempt=1;attempt<=5;attempt++){
   if(signal?.aborted)throw abortError();
   try{return await this.download(f,final,{signal,onBytes});}
   catch(e){if(e.name==='AbortError'||e.code==='DISK')throw e;lastError=e;this.log('Theme voices download retry',f.name+': '+e.message);
    if(e.code==='CHECKSUM')continue;await new Promise(r=>setTimeout(r,this.retryDelay(attempt)));}
  }
  throw Error('Couldn’t download '+path.basename(f.name)+': '+(lastError?.message||'unknown error'));
 }
 async download(f,final,{signal,onBytes}){
  const part=final+'.partial';let have=fs.existsSync(part)?fs.statSync(part).size:0;if(have>f.size){fs.rmSync(part);have=0;}
  const headers=have?{Range:'bytes='+have+'-'}:{};
  // A connection that goes quiet for 60 s is dropped and the download resumes on the next try.
  const stall=new AbortController(),onAbort=()=>stall.abort();signal?.addEventListener('abort',onAbort);
  let quiet=setTimeout(()=>stall.abort(),60000);const alive=()=>{clearTimeout(quiet);quiet=setTimeout(()=>stall.abort(),60000);};
  try{
  const r=await this.fetch(f.url,{headers,signal:stall.signal,redirect:'follow'});alive();
  if(r.status===416&&have===f.size){/* already complete */}
  else if(!(r.status===200||r.status===206))throw Error('the server answered '+r.status);
  if(r.status===200&&have){have=0;fs.rmSync(part,{force:true});} // the server ignored the resume: start over
  if(have)onBytes?.(have);
  if(r.status!==416){
   const out=writer(part,have?'a':'w');
   try{
    const reader=r.body.getReader();
    for(;;){const {done,value}=await reader.read();if(done)break;alive();if(signal?.aborted)throw abortError();
     await out.write(Buffer.from(value));onBytes?.(value.byteLength);}
    await out.close();
   }catch(e){out.destroy();if(signal?.aborted)throw abortError();if(stall.signal.aborted&&e.code!=='DISK')throw Error('the connection stalled');throw e;}
  }
  }finally{clearTimeout(quiet);signal?.removeEventListener('abort',onAbort);}
  const size=fs.statSync(part).size;if(size!==f.size){if(size>f.size)fs.rmSync(part,{force:true});throw Error('the download stopped early ('+size+' of '+f.size+' bytes)');}
  const got=await sha256File(part,signal);
  if(got!==f.sha256){fs.rmSync(part,{force:true});throw Object.assign(Error('the file didn’t match its checksum, so it was deleted'),{code:'CHECKSUM'});}
  await fs.promises.rename(part,final);return final;
 }

 /**
  * The offline bundle: one .tar (standard format, 7-Zip opens it too) split into parts of at most 2 GB
  * (NAME.tar.001, NAME.tar.002, …) to fit download limits. Each needed file inside is checked like a
  * download; anything missing or damaged is then downloaded as usual.
  */
 async unbundle(folder,files,{signal,onBytes}={}){
  if(!fs.existsSync(folder))throw Error('The folder '+folder+' doesn’t exist.');
  const names=fs.readdirSync(folder),base=names.find(n=>/\.tar\.001$/i.test(n))?.replace(/\.001$/i,'')||names.find(n=>/\.tar$/i.test(n));if(!base)return 0;
  if(names.some(n=>/\.tar\.\d{3}$/i.test(n))){const nums=names.filter(n=>n.startsWith(base+'.')).map(n=>Number(n.slice(base.length+1))).filter(Number.isFinite).sort((a,b)=>a-b);
   const gap=nums.findIndex((x,i)=>x!==i+1);if(gap>=0)throw Error('Part '+String(gap+1).padStart(3,'0')+' of the offline bundle is missing from '+folder+'.');}
  const parts=fs.existsSync(path.join(folder,base))?[path.join(folder,base)]:[];for(let n=1;;n++){const p=path.join(folder,base+'.'+String(n).padStart(3,'0'));if(!fs.existsSync(p))break;parts.push(p);}
  const want=new Map(files.map(f=>[f.sha256.slice(0,16)+'-'+path.basename(f.name),f]));let found=0;
  await fs.promises.mkdir(this.downloads,{recursive:true});
  async function* bytes(){for(const p of parts)for await(const c of fs.createReadStream(p,{highWaterMark:1<<20}))yield c;}
  let buf=Buffer.alloc(0);const it=bytes()[Symbol.asyncIterator]();
  const need=async n=>{while(buf.length<n){const r=await it.next();if(r.done)return false;buf=buf.length?Buffer.concat([buf,r.value]):r.value;}return true;};
  for(;;){
   if(signal?.aborted)throw abortError();
   if(!await need(512))break;const h=buf.subarray(0,512);buf=buf.subarray(512);if(h.every(b=>b===0))break;
   const str=(a,b)=>h.toString('utf8',a,b).replace(/\0.*$/s,'');const name=(str(345,500)?str(345,500)+'/':'')+str(0,100),size=parseInt(str(124,136).trim()||'0',8),type=String.fromCharCode(h[156]||48);
   const f=type==='0'&&want.get(path.basename(name)),final=f&&path.join(this.downloads,path.basename(name));
   const skip=f&&fs.existsSync(final)&&fs.statSync(final).size===f.size;
   const out=f&&!skip?writer(final+'.partial'):null,hash=crypto.createHash('sha256');let left=size;
   try{
    while(left>0){if(signal?.aborted)throw abortError();if(!buf.length&&!await need(1))throw Error('The offline bundle is incomplete (a part is missing or cut short).');const n=Math.min(left,buf.length),chunk=buf.subarray(0,n);buf=buf.subarray(n);left-=n;
     if(out){hash.update(chunk);await out.write(chunk);onBytes?.(n);}}
    if(out)await out.close();
   }catch(e){out?.destroy();if(out)await rmr(final+'.partial');throw e;}
   const pad=(512-size%512)%512;if(pad){await need(pad);buf=buf.subarray(Math.min(pad,buf.length));}
   if(out){if(hash.digest('hex')===f.sha256){await fs.promises.rename(final+'.partial',final);found++;}else{await rmr(final+'.partial');this.log('Theme voices: damaged file in the offline bundle',name);}}
  }
  this.log('Theme voices: offline bundle','used '+found+' file(s) from '+base);return found;
 }
 // ── installing ───────────────────────────────────────────────────────────
 /**
  * Install (or update/repair) for a plan. Progress: {phase,label,done,total,bytes,totalBytes}.
  * The new engine is built in its own folder; the old one keeps working until the new one is ready.
  */
 /**
  * What a plan really needs to fetch on this PC: files of an engine that is already in place, packages
  * an older engine already has (copied instead of downloaded, e.g. PyTorch after an app update) and
  * model files already placed are all skipped.
  */
 needs(p){
  const old=this.state(),engine=path.join(this.dir,'engine-'+p.lock);
  const engineReady=!!old&&old.lock===p.lock&&old.runtime===p.runtime&&fs.existsSync(path.join(engine,'ok'));
  const reuse=new Set(),oldEngine=old?this.engineDir(old):null;
  // Reused from the engine already on this PC, by checksum: also across engines for the same system
  // (switching to the fast engine keeps PyTorch, which is most of the download).
  const platform=r=>String(r||'').split('-')[0];
  if(!engineReady&&oldEngine&&fs.existsSync(path.join(oldEngine,'ok'))&&platform(old.runtime)===platform(p.runtime))for(const f of p.files.filter(f=>f.group==='runtime')){
   if(f.kind==='python'&&old.pythonSha===f.sha256&&fs.existsSync(path.join(oldEngine,'python')))reuse.add(f.sha256);
   if(f.kind==='wheel'&&(old.wheels||[]).some(w=>w.sha256===f.sha256)&&fs.existsSync(path.join(oldEngine,'site',distInfo(f),'RECORD')))reuse.add(f.sha256);
  }
  const placed=f=>f.group==='model'&&(()=>{const t=path.join(this.dir,'models',modelDirName(f.model),f.path);return fs.existsSync(t)&&fs.statSync(t).size===f.size;})();
  const skip=f=>f.group==='runtime'?(engineReady||reuse.has(f.sha256)):placed(f)||!!this.sibling(f);
  const get=p.files.filter(f=>!f.sameAs&&!skip(f));
  return {engineReady,reuse,skip,get,download:get.reduce((n,f)=>n+f.size,0),reused:p.files.filter(f=>reuse.has(f.sha256)).reduce((n,f)=>n+f.size,0)};
 }
 /** The same file in another installed model (the speech tokenizer both models share). */
 sibling(f){
  for(const [k,m] of Object.entries(LOCK.models)){if(k===f.model)continue;const x=m.files.find(y=>y.sha256===f.sha256);if(!x)continue;
   const t=path.join(this.dir,'models',modelDirName(k),x.path);if(fs.existsSync(t)&&fs.statSync(t).size===f.size)return t;}
  return null;
 }
 async install(p,{offline=[],signal,onProgress=()=>{},python}={}){
  const free=await fs.promises.statfs(this.dir).then(s=>s.bavail*s.bsize).catch(()=>null);
  const old=this.state(),oldEngine=old?this.engineDir(old):null,need=this.needs(p);
  // The real peak: what's downloaded, plus (for a new engine) the unpacked packages while the old engine is still on disk.
  const runtimeGet=need.get.filter(f=>f.group==='runtime').reduce((n,f)=>n+f.size,0),runtimeAll=p.files.filter(f=>f.group==='runtime').reduce((n,f)=>n+f.size,0);
  const diskNeed=need.download+(need.engineReady?0:runtimeAll*1.9)+(runtimeGet?0:0)+256*1024**2;
  if(free!==null&&free<diskNeed)throw Object.assign(Error('Not enough free disk space: theme voices need about '+(diskNeed/GB).toFixed(1)+' GB and '+(free/GB).toFixed(1)+' GB is free on that drive.'),{code:'DISK'});
  const toGet=need.get;let got=0;const totalBytes=need.download;
  const tick=(phase,label,extra={})=>onProgress({phase,label,bytes:got,totalBytes,...extra});
  // 1. Every file, verified. An offline bundle (a .tar in parts) is unpacked into the downloads first.
  for(const folder of offline){
   if(!fs.existsSync(folder)||!fs.statSync(folder).isDirectory())throw Object.assign(Error('The folder “'+folder+'” wasn’t found. Check the path (without quotes) and try again.'),{code:'OFFLINE'});
   try{await this.unbundle(folder,toGet,{signal,onBytes:n=>{got+=n;tick('download','Reading the offline bundle',{done:0,total:toGet.length});}});}
   catch(e){if(e.name==='AbortError'||e.code==='DISK')throw e;throw Object.assign(Error('The offline bundle in '+folder+' can’t be used: '+e.message),{code:'OFFLINE'});}
  }
  const local=new Map();let i=0;
  for(const f of toGet){
   i++;tick('download','Downloading '+path.basename(f.name),{done:i-1,total:toGet.length});
   let last=Date.now();
   local.set(f.sha256,await this.obtain(f,{offline,signal,onBytes:n=>{got+=n;if(Date.now()-last>250){last=Date.now();tick('download','Downloading '+path.basename(f.name),{done:i-1,total:toGet.length});}}}));
  }
  tick('download','All files downloaded and checked',{done:toGet.length,total:toGet.length});
  // 2. The engine (Python and packages), in a fresh folder named after the lock.
  const engineName='engine-'+p.lock,engine=path.join(this.dir,engineName);
  if(!need.engineReady){
   await rmr(engine);await fs.promises.mkdir(engine,{recursive:true});
   const site=path.join(engine,'site'),prefix=path.join(engine,'python');
   const runtimeFiles=p.files.filter(f=>f.group==='runtime');let n=0;
   for(const f of runtimeFiles){
    if(signal?.aborted)throw abortError();
    n++;tick('unpack','Unpacking '+(f.package||'Python'),{done:n-1,total:runtimeFiles.length});
    const file=local.get(f.sha256);
    if(need.reuse.has(f.sha256)){await copyFromEngine(f,oldEngine,engine);continue;}
    if(f.kind==='python')await extract(file,name=>safeJoin(prefix,name),{signal});
    else await extract(file,wheelPlace(f,site,prefix),{signal});
   }
   if(p.runtime.startsWith('windows'))writePth(prefix);
   await fs.promises.writeFile(path.join(engine,'ok'),new Date().toISOString());
  }
  await this.copyWorker(engine);
  // 3. The models: placed straight from the verified downloads.
  const models={};
  for(const key of p.models){
   const m=LOCK.models[key],dir=path.join(this.dir,'models',modelDirName(key));let n=0;
   for(const f of m.files){
    if(signal?.aborted)throw abortError();
    n++;tick('models','Placing '+m.label+' ('+f.path+')',{done:n-1,total:m.files.length});
    const target=safeJoin(dir,f.path);if(!target)throw Error('Unsafe model path '+f.path);
    if(fs.existsSync(target)&&fs.statSync(target).size===f.size)continue;
    await fs.promises.mkdir(path.dirname(target),{recursive:true});
    const sib=local.has(f.sha256)?null:this.sibling({...f,model:key});
    // Copies land under a temporary name first, so a half-copied file is never mistaken for a placed one.
    if(sib){await fs.promises.copyFile(sib,target+'.tmp');await fs.promises.rename(target+'.tmp',target);continue;}
    const src=local.get(f.sha256);if(!src)throw Error('Missing download for '+f.path);
    // The speech tokenizer is shared by both models: copy it rather than moving it.
    const shared=p.files.filter(x=>x.sha256===f.sha256).length>1;
    if(shared){await fs.promises.copyFile(src,target+'.tmp');await fs.promises.rename(target+'.tmp',target);}
    else await fs.promises.rename(src,target).catch(async()=>{await fs.promises.copyFile(src,target+'.tmp');await fs.promises.rename(target+'.tmp',target);});
   }
   models[key]={dir:modelDirName(key),revision:m.revision,repo:m.repo};
  }
  // Models already installed and still current are kept.
  for(const [k,v] of Object.entries(this.state()?.models||{}))if(!models[k]&&LOCK.models[k]?.revision===v.revision&&fs.existsSync(path.join(this.dir,'models',v.dir)))models[k]=v;
  const rt=p.files.filter(f=>f.group==='runtime');
  const state={format:1,engineGen:LOCK.engine,engine:engineName,runtime:p.runtime,lock:p.lock,models,at:Date.now(),python:python||null,check:old?.lock===p.lock?old?.check:null,
   pythonSha:rt.find(f=>f.kind==='python')?.sha256||null,wheels:rt.filter(f=>f.kind==='wheel').map(f=>({package:f.package,version:f.version,name:f.name,sha256:f.sha256}))};
  writeJson(this.statePath(),state);
  // 4. Tidy: older engines, and downloads that are now unpacked or copied into place.
  for(const name of fs.readdirSync(this.dir))if(/^engine-[0-9a-f]{12}$/.test(name)&&name!==engineName)await rmr(path.join(this.dir,name)).catch(e=>this.log('Theme voices: old engine not removed yet',e.message));
  for(const f of p.files){const d=local.get(f.sha256);if(d&&fs.existsSync(d))await rmr(d).catch(()=>{});}
  tick('done','Installed',{done:1,total:1});
  return state;
 }
 async copyWorker(engine){
  const to=path.join(engine,'worker');await fs.promises.mkdir(to,{recursive:true});
  for(const name of fs.readdirSync(this.workerDir))if(name.endsWith('.py'))await fs.promises.copyFile(path.join(this.workerDir,name),path.join(to,name));
  return path.join(to,'tyler_voice_worker.py');
 }
 /** Checks every installed file against the lock and the packages' own RECORD lists. */
 async verify({signal,onProgress=()=>{}}={}){
  const s=this.state();if(!s)return {ok:false,problems:['Theme voices aren’t installed.']};
  const problems=[],engineProblems=[],damagedModels=[],engine=this.engineDir(s);
  if(!fs.existsSync(path.join(engine,'ok')))engineProblems.push('The voice engine folder is incomplete.');
  const site=path.join(engine,'site');
  const records=fs.existsSync(site)?fs.readdirSync(site).filter(d=>d.endsWith('.dist-info')):[];
  let n=0;
  for(const d of records){
   n++;onProgress({phase:'verify',label:'Checking '+d.replace(/\.dist-info$/,''),done:n,total:records.length});
   const rec=path.join(site,d,'RECORD');if(!fs.existsSync(rec)){engineProblems.push(d+' has no file list.');continue;}
   let k=0;
   for(const line of (await fs.promises.readFile(rec,'utf8')).split(/\r?\n/)){
    const m=/^(.*),sha256=([A-Za-z0-9_-]+),(\d+)$/.exec(line.trim());if(!m)continue;
    const target=safeJoin(site,m[1]);if(!target)continue;
    // Checked without blocking the app: a pause every few hundred files.
    if(++k%300===0)await new Promise(r=>setImmediate(r));
    const st=await fs.promises.stat(target).catch(()=>null);
    if(!st){if(!m[1].includes('.data/'))engineProblems.push('Missing '+m[1]);continue;}
    if(st.size!==Number(m[3]))engineProblems.push('Changed '+m[1]);
   }
   if(signal?.aborted)throw abortError();
  }
  for(const [key,v] of Object.entries(s.models||{})){
   const m=LOCK.models[key];if(!m)continue;
   for(const f of m.files){const t=path.join(this.dir,'models',v.dir,f.path);onProgress({phase:'verify',label:'Checking '+m.label+' '+f.path});
    if(!fs.existsSync(t)){damagedModels.push({model:key,path:f.path,file:t,missing:true});continue;}
    if(fs.statSync(t).size!==f.size||await sha256File(t,signal)!==f.sha256)damagedModels.push({model:key,path:f.path,file:t});}
  }
  problems.push(...engineProblems,...damagedModels.map(d=>(d.missing?'Missing model file ':'Damaged model file ')+d.model+'/'+d.path));
  return {ok:!problems.length,problems:problems.slice(0,40),count:problems.length,engineOk:!engineProblems.length,damagedModels};
 }
 /** Removes the engine and models. Custom voices, saved clips and settings stay unless asked. */
 async remove({everything=false}={}){
  for(const name of fs.existsSync(this.dir)?fs.readdirSync(this.dir):[]){
   if(!everything&&['custom-voices','saved'].includes(name))continue;
   await rmr(path.join(this.dir,name));
  }
 }
 async removeModel(key){const s=this.state();if(!s?.models?.[key])return;await rmr(path.join(this.dir,'models',s.models[key].dir));delete s.models[key];writeJson(this.statePath(),s);}
 saveCheck(c){const s=this.state();if(!s)return;s.check=c;writeJson(this.statePath(),s);}
}
// Where each file of a wheel goes (the wheel format: NAME.data/purelib|platlib go with the packages,
// NAME.data/data goes to Python's own folder, scripts and headers aren't needed).
// A wheel's own metadata folder (the wheel format names it after the file: NAME-VERSION.dist-info).
function distInfo(f){const [name,version]=path.basename(f.name).split('-');return name+'-'+version+'.dist-info';}
/** Copies an already-installed package (or Python itself) from an older engine, using its RECORD list. */
async function copyFromEngine(f,fromEngine,toEngine){
 const fromSite=path.join(fromEngine,'site'),fromPrefix=path.join(fromEngine,'python'),toSite=path.join(toEngine,'site'),toPrefix=path.join(toEngine,'python');
 if(f.kind==='python'){await fs.promises.cp(fromPrefix,toPrefix,{recursive:true});return;}
 const rec=path.join(fromSite,distInfo(f),'RECORD'),from=wheelPlace(f,fromSite,fromPrefix),to=wheelPlace(f,toSite,toPrefix);
 for(const line of fs.readFileSync(rec,'utf8').split(/\r?\n/)){const name=line.split(',')[0];if(!name)continue;const a=from(name),b=to(name);if(!a||!b||!fs.existsSync(a))continue;
  await fs.promises.mkdir(path.dirname(b),{recursive:true});await fs.promises.copyFile(a,b,fs.constants.COPYFILE_FICLONE);}
}
function wheelPlace(f,site,prefix){
 return name=>{
  const m=/^[^/]+\.data\/(purelib|platlib|data|scripts|headers)\/(.*)$/.exec(name);
  if(!m)return safeJoin(site,name);
  if(m[1]==='purelib'||m[1]==='platlib')return safeJoin(site,m[2]);
  if(m[1]==='data')return safeJoin(prefix,m[2]);
  return null;
 };
}
// Python's embeddable build only searches the folders its ._pth file lists.
function writePth(prefix){
 const pth=fs.readdirSync(prefix).find(n=>/^python\d+\._pth$/.test(n));if(!pth)throw Error('The embeddable Python is missing its ._pth file.');
 const zip=pth.replace('._pth','.zip');
 fs.writeFileSync(path.join(prefix,pth),[zip,'.','..\\site','..\\worker','import site',''].join('\r\n'));
}
module.exports={Installer,plan,LOCK,lockHash,sha256File,wheelPlace,modelDirName,distInfo};

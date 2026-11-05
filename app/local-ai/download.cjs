'use strict';
// ROBOTIC TYLER local AI: verified downloads (v2.38), the same rules as theme voices' installer:
// every file has a size and SHA-256 in lock.json; a file that doesn't match is deleted and never used;
// downloads resume where they stopped (HTTP Range); a quiet connection is dropped after 60 s and the
// download carries on; a few tries with a growing pause; a copy already on this PC (an offline
// folder) is used first. Nothing here runs a downloaded file.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const abortError=()=>Object.assign(Error('Cancelled.'),{name:'AbortError'});

async function sha256File(file,signal){
 const h=crypto.createHash('sha256');
 for await(const chunk of fs.createReadStream(file,{highWaterMark:1<<20})){if(signal?.aborted)throw abortError();h.update(chunk);}
 return h.digest('hex');
}
/** Writes to a file and fails cleanly on any write error (a full disk says so), never crashing. */
function writer(file,flags='w'){
 const out=fs.createWriteStream(file,{flags});let failed=null;out.on('error',e=>{failed=e;});
 const check=()=>{if(failed)throw Object.assign(Error(failed.code==='ENOSPC'?'The disk is full.':'Couldn’t write '+path.basename(file)+': '+failed.message),{code:failed.code==='ENOSPC'?'DISK':'WRITE'});};
 return {
  async write(chunk){check();if(!out.write(chunk))await new Promise(r=>{const done=()=>{out.off('drain',done);out.off('error',done);r();};out.on('drain',done);out.on('error',done);});check();},
  async close(){await new Promise(r=>{if(out.destroyed||out.writableFinished)return r();out.end(r);out.once('error',()=>r());});check();},
  destroy(){try{out.destroy();}catch{}}};
}

class Downloader{
 /** @param {{dir:string,fetch:Function,log?:Function,retryDelay?:Function,stallMs?:number}} o  dir: the downloads folder */
 constructor({dir,fetch,log=()=>{},retryDelay=attempt=>Math.min(20000,1500*attempt*attempt),stallMs=60000}){Object.assign(this,{dir,fetch,log,retryDelay,stallMs});}
 finalPath(f){return path.join(this.dir,f.sha256.slice(0,16)+'-'+path.basename(f.name));}
 /** Bytes of `f` already downloaded (finished or partial), for resuming progress. */
 have(f){const final=this.finalPath(f);try{if(fs.statSync(final).size===f.size)return f.size;}catch{}try{return Math.min(f.size,fs.statSync(final+'.partial').size);}catch{return 0;}}
 /** A verified copy of `f` (from an offline folder, a finished earlier download, or the web). */
 async obtain(f,{offline=[],signal,onBytes}={}){
  const final=this.finalPath(f);
  await fs.promises.mkdir(this.dir,{recursive:true});
  if(fs.existsSync(final)&&fs.statSync(final).size===f.size)return final; // checked when it was finished
  for(const folder of offline){
   for(const cand of [path.join(folder,path.basename(f.name)),path.join(folder,path.basename(final))]){
    if(!fs.existsSync(cand)||fs.statSync(cand).size!==f.size)continue;
    if(await sha256File(cand,signal)!==f.sha256){this.log('Local AI: a file in the folder doesn’t match its checksum, not used',cand);continue;}
    await fs.promises.copyFile(cand,final+'.partial');await fs.promises.rename(final+'.partial',final);onBytes?.(f.size);this.log('Local AI: used',cand);return final;
   }
  }
  let lastError=null;
  for(let attempt=1;attempt<=5;attempt++){
   if(signal?.aborted)throw abortError();
   try{return await this.download(f,final,{signal,onBytes});}
   catch(e){if(e.name==='AbortError'||e.code==='DISK')throw e;lastError=e;this.log('Local AI download retry',path.basename(f.name)+': '+e.message);
    if(e.code==='CHECKSUM')continue;await new Promise(r=>setTimeout(r,this.retryDelay(attempt)));}
  }
  throw Object.assign(Error('Couldn’t download '+path.basename(f.name)+': '+(lastError?.message||'unknown error')),{code:lastError?.code==='CHECKSUM'?'CHECKSUM':'DOWNLOAD'});
 }
 async download(f,final,{signal,onBytes}){
  const part=final+'.partial';let have=fs.existsSync(part)?fs.statSync(part).size:0;if(have>f.size){fs.rmSync(part);have=0;}
  const headers=have?{Range:'bytes='+have+'-'}:{};
  const stall=new AbortController(),onAbort=()=>stall.abort();signal?.addEventListener('abort',onAbort);
  let quiet=setTimeout(()=>stall.abort(),this.stallMs);const alive=()=>{clearTimeout(quiet);quiet=setTimeout(()=>stall.abort(),this.stallMs);};
  try{
   const r=await this.fetch(f.url,{headers,signal:stall.signal,redirect:'follow'});alive();
   if(r.status===416&&have===f.size){/* already complete */}
   else if(!(r.status===200||r.status===206))throw Error('the server answered '+r.status);
   if(r.status===200&&have){have=0;fs.rmSync(part,{force:true});} // the server ignored the resume: start over
   if(have)onBytes?.(have);
   if(r.status!==416){
    const out=writer(part,have?'a':'w');
    try{const reader=r.body.getReader();
     for(;;){const {done,value}=await reader.read();if(done)break;alive();if(signal?.aborted)throw abortError();await out.write(Buffer.from(value));onBytes?.(value.byteLength);}
     await out.close();
    }catch(e){out.destroy();if(signal?.aborted)throw abortError();if(stall.signal.aborted&&e.code!=='DISK')throw Error('the connection stalled');throw e;}
   }
  }catch(e){if(signal?.aborted)throw abortError();if(stall.signal.aborted&&e.code!=='DISK'&&e.name==='AbortError')throw Error('the connection stalled');throw e;}
  finally{clearTimeout(quiet);signal?.removeEventListener('abort',onAbort);}
  const size=fs.statSync(part).size;if(size!==f.size){if(size>f.size)fs.rmSync(part,{force:true});throw Error('the download stopped early ('+size+' of '+f.size+' bytes)');}
  if(await sha256File(part,signal)!==f.sha256){fs.rmSync(part,{force:true});throw Object.assign(Error('the file didn’t match its checksum, so it was deleted'),{code:'CHECKSUM'});}
  await fs.promises.rename(part,final);return final;
 }
}
module.exports={Downloader,sha256File,abortError};

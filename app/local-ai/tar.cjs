'use strict';
// ROBOTIC TYLER local AI: a small .tar.gz reader for the installer (v2.38). llama.cpp's Linux build
// (used for development and tests only) is a .tar.gz with plain files, folders and a few library
// symlinks. Names that would leave the target folder, links that point anywhere but a file next to
// them, and other entry types are refused or skipped.
const fs=require('node:fs'),path=require('node:path'),zlib=require('node:zlib');
const {safeJoin}=require('../theme-voices/zip.cjs');

/**
 * Unpacks `file` (gzip-compressed tar). `place(name)` returns the destination path for an entry or
 * null to skip it. Returns {files,links,bytes}.
 */
async function extractTarGz(file,place,{signal}={}){
 const src=fs.createReadStream(file,{highWaterMark:1<<20}).pipe(zlib.createGunzip());
 const it=src[Symbol.asyncIterator]();let buf=Buffer.alloc(0);
 const need=async n=>{while(buf.length<n){const r=await it.next();if(r.done)return false;buf=buf.length?Buffer.concat([buf,r.value]):r.value;}return true;};
 const take=n=>{const out=buf.subarray(0,n);buf=buf.subarray(n);return out;};
 let files=0,links=0,bytes=0,longName=null,longLink=null,pax={};
 try{
  for(;;){
   if(signal?.aborted)throw Object.assign(Error('Cancelled.'),{name:'AbortError'});
   if(!await need(512))break;
   const h=take(512);if(h.every(b=>b===0))break;
   const str=(a,b)=>h.toString('utf8',a,b).replace(/\0.*$/s,'');
   const size=parseInt(str(124,136).trim()||'0',8),type=String.fromCharCode(h[156]||48),pad=(512-size%512)%512;
   if(!Number.isFinite(size)||size<0)throw Error('Broken archive header in '+path.basename(file));
   const readBody=async()=>{if(!await need(size+pad))throw Error('The archive '+path.basename(file)+' is cut short.');const b=Buffer.from(take(size));take(pad);return b;};
   // Long names (GNU) and extended headers (POSIX pax) apply to the next entry.
   if(type==='L'){longName=(await readBody()).toString('utf8').replace(/\0.*$/s,'');continue;}
   if(type==='K'){longLink=(await readBody()).toString('utf8').replace(/\0.*$/s,'');continue;}
   if(type==='x'){pax={};for(const line of (await readBody()).toString('utf8').split('\n')){const m=/^\d+ ([^=]+)=(.*)$/.exec(line);if(m)pax[m[1]]=m[2];}continue;}
   if(type==='g'){await readBody();continue;}
   const name=pax.path||longName||((str(345,500)?str(345,500)+'/':'')+str(0,100)),linkName=pax.linkpath||longLink||str(157,257);
   longName=null;longLink=null;pax={};
   const target=place(name);
   if(type==='0'||type==='\0'||type==='7'){
    if(!target){if(!await need(size+pad))throw Error('The archive '+path.basename(file)+' is cut short.');take(size+pad);continue;}
    await fs.promises.mkdir(path.dirname(target),{recursive:true});
    const tmp=target+'.tyler-tmp',out=fs.createWriteStream(tmp,{mode:(parseInt(str(100,108).trim()||'644',8)&0o755)|0o600});
    let failed=null;out.on('error',e=>{failed=e;});
    try{let left=size;while(left>0){if(signal?.aborted)throw Object.assign(Error('Cancelled.'),{name:'AbortError'});if(!buf.length&&!await need(1))throw Error('The archive '+path.basename(file)+' is cut short.');const chunk=take(Math.min(left,buf.length));left-=chunk.length;if(!out.write(chunk))await new Promise(r=>out.once('drain',r));if(failed)throw failed;}
     await new Promise((r,j)=>out.end(e=>e?j(e):r()));if(failed)throw failed;}
    catch(e){out.destroy();await fs.promises.rm(tmp,{force:true});throw e.code==='ENOSPC'?Object.assign(Error('The disk is full.'),{code:'DISK'}):e;}
    if(!await need(pad)&&pad)throw Error('The archive '+path.basename(file)+' is cut short.');take(pad);
    await fs.promises.rename(tmp,target);files++;bytes+=size;continue;
   }
   if(size){if(!await need(size+pad))throw Error('The archive '+path.basename(file)+' is cut short.');take(size+pad);}
   if(type==='5'){if(target)await fs.promises.mkdir(target,{recursive:true});continue;}
   if(type==='2'&&target){
    // Only a link to a file in the same folder (libllama.so -> libllama.so.0), never anywhere else.
    if(!/^[A-Za-z0-9._+-]+$/.test(linkName)||linkName==='.'||linkName==='..')throw Error('Unsafe link in the archive: '+name+' -> '+linkName);
    await fs.promises.mkdir(path.dirname(target),{recursive:true});await fs.promises.rm(target,{force:true});
    if(process.platform==='win32'){const real=path.join(path.dirname(target),linkName);if(fs.existsSync(real))await fs.promises.copyFile(real,target);else continue;}
    else await fs.promises.symlink(linkName,target);
    links++;continue;
   }
   // Hard links, devices and anything else aren't needed and aren't made.
  }
 }finally{src.destroy();}
 return {files,links,bytes};
}
/** Where an entry goes when the archive's own top folder (e.g. "llama-b11669/") is dropped. */
function stripPlace(root,strip){
 return name=>{const n=String(name).replace(/\\/g,'/');if(strip&&!n.startsWith(strip))return null;const rest=strip?n.slice(strip.length):n;return rest?safeJoin(root,rest):null;};
}
module.exports={extractTarGz,stripPlace};

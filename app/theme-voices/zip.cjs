'use strict';
// ROBOTIC TYLER theme voices: a small ZIP reader for the installer (v2.35). Python's embeddable zip
// and Python wheels are ZIP files; this reads their central directory (ZIP64 too) and unpacks stored or
// deflated entries. Entry names that would leave the target folder are refused.
const fs=require('node:fs'),path=require('node:path'),zlib=require('node:zlib'),{pipeline}=require('node:stream/promises');

async function readAt(fd,pos,len){const b=Buffer.alloc(len);const {bytesRead}=await fd.read(b,0,len,pos);return b.subarray(0,bytesRead);}
async function entries(file){
 const fd=await fs.promises.open(file,'r');
 try{
  const size=(await fd.stat()).size,tail=Math.min(size,65557),buf=await readAt(fd,size-tail,tail);
  let at=-1;for(let i=buf.length-22;i>=0;i--)if(buf.readUInt32LE(i)===0x06054b50){at=i;break;}
  if(at<0)throw Error('Not a ZIP file: '+path.basename(file));
  let count=buf.readUInt16LE(at+10),cdSize=buf.readUInt32LE(at+12),cdOff=buf.readUInt32LE(at+16);
  if(count===0xffff||cdOff===0xffffffff||cdSize===0xffffffff){
   const loc=at-20;if(loc<0||buf.readUInt32LE(loc)!==0x07064b50)throw Error('Broken ZIP64 file: '+path.basename(file));
   const z=await readAt(fd,Number(buf.readBigUInt64LE(loc+8)),56);if(z.readUInt32LE(0)!==0x06064b50)throw Error('Broken ZIP64 record: '+path.basename(file));
   count=Number(z.readBigUInt64LE(32));cdSize=Number(z.readBigUInt64LE(40));cdOff=Number(z.readBigUInt64LE(48));
  }
  const cd=await readAt(fd,cdOff,cdSize),list=[];let p=0;
  for(let i=0;i<count;i++){
   if(cd.readUInt32LE(p)!==0x02014b50)throw Error('Broken ZIP directory: '+path.basename(file));
   const flags=cd.readUInt16LE(p+8),method=cd.readUInt16LE(p+10),n=cd.readUInt16LE(p+28),e=cd.readUInt16LE(p+30),c=cd.readUInt16LE(p+32);
   let csize=cd.readUInt32LE(p+20),usize=cd.readUInt32LE(p+24),offset=cd.readUInt32LE(p+42);
   const name=cd.toString(flags&0x800?'utf8':'latin1',p+46,p+46+n);
   if(csize===0xffffffff||usize===0xffffffff||offset===0xffffffff){
    let x=p+46+n;const end=x+e;
    while(x+4<=end){const id=cd.readUInt16LE(x),len=cd.readUInt16LE(x+2);if(id===1){let q=x+4;if(usize===0xffffffff){usize=Number(cd.readBigUInt64LE(q));q+=8;}if(csize===0xffffffff){csize=Number(cd.readBigUInt64LE(q));q+=8;}if(offset===0xffffffff){offset=Number(cd.readBigUInt64LE(q));}break;}x+=4+len;}
   }
   list.push({name,method,csize,usize,offset,dir:name.endsWith('/'),encrypted:!!(flags&1)});p+=46+n+e+c;
  }
  return list;
 }finally{await fd.close();}
}
/** Where an entry may go: a path inside `root`, or null when the name is unsafe. */
function safeJoin(root,name){
 const clean=String(name).replace(/\\/g,'/');
 if(!clean||clean.startsWith('/')||/^[a-z]:/i.test(clean)||clean.split('/').some(s=>s==='..'))return null;
 const target=path.resolve(root,clean);const base=path.resolve(root);
 return target===base||target.startsWith(base+path.sep)?target:null;
}
/** Unpacks `file`. `place(name)` returns the destination for an entry (or null to skip it). */
async function extract(file,place,{signal,onEntry}={}){
 const list=await entries(file);let done=0,bytes=0;
 const fd=await fs.promises.open(file,'r');
 try{
  for(const e of list){
   if(signal?.aborted)throw Object.assign(Error('Cancelled.'),{name:'AbortError'});
   const target=place(e.name);if(!target||e.dir){done++;continue;}
   if(e.encrypted||![0,8].includes(e.method))throw Error('Unsupported ZIP entry ('+e.name+') in '+path.basename(file));
   const h=await readAt(fd,e.offset,30);if(h.readUInt32LE(0)!==0x04034b50)throw Error('Broken ZIP entry: '+e.name);
   const start=e.offset+30+h.readUInt16LE(26)+h.readUInt16LE(28);
   await fs.promises.mkdir(path.dirname(target),{recursive:true});
   const tmp=target+'.tyler-tmp';
   if(e.csize===0){await fs.promises.writeFile(tmp,'');}
   else{const src=fs.createReadStream(file,{start,end:start+e.csize-1,highWaterMark:1<<20});
    await (e.method===8?pipeline(src,zlib.createInflateRaw(),fs.createWriteStream(tmp)):pipeline(src,fs.createWriteStream(tmp)));}
   const got=(await fs.promises.stat(tmp)).size;if(got!==e.usize){await fs.promises.rm(tmp,{force:true});throw Error('Unpacked size is wrong for '+e.name);}
   await fs.promises.rename(tmp,target);done++;bytes+=e.usize;onEntry?.({done,total:list.length,bytes,name:e.name});
  }
 }finally{await fd.close();}
 return {files:done,bytes};
}
module.exports={entries,extract,safeJoin};

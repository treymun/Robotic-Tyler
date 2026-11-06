// Builds the theme voices' offline bundle (v2.35): every file the installer would download for the
// chosen engines and models, checked against engine-lock.json, packed into one standard .tar that is
// split into parts of at most 2,000,000,000 bytes (GitHub's limit per release file is 2 GiB).
//
//   node tools/theme-voices/make-offline-bundle.mjs --out DIR [--runtimes windows-cuda,windows-cpu] [--models quality,light]
//
// To use it: download every part into one folder, then in Tyler press Settings → Theme voices
// → Install from a folder… and choose that folder. Nothing is downloaded that the bundle has.
import fs from 'node:fs';import path from 'node:path';import crypto from 'node:crypto';import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),root=path.resolve(import.meta.dirname,'..','..');
const {Installer,plan,LOCK}=require(path.join(root,'app','theme-voices','installer.cjs'));
const arg=(n,d)=>{const i=process.argv.indexOf(n);return i>0?process.argv[i+1]:d;};
const out=path.resolve(arg('--out','dist/theme-voices-offline')),runtimes=arg('--runtimes','windows-cuda,windows-cpu').split(','),models=arg('--models','quality,light').split(',');
const PART=Number(arg('--part-bytes',2_000_000_000)),name='ROBOTIC-TYLER-theme-voices-engine-'+LOCK.engine+'.tar';
fs.mkdirSync(out,{recursive:true});
const cache=path.join(out,'.cache');const inst=new Installer({dir:cache,fetch:globalThis.fetch,workerDir:path.join(root,'app','theme-voices','worker'),log:(...a)=>console.log(...a)});
const files=new Map();
for(const rt of runtimes)for(const f of plan({runtime:rt,models}).files)if(!f.sameAs)files.set(f.sha256,f);
const list=[...files.values()],total=list.reduce((n,f)=>n+f.size,0);
console.log(list.length+' files, '+(total/1024**3).toFixed(2)+' GB');
// Parts: a writer that starts a new file every PART bytes.
let part=0,partBytes=0,fd=null;const parts=[];
function write(buf){let at=0;while(at<buf.length){if(!fd||partBytes>=PART){if(fd)fs.closeSync(fd);part++;const p=path.join(out,name+'.'+String(part).padStart(3,'0'));fd=fs.openSync(p,'w');parts.push(p);partBytes=0;}
 const n=Math.min(buf.length-at,PART-partBytes);fs.writeSync(fd,buf,at,n);at+=n;partBytes+=n;}}
function header(entry,size){
 if(Buffer.byteLength(entry)>99)throw Error('Name too long for the bundle: '+entry);
 const h=Buffer.alloc(512);h.write(entry.slice(0,99),0,'utf8');h.write('0000644\0',100);h.write('0000000\0',108);h.write('0000000\0',116);
 h.write(size.toString(8).padStart(11,'0')+'\0',124);h.write(Math.floor(Date.now()/1000).toString(8).padStart(11,'0')+'\0',136);h.write('        ',148);h.write('0',156);h.write('ustar\0',257);h.write('00',263);
 let sum=0;for(const b of h)sum+=b;h.write(sum.toString(8).padStart(6,'0')+'\0 ',148);return h;
}
const pad=n=>Buffer.alloc((512-n%512)%512);
const index={format:1,engine:LOCK.engine,created:new Date().toISOString(),runtimes,models,files:[]};
const readme=`ROBOTIC TYLER theme voices: offline bundle (engine ${LOCK.engine})\n\nDownload every part (${name}.001, .002, …) into one folder. In ROBOTIC TYLER open\nSettings → Theme voices → Install from a folder… and choose that folder.\nEvery file is checked against the SHA-256 recorded in Tyler before it's used.\n\nContents: the voice engine for ${runtimes.join(' and ')}, and the model(s) ${models.join(', ')}.\nSources: python.org, PyPI, download.pytorch.org and Hugging Face (Qwen3-TTS, Apache-2.0).\n`;
for(const f of list)index.files.push({name:f.sha256.slice(0,16)+'-'+path.basename(f.name),size:f.size,sha256:f.sha256,from:f.url});
const meta=Buffer.from(JSON.stringify(index,null,1)),rd=Buffer.from(readme);
write(header('BUNDLE.json',meta.length));write(meta);write(pad(meta.length));write(header('README.txt',rd.length));write(rd);write(pad(rd.length));
for(const f of list){
 const file=await inst.obtain(f,{});const entry=f.sha256.slice(0,16)+'-'+path.basename(f.name);
 write(header(entry,f.size));const h=crypto.createHash('sha256');
 for await(const c of fs.createReadStream(file,{highWaterMark:1<<22})){h.update(c);write(c);}
 if(h.digest('hex')!==f.sha256)throw Error('Checksum changed while packing '+entry);
 write(pad(f.size));fs.rmSync(file);console.log('packed',entry);
}
write(Buffer.alloc(1024));if(fd)fs.closeSync(fd);fs.rmSync(cache,{recursive:true,force:true});
const sums=[];for(const p of parts){const h=crypto.createHash('sha256');for await(const c of fs.createReadStream(p,{highWaterMark:1<<22}))h.update(c);sums.push(h.digest('hex')+'  '+path.basename(p));}
fs.writeFileSync(path.join(out,'SHA256SUMS-theme-voices.txt'),sums.join('\n')+'\n');fs.writeFileSync(path.join(out,'README-theme-voices-offline.txt'),readme);
console.log('Wrote',parts.length,'part(s) to',out);

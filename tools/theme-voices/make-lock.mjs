// Builds app/theme-voices/engine-lock.json: every file the theme-voice installer may download, each
// pinned to its exact address, size and SHA-256 (v2.35). Run by a developer when the engine changes:
//
//   node tools/theme-voices/make-lock.mjs [--exclude-newer 2026-10-20]
//
// Needs uv and python3 (only here, never on users' PCs). Sources: python.org (the embeddable Python),
// PyPI and download.pytorch.org (the Python packages, resolved by uv for Windows), and Hugging Face
// (the Qwen3-TTS models, pinned to one commit). The installer refuses any byte that doesn't match.
import {execFileSync} from 'node:child_process';
import fs from 'node:fs';import path from 'node:path';import os from 'node:os';import crypto from 'node:crypto';
const root=path.resolve(import.meta.dirname,'..','..');
const arg=(name,def)=>{const i=process.argv.indexOf(name);return i>0?process.argv[i+1]:def;};
const EXCLUDE_NEWER=arg('--exclude-newer','2026-10-20');
const PYTHON={version:'3.13.17',tag:'cp313'};
const TORCH='2.11.0';
const QWEN_TTS='0.1.1';
// qwen-tts 0.1.1's own requirements, minus gradio (only its demo web page uses it). It is installed
// without its dependency list, from this fully pinned set.
const REQUIREMENTS=['transformers==4.57.3','accelerate==1.12.0','librosa','soundfile','sox','onnxruntime','einops','numpy','safetensors'];
const MODELS={
 quality:{repo:'Qwen/Qwen3-TTS-12Hz-1.7B-Base',label:'Qwen3-TTS 1.7B Base'},
 light:{repo:'Qwen/Qwen3-TTS-12Hz-0.6B-Base',label:'Qwen3-TTS 0.6B Base'}};
const RUNTIMES={
 'windows-cuda':{platform:'x86_64-pc-windows-msvc',torch:'cu128',tags:['win_amd64'],label:'NVIDIA graphics card (PyTorch '+TORCH+', CUDA 12.8)'},
 'windows-cpu':{platform:'x86_64-pc-windows-msvc',torch:'cpu',tags:['win_amd64'],label:'Processor only (PyTorch '+TORCH+')'},
 // Development and the automatic tests only (this repository's Linux checks), never offered to users.
 'linux-cpu':{platform:'x86_64-manylinux_2_28',torch:'cpu',tags:['manylinux','linux_x86_64'],label:'Linux processor (tests)',dev:true}};

const get=async(url,type='json')=>{const r=await fetch(url,{redirect:'follow'});if(!r.ok)throw Error(url+' → '+r.status);return type==='json'?r.json():Buffer.from(await r.arrayBuffer());};
const head=async url=>{const r=await fetch(url,{method:'HEAD',redirect:'follow'});if(!r.ok)throw Error(url+' → '+r.status);return Number(r.headers.get('content-length'));};
const sha=buf=>crypto.createHash('sha256').update(buf).digest('hex');
const toml=file=>JSON.parse(execFileSync('python3',['-I','-c','import tomllib,json,sys;print(json.dumps(tomllib.load(open(sys.argv[1],"rb")),default=str))',file],{encoding:'utf8'}));

// The best wheel of a package for this runtime (CPython 3.13 wheels, then abi3, then pure Python).
function pick(wheels,rt){
 const name=w=>decodeURIComponent(w.url.split('/').pop());
 const score=w=>{const n=name(w),plat=rt.tags.some(t=>n.includes(t)),any=/-none-any\.whl$/.test(n);
  // A platform wheel always beats a pure one: soundfile's none-any wheel, for one, lacks libsndfile.
  if(plat&&n.includes('-'+PYTHON.tag+'-'+PYTHON.tag+'-'))return 5;if(plat&&/-abi3-/.test(n))return 4;if(plat&&n.includes('-'+PYTHON.tag+'-'))return 3;if(plat&&/-none-/.test(n))return 2;if(any)return 1;return 0;};
 const best=[...wheels].sort((a,b)=>score(b)-score(a))[0];if(!best||!score(best))throw Error('No usable wheel among '+wheels.map(name).join(', '));
 if(rt.tags[0]==='manylinux'&&!/(manylinux|none-any)/.test(name(best)))throw Error('Not a Linux wheel: '+name(best));
 return {name:name(best),url:best.url,size:best.size,sha256:best.hashes?.sha256};
}
async function runtime(id,rt){
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'tyler-lock-'));
 const req=[`torch==${TORCH}+${rt.torch}`,`torchaudio==${TORCH}+${rt.torch}`,...REQUIREMENTS];
 if(id.startsWith('windows'))req.push('msvc-runtime'); // the C++ runtime DLLs PyTorch needs, next to python.exe
 fs.writeFileSync(path.join(dir,'req.in'),req.join('\n')+'\n');
 execFileSync('uv',['pip','compile','req.in','--python-platform',rt.platform,'--python-version',PYTHON.version.split('.').slice(0,2).join('.'),
  '--extra-index-url','https://download.pytorch.org/whl/'+rt.torch,'--index-strategy','unsafe-best-match','--only-binary',':all:','--exclude-newer',EXCLUDE_NEWER,'-o','pylock.toml','-q'],{cwd:dir,stdio:['ignore','inherit','inherit']});
 const lock=toml(path.join(dir,'pylock.toml'));const files=[];
 for(const p of lock.packages){
  if(p.marker&&/sys_platform == 'win32'/.test(p.marker)&&!id.startsWith('windows'))continue;
  if(p.marker&&/sys_platform == 'linux'/.test(p.marker)&&id.startsWith('windows'))continue;
  const w=pick(p.wheels,rt);
  // A few mirrored wheels on download.pytorch.org come without a published hash: hash the file itself.
  if(!w.sha256){const buf=await get(w.url,'buffer');w.sha256=sha(buf);w.size=buf.length;console.log('hashed',w.name);}
  if(!w.size)w.size=await head(w.url);
  files.push({kind:'wheel',package:p.name,version:p.version,...w});
 }
 const q=await get(`https://pypi.org/pypi/qwen-tts/${QWEN_TTS}/json`),qw=q.urls.find(u=>u.packagetype==='bdist_wheel');
 files.push({kind:'wheel',package:'qwen-tts',version:QWEN_TTS,name:qw.filename,url:qw.url,size:qw.size,sha256:qw.digests.sha256,noDeps:true});
 fs.rmSync(dir,{recursive:true,force:true});
 return {label:rt.label,dev:!!rt.dev,torch:TORCH+'+'+rt.torch,files};
}
async function model(key,m){
 const info=await get(`https://huggingface.co/api/models/${m.repo}`),rev=info.sha;
 const tree=await get(`https://huggingface.co/api/models/${m.repo}/tree/${rev}?recursive=true`),files=[];
 for(const e of tree){
  if(e.type==='directory'||/^(README\.md|\.gitattributes)$/.test(e.path))continue;
  const url=`https://huggingface.co/${m.repo}/resolve/${rev}/${e.path}`;
  let sha256=e.lfs?.oid;if(!sha256)sha256=sha(await get(url,'buffer'));
  files.push({kind:'model',path:e.path,url,size:e.lfs?.size??e.size,sha256});
 }
 return {...m,revision:rev,license:info.cardData?.license||null,files};
}
const pyUrl=`https://www.python.org/ftp/python/${PYTHON.version}/python-${PYTHON.version}-embed-amd64.zip`;
const pyZip=await get(pyUrl,'buffer');
// Microsoft's own Speech SDK 5.1 (it installs the original SAPI 5 voices Microsoft Sam, Mike and Mary).
// Offered as a separate, optional button; it runs Microsoft's installer, which asks Windows for permission.
const SDK_URL='https://download.microsoft.com/download/B/4/3/B4314928-7B71-4336-9DE7-6FA4CF00B7B3/SpeechSDK51.exe',sdk=await get(SDK_URL,'buffer');
const lock={format:1,engine:'1',created:new Date().toISOString().slice(0,10),excludeNewer:EXCLUDE_NEWER,
 extras:{speechSdk51:{kind:'installer',name:'SpeechSDK51.exe',url:SDK_URL,size:sdk.length,sha256:sha(sdk),page:'https://www.microsoft.com/en-us/download/details.aspx?id=10121'}},
 python:{version:PYTHON.version,windows:{kind:'python',name:path.basename(pyUrl),url:pyUrl,size:pyZip.length,sha256:sha(pyZip)}},
 runtimes:{},models:{}};
for(const [id,rt] of Object.entries(RUNTIMES))lock.runtimes[id]=await runtime(id,rt);
for(const [k,m] of Object.entries(MODELS))lock.models[k]=await model(k,m);
const out=path.join(root,'app','theme-voices','engine-lock.json');
fs.writeFileSync(out,JSON.stringify(lock,null,1)+'\n');
const total=files=>files.reduce((n,f)=>n+f.size,0),gb=n=>(n/1024**3).toFixed(2)+' GB';
for(const [id,r] of Object.entries(lock.runtimes))console.log(id.padEnd(13),r.files.length,'files',gb(total(r.files)));
for(const [k,m] of Object.entries(lock.models))console.log(k.padEnd(13),m.repo,m.revision.slice(0,10),gb(total(m.files)));
console.log('Wrote',path.relative(root,out));

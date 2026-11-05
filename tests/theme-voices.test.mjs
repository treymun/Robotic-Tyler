// v2.35 theme voices: the installer, the worker host and the service, with everything heavy MOCKED.
// No model, no PyTorch and no internet: downloads come from a local HTTP server, the "worker" is
// tests/fixtures/fake_voice_worker.py (same protocol, writes a tone instead of speech), and the PC's
// hardware is described by hand. Real model inference, the Windows install and Steam playback are
// tested separately (see CHANGES.md); none of that is claimed here.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';import path from 'node:path';import os from 'node:os';import http from 'node:http';import zlib from 'node:zlib';import crypto from 'node:crypto';
import {createRequire} from 'node:module';import {execFileSync} from 'node:child_process';
const require=createRequire(import.meta.url),root=path.resolve(import.meta.dirname,'..'),TV=path.join(root,'app','theme-voices');
const {Installer,plan,LOCK,lockHash,wheelPlace}=require(path.join(TV,'installer.cjs'));
const {extract,entries,safeJoin}=require(path.join(TV,'zip.cjs'));
const hardware=require(path.join(TV,'hardware.cjs'));
const {Voices,THEMES}=require(path.join(TV,'voices.cjs'));
const {ThemeVoices}=require(path.join(TV,'service.cjs'));
const GB=1024**3,sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const tmp=()=>fs.mkdtempSync(path.join(os.tmpdir(),'tyler-tv-'));
const python=(()=>{for(const p of ['python3','python'])try{execFileSync(p,['-c','print(1)'],{stdio:'ignore'});return p;}catch{}return null;})();

// A small ZIP writer (stored or deflated entries), for wheels and Python's embeddable zip.
function zip(files){
 const locals=[],central=[];let off=0;
 for(const [name,data,deflate=true] of files){
  const raw=Buffer.from(data),body=deflate?zlib.deflateRawSync(raw):raw,n=Buffer.from(name);
  const lh=Buffer.alloc(30);lh.writeUInt32LE(0x04034b50,0);lh.writeUInt16LE(20,4);lh.writeUInt16LE(deflate?8:0,8);lh.writeUInt32LE(body.length,18);lh.writeUInt32LE(raw.length,22);lh.writeUInt16LE(n.length,26);
  locals.push(lh,n,body);
  const ch=Buffer.alloc(46);ch.writeUInt32LE(0x02014b50,0);ch.writeUInt16LE(20,4);ch.writeUInt16LE(20,6);ch.writeUInt16LE(deflate?8:0,10);ch.writeUInt32LE(body.length,20);ch.writeUInt32LE(raw.length,24);ch.writeUInt16LE(n.length,28);ch.writeUInt32LE(off,42);
  central.push(ch,n);off+=30+n.length+body.length;
 }
 const cd=Buffer.concat(central),end=Buffer.alloc(22);end.writeUInt32LE(0x06054b50,0);end.writeUInt16LE(files.length,8);end.writeUInt16LE(files.length,10);end.writeUInt32LE(cd.length,12);end.writeUInt32LE(off,16);
 return Buffer.concat([...locals,cd,end]);
}
// A download server: Range requests, an optional cut-off on the first try, and a request log.
async function server(files,{cutFirst=false,lie=false}={}){
 const log=[];let cut=cutFirst;
 const s=http.createServer((req,res)=>{
  const body=files[req.url];log.push({url:req.url,range:req.headers.range||null});
  if(!body){res.writeHead(404);res.end();return;}
  const m=/bytes=(\d+)-/.exec(req.headers.range||''),start=m?Number(m[1]):0,chunk=body.subarray(start);
  res.writeHead(m?206:200,{'content-length':chunk.length,'accept-ranges':'bytes'});
  if(cut){cut=false;res.write(chunk.subarray(0,Math.floor(chunk.length/2)));setTimeout(()=>res.destroy(),20);return;}
  res.end(lie?Buffer.alloc(chunk.length,7):chunk);
 });
 await new Promise(r=>s.listen(0,'127.0.0.1',r));
 return {url:p=>'http://127.0.0.1:'+s.address().port+p,log,close:()=>new Promise(r=>s.close(r))};
}

test('the lock pins every file: python.org, PyPI/PyTorch and one Hugging Face commit per model, each with size and SHA-256',()=>{
 assert.match(LOCK.python.windows.url,/^https:\/\/www\.python\.org\/ftp\/python\/3\.13\.\d+\/python-3\.13\.\d+-embed-amd64\.zip$/);
 for(const [id,rt] of Object.entries(LOCK.runtimes))for(const f of rt.files){assert.match(f.sha256,/^[0-9a-f]{64}$/,f.name);assert.ok(f.size>0,f.name);assert.match(f.url,/^https:\/\/(files\.pythonhosted\.org|download(-r2)?\.pytorch\.org)\//,f.url);
  if(id.startsWith('windows'))assert.match(f.name,/(win_amd64|none-any)\.whl$/,f.name);}
 const names=rt=>LOCK.runtimes[rt].files.map(f=>f.package);
 assert.ok(names('windows-cuda').includes('torch')&&LOCK.runtimes['windows-cuda'].files.find(f=>f.package==='torch').version.endsWith('+cu128'));
 assert.ok(LOCK.runtimes['windows-cpu'].files.find(f=>f.package==='torch').version.endsWith('+cpu'));
 assert.ok(!names('windows-cuda').includes('gradio'),'the demo web page isn’t installed');
 // Packages that ship a native library in their platform wheel must use that wheel (the pure one lacks it).
 for(const rt of ['windows-cuda','windows-cpu'])for(const pkg of ['soundfile','numpy','torch','onnxruntime','scipy'])assert.match(LOCK.runtimes[rt].files.find(f=>f.package===pkg).name,/win_amd64\.whl$/,rt+' '+pkg);
 assert.match(LOCK.runtimes['windows-cuda'].files.find(f=>f.package==='msvc-runtime')?.name||'',/win_amd64\.whl$/,'the C++ runtime PyTorch needs');
 assert.ok(names('windows-cuda').includes('qwen-tts')&&LOCK.runtimes['windows-cuda'].files.find(f=>f.package==='qwen-tts').noDeps);
 for(const [k,m] of Object.entries(LOCK.models)){assert.match(m.revision,/^[0-9a-f]{40}$/);assert.match(m.repo,k==='quality'?/1\.7B-Base$/:/0\.6B-Base$/,'only Base (voice-cloning) models');
  for(const f of m.files){assert.match(f.sha256,/^[0-9a-f]{64}$/);assert.ok(f.url.includes('/resolve/'+m.revision+'/'),'pinned to the commit');}}
});
test('a plan explains the download and disk space; the speech tokenizer shared by both models is downloaded once',()=>{
 const one=plan({runtime:'windows-cuda',models:['quality']}),both=plan({runtime:'windows-cuda',models:['quality','light']});
 assert.ok(one.download>6*GB&&one.download<8*GB,(one.download/GB).toFixed(2));
 assert.ok(one.disk>one.download,'unpacking needs more than the download');
 const tok=both.files.filter(f=>f.path==='speech_tokenizer/model.safetensors');assert.equal(tok.length,2);assert.equal(tok.filter(f=>f.sameAs).length,1);
 assert.ok(both.download<one.download+LOCK.models.light.files.reduce((n,f)=>n+f.size,0),'the shared file isn’t counted twice');
 assert.notEqual(lockHash('windows-cuda'),lockHash('windows-cpu'));
});
test('ZIP: deflated and stored entries unpack; names that leave the folder are refused',async()=>{
 const dir=tmp(),file=path.join(dir,'t.zip');
 fs.writeFileSync(file,zip([['pkg/__init__.py','print(1)\n'],['pkg/data.bin',Buffer.alloc(5000,3),false],['../evil.txt','x'],['C:/evil.txt','x'],['pkg/../../evil2.txt','x']]));
 assert.equal((await entries(file)).length,5);
 const out=path.join(dir,'out');const r=await extract(file,n=>safeJoin(out,n));
 assert.equal(fs.readFileSync(path.join(out,'pkg/__init__.py'),'utf8'),'print(1)\n');assert.equal(fs.statSync(path.join(out,'pkg/data.bin')).size,5000);
 assert.equal(r.files,5);assert.ok(!fs.existsSync(path.join(dir,'evil.txt'))&&!fs.existsSync(path.join(dir,'evil2.txt')),'nothing outside the folder');
 // Wheel layout: NAME.data/platlib → packages, NAME.data/data → Python's folder, scripts skipped.
 const place=wheelPlace({},'/e/site','/e/python');
 assert.equal(place('torch/__init__.py'),path.resolve('/e/site/torch/__init__.py'));
 assert.equal(place('msvc_runtime-14.data/data/msvcp140.dll'),path.resolve('/e/python/msvcp140.dll'));
 assert.equal(place('x-1.data/platlib/x.pyd'),path.resolve('/e/site/x.pyd'));assert.equal(place('x-1.data/scripts/x.exe'),null);
});
test('downloads: verified, resumed after a cut-off (Range), a bad file is deleted and never used, offline copies and parts are used first',async()=>{
 const good=crypto.randomBytes(200000),f={name:'pkg-1.0-py3-none-any.whl',size:good.length,sha256:sha(good)};
 // 1. Cut off halfway, then resumed from where it stopped.
 let s=await server({'/a.whl':good},{cutFirst:true});
 const inst=new Installer({dir:tmp(),fetch:globalThis.fetch,workerDir:TV+'/worker'});
 const got=await inst.obtain({...f,url:s.url('/a.whl')},{});
 assert.equal(sha(fs.readFileSync(got)),f.sha256);
 assert.ok(s.log.some(l=>l.range&&/bytes=\d+-/.test(l.range)&&l.range!=='bytes=0-'),'resumed with a Range request: '+JSON.stringify(s.log));
 await s.close();
 // 2. A server that sends the wrong bytes: refused after retries, nothing left behind.
 s=await server({'/b.whl':good},{lie:true});
 const inst2=new Installer({dir:tmp(),fetch:globalThis.fetch,workerDir:TV+'/worker'});
 await assert.rejects(inst2.obtain({...f,url:s.url('/b.whl')},{}),/didn’t match its checksum/);
 assert.deepEqual(fs.readdirSync(inst2.downloads),[],'the bad download was deleted');await s.close();
 // 3. Offline bundle folder: a whole file, and a file in parts (NAME.001, NAME.002).
 const off=tmp();fs.writeFileSync(path.join(off,f.name),good);
 const inst3=new Installer({dir:tmp(),fetch:async()=>{throw Error('no network in this test');},workerDir:TV+'/worker'});
 assert.equal(sha(fs.readFileSync(await inst3.obtain({...f,url:'https://unused.invalid/'},{offline:[off]}))),f.sha256);
 const off2=tmp(),big={name:'model.safetensors',size:good.length,sha256:sha(good)};fs.writeFileSync(path.join(off2,'model.safetensors.001'),good.subarray(0,120000));fs.writeFileSync(path.join(off2,'model.safetensors.002'),good.subarray(120000));
 const inst4=new Installer({dir:tmp(),fetch:async()=>{throw Error('no network in this test');},workerDir:TV+'/worker'});
 assert.equal(sha(fs.readFileSync(await inst4.obtain({...big,url:'https://unused.invalid/'},{offline:[off2]}))),big.sha256);
 // A damaged offline file is ignored (then the web would be used).
 const off3=tmp();fs.writeFileSync(path.join(off3,f.name),Buffer.alloc(good.length,1));
 const inst5=new Installer({dir:tmp(),fetch:async()=>{throw Error('offline');},workerDir:TV+'/worker',retryDelay:()=>0});
 await assert.rejects(inst5.obtain({...f,url:'https://unused.invalid/'},{offline:[off3]}),/Couldn’t download|offline/);
});
test('offline bundle: a .tar split into parts is read across the part boundary; each file is checked; a damaged one is skipped',async()=>{
 const a=crypto.randomBytes(3000),b=crypto.randomBytes(5000),bad=crypto.randomBytes(700);
 const fa={name:'a-1.whl',size:a.length,sha256:sha(a)},fb={name:'quality/model.safetensors',size:b.length,sha256:sha(b)},fc={name:'c.whl',size:bad.length,sha256:'0'.repeat(64)};
 const hdr=(n,size)=>{const h=Buffer.alloc(512);h.write(n,0);h.write('0000644\0',100);h.write(size.toString(8).padStart(11,'0')+'\0',124);h.write('        ',148);h.write('0',156);h.write('ustar\0',257);let sum=0;for(const x of h)sum+=x;h.write(sum.toString(8).padStart(6,'0')+'\0 ',148);return h;};
 const pad=n=>Buffer.alloc((512-n%512)%512),ent=(f,data)=>[hdr(f.sha256.slice(0,16)+'-'+path.basename(f.name),data.length),data,pad(data.length)];
 const tar=Buffer.concat([hdr('README.txt',5),Buffer.from('hello'),pad(5),...ent(fa,a),...ent(fb,b),...ent(fc,bad),Buffer.alloc(1024)]);
 const folder=tmp();fs.writeFileSync(path.join(folder,'bundle.tar.001'),tar.subarray(0,4000));fs.writeFileSync(path.join(folder,'bundle.tar.002'),tar.subarray(4000,9000));fs.writeFileSync(path.join(folder,'bundle.tar.003'),tar.subarray(9000));
 const inst=new Installer({dir:tmp(),fetch:async()=>{throw Error('no network');},workerDir:TV+'/worker',retryDelay:()=>0});
 assert.equal(await inst.unbundle(folder,[fa,fb,fc]),2,'two good files, the damaged one refused');
 assert.equal(sha(fs.readFileSync(await inst.obtain({...fa,url:'x'},{}))),fa.sha256);assert.equal(sha(fs.readFileSync(await inst.obtain({...fb,url:'x'},{}))),fb.sha256);
 await assert.rejects(inst.obtain({...fc,url:'https://unused.invalid/'},{}),/Couldn’t download/,'the damaged one would be downloaded instead');
 fs.rmSync(path.join(folder,'bundle.tar.003'));const inst2=new Installer({dir:tmp(),fetch:async()=>{throw Error('no network');},workerDir:TV+'/worker',retryDelay:()=>0});
 await assert.rejects(inst2.unbundle(folder,[fa,fb]),/incomplete/,'a missing part is reported');
});
test('install: an isolated engine folder (embeddable Python + packages), Python told where its packages are, state written last; Stop keeps the downloads',async()=>{
 const py=zip([['python313._pth','python313.zip\n.\n#import site\n'],['python.exe','MZ'],['python313.zip','PK']]),wheel=zip([['demo/__init__.py','X=1\n'],['demo-1.0.dist-info/RECORD','demo/__init__.py,sha256=x,4\n'],['demo-1.0.data/data/msvcp140.dll','dll']]);
 const s=await server({'/py.zip':py,'/demo.whl':wheel});
 const dir=tmp(),workerDir=tmp();fs.writeFileSync(path.join(workerDir,'tyler_voice_worker.py'),'# worker\n');
 const inst=new Installer({dir,fetch:globalThis.fetch,workerDir});
 const p={runtime:'windows-cpu',models:[],lock:'0123456789ab',download:py.length+wheel.length,disk:1000,files:[
  {kind:'python',name:'python-3.13-embed-amd64.zip',url:s.url('/py.zip'),size:py.length,sha256:sha(py),group:'runtime'},
  {kind:'wheel',package:'demo',name:'demo-1.0-py3-none-any.whl',url:s.url('/demo.whl'),size:wheel.length,sha256:sha(wheel),group:'runtime'}]};
 // Stop part-way: nothing is marked installed.
 const ctl=new AbortController();ctl.abort();
 await assert.rejects(inst.install(p,{signal:ctl.signal}),/Cancelled/);assert.equal(inst.state(),null);
 const phases=new Set();const st=await inst.install(p,{onProgress:e=>phases.add(e.phase)});
 const engine=path.join(dir,st.engine);
 assert.deepEqual([...phases].filter(x=>['download','unpack','done'].includes(x)),['download','unpack','done']);
 assert.equal(fs.readFileSync(path.join(engine,'site','demo','__init__.py'),'utf8'),'X=1\n');
 assert.ok(fs.existsSync(path.join(engine,'python','msvcp140.dll')),'C++ runtime next to python.exe');
 assert.deepEqual(fs.readFileSync(path.join(engine,'python','python313._pth'),'utf8').split('\r\n').filter(Boolean),['python313.zip','.','..\\site','..\\worker','import site']);
 assert.ok(fs.existsSync(path.join(engine,'worker','tyler_voice_worker.py')));
 assert.equal(inst.python(),path.join(engine,'python','python.exe'));
 await s.close();
});
test('updates: unchanged packages are copied from the installed engine (no new download); a failed update leaves the working engine as it was',async()=>{
 const py=zip([['python313._pth','python313.zip\n.\n'],['python.exe','MZ']]);
 const whl=(name,ver,body)=>zip([[name+'/__init__.py',body],[name+'-'+ver+'.dist-info/RECORD',name+'/__init__.py,sha256=x,'+body.length+'\n'+name+'-'+ver+'.dist-info/RECORD,,\n']]);
 const demo=whl('demo','1.0','A=1\n'),extra=whl('extra','2.0','B=2\n');
 const s=await server({'/py.zip':py,'/demo-1.0-py3-none-any.whl':demo,'/extra-2.0-py3-none-any.whl':extra});
 const dir=tmp(),workerDir=tmp();fs.writeFileSync(path.join(workerDir,'tyler_voice_worker.py'),'#\n');
 const inst=new Installer({dir,fetch:globalThis.fetch,workerDir,retryDelay:()=>0});
 const F={py:{kind:'python',name:'python-3.13-embed-amd64.zip',url:s.url('/py.zip'),size:py.length,sha256:sha(py),group:'runtime'},
  demo:{kind:'wheel',package:'demo',version:'1.0',name:'demo-1.0-py3-none-any.whl',url:s.url('/demo-1.0-py3-none-any.whl'),size:demo.length,sha256:sha(demo),group:'runtime'},
  extra:{kind:'wheel',package:'extra',version:'2.0',name:'extra-2.0-py3-none-any.whl',url:s.url('/extra-2.0-py3-none-any.whl'),size:extra.length,sha256:sha(extra),group:'runtime'}};
 const P=(lock,files)=>({runtime:'windows-cpu',models:[],lock,files,download:files.reduce((n,f)=>n+f.size,0),disk:1000});
 await inst.install(P('aaaaaaaaaaaa',[F.py,F.demo]));
 s.log.length=0;
 const next=P('bbbbbbbbbbbb',[F.py,F.demo,F.extra]),need=inst.needs(next);
 assert.equal(need.download,extra.length,'only the changed package is downloaded');assert.ok(need.reused>0);
 const st=await inst.install(next);
 assert.deepEqual(s.log.map(l=>l.url),['/extra-2.0-py3-none-any.whl']);
 const e=path.join(dir,st.engine);assert.equal(fs.readFileSync(path.join(e,'site','demo','__init__.py'),'utf8'),'A=1\n');assert.ok(fs.existsSync(path.join(e,'python','python.exe')));
 assert.ok(!fs.existsSync(path.join(dir,'engine-aaaaaaaaaaaa')),'the old engine folder is tidied once the new one works');
 assert.equal(inst.needs(next).download,0,'installing again (or adding a model) doesn’t download the engine again');
 // A failed update: the working engine and its state stay.
 const broken={...F.extra,name:'extra-3.0-py3-none-any.whl',version:'3.0',url:s.url('/missing.whl'),sha256:'1'.repeat(64)};
 await assert.rejects(inst.install(P('cccccccccccc',[F.py,F.demo,broken])),/Couldn’t download/);
 assert.equal(inst.state().engine,'engine-bbbbbbbbbbbb');assert.equal(inst.status().current,true,'still usable');
 assert.ok(fs.existsSync(path.join(dir,'engine-bbbbbbbbbbbb','site','extra','__init__.py')));
 // Remove: engine and models go; the owner's recordings and saved clips stay.
 fs.mkdirSync(path.join(dir,'custom-voices','portal'),{recursive:true});fs.writeFileSync(path.join(dir,'custom-voices','portal','voice.json'),'{}');fs.mkdirSync(path.join(dir,'saved'));fs.writeFileSync(path.join(dir,'saved','a.wav'),'x');
 await inst.remove();assert.equal(inst.state(),null);assert.deepEqual(fs.readdirSync(dir).sort(),['custom-voices','saved']);
 await s.close();
});
test('hardware: the suggestion follows the PC (no assumptions) and spells out why; drivers are never changed',()=>{
 const pc=(gpus,ramGB=16)=>({os:{platform:'win32'},cpu:{model:'CPU',threads:16},ram:{total:ramGB*GB,free:8*GB},gpus,disk:{free:100*GB}});
 let r=hardware.recommend(pc([{vendor:'NVIDIA',name:'NVIDIA GeForce RTX 5070 Ti Laptop GPU',vramTotal:12*GB,vramFree:11*GB,driver:'581.57',capability:12}]));
 assert.equal(r.mode,'quality');assert.equal(r.device,'cuda');
 r=hardware.recommend(pc([{vendor:'NVIDIA',name:'RTX 3050',vramTotal:4*GB,vramFree:3.5*GB,driver:'581.57',capability:8.6}]));
 assert.equal(r.mode,'light');assert.equal(r.device,'cuda');assert.match(r.notes.join(' '),/Lightweight mode fits/);
 r=hardware.recommend(pc([{vendor:'NVIDIA',name:'GTX 1060',vramTotal:6*GB,vramFree:5*GB,driver:'581.57',capability:6.1}]));
 assert.equal(r.device,'cpu');assert.match(r.notes.join(' '),/too old/);
 r=hardware.recommend(pc([{vendor:'NVIDIA',name:'RTX 4070',vramTotal:12*GB,vramFree:11*GB,driver:'552.22',capability:8.9}]));
 assert.equal(r.device,'cpu');assert.ok(r.driverTooOld);assert.match(r.notes.join(' '),/570\.65 or newer.*never changes drivers/);
 r=hardware.recommend(pc([{vendor:'AMD',name:'AMD Radeon RX 7800 XT'}],8));
 assert.equal(r.device,'cpu');assert.equal(r.mode,'light');assert.match(r.notes.join(' '),/Radeon.*NVIDIA/);assert.match(r.notes.join(' '),/much longer than it lasts/);
 r=hardware.recommend(pc([{vendor:'NVIDIA',name:'RTX 4090',vramTotal:24*GB,vramFree:2*GB,driver:'581.57',capability:8.9}]));
 assert.equal(r.mode,'quality');assert.match(r.notes.join(' '),/only 2\.0 GB of graphics memory is free/);
});
test('voices: all 25 themes, honest status for Rust and Ricochet, owner replacements kept separately and audio only',()=>{
 const data=tmp(),v=new Voices({builtinDir:path.join(TV,'voices'),dataDir:data});
 const list=v.list();assert.equal(list.length,25);assert.deepEqual(list.map(x=>x.theme),THEMES);
 assert.equal(list.find(x=>x.theme==='rust').status,'missing');assert.equal(list.find(x=>x.theme==='ricochet').status,'insufficient');
 assert.ok(!list.find(x=>x.theme==='rust').hasReference&&!list.find(x=>x.theme==='ricochet').hasReference,'no stand-in voice');
 for(const t of THEMES.filter(t=>!['rust','ricochet'].includes(t))){const p=v.get(t);assert.ok(p.refPath&&fs.existsSync(p.refPath),t);assert.ok(p.transcript&&p.transcript.length>5,t);assert.equal(p.backend,'qwen3-tts-12hz-base');assert.ok(p.sources.length,t);}
 assert.equal(v.get('winxp').native?.sapi,'Microsoft Sam');assert.equal(v.get('msn').native?.sapi,'Microsoft Mary');
 assert.throws(()=>v.setCustom('portal',{data:Buffer.from('#!/bin/sh\nrm -rf /\n'.repeat(400)).toString('base64'),fileName:'x.wav'}),/isn’t an audio recording/);
 assert.throws(()=>v.setCustom('portal',{data:'AAAA',fileName:'model.pkl'}),/WAV, FLAC, MP3 or OGG/);
 const wav=Buffer.concat([Buffer.from('RIFF'),Buffer.alloc(8000,1)]);
 const c=v.setCustom('portal',{data:wav.toString('base64'),fileName:'mine.wav',transcript:'Hello there.'});
 assert.equal(c.status,'custom');assert.ok(c.refPath.startsWith(data));assert.equal(v.get('portal').transcript,'Hello there.');
 assert.notEqual(v.key(v.get('portal')),v.key(v.builtin('portal')),'a new reference makes a new voice key (old cache not reused)');
 v.removeCustom('portal');assert.equal(v.get('portal').status,v.builtin('portal').status);
});

// ── the service, with the mocked worker ─────────────────────────────────
function fakeInstall({theme='portal',free=30*GB}={}){
 const dir=tmp(),app=tmp();
 fs.cpSync(path.join(TV,'voices'),path.join(app,'voices'),{recursive:true});
 fs.mkdirSync(path.join(app,'worker'));fs.copyFileSync(path.join(root,'tests','fixtures','fake_voice_worker.py'),path.join(app,'worker','tyler_voice_worker.py'));
 const engine='engine-'+lockHash('linux-cpu');fs.mkdirSync(path.join(dir,engine,'site'),{recursive:true});fs.writeFileSync(path.join(dir,engine,'ok'),'x');
 const mdir='quality-'+LOCK.models.quality.revision.slice(0,12);fs.mkdirSync(path.join(dir,'models',mdir),{recursive:true});
 fs.writeFileSync(path.join(dir,'installed.json'),JSON.stringify({format:1,engine,runtime:'linux-cpu',lock:lockHash('linux-cpu'),models:{quality:{dir:mdir,revision:LOCK.models.quality.revision}},python}));
 let saved={mode:'quality'},active=theme;
 const hw={os:{platform:'linux'},cpu:{model:'Test CPU',threads:4},ram:{total:32*GB,free:30*GB},gpus:[],disk:{free:50*GB},at:Date.now()};
 const svc=new ThemeVoices({dataDir:dir,appDir:app,fetch:async()=>{throw Error('no network');},getSettings:async()=>saved,setSettings:async v=>{saved=v;},theme:async()=>active,detect:async()=>hw,python,freemem:()=>free});
 return {svc,dir,setTheme:t=>{active=t;},settings:()=>saved};
}
test('service (mocked worker): a message is made once and then comes from the cache; the theme voice is captured when the request starts',{skip:!python&&'needs python3'},async()=>{
 const {svc,setTheme}=fakeInstall();
 try{
  const a=await svc.speak({text:'Hello from the test.'});assert.equal(a.theme,'portal');assert.equal(a.cached,false);assert.ok(fs.existsSync(a.file));
  assert.equal(svc.worker.stderrTail.some(l=>/noise from a library/.test(l)),true,'library output went to the log, not into the protocol');
  const b=await svc.speak({text:'Hello from the test.'});assert.equal(b.cached,true);assert.equal(b.file,a.file);
  // Two requests; the theme changes between them: each keeps the voice it started with.
  const p1=svc.speak({text:'SLOW first'});await new Promise(r=>setTimeout(r,30));setTheme('cs16');const p2=svc.speak({text:'second'});
  const [c1,c2]=await Promise.all([p1,p2]);assert.equal(c1.theme,'portal');assert.equal(c2.theme,'cs16');
  assert.equal((await svc.speak({text:'Explicit voice',theme:'l4d'})).theme,'l4d');
  await assert.rejects(svc.speak({text:'x'.repeat(401)}),/too long/);
  await assert.rejects(svc.speak({text:'Say it',theme:'rust'}),e=>e.code==='no_reference'&&/No usable Scientist recordings/.test(e.message));
 }finally{await svc.shutdown();}
});
test('service (mocked worker): Stop cancels the voice being made and the queue; the queue holds four; a crash or out-of-memory is explained and the next request starts a new engine',{skip:!python&&'needs python3'},async()=>{
 const {svc,settings}=fakeInstall();
 try{
  const outcome=p=>p.then(()=>'made',e=>e.code);
  const first=outcome(svc.speak({text:'SLOW one'})),waiting=['two','three','four','five'].map(t=>outcome(svc.speak({text:t})));
  await assert.rejects(svc.speak({text:'six'}),e=>e.code==='busy');
  await new Promise(r=>setTimeout(r,250));
  const stopped=await svc.stop();assert.equal(stopped.stopped,true);assert.equal(stopped.dropped,4);
  assert.equal(await first,'cancelled');assert.deepEqual(await Promise.all(waiting),['cancelled','cancelled','cancelled','cancelled']);
  await assert.rejects(svc.speak({text:'OOM'}),e=>e.code==='out_of_memory');
  assert.equal(settings().mode,'quality','never switched to Lightweight by itself');
  await assert.rejects(svc.speak({text:'CRASH'}),e=>e.code==='crashed');
  const ok=await svc.speak({text:'after the crash'});assert.ok(fs.existsSync(ok.file),'a new engine started');
  // Idle: the engine closes and gives its memory back.
  await new Promise(r=>setTimeout(r,100));assert.ok(svc.worker?.alive);svc.scheduleIdle({idleMinutes:0.002});await new Promise(r=>setTimeout(r,900));assert.equal(svc.worker,null);assert.equal(svc.loaded,null);
 }finally{await svc.shutdown();}
});
test('service: not enough free memory or graphics memory is explained (Lightweight is suggested, not used)',async()=>{
 const low=fakeInstall({free:2*GB});
 await assert.rejects(low.svc.speak({text:'hi'}),e=>e.code==='low_memory'&&/needs about 7\.5 GB of free memory and 2\.0 GB is free/.test(e.message));
 assert.equal(low.settings().mode,'quality');await low.svc.shutdown();
 const {svc}=fakeInstall();
 svc.hw=null;svc.detectFn=async()=>({os:{},cpu:{model:'x',threads:8},ram:{total:16*GB,free:8*GB},gpus:[{vendor:'NVIDIA',name:'RTX 5070 Ti',vramTotal:12*GB,vramFree:1.5*GB,driver:'581.57',capability:12}],disk:{},at:Date.now()});
 await assert.rejects(svc.roomFor('quality','cuda'),e=>e.code==='low_vram'&&/1\.5 GB is free.*a game may be using it.*Lightweight mode/.test(e.message));
 await svc.shutdown();
});
test('Chrome: theme-voice requests say the feature lives in the desktop app (no engine, nothing else used instead)',async()=>{
 const store={};let listener;
 globalThis.chrome={action:{onClicked:{addListener(){}}},runtime:{onMessage:{addListener:fn=>{listener=fn;}},openOptionsPage(){}},storage:{local:{get:async()=>({}),set:async v=>Object.assign(store,v),remove:async()=>{},setAccessLevel:async()=>{}},session:{get:async()=>({}),set:async()=>{},remove:async()=>{}},onChanged:{addListener(){}}},tabs:{get:async id=>({id}),query:async()=>[],sendMessage:async()=>{},update:async()=>({}),onRemoved:{addListener(){}}}};
 globalThis.fetch=async()=>{throw Error('no fetch expected');};
 await import('../browser-extension/background.js?tv');
 const ask=m=>new Promise(r=>listener(m,{tab:{id:3},url:'https://steamcommunity.com/chat/'},r));
 const r=await ask({type:'voices:status'});assert.equal(r.ok,true);assert.equal(r.available,false);assert.match(r.reason,/desktop app/);
 const s=await ask({type:'voices:speak',text:'hi'});assert.equal(s.available,false);
});
test('the chat command: !say TEXT and !say THEME: TEXT, owned by theme voices (so the AI never answers it)',async()=>{
 const vm=await import('node:vm'),box={console};box.globalThis=box;
 vm.runInNewContext(fs.readFileSync(path.join(root,'browser-extension','commands.js'),'utf8'),box);
 const fake={parse:l=>{const m=/^\s*!say\s+(?:([a-z0-9]{2,12}):\s*)?(\S[\s\S]{0,399})$/i.exec(l);return m?{theme:m[1]||null,text:m[2]}:null;}};box.TylerThemeVoices=fake;
 assert.equal(box.TylerCommands.owner('!say hello there'),'theme-voices');assert.equal(box.TylerCommands.owner('!say portal: the cake'),'theme-voices');
 assert.ok(box.TylerCommands.claims('!say hi'));
 // The panel's own parser (the real one) agrees.
 const src=fs.readFileSync(path.join(root,'browser-extension','theme-voices.js'),'utf8');assert.match(src,/function parse\(line\)\{const m=\/\^\\s\*!say\\s\+\(\?:\(\[a-z0-9\]\{2,12\}\):\\s\*\)\?/);
});

// ── the Steam panel card (theme-voices.js), with a MOCKED page and background ─────────────────
async function card({voiceOn=true,chat=false,seconds=2}={}){
 const vm=await import('node:vm');
 const els=new Map(),el=id=>{if(!els.has(id))els.set(id,{id,textContent:'',value:'',checked:false,disabled:false,hidden:false,dataset:{},options:[],onclick:null,onchange:null,replaceChildren(...k){this.options=k;},append(){},addEventListener(){},focus(){}});return els.get(id);};
 el('tvFollow').checked=true;
 const bridged=[],requests=[],sent=[];let theme='portal',observer=null;
 // A WAV of the asked length (24 kHz, 16-bit mono), as the engine sends it.
 const wav=s=>{const n=Math.round(24000*s)*2,b=Buffer.alloc(44+n);b.write('RIFF',0);b.writeUInt32LE(36+n,4);b.write('WAVEfmt ',8);b.writeUInt32LE(16,16);b.writeUInt16LE(1,20);b.writeUInt16LE(1,22);b.writeUInt32LE(24000,24);b.writeUInt32LE(48000,28);b.writeUInt16LE(2,32);b.writeUInt16LE(16,34);b.write('data',36);b.writeUInt32LE(n,40);return b.toString('base64');};
 const voices=[{theme:'portal',name:'GLaDOS',status:'ready',statusLabel:'Ready',hasReference:true},{theme:'cs16',name:'CS 1.6 radio operator',status:'ready',statusLabel:'Ready',hasReference:true},{theme:'rust',name:'Scientist',status:'missing',statusLabel:'No usable recordings yet',hasReference:false}];
 const status={ready:true,installed:true,current:true,modeLabel:'Quality',mode:'quality',settings:{followTheme:true,chat,chatAccess:'everyone',chatCooldown:20}};
 const api={getFeatureMount:()=>({append(){}}),getTheme:()=>theme,bridge:(type,extra)=>bridged.push({type,...extra}),getVoiceState:()=>({enabled:voiceOn}),send:t=>sent.push(t),onPause(){},isAiPaused:()=>false,
  getRegion:()=>({isConnected:true,querySelectorAll:()=>[]}),getSample:()=>({isConnected:true}),ui:{onUI(){}}};
 const box={console,setInterval:()=>1,setTimeout:fn=>{Promise.resolve().then(fn);return 1;},Uint8Array,DataView,atob:s=>Buffer.from(s,'base64').toString('latin1'),btoa:s=>Buffer.from(s,'latin1').toString('base64'),String,Date,
  document:{createElement:()=>({set innerHTML(v){},querySelector:s=>el(s.slice(1)),addEventListener(){},dataset:{}})},
  MutationObserver:class{constructor(fn){observer=fn;}observe(){}disconnect(){}},TylerCompanion:api,TylerSelection:{selector:()=>'.msg'},TylerChatTag:{own:()=>false},TylerIdentity:{identify:n=>n.who,meta:n=>n.meta},TylerCommands:{set(){}},
  chrome:{runtime:{sendMessage:async m=>{requests.push(m);if(m.type==='voices:status')return {ok:true,available:true,status,voices};if(m.type==='voices:speak')return {ok:true,clip:{id:'v1',text:m.text,theme:m.theme,voiceName:voices.find(v=>v.theme===m.theme)?.name,seconds,ms:900,cached:false,mode:'quality',device:'cuda',status:'ready'},audio:wav(seconds)};return {ok:true};}}}};
 box.globalThis=box;vm.runInNewContext(fs.readFileSync(path.join(root,'browser-extension','theme-voices.js'),'utf8'),box);
 const settle=async()=>{for(let i=0;i<15;i++)await new Promise(r=>setImmediate(r));};await settle();
 return {el,bridged,requests,sent,settle,setTheme:t=>{theme=t;},box,post:async(text,id,name,key)=>{observer?.([{addedNodes:[{nodeType:1,innerText:text,matches:()=>true,querySelectorAll:()=>[],closest:()=>null,who:{id,name},meta:{key,at:Date.now()+1e6}}]}]);await settle();}};
}
test('panel card (mocked): the voice is taken from the theme when you press the button; Play into call queues on Tyler’s synthetic microphone; Preview stays local',async()=>{
 const c=await card();
 c.el('tvText').value='The cake is a lie.';c.el('tvCall').onclick();await c.settle();
 const speak=c.requests.find(r=>r.type==='voices:speak');assert.equal(speak.theme,'portal');assert.equal(speak.purpose,'call');
 assert.deepEqual(c.bridged.map(b=>[b.type,b.queue]),[['audio',true]],'queued after anything Tyler is already saying (no overlap)');
 c.setTheme('cs16');c.el('tvText').value='Fire in the hole!';c.el('tvPreview').onclick();await c.settle();
 assert.equal(c.requests.filter(r=>r.type==='voices:speak').at(-1).theme,'cs16','the theme at the time of the request');
 assert.equal(c.bridged.at(-1).type,'preview');
 c.el('tvStop').onclick();await c.settle();assert.ok(c.requests.some(r=>r.type==='voices:stop'));assert.equal(c.bridged.at(-1).type,'stop');
});
test('panel card (mocked): not in a call → nothing is played and it says what to do; a message over 30 s plays as consecutive parts',async()=>{
 const off=await card({voiceOn:false});off.el('tvText').value='Hello';off.el('tvCall').onclick();await off.settle();
 assert.equal(off.bridged.length,0);assert.match(off.el('tvStatus').textContent,/Join the voice channel with Tyler first/);
 const long=await card({seconds:61});long.el('tvText').value='A long message';long.el('tvCall').onclick();await long.settle();
 assert.equal(long.bridged.filter(b=>b.type==='audio').length,3,'61 s → three parts under the 30-second clip limit');
 for(const b of long.bridged){const bin=Buffer.from(b.audio,'base64');assert.equal(bin.toString('latin1',0,4),'RIFF');assert.ok(bin.readUInt32LE(40)/48000<=29.01);}
});
test('panel card (mocked): !say works only when the owner turned it on, with a cooldown per person',async()=>{
 const off=await card({chat:false});await off.post('!say hello','76561198000000001','Alex','k1');assert.equal(off.requests.filter(r=>r.type==='voices:speak').length,0);
 const on=await card({chat:true});on.box.TylerThemeVoices.refresh&&await on.box.TylerThemeVoices.refresh();
 await on.box.TylerThemeVoices.say('direct',undefined).catch(()=>{});
 const before=on.requests.filter(r=>r.type==='voices:speak').length;
 assert.equal(on.box.TylerThemeVoices.parse('!say cs16: Fire in the hole!').theme,'cs16');assert.equal(on.box.TylerThemeVoices.parse('!saything'),null);
 assert.ok(before>=1);
});

// v2.44 "sharper voice": optional kNN-VC voice conversion for Medic, Lash and Kelvin. Everything here is MOCKED:
// the download comes from a local HTTP server with small stand-in files (the lock's sizes and hashes are swapped
// for theirs during the test), and the worker is tests/fixtures/fake_voice_worker.py (no WavLM, no vocoder).
// The real conversion (the app's own worker and the real checkpoints) was run separately on Linux: see the notes.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';import path from 'node:path';import os from 'node:os';import http from 'node:http';import crypto from 'node:crypto';
import {createRequire} from 'node:module';import {execFileSync} from 'node:child_process';
const require=createRequire(import.meta.url),root=path.resolve(import.meta.dirname,'..'),TV=path.join(root,'app','theme-voices');
const {Installer,LOCK,lockHash}=require(path.join(TV,'installer.cjs'));
const {ThemeVoices}=require(path.join(TV,'service.cjs'));
const {WorkerHost}=require(path.join(TV,'worker.cjs'));
const {Characters,allClips,sharperOf}=require(path.join(TV,'characters.cjs'));
const {THEMES}=require(path.join(TV,'voices.cjs'));
const GB=1024**3,sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const tmp=()=>fs.mkdtempSync(path.join(os.tmpdir(),'tyler-sharp-'));
const python=(()=>{for(const p of ['python3','python'])try{execFileSync(p,['-c','print(1)'],{stdio:'ignore'});return p;}catch{}return null;})();
const CATALOG=JSON.parse(fs.readFileSync(path.join(TV,'characters.json'),'utf8'));
const OFFERED=['deadlock/kelvin','deadlock/lash','tf2/medic'];

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
/** Swaps the lock's component files for small stand-ins (same names) during fn, then puts the real ones back. */
async function withStandIns(fn){
 const real=LOCK.components.knnvc.files,blobs=real.map(()=>crypto.randomBytes(150000+Math.floor(Math.random()*1000)));
 const s=await server(Object.fromEntries(real.map((f,i)=>['/'+f.path,blobs[i]])),{cutFirst:true});
 LOCK.components.knnvc.files=real.map((f,i)=>({...f,url:s.url('/'+f.path),size:blobs[i].length,sha256:sha(blobs[i])}));
 try{return await fn({blobs,server:s});}finally{LOCK.components.knnvc.files=real;await s.close();}
}

test('v2.44 lock: voice conversion is one optional component pinned to the kNN-VC v0.1 release (two files, sizes, SHA-256), about 1.33 GB; the engine lock is unchanged',()=>{
 const c=LOCK.components.knnvc;
 assert.equal(c.release,'v0.1');assert.equal(c.repo,'bshall/knn-vc');assert.match(c.revision,/^[0-9a-f]{40}$/);
 assert.deepEqual(c.files.map(f=>f.path),['WavLM-Large.pt','prematch_g_02500000.pt']);
 for(const f of c.files){assert.match(f.sha256,/^[0-9a-f]{64}$/);assert.equal(f.url,'https://github.com/bshall/knn-vc/releases/download/v0.1/'+f.path);}
 assert.equal(c.files[0].sha256,'6fb4b3c3e6aa567f0a997b30855859cb81528ee8078802af439f7b2da0bf100f');assert.equal(c.files[1].sha256,'f924c7632c6eaf99004386d62293e124419e33582573552a6ae976eb88ed2dd5');
 const total=c.files.reduce((n,f)=>n+f.size,0);assert.equal(total,1328180068);assert.ok(Math.abs(total/1e9-1.33)<0.01,'about 1.33 GB');
 assert.deepEqual(c.settings,{k:4,layer:6,vocoder:'prematched',sampleRate:16000,vad:7});
 assert.match(c.licenses['WavLM-Large.pt'],/Attribution-ShareAlike 3\.0/);assert.match(c.licenses['prematch_g_02500000.pt'],/^MIT/);
 // The engine's identity doesn't include components, so adding one never asks for an engine update.
 const {components,...rest}=LOCK;assert.equal(lockHash('linux-cpu'),crypto.createHash('sha256').update(JSON.stringify([rest.engine,rest.python,rest.runtimes['linux-cpu']])).digest('hex').slice(0,12));
 // The worker loads both checkpoints with weights_only=True and never downloads code: the vendored files say where they come from.
 const w=fs.readFileSync(path.join(TV,'worker','tyler_voice_worker.py'),'utf8').split('\n').filter(l=>!/^\s*#/.test(l)).join('\n');
 assert.equal((w.match(/torch\.load\(/g)||[]).length,2,'two checkpoint loads in the code');assert.equal((w.match(/torch\.load\([^)]*weights_only=True[^)]*\)/g)||[]).length,2,'both weights_only');
 for(const f of ['knnvc_wavlm.py','knnvc_hifigan.py']){const t=fs.readFileSync(path.join(TV,'worker',f),'utf8'),code=t.split('\n').filter(l=>!/^\s*#/.test(l)).join('\n');assert.match(t,/MIT License/);assert.match(t,/bshall\/knn-vc/);assert.doesNotMatch(code,/torch\.load\(|urllib|requests\.get|hub\.load|pickle/);}
});

test('v2.44 component (MOCKED download): resumed after a cut-off, a bad download is refused, nothing installs by itself; Remove deletes only it and keeps everything else',async()=>{
 await withStandIns(async({blobs,server:s})=>{
  const dir=tmp(),inst=new Installer({dir,fetch:globalThis.fetch,workerDir:path.join(TV,'worker'),retryDelay:()=>0});
  // Things that must survive Remove: the engine's state, settings live elsewhere, the owner's recordings and saved clips.
  fs.writeFileSync(path.join(dir,'installed.json'),'{"format":1}');fs.mkdirSync(path.join(dir,'custom-voices','portal'),{recursive:true});fs.mkdirSync(path.join(dir,'saved'));
  assert.deepEqual(inst.componentStatus('knnvc'),{installed:false,current:false,dir:null,bytes:blobs[0].length+blobs[1].length,partial:0,installedAt:null});
  const p=inst.componentPlan('knnvc');assert.equal(p.download,blobs[0].length+blobs[1].length);assert.deepEqual(p.files.map(f=>f.name),['knnvc/WavLM-Large.pt','knnvc/prematch_g_02500000.pt']);
  const events=[];await inst.installComponent('knnvc',{onProgress:e=>events.push(e.phase)});
  assert.ok(s.log.some(l=>l.range&&l.range!=='bytes=0-'),'the cut-off download resumed with a Range request');
  const st=inst.componentStatus('knnvc');assert.equal(st.current,true);assert.equal(events.at(-1),'done');
  for(const [i,f] of LOCK.components.knnvc.files.entries())assert.equal(sha(fs.readFileSync(path.join(st.dir,f.path))),sha(blobs[i]));
  assert.deepEqual(fs.readdirSync(inst.downloads),[],'nothing left in downloads');
  assert.deepEqual((await inst.verifyComponent('knnvc')).damaged,[]);
  // A changed file is found by Check and repair.
  fs.writeFileSync(path.join(st.dir,'prematch_g_02500000.pt'),Buffer.alloc(blobs[1].length,1));assert.deepEqual((await inst.verifyComponent('knnvc')).damaged.map(d=>d.path),['prematch_g_02500000.pt']);
  // Remove: only the component (its folder, record and partial downloads); the rest stays.
  fs.writeFileSync(path.join(inst.downloads,LOCK.components.knnvc.files[0].sha256.slice(0,16)+'-WavLM-Large.pt.partial'),'x');
  assert.deepEqual(await inst.removeComponent('knnvc'),{removed:true});assert.equal(inst.componentStatus('knnvc').installed,false);
  assert.ok(fs.existsSync(path.join(dir,'installed.json'))&&fs.existsSync(path.join(dir,'custom-voices','portal'))&&fs.existsSync(path.join(dir,'saved')));
  assert.deepEqual(fs.readdirSync(path.join(dir,'components')),[]);assert.deepEqual(fs.readdirSync(inst.downloads),[]);
 });
 await withStandIns(async({server:s})=>{
  // A server that sends the wrong bytes: refused, nothing placed.
  const real=LOCK.components.knnvc.files;const bad=await server(Object.fromEntries(real.map(f=>['/'+f.path,Buffer.alloc(f.size,7)])));
  LOCK.components.knnvc.files=real.map(f=>({...f,url:bad.url('/'+f.path)}));
  const inst=new Installer({dir:tmp(),fetch:globalThis.fetch,workerDir:path.join(TV,'worker'),retryDelay:()=>0});
  await assert.rejects(inst.installComponent('knnvc'),/didn’t match its checksum|Couldn’t download/);
  assert.equal(inst.componentStatus('knnvc').installed,false);await bad.close();
 });
});

test('v2.44 catalog: only Medic, Lash and Kelvin offer it; their matching sets are their own built-in recordings (60 clips, checked by size and SHA-256), none another character\'s',()=>{
 const c=new Characters({dataDir:tmp(),catalogFile:path.join(TV,'characters.json'),themes:THEMES,bundledDir:path.join(TV,'characters')});
 assert.deepEqual(c.sharperIds().sort(),OFFERED);
 assert.deepEqual(CATALOG.characters.filter(x=>sharperOf(x)).map(x=>x.theme+'/'+x.id).sort(),OFFERED,'Venator and the rest: no');
 const sizes={};const owner=new Map();for(const x of CATALOG.characters)for(const y of allClips(x))owner.set(y.sha256,x.theme+'/'+x.id);
 for(const id of OFFERED){const [t,ch]=id.split('/'),e=CATALOG.characters.find(x=>x.theme===t&&x.id===ch),m=c.matching(t,ch);
  assert.equal(m.ok,true,id);assert.equal(m.k,4);sizes[id]=m.files.length;assert.ok(m.files.every(f=>f.startsWith(path.join(TV,'characters',t,ch))),'built in');
  assert.ok(e.matching.every(x=>owner.get(x.sha256)===id&&x.file.startsWith('themes/'+t+'/'+ch+'/cleaned/')),id+': its own recordings only');
  assert.equal(e.sharper.vocoder,'prematched');assert.match(e.sharper.evidenceNote,/no one listened/);
  assert.match(e.sharper.evidence,id==='tf2/medic'?/^measured$/:/^nearly$/);}
 assert.deepEqual(sizes,{'deadlock/kelvin':27,'deadlock/lash':23,'tf2/medic':10});
 assert.equal(c.matching('tf2','scout'),null);assert.equal(c.matching('deadlock','venator'),null);
});

// The service with the real catalog and built-in clips, a stand-in engine and the mocked worker.
function fakeService({free=30*GB}={}){
 const dir=tmp(),app=tmp();
 fs.cpSync(path.join(TV,'voices'),path.join(app,'voices'),{recursive:true});
 fs.mkdirSync(path.join(app,'worker'));fs.copyFileSync(path.join(root,'tests','fixtures','fake_voice_worker.py'),path.join(app,'worker','tyler_voice_worker.py'));
 const engine='engine-'+lockHash('linux-cpu');fs.mkdirSync(path.join(dir,engine,'site'),{recursive:true});fs.writeFileSync(path.join(dir,engine,'ok'),'x');
 const mdir='light-'+LOCK.models.light.revision.slice(0,12);fs.mkdirSync(path.join(dir,'models',mdir),{recursive:true});
 fs.writeFileSync(path.join(dir,'installed.json'),JSON.stringify({format:1,engine,runtime:'linux-cpu',lock:lockHash('linux-cpu'),models:{light:{dir:mdir,revision:LOCK.models.light.revision}},python}));
 let saved={mode:'light',characters:{tf2:'medic'}},mem=free;const fetches=[];
 const hw={os:{platform:'linux'},cpu:{model:'Test CPU',threads:4},ram:{total:32*GB,free:30*GB},gpus:[],disk:{free:50*GB},at:Date.now()};
 const svc=new ThemeVoices({dataDir:dir,appDir:app,catalogFile:path.join(TV,'characters.json'),bundledDir:path.join(TV,'characters'),fetch:async u=>{fetches.push(u);throw Error('no network');},
  getSettings:async()=>saved,setSettings:async v=>{saved=v;},theme:async()=>'tf2',detect:async()=>hw,python,freemem:()=>mem});
 // "Installed": the component's files at their exact sizes (sparse: no disk used), as the installer records them.
 const install=()=>{const d=path.join(dir,'components',Installer.componentDirName('knnvc'));fs.mkdirSync(d,{recursive:true});
  for(const f of LOCK.components.knnvc.files){const fd=fs.openSync(path.join(d,f.path),'w');fs.ftruncateSync(fd,f.size);fs.closeSync(fd);}
  fs.writeFileSync(path.join(dir,'components.json'),JSON.stringify({format:1,components:{knnvc:{dir:Installer.componentDirName('knnvc'),revision:LOCK.components.knnvc.revision,at:Date.now()}}}));};
 return {svc,dir,settings:()=>saved,install,fetches,setFree:n=>{mem=n;}};
}
// What the service asked the worker (the speak requests).
const sent=[];const origRequest=WorkerHost.prototype.request;
WorkerHost.prototype.request=function(op,payload,opts){if(op==='speak')sent.push(payload);return origRequest.call(this,op,payload,opts);};

test('v2.44 service: the switch is saved per character, only for the three that offer it; off by default; Remove keeps it',async()=>{
 const {svc,settings,install}=fakeService();
 try{
  assert.deepEqual((await svc.settings()).sharper,{},'off by default');
  await svc.saveSettings({sharper:{'tf2/medic':true,'tf2/scout':true,'deadlock/venator':true,'nope/x':true,'deadlock/lash':'yes','deadlock/kelvin':1,'__proto__':true}});
  assert.deepEqual(settings().sharper,{'tf2/medic':true},'only a real true, and only for Medic, Lash or Kelvin');
  await svc.saveSettings({sharper:{'deadlock/kelvin':true}});assert.deepEqual(settings().sharper,{'tf2/medic':true,'deadlock/kelvin':true},'others stay');
  await svc.saveSettings({sharper:{'deadlock/kelvin':false}});assert.deepEqual(settings().sharper,{'tf2/medic':true});
  const tf2=(await svc.voiceList()).find(v=>v.theme==='tf2'),medic=tf2.characters.find(c=>c.id==='medic');
  assert.equal(medic.sharperOn,true);assert.match(medic.sharperNote,/isn’t installed/);assert.equal(tf2.characters.filter(c=>c.sharper).length,1,'only Medic in TF2');
  install();assert.equal((await svc.voiceList()).find(v=>v.theme==='tf2').characters.find(c=>c.id==='medic').sharperNote,null);
  const st=(await svc.status()).conversion;assert.equal(st.current,true);assert.equal(st.download,1328180068);assert.ok(st.free>0);assert.deepEqual(st.characters.sort(),OFFERED);
  await svc.removeConversion();assert.equal((await svc.status()).conversion.installed,false);assert.deepEqual(settings().sharper,{'tf2/medic':true},'the switch stays');
 }finally{await svc.shutdown();}
});

test('v2.44 service (mocked worker): converted with its own cache key; not installed, short of memory or a failed conversion → the normal voice with a note; never downloads by itself',{skip:!python&&'needs python3'},async()=>{
 const {svc,install,fetches,setFree}=fakeService();
 try{
  await svc.saveSettings({sharper:{'tf2/medic':true}});sent.length=0;
  // On, not installed: the normal voice, says so, nothing fetched.
  const a=await svc.speak({text:'Hello from Medic.'});assert.equal(a.character,'medic');assert.equal(a.sharper,false);assert.match(a.sharperNote,/isn’t installed: install it in Settings → Theme voices\. This is the normal voice\./);
  assert.equal(sent.at(-1).convert,undefined);assert.deepEqual(fetches,[]);assert.equal((await svc.status()).conversion.installed,false,'never installed by itself');
  // Installed: converted, with the character's 10 matching recordings, k=4, and its own cache entry.
  install();const b=await svc.speak({text:'Hello from Medic.'});
  assert.equal(b.sharper,true);assert.equal(b.sharperNote,null);assert.equal(b.cached,false);assert.notEqual(b.file,a.file,'converted and normal clips never share a cache entry');
  const cv=sent.at(-1).convert;assert.equal(cv.k,4);assert.equal(cv.match.length,10);assert.ok(cv.match.every(f=>f.startsWith(path.join(TV,'characters','tf2','medic'))));
  assert.match(cv.wavlm,/WavLM-Large\.pt$/);assert.match(cv.vocoder,/prematch_g_02500000\.pt$/);assert.equal(cv.wavlm_sha256,LOCK.components.knnvc.files[0].sha256);assert.match(cv.cache,/conversion[\\/][0-9a-f]{24}\.safetensors$/);
  assert.equal((await svc.speak({text:'Hello from Medic.'})).cached,true);
  // Off again: the normal clip from its own cache.
  await svc.saveSettings({sharper:{'tf2/medic':false}});const c=await svc.speak({text:'Hello from Medic.'});assert.equal(c.cached,true);assert.equal(c.file,a.file);assert.equal(c.sharper,false);assert.equal(c.sharperNote,null);
  // The conversion fails: the normal take, with the reason; it isn't kept under the converted key.
  await svc.saveSettings({sharper:{'tf2/medic':true}});const d=await svc.speak({text:'CONVFAIL once'});
  assert.equal(d.sharper,false);assert.match(d.sharperNote,/couldn’t run \(RuntimeError: mocked conversion failure\), so this is the normal voice\./);
  await svc.saveSettings({sharper:{'tf2/medic':false}});const e=await svc.speak({text:'CONVFAIL once'});assert.equal(e.cached,true,'filed as the normal clip');assert.equal(e.file,d.file);
  // Short of memory on the processor: not tried, said why.
  await svc.saveSettings({sharper:{'tf2/medic':true}});setFree(0.5*GB);sent.length=0;
  const f=await svc.speak({text:'Little memory.'});assert.equal(f.sharper,false);assert.match(f.sharperNote,/enough free memory/);assert.equal(sent.at(-1)?.convert,undefined);
  // Other characters never convert.
  setFree(30*GB);const g=await svc.speak({text:'Scout here.',character:'scout'});assert.equal(g.sharper,false);assert.equal(g.sharperNote,null);
 }finally{await svc.shutdown();}
});

test('v2.44 service (mocked worker): Stop, the emergency stop (the same Stop) and quitting end a conversion like generation',{skip:!python&&'needs python3'},async()=>{
 const {svc,install}=fakeService();install();
 try{
  await svc.saveSettings({sharper:{'tf2/medic':true}});
  const converting=()=>new Promise(r=>{const on=e=>{if(e.phase==='converting'){svc.off('progress',on);r();}};svc.on('progress',on);});
  // Stop during the conversion: cancelled at once (well before the 4-second engine close).
  let seen=converting(),p=svc.speak({text:'CONVSLOW first'}).then(()=>'made',e=>e.code);await seen;const t0=Date.now();
  assert.equal((await svc.stop()).stopped,true);assert.equal(await p,'cancelled');assert.ok(Date.now()-t0<1500,'stopped within the conversion');assert.ok(svc.worker?.alive,'the engine stays ready');
  // One message called off on its own (an interrupted reply) while converting.
  const ctl=new AbortController();seen=converting();p=svc.speak({text:'CONVSLOW second',signal:ctl.signal}).then(()=>'made',e=>e.code);await seen;ctl.abort();assert.equal(await p,'cancelled');
  // Quitting: the engine is ended at once, mid-conversion.
  seen=converting();p=svc.speak({text:'CONVSLOW third'}).then(()=>'made',e=>e.code);await seen;svc.killNow();assert.match(await p,/stopped|cancelled/);
  await new Promise(r=>setTimeout(r,200));assert.equal(svc.worker,null);
  // And the next one works.
  assert.equal((await svc.speak({text:'After the stops.'})).sharper,true);
 }finally{await svc.shutdown();}
});

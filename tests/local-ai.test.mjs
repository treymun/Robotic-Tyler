// v2.38 Text AI on this PC: the lock, the installer, the engine host and the service, with everything
// heavy MOCKED. No model and no internet: downloads come from a local HTTP server, and the "engine" is
// tests/fixtures/fake-llama-server.cjs (same command line, /health, streamed /v1/chat/completions and
// key rule as llama-server, fixed replies). The real llama.cpp and model are tested separately
// (tools/local-ai/windows-smoke.cjs; see CHANGES.md); none of that is claimed here.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';import path from 'node:path';import os from 'node:os';import http from 'node:http';import zlib from 'node:zlib';import crypto from 'node:crypto';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),root=path.resolve(import.meta.dirname,'..'),LA=path.join(root,'app','local-ai');
const {Installer,LOCK}=require(path.join(LA,'installer.cjs'));
const {LocalAI,threads}=require(path.join(LA,'service.cjs'));
const {LlamaServer,classify}=require(path.join(LA,'server.cjs'));
const hardware=require(path.join(LA,'hardware.cjs'));
const {extractTarGz,stripPlace}=require(path.join(LA,'tar.cjs'));
const {setupLocalAI}=require(path.join(LA,'desktop.cjs'));
const {LOCAL_MODELS,voiceKeyFor,LOCAL_HEARING_ERROR}=await import('../browser-extension/local-ai.mjs');
const GB=1024**3,sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const tmp=()=>fs.mkdtempSync(path.join(os.tmpdir(),'tyler-la-'));
const FAKE=path.join(root,'tests','fixtures','fake-llama-server.cjs');
const unix=process.platform!=='win32'; // the fake engine is a script run through its #! line

// ── archives ─────────────────────────────────────────────────────────────
function tarEntry(name,data,{type='0',mode=0o644,link=''}={}){
 const body=Buffer.from(data),h=Buffer.alloc(512);
 h.write(name,0);h.write(mode.toString(8).padStart(7,'0')+'\0',100);h.write('0000000\0',108);h.write('0000000\0',116);
 h.write((type==='0'?body.length:0).toString(8).padStart(11,'0')+'\0',124);h.write('00000000000\0',136);h.write('        ',148);h.write(type,156);h.write(link,157);h.write('ustar\0',257);h.write('00',263);
 let sum=0;for(const x of h)sum+=x;h.write(sum.toString(8).padStart(6,'0')+'\0 ',148);
 return type==='0'?[h,body,Buffer.alloc((512-body.length%512)%512)]:[h];
}
const tgz=entries=>zlib.gzipSync(Buffer.concat([...entries.flat(),Buffer.alloc(1024)]));
function zipOf(files){
 const locals=[],central=[];let off=0;
 for(const [name,data] of files){const raw=Buffer.from(data),body=zlib.deflateRawSync(raw),n=Buffer.from(name);
  const lh=Buffer.alloc(30);lh.writeUInt32LE(0x04034b50,0);lh.writeUInt16LE(20,4);lh.writeUInt16LE(8,8);lh.writeUInt32LE(body.length,18);lh.writeUInt32LE(raw.length,22);lh.writeUInt16LE(n.length,26);locals.push(lh,n,body);
  const ch=Buffer.alloc(46);ch.writeUInt32LE(0x02014b50,0);ch.writeUInt16LE(20,4);ch.writeUInt16LE(20,6);ch.writeUInt16LE(8,10);ch.writeUInt32LE(body.length,20);ch.writeUInt32LE(raw.length,24);ch.writeUInt16LE(n.length,28);ch.writeUInt32LE(off,42);central.push(ch,n);off+=30+n.length+body.length;}
 const cd=Buffer.concat(central),end=Buffer.alloc(22);end.writeUInt32LE(0x06054b50,0);end.writeUInt16LE(files.length,8);end.writeUInt16LE(files.length,10);end.writeUInt32LE(cd.length,12);end.writeUInt32LE(off,16);
 return Buffer.concat([...locals,cd,end]);
}
// A download server: Range requests, an optional cut-off on the first try, lies on request, and a log.
async function server(files,{cutFirst=new Set(),lie=new Set()}={}){
 const log=[],cut=new Set(cutFirst);
 const s=http.createServer((req,res)=>{
  const body=files[req.url];log.push({url:req.url,range:req.headers.range||null});
  if(!body){res.writeHead(404);res.end();return;}
  const m=/bytes=(\d+)-/.exec(req.headers.range||''),start=m?Number(m[1]):0,chunk=body.subarray(start);
  res.writeHead(m?206:200,{'content-length':chunk.length,'accept-ranges':'bytes'});
  if(cut.has(req.url)){cut.delete(req.url);res.write(chunk.subarray(0,Math.floor(chunk.length/2)));setTimeout(()=>res.destroy(),20);return;}
  res.end(lie.has(req.url)?Buffer.alloc(chunk.length,7):chunk);
 });
 await new Promise(r=>s.listen(0,'127.0.0.1',r));
 return {url:p=>'http://127.0.0.1:'+s.address().port+p,log,close:()=>new Promise(r=>s.close(r))};
}
// The engine archive (Linux layout, like llama.cpp's: one top folder, a library link) with the fake server in it.
const ENGINE=tgz([tarEntry('llama-b11669/','',{type:'5',mode:0o755}),tarEntry('llama-b11669/llama-server',fs.readFileSync(FAKE),{mode:0o755}),tarEntry('llama-b11669/libggml-fake.so.0.1','lib'),tarEntry('llama-b11669/libggml-fake.so','',{type:'2',link:'libggml-fake.so.0.1'}),tarEntry('llama-b11669/libggml-vulkan.so','vk'),tarEntry('llama-b11669/LICENSE','MIT')]);
const MODEL_A=crypto.randomBytes(300000),MODEL_B=crypto.randomBytes(200000);
function testLock(url){
 return {...LOCK,engine:{...LOCK.engine,runtimes:{'linux-cpu':{...LOCK.engine.runtimes['linux-cpu'],url:url('/engine.tar.gz'),size:ENGINE.length,sha256:sha(ENGINE),unpacked:ENGINE.length*2,gpuBackend:'libggml-vulkan.so'}}},
  models:{'4b':{...LOCK.models['4b'],url:url('/4b.gguf'),size:MODEL_A.length,sha256:sha(MODEL_A)},'9b':{...LOCK.models['9b'],url:url('/9b.gguf'),size:MODEL_B.length,sha256:sha(MODEL_B)}}};
}
// A service on the fake engine. `saved` is the settings store (the app keeps it in its vault, not in the folder).
async function setup({install=['4b'],settings={model:'4b',device:'cpu',idleMinutes:10},config={},...o}={}){
 const s=await server({'/engine.tar.gz':ENGINE,'/4b.gguf':MODEL_A,'/9b.gguf':MODEL_B});
 const dir=tmp(),logFile=path.join(tmp(),'engine.jsonl');let saved={...settings};
 const svc=new LocalAI({dataDir:dir,fetch:globalThis.fetch,getSettings:async()=>saved,setSettings:async v=>{saved=v;},lock:testLock(s.url),platform:'linux',retryDelay:()=>0,
  detect:(d,opt)=>hardware.detect(d,{...opt,adapters:async()=>[],baseDetect:async()=>({cpu:{model:'Test CPU',threads:8},ram:{total:16*GB,free:12*GB},gpus:[],disk:{free:100*GB}})}),...o});
 for(const m of install)await svc.install({model:m});
 const engine=svc.installer.engineDir();
 const configure=c=>{if(engine)fs.writeFileSync(path.join(engine,'fake-config.json'),JSON.stringify({log:logFile,...c}));};configure(config);
 const seen=()=>fs.existsSync(logFile)?fs.readFileSync(logFile,'utf8').trim().split('\n').map(l=>JSON.parse(l)):[];
 return {svc,s,dir,engine,seen,configure,settings:()=>saved,done:async()=>{await svc.shutdown();await s.close();}};
}
const msgs=[{role:'system',content:'RULES'},{role:'user',content:'[chat] Sam: hi'}];

test('the lock pins one llama.cpp release and four Qwen3.5 GGUF files, each at one commit with its size and SHA-256',()=>{
 assert.equal(LOCK.engine.build,'b11669');
 const rt=LOCK.engine.runtimes;
 assert.deepEqual(Object.keys(rt).sort(),['linux-cpu','windows-vulkan']);
 assert.equal(rt['windows-vulkan'].name,'llama-b11669-bin-win-vulkan-x64.zip');assert.equal(rt['windows-vulkan'].size,32182350);assert.equal(rt['windows-vulkan'].sha256,'2c07574e7bde71321cb785282b20cc821e951132149eeceeea32ddebdbf0598e');
 assert.equal(rt['windows-vulkan'].gpuBackend,'ggml-vulkan.dll');assert.equal(rt['windows-vulkan'].dev,false);
 assert.equal(rt['linux-cpu'].sha256,'cf07c1c112d709bd67e522017471de57ed0ec8bea031d732c5422351c07f65ac');assert.equal(rt['linux-cpu'].size,17851611);assert.equal(rt['linux-cpu'].dev,true,'Linux is for development and tests only');
 for(const r of Object.values(rt)){assert.equal(r.url,'https://github.com/ggml-org/llama.cpp/releases/download/b11669/'+r.name);assert.match(r.sha256,/^[0-9a-f]{64}$/);}
 const want={'4b':['unsloth/Qwen3.5-4B-GGUF','e87f176479d0855a907a41277aca2f8ee7a09523','Qwen3.5-4B-Q4_K_M.gguf',2740937888,'00fe7986ff5f6b463e62455821146049db6f9313603938a70800d1fb69ef11a4',false],
  '9b':['unsloth/Qwen3.5-9B-GGUF','3885219b6810b007914f3a7950a8d1b469d598a5','Qwen3.5-9B-Q4_K_M.gguf',5680522464,'03b74727a860a56338e042c4420bb3f04b2fec5734175f4cb9fa853daf52b7e8',false],
  '4b-uncensored':['mradermacher/Huihui-Qwen3.5-4B-abliterated-GGUF','9d3aebb998fcf084086a3d1c60c31035fcfbf8e1','Huihui-Qwen3.5-4B-abliterated.Q4_K_M.gguf',2707514688,'423f10b6ec2d99c3378143d7cd3b80eb4887b3ed92103103ac59173b404f4f7c',true],
  '9b-uncensored':['mradermacher/Huihui-Qwen3.5-9B-abliterated-GGUF','419ca34f424adbd9276c09e0271cb6b718e8da1d','Huihui-Qwen3.5-9B-abliterated.Q4_K_M.gguf',5627045248,'ea1858ef4dc4b648b8dbb44612962a0333e945060dd0545ac0f28d7c4416e4b3',true]};
 assert.deepEqual(Object.keys(LOCK.models).sort(),Object.keys(want).sort());
 for(const [k,[repo,rev,file,size,hash,unc]] of Object.entries(want)){const m=LOCK.models[k];
  assert.equal(m.repo,repo);assert.equal(m.revision,rev);assert.equal(m.file,file);assert.equal(m.size,size);assert.equal(m.sha256,hash);assert.equal(m.uncensored,unc);assert.equal(m.license,'Apache-2.0');
  assert.equal(m.url,'https://huggingface.co/'+repo+'/resolve/'+rev+'/'+file,'pinned to the commit, not a branch');}
 // Settings' list (browser-extension/local-ai.mjs) is the same four, with the same sizes and labels.
 assert.deepEqual(LOCAL_MODELS.map(m=>[m.key,m.bytes,m.uncensored,m.label]),Object.entries(LOCK.models).map(([k,m])=>[k,m.size,m.uncensored,m.label]));
 const html=fs.readFileSync(path.join(root,'browser-extension','settings.html'),'utf8');
 for(const k of Object.keys(LOCK.models))assert.ok(html.includes('name="laModel" value="'+k+'"'),'Settings offers '+k);
 assert.match(html,/Uncensored \(refusals removed by the community; a little less accurate\)/);
});
test('voice calls with Text AI on this PC hear with the saved OpenRouter key, else the Google key, else a clear error',()=>{
 assert.deepEqual(voiceKeyFor({aiProvider:'local',openrouterKey:'sk-or-a',geminiKey:'AIza'}),{provider:'openrouter',key:'sk-or-a',error:null});
 assert.deepEqual(voiceKeyFor({aiProvider:'local',geminiKey:'AIza'}),{provider:'gemini',key:'AIza',error:null});
 const none=voiceKeyFor({aiProvider:'local'});assert.equal(none.provider,null);assert.equal(none.key,'');assert.equal(none.error,LOCAL_HEARING_ERROR);assert.match(none.error,/local hearing is coming next/);
 // The cloud providers are unchanged: their own key only.
 assert.deepEqual(voiceKeyFor({aiProvider:'gemini',openrouterKey:'sk-or-a',geminiKey:'AIza'}),{provider:'gemini',key:'AIza',error:null});
 assert.deepEqual(voiceKeyFor({openrouterKey:'sk-or-a',geminiKey:'AIza'}),{provider:'openrouter',key:'sk-or-a',error:null});
 assert.equal(voiceKeyFor({aiProvider:'openrouter',geminiKey:'AIza'}).key,'','OpenRouter chosen never borrows the Google key');
});
test('.tar.gz: files, folders and same-folder library links unpack; names and links that leave the folder are refused',{skip:!unix},async()=>{
 const dir=tmp(),file=path.join(dir,'a.tar.gz'),out=path.join(dir,'out');
 fs.writeFileSync(file,tgz([tarEntry('top/','',{type:'5'}),tarEntry('top/bin/tool','#!x',{mode:0o755}),tarEntry('top/lib.so.1','L'),tarEntry('top/lib.so','',{type:'2',link:'lib.so.1'}),tarEntry('top/../evil.txt','x'),tarEntry('other/skip.txt','x')]));
 const r=await extractTarGz(file,stripPlace(out,'top/'));
 assert.equal(fs.readFileSync(path.join(out,'bin','tool'),'utf8'),'#!x');assert.ok(fs.statSync(path.join(out,'bin','tool')).mode&0o100,'executable kept');
 assert.equal(fs.readlinkSync(path.join(out,'lib.so')),'lib.so.1');assert.equal(fs.readFileSync(path.join(out,'lib.so'),'utf8'),'L');
 assert.ok(!fs.existsSync(path.join(dir,'evil.txt'))&&!fs.existsSync(path.join(out,'skip.txt')));assert.equal(r.files,2);
 fs.writeFileSync(file,tgz([tarEntry('top/x','',{type:'2',link:'../../etc/passwd'})]));
 await assert.rejects(extractTarGz(file,stripPlace(tmp(),'top/')),/Unsafe link/);
});
test('install: the plan shows the download and disk space first; a cut-off download resumes (Range); the engine and model are checked and placed',{skip:!unix},async()=>{
 const s=await server({'/engine.tar.gz':ENGINE,'/4b.gguf':MODEL_A},{cutFirst:new Set(['/4b.gguf'])});
 const dir=tmp(),inst=new Installer({dir,fetch:globalThis.fetch,lock:testLock(s.url),platform:'linux',retryDelay:()=>0});
 const p=inst.plan({model:'4b'});
 assert.equal(p.download,ENGINE.length+MODEL_A.length);assert.ok(p.disk>p.download,'unpacking needs more than the download');assert.equal(p.fileCount,2);assert.equal(p.runtimeReady,false);
 assert.deepEqual(s.log,[],'planning downloads nothing');
 const phases=new Set();const st=await inst.install({model:'4b'},{onProgress:e=>phases.add(e.phase)});
 assert.ok(s.log.some(l=>l.url==='/4b.gguf'&&l.range&&l.range!=='bytes=0-'),'resumed with a Range request: '+JSON.stringify(s.log));
 assert.deepEqual([...phases],['download','unpack','model','done']);
 assert.equal(st.build,'b11669');assert.ok(inst.engineReady());assert.equal(inst.status().models['4b'],true);
 assert.equal(sha(fs.readFileSync(inst.modelFile('4b'))),sha(MODEL_A));
 assert.ok(fs.existsSync(path.join(inst.engineDir(),'gpu','libggml-vulkan.so')),'the graphics-card backend sits in its own folder');
 assert.ok(!fs.existsSync(path.join(inst.engineDir(),'libggml-vulkan.so')),'…so the engine loads it only when told to');
 assert.deepEqual(fs.readdirSync(inst.downloads),[],'downloads are tidied once placed');
 // Planned again: nothing to fetch. A second model reuses the engine.
 assert.equal(inst.plan({model:'4b'}).fileCount,0);
 const p9=inst.plan({model:'9b'});assert.equal(p9.runtimeReady,true);assert.equal(p9.fileCount,1);
 await s.close();
});
test('install: a file that doesn’t match its SHA-256 is deleted and never used; Stop keeps what was downloaded',{skip:!unix},async()=>{
 const s=await server({'/engine.tar.gz':ENGINE,'/4b.gguf':MODEL_A},{lie:new Set(['/4b.gguf'])});
 const dir=tmp(),inst=new Installer({dir,fetch:globalThis.fetch,lock:testLock(s.url),platform:'linux',retryDelay:()=>0});
 await assert.rejects(inst.install({model:'4b'}),/didn’t match its checksum/);
 assert.equal(inst.state(),null,'nothing is marked installed');
 assert.ok(!fs.readdirSync(inst.downloads).some(f=>f.includes('Qwen3.5-4B')),'the bad model file is gone');
 const ctl=new AbortController();ctl.abort();await assert.rejects(inst.install({model:'4b'},{signal:ctl.signal}),/Cancelled/);
 await s.close();
});
test('install: an offline folder is used first (checked like a download); a damaged copy there is ignored',{skip:!unix},async()=>{
 const off=tmp();fs.writeFileSync(path.join(off,'llama-b11669-bin-ubuntu-x64.tar.gz'),ENGINE);fs.writeFileSync(path.join(off,'Qwen3.5-4B-Q4_K_M.gguf'),Buffer.alloc(MODEL_A.length,1));
 const s=await server({'/engine.tar.gz':ENGINE,'/4b.gguf':MODEL_A});
 const inst=new Installer({dir:tmp(),fetch:globalThis.fetch,lock:testLock(s.url),platform:'linux',retryDelay:()=>0});
 await inst.install({model:'4b'},{offline:[off]});
 assert.deepEqual(s.log.map(l=>l.url),['/4b.gguf'],'the engine came from the folder; the damaged model was downloaded instead');
 assert.equal(sha(fs.readFileSync(inst.modelFile('4b'))),sha(MODEL_A));
 await s.close();
});
test('Windows: one download (the Vulkan build) for both the graphics card and the processor; the Vulkan backend is kept apart',async()=>{
 const zip=zipOf([['llama-server.exe','MZ'],['llama-server-impl.dll','dll'],['ggml-cpu-x64.dll','cpu'],['ggml-vulkan.dll','vk'],['LICENSE-LLVM-OpenMP','lic']]);
 const s=await server({'/vk.zip':zip,'/4b.gguf':MODEL_A});
 const lock={...LOCK,engine:{...LOCK.engine,runtimes:{'windows-vulkan':{...LOCK.engine.runtimes['windows-vulkan'],url:s.url('/vk.zip'),size:zip.length,sha256:sha(zip),unpacked:100}}},models:{'4b':{...LOCK.models['4b'],url:s.url('/4b.gguf'),size:MODEL_A.length,sha256:sha(MODEL_A)}}};
 const inst=new Installer({dir:tmp(),fetch:globalThis.fetch,lock,platform:'win32',retryDelay:()=>0});
 assert.equal(inst.runtimeId(),'windows-vulkan');
 await inst.install({model:'4b'});
 const e=inst.engineDir();
 assert.deepEqual(fs.readdirSync(e).sort(),['LICENSE-LLVM-OpenMP','ggml-cpu-x64.dll','gpu','llama-server-impl.dll','llama-server.exe','ok']);
 assert.equal(inst.gpuBackend(),path.join(e,'gpu','ggml-vulkan.dll'));assert.equal(inst.exe(),path.join(e,'llama-server.exe'));
 assert.throws(()=>new Installer({dir:tmp(),fetch,platform:'darwin'}).runtimeId(),/needs Windows/);
 await s.close();
});
test('remove: the engine, models and downloads go; the settings are kept',{skip:!unix},async()=>{
 const t=await setup({install:['4b']});
 await t.svc.saveSettings({idleMinutes:30});
 await t.svc.remove();
 assert.deepEqual(fs.readdirSync(t.dir),[],'the LocalAI folder is empty');
 assert.deepEqual(t.settings(),{model:'4b',device:'cpu',idleMinutes:30},'settings stay (they live in the app’s vault)');
 const st=await t.svc.status();assert.equal(st.installed,false);assert.equal(st.needs,'install');
 await assert.rejects(t.svc.chat({messages:msgs}),e=>e.code==='not_installed'&&/isn’t installed yet/.test(e.message)&&/didn’t use a cloud AI/.test(e.message));
 await t.done();
});
test('the engine starts only when a reply asks: 127.0.0.1, a free port, a new key in its environment (never on the command line), no web page',{skip:!unix},async()=>{
 const t=await setup();
 assert.equal((await t.svc.status()).running,false);assert.deepEqual(t.seen().filter(e=>e.start),[],'installing and status don’t start it');
 const r=await t.svc.chat({messages:msgs,max_tokens:50});
 assert.equal(r.text,'GG, that was a clean round.');assert.equal(r.device,'cpu');assert.equal(r.label,'Qwen3.5 4B');
 const start=t.seen().find(e=>e.start),argv=start.argv,arg=n=>argv[argv.indexOf(n)+1];
 assert.equal(arg('--host'),'127.0.0.1');assert.match(arg('--port'),/^\d+$/);assert.equal(arg('-c'),'8192');assert.equal(arg('-np'),'1');
 for(const f of ['--jinja','--no-webui','--no-slots','--offline'])assert.ok(argv.includes(f),f);
 assert.equal(arg('--reasoning'),'off');assert.equal(arg('--chat-template-kwargs'),'{"enable_thinking":false}','Qwen3.5’s thinking is off');
 assert.equal(arg('--fit'),'off','llama.cpp may not shrink or move the model by itself');
 assert.equal(arg('--device'),'none');assert.equal(arg('-ngl'),'0');assert.equal(arg('-t'),String(threads()));
 assert.equal(start.keyLength,43,'32 random bytes');assert.equal(start.keyInArgv,false,'the key isn’t on the command line');assert.equal(start.backend,null,'processor only: the Vulkan backend isn’t loaded');
 assert.ok(!start.envKeys.some(k=>/^LLAMA_ARG|^HF_|^GGML_/.test(k)),'only the allowlisted environment: '+start.envKeys);assert.ok(start.envKeys.includes('LLAMA_API_KEY'));
 assert.equal(t.seen().find(e=>e.listening).listening.address,'127.0.0.1');
 // Without the key, the engine refuses; with it, it answers (the key stays in the service).
 const port=t.svc.server.port,post=(headers)=>new Promise((res,rej)=>{const q=http.request({host:'127.0.0.1',port,path:'/v1/chat/completions',method:'POST',headers:{'Content-Type':'application/json',...headers}},r=>{r.resume();res(r.statusCode);});q.on('error',rej);q.end(JSON.stringify({messages:msgs}));});
 assert.equal(await post({}),401);assert.equal(await post({Authorization:'Bearer wrong'}),401);
 const st=await t.svc.status();assert.equal(st.running,true);assert.ok(!JSON.stringify(st).includes(t.svc.server.key),'status never carries the key');
 // A second reply reuses the running engine.
 await t.svc.chat({messages:msgs});assert.equal(t.seen().filter(e=>e.start).length,1);
 await t.done();
});
test('replies stream, and the request body is clean: messages, max_tokens, stream (a temperature only when given), no OpenRouter fields',{skip:!unix},async()=>{
 const t=await setup({config:{reply:'Push B together and trade your kills, squad.',tokenDelay:10}});
 const parts=[];const r=await t.svc.chat({messages:msgs,max_tokens:110,stream:true,onText:x=>parts.push(x)});
 assert.ok(parts.length>=5,'text arrived in pieces');assert.equal(parts.at(-1),'Push B together and trade your kills, squad.');assert.equal(r.text,parts.at(-1));
 assert.ok(r.firstTokenMs>=0);assert.deepEqual(r.usage,{prompt:42,completion:8});
 let body=t.seen().find(e=>e.chat).chat;
 assert.deepEqual(Object.keys(body).sort(),['max_tokens','messages','stream']);assert.equal(body.max_tokens,110);assert.equal(body.stream,true);assert.deepEqual(body.messages,msgs);
 await t.svc.chat({messages:msgs,stream:false,temperature:0.95});body=t.seen().filter(e=>e.chat).at(-1).chat;
 assert.deepEqual(Object.keys(body).sort(),['max_tokens','messages','stream','temperature']);assert.equal(body.temperature,0.95);assert.equal(body.stream,false);
 await t.done();
});
test('idle close gives the memory back; Stop and release end a reply and close the engine; the next reply starts it again',{skip:!unix},async()=>{
 const t=await setup({minuteMs:150,config:{reply:'one two three four five six seven eight nine ten',tokenDelay:120}});
 await t.svc.saveSettings({idleMinutes:1});
 await t.svc.chat({messages:msgs});assert.equal((await t.svc.status()).running,true);
 for(let i=0;i<50&&t.svc.server;i++)await new Promise(r=>setTimeout(r,20));
 assert.equal(t.svc.server,null,'closed after the idle time');
 // A reply being written is stopped by the caller's signal: the engine sees the connection close.
 const ctl=new AbortController(),p=t.svc.chat({messages:msgs,signal:ctl.signal,onText:()=>ctl.abort()});
 await assert.rejects(p,e=>e.code==='cancelled'&&e.message==='Stopped.');
 for(let i=0;i<50&&!t.seen().some(e=>e.clientClosed);i++)await new Promise(r=>setTimeout(r,20));
 assert.ok(t.seen().some(e=>e.clientClosed),'the engine stopped writing');
 // Release (Pause/Stop in Steam, the Steam window closing): the running reply ends, the engine closes.
 const q=assert.rejects(t.svc.chat({messages:msgs}),e=>e.code==='cancelled');for(let i=0;i<100&&!t.svc.server?.alive;i++)await new Promise(r=>setTimeout(r,20));
 await new Promise(r=>setTimeout(r,200));await t.svc.release('Tyler stopped');
 await q;assert.equal(t.svc.server,null);assert.equal((await t.svc.status()).running,false);
 assert.ok(t.seen().filter(e=>e.start).length>=2,'started again for the next reply');
 await t.done();
});
test('the emergency stop and quitting close the engine (desktop wiring); the bridge carries text, never the port or key',{skip:!unix},async()=>{
 const s=await server({'/engine.tar.gz':ENGINE,'/4b.gguf':MODEL_A});
 const rootDir=tmp(),store={},listeners=[],sent=[];
 const vault={get:async k=>({[k]:store[k]})},local={set:async v=>Object.assign(store,v)};
 const app=setupLocalAI({root:rootDir,vault,local,changeListeners:listeners,net:{fetch:globalThis.fetch},shell:{openPath:async()=>''},log:()=>{},send:e=>sent.push(e)});
 // The test points the real setup at its own files (download server, Linux platform).
 const svc=app.service;svc.installer=new Installer({dir:svc.dir,fetch:globalThis.fetch,lock:testLock(s.url),platform:'linux',retryDelay:()=>0});svc.lock=svc.installer.lock;svc.detectFn=async()=>({cpu:{model:'x',threads:4},ram:{total:16*GB,free:12*GB},gpus:[],disk:{free:100*GB}});
 const st=await app.settingsRequest('status');assert.equal(st.status.installed,false);assert.equal(Object.keys(st.models).length,4);
 const plan=await app.settingsRequest('plan',{model:'4b'});assert.equal(plan.download,ENGINE.length+MODEL_A.length);assert.equal(plan.files,undefined);
 await app.settingsRequest('settings',{values:{device:'cpu',idleMinutes:0,secret:'x'}});assert.equal(store.localAI.secret,undefined,'only the three settings are kept');
 assert.deepEqual(await app.settingsRequest('install',{model:'4b'}),{started:true});
 for(let i=0;i<200&&!sent.some(e=>e.kind==='install'&&e.phase==='done');i++)await new Promise(r=>setTimeout(r,20));
 assert.equal(store.localAI.model,'4b','installing a model chooses it');
 fs.writeFileSync(path.join(svc.installer.engineDir(),'fake-config.json'),'{}');
 const bridge=globalThis.tylerLocalAI;assert.deepEqual(Object.keys(bridge).sort(),['chat','release','status']);
 const r=await bridge.chat({messages:msgs,stream:true,max_tokens:20});assert.equal(r.text,'GG, that was a clean round.');
 const pub=await bridge.status();assert.equal(pub.ready,true);assert.equal(pub.running,true);assert.ok(!JSON.stringify(pub).includes(svc.server.key)&&!('port' in pub));
 assert.ok(!sent.some(e=>JSON.stringify(e).includes(svc.server.key)),'nothing sent to the settings window carries the key');
 for(const fn of listeners)fn({v22EmergencyStop:{newValue:true}});
 for(let i=0;i<100&&svc.server;i++)await new Promise(r=>setTimeout(r,20));
 assert.equal(svc.server,null,'the emergency stop closed the engine');
 await bridge.chat({messages:msgs});const pid=svc.server.proc.pid;app.kill();
 for(let i=0;i<100;i++){try{process.kill(pid,0);}catch{break;}await new Promise(r=>setTimeout(r,20));}
 assert.throws(()=>process.kill(pid,0),'quitting ends the engine process');
 delete globalThis.tylerLocalAI;await s.close();
});
test('a crash in the middle of a reply, a model that doesn’t fit and a missing model each fail with the reason; nothing else is tried',{skip:!unix},async()=>{
 const t=await setup({install:['4b'],config:{mode:'crash-mid'}});
 await assert.rejects(t.svc.chat({messages:msgs}),e=>e.code==='crashed'&&e.kind==='turn'&&/ran out of memory and the AI on this PC closed/.test(e.message)&&!/choose a 4B/.test(e.message)&&/didn’t use a cloud AI/.test(e.message));
 assert.equal(t.svc.server,null);assert.match((await t.svc.status()).lastError.message,/out of memory|closed/);
 t.configure({mode:'oom'});
 await assert.rejects(t.svc.chat({messages:msgs}),e=>e.code==='out_of_memory'&&e.kind==='fatal'&&/Qwen3.5 4B didn’t fit in the free memory/.test(e.message)&&/Engine: .*unable to allocate/.test(e.message));
 // The 9B is chosen but only the 4B is installed: Tyler says so and doesn't quietly use the 4B.
 t.configure({});await t.svc.saveSettings({model:'9b'});const before=t.seen().filter(e=>e.chat).length;
 await assert.rejects(t.svc.chat({messages:msgs}),e=>e.code==='model_missing'&&/Qwen3.5 9B model isn’t installed/.test(e.message)&&/doesn’t switch to another model/.test(e.message));
 assert.equal(t.seen().filter(e=>e.chat).length,before,'no reply was asked of another model');
 await t.svc.saveSettings({model:'4b'});const ok=await t.svc.chat({messages:msgs});assert.equal(ok.label,'Qwen3.5 4B');
 await t.done();
});
test('graphics card: every layer on the Vulkan card with the most free memory; a card that has gone is an error, not a quiet move to the processor',{skip:!unix},async()=>{
 const t=await setup({settings:{model:'4b',device:'auto',idleMinutes:0},config:{devices:[{id:'Vulkan0',name:'Intel UHD',total:4096,free:3000},{id:'Vulkan1',name:'AMD Radeon RX 7800 XT',total:16368,free:15000}]}});
 const r=await t.svc.chat({messages:msgs});assert.equal(r.device,'gpu');
 const start=t.seen().find(e=>e.start),arg=n=>start.argv[start.argv.indexOf(n)+1];
 assert.equal(arg('--device'),'Vulkan1');assert.equal(arg('-ngl'),'all');assert.equal(start.backend,path.join(t.engine,'gpu','libggml-vulkan.so'));
 assert.ok(t.seen().some(e=>e.listDevices&&e.backend),'Vulkan was asked with its backend');
 const hw=await t.svc.hardware(true);assert.equal(hw.vulkanChecked,true);assert.equal(hardware.suggest(hw).model,'9b','15 GB free: the 9B is suggested');
 // The card disappears (driver problem): fail with the reason.
 await t.svc.close('test');t.configure({devices:[]});
 await assert.rejects(t.svc.chat({messages:msgs}),e=>e.code==='no_gpu'&&/Processor only/.test(e.message));
 // A card without room for the 9B: the reason, before anything loads.
 t.configure({devices:[{id:'Vulkan0',name:'RX 6600',total:8176,free:2500}]});
 await assert.rejects(t.svc.chat({messages:msgs}),e=>e.code==='out_of_memory'&&/RX 6600 has 2\.4 GB free/.test(e.message));
 await t.done();
});
test('two replies at once start one engine; a start failure, the engine’s messages and a crash are put in plain words',{skip:!unix},async()=>{
 const t=await setup();
 const [a,b]=await Promise.all([t.svc.chat({messages:msgs}),t.svc.chat({messages:msgs})]);
 assert.equal(a.text,b.text);assert.equal(t.seen().filter(e=>e.start).length,1);
 assert.equal(classify(['llama_model_load: error loading model: unable to allocate Vulkan0 buffer']),'out_of_memory');
 assert.equal(classify(['ggml_vulkan: Device memory allocation of size 1 failed.']),'out_of_memory');
 assert.equal(classify(['couldn\'t bind HTTP server socket']),'bind');
 assert.equal(classify(['llama_model_load: error loading model: unknown model architecture']),'model_load');
 assert.equal(classify(['something else']),'crashed');
 const srv=new LlamaServer({exe:path.join(tmp(),'missing-llama-server'),model:'x',device:'cpu'});
 await assert.rejects(srv.start(),e=>e.code==='not_installed'&&/engine is missing/.test(e.message));
 await t.done();
});
test('the suggestion: 9B with about 8 GB free on the card, else 4B; the processor gets 4B; it is only a suggestion',()=>{
 const pc=gpus=>({cpu:{model:'CPU',threads:16},ram:{total:32*GB,free:20*GB},gpus,disk:{free:100*GB}});
 assert.deepEqual([hardware.suggest(pc([{name:'RTX 4070',vramTotal:12*GB,vramFree:10*GB}])).model,hardware.suggest(pc([{name:'RTX 4070',vramTotal:12*GB,vramFree:10*GB}])).device],['9b','gpu']);
 assert.equal(hardware.suggest(pc([{name:'RTX 3060 Ti',vramTotal:8*GB,vramFree:6.5*GB}])).model,'4b');
 assert.equal(hardware.suggest(pc([{name:'Radeon RX 7900 XTX',vramTotal:24*GB}])).model,'9b','total only (before Vulkan is asked)');
 const unknown=hardware.suggest(pc([{name:'Some GPU'}]));assert.equal(unknown.model,'4b');assert.match(unknown.notes.join(' '),/couldn’t read/);
 const cpu=hardware.suggest(pc([]));assert.equal(cpu.model,'4b');assert.equal(cpu.device,'cpu');
 const igpu=hardware.suggest(pc([{name:'Intel(R) UHD Graphics 770',integrated:true}]));assert.equal(igpu.device,'cpu');assert.match(igpu.notes[0],/built into the processor/);
 for(const s of [cpu,unknown])assert.ok(s.notes.length>0,'the reasons are spelled out');
});
test('Vulkan’s device list is read the way llama-server prints it',async()=>{
 const dir=tmp(),exe=path.join(dir,'lister.cjs');
 fs.writeFileSync(exe,"#!/usr/bin/env node\nconsole.error('ggml_vulkan: Found 2 Vulkan devices:');console.error('ggml_vulkan: 0 = AMD Radeon(TM) Graphics (AMD proprietary driver) | uma: 1 | fp16: 1 | bf16: 0');console.error('ggml_vulkan: 1 = NVIDIA GeForce RTX 4060 (NVIDIA) | uma: 0 | fp16: 1 | bf16: 1');console.log('Available devices:');console.log('  Vulkan0: AMD Radeon(TM) Graphics (16384 MiB, 12000 MiB free)');console.log('  Vulkan1: NVIDIA GeForce RTX 4060 (8188 MiB, 7420 MiB free)');\n",{mode:0o755});
 if(!unix)return;
 const r=await hardware.vulkanDevices(exe,process.env);
 assert.equal(r.listed,true);assert.deepEqual(r.devices.map(d=>[d.id,d.name,d.vramTotal/1024**2,d.vramFree/1024**2,d.integrated]),[['Vulkan0','AMD Radeon(TM) Graphics',16384,12000,true],['Vulkan1','NVIDIA GeForce RTX 4060',8188,7420,false]]);
 const s=hardware.suggest({ram:{total:32*GB},gpus:r.devices,vulkanChecked:true});assert.equal(s.card.name,'NVIDIA GeForce RTX 4060','the built-in one isn’t picked');assert.equal(s.model,'4b','7.2 GB free is a little under the 9B’s 8 GB');
});
test('v2.38 suggestion: a virtual adapter or a card Vulkan can\'t see means the processor (found on GitHub\'s Windows runner)',()=>{
 const GB=1024**3,ram={total:16*GB,free:12*GB};
 assert.equal(hardware.suggest({gpus:[{vendor:'Other',name:'Microsoft Hyper-V Video',source:'windows',integrated:false}],ram}).device,'cpu');
 assert.equal(hardware.suggest({gpus:[{vendor:'NVIDIA',name:'NVIDIA GeForce RTX 3060',source:'windows',vramTotal:12*GB,integrated:false}],ram,vulkanChecked:true,vulkanListed:true}).device,'cpu','Vulkan listed no devices');
 const real=hardware.suggest({gpus:[{name:'NVIDIA GeForce RTX 5070 Ti Laptop GPU',source:'vulkan',vramTotal:12*GB,vramFree:11*GB,integrated:false}],ram,vulkanChecked:true,vulkanListed:true});
 assert.equal(real.device,'gpu');assert.equal(real.model,'9b');
});

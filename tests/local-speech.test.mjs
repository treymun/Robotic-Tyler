// v2.39 hearing and voice on this PC: the lock, the installer, the engine processes and the service,
// with everything heavy MOCKED. No model and no internet: downloads come from a local HTTP server, and
// the "engine" is tests/fixtures/fake-sherpa-addon.cjs (the same functions as sherpa-onnx's Node addon,
// fixed answers) loaded by the REAL worker process (app/local-ai/speech-worker.cjs, forked with node).
// The real sherpa-onnx, Parakeet and Kokoro are tested separately (tools/local-ai/speech-smoke.cjs;
// see docs/LOCAL-AI.md); none of that is claimed here.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';import path from 'node:path';import os from 'node:os';import http from 'node:http';import zlib from 'node:zlib';import crypto from 'node:crypto';import {spawn} from 'node:child_process';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),root=path.resolve(import.meta.dirname,'..'),LA=path.join(root,'app','local-ai');
const {SpeechInstaller,SPEECH_LOCK}=require(path.join(LA,'speech-installer.cjs'));
const {LocalSpeech,CHECK_TEXT,speechThreads}=require(path.join(LA,'speech.cjs'));
const {Installer}=require(path.join(LA,'installer.cjs'));
const {setupLocalAI}=require(path.join(LA,'desktop.cjs'));
const {readWav,wavOf}=require(path.join(LA,'speech-worker.cjs'));
const {LOCAL_SPEECH,KOKORO_VOICES,voicePlan,voiceKeyFor,LOCAL_HEARING_ERROR}=await import('../browser-extension/local-ai.mjs');
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const made=[],tmp=()=>{const d=fs.mkdtempSync(path.join(os.tmpdir(),'tyler-ls-'));made.push(d);return d;};
test.after(()=>{for(const d of made)fs.rmSync(d,{recursive:true,force:true,maxRetries:5,retryDelay:100});});
const linux=process.platform==='linux';
const until=async(fn,ms=3000)=>{for(let t=0;t<ms/20;t++){if(await fn())return true;await new Promise(r=>setTimeout(r,20));}return false;};
const alive=pid=>{try{process.kill(pid,0);return true;}catch{return false;}};

// ── archives and a download server (as in tests/local-ai.test.mjs) ───────
function tarEntry(name,data){
 const body=Buffer.from(data),h=Buffer.alloc(512);
 h.write(name,0);h.write('0000644\0',100);h.write('0000000\0',108);h.write('0000000\0',116);
 h.write(body.length.toString(8).padStart(11,'0')+'\0',124);h.write('00000000000\0',136);h.write('        ',148);h.write('0',156);h.write('ustar\0',257);h.write('00',263);
 let sum=0;for(const x of h)sum+=x;h.write(sum.toString(8).padStart(6,'0')+'\0 ',148);
 return [h,body,Buffer.alloc((512-body.length%512)%512)];
}
const tgz=entries=>zlib.gzipSync(Buffer.concat([...entries.flat(),Buffer.alloc(1024)]));
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
// The engine package (npm layout: package/…) with the fake addon in place of sherpa-onnx.node.
const FAKE_ADDON=fs.readFileSync(path.join(root,'tests','fixtures','fake-sherpa-addon.cjs'));
const RUNTIME=tgz([tarEntry('package/fake-addon.cjs',FAKE_ADDON),tarEntry('package/index.js','module.exports=require("./fake-addon.cjs");'),tarEntry('package/libonnxruntime-fake.so','lib')]);
const H={'encoder.int8.onnx':crypto.randomBytes(60000),'decoder.int8.onnx':crypto.randomBytes(3000),'joiner.int8.onnx':crypto.randomBytes(2000),'tokens.txt':Buffer.from('<blk> 0\n')};
const V={'model.onnx':crypto.randomBytes(40000),'voices.bin':crypto.randomBytes(5000),'tokens.txt':Buffer.from('$ 0\n'),'lexicon-us-en.txt':Buffer.from('tyler t aɪ l ɚ\n'),'lexicon-gb-en.txt':Buffer.from('tyler t aɪ l ə\n'),'espeak-ng-data/phontab':Buffer.from('pt'),'espeak-ng-data/lang/gmw/en-US':Buffer.from('name English (America)\n')};
const FILES={'/rt.tgz':RUNTIME,...Object.fromEntries(Object.entries(H).map(([k,v])=>['/h/'+k,v])),...Object.fromEntries(Object.entries(V).map(([k,v])=>['/v/'+k,v]))};
function testLock(url){
 const L=SPEECH_LOCK,f=(dir,map)=>Object.entries(map).map(([p,b])=>({path:p,url:url('/'+dir+'/'+p),size:b.length,sha256:sha(b)}));
 return {...L,engine:{...L.engine,runtimes:{'linux-x64':{...L.engine.runtimes['linux-x64'],url:url('/rt.tgz'),size:RUNTIME.length,sha256:sha(RUNTIME),unpacked:RUNTIME.length*3,addon:'fake-addon.cjs',needs:['fake-addon.cjs']}}},
  hearing:{...L.hearing,files:f('h',H)},voice:{...L.voice,files:f('v',V)}};
}
/** A service on the fake engine. `saved` is the settings store (the app keeps it in its vault). */
async function setup({install=['hearing','voice'],config={},settings={idleMinutes:10},...o}={}){
 const s=await server(FILES),dir=tmp(),logFile=path.join(tmp(),'engine.jsonl');let saved={...settings};
 const svc=new LocalSpeech({dataDir:dir,fetch:globalThis.fetch,getSettings:async()=>saved,setSettings:async v=>{saved=v;},lock:testLock(s.url),platform:'linux',retryDelay:()=>0,threads:3,startTimeout:20000,...o});
 if(install.length)await svc.install({parts:install});
 const configure=c=>{const d=svc.installer.runtimeDir();if(d)fs.writeFileSync(path.join(d,'fake-config.json'),JSON.stringify({log:logFile,...c}));};configure(config);
 const seen=()=>fs.existsSync(logFile)?fs.readFileSync(logFile,'utf8').trim().split('\n').filter(Boolean).map(l=>JSON.parse(l)):[];
 return {svc,s,dir,seen,configure,settings:()=>saved,done:async()=>{await svc.shutdown();await s.close();}};
}
// A 1 s, 16 kHz mono clip like the ones Tyler records from a call.
const CLIP=wavOf(Float32Array.from({length:16000},(_,i)=>Math.sin(2*Math.PI*220*i/16000)*.25),16000).toString('base64');

// ── the lock ─────────────────────────────────────────────────────────────
test('the lock pins sherpa-onnx 1.13.8 (npm packages), Parakeet TDT 0.6B v3 int8 and Kokoro-82M v1.0, each file with its size and SHA-256 at one commit',()=>{
 const L=SPEECH_LOCK;assert.equal(L.engine.version,'1.13.8');assert.equal(L.engine.license,'Apache-2.0');assert.match(L.engine.includes,/espeak-ng \(GPL-3\.0/);
 const rt=L.engine.runtimes;assert.deepEqual(Object.keys(rt).sort(),['linux-x64','windows-x64']);
 for(const [id,r] of Object.entries(rt)){
  assert.match(r.url,/^https:\/\/registry\.npmjs\.org\/sherpa-onnx-(win|linux)-x64\/-\/sherpa-onnx-(win|linux)-x64-1\.13\.8\.tgz$/,id);
  assert.match(r.sha256,/^[0-9a-f]{64}$/);assert.ok(r.size>1e6&&r.unpacked>r.size);assert.equal(r.strip,'package/');assert.equal(r.addon,'sherpa-onnx.node');assert.ok(r.needs.includes('sherpa-onnx.node'));
 }
 assert.equal(rt['windows-x64'].dev,false);assert.equal(rt['linux-x64'].dev,true,'the Linux build is for development and tests only');
 assert.deepEqual([rt['windows-x64'].size,rt['windows-x64'].sha256],[8894875,'fe522f02a5c113c2567a43982107ef41ae517f9a431931e90731e7e4d4341073']);
 const want={hearing:['csukuangfj/sherpa-onnx-nemo-parakeet-tdt-0.6b-v3-int8','2bda32ec70b097a55adaa07d9a7173915b43cc78','CC-BY-4.0',['encoder.int8.onnx','decoder.int8.onnx','joiner.int8.onnx','tokens.txt']],
  voice:['csukuangfj/kokoro-multi-lang-v1_0','f7b96bb6bef5c5da4d3aa4f4e0498fbbf62dc78b','Apache-2.0',['model.onnx','voices.bin','tokens.txt','lexicon-us-en.txt','lexicon-gb-en.txt','espeak-ng-data/phontab','espeak-ng-data/phonindex','espeak-ng-data/phondata','espeak-ng-data/intonations','espeak-ng-data/en_dict']]};
 for(const [part,[repo,rev,lic,must]] of Object.entries(want)){const p=L[part];
  assert.equal(p.repo,repo);assert.equal(p.revision,rev);assert.equal(p.license,lic);assert.ok(p.credit.length>20);
  for(const name of must)assert.ok(p.files.some(f=>f.path===name),part+' has '+name);
  for(const f of p.files){assert.equal(f.url,'https://huggingface.co/'+repo+'/resolve/'+rev+'/'+f.path);assert.ok(f.size>0);assert.match(f.sha256,/^[0-9a-f]{64}$/);assert.ok(!f.path.includes('..')&&!path.isAbsolute(f.path));}
 }
 assert.equal(L.hearing.files.find(f=>f.path==='encoder.int8.onnx').sha256,'acfc2b4456377e15d04f0243af540b7fe7c992f8d898d751cf134c3a55fd2247');
 assert.equal(L.voice.files.find(f=>f.path==='model.onnx').size,325560556,'the float32 model (quicker than int8 on the processor, measured)');
 // Settings' lists (browser-extension/local-ai.mjs) match the lock.
 assert.equal(LOCAL_SPEECH.engine.version,L.engine.version);
 assert.equal(LOCAL_SPEECH.hearing.bytes,L.hearing.files.reduce((n,f)=>n+f.size,0));assert.equal(LOCAL_SPEECH.voice.bytes,L.voice.files.reduce((n,f)=>n+f.size,0));
 assert.deepEqual(KOKORO_VOICES.map(v=>[v.id,v.sid,v.label,v.accent]),L.voice.voices.map(v=>[v.id,v.sid,v.label,v.accent]));
 for(const v of KOKORO_VOICES){assert.ok(v.sid>=0&&v.sid<54);assert.equal(v.id.startsWith('b'),v.accent==='gb');}
 const html=fs.readFileSync(path.join(root,'browser-extension','settings.html'),'utf8');
 // Settings → Voice → Standard voice: Hearing is Cloud or This PC; the three speaking voices are named and
 // described exactly as the owner asked, in this order.
 const cards=name=>[...html.matchAll(new RegExp('<input type="radio" name="'+name+'" value="([a-z]+)"[^>]*><span><b>([^<]+)</b>(?:<small>([^<]*)</small>)?','g'))].map(m=>[m[1],m[2],m[3]??null]);
 assert.deepEqual(cards('voiceHearingPick').map(c=>c.slice(0,2)),[['cloud','Cloud'],['local','This PC']]);
 assert.deepEqual(cards('speechEnginePick'),[['cloud','Cloud voice',null],['theme','Theme voice on this PC','Character voices and your own recordings, cloned'],['kokoro','Voice on this PC (Kokoro)','Stock voices; lighter and quick on the processor']]);
 // The suggestion (never a switch) when the replies and the hearing already run on this PC.
 assert.match(html,/<p class="hint" id="voiceLocalTip" role="status" hidden><b>Tip:<\/b> the replies and the hearing already run on this PC\. Choose <b>Theme voice on this PC<\/b> \(the same character voices\)/);
 const vs=fs.readFileSync(path.join(root,'browser-extension','voice-settings.js'),'utf8');
 assert.match(vs,/tip\.hidden=!\(desktop&&e!=='live'&&ai==='local'&&hearing\(\)==='local'&&speaking\(\)==='cloud'\)/);assert.doesNotMatch(vs.slice(vs.indexOf('voiceLocalTip')-200,vs.indexOf('voiceLocalTip')+300),/speechEngine'\)\.value=/,'it only suggests');
 assert.match(html,/<input id="voiceHearing" type="hidden" value="cloud">/);assert.match(html,/<input id="speechEngine" type="hidden" value="cloud">/);
 assert.deepEqual([...html.matchAll(/<select id="kokoroVoice">(.*?)<\/select>/g)][0][1].match(/value="([^"]+)"/g).map(x=>x.slice(7,-1)),KOKORO_VOICES.map(v=>v.id),'Settings offers the same voices');
 assert.match(html,/Parakeet TDT 0\.6B v3 is by NVIDIA \(CC BY 4\.0\)/,'the CC BY credit is shown');
});
test('voicePlan: hearing and the voice on this PC need no key; each cloud part still uses the key rule of stage 1',()=>{
 assert.deepEqual(voicePlan({aiProvider:'local',voiceHearing:'local',speechEngine:'kokoro'}),{hearing:'local',speech:'kokoro',provider:null,key:'',needsKey:false,hearingError:null,ready:true});
 assert.equal(voicePlan({aiProvider:'local',voiceHearing:'local',speechEngine:'theme'}).needsKey,false,'a theme voice is on this PC too');
 const cloudVoice=voicePlan({aiProvider:'local',voiceHearing:'local',speechEngine:'cloud'});assert.equal(cloudVoice.needsKey,true);assert.equal(cloudVoice.speech,null);assert.equal(cloudVoice.hearing,'local');
 const noHear=voicePlan({aiProvider:'local',speechEngine:'kokoro'});assert.equal(noHear.hearing,null);assert.equal(noHear.hearingError,LOCAL_HEARING_ERROR);assert.match(LOCAL_HEARING_ERROR,/Hearing → This PC/);
 assert.deepEqual(voicePlan({aiProvider:'local',openrouterKey:'sk-or-a',voiceHearing:'local'}).speech,'openrouter','the cloud voice uses the saved OpenRouter key');
 const or=voicePlan({aiProvider:'openrouter',voiceHearing:'local',speechEngine:'kokoro'});assert.equal(or.needsKey,false);assert.equal(or.ready,false,'the replies still need the OpenRouter key');
 assert.equal(voicePlan({aiProvider:'gemini',geminiKey:'AIza',speechEngine:'kokoro'}).hearing,'gemini');
 assert.deepEqual(voiceKeyFor({aiProvider:'local',geminiKey:'AIza'}),{provider:'gemini',key:'AIza',error:null},'stage 1’s rule is unchanged');
});

// ── the installer ────────────────────────────────────────────────────────
test('install: the plan (sizes) first; hearing alone brings the engine; the voice later downloads only its own files',async()=>{
 const s=await server(FILES),dir=tmp(),inst=new SpeechInstaller({dir,fetch:globalThis.fetch,lock:testLock(s.url),platform:'linux',retryDelay:()=>0});
 const hb=Object.values(H).reduce((n,b)=>n+b.length,0),vb=Object.values(V).reduce((n,b)=>n+b.length,0);
 const both=inst.plan({parts:['hearing','voice']});assert.equal(both.download,RUNTIME.length+hb+vb);assert.equal(both.runtimeBytes,RUNTIME.length);assert.equal(both.hearingBytes,hb);assert.equal(both.voiceBytes,vb);
 assert.equal(s.log.length,0,'planning downloads nothing');
 const p=inst.plan({parts:['hearing']});assert.equal(p.download,RUNTIME.length+hb);assert.equal(p.voiceBytes,0);
 const events=[];await inst.install({parts:['hearing']},{onProgress:e=>events.push(e)});
 let st=inst.status();assert.equal(st.runtime,true);assert.equal(st.hearing,true);assert.equal(st.voice,false);
 assert.equal(fs.readFileSync(inst.file('hearing','encoder.int8.onnx')).equals(H['encoder.int8.onnx']),true);
 assert.ok(fs.existsSync(path.join(inst.runtimeDir(),'fake-addon.cjs')),'the package/ folder was dropped');assert.equal(inst.addon(),path.join(inst.runtimeDir(),'fake-addon.cjs'));
 assert.ok(events.some(e=>e.phase==='unpack')&&events.at(-1).phase==='done');
 assert.ok(!fs.readdirSync(inst.downloads).some(f=>f.endsWith('.tgz')),'the engine package is deleted after unpacking');
 s.log.length=0;const pv=inst.plan({parts:['voice']});assert.equal(pv.runtimeBytes,0);assert.equal(pv.download,vb);
 await inst.install({parts:['voice']});assert.ok(!s.log.some(l=>l.url==='/rt.tgz'),'the engine isn’t downloaded again');
 st=inst.status();assert.equal(st.voice,true);assert.ok(fs.existsSync(inst.file('voice','espeak-ng-data/lang/gmw/en-US')),'folders inside a pack are kept');
 assert.deepEqual(inst.plan({parts:['hearing','voice']}).fileCount,0);assert.deepEqual(await inst.verify(),{ok:true,problems:[]});
 fs.writeFileSync(inst.file('voice','voices.bin'),Buffer.alloc(V['voices.bin'].length,1));assert.match((await inst.verify()).problems.join(),/Damaged voice file voices\.bin/);
 await s.close();
});
test('install: a cut-off download resumes with a Range request; a file with the wrong SHA-256 is deleted and never used; an offline folder (flat or in subfolders) is used first',async()=>{
 const s=await server(FILES,{cutFirst:new Set(['/h/encoder.int8.onnx']),lie:new Set(['/v/voices.bin'])});
 const inst=new SpeechInstaller({dir:tmp(),fetch:globalThis.fetch,lock:testLock(s.url),platform:'linux',retryDelay:()=>0});
 await inst.install({parts:['hearing']});
 const enc=s.log.filter(l=>l.url==='/h/encoder.int8.onnx');assert.equal(enc.length,2);assert.match(enc[1].range,/^bytes=\d+-$/,'the second try resumed');
 await assert.rejects(inst.install({parts:['voice']}),e=>e.code==='CHECKSUM'&&/voices\.bin/.test(e.message));
 assert.equal(inst.status().voice,false,'nothing unverified is used');assert.equal(inst.status().hearing,true,'hearing is unaffected');
 await s.close();
 // Offline: the voice's files in a folder, espeak data in its own subfolders; a damaged copy is ignored.
 const off=tmp();for(const [p,b] of Object.entries(V)){const f=path.join(off,p);fs.mkdirSync(path.dirname(f),{recursive:true});fs.writeFileSync(f,p==='model.onnx'?Buffer.alloc(b.length,2):b);}
 const s2=await server(FILES);const inst2=new SpeechInstaller({dir:tmp(),fetch:globalThis.fetch,lock:testLock(s2.url),platform:'linux',retryDelay:()=>0});
 await inst2.install({parts:['voice']},{offline:[off]});
 assert.deepEqual(s2.log.map(l=>l.url).sort(),['/rt.tgz','/v/model.onnx'],'everything else came from the folder; the damaged model was downloaded');
 assert.equal(inst2.status().voice,true);await s2.close();
});
test('remove: hearing or the voice alone; the engine goes when neither is left; removing Text AI on this PC keeps them (and the reverse)',async()=>{
 const s=await server(FILES),dir=tmp(),inst=new SpeechInstaller({dir:path.join(dir,'speech'),fetch:globalThis.fetch,lock:testLock(s.url),platform:'linux',retryDelay:()=>0});
 await inst.install({parts:['hearing','voice']});
 // Text AI on this PC's own folder sits next to it: its Remove leaves speech\ alone.
 fs.mkdirSync(path.join(dir,'engine-b11669-x'),{recursive:true});fs.writeFileSync(path.join(dir,'installed.json'),'{}');
 await new Installer({dir,fetch:globalThis.fetch,platform:'linux'}).remove();
 assert.deepEqual(fs.readdirSync(dir),['speech']);assert.equal(inst.status().hearing,true);
 await inst.remove('hearing');let st=inst.status();assert.equal(st.hearing,false);assert.equal(st.voice,true);assert.equal(st.runtime,true);
 assert.ok(!fs.readdirSync(inst.dir).some(n=>n.startsWith('hearing-')));
 await inst.remove('voice');assert.deepEqual(fs.existsSync(inst.dir)?fs.readdirSync(inst.dir):[],[],'nothing is left');
 await s.close();
});
test('the WAV reader and writer the worker uses: 16-bit and float, mono and stereo',()=>{
 const w=readWav(Buffer.from(CLIP,'base64'));assert.equal(w.sampleRate,16000);assert.equal(w.samples.length,16000);
 const st=Buffer.alloc(44+8);st.write('RIFF',0);st.writeUInt32LE(44,4);st.write('WAVE',8);st.write('fmt ',12);st.writeUInt32LE(16,16);st.writeUInt16LE(3,20);st.writeUInt16LE(2,22);st.writeUInt32LE(8000,24);st.writeUInt32LE(64000,28);st.writeUInt16LE(8,32);st.writeUInt16LE(32,34);st.write('data',36);st.writeUInt32LE(8,40);st.writeFloatLE(.5,44);st.writeFloatLE(-.5,48);
 assert.deepEqual([...readWav(st).samples],[0],'stereo float is mixed to mono');
 assert.throws(()=>readWav(Buffer.from('nope')),/not a WAV/);
 const out=wavOf(new Float32Array([0,1,-1]),24000);assert.equal(out.toString('ascii',0,4),'RIFF');assert.equal(out.readUInt32LE(24),24000);assert.equal(out.readInt16LE(46),32767);assert.equal(out.readInt16LE(48),-32768);
});

// ── the engine processes and the service ─────────────────────────────────
test('nothing starts until a turn needs it; hearing runs in its own process with a short environment, no port and no input; the answer is text',async()=>{
 process.env.TYLER_TEST_SECRET='do-not-pass';
 const t=await setup();
 try{
  assert.equal(t.svc.workers.hearing,null);const st=await t.svc.status();assert.equal(st.running.hearing,null);assert.equal(st.installed.hearing,true);
  assert.equal(t.seen().length,0,'installing and the status started nothing');
  const r=await t.svc.hear({audio:CLIP});assert.equal(r.text,'tyler who wins tank or sniper');assert.equal(r.seconds,1);assert.ok(r.startMs>0,'the first turn includes the load');
  const ev=t.seen(),start=ev.find(e=>e.start),rec=ev.find(e=>e.createRecognizer)?.createRecognizer;
  assert.ok(!start.env.includes('TYLER_TEST_SECRET'),'the environment is a short allowlist');assert.ok(!start.env.includes('ELECTRON_RUN_AS_NODE'),'plain node in the tests');
  assert.equal(start.path.split(path.delimiter)[0],t.svc.installer.runtimeDir(),'the engine’s libraries come first on its path');assert.deepEqual(start.execArgv,[]);
  assert.equal(rec.modelConfig.numThreads,3);assert.equal(rec.modelConfig.provider,'cpu','on the processor');assert.equal(rec.modelConfig.modelType,'nemo_transducer');
  assert.equal(rec.modelConfig.transducer.encoder,t.svc.installer.file('hearing','encoder.int8.onnx'));
  assert.deepEqual(ev.find(e=>e.decode).decode,{samples:16000,rate:16000});
  const pid=t.svc.workers.hearing.pid;assert.notEqual(pid,process.pid);
  if(linux){
   const fds=fs.readdirSync('/proc/'+pid+'/fd').map(fd=>{try{return fs.readlinkSync('/proc/'+pid+'/fd/'+fd);}catch{return '';}});
   const inodes=new Set(fds.map(l=>/^socket:\[(\d+)\]$/.exec(l)?.[1]).filter(Boolean));
   const tcp=['/proc/net/tcp','/proc/net/tcp6','/proc/net/udp','/proc/net/udp6'].filter(f=>fs.existsSync(f)).flatMap(f=>fs.readFileSync(f,'utf8').split('\n').slice(1)).map(l=>l.trim().split(/\s+/)[9]);
   assert.ok(!tcp.some(i=>inodes.has(i)),'no TCP or UDP socket at all: only the channel to the app');
   assert.equal(fs.readlinkSync('/proc/'+pid+'/fd/0'),'/dev/null','its input is closed');
  }
  const again=await t.svc.hear({audio:CLIP});assert.equal(again.startMs,0);assert.equal(t.seen().filter(e=>e.start).length,1,'one process for every turn');
  await assert.rejects(t.svc.hear({audio:''}),/Nothing to hear/);
  await assert.rejects(t.svc.hear({audio:Buffer.from('not audio').toString('base64')}),e=>e.code==='bad_audio');
 }finally{delete process.env.TYLER_TEST_SECRET;await t.done();}
});
test('speaking: Kokoro’s speaker for the chosen voice, a WAV clip back; a British voice restarts it with the British lexicon; Stop ends it',async()=>{
 const t=await setup();
 try{
  const r=await t.svc.speak({text:'Sniper, obviously. Tanks can’t dodge.',voice:'am_puck'});
  assert.equal(r.voice.label,'Puck');const wav=Buffer.from(r.audio,'base64');assert.equal(wav.toString('ascii',0,4),'RIFF');assert.equal(wav.readUInt32LE(24),24000);assert.ok(r.seconds>0&&r.seconds<=30);assert.ok(r.firstMs>=0);
  let ev=t.seen();assert.equal(ev.find(e=>e.generate).generate.sid,18);assert.equal(ev.find(e=>e.generate).generate.external,false,'samples copied: Electron allows no outside buffers');assert.equal(ev.find(e=>e.generate).generate.callback,'function');
  const tts=ev.find(e=>e.createTts).createTts;assert.equal(tts.model.kokoro.lexicon,t.svc.installer.file('voice','lexicon-us-en.txt'));assert.equal(tts.model.kokoro.dataDir,t.svc.installer.file('voice','espeak-ng-data'));assert.equal(tts.model.provider,'cpu');assert.equal(tts.maxNumSentences,1,'sentence by sentence, so the first audio is quick');
  const g=await t.svc.speak({text:'Good game.',voice:'bm_george'});assert.equal(g.voice.label,'George');assert.ok(g.startMs>0,'restarted for the accent');
  ev=t.seen();assert.equal(ev.filter(e=>e.createTts).at(-1).createTts.model.kokoro.lexicon,t.svc.installer.file('voice','lexicon-gb-en.txt'));assert.equal(ev.filter(e=>e.generate).at(-1).generate.sid,26);
  assert.equal((await t.svc.speak({text:'Again.',voice:'unknown'})).voice.label,'Michael','an unknown voice is the default, Michael');
  // Stop in the middle: the engine is told to stop at the next sentence.
  t.configure({mode:'slow-speak'});const ctl=new AbortController();
  const p=t.svc.speak({text:'One. Two. Three. Four. Five.',voice:'am_michael',signal:ctl.signal});setTimeout(()=>ctl.abort(),300);
  await assert.rejects(p,e=>e.code==='cancelled'&&e.message==='Stopped.');
  assert.ok(await until(()=>t.seen().some(e=>e.stopped)),'the engine stopped generating');
  t.configure({mode:'empty'});await assert.rejects(t.svc.speak({text:'Hi there.'}),e=>/made no audio/.test(e.message)&&/didn’t use a cloud service/.test(e.message));
 }finally{await t.done();}
});
test('failures say why and never switch to anything else: not installed, a load failure, a crash in the middle, too long',async()=>{
 const t=await setup({install:['voice']});
 try{
  await assert.rejects(t.svc.hear({audio:CLIP}),e=>e.code==='not_installed'&&e.kind==='fatal'&&/Hearing on this PC isn’t installed yet/.test(e.message)&&/AI on this PC/.test(e.message)&&/didn’t use a cloud service/.test(e.message));
  await t.svc.install({parts:['hearing']});t.configure({mode:'load-fail'});
  await assert.rejects(t.svc.hear({audio:CLIP}),e=>e.kind==='fatal'&&/couldn’t start|couldn’t be loaded/.test(e.message)&&/protobuf/.test(e.message));
  assert.equal(t.svc.workers.hearing,null,'a failed start leaves nothing running');
  t.configure({mode:'crash-hear'});
  await assert.rejects(t.svc.hear({audio:CLIP}),e=>e.code==='crashed'&&e.kind==='turn'&&/closed unexpectedly/.test(e.message)&&/bad_alloc/.test(e.message)&&/didn’t use a cloud service/.test(e.message));
  assert.match((await t.svc.status()).lastError.hearing.message,/closed unexpectedly/);
  t.configure({});const ok=await t.svc.hear({audio:CLIP});assert.equal(ok.text,'tyler who wins tank or sniper','the next turn starts it again');
  t.configure({mode:'slow-hear'});await assert.rejects(t.svc.hear({audio:CLIP,timeoutMs:300}),e=>e.code==='timeout'&&/took too long/.test(e.message));
  const free=new LocalSpeech({dataDir:t.dir,fetch:globalThis.fetch,getSettings:async()=>({}),setSettings:async()=>{},lock:t.svc.lock,platform:'linux',freemem:()=>200*1024**2});
  await assert.rejects(free.hear({audio:CLIP}),e=>e.code==='out_of_memory'&&/needs about 1\.0 GB of free memory/.test(e.message));
  const win=new LocalSpeech({dataDir:tmp(),fetch:globalThis.fetch,getSettings:async()=>({}),setSettings:async()=>{},platform:'darwin'});
  await assert.rejects(win.hear({audio:CLIP}),e=>e.code==='unsupported'&&/need Windows/.test(e.message));
 }finally{await t.done();}
});
test('closing: after the idle time, on Tyler’s pause or stop (release), and when the app quits; two turns at once start one engine',async()=>{
 const t=await setup({settings:{idleMinutes:1},minuteMs:150});
 try{
  const [a,b]=await Promise.all([t.svc.hear({audio:CLIP}),t.svc.hear({audio:CLIP})]);assert.equal(a.text,b.text);assert.equal(t.seen().filter(e=>e.start).length,1);
  const pid=t.svc.workers.hearing.pid;assert.ok(await until(()=>!t.svc.workers.hearing,2000),'closed after the idle time');assert.ok(await until(()=>!alive(pid)),'its process ended');
  await t.svc.hear({audio:CLIP});await t.svc.speak({text:'Hi.'});const pids=[t.svc.workers.hearing.pid,t.svc.workers.voice.pid];
  assert.ok(fs.existsSync(t.svc.pidPath()),'the running engines are noted (to end them after a crash of the app)');
  await t.svc.release('Tyler was stopped in Steam chat');assert.equal(t.svc.workers.hearing,null);assert.equal(t.svc.workers.voice,null);
  assert.ok(await until(()=>pids.every(p=>!alive(p))),'release ends both processes');assert.ok(!fs.existsSync(t.svc.pidPath()));
  await t.svc.speak({text:'Hi.'});const v=t.svc.workers.voice.pid;t.svc.killNow();assert.ok(await until(()=>!alive(v)),'quitting ends it at once');
  await t.svc.saveSettings({idleMinutes:0,secret:'x'});assert.deepEqual(t.settings(),{idleMinutes:0},'only the idle time is kept');
 }finally{await t.done();}
});
test('a voice turn spoken with Kokoro starts the voice engine at once (prepare), so it has loaded when the first sentence is ready',async()=>{
 const t=await setup({install:['hearing']});
 try{
  assert.equal(t.svc.prepare('voice',{voice:'am_michael'}),false,'not installed: nothing starts (the turn itself says why)');
  await t.svc.install({parts:['voice']});t.configure({});
  assert.equal(t.svc.prepare('voice',{voice:'bm_george'}),true);assert.equal(t.svc.prepare('voice',{voice:'bm_george'}),false,'one start at a time');
  assert.ok(await until(()=>!!t.svc.loaded.voice),'loaded in the background');assert.equal(t.svc.loaded.voice.accent,'gb');
  const r=await t.svc.speak({text:'Good game.',voice:'bm_george'});assert.equal(r.startMs,0,'the reply didn’t wait for it to load');
  assert.equal(t.seen().filter(e=>e.createTts).length,1);assert.equal(t.svc.prepare('voice',{voice:'bm_george'}),false,'already running for that voice');
  assert.equal(t.svc.prepare('hearing'),true,'hearing can be prepared too');assert.ok(await until(()=>!!t.svc.loaded.hearing));
  // A start that fails ahead of the turn is quiet; the request that needs it reports it.
  await t.svc.close('all','test');t.configure({mode:'load-fail'});assert.equal(t.svc.prepare('voice',{voice:'am_michael'}),true);
  assert.ok(await until(()=>!t.svc.starting.voice));assert.equal(t.svc.workers.voice,null);
  await assert.rejects(t.svc.speak({text:'Hi.'}),e=>e.kind==='fatal'&&/couldn’t/.test(e.message));
  assert.equal(t.svc.prepare('nonsense'),false);
 }finally{await t.done();}
});
test('an engine whose app went away (crashed) ends by itself; one left behind anyway is ended at the next start, never another program',{skip:!linux},async()=>{
 const t=await setup({install:['hearing']});
 try{
  // A separate "app" process runs the real service and is killed without warning.
  const app=path.join(tmp(),'app.cjs');
  fs.writeFileSync(app,`const {LocalSpeech}=require(${JSON.stringify(path.join(LA,'speech.cjs'))});const lock=JSON.parse(process.argv[3]);
   const s=new LocalSpeech({dataDir:process.argv[2],fetch,getSettings:async()=>({}),setSettings:async()=>{},lock,platform:'linux'});
   s.hear({audio:${JSON.stringify(CLIP)}}).then(()=>{console.log(s.workers.hearing.pid);setInterval(()=>{},1000);});`);
  const child=spawn(process.execPath,[app,t.dir,JSON.stringify(t.svc.lock)],{stdio:['ignore','pipe','inherit']});
  const pid=await new Promise(r=>child.stdout.once('data',d=>r(Number(String(d).trim()))));
  assert.ok(alive(pid));child.kill('SIGKILL');
  assert.ok(await until(()=>!alive(pid),4000),'the engine ended when its app did');
  // A leftover engine (its command line is the worker) and an unrelated process with a recorded number.
  const stray=spawn(process.execPath,['-e','setInterval(()=>{},1000)',path.join(LA,'speech-worker.cjs')],{stdio:'ignore'}),other=spawn(process.execPath,['-e','setInterval(()=>{},1000)'],{stdio:'ignore'});
  await new Promise(r=>setTimeout(r,200));
  fs.writeFileSync(path.join(t.dir,'speech','running.json'),JSON.stringify({pids:{hearing:stray.pid,voice:other.pid}}));
  new LocalSpeech({dataDir:t.dir,fetch:globalThis.fetch,getSettings:async()=>({}),setSettings:async()=>{},lock:t.svc.lock,platform:'linux'});
  assert.ok(await until(()=>!alive(stray.pid)),'the leftover engine was ended');assert.equal(alive(other.pid),true,'another program with a recorded number is left alone');other.kill();
 }finally{await t.done();}
});
test('the quick checks: hearing hears the built-in clip and compares the words; the voice times its first audio; both are kept',async()=>{
 const t=await setup({config:{text:CHECK_TEXT.replace('?','')}});
 try{
  const clip=fs.readFileSync(path.join(LA,'check-clip.wav'));assert.equal(clip.toString('ascii',36,40),'data');assert.equal(clip.readUInt32LE(24),16000,'16 kHz mono, like a call clip');assert.ok(clip.length<=384044);
  const h=await t.svc.check('hearing');assert.equal(h.ok,true);assert.equal(h.words,100);assert.ok(h.seconds>2.5&&h.seconds<4);assert.ok(h.startMs>0);
  const v=await t.svc.check('voice',{voice:'bf_emma'});assert.equal(v.voice,'Emma');assert.ok(typeof v.audio==='string'&&v.firstMs>=0);
  const kept=t.svc.installer.status().checks;assert.equal(kept.hearing.words,100);assert.equal(kept.voice.voice,'Emma');assert.equal(kept.voice.audio,undefined,'the audio isn’t saved');
  t.configure({mode:'load-fail'});await t.svc.close('all','test');
  await assert.rejects(t.svc.check('hearing'),/couldn’t/);assert.equal(t.svc.installer.status().checks.hearing.ok,false);
 }finally{await t.done();}
});
test('desktop wiring: the background gets audio and text only; Settings’ requests; the emergency stop and quitting close the engines',async()=>{
 const s=await server(FILES),rootDir=tmp(),store={kokoroVoice:'bm_george'},listeners=[],sent=[];
 const vault={get:async k=>Object.fromEntries([].concat(k).map(x=>[x,store[x]]))},local={set:async v=>Object.assign(store,v)};
 const app=setupLocalAI({root:rootDir,vault,local,changeListeners:listeners,net:{fetch:globalThis.fetch},shell:{openPath:async()=>''},log:()=>{},send:e=>sent.push(e)});
 try{
  const sp=app.speech;sp.installer=new SpeechInstaller({dir:sp.dir,fetch:globalThis.fetch,lock:testLock(s.url),platform:'linux',retryDelay:()=>0});sp.lock=sp.installer.lock;
  assert.equal(sp.script,path.join(LA,'speech-worker.cjs'));
  const st=await app.settingsRequest('speech-status');assert.equal(st.status.installed.hearing,false);assert.equal(st.status.voices.length,6);
  const plan=await app.settingsRequest('speech-plan',{parts:['hearing','evil']});assert.deepEqual(plan.parts,['hearing']);assert.equal(plan.files,undefined);
  assert.deepEqual(await app.settingsRequest('speech-install',{parts:['hearing','voice']}),{started:true});
  assert.ok(await until(()=>sent.some(e=>e.kind==='speech-install'&&e.phase==='done'&&e.parts),5000));
  fs.writeFileSync(path.join(sp.installer.runtimeDir(),'fake-config.json'),'{}');
  const bridge=globalThis.tylerLocalSpeech;assert.deepEqual(Object.keys(bridge).sort(),['hear','prepare','release','speak','status']);
  const pub=await bridge.status();assert.deepEqual([pub.hearing,pub.voice],[true,true]);assert.ok(!JSON.stringify(pub).includes(rootDir),'no paths');
  assert.equal((await bridge.hear({audio:CLIP})).text,'tyler who wins tank or sniper');
  const c=await app.settingsRequest('speech-check',{part:'voice'});assert.equal(c.voice,'George','the check uses the saved Kokoro voice');
  await app.settingsRequest('speech-settings',{values:{idleMinutes:5,other:1}});assert.deepEqual(store.localSpeech,{idleMinutes:5});
  await assert.rejects(app.settingsRequest('speech-remove',{part:'../x'}),/Unknown part/);
  for(const fn of listeners)fn({v22EmergencyStop:{newValue:true}});
  assert.ok(await until(()=>!sp.workers.hearing&&!sp.workers.voice),'the emergency stop closed both');
  await bridge.speak({text:'Hi.'});const pid=sp.workers.voice.pid;app.kill();assert.ok(await until(()=>!alive(pid)),'quitting ends the engine process');
  assert.equal(globalThis.tylerLocalAI.chat instanceof Function,true,'Text AI on this PC’s bridge is unchanged');
 }finally{delete globalThis.tylerLocalSpeech;delete globalThis.tylerLocalAI;await app.shutdown();await s.close();}
});
test('engine threads: up to 4, about the physical cores',()=>{
 assert.equal(speechThreads(2),2);assert.equal(speechThreads(4),2);assert.equal(speechThreads(8),4);assert.equal(speechThreads(32),4);assert.equal(speechThreads(1),1);
});
test('packaging: the worker is unpacked from the app archive; the built-in clip ships with the app',()=>{
 const cfg=JSON.parse(fs.readFileSync(path.join(root,'electron-builder.desktop.json'),'utf8'));
 assert.ok(cfg.asarUnpack.includes('app/local-ai/speech-worker.cjs'));assert.ok(cfg.files.includes('app/**/*'));
 assert.ok(!JSON.stringify(cfg).includes('runAsNode'),'Electron’s run-as-Node switch stays on (the engines use it)');
 const src=fs.readFileSync(path.join(LA,'speech-worker.cjs'),'utf8');
 assert.ok(!/require\(['"]node:(net|http|https|dgram)['"]\)/.test(src),'the worker opens no network connection');
});

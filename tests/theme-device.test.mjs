// v2.44 theme voices "Runs on": the graphics card, or the processor when the card is full (auto, the default);
// the graphics card only (cuda, as before v2.44); the processor only (cpu). MOCKED: no graphics card and no model.
// The worker is tests/fixtures/fake_voice_worker.py, which plays a full card on request (LOW_VRAM: 1.2 GB free;
// OOM_LOAD: out of memory loading; OOMCUDA/OOMBOTH: out of memory while speaking). Real: the processor path only.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';import path from 'node:path';import os from 'node:os';
import {createRequire} from 'node:module';import {execFileSync} from 'node:child_process';
const require=createRequire(import.meta.url),root=path.resolve(import.meta.dirname,'..'),TV=path.join(root,'app','theme-voices');
const {Installer,LOCK,lockHash}=require(path.join(TV,'installer.cjs'));
const {ThemeVoices}=require(path.join(TV,'service.cjs'));
const {WorkerHost}=require(path.join(TV,'worker.cjs'));
const hardware=require(path.join(TV,'hardware.cjs'));
const GB=1024**3,tmp=()=>fs.mkdtempSync(path.join(os.tmpdir(),'tyler-dev-'));
const python=(()=>{for(const p of ['python3','python'])try{execFileSync(p,['-c','print(1)'],{stdio:'ignore'});return p;}catch{}return null;})();
const loads=[];const orig=WorkerHost.prototype.request;
WorkerHost.prototype.request=function(op,payload,opts){if(op==='load')loads.push({device:payload.device,engine:payload.engine,min:payload.min_free_vram||0});return orig.call(this,op,payload,opts);};

/** A service on a graphics-card engine (the fake worker stands in), with the card's free memory as nvidia-smi reports it. */
function cardService({runtime='windows-cuda',device='auto',vramFree=7*GB,marker=null}={}){
 const dir=tmp(),app=tmp();
 fs.cpSync(path.join(TV,'voices'),path.join(app,'voices'),{recursive:true});
 fs.mkdirSync(path.join(app,'worker'));fs.copyFileSync(path.join(root,'tests','fixtures','fake_voice_worker.py'),path.join(app,'worker','tyler_voice_worker.py'));
 const engine='engine-'+lockHash(runtime);fs.mkdirSync(path.join(dir,engine,'site'),{recursive:true});fs.writeFileSync(path.join(dir,engine,'ok'),'x');
 const mdir='light-'+LOCK.models.light.revision.slice(0,12),mpath=path.join(dir,'models',mdir);fs.mkdirSync(mpath,{recursive:true});if(marker)fs.writeFileSync(path.join(mpath,marker),'x');
 fs.writeFileSync(path.join(dir,'installed.json'),JSON.stringify({format:1,engine,runtime,lock:lockHash(runtime),models:{light:{dir:mdir,revision:LOCK.models.light.revision}}}));
 let saved={mode:'light',device};const hw={os:{platform:'win32'},cpu:{model:'Test CPU',threads:8},ram:{total:32*GB,free:30*GB},gpus:[{vendor:'NVIDIA',name:'NVIDIA GeForce RTX 3060',vramTotal:12*GB,vramFree,driver:'580.88',capability:8.6}],disk:{free:50*GB},at:Date.now()};
 const svc=new ThemeVoices({dataDir:dir,appDir:app,fetch:async()=>{throw Error('no network');},getSettings:async()=>saved,setSettings:async v=>{saved=v;},theme:async()=>'portal',detect:async()=>hw,freemem:()=>30*GB});
 svc.installer.python=()=>python; // the fake worker runs on this machine's Python, whatever the runtime says
 return {svc,hw,mpath,settings:()=>saved,marker:(name,on)=>{const f=path.join(mpath,name);if(on)fs.writeFileSync(f,'x');else fs.rmSync(f,{force:true});}};
}
const FULL=/^The graphics card was full \(1\.2 GB free, the voice needs about 4\.0 GB\), so this voice runs on the processor: much slower\. The card is tried again the next time the engine starts\.$/;

test('v2.44 Runs on: auto, the card full (the engine checks before loading) → the same voice on the processor, said everywhere; it stays there until the engine closes, then the card is used again',{skip:!python&&'needs python3'},async()=>{
 const {svc,marker}=cardService({marker:'LOW_VRAM'});loads.length=0;
 try{
  const a=await svc.speak({text:'Hello from a full card.'});
  assert.equal(a.device,'cpu');assert.match(a.deviceNote,FULL);assert.equal(a.voiceName,'GLaDOS','the same voice');
  assert.deepEqual(loads,[{device:'cuda',engine:'standard',min:Math.round(hardware.NEEDS.light.vram*hardware.FIT)},{device:'cpu',engine:'standard',min:0}],'checked on the card first, then loaded on the processor');
  const st=await svc.status();assert.match(st.deviceNote,FULL);assert.equal(st.loaded.device,'cpu');assert.equal(st.loaded.fallback,'full');
  const b=await svc.speak({text:'A second message.'});assert.equal(b.device,'cpu');assert.match(b.deviceNote,FULL);assert.equal(loads.length,2,'no reload for each message');
  // The card has room again: after the engine closes (the idle timer), the next load uses the card and the note goes.
  marker('LOW_VRAM',false);await svc.closeWorker();assert.equal((await svc.status()).deviceNote,null);
  const c=await svc.speak({text:'Back on the card.'});assert.equal(c.device,'cuda');assert.equal(c.deviceNote,null);assert.deepEqual(loads.at(-1),{device:'cuda',engine:'standard',min:Math.round(hardware.NEEDS.light.vram*hardware.FIT)});
 }finally{await svc.shutdown();}
});

test('v2.44 Runs on: auto, nvidia-smi already shows too little free → the processor at once (with its numbers); out of memory while loading → the processor too',{skip:!python&&'needs python3'},async()=>{
 let {svc}=cardService({vramFree:1.2*GB});loads.length=0;
 try{const a=await svc.speak({text:'Probe says full.'});assert.equal(a.device,'cpu');assert.match(a.deviceNote,FULL);assert.deepEqual(loads,[{device:'cpu',engine:'standard',min:0}],'the card isn\'t even tried');}
 finally{await svc.shutdown();}
 ({svc}=cardService({marker:'OOM_LOAD'}));loads.length=0;
 try{const b=await svc.speak({text:'Out of memory loading.'});assert.equal(b.device,'cpu');assert.match(b.deviceNote,/^The graphics card ran out of memory loading the voice, so this voice runs on the processor: much slower\./);
  assert.deepEqual(loads.map(l=>l.device),['cuda','cpu']);}
 finally{await svc.shutdown();}
});

test('v2.44 Runs on: auto, out of memory while speaking on the card → the processor, and that clip is made once more there; a second failure fails with its reason',{skip:!python&&'needs python3'},async()=>{
 const {svc}=cardService();loads.length=0;
 try{
  const a=await svc.speak({text:'OOMCUDA once.'});assert.equal(a.device,'cpu');assert.match(a.deviceNote,/^The graphics card ran out of memory while speaking, so this voice runs on the processor: much slower\./);
  assert.deepEqual(loads.map(l=>[l.device,l.engine]),[['cuda','standard'],['cpu','standard']]);assert.ok(fs.existsSync(a.file));
  await svc.closeWorker();loads.length=0;
  await assert.rejects(svc.speak({text:'OOMBOTH twice.'}),e=>e.code==='out_of_memory'&&/ran out of memory for the voice model/.test(e.message));
  assert.deepEqual(loads.map(l=>l.device),['cuda','cpu'],'one retry, on the processor, then the reason');
 }finally{await svc.shutdown();}
});

test('v2.44 Runs on: "Graphics card only" stops with the message as before; "Processor only" is unchanged; a fast engine falls back to the standard one on the processor',{skip:!python&&'needs python3'},async()=>{
 let {svc,settings}=cardService({device:'cuda',vramFree:1*GB});loads.length=0;
 try{
  await assert.rejects(svc.speak({text:'Card only, card full.'}),e=>e.code==='low_vram'&&/^Lightweight mode needs about 4\.0 GB of free graphics memory and 1\.0 GB is free right now/.test(e.message));
  assert.deepEqual(loads,[],'nothing loaded anywhere');assert.equal(settings().device,'cuda','never changed by itself');
 }finally{await svc.shutdown();}
 ({svc}=cardService({device:'cuda',marker:'OOM_LOAD'}));loads.length=0;
 try{await assert.rejects(svc.speak({text:'Card only, out of memory.'}),e=>e.code==='out_of_memory'&&/Not enough free graphics memory to load the voice model/.test(e.message));
  assert.deepEqual(loads,[{device:'cuda',engine:'standard',min:0}],'card only: no free-memory check asked (as before v2.44), no processor try');}
 finally{await svc.shutdown();}
 ({svc}=cardService({device:'cuda',marker:'LOW_VRAM'}));loads.length=0;
 try{const a=await svc.speak({text:'Card only, the engine is not asked.'});assert.equal(a.device,'cuda');assert.equal(a.deviceNote,null);}finally{await svc.shutdown();}
 ({svc}=cardService({device:'cpu',marker:'LOW_VRAM'}));loads.length=0;
 try{const a=await svc.speak({text:'Processor only.'});assert.equal(a.device,'cpu');assert.equal(a.deviceNote,null,'no note: it was chosen');assert.deepEqual(loads,[{device:'cpu',engine:'standard',min:0}]);}
 finally{await svc.shutdown();}
 ({svc}=cardService({runtime:'windows-cuda-fast',marker:'LOW_VRAM'}));loads.length=0;
 try{const a=await svc.speak({text:'Fast engine, full card.'});assert.equal(a.device,'cpu');assert.match(a.deviceNote,FULL);
  assert.deepEqual(loads.map(l=>[l.device,l.engine]),[['cuda','fast'],['cpu','standard']],'the fast engine is for the card; the processor uses the standard engine');
  const b=await svc.speak({text:'Still on the processor.'});assert.equal(b.device,'cpu');assert.equal(loads.length,2,'kept until the engine closes');}
 finally{await svc.shutdown();}
});

test('v2.44 vramReserve / hardware.vramNeed (read-only, for other local AI sharing the card): the mode\'s need, 0 for the processor, plus voice conversion when a sharper voice is on',async()=>{
 assert.equal(hardware.vramNeed({mode:'light',device:'auto'}),4*GB);assert.equal(hardware.vramNeed({mode:'quality'}),6.5*GB);assert.equal(hardware.vramNeed({mode:'light',device:'cpu'}),0);
 assert.equal(hardware.vramNeed({mode:'light'},{conversion:true}),4*GB+1.3*GB);
 assert.equal(hardware.fitsCard('light',3.4*GB),true);assert.equal(hardware.fitsCard('light',3.3*GB),false);assert.equal(hardware.fitsCard('light',0),true,'unknown free memory: let the engine decide');
 let {svc}=cardService();assert.deepEqual(await svc.vramReserve(),{bytes:4*GB,mode:'light',device:'auto',onCard:false,fallback:null});
 ({svc}=cardService({device:'cpu'}));assert.equal((await svc.vramReserve()).bytes,0);
 ({svc}=cardService({runtime:'linux-cpu'}));assert.equal((await svc.vramReserve()).bytes,0,'a processor-only engine wants nothing on the card');
});

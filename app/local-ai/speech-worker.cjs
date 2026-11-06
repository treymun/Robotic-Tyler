'use strict';
// ROBOTIC TYLER local AI, stage 2: the hearing or voice engine's own process (v2.39).
//
// The desktop app starts this file as a separate Node.js process (Electron's own executable run as
// Node, or node itself in the tests and the smoke test) with child_process.fork. Its only connection
// is Node's IPC channel to the app: no network listener, no port, and its input is closed. Node's
// IPC channel is read asynchronously on both ends (libuv), so nothing ever blocks waiting on it (the
// Windows pipe problem fixed in v2.37.1 can't happen here), and the engine's work runs on the
// addon's own worker threads, so this process still hears "cancel" and "quit" while it works.
// When the app goes away the channel closes and this process ends by itself.
//
// One process is one engine: hearing (Parakeet through sherpa-onnx's offline recognizer) or voice
// (Kokoro through sherpa-onnx's offline TTS). It loads only the verified addon the app points it at.
//
// Requests: {id, op:'load'|'hear'|'speak'|'cancel'|'quit', ...}; answers: {id, ok, ...} or
// {id, ok:false, error, code}. Events: {event:'ready'}.
const MAX_SECONDS=30; // one clip plays at most 30 s (the same contract as theme voices)
let addon=null,engine=null,kind=null,sampleRate=0,speakers=0;
const cancelled=new Set();
const send=m=>{try{if(process.connected)process.send(m);}catch{}};
const answer=(id,v)=>send({id,ok:true,...v});
const fail=(id,e,code)=>send({id,ok:false,error:String(e?.message||e).slice(0,400),code:code||e?.code||'engine'});

/** 16-bit (or 32-bit float) PCM WAV → mono Float32 samples. */
function readWav(buf){
 if(buf.length<44||buf.toString('ascii',0,4)!=='RIFF'||buf.toString('ascii',8,12)!=='WAVE')throw Object.assign(Error('not a WAV file'),{code:'bad_audio'});
 let o=12,fmt=null,data=null;
 while(o+8<=buf.length){const id=buf.toString('ascii',o,o+4),n=buf.readUInt32LE(o+4);
  if(id==='fmt ')fmt={format:buf.readUInt16LE(o+8),channels:buf.readUInt16LE(o+10),rate:buf.readUInt32LE(o+12),bits:buf.readUInt16LE(o+22)};
  if(id==='data'){data=buf.subarray(o+8,Math.min(buf.length,o+8+n));break;}
  o+=8+n+(n&1);}
 if(!fmt||!data||!fmt.channels||!fmt.rate)throw Object.assign(Error('the WAV file has no audio'),{code:'bad_audio'});
 const pcm16=fmt.format===1&&fmt.bits===16,f32=fmt.format===3&&fmt.bits===32;if(!pcm16&&!f32)throw Object.assign(Error('only 16-bit or float WAV audio can be heard'),{code:'bad_audio'});
 const step=(pcm16?2:4)*fmt.channels,frames=Math.floor(data.length/step),out=new Float32Array(frames);
 for(let i=0;i<frames;i++){let s=0;for(let c=0;c<fmt.channels;c++){const at=i*step+c*(pcm16?2:4);s+=pcm16?data.readInt16LE(at)/32768:data.readFloatLE(at);}out[i]=s/fmt.channels;}
 return {samples:out,sampleRate:fmt.rate};
}
/** Mono Float32 samples → a 16-bit PCM WAV (what Tyler's players take). */
function wavOf(samples,rate){
 const n=samples.length,b=Buffer.alloc(44+n*2);
 b.write('RIFF',0);b.writeUInt32LE(36+n*2,4);b.write('WAVE',8);b.write('fmt ',12);b.writeUInt32LE(16,16);b.writeUInt16LE(1,20);b.writeUInt16LE(1,22);b.writeUInt32LE(rate,24);b.writeUInt32LE(rate*2,28);b.writeUInt16LE(2,32);b.writeUInt16LE(16,34);b.write('data',36);b.writeUInt32LE(n*2,40);
 for(let i=0;i<n;i++){const v=Math.max(-1,Math.min(1,samples[i]||0));b.writeInt16LE(Math.round(v<0?v*32768:v*32767),44+i*2);}
 return b;
}

async function load(m){
 if(engine)throw Object.assign(Error('already loaded'),{code:'busy'});
 kind=m.kind;const t0=Date.now();
 try{addon=require(m.addon);}catch(e){throw Object.assign(Error('the speech engine couldn’t be loaded: '+String(e.message).split('\n')[0]),{code:'addon'});}
 if(kind==='hearing'){
  const c=m.config;
  engine=await addon.createOfflineRecognizerAsync({featConfig:{sampleRate:16000,featureDim:80},
   modelConfig:{transducer:{encoder:c.encoder,decoder:c.decoder,joiner:c.joiner},tokens:c.tokens,numThreads:c.threads,provider:'cpu',debug:0,modelType:'nemo_transducer'},
   decodingMethod:'greedy_search'});
 }else if(kind==='voice'){
  const c=m.config;
  engine=await addon.createOfflineTtsAsync({model:{kokoro:{model:c.model,voices:c.voices,tokens:c.tokens,dataDir:c.dataDir,lexicon:c.lexicon,lang:''},numThreads:c.threads,provider:'cpu',debug:0},maxNumSentences:1});
  sampleRate=addon.getOfflineTtsSampleRate(engine);speakers=addon.getOfflineTtsNumSpeakers(engine);
 }else throw Object.assign(Error('unknown engine '+kind),{code:'bad_request'});
 if(!engine)throw Object.assign(Error('the '+kind+' model couldn’t be loaded'),{code:'model_load'});
 return {ms:Date.now()-t0,sampleRate,speakers};
}
async function hear(m){
 if(kind!=='hearing'||!engine)throw Object.assign(Error('hearing isn’t loaded'),{code:'not_loaded'});
 const wave=readWav(Buffer.from(String(m.audio||''),'base64')),t0=Date.now();
 const stream=addon.createOfflineStream(engine);addon.acceptWaveformOffline(stream,wave);
 const r=JSON.parse(await addon.decodeOfflineStreamAsync(engine,stream));
 return {text:String(r.text||'').trim(),lang:r.lang||null,ms:Date.now()-t0,seconds:+(wave.samples.length/wave.sampleRate).toFixed(2)};
}
async function speak(m){
 if(kind!=='voice'||!engine)throw Object.assign(Error('the voice isn’t loaded'),{code:'not_loaded'});
 const text=String(m.text||'').trim();if(!text)throw Object.assign(Error('nothing to say'),{code:'bad_request'});
 const sid=Number.isInteger(m.sid)&&m.sid>=0&&m.sid<speakers?m.sid:0,speed=Math.max(.5,Math.min(2,Number(m.speed)||1));
 const t0=Date.now();let firstMs=null;
 // enableExternalBuffer:false: the samples are copied into a normal buffer. Electron's V8 doesn't allow
 // buffers that point outside its own memory, so the addon's default (no copy) fails there with
 // "TTS settlement failed" (found with Electron 45 on Linux; plain Node accepts either).
 const g=await addon.offlineTtsGenerateAsync(engine,{text,sid,speed,enableExternalBuffer:false,callback:()=>{if(firstMs===null)firstMs=Date.now()-t0;return cancelled.has(m.id)?0:1;}});
 if(cancelled.has(m.id))throw Object.assign(Error('Stopped.'),{code:'cancelled'});
 let samples=g?.samples;const rate=g?.sampleRate||sampleRate;
 if(!samples||!samples.length)throw Object.assign(Error('the voice made no audio'),{code:'empty'});
 const cut=samples.length>rate*MAX_SECONDS;if(cut)samples=samples.subarray(0,rate*MAX_SECONDS);
 return {audio:wavOf(samples,rate).toString('base64'),seconds:+(samples.length/rate).toFixed(2),sampleRate:rate,ms:Date.now()-t0,firstMs:firstMs??Date.now()-t0,cut};
}
const ops={load,hear,speak};
if(require.main===module){
 process.on('message',m=>{
  if(!m||typeof m!=='object')return;
  if(m.op==='quit'){process.exit(0);}
  if(m.op==='cancel'){cancelled.add(m.target);if(cancelled.size>200)cancelled.delete(cancelled.values().next().value);return;}
  const fn=ops[m.op];if(!fn)return fail(m.id,'unknown request','bad_request');
  Promise.resolve().then(()=>fn(m)).then(v=>answer(m.id,v),e=>fail(m.id,e)).finally(()=>cancelled.delete(m.id));
 });
 // The app closed (or crashed): end too, so nothing is left holding memory.
 process.on('disconnect',()=>process.exit(0));
 process.on('uncaughtException',e=>{send({event:'error',error:String(e?.message||e).slice(0,300)});process.exit(70);});
 send({event:'ready',pid:process.pid,node:process.versions.node,electron:process.versions.electron||null});
}
module.exports={readWav,wavOf};

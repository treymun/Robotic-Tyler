'use strict';
// A FAKE sherpa-onnx Node addon for the tests (v2.39): the same functions Tyler's speech worker calls
// (app/local-ai/speech-worker.cjs), with no model. The real worker process loads this file in place of
// sherpa-onnx.node. What it does is set by fake-config.json next to it:
//   {log, text, mode: 'ok' | 'load-fail' | 'crash-hear' | 'crash-speak' | 'slow-hear' | 'slow-speak' | 'empty'}
// Every call is written to `log` as one JSON line (with this process's id and environment names).
const fs=require('node:fs'),path=require('node:path');
const cfg=()=>{try{return JSON.parse(fs.readFileSync(path.join(__dirname,'fake-config.json'),'utf8'));}catch{return {};}};
const log=e=>{const c=cfg();if(c.log)fs.appendFileSync(c.log,JSON.stringify({pid:process.pid,...e})+'\n');};
const wait=ms=>new Promise(r=>setTimeout(r,ms));
log({start:true,env:Object.keys(process.env).sort(),path:process.env.PATH||'',cwd:process.cwd(),execArgv:process.execArgv});
module.exports={
 async createOfflineRecognizerAsync(config){log({createRecognizer:config});if(cfg().mode==='load-fail')throw Error('Failed to load model: protobuf parsing failed');await wait(20);return {kind:'asr'};},
 createOfflineStream(){return {samples:null,rate:0};},
 acceptWaveformOffline(stream,w){stream.samples=w.samples.length;stream.rate=w.sampleRate;},
 async decodeOfflineStreamAsync(rec,stream){const c=cfg();log({decode:{samples:stream.samples,rate:stream.rate}});
  if(c.mode==='crash-hear'){process.stderr.write('Fatal: std::bad_alloc in the encoder\n');setTimeout(()=>process.exit(3),5);await wait(1000);}
  if(c.mode==='slow-hear')await wait(4000);else await wait(10);
  return JSON.stringify({text:c.text??'tyler who wins tank or sniper',lang:'en',tokens:[],timestamps:[]});},
 async createOfflineTtsAsync(config){log({createTts:config});if(cfg().mode==='load-fail')throw Error('Failed to load model');await wait(20);return {kind:'tts'};},
 getOfflineTtsSampleRate(){return 24000;},
 getOfflineTtsNumSpeakers(){return 54;},
 async offlineTtsGenerateAsync(tts,o){
  const c=cfg();log({generate:{text:o.text,sid:o.sid,speed:o.speed,callback:typeof o.callback,external:o.enableExternalBuffer}});
  // Electron refuses buffers outside its own memory: like the real addon there, fail unless copying is asked for.
  if(o.enableExternalBuffer!==false&&c.electronLike)throw Error('TTS settlement failed');
  if(c.mode==='crash-speak')setTimeout(()=>process.exit(4),5);
  if(c.mode==='empty')return {samples:new Float32Array(0),sampleRate:24000};
  // One chunk per sentence, like sherpa-onnx with maxNumSentences 1: the callback can stop it.
  const parts=String(o.text).match(/[^.!?]+[.!?]*/g)||[o.text],out=[];
  for(const p of parts){await wait(c.mode==='slow-speak'?600:15);const n=Math.round(24000*Math.max(.2,p.length*.06)),s=new Float32Array(n);for(let i=0;i<n;i++)s[i]=Math.sin(2*Math.PI*220*i/24000)*.3;out.push(s);
   if(o.callback&&o.callback({samples:s,progress:out.length/parts.length})===0){log({stopped:true});break;}}
  const all=new Float32Array(out.reduce((n,s)=>n+s.length,0));let at=0;for(const s of out){all.set(s,at);at+=s.length;}
  return {samples:all,sampleRate:24000};
 },
};

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as ort from '../browser-extension/neural/ort.wasm.min.mjs';
import {SpeechDetector} from '../browser-extension/neural/speech-detector.mjs';
ort.env.wasm.wasmPaths=new URL('../browser-extension/neural/',import.meta.url).href;
function readSpeech(){
 const b=fs.readFileSync(new URL('fixtures/synthetic-speech.wav',import.meta.url));
 let at=12,rate,bits,channels,pcm;
 while(at+8<=b.length){const id=b.toString('ascii',at,at+4),size=b.readUInt32LE(at+4);if(id==='fmt '){assert.equal(b.readUInt16LE(at+8),1);channels=b.readUInt16LE(at+10);rate=b.readUInt32LE(at+12);bits=b.readUInt16LE(at+22);}if(id==='data')pcm=b.subarray(at+8,at+8+size);at+=8+size+(size%2);}
 assert.equal(bits,16);const n=Math.floor(pcm.length/2/channels*16000/rate),out=new Float32Array(n);
 for(let i=0;i<n;i++)out[i]=pcm.readInt16LE(Math.floor(i*rate/16000)*channels*2)/32768;
 return out;
}
test('real bundled ONNX model accepts generated speech and rejects synthetic keyboard-only noise',async()=>{
 const engine=await SpeechDetector.create(ort,fs.readFileSync(new URL('../browser-extension/neural/silero_vad_v5.onnx',import.meta.url)));
 try{
  const clicks=new Float32Array(32000);
  for(let at=0;at<clicks.length;at+=1200)for(let j=0;j<100&&at+j<clicks.length;j++)clicks[at+j]=.7*Math.exp(-j/14)*Math.sin(j*1.8);
  const speech=readSpeech(),mixed=speech.slice();
  for(let at=0;at<mixed.length;at+=1300)for(let j=0;j<70&&at+j<mixed.length;j++)mixed[at+j]+=.15*Math.exp(-j/12)*Math.sin(j*1.8);
  const quiet=await engine.classify(new Float32Array(16000));
  const typing=await engine.classify(clicks);
  const spoken=await engine.classify(speech);
  const both=await engine.classify(mixed);
  assert.equal(quiet.speech,false,JSON.stringify(quiet));assert.equal(typing.speech,false,JSON.stringify(typing));
  assert.equal(spoken.speech,true,JSON.stringify(spoken));assert.equal(both.speech,true,JSON.stringify(both));
 }finally{await engine.session.release();}
});

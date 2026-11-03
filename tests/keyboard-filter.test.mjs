import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const read=f=>readFileSync(new URL('../browser-extension/'+f,import.meta.url),'utf8');
const wave=()=>Float32Array.from({length:1024},(_,i)=>.08*Math.sin(i*.15));
const click=()=>{const a=new Float32Array(1024);a[400]=1;return a;};
test('gate rejects high-peak clicks and requires sustained audio rather than one loud frame',()=>{
 const box={};vm.runInNewContext(read('noise-filter.js'),box);const gate=new box.TylerNoise.SpeechGate();
 for(let i=0;i<20;i++){const r=gate.frame(click(),.01);assert.equal(r.impulse,true);assert.equal(r.ready,false);}
 assert.equal(gate.frame(wave(),.01).ready,false);assert.equal(gate.frame(wave(),.01).ready,false);assert.equal(gate.frame(wave(),.01).ready,true);
 gate.reset();assert.equal(gate.frame(wave(),.01).ready,false);
 assert.equal(box.TylerNoise.configure({}).keyboardFilter,true);
 assert.equal(box.TylerNoise.configure({keyboardFilter:false}).keyboardFilter,false);
});
test('live listener captures candidate audio for neural classification instead of using the old impulse gate',async()=>{
 let handler,tick,now=10000,samples=click(),captures=0;
 const nodes=[];
 const node=()=>{const n={frequency:{value:0},connect(target){this.target=target;},disconnect(){}};nodes.push(n);return n;};
 class Audio {
  constructor(){this.state='running';}
  createMediaStreamDestination(){return {...node(),stream:{}};}
  createAnalyser(){return {...node(),getFloatTimeDomainData(out){out.set(samples);}};}
  createBiquadFilter(){return node();}
  createMediaStreamSource(){return node();}
  async resume(){}
 }
 class Recorder {static isTypeSupported(){return true;}constructor(){this.state='inactive';}start(){this.state='recording';captures++;}stop(){this.state='inactive';}}
 class Peer {addEventListener(){}getReceivers(){return [{track:{kind:'audio',readyState:'live'}}];}}
 const box={TylerNeural:{ready:async()=>({ok:true})},AudioContext:Audio,MediaRecorder:Recorder,MediaStream:class{},Float32Array,Date:{now:()=>now},location:{origin:'https://steamcommunity.com'},setInterval:(fn,ms)=>{if(ms===50)tick=fn;},clearInterval(){},window:{RTCPeerConnection:Peer,postMessage(){},addEventListener:(_name,fn)=>{handler=fn;}}};
 vm.runInNewContext(read('noise-filter.js'),box);vm.runInNewContext(read('voice-listener.js'),box);
 new box.window.RTCPeerConnection();
 const control=type=>handler({source:box.window,origin:box.location.origin,data:{source:'tyler-listener-control',type,voiceThreshold:.01,keyboardFilter:true}});
 await control('on');
 assert.equal(nodes.filter(n=>n.type==='highpass')[0].frequency.value,80);
 assert.equal(nodes.filter(n=>n.type==='lowpass')[0].frequency.value,7600);
 for(let i=0;i<20;i++){now+=50;tick();}assert.equal(captures,1);
 samples=wave();for(let i=0;i<4;i++){now+=50;tick();}assert.equal(captures,1);
});

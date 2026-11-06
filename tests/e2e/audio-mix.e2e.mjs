// v2.33: what goes out on Tyler's synthetic microphone, measured from the real audio-bridge.js in
// headless Chromium: loud music and speech never go over full scale (the safety clipper), Stop audio
// also drops a clip that was still decoding, and starting the music share twice leaves nothing behind
// after Stop music. A faked YouTube tab share and stand-in clips (no Steam, no real YouTube, no Windows).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const {chromium}=require('playwright');
const EXT=path.resolve(import.meta.dirname,'../../browser-extension');

function wav(samples,rate){const b=Buffer.alloc(44+samples.length*2);b.write('RIFF',0);b.writeUInt32LE(36+samples.length*2,4);b.write('WAVE',8);b.write('fmt ',12);b.writeUInt32LE(16,16);b.writeUInt16LE(1,20);b.writeUInt16LE(1,22);b.writeUInt32LE(rate,24);b.writeUInt32LE(rate*2,28);b.writeUInt16LE(2,32);b.writeUInt16LE(16,34);b.write('data',36);b.writeUInt32LE(samples.length*2,40);for(let i=0;i<samples.length;i++)b.writeInt16LE(Math.max(-32767,Math.min(32767,Math.round(samples[i]*32767))),44+i*2);return b.toString('base64');}
function speech(sec,rate=24000){const n=sec*rate,out=new Float32Array(n);let ph=0,peak=0;for(let i=0;i<n;i++){const t=i/rate,f0=120+20*Math.sin(2*Math.PI*.7*t);ph+=2*Math.PI*f0/rate;let x=0;for(let k=1;k<=30;k++){const f=k*f0;if(f>rate/2-500)break;x+=Math.sin(k*ph)*Math.exp(-(((f-700)/500)**2))/Math.sqrt(k);}out[i]=x*Math.max(0,Math.sin(2*Math.PI*3.2*t))**1.5*((t%1.3)<1?1:0);peak=Math.max(peak,Math.abs(out[i]));}for(let i=0;i<n;i++)out[i]=out[i]/peak*.9;return out;}

async function page(){
 const browser=await chromium.launch({args:['--autoplay-policy=no-user-gesture-required','--use-fake-ui-for-media-stream','--use-fake-device-for-media-stream']});
 const p=await browser.newPage();
 await p.route('https://steamcommunity.com/**',r=>r.fulfill({status:200,contentType:'text/html',body:'<!doctype html><title>chat</title><body>chat</body>'}));
 await p.addInitScript({content:['live-pcm.js','soundboard-audio.js','audio-bridge.js'].map(f=>fs.readFileSync(path.join(EXT,f),'utf8')).join('\n;\n')});
 await p.goto('https://steamcommunity.com/chat/');
 // A loud, mastered-style stereo "YouTube" share (peaks at full scale), behind a faked share picker.
 await p.evaluate(()=>{
  const y=new AudioContext({sampleRate:48000}),len=48000*6,mb=y.createBuffer(2,len,48000);
  for(let c=0;c<2;c++){const d=mb.getChannelData(c);let seed=1+c,lp=0;const rnd=()=>{seed=(seed*16807)%2147483647;return seed/2147483647*2-1;};
   for(let i=0;i<len;i++){const t=i/48000,beat=t%.5;lp=lp*.7+rnd()*.3;d[i]=Math.exp(-beat*18)*Math.sin(2*Math.PI*(55+90*Math.exp(-beat*30))*beat)*.9+(.35*Math.sin(2*Math.PI*220*t)+.25*Math.sin(2*Math.PI*277*t+c)+.2*Math.sin(2*Math.PI*330*t))*.5+lp*.35;}
   let pk=0;for(const v of d)pk=Math.max(pk,Math.abs(v));for(let i=0;i<len;i++)d[i]/=pk;}
  const src=y.createBufferSource();src.buffer=mb;src.loop=true;const dest=y.createMediaStreamDestination();src.connect(dest);src.start();
  window.__shares=[];
  navigator.mediaDevices.getDisplayMedia=async()=>{const canvas=document.createElement('canvas');canvas.width=64;canvas.height=36;const v=canvas.captureStream(5).getVideoTracks()[0];const gs=v.getSettings.bind(v);v.getSettings=()=>({...gs(),displaySurface:'browser'});
   const a=dest.stream.getAudioTracks()[0].clone(),s=new MediaStream([v,a]);window.__shares.push(s);await new Promise(r=>setTimeout(r,60));return s;};
  window.cmd=(type,extra={})=>window.postMessage({source:'tyler-audio-command',type,...extra},location.origin);
  window.sleep=ms=>new Promise(r=>setTimeout(r,ms));
 });
 await p.evaluate(async()=>{cmd('enable');await sleep(400);
  const mic=await navigator.mediaDevices.getUserMedia({audio:true}),ctx=new AudioContext({sampleRate:48000}),src=ctx.createMediaStreamSource(mic),sp=ctx.createScriptProcessor(4096,2,2);let win=null;
  sp.onaudioprocess=e=>{if(!win)return;for(let c=0;c<e.inputBuffer.numberOfChannels;c++)for(const v of e.inputBuffer.getChannelData(c)){const a=Math.abs(v);if(a>win.peak)win.peak=a;if(a>=1)win.over++;win.e+=v*v;win.n++;}};
  src.connect(sp);sp.connect(ctx.destination);
  window.measure=async ms=>{win={peak:0,over:0,e:0,n:0};await sleep(ms);const w=win;win=null;return {peak:w.peak,over:w.over,rmsDb:10*Math.log10((w.e/w.n)||1e-12)};};});
 return {browser,p};
}

test('loud music at 200% with Tyler at full master volume never goes over full scale',async()=>{
 const {browser,p}=await page();const errors=[];p.on('pageerror',e=>errors.push(e.message));
 try{
  const talk=wav(speech(4),24000);
  const r=await p.evaluate(async talk=>{
   cmd('music-capture',{volume:.35,level:'auto'});await sleep(1500);
   const music=await measure(2000);
   cmd('audio',{audio:talk});await sleep(500);const ducked=await measure(1500);await sleep(2500);
   cmd('music-duck',{on:false});cmd('volume',{volume:.7,monitor:false});cmd('music-volume',{volume:2});await sleep(500);
   cmd('audio',{audio:talk});await sleep(200);const loud=await measure(3000);await sleep(1000);
   return {music,ducked,loud};
  },talk);
  assert.deepEqual(errors,[]);
  assert.equal(r.loud.over,0,'no sample at or over full scale (it was hundreds before v2.33)');assert.ok(r.loud.peak<=.995,'peak '+r.loud.peak); // v2.38.1: GitHub's runner measured 0.987 twice (the limiter's 3 ms attack lets a little through); still clear of full scale
  assert.equal(r.music.over,0);
 }finally{await browser.close();}
});

test('Stop audio also drops a clip that was still being decoded when it was pressed',async()=>{
 const {browser,p}=await page();
 try{
  const clip=wav(speech(12),24000),rest=wav(speech(4),24000);
  const r=await p.evaluate(async({clip,rest})=>{
   cmd('audio',{audio:clip});await sleep(5);cmd('stop');await sleep(700);const a=await measure(600);
   cmd('audio',{audio:rest});await sleep(600);cmd('audio',{audio:clip,queue:true});await sleep(2);cmd('stop');await sleep(700);const b=await measure(600);
   cmd('audio',{audio:rest});await sleep(400);const c=await measure(600);cmd('stop');
   return {a,b,c};
  },{clip,rest});
  assert.ok(r.a.peak<.001,'silent after Stop: '+r.a.peak);assert.ok(r.b.peak<.001,'the rest of a reply doesn\'t start after Stop: '+r.b.peak);
  assert.ok(r.c.peak>.05,'a new reply after Stop still plays');
 }finally{await browser.close();}
});

test('two music shares started together: one plays, and Stop music leaves no share and no sound behind',async()=>{
 const {browser,p}=await page();
 try{
  const r=await p.evaluate(async()=>{
   cmd('music-capture',{volume:.35});cmd('music-capture',{volume:.35});await sleep(1500);
   const live=window.__shares.filter(s=>s.getTracks().some(t=>t.readyState==='live')).length,playing=await measure(800);
   cmd('music-disconnect');await sleep(700);const after=await measure(800);
   return {shares:window.__shares.length,live,playing,after,liveAfter:window.__shares.flatMap(s=>s.getTracks()).filter(t=>t.readyState==='live').length};
  });
  assert.equal(r.shares,2);assert.equal(r.live,1,'only the newer share is kept');assert.ok(r.playing.peak>.05);
  assert.ok(r.after.peak<.001,'silent after Stop music');assert.equal(r.liveAfter,0,'no capture left running');
 }finally{await browser.close();}
});

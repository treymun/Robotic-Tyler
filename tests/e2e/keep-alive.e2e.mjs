// End-to-end (v2.24): Stay connected, in real Chromium with the real audio bridge.
//  - In a quiet call, Tyler hums once after the chosen time, on his outgoing microphone, at a soft
//    level; any sound he makes resets the clock; outside a call nothing plays.
//  - Chrome's tab keep-awake opens a data channel inside the page that never counts as a Steam call.
// A stand-in call (two RTCPeerConnections on this machine, as in the music test). No Steam: what
// Steam's server counts as activity, and its one-hour limit, are not tested here.
import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const {chromium}=require('playwright');
const ROOT=path.resolve(import.meta.dirname,'../..');

const PAGE=`<!doctype html><meta charset="utf-8"><title>Keep alive</title><body><script>
window.__keep=[];window.__status=[];addEventListener('message',e=>{if(e.data?.source==='tyler-keepalive')__keep.push(e.data);if(e.data?.source==='tyler-audio-status')__status.push(e.data);});
window.cmd=(type,extra={})=>window.postMessage({source:'tyler-audio-command',type,...extra},location.origin);
window.call=async()=>{cmd('enable');await new Promise(r=>setTimeout(r,200));const mic=await navigator.mediaDevices.getUserMedia({audio:true});
 const a=new RTCPeerConnection(),b=new RTCPeerConnection();a.onicecandidate=e=>e.candidate&&b.addIceCandidate(e.candidate);b.onicecandidate=e=>e.candidate&&a.addIceCandidate(e.candidate);
 a.addTrack(mic.getAudioTracks()[0],mic);b.ontrack=e=>{const el=new Audio();el.srcObject=e.streams[0];el.muted=true;el.play().catch(()=>{});};
 await a.setLocalDescription(await a.createOffer());await b.setRemoteDescription(a.localDescription);await b.setLocalDescription(await b.createAnswer());await a.setRemoteDescription(b.localDescription);
 for(let i=0;i<50&&a.connectionState!=='connected';i++)await new Promise(r=>setTimeout(r,100));window.__call=[a,b];return a.connectionState;};
// Tyler's outgoing microphone as RMS per 10 ms.
window.record=async seconds=>{const mic=await navigator.mediaDevices.getUserMedia({audio:true});const ctx=new AudioContext();await ctx.resume();const src=ctx.createMediaStreamSource(mic),sp=ctx.createScriptProcessor(1024,1,1),z=ctx.createGain();z.gain.value=0;const out=[];let n=0,acc=0,cnt=0;const block=Math.round(ctx.sampleRate/100);
 return new Promise(res=>{sp.onaudioprocess=e=>{const d=e.inputBuffer.getChannelData(0);for(const x of d){acc+=x*x;cnt++;if(cnt===block){out.push(Math.sqrt(acc/cnt));acc=0;cnt=0;}}n+=d.length;if(n>=ctx.sampleRate*seconds){sp.disconnect();res(out);}};src.connect(sp);sp.connect(z);z.connect(ctx.destination);});};
</script><script src="/browser-extension/live-pcm.js"></script><script src="/browser-extension/soundboard-audio.js"></script><script src="/browser-extension/audio-bridge.js"></script>`;

test('Stay connected: a soft hum in a quiet call, reset by any sound, none outside a call; keep-awake is not a call (real Chromium)',{timeout:120000},async()=>{
 const server=http.createServer((req,res)=>{const url=new URL(req.url,'http://x');if(url.pathname==='/'){res.writeHead(200,{'content-type':'text/html'});res.end(PAGE);return;}
  const file=path.join(ROOT,decodeURIComponent(url.pathname));if(!file.startsWith(ROOT)||!fs.existsSync(file)){res.writeHead(404);res.end();return;}res.writeHead(200,{'content-type':'text/javascript'});fs.createReadStream(file).pipe(res);}).listen(0);
 const browser=await chromium.launch({args:['--autoplay-policy=no-user-gesture-required']});
 try{
  const page=await browser.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('http://127.0.0.1:'+server.address().port+'/');
  // Chrome's keep-awake: a data channel inside the page, never one of Steam's calls.
  await page.evaluate(()=>cmd('tab-awake',{on:true}));await page.waitForTimeout(1200);await page.evaluate(()=>cmd('tab-awake',{on:true}));await page.waitForTimeout(200);
  assert.equal(await page.evaluate(()=>__keep.filter(k=>k.reason==='tab').at(-1)?.awake),'open','the data channel opens');
  await page.evaluate(()=>cmd('status'));await page.waitForTimeout(200);
  assert.equal(await page.evaluate(()=>__status.at(-1)?.voice?.peers),0,'the keep-awake connections are not counted as a call');

  // Outside a call: no hum, even with a tiny interval.
  await page.evaluate(()=>{cmd('enable');cmd('keepalive',{on:true,minutes:.05});});await page.waitForTimeout(4500);
  assert.equal(await page.evaluate(()=>__keep.filter(k=>k.reason==='quiet').length),0,'nothing plays outside a call');

  // In a quiet call: one hum after about 3 s of quiet, soft, about 0.9 s long.
  assert.equal(await page.evaluate(()=>call()),'connected');
  const levels=await page.evaluate(async()=>{__keep.length=0;return record(5.5);});
  const hums=await page.evaluate(()=>__keep.filter(k=>k.reason==='quiet'));
  assert.ok(hums.length>=1,'a hum: '+JSON.stringify(hums));
  // A slow machine can stretch the recording past a second quiet spell: the next hum only comes a
  // whole quiet interval after the first.
  if(hums.length>1)assert.ok(hums[1].at-hums[0].at>=2900,'no sooner than the next quiet interval');
  const all=levels.map((v,i)=>[i,v]).filter(([,v])=>v>.002),loud=all.filter(([i])=>i<all[0][0]+150);
  assert.ok(loud.length>=60&&loud.length<=100,'about 0.9 s of sound: '+loud.length*10+' ms');
  const peak=Math.max(...levels),db=20*Math.log10(peak);
  assert.ok(db<-22&&db>-40,'soft: '+db.toFixed(1)+' dBFS at the default volume');
  assert.ok(loud[0][0]>=200,'only after the quiet time (3 s from joining): starts '+loud[0][0]*10+' ms into the recording');

  // Any sound from Tyler resets the clock: beeps every 2 s, no hum.
  await page.evaluate(async()=>{__keep.length=0;for(let i=0;i<3;i++){cmd('sound',{sound:'beep'});await new Promise(r=>setTimeout(r,2000));}});
  assert.equal(await page.evaluate(()=>__keep.filter(k=>k.reason==='quiet').length),0,'his own sounds count as activity');
  // Turned off: no hum.
  await page.evaluate(()=>{__keep.length=0;cmd('keepalive',{on:false,minutes:.05});});await page.waitForTimeout(4500);
  assert.equal(await page.evaluate(()=>__keep.filter(k=>k.reason==='quiet').length),0,'off means off');
  // The panel's status: in a call, how long it has been quiet.
  await page.evaluate(()=>cmd('keepalive',{on:true,minutes:45}));await page.waitForTimeout(200);
  const st=await page.evaluate(()=>__keep.filter(k=>k.reason==='status').at(-1));
  assert.deepEqual({on:st.on,minutes:st.minutes,inCall:st.inCall},{on:true,minutes:45,inCall:true});
  await page.evaluate(()=>cmd('tab-awake',{on:false}));
  assert.deepEqual(errors,[]);
 }finally{await browser.close();server.close();}
});

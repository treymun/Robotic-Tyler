// End-to-end (v2.20.2): Music DJ sound quality in real Chromium. The real audio bridge in a page,
// a stand-in "Steam" call (two RTCPeerConnections on this machine, Chromium's real Opus encoder),
// and a stand-in YouTube share (getDisplayMedia is replaced, since headless Chromium has no picker).
// Checks: the share asks for the tab's sound without voice processing; while music is shared,
// Tyler's outgoing audio is encoded at the chosen rate (128 kbps by default), measured from the
// bytes actually sent; the rate follows the quality setting and returns to Chromium's default when
// the music stops; the full check's codec report reads the call's real codec settings.
// Not Steam: Steam's servers may set their own limits, which the full check now reports.
import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const {chromium}=require('playwright');
const ROOT=path.resolve(import.meta.dirname,'../..');

const PAGE=`<!doctype html><meta charset="utf-8"><title>Mock Steam call</title><body><script>
window.__asked=[];
navigator.mediaDevices.getDisplayMedia=async constraints=>{
 window.__asked.push(constraints);
 const ctx=new AudioContext(),o=ctx.createOscillator(),d=ctx.createMediaStreamDestination();o.connect(d);o.start();
 const c=document.createElement('canvas');c.width=c.height=16;const video=c.captureStream(1).getVideoTracks()[0];video.getSettings=()=>({displaySurface:'browser'});
 return new MediaStream([video,d.stream.getAudioTracks()[0]]);
};
window.__messages=[];addEventListener('message',e=>{if(e.data?.source==='tyler-music-status'||e.data?.source==='tyler-audio-status')__messages.push(e.data);});
window.cmd=(type,extra={})=>window.postMessage({source:'tyler-audio-command',type,...extra},location.origin);
window.call=async()=>{
 cmd('enable');await new Promise(r=>setTimeout(r,200));
 const mic=await navigator.mediaDevices.getUserMedia({audio:true});
 const a=new RTCPeerConnection(),b=new RTCPeerConnection();a.onicecandidate=e=>e.candidate&&b.addIceCandidate(e.candidate);b.onicecandidate=e=>e.candidate&&a.addIceCandidate(e.candidate);
 a.addTrack(mic.getAudioTracks()[0],mic);b.ontrack=e=>{const el=new Audio();el.srcObject=e.streams[0];el.muted=true;el.play().catch(()=>{});};
 await a.setLocalDescription(await a.createOffer());await b.setRemoteDescription(a.localDescription);await b.setLocalDescription(await b.createAnswer());await a.setRemoteDescription(b.localDescription);
 for(let i=0;i<50&&a.connectionState!=='connected';i++)await new Promise(r=>setTimeout(r,100));
 window.__a=a;return a.connectionState;
};
// The encoder's target, and what was actually sent over the last 2 seconds.
window.rate=async()=>{const out=async()=>{const s=await __a.getStats();let o;s.forEach(x=>{if(x.type==='outbound-rtp'&&x.kind==='audio')o=x;});return o;};
 const o0=await out();await new Promise(r=>setTimeout(r,2000));const o1=await out();
 return {target:o1.targetBitrate,sentKbps:Math.round((o1.bytesSent-o0.bytesSent)*8/(o1.timestamp-o0.timestamp))};};
</script><script src="/browser-extension/audio-bridge.js"></script>`;

test('Music DJ: untouched tab sound and a higher Opus rate while music plays (real Chromium encoder, no Steam)',{timeout:120000},async()=>{
 const server=http.createServer((req,res)=>{const url=new URL(req.url,'http://x');if(url.pathname==='/'){res.writeHead(200,{'content-type':'text/html'});res.end(PAGE);return;}
  const file=path.join(ROOT,decodeURIComponent(url.pathname));if(!file.startsWith(ROOT)||!fs.existsSync(file)){res.writeHead(404);res.end();return;}res.writeHead(200,{'content-type':'text/javascript'});fs.createReadStream(file).pipe(res);}).listen(0);
 const browser=await chromium.launch({args:['--autoplay-policy=no-user-gesture-required']});
 try{
  const page=await browser.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('http://127.0.0.1:'+server.address().port+'/');
  assert.equal(await page.evaluate(()=>call()),'connected');
  const before=await page.evaluate(()=>rate());
  assert.ok(before.target<=40000&&before.sentKbps<=45,'Chromium\'s default before music: '+JSON.stringify(before));

  await page.evaluate(()=>cmd('music-capture',{volume:.35,bitrate:128000}));await page.waitForTimeout(500);
  const asked=await page.evaluate(()=>__asked.at(-1));
  assert.deepEqual({ec:asked.audio.echoCancellation,ns:asked.audio.noiseSuppression,agc:asked.audio.autoGainControl},{ec:false,ns:false,agc:false},'no microphone processing on the shared tab');
  assert.equal(asked.systemAudio,'exclude');assert.equal(asked.selfBrowserSurface,'exclude');
  const shared=await page.evaluate(()=>__messages.filter(m=>m.source==='tyler-music-status').at(-1));
  assert.equal(shared.shared,true);assert.deepEqual(shared.quality,{processed:false,channels:shared.quality.channels,bitrate:128000});
  const high=await page.evaluate(()=>rate());
  assert.equal(high.target,128000);assert.ok(high.sentKbps>=100,'actually sent at a high rate: '+JSON.stringify(high));

  await page.evaluate(()=>cmd('music-quality',{bitrate:64000}));await page.waitForTimeout(300);
  const medium=await page.evaluate(()=>rate());
  assert.equal(medium.target,64000);assert.ok(medium.sentKbps>=50&&medium.sentKbps<=80,JSON.stringify(medium));

  // The full check's report: the call's real codec and settings.
  await page.evaluate(()=>cmd('status'));await page.waitForTimeout(300);
  const status=await page.evaluate(()=>__messages.filter(m=>m.source==='tyler-audio-status').at(-1));
  assert.equal(status.voice.codec.codec,'opus');assert.match(status.voice.codec.fmtp,/useinbandfec=1/);assert.equal(status.voice.codec.kbps,64);

  await page.evaluate(()=>cmd('music-disconnect'));await page.waitForTimeout(300);
  const after=await page.evaluate(()=>rate());
  assert.ok(after.target<=40000&&after.sentKbps<=45,'back to the default when the music stops: '+JSON.stringify(after));
  assert.deepEqual(errors,[]);
 }finally{await browser.close();server.close();}
});

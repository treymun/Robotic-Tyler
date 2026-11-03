// End-to-end: Steam's voice code asks for the microphone through the old callback API
// (navigator.getUserMedia). With synthetic voice enabled the MAIN-world audio bridge must answer it
// with the synthetic microphone, so the physical microphone is never opened; before enabling, the
// call is unchanged. Real headless Chromium with its fake capture device (no Steam, no Windows audio).
import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const {chromium}=require('playwright');

const ext=path.resolve(import.meta.dirname,'../../browser-extension');
const html='<!doctype html><script src="/soundboard-core.js"></script><script src="/soundboard-audio.js"></script><script src="/audio-bridge.js"></script>';

test('Steam-style legacy microphone request gets the synthetic microphone once enabled',async()=>{
 const server=http.createServer((req,res)=>{const p=new URL(req.url,'http://x').pathname;if(p==='/'){res.writeHead(200,{'content-type':'text/html'});res.end(html);return;}const f=path.join(ext,p);if(!f.startsWith(ext)||!fs.existsSync(f)){res.writeHead(404);res.end();return;}res.writeHead(200,{'content-type':'text/javascript'});fs.createReadStream(f).pipe(res);}).listen(0);
 const browser=await chromium.launch({args:['--use-fake-device-for-media-stream','--use-fake-ui-for-media-stream','--autoplay-policy=no-user-gesture-required']});
 try{
  const ctx=await browser.newContext({permissions:['microphone']});const page=await ctx.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('http://127.0.0.1:'+server.address().port+'/');
  const r=await page.evaluate(async()=>{
   // Exactly how Steam's friendsui asks (callback form, legacy constraint shape).
   const steamAsk=()=>new Promise(resolve=>{const t=navigator;t.getUserMedia=t.getUserMedia||t.webkitGetUserMedia;
    t.getUserMedia({audio:{optional:[{googHighpassFilter:true},{googAudioMirroring:false}]},video:false},s=>{const tr=s.getAudioTracks()[0];resolve({ok:true,label:tr&&tr.label});for(const x of s.getTracks())x.stop();},e=>resolve({ok:false,name:e&&e.name}));});
   const before=await steamAsk();
   // A connection Steam opened before Tyler's voice was on and has since closed (a leave) is skipped
   // quietly when voice is enabled, instead of reporting "attachment failed".
   const statuses=[];window.addEventListener('message',e=>{if(e.data?.source==='tyler-audio-status')statuses.push(e.data);});
   const ac=new AudioContext(),dst=ac.createMediaStreamDestination(),old=new RTCPeerConnection();old.addTrack(dst.stream.getAudioTracks()[0],dst.stream);old.close();
   window.postMessage({source:'tyler-audio-command',type:'enable'},location.origin);await new Promise(r=>setTimeout(r,400));
   const after=await steamAsk();
   const closedPeerError=statuses.some(m=>/attachment failed/i.test(m.text||''));
   let webkit=null;if(typeof navigator.webkitGetUserMedia==='function')webkit=await new Promise(resolve=>navigator.webkitGetUserMedia({audio:true},s=>resolve(s.getAudioTracks()[0].label),e=>resolve('error '+e.name)));
   return {before,after,webkit,closedPeerError};
  });
  assert.deepEqual(errors,[]);
  assert.equal(r.before.ok,true);assert.match(r.before.label,/fake/i,'before enabling: the request is unchanged (the capture device)');
  assert.equal(r.after.ok,true);assert.doesNotMatch(r.after.label,/fake/i,'after enabling: no capture device');
  if(r.webkit!==null)assert.doesNotMatch(r.webkit,/fake/i);
  assert.equal(r.closedPeerError,false,'no "attachment failed" for a connection Steam already closed');
 }finally{await browser.close();server.close();}
});

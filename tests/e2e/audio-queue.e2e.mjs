// End-to-end: the MAIN-world audio bridge plays a first clip and a queued
// remainder back to back ("Start speaking sooner"), a new reply replaces both,
// and Stop clears the queue. Real Web Audio in headless Chromium.
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

test('queued speech plays back to back as one turn',async()=>{
 const server=http.createServer((req,res)=>{const p=new URL(req.url,'http://x').pathname;if(p==='/'){res.writeHead(200,{'content-type':'text/html'});res.end(html);return;}const f=path.join(ext,p);if(!f.startsWith(ext)||!fs.existsSync(f)){res.writeHead(404);res.end();return;}res.writeHead(200,{'content-type':'text/javascript'});fs.createReadStream(f).pipe(res);}).listen(0);
 const browser=await chromium.launch({args:['--autoplay-policy=no-user-gesture-required']});
 try{
  const page=await browser.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('http://127.0.0.1:'+server.address().port+'/');
  const runs=await page.evaluate(async()=>{
   const wav=(seconds,freq)=>{const rate=16000,n=Math.round(rate*seconds),b=new DataView(new ArrayBuffer(44+n*2));const w=(o,s)=>{for(let i=0;i<s.length;i++)b.setUint8(o+i,s.charCodeAt(i));};w(0,'RIFF');b.setUint32(4,36+n*2,true);w(8,'WAVE');w(12,'fmt ');b.setUint32(16,16,true);b.setUint16(20,1,true);b.setUint16(22,1,true);b.setUint32(24,rate,true);b.setUint32(28,rate*2,true);b.setUint16(32,2,true);b.setUint16(34,16,true);w(36,'data');b.setUint32(40,n*2,true);for(let i=0;i<n;i++)b.setInt16(44+i*2,Math.sin(2*Math.PI*freq*i/rate)*6000,true);let s='';const u=new Uint8Array(b.buffer);for(let i=0;i<u.length;i+=8192)s+=String.fromCharCode(...u.subarray(i,i+8192));return btoa(s);};
   const events=[],t0=performance.now();
   window.addEventListener('message',e=>{if(e.data?.source==='tyler-playback')events.push([e.data.playing,Math.round(performance.now()-t0)]);});
   const post=m=>window.postMessage({source:'tyler-audio-command',...m},location.origin);
   const wait=ms=>new Promise(r=>setTimeout(r,ms));
   post({type:'enable'});await wait(300);events.length=0;
   post({type:'audio',audio:wav(.5,330)});post({type:'audio',audio:wav(.4,440),queue:true});await wait(1600);const first=events.splice(0);
   post({type:'audio',audio:wav(.6,330)});post({type:'audio',audio:wav(.6,440),queue:true});await wait(150);post({type:'audio',audio:wav(.3,550)});await wait(1400);const replaced=events.splice(0);
   post({type:'audio',audio:wav(.6,330)});post({type:'audio',audio:wav(.6,440),queue:true});await wait(150);post({type:'stop'});await wait(1300);const stopped=events.splice(0);
   return {first,replaced,stopped};
  });
  assert.deepEqual(errors,[]);
  // First clip + queued remainder: playing stays true from the first start until the remainder ends.
  const f=runs.first.filter(([,t],i,a)=>!(i===0&&a[0][0]===false));
  assert.deepEqual(f.map(([p])=>p),[true,true,false]);
  assert.ok(f[1][1]-f[0][1]>=400,'remainder starts when the first clip ends');
  assert.ok(f[2][1]-f[0][1]>=850,'both clips played in full');
  // A new reply replaces the playing clip and drops its queued remainder.
  const r=runs.replaced.map(([p])=>p);assert.deepEqual(r.slice(-2),[true,false]);assert.equal(r.filter(Boolean).length,2);
  // Stop clears the queue.
  assert.deepEqual(runs.stopped.map(([p])=>p).filter(Boolean).length,1);assert.equal(runs.stopped.at(-1)[0],false);
 }finally{await browser.close();server.close();}
});

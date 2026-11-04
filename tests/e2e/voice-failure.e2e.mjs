// v2.32.3: what the full check reads about a voice connection, from real WebRTC in headless Chromium.
// Two connections on this machine stand in for Steam's call (no Steam, no Windows audio, no network):
// one that connects, and one whose encryption handshake (DTLS) is made to fail by giving it the wrong
// certificate fingerprint. The audio bridge must report the steps, the counters and the DTLS state,
// keep a snapshot of the failed one, and never include an address.
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

test('the voice connection report: steps, counters and encryption for a working and a failed connection',async()=>{
 const server=http.createServer((req,res)=>{const p=new URL(req.url,'http://x').pathname;if(p==='/'){res.writeHead(200,{'content-type':'text/html'});res.end(html);return;}const f=path.join(ext,p);if(!f.startsWith(ext)||!fs.existsSync(f)){res.writeHead(404);res.end();return;}res.writeHead(200,{'content-type':'text/javascript'});fs.createReadStream(f).pipe(res);}).listen(0);
 const browser=await chromium.launch();
 try{
  const page=await browser.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('http://127.0.0.1:'+server.address().port+'/');
  const r=await page.evaluate(async()=>{
   const status=()=>new Promise(resolve=>{const on=e=>{if(e.data?.source==='tyler-audio-status'&&e.data.text==='Voice connection checked.'){window.removeEventListener('message',on);resolve(e.data.voice);}};window.addEventListener('message',on);window.postMessage({source:'tyler-audio-command',type:'status'},location.origin);});
   const until=(fn,ms)=>new Promise((resolve,reject)=>{const t0=Date.now(),id=setInterval(()=>{if(fn()){clearInterval(id);resolve();}else if(Date.now()-t0>ms){clearInterval(id);reject(Error('timed out'));}},50);});
   async function call(breakFingerprint){
    const a=new RTCPeerConnection(),b=new RTCPeerConnection();a.onicecandidate=e=>e.candidate&&b.addIceCandidate(e.candidate).catch(()=>{});b.onicecandidate=e=>e.candidate&&a.addIceCandidate(e.candidate).catch(()=>{});
    const ac=new AudioContext(),dst=ac.createMediaStreamDestination();a.addTrack(dst.stream.getAudioTracks()[0],dst.stream);
    await a.setLocalDescription();await b.setRemoteDescription(a.localDescription);await b.setLocalDescription();
    let sdp=b.localDescription.sdp;
    if(breakFingerprint)sdp=sdp.replace(/(a=fingerprint:sha-256 )([0-9A-F]{2})/,(m,k,x)=>k+(x==='00'?'11':'00'));
    await a.setRemoteDescription({type:'answer',sdp});
    await until(()=>breakFingerprint?a.connectionState==='failed':a.connectionState==='connected'&&b.connectionState==='connected',15000);
    await new Promise(r=>setTimeout(r,300));
    return {a,b};
   }
   const good=await call(false);const okReport=await status();
   for(const p of [good.a,good.b])p.close();
   const bad=await call(true);const badReport=await status();
   return {okReport,badReport,badState:[bad.a.connectionState,bad.a.iceConnectionState]};
  });
  assert.deepEqual(errors,[]);
  // The working connection: answered checks, DTLS connected, its route, and its steps.
  const ok=r.okReport.ice;assert.ok(ok,'counters are there');assert.ok(ok.checks>0&&ok.answers>0,JSON.stringify(ok));
  assert.equal(ok.dtls.state,'connected');assert.match(ok.dtls.version,/^DTLS 1\.[23]$/);assert.match(ok.dtls.role,/^(client|server)$/);assert.ok(ok.dtls.cipher.length>0);
  assert.match(ok.route,/^host udp .* \u2192 host udp/);
  // The failed one: Chromium reports it failed with ICE fine, so the encryption is what failed, and the
  // bridge kept a snapshot from that moment.
  assert.equal(r.badState[0],'failed');
  const f=r.badReport.failure;assert.ok(f,'a snapshot of the failure');
  const steps=f.steps.map(s=>s.what+' '+s.state);
  assert.ok(steps.includes('ice connected')||steps.includes('ice completed'),steps.join(', '));
  assert.ok(steps.includes('dtls failed'),steps.join(', '));assert.ok(steps.includes('connection failed'),steps.join(', '));
  assert.ok(f.report&&f.report.answers>0,'its checks were answered');assert.equal(f.report.dtls?.state,'failed');
  assert.ok(f.steps.every((s,i,a)=>Number.isInteger(s.at)&&s.at>=0&&(i===0||s.at>=a[i-1].at)),'times since the connection opened, in order');
  assert.ok(Array.isArray(r.badReport.trace)&&r.badReport.trace.some(s=>s.what==='dtls'&&s.state==='failed'),'the latest connection\'s steps too');
  // No addresses anywhere in what the check gets (the kinds say "IPv4 private", ".local name"…).
  const all=JSON.stringify([r.okReport,r.badReport]);
  assert.doesNotMatch(all,/\b\d{1,3}(?:\.\d{1,3}){3}\b/,'no IPv4 address');assert.doesNotMatch(all,/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.local/i,'no .local name');
  assert.doesNotMatch(all,/[0-9a-f]{1,4}(?::[0-9a-f]{1,4}){4,7}/i,'no IPv6 address');assert.doesNotMatch(all,/fingerprint|ufrag|pwd/i);
 }finally{await browser.close();server.close();}
});

// End-to-end (v2.21): how Tyler's voice comes out, in real Chromium with the real audio bridge.
//  - Gemini Live's 24 kHz chunks are converted as one stream and scheduled back to back, sample-exact.
//  - The rest of a reply (queued after the first sentence) starts on the exact sample the first ends.
//  - A quiet reply and a loud one come out at about the same level.
//  - The Music DJ dips while Tyler talks and comes back after.
// Tyler's synthetic microphone is recorded in the page. No Steam, no AI provider, no Windows audio.
import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const {chromium}=require('playwright');
const ROOT=path.resolve(import.meta.dirname,'../..');

const PAGE=`<!doctype html><meta charset="utf-8"><title>Voice quality</title><body><script>
window.__starts=[];const st=AudioBufferSourceNode.prototype.start;AudioBufferSourceNode.prototype.start=function(w){__starts.push({when:w||0,now:this.context.currentTime,frames:this.buffer?.length||0,rate:this.buffer?.sampleRate||0});return st.apply(this,arguments);};
const b64=u8=>{let s='';for(let i=0;i<u8.length;i+=32768)s+=String.fromCharCode.apply(null,u8.subarray(i,i+32768));return btoa(s);};
window.cmd=(type,extra={})=>window.postMessage({source:'tyler-audio-command',type,...extra},location.origin);
window.wav=(seconds,amp,freq=300,rate=24000)=>{const n=Math.round(seconds*rate),b=new ArrayBuffer(44+n*2),v=new DataView(b),t=(o,s)=>{for(let i=0;i<s.length;i++)v.setUint8(o+i,s.charCodeAt(i));};t(0,'RIFF');v.setUint32(4,36+n*2,true);t(8,'WAVE');t(12,'fmt ');v.setUint32(16,16,true);v.setUint16(20,1,true);v.setUint16(22,1,true);v.setUint32(24,rate,true);v.setUint32(28,rate*2,true);v.setUint16(32,2,true);v.setUint16(34,16,true);t(36,'data');v.setUint32(40,n*2,true);for(let i=0;i<n;i++)v.setInt16(44+i*2,Math.round(amp*32767*Math.sin(2*Math.PI*freq*i/rate)),true);return b64(new Uint8Array(b));};
window.pcm=(from,n,amp=.5,freq=440)=>{const p=new Int16Array(n);for(let k=0;k<n;k++)p[k]=Math.round(amp*32767*Math.sin(2*Math.PI*freq*(from+k)/24000));return b64(new Uint8Array(p.buffer));};
// Records Tyler's synthetic microphone (what Steam would send) as RMS per 10 ms.
window.record=async seconds=>{const mic=await navigator.mediaDevices.getUserMedia({audio:true});const ctx=new AudioContext();await ctx.resume();const src=ctx.createMediaStreamSource(mic),sp=ctx.createScriptProcessor(1024,1,1),z=ctx.createGain();z.gain.value=0;const out=[];let n=0,acc=0,cnt=0;const block=Math.round(ctx.sampleRate/100);
 return new Promise(res=>{sp.onaudioprocess=e=>{const d=e.inputBuffer.getChannelData(0);for(const x of d){acc+=x*x;cnt++;if(cnt===block){out.push(Math.sqrt(acc/cnt));acc=0;cnt=0;}}n+=d.length;if(n>=ctx.sampleRate*seconds){sp.disconnect();res(out);}};src.connect(sp);sp.connect(z);z.connect(ctx.destination);});};
navigator.mediaDevices.getDisplayMedia=async()=>{const ctx=new AudioContext(),o=ctx.createOscillator(),d=ctx.createMediaStreamDestination();o.frequency.value=180;o.connect(d);o.start();const c=document.createElement('canvas');const v=c.captureStream(1).getVideoTracks()[0];v.getSettings=()=>({displaySurface:'browser'});return new MediaStream([v,d.stream.getAudioTracks()[0]]);};
</script><script src="/browser-extension/live-pcm.js"></script><script src="/browser-extension/soundboard-audio.js"></script><script src="/browser-extension/audio-bridge.js"></script>`;

test('Tyler\'s voice: seamless Live chunks and reply parts, even levels, music ducking (real Chromium)',{timeout:120000},async()=>{
 const server=http.createServer((req,res)=>{const url=new URL(req.url,'http://x');if(url.pathname==='/'){res.writeHead(200,{'content-type':'text/html'});res.end(PAGE);return;}
  const file=path.join(ROOT,decodeURIComponent(url.pathname));if(!file.startsWith(ROOT)||!fs.existsSync(file)){res.writeHead(404);res.end();return;}res.writeHead(200,{'content-type':'text/javascript'});fs.createReadStream(file).pipe(res);}).listen(0);
 const browser=await chromium.launch({args:['--autoplay-policy=no-user-gesture-required']});
 try{
  const page=await browser.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('http://127.0.0.1:'+server.address().port+'/');
  await page.evaluate(()=>cmd('enable'));await page.waitForTimeout(300);

  // Gemini Live: 50 chunks of 40 ms, sent a little faster than real time, as Google does.
  await page.evaluate(async()=>{__starts.length=0;for(let i=0;i<50;i++){cmd('pcm',{audio:pcm(i*960,960),gen:1});await new Promise(r=>setTimeout(r,25));}});
  const live=await page.evaluate(()=>__starts.filter(s=>s.frames>0));
  assert.equal(live.length,50);
  const rate=live[0].rate;let gaps=0;for(let i=1;i<live.length;i++){const end=live[i-1].when+live[i-1].frames/rate;if(Math.abs(live[i].when-end)*rate>0.5)gaps++;}
  assert.equal(gaps,0,'every chunk starts on the sample the last one ended');
  assert.notEqual(rate,24000,'chunks are converted to the page\'s own rate, not left to Web Audio one by one');
  const total=live.reduce((s,c)=>s+c.frames,0);assert.ok(Math.abs(total-50*960*rate/24000)<40,'no samples lost or added: '+total);
  await page.evaluate(()=>cmd('pcm-reset'));await page.waitForTimeout(200);

  // A reply in two parts: the rest starts exactly when the first sentence ends.
  await page.evaluate(async()=>{__starts.length=0;cmd('audio',{audio:wav(.8,.3)});await new Promise(r=>setTimeout(r,150));cmd('audio',{audio:wav(.8,.3),queue:true});await new Promise(r=>setTimeout(r,200));});
  const parts=await page.evaluate(()=>__starts.filter(s=>s.frames>1000));
  assert.equal(parts.length,2);
  assert.ok(Math.abs(parts[1].when-(parts[0].when+parts[0].frames/parts[0].rate))<1/parts[0].rate,'no gap between the parts: '+JSON.stringify(parts));
  await page.waitForTimeout(1600);

  // Levels: a quiet reply and a loud one, then music with a reply over it.
  const levels=await page.evaluate(async()=>{const rec=record(4.2);await new Promise(r=>setTimeout(r,300));cmd('audio',{audio:wav(1,.08)});await new Promise(r=>setTimeout(r,1500));cmd('audio',{audio:wav(1,.5)});return rec;});
  const median=a=>{const s=[...a].sort((x,y)=>x-y);return s[s.length>>1];};
  const loud=levels.filter(v=>v>0.003),half=loud.length>>1;
  const q=median(loud.slice(0,half)),l=median(loud.slice(half));
  assert.ok(Math.abs(20*Math.log10(l/q))<2,'a 16 dB difference between replies comes out within 2 dB: '+(20*Math.log10(l/q)).toFixed(1)+' dB');

  await page.evaluate(()=>cmd('music-capture',{volume:.5,level:'auto'}));await page.waitForTimeout(600);
  const duck=await page.evaluate(async()=>{const rec=record(4.5);await new Promise(r=>setTimeout(r,1200));cmd('audio',{audio:wav(1.2,.0001,3000)});return rec;});
  // Music alone (0.2–1.0 s), under a near-silent reply (1.6–2.3 s), and after it (3.6–4.4 s).
  const at=(a,b)=>median(duck.slice(a*100,b*100));
  const before=at(.2,1),during=at(1.6,2.3),after=at(3.6,4.4);
  assert.ok(20*Math.log10(during/before)<-7,'music dips while Tyler talks: '+(20*Math.log10(during/before)).toFixed(1)+' dB');
  assert.ok(Math.abs(20*Math.log10(after/before))<1.5,'and comes back after: '+(20*Math.log10(after/before)).toFixed(1)+' dB');
  await page.evaluate(()=>cmd('music-duck',{on:false}));const flat=await page.evaluate(async()=>{const rec=record(3);await new Promise(r=>setTimeout(r,800));cmd('audio',{audio:wav(1,.0001,3000)});return rec;});
  assert.ok(Math.abs(20*Math.log10(median(flat.slice(120,200))/median(flat.slice(20,70))))<1.5,'no dip when turned off');
  assert.deepEqual(errors,[]);
 }finally{await browser.close();server.close();}
});

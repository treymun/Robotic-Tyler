// v2.35 theme voices: a real clone clip through Tyler's real audio bridge (headless Chromium).
// The clip, tests/fixtures/theme-voice-cs16-fire-in-the-hole.wav, is genuine Qwen3-TTS 1.7B output
// (the CS 1.6 radio operator saying "Fire in the hole!", made in development on a processor). What is
// MOCKED: the Steam page (a stand-in), the microphone consumer (this test) and the call. No real Steam call.
// Checked: the clip decodes and plays out on the synthetic microphone; "Play into call" queues a second
// clip after the first instead of overlapping or cutting it off; Tyler's listener is told he's talking.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const {chromium}=require('playwright');
const EXT=path.resolve(import.meta.dirname,'../../browser-extension');
const CLIP=fs.readFileSync(path.resolve(import.meta.dirname,'../fixtures/theme-voice-cs16-fire-in-the-hole.wav')).toString('base64');

test('a real theme-voice clip plays into the synthetic microphone; a second one queues behind it; the listener holds while Tyler talks',async()=>{
 const browser=await chromium.launch({args:['--autoplay-policy=no-user-gesture-required','--use-fake-ui-for-media-stream','--use-fake-device-for-media-stream']});
 try{
  const p=await browser.newPage();const errors=[];p.on('pageerror',e=>errors.push(e.message));
  await p.route('https://steamcommunity.com/**',r=>r.fulfill({status:200,contentType:'text/html',body:'<!doctype html><title>chat</title><body>chat</body>'}));
  await p.addInitScript({content:['live-pcm.js','soundboard-audio.js','audio-bridge.js'].map(f=>fs.readFileSync(path.join(EXT,f),'utf8')).join('\n;\n')});
  await p.goto('https://steamcommunity.com/chat/');
  const r=await p.evaluate(async clip=>{
   const sleep=ms=>new Promise(r=>setTimeout(r,ms)),cmd=(type,extra={})=>window.postMessage({source:'tyler-audio-command',type,...extra},location.origin);
   const playing=[];window.addEventListener('message',e=>{if(e.data?.source==='tyler-playback')playing.push({at:performance.now(),on:!!e.data.playing});});
   cmd('enable');await sleep(400);
   const mic=await navigator.mediaDevices.getUserMedia({audio:true}),ctx=new AudioContext({sampleRate:48000}),src=ctx.createMediaStreamSource(mic),sp=ctx.createScriptProcessor(2048,1,1);
   const frames=[];sp.onaudioprocess=e=>{let s=0;const d=e.inputBuffer.getChannelData(0);for(const v of d)s+=v*v;frames.push({at:performance.now(),db:10*Math.log10(s/d.length+1e-12)});};
   src.connect(sp);sp.connect(ctx.destination);await sleep(300);
   const t0=performance.now();cmd('audio',{audio:clip,queue:true});cmd('audio',{audio:clip,queue:true});
   await sleep(4500);
   const loud=frames.filter(f=>f.at>t0&&f.db>-45);
   return {loudMs:loud.length?loud.at(-1).at-loud[0].at:0,peakDb:Math.max(...frames.map(f=>f.db)),playing:playing.map(x=>x.on),firstLoud:loud[0]?.at-t0};
  },CLIP);
  assert.deepEqual(errors,[]);
  assert.ok(r.peakDb>-30,'the clone is heard on the synthetic microphone ('+r.peakDb.toFixed(1)+' dB)');
  // One clip is 1.1 s: two queued ones take about 2.2 s; overlapping (or cutting the first off) would take about 1.1 s.
  assert.ok(r.loudMs>1700,'the second clip waited for the first: '+Math.round(r.loudMs)+' ms of speech');
  assert.ok(r.playing.includes(true)&&r.playing.at(-1)===false,'playback start and end were announced (the listener holds meanwhile): '+r.playing.join(','));
 }finally{await browser.close();}
});

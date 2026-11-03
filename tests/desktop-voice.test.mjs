// v2.15 desktop voice and migration, with a stand-in for the Windows audio helper
// (tests/fixtures/fake-audio-helper.mjs). No real Windows audio, Steam or provider is involved.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import {createRequire} from 'node:module';
import '../browser-extension/live-pcm.js';
import '../browser-extension/noise-filter.js';
const require=createRequire(import.meta.url);
const {NativeVoice,Segmenter,wav16k,resample}=require('../app/native-voice.cjs');
const {importVoiceStudio,decryptV10}=require('../app/migrate.cjs');
const {settingsKeys}=require('../app/guards.cjs');
const HELPER=path.resolve(import.meta.dirname,'fixtures','fake-audio-helper.mjs');
const wait=ms=>new Promise(r=>setTimeout(r,ms));
const until=async(fn,ms=3000)=>{const end=Date.now()+ms;while(Date.now()<end){if(fn())return true;await wait(20);}return false;};
const tmp=()=>fs.mkdtempSync(path.join(os.tmpdir(),'rt-voice-'));
const events=log=>fs.existsSync(log)?fs.readFileSync(log,'utf8').trim().split('\n').filter(Boolean).map(l=>JSON.parse(l)):[];
const LONG_ID=Buffer.from('{0.0.0.00000000}.{8f8b1a0e-1111-4c2a-9a3e-0123456789ab}').toString('base64');
const DEVICES={voiceOutputDevice:'Q0FCTEU=',voiceListenDevice:'SEVBRA==',voiceListenConsent:true};

test('segmenter: utterances end after the pause, short noise is dropped, WAV is 16 kHz mono',()=>{
 const seg=new Segmenter({threshold:.02,minVoiced:200,endSilence:120});
 const loud=Int16Array.from({length:640},(_,i)=>Math.round(Math.sin(i/3)*9000)),quiet=new Int16Array(640);
 assert.equal(seg.push(quiet),null);for(let i=0;i<8;i++)assert.equal(seg.push(loud),null);
 let u=null;for(let i=0;i<4&&!u;i++)u=seg.push(quiet);
 assert.ok(u.samples.length>=640*10,'pre-roll + speech + pause');
 const w=wav16k(u.samples);assert.equal(w.toString('latin1',0,4),'RIFF');assert.equal(w.readUInt32LE(24),16000);assert.equal(w.readUInt16LE(22),1);
 seg.push(loud);let short=null;for(let i=0;i<4&&!short;i++)short=seg.push(quiet);assert.deepEqual(short,{short:true});
 // A 48 kHz stereo float recording comes back as 16 kHz mono.
 const n=4800,b=Buffer.alloc(44+n*8);b.write('RIFF',0);b.write('WAVE',8);b.write('fmt ',12);b.writeUInt32LE(16,16);b.writeUInt16LE(3,20);b.writeUInt16LE(2,22);b.writeUInt32LE(48000,24);b.writeUInt16LE(32,34);b.write('data',36);b.writeUInt32LE(n*8,40);
 for(let i=0;i<n*2;i++)b.writeFloatLE(.5,44+i*4);
 const mono=resample(b);assert.equal(mono.length,1600);assert.ok(Math.abs(mono[100]-16383)<2);
});

function voice(settings,over={}){
 const dir=tmp(),log=path.join(dir,'helper.log');process.env.FAKE_HELPER_LOG=log;
 const requests=[];const liveCalls=[];let sink=null;
 const live={start:async o=>{liveCalls.push(['start',o.owner,o.historyId]);sink=o.sink;return {model:'gemini-3.8-live',voice:'Kore'};},audio:f=>{liveCalls.push(['audio',f.length]);return true;},text:t=>liveCalls.push(['text',t]),stop:async(r,o)=>{liveCalls.push(['stop',o]);}};
 const v=new NativeVoice({helper:()=>HELPER,tempDir:dir,settings:async()=>({...settings}),live,request:async m=>{requests.push(m);return over.reply?over.reply(m):{ok:true,heard:'hello tyler',text:'Yo.',audio:Buffer.from('ID3fakeaudio').toString('base64')};}});
 return {v,dir,log,requests,liveCalls,sink:()=>sink};
}

test('nothing starts without devices, two different devices and listening consent',async()=>{
 for(const [s,msg] of [[{},/speaks into/],[{voiceOutputDevice:'Q0FCTEU='},/listens to/],[{voiceOutputDevice:'Q0FCTEU=',voiceListenDevice:'Q0FCTEU=',voiceListenConsent:true},/hear himself/],[{voiceOutputDevice:'Q0FCTEU=',voiceListenDevice:'SEVBRA=='},/knows Tyler is listening/]]){
  const {v}=voice(s);await assert.rejects(v.startStandard(),msg);await assert.rejects(v.startLive(),msg);assert.equal(v.mode,'off');
 }
 const {v}=voice({...DEVICES,v22EmergencyStop:true});await assert.rejects(v.startLive(),/Emergency stop/);
});

test('Gemini Live on desktop: listens only to the chosen device, plays chunks, flushes, and stop ends everything',async()=>{
 const t=voice({...DEVICES,voiceEngine:'live'});
 await t.v.startLive();assert.equal(t.v.mode,'live');
 assert.deepEqual(t.liveCalls[0],['start','desktop','-1:voice']);
 assert.ok(await until(()=>t.liveCalls.some(c=>c[0]==='audio')),'capture frames go to the live session');
 const capture=events(t.log).find(e=>e.cmd==='capture');assert.equal(capture.device,'SEVBRA==','the listen device, never a microphone');
 const sink=t.sink();sink.audio(Buffer.alloc(960).toString('base64'),1);sink.audio(Buffer.alloc(960).toString('base64'),1);
 assert.ok(await until(()=>events(t.log).filter(e=>e.audio).length===2),'chunks are streamed to the speak-into device as they arrive');
 assert.equal(events(t.log).find(e=>e.cmd==='stream').device,'Q0FCTEU=');
 sink.flush(1,'Interrupted');assert.ok(await until(()=>events(t.log).some(e=>e.flush)),'an interruption flushes playback at once');
 await t.v.stop('Stopped by you');
 assert.ok(await until(()=>events(t.log).some(e=>e.stopped)),'capture stops');assert.ok(await until(()=>events(t.log).some(e=>e.end)),'playback stops');
 assert.deepEqual(t.liveCalls.at(-1),['stop','desktop'],'the provider session is stopped');assert.equal(t.v.mode,'off');
 const n=t.liveCalls.filter(c=>c[0]==='audio').length;await wait(150);assert.equal(t.liveCalls.filter(c=>c[0]==='audio').length,n,'no audio after stop');
});

test('a lost listening device stops live voice and says why; no other device is used',async()=>{
 process.env.FAKE_LOSE_AFTER='5';
 try{const t=voice({...DEVICES,voiceEngine:'live'});const states=[];t.v.on('status',s=>states.push(s.state));
  await t.v.startLive();assert.ok(await until(()=>t.v.mode==='off'));
  assert.match(states.at(-1),/listening device was disconnected/);assert.deepEqual(t.liveCalls.at(-1),['stop','desktop']);
  assert.equal(events(t.log).filter(e=>e.cmd==='capture').length,1,'no second capture on another device');}
 finally{delete process.env.FAKE_LOSE_AFTER;}
});

test('Standard voice on desktop: an utterance goes to the shared engine and the reply plays into Steam',async()=>{
 process.env.FAKE_LOUD_FRAMES='40';
 try{const t=voice({...DEVICES,noiseLevel:'sensitive'});
  await t.v.startStandard();assert.ok(await until(()=>t.requests.length===1,4000),'one voice turn');
  const r=t.requests[0];assert.equal(r.type,'voice');assert.equal(r.format,'wav');assert.equal(Buffer.from(r.audio,'base64').readUInt32LE(24),16000);
  assert.ok(await until(()=>events(t.log).some(e=>e.cmd==='play'&&e.device==='Q0FCTEU=')),'the reply plays on the speak-into device');
  await t.v.stop();assert.equal(t.v.mode,'off');
  // Typed test message: same engine, spoken reply.
  await t.v.say('give us a pep talk');assert.deepEqual(t.requests.at(-1),{type:'command',text:'ask give us a pep talk',speak:true,modality:'voice'});}
 finally{delete process.env.FAKE_LOUD_FRAMES;}
});

test('Voice Studio import: new settings copied, conflicts asked, keys decrypted, nothing overwritten silently',async()=>{
 const old=tmp(),key=crypto.randomBytes(32);
 fs.writeFileSync(path.join(old,'Local State'),JSON.stringify({os_crypt:{encrypted_key:Buffer.concat([Buffer.from('DPAPI'),Buffer.from('protected:'),key]).toString('base64')}}));
 const seal=text=>{const nonce=crypto.randomBytes(12),c=crypto.createCipheriv('aes-256-gcm',key,nonce),body=Buffer.concat([c.update(text,'utf8'),c.final()]);return Buffer.concat([Buffer.from('v10'),nonce,body,c.getAuthTag()]).toString('base64');};
 fs.mkdirSync(path.join(old,'Settings'));fs.writeFileSync(path.join(old,'Settings','settings.json'),JSON.stringify({version:1,data:{personality:'Voice studio Tyler',speechVoice:'leo',uiTheme:'doom',usage:{requests:9}},secrets:{openrouterKey:seal('sk-or-old-key')}}));
 fs.mkdirSync(path.join(old,'Local Storage','leveldb'),{recursive:true});fs.writeFileSync(path.join(old,'Local Storage','leveldb','000003.log'),Buffer.concat([Buffer.from('junk_file://\x00\x01tylerOutputId'),Buffer.from([1]),Buffer.from(LONG_ID),Buffer.from('\x00more')]));
 assert.equal(decryptV10(key,seal('hi')),'hi');
 const unprotect=async b64=>{const {execFileSync}=await import('node:child_process');return execFileSync(HELPER,['unprotect'],{input:b64}).toString();};
 const make=data=>{const store={...data};return {store,get:async k=>Object.fromEntries([].concat(k).filter(x=>x in store).map(x=>[x,store[x]])),set:async v=>Object.assign(store,v)};};
 // Both apps set a personality: the owner is asked, and "keep this app's" keeps it.
 let asked=null;const a=make({personality:'Control Center Tyler',uiTheme:'doom'});
 let r=await importVoiceStudio({oldDir:old,vault:a,allowed:settingsKeys,unprotect,ask:async p=>{asked=p;return 'ours';}});
 assert.deepEqual(asked.conflicts,['personality']);assert.equal(r.status,'imported');
 assert.equal(a.store.personality,'Control Center Tyler');assert.equal(a.store.speechVoice,'leo');assert.equal(a.store.openrouterKey,'sk-or-old-key');assert.equal(a.store.voiceOutputDevice,LONG_ID);
 assert.equal(a.store.usage,undefined,'usage history is not imported');assert.equal(a.store.voiceListenConsent,undefined,'listening consent is given again, never imported');
 assert.equal((await importVoiceStudio({oldDir:old,vault:a,allowed:settingsKeys,unprotect,ask:async()=>{throw Error('asked twice');}})).status,'done-before');
 // "Use the Voice Studio's" takes its values; "Ask me later" changes no conflicting value and asks again.
 const b=make({personality:'Control Center Tyler',openrouterKey:'sk-or-new'});
 await importVoiceStudio({oldDir:old,vault:b,allowed:settingsKeys,unprotect,ask:async()=>'theirs'});assert.equal(b.store.personality,'Voice studio Tyler');assert.equal(b.store.openrouterKey,'sk-or-old-key');
 const c=make({personality:'Control Center Tyler'});r=await importVoiceStudio({oldDir:old,vault:c,allowed:settingsKeys,unprotect,ask:async()=>'later'});
 assert.equal(r.status,'later');assert.equal(c.store.personality,'Control Center Tyler');assert.equal(c.store.voiceImport,undefined);
 // A key that can't be decrypted is reported, not guessed.
 const d=make({});r=await importVoiceStudio({oldDir:old,vault:d,allowed:settingsKeys,unprotect:async()=>{throw Error('DPAPI failed');},ask:async()=>'ours'});
 assert.deepEqual(r.unreadable,['openrouterKey']);assert.equal(d.store.openrouterKey,undefined);
 // No Voice Studio: nothing to do.
 assert.equal((await importVoiceStudio({oldDir:path.join(old,'missing'),vault:make({}),allowed:settingsKeys,unprotect,ask:async()=>'ours'})).status,'none');
});

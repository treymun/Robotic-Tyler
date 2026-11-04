// End-to-end: the leave fix (steam-voice-fix.js, MAIN world). A second WebRTC end plays Steam's
// voice server with descriptions shaped like Steam's real ones: the friend is talking before the bot
// joins (their audio first arrives on section 0), then gets their own section, leaves (inactive),
// rejoins and leaves again. Without the fix Chromium rejects the leave offer ("Failed to set up audio
// demuxing"), as it did live; with it the bot stays. Headless Chromium; no Steam, no Windows audio.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const {chromium}=require('playwright');
const fix=fs.readFileSync(path.resolve(import.meta.dirname,'../../browser-extension/steam-voice-fix.js'),'utf8');
const scenario=async()=>{
 const wait=ms=>new Promise(r=>setTimeout(r,ms));
 const SrvPC=document.getElementById('srv').contentWindow.RTCPeerConnection;
 const ac=new AudioContext(),osc=f=>{const o=ac.createOscillator(),d=ac.createMediaStreamDestination();o.frequency.value=f;o.connect(d);o.start();return d.stream;};
 const bot=new RTCPeerConnection({sdpSemantics:'plan-b'}),srv=new SrvPC(),steps=[];
 bot.onicecandidate=e=>e.candidate&&srv.addIceCandidate(e.candidate).catch(()=>{});srv.onicecandidate=e=>e.candidate&&bot.addIceCandidate(e.candidate).catch(()=>{});
 const mine=osc(300);bot.addTrack(mine.getAudioTracks()[0],mine);
 const secs=sdp=>{const p=sdp.split(/\r\n(?=m=)/);return {head:p[0],m:p.slice(1)};};
 const join=s=>[s.head,...s.m].join('\r\n').replace(/(\r\n)+$/,'')+'\r\n';
 const noSsrc=m=>m.split('\r\n').filter(l=>l&&!/^a=(ssrc|ssrc-group|msid):/.test(l)).join('\r\n');
 const ssrc=sdp=>(/a=ssrc:(\d+)/.exec(sdp)||[])[1];
 let failed=null;
 async function apply(d,label){if(failed)return;try{await bot.setRemoteDescription(d);if(d.type==='offer'){const a=await bot.createAnswer();await bot.setLocalDescription(a);await srv.setRemoteDescription(bot.localDescription);}steps.push(label);}catch(e){failed=label+': '+e.message;}}
 await bot.setLocalDescription(await bot.createOffer());await srv.setRemoteDescription(bot.localDescription);
 const friend=osc(650),t0=srv.getTransceivers()[0];await t0.sender.replaceTrack(friend.getAudioTracks()[0]);t0.direction='sendrecv';
 const ans=await srv.createAnswer();await srv.setLocalDescription(ans);const a=secs(ans.sdp);a.m[0]=noSsrc(a.m[0]);
 await apply({type:'answer',sdp:join(a)},'join');
 const self=ssrc(bot.localDescription.sdp),X=ssrc(srv.localDescription.sdp);
 async function steam(dir){const o=await srv.createOffer();await srv.setLocalDescription(o);const s=secs(o.sdp);
  s.m[0]=noSsrc(s.m[0]).replace(/\r\na=mid:0/,'\r\na=mid:0\r\na=msid:Self-'+self+' '+self)+'\r\na=ssrc:'+self+' cname:Self-'+self;
  s.m[1]=noSsrc(s.m[1]).replace(/a=(sendonly|sendrecv|inactive|recvonly)/,'a='+dir).replace(/\r\na=mid:1/,'\r\na=mid:1\r\na=msid:Peer-'+X+' '+X)+'\r\na=ssrc:'+X+' cname:Peer-'+X;
  return {type:'offer',sdp:join(s)};}
 await wait(2500);srv.addTransceiver('audio',{direction:'sendonly'});await apply(await steam('sendonly'),'listed');
 await wait(2500);await apply(await steam('inactive'),'leave');
 await wait(1200);await apply(await steam('sendonly'),'rejoin');
 await wait(1200);await apply(await steam('inactive'),'leave again');
 const mid=/sdes:mid/.test(bot.remoteDescription?.sdp||'');
 bot.close();srv.close();return {steps,failed,midInRemote:mid};
};
async function run(withFix){
 const browser=await chromium.launch({args:['--autoplay-policy=no-user-gesture-required']});
 try{
  const page=await browser.newPage();
  await page.route('https://steamcommunity.com/**',r=>r.fulfill({contentType:'text/html; charset=utf-8',body:'<!doctype html><iframe id="srv"></iframe>'}));
  if(withFix)await page.addInitScript({content:fix});
  await page.goto('https://steamcommunity.com/chat/');
  return await page.evaluate(scenario);
 }finally{await browser.close();}
}
test('the bot stays in the call through leaves and a rejoin with the leave fix (and drops without it)',async()=>{
 const without=await run(false);
 // Without the fix the remembered MID breaks routing at the leave or, depending on packet timing,
 // already when Steam lists the person's own section (both end Steam's call).
 assert.match(String(without.failed),/(?:listed|leave): .*(?:Failed to set up audio demuxing|Failed to apply demuxer criteria)/,'the mock reproduces the live failure without the fix');
 const withFix=await run(true);
 assert.equal(withFix.failed,null,withFix.failed);
 assert.deepEqual(withFix.steps,['join','listed','leave','rejoin','leave again']);
 assert.equal(withFix.midInRemote,false,'the MID tag is removed from Steam\'s descriptions');
});

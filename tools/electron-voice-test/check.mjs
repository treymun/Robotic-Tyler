// Automated check of the Electron voice test (a MOCK, not Steam: no Steam servers, no Windows audio).
//   ELECTRON=/path/to/electron node tools/electron-voice-test/check.mjs
// A fake steamcommunity.com/chat page plays Steam's part, shaped like Steam's real descriptions in
// the 0.1.1 report, with a second, unwrapped WebRTC end as the voice server. The friend is already
// talking when the bot joins, so their audio first arrives on section 0 (Steam's answer has only
// that section and lists no SSRC). Then the server lists the bot itself in section 0 ("Self") and
// the friend in section 1, marks section 1 inactive when the friend leaves, active again when they
// rejoin, and inactive once more. Like Steam, the page ends the call when the browser rejects a
// description. Runs twice: leave fix on (the bot must stay through both leaves) and off (the mock
// must reproduce the live drop). Uses xvfb-run on Linux without a display.
import fs from 'node:fs';import path from 'node:path';import os from 'node:os';import {spawnSync} from 'node:child_process';import {createRequire} from 'node:module';import {fileURLToPath} from 'node:url';
const HERE=path.dirname(fileURLToPath(import.meta.url)),ROOT=path.resolve(HERE,'..','..'),WEB=path.join(ROOT,'tools','webview2-voice-test','web');
let ELECTRON=process.env.ELECTRON;
if(!ELECTRON){try{ELECTRON=createRequire(path.join(ROOT,'package.json'))('electron');}catch{}}
if(!ELECTRON||!fs.existsSync(ELECTRON)){console.error('Set ELECTRON to an Electron binary (the repo\'s node_modules has none).');process.exit(2);}
const OUT=path.join(ROOT,'dist','electron-voice-test','check');fs.rmSync(OUT,{recursive:true,force:true});
const app=path.join(OUT,'app');fs.mkdirSync(path.join(app,'web'),{recursive:true});fs.mkdirSync(path.join(app,'bridge'));
for(const f of ['package.json','main.cjs','preload-steam.cjs','preload-panel.cjs'])fs.copyFileSync(path.join(HERE,f),path.join(app,f));
for(const f of ['panel.html','panel.css','panel.js','diagnostics.js','sdp-repair.js','bridge-only.js','tyler.png'])fs.copyFileSync(path.join(WEB,f),path.join(app,'web',f));
for(const f of ['soundboard-core.js','soundboard-audio.js','live-pcm.js','audio-bridge.js','wav-codec.js','noise-filter.js','voice-listener.js'])fs.copyFileSync(path.join(ROOT,'browser-extension',f),path.join(app,'bridge',f));
const mock=path.join(OUT,'mock-steam.html');
fs.writeFileSync(mock,`<!doctype html><title>Fake Steam chat</title><body><h1>Fake Steam chat (check)</h1><div id="voice"></div><iframe id="srv" style="display:none"></iframe>
<script>
(async()=>{
 if(/Electron\\//.test(navigator.userAgent)){console.log('(VoiceChat) Voice chat not supported in browser: Electron');return;}
 const SrvPC=document.getElementById('srv').contentWindow.RTCPeerConnection; // the "voice server": the test's scripts only run in the top frame
 const mic=await navigator.mediaDevices.getUserMedia({audio:true});
 const ac=new AudioContext(),osc=f=>{const o=ac.createOscillator(),g=ac.createGain();g.gain.value=.4;o.frequency.value=f;o.connect(g);const d=ac.createMediaStreamDestination();g.connect(d);o.start();return d.stream;};
 const bot=new RTCPeerConnection({sdpSemantics:'plan-b'}),srv=new SrvPC();
 bot.onicecandidate=e=>e.candidate&&srv.addIceCandidate(e.candidate).catch(()=>{});srv.onicecandidate=e=>e.candidate&&bot.addIceCandidate(e.candidate).catch(()=>{});
 bot.addTrack(mic.getAudioTracks()[0],mic);bot.ontrack=e=>{const el=new Audio();el.srcObject=e.streams[0]||new MediaStream([e.track]);el.play().catch(()=>{});};
 const voice=document.createElement('div');voice.className='chatRoomVoiceChannel ActiveVoiceChannel';voice.textContent='in voice';
 const end=why=>{console.log('(VoiceChat) Fatal error, ending chat: '+why);bot.close();voice.remove();};
 const secs=sdp=>{const p=sdp.split(/\\r\\n(?=m=)/);return {head:p[0],m:p.slice(1)};};
 const join=s=>[s.head,...s.m].join('\\r\\n').replace(/(\\r\\n)+$/,'')+'\\r\\n';
 const noSsrc=m=>m.split('\\r\\n').filter(l=>l&&!/^a=(ssrc|ssrc-group|msid):/.test(l)).join('\\r\\n');
 const ssrc=sdp=>(/a=ssrc:(\\d+)/.exec(sdp)||[])[1];
 async function apply(d){if(bot.signalingState==='closed')return;try{await bot.setRemoteDescription(d);if(d.type==='offer'){const a=await bot.createAnswer();await bot.setLocalDescription(a);await srv.setRemoteDescription(bot.localDescription);}}catch(e){end(String(e));}}
 await bot.setLocalDescription(await bot.createOffer());await srv.setRemoteDescription(bot.localDescription);
 const friend=osc(650),t0=srv.getTransceivers()[0];await t0.sender.replaceTrack(friend.getAudioTracks()[0]);t0.direction='sendrecv';
 const ans=await srv.createAnswer();await srv.setLocalDescription(ans);const a=secs(ans.sdp);a.m[0]=noSsrc(a.m[0]);
 await apply({type:'answer',sdp:join(a)});document.getElementById('voice').append(voice);
 const self=ssrc(bot.localDescription.sdp),X=ssrc(srv.localDescription.sdp);
 async function steam(dir){
  const o=await srv.createOffer();await srv.setLocalDescription(o);const s=secs(o.sdp);
  s.m[0]=noSsrc(s.m[0]).replace(/\\r\\na=mid:0/,'\\r\\na=mid:0\\r\\na=msid:Self-'+self+' '+self)+'\\r\\na=ssrc:'+self+' cname:Self-'+self;
  s.m[1]=noSsrc(s.m[1]).replace(/a=(sendonly|sendrecv|inactive|recvonly)/,'a='+dir).replace(/\\r\\na=mid:1/,'\\r\\na=mid:1\\r\\na=msid:Peer-'+X+' '+X)+'\\r\\na=ssrc:'+X+' cname:Peer-'+X;
  return {type:'offer',sdp:join(s)};
 }
 setTimeout(async()=>{srv.addTransceiver('audio',{direction:'sendonly'});await apply(await steam('sendonly'));},3000); // friend listed in section 1
 setTimeout(async()=>apply(await steam('inactive')),7000);  // friend leaves
 setTimeout(async()=>apply(await steam('sendonly')),11000); // friend rejoins
 setTimeout(async()=>apply(await steam('inactive')),15000); // friend leaves again
 window.__keep=[srv];
})();
</script>`);
const display=process.platform!=='linux'||process.env.DISPLAY;
const results={};
for(const fix of ['on','off']){
 const data=path.join(OUT,'data-'+fix);fs.mkdirSync(data,{recursive:true});fs.writeFileSync(path.join(data,'test-state.json'),JSON.stringify({mode:'manual',identity:'chrome',repair:fix}));
 const report=path.join(OUT,'report-fix-'+fix+'.txt');
 const args=[ELECTRON,...(process.platform==='linux'?['--no-sandbox']:[]),'--use-fake-device-for-media-stream','--use-fake-ui-for-media-stream',app];
 const env={...process.env,TYLER_TEST_DATA:data,TYLER_TEST_MOCK_STEAM:mock,TYLER_TEST_REPORT:report,TYLER_TEST_SECONDS:'28',TYLER_TEST_AUTO_ALLOW:'1'};
 const r=display?spawnSync(args[0],args.slice(1),{env,timeout:90000}):spawnSync('xvfb-run',['-a',...args],{env,timeout:90000});
 if(!fs.existsSync(report)){console.error('No report for fix '+fix+' (exit '+r.status+')\n'+String(r.stderr).slice(-1500));process.exit(1);}
 results[fix]=fs.readFileSync(report,'utf8');
}
const line=(t,re)=>(t.split(/\r?\n/).find(l=>re.test(l))||'').trim();
const bad=[];
const on=results.on,off=results.off;
for(const l of on.split(/\r?\n/).filter(l=>/^ \[(OK|CHECK|FAIL|PARTIAL|WAITING)\]/.test(l)))if(!l.startsWith(' [OK]'))bad.push('fix on, stage: '+l.trim());
if(!/Someone left; the bot stayed in voice\s+\(measured: ok · Stayed through 2 of 2 leave/.test(on))bad.push('fix on: '+line(on,/Someone left/));
if(!/MID tag removed on connection\(s\) #1/.test(on))bad.push('fix on: '+line(on,/Leave fix:/));
if(/closed by /.test(line(on,/^ Connection #1:/)))bad.push('fix on: the connection closed: '+line(on,/^ Connection #1:/));
// With the fix off the browser must refuse (at the leave, or already at the answer when a packet lands in between).
if(!/Failed to (set up audio demuxing|apply demuxer criteria)/.test(off))bad.push('fix off: the mock did not hit the demuxing error');
if(!/closed by end/.test(line(off,/^ Connection #1:/)))bad.push('fix off should reproduce the drop: '+line(off,/^ Connection #1:/));
console.log('fix on : '+line(on,/Someone left/)+'\n         '+line(on,/Leave fix:/));
console.log('fix off: '+line(off,/FAILED/));
if(bad.length){console.error('FAILED:\n'+bad.join('\n'));process.exit(1);}
console.log('PASS (mock Steam · '+line(on,/^Test app/)+' · reports in '+path.relative(ROOT,OUT)+')');

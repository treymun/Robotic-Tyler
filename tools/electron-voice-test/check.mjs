// Automated check of the Electron voice test (a MOCK, not Steam: no Steam servers, no Windows audio).
//   ELECTRON=/path/to/electron node tools/electron-voice-test/check.mjs
// A fake steamcommunity.com/chat page plays Steam's part with a second, unwrapped WebRTC end as the
// "voice server": the bot joins, a friend joins (the server's re-offer adds section 1), then the
// friend leaves and the server's re-offer lists in section 1 the stream section 0 still has, which
// is the collision the live test hit ("Failed to set up audio demuxing for mid='m1'"). Like Steam,
// the page ends the call when a description is rejected. Runs twice: leave fix on (the bot must
// stay) and off (the mock must reproduce the drop). Uses xvfb-run on Linux without a display.
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
 const bot=new RTCPeerConnection({bundlePolicy:'max-bundle'}),srv=new SrvPC({bundlePolicy:'max-bundle'});
 bot.onicecandidate=e=>e.candidate&&srv.addIceCandidate(e.candidate).catch(()=>{});srv.onicecandidate=e=>e.candidate&&bot.addIceCandidate(e.candidate).catch(()=>{});
 bot.addTrack(mic.getAudioTracks()[0],mic);bot.ontrack=e=>{const el=new Audio();el.srcObject=e.streams[0];el.play().catch(()=>{});};
 const voice=document.createElement('div');voice.className='chatRoomVoiceChannel ActiveVoiceChannel';voice.textContent='in voice';
 const end=why=>{console.log('(VoiceChat) Fatal error, ending chat: '+why);bot.close();voice.remove();};
 async function apply(d){try{await bot.setRemoteDescription(d);if(d.type==='offer'){const a=await bot.createAnswer();await bot.setLocalDescription(a);await srv.setRemoteDescription(a);}}catch(e){end(String(e));}}
 await bot.setLocalDescription(await bot.createOffer());await srv.setRemoteDescription(bot.localDescription);
 const main=osc(400),t0=srv.getTransceivers()[0];await t0.sender.replaceTrack(main.getAudioTracks()[0]);t0.sender.setStreams(main);t0.direction='sendrecv';
 const ans=await srv.createAnswer();await srv.setLocalDescription(ans);await apply(ans);document.getElementById('voice').append(voice);
 const ssrc=m=>(/a=ssrc:(\\d+)/.exec(m)||[])[1],msid=m=>(/a=msid:(\\S+)/.exec(m)||[])[1];
 setTimeout(async()=>{const f=osc(650);srv.addTransceiver(f.getAudioTracks()[0],{direction:'sendonly',streams:[f]});const o=await srv.createOffer();await srv.setLocalDescription(o);await apply(o);},3000);
 setTimeout(async()=>{if(bot.signalingState==='closed')return;const o=await srv.createOffer();await srv.setLocalDescription(o);const p=o.sdp.split(/\\r\\n(?=m=)/);
  p[2]=p[2].split(ssrc(p[2])).join(ssrc(p[1])).split(msid(p[2])).join(msid(p[1]));await apply({type:'offer',sdp:p.join('\\r\\n')});},7000);
 window.__keep=[srv];
})();
</script>`);
const display=process.platform!=='linux'||process.env.DISPLAY;
const results={};
for(const fix of ['on','off']){
 const data=path.join(OUT,'data-'+fix);fs.mkdirSync(data,{recursive:true});fs.writeFileSync(path.join(data,'test-state.json'),JSON.stringify({mode:'manual',identity:'chrome',repair:fix}));
 const report=path.join(OUT,'report-fix-'+fix+'.txt');
 const args=[ELECTRON,...(process.platform==='linux'?['--no-sandbox']:[]),'--use-fake-device-for-media-stream','--use-fake-ui-for-media-stream',app];
 const env={...process.env,TYLER_TEST_DATA:data,TYLER_TEST_MOCK_STEAM:mock,TYLER_TEST_REPORT:report,TYLER_TEST_SECONDS:'22',TYLER_TEST_AUTO_ALLOW:'1'};
 const r=display?spawnSync(args[0],args.slice(1),{env,timeout:90000}):spawnSync('xvfb-run',['-a',...args],{env,timeout:90000});
 if(!fs.existsSync(report)){console.error('No report for fix '+fix+' (exit '+r.status+')\n'+String(r.stderr).slice(-1500));process.exit(1);}
 results[fix]=fs.readFileSync(report,'utf8');
}
const line=(t,re)=>(t.split(/\r?\n/).find(l=>re.test(l))||'').trim();
const bad=[];
const on=results.on,off=results.off;
for(const l of on.split(/\r?\n/).filter(l=>/^ \[(OK|CHECK|FAIL|PARTIAL|WAITING)\]/.test(l)))if(!l.startsWith(' [OK]'))bad.push('fix on, stage: '+l.trim());
if(!/Someone left; the bot stayed in voice\s+\(measured: ok/.test(on))bad.push('fix on: '+line(on,/Someone left/));
if(!/descriptions adjusted 1\b/.test(on))bad.push('fix on: '+line(on,/Leave fix:/));
if(!/Someone left; the bot stayed in voice\s+\(measured: fail/.test(off))bad.push('fix off should reproduce the drop: '+line(off,/Someone left/));
if(!/Failed to set up audio demuxing/.test(off))bad.push('fix off: the mock did not hit the demuxing error');
console.log('fix on : '+line(on,/Someone left/)+'\n         '+line(on,/removed SSRC/));
console.log('fix off: '+line(off,/Someone left/));
if(bad.length){console.error('FAILED:\n'+bad.join('\n'));process.exit(1);}
console.log('PASS (mock Steam · '+line(on,/^Test app/)+' · reports in '+path.relative(ROOT,OUT)+')');

// Automated check of the WebView2 test's page scripts in Chromium (NOT WebView2, NOT Steam: a mock):
// node tools/webview2-voice-test/check.mjs  (MODE=manual|bridge, default both via two runs)
// a fake steamcommunity.com/chat page joins a "voice channel" whose other end is a second page
// (the friend), connected over real WebRTC. The panel page gets the same messages the C# host
// relays. MODE=manual|bridge.
import http from 'node:http';import fs from 'node:fs';import path from 'node:path';import {createRequire} from 'node:module';import {fileURLToPath} from 'node:url';
const HERE=path.dirname(fileURLToPath(import.meta.url)),ROOT=path.resolve(HERE,'..','..');
const require=createRequire(path.join(ROOT,'package.json'));const {chromium}=require('playwright');
const WEB=path.join(HERE,'web'),EXT=path.join(ROOT,'browser-extension'),OUT=process.argv[2]||path.join(ROOT,'dist','webview2-voice-test','check');fs.mkdirSync(OUT,{recursive:true});
const MODE=process.env.MODE||'manual';
const types={'.html':'text/html','.js':'text/javascript','.css':'text/css','.ico':'image/x-icon'};
const server=http.createServer((req,res)=>{const f=path.join(WEB,decodeURIComponent(new URL(req.url,'http://x').pathname));if(!fs.existsSync(f)){res.writeHead(404);res.end();return;}res.writeHead(200,{'content-type':types[path.extname(f)]||'application/octet-stream'});fs.createReadStream(f).pipe(res);}).listen(0);
const base='http://127.0.0.1:'+server.address().port;
const b=await chromium.launch({args:['--use-fake-device-for-media-stream','--use-fake-ui-for-media-stream','--autoplay-policy=no-user-gesture-required']});
const ctx=await b.newContext({viewport:{width:470,height:1500},deviceScaleFactor:1,permissions:['microphone']});
const panel=await ctx.newPage();const actions=[];
await panel.addInitScript(()=>{const l=[];window.chrome={webview:{addEventListener:(t,f)=>l.push(f),postMessage:m=>window.__act(JSON.stringify(m))}};window.__deliver=j=>{const data=JSON.parse(j);for(const f of l)f({data});};});
await panel.exposeFunction('__act',j=>actions.push(JSON.parse(j)));
await panel.goto(base+'/panel.html');
const toPanel=o=>panel.evaluate(j=>window.__deliver(j),JSON.stringify(o));
await toPanel({type:'host',app:'0.1.0',runtime:'(Chromium '+b.version()+', harness)',sdk:'n/a',os:'Linux harness',arch:'X64',userAgent:'',profile:'(harness)',mode:MODE,extension:{bundled:true,installed:false,enabled:false,id:'',version:'2.18.1',error:''},bridgeInjected:MODE==='bridge'});
// The friend: a plain page with its own WebRTC end, speaking in bursts and measuring what it hears.
const friend=await ctx.newPage();await friend.goto(base+'/panel.css');
await friend.evaluate(()=>{window.ac=new AudioContext();const o=window.ac.createOscillator();o.frequency.value=320;const am=window.ac.createGain();am.gain.value=0;o.connect(am);const dst=window.ac.createMediaStreamDestination();am.connect(dst);o.start();
 let t=window.ac.currentTime+.5;for(let i=0;i<60;i++){am.gain.setValueAtTime(0,t);am.gain.linearRampToValueAtTime(.5,t+.05);am.gain.setValueAtTime(.5,t+1.5);am.gain.linearRampToValueAtTime(0,t+1.55);t+=3.4;}
 window.voice=dst.stream;window.heard=[];});
const steam=await ctx.newPage();steam.on('pageerror',e=>console.log('steam error:',e.message));const sent=[];
await steam.exposeFunction('__diag',j=>{const m=JSON.parse(j);sent.push(m);return toPanel({type:'page',msg:m});});
await steam.route('https://steamcommunity.com/**',r=>r.fulfill({contentType:'text/html',body:'<!doctype html><title>Steam chat (harness)</title><body><h1>Fake Steam chat</h1><div id="voice"></div></body>'}));
await steam.addInitScript(()=>{window.chrome={webview:{postMessage:m=>window.__diag(JSON.stringify(m))}};});
await steam.addInitScript({content:fs.readFileSync(WEB+'/diagnostics.js','utf8')});
if(MODE==='bridge'){let s="(function(){if(window!==window.top||location.hostname!=='steamcommunity.com'||!location.pathname.startsWith('/chat'))return;\n";
 for(const f of ['soundboard-core.js','soundboard-audio.js','live-pcm.js','audio-bridge.js','wav-codec.js','noise-filter.js','voice-listener.js'])s+='// '+f+'\n'+fs.readFileSync(EXT+'/'+f,'utf8')+'\n;\n';
 s+=fs.readFileSync(WEB+'/bridge-only.js','utf8')+'\n})();';await steam.addInitScript({content:s});}
await steam.goto('https://steamcommunity.com/chat/');
// Signalling between the "Steam" page and the friend, through Node.
await steam.exposeFunction('__toFriend',j=>friend.evaluate(async j=>{const m=JSON.parse(j);window.pc?.close();const pc=window.pc=new RTCPeerConnection();pc.addTrack(window.voice.getAudioTracks()[0],window.voice);
  pc.ontrack=e=>{window.inTrack=e.track;const a=new Audio();a.srcObject=new MediaStream([e.track]);a.muted=false;a.play().catch(()=>{});window.inAudio=a;};await pc.setRemoteDescription(m);const a=await pc.createAnswer();await pc.setLocalDescription(a);
  await new Promise(r=>{if(pc.iceGatheringState==='complete')r();else pc.onicegatheringstatechange=()=>pc.iceGatheringState==='complete'&&r();});return JSON.stringify(pc.localDescription);},j));
const join=()=>steam.evaluate(async()=>{const mic=await navigator.mediaDevices.getUserMedia({audio:true});const pc=window.pc=new RTCPeerConnection();for(const t of mic.getAudioTracks())pc.addTrack(t,mic);
  pc.ontrack=e=>{const a=new Audio();a.srcObject=e.streams[0]||new MediaStream([e.track]);a.play().catch(()=>{});window.remoteAudio=a;};
  const o=await pc.createOffer();await pc.setLocalDescription(o);await new Promise(r=>{if(pc.iceGatheringState==='complete')r();else pc.onicegatheringstatechange=()=>pc.iceGatheringState==='complete'&&r();});
  const ans=JSON.parse(await window.__toFriend(JSON.stringify(pc.localDescription)));await pc.setRemoteDescription(ans);
  const v=document.createElement('div');v.className='chatRoomVoiceChannel ActiveVoiceChannel';v.textContent='General voice (joined)';document.getElementById('voice').replaceChildren(v);});
const leave=()=>steam.evaluate(()=>{window.pc.close();document.getElementById('voice').replaceChildren();});
// What the friend hears: inbound audio level at the friend's end.
const friendHears=()=>friend.evaluate(async()=>{let lvl=0,e=0;(await window.pc.getStats()).forEach(s=>{if(s.type==='inbound-rtp'&&s.kind==='audio'){lvl=s.audioLevel||0;e=s.totalAudioEnergy||0;}});return {lvl,e};});
const wait=ms=>new Promise(r=>setTimeout(r,ms));const click=sel=>steam.click(sel);
const shot=async n=>{await wait(1200);await panel.screenshot({path:`${OUT}/${MODE}-${n}.png`,fullPage:true});};
const log=[];const note=s=>{log.push(s);console.log(s);};
if(MODE==='manual'){
 await toPanel({type:'permission',kind:'Microphone',origin:'https://steamcommunity.com',userInitiated:true,mode:'manual',state:'allowed'});
 await join();await wait(6000);await shot('joined');
 await leave();await wait(2500);await join();await wait(5000);await shot('rejoined');
}else{
 const bar=await steam.waitForSelector('#tyler-wv2-bridge-bar button',{timeout:8000}).catch(()=>null);note('test bar '+(bar?'present':'MISSING'));
 await steam.click('#tyler-wv2-bridge-bar button:nth-of-type(1)');await wait(500);
 await join();await wait(2500);
 let f0=await friendHears();await steam.click('#tyler-wv2-bridge-bar button:nth-of-type(2)');await wait(2200);let f1=await friendHears();note('friend energy during beep +'+(f1.e-f0.e).toFixed(4));
 await steam.click('#tyler-wv2-bridge-bar button:nth-of-type(3)');await wait(9000);let f2=await friendHears();note('friend energy during listen/echo +'+(f2.e-f1.e).toFixed(4));
 await shot('joined');
 await leave();await wait(2500);await join();await wait(2000);f0=await friendHears();await steam.click('#tyler-wv2-bridge-bar button:nth-of-type(2)');await wait(2500);f1=await friendHears();note('after rejoin: friend energy during beep +'+(f1.e-f0.e).toFixed(4));
 await wait(6000);await shot('rejoined');
}
const report=await panel.evaluate(()=>window.__tylerTestReport());fs.writeFileSync(`${OUT}/${MODE}-report.txt`,report);
const lines=report.split('\r\n');console.log(lines.slice(0,30).join('\n'));
await b.close();server.close();
// Every stage and every measured check must pass in this mock call.
const stages=lines.filter(l=>/^ \[(OK|CHECK|FAIL|PARTIAL|WAITING)\]/.test(l)),checks=lines.filter(l=>/\(measured: /.test(l));
// (One friend here, so nobody leaves: tools/electron-voice-test/check.mjs covers someone leaving.)
const bad=[...stages.filter(l=>!l.startsWith(' [OK]')),...checks.filter(l=>!/measured: ok/.test(l)&&!/Text reply|Someone left/.test(l))];
if(MODE==='bridge'&&!log.some(l=>/friend energy during beep \+0\.00[1-9]/.test(l)))bad.push('the friend did not receive the beep');
if(bad.length){console.error('FAILED:\n'+bad.join('\n'));process.exit(1);}console.log('PASS ('+MODE+')');

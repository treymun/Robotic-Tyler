// End-to-end (v2.31): the themed soundboard defaults in real Chromium.
//  1. All 250 clips decode and play through the real player (soundboard-audio.js) at their length,
//     with headroom at full volume, and the +3 dB level is what it says.
//  2. Through the real audio bridge into a stand-in call (two RTCPeerConnections on this machine,
//     Chromium's real Opus encoder): a themed clip reaches the other side as Tyler's microphone;
//     a second request while it plays is refused, Stop silences it, and the 3-second cooldown holds.
//  3. The real unpacked extension (service worker reading its own packaged files) against a stand-in
//     Steam page: the pads follow the theme in all 25 themes, sound 11 and the user's own clips,
//     names, order and upload over pad 2 stay the same, nothing is written, and after a restart too.
// Not tested here: a real Steam call (what Steam's servers and other people hear) and listening quality.
import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const {chromium}=require('playwright');
const ROOT=path.resolve(import.meta.dirname,'../..'),EXT=path.join(ROOT,'browser-extension');
const manifest=JSON.parse(fs.readFileSync(path.join(ROOT,'assets/theme-sounds/manifest.json'),'utf8'));
const fileOf=(theme,slot)=>'sounds/themes/'+manifest.themes.find(t=>t.id===theme).clips[slot-1].file.slice(6);
const b64=rel=>fs.readFileSync(path.join(EXT,rel)).toString('base64');
const THEMES=manifest.themes.map(t=>t.id);

function serve(page){return http.createServer((req,res)=>{const url=new URL(req.url,'http://x');if(url.pathname==='/'){res.writeHead(200,{'content-type':'text/html'});res.end(page);return;}
 const file=path.join(ROOT,decodeURIComponent(url.pathname));if(!file.startsWith(ROOT)||!fs.existsSync(file)){res.writeHead(404);res.end();return;}res.writeHead(200,{'content-type':file.endsWith('.mp3')?'audio/mpeg':'text/javascript'});fs.createReadStream(file).pipe(res);}).listen(0);}

test('all 250 themed clips decode and play through the real player, with headroom (mocked: no call)',{timeout:180000},async()=>{
 const server=serve('<!doctype html><script src="/browser-extension/soundboard-core.js"></script><script src="/browser-extension/soundboard-audio.js"></script>');
 const browser=await chromium.launch();
 try{
  const page=await browser.newPage();await page.goto('http://127.0.0.1:'+server.address().port+'/');
  const clips=manifest.themes.flatMap(t=>t.clips.map(c=>({theme:t.id,slot:c.slot,seconds:c.seconds,url:'/browser-extension/'+fileOf(t.id,c.slot)})));
  const out=await page.evaluate(async clips=>{
   const render=async(m,volume)=>{const sr=48000,ctx=new OfflineAudioContext(2,sr*8,sr);const proxy=new Proxy(ctx,{get:(t,k)=>k==='resume'?()=>Promise.resolve():typeof t[k]==='function'?t[k].bind(t):t[k]});
    const b=new TylerBoardAudio(proxy,ctx.destination);await b.play({...m,volume});const buf=await ctx.startRendering();let peak=0,sum=0,last=0;
    for(let c=0;c<2;c++){const d=buf.getChannelData(c);for(let i=0;i<d.length;i++){const a=Math.abs(d[i]);if(a>peak)peak=a;sum+=a*a;if(a>1e-4)last=Math.max(last,i);}}
    return {peak:20*Math.log10(peak||1e-9),energy:sum,end:last/sr};};
   const res=[];
   for(const c of clips){const bytes=new Uint8Array(await (await fetch(c.url)).arrayBuffer());let s='';for(let i=0;i<bytes.length;i+=0x8000)s+=String.fromCharCode(...bytes.subarray(i,i+0x8000));
    const clip={audio:btoa(s),seconds:c.seconds,name:'x',level:3};
    const r=await render({slot:c.slot,clip},1);res.push({...c,...r});}
   // The level: the same clip with and without it.
   const one=res[0],bytes=new Uint8Array(await (await fetch(one.url)).arrayBuffer());let s='';for(let i=0;i<bytes.length;i+=0x8000)s+=String.fromCharCode(...bytes.subarray(i,i+0x8000));
   const a=await render({slot:1,clip:{audio:btoa(s),seconds:1,name:'x',level:3}},.6),b=await render({slot:1,clip:{audio:btoa(s),seconds:1,name:'x'}},.6);
   return {res,levelDb:10*Math.log10(a.energy/b.energy)};
  },clips);
  assert.equal(out.res.length,250);
  for(const r of out.res){
   assert.ok(r.peak>-40,r.theme+' '+r.slot+' is audible ('+r.peak.toFixed(1)+' dBFS)');
   assert.ok(r.peak<-3,r.theme+' '+r.slot+' keeps headroom at full soundboard volume ('+r.peak.toFixed(1)+' dBFS, before the voice gain)');
   assert.ok(r.end<=r.seconds+.08&&r.end>=Math.min(r.seconds*.5,r.seconds-.3),r.theme+' '+r.slot+' plays its length: '+r.end.toFixed(2)+' of '+r.seconds);}
  assert.ok(Math.abs(out.levelDb-3)<.1,'+3 dB: '+out.levelDb.toFixed(2));
 }finally{await browser.close();server.close();}
});

const CALL=`<!doctype html><meta charset="utf-8"><title>Mock Steam call</title><body><script>
window.__status=[];addEventListener('message',e=>{if(['tyler-soundboard-status','tyler-audio-status'].includes(e.data?.source))__status.push(e.data.text);});
window.cmd=(type,extra={})=>window.postMessage({source:'tyler-audio-command',type,...extra},location.origin);
window.call=async()=>{
 cmd('enable');await new Promise(r=>setTimeout(r,200));
 const mic=await navigator.mediaDevices.getUserMedia({audio:true});
 const a=new RTCPeerConnection(),b=new RTCPeerConnection();a.onicecandidate=e=>e.candidate&&b.addIceCandidate(e.candidate);b.onicecandidate=e=>e.candidate&&a.addIceCandidate(e.candidate);
 a.addTrack(mic.getAudioTracks()[0],mic);
 const got=new Promise(r=>{b.ontrack=e=>{const el=new Audio();el.srcObject=e.streams[0];el.muted=true;el.play().catch(()=>{});const ac=new AudioContext(),an=ac.createAnalyser();an.fftSize=4096;ac.createMediaStreamSource(e.streams[0]).connect(an);
  window.level=()=>{const d=new Float32Array(an.fftSize);an.getFloatTimeDomainData(d);let s=0;for(const v of d)s+=v*v;return 10*Math.log10(s/d.length+1e-12);};r();};});
 await a.setLocalDescription(await a.createOffer());await b.setRemoteDescription(a.localDescription);await b.setLocalDescription(await b.createAnswer());await a.setRemoteDescription(b.localDescription);
 for(let i=0;i<50&&a.connectionState!=='connected';i++)await new Promise(r=>setTimeout(r,100));await got;return a.connectionState;
};
window.loudest=async ms=>{let m=-120;const t=performance.now();while(performance.now()-t<ms){m=Math.max(m,level());await new Promise(r=>setTimeout(r,20));}return m;};
</script><script src="/browser-extension/soundboard-core.js"></script><script src="/browser-extension/soundboard-audio.js"></script><script src="/browser-extension/audio-bridge.js"></script>`;

test('a themed clip goes out as Tyler\'s microphone; overlap refused, Stop and cooldown hold (stand-in call, no Steam)',{timeout:120000},async()=>{
 const server=serve(CALL);
 const browser=await chromium.launch({args:['--autoplay-policy=no-user-gesture-required']});
 try{
  const page=await browser.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('http://127.0.0.1:'+server.address().port+'/');
  assert.equal(await page.evaluate(()=>call()),'connected');
  assert.ok(await page.evaluate(()=>loudest(400))<-60,'silence before');
  const clip={audio:b64(fileOf('tf2',2)),seconds:3.093,name:'Airhorn',level:3};
  await page.evaluate(c=>cmd('board-play',{slot:2,clip:c,volume:.6}),clip);
  const heard=await page.evaluate(()=>loudest(900));assert.ok(heard>-45,'the other side hears it: '+heard.toFixed(1)+' dBFS');
  await page.evaluate(c=>cmd('board-play',{slot:2,clip:c,volume:.6}),clip);await page.waitForTimeout(150);
  assert.ok((await page.evaluate(()=>__status)).some(t=>/already playing/.test(t)),'a second request while one plays is refused');
  await page.evaluate(()=>cmd('board-stop'));await page.waitForTimeout(400);
  assert.ok(await page.evaluate(()=>loudest(400))<-60,'Stop silences it');
  await page.evaluate(c=>cmd('board-play',{slot:2,clip:c,volume:.6}),clip);await page.waitForTimeout(150);
  assert.ok((await page.evaluate(()=>__status)).some(t=>/Wait 3 seconds/.test(t)),'the 3-second cooldown');
  const st=await page.evaluate(()=>__status);assert.ok(st.includes('Playing sound 2 · Airhorn'),st.join(' | '));assert.ok(st.includes('Soundboard stopped.'));
  assert.deepEqual(errors,[]);
 }finally{await browser.close();server.close();}
});

// A saved soundboard as an existing user has it (see tests/theme-sounds.test.mjs).
const clip=(name,n)=>({audio:Buffer.from('ID3'+name+'x'.repeat(n)).toString('base64'),seconds:1.5,name});
const SAVED={soundboardSlots:{2:clip('My airhorn',40),11:clip('Bruh',30),12:clip('Wow',20)},soundboardLabels:{1:'Ping',11:'Bruh moment'},soundboardTriggers:{11:'bruh'},boardFavorites:[11]};
const steamPage=fs.readFileSync(path.join(ROOT,'tools/preview/panel.html'),'utf8').replace(/<script>[\s\S]*?<\/script>/g,'');

async function open(profile){
 const ctx=await chromium.launchPersistentContext(profile,{channel:'chromium',headless:true,args:['--disable-extensions-except='+EXT,'--load-extension='+EXT]});
 await ctx.route('https://steamcommunity.com/**',route=>route.fulfill({status:200,contentType:'text/html',body:steamPage}));
 let [worker]=ctx.serviceWorkers();if(!worker)worker=await ctx.waitForEvent('serviceworker',{timeout:20000});
 const tab=await ctx.newPage();const errors=[];tab.on('pageerror',e=>errors.push(e.message));
 await tab.goto('https://steamcommunity.com/chat/');await tab.waitForFunction(()=>!!document.getElementById('tyler-companion-root'),null,{timeout:15000});
 for(let i=0;i<50;i++){if(typeof (await worker.evaluate(()=>chrome.storage.session.get('activeBotTab'))).activeBotTab==='number')break;await tab.waitForTimeout(100);}
 await tab.evaluate(()=>{window.__plays=[];addEventListener('message',e=>{if(e.data?.source==='tyler-audio-command'&&e.data.type==='board-play')__plays.push({slot:e.data.slot,audio:e.data.clip?.audio||null,level:e.data.clip?.level,name:e.data.clip?.name});});});
 // The panel is in a closed shadow root, as in Steam: reached through the DevTools protocol, which
 // sees closed roots.
 const cdp=await ctx.newCDPSession(tab);
 const inPanel=async selector=>{const {root}=await cdp.send('DOM.getDocument',{depth:-1,pierce:true});
  const find=n=>{if(n.attributes?.includes('tyler-companion-root'))return n;for(const c of [...(n.children||[]),...(n.shadowRoots||[])]){const f=find(c);if(f)return f;}return null;};
  const host=find(root),shadow=host?.shadowRoots?.[0];if(!shadow)throw Error('no panel');
  const {nodeIds}=await cdp.send('DOM.querySelectorAll',{nodeId:shadow.nodeId,selector});return nodeIds;};
 // The panel redraws the pads when the theme changes, which can drop a node between two calls: retry.
 const retry=async f=>{for(let i=0;;i++){try{return await f();}catch(e){if(i>=8||!/No node/.test(e.message))throw e;await tab.waitForTimeout(60);}}};
 const read=(selector,fn)=>retry(async()=>{const out=[];for(const nodeId of await inPanel(selector)){const {object}=await cdp.send('DOM.resolveNode',{nodeId});
  out.push((await cdp.send('Runtime.callFunctionOn',{objectId:object.objectId,functionDeclaration:fn,returnByValue:true})).result.value);}return out;});
 // (A DOM click: theme notices can cover a pad for a moment, and a user would wait for them.)
 const click=selector=>retry(async()=>{const [nodeId]=await inPanel(selector);if(!nodeId)throw Error('not found: '+selector);const {object}=await cdp.send('DOM.resolveNode',{nodeId});
  await cdp.send('Runtime.callFunctionOn',{objectId:object.objectId,functionDeclaration:'function(){this.click()}'});});
 const pads=()=>read('.pad','function(){return this.dataset.slot+" "+this.querySelector("b").textContent}');
 const press=async slot=>{const n=await tab.evaluate(()=>__plays.length);await click('.pad[data-slot="'+slot+'"]');
  await tab.waitForFunction(n=>__plays.length>n,n,{timeout:5000});return tab.evaluate(()=>__plays.at(-1));};
 const until=async(test,ms=8000)=>{const t=Date.now();while(Date.now()-t<ms){if(await test())return;await tab.waitForTimeout(100);}throw Error('timed out');};
 const theme=async t=>{await worker.evaluate(t=>chrome.storage.local.set({uiTheme:t}),t);
  const cue=manifest.themes.find(x=>x.id===t).clips[0].caption;await until(async()=>((await read('.pad[data-slot="1"]','function(){return this.title}'))[0]||'').includes(cue));};
 const R=null;
 const stored=()=>worker.evaluate(()=>chrome.storage.local.get(['soundboardSlots','soundboardLabels','soundboardTriggers','boardFavorites']));
 return {ctx,worker,tab,errors,R,pads,press,theme,stored,click,read,until};
}

test('the real extension: pads follow all 25 themes, your sounds and sound 11 stay, also after a restart',{timeout:300000},async()=>{
 const profile=fs.mkdtempSync(path.join(os.tmpdir(),'tyler-sounds-'));
 try{
  let x=await open(profile);
  try{
   await x.worker.evaluate(s=>chrome.storage.local.set(s),SAVED);
   await x.click('#tab-soundboard');
   await x.theme('classic');await x.theme('steam');
   const layout=await x.pads();assert.deepEqual(layout,['11 Bruh moment','1 Ping','2 My airhorn','3 Drumroll','4 Victory','5 Sad trombone','6 Alert','7 Coin','8 Jump','9 Laser','10 Countdown','12 Wow'],'your names, your favourite first');
   for(const t of THEMES){await x.theme(t);
    const one=await x.press(1);assert.equal(one.audio,b64(fileOf(t,1)),t+': pad 1 plays the theme\'s packaged clip');assert.equal(one.level,3);assert.equal(one.name,'Ping');
    const ten=await x.press(10);assert.equal(ten.audio,b64(fileOf(t,10)),t+': pad 10');
    assert.deepEqual(await x.pads(),layout,t+': same pads, names and order');}
   for(const t of ['doom','xmb']){await x.theme(t);assert.equal((await x.press(11)).audio,SAVED.soundboardSlots[11].audio,t+': sound 11 is yours');
    assert.equal((await x.press(12)).audio,SAVED.soundboardSlots[12].audio);assert.equal((await x.press(2)).audio,SAVED.soundboardSlots[2].audio,t+': your upload over pad 2');}
   assert.deepEqual(await x.stored(),SAVED,'switching themes and playing wrote nothing');
   assert.deepEqual(x.errors,[]);
  }finally{await x.ctx.close();}
  // Restart with the same profile: the saved theme and your soundboard as they were.
  x=await open(profile);
  try{
   await x.click('#tab-soundboard');
   await x.until(async()=>(await x.pads()).length===12);
   assert.equal((await x.press(3)).audio,b64(fileOf('xmb',3)),'still the PS3 theme\'s pad 3');assert.equal((await x.press(11)).audio,SAVED.soundboardSlots[11].audio);
   assert.deepEqual(await x.stored(),SAVED);assert.deepEqual(x.errors,[]);
  }finally{await x.ctx.close();}
 }finally{fs.rmSync(profile,{recursive:true,force:true});}
});

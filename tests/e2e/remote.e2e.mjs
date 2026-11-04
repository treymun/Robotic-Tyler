// End-to-end (v2.25, v2.26): the phone remote.
// Mocked: the Steam window is the panel preview (tools/preview/panel.html) running the real panel
// scripts as the desktop app, against a mock Steam page; the app's IPC between the Steam window and
// the remote server is a direct call here. Real: the remote server (app/remote.cjs) over HTTP and
// Server-Sent Events, and the phone's page in a phone-sized Chromium (iPhone 14 emulation).
//  1. Pairing, the copy of the panel in Tyler's theme with the theme's own extras, live status from
//     the PC, and the remote's buttons reaching the panel.
//  2. All 25 themes chosen from the phone: the PC follows, and the phone runs the same extras.
//  3. The Steam window's side (remote-control.js): status, actions, and events only while watched.
// Not tested: a real phone on Wi-Fi, Windows' firewall, the real Steam page, the Electron IPC (the
// desktop check, tools/desktop-voice-check, covers live events through real Electron IPC).
import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const {chromium,devices}=require('playwright');
const {setupRemote}=require('../../app/remote.cjs');
const {memoryStorage}=require('../../app/vault.cjs');
const ROOT=path.resolve(import.meta.dirname,'../..');
const types={'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.json':'application/json','.svg':'image/svg+xml','.png':'image/png','.webp':'image/webp','.woff2':'font/woff2','.wav':'audio/wav'};
const SHOTS=process.env.REMOTE_SHOT_DIR||'';

/** The panel preview as Tyler's Steam window, the real remote server, and a phone. */
async function bridge(browser,{theme='steam'}={}){
 const files=http.createServer((req,res)=>{const file=path.join(ROOT,decodeURIComponent(new URL(req.url,'http://x').pathname));if(!file.startsWith(ROOT)||!fs.existsSync(file)||fs.statSync(file).isDirectory()){res.writeHead(404);res.end();return;}res.writeHead(200,{'content-type':types[path.extname(file)]||'application/octet-stream'});fs.createReadStream(file).pipe(res);}).listen(0);
 const errors=[];const pc=await (await browser.newContext({viewport:{width:1380,height:920}})).newPage();pc.on('pageerror',e=>errors.push('pc: '+e.message));
 let remote=null;await pc.exposeFunction('__remoteEvent',m=>remote?.push(m.events));
 await pc.goto('http://127.0.0.1:'+files.address().port+'/tools/preview/panel.html?theme='+theme+'&platform=desktop-voice');
 await pc.waitForFunction(()=>window.__tylerReady===true&&window.TylerRemote);
 await pc.evaluate(()=>{window.__results=[];handlers['remote:result']=m=>{window.__results.push(m);return {};};handlers['remote:event']=m=>{window.__remoteEvent(m);return {};};
  window.__played=[];TylerCompanion.playSound=slot=>window.__played.push(slot);window.__sent=[];TylerCompanion.send=t=>window.__sent.push(t);});
 const ask=(action,args={})=>pc.evaluate(async([action,args])=>{const id='t'+Math.random().toString(36).slice(2);for(const fn of listeners)fn({type:'remote:action',id,action,args});
  for(let i=0;i<250;i++){const r=window.__results.find(x=>x.id===id);if(r){if(!r.ok)throw Error(r.error);return r.data;}await new Promise(x=>setTimeout(x,20));}throw Error('no answer');},[action,args]);
 const prefs={theme,muteCall:false};
 remote=setupRemote({vault:memoryStorage(),ask,pageDir:path.join(ROOT,'app','remote'),uiDir:path.join(ROOT,'app','companion','ui'),libDir:path.join(ROOT,'app','companion'),version:'2.26.0',theme:async()=>prefs.theme,
  prefs:{get:async()=>({...prefs}),theme:async t=>{prefs.theme=t;await pc.evaluate(t=>{for(const fn of listeners)fn({type:'storage:changed',changes:{uiTheme:{newValue:t}}});},t);},muteCall:async on=>{prefs.muteCall=on;}}});
 const s=await remote.handle('enable');
 const phone=await (await browser.newContext({...devices['iPhone 14']})).newPage();
 phone.on('pageerror',e=>errors.push('phone: '+e.message));// A 401 before pairing and a 403 for a wrong code are the server's answers, not page errors.
 phone.on('console',m=>{if(m.type()==='error'&&!/status of 40[13] /.test(m.text()))errors.push('phone console: '+m.text());});
 return {pc,phone,remote,prefs,errors,code:s.code,base:'http://127.0.0.1:'+s.port,async close(){await remote.stop();files.close();}};
}
// Inside the phone's copy of the panel (an open shadow root).
// (A handle, not eval: the page's CSP has no 'unsafe-eval'.)
const inPhone=async(page,fn,arg)=>{const r=await page.evaluateHandle(()=>document.getElementById('tyler').shadowRoot);try{return await r.evaluate(fn,arg);}finally{await r.dispose();}};
const tap=(page,id)=>inPhone(page,(r,id)=>r.getElementById(id).click(),id);
const pcMounted=b=>b.pc.evaluate(()=>TylerThemeFeatures.mounted().join(' '));
const phoneMounted=b=>b.phone.evaluate(()=>TylerThemeFeatures.mounted().join(' '));

test('phone remote: pair, a copy of the panel in Tyler\'s theme, live status, buttons (mocked Steam window, real server, phone-sized Chromium)',{timeout:180000},async()=>{
 const browser=await chromium.launch();const b=await bridge(browser,{theme:'payday'});
 try{
  const {phone,pc}=b;
  // Not paired: the pairing card in the panel, in Tyler's theme already.
  await phone.goto(b.base+'/');await phone.waitForFunction(()=>document.getElementById('tyler').shadowRoot?.getElementById('pairView')?.hidden===false);
  assert.equal(await inPhone(phone,r=>r.querySelector('.panel').dataset.rtTheme),'payday');
  assert.match(await inPhone(phone,r=>r.getElementById('activityLabel').textContent),/Not paired/);
  await inPhone(phone,(r,c)=>{r.getElementById('code').value=c;r.getElementById('pairForm').requestSubmit();},b.code==='999999'?'111111':'999999');
  await phone.waitForFunction(()=>/right|expired/.test(document.getElementById('tyler').shadowRoot.getElementById('pairMsg').textContent));
  // The QR code's link pairs, and the code leaves the address bar.
  await phone.goto(b.base+'/?code='+b.code);await phone.waitForFunction(()=>globalThis.__tylerRemote?.state().fx===true,null,{timeout:30000});
  assert.equal(await phone.evaluate(()=>location.search),'');
  await phone.waitForFunction(()=>__tylerRemote.state().link==='live');
  // The same panel parts and the same theme extras as on the PC.
  assert.equal(await phoneMounted(b),await pcMounted(b));assert.ok((await phoneMounted(b)).includes('pd-plan'));
  assert.equal(await inPhone(phone,r=>r.getElementById('hudSpend').textContent),await pc.evaluate(()=>document.getElementById('tyler-companion-root').shadowRoot.getElementById('hudSpend').textContent));
  assert.equal(await phone.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,'no sideways scrolling on a phone');
  // Live: a state change on the PC reaches the phone's status strip as it happens (local, mocked: not a Wi-Fi timing).
  for(const [text,state] of [['SPEAKING — say “stop” to interrupt','speaking'],['THINKING — preparing a typed reply…','thinking'],['LISTENING — speak normally, then pause','listening']]){
   await pc.evaluate(t=>TylerCompanion.setActivity(t),text);
   await phone.waitForFunction(s=>document.getElementById('tyler').shadowRoot.getElementById('activityCard').dataset.state===s,state,{timeout:3000});
  }
  // The extras' numbers start where the PC's are and follow its events.
  const pcS=await pc.evaluate(()=>{const S=TylerThemeFeatures.state();return {spoken:S.spoken,errors:S.errors};});
  await phone.waitForFunction(n=>TylerThemeFeatures.state().spoken===n,pcS.spoken,{timeout:3000});
  if(SHOTS)await phone.screenshot({path:path.join(SHOTS,'remote-phone.png')});
  // Buttons: a clip, a message, the talk mode, the call mute, Pause.
  await phone.waitForFunction(()=>document.getElementById('tyler').shadowRoot.querySelectorAll('.pad').length>=2);
  await tap(phone,'tab-soundboard');const slot=await inPhone(phone,r=>{const p=r.querySelector('.pad');p.click();return Number(p.dataset.slot);});
  await pc.waitForFunction(n=>window.__played.includes(n),slot);
  await tap(phone,'tab-conversation');
  await inPhone(phone,r=>{r.getElementById('say').value='hello squad';r.getElementById('sayForm').requestSubmit();});
  await pc.waitForFunction(()=>window.__sent.includes('hello squad'));
  await phone.waitForFunction(()=>document.getElementById('tyler').shadowRoot.getElementById('say').value==='');
  await inPhone(phone,r=>{const m=r.getElementById('rmMode');m.value='voice';m.dispatchEvent(new Event('change'));});
  await pc.waitForFunction(()=>document.getElementById('tyler-companion-root').shadowRoot.getElementById('setupMode').value==='voice');
  await tap(phone,'tab-setup');await inPhone(phone,r=>r.getElementById('rmMuteCall').click());
  for(let i=0;i<50&&!b.prefs.muteCall;i++)await phone.waitForTimeout(50);
  assert.equal(b.prefs.muteCall,true,'Mute the call in Tyler\'s window');
  // A notification in the theme's own style (the panel's notifications, ui-kit.js).
  assert.ok(await inPhone(phone,r=>!!r.querySelector('.rt-toast')));
  // Music DJ isn't on in this preview: the phone offers to start it, and Play waits for it.
  await tap(phone,'tab-room');
  assert.equal(await inPhone(phone,r=>r.getElementById('rmMusicStart').hidden),false);assert.equal(await inPhone(phone,r=>r.getElementById('query').disabled),true);
  // A tab change plays the theme's own transition, as in the panel.
  assert.equal(await phone.evaluate(()=>TylerThemeFeatures.state().tab),'room');
  // Unpair: back to the code screen, and the phone's access ends.
  await tap(phone,'tab-setup');await tap(phone,'forget');
  await phone.waitForFunction(()=>document.getElementById('tyler').shadowRoot.getElementById('pairView').hidden===false);
  assert.equal((await b.remote.handle('status')).devices.length,0);
  assert.deepEqual(b.errors,[]);
 }finally{await b.close();await browser.close();}
});

test('phone remote: every theme chosen from the phone, the PC follows and both run the same extras',{timeout:240000},async()=>{
 const browser=await chromium.launch();const b=await bridge(browser,{theme:'steam'});
 try{
  const {phone,pc}=b;await phone.goto(b.base+'/?code='+b.code);await phone.waitForFunction(()=>globalThis.__tylerRemote?.state().fx===true,null,{timeout:30000});
  await tap(phone,'tab-setup');
  const themes=await inPhone(phone,r=>[...r.querySelectorAll('.rm-theme')].map(x=>x.dataset.theme));assert.equal(themes.length,25);
  for(const t of [...themes.slice(1),'steam']){
   await phone.waitForTimeout(220); // the remote takes at most 5 presses a second
   await inPhone(phone,(r,t)=>r.querySelector('.rm-theme[data-theme='+t+']').click(),t);
   await pc.waitForFunction(t=>TylerCompanion.getTheme()===t,t);
   await phone.waitForFunction(t=>document.getElementById('tyler').shadowRoot.querySelector('.panel').dataset.rtTheme===t&&TylerThemeFeatures.state().theme===t,t);
   assert.equal(await phoneMounted(b),await pcMounted(b),t);
   assert.equal(await inPhone(phone,(r,t)=>r.querySelector('.rm-theme[aria-pressed=true]')?.dataset.theme,t),t);
   if(SHOTS){await tap(phone,'tab-conversation');await phone.waitForTimeout(700);await phone.screenshot({path:path.join(SHOTS,'remote-'+t+'.png')});await tap(phone,'tab-setup');}
  }
  assert.deepEqual(b.errors,[]);
 }finally{await b.close();await browser.close();}
});

test('Steam window side: status, actions through the panel\'s controls, events only while a phone watches (panel preview as the desktop app)',{timeout:120000},async()=>{
 const browser=await chromium.launch();const b=await bridge(browser,{theme:'steam'});
 try{
  const {pc}=b,ask=(action,args={})=>pc.evaluate(async([action,args])=>{const id='t'+Math.random().toString(36).slice(2);for(const fn of listeners)fn({type:'remote:action',id,action,args});for(let i=0;i<50;i++){const r=window.__results.find(x=>x.id===id);if(r)return r;await new Promise(x=>setTimeout(x,20));}return null;},[action,args]);
  const $=id=>pc.evaluate(id=>{const e=document.getElementById('tyler-companion-root').shadowRoot.getElementById(id);return e?(e.type==='checkbox'?e.checked:e.value):null;},id);
  const st=await ask('state');
  assert.equal(st.ok,true);assert.ok(st.data.sounds.length>=2,'the soundboard');assert.equal(st.data.sounds[0].fav,true,'favourites first');
  for(const k of ['state','label','text','voice','music','replies','theme','hud','controls','fx','now'])assert.ok(k in st.data,k);
  assert.ok(Array.isArray(st.data.fx.turns)&&'life' in st.data.fx&&Array.isArray(st.data.controls.check.items));
  assert.equal(JSON.stringify(st.data).includes('sk-'),false);
  assert.equal((await ask('sound',{slot:st.data.sounds[0].slot})).ok,true);assert.deepEqual(await pc.evaluate(()=>window.__played),[st.data.sounds[0].slot]);
  assert.match((await ask('sound',{slot:999})).error,/isn.t on the soundboard/);
  assert.match((await ask('music-play',{query:'daft punk'})).error,/Start the Music DJ/,'music needs the DJ running on the PC');
  // The panel's own controls change, and their own code runs (keep-alive saves, the volume reaches the bridge).
  assert.equal((await ask('keepalive',{call:false,minutes:'30'})).ok,true);assert.equal(await $('kaCall'),false);
  assert.equal((await ask('keepalive',{call:true,minutes:'30'})).ok,true);assert.equal(await $('kaMinutes'),'30');
  assert.equal((await ask('clip-volume',{value:.3})).ok,true);assert.equal(await $('boardVolume'),'0.3');
  assert.equal((await ask('voice-volume',{value:.5})).ok,true);assert.equal(await $('volume'),'0.5');
  assert.equal((await ask('music-quality',{level:'medium'})).ok,true);assert.equal(await $('musicQuality'),'medium');
  assert.match((await ask('music-quality',{level:'ultra'})).error,/isn.t available/);
  assert.match((await ask('mode',{mode:'party'})).error,/auto, text or voice/);
  assert.equal((await ask('pause')).ok,true);
  assert.match((await ask('nope')).error,/Unknown action/);assert.match((await ask('__proto__')).error,/Unknown action/);
  // Events go to the main process only while a phone watches.
  const events=[];await pc.exposeFunction('__seen',m=>events.push(...m.events));await pc.evaluate(()=>{handlers['remote:event']=m=>{window.__seen(m);return {};};});
  await ask('watch',{on:false});await pc.evaluate(()=>TylerCompanion.setActivity('THINKING — preparing'));await pc.waitForTimeout(300);
  assert.equal(events.length,0,'nobody watching: nothing sent');
  await ask('watch',{on:true});await pc.evaluate(()=>TylerCompanion.setActivity('SPEAKING — on air'));await pc.waitForTimeout(300);
  assert.deepEqual(events.map(e=>e.type+':'+e.data.state),['state:speaking']);assert.deepEqual(Object.keys(events[0].data).sort(),['before','label','state','text']);
  assert.deepEqual(b.errors,[]);
 }finally{await b.close();await browser.close();}
});

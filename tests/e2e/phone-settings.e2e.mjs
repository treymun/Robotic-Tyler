// End-to-end (v2.41): Settings from the phone remote, in headless Chromium.
// MOCKED: the desktop app's main process (its store is a memory vault; its tyler:settings IPC for the PC's
// Settings window and its "changed from the phone" message are stand-ins that do what app/main.cjs does,
// with the same sanitizeSettings and draftWithPhone), and the Steam window (not open: the remote shows it
// isn't ready). Real: the remote server (app/remote.cjs) over HTTP, pairing, the remote page and the
// desktop app's own Settings page on a phone-sized screen (390 × 844, touch), the phone bridge
// (app/remote/phone-settings.js), and the PC's Settings page (app/companion/settings.html) following it.
// Not tested here: a real phone, Windows, the real Electron window (see CHANGES.md).
import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const {chromium}=require('playwright');
const {setupRemote,draftWithPhone}=require('../../app/remote.cjs');
const {memoryStorage}=require('../../app/vault.cjs');
const {sanitizeSettings,settingsKeys}=require('../../app/guards.cjs');
const ROOT=path.resolve(import.meta.dirname,'../..');
const types={'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.json':'application/json','.svg':'image/svg+xml','.png':'image/png','.webp':'image/webp','.woff2':'font/woff2'};
const serve=()=>http.createServer((req,res)=>{const file=path.join(ROOT,decodeURIComponent(new URL(req.url,'http://x').pathname));if(!file.startsWith(ROOT)||!fs.existsSync(file)||fs.statSync(file).isDirectory()){res.writeHead(404);res.end();return;}res.writeHead(200,{'content-type':types[path.extname(file)]||'application/octet-stream'});fs.createReadStream(file).pipe(res);}).listen(0);
const SECRETS={openrouterKey:'sk-or-v1-e2ePHONEsecret0123456789abcdef',geminiKey:'AIzaSyE2EPHONEsecret0123456789',speechKey:'speech-E2E-PHONE-secret'};

test('Settings from the phone: open from the remote, change settings of each kind, keys stay on the PC, refused parts say so, the PC follows',{timeout:180000},async()=>{
 const files=serve(),browser=await chromium.launch(),errors=[];
 const vault=memoryStorage();
 await vault.set({...SECRETS,uiTheme:'tf2',personality:'Old personality',aiProvider:'openrouter',brain:'fast',talkativeness:'active',friendMemory:false,suiteOptions:{hudEnabled:true},insideJokes:'old joke'});
 // The main process: the PC window's settings IPC (app/main.cjs tyler:settings get/set/remove) ...
 const pcStore={get:async keys=>{const names=[].concat(keys).filter(k=>settingsKeys.has(k)),d=await vault.get(names);for(const k of ['geminiKey','openrouterKey','veniceKey'])if(d[k])d[k]=true;delete d.speechKey;return d;},
  set:async v=>{await vault.set(sanitizeSettings(v));},remove:async keys=>{await vault.remove([].concat(keys).filter(k=>settingsKeys.has(k)));}};
 // ... and what it does with a change from the phone (fromPhone): the same store, the draft, the window told.
 let pc=null;const told=[];
 const fromPhone=async values=>{await vault.set(values);const draft=draftWithPhone((await vault.get('settingsDraft')).settingsDraft,values);if(draft)await vault.set({settingsDraft:draft});
  const keys=Object.keys(values).filter(k=>k!=='uiTheme');if(keys.length){told.push(keys);void pc?.evaluate(k=>window.__phoneSettings?.(k),keys).catch(()=>{});}};
 const remote=setupRemote({vault,ask:async a=>a==='state'?{ready:false,error:'Steam chat isn’t open in Tyler’s desktop app.'}:{},pageDir:path.join(ROOT,'app','remote'),uiDir:path.join(ROOT,'app','companion','ui'),libDir:path.join(ROOT,'app','companion'),version:'2.41.0',
  theme:async()=>(await vault.get('uiTheme')).uiTheme||'steam',settings:{read:k=>vault.get(k),write:fromPhone,remove:k=>vault.remove(k)}});
 try{
  // The PC's Settings window, with an edit not saved yet.
  pc=await (await browser.newContext({viewport:{width:1280,height:900}})).newPage();pc.on('pageerror',e=>errors.push('pc: '+e.message));
  await pc.exposeFunction('__pcStore',(op,arg)=>pcStore[op](arg));
  await pc.addInitScript(()=>{const store={get:k=>window.__pcStore('get',k),set:v=>window.__pcStore('set',v),remove:k=>window.__pcStore('remove',k)};
   // Toasts as they appear (they go away after a few seconds).
   window.__toasts=[];new MutationObserver(l=>{for(const m of l)for(const n of m.addedNodes)if(n.classList?.contains('rt-toast'))window.__toasts.push(n.textContent);}).observe(document,{childList:true,subtree:true});
   window.tylerSettings={storage:{local:store},tabs:{create:async()=>{}},verifyKey:async()=>true,activity:async()=>[],ai:async()=>({ok:true}),onTheme:()=>{},onPhoneSettings:fn=>{window.__phoneSettings=fn;},remote:async()=>({on:true,devices:[]}),voice:{devices:async()=>[],tone:async()=>'',test:async()=>({})}};});
  await pc.goto('http://127.0.0.1:'+files.address().port+'/app/companion/settings.html#ai');
  await pc.waitForFunction(()=>document.body.classList.contains('ui-ready')&&document.getElementById('personality').value==='Old personality');
  await pc.evaluate(()=>window.tylerSettingsLoaded);await pc.waitForTimeout(400);
  await pc.evaluate(()=>{location.hash='advanced';});await pc.fill('#insideJokes','old joke\nnew PC joke, not saved yet');await pc.evaluate(()=>{location.hash='ai';});
  await pc.waitForFunction(async()=>(await window.tylerSettings.storage.local.get(['settingsDraft'])).settingsDraft?.values?.insideJokes?.includes('new PC joke'));

  // The phone: pair on the remote, then Setup → Open Settings.
  const s=await remote.handle('enable'),base='http://127.0.0.1:'+s.port;
  const ctx=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,deviceScaleFactor:2});
  const phone=await ctx.newPage();phone.on('pageerror',e=>errors.push('phone: '+e.message));
  phone.on('console',m=>{if(m.type()==='error'&&!/status of 40[13] /.test(m.text()))errors.push('phone console: '+m.text());});
  const bodies=[],outside=[];
  phone.on('request',r=>{if(!r.url().startsWith(base))outside.push(r.url());});
  phone.on('response',async r=>{try{if(/json|html|javascript|css|text/.test(r.headers()['content-type']||''))bodies.push({url:r.url(),status:r.status(),text:await r.text()});}catch{}});
  const inRemote=async(fn,arg)=>{const h=await phone.evaluateHandle(()=>document.getElementById('tyler').shadowRoot);try{return await h.evaluate(fn,arg);}finally{await h.dispose();}};
  await phone.goto(base+'/');await phone.waitForFunction(()=>document.getElementById('tyler').shadowRoot?.getElementById('pairView')?.hidden===false);
  // Before pairing, Settings sends the phone back to the pairing screen.
  assert.equal((await phone.request.get(base+'/settings/',{maxRedirects:0})).status(),303);
  await inRemote((r,code)=>{r.getElementById('code').value=code;r.getElementById('pairForm').requestSubmit();},s.code);
  await phone.waitForFunction(()=>document.getElementById('tyler').shadowRoot.querySelector('.panel').dataset.remote==='remote');
  await inRemote(r=>r.getElementById('tab-setup').click());
  assert.equal(await inRemote(r=>{const b=r.getElementById('rmSettings');return !!b&&b.getBoundingClientRect().height>40&&/Open Settings/.test(b.textContent);}),true,'the Setup tab has Open Settings');
  await Promise.all([phone.waitForURL(base+'/settings/'),inRemote(r=>r.getElementById('rmSettings').click())]);
  await phone.waitForFunction(()=>document.body.classList.contains('ui-ready')&&document.documentElement.dataset.rtTheme==='tf2');
  await phone.evaluate(()=>window.tylerSettingsLoaded);await phone.waitForTimeout(500);
  assert.equal(await phone.inputValue('#personality'),'Old personality','the PC\'s settings');
  assert.equal(await phone.evaluate(()=>document.querySelector('.phone-back')?.getAttribute('href')),'/','a way back to the remote');

  // API keys: only whether one is saved; the fields can't be used.
  await phone.evaluate(()=>{location.hash='ai';});await phone.waitForTimeout(300);
  assert.deepEqual(await phone.evaluate(()=>[...document.querySelectorAll('[data-phone-key]')].map(e=>e.dataset.phoneKey+'='+e.textContent)),['openrouterKey=Saved on your PC','geminiKey=Saved on your PC','veniceKey=Not set']);
  for(const id of ['#openrouterKey','#geminiKey','#veniceKey']){assert.equal(await phone.isVisible(id),false,id);assert.equal(await phone.isDisabled(id),true,id);}
  assert.match(await phone.textContent('#studio'),/API keys are added, changed and removed in Settings on your PC/);

  // A provider change shows the same notes as on the PC.
  await phone.selectOption('#aiProvider','gemini');await phone.selectOption('#geminiTextModel','gemini-3.8-flash');
  await pc.selectOption('#aiProvider','gemini');await pc.selectOption('#geminiTextModel','gemini-3.8-flash');
  for(const id of ['#mcName','#mcPrice','#mcNote'])assert.equal(await phone.textContent(id),await pc.textContent(id),id+' as on the PC');
  assert.match(await phone.textContent('#mcPrice'),/Free tier available/);
  await pc.selectOption('#aiProvider','openrouter'); // back as it was (the PC's window doesn't save this)
  // A select, a toggle, text and a squad switch (saved inside suiteOptions).
  await phone.selectOption('#talkativeness','quiet');await phone.check('#friendMemory');
  await phone.fill('#personality','A calm phone-made personality.');
  await phone.evaluate(()=>{location.hash='squad';});await phone.waitForTimeout(200);await phone.check('#suiteParty');
  // The phone's unsaved edits stay on the phone.
  assert.match(String((await vault.get('settingsDraft')).settingsDraft.values.insideJokes),/new PC joke/);
  await phone.click('#save');
  await phone.waitForFunction(()=>document.getElementById('status').textContent==='Settings saved on your PC.');
  const v=await vault.get(['aiProvider','geminiTextModel','talkativeness','friendMemory','personality','suiteOptions','brain','insideJokes',...Object.keys(SECRETS)]);
  assert.equal(v.aiProvider,'gemini');assert.equal(v.geminiTextModel,'gemini-3.8-flash');assert.equal(v.talkativeness,'quiet');assert.equal(v.friendMemory,true);
  assert.equal(v.personality,'A calm phone-made personality.');assert.equal(v.suiteOptions.partyEnabled,true);assert.equal(v.suiteOptions.hudEnabled,true);
  assert.equal(v.insideJokes,'old joke','the PC\'s unsaved edit isn\'t saved by the phone');
  for(const [k,val] of Object.entries(SECRETS))assert.equal(v[k],val,k+' untouched');
  assert.ok(told.length===1&&told[0].includes('personality')&&told[0].includes('talkativeness')&&!told[0].includes('brain'),'only what changed: '+JSON.stringify(told));

  // The PC's window follows: it reloads with the phone's values and keeps its own unsaved edit.
  await pc.waitForFunction(()=>document.getElementById('personality')?.value==='A calm phone-made personality.',null,{timeout:15000});
  await pc.evaluate(()=>window.tylerSettingsLoaded);
  assert.equal(await pc.inputValue('#talkativeness'),'quiet');assert.equal(await pc.inputValue('#aiProvider'),'gemini');
  assert.match(await pc.inputValue('#insideJokes'),/new PC joke, not saved yet/,'the PC\'s unsaved edit is still there');
  await pc.waitForFunction(()=>window.__toasts.some(t=>/Changed from your phone.*personality/.test(t)));
  // ... so its Save keeps the phone's change.
  await pc.click('#save');await pc.waitForFunction(()=>/Settings saved/.test(document.getElementById('status').textContent));
  const after=await vault.get(['personality','talkativeness','insideJokes']);
  assert.equal(after.personality,'A calm phone-made personality.');assert.equal(after.talkativeness,'quiet');assert.match(after.insideJokes,/new PC joke/);

  // The theme, from Appearance on the phone.
  await phone.evaluate(()=>{location.hash='appearance';});await phone.waitForTimeout(300);
  await phone.click('#themeGallery .tg-card[data-theme=pipboy]');await phone.click('#tgApply');
  await phone.waitForFunction(()=>document.documentElement.dataset.rtTheme==='pipboy');
  await new Promise(r=>setTimeout(r,300));assert.equal((await vault.get('uiTheme')).uiTheme,'pipboy');

  // What stays on the PC says so, and the bridge refuses it.
  await phone.evaluate(()=>{location.hash='ai';});await phone.waitForTimeout(200);
  for(const id of ['#modelTest','#previewReply','#clear','#steam','#imgForgetVenice'])assert.equal(await phone.isVisible(id),false,id+' is hidden');
  assert.match(await phone.textContent('#playground'),/Do this on your PC/);assert.match(await phone.textContent('#studio'),/Do this on your PC: the model test/);
  await phone.evaluate(()=>{location.hash='voice';});await phone.waitForTimeout(200);
  assert.equal(await phone.isVisible('#voiceTest'),false);assert.match(await phone.textContent('#voiceTestSheet'),/Do this on your PC/);
  // v2.41.1: Theme voices and On this PC have their own tabs; on the phone they say they're set up on the PC.
  await phone.evaluate(()=>{location.hash='themevoices';});await phone.waitForTimeout(200);
  assert.equal(await phone.isVisible('#theme-voices'),true);assert.match(await phone.textContent('#theme-voices'),/installed and set up in Settings on your PC/);assert.equal(await phone.isVisible('#tvVoices'),false);
  await phone.evaluate(()=>{location.hash='pc';});await phone.waitForTimeout(200);
  assert.equal(await phone.isVisible('#localAI'),true,'the On this PC tab isn’t empty on the phone');assert.match(await phone.textContent('#localAI'),/installed and set up in Settings on your PC/);
  for(const id of ['#laInstall','#lsInstall','#liInstall'])assert.equal(await phone.isVisible(id),false,id+' stays on the PC');
  await phone.evaluate(()=>{location.hash='images';});await phone.waitForTimeout(200);
  assert.equal(await phone.isVisible('#imageSheet'),true);assert.equal(await phone.isVisible('#imgForgetVenice'),false,'Remove the Venice key stays on the PC');
  await phone.evaluate(()=>{location.hash='advanced';});await phone.waitForTimeout(200);
  for(const id of ['#v22Backup','#v22Import','#v22ElectronActivity'])assert.equal(await phone.isVisible(id),false,id);
  assert.match(await phone.textContent('#v22Tools'),/exported and imported on your PC/);
  await phone.evaluate(()=>{location.hash='overview';});await phone.waitForTimeout(200);
  assert.equal(await phone.isVisible('#remoteOn'),false,'no pairing controls');assert.match(await phone.textContent('#phoneRemote'),/paired and removed in Settings on your PC/);
  const refused=await phone.evaluate(async()=>{const T=window.tylerSettings,why=p=>p.then(()=>'done',e=>e.message);
   return {ai:await why(T.ai({action:'test'})),verify:await why(T.verifyKey('sk-or-v1-x')),log:await why(T.activity()),tone:await why(T.voice.tone('x')),test:await why(T.voice.test({})),devices:await why(T.voice.devices()),
    setKey:await why(T.storage.local.set({openrouterKey:'sk-or-v1-fromphone'})),removeKey:await why(T.storage.local.remove(['geminiKey'])),
    other:['remote','voices','localAI','localImages'].filter(k=>k in T)};});
  for(const k of ['ai','verify','log','tone','test','devices'])assert.match(refused[k],/^Do this on your PC/,k);
  assert.match(refused.setKey,/API keys .* on your PC/);assert.match(refused.removeKey,/API keys .* on your PC/);assert.deepEqual(refused.other,[]);
  // The server refuses a key even if the page is bypassed.
  const direct=await phone.evaluate(async()=>{const r=await fetch('/settings/set',{method:'POST',headers:{'content-type':'application/json','x-tyler-remote':'1'},body:JSON.stringify({values:{geminiKey:'AIzaFromThePhone0123456789'}})});return r.status;});
  assert.equal(direct,403);assert.equal((await vault.get('geminiKey')).geminiKey,SECRETS.geminiKey);

  // No key value anywhere on the phone: the page, its storage, or any answer it got.
  const dom=await phone.content(),stored=await phone.evaluate(()=>JSON.stringify({...sessionStorage})+JSON.stringify({...localStorage}));
  for(const val of Object.values(SECRETS)){assert.ok(!dom.includes(val),'DOM');assert.ok(!stored.includes(val),'phone storage');for(const b of bodies)assert.ok(!b.text.includes(val),b.url);}
  assert.ok(bodies.some(b=>b.url.endsWith('/settings/get')&&b.status===200),'the answers were checked');
  assert.deepEqual(outside,[],'the phone only talks to the PC');
  // Readable at phone width: no sideways scrolling in any section.
  for(const zone of ['overview','ai','images','voice','themevoices','pc','squad','games','appearance','advanced']){await phone.evaluate(z=>{location.hash=z;},zone);await phone.waitForTimeout(150);
   assert.equal(await phone.evaluate(()=>document.documentElement.scrollWidth-document.documentElement.clientWidth),0,zone);}
  // Back to the remote.
  await Promise.all([phone.waitForURL(base+'/'),phone.click('.phone-back')]);
  await phone.waitForFunction(()=>document.getElementById('tyler').shadowRoot?.querySelector('.panel')?.dataset.remote==='remote');
  assert.deepEqual(errors,[]);
 }finally{await remote.stop();await browser.close();files.close();}
});

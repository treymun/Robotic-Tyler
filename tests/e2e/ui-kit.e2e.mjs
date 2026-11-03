// End-to-end (v2.14): Settings → Appearance theme gallery, themed icons, and the
// shared dialogs / notifications / tooltips (ui-kit.js), in real Chromium.
// Settings and the Voice Studio run against a mocked storage; the chat panel uses
// the preview page that runs the real content scripts.
import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const {chromium}=require('playwright');
const ROOT=path.resolve(import.meta.dirname,'../..');
const THEMES=['steam','classic','tf2','cs2','portal','cs16','hev','l4d','winxp','doom'];
const types={'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.json':'application/json','.svg':'image/svg+xml','.png':'image/png','.webp':'image/webp','.woff2':'font/woff2'};
const serve=()=>http.createServer((req,res)=>{
 const file=path.join(ROOT,decodeURIComponent(new URL(req.url,'http://x').pathname));
 if(!file.startsWith(ROOT)||!fs.existsSync(file)||fs.statSync(file).isDirectory()){res.writeHead(404);res.end();return;}
 res.writeHead(200,{'content-type':types[path.extname(file)]||'application/octet-stream'});fs.createReadStream(file).pipe(res);
}).listen(0);
// Settings page storage stand-in; every write is recorded.
const mock=theme=>{const store={uiTheme:theme};window.__writes=[];
 window.chrome={storage:{local:{get:async()=>({...store}),set:async v=>{window.__writes.push(v);Object.assign(store,v);},remove:async()=>{}}},tabs:{create:()=>{},query:async()=>[]}};
 window.tylerSettings={storage:{local:window.chrome.storage.local},tabs:{create:async()=>{}},verifyKey:async()=>true,activity:async()=>[]};};

test('Settings → Appearance: ten live previews, keyboard selection, Apply and Undo, no outside requests',async()=>{
 const server=serve(),browser=await chromium.launch(),base='http://127.0.0.1:'+server.address().port;
 try{
  const page=await browser.newPage({viewport:{width:1360,height:900}});const errors=[],outside=[];
  page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>{if(!r.url().startsWith(base)&&!r.url().startsWith('data:'))outside.push(r.url());});
  await page.addInitScript(mock,'cs2');await page.goto(base+'/browser-extension/settings.html#appearance');
  await page.waitForFunction(()=>document.querySelectorAll('#themeGallery .tg-card').length===10);
  // One card per theme, each a radio with its logo and a real panel preview in its own shadow root.
  const cards=await page.evaluate(()=>[...document.querySelectorAll('#themeGallery .tg-card')].map(c=>({theme:c.dataset.theme,role:c.getAttribute('role'),checked:c.getAttribute('aria-checked'),tab:c.tabIndex,
   preview:c.querySelector('.tg-host').shadowRoot?.querySelector('.panel')?.dataset.rtTheme,inert:c.querySelector('.tg-host').inert,label:c.getAttribute('aria-label')})));
  assert.deepEqual(cards.map(c=>c.theme),THEMES);
  for(const c of cards){assert.equal(c.role,'radio');assert.equal(c.preview,c.theme,c.theme+' preview uses its own theme');assert.equal(c.inert,true,'previews are not interactive');}
  assert.deepEqual(cards.filter(c=>c.checked==='true').map(c=>c.theme),['cs2'],'the theme in use starts selected');
  assert.deepEqual(cards.filter(c=>c.tab===0).map(c=>c.theme),['cs2'],'one tab stop for the whole gallery');
  assert.match(cards.find(c=>c.theme==='cs2').label,/in use/);assert.match(cards.find(c=>c.theme==='portal').label,/light theme/);
  assert.equal(await page.evaluate(()=>document.getElementById('uiThemeName').textContent),'Counter-Strike 2');
  // Logos load for every card.
  await page.waitForFunction(()=>[...document.querySelectorAll('.tg-logo')].every(i=>i.complete&&i.naturalWidth>0));
  // Keyboard: arrows move the selection and the large preview, without changing the theme in use.
  await page.focus('.tg-card[data-theme=cs2]');
  await page.keyboard.press('ArrowRight');
  const sel=()=>page.evaluate(()=>({selected:document.querySelector('.tg-card[aria-checked=true]').dataset.theme,focus:document.activeElement?.dataset?.theme,
   stage:document.querySelector('#themeStage .tg-host').shadowRoot.querySelector('.panel').dataset.rtTheme,page:document.documentElement.dataset.rtTheme,
   apply:document.getElementById('tgApply').textContent.trim(),disabled:document.getElementById('tgApply').disabled}));
  assert.deepEqual(await sel(),{selected:'portal',focus:'portal',stage:'portal',page:'cs2',apply:'Apply Portal',disabled:false});
  await page.keyboard.press('End');assert.equal((await sel()).selected,'doom');
  await page.keyboard.press('Home');assert.equal((await sel()).selected,'steam');
  await page.keyboard.press('ArrowLeft');assert.equal((await sel()).selected,'doom','arrows wrap around');
  // The large preview shows tabs, buttons, an input, the status strip and a notification.
  const stage=await page.evaluate(()=>{const r=document.querySelector('#themeStage .tg-host').shadowRoot;return {tabs:r.querySelectorAll('.tabs button').length,input:!!r.querySelector('input'),buttons:r.querySelectorAll('.btn').length>=2,strip:r.querySelector('.tally')?.dataset.state,toast:!!r.querySelector('.rt-toast'),pixelIcons:getComputedStyle(r.querySelector('.tabs .ic-p')).display!=='none'};});
  assert.deepEqual(stage,{tabs:5,input:true,buttons:true,strip:'speaking',toast:true,pixelIcons:true});
  assert.equal(await page.evaluate(()=>window.__writes.length),0,'previewing saves nothing');
  // Apply with the keyboard (Tab to the button), then Undo from the notification.
  await page.focus('#tgApply');await page.keyboard.press('Enter');
  await page.waitForFunction(()=>document.documentElement.dataset.rtTheme==='doom');
  assert.deepEqual(await page.evaluate(()=>window.__writes.at(-1)),{uiTheme:'doom'});
  const after=await page.evaluate(()=>({badge:document.querySelector('.tg-card[data-applied=true]').dataset.theme,chip:document.getElementById('uiThemeName').textContent,disabled:document.getElementById('tgApply').disabled,
   toast:document.querySelector('.rt-toast[data-kind=success] .rt-toast-title')?.textContent,role:document.querySelector('.rt-toast')?.getAttribute('role')}));
  assert.deepEqual(after,{badge:'doom',chip:'DOOM (classic)',disabled:true,toast:'Theme applied',role:'status'});
  await page.click('.rt-toast .rt-toast-actions button');
  await page.waitForFunction(()=>document.documentElement.dataset.rtTheme==='cs2');
  assert.deepEqual(await page.evaluate(()=>window.__writes.at(-1)),{uiTheme:'cs2'});
  // Narrow window: the gallery reflows without sideways scrolling.
  await page.setViewportSize({width:420,height:900});await page.waitForTimeout(100);
  assert.ok(await page.evaluate(()=>document.querySelector('.tg-layout').scrollWidth<=document.querySelector('.tg-layout').clientWidth+1),'gallery fits a narrow window');
  assert.deepEqual(outside,[],'previews make no outside requests');
  assert.deepEqual(errors,[]);
 }finally{await browser.close();server.close();}
});

test('dialogs trap focus, start on the safe choice for destructive actions, and restore focus',async()=>{
 const server=serve(),browser=await chromium.launch(),base='http://127.0.0.1:'+server.address().port;
 try{
  const page=await browser.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.addInitScript(mock,'hev');await page.goto(base+'/browser-extension/settings.html#overview');
  await page.waitForFunction(()=>!!globalThis.TylerKit);
  await page.focus('#save');
  await page.evaluate(()=>{window.__answer=TylerKit.page().dialog({title:'Emergency stop?',text:'Stops automatic replies and audio.',steps:['One','Two'],confirm:'Stop everything',cancel:'Keep running',danger:true});});
  await page.waitForFunction(()=>document.activeElement?.textContent==='Keep running');
  const box=await page.evaluate(()=>{const d=document.querySelector('.rt-dialog');return {role:d.getAttribute('role'),modal:d.getAttribute('aria-modal'),title:document.getElementById(d.getAttribute('aria-labelledby'))?.textContent,
   danger:d.querySelector('.btn.danger')?.textContent,steps:d.querySelectorAll('.rt-steps li').length,inert:[...document.body.children].filter(c=>!c.matches('[data-rt-kit]')).every(c=>c.inert),themed:getComputedStyle(d).borderTopStyle!=='none'};});
  assert.deepEqual(box,{role:'alertdialog',modal:'true',title:'Emergency stop?',danger:'Stop everything',steps:2,inert:true,themed:true});
  // Tab cycles between the two buttons only.
  await page.keyboard.press('Tab');assert.equal(await page.evaluate(()=>document.activeElement.textContent),'Stop everything');
  await page.keyboard.press('Tab');assert.equal(await page.evaluate(()=>document.activeElement.textContent),'Keep running');
  await page.keyboard.press('Shift+Tab');assert.equal(await page.evaluate(()=>document.activeElement.textContent),'Stop everything');
  // Esc cancels, focus goes back to where it was and the page is usable again.
  await page.keyboard.press('Escape');
  assert.equal(await page.evaluate(()=>window.__answer),false);
  assert.deepEqual(await page.evaluate(()=>({focus:document.activeElement.id,open:!!document.querySelector('.rt-dialog'),inert:[...document.body.children].some(c=>c.inert)})),{focus:'save',open:false,inert:false});
  // A non-destructive dialog starts on its main action; confirming resolves true.
  await page.evaluate(()=>{window.__answer=TylerKit.page().dialog({title:'Unlock automatic features?',text:'…',confirm:'Unlock',cancel:'Not now'});});
  await page.waitForFunction(()=>document.activeElement?.textContent==='Unlock');
  await page.keyboard.press('Enter');assert.equal(await page.evaluate(()=>window.__answer),true);
  assert.deepEqual(errors,[]);
 }finally{await browser.close();server.close();}
});

test('notifications: errors are announced with a next step, repeats are merged, at most three show',async()=>{
 const server=serve(),browser=await chromium.launch(),base='http://127.0.0.1:'+server.address().port;
 try{
  const page=await browser.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.addInitScript(mock,'winxp');await page.goto(base+'/browser-extension/settings.html#overview');
  await page.waitForFunction(()=>!!globalThis.TylerKit);
  const r=await page.evaluate(()=>{const k=TylerKit.page();let ran=0;
   const a=k.toast({kind:'error',title:'Couldn’t connect',text:'Open the chat’s text channel and try again.',action:{label:'Try again',run:()=>{ran++;}}});
   const b=k.toast({kind:'error',title:'Couldn’t connect',text:'Open the chat’s text channel and try again.',action:{label:'Try again',run:()=>{ran++;}}});
   const node=a.node;const out={same:a===b,role:node.getAttribute('role'),action:node.querySelector('.rt-toast-actions button').textContent,close:node.querySelector('.rt-x').getAttribute('aria-label'),icon:node.querySelector('svg.ic')?.dataset.i};
   node.querySelector('.rt-toast-actions button').click();out.ran=ran;
   k.toast({title:'one'});k.toast({title:'two'});k.toast({title:'three'});k.toast({kind:'warning',title:'four'});
   out.count=document.querySelectorAll('.rt-toast:not(.rt-leaving)').length;
   out.safe=(k.toast({title:'<img src=x onerror=alert(1)>'}).node.querySelector('img')===null);return out;});
  assert.deepEqual(r,{same:true,role:'alert',action:'Try again',close:'Dismiss',icon:'error',ran:1,count:3,safe:true});
  assert.deepEqual(errors,[]);
 }finally{await browser.close();server.close();}
});

test('the chat panel: themed icons in every theme, notifications, dialogs and tooltips inside the panel',async()=>{
 const server=serve(),browser=await chromium.launch(),base='http://127.0.0.1:'+server.address().port;
 try{
  const page=await browser.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(base+'/tools/preview/panel.html?theme=steam');await page.waitForFunction(()=>window.__tylerReady===true);
  for(const theme of THEMES){
   await page.evaluate(t=>{for(const fn of listeners)fn({type:'storage:changed',changes:{uiTheme:{newValue:t}}});},theme);
   const icons=await page.evaluate(()=>{const r=document.getElementById('tyler-companion-root').shadowRoot;
    return [...r.querySelectorAll('.tabs button')].map(b=>{const ic=b.querySelector('svg.ic'),v=ic.querySelector('.ic-v'),p=ic.querySelector('.ic-p'),box=ic.getBoundingClientRect();
     return {name:ic.dataset.i,label:b.querySelector('.tab-label').textContent,size:box.width>=12&&box.height>=12,mode:getComputedStyle(p).display!=='none'?'pixel':getComputedStyle(v).display!=='none'?'vector':'none'};});});
   assert.deepEqual(icons.map(i=>i.name),['chat','room','sounds','setup','checks'],theme);
   assert.ok(icons.every(i=>i.size&&i.label),theme+': every tab keeps its label and a visible icon');
   assert.deepEqual([...new Set(icons.map(i=>i.mode))],[theme==='doom'?'pixel':'vector'],theme+' icon style');
  }
  // Notifications and dialogs are built inside the panel, so the theme applies to them.
  await page.evaluate(()=>TylerCompanion.notify({kind:'error',title:'Couldn’t connect',text:'Try again.',action:{label:'Try again',run(){}}}));
  const toast=await page.evaluate(()=>{const r=document.getElementById('tyler-companion-root').shadowRoot,t=r.querySelector('.panel .rt-toast');return {inside:!!t,role:t?.getAttribute('role'),bg:getComputedStyle(t).backgroundImage};});
  assert.equal(toast.inside,true);assert.equal(toast.role,'alert');assert.notEqual(toast.bg,'none','the DOOM skin paints the notification in stone');
  const answer=page.evaluate(()=>TylerCompanion.confirm({title:'Post this reaction?',text:'Tyler will post this.',confirm:'Post to Steam',cancel:'Not now'}));
  await page.waitForFunction(()=>document.getElementById('tyler-companion-root').shadowRoot.activeElement?.textContent==='Post to Steam');
  await page.keyboard.press('Escape');assert.equal(await answer,false);
  // Pointing at an icon-only control shows its themed tooltip inside the panel.
  const at=await page.evaluate(()=>{const b=document.getElementById('tyler-companion-root').shadowRoot.getElementById('collapse').getBoundingClientRect();return {x:b.x+b.width/2,y:b.y+b.height/2};});
  await page.mouse.move(at.x,at.y);
  await page.waitForFunction(()=>!!document.getElementById('tyler-companion-root').shadowRoot.querySelector('.rt-tip'));
  const tip=await page.evaluate(()=>{const t=document.getElementById('tyler-companion-root').shadowRoot.querySelector('.rt-tip');return {role:t.getAttribute('role'),text:t.textContent};});
  assert.deepEqual(tip,{role:'tooltip',text:'Collapse panel (Ctrl+Shift+U)'});
  await page.mouse.move(2,2);
  assert.deepEqual(errors,[]);
 }finally{await browser.close();server.close();}
});

test('Voice Studio: themed icons and an audio problem offers Refresh devices',async()=>{
 const server=serve(),browser=await chromium.launch(),base='http://127.0.0.1:'+server.address().port;
 try{
  const page=await browser.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.addInitScript(()=>{let calls=0;window.__deviceCalls=()=>calls;window.tylerNative={theme:async()=>'l4d',devices:async()=>{calls++;return [{kind:'output',id:'a',name:'CABLE Input (VB-Audio Virtual Cable)'}];},openSettings:async()=>{},openSteam:async()=>{},checkUpdates:async()=>({}),
   playTest:async()=>{throw new Error('The output device "CABLE Input" is not available.');},speak:async()=>'ok',record:async()=>'ok'};});
  await page.goto(base+'/voice-app/native.html');
  await page.waitForFunction(()=>document.documentElement.dataset.rtTheme==='l4d');
  assert.deepEqual(await page.evaluate(()=>[...document.querySelectorAll('nav button svg.ic')].map(i=>i.dataset.i)),['overview','voice','apps','guide']);
  await page.click('nav button[data-page=voice]');await page.click('#test');
  await page.waitForSelector('.rt-toast[data-kind=error]');
  assert.deepEqual(await page.evaluate(()=>{const t=document.querySelector('.rt-toast[data-kind=error]');return {title:t.querySelector('.rt-toast-title').textContent,action:t.querySelector('.rt-toast-actions button').textContent};}),{title:'Audio problem',action:'Refresh devices'});
  const before=await page.evaluate(()=>window.__deviceCalls());
  await page.click('.rt-toast .rt-toast-actions button');
  await page.waitForFunction(n=>window.__deviceCalls()>n,before);
  assert.deepEqual(errors,[]);
 }finally{await browser.close();server.close();}
});

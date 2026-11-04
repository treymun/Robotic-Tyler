// End-to-end (v2.22): Settings → Appearance previews each theme in every activity state with the
// theme's real extras, isolated: the preview is inert, its actions do nothing, and choosing states
// sends no request and stores nothing. Settings page with a mocked extension runtime in headless
// Chromium: no Steam, no AI provider, no Windows audio.
import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const {chromium}=require('playwright');
const ROOT=path.resolve(import.meta.dirname,'../..');
const THEMES=['steam','classic','tf2','cs2','portal','cs16','hev','l4d','winxp','doom','quake','pipboy','combine','deadlock','minecraft','payday','dreamcast','gmod','ricochet','dod'];
const types={'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.json':'application/json','.svg':'image/svg+xml','.png':'image/png','.webp':'image/webp','.woff2':'font/woff2'};

test('theme gallery: activity states and real extras, isolated from chat, audio and AI',{timeout:120000},async()=>{
 const server=http.createServer((req,res)=>{const file=path.join(ROOT,decodeURIComponent(new URL(req.url,'http://x').pathname));if(!file.startsWith(ROOT)||!fs.existsSync(file)||fs.statSync(file).isDirectory()){res.writeHead(404);res.end();return;}res.writeHead(200,{'content-type':types[path.extname(file)]||'application/octet-stream'});fs.createReadStream(file).pipe(res);}).listen(0);
 const browser=await chromium.launch();
 try{
  const base='http://127.0.0.1:'+server.address().port;
  for(const desktop of [false,true]){
   const page=await browser.newPage({viewport:{width:1280,height:1300}});const errors=[],requests=[];
   page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>{if(!r.url().startsWith(base)&&!r.url().startsWith('data:'))requests.push(r.url());});
   await page.addInitScript(()=>{const store={uiTheme:'steam'};window.__writes=[];window.__messages=[];
    window.chrome={storage:{local:{get:async()=>({...store}),set:async v=>{window.__writes.push(v);Object.assign(store,v);},remove:async()=>{}},onChanged:{addListener(){}}},tabs:{create:()=>{},query:async()=>[]},runtime:{sendMessage:async m=>{window.__messages.push(m);return {};},onMessage:{addListener(){}},getURL:x=>x}};
    window.tylerSettings={storage:{local:window.chrome.storage.local},tabs:{create:async()=>{}},verifyKey:async()=>true,activity:async()=>[]};
    window.tylerNative={devices:async()=>[],status:async()=>({ok:true}),openSettings:async()=>{},openSteam:async()=>{},theme:async()=>store.uiTheme};});
   await page.goto(base+(desktop?'/app/companion/settings.html':'/browser-extension/settings.html')+'#appearance');
   await page.waitForSelector('.tg-states button');await page.waitForTimeout(300);
   const stage='document.querySelector("#themeStage .tg-host").shadowRoot';
   assert.deepEqual(await page.evaluate(()=>[...document.querySelectorAll('.tg-states button')].map(b=>b.textContent)),['Listening','Thinking','Speaking','Paused','Reconnecting','Error','Success']);
   assert.equal(await page.evaluate(()=>document.querySelector('#themeStage .tg-host').inert),true,'the preview takes no clicks or keys');
   const before={writes:await page.evaluate(()=>window.__writes.length),messages:await page.evaluate(()=>window.__messages.length)};
   // Every theme mounts all of its extras in the preview.
   for(const theme of THEMES){await page.click('.tg-card[data-theme='+theme+']');
    const fx=await page.evaluate(([s,t])=>({on:(eval(s).querySelector('.panel').dataset.fx||'').split(' ').filter(Boolean).length,all:TylerThemeFeatures.features(t).length}),[stage,theme]);
    assert.ok(fx.all>=2&&fx.on===fx.all,theme+' shows its extras '+JSON.stringify(fx));}
   // States change the status strip and the extras react: PAYDAY's assault, Deadlock's respawn.
   await page.click('.tg-card[data-theme=payday]');await page.click('.tg-states [data-state=error]');await page.waitForTimeout(250);
   assert.equal(await page.evaluate(s=>eval(s).querySelector('.tally').dataset.state,stage),'error');
   assert.equal(await page.evaluate(s=>eval(s).querySelectorAll('.pd-plan>.pd-assault').length,stage),1);
   await page.click('.tg-card[data-theme=deadlock]');await page.waitForTimeout(250);
   assert.equal(await page.evaluate(s=>eval(s).querySelector('.dl-plate').dataset.down,stage),'true','the chosen state stays when the theme changes');
   await page.click('.tg-states [data-state=success]');await page.waitForTimeout(250);
   assert.equal(await page.evaluate(s=>eval(s).querySelector('.tally').dataset.flash,stage),'ok');
   assert.equal(await page.evaluate(s=>eval(s).querySelectorAll('.dl-banner').length,stage),1,'Success shows the recovery');
   await page.click('.tg-states [data-state=waiting]');await page.waitForTimeout(150);
   assert.equal(await page.evaluate(s=>eval(s).querySelector('.tally-label').textContent,stage),'Recovering');
   // Nothing was stored or sent by previewing.
   assert.equal(await page.evaluate(()=>window.__writes.length),before.writes,'previewing stores nothing');
   assert.equal(await page.evaluate(()=>window.__messages.length),before.messages,'previewing sends no message');
   assert.deepEqual(requests,[]);assert.deepEqual(errors,[]);
   await page.close();
  }
 }finally{await browser.close();server.close();}
});

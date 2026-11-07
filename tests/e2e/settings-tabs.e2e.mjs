// End-to-end (v2.41.1): Settings' tabs after splitting the long ones, in real Chromium. Chat images,
// Theme voices and On this PC have their own tabs (On this PC only in the desktop app); links to a
// section open its tab; the theme gallery shows two columns beside the preview; and no tab that used to be
// very long is long again.
// MOCKED: storage and the desktop app's main process (window.tylerSettings answers from a stub; nothing is
// installed). Real: the Settings pages as Chrome and the desktop app ship them.
import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const {chromium}=require('playwright');
const ROOT=path.resolve(import.meta.dirname,'../..');
const types={'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.json':'application/json','.svg':'image/svg+xml','.png':'image/png','.webp':'image/webp','.woff2':'font/woff2'};
const serve=()=>http.createServer((req,res)=>{
 const file=path.join(ROOT,decodeURIComponent(new URL(req.url,'http://x').pathname));
 if(!file.startsWith(ROOT)||!fs.existsSync(file)||fs.statSync(file).isDirectory()){res.writeHead(404);res.end();return;}
 res.writeHead(200,{'content-type':types[path.extname(file)]||'application/octet-stream'});fs.createReadStream(file).pipe(res);
}).listen(0);
const stub=([desktop])=>{const store={uiTheme:'steam',aiProvider:'openrouter'};const local={get:async k=>{const l=k==null?Object.keys(store):Array.isArray(k)?k:[k];return Object.fromEntries(l.filter(x=>x in store).map(x=>[x,store[x]]));},set:async v=>Object.assign(store,v),remove:async()=>{}};
 window.chrome={storage:{local},tabs:{create:()=>{},query:async()=>[]}};
 if(desktop)window.tylerSettings={storage:{local},steamAppearance:async()=>({preferred:store.steamChatAppearance||'off',effective:store.steamChatAppearance||'off'}),tabs:{create:async()=>{}},verifyKey:async()=>true,activity:async()=>[],ai:async()=>({ok:true}),onTheme:()=>{},onVoices:()=>{},remote:async()=>({}),voice:{devices:async()=>[],tone:async()=>'',test:async()=>({})},onLocalAI:()=>{},
  localAI:async op=>op==='status'?{status:{supported:true,installed:false,models:{},settings:{},hardware:{cpu:{model:'CPU',threads:8},ram:{total:16e9},gpus:[]},suggestion:{model:'4b',device:'cpu',notes:[]}},models:{}}:op==='speech-status'?{status:{supported:true,engine:{name:'sherpa-onnx',version:'1.13.8'},installed:{},ready:{},running:{},starting:{},sizes:{},models:{hearing:{label:'Parakeet'},voice:{label:'Kokoro'}},voices:[],checks:{},lastError:{},settings:{}}}:{},
  localImages:async op=>op==='status'?{status:{supported:true,installed:false,models:{},settings:{}},models:{},sizes:[256,512]}:{},voices:async op=>op==='status'?{status:{installed:false,settings:{}},voices:[],modes:{},models:{}}:{}};};
const TABS=['Overview','AI & personality','Chat images','Voice','Theme voices','On this PC','Squad & friends','Games','Appearance','Advanced'];
// Where each section lives now (the ones that moved, and their neighbours that stayed).
const HOME={studio:'ai',personalitySheet:'ai',playground:'ai',imageSheet:'images',voiceStandard:'voice',voiceTestSheet:'voice','theme-voices':'themevoices',localAI:'pc',appearance:'appearance'};

for(const [mode,url,desktop] of [['Chrome','/browser-extension/settings.html',false],['the desktop app','/app/companion/settings.html',true]]){
 test('Settings tabs in '+mode+': the long tabs are split, links open the right tab, two columns of themes',{timeout:120000},async()=>{
  const server=serve(),browser=await chromium.launch(),base='http://127.0.0.1:'+server.address().port;
  try{
   const page=await browser.newPage({viewport:{width:1280,height:900}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
   await page.addInitScript(stub,[desktop]);await page.goto(base+url);await page.waitForFunction(()=>document.body.classList.contains('ui-ready'));
   const tabs=await page.evaluate(()=>[...document.querySelectorAll('.section-nav button')].map(b=>b.textContent.trim()));
   assert.deepEqual(tabs,desktop?TABS:TABS.filter(t=>t!=='On this PC'),'On this PC is the desktop app’s only');
   // Every section belongs to a tab that exists (the pc tab only in the desktop app, where its section shows).
   const zones=await page.evaluate(()=>[...new Set([...document.querySelectorAll('[data-ui-zone]')].map(e=>e.dataset.uiZone))]);
   for(const z of zones){await page.evaluate(z=>{location.hash=z;},z);await page.waitForTimeout(80);if(z==='pc'&&!desktop)continue;assert.equal(await page.evaluate(()=>document.body.dataset.zone),z,'tab '+z);}
   // A link to a section opens its tab, with the section shown.
   for(const [id,zone] of Object.entries(HOME)){
    if(id==='localAI'&&!desktop)continue;
    await page.evaluate(id=>{location.hash=id;},id);await page.waitForTimeout(120);
    assert.equal(await page.evaluate(()=>document.body.dataset.zone),zone,'#'+id+' opens '+zone);
    assert.equal(await page.isVisible('[id="'+id+'"]'),true,'#'+id+' is shown');
   }
   // The provider's "set up in On this PC" link (desktop) switches tab.
   if(desktop){await page.evaluate(()=>{location.hash='ai';});await page.selectOption('#aiProvider','local');await page.waitForTimeout(150);
    await page.click('#studio a[href="#localAI"]');await page.waitForTimeout(200);assert.equal(await page.evaluate(()=>document.body.dataset.zone),'pc');
    assert.equal(await page.isVisible('#laInstall'),true,'the On this PC tab shows its install buttons even with nothing installed');}
   // What made the tabs long: the image settings and the AI on this PC section aren't in AI & personality any
   // more, theme voices aren't in Voice, and the gallery has two columns beside the preview.
   await page.evaluate(()=>{location.hash='ai';});await page.waitForTimeout(150);
   assert.equal(await page.isVisible('#imageSheet'),false);assert.equal(await page.isVisible('#localAI'),false);
   const aiHeight=await page.evaluate(()=>document.documentElement.scrollHeight);
   await page.evaluate(()=>{location.hash='voice';});await page.waitForTimeout(150);assert.equal(await page.isVisible('#theme-voices'),false);
   await page.evaluate(()=>{location.hash='appearance';});await page.waitForFunction(()=>document.querySelectorAll('#themeGallery .tg-card').length===25);
   const cols=await page.evaluate(()=>new Set([...document.querySelectorAll('#themeGallery .tg-card')].map(c=>Math.round(c.getBoundingClientRect().left))).size);
   assert.equal(cols,2,'two columns of theme cards beside the preview');
   const galleryHeight=await page.evaluate(()=>document.documentElement.scrollHeight);
   if(desktop){
    await page.waitForFunction(()=>document.getElementById('steamAppearanceStatus').textContent.includes('original appearance'));
    const theme=await page.evaluate(()=>TylerTheme.current()),navStatus=await page.locator('#uiNavStatus').textContent();
    await page.selectOption('#steamAppearanceMode','full');
    await page.waitForFunction(async()=>(await window.tylerSettings.storage.local.get(['steamChatAppearance'])).steamChatAppearance==='full');
    assert.equal(await page.evaluate(()=>TylerTheme.current()),theme,'appearance mode does not change theme');
    assert.equal(await page.locator('#uiNavStatus').textContent(),navStatus,'immediate appearance setting does not dirty the save bar');
    await page.click('#steamAppearanceOff');await page.waitForFunction(()=>document.getElementById('steamAppearanceStatus').textContent.includes('original appearance'));
    assert.equal(await page.inputValue('#steamAppearanceMode'),'off');
    await page.locator('#steamAppearance').screenshot({path:path.join(ROOT,'test-results/steam-appearance/settings-recovery-fixture.png')});
   }else assert.equal(await page.locator('#steamAppearanceMode').count(),0,'Chrome Settings has no desktop control');
   assert.ok(aiHeight<3400,'AI & personality is '+aiHeight+' px (it was about 4,600)');assert.ok(galleryHeight<3400,'Appearance is '+galleryHeight+' px (it was about 5,100)');
   assert.deepEqual(errors,[]);
  }finally{await browser.close();server.close();}
 });
}

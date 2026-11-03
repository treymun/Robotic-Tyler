// End-to-end: loads the real unpacked extension in Chromium against a stand-in
// Steam chat page served at https://steamcommunity.com/chat/ (request interception,
// no network). Run with: npm run test:e2e  (needs: npx playwright install chromium)
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const {chromium}=require('playwright');

const root=path.resolve(import.meta.dirname,'../..');
const ext=path.join(root,'browser-extension');
// The preview page minus its mocked chrome API and script loader: the real extension supplies both.
const steamPage=fs.readFileSync(path.join(root,'tools/preview/panel.html'),'utf8').replace(/<script>[\s\S]*?<\/script>/g,'');

test('the unpacked extension boots, injects into Steam chat and claims the tab',async()=>{
 const profile=fs.mkdtempSync(path.join(os.tmpdir(),'tyler-e2e-'));
 const ctx=await chromium.launchPersistentContext(profile,{channel:'chromium',headless:true,args:['--disable-extensions-except='+ext,'--load-extension='+ext]});
 const errors=[];
 try{
  await ctx.route('https://steamcommunity.com/**',route=>route.fulfill({status:200,contentType:'text/html',body:steamPage}));
  let [worker]=ctx.serviceWorkers();if(!worker)worker=await ctx.waitForEvent('serviceworker',{timeout:20000});
  assert.match(worker.url(),/\/background\.js$/);

  const tab=await ctx.newPage();
  tab.on('pageerror',e=>errors.push('steam: '+e.message));
  tab.on('console',m=>{if(m.type()==='error')errors.push('steam console: '+m.text());});
  await tab.goto('https://steamcommunity.com/chat/');
  await tab.waitForFunction(()=>!!document.getElementById('tyler-companion-root'),null,{timeout:15000});
  assert.equal(await tab.evaluate(()=>typeof window.TylerNeural),'object','MAIN-world scripts loaded');

  // The panel claims the tab lease through the real background.
  let lease;for(let i=0;i<50&&lease===undefined;i++){lease=(await worker.evaluate(()=>chrome.storage.session.get('activeBotTab'))).activeBotTab;if(lease===undefined)await tab.waitForTimeout(100);}
  assert.equal(typeof lease,'number','tab lease claimed');

  const id=new URL(worker.url()).host;
  const settings=await ctx.newPage();settings.on('pageerror',e=>errors.push('settings: '+e.message));
  await settings.goto('chrome-extension://'+id+'/settings.html#squad');
  await settings.waitForFunction(()=>document.body.dataset.zone==='squad',null,{timeout:10000});
  assert.equal(await settings.locator('#suiteSettings').isVisible(),true);

  // Settings → Appearance (the theme chip in the sidebar opens it): pick a card, press
  // Apply; that saves the shared setting and restyles the page at once.
  assert.equal(await settings.evaluate(()=>document.documentElement.dataset.rtTheme),'steam');
  const applyTheme=async theme=>{await settings.click('.tg-card[data-theme='+theme+']');await settings.click('#tgApply');};
  await settings.click('.theme-chip');
  await settings.waitForFunction(()=>document.body.dataset.zone==='appearance');
  await settings.click('.tg-card[data-theme=classic]');
  assert.equal(await settings.evaluate(()=>document.documentElement.dataset.rtTheme),'steam','choosing a card only previews it');
  await settings.click('#tgApply');
  await settings.waitForFunction(()=>document.documentElement.dataset.rtTheme==='classic');
  assert.equal(await settings.evaluate(()=>getComputedStyle(document.body).backgroundColor),'rgb(62, 70, 55)');
  let saved;for(let i=0;i<30&&saved!=='classic';i++){saved=(await worker.evaluate(()=>chrome.storage.local.get('uiTheme'))).uiTheme;if(saved!=='classic')await settings.waitForTimeout(100);}
  assert.equal(saved,'classic');
  assert.equal(await settings.evaluate(()=>document.querySelector('img.mark').naturalWidth>0),true,'logo loads on the settings page');
  assert.equal(await settings.evaluate(()=>document.querySelector('img.mark').getAttribute('src')),'ui/logos/classic.png','the settings logo follows the theme');
  await applyTheme('tf2');await settings.evaluate(()=>document.fonts.load('16px "Tyler TF2 Display"'));
  assert.equal(await settings.evaluate(()=>document.fonts.check('16px "Tyler TF2 Display"')),true,'theme font loads under the settings page CSP');
  // The open Steam chat tab follows the change, and its isolated-world panel adds the theme font to the page.
  await tab.waitForFunction(()=>document.fonts.check('16px "Tyler TF2 Display"'),null,{timeout:10000});
  await applyTheme('classic');
  saved=null;for(let i=0;i<30&&saved!=='classic';i++){saved=(await worker.evaluate(()=>chrome.storage.local.get('uiTheme'))).uiTheme;if(saved!=='classic')await settings.waitForTimeout(100);}
  const reopened=await ctx.newPage();await reopened.goto('chrome-extension://'+id+'/settings.html#appearance');
  await reopened.waitForFunction(()=>document.querySelector('.tg-card[data-theme=classic]')?.dataset.applied==='true'&&document.getElementById('uiThemeName')?.textContent==='Classic Steam (2004)');await reopened.close();

  assert.deepEqual(errors,[]);
 }finally{await ctx.close();fs.rmSync(profile,{recursive:true,force:true});}
});

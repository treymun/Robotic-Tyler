// End-to-end (v2.22): the polish pass's themed menus and screens. Each opens from its control or key,
// fits inside the panel, works from the keyboard, closes with Escape and runs the panel's own actions
// (the full check, the soundboard). Preview page with the real content scripts and a mocked extension
// runtime in headless Chromium: no Steam, no AI provider, no Windows audio.
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

test('themed menus and screens: open, fit, keyboard, Escape, real actions',{timeout:180000},async()=>{
 const server=http.createServer((req,res)=>{const file=path.join(ROOT,decodeURIComponent(new URL(req.url,'http://x').pathname));if(!file.startsWith(ROOT)||!fs.existsSync(file)||fs.statSync(file).isDirectory()){res.writeHead(404);res.end();return;}res.writeHead(200,{'content-type':types[path.extname(file)]||'application/octet-stream'});fs.createReadStream(file).pipe(res);}).listen(0);
 const browser=await chromium.launch();
 try{
  const page=await browser.newPage({viewport:{width:1000,height:900}});const errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(/theme feature/.test(m.text()))errors.push(m.text());});
  await page.goto('http://127.0.0.1:'+server.address().port+'/tools/preview/panel.html?theme=steam');
  await page.waitForFunction(()=>window.__tylerReady===true&&window.TylerThemeFeatures);
  const R='document.getElementById("tyler-companion-root").shadowRoot';
  const count=s=>page.evaluate(R+'.querySelectorAll('+JSON.stringify(s)+').length');
  const text=s=>page.evaluate(R+'.querySelector('+JSON.stringify(s)+')?.textContent??null');
  const click=s=>page.evaluate(R+'.querySelector('+JSON.stringify(s)+').click()');
  const setTheme=async t=>{await page.evaluate(t=>{for(const fn of listeners)fn({type:'storage:changed',changes:{uiTheme:{newValue:t}}});},t);await page.waitForTimeout(120);};
  const tab=()=>page.evaluate(R+'.querySelector(".tabs [aria-selected=true]")?.dataset.tab??'+R+'.querySelector(".tabs [aria-selected=true]")?.textContent');
  const focused=()=>page.evaluate(R+'.activeElement?.className??""');
  const panel=await page.evaluate(R+'.querySelector(".panel").getBoundingClientRect().toJSON()');
  const over=()=>page.mouse.move(panel.x+panel.width/2,panel.y+panel.height/2);
  const fits=async (sel,menu=false)=>{const r=await page.evaluate(([R,sel])=>{const root=eval(R),b=root.querySelector(sel).getBoundingClientRect(),bar=root.querySelector('.bar').getBoundingClientRect();return {top:b.top,bottom:b.bottom,left:b.left,right:b.right,bar:bar.bottom};},[R,sel]);
   assert.ok(r.top>=(menu?panel.y:r.bar-1)&&r.left>=panel.x&&r.right<=panel.x+panel.width+1&&r.bottom<=panel.y+panel.height+1,sel+' fits the panel '+JSON.stringify(r));};
  await page.evaluate(()=>{window.__played=[];TylerCompanion.playSound=slot=>window.__played.push(slot);});

  // Menus hang from their header control, inside the panel; screens open under the header.
  // Steam: the persona chip opens the status menu; arrows move, Escape closes and focus returns.
  await click('.st-persona');assert.equal(await count('.fx-menu.st-menu'),1);await fits('.st-menu',true);
  assert.ok(await count('.st-menu .fx-menu-item')>=5);
  await page.keyboard.press('ArrowDown');await page.keyboard.press('Escape');
  assert.equal(await count('.fx-menu'),0);assert.match(await focused(),/st-persona/);

  // Combine: the CP-17 plate's directives; Unit record opens the terminal with the sociostability gauge.
  await setTheme('combine');
  await click('.cb-unit');assert.equal(await count('.cb-menu'),1);await fits('.cb-menu',true);
  assert.match(await text('.cb-menu'),/Inspect sector/);
  await page.evaluate(R+'.querySelectorAll(".cb-menu .fx-menu-item").forEach(b=>{if(/Unit record/.test(b.textContent))b.click();})');
  assert.equal(await count('.cb-term .cb-socio'),1);assert.match(await text('.cb-socio'),/SOCIOSTABILITY/);
  await click('.cb-term-close');assert.equal(await count('.cb-term'),0);
  assert.match(await text('.cb-ticker .cb-code'),/^1[01]-\d+$/);

  // Deadlock: B opens the shop; arrows change category; an item runs the real action.
  await setTheme('deadlock');await over();await page.keyboard.press('b');
  assert.equal(await count('.dl-shop'),1);await fits('.dl-shop');assert.equal(await count('.dl-shop-tab'),3);
  await page.evaluate(R+'.querySelector(".dl-shop-tab[aria-selected=true]").focus()');await page.keyboard.press('ArrowRight');
  assert.equal(await page.evaluate(R+'.querySelector(".dl-shop").dataset.cat'),'vitality');
  await page.keyboard.press('Escape');assert.equal(await count('.dl-shop'),0);
  await click('.dl-left');await page.evaluate(R+'.querySelectorAll(".dl-shop-tab")[1].click()');
  await page.evaluate(R+'.querySelector(".dl-item:not(:disabled)").click()');
  assert.equal(await count('.dl-shop'),0);assert.match(await tab(),/checks/i,'Full check opens the Checks tab');
  // Tyler down: the plate counts and offers Rejuvenate.
  await page.evaluate(()=>TylerCompanion.setActivity('NEEDS ATTENTION — Gemini 429 failed · quota reached'));await page.waitForTimeout(100);
  assert.equal(await page.evaluate(R+'.querySelector(".dl-plate").dataset.down'),'true');assert.equal(await count('.dl-rejuv'),1);
  await page.evaluate(()=>TylerCompanion.setActivity('LISTENING — speak normally, then pause'));await page.waitForTimeout(100);
  assert.equal(await page.evaluate(R+'.querySelector(".dl-plate").dataset.down'),'false');assert.equal(await count('.dl-banner'),1);

  // Minecraft: E opens the inventory; 1 plays the first hotbar disc through the soundboard.
  await setTheme('minecraft');await page.evaluate(()=>TylerCompanion.showTab('conversation'));await over();await page.keyboard.press('e');
  assert.equal(await count('.mc-inv'),1);await fits('.mc-inv');assert.equal(await count('.mc-hotbar .mc-slot'),9);
  await page.keyboard.press('1');const played=await page.evaluate(()=>window.__played);assert.equal(played.length,1,'hotbar 1 plays a sound');
  await page.keyboard.press('Escape');assert.equal(await count('.mc-inv'),0);assert.match(await focused(),/mc-chest/);

  // PAYDAY: an assault puts the banner on the plan, with the pager; the timer opens the PAYDAY screen.
  await setTheme('payday');await page.evaluate(()=>TylerCompanion.showTab('conversation'));
  await page.evaluate(()=>TylerCompanion.setActivity('NEEDS ATTENTION — Gemini 429 failed · quota reached'));await page.waitForTimeout(100);
  assert.equal(await count('.pd-plan>.pd-assault[data-phase=assault] .pd-pager'),1);
  await page.evaluate(R+'.querySelector(".pd-pager").focus()');await page.keyboard.press('Enter');
  assert.match(await tab(),/checks/i,'answering the pager runs the full check');
  await page.evaluate(()=>TylerCompanion.setActivity('LISTENING — speak normally, then pause'));await page.waitForTimeout(100);
  assert.equal(await page.evaluate(R+'.querySelector(".pd-assault")?.dataset.phase'),'fade');
  await click('.pd-timer');assert.equal(await count('.pd-payday'),1);await fits('.pd-payday');assert.match(await text('.pd-payday'),/Cleaner costs/);
  await page.keyboard.press('Escape');assert.equal(await count('.pd-payday'),0);

  // Dreamcast: the memory card is the File screen; Music goes to the Room tab (the Music DJ).
  await setTheme('dreamcast');await page.waitForTimeout(1400);await click('.dc-vmu');
  assert.equal(await count('.dc-memory .dc-bios-item'),4);assert.equal(await count('.dc-file'),6);await fits('.dc-memory');
  await page.evaluate(R+'.querySelectorAll(".dc-file")[2].focus()');assert.match(await text('.dc-info'),/SOUNDS/);
  await page.evaluate(R+'.querySelector(".dc-bios-item[data-k=music]").click()');assert.equal(await count('.dc-memory'),0);assert.match(await tab(),/room/);

  // Garry's Mod: Q opens the spawn menu; the search filters the spawn icons; an icon plays its sound.
  await setTheme('gmod');await page.evaluate(()=>TylerCompanion.showTab('conversation'));await over();await page.keyboard.press('q');
  assert.equal(await count('.gm-spawn'),1);await fits('.gm-spawn');const icons=await count('.gm-icon');assert.ok(icons>=2);
  await page.keyboard.type('air');assert.ok(await page.evaluate(R+'.querySelectorAll(".gm-icon:not([hidden])").length')<icons,'search filters');
  await page.keyboard.press('q');assert.equal(await count('.gm-spawn'),1,'Q typed in the search box stays in the search box');await page.keyboard.press('Backspace');
  await page.evaluate(R+'.querySelector(".gm-icon:not([hidden])").click()');assert.equal((await page.evaluate(()=>window.__played)).length,2);
  await page.keyboard.press('Escape');assert.equal(await count('.gm-spawn'),0);

  // Ricochet: Press start shows while Tyler is paused.
  await setTheme('ricochet');await page.evaluate(()=>TylerCompanion.setActivity('PAUSED — Off — paused'));await page.waitForTimeout(100);
  assert.equal(await page.evaluate(R+'.querySelector(".rc-score").dataset.attract'),'true');
  assert.equal(await page.evaluate('getComputedStyle('+R+'.querySelector(".rc-start")).display'),'inline-block');

  // Day of Defeat: Z opens the radio commands; 3 sends "Sound off!" (the voice check) as a radio line.
  await setTheme('dod');await page.evaluate(()=>TylerCompanion.setActivity('LISTENING — speak normally, then pause'));await over();await page.keyboard.press('z');
  assert.equal(await count('.dod-menu'),1);await fits('.dod-menu',true);await page.keyboard.press('3');
  assert.equal(await count('.dod-menu'),0);assert.match(await text('.dod-line'),/Sound off!/);
  await click('.dod-chip');assert.equal(await count('.dod-obj li'),4);await page.keyboard.press('Escape');assert.equal(await count('.dod-brief'),0);
  assert.deepEqual(errors,[]);
 }finally{await browser.close();server.close();}
});

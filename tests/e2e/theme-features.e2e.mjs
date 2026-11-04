// End-to-end (v2.20): every theme mounts its own 2–3 features in the real panel, only the current
// theme's features exist, switching themes swaps them, and the interactive ones reach the real
// panel controls (tabs, menus, console). Preview page with the real content scripts and a mocked
// extension runtime in headless Chromium (no Steam).
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
const THEMES=['steam','classic','tf2','cs2','portal','cs16','hev','l4d','winxp','doom','quake','pipboy','combine','deadlock','minecraft','payday','dreamcast','gmod','ricochet','dod','rust','x360','ipod','msn','xmb'];

test('each theme has its own features, wired to the real panel',{timeout:180000},async()=>{
 const server=http.createServer((req,res)=>{const file=path.join(ROOT,decodeURIComponent(new URL(req.url,'http://x').pathname));if(!file.startsWith(ROOT)||!fs.existsSync(file)||fs.statSync(file).isDirectory()){res.writeHead(404);res.end();return;}res.writeHead(200,{'content-type':types[path.extname(file)]||'application/octet-stream'});fs.createReadStream(file).pipe(res);}).listen(0);
 const browser=await chromium.launch();
 try{
  const page=await browser.newPage({viewport:{width:1000,height:900}});const errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(/theme feature/.test(m.text()))errors.push(m.text());});
  await page.goto('http://127.0.0.1:'+server.address().port+'/tools/preview/panel.html?theme=steam');
  await page.waitForFunction(()=>window.__tylerReady===true&&window.TylerThemeFeatures);
  const setTheme=t=>page.evaluate(t=>{for(const fn of listeners)fn({type:'storage:changed',changes:{uiTheme:{newValue:t}}});},t);
  const R='document.getElementById("tyler-companion-root").shadowRoot';
  const tab=()=>page.evaluate(R+'.querySelector(".tabs [aria-selected=true]").dataset.tab');
  const seen=new Set();
  for(const theme of THEMES){
   await setTheme(theme);await page.waitForTimeout(80);
   const m=await page.evaluate(()=>TylerThemeFeatures.mounted());
   assert.ok(m.length>=2&&m.length<=4,theme+' has 2-4 features: '+m);
   for(const id of m){assert.ok(!seen.has(id),id+' belongs to one theme');seen.add(id);}
   // v2.28/2.29: every theme draws some of the panel's icons with its branded pack (tabs, status badge).
   // Switching themes swaps them.
   const bi=await page.evaluate(R2=>{const r=document.getElementById('tyler-companion-root').shadowRoot;return {tabs:r.querySelectorAll('.tabs .ic[data-b]').length,stale:[...r.querySelectorAll('.ic[data-b]')].filter(i=>!i.dataset.b.startsWith(r.querySelector('.panel').dataset.rtTheme+'/')).length,badge:!!r.querySelector('.tally-brand')};});
   assert.ok(bi.tabs>=1,theme+' tabs use its branded icons ('+bi.tabs+')');assert.equal(bi.stale,0,theme+': no icon left from another theme');
   assert.equal(bi.badge,!['msn','xmb'].includes(theme),theme+' status badge (Messenger and PS3 show presence their own way)');
   // Real state reaches the features: a thinking → reply → speaking turn never throws.
   await page.evaluate(async()=>{const C=TylerCompanion;C.setActivity('THINKING — preparing');await new Promise(r=>setTimeout(r,60));C.emit('reply',{chars:12});C.setActivity('SPEAKING — on air');C.emit('sound',{slot:1,name:'Beep'});C.emit('music',{title:'Song'});C.emit('chat',{recent:10,flood:true});C.setActivity('LISTENING — speak');C.showTab('room');C.showTab('conversation');});
  }
  assert.equal(seen.size>=45,true,'at least 45 distinct features ('+seen.size+')');
  const panelBox=await page.evaluate(R+'.querySelector(".panel").getBoundingClientRect().toJSON()');
  const over=()=>page.mouse.move(panelBox.x+panelBox.width/2,panelBox.y+panelBox.height/2);

  // TF2: number keys pick a "class" (tab) while the pointer is over the panel.
  await setTheme('tf2');await over();await page.keyboard.press('3');assert.equal(await tab(),'soundboard');await page.keyboard.press('1');assert.equal(await tab(),'conversation');
  // Switching theme removes the old theme's features.
  await setTheme('steam');assert.equal(await page.evaluate(R+'.querySelectorAll(".tf-feed,.tf-class").length'),0);assert.equal(await page.evaluate(R+'.querySelectorAll(".st-activity").length'),1);
  // Quake: the console runs real commands.
  await setTheme('quake');await page.evaluate(R+'.querySelector(".qk-chip").click()');
  await page.keyboard.type('tab room');await page.keyboard.press('Enter');assert.equal(await tab(),'room');
  await page.keyboard.type('status');await page.keyboard.press('Enter');assert.match(await page.evaluate(R+'.querySelector(".qk-out").textContent'),/health \d+%/);
  await page.keyboard.press('Escape');assert.equal(await page.evaluate(R+'.querySelectorAll(".qk-console").length'),0);
  // CS 1.6: radio menu item 4 runs the checks.
  await setTheme('cs16');await over();await page.keyboard.press('v');assert.equal(await page.evaluate(R+'.querySelectorAll(".c16-menu").length'),1);await page.keyboard.press('4');assert.equal(await tab(),'checks');
  // Windows XP: the Start menu reaches every tab.
  await setTheme('winxp');await page.evaluate(R+'.querySelector(".xp-start").click()');await page.evaluate(R+'.querySelector(".xp-mi:nth-child(3)").click()');assert.equal(await tab(),'soundboard');
  // Pip-Boy: category names and Q/E cycling; the original labels come back on another theme.
  await setTheme('pipboy');assert.equal(await page.evaluate(R+'.querySelector("#tab-conversation .tab-label").textContent'),'DATA');await page.evaluate(()=>TylerCompanion.showTab('setup'));await over();await page.keyboard.press('e');assert.equal(await tab(),'checks','E moves to the next category');await page.keyboard.press('q');assert.equal(await tab(),'setup');
  await setTheme('steam');assert.equal(await page.evaluate(R+'.querySelector("#tab-conversation .tab-label").textContent'),'Chat');
  // Day of Defeat: turning the radio knob changes channel (tab).
  await setTheme('dod');const before=await tab();await page.evaluate(R+'.querySelector(".dod-knob").click()');assert.notEqual(await tab(),before);
  // CS2: the sound wheel opens and closes.
  await setTheme('cs2');await page.evaluate(R+'.querySelector(".cs-buy").click()');assert.equal(await page.evaluate(R+'.querySelectorAll(".cs-wheel").length'),1);await over();await page.keyboard.press('Escape');assert.equal(await page.evaluate(R+'.querySelectorAll(".cs-wheel").length'),0);
  // Dreamcast: the VMU screen shows Tyler's state when collapsed.
  await setTheme('dreamcast');await page.evaluate(R+'.getElementById("collapse").click()');await page.waitForTimeout(100);
  assert.equal(await page.evaluate(R+'.querySelector(".dc-lcd").getBoundingClientRect().height>0'),true);
  await page.evaluate(R+'.getElementById("collapse").click()');
  // Typing in the panel's own fields never triggers theme keys.
  await setTheme('tf2');await page.evaluate(()=>TylerCompanion.showTab('conversation'));await page.evaluate(R+'.getElementById("command").closest("details").open=true');await page.evaluate(R+'.getElementById("command").focus()');await page.keyboard.type('5');assert.equal(await page.evaluate(R+'.getElementById("command").value'),'5');assert.equal(await tab(),'conversation');
  assert.deepEqual(errors,[]);
 }finally{await browser.close();server.close();}
});

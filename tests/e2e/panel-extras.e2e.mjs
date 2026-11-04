// End-to-end (v2.20.1): the "Last reply" HUD follows automatic replies, Full check sums up every
// part with a copyable report, lifetime theme stats survive a reload (and stop when turned off),
// and the new theme overlays (Combine terminal, Ricochet high scores, Dreamcast memory card) open
// below the tabs, inside the panel, and close again. Preview page with the real content scripts and
// a mocked extension runtime in headless Chromium: no Steam, no AI provider, no Windows audio.
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

test('HUD, full check, lifetime stats and theme overlays',{timeout:180000},async()=>{
 const server=http.createServer((req,res)=>{const file=path.join(ROOT,decodeURIComponent(new URL(req.url,'http://x').pathname));if(!file.startsWith(ROOT)||!fs.existsSync(file)||fs.statSync(file).isDirectory()){res.writeHead(404);res.end();return;}res.writeHead(200,{'content-type':types[path.extname(file)]||'application/octet-stream'});fs.createReadStream(file).pipe(res);}).listen(0);
 const browser=await chromium.launch();
 try{
  const context=await browser.newContext({viewport:{width:1000,height:900}});
  const origin='http://127.0.0.1:'+server.address().port;
  await context.grantPermissions(['clipboard-read','clipboard-write'],{origin});
  const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(/theme feature/.test(m.text()))errors.push(m.text());});
  const ready=()=>page.waitForFunction(()=>window.__tylerReady===true&&window.TylerThemeFeatures&&TylerThemeFeatures.life());
  await page.goto(origin+'/tools/preview/panel.html?theme=steam');await ready();
  const R='document.getElementById("tyler-companion-root").shadowRoot';
  const q=s=>page.evaluate(R+'.querySelector('+JSON.stringify(s)+')?.textContent??null');
  const count=s=>page.evaluate(R+'.querySelectorAll('+JSON.stringify(s)+').length');
  const setTheme=t=>page.evaluate(t=>{for(const fn of listeners)fn({type:'storage:changed',changes:{uiTheme:{newValue:t}}});},t);

  // 1. Automatic replies update "Last reply" (before, only manual commands did).
  await page.evaluate(()=>TylerCompanion.reportTurn({ms:1840,spoken:true}));
  assert.match(await q('#hudLatency'),/1\.8/);assert.match(await q('#hudLatencyMeta'),/Voice reply · automatic/);
  await page.evaluate(()=>TylerCompanion.reportTurn({ms:920,live:true}));
  assert.match(await q('#hudLatencyMeta'),/Gemini Live/);

  // 2. Full check: a summary first, one row per part, and a report to copy (mocked AI answers).
  await page.evaluate(()=>{handlers.command=m=>/^ask /.test(m.text)?{text:'Yes, I can respond.'}:{};});
  await page.evaluate(()=>TylerCompanion.showTab('checks'));
  await page.evaluate(R+'.getElementById("diagnose").click()');
  await page.waitForFunction(R=>!eval(R).getElementById('copyReport').hidden,R,{timeout:15000});
  const summary=await page.evaluate(R+'.querySelector("#diagnostics li.check-summary").dataset.result');
  assert.equal(summary,'fail','the preview has no Steam voice, so the microphone row fails');
  assert.match(await q('#diagnostics li.check-summary b'),/problems? found/);
  assert.ok(await count('#diagnostics li')>=8,'one row per part');
  assert.match(await q('#diagnostics'),/AI answered in/);
  await page.evaluate(R+'.getElementById("copyReport").click()');
  const report=await page.evaluate(()=>navigator.clipboard.readText());
  assert.match(report,/^ROBOTIC TYLER full check/);assert.match(report,/problems? found/);assert.match(report,/AI answered in/);
  assert.doesNotMatch(report,/sk-|AIza|Bearer/,'no keys in the report');

  // 3. Lifetime stats: counts survive a reload; a new session is counted; Steam achievements stay.
  await page.evaluate(()=>{const C=TylerCompanion;C.setActivity('THINKING — preparing');C.emit('reply',{chars:20});C.setActivity('SPEAKING — on air');C.emit('sound',{slot:1,name:'Beep'});C.setActivity('LISTENING — speak');});
  await page.waitForTimeout(150);
  const first=await page.evaluate(()=>({...TylerThemeFeatures.life()}));
  assert.ok(first.replies+first.spoken>=1&&first.sounds>=1&&first.sessions===1,JSON.stringify(first));
  assert.ok(first.ach.includes('st:ice'),'the first-reply achievement unlocked');
  await page.evaluate(()=>dispatchEvent(new Event('pagehide')));await page.waitForTimeout(100);
  await page.reload();await ready();
  const second=await page.evaluate(()=>({...TylerThemeFeatures.life()}));
  assert.equal(second.sessions,2);assert.equal(second.replies+second.spoken,first.replies+first.spoken);assert.ok(second.ach.includes('st:ice'));
  // Turned off in Settings: nothing more is kept; turned on again it picks up where it was.
  await page.evaluate(()=>{for(const fn of listeners)fn({type:'storage:changed',changes:{themeStats:{newValue:false}}});});
  assert.equal(await page.evaluate(()=>TylerThemeFeatures.life()),null);
  // Reset theme stats (Settings) clears the saved record.
  await page.evaluate(()=>{for(const fn of listeners)fn({type:'storage:changed',changes:{themeStats:{newValue:true}}});});
  await page.waitForFunction(()=>TylerThemeFeatures.life());
  await page.evaluate(()=>{for(const fn of listeners)fn({type:'storage:changed',changes:{tylerLifetime:{oldValue:{v:1}}}});});
  assert.equal(await page.evaluate(()=>TylerThemeFeatures.life().replies),0);

  // 4. Theme overlays open below the tabs, inside the panel, and close.
  const panel=await page.evaluate(R+'.querySelector(".panel").getBoundingClientRect().toJSON()');
  const over=()=>page.mouse.move(panel.x+panel.width/2,panel.y+panel.height/2);
  const inside=async sel=>{const r=await page.evaluate(([R,sel])=>{const root=eval(R),el=root.querySelector(sel),tabs=root.querySelector('.tabs').getBoundingClientRect(),b=el.getBoundingClientRect();return {top:b.top,bottom:b.bottom,left:b.left,right:b.right,tabs:tabs.bottom};},[R,sel]);
   assert.ok(r.top>=r.tabs&&r.left>=panel.x&&r.right<=panel.x+panel.width&&r.bottom<=panel.y+panel.height+1,sel+' fits the panel '+JSON.stringify(r));};
  await setTheme('combine');await page.waitForTimeout(80);
  await page.evaluate(R+'.querySelector(".cb-ticker>b").click()');assert.equal(await count('.cb-term'),1);await inside('.cb-term');
  assert.match(await q('.cb-term-facts'),/DEPLOYMENTS/);
  await page.evaluate(R+'.querySelector(".cb-term-close").click()');assert.equal(await count('.cb-term'),0);
  await over();await page.keyboard.press('t');assert.equal(await count('.cb-term'),1,'T opens the terminal');await page.keyboard.press('Escape');assert.equal(await count('.cb-term'),0);
  await setTheme('ricochet');await page.waitForTimeout(80);
  assert.match(await q('.rc-hi'),/HI/);
  await page.evaluate(R+'.querySelector(".rc-score").click()');assert.equal(await count('.rc-table'),1);await inside('.rc-table');
  assert.ok(await count('.rc-row')>=4);
  await page.evaluate(R+'.querySelector(".rc-close").click()');assert.equal(await count('.rc-table'),0);
  await setTheme('dreamcast');await page.waitForTimeout(300);
  await page.evaluate(R+'.querySelector(".dc-vmu").click()');assert.equal(await count('.dc-memory'),1);await inside('.dc-memory');
  assert.equal(await count('.dc-file'),6);assert.match(await q('.dc-free'),/blocks free/);
  await page.evaluate(R+'.querySelector(".dc-row button").click()');assert.equal(await count('.dc-memory'),0);
  // Switching theme removes an open overlay with its theme.
  await page.evaluate(R+'.querySelector(".dc-vmu").click()');await setTheme('steam');assert.equal(await count('.dc-memory,.cb-term,.rc-table'),0);
  await setTheme('payday');await page.waitForTimeout(80);assert.match(await q('.pd-timer small'),/#\d+/);
  assert.deepEqual(errors,[]);
 }finally{await browser.close();server.close();}
});

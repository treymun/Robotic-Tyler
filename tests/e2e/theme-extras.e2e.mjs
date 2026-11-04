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

  // v2.28: the branded icons appear in the original themes' extras and track Tyler's real state;
  // without ui-brand.js everything falls back to the theme's own drawings.
  await setTheme('portal');await page.evaluate(()=>TylerCompanion.setActivity('THINKING — preparing a typed reply…'));await page.waitForTimeout(80);
  const shown=()=>page.evaluate(R+'.querySelector(".tally-brand") && [...'+R+'.querySelectorAll(".tally-bi")].filter(e=>getComputedStyle(e).display!=="none").map(e=>e.dataset.for)');
  assert.deepEqual(await shown(),['thinking'],'the Aperture iris while Tyler thinks');
  await page.evaluate(()=>TylerCompanion.setActivity('OFF — Paused by you'));await page.waitForTimeout(80);assert.deepEqual(await shown(),['paused'],'the exit sign when paused');
  await page.evaluate(()=>TylerCompanion.setActivity('NEEDS ATTENTION — Gemini 429 failed · quota reached'));await page.waitForTimeout(80);assert.deepEqual(await shown(),[],'Portal has no error badge, so none shows');
  await setTheme('winxp');await page.evaluate(()=>TylerCompanion.setActivity('LISTENING — speak normally, then pause'));await click('.xp-start');
  assert.equal(await count('.xp-menu-list .xp-mi-bi'),5,'Start menu entries carry XP icons');assert.equal(await count('.xp-menu-places .xp-mi-bi'),4);assert.equal(await count('.xp-start .xp-flag'),1);await page.keyboard.press('Escape');
  await page.evaluate(()=>{window.__brand=globalThis.TylerBrand;delete globalThis.TylerBrand;});await setTheme('doom');await setTheme('winxp');
  assert.equal(await count('.xp-start .xp-flag'),0,'no pack: the drawn flag');assert.equal(await count('.xp-ti.voice'),1);await click('.xp-start');assert.equal(await count('.xp-menu .xp-mi'),6,'the Start menu still opens');await page.keyboard.press('Escape');
  await page.evaluate(()=>{globalThis.TylerBrand=window.__brand;});await setTheme('doom');
  // How much of a brand mark is drawn: the shapes of a branded icon (ui-brand.js, inline SVG).
  const ink=sel=>page.evaluate('(()=>{const e='+R+'.querySelector('+JSON.stringify(sel)+');return e&&e.matches("svg[data-bi]")?e.querySelectorAll("path,rect,circle,ellipse,polygon").length*100:0;})()');
  // v2.27 Rust: Q opens crafting; Craft runs the full check and queues it; the Tool Cupboard opens; 1 plays the first belt slot.
  await setTheme('rust');await page.evaluate(()=>{TylerCompanion.showTab('conversation');TylerCompanion.setActivity('LISTENING — speak normally, then pause');});await over();await page.keyboard.press('q');
  assert.equal(await count('.rs-craft-menu'),1);await fits('.rs-craft-menu');assert.equal(await count('.rs-bp'),6);
  await page.keyboard.press('Escape');assert.equal(await count('.rs-craft-menu'),0);
  await click('.rs-chip');await page.evaluate(R+'.querySelector(".rs-bp button").click()');assert.match(await tab(),/checks/i,'Craft · Full check runs the full check');assert.equal(await count('.rs-job'),1);
  await click('.rs-tc');assert.equal(await count('.rs-tc-menu'),1);await fits('.rs-tc-menu');await page.keyboard.press('Escape');
  await over();const before=(await page.evaluate(()=>window.__played)).length;await page.keyboard.press('1');assert.equal((await page.evaluate(()=>window.__played)).length,before+1,'belt slot 1 plays a clip');
  await page.evaluate(()=>TylerCompanion.setActivity('NEEDS ATTENTION — Gemini 429 failed · quota reached'));await page.waitForTimeout(100);assert.equal(await count('.rs-wound'),1);
  await page.evaluate(()=>TylerCompanion.setActivity('LISTENING — speak normally, then pause'));await page.waitForTimeout(100);assert.equal(await count('.rs-wound'),0);

  // Xbox 360: G opens the Guide, arrows move, an item runs; the gamer card opens the achievements; the ring counts Tyler.
  await setTheme('x360');await page.evaluate(()=>TylerCompanion.showTab('conversation'));await over();await page.keyboard.press('g');
  assert.equal(await count('.x-guide'),1);await fits('.x-guide');await page.keyboard.press('ArrowDown');assert.match(await focused(),/x-guide-item/);
  await page.keyboard.press('Escape');assert.equal(await count('.x-guide'),0);
  await click('.x-card');assert.equal(await count('.x-ach .x-ach-item'),10);await fits('.x-ach');await page.keyboard.press('Escape');
  assert.equal(await page.evaluate(R+'.getElementById("activityCard").dataset.ring'),'1');

  // iPod: M opens the iPod menu; Cover Flow lists the clips and Enter plays the one in front; the wheel's ⏭ steps the tab.
  await setTheme('ipod');await page.evaluate(()=>TylerCompanion.showTab('conversation'));await over();await page.keyboard.press('m');
  assert.equal(await count('.ip-screen .ip-row'),8);await fits('.ip-screen');
  await page.evaluate(R+'.querySelectorAll(".ip-screen .ip-row")[3].click()');assert.ok(await count('.ip-flow .ip-cover')>=2,'Cover Flow');
  const n=(await page.evaluate(()=>window.__played)).length;await page.keyboard.press('ArrowRight');await page.keyboard.press('Enter');assert.equal((await page.evaluate(()=>window.__played)).length,n+1,'Enter plays the clip in front');
  await page.keyboard.press('Escape');assert.equal(await count('.ip-screen'),0);
  // Starting Tyler turns the iPod on: the start-up screen with the Apple logo, then it goes.
  await page.evaluate(async()=>{TylerCompanion.setActivity('OFF — Paused by you');await new Promise(r=>setTimeout(r,60));TylerCompanion.setActivity('LISTENING — speak normally, then pause');});await page.waitForTimeout(200);
  assert.equal(await count('.ip-boot'),1);assert.ok(await ink('.ip-boot-apple')>50,'the Apple logo is drawn');await page.waitForTimeout(1600);assert.equal(await count('.ip-boot'),0);
  await click('.ip-next');assert.match(await tab(),/room/i,'⏭ goes to the next tab');await click('.ip-centre');assert.equal(await count('.ip-now'),1);await page.keyboard.press('Escape');

  // MSN Messenger: the display picture opens the status menu; Emoticons play clips; the contact list groups Tyler's parts.
  await setTheme('msn');await page.evaluate(()=>TylerCompanion.showTab('conversation'));
  await click('.msn-dp');assert.equal(await count('.fx-menu.msn-menu'),1);await fits('.msn-menu',true);await page.keyboard.press('Escape');assert.equal(await count('.fx-menu'),0);
  await click('.msn-tool:nth-child(2)');assert.ok(await count('.msn-emo .fx-menu-item')>=2);await fits('.msn-emo',true);
  assert.equal(await count('.msn-emo .fx-menu-mark-bi [data-bi^="msn/source-"]'),await count('.msn-emo .fx-menu-item'),'v2.30: Messenger\'s own emoticons (Pack 2)');const m=(await page.evaluate(()=>window.__played)).length;
  await page.evaluate(R+'.querySelector(".msn-emo .fx-menu-item").click()');assert.equal((await page.evaluate(()=>window.__played)).length,m+1);
  assert.equal(await count('.msn-contact'),4);assert.match(await text('.msn-presence'),/\(Online\)/);
  await page.evaluate(()=>TylerCompanion.setActivity('THINKING — preparing a typed reply…'));await page.waitForTimeout(80);assert.equal(await page.evaluate(R+'.querySelector(".msn-typing").hidden'),false);
  // The pop-ups carry the Messenger butterfly from the branded icon pack.
  await page.evaluate(()=>TylerCompanion.emit('music',{title:'One More Time',by:'Sam'}));await page.waitForTimeout(250);assert.ok(await ink('.msn-pop-bf')>50,'the butterfly is drawn');

  // PlayStation 3: O opens Options from the right; Information and Trophies open; → moves along the cross-media bar.
  await setTheme('xmb');await page.evaluate(()=>{TylerCompanion.showTab('conversation');TylerCompanion.setActivity('LISTENING — speak normally, then pause');});await over();await page.keyboard.press('o');
  assert.equal(await count('.xb-options .xb-opt-item'),7);await page.evaluate(R+'.querySelectorAll(".xb-opt-item")[3].click()');assert.equal(await count('.xb-info-list'),1);await fits('.xb-screen');await page.waitForTimeout(150);assert.ok(await ink('.xb-info-ps')>50,'Information shows the PlayStation logo');await page.keyboard.press('Escape');
  await page.evaluate(()=>TylerCompanion.panel?.dispatchEvent?.(new CustomEvent('tyler-fx')));
  await over();await page.keyboard.press('ArrowRight');assert.match(await tab(),/room/i,'→ moves to the next category');
  assert.deepEqual(errors,[]);
 }finally{await browser.close();server.close();}
});

// v2.30: DOOM's face takes damage with Tyler's health, like the game's status bar: clean from 80%,
// bloodier at 60, 40, 20 and under 20%, a red flash when he's hit (none with reduced motion), and
// the header logo shows the same. Preview page, mocked runtime; the health comes from the panel's
// real error tracking (errors are put in its log here, not caused by a real provider).
test('v2.30: DOOM face damage on the status bar and the header logo',{timeout:120000},async()=>{
 const server=http.createServer((req,res)=>{const file=path.join(ROOT,decodeURIComponent(new URL(req.url,'http://x').pathname));if(!file.startsWith(ROOT)||!fs.existsSync(file)||fs.statSync(file).isDirectory()){res.writeHead(404);res.end();return;}res.writeHead(200,{'content-type':types[path.extname(file)]||'application/octet-stream'});fs.createReadStream(file).pipe(res);}).listen(0);
 const browser=await chromium.launch();
 try{
  for(const reduced of [false,true]){
   const page=await browser.newPage({viewport:{width:1000,height:900},deviceScaleFactor:2,reducedMotion:reduced?'reduce':'no-preference'});const errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(/theme feature/.test(m.text()))errors.push(m.text());});
   await page.goto('http://127.0.0.1:'+server.address().port+'/tools/preview/panel.html?theme=doom');
   await page.waitForFunction(()=>window.__tylerReady===true&&TylerThemeFeatures.mounted().includes('doom-face'));
   const look=()=>page.evaluate(()=>{const r=document.getElementById('tyler-companion-root').shadowRoot,f=r.querySelector('.doom-face'),o=r.querySelector('.mark .doom-pain'),c=f.querySelector('canvas');
    // Blood-red pixels on the face (not the eyepiece's brighter red): what the damage adds.
    const red=cv=>{const d=cv.getContext('2d').getImageData(0,0,cv.width,cv.height).data;let n=0;for(let i=0;i<d.length;i+=4)if(d[i+3]>200&&d[i]>70&&d[i]<220&&d[i+1]<30&&d[i+2]<40)n++;return n;};
    return {pain:f.dataset.pain,mood:f.dataset.mood,hits:Number(f.dataset.hits||0),flashes:Number(f.dataset.flashes||0),title:f.title,size:c.width,face:red(c),
     over:o?{hidden:o.hidden,pain:o.dataset.pain,size:o.width,css:Math.round(o.getBoundingClientRect().width),art:Math.round(r.querySelector('.mark-art').getBoundingClientRect().width),red:o.hidden?0:red(o)}:null};});
   const hurt=n=>page.evaluate(n=>{const S=TylerThemeFeatures.state(),t=Date.now();S.errorAt=Array.from({length:n},()=>t);TylerCompanion.setActivity('LISTENING — speak normally, then pause');},n);
   const settle=()=>page.waitForTimeout(700);
   await settle();let s=await look();
   assert.equal(s.pain,'0','healthy: a clean face');assert.equal(s.over.hidden,true,'and the header logo as drawn');assert.equal(s.size,104,'drawn at the screen\'s own pixels');assert.match(s.title,/100% health/);
   const clean=s.face,levels=[];
   for(const [n,want] of [[1,'1'],[2,'2'],[3,'4']]){await hurt(n);await settle();s=await look();levels.push(s);
    assert.equal(s.pain,want,n+' recent problems');assert.equal(s.over.hidden,false);assert.equal(s.over.pain,want,'the header logo matches');
    if(process.env.DOOM_SHOT_DIR&&!reduced)await page.screenshot({path:path.join(process.env.DOOM_SHOT_DIR,'doom-'+want+'.png'),clip:{x:0,y:0,width:1000,height:900}});
    assert.equal(s.over.css,s.over.art,'exactly over the logo');assert.equal(s.over.size,s.over.css*2,'at the screen\'s own pixels');}
   assert.ok(levels[0].face>clean&&levels[1].face>levels[0].face&&levels[2].face>levels[1].face,'bloodier at each level '+[clean,...levels.map(l=>l.face)]);
   // A new problem: the "ouch" face and two red flashes (none with reduced motion), then the damage.
   await hurt(0);await settle();const before=(await look()).hits;
   await page.evaluate(()=>TylerCompanion.setActivity('NEEDS ATTENTION — Gemini 429 failed · quota reached'));
   s=await look();assert.equal(s.hits,before+1,'hit');assert.equal(s.mood,'ouch');assert.equal(s.flashes>0,!reduced,reduced?'no flash with reduced motion':'a red flash');
   await page.waitForFunction(()=>document.getElementById('tyler-companion-root').shadowRoot.querySelector('.doom-face').dataset.mood==='hurt',null,{timeout:3000});
   s=await look();assert.equal(s.pain,'3','a problem holds him at 25%');
   // Back to normal with no recent problems: clean again; a reply lands: the evil grin.
   await hurt(0);await settle();s=await look();assert.equal(s.pain,'0');assert.equal(s.over.hidden,true);
   await page.evaluate(()=>TylerCompanion.emit('reply',{chars:42}));assert.equal((await look()).mood,'grin','a reply lands: the evil grin');
   assert.deepEqual(errors,[]);await page.close();
  }
 }finally{await browser.close();server.close();}
});

// v2.30: Pack 2's original artwork in the places chosen for it, the bitmaps at their own size.
// Preview page, mocked runtime (no Steam): what is drawn and how big, not how the games look.
test('v2.30: Pack 2 artwork in its places, bitmaps at their native size',{timeout:120000},async()=>{
 const server=http.createServer((req,res)=>{const file=path.join(ROOT,decodeURIComponent(new URL(req.url,'http://x').pathname));if(!file.startsWith(ROOT)||!fs.existsSync(file)||fs.statSync(file).isDirectory()){res.writeHead(404);res.end();return;}res.writeHead(200,{'content-type':types[path.extname(file)]||'application/octet-stream'});fs.createReadStream(file).pipe(res);}).listen(0);
 const browser=await chromium.launch();
 try{
  const page=await browser.newPage({viewport:{width:1000,height:900}});const errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(/theme feature/.test(m.text()))errors.push(m.text());});
  await page.goto('http://127.0.0.1:'+server.address().port+'/tools/preview/panel.html?theme=steam');
  await page.waitForFunction(()=>window.__tylerReady===true&&window.TylerThemeFeatures);
  const R='document.getElementById("tyler-companion-root").shadowRoot';
  const setTheme=async t=>{await page.evaluate(t=>{for(const fn of listeners)fn({type:'storage:changed',changes:{uiTheme:{newValue:t}}});},t);await page.waitForTimeout(150);};
  const q=(sel,fn='el=>!!el')=>page.evaluate(([R,sel,fn])=>{const r=eval(R);return eval(fn)(r.querySelector(sel));},[R,sel,fn]);
  const all=sel=>page.evaluate(([R,sel])=>[...eval(R).querySelectorAll(sel)].map(e=>e.dataset.bi+' '+Math.round(e.getBoundingClientRect().width)),[R,sel]);
  const tabIcons=()=>page.evaluate(R+'.querySelectorAll(".tabs svg.ic")').then(()=>page.evaluate('['+'...'+R+'.querySelectorAll(".tabs svg.ic")].map(i=>i.dataset.b||"")'));
  // PS3: the XMB's own category icons on the category row.
  await setTheme('xmb');assert.deepEqual(await tabIcons(),['friends','users','music','settings','network'].map(n=>'xmb/source-category-'+n));
  // CS2: the extracted message, settings and defuser icons on the tabs.
  await setTheme('cs2');const cs=await tabIcons();assert.equal(cs[0],'cs2/source-ui-message');assert.equal(cs[3],'cs2/source-ui-settings');assert.equal(cs[4],'cs2/source-equipment-defuser');
  // TF2: the class emblem on the class caption.
  await setTheme('tf2');await page.evaluate(R+'.getElementById("tab-room").click()');await page.waitForTimeout(100);
  assert.deepEqual((await all('.tf-class [data-bi]')).map(x=>x.split(' ')[0]),['tf2/source-class-engineer'],'(it pops in, so no size)');await page.evaluate(R+'.getElementById("tab-conversation").click()');
  // Windows XP: shell32's 24 x 24 icons in the Start menu, at 24 px.
  await setTheme('winxp');await page.evaluate(R+'.querySelector(".xp-start").click()');
  const xp=await all('.xp-menu [data-bi^="winxp/source-"]');assert.equal(xp.length,7,xp.join());assert.ok(xp.every(x=>x.endsWith(' 24')),xp.join());
  await page.keyboard.press('Escape');
  // GMod: Silk on the spawn menu's tools, at 16 px.
  await setTheme('gmod');await page.mouse.move(800,400);await page.keyboard.press('q');await page.waitForTimeout(100);
  const gm=await all('.gm-tool [data-bi^="gmod/source-silk"]');assert.equal(gm.length,5,gm.join());assert.ok(gm.every(x=>x.endsWith(' 16')));await page.keyboard.press('Escape');
  // Rust: the HUD's own symbols on the vitals, and Bleeding on a problem.
  await setTheme('rust');assert.equal((await all('.rs-bar [data-bi^="rust/source-ui"]')).length,3);
  await page.evaluate(()=>TylerCompanion.setActivity('NEEDS ATTENTION — Gemini 429 failed · quota reached'));await page.waitForTimeout(1200);
  assert.deepEqual((await all('.rs-effect:not([hidden]) [data-bi]')).map(x=>x.split(' ')[0]),['rust/source-ui-bleeding']);
  await page.evaluate(()=>TylerCompanion.setActivity('LISTENING — speak normally, then pause'));
  // Xbox 360: the Blades gamerscore glyph on the gamer card.
  await setTheme('x360');assert.deepEqual(await all('.x-card [data-bi]'),['x360/source-gscore 16']);
  // Deadlock: the health-regen symbol on the shop's Full check.
  await setTheme('deadlock');await page.evaluate(R+'.querySelector(".dl-plate .dl-left").click()');await page.waitForTimeout(150);
  await page.evaluate('['+'...'+R+'.querySelectorAll("button")].find(b=>/^Vitality/.test(b.textContent.trim())).click()');
  assert.ok((await all('[data-bi^="deadlock/source-"]')).some(x=>x.startsWith('deadlock/source-health-regen-icon')));
  // A theme without Pack 2 artwork has none.
  await page.keyboard.press('Escape');await setTheme('steam');assert.equal((await all('[data-bi*="/source-"]')).length,0);
  assert.deepEqual(errors,[]);
 }finally{await browser.close();server.close();}
});

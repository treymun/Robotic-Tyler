// End-to-end: the in-chat panel and its Ctrl+Shift+H card follow Settings → Theme
// live (Classic Steam 2004 ↔ Steam), using the preview page that runs the real
// content scripts against a mocked extension runtime. Real Chromium.
import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const {chromium}=require('playwright');
const ROOT=path.resolve(import.meta.dirname,'../..');
const types={'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.json':'application/json','.svg':'image/svg+xml','.png':'image/png'};

test('the panel switches between all fifteen themes live, each with its own status strip',async()=>{
 const server=http.createServer((req,res)=>{const file=path.join(ROOT,decodeURIComponent(new URL(req.url,'http://x').pathname));if(!file.startsWith(ROOT)||!fs.existsSync(file)||fs.statSync(file).isDirectory()){res.writeHead(404);res.end();return;}res.writeHead(200,{'content-type':types[path.extname(file)]||'application/octet-stream'});fs.createReadStream(file).pipe(res);}).listen(0);
 const browser=await chromium.launch();
 try{
  const page=await browser.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('http://127.0.0.1:'+server.address().port+'/tools/preview/panel.html?theme=classic');
  await page.waitForFunction(()=>window.__tylerReady===true);
  const look=()=>page.evaluate(()=>{const r=document.getElementById('tyler-companion-root').shadowRoot,p=r.querySelector('.panel'),tab=r.querySelector('.tabs button[aria-selected=true]'),s=getComputedStyle(p);
   return {theme:p.dataset.rtTheme,bg:s.backgroundColor,radius:s.borderTopLeftRadius,font:s.fontFamily.split(',')[0],tab:getComputedStyle(tab).color,logo:!!r.querySelector('.mark svg path[fill="#c8423c"]')};});
  await page.waitForFunction(()=>document.getElementById('tyler-companion-root').shadowRoot.querySelector('.panel').dataset.rtTheme==='classic');
  let l=await look();
  assert.deepEqual(l,{theme:'classic',bg:'rgb(62, 70, 55)',radius:'0px',font:'Tahoma',tab:'rgb(220, 205, 120)',logo:true});
  // Settings → Theme → Steam reaches the open panel without a reload.
  await page.evaluate(()=>{for(const fn of listeners)fn({type:'storage:changed',changes:{uiTheme:{oldValue:'classic',newValue:'steam'}}});});
  l=await look();assert.equal(l.theme,'steam');assert.equal(l.bg,'rgb(27, 40, 56)');assert.equal(l.radius,'4px');assert.equal(l.logo,true);
  // Every theme applies live; each brings its own canvas colour.
  const canvas={steam:'#1b2838',classic:'#3e4637',tf2:'#2e2b2a',cs2:'#14202b',portal:'#eceff1',cs16:'#100f0c',hev:'#15120b',l4d:'#111111',winxp:'#ece9d8',doom:'#140a08',quake:'#17120e',pipboy:'#041208',combine:'#15191c',deadlock:'#141112',minecraft:'#c6c6c6',payday:'#0c1117',dreamcast:'#f3f1ec',gmod:'#e2e5e8',ricochet:'#070a14',dod:'#353a1f'};
  for(const [theme,bg] of Object.entries(canvas)){
   await page.evaluate(t=>{for(const fn of listeners)fn({type:'storage:changed',changes:{uiTheme:{newValue:t}}});},theme);
   const got=await page.evaluate(()=>{const p=document.getElementById('tyler-companion-root').shadowRoot.querySelector('.panel');return {theme:p.dataset.rtTheme,bg:getComputedStyle(p).getPropertyValue('--rt-bg').trim()};});
   assert.deepEqual(got,{theme,bg},theme);
  }
  // Each game theme brings its own font, loaded into the page for the shadow root to use.
  for(const [theme,family] of [['tf2','Tyler TF2 Display'],['cs2','Tyler CS2'],['portal','Tyler Portal'],['quake','Tyler Quake'],['pipboy','Tyler Pip-Boy'],['combine','Tyler Combine'],['deadlock','Tyler Deadlock'],['minecraft','Tyler Minecraft'],['payday','Tyler PAYDAY'],['dreamcast','Tyler Dreamcast'],['gmod','Tyler GMod'],['ricochet','Tyler Ricochet'],['dod','Tyler DoD']]){
   await page.evaluate(t=>{for(const fn of listeners)fn({type:'storage:changed',changes:{uiTheme:{newValue:t}}});},theme);
   await page.evaluate(()=>document.fonts.ready);
   const font=await page.evaluate(f=>({loaded:document.fonts.check('16px "'+f+'"'),used:getComputedStyle(document.getElementById('tyler-companion-root').shadowRoot.querySelector('.tabs button')).fontFamily}),family);
   assert.equal(font.loaded,true,family+' loaded');assert.match(font.used,new RegExp('^"?'+family),theme+' tabs use '+family);
  }
  // Each theme draws its own status strip: TF2's ÜberCharge meter charges while
  // Tyler thinks, L4D's heart monitor scrolls while it listens, the DOOM strip
  // burns while it talks, and Steam's avatar frame takes the presence colour.
  const strip=(theme,state)=>page.evaluate(([t,s])=>{for(const fn of listeners)fn({type:'storage:changed',changes:{uiTheme:{newValue:t}}});TylerCompanion.setActivity(s);
   const r=document.getElementById('tyler-companion-root').shadowRoot,c=r.querySelector('.tally'),after=getComputedStyle(c,'::after'),trace=r.querySelector('.tally-trace');
   return {state:c.dataset.state,after:after.animationName,trace:getComputedStyle(trace).display,scroll:getComputedStyle(trace.querySelector('svg')).animationName,light:getComputedStyle(r.querySelector('.tally-light')).width};},[theme,state]);
  let s=await strip('tf2','THINKING — preparing a typed reply…');assert.equal(s.state,'thinking');assert.match(s.after,/tf-charge/);assert.equal(s.trace,'none');
  s=await strip('l4d','LISTENING — speak normally, then pause');assert.equal(s.trace,'block');assert.equal(s.scroll,'l4d-scroll');
  s=await strip('doom','SPEAKING — say “stop” to interrupt');assert.equal(s.state,'speaking');assert.equal(s.after,'doom-fire');
  s=await strip('steam','Ready');assert.equal(s.light,'34px');assert.equal(s.trace,'none');
  // An unknown value falls back to the default look.
  await page.evaluate(()=>{for(const fn of listeners)fn({type:'storage:changed',changes:{uiTheme:{newValue:'nope'}}});});
  assert.equal((await look()).theme,'steam');
  // The command card opened afterwards uses the current theme, and follows later changes.
  await page.evaluate(()=>{for(const fn of listeners)fn({type:'storage:changed',changes:{uiTheme:{newValue:'classic'}}});});
  await page.keyboard.press('Control+Shift+H');
  const card=()=>page.evaluate(()=>document.getElementById('tyler-v22-help')?.shadowRoot.querySelector('.panel').dataset.rtTheme);
  assert.equal(await card(),'classic');
  await page.evaluate(()=>{for(const fn of listeners)fn({type:'storage:changed',changes:{uiTheme:{newValue:'steam'}}});});
  assert.equal(await card(),'steam');
  assert.deepEqual(errors,[]);
 }finally{await browser.close();server.close();}
});

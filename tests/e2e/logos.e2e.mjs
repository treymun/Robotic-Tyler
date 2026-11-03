// End-to-end (v2.13): every theme shows its own Tyler logo in the in-chat panel,
// the settings page and the Voice Studio, and switching theme swaps it live.
// The panel page is served with "img-src 'none'" to stand in for a strict Steam
// page policy: the panel logo must still draw (it decodes embedded bytes, no request).
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

function serve(){
 return http.createServer((req,res)=>{
  const url=new URL(req.url,'http://x'),file=path.join(ROOT,decodeURIComponent(url.pathname));
  if(!file.startsWith(ROOT)||!fs.existsSync(file)||fs.statSync(file).isDirectory()){res.writeHead(404);res.end();return;}
  const headers={'content-type':types[path.extname(file)]||'application/octet-stream'};
  if(url.pathname==='/tools/preview/panel.html')headers['content-security-policy']="img-src 'none'";
  res.writeHead(200,headers);fs.createReadStream(file).pipe(res);
 }).listen(0);
}

test('the panel logo follows the theme, even when the page blocks images',async()=>{
 const server=serve(),browser=await chromium.launch();
 try{
  const page=await browser.newPage({deviceScaleFactor:2});const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.addInitScript(()=>{window.__blocked=[];document.addEventListener('securitypolicyviolation',e=>window.__blocked.push(e.blockedURI));});
  await page.goto('http://127.0.0.1:'+server.address().port+'/tools/preview/panel.html?theme=steam');
  await page.waitForFunction(()=>window.__tylerReady===true);
  const R=`document.getElementById('tyler-companion-root').shadowRoot`;
  const prints=new Map();
  for(const theme of THEMES){
   await page.evaluate(t=>{for(const fn of listeners)fn({type:'storage:changed',changes:{uiTheme:{newValue:t}}});},theme);
   await page.waitForFunction(`${R}.querySelector('.mark').dataset.logo===${JSON.stringify(theme)}`,null,{timeout:5000});
   const shot=await page.evaluate(`(()=>{const m=${R}.querySelector('.mark'),c=m.querySelector('.mark-art'),g=c.getContext('2d'),d=g.getImageData(0,0,c.width,c.height).data;
    let ink=0,h=0;for(let i=0;i<d.length;i+=4){if(d[i+3]>40)ink++;h=(h*31+d[i]+d[i+1]*7+d[i+2]*13+d[i+3])>>>0;}
    return {ink:ink/(c.width*c.height),hash:h,css:Math.round(c.getBoundingClientRect().width),px:c.width,svg:getComputedStyle(m.querySelector('svg')).display,canvas:getComputedStyle(c).display};})()`);
   assert.ok(shot.ink>0.25,theme+' logo is drawn ('+shot.ink.toFixed(2)+' of the square covered)');
   assert.equal(shot.svg,'none',theme+': the vector fallback hides once the logo is drawn');
   assert.equal(shot.canvas,'block');
   assert.ok(shot.px>=shot.css*2-1,theme+': drawn at the screen\'s pixel density');
   prints.set(theme,shot.hash);
  }
  assert.equal(new Set(prints.values()).size,THEMES.length,'every theme has a different logo');
  // An unknown theme falls back to the Steam look and logo.
  await page.evaluate(()=>{for(const fn of listeners)fn({type:'storage:changed',changes:{uiTheme:{newValue:'nope'}}});});
  await page.waitForFunction(`${R}.querySelector('.mark').dataset.logo==='steam'`);
  const blocked=await page.evaluate(()=>window.__blocked);
  assert.deepEqual(blocked.filter(u=>/logo|webp|data:image/.test(u)),[],'the logo never needs an image request');
  assert.deepEqual(errors,[]);
 }finally{await browser.close();server.close();}
});

test('the settings page and the Voice Studio switch logos with the theme',async()=>{
 const server=serve(),browser=await chromium.launch();const base='http://127.0.0.1:'+server.address().port;
 const mock=theme=>{const store={uiTheme:theme};window.chrome={storage:{local:{get:async()=>({...store}),set:async v=>Object.assign(store,v),remove:async()=>{}}},tabs:{create:()=>{},query:async()=>[]}};
  window.tylerSettings={storage:{local:window.chrome.storage.local},tabs:{create:async()=>{}},verifyKey:async()=>true,activity:async()=>[]};
  window.tylerNative={devices:async()=>[],status:async()=>({ok:true}),openSettings:async()=>{},openSteam:async()=>{},theme:async()=>store.uiTheme};};
 try{
  const settings=await browser.newPage();const errors=[];settings.on('pageerror',e=>errors.push(e.message));
  await settings.addInitScript(mock,'steam');await settings.goto(base+'/browser-extension/settings.html#appearance');
  // v2.18: the file is the src; once laid out, ui-logos.js adds a srcset drawn at the exact displayed size.
  const logo=theme=>settings.evaluate(t=>new Promise(done=>{const i=document.querySelector('img.mark');const check=()=>{if(!i.complete||i.dataset.sharp!==t||!i.srcset)return setTimeout(check,30);
   const cs=getComputedStyle(i),box=i.clientWidth-parseFloat(cs.paddingLeft)-parseFloat(cs.paddingRight);
   done({src:i.getAttribute('src'),ok:i.naturalWidth>0&&Math.abs(i.naturalWidth-box)<=1&&i.srcset.startsWith('data:image/png'),pixel:cs.imageRendering});};check();}),theme);
  assert.deepEqual(await logo('steam'),{src:'ui/logos/steam.png',ok:true,pixel:'auto'});
  for(const theme of THEMES.slice(1)){
   await settings.click('.tg-card[data-theme='+theme+']');await settings.click('#tgApply');
   const got=await logo(theme);assert.equal(got.src,'ui/logos/'+theme+'.png');assert.equal(got.ok,true,theme+' logo loads at its displayed size');
   if(theme==='doom')assert.equal(got.pixel,'pixelated','the DOOM logo keeps its pixels sharp');
  }
  assert.deepEqual(errors,[]);
  const voice=await browser.newPage();voice.on('pageerror',e=>errors.push(e.message));
  await voice.addInitScript(mock,'hev');await voice.goto(base+'/voice-app/native.html');
  await voice.waitForFunction(()=>document.getElementById('brand-logo')?.dataset.theme==='hev');
  assert.equal(await voice.evaluate(()=>new Promise(done=>{const i=document.getElementById('brand-logo');const c=()=>i.complete&&i.dataset.sharp==='hev'?done(i.getAttribute('src')+' '+(i.naturalWidth>0&&i.srcset.startsWith('data:image/png'))):setTimeout(c,30);c();})),'logos/hev.png true');
  assert.deepEqual(errors,[]);
 }finally{await browser.close();server.close();}
});

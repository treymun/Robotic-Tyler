// End-to-end (v2.25): the phone remote.
//  1. The page on a phone-sized Chromium (iPhone emulation): pairing with the code, Tyler's status in
//     his theme, and the buttons reaching the desktop app's server (app/remote.cjs, real HTTP here),
//     with a stand-in for the Steam window.
//  2. The Steam window's side (remote-control.js) in the panel preview as the desktop app: status
//     and actions through the panel's own controls.
// Not tested: a real phone on Wi-Fi, Windows' firewall, the real Steam page.
import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const {chromium,devices}=require('playwright');
const {setupRemote}=require('../../app/remote.cjs');
const {memoryStorage}=require('../../app/vault.cjs');
const ROOT=path.resolve(import.meta.dirname,'../..');
const types={'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.json':'application/json','.svg':'image/svg+xml','.png':'image/png','.webp':'image/webp','.woff2':'font/woff2'};

test('phone remote page: pair, see Tyler, press buttons (iPhone-sized Chromium, local server)',{timeout:120000},async()=>{
 const asked=[];let state={ready:true,state:'listening',label:'Listening',text:'Speak normally, then pause',theme:'payday',paused:false,voice:{armed:true,inCall:true,peers:3},replies:12,spend:'$0.0314',
  music:{title:'One More Time',by:'Sam',sharing:true},sounds:[{slot:2,name:'Airhorn',fav:true},{slot:1,name:'Beep',fav:false}]};
 const remote=setupRemote({vault:memoryStorage(),ask:async(action,args)=>{asked.push([action,args]);if(action==='state')return state;if(action==='pause')state={...state,state:'paused',label:'Paused',paused:true};if(action==='say'&&/fail/.test(args.text))throw Error('The selected message box contains a draft.');return {};},
  pageDir:path.join(ROOT,'app','remote'),uiDir:path.join(ROOT,'app','companion','ui'),version:'2.25.0'});
 const browser=await chromium.launch();
 try{
  const s=await remote.handle('enable'),base='http://127.0.0.1:'+s.port;
  const ctx=await browser.newContext({...devices['iPhone 14']});const page=await ctx.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
  // A wrong code first, then the right one from the QR link (?code=…).
  await page.goto(base+'/');await page.waitForSelector('#pair:not([hidden])');
  await page.fill('#code','999999'===s.code?'111111':'999999');await page.click('#pairForm button');await page.waitForFunction(()=>/right|expired/.test(document.getElementById('pairMsg').textContent));
  await page.goto(base+'/?code='+s.code);await page.waitForSelector('#remote:not([hidden])');
  assert.equal(await page.evaluate(()=>location.search),'','the code leaves the address bar');
  assert.equal(await page.evaluate(()=>document.documentElement.dataset.rtTheme),'payday','Tyler\'s theme');
  assert.match(await page.textContent('#stateLabel'),/Listening/);assert.match(await page.textContent('#voice'),/3 in call/);assert.match(await page.textContent('#nowPlaying'),/One More Time/);
  assert.equal(await page.locator('.rr-sound').count(),2);assert.match(await page.locator('.rr-sound').first().textContent(),/★ Airhorn/);
  const fits=await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth);assert.ok(fits,'no sideways scrolling on a phone');
  await page.screenshot({path:path.join(process.env.REMOTE_SHOT_DIR||'/tmp','remote-phone.png')}).catch(()=>{});
  // Buttons.
  await page.locator('.rr-sound').first().click();await page.waitForFunction(()=>!document.getElementById('toast').hidden);
  assert.deepEqual(asked.filter(a=>a[0]!=='state').at(-1),['sound',{slot:2}]);
  await page.fill('#query','daft punk');await page.click('#musicForm button');await page.waitForTimeout(300);assert.deepEqual(asked.filter(a=>a[0]!=='state').at(-1),['music-play',{query:'daft punk'}]);
  await page.fill('#say','hello squad');await page.click('#sayForm button');await page.waitForTimeout(300);assert.deepEqual(asked.filter(a=>a[0]!=='state').at(-1),['say',{text:'hello squad'}]);
  assert.equal(await page.inputValue('#say'),'','sent text clears');
  await page.fill('#say','please fail');await page.click('#sayForm button');await page.waitForFunction(()=>document.getElementById('toast').dataset.bad==='true');
  assert.match(await page.textContent('#toast'),/draft/);assert.equal(await page.inputValue('#say'),'please fail','a message that failed stays to try again');
  await page.click('#toggle');await page.waitForFunction(()=>document.getElementById('toggle').textContent==='Connect & start');
  // Unpair: back to the code screen, and the old cookie is gone.
  await page.click('#forget');await page.waitForSelector('#pair:not([hidden])');
  assert.equal((await remote.handle('status')).devices.length,0);
  assert.deepEqual(errors,[]);
 }finally{await browser.close();await remote.stop();}
});

test('Steam window side: status and actions through the panel\'s controls (panel preview as the desktop app)',{timeout:120000},async()=>{
 const server=http.createServer((req,res)=>{const file=path.join(ROOT,decodeURIComponent(new URL(req.url,'http://x').pathname));if(!file.startsWith(ROOT)||!fs.existsSync(file)||fs.statSync(file).isDirectory()){res.writeHead(404);res.end();return;}res.writeHead(200,{'content-type':types[path.extname(file)]||'application/octet-stream'});fs.createReadStream(file).pipe(res);}).listen(0);
 const browser=await chromium.launch();
 try{
  const page=await browser.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('http://127.0.0.1:'+server.address().port+'/tools/preview/panel.html?theme=steam&platform=desktop-voice');
  await page.waitForFunction(()=>window.__tylerReady===true&&window.TylerRemote);
  await page.evaluate(()=>{window.__results=[];handlers['remote:result']=m=>{window.__results.push(m);return {};};window.__played=[];TylerCompanion.playSound=slot=>window.__played.push(slot);});
  const ask=(action,args={})=>page.evaluate(async([action,args])=>{const id='t'+Math.random().toString(36).slice(2);for(const fn of listeners)fn({type:'remote:action',id,action,args});for(let i=0;i<50;i++){const r=window.__results.find(x=>x.id===id);if(r)return r;await new Promise(x=>setTimeout(x,20));}return null;},[action,args]);
  const st=await ask('state');
  assert.equal(st.ok,true);assert.ok(st.data.sounds.length>=2,'the soundboard');assert.equal(st.data.sounds[0].fav,true,'favourites first');
  assert.ok(['state','label','text','voice','music','replies','theme'].every(k=>k in st.data));
  assert.equal(JSON.stringify(st.data).includes('sk-'),false);
  assert.equal((await ask('sound',{slot:st.data.sounds[0].slot})).ok,true);assert.deepEqual(await page.evaluate(()=>window.__played),[st.data.sounds[0].slot]);
  assert.match((await ask('sound',{slot:999})).error,/isn.t on the soundboard/);
  assert.match((await ask('music-play',{query:'daft punk'})).error,/Start the Music DJ/,'music needs the DJ running on the PC');
  assert.equal((await ask('pause')).ok,true);
  assert.match((await ask('nope')).error,/Unknown action/);
  assert.deepEqual(errors,[]);
 }finally{await browser.close();server.close();}
});

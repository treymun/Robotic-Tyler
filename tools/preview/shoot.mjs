#!/usr/bin/env node
// Renders the panel, settings page and voice dashboard in headless Chromium and
// writes PNGs to tools/preview/out/. Usage: node tools/preview/shoot.mjs [outDir]
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const {chromium}=require('playwright');

const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const OUT=path.resolve(process.argv[2]||path.join(ROOT,'tools/preview/out'));
fs.mkdirSync(OUT,{recursive:true});
const types={'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.png':'image/png','.json':'application/json','.svg':'image/svg+xml'};
const server=http.createServer((req,res)=>{
 const url=new URL(req.url,'http://x');const file=path.join(ROOT,decodeURIComponent(url.pathname));
 if(!file.startsWith(ROOT)||!fs.existsSync(file)||fs.statSync(file).isDirectory()){res.writeHead(404);res.end();return;}
 res.writeHead(200,{'content-type':types[path.extname(file)]||'application/octet-stream'});fs.createReadStream(file).pipe(res);
}).listen(0);
const base='http://127.0.0.1:'+server.address().port;
const browser=await chromium.launch();
const errors=[];

async function panelPage(platform='chrome',theme='steam'){
 const page=await browser.newPage({viewport:{width:1280,height:860},deviceScaleFactor:2});
 page.on('pageerror',e=>errors.push(platform+' pageerror: '+e.message));
 page.on('console',m=>{if(m.type()==='error')errors.push(platform+' console: '+m.text());});
 await page.goto(base+'/tools/preview/panel.html?platform='+platform+'&theme='+theme);
 await page.waitForFunction(()=>window.__tylerReady===true);
 await page.waitForTimeout(400);await page.evaluate(()=>document.fonts.ready);
 return page;
}
const shadow=fn=>`(()=>{const r=document.getElementById('tyler-companion-root').shadowRoot;${fn}})()`;
async function shotPanel(page,name){
 const box=await page.evaluate(shadow(`const b=r.querySelector('.panel').getBoundingClientRect();return {x:b.x-12,y:b.y-12,width:b.width+24,height:b.height+24};`));
 await page.screenshot({path:path.join(OUT,name+'.png'),clip:box});
}

const page=await panelPage('chrome');
await page.screenshot({path:path.join(OUT,'panel-in-steam.png')});
for(const [tab,state] of [['conversation','LISTENING — speak normally, then pause'],['room','THINKING — preparing a typed reply…'],['soundboard','SPEAKING — say “stop” or “hold on” to interrupt'],['setup','Ready — use Connect & start.'],['checks','Could not claim this tab: network error']]){
 await page.evaluate(([t,s])=>{TylerCompanion.showTab(t);TylerCompanion.setActivity(s);},[tab,state]);
 await page.waitForTimeout(250);
 await shotPanel(page,'panel-'+tab);
}
// Expanded feature groups in the Room tab.
await page.evaluate(shadow(`TylerCompanion.showTab('room');const d=[...r.querySelectorAll('#featureMount > details')];d.forEach((x,i)=>x.open=i===0);`));
await page.waitForTimeout(200);await shotPanel(page,'panel-room-open');
await page.evaluate(shadow(`r.querySelector('.scroll').scrollTop=0;TylerCompanion.showTab('conversation');for(const x of r.querySelectorAll('#automaticMount details'))x.open=true;`));
await page.waitForTimeout(200);await shotPanel(page,'panel-conversation-open');
await page.evaluate(shadow(`r.querySelector('#collapse').click();`));
await page.waitForTimeout(200);await shotPanel(page,'panel-mini');
await page.close();

const desk=await panelPage('desktop');
await desk.evaluate(()=>TylerCompanion.setActivity('TEXT — waiting for a new message'));
await shotPanel(desk,'panel-desktop');
await desk.close();

for(const [file,name,scheme] of [['/browser-extension/settings.html','settings','dark'],['/browser-extension/settings.html','settings-light','light'],['/app/companion/settings.html','settings-desktop','dark'],['/voice-app/native.html','voice-app','dark'],['/voice-app/native.html','voice-app-light','light']]){
 if(!fs.existsSync(path.join(ROOT,file)))continue;
 const p=await browser.newPage({viewport:{width:1280,height:900},deviceScaleFactor:2,colorScheme:scheme});
 p.on('pageerror',e=>errors.push(name+' pageerror: '+e.message));
 await p.addInitScript(theme=>{window.chrome={storage:{local:{get:async()=>({uiTheme:theme,usage:{requests:42,promptTokens:18234,completionTokens:5120,reportedCostUSD:0.0314,speechResponses:9}}),set:async()=>{},remove:async()=>{}}},tabs:{create:()=>{},query:async()=>[]}};window.tylerSettings={storage:{local:window.chrome.storage.local},tabs:{create:async()=>{}},verifyKey:async()=>true,activity:async()=>[]};window.tylerNative={devices:async()=>[{kind:'output',id:'a',name:'CABLE Input (VB-Audio Virtual Cable)'},{kind:'output',id:'b',name:'Speakers (Realtek Audio)'}],status:async()=>({ok:true}),openSettings:async()=>{},openSteam:async()=>{},theme:async()=>theme};},'steam');
 await p.goto(base+file);await p.waitForTimeout(500);
 await p.screenshot({path:path.join(OUT,name+'.png')});
 if(name.startsWith('voice-app')){await p.evaluate(()=>document.querySelector('[data-page=voice]').click());await p.waitForTimeout(150);await p.screenshot({path:path.join(OUT,name+'-voice.png')});}
 if(name==='settings')for(const zone of ['ai','voice','squad','games','advanced']){await p.evaluate(z=>{location.hash=z;},zone);await p.waitForTimeout(250);await p.screenshot({path:path.join(OUT,name+'-'+zone+'.png'),fullPage:true});}
 await p.close();
}
// Every extra theme: the main views of every surface (theme-<name>-*.png).
for(const theme of (process.env.THEMES?process.env.THEMES.split(","):["classic","tf2","cs2","portal","cs16","hev","l4d","winxp","doom"])){
 const page=await panelPage('chrome',theme);
 for(const [tab,state] of [['conversation','LISTENING — speak normally, then pause'],['room','THINKING — preparing a typed reply…'],['soundboard','SPEAKING — say “stop” or “hold on” to interrupt'],['setup','Ready — use Connect & start.'],['checks','Ready']]){
  await page.evaluate(([t,s])=>{TylerCompanion.showTab(t);TylerCompanion.setActivity(s);},[tab,state]);await page.waitForTimeout(250);await shotPanel(page,'theme-'+theme+'-panel-'+tab);
 }
 await page.evaluate(shadow(`TylerCompanion.showTab('room');const d=[...r.querySelectorAll('#featureMount > details')];d.forEach((x,i)=>x.open=i===0);`));
 await page.waitForTimeout(200);await shotPanel(page,'theme-'+theme+'-panel-room-open');
 await page.close();
 for(const [file,name] of [['/browser-extension/settings.html','theme-'+theme+'-settings'],['/voice-app/native.html','theme-'+theme+'-voice-app']]){
  const p=await browser.newPage({viewport:{width:1280,height:900},deviceScaleFactor:2});
  p.on('pageerror',e=>errors.push(name+' pageerror: '+e.message));
  await p.addInitScript(theme=>{window.chrome={storage:{local:{get:async()=>({uiTheme:theme,usage:{requests:42,promptTokens:18234,completionTokens:5120,reportedCostUSD:0.0314,speechResponses:9}}),set:async()=>{},remove:async()=>{}}},tabs:{create:()=>{},query:async()=>[]}};window.tylerSettings={storage:{local:window.chrome.storage.local},tabs:{create:async()=>{}},verifyKey:async()=>true,activity:async()=>[]};window.tylerNative={devices:async()=>[{kind:'output',id:'a',name:'CABLE Input (VB-Audio Virtual Cable)'},{kind:'output',id:'b',name:'Speakers (Realtek Audio)'}],status:async()=>({ok:true}),openSettings:async()=>{},openSteam:async()=>{},theme:async()=>theme};},theme);
  await p.goto(base+file);await p.waitForTimeout(500);await p.evaluate(()=>document.fonts.ready);await p.screenshot({path:path.join(OUT,name+'.png')});
  if(name.endsWith('-settings'))for(const zone of ['voice','squad']){await p.evaluate(z=>{location.hash=z;},zone);await p.waitForTimeout(250);await p.screenshot({path:path.join(OUT,name+'-'+zone+'.png'),fullPage:true});}
  if(name.endsWith('-voice-app')){await p.evaluate(()=>document.querySelector('[data-page=voice]').click());await p.waitForTimeout(150);await p.screenshot({path:path.join(OUT,name+'-voice.png')});}
  await p.close();
 }
}
await browser.close();server.close();
console.log('Screenshots written to '+OUT);
if(errors.length){console.log('Page errors:\n  '+[...new Set(errors)].join('\n  '));}

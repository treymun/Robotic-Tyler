// Renders the README artwork (tools/readme-art/*.html) to assets/readme/*.png with Playwright's Chromium.
//   node tools/readme-art/render.mjs [hero themes icons button features whatsnew]
// The artwork uses the app's own Steam theme (browser-extension/ui/tokens.css) and real screenshots of
// the panel: every <img data-panel="..."> is filled with the panel from tools/preview/panel.html
// ("hero": the Steam theme on air in the Sounds tab; "theme:<name>": the top of the panel in that theme).
import fs from 'node:fs';import http from 'node:http';import path from 'node:path';import {createRequire} from 'node:module';import {fileURLToPath} from 'node:url';
const HERE=path.dirname(fileURLToPath(import.meta.url)),ROOT=path.resolve(HERE,'..','..'),OUT=path.join(ROOT,'assets','readme');
const {chromium}=createRequire(path.join(ROOT,'package.json'))('playwright');
fs.mkdirSync(OUT,{recursive:true});
const SCALE={hero:1.25,themes:1.25,features:1.25,whatsnew:1.25,icons:2,button:2};
const only=process.argv.slice(2);
const jobs=fs.readdirSync(HERE).filter(f=>f.endsWith('.html')&&(!only.length||only.includes(f.slice(0,-5))));

const types={'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.png':'image/png','.webp':'image/webp','.json':'application/json','.svg':'image/svg+xml','.woff2':'font/woff2'};
const server=http.createServer((req,res)=>{
 const file=path.join(ROOT,decodeURIComponent(new URL(req.url,'http://x').pathname));
 if(!file.startsWith(ROOT)||!fs.existsSync(file)||fs.statSync(file).isDirectory()){res.writeHead(404);res.end();return;}
 res.writeHead(200,{'content-type':types[path.extname(file)]||'application/octet-stream'});fs.createReadStream(file).pipe(res);
}).listen(0);
const base='http://127.0.0.1:'+server.address().port;
const browser=await chromium.launch();

const SPEAKING='SPEAKING — say “stop” or “hold on” to interrupt';
// A real panel screenshot, from the top of the panel down `height` CSS pixels.
//   tab, state (status line), theme, platform (chrome, desktop-voice), open (a Room feature to
//   expand, by its title), scroll (CSS px to scroll the panel's content), to (an element id to scroll
//   to), height, scale.
async function panel({theme='steam',platform='chrome',tab='conversation',state=SPEAKING,open='',scroll=0,to='',height=420,scale=2}){
 const page=await browser.newPage({viewport:{width:1280,height:900},deviceScaleFactor:Number(scale)});
 await page.goto(base+'/tools/preview/panel.html?platform='+platform+'&theme='+theme);
 await page.waitForFunction(()=>window.__tylerReady===true);await page.evaluate(()=>document.fonts.ready);
 await page.evaluate(([t,s])=>{TylerCompanion.showTab(t);TylerCompanion.setActivity(s);},[tab,state]);
 if(open)await page.evaluate(name=>{const r=document.getElementById('tyler-companion-root').shadowRoot;for(const d of r.querySelectorAll('details.feature'))d.open=d.querySelector('.feature-title')?.textContent.trim()===name;},open);
 await page.waitForTimeout(350);
 if(scroll)await page.evaluate(y=>{document.getElementById('tyler-companion-root').shadowRoot.querySelector('.scroll').scrollTop=y;},Number(scroll));
 // to: scroll the panel's content so the element with this id is at the top (v2.26).
 if(to)await page.evaluate(id=>{const r=document.getElementById('tyler-companion-root').shadowRoot,sc=r.querySelector('.scroll'),el=r.getElementById(id);if(el)sc.scrollTop+=el.getBoundingClientRect().top-sc.getBoundingClientRect().top-10;},to);
 await page.waitForTimeout(150);
 const box=await page.evaluate(()=>{const b=document.getElementById('tyler-companion-root').shadowRoot.querySelector('.panel').getBoundingClientRect();return {x:b.x,y:b.y,width:b.width,height:b.height};});
 const png=await page.screenshot({clip:{x:box.x,y:box.y,width:box.width,height:Math.min(Number(height),box.height)},animations:'disabled'});
 await page.close();
 return 'data:image/png;base64,'+png.toString('base64');
}
// A real settings page screenshot: the given sheets (CSS selectors, comma separated) on the given
// page (zone), from the Chrome options page or the desktop app's settings window, in a window
// `width` CSS pixels wide.
async function settings({zone='overview',sheets='',desktop='',width=1280,scale=2,theme='steam'}){
 const page=await browser.newPage({viewport:{width:Number(width),height:1400},deviceScaleFactor:Number(scale)});
 await page.addInitScript(theme=>{window.chrome={storage:{local:{get:async()=>({uiTheme:theme,usage:{requests:42,promptTokens:18234,completionTokens:5120,reportedCostUSD:0.0314,speechResponses:9}}),set:async()=>{},remove:async()=>{}}},tabs:{create:()=>{},query:async()=>[]}};window.tylerSettings={storage:{local:window.chrome.storage.local},tabs:{create:async()=>{}},verifyKey:async()=>true,activity:async()=>[]};window.tylerNative={devices:async()=>[{kind:'output',id:'a',name:'CABLE Input (VB-Audio Virtual Cable)'},{kind:'output',id:'b',name:'Speakers (Realtek Audio)'}],status:async()=>({ok:true}),openSettings:async()=>{},openSteam:async()=>{},theme:async()=>theme};},theme);
 await page.goto(base+(desktop?'/app/companion/settings.html':'/browser-extension/settings.html')+'#'+zone);
 await page.waitForTimeout(600);await page.evaluate(()=>document.fonts.ready);
 const box=await page.evaluate(list=>{const els=list.split(',').map(s=>document.querySelector(s.trim())).filter(Boolean);if(!els.length)throw Error('no '+list);
  const r=els.map(e=>e.getBoundingClientRect());const x=Math.min(...r.map(b=>b.left)),y=Math.min(...r.map(b=>b.top));return {x,y,width:Math.max(...r.map(b=>b.right))-x,height:Math.max(...r.map(b=>b.bottom))-y};},sheets);
 const png=await page.screenshot({clip:box,animations:'disabled'});
 await page.close();
 return 'data:image/png;base64,'+png.toString('base64');
}
// The desktop app's whole Steam window (v2.26 README): the stand-in Steam chat with Tyler's panel
// docked beside it, as the desktop app shows it.
async function window_({theme='steam',state=SPEAKING,tab='conversation',width=1280,height=800,scale=1.5}){
 const page=await browser.newPage({viewport:{width:Number(width),height:Number(height)},deviceScaleFactor:Number(scale)});
 await page.goto(base+'/tools/preview/panel.html?platform=desktop-voice&theme='+theme);
 await page.waitForFunction(()=>window.__tylerReady===true);await page.evaluate(()=>document.fonts.ready);
 await page.evaluate(([t,s])=>{TylerCompanion.showTab(t);TylerCompanion.setActivity(s);},[tab,state]);
 await page.waitForTimeout(500);
 const png=await page.screenshot({animations:'disabled'});await page.close();
 return 'data:image/png;base64,'+png.toString('base64');
}
// The phone remote (v2.26 README): the real remote server (app/remote.cjs) and its page on a
// phone-sized screen, with the panel preview as Tyler's Steam window (sample data, as above).
async function remote({theme='steam',state=SPEAKING,tab='conversation',scale=2}){
 const {setupRemote}=createRequire(path.join(ROOT,'package.json'))('./app/remote.cjs'),{memoryStorage}=createRequire(path.join(ROOT,'package.json'))('./app/vault.cjs');
 const pc=await browser.newPage({viewport:{width:1280,height:900}});let srv=null;
 await pc.exposeFunction('__remoteEvent',m=>srv?.push(m.events));
 await pc.goto(base+'/tools/preview/panel.html?platform=desktop-voice&theme='+theme);await pc.waitForFunction(()=>window.__tylerReady===true&&window.TylerRemote);
 // Tyler running automatically in a call of three, as in the other screenshots' sample data.
 await pc.evaluate(()=>{window.__results=[];handlers['remote:result']=m=>{window.__results.push(m);return {};};handlers['remote:event']=m=>{window.__remoteEvent(m);return {};};
  TylerCompanion.isAutomaticActive=()=>true;TylerCompanion.getVoiceState=()=>({enabled:true,connectedPeers:1,attached:1});TylerCompanion.getIncoming=()=>({tracks:3});});
 const ask=(action,args={})=>pc.evaluate(async([action,args])=>{const id='a'+Math.random().toString(36).slice(2);for(const fn of listeners)fn({type:'remote:action',id,action,args});for(let i=0;i<250;i++){const r=window.__results.find(x=>x.id===id);if(r){if(!r.ok)throw Error(r.error);return r.data;}await new Promise(x=>setTimeout(x,20));}throw Error('no answer');},[action,args]);
 srv=setupRemote({vault:memoryStorage(),ask,pageDir:path.join(ROOT,'app','remote'),uiDir:path.join(ROOT,'app','companion','ui'),libDir:path.join(ROOT,'app','companion'),version:'readme',theme:async()=>theme,prefs:{get:async()=>({theme,muteCall:false}),theme:async()=>{},muteCall:async()=>{}}});
 const st=await srv.handle('enable');
 const ctx=await browser.newContext({viewport:{width:390,height:844},deviceScaleFactor:Number(scale),isMobile:true,hasTouch:true,userAgent:'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1'});
 try{
  const phone=await ctx.newPage();await phone.goto('http://127.0.0.1:'+st.port+'/?code='+st.code);
  await phone.waitForFunction(()=>globalThis.__tylerRemote?.state().fx===true,null,{timeout:30000});await phone.evaluate(()=>document.fonts.ready);
  await pc.evaluate(s=>TylerCompanion.setActivity(s),state);
  await phone.evaluate(t=>document.getElementById('tyler').shadowRoot.getElementById('tab-'+t).click(),tab);
  await phone.waitForTimeout(1600);
  const png=await phone.screenshot({animations:'disabled'});
  return 'data:image/png;base64,'+png.toString('base64');
 }finally{await ctx.close();await pc.close();await srv.stop();}
}
// [data-panel] keys: "hero", "theme:<name>", "panel:<query>", "settings:<query>", "window:<query>" or "remote:<query>".
const cache=new Map();
async function source(key){
 if(!cache.has(key)){
  const q=k=>Object.fromEntries(new URLSearchParams(key.slice(k.length+1)));
  cache.set(key,key==='hero'?panel({tab:'soundboard',height:440,scale:2.5}):key.startsWith('theme:')?panel({theme:key.slice(6),height:230,scale:1.5})
   :key.startsWith('panel:')?panel(q('panel')):key.startsWith('settings:')?settings(q('settings')):key.startsWith('window:')?window_(q('window')):key.startsWith('remote:')?remote(q('remote')):Promise.reject(Error('unknown '+key)));
 }
 return cache.get(key);
}

try{for(const f of jobs){
 const name=f.slice(0,-5);
 const page=await browser.newPage({viewport:{width:1400,height:900},deviceScaleFactor:Number(process.env.SCALE||SCALE[name]||1.5)});
 await page.goto(base+'/tools/readme-art/'+f);
 for(const key of await page.$$eval('img[data-panel]',a=>[...new Set(a.map(i=>i.dataset.panel))])){
  const url=await source(key);
  await page.$$eval(`img[data-panel="${key}"]`,(imgs,u)=>Promise.all(imgs.map(i=>new Promise(r=>{i.onload=r;i.onerror=r;i.src=u;}))),url);
 }
 await page.evaluate(()=>document.fonts.ready);await page.waitForTimeout(150);
 const shots=await page.$$('[data-shot]');
 for(const shot of shots){const n=await shot.getAttribute('data-shot');await shot.screenshot({path:path.join(OUT,n+'.png'),omitBackground:true});console.log('wrote assets/readme/'+n+'.png');}
 if(!shots.length){const out=path.join(OUT,name+'.png');await (await page.$('.bg')).screenshot({path:out,omitBackground:true});console.log('wrote',path.relative(ROOT,out));}
 await page.close();
}}finally{await browser.close();server.close();}

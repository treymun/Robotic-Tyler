// Renders the README artwork (tools/readme-art/*.html) to assets/readme/*.png with Playwright's Chromium.
//   node tools/readme-art/render.mjs [hero themes icons button]
// The artwork uses the app's own Steam theme (browser-extension/ui/tokens.css) and real screenshots of
// the panel: every <img data-panel="..."> is filled with the panel from tools/preview/panel.html
// ("hero": the Steam theme on air in the Sounds tab; "theme:<name>": the top of the panel in that theme).
import fs from 'node:fs';import http from 'node:http';import path from 'node:path';import {createRequire} from 'node:module';import {fileURLToPath} from 'node:url';
const HERE=path.dirname(fileURLToPath(import.meta.url)),ROOT=path.resolve(HERE,'..','..'),OUT=path.join(ROOT,'assets','readme');
const {chromium}=createRequire(path.join(ROOT,'package.json'))('playwright');
fs.mkdirSync(OUT,{recursive:true});
const SCALE={hero:1.25,themes:1.25,icons:2,button:2};
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
// A real panel screenshot: its top `height` CSS pixels, at `scale`.
async function panel({theme='steam',tab='conversation',state=SPEAKING,height=420,scale=2}){
 const page=await browser.newPage({viewport:{width:1280,height:900},deviceScaleFactor:scale});
 await page.goto(base+'/tools/preview/panel.html?platform=chrome&theme='+theme);
 await page.waitForFunction(()=>window.__tylerReady===true);await page.evaluate(()=>document.fonts.ready);
 await page.evaluate(([t,s])=>{TylerCompanion.showTab(t);TylerCompanion.setActivity(s);},[tab,state]);
 await page.waitForTimeout(450);
 const box=await page.evaluate(()=>{const b=document.getElementById('tyler-companion-root').shadowRoot.querySelector('.panel').getBoundingClientRect();return {x:b.x,y:b.y,width:b.width,height:b.height};});
 const png=await page.screenshot({clip:{x:box.x,y:box.y,width:box.width,height:Math.min(height,box.height)},animations:'disabled'});
 await page.close();
 return 'data:image/png;base64,'+png.toString('base64');
}
const cache=new Map();
async function source(key){
 if(!cache.has(key))cache.set(key,key==='hero'?panel({tab:'soundboard',height:440,scale:2.5}):panel({theme:key.slice(6),height:230,scale:1.5}));
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

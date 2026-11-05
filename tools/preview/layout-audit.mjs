#!/usr/bin/env node
// Layout audit: renders the panel (every tab), Settings and the phone remote in every theme and
// measures what the eye picks up as "slightly off": buttons in one row with different heights or
// centres, uneven gaps between them, controls poking out of their card, clipped labels and
// overlapping controls. Prints the problems per theme and writes out/layout-audit.json.
// Usage: node tools/preview/layout-audit.mjs [outDir]   (THEMES=steam,tf2 to limit)
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
const ALL=['steam','classic','tf2','cs2','portal','cs16','hev','l4d','winxp','doom','quake','pipboy','combine','deadlock','minecraft','payday','dreamcast','gmod','ricochet','dod','rust','x360','ipod','msn','xmb'];
const THEMES=process.env.THEMES?process.env.THEMES.split(','):ALL;
const SHOTS=process.env.SHOTS==='1';
const types={'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.png':'image/png','.json':'application/json','.svg':'image/svg+xml','.woff2':'font/woff2','.ttf':'font/ttf'};
const server=http.createServer((req,res)=>{
 const url=new URL(req.url,'http://x');const file=path.join(ROOT,decodeURIComponent(url.pathname));
 if(!file.startsWith(ROOT)||!fs.existsSync(file)||fs.statSync(file).isDirectory()){res.writeHead(404);res.end();return;}
 res.writeHead(200,{'content-type':types[path.extname(file)]||'application/octet-stream'});fs.createReadStream(file).pipe(res);
}).listen(0);
const base='http://127.0.0.1:'+server.address().port;
const browser=await chromium.launch();

// Runs in the page. `scope` is a CSS selector for the root (or '#shadow' for the panel's shadow root).
function audit(scope){
 const root=scope==='#shadow'?document.getElementById('tyler-companion-root').shadowRoot:document;
 const CONTROL='button,select,input:not([type=checkbox]):not([type=radio]):not([type=range]):not([type=hidden]),textarea,a.button,.btn,[role=button]';
 const visible=el=>{const r=el.getBoundingClientRect();if(r.width<2||r.height<2)return false;const s=getComputedStyle(el);if(s.visibility==='hidden'||s.display==='none'||Number(s.opacity)===0)return false;for(let p=el;p;p=p.parentElement||p.getRootNode().host){if(p.hidden||p.closest?.('details:not([open]) > :not(summary)'))return false;}return true;};
 const name=el=>{const id=el.id?'#'+el.id:'';const cls=[...el.classList].slice(0,2).map(c=>'.'+c).join('');const text=(el.textContent||el.value||el.placeholder||'').trim().replace(/\s+/g,' ').slice(0,28);return el.tagName.toLowerCase()+id+cls+(text?' “'+text+'”':'');};
 const problems=[];const seen=new Set();
 const add=(kind,el,detail)=>{const key=kind+name(el)+detail;if(seen.has(key))return;seen.add(key);problems.push({kind,el:name(el),detail});};
 const controls=[...root.querySelectorAll(CONTROL)].filter(visible);
 // Rows: controls that share a parent and sit on one line.
 const byParent=new Map();for(const c of controls){const p=c.parentElement;if(!p)continue;if(!byParent.has(p))byParent.set(p,[]);byParent.get(p).push(c);}
 for(const [parent,list] of byParent){
  if(list.length<2)continue;
  const ps=getComputedStyle(parent);if(!/flex|grid/.test(ps.display))continue;
  const boxes=list.map(el=>({el,r:el.getBoundingClientRect()}));
  // Group into lines by vertical overlap.
  const lines=[];for(const b of boxes.sort((a,b)=>a.r.top-b.r.top||a.r.left-b.r.left)){const line=lines.find(l=>l.some(o=>Math.min(o.r.bottom,b.r.bottom)-Math.max(o.r.top,b.r.top)>Math.min(o.r.height,b.r.height)*.5));line?line.push(b):lines.push([b]);}
  for(const line of lines){
   if(line.length<2)continue;line.sort((a,b)=>a.r.left-b.r.left);
   // Only compare like with like: buttons with buttons, fields with fields.
   const kind=el=>el.tagName==='BUTTON'||el.matches('a.button,.btn,[role=button]')?'button':'field';
   for(const k of ['button','field']){
    const same=line.filter(b=>kind(b.el)===k);if(same.length<2)continue;
    const hs=same.map(b=>b.r.height),cs=same.map(b=>b.r.top+b.r.height/2);
    if(Math.max(...hs)-Math.min(...hs)>1.5)add('uneven-height',same[0].el,same.map(b=>name(b.el).split(' ')[0]+'='+b.r.height.toFixed(1)).join(', '));
    if(Math.max(...cs)-Math.min(...cs)>1.5)add('off-centre',same[0].el,'centres differ by '+(Math.max(...cs)-Math.min(...cs)).toFixed(1)+'px');
   }
   const gaps=[];for(let i=1;i<line.length;i++)gaps.push(line[i].r.left-line[i-1].r.right);
   if(gaps.some(g=>g<-.5))add('overlap',line[0].el,'controls overlap by '+(-Math.min(...gaps)).toFixed(1)+'px');
   if(gaps.length>1&&!/space-between|space-around|space-evenly/.test(ps.justifyContent)&&Math.max(...gaps)-Math.min(...gaps)>2)add('uneven-gap',line[0].el,'gaps '+gaps.map(g=>g.toFixed(1)).join('/'));
  }
 }
 // Displays too: in a centred flex row, every item (chips, readouts, labels, buttons) shares one centre line.
 const rows=new Set(controls.map(c=>c.parentElement).filter(Boolean));
 for(const el of root.querySelectorAll('.row,.btn-row,.chips,.stat-row,.meta,.head,header,.top,.bar,.toolbar,[class*=row]'))rows.add(el);
 for(const parent of rows){
  if(!visible(parent))continue;const ps=getComputedStyle(parent);
  if(!ps.display.includes('flex')||ps.flexDirection.startsWith('column')||ps.alignItems!=='center')continue;
  const kids=[...parent.children].filter(k=>visible(k)&&getComputedStyle(k).position!=='absolute'&&getComputedStyle(k).position!=='fixed').map(el=>({el,r:el.getBoundingClientRect()}));
  const lines=[];for(const b of kids.sort((a,b)=>a.r.top-b.r.top)){const line=lines.find(l=>l.some(o=>Math.min(o.r.bottom,b.r.bottom)-Math.max(o.r.top,b.r.top)>0));line?line.push(b):lines.push([b]);}
  for(const line of lines){if(line.length<2)continue;const cs=line.map(b=>b.r.top+b.r.height/2);const spread=Math.max(...cs)-Math.min(...cs);
   if(spread>2)add('row-off-centre',parent,'items’ centres differ by '+spread.toFixed(1)+'px: '+line.map(b=>name(b.el).split(' ')[0]).join(', '));}
 }
 // Even spacing between repeated blocks stacked in one column (cards, feature groups, list rows).
 const stacks=new Set([...root.querySelectorAll('details,.card,.feature,.tv-card,section,.rm-card,li,.item')].map(e=>e.parentElement).filter(Boolean));
 for(const parent of stacks){
  if(!visible(parent))continue;
  const sig=e=>e.tagName+'.'+[...e.classList].sort().join('.');
  const kids=[...parent.children].filter(visible);const groups=new Map();for(const k of kids){const g=sig(k);if(!groups.has(g))groups.set(g,[]);groups.get(g).push(k);}
  for(const [,list] of groups){
   if(list.length<3)continue;const boxes=list.map(el=>el.getBoundingClientRect());
   if(boxes.some((b,i)=>i&&Math.abs(b.left-boxes[0].left)>1))continue; // not one column
   const consecutive=list.every((e,i)=>!i||e.previousElementSibling===list[i-1]||!visible(e.previousElementSibling));if(!consecutive)continue;
   const gaps=boxes.slice(1).map((b,i)=>b.top-boxes[i].bottom);if(Math.max(...gaps)-Math.min(...gaps)>3)add('uneven-stack',list[0],'gaps '+gaps.map(g=>g.toFixed(1)).join('/'));
   const ws=boxes.map(b=>b.width);if(Math.max(...ws)-Math.min(...ws)>1.5&&!list.some(e=>e.tagName==='LI'))add('ragged-stack',list[0],'widths '+[...new Set(ws.map(w=>w.toFixed(0)))].join('/'));
  }
 }
 // Controls that poke out of the card or section they sit in, and clipped labels.
 for(const el of controls){
  const r=el.getBoundingClientRect();
  const box=el.closest('.card,.tv-card,section,fieldset,details,.panel,.rm-card,.group')||null;
  if(box&&box!==el){const b=box.getBoundingClientRect(),s=getComputedStyle(box);const left=b.left+parseFloat(s.borderLeftWidth),right=b.right-parseFloat(s.borderRightWidth);
   if(r.right>right+.5||r.left<left-.5)add('outside-card',el,'by '+Math.max(r.right-right,left-r.left).toFixed(1)+'px');}
  if(el.tagName==='BUTTON'||el.tagName==='SELECT'){const s=getComputedStyle(el);if(el.scrollWidth>el.clientWidth+1&&s.overflow!=='visible')add('clipped',el,el.scrollWidth+' > '+el.clientWidth);}
 }
 // Buttons whose text is not vertically centred (padding mismatch shows as text sitting low or high).
 for(const el of controls.filter(e=>e.tagName==='BUTTON'&&e.childElementCount===0&&e.textContent.trim())){
  const range=document.createRange();range.selectNodeContents(el);const t=range.getBoundingClientRect(),r=el.getBoundingClientRect();if(!t.height)continue;
  const s=getComputedStyle(el),top=r.top+parseFloat(s.borderTopWidth),bottom=r.bottom-parseFloat(s.borderBottomWidth);
  const off=(t.top-top)-(bottom-t.bottom);if(Math.abs(off)>3&&t.height<r.height*.8)add('text-off-centre',el,(off>0?'low':'high')+' by '+(Math.abs(off)/2).toFixed(1)+'px');
 }
 // Horizontal page scroll.
 const de=document.documentElement;if(scope!=='#shadow'&&de.scrollWidth>de.clientWidth+1)problems.push({kind:'page-scroll',el:'document',detail:de.scrollWidth+' > '+de.clientWidth});
 return problems;
}

const shadow=fn=>`(()=>{const r=document.getElementById('tyler-companion-root').shadowRoot;${fn}})()`;
const results={};
const stub=theme=>{window.chrome={storage:{local:{get:async()=>({uiTheme:theme,usage:{requests:42,promptTokens:18234,completionTokens:5120,reportedCostUSD:0.0314,speechResponses:9}}),set:async()=>{},remove:async()=>{}}},tabs:{create:()=>{},query:async()=>[]}};window.tylerSettings={storage:{local:window.chrome.storage.local},tabs:{create:async()=>{}},verifyKey:async()=>true,activity:async()=>[]};};
for(const theme of THEMES){
 const out=results[theme]={};
 // The panel, every tab, with the feature groups open.
 const page=await browser.newPage({viewport:{width:1280,height:860}});
 await page.goto(base+'/tools/preview/panel.html?platform=chrome&theme='+theme);
 await page.waitForFunction(()=>window.__tylerReady===true);await page.waitForTimeout(500);await page.evaluate(()=>document.fonts.ready);
 for(const tab of ['conversation','room','soundboard','setup','checks']){
  await page.evaluate(([t])=>{TylerCompanion.showTab(t);},[tab]);
  await page.evaluate(shadow(`for(const d of r.querySelectorAll('details'))d.open=true;`));await page.waitForTimeout(200);
  out['panel-'+tab]=await page.evaluate(audit,'#shadow');
  if(SHOTS){const box=await page.evaluate(shadow(`const b=r.querySelector('.panel').getBoundingClientRect();return {x:b.x,y:b.y,width:b.width,height:b.height};`));await page.screenshot({path:path.join(OUT,'audit-'+theme+'-panel-'+tab+'.png'),clip:box});}
 }
 await page.close();
 // Settings, each zone.
 const s=await browser.newPage({viewport:{width:1280,height:900}});
 await s.addInitScript(stub,theme);await s.goto(base+'/browser-extension/settings.html');await s.waitForTimeout(500);await s.evaluate(()=>document.fonts.ready);
 for(const zone of ['ai','voice','squad','games','advanced']){
  await s.evaluate(z=>{location.hash=z;},zone);await s.waitForTimeout(250);
  out['settings-'+zone]=await s.evaluate(audit,'document');
  if(SHOTS)await s.screenshot({path:path.join(OUT,'audit-'+theme+'-settings-'+zone+'.png'),fullPage:true});
 }
 await s.close();
}
await browser.close();server.close();
fs.writeFileSync(path.join(OUT,'layout-audit.json'),JSON.stringify(results,null,1));
// Problems every theme has are the shared layout's; the rest belong to that theme.
const sig=p=>p.view+'|'+p.kind+'|'+p.el;
const flat=Object.entries(results).flatMap(([theme,views])=>Object.entries(views).flatMap(([view,list])=>list.map(p=>({theme,view,...p}))));
const count=new Map();for(const p of flat){const k=sig(p);count.set(k,(count.get(k)||new Set()).add(p.theme));}
const shared=[...count].filter(([,t])=>t.size===THEMES.length).map(([k])=>k);
console.log('Shared by every theme ('+shared.length+'):');for(const k of shared){const p=flat.find(x=>sig(x)===k);console.log('  '+p.view+'  '+p.kind+'  '+p.el+'  '+p.detail);}
for(const theme of THEMES){const own=flat.filter(p=>p.theme===theme&&count.get(sig(p)).size<THEMES.length);if(!own.length)continue;console.log('\n'+theme+' ('+own.length+'):');for(const p of own)console.log('  '+p.view+'  '+p.kind+'  '+p.el+'  '+p.detail);}

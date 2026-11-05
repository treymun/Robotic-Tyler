#!/usr/bin/env node
// ROBOTIC TYLER build: one source tree, three execution environments.
//
//   browser-extension/   canonical source (load this folder unpacked in Chrome)
//   app/companion/       GENERATED — Electron Control Center background + settings
//   app/steam-preload.cjs GENERATED — Electron preload with the in-chat scripts
//   voice-app/tokens.css GENERATED — design tokens for the Native Voice Studio
//   voice-app/logos/     GENERATED — theme logos for the Voice Studio
//   voice-app/icons.css, kit.css, ui-icons.js, ui-kit.js  GENERATED — shared icons and dialogs
//   browser-extension/ui-icons.js GENERATED — the themed icon set
//   browser-extension/ui-logos.js GENERATED — theme logos for the in-chat panel
//   browser-extension/ui-brand.js GENERATED — the 20 original themes' branded icons (assets/theme-icons)
//   browser-extension/trivia-bank.js GENERATED — from tools/trivia/questions.txt
//
// Usage:  node tools/build.mjs          write every generated file
//         node tools/build.mjs --check  exit 1 if anything is stale (CI / pre-zip)
//
// Platform rules live in PLATFORM below. Adding a content script to
// manifest.json makes it flow to the desktop build automatically unless it is
// listed as Chrome-only.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {compileTrivia} from './trivia/compile.mjs';
import {ICONS,iconSvg} from './icons/icons.mjs';
import {BRAND} from './brand/map.mjs';
import {cleanBrandSvg} from './brand/clean.mjs';
import {compileThemeSounds} from './sounds/compile.mjs';

const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const EXT=path.join(ROOT,'browser-extension');
const COMPANION=path.join(ROOT,'app','companion');
const OVERRIDES=path.join(ROOT,'app','desktop-overrides');
const CHECK=process.argv.includes('--check');

// v2.37: the themes' Pack 3 additions, one stylesheet per theme-pack file (theme-pack-1.js … -4.js),
// after theme-features.css so they can refine it.
const PACK3_CSS=['theme-assets-1.css','theme-assets-2.css','theme-assets-3.css','theme-assets-4.css'];
// Theme stylesheets (ui/themes/*.css). The default "steam" look is tokens.css itself.
export const THEMES=fs.readdirSync(path.join(EXT,'ui','themes')).filter(f=>f.endsWith('.css')).sort();
// Theme fonts (ui/fonts/): font files, their licences and fonts.css.
// Theme logos (ui/logos/): <theme>.png for pages, .webp for the panel, -16/-32.png for the toolbar.
export const LOGO_FILES=fs.readdirSync(path.join(EXT,'ui','logos')).filter(f=>/\.(png|webp)$/.test(f)).sort();
// Branded icons' credits and licences (ui/brand/), shipped with the icons.
export const BRAND_FILES=fs.existsSync(path.join(EXT,'ui','brand'))?fs.readdirSync(path.join(EXT,'ui','brand')).filter(f=>/\.(md|txt)$/.test(f)).sort():[];
export const FONT_FILES=fs.readdirSync(path.join(EXT,'ui','fonts')).filter(f=>/\.(woff2|css|txt)$/.test(f)).sort();

export const PLATFORM=Object.freeze({
 // Not part of the Steam window's bundle. Since v2.19 the desktop app has everything else the
 // extension's Steam scripts need: the neural VAD page, Live voice's port, its own YouTube window
 // (youtube-music.js runs there, from app/youtube-preload.cjs) and screen/window sharing.
 chromeOnly:new Set(['youtube-music.js']),
 // Deliberately not part of the desktop build (see CHANGES.md).
 notPorted:new Set([]),
 // Settings-page scripts with real desktop differences (IPC settings bridge).
 // Their desktop variants live in app/desktop-overrides/.
 overrides:['settings.js','v22-settings.js','package.json'],
 // The phone remote's copy of the panel (v2.26, app/remote.cjs serves these from app/companion).
 remotePage:['ui-template.js','ui-logos.js','ui-brand.js','ui-icons.js','ui-kit.js','theme-features.js','theme-pack-1.js','theme-pack-2.js','theme-pack-3.js','theme-pack-4.js'],
 settingsPage:['settings.html','settings.css','settings-navigation.js','v23-settings.js','theme.js','ui/tokens.css',...THEMES.map(t=>'ui/themes/'+t),...FONT_FILES.map(f=>'ui/fonts/'+f),...LOGO_FILES.map(f=>'ui/logos/'+f),'ui/logo-mark.svg','icons/icon-32.png','ui/icons.css','ui/kit.css','ui-icons.js','ui-logos.js','ui-brand.js','ui-kit.js','ui-template.js','theme-showcase.js',...BRAND_FILES.map(f=>'ui/brand/'+f),'theme-pack-1.js','theme-pack-2.js','theme-pack-3.js','theme-pack-4.js','theme-gallery.js','remote-settings.js','notice-settings.js','image-core.js','image-settings.js','theme-voice-settings.js','voice-settings.js','ai-settings.js','chat-tag.js'],
});

const read=p=>fs.readFileSync(p,'utf8').replace(/\r\n/g,'\n');
const outputs=new Map(); // absolute path -> string | Buffer
const emit=(file,content)=>outputs.set(file,content);

// ── 1. UI template: ui/*.css + ui/panel.html → ui-template.js ──────────────
function minifyCss(css){
 return css.replace(/\/\*[\s\S]*?\*\//g,'').replace(/\s+/g,' ').replace(/\s*([{};])\s*/g,'$1').replace(/;}/g,'}').trim();
}
function minifyHtml(html){
 return html.replace(/<!--[\s\S]*?-->/g,'').replace(/>\s+</g,'><').replace(/\s{2,}/g,' ').trim();
}
export function compileUI(){
 const css=minifyCss(['tokens.css','panel.css','icons.css','kit.css',...THEMES.map(t=>'themes/'+t),'theme-features.css',...PACK3_CSS].map(f=>read(path.join(EXT,'ui',f))).join('\n'));
 const logo=read(path.join(EXT,'ui','logo-mark.svg')).trim();
 const source=read(path.join(EXT,'ui','panel.html'));if(!source.includes('<!--@logo-->'))throw Error('ui/panel.html needs a <!--@logo--> placeholder');
 const withIcons=source.replace(/<!--@icon:([a-z]+)-->/g,(_,name)=>'@@ICON:'+name+'@@');
 const html=minifyHtml(withIcons.replace(/<!--@logo:[^>]*-->/,'').replace('<!--@logo-->','@@LOGO@@')).replace('@@LOGO@@',()=>logo).replace(/@@ICON:([a-z]+)@@/g,(_,name)=>iconSvg(name));
 const version=JSON.parse(read(path.join(EXT,'manifest.json'))).version;
 return '// GENERATED by tools/build.mjs from ui/tokens.css, ui/panel.css, ui/icons.css, ui/kit.css, ui/themes/*.css, ui/theme-features.css, ui/theme-assets-*.css, ui/logo-mark.svg and ui/panel.html.\n'+
  '// Edit those files, then run: node tools/build.mjs\n'+
  'globalThis.TylerUI=Object.freeze({version:'+JSON.stringify(version)+',css:'+JSON.stringify(css)+',html:'+JSON.stringify(html)+
  ',get markup(){return "<style>"+this.css+"</style>"+this.html;}});\n';
}

// ── 1b. Theme fonts for the in-chat panel: ui/fonts/fonts.css → ui-fonts.js ──
// @font-face rules don't apply inside the panel's shadow root, and Steam's page
// may block font URLs, so the panel adds the font bytes with the FontFace API,
// and only for the theme that is chosen.
export function compileFonts(){
 const dir=path.join(EXT,'ui','fonts'),css=read(path.join(dir,'fonts.css'));
 const faces=[...css.matchAll(/@font-face\{([^}]*)\}/g)].map(([,b])=>({family:/font-family:"([^"]+)"/.exec(b)[1],file:/url\("([^"]+)"\)/.exec(b)[1],weight:/font-weight:([^;]+)/.exec(b)[1].trim()}));
 const families=new Set(faces.map(f=>f.family)),themes={};
 for(const t of THEMES){const used=[...new Set([...read(path.join(EXT,'ui','themes',t)).matchAll(/"(Tyler [^"]+)"/g)].map(m=>m[1]))];
  for(const f of used)if(!families.has(f))throw Error(`ui/themes/${t} uses "${f}", which ui/fonts/fonts.css doesn't define`);
  if(used.length)themes[t.replace(/\.css$/,'')]=used;}
 const data=faces.map(f=>({family:f.family,weight:f.weight,data:fs.readFileSync(path.join(dir,f.file)).toString('base64')}));
 return `// GENERATED by tools/build.mjs from ui/fonts/fonts.css. Edit that file, then run: node tools/build.mjs
// Fonts: SIL Open Font License, see ui/fonts/OFL-*.txt.
(()=>{
 'use strict';if(globalThis.TylerFonts)return;
 const FACES=${JSON.stringify(data)};
 const THEMES=${JSON.stringify(themes)};
 const added=new Set();
 const bytes=b64=>{const s=atob(b64),a=new Uint8Array(s.length);for(let i=0;i<s.length;i++)a[i]=s.charCodeAt(i);return a.buffer;};
 // Adds the chosen theme's fonts to the page once; the panel's shadow root uses the page's fonts.
 function load(theme){
  const jobs=[];
  for(const f of FACES){if(!(THEMES[theme]||[]).includes(f.family))continue;const key=f.family+'|'+f.weight;if(added.has(key))continue;added.add(key);
   try{const face=new FontFace(f.family,bytes(f.data),{weight:f.weight,style:'normal',display:'swap'});document.fonts.add(face);jobs.push(face.loaded.catch(()=>{}));}catch{}}
  return Promise.all(jobs);
 }
 globalThis.TylerFonts=Object.freeze({load,themes:THEMES});
})();
`;
}

// ── 1e. Branded icons for the original 20 themes (v2.28): assets/theme-icons → ui-brand.js ──
// The owner's icon pack (SVG, 64 px artboard). Each file is checked against a short list of plain
// drawing elements and attributes (no scripts, links, styles or images), its title and namespace
// prefixes are dropped, and the markup is embedded: inline SVG is drawn by the page itself, so
// Steam's page policy never sees an image request. tools/brand/map.mjs says where each one goes.
export function compileBrand(){
 const dir=path.join(ROOT,'assets','theme-icons'),manifest=JSON.parse(read(path.join(dir,'manifest.json'))),data={},map={};
 // v2.30: the assets chosen from Pack 2 (assets/theme-icons-pack-2), as tools/brand/pack2.py drew
 // them (derived/): only the ones a theme uses ship.
 const p2dir=path.join(ROOT,'assets','theme-icons-pack-2','derived'),p2=JSON.parse(read(path.join(p2dir,'index.json'))),p2used=new Set();
 for(const [theme,cfg] of Object.entries(BRAND)){
  const t=manifest.themes.find(x=>x.id===(cfg.pack||theme));if(!t)throw Error('assets/theme-icons has no '+(cfg.pack||theme)+' icons');
  const used=new Set([cfg.mark,...Object.values(cfg.icons||{}),...Object.values(cfg.states||{}),...(cfg.extra||[])]);
  data[theme]={};const names=Object.fromEntries(t.assets.map(a=>[a.id,a.name])),native={};
  for(const a of t.assets)data[theme][a.id]=cleanBrandSvg(read(path.join(dir,a.svg)),a.svg);
  for(const id of used){if(!id.startsWith('source-'))continue;const info=p2[theme]?.[id];if(!info)throw Error('tools/brand/map.mjs: '+theme+' uses '+id+', which tools/brand/pack2.py does not make');
   const file='derived/'+theme+'/'+id+'.svg';data[theme][id]=cleanBrandSvg(read(path.join(p2dir,theme,id+'.svg')),file);names[id]=info.name;if(info.native)native[id]=info.native[0];p2used.add(theme+'/'+id);}
  for(const id of used)if(!data[theme][id])throw Error('tools/brand/map.mjs: '+theme+' has no icon '+id);
  for(const n of Object.keys(cfg.icons||{}))if(!ICONS[n])throw Error('tools/brand/map.mjs: '+theme+' maps an unknown icon name '+n);
  map[theme]={mark:cfg.mark,icons:cfg.icons||{},states:cfg.states||{},pixel:!!cfg.pixel,names,native};
  // v2.37: Pack 3 (the 25-theme visual asset pack), as tools/brand/pack3.py drew the picks in
  // assets/theme-visual-pack-3/select/<theme>.json. Its icons/states, if any, take over those names.
  const p3file=path.join(ROOT,'assets','theme-visual-pack-3','derived',theme,'index.json');
  if(fs.existsSync(p3file)){const p3=JSON.parse(read(p3file));
   for(const [id,info] of Object.entries(p3.picks||{})){if(!/^p3-[a-z0-9-]+$/.test(id))throw Error(p3file+': bad id '+id);
    data[theme][id]=cleanBrandSvg(read(path.join(path.dirname(p3file),id+'.svg')),'theme-visual-pack-3/derived/'+theme+'/'+id+'.svg');names[id]=info.name;if(info.native)native[id]=info.native[0];}
   for(const [kind,list] of [['icons',p3.icons||{}],['states',p3.states||{}]])for(const [n,id] of Object.entries(list)){
    if(!data[theme][id])throw Error(p3file+': '+kind+' '+n+' names '+id+', which Pack 3 does not draw');if(kind==='icons'&&!ICONS[n])throw Error(p3file+': unknown icon name '+n);map[theme][kind][n]=id;}}
 }
 for(const [theme,list] of Object.entries(p2))for(const id of Object.keys(list))if(!p2used.has(theme+'/'+id))throw Error('assets/theme-icons-pack-2/derived: '+theme+'/'+id+' is made but no theme uses it (tools/brand/map.mjs)');
 return `// GENERATED by tools/build.mjs from assets/theme-icons (the owner's branded icon pack), the assets chosen
// from Pack 2 (assets/theme-icons-pack-2/derived, tools/brand/pack2.py), Pack 3 (assets/theme-visual-pack-3/derived,
// tools/brand/pack3.py) and tools/brand/map.mjs.
// Icon credits and licences: ui/brand/CREDITS.md, ui/brand/Pack-3-CREDITS.md and ui/brand/*.txt.
(()=>{
 'use strict';if(globalThis.TylerBrand)return;
 const DATA=${JSON.stringify(data)};
 const MAP=${JSON.stringify(map)};
 // Static, trusted markup (checked at build time) for one of a theme's icons; '' if it has none.
 const svg=(theme,id,cls='bi')=>{const m=DATA[theme]?.[id];if(!m)return '';return '<svg class="'+cls+'" data-bi="'+theme+'/'+id+'" viewBox="0 0 64 64" aria-hidden="true" focusable="false"'+(MAP[theme].pixel?' shape-rendering="crispEdges"':'')+'>'+m+'</svg>';};
 const el=(theme,id,cls)=>{const t=document.createElement('template');t.innerHTML=svg(theme,id,cls);return t.content.firstElementChild;};
 // The app's icons (<svg class="ic" data-i="name">) take the theme's branded drawing where the
 // theme has one for that name; the theme's own drawing stays underneath for every other theme.
 const themes=new WeakMap(),watched=new WeakSet();
 function decorate(icon,theme){
  const id=MAP[theme]?.icons?.[icon.dataset.i],want=id?theme+'/'+id:'',old=icon.querySelector(':scope>.ic-b');
  if((icon.dataset.b||'')===want&&(!want||old))return;
  old?.remove();
  if(!want){icon.removeAttribute('data-b');return;}
  // A native bitmap (Pack 2) fills the icon exactly, so at its own size it is pixel for pixel.
  const box=MAP[theme].native?.[id]?'x="0" y="0" width="20" height="20"':'x="-1.5" y="-1.5" width="23" height="23"';
  icon.insertAdjacentHTML('beforeend','<svg class="ic-b" '+box+' viewBox="0 0 64 64"'+(MAP[theme].pixel?' shape-rendering="crispEdges"':'')+'>'+DATA[theme][id]+'</svg>');icon.dataset.b=want;
 }
 function scan(node,theme){if(node.nodeType!==1)return;if(node.matches?.('svg.ic[data-i]'))decorate(node,theme);for(const i of node.querySelectorAll?.('svg.ic[data-i]')||[])decorate(i,theme);}
 // Applies a theme to every icon under root, and to icons added later (notifications, menus…).
 function apply(root,theme){if(!root)return;themes.set(root,theme);scan(root.host||root.documentElement||root,theme);if(root.nodeType===11)for(const c of root.children)scan(c,theme);
  if(!watched.has(root)&&globalThis.MutationObserver){watched.add(root);new MutationObserver(list=>{const t=themes.get(root);for(const r of list)for(const n of r.addedNodes)if(n.nodeType===1&&!n.classList?.contains('ic-b'))scan(n,t);}).observe(root,{childList:true,subtree:true});}}
 // The status strip's badge: one icon per state the theme has one for; CSS shows the one for the
 // strip's real data-state (ui/theme-features.css).
 function badge(tally,theme){const head=tally?.querySelector('.tally-head');if(!head)return null;let b=head.querySelector(':scope>.tally-brand');const st=MAP[theme]?.states||{},keys=Object.keys(st);
  if(!keys.length){b?.remove();return null;}
  if(!b){b=document.createElement('span');b.className='tally-brand';b.setAttribute('aria-hidden','true');const l=head.querySelector('.tally-label');if(l)l.after(b);else head.prepend(b);}
  if(b.dataset.theme!==theme){b.dataset.theme=theme;b.replaceChildren(...keys.map(k=>{const e=el(theme,st[k],'tally-bi');e.dataset.for=k;return e;}));}
  return b;}
 globalThis.TylerBrand=Object.freeze({has:t=>Object.hasOwn(MAP,t),badge,mark:t=>MAP[t]?.mark||'',state:(t,s)=>MAP[t]?.states?.[s]||'',name:(t,id)=>MAP[t]?.names?.[id]||'',native:(t,id)=>MAP[t]?.native?.[id]||0,states:t=>({...(MAP[t]?.states||{})}),svg,el,apply,themes:Object.freeze(Object.keys(MAP))});
})();
`;
}

// ── 1c. Theme logos for the in-chat panel: ui/logos/*.webp → ui-logos.js ──
// Each theme has its own Tyler logo (ui/logos/<theme>.png for pages, .webp for the
// panel, -16/-32.png for the toolbar). Steam's page may block image URLs in the
// panel, so the panel decodes embedded bytes with createImageBitmap (no request,
// so no page policy applies) and draws them on a canvas. Steam is the fallback.
export const LOGO_THEMES=['steam',...THEMES.map(t=>t.replace(/\.css$/,''))];
export const PIXEL_LOGOS=['doom','minecraft'];
export function compileLogos(){
 const dir=path.join(EXT,'ui','logos'),data={},small={};
 for(const t of LOGO_THEMES){
  for(const f of [t+'.png',t+'.webp',t+'-16.png',t+'-32.png'])if(!fs.existsSync(path.join(dir,f)))throw Error('ui/logos/'+f+' is missing (every theme needs a logo)');
  data[t]=fs.readFileSync(path.join(dir,t+'.webp')).toString('base64');
  if(fs.existsSync(path.join(dir,t+'-sm.webp')))small[t]=fs.readFileSync(path.join(dir,t+'-sm.webp')).toString('base64');
 }
 return `// GENERATED by tools/build.mjs from ui/logos/*.webp. Replace those files, then run: node tools/build.mjs
(()=>{
 'use strict';if(globalThis.TylerLogos)return;
 const DATA=${JSON.stringify(data)};
 // Dedicated small versions (tools/logos/small.py), used at 48 device pixels or less.
 const SMALL=${JSON.stringify(small)};
 const PIXEL=new Set(${JSON.stringify(PIXEL_LOGOS)});
 const cache=new Map(),sized=new Map();
 const blob=b64=>{const s=atob(b64),a=new Uint8Array(s.length);for(let i=0;i<s.length;i++)a[i]=s.charCodeAt(i);return new Blob([a],{type:'image/webp'});};
 const bitmap=(theme,small=false)=>{const t=DATA[theme]?theme:'steam',k=small&&SMALL[t]?t+':sm':t;if(!cache.has(k))cache.set(k,createImageBitmap(blob(k===t?DATA[t]:SMALL[t])).catch(()=>null));return cache.get(k);};
 const canvasOf=(w,h)=>{const c=document.createElement('canvas');c.width=w;c.height=h;return c;};
 // Small sizes (v2.18): rather than letting the browser shrink the 128 px source, each logo is
 // resampled to the exact device-pixel size (Lanczos-3 on premultiplied alpha) and given a light
 // unsharp mask, so the glasses, the valve and the outlines stay crisp from 24 to 64 px. Pixel-art
 // logos are scaled without smoothing instead.
 const sinc=x=>{if(x===0)return 1;const p=Math.PI*x;return Math.sin(p)/p;};
 function taps(from,to){
  const s=from/to,f=Math.max(1,s),r=3*f,out=[];
  for(let i=0;i<to;i++){const c=(i+.5)*s-.5,lo=Math.max(0,Math.ceil(c-r)),hi=Math.min(from-1,Math.floor(c+r)),w=[];let sum=0;
   for(let j=lo;j<=hi;j++){const x=(j-c)/f,v=Math.abs(x)<3?sinc(x)*sinc(x/3):0;w.push(v);sum+=v;}
   out.push([lo,w.map(v=>v/sum)]);}
  return out;
 }
 function pass(inp,w,h,ow,oh,horiz){
  const t=taps(horiz?w:h,horiz?ow:oh),out=new Float32Array(ow*oh*4);
  for(let y=0;y<oh;y++)for(let x=0;x<ow;x++){const [lo,k]=t[horiz?x:y];let r=0,g=0,b=0,a=0;
   for(let n=0;n<k.length;n++){const p=(horiz?y*w+lo+n:(lo+n)*w+x)*4,f=k[n];r+=inp[p]*f;g+=inp[p+1]*f;b+=inp[p+2]*f;a+=inp[p+3]*f;}
   const q=(y*ow+x)*4;out[q]=r;out[q+1]=g;out[q+2]=b;out[q+3]=a;}
  return out;
 }
 const G=[.0097,.205,.5706,.205,.0097];
 function blur(inp,w,h,horiz){
  const out=new Float32Array(inp.length);
  for(let y=0;y<h;y++)for(let x=0;x<w;x++){let r=0,g=0,b=0,a=0;
   for(let n=-2;n<=2;n++){const xx=horiz?Math.min(w-1,Math.max(0,x+n)):x,yy=horiz?y:Math.min(h-1,Math.max(0,y+n)),q=(yy*w+xx)*4,f=G[n+2];r+=inp[q]*f;g+=inp[q+1]*f;b+=inp[q+2]*f;a+=inp[q+3]*f;}
   const q=(y*w+x)*4;out[q]=r;out[q+1]=g;out[q+2]=b;out[q+3]=a;}
  return out;
 }
 function sharpSize(image,px){
  const src=canvasOf(image.width,image.height),sg=src.getContext('2d');sg.drawImage(image,0,0);
  const d=sg.getImageData(0,0,image.width,image.height).data,pre=new Float32Array(d.length);
  for(let i=0;i<d.length;i+=4){const a=d[i+3]/255;pre[i]=d[i]*a;pre[i+1]=d[i+1]*a;pre[i+2]=d[i+2]*a;pre[i+3]=d[i+3];}
  const p=pass(pass(pre,image.width,image.height,px,image.height,true),px,image.height,px,px,false),soft=blur(blur(p,px,px,true),px,px,false);
  const out=new ImageData(px,px),o=out.data;
  for(let i=0;i<p.length;i+=4){
   const as=Math.min(255,Math.max(0,p[i+3]+.7*(p[i+3]-soft[i+3])));if(as<18)continue;
   for(let c=0;c<3;c++)o[i+c]=Math.max(0,Math.min(255,(p[i+c]+.7*(p[i+c]-soft[i+c]))*255/as));
   o[i+3]=Math.min(255,as*1.08);
  }
  return out;
 }
 // A canvas holding the theme's logo at exactly px × px device pixels (cached).
 async function render(theme,px){
  const t=DATA[theme]?theme:'steam',key=t+':'+px;
  if(sized.has(key))return sized.get(key);
  const image=await bitmap(t,px<=48);if(!image)return null;
  const c=canvasOf(px,px),g=c.getContext('2d');if(!g)return null;
  if(PIXEL.has(t)){g.imageSmoothingEnabled=false;g.drawImage(image,0,0,px,px);}
  else if(px>=image.width){g.imageSmoothingEnabled=true;g.imageSmoothingQuality='high';g.drawImage(image,0,0,px,px);}
  else g.putImageData(sharpSize(image,px),0,0);
  if(sized.size>160)sized.clear();sized.set(key,c);return c;
 }
 const ratio=()=>Math.min(3,Math.max(1,globalThis.devicePixelRatio||1));
 const latest=new WeakMap();
 // Draws the theme's logo into a canvas at the canvas's on-screen size; resolves true when drawn.
 async function paint(canvas,theme){
  if(!canvas||typeof createImageBitmap!=='function')return false;
  const t=DATA[theme]?theme:'steam';latest.set(canvas,t);
  const css=Math.max(16,Math.round(canvas.getBoundingClientRect().width||38)),px=Math.round(css*ratio());
  const art=await render(t,px);if(!art||latest.get(canvas)!==t)return false;
  if(canvas.width!==px||canvas.height!==px){canvas.width=px;canvas.height=px;}
  const g=canvas.getContext('2d');if(!g)return false;
  g.clearRect(0,0,px,px);g.drawImage(art,0,0);
  canvas.dataset.logo=t;return true;
 }
 // Pages: gives an <img> showing ui/logos/<theme>.png a srcset drawn at its exact displayed size.
 // The src stays the plain file, so the picture is right even before (or without) this runs.
 async function sharpen(img,theme){
  if(!img||typeof createImageBitmap!=='function')return false;
  const t=DATA[theme]?theme:'steam';latest.set(img,t);
  const cs=getComputedStyle(img),box=img.clientWidth-parseFloat(cs.paddingLeft||0)-parseFloat(cs.paddingRight||0);
  if(!(box>4)){img.removeAttribute('srcset');return false;}
  const px=Math.round(box*ratio()),art=await render(t,px);if(!art||latest.get(img)!==t)return false;
  img.srcset=art.toDataURL('image/png')+' '+(px/box).toFixed(4)+'x';img.dataset.sharp=t;return true;
 }
 globalThis.TylerLogos=Object.freeze({paint,sharpen,render,themes:Object.freeze(Object.keys(DATA)),pixel:PIXEL});
})();
`;
}

// ── 1d. Icons: tools/icons/icons.mjs → ui-icons.js ─────────────────────────
// One icon set for every window; each theme styles it (ui/icons.css + themes).
export function compileIcons(){
 const all=Object.fromEntries(Object.keys(ICONS).map(n=>[n,iconSvg(n)]));
 return `// GENERATED by tools/build.mjs from tools/icons/icons.mjs. Edit that file, then run: node tools/build.mjs
(()=>{
 'use strict';if(globalThis.TylerIcons)return;
 const ICONS=${JSON.stringify(all)};
 // Static, trusted SVG markup for an icon name ('' for unknown names).
 const svg=name=>ICONS[name]||'';
 // Fills every <span data-icon="name"></span> under root with that icon.
 const fill=(root=document)=>{for(const n of root.querySelectorAll('[data-icon]')){if(!n.dataset.iconDone&&ICONS[n.dataset.icon]){n.insertAdjacentHTML('afterbegin',ICONS[n.dataset.icon]);n.dataset.iconDone='1';}}};
 globalThis.TylerIcons=Object.freeze({svg,fill,names:Object.freeze(Object.keys(ICONS))});
})();
`;
}

// ── 2. Desktop companion: background module graph + settings page ────────
function moduleGraph(entry){
 const seen=new Set(),queue=[entry];
 while(queue.length){
  const file=queue.shift();if(seen.has(file))continue;seen.add(file);
  const abs=path.join(EXT,file),src=outputs.has(abs)?String(outputs.get(abs)):read(abs);
  for(const m of src.matchAll(/(?:^|[;\n])\s*import\s+(?:[^'";]*?\sfrom\s+)?['"](\.\/[^'"]+)['"]/g))queue.push(path.posix.normalize(m[1]));
 }
 return [...seen];
}
function desktopSettingsHtml(){
 const html=read(path.join(EXT,'settings.html'));
 if(!html.includes('data-desktop="false"'))throw Error('settings.html must carry data-desktop="false" on <body>');
 return html.replace('data-desktop="false"','data-desktop="true"');
}
let SOUND_FILES=[]; // v2.31: the themed soundboard clips and their credits (tools/sounds/compile.mjs)
function buildCompanion(){
 const files=new Set(moduleGraph('background.js'));
 for(const f of SOUND_FILES)files.add(f);
 for(const f of PLATFORM.settingsPage)files.add(f);
 for(const f of PLATFORM.remotePage)files.add(f);
 for(const f of [...files].sort()){
  if(f==='settings.html')emit(path.join(COMPANION,f),desktopSettingsHtml());
  else emit(path.join(COMPANION,f),outputs.get(path.join(EXT,f))??fs.readFileSync(path.join(EXT,f)));
 }
 for(const f of PLATFORM.overrides)emit(path.join(COMPANION,f),fs.readFileSync(path.join(OVERRIDES,f)));
 emit(path.join(COMPANION,'GENERATED.txt'),'This folder is generated by tools/build.mjs from browser-extension/ and app/desktop-overrides/.\nDo not edit files here; edits are overwritten on the next build.\n');
 return files;
}

// ── 3. Electron preload: manifest content scripts minus Chrome-only ───────
function desktopScripts(){
 const manifest=JSON.parse(read(path.join(EXT,'manifest.json')));
 const steam=manifest.content_scripts.filter(c=>c.matches.some(m=>m.startsWith('https://steamcommunity.com/chat')));
 const main=steam.find(c=>c.world==='MAIN')?.js||[],isolated=steam.find(c=>c.world!=='MAIN')?.js||[];
 const keep=f=>!PLATFORM.chromeOnly.has(f)&&!PLATFORM.notPorted.has(f);
 return {main:main.filter(keep),isolated:isolated.filter(keep)};
}
// Use this run's freshly compiled output (e.g. ui-template.js) rather than the copy on disk.
const current=f=>{const file=path.join(EXT,f);return outputs.has(file)?String(outputs.get(file)).replace(/\r\n/g,'\n'):read(file);};
function bundle(list){return list.map(f=>';/* '+f+' */\n'+current(f).replace(/^\uFEFF/,'').trimEnd()+'\n').join('');}
function buildPreload(){
 const {main,isolated}=desktopScripts();
 const mainCode=bundle(main);
 return `'use strict';
// GENERATED by tools/build.mjs from browser-extension/manifest.json content scripts.
// Chrome-only scripts are excluded. Do not edit by hand.
//
// Two modes, picked in Settings → Voice and told by the main process (app/steam-voice.cjs) before
// Steam's own scripts run:
//  - voice (v2.19, the default): voice and chat in this window, like the Chrome extension. Tyler's
//    synthetic microphone is switched on at once, so Steam's microphone request never needs a device;
//  - text only ("Through VB-CABLE"): the audio bridge stays off and voice runs in the Windows helper.
const {ipcRenderer,webFrame}=require('electron');
if(process.isMainFrame!==false&&/^https:\\/\\/steamcommunity\\.com\\/chat(?:\\/|$)/.test(location.href)){
 const mode=ipcRenderer.sendSync('tyler:desktop-mode')||{},voice=mode.voice===true;
 const listeners=[],ports=new Map();let portSeq=0;
 // Music DJ and screen awareness come with voice (they play into, and comment in, the call).
 for(const [name,on] of [['__TYLER_DESKTOP_TEXT_ONLY',!voice],['__TYLER_DESKTOP_VOICE',voice],['__TYLER_DESKTOP_MUSIC',voice],['__TYLER_DESKTOP_SCREEN',voice]])if(on)Object.defineProperty(globalThis,name,{value:true,configurable:false});
 // chrome.* stand-in: requests to the shared background in the main process, its pushes back,
 // Live voice's port (voice mode only) and the address of the local speech detector page.
 globalThis.chrome={runtime:{
  sendMessage:message=>ipcRenderer.invoke('tyler:request',message),
  onMessage:{addListener:fn=>listeners.push(fn)},
  getURL:file=>'tyler-app://companion/'+String(file||'').replace(/^\\/+/,''),
  connect:({name}={})=>{
   const id=++portSeq,onMessage=[],onDisconnect=[];let open=voice;
   const port={name:String(name||''),postMessage:message=>{if(open)ipcRenderer.send('tyler:port',{op:'message',id,message});},
    disconnect:()=>{if(!open)return;open=false;ports.delete(id);ipcRenderer.send('tyler:port',{op:'close',id});},
    onMessage:{addListener:fn=>onMessage.push(fn)},onDisconnect:{addListener:fn=>onDisconnect.push(fn)}};
   if(!voice){setTimeout(()=>{for(const fn of onDisconnect){try{fn(port);}catch{}}},0);return port;}
   ports.set(id,{port,onMessage,onDisconnect,end:()=>{open=false;}});ipcRenderer.send('tyler:port',{op:'open',id,name:port.name});return port;
  }
 }};
 ipcRenderer.on('tyler:message',(_event,message)=>{for(const fn of listeners){try{fn(message);}catch{}}});
 ipcRenderer.on('tyler:port',(_event,data)=>{const entry=ports.get(data?.id);if(!entry)return;
  if(data.op==='message'){for(const fn of entry.onMessage){try{fn(data.message,entry.port);}catch{}}}
  else if(data.op==='close'){ports.delete(data.id);entry.end();for(const fn of entry.onDisconnect){try{fn(entry.port);}catch{}}}});
 // MAIN world: ${main.join(', ')}
 const flags=voice?'window.__TYLER_DESKTOP_VOICE=true;\\n':'window.__TYLER_DESKTOP_TEXT_ONLY=true;\\n';
 const enable=voice?"\\n;window.postMessage({source:'tyler-audio-command',type:'enable'},location.origin);\\n":'';
 const injected=webFrame.executeJavaScriptInIsolatedWorld(0,[{code:flags+${JSON.stringify(mainCode)}+enable}]);let ran=false;
 // Isolated world: ${isolated.join(', ')}
 function runUI(){if(ran)return;ran=true;
${bundle(isolated)}
 }
 const ready=()=>injected.then(runUI).catch(()=>{const error=document.createElement('div');error.textContent='ROBOTIC TYLER could not load. Use Reload companion in the app menu.';error.style.cssText='position:fixed;right:20px;bottom:20px;padding:16px 18px;border-radius:10px;background:#1a1e25;border:1px solid #ef7d7d;color:#e7e9ec;font:13px system-ui;z-index:2147483647';document.documentElement.append(error);});
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',ready,{once:true});else ready();
}
`;
}

// ── 4. The desktop app's YouTube window (Music DJ): youtube-music.js with a one-call stand-in ──
function buildYoutubePreload(){
 const manifest=JSON.parse(read(path.join(EXT,'manifest.json')));
 const yt=manifest.content_scripts.find(c=>c.matches.some(m=>m.startsWith('https://www.youtube.com/')))?.js||[];
 return `'use strict';
// GENERATED by tools/build.mjs from browser-extension/manifest.json (the YouTube content script).
// Do not edit by hand. The desktop app's Music window (app/desktop-media.cjs): ${yt.join(', ')} with
// chrome.runtime.sendMessage going to the main process, which accepts only its music messages.
const {ipcRenderer}=require('electron');
if(process.isMainFrame!==false&&/^https:\\/\\/(?:www\\.)?youtube\\.com\\//.test(location.href)){
 globalThis.chrome={runtime:{sendMessage:message=>ipcRenderer.invoke('tyler:youtube',message)}};
 const run=()=>{
${bundle(yt)}
 };
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',run,{once:true});else run();
}
`;
}

// ── Run ───────────────────────────────────────────────────────────────────
// The trivia bank comes first: the chat scripts and the desktop background use it.
emit(path.join(EXT,'trivia-bank.js'),compileTrivia(read(path.join(ROOT,'tools','trivia','questions.txt'))));
emit(path.join(EXT,'ui-template.js'),compileUI());
emit(path.join(EXT,'ui-fonts.js'),compileFonts());
emit(path.join(EXT,'ui-logos.js'),compileLogos());
emit(path.join(EXT,'ui-brand.js'),compileBrand());
emit(path.join(EXT,'ui-icons.js'),compileIcons());
{const s=compileThemeSounds({root:ROOT,themes:['steam',...THEMES.map(t=>t.replace(/\.css$/,''))] /* Steam is the default look: no stylesheet */});emit(path.join(EXT,'theme-sounds.mjs'),s.module);
 for(const [rel,bytes] of s.files)emit(path.join(EXT,rel),bytes);SOUND_FILES=s.files.map(([rel])=>rel);}
const companionFiles=buildCompanion();
emit(path.join(ROOT,'app','steam-preload.cjs'),buildPreload());
emit(path.join(ROOT,'app','youtube-preload.cjs'),buildYoutubePreload());
emit(path.join(ROOT,'voice-app','tokens.css'),fs.readFileSync(path.join(EXT,'ui','tokens.css')));
for(const t of THEMES)emit(path.join(ROOT,'voice-app','themes',t),fs.readFileSync(path.join(EXT,'ui','themes',t)));
for(const f of FONT_FILES)emit(path.join(ROOT,'voice-app','fonts',f),fs.readFileSync(path.join(EXT,'ui','fonts',f)));
emit(path.join(ROOT,'voice-app','logo-mark.svg'),fs.readFileSync(path.join(EXT,'ui','logo-mark.svg')));
for(const [from,to] of [['ui/icons.css','icons.css'],['ui/kit.css','kit.css'],['ui-kit.js','ui-kit.js']])emit(path.join(ROOT,'voice-app',to),fs.readFileSync(path.join(EXT,from)));
emit(path.join(ROOT,'voice-app','ui-icons.js'),String(outputs.get(path.join(EXT,'ui-icons.js'))));
emit(path.join(ROOT,'voice-app','ui-logos.js'),String(outputs.get(path.join(EXT,'ui-logos.js'))));
emit(path.join(ROOT,'voice-app','ui-brand.js'),String(outputs.get(path.join(EXT,'ui-brand.js'))));
for(const f of LOGO_FILES.filter(f=>/^[a-z0-9]+\.png$/.test(f)))emit(path.join(ROOT,'voice-app','logos',f),fs.readFileSync(path.join(EXT,'ui','logos',f)));

const same=(file,content)=>{try{return Buffer.from(content).equals(fs.readFileSync(file));}catch{return false;}};
const stale=[...outputs].filter(([f,c])=>!same(f,c)).map(([f])=>path.relative(ROOT,f));
// Files left in app/companion that the build no longer produces.
const expected=new Set([...outputs.keys()].filter(f=>f.startsWith(COMPANION+path.sep)));
const orphans=[];
(function walk(dir){for(const e of fs.existsSync(dir)?fs.readdirSync(dir,{withFileTypes:true}):[]){const p=path.join(dir,e.name);if(e.isDirectory())walk(p);else if(!expected.has(p))orphans.push(p);}})(COMPANION);

if(CHECK){
 const problems=[...stale.map(f=>'stale: '+f),...orphans.map(f=>'orphan: '+path.relative(ROOT,f))];
 if(problems.length){console.error('Generated files are out of date. Run: node tools/build.mjs\n  '+problems.join('\n  '));process.exit(1);}
 console.log('Generated files are up to date ('+outputs.size+' files).');
}else{
 for(const f of orphans)fs.rmSync(f);
 for(const [f,c] of outputs){fs.mkdirSync(path.dirname(f),{recursive:true});if(!same(f,c))fs.writeFileSync(f,c);}
 const {main,isolated}=desktopScripts();
 console.log('ui-template.js compiled.');
 console.log('app/companion: '+companionFiles.size+' shared files + '+PLATFORM.overrides.length+' desktop overrides'+(orphans.length?' ('+orphans.length+' stale files removed)':'')+'.');
 console.log('app/steam-preload.cjs: '+main.length+' MAIN-world + '+isolated.length+' isolated scripts.');
 console.log(stale.length?'Updated: '+stale.join(', '):'Nothing changed.');
}

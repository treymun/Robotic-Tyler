// v2.7: new logo everywhere and the "Classic Steam (2004)" theme.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';
const ROOT=path.resolve(import.meta.dirname,'..');
const read=f=>fs.readFileSync(path.join(ROOT,f),'utf8');
const pngSize=f=>{const b=fs.readFileSync(path.join(ROOT,f));assert.equal(b.toString('ascii',1,4),'PNG',f);return [b.readUInt32BE(16),b.readUInt32BE(20)];};

test('the logo is used by every surface',()=>{
 const manifest=JSON.parse(read('browser-extension/manifest.json'));
 for(const [size,file] of Object.entries(manifest.icons))assert.deepEqual(pngSize('browser-extension/'+file),[Number(size),Number(size)],file);
 for(const [size,file] of Object.entries(manifest.action.default_icon))assert.deepEqual(pngSize('browser-extension/'+file),[Number(size),Number(size)]);
 const ui=read('browser-extension/ui-template.js');
 assert.match(ui,/class=\\"mark\\" aria-hidden=\\"true\\"><svg xmlns=/,'panel mark starts with the inline vector logo');
 assert.match(ui,/<canvas class=\\"mark-art\\"/,'and has the canvas the theme logo is drawn on');
 assert.doesNotMatch(ui,/@@LOGO@@|<!--@logo/);
 assert.match(read('browser-extension/settings.html'),/<img class="mark" src="ui\/logos\/steam\.png"/);
 assert.match(read('voice-app/native.html'),/<img id="brand-logo" src="logos\/steam\.png"/);
 assert.equal(read('voice-app/logo-mark.svg'),read('browser-extension/ui/logo-mark.svg'));
 assert.deepEqual(pngSize('assets/robotic-tyler.png'),[512,512]);
 assert.match(read('app/main.cjs'),/robotic-tyler-tray\.png/);
 const ico=fs.readFileSync(path.join(ROOT,'assets/robotic-tyler.ico'));assert.equal(ico.readUInt16LE(2),1,'icon file');assert.ok(ico.readUInt16LE(4)>=6,'several icon sizes');
});

test('the theme setting is readable by the chat panel but only the settings page can change it',async()=>{
 const {contentStorage,readable}=await import(path.join(ROOT,'browser-extension/content-storage.mjs'));
 assert.ok(readable.has('uiTheme'));
 const store={data:{uiTheme:'classic'},async get(keys){return Object.fromEntries(keys.map(k=>[k,this.data[k]]));},async set(v){Object.assign(this.data,v);}};
 assert.deepEqual(await contentStorage(store,{action:'get',keys:['uiTheme']}),{values:{uiTheme:'classic'}});
 await assert.rejects(contentStorage(store,{action:'set',values:{uiTheme:'steam'}}),/not allowed/);
 const {settingsKeys,sanitizeSettings}=createRequire(import.meta.url)(path.join(ROOT,'app/guards.cjs'));
 assert.ok(settingsKeys.has('uiTheme'));assert.deepEqual(sanitizeSettings({uiTheme:'classic'}),{uiTheme:'classic'});
});

const THEMES=['steam',...fs.readdirSync(path.join(ROOT,'browser-extension/ui/themes')).filter(f=>f.endsWith('.css')).map(f=>f.slice(0,-4)).sort()];

test('every theme ships to all three surfaces and every theme list agrees',()=>{
 assert.deepEqual([...THEMES].sort(),['classic','combine','cs16','cs2','deadlock','dod','doom','dreamcast','gmod','hev','l4d','minecraft','payday','pipboy','portal','quake','ricochet','steam','tf2','winxp']);
 const ui=read('browser-extension/ui-template.js'),settings=read('browser-extension/settings.html'),voice=read('voice-app/native.html');
 for(const t of THEMES.filter(t=>t!=='steam')){
  assert.ok(ui.includes('[data-rt-theme='+t+']{color-scheme:'),t+' compiled into the chat panel');
  assert.match(settings,new RegExp('href="ui/themes/'+t+'\\.css"'));assert.match(voice,new RegExp('href="themes/'+t+'\\.css"'));
  assert.equal(read('voice-app/themes/'+t+'.css'),read('browser-extension/ui/themes/'+t+'.css'));
  assert.ok(fs.existsSync(path.join(ROOT,'app/companion/ui/themes/'+t+'.css')));
 }
 assert.ok(settings.indexOf('settings.css')<settings.indexOf('ui/themes/')&&settings.indexOf('ui/themes/')<settings.indexOf('src="theme.js"'),'themes load after the base sheet');
 for(const f of ['theme.js','ui/logo-mark.svg','icons/icon-32.png'])assert.ok(fs.existsSync(path.join(ROOT,'app/companion',f)),f);
 // The same list everywhere a theme name is checked. Settings → Appearance (v2.14)
 // builds one gallery card per entry in theme.js INFO.
 const info=read('browser-extension/theme.js').match(/const INFO=\{([\s\S]*?)\n \};/)[1];
 const offered=[...info.matchAll(/^\s*([a-z0-9]+):\[/gm)].map(m=>m[1]);
 assert.deepEqual(offered.sort(),[...THEMES].sort(),'Settings → Appearance offers every theme');
 for(const t of THEMES)assert.ok(fs.existsSync(path.join(ROOT,'browser-extension/ui/logos/'+t+'.png')),t+' gallery logo');
 assert.doesNotMatch(settings,/id="uiTheme"/,'the old theme dropdown is gone');
 assert.match(settings,/id="themeGallery"[^>]*role="radiogroup"/);
 assert.ok(settings.indexOf('src="ui-template.js"')<settings.indexOf('src="theme-gallery.js"'),'previews need the panel template first');
 for(const f of ['browser-extension/content.js','browser-extension/theme.js','app/main.cjs','voice-app/native.js']){
  const list=read(f).match(/\['steam'(?:,'[a-z0-9]+')*\]/);assert.ok(list,f);assert.deepEqual(JSON.parse(list[0].replace(/'/g,'"')).sort(),[...THEMES].sort(),f);
 }
});

// WCAG contrast of each theme's text tokens on the surfaces they're used on.
function tokensOf(css,theme){
 const block=css.match(new RegExp('\\[data-rt-theme='+theme+'\\]\\{([\\s\\S]*?)\\n\\}'))[1];
 return Object.fromEntries([...block.matchAll(/(--[\w-]+):([^;]+);/g)].map(m=>[m[1],m[2].trim()]));
}
const base=Object.fromEntries([...read('browser-extension/ui/tokens.css').matchAll(/(--[\w-]+):([^;]+);/g)].map(m=>[m[1],m[2].trim()]));
const lum=hex=>{const c=[1,3,5].map(i=>parseInt(hex.slice(i,i+2),16)/255).map(x=>x<=0.03928?x/12.92:((x+0.055)/1.055)**2.4);return 0.2126*c[0]+0.7152*c[1]+0.0722*c[2];};
for(const theme of THEMES){
 test(theme+' theme: text colours stay readable (4.5:1)',()=>{
  const tokens=theme==='steam'?base:{...base,...tokensOf(read('browser-extension/ui/themes/'+theme+'.css'),theme)};
  const resolve=v=>{for(let i=0;i<6&&/^var\(/.test(v);i++)v=tokens[v.slice(4,-1).split(',')[0].trim()]??v;return v;};
  // Translucent surfaces (the default theme's rgba blocks) are judged over the canvas.
  const value=v=>{v=resolve(v);const m=/^rgba\((\d+),(\d+),(\d+),([\d.]+)\)$/.exec(v.replace(/\s/g,''));if(m){const bg=resolve('var(--rt-bg)'),a=Number(m[4]);v='#'+[1,3,5].map((i,k)=>Math.round(Number(m[k+1])*a+parseInt(bg.slice(i,i+2),16)*(1-a)).toString(16).padStart(2,'0')).join('');}assert.match(v,/^#[0-9a-f]{6}$/i,'solid colour expected, got '+v);return v;};
  const ratio=(a,b)=>{const [x,y]=[lum(value(a)),lum(value(b))].sort((p,q)=>q-p);return (x+0.05)/(y+0.05);};
  const check=(ink,bg,min=4.5)=>assert.ok(ratio(ink,bg)>=min,`${theme}: ${ink} on ${bg} is ${ratio(ink,bg).toFixed(2)}`);
  for(const bg of ['var(--rt-bg)','var(--rt-block)','var(--rt-surface)','var(--rt-bg-deep)'])
   for(const ink of ['var(--rt-ink)','var(--rt-ink-3)','var(--rt-link)','var(--rt-state-ready)','var(--rt-state-listening)','var(--rt-state-thinking)','var(--rt-state-speaking)','var(--rt-state-error)'])check(ink,bg);
  for(const bg of ['var(--rt-bg)','var(--rt-block)','var(--rt-bg-deep)'])check('var(--rt-ink-4)',bg);
  check('var(--rt-ink-strong)','var(--rt-select)');
  check('var(--rt-blue)','var(--rt-blue-fade)');
  check('var(--rt-danger-ink)','var(--rt-danger-bg)');
  if(!/gradient/.test(tokens['--rt-accent-fill']??''))check('var(--rt-on-accent)','var(--rt-accent-fill)');
  if(!/gradient/.test(tokens['--rt-green']))check('var(--rt-green-ink)','var(--rt-green)');
 });
}

test('game themes ship their open-licensed fonts to every surface',()=>{
 const css=read('browser-extension/ui/fonts/fonts.css');
 const faces=[...css.matchAll(/font-family:"([^"]+)";src:url\("([^"]+)"\)/g)].map(m=>({family:m[1],file:m[2]}));
 assert.ok(faces.length>=6);
 for(const f of faces){
  const b=fs.readFileSync(path.join(ROOT,'browser-extension/ui/fonts',f.file));assert.equal(b.toString('ascii',0,4),'wOF2',f.file);
  for(const copy of ['app/companion/ui/fonts/','voice-app/fonts/'])assert.ok(fs.existsSync(path.join(ROOT,copy+f.file)),copy+f.file);
 }
 for(const lic of ['OFL-Passion-One.txt','OFL-Saira-Semi-Condensed.txt','OFL-Barlow.txt'])assert.match(read('browser-extension/ui/fonts/'+lic),/SIL Open Font License/);
 // Each game theme uses a bundled family; the chat panel gets the bytes through ui-fonts.js.
 const fonts=read('browser-extension/ui-fonts.js');
 for(const [theme,family] of [['tf2','Tyler TF2 Display'],['cs2','Tyler CS2'],['portal','Tyler Portal']]){
  assert.ok(read('browser-extension/ui/themes/'+theme+'.css').includes('"'+family+'"'),theme);
  assert.ok(fonts.includes(`"${theme}":["${family}"]`),theme+' fonts load with the theme');
 }
 const iso=JSON.parse(read('browser-extension/manifest.json')).content_scripts.find(c=>c.world!=='MAIN').js;
 assert.equal(iso.indexOf('ui-fonts.js'),iso.indexOf('ui-template.js')+1);
 assert.match(read('browser-extension/settings.html'),/font-src 'self'/);
 assert.match(read('browser-extension/settings.html'),/href="ui\/fonts\/fonts\.css"/);assert.match(read('voice-app/native.html'),/href="fonts\/fonts\.css"/);
});

test('every theme draws its own animated status strip',()=>{
 const panel=read('browser-extension/ui/panel.css');
 for(const t of THEMES){
  const css=t==='steam'?panel:read('browser-extension/ui/themes/'+t+'.css');
  assert.match(css,new RegExp('/\\* (── )?(Status strip|Steam: a friends-list entry)'),t+' documents its status strip');
  assert.match(css,new RegExp('\\[data-rt-theme='+t+'\\] \\.tally\\[data-state=(listening|thinking|speaking)\\][^{]*\\{[^}]*(animation:|--beat:)'),t+' animates a live state');
  assert.match(css,/@keyframes [a-z0-9]+-[a-z-]+\{/,t+' has its own animation');
 }
 // Decorations never replace the text: the status line keeps role=status and the heart-monitor line is hidden from screen readers.
 const ui=read('browser-extension/ui-template.js');
 assert.match(ui,/class=\\"tally-text\\" role=\\"status\\"/);assert.match(ui,/class=\\"tally-trace\\" aria-hidden=\\"true\\"/);
 // Reduced motion stops every strip animation.
 assert.match(panel,/prefers-reduced-motion:reduce\)\{\*,\*::before,\*::after\{animation:none!important/);
});

// v2.18: a theme's heading rule (:is(h1,h2,…,.sheet-head h2)) outranks a bare .rt-dialog-title rule,
// which left dialog titles in the heading colour; title rules are scoped to their dialog or toast.
test('dialog and notification titles keep their own colour in every theme',()=>{
 for(const t of THEMES.filter(t=>t!=='steam')){
  const css=read('browser-extension/ui/themes/'+t+'.css');
  assert.doesNotMatch(css,/\[data-rt-theme=\w+\] (?::is\(\.rt-toast-title,\.rt-dialog-title\)|\.rt-dialog-title|\.rt-toast-title)\{/,t+': title rules are scoped as :is(.rt-toast,.rt-dialog) :is(…)');
 }
});

// v2.18: Steam pages may forbid data: images, so the panel's textures are drawn with gradients only.
test('panel styles never depend on data: images',()=>{
 for(const f of ['panel.css','kit.css','icons.css',...THEMES.filter(t=>t!=='steam').map(t=>'themes/'+t+'.css')]){
  const p=path.join(ROOT,'browser-extension/ui',f);if(!fs.existsSync(p))continue;
  assert.doesNotMatch(fs.readFileSync(p,'utf8'),/url\(\s*["']?data:/,f+' uses no data: URL');
 }
});

// v2.13: every theme has its own Tyler logo, and every surface switches it with the theme.
test('every theme ships its own logo to every surface',()=>{
 const png=f=>{const b=fs.readFileSync(path.join(ROOT,f));assert.equal(b.toString('ascii',1,4),'PNG',f);return {w:b.readUInt32BE(16),h:b.readUInt32BE(20),rgba:b[25]===6};};
 const logos=read('browser-extension/ui-logos.js'),hashes=new Set();
 for(const t of THEMES){
  assert.deepEqual(png('browser-extension/ui/logos/'+t+'.png'),{w:128,h:128,rgba:true},t+' page logo: 128 px with transparency');
  for(const n of [16,32])assert.deepEqual(png('browser-extension/ui/logos/'+t+'-'+n+'.png'),{w:n,h:n,rgba:true},t+' toolbar icon '+n);
  const webp=fs.readFileSync(path.join(ROOT,'browser-extension/ui/logos/'+t+'.webp'));assert.equal(webp.toString('ascii',0,4)+webp.toString('ascii',8,12),'RIFFWEBP',t);
  assert.ok(logos.includes(JSON.stringify(t)+':"'+webp.toString('base64')+'"'),t+' panel logo is embedded and current');
  assert.ok(fs.readFileSync(path.join(ROOT,'voice-app/logos/'+t+'.png')).equals(fs.readFileSync(path.join(ROOT,'browser-extension/ui/logos/'+t+'.png'))),t+' Voice Studio copy');
  assert.ok(fs.existsSync(path.join(ROOT,'app/companion/ui/logos/'+t+'.png')),t+' Control Center copy');
  hashes.add(fs.readFileSync(path.join(ROOT,'browser-extension/ui/logos/'+t+'.png')).toString('base64'));
 }
 assert.equal(hashes.size,THEMES.length,'no two themes share a logo');
 assert.match(logos,/const PIXEL=new Set\(\["doom","minecraft"\]\)/,'DOOM and Minecraft are drawn without smoothing');
 assert.match(read('browser-extension/settings.css'),/\.mark\[data-theme=doom\],\.mark\[data-theme=minecraft\]\{image-rendering:pixelated\}/);
 assert.match(read('voice-app/native.css'),/img\[data-theme=doom\],\.brand img\[data-theme=minecraft\]\{image-rendering:pixelated\}/);
 // The panel loads the logos right after the fonts; the desktop preload picks them up from the manifest.
 const iso=JSON.parse(read('browser-extension/manifest.json')).content_scripts.find(c=>c.world!=='MAIN').js;
 assert.equal(iso.indexOf('ui-logos.js'),iso.indexOf('ui-fonts.js')+1);
 assert.match(read('app/steam-preload.cjs'),/\/\* ui-logos\.js \*\//);
 // Every place that switches the logo knows every theme, and falls back to Steam.
 for(const f of ['browser-extension/background.js','voice-app/native.js','app/main.cjs']){
  const list=read(f).match(/\['steam'(?:,'[a-z0-9]+')*\]/);assert.ok(list,f);assert.deepEqual(JSON.parse(list[0].replace(/'/g,'"')).sort(),[...THEMES].sort(),f);
 }
 assert.match(read('browser-extension/background.js'),/setIcon\?\.\(\{path:\{16:'ui\/logos\/'\+t\+'-16\.png',32:'ui\/logos\/'\+t\+'-32\.png'\}\}\)/,'toolbar icon follows the theme');
 assert.match(read('browser-extension/theme.js'),/img\.src='ui\/logos\/steam\.png'/,'settings falls back to the Steam logo');
 assert.match(read('app/main.cjs'),/globalThis\.tylerThemeIcon=/,'window and tray icons follow the theme');
 assert.match(read('app/main.cjs'),/for\(const w of \[bot,options,voiceWin\]\)if\(w&&!w\.isDestroyed\(\)\)w\.setIcon\(img\)/,'the Voice window icon follows the theme too');
 // Packaged builds include the folders the logos live in.
 const files=JSON.parse(read('electron-builder.desktop.json')).files;assert.ok(files.includes('voice-app/**/*')&&files.includes('app/**/*'));
});

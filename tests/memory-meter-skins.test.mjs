// v2.45: every theme's own memory meter skin, and how its art reaches the panel. Static checks of the CSS and
// the build (no browser; tests/e2e/memory-meter.e2e.mjs draws all 25 in Chromium).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import crypto from 'node:crypto';
const ROOT=path.resolve(import.meta.dirname,'..');
const read=f=>fs.readFileSync(path.join(ROOT,f),'utf8');
const THEMES=['steam','classic','tf2','cs2','portal','cs16','hev','l4d','winxp','doom','quake','pipboy','combine','deadlock','minecraft','payday','dreamcast','gmod','ricochet','dod','rust','x360','ipod','msn','xmb'];
const sheet=t=>t==='steam'?'browser-extension/ui/memory-meter.css':'browser-extension/ui/themes/'+t+'.css';
const strip=css=>css.replace(/\/\*[\s\S]*?\*\//g,'').replace(/\s+/g,' ');
// The skin: from its "Memory meter skin (v2.45)" heading (Steam's: "Steam's skin (v2.45)") to the end of the file.
const skinOf=t=>{const src=read(sheet(t)),at=src.search(t==='steam'?/\/\* ── Steam's skin \(v2\.45\)/:/\/\* ── Memory meter skin \(v2\.45\)/);return at<0?'':src.slice(at);};
const rules=css=>[...strip(css).matchAll(/([^{}]+)\{([^{}]*)\}/g)].map(m=>({sel:m[1].trim(),body:m[2].trim()}));
const template=()=>{const ctx={};vm.createContext(ctx);ctx.globalThis=ctx;vm.runInContext(read('browser-extension/ui-template.js'),ctx);return ctx.TylerUI.css;};

test('every theme has its own memory meter skin, in its own stylesheet, for itself only',()=>{
 assert.equal(fs.readdirSync(path.join(ROOT,'browser-extension/ui/themes')).filter(f=>f.endsWith('.css')).length+1,THEMES.length,'25 themes: 24 theme files and Steam');
 for(const t of THEMES){
  const skin=skinOf(t);assert.ok(skin,sheet(t)+': has the "Memory meter skin (v2.45)" section at its end');
  const own=rules(skin).filter(r=>r.sel.split(',').every(s=>s.trim().startsWith('.panel[data-rt-theme='+t+'] .tyler-mem')||s.trim().startsWith('@')));
  assert.ok(own.some(r=>/^\.panel\[data-rt-theme=\w+\] \.tyler-mem$/.test(r.sel)&&r.body.includes('--mem-skin:'+t)),t+': the root rule sets --mem-skin:'+t);
  assert.ok(own.length>=12,t+': a whole skin ('+own.length+' rules), not a tweak');
  for(const part of ['tyler-mem-meter','tyler-mem-value','tyler-mem-label','tyler-mem-own','tyler-mem-summary','tyler-mem-list'])
   assert.ok(own.some(r=>r.sel.includes(part)),t+': styles .'+part);
  for(const m of skin.matchAll(/data-rt-theme=(\w+)/g))assert.equal(m[1],t,t+': its skin styles only itself');
 }
});

test('no two skins are one template recoloured',()=>{
 // Each skin's own styling: its declarations without the resets and grid placement every skin needs (margin:0,
 // background:none, grid-row…), with its theme's name and the art/colour variables' names taken out.
 const plumbing=/^(margin|padding|grid-(column|row|template-[a-z]+)|(column|row)-gap|gap|align-[a-z]+|justify-[a-z]+|place-self|display|position|overflow|text-align|content|inset|top|right|bottom|left|width|height)$/;
 const reset=/^(0|none|auto|transparent|normal|1|0 0 0|0 auto)$/;
 const decl=t=>new Set(rules(skinOf(t)).flatMap(r=>r.body.split(';')).map(d=>d.trim()).filter(d=>{const [k,...v]=d.split(':');return d&&!plumbing.test(k.trim())&&!reset.test(v.join(':').trim());}).map(d=>d.replace(new RegExp(t,'g'),'T').replace(/var\(--[\w-]+\)/g,'var()')));
 const sets=Object.fromEntries(THEMES.map(t=>[t,decl(t)]));let worst=[0];
 for(const a of THEMES)for(const b of THEMES){if(a>=b)continue;const A=sets[a],B=sets[b],both=[...A].filter(x=>B.has(x)).length,j=both/(A.size+B.size-both);if(j>worst[0])worst=[j,a,b];}
 console.log('Memory meter skins: the two most alike ('+worst.slice(1).join(', ')+') share '+Math.round(worst[0]*100)+'% of their declarations');
 assert.ok(worst[0]<.25,'skins share less than a quarter of their styling; most alike: '+worst.slice(1).join(' and ')+' '+worst[0].toFixed(2));
});

test('the panel’s CSS never loads a file or a link: every url() is a data: URL',()=>{
 // Everything ui-template.js compiles (the panel, here and on the phone remote), its output, and the pages' own
 // stylesheets. Not ui/fonts/fonts.css: it is only the list tools/build.mjs turns into ui-fonts.js (FontFace).
 const ui=['tokens.css','panel.css','memory-meter.css','icons.css','kit.css','theme-features.css','theme-assets-1.css','theme-assets-2.css','theme-assets-3.css','theme-assets-4.css',...fs.readdirSync(path.join(ROOT,'browser-extension/ui/themes')).map(f=>'themes/'+f)].map(f=>'browser-extension/ui/'+f);
 const sources=[...ui,'browser-extension/settings.css','app/remote/remote.css','app/remote/phone-settings.css'].map(f=>[f,strip(read(f))]);
 for(const [f,css] of [...sources,['ui-template.js (compiled)',template()]])
  for(const m of css.matchAll(/url\(\s*(["']?)([^"')\s]*)/g))assert.match(m[2],/^data:image\/(svg\+xml|png|webp)[,;]/,f+': url('+m[2].slice(0,40)+')');
});

test('the skins’ pack art: each --rt-art variable is a data: URL set under its own theme, drawn by that theme, small, and credited',()=>{
 const css=template(),credits=read('browser-extension/ui/brand/Pack-3-CREDITS.md');let bytes=0,n=0;
 for(const t of THEMES){
  const used=new Set([...read(sheet(t)).matchAll(/var\(--rt-art-([a-z0-9-]+)\)/g)].map(m=>m[1]));
  const f=path.join(ROOT,'assets/theme-visual-pack-3/derived',t,'index.json'),art=fs.existsSync(f)?JSON.parse(fs.readFileSync(f,'utf8')).css||{}:{};
  assert.deepEqual([...used].sort(),Object.keys(art).sort(),t+': draws exactly the art its select file lists for CSS');
  const block=new RegExp('\\[data-rt-theme='+t+'\\]\\{(--rt-art-[^}]*)\\}').exec(css)?.[1]||'';
  for(const [id,info] of Object.entries(art)){n++;
   assert.match(block,new RegExp('--rt-art-'+id+':url\\("data:image/'+(info.format==='png'?'png;base64,':'svg\\+xml,')),t+'/'+id+': set under its theme as a data: URL');
   const file=path.join(ROOT,'assets/theme-visual-pack-3/derived',t,'css',id+'.'+info.format),size=fs.statSync(file).size;bytes+=size;
   assert.ok(size<=16*1024,t+'/'+id+' is small ('+size+' bytes)');
   const src=path.join(ROOT,'assets/theme-visual-pack-3/source',t,path.basename(info.file));
   assert.equal(crypto.createHash('sha256').update(fs.readFileSync(src)).digest('hex'),info.sha256,t+'/'+id+': its source is kept as supplied');
   assert.ok(info.tier&&info.source&&Object.keys(info.source).length,t+'/'+id+': its source is recorded');
   assert.match(credits,new RegExp('\\| '+id+' \\([^|]*, CSS\\) \\|'),t+'/'+id+' is credited');
  }
 }
 // The other themes' art is never set for a theme (one theme's art is not another's).
 for(const m of css.matchAll(/\[data-rt-theme=(\w+)\]\{(--rt-art-[^}]*)\}/g))for(const v of m[2].matchAll(/--rt-art-([a-z0-9-]+):/g))assert.ok(read(sheet(m[1])).includes('var(--rt-art-'+v[1]+')'),m[1]+' sets '+v[1]+' and draws it');
 assert.ok(bytes<120*1024,'the skins’ art is '+Math.round(bytes/1024)+' KB in all');
 console.log('Memory meter skins: '+n+' pieces of pack art, '+(bytes/1024).toFixed(1)+' KB');
});

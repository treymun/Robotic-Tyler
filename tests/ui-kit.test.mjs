// v2.14: themed icons, dialogs/notifications/tooltips and the theme gallery (static checks).
// Behaviour in a real browser is covered by tests/e2e/ui-kit.e2e.mjs.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
const ROOT=path.resolve(import.meta.dirname,'..');
const read=f=>fs.readFileSync(path.join(ROOT,f),'utf8');
const {ICONS,iconSvg}=await import(path.join(ROOT,'tools/icons/icons.mjs'));
const THEMES=['steam','classic','tf2','cs2','portal','cs16','hev','l4d','winxp','doom'];

test('every icon has a vector drawing and a pixel drawing, hidden from screen readers',()=>{
 assert.ok(Object.keys(ICONS).length>=20);
 for(const name of Object.keys(ICONS)){
  const svg=iconSvg(name);
  assert.match(svg,/^<svg class="ic" data-i="[a-z]+" viewBox="0 0 20 20" aria-hidden="true" focusable="false">/,name);
  assert.match(svg,/<g class="ic-v">.*<path class="[bds]" d="[^"]+"\/>/,name+' vector');
  assert.match(svg,/<g class="ic-p" transform="scale\(2\)" shape-rendering="crispEdges"><path class="p1" d="M[^"]+"\/>/,name+' pixel art');
  assert.doesNotMatch(svg,/[\u{1F300}-\u{1FAFF}☀-➿]/u,name+' is drawn, not an emoji');
 }
 const generated=read('browser-extension/ui-icons.js');
 for(const name of Object.keys(ICONS))assert.ok(generated.includes(JSON.stringify(name)+':'),name+' compiled into ui-icons.js');
 assert.equal(read('voice-app/ui-icons.js'),generated,'Voice Studio gets the same icons');
});

test('every icon used by the panel, settings and Voice Studio exists',()=>{
 const files=['browser-extension/ui/panel.html','browser-extension/settings.html','browser-extension/settings-navigation.js','browser-extension/theme-gallery.js','browser-extension/automatic.js','browser-extension/soundboard.js','browser-extension/ui-kit.js','voice-app/native.html','voice-app/native.js'];
 const used=new Set();
 for(const f of files){const s=read(f);
  for(const re of [/@icon:([a-z]+)/g,/data-icon="([a-z]+)"/g,/\b(?:svg|icon|ic)\(['"]([a-z]+)['"]\)/g])for(const m of s.matchAll(re))used.add(m[1]);}
 for(const name of used)assert.ok(ICONS[name],'unknown icon "'+name+'"');
 for(const name of ['chat','room','sounds','setup','checks','overview','ai','voice','squad','games','advanced','appearance','play','pause','stop','close','check','success'])assert.ok(used.has(name),name+' is in use');
 for(const name of ['info','success','warning','error'])assert.ok(ICONS[name],name+' notification icon');
 assert.doesNotMatch(read('browser-extension/ui-template.js'),/@icon:/,'panel icon markers are compiled');
});

test('each theme skins icons, notifications, dialogs and tooltips; motion can be turned off',()=>{
 for(const theme of THEMES.filter(t=>t!=='steam')){
  const css=read('browser-extension/ui/themes/'+theme+'.css');
  assert.match(css,/Icons, dialogs, notifications and tooltips \(v2\.14\)/,theme);
  for(const sel of ['.rt-toast','.rt-dialog','.rt-tip','.ic'])assert.ok(css.includes(sel),theme+' styles '+sel);
 }
 assert.match(read('browser-extension/ui/themes/doom.css'),/\.ic-v\{display:none\}[\s\S]*\.ic-p\{display:(?:inline|block)/,'DOOM switches to pixel icons');
 const kit=read('browser-extension/ui/kit.css');
 assert.match(kit,/@media \(prefers-reduced-motion:reduce\)/);
 assert.match(kit,/\.rt-dialog\[data-kind=error\]|\.btn\.danger|data-kind/,'tones by kind');
 const ui=read('browser-extension/ui-template.js');
 for(const rule of ['.ic-p{display:none}','.rt-toasts','.rt-dialog','.rt-tip'])assert.ok(ui.includes(rule),rule+' compiled into the panel');
});

test('dialogs and notifications never parse message text as HTML, and native confirms are replaced',()=>{
 const kit=read('browser-extension/ui-kit.js');
 const html=[...kit.matchAll(/\.innerHTML=([^;]+);/g)].map(m=>m[1]);
 assert.deepEqual(html,['svg(name)'],'only the built-in icon markup is parsed');
 assert.match(kit,/role','alertdialog'/);assert.match(kit,/aria-modal','true'/);assert.match(kit,/Escape/);assert.match(kit,/\.inert=true/);
 assert.match(kit,/kind==='error'\?'alert':'status'/);
 // Tyler's own confirmations use the themed dialog (the game hub's TorBox/Premiumize prompt is left as is).
 for(const f of ['browser-extension/v22-settings.js','app/desktop-overrides/v22-settings.js','browser-extension/squad-suite.js'])
{const src=read(f);assert.match(src,/\.dialog\(|api\.confirm\(/,f+' uses the themed dialog');
  assert.deepEqual([...src.matchAll(/(.{0,17})(?<![.\w])confirm\(/g)].map(m=>m[1]).filter(b=>!b.endsWith('Promise.resolve(')),[],f+': a native confirm only as a fallback');}
 assert.match(read('browser-extension/v22-settings.js'),/danger:true/,'emergency stop keeps a destructive style');
});

test('the theme gallery is a keyboard radiogroup that previews locally and saves only on Apply',()=>{
 const html=read('browser-extension/settings.html'),js=read('browser-extension/theme-gallery.js');
 assert.match(html,/<section class="sheet" id="appearance"/);
 assert.match(html,/id="themeGallery" class="tg-grid" role="radiogroup" aria-labelledby="tgHeading"/);
 assert.match(html,/<button[^>]*id="tgApply"/);
 assert.match(read('browser-extension/settings-navigation.js'),/\['appearance','Appearance'/,'Appearance has its own sidebar entry');
 for(const k of ['ArrowRight','ArrowLeft','ArrowDown','ArrowUp','Home','End'])assert.ok(js.includes("'"+k+"'"),k);
 assert.match(js,/setAttribute\('role','radio'\)/);assert.match(js,/aria-checked/);
 assert.equal((js.match(/T\.save\(/g)||[]).length,2,'saves on Apply and on Undo only');
 assert.doesNotMatch(js,/fetch\(|XMLHttpRequest|WebSocket|sendMessage|chrome\.runtime/,'previews make no requests and no chat connections');
});

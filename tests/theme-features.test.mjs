// v2.20 theme features: every theme defines its own features once, Settings describes them, and the
// panel loads the framework before the three packs (Chrome manifest, so the desktop preload too).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const read=f=>fs.readFileSync(new URL('../'+f,import.meta.url),'utf8');
const THEMES=['steam','classic','tf2','cs2','portal','cs16','hev','l4d','winxp','doom','quake','pipboy','combine','deadlock','minecraft','payday','dreamcast','gmod','ricochet','dod','rust','x360','ipod','msn','xmb'];

test('each of the 25 themes defines its features exactly once',()=>{
 const defined=['1','2','3','4'].flatMap(n=>[...read('browser-extension/theme-pack-'+n+'.js').matchAll(/F\.define\('([a-z0-9]+)'/g)].map(m=>m[1]));
 assert.deepEqual([...defined].sort(),[...THEMES].sort());
});

test('Settings → Appearance describes every theme\'s features',()=>{
 const src=read('browser-extension/theme-gallery.js');const extras=eval('('+/const EXTRAS=(\{.*?\});/s.exec(src)[1]+')');
 assert.deepEqual(Object.keys(extras).sort(),[...THEMES].sort());
 assert.match(read('browser-extension/settings.html'),/id="tgExtras"/);
});

test('the framework loads before the packs, in Chrome and in the desktop app',()=>{
 const js=JSON.parse(read('browser-extension/manifest.json')).content_scripts.find(c=>c.js.includes('content.js')).js;
 const at=f=>js.indexOf(f);
 assert.ok(at('content.js')<at('theme-features.js')&&at('theme-features.js')<at('theme-pack-1.js')&&at('theme-pack-1.js')<at('theme-pack-2.js')&&at('theme-pack-2.js')<at('theme-pack-3.js'));
 const preload=read('app/steam-preload.cjs');
 assert.ok(preload.indexOf('/* theme-features.js */')<preload.indexOf('/* theme-pack-3.js */'));
 assert.match(read('browser-extension/ui-template.js'),/fx-layer/,'feature styles are compiled into the panel');
});
test('content scripts may keep lifetime theme stats but never change the setting that allows them',async()=>{
 const {contentStorage,readable}=await import('../browser-extension/content-storage.mjs');
 const store={data:{},get:async k=>Object.fromEntries(k.filter(x=>x in store.data).map(x=>[x,store.data[x]])),set:async v=>Object.assign(store.data,v),remove:async k=>{for(const x of k)delete store.data[x];}};
 assert.ok(readable.has('tylerLifetime')&&readable.has('themeStats'));
 await contentStorage(store,{action:'set',values:{tylerLifetime:{v:1,replies:3}}});
 assert.equal((await contentStorage(store,{action:'get',keys:['tylerLifetime']})).values.tylerLifetime.replies,3);
 await assert.rejects(contentStorage(store,{action:'set',values:{themeStats:true}}),/not allowed/);
 await assert.rejects(contentStorage(store,{action:'get',keys:['geminiKey']}),/not allowed/);
 await contentStorage(store,{action:'remove',keys:['tylerLifetime']});assert.deepEqual(store.data,{});
});
test('long-running theme animations stay off the main thread where the look allows (v2.21)',()=>{
 const css=f=>fs.readFileSync(new URL('../browser-extension/ui/'+f,import.meta.url),'utf8');
 const kf=(text,name)=>(text.match(new RegExp('@keyframes '+name+'\\{[^@]*?\\}\\}'))||[''])[0];
 // Same motion as before, as transform or opacity (checked frame by frame against v2.20.3 in headless Chromium).
 assert.match(kf(css('themes/l4d.css'),'l4d-torch'),/transform:translateX\(-55%\).*translateX\(193%\)/);
 assert.doesNotMatch(kf(css('themes/l4d.css'),'l4d-beat'),/box-shadow/);
 assert.match(kf(css('themes/cs2.css'),'cs2-scan'),/translateX/);
 assert.match(kf(css('theme-features.css'),'pd-glow'),/opacity/);
 assert.match(kf(css('themes/portal.css'),'p-ring-glow'),/opacity/);
 assert.doesNotMatch(css('theme-features.css'),/dl-drift/,'Deadlock\'s thread is moved by a 30 fps timer');
 // The Dreamcast pad glow no longer shares a name with another animation.
 assert.equal((css('themes/dreamcast.css').match(/@keyframes dc-breathe\{/g)||[]).length,1);
 // The status wave keeps its height animation: as a transform its 2 px dots came out blurred.
 assert.match(css('panel.css'),/@keyframes rt-wave\{0%,100%\{height:2px\}50%\{height:13px\}\}/);
});
test('the panel keeps its own size and dock setting (v2.23), and nothing else of the page\'s',async()=>{
 const {contentStorage,readable}=await import('../browser-extension/content-storage.mjs');
 const store={data:{},get:async k=>Object.fromEntries(k.filter(x=>x in store.data).map(x=>[x,store.data[x]])),set:async v=>Object.assign(store.data,v),remove:async k=>{for(const x of k)delete store.data[x];}};
 assert.ok(readable.has('panelLayout'));
 await contentStorage(store,{action:'set',values:{panelLayout:{w:480,h:640,dock:'side',dockW:460}}});
 assert.deepEqual((await contentStorage(store,{action:'get',keys:['panelLayout']})).values.panelLayout,{w:480,h:640,dock:'side',dockW:460});
 const js=JSON.parse(fs.readFileSync(new URL('../browser-extension/manifest.json',import.meta.url),'utf8')).content_scripts.find(c=>c.js.includes('content.js')).js;
 assert.ok(js.indexOf('content.js')<js.indexOf('panel-layout.js'),'the layout loads after the panel');
 const src=fs.readFileSync(new URL('../browser-extension/panel-layout.js',import.meta.url),'utf8');
 assert.doesNotMatch(src,/createElement\('style'\)/,'Steam\'s page is narrowed through element.style, which a strict page policy allows');
});

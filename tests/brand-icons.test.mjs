// v2.28: the original 20 themes' branded icons (assets/theme-icons → ui-brand.js). Mocked: no
// browser here; the end-to-end tests draw them in the real panel.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {BRAND} from '../tools/brand/map.mjs';
import {ICONS} from '../tools/icons/icons.mjs';
const ROOT=path.resolve(import.meta.dirname,'..');
const read=f=>fs.readFileSync(path.join(ROOT,f),'utf8');
const ORIGINAL=['steam','classic','tf2','cs2','portal','cs16','hev','l4d','winxp','doom','quake','pipboy','combine','deadlock','minecraft','payday','dreamcast','gmod','ricochet','dod'];
const NEWER=['rust','x360','ipod','msn','xmb'],ALL=[...ORIGINAL,...NEWER];
const PACK={x360:'xbox360',xmb:'ps3'};

test('every theme has branded icons (the pack\'s keys for Xbox 360 and PS3 differ)',()=>{
 assert.deepEqual(Object.keys(BRAND).sort(),[...ALL].sort());
 for(const [t,k] of Object.entries(PACK))assert.equal(BRAND[t].pack,k,t);
 const manifest=JSON.parse(read('assets/theme-icons/manifest.json'));
 for(const [theme,cfg] of Object.entries(BRAND)){
  const ids=new Set(manifest.themes.find(t=>t.id===(PACK[theme]||theme)).assets.map(a=>a.id));
  assert.ok(ids.has(cfg.mark),theme+' mark');
  assert.ok(Object.keys(cfg.icons).length>=2,theme+' replaces at least two of the app\'s icons');
  for(const [name,id] of Object.entries(cfg.icons)){assert.ok(ICONS[name],theme+': '+name+' is an app icon');assert.ok(ids.has(id),theme+': '+id);}
  for(const [state,id] of Object.entries(cfg.states||{})){assert.ok(['ready','listening','thinking','speaking','paused','waiting','error'].includes(state),theme+': '+state);assert.ok(ids.has(id),theme+': '+id);}
  assert.equal(!!cfg.pixel,['doom','minecraft'].includes(theme),theme+' pixel art');
 }
});

test('the embedded icons are plain drawings: no scripts, links, styles or images',async()=>{
 const js=read('browser-extension/ui-brand.js');
 assert.doesNotMatch(js,/<script|<image|<use|<foreignObject|href=|url\(|\son[a-z]+=|javascript:|style=/i);
 assert.doesNotMatch(js,/ns0:|<title/,'titles and namespace prefixes are dropped');
 const {cleanBrandSvg}=await import('../tools/brand/clean.mjs');
 const svg=body=>'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">'+body+'</svg>';
 assert.throws(()=>cleanBrandSvg(svg('<script>alert(1)</script>'),'x.svg'),/not allowed/);
 assert.throws(()=>cleanBrandSvg(svg('<path d="M0 0" onload="x()"/>'),'x.svg'),/not allowed/);
 assert.throws(()=>cleanBrandSvg(svg('<path d="M0 0" fill="url(#g)"/>'),'x.svg'),/reference/);
 assert.throws(()=>cleanBrandSvg(svg('<image href="a.png"/>'),'x.svg'),/not allowed/);
 assert.throws(()=>cleanBrandSvg(svg('<rect rx="#fff"/>'),'x.svg'),/not a number/);
 assert.equal(cleanBrandSvg(svg('<title>T</title><path d="M0 0" style="fill:#fff"/>'),'x.svg'),'<path d="M0 0" fill="#fff"/>');
});

test('ui-brand.js gives the mapped drawing, a badge per state, and nothing for unknown themes',()=>{
 const ctx={};vm.createContext(ctx);ctx.globalThis=ctx;vm.runInContext(read('browser-extension/ui-brand.js'),ctx);
 const B=ctx.TylerBrand;
 assert.deepEqual([...B.themes].sort(),[...ALL].sort());
 assert.equal(B.has('nope'),false);assert.equal(B.svg('nope','scrap'),'','an unknown theme gets nothing');assert.equal(B.svg('steam','scrap'),'','nor another theme\'s icon');
 assert.match(B.svg('x360','guide'),/data-bi="x360\/guide"/,'the app\'s key, not the pack\'s');assert.equal(B.mark('xmb'),'playstation-mark');assert.equal(B.state('msn','thinking'),'');
 assert.match(B.svg('tf2','engineer-wrench'),/^<svg class="bi" data-bi="tf2\/engineer-wrench" viewBox="0 0 64 64" aria-hidden="true"/);
 assert.match(B.svg('doom','red-keycard'),/shape-rendering="crispEdges"/,'pixel art keeps hard edges');
 assert.equal(B.mark('winxp'),'windows-flag');assert.equal(B.state('portal','thinking'),'aperture-iris');assert.equal(B.state('steam','error'),'');
});

test('every surface loads the branded icons, with their credits and licences shipped',()=>{
 const manifest=JSON.parse(read('browser-extension/manifest.json'));
 const iso=manifest.content_scripts.flatMap(c=>c.js);
 assert.ok(iso.indexOf('ui-brand.js')>iso.indexOf('ui-logos.js')&&iso.indexOf('ui-brand.js')<iso.indexOf('theme-features.js'),'with the logos, before the theme features');
 assert.match(read('browser-extension/settings.html'),/<script src="ui-brand\.js"><\/script>/);
 assert.match(read('voice-app/native.html'),/<script src="ui-brand\.js"><\/script>/);
 assert.match(read('app/remote.cjs'),/'ui-brand\.js'/);assert.match(read('app/remote/remote.js'),/'ui-brand\.js'/);
 assert.match(read('app/steam-preload.cjs'),/\/\* ui-brand\.js \*\//);
 for(const f of ['CREDITS.md','Papirus-GPL-3.0.txt','Simple-Icons-CC0.txt','Font-Awesome-LICENSE.txt']){
  assert.ok(fs.existsSync(path.join(ROOT,'browser-extension/ui/brand',f)),f);assert.ok(fs.existsSync(path.join(ROOT,'app/companion/ui/brand',f)),'desktop: '+f);}
 assert.equal(read('app/companion/ui-brand.js'),read('browser-extension/ui-brand.js'));
 assert.equal(read('voice-app/ui-brand.js'),read('browser-extension/ui-brand.js'));
});

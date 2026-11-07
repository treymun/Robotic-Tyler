import test from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {createRequire} from 'node:module';
import fs from 'node:fs';
const require=createRequire(import.meta.url);
const {createAppearance}=require('../app/steam-appearance/controller.cjs');
const {stylesFor,cleanTheme}=require('../app/steam-appearance/styles.cjs');
const {sanitizeSettings,phoneHidden}=require('../app/guards.cjs');
const tick=()=>new Promise(r=>setTimeout(r,10));
const deferred=()=>{let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve};};
class Contents extends EventEmitter{
 url='https://steamcommunity.com/chat/';sheets=new Map();next=0;failRemove=false;failFull=false;
 isDestroyed(){return false;}getURL(){return this.url;}
 async insertCSS(css,options){assert.equal(options.cssOrigin,'author');if(this.failFull&&css==='full')throw Error('insert failed');const key=String(++this.next);this.sheets.set(key,css);return key;}
 async removeInsertedCSS(key){if(this.failRemove)throw Error('remove failed');this.sheets.delete(key);}
 navigate(url=this.url){this.emit('did-start-navigation',{},url,false,true);this.sheets.clear();this.url=url;this.emit('did-navigate',{},url);this.emit('did-finish-load');}
}
function setup(extra={}){const wc=new Contents(),state={ready:true,base:true,full:true};const controller=createAppearance(wc,{probe:async()=>({...state}),styles:()=>({colors:'colors',full:'full'}),delay:1,maxWaits:4,...extra});return {wc,state,controller};}
const prefs=(mode,theme='steam')=>({steamChatAppearance:mode,uiTheme:theme});

test('desktop modes, theme updates and Off remove both stylesheet keys',async()=>{
 const {wc,controller:c}=setup();
 await c.update(prefs(undefined));assert.equal(wc.sheets.size,0);
 await c.update(prefs('full','tf2'));assert.deepEqual([...wc.sheets.values()],['colors','full']);assert.equal(c.status().theme,'tf2');
 await c.update(prefs('colors','winxp'));assert.deepEqual([...wc.sheets.values()],['colors']);
 await c.update(prefs('full','minecraft'));assert.equal(wc.sheets.size,2);
 await c.update(prefs('off'));assert.equal(wc.sheets.size,0);assert.equal(c.status().effective,'off');await c.dispose();
});
test('login, store, payment and lookalike origins never receive CSS',async()=>{
 const {wc,controller:c}=setup();
 for(const url of ['https://steamcommunity.com/login/','https://store.steampowered.com/','https://checkout.steampowered.com/checkout/','https://steamcommunity.com.evil/chat/','http://steamcommunity.com/chat/']){wc.url=url;await c.update(prefs('full'));assert.equal(wc.sheets.size,0,url);}
 await c.dispose();
});
test('navigation/reload including voice-route reload reapplies preference; leaving chat removes styling',async()=>{
 const {wc,controller:c}=setup();await c.update(prefs('full'));
 wc.navigate();await tick();assert.equal(wc.sheets.size,2);
 wc.emit('did-navigate-in-page',{},wc.url+'#friends',true);await tick();assert.equal(wc.sheets.size,2);
 wc.navigate('https://steamcommunity.com/login/');await tick();assert.equal(wc.sheets.size,0);
 wc.navigate('https://steamcommunity.com/chat/');await tick();assert.equal(wc.sheets.size,2);await c.dispose();
});
test('Electron detail events for subframes and same-document navigation keep the chat sheets',async()=>{
 const {wc,controller:c}=setup();
 await c.update(prefs('full','tf2'));
 const applied=[...wc.sheets.keys()];
 wc.emit('did-start-navigation',{isMainFrame:false,isSameDocument:false});
 wc.emit('did-start-navigation',{isMainFrame:true,isSameDocument:true});
 await tick();
 assert.deepEqual([...wc.sheets.keys()],applied);
 assert.equal(c.status().effective,'full');
 await c.dispose();
});
test('loading does not trigger fallback and polling stops at a fixed bound',async()=>{
 let calls=0;const {wc,controller:c}=setup({probe:async()=>{calls++;return {ready:false,base:false,full:false};}});
 await c.update(prefs('full'));await new Promise(r=>setTimeout(r,40));assert.equal(wc.sheets.size,0);assert.ok(calls<=5);assert.equal(c.status().preferred,'full');
 await c.dispose();
});
test('missing required structure after ready uses Colors only, keeps preference, and never loops',async()=>{
 const {wc,state,controller:c}=setup();state.full=false;await c.update(prefs('full'));await new Promise(r=>setTimeout(r,40));
 assert.equal(c.status().preferred,'full');assert.equal(c.status().effective,'colors');assert.deepEqual([...wc.sheets.values()],['colors']);
 state.full=true;await c.update(prefs('full','tf2'));assert.equal(c.status().effective,'colors','latched for this document');
 wc.navigate();await tick();assert.equal(c.status().effective,'full','new document rechecks');
 state.base=false;await c.update(prefs('full'));assert.equal(c.status().effective,'off');assert.equal(wc.sheets.size,0);await c.dispose();
});
test('a pending probe cannot restyle a navigated page',async()=>{
 const gate=deferred();const {wc,controller:c}=setup({probe:()=>gate.promise});const job=c.update(prefs('full'));
 await tick();wc.navigate('https://steamcommunity.com/login/');gate.resolve({ready:true,base:true,full:true});await job;await tick();assert.equal(wc.sheets.size,0);await c.dispose();
});
test('rapid Full → Off while insertion is pending leaves no stale sheet',async()=>{
 const {wc,controller:c}=setup();const insert=wc.insertCSS.bind(wc),gate=deferred();let first=true;
 wc.insertCSS=async(...args)=>{const key=await insert(...args);if(first){first=false;await gate.promise;}return key;};
 const job=c.update(prefs('full'));await tick();const off=c.update(prefs('off'));gate.resolve();await job;await off;await tick();
 assert.equal(wc.sheets.size,0);assert.equal(c.status().effective,'off');await c.dispose();
});
test('Off cancels a slow readiness probe without waiting for Steam JavaScript',async()=>{
 const gate=deferred();const {wc,controller:c}=setup({probe:()=>gate.promise});
 const job=c.update(prefs('full'));await tick();await c.update(prefs('off'));await job;
 assert.equal(wc.sheets.size,0);assert.equal(c.status().effective,'off');gate.resolve({ready:true,base:true,full:true});await tick();assert.equal(wc.sheets.size,0);await c.dispose();
});
test('cancelled navigation does not lose the stylesheet keys needed by Off',async()=>{
 const {wc,controller:c}=setup();await c.update(prefs('full'));
 wc.emit('did-start-navigation',{},'https://steamcommunity.com/login/',false,true);
 await c.update(prefs('off'));assert.equal(wc.sheets.size,0);
 wc.emit('did-fail-load',{},-3,'aborted','https://steamcommunity.com/login/',true);await tick();assert.equal(wc.sheets.size,0);await c.dispose();
});
test('insertion and removal failures are contained, reported honestly, and recoverable',async()=>{
 const {wc,controller:c}=setup();wc.failFull=true;await c.update(prefs('full'));assert.equal(wc.sheets.size,0);assert.equal(c.status().effective,'off');
 wc.failFull=false;await c.update(prefs('full'));wc.failRemove=true;await c.update(prefs('off'));assert.equal(c.status().effective,'error');assert.equal(wc.sheets.size,2);
 wc.failRemove=false;await c.update(prefs('off'));assert.equal(wc.sheets.size,0);await c.dispose();
});
test('Settings validates modes and keeps the desktop-only choice off the phone',()=>{
 for(const value of ['off','colors','full','invalid',null,{},true])assert.equal(sanitizeSettings({steamChatAppearance:value}).steamChatAppearance,['colors','full'].includes(value)?value:'off');
 assert.ok(phoneHidden.has('steamChatAppearance'));
});
test('all 25 themes reuse existing tokens, use paint-only declarations and have no remote URLs',()=>{
 const themes=['steam',...fs.readdirSync(new URL('../browser-extension/ui/themes/',import.meta.url)).filter(f=>f.endsWith('.css')).map(f=>f.slice(0,-4))];assert.equal(themes.length,25);
 for(const theme of themes){const s=stylesFor(theme);assert.match(s.colors,/--rt-steam-rt-bg:/,theme);assert.match(s.full,/background/,theme);
  assert.doesNotMatch(s.colors+s.full,/(?:^|[;{])(?:font(?:-[\w-]+)?|(?:min-|max-)?(?:width|height)|padding|margin|display|position|overflow|transform|translate|content|opacity|border(?:-(?:width|radius|style))?|clip-path|pointer-events)\s*:/m,theme);
  const knownTabDividers=/\.chatTabList \.LUogGjb84qw-(?:::before|:last-of-type::after)/g;
  assert.doesNotMatch((s.colors+s.full).replace(knownTabDividers,''),/url\(["']?https?:|\*\s*\{|@import|::before|::after/,theme);
 }
 assert.equal(cleanTheme('../evil'),'steam');assert.equal(stylesFor('nonsense'),stylesFor('steam'));
});
test('only desktop Settings contains the controls; source Chrome and generated phone pages do not',()=>{
 const read=p=>fs.readFileSync(new URL('../'+p,import.meta.url),'utf8');
 assert.match(read('app/companion/settings.html'),/id="steamAppearanceMode"/);
 for(const file of ['browser-extension/settings.html','app/companion/phone-settings.html'])assert.doesNotMatch(read(file),/steamAppearanceMode|steam-appearance-settings/,file);
});

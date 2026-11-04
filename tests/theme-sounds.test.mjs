// v2.31: the themed soundboard defaults. Drives the real background script (in Node, as the desktop
// app runs it, so the packaged files are read from disk) with a mocked chrome API and storage.
// Mocked: no browser, no Steam, no audio output (the e2e tests decode and play the clips).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
const ROOT=path.resolve(import.meta.dirname,'..');
const manifest=JSON.parse(fs.readFileSync(path.join(ROOT,'assets/theme-sounds/manifest.json'),'utf8'));
const THEMES=['steam','classic','tf2','cs2','portal','cs16','hev','l4d','winxp','doom','quake','pipboy','combine','deadlock','minecraft','payday','dreamcast','gmod','ricochet','dod','rust','x360','ipod','msn','xmb'];
const NAMES=['Beep','Airhorn','Drumroll','Victory','Sad trombone','Alert','Coin','Jump','Laser','Countdown'];

const store={};let listener;
const area={get:async keys=>{const list=keys==null?Object.keys(store):typeof keys==='string'?[keys]:Array.isArray(keys)?keys:Object.keys(keys);return structuredClone(Object.fromEntries(list.filter(k=>k in store).map(k=>[k,store[k]])));},
 set:async values=>{Object.assign(store,structuredClone(values));},remove:async keys=>{for(const k of [].concat(keys))delete store[k];},setAccessLevel:async()=>{}};
const session={};
globalThis.chrome={action:{onClicked:{addListener(){}}},runtime:{onMessage:{addListener:fn=>{listener=fn;}},openOptionsPage(){}},
 storage:{local:area,session:{get:async k=>({[k]:session[k]}),set:async v=>Object.assign(session,v),remove:async k=>{delete session[k];}},onChanged:{addListener(){}}},
 tabs:{get:async id=>({id}),query:async()=>[],sendMessage:async()=>{},onRemoved:{addListener(){}}}};
globalThis.fetch=async url=>{throw Error('Unexpected fetch '+url);};
await import('../browser-extension/background.js');
const sender={tab:{id:7},url:'https://steamcommunity.com/chat/'};
const ask=message=>new Promise(resolve=>listener(message,sender,resolve));
await ask({type:'lease:claim'});
const play=async slot=>{const r=await ask({type:'soundboard:play',slot});assert.equal(r.ok,true,JSON.stringify(r));return r;};
const b64=file=>fs.readFileSync(path.join(ROOT,'browser-extension',file)).toString('base64');

// A saved soundboard as an existing user has it: two of their own clips after the ten, a trigger and
// a name of their own, an upload over pad 2, a renamed pad 1, a favourite, and a second bank.
const clip=(name,n)=>({audio:Buffer.from('ID3'+name+'x'.repeat(n)).toString('base64'),seconds:1.5,name});
const SAVED={soundboardSlots:{2:clip('My airhorn',40),11:clip('Bruh',30),12:clip('Wow',20)},soundboardLabels:{1:'Ping',11:'Bruh moment'},soundboardTriggers:{11:'bruh',3:'drums please'},boardFavorites:[11,4],
 'soundboardSlots:Inside jokes':{15:clip('Inside',10)},soundboardPreferences:{volume:.8,access:'everyone'}};

test('all 25 themes: pads 1–10 play the theme\'s packaged clip, with the clip contract and its level',async()=>{
 for(const k of Object.keys(store))delete store[k];
 for(const theme of THEMES){store.uiTheme=theme;const m=manifest.themes.find(t=>t.id===theme);
  for(let slot=1;slot<=10;slot++){const r=await play(slot),c=m.clips[slot-1];
   assert.equal(r.clip.audio,b64('sounds/themes/'+c.file.slice(6)),theme+' '+slot+': the packaged file, unchanged');
   assert.equal(r.clip.name,NAMES[slot-1],'the pad keeps its name');assert.equal(r.clip.level,3);assert.ok(Math.abs(r.clip.seconds-c.seconds)<.001);
   const ctx={};vm.createContext(ctx);ctx.globalThis=ctx;vm.runInContext(fs.readFileSync(path.join(ROOT,'browser-extension/soundboard-core.js'),'utf8'),ctx);
   assert.equal(ctx.TylerSoundboard.validClip(r.clip),true,'the same contract as an uploaded clip');}}
 store.uiTheme='not-a-theme';assert.equal((await play(1)).clip.audio,b64('sounds/themes/steam/01-beep.mp3'),'an unknown theme gets Steam\'s');
 delete store.uiTheme;assert.equal((await play(10)).clip.audio,b64('sounds/themes/steam/10-countdown.mp3'),'no theme saved yet: Steam');
});

test('sound 11 onward and your own clips stay the same in every theme; switching never writes storage',async()=>{
 for(const k of Object.keys(store))delete store[k];Object.assign(store,structuredClone(SAVED));
 const saved=JSON.stringify(Object.fromEntries(Object.entries(store).filter(([k])=>k!=='uiTheme')));
 let first=null;
 for(const theme of THEMES){store.uiTheme=theme;
  const list=await ask({type:'soundboard:list'});const shape=list.slots.map(s=>[s.slot,s.name,s.trigger,s.custom].join('|'));
  if(!first)first=shape;assert.deepEqual(shape,first,theme+': same pads, names, order and triggers');assert.deepEqual(list.favorites,[11,4]);
  assert.deepEqual(list.slots.filter(s=>s.cue).map(s=>s.slot),[1,3,4,5,6,7,8,9,10],theme+': the theme\'s sound on every built-in pad but your upload');
  assert.deepEqual(await play(11).then(r=>r.clip),SAVED.soundboardSlots[11],'sound 11: your clip, as saved');
  assert.deepEqual(await play(12).then(r=>r.clip),SAVED.soundboardSlots[12]);
  assert.deepEqual(await play(2).then(r=>r.clip),SAVED.soundboardSlots[2],'your upload over pad 2 wins in every theme');
  assert.equal((await play(1)).clip.name,'Ping','your name for pad 1 stays');assert.equal(list.slots[0].name,'Ping');
  assert.equal(list.preferences.volume,.8);}
 assert.equal(JSON.stringify(Object.fromEntries(Object.entries(store).filter(([k])=>k!=='uiTheme'))),saved,'nothing saved, renamed, reordered or removed');
 // The other bank: its built-in pads follow the theme too, its own clip stays.
 await ask({type:'soundboard:bank',bank:'Inside jokes'});store.uiTheme='doom';
 assert.equal((await play(1)).clip.audio,b64('sounds/themes/doom/01-beep.mp3'));assert.equal((await play(15)).clip.name,'Inside');
 await ask({type:'soundboard:bank',bank:'Arcade'});
 // Reset pad 2: back to the theme's sound. Slot 33 and an empty slot 13 are still refused.
 await ask({type:'soundboard:clear',slot:2});assert.equal((await play(2)).clip.audio,b64('sounds/themes/doom/02-airhorn.mp3'));
 assert.match((await ask({type:'soundboard:play',slot:13})).error,/Upload a clip/);assert.match((await ask({type:'soundboard:play',slot:33})).error,/1 to 32/);
});

test('an uploaded clip never keeps a level; the clip contract checks it',async()=>{
 store.uiTheme='steam';const up={...clip('Loud',10),level:12};
 assert.equal((await ask({type:'soundboard:save',slot:14,clip:up})).ok,true);assert.equal('level' in store.soundboardSlots[14],false);
 const ctx={};vm.createContext(ctx);ctx.globalThis=ctx;vm.runInContext(fs.readFileSync(path.join(ROOT,'browser-extension/soundboard-core.js'),'utf8'),ctx);const S=ctx.TylerSoundboard;
 assert.equal(S.validClip({...clip('a',1),level:3}),true);assert.equal(S.validClip({...clip('a',1),level:13}),false);assert.equal(S.validClip({...clip('a',1),level:'3'}),false);assert.equal(S.validClip(clip('a',1)),true);
 // Chat commands name the same pads: sound 1, sound 10, sound countdown, sound 11 when it exists, a trigger.
 const slots=[...NAMES.map((name,i)=>({slot:i+1,name})),{slot:11,name:'Bruh moment',trigger:'bruh'}];
 assert.deepEqual(['sound 1','sound 10','sound countdown','sound 11','bruh','sound 12'].map(t=>S.parse(t,slots)),[1,10,10,11,11,null]);
});

test('a missing packaged file falls back to the built-in tone instead of failing',async()=>{
 const file=path.join(ROOT,'browser-extension/sounds/themes/quake/07-coin.mp3'),keep=fs.readFileSync(file);
 fs.renameSync(file,file+'.away');
 try{store.uiTheme='quake';const r=await play(7);assert.equal(r.clip,null,'no clip: the player synthesizes the built-in Coin');assert.equal(r.slot,7);
  assert.ok((await play(8)).clip,'the theme\'s other pads still play');}
 finally{fs.renameSync(file+'.away',file);}
 assert.ok(fs.readFileSync(file).equals(keep));
});

test('the build ships the 250 clips and their credits on both surfaces, not the pack\'s sources or previews',()=>{
 const listed=manifest.themes.flatMap(t=>t.clips.map(c=>'sounds/themes/'+c.file.slice(6)));assert.equal(listed.length,250);
 for(const f of listed){assert.ok(fs.existsSync(path.join(ROOT,'browser-extension',f)),f);assert.ok(fs.existsSync(path.join(ROOT,'app/companion',f)),'desktop: '+f);}
 for(const f of ['sounds/CREDITS.md','sounds/SOUND-MAP.csv']){assert.ok(fs.existsSync(path.join(ROOT,'browser-extension',f)));assert.ok(fs.existsSync(path.join(ROOT,'app/companion',f)));}
 const walk=d=>fs.readdirSync(d,{withFileTypes:true}).flatMap(e=>e.isDirectory()?walk(path.join(d,e.name)):[path.join(d,e.name)]);
 const shipped=walk(path.join(ROOT,'browser-extension/sounds')).map(f=>path.relative(path.join(ROOT,'browser-extension'),f).split(path.sep).join('/'));
 assert.deepEqual(shipped.filter(f=>f.endsWith('.mp3')).sort(),[...listed].sort(),'only the 250 finished clips');
 assert.equal(fs.existsSync(path.join(ROOT,'assets/theme-sounds/previews')),false,'the audition previews stay out of the project');
 assert.ok(fs.existsSync(path.join(ROOT,'assets/theme-sounds/source-originals')),'the pack\'s sources are kept with it');
 // The desktop installer takes the app's own copy (app/companion/sounds) and leaves the source packs out.
 const files=JSON.parse(fs.readFileSync(path.join(ROOT,'electron-builder.desktop.json'),'utf8')).files;
 assert.ok(files.includes('app/**/*'));for(const pack of ['theme-sounds','theme-icons','theme-icons-pack-2'])assert.ok(files.includes('!assets/'+pack+'/**/*'),pack);
});

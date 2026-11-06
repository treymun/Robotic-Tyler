// End-to-end (v2.41): character voices in Settings and on the phone remote, in headless Chromium.
// MOCKED: the desktop app's main process (window.tylerSettings.voices answers from a stub), the voice
// engine (no audio is made), and the Steam window (the panel preview, tools/preview/panel.html, running the
// real panel scripts). Real: the Settings page as the desktop app ships it (app/companion/settings.html),
// the remote server (app/remote.cjs) over HTTP and the phone's page in a phone-sized Chromium.
// v2.43: the voice list the stub answers with is the real one: the app's own Voices (app/theme-voices) with
// its built-in clips and an empty data folder, i.e. no import at all.
// Not tested here: real inference, a real pack import on Windows, a real Steam call (see CHANGES.md).
import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const {chromium,devices}=require('playwright');
const {setupRemote}=require('../../app/remote.cjs');
const {memoryStorage}=require('../../app/vault.cjs');
const {Voices}=require('../../app/theme-voices/voices.cjs');
const os=require('node:os');
const ROOT=path.resolve(import.meta.dirname,'../..');
const types={'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.json':'application/json','.svg':'image/svg+xml','.png':'image/png','.webp':'image/webp','.woff2':'font/woff2','.wav':'audio/wav'};
const serve=()=>http.createServer((req,res)=>{const file=path.join(ROOT,decodeURIComponent(new URL(req.url,'http://x').pathname));if(!file.startsWith(ROOT)||!fs.existsSync(file)||fs.statSync(file).isDirectory()){res.writeHead(404);res.end();return;}res.writeHead(200,{'content-type':types[path.extname(file)]||'application/octet-stream'});fs.createReadStream(file).pipe(res);}).listen(0);
const CAT=JSON.parse(fs.readFileSync(path.join(ROOT,'app','theme-voices','characters.json'),'utf8'));
// v2.43: what the desktop app lists with no import (its built-in clips, an empty data folder), plus its store's status.
function builtinList(characters={tf2:'spy',l4d:'coach'},characterVersion={},sharper={},conversion=false){
 const v=new Voices({builtinDir:path.join(ROOT,'app','theme-voices','voices'),dataDir:fs.mkdtempSync(path.join(os.tmpdir(),'tyler-cv-e2e-'))});
 return {voices:v.list({characters,characterVersion,sharper,conversion}),characters:v.characters.status()};
}
// What the desktop app would list: the catalog's characters, all imported, Spy picked for TF2.
// The Settings page with the desktop app's main process stubbed: `voices` and `characters` are what it lists.
async function openSettings(browser,{voices,characters,importResult,conversion=null,device=undefined,deviceNote=null}){
 const p=await browser.newPage({viewport:{width:1280,height:1000}});const errors=[];p.on('pageerror',e=>{if(/theme-voice-settings/.test(String(e.stack)))errors.push(e.message);});
 await p.addInitScript(([voices,characters,importResult,conversion,device,deviceNote])=>{const store={uiTheme:'tf2'};const local={get:async k=>{const l=k==null?Object.keys(store):Array.isArray(k)?k:[k];return Object.fromEntries(l.filter(x=>x in store).map(x=>[x,store[x]]));},set:async v=>Object.assign(store,v),remove:async()=>{}};
  const st={installed:true,current:true,ready:true,mode:'light',modeChosen:true,modeLabel:'Lightweight',engine:'standard',models:{light:true},settings:{characters:{tf2:'spy'},builtinVersion:{},idleMinutes:5,chatCooldown:20},recommendation:{mode:'light',notes:[]},hardware:{cpu:{model:'CPU',threads:4},ram:{total:8e9},gpus:[]},conversion,deviceNote};if(device)st.settings.device=device;
  window.__calls=[];const flac='ZkxhQwAAACI=';
  window.tylerSettings={storage:{local},tabs:{create:async()=>{}},verifyKey:async()=>true,activity:async()=>[],ai:async()=>({ok:true}),onTheme:()=>{},onVoices:()=>{},remote:async()=>({}),voice:{devices:async()=>[],tone:async()=>'',test:async()=>({})},localAI:async()=>({status:{}}),onLocalAI:()=>{},
   voices:async(op,x={})=>{window.__calls.push([op,x]);if(op==='status')return {status:st,voices,characters,modes:{},models:{}};if(op==='plan')return {download:0};if(op==='native-status')return {windows:true};
    if(op==='settings'){Object.assign(st.settings.characters,x.values?.characters||{});for(const v of voices)if(x.values?.characters&&v.theme in x.values.characters)v.character=x.values.characters[v.theme];return st.settings;}
    if(op==='character-sample')return {audio:flac,type:'audio/flac',kind:'line',text:'The original line.'};if(op==='sample')return {audio:flac,type:'audio/flac',kind:'line'};
    if(op==='test')return {clip:{voiceName:x.character?'Scout':'The Administrator',seconds:1.5,ms:2000,device:'cpu',fallback:null},audio:'UklGRiQAAABXQVZFZm10IBAAAAABAAEAwF0AAIC7AAACABAAZGF0YQAAAAA='};
    if(op==='characters-import')return importResult;if(op==='characters-remove'){characters.extra={clips:0,bytes:0};return {};}return {};}};
  HTMLMediaElement.prototype.play=function(){return Promise.resolve();};},[voices,characters,importResult,conversion,device??null,deviceNote]);
 await p.goto(SITE()+'/app/companion/settings.html#theme-voices');
 await p.waitForFunction(()=>document.querySelectorAll('#tvChars .tv-voice').length>0&&!/Checking/.test(document.getElementById('tvCharState').textContent));
 return {p,errors,calls:()=>p.evaluate(()=>window.__calls)};
}
let site=null;const SITE=()=>'http://127.0.0.1:'+site.address().port;
const rowsOf=p=>p.evaluate(()=>[...document.querySelectorAll('#tvChars .tv-voice')].map(r=>({theme:r.dataset.theme,label:r.querySelector('label').textContent,value:r.querySelector('select').value,
 options:[...r.querySelector('select').options].map(o=>(o.disabled?'-':'')+o.textContent),note:r.querySelector('small').textContent,tag:r.querySelector('.tv-tag').textContent,buttons:[...r.querySelectorAll('button')].map(b=>b.textContent)})));

test('Settings → Theme voices → Character voices: built in, no import step: a selector per theme, original recording vs generated speech, the earlier version (real voice list, mocked main process)',{timeout:120000},async()=>{
 site=serve();const browser=await chromium.launch();
 try{
  const {voices,characters}=builtinList();
  const {p,errors,calls}=await openSettings(browser,{voices,characters,importResult:{imported:30,complete:30,needsSupplement:0,added:0,already:196,total:30,bytes:0,packs:[],failed:[],characters:[]}});
  assert.equal(await p.textContent('#tvCharState'),'30 character voices built in (29 offered) for 6 themes. Each theme keeps its own voice until you pick a character.');
  const rows=await rowsOf(p);
  assert.deepEqual(rows.map(r=>r.theme),[...new Set(CAT.characters.map(c=>c.theme))],'one selector per theme with characters (none for Steam)');
  const all=JSON.stringify(rows)+await p.textContent('#tvCharState');assert.doesNotMatch(all,/supplement|import|Not imported/i,'nothing asks for an import or the voice supplement');
  const tf2=rows.find(r=>r.theme==='tf2');assert.equal(tf2.value,'spy','the remembered choice');assert.equal(tf2.options[0],'The Administrator (theme default)');assert.match(tf2.label,/Character voice · Team Fortress 2/);
  assert.deepEqual(tf2.options.filter(o=>o.startsWith('-')),['-Pyro · not approved'],'every character but Pyro can be picked');assert.equal(tf2.tag,'Weak clone');
  assert.deepEqual(tf2.buttons,['Original recording','Generated speech']);
  const l4d=rows.find(r=>r.theme==='l4d');assert.equal(l4d.value,'coach');assert.equal(l4d.tag,'Ready','Coach speaks his improved version (ready)');
  assert.deepEqual(l4d.buttons,['Use the earlier version','Original recording','Generated speech'],'an improved voice can go back to its earlier version (under its note)');
  // The import is a second option now: below the selectors, and Remove only shows when imported copies exist.
  assert.equal(await p.evaluate(()=>{const a=document.getElementById('tvChars'),b=document.getElementById('tvCharImport');return !!(a.compareDocumentPosition(b)&Node.DOCUMENT_POSITION_FOLLOWING);}),true);
  assert.equal(await p.isVisible('#tvCharImport'),true);assert.equal(await p.isVisible('#tvCharRemove'),false);
  // Uses the page's existing classes only (no new CSS).
  assert.equal(await p.evaluate(()=>[...document.querySelectorAll('#tvChars *')].flatMap(e=>[...e.classList]).filter(c=>!['tv-voice','tv-tag','tv-buttons','secondary','actions','toggle'].includes(c)).length),0);
  await p.click('#tvChars .tv-voice[data-theme=l4d] button:text-is("Use the earlier version")');await p.waitForFunction(()=>/Coach uses its earlier version \(v1\) now/.test(document.getElementById('tvCharVoiceState').textContent));
  assert.deepEqual((await calls()).filter(c=>c[0]==='settings').at(-1)[1],{values:{characterVersion:{'l4d/coach':1}}});
  await p.selectOption('#tvChar-tf2','scout');await p.waitForFunction(()=>/now speaks as Scout/.test(document.getElementById('tvCharVoiceState').textContent));
  assert.deepEqual((await calls()).filter(c=>c[0]==='settings').at(-1)[1],{values:{characters:{tf2:'scout'}}});
  await p.click('#tvChars .tv-voice[data-theme=tf2] button:text-is("Original recording")');await p.waitForFunction(()=>/original recording.*not generated/.test(document.getElementById('tvCharVoiceState').textContent));
  assert.deepEqual((await calls()).at(-1),['character-sample',{theme:'tf2',character:'scout'}]);
  await p.click('#tvChars .tv-voice[data-theme=tf2] button:text-is("Generated speech")');await p.waitForFunction(()=>/generated speech \(made by the clone/.test(document.getElementById('tvCharVoiceState').textContent));
  const t=(await calls()).filter(c=>c[0]==='test').at(-1)[1];assert.equal(t.theme,'tf2');assert.equal(t.character,'scout');assert.equal(t.fresh,true);
  // The 25 voices' own Test always uses the theme's own voice, whatever character is picked.
  await p.click('#tvVoices .tv-voice[data-theme=tf2] button:text-is("Test")');await p.waitForTimeout(300);
  assert.equal((await calls()).filter(c=>c[0]==='test').at(-1)[1].character,'');
  // Importing the packs anyway: nothing is copied, and it says so next to the button.
  await p.click('#tvCharImport');assert.match(await p.textContent('#tvCharForm small'),/You don't need this: the recordings are built in/);
  await p.fill('#tvCharSource','"D:\\Downloads\\Robotic-Tyler-Character-Voice-Expansion.zip"');await p.click('#tvCharGo');
  await p.waitForFunction(()=>document.getElementById('tvCharVoiceState').textContent==='Nothing to import: the 196 recordings found there are already here, unchanged (built in, or imported before). Nothing was copied.');
  assert.deepEqual((await calls()).filter(c=>c[0]==='characters-import').at(-1)[1],{source:'D:\\Downloads\\Robotic-Tyler-Character-Voice-Expansion.zip'});
  assert.deepEqual(errors,[]);
 }finally{await browser.close();site.close();}
});

test('Settings → Character voices: a damaged built-in recording is said plainly (earlier version or theme voice), and Remove imported copies removes only an import (real voice list from a damaged copy, mocked main process)',{timeout:120000},async()=>{
 site=serve();const browser=await chromium.launch(),work=fs.mkdtempSync(path.join(os.tmpdir(),'tyler-cv-e2e-'));
 try{
  // A copy of the app's clips: one of Coach's version-2 clips damaged, and Scout's first clip damaged but repaired by an import.
  const bundle=path.join(work,'characters');fs.cpSync(path.join(ROOT,'app','theme-voices','characters'),bundle,{recursive:true});
  const coach=CAT.characters.find(c=>c.id==='coach'),[c1,c2]=coach.versions,only2=c2.clips.find(x=>!c1.clips.some(y=>y.sha256===x.sha256));fs.appendFileSync(path.join(bundle,'l4d','coach',only2.sha256+'.flac'),'x');
  const scout=CAT.characters.find(c=>c.id==='scout'),sx=scout.versions[0].clips[0],good=fs.readFileSync(path.join(bundle,'tf2','scout',sx.sha256+'.flac'));fs.appendFileSync(path.join(bundle,'tf2','scout',sx.sha256+'.flac'),'x');
  const pack=path.join(work,'Robotic-Tyler-Character-Voice-Expansion',...sx.file.split('/'));fs.mkdirSync(path.dirname(pack),{recursive:true});fs.writeFileSync(pack,good);
  const v=new Voices({builtinDir:path.join(ROOT,'app','theme-voices','voices'),dataDir:path.join(work,'data'),bundledDir:bundle});
  const imp=await v.characters.import(path.join(work,'Robotic-Tyler-Character-Voice-Expansion'));assert.equal(imp.added,1);
  const {p,errors,calls}=await openSettings(browser,{voices:v.list({characters:{tf2:'scout',l4d:'coach'}}),characters:v.characters.status(),importResult:{}});
  assert.equal(await p.textContent('#tvCharState'),'30 character voices built in (29 offered) for 6 themes. Each theme keeps its own voice until you pick a character. 1 has a missing or damaged built-in recording: run the Setup again to repair the app, or import the voice packs below. Until then it uses its earlier version or its theme’s own voice, and says so.');
  const rows=await rowsOf(p),l4d=rows.find(r=>r.theme==='l4d'),tf2=rows.find(r=>r.theme==='tf2');
  assert.match(l4d.note,/^Earlier version \(v1\): the improved version \(v2\) can’t be used \(one of its built-in recordings is damaged: run the Setup again to repair the app\)\./);
  assert.equal(tf2.value,'scout');assert.doesNotMatch(tf2.note,/damaged/,'Scout\'s import stands in for his damaged clip');
  assert.equal(await p.isVisible('#tvCharRemove'),true);assert.match(await p.textContent('#tvCharRemove'),/^Remove imported copies \(\d+ KB\)$/);
  await p.click('#tvCharRemove');assert.match(await p.textContent('#tvCharVoiceState'),/only the recordings you imported\. The built-in ones stay.*Press the button again/);
  assert.equal((await calls()).filter(c=>c[0]==='characters-remove').length,0);
  await p.click('#tvCharRemove');await p.waitForFunction(()=>/The imported copies were removed/.test(document.getElementById('tvCharVoiceState').textContent));
  assert.equal((await calls()).filter(c=>c[0]==='characters-remove').length,1);assert.equal(await p.isVisible('#tvCharRemove'),false);
  assert.deepEqual(errors,[]);
 }finally{await browser.close();site.close();fs.rmSync(work,{recursive:true,force:true});}
});

// v2.44: the optional sharper voice (voice conversion) for Medic, Lash and Kelvin.
const CONV={installed:false,current:false,download:1328180068,partial:0,free:41.2*1024**3,label:'Voice conversion for sharper character voices (kNN-VC)',ram:1.4e9,installing:null,error:null,characters:['tf2/medic','deadlock/kelvin','deadlock/lash']};
test('Settings → Theme voices: the sharper voice: its download (size and free space first, only on a press), a switch per character only for Medic, Lash and Kelvin, off by default, with what it costs and how it was measured (real voice list, mocked main process)',{timeout:120000},async()=>{
 site=serve();const browser=await chromium.launch();
 try{
  const {voices,characters}=builtinList({tf2:'medic',deadlock:'lash',l4d:'coach'},{},{'deadlock/lash':true},false);
  const {p,errors,calls}=await openSettings(browser,{voices,characters,importResult:{},conversion:CONV});
  await p.waitForFunction(()=>!/Checking/.test(document.getElementById('tvConvState').textContent));
  // The size and the free disk space come first; nothing is downloaded until the button is pressed.
  assert.equal(await p.textContent('#tvConvState'),'Not installed. The download is about 1.33 GB (WavLM-Large, 1.26 GB, and a 66 MB vocoder). 44.2 GB is free on the data drive.');
  assert.equal(await p.textContent('#tvConvInstall'),'Download voice conversion (1.33 GB)');assert.equal(await p.isVisible('#tvConvRemove'),false);
  assert.equal((await calls()).some(c=>/^conversion-install$/.test(c[0])),false,'never by itself');
  // A switch only in the rows whose picked character offers it (Medic, Lash), off unless saved on.
  const sw=await p.evaluate(()=>[...document.querySelectorAll('#tvChars .tv-voice')].map(r=>{const t=r.querySelector('label.toggle');return {theme:r.dataset.theme,toggle:!!t,checked:t?.querySelector('input').checked??null,title:t?.querySelector('b').textContent??null,note:t?.querySelector('small').textContent??null};}));
  const tf2=sw.find(r=>r.theme==='tf2'),dl=sw.find(r=>r.theme==='deadlock');
  assert.deepEqual(sw.filter(r=>r.toggle).map(r=>r.theme),['tf2','deadlock'],'Coach (Left 4 Dead) and the theme defaults have none');
  assert.equal(tf2.checked,false,'off by default');assert.equal(tf2.title,'Sharper voice (experimental)');
  for(const re of [/voice conversion/,/10 of Medic’s own recordings \(31 s, built in\)/,/voice conversion download below \(about 1\.33 GB\)/,/about 0\.35–0\.6 s more per second of speech on a processor/,/about 1\.7 GB more memory/,/16 kHz, resampled to 24 kHz/,/Measured closer/,/no one listened/])assert.match(tf2.note,re);
  assert.equal(dl.checked,true);assert.match(dl.note,/^Sharper voice is on, but voice conversion isn’t installed \(Settings → Theme voices\): the normal voice speaks\./);assert.match(dl.note,/Nearly: .*micro song/);
  assert.equal(await p.evaluate(()=>[...document.querySelectorAll('#tvChars *')].flatMap(e=>[...e.classList]).filter(c=>!['tv-voice','tv-tag','tv-buttons','secondary','actions','toggle'].includes(c)).length),0,'existing classes only');
  // Switching it on saves exactly that character's switch; the note says what it still needs.
  await p.click('#tvChars .tv-voice[data-theme=tf2] label.toggle input');await p.waitForFunction(()=>/Medic: sharper voice on\. It needs the voice conversion download below/.test(document.getElementById('tvCharVoiceState').textContent));
  assert.deepEqual((await calls()).filter(c=>c[0]==='settings').at(-1)[1],{values:{sharper:{'tf2/medic':true}}});
  // Download only on a press.
  await p.click('#tvConvInstall');await p.waitForFunction(()=>window.__calls.some(c=>c[0]==='conversion-install'));
  assert.equal((await calls()).filter(c=>c[0]==='install').length,0,'the theme-voice engine install isn\'t touched');
  assert.deepEqual(errors,[]);
 }finally{await browser.close();site.close();}
});
test('Settings → Theme voices: voice conversion installed: Remove asks twice and removes only it; a stopped download says it carries on (mocked main process)',{timeout:120000},async()=>{
 site=serve();const browser=await chromium.launch();
 try{
  const {voices,characters}=builtinList({tf2:'medic'},{},{'tf2/medic':true},true);
  let r=await openSettings(browser,{voices,characters,importResult:{},conversion:{...CONV,installed:true,current:true}});
  await r.p.waitForFunction(()=>/^Installed/.test(document.getElementById('tvConvState').textContent));
  assert.equal(await r.p.textContent('#tvConvState'),'Installed (1.33 GB). Switch the sharper voice on for Medic, Lash or Kelvin in their row above.');
  assert.equal(await r.p.isVisible('#tvConvInstall'),false);assert.equal(await r.p.textContent('#tvConvRemove'),'Remove voice conversion (1.33 GB)');
  const note=await r.p.evaluate(()=>document.querySelector('#tvChars .tv-voice[data-theme=tf2] label.toggle small').textContent);assert.match(note,/^Runs Medic’s generated speech/);assert.match(note,/\(installed\)/);
  await r.p.click('#tvConvRemove');assert.match(await r.p.textContent('#tvConvState'),/only voice conversion\. Your switches and everything else stay\. Press the button again/);
  assert.equal((await r.calls()).filter(c=>c[0]==='conversion-remove').length,0);
  await r.p.click('#tvConvRemove');await r.p.waitForFunction(()=>window.__calls.some(c=>c[0]==='conversion-remove'));
  assert.deepEqual(r.errors,[]);await r.p.close();
  r=await openSettings(browser,{voices,characters,importResult:{},conversion:{...CONV,partial:400e6}});
  await r.p.waitForFunction(()=>/carries on/.test(document.getElementById('tvConvState').textContent));
  assert.match(await r.p.textContent('#tvConvState'),/A stopped download already has 400 MB: it carries on from there\.$/);assert.equal(await r.p.textContent('#tvConvInstall'),'Download the rest of voice conversion (928 MB)');
  assert.deepEqual(r.errors,[]);
 }finally{await browser.close();site.close();}
});

// v2.44: "Runs on": all three choices offered and kept; the card-full note in the status line.
test('Settings → Theme voices → Runs on: the card, or the processor when it\'s full (the default); the card only; the processor only; the card-full note shows in the status (mocked main process)',{timeout:120000},async()=>{
 site=serve();const browser=await chromium.launch();
 try{
  const {voices,characters}=builtinList();const note='The graphics card was full (1.2 GB free, the voice needs about 4.0 GB), so this voice runs on the processor: much slower. The card is tried again the next time the engine starts.';
  let r=await openSettings(browser,{voices,characters,importResult:{},device:'cuda',deviceNote:note});
  assert.deepEqual(await r.p.evaluate(()=>[...document.getElementById('tvDevice').options].map(o=>[o.value,o.textContent])),
   [['auto','Graphics card, or the processor when it\'s full'],['cuda','Graphics card only (stops with a message if full)'],['cpu','Processor only (keeps the graphics card free)']]);
  assert.equal(await r.p.inputValue('#tvDevice'),'cuda','a saved "card only" is shown as it is (not turned into the default)');
  assert.match(await r.p.textContent('#tvDevice + small'),/checks the graphics card's free memory each time it loads the voice model.*runs on the processor instead, and Tyler says so/);
  await r.p.waitForFunction(()=>/^Installed/.test(document.getElementById('tvInstallState').textContent));
  assert.ok((await r.p.textContent('#tvInstallState')).includes(note),'the status line says why the voice runs on the processor');
  await r.p.selectOption('#tvDevice','cpu');await r.p.waitForFunction(()=>window.__calls.some(c=>c[0]==='settings'&&c[1].values?.device==='cpu'));
  await r.p.selectOption('#tvDevice','auto');await r.p.waitForFunction(()=>window.__calls.some(c=>c[0]==='settings'&&c[1].values?.device==='auto'));
  assert.deepEqual(r.errors,[]);await r.p.close();
  r=await openSettings(browser,{voices,characters,importResult:{}});assert.equal(await r.p.inputValue('#tvDevice'),'auto','the default');
  assert.deepEqual(r.errors,[]);
 }finally{await browser.close();site.close();}
});

test('phone remote: with no import, the Character voice selector lists every offered character, follows the theme and saves the choice on the PC (real voice list, mocked Steam window, real server, phone-sized Chromium)',{timeout:120000},async()=>{
 const files=serve(),browser=await chromium.launch(),errors=[];
 const pc=await (await browser.newContext({viewport:{width:1380,height:920}})).newPage();pc.on('pageerror',e=>errors.push('pc: '+e.message));
 let remote=null;
 try{
  await pc.goto('http://127.0.0.1:'+files.address().port+'/tools/preview/panel.html?theme=tf2&platform=desktop-voice');
  await pc.waitForFunction(()=>window.__tylerReady===true&&window.TylerRemote&&window.TylerThemeVoices);
  await pc.evaluate(voices=>{window.__results=[];window.__settings=[];handlers['remote:result']=m=>{window.__results.push(m);return {};};handlers['remote:event']=()=>({});
   const st={ready:true,installed:true,current:true,modeLabel:'Lightweight',mode:'light',settings:{followTheme:true,characters:{tf2:'spy'}},deviceNote:'The graphics card was full (1.2 GB free, the voice needs about 4.0 GB), so this voice runs on the processor: much slower. The card is tried again the next time the engine starts.'};
   handlers['voices:status']=()=>({available:true,status:st,voices});
   handlers['voices:settings']=m=>{window.__settings.push(m.values);for(const [t,id] of Object.entries(m.values.characters||{})){const v=voices.find(x=>x.theme===t);if(v)v.character=id;}return {};};},builtinList({tf2:'spy',l4d:'coach',deadlock:'lash'},{'l4d/coach':1},{'deadlock/lash':true},false).voices);
  await pc.evaluate(()=>TylerThemeVoices.refresh());
  const ask=(action,args={})=>pc.evaluate(async([action,args])=>{const id='t'+Math.random().toString(36).slice(2);for(const fn of listeners)fn({type:'remote:action',id,action,args});
   for(let i=0;i<250;i++){const r=window.__results.find(x=>x.id===id);if(r){if(!r.ok)throw Error(r.error);return r.data;}await new Promise(x=>setTimeout(x,20));}throw Error('no answer');},[action,args]);
  remote=setupRemote({vault:memoryStorage(),ask,pageDir:path.join(ROOT,'app','remote'),uiDir:path.join(ROOT,'app','companion','ui'),libDir:path.join(ROOT,'app','companion'),version:'2.41.0',theme:async()=>'tf2',prefs:{get:async()=>({theme:'tf2'}),theme:async()=>{},muteCall:async()=>{}}});
  const s=await remote.handle('enable'),base='http://127.0.0.1:'+s.port;
  const phone=await (await browser.newContext({...devices['iPhone 14']})).newPage();phone.on('pageerror',e=>errors.push('phone: '+e.message));
  const inPhone=async(fn,arg)=>{const r=await phone.evaluateHandle(()=>document.getElementById('tyler').shadowRoot);try{return await r.evaluate(fn,arg);}finally{await r.dispose();}};
  await phone.goto(base+'/');await phone.waitForFunction(()=>document.getElementById('tyler').shadowRoot?.getElementById('pairView')?.hidden===false);
  await inPhone((r,code)=>{r.getElementById('code').value=code;r.getElementById('pairForm').requestSubmit();},s.code);
  await phone.waitForFunction(()=>{const r=document.getElementById('tyler').shadowRoot;return r.getElementById('rmTvCard')&&!r.getElementById('rmTvCard').hidden&&!r.getElementById('rmTvCharField').hidden;},null,{timeout:30000});
  const opts=await inPhone(r=>({value:r.getElementById('rmTvChar').value,options:[...r.getElementById('rmTvChar').options].map(o=>o.value+':'+o.textContent),hint:r.getElementById('rmTvCharHint').textContent}));
  assert.equal(opts.value,'spy','the PC\'s saved choice for the theme on the PC');
  assert.deepEqual(opts.options,[':The Administrator (theme default)',...CAT.characters.filter(c=>c.theme==='tf2'&&c.id!=='pyro').map(c=>c.id+':'+c.name)],'every offered TF2 character, with no import (Pyro isn\'t offered)');
  assert.doesNotMatch(opts.hint,/supplement|import/i);
  await inPhone(r=>{const s=r.getElementById('rmTvChar');s.value='scout';s.dispatchEvent(new Event('change',{bubbles:true}));});
  await pc.waitForFunction(()=>window.__settings.length>0);
  assert.equal(JSON.stringify(await pc.evaluate(()=>window.__settings.at(-1))),JSON.stringify({characters:{tf2:'scout'}}));
  // Left 4 Dead: Coach is picked and set back to his earlier version on the PC; the phone says so under the selector.
  await inPhone(r=>{const s=r.getElementById('rmTvVoice');s.value='l4d';s.dispatchEvent(new Event('change',{bubbles:true}));});
  const l4d=await inPhone(r=>({value:r.getElementById('rmTvChar').value,n:r.getElementById('rmTvChar').options.length,hint:r.getElementById('rmTvCharHint').textContent}));
  assert.equal(l4d.value,'coach');assert.equal(l4d.n,4,'Bill (theme default), Coach, Ellis and Zoey');assert.match(l4d.hint,/Earlier version \(v1\), as you chose\. The improved version is v2\./);
  // v2.44: Deadlock: Lash's sharper voice is on but voice conversion isn't installed; the phone says the normal voice speaks.
  await inPhone(r=>{const s=r.getElementById('rmTvVoice');s.value='deadlock';s.dispatchEvent(new Event('change',{bubbles:true}));});
  const dl=await inPhone(r=>({value:r.getElementById('rmTvChar').value,hint:r.getElementById('rmTvCharHint').textContent}));
  assert.equal(dl.value,'lash');assert.match(dl.hint,/^Sharper voice is on, but voice conversion isn’t installed \(Settings → Theme voices\): the normal voice speaks\.$/);
  // v2.44: the card was full, so the voice runs on the processor: the phone's status line and the panel say so.
  await phone.waitForFunction(()=>/^The graphics card was full \(1\.2 GB free, the voice needs about 4\.0 GB\), so this voice runs on the processor: much slower\./.test(document.getElementById('tyler').shadowRoot.getElementById('rmTvState').textContent),null,{timeout:20000});
  await pc.waitForFunction(()=>/^Ready · Lightweight mode\. The graphics card was full \(1\.2 GB free/.test(document.getElementById('tyler-companion-root').shadowRoot.getElementById('tvStatus')?.textContent||''),null,{timeout:20000});
  // A theme without characters hides the selector.
  await inPhone(r=>{const s=r.getElementById('rmTvVoice');s.value='steam';s.dispatchEvent(new Event('change',{bubbles:true}));});
  assert.equal(await inPhone(r=>r.getElementById('rmTvCharField').hidden),true);
  assert.deepEqual(errors,[]);
 }finally{await remote?.stop();await browser.close();files.close();}
});

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
function builtinList(characters={tf2:'spy',l4d:'coach'},characterVersion={}){
 const v=new Voices({builtinDir:path.join(ROOT,'app','theme-voices','voices'),dataDir:fs.mkdtempSync(path.join(os.tmpdir(),'tyler-cv-e2e-'))});
 return {voices:v.list({characters,characterVersion}),characters:v.characters.status()};
}
// What the desktop app would list: the catalog's characters, all imported, Spy picked for TF2.
// The Settings page with the desktop app's main process stubbed: `voices` and `characters` are what it lists.
async function openSettings(browser,{voices,characters,importResult}){
 const p=await browser.newPage({viewport:{width:1280,height:1000}});const errors=[];p.on('pageerror',e=>{if(/theme-voice-settings/.test(String(e.stack)))errors.push(e.message);});
 await p.addInitScript(([voices,characters,importResult])=>{const store={uiTheme:'tf2'};const local={get:async k=>{const l=k==null?Object.keys(store):Array.isArray(k)?k:[k];return Object.fromEntries(l.filter(x=>x in store).map(x=>[x,store[x]]));},set:async v=>Object.assign(store,v),remove:async()=>{}};
  const st={installed:true,current:true,ready:true,mode:'light',modeChosen:true,modeLabel:'Lightweight',engine:'standard',models:{light:true},settings:{characters:{tf2:'spy'},builtinVersion:{},idleMinutes:5,chatCooldown:20},recommendation:{mode:'light',notes:[]},hardware:{cpu:{model:'CPU',threads:4},ram:{total:8e9},gpus:[]}};
  window.__calls=[];const flac='ZkxhQwAAACI=';
  window.tylerSettings={storage:{local},tabs:{create:async()=>{}},verifyKey:async()=>true,activity:async()=>[],ai:async()=>({ok:true}),onTheme:()=>{},onVoices:()=>{},remote:async()=>({}),voice:{devices:async()=>[],tone:async()=>'',test:async()=>({})},localAI:async()=>({status:{}}),onLocalAI:()=>{},
   voices:async(op,x={})=>{window.__calls.push([op,x]);if(op==='status')return {status:st,voices,characters,modes:{},models:{}};if(op==='plan')return {download:0};if(op==='native-status')return {windows:true};
    if(op==='settings'){Object.assign(st.settings.characters,x.values?.characters||{});for(const v of voices)if(x.values?.characters&&v.theme in x.values.characters)v.character=x.values.characters[v.theme];return st.settings;}
    if(op==='character-sample')return {audio:flac,type:'audio/flac',kind:'line',text:'The original line.'};if(op==='sample')return {audio:flac,type:'audio/flac',kind:'line'};
    if(op==='test')return {clip:{voiceName:x.character?'Scout':'The Administrator',seconds:1.5,ms:2000,device:'cpu',fallback:null},audio:'UklGRiQAAABXQVZFZm10IBAAAAABAAEAwF0AAIC7AAACABAAZGF0YQAAAAA='};
    if(op==='characters-import')return importResult;if(op==='characters-remove'){characters.extra={clips:0,bytes:0};return {};}return {};}};
  HTMLMediaElement.prototype.play=function(){return Promise.resolve();};},[voices,characters,importResult]);
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
  assert.equal(await p.evaluate(()=>[...document.querySelectorAll('#tvChars *')].flatMap(e=>[...e.classList]).filter(c=>!['tv-voice','tv-tag','tv-buttons','secondary','actions'].includes(c)).length),0);
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

test('phone remote: with no import, the Character voice selector lists every offered character, follows the theme and saves the choice on the PC (real voice list, mocked Steam window, real server, phone-sized Chromium)',{timeout:120000},async()=>{
 const files=serve(),browser=await chromium.launch(),errors=[];
 const pc=await (await browser.newContext({viewport:{width:1380,height:920}})).newPage();pc.on('pageerror',e=>errors.push('pc: '+e.message));
 let remote=null;
 try{
  await pc.goto('http://127.0.0.1:'+files.address().port+'/tools/preview/panel.html?theme=tf2&platform=desktop-voice');
  await pc.waitForFunction(()=>window.__tylerReady===true&&window.TylerRemote&&window.TylerThemeVoices);
  await pc.evaluate(voices=>{window.__results=[];window.__settings=[];handlers['remote:result']=m=>{window.__results.push(m);return {};};handlers['remote:event']=()=>({});
   const st={ready:true,installed:true,current:true,modeLabel:'Lightweight',mode:'light',settings:{followTheme:true,characters:{tf2:'spy'}}};
   handlers['voices:status']=()=>({available:true,status:st,voices});
   handlers['voices:settings']=m=>{window.__settings.push(m.values);for(const [t,id] of Object.entries(m.values.characters||{})){const v=voices.find(x=>x.theme===t);if(v)v.character=id;}return {};};},builtinList({tf2:'spy',l4d:'coach'},{'l4d/coach':1}).voices);
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
  // A theme without characters hides the selector.
  await inPhone(r=>{const s=r.getElementById('rmTvVoice');s.value='steam';s.dispatchEvent(new Event('change',{bubbles:true}));});
  assert.equal(await inPhone(r=>r.getElementById('rmTvCharField').hidden),true);
  assert.deepEqual(errors,[]);
 }finally{await remote?.stop();await browser.close();files.close();}
});

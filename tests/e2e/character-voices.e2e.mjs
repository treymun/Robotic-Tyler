// End-to-end (v2.41): character voices in Settings and on the phone remote, in headless Chromium.
// MOCKED: the desktop app's main process (window.tylerSettings.voices answers from a stub), the voice
// engine (no audio is made), and the Steam window (the panel preview, tools/preview/panel.html, running the
// real panel scripts). Real: the Settings page as the desktop app ships it (app/companion/settings.html),
// the remote server (app/remote.cjs) over HTTP and the phone's page in a phone-sized Chromium.
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
const ROOT=path.resolve(import.meta.dirname,'../..');
const types={'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.json':'application/json','.svg':'image/svg+xml','.png':'image/png','.webp':'image/webp','.woff2':'font/woff2','.wav':'audio/wav'};
const serve=()=>http.createServer((req,res)=>{const file=path.join(ROOT,decodeURIComponent(new URL(req.url,'http://x').pathname));if(!file.startsWith(ROOT)||!fs.existsSync(file)||fs.statSync(file).isDirectory()){res.writeHead(404);res.end();return;}res.writeHead(200,{'content-type':types[path.extname(file)]||'application/octet-stream'});fs.createReadStream(file).pipe(res);}).listen(0);
const CAT=JSON.parse(fs.readFileSync(path.join(ROOT,'app','theme-voices','characters.json'),'utf8'));
// What the desktop app would list: the catalog's characters, all imported, Spy picked for TF2.
function voiceList(pick={tf2:'spy'}){
 const themes=[...new Set(CAT.characters.map(c=>c.theme))];
 const own={tf2:'The Administrator',cs2:'SAS operator',portal:'GLaDOS',l4d:'Bill',deadlock:'Bebop',gmod:'Dr. Kleiner',steam:'G-Man'};
 return ['steam',...themes].map(t=>({theme:t,name:own[t]||t,status:'ready',statusLabel:'Ready',hasReference:true,versions:[1],version:1,sample:'A line.',
  ...(t==='steam'?{}:{characters:CAT.characters.filter(c=>c.theme===t).map(c=>({id:c.id,name:c.name,status:c.status,statusNote:'',imported:true,approved:true,usable:true,problem:null,hasPreview:true,previewText:'Line.',nonlexical:!!c.nonlexical})),character:pick[t]||''})}));
}

test('Settings → Theme voices → Character voices: a selector per theme, original recording vs generated speech, import and remove (mocked main process)',{timeout:120000},async()=>{
 const files=serve(),browser=await chromium.launch();
 try{
  // Only this page's theme-voice script counts: the stub doesn't answer the other sections (AI on this PC…) fully.
  const p=await browser.newPage({viewport:{width:1280,height:1000}});const errors=[];p.on('pageerror',e=>{if(/theme-voice-settings/.test(String(e.stack)))errors.push(e.message);});
  await p.addInitScript(([voices])=>{const store={uiTheme:'tf2'};const local={get:async k=>{const l=k==null?Object.keys(store):Array.isArray(k)?k:[k];return Object.fromEntries(l.filter(x=>x in store).map(x=>[x,store[x]]));},set:async v=>Object.assign(store,v),remove:async()=>{}};
   const st={installed:true,current:true,ready:true,mode:'light',modeChosen:true,modeLabel:'Lightweight',engine:'standard',models:{light:true},settings:{characters:{tf2:'spy'},builtinVersion:{},idleMinutes:5,chatCooldown:20},recommendation:{mode:'light',notes:[]},hardware:{cpu:{model:'CPU',threads:4},ram:{total:8e9},gpus:[]}};
   window.__calls=[];const flac='ZkxhQwAAACI=';
   window.tylerSettings={storage:{local},tabs:{create:async()=>{}},verifyKey:async()=>true,activity:async()=>[],ai:async()=>({ok:true}),onTheme:()=>{},onVoices:()=>{},remote:async()=>({}),voice:{devices:async()=>[],tone:async()=>'',test:async()=>({})},localAI:async()=>({status:{}}),onLocalAI:()=>{},
    voices:async(op,x={})=>{window.__calls.push([op,x]);if(op==='status')return {status:st,voices,modes:{},models:{}};if(op==='plan')return {download:0};if(op==='native-status')return {windows:true};
     if(op==='settings'){Object.assign(st.settings.characters,x.values?.characters||{});for(const v of voices)if(x.values?.characters&&v.theme in x.values.characters)v.character=x.values.characters[v.theme];return st.settings;}
     if(op==='character-sample')return {audio:flac,type:'audio/flac',kind:'line',text:'The original line.'};if(op==='sample')return {audio:flac,type:'audio/flac',kind:'line'};
     if(op==='test')return {clip:{voiceName:x.character?'Spy':'The Administrator',seconds:1.5,ms:2000,device:'cpu',fallback:null},audio:'UklGRiQAAABXQVZFZm10IBAAAAABAAEAwF0AAIC7AAACABAAZGF0YQAAAAA='};
     if(op==='characters-import')return {imported:30,total:30,bytes:12e6,failed:[],characters:[]};return {};}};
   HTMLMediaElement.prototype.play=function(){return Promise.resolve();};},[voiceList()]);
  await p.goto('http://127.0.0.1:'+files.address().port+'/app/companion/settings.html#theme-voices');
  await p.waitForFunction(()=>document.querySelectorAll('#tvChars .tv-voice').length>0);
  const rows=await p.evaluate(()=>[...document.querySelectorAll('#tvChars .tv-voice')].map(r=>({theme:r.dataset.theme,label:r.querySelector('label').textContent,value:r.querySelector('select').value,first:r.querySelector('select').options[0].textContent,buttons:[...r.querySelectorAll('button')].map(b=>b.textContent)})));
  assert.deepEqual(rows.map(r=>r.theme),[...new Set(CAT.characters.map(c=>c.theme))],'one selector per theme with characters (none for Steam)');
  const tf2=rows.find(r=>r.theme==='tf2');assert.equal(tf2.value,'spy','the remembered choice');assert.equal(tf2.first,'The Administrator (theme default)');assert.match(tf2.label,/Character voice · Team Fortress 2/);
  assert.deepEqual(tf2.buttons,['Original recording','Generated speech']);
  // Uses the page's existing classes only (no new CSS).
  assert.equal(await p.evaluate(()=>[...document.querySelectorAll('#tvChars *')].flatMap(e=>[...e.classList]).filter(c=>!['tv-voice','tv-tag','tv-buttons','secondary'].includes(c)).length),0);
  await p.selectOption('#tvChar-tf2','scout');await p.waitForFunction(()=>/now speaks as Scout/.test(document.getElementById('tvCharVoiceState').textContent));
  let calls=await p.evaluate(()=>window.__calls);assert.deepEqual(calls.filter(c=>c[0]==='settings').at(-1)[1],{values:{characters:{tf2:'scout'}}});
  await p.click('#tvChars .tv-voice[data-theme=tf2] button:text-is("Original recording")');await p.waitForFunction(()=>/original recording.*not generated/.test(document.getElementById('tvCharVoiceState').textContent));
  calls=await p.evaluate(()=>window.__calls);assert.deepEqual(calls.at(-1),['character-sample',{theme:'tf2',character:'scout'}]);
  await p.click('#tvChars .tv-voice[data-theme=tf2] button:text-is("Generated speech")');await p.waitForFunction(()=>/generated speech \(made by the clone/.test(document.getElementById('tvCharVoiceState').textContent));
  calls=await p.evaluate(()=>window.__calls);const t=calls.filter(c=>c[0]==='test').at(-1)[1];assert.equal(t.theme,'tf2');assert.equal(t.character,'scout');assert.equal(t.fresh,true);
  // The 25 voices' own Test always uses the theme's own voice, whatever character is picked.
  await p.click('#tvVoices .tv-voice[data-theme=tf2] button:text-is("Test")');await p.waitForTimeout(300);
  calls=await p.evaluate(()=>window.__calls);assert.equal(calls.filter(c=>c[0]==='test').at(-1)[1].character,'');
  // Import from a path, then remove (asks twice).
  await p.click('#tvCharImport');await p.fill('#tvCharSource','"D:\\Downloads\\Robotic-Tyler-Character-Voice-Expansion.zip"');await p.click('#tvCharGo');
  await p.waitForFunction(()=>/Imported 30 of 30 character voices/.test(document.getElementById('tvCharState').textContent));
  calls=await p.evaluate(()=>window.__calls);assert.deepEqual(calls.filter(c=>c[0]==='characters-import').at(-1)[1],{source:'D:\\Downloads\\Robotic-Tyler-Character-Voice-Expansion.zip'});
  await p.click('#tvCharRemove');assert.match(await p.textContent('#tvCharState'),/Press the button again/);assert.equal((await p.evaluate(()=>window.__calls)).filter(c=>c[0]==='characters-remove').length,0);
  await p.click('#tvCharRemove');await p.waitForTimeout(200);assert.equal((await p.evaluate(()=>window.__calls)).filter(c=>c[0]==='characters-remove').length,1);
  assert.deepEqual(errors,[]);
 }finally{await browser.close();files.close();}
});

test('phone remote: the Character voice selector follows the theme and saves the choice on the PC (mocked Steam window, real server, phone-sized Chromium)',{timeout:120000},async()=>{
 const files=serve(),browser=await chromium.launch(),errors=[];
 const pc=await (await browser.newContext({viewport:{width:1380,height:920}})).newPage();pc.on('pageerror',e=>errors.push('pc: '+e.message));
 let remote=null;
 try{
  await pc.goto('http://127.0.0.1:'+files.address().port+'/tools/preview/panel.html?theme=tf2&platform=desktop-voice');
  await pc.waitForFunction(()=>window.__tylerReady===true&&window.TylerRemote&&window.TylerThemeVoices);
  await pc.evaluate(voices=>{window.__results=[];window.__settings=[];handlers['remote:result']=m=>{window.__results.push(m);return {};};handlers['remote:event']=()=>({});
   const st={ready:true,installed:true,current:true,modeLabel:'Lightweight',mode:'light',settings:{followTheme:true,characters:{tf2:'spy'}}};
   handlers['voices:status']=()=>({available:true,status:st,voices});
   handlers['voices:settings']=m=>{window.__settings.push(m.values);for(const [t,id] of Object.entries(m.values.characters||{})){const v=voices.find(x=>x.theme===t);if(v)v.character=id;}return {};};},voiceList());
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
  const opts=await inPhone(r=>({value:r.getElementById('rmTvChar').value,options:[...r.getElementById('rmTvChar').options].map(o=>o.value+':'+o.textContent)}));
  assert.equal(opts.value,'spy','the PC\'s saved choice for the theme on the PC');assert.equal(opts.options[0],':The Administrator (theme default)');assert.ok(opts.options.includes('scout:Scout'));
  await inPhone(r=>{const s=r.getElementById('rmTvChar');s.value='scout';s.dispatchEvent(new Event('change',{bubbles:true}));});
  await pc.waitForFunction(()=>window.__settings.length>0);
  assert.equal(JSON.stringify(await pc.evaluate(()=>window.__settings.at(-1))),JSON.stringify({characters:{tf2:'scout'}}));
  // A theme without characters hides the selector.
  await inPhone(r=>{const s=r.getElementById('rmTvVoice');s.value='steam';s.dispatchEvent(new Event('change',{bubbles:true}));});
  assert.equal(await inPhone(r=>r.getElementById('rmTvCharField').hidden),true);
  assert.deepEqual(errors,[]);
 }finally{await remote?.stop();await browser.close();files.close();}
});

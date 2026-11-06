// v2.41: Settings from the phone remote (app/remote.cjs /settings/*, app/guards.cjs phone lists).
// MOCKED: the desktop app's store (a memory vault behind the same read/write/remove the main process
// passes in) and the Steam window. Real: the remote server over HTTP on 127.0.0.1, pairing, the phone
// lists and sanitizeSettings. Not tested here: a real phone, Windows' firewall, the Electron IPC to an
// open Settings window (tools/desktop-voice-check covers the app starting with this code).
import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const {setupRemote}=require('../app/remote.cjs');
const {memoryStorage}=require('../app/vault.cjs');
const guards=require('../app/guards.cjs');
const ROOT=path.resolve(import.meta.dirname,'..');
const H={'content-type':'application/json','x-tyler-remote':'1'};
const SECRETS={openrouterKey:'sk-or-v1-0123456789abcdefSECRET',geminiKey:'AIzaSyPHONETESTSECRET0123456789',veniceKey:'VENICEPHONETESTSECRET_0123456789',speechKey:'speech-PHONE-TEST-SECRET-42'};
const leaks=text=>Object.values(SECRETS).filter(v=>String(text).includes(v));

function request(port,{method='GET',path:p='/',headers={},body}={}){
 return new Promise((resolve,reject)=>{const req=http.request({host:'127.0.0.1',port,method,path:p,headers:{host:'127.0.0.1:'+port,...headers}},res=>{const parts=[];res.on('data',c=>parts.push(c));res.on('end',()=>{const text=Buffer.concat(parts).toString();let json=null;try{json=JSON.parse(text);}catch{}resolve({status:res.statusCode,headers:res.headers,text,json});});});
  req.on('error',reject);if(body!==undefined)req.write(typeof body==='string'?body:JSON.stringify(body));req.end();});
}
const sleep=ms=>new Promise(r=>setTimeout(r,ms));

/** The remote with a store like the desktop app's: the PC's settings, API keys and the remote's own config. */
async function setup(extra={}){
 const vault=memoryStorage(),logs=[],calls={read:0,write:[],remove:[]};
 await vault.set({...SECRETS,uiTheme:'tf2',personality:'Original personality',aiProvider:'gemini',talkativeness:'active',usage:{requests:3,reportedCostUSD:0.01},settingsDraft:{at:Date.now(),values:{personality:'draft'}},tylerLifetime:{sessions:4},voiceImport:{at:1},voiceOutputDevice:'{0.0.1}.{cable}',...extra});
 const remote=setupRemote({vault,log:(k,d)=>logs.push([k,d]),ask:async a=>a==='state'?{ready:true,state:'ready'}:{},pageDir:path.join(ROOT,'app','remote'),uiDir:path.join(ROOT,'app','companion','ui'),libDir:path.join(ROOT,'app','companion'),version:'9.9.9',
  settings:{read:async k=>{calls.read++;return vault.get(k);},write:async v=>{calls.write.push(v);await vault.set(v);},remove:async k=>{calls.remove.push(k);await vault.remove(k);}}});
 const s=await remote.handle('enable'),port=s.port;
 const pair=async()=>{const ok=await request(port,{method:'POST',path:'/pair',headers:H,body:{code:(await remote.handle('new-code')).code}});return String(ok.headers['set-cookie']).split(';')[0];};
 const post=(cookie,p,body)=>request(port,{method:'POST',path:p,headers:{...H,...(cookie?{cookie}:{})},body});
 return {vault,logs,calls,remote,port,pair,post,async close(){await remote.stop();}};
}

test('phone lists: every setting has exactly one place; keys are never on the phone',()=>{
 const {settingsKeys,secretKeys,phoneWritable,phoneReadOnly,phoneHidden,phoneRemovable,phoneReadable}=guards;
 for(const k of settingsKeys){const places=[secretKeys,phoneWritable,phoneReadOnly,phoneHidden].filter(s=>s.has(k)).length;assert.equal(places,1,k+' must be in exactly one phone list');}
 for(const s of [secretKeys,phoneWritable,phoneReadOnly,phoneHidden])for(const k of s)assert.ok(settingsKeys.has(k),k+' is a settings key');
 for(const k of ['openrouterKey','geminiKey','veniceKey','speechKey']){assert.ok(secretKeys.has(k));assert.equal(phoneReadable(k),false);assert.equal(phoneWritable.has(k),false);assert.equal(phoneRemovable.has(k),false);}
 // Anything named like a credential is a secret.
 for(const k of settingsKeys)if(/key$|token|secret|password/i.test(k))assert.ok(secretKeys.has(k),k+' looks like a credential');
 for(const k of ['remoteControl','remoteDevices','settingsDraft','voiceImport'])assert.equal(phoneWritable.has(k)||phoneReadable(k),false,k);
 assert.deepEqual([...phoneRemovable],['tylerLifetime']);
});

test('unpaired: Settings and its storage are refused and nothing is read or leaks',async()=>{
 const t=await setup();
 try{
  const page=await request(t.port,{path:'/settings/'});assert.equal(page.status,303);assert.equal(page.headers.location,'/','an unpaired phone goes to the pairing screen');
  assert.equal((await request(t.port,{path:'/settings'})).status,308);
  for(const [p,body] of [['/settings/get',{keys:['personality','openrouterKey']}],['/settings/set',{values:{personality:'hacked'}}],['/settings/remove',{keys:['tylerLifetime']}]]){
   const r=await t.post('',p,body);assert.equal(r.status,401,p);assert.deepEqual(Object.keys(r.json),['error','pair']);assert.deepEqual(leaks(r.text),[]);
   const bad=await t.post('rt_remote=abcd.wrongkey',p,body);assert.equal(bad.status,401,p+' with a made-up cookie');
  }
  // Without the remote's header (a form or page elsewhere): refused before anything else.
  assert.equal((await request(t.port,{method:'POST',path:'/settings/set',headers:{'content-type':'application/json'},body:{values:{personality:'x'}}})).status,403);
  assert.equal(t.calls.read,0,'the store was never read');assert.equal(t.calls.write.length,0);
  assert.equal((await t.vault.get('personality')).personality,'Original personality');
 }finally{await t.close();}
});

test('paired: reading shows settings, never a key (only whether one is saved)',async()=>{
 const t=await setup();
 try{
  const cookie=await t.pair();
  const r=await t.post(cookie,'/settings/get',{keys:['personality','uiTheme','usage','voiceOutputDevice','openrouterKey','geminiKey','veniceKey','speechKey','settingsDraft','tylerLifetime','voiceImport','remoteControl','remoteDevices','nonsense']});
  assert.equal(r.status,200);const v=r.json.values;
  assert.equal(v.personality,'Original personality');assert.equal(v.uiTheme,'tf2');assert.equal(v.usage.requests,3,'usage is shown');assert.equal(v.voiceOutputDevice,'{0.0.1}.{cable}');
  assert.equal(v.openrouterKey,true);assert.equal(v.geminiKey,true);assert.equal(v.veniceKey,true);
  for(const k of ['speechKey','settingsDraft','tylerLifetime','voiceImport','remoteControl','remoteDevices','nonsense'])assert.equal(k in v,false,k);
  assert.deepEqual(leaks(r.text),[],'no key value in the answer');
  // A key that isn't saved isn't reported.
  await t.vault.remove(['geminiKey']);assert.equal('geminiKey' in (await t.post(cookie,'/settings/get',{keys:['geminiKey']})).json.values,false);
  // The rest of the remote never carries one either.
  for(const p of ['/state','/whoami'])assert.deepEqual(leaks((await request(t.port,{path:p,headers:{cookie}})).text),[],p);
  assert.equal((await t.post(cookie,'/settings/get',{keys:Array.from({length:200},(_,i)=>'k'+i)})).status,400,'a sensible number of keys');
  assert.equal((await t.post(cookie,'/settings/get',{keys:[{}]})).status,400);
 }finally{await t.close();}
});

test('paired: writes go through sanitizeSettings into the store; keys and remote settings can\'t be changed',async()=>{
 const t=await setup();
 try{
  const cookie=await t.pair(),get=async k=>(await t.vault.get(k))[k];
  // A secret anywhere in the request refuses all of it, and says why.
  let r=await t.post(cookie,'/settings/set',{values:{personality:'New one',openrouterKey:'sk-or-v1-attacker'}});
  assert.equal(r.status,403);assert.match(r.json.error,/API keys .* on your PC/);assert.deepEqual(r.json.refused,['openrouterKey']);
  assert.equal(await get('personality'),'Original personality','nothing was saved');assert.equal(await get('openrouterKey'),SECRETS.openrouterKey);
  for(const k of ['geminiKey','veniceKey','speechKey']){r=await t.post(cookie,'/settings/set',{values:{[k]:'replaced-from-phone-1234567890'}});assert.equal(r.status,403,k);assert.equal(await get(k),SECRETS[k],k);}
  await sleep(1100);
  // Removing a key: refused too.
  r=await t.post(cookie,'/settings/remove',{keys:['openrouterKey','geminiKey','veniceKey','speechKey']});assert.equal(r.status,403);assert.match(r.json.error,/on your PC/);
  for(const k of Object.keys(SECRETS))assert.equal(await get(k),SECRETS[k]);
  assert.equal(t.calls.write.length+t.calls.remove.length,0);
  // The rest: unknown, remote and pairing, draft and read-only keys are dropped; values are checked as on the PC.
  r=await t.post(cookie,'/settings/set',{values:{personality:'From the phone',aiProvider:'evil',speechEngine:'??',talkativeness:'active',quickSetup:{botName:'Tyler',mode:'voice',notices:['chat:1','bad'],evil:true},
   remoteControl:{on:true,away:true},remoteDevices:[],settingsDraft:{values:{}},usage:{requests:0},voiceOutputDevice:'other',tylerLifetime:{},madeUp:1}});
  assert.equal(r.status,200);
  assert.deepEqual(r.json.saved.sort(),['aiProvider','personality','quickSetup','speechEngine'].sort(),'only what changed (talkativeness was already active)');
  assert.deepEqual(r.json.dropped.sort(),['madeUp','remoteControl','remoteDevices','settingsDraft','tylerLifetime','usage','voiceOutputDevice'].sort());
  assert.equal(await get('personality'),'From the phone');assert.equal(await get('aiProvider'),'openrouter','sanitizeSettings: an unknown provider is OpenRouter');assert.equal(await get('speechEngine'),'cloud');
  assert.deepEqual(await get('quickSetup'),{botName:'Tyler',mode:'voice',notices:['chat:1']},'sanitizeSettings: setup settings keep their shape');
  assert.deepEqual(await get('remoteControl'),{on:true,away:false,port:t.port},'the remote\'s own settings are untouched');assert.equal((await get('remoteDevices')).length,1);assert.equal((await get('usage')).requests,3);assert.equal(await get('voiceOutputDevice'),'{0.0.1}.{cable}');assert.equal((await get('settingsDraft')).values.personality,'draft');
  assert.deepEqual(t.calls.write.at(-1),{personality:'From the phone',aiProvider:'openrouter',speechEngine:'cloud',quickSetup:{botName:'Tyler',mode:'voice',notices:['chat:1']}});
  // Logged with the names only.
  assert.deepEqual(t.logs.filter(l=>/changed settings/.test(l[0])).at(-1),['Phone remote changed settings','personality, aiProvider, speechEngine, quickSetup']);
  assert.ok(!t.logs.some(l=>/From the phone|sk-or|AIza/.test(String(l[1]))),'no values in the log');
  await sleep(1100);
  // Bad values: refused like the PC refuses them.
  assert.equal((await t.post(cookie,'/settings/set',{values:{uiTheme:'evil'}})).status,400);
  assert.equal((await t.post(cookie,'/settings/set',{values:{quickSetup:'nope'}})).status,400);
  assert.equal((await t.post(cookie,'/settings/set',{values:{insideJokes:'x'.repeat(21000)}})).status,400,'sanitizeSettings: a value over 20000 characters');
  assert.equal((await t.post(cookie,'/settings/set',{values:['personality']})).status,400);
  await sleep(1100);
  assert.equal((await t.post(cookie,'/settings/set',{values:{uiTheme:'pipboy'}})).status,200);assert.equal(await get('uiTheme'),'pipboy');
  // Unchanged values aren't written again.
  const before=t.calls.write.length;r=await t.post(cookie,'/settings/set',{values:{uiTheme:'pipboy',personality:'From the phone'}});assert.deepEqual(r.json.saved,[]);assert.equal(t.calls.write.length,before);
  // Theme stats: the only thing the phone may remove.
  r=await t.post(cookie,'/settings/remove',{keys:['tylerLifetime','personality','remoteDevices']});assert.equal(r.status,200);assert.deepEqual(r.json.removed,['tylerLifetime']);assert.deepEqual(r.json.dropped,['personality','remoteDevices']);
  assert.equal(await get('tylerLifetime'),undefined);assert.equal(await get('personality'),'From the phone');
  // There is no way in for the rest of the PC's Settings (pairing, keys, AI tests, installs, the log).
  await sleep(1100);
  for(const p of ['/settings/remote','/settings/verify','/settings/ai','/settings/voices','/settings/local-ai','/settings/activity','/settings/voice-test'])assert.equal((await t.post(cookie,p,{op:'forget-all'})).status,404,p);
  for(const op of ['forget-all','new-code','disable'])assert.equal((await t.post(cookie,'/action',{action:'remote',op})).status,400);
  assert.equal((await t.remote.handle('status')).devices.length,1,'the phone is still the only one, still paired');assert.equal((await t.remote.handle('status')).on,true);
 }finally{await t.close();}
});

test('paired: size and rate limits of their own',async()=>{
 const t=await setup();
 try{
  const cookie=await t.pair();
  // A long personality fits (the PC keeps 1500 characters; the request may carry more).
  let r=await t.post(cookie,'/settings/set',{values:{personality:'p'.repeat(19000),insideJokes:'j'.repeat(3600),nicknameAliases:'n'.repeat(2400)}});assert.equal(r.status,200);
  assert.equal((await t.vault.get('personality')).personality.length,19000);
  r=await t.post(cookie,'/settings/set',{values:{personality:'p'.repeat(70000)}});assert.equal(r.status,413);assert.match(r.json.error,/too much/);
  await sleep(1100);
  // Writes: 4 a second (the 413 above counted).
  const codes=[];for(let i=0;i<6;i++)codes.push((await t.post(cookie,'/settings/set',{values:{talkativeness:i%2?'quiet':'active'}})).status);
  assert.deepEqual(codes,[200,200,200,200,429,429]);
  // Reads have their own allowance: writes being limited doesn't stop them.
  const reads=[];for(let i=0;i<12;i++)reads.push((await t.post(cookie,'/settings/get',{keys:['personality']})).status);
  assert.deepEqual(reads.slice(0,10),Array(10).fill(200));assert.equal(reads[11],429);
  // And the remote's buttons keep theirs.
  assert.equal((await t.post(cookie,'/action',{action:'pause'})).status,200);
  await sleep(1100);
  // At most 30 writes a minute.
  let ok=0,limited=0;for(let i=0;i<40;i++){const c=(await t.post(cookie,'/settings/set',{values:{talkativeness:i%2?'quiet':'active'}})).status;if(c===200)ok++;else if(c===429)limited++;if(i%4===3)await sleep(1010);}
  assert.ok(ok<=30-6+1&&limited>=10,'ok '+ok+', limited '+limited);
 }finally{await t.close();}
});

test('Settings page files: a fixed list, for the page the build makes; the remote\'s headers',async()=>{
 const t=await setup();
 try{
  const cookie=await t.pair();
  const page=await request(t.port,{path:'/settings/',headers:{cookie}});
  assert.equal(page.status,200);assert.match(page.headers['content-security-policy'],/default-src 'none'; script-src 'self';/);assert.equal(page.headers['x-frame-options'],'DENY');
  assert.match(page.text,/<body data-desktop="true" data-phone="true">/);assert.doesNotMatch(page.text,/http-equiv="Content-Security-Policy"/,'the remote\'s CSP, not the page\'s (which allows the AI providers)');
  assert.ok(page.text.indexOf('phone-settings.js')<page.text.indexOf('theme.js'),'the phone bridge runs before the page\'s scripts');
  assert.deepEqual(leaks(page.text),[]);
  // Every file the page names (and the modules its scripts import) is served; nothing else is.
  const refs=[...page.text.matchAll(/(?:src|href)="([\w./-]+)(?:\?v=[\w.]+)?"/g)].map(m=>m[1]).filter(f=>!/^(https?:|#)/.test(f));
  const mods=['live-core.mjs','live-pcm.js','guard.mjs','conversation.mjs','memory.mjs','gemini.mjs','speech.mjs','models.mjs','quality.mjs','local-ai.mjs','settings-ai.mjs'];
  for(const f of [...new Set([...refs,...mods,'ui/themes/pipboy.css','ui/fonts/pipboy-400.woff2','ui/logos/msn.png'])]){const r=await request(t.port,{path:'/settings/'+f});assert.equal(r.status,200,f);}
  for(const f of ['background.js','phone-settings.html','../remote.cjs','..%2Fmain.cjs','ui/themes/evil.css','ui/logos/../../main.cjs','vault.cjs','companion/settings.js','remote.js','ui/brand/README.md','sounds/steam/x.wav'])assert.equal((await request(t.port,{path:'/settings/'+f})).status,404,f);
  // The page's files are kept a day only at this version's address.
  assert.match((await request(t.port,{path:'/settings/settings.css?v=9.9.9'})).headers['cache-control'],/max-age=86400/);
  assert.equal((await request(t.port,{path:'/settings/settings.css?v=1.0.0'})).headers['cache-control'],'no-store');
  // The generated page's own module imports are all in the list above.
  const companion=path.join(ROOT,'app','companion');
  for(const f of ['voice-settings.js','ai-settings.js',...mods])for(const m of fs.readFileSync(path.join(companion,f),'utf8').matchAll(/(?:^|[;\n])\s*import\s+(?:[^'";]*?\sfrom\s+)?['"]\.\/([^'"]+)['"]/g))assert.ok(mods.includes(m[1]),f+' imports '+m[1]);
 }finally{await t.close();}
});

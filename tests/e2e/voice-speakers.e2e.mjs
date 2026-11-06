// End-to-end (v2.44): who said each voice line, from two people's own audio tracks to the AI's prompt.
// Mocked: Steam (a stand-in shaped like Steam's chat objects, as in occupancy.e2e.mjs, with two people in
// voice; in one test their voice members carry a talking flag), the "call" (a second WebRTC connection in the
// page plays Steam's voice server: two real audio tracks, a low and a high voice, speaking in turn), Tyler's
// audio bridge (answers status and plays nothing), and the AI and speech providers (a mocked fetch in Node; its
// "transcription" tells the low voice from the high one by pitch, so a wrong name can't pass).
// Real: headless Chromium, real WebRTC, the real voice-listener.js and voice-speakers.js in the page, the real
// panel (content.js, automatic.js, voice-call.js…, from tools/preview/panel.html), Tyler's real
// steam-chat-main.js reading the stand-in, and the real background.js (in this Node process) building the prompt.
// Not tested: real Steam (what its talking data really is), Steam's voice server, Windows audio, Gemini Live.
import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const {chromium}=require('playwright');
const ROOT=path.resolve(import.meta.dirname,'../..');
const types={'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.json':'application/json','.svg':'image/svg+xml','.png':'image/png','.webp':'image/webp','.woff2':'font/woff2','.wav':'audio/wav'};
const SAM='76561197960265738',ALEX='76561197960265739';

// ── The background, for real, with mocked providers ──
const store={},requests=[];let listener,reply=0;
const area={get:async keys=>{const list=keys==null?Object.keys(store):typeof keys==='string'?[keys]:Array.isArray(keys)?keys:Object.keys(keys);return structuredClone(Object.fromEntries(list.filter(k=>k in store).map(k=>[k,store[k]])));},
 set:async values=>{Object.assign(store,structuredClone(values));},remove:async keys=>{for(const k of [].concat(keys))delete store[k];},setAccessLevel:async()=>{}};
const session={};
globalThis.chrome={action:{onClicked:{addListener(){}}},runtime:{onMessage:{addListener:fn=>{listener=fn;}},openOptionsPage(){}},
 storage:{local:area,session:{get:async k=>({[k]:session[k]}),set:async v=>Object.assign(session,v),remove:async k=>{delete session[k];}},onChanged:{addListener(){}}},
 tabs:{get:async id=>({id}),query:async()=>[],sendMessage:async()=>{},onRemoved:{addListener(){}}}};
/** Which voice is in a 16 kHz WAV: power at the low voice's pitch against the high one's (Goertzel). */
function pitch(b64){const b=Buffer.from(b64,'base64'),n=(b.length-44)>>1,rate=b.readUInt32LE(24);const power=f=>{const k=2*Math.cos(2*Math.PI*f/rate);let s1=0,s2=0;for(let i=0;i<n;i++){const s=b.readInt16LE(44+i*2)/32768+k*s1-s2;s2=s1;s1=s;}return s1*s1+s2*s2-k*s1*s2;};const lo=power(180),hi=power(330);return lo>hi*4?'low':hi>lo*4?'high':'mixed';}
globalThis.fetch=async(url,options={})=>{
 const u=String(url);
 if(u.endsWith('/audio/transcriptions')){const body=JSON.parse(options.body);const v=pitch(body.input_audio.data);requests.push({kind:'stt',voice:v,format:body.input_audio.format,model:body.model,keys:Object.keys(body).sort()});
  return new Response(JSON.stringify({text:v==='mixed'?'two people at once':'this is the '+v+' voice'}),{headers:{'content-type':'application/json'}});}
 if(u.endsWith('/chat/completions')){const body=JSON.parse(options.body);requests.push({kind:'chat',system:body.messages[0].content,user:body.messages.at(-1).content});
  const text=['Reply: bombsite A is wide open.','Reply: rotate through mid together.','Reply: save your money this round.','Reply: that flank was pure luck.','Reply: nice shot, keep that angle.','Reply: smoke the long corridor first.'][reply++%6];
  return new Response(JSON.stringify({choices:[{message:{content:text}}],usage:{prompt_tokens:5,completion_tokens:5}}),{headers:{'content-type':'application/json'}});}
 if(u.endsWith('/audio/speech'))return new Response(new Uint8Array([73,68,51,reply%250]),{headers:{'content-type':'audio/mpeg'}});
 throw Error('Unexpected request '+u);
};
await import('../../browser-extension/background.js');

const FAKE_STEAM=`(()=>{
 const self={accountid:2,primary_display_name:'ROBOTIC TYLER'};
 const people=[{accountid:10,primary_display_name:'Sam'},{accountid:11,primary_display_name:'Alex'}];
 if(window.__flags)for(const p of people)p.is_speaking=false;
 const VC={m_VoiceCallState:{m_eState:10,m_chatRoom:{groupID:'12345',chatID:'901'}},
  IsVoiceActiveForRoom(g,c){return g==='12345'&&c==='901';},IsAccountFullyConnectedToActiveVoiceChat(id){return id===2;},GetVoiceLogs:()=>''};
 const room={GetRoomID:()=>'901',name:'Squad voice',GetVoiceAllowed:()=>true,ChatStore:{VoiceChat:VC},BVoiceActive:()=>true,voice_active_contains_self:true,
  get voice_active_member_list(){return {member_list:[self,...people]};}};
 const group={GetGroupID:()=>'12345',get voiceRoomList(){return [room];}};
 const text={GetGroup:()=>group,GetVoiceAllowed:()=>false,self,ChatStore:{VoiceChat:VC}};
 for(const n of document.querySelectorAll('.msgText'))n.__reactProps$steam={msg:{unAccountID:3,rtTimestamp:Math.floor(Date.now()/1000),unOrdinal:1},chatView:{chat:text}};
 window.__audio={enabled:true,player:'running',observing:true,peers:1,connectedPeers:1,requests:1,attached:1,peerStates:[]};
 const report=t=>postMessage({source:'tyler-audio-status',text:t,ok:true,voice:{...window.__audio}},location.origin);
 // Tyler's audio bridge: answers status; a reply "plays" for 300 ms (nothing is heard in the call).
 addEventListener('message',e=>{if(e.source!==window||e.data?.source!=='tyler-audio-command')return;const t=e.data.type;
  if(t==='enable')report('Synthetic sender attached.');else if(t==='status')report('Voice connection checked.');
  else if(t==='audio'){postMessage({source:'tyler-playback',playing:true},location.origin);setTimeout(()=>postMessage({source:'tyler-playback',playing:false},location.origin),300);}});
 window.__steam={talk(id){if(window.__flags)for(const p of people)p.is_speaking=p.accountid===id;}};
})();`;

// The call: Steam's voice server stand-in sends two people's tracks; each speaks when told (a steady tone).
const CALL=`window.__call=async()=>{
 const ctx=new AudioContext();await ctx.resume();
 const voices=[180,330].map(f=>{const o=ctx.createOscillator(),g=ctx.createGain(),d=ctx.createMediaStreamDestination();o.frequency.value=f;g.gain.value=0;o.connect(g);g.connect(d);o.start();return {g,stream:d.stream};});
 const B=new window.__NativePC(),A=new RTCPeerConnection();
 // Steam plays each person's audio in the page like this (Chromium only feeds a remote track to Web Audio then).
 window.__players=[];A.ontrack=e=>{const el=new Audio();el.srcObject=new MediaStream([e.track]);el.play().catch(()=>{});__players.push(el);};
 B.onicecandidate=e=>e.candidate&&A.addIceCandidate(e.candidate).catch(()=>{});A.onicecandidate=e=>e.candidate&&B.addIceCandidate(e.candidate).catch(()=>{});
 for(const v of voices)B.addTrack(v.stream.getAudioTracks()[0],v.stream);
 await B.setLocalDescription();await A.setRemoteDescription(B.localDescription);await A.setLocalDescription();await B.setRemoteDescription(A.localDescription);
 window.__voices=voices;window.__pcs=[A,B];
};
window.__say=(i,ms)=>{const g=__voices[i].g,t=g.context.currentTime;g.gain.setValueAtTime(.3,t+.02);g.gain.setValueAtTime(0,t+.02+ms/1000);};`;

let tabSeq=40;
async function open(browser,{flags=false,settings={}}={}){
 const tab=++tabSeq,sender={tab:{id:tab},url:'https://steamcommunity.com/chat/'},ask=m=>new Promise(resolve=>listener(m,sender,resolve));
 for(const k of Object.keys(store))delete store[k];
 Object.assign(store,{openrouterKey:'sk-or-test',aiProvider:'openrouter',friendMemory:true,streamAI:false,fastSpeech:false,keyboardFilter:false,personality:'Chill gamer.',quickSetup:{botName:'ROBOTIC TYLER'}},settings);
 await ask({type:'lease:claim',takeOver:true});requests.length=0;
 const files=http.createServer((req,res)=>{const file=path.join(ROOT,decodeURIComponent(new URL(req.url,'http://x').pathname));if(!file.startsWith(ROOT)||!fs.existsSync(file)||fs.statSync(file).isDirectory()){res.writeHead(404);res.end();return;}res.writeHead(200,{'content-type':types[path.extname(file)]||'application/octet-stream'});fs.createReadStream(file).pipe(res);}).listen(0);
 const page=await (await browser.newContext({viewport:{width:1380,height:920}})).newPage(),errors=[],sent=[];
 page.on('pageerror',e=>errors.push(e.message));
 // The panel's requests that the real background answers; the rest stay with the preview's stand-ins.
 await page.exposeFunction('__bg',m=>{sent.push(JSON.parse(JSON.stringify({...m,audio:m.audio?'[audio]':undefined})));return ask(m);});
 await page.goto('http://127.0.0.1:'+files.address().port+'/tools/preview/panel.html?platform=desktop-voice');
 await page.waitForFunction(()=>window.__tylerReady===true&&window.TylerVoiceCall&&TylerCompanion.connectAndStart);
 await page.evaluate(flags=>{window.__flags=flags;window.__NativePC=RTCPeerConnection;window.__controls=[];window.__analysers=0;
  const make=AudioContext.prototype.createAnalyser;AudioContext.prototype.createAnalyser=function(){window.__analysers++;return make.call(this);};
  addEventListener('message',e=>{if(e.data?.source==='tyler-listener-control')__controls.push(e.data);});
  const original=chrome.runtime.sendMessage;chrome.runtime.sendMessage=m=>['voice','command','connection','preferences','abort'].includes(m?.type)?window.__bg(m):original(m);},flags);
 for(const f of ['steam-chat-main.js','live-pcm.js','wav-codec.js','noise-filter.js','voice-speakers.js','voice-listener.js'])await page.addScriptTag({path:path.join(ROOT,'browser-extension',f)});
 await page.addScriptTag({content:FAKE_STEAM});await page.addScriptTag({content:CALL});
 await page.evaluate(()=>{window.__steamReads=0;const a=TylerSteamChatAdapter,read=a.voiceTalking;a.voiceTalking=()=>{window.__steamReads++;return read();};window.__traces=[];const trace=TylerCompanion.trace;TylerCompanion.trace=x=>{__traces.push(String(x));return trace(x);};dispatchEvent(new Event('focus'));});
 // Signal trail lines as they're written (the trail itself keeps the last 8).
 const traces=()=>page.evaluate(()=>window.__traces.join('\n'));
 const panel=id=>page.evaluate(id=>document.getElementById('tyler-companion-root').shadowRoot.getElementById(id)?.textContent??null,id);
 const until=async(fn,what,ms=20000)=>{const t0=Date.now();let last;while(Date.now()-t0<ms){last=await fn();if(last)return last;await page.waitForTimeout(100);}
  const seen=await page.evaluate(()=>({mode:document.getElementById('tyler-companion-root').shadowRoot.getElementById('mode')?.textContent,listener:document.getElementById('tyler-companion-root').shadowRoot.getElementById('listener')?.textContent,heard:document.getElementById('tyler-companion-root').shadowRoot.getElementById('heard')?.textContent,trail:document.getElementById('tyler-companion-root').shadowRoot.getElementById('trail')?.textContent})).catch(e=>e.message);
  throw Error('timed out waiting for '+what+' · '+JSON.stringify({seen,sent:sent.map(m=>m.type),requests:requests.map(r=>r.kind+':'+(r.voice||'')),errors}));};
 async function start(){
  await page.waitForTimeout(400);
  await page.evaluate(()=>{void TylerCompanion.connectAndStart();});
  await until(()=>page.evaluate(()=>TylerCompanion.noticePending?TylerCompanion.answerNotice(true):TylerCompanion.isAutomaticActive()),'the chat check');
  await until(()=>page.evaluate(()=>!TylerCompanion.connecting&&TylerCompanion.isAutomaticActive()),'Connect & start');
  await until(async()=>/^LISTENING/.test(await panel('mode')),'voice mode');
  await page.evaluate(()=>__call());
  await until(async()=>/Incoming voice tracks: 2 · listening/.test(await panel('listener')),'the two people\'s tracks');
 }
 /** One person (0 = low voice, 1 = high; [0,1] both at once) talks for 1.6 s; returns once Tyler has answered and is listening again. */
 async function say(i,{steamId=null}={}){
  const before=requests.filter(r=>r.kind==='chat').length;
  await until(async()=>/^LISTENING|^Your turn|^Listening/i.test(await panel('mode')),'Tyler listening');
  await page.evaluate(([i,id])=>{__steam.talk(id);for(const k of [].concat(i))__say(k,1600);setTimeout(()=>__steam.talk(null),1700);},[i,steamId]);
  await until(()=>requests.filter(r=>r.kind==='chat').length>before,'the AI request');
  await until(async()=>/^Reply:/.test(await panel('answer'))&&/^(LISTENING|Your turn)/i.test(await panel('mode')),'the reply to finish');
  await page.waitForTimeout(400);
  return {heard:await panel('heard'),chat:requests.filter(r=>r.kind==='chat')[before]};
 }
 return {page,panel,until,start,say,traces,errors,sent,ask,tab,close:()=>files.close()};
}
const firstLine=s=>String(s||'').split('\n')[0];

test('two people in voice with Steam\'s talking flags: each line is theirs, by name, then learned from their tracks',{timeout:180000},async()=>{
 const browser=await chromium.launch({args:['--autoplay-policy=no-user-gesture-required']});const t=await open(browser,{flags:true});
 try{
  await t.start();
  let r=await t.say(0,{steamId:10});
  assert.equal(firstLine(r.chat.user),'<chat from="Sam">Sam (in voice): this is the low voice</chat>');assert.equal(r.heard,'Heard Sam: this is the low voice');
  assert.match(r.chat.system,/VOICE SPEAKERS:/);assert.match(r.chat.system,/The current message author is "Sam" \(Steam account 76561197960265738\)/);
  r=await t.say(1,{steamId:11});
  assert.equal(firstLine(r.chat.user),'<chat from="Alex">Alex (in voice): this is the high voice</chat>');assert.equal(r.heard,'Heard Alex: this is the high voice');
  // Steam's flags stay off now: Sam's track is still Sam (learned during this call).
  r=await t.say(0);
  assert.equal(firstLine(r.chat.user),'<chat from="Sam">Sam (in voice): this is the low voice</chat>');
  const last=t.sent.filter(m=>m.type==='voice').at(-1);assert.deepEqual([last.voiceSpeaker.source,last.voiceSpeaker.speaker.name],['track','Sam']);
  // Every transcription request: one person's recording, as a plain WAV with the usual fields.
  const stt=requests.filter(q=>q.kind==='stt');assert.deepEqual(stt.map(q=>q.voice),['low','high','low']);
  for(const q of stt)assert.deepEqual([q.format,q.keys],['wav',['input_audio','language','model','response_format']]);
  const trail=await t.traces();assert.match(trail,/Voice speakers: from Steam’s talking data · member\.is_speaking/);assert.match(trail,/Voice speakers: from each person’s audio, matched to Steam names it learned/);
  assert.doesNotMatch(trail,/this is the/,'the trail never carries what was said');
  // Per-friend memory: each person's own lines only.
  const friends=store.friendConversationMemory||{};assert.deepEqual(friends[SAM].messages.filter(m=>m.role==='user').map(m=>m.content),['Sam (in voice): this is the low voice','Sam (in voice): this is the low voice']);
  assert.deepEqual(friends[ALEX].messages.filter(m=>m.role==='user').map(m=>m.content),['Alex (in voice): this is the high voice']);
  assert.ok(await t.page.evaluate(()=>window.__analysers)>=3,'a meter per person, plus the mix\'s');
  // Checks → Full check: one row on who's speaking, with Steam's field names and counts.
  await t.page.evaluate(()=>{TylerCompanion.showTab('checks');document.getElementById('tyler-companion-root').shadowRoot.getElementById('diagnose').click();});
  await t.until(()=>t.page.evaluate(()=>!document.getElementById('tyler-companion-root').shadowRoot.getElementById('copyReport').hidden),'the full check',40000);
  const check=await t.panel('diagnostics');assert.match(check,/✓ Who is speaking in voiceEach person's audio: 2 tracks matched to Steam names · last line: track \(learned\)/);assert.match(check,/Steam’s talking data used: member\.is_speaking \(boolean/);
  assert.doesNotMatch(check,/Sam|Alex/,'no names of people in the report');
  assert.deepEqual(t.errors,[]);
 }finally{t.close();await browser.close();}
});

test('two people in voice and no Steam talking data: kept apart as Speaker 1 and Speaker 2, never named, no friend memory',{timeout:180000},async()=>{
 const browser=await chromium.launch({args:['--autoplay-policy=no-user-gesture-required']});const t=await open(browser);
 try{
  await t.start();
  const lines=[];for(const i of [0,1,0]){const r=await t.say(i);lines.push([firstLine(r.chat.user),r.heard]);}
  assert.deepEqual(lines,[
   ['<chat>Speaker 1 (in voice, name unknown): this is the low voice</chat>','Heard Speaker 1: this is the low voice'],
   ['<chat>Speaker 2 (in voice, name unknown): this is the high voice</chat>','Heard Speaker 2: this is the high voice'],
   ['<chat>Speaker 1 (in voice, name unknown): this is the low voice</chat>','Heard Speaker 1: this is the low voice']]);
  assert.match(requests.filter(q=>q.kind==='chat').at(-1).system,/current speaker identity is UNKNOWN/);
  // Both at once: both tracks clearly talking is overlap, and the line says so.
  const both=await t.say([0,1]);
  assert.match(firstLine(both.chat.user),/^<chat>Speaker [12] and Speaker [12] talking at once: two people at once<\/chat>$/);assert.match(both.heard,/^Heard Speaker [12] and Speaker [12]: two people at once$/);
  assert.deepEqual(requests.filter(q=>q.kind==='stt').map(q=>q.voice),['low','high','low','mixed']);
  assert.deepEqual(Object.keys(store.friendConversationMemory||{}),[],'no per-friend memory without a Steam id');
  assert.match(await t.traces(),/Voice speakers: from each person’s audio \(names not known yet: Speaker 1, 2…\)/);
  assert.deepEqual(t.errors,[]);
 }finally{t.close();await browser.close();}
});

test('setting off: no per-person meters, no Steam reads, and the turn and prompt are exactly as before',{timeout:180000},async()=>{
 const browser=await chromium.launch({args:['--autoplay-policy=no-user-gesture-required']});const t=await open(browser,{flags:true,settings:{voiceSpeakers:false}});
 try{
  await t.start();
  const r=await t.say(0,{steamId:10});
  assert.equal(firstLine(r.chat.user),'<chat>this is the low voice</chat>');assert.equal(r.heard,'Heard: this is the low voice');
  assert.doesNotMatch(r.chat.system,/VOICE SPEAKERS/);
  const voice=t.sent.filter(m=>m.type==='voice');assert.equal(voice.length,1);assert.deepEqual(Object.keys(voice[0]).sort(),['audio','automatic','captureEncodeMs','chatScope','format','requestId','seconds','type'],'the panel sends what v2.43 sent');
  const page=await t.page.evaluate(()=>({analysers:window.__analysers,reads:window.__steamReads,controls:__controls.filter(c=>'voiceSpeakers' in c).length}));
  assert.deepEqual(page,{analysers:1,reads:0,controls:0},'only the mix\'s own analyser; Steam never asked; the listener never told');
  assert.doesNotMatch(await t.traces(),/Voice speakers/);
  assert.equal(store.friendConversationMemory,undefined);
  assert.deepEqual(t.errors,[]);
 }finally{t.close();await browser.close();}
});

test('the attribution breaking (Steam\'s data throws) never holds a reply up: unlabelled, as before, and one line in the Signal trail',{timeout:180000},async()=>{
 const browser=await chromium.launch({args:['--autoplay-policy=no-user-gesture-required']});const t=await open(browser,{flags:true});
 try{
  await t.start();
  await t.page.evaluate(()=>{TylerSteamChatAdapter.voiceTalking=()=>{throw Error('Steam changed its voice store');};});
  const r=await t.say(1,{steamId:11});
  assert.equal(firstLine(r.chat.user),'<chat>this is the high voice</chat>','the turn went out unlabelled');assert.equal(r.heard,'Heard: this is the high voice');
  assert.doesNotMatch(r.chat.system,/VOICE SPEAKERS/);assert.match(await t.panel('answer'),/^Reply:/);
  assert.equal(t.sent.filter(m=>m.type==='voice').at(-1).voiceSpeaker,undefined);
  const trail=await t.traces();assert.match(trail,/Voice speakers: couldn’t tell who spoke \(Steam changed its voice store\), sent unlabelled/);
  assert.equal(trail.match(/couldn’t tell who spoke/g).length,1,'one line for that turn');
  assert.deepEqual(t.errors,[]);
 }finally{t.close();await browser.close();}
});

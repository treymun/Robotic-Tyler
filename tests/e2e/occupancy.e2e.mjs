// End-to-end (v2.41): Auto routing's "who is in the Steam voice call" through Connect & start.
// Mocked: Steam (a stand-in shaped like Steam's chat objects, read from friendsui.js: the call state,
// voiceRoomList, voice_active_member_list, IsAccountFullyConnectedToActiveVoiceChat, StartVoiceChat,
// and Steam's React props on the chat's messages), Tyler's audio bridge (a stand-in that answers its
// status messages), the AI provider (the preview's handlers). Real: headless Chromium, the panel preview
// running the real panel scripts as the desktop app (tools/preview/panel.html?platform=desktop-voice:
// content.js, quick-start.js, automatic.js, voice-call.js, steam-chat-client.js) and Tyler's real
// steam-chat-main.js reading the stand-in.
// Not tested: real Steam (its real call data and voice list), Windows audio, a real AI provider.
import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const {chromium}=require('playwright');
const ROOT=path.resolve(import.meta.dirname,'../..');
const types={'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.json':'application/json','.svg':'image/svg+xml','.png':'image/png','.webp':'image/webp','.woff2':'font/woff2','.wav':'audio/wav','.onnx':'application/octet-stream'};

const FAKE_STEAM=`(()=>{
 const self={accountid:2};let friends=[],listed=false,answering=true;
 const VC={m_VoiceCallState:{m_eState:0,m_chatRoom:null},
  IsVoiceActiveForRoom(g,c){const s=this.m_VoiceCallState;return !!s.m_chatRoom&&s.m_chatRoom.groupID===g&&s.m_chatRoom.chatID===c&&s.m_eState!==0;},
  IsAccountFullyConnectedToActiveVoiceChat(id){return id===self.accountid&&this.m_VoiceCallState.m_eState===10;},
  InitiateRoomChat(g,c){this.m_VoiceCallState={m_eState:1,m_chatRoom:{groupID:g,chatID:c}};window.__steam.started++;},
  OnUserEndVoiceChat(){this.m_VoiceCallState={m_eState:0,m_chatRoom:null};listed=false;},GetVoiceLogs:()=>''};
 const room={GetRoomID:()=>'901',name:'Squad voice',GetVoiceAllowed:()=>true,ChatStore:{VoiceChat:VC},
  StartVoiceChat(){if(!this.BVoiceActive())VC.InitiateRoomChat('12345','901');},ToggleVoiceChat(){this.BVoiceActive()?VC.OnUserEndVoiceChat():this.StartVoiceChat();},
  BVoiceActive(){return VC.IsVoiceActiveForRoom('12345','901');},get voice_active_contains_self(){return listed;},
  get voice_active_member_list(){return {member_list:[...(listed?[self]:[]),...friends]};}};
 const group={GetGroupID:()=>'12345',get voiceRoomList(){return [room];}};
 const text={GetGroup:()=>{if(!answering)throw Error('Steam chat controls unavailable: GetGroup');return group;},GetVoiceAllowed:()=>false,self,ChatStore:{VoiceChat:VC}};
 // Steam's React props on the chat's own message rows (what steam-chat-main.js reads).
 for(const n of document.querySelectorAll('.msgText'))n.__reactProps$steam={msg:{unAccountID:3,rtTimestamp:Math.floor(Date.now()/1000),unOrdinal:1},chatView:{chat:text}};
 // Tyler's audio bridge (MAIN world in the app): answers "enable" and "status" with its voice snapshot.
 window.__audio={enabled:true,player:'running',observing:true,peers:1,connectedPeers:1,requests:1,attached:1,peerStates:[]};
 const report=text=>postMessage({source:'tyler-audio-status',text,ok:true,voice:{...window.__audio}},location.origin);
 addEventListener('message',e=>{if(e.source!==window||e.data?.source!=='tyler-audio-command')return;const t=e.data.type;if(t==='enable')report('Synthetic sender attached.');else if(t==='status')report('Voice connection checked.');});
 window.__steam={started:0,
  friends(n){friends=Array.from({length:n},(_,i)=>({accountid:10+i}));},
  connect(){VC.m_VoiceCallState={m_eState:10,m_chatRoom:{groupID:'12345',chatID:'901'}};listed=true;},
  answer(on){answering=on;},
  audio(peers){window.__audio={...window.__audio,peers,connectedPeers:peers};report('Steam connection state: '+(peers?'connected':'closed'));}};
})();`;

async function open(browser,setup){
 const files=http.createServer((req,res)=>{const file=path.join(ROOT,decodeURIComponent(new URL(req.url,'http://x').pathname));if(!file.startsWith(ROOT)||!fs.existsSync(file)||fs.statSync(file).isDirectory()){res.writeHead(404);res.end();return;}res.writeHead(200,{'content-type':types[path.extname(file)]||'application/octet-stream'});fs.createReadStream(file).pipe(res);}).listen(0);
 const page=await (await browser.newContext({viewport:{width:1380,height:920}})).newPage(),errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 await page.goto('http://127.0.0.1:'+files.address().port+'/tools/preview/panel.html?platform=desktop-voice');
 await page.waitForFunction(()=>window.__tylerReady===true&&window.TylerVoiceCall&&TylerCompanion.connectAndStart);
 await page.addScriptTag({path:path.join(ROOT,'browser-extension/steam-chat-main.js')});await page.addScriptTag({content:FAKE_STEAM});
 await page.evaluate(setup);
 const panel=id=>page.evaluate(id=>document.getElementById('tyler-companion-root').shadowRoot.getElementById(id)?.textContent??null,id);
 const until=async(fn,what,ms=12000)=>{const t0=Date.now();let last;while(Date.now()-t0<ms){last=await fn();if(last)return last;await page.waitForTimeout(100);}throw Error('timed out waiting for '+what);};
 // Connect & start, answering the one-time chat check the way the person would (tick + Continue).
 async function connect(){
  await page.evaluate(()=>{void TylerCompanion.connectAndStart();});
  await until(()=>page.evaluate(()=>TylerCompanion.noticePending?TylerCompanion.answerNotice(true):TylerCompanion.isAutomaticActive()),'the chat check');
  await until(()=>page.evaluate(()=>!TylerCompanion.connecting&&TylerCompanion.isAutomaticActive()),'Connect & start to finish');
 }
 return {page,panel,until,connect,errors,close:()=>files.close()};
}

test('Connect & start with the bot already in the call (4 others): Steam\'s count, no click, no hint, and the panel says where it came from',{timeout:120000},async()=>{
 const browser=await chromium.launch();const t=await open(browser,()=>{__steam.friends(4);__steam.connect();});
 try{
  await t.connect();
  // v2.40.0 stopped here with "The selected chat or voice room still needs a hint" (Start read only the voice list).
  await t.until(async()=>/^4 other participants in the call → spoken replies · from Steam’s own call data$/.test(await t.panel('occupancyNow')),'the Chat tab\'s occupancy line');
  assert.equal(await t.panel('presence'),await t.panel('occupancyNow'),'Setup says the same');
  assert.equal(await t.panel('quickStatus'),'Connected. Voice and text switch automatically with the room.');
  await t.until(async()=>/^LISTENING/.test(await t.panel('mode')),'voice mode');
  assert.match(await t.panel('vcState'),/In the call/);assert.match(await t.panel('vcText'),/Squad voice · 4 others in the call/);
  assert.match(await t.panel('trail'),/Voice occupancy: steam-call · 4 others · in-call · Steam step 10/);
  // Checks → Full check: one row says who Auto routing counts, and from where (no names).
  await t.page.evaluate(()=>{handlers.command=m=>/^ask /.test(m.text)?{text:'Yes, I can respond.'}:{};TylerCompanion.showTab('checks');document.getElementById('tyler-companion-root').shadowRoot.getElementById('diagnose').click();});
  await t.until(()=>t.page.evaluate(()=>!document.getElementById('tyler-companion-root').shadowRoot.getElementById('copyReport').hidden),'the full check',30000);
  assert.match(await t.panel('diagnostics'),/Who is in the call \(Auto routing\)4 other participants in the call → spoken replies · from Steam’s own call data\./);
  assert.deepEqual(t.errors,[]);
 }finally{t.close();await browser.close();}
});

test('started in text, then Join voice: "Steam is still connecting" while it joins (no hint), then spoken replies',{timeout:120000},async()=>{
 const browser=await chromium.launch();const t=await open(browser,()=>{__steam.friends(3);__steam.audio(0);});
 try{
  await t.connect();
  // A voice connection on the audio side right after Start, before Steam's next 3-second look: v2.40.0
  // showed "Voice room needs one hint" here and never took it back (the owner's screenshot).
  await t.page.evaluate(()=>__steam.audio(1));
  for(let i=0;i<8;i++){assert.equal(await t.panel('quickStatus'),'Connected in text. Join a Steam voice channel to switch to voice.','no hint at '+i*500+' ms');await t.page.waitForTimeout(500);}
  assert.equal(await t.panel('occupancyNow'),'The bot isn’t in this group’s voice call → text replies · from Steam’s own call data');
  assert.match(await t.panel('mode'),/^TEXT/);
  // Join voice on Tyler's card: Steam's own StartVoiceChat, then Steam connecting.
  await t.page.evaluate(()=>document.getElementById('tyler-companion-root').shadowRoot.getElementById('vcJoin').click());
  await t.until(async()=>(await t.panel('mode'))==='WAITING — Steam is still connecting the voice call','waiting for Steam');
  assert.match(await t.panel('occupancyNow'),/Steam is still connecting the bot to the call\. Tyler waits for Steam’s answer \(no hint needed\)/);
  assert.equal(await t.panel('quickStatus'),'Connected in text. Join a Steam voice channel to switch to voice.','no hint while Steam answers');
  assert.equal(await t.page.evaluate(()=>__steam.started),1);
  await t.page.evaluate(()=>__steam.connect());
  await t.until(async()=>/^LISTENING/.test(await t.panel('mode')),'voice mode once Steam connects');
  await t.until(async()=>/^3 other participants in the call → spoken replies · from Steam’s own call data$/.test(await t.panel('occupancyNow')),'3 others');
  assert.doesNotMatch(await t.panel('quickStatus'),/hint/i);
  assert.deepEqual(t.errors,[]);
 }finally{t.close();await browser.close();}
});

test('Steam\'s call data missing: the hint shows only while nothing can say who is in the call, then clears itself',{timeout:120000},async()=>{
 const browser=await chromium.launch();const t=await open(browser,()=>{__steam.answer(false);__steam.audio(0);});
 try{
  await t.connect();
  // No Steam data, and Tyler's audio side has no Steam voice connection: nobody can hear the bot → text.
  await t.until(async()=>/^No Steam voice connection, so nobody can hear the bot → text replies · from Tyler’s audio connection/.test(await t.panel('occupancyNow')),'the audio side\'s answer');
  const before=await t.panel('quickStatus');assert.equal(before,'Connected in text. Join a Steam voice channel to switch to voice.');
  // A voice connection appears but Steam still can't be read: unknown, Tyler waits, and the hint shows.
  await t.page.evaluate(()=>__steam.audio(1));
  await t.until(async()=>/^Voice occupancy unknown: Steam’s call data isn’t available here/.test(await t.panel('quickStatus')),'the hint');
  assert.equal(await t.panel('mode'),'WAITING — voice occupancy unknown: choose your bot in the voice list (Connect & start)');
  assert.match(await t.panel('occupancyNow'),/^Voice occupancy unknown: Steam’s call data isn’t available here \(.+\)\. Choose your bot/);
  // Steam answers again (the bot is in the call with 2 others): the count is back, and the hint goes.
  await t.page.evaluate(()=>{__steam.friends(2);__steam.connect();__steam.answer(true);});
  await t.until(async()=>(await t.panel('quickStatus'))===before,'the hint to clear itself');
  await t.until(async()=>/^LISTENING/.test(await t.panel('mode')),'voice mode');
  assert.match(await t.panel('occupancyNow'),/^2 other participants in the call → spoken replies · from Steam’s own call data$/);
  const trail=await t.panel('trail');
  assert.match(trail,/Voice occupancy: unknown · count unknown · unavailable/);assert.match(trail,/Voice occupancy: steam-call · 2 others · in-call/);
  assert.deepEqual(t.errors,[]);
 }finally{t.close();await browser.close();}
});

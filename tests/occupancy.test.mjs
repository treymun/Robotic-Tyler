// Who is in the Steam voice call, for Auto routing (friends in voice → spoken replies, empty → text).
// v2.33 read it from Steam's own call data (voice-call.js) so the bot's name needn't be clicked;
// v2.41 makes that data the source whenever Steam answers (Start too), lets nothing override it,
// clears the "needs one hint" status once it isn't needed, and says where the count came from.
// Mocked: no Steam, no browser. A stand-in shaped like Steam's chat objects (friendsui.js: the call
// state, voiceRoomList, voice_active_member_list, IsAccountFullyConnectedToActiveVoiceChat) runs the
// real steam-chat-main.js in its own context (Steam's page), and the real voice-call.js and
// automatic.js in another (Tyler's isolated world), joined by a JSON copy as the page messages are.
// Clocks and timers are stepped by the test. Not tested here: real Steam (see CHANGES / the report).
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const read=f=>readFileSync(new URL('../browser-extension/'+f,import.meta.url),'utf8');

/** Steam's side: the bot (account 2) and a group with one voice channel. */
function fakeSteam(){
 const self={accountid:2};let friends=[],listed=false;
 const VC={m_VoiceCallState:{m_eState:0,m_chatRoom:null},
  IsVoiceActiveForRoom(g,c){const s=this.m_VoiceCallState;return !!s.m_chatRoom&&s.m_chatRoom.groupID===g&&s.m_chatRoom.chatID===c&&s.m_eState!==0;},
  IsAccountFullyConnectedToActiveVoiceChat(id){return id===self.accountid&&this.m_VoiceCallState.m_eState===10;},
  InitiateRoomChat(g,c){this.m_VoiceCallState={m_eState:1,m_chatRoom:{groupID:g,chatID:c}};},
  OnUserEndVoiceChat(){this.m_VoiceCallState={m_eState:0,m_chatRoom:null};listed=false;},GetVoiceLogs:()=>''};
 const room={GetRoomID:()=>'901',name:'Squad voice',GetVoiceAllowed:()=>true,ChatStore:{VoiceChat:VC},
  StartVoiceChat(){if(!this.BVoiceActive())VC.InitiateRoomChat('12345','901');},ToggleVoiceChat(){this.BVoiceActive()?VC.OnUserEndVoiceChat():this.StartVoiceChat();},
  BVoiceActive(){return VC.IsVoiceActiveForRoom('12345','901');},get voice_active_contains_self(){return listed;},
  get voice_active_member_list(){return {member_list:[...(listed?[self]:[]),...friends]};}};
 const group={GetGroupID:()=>'12345',get voiceRoomList(){return [room];}};
 const text={GetGroup:()=>group,GetVoiceAllowed:()=>false,self,ChatStore:{VoiceChat:VC}};
 const node={nodeType:1,isConnected:true,closest:()=>null,parentElement:null,className:'msgText',__reactProps$x:{msg:{unAccountID:3,rtTimestamp:1700000000,unOrdinal:1},chatView:{chat:text}}};
 const box={document:{querySelectorAll:()=>[],addEventListener(){}},window:{postMessage(){},addEventListener(){}},location:{origin:'https://steamcommunity.com'}};
 vm.runInNewContext(read('steam-chat-main.js'),box);
 let answering=true;
 return {
  // What the isolated world gets back: a copy, as through the page's messages.
  request:async(op,values={})=>{if(!answering)throw Error('Steam chat controls did not respond.');return JSON.parse(JSON.stringify(await box.TylerSteamChatAdapter.handle(node,{...values,op})));},
  friends(n){friends=Array.from({length:n},(_,i)=>({accountid:10+i}));},
  step(n){VC.m_VoiceCallState={m_eState:n,m_chatRoom:{groupID:'12345',chatID:'901'}};}, // Steam connecting the bot (1–9)
  connect(){VC.m_VoiceCallState={m_eState:10,m_chatRoom:{groupID:'12345',chatID:'901'}};listed=true;},
  leave(){VC.OnUserEndVoiceChat();},
  elsewhere(){VC.m_VoiceCallState={m_eState:10,m_chatRoom:{groupID:'999',chatID:'5'}};listed=false;},
  silent(on){answering=!on;},
 };
}

/** Tyler's side: voice-call.js and automatic.js with stand-ins for the panel and the audio bridge. */
function tyler(steam,{voice={enabled:true,observing:true,peers:1}}={}){
 const elements=new Map(),intervals=[],listener=[],hints={asked:0,resolved:0},trail=[];let clock=2_000_000;
 const el=id=>{if(!elements.has(id))elements.set(id,{value:id==='botName'?'ROBOTIC TYLER':'50',checked:true,style:{},textContent:'',hidden:false,closest(){return this;},querySelector(){return null;}});return elements.get(id);};
 const region={isConnected:true,contains:()=>true,querySelectorAll:()=>[]},sample={isConnected:true};
 const audio={now:voice};
 const api={getMount:()=>({append(){}}),getRegion:()=>region,getSample:()=>sample,getComposer:()=>({isConnected:true}),isOwner:()=>true,getEpoch:()=>1,getVoiceState:()=>audio.now,
  pause(){},bridge(){},send(){},connect(){},getChatScope:()=>'test',showTab(){},
  voiceHelpNeeded(){hints.asked++;},voiceHelpResolved(){hints.resolved++;},trace:t=>trail.push(t)};
 class FakeDate extends Date{static now(){return clock;}}
 const box={console,performance,Date:FakeDate,clearTimeout(){},setTimeout:()=>0,setInterval:fn=>{intervals.push(fn);return intervals.length;},
  document:{createElement:()=>({querySelector:s=>el(s.slice(1))})},CSS:{escape:s=>s},
  window:{postMessage(m){if(m?.source==='tyler-listener-control')listener.push(m.type);},addEventListener(){}},location:{origin:'https://steamcommunity.com'},
  MutationObserver:class{observe(){}disconnect(){}},TylerCompanion:api,TylerSelection:{readiness:()=>'READY',selector:()=>'.message'},
  TylerIdentity:{speaker:()=>null},TylerStorage:{get:async()=>({}),set:async()=>{},onChanged:{addListener(){}}},
  chrome:{runtime:{sendMessage:async()=>({ok:true,noiseLevel:'balanced'}),onMessage:{addListener(){}}}},
  TylerSteamChat:{request:(node,op,values)=>steam.request(op,values)}};
 vm.runInNewContext(read('voice-call.js'),box);vm.runInNewContext(read('auto-policy.js'),box);vm.runInNewContext(read('automatic.js'),box);
 const t={api,box,audio,hints,trail,listener,el,
  call:()=>box.TylerVoiceCall.state(),
  // One poll of Steam (voice-call.js does this every 3 s) and one second of automatic.js.
  async look(){await box.TylerVoiceCall.refresh();for(const fn of intervals)fn();},
  wait(ms){clock+=ms;},
  mode:()=>el('mode').textContent,presence:()=>el('presence').textContent,now:()=>el('occupancyNow').textContent,
  async start(routing='auto'){await api.prepareAutomatic();api.setRoutingMode(routing);api.confirmNotice(true);return api.startAutomatic();}};
 return t;
}

test('the owner\'s case: the bot already in the call with 4 others (Steam knows), no click on a name, no hint',async()=>{
 const s=fakeSteam();s.friends(4);s.connect();const t=tyler(s);t.api.setRoutingMode('auto');await t.look();
 assert.equal(t.call().state,'connected');assert.equal(t.call().people,4,'the card: 4 others');
 assert.equal(t.api.detectVoice('ROBOTIC TYLER'),true,'Connect & start doesn\'t ask for the click (the name "ROBOTIC TYLER" isn\'t in the call)');
 // v2.40.0 read only the visible voice list here and stopped with "Finish Setup: choose your bot in the voice list."
 assert.equal(await t.start(),true,'automatic mode starts from Steam\'s own count');
 await t.look();
 assert.match(t.mode(),/^LISTENING/);assert.equal(t.listener.at(-1),'on');
 assert.equal(t.presence(),'4 other participants in the call → spoken replies · from Steam’s own call data');
 assert.equal(t.now(),t.presence(),'the Chat tab says it too, under the routing chips');
 assert.equal(t.hints.asked,0,'no hint asked for');
 assert.deepEqual(t.trail,['Voice occupancy: steam-call · 4 others · in-call · Steam step 10']);
 assert.equal(t.api.getOccupancy().source,'steam');
});

test('started in text, then the bot joins: Steam connecting is "wait", never the hint, and the count follows Steam',async()=>{
 const s=fakeSteam();s.friends(3);const t=tyler(s,{voice:{enabled:true,observing:true,peers:0}});
 assert.equal(await t.start(),true);await t.look();
 assert.match(t.mode(),/^TEXT/);assert.equal(t.presence(),'The bot isn’t in this group’s voice call → text replies · from Steam’s own call data');
 // Steam's steps 1–9 (joining): unknown with Steam's reason. The audio side now has a connection.
 t.audio.now={enabled:true,observing:true,peers:1};
 for(const n of [1,4,7,9]){s.step(n);await t.look();
  assert.equal(t.mode(),'WAITING — Steam is still connecting the voice call','step '+n);
  assert.match(t.presence(),/Steam is still connecting the bot to the call\. Tyler waits for Steam’s answer \(no hint needed\)/);}
 assert.equal(t.listener.at(-1),'off','unknown: Tyler doesn\'t listen');assert.equal(t.hints.asked,0,'Steam is answering: no hint');
 s.connect();await t.look();
 assert.match(t.mode(),/^LISTENING/);assert.equal(t.presence(),'3 other participants in the call → spoken replies · from Steam’s own call data');
 s.friends(1);await t.look();assert.match(t.presence(),/^1 other participant in the call/);
 s.friends(0);await t.look();assert.match(t.mode(),/^TEXT/,'the bot alone in the call: text replies');assert.equal(t.presence(),'Nobody else is in the call → text replies · from Steam’s own call data');
 s.leave();await t.look();assert.match(t.mode(),/^TEXT/);
 // (Start asks Steam itself before deciding, so even a start before Steam's first 3-second look reads Steam.)
 assert.deepEqual(t.trail,['Voice occupancy: steam-call · 0 others · not-in-call · Steam step 0','Voice occupancy: steam-call · count unknown · connecting · Steam step 1',
  'Voice occupancy: steam-call · 3 others · in-call · Steam step 10','Voice occupancy: steam-call · 1 other · in-call · Steam step 10','Voice occupancy: steam-call · 0 others · alone · Steam step 10','Voice occupancy: steam-call · 0 others · not-in-call · Steam step 0'],
  'one line per change, Steam\'s step not counted as a change');
});

test('Steam\'s own count wins over the audio side\'s "no connection" (v2.40.0 let that turn friends in voice into text replies)',async()=>{
 const s=fakeSteam();s.friends(2);s.connect();const t=tyler(s,{voice:{enabled:true,observing:true,peers:0}});await t.look();
 assert.equal(await t.start(),true);await t.look();
 assert.match(t.mode(),/^LISTENING/);assert.equal(t.api.getVoicePeople(),2);assert.match(t.presence(),/^2 other participants in the call → spoken replies · from Steam’s own call data$/);
});

test('a failed join that Steam has already left counts as "not in the call" (the card keeps Failed for two minutes)',async()=>{
 const s=fakeSteam();s.friends(2);const t=tyler(s);t.api.setRoutingMode('auto');await t.look();
 await t.box.TylerVoiceCall.join();assert.equal(t.call().state,'joining');
 await t.look();assert.equal(t.call().occupancy.why,'connecting');assert.equal(t.api.getVoicePeople(),null);
 s.leave();await t.look();assert.equal(t.call().state,'failed','the card still shows the failure');
 assert.equal(t.api.getVoicePeople(),0,'Steam: the bot is in no call');assert.match(t.presence(),/^The bot isn’t in this group’s voice call → text replies · from Steam’s own call data$/);
});

test('the bot in a call outside this group: unknown with that reason, no hint, no listening',async()=>{
 const s=fakeSteam();s.friends(2);s.connect();const t=tyler(s);await t.look();assert.equal(await t.start(),true);await t.look();
 s.elsewhere();await t.look();
 assert.equal(t.mode(),'WAITING — Steam reports the bot’s voice in use outside this group');assert.equal(t.listener.at(-1),'off');assert.equal(t.hints.asked,0);
 assert.match(t.presence(),/^Voice occupancy unknown: Steam reports the bot’s voice in use outside this group’s voice channel/);
 assert.equal(t.api.detectVoice('ROBOTIC TYLER'),true,'Steam answers, so Connect & start asks for no click');
});

test('Steam\'s data missing: the audio side\'s "no connection" says text; nothing at all asks for the hint once, and it clears itself',async()=>{
 const s=fakeSteam();s.friends(2);s.connect();const t=tyler(s);await t.look();assert.equal(await t.start(),true);await t.look();assert.match(t.mode(),/^LISTENING/);
 // Steam stops answering. Its last answer counts for 10 s, then it's unknown.
 s.silent(true);t.wait(4000);await t.look();assert.match(t.mode(),/^LISTENING/,'one missed answer isn\'t a change');
 t.wait(7000);await t.look();
 assert.equal(t.mode(),'WAITING — voice occupancy unknown: choose your bot in the voice list (Connect & start)');
 assert.match(t.presence(),/^Voice occupancy unknown: Steam’s call data isn’t available here \(Steam chat controls did not respond\)\. Choose your bot/);
 assert.equal(t.hints.asked,1);await t.look();await t.look();assert.equal(t.hints.asked,1,'asked once per spell, not every second');
 assert.equal(t.listener.at(-1),'off','unknown stays unknown: no listening');
 const resolvedBefore=t.hints.resolved;
 // Steam answers again: the count is back and the hint clears itself.
 s.silent(false);await t.look();
 assert.match(t.mode(),/^LISTENING/);assert.ok(t.hints.resolved>resolvedBefore,'the stale hint is cleared');
 // No Steam data and the audio side has no Steam voice connection at all: nobody can hear the bot → text.
 s.silent(true);t.wait(11000);t.audio.now={enabled:true,observing:true,peers:0};await t.look();
 assert.match(t.mode(),/^TEXT/);assert.equal(t.presence(),'No Steam voice connection, so nobody can hear the bot → text replies · from Tyler’s audio connection (Steam’s call data isn’t available)');
 assert.equal(t.trail.at(-1),'Voice occupancy: audio · 0 others · no-connection');
});

test('nothing can say who is in the call: Start asks for the hint; the visible voice list then works as before',async()=>{
 const s=fakeSteam();s.silent(true);const t=tyler(s);await t.look();
 assert.equal(t.api.detectVoice('ROBOTIC TYLER'),false,'Connect & start asks for the click');
 assert.equal(await t.start(),undefined);assert.match(t.mode(),/^Finish Setup: choose your bot in the voice list/);
 // The click: the bot's row in the voice list (stand-in rows with avatars, as Steam draws them).
 const row=name=>({innerText:name,isConnected:true,classList:[],getClientRects:()=>[1],querySelector:s=>s==='img'?{}:null,matches:()=>false});
 const rows=[row('Derpo'),row('Cursed Mike'),row('Silly'),row('Randy')],roster={isConnected:true,getClientRects:()=>[1],querySelectorAll:()=>rows};
 for(const r of rows){r.parentElement=roster;r.closest=()=>r;}
 assert.equal(t.api.acceptVoiceElement(rows[0]),true);assert.equal(t.el('botName').value,'Derpo');
 assert.equal(await t.start(),true);await t.look();
 assert.match(t.mode(),/^LISTENING/);assert.equal(t.presence(),'3 other participants in the voice list on screen → spoken replies · from the visible voice list, matched on the bot’s name: check this matches Steam');
 // Signal trail: fixed words only, never anyone's name.
 for(const line of t.trail){assert.match(line,/^Voice occupancy: (steam-call|roster|audio|text-only|unknown) · /);assert.doesNotMatch(line,/Derpo|Mike|Silly|Randy|Squad/);}
});

test('text-only routing never reads the call',async()=>{
 const s=fakeSteam();s.friends(4);s.connect();const t=tyler(s);await t.look();
 assert.equal(await t.start('text'),true);await t.look();
 assert.match(t.mode(),/^TEXT/);assert.equal(t.presence(),'Text replies only: this chat doesn’t use the voice call.');
 assert.equal(t.api.getVoicePeople(),4,'the number is still there for anything that asks');
});

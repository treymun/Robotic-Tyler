// v2.32: Steam voice Join / Leave in steam-chat-main.js, against a stand-in shaped like Steam's chat
// code (friendsui.js: StartVoiceChat, BVoiceActive, the call state, voiceRoomList, the member list,
// the .chatEndVoiceChat Leave button). Mocked: no Steam, no browser.
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('../browser-extension/steam-chat-main.js',import.meta.url),'utf8');

function steam({rooms:names=[['901','General Voice']],button=true}={}){
 const self={accountid:2},friend={accountid:3},log=[],calls=[];let members=[];
 const VC={m_VoiceCallState:{m_eState:0,m_chatRoom:null},
  InitiateRoomChat(g,c){calls.push('start '+c);this.m_VoiceCallState={m_eState:1,m_chatRoom:{groupID:g,chatID:c}};},
  IsVoiceActiveForRoom(g,c){const s=this.m_VoiceCallState;return !!s.m_chatRoom&&s.m_chatRoom.groupID===g&&s.m_chatRoom.chatID===c&&s.m_eState!==0;},
  OnUserEndVoiceChat(){calls.push('end');this.m_VoiceCallState={m_eState:0,m_chatRoom:null};members=[];},
  GetVoiceLogs:()=>log.join('\r\n')};
 const room=(id,name)=>({GetRoomID:()=>id,name,GetVoiceAllowed:()=>true,ChatStore:{VoiceChat:VC},StartVoiceChat(){if(!this.BVoiceActive())VC.InitiateRoomChat('12345',id);},
  ToggleVoiceChat(){calls.push('toggle '+id);this.BVoiceActive()?VC.OnUserEndVoiceChat():this.StartVoiceChat();},BVoiceActive(){return VC.IsVoiceActiveForRoom('12345',id);},
  get voice_active_contains_self(){return VC.m_VoiceCallState.m_chatRoom?.chatID===id&&members.includes(self);},get voice_active_member_list(){return {member_list:VC.m_VoiceCallState.m_chatRoom?.chatID===id?members:[friend]};}});
 const rooms=names.map(([id,name])=>room(id,name)),group={GetGroupID:()=>'12345',get voiceRoomList(){return rooms;}};
 const text={GetGroup:()=>group,GetVoiceAllowed:()=>false,self,ChatStore:{VoiceChat:VC}};
 const leave={isConnected:true,getClientRects:()=>[1],click(){calls.push('leave button');VC.OnUserEndVoiceChat();}};
 const node={nodeType:1,isConnected:true,closest:()=>null,parentElement:null,className:'msgText',__reactProps$x:{msg:{unAccountID:3,rtTimestamp:1700000000,unOrdinal:1},chatView:{chat:text}}};
 const document={querySelectorAll:s=>s==='.chatEndVoiceChat'&&button&&VC.m_VoiceCallState.m_eState?[leave]:[],addEventListener(){}};
 const box={document,window:{postMessage(){}},location:{origin:'https://steamcommunity.com'}};vm.runInNewContext(source,box);
 const handle=r=>box.TylerSteamChatAdapter.handle(node,r).then(x=>JSON.parse(JSON.stringify(x))); // (out of the vm's realm)
 return {handle,VC,calls,log,connect(){VC.m_VoiceCallState.m_eState=9;members=[self,friend];},other(){VC.m_VoiceCallState={m_eState:9,m_chatRoom:{groupID:'999',chatID:'5'}};}};
}

test('voice-state reads the group\'s channels and Steam\'s own call state',async()=>{
 const s=steam(),v=await s.handle({op:'voice-state'});
 assert.equal(v.groupId,'12345');assert.equal(v.state,0);assert.equal(v.activeRoom,null);assert.equal(v.elsewhere,false);
 assert.deepEqual(v.rooms,[{id:'901',name:'General Voice',self:false,count:1,active:false}]);
});

test('join presses Steam\'s own StartVoiceChat once; connected only at Steam\'s state 9 with the bot listed',async()=>{
 const s=steam(),r=await s.handle({op:'voice-join'});
 assert.equal(r.started,true);assert.equal(r.roomId,'901');assert.equal(r.activeRoom,'901');assert.deepEqual(s.calls,['start 901']);
 const again=await s.handle({op:'voice-join'});assert.equal(again.started,false,'already joining: nothing more');assert.deepEqual(s.calls,['start 901']);
 let v=await s.handle({op:'voice-state'});assert.equal(v.state,1);assert.equal(v.rooms[0].self,false);
 s.connect();v=await s.handle({op:'voice-state'});assert.equal(v.state,9);assert.equal(v.rooms[0].self,true);assert.equal(v.rooms[0].count,2);
});

test('leave uses Steam\'s Leave button, or the room\'s toggle when it isn\'t on screen; nothing when not in the call',async()=>{
 let s=steam();assert.equal((await s.handle({op:'voice-leave'})).left,false);assert.deepEqual(s.calls,[]);
 await s.handle({op:'voice-join'});s.connect();const r=await s.handle({op:'voice-leave'});assert.equal(r.left,true);assert.equal(r.via,'button');assert.equal(r.activeRoom,null);
 s=steam({button:false});await s.handle({op:'voice-join'});s.connect();assert.equal((await s.handle({op:'voice-leave'})).via,'room');assert.deepEqual(s.calls,['start 901','toggle 901','end']);
});

test('more than one channel needs a choice (or the remembered one); another call is never taken over',async()=>{
 const s=steam({rooms:[['901','General'],['902','Raid']]});
 const r=await s.handle({op:'voice-join'});assert.equal(r.choose,true);assert.equal(r.started,false);assert.deepEqual(s.calls,[]);
 assert.equal((await s.handle({op:'voice-join',roomId:'902'})).roomId,'902');assert.deepEqual(s.calls,['start 902']);
 const t=steam();t.other();await assert.rejects(t.handle({op:'voice-join'}),/another Steam voice call/);assert.deepEqual(t.calls,[]);
 assert.equal((await t.handle({op:'voice-state'})).elsewhere,true);
 const none=steam({rooms:[]});await assert.rejects(none.handle({op:'voice-join'}),/no voice channel/);
});

test('Steam\'s voice log: its tagged lines only, with addresses, ports, ids and ICE secrets hidden',async()=>{
 const s=steam();
 s.log.push('(VoiceChat) Call to room 901 now initating getUserMedia/WebRTC','v=0','a=candidate:1 1 udp 2122 192.168.1.20 50000 typ host','(WebRTC) Offer (Local Description): v=0',
  '(WebRTC) WebRTC session connected 203.0.113.9:27015 => 10.0.0.2:3478','(VoiceChat) Join for 76561198000000000 ufrag=abcd failed: timed out');
 const v=await s.handle({op:'voice-state',logs:true});
 assert.deepEqual(v.log,['(VoiceChat) Call to room 901 now initating getUserMedia/WebRTC','(WebRTC) WebRTC session connected [address] => [address]','(VoiceChat) Join for [id] ufrag [hidden] failed: timed out']);
 assert.equal((await s.handle({op:'voice-state'})).log,undefined,'only when asked (the full check)');
 // v2.32.3: Steam's "Still trying…" every two seconds collapses to the latest, so the earlier steps stay.
 const t=steam();t.log.push('(VoiceChat) Call to room 901 now initating getUserMedia/WebRTC','(WebRTC) Set remote description','(WebRTC) ICE state checking');
 for(let n=1;n<=20;n++)t.log.push('(VoiceChat) Still trying to connect to voice chat/webrtc InitiatedWebRTCSession(5) '+n*2000+'ms elapsed...');
 const w=await t.handle({op:'voice-state',logs:true});
 assert.deepEqual(w.log,['(VoiceChat) Call to room 901 now initating getUserMedia/WebRTC','(WebRTC) Set remote description','(WebRTC) ICE state checking','(VoiceChat) Still trying to connect to voice chat/webrtc InitiatedWebRTCSession(5) 40000ms elapsed...']);
});

// v2.33: automatic and voice mode read who is in the call from Steam's own call data (voice-call.js),
// so the bot's name doesn't have to be clicked in the voice list. The visible list stays the fallback.
// Mocked: no Steam, no browser (automatic.js in a vm with a stand-in TylerVoiceCall).
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const read=f=>readFileSync(new URL('../browser-extension/'+f,import.meta.url),'utf8');

function load(call){
 const elements=new Map(),intervals=[];
 const el=id=>{if(!elements.has(id))elements.set(id,{value:id==='botName'?'ROBOTIC TYLER':'50',checked:true,style:{},textContent:'',closest(){return this;}});return elements.get(id);};
 const api={getMount:()=>({append(){}}),getRegion:()=>({isConnected:true}),getSample:()=>({isConnected:true}),getComposer:()=>({isConnected:true}),isOwner:()=>true,getEpoch:()=>1,getVoiceState:()=>({}),pause(){},bridge(){},send(){},getChatScope:()=>'test'};
 const box={console,performance,Date,clearTimeout(){},setTimeout:()=>0,setInterval:fn=>{intervals.push(fn);return intervals.length;},document:{createElement:()=>({querySelector:s=>el(s.slice(1))})},
  window:{postMessage(){},addEventListener(){}},location:{origin:'https://steamcommunity.com'},MutationObserver:class{observe(){}disconnect(){}},TylerCompanion:api,TylerSelection:{readiness:()=>'READY',selector:()=>'.message'},
  TylerIdentity:{speaker:()=>null},TylerStorage:{get:async()=>({}),onChanged:{addListener(){}}},chrome:{runtime:{sendMessage:async()=>({ok:true,noiseLevel:'balanced'}),onMessage:{addListener(){}}}},TylerVoiceCall:{state:()=>call.now}};
 vm.runInNewContext(read('auto-policy.js'),box);vm.runInNewContext(read('automatic.js'),box);
 return {api,presence:()=>{for(const fn of intervals)fn();return el('presence').textContent;}};
}

test('who is in the call comes from Steam: no click on the bot\'s name needed',()=>{
 const call={now:{state:'connected',people:2,elsewhere:false}},t=load(call);t.api.setRoutingMode('auto');
 assert.equal(t.api.getVoicePeople(),2);assert.match(t.presence(),/^2 other participants in the call · read from Steam automatically$/);
 assert.equal(t.api.detectVoice('ROBOTIC TYLER'),true,'Connect & start doesn\'t ask for the click');
 call.now={state:'connected',people:1,elsewhere:false};assert.match(t.presence(),/^1 other participant in the call/);
 call.now={state:'connected',people:0,elsewhere:false};assert.equal(t.api.getVoicePeople(),0);assert.match(t.presence(),/isn’t in a voice call with anyone/);
 call.now={state:'disconnected',people:0,elsewhere:false};assert.equal(t.api.getVoicePeople(),0,'the bot in no call: nobody to talk to (text replies in Auto)');
});

test('when Steam\'s data can\'t say, the visible voice list is the fallback, as before',()=>{
 for(const now of [{state:'joining',people:3},{state:'leaving',people:3},{state:'failed',people:0},{state:'unavailable',people:0},{state:'connected',people:2,elsewhere:true},null]){
  const t=load({now});t.api.setRoutingMode('auto');
  assert.equal(t.api.getVoicePeople(),null,JSON.stringify(now)+': unknown without the list');
  assert.match(t.presence(),/Voice occupancy unknown — choose your bot in the visible voice list\./);
  assert.equal(t.api.detectVoice('ROBOTIC TYLER'),false,'still asks for the hint');}
});

test('text-only routing never reads the call',()=>{
 const t=load({now:{state:'connected',people:4}});t.api.setRoutingMode('text');t.presence();
 assert.equal(t.api.getVoicePeople(),4,'the number is still there for anything that asks');
});

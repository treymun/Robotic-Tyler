// v2.6: one shared command list (commands.js) and message details read from Steam's
// own record (steam-chat-main.js stamps, identity.js reads).
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {message} from './helpers/message-dom.mjs';
const source=f=>readFileSync(new URL('../browser-extension/'+f,import.meta.url),'utf8');
const steamId=n=>String(76561197960265728n+BigInt(n));

function registry(){
 const box={URL,console};
 for(const f of ['moderation-core.js','music-core.js','soundboard-core.js','arcade-plus.js','commands.js'])vm.runInNewContext(source(f),box);
 return box.TylerCommands;
}

test('every command line has exactly one owner',()=>{
 const C=registry();
 const owned={'!votekick Sam':'moderation','!votemute Sam':'moderation','!modhelp':'moderation','!play Daft Punk One More Time':'music',
  '!vote Portal 2':'squad-vote','!party join':'squad-party','!trivia':'squad-trivia','!answer 2':'squad-trivia','!roast join':'squad-roast',
  '!help':'help','play trivia':'arcade','sound 1':'sounds','!tyler ask what time is it':'tyler','!rules':'custom','!game roll':'arcade'};
 for(const [line,id] of Object.entries(owned))assert.equal(C.owner(line),id,line);
 assert.deepEqual(C.conflicts(Object.keys(owned)),[]);
 for(const line of ['hey tyler how are you','what game should we play','gg','!']) assert.equal(C.owner(line),null,line);
});

test('the AI skips any line a feature owns; the custom catch-all only while it is on',()=>{
 const C=registry();
 assert.equal(C.claims('hello everyone'),false);
 assert.equal(C.claims('nice one\n!vote Portal'),true,'any line of a multi-line message');
 assert.equal(C.claims('!votekick Sam'),true,'owned even while moderation is switched off');
 assert.equal(C.claims('!rules'),false);C.set('custom',{enabled:true,usage:['!rules']});assert.equal(C.claims('!rules'),true);
 assert.equal(C.claimedByOther('!votekick Sam','custom'),true);assert.equal(C.claimedByOther('!cheer','custom'),false);
 // A feature can supply a live matcher, e.g. single-letter answers during an arcade round.
 let round=false;C.set('arcade',{match:t=>round&&/^[a-d]$/i.test(t)});
 assert.equal(C.claims('B'),false);round=true;assert.equal(C.claims('B'),true);
});

test('!help is generated from whatever is switched on',()=>{
 const C=registry();
 assert.match(C.helpText(),/none are switched on/);
 let locked=false;C.set('music',{enabled:()=>!locked});C.set('squad-vote',{enabled:true});
 const on=C.helpText();assert.match(on,/!play ARTIST SONG/);assert.match(on,/!vote GAME/);assert.doesNotMatch(on,/!game get/i);
 locked=true;assert.doesNotMatch(C.helpText(),/!play/,'follows the feature state live');
 C.set('custom',{enabled:true,usage:['!rules','!discord']});assert.match(C.helpText(),/!rules, !discord/);
 for(const id of ['tyler','moderation','music','squad-party','squad-trivia','squad-roast','arcade','sounds'])C.set(id,{enabled:true});
 assert.ok(C.helpText().length<=460);
 assert.equal(C.list().find(c=>c.id==='arcade-legacy').hidden,true);
});

// Two worlds: steam-chat-main.js (MAIN) stamps data-* attributes synchronously when the
// isolated world dispatches tyler-read-message-meta; identity.js reads them.
function steamMessage({sender=5,self=2,ordinal=3}={}){
 const g=message('Alex',null),listeners={};
 g.body.attributes.class='msgText';g.body.parentElement.attributes.class='msg';
 const group={GetGroupID:()=> '12345'},chat={GetGroup:()=>group,self:{accountid:self}};
 const stamp=Math.floor(Date.now()/1000),msg={unAccountID:sender,rtTimestamp:stamp,unOrdinal:ordinal};
 g.body.__reactFiber$steam={memoizedProps:{className:'msgText'},stateNode:g.body,return:{memoizedProps:{msg,chatView:{chat}}}};
 const document={querySelectorAll:()=>[],addEventListener:(type,fn)=>{(listeners[type]||=[]).push(fn);}};
 vm.runInNewContext(source('steam-chat-main.js'),{Date,document,window:{postMessage(){},addEventListener(){}},location:{origin:'https://steamcommunity.com'}});
 g.body.onProbe=e=>{for(const fn of listeners[e.type]||[])fn(e);};
 const isolated={URL,Event};vm.runInNewContext(source('identity.js'),isolated);
 return {g,msg,stamp,api:isolated.TylerIdentity};
}

test('message sender, time and id come from Steam’s own record',()=>{
 const {g,msg,stamp,api}=steamMessage();
 assert.deepEqual({...api.meta(g.body)},{senderId:steamId(5),at:stamp*1000,key:'12345:'+stamp+'_3',self:false,group:'12345'});
 // No account on the page (no avatar link): the sender still resolves from Steam's record, with the page's name.
 const who=api.speaker(g.body,g.region);assert.equal(who.id,steamId(5));assert.equal(who.name,'Alex');
 // Steam reuses message elements: the stamp follows the record, never a stale value.
 msg.unAccountID=6;assert.equal(api.meta(g.body).senderId,steamId(6));
 msg.unAccountID=2;assert.equal(api.meta(g.body).self,true,'Tyler’s own account');
 delete g.body.__reactFiber$steam;assert.equal(api.meta(g.body),null);assert.equal(g.body.getAttribute('data-tyler-msg-sender'),null);
});

test('without the Steam record (e.g. a changed layout) nothing is invented',()=>{
 const g=message('Alex',null),isolated={URL,Event};vm.runInNewContext(source('identity.js'),isolated);
 assert.equal(isolated.TylerIdentity.meta(g.body),null);assert.equal(isolated.TylerIdentity.speaker(g.body,g.region),null);
});

test('the AI conversation skips Tyler’s own messages, re-rendered history and commands',async()=>{
 const g=message('Alex','123456'),elements=new Map(),observers=[],timers=[],requests=[];let stampOf=null;
 g.body.onProbe=({target})=>{for(const k of ['data-tyler-msg-sender','data-tyler-msg-at','data-tyler-msg-self'])target.removeAttribute(k);const s=stampOf?.();if(!s)return;target.setAttribute('data-tyler-msg-sender',steamId(123456));target.setAttribute('data-tyler-msg-at',String(s.at));target.setAttribute('data-tyler-msg-self',s.self?'1':'0');};
 const el=id=>{if(!elements.has(id))elements.set(id,{value:'50',checked:true,style:{},textContent:'',closest(){return this;}});return elements.get(id);};
 const api={getMount:()=>({append(){}}),getRegion:()=>g.region,getSample:()=>g.body,getComposer:()=>({isConnected:true}),isOwner:()=>true,getEpoch:()=>1,getVoiceState:()=>({}),pause(){},bridge(){},send(){},getChatScope:()=> 'test',request:async m=>{requests.push(m);return {ok:true,text:'Hi Alex'};}};
 const box={URL,Event,console,performance,Date,clearTimeout(){},setTimeout:(fn,ms)=>{timers.push({fn,ms});return timers.length;},setInterval(){},document:{createElement:()=>({querySelector:s=>el(s.slice(1))})},window:{postMessage(){},addEventListener(){}},location:{origin:'https://steamcommunity.com'},MutationObserver:class{constructor(fn){this.fn=fn;observers.push(this);}observe(){}disconnect(){}},TylerCompanion:api,TylerSelection:{readiness:()=> 'READY',selector:()=> '.msg_Text'},TylerStorage:{get:async()=>({}),onChanged:{addListener(){}}},chrome:{runtime:{sendMessage:async()=>({ok:true,noiseLevel:'balanced'}),onMessage:{addListener(){}}}}};
 for(const f of ['chat-tag.js','identity.js','commands.js','auto-policy.js','automatic.js'])vm.runInNewContext(source(f),box);
 await api.prepareAutomatic();api.setRoutingMode('text');api.confirmNotice(true);await api.startAutomatic();
 const deliver=text=>{g.body.text=text;timers.length=0;observers.at(-1).fn([{type:'characterData',target:{nodeType:3,parentElement:g.body}}]);return timers.some(t=>t.ms===350);};
 stampOf=()=>({at:Date.now(),self:true});assert.equal(deliver('ROBOTIC TYLER are you there? (sent by the bot account)'),false,'own message');
 stampOf=()=>({at:Date.now()-10*60000,self:false});assert.equal(deliver('ROBOTIC TYLER are you there? (old)'),false,'history from before the start');
 stampOf=()=>({at:Date.now(),self:false});assert.equal(deliver('ROBOTIC TYLER\n!vote Portal'),false,'a feature owns a line of it');
 assert.equal(deliver('ROBOTIC TYLER are you there?'),true,'a new message from a friend is answered');
});

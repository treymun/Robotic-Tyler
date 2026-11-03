import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import {Element,message} from './helpers/message-dom.mjs';
const source=f=>readFileSync(new URL('../browser-extension/'+f,import.meta.url),'utf8');
const id=n=>String(76561197960265728n+BigInt(n));
async function fixture({enabled=true,permission=true,muteEnabled=true,adminEnabled=true,deletePermission=true}={}){
 let now=100000,ordinal=0,runtimeListener,observer;const runtimeListeners=[],observers=[];const posts=[],kicks=[],deletes=[],intervals=[],docListeners=new Map(),windowListeners=[],controls=new Map(),timers=new Map();let timerSeq=0,epochGroup='12345';
 const region=new Element('ChatHistory',{role:'log'}),docRoot=new Element('root');let sample;
 class Clock extends Date{static now(){return now;}}
 const members=Array.from({length:7},(_,i)=>({accountid:i+1,display_name:['Owner','Tyler','Alex','Sam','Lee','Pat','Target'][i]}));
 const group={GetGroupID:()=>epochGroup,GetOwnerAccountID:()=>1,BIsAccountIDOwner:n=>n===1,BCanKick:()=>permission,BCanKickMember:n=>permission&&n>2,BHasMember:n=>members.some(m=>m.accountid===n),memberList:{member_list:members},async KickUser(n,expiration){kicks.push({n,expiration});}};
 group.BCanBan=()=>deletePermission;group.BCanBanMember=n=>deletePermission&&n>2;group.BCanDeleteMemberMessages=n=>deletePermission&&n>1;const chat={GetGroup:()=>group,GetRoomID:()=> '777',self:members[1],DeleteChatMessages:async messages=>{deletes.push(messages);return 1;}};
 const probe=e=>{for(const fn of docListeners.get(e.type)||[])fn(e);};docRoot.onProbe=probe;
 function add(text,account,at=now){const g=message(members[account-1].display_name,null);g.body.attributes.class='msgText';g.body.parentElement.attributes.class='msg';g.body.text=text;g.body.onProbe=probe;const msg={unAccountID:account,rtTimestamp:at/1000,unOrdinal:++ordinal};g.body.__reactFiber$fixture={memoizedProps:{className:'msgText'},stateNode:g.body,return:{memoizedProps:{msg,chatView:{chat}}}};region.append(g.row);sample=g.body;return g;}
 add('Old baseline message',3);
 const control=key=>{if(!controls.has(key))controls.set(key,{checked:false,value:'',textContent:'',children:[],replaceChildren(){this.children=[];this.value='';},append(v){this.children.push(v);this.value||=v.value;}});return controls.get(key);};
 const panel={querySelector:s=>control(s.slice(1)),addEventListener(){}};
 const document={documentElement:docRoot,querySelectorAll:()=>[],createElement:tag=>tag==='option'?{value:'',textContent:''}:panel,addEventListener:(name,fn)=>{if(!docListeners.has(name))docListeners.set(name,[]);docListeners.get(name).push(fn);}};
 const win={addEventListener:(_type,fn)=>windowListeners.push(fn),postMessage:data=>queueMicrotask(()=>windowListeners.forEach(fn=>fn({source:win,origin:'https://steamcommunity.com',data})))};
 const api={getMount:()=>({append(){}}),getRegion:()=>region,getSample:()=>sample,getChatScope:()=>epochGroup,isOwner:()=>true,send:text=>posts.push(text)};
 const box={URL,Event,Date:Clock,crypto:{randomUUID},queueMicrotask,document,window:win,location:{origin:'https://steamcommunity.com'},setInterval:(fn,ms)=>intervals.push({fn,ms}),setTimeout:(fn,ms)=>{const key=++timerSeq;timers.set(key,{fn,at:now+ms});return key;},clearTimeout:key=>timers.delete(key),TylerCompanion:api,TylerSelection:{selector:()=>'.msgText'},MutationObserver:class{constructor(fn){this.fn=fn;observers.push(this);}observe(){this.active=true;}disconnect(){this.active=false;}},chrome:{runtime:{onMessage:{addListener:fn=>runtimeListeners.push(fn)},sendMessage:async m=>{if(m.type==='admin:log')return {ok:true,events:[]};if(m.type==='admin:settings'){if(m.enabled!==undefined)adminEnabled=m.enabled;return {ok:true,enabled:adminEnabled};}if(m.type==='moderation:mute-settings'){if(m.enabled!==undefined)muteEnabled=m.enabled;return {ok:true,enabled:muteEnabled};}assert.equal(m.type,'moderation:settings');if(m.enabled!==undefined)enabled=m.enabled;return {ok:true,enabled};}}}};
 for(const f of ['sender-main.js','steam-chat-main.js','identity.js','steam-chat-client.js','chat-bus.js','moderation-core.js','moderation.js','admin.js'])vm.runInNewContext(source(f),box);
 const settle=async()=>{for(let i=0;i<12;i++)await new Promise(resolve=>setImmediate(resolve));};
 const advance=ms=>{now+=ms;for(const [key,t] of [...timers])if(t.at<=now){timers.delete(key);t.fn();}};
 for(const i of intervals)i.fn();await settle();
 const notify=records=>observers.filter(o=>o.active).forEach(o=>o.fn(records));
 return {posts,kicks,deletes,controls,settle,advance,
  async tick(){for(const i of intervals)i.fn();await settle();},
  async disableMute(){control('modMuteEnabled').checked=false;await control('modMuteEnabled').onchange();await settle();},
  async unmute(n=7){control('adminMuted').value=id(n);control('adminUnmute').onclick();await settle();},
  async chat(text,who=3,{old=false}={}){advance(3000);const g=add(text,who,old?now-120000:now);notify([{type:'childList',addedNodes:[g.body],target:region}]);await settle();return g;},
  async disable(){control('modEnabled').checked=false;await control('modEnabled').onchange();await settle();},
  async enable(){control('modEnabled').checked=true;await control('modEnabled').onchange();await settle();},
  async stop(){for(const f of runtimeListeners)f({type:'v22:stop'});await settle();},
  async expire(){advance(61000);intervals.at(-1).fn();await settle();},
  async changeGroup(){epochGroup='99999';for(const i of intervals)i.fn();await settle();},
  async replay(g){notify([{type:'childList',addedNodes:[g.body],target:region}]);await settle();}
 };
}

test('three distinct voters start a five-minute mute through the real Chrome controllers and bridge',async()=>{
 const h=await fixture();await h.chat('!votemute Target',3);assert.match(h.controls.get('modPoll').textContent,/1\/3 yes/);assert.match(h.controls.get('modPoll').textContent,/TEXT MUTE/);
 await h.chat('!votemute Pat',4);assert.match(h.controls.get('modStatus').textContent,/already active/);await h.chat('!kick yes',4);assert.match(h.controls.get('modStatus').textContent,/Use !mute/);
 await h.chat('!mute yes',4);await h.chat('!mute yes',4);assert.match(h.controls.get('modPoll').textContent,/2\/3 yes/);await h.chat('!mute yes',5);assert.match(h.controls.get('modPoll').textContent,/muted/);assert.equal(h.kicks.length,0);
 await h.chat('This new message is muted',7);assert.equal(h.deletes.length,1);await h.chat('Someone else still speaks',6);assert.equal(h.deletes.length,1);await h.tick();assert.match(h.controls.get('adminMuteStatus').textContent,/remaining/);
 await h.chat('!votemute Target',3);assert.match(h.controls.get('modStatus').textContent,/already text muted/);h.advance(300000);await h.tick();assert.match(h.controls.get('adminMuteStatus').textContent,/No active/);await h.chat('Now allowed',7);assert.equal(h.deletes.length,1);
});

test('mute vote defaults can be disabled, local unmute works and missing deletion permission blocks it',async()=>{
 const h=await fixture();await h.chat('!votemute Target',3);await h.chat('!mute yes',4);await h.chat('!mute yes',5);await h.unmute();await h.chat('Unmuted early',7);assert.equal(h.deletes.length,0);
 const disabled=await fixture({muteEnabled:false});await disabled.chat('!votemute Target',3);assert.doesNotMatch(disabled.controls.get('modPoll').textContent,/Target/);
 const missing=await fixture({deletePermission:false});await missing.chat('!votemute Target',3);assert.match(missing.controls.get('modStatus').textContent,/permission/);assert.equal(missing.deletes.length,0);
 const soloPermission=await fixture({permission:false,enabled:false});await soloPermission.chat('!votemute Target',3);await soloPermission.chat('!mute yes',4);await soloPermission.chat('!mute yes',5);assert.match(soloPermission.controls.get('modPoll').textContent,/muted/);await soloPermission.chat('!modhelp',3);assert.match(soloPermission.posts.at(-1),/TYLER MODERATION/);
});

test('disabling mute votes clears timed mutes and group changes cancel pending ballots',async()=>{
 const h=await fixture();await h.chat('!votemute Target',3);await h.chat('!mute yes',4);await h.chat('!mute yes',5);await h.disableMute();await h.chat('Visible after disabling',7);assert.equal(h.deletes.length,0);
 const moved=await fixture();await moved.chat('!votemute Target',3);await moved.chat('!mute yes',4);await moved.changeGroup();await moved.chat('!mute yes',5);assert.equal(moved.deletes.length,0);assert.match(moved.controls.get('modPoll').textContent,/cancelled/);
});

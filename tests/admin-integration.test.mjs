import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import {Element,message} from './helpers/message-dom.mjs';
const source=f=>readFileSync(new URL('../browser-extension/'+f,import.meta.url),'utf8');
const id=n=>String(76561197960265728n+BigInt(n));
async function fixture({enabled=true,permission=true}={}){
 let now=100000,ordinal=0,runtimeListener,observer;const posts=[],kicks=[],deletes=[],intervals=[],docListeners=new Map(),windowListeners=[],controls=new Map(),timers=new Map();let timerSeq=0,epochGroup='12345';
 const region=new Element('ChatHistory',{role:'log'}),docRoot=new Element('root');let sample;
 class Clock extends Date{static now(){return now;}}
 const members=Array.from({length:7},(_,i)=>({accountid:i+1,display_name:['Owner','Tyler','Alex','Sam','Lee','Pat','Target'][i]}));
 const group={GetGroupID:()=>epochGroup,GetOwnerAccountID:()=>1,BIsAccountIDOwner:n=>n===1,BCanKick:()=>permission,BCanKickMember:n=>permission&&n>2,BHasMember:n=>members.some(m=>m.accountid===n),memberList:{member_list:members},async KickUser(n,expiration){kicks.push({n,expiration});}};
 group.BCanBan=()=>permission;group.BCanBanMember=n=>permission&&n>2;group.BCanDeleteMemberMessages=n=>permission&&n>1;const chat={GetGroup:()=>group,GetRoomID:()=> '777',self:members[1],DeleteChatMessages:async messages=>{deletes.push(messages);return 1;}};
 const probe=e=>{for(const fn of docListeners.get(e.type)||[])fn(e);};docRoot.onProbe=probe;
 function add(text,account,at=now){const g=message(members[account-1].display_name,null);g.body.attributes.class='msgText';g.body.parentElement.attributes.class='msg';g.body.text=text;g.body.onProbe=probe;const msg={unAccountID:account,rtTimestamp:at/1000,unOrdinal:++ordinal};g.body.__reactFiber$fixture={memoizedProps:{className:'msgText'},stateNode:g.body,return:{memoizedProps:{msg,chatView:{chat}}}};region.append(g.row);sample=g.body;return g;}
 add('Old baseline message',3);
 const control=key=>{if(!controls.has(key))controls.set(key,{checked:false,value:'',textContent:'',children:[],replaceChildren(){this.children=[];this.value='';},append(v){this.children.push(v);this.value||=v.value;}});return controls.get(key);};
 const panel={querySelector:s=>control(s.slice(1)),addEventListener(){}};
 const document={documentElement:docRoot,querySelectorAll:()=>[],createElement:tag=>tag==='option'?{value:'',textContent:''}:panel,addEventListener:(name,fn)=>{if(!docListeners.has(name))docListeners.set(name,[]);docListeners.get(name).push(fn);}};
 const win={addEventListener:(_type,fn)=>windowListeners.push(fn),postMessage:data=>queueMicrotask(()=>windowListeners.forEach(fn=>fn({source:win,origin:'https://steamcommunity.com',data})))};
 const api={getMount:()=>({append(){}}),getRegion:()=>region,getSample:()=>sample,getChatScope:()=>epochGroup,isOwner:()=>true,send:text=>posts.push(text)};
 const box={URL,Event,Date:Clock,crypto:{randomUUID},queueMicrotask,document,window:win,location:{origin:'https://steamcommunity.com'},setInterval:(fn,ms)=>intervals.push({fn,ms}),setTimeout:(fn,ms)=>{const key=++timerSeq;timers.set(key,{fn,at:now+ms});return key;},clearTimeout:key=>timers.delete(key),TylerCompanion:api,TylerSelection:{selector:()=>'.msgText'},MutationObserver:class{constructor(fn){observer=fn;}observe(){}disconnect(){}},chrome:{runtime:{onMessage:{addListener:fn=>runtimeListener=fn},sendMessage:async m=>{if(m.type==='admin:log')return {ok:true,events:[]};assert.equal(m.type,'admin:settings');if(m.enabled!==undefined)enabled=m.enabled;return {ok:true,enabled};}}}};
 for(const f of ['steam-chat-main.js','steam-chat-client.js','chat-bus.js','admin.js'])vm.runInNewContext(source(f),box);
 const settle=async()=>{for(let i=0;i<12;i++)await new Promise(resolve=>setImmediate(resolve));};
 const advance=ms=>{now+=ms;for(const [key,t] of [...timers])if(t.at<=now){timers.delete(key);t.fn();}};
 intervals[0].fn();await settle();
 return {posts,kicks,deletes,controls,settle,advance,
  async chat(text,who=3,{old=false}={}){advance(3000);const g=add(text,who,old?now-120000:now);observer?.([{type:'childList',addedNodes:[g.body],target:region}]);await settle();return g;},
  async mute(n=3){control('adminMuteMember').value=id(n);control('adminMute').onclick();await settle();},
  async unmute(n=3){control('adminMuted').value=id(n);control('adminUnmute').onclick();await settle();},
  async disable(){control('adminEnabled').checked=false;control('adminEnabled').onchange();await settle();},
  async stop(){runtimeListener({type:'v22:stop'});await settle();},
  async changeGroup(){epochGroup='99999';intervals[0].fn();await settle();},
  async replay(g){observer?.([{type:'childList',addedNodes:[g.body],target:region}]);await settle();}
 };
}

test('Chrome admin panel text mute ignores baseline/history, deletes only future target messages and stops on unmute',async()=>{
 const h=await fixture();assert.equal(h.controls.get('adminEnabled').checked,true);assert.equal(h.deletes.length,0);
 await h.mute();assert.match(h.controls.get('adminStatus').textContent,/Text muted Alex/);assert.equal(h.deletes.length,0);
 await h.chat('Old history loaded after the mute',3,{old:true});assert.equal(h.deletes.length,0);
 await h.chat('A different member is speaking',4);assert.equal(h.deletes.length,0);
 const msg=await h.chat('New message from muted member',3);assert.equal(h.deletes.length,1);await h.replay(msg);assert.equal(h.deletes.length,1);
 await h.unmute();await h.chat('Now allowed',3);assert.equal(h.deletes.length,1);assert.equal(h.posts.length,0);
});

test('Chrome text mutes stop when disabled, emergency stopped or changing connected group',async()=>{
 for(const method of ['disable','stop','changeGroup']){const h=await fixture();await h.mute();await h[method]();await h.chat('Should remain visible',3);assert.equal(h.deletes.length,0,method);}
 const h=await fixture({permission:false});assert.equal(h.controls.get('adminEnabled').checked,false);assert.equal(h.controls.get('adminMute').disabled,true);await h.mute();await h.chat('No permission',3);assert.equal(h.deletes.length,0);
});

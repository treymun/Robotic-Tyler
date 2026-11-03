import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import {Element,message} from './helpers/message-dom.mjs';
const source=f=>readFileSync(new URL('../browser-extension/'+f,import.meta.url),'utf8');
const id=n=>String(76561197960265728n+BigInt(n));
async function fixture({enabled=true,permission=true}={}){
 let now=100000,ordinal=0,runtimeListener,observer;const posts=[],kicks=[],intervals=[],docListeners=new Map(),windowListeners=[],controls=new Map(),timers=new Map();let timerSeq=0,epochGroup='12345';
 const region=new Element('ChatHistory',{role:'log'}),docRoot=new Element('root');let sample;
 class Clock extends Date{static now(){return now;}}
 const members=Array.from({length:7},(_,i)=>({accountid:i+1,display_name:['Owner','Tyler','Alex','Sam','Lee','Pat','Target'][i]}));
 const group={GetGroupID:()=>epochGroup,GetOwnerAccountID:()=>1,BIsAccountIDOwner:n=>n===1,BCanKick:()=>permission,BCanKickMember:n=>permission&&n>2,BHasMember:n=>members.some(m=>m.accountid===n),memberList:{member_list:members},async KickUser(n,expiration){kicks.push({n,expiration});}};
 const chat={GetGroup:()=>group,self:members[1]};
 const probe=e=>{for(const fn of docListeners.get(e.type)||[])fn(e);};docRoot.onProbe=probe;
 function add(text,account,at=now){const g=message(members[account-1].display_name,null);g.body.attributes.class='msgText';g.body.parentElement.attributes.class='msg';g.body.text=text;g.body.onProbe=probe;const msg={unAccountID:account,rtTimestamp:at/1000,unOrdinal:++ordinal};g.body.__reactFiber$fixture={memoizedProps:{className:'msgText'},stateNode:g.body,return:{memoizedProps:{msg,chatView:{chat}}}};region.append(g.row);sample=g.body;return g;}
 add('Old baseline message',3);
 const control=key=>{if(!controls.has(key))controls.set(key,{checked:false,value:'',textContent:'',children:[],replaceChildren(){this.children=[];this.value='';},append(v){this.children.push(v);this.value||=v.value;}});return controls.get(key);};
 const panel={querySelector:s=>control(s.slice(1)),addEventListener(){}};
 const document={documentElement:docRoot,querySelectorAll:()=>[],createElement:tag=>tag==='option'?{value:'',textContent:''}:panel,addEventListener:(name,fn)=>{if(!docListeners.has(name))docListeners.set(name,[]);docListeners.get(name).push(fn);}};
 const win={addEventListener:(_type,fn)=>windowListeners.push(fn),postMessage:data=>queueMicrotask(()=>windowListeners.forEach(fn=>fn({source:win,origin:'https://steamcommunity.com',data})))};
 const api={getMount:()=>({append(){}}),getRegion:()=>region,getSample:()=>sample,getChatScope:()=>epochGroup,isOwner:()=>true,send:text=>posts.push(text)};
 const box={URL,Event,Date:Clock,crypto:{randomUUID},queueMicrotask,document,window:win,location:{origin:'https://steamcommunity.com'},setInterval:(fn,ms)=>intervals.push({fn,ms}),setTimeout:(fn,ms)=>{const key=++timerSeq;timers.set(key,{fn,at:now+ms});return key;},clearTimeout:key=>timers.delete(key),TylerCompanion:api,TylerSelection:{selector:()=>'.msgText'},MutationObserver:class{constructor(fn){observer=fn;}observe(){}disconnect(){}},chrome:{runtime:{onMessage:{addListener:fn=>runtimeListener=fn},sendMessage:async m=>{if(m.type==='moderation:mute-settings')return {ok:true,enabled:false};assert.equal(m.type,'moderation:settings');if(m.enabled!==undefined)enabled=m.enabled;return {ok:true,enabled};}}}};
 for(const f of ['sender-main.js','steam-chat-main.js','identity.js','steam-chat-client.js','chat-bus.js','moderation-core.js','moderation.js'])vm.runInNewContext(source(f),box);
 const settle=async()=>{for(let i=0;i<12;i++)await new Promise(resolve=>setImmediate(resolve));};
 const advance=ms=>{now+=ms;for(const [key,t] of [...timers])if(t.at<=now){timers.delete(key);t.fn();}};
 intervals[0].fn();await settle();
 return {posts,kicks,controls,settle,advance,
  async chat(text,who=3,{old=false}={}){advance(3000);const g=add(text,who,old?now-120000:now);observer([{type:'childList',addedNodes:[g.body],target:region}]);await settle();return g;},
  async disable(){control('modEnabled').checked=false;await control('modEnabled').onchange();await settle();},
  async enable(){control('modEnabled').checked=true;await control('modEnabled').onchange();await settle();},
  async stop(){runtimeListener({type:'v22:stop'});await settle();},
  async expire(){advance(61000);intervals.at(-1).fn();await settle();},
  async changeGroup(){epochGroup='99999';intervals[0].fn();await settle();},
  async replay(g){observer([{type:'childList',addedNodes:[g.body],target:region}]);await settle();}
 };
}

test('real extension controller and native bridge kick once only after three identified yes voters',async()=>{
 const h=await fixture();assert.equal(h.controls.get('modEnabled').checked,true);
 await h.chat('!votekick Target',3);assert.match(h.controls.get('modPoll').textContent,/1\/3 yes/);assert.equal(h.kicks.length,0);
 await h.chat('!kick yes',4);assert.match(h.controls.get('modPoll').textContent,/2\/3 yes/);await h.chat('!kick yes',4);assert.equal(h.kicks.length,0);
 const last=await h.chat('!kick yes',5);assert.equal(h.kicks.length,1);assert.equal(h.kicks[0].n,7);assert.match(h.controls.get('modPoll').textContent,/kicked/);await h.replay(last);assert.equal(h.kicks.length,1);
});

test('disabled feature, missing permissions and protected owner never reach native kick',async()=>{
 const disabled=await fixture({enabled:false});await disabled.chat('!votekick Target');assert.equal(disabled.kicks.length,0);assert.doesNotMatch(disabled.controls.get('modPoll').textContent,/Target/);
 const noPermission=await fixture({permission:false});assert.equal(noPermission.controls.get('modEnabled').checked,false);await noPermission.enable();assert.equal(noPermission.controls.get('modEnabled').checked,false);assert.equal(noPermission.kicks.length,0);
 const protectedTarget=await fixture();await protectedTarget.chat('!votekick Owner');assert.match(protectedTarget.controls.get('modStatus').textContent,/protected/);assert.equal(protectedTarget.kicks.length,0);
});

test('old commands, expiry, disabling and emergency stop cannot cause a later kick',async()=>{
 const stale=await fixture();await stale.chat('!votekick Target',3,{old:true});assert.match(stale.controls.get('modStatus').textContent,/Old or unverified/);assert.equal(stale.kicks.length,0);
 const disabled=await fixture();await disabled.chat('!votekick Target',3);await disabled.chat('!kick yes',4);await disabled.disable();await disabled.chat('!kick yes',5);assert.equal(disabled.kicks.length,0);
 const expired=await fixture();await expired.chat('!votekick Target',3);await expired.expire();await expired.chat('!kick yes',4);await expired.chat('!kick yes',5);assert.equal(expired.kicks.length,0);
 const stopped=await fixture();await stopped.chat('!votekick Target',3);await stopped.chat('!kick yes',4);await stopped.stop();await stopped.chat('!kick yes',5);assert.equal(stopped.kicks.length,0);
});

test('changing the connected group cancels the old ballot',async()=>{
 const h=await fixture();await h.chat('!votekick Target',3);await h.chat('!kick yes',4);await h.changeGroup();await h.chat('!kick yes',5);assert.equal(h.kicks.length,0);assert.match(h.controls.get('modPoll').textContent,/cancelled/);
});

test('concurrent ballot attempts are rejected, then a new vote can start as soon as the kick completes',async()=>{
 const h=await fixture();await h.chat('!votekick Target',3);await h.chat('!votekick Pat',4);assert.match(h.controls.get('modStatus').textContent,/already active/);assert.match(h.controls.get('modPoll').textContent,/Target/);
 await h.chat('!kick yes',4);await h.chat('!kick yes',5);assert.equal(h.kicks.length,1);
 await h.chat('!votekick Pat',3);assert.match(h.controls.get('modPoll').textContent,/Target: Pat/);await h.chat('!kick yes',4);await h.chat('!kick yes',5);assert.equal(h.kicks.length,2);assert.equal(h.kicks[1].n,6);
});

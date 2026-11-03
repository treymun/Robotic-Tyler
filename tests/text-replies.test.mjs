import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {message} from './helpers/message-dom.mjs';
const read=f=>readFileSync(new URL('../browser-extension/'+f,import.meta.url),'utf8');
test('addressed Steam text triggers reply on character changes; bot output stays ignored',async()=>{
 const elements=new Map(),observers=[],timers=[],sent=[];
 const el=id=>{if(!elements.has(id))elements.set(id,{value:'50',checked:true,style:{},textContent:'',closest(){return this;}});return elements.get(id);};
 const region={isConnected:true},sample={isConnected:true};
 const api={getMount:()=>({append(){}}),getRegion:()=>region,getSample:()=>sample,getComposer:()=>({isConnected:true}),isOwner:()=>true,getEpoch:()=>1,getVoiceState:()=>({}),pause(){},bridge(){},send:text=>{sent.push(text);box.TylerChatTag.remember(box.TylerChatTag.format(text));},getChatScope:()=> 'test',request:async()=>({ok:true,text:'Hello there!'})}; // send() mimics content.js: format, then remember
 const box={console,performance,Date,clearTimeout(){},setTimeout:(fn,ms)=>{timers.push({fn,ms});return timers.length;},setInterval(){},document:{createElement:()=>({querySelector:s=>el(s.slice(1))})},window:{postMessage(){},addEventListener(){}},location:{origin:'https://steamcommunity.com'},MutationObserver:class{constructor(fn){this.fn=fn;observers.push(this);}observe(_r,opts){this.opts=opts;}disconnect(){}},TylerCompanion:api,TylerSelection:{readiness:()=> 'READY',selector:()=> '.message'},TylerIdentity:{speaker:()=>null},TylerStorage:{get:async()=>({}),onChanged:{addListener(){}}},chrome:{runtime:{sendMessage:async()=>({ok:true,noiseLevel:'balanced'}),onMessage:{addListener(){}}}}};
 vm.runInNewContext(read('auto-policy.js'),box);
 vm.runInNewContext(read('chat-tag.js'),box);vm.runInNewContext(read('automatic.js'),box);
 await api.prepareAutomatic();api.setRoutingMode('text');api.confirmNotice(true);
 assert.equal(await api.startAutomatic(),true);
 const observer=observers.at(-1);assert.equal(observer.opts.characterData,true);
 const node={nodeType:1,innerText:'ROBOTIC TYLER are you there?',matches:()=>true,querySelectorAll:()=>[],closest:()=>null};
 observer.fn([{type:'characterData',target:{nodeType:3,parentElement:node}}]);
 const flush=timers.find(t=>t.ms===350);assert.ok(flush,'directly addressed message schedules text reply');
 flush.fn();await new Promise(resolve=>setImmediate(resolve));
 assert.deepEqual(sent,['Hello there!']);
 const timerCount=timers.length;
 node.innerText='[ROBOTIC TYLER] Hello there!';
 observer.fn([{type:'characterData',target:{nodeType:3,parentElement:node}}]);
 assert.equal(timers.length,timerCount,'own bracketed output is not queued');
 // v2.16: with the name tag off, Tyler's plain message is still recognised as his own (what he just sent).
 box.TylerChatTag.set({chatTagEnabled:false});api.send('Ready for round two?');assert.equal(sent.at(-1),'Ready for round two?');
 node.innerText='Ready for round two?';observer.fn([{type:'characterData',target:{nodeType:3,parentElement:node}}]);
 assert.equal(timers.length,timerCount,'Tyler’s own untagged message is not answered');
 box.TylerChatTag.set({chatTagEnabled:true,chatTagName:'SQUAD BOT'});
 node.innerText='(SQUAD BOT) Tyler, anything else?';observer.fn([{type:'characterData',target:{nodeType:3,parentElement:node}}]);
 assert.equal(timers.length,timerCount,'a custom tag marks Tyler’s output too');
 node.innerText='Tyler, are we playing again?';observer.fn([{type:'characterData',target:{nodeType:3,parentElement:node}}]);
 assert.ok(timers.length>timerCount,'a friend’s message is still answered');
});

test('normal AI replies receive the same screenshot-style message sender used by arcade/music',async()=>{
 const g=message('Alex','123456'),elements=new Map(),observers=[],timers=[],requests=[];
 const el=id=>{if(!elements.has(id))elements.set(id,{value:'50',checked:true,style:{},textContent:'',closest(){return this;}});return elements.get(id);};
 const api={getMount:()=>({append(){}}),getRegion:()=>g.region,getSample:()=>g.body,getComposer:()=>({isConnected:true}),isOwner:()=>true,getEpoch:()=>1,getVoiceState:()=>({}),pause(){},bridge(){},send(){},getChatScope:()=> 'test',request:async m=>{requests.push(m);return {ok:true,text:'Hello Alex'};}};
 const box={URL,Event,console,performance,Date,clearTimeout(){},setTimeout:(fn,ms)=>{timers.push({fn,ms});return timers.length;},setInterval(){},document:{createElement:()=>({querySelector:s=>el(s.slice(1))})},window:{postMessage(){},addEventListener(){}},location:{origin:'https://steamcommunity.com'},MutationObserver:class{constructor(fn){this.fn=fn;observers.push(this);}observe(){}disconnect(){}},TylerCompanion:api,TylerSelection:{readiness:()=> 'READY',selector:()=> '.msg_Text'},TylerStorage:{get:async()=>({}),onChanged:{addListener(){}}},chrome:{runtime:{sendMessage:async()=>({ok:true,noiseLevel:'balanced'}),onMessage:{addListener(){}}}}};
 for(const f of ['chat-tag.js','identity.js','auto-policy.js','automatic.js'])vm.runInNewContext(read(f),box);
 await api.prepareAutomatic();api.setRoutingMode('text');api.confirmNotice(true);await api.startAutomatic();
 g.body.text='ROBOTIC TYLER are you there?';observers.at(-1).fn([{type:'characterData',target:{nodeType:3,parentElement:g.body}}]);
 timers.find(t=>t.ms===350).fn();await new Promise(resolve=>setImmediate(resolve));
 assert.equal(requests.length,1);assert.equal(requests[0].speaker.name,'Alex');assert.equal(requests[0].speaker.id,String(76561197960265728n+123456n));assert.match(requests[0].text,/\[Alex\]/);
});

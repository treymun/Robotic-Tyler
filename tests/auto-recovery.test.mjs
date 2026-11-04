// v2.33: automatic text replies keep going after one failed turn, say why when they wait or stop,
// don't drop a message, cancel the request in flight on Pause, ask the AI only about messages for
// Tyler in Quiet mode, skip muted members, and answer a Steam message once even if its text changes.
// Mocked: no Steam, no provider. automatic.js runs in a vm with stand-in chat nodes, timers you step.
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const read=f=>readFileSync(new URL('../browser-extension/'+f,import.meta.url),'utf8');

function harness({reply,talk='active',muted=[]}={}){
 const elements=new Map(),observers=[],timers=[],sent=[],requests=[],notes=[];let clock=1_000_000,nextTimer=1;
 const el=id=>{if(!elements.has(id))elements.set(id,{value:id==='talk'?talk:id==='botName'?'ROBOTIC TYLER':'50',checked:true,style:{},textContent:'',closest(){return this;}});return elements.get(id);};
 const region={isConnected:true},sample={isConnected:true};
 const api={getMount:()=>({append(){}}),getRegion:()=>region,getSample:()=>sample,getComposer:()=>({isConnected:true}),isOwner:()=>true,getEpoch:()=>1,getVoiceState:()=>({}),pause(){},bridge(){},getChatScope:()=>'chat:test',
  send:text=>sent.push(text),deliver:async text=>{sent.push(text);return true;},notify:n=>notes.push(n),isTextMuted:id=>muted.includes(id),
  request:async m=>{requests.push(m);if(m.type!=='command')return {ok:true};return reply(m,requests.filter(r=>r.type==='command').length);}};
 class FakeDate extends Date{static now(){return clock;}}
 const box={console,performance,Date:FakeDate,setTimeout:(fn,ms)=>{const id=nextTimer++;timers.push({id,fn,ms,at:clock+ms});return id;},clearTimeout:id=>{const i=timers.findIndex(t=>t.id===id);if(i>=0)timers.splice(i,1);},setInterval(){},
  document:{createElement:()=>({querySelector:s=>el(s.slice(1))})},window:{postMessage(){},addEventListener(){}},location:{origin:'https://steamcommunity.com'},
  MutationObserver:class{constructor(fn){this.fn=fn;observers.push(this);}observe(){}disconnect(){}},TylerCompanion:api,TylerSelection:{readiness:()=>'READY',selector:()=>'.message'},
  TylerIdentity:{speaker:n=>n.speaker||null,meta:n=>n.meta||null},TylerStorage:{get:async()=>({}),set:async()=>{},onChanged:{addListener(){}}},chrome:{runtime:{sendMessage:async()=>({ok:true,noiseLevel:'balanced',talkativeness:talk}),onMessage:{addListener(){}}}}};
 vm.runInNewContext(read('ui-state.js'),box);vm.runInNewContext(read('auto-policy.js'),box);vm.runInNewContext(read('chat-tag.js'),box);vm.runInNewContext(read('automatic.js'),box);
 const settle=()=>new Promise(r=>setImmediate(r));
 // Advance the fake clock, running each due timer in order (and the promises it starts).
 async function advance(ms){const end=clock+ms;for(;;){await settle();await settle();const due=timers.filter(t=>t.at<=end).sort((a,b)=>a.at-b.at)[0];if(!due)break;timers.splice(timers.indexOf(due),1);clock=Math.max(clock,due.at);due.fn();}clock=end;await settle();await settle();}
 const msg=(text,{id='76561198000000001',name='Alex',key=null}={})=>({nodeType:1,innerText:text,matches:()=>true,querySelectorAll:()=>[],closest:()=>null,speaker:{id,name},meta:key?{key,senderId:id}:null});
 const post=node=>observers.at(-1).fn([{addedNodes:[node]}]);
 const mode=()=>el('mode').textContent;
 return {api,box,sent,requests,notes,advance,msg,post,mode,commands:()=>requests.filter(r=>r.type==='command'),state:()=>box.TylerUIState(mode())[0]};
}
async function started(h){await h.api.prepareAutomatic();h.api.setRoutingMode('text');h.api.confirmNotice(true);assert.equal(await h.api.startAutomatic(),true);}

test('one failed turn is skipped with the reason; Tyler keeps answering; three in a row stop him with the problem shown',async()=>{
 const h=harness({reply:(m,n)=>n===1?{ok:false,error:'AI returned no text',kind:'turn'}:n===2?{ok:true,text:'Back again.'}:{ok:false,error:'AI returned no text',kind:'turn'}});
 await started(h);
 h.post(h.msg('tyler you there?'));await h.advance(1000);
 assert.match(h.mode(),/^SKIPPED — AI returned no text · Tyler keeps listening/);assert.equal(h.notes.at(-1).kind,'warning');
 h.post(h.msg('tyler, again?'));await h.advance(3000);
 assert.deepEqual(h.sent,['Back again.'],'the next message is answered');
 for(const t of ['tyler one?','tyler two?','tyler three?']){h.post(h.msg(t));await h.advance(3000);}
 assert.match(h.mode(),/^NEEDS ATTENTION — Tyler stopped: 3 replies in a row failed\. Last problem: AI returned no text/);assert.equal(h.state(),'error');
});

test('an account problem stops at once with the reason (the error state, not "Paused")',async()=>{
 const h=harness({reply:()=>({ok:false,error:'OpenRouter 402: OpenRouter says the key is out of credits.',kind:'fatal'})});
 await started(h);h.post(h.msg('tyler?'));await h.advance(1000);
 assert.match(h.mode(),/^NEEDS ATTENTION — Tyler stopped: OpenRouter 402: OpenRouter says the key is out of credits\./);assert.equal(h.state(),'error');
 h.post(h.msg('tyler??'));await h.advance(3000);assert.equal(h.commands().length,1,'stopped: nothing else is asked');
});

test('busy: the same turn waits for the other request and then goes out; a provider blip retries after 3 s and says why',async()=>{
 const h=harness({reply:(m,n)=>n===1?{ok:false,error:'Still handling the previous command.',kind:'busy',retryAfter:1200}:n===2?{ok:false,error:'OpenRouter stream error 502: Provider returned error',kind:'transient',retryable:true,retryAfter:3000}:{ok:true,text:'Here.'}});
 await started(h);h.post(h.msg('tyler?'));await h.advance(600);
 assert.match(h.mode(),/^WAITING — Tyler is finishing another request/);
 await h.advance(1300);assert.match(h.mode(),/^RECOVERING — OpenRouter stream error 502: Provider returned error · trying again in 3 s/);assert.equal(h.state(),'waiting');
 await h.advance(3100);assert.deepEqual(h.sent,['Here.']);assert.equal(h.commands().length,3);
 assert.equal(new Set(h.commands().map(c=>c.text)).size,1,'the same turn, not a new one');
});

test('a message right after a direct one is answered too (it used to be dropped)',async()=>{
 let release;const h=harness({reply:(m,n)=>n===1?new Promise(r=>{release=()=>r({ok:true,text:'First.'});}):{ok:true,text:'Second.'}});
 await started(h);h.post(h.msg('tyler what map next?'));await h.advance(400);assert.equal(h.commands().length,1);
 h.post(h.msg('dust2 pls',{id:'76561198000000002',name:'Sam'}));await h.advance(200);release();
 await h.advance(5000);assert.equal(h.commands().length,2,'both batches reach the AI');assert.deepEqual(h.sent,['First.','Second.']);
 assert.match(h.commands()[1].text,/dust2 pls/);
});

test('Pause cancels the request in flight (an abort goes to the background)',async()=>{
 const h=harness({reply:()=>new Promise(()=>{})});
 await started(h);h.post(h.msg('tyler?'));await h.advance(400);
 const id=h.commands()[0].requestId;assert.match(id,/^t/);
 h.api.stopAutomatic('Paused by you');await h.advance(10);
 assert.deepEqual(h.requests.filter(r=>r.type==='abort').map(r=>r.requestId),[id]);assert.match(h.mode(),/^OFF — Paused by you/);
});

test('Quiet mode: only messages for Tyler go to the AI; the rest are kept as context with no AI request',async()=>{
 const h=harness({talk:'quiet',reply:()=>({ok:true,text:'Yo.'})});
 await started(h);
 h.post(h.msg('lol that was close'));await h.advance(1000);h.post(h.msg('nice shot sam',{id:'76561198000000002',name:'Sam'}));await h.advance(1000);
 assert.equal(h.commands().length,0,'no AI request for chatter between friends: '+JSON.stringify(h.commands().map(c=>c.text))+' '+h.mode());
 assert.equal(h.requests.filter(r=>r.type==='remember').length,2);assert.match(h.mode(),/Quiet mode: 2 messages not for Tyler/);
 h.post(h.msg('ROBOTIC TYLER thoughts'));await h.advance(1000);assert.equal(h.commands().length,1,'his name');
 h.post(h.msg('and the next round'));await h.advance(4000);assert.equal(h.commands().length,2,'a follow-up from the person he just answered');
 h.post(h.msg('brb',{id:'76561198000000003',name:'Kai'}));await h.advance(4000);assert.equal(h.commands().length,2);
});

test('text-muted members are ignored (no reply, no AI request)',async()=>{
 const h=harness({muted:['76561198000000009'],reply:()=>({ok:true,text:'Hi.'})});
 await started(h);h.post(h.msg('tyler say hi',{id:'76561198000000009',name:'Muted'}));await h.advance(2000);
 assert.equal(h.commands().length,0);h.post(h.msg('tyler say hi'));await h.advance(2000);assert.equal(h.commands().length,1);
});

test('a Steam message is answered once: a change to its text before the reply updates it, after the reply is ignored',async()=>{
 const h=harness({reply:m=>({ok:true,text:'Re: '+m.text.slice(-12)})});
 await started(h);
 const n=h.msg('tyler what time',{key:'1700000000_1'});h.post(n);await h.advance(100);
 n.innerText='tyler what time is it?';h.post(n);await h.advance(1500);
 assert.equal(h.commands().length,1);assert.match(h.commands()[0].text,/what time is it\?$/,'the queued text was updated');
 n.innerText='tyler what time is it? (edited)';h.post(n);await h.advance(3000);
 assert.equal(h.commands().length,1,'not answered again');
});

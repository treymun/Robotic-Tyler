import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {Element,message} from './helpers/message-dom.mjs';
import {chooseVote} from '../browser-extension/suite-core.mjs';
import {partyCommand} from '../browser-extension/party-core.mjs';
const source=f=>readFileSync(new URL('../browser-extension/'+f,import.meta.url),'utf8');
function environment(){
 let probe;const box={URL,Event,document:{addEventListener:(_type,fn)=>probe=fn}};
 for(const f of ['sender-main.js','identity.js','trivia-identity.js','music-core.js','soundboard-core.js','arcade-plus.js','trivia-bank.js','trivia-party.js'])vm.runInNewContext(source(f),box);
 return {box,person:(name,account)=>{const g=message(name,null);g.body.onProbe=probe;g.body.attributes.class='msgText';g.body.parentElement.attributes.class='msg';g.body.__reactFiber$steam={memoizedProps:{className:'msgText'},stateNode:g.body,return:{memoizedProps:{msg:{unAccountID:account,rtTimestamp:1793570000}},return:{stateNode:g.row}}};return g;}};
}

test('one sender reader supplies music request labels, account votes, trivia scores and party/game votes',()=>{
 const {box,person}=environment(),g=person('Alex',123456),h=person('Sam',654321);g.region.append(h.row);
 const a=box.TylerIdentity.speaker(g.body,g.region),b=box.TylerIdentity.speaker(h.body,g.region);
 assert.equal(a.name,'Alex');assert.equal(b.name,'Sam');assert.notEqual(a.id,b.id);
 const dj=box.TylerMusic.createSession();dj.add('First song',box.TylerTriviaIdentity.identify(g.body,g.region));dj.next();dj.add('Next song',box.TylerTriviaIdentity.identify(h.body,g.region));
 assert.match(box.TylerMusic.nowCard(dj.current,dj.waiting),/Requested by Alex/);assert.match(box.TylerMusic.queueCard(dj.current,dj.waiting),/Next song · Sam/);
 assert.equal(dj.vote(a).skip,false);g.header.text='Alex renamed';assert.equal(dj.vote(box.TylerIdentity.speaker(g.body,g.region)).duplicate,true);assert.equal(dj.vote(b).skip,true);
 let state=box.TylerSoundboard.arcade('play trivia group science',{},()=>.25,1000,a).next;
 const win=box.TylerSoundboard.arcade(state.trivia.question.answer,state,()=>.25,1001,b);assert.match(win.text,/🥇 Sam \d/);assert.equal(win.next.trivia.players.find(p=>p.key===b.id).correct,1);assert.ok(win.next.trivia.players.find(p=>p.key===b.id).score>=100);
 const party=partyCommand(partyCommand(null,'start',a).party,'join',b).party;assert.equal(party.members.length,2);assert.equal(party.members[1].name,'Sam');
 const votes=chooseVote(chooseVote({},'Portal',a.id),'Portal',b.id);assert.equal(votes.portal.ids.length,2);
 assert.match(box.TylerIdentity.instruction(a),/current message author is "Alex"/);
});

test('all Chrome text modules use the shared account or label reader; worker permissions stay numeric',()=>{
 for(const f of ['automatic.js','squad-suite.js','soundboard.js'])assert.match(source(f),/TylerIdentity/);
 assert.match(source('trivia-identity.js'),/TylerIdentity\?\.identify/);assert.match(source('trivia-identity.js'),/TylerIdentity\?\.speaker/);
 const worker=source('background.js');assert.match(worker,/TylerIdentity\.valid\(message\.speaker\)/);assert.match(worker,/TylerIdentity\.label\(message\.speaker\)/);
 assert.match(source('automatic.js'),/TylerIdentity\.identify\?\.\(t\.node/);
 assert.match(source('soundboard.js'),/TylerIdentity\?\.valid\(triviaSpeaker\)/);
 const manifest=JSON.parse(source('manifest.json'));assert.ok(manifest.content_scripts.find(g=>g.world==='MAIN').js.includes('sender-main.js'));
 // v2.33: unlimitedStorage (no install warning) so 32 soundboard clips in three banks can't fill Chrome's
 // 10 MB storage and make every other setting fail to save.
 assert.deepEqual(manifest.permissions,['storage','tabs','unlimitedStorage']);
});

test('Squad Suite character updates send votes, parties, roasts and custom commands with the same sender',async()=>{
 const g=message('Alex','123456'),els=new Map(),observers=[],intervals=[],sent=[];
 const el=id=>{if(!els.has(id))els.set(id,{value:'',textContent:'',replaceChildren(){},append(){}});return els.get(id);};
 const api={getMount:()=>({append(){}}),getRegion:()=>g.region,getSample:()=>g.body,getChatScope:()=> 'room:test',isOwner:()=>true,send(){},bridge(){}};
 const panel={querySelector:s=>el(s.slice(1)),addEventListener(){}};
 const box={URL,Event,setTimeout,setInterval:(fn,ms)=>intervals.push({fn,ms}),document:{createElement:()=>panel},TylerCompanion:api,TylerSelection:{selector:()=>'.msg_Text'},MutationObserver:class{constructor(fn){this.fn=fn;observers.push(this);}observe(){}disconnect(){}},chrome:{runtime:{sendMessage:async m=>{sent.push(m);return {ok:true,message:'Saved',diagnostics:{},options:{}};}}}};
 vm.runInNewContext(source('identity.js'),box);vm.runInNewContext(source('commands.js'),box);vm.runInNewContext(source('chat-tag.js'),box);vm.runInNewContext(source('squad-suite.js'),box);intervals.find(x=>x.ms===1400).fn();
 const types=['suite:vote','suite:party','v23:roast','v23:custom'];
 for(const [i,line] of ['!vote Portal','!party join','!roast join','!cheer'].entries()){
  g.body.text=line;observers.at(-1).fn([{type:'characterData',target:{nodeType:3,parentElement:g.body}}]);await new Promise(resolve=>setTimeout(resolve,5));
  const call=sent.find(m=>m.type===types[i]);assert.ok(call,types[i]);assert.equal(call.speaker.name,'Alex');assert.equal(call.speaker.id,String(76561197960265728n+123456n));
 }
 const count=sent.filter(m=>m.type==='v23:custom').length;observers.at(-1).fn([{type:'characterData',target:{nodeType:3,parentElement:g.body}}]);await new Promise(resolve=>setTimeout(resolve,5));assert.equal(sent.filter(m=>m.type==='v23:custom').length,count);
});

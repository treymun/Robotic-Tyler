import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const source=f=>readFileSync(new URL('../browser-extension/'+f,import.meta.url),'utf8');
const alex={id:'76561198000000001',name:'Alex'},sam={id:'76561198000000002',name:'Sam'},lee={id:'76561198000000003',name:'Lee'};
function core(){const box={};vm.runInNewContext(source('music-core.js'),box);return box.TylerMusic;}

test('fair queue rotates requesters, preserves each person’s order and admits late joiners',()=>{
 const s=core().createSession();s.add('A zero',alex,0);s.next(1);
 for(const q of ['A one','A two','A three'])assert.ok(s.add(q,alex,2).song);
 assert.match(s.add('A four',alex,2).error,/3 songs/);
 s.add('S one',sam,2);s.add('S two',sam,2);s.add('L one',lee,2);
 assert.deepEqual(Array.from(s.waiting,x=>x.query),['S one','L one','A one','S two','A two','A three']);
 const played=[];while(s.current){s.finish(s.current.token);const next=s.next(3);if(next)played.push(next.query);}
 assert.deepEqual(played,['S one','L one','A one','S two','A two','A three']);
});

test('song deduplication, global capacity and unknown-author limits survive fair ordering',()=>{
 const s=core().createSession();s.add('The song',alex,0);const track=s.next(1);
 assert.match(s.add('the SONG',sam,1).error,/already/);
 assert.equal(s.next(2),track);assert.equal(s.finish('old-token'),false);
 for(let n=0;n<12;n++)assert.ok(s.add('Song '+n,{id:'person'+n,name:'Person '+n},2).song);
 assert.match(s.add('Overflow song',sam,2).error,/full/);
 s.stop();assert.equal(s.current,null);assert.equal(s.waiting.length,0);
 for(let n=0;n<3;n++)s.add('Unknown '+n,null,3);
 assert.match(s.add('Unknown fourth',null,3).error,/3 songs/);
});

test('group skip votes are distinct, fixed per song and reset for the next song',()=>{
 const s=core().createSession();s.add('First song',alex,0);s.add('Next song',sam,0);const track=s.next(1);
 const first=s.vote(alex,3);assert.equal(first.needed,2);assert.equal(first.skip,false);
 const duplicate=s.vote({...alex,name:'New nickname'},4);assert.equal(duplicate.duplicate,true);assert.equal(duplicate.count,1);
 assert.equal(s.vote(sam,6).skip,true);assert.equal(s.finish(track.token),true);s.next(7);
 const fresh=s.vote(lee,8);assert.equal(fresh.count,1);assert.equal(fresh.needed,2);assert.equal(fresh.skip,false);
 assert.equal(s.vote(alex,8).skip,true);
});

test('two votes required without confirmed solo membership; missing authors cannot manufacture votes',()=>{
 const s=core().createSession();s.add('Solo song',alex,700000);s.next(700001);
 assert.match(s.vote(null,700002).error,/Names alone/);assert.match(s.vote({id:'display:Alex',name:'Alex'},700002).error,/Names alone/);const solo=s.vote(alex,700002);assert.equal(solo.needed,2);assert.equal(solo.skip,false);
 s.stop();s.add('Host pick',{id:'panel:host',name:'DJ host'},700003);s.next(700004);
 assert.equal(s.vote(alex,700005).needed,2);assert.equal(s.vote(sam,700005).skip,true);
});

test('Steam chat cards include actual title, requester and next turn without control characters',()=>{
 const music=core(),s=music.createSession();s.add('Original query',{id:'a',name:'Alex\nFake name\u202e'},0);const track=s.next(1);track.title='Actual video\nTitle';s.add('Next pick',sam,2);
 const card=music.nowCard(track,s.waiting);assert.match(card,/NOW PLAYING/);assert.match(card,/Actual video Title/);assert.match(card,/Requested by Alex Fake name/);assert.match(card,/Next: Next pick · Sam/);assert.doesNotMatch(card,/\u202e/);
 assert.match(music.queueCard(track,s.waiting),/1\. Next pick · Sam/);
});

function harness(){
 const controls=new Map(),posts=[],commands=[],bridges=[],intervals=[],messageHandlers=[],clockTimers=new Map();let observer,receive,owner=true,room='room-1',tick=100000,timerID=0,stuckPlay=false,voice={known:false};
 const advance=ms=>{const end=tick+ms;for(;;){const due=[...clockTimers.entries()].filter(([,t])=>t.at<=end).sort((a,b)=>a[1].at-b[1].at)[0];if(!due)break;clockTimers.delete(due[0]);tick=due[1].at;due[1].fn();}tick=end;};
 class Clock extends Date{static now(){return tick;}}
 const setTimer=(fn,ms)=>{if(ms<1000)return {real:setTimeout(fn,ms)};const id=++timerID;clockTimers.set(id,{fn,at:tick+ms});return id;};
 const clearTimer=id=>{if(id?.real)clearTimeout(id.real);else clockTimers.delete(id);};
 const region={isConnected:true,contains:n=>n.region===region,querySelectorAll:()=>[]};
 const element=()=>({textContent:'',value:'35',isConnected:true});
 const root={querySelector:selector=>{if(!controls.has(selector))controls.set(selector,element());return controls.get(selector);}};
 const win={addEventListener:(_event,fn)=>messageHandlers.push(fn)};
 const api={getMount:()=>({append(){}}),getRegion:()=>region,getSample:()=>({isConnected:true}),getChatScope:()=>room,isOwner:()=>owner,send:text=>posts.push(text),bridge:(...args)=>bridges.push(args)};
 const box={console,URL,Date:Clock,setTimeout:setTimer,clearTimeout:clearTimer,setInterval:(fn,ms)=>intervals.push({fn,ms}),location:{origin:'https://steamcommunity.com'},window:win,document:{createElement:()=>root},TylerCompanion:api,TylerSelection:{selector:()=>'.message'},TylerTriviaIdentity:{identify:node=>node?.author,identifyAccount:node=>/^7656119\d{10}$/.test(node?.author?.id||'')?node.author:null},MutationObserver:class{constructor(fn){observer=fn;}observe(){}disconnect(){}},chrome:{runtime:{sendMessage:async m=>{commands.push(m);if(stuckPlay&&m.action==='play'){stuckPlay=false;return new Promise(()=>{});}return {ok:true};},onMessage:{addListener:fn=>receive=fn}}}};
 vm.runInNewContext(source('music-core.js'),box);vm.runInNewContext(source('chat-tag.js'),box);vm.runInNewContext(source('music.js'),box);
 box.TylerSteamChat={request:async()=>voice};
 const settle=()=>new Promise(resolve=>setTimeout(resolve,15));
 const bind=()=>intervals.find(i=>i.ms===1000).fn();bind();
 const node=(text,author)=>({region,author,nodeType:1,innerText:text,matches:()=>true,querySelectorAll:()=>[],closest:()=>null});
 const mutate=n=>observer([{addedNodes:[n],target:region,type:'childList'}]);
 return {posts,commands,bridges,controls,settle,bind,api,advance,voice:value=>{voice=value;},hangNextPlay:()=>{stuckPlay=true;},
  shared:()=>messageHandlers.forEach(fn=>fn({source:win,origin:box.location.origin,data:{source:'tyler-music-status',shared:true,text:'Sharing ready'}})),
  chat:async(text,author=alex,elapsed=6000)=>{advance(elapsed);const n=node(text,author);mutate(n);await settle();return n;},mutate,
  event:async m=>{advance(3500);receive(m);await settle();},
  room:value=>{room=value;bind();},owner:value=>{owner=value;},
  button:async(id,value)=>{advance(6000);if(value!==undefined)root.querySelector('#musicQuery').value=value;controls.get('#'+id).onclick();await settle();}
 };
}
test('Steam integration names queued requests and announces now playing only once per track',async()=>{
 const h=harness();h.shared();const original=await h.chat('!play First song',alex);await h.chat('!play Second song',sam);
 assert.equal(h.commands.filter(c=>c.action==='play').length,1);assert.match(h.posts[0],/Sam · turn 1/);
 const first=h.commands.find(c=>c.action==='play');await h.event({source:'tyler-music-event',event:'playing',title:'Actual first title',token:first.token});await h.event({source:'tyler-music-event',event:'playing',title:'Actual first title',token:first.token});
 assert.equal(h.posts.filter(p=>p.includes('NOW PLAYING')).length,1);assert.match(h.posts.at(-1),/Requested by Alex/);
 h.mutate(original);await h.settle();await h.chat('[ROBOTIC TYLER] 🎧 TYLER DJ\n!play ARTIST SONG\nmusic stop',alex);
 assert.equal(h.commands.filter(c=>c.action==='play').length,1);assert.equal(h.commands.filter(c=>c.action==='stop').length,0);
});

test('chat skip requires distinct votes and old player events cannot skip the next song',async()=>{
 const h=harness();h.shared();await h.chat('!play First song',alex);await h.chat('!play Next song',sam);
 const first=h.commands.find(c=>c.action==='play');await h.chat('music skip',alex);await h.chat('music skip',alex);
 assert.equal(h.commands.filter(c=>c.action==='play').length,1);assert.equal(h.posts.filter(p=>p.includes('SKIP VOTE')).length,1);
 await h.chat('music skip',sam);assert.equal(h.commands.filter(c=>c.action==='play').length,2);
 await h.event({source:'tyler-music-event',event:'ended',token:first.token});assert.equal(h.commands.filter(c=>c.action==='play').length,2);
});

test('different accounts with identical names can vote; one renamed account still has one vote',()=>{
 const s=core().createSession();s.add('Song to skip',alex);s.next();
 assert.equal(s.vote(alex).skip,false);assert.equal(s.vote({...alex,name:'Different nickname'}).duplicate,true);
 assert.equal(s.vote({...sam,name:'Alex'}).skip,true);
});

test('sender check exposes missing account detection and refuses name-only skip votes',async()=>{
 const h=harness();h.shared();await h.chat('!play First song',alex);await h.chat('!play Next song',sam);
 await h.chat('music skip',{id:'display:alex',name:'Alex'});await new Promise(resolve=>setTimeout(resolve,450));
 assert.match(h.controls.get('#musicSender').textContent,/name only/);assert.match(h.posts.at(-1),/Names alone do not count/);
 assert.equal(h.commands.filter(c=>c.action==='play').length,1);
 await h.chat('music skip',alex);assert.match(h.controls.get('#musicSender').textContent,/Alex · ready/);
 assert.equal(h.commands.filter(c=>c.action==='play').length,1);
 await h.chat('music skip',sam);assert.equal(h.commands.filter(c=>c.action==='play').length,2);
});

test('DJ can skip immediately, room changes clear names/queue, and emergency stop releases sharing',async()=>{
 const h=harness();h.shared();await h.chat('!play First song',alex);await h.chat('!play Next song',sam);
 await h.button('musicSkip');assert.equal(h.commands.filter(c=>c.action==='play').length,2);
 await h.button('musicAdd','Host song');assert.match(h.posts.at(-1),/DJ host/);
 h.room('room-2');await h.settle();await h.chat('music queue',lee);assert.match(h.posts.at(-1),/Nothing playing/);assert.doesNotMatch(h.posts.at(-1),/Host song/);
 await h.event({type:'v22:stop'});assert.equal(h.bridges.at(-1)[0],'music-disconnect');await h.chat('!play After stop',lee);assert.equal(h.commands.filter(c=>c.action==='play').length,2);
});

test('clear empties a spammed queue without stopping playback or changing current votes',async()=>{
 const h=harness();h.shared();await h.chat('!play Keep playing',alex);
 for(let i=0;i<3;i++)await h.chat('!play Spam song '+i,sam);
 await h.chat('music skip',alex);const first=h.commands.find(c=>c.action==='play');
 await h.chat('!music clear',lee);assert.match(h.posts.at(-1),/Cleared 3 waiting songs/);
 assert.equal(h.commands.filter(c=>c.action==='stop').length,0);
 await h.chat('music queue',lee);assert.match(h.posts.at(-1),/Keep playing/);assert.doesNotMatch(h.posts.at(-1),/Spam song/);
 await h.chat('music skip',sam);assert.match(h.posts.at(-1),/2\/2/); // Current song's first vote survived clear.
 assert.equal(h.commands.filter(c=>c.action==='play').length,1);
 await h.event({source:'tyler-music-event',event:'ended',token:first.token});
 await h.chat('!play Fresh pick',sam);assert.equal(h.commands.filter(c=>c.action==='play').length,2);
});

test('reset stops playback, clears votes/queue and keeps sharing ready for fresh songs',async()=>{
 const h=harness();h.shared();await h.chat('!play Old song',alex);await h.chat('!play Waiting song',sam);await h.chat('music skip',alex);
 const old=h.commands.find(c=>c.action==='play');await h.chat('music reset',lee);assert.match(h.posts.at(-1),/1\/2/);assert.equal(h.commands.at(-1).action,'play');await h.chat('music reset',sam);
 assert.match(h.posts.at(-1),/skip votes cleared/);assert.equal(h.commands.at(-1).action,'stop');assert.equal(h.bridges.length,0);
 await h.event({source:'tyler-music-event',event:'ended',token:old.token});await h.chat('!play Fresh song',sam);
 assert.equal(h.commands.filter(c=>c.action==='play').length,2);await h.chat('music skip',alex);assert.match(h.posts.at(-1),/1\/2/);
 await h.button('musicClear');assert.match(h.posts.at(-1),/Cleared 0/);
 await h.button('musicReset');assert.equal(h.commands.at(-1).action,'stop');
 await h.chat('!play Clean start',sam);assert.equal(h.commands.filter(c=>c.action==='play').length,3);
 assert.equal(h.api.musicConsumesText('music clear'),true);assert.equal(h.api.musicConsumesText('!music reset'),true);
});

test('request spam is limited per detected account; another person and later requests still work',async()=>{
 const h=harness();h.shared();await h.chat('!play First song',alex);
 for(let i=0;i<30;i++)await h.chat('!play Spam '+i,alex,0);
 assert.equal(h.commands.filter(c=>c.action==='play').length,1);assert.equal(h.posts.filter(p=>p.includes('QUEUED')).length,0);
 await h.chat('!play Sam pick',sam,0);h.advance(4000);assert.match(h.posts.at(-1),/Sam pick/);
 await h.chat('!play Alex later',alex,1000);h.advance(4000);assert.match(h.posts.at(-1),/Alex later/);
});

test('burst backlog is bounded and the local pause/clear/reset controls recover without ending sharing',async()=>{
 const h=harness();h.shared();await h.chat('!play First song',alex);
 const burst=Array.from({length:40},(_,i)=>h.chat('!play Flood '+i,{id:'7656119800000'+String(i).padStart(4,'0'),name:'Person '+i},0));
 await h.button('musicChatLock');await Promise.all(burst);assert.match(h.controls.get('#musicStatus').textContent,/paused/);
 await h.chat('!play Blocked while locked',sam);assert.equal(h.commands.filter(c=>c.action==='play').length,1);
 await h.button('musicClear');assert.doesNotMatch(h.controls.get('#musicQueue').textContent,/Flood/);
 await h.button('musicReset');assert.equal(h.commands.at(-1).action,'stop');assert.equal(h.bridges.length,0);
 await h.button('musicChatLock');await h.chat('!play Recovered song',sam);assert.equal(h.commands.filter(c=>c.action==='play').length,2);
});

test('rate limits are account-based, anonymous senders share a bucket and room/reset bursts are bounded',()=>{
 const guard=core().createSpamGuard();assert.equal(guard.allow('play',alex,0).ok,true);
 assert.equal(guard.allow('play',{...alex,name:'Renamed'},100).ok,false);assert.equal(guard.allow('play',sam,100).ok,true);
 assert.equal(guard.allow('play',{id:'display:one'},200).ok,true);assert.equal(guard.allow('play',{id:'display:two'},300).ok,false);
 assert.equal(guard.allow('reset',alex,500).ok,true);assert.equal(guard.allow('reset',sam,3000).ok,true);
 assert.equal(guard.allow('clear',alex,3000).ok,true);assert.equal(guard.allow('clear',sam,5500).ok,false);
 const burst=core().createSpamGuard();for(let i=0;i<8;i++)assert.equal(burst.allow('play',{id:'7656119800000'+String(i).padStart(4,'0')},0).ok,true);
 assert.equal(burst.allow('play',{id:'76561198000000099'},0).ok,false);assert.equal(burst.allow('play',alex,10000).ok,true);
 assert.equal(burst.allow('stop',sam,10000).ok,true);assert.equal(burst.allow('reset',lee,10000).ok,true);
});

test('music chat acknowledgements are paced and cannot build an outgoing message backlog',async()=>{
 const h=harness();h.shared();await h.chat('!play First song',alex);
 const track=h.commands.find(c=>c.action==='play');await h.event({source:'tyler-music-event',event:'playing',token:track.token,title:'First title'});
 const baseline=h.posts.length;for(let i=0;i<6;i++)await h.chat('!play Song '+i,{id:'7656119800000'+String(i).padStart(4,'0'),name:'Person '+i},0);
 assert.equal(h.posts.length,baseline);h.advance(3000);assert.equal(h.posts.length,baseline+1);h.advance(30000);assert.equal(h.posts.length,baseline+1);
});

test('recreated message elements with the same explicit message ID are not replayed after reset',async()=>{
 const h=harness();h.shared();const n={nodeType:1,innerText:'!play Original request',author:alex,matches:()=>true,querySelectorAll:()=>[],closest:selector=>selector.includes('data-messageid')?{getAttribute:k=>k==='data-messageid'?'stable-123':null}:null};
 // The message belongs to the bound region in the same way as harness chat nodes.
 const sample=await h.chat('not a command',alex);n.region=sample.region;h.mutate(n);await h.settle();assert.equal(h.commands.filter(c=>c.action==='play').length,1);
 await h.button('musicReset');h.mutate({...n});await h.settle();assert.equal(h.commands.filter(c=>c.action==='play').length,1);
});

test('a stalled music controller times out instead of permanently blocking fresh requests',async()=>{
 const h=harness();h.shared();h.hangNextPlay();await h.chat('!play Stalled request',alex);h.advance(15000);await h.settle();
 assert.match(h.controls.get('#musicStatus').textContent,/timed out/);
 await h.chat('!play Fresh after timeout',sam);assert.equal(h.commands.filter(c=>c.action==='play').length,2);
});

test('music stop needs two different accounts; reset cannot bypass it and skip votes are separate',async()=>{
 const h=harness();h.shared();await h.chat('!play Current song',alex);await h.chat('!play Waiting song',sam);
 await h.chat('music stop',alex);assert.match(h.posts.at(-1),/STOP VOTE · 1\/2/);assert.equal(h.commands.filter(c=>c.action==='stop').length,0);
 await h.chat('music stop',alex);await h.chat('music reset',{...alex,name:'Renamed Alex'});assert.equal(h.commands.filter(c=>c.action==='stop').length,0);
 await h.chat('music skip',sam);assert.equal(h.commands.filter(c=>c.action==='stop').length,0,'a skip vote does not complete a stop vote');
 await h.chat('!music stop',sam);assert.equal(h.commands.filter(c=>c.action==='stop').length,1);assert.match(h.posts.at(-1),/STOP VOTE · 2\/2/);assert.doesNotMatch(h.controls.get('#musicQueue').textContent,/Waiting song/);
 await h.chat('!play New song',alex);await h.chat('music stop',sam);assert.match(h.posts.at(-1),/STOP VOTE · 1\/2/);assert.equal(h.commands.filter(c=>c.action==='stop').length,1);
 await h.chat('music stop',lee);assert.equal(h.commands.filter(c=>c.action==='stop').length,2);assert.equal(h.bridges.length,0);
});

test('only the confirmed sole voice listener gets a single-vote skip; stop stays at two',async()=>{
 const h=harness();h.shared();await h.chat('!play First song',alex);await h.chat('!play Next song',sam);h.voice({known:true,otherCount:1,soloId:sam.id});
 await h.chat('music skip',alex);assert.equal(h.commands.filter(c=>c.action==='play').length,1,'an outsider does not get the solo exception');
 await h.chat('music skip',sam);assert.equal(h.commands.filter(c=>c.action==='play').length,2);assert.match(h.posts.at(-1),/SOLO SKIP/);
 await h.chat('music stop',sam);assert.match(h.posts.at(-1),/STOP VOTE · 1\/2/);
});

test('voice membership is checked again when friends join; unknown membership keeps two votes',async()=>{
 const h=harness();h.shared();await h.chat('!play First song',alex);await h.chat('!play Second song',sam);h.voice({known:true,otherCount:2,soloId:sam.id});
 await h.chat('music skip',sam);assert.equal(h.commands.filter(c=>c.action==='play').length,1);assert.match(h.posts.at(-1),/1\/2/);
 h.voice({known:false,otherCount:1,soloId:sam.id});await h.chat('music skip',sam);assert.equal(h.commands.filter(c=>c.action==='play').length,1);
 h.voice({known:true,otherCount:1,soloId:sam.id});await h.chat('music skip',sam);assert.equal(h.commands.filter(c=>c.action==='play').length,2);
});

// v2.24: Stay connected, the chat side. Mocked: no Steam page, no browser (keep-alive.js in a VM).
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('../browser-extension/keep-alive.js',import.meta.url),'utf8');

function fixture({same=true,started=true,platform='chrome'}={}){
 let clock=1_000_000;class Clock extends Date{static now(){return clock;}constructor(...a){super(...(a.length?a:[clock]));}}
 const els=new Map(),el=id=>{if(!els.has(id))els.set(id,{id,checked:true,value:'45',disabled:false,textContent:''});return els.get(id);};
 const box={innerHTML:'',querySelector:s=>el(s.slice(1))};
 const log={bridge:[],runtime:[],notify:[],started:0,stopped:[],requests:[]};
 let region={isConnected:true},composer={isConnected:true},sample={isConnected:true},owner=true,auto=true;
 const api={ui:{root:{getElementById:()=>({after(){}})}},platform:{id:platform},isOwner:()=>owner,isAutomaticActive:()=>auto,getRegion:()=>region,getComposer:()=>composer,getSample:()=>sample,getChatKind:()=>'text',
  bridge:(type,extra)=>log.bridge.push({type,...extra}),notify:n=>log.notify.push(n),emit(){},
  startAutomatic:async()=>{log.started++;if(started){region={isConnected:true};composer={isConnected:true};sample={isConnected:true};auto=true;}return started;},stopAutomatic:r=>{log.stopped.push(r);auto=false;},connectAndStart(){}};
 const fresh={region:{isConnected:true},sample:{isConnected:true},composer:{isConnected:true}};
 const sandbox={Date:Clock,console,setInterval:()=>0,clearInterval(){},Promise,
  document:{createElement:()=>box},window:{addEventListener(){}},location:{origin:'https://steamcommunity.com'},
  chrome:{runtime:{sendMessage:async m=>{log.runtime.push(m);return {ok:true};}}},
  TylerCompanion:api,TylerStorage:{get:async()=>({}),set:async()=>{}},
  TylerSelection:{discover:()=>fresh},
  TylerSteamChat:{request:async(node,op,v)=>{log.requests.push(op);return op==='chat-same'?{same,known:true}:{groupId:'1'};}}};
 sandbox.globalThis=sandbox;vm.runInNewContext(source,sandbox);
 return {log,K:sandbox.TylerKeepAlive,detach:()=>{region={isConnected:false};composer={isConnected:false};},advance:ms=>{clock+=ms;},setOwner:v=>{owner=v;},flush:()=>new Promise(r=>setImmediate(r))};
}

test('Steam redraws the chat: Tyler re-attaches to the same channel by himself',async()=>{
 const f=fixture();await f.flush();await f.K.watch();assert.ok(f.log.requests.includes('chat-mark'),'the connected chat is marked');
 f.detach();await f.K.watch();
 assert.equal(f.log.started,1,'automatic mode restarted on the redrawn chat');assert.deepEqual(f.log.stopped,[]);assert.equal(f.log.notify.length,0);
 assert.match(f.K.status(),/Chat reconnected/);
});

test('a different or unclear chat is never picked: after a minute Tyler stops and says so',async()=>{
 const f=fixture({same:false});await f.flush();await f.K.watch();f.detach();
 await f.K.watch();assert.equal(f.log.started,0);assert.deepEqual(f.log.stopped,[],'Steam may still be drawing it');
 f.advance(61000);await f.K.watch();
 assert.equal(f.log.started,0,'never attaches to another channel');assert.deepEqual(f.log.stopped,['Chat changed']);
 assert.equal(f.log.notify[0].kind,'error');assert.equal(f.log.notify[0].action.label,'Connect & start');
});

test('keeps trying no more than three times in ten minutes',async()=>{
 const f=fixture();await f.flush();
 for(let i=0;i<4;i++){f.detach();await f.K.watch();f.advance(30000);}
 assert.equal(f.log.started,3);assert.deepEqual(f.log.stopped,['Chat changed']);
});

test('settings reach the audio bridge; Chrome keeps the tab awake only for the tab that runs Tyler',async()=>{
 const f=fixture();await f.flush();
 assert.ok(f.log.bridge.some(b=>b.type==='keepalive'&&b.on===true&&b.minutes===45),'call keep-alive on, 45 minutes by default');
 assert.ok(f.log.bridge.some(b=>b.type==='tab-awake'&&b.on===true));assert.ok(f.log.runtime.some(m=>m.type==='keepalive:tab'&&m.on===true));
 const d=fixture({platform:'desktop'});await d.flush();
 assert.ok(!d.log.bridge.some(b=>b.type==='tab-awake'),'the desktop app never freezes the window, so it needs no keep-awake');
});

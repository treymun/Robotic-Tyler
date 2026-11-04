// v2.25: the phone remote's server (app/remote.cjs) on this machine. Mocked Steam window (the `ask`
// function); real HTTP on 127.0.0.1. Not tested here: Windows' firewall and a real phone.
import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import path from 'node:path';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const {setupRemote,privateAddress,hostAllowed}=require('../app/remote.cjs');
const {memoryStorage}=require('../app/vault.cjs');
const ROOT=path.resolve(import.meta.dirname,'..');

function request(port,{method='GET',path:p='/',headers={},body,host}={}){
 return new Promise((resolve,reject)=>{const req=http.request({host:'127.0.0.1',port,method,path:p,headers:{host:host||'127.0.0.1:'+port,...headers}},res=>{const parts=[];res.on('data',c=>parts.push(c));res.on('end',()=>{const text=Buffer.concat(parts).toString();let json=null;try{json=JSON.parse(text);}catch{}resolve({status:res.statusCode,headers:res.headers,text,json});});});
  req.on('error',reject);if(body!==undefined)req.write(typeof body==='string'?body:JSON.stringify(body));req.end();});
}
const H={'content-type':'application/json','x-tyler-remote':'1'};

test('addresses: only the home network, only by IP address',()=>{
 for(const a of ['192.168.1.20','10.0.0.5','172.16.3.4','172.31.255.1','127.0.0.1','::1','::ffff:192.168.0.9','fe80::1','fd12::1'])assert.equal(privateAddress(a),true,a);
 for(const a of ['8.8.8.8','172.32.0.1','100.64.0.1','2001:db8::1','::ffff:1.1.1.1'])assert.equal(privateAddress(a),false,a);
 assert.equal(hostAllowed('192.168.1.20:47820',47820),true);assert.equal(hostAllowed('localhost:47820',47820),true);
 assert.equal(hostAllowed('evil.example:47820',47820),false,'a domain pointed at this PC is refused');assert.equal(hostAllowed('192.168.1.20:80',47820),false);
});

test('phone remote: pair with the code, then status and actions; nothing without pairing',async()=>{
 const vault=memoryStorage(),asked=[];
 const remote=setupRemote({vault,ask:async(action,args)=>{asked.push([action,args]);if(action==='state')return {ready:true,state:'listening',label:'Listening',theme:'payday',sounds:[{slot:2,name:'Airhorn'}]};return {};},
  pageDir:path.join(ROOT,'app','remote'),uiDir:path.join(ROOT,'app','companion','ui'),version:'9.9.9'});
 try{
  let s=await remote.handle('status');assert.equal(s.on,false,'off until you turn it on');
  s=await remote.handle('enable');const port=s.port;
  assert.equal(s.on,true);assert.match(s.code,/^\d{6}$/);assert.ok(s.qr?.length>=21||s.addresses.length===0,'a QR grid when there is a home address');
  assert.equal((await request(port)).status,200,'the page itself');assert.match((await request(port)).headers['content-security-policy'],/default-src 'none'/);
  assert.equal((await request(port,{path:'/ui/themes/payday.css'})).status,200);assert.equal((await request(port,{path:'/ui/themes/../../main.cjs'})).status,404);
  assert.equal((await request(port,{host:'evil.example:'+port})).status,421,'DNS rebinding is refused');
  assert.equal((await request(port,{path:'/state'})).status,401,'status needs a paired phone');
  assert.equal((await request(port,{method:'POST',path:'/action',headers:H,body:{action:'pause'}})).status,401,'so do actions');
  assert.equal(asked.length,0,'nothing reached Tyler');
  // Pairing: the custom header is required (no posting from another site), the code must match.
  assert.equal((await request(port,{method:'POST',path:'/pair',headers:{'content-type':'application/json'},body:{code:s.code}})).status,403);
  assert.equal((await request(port,{method:'POST',path:'/pair',headers:H,body:{code:'000000'===s.code?'111111':'000000'}})).status,403);
  const ok=await request(port,{method:'POST',path:'/pair',headers:{...H,'user-agent':'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)'},body:{code:s.code}});
  assert.equal(ok.status,200);const cookie=String(ok.headers['set-cookie']).split(';')[0];assert.match(String(ok.headers['set-cookie']),/HttpOnly; SameSite=Strict/);
  assert.equal((await request(port,{method:'POST',path:'/pair',headers:H,body:{code:s.code}})).status,403,'a code pairs one phone');
  const state=await request(port,{path:'/state',headers:{cookie}});
  assert.equal(state.status,200);assert.equal(state.json.state,'listening');assert.equal(state.json.theme,'payday');assert.equal(state.json.device,'iPhone');assert.equal(state.json.version,'9.9.9');
  const act=await request(port,{method:'POST',path:'/action',headers:{...H,cookie},body:{action:'sound',slot:2,extra:'ignored'}});
  assert.equal(act.status,200);assert.deepEqual(asked.at(-1),['sound',{slot:2}],'only the action\'s own fields reach Tyler');
  assert.equal((await request(port,{method:'POST',path:'/action',headers:{...H,cookie},body:{action:'delete-everything'}})).status,400);
  assert.equal((await request(port,{method:'POST',path:'/action',headers:{...H,cookie},body:{action:'say',text:'x'.repeat(900)}})).status,200);assert.equal(asked.at(-1)[1].text.length,300);
  // Settings lists the phone; removing it ends its access.
  s=await remote.handle('status');assert.equal(s.devices.length,1);assert.equal(s.devices[0].name,'iPhone');
  await remote.handle('forget',{id:s.devices[0].id});assert.equal((await request(port,{path:'/state',headers:{cookie}})).status,401);
  // Wrong codes use the code up.
  s=await remote.handle('new-code');for(let i=0;i<8;i++)await request(port,{method:'POST',path:'/pair',headers:H,body:{code:s.code==='000000'?'111111':'000000'}});
  assert.equal((await request(port,{method:'POST',path:'/pair',headers:H,body:{code:s.code}})).status,403,'after 8 wrong codes the right one no longer works');
  // Off: the port closes.
  await remote.handle('disable');await assert.rejects(request(port),/ECONNREFUSED/);
 }finally{await remote.stop();}
});

// v2.26: the panel's own files for the phone's copy of the panel, live events, and the two settings
// the phone may change. Mocked Steam window and settings; real HTTP on 127.0.0.1.
test('v2.26: panel files, live events to paired phones only, theme and call mute from the phone',async()=>{
 const vault=memoryStorage(),asked=[],prefs={theme:'steam',muteCall:false,calls:[]};
 const remote=setupRemote({vault,ask:async(action,args)=>{asked.push([action,args]);if(action==='state')return {ready:true,now:Date.now(),state:'listening',label:'Listening',theme:'steam',fx:{replies:3}};return {};},
  pageDir:path.join(ROOT,'app','remote'),uiDir:path.join(ROOT,'app','companion','ui'),libDir:path.join(ROOT,'app','companion'),version:'9.9.9',
  prefs:{get:async()=>({theme:prefs.theme,muteCall:prefs.muteCall}),theme:async t=>{prefs.calls.push(['theme',t]);prefs.theme=t;},muteCall:async on=>{prefs.calls.push(['muteCall',on]);prefs.muteCall=on;}}});
 try{
  const s=await remote.handle('enable'),port=s.port;
  // Only the listed files, compressed, kept for a day when the address carries this version.
  const lib=await request(port,{path:'/lib/ui-template.js?v=9.9.9',headers:{'accept-encoding':'gzip'}});
  assert.equal(lib.status,200);assert.equal(lib.headers['content-encoding'],'gzip');assert.match(lib.headers['cache-control'],/max-age=86400/);
  assert.equal((await request(port,{path:'/lib/theme-features.js'})).headers['cache-control'],'no-store','an old address is not kept');
  for(const p of ['/lib/background.js','/lib/settings.js','/lib/..%2Fmain.cjs','/lib/remote.cjs'])assert.equal((await request(port,{path:p})).status,404,p);
  assert.equal((await request(port,{path:'/whoami'})).json.theme,'steam','the pairing screen is in Tyler\'s theme');
  // Live events need a paired phone.
  assert.equal((await request(port,{path:'/events'})).status,401);
  const ok=await request(port,{method:'POST',path:'/pair',headers:H,body:{code:s.code}}),cookie=String(ok.headers['set-cookie']).split(';')[0];
  const stream=await new Promise((resolve,reject)=>{const req=http.request({host:'127.0.0.1',port,path:'/events',headers:{host:'127.0.0.1:'+port,cookie}},res=>{res.setEncoding('utf8');const got=[];let buf='';
   const out={res,req,got,next:type=>new Promise(r=>{const look=()=>{const i=got.findIndex(e=>e.event===type);if(i>=0)return r(got.splice(i,1)[0]);setTimeout(look,20);};look();})};
   res.on('data',c=>{buf+=c;let i;while((i=buf.indexOf('\n\n'))>=0){const block=buf.slice(0,i);buf=buf.slice(i+2);const ev=/^event: (\w+)/m.exec(block)?.[1],data=/^data: (.*)$/m.exec(block)?.[1];if(ev&&data)got.push({event:ev,data:JSON.parse(data)});}});resolve(out);});req.on('error',reject);req.end();});
  assert.equal(stream.res.headers['content-type'],'text/event-stream; charset=utf-8');
  const snap=await stream.next('snap');assert.equal(snap.data.ready,true);assert.equal(snap.data.fx.replies,3);assert.deepEqual(snap.data.prefs,{theme:'steam',muteCall:false});
  assert.ok(asked.some(([a,x])=>a==='watch'&&x.on===true),'the Steam window is asked to send events');
  remote.push([{type:'state',data:{state:'speaking',label:'On air'},at:1},{type:'bad'},null,{type:'reply',data:{chars:12},at:2}]);
  const ui=await stream.next('ui');assert.deepEqual(ui.data.events.map(e=>e.type),['state','reply'],'malformed events are dropped');
  // Settings from the phone: only a known theme, only true/false for the call.
  const post=body=>request(port,{method:'POST',path:'/action',headers:{...H,cookie},body});
  assert.equal((await post({action:'theme',theme:'payday'})).status,200);assert.equal((await post({action:'theme',theme:'evil'})).status,409);
  assert.equal((await post({action:'mute-call',on:'yes'})).status,200);assert.equal((await post({action:'mute-call',on:true})).status,200);
  assert.deepEqual(prefs.calls,[['theme','payday'],['muteCall',false],['muteCall',true]]);
  await new Promise(r=>setTimeout(r,1100)); // the rate limit
  // The Steam window's actions get only their own fields, clamped.
  await post({action:'keepalive',call:'yes',chat:false,minutes:999,extra:1});assert.deepEqual(asked.at(-1),['keepalive',{chat:false,minutes:'120'}]);
  await post({action:'music-volume',value:900});assert.deepEqual(asked.at(-1),['music-volume',{value:200}]);
  await post({action:'clip-volume',value:-3});assert.deepEqual(asked.at(-1),['clip-volume',{value:0}]);
  await post({action:'voice-volume',value:5});assert.deepEqual(asked.at(-1),['voice-volume',{value:.7}]);
  await post({action:'mode',mode:'voice',x:1});assert.deepEqual(asked.at(-1),['mode',{mode:'voice'}]);
  await new Promise(r=>setTimeout(r,1100));
  assert.equal((await post({action:'watch',on:true})).status,400,'the phone can\'t ask for events itself');
  assert.equal((await post({action:'state'})).status,400);
  // Removing the phone ends its stream, and the Steam window stops sending.
  const ended=new Promise(r=>stream.res.on('end',r));
  await remote.handle('forget',{id:(await remote.handle('status')).devices[0].id});await ended;
  assert.equal(remote.watching,0);await new Promise(r=>setTimeout(r,50));
  assert.deepEqual(asked.filter(a=>a[0]==='watch').at(-1),['watch',{on:false}]);
 }finally{await remote.stop();}
});

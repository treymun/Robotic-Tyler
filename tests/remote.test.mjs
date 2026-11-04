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

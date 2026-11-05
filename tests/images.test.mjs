// v2.34: chat images. Mocked throughout: no OpenRouter, no Venice, no Steam.
//  - image-core.js: the styles, the saved-settings checks, the command, the request each provider gets;
//  - the background (background.js with a mocked chrome API and fetch): keys, switches, the allow list,
//    the spending cap, costs counted, refusals explained;
//  - Steam's chat uploader (steam-chat-main.js against a stand-in shaped like Steam's chat view);
//  - the chat side (image-gen.js): cooldown, per-person and per-session limits, the queue, Pause.
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const read=f=>readFileSync(new URL('../browser-extension/'+f,import.meta.url),'utf8');
const J=x=>JSON.parse(JSON.stringify(x));
const core=()=>{const box={};box.globalThis=box;vm.runInNewContext(read('image-core.js'),box);return box.TylerImages;};

test('image-core: six styles (three OpenRouter, three Venice), safe settings, the command and the requests',()=>{
 const I=core();
 assert.deepEqual(J(Object.keys(I.STYLES)),['fast','standard','best','vfast','vstandard','vbest']);
 assert.deepEqual(J(Object.values(I.STYLES).map(s=>s.provider)),['openrouter','openrouter','openrouter','venice','venice','venice']);
 const d=I.config(null);assert.equal(d.enabled,false,'off until the owner turns it on');assert.equal(d.styles.vfast,false,'the Venice styles start off');
 const c=I.config({enabled:true,cooldownSec:77,perPerson:3,perSession:999,allowedIDs:'76561198000000001, nope\n76561198000000002',models:{fast:'evil"; x',vfast:'lustify-v7'},defaultStyle:'best',access:'selected'});
 assert.equal(c.cooldownSec,120,'only the offered choices');assert.equal(c.perPerson,3);assert.equal(c.perSession,20);
 assert.equal(c.allowedIDs,'76561198000000001\n76561198000000002');assert.equal(c.models.fast,I.DEFAULT_MODEL.fast,'a broken model id is ignored');assert.equal(c.models.vfast,'lustify-v7');
 assert.deepEqual(J(I.parse('!image a cat in a smoke',d)),{style:'fast',prompt:'a cat in a smoke',named:false});
 assert.deepEqual(J(I.parse('!img best a castle',d)),{style:'best',prompt:'a castle',named:true});
 assert.equal(I.parse('!image venice a dragon',d).style,'vfast');assert.equal(I.parse('!image vbest a dragon',d).style,'vbest');
 assert.deepEqual(J(I.parse('!image',d)),{help:true});assert.equal(I.parse('!image help',d).help,true);assert.equal(I.parse('image of a cat',d),null);
 assert.equal(I.parse('!image '+'x'.repeat(900),d).prompt.length,600);
 const or=I.request(d,'best','a castle at dusk');assert.equal(or.url,'https://openrouter.ai/api/v1/images');
 assert.deepEqual(J(or.body),{model:I.DEFAULT_MODEL.best,prompt:'a castle at dusk',n:1,aspect_ratio:'1:1',provider:{ignore:['parasail']}},'never Parasail');
 const ve=I.request(d,'vfast','a dragon');assert.equal(ve.url,'https://api.venice.ai/api/v1/image/generate');
 assert.deepEqual(J(ve.body),{model:'lustify-v8',prompt:'a dragon',safe_mode:false,format:'jpeg',variants:1,width:1024,height:1024},'safe mode off; a JPEG for Steam');
 const q=I.request(I.config({models:{vstandard:'qwen-image'}}),'vstandard','x y');assert.equal(q.body.width,undefined,'Qwen takes an aspect ratio, not a size');assert.equal(q.body.aspect_ratio,'1:1');
 assert.throws(()=>I.request(d,'fast',' '),/Describe the picture/);
 assert.deepEqual(J(I.result('openrouter',{data:[{b64_json:'QUJD',media_type:'image/png'}],usage:{cost:.014}})),{data:'QUJD',type:'image/png',cost:.014});
 assert.deepEqual(J(I.result('venice',{images:['QUJD']})),{data:'QUJD',type:'image/jpeg',cost:null});
 assert.throws(()=>I.result('venice',{images:[],content_policy_violation_count:1}),/refused/);
 assert.match(I.help(d),/!image PROMPT/);
});

// ── the background ──────────────────────────────────────────────────────
const store={};let listener,fetches=[],fetchImpl;
const area={get:async keys=>{const list=keys==null?Object.keys(store):typeof keys==='string'?[keys]:Array.isArray(keys)?keys:Object.keys(keys);return structuredClone(Object.fromEntries(list.filter(k=>k in store).map(k=>[k,store[k]])));},set:async v=>{Object.assign(store,structuredClone(v));},remove:async keys=>{for(const k of [].concat(keys))delete store[k];},setAccessLevel:async()=>{}};
globalThis.chrome={action:{onClicked:{addListener(){}}},runtime:{onMessage:{addListener:fn=>{listener=fn;}},openOptionsPage(){}},storage:{local:area,session:{get:async()=>({}),set:async()=>{},remove:async()=>{}},onChanged:{addListener(){}}},tabs:{get:async id=>({id}),query:async()=>[],sendMessage:async()=>{},update:async()=>({}),onRemoved:{addListener(){}}}};
globalThis.fetch=async(url,init)=>{fetches.push({url:String(url),init,body:JSON.parse(init.body)});return fetchImpl(url,init);};
await import('../browser-extension/background.js');
const ask=m=>new Promise(r=>listener(m,{tab:{id:5},url:'https://steamcommunity.com/chat/'},r));
await ask({type:'lease:claim',instance:'p1'});
const json=(o,status=200)=>new Response(JSON.stringify(o),{status,headers:{'content-type':'application/json'}});

test('the background makes the picture with the style\'s key and model, counts its cost, and explains refusals',async()=>{
 store.imageGen={enabled:true,styles:{fast:true,standard:true,best:true,vfast:true,vstandard:false,vbest:false}};store.openrouterKey='sk-or-abc';store.usage={reportedCostUSD:.1};
 fetchImpl=async()=>json({data:[{b64_json:'iVBORw0KGgo=',media_type:'image/png'}],usage:{cost:.014}});
 let r=await ask({type:'image:generate',style:'fast',prompt:'a cat'});
 assert.equal(r.ok,true,JSON.stringify(r));assert.equal(r.image,'iVBORw0KGgo=');assert.equal(r.provider,'openrouter');assert.equal(r.spoiler,false);
 assert.equal(fetches.at(-1).init.headers.Authorization,'Bearer sk-or-abc');assert.deepEqual(fetches.at(-1).body.provider.ignore,['parasail']);
 assert.ok(Math.abs(store.usage.reportedCostUSD-.114)<1e-9,'counted in spend');assert.equal(store.usage.imageRequests,1);
 // Venice: its own key, safe mode off, posted as a spoiler by default, its list price counted.
 r=await ask({type:'image:generate',style:'vfast',prompt:'a dragon'});assert.equal(r.ok,false);assert.match(r.error,/Venice API key/);
 store.veniceKey='venice-key-1234567890';fetchImpl=async()=>json({images:['/9j/4AAQ']});
 r=await ask({type:'image:generate',style:'vfast',prompt:'a dragon'});assert.equal(r.ok,true,JSON.stringify(r));
 assert.equal(fetches.at(-1).url,'https://api.venice.ai/api/v1/image/generate');assert.equal(fetches.at(-1).init.headers.Authorization,'Bearer venice-key-1234567890');assert.equal(fetches.at(-1).body.safe_mode,false);
 assert.equal(r.spoiler,true);assert.equal(r.mediaType,'image/jpeg');assert.equal(r.cost,.01);assert.equal(r.estimated,true);
 // Switches, the allow list and the cap stop it before any request.
 const n=fetches.length;
 r=await ask({type:'image:generate',style:'vstandard',prompt:'x y'});assert.match(r.error,/switched off/);
 store.imageGen={...store.imageGen,access:'selected',allowedIDs:'76561198000000001'};
 r=await ask({type:'image:generate',style:'fast',prompt:'x y',speaker:{id:'76561198000000002',name:'Sam'}});assert.match(r.error,/allow list/);
 fetchImpl=async()=>json({data:[{b64_json:'iVBORw0KGgo=',media_type:'image/png'}],usage:{cost:.014}});
 r=await ask({type:'image:generate',style:'fast',prompt:'x y',speaker:{id:'76561198000000001',name:'Alex'}});assert.equal(r.ok,true);
 store.spendingCapUSD=.1;r=await ask({type:'image:generate',style:'fast',prompt:'x y',speaker:{id:'76561198000000001',name:'Alex'}});assert.match(r.error,/spending cap/);
 delete store.spendingCapUSD;store.imageGen={enabled:false};r=await ask({type:'image:generate',style:'fast',prompt:'x y'});assert.match(r.error,/off/);
 assert.equal(fetches.length,n+1,'only the allowed request went out');
 // A refusal says so, and the key never appears in an error.
 store.imageGen={enabled:true};fetchImpl=async()=>json({error:{message:'Your request was rejected by the safety system (sk-or-abc)'}},400);
 r=await ask({type:'image:generate',style:'fast',prompt:'x y'});assert.match(r.error,/refused that prompt/);assert.doesNotMatch(r.error,/sk-or-abc/);
 const cfg=await ask({type:'image:config'});assert.deepEqual(cfg.keys,{openrouter:true,venice:true});assert.equal(JSON.stringify(cfg).includes('sk-or-abc'),false,'the config never carries a key');
});

// ── Steam's chat uploader ───────────────────────────────────────────────
function steamPage({fail=null}={}){
 const calls=[];const VC={m_VoiceCallState:{m_eState:0}};
 const props={eUploadState:0,strErrorDescription:''};
 const manager={m_fileUploadProps:props,async SetImageFileToUpload(file){calls.push(['set',file.name,file.type,file.size]);if(fail==='type'){props.eUploadState=5;props.strErrorDescription='File type not supported';}},
  async BeginFileUpload(info){calls.push(['begin',info]);if(fail==='server'){props.eUploadState=3;props.strErrorDescription='Server error';}else props.eUploadState=6;},Reset(){calls.push(['reset']);props.eUploadState=0;props.strErrorDescription='';}};
 const group={GetGroupID:()=>'12345',voiceRoomList:[]},text={GetGroup:()=>group,GetVoiceAllowed:()=>false,self:{accountid:2},ChatStore:{VoiceChat:VC}};
 const node={nodeType:1,isConnected:true,closest:()=>null,parentElement:null,__reactProps$x:{msg:{unAccountID:3,rtTimestamp:1700000000,unOrdinal:1},chatView:{chat:text,m_fileUploadManager:manager}}};
 let listener=null;const replies=[];
 const box={document:{querySelectorAll:()=>[],addEventListener:(t,fn)=>{if(t==='tyler-steam-chat-request')listener=fn;}},window:{postMessage:m=>replies.push(JSON.parse(JSON.stringify(m)))},location:{origin:'https://steamcommunity.com'},File,atob,Uint8Array,setTimeout,clearTimeout};
 vm.runInNewContext(read('steam-chat-main.js'),box);
 // The real way in: the request rides on an attribute of a chat node, as steam-chat-client.js sends it.
 const viaPage=async ({op,...values})=>{const raw=JSON.stringify({...values,id:'0123456789abcdef',op});node.getAttribute=k=>k==='data-tyler-chat-request'?raw:null;listener({target:node});for(let i=0;i<20;i++)await new Promise(r=>setImmediate(r));return replies.splice(0);};
 return {calls,viaPage,up:r=>box.TylerSteamChatAdapter.handle(node,{op:'image-upload',...r}).then(x=>JSON.parse(JSON.stringify(x)))};
}
test('a real-size picture gets through the page bridge (v2.34.0 dropped anything over 12,000 characters); other big requests still don\'t',async()=>{
 const s=steamPage(),big=Buffer.alloc(1_500_000,7).toString('base64');
 const ok=await s.viaPage({data:big,type:'image/jpeg',op:'image-upload'});
 assert.equal(ok.length,1,'one reply');assert.equal(ok[0].ok,true,JSON.stringify(ok[0]).slice(0,200));assert.equal(ok[0].uploaded,true);assert.equal(s.calls[0][3],1_500_000,'the whole picture arrived');
 const no=await s.viaPage({pad:'x'.repeat(20000),op:'voice-state'});assert.equal(no.length,0,'an oversized request of another kind is ignored');
 const small=await s.viaPage({op:'voice-state'});assert.equal(small.length,1,'normal requests unchanged');
});
test('the picture goes through Steam\'s own chat uploader; Steam\'s refusal is reported, and the uploader is reset',async()=>{
 const png=Buffer.from('89504e470d0a1a0a0000000d49484452','hex').toString('base64');
 let s=steamPage();const r=await s.up({data:png,type:'image/png'});
 assert.equal(r.uploaded,true);assert.equal(r.groupId,'12345');assert.equal(s.calls[0][0],'set');assert.match(s.calls[0][1],/\.png$/);assert.equal(s.calls[0][2],'image/png');
 assert.deepEqual(J(s.calls[1]),['begin',{bSpoiler:false}]);assert.deepEqual(J(s.calls[2]),['reset']);
 s=steamPage();await s.up({data:png,type:'image/jpeg',spoiler:true});assert.deepEqual(J(s.calls[1]),['begin',{bSpoiler:true}],'Venice pictures as spoilers');assert.match(s.calls[0][1],/\.jpg$/);
 s=steamPage({fail:'type'});await assert.rejects(s.up({data:png,type:'image/png'}),/didn’t accept the picture: File type not supported/);
 s=steamPage({fail:'server'});await assert.rejects(s.up({data:png,type:'image/png'}),/upload failed: Server error/);assert.deepEqual(J(s.calls.at(-1)),['reset']);
 s=steamPage();await assert.rejects(s.up({data:'',type:'image/png'}),/too large|picture/);
});

// ── the chat side ───────────────────────────────────────────────────────
function chat({config,generate}){
 const els=new Map(),el=id=>{if(!els.has(id))els.set(id,{id,textContent:'',onclick:null,addEventListener(){}});return els.get(id);};
 const sent=[],requests=[],uploads=[],pauseHooks=[];let observer,clock=1_000_000;
 class FakeDate extends Date{static now(){return clock;}}
 const later={isConnected:true,name:'a newer message'},region={isConnected:true,querySelectorAll:()=>[later]},sample={isConnected:true,name:'the setup message'};
 const api={getFeatureMount:()=>({append(){}}),isOwner:()=>true,isAiPaused:()=>false,getRegion:()=>region,getSample:()=>sample,send:t=>sent.push(t),emit(){},onPause:fn=>pauseHooks.push(fn)};
 const intervals=[];const box={Date:FakeDate,setTimeout:(fn)=>{Promise.resolve().then(fn);return 1;},setInterval:fn=>{intervals.push(fn);return intervals.length;},clearTimeout(){},console,
  document:{createElement:()=>({set innerHTML(v){},querySelector:s=>el(s.slice(1)),addEventListener(){}})},
  MutationObserver:class{constructor(fn){observer=fn;}observe(){}disconnect(){}},TylerCompanion:api,TylerSelection:{selector:()=>'.msg'},TylerChatTag:{own:()=>false},
  TylerIdentity:{identify:n=>n.who,meta:n=>n.meta},TylerCommands:{set(){}},
  TylerSteamChat:{request:async(node,op,v)=>{uploads.push({node:node.name,op,...v});return {uploaded:true};}},
  chrome:{runtime:{sendMessage:async m=>{requests.push(m);if(m.type==='image:config')return {config,keys:{openrouter:true,venice:true}};if(m.type==='image:generate')return generate(m);return {};}}}};
 box.globalThis=box;vm.runInNewContext(read('image-core.js'),box);vm.runInNewContext(read('image-gen.js'),box);
 const settle=async()=>{for(let i=0;i<20;i++)await new Promise(r=>setImmediate(r));};
 const msg=(text,id,name,key)=>({nodeType:1,innerText:text,matches:()=>true,querySelectorAll:()=>[],closest:()=>null,who:{id,name},meta:{key,senderId:id,at:clock}});
 return {ticks:async()=>{for(const fn of intervals)fn();await settle();},sample,status:()=>el('imgStatus').textContent+' | '+el('imgCounts').textContent,sent,requests,uploads,pauseHooks,settle,box,post:async n=>{observer([{addedNodes:[n]}]);await settle();},msg,tick:ms=>{clock+=ms;},generates:()=>requests.filter(r=>r.type==='image:generate')};
}
test('the chat side keeps the owner\'s limits: cooldown per person, per person and per session, then posts through Steam',async()=>{
 const A='76561198000000001',B='76561198000000002',C='76561198000000003';
 const c=chat({config:{enabled:true,cooldownSec:60,perPerson:2,perSession:3,styles:{fast:true,standard:true,best:true,vfast:true}},generate:async m=>({ok:true,image:'QUJD',mediaType:'image/png',model:'m',provider:'openrouter',cost:.014,ms:1200,spoiler:false})});
 await c.settle();c.box.TylerImageGen.state();
 await c.post(c.msg('!image a cat',A,'Alex','k1'));
 assert.equal(c.generates().length,1);assert.equal(c.uploads.length,1);assert.equal(c.uploads[0].op,'image-upload');assert.match(c.sent[0],/Drawing “a cat” for Alex \(Fast\)/);
 await c.post(c.msg('!image another cat',A,'Alex','k2'));assert.equal(c.generates().length,1,'cooldown');assert.match(c.sent.at(-1),/Alex, wait 1 min/);
 c.tick(61000);await c.post(c.msg('!image best a castle',A,'Alex','k3'));assert.equal(c.generates().length,2);assert.equal(c.generates()[1].style,'best');
 c.tick(61000);await c.post(c.msg('!image one more',A,'Alex','k4'));assert.equal(c.generates().length,2,'per-person limit '+JSON.stringify(c.sent)+' uploads '+c.uploads.length+' status '+c.status());assert.match(c.sent.at(-1),/had your 2 this session/);
 await c.post(c.msg('!image a dog',B,'Sam','k5'));assert.equal(c.generates().length,3);
 await c.post(c.msg('!image a bird',C,'Kai','k6'));assert.equal(c.generates().length,3,'session limit');assert.match(c.sent.at(-1),/this session’s 3 images are used up/);
 await c.post(c.msg('!image help',C,'Kai','k7'));assert.match(c.sent.at(-1),/!image PROMPT/);
 await c.post(c.msg('!image a dog',B,'Sam','k5'));assert.equal(c.generates().length,3,'the same Steam message is handled once');
});
test('a failed picture doesn\'t count against the person; Pause cancels the one being drawn',async()=>{
 let release;const c=chat({config:{enabled:true,cooldownSec:0,perPerson:1,perSession:0},generate:async()=>new Promise(r=>{release=r;})});
 await c.settle();
 await c.post(c.msg('!image a cat',  '76561198000000001','Alex','a1'));assert.equal(c.generates().length,1);
 release({ok:false,error:'OpenRouter 400: the model refused that prompt (its content rules).'});await c.settle();
 assert.match(c.sent.at(-1),/Couldn’t draw that for Alex: the model refused that prompt/);assert.equal(c.uploads.length,0);
 await c.post(c.msg('!image a dog','76561198000000001','Alex','a2'));assert.equal(c.generates().length,2,'the refused one didn\'t use up Alex\'s one');
 for(const fn of c.pauseHooks)fn();await c.settle();assert.ok(c.requests.some(r=>r.type==='image:cancel'),'Pause cancels the request in flight');
});
test('Steam redrawing the chat or scrolling the setup message away doesn\'t silently drop a picture',async()=>{
 let release;const c=chat({config:{enabled:true,cooldownSec:0,perPerson:0,perSession:0},generate:async()=>new Promise(r=>{release=r;})});
 await c.settle();
 await c.post(c.msg('!image a cat','76561198000000001','Alex','s1'));assert.equal(c.generates().length,1);
 c.sample.isConnected=false;await c.ticks();await c.ticks(); // the message picked in setup scrolled out of Steam's list; the watcher runs
 release({ok:true,image:'QUJD',mediaType:'image/png',model:'m',provider:'openrouter',cost:.014,ms:900,spoiler:false});await c.settle();
 assert.equal(c.uploads.length,1,'still posted');assert.equal(c.uploads[0].node,'a newer message','through another message of the same chat');
 assert.doesNotMatch(c.sent.join('\n'),/Couldn’t draw/);
});

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

test('image-core: seven styles (three OpenRouter, three Venice, v2.40: This PC), safe settings, the command and the requests',()=>{
 const I=core();
 assert.deepEqual(J(Object.keys(I.STYLES)),['fast','standard','best','vfast','vstandard','vbest','pc']);
 assert.deepEqual(J(Object.values(I.STYLES).map(s=>s.provider)),['openrouter','openrouter','openrouter','venice','venice','venice','local']);
 const d=I.config(null);assert.equal(d.enabled,false,'off until the owner turns it on');assert.equal(d.styles.vfast,false,'the Venice styles start off');assert.equal(d.styles.pc,false,'This PC starts off');
 assert.equal(I.parse('!image pc a robot',d).style,'pc');assert.notEqual(I.parse('!image local pub at night',d).style,'pc','"local" is an ordinary word in a prompt, not a style');
 assert.deepEqual(J(I.request(d,'pc','a robot  waving')),{provider:'local',model:null,prompt:'a robot waving'},'This PC: no URL, no key, no model id');
 assert.equal(I.config({models:{pc:'evil/model'}}).models.pc,'','no model id can be set for This PC');assert.match(I.price('pc',''),/free/);
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
function steamPage({fail=null,userinfo=null}={}){
 const calls=[];const VC={m_VoiceCallState:{m_eState:0}};
 const props={eUploadState:0,strErrorDescription:''};
 const manager={m_fileUploadProps:props,async SetImageFileToUpload(file){calls.push(['set',file.name,file.type,file.size]);if(fail==='type'){props.eUploadState=5;props.strErrorDescription='File type not supported';}},
  async BeginFileUpload(info){calls.push(['begin',info]);if(fail==='server'){props.eUploadState=3;props.strErrorDescription='Server error';}else if(fail==='limited'){props.eUploadState=3;props.strErrorDescription='Failed to start upload: Limited users cannot upload images.';}else props.eUploadState=6;},Reset(){calls.push(['reset']);props.eUploadState=0;props.strErrorDescription='';}};
 const group={GetGroupID:()=>'12345',voiceRoomList:[]},text={GetGroup:()=>group,GetVoiceAllowed:()=>false,self:{accountid:2},ChatStore:{VoiceChat:VC}};
 const node={nodeType:1,isConnected:true,closest:()=>null,parentElement:null,__reactProps$x:{msg:{unAccountID:3,rtTimestamp:1700000000,unOrdinal:1},chatView:{chat:text,m_fileUploadManager:manager}}};
 let listener=null;const replies=[];
 const box={document:{querySelectorAll:()=>[],getElementById:id=>id==='webui_config'&&userinfo?{getAttribute:k=>k==='data-userinfo'?JSON.stringify(userinfo):null}:null,addEventListener:(t,fn)=>{if(t==='tyler-steam-chat-request')listener=fn;}},window:{postMessage:m=>replies.push(JSON.parse(JSON.stringify(m)))},location:{origin:'https://steamcommunity.com'},File,atob,Uint8Array,setTimeout,clearTimeout};
 vm.runInNewContext(read('steam-chat-main.js'),box);
 // The real way in: the request rides on an attribute of a chat node, as steam-chat-client.js sends it.
 const viaPage=async ({op,...values})=>{const raw=JSON.stringify({...values,id:'0123456789abcdef',op});node.getAttribute=k=>k==='data-tyler-chat-request'?raw:null;listener({target:node});for(let i=0;i<20;i++)await new Promise(r=>setImmediate(r));return replies.splice(0);};
 return {calls,viaPage,ask:op=>box.TylerSteamChatAdapter.handle(node,{op}).then(x=>JSON.parse(JSON.stringify(x))),up:r=>box.TylerSteamChatAdapter.handle(node,{op:'image-upload',...r}).then(x=>JSON.parse(JSON.stringify(x)))};
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
function chat({config,generate,check=()=>({available:true,limited:null}),upload=()=>({uploaded:true}),localInfo={available:false,ready:false},onScreen=[]}){
 const els=new Map(),el=id=>{if(!els.has(id))els.set(id,{id,textContent:'',onclick:null,addEventListener(){}});return els.get(id);};
 const sent=[],requests=[],uploads=[],checks=[],pauseHooks=[];let observer,clock=1_000_000;
 class FakeDate extends Date{static now(){return clock;}}
 const later={isConnected:true,name:'a newer message'},region={isConnected:true,querySelectorAll:()=>[later,...onScreen]},sample={isConnected:true,name:'the setup message'};
 const api={getFeatureMount:()=>({append(){}}),isOwner:()=>true,isAiPaused:()=>false,getRegion:()=>region,getSample:()=>sample,send:t=>sent.push(t),emit(){},onPause:fn=>pauseHooks.push(fn)};
 const intervals=[];const box={Date:FakeDate,setTimeout:(fn)=>{Promise.resolve().then(fn);return 1;},setInterval:fn=>{intervals.push(fn);return intervals.length;},clearTimeout(){},console,
  document:{createElement:()=>({set innerHTML(v){},querySelector:s=>el(s.slice(1)),addEventListener(){}})},
  MutationObserver:class{constructor(fn){observer=fn;}observe(){}disconnect(){}},TylerCompanion:api,TylerSelection:{selector:()=>'.msg'},TylerChatTag:{own:()=>false},
  TylerIdentity:{identify:n=>n.who,meta:n=>n.meta},TylerCommands:{set(){}},
  TylerSteamChat:{request:async(node,op,v)=>{if(op==='upload-check'){checks.push(node.name);return check();}if(op==='group')return {members:[{name:'Alex'},{name:'Big Sam'}]};uploads.push({node:node.name,op,...v});return upload();}},
  chrome:{runtime:{sendMessage:async m=>{requests.push(m);if(m.type==='image:config')return {config,keys:{openrouter:true,venice:true},local:localInfo};if(m.type==='image:generate')return generate(m);return {};}}}};
 box.globalThis=box;vm.runInNewContext(read('image-core.js'),box);vm.runInNewContext(read('image-gen.js'),box);
 const settle=async()=>{for(let i=0;i<20;i++)await new Promise(r=>setImmediate(r));};
 const msg=(text,id,name,key)=>({nodeType:1,innerText:text,matches:()=>true,querySelectorAll:()=>[],closest:()=>null,who:{id,name},meta:{key,senderId:id,at:clock}});
 return {el,ticks:async()=>{for(const fn of intervals)fn();await settle();},sample,status:()=>el('imgStatus').textContent+' | '+el('imgCounts').textContent,sent,requests,uploads,checks,pauseHooks,settle,box,post:async n=>{observer([{addedNodes:[n]}]);await settle();},msg,tick:ms=>{clock+=ms;},generates:()=>requests.filter(r=>r.type==='image:generate')};
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

// v2.34.3: the owner's screenshot: "Failed to start upload: Limited users cannot upload images."
test('a limited Steam account: Steam\'s page says so, the check returns only that yes/no, and its refusal is explained',async()=>{
 const png=Buffer.from('89504e470d0a1a0a0000000d49484452','hex').toString('base64');
 let s=steamPage({userinfo:{logged_in:true,is_limited:true,token:'SECRET',webapi_token:'SECRET2'}});
 const r=await s.ask('upload-check');assert.deepEqual(r,{available:true,limited:true},'only availability and the limited flag come back');assert.doesNotMatch(JSON.stringify(r),/SECRET/);
 await assert.rejects(s.up({data:png,type:'image/png'}),/LIMITED_ACCOUNT/);assert.equal(s.calls.length,0,'nothing is handed to Steam');
 s=steamPage({userinfo:{is_limited:false}});assert.deepEqual(await s.ask('upload-check'),{available:true,limited:false});
 s=steamPage();assert.deepEqual(await s.ask('upload-check'),{available:true,limited:null},'unknown when Steam\'s page doesn\'t say');
 s=steamPage({fail:'limited'});await assert.rejects(s.up({data:png,type:'image/png'}),/LIMITED_ACCOUNT: Steam doesn’t let limited accounts post pictures/);assert.deepEqual(J(s.calls.at(-1)),['reset']);
});
test('a limited account: nothing is drawn (so nothing is paid for), the chat is told why, and later requests are refused at once',async()=>{
 const c=chat({config:{enabled:true,cooldownSec:0,perPerson:0,perSession:0},generate:async()=>({ok:true,image:'QUJD',mediaType:'image/png',model:'m',cost:.014,ms:900}),check:()=>({available:true,limited:true})});
 await c.settle();
 await c.post(c.msg('!image a cat','76561198000000001','Alex','l1'));
 assert.equal(c.generates().length,0,'no picture made');assert.equal(c.uploads.length,0);
 assert.match(c.sent.at(-1),/Sorry Alex, this Steam account can’t post pictures/);assert.match(c.status(),/limited Steam account.*\$5/);
 await c.post(c.msg('!image a dog','76561198000000002','Sam','l2'));assert.equal(c.generates().length,0);assert.equal(c.checks.length,1,'refused without asking again');assert.match(c.sent.at(-1),/Sam, this Steam account can’t post pictures/);
 assert.doesNotMatch(c.sent.join('\n'),/Drawing/,'never says it\'s drawing');
});
test('when Steam only says so at upload time, the queue is dropped and later requests are refused without drawing',async()=>{
 let release;const c=chat({config:{enabled:true,cooldownSec:0,perPerson:0,perSession:0},generate:async()=>new Promise(r=>{release=r;}),upload:()=>{throw Error('LIMITED_ACCOUNT: Steam doesn’t let limited accounts post pictures.');}});
 await c.settle();
 await c.post(c.msg('!image a cat','76561198000000001','Alex','u1'));await c.post(c.msg('!image a dog','76561198000000002','Sam','u2'));
 assert.equal(c.generates().length,1);assert.match(c.sent.at(-1),/Queued for Sam/);
 release({ok:true,image:'QUJD',mediaType:'image/png',model:'m',cost:.014,ms:900});await c.settle();
 assert.equal(c.generates().length,1,'the queued one is not drawn');assert.match(c.sent.at(-1),/Sorry Alex, this Steam account can’t post pictures/);
 await c.post(c.msg('!image a bird','76561198000000003','Kai','u3'));assert.equal(c.generates().length,1);assert.match(c.sent.at(-1),/Kai, this Steam account can’t post pictures/);
});

// ── v2.40: Tyler's image rules before every picture, and the This PC style ──────────────────────
// Mocked: no OpenRouter, no Venice, no engine (globalThis.tylerLocalImages is a stand-in for the
// desktop app's bridge, app/local-images/desktop.cjs). The rules themselves are the real ones.
test('v2.40: Tyler’s image rules run before every cloud picture, for everyone: a refusal says why and nothing is sent',async()=>{
 store.imageGen={enabled:true,styles:{fast:true,standard:true,best:true,vfast:true,vstandard:true,vbest:true}};store.openrouterKey='sk-or-abc';store.veniceKey='venice-key-1234567890';delete store.spendingCapUSD;
 fetchImpl=async()=>json({data:[{b64_json:'iVBORw0KGgo=',media_type:'image/png'}],usage:{cost:.014}});
 const n=fetches.length;
 for(const [style,prompt,rule] of [['fast','nude t33n','points to someone under 18'],['vfast','a n.u.d.e 16 year old','points to someone under 18'],['vbest','Taylor Swift topless','real person'],['best','sexy schoolgirl','under 18']]){
  const r=await ask({type:'image:generate',style,prompt});assert.equal(r.ok,false,style+' '+prompt);assert.match(r.error,/^Tyler won’t make this image/);assert.match(r.error,new RegExp(rule));}
 // The people in the chat are passed along, so "nude <someone here>" is refused too.
 let r=await ask({type:'image:generate',style:'vfast',prompt:'nude xXSniperXx in a bikini',names:['xXSniperXx','Alex']});assert.match(r.error,/real person/);
 // Venice is uncensored: a child is refused there even in an ordinary prompt; a mainstream style may draw it.
 r=await ask({type:'image:generate',style:'vfast',prompt:'a kid playing soccer'});assert.match(r.error,/uncensored model/);
 assert.equal(fetches.length,n,'no request went out for any of them');
 r=await ask({type:'image:generate',style:'fast',prompt:'a kid playing soccer'});assert.equal(r.ok,true);
 fetchImpl=async()=>json({images:['/9j/4AAQ']});r=await ask({type:'image:generate',style:'vfast',prompt:'a nude adult woman on a beach, oil painting'});assert.equal(r.ok,true,'adult content about made-up adults is allowed on Venice');
 // "fromPanel" only means the owner for This PC (the Draw box): it never skips the chat switches for a cloud style.
 store.imageGen={enabled:false,styles:{fast:true}};const m=fetches.length;
 r=await ask({type:'image:generate',style:'fast',prompt:'a robot',fromPanel:true});assert.equal(r.ok,false);assert.match(r.error,/Chat images are off/);assert.equal(fetches.length,m);
});
test('v2.40: This PC in Chrome says it’s a desktop-app feature; in the desktop app it uses the bridge (no key, no cost, no cap), with friends and the uncensored model only when the owner allows',async()=>{
 store.imageGen={enabled:true,styles:{fast:true,pc:true}};delete store.openrouterKey;delete store.veniceKey;store.spendingCapUSD=.01;store.usage={reportedCostUSD:5};
 delete globalThis.tylerLocalImages;const n=fetches.length;
 let r=await ask({type:'image:generate',style:'pc',prompt:'a robot'});assert.equal(r.ok,false);assert.match(r.error,/part of the ROBOTIC TYLER desktop app, and this is Chrome/);
 let cfg=await ask({type:'image:config'});assert.equal(cfg.local.available,false);
 const calls=[];let li={ready:true,installed:true,label:'Z-Image Turbo for 6–8 GB cards',uncensored:false,friends:false,friendsUncensored:false};
 globalThis.tylerLocalImages={status:async()=>({...li}),release:async()=>{},generate:async o=>{calls.push(o);if(o.prompt==='slow')await new Promise((res,rej)=>o.signal.addEventListener('abort',()=>rej(Object.assign(Error('Stopped.'),{code:'cancelled'}))));return {image:'iVBORw0KGgo=',mime:'image/png',label:li.label,uncensored:li.uncensored,device:'gpu',ms:2400};}};
 cfg=await ask({type:'image:config'});assert.deepEqual(J(cfg.local),{available:true,ready:true,installed:true,label:li.label,uncensored:false,friends:false,friendsUncensored:false,problem:null});
 r=await ask({type:'image:generate',style:'pc',prompt:'a robot',speaker:{id:'76561198000000002',name:'Sam'}});assert.match(r.error,/Only the owner can use images on this PC/);assert.equal(calls.length,0);
 // The owner's Draw box: no key and the spending cap is reached, still fine (it costs nothing); posted like any picture.
 r=await ask({type:'image:generate',style:'pc',prompt:'a robot',fromPanel:true,names:['Alex','Sam']});
 assert.equal(r.ok,true,JSON.stringify(r));assert.equal(r.provider,'local');assert.equal(r.cost,0);assert.equal(r.mediaType,'image/png');assert.equal(r.image,'iVBORw0KGgo=');assert.match(r.model,/this PC/);
 assert.equal(calls[0].from,'owner');assert.deepEqual(J(calls[0].names),['Alex','Sam']);assert.equal(calls[0].prompt,'a robot');
 assert.equal(store.usage.localImageRequests,1);assert.equal(store.usage.reportedCostUSD,5,'nothing added to the bill');
 // Friends allowed: from:'friend'. The uncensored model: refused for friends unless the owner allows it too; never another model.
 li.friends=true;r=await ask({type:'image:generate',style:'pc',prompt:'a robot',speaker:{id:'76561198000000002',name:'Sam'}});assert.equal(r.ok,true);assert.equal(calls.at(-1).from,'friend');
 li.uncensored=true;li.label='Chroma1-HD uncensored for 8 GB cards';const before=calls.length;
 r=await ask({type:'image:generate',style:'pc',prompt:'a robot',speaker:{id:'76561198000000002',name:'Sam'}});assert.match(r.error,/uncensored, and only the owner can use it. Tyler didn’t switch to another model/);assert.equal(calls.length,before);
 r=await ask({type:'image:generate',style:'pc',prompt:'a kid playing soccer',fromPanel:true});assert.match(r.error,/uncensored model/,'the uncensored rule applies to the owner too');assert.equal(calls.length,before);
 li.friendsUncensored=true;r=await ask({type:'image:generate',style:'pc',prompt:'a robot',speaker:{id:'76561198000000002',name:'Sam'}});assert.equal(r.ok,true);assert.equal(r.spoiler,true,'uncensored pictures are posted as spoilers (the Venice spoiler setting)');
 // Not installed: said, nothing made. Pause/Stop (image:cancel) ends a picture being made.
 li={...li,ready:false,installed:false};r=await ask({type:'image:generate',style:'pc',prompt:'a robot',fromPanel:true});assert.match(r.error,/aren’t installed yet/);
 li={...li,ready:true,installed:true,uncensored:false};const p=ask({type:'image:generate',style:'pc',prompt:'slow',fromPanel:true});
 for(let i=0;i<50&&!calls.some(c=>c.prompt==='slow');i++)await new Promise(res=>setTimeout(res,5));await ask({type:'image:cancel'});r=await p;assert.equal(r.ok,false);assert.match(r.error,/Image cancelled/);
 assert.equal(fetches.length,n,'This PC never calls a cloud service');
 delete globalThis.tylerLocalImages;delete store.spendingCapUSD;
});
test('v2.40 chat side: This PC needs the desktop app and the owner’s permission; the owner’s Draw box posts like !image, sends the chat’s names, and a rules refusal is a short line in chat',async()=>{
 const A='76561198000000001',img={ok:true,image:'QUJD',mediaType:'image/png',model:'Z-Image Turbo (this PC)',provider:'local',cost:0,ms:3000,spoiler:false};
 let c=chat({config:{enabled:true,cooldownSec:0,perPerson:0,perSession:0,styles:{fast:true,pc:true}},generate:async()=>img});
 await c.settle();await c.post(c.msg('!image pc a robot',A,'Alex','p1'));assert.equal(c.generates().length,0);assert.match(c.sent.at(-1),/part of the ROBOTIC TYLER desktop app/);
 assert.equal(c.el('imgDrawBox').hidden,true,'no Draw box in Chrome');
 c=chat({config:{enabled:true,cooldownSec:0,perPerson:0,perSession:0,styles:{fast:true,pc:true}},generate:async()=>img,localInfo:{available:true,ready:true,label:'Z-Image Turbo',uncensored:true,friends:true,friendsUncensored:false}});
 await c.settle();assert.equal(c.el('imgDrawBox').hidden,false,'the Draw box shows in the desktop app');
 await c.post(c.msg('!image pc a robot',A,'Alex','p2'));assert.equal(c.generates().length,0);assert.match(c.sent.at(-1),/uncensored model is for the owner only/);
 // The owner's Draw box: posted, no "Drawing…" line from the owner's account, the request says it's the owner's, with the chat's names.
 c.el('imgDrawPrompt').value='  a chrome robot   cheering ';
 // A click made by a script on the page (not the owner's own click) does nothing.
 c.el('imgDraw').onclick({isTrusted:false});c.el('imgDraw').onclick();await c.settle();assert.equal(c.generates().length,0,'only a real click on the Draw box counts');
 c.el('imgDraw').onclick({isTrusted:true});await c.settle();
 const g=c.generates().at(-1);assert.equal(g.style,'pc');assert.equal(g.fromPanel,true);assert.equal(g.prompt,'a chrome robot cheering');
 assert.ok(g.names.includes('Alex')&&g.names.includes('Big Sam'),'names from the chat and the group list: '+JSON.stringify(g.names));
 assert.equal(c.uploads.length,1);assert.equal(c.uploads[0].type,'image/png');assert.doesNotMatch(c.sent.join('\n'),/Drawing “a chrome robot/);assert.match(c.status(),/Posted your picture · Z-Image Turbo \(this PC\) · free/);
 // A friend's request only ever carries fromPanel when it came from the box: chat lines never do.
 assert.ok(c.generates().filter(x=>x!==g).every(x=>x.fromPanel!==true));
 // A rules refusal: a short line in chat, the whole reason in the panel.
 c=chat({config:{enabled:true,cooldownSec:0,perPerson:0,perSession:0,styles:{fast:true}},generate:async()=>({ok:false,error:'Tyler won’t make this image: it’s sexual or revealing and points to someone under 18 (“teen”). Tyler never makes sexual or revealing images involving minors. This rule applies to every model (uncensored ones too) and to everyone, the owner included.'})});
 await c.settle();await c.post(c.msg('!image nude teen',A,'Alex','p3'));
 assert.match(c.sent.at(-1),/Sorry Alex, Tyler won’t draw that \(his image rules: nothing sexual involving minors or real people\)/);assert.doesNotMatch(c.sent.at(-1),/teen/);assert.match(c.status(),/points to someone under 18/);
});
test('v2.40 chat side: the owner’s Draw box works with chat images off for friends, and still sends the names of the people on screen',async()=>{
 const img={ok:true,image:'QUJD',mediaType:'image/png',model:'Z-Image Turbo (this PC)',provider:'local',cost:0,ms:3000,spoiler:false};
 const c=chat({config:{enabled:false,styles:{fast:true}},generate:async()=>img,localInfo:{available:true,ready:true,label:'Z-Image Turbo',uncensored:false,friends:false,friendsUncensored:false},
  onScreen:[{isConnected:true,name:'m1',who:{name:'Casey Jones'},meta:{}},{isConnected:true,name:'m2',who:{name:'ROBOTIC TYLER'},meta:{self:true}}]});
 await c.settle();assert.match(c.el('imgStatus').textContent,/Chat images are off for friends.*Your Draw box works either way/);
 c.el('imgDrawPrompt').value='a robot waving';c.el('imgDraw').onclick({isTrusted:true});await c.settle();
 const g=c.generates().at(-1);assert.equal(g.fromPanel,true);assert.equal(g.style,'pc');
 assert.ok(g.names.includes('Casey Jones'),'someone on screen is passed for the real-people rule: '+JSON.stringify(g.names));assert.ok(!g.names.includes('ROBOTIC TYLER'),'the bot’s own lines aren’t counted');
 assert.equal(c.uploads.length,1);assert.match(c.status(),/Posted your picture/);
});

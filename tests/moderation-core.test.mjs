import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('../browser-extension/moderation-core.js',import.meta.url),'utf8');
const id=n=>String(76561197960265728n+BigInt(n));
function setup(){const box={};vm.runInNewContext(source,box);const ctx={groupId:'12345',botId:id(2),ownerId:id(1),canKick:true,members:Array.from({length:7},(_,i)=>({id:id(i+1),name:['Owner','Tyler','Alex','Sam','Lee','Pat','Target'][i],canKick:i>1,protected:i<2}))};return {api:box.TylerModeration,model:box.TylerModeration.create(),ctx,who:n=>ctx.members.find(m=>m.id===id(n))};}

test('moderation command parser stays explicit and ignores bot output/chatter',()=>{
 const {api}=setup();assert.equal(api.parse('!votekick Target').target,'Target');assert.equal(api.parse('!kick yes').action,'yes');assert.equal(api.parse('!votekick no').action,'no');
 for(const s of ['kick him','[ROBOTIC TYLER] !kick yes','!kick everyone','hello'])assert.equal(api.parse(s),null);
});
test('three distinct yes accounts pass; caller counts once and nickname changes do not add votes',()=>{
 const {model,ctx,who}=setup();let p=model.start(ctx,'Target',who(3),1000);assert.equal(p.yes.length,1);
 assert.equal(model.vote(ctx,{...who(3),name:'Renamed'},true,1100).duplicate,true);assert.equal(model.vote(ctx,who(4),true,1200).poll.state,'open');
 assert.equal(model.vote(ctx,who(5),true,1300).poll.state,'passed');const action=model.claim(1300);assert.equal(action.voters.length,3);assert.equal(action.targetId,id(7));assert.equal(model.claim(1300),null);model.finish(action.ballotId,true);assert.equal(model.current.state,'kicked');
});
test('target, bot, outsiders, new arrivals and different group cannot vote',()=>{
 const {model,ctx,who}=setup();model.start(ctx,'Target',who(3),1000);
 for(const voter of [who(7),who(2),{id:id(99),name:'Outsider'}])assert.throws(()=>model.vote(ctx,voter,true,1100),/eligible/);
 assert.throws(()=>model.vote({...ctx,groupId:'other'},who(4),true,1100),/different group/);
});
test('owner/bot and ambiguous targets are protected; missing kick permission cannot start',()=>{
 const {model,ctx,who}=setup();for(const target of ['Owner','Tyler'])assert.throws(()=>model.start(ctx,target,who(3),1000),/protected/);
 assert.throws(()=>model.start({...ctx,canKick:false},'Target',who(3),1000),/permission/);
 const ambiguous={...ctx,members:[...ctx.members,{...who(6),name:'Target'}]};assert.throws(()=>model.start(ambiguous,'Target',who(3),1000),/ambiguous/);
});
test('cancelled, rejected and expired ballots allow a new vote immediately',()=>{
 const {model,ctx,who}=setup();model.start(ctx,'Target',who(3),1000);assert.throws(()=>model.cancel(who(4),ctx.ownerId),/caller/);assert.equal(model.cancel(who(3),ctx.ownerId),true);
 model.start(ctx,'Target',null,1001);for(const n of [3,4,5])model.vote(ctx,who(n),false,1001+n);assert.equal(model.current.state,'rejected');assert.equal(model.claim(1010),null);
 model.start(ctx,'Target',who(3),1011);assert.equal(model.tick(61012).state,'expired');assert.equal(model.claim(61012),null);assert.equal(model.start(ctx,'Target',who(3),61013).state,'open');
});
test('local panel starts without a fake bot vote and insufficient eligible groups are rejected',()=>{
 const {model,ctx}=setup();assert.equal(model.start(ctx,'Target',null,1000).yes.length,0);
 const another=setup();assert.throws(()=>another.model.start({...ctx,members:ctx.members.filter(m=>![id(1),id(6),id(5)].includes(m.id))},'Target',null,1000),/three eligible/);
});

test('panel-selected account resolves exactly even if somebody uses its numeric ID as a nickname',()=>{
 const {model,ctx,who}=setup();who(6).name=id(7);assert.equal(model.start(ctx,id(7),null,1000).targetId,id(7));
});

test('a second vote cannot replace an open, passed or executing ballot; completion removes the lock',()=>{
 const {model,ctx,who}=setup();const first=model.start(ctx,'Target',who(3),1000);
 assert.throws(()=>model.start(ctx,'Pat',who(3),1001),/already active/);model.vote(ctx,who(4),true,1002);model.vote(ctx,who(5),true,1003);
 assert.throws(()=>model.start(ctx,'Pat',who(3),1004),/already active/);const action=model.claim(1004);assert.throws(()=>model.start(ctx,'Pat',who(3),1005),/already active/);
 model.finish(action.ballotId,true);const second=model.start(ctx,'Pat',who(3),1006);assert.equal(second.state,'open');assert.notEqual(second.id,first.id);
 model.vote(ctx,who(4),true,1007);model.vote(ctx,who(5),true,1008);const failed=model.claim(1009);model.finish(failed.ballotId,false,'Rejected by Steam');assert.equal(model.start(ctx,'Target',who(3),1010).state,'open');
});

test('an expired passed ballot releases the lock before execution, while an in-flight kick stays locked',()=>{
 const {model,ctx,who}=setup();model.start(ctx,'Target',who(3),1000);model.vote(ctx,who(4),true,1100);model.vote(ctx,who(5),true,1200);
 assert.equal(model.claim(61001),null);assert.equal(model.current.state,'expired');model.start(ctx,'Target',who(3),61002);model.vote(ctx,who(4),true,61003);model.vote(ctx,who(5),true,61004);const action=model.claim(61005);
 model.tick(999999);assert.throws(()=>model.start(ctx,'Pat',who(3),999999),/already active/);model.finish(action.ballotId,true);assert.equal(model.start(ctx,'Pat',who(3),1000000).state,'open');
});

test('mute ballots share the kick lock, count account IDs once and reject answers meant for another vote type',()=>{
 const {api,ctx,who,model}=setup();for(const m of ctx.members)m.canDelete=m.canKick;
 assert.equal(api.parse('!votemute Target').kind,'mute');assert.equal(api.parse('!mute yes').kind,'mute');assert.equal(api.parse('!modhelp').action,'help');assert.equal(api.parse('mute Target'),null);
 model.start(ctx,'Target',who(3),1000,'mute');assert.throws(()=>model.start(ctx,'Pat',who(4),1001),/already active/);assert.throws(()=>model.vote(ctx,who(4),true,1002,'kick'),/Use !mute/);
 assert.equal(model.vote(ctx,who(3),true,1003,'mute').duplicate,true);model.vote(ctx,who(4),true,1004,'mute');model.vote(ctx,who(5),true,1005,'mute');const action=model.claim(1006);assert.equal(action.kind,'mute');assert.equal(model.claim(1006),null);model.finish(action.ballotId,true);assert.equal(model.current.state,'muted');assert.equal(model.start(ctx,'Pat',who(3),1007).kind,'kick');
});

test('text mute votes need deletion permission, protect owner/bot and do not extend existing mutes',()=>{
 const {model,ctx,who}=setup();assert.throws(()=>model.start(ctx,'Target',who(3),1000,'mute'),/deletion permission/);for(const m of ctx.members)m.canDelete=m.canKick;
 for(const target of ['Owner','Tyler'])assert.throws(()=>model.start(ctx,target,who(3),1000,'mute'),/protected/);
 assert.throws(()=>model.start({...ctx,textMutes:[{id:id(7),until:9999}]},'Target',who(3),1000,'mute'),/already text muted/);
});

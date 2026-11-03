import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {Element,message} from './helpers/message-dom.mjs';
const source=f=>readFileSync(new URL('../browser-extension/'+f,import.meta.url),'utf8');
const id=n=>String(76561197960265728n+BigInt(n));
function fixture(){
 let clock=Date.now(),permitted=true,fail=false,voices=[],stamp=clock;class Clock extends Date{static now(){return clock;}}const calls=[],g=message('Alex',null);
 const members=Array.from({length:7},(_,i)=>({m_unAccountID:i+1,get accountid(){return this.m_unAccountID;},get display_name(){return ['Owner','Tyler','Alex','Sam','Lee','Pat','Target'][i];},get primary_display_name(){return this.display_name;}}));
 const group={GetGroupID:()=> '12345',GetOwnerAccountID:()=>1,BIsAccountIDOwner:n=>n===1,BCanKick:()=>permitted,BCanKickMember:n=>permitted&&n!==1&&n!==2,BHasMember:n=>members.some(m=>m.accountid===n),memberList:{member_list:members},async KickUser(n,expiration){calls.push({n,expiration});if(fail)throw Error('Steam rejected kick');}};
 const bans=new Set();group.BCanBan=()=>permitted;group.BCanBanMember=n=>permitted&&n!==1&&n!==2;group.BCanDeleteMemberMessages=n=>permitted&&n!==1;
 group.GetBanList=async()=>({loadingState:'loaded',rgBans:[...bans].map(n=>({accountid:()=>n}))});group.SetUserBanState=async(n,value)=>{calls.push({ban:n,value});if(fail)throw Error('Steam rejected ban');if(value)bans.add(n);else bans.delete(n);};
 const chat={GetGroup:()=>group,GetRoomID:()=> '777',self:members[1],DeleteChatMessages:async messages=>{calls.push({deleted:messages});return fail?2:1;}};const msg={unAccountID:5,get rtTimestamp(){return stamp/1000;},unOrdinal:1,strMessage:'A group message'};
 g.body.attributes.class='msgText';g.body.parentElement.attributes.class='msg';g.body.__reactFiber$steam={memoizedProps:{className:'msgText'},stateNode:g.body,return:{memoizedProps:{msg,chatView:{chat}}}};
 const document={querySelectorAll:()=>voices,addEventListener(){}};const box={Date:Clock,document,window:{postMessage(){}},location:{origin:'https://steamcommunity.com'}};vm.runInNewContext(source('steam-chat-main.js'),box);
 const handle=r=>box.TylerSteamChatAdapter.handle(g.body,r);
 const kick=extra=>({op:'kick',groupId:'12345',targetId:id(7),voters:[id(3),id(4),id(5)],ballotId:'kick-test-12345',expiresAt:clock+60000,...extra});
 function voice(memberNumbers=[2,3]){const node=new Element('chatRoomVoiceChannel ActiveVoiceChannel'),v={GetGroup:()=>group,GetVoiceAllowed:()=>true,self:members[1],voice_active_contains_self:true,get voice_active_member_list(){return {member_list:members.filter(m=>memberNumbers.includes(m.accountid))};}};node.__reactFiber$steam={memoizedProps:{className:node.className},stateNode:node,return:{memoizedProps:{chat:v}}};voices=[node];return v;}
 return {now:()=>clock,advance:ms=>{clock+=ms;stamp=clock;},g,group,chat,bans,members,msg,calls,handle,kick,voice,permission:v=>{permitted=v;},failure:v=>{fail=v;},stamp:v=>{stamp=v;},extraVoice:()=>{voices.push(new Element('chatRoomVoiceChannel ActiveVoiceChannel'));}};
}

test('Chrome group check reads scoped members, bot/owner protection and actual kick permission',async()=>{
 const f=fixture(),info=await f.handle({op:'group'});assert.equal(info.groupId,'12345');assert.equal(info.botId,id(2));assert.equal(info.ownerId,id(1));assert.equal(info.canKick,true);assert.equal(info.members.find(m=>m.id===id(7)).name,'Target');assert.equal(info.members.find(m=>m.id===id(2)).protected,true);
 assert.equal(info.senderId,id(5));assert.ok(info.messageAt>0);f.permission(false);assert.equal((await f.handle({op:'group'})).canKick,false);assert.equal(f.calls.length,0);
});

test('temporary kick needs explicit arming, current permission and three eligible distinct voters',async()=>{
 const f=fixture();await assert.rejects(f.handle(f.kick()),/not enabled/);await f.handle({op:'arm',enabled:true});
 await assert.rejects(f.handle(f.kick({voters:[id(3),id(3),id(4)]})),/Three different/);
 await assert.rejects(f.handle(f.kick({voters:[id(3),id(4),id(99)]})),/Three different/);
 await assert.rejects(f.handle(f.kick({targetId:id(1)})),/protected/);await assert.rejects(f.handle(f.kick({targetId:id(2)})),/protected/);
 f.permission(false);await assert.rejects(f.handle(f.kick()),/does not allow/);assert.equal(f.calls.length,0);
});

test('passed ballot performs one one-hour kick and repeated requests never repeat it',async()=>{
 const f=fixture();await f.handle({op:'arm',enabled:true});const request=f.kick(),before=Math.floor(f.now()/1000);
 const [a,b]=await Promise.all([f.handle(request),f.handle(request)]);assert.equal(a.kicked,true);assert.equal(b.kicked,true);assert.equal(f.calls.length,1);assert.equal(f.calls[0].n,7);assert.ok(f.calls[0].expiration>=before+3600&&f.calls[0].expiration<=before+3601);
 await f.handle({op:'disarm'});await assert.rejects(f.handle(f.kick({ballotId:'kick-another-123'})),/not enabled/);
});

test('wrong group, expired or unverifiable final vote and departed target cannot trigger a kick',async()=>{
 const f=fixture();await f.handle({op:'arm',enabled:true});await assert.rejects(f.handle(f.kick({groupId:'999'})),/not enabled/);
 await assert.rejects(f.handle(f.kick({expiresAt:f.now()-1})),/expired/);
 f.stamp(Date.now()-120000);await assert.rejects(f.handle(f.kick()),/final vote/);f.stamp(Date.now());
 f.msg.unAccountID=6;await assert.rejects(f.handle(f.kick()),/final vote/);f.msg.unAccountID=5;
 f.members.pop();await assert.rejects(f.handle(f.kick()),/does not allow/);assert.equal(f.calls.length,0);
});

test('failed native kicks are reported and never automatically retried for that ballot',async()=>{
 const f=fixture();await f.handle({op:'arm',enabled:true});f.failure(true);const request=f.kick();
 await assert.rejects(f.handle(request),/Steam rejected/);await assert.rejects(f.handle(request),/Steam rejected/);assert.equal(f.calls.length,1);
});

test('solo voice detection uses active channel membership and identifies the sole listener',async()=>{
 const f=fixture();f.permission(false);f.voice([2,3]);const solo=await f.handle({op:'voice'});assert.equal(solo.known,true);assert.equal(solo.otherCount,1);assert.equal(solo.soloId,id(3));
 f.voice([2,3,4]);const group=await f.handle({op:'voice'});assert.equal(group.otherCount,2);assert.equal(group.soloId,null);
 f.voice([2]);assert.equal((await f.handle({op:'voice'})).otherCount,0);
});

test('unknown, changing or different-group voice membership never produces a solo override',async()=>{
 const f=fixture();assert.equal((await f.handle({op:'voice'})).known,false);
 const v=f.voice();v.voice_active_contains_self=false;assert.equal((await f.handle({op:'voice'})).known,false);
 const other=f.voice();other.GetGroup=()=>({...f.group,GetGroupID:()=> '999'});assert.equal((await f.handle({op:'voice'})).known,false);
 f.voice();f.extraVoice();assert.equal((await f.handle({op:'voice'})).known,false);
});

test('different ballots cannot send overlapping native kicks, even if the first response is delayed',async()=>{
 const f=fixture();await f.handle({op:'arm',enabled:true});let release;const original=f.group.KickUser;
 f.group.KickUser=async(n,expiration)=>{f.calls.push({n,expiration});await new Promise(resolve=>{release=resolve;});};
 const first=f.handle(f.kick());await assert.rejects(f.handle(f.kick({ballotId:'kick-second-12345'})),/still being processed/);assert.equal(f.calls.length,1);
 release();await first;f.group.KickUser=original;await f.handle(f.kick({ballotId:'kick-second-12345'}));assert.equal(f.calls.length,2);
});

test('local ban/unban requires separate arming, protects owner/bot and executes at most once',async()=>{
 const f=fixture(),r={op:'ban',groupId:'12345',targetId:id(7),actionId:'admin-ban-12345'};
 await f.handle({op:'arm',enabled:true});await assert.rejects(f.handle(r),/Enable local/);await f.handle({op:'admin-arm',enabled:true});await f.handle({op:'group'});
 for(const n of [1,2])await assert.rejects(f.handle({...r,targetId:id(n)}),/protected/);
 await Promise.all([f.handle(r),f.handle(r)]);assert.equal(f.calls.length,1);assert.equal(f.bans.has(7),true);
 assert.equal((await f.handle({op:'bans'})).bans[0].name,'Target');await f.handle({...r,op:'unban',actionId:'admin-unban-12345'});assert.equal(f.bans.has(7),false);
 await assert.rejects(f.handle({...r,op:'unban',actionId:'admin-no-ban-12345'}),/not in/);
 f.permission(false);await assert.rejects(f.handle({...r,actionId:'admin-permission-123'}),/ban permission/);
});

test('selected message deletion verifies channel, timestamp/ordinal and sender; rejected result is never success',async()=>{
 const f=fixture();await f.handle({op:'admin-arm',enabled:true});const m=await f.handle({op:'inspect-message'}),r={...m,op:'delete-message',actionId:'admin-delete-12345'};
 assert.equal(m.preview,'A group message');for(const field of ['channelId','messageKey','targetId'])await assert.rejects(f.handle({...r,[field]:'changed'}),/selected message changed/);
 f.failure(true);await assert.rejects(f.handle(r),/rejected message deletion/);await assert.rejects(f.handle(r),/rejected message deletion/);assert.equal(f.calls.length,1);
 f.failure(false);await f.handle({...r,actionId:'admin-delete-new-123'});assert.equal(f.calls.length,2);assert.equal(f.calls[1].deleted[0].unOrdinal,1);
 f.msg.unOrdinal=undefined;await assert.rejects(f.handle({op:'inspect-message'}),/loaded Steam/);
});

test('text mute deletes only new messages from the selected account, stops on unmute and never sweeps history',async()=>{
 const f=fixture();await f.handle({op:'admin-arm',enabled:true});const request={op:'mute',groupId:'12345',targetId:id(5),actionId:'admin-mute-12345'},m=await f.handle(request);
 const remove=async actionId=>f.handle({...await f.handle({op:'inspect-message'}),op:'auto-delete',actionId});
 f.stamp(m.mutedAt-1000);await assert.rejects(remove('admin-history-12345'),/Earlier messages/);assert.equal(f.calls.length,0);
 f.stamp(m.mutedAt+1000);f.msg.unAccountID=4;await assert.rejects(remove('admin-other-user-123'),/outside the active/);assert.equal(f.calls.length,0);
 f.msg.unAccountID=5;await remove('admin-new-message-123');await remove('admin-new-message-123');assert.equal(f.calls.length,1);
 await f.handle({...request,op:'unmute',actionId:'admin-unmute-12345'});f.msg.unOrdinal=2;await assert.rejects(remove('admin-after-unmute-123'),/outside the active/);assert.equal(f.calls.length,1);
 await f.handle({...request,actionId:'admin-remute-12345'});await f.handle({op:'disarm-admin'});await assert.rejects(remove('admin-after-stop-12345'),/Enable local/);
});

test('admin deletion and kick cannot overlap; queued mute deletion cancels when unmuted',async()=>{
 const f=fixture();await f.handle({op:'admin-arm',enabled:true});await f.handle({op:'arm',enabled:true});const muted=await f.handle({op:'mute',groupId:'12345',targetId:id(5),actionId:'admin-mute-lock-123'});f.stamp(muted.mutedAt+1000);
 let release;f.chat.DeleteChatMessages=async messages=>{f.calls.push({deleted:messages});await new Promise(r=>{release=r;});return 1;};
 const selected=await f.handle({op:'inspect-message'}),first=f.handle({...selected,op:'delete-message',actionId:'admin-first-delete-123'});
 await assert.rejects(f.handle(f.kick()),/still being processed/);const next=f.handle({...selected,op:'auto-delete',actionId:'admin-queued-delete-123'});
 await f.handle({op:'unmute',groupId:'12345',targetId:id(5),actionId:'admin-unmute-lock-123'});release();await first;await assert.rejects(next,/outside the active/);assert.equal(f.calls.length,1);
});

test('vote mute requires separate opt-in and three eligible voters; repeat ballots never extend the five-minute deadline',async()=>{
 const f=fixture(),vote=f.kick({op:'vote-mute',ballotId:'mute-vote-native-123'});
 await assert.rejects(f.handle(vote),/Enable vote mute/);await f.handle({op:'admin-arm',enabled:true});await assert.rejects(f.handle(vote),/Enable vote mute/);await f.handle({op:'arm-mute',enabled:true});
 await assert.rejects(f.handle({...vote,voters:[id(3),id(3),id(4)]}),/Three different/);await assert.rejects(f.handle({...vote,targetId:id(1)}),/protected/);await assert.rejects(f.handle({...vote,targetId:id(2)}),/protected/);
 const r=await f.handle(vote);assert.equal(r.muted,true);assert.equal(r.muteUntil-r.mutedAt,300000);f.advance(5000);assert.equal((await f.handle(vote)).muteUntil,r.muteUntil);
 await assert.rejects(f.handle({...vote,ballotId:'mute-other-vote-123'}),/already text muted/);assert.equal(f.calls.length,0);
 await f.handle({op:'disarm-vote-mute'});assert.equal((await f.handle({op:'group'})).textMutes.length,0);
});

test('native timed mute stops exactly at five minutes even when no browser expiry timer runs',async()=>{
 const f=fixture();await f.handle({op:'admin-arm',enabled:true});await f.handle({op:'arm-mute',enabled:true});f.msg.unAccountID=6;const r=await f.handle(f.kick({op:'vote-mute',ballotId:'mute-expiry-native-123',targetId:id(5),voters:[id(3),id(4),id(6)]}));
 assert.equal(r.muted,true);f.msg.unAccountID=5;f.advance(299999);let message=await f.handle({op:'inspect-message'});await f.handle({...message,op:'auto-delete',actionId:'mute-before-expiry-123'});assert.equal(f.calls.length,1);
 f.advance(1);f.msg.unOrdinal++;message=await f.handle({op:'inspect-message'});await assert.rejects(f.handle({...message,op:'auto-delete',actionId:'mute-at-expiry-123'}),/outside the active/);assert.equal(f.calls.length,1);assert.equal((await f.handle({op:'group'})).textMutes.length,0);
});

test('a queued automatic deletion rechecks the timed mute after a delayed Steam action completes',async()=>{
 const f=fixture();await f.handle({op:'admin-arm',enabled:true});await f.handle({op:'arm-mute',enabled:true});await f.handle(f.kick({op:'vote-mute',ballotId:'mute-queue-native-123',targetId:id(7)}));f.advance(1000);f.msg.unAccountID=7;
 let release;f.chat.DeleteChatMessages=async messages=>{f.calls.push({deleted:messages});await new Promise(r=>{release=r;});return 1;};const m=await f.handle({op:'inspect-message'}),first=f.handle({...m,op:'delete-message',actionId:'mute-manual-pending-123'}),queued=f.handle({...m,op:'auto-delete',actionId:'mute-queued-expired-123'});f.advance(300000);f.stamp(Number(m.messageKey.split('_')[0])*1000);release();await first;await assert.rejects(queued,/outside the active/);assert.equal(f.calls.length,1);
});

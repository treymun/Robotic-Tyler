// Experimental adapter to the current Steam chat UI. Uses only scoped chat,
// member, permission and voice fields verified in Steam's installed interface.
(()=>{
 const chatMarks=new Map(),armed=new Set(),muteArmed=new Set(),adminArmed=new Set(),executions=new Map(),adminExecutions=new Map(),names=new Map(),mutes=new Map();let kickInFlight=null,adminInFlight=null,autoPending=0,autoChain=Promise.resolve();
 const activeMute=key=>{const m=mutes.get(key);if(m?.until&&Date.now()>=m.until){mutes.delete(key);return null;}return m;};
 const clearVotedMutes=()=>{for(const [key,m]of mutes)if(m.source==='vote')mutes.delete(key);};
 const own=(v,k)=>{if(!v||typeof v!=='object')return undefined;const d=Object.getOwnPropertyDescriptor(v,k);return d&&'value'in d?d.value:undefined;};
 const get=(v,k)=>{try{return v?.[k];}catch{return undefined;}};
 const call=(v,k,...args)=>{const fn=get(v,k);if(typeof fn!=='function')throw Error('Steam chat control unavailable: '+k);return fn.apply(v,args);};
 const account=v=>{const s=String(v??'');return /^\d{1,10}$/.test(s)&&BigInt(s)>0n&&BigInt(s)<=4294967295n?Number(s):null;};
 const steam=v=>{const n=account(v);return n===null?null:String(76561197960265728n+BigInt(n));};
 const fromSteam=v=>{if(!/^7656119\d{10}$/.test(String(v||'')))return null;const n=BigInt(v)-76561197960265728n;return n>0n&&n<=4294967295n?Number(n):null;};
 const clean=(s,n=80)=>String(s||'').replace(/[\u0000-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069]/g,' ').replace(/\s+/g,' ').trim().slice(0,n);
 const history=n=>n?.getAttribute?.('role')==='log'||/ChatHistory|chatHistory|chat_history/.test(n?.className||'');
 function* propsAt(node){
  const base=node.closest?.('.msgText')||node,scope=base.closest?.('.msg,.ChatSpeaker,.chatRoomVoiceChannel');
  for(let row=base,level=0;row&&level<12&&!history(row);row=row.parentElement,level++){
   for(const field of Object.getOwnPropertyNames(row).filter(k=>/^__react(?:Props|Fiber|InternalInstance)\$/.test(k)).slice(0,4)){
    const data=own(row,field);if(field.startsWith('__reactProps$')){yield data;continue;}
    const seen=new Set();for(let f=data,depth=0;f&&depth<24&&!seen.has(f);f=own(f,'return'),depth++){
     seen.add(f);const host=own(f,'stateNode');if(host?.nodeType===1&&(history(host)||scope&&host!==scope&&!scope.contains(host)&&host.contains?.(scope)))break;
     yield own(f,'memoizedProps');
    }
   }
  }
 }
 function context(node,voice=false){
  for(const p of propsAt(node)){
   let chat=null;
   if(own(p,'msg'))chat=get(get(p,'chatView'),'chat')||own(p,'chat');
   const c=own(p,'context');if(!chat&&own(c,'unAccountIDSender')!==undefined)chat=own(c,'chat');
   if(voice&&!chat)chat=own(p,'chat');
   if(!chat||typeof get(chat,'GetGroup')!=='function')continue;
   if(voice&&call(chat,'GetVoiceAllowed')!==true)continue;
   const group=call(chat,'GetGroup'),id=String(call(group,'GetGroupID'));
   if(!/^\d{1,20}$/.test(id))continue;const self=account(get(get(chat,'self'),'accountid'));if(self===null)continue;
   const record=own(p,'msg')||c,stamp=Number(get(record,'rtTimestamp')),ordinal=Number(get(record,'unOrdinal')||0),sender=steam(get(record,'unAccountID')??get(record,'unAccountIDSender'));
   return {chat,group,id,self,senderId:sender,record,ordinal,messageAt:Number.isFinite(stamp)&&stamp>0?stamp*1000:null,messageKey:Number.isFinite(stamp)&&stamp>0?stamp+'_'+ordinal:null};
  }
  throw Error('Steam group context unavailable. Reconnect this group chat and try again.');
 }
 function member(ctx,friend){
  const n=account(get(friend,'accountid'));if(n===null)throw Error('A Steam member account could not be read.');
  const names=[get(friend,'primary_display_name'),get(friend,'display_name'),get(friend,'secondary_display_name')].map(s=>clean(s)).filter(Boolean);
  return {id:steam(n),name:names[0]||'Steam member',aliases:[...new Set(names)],protected:n===ctx.self||call(ctx.group,'BIsAccountIDOwner',n)===true,canKick:call(ctx.group,'BCanKickMember',n)===true,canBan:typeof get(ctx.group,'BCanBanMember')==='function'&&call(ctx.group,'BCanBanMember',n)===true,canDelete:typeof get(ctx.group,'BCanDeleteMemberMessages')==='function'&&call(ctx.group,'BCanDeleteMemberMessages',n)===true};
 }
 function groupInfo(ctx){
  const list=get(get(ctx.group,'memberList'),'member_list');if(!Array.isArray(list)||list.length>256)throw Error('Open the group member list before checking moderation. Large virtualized groups are not supported.');
  const members=list.map(f=>member(ctx,f));if(!members.some(m=>m.id===steam(ctx.self)))throw Error('Steam has not loaded the bot’s group membership yet.');for(const m of members)names.set(ctx.id+':'+m.id,m.name);while(names.size>500)names.delete(names.keys().next().value);
  const textMutes=[];for(const key of mutes.keys()){const m=activeMute(key);if(m&&key.startsWith(ctx.id+':'))textMutes.push({id:key.slice(ctx.id.length+1),until:m.until||null});}
  return {groupId:ctx.id,botId:steam(ctx.self),ownerId:steam(call(ctx.group,'GetOwnerAccountID')),canKick:call(ctx.group,'BCanKick')===true,canBan:typeof get(ctx.group,'BCanBan')==='function'&&call(ctx.group,'BCanBan')===true,members,textMutes,messageAt:ctx.messageAt,messageKey:ctx.messageKey,senderId:ctx.senderId};
 }
 async function bans(ctx){
  if(typeof get(ctx.group,'BCanBan')!=='function'||!call(ctx.group,'BCanBan'))throw Error('The bot needs Steam ban permission.');
  const result=await call(ctx.group,'GetBanList');if(result?.loadingState!=='loaded'||!Array.isArray(result.rgBans))throw Error('Steam ban list could not be loaded.');
  return result.rgBans.slice(0,256).map(b=>{const n=account(call(b,'accountid')),id=steam(n);if(!id)return null;let name=names.get(ctx.id+':'+id);const store=get(ctx.chat,'m_FriendStore');if(!name&&typeof get(store,'GetPlayer')==='function'){const f=call(store,'GetPlayer',n);name=clean(get(f,'primary_display_name')||get(f,'display_name'));}return {id,name:name||'Steam account '+id};}).filter(Boolean);
 }
 function inspect(ctx,node){
  if(!ctx.senderId||!ctx.messageAt||!Number.isInteger(get(ctx.record,'unOrdinal'))||!Number.isInteger(ctx.ordinal)||ctx.ordinal<0)throw Error('Choose a loaded Steam group message.');
  return {groupId:ctx.id,channelId:String(call(ctx.chat,'GetRoomID')),messageKey:ctx.messageKey,targetId:ctx.senderId,preview:clean(get(ctx.record,'strMessage')||node.innerText||node.textContent,300),canDelete:call(ctx.group,'BCanDeleteMemberMessages',fromSteam(ctx.senderId))===true};
 }
 async function admin(ctx,node,r){
  if(!adminArmed.has(ctx.id)||r.groupId!==ctx.id)throw Error('Enable local Steam admin controls for this group first.');
  if(!/^[a-z0-9-]{8,100}$/i.test(r.actionId||''))throw Error('Invalid admin action.');
  if(adminExecutions.has(r.actionId))return adminExecutions.get(r.actionId);
  if(!['mute','unmute'].includes(r.op)&&(kickInFlight!==null||adminInFlight!==null))throw Error('Another Steam moderation action is still running.');
  const target=fromSteam(r.targetId);let targetName=names.get(ctx.id+':'+r.targetId)||'Steam member';
  if(r.op==='mute'||r.op==='unmute'){
   if(target===null||target===ctx.self||call(ctx.group,'BIsAccountIDOwner',target))throw Error('The bot and group owner are protected.');
   if(!call(ctx.group,'BCanDeleteMemberMessages',target))throw Error('Steam message deletion permission is required for a text mute.');
   if(r.op==='mute'&&!call(ctx.group,'BHasMember',target))throw Error('That person is no longer in this group.');
   const key=ctx.id+':'+r.targetId;if(r.op==='mute'){if(!activeMute(key))mutes.set(key,{at:Date.now(),source:'local'});}else mutes.delete(key);
   const result={applied:true,kind:r.op,groupId:ctx.id,targetId:r.targetId,targetName,mutedAt:mutes.get(key)?.at||null,muteUntil:mutes.get(key)?.until||null};adminExecutions.set(r.actionId,Promise.resolve(result));while(adminExecutions.size>50)adminExecutions.delete(adminExecutions.keys().next().value);return result;
  }else if(r.op==='ban'||r.op==='unban'){
   if(target===null||target===ctx.self||call(ctx.group,'BIsAccountIDOwner',target))throw Error('The bot and group owner are protected.');
   if(!call(ctx.group,'BCanBan'))throw Error('The bot needs Steam ban permission.');
   if(r.op==='ban'&&(!call(ctx.group,'BCanBanMember',target)||!call(ctx.group,'BHasMember',target)))throw Error('Steam does not allow this ban.');
   if(r.op==='unban'){const found=(await bans(ctx)).find(b=>b.id===r.targetId);if(!found)throw Error('That member is not in the current Steam ban list.');targetName=found.name;}
  }else if(r.op==='delete-message'){
   const selected=inspect(ctx,node);if(!selected.canDelete)throw Error('Steam does not allow the bot to delete that message.');
   if(r.channelId!==selected.channelId||r.messageKey!==selected.messageKey||r.targetId!==selected.targetId)throw Error('The selected message changed. Choose it again before deleting.');
   if(r.automatic===true){const muted=activeMute(ctx.id+':'+r.targetId);if(!muted||ctx.messageAt<muted.at||ctx.messageAt>Date.now()+5000||Date.now()-ctx.messageAt>20000)throw Error('Message is outside the active text mute. Earlier messages are never deleted.');}
  }else throw Error('Unknown local admin action.');
  if(kickInFlight!==null||adminInFlight!==null)throw Error('Another Steam moderation action is still running.');
  adminInFlight=r.actionId;const execute=(async()=>{try{
   if(r.op==='delete-message'){const result=await call(ctx.chat,'DeleteChatMessages',[{rtTimestamp:ctx.messageAt/1000,unOrdinal:ctx.ordinal}]);if(result!==1)throw Error('Steam rejected message deletion (result '+String(result)+').');}
   else await call(ctx.group,'SetUserBanState',target,r.op==='ban');
   return {applied:true,kind:r.op,groupId:ctx.id,targetId:r.targetId,targetName,messageKey:r.messageKey||null};
  }finally{if(adminInFlight===r.actionId)adminInFlight=null;}})();adminExecutions.set(r.actionId,execute);while(adminExecutions.size>50)adminExecutions.delete(adminExecutions.keys().next().value);return execute;
 }
 function voiceInfo(ctx){
  const channels=[...document.querySelectorAll('.chatRoomVoiceChannel.ActiveVoiceChannel')].filter(n=>n.isConnected&&n.getClientRects?.().length);
  if(channels.length!==1)return {known:false,reason:'Active voice channel is not visible.'};
  const active=context(channels[0],true);if(active.id!==ctx.id||active.self!==ctx.self)return {known:false,reason:'Voice and text chat are in different groups.'};
  if(get(active.chat,'voice_active_contains_self')!==true)return {known:false,reason:'Bot voice membership is still updating.'};
  const list=get(get(active.chat,'voice_active_member_list'),'member_list');if(!Array.isArray(list)||list.length>256)return {known:false};
  const ids=list.map(f=>steam(get(f,'accountid')));if(ids.some(id=>!id)||!ids.includes(steam(ctx.self)))return {known:false};
  const others=[...new Set(ids)].filter(id=>id!==steam(ctx.self));return {known:true,groupId:ctx.id,otherCount:others.length,soloId:others.length===1?others[0]:null};
 }
 // v2.32: the connected group's voice channels and Steam's own call state, to join and leave them the
 // way Steam's controls do: clicking a voice channel calls the room's StartVoiceChat (its onSelect), and
 // Steam's "Leave voice chat" button is .chatEndVoiceChat. Steam's call state reaches 9 only once its
 // WebRTC session and the voice chat are both connected.
 function voiceCall(ctx){
  const cs=get(get(get(ctx.chat,'ChatStore'),'VoiceChat'),'m_VoiceCallState'),e=Number(get(cs,'m_eState')),at=get(cs,'m_chatRoom');
  let rooms=[];try{rooms=[...(get(ctx.group,'voiceRoomList')||[])].slice(0,40);}catch{}
  const list=rooms.map(room=>{let self=false,count=0,active=false,id='';
   try{id=String(call(room,'GetRoomID'));self=get(room,'voice_active_contains_self')===true;const m=get(get(room,'voice_active_member_list'),'member_list');count=Array.isArray(m)?Math.min(m.length,256):0;active=call(room,'BVoiceActive')===true;}catch{}
   return {id,name:clean(get(room,'name'),60)||'Voice',self,count,active,room};}).filter(r=>/^\d{1,20}$/.test(r.id));
  const state=Number.isFinite(e)?e:null,here=list.find(r=>r.active)||null;
  return {groupId:ctx.id,state,activeRoom:here?.id||null,elsewhere:state!==null&&state>0&&!here&&!(at&&String(get(at,'groupID')??'')===ctx.id),rooms:list};
 }
 const voicePublic=v=>({...v,rooms:v.rooms.map(({room,...r})=>r)});
 // The last lines of Steam's own voice log (VoiceChat.GetVoiceLogs, what Steam's voice settings show),
 // to see where a call stopped: Steam's tagged lines only (not the call descriptions it also logs),
 // with addresses, ports and long ids hidden.
 function voiceLog(ctx){
  try{const vc=get(get(ctx.chat,'ChatStore'),'VoiceChat');const text=String(call(vc,'GetVoiceLogs')||'');
   const lines=text.split(/\r?\n/).filter(l=>/^\((?:VoiceChat|WebRTC)\)/.test(l)&&!/Description\)|SDP/i.test(l));
   // v2.32.3: "Still trying to connect…" repeats every two seconds; only the latest one is kept, so the
   // steps before it stay in view.
   let lastTry=-1;lines.forEach((l,i)=>{if(/Still trying/i.test(l))lastTry=i;});
   return lines.filter((l,i)=>i===lastTry||!/Still trying/i.test(l)).slice(-14).map(line=>clean(line.replace(/\b\d{1,3}(?:\.\d{1,3}){3}(?::\d+)?\b/g,'[address]').replace(/\b[0-9a-f]{0,4}(?::[0-9a-f]{0,4}){2,7}\b/gi,'[address]').replace(/\b\d{9,}\b/g,'[id]').replace(/(ufrag|pwd|fingerprint|candidate)\S*/gi,'$1 [hidden]'),200));}
  catch{return [];}
 }
 async function handle(node,request){
  if(request.op==='disarm'){armed.clear();muteArmed.clear();adminArmed.clear();mutes.clear();return {};}
  if(request.op==='disarm-moderation'){armed.clear();return {};}
  if(request.op==='disarm-vote-mute'){muteArmed.clear();clearVotedMutes();return {};}
  if(request.op==='disarm-admin'){adminArmed.clear();mutes.clear();return {};}
  const ctx=context(node);
  if(request.op==='group')return groupInfo(ctx);
  if(request.op==='voice')return voiceInfo(ctx);
  if(request.op==='voice-state'){const v=voicePublic(voiceCall(ctx));if(request.logs===true)v.log=voiceLog(ctx);return v;}
  if(request.op==='voice-join'){
   const v=voiceCall(ctx);if(!v.rooms.length)throw Error('This Steam group has no voice channel.');
   const here=v.rooms.find(r=>r.active);if(here)return {...voicePublic(v),started:false,roomId:here.id};
   if(v.elsewhere)throw Error('The bot is already in another Steam voice call. Leave that call first.');
   const room=v.rooms.find(r=>r.id===String(request.roomId||''))||(v.rooms.length===1?v.rooms[0]:null);
   if(!room)return {...voicePublic(v),started:false,choose:true};
   call(room.room,'StartVoiceChat');return {...voicePublic(voiceCall(ctx)),started:true,roomId:room.id};
  }
  if(request.op==='voice-leave'){
   const v=voiceCall(ctx),here=v.rooms.find(r=>r.active);if(!here)return {...voicePublic(v),left:false};
   // Steam's own Leave button when it's on screen; otherwise the room's toggle, which Steam's other leave controls use.
   const button=[...document.querySelectorAll('.chatEndVoiceChat')].find(b=>b.isConnected&&b.getClientRects?.().length);
   if(button)button.click();else call(here.room,'ToggleVoiceChat');
   return {...voicePublic(voiceCall(ctx)),left:true,via:button?'button':'room'};
  }
  // v2.24: which Steam channel a message reader belongs to. Steam keeps one chat object per channel
  // while it redraws the view, so "the same object" means "the same channel", without reading names.
  if(request.op==='chat-mark'){const key=String(request.key||'');if(!/^[\w-]{1,32}$/.test(key))throw Error('Invalid chat mark.');chatMarks.set(key,new WeakRef(ctx.chat));return {groupId:ctx.id};}
  if(request.op==='chat-same'){const ref=chatMarks.get(String(request.key||''))?.deref();return {same:!!ref&&ref===ctx.chat,known:!!ref,groupId:ctx.id};}
  if(request.op==='bans')return {groupId:ctx.id,bans:await bans(ctx)};
  if(request.op==='inspect-message')return inspect(ctx,node.closest?.('.msgText')||node);
  if(request.op==='arm-mute'){if(request.enabled===true){if(!groupInfo(ctx).members.some(m=>!m.protected&&m.canDelete))throw Error('Give the bot Steam message deletion permission first.');muteArmed.add(ctx.id);}else{muteArmed.delete(ctx.id);clearVotedMutes();}return {armed:muteArmed.has(ctx.id),groupId:ctx.id};}
  if(request.op==='admin-arm'){if(request.enabled===true){const info=groupInfo(ctx);if(!info.canKick&&!info.canBan)throw Error('The bot needs Steam moderation permissions first.');adminArmed.add(ctx.id);}else{adminArmed.delete(ctx.id);for(const key of mutes.keys())if(key.startsWith(ctx.id+':'))mutes.delete(key);}return {armed:adminArmed.has(ctx.id),groupId:ctx.id};}
  if(request.op==='auto-delete'){
   if(autoPending>=30)throw Error('Text mute deletion queue is full.');autoPending++;
   const task=autoChain.catch(()=>{}).then(async()=>{const pending=kickInFlight?executions.get(kickInFlight):adminInFlight?adminExecutions.get(adminInFlight):null;if(pending)await pending.catch(()=>{});if(!node.isConnected)throw Error('Message is no longer loaded.');return admin(context(node),node,{...request,op:'delete-message',automatic:true});}).finally(()=>autoPending--);autoChain=task;return task;
  }
  if(['ban','unban','delete-message','mute','unmute'].includes(request.op))return admin(ctx,node,request);
  if(request.op==='arm'){if(request.enabled===true){if(!groupInfo(ctx).canKick)throw Error('Give the bot a Steam chat role with kick permission first.');armed.add(ctx.id);}else armed.delete(ctx.id);return {armed:armed.has(ctx.id),groupId:ctx.id};}
  if(!['kick','vote-mute'].includes(request.op))throw Error('Unknown Steam chat action.');
  const muteVote=request.op==='vote-mute';
  if((muteVote?(!muteArmed.has(ctx.id)||!adminArmed.has(ctx.id)):!armed.has(ctx.id))||ctx.id!==request.groupId)throw Error(muteVote?'Enable vote mute and local admin controls for this group.':'Vote-kick is not enabled for this group.');
  if(!/^[a-z0-9-]{8,100}$/i.test(request.ballotId||''))throw Error('Invalid kick ballot.');
  if(executions.has(request.ballotId))return executions.get(request.ballotId);
  if(kickInFlight!==null||adminInFlight!==null)throw Error('Another kick or admin action is still being processed. Wait for it to finish.');
  const target=fromSteam(request.targetId),voters=[...new Set(Array.isArray(request.voters)?request.voters:[])];
  if(target===null||target===ctx.self||call(ctx.group,'BIsAccountIDOwner',target))throw Error('The bot and group owner are protected.');
  if((muteVote?!call(ctx.group,'BCanDeleteMemberMessages',target):!call(ctx.group,'BCanKick')||!call(ctx.group,'BCanKickMember',target))||!call(ctx.group,'BHasMember',target))throw Error('Steam does not allow this bot to '+(muteVote?'text mute':'kick')+' that member.');
  if(voters.length<3||voters.length>256||voters.some(id=>{const n=fromSteam(id);return n===null||n===target||n===ctx.self||!call(ctx.group,'BHasMember',n);}))throw Error('Three different eligible group voters are required.');
  if(!Number.isFinite(request.expiresAt)||Date.now()>request.expiresAt||request.expiresAt-Date.now()>65000)throw Error('Kick vote expired.');
  if(!voters.includes(ctx.senderId)||!Number.isFinite(ctx.messageAt)||ctx.messageAt<request.expiresAt-61000||ctx.messageAt>Date.now()+5000)throw Error('The final vote message could not be verified.');
  if(muteVote){const key=ctx.id+':'+request.targetId;if(activeMute(key))throw Error('That member is already text muted. The mute was not extended.');const at=Date.now(),until=at+300000;mutes.set(key,{at,until,source:'vote'});const result={muted:true,groupId:ctx.id,targetId:request.targetId,mutedAt:at,muteUntil:until,seconds:300};executions.set(request.ballotId,Promise.resolve(result));while(executions.size>50)executions.delete(executions.keys().next().value);return result;}
  kickInFlight=request.ballotId;
  const execute=(async()=>{try{await call(ctx.group,'KickUser',target,Math.floor(Date.now()/1000)+3600);return {kicked:true,groupId:ctx.id,targetId:request.targetId,seconds:3600};}finally{if(kickInFlight===request.ballotId)kickInFlight=null;}})();
  executions.set(request.ballotId,execute);while(executions.size>50)executions.delete(executions.keys().next().value);return execute;
 }
 globalThis.TylerSteamChatAdapter={handle};
 document.addEventListener('tyler-steam-chat-request',event=>{
  const node=event.target;if(!node||node.nodeType!==1||!node.isConnected)return;let request;
  try{const raw=node.getAttribute('data-tyler-chat-request');if(!raw||raw.length>12000)return;request=JSON.parse(raw);if(!/^[a-z0-9-]{8,100}$/i.test(request.id||''))return;}catch{return;}
  void handle(node,request).then(data=>window.postMessage({source:'tyler-steam-chat-reply',id:request.id,ok:true,...data},location.origin)).catch(e=>window.postMessage({source:'tyler-steam-chat-reply',id:request.id,ok:false,error:String(e.message||e).slice(0,240)},location.origin));
 });
 // v2.6: message metadata straight from Steam's record (msg.unAccountID / rtTimestamp / unOrdinal),
 // read synchronously when the isolated world dispatches 'tyler-read-message-meta' on a message.
 // Stamps are cleared first so a reused DOM node never keeps an earlier message's data.
 const META=['data-tyler-msg-sender','data-tyler-msg-at','data-tyler-msg-key','data-tyler-msg-self','data-tyler-msg-group'];
 document.addEventListener('tyler-read-message-meta',event=>{
  const node=event.target;if(!node||node.nodeType!==1||!node.isConnected||!node.setAttribute)return;
  for(const name of META)node.removeAttribute(name);
  try{
   const c=context(node);
   if(c.senderId)node.setAttribute('data-tyler-msg-sender',c.senderId);
   if(c.messageAt)node.setAttribute('data-tyler-msg-at',String(c.messageAt));
   if(c.messageKey)node.setAttribute('data-tyler-msg-key',c.id+':'+c.messageKey);
   if(c.senderId)node.setAttribute('data-tyler-msg-self',c.senderId===steam(c.self)?'1':'0');
   node.setAttribute('data-tyler-msg-group',c.id);
  }catch{}
 });
})();

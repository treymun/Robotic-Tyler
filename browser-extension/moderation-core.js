(()=>{
 const valid=id=>/^7656119\d{10}$/.test(String(id||''));
 const clean=s=>String(s||'').replace(/[\u0000-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069]/g,' ').replace(/\s+/g,' ').trim().slice(0,80);
 function parse(text){const s=String(text||'').trim();if(!s||s.length>180||/^\[ROBOTIC TYLER\]/i.test(s))return null;if(/^!modhelp$/i.test(s))return {action:'help'};const c=/^!(kick|votekick|mute|votemute)(?:\s+(yes|no|status|cancel|help))?$/i.exec(s);if(c)return {action:(c[2]||'help').toLowerCase(),...(c[1].toLowerCase().includes('mute')?{kind:'mute'}:{})};const m=/^!(votekick|votemute)\s+(.{1,80})$/i.exec(s);return m?{action:'start',target:clean(m[2]).replace(/^@/,''),...(m[1].toLowerCase()==='votemute'?{kind:'mute'}:{})}:null;}
 function create(){
  let poll=null,serial=0;
  const snapshot=()=>poll?{...poll,yes:[...poll.yes],no:[...poll.no],eligible:[...poll.eligible]}:null;
  const expire=now=>{if(poll&&['open','passed'].includes(poll.state)&&now>=poll.expiresAt)poll.state='expired';return snapshot();};
  return {
   get current(){return snapshot();},tick:expire,
   start(ctx,target,initiator,now=Date.now(),kind='kick'){
    if(!['kick','mute'].includes(kind))throw Error('Unknown moderation vote.');
    expire(now);if(poll&&['open','passed','executing'].includes(poll.state))throw Error('A moderation vote is already active.');
    if(kind==='kick'?!ctx?.canKick:!ctx?.members?.some(m=>!m.protected&&m.canDelete))throw Error('The bot needs Steam '+(kind==='mute'?'message deletion':'kick')+' permission before a vote can start.');
    const selected=(ctx.members||[]).find(m=>m.id===target),matches=selected?[selected]:(ctx.members||[]).filter(m=>[m.name,...(m.aliases||[])].some(n=>clean(n).toLowerCase()===clean(target).toLowerCase()));
    if(matches.length!==1)throw Error(matches.length?'That name is ambiguous. Choose the exact member in the Moderation panel.':'Member not found. Use their current Steam name or choose them in the Moderation panel.');
    const member=matches[0];if(!valid(member.id)||member.protected||member.id===ctx.botId||member.id===ctx.ownerId)throw Error('The bot and group owner are protected.');
    if(kind==='kick'?!member.canKick:!member.canDelete)throw Error('Steam does not allow the bot to '+(kind==='mute'?'text mute':'kick')+' that member.');
    if(kind==='mute'&&ctx.textMutes?.some(m=>m.id===member.id))throw Error('That member is already text muted. Existing mutes cannot be extended by another vote.');
    const eligible=new Set((ctx.members||[]).map(m=>m.id).filter(id=>valid(id)&&id!==ctx.botId&&id!==member.id));
    if(eligible.size<3)throw Error('This vote needs at least three eligible group members besides the target and bot.');
    if(initiator&&!eligible.has(initiator.id))throw Error('Only an eligible group member can call this kick vote.');
    poll={id:kind+'-'+now.toString(36)+'-'+(++serial)+'-'+Math.random().toString(36).slice(2,10),kind,groupId:ctx.groupId,targetId:member.id,targetName:clean(member.name),initiator:initiator?.id||ctx.botId,startedAt:now,expiresAt:now+60000,state:'open',yes:new Set(initiator?[initiator.id]:[]),no:new Set(),eligible};
    return snapshot();
   },
   vote(ctx,who,yes,now=Date.now(),kind=null){
    expire(now);if(!poll||poll.state!=='open')throw Error('No open moderation vote.');
    if(kind&&kind!==poll.kind)throw Error('Use !'+poll.kind+' yes/no for the active vote.');
    if(ctx.groupId!==poll.groupId)throw Error('This vote belongs to a different group.');
    if(!who||!valid(who.id)||!poll.eligible.has(who.id)||!ctx.members?.some(m=>m.id===who.id))throw Error('Only eligible identified members of this group can vote.');
    if(poll.yes.has(who.id)||poll.no.has(who.id))return {duplicate:true,poll:snapshot()};
    (yes?poll.yes:poll.no).add(who.id);if(poll.yes.size>=3)poll.state='passed';else if(poll.no.size>=3)poll.state='rejected';return {duplicate:false,poll:snapshot()};
   },
   claim(now=Date.now()){
    expire(now);if(!poll||poll.state!=='passed')return null;
    poll.state='executing';return {ballotId:poll.id,kind:poll.kind,groupId:poll.groupId,targetId:poll.targetId,voters:[...poll.yes],expiresAt:poll.expiresAt};
   },
   finish(id,ok,detail=''){if(poll?.id!==id||poll.state!=='executing')return;poll.state=ok?(poll.kind==='mute'?'muted':'kicked'):'failed';poll.detail=clean(detail);},
   cancel(who,ownerId,local=false){if(!poll||!['open','passed'].includes(poll.state))return false;if(!local&&who?.id!==poll.initiator&&who?.id!==ownerId)throw Error('Only the vote caller or group owner can cancel.');poll.state='cancelled';return true;},
   abandon(){if(poll&&['open','passed'].includes(poll.state))poll.state='cancelled';}
  };
 }
 function card(p,now=Date.now()){if(!p)return '🛡 No moderation vote running. Use !votekick NAME or !votemute NAME.';const mute=p.kind==='mute';return [mute?'🔇 VOTE TO TEXT MUTE':'🗳 VOTE TO KICK','Target: '+p.targetName,p.yes.length+'/3 yes · '+p.no.length+' no · '+p.state,mute?'Five-minute text mute · new messages only':'One-hour group-chat kick',p.state==='open'?'Vote closes in '+Math.max(0,Math.ceil((p.expiresAt-now)/1000))+'s · !'+(mute?'mute':'kick')+' yes / no / status':''].filter(Boolean).join('\n');}
 globalThis.TylerModeration={parse,create,card};
})();

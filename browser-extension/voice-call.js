// Steam voice call: Join and Leave for the connected group (v2.32). Isolated world.
//
// Steam's own controls do the work (steam-chat-main.js): joining calls the voice channel's
// StartVoiceChat, which is what clicking the channel does; leaving presses Steam's "Leave voice chat"
// button. The state shown here is only what Steam shows: "connected" once Steam's call state says its
// WebRTC session and voice chat are both up (state 9) and Steam lists the bot in the channel. A command
// that Steam accepted is "joining" or "leaving" until then, and "failed" if Steam doesn't get there.
//
// States: unavailable (no connected group chat / not this tab), disconnected, joining, connected,
// leaving, failed. Leaving the call is not muting, pausing the AI or stopping audio.
(() => {
 'use strict';
 const api=globalThis.TylerCompanion;if(!api||globalThis.TylerVoiceCall)return;
 const JOIN_MS=25000,LEAVE_MS=12000,FAST=1000,SLOW=3000;
 const clean=(s,n)=>String(s??'').replace(/[\u0000-\u001f\u007f-\u009f]/g,' ').replace(/\s+/g,' ').trim().slice(0,n);
 let S={state:'unavailable',room:'',roomId:'',groupId:'',people:0,error:'',reason:'Connect Tyler to the group chat first.',rooms:[],steam:null,since:Date.now()};
 let pending=null,timer=0,polling=false,remembered={},last=null;
 const listeners=new Set();
 void globalThis.TylerStorage?.get?.(['voiceRooms']).then(v=>{remembered=v?.voiceRooms&&typeof v.voiceRooms==='object'?v.voiceRooms:{};}).catch(()=>{});
 function anchor(){const r=api.getRegion?.(),n=api.getSample?.();return r?.isConnected&&n?.isConnected&&r.contains(n)?n:null;}
 function set(next){
  const before=S.state+'|'+S.room+'|'+S.error+'|'+S.people;S={...S,...next};if(S.state+'|'+S.room+'|'+S.error+'|'+S.people===before)return;
  if(next.state&&next.state!==before.split('|')[0])S.since=Date.now();
  const pub=state();for(const fn of listeners){try{fn(pub);}catch{}}api.emit?.('voice-call',pub);render();
 }
 /** What the panel, the phone and the full check show. */
 function state(){return {state:S.state,room:S.room,roomId:S.roomId,groupId:S.groupId,people:S.people,error:S.error,reason:S.reason,since:S.since,pending:!!pending,rooms:S.rooms.map(r=>({id:r.id,name:r.name,count:r.count})),steamState:S.steam};}
 // One look at Steam: the group's voice channels, which one Steam's call is in, and its state.
 async function observe(logs=false){
  const node=anchor();
  if(!node){set({state:pending?S.state:'unavailable',reason:'Connect Tyler to the group chat first.',room:'',people:0});return null;}
  if(api.isOwner?.()===false){set({state:'unavailable',reason:'Another tab runs the bot. Use this tab instead first.',room:'',people:0});return null;}
  let v;try{v=await globalThis.TylerSteamChat.request(node,'voice-state',{logs});}
  catch(e){if(!pending)set({state:'unavailable',reason:clean(e.message,160)||'Steam chat controls did not answer.'});return null;}
  last=v;const here=v.rooms.find(r=>r.id===v.activeRoom)||null;
  const connected=!!here&&here.self&&(v.state===null||v.state===9),connecting=!!here&&!connected;
  if(connected&&v.groupId&&remembered[v.groupId]!==here.id){remembered={...remembered,[v.groupId]:here.id};void globalThis.TylerStorage?.set?.({voiceRooms:remembered}).catch(()=>{});}
  const base={groupId:v.groupId,rooms:v.rooms,steam:v.state,room:here?.name||'',roomId:here?.id||'',people:here?Math.max(0,here.count-(here.self?1:0)):0,reason:''};
  if(pending?.kind==='join'){
   if(connected){finish();set({...base,state:'connected',error:''});}
   else if(v.elsewhere){finish();set({...base,state:'failed',error:'The bot is in another Steam voice call.'});}
   else if(pending.seen&&!here){finish();set({...base,state:'failed',error:'Steam ended the call before it connected.'+hint(v)});}
   else{if(here)pending.seen=true;set({...base,state:'joining'});}
   return v;}
  if(pending?.kind==='leave'){
   if(!here){finish();set({...base,state:'disconnected',error:''});}else set({...base,state:'leaving'});
   return v;}
  // Nobody pressed anything here: follow Steam (someone joined or left in Steam itself). A failure
  // stays on screen until Steam's state changes.
  const now=connected?'connected':connecting?'joining':'disconnected';
  // A failure stays on screen (with Leave to cancel a call Steam is still stuck connecting) until Steam
  // connects, or for two minutes once Steam is out of the call.
  if(S.state==='failed'&&now!=='connected'&&!(now==='disconnected'&&Date.now()-S.since>120000)){set({...base,state:'failed'});return v;}
  set({...base,state:now,error:''});return v;
 }
 // Where Steam's own log says it stopped, when it says anything useful.
 function hint(v){const lines=(v?.log||[]).filter(l=>/fail|error|denied|timeout|timed out|closed/i.test(l));return lines.length?' Steam: '+clean(lines.at(-1),140):'';}
 function finish(){clearTimeout(pending?.timeout);pending=null;schedule();}
 function schedule(){clearTimeout(timer);timer=setTimeout(tick,pending?FAST:SLOW);}
 async function tick(){if(polling){schedule();return;}polling=true;try{await observe();}finally{polling=false;schedule();}}
 async function join(roomId){
  if(pending)throw Error(pending.kind==='join'?'Tyler is already joining the call.':'Tyler is leaving the call. Wait for it to finish.');
  const node=anchor();if(!node)throw Error('Connect Tyler to the group chat first (Connect & start or Soundboard only).');
  if(api.isOwner?.()===false)throw Error('Another tab runs the bot. Use this tab instead first.');
  const v=await observe();if(!v)throw Error(S.reason||'Steam chat controls did not answer.');
  if(S.state==='connected')return state();
  if(!v.rooms.length)throw Error('This Steam group has no voice channel.');
  // Tyler's own microphone has to be in place before Steam asks for one, or Steam would open the real one.
  if(api.getVoiceState?.()?.enabled!==true){try{await api.prepareBridge?.();}catch(e){throw Error('Tyler\'s microphone is not ready, so the call was not joined: '+clean(e.message,160));}}
  const pick=String(roomId||'')||remembered[v.groupId]||'';
  pending={kind:'join',seen:false,timeout:setTimeout(()=>{if(pending?.kind!=='join')return;pending=null;void observe(true).then(x=>set({state:S.state==='connected'?'connected':'failed',error:S.state==='connected'?'':'Steam did not finish connecting the call within '+JOIN_MS/1000+' s.'+hint(x)}));schedule();},JOIN_MS)};
  set({state:'joining',error:''});
  try{
   const r=await globalThis.TylerSteamChat.request(node,'voice-join',{roomId:pick});
   if(r.choose){finish();set({state:'failed',rooms:r.rooms,error:'This group has '+r.rooms.length+' voice channels. Choose one.'});return state();}
   const room=r.rooms.find(x=>x.id===r.roomId);if(room)set({room:room.name,roomId:room.id});
   if(pending?.kind==='join'&&r.activeRoom)pending.seen=true; // Steam has the call in hand: if it ends now, it failed
  }catch(e){finish();set({state:'failed',error:clean(e.message,200)});throw e;}
  schedule();return state();
 }
 async function leave(){
  if(pending?.kind==='leave')throw Error('Tyler is already leaving the call.');
  const node=anchor();if(!node)throw Error('Connect Tyler to the group chat first.');
  if(pending?.kind==='join'){clearTimeout(pending.timeout);pending=null;} // Leave also cancels a join that is still connecting.
  pending={kind:'leave',timeout:setTimeout(()=>{if(pending?.kind!=='leave')return;pending=null;void observe(true).then(x=>{if(S.state!=='disconnected')set({state:'failed',error:'Steam still shows the bot in the call after '+LEAVE_MS/1000+' s.'+hint(x)});});schedule();},LEAVE_MS)};
  set({state:'leaving',error:''});
  try{const r=await globalThis.TylerSteamChat.request(node,'voice-leave');if(!r.left){finish();set({state:'disconnected',room:'',roomId:'',people:0,error:''});}}
  catch(e){finish();set({state:'failed',error:clean(e.message,200)});throw e;}
  schedule();return state();
 }

 // ── The panel's control (Chat tab, under Connect & start) ─────────────────
 const mount=api.ui?.root?.getElementById?.('voiceCallMount');let box=null;
 const LABEL={unavailable:'Not connected',disconnected:'Not in the call',joining:'Joining…',connected:'In the call',leaving:'Leaving…',failed:'Couldn’t finish'};
 if(mount){
  box=document.createElement('div');box.className='voice-call';box.innerHTML='<div class="voice-call-head"><b>Steam voice call</b><span class="pill" id="vcState" role="status" aria-live="polite"></span></div><p class="hint" id="vcText"></p><div class="btn-row" id="vcChoices" hidden></div><div class="btn-row"><button class="btn primary" id="vcJoin" type="button">Join voice</button><button class="btn" id="vcLeave" type="button">Leave voice</button></div>';
  mount.append(box);
  const $=id=>box.querySelector('#'+id);
  $('vcJoin').onclick=()=>void join().catch(e=>api.notify?.({kind:'error',title:'Couldn’t join the call',text:e.message}));
  $('vcLeave').onclick=()=>void leave().catch(e=>api.notify?.({kind:'error',title:'Couldn’t leave the call',text:e.message}));
 }
 function render(){
  if(!box)return;const $=id=>box.querySelector('#'+id),st=S.state;
  box.dataset.state=st;$('vcState').textContent=LABEL[st]||st;
  $('vcText').textContent=st==='connected'?(S.room||'Voice')+(S.people?' · '+S.people+' other'+(S.people===1?'':'s')+' in the call':' · nobody else yet'):
   st==='joining'?'Steam is connecting'+(S.room?' to '+S.room:'')+'.':st==='leaving'?'Steam is leaving the call.':st==='failed'?S.error:st==='unavailable'?S.reason:'Tyler joins this group’s voice channel with his own microphone.';
  $('vcJoin').disabled=!!pending||st==='connected'||st==='unavailable';$('vcLeave').disabled=pending?.kind==='leave'||!(st==='connected'||st==='joining'||st==='failed'&&!!S.roomId);
  const choices=$('vcChoices'),need=st==='failed'&&S.rooms.length>1&&/Choose one/.test(S.error);choices.hidden=!need;
  if(need)choices.replaceChildren(...S.rooms.map(r=>{const b=document.createElement('button');b.type='button';b.className='btn sm';b.textContent=r.name+(r.count?' · '+r.count:'');b.onclick=()=>void join(r.id).catch(e=>api.notify?.({kind:'error',title:'Couldn’t join the call',text:e.message}));return b;}));
 }
 render();schedule();
 globalThis.TylerVoiceCall=Object.freeze({state,join,leave,refresh:()=>observe(),diagnose:()=>observe(true).then(v=>({...state(),log:v?.log||[]})),onChange(fn){listeners.add(fn);return ()=>listeners.delete(fn);}});
})();

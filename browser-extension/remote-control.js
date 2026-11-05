// Phone remote, the Steam window's side (v2.25, desktop app only). The app's main process
// (app/remote.cjs) passes on what a paired phone asks for; this answers with Tyler's status and
// carries out a fixed list of actions with the panel's own controls. No keys, settings or chat
// messages ever go to the phone: only what the panel itself shows.
//
// v2.26: the phone shows a copy of this panel in the same theme, with the theme's live extras. While
// a phone is watching (a lease the main process renews every 20 s), the panel's own UI events
// (state, numbers, sounds, music, reply timings; the same ones theme-features.js reads) go to it as
// they happen, and the status includes what the extras need to start in step: counts, recent
// reply times, the session's state log (labels and counts only) and the lifetime totals.
(() => {
 'use strict';
 const api=globalThis.TylerCompanion,ui=api?.ui;
 if(!ui||globalThis.TylerRemote||(api.platform||globalThis.TylerPlatform||{}).id!=='desktop')return;
 const $=id=>ui.root.getElementById(id);
 const send=m=>void chrome.runtime.sendMessage(m).catch(()=>{});
 const reply=(id,ok,data,error)=>send({type:'remote:result',id,ok,data,error});
 const clean=(s,n)=>String(s??'').replace(/[\u0000-\u001f\u007f-\u009f‪-‮⁦-⁩]/g,' ').replace(/\s+/g,' ').trim().slice(0,n);
 const num=(v,min,max,d=0)=>{const n=Number(v);return Number.isFinite(n)?Math.min(max,Math.max(min,n)):d;};
 const text=id=>clean($(id)?.textContent,200);

 // ── Status ───────────────────────────────────────────────────────────────
 // The spending cap (Minecraft's hunger bar reads it).
 let cap=0;
 void globalThis.TylerStorage?.get?.(['spendingCapUSD']).then(v=>{cap=Number(v?.spendingCapUSD)||0;}).catch(()=>{});
 globalThis.TylerStorage?.onChanged?.addListener?.((changes,area)=>{if(area==='local'&&changes.spendingCapUSD)cap=Number(changes.spendingCapUSD.newValue)||0;});
 function fx(){
  const S=globalThis.TylerThemeFeatures?.state?.();if(!S)return null;
  const life=globalThis.TylerThemeFeatures?.life?.()||null;
  return {started:S.started,since:S.since,thinkingSince:S.thinkingSince||0,replies:S.replies|0,spoken:S.spoken|0,heard:S.heard|0,errors:S.errors|0,sounds:S.sounds|0,
   lastSound:clean(S.lastSound,40),music:clean(S.music,120),musicBy:clean(S.musicBy,60),turns:(S.turns||[]).slice(-40).map(v=>Math.round(Number(v)||0)),streak:S.streak|0,best:S.best|0,
   errorAt:(S.errorAt||[]).slice(-20),log:(S.log||[]).slice(-40).map(e=>({at:e.at,kind:clean(e.kind,12),text:clean(e.text,140)})),chatBurst:S.chatBurst|0,flood:!!S.flood,
   model:clean(S.model,60),provider:clean(S.provider,30),keyOk:S.keyOk??null,spendingCap:cap,
   life:life?{...life,ach:(life.ach||[]).slice(0,200).map(a=>clean(a,40)),best:{...(life.best||{})}}:null};
 }
 function controls(){
  const val=id=>$(id)?.value,on=id=>!!$(id)?.checked,list=$('diagnostics'),trail=$('trail');
  return {
   mode:['auto','text','voice'].includes(val('setupMode'))?val('setupMode'):'auto',
   keep:{call:on('kaCall'),chat:on('kaChat'),minutes:num(val('kaMinutes'),1,120,45),status:text('kaStatus')},
   music:{volume:num(val('musicVolume'),0,200,35),quality:val('musicQuality')||'auto',duck:on('musicDuck'),status:text('musicStatus')},
   board:{volume:num(val('boardVolume'),0,1,.6),status:text('boardStatus')},
   voice:{volume:num(val('volume'),0,.7,.35),monitor:on('monitor'),status:text('voiceState')},
   check:{running:!!$('diagnose')?.disabled,hearing:$('hearingConfirm')?!$('hearingConfirm').hidden:false,
    items:list?[...list.children].slice(0,30).map(li=>({result:li.dataset.result||'',summary:li.classList.contains('check-summary'),title:clean(li.querySelector('b')?.textContent,80),text:clean(li.querySelector('b')?li.querySelector('span')?.textContent:li.textContent,200)})):[]},
   trail:trail?[...trail.children].filter(li=>!li.classList.contains('trail-empty')).slice(0,8).map(li=>({label:clean(li.querySelector('b')?.textContent,40),time:clean(li.querySelector('time')?.textContent,12)})):[],
  };
 }
 function state(){
  const st=ui.state(),v=api.getVoiceState?.()||{},heard=api.getIncoming?.()||{},music=api.musicStatus?.()||{};
  const board=api.listSounds?.()||{slots:[],favorites:[]},fav=new Set(board.favorites||[]);
  const armed=!!v.enabled,inCall=Number(v.connectedPeers)>0,S=globalThis.TylerThemeFeatures?.state?.()||{};
  return {ready:true,now:Date.now(),owner:api.isOwner?.()!==false,state:st.state,label:clean(st.label,40),text:clean(st.text,200),theme:st.theme,
   paused:['paused','standby'].includes(st.state)||!(api.isAutomaticActive?.()||api.liveActive?.()),automatic:!!api.isAutomaticActive?.(),live:!!api.liveActive?.(),
   voice:{armed,inCall,peers:armed&&inCall?Math.max(0,Number(heard.tracks)||0):0,attached:Number(v.attached)||0},
   chat:!!(api.getComposer?.()?.isConnected&&api.getRegion?.()?.isConnected),
   notice:!!api.noticePending,
   call:globalThis.TylerVoiceCall?.state?.()||null, // v2.32: the Steam voice call as Steam shows it (voice-call.js) // v2.30: Connect & start is waiting for the one-time chat check
   replies:(Number(S.replies)||0)+(Number(S.spoken)||0),spend:clean(st.hud?.spend,16),
   hud:Object.fromEntries(['voice','voiceMeta','spend','spendMeta','latency','latencyMeta'].map(k=>[k,clean(st.hud?.[k],60)])),
   footer:text('footerState'),platform:clean($('platformChip')?.textContent,40),
   music:{title:clean(S.music,120),by:clean(S.musicBy,60),sharing:!!music.sharing,open:!!music.open},
   sounds:[...(board.slots||[])].sort((a,b)=>fav.has(b.slot)-fav.has(a.slot)).slice(0,40).map(s=>({slot:s.slot,name:clean(s.name,40),fav:fav.has(s.slot)})),
   favorites:[...fav].slice(0,40),
   controls:controls(),fx:fx()};
 }

 // ── Live events while a phone watches ─────────────────────────────────────
 // Only these events, with only these fields (all of them are already on the panel).
 const FIELDS={state:['state','label','text','before'],hud:['voice','voiceMeta','spend','spendMeta','latency','latencyMeta'],reply:['chars'],chat:['recent','flood'],
  sound:['slot','name'],music:['title','by'],report:['ms','spoken','live'],check:['problems','unsure'],keepalive:['reason'],theme:['theme'],'chat-check':['on'],'voice-call':['state','room','roomId','people','error','reason','since','pending','steamState']};
 let watchUntil=0,queue=[],flushTimer=0;
 function pick(type,data){const out={};for(const k of FIELDS[type]){const v=data?.[k];if(v===undefined)continue;out[k]=typeof v==='string'?clean(v,k==='text'?200:120):typeof v==='number'||typeof v==='boolean'?v:clean(v,60);}return out;}
 function flush(){flushTimer=0;if(!queue.length)return;const events=queue.splice(0,60);queue=[];send({type:'remote:event',events});}
 ui.onUI?.((type,data)=>{
  if(Date.now()>watchUntil||!FIELDS[type])return;
  queue.push({type,data:pick(type,data),at:Date.now()});
  // Several events in one moment (a reply and a state change) travel together.
  if(!flushTimer)flushTimer=setTimeout(flush,60);
 });

 // ── Actions ──────────────────────────────────────────────────────────────
 const click=id=>{const b=$(id);if(!b||b.disabled)throw Error('That control isn’t available right now.');b.click();};
 // Set a control the way you would: its value, then the events its own code listens to.
 function setControl(id,value,events=['input','change']){
  const el=$(id);if(!el||el.disabled)throw Error('That control isn’t available right now.');
  if(el.type==='checkbox'){if(el.checked===!!value)return;el.checked=!!value;}else{if(el.tagName==='SELECT'&&![...el.options].some(o=>o.value===String(value)))throw Error('That option isn’t available.');el.value=String(value);}
  for(const type of events)el.dispatchEvent(new Event(type,{bubbles:true}));
 }
 const ACTIONS={
  state,
  watch:({on})=>{watchUntil=on===false?0:Date.now()+30000;if(on===false)queue=[];return {};},
  pause:()=>{click('quickStop');return {};},
  start:()=>{api.connectAndStart?.();return {};},
  // v2.30: answers Connect & start's chat check from the phone (the same boxes as on the PC).
  // v2.32: Steam's own Join / Leave for the group's voice channel. They return once Steam has the request;
  // the phone shows Connected only when Steam does (the 'voice-call' events and the status).
  'voice-join':async({roomId})=>{const vc=globalThis.TylerVoiceCall;if(!vc)throw Error('Voice calls aren’t available in this window.');return {call:await vc.join(/^\d{1,20}$/.test(String(roomId||''))?String(roomId):'')};},
  'voice-leave':async()=>{const vc=globalThis.TylerVoiceCall;if(!vc)throw Error('Voice calls aren’t available in this window.');return {call:await vc.leave()};},
  notice:({always})=>{if(!api.answerNotice?.(always===true))throw Error('Nothing is waiting for the chat check.');return {};},
  'stop-audio':()=>{click('stop');return {};},
  sound:({slot})=>{const n=Number(slot),list=api.listSounds?.()?.slots||[];if(!list.some(s=>s.slot===n))throw Error('That clip isn’t on the soundboard.');api.playSound?.(n);return {};},
  'clips-stop':()=>{click('boardStop');return {};},
  'clip-volume':({value})=>{setControl('boardVolume',num(value,0,1,.6));return {};},
  'music-start':()=>{if(api.musicStatus?.()?.sharing)return {};click('musicStart');return {};},
  'music-play':({query})=>{const q=clean(query,120);if(q.length<2)throw Error('Type a song or artist.');if(!api.musicStatus?.()?.sharing)throw Error('Start the Music DJ first.');
   const box=$('musicQuery');if(!box)throw Error('The Music DJ isn’t loaded.');box.value=q;click('musicAdd');return {};},
  'music-skip':()=>{click('musicSkip');return {};},
  'music-stop':()=>{click('musicEnd');return {};},
  'music-volume':({value})=>{setControl('musicVolume',Math.round(num(value,0,200,35)));return {};},
  'music-quality':({level})=>{setControl('musicQuality',level,['change']);return {};},
  'music-duck':({on})=>{setControl('musicDuck',on,['change']);return {};},
  'voice-volume':({value})=>{setControl('volume',num(value,0,.7,.35),['input']);return {};},
  mode:({mode})=>{if(!['auto','text','voice'].includes(mode))throw Error('Pick auto, text or voice.');setControl('setupMode',mode,['change']);return {};},
  // The minutes list is greyed out while quiet-call humming is off: turn it on first, or set the minutes before turning it off.
  keepalive:({call,chat,minutes})=>{if(call===true)setControl('kaCall',true,['change']);if(minutes!==undefined&&!$('kaMinutes')?.disabled)setControl('kaMinutes',minutes,['change']);if(chat!==undefined)setControl('kaChat',chat,['change']);if(call===false)setControl('kaCall',false,['change']);return {};},
  'full-check':()=>{api.showTab?.('checks');click('diagnose');return {};},
  heard:({yes})=>{click(yes?'heardYes':'heardNo');return {};},
  beep:()=>{const v=api.getVoiceState?.()||{},inCall=globalThis.TylerVoiceCall?.state?.().state==='connected'||Number(v.connectedPeers)>0;if(!v.enabled)throw Error('Tyler’s microphone is off. Press Connect & start first.');if(!inCall)throw Error('The bot isn’t in a voice call, so nobody would hear the beep. Join voice first.');click('beep');return {};},
  'voice-check':()=>{click('voiceCheck');return {};},
  say:({text:t})=>{const s=clean(t,300);if(!s)throw Error('Type a message first.');api.send(s);return {};},
 };
 const ANYONE=new Set(['state','watch']);
 chrome.runtime.onMessage.addListener(m=>{
  if(m?.type!=='remote:action'||typeof m.id!=='string')return;
  const fn=Object.hasOwn(ACTIONS,m.action)?ACTIONS[m.action]:null;if(!fn){reply(m.id,false,null,'Unknown action.');return;}
  if(!ANYONE.has(m.action)&&api.isOwner?.()===false){reply(m.id,false,null,'This Steam window is on standby.');return;}
  Promise.resolve().then(()=>fn(m.args||{})).then(data=>reply(m.id,true,data),e=>reply(m.id,false,null,String(e?.message||e).slice(0,200)));
 });
 globalThis.TylerRemote=Object.freeze({state,watching:()=>Date.now()<watchUntil});
})();

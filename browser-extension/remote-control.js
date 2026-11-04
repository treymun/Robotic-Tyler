// Phone remote, the Steam window's side (v2.25, desktop app only). The app's main process
// (app/remote.cjs) passes on what a paired phone asks for; this answers with Tyler's status and
// carries out a fixed list of actions with the panel's own controls. No keys, settings or chat
// messages ever go to the phone: only what the panel itself shows.
(() => {
 'use strict';
 const api=globalThis.TylerCompanion,ui=api?.ui;
 if(!ui||globalThis.TylerRemote||(api.platform||globalThis.TylerPlatform||{}).id!=='desktop')return;
 const $=id=>ui.root.getElementById(id);
 const reply=(id,ok,data,error)=>void chrome.runtime.sendMessage({type:'remote:result',id,ok,data,error}).catch(()=>{});
 const clean=(s,n)=>String(s||'').replace(/[\u0000-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069]/g,' ').replace(/\s+/g,' ').trim().slice(0,n);
 function state(){
  const st=ui.state(),S=globalThis.TylerThemeFeatures?.state?.()||{},v=api.getVoiceState?.()||{},heard=api.getIncoming?.()||{},music=api.musicStatus?.()||{};
  const board=api.listSounds?.()||{slots:[],favorites:[]},fav=new Set(board.favorites||[]);
  const armed=!!v.enabled,inCall=Number(v.connectedPeers)>0;
  return {ready:true,owner:api.isOwner?.()!==false,state:st.state,label:clean(st.label,40),text:clean(st.text,200),theme:st.theme,
   paused:['paused','standby'].includes(st.state)||!(api.isAutomaticActive?.()||api.liveActive?.()),automatic:!!api.isAutomaticActive?.(),live:!!api.liveActive?.(),
   voice:{armed,inCall,peers:armed&&inCall?Math.max(0,Number(heard.tracks)||0):0},
   replies:(Number(S.replies)||0)+(Number(S.spoken)||0),spend:clean(st.hud?.spend,16),
   music:{title:clean(S.music,120),by:clean(S.musicBy,60),sharing:!!music.sharing,open:!!music.open},
   sounds:[...(board.slots||[])].sort((a,b)=>fav.has(b.slot)-fav.has(a.slot)).slice(0,40).map(s=>({slot:s.slot,name:clean(s.name,40),fav:fav.has(s.slot)}))};
 }
 const click=id=>{const b=$(id);if(!b||b.disabled)throw Error('That control isn’t available right now.');b.click();};
 const ACTIONS={
  state,
  pause:()=>{click('quickStop');return {};},
  start:()=>{api.connectAndStart?.();return {};},
  'stop-audio':()=>{click('stop');return {};},
  sound:({slot})=>{const n=Number(slot),list=api.listSounds?.()?.slots||[];if(!list.some(s=>s.slot===n))throw Error('That clip isn’t on the soundboard.');api.playSound?.(n);return {};},
  'music-play':({query})=>{const q=clean(query,120);if(q.length<2)throw Error('Type a song or artist.');if(!api.musicStatus?.()?.sharing)throw Error('Start the Music DJ on the PC first (Room → Music DJ).');
   const box=$('musicQuery');if(!box)throw Error('The Music DJ isn’t loaded.');box.value=q;click('musicAdd');return {};},
  'music-skip':()=>{click('musicSkip');return {};},
  'music-stop':()=>{click('musicEnd');return {};},
  say:({text})=>{const t=clean(text,300);if(!t)throw Error('Type a message first.');api.send(t);return {};},
 };
 chrome.runtime.onMessage.addListener(m=>{
  if(m?.type!=='remote:action'||typeof m.id!=='string')return;
  const fn=ACTIONS[m.action];if(!fn){reply(m.id,false,null,'Unknown action.');return;}
  if(m.action!=='state'&&api.isOwner?.()===false){reply(m.id,false,null,'This Steam window is on standby.');return;}
  Promise.resolve().then(()=>fn(m.args||{})).then(data=>reply(m.id,true,data),e=>reply(m.id,false,null,String(e?.message||e).slice(0,200)));
 });
 globalThis.TylerRemote=Object.freeze({state});
})();

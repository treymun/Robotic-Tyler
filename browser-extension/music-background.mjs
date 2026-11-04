// Browser-tab playback only. No media downloading, extraction or private settings.
export function createMusicRouter(chrome){
 const store=chrome.storage.session;let serial=Promise.resolve();
 async function route(m,s){
  if(!s.tab||!/^https:\/\/(?:www\.)?youtube\.com\//.test(s.url||''))throw Error('Music controller requires the selected YouTube tab.');
  const {tylerMusicTab:state}=await store.get('tylerMusicTab');
  if(!state||state.youtubeTab!==s.tab.id)return {};
  if(m.type==='music:pending')return {command:state};
  if(m.type==='music:event'&&m.token===state.token){
   if(!['playing','ended','blocked','error','paused','missing'].includes(m.event))return {};
   await chrome.tabs.sendMessage(state.steamTab,{source:'tyler-music-event',token:state.token,event:m.event,title:String(m.title||'').slice(0,160)}).catch(()=>{});
  }
  return {};
 }
 async function command(m,s){
  if(!s.tab||!/^https:\/\/steamcommunity\.com\/chat\//.test(s.url||''))throw Error('Open the connected Steam chat.');
  let {tylerMusicTab:state}=await store.get('tylerMusicTab');
  if(state){try{await chrome.tabs.get(state.youtubeTab);}catch{state=null;}}
  if(m.action==='open'){
   // background:true (Start Music DJ) keeps Steam in front, so the share picker can open over it.
   const front=m.background!==true;
   if(!state){const tab=await chrome.tabs.create({url:'https://www.youtube.com/',active:front});state={steamTab:s.tab.id,youtubeTab:tab.id,token:'idle',action:'idle'};await store.set({tylerMusicTab:state});}
   else {state={...state,steamTab:s.tab.id,action:'stop'};await store.set({tylerMusicTab:state});if(front)await chrome.tabs.update(state.youtubeTab,{active:true});}return {};
  }
  if(!state)throw Error('Open the music tab using Tyler’s Music panel first.');
  if(state.steamTab!==s.tab.id)throw Error('Music belongs to a different Steam tab. Stop it there before starting another session.');
  if(!['play','pause','resume','stop'].includes(m.action))throw Error('Unknown music action');
  const next={...state,action:m.action,token:String(m.token||Date.now()).slice(0,100)};
  if(m.action==='play'){
   if(typeof m.query!=='string'||m.query.length<2||m.query.length>160)throw Error('Song request must be 2–160 characters.');
   next.query=m.query;await store.set({tylerMusicTab:next});
   await chrome.tabs.update(state.youtubeTab,{url:'https://www.youtube.com/results?search_query='+encodeURIComponent(m.query+' music')});
  }else await store.set({tylerMusicTab:next});
  return {token:next.token};
 }
 return {route,command:(m,s)=>{const run=serial.catch(()=>{}).then(()=>command(m,s));serial=run.catch(()=>{});return run;}};
}

// Desktop Settings only; excluded from Chrome and the phone remote.
(() => {
 'use strict';const api=window.tylerSettings,select=document.getElementById('steamAppearanceMode'),note=document.getElementById('steamAppearanceStatus');
 if(!api||!select)return;let closed=false,writes=0,generation=0,queue=Promise.resolve();
 const mode=v=>['colors','full'].includes(v)?v:'off';
 async function refresh(){if(closed||writes)return;const token=generation;try{const s=await api.steamAppearance();if(closed||writes||token!==generation)return;select.value=mode(s.preferred);note.textContent=s.reason||({off:'Steam’s original appearance.',colors:'Colors only follows Tyler’s selected theme.',full:'Full visual styling follows Tyler’s selected theme.'}[s.effective]||'Styling unavailable.');}catch{if(token===generation)note.textContent='Appearance status unavailable. You can still choose Off or Colors only.';}}
 function save(value){const next=mode(value),token=++generation;writes++;select.value=next;note.textContent='Applying your appearance choice.';
  // Recovery buttons remain usable during a slow save; the last choice wins.
  queue=queue.catch(()=>{}).then(async()=>{try{await api.storage.local.set({steamChatAppearance:next});}catch{if(token===generation)note.textContent='Could not save this choice. Try again.';return;}finally{writes--;}if(token===generation)await refresh();});return queue;}
 // These controls save immediately, so don't mark the unrelated Save bar dirty.
 select.addEventListener('input',event=>event.stopPropagation());
 select.addEventListener('change',()=>void save(select.value));
 document.getElementById('steamAppearanceOff').onclick=()=>void save('off');
 document.getElementById('steamAppearanceColors').onclick=()=>void save('colors');
 const timer=setInterval(()=>{if(!document.hidden)void refresh();},2000);
 addEventListener('pagehide',()=>{closed=true;clearInterval(timer);},{once:true});void refresh();
})();

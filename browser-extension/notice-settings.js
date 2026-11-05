// Settings → AI → Telling each chat (v2.30). Connect & start asks once per chat whether you've told
// it that Tyler sends its chat and speech to your AI provider. "Don't ask again" there turns the
// check off for every chat; this switch shows that choice and turns the check back on.
(() => {
 'use strict';
 const store=globalThis.tylerSettings?.storage?.local||globalThis.chrome?.storage?.local,box=document.getElementById('noticeAsk');
 if(!store||!box)return;
 const status=document.getElementById('noticeStatus');
 const show=q=>{box.checked=q?.noticeAlways!==true;status.textContent=box.checked?'Connect & start asks once in each new chat.':'Connect & start doesn’t ask. Remember to tell new chats that Tyler is listening.';};
 const load=()=>Promise.resolve(store.get(['quickSetup'])).then(v=>show(v?.quickSetup||{})).catch(()=>{});
 box.onchange=async()=>{try{const v=await store.get(['quickSetup']),q={...(v?.quickSetup||{}),noticeAlways:!box.checked};await store.set({quickSetup:q});const back=(await store.get(['quickSetup']))?.quickSetup||{};if((back.noticeAlways===true)!==q.noticeAlways)throw Error('The setting didn’t save. Try again.');show(back);globalThis.TylerKit?.page()?.toast({kind:'success',title:'Saved',text:status.textContent});}catch(e){status.textContent=String(e.message||e);}};
 globalThis.chrome?.storage?.onChanged?.addListener?.((changes,area)=>{if(area==='local'&&changes.quickSetup)show(changes.quickSetup.newValue||{});});
 void load();
})();

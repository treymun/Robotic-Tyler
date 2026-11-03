// Runs only in the extension's isolated content-script world.
globalThis.TylerStorage=Object.freeze({
 async get(keys){const r=await chrome.runtime.sendMessage({type:'storage:content',action:'get',keys});if(!r?.ok)throw Error(r?.error||'Extension unavailable; reload Steam chat.');return r.values;},
 async set(values){const r=await chrome.runtime.sendMessage({type:'storage:content',action:'set',values});if(!r?.ok)throw Error(r?.error||'Extension unavailable; reload Steam chat.');},
 async remove(keys){const r=await chrome.runtime.sendMessage({type:'storage:content',action:'remove',keys});if(!r?.ok)throw Error(r?.error||'Extension unavailable; reload Steam chat.');},
 onChanged:{addListener(fn){chrome.runtime.onMessage.addListener(m=>{if(m.type==='storage:changed')fn(m.changes,'local');});}}
});

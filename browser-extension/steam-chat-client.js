(()=>{
 const pending=new Map();
 window.addEventListener('message',event=>{if(event.source!==window||event.origin!==location.origin||event.data?.source!=='tyler-steam-chat-reply')return;const job=pending.get(event.data.id);if(!job)return;pending.delete(event.data.id);clearTimeout(job.timer);event.data.ok?job.resolve(event.data):job.reject(Error(event.data.error||'Steam chat action failed'));});
 function request(node,op,values={}){
  if(!node?.isConnected)return Promise.reject(Error('Reconnect the Steam chat reader first.'));
  if(pending.size>=8)return Promise.reject(Error('Steam chat controls are busy. Try again shortly.'));
  const id=crypto.randomUUID(),wait=op==='image-upload'?60000:8000;return new Promise((resolve,reject)=>{
   const timer=setTimeout(()=>{pending.delete(id);reject(Error(['kick','ban','unban','delete-message','auto-delete','mute','unmute','vote-mute'].includes(op)?'Moderation outcome could not be confirmed. It will not retry automatically.':'Steam chat controls did not respond. Close and reopen Steam chat after reloading the extension.'));},wait);pending.set(id,{resolve,reject,timer});
   try{node.setAttribute('data-tyler-chat-request',JSON.stringify({...values,id,op}));node.dispatchEvent(new Event('tyler-steam-chat-request',{bubbles:true}));node.removeAttribute('data-tyler-chat-request');}catch(e){pending.delete(id);clearTimeout(timer);reject(e);}
  });
 }
 globalThis.TylerSteamChat={request,disarm:()=>request(document.documentElement,'disarm').catch(()=>{}),disarmModeration:()=>request(document.documentElement,'disarm-moderation').catch(()=>{}),disarmVoteMute:()=>request(document.documentElement,'disarm-vote-mute').catch(()=>{}),disarmAdmin:()=>request(document.documentElement,'disarm-admin').catch(()=>{})};
})();

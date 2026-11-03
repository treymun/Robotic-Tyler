// MAIN-world audio listener API; all inference happens in the local extension frame.
(()=>{
 const pending=new Map();let serial=0;
 window.addEventListener('message',event=>{
  const m=event.data;if(event.source!==window||event.origin!==location.origin||m?.source!=='tyler-neural-reply')return;
  const request=pending.get(m.id);if(!request)return;pending.delete(m.id);clearTimeout(request.timer);
  if(m.ok)request.resolve(m);else request.reject(Error(m.error||'Local speech detector failed'));
 });
 function request(type,audio){return new Promise((resolve,reject)=>{
  const id='vad-'+Date.now().toString(36)+'-'+(++serial);
  const timer=setTimeout(()=>{pending.delete(id);reject(Error('Local speech detector timed out. Reload the extension and reopen Steam chat.'));},30000);
  pending.set(id,{resolve,reject,timer});window.postMessage({source:'tyler-neural-request',type,id,audio},location.origin);
 });}
 globalThis.TylerNeural={ready:()=>request('init'),classify:audio=>request('classify',audio)};
})();

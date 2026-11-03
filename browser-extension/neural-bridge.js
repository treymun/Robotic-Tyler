// Isolated content script: relays bounded audio only, never extension settings.
(()=>{
 const pending=new Map();let frame,loaded;
 function mount(){
  if(frame?.isConnected)return loaded;
  loaded=new Promise((resolve,reject)=>{
   frame=document.createElement('iframe');frame.hidden=true;frame.title='Tyler local speech detector';
   frame.src=chrome.runtime.getURL('neural-host.html');
   frame.onload=resolve;frame.onerror=()=>reject(Error('Speech detector frame failed to load'));
   (document.documentElement||document.body).append(frame);
  });return loaded;
 }
 window.addEventListener('message',async event=>{
  const m=event.data;
  if(event.source===frame?.contentWindow&&m?.source==='tyler-neural-result'){
   const id=pending.get(m.id);if(!id)return;pending.delete(m.id);
   window.postMessage({source:'tyler-neural-reply',id,ok:m.ok,speech:m.speech,speechMs:m.speechMs,peak:m.peak,error:m.error},location.origin);return;
  }
  if(event.source!==window||event.origin!==location.origin||m?.source!=='tyler-neural-request')return;
  if(!['init','classify'].includes(m.type)||typeof m.id!=='string'||m.id.length>100||pending.size>=2)return;
  if(m.type==='classify'&&(!(m.audio instanceof Float32Array)||m.audio.length<4000||m.audio.length>192000))return;
  const key=crypto.randomUUID();pending.set(key,m.id);
  try{await mount();frame.contentWindow.postMessage({source:'tyler-neural-host',id:key,type:m.type,audio:m.audio},'*');}
  catch{pending.delete(key);window.postMessage({source:'tyler-neural-reply',id:m.id,ok:false,error:'Local speech detector could not start'},location.origin);}
  setTimeout(()=>pending.delete(key),35000);
 });
})();

// ROBOTIC TYLER: chat images, the chat side (v2.34). Isolated world.
//
// A friend types "!image PROMPT" (or "!image best PROMPT", "!image venice PROMPT"…). Tyler checks the
// owner's limits here (who may ask, a cooldown per person, how many per person and in total this
// session), says he's drawing, asks the background for the picture (the key never comes here), and
// posts it through Steam's own chat uploader (steam-chat-main.js), so friends see a normal Steam image.
// One picture at a time, up to three waiting. Pause AI cancels the one being made and the queue.
(() => {
 'use strict';
 const api=globalThis.TylerCompanion,I=globalThis.TylerImages,mount=(api?.getFeatureMount?.()||api?.getMount?.());if(!api||!I||!mount||globalThis.TylerImageGen)return;
 const panel=document.createElement('details');panel.className='feature';
 panel.innerHTML=`<summary><span class="feature-title">Chat images</span><span class="feature-meta" id="imgMeta">Off</span></summary>
 <p class="hint">Friends type <code>!image</code> and a description; Tyler draws it and posts it in the chat. Styles, models, limits and the Venice key are in Settings → Images.</p>
 <p id="imgStatus" role="status">Turn chat images on in Settings → Images.</p>
 <p class="hint" id="imgCounts"></p>
 <div class="btn-row"><button class="btn sm" id="imgReset" type="button">Reset session counts</button><button class="btn sm" id="imgSettings" type="button">Settings</button></div>`;
 mount.append(panel);
 const $=id=>panel.querySelector('#'+id),status=t=>{$('imgStatus').textContent=t;};
 let cfg=I.config(null),keys={openrouter:false,venice:false},region=null,observer=null,watchEpoch=0,chatEpoch=0,boundScope=null,selector=null,boundAt=0,busy=false,jobStarted=0;
 const seen=new WeakMap(),answered=new Set(),queue=[],people=new Map();let sessionCount=0;
 async function refreshConfig(){try{const r=await chrome.runtime.sendMessage({type:'image:config'});if(r?.ok!==false&&r?.config){cfg=I.config(r.config);keys=r.keys||keys;}}catch{}
  globalThis.TylerCommands?.set?.('image',{enabled:cfg.enabled});
  $('imgMeta').textContent=cfg.enabled?'On · '+(I.STYLES[cfg.defaultStyle]?.label||'Fast'):'Off';counts();}
 function counts(){const lim=n=>n?String(n):'no limit';$('imgCounts').textContent='This session: '+sessionCount+' of '+lim(cfg.perSession)+' · per person '+lim(cfg.perPerson)+' · cooldown '+(cfg.cooldownSec?cfg.cooldownSec>=60?cfg.cooldownSec/60+' min':cfg.cooldownSec+' s':'none')+'.';}
 function resetSession(){sessionCount=0;people.clear();counts();}
 $('imgReset').onclick=()=>{resetSession();status('Session counts reset.');};
 $('imgSettings').onclick=()=>{try{chrome.runtime.sendMessage({type:'settings'}).catch(()=>{});}catch{}};
 const say=text=>{try{api.send(text,{kind:'image'});}catch(e){status('Couldn’t post in chat: '+e.message);}};
 const human=s=>s>=60?Math.ceil(s/60)+' min':Math.ceil(s)+' s';
 // The owner's limits, checked when the request arrives (so a refusal is immediate).
 function allowed(who,style){
  const now=Date.now(),p=people.get(who.key)||{count:0,last:0};
  if(!cfg.styles[style])return 'that style is switched off. Try !image help.';
  if(style.startsWith('v')&&!keys.venice)return 'the Venice styles need a Venice key in Settings.';
  if(!style.startsWith('v')&&!keys.openrouter)return 'images need an OpenRouter key in Settings.';
  if(cfg.access==='selected'&&(!who.verified||!cfg.allowedIDs.split('\n').includes(who.id)))return 'only the owner’s allowed accounts can ask for images.';
  if(cfg.perSession&&sessionCount+queue.length+(busy?1:0)>=cfg.perSession)return 'this session’s '+cfg.perSession+' images are used up.';
  if(cfg.perPerson&&p.count>=cfg.perPerson)return 'you’ve had your '+cfg.perPerson+' this session.';
  if(cfg.cooldownSec&&p.last&&now-p.last<cfg.cooldownSec*1000)return 'wait '+human(cfg.cooldownSec-(now-p.last)/1000)+' before your next one.';
  if(queue.length>=3)return 'three are already waiting. Try again in a minute.';
  return null;
 }
 function speakerOf(node){
  const s=globalThis.TylerIdentity?.identify?.(node,region)||globalThis.TylerIdentity?.speaker?.(node,region)||null,m=globalThis.TylerIdentity?.meta?.(node)||null;
  const id=/^7656119\d{10}$/.test(s?.id||'')?s.id:m?.senderId||null;return {id,name:String(s?.name||'Someone').slice(0,40),verified:!!id,key:id||'name:'+String(s?.name||'?').toLowerCase(),speaker:s};
 }
 async function handleLine(line,node){
  const req=I.parse(line,cfg);if(!req)return;
  if(!cfg.enabled||api.isOwner?.()===false)return;
  if(api.isAiPaused?.()){status('An image request was ignored: AI is paused.');return;}
  if(req.help){say(I.help(cfg));return;}
  const who=speakerOf(node),no=allowed(who,req.style);
  if(no){say('🎨 '+who.name+', '+no);status('Refused for '+who.name+': '+no);return;}
  const p=people.get(who.key)||{count:0,last:0};p.count++;p.last=Date.now();people.set(who.key,p);
  queue.push({...req,who,epoch:chatEpoch});counts();
  if(busy)say('🎨 Queued for '+who.name+' (#'+queue.length+').');
  void next();
 }
 async function next(){
  if(busy||!queue.length)return;busy=true;jobStarted=Date.now();const job=queue.shift();
  try{
   if(job.epoch!==chatEpoch)throw Error('Cancelled: the chat changed.');
   const style=I.STYLES[job.style];say('🎨 Drawing “'+job.prompt.slice(0,80)+(job.prompt.length>80?'…':'')+'” for '+job.who.name+' ('+style.label+')…');
   status('Drawing for '+job.who.name+' with '+(cfg.models[job.style]||'?')+'…');
   const r=await chrome.runtime.sendMessage({type:'image:generate',style:job.style,prompt:job.prompt,speaker:job.who.speaker});
   if(!r?.ok)throw Error(r?.error||'The image request failed.');
   if(api.isAiPaused?.())throw Error('Cancelled: AI was paused.');if(job.epoch!==chatEpoch)throw Error('Cancelled: the chat changed.');
   // Any message of this chat leads to Steam's uploader (the one picked in setup may have scrolled away).
   const sample=api.getSample?.(),anchor=sample?.isConnected?sample:[...(region?.querySelectorAll?.(selector||'.msgText')||[])].reverse().find(n=>n.isConnected);if(!anchor)throw Error('The chat isn’t connected any more.');
   status('Posting the picture to Steam…');
   await globalThis.TylerSteamChat.request(anchor,'image-upload',{data:r.image,type:r.mediaType,spoiler:r.spoiler===true});
   sessionCount++;counts();
   status('Posted for '+job.who.name+' · '+r.model+' · '+(r.cost?(r.estimated?'about ':'')+'$'+Number(r.cost).toFixed(3):'cost not reported')+' · '+(r.ms/1000).toFixed(1)+' s'+(r.spoiler?' · posted as a spoiler':''));
   api.emit?.('image',{style:job.style,model:r.model,ms:r.ms,cost:r.cost});
  }catch(e){
   const why=String(e.message||e).replace(/^(?:OpenRouter|Venice) \d{3}: /,'').slice(0,160);
   // A request that never produced a picture doesn't count against the person.
   const p=people.get(job.who.key);if(p&&p.count>0)p.count--;counts();
   if(!/AI was paused|^Image cancelled/.test(why))say('🎨 Couldn’t draw that for '+job.who.name+': '+why);
   status('Not posted: '+why);
  }finally{busy=false;jobStarted=0;if(queue.length)setTimeout(()=>void next(),300);}
 }
 function watch(){
  if(!api.isOwner?.()||!cfg.enabled){if(observer||queue.length){watchEpoch++;chatEpoch++;observer?.disconnect();observer=null;region=null;queue.length=0;}return;}
  const next=api.getRegion?.(),sample=api.getSample?.();
  if(!next?.isConnected){if(observer){watchEpoch++;observer.disconnect();observer=null;region=null;}return;}
  if(next===region&&observer)return;
  const scope=api.getChatScope?.()||'';if(scope!==boundScope){if(boundScope!==null){chatEpoch++;queue.length=0;}boundScope=scope;resetSession();}
  watchEpoch++;observer?.disconnect();region=next;boundAt=Date.now();
  selector=(sample?.isConnected&&globalThis.TylerSelection?.selector?.(sample))||selector;if(!selector)return;
  for(const node of region.querySelectorAll(selector))seen.set(node,(globalThis.TylerChatBus?.text(node)??(node.innerText||node.textContent||'').trim()));
  observer=new (globalThis.TylerChatBus?.Observer||MutationObserver)(records=>{
   const nodes=new Set(),collect=raw=>{const n=raw?.nodeType===1?raw:raw?.parentElement;if(!n)return;if(n.matches?.(selector))nodes.add(n);for(const c of n.querySelectorAll?.(selector)||[])nodes.add(c);const parent=n.closest?.(selector);if(parent)nodes.add(parent);};
   for(const r of records){for(const raw of r.addedNodes||[])collect(raw);if(r.type==='characterData')collect(r.target);}
   for(const node of nodes){
    const line=(globalThis.TylerChatBus?.text(node)??(node.innerText||node.textContent||'').trim());if(!line||seen.get(node)===line)continue;seen.set(node,line);
    const m=globalThis.TylerIdentity?.meta?.(node);if(m?.self||TylerChatTag.own(line,m))continue;
    if(m?.at&&m.at<boundAt-5000)continue; // Steam re-drawing older history isn't a new request
    if(m?.key){if(answered.has(m.key))continue;answered.add(m.key);if(answered.size>500)answered.delete(answered.values().next().value);}
    for(const l of line.split('\n').map(x=>x.trim()).filter(Boolean).slice(0,3))if(I.parse(l))void handleLine(l,node);
   }
  });
  observer.observe(region,{subtree:true,childList:true,characterData:true});
 }
 api.onPause?.(()=>{queue.length=0;if(busy)chrome.runtime.sendMessage({type:'image:cancel'}).catch(()=>{});status('Paused: the image being drawn and the queue were cancelled.');});
 setInterval(()=>{if(busy&&jobStarted&&Date.now()-jobStarted>200000){status('Still waiting for the picture after 3 minutes…');}},10000);
 void refreshConfig().then(watch);setInterval(watch,1400);setInterval(()=>void refreshConfig(),30000);
 panel.addEventListener('toggle',()=>{if(panel.open)void refreshConfig();});
 globalThis.TylerImageGen=Object.freeze({refresh:refreshConfig,state:()=>({enabled:cfg.enabled,busy,queued:queue.length,session:sessionCount})});
})();

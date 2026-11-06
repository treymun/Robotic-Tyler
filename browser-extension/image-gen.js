// ROBOTIC TYLER: chat images, the chat side (v2.34). Isolated world.
//
// A friend types "!image PROMPT" (or "!image best PROMPT", "!image venice PROMPT"…). Tyler checks the
// owner's limits here (who may ask, a cooldown per person, how many per person and in total this
// session), says he's drawing, asks the background for the picture (the key never comes here), and
// posts it through Steam's own chat uploader (steam-chat-main.js), so friends see a normal Steam image.
// One picture at a time, up to three waiting. Pause AI cancels the one being made and the queue.
// v2.40: the This PC style ("!image pc …": the desktop app's images on this PC; friends only when the
// owner allows it, and the uncensored model only when the owner allows that too), the owner's own Draw
// box (it posts like !image does; only this box makes a request the owner's), and the names of the people
// in the chat sent with every request, for Tyler's image rules (image-rules.js) in the background.
(() => {
 'use strict';
 const api=globalThis.TylerCompanion,I=globalThis.TylerImages,mount=(api?.getFeatureMount?.()||api?.getMount?.());if(!api||!I||!mount||globalThis.TylerImageGen)return;
 const panel=document.createElement('details');panel.className='feature';
 panel.innerHTML=`<summary><span class="feature-title">Chat images</span><span class="feature-meta" id="imgMeta">Off</span></summary>
 <p class="hint">Friends type <code>!image</code> and a description; Tyler draws it and posts it in the chat. Styles, models, limits and the Venice key are in Settings → Images.</p>
 <div id="imgDrawBox" hidden><label class="field">Draw on this PC <span class="field-note" id="imgDrawNote">posted in this chat</span><textarea id="imgDrawPrompt" rows="2" maxlength="600" placeholder="A chrome robot cheering in a neon arena"></textarea></label>
 <div class="btn-row"><button class="btn sm" id="imgDraw" type="button">Draw and post</button><button class="btn sm" id="imgDrawStop" type="button" hidden>Stop</button></div></div>
 <p id="imgStatus" role="status">Turn chat images on in Settings → Images.</p>
 <p class="hint" id="imgCounts"></p>
 <div class="btn-row"><button class="btn sm" id="imgReset" type="button">Reset session counts</button><button class="btn sm" id="imgSettings" type="button">Settings</button></div>`;
 mount.append(panel);
 let idle=true; // nothing has happened yet: the status line just says what's on
 const $=id=>panel.querySelector('#'+id),status=t=>{idle=false;$('imgStatus').textContent=t;};
 let cfg=I.config(null),keys={openrouter:false,venice:false},local={available:false,ready:false},blocked=null,region=null,observer=null,watchEpoch=0,chatEpoch=0,boundScope=null,selector=null,boundAt=0,busy=false,jobStarted=0;
 const seen=new WeakMap(),answered=new Set(),queue=[],people=new Map(),chatNames=new Map();let sessionCount=0,groupNames=[],groupScope=null;
 async function refreshConfig(){try{const r=await chrome.runtime.sendMessage({type:'image:config'});if(r?.ok!==false&&r?.config){cfg=I.config(r.config);keys=r.keys||keys;local=r.local||local;}}catch{}
  $('imgDrawBox').hidden=!local.available||api.isOwner?.()===false;$('imgDraw').disabled=busy&&queue.some(j=>j.owner);
  $('imgDrawNote').textContent=local.ready?'posted in this chat · '+(local.label||'this PC'):'set up in Settings → AI on this PC';
  // Until something happens, the status line says what's on (the Draw box is the owner's own, so it works either way).
  if(idle)$('imgStatus').textContent=(cfg.enabled?'Chat images are on: friends can use !image.':'Chat images are off for friends: turn them on in Settings → Images.')+(local.available&&local.ready?' Your Draw box works either way.':'');
  globalThis.TylerCommands?.set?.('image',{enabled:cfg.enabled});
  $('imgMeta').textContent=blocked==='limited'?'Steam account can’t post pictures':cfg.enabled?'On · '+(I.STYLES[cfg.defaultStyle]?.label||'Fast'):'Off';counts();}
 function counts(){const lim=n=>n?String(n):'no limit';$('imgCounts').textContent='This session: '+sessionCount+' of '+lim(cfg.perSession)+' · per person '+lim(cfg.perPerson)+' · cooldown '+(cfg.cooldownSec?cfg.cooldownSec>=60?cfg.cooldownSec/60+' min':cfg.cooldownSec+' s':'none')+'.';}
 function resetSession(){sessionCount=0;people.clear();counts();}
 $('imgReset').onclick=()=>{resetSession();status('Session counts reset.');};
 $('imgSettings').onclick=()=>{try{chrome.runtime.sendMessage({type:'settings'}).catch(()=>{});}catch{}};
 const say=text=>{try{api.send(text,{kind:'image'});}catch(e){status('Couldn’t post in chat: '+e.message);}};
 const human=s=>s>=60?Math.ceil(s/60)+' min':Math.ceil(s)+' s';
 // The owner's limits, checked when the request arrives (so a refusal is immediate).
 // v2.34.3: Steam doesn't let limited accounts (ones that haven't spent $5 on Steam) post pictures.
 const LIMITED_CHAT='this Steam account can’t post pictures (Steam limits accounts that haven’t spent $5 on Steam).';
 const LIMITED_PANEL='Steam won’t let this account post pictures: it’s a limited Steam account (one that hasn’t spent $5 in the Steam Store). Spend $5 on this account (adding $5 to its Steam Wallet counts), then reload Steam chat. Until then Tyler refuses !image at once, so nothing is paid for.';
 const isLimited=e=>/LIMITED_ACCOUNT|limited users? cannot upload/i.test(String(e?.message||e));
 function block(){blocked='limited';status(LIMITED_PANEL);$('imgMeta').textContent='Steam account can’t post pictures';}
 const anchorNow=()=>{const sample=api.getSample?.();return sample?.isConnected?sample:[...(region?.querySelectorAll?.(selector||'.msgText')||[])].reverse().find(n=>n.isConnected)||null;};
 function allowed(who,style){
  const now=Date.now(),p=people.get(who.key)||{count:0,last:0};
  if(blocked==='limited')return LIMITED_CHAT;
  if(!cfg.styles[style])return 'that style is switched off. Try !image help.';
  if(style==='pc'){
   if(!local.available)return 'images on this PC are part of the ROBOTIC TYLER desktop app.';
   if(!local.ready)return 'images on this PC aren’t set up yet.';
   if(!local.friends)return 'only the owner can use images on this PC.';
   if(local.uncensored&&!local.friendsUncensored)return 'the PC’s uncensored model is for the owner only.';
  }
  else if(style.startsWith('v')&&!keys.venice)return 'the Venice styles need a Venice key in Settings.';
  else if(!style.startsWith('v')&&!keys.openrouter)return 'images need an OpenRouter key in Settings.';
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
 // The people in this chat, for Tyler's image rules (no sexual pictures of real people): who spoke lately,
 // and the group's member list when Steam has it loaded.
 function noteName(node){try{const n=String(speakerOf(node).name||'').trim();if(n&&n!=='Someone'){chatNames.delete(n);chatNames.set(n,1);if(chatNames.size>200)chatNames.delete(chatNames.keys().next().value);}}catch{}}
 // Also who wrote the messages on screen now, so the names are there even when friends' !image isn't
 // being watched (the owner's Draw box with chat images off for friends).
 function scanNames(){try{const reg=region||api.getRegion?.(),sample=api.getSample?.(),sel=selector||(sample?.isConnected&&globalThis.TylerSelection?.selector?.(sample));if(!reg?.querySelectorAll||!sel)return;
  for(const n of [...reg.querySelectorAll(sel)].slice(-80)){if(globalThis.TylerIdentity?.meta?.(n)?.self)continue;const w=globalThis.TylerIdentity?.identify?.(n,reg)||globalThis.TylerIdentity?.speaker?.(n,reg),name=String(w?.name||'').trim().slice(0,40);if(name&&name!=='Someone'){chatNames.delete(name);chatNames.set(name,1);}}
  while(chatNames.size>200)chatNames.delete(chatNames.keys().next().value);}catch{}}
 async function names(anchor){
  const scope=api.getChatScope?.()||'';
  if((scope!==groupScope||!groupNames.length)&&anchor){groupScope=scope;try{const g=await globalThis.TylerSteamChat.request(anchor,'group',{});groupNames=(g?.members||[]).map(m=>String(m?.name||'')).filter(Boolean).slice(0,256);}catch{groupNames=[];}}
  scanNames();return [...new Set([...chatNames.keys(),...groupNames])].slice(0,300);
 }
 async function handleLine(line,node){
  const req=I.parse(line,cfg);if(!req)return;
  if(!cfg.enabled||api.isOwner?.()===false)return;
  if(api.isAiPaused?.()){status('An image request was ignored: AI is paused.');return;}
  if(req.help){say(I.help(cfg));return;}
  const who=speakerOf(node),no=allowed(who,req.style);
  if(no){say('🎨 '+who.name+', '+no);status(blocked==='limited'?LIMITED_PANEL:'Refused for '+who.name+': '+no);return;}
  const p=people.get(who.key)||{count:0,last:0};p.count++;p.last=Date.now();people.set(who.key,p);
  queue.push({...req,who,epoch:chatEpoch});counts();
  if(busy)say('🎨 Queued for '+who.name+' (#'+queue.length+').');
  void next();
 }
 async function next(){
  if(busy||!queue.length)return;busy=true;jobStarted=Date.now();const job=queue.shift();
  try{
   if(job.owner?job.scope!==(api.getChatScope?.()||''):job.epoch!==chatEpoch)throw Error('Cancelled: the chat changed.');
   // Ask Steam first whether this account may post pictures, so nobody pays for one it would refuse.
   const first=anchorNow();if(!first)throw Error('The chat isn’t connected any more.');
   const check=await globalThis.TylerSteamChat.request(first,'upload-check',{}).catch(()=>null);
   if(check?.limited===true)throw Error('LIMITED_ACCOUNT');
   if(check&&check.available===false)throw Error('Steam’s image upload isn’t available in this chat. Reload Steam chat and try again.');
   const style=I.STYLES[job.style],model=job.style==='pc'?(local.label||'this PC'):(cfg.models[job.style]||'?');
   if(!job.owner)say('🎨 Drawing “'+job.prompt.slice(0,80)+(job.prompt.length>80?'…':'')+'” for '+job.who.name+' ('+style.label+')…');
   status((job.owner?'Drawing your picture':'Drawing for '+job.who.name)+' with '+model+'…'+(job.style==='pc'?' (on this PC: about a minute on a graphics card, many minutes on the processor)':''));
   if(job.owner){$('imgDrawStop').hidden=false;$('imgDraw').disabled=true;}
   const r=await chrome.runtime.sendMessage({type:'image:generate',style:job.style,prompt:job.prompt,speaker:job.who.speaker,names:await names(first),...(job.owner?{fromPanel:true}:{})});
   if(!r?.ok)throw Error(r?.error||'The image request failed.');
   if(api.isAiPaused?.())throw Error('Cancelled: AI was paused.');if(job.owner?job.scope!==(api.getChatScope?.()||''):job.epoch!==chatEpoch)throw Error('Cancelled: the chat changed.');
   // Any message of this chat leads to Steam's uploader (the one picked in setup may have scrolled away).
   const anchor=anchorNow();if(!anchor)throw Error('The chat isn’t connected any more.');
   status('Posting the picture to Steam…');
   await globalThis.TylerSteamChat.request(anchor,'image-upload',{data:r.image,type:r.mediaType,spoiler:r.spoiler===true});
   if(!job.owner)sessionCount++;counts();
   status('Posted '+(job.owner?'your picture':'for '+job.who.name)+' · '+r.model+' · '+(r.provider==='local'?'free':r.cost?(r.estimated?'about ':'')+'$'+Number(r.cost).toFixed(3):'cost not reported')+' · '+(r.ms/1000).toFixed(1)+' s'+(r.spoiler?' · posted as a spoiler':''));
   if(job.owner)$('imgDrawPrompt').value='';
   api.emit?.('image',{style:job.style,model:r.model,ms:r.ms,cost:r.cost});
  }catch(e){
   const why=String(e.message||e).replace(/^(?:OpenRouter|Venice) \d{3}: /,'').slice(0,160);
   // A request that never produced a picture doesn't count against the person.
   const p=job.owner?null:people.get(job.who.key);if(p&&p.count>0)p.count--;counts();
   if(isLimited(e)){const waiting=queue.splice(0);block();if(!job.owner)say('🎨 Sorry '+job.who.name+', '+LIMITED_CHAT);for(const w of waiting){const q=people.get(w.who.key);if(q&&q.count>0)q.count--;}counts();return;}
   // Tyler's image rules: the chat gets a short line; the panel gets the whole reason.
   const ruled=/^Tyler won’t make this image/.test(String(e.message||''));
   if(!job.owner&&!/AI was paused|^Image cancelled/.test(why))say(ruled?'🎨 Sorry '+job.who.name+', Tyler won’t draw that (his image rules: nothing sexual involving minors or real people).':'🎨 Couldn’t draw that for '+job.who.name+': '+why);
   status('Not posted: '+(ruled?String(e.message).slice(0,600):why));
  }finally{busy=false;jobStarted=0;if(job.owner){$('imgDrawStop').hidden=true;$('imgDraw').disabled=false;}if(queue.length)setTimeout(()=>void next(),300);}
 }
 function watch(){
  if(!api.isOwner?.()||!cfg.enabled){const friends=queue.some(j=>!j.owner);if(observer||friends){watchEpoch++;chatEpoch++;observer?.disconnect();observer=null;region=null;for(let i=queue.length-1;i>=0;i--)if(!queue[i].owner)queue.splice(i,1);}return;}
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
    const m=globalThis.TylerIdentity?.meta?.(node);if(!m?.self)noteName(node);if(m?.self||TylerChatTag.own(line,m))continue;
    if(m?.at&&m.at<boundAt-5000)continue; // Steam re-drawing older history isn't a new request
    if(m?.key){if(answered.has(m.key))continue;answered.add(m.key);if(answered.size>500)answered.delete(answered.values().next().value);}
    for(const l of line.split('\n').map(x=>x.trim()).filter(Boolean).slice(0,3))if(I.parse(l))void handleLine(l,node);
   }
  });
  observer.observe(region,{subtree:true,childList:true,characterData:true});
 }
 // The owner's Draw box: this PC's images, posted in the chat like !image (no chat limits: it's the owner's own).
 $('imgDraw').onclick=e=>{
  // Only a real click (or key press) on the box counts: a script on the page can't make a request the owner's.
  if(e?.isTrusted!==true)return;
  const prompt=String($('imgDrawPrompt').value||'').replace(/\s+/g,' ').trim();
  if(prompt.length<2){status('Describe the picture first.');return;}
  if(!local.available){status('Images on this PC are part of the ROBOTIC TYLER desktop app.');return;}
  if(!local.ready){status(local.problem||'Set up images on this PC in Settings → AI & personality → AI on this PC first.');return;}
  if(blocked==='limited'){status(LIMITED_PANEL);return;}
  if(queue.some(j=>j.owner)||(busy&&queue.length>=3)){status('Your picture is already waiting.');return;}
  queue.unshift({style:'pc',prompt:prompt.slice(0,600),who:{name:'you',key:'owner',speaker:null},owner:true,scope:api.getChatScope?.()||''});
  status(busy?'Your picture is next.':'Starting your picture…');void next();
 };
 $('imgDrawStop').onclick=()=>{for(let i=queue.length-1;i>=0;i--)if(queue[i].owner)queue.splice(i,1);if(busy)chrome.runtime.sendMessage({type:'image:cancel'}).catch(()=>{});status('Stopped.');};
 api.onPause?.(()=>{queue.length=0;if(busy)chrome.runtime.sendMessage({type:'image:cancel'}).catch(()=>{});status('Paused: the image being drawn and the queue were cancelled.');});
 setInterval(()=>{if(busy&&jobStarted&&Date.now()-jobStarted>200000){status('Still waiting for the picture after 3 minutes…');}},10000);
 void refreshConfig().then(watch);setInterval(watch,1400);setInterval(()=>void refreshConfig(),30000);
 panel.addEventListener('toggle',()=>{if(panel.open)void refreshConfig();});
 globalThis.TylerImageGen=Object.freeze({refresh:refreshConfig,state:()=>({enabled:cfg.enabled,busy,queued:queue.length,session:sessionCount})});
})();

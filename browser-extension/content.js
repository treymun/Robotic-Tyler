// ROBOTIC TYLER in-chat panel shell (isolated world).
// Owns the shadow root, tabs, status tally, HUD, lease ownership, the chat
// targets (composer / history region) and the TylerCompanion API that every
// feature module mounts through. Shared by Chrome and the desktop preload.
(() => {
 'use strict';
 if(document.getElementById('tyler-companion-root'))return;
 const platform=globalThis.TylerPlatform||{id:'chrome',label:'Chrome · voice + chat',voice:true};

 // ── Shadow root ──────────────────────────────────────────────────────────
 const host=document.createElement('div');host.id='tyler-companion-root';document.documentElement.append(host);
 const root=host.attachShadow({mode:'closed'});
 const ui=globalThis.TylerUI;
 let sheet=null;
 try{sheet=new CSSStyleSheet();sheet.replaceSync(ui.css);root.adoptedStyleSheets=[sheet];root.innerHTML=ui.html;}
 catch{root.innerHTML=ui.markup;} // older engines: inline <style>
 const $=id=>root.getElementById(id);
 const panel=root.querySelector('.panel');
 panel.dataset.platform=platform.id;panel.dataset.voice=String(platform.voice!==false);
 $('platformChip').textContent=platform.label;
 // Theme (v2.7+), chosen in Settings: steam (default), classic (2004), tf2, cs2, portal.
 // The attribute sits on each Tyler window; ui/classic.css keys off it.
 const THEMES=['steam','classic','tf2','cs2','portal','cs16','hev','l4d','winxp','doom','quake','pipboy','combine','deadlock','minecraft','payday','dreamcast','gmod','ricochet','dod','rust','x360','ipod','msn','xmb'];
 let uiTheme='steam';const themed=new Set([panel]);
 // Each theme has its own Tyler logo (ui-logos.js); the vector logo stays until it's drawn.
 const mark=root.querySelector('.mark'),markArt=root.querySelector('.mark-art');
 const paintLogo=()=>globalThis.TylerLogos?.paint(markArt,uiTheme).then(ok=>{if(!ok)return;const first=!mark.dataset.logo;mark.dataset.logo=uiTheme;if(first)return globalThis.TylerLogos.paint(markArt,uiTheme);}).catch(()=>{});
 const setTheme=value=>{const next=THEMES.includes(value)?value:'steam';uiTheme=next;globalThis.TylerFonts?.load(uiTheme);for(const el of themed)if(el.isConnected||el===panel)el.dataset.rtTheme=uiTheme;paintLogo();emit?.('theme',{theme:next});};
 const themeElement=el=>{if(!el)return;themed.add(el);el.dataset.rtTheme=uiTheme;};
 // UI events for theme features (theme-features.js, v2.20): state, theme, tab, hud, mini, reply,
 // chat, sound, music. Listeners are isolated-world code only; nothing here reaches Steam's page.
 const uiListeners=new Set();
 const emit=(type,data={})=>{for(const fn of uiListeners){try{fn(type,data);}catch(error){console.warn('[ROBOTIC TYLER] theme feature:',error?.message||error);}}};
 setTheme('steam');
 globalThis.TylerStorage?.get(['uiTheme']).then(v=>setTheme(v?.uiTheme)).catch(()=>{});
 globalThis.TylerStorage?.onChanged?.addListener(changes=>{if(changes.uiTheme)setTheme(changes.uiTheme.newValue);});

 let hush=0;
 const PAGE_ID=Date.now().toString(36)+'-'+Math.random().toString(36).slice(2,10);
 let chatHint=null,discovery={},armedAt=0,sampleElement=null,composer=null,region=null,observer=null,armed=false,pending=false,lastResult='',epoch=0;
 let lastNodes=new WeakMap();const echoes=new Set();
 let owner=false,voiceReport=null,incomingReport=null,autoActive=false,voiceWaiters=[],lastChatFocus=null,lastHudActionStart=0;
 document.addEventListener('focusin',e=>{if(!e.composedPath().includes(host)&&e.target.matches?.('textarea,[contenteditable="true"],[role="textbox"]'))lastChatFocus=e.target;},true);

 // ── Status tally + session-only signal trail (never logs chat text) ─────
 let previousLabel;
 function traceState(label,note=false){
  if(!note){if(label===previousLabel)return;previousLabel=label;} // a note (v2.41, api.trace) isn't a state change
  const list=$('trail');list.querySelector('.trail-empty')?.remove();
  const line=document.createElement('li'),badge=document.createElement('b'),time=document.createElement('time');
  badge.textContent=label;time.textContent=new Date().toLocaleTimeString([],{hour:'2-digit',minute:'2-digit',second:'2-digit'});
  line.append(badge,time);list.prepend(line);
  while(list.children.length>8)list.lastElementChild.remove();
 }
 // Status strings arrive as "LISTENING — speak normally". The tally already shows
 // the state label, so drop a duplicate prefix and sentence-case any other one.
 function displayText(text,label){
  const m=/^([A-Z][A-Z ]{1,24}[A-Z])\s+[—-]\s+(.*)$/s.exec(String(text||''));if(!m)return String(text||'');
  const word=m[1].toLowerCase();
  if(word===String(label).toLowerCase())return m[2].charAt(0).toUpperCase()+m[2].slice(1);
  return word.charAt(0).toUpperCase()+word.slice(1)+' — '+m[2];
 }
 // Themed notifications, dialogs and tooltips inside the panel (ui-kit.js).
 const kit=globalThis.TylerKit?.attach(panel)||null;kit?.tips(root);
 const notify=opts=>kit?kit.toast(opts):null;
 const confirmBox=opts=>kit?kit.dialog(opts):Promise.resolve(window.confirm([opts?.title,opts?.text].filter(Boolean).join('\n\n')));
 // "Needs attention" states also raise a notification with the most useful next step.
 let lastProblem='';
 function problemAction(text){
  if(/another .*tab|standby|claim this tab/i.test(text))return {label:'Use this tab',run:()=>$('takeover')?.click()};
  if(/key|provider|openrouter|gemini|api/i.test(text))return {label:'Open settings',run:()=>$('settings')?.click()};
  if(/message box|chat|composer|selected|connect/i.test(text))return {label:'Open setup',run:()=>showTab('setup')};
  return {label:'Run checks',run:()=>showTab('checks')};
 }
 const setActivity=text=>{
  const [state,label]=TylerUIState(text);
  if(state==='error'){const shown=displayText(text,label);if(shown!==lastProblem){lastProblem=shown;notify({kind:'error',title:label,text:shown,action:problemAction(shown)});}}else lastProblem='';
  $('activity').textContent=displayText(text,label);
  const before=$('activityCard').dataset.state;
  $('activityCard').dataset.state=state;$('activityLabel').textContent=label;
  traceState(label);emit('state',{state,label,text:displayText(text,label),before});
 };
 const status=s=>{$('status').textContent=s;if(!autoActive)setActivity(s);};

 // ── HUD (voice · spend · latency) ───────────────────────────────────────
 const hudState={voice:'Idle',voiceMeta:'Not checked yet',spend:'$0.0000',spendMeta:'Reported by provider',latency:'—',latencyMeta:'None yet'};
 function setHud(partial={}){
  Object.assign(hudState,partial);
  for(const key of ['voice','spend','latency']){
   const name=key[0].toUpperCase()+key.slice(1);
   $('hud'+name).textContent=hudState[key];$('hud'+name+'Meta').textContent=hudState[key+'Meta'];
  }
  emit('hud',{...hudState});
 }
 function showUsage(usage={}){
  const compact=new Intl.NumberFormat('en',{notation:'compact',maximumFractionDigits:1});
  const tokens=Number(usage.promptTokens||0)+Number(usage.completionTokens||0),requests=Number(usage.requests||0);
  setHud({spend:'$'+Number(usage.reportedCostUSD||0).toFixed(4),spendMeta:compact.format(tokens)+' tokens'});
  $('hudSpendMeta').title=requests.toLocaleString()+' requests · '+tokens.toLocaleString()+' tokens';
 }
 async function refreshHudUsage(){try{const {usage={}}=await TylerStorage.get('usage');showUsage(usage);}catch{}}
 // Usage is pushed by the background on change; no polling loop.
 TylerStorage.onChanged?.addListener((changes,area)=>{if(area!=='local')return;if(changes.usage)showUsage(changes.usage.newValue||{});if(changes.v22Latency)renderLatency(changes.v22Latency.newValue);});
 refreshHudUsage();

 // ── Voice reply timing (Checks tab): where each spoken reply spent its time ─
 const seconds=ms=>Number.isFinite(ms)?(ms/1000).toFixed(1)+' s':'?';
 function renderLatency(samples){
  const list=(Array.isArray(samples)?samples:[]).filter(s=>s&&Number.isFinite(s.totalMs)).slice(-8);
  const chart=$('latencyChart'),summary=$('latencySummary');chart.replaceChildren();
  if(!list.length){summary.textContent='No voice turns yet. Timing appears after Tyler answers someone in voice.';return;}
  const max=Math.max(...list.map(s=>Math.max(s.totalMs,s.firstAudioMs||0)),1);
  for(const s of list.slice().reverse()){
   const row=document.createElement('div'),time=document.createElement('span'),track=document.createElement('div'),total=document.createElement('span');
   row.className='lat-row';time.className='lat-time';track.className='lat-track';total.className='lat-total';
   time.textContent=new Date(s.at).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'});
   let used=0;
   for(const [kind,ms] of [['stt',s.sttMs],['think',s.thinkMs],['speech',s.speechMs]]){if(!Number.isFinite(ms)||ms<=0)continue;const seg=document.createElement('i');seg.className='seg-'+kind;seg.style.width=(ms/max*100)+'%';track.append(seg);used+=ms;}
   if(s.totalMs>used){const seg=document.createElement('i');seg.className='seg-other';seg.style.width=((s.totalMs-used)/max*100)+'%';track.append(seg);}
   const first=Number.isFinite(s.firstAudioMs)?s.firstAudioMs:s.totalMs;
   const mark=document.createElement('b');mark.className='lat-first';mark.style.left=Math.min(100,first/max*100)+'%';track.append(mark);
   total.textContent=seconds(first);
   row.title='Transcribing '+seconds(s.sttMs)+' · thinking '+seconds(s.thinkMs)+' · making speech '+seconds(s.speechMs)+' · started talking at '+seconds(first)+(s.early?' (first sentence early)':'');
   row.setAttribute('aria-label',row.title);row.append(time,track,total);chart.append(row);
  }
  const firsts=list.map(s=>Number.isFinite(s.firstAudioMs)?s.firstAudioMs:s.totalMs),avg=firsts.reduce((a,b)=>a+b,0)/firsts.length,early=list.filter(s=>s.early).length;
  summary.textContent='Tyler starts talking '+seconds(avg)+' after he hears you finish, on average over the last '+list.length+(list.length===1?' voice reply.':' voice replies.')+(early?' The first sentence started early in '+early+' of them.':'');
 }
 TylerStorage.get('v22Latency').then(({v22Latency})=>renderLatency(v22Latency)).catch(()=>{});

 // ── Collapse ────────────────────────────────────────────────────────────
 // Expanding plays a short theme-neutral motion (panel.css :host(.expanding)); one timer, reset on every toggle.
 let expandTimer=0;
 function setMini(mini){
  const was=host.classList.contains('mini');
  host.classList.toggle('mini',mini);
  clearTimeout(expandTimer);host.classList.remove('expanding');
  if(was&&!mini){host.classList.add('expanding');expandTimer=setTimeout(()=>host.classList.remove('expanding'),260);}
  const b=$('collapse');b.setAttribute('aria-expanded',String(!mini));
  b.setAttribute('aria-label',mini?'Expand panel':'Collapse panel');
  emit('mini',{mini});
  b.innerHTML=mini?'<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3.5 8h9M8 3.5v9" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>':'<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3.5 8h9" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>';
 }
 $('collapse').onclick=()=>setMini(!host.classList.contains('mini'));
 document.addEventListener('keydown',e=>{if(e.ctrlKey&&e.shiftKey&&e.code==='KeyU'&&!e.repeat&&!e.target.closest?.('input,textarea,[contenteditable=true]')){e.preventDefault();setMini(!host.classList.contains('mini'));}},true);

 // ── Tabs ────────────────────────────────────────────────────────────────
 const TABS=['conversation','room','soundboard','setup','checks'];
 let currentTab='conversation';const scrollPositions={};
 const showTab=name=>{
  if(!TABS.includes(name))return;
  const scroll=root.querySelector('.scroll'),targetScroll=name===currentTab?scroll.scrollTop:scrollPositions[name]||0;
  if(name!==currentTab){scrollPositions[currentTab]=scroll.scrollTop;currentTab=name;}
  for(const b of root.querySelectorAll('[data-tab]')){const active=b.dataset.tab===name;b.setAttribute('aria-selected',String(active));b.tabIndex=active?0:-1;}
  for(const view of root.querySelectorAll('[data-view]'))view.hidden=view.dataset.view!==name;
  scroll.scrollTop=targetScroll;
  emit('tab',{tab:name});
 };
 for(const button of root.querySelectorAll('[data-tab]')){
  button.onclick=()=>showTab(button.dataset.tab);
  button.onkeydown=e=>{
   const tabs=[...root.querySelectorAll('[data-tab]')];let index=tabs.indexOf(button);
   if(e.key==='ArrowRight')index=(index+1)%tabs.length;else if(e.key==='ArrowLeft')index=(index+tabs.length-1)%tabs.length;
   else if(e.key==='Home')index=0;else if(e.key==='End')index=tabs.length-1;else return;
   e.preventDefault();showTab(tabs[index].dataset.tab);tabs[index].focus();
  };
 }
 const pauseHooks=new Set();let userPaused=false;
 $('quickStop').onclick=()=>{userPaused=true;globalThis.TylerCompanion.cancelSetup?.();globalThis.TylerCompanion.stopAutomatic?.('Paused by you');try{Promise.resolve(chrome.runtime.sendMessage({type:'local-ai:release'})).catch(()=>{});}catch{}globalThis.TylerCompanion.stopLive?.('Live voice stopped by you.');
  // v2.33: the !tyler watcher too (it kept answering, and billing, while the panel said Paused).
  if(armed){armed=false;globalThis.TylerCommands?.set('tyler',{enabled:false});epoch++;observer?.disconnect();observer=null;}
  for(const fn of pauseHooks){try{fn();}catch{}}};

 // ── Tab lease: one Steam tab runs the bot ───────────────────────────────
 function setOwner(value){
  owner=value;$('leaseBanner').hidden=value;panel.dataset.owner=String(value);
  $('footerState').textContent=value?'This tab runs the bot':'Standby · another tab is active';
  if(!value){globalThis.TylerCompanion.stopAutomatic?.('Another tab owns the bot');pause();bridge('stop');setActivity('Standby — another Steam tab is running this bot.');}
 }
 async function claim(takeOver=false){try{const r=await chrome.runtime.sendMessage({type:'lease:claim',takeOver,instance:PAGE_ID});setOwner(!!r.owner);if(r.owner)setActivity('Ready — use Connect & start.');}catch(e){setActivity('Could not claim this tab: '+e.message);}}
 async function checkLease(){try{const r=await chrome.runtime.sendMessage({type:'lease:check'});if(r.owner!==owner)setOwner(!!r.owner);}catch{}}
 $('takeover').onclick=()=>claim(true);void claim();
 // The worker pushes 'tyler-lease-lost' on takeover, so this is only a safety
 // net (e.g. after a worker restart). A slow cadence lets the MV3 service worker
 // go idle; focus/visibility re-checks keep it responsive when you return.
 setInterval(checkLease,20000);
 document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')void checkLease();});
 chrome.runtime.onMessage.addListener(m=>{if(m?.source==='tyler-lease-lost')setOwner(false);});

 // ── MAIN-world audio bridge ─────────────────────────────────────────────
 function bridge(type,extra={}){if(!owner&&!['stop','board-stop','status','music-disconnect','tab-awake'].includes(type)){status('This tab is on standby. Use this tab instead to take over.');return;}window.postMessage({source:'tyler-audio-command',type,...extra},location.origin);}
 window.addEventListener('message',e=>{
  if(e.source!==window||e.origin!==location.origin||e.data?.source!=='tyler-audio-status')return;
  status(e.data.text);const v=e.data.voice;if(!v)return;voiceReport=v;
  if(v.enabled&&v.player==='running')for(const waiter of [...voiceWaiters])waiter.resolve(v);
  else if(e.data.ok===false)for(const waiter of [...voiceWaiters])waiter.reject(Error(e.data.text));
  $('voiceState').textContent='Voice connection: '+(v.enabled?'enabled':'off')+' · player '+v.player+' · microphone requests '+v.requests+' · Steam connections '+v.peers+' · sender attachments '+v.attached+'. An attachment still needs a meter/listening test.';
  setHud({voice:v.enabled?'Armed':'Off',voiceMeta:'Player '+v.player+' · '+v.peers+' peers · '+v.attached+' attached'});
 });
 async function request(m){if(!owner&&['command','voice','soundboard:play'].includes(m.type))return {ok:false,error:'Another tab runs the bot. Take over this tab in the banner first.'};return TylerRequest(msg=>chrome.runtime.sendMessage(msg),m);}
 async function ask(m){const r=await request(m);if(!r?.ok)throw Error(r?.error||'Extension disconnected. Reload Steam chat.');return r;}

 // ── Sending to Steam ────────────────────────────────────────────────────
 function rememberEcho(text){for(const line of text.split('\n'))echoes.add(line.trim());while(echoes.size>200)echoes.delete(echoes.values().next().value);}
 const boxText=()=>composer?.isConnected?(composer.matches('textarea,input')?composer.value:composer.textContent).trim():'';
 const until=(ok,ms)=>new Promise(resolve=>{const t0=Date.now(),step=()=>{if(ok())resolve(true);else if(Date.now()-t0>=ms)resolve(false);else setTimeout(step,100);};step();});
 async function deliver(text){
  if(!composer?.isConnected)throw Error('Choose the Steam message box first.');
  if(boxText()&&!await until(()=>!boxText(),10000))throw Error('There\'s a draft in the bot\'s message box, so the reply waited 10 s and was skipped. Clear the box (or send the draft) and Tyler carries on.');
  const before=document.activeElement,formatted=TylerChatTag.format(String(text).slice(0,1800));
  send(text);
  if(before&&before!==composer&&before!==document.body&&before.isConnected&&!host.contains(before))try{before.focus({preventScroll:true});}catch{}
  if(await until(()=>!boxText(),2500))return true;
  // Still in the box: Steam didn't send it. Remove only Tyler's own text, never something the user typed.
  if(boxText()===formatted.trim()){if(composer.matches('textarea,input')){const proto=composer.tagName==='TEXTAREA'?HTMLTextAreaElement.prototype:HTMLInputElement.prototype;Object.getOwnPropertyDescriptor(proto,'value').set.call(composer,'');composer.dispatchEvent(new Event('input',{bubbles:true}));}else{composer.focus();document.execCommand('selectAll');document.execCommand('delete');}}
  throw Error('Steam didn\'t send the reply (it stayed in the message box). Check that the chat is connected and you can type there.');
 }
 function send(text,opts={}){
  if(!composer?.isConnected)throw Error('Choose the Steam message box first.');
  // One formatting layer (chat-tag.js): any legacy prefix is cleaned off and the owner's name tag added once, or not at all.
  const formatted=TylerChatTag.format(String(text).slice(0,1800));if(!formatted)throw Error('Nothing to send.');composer.focus();
  if(composer.matches('textarea,input')){
   if(composer.value.trim())throw Error('The selected message box contains a draft. Clear it before sending.');
   const proto=composer.tagName==='TEXTAREA'?HTMLTextAreaElement.prototype:HTMLInputElement.prototype;
   Object.getOwnPropertyDescriptor(proto,'value').set.call(composer,formatted);composer.dispatchEvent(new Event('input',{bubbles:true}));
  }else{
   if(composer.textContent.trim())throw Error('The selected message box contains a draft. Clear it first.');
   document.execCommand('insertText',false,formatted);composer.dispatchEvent(new InputEvent('input',{bubbles:true,inputType:'insertText',data:formatted}));
  }
  rememberEcho(formatted);TylerChatTag.remember(formatted);emit('reply',{chars:formatted.length,kind:['game','image'].includes(opts?.kind)?opts.kind:'reply'});
  composer.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',code:'Enter',keyCode:13,which:13,bubbles:true}));
  composer.dispatchEvent(new KeyboardEvent('keyup',{key:'Enter',code:'Enter',keyCode:13,which:13,bubbles:true}));
  status('Submitted to the chosen message box. Confirm it appears in Steam; if it stays as a draft, press Enter manually.');
 }
 const formatMs=ms=>ms<1000?ms+' ms':(ms/1000).toFixed(1)+' s';
 // Automatic replies and Gemini Live report their timing here too (v2.20.1), so "Last reply"
 // shows real numbers in normal use, not only after a manual command.
 function reportTurn({ms,spoken=false,live=false}={}){
  const value=Math.max(0,Math.round(Number(ms)||0));if(!value)return;
  setHud({latency:formatMs(value),latencyMeta:(live?'Gemini Live · until he starts talking':(spoken?'Voice reply':'Text reply')+' · automatic')+' · '+new Date().toLocaleTimeString([],{hour:'numeric',minute:'2-digit'})});
  emit('report',{ms:value,spoken,live});
 }
 async function run(text,fromChat=false,testOnly=false){
  if(pending){status('Busy. Command skipped; try again after the current one finishes.');return;}
  pending=true;lastHudActionStart=Date.now();setHud({latency:'Working…',latencyMeta:'Processing command'});const current=epoch,quiet=hush;
  status('Handling command (AI may take up to 25 seconds, speech up to 20 more)…');
  try{
   const r=await ask({type:'command',text:text.replace(/^!tyler\s+/i,'').slice(0,1500),speak:!testOnly&&$('speak').checked});if(current!==epoch)return;
   if(r.text){lastResult=r.text;$('result').textContent=r.text;if(!testOnly&&$('autoSend').checked)send(r.text);}
   if(r.sound)bridge('sound',{sound:r.sound});if(quiet===hush)[r.firstAudio,r.audio,...(Array.isArray(r.moreAudio)?r.moreAudio:[])].filter(a=>typeof a==='string'&&a).forEach((a,i)=>bridge('audio',{audio:a,queue:i>0}));
   setHud({latency:formatMs(Date.now()-lastHudActionStart),latencyMeta:(r.audio?'Text + speech':'Text only')+(fromChat?' · auto':' · manual')});
   status(r.warning||'Command complete.');
  }catch(e){setHud({latency:'Error',latencyMeta:String(e.message||e).slice(0,60)});status(e.message);}
  finally{pending=false;}
 }
 function pause(){if(autoActive)globalThis.TylerCompanion.stopAutomatic?.('Paused while setup changes');armed=false;globalThis.TylerCommands?.set('tyler',{enabled:false});epoch++;observer?.disconnect();observer=null;status('Commands paused. In-flight results will be ignored.');}

 // ── Chat targets ────────────────────────────────────────────────────────
 async function checkAI(){try{const r=await ask({type:'connection'});if(r.chatTag)TylerChatTag.set(r.chatTag);const spoken=r.speechEngine==='theme'?'theme voice on this PC':r.speechEngine==='kokoro'?'Kokoro on this PC ('+r.speechVoice+')':r.speechVoice,heardBy=r.hearing==='local'?' Hearing: this PC.':'';
  // v2.39: hearing and a voice on this PC too: with all three local, a voice call needs no key.
  $('aiConnection').textContent=r.local?(r.keyConfigured?'Text replies are made on this PC: '+r.model+'.'+(r.hearing==='local'?' Hearing: this PC.':r.hearing?'':' Hearing: needs an OpenRouter or Google key, or Hearing → This PC in Settings → Voice.')+' Speech: '+(r.speechEngine!=='cloud'||r.cloudKey?spoken:'needs an OpenRouter or Google key')+'.'+(r.voiceNeedsKey===false?' No key needed.':''):(r.localProblem||'Text AI on this PC isn’t ready. Open Settings → AI & personality.')):r.keyConfigured?(r.provider||'OpenRouter')+' key saved. Brain: '+r.model+'.'+heardBy+' Speech: '+spoken+'.':'No key saved for the selected provider. Open personality & API settings.';const pick=$('previewVoice');if(Array.isArray(r.voices)&&r.voices.length){pick.replaceChildren(...r.voices.map(v=>{const o=document.createElement('option');o.value=v.value;o.textContent=v.label;return o;}));}pick.value=r.speechVoice||pick.options[0]?.value||'';}catch(e){$('aiConnection').textContent=e.message;}}
 function locateChat(){
  if(TylerSetup.visible(composer)&&TylerSetup.visible(region)&&sampleElement?.isConnected)return true;
  const found=TylerSelection.discover(document,lastChatFocus,chatHint);discovery={ambiguous:!!found.ambiguous,empty:!!found.empty};
  if(found.composer)composer=found.composer;if(found.sample&&found.region){sampleElement=found.sample;region=found.region;}
  $('setupCheck').textContent=region?.isConnected?'Chat connected. Preferences are reused on the next start.':'Tyler only asks for a click when a target is unclear.';
  return !!(TylerSetup.visible(composer)&&TylerSetup.visible(region)&&sampleElement?.isConnected);
 }
 function chooseTarget(kind,signal){return new Promise((resolve,reject)=>{
  const cleanup=()=>{document.removeEventListener('click',click,true);signal?.removeEventListener('abort',abort);};
  const abort=()=>{cleanup();reject(new DOMException('Setup cancelled','AbortError'));};
  const click=e=>{
   if(e.composedPath().includes(host))return;e.preventDefault();e.stopImmediatePropagation();
   try{
    if(kind==='input'){const chosen=TylerSelection.composer(e.target);if(!chosen||chosen.matches?.('input[type=search],input[type=password],input[type=checkbox],input[type=range]'))return;composer=chosen;lastChatFocus=chosen;locateChat();}
    else if(kind==='history'){const chosen=TylerSelection.message(e.target);if(!chosen.region||!chosen.sample)return;sampleElement=chosen.sample;region=chosen.region;}
    cleanup();resolve(['voice','message'].includes(kind)?e.target:true);
   }catch{status('That area could not be identified. Try the requested target.');}
  };
  if(signal?.aborted){abort();return;}signal?.addEventListener('abort',abort,{once:true});document.addEventListener('click',click,true);
 });}
 function prepareBridge(signal){return new Promise((resolve,reject)=>{
  let timer;const waiter={resolve:value=>{cleanup();resolve(value);},reject:error=>{cleanup();reject(error);}};
  const cleanup=()=>{clearTimeout(timer);voiceWaiters=voiceWaiters.filter(x=>x!==waiter);signal?.removeEventListener('abort',abort);};
  const abort=()=>waiter.reject(new DOMException('Setup cancelled','AbortError'));
  if(signal?.aborted){abort();return;}signal?.addEventListener('abort',abort,{once:true});voiceWaiters.push(waiter);
  timer=setTimeout(()=>waiter.reject(Error('Steam audio did not become ready. Allow sound for this tab and try Connect & start again.')),4500);bridge('enable');
 });}
 function connect(){
  pause();const found=TylerSelection.discover(document,lastChatFocus,chatHint);
  if(found.composer)composer=found.composer;if(found.sample&&found.region){sampleElement=found.sample;region=found.region;}
  const ready=TylerSelection.readiness(globalThis.TylerCompanion);$('setupCheck').textContent=ready;
  status(ready.startsWith('READY')?'Chat connected. Choose the voice list below, check its count, then start automatic mode.':'Automatic connection needs help. Open Connect to this chat and choose the missing target.');
  return ready;
 }

 // ── Setup & voice controls ──────────────────────────────────────────────
 $('connect').onclick=()=>globalThis.TylerCompanion.connectAndStart?.();
 $('previewVoice').onchange=async()=>{try{await ask({type:'preferences',values:{voice:$('previewVoice').value}});status('Voice saved for the next spoken reply.');}catch(e){status(e.message);}};
 $('preview').onclick=async()=>{
  if(pending){status('Wait for the current command to finish.');return;}pending=true;
  try{await ask({type:'preferences',values:{voice:$('previewVoice').value}});status('Generating local voice preview…');const r=await ask({type:'command',text:'say Hey, this is ROBOTIC TYLER. Ready when you are.'});if(!r.audio)throw Error(r.warning||'Preview unavailable');bridge('preview',{audio:r.audio});status('Voice preview playing locally.');}
  catch(e){status(e.message);}finally{pending=false;}
 };
 $('testText').onclick=()=>run('ask Reply with a short hello.',false,true);checkAI();window.addEventListener('focus',checkAI);
 $('settings').onclick=()=>chrome.runtime.sendMessage({type:'settings'});
 $('voiceCheck').onclick=()=>bridge('status');
 $('beep').onclick=()=>bridge('sound',{sound:'beep'});$('stop').onclick=()=>{hush++;globalThis.TylerCompanion.stopLive?.('Live voice stopped by you.');globalThis.TylerCompanion.cancelVoiceTurn?.();bridge('stop');};
 // v2.33: the master volume and "Hear bot audio on this PC too" are kept (they were lost on reload) and sent
 // to the bridge straight away, which holds them until it starts (they used to be dropped before Enable).
 function volume(save=true){const v={volume:Number($('volume').value),monitor:$('monitor').checked};bridge('volume',v);if(save===true)void globalThis.TylerStorage?.set?.({voiceMix:v}).catch(()=>{});}$('volume').oninput=volume;$('monitor').onchange=volume;
 globalThis.TylerStorage?.get?.(['voiceMix']).then(r=>{const v=r?.voiceMix;if(v&&typeof v==='object'){if(Number.isFinite(v.volume))$('volume').value=String(Math.max(0,Math.min(.7,v.volume)));$('monitor').checked=v.monitor===true;}}).catch(()=>{}).finally(()=>volume(false));
 $('clip').onchange=async()=>{const file=$('clip').files[0];if(!file)return;if(file.size>4000000){status('Choose a clip smaller than 4 MB.');return;}const reader=new FileReader();reader.onload=()=>bridge('audio',{audio:String(reader.result).split(',')[1]});reader.readAsDataURL(file);};

 // ── Manual commands ─────────────────────────────────────────────────────
 $('pause').onclick=pause;
 $('watch').onclick=()=>{
  if(!region?.isConnected||!composer?.isConnected){status('Choose the message box and a recent message first.');return;}
  pause();armed=true;armedAt=Date.now();globalThis.TylerCommands?.set('tyler',{enabled:true});lastNodes=new WeakMap();
  observer=new (globalThis.TylerChatBus?.Observer||MutationObserver)(records=>{
   if(!armed)return;
   if(!region.isConnected||!composer.isConnected){pause();status('Chat changed. Choose the new channel message box and history.');return;}
   const nodes=[];
   for(const record of records)for(const n of record.addedNodes){const element=n.nodeType===1?n:n.parentElement;if(element&&!nodes.some(x=>x===element||x.contains(element)))nodes.push(element);}
   for(const n of nodes){
    const text=globalThis.TylerChatBus?.text(n)??(n.innerText||n.textContent||'').trim();if(lastNodes.get(n)===text)continue;lastNodes.set(n,text);
    const meta=globalThis.TylerIdentity?.meta?.(n);if(meta?.self||(meta?.at&&meta.at<armedAt-5000)||TylerChatTag.own(globalThis.TylerChatBus?.text(n)??n.textContent,meta))continue;
    if(text.length>2000){pause();status('Large history change detected. Commands paused to avoid replaying old messages. Reconnect this chat.');return;}
    for(const line of text.split('\n').map(s=>s.trim()))if(/^!tyler\s+/i.test(line)&&!echoes.has(line))run(line,true);
   }
  });
  observer.observe(region,{childList:true,subtree:true});status('Watching new !tyler commands in the selected message region.');
 };
 $('run').onclick=()=>run($('command').value);
 $('send').onclick=()=>{try{if(!lastResult)throw Error('Run a command first.');send(lastResult);}catch(e){status(e.message);}};
 $('reset').onclick=async()=>{pause();try{const r=await ask({type:'reset',chatScope:globalThis.TylerSetup?.scope?.(region,document)});lastResult='';$('result').textContent=r.text;}catch(e){status(e.message);}};
 window.addEventListener('message',e=>{if(e.source!==window||e.origin!==location.origin)return;if(e.data?.source==='tyler-listener'&&e.data.type==='state')incomingReport=e.data;});

 // ── Systems check ───────────────────────────────────────────────────────
 // Full check (v2.20.1): every part Tyler needs, one pass, a summary first, and a plain-text report
 // to copy (no keys, no chat text) so a friend can send you exactly what failed.
 let lastReport='';
 $('diagnose').onclick=async()=>{
  const inputSnapshot=incomingReport;const button=$('diagnose');const wasRunning=autoActive&&owner;let inCall=false;globalThis.TylerCompanion.stopAutomatic?.('Paused for the full check');
  button.disabled=true;$('diagnostics').replaceChildren();$('hearingConfirm').hidden=true;$('copyReport').hidden=true;
  // data-result (v2.18) lets a theme mark each line: ok (✓), fail (!) or unknown (?).
  const result=t=>t.startsWith('✓')?'ok':t.startsWith('!')?'fail':'unknown';
  const lines=[];checkLines=lines;const summary=document.createElement('li');summary.className='check-summary';summary.dataset.result='unknown';
  const sb=document.createElement('b'),ss=document.createElement('span');sb.textContent='Checking…';ss.textContent='This takes a few seconds and uses one short AI request.';summary.append(sb,ss);$('diagnostics').append(summary);
  const row=(title,detail)=>{const li=document.createElement('li'),b=document.createElement('b'),span=document.createElement('span');li.dataset.result=result(title);b.textContent=title;span.textContent=detail;li.append(b,span);$('diagnostics').append(li);lines.push(title+' — '+detail);};
  const version=globalThis.TylerUI?.version||'';
  try{
   row('✓ ROBOTIC TYLER '+version,platform.label+(platform.voice===false?' (voice through the Windows audio helper)':''));
   row(owner?'✓ Active tab':'! Standby tab',owner?'Only this tab may answer or play clips.':'Take over this tab before testing AI/audio.');
   const ready=TylerSelection.readiness(globalThis.TylerCompanion);row(ready.startsWith('READY')?'✓ Chat reader ready':'! Chat needs setup',ready);
   if(platform.voice!==false){
    // v2.32.3: wait for this check's own answer (reading the counters can take longer than a moment).
    await new Promise(resolve=>{const done=()=>{clearTimeout(t);window.removeEventListener('message',on);resolve();},t=setTimeout(done,3000),
     on=e=>{if(e.source===window&&e.data?.source==='tyler-audio-status'&&e.data.text==='Voice connection checked.')done();};window.addEventListener('message',on);bridge('status');});
    const v=voiceReport||{};
    row(v.enabled?'✓ Tyler\'s microphone is on':'! Tyler\'s microphone is off',v.enabled?'Steam gets Tyler\'s own microphone ('+(v.requests||0)+' request'+(v.requests===1?'':'s')+' so far), never your real one.':'Press Connect & start (or Start live voice) before joining the voice channel.');
    // v2.32: the call as Steam itself sees it (voice-call.js): its own call state and, when it is
    // stuck or failed, the last lines of Steam's voice log, so it's clear which step stopped.
    const call=await globalThis.TylerVoiceCall?.diagnose?.().catch(()=>null);inCall=call?.state==='connected'||(!call||call.state==='unavailable')&&v.connectedPeers>0;
    // Steam's own call states (friendsui.js); 10 is Connected (v2.32.4).
    const STEP=n=>n>=10?'connected':n===9?'Steam telling the voice chat the connection is up':n===8?'waiting for Steam to let the bot into the call':n===7?'waiting for the connection to Steam\'s voice server':n>=4?'setting up the connection with Steam\'s voice server':n===3?'microphone only (not in a call)':n>=1?'getting the microphone':'not in a call';
    const STEAM_STATE=['None','ScheduledInitiate','RequestedMicAccess','LocalMicOnly','CreatePeerConnection','InitiatedWebRTCSession','UpdatingWebRTCSession','WaitingOnICEConnected','RequestedPermission','NotifyingVoiceChatOfWebRTCSession','Connected'];
    // v2.32.3: the encryption handshake (DTLS) and each connection's steps, as the browser reports them.
    const ALERT={10:'unexpected message',20:'bad record MAC',40:'handshake failure',42:'bad certificate',43:'unsupported certificate',47:'illegal parameter',50:'decode error',51:'decrypt error',70:'protocol version',71:'insufficient security',80:'internal error',109:'missing extension',110:'unsupported extension'};
    const named=s=>String(s||'').replace(/(sent|received) alert (\d+)/g,(m,w,n)=>m+(ALERT[n]?' ('+ALERT[n]+')':''));
    const stepText=list=>(list||[]).slice(-16).map(s=>(s.at/1000).toFixed(1)+' s '+({connection:'connection',ice:'ICE',dtls:'encryption',gathering:'gathering'}[s.what]||s.what)+' '+s.state+(s.extra?' ['+named(s.extra)+']':'')).join(' · ');
    const enc=r=>r?.dtls?' · encryption: '+(r.dtls.state||'unknown')+(r.dtls.role?' as '+r.dtls.role:'')+(r.dtls.version?', '+r.dtls.version:'')+(r.dtls.cipher?', '+r.dtls.cipher:'')+(r.route?' · route: '+r.route:''):'';
    const counters=ice=>ice?' · '+ice.checks+' connection check'+(ice.checks===1?'':'s')+' sent, '+ice.answers+' answered (this PC: '+(ice.local.join(', ')||'none')+'; Steam: '+(ice.remote.join(', ')||'none')+'; pairs: '+(Object.entries(ice.states||{}).map(([k,n])=>n+' '+k).join(', ')||'none')+')'+enc(ice):'';
    const recent=v.failure&&Date.now()-v.failure.at<10*60000?v.failure:null;
    // v2.41: who Auto routing counts in the call, and where that number came from (no names).
    {const occ=globalThis.TylerCompanion.getOccupancy?.();if(occ)row((occ.people===null?'? ':'✓ ')+'Who is in the call (Auto routing)',occ.text.replace(/\.?$/,'.'));}
    if(call&&call.state!=='unavailable'){
     row(call.state==='connected'?'✓ In the Steam voice call':call.state==='joining'||call.state==='failed'&&call.roomId?'! Steam is still connecting the call':'? Not in a voice call',
      call.state==='connected'?(call.room||'Voice')+(call.people?' · '+call.people+' other'+(call.people===1?'':'s'):' · nobody else yet')+'.':
      call.state==='joining'||call.state==='failed'&&call.roomId?'Stuck at: '+STEP(call.steamState||0)+(call.room?' ('+call.room+')':'')+'. Leave voice and join again; if it keeps stopping here with nothing changed in Tyler, it is on Steam\'s side.':
      'Press Join voice (Chat tab) or join the voice channel with the bot account, then run the check again.');
     if(call.state!=='connected'&&call.log?.length)row('? Steam\'s voice log',call.log.slice(-6).join(' · '));
     if(call.state!=='connected'&&(call.state==='joining'||call.roomId)){
      // v2.32.1: the browser's own counters say whether Steam's voice server answers at all.
      const ice=v.ice||recent?.report||null,steps=v.trace||recent?.steps||[];
      const reached=steps.some(s=>s.what==='ice'&&['connected','completed'].includes(s.state))||ice?.answers>0;
      const dtlsError=steps.findLast(s=>s.what==='dtls'&&s.state==='error');
      const dtlsFailed=ice?.dtls?.state==='failed'||steps.some(s=>s.what==='dtls'&&s.state==='failed')||!!dtlsError;
      const gaveUp=!reached&&steps.some(s=>s.what==='ice'&&['disconnected','failed'].includes(s.state));
      const blocked=!dtlsFailed&&(gaveUp||!!ice&&ice.checks>0&&ice.answers===0&&!reached);
      row(dtlsFailed?'! The encrypted voice connection failed':blocked?'! Steam\'s voice server isn\'t answering':'? Voice connection','Steam call step '+(call.steamState??'unknown')+(STEAM_STATE[call.steamState]?' ('+STEAM_STATE[call.steamState]+')':'')+' · connections: '+((v.peerStates||[]).join(', ')||'none yet')+counters(ice)+'.'+
       (dtlsFailed?' '+(reached?'The route to Steam\'s voice server worked (its connection checks were answered), then':'Then')+' setting up the call\'s encryption (DTLS) failed'+(dtlsError?.extra?': '+named(dtlsError.extra):'')+'. That handshake is between '+(platform.id==='desktop'?'ROBOTIC TYLER\'s built-in browser engine':'this browser')+' and Steam\'s voice server.':
        blocked?' Nothing came back from Steam\'s voice server'+(gaveUp?', and after about 15 s the browser stopped trying this connection':'')+'. If it works on another try, or other people can\'t join either, it is on Steam\'s side. If it never works in '+(platform.id==='desktop'?'ROBOTIC TYLER':'this browser')+' but does in another browser on this PC, check firewall, VPN and antivirus rules for it.':''));
      if(steps.length)row('? Connection steps',stepText(steps)+'.');
     }
     if(recent&&JSON.stringify(recent.steps)!==JSON.stringify(v.trace||[]))row('? Last connection problem',new Date(recent.at).toLocaleTimeString()+' · '+stepText(recent.steps)+counters(recent.report)+'.');
     if(call.state==='connected'&&v.ice)row('✓ Voice connection',v.ice.checks+' connection checks sent, '+v.ice.answers+' answered (this PC: '+(v.ice.local.join(', ')||'none')+'; Steam: '+(v.ice.remote.join(', ')||'none')+')'+enc(v.ice)+'.');
    }else{row(v.connectedPeers?'✓ In a Steam voice call':'? Not in a voice call',v.connectedPeers?v.connectedPeers+' voice connection'+(v.connectedPeers===1?'':'s')+' active.':'Join the voice channel with the bot account, then run the check again. Use Connect & start first, so the check can read Steam\'s own call state.');
     // v2.32.4: the connections' own record still shows when the chat isn't connected.
     if(v.trace?.length)row('? Voice connection','Connections: '+((v.peerStates||[]).join(', ')||'none open')+counters(v.ice)+' · steps: '+stepText(v.trace)+'.');
     if(recent&&JSON.stringify(recent.steps)!==JSON.stringify(v.trace||[]))row('? Last connection problem',new Date(recent.at).toLocaleTimeString()+' · '+stepText(recent.steps)+counters(recent.report)+'.');}
    row(v.attached?'✓ Outgoing audio attached':'! Outgoing audio not attached',v.attached?'A test beep still needs confirmation from your main account.':'Rejoin the voice channel after Connect & start. If it stays like this, reload Steam chat.');
    // Steam's codec settings for Tyler's audio and his send rate (v2.20.2): what the call allows.
    const codec=v.codec;if(codec?.codec)row('✓ Call audio: '+codec.codec.replace(/^opus$/i,'Opus')+(codec.kbps?' · '+codec.kbps+' kbps':''),'Steam\'s settings: '+(codec.fmtp||'none listed')+(/maxplaybackrate=(8|12|16|24)000/.test(codec.fmtp)?' (Steam limits the call\'s audio range; music loses its highest notes)':''));
    row(inputSnapshot?.tracks?'✓ Hearing the call':'? Incoming voice not verified',inputSnapshot?.tracks?inputSnapshot.tracks+' incoming voice track(s) seen.':'Start automatic mode with a friend in voice to check incoming tracks.');
    // v2.44: who's speaking in voice. On: what Steam's talking data looks like in this call (names of fields and
    // classes, with counts; never what anyone said), so one real call can confirm or correct how it's read.
    {const on=globalThis.TylerCompanion.voiceSpeakersOn?.();
     if(on===false)row('? Who is speaking in voice','Off in Settings → Voice → Standard voice: Tyler hears the call as one mix, as before.');
     else if(on){
      const rep=await new Promise(resolve=>{let t=0;const done=v=>{clearTimeout(t);window.removeEventListener('message',hear);resolve(v);},hear=e=>{if(e.source===window&&e.data?.source==='tyler-listener'&&e.data.type==='speakers-report')done(e.data);};t=setTimeout(()=>done(null),1500);window.addEventListener('message',hear);window.postMessage({source:'tyler-listener-control',type:'speakers-report',force:true},location.origin);});
      const used=!!rep?.report?.signals?.some(s=>s.switched),last=rep?.last;
      const audio=[rep?.learned?rep.learned+' track'+(rep.learned===1?'':'s')+' matched to Steam names':'',rep?.labels?rep.labels+' kept apart as Speaker N':''].filter(Boolean).join(', ')||'nothing measured yet this call';
      row((used?'✓ ':'? ')+'Who is speaking in voice',rep?'Each person\'s audio: '+audio+(last?' · last line: '+last.source+(last.how&&last.how!==last.source?' ('+last.how+')':''):'')+(rep.problem?' · meter problem: '+rep.problem:'')+'. '+(rep.text||''):'The voice listener didn\'t answer.');
     }}
   }
   const music=globalThis.TylerCompanion.musicStatus?.();
   if(music)row(music.sharing?(music.quality?.processed?'! Music DJ shared, but Chrome is processing it':'✓ Music DJ shared'):music.open?'? Music DJ not shared':'? Music DJ off',music.sharing?'The YouTube '+(platform.id==='desktop'?'window':'tab')+'\'s sound goes into the call'+(music.quality?(music.quality.processed?' with Chrome\'s microphone cleanup still on, so music may warble. Update Chrome, then press Share its audio again.':', untouched'+(music.quality.channels>1?' and in stereo':'')+(music.quality.bitrate?(music.quality.level==='auto'?', on Auto quality, now ':', at up to ')+Math.round(music.quality.bitrate/1000)+' kbps.':' at Steam\'s default rate.')+' If it stutters, type music quality low or medium in chat.'):'.'):music.open?'Press Start Music DJ again and share the YouTube '+(platform.id==='desktop'?'window':'tab')+'.':'Optional. Start it from Room → Music DJ.');
   const c=await ask({type:'connection'});
   row(c.keyConfigured?'✓ '+(c.local?'Text AI on this PC':c.provider+' key saved'):c.local?'! Text AI on this PC isn’t ready':'! No API key',c.keyConfigured?'Model: '+c.model+'. Testing it next…':c.local?(c.localProblem||'Install it in Settings → AI & personality.'):'Add a key in Settings → AI & personality.');
   if(owner&&c.keyConfigured){
    const started=performance.now();
    const text=await ask({type:'command',text:'ask Reply with one short sentence confirming you can respond.'}).catch(e=>({warning:e.message}));
    row(text.text?'✓ AI answered in '+formatMs(Math.round(performance.now()-started)):'! No AI reply',text.text?String(text.text).slice(0,80):(text.warning||'No response'));
    if(platform.voice!==false&&text.text){
     await new Promise(r=>setTimeout(r,3100));
     const speech=await ask({type:'command',text:'say Voice connection check.'}).catch(e=>({warning:e.message}));
     if(speech.audio){bridge('preview',{audio:speech.audio});row('✓ Speech works','A short preview plays here. The beep below checks that Steam hears Tyler.');}else row('! Speech failed',speech.warning||'No audio returned');
    }
   }
   if(owner&&voiceReport?.enabled&&inCall){bridge('sound',{sound:'beep'});$('hearingConfirm').hidden=false;}
   else if(owner&&voiceReport?.enabled&&platform.voice!==false)row('? Beep not tested','The bot isn\'t in a voice call, so nobody could hear it. Join voice and run the check again to test what Steam hears.');
  }catch(e){row('! Check stopped',e.message);}
  finally{
   button.disabled=false;summarize=()=>{
   const bad=[...$('diagnostics').children].filter(li=>li.dataset.result==='fail').length,unsure=[...$('diagnostics').children].filter(li=>li!==summary&&li.dataset.result==='unknown').length;
   summary.dataset.result=bad?'fail':unsure?'unknown':'ok';sb.textContent=bad?bad+' problem'+(bad===1?'':'s')+' found':unsure?'Working, '+unsure+' thing'+(unsure===1?'':'s')+' not verified':'All good';
   ss.textContent=bad?'Each "!" line says what to do. Copy the report and send it to whoever set Tyler up.':unsure?'"?" lines need a voice call or a friend to verify.':'Tyler is ready: chat, AI'+(platform.voice!==false?', speech and his microphone':'')+' all check out.';
   lastReport='ROBOTIC TYLER full check · '+new Date().toLocaleString()+'\n'+sb.textContent+'\n'+lines.join('\n');$('copyReport').hidden=false;
   emit('check',{problems:bad,unsure});};summarize();
   // v2.33: a session that was running carries on (the check only paused it).
   if(wasRunning&&owner&&!autoActive){row('✓ Tyler carries on','The check paused him while it ran; he is listening again.');summarize();void globalThis.TylerCompanion.startAutomatic?.();}
  }
 };
 let summarize=()=>{},checkLines=null;
 $('copyReport').onclick=async()=>{const b=$('copyReport');try{await navigator.clipboard.writeText(lastReport);b.textContent='Copied';}catch{const t=document.createElement('textarea');t.value=lastReport;root.append(t);t.select();try{document.execCommand('copy');b.textContent='Copied';}catch{b.textContent='Copy failed';}t.remove();}setTimeout(()=>{b.textContent='Copy report';},1800);};
 const note=text=>{$('hearingConfirm').hidden=true;const li=document.createElement('li');li.dataset.result=text.startsWith('✓')?'ok':'fail';li.textContent=text;$('diagnostics').append(li);checkLines?.push(text);summarize();};
 $('heardYes').onclick=()=>note('✓ Steam transmission confirmed by you');
 $('heardNo').onclick=()=>note('! Beep not received — enable bridge, rejoin voice, and check Steam mute/output settings.');

 // The name-tag settings follow Settings without a reload (they're among the non-secret keys relayed here).
 globalThis.TylerStorage?.onChanged?.addListener((changes,area)=>{if(area==='local'&&(changes.chatTagEnabled||changes.chatTagName)){const c=TylerChatTag.current;TylerChatTag.set({chatTagEnabled:changes.chatTagEnabled?changes.chatTagEnabled.newValue:c.enabled,chatTagName:changes.chatTagName?changes.chatTagName.newValue:c.name});}});
 chrome.runtime.sendMessage({type:'connection'}).then(r=>{if(r?.chatTag)TylerChatTag.set(r.chatTag);}).catch(()=>{});
 globalThis.TylerCompanion={send,deliver,pause,bridge,connect,setOffscreen:off=>{if(off)host.dataset.offscreen='1';else delete host.dataset.offscreen;emit('offscreen',{off:!!off});},isOffscreen:()=>!!host.dataset.offscreen,pauseAI:()=>$('quickStop').click(),onPause:fn=>{pauseHooks.add(fn);return ()=>pauseHooks.delete(fn);},
  getMount:()=>$('automaticMount'),getFeatureMount:()=>$('featureMount'),getSoundboardMount:()=>$('soundboardMount'),getSetupMount:()=>$('automaticSetupMount'),
  getQuickMount:()=>$('quickMount'),getQuickOptions:()=>$('quickOptions'),getStyleSheet:()=>sheet,themeElement,getTheme:()=>uiTheme,
  locateChat,chooseTarget,prepareBridge,getDiscovery:()=>discovery,setChatHint:v=>{chatHint=['text','voice-room'].includes(v)?v:null;},getChatKind:()=>composer?.isConnected?TylerSelection.kind(composer):null,getVoiceState:()=>voiceReport,getChatScope:()=>TylerSetup.scope(region,document),request,showTab,setActivity,
  notify,confirm:confirmBox,emit,trace:text=>traceState(String(text||'').slice(0,160),true),
  // Theme features (theme-features.js): the panel, live state and a subscription. Isolated world only.
  ui:{root,panel,host,onUI:fn=>{uiListeners.add(fn);return ()=>uiListeners.delete(fn);},state:()=>({state:$('activityCard').dataset.state,label:$('activityLabel').textContent,text:$('activity').textContent,tab:currentTab,hud:{...hudState},mini:host.classList.contains('mini'),theme:uiTheme,owner})},
  isOwner:()=>owner,setAutomaticActive:value=>{autoActive=value;if(value)userPaused=false;},isAiPaused:()=>userPaused,isAutomaticActive:()=>autoActive,reportTurn,getIncoming:()=>incomingReport,getComposer:()=>composer,getRegion:()=>region,getSample:()=>sampleElement,getEpoch:()=>epoch,
  platform};
})();

/* v2.2 emergency stop is local to the Chrome tab. */
chrome.runtime.onMessage.addListener(message=>{if(message?.type==='tyler:window-visible'){globalThis.TylerCompanion?.setOffscreen?.(message.visible===false);return;}if(message?.type==='tyler:pause-ai'){try{globalThis.TylerCompanion?.pauseAI?.();}catch(e){console.warn('Pause:',e.message);}return;}if(message?.type==='v22:stop'){try{globalThis.TylerCompanion?.stopAutomatic?.('Emergency stop');globalThis.TylerCompanion?.bridge?.('stop');globalThis.TylerCompanion?.pause?.();}catch(e){console.warn('Emergency stop:',e.message);}}});

/* v2.2 local command guide (Ctrl+Shift+H); does not post unsolicited chat. */
window.addEventListener('keydown',e=>{
 if(!(e.ctrlKey&&e.shiftKey&&e.key.toLowerCase()==='h'))return;
 const current=document.getElementById('tyler-v22-help');if(current){current.remove();return;}
 const host=document.createElement('div');host.id='tyler-v22-help';
 const shadow=host.attachShadow({mode:'closed'});
 const sheet=globalThis.TylerCompanion?.getStyleSheet?.();if(sheet)shadow.adoptedStyleSheets=[sheet];
 shadow.innerHTML='<aside class="panel help-card"><strong>Chat commands</strong><p><code>play trivia</code> · <code>trivia help</code> · <code>trivia categories</code><br><code>!trivia</code> · <code>!answer 1–4</code><br><code>!party start</code> / <code>join</code> / <code>teams</code> / <code>stop</code><br><code>!vote GAME</code></p><small>Available commands depend on enabled features and your Steam permissions. Press Ctrl+Shift+H again to close.</small></aside>';
 globalThis.TylerCompanion?.themeElement?.(shadow.querySelector('.panel'));
 document.body.append(host);e.preventDefault();
});

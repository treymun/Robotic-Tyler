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
 const THEMES=['steam','classic','tf2','cs2','portal','cs16','hev','l4d','winxp','doom'];
 let uiTheme='steam';const themed=new Set([panel]);
 // Each theme has its own Tyler logo (ui-logos.js); the vector logo stays until it's drawn.
 const mark=root.querySelector('.mark'),markArt=root.querySelector('.mark-art');
 const paintLogo=()=>globalThis.TylerLogos?.paint(markArt,uiTheme).then(ok=>{if(!ok)return;const first=!mark.dataset.logo;mark.dataset.logo=uiTheme;if(first)return globalThis.TylerLogos.paint(markArt,uiTheme);}).catch(()=>{});
 const setTheme=value=>{uiTheme=THEMES.includes(value)?value:'steam';globalThis.TylerFonts?.load(uiTheme);for(const el of themed)if(el.isConnected||el===panel)el.dataset.rtTheme=uiTheme;paintLogo();};
 const themeElement=el=>{if(!el)return;themed.add(el);el.dataset.rtTheme=uiTheme;};
 setTheme('steam');
 globalThis.TylerStorage?.get(['uiTheme']).then(v=>setTheme(v?.uiTheme)).catch(()=>{});
 globalThis.TylerStorage?.onChanged?.addListener(changes=>{if(changes.uiTheme)setTheme(changes.uiTheme.newValue);});

 let chatHint=null,discovery={},armedAt=0,sampleElement=null,composer=null,region=null,observer=null,armed=false,pending=false,lastResult='',epoch=0;
 let lastNodes=new WeakMap();const echoes=new Set();
 let owner=false,voiceReport=null,incomingReport=null,autoActive=false,voiceWaiters=[],lastChatFocus=null,lastHudActionStart=0;
 document.addEventListener('focusin',e=>{if(!e.composedPath().includes(host)&&e.target.matches?.('textarea,[contenteditable="true"],[role="textbox"]'))lastChatFocus=e.target;},true);

 // ── Status tally + session-only signal trail (never logs chat text) ─────
 let previousLabel;
 function traceState(label){
  if(label===previousLabel)return;previousLabel=label;
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
  $('activityCard').dataset.state=state;$('activityLabel').textContent=label;
  traceState(label);
 };
 const status=s=>{$('status').textContent=s;if(!autoActive)setActivity(s);};

 // ── HUD (voice · spend · latency) ───────────────────────────────────────
 const hudState={voice:'Idle',voiceMeta:'Bridge not checked',spend:'$0.0000',spendMeta:'Reported by provider',latency:'—',latencyMeta:'Waiting for a turn'};
 function setHud(partial={}){
  Object.assign(hudState,partial);
  for(const key of ['voice','spend','latency']){
   const name=key[0].toUpperCase()+key.slice(1);
   $('hud'+name).textContent=hudState[key];$('hud'+name+'Meta').textContent=hudState[key+'Meta'];
  }
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
 function setMini(mini){
  host.classList.toggle('mini',mini);
  const b=$('collapse');b.setAttribute('aria-expanded',String(!mini));
  b.setAttribute('aria-label',mini?'Expand panel':'Collapse panel');
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
 $('quickStop').onclick=()=>{globalThis.TylerCompanion.cancelSetup?.();globalThis.TylerCompanion.stopAutomatic?.('Paused by you');globalThis.TylerCompanion.stopLive?.('Live voice stopped by you.');};

 // ── Tab lease: one Steam tab runs the bot ───────────────────────────────
 function setOwner(value){
  owner=value;$('leaseBanner').hidden=value;panel.dataset.owner=String(value);
  $('footerState').textContent=value?'This tab runs the bot':'Standby · another tab is active';
  if(!value){globalThis.TylerCompanion.stopAutomatic?.('Another tab owns the bot');pause();bridge('stop');setActivity('Standby — another Steam tab is running this bot.');}
 }
 async function claim(takeOver=false){try{const r=await chrome.runtime.sendMessage({type:'lease:claim',takeOver});setOwner(!!r.owner);if(r.owner)setActivity('Ready — use Connect & start.');}catch(e){setActivity('Could not claim this tab: '+e.message);}}
 async function checkLease(){try{const r=await chrome.runtime.sendMessage({type:'lease:check'});if(r.owner!==owner)setOwner(!!r.owner);}catch{}}
 $('takeover').onclick=()=>claim(true);void claim();
 // The worker pushes 'tyler-lease-lost' on takeover, so this is only a safety
 // net (e.g. after a worker restart). A slow cadence lets the MV3 service worker
 // go idle; focus/visibility re-checks keep it responsive when you return.
 setInterval(checkLease,20000);
 document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')void checkLease();});
 chrome.runtime.onMessage.addListener(m=>{if(m?.source==='tyler-lease-lost')setOwner(false);});

 // ── MAIN-world audio bridge ─────────────────────────────────────────────
 function bridge(type,extra={}){if(!owner&&!['stop','board-stop','status','music-disconnect'].includes(type)){status('This tab is on standby. Use this tab instead to take over.');return;}window.postMessage({source:'tyler-audio-command',type,...extra},location.origin);}
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
 function send(text){
  if(!composer?.isConnected)throw Error('Choose the Steam message box first.');
  const formatted='[ROBOTIC TYLER] '+text.slice(0,1800);composer.focus();
  if(composer.matches('textarea,input')){
   if(composer.value.trim())throw Error('The selected message box contains a draft. Clear it before sending.');
   const proto=composer.tagName==='TEXTAREA'?HTMLTextAreaElement.prototype:HTMLInputElement.prototype;
   Object.getOwnPropertyDescriptor(proto,'value').set.call(composer,formatted);composer.dispatchEvent(new Event('input',{bubbles:true}));
  }else{
   if(composer.textContent.trim())throw Error('The selected message box contains a draft. Clear it first.');
   document.execCommand('insertText',false,formatted);composer.dispatchEvent(new InputEvent('input',{bubbles:true,inputType:'insertText',data:formatted}));
  }
  rememberEcho(formatted);
  composer.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',code:'Enter',keyCode:13,which:13,bubbles:true}));
  composer.dispatchEvent(new KeyboardEvent('keyup',{key:'Enter',code:'Enter',keyCode:13,which:13,bubbles:true}));
  status('Submitted to the chosen message box. Confirm it appears in Steam; if it stays as a draft, press Enter manually.');
 }
 const formatMs=ms=>ms<1000?ms+' ms':(ms/1000).toFixed(1)+' s';
 async function run(text,fromChat=false,testOnly=false){
  if(pending){status('Busy. Command skipped; try again after the current one finishes.');return;}
  pending=true;lastHudActionStart=Date.now();setHud({latency:'Working…',latencyMeta:'Processing command'});const current=epoch;
  status('Handling command (AI may take up to 25 seconds, speech up to 20 more)…');
  try{
   const r=await ask({type:'command',text:text.replace(/^!tyler\s+/i,'').slice(0,1500),speak:!testOnly&&$('speak').checked});if(current!==epoch)return;
   if(r.text){lastResult=r.text;$('result').textContent=r.text;if(!testOnly&&$('autoSend').checked)send(r.text);}
   if(r.sound)bridge('sound',{sound:r.sound});if(r.audio)bridge('audio',{audio:r.audio});
   setHud({latency:formatMs(Date.now()-lastHudActionStart),latencyMeta:(r.audio?'Text + speech':'Text only')+(fromChat?' · auto':' · manual')});
   status(r.warning||'Command complete.');
  }catch(e){setHud({latency:'Error',latencyMeta:String(e.message||e).slice(0,60)});status(e.message);}
  finally{pending=false;}
 }
 function pause(){if(autoActive)globalThis.TylerCompanion.stopAutomatic?.('Paused while setup changes');armed=false;globalThis.TylerCommands?.set('tyler',{enabled:false});epoch++;observer?.disconnect();observer=null;status('Commands paused. In-flight results will be ignored.');}

 // ── Chat targets ────────────────────────────────────────────────────────
 async function checkAI(){try{const r=await ask({type:'connection'});$('aiConnection').textContent=r.keyConfigured?(r.provider||'OpenRouter')+' key saved. Brain: '+r.model+'. Speech: '+r.speechVoice+'.':'No key saved for the selected provider. Open personality & API settings.';const pick=$('previewVoice');if(Array.isArray(r.voices)&&r.voices.length){pick.replaceChildren(...r.voices.map(v=>{const o=document.createElement('option');o.value=v.value;o.textContent=v.label;return o;}));}pick.value=r.speechVoice||pick.options[0]?.value||'';}catch(e){$('aiConnection').textContent=e.message;}}
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
 $('beep').onclick=()=>bridge('sound',{sound:'beep'});$('stop').onclick=()=>{globalThis.TylerCompanion.stopLive?.('Live voice stopped by you.');bridge('stop');};
 function volume(){bridge('volume',{volume:Number($('volume').value),monitor:$('monitor').checked});}$('volume').oninput=volume;$('monitor').onchange=volume;
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
    const meta=globalThis.TylerIdentity?.meta?.(n);if(meta?.self||(meta?.at&&meta.at<armedAt-5000))continue;
    if(text.length>2000){pause();status('Large history change detected. Commands paused to avoid replaying old messages. Reconnect this chat.');return;}
    for(const line of text.split('\n').map(s=>s.trim()))if(/^!tyler\s+/i.test(line)&&!echoes.has(line))run(line,true);
   }
  });
  observer.observe(region,{childList:true,subtree:true});status('Watching new !tyler commands in the selected message region.');
 };
 $('run').onclick=()=>run($('command').value);
 $('send').onclick=()=>{try{if(!lastResult)throw Error('Run a command first.');send(lastResult);}catch(e){status(e.message);}};
 $('reset').onclick=async()=>{pause();try{const r=await ask({type:'reset'});lastResult='';$('result').textContent=r.text;}catch(e){status(e.message);}};
 window.addEventListener('message',e=>{if(e.source!==window||e.origin!==location.origin)return;if(e.data?.source==='tyler-listener'&&e.data.type==='state')incomingReport=e.data;});

 // ── Systems check ───────────────────────────────────────────────────────
 $('diagnose').onclick=async()=>{
  const inputSnapshot=incomingReport;const button=$('diagnose');globalThis.TylerCompanion.stopAutomatic?.('Paused for connection checks');
  button.disabled=true;$('diagnostics').replaceChildren();$('hearingConfirm').hidden=true;
  const row=(title,detail)=>{const li=document.createElement('li'),b=document.createElement('b'),span=document.createElement('span');b.textContent=title;span.textContent=detail;li.append(b,span);$('diagnostics').append(li);};
  try{
   row(owner?'✓ Active tab':'! Standby tab',owner?'Only this tab may answer or play clips.':'Take over this tab before testing AI/audio.');
   const ready=TylerSelection.readiness(globalThis.TylerCompanion);row(ready.startsWith('READY')?'✓ Chat reader ready':'! Chat needs setup',ready);
   if(platform.voice!==false){
    bridge('status');await new Promise(r=>setTimeout(r,300));
    row(voiceReport?.attached?'✓ Outgoing sender attached':'! Outgoing audio not verified',voiceReport?.attached?'A test beep still needs confirmation from your main account.':'Enable bridge and rejoin Steam voice; then test the beep.');
    row(inputSnapshot?.tracks?'✓ Incoming tracks seen before checks':'? Incoming voice not verified',inputSnapshot?.tracks?inputSnapshot.tracks+' remote track(s) were seen. Checks pause AI; use the live meter afterwards to verify speech.':'Start automatic mode with a friend in voice to check incoming tracks.');
   }
   const c=await ask({type:'connection'});row(c.keyConfigured?'✓ Key configured':'! No API key',c.keyConfigured?'Testing API access next…':'Add the key in Personality & API settings.');
   if(owner&&c.keyConfigured){
    const text=await ask({type:'command',text:'ask Reply with one short sentence confirming you can respond.'});row(text.text?'✓ AI text responded':'! No text reply',text.text||text.warning||'No response');
    if(platform.voice!==false){
     await new Promise(r=>setTimeout(r,3100));
     const speech=await ask({type:'command',text:'say Voice connection check.'});
     if(speech.audio){bridge('preview',{audio:speech.audio});row('✓ Speech audio generated','A short preview plays locally. This does not prove Steam transmission.');}else row('! Speech failed',speech.warning||'No audio returned');
    }
   }
   if(owner&&voiceReport?.enabled){bridge('sound',{sound:'beep'});$('hearingConfirm').hidden=false;}
  }catch(e){row('! Check stopped',e.message);}
  finally{button.disabled=false;}
 };
 const note=text=>{$('hearingConfirm').hidden=true;const li=document.createElement('li');li.textContent=text;$('diagnostics').append(li);};
 $('heardYes').onclick=()=>note('✓ Steam transmission confirmed by you');
 $('heardNo').onclick=()=>note('! Beep not received — enable bridge, rejoin voice, and check Steam mute/output settings.');

 globalThis.TylerCompanion={send,pause,bridge,connect,
  getMount:()=>$('automaticMount'),getFeatureMount:()=>$('featureMount'),getSoundboardMount:()=>$('soundboardMount'),getSetupMount:()=>$('automaticSetupMount'),
  getQuickMount:()=>$('quickMount'),getQuickOptions:()=>$('quickOptions'),getStyleSheet:()=>sheet,themeElement,getTheme:()=>uiTheme,
  locateChat,chooseTarget,prepareBridge,getDiscovery:()=>discovery,setChatHint:v=>{chatHint=['text','voice-room'].includes(v)?v:null;},getChatKind:()=>composer?.isConnected?TylerSelection.kind(composer):null,getVoiceState:()=>voiceReport,getChatScope:()=>TylerSetup.scope(region,document),request,showTab,setActivity,
  notify,confirm:confirmBox,
  isOwner:()=>owner,setAutomaticActive:value=>autoActive=value,getComposer:()=>composer,getRegion:()=>region,getSample:()=>sampleElement,getEpoch:()=>epoch,
  platform};
})();

/* v2.2 emergency stop is local to the Chrome tab. */
chrome.runtime.onMessage.addListener(message=>{if(message?.type==='v22:stop'){try{globalThis.TylerCompanion?.stopAutomatic?.('Emergency stop');globalThis.TylerCompanion?.bridge?.('stop');globalThis.TylerCompanion?.pause?.();}catch(e){console.warn('Emergency stop:',e.message);}}});

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

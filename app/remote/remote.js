// Tyler's phone remote (v2.25), served by the desktop app on your home network (app/remote.cjs).
//
// v2.26: the page is a copy of Tyler's panel. It builds the panel from the panel's own markup and
// stylesheet (ui-template.js), draws the theme's Tyler logo (ui-logos.js), uses the panel's themed
// notifications (ui-kit.js), and runs the theme's real extras (theme-features.js and the theme packs)
// on the panel's UI events, which arrive from the PC as they happen (/events). So the status strip,
// its animations and each theme's instruments move in step with the PC.
//
// What the extras need from the panel comes from a stand-in (TylerCompanion below): Tyler's status
// from the PC, and their buttons (menus, hotkeys) send the same fixed list of actions as the
// remote's own buttons. Nothing is stored on the phone except the pairing cookie.
(() => {
 'use strict';
 const THEMES=['steam','classic','tf2','cs2','portal','cs16','hev','l4d','winxp','doom','quake','pipboy','combine','deadlock','minecraft','payday','dreamcast','gmod','ricochet','dod','rust','x360','ipod','msn','xmb'];
 const NAMES={steam:'Steam',classic:'Classic Steam (2004)',tf2:'Team Fortress 2',cs2:'Counter-Strike 2',portal:'Portal',cs16:'Counter-Strike 1.6',hev:'Half-Life HEV suit',l4d:'Left 4 Dead',winxp:'Windows XP',doom:'DOOM (classic)',quake:'Quake (1996)',pipboy:'Fallout Pip-Boy',combine:'Half-Life 2 Combine',deadlock:'Deadlock',minecraft:'Minecraft',payday:'PAYDAY 2',dreamcast:'Sega Dreamcast',gmod:'Garry’s Mod',ricochet:'Ricochet',dod:'Day of Defeat: Source',rust:'Rust',x360:'Xbox 360 (2005)',ipod:'iPod classic',msn:'MSN Messenger',xmb:'PlayStation 3 (XMB)'};
 const TABS=['conversation','room','soundboard','setup','checks'];
 const H={'content-type':'application/json','x-tyler-remote':'1'};
 const host=document.getElementById('tyler');
 const load=src=>new Promise((resolve,reject)=>{const s=document.createElement('script');s.src=src;s.async=false;s.onload=()=>resolve();s.onerror=()=>reject(Error('Couldn’t load '+src));document.head.append(s);});
 const icon=n=>globalThis.TylerIcons?.svg?.(n)||'';
 const listeners=new Set();
 const emit=(type,data={})=>{for(const fn of listeners){try{fn(type,data);}catch(e){console.warn('[Tyler remote]',e?.message||e);}}};
 let root=null,panel=null,kit=null,version='',theme='steam',offset=0,lastEventAt=0,fxLoaded=false,booting=null,currentTab='conversation',linkState='connecting';
 const $=id=>root?.getElementById(id);
 // What the copy shows, from the PC.
 const live={state:'ready',label:'Connecting',text:'',hud:{},voice:{armed:false,inCall:false,peers:0,attached:0},chat:false,sounds:[],favorites:[],fx:null,owner:true,paused:true,music:{}};
 const SLOT_ORDER=['voice','spend','latency'];

 // ── The panel's shell ─────────────────────────────────────────────────────
 const VIEWS=`
<section id="pairView" class="view" data-view="pair" hidden>
  <div class="view-head"><h2>Pair this phone</h2><p>On your PC, open Tyler's <b>Settings → Overview → Phone remote</b> and type the 6-digit code shown there, or scan its QR code with this phone's camera.</p></div>
  <form id="pairForm" autocomplete="off"><label>Pairing code<input id="code" class="rm-code" inputmode="numeric" pattern="[0-9 ]*" maxlength="7" placeholder="000 000" required></label>
  <button class="btn primary block" type="submit">${icon('check')}Pair</button></form>
  <p id="pairMsg" class="hint" role="status"></p>
</section>
<section id="view-conversation" class="view" role="tabpanel" aria-labelledby="tab-conversation" data-view="conversation">
  <button id="connect" class="btn primary block" type="button">${icon('play')}Connect &amp; start</button>
  <button id="rmPause" class="btn block" type="button" hidden>${icon('pause')}Pause AI</button>
  <p id="rmRunHint" class="hint">Tyler connects to the chat open on your PC.</p>
  <label class="field">Use Tyler for<select id="rmMode"><option value="auto">Auto: text when alone, voice when friends join</option><option value="text">Text conversation only</option><option value="voice">Voice conversation only</option></select></label>
  <small class="hint">A new mode starts the next time you press Connect &amp; start.</small>
  <details class="feature" open><summary><span class="feature-title">Say in chat</span><span class="feature-meta">Tyler types it</span></summary>
    <div class="feature-body"><form id="sayForm" class="btn-row" autocomplete="off"><input id="say" type="text" maxlength="300" placeholder="Tyler types this in the chat" aria-label="Message"><button class="btn primary" type="submit">Send</button></form></div></details>
  <details class="feature"><summary><span class="feature-title">Stay connected</span><span class="feature-meta">Quiet calls</span></summary>
    <div class="feature-body">
      <label class="check"><input id="rmKeepCall" type="checkbox"><span>Keep Tyler in quiet calls</span></label>
      <label class="field">Hum after<select id="rmKeepMinutes"><option value="15">15 quiet minutes</option><option value="30">30 quiet minutes</option><option value="45">45 quiet minutes</option><option value="55">55 quiet minutes</option></select></label>
      <label class="check"><input id="rmKeepChat" type="checkbox"><span>Keep the chat connected</span></label>
      <p id="rmKeepStatus" class="hint"></p>
    </div></details>
</section>
<section id="view-room" class="view" role="tabpanel" aria-labelledby="tab-room" data-view="room" hidden>
  <div class="view-head"><h2>Music DJ</h2><p id="rmNowPlaying">Music is off.</p></div>
  <button id="rmMusicStart" class="btn primary block" type="button">${icon('play')}Start Music DJ</button>
  <small id="rmMusicStartHint" class="hint">Opens the YouTube window on your PC and shares only its sound into the call.</small>
  <form id="musicForm" class="btn-row" autocomplete="off"><input id="query" type="search" maxlength="120" placeholder="Artist — song title" aria-label="Song or artist"><button class="btn primary" type="submit">Play</button></form>
  <div class="btn-row"><button id="musicSkip" class="btn" type="button">Skip</button><button id="musicEnd" class="btn danger" type="button">Stop music</button></div>
  <label class="field">Music volume <span class="field-note" id="rmMusicVolumeLabel"></span><input id="rmMusicVolume" type="range" min="0" max="200" step="5"></label>
  <label class="field">Sound quality<select id="rmMusicQuality"><option value="auto">Auto · lowers itself if the call drops audio</option><option value="high">High · 128 kbps</option><option value="medium">Medium · 64 kbps</option><option value="low">Low · about 32 kbps</option></select></label>
  <label class="check"><input id="rmMusicDuck" type="checkbox"><span>Lower the music while Tyler talks</span></label>
  <p id="rmMusicStatus" class="hint" role="status"></p>
</section>
<section id="view-soundboard" class="view" role="tabpanel" aria-labelledby="tab-soundboard" data-view="soundboard" hidden>
  <div class="board-top"><h2>Soundboard</h2><button id="boardStop" class="danger sm" type="button">${icon('stop')}Stop clips</button></div>
  <p class="hint">Tap a pad to play it to the room.</p>
  <div id="pads" class="pads"></div>
  <div class="board-tools"><label>${icon('sounds')}Clip volume <span class="field-note" id="rmClipVolumeLabel"></span><input id="rmClipVolume" type="range" min="0" max="1" step="0.05"></label></div>
  <p id="rmBoardStatus" class="hint" role="status"></p>
</section>
<section id="view-setup" class="view" role="tabpanel" aria-labelledby="tab-setup" data-view="setup" hidden>
  <div class="view-head"><h2>Theme</h2><p>Changes every Tyler window on your PC, and this remote.</p></div>
  <div id="rmThemes" class="rm-themes" role="group" aria-label="Theme"></div>
  <details class="feature" open><summary><span class="feature-title">Voice and playback</span><span class="feature-meta">On your PC</span></summary>
    <div class="feature-body">
      <label class="field">Tyler's voice volume <span class="field-note" id="rmVoiceVolumeLabel"></span><input id="rmVoiceVolume" type="range" min="0" max="0.7" step="0.05"></label>
      <label class="check"><input id="rmMuteCall" type="checkbox"><span>Mute the call in Tyler's window<small class="hint"> For when you're in the same call on Steam with your own account. Tyler still hears it.</small></span></label>
    </div></details>
  <details class="feature"><summary><span class="feature-title">This phone</span><span class="feature-meta" id="rmVersion"></span></summary>
    <div class="feature-body"><p id="device" class="hint"></p><button id="forget" class="btn ghost" type="button">Unpair this phone</button></div></details>
  <button id="settings" type="button" hidden></button>
</section>
<section id="view-checks" class="view" role="tabpanel" aria-labelledby="tab-checks" data-view="checks" hidden>
  <div class="view-head"><h2>Full check</h2><p>Checks chat, Tyler's microphone and the voice call, the Music DJ, your AI key and model, and speech, in one pass. Uses one short AI request and one speech preview; if Tyler's microphone is on, a beep plays in Steam voice.</p></div>
  <button id="diagnose" class="btn primary block" type="button">${icon('checks')}Run full check</button>
  <ul id="diagnostics" class="checklist"><li><b>Ready when you are</b><span>Connect your chat and voice first, then run the checks.</span></li></ul>
  <div id="hearingConfirm" class="confirm" hidden><p>Did your main account hear the test beep?</p><div class="btn-row"><button id="heardYes" class="btn" type="button">Yes, heard it</button><button id="heardNo" class="btn" type="button">No sound</button></div></div>
  <details class="feature"><summary><span class="feature-title">Individual tests</span><span class="feature-meta">Beep, voice</span></summary>
    <div class="feature-body"><div class="btn-row"><button id="beep" class="btn" type="button">Test beep in voice</button><button id="voiceCheck" class="btn" type="button">Refresh voice status</button></div><p id="voiceState" class="hint"></p></div></details>
  <details class="feature" open><summary><span class="feature-title">Signal trail</span><span class="feature-meta">This session</span></summary>
    <div class="feature-body"><ol id="trail" class="trail"><li class="trail-empty">State changes will appear here.</li></ol></div></details>
</section>`;

 async function build(){
  const UI=globalThis.TylerUI;if(!UI)throw Error('The panel didn’t load.');
  root=host.attachShadow({mode:'open'});
  const css=await fetch('/remote.css').then(r=>r.ok?r.text():'').catch(()=>'');
  try{const a=new CSSStyleSheet(),b=new CSSStyleSheet();a.replaceSync(UI.css);b.replaceSync(css);root.adoptedStyleSheets=[a,b];}
  catch{for(const text of [UI.css,css]){const st=document.createElement('style');st.textContent=text;root.append(st);}}
  const t=document.createElement('template');t.innerHTML=UI.html;
  panel=t.content.querySelector('.panel');panel.querySelector('#leaseBanner')?.remove();
  panel.querySelector('.scroll').innerHTML=VIEWS;
  panel.dataset.platform='desktop';panel.dataset.voice='true';panel.dataset.owner='true';panel.dataset.remote='connecting';
  panel.querySelector('#footerState').textContent='Tyler’s window on your PC';
  root.append(t.content);
  kit=globalThis.TylerKit?.attach(panel)||null;kit?.tips(root);
  wire();setTheme(theme,false);
 }

 // ── Theme ────────────────────────────────────────────────────────────────
 function setTheme(next,announce=true){
  const t=THEMES.includes(next)?next:'steam',changed=t!==theme||!panel?.dataset.rtTheme;theme=t;if(!panel)return;
  panel.dataset.rtTheme=t;host.dataset.rtTheme=t;document.documentElement.dataset.rtTheme=t;
  const mark=panel.querySelector('.mark'),art=panel.querySelector('.mark-art');
  globalThis.TylerLogos?.paint(art,t).then(ok=>{if(ok&&mark)mark.dataset.logo=t;}).catch(()=>{});
  requestAnimationFrame(()=>{const bar=getComputedStyle(panel.querySelector('.bar')).backgroundColor,meta=document.querySelector('meta[name=theme-color]');if(meta&&bar)meta.content=bar;document.body.style.background=getComputedStyle(panel).backgroundColor;});
  for(const b of root.querySelectorAll('.rm-theme'))b.setAttribute('aria-pressed',String(b.dataset.theme===t));
  if(announce&&changed&&fxLoaded)emit('theme',{theme:t});
 }

 // ── Status strip, numbers, footer ─────────────────────────────────────────
 function setActivity(state,label,text){
  const card=$('activityCard');if(!card)return;
  const before=card.dataset.state||'ready';
  card.dataset.state=state||'ready';$('activityLabel').textContent=label||'Ready';$('activity').textContent=text||'';
  live.state=card.dataset.state;live.label=label||'';live.text=text||'';
  if(fxLoaded)emit('state',{state:live.state,label:live.label,text:live.text,before});
 }
 function setHud(h={}){
  Object.assign(live.hud,h);
  for(const k of SLOT_ORDER){const name=k[0].toUpperCase()+k.slice(1);if(live.hud[k]!=null)$('hud'+name).textContent=live.hud[k];if(live.hud[k+'Meta']!=null)$('hud'+name+'Meta').textContent=live.hud[k+'Meta'];}
  if(fxLoaded)emit('hud',{...live.hud});
 }
 function setLink(state){
  linkState=state;const chip=$('platformChip');if(!chip)return;
  chip.textContent='Phone remote · '+({live:'Live',polling:'Connected',reconnecting:'Reconnecting…',lost:'PC not reachable',pc:'PC online',pair:'Not paired',connecting:'Connecting…'}[state]||'Connecting…');
  panel.dataset.owner=String(['live','polling'].includes(state)&&live.owner);panel.dataset.link=state;
 }

 // ── Controls ─────────────────────────────────────────────────────────────
 const editing=el=>!!el&&(root.activeElement===el||el.dataset.dragging==='true');
 const setValue=(id,v)=>{const el=$(id);if(el&&!editing(el)&&v!=null&&String(el.value)!==String(v))el.value=String(v);};
 const setCheck=(id,v)=>{const el=$(id);if(el&&el.dataset.dragging!=='true')el.checked=!!v;};
 const pct=v=>Math.round(Number(v)*100)+'%';
 let padsKey='',checksKey='',trailKey='';
 function renderControls(s){
  const c=s.controls||{};
  live.paused=!!s.paused;$('connect').hidden=!live.paused;$('rmPause').hidden=live.paused;
  $('rmRunHint').textContent=live.paused?'Tyler connects to the chat open on your PC.':'Tyler is running'+(s.automatic?' automatically':s.live?' in Live voice':'')+'. Pause AI stops his replies; Stop audio silences him.';
  // The panel's own footer note, about the Steam window on the PC ("this tab" means that window).
  $('footerState').textContent=String(s.footer||'Bot account · keep Tyler’s window open').replace(/^This tab\b/,'Tyler’s Steam window').replace(/keep this tab open/,'keep Tyler’s window open');
  setValue('rmMode',c.mode);
  if(c.keep){setCheck('rmKeepCall',c.keep.call);setCheck('rmKeepChat',c.keep.chat);setValue('rmKeepMinutes',c.keep.minutes);$('rmKeepMinutes').disabled=!c.keep.call;$('rmKeepStatus').textContent=c.keep.status||'';}
  // Music
  const m=s.music||{};live.music=m;nowPlaying();
  $('rmMusicStart').hidden=!!m.sharing;$('rmMusicStartHint').hidden=!!m.sharing;$('musicSkip').disabled=$('musicEnd').disabled=!m.sharing;
  $('query').disabled=!m.sharing;$('musicForm').querySelector('button').disabled=!m.sharing;$('query').placeholder=m.sharing?'Artist — song title':'Start the Music DJ first';
  if(c.music){setValue('rmMusicVolume',c.music.volume);if(!editing($('rmMusicVolume')))$('rmMusicVolumeLabel').textContent=Math.round(c.music.volume)+'%';setValue('rmMusicQuality',c.music.quality);setCheck('rmMusicDuck',c.music.duck);$('rmMusicStatus').textContent=c.music.status||'';}
  // Soundboard
  live.sounds=s.sounds||[];live.favorites=s.favorites||[];
  const key=JSON.stringify(live.sounds);if(key!==padsKey){padsKey=key;pads();}
  if(c.board){setValue('rmClipVolume',c.board.volume);if(!editing($('rmClipVolume')))$('rmClipVolumeLabel').textContent=pct(c.board.volume);$('rmBoardStatus').textContent=c.board.status||'';}
  // Setup
  if(c.voice){setValue('rmVoiceVolume',c.voice.volume);if(!editing($('rmVoiceVolume')))$('rmVoiceVolumeLabel').textContent=pct(c.voice.volume/0.7);$('voiceState').textContent=c.voice.status||'';}
  if(s.prefs)setCheck('rmMuteCall',s.prefs.muteCall);
  $('device').textContent=s.device?'This '+s.device+' is paired with Tyler on your PC.':'';$('rmVersion').textContent=s.version?'v'+s.version:'';
  // Checks
  if(c.check){
   $('diagnose').disabled=!!c.check.running;$('hearingConfirm').hidden=!c.check.hearing;
   const k=JSON.stringify(c.check.items);if(k!==checksKey&&c.check.items?.length){checksKey=k;const list=$('diagnostics');list.replaceChildren();
    for(const it of c.check.items){const li=document.createElement('li');if(it.result)li.dataset.result=it.result;if(it.summary)li.className='check-summary';if(it.title){const b=document.createElement('b'),sp=document.createElement('span');b.textContent=it.title;sp.textContent=it.text||'';li.append(b,sp);}else li.textContent=it.text||'';list.append(li);}}
  }
  const tk=JSON.stringify(s.controls?.trail||[]);if(tk!==trailKey){trailKey=tk;const list=$('trail');list.replaceChildren();
   if(!s.controls?.trail?.length){const li=document.createElement('li');li.className='trail-empty';li.textContent='State changes will appear here.';list.append(li);}
   for(const it of s.controls?.trail||[]){const li=document.createElement('li'),b=document.createElement('b'),time=document.createElement('time');b.textContent=it.label;time.textContent=it.time;li.append(b,time);list.append(li);}}
 }
 function nowPlaying(){const m=live.music||{};$('rmNowPlaying').textContent=m.title?'Now playing: '+m.title+(m.by?' · '+m.by:''):m.sharing?'The Music DJ is on. Nothing is playing.':'Music is off.';}
 function pads(){
  const box=$('pads');box.replaceChildren();const fav=new Set(live.favorites);
  if(!live.sounds.length){const p=document.createElement('p');p.className='hint';p.textContent='No clips yet. Add them in the Sounds tab on your PC.';box.append(p);return;}
  for(const item of live.sounds){
   const b=document.createElement('button'),label=document.createElement('span'),name=document.createElement('b');
   b.type='button';b.className='pad';b.dataset.slot=String(item.slot);b.dataset.n=String(item.slot).padStart(2,'0');if(fav.has(item.slot))b.dataset.fav='true';
   label.textContent=(fav.has(item.slot)?'★ Favorite ':'Sound ')+item.slot;name.textContent=item.name;b.append(label,name);
   b.onclick=()=>void act('sound',{slot:item.slot});box.append(b);
  }
 }
 function flashPad(slot){const b=root.querySelector('.pad[data-slot="'+Number(slot)+'"]');if(!b)return;b.classList.add('playing');clearTimeout(b._t);b._t=setTimeout(()=>b.classList.remove('playing'),1600);}
 function themes(){
  const box=$('rmThemes');
  for(const t of THEMES){
   const b=document.createElement('button');b.type='button';b.className='rm-theme';b.dataset.theme=t;b.setAttribute('aria-pressed',String(t===theme));
   const c=document.createElement('canvas');c.className='rm-theme-logo';c.width=56;c.height=56;c.setAttribute('aria-hidden','true');
   const n=document.createElement('span');n.textContent=NAMES[t];b.append(c,n);
   b.onclick=async()=>{if(t===theme)return;const was=theme;setTheme(t);if(!await act('theme',{theme:t},'Theme: '+NAMES[t]))setTheme(was);};
   box.append(b);
  }
  // The logos are drawn when the Setup tab first opens: the canvas's on-screen size sets the drawing size.
 }

 // ── Tabs and the collapse button, as in the panel ────────────────────────
 const scrollAt={};
 function showTab(name){
  if(!TABS.includes(name)||panel.dataset.remote==='pair')return;
  const scroll=root.querySelector('.scroll');if(name!==currentTab){scrollAt[currentTab]=scroll.scrollTop;currentTab=name;}
  for(const b of root.querySelectorAll('[data-tab]')){const on=b.dataset.tab===name;b.setAttribute('aria-selected',String(on));b.tabIndex=on?0:-1;}
  for(const v of root.querySelectorAll('[data-view]'))v.hidden=v.dataset.view!==name;
  scroll.scrollTop=scrollAt[name]||0;
  if(name==='setup')requestAnimationFrame(()=>{for(const c of root.querySelectorAll('.rm-theme-logo'))if(!c.dataset.logo)void globalThis.TylerLogos?.paint(c,c.parentElement.dataset.theme);});
  if(fxLoaded)emit('tab',{tab:name});
 }
 function setMini(mini){
  host.classList.toggle('mini',mini);const b=$('collapse');b.setAttribute('aria-expanded',String(!mini));b.setAttribute('aria-label',mini?'Expand panel':'Collapse panel');
  b.innerHTML=mini?'<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3.5 8h9M8 3.5v9" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>':'<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3.5 8h9" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>';
  if(fxLoaded)emit('mini',{mini});
 }
 function showPaired(on){
  panel.dataset.remote=on?'remote':'pair';
  if(!on){for(const v of root.querySelectorAll('[data-view]'))v.hidden=v.dataset.view!=='pair';setLink('pair');setActivity('standby','Not paired','Pair this phone to control Tyler.');}
  else if(!$('pairView').hidden){$('pairView').hidden=true;showTab(currentTab);for(const v of root.querySelectorAll('[data-view]'))v.hidden=v.dataset.view!==currentTab;}
 }

 // ── Actions ──────────────────────────────────────────────────────────────
 const toast=(kind,title,text='')=>kit?.toast({kind,title,text});
 async function act(action,extra={},done=''){
  try{const r=await fetch('/action',{method:'POST',headers:H,body:JSON.stringify({action,...extra})}),j=await r.json().catch(()=>({}));
   if(r.status===401){showPaired(false);return false;}
   if(!r.ok)throw Error(j.error||'Tyler couldn’t do that.');
   if(done)toast('success',done);pollSoon(400);return true;}
  catch(e){toast('error','Tyler couldn’t do that',e.message);return false;}
 }
 // A slider sends its value when you let go; the label follows while you drag.
 function slider(id,label,format,send){
  const el=$(id);
  el.addEventListener('input',()=>{el.dataset.dragging='true';$(label).textContent=format(Number(el.value));});
  el.addEventListener('change',()=>{el.dataset.dragging='false';void send(Number(el.value));});
 }
 function wire(){
  for(const b of root.querySelectorAll('[data-tab]')){
   b.onclick=()=>showTab(b.dataset.tab);
   b.onkeydown=e=>{const tabs=[...root.querySelectorAll('[data-tab]')];let i=tabs.indexOf(b);if(e.key==='ArrowRight')i=(i+1)%tabs.length;else if(e.key==='ArrowLeft')i=(i+tabs.length-1)%tabs.length;else if(e.key==='Home')i=0;else if(e.key==='End')i=tabs.length-1;else return;e.preventDefault();showTab(tabs[i].dataset.tab);tabs[i].focus();};
  }
  $('collapse').onclick=()=>setMini(!host.classList.contains('mini'));
  $('quickStop').onclick=$('rmPause').onclick=()=>void act('pause',{},'Tyler paused');
  $('stop').onclick=()=>void act('stop-audio',{},'Audio stopped');
  $('connect').onclick=()=>void act('start',{},'Connecting…');
  $('settings').onclick=()=>showTab('setup');
  $('rmMode').onchange=()=>void act('mode',{mode:$('rmMode').value},'Mode saved for the next Connect & start');
  $('sayForm').addEventListener('submit',async e=>{e.preventDefault();const t=$('say').value.trim();if(!t)return;if(await act('say',{text:t},'Sent'))$('say').value='';});
  $('rmKeepCall').onchange=()=>void act('keepalive',{call:$('rmKeepCall').checked});
  $('rmKeepChat').onchange=()=>void act('keepalive',{chat:$('rmKeepChat').checked});
  $('rmKeepMinutes').onchange=()=>void act('keepalive',{minutes:Number($('rmKeepMinutes').value)});
  $('rmMusicStart').onclick=()=>void act('music-start',{},'Starting the Music DJ on your PC…');
  $('musicForm').addEventListener('submit',async e=>{e.preventDefault();const q=$('query').value.trim();if(q.length<2)return;if(await act('music-play',{query:q},'Queued: '+q))$('query').value='';});
  $('musicSkip').onclick=()=>void act('music-skip',{},'Skipped');
  $('musicEnd').onclick=()=>void act('music-stop',{},'Music stopped');
  slider('rmMusicVolume','rmMusicVolumeLabel',v=>Math.round(v)+'%',v=>act('music-volume',{value:v}));
  $('rmMusicQuality').onchange=()=>void act('music-quality',{level:$('rmMusicQuality').value},'Sound quality saved');
  $('rmMusicDuck').onchange=()=>void act('music-duck',{on:$('rmMusicDuck').checked});
  $('boardStop').onclick=()=>void act('clips-stop',{},'Clips stopped');
  slider('rmClipVolume','rmClipVolumeLabel',pct,v=>act('clip-volume',{value:v}));
  slider('rmVoiceVolume','rmVoiceVolumeLabel',v=>pct(v/0.7),v=>act('voice-volume',{value:v}));
  $('rmMuteCall').onchange=()=>void act('mute-call',{on:$('rmMuteCall').checked},$('rmMuteCall').checked?'Call muted in Tyler’s window':'Call sound back on');
  $('diagnose').onclick=()=>void act('full-check',{},'Full check started').then(ok=>{if(ok)checkWatch();});
  $('heardYes').onclick=()=>void act('heard',{yes:true});$('heardNo').onclick=()=>void act('heard',{yes:false});
  $('beep').onclick=()=>void act('beep',{},'Beep sent to voice');$('voiceCheck').onclick=()=>void act('voice-check',{},'Checking voice…');
  $('forget').onclick=async()=>{try{await fetch('/forget',{method:'POST',headers:H,body:'{}'});}catch{}closeEvents();showPaired(false);};
  $('pairForm').addEventListener('submit',e=>{e.preventDefault();void pair($('code').value.replace(/\D/g,''));});
  $('code').addEventListener('input',()=>{const d=$('code').value.replace(/\D/g,'').slice(0,6);$('code').value=d.length>3?d.slice(0,3)+' '+d.slice(3):d;});
  themes();
 }

 // ── The theme's extras: the real code, with a stand-in for the panel ──────
 function shim(){
  globalThis.TylerStorage={
   get:async keys=>{const want=new Set([].concat(keys||[])),fx=live.fx,out={};
    if(want.has('tylerLifetime')&&fx?.life)out.tylerLifetime={...fx.life,sessions:Math.max(0,(Number(fx.life.sessions)||1)-1)}; // the PC already counted this session
    if(want.has('themeStats')&&fx&&!fx.life)out.themeStats=false;
    if(want.has('spendingCapUSD')&&fx?.spendingCap)out.spendingCapUSD=fx.spendingCap;
    return out;},
   set:async()=>{},onChanged:{addListener(){}}};
  globalThis.TylerCompanion={
   ui:{root,panel,host,onUI:fn=>{listeners.add(fn);return ()=>listeners.delete(fn);},
    state:()=>({state:live.state,label:live.label,text:live.text,tab:currentTab,hud:{...live.hud},mini:host.classList.contains('mini'),theme,owner:true})},
   getTheme:()=>theme,
   getVoiceState:()=>({enabled:live.voice.armed,connectedPeers:live.voice.inCall?Math.max(1,live.voice.peers):0,attached:live.voice.attached}),
   getIncoming:()=>({tracks:live.voice.peers}),
   getComposer:()=>({isConnected:live.chat}),getRegion:()=>({isConnected:live.chat}),
   request:async m=>m?.type==='connection'?{ok:true,keyConfigured:live.fx?.keyOk!==false,model:live.fx?.model||'',provider:live.fx?.provider||''}:{ok:false},
   showTab,playSound:slot=>void act('sound',{slot:Number(slot)}),
   listSounds:()=>({slots:live.sounds.map(s=>({slot:s.slot,name:s.name})),favorites:[...live.favorites]}),
   isOwner:()=>true,platform:{id:'remote',voice:true,label:'Phone remote'},
  };
 }
 /** The extras' numbers from the PC: counts, reply times, the session log and lifetime totals. */
 function seed(fx){
  const F=globalThis.TylerThemeFeatures,S=F?.state?.();if(!S||!fx)return;
  const t=v=>Number(v)>0?Number(v)+offset:0;
  Object.assign(S,{started:t(fx.started)||S.started,since:t(fx.since)||S.since,thinkingSince:t(fx.thinkingSince),replies:fx.replies,spoken:fx.spoken,heard:fx.heard,errors:fx.errors,sounds:fx.sounds,
   lastSound:fx.lastSound,music:fx.music,musicBy:fx.musicBy,turns:[...(fx.turns||[])],streak:fx.streak,best:fx.best,errorAt:(fx.errorAt||[]).map(t),log:(fx.log||[]).map(e=>({...e,at:t(e.at)})),
   chatBurst:fx.chatBurst,flood:fx.flood,model:fx.model,provider:fx.provider,keyOk:fx.keyOk,state:live.state,label:live.label,text:live.text,hud:{...live.hud}});
  const life=F.life?.();if(life&&fx.life)Object.assign(life,fx.life,{best:{...(fx.life.best||{})},ach:[...(fx.life.ach||[])]});
 }
 async function startExtras(s){
  shim();const v='?v='+encodeURIComponent(version);
  await load('/lib/theme-features.js'+v);
  fxLoaded=!!globalThis.TylerThemeFeatures;seed(s.fx);
  for(const n of [1,2,3,4])await load('/lib/theme-pack-'+n+'.js'+v).catch(e=>console.warn(e.message));
  emit('life',{});
 }

 // ── Status from the PC: live events, with polling to catch up ─────────────
 function apply(s,{fromPoll=false,reseed=false}={}){
  if(!s||typeof s!=='object')return;
  showPaired(true);
  if(Number.isFinite(s.now))offset=Date.now()-s.now;
  if(!s.ready){setLink('pc');$('footerState').textContent='Open Steam chat in Tyler’s desktop app';if(live.state!=='error'||live.text!==s.error)setActivity('error','Not ready',s.error||'Open Steam chat in Tyler’s desktop app.');return;}
  if(linkState==='pc'||linkState==='pair'||linkState==='connecting'||linkState==='lost')setLink(events?.readyState===1?'live':'polling');
  live.voice={...live.voice,...(s.voice||{})};live.chat=!!s.chat;live.owner=s.owner!==false;if(s.fx)live.fx=s.fx;
  if(THEMES.includes(s.theme)&&s.theme!==theme)setTheme(s.theme);
  // A poll answered before the last live event is older than what's on screen.
  const stale=fromPoll&&lastEventAt&&Number(s.now)<lastEventAt;
  if(!stale){
   if(s.state!==live.state||s.label!==live.label||s.text!==live.text)setActivity(s.state,s.label,s.text);
   if(s.hud&&SLOT_ORDER.some(k=>s.hud[k]!==live.hud[k]||s.hud[k+'Meta']!==live.hud[k+'Meta']))setHud(s.hud);
  }
  renderControls(s);
  // Steam chat reloaded on the PC (a new session there): start the extras' numbers over from it.
  if(s.fx?.started&&apply.started&&s.fx.started!==apply.started)reseed=true;if(s.fx?.started)apply.started=s.fx.started;
  if(reseed&&fxLoaded){seed(s.fx);emit('life',{});}
 }
 function onEvents(list){
  setLink('live');
  for(const e of list){
   lastEventAt=Math.max(lastEventAt,Number(e.at)||0);const d=e.data||{};
   if(e.type==='state'){setActivity(d.state,d.label,d.text);continue;}
   if(e.type==='hud'){setHud(d);continue;}
   if(e.type==='theme'){setTheme(d.theme);continue;}
   if(e.type==='sound')flashPad(d.slot);
   if(e.type==='music'){live.music={...live.music,title:d.title||'',by:d.by||''};nowPlaying();}
   if(e.type==='check')pollSoon(300);
   if(fxLoaded)emit(e.type,d);
  }
 }
 let events=null,pollTimer=0,soonTimer=0,checkTimer=0;
 function openEvents(){
  if(events||typeof EventSource!=='function')return;
  events=new EventSource('/events');
  events.addEventListener('snap',e=>{try{const s=JSON.parse(e.data);if(!fxLoaded&&!booting){apply(s);if(s.ready)booting=startExtras(s);}else apply(s,{reseed:true});}catch{}});
  events.addEventListener('ui',e=>{try{onEvents(JSON.parse(e.data).events||[]);}catch{}});
  events.onopen=()=>setLink('live');
  events.onerror=()=>{if(!events)return;if(events.readyState===2){events.close();events=null;void poll();}else setLink('reconnecting');};
 }
 function closeEvents(){if(events){events.close();events=null;}}
 let lastOk=0;
 async function poll(){
  try{const r=await fetch('/state',{cache:'no-store'});
   if(r.status===401){closeEvents();showPaired(false);const code=new URLSearchParams(location.search).get('code');if(code&&!poll.tried){poll.tried=true;$('code').value=code;void pair(code);}return;}
   const s=await r.json();lastOk=Date.now();
   if(!fxLoaded&&!booting&&s.ready){apply(s);booting=startExtras(s);await booting;}
   else apply(s,{fromPoll:true,reseed:!events});
   if(!events&&document.visibilityState==='visible')openEvents();
  }catch{setLink(Date.now()-lastOk>6000?'lost':'reconnecting');}
 }
 const pollSoon=ms=>{clearTimeout(soonTimer);soonTimer=setTimeout(()=>void poll(),ms);};
 // While a full check runs, its lines arrive every second.
 function checkWatch(){clearInterval(checkTimer);let n=0;checkTimer=setInterval(()=>{if(++n>40)clearInterval(checkTimer);void poll();},1000);}
 // Live events carry the status; the poll fills in the rest (the controls' settings, the check's lines).
 function startPolling(){clearInterval(pollTimer);pollTimer=setInterval(()=>{if(document.visibilityState!=='visible')return;if(events?.readyState===1&&Date.now()-lastOk<7500)return;void poll();},4000);}
 document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible'){void poll();}else closeEvents();});

 async function pair(code){
  $('pairMsg').textContent='Pairing…';
  try{const r=await fetch('/pair',{method:'POST',headers:H,body:JSON.stringify({code})}),j=await r.json().catch(()=>({}));
   if(!r.ok)throw Error(j.error||'Pairing failed.');history.replaceState(null,'','/');$('pairMsg').textContent='';$('code').value='';await poll();}
  catch(e){$('pairMsg').textContent=e.message;}
 }

 // ── Start ────────────────────────────────────────────────────────────────
 (async()=>{
  let who={};try{who=await (await fetch('/whoami',{cache:'no-store'})).json();}catch{}
  version=String(who.version||'');theme=THEMES.includes(who.theme)?who.theme:'steam';
  const v='?v='+encodeURIComponent(version);
  try{for(const f of ['ui-template.js','ui-icons.js','ui-kit.js','ui-logos.js','ui-art.js'])await load('/lib/'+f+v);await build();}
  catch(e){document.getElementById('boot').textContent='Tyler’s remote couldn’t load: '+e.message+' Reload the page to try again.';return;}
  document.getElementById('boot')?.remove();
  setLink('connecting');setActivity('ready','Connecting','Looking for Tyler on your PC…');
  await poll();startPolling();
  globalThis.__tylerRemote={state:()=>({theme,link:linkState,fx:fxLoaded,tab:currentTab,live:{...live}})};
 })();
})();

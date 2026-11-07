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
//
// v2.41: the Setup tab opens Tyler's Settings on the PC (/settings/, app/remote/phone-settings.js).
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
  <div id="rmNotice" class="callout rm-notice" role="alert" hidden><b>One-time check for this chat</b><p>Have you told everyone that Tyler sends the chat (and what people say in voice) to your AI provider?</p><div class="btn-row"><button id="rmNoticeYes" class="btn primary" type="button">Yes, continue</button><button id="rmNoticeAlways" class="btn" type="button">Yes, don’t ask again</button></div></div>
  <button id="connect" class="btn primary block" type="button">${icon('play')}Connect &amp; start</button>
  <button id="rmPause" class="btn block" type="button" hidden>${icon('pause')}Pause AI</button>
  <p id="rmRunHint" class="hint">Tyler connects to the chat open on your PC.</p>
  <div id="rmCall" class="rm-call" data-state="unavailable"><div class="rm-call-head"><b>Steam voice call</b><span id="rmCallState" class="pill" role="status" aria-live="polite">Not connected</span></div>
   <p id="rmCallText" class="hint">Connect Tyler to the group chat first.</p><div id="rmCallRooms" class="btn-row" hidden></div>
   <div class="btn-row rm-call-btns"><button id="rmJoin" class="btn primary" type="button">Join Voice</button><button id="rmLeave" class="btn" type="button">Leave Voice</button></div>
   <small class="hint">Leave Voice takes the bot out of the call. Pause AI and Stop audio keep him in it.</small></div>
  <label class="field">Use Tyler for<select id="rmMode"><option value="auto">Auto: text, or voice when friends join</option><option value="text">Text conversation only</option><option value="voice">Voice conversation only</option></select></label>
  <small class="hint">A new mode starts the next time you press Connect &amp; start.</small>
  <details class="feature" open><summary><span class="feature-title">Say in chat</span><span class="feature-meta">Tyler types it</span></summary>
    <div class="feature-body"><form id="sayForm" class="btn-row" autocomplete="off"><input id="say" type="text" maxlength="300" placeholder="Tyler types this in the chat" aria-label="Message"><button class="btn primary" type="submit">Send</button></form></div></details>
  <details class="feature" id="rmLogCard"><summary><span class="feature-title">Chat log</span><span class="feature-meta" id="rmLogMeta">What's happening</span></summary>
    <div class="feature-body"><p class="hint">The latest messages in the chat open on your PC, refreshed every few seconds while this is open.</p>
      <ol id="rmLog" class="rm-log" aria-live="polite"></ol>
      <div class="btn-row"><button id="rmLogRefresh" class="btn" type="button">Refresh</button><button id="rmClear" class="btn danger" type="button">Clear conversation</button></div>
      <p id="rmClearHint" class="hint">Clear conversation makes Tyler forget this chat's conversation and poll (friend memory stays). Like the button on the PC, it pauses him: press Connect &amp; start to carry on.</p></div></details>
  <details class="feature" id="rmTvCard"><summary><span class="feature-title">Theme voice</span><span class="feature-meta" id="rmTvMeta">On the PC</span></summary>
    <div class="feature-body"><p class="hint">Tyler says it in the call in a theme’s character voice. The voice is made on your PC; this phone only sends the text.</p>
      <form id="rmTvForm" autocomplete="off"><label class="field">Voice<select id="rmTvVoice"><option value="">Follow the theme</option></select></label>
      <label class="field" id="rmTvCharField" hidden>Character voice<select id="rmTvChar" aria-describedby="rmTvCharHint"></select><small class="hint" id="rmTvCharHint">Saved on the PC for this theme. The theme’s own voice is the default.</small></label>
      <label class="field">What Tyler says<input id="rmTvText" type="text" maxlength="400" placeholder="Type a message for the call" aria-label="Voice message"></label>
      <div class="btn-row"><button class="btn primary" type="submit">Say in call</button><button id="rmTvStop" class="btn" type="button">Stop</button></div></form>
      <p id="rmTvState" class="hint" role="status"></p></div></details>
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
  <label class="field">Sound quality<select id="rmMusicQuality"><option value="auto">Auto · adjusts to the call</option><option value="high">High · 128 kbps</option><option value="medium">Medium · 64 kbps</option><option value="low">Low · about 32 kbps</option></select></label>
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
  <div class="rm-settings"><button id="rmSettings" class="btn primary block" type="button">${icon('setup')}Open Settings</button>
  <small class="hint">Tyler’s Settings on your PC, from this phone: personality, AI and model, voice, squad and more. API keys, installs and tests stay on the PC.</small></div>
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
 // v2.45: the memory meter as the PC's panel shows it (Settings → Advanced), put in place by the same
 // memory-meter.js. Shown only while it's on there and its reading is fresh (the panel reads only while it can be seen).
 function setMemory(m,now){
  const el=$('memMeter');if(!el)return;const fresh=!!m?.ram&&!!m?.vram&&(!Number.isFinite(now)||!m.at||Math.abs(now-m.at)<15000);
  el.hidden=!fresh;if(!fresh){el.dataset.state='off';return;}
  globalThis.TylerMemoryMeter?.render(el,m);
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
 // v2.32: the Steam voice call as Tyler's Steam window sees it. Connected only when Steam says so;
 // a tap only sends the request, and the buttons wait while one is on its way.
 const CALL={unavailable:'Not connected',disconnected:'Disconnected',joining:'Joining…',connected:'Connected',leaving:'Leaving…',failed:'Failed'};
 let callBusy=false;
 function renderCall(c){
  live.call=c;const st=c.state||'unavailable',box=$('rmCall');box.dataset.state=st;$('rmCallState').textContent=CALL[st]||st;
  $('rmCallText').textContent=st==='connected'?(c.room||'Voice')+(c.people?' · '+c.people+' other'+(c.people===1?'':'s')+' in the call':' · nobody else yet'):
   st==='joining'?'Steam is connecting'+(c.room?' to '+c.room:'')+'…':st==='leaving'?'Steam is taking the bot out of the call…':st==='failed'?(c.error||'Steam didn’t finish.'):st==='unavailable'?(c.reason||'Connect Tyler to the group chat first.'):'The bot isn’t in the group’s voice call.';
  const pending=callBusy||c.pending===true;
  $('rmJoin').disabled=pending||st==='connected'||st==='joining'||st==='leaving'||st==='unavailable';
  $('rmLeave').disabled=pending&&st==='leaving'||!(st==='connected'||st==='joining'||st==='failed'&&!!c.roomId);
  const rooms=Array.isArray(c.rooms)?c.rooms:[],choose=st==='failed'&&rooms.length>1&&/Choose one/.test(c.error||''),list=$('rmCallRooms');list.hidden=!choose;
  if(choose)list.replaceChildren(...rooms.map(r=>{const b=document.createElement('button');b.type='button';b.className='btn';b.textContent=r.name+(r.count?' · '+r.count:'');b.onclick=()=>void callAct('voice-join',{roomId:r.id});return b;}));
 }
 async function callAct(action,extra={}){if(callBusy)return;callBusy=true;renderCall(live.call||{});try{await act(action,extra);}finally{callBusy=false;renderCall(live.call||{});pollSoon(300);}}
 function renderThemeVoice(t){
  const card=$('rmTvCard');if(!card)return;card.hidden=!t?.available;if(!t?.available)return;live.tv=t;
  $('rmTvMeta').textContent=t.ready?(t.busy?'Speaking…':'Ready'):'Not installed';
  const sel=$('rmTvVoice'),keep=sel.value;if(sel.options.length<=1&&t.voices?.length){for(const v of t.voices){const o=document.createElement('option');o.value=v.theme;o.textContent=v.name;sel.append(o);}sel.value=keep;}
  renderCharacter();
  // v2.44: the graphics card was full, so the voice runs on the processor (slower): said here too.
  $('rmTvState').textContent=t.ready?[t.busy?'Tyler is making or saying a voice message.':'',t.deviceNote||''].filter(Boolean).join(' '):'Install theme voices on the PC first: Settings → Theme voices.';
 }
 // v2.41: the character voice for the theme chosen above (or the theme on the PC when following it).
 function renderCharacter(){
  const t=live.tv,field=$('rmTvCharField'),sel=$('rmTvChar');if(!t||!field||editing(sel))return;
  const theme=$('rmTvVoice').value||t.theme,v=(t.voices||[]).find(x=>x.theme===theme),list=v?.characters||[];
  field.hidden=!list.length;if(!list.length)return;
  const want=[['',v.name+' (theme default)'],...list.map(c=>[c.id,c.name])],now=[...sel.options].map(o=>o.value+'|'+o.textContent).join(',');
  if(now!==want.map(w=>w.join('|')).join(',')){sel.replaceChildren(...want.map(([id,name])=>{const o=document.createElement('option');o.value=id;o.textContent=name;return o;}));}
  sel.value=v.character||'';sel.dataset.theme=theme;
  // v2.42: say when the picked character speaks in an earlier version (chosen on the PC, or v2.43: a recording of the improved one is damaged there).
  const note=list.find(c=>c.id===sel.value)?.note;$('rmTvCharHint').textContent=note||'Saved on the PC for this theme. The theme’s own voice is the default.';
 }
 function renderControls(s){
  const c=s.controls||{};
  live.paused=!!s.paused;$('connect').hidden=!live.paused;$('rmPause').hidden=live.paused;
  if(s.call)renderCall(s.call);
  // v2.30: Connect & start is waiting for the chat check: answer it here.
  $('rmNotice').hidden=!s.notice;if(s.notice)$('connect').hidden=true; // it's already connecting
  $('rmRunHint').textContent=live.paused?'Tyler connects to the chat open on your PC.':'Tyler is running'+(s.automatic?' automatically':s.live?' in Live voice':'')+'. Pause AI stops his replies; Stop audio silences him.';
  // The panel's own footer note, about the Steam window on the PC ("this tab" means that window).
  $('footerState').textContent=String(s.footer||'Bot account · keep Tyler’s window open').replace(/^This tab\b/,'Tyler’s Steam window').replace(/keep this tab open/,'keep Tyler’s window open');
  setValue('rmMode',c.mode);
  if(c.keep){setCheck('rmKeepCall',c.keep.call);setCheck('rmKeepChat',c.keep.chat);setValue('rmKeepMinutes',c.keep.minutes);$('rmKeepMinutes').disabled=!c.keep.call;$('rmKeepStatus').textContent=c.keep.status||'';}
  // Music
  renderThemeVoice(s.themeVoices);
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
   checkRunning=!!c.check.running;$('diagnose').disabled=!!c.check.running;$('hearingConfirm').hidden=!c.check.hearing;
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
 const sending=new Set();let notReady='';
 async function act(action,extra={},done=''){
  const key=action+JSON.stringify(extra);if(sending.has(key))return false;
  if(notReady&&!['start','pause'].includes(action)){toast('error','Tyler isn’t ready on your PC',notReady);return false;}
  sending.add(key);
  try{const r=await fetch('/action',{method:'POST',headers:H,body:JSON.stringify({action,...extra}),signal:AbortSignal.timeout(15000)}),j=await r.json().catch(()=>({}));
   if(r.status===401){showPaired(false);return false;}
   if(!r.ok)throw Error(j.error||'Tyler couldn’t do that.');
   if(done)toast('success',done);pollSoon(400);return true;}
  catch(e){toast('error','Tyler couldn’t do that',e.name==='TimeoutError'?'Your PC didn’t answer in time.':e.message);return false;}
  finally{sending.delete(key);}
 }
 // v2.35: the chat log, read from the Steam window on the PC (only while its card is open).
 let logBusy=false,logTimer=0;
 async function chatLog(now=false){
  clearTimeout(logTimer);if(!$('rmLogCard')?.open||document.hidden){return;}
  if(logBusy)return;logBusy=true;
  try{
   const r=await fetch('/action',{method:'POST',headers:H,body:JSON.stringify({action:'chat-log'}),signal:AbortSignal.timeout(8000)}),j=await r.json().catch(()=>({}));
   if(r.status===401){showPaired(false);return;}
   if(!r.ok)throw Error(j.error||'Couldn’t read the chat.');
   const list=$('rmLog');
   if(!j.connected){list.replaceChildren();$('rmLogMeta').textContent='Not connected';const li=document.createElement('li');li.className='hint';li.textContent='Open the group chat in Tyler’s Steam window on your PC.';list.append(li);return;}
   const near=list.scrollHeight-list.scrollTop-list.clientHeight<40;
   list.replaceChildren(...j.messages.map(m=>{const li=document.createElement('li');li.className='rm-log-line'+(m.self?' self':'');
    const head=document.createElement('span');head.className='rm-log-who';head.textContent=m.name+(m.at?' · '+new Date(m.at*(m.at<1e12?1000:1)).toLocaleTimeString([],{hour:'numeric',minute:'2-digit'}):'');
    const body=document.createElement('span');body.className='rm-log-text';body.textContent=m.text;li.append(head,body);return li;}));
   $('rmLogMeta').textContent=j.messages.length?j.messages.length+' recent':'No messages yet';
   if(near||now)list.scrollTop=list.scrollHeight;
  }catch(e){$('rmLogMeta').textContent='Couldn’t read the chat';}
  finally{logBusy=false;if($('rmLogCard')?.open)logTimer=setTimeout(()=>void chatLog(),5000);}
 }
 document.addEventListener('visibilitychange',()=>{if(!document.hidden)void chatLog();});
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
  $('rmJoin').onclick=()=>void callAct('voice-join');$('rmLeave').onclick=()=>void callAct('voice-leave');
  $('rmNoticeYes').onclick=()=>void act('notice',{always:false},'Continuing…');
  $('rmNoticeAlways').onclick=()=>void act('notice',{always:true},'Continuing. Tyler won’t ask again.');
  // v2.41: Settings on the PC, from this phone (app/remote/phone-settings.js). The theme extras' own
  // "Settings" entries (their menus press the panel's settings button) open it too.
  $('rmSettings').onclick=$('settings').onclick=()=>location.assign('/settings/');
  $('rmMode').onchange=()=>void act('mode',{mode:$('rmMode').value},'Mode saved for the next Connect & start');
  $('rmLogRefresh').onclick=()=>void chatLog(true);
  $('rmLogCard').addEventListener('toggle',()=>{if($('rmLogCard').open)void chatLog(true);});
  let clearArmed=0;
  $('rmClear').onclick=async()=>{if(Date.now()-clearArmed>5000){clearArmed=Date.now();$('rmClear').textContent='Tap again to clear';setTimeout(()=>{if(Date.now()-clearArmed>=5000)$('rmClear').textContent='Clear conversation';},5200);return;}
   clearArmed=0;$('rmClear').textContent='Clear conversation';if(await act('clear',{},'Conversation cleared. Tyler is paused.'))void chatLog(true);};
  $('rmTvForm').addEventListener('submit',async e=>{e.preventDefault();const t=$('rmTvText').value.trim();if(!t)return;if(await act('theme-say',{text:t,theme:$('rmTvVoice').value},'Making the voice on the PC…'))$('rmTvText').value='';});
  $('rmTvStop').addEventListener('click',()=>void act('theme-stop',{},'Stopped'));
  $('rmTvVoice').addEventListener('change',()=>renderCharacter());
  $('rmTvChar').addEventListener('change',async()=>{const sel=$('rmTvChar'),theme=sel.dataset.theme;if(!theme)return;if(await act('theme-character',{theme,character:sel.value},'Saved on the PC'))pollSoon(300);});
  $('sayForm').addEventListener('submit',async e=>{e.preventDefault();const t=$('say').value.trim();if(!t)return;if(await act('say',{text:t},'Sent'))$('say').value='';});
  $('rmKeepCall').onchange=()=>void act('keepalive',{call:$('rmKeepCall').checked});
  $('rmKeepChat').onchange=()=>void act('keepalive',{chat:$('rmKeepChat').checked});
  $('rmKeepMinutes').onchange=()=>void act('keepalive',{minutes:Number($('rmKeepMinutes').value)});
  $('rmMusicStart').onclick=()=>void act('music-start',{},'Starting the Music DJ on your PC…');
  $('musicForm').addEventListener('submit',async e=>{e.preventDefault();const q=$('query').value.trim();if(q.length<2)return;if(await act('music-play',{query:q},'Sent to the Music DJ: '+q+' (it searches YouTube next)'))$('query').value='';});
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
  notReady=s.ready?'':(s.error||'Open Steam chat in Tyler’s desktop app.');
  if(!s.ready){setLink('pc');if(live.call)renderCall({state:'unavailable',reason:notReady});$('footerState').textContent='Open Steam chat in Tyler’s desktop app';if(live.state!=='error'||live.text!==s.error)setActivity('error','Not ready',s.error||'Open Steam chat in Tyler’s desktop app.');return;}
  if(linkState==='pc'||linkState==='pair'||linkState==='connecting'||linkState==='lost')setLink(events?.readyState===1?'live':'polling');
  live.voice={...live.voice,...(s.voice||{})};live.chat=!!s.chat;live.owner=s.owner!==false;if(s.fx)live.fx=s.fx;
  if(THEMES.includes(s.theme)&&s.theme!==theme)setTheme(s.theme);
  // A poll answered before the last live event is older than what's on screen.
  const stale=fromPoll&&lastEventAt&&Number(s.now)<lastEventAt;
  if(!stale){
   if(s.state!==live.state||s.label!==live.label||s.text!==live.text)setActivity(s.state,s.label,s.text);
   if(s.hud&&SLOT_ORDER.some(k=>s.hud[k]!==live.hud[k]||s.hud[k+'Meta']!==live.hud[k+'Meta']))setHud(s.hud);
   setMemory(s.memory,s.now);
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
   if(e.type==='voice-call'){renderCall({...live.call,...d,pending:d.pending===true});continue;}
   if(e.type==='chat-check'){const n=$('rmNotice');n.hidden=d.on!==true;$('connect').hidden=d.on===true||!live.paused;if(d.on===true){for(const x of n.getRootNode().querySelectorAll('.rt-toast .rt-x'))x.click();/* nothing covers its buttons */if($('tab-conversation')?.getAttribute('aria-selected')==='true')n.scrollIntoView({block:'center'});else toast('info','Tyler is waiting for you','Answer the one-time chat check on the Chat tab.');}continue;}
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
 let polling=null;
 function poll(){if(!polling)polling=pollOnce().finally(()=>{polling=null;});return polling;}
 async function pollOnce(){
  try{const r=await fetch('/state',{cache:'no-store',signal:AbortSignal.timeout(6000)});
   if(r.status===401){closeEvents();showPaired(false);const code=new URLSearchParams(location.search).get('code');if(code&&!poll.tried){poll.tried=true;$('code').value=code;void pair(code);}return;}
   const s=await r.json();lastOk=Date.now();
   if(!fxLoaded&&!booting&&s.ready){apply(s);booting=startExtras(s);await booting;}
   else apply(s,{fromPoll:true,reseed:!events});
   if(!events&&document.visibilityState==='visible')openEvents();
  }catch{setLink(Date.now()-lastOk>6000?'lost':'reconnecting');}
 }
 const pollSoon=ms=>{clearTimeout(soonTimer);soonTimer=setTimeout(()=>void poll(),ms);};
 // While a full check runs, its lines arrive every second.
 function checkWatch(){clearInterval(checkTimer);let n=0;checkTimer=setInterval(()=>{if(++n>40||n>4&&!checkRunning){clearInterval(checkTimer);return;}void poll();},1000);}
 let checkRunning=false;
 // Live events carry the status; the poll fills in the rest (the controls' settings, the check's lines).
 function startPolling(){clearInterval(pollTimer);pollTimer=setInterval(()=>{if(document.visibilityState!=='visible')return;if(events?.readyState===1&&Date.now()-lastOk<20000)return;void poll();},4000);}
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
  try{for(const f of ['ui-template.js','ui-icons.js','ui-kit.js','ui-logos.js','ui-brand.js','memory-meter.js'])await load('/lib/'+f+v);await build();}
  catch(e){document.getElementById('boot').textContent='Tyler’s remote couldn’t load: '+e.message+' Reload the page to try again.';return;}
  document.getElementById('boot')?.remove();
  setLink('connecting');setActivity('ready','Connecting','Looking for Tyler on your PC…');
  await poll();startPolling();
  globalThis.__tylerRemote={state:()=>({theme,link:linkState,fx:fxLoaded,tab:currentTab,live:{...live}})};
 })();
})();

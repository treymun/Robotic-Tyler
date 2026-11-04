// Settings → Appearance: the theme gallery (v2.14).
//
// One card per theme (fifteen), each with the theme's Tyler logo and a miniature of the
// real chat panel. Choosing a card updates a larger preview (status strip, tabs,
// buttons, an input, a notification); Apply saves it for every Tyler window
// through theme.js. Previews are built from the panel's own markup and stylesheet
// (TylerUI from ui-template.js) inside shadow roots, so each one shows exactly
// what the panel looks like in that theme, isolated from the page's own theme.
// Previews use sample text only: nothing is sent, no AI request, no chat connection.
// What each theme adds to Tyler's panel (theme-pack-1/2/3.js, v2.20; v2.22 polish pass), shown under its description.
const EXTRAS={steam:'your Steam persona with a status menu (click it), an activity graph like the downloads page, and achievements with progress.',classic:"a server browser of Tyler's services with Refresh and Connect, and a VGUI progress dialog while he writes.",tf2:'class-select hotkeys 1–5, a killfeed with crits and dominations, a taunt (double-click the logo), and MEDIC! (E) for the Checks tab.',cs2:'a round HUD with buys and MVPs, a sound buy wheel (B, arrows, favourites), and round-won banners.',portal:'a tests-passed sign with live status icons (click it for the chamber report), and portal transitions between tabs.',cs16:'a scoreboard and a radio-command menu (V) that can connect Tyler or run the full check.',hev:'suit-voice callouts, damage indicators, a suit charger (click the status strip to check voice), and a flashlight (F).',l4d:"the survivor team (health of each part of Tyler), the Director's horde warning, and safe-room banners after a full check.",winxp:'a two-column Start menu with Log Off and Turn Off, balloon tips from the system tray, and error dialogs.',doom:'a status face that gets bloodier as Tyler\'s health drops (on his logo too), key cards for the AI key, chat and voice, the screen melt between tabs, and pickup messages.',quake:'a drop-down console (~) with history, Tab completion and real commands, and arena medals.',pipboy:'DATA / MAP / INV / STAT / RADIO (Q / E), gauges, a condition screen (CND), and a radio with Skip and Off for the Music DJ.',combine:'the CP-17 unit plate with Overwatch directives, a coded dispatch ticker, a unit record (T) with sociostability, and biosignal scans.',deadlock:"a souls counter that opens the shop (B), a spirit thread that follows Tyler's state, and a respawn timer when he's down.",minecraft:'hearts, hunger and XP, an inventory of sound discs with a hotbar (E, 1–9), advancement toasts, and block-breaking while Tyler thinks.',payday:'a heist plan with a drill timer, a heist timer that opens the PAYDAY screen, and police assaults with a pager (hold F).',dreamcast:'a working VMU (click it for the memory card and main menu), LCD state icons, and the boot swirl.',gmod:'a spawn menu of sounds and tools (Q), Lua-error reports, spawn notices, and properties (right-click the stats).',ricochet:'an arcade score with discs and power-ups, Press start while paused, a high-score table, and a flying disc between tabs.',dod:'a field-radio channel dial with radio commands (Z), and an operation briefing with objectives.',rust:'the vitals (health, calories, hydration) with status effects, a belt of your clips (1–6), a crafting menu (Q) with a queue, the Tool Cupboard’s upkeep for quiet calls, pickup notices, and the wounded screen with Help up and Respawn.',x360:'the Ring of Light (one light for Tyler and each person in the call, red on a problem), a gamer card with gamerscore and achievements, the Guide (G) with quick actions, blade slides between tabs, and party pop-ups.',ipod:'a click wheel that scrolls the lists, steps through the tabs and pauses Tyler, the iPod menu (M), Now Playing for the Music DJ, Cover Flow of your clips, the battery for his health, and the whole iPod when collapsed.',msn:'Tyler’s presence (Online, On the Phone, Away, Busy) with “is typing a message…”, What I’m listening to, a contact list of his parts, Nudge and emoticons for your clips, a status menu on the display picture, and sign-in pop-ups in the corner.',xmb:'a wave whose colour follows Tyler’s state (the month’s colour while he listens), the clock, Options (O) sliding in from the right, trophies with a trophy level, the Information screen (double-click the logo), and ← → along the cross-media bar.'};
(()=>{
 'use strict';
 const gallery=document.getElementById('themeGallery'),stage=document.getElementById('themeStage');
 const T=globalThis.TylerTheme,UI=globalThis.TylerUI;
 // Pixel-art logos keep hard edges (the panel's canvas does the same, see ui-logos.js).
 const PIXEL=new Set(globalThis.TylerLogos?.pixel||['doom','minecraft']);
 // Each logo is redrawn at its exact displayed size once it is laid out (v2.18, see ui-logos.js).
 const sharp=(img,theme)=>requestAnimationFrame(()=>requestAnimationFrame(()=>globalThis.TylerLogos?.sharpen(img,theme)));
 if(!gallery||!stage||!T||!UI)return;
 // v2.22: the activity states the large preview can show: [key, button, status label, status text].
 const STATES=[['listening','Listening','Listening','Speak normally, then pause'],['thinking','Thinking','Thinking','Preparing a typed reply…'],['speaking','Speaking','On air','Speaking — say “stop” or “hold on” to interrupt'],['paused','Paused','Paused','Off — paused'],['waiting','Reconnecting','Recovering','Reconnecting to the voice bridge…'],['error','Error','Needs attention','Sample problem: the AI provider is busy'],['success','Success','Ready','Full check passed: every part works']];
 let stageState='speaking';
 const icon=n=>globalThis.TylerIcons?.svg(n)||'';
 const kit=()=>globalThis.TylerKit?.page();

 // One stylesheet for every preview: the panel's CSS plus "sit still in a box".
 let sheet=null;
 const PREVIEW_CSS=`:host{display:block}
.panel{position:relative!important;inset:auto!important;right:auto!important;bottom:auto!important;z-index:auto!important;width:100%!important;max-width:none!important;height:auto!important;box-shadow:none!important}
.panel .scroll{flex:none!important;overflow:visible!important}
.rt-static{position:relative!important;animation:none!important;box-shadow:none}
.mark[data-logo] img.mark-art{display:block}
.panel:is([data-rt-theme=doom],[data-rt-theme=minecraft]) img.mark-art{image-rendering:pixelated}
:host([data-card]) *,:host([data-card]) *::before,:host([data-card]) *::after{animation-play-state:paused!important;transition:none!important}
.preview-note{margin:2px 0 10px}`;
 function styles(){
  if(sheet)return sheet;
  try{sheet=new CSSStyleSheet();sheet.replaceSync(UI.css+'\n'+PREVIEW_CSS);}catch{sheet=null;}
  return sheet;
 }
 // The real panel parts: without ids for the cards; the large preview keeps them (it has its own
 // shadow root) so the theme's extras find their places, and gets the extras' slots (v2.22).
 const template=(()=>{const t=document.createElement('template');t.innerHTML=UI.html;return t;})();
 function cut(ids){const pick=s=>template.content.querySelector(s),out={};
  for(const [k,s] of [['bar','.bar'],['tally','.tally'],['stats','.stats'],['tabs','.tabs'],['foot','.foot'],['deck','#fxDeck'],['footSlot','#fxFoot'],['layer','#fxLayer']]){const n=pick(s)?.cloneNode(true);if(!n)continue;if(!ids)for(const e of [n,...n.querySelectorAll('[id]')])e.removeAttribute('id');out[k]=n;}
  return out;}
 const parts=cut(false),stageParts=cut(true);

 function panelFor(theme,{card=false,state='speaking'}={}){
  const P=card?parts:stageParts;
  const panel=document.createElement('aside');panel.className='panel';panel.dataset.rtTheme=theme;panel.dataset.voice='true';panel.dataset.platform='chrome';
  const bar=P.bar.cloneNode(true),mark=bar.querySelector('.mark');
  if(mark){mark.querySelector('canvas')?.remove();const img=document.createElement('img');img.className='mark-art';img.alt='';img.src='ui/logos/'+theme+'.png';if(PIXEL.has(theme))img.style.imageRendering='pixelated';mark.append(img);mark.dataset.logo=theme;sharp(img,theme);}
  const sub=bar.querySelector('.ident-sub');if(sub)sub.textContent='Chrome · voice and chat';
  const st=card?STATES[0]:STATES.find(x=>x[0]===state)||STATES[2];
  const tally=P.tally.cloneNode(true);tally.dataset.state=st[0]==='success'?'ready':st[0];if(st[0]==='success')tally.dataset.flash='ok';
  const label=tally.querySelector('.tally-label'),text=tally.querySelector('.tally-text');
  if(label)label.textContent=st[2];if(text){text.textContent=st[3];text.removeAttribute('role');}
  const stats=P.stats.cloneNode(true),vals=['Idle','$0.0314','1.6 s'],metas=['Bridge ready','23.4K tokens','Text + speech'];
  stats.querySelectorAll('dd').forEach((d,i)=>d.textContent=vals[i]||'');stats.querySelectorAll('small').forEach((s,i)=>s.textContent=metas[i]||'');
  panel.append(bar,tally,stats);if(!card&&P.deck)panel.append(P.deck.cloneNode(true));panel.append(P.tabs.cloneNode(true));
  if(!card){
   const scroll=document.createElement('div');scroll.className='scroll';
   scroll.innerHTML=`<h2>Conversation</h2><p class="hint preview-note">Sample preview. Nothing here is sent anywhere.</p>
<label>Ask Tyler<input type="text" value="Who’s throwing this match?"></label>
<div class="btn-row"><button class="btn primary" type="button">${icon('play')}Connect &amp; start</button><button class="btn" type="button">${icon('pause')}Pause</button></div>
<label>Participation<select><option>Active conversation</option></select></label>
<div class="rt-toast rt-static" data-kind="success" data-n="01">${icon('success')}<p class="rt-toast-title">Connected</p><p class="rt-toast-text">Voice and text switch automatically with the room.</p><button class="rt-x" type="button" aria-label="Dismiss">${icon('close')}</button></div>`;
   panel.append(scroll);if(P.footSlot)panel.append(P.footSlot.cloneNode(true));panel.append(P.foot.cloneNode(true));if(P.layer)panel.append(P.layer.cloneNode(true));
  }
  return panel;
 }
 function render(host,theme,opts){
  let root=host.shadowRoot;if(!root){root=host.attachShadow({mode:'open'});const s=styles();if(s)root.adoptedStyleSheets=[s];else{const st=document.createElement('style');st.textContent=UI.css+PREVIEW_CSS;root.append(st);}}
  for(const n of [...root.childNodes])if(n.nodeName!=='STYLE')n.remove();
  const panel=panelFor(theme,opts);root.append(panel);host.inert=true;
  // v2.28: the theme's branded icons (ui-brand.js) on the preview's tabs and buttons, and its status badge.
  globalThis.TylerBrand?.apply(root,theme);globalThis.TylerBrand?.badge(panel.querySelector('.tally'),theme);
  return {root,panel};
 }

 // ── v2.22: the theme's own extras in the large preview ───────────────────
 // The real feature code from the theme packs (theme-showcase.js lets them register here), mounted
 // with sample numbers. Every action does nothing and keys aren't taken: the preview is inert, and
 // nothing reaches Steam, the call or an AI provider.
 const FX=globalThis.TylerThemeFeatures?.showcase?globalThis.TylerThemeFeatures:null;
 const REDUCED=globalThis.matchMedia?.('(prefers-reduced-motion: reduce)');
 const SOUNDS=['Airhorn','Drumroll','Sad trombone','Victory','Applause','Laser','Coin','Bruh','Rimshot'].map((name,i)=>({slot:i+1,name}));
 let live=null,lastTheme='';
 function mountExtras(root,panel,theme,stateKey){
  live?.destroy();live=null;if(!FX)return;const first=theme!==lastTheme;lastTheme=theme;
  const features=FX.features(theme);if(!features.length)return;
  const $=id=>root.getElementById(id),slots={bar:$('fxBar'),deck:$('fxDeck'),foot:$('fxFoot'),layer:$('fxLayer')};if(!slots.deck||!slots.layer)return;
  const t0=Date.now(),st=STATES.find(x=>x[0]===stateKey)||STATES[2],state=st[0]==='success'?'ready':st[0];
  const S={started:t0-754000,since:t0-4000,state,label:st[2],text:st[3],tab:'conversation',mini:false,hud:{spend:'$0.0314',spendMeta:'23.4K tokens'},theme,
   replies:12,spoken:7,heard:41,errors:1,sounds:5,lastSound:'Airhorn',music:'Sample song',musicBy:'',turns:[1650,1420,2100,980,1300],thinkingSince:state==='thinking'?t0-800:0,streak:4,best:9,
   errorAt:[],log:[{at:t0-60000,kind:'reply',text:'Replied in chat (42 characters)'},{at:t0-42000,kind:'spoke',text:'Spoke in voice'},{at:t0-20000,kind:'sound',text:'Played Airhorn'},{at:t0-9000,kind:'state',text:st[2]}],
   spend:0.0314,tokens:'23.4K tokens',chatBurst:0,flood:false,model:'Sample model',provider:'',keyOk:true};
  const life={v:1,replies:340,spoken:128,heard:2100,sounds:64,songs:14,errors:9,turns:468,turnMs:468*1500,fastest:620,bestStreak:31,sessions:23,timeMs:5.4e7,ach:[],firstAt:t0-30*864e5,best:{ricochet:48200}};
  const noop=()=>{},timers=new Set(),own=new Set(),offs=[],mounted=[];
  const health=()=>state==='error'?25:state==='paused'||state==='standby'?60:state==='waiting'?70:100;
  const voice=()=>({armed:true,inCall:true,peers:3,attached:1});
  const systems=()=>[{id:'ai',name:'AI',tab:'setup',level:state==='error'?1:3,detail:'Sample model'},{id:'chat',name:'Chat',tab:'setup',level:3,detail:'Watching chat'},{id:'voice',name:'Voice',tab:'checks',level:3,detail:'3 in call'},{id:'music',name:'Music',tab:'room',level:3,detail:S.music}];
  const actions={tab:noop,pause:noop,stopAudio:noop,beep:noop,checks:noop,collapse:noop,settings:noop,playSound:noop,sounds:()=>({slots:SOUNDS,favorites:[1,3]}),fullCheck:noop,connect:noop,refreshVoice:noop,paused:()=>state==='paused'||state==='standby'};
  const h=(tag,cls,txt)=>{const e=document.createElement(tag);if(cls)e.className=cls;if(txt!=null)e.textContent=txt;return e;};
  const svg=(markup,cls)=>{const t=document.createElement('template');t.innerHTML=markup.trim();const e=t.content.firstElementChild;if(cls)e.classList.add(...cls.split(' '));return e;};
  const ms=v=>!Number.isFinite(v)?'—':v<1000?Math.round(v)+' ms':(v/1000).toFixed(v<10000?1:0)+' s';
  const clock=v=>{const x=Math.max(0,Math.floor(v/1000)),m=Math.floor(x/60),hh=Math.floor(m/60);return (hh?hh+':'+String(m%60).padStart(2,'0'):String(m))+':'+String(x%60).padStart(2,'0');};
  const pad=(n,w=2)=>String(Math.max(0,Math.floor(n))).padStart(w,'0');
  const TABS=['conversation','room','soundboard','setup','checks'],TAB_NAMES={conversation:'Chat',room:'Room',soundboard:'Sounds',setup:'Setup',checks:'Checks'};
  const later=(fn,d)=>{const x=setTimeout(()=>{timers.delete(x);fn();},d);timers.add(x);return x;};
  const ctx={S,api:{},actions,h,svg,ms,clock,pad,health,avgTurn:()=>1500,voice,systems,TABS,TAB_NAMES,root,panel,slots,life,unlock:()=>false,_session:new Set(),
   best:(k,v)=>Math.max(v,Number(life.best[k])||0),get reduced(){return !!REDUCED?.matches;},
   add(slot,el){(slots[slot]||slots.deck).append(el);own.add(el);return el;},later,cancel(x){clearTimeout(x);timers.delete(x);},every:noop,key:noop,
   on(target,type,fn,o){target.addEventListener(type,fn,o);offs.push(()=>target.removeEventListener(type,fn,o));},
   flash(el,l=1800){slots.layer.append(el);own.add(el);later(()=>el.remove(),l);return el;},
   // v2.28: the theme's branded icons (ui-brand.js), as in the real panel.
   brand(id,cls='fx-bi'){return globalThis.TylerBrand?.el?.(panel.dataset.rtTheme,id,cls)||null;},
   below(sel){const el=root.querySelector(sel),p=panel.getBoundingClientRect();return el?Math.round(el.getBoundingClientRect().bottom-p.top):0;},
   menu:()=>({el:null,close:noop}),overlay:()=>({el:h('div'),close:noop}),
   /** Set only here: the gallery's preview, and whether this theme was just picked (not a state change). */
   preview:{first}};
  for(const f of features){try{mounted.push({id:f.id,instance:f.mount(ctx)||{}});}catch{}}
  panel.dataset.fx=mounted.map(m=>m.id).join(' ');for(const slot of Object.values(slots))slot?.toggleAttribute('data-filled',!!slot.childElementCount);
  // The chosen state arrives as it would in the panel; Success is a passed full check after a problem.
  const send=(type,data)=>{for(const m of mounted){try{m.instance.update?.(type,data);}catch{}}};
  later(()=>{if(st[0]==='success'){send('state',{state:'ready',before:'error',label:'Ready',text:st[3]});send('check',{problems:0,unsure:0});}
   else if(state!=='listening')send('state',{state,before:'listening',label:st[2],text:st[3]});
   if(state==='speaking')send('turn',{ms:1420});},120);
  live={destroy(){for(const m of mounted){try{m.instance.unmount?.();}catch{}}for(const x of timers)clearTimeout(x);timers.clear();for(const el of own)el.remove();own.clear();for(const off of offs)off();}};
 }

 // ── Cards ─────────────────────────────────────────────────────────────────
 let applied=T.current(),selected=applied,touched=false;
 const cards=new Map();
 for(const theme of T.themes){
  const [name,,light]=T.info[theme];
  const card=document.createElement('div');card.className='tg-card';card.dataset.theme=theme;card.setAttribute('role','radio');
  const shot=document.createElement('div');shot.className='tg-shot';const host=document.createElement('div');host.className='tg-host';host.dataset.card='';shot.append(host);
  const meta=document.createElement('div');meta.className='tg-meta';
  const logo=document.createElement('img');logo.className='tg-logo';logo.alt='';logo.src='ui/logos/'+theme+'.png';if(PIXEL.has(theme))logo.style.imageRendering='pixelated';sharp(logo,theme);
  const title=document.createElement('span');title.className='tg-name';title.textContent=name;
  const badge=document.createElement('span');badge.className='tg-badge';badge.textContent='In use';
  meta.append(logo,title);
  // v2.28: the theme's emblem from its branded icon pack, beside its name.
  const B=globalThis.TylerBrand,mk=B?.mark(theme);if(mk){const em=B.el(theme,mk,'tg-bi');em.setAttribute('aria-hidden','true');meta.append(em);}
  if(light){const tag=document.createElement('span');tag.className='tg-tag';tag.textContent='Light';meta.append(tag);}meta.append(badge);
  card.append(shot,meta);gallery.append(card);cards.set(theme,card);
  render(host,theme,{card:true});
  card.addEventListener('click',()=>select(theme,true));
 }
 // Arrow keys move between cards (one tab stop for the whole gallery), Space/Enter picks.
 gallery.addEventListener('keydown',e=>{
  const order=T.themes,i=order.indexOf(selected);let next=null;
  const cols=Math.max(1,Math.round(gallery.clientWidth/(cards.get(order[0]).offsetWidth||1)));
  if(e.key==='ArrowRight')next=order[(i+1)%order.length];else if(e.key==='ArrowLeft')next=order[(i-1+order.length)%order.length];
  else if(e.key==='ArrowDown')next=order[Math.min(order.length-1,i+cols)];else if(e.key==='ArrowUp')next=order[Math.max(0,i-cols)];
  else if(e.key==='Home')next=order[0];else if(e.key==='End')next=order[order.length-1];
  else if(e.key===' '||e.key==='Enter'){e.preventDefault();select(selected,true);return;}
  if(next){e.preventDefault();select(next,true);}
 });

 // ── Large preview and Apply ──────────────────────────────────────────────
 const $=id=>document.getElementById(id);
 const apply=$('tgApply'),state=$('tgState'),stageHost=stage.querySelector('.tg-host');
 function show(){const {root,panel}=render(stageHost,selected,{card:false,state:stageState});mountExtras(root,panel,selected,stageState);}
 // v2.22: buttons to see the theme in each activity state, with its extras reacting.
 const picker=document.createElement('div');picker.className='tg-states';picker.setAttribute('role','group');picker.setAttribute('aria-label','Preview state');
 for(const [key,name] of STATES){const b=document.createElement('button');b.type='button';b.className='tg-state';b.dataset.state=key;b.textContent=name;b.setAttribute('aria-pressed',String(key===stageState));
  b.addEventListener('click',()=>{stageState=key;for(const x of picker.children)x.setAttribute('aria-pressed',String(x===b));show();});picker.append(b);}
 stage.querySelector('.tg-stage-preview')?.before(picker);
 function refresh(){
  for(const [theme,card] of cards){
   const on=theme===selected,[name,,light]=T.info[theme];
   card.setAttribute('aria-checked',String(on));card.tabIndex=on?0:-1;card.dataset.applied=String(theme===applied);
   card.setAttribute('aria-label',name+(light?', light theme':'')+(theme===applied?', in use':''));
  }
  const [name,desc,light]=T.info[selected];
  $('tgName').textContent=name;$('tgDesc').textContent=desc+(light?' Light theme.':'');
  const extras=document.getElementById('tgExtras');if(extras)extras.textContent=EXTRAS[selected]?'In the panel: '+EXTRAS[selected]:'';
  const logo=$('tgLogo');if(logo.dataset.theme!==selected){logo.removeAttribute('srcset');logo.src='ui/logos/'+selected+'.png';logo.dataset.theme=selected;}logo.style.imageRendering=PIXEL.has(selected)?'pixelated':'';sharp(logo,selected);
  const same=selected===applied;apply.disabled=same;
  apply.querySelector('.lbl').textContent=same?'In use':'Apply '+name;
  state.textContent=same?'This is the theme every Tyler window uses now.':'Previewing '+name+'. Nothing changes until you press Apply.';
 }
 function select(theme,focus=false){
  if(!T.themes.includes(theme))return;if(focus)touched=true;selected=theme;show();refresh();
  if(focus)cards.get(theme).focus();
 }
 apply.insertAdjacentHTML('afterbegin',icon('check'));
 apply.addEventListener('click',async()=>{
  const previous=applied,theme=selected,name=T.info[theme][0];apply.disabled=true;
  try{await T.save(theme);applied=theme;refresh();
   kit()?.toast({kind:'success',title:'Theme applied',text:'Every ROBOTIC TYLER window now uses '+name+'.',action:{label:'Undo',run:async()=>{try{await T.save(previous);applied=previous;select(previous);}catch{}}}});
  }catch(error){apply.disabled=false;kit()?.toast({kind:'error',title:'Couldn’t save the theme',text:String(error?.message||error)||'The setting could not be stored.',action:{label:'Try again',run:()=>apply.click()}});}
 });
 // A theme applied elsewhere (another settings window, Undo) moves the "In use" badge.
 T.onChange(theme=>{applied=theme;if(!touched&&selected!==theme)select(theme);else refresh();});
 select(selected);
})();

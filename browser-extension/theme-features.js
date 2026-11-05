// Theme features (v2.20): each of the 20 themes adds its own components to Tyler's panel: instruments
// that show what Tyler is really doing, game-style navigation, notifications and easter eggs. The
// packs (theme-pack-1/2/3.js) define them; this file keeps the live state they read and mounts only
// the current theme's features, so the other 19 cost nothing. Every feature is an extra way to see
// or reach something the panel already has: no capability depends on a theme.
//
// Live state comes from content.js events (state, theme, tab, hud, mini, reply) and from the feature
// modules (chat, sound, music). Nothing here reads chat text, and nothing is stored.
(() => {
 'use strict';
 const api=globalThis.TylerCompanion,ui=api?.ui;
 if(!ui||globalThis.TylerThemeFeatures)return;
 const {root,panel}=ui;const $=id=>root.getElementById(id);
 const slots={bar:$('fxBar'),deck:$('fxDeck'),foot:$('fxFoot'),layer:$('fxLayer')};
 if(!slots.deck||!slots.layer)return;
 const reduced=globalThis.matchMedia?.('(prefers-reduced-motion: reduce)');

 // ── Live state ────────────────────────────────────────────────────────────
 const now=()=>Date.now();
 const S={started:now(),since:now(),state:'ready',label:'Ready',text:'',tab:'conversation',mini:false,hud:{},theme:'steam',
  replies:0,spoken:0,heard:0,errors:0,sounds:0,lastSound:'',music:'',musicBy:'',turns:[],thinkingSince:0,streak:0,best:0,
  errorAt:[],log:[],spend:0,tokens:'',chatBurst:0,flood:false,model:'',provider:'',keyOk:null};
 const parseMoney=v=>Number(String(v||'').replace(/[^0-9.]/g,''))||0;
 function log(kind,text){S.log.push({at:now(),kind,text:String(text).slice(0,140)});if(S.log.length>80)S.log.shift();}
 /** 0–100: knocked down by recent errors, back up as time passes without one. */
 function health(){
  const t=now();S.errorAt=S.errorAt.filter(a=>t-a<300000);
  let h=100-S.errorAt.reduce((n,a)=>n+Math.max(0,30-Math.floor((t-a)/10000)),0);
  if(S.state==='error')h=Math.min(h,25);if(S.state==='paused'||S.state==='standby')h=Math.min(h,60);
  return Math.max(1,Math.min(100,h));
 }
 const avgTurn=()=>S.turns.length?S.turns.slice(-8).reduce((a,b)=>a+b,0)/Math.min(8,S.turns.length):2500;
 // People in the call: the incoming voice tracks Tyler hears (a Steam call is one connection with a
 // track per person), counted only while his microphone is on.
 function voice(){const v=api.getVoiceState?.()||null,heard=api.getIncoming?.()||null;const armed=!!v?.enabled,inCall=Number(v?.connectedPeers)>0;
  return {armed,inCall,peers:armed&&inCall?Math.max(0,Number(heard?.tracks)||0):0,attached:Number(v?.attached)||0};}

 // ── Lifetime stats (v2.20.1): kept between sessions unless Settings → Appearance turns it off ─
 // Counts only (no chat text, no names): replies, voice replies, messages heard, sounds, songs,
 // problems, reply times, best streak, sessions, time and the achievements a theme unlocked.
 const LIFE0={v:1,replies:0,spoken:0,heard:0,sounds:0,songs:0,errors:0,turns:0,turnMs:0,fastest:0,bestStreak:0,sessions:0,timeMs:0,ach:[],firstAt:0,best:{}};
 let life=null,lifeTimer=0,lifeMark=now();
 function lifeSave(soon=true){if(!life)return;clearTimeout(lifeTimer);const run=()=>{if(!life)return;const t=now();if(!document.hidden)life.timeMs+=Math.min(t-lifeMark,120000);lifeMark=t;void globalThis.TylerStorage?.set?.({tylerLifetime:life}).catch(()=>{});};if(soon)lifeTimer=setTimeout(run,4000);else run();}
 function bump(key,n=1){if(!life)return;life[key]=(Number(life[key])||0)+n;lifeSave();}
 async function lifeLoad(){
  try{const r=await globalThis.TylerStorage?.get?.(['tylerLifetime','themeStats']);
   if(r?.themeStats===false){life=null;}else{const saved=r?.tylerLifetime;life={...LIFE0,...(saved&&saved.v===1?saved:{}),best:{...(saved?.best||{})},ach:Array.isArray(saved?.ach)?saved.ach.slice(0,200):[]};life.sessions++;if(!life.firstAt)life.firstAt=now();lifeSave();}
   deliver('life',{});}catch{}
 }
 document.addEventListener('visibilitychange',()=>{if(document.hidden)lifeSave(false);else lifeMark=now();});
 addEventListener('pagehide',()=>lifeSave(false));
 function systems(){
  const v=voice(),chat=!!(api.getComposer?.()?.isConnected&&api.getRegion?.()?.isConnected);
  return [
   {id:'ai',name:'AI',tab:'setup',level:S.keyOk===false?0:S.state==='error'&&/key|provider|openrouter|gemini|quota|model/i.test(S.text)?1:S.keyOk?3:2,detail:S.keyOk===false?'No key saved':S.model?S.model:'Checking…'},
   {id:'chat',name:'Chat',tab:'setup',level:chat?3:1,detail:chat?'Watching chat':'Not connected'},
   {id:'voice',name:'Voice',tab:'checks',level:v.armed?(v.peers?3:2):1,detail:v.armed?(v.peers?v.peers+' in call':'Armed, call empty'):'Off'},
   {id:'music',name:'Music',tab:'room',level:S.music?3:2,detail:S.music?S.music:'Idle'},
  ];
 }
 async function refreshModel(){try{const r=await api.request?.({type:'connection'});if(r?.ok!==false){S.keyOk=!!r.keyConfigured;S.model=r.model||'';S.provider=r.provider||'';emitLocal('model');}}catch{}}

 // ── Helpers for packs ─────────────────────────────────────────────────────
 function h(tag,cls,text){const e=document.createElement(tag);if(cls)e.className=cls;if(text!=null)e.textContent=text;return e;}
 function svg(markup,cls){const t=document.createElement('template');t.innerHTML=markup.trim();const e=t.content.firstElementChild;if(cls)e.classList.add(...cls.split(' '));return e;}
 const ms=v=>!Number.isFinite(v)?'—':v<1000?Math.round(v)+' ms':(v/1000).toFixed(v<10000?1:0)+' s';
 const clock=v=>{const s=Math.max(0,Math.floor(v/1000)),m=Math.floor(s/60),hh=Math.floor(m/60);return (hh?hh+':'+String(m%60).padStart(2,'0'):String(m))+':'+String(s%60).padStart(2,'0');};
 const pad=(n,w=2)=>String(Math.max(0,Math.floor(n))).padStart(w,'0');
 const TABS=['conversation','room','soundboard','setup','checks'];
 const TAB_NAMES={conversation:'Chat',room:'Room',soundboard:'Sounds',setup:'Setup',checks:'Checks'};
 const actions={
  tab:name=>api.showTab?.(name),pause:()=>$('quickStop')?.click(),stopAudio:()=>$('stop')?.click(),beep:()=>$('beep')?.click(),
  checks:()=>api.showTab?.('checks'),collapse:()=>$('collapse')?.click(),settings:()=>$('settings')?.click(),
  playSound:slot=>api.playSound?.(slot),sounds:()=>api.listSounds?.()||{slots:[],favorites:[]},
  // v2.22: the full check (Checks tab → Run full check) and whether Tyler is paused right now.
  fullCheck:()=>{api.showTab?.('checks');const b=$('diagnose');if(b&&!b.disabled)b.click();},
  connect:()=>{api.showTab?.('conversation');$('connect')?.click();},
  refreshVoice:()=>{const b=$('voiceCheck');if(b&&!b.disabled)b.click();},
  paused:()=>S.state==='paused'||S.state==='standby',
 };

 // ── Mounting ──────────────────────────────────────────────────────────────
 const packs=new Map();let mounted=[],hovering=false,ticker=0;
 panel.addEventListener('pointerenter',()=>hovering=true);panel.addEventListener('pointerleave',()=>hovering=false);
 /** Keys are only taken while the pointer is over the panel or focus is inside it, never while typing. */
 const typing=el=>!!el?.matches?.('input,textarea,select,[contenteditable=true],[contenteditable=""],[role=textbox]');
 function keyActive(e){
  if(S.mini||e.ctrlKey||e.metaKey||e.altKey)return false;
  // The panel's shadow root is closed in Steam's page: from the document, keys typed inside it come
  // from the host element, and the shadow root knows what has focus.
  const inPanel=e.target===ui.host||e.composedPath().includes(panel);
  if(inPanel)return !typing(root.activeElement)&&!typing(e.composedPath()[0]);
  if(typing(document.activeElement))return false;
  return hovering;
 }
 const sessionUnlocks=new Set(); // achievements this session when lifetime stats are off (shared by a theme's features)
 function makeCtx(){
  const own=new Set(),timers=new Set(),offs=[];let tick=null;
  const ctx={S,api,actions,h,svg,ms,clock,pad,health,avgTurn,voice,systems,TABS,TAB_NAMES,root,panel,slots,
   /** Lifetime totals, or null when Settings turns them off. */
   get life(){return life;},
   /** Unlock a lifetime achievement once; true the first time (also when lifetime stats are off, per session). */
   unlock(key){if(life){if(life.ach.includes(key))return false;life.ach.push(key);lifeSave();return true;}if(ctx._session.has(key))return false;ctx._session.add(key);return true;},_session:sessionUnlocks,
   /** A theme's best value (high score…), kept with the lifetime totals. */
   best(key,value){if(!life)return value;const old=Number(life.best[key])||0;if(value>old){life.best[key]=value;lifeSave();}return Math.max(old,value);},
   get reduced(){return !!reduced?.matches;},
   add(slot,el){(slots[slot]||slots.deck).append(el);own.add(el);return el;},
   later(fn,delay){const t=setTimeout(()=>{timers.delete(t);fn();},delay);timers.add(t);return t;},
   cancel(t){clearTimeout(t);timers.delete(t);},
   every(fn){tick=fn;start();},
   key(fn,opts={}){const k=e=>{if(keyActive(e)&&(!opts.focus||e.target===ui.host||e.composedPath().includes(panel)))fn(e);};document.addEventListener('keydown',k,true);offs.push(()=>document.removeEventListener('keydown',k,true));},
   on(target,type,fn,opts){target.addEventListener(type,fn,opts);offs.push(()=>target.removeEventListener(type,fn,opts));},
   /** A short-lived element in the overlay layer (notifications, transitions). */
   flash(el,life=1800){slots.layer.append(el);own.add(el);ctx.later(()=>{el.remove();own.delete(el);},life);return el;},
   /** One of the current theme's branded icons (v2.28, ui-brand.js), or null if it has none. */
   brand(id,cls='fx-bi'){const g=globalThis.TylerBrand;return g?.el?.(S.theme,id,cls)||null;},
   destroy(){try{this?._menu?.close?.(false);this?._overlay?.close?.();}catch{}for(const t of timers)clearTimeout(t);timers.clear();for(const el of own)el.remove();own.clear();for(const off of offs)off();tick=null;},
   get tick(){return tick;},
   /** Pixels from the panel's top to the bottom of an element (to place overlays under the tabs, say). */
   below(selector){const el=root.querySelector(selector),p=panel.getBoundingClientRect();return el?Math.round(el.getBoundingClientRect().bottom-p.top):0;},
   /**
    * v2.22: a themed menu of real actions next to `anchor` (or at x/y in the panel). Items:
    * {label, hint, mark, run, disabled, current} or 'sep'. Arrow keys, Home/End, Enter and Escape work;
    * a click outside closes it and focus goes back to the anchor. Returns {el, close}.
    */
   menu(anchor,items,{cls='',label='Menu',x,y,align='left'}={}){
    ctx._menu?.close();
    const el=h('div','fx fx-menu fx-interactive '+cls);el.setAttribute('role','menu');el.setAttribute('aria-label',label);
    const buttons=[];
    for(const it of items){
     if(it==='sep'){el.append(h('i','fx-menu-sep'));continue;}
     if(it.heading){el.append(h('b','fx-menu-head',it.heading));continue;}
     const b=h('button','fx-menu-item');b.type='button';b.setAttribute('role','menuitem');if(it.current)b.setAttribute('aria-current','true');if(it.disabled)b.disabled=true;
     // v2.28: a menu item can show one of the theme's branded icons (ui-brand.js) instead of a symbol.
     const bi=it.icon?ctx.brand(it.icon,'fx-menu-bi'):null;if(bi){const m=h('span','fx-menu-mark fx-menu-mark-bi');m.append(bi);b.append(m);}else if(it.mark!==undefined)b.append(h('span','fx-menu-mark',it.mark));b.append(h('span','fx-menu-label',it.label));if(it.hint)b.append(h('small','fx-menu-hint',it.hint));
     b.onclick=()=>{close();it.run?.();};el.append(b);buttons.push(b);
    }
    const p=panel.getBoundingClientRect();let left=x,top=y;
    if(anchor&&left===undefined){const r=anchor.getBoundingClientRect();top=Math.round(r.bottom-p.top+4);left=Math.round((align==='right'?r.right:r.left)-p.left);}
    el.style.top=(top??60)+'px';if(align==='right'){el.style.right=Math.max(6,Math.round(p.width-(left??p.width-8)))+'px';}else el.style.left=Math.max(6,Math.min(left??8,p.width-200))+'px';
    const move=(i)=>{const list=buttons.filter(b=>!b.disabled);if(!list.length)return;const at=list.indexOf(root.activeElement);list[(i==='first'?0:i==='last'?list.length-1:(at+i+list.length)%list.length)]?.focus();};
    el.addEventListener('keydown',e=>{if(e.key==='ArrowDown'){e.preventDefault();move(1);}else if(e.key==='ArrowUp'){e.preventDefault();move(-1);}else if(e.key==='Home'){e.preventDefault();move('first');}else if(e.key==='End'){e.preventDefault();move('last');}else if(e.key==='Escape'){e.preventDefault();e.stopPropagation();close();}else if(e.key==='Tab'){close(false);}});
    const outside=e=>{if(!e.composedPath().includes(el)&&!e.composedPath().includes(anchor))close(false);};
    function close(refocus=true){if(!el.isConnected)return;el.remove();own.delete(el);root.removeEventListener('pointerdown',outside,true);anchor?.setAttribute?.('aria-expanded','false');if(ctx._menu?.el===el)ctx._menu=null;if(refocus)anchor?.focus?.();}
    slots.layer.append(el);own.add(el);root.addEventListener('pointerdown',outside,true);anchor?.setAttribute?.('aria-expanded','true');
    (buttons.find(b=>b.getAttribute('aria-current')==='true'&&!b.disabled)||buttons.find(b=>!b.disabled))?.focus();
    ctx._menu={el,close};return ctx._menu;
   },
   /** v2.22: a themed panel over the content, under the tabs (Escape or its close button shuts it). */
   overlay(cls,label,{onClose}={}){
    ctx._overlay?.close();
    const el=h('div','fx fx-overlay fx-interactive '+cls);el.setAttribute('role','dialog');el.setAttribute('aria-label',label);el.style.setProperty('--fx-top',(ctx.below('.tabs')+6)+'px');
    el.addEventListener('keydown',e=>{if(e.key==='Escape'){e.preventDefault();e.stopPropagation();close();}});
    function close(){if(!el.isConnected)return;el.remove();own.delete(el);if(ctx._overlay?.el===el)ctx._overlay=null;onClose?.();}
    slots.layer.append(el);own.add(el);ctx._overlay={el,close};
    // Filled by the caller right after this returns: if it doesn't fit under the tabs (a short window,
    // a tall deck), it moves up under the header instead and starts at its top.
    requestAnimationFrame(()=>{if(el.isConnected&&el.scrollHeight>el.clientHeight+2){el.style.setProperty('--fx-top',(ctx.below('.bar')+6)+'px');el.scrollTop=0;}});
    return ctx._overlay;
   },
  };
  return ctx;
 }
 function start(){if(ticker)return;ticker=setInterval(()=>{if(document.hidden||api.isOffscreen?.()||S.mini&&S.theme!=='dreamcast')return;for(const m of mounted){try{m.ctx.tick?.();}catch(e){console.warn('[ROBOTIC TYLER] theme feature tick:',e?.message);}}},1000);}
 function stopTicker(){if(ticker&&!mounted.some(m=>m.ctx.tick)){clearInterval(ticker);ticker=0;}}
 function unmount(){for(const m of mounted){try{m.instance?.unmount?.();}catch{}m.ctx.destroy();}mounted=[];panel.removeAttribute('data-fx');stopTicker();}
 // v2.28: the original themes' branded icons (ui-brand.js): the panel's own icons (tabs, buttons,
 // notifications) take the theme's drawing where it has one, and the status strip shows a badge for
 // Tyler's real state where the theme has one for it (CSS picks it from the strip's data-state).
 function brand(theme){const B=globalThis.TylerBrand;if(!B)return;B.apply(root,theme);B.badge?.(root.querySelector('.tally'),theme);}
 function mount(theme){
  unmount();S.theme=theme;brand(theme);const list=packs.get(theme)||[];
  for(const feature of list){const ctx=makeCtx();try{const instance=feature.mount(ctx)||{};mounted.push({feature,ctx,instance});}catch(error){ctx.destroy();console.warn('[ROBOTIC TYLER] theme feature '+feature.id+':',error?.message||error);}}
  panel.dataset.fx=mounted.map(m=>m.feature.id).join(' ');
  for(const slot of Object.values(slots))slot?.toggleAttribute('data-filled',!!slot.childElementCount);
  stopTicker();if(mounted.some(m=>m.ctx.tick))start();
 }
 // v2.22: a short success or failure flash on the status strip: a full check's verdict, or Tyler
 // coming back after a problem. Themes style .tally[data-flash=ok|fail]; reduced motion keeps it still.
 let flashTimer=0;
 function flashTally(kind){const t=root.querySelector('.tally');if(!t)return;clearTimeout(flashTimer);t.removeAttribute('data-flash');void t.offsetWidth;t.dataset.flash=kind;flashTimer=setTimeout(()=>t.removeAttribute('data-flash'),1400);}
 function deliver(type,data){if(type==='check')flashTally(data?.problems?'fail':'ok');if(type==='state'&&data?.before==='error'&&['ready','listening'].includes(data?.state))flashTally('ok');for(const m of mounted){try{m.instance?.update?.(type,data);}catch(error){console.warn('[ROBOTIC TYLER] theme feature '+m.feature.id+':',error?.message||error);}}}
 function emitLocal(type,data={}){deliver(type,data);}

 // ── The status strip, in every theme (v2.20 polish) ───────────────────────
 // How long Tyler has been listening, thinking or talking; a pulse in the state's colour on every
 // change; the full status as a tooltip; and --fx-health for themes that show Tyler's health.
 const tally=$('activityCard'),tallyHead=tally?.querySelector('.tally-head'),tallyLabel=$('activityLabel');
 const timer=document.createElement('span');timer.className='tally-time';timer.setAttribute('aria-hidden','true');
 const pulse=document.createElement('span');pulse.className='tally-pulse';pulse.setAttribute('aria-hidden','true');
 if(tallyLabel&&tallyHead){tallyLabel.after(timer);tally.prepend(pulse);}
 const TIMED=new Set(['listening','thinking','speaking','waiting']);
 function strip(changed){
  const t=now(),active=TIMED.has(S.state)&&!document.hidden&&!api.isOffscreen?.();
  const sec=Math.floor((t-S.since)/1000);timer.textContent=active&&sec>=1?(sec<60?sec+'s':clock(t-S.since)):'';
  panel.style.setProperty('--fx-health',String(health()));
  if(changed){tally.title=S.label+(S.text?': '+S.text:'')+' · since '+new Date(S.since).toLocaleTimeString();
   if(!reduced?.matches){pulse.classList.remove('on');void pulse.offsetWidth;pulse.classList.add('on');}}
 }
 setInterval(()=>{if(TIMED.has(S.state)||timer.textContent)strip(false);},1000);

 // ── Events from the panel ─────────────────────────────────────────────────
 ui.onUI((type,data)=>{
  const t=now();
  if(type==='theme'){if(data.theme!==S.theme||!mounted.length)mount(data.theme);return;}
  if(type==='state'){
   const prev=S.state;if(data.state!==prev)S.since=t;
   S.state=data.state;S.label=data.label;S.text=data.text||'';
   if(data.state==='thinking'&&prev!=='thinking')S.thinkingSince=t;
   if(data.state==='speaking'&&prev!=='speaking'){S.spoken++;turnDone(t);log('spoke','Spoke in voice');}
   if(data.state==='error'&&prev!=='error'){S.errors++;S.errorAt.push(t);S.streak=0;bump('errors');log('error',S.text||'Needs attention');}
   if(data.state==='speaking'&&prev!=='speaking')bump('spoken');
   if(data.state!==prev&&data.state!=='error')log('state',data.label);
  }
  if(type==='state')strip(data.state!==data.before);
  if(type==='tab')S.tab=data.tab;
  if(type==='mini')S.mini=!!data.mini;
  if(type==='hud'){S.hud=data;S.spend=parseMoney(data.spend);S.tokens=data.spendMeta||'';}
  if(type==='reply'&&data?.kind==='game')return;
  if(type==='reply'){S.replies++;bump('replies');turnDone(t);log('reply','Replied in chat ('+data.chars+' characters)');}
  if(type==='chat'){S.heard++;bump('heard');S.chatBurst=data.recent||0;S.flood=!!data.flood;}
  if(type==='sound'){S.sounds++;bump('sounds');S.lastSound=data.name||'';log('sound','Played '+S.lastSound);}
  if(type==='music'){S.music=data.title||'';S.musicBy=data.by||'';if(S.music){bump('songs');log('music','Now playing '+S.music);}}
  // Automatic replies and Gemini Live measure their own time: use it for the turn just counted.
  // The reply's own timing (automatic.js / Live) replaces the state-based estimate of the same turn.
  if(type==='report'){const last=S.turns.length-1,ms=Math.max(1,Number(data.ms)||0);
   if(last>=0&&t-S.lastTurnAt<4000){const old=S.turns[last];S.turns[last]=ms;if(life&&S.lastLife){life.turnMs+=ms-old;life.fastest=S.lastLife.fastest?Math.min(S.lastLife.fastest,ms):ms;lifeSave();}S.lastLife=null;}
   else if(!S.thinkingSince){S.turns.push(ms);if(S.turns.length>40)S.turns.shift();if(life){life.turns++;life.turnMs+=ms;life.fastest=life.fastest?Math.min(life.fastest,ms):ms;lifeSave();}}}
  deliver(type,data);
 });
 function turnDone(t){if(S.thinkingSince&&t-S.thinkingSince<120000){const d=t-S.thinkingSince;S.turns.push(d);if(S.turns.length>40)S.turns.shift();S.thinkingSince=0;S.lastTurnAt=t;S.streak++;S.best=Math.max(S.best,S.streak);
  if(life){S.lastLife={fastest:life.fastest};life.turns++;life.turnMs+=d;life.fastest=life.fastest?Math.min(life.fastest,d):d;life.bestStreak=Math.max(life.bestStreak,S.streak);lifeSave();}deliver('turn',{ms:d});}}

 globalThis.TylerThemeFeatures=Object.freeze({
  /** Packs call this once per theme with that theme's features: [{id, mount(ctx) → {update?, unmount?}}]. */
  define(theme,features){packs.set(theme,features);if(theme===(api.getTheme?.()||'steam'))mount(theme);},
  state:()=>S,health,systems,life:()=>life,mounted:()=>mounted.map(m=>m.feature.id),
 });
 const initial=ui.state();S.state=initial.state||'ready';S.label=initial.label||'';S.tab=initial.tab||'conversation';S.mini=!!initial.mini;S.hud=initial.hud||{};S.spend=parseMoney(S.hud.spend);S.tokens=S.hud.spendMeta||'';S.theme=initial.theme||'steam';
 void refreshModel();void lifeLoad();
 globalThis.TylerStorage?.onChanged?.addListener?.((changes,area)=>{if(area==='local'&&changes.themeStats){if(changes.themeStats.newValue===false){if(life){clearTimeout(lifeTimer);life=null;deliver('life',{});}}else if(!life)void lifeLoad();}if(area==='local'&&changes.tylerLifetime&&changes.tylerLifetime.newValue==null&&life){life={...LIFE0,sessions:1,firstAt:now()};deliver('life',{});}});
 globalThis.TylerStorage?.onChanged?.addListener?.((changes,area)=>{if(area==='local'&&(changes.aiProvider||changes.brain||changes.geminiTextModel||changes.smartRouting))void refreshModel();});
})();

// Theme features, pack 4 (v2.27): Rust, Xbox 360, iPod classic, MSN Messenger and PlayStation 3 (XMB).
// Same rules as the other packs: every control is another way to reach something the panel already
// does, the numbers are Tyler's real session, shortcut keys work only while the pointer is over the
// panel or focus is in it (never while typing), and nothing here reads chat text.
(() => {
 'use strict';
 const F=globalThis.TylerThemeFeatures;if(!F)return;
 const clamp=(v,a=0,b=1)=>Math.min(b,Math.max(a,v));
 // Two parts that belong together, mounted as one feature.
 const both=(...ms)=>c=>{const parts=ms.map(m=>m(c)||{});return {update(t,d){for(const p of parts)p.update?.(t,d);},unmount(){for(const p of parts)p.unmount?.();}};};
 const capOf=c=>{let cap=0;globalThis.TylerStorage?.get?.(['spendingCapUSD']).then(v=>{cap=Number(v?.spendingCapUSD)||0;}).catch(()=>{});return ()=>cap;};

 // ── Rust: vitals and status effects, the belt, crafting, the Tool Cupboard, wounded ─────────────
 // Small white pictograms on the coloured squares, drawn here (not Rust's own icons).
 // v2.30: Rust's own HUD symbols (Pack 2) for health, calories, hydration and Bleeding.
 const RS_HUD={health:'source-ui-health',food:'source-ui-food-cooked',water:'source-ui-cup-water',bleed:'source-ui-bleeding'};
 const RS={
  health:'<svg viewBox="0 0 16 16"><path d="M6 2.5h4v3.5h3.5v4H10v3.5H6V10H2.5V6H6z"/></svg>',
  food:'<svg viewBox="0 0 16 16"><path d="M4.5 2v4.5a1.5 1.5 0 0 0 3 0V2M6 2v12M11.5 2c-2 1.5-2 5 0 6v6"/></svg>',
  water:'<svg viewBox="0 0 16 16"><path d="M8 2.2c2.6 3.2 4 5.3 4 7.2a4 4 0 0 1-8 0c0-1.9 1.4-4 4-7.2z"/></svg>',
  priv:'<svg viewBox="0 0 16 16"><path d="M2.5 13.5v-6L8 3l5.5 4.5v6h-4v-4h-3v4z"/></svg>',
  comfort:'<svg viewBox="0 0 16 16"><path d="M3 9.5c0-1.5 1-2.5 2.5-2.5h5C12 7 13 8 13 9.5V12H3zM5 7V5.5A1.5 1.5 0 0 1 6.5 4h3A1.5 1.5 0 0 1 11 5.5V7M3 12v1.5M13 12v1.5"/></svg>',
  craft:'<svg viewBox="0 0 16 16"><path d="M9.5 2.5l4 4-2 2-4-4zM8.3 5.7L2.5 11.5l2 2 5.8-5.8"/></svg>',
  radio:'<svg viewBox="0 0 16 16"><path d="M6.5 12V4l6-1.5v8M6.5 12a1.8 1.8 0 1 1-3.6 0 1.8 1.8 0 0 1 3.6 0zM12.5 10.5a1.8 1.8 0 1 1-3.6 0 1.8 1.8 0 0 1 3.6 0z"/></svg>',
  raid:'<svg viewBox="0 0 16 16"><path d="M8 2.5l6 10.5H2zM8 6.5v3.2M8 11.2v.3"/></svg>',
  bleed:'<svg viewBox="0 0 16 16"><path d="M5.5 3c1.8 2.3 2.8 3.8 2.8 5.2a2.8 2.8 0 0 1-5.6 0c0-1.4 1-2.9 2.8-5.2zM11 6.5c1.2 1.5 1.8 2.5 1.8 3.4a1.8 1.8 0 0 1-3.6 0c0-.9.6-1.9 1.8-3.4z"/></svg>',
  scrap:'<svg viewBox="0 0 16 16"><path d="M8 5.2a2.8 2.8 0 1 0 0 5.6 2.8 2.8 0 0 0 0-5.6zM8 1.8v2M8 12.2v2M1.8 8h2M12.2 8h2M3.6 3.6l1.4 1.4M11 11l1.4 1.4M3.6 12.4L5 11M11 5l1.4-1.4"/></svg>',
  lock:'<svg viewBox="0 0 16 16"><path d="M4 7.5h8v6H4zM5.5 7.5V5.5a2.5 2.5 0 0 1 5 0v2M8 10v1.5"/></svg>',
 };
 const RUST=[
  {id:'rs-vitals',mount(c){
   const box=c.add('deck',c.h('div','fx rs-vitals'));const effects=c.h('div','rs-effects'),bars=c.h('div','rs-bars');box.append(effects,bars);
   const cap=capOf(c);
   const bar=(key,title)=>{const row=c.h('div','rs-bar rs-'+key),track=c.h('span','rs-track'),fill=c.h('i'),val=c.h('b');row.title=title;track.append(fill,val);row.append(c.brand(RS_HUD[key],'rs-ic rs-ic-b')||c.svg(RS[key],'rs-ic'),track);bars.append(row);return {fill,val};};
   const hp=bar('health','Health: Tyler’s connection health. Problems knock it down; it comes back while things work.');
   const food=bar('food','Calories: what’s left of your spending cap (Settings → AI). Full when no cap is set.');
   const water=bar('water','Hydration: how fast Tyler replies. Quick replies keep it full.');
   // Status effects stack above the vitals, as in Rust: each shows only while it applies.
   const EFFECTS=[['priv','Building privilege','Tyler is watching this chat',()=>c.systems()[1].level===3],['comfort','Comfort','Friends are in the voice call with Tyler',()=>c.voice().peers>0],
    ['craft','Crafting','Tyler is writing a reply',()=>c.S.state==='thinking'],['radio','Radio','The Music DJ is playing',()=>!!c.S.music],['raid','Raid alarm','The chat is busy: Tyler paces his replies',()=>!!c.S.flood],['bleed','Bleeding','Something needs attention: open the Checks tab',()=>c.S.state==='error']];
   const chips=EFFECTS.map(([key,label,title])=>{const e=c.h('button','rs-effect rs-'+key);e.type='button';e.title=title;e.append((RS_HUD[key]&&c.brand(RS_HUD[key],'rs-ic rs-ic-b'))||c.svg(RS[key],'rs-ic'),c.h('span',null,label));e.hidden=true;e.onclick=()=>c.actions.tab(key==='radio'?'room':key==='bleed'||key==='comfort'?'checks':'conversation');effects.append(e);return e;});
   function render(){
    const h=c.health();hp.fill.style.transform='scaleX('+(h/100).toFixed(3)+')';hp.val.textContent=String(Math.round(h));
    const k=cap(),left=k>0?clamp(1-c.S.spend/k):1;food.fill.style.transform='scaleX('+left.toFixed(3)+')';food.val.textContent=String(Math.round(left*500));
    const w=c.S.turns.length?clamp(1-(c.avgTurn()-900)/7000):1;water.fill.style.transform='scaleX('+w.toFixed(3)+')';water.val.textContent=String(Math.round(w*250));
    EFFECTS.forEach((e,i)=>{const on=!!e[3]();if(chips[i].hidden===on)chips[i].hidden=!on;});box.dataset.hurt=String(h<40);
   }
   render();c.every(render);return {update(){render();}};
  }},
  {id:'rs-belt',mount(c){
   // The belt: six slots of soundboard clips (favourites first) along the bottom, keys 1–6.
   const belt=c.add('foot',c.h('div','fx rs-belt'));belt.setAttribute('role','toolbar');belt.setAttribute('aria-label','Belt: soundboard clips');
   let slots=[],held=0,lit=0;
   function fill(){const s=c.actions.sounds(),fav=new Set(s.favorites||[]);slots=[...(s.slots||[])].sort((a,b)=>fav.has(b.slot)-fav.has(a.slot)).slice(0,6);
    belt.replaceChildren();belt.hidden=!slots.length;
    for(let i=0;i<6;i++){const it=slots[i],b=c.h('button','rs-slot');b.type='button';b.append(c.h('small',null,String(i+1)));
     if(it){b.append(c.h('b',null,it.name));b.title='Play '+it.name+' (key '+(i+1)+')';b.onclick=()=>{held=it.slot;mark();c.actions.playSound(it.slot);};if(fav.has(it.slot))b.dataset.fav='true';}else b.disabled=true;
     b.dataset.slot=it?String(it.slot):'';belt.append(b);}mark();}
   const mark=()=>{for(const b of belt.children)b.setAttribute('aria-pressed',String(!!held&&b.dataset.slot===String(held)));};
   c.key(e=>{if(!e.repeat&&/^[1-6]$/.test(e.key)){const it=slots[Number(e.key)-1];if(it){e.preventDefault();held=it.slot;mark();c.actions.playSound(it.slot);}}},{focus:true});
   fill();c.later(fill,1500);
   return {update(type,d){if(type==='sounds'){fill();return;}if(type==='sound'){held=Number(d.slot)||held;mark();const b=[...belt.children].find(x=>x.dataset.slot===String(d.slot));if(b){c.cancel(lit);b.classList.add('rs-use');lit=c.later(()=>b.classList.remove('rs-use'),900);}}if(type==='life'||type==='theme')fill();}};
  }},
  {id:'rs-craft',mount(c){
   // Crafting (Q): Tyler's actions as blueprints. Craft runs the real action; the queue at the
   // bottom right shows it until it's done (the full check: until its result arrives).
   const chip=c.add('bar',c.h('button','fx fx-chip rs-chip'));chip.type='button';chip.append(c.brand('hammer','rs-chip-bi')||c.svg(RS.craft,'rs-ic'),c.h('span',null,'Craft'));chip.title='Crafting (Q): checks, tests and Connect & start';chip.setAttribute('aria-haspopup','dialog');
   const queue=c.add('layer',c.h('div','fx rs-queue'));queue.setAttribute('aria-live','polite');
   const BP=[
    {id:'check',name:'Full check',time:'≈ 10 s',ms:30000,parts:'1 × AI request · 1 × speech preview · 1 × beep in voice',run:()=>c.actions.fullCheck(),until:'check'},
    {id:'beep',name:'Test beep',time:'1 s',ms:1500,parts:'1 × beep in Steam voice',run:()=>c.actions.beep()},
    {id:'voice',name:'Voice status',time:'2 s',ms:2000,parts:'Refreshes the call and Tyler’s microphone',run:()=>c.actions.refreshVoice()},
    {id:'start',name:'Connect & start',time:'≈ 5 s',ms:5000,parts:'Finds the chat, prepares audio, starts Tyler',run:()=>c.actions.connect()},
    {id:'sounds',name:'Soundboard',time:'now',ms:0,parts:'Opens the Sounds tab',run:()=>c.actions.tab('soundboard')},
    {id:'settings',name:'Settings',time:'now',ms:0,parts:'Personality, AI keys and voice',run:()=>c.actions.settings()},
   ];
   const jobs=new Map();
   function enqueue(bp){if(!bp.ms)return;const job=c.h('div','rs-job'),bar=c.h('i');job.append(c.h('b',null,bp.name),c.h('span','rs-job-bar').appendChild(bar).parentNode,c.h('small',null,bp.time));
    bar.style.animationDuration=Math.min(bp.ms,12000)+'ms';queue.append(job);const t=c.later(()=>finish(bp.id),bp.ms);jobs.set(bp.id,{job,t});}
   function finish(id,ok=true){const j=jobs.get(id);if(!j)return;jobs.delete(id);c.cancel(j.t);j.job.classList.add(ok?'rs-done':'rs-fail');c.later(()=>j.job.remove(),900);}
   function open(){const o=c.overlay('rs-craft-menu','Crafting');
    const head=c.h('div','rs-head');head.append(c.h('b',null,'Crafting'),c.h('small',null,'Q'));o.el.append(head);
    for(const bp of BP){const row=c.h('div','rs-bp'),info=c.h('div');info.append(c.h('b',null,bp.name),c.h('small',null,bp.parts));
     const go=c.h('button','primary',bp.ms?'Craft':'Open');go.type='button';go.disabled=jobs.has(bp.id);
     go.onclick=()=>{o.close();bp.run();enqueue(bp);};row.append(c.h('span','rs-bp-time',bp.time),info,go);o.el.append(row);}
    const x=c.h('button','rs-close','Close');x.type='button';x.onclick=o.close;o.el.append(x);o.el.querySelector('.rs-bp button')?.focus({preventScroll:true});}
   chip.onclick=()=>{if(c._overlay)c._overlay.close();else open();};
   c.key(e=>{if(e.key==='q'||e.key==='Q'){e.preventDefault();chip.click();}});
   return {update(type,d){if(type==='check')finish('check',!d?.problems);if(type==='state'&&d.state!=='paused'&&d.state!=='standby'&&d.before&&['paused','standby'].includes(d.before))finish('start');},unmount(){jobs.clear();}};
  }},
  {id:'rs-tc',mount(c){
   // The Tool Cupboard: upkeep is the time until Tyler's quiet-call hum keeps him in the call.
   const chip=c.add('bar',c.h('button','fx fx-chip rs-chip rs-tc'));chip.type='button';const time=c.h('span');chip.append(c.brand('tool-cupboard','rs-chip-bi')||c.svg(RS.lock,'rs-ic'),time);chip.setAttribute('aria-haspopup','dialog');
   const K=()=>globalThis.TylerKeepAlive?.info?.()||null;
   const left=k=>k&&k.call&&k.inCall?Math.max(0,k.minutes*60000-k.idleMs):null;
   function render(){const k=K(),l=left(k);time.textContent=l==null?'TC':Math.ceil(l/60000)+'m';chip.dataset.on=String(l!=null);
    chip.title=!k?'Tool Cupboard':!k.call?'Tool Cupboard: quiet-call humming is off':l==null?'Tool Cupboard: Tyler isn’t in a call':'Tool Cupboard upkeep: Tyler hums in '+Math.ceil(l/60000)+' min if the call stays quiet';}
   function open(){globalThis.TylerKeepAlive?.refresh?.();const k=K(),l=left(k),o=c.overlay('rs-tc-menu','Tool Cupboard');
    const head=c.h('div','rs-head');head.append(c.h('b',null,'Tool Cupboard'),c.h('small',null,'Stay connected'));o.el.append(head);
    const rows=[['Authorized','Tyler (this window)'],['Upkeep',!k?'Not available here':!k.call?'Off: Steam may drop Tyler after about an hour of quiet':l==null?'Not in a call':'Hums in '+Math.ceil(l/60000)+' min, after '+k.minutes+' quiet minutes'],['Decay protection',!k?'—':k.chat?'Keeps the chat connected':'Off'],['Last hum',k?.lastHum?new Date(k.lastHum).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'}):'Not yet']];
    const list=c.h('dl','rs-tc-list');for(const [a,b] of rows){const d=c.h('div');d.append(c.h('dt',null,a),c.h('dd',null,b));list.append(d);}o.el.append(list);
    const row=c.h('div','rs-tc-actions'),hum=c.h('button',null,'Play the hum now'),set=c.h('button',null,'Stay connected settings');hum.type=set.type='button';
    const test=c.root.getElementById('kaTest');hum.disabled=!test||test.disabled;hum.onclick=()=>{test?.click();o.close();};
    set.onclick=()=>{o.close();c.actions.tab('conversation');const d=c.root.getElementById('keepAlive');if(d){d.open=true;d.scrollIntoView?.({block:'nearest'});}};
    const x=c.h('button','rs-close','Close');x.type='button';x.onclick=o.close;row.append(hum,set);o.el.append(row,x);(hum.disabled?set:hum).focus({preventScroll:true});}
   chip.onclick=()=>{if(c._overlay)c._overlay.close();else open();};
   // The bridge reports the call's quiet time when asked: every 30 s, and when the cupboard opens.
   let n=0;render();c.every(()=>{render();if(++n%30===0)globalThis.TylerKeepAlive?.refresh?.();});
   return {update(type){if(type==='keepalive'||type==='state')render();}};
  }},
  {id:'rs-wounded-part',mount(c){
   // A problem: "You are wounded", with a bleed-out bar and Help up (the full check). Still down a
   // minute later: "You are dead" and Respawn (Connect & start). Recovering clears it.
   let el=null,bleed=0;const BLEED=60000;
   function clear(){c.cancel(bleed);bleed=0;el?.remove();el=null;}
   function wounded(){clear();el=c.add('layer',c.h('div','fx fx-interactive rs-wound'));el.setAttribute('role','alert');
    const bar=c.h('span','rs-wound-bar'),fill=c.h('i');bar.append(fill);fill.style.animationDuration=BLEED+'ms';
    const help=c.h('button','primary','Help up');help.type='button';help.title='Runs the full check';help.onclick=()=>c.actions.fullCheck();
    el.append(c.h('b',null,'You are wounded'),c.h('small',null,'Something needs attention. Help up runs the full check.'),bar,help);
    // Under the tabs: the panel's own notification about the problem appears at the bottom.
    el.style.top=(c.below('.tabs')+8)+'px';
    bleed=c.later(dead,BLEED);}
   function dead(){el?.remove();el=c.add('layer',c.h('div','fx fx-interactive rs-dead'));el.setAttribute('role','alert');
    const by=c.h('small',null,'Killed by: '+(c.S.text||'a problem').slice(0,90));
    const respawn=c.h('button','primary','Respawn');{const bag=c.brand('sleeping-bag','rs-respawn-bi');if(bag)respawn.prepend(bag);}respawn.type='button';respawn.title='Connect & start';respawn.onclick=()=>{clear();c.actions.connect();};
    const checks=c.h('button',null,'Checks');checks.type='button';checks.onclick=()=>{clear();c.actions.checks();};
    const row=c.h('div','rs-dead-actions');row.append(respawn,checks);el.append(c.h('b',null,'You are dead'),by,row);el.style.top=(c.below('.tabs')+10)+'px';respawn.focus({preventScroll:true});}
   return {update(type,d){if(type!=='state')return;if(d.state==='error'&&d.before!=='error')wounded();else if(d.state!=='error'&&el){const back=['ready','listening','speaking','thinking'].includes(d.state);clear();
    if(back)c.flash(Object.assign(c.h('div','fx rs-pick rs-pick-solo'),{textContent:'Back on your feet'}),2200);}},unmount:clear};
  }},
  {id:'rs-pickup-part',mount(c){
   // Pickup notices at the bottom right: scrap for each reply, the clip's name, the song.
   const stack=c.add('layer',c.h('div','fx rs-picks'));
   function pick(icon,text,n){const p=c.h('div','rs-pick');p.append((icon==='scrap'&&c.brand('scrap','rs-pick-bi'))||c.svg(RS[icon],'rs-ic'),c.h('span',null,text));if(n)p.append(c.h('b',null,'+'+n));stack.append(p);while(stack.children.length>4)stack.firstElementChild.remove();c.later(()=>p.remove(),2800);
    stack.style.bottom=(c.panel.querySelector('.foot')?.offsetHeight||40)+(c.root.querySelector('.rs-belt:not([hidden])')?.offsetHeight||0)+6+'px';}
   // The logo, double-clicked: what every fresh spawn says.
   const mark=c.root.querySelector('.mark');if(mark)c.on(mark,'dblclick',()=>{const b=c.h('div','fx rs-hello','Hello? I’m friendly!');c.flash(b,2400);});
   return {update(type,d){if(type==='reply')pick('scrap','Scrap',1);if(type==='sound')pick('radio',String(d.name||'Clip').slice(0,24),1);if(type==='music'&&d.title)pick('radio','Cassette · '+String(d.title).slice(0,22));if(type==='keepalive'&&d.reason==='quiet')pick('comfort','Stayed in the call');}};
  }},
 ];
 // Four features: wounded and dead belong with the vitals, pickups with the belt.
 {const by=id=>RUST.find(f=>f.id===id),v=by('rs-vitals'),b=by('rs-belt'),w=by('rs-wounded-part'),p=by('rs-pickup-part');
  const vm=v.mount,bm=b.mount;v.mount=both(vm,w.mount);b.mount=both(bm,p.mount);
  F.define('rust',RUST.filter(f=>f!==w&&f!==p));}

 // ── Xbox 360: the Ring of Light, the gamer card and achievements, the Guide, blade slides ────────
 const XA=[
  ['first-words',10,'First Words','Tyler spoke in a voice call',(c)=>c.S.spoken>=1],
  ['chatterbox',20,'Chatterbox','50 replies in one session',(c)=>c.S.replies+c.S.spoken>=50],
  ['century',50,'Century','100 replies in all',(c)=>(c.life?c.life.replies+c.life.spoken:c.S.replies+c.S.spoken)>=100],
  ['selector',10,'Selector','The Music DJ played a song',(c)=>!!c.S.music],
  ['full-party',20,'Full Party','Three friends in the call',(c)=>c.voice().peers>=3],
  ['soundboard',15,'Soundboard Hero','Ten clips played',(c)=>(c.life?c.life.sounds:c.S.sounds)>=10],
  ['clean-bill',15,'Clean Bill of Health','A full check with no problems',null],
  ['comeback',15,'Comeback','Back up after a problem',null],
  ['quick-draw',10,'Quick Draw','A reply in under a second',null],
  ['marathon',50,'Marathon','Ten hours with Tyler',(c)=>(c.life?.timeMs||0)>=36e6],
 ];
 const XG=XA.reduce((n,a)=>n+a[1],0);
 const xHas=(c,key)=>(c.life?.ach||[...c._session]).includes('x360:'+key);
 const xScore=c=>XA.reduce((n,a)=>n+(xHas(c,a[0])?a[1]:0),0);
 const X_TROPHY='<svg viewBox="0 0 16 16"><path d="M5 2.5h6v3.2a3 3 0 0 1-6 0zM5 3.5H2.8v1a2.3 2.3 0 0 0 2.4 2.3M11 3.5h2.2v1a2.3 2.3 0 0 1-2.4 2.3M8 8.7v2.6M5.5 13.5h5M6.3 11.3h3.4"/></svg>';
 const X_PEOPLE='<svg viewBox="0 0 16 16"><path d="M5.5 7.5a2.2 2.2 0 1 0 0-4.4 2.2 2.2 0 0 0 0 4.4zM1.8 13c.4-2.3 1.8-3.6 3.7-3.6S8.8 10.7 9.2 13M11 7.3a1.9 1.9 0 1 0 0-3.8M11.4 9.4c1.5.2 2.5 1.4 2.8 3.6"/></svg>';
 const X_POWER='<svg viewBox="0 0 16 16"><path d="M5.2 4.3a5 5 0 1 0 5.6 0M8 2v5.5"/></svg>';
 // The console's pop-up: a dark pill rising from the bottom centre, with a round icon.
 function xPop(c,icon,small,text){const el=c.h('div','fx x-pop');const ic=c.h('span','x-pop-ic');const bi=c.brand(({[X_TROPHY]:'source-achievements',[X_PEOPLE]:'source-friends'})[icon],'x-pop-bi x-blades')||c.brand(({[X_TROPHY]:'achievement',[X_PEOPLE]:'player',[X_POWER]:'ring-of-light'})[icon],'x-pop-bi');if(bi){ic.classList.add('x-pop-ic-b');ic.append(bi);}else ic.append(c.svg(icon));const t=c.h('div');t.append(c.h('small',null,small),c.h('b',null,text));el.append(ic,t);
  el.style.bottom=(c.panel.querySelector('.foot')?.offsetHeight||40)+12+'px';c.flash(el,4200);return el;}
 F.define('x360',[
  {id:'x-ring',mount(c){
   // One light for Tyler and one for each person in the call, up to four.
   const tally=c.root.getElementById('activityCard'),light=tally?.querySelector('.tally-light');
   function render(){if(!tally)return;const n=Math.min(4,1+c.voice().peers);if(tally.dataset.ring!==String(n))tally.dataset.ring=String(n);
    if(light)light.title='Ring of Light: one light for Tyler and one for each person in the call ('+n+' of 4)'+(c.S.state==='error'?'. Red: click to run the full check':'');}
   if(light){light.classList.add('fx-interactive');c.on(light,'click',()=>{if(c.S.state==='error')c.actions.fullCheck();});}
   render();c.every(render);return {update(){render();},unmount(){tally?.removeAttribute('data-ring');}};
  }},
  {id:'x-card',mount(c){
   // The gamer card: picture, gamertag, gamerscore, reputation stars, zone and motto.
   const card=c.add('deck',c.h('button','fx x-card'));card.type='button';card.setAttribute('aria-haspopup','dialog');card.title='Gamer card: achievements';
   const pic=c.h('canvas','x-pic');pic.width=pic.height=96;const info=c.h('div','x-info'),tag=c.h('b','x-tag','ROBOTIC TYLER'),score=c.h('span','x-score'),stars=c.h('span','x-stars'),zone=c.h('small','x-zone'),motto=c.h('small','x-motto');
   const row=c.h('div','x-row'),gs=c.brand('source-gscore','x-gs-bi');if(gs){score.classList.add('x-score-b');row.append(gs);}row.append(score,stars,zone);info.append(tag,row,motto);card.append(pic,info);
   requestAnimationFrame(()=>globalThis.TylerLogos?.paint(pic,'x360'));
   function render(){score.textContent=xScore(c).toLocaleString();score.title='Gamerscore: '+xScore(c)+' of '+XG;const h=c.health(),n=Math.max(1,Math.round(h/20));stars.textContent='★'.repeat(n)+'☆'.repeat(5-n);stars.title='Reputation: Tyler’s health ('+Math.round(h)+'%)';
    zone.textContent=c.voice().peers?'Party · '+(c.voice().peers+1):'Pro';motto.textContent=c.S.music?'♫ '+c.S.music:c.S.label+(c.S.text?' · '+c.S.text:'');}
   function open(){const o=c.overlay('x-ach','Achievements');const got=XA.filter(a=>xHas(c,a[0])).length;
    const head=c.h('div','x-ach-head');head.append(c.h('b',null,'Achievements'),c.h('span',null,got+' of '+XA.length+' unlocked · '+xScore(c)+' of '+XG+' G'));o.el.append(head);
    for(const [key,g,name,desc] of XA){const on=xHas(c,key),it=c.h('div','x-ach-item');it.dataset.on=String(on);const ic=c.h('span','x-ach-ic');const ab=on&&(c.brand('source-achievements','x-ach-bi x-blades')||c.brand('achievement','x-ach-bi'));if(ab){ic.classList.add('x-ach-ic-b');ic.append(ab);}else ic.append(c.svg(X_TROPHY));
     const t=c.h('div');t.append(c.h('b',null,on?name:'Locked achievement'),c.h('small',null,on?desc:desc));it.append(ic,t,c.h('span','x-ach-g',g+'G'));o.el.append(it);}
    const x=c.h('button','x-back');x.type='button';x.append(c.h('i','x-btn-b','B'),c.h('span',null,'Back'));x.onclick=o.close;o.el.append(x);x.focus({preventScroll:true});}
   card.onclick=()=>{if(c._overlay)c._overlay.close();else open();};
   // Unlocks, checked on every change and once a second.
   function check(){for(const [key,g,name,desc,met] of XA)if(met&&met(c)&&c.unlock('x360:'+key)){xPop(c,X_TROPHY,'Achievement unlocked',g+'G – '+name);render();}}
   render();c.every(()=>{render();check();});
   return {update(type,d){
    if(type==='check'&&!d?.problems&&!d?.unsure&&c.unlock('x360:clean-bill'))xPop(c,X_TROPHY,'Achievement unlocked','15G – Clean Bill of Health');
    if(type==='state'&&d.before==='error'&&['ready','listening'].includes(d.state)&&c.unlock('x360:comeback'))xPop(c,X_TROPHY,'Achievement unlocked','15G – Comeback');
    if(type==='turn'&&d.ms<1000&&c.unlock('x360:quick-draw'))xPop(c,X_TROPHY,'Achievement unlocked','10G – Quick Draw');
    check();render();}};
  }},
  {id:'x-guide',mount(c){
   // The Guide (G): the quick menu, with the controller's A and B prompts.
   const b=c.add('bar',c.h('button','fx x-guide-btn'));b.type='button';b.title='Guide (G): quick actions';b.setAttribute('aria-haspopup','dialog');b.append(c.brand('guide','x-guide-bi')||c.svg(X_POWER));
   function open(){const o=c.overlay('x-guide','Guide'),paused=c.actions.paused();
    const head=c.h('div','x-guide-head'),pic=c.h('canvas','x-pic');pic.width=pic.height=64;const t=c.h('div');t.append(c.h('b',null,'ROBOTIC TYLER'),c.h('small',null,xScore(c)+' G · '+(paused?'Away':'Online')));head.append(pic,t);o.el.append(head);
    requestAnimationFrame(()=>globalThis.TylerLogos?.paint(pic,'x360'));
    const list=c.h('div','x-guide-list');
    const items=[[paused?'Connect & start':'Pause AI',()=>paused?c.actions.connect():c.actions.pause()],['Stop audio',()=>c.actions.stopAudio()],['Music DJ',()=>c.actions.tab('room')],['Soundboard',()=>c.actions.tab('soundboard')],['Full check',()=>c.actions.fullCheck()],['Settings',()=>c.actions.settings()],['Turn off the panel',()=>c.actions.collapse()]];
    for(const [label,run] of items){const it=c.h('button','x-guide-item',label);it.type='button';it.onclick=()=>{o.close();run();};list.append(it);}
    list.addEventListener('keydown',e=>{const all=[...list.children],i=all.indexOf(c.root.activeElement);if(e.key==='ArrowDown'){e.preventDefault();all[(i+1)%all.length].focus();}if(e.key==='ArrowUp'){e.preventDefault();all[(i-1+all.length)%all.length].focus();}});
    const foot=c.h('div','x-prompts');foot.append(c.h('i','x-btn-a','A'),c.h('span',null,'Select'),c.h('i','x-btn-b','B'),c.h('span',null,'Back'));
    o.el.append(list,foot);list.firstElementChild.focus({preventScroll:true});}
   b.onclick=()=>{if(c._overlay)c._overlay.close();else open();};
   c.key(e=>{if(e.key==='g'||e.key==='G'){e.preventDefault();b.click();}});
   return {};
  }},
  {id:'x-blades',mount(c){
   // Changing tab slides a blade of that tab's colour across, as the dashboard's blades did; Tyler
   // signing in and friends joining the party pop up from the bottom.
   const COLOR={conversation:'#6fbb2e',room:'#f0921b',soundboard:'#2a9be0',setup:'#8f9496',checks:'#22a884'};
   let peers=c.voice().peers,last=c.S.state;
   c.every(()=>{const p=c.voice().peers;if(p>peers)xPop(c,X_PEOPLE,'Party','A friend joined the call ('+(p+1)+' with Tyler)');peers=p;});
   return {update(type,d){
    if(type==='tab'&&!c.reduced&&!c.preview){const blade=c.h('div','fx x-sweep');blade.style.setProperty('--blade',COLOR[d.tab]||'#6fbb2e');blade.style.top=c.below('.tabs')+'px';c.flash(blade,460);}
    if(type==='state'){if(['paused','standby'].includes(last)&&['ready','listening'].includes(d.state))xPop(c,X_POWER,'Signed in','ROBOTIC TYLER is online');last=d.state;}}};
  }},
 ]);

 // ── iPod classic: the battery, the click wheel, the iPod menu, Now Playing and Cover Flow ────────
 // Generated "artwork" for a clip or song: two colours from its name, and a note.
 const ipArt=(c,name,cls='ip-art')=>{let h=0;for(const ch of String(name||'?'))h=(h*31+ch.charCodeAt(0))>>>0;const a=c.h('span',cls);a.style.setProperty('--h1',String(h%360));a.style.setProperty('--h2',String((h>>9)%360));a.append(c.h('i',null,'♪'));return a;};
 const IP_TABS=['conversation','room','soundboard','setup','checks'];
 function ipList(c,o,items){const list=c.h('div','ip-list');for(const it of items){const b=c.h('button','ip-row');b.type='button';b.append(c.h('span',null,it[0]));if(it[2])b.append(c.h('small',null,it[2]));b.onclick=()=>{it[1]();};list.append(b);}
  list.addEventListener('keydown',e=>{const all=[...list.children],i=all.indexOf(c.root.activeElement);if(e.key==='ArrowDown'){e.preventDefault();all[(i+1)%all.length].focus();}if(e.key==='ArrowUp'){e.preventDefault();all[(i-1+all.length)%all.length].focus();}});
  o.el.append(list);return list;}
 function ipHead(c,o,title){const head=c.h('div','ip-title');head.append(c.h('i','ip-title-play'),c.h('b',null,title),c.h('span','ip-title-bat'));o.el.append(head);}
 F.define('ipod',[
  {id:'ip-battery',mount(c){
   // The title bar's play sign (while Tyler talks or music plays) and battery (Tyler's health; it
   // charges while he recovers).
   const box=c.add('bar',c.h('span','fx ip-status'));const play=c.h('i','ip-play'),bat=c.h('span','ip-bat'),fill=c.h('i');bat.append(fill);box.append(play,bat);
   function render(){const h=c.health();bat.style.setProperty('--lvl',(h/100).toFixed(2));bat.dataset.low=String(h<25);bat.dataset.charge=String(c.S.state==='waiting');play.hidden=!(c.S.state==='speaking'||c.S.music);bat.title='Battery: Tyler’s health ('+Math.round(h)+'%)'+(c.S.state==='waiting'?', charging while he recovers':'');}
   // Starting Tyler turns the iPod on: the white start-up screen with the Apple logo, for a moment.
   let last=c.S.state;
   const boot=()=>{if(c.reduced||c.preview)return;const b=c.h('div','fx ip-boot');b.append(...[c.brand('apple-mark','ip-boot-apple')].filter(Boolean));b.style.top=c.below('.bar')+'px';c.flash(b,1600);};
   render();c.every(render);return {update(type,d){render();if(type==='state'){if(['paused','standby'].includes(last)&&['ready','listening'].includes(d.state))boot();last=d.state;}}};
  }},
  {id:'ip-wheel',mount(c){
   // The click wheel. Turn it (drag round the ring, or the mouse wheel over it) to scroll the list;
   // MENU opens the iPod menu, ⏮ ⏭ step through the tabs, ▶‖ pauses or starts Tyler, the centre
   // opens Now Playing.
   const wrap=c.add('foot',c.h('div','fx ip-wheel-wrap'));const wheel=c.h('div','ip-wheel');wheel.setAttribute('role','group');wheel.setAttribute('aria-label','Click wheel');
   const key=(cls,label,title,run)=>{const b=c.h('button','ip-key '+cls,label);b.type='button';b.title=title;b.onclick=run;wheel.append(b);return b;};
   const step=d=>{const i=IP_TABS.indexOf(c.S.tab);c.actions.tab(IP_TABS[(i+d+IP_TABS.length)%IP_TABS.length]);};
   key('ip-menu','MENU','Menu (M): the iPod menu',()=>c.panel.dispatchEvent(new CustomEvent('tyler-fx',{detail:{open:'ip-menu'}})));
   key('ip-prev','⏮','Previous tab',()=>step(-1));key('ip-next','⏭','Next tab',()=>step(1));
   const pp=key('ip-pp','▶❙❙','Play/pause: pauses Tyler, or Connect & start',()=>c.actions.paused()?c.actions.connect():c.actions.pause());
   const centre=c.h('button','ip-centre');centre.type='button';centre.title='Select: Now Playing';centre.setAttribute('aria-label','Now Playing');centre.onclick=()=>c.panel.dispatchEvent(new CustomEvent('tyler-fx',{detail:{open:'ip-now'}}));wheel.append(centre);
   wrap.append(wheel);
   const scroller=()=>c.root.querySelector('.scroll');
   // Turning: every 22° is one notch, about one row of the list.
   let last=null,acc=0;const angle=e=>{const r=wheel.getBoundingClientRect();return Math.atan2(e.clientY-(r.top+r.height/2),e.clientX-(r.left+r.width/2))*180/Math.PI;};
   c.on(wheel,'pointerdown',e=>{if(e.target.closest('button'))return;last=angle(e);acc=0;wheel.setPointerCapture?.(e.pointerId);wheel.classList.add('ip-turning');});
   c.on(wheel,'pointermove',e=>{if(last==null)return;let a=angle(e),d=a-last;if(d>180)d-=360;if(d<-180)d+=360;last=a;acc+=d;while(Math.abs(acc)>=22){const s=Math.sign(acc);acc-=s*22;const sc=scroller();if(sc)sc.scrollTop+=s*38;wheel.style.setProperty('--turn',String((Number(wheel.style.getPropertyValue('--turn'))||0)+s));}});
   const end=()=>{last=null;wheel.classList.remove('ip-turning');};c.on(wheel,'pointerup',end);c.on(wheel,'pointercancel',end);
   c.on(wheel,'wheel',e=>{const sc=scroller();if(!sc)return;e.preventDefault();sc.scrollTop+=e.deltaY;},{passive:false});
   const render=()=>{pp.dataset.paused=String(c.actions.paused());};render();c.every(render);
   return {update(){render();}};
  }},
  {id:'ip-screens',mount(c){
   // The iPod menu (M), Now Playing and Cover Flow.
   let songAt=0;
   const close=()=>c._overlay?.close();
   function menu(){const o=c.overlay('ip-screen','iPod menu');ipHead(c,o,'iPod');
    const go=t=>()=>{close();c.actions.tab(t);};
    const sounds=(c.actions.sounds().slots||[]).length;
    const list=ipList(c,o,[['Now Playing',()=>{close();nowPlaying();},c.S.music?'♪':''],['Chat',go('conversation')],['Room',go('room')],['Cover Flow',()=>{close();flow();},sounds?sounds+' clips':''],['Setup',go('setup')],['Checks',go('checks')],
     ['Shuffle Sounds',()=>{const l=c.actions.sounds().slots||[];if(l.length){close();c.actions.playSound(l[Math.floor(Math.random()*l.length)].slot);}}],['Settings',()=>{close();c.actions.settings();}]]);
    list.firstElementChild.focus({preventScroll:true});}
   function nowPlaying(){const o=c.overlay('ip-screen ip-now','Now Playing');ipHead(c,o,'Now Playing');
    const body=c.h('div','ip-now-body'),title=c.S.music,by=c.S.musicBy;body.append(ipArt(c,title||'Tyler','ip-art ip-art-big'));
    const meta=c.h('div','ip-now-meta');meta.append(c.h('b',null,title||'Nothing playing'),c.h('span',null,title?(by?'Requested by '+by:'Music DJ'):'Start the Music DJ in the Room tab'),c.h('small',null,title?'Music DJ':'ROBOTIC TYLER'));body.append(meta);o.el.append(body);
    const bar=c.h('div','ip-scrub'),fill=c.h('i'),times=c.h('div','ip-times'),el=c.h('span'),rest=c.h('span',null,'--:--');bar.append(fill);times.append(el,rest);o.el.append(bar,times);
    const tick=()=>{const t=title&&songAt?Date.now()-songAt:0;el.textContent=c.clock(t);fill.style.transform='scaleX('+Math.min(1,t/210000).toFixed(3)+')';};tick();const timer=setInterval(()=>{if(!o.el.isConnected)clearInterval(timer);else tick();},1000);
    const ctl=c.h('div','ip-ctl');
    const btn=(label,title2,run,dis)=>{const b=c.h('button',null,label);b.type='button';b.title=title2;b.disabled=!!dis;b.onclick=run;ctl.append(b);return b;};
    const skip=c.root.getElementById('musicSkip'),stop=c.root.getElementById('musicEnd');
    if(title){btn('⏭ Skip','Skip to the next request',()=>{skip?.click();close();},!skip||skip.disabled);btn('■ Stop','Stop the music',()=>{stop?.click();close();},!stop||stop.disabled);}
    else btn('Music DJ','Open the Room tab',()=>{close();c.actions.tab('room');});
    o.el.append(ctl);ctl.querySelector('button:not(:disabled)')?.focus({preventScroll:true});}
   function flow(){const o=c.overlay('ip-screen ip-flow','Cover Flow');ipHead(c,o,'Cover Flow');
    const list=c.actions.sounds().slots||[];if(!list.length){o.el.append(c.h('p','ip-empty','No clips yet. Add them in the Sounds tab.'));return;}
    const stage=c.h('div','ip-flow-stage'),name=c.h('b','ip-flow-name'),hint=c.h('small','ip-flow-hint','← → to browse · Enter to play');let at=0;
    const covers=list.map((s,i)=>{const b=c.h('button','ip-cover');b.type='button';b.append(ipArt(c,s.name));b.title='Play '+s.name;b.onclick=()=>{if(i===at)c.actions.playSound(s.slot);else{at=i;place();}};stage.append(b);return b;});
    function place(){covers.forEach((b,i)=>{const d=i-at;b.style.setProperty('--d',String(d));b.style.zIndex=String(50-Math.abs(d));b.dataset.on=String(d===0);b.tabIndex=d===0?0:-1;});name.textContent=list[at].name;covers[at].focus({preventScroll:true});}
    stage.addEventListener('keydown',e=>{if(e.key==='ArrowRight'){e.preventDefault();at=Math.min(list.length-1,at+1);place();}if(e.key==='ArrowLeft'){e.preventDefault();at=Math.max(0,at-1);place();}});
    c.on(stage,'wheel',e=>{e.preventDefault();at=Math.max(0,Math.min(list.length-1,at+Math.sign(e.deltaY||e.deltaX)));place();},{passive:false});
    o.el.append(stage,name,hint);place();}
   c.on(c.panel,'tyler-fx',e=>{const k=e.detail?.open;if(k==='ip-menu'){if(c._overlay)close();else menu();}if(k==='ip-now'){if(c._overlay)close();else nowPlaying();}});
   c.key(e=>{if(e.key==='m'||e.key==='M'){e.preventDefault();if(c._overlay)close();else menu();}});
   return {update(type,d){if(type==='music')songAt=d.title?Date.now():0;}};
  }},
 ]);

 // ── MSN Messenger: presence, What I'm listening to, the contact list, notices, Nudge, emoticons ──
 const MSN_PRES={ready:['Online','on'],listening:['Online','on'],thinking:['Online','on'],speaking:['On the Phone','busy'],waiting:['Be Right Back','away'],paused:['Away','away'],standby:['Appear Offline','off'],error:['Busy','busy']};
 // v2.30: Messenger's original emoticons (Pack 2) with their shortcuts; the text ones stay as the fallback.
 const MSN_EMO=[':)',';)','(Y)','(N)','*-)','8-|','(I)','(8)','(*)','(T)','(S)','(brb)'];
 const MSN_EMO_IC=['smile','winking-smile-static','thumbs-up','thumbs-down','thinking-smile-static','nerd-smile','light-bulb','note','star','telephone-receiver','sleeping-half-moon','be-right-back'].map(n=>'source-'+n);
 function msnPop(c,title,text){const el=c.h('div','fx msn-pop');const head=c.h('div','msn-pop-head');head.append(...[c.brand('msn-butterfly','msn-pop-bf')].filter(Boolean),c.h('b',null,'MSN Messenger'));const body=c.h('div','msn-pop-body'),pic=c.h('canvas','msn-pop-pic');pic.width=pic.height=72;
  const t=c.h('div');t.append(c.h('b',null,title),c.h('span',null,text));body.append(pic,t);el.append(head,body);requestAnimationFrame(()=>globalThis.TylerLogos?.paint(pic,'msn'));
  el.style.bottom=(c.panel.querySelector('.foot')?.offsetHeight||40)+10+'px';c.flash(el,5200);}
 F.define('msn',[
  {id:'msn-presence',mount(c){
   // Presence beside the state, "is typing a message…" while Tyler writes, and the personal message
   // under his name: What I'm listening to, while the Music DJ plays.
   const head=c.root.querySelector('.tally-head'),pres=c.h('span','fx msn-presence');head?.querySelector('.tally-label')?.after(pres);
   const typing=c.h('span','fx msn-typing');typing.append(c.h('i','msn-pencil'),c.h('span',null,'Tyler is typing a message…'));c.root.querySelector('.tally-body')?.append(typing);
   const ident=c.root.querySelector('.ident'),psm=c.h('small','fx msn-psm');ident?.append(psm);
   function render(){const [word,kind]=MSN_PRES[c.S.state]||MSN_PRES.ready;pres.textContent='('+word+')';pres.dataset.kind=kind;typing.hidden=c.S.state!=='thinking';
    psm.hidden=!c.S.music;psm.textContent=c.S.music?'♫ '+c.S.music+(c.S.musicBy?' – '+c.S.musicBy:''):'';psm.title=c.S.music?'What I’m listening to: the Music DJ':'';ident?.classList.toggle('msn-listening',!!c.S.music);}
   render();return {update(){render();},unmount(){pres.remove();typing.remove();psm.remove();ident?.classList.remove('msn-listening');}};
  }},
  {id:'msn-status',mount(c){
   // Click the display picture: the status menu.
   const mark=c.root.querySelector('.mark');if(!mark)return {};mark.classList.add('fx-interactive','msn-dp');mark.setAttribute('role','button');mark.tabIndex=0;mark.title='Change your status';
   const open=()=>{const paused=c.actions.paused(),[word]=MSN_PRES[c.S.state]||MSN_PRES.ready;
    c.menu(mark,[{heading:'My status: '+word},{label:'Online',mark:'●',icon:'online',hint:paused?'Connect & start':'',current:!paused,run:()=>{if(c.actions.paused())c.actions.connect();}},
     {label:'Away',mark:'●',icon:'away',hint:'Pause AI',current:paused,run:()=>c.actions.pause()},{label:'Appear Offline',mark:'●',icon:'offline',hint:'Collapse the window',run:()=>c.actions.collapse()},'sep',
     {label:'Send a Nudge',icon:'nudge',hint:'Test beep in voice',run:()=>c.actions.beep()},{label:'Change Display Picture…',hint:'Settings → Appearance',run:()=>c.actions.settings()}],{cls:'msn-menu',label:'Status'});};
   c.on(mark,'click',open);c.on(mark,'keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();open();}});
   return {unmount(){mark.classList.remove('fx-interactive','msn-dp');mark.removeAttribute('role');mark.removeAttribute('tabindex');mark.removeAttribute('title');}};
  }},
  {id:'msn-contacts',mount(c){
   // The contact list: Tyler's parts, grouped Online and Not online, each with its presence.
   const box=c.add('deck',c.h('div','fx msn-list'));const groups={on:c.h('div','msn-group'),off:c.h('div','msn-group')};
   const heads={on:c.h('button','msn-ghead'),off:c.h('button','msn-ghead')};const open={on:true,off:true};
   for(const k of ['on','off']){heads[k].type='button';heads[k].onclick=()=>{open[k]=!open[k];render();};box.append(heads[k],groups[k]);}
   // The conversation toolbar: Nudge and emoticons (each one plays a clip).
   const bar=c.h('div','msn-tools'),nudge=c.h('button','msn-tool',null),emo=c.h('button','msn-tool');nudge.type=emo.type='button';
   nudge.append(c.brand('nudge','msn-tool-bi')||c.h('i','msn-nudge-ic'),c.h('span',null,'Nudge'));nudge.title='Send a Nudge: a test beep in Steam voice';nudge.onclick=()=>{c.actions.beep();c.panel.classList.remove('msn-shake');void c.panel.offsetWidth;if(!c.reduced)c.panel.classList.add('msn-shake');};
   emo.append(c.brand('source-smile','msn-emo-bi')||c.h('i','msn-emo-ic',':)'),c.h('span',null,'Emoticons'));emo.title='Emoticons: each one plays a soundboard clip';emo.setAttribute('aria-haspopup','menu');
   emo.onclick=()=>{const s=c.actions.sounds(),list=(s.slots||[]).slice(0,12);if(!list.length){c.actions.tab('soundboard');return;}
    c.menu(emo,list.map((it,i)=>({label:it.name,icon:MSN_EMO_IC[i%MSN_EMO_IC.length],mark:MSN_EMO[i%MSN_EMO.length],run:()=>c.actions.playSound(it.slot)})),{cls:'msn-menu msn-emo',label:'Emoticons',align:'right'});}; // from the button's right edge: it is at the panel's right
   bar.append(nudge,emo);box.append(bar);
   function render(){const sys=c.systems(),on=sys.filter(x=>x.level===3),off=sys.filter(x=>x.level!==3);
    for(const [k,list,label] of [['on',on,'Online'],['off',off,'Not online']]){heads[k].textContent=(open[k]?'▾ ':'▸ ')+label+' ('+list.length+')';heads[k].hidden=!list.length;groups[k].hidden=!open[k]||!list.length;groups[k].replaceChildren();
     for(const x of list){const r=c.h('button','msn-contact');r.type='button';r.dataset.level=String(x.level);r.append(c.brand(['offline','busy','away','online'][x.level]||'offline','msn-dot-bi')||c.h('i','msn-dot'),c.h('b',null,x.name),c.h('small',null,x.detail));r.title='Open '+x.name;r.onclick=()=>c.actions.tab(x.tab);groups[k].append(r);}}}
   render();c.every(render);return {update(){render();},unmount(){c.panel.classList.remove('msn-shake');}};
  }},
  {id:'msn-notices',mount(c){
   // Corner notices: signing in, friends joining the call, a new song; a problem nudges the window.
   let last=c.S.state,peers=c.voice().peers;
   c.every(()=>{const p=c.voice().peers;if(p>peers)msnPop(c,'A friend has just signed in.',(p+1)+' in the voice call with Tyler');peers=p;});
   return {update(type,d){
    if(type==='state'){if(['paused','standby'].includes(last)&&['ready','listening'].includes(d.state))msnPop(c,'ROBOTIC TYLER has just signed in.','He’s watching the chat.');
     if(d.state==='error'&&d.before!=='error'&&!c.reduced&&!c.preview){c.panel.classList.remove('msn-shake');void c.panel.offsetWidth;c.panel.classList.add('msn-shake');}last=d.state;}
    if(type==='music'&&d.title)msnPop(c,'ROBOTIC TYLER is listening to:',d.title+(d.by?' – '+d.by:''));}};
  }},
 ]);

 // ── PlayStation 3 (XMB): the clock, Options, trophies, Information, the month's colour ───────────
 const XT=[
  ['first-light','bronze','First Light','Tyler’s first reply of the session',(c)=>c.S.replies+c.S.spoken>=1],
  ['on-the-mic','bronze','On the Mic','Tyler spoke in a voice call',(c)=>c.S.spoken>=1],
  ['crowd','silver','Full House','Three friends in the call',(c)=>c.voice().peers>=3],
  ['dj','bronze','Resident DJ','The Music DJ played a song',(c)=>!!c.S.music],
  ['talkative','silver','Talkative','50 replies in one session',(c)=>c.S.replies+c.S.spoken>=50],
  ['all-clear','silver','All Clear','A full check with no problems',null],
  ['resilient','bronze','Resilient','Back up after a problem',null],
  ['veteran','gold','Veteran','500 replies in all',(c)=>(c.life?c.life.replies+c.life.spoken:0)>=500],
  ['marathon','gold','Marathon Session','Three hours in one session',(c)=>Date.now()-c.S.started>=108e5],
 ];
 const XT_PTS={bronze:15,silver:30,gold:90};
 const xtHas=(c,key)=>(c.life?.ach||[...c._session]).includes('xmb:'+key);
 const xtLevel=c=>{const pts=XT.reduce((n,t)=>n+(xtHas(c,t[0])?XT_PTS[t[1]]:0),0);return {pts,level:1+Math.floor(pts/60),pct:Math.round((pts%60)/60*100)};};
 const XB_TROPHY='<svg viewBox="0 0 16 16"><path d="M5 2.5h6v3.2a3 3 0 0 1-6 0zM5 3.5H2.8v1a2.3 2.3 0 0 0 2.4 2.3M11 3.5h2.2v1a2.3 2.3 0 0 1-2.4 2.3M8 8.7v2.6M5.5 13.5h5M6.3 11.3h3.4"/></svg>';
 const XB_INFO='<svg viewBox="0 0 16 16"><circle cx="8" cy="8" r="6"/><path d="M8 7.2v4M8 4.8v.2"/></svg>';
 function xbNotice(c,icon,line,sub,tier){const el=c.h('div','fx xb-note');if(tier)el.dataset.tier=tier;const ic=c.h('span','xb-note-ic');ic.append(icon==='ps'?(c.brand('playstation-mark','xb-ps')||c.h('i')):c.svg(icon));if(icon==='ps')el.dataset.tier='psn';const t=c.h('div');t.append(c.h('b',null,line),c.h('small',null,sub));el.append(ic,t);
  el.style.top=(c.below('.bar')+6)+'px';c.flash(el,5000);}
 F.define('xmb',[
  {id:'xb-clock',mount(c){
   // The clock in the corner, as the XMB shows it; a note while music plays.
   const box=c.add('bar',c.h('span','fx xb-clock'));const note=c.h('i','xb-note-mark','♪'),time=c.h('span');box.append(note,time);
   const render=()=>{const d=new Date();time.textContent=(d.getMonth()+1)+'/'+d.getDate()+' '+d.toLocaleTimeString([],{hour:'numeric',minute:'2-digit'});note.hidden=!c.S.music;};
   // Starting Tyler signs him in, with the console's notice.
   let last=c.S.state;
   render();c.every(render);return {update(type,d){render();if(type==='state'){if(['paused','standby'].includes(last)&&['ready','listening'].includes(d.state))xbNotice(c,'ps','Signed in to PlayStation Network.','ROBOTIC TYLER is online');last=d.state;}}};
  }},
  {id:'xb-options',mount(c){
   // Options: the side panel that slides in from the right.
   const b=c.add('bar',c.h('button','fx xb-opt-btn'));b.type='button';b.title='Options (O)';b.setAttribute('aria-haspopup','dialog');b.append(c.h('i'),c.h('i'),c.h('i'));
   function open(){const o=c.overlay('xb-options','Options'),paused=c.actions.paused();o.el.append(c.h('b','xb-opt-title','Options'));
    const items=[[paused?'Connect & start':'Pause AI',()=>paused?c.actions.connect():c.actions.pause()],['Stop audio',()=>c.actions.stopAudio()],['Run full check',()=>c.actions.fullCheck()],['Information',()=>c.panel.dispatchEvent(new CustomEvent('tyler-fx',{detail:{open:'xb-info'}}))],['Trophies',()=>c.panel.dispatchEvent(new CustomEvent('tyler-fx',{detail:{open:'xb-trophies'}}))],['Settings',()=>c.actions.settings()],['Collapse',()=>c.actions.collapse()]];
    const list=c.h('div','xb-opt-list');for(const [label,run] of items){const it=c.h('button','xb-opt-item',label);it.type='button';it.onclick=()=>{o.close();run();};list.append(it);}
    list.addEventListener('keydown',e=>{const all=[...list.children],i=all.indexOf(c.root.activeElement);if(e.key==='ArrowDown'){e.preventDefault();all[(i+1)%all.length].focus();}if(e.key==='ArrowUp'){e.preventDefault();all[(i-1+all.length)%all.length].focus();}});
    // The console's prompts along the bottom: ✕ to enter, ○ to go back (Enter and Escape here).
    const hints=c.h('div','xb-hints');for(const [id,label] of [['cross','Enter'],['circle','Back']]){const h=c.h('span','xb-hint');const bi=c.brand(id,'xb-hint-bi');if(bi)h.append(bi);h.append(c.h('span',null,label));hints.append(h);}
    o.el.append(list,hints);list.firstElementChild.focus({preventScroll:true});}
   b.onclick=()=>{if(c._overlay)c._overlay.close();else open();};
   c.key(e=>{if(e.key==='o'||e.key==='O'){e.preventDefault();b.click();}});
   // Left and right move along the cross-media bar, as on the console (not while a tab button has focus: it moves itself).
   c.key(e=>{if((e.key==='ArrowLeft'||e.key==='ArrowRight')&&!e.composedPath()[0]?.closest?.('.tabs,.fx-overlay,.fx-menu')){const T=c.TABS,i=T.indexOf(c.S.tab);e.preventDefault();c.actions.tab(T[(i+(e.key==='ArrowRight'?1:-1)+T.length)%T.length]);}});
   return {};
  }},
  {id:'xb-trophies',mount(c){
   // Trophies: bronze, silver and gold, with the "You have earned a trophy." notice; the trophy level.
   function earn(t){xbNotice(c,XB_TROPHY,'You have earned a trophy.','['+t[1][0].toUpperCase()+t[1].slice(1)+'] '+t[2],t[1]);}
   function check(){for(const t of XT)if(t[4]&&t[4](c)&&c.unlock('xmb:'+t[0]))earn(t);}
   function list(){const o=c.overlay('xb-screen','Trophies'),L=xtLevel(c),got=XT.filter(t=>xtHas(c,t[0])).length;
    const head=c.h('div','xb-screen-head xb-info-head');head.append(c.h('b',null,'Trophies'),...[c.brand('trophy','xb-info-ps')].filter(Boolean),c.h('span',null,'Level '+L.level+' · '+got+' of '+XT.length+' earned'));const bar=c.h('span','xb-level'),f=c.h('i');f.style.transform='scaleX('+(L.pct/100)+')';bar.append(f);head.append(bar);o.el.append(head);
    for(const t of XT){const on=xtHas(c,t[0]),r=c.h('div','xb-trophy');r.dataset.tier=t[1];r.dataset.on=String(on);const ic=c.h('span','xb-trophy-ic');ic.append(c.svg(XB_TROPHY));const tx=c.h('div');tx.append(c.h('b',null,on?t[2]:'Hidden trophy'),c.h('small',null,t[3]));r.append(ic,tx);o.el.append(r);}
    const x=c.h('button','xb-back','Back');x.type='button';x.onclick=o.close;o.el.append(x);x.focus({preventScroll:true});}
   c.on(c.panel,'tyler-fx',e=>{if(e.detail?.open==='xb-trophies')list();});
   check();c.every(check);
   return {update(type,d){
    if(type==='check'&&!d?.problems&&!d?.unsure&&c.unlock('xmb:all-clear'))earn(XT.find(t=>t[0]==='all-clear'));
    if(type==='state'&&d.before==='error'&&['ready','listening'].includes(d.state)&&c.unlock('xmb:resilient'))earn(XT.find(t=>t[0]==='resilient'));
    check();}};
  }},
  {id:'xb-info',mount(c){
   // Information: the system screen's list, for this session (and the lifetime totals).
   function open(){const o=c.overlay('xb-screen','Information'),S=c.S,L=c.life,T=xtLevel(c);
    const head=c.h('div','xb-screen-head xb-info-head');head.append(c.h('b',null,'Information'),...[c.brand('playstation-mark','xb-info-ps')].filter(Boolean));o.el.append(head);
    const rows=[['Name','ROBOTIC TYLER'],['State',S.label+(S.text?' · '+S.text:'')],['Time played',c.clock(Date.now()-S.started)],['Replies',String(S.replies)],['Voice replies',String(S.spoken)],['Messages heard',String(S.heard)],['Clips played',String(S.sounds)],['Now playing',S.music||'—'],['Average reply',c.ms(c.avgTurn())],['Problems',String(S.errors)],['Trophy level',T.level+' ('+T.pct+'%)'],['Model',S.model||'—']];
    if(L)rows.push(['All sessions',L.sessions+' · '+(L.timeMs/36e5).toFixed(1)+' h · '+(L.replies+L.spoken).toLocaleString()+' replies']);
    const dl=c.h('dl','xb-info-list');for(const [k,v] of rows){const d=c.h('div');d.append(c.h('dt',null,k),c.h('dd',null,v));dl.append(d);}o.el.append(dl);
    const x=c.h('button','xb-back','Back');x.type='button';x.onclick=o.close;o.el.append(x);x.focus({preventScroll:true});}
   c.on(c.panel,'tyler-fx',e=>{if(e.detail?.open==='xb-info')open();});
   const mark=c.root.querySelector('.mark');if(mark)c.on(mark,'dblclick',open);
   return {};
  }},
 ]);
})();

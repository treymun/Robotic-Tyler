// Theme features, pack 1 (v2.20): Steam, Classic Steam, Team Fortress 2, Counter-Strike 2, Portal,
// Counter-Strike 1.6 and the HEV suit. See theme-features.js for the live state and helpers.
(() => {
 'use strict';
 const F=globalThis.TylerThemeFeatures;if(!F)return;

 // ── Steam: a download-page activity graph and session achievements ─────────
 F.define('steam',[
  {id:'st-activity',mount(c){
   const box=c.add('deck',c.h('button','fx st-activity'));box.type='button';box.title='Reply times this session. Opens Checks.';
   const head=c.h('span','st-act-head'),title=c.h('b','st-act-title','Activity'),stats=c.h('span','st-act-stats');
   const cur=c.h('b',null,'—'),peak=c.h('b',null,'—'),total=c.h('b',null,'0');
   stats.append('CURRENT ',cur,' PEAK ',peak,' REPLIES ',total);
   box.title='Reply times this session. Lifetime: replies and achievements in the tooltip. Opens Checks.';head.append(title,stats);
   const bars=c.h('span','st-bars');const cells=Array.from({length:28},()=>bars.appendChild(c.h('i')));
   box.append(head,bars);box.onclick=()=>c.actions.tab('checks');
   function render(){
    const t=c.S.turns.slice(-cells.length),max=Math.max(1500,...t);
    cells.forEach((cell,i)=>{const v=t[i-(cells.length-t.length)];cell.style.height=v?Math.max(8,Math.round(v/max*100))+'%':'0';cell.classList.toggle('live',false);});
    if(c.S.state==='thinking'){const live=cells[cells.length-1];live.classList.add('live');}
    cur.textContent=t.length?c.ms(t[t.length-1]):'—';peak.textContent=t.length?c.ms(Math.max(...t)):'—';total.textContent=String(c.S.replies+c.S.spoken);
    const L=c.life;box.title='Reply times this session. Opens Checks.'+(L?' Lifetime: '+(L.replies+L.spoken).toLocaleString()+' replies, '+L.sessions+' sessions, '+(L.ach||[]).filter(a=>a.startsWith('st:')).length+' of 12 achievements.':'');
    box.dataset.state=c.S.state;
   }
   render();return {update(type){if(type==='turn'||type==='reply'||type==='state'||type==='life'||type==='report')render();}};
  }},
  // v2.22: Tyler's Steam persona in the header, like the friends list: Online, In voice, Away, Snooze or
  // Offline, in Steam's own colours. Clicking it opens the status menu with real actions.
  {id:'st-persona',mount(c){
   const chip=c.add('bar',c.h('button','fx st-persona'));chip.type='button';chip.setAttribute('aria-haspopup','menu');chip.setAttribute('aria-expanded','false');
   const dot=c.h('i','st-p-dot'),name=c.h('span','st-p-name');chip.append(dot,name);
   // v2.37: Away and Snooze show the Steam client's own away (moon) and sleep (Zz) icons (Pack 3) in place of the dot.
   const moon=c.brand('p3-away','st-p-bi'),zz=c.brand('p3-snooze','st-p-bi');for(const b of [moon,zz])if(b){b.style.display='none';dot.after(b);}
   const persona=()=>{const s=c.S.state;return s==='speaking'?['ingame','In voice']:s==='paused'?['away','Away']:s==='standby'?['away','Snooze']:s==='error'?['offline','Offline']:['online','Online'];};
   function render(){const [kind,label]=persona();chip.dataset.persona=kind;name.textContent=label;chip.title='Tyler is '+label.toLowerCase()+(c.S.text?': '+c.S.text:'')+'. Click for the status menu.';
    const icon=label==='Away'?moon:label==='Snooze'?zz:null;for(const b of [moon,zz])if(b)b.style.display=b===icon?'':'none';dot.style.display=icon?'none':'';}
   chip.onclick=()=>{if(chip.getAttribute('aria-expanded')==='true'){c._menu?.close();return;}
    const [kind,label]=persona(),paused=c.actions.paused(),L=c.life,got=(L?.ach||[...c._session]).filter(a=>String(a).startsWith('st:')).length;
    c.menu(chip,[{heading:'Robotic Tyler · '+label+(c.S.label&&c.S.label!==label?' · '+c.S.label:'')},
     paused?{mark:'●',label:'Online',hint:'Connect & start',run:c.actions.connect}:{mark:'●',label:'Online',current:kind!=='offline',hint:kind==='ingame'?'In voice':'',run:()=>{}},
     {mark:'●',icon:'p3-away',label:'Away',hint:'Pause AI',current:paused,disabled:paused,run:c.actions.pause},
     'sep',
     {mark:'★',icon:'achievement',label:'Achievements',hint:got+' of 12',run:()=>c.panel.dispatchEvent(new CustomEvent('tyler-fx',{detail:'st-achievements'}))},
     {mark:'✓',label:'Run full check',run:c.actions.fullCheck},
     {mark:'■',label:'Stop audio',run:c.actions.stopAudio},
     'sep',{mark:'⚙',icon:'workshop',label:'Settings…',run:c.actions.settings}],{cls:'st-menu',label:'Tyler status',align:'right'});};
   render();return {update(type){if(type==='state')render();}};
  }},
  {id:'st-achievements',mount(c){
   // Lifetime achievements (kept between sessions unless Settings → Appearance turns stats off).
   let queue=Promise.resolve();
   const total=k=>Math.max(Number(c.life?.[k])||0,Number(c.S[k])||0);
   const LIST=[
    ['ice','Breaking the Ice','First reply in chat.','✉',()=>total('replies')>=1],
    ['voice','First Words','Tyler spoke in a voice call.','◖',()=>total('spoken')>=1],
    ['ten','Chatterbox','10 replies.','10',()=>total('replies')+total('spoken')>=10],
    ['hundred','Life of the Party','100 replies.','C',()=>total('replies')+total('spoken')>=100],
    ['thousand','Legend of the Lobby','1,000 replies.','M',()=>total('replies')+total('spoken')>=1000],
    ['sound','Soundcheck','First soundboard clip in voice.','♫',()=>total('sounds')>=1],
    ['dj','Resident DJ','First song from the Music DJ.','♪',()=>total('songs')>=1||!!c.S.music],
    ['fast','Speed Demon','A reply in under a second.','⚡',(type,d)=>type==='report'?Number(d?.ms)<1000:type==='turn'?(c.S.turns.at(-1)??99999)<1000:type==='life'&&(c.life?.fastest||99999)<1000],
    ['streak','Unstoppable','15 replies in a row without a problem.','★',()=>Math.max(c.life?.bestStreak||0,c.S.best)>=15],
    ['regular','Regular','Tyler joined the squad 10 times.','⌂',()=>(c.life?.sessions||0)>=10],
    ['marathon','Marathon','10 hours on duty.','⏱',()=>(c.life?.timeMs||0)>=36e6],
    ['back','Back Online','Recovered after a problem.','↺',()=>false],
   ];
   // v2.22: progress toward the counted ones, for the achievements page.
   const PROGRESS={ten:[()=>total('replies')+total('spoken'),10],hundred:[()=>total('replies')+total('spoken'),100],thousand:[()=>total('replies')+total('spoken'),1000],
    streak:[()=>Math.max(c.life?.bestStreak||0,c.S.best),15],regular:[()=>c.life?.sessions||0,10],marathon:[()=>(c.life?.timeMs||0)/36e5,10]};
   const has=key=>(c.life?.ach||[...c._session]).includes('st:'+key);
   // v2.37: the Steam client's own icons (Pack 3) on the badges that have a matching one; the counts keep their number.
   const ICON={ice:'p3-chat',voice:'p3-mic',sound:'p3-volume',dj:'p3-music',fast:'p3-lightning',streak:'p3-fire',regular:'p3-home',marathon:'p3-clock',back:'p3-refresh'};
   const badge=(key,glyph)=>{const el=c.h('span','st-ach-icon'),bi=ICON[key]&&c.brand(ICON[key],'st-ach-bi');if(bi)el.append(bi);else el.textContent=glyph;return el;};
   function page(){
    const o=c.overlay('st-ach-page','Achievements');const got=LIST.filter(([k])=>has(k)).length;
    const head=c.h('div','st-ap-head'),bar=c.h('span','st-ap-bar'),fill=c.h('i');fill.style.width=Math.round(got/LIST.length*100)+'%';bar.append(fill);
    head.append(c.h('b',null,'Robotic Tyler'),c.h('span',null,'You have unlocked '+got+' of '+LIST.length+' achievements ('+Math.round(got/LIST.length*100)+'%)'),bar);o.el.append(head);
    const list=c.h('div','st-ap-list');
    for(const [key,name,desc,glyph] of [...LIST].sort((a,b)=>has(b[0])-has(a[0]))){
     const row=c.h('div','st-ap-row'+(has(key)?' got':''));const t=c.h('span','st-ap-text');t.append(c.h('b',null,name),c.h('span',null,desc));
     const pr=PROGRESS[key];if(pr&&!has(key)){const [now,max]=[pr[0](),pr[1]],pb=c.h('span','st-ap-prog'),pf=c.h('i');pf.style.width=Math.min(100,now/max*100)+'%';pb.append(pf);t.append(pb,c.h('small',null,(key==='marathon'?now.toFixed(1):Math.floor(now))+' / '+max));}
     row.append(badge(key,glyph),t,c.h('small','st-ap-state',has(key)?'Unlocked':'Locked'));list.append(row);}
    const x=c.h('button','st-ap-close','Close');x.type='button';x.onclick=o.close;o.el.append(list,x);
    if(!c.life)o.el.append(c.h('p','st-ap-note','Lifetime stats are off (Settings → Appearance): achievements last this session only.'));x.focus();
   }
   c.on(c.panel,'tyler-fx',e=>{if(e.detail==='st-achievements')page();});
   function toast(key,name,desc,glyph){
    queue=queue.then(()=>new Promise(done=>{
     const el=c.h('div','fx st-ach fx-interactive'),icon=badge(key,glyph),text=c.h('span','st-ach-text');
     text.append(c.h('small',null,'Achievement unlocked'),c.h('b',null,name),c.h('span',null,desc));el.append(icon,text);
     el.setAttribute('role','status');el.title='Open achievements';el.onclick=()=>{el.remove();page();};c.flash(el,5200);c.later(done,1400);
    }));
   }
   function check(type,d){
    for(const [key,name,desc,glyph,test] of LIST){
     const met=key==='back'?type==='state'&&d?.before==='error'&&['ready','listening'].includes(d?.state):test(type,d);
     if(met&&c.unlock('st:'+key))toast(key,name,desc,glyph);
    }
   }
   c.later(()=>check('life'),1500);
   // A turn's own timing (report) can follow its end by a moment, so speed is judged after it.
   return {update(type,d){if(type==='turn')c.later(()=>check('turn',d),1500);else if(['reply','state','sound','music','life','report'].includes(type))check(type,d);}};
  }},
 ]);

 // ── Classic Steam: the server browser and a VGUI progress dialog ──────────
 // v2.37 (Pack 3): the Chat row shows the 2004 client's own message envelope, and the status strip its
 // Away clock while Tyler is paused (assets/theme-visual-pack-3/select/classic.json), both at native size.
 F.define('classic',[
  {id:'cl-servers',mount(c){
   const box=c.add('deck',c.h('div','fx cl-servers'));box.setAttribute('role','listbox');box.setAttribute('aria-label','Tyler services. Enter opens the matching tab.');
   const head=c.h('div','cl-head');head.append(c.h('span',null,'Service'),c.h('span',null,'Status'),c.h('span',null,'Ping'));box.append(head);
   const rows=new Map();let selected='ai';
   for(const s of c.systems()){const row=c.h('div','cl-row');row.setAttribute('role','option');row.tabIndex=s.id==='ai'?0:-1;const lamp=c.h('i','cl-lamp');const name=c.h('span','cl-name',s.name),status=c.h('span','cl-status'),ping=c.h('span','cl-ping');const bi=(s.id==='chat'&&c.brand('p3-message','cl-bi'))||c.brand(({ai:'server',chat:'vgui-window',voice:'friends',music:'music'})[s.id],'cl-bi');if(bi)name.prepend(bi);name.prepend(lamp);row.append(name,status,ping);box.append(row);rows.set(s.id,{row,status,ping,tab:s.tab});
    row.onclick=()=>select(s.id);row.ondblclick=()=>c.actions.tab(s.tab);}
   let select=function(id){selected=id;for(const [k,r] of rows){r.row.setAttribute('aria-selected',String(k===id));r.row.tabIndex=k===id?0:-1;}};
   box.addEventListener('keydown',e=>{const ids=[...rows.keys()];let i=ids.indexOf(selected);if(e.key==='ArrowDown')i=Math.min(ids.length-1,i+1);else if(e.key==='ArrowUp')i=Math.max(0,i-1);else if(e.key==='Enter'){c.actions.tab(rows.get(selected).tab);return;}else return;e.preventDefault();select(ids[i]);rows.get(ids[i]).row.focus();});
   function render(){
    const sys=c.systems(),v=c.voice();
    for(const s of sys){const r=rows.get(s.id);r.row.dataset.level=s.level;r.status.textContent=s.detail;
     r.ping.textContent=s.id==='ai'?(c.S.turns.length?Math.round(c.avgTurn()):'—'):s.id==='voice'?(v.armed?String(v.peers):'—'):s.id==='chat'?(s.level===3?String(c.S.heard):'—'):(c.S.music?'♪':'—');}
   }
   // v2.22: a status bar like the server browser's: details of the selected service, Refresh
   // (re-reads every service; the voice bridge too) and Connect (opens the service's tab).
   const bar=c.h('div','cl-foot'),info=c.h('span','cl-info'),refresh=c.h('button','cl-btn','Refresh'),connect=c.h('button','cl-btn','Connect');
   refresh.type=connect.type='button';refresh.title='Refresh every service';connect.title='Open the selected service';bar.append(info,refresh,connect);box.append(bar);
   const detail=id=>{const v=c.voice(),S=c.S;return id==='ai'?(S.model||'AI')+' · '+(S.turns.length?'avg '+c.ms(c.avgTurn())+' · '+(S.replies+S.spoken)+' replies':'no replies yet'):id==='chat'?S.heard+' messages heard this session':id==='voice'?(v.armed?(v.inCall?v.peers+' in call · ':'not in a call · ')+(v.attached?'audio attached':'audio not attached'):'microphone off'):(S.music?'Now playing: '+S.music:'Music DJ idle');};
   const showInfo=()=>{info.textContent=detail(selected);};
   const select0=select;select=id=>{select0(id);showInfo();};
   refresh.onclick=()=>{c.actions.refreshVoice();box.classList.remove('cl-scan');void box.offsetWidth;box.classList.add('cl-scan');info.textContent='Refreshing servers…';c.later(()=>{render();showInfo();},650);};
   connect.onclick=()=>c.actions.tab(rows.get(selected).tab);
   select('ai');render();c.every(()=>{render();showInfo();});return {update(){render();showInfo();}};
  }},
  {id:'cl-progress',mount(c){
   let dialog=null,wait=0;
   function close(){if(wait)c.cancel(wait);wait=0;dialog?.remove();dialog=null;}
   function open(){
    close();const est=Math.max(800,c.avgTurn());
    dialog=c.h('div','fx cl-dialog');dialog.setAttribute('role','status');
    const title=c.h('div','cl-title','Steam - Preparing reply'),body=c.h('div','cl-body');
    const bar=c.h('div','cl-bar');for(let i=0;i<18;i++)bar.append(c.h('i'));
    // v2.22: elapsed time ticks while it works; when the reply is done the bar fills and it says so.
    const elapsed=c.h('small','cl-elapsed'),started=c.S.since||Date.now();const tick=()=>{if(!dialog)return;elapsed.textContent='Elapsed: '+c.ms(Date.now()-started)+' · estimated about '+c.ms(est);c.later(tick,250);};
    body.append(c.h('p',null,'Tyler is writing a reply…'),bar,elapsed);tick();
    dialog.style.setProperty('--fill',Math.round(est)+'ms');dialog.append(title,body);c.slots.layer.append(dialog);
   }
   function done(ok){if(!dialog)return close();dialog.classList.add(ok?'cl-done':'cl-fail');dialog.querySelector('p').textContent=ok?'Reply complete.':'Tyler ran into a problem.';dialog.querySelector('.cl-title').textContent=ok?'Steam - Complete':'Steam - Error';const d=dialog;c.later(()=>{if(dialog===d)close();},ok?650:1400);}
   return {update(type,d){if(type!=='state')return;if(d.state==='thinking'){if(!wait&&!dialog)wait=c.later(()=>{wait=0;if(c.S.state==='thinking')open();},700);}else if(d.before==='thinking'&&dialog)done(d.state!=='error');else close();},unmount:close};
  }},
 ]);

 // ── Team Fortress 2: class-select navigation, a killfeed and a taunt ──────
 // v2.30: each tab's class emblem (Pack 2): the talker is the Scout.
 const TF_CLASS={conversation:'source-class-scout',room:'source-class-engineer',soundboard:'source-class-soldier',setup:'source-class-medic',checks:'source-class-sniper'};
 // v2.37 (Pack 3): while Tyler is paused (or on standby) the status strip shows the Spy's emblem: cloaked.
 const ROLES={conversation:['Chat','The talker. Keeps the banter going.'],room:['Room','The engineer. Builds the party.'],soundboard:['Sounds','The soldier. Loudest one here.'],setup:['Setup','The medic. Keeps Tyler alive.'],checks:['Checks','The sniper. Finds the problem.']};
 F.define('tf2',[
  {id:'tf-class',mount(c){
   let caption=null;
   c.key(e=>{const n=Number(e.key);if(n>=1&&n<=5&&!e.repeat){e.preventDefault();c.actions.tab(c.TABS[n-1]);}});
   return {update(type,d){if(type!=='tab')return;caption?.remove();const [name,role]=ROLES[d.tab]||[];if(!name)return;
    caption=c.h('div','fx tf-class');const em=c.brand(TF_CLASS[d.tab],'tf-class-bi');if(em)caption.append(em);caption.append(c.h('small',null,'Class '+(c.TABS.indexOf(d.tab)+1)),c.h('b',null,name),c.h('span',null,role));c.flash(caption,1500);}};
  }},
  {id:'tf-killfeed',mount(c){
   const feed=c.add('layer',c.h('div','fx tf-feed'));feed.setAttribute('role','log');feed.setAttribute('aria-label','Activity');
   const place=()=>{feed.style.top=(c.below('.tabs')+6)+'px';};place();c.later(place,400);
   function push(icon,verb,target,bad=false){place();const row=c.h('div','tf-kill'+(bad?' bad':''));row.append(c.h('b','tf-name','TYLER'),c.h('span','tf-icon',icon),c.h('span','tf-target',target||verb));feed.prepend(row);while(feed.children.length>4)feed.lastElementChild.remove();c.later(()=>row.classList.add('gone'),5600);c.later(()=>row.remove(),6000);}
   // v2.22: real streaks and speed: a reply under a second is a critical, every fifth in a row a
   // domination, and coming back from a problem is revenge.
   let streak=0;
   function special(text,kind){place();const row=c.h('div','tf-kill tf-special '+kind);row.append(c.h('b','tf-name','TYLER'),c.h('span','tf-target',text));feed.prepend(row);while(feed.children.length>4)feed.lastElementChild.remove();c.later(()=>row.classList.add('gone'),5600);c.later(()=>row.remove(),6000);}
   return {update(type,d){
    if(type==='turn'){streak++;if(d.ms<1000)push('✸','crit','critical reply · '+c.ms(d.ms));if(streak%5===0)special('is DOMINATING the chat · '+streak+' in a row','dom');}
    if(type==='state'&&d.state==='error'){streak=0;}
    if(type==='state'&&d.before==='error'&&['ready','listening'].includes(d.state))special('got REVENGE on the error','rev');
    if(type==='reply')push('✎','replied','chat · '+d.chars+' chars');
    if(type==='state'&&d.state==='speaking'&&d.before!=='speaking')push('🔊','spoke','voice call');
    if(type==='sound')push('📣','played',d.name);
    if(type==='music'&&d.title)push('♪','queued',d.title.slice(0,32));
    if(type==='state'&&d.state==='error'&&d.before!=='error')push('☠','error','Needs attention',true);
   }};
  }},
  // v2.22: press E to call for a MEDIC: Tyler shouts it and the Checks tab (the medic) opens.
  {id:'tf-medic',mount(c){
   let last=0;
   function call(){if(Date.now()-last<1500)return;last=Date.now();const b=c.h('div','fx tf-medic');const mc=c.brand('medic-cross','tf-medic-bi');if(mc)b.append(mc);b.append(c.h('b',null,'MEDIC!'),c.h('small',null,'Checks tab: run the full check to patch Tyler up'));c.flash(b,1800);const mark=c.root.querySelector('.mark');mark?.classList.add('tf-medic-call');mark?.addEventListener('animationend',()=>mark.classList.remove('tf-medic-call'),{once:true});c.later(()=>mark?.classList.remove('tf-medic-call'),900);c.actions.tab('checks');}
   c.key(e=>{if((e.key==='e'||e.key==='E')&&!e.repeat){e.preventDefault();call();}});
   const hint=c.root.querySelector('#tab-checks');hint?.setAttribute('title','Checks (5) · E calls for a medic');
   return {update(type,d){if(type==='state'&&d.state==='error'&&d.before!=='error'){const b=c.h('div','fx tf-medic tf-medic-hint');b.append(c.h('b',null,'Tyler is hurt'),c.h('small',null,'Press E for a medic'));c.flash(b,2600);}},unmount(){hint?.removeAttribute('title');}};
  }},
  {id:'tf-taunt',mount(c){
   const mark=c.root.querySelector('.mark');let busy=false;
   c.on(mark,'dblclick',()=>{if(busy)return;busy=true;mark.classList.add('tf-taunting');const cap=c.h('div','fx tf-taunt',['Victory!','Nope.','Battle cry!','Schadenfreude!'][Math.floor(Math.random()*4)]);c.flash(cap,1300);c.later(()=>{mark.classList.remove('tf-taunting');busy=false;},1300);});
   mark.title='Double-click to taunt';
   return {unmount(){mark.classList.remove('tf-taunting');mark.removeAttribute('title');}};
  }},
 ]);

 // ── Counter-Strike 2: round HUD, the buy wheel for sounds, round banners ──
 F.define('cs2',[
  {id:'cs-round',mount(c){
   const box=c.add('deck',c.h('div','fx cs-round'));
   const ct=c.h('div','cs-side ct'),t=c.h('div','cs-side t'),mid=c.h('div','cs-mid');
   const ctScore=c.h('b'),tScore=c.h('b'),time=c.h('span','cs-time'),round=c.h('small'),alive=c.h('span','cs-alive');
   ct.append(ctScore,c.h('span',null,'TYLER'));t.append(c.h('span',null,'SQUAD'),tScore);mid.append(time,round);box.append(ct,mid,t,alive);
   ct.title='Replies this session (chat and voice)';t.title='Chat messages Tyler heard this session';alive.title='People in the voice call';
   // v2.22: a sound that plays shows as a purchase in the middle, like the buy feed; a reply under a
   // second earns the round MVP star beside Tyler's score.
   let bought=null,boughtAt=0;const mvp=c.h('i','cs-mvp','★');mvp.title='MVP: a reply in under a second';ct.prepend(mvp);
   // v2.37: the HUD's own buy-zone cart (Pack 3) beside BOUGHT.
   const cart=c.brand('p3-buyzone','cs-cart-bi');
   function render(){ctScore.textContent=String(c.S.replies+c.S.spoken);tScore.textContent=String(c.S.heard);
    if(bought&&Date.now()-boughtAt<1800){time.replaceChildren(...(cart?[cart]:[]),'BOUGHT');round.textContent=bought;box.dataset.bought='true';}else{bought=null;box.removeAttribute('data-bought');time.textContent=c.clock(Date.now()-c.S.started);round.textContent='ROUND '+(c.S.turns.length+1);}
    mvp.hidden=!(c.S.turns.length&&Math.min(...c.S.turns.slice(-5))<1000);
    const v=c.voice(),n=Math.min(5,v.peers);alive.replaceChildren(...Array.from({length:5},(_,i)=>{const d=c.h('i');if(i<n)d.className='on';return d;}));box.dataset.state=c.S.state;}
   render();c.every(render);return {update(type,d){if(type==='sound'&&d?.name){bought=String(d.name).slice(0,24);boughtAt=Date.now();c.later(render,1850);}render();}};
  }},
  {id:'cs-wheel',mount(c){
   const chip=c.add('bar',c.h('button','fx fx-chip cs-buy','B'));chip.type='button';chip.title='Sound wheel (B)';chip.setAttribute('aria-label','Open the sound wheel');
   {const cart=c.brand('p3-buyzone','cs-buy-bi');if(cart)chip.prepend(cart);} // v2.37: B is the buy menu: the HUD's buy-zone cart (Pack 3).
   let wheel=null;
   function close(){wheel?.remove();wheel=null;chip.setAttribute('aria-expanded','false');}
   function open(){
    if(wheel)return close();const {slots,favorites}=c.actions.sounds();
    const pick=[...favorites.map(n=>slots.find(s=>s.slot===n)).filter(Boolean),...slots.filter(s=>!favorites.includes(s.slot))].slice(0,8);
    wheel=c.h('div','fx cs-wheel fx-interactive');wheel.setAttribute('role','menu');wheel.setAttribute('aria-label','Sound wheel');
    const center=c.h('div','cs-wheel-center','Pick a sound');wheel.append(center);
    if(!pick.length)center.textContent='Open Sounds once to load the board';
    // v2.22: point at a slice (or use the arrow keys) to highlight it, click or Enter to buy it.
    const slices=[];let hot=-1;const ring=c.h('i','cs-wheel-ring');wheel.append(ring);
    const light=i=>{hot=i;slices.forEach((b,k)=>b.classList.toggle('hot',k===i));const s=pick[i];center.replaceChildren(c.h('b',null,s?s.name:'Pick a sound'),c.h('small',null,s?(favorites.includes(s.slot)?'★ favourite · ':'')+'slot '+s.slot+' · click to buy':'1–8 · arrows · Esc'));if(s)ring.style.setProperty('--a',(i/pick.length*360)+'deg');ring.classList.toggle('on',!!s);};
    pick.forEach((s,i)=>{const a=i/pick.length*Math.PI*2-Math.PI/2,b=c.h('button','cs-slice'+(favorites.includes(s.slot)?' fav':''));b.type='button';b.setAttribute('role','menuitem');
     b.style.left=(50+Math.cos(a)*38)+'%';b.style.top=(50+Math.sin(a)*38)+'%';b.append(c.h('small',null,String(i+1)),c.h('span',null,s.name));
     b.onfocus=()=>light(i);b.onmouseenter=()=>b.focus({preventScroll:true});b.onclick=e=>{e.stopPropagation();c.actions.playSound(s.slot);close();};wheel.append(b);slices.push(b);});
    wheel.addEventListener('pointermove',e=>{if(!pick.length)return;const r=wheel.getBoundingClientRect(),dx=e.clientX-r.left-r.width/2,dy=e.clientY-r.top-r.height/2;if(Math.hypot(dx,dy)<r.width*.16)return;let a=Math.atan2(dy,dx)+Math.PI/2;if(a<0)a+=Math.PI*2;const i=Math.round(a/(Math.PI*2)*pick.length)%pick.length;if(i!==hot)slices[i].focus({preventScroll:true});});
    wheel.addEventListener('click',e=>{if(e.target===wheel&&hot>=0)slices[hot].click();});
    wheel.addEventListener('keydown',e=>{if(!pick.length)return;if(e.key==='ArrowRight'||e.key==='ArrowDown'){e.preventDefault();slices[(hot+1)%pick.length].focus();}else if(e.key==='ArrowLeft'||e.key==='ArrowUp'){e.preventDefault();slices[(hot-1+pick.length)%pick.length].focus();}});
    const x=c.h('button','cs-wheel-close','✕');x.type='button';x.setAttribute('aria-label','Close');x.onclick=close;wheel.append(x);
    c.slots.layer.append(wheel);chip.setAttribute('aria-expanded','true');(slices[0]||x).focus();
   }
   chip.onclick=open;
   c.key(e=>{if(e.key==='b'||e.key==='B'){if(!e.repeat){e.preventDefault();open();}}else if(wheel&&e.key==='Escape'){e.preventDefault();close();}else if(wheel&&/^[1-8]$/.test(e.key)){e.preventDefault();wheel.querySelectorAll('.cs-slice')[Number(e.key)-1]?.click();}});
   return {unmount:close};
  }},
  {id:'cs-banner',mount(c){
   let last=0;
   function show(kind,title,sub){if(Date.now()-last<2500)return;last=Date.now();const el=c.h('div','fx cs-banner '+kind);const ic=kind==='win'?c.brand('source-ct-logo','cs-banner-bi cs-banner-ct')||c.brand('round-win','cs-banner-bi'):c.brand('source-equipment-c4','cs-banner-bi')||c.brand('c4-timer','cs-banner-bi');if(ic)el.append(ic);el.append(c.h('b',null,title),c.h('span',null,sub));c.flash(el,1900);}
   return {update(type,d){if(type==='turn')show('win','Round won',(d.ms<1500?'MVP · ':'')+'Tyler answered in '+c.ms(d.ms));if(type==='state'&&d.state==='error'&&d.before!=='error')show('loss','Round lost','Tyler needs attention');}};
  }},
  // v2.37: while Tyler reconnects (the strip's waiting state) its badge is CS2's "connecting to the network"
  // globe (Pack 3, select/cs2.json); this adds the indicator's outer ring around it, as the main menu draws them.
  {id:'cs-net',mount(c){
   const brand=c.root.querySelector('#activityCard .tally-brand'),ring=brand&&c.brand('p3-gc-ring','tally-bi cs-gc-ring');
   if(!ring)return {};ring.dataset.for='waiting';brand.append(ring);
   return {unmount(){ring.remove();}};
  }},
 ]);

 // ── Portal: the chamber sign and portal transitions between tabs ──────────
 const PO_ICONS={ai:'<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="7"/><path d="M12 5v14M5 12h14"/></svg>',chat:'<svg viewBox="0 0 24 24"><path d="M4 6h16v9H10l-5 4v-4H4z"/></svg>',voice:'<svg viewBox="0 0 24 24"><rect x="9" y="3" width="6" height="11" rx="3"/><path d="M6 11a6 6 0 0 0 12 0M12 17v4"/></svg>',
  people:'<svg viewBox="0 0 24 24"><circle cx="8" cy="8" r="3"/><circle cx="16" cy="8" r="3"/><path d="M3 20c0-4 2.5-6 5-6s5 2 5 6M11 20c0-4 2.5-6 5-6s5 2 5 6"/></svg>',music:'<svg viewBox="0 0 24 24"><path d="M9 18V5l11-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="17" cy="16" r="3"/></svg>',sound:'<svg viewBox="0 0 24 24"><path d="M4 9h4l5-4v14l-5-4H4z"/><path d="M16 9a4 4 0 0 1 0 6M19 6a8 8 0 0 1 0 12"/></svg>'};
 // v2.37: the real chamber-sign pictograms (Pack 3: Portal's signage_overlay_* cut-outs, traced) on the sign's
 // tiles, in place of the drawn icons: the cube dispenser for the AI, the pellet catcher for chat, the turret for
 // voice, the Companion Cube for people in the call, the cake for music and the energy pellet for the soundboard.
 const PO_SIGN={ai:'p3-sign-dispenser',chat:'p3-sign-catcher',voice:'p3-sign-turret',people:'p3-sign-cube',music:'p3-sign-cake',sound:'p3-sign-energyball'};
 F.define('portal',[
  {id:'po-sign',mount(c){
   const box=c.add('deck',c.h('div','fx po-sign'));
   const num=c.h('b','po-num'),of=c.h('span','po-of'),bar=c.h('span','po-progress'),icons=c.h('span','po-icons');
   const left=c.h('div','po-left');left.append(num,of);const right=c.h('div','po-right');right.append(c.h('small',null,'Tests passed · subject health'),bar,icons);box.append(left,right);
   for(let i=0;i<10;i++)bar.append(c.h('i'));
   // v2.37: the chamber's own exit-door sign in the sign's corner (Pack 3: Portal's signage_doorstate, both
   // frames): the orange tick while Tyler is running, the blue X while he's paused, on standby or needs attention.
   const locked=()=>['error','paused','standby'].includes(c.S.state);
   const doorOpen=c.brand('p3-door-open','po-door-bi'),doorShut=c.brand('p3-door-locked','po-door-bi'),door=doorOpen&&doorShut&&c.h('span','po-door');
   if(door){door.append(doorOpen,doorShut);door.setAttribute('aria-hidden','true');box.append(door);}
   const lit=new Map();for(const [k,label] of [['ai','AI key saved'],['chat','Chat linked'],['voice','Voice armed'],['people','People in the call'],['music','Music playing'],['sound','Soundboard used']]){const art=c.brand(PO_SIGN[k],'po-p3'),i=art||c.svg(PO_ICONS[k],'po-icon');const w=c.h('span','po-tile'+(art?' po-tile-p3':''));w.title=label;w.setAttribute('aria-label',label);w.append(i);icons.append(w);lit.set(k,w);}
   function render(){const S=c.S,v=c.voice(),sys=c.systems();const passed=S.replies+S.spoken;num.textContent=c.pad(passed);of.textContent=S.errors?'/'+c.pad(passed+S.errors):'';left.title=passed+' replies'+(S.errors?', '+S.errors+' problems':'');
    const h=c.health();[...bar.children].forEach((x,i)=>x.classList.toggle('on',i<Math.round(h/10)));
    const on={ai:S.keyOk===true,chat:sys[1].level===3,voice:v.armed,people:v.peers>0,music:!!S.music,sound:S.sounds>0};
    for(const [k,w] of lit){w.classList.toggle('on',!!on[k]);w.setAttribute('aria-label',w.title+(on[k]?': yes':': no'));}box.dataset.state=S.state;
    if(door){const shut=locked();door.dataset.door=shut?'locked':'open';door.title=shut?'Exit door locked: Tyler is paused or needs attention':'Exit door open: Tyler is running';}}
   // v2.22: the sign opens the chamber report (Enter or click): what each tile means and the numbers.
   box.tabIndex=0;box.setAttribute('role','button');box.title='Test chamber report';
   function report(){const S=c.S,v=c.voice(),L=c.life,o=c.overlay('po-report','Test chamber report');
    const head=c.h('div','po-r-head');const ap=c.brand('aperture-iris','po-r-bi');if(ap)head.append(ap);head.append(c.h('b',null,c.pad(S.replies+S.spoken)),c.h('span',null,'Test chamber report · subject: Robotic Tyler'));
    const rows=[['Tests passed',S.replies+S.spoken],['Tests failed',S.errors],['Fastest test',S.turns.length?c.ms(Math.min(...S.turns)):'—'],['Average test',S.turns.length?c.ms(c.avgTurn()):'—'],['Subject health',c.health()+'%'],['Exit door',locked()?'Locked':'Open'],['Observers in the call',v.peers],['Lifetime tests',L?(L.replies+L.spoken).toLocaleString():'—']];
    const t=c.h('div','po-r-rows');for(const [k,val] of rows){const r=c.h('div');r.append(c.h('span',null,k),c.h('b',null,String(val)));t.append(r);}
    const legend=c.h('div','po-r-legend');for(const w of icons.children){const r=c.h('div');r.append(w.cloneNode(true),c.h('span',null,w.title+(w.classList.contains('on')?': yes':': not yet')));legend.append(r);}
    const x=c.h('button','po-r-close','Continue testing');x.type='button';x.onclick=o.close;o.el.append(head,t,legend,x);x.focus({preventScroll:true});}
   box.onclick=report;box.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();report();}};
   const mark=c.root.querySelector('.mark');let quip=0;
   const LINES=['Thank you for testing. Your participation has been noted.','This next test involves talking. Please keep talking.','The subject is performing within acceptable parameters.','Remain calm. The chat will not harm you.'];
   c.on(mark,'dblclick',()=>{const el=c.h('div','fx po-quip');el.append(c.h('small',null,'Enrichment Center announcement'),c.h('span',null,LINES[quip++%LINES.length]));c.flash(el,3200);mark.classList.add('po-blink');c.later(()=>mark.classList.remove('po-blink'),700);});
   render();c.every(render);return {update:render};
  }},
  {id:'po-portal',mount(c){
   const scroll=c.root.querySelector('.scroll'),tabs=c.root.querySelector('.tabs');let prev=c.S.tab;
   return {update(type,d){if(type!=='tab'||d.tab===prev||c.reduced)return;
    const from=c.TABS.indexOf(prev),to=c.TABS.indexOf(d.tab);prev=d.tab;
    const x=((to+.5)/c.TABS.length*100).toFixed(1)+'%';scroll.style.setProperty('--po-x',x);
    scroll.classList.remove('po-enter');void scroll.offsetWidth;scroll.classList.add('po-enter');c.later(()=>scroll.classList.remove('po-enter'),520);
    const ring=c.h('span','fx po-ring '+(to>from?'blue':'orange'));const r=tabs.getBoundingClientRect(),p=c.panel.getBoundingClientRect();ring.style.left=x;ring.style.top=(r.bottom-p.top)+'px';c.flash(ring,560);
   },unmount(){scroll.classList.remove('po-enter');}};
  }},
 ]);

 // ── Counter-Strike 1.6: the scoreboard and the radio menu ─────────────────
 F.define('cs16',[
  {id:'c16-score',mount(c){
   const chip=c.add('bar',c.h('button','fx fx-chip c16-chip','Score'));chip.type='button';chip.title='Scoreboard';
   let board=null,table=null,title=null,last='';
   function close(){board?.remove();board=null;chip.setAttribute('aria-pressed','false');}
   // v2.22: the scoreboard refreshes itself every second while it's open; Tyler's row flashes when his score changes.
   function fill(){const S=c.S,v=c.voice();title.lastChild.textContent='Session '+c.clock(Date.now()-S.started);table.replaceChildren();
    const head=table.insertRow();for(const t of ['Name','Score','Deaths','Latency'])head.append(c.h('th',null,t));
    const add=(name,score,deaths,lat,cls)=>{const r=table.insertRow();if(cls)r.className=cls;for(const t of [name,score,deaths,lat])r.insertCell().textContent=String(t);return r;};
    const me=add('ROBOTIC TYLER',S.replies+S.spoken,S.errors,S.turns.length?Math.round(c.avgTurn()):'—','me');
    add('Chat reader',S.heard,0,'—');add('Voice bridge',v.armed?v.peers+' in call':'off',0,'—');add('Soundboard',S.sounds,0,'—');add('Music DJ',S.music?'playing':'idle',0,'—');
    const now=[S.replies+S.spoken,S.errors].join('|');if(last&&now!==last)me.classList.add('c16-up');last=now;}
   function open(){
    if(board)return close();
    board=c.h('div','fx c16-board fx-interactive');board.setAttribute('role','dialog');board.setAttribute('aria-label','Scoreboard');
    title=c.h('div','c16-title');{const cm=c.brand('counter-strike-mark','c16-title-bi');if(cm)title.append(cm);}title.append(c.h('b',null,'ROBOTIC TYLER'),c.h('span',null,''));table=c.h('table');last='';fill();
    const x=c.h('button','c16-close','Close');x.type='button';x.onclick=close;board.append(title,table,x);c.slots.layer.append(board);chip.setAttribute('aria-pressed','true');x.focus();
   }
   c.every(()=>{if(board)fill();});
   chip.onclick=open;c.key(e=>{if(board&&e.key==='Escape'){e.preventDefault();close();}});return {unmount:close};
  }},
  {id:'c16-radio',mount(c){
   const chip=c.add('bar',c.h('button','fx fx-chip c16-chip','Radio'));chip.type='button';chip.title='Radio commands (V)';
   const items=[['Pause AI',c.actions.pause,'Hold this position.'],['Stop audio',c.actions.stopAudio,'Fire in the hole!'],['Test beep',c.actions.beep,'Check, check.'],['Run checks',()=>c.actions.tab('checks'),'Need backup.'],['Collapse panel',c.actions.collapse,'Sector clear.'],
    // v2.22: Go go go! starts Tyler (Connect & start); Report in runs the full check.
    ['Go go go! (Connect & start)',c.actions.connect,'Go go go!'],['Report in (full check)',c.actions.fullCheck,'Reporting in.']];
   let menu=null;
   function close(){menu?.remove();menu=null;}
   function choose(i){const it=items[i];close();if(!it)return;it[1]();const msg=c.h('div','fx c16-roger');{const ri=c.brand('radio','c16-roger-bi');if(ri)msg.append(ri);}msg.append(c.h('b',null,'ROBOTIC TYLER (RADIO): '),it[2]);c.flash(msg,2200);}
   function open(){if(menu)return close();menu=c.h('div','fx c16-menu fx-interactive');menu.setAttribute('role','menu');{const rh=c.h('b',null,'Radio commands'),ri=c.brand('radio','c16-menu-bi');if(ri)rh.prepend(ri);menu.append(rh);}
    items.forEach((it,i)=>{const b=c.h('button','c16-item');b.type='button';b.setAttribute('role','menuitem');b.append(c.h('span',null,(i+1)+'.'),' '+it[0]);b.onclick=()=>choose(i);menu.append(b);});
    const x=c.h('button','c16-item');x.type='button';x.append(c.h('span',null,'0.'),' Exit');x.onclick=close;menu.append(x);c.slots.layer.append(menu);menu.querySelector('button').focus();}
   chip.onclick=open;
   c.key(e=>{if((e.key==='v'||e.key==='V')&&!e.repeat){e.preventDefault();open();}else if(menu&&/^[0-7]$/.test(e.key)){e.preventDefault();e.key==='0'?close():choose(Number(e.key)-1);}else if(menu&&e.key==='Escape'){e.preventDefault();close();}});
   return {unmount:close};
  }},
  // v2.37: the HUD's own health cross (Pack 3: GoldSrc 640hud sprite, additive, tinted like the HUD) in place of
  // the drawn one on the first stat. Like the game's, it turns red when Tyler's health is 25 or less.
  // The thinking badge is the HUD's C4 icon, green like the game's status icons (select/cs16.json).
  {id:'c16-hud',mount(c){
   const stat=c.root.querySelector('#hud .stat'),cross=stat&&c.brand('p3-hp-cross','c16-hp');
   if(!cross)return {};stat.prepend(cross);
   let shown=-1;
   const render=()=>{const h=c.health();if(h===shown)return;shown=h;cross.classList.toggle('low',h<=25);stat.title='Tyler\'s health: '+h+'%';};
   render();c.every(render);
   return {update(type){if(type==='state')render();},unmount(){cross.remove();stat.removeAttribute('title');}};
  }},
 ]);

 // ── HEV suit: suit voice captions, damage indicators and a flashlight ─────
 const HEV={ready:'Communications link established',listening:'Voice signal detected',thinking:'Processing. Please wait',speaking:'Broadcasting on voice channel',waiting:'Automatic recovery engaged',error:'Warning: system fault detected',paused:'Automatic systems offline',standby:'Standby. Secondary unit active'};
 // v2.37 (Pack 3): errors and warnings (the status strip, notifications, dialogs) show the HUD's own radiation
 // damage icon, traced from Half-Life's 640hud sprite, in place of the drawn one (select/hev.json).
 F.define('hev',[
  {id:'hev-voice',mount(c){
   let line=null;
   function say(text){line?.remove();line=c.h('div','fx hev-say');line.setAttribute('role','status');line.textContent=text.toUpperCase();c.flash(line,3600);}
   c.later(()=>say('HEV Mark V: power level '+c.health()+'%'),400);
   return {update(type,d){if(type==='state'&&d.state!==d.before&&HEV[d.state])say(HEV[d.state]);if(type==='music'&&d.title)say('Audio playback: '+d.title.slice(0,40));}};
  }},
  {id:'hev-damage',mount(c){
   // v2.22: the status strip is a suit charger: click it to recharge (refresh the voice bridge and
   // re-read every system). Low health gets the suit's critical warning.
   const tally=c.root.getElementById('activityCard');let warned=false;
   const charge=()=>{c.actions.refreshVoice();tally.classList.remove('hev-charging');void tally.offsetWidth;tally.classList.add('hev-charging');c.later(()=>tally.classList.remove('hev-charging'),1200);const el=c.h('div','fx hev-say');el.setAttribute('role','status');el.textContent='SUIT CHARGER: POWER LEVEL '+c.health()+'%';c.flash(el,2600);};
   c.on(tally,'click',charge);tally.title='Suit charger: click to recharge (refresh voice status)';tally.style.cursor='pointer';
   return {update(type,d){
    if(type==='state'){const h=c.health();if(h<30&&!warned){warned=true;const el=c.h('div','fx hev-say hev-crit');el.setAttribute('role','status');el.textContent='WARNING: VITAL SIGNS CRITICAL';c.flash(el,3000);}if(h>=60)warned=false;}
    if(type!=='state'||d.state!=='error'||d.before==='error')return;const el=c.h('div','fx hev-hit');for(const s of ['t','r','b','l'])el.append(c.h('i',s));c.flash(el,1400);},
    unmount(){tally.removeAttribute('title');tally.style.cursor='';tally.classList.remove('hev-charging');}};
  }},
  {id:'hev-light',mount(c){
   const b=c.add('bar',c.h('button','fx fx-chip hev-lamp'));b.type='button';b.setAttribute('aria-pressed','false');b.title='Flashlight: brighter, higher-contrast panel (F)';b.setAttribute('aria-label','Flashlight');
   // v2.37: the HUD's own flashlight (Pack 3: Half-Life's flash_empty, flash_full and flash_beam sprites), drawn
   // the way the game does: the casing, its charge filled from the right, and the beam while it's on. The charge
   // is Tyler's health.
   const parts=['p3-flash-empty','p3-flash-full','p3-flash-beam'].map(id=>c.brand(id,'hev-fl '+id.slice(3)));
   let fill=null;
   if(parts.every(Boolean)){const lamp=c.h('span','hev-flash');lamp.setAttribute('aria-hidden','true');const casing=c.h('span','hev-fl-casing');casing.append(parts[0],parts[1]);lamp.append(casing,parts[2]);b.append(lamp);b.classList.add('hev-lamp-hud');fill=parts[1];}
   else b.append(c.brand('flashlight','hev-bi')||c.svg('<svg viewBox="0 0 24 24"><path d="M3 9h7l3-3h4v12h-4l-3-3H3z"/><path d="M19 8l3-2M19 16l3 2M19 12h3"/></svg>'));
   let charge=-1;
   const render=()=>{if(!fill)return;const h=c.health();if(h===charge)return;charge=h;fill.style.clipPath='inset(0 0 0 '+(100-h)+'%)';b.title='Flashlight: brighter, higher-contrast panel (F). Charge: Tyler\'s health, '+h+'%';};
   const toggle=()=>{const on=!c.panel.hasAttribute('data-hev-light');c.panel.toggleAttribute('data-hev-light',on);b.setAttribute('aria-pressed',String(on));};
   b.onclick=toggle;c.key(e=>{if((e.key==='f'||e.key==='F')&&!e.repeat){e.preventDefault();toggle();}});
   render();if(fill)c.every(render);
   return {update(type){if(type==='state')render();},unmount(){c.panel.removeAttribute('data-hev-light');}};
  }},
 ]);
})();

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
   stats.append('CURRENT ',cur,' PEAK ',peak,' REPLIES ',total);head.append(title,stats);
   const bars=c.h('span','st-bars');const cells=Array.from({length:28},()=>bars.appendChild(c.h('i')));
   box.append(head,bars);box.onclick=()=>c.actions.tab('checks');
   function render(){
    const t=c.S.turns.slice(-cells.length),max=Math.max(1500,...t);
    cells.forEach((cell,i)=>{const v=t[i-(cells.length-t.length)];cell.style.height=v?Math.max(8,Math.round(v/max*100))+'%':'0';cell.classList.toggle('live',false);});
    if(c.S.state==='thinking'){const live=cells[cells.length-1];live.classList.add('live');}
    cur.textContent=t.length?c.ms(t[t.length-1]):'—';peak.textContent=t.length?c.ms(Math.max(...t)):'—';total.textContent=String(c.S.replies+c.S.spoken);
    box.dataset.state=c.S.state;
   }
   render();return {update(type){if(type==='turn'||type==='reply'||type==='state')render();}};
  }},
  {id:'st-achievements',mount(c){
   const got=new Set();let queue=Promise.resolve();
   function unlock(key,name,desc,glyph){
    if(got.has(key))return;got.add(key);
    queue=queue.then(()=>new Promise(done=>{
     const el=c.h('div','fx st-ach'),icon=c.h('span','st-ach-icon',glyph),text=c.h('span','st-ach-text');
     text.append(c.h('small',null,'Achievement unlocked'),c.h('b',null,name),c.h('span',null,desc));el.append(icon,text);
     el.setAttribute('role','status');c.flash(el,5200);c.later(done,1400);
    }));
   }
   return {update(type,d){
    const S=c.S;
    if(type==='reply'&&S.replies===1)unlock('ice','Breaking the Ice','Tyler sent his first reply in chat.','✉');
    if((type==='reply'||type==='state')&&S.replies+S.spoken===10)unlock('ten','Chatterbox','10 replies this session.','10');
    if(type==='state'&&d.state==='speaking'&&S.spoken===1)unlock('voice','First Words','Tyler spoke in the voice call.','◖');
    if(type==='turn'&&d.ms<1000)unlock('fast','Speed Demon','A reply in under a second.','⚡');
    if(type==='sound'&&S.sounds===1)unlock('sound','Soundcheck','First soundboard clip in voice.','♫');
    if(type==='music'&&d.title)unlock('dj','Resident DJ','First song from the Music DJ.','♪');
    if(type==='state'&&d.before==='error'&&['ready','listening'].includes(d.state))unlock('back','Back Online','Recovered after a problem.','↺');
    if(type==='turn'&&S.streak===15)unlock('streak','Unstoppable','15 replies in a row without a problem.','★');
   },unmount(){}};
  }},
 ]);

 // ── Classic Steam: the server browser and a VGUI progress dialog ──────────
 F.define('classic',[
  {id:'cl-servers',mount(c){
   const box=c.add('deck',c.h('div','fx cl-servers'));box.setAttribute('role','listbox');box.setAttribute('aria-label','Tyler services. Enter opens the matching tab.');
   const head=c.h('div','cl-head');head.append(c.h('span',null,'Service'),c.h('span',null,'Status'),c.h('span',null,'Ping'));box.append(head);
   const rows=new Map();let selected='ai';
   for(const s of c.systems()){const row=c.h('div','cl-row');row.setAttribute('role','option');row.tabIndex=s.id==='ai'?0:-1;const lamp=c.h('i','cl-lamp');const name=c.h('span','cl-name',s.name),status=c.h('span','cl-status'),ping=c.h('span','cl-ping');name.prepend(lamp);row.append(name,status,ping);box.append(row);rows.set(s.id,{row,status,ping,tab:s.tab});
    row.onclick=()=>select(s.id);row.ondblclick=()=>c.actions.tab(s.tab);}
   function select(id){selected=id;for(const [k,r] of rows){r.row.setAttribute('aria-selected',String(k===id));r.row.tabIndex=k===id?0:-1;}}
   box.addEventListener('keydown',e=>{const ids=[...rows.keys()];let i=ids.indexOf(selected);if(e.key==='ArrowDown')i=Math.min(ids.length-1,i+1);else if(e.key==='ArrowUp')i=Math.max(0,i-1);else if(e.key==='Enter'){c.actions.tab(rows.get(selected).tab);return;}else return;e.preventDefault();select(ids[i]);rows.get(ids[i]).row.focus();});
   function render(){
    const sys=c.systems(),v=c.voice();
    for(const s of sys){const r=rows.get(s.id);r.row.dataset.level=s.level;r.status.textContent=s.detail;
     r.ping.textContent=s.id==='ai'?(c.S.turns.length?Math.round(c.avgTurn()):'—'):s.id==='voice'?(v.armed?String(v.peers):'—'):s.id==='chat'?(s.level===3?String(c.S.heard):'—'):(c.S.music?'♪':'—');}
   }
   select('ai');render();c.every(render);return {update:render};
  }},
  {id:'cl-progress',mount(c){
   let dialog=null,wait=0;
   function close(){if(wait)c.cancel(wait);wait=0;dialog?.remove();dialog=null;}
   function open(){
    close();const est=Math.max(800,c.avgTurn());
    dialog=c.h('div','fx cl-dialog');dialog.setAttribute('role','status');
    const title=c.h('div','cl-title','Steam - Preparing reply'),body=c.h('div','cl-body');
    const bar=c.h('div','cl-bar');for(let i=0;i<18;i++)bar.append(c.h('i'));
    body.append(c.h('p',null,'Tyler is writing a reply…'),bar,c.h('small',null,'Estimated: about '+c.ms(est)+' (average of recent replies)'));
    dialog.style.setProperty('--fill',Math.round(est)+'ms');dialog.append(title,body);c.slots.layer.append(dialog);
   }
   return {update(type,d){if(type!=='state')return;if(d.state==='thinking'){if(!wait&&!dialog)wait=c.later(()=>{wait=0;if(c.S.state==='thinking')open();},700);}else close();},unmount:close};
  }},
 ]);

 // ── Team Fortress 2: class-select navigation, a killfeed and a taunt ──────
 const ROLES={conversation:['Chat','The talker. Keeps the banter going.'],room:['Room','The engineer. Builds the party.'],soundboard:['Sounds','The soldier. Loudest one here.'],setup:['Setup','The medic. Keeps Tyler alive.'],checks:['Checks','The sniper. Finds the problem.']};
 F.define('tf2',[
  {id:'tf-class',mount(c){
   let caption=null;
   c.key(e=>{const n=Number(e.key);if(n>=1&&n<=5&&!e.repeat){e.preventDefault();c.actions.tab(c.TABS[n-1]);}});
   return {update(type,d){if(type!=='tab')return;caption?.remove();const [name,role]=ROLES[d.tab]||[];if(!name)return;
    caption=c.h('div','fx tf-class');caption.append(c.h('small',null,'Class '+(c.TABS.indexOf(d.tab)+1)),c.h('b',null,name),c.h('span',null,role));c.flash(caption,1500);}};
  }},
  {id:'tf-killfeed',mount(c){
   const feed=c.add('layer',c.h('div','fx tf-feed'));feed.setAttribute('role','log');feed.setAttribute('aria-label','Activity');
   const place=()=>{feed.style.top=(c.below('.tabs')+6)+'px';};place();c.later(place,400);
   function push(icon,verb,target,bad=false){place();const row=c.h('div','tf-kill'+(bad?' bad':''));row.append(c.h('b','tf-name','TYLER'),c.h('span','tf-icon',icon),c.h('span','tf-target',target||verb));feed.prepend(row);while(feed.children.length>4)feed.lastElementChild.remove();c.later(()=>row.classList.add('gone'),5600);c.later(()=>row.remove(),6000);}
   return {update(type,d){
    if(type==='reply')push('✎','replied','chat · '+d.chars+' chars');
    if(type==='state'&&d.state==='speaking'&&d.before!=='speaking')push('🔊','spoke','voice call');
    if(type==='sound')push('📣','played',d.name);
    if(type==='music'&&d.title)push('♪','queued',d.title.slice(0,32));
    if(type==='state'&&d.state==='error'&&d.before!=='error')push('☠','error','Needs attention',true);
   }};
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
   function render(){ctScore.textContent=String(c.S.replies+c.S.spoken);tScore.textContent=String(c.S.heard);time.textContent=c.clock(Date.now()-c.S.started);round.textContent='ROUND '+(c.S.turns.length+1);
    const v=c.voice(),n=Math.min(5,v.peers);alive.replaceChildren(...Array.from({length:5},(_,i)=>{const d=c.h('i');if(i<n)d.className='on';return d;}));box.dataset.state=c.S.state;}
   render();c.every(render);return {update:render};
  }},
  {id:'cs-wheel',mount(c){
   const chip=c.add('bar',c.h('button','fx fx-chip cs-buy','B'));chip.type='button';chip.title='Sound wheel (B)';chip.setAttribute('aria-label','Open the sound wheel');
   let wheel=null;
   function close(){wheel?.remove();wheel=null;chip.setAttribute('aria-expanded','false');}
   function open(){
    if(wheel)return close();const {slots,favorites}=c.actions.sounds();
    const pick=[...favorites.map(n=>slots.find(s=>s.slot===n)).filter(Boolean),...slots.filter(s=>!favorites.includes(s.slot))].slice(0,8);
    wheel=c.h('div','fx cs-wheel fx-interactive');wheel.setAttribute('role','menu');wheel.setAttribute('aria-label','Sound wheel');
    const center=c.h('div','cs-wheel-center','Pick a sound');wheel.append(center);
    if(!pick.length)center.textContent='Open Sounds once to load the board';
    pick.forEach((s,i)=>{const a=i/pick.length*Math.PI*2-Math.PI/2,b=c.h('button','cs-slice');b.type='button';b.setAttribute('role','menuitem');
     b.style.left=(50+Math.cos(a)*38)+'%';b.style.top=(50+Math.sin(a)*38)+'%';b.append(c.h('small',null,String(i+1)),c.h('span',null,s.name));
     b.onmouseenter=b.onfocus=()=>center.textContent=s.name;b.onclick=()=>{c.actions.playSound(s.slot);close();};wheel.append(b);});
    const x=c.h('button','cs-wheel-close','✕');x.type='button';x.setAttribute('aria-label','Close');x.onclick=close;wheel.append(x);
    c.slots.layer.append(wheel);chip.setAttribute('aria-expanded','true');wheel.querySelector('button')?.focus();
   }
   chip.onclick=open;
   c.key(e=>{if(e.key==='b'||e.key==='B'){if(!e.repeat){e.preventDefault();open();}}else if(wheel&&e.key==='Escape'){e.preventDefault();close();}else if(wheel&&/^[1-8]$/.test(e.key)){e.preventDefault();wheel.querySelectorAll('.cs-slice')[Number(e.key)-1]?.click();}});
   return {unmount:close};
  }},
  {id:'cs-banner',mount(c){
   let last=0;
   function show(kind,title,sub){if(Date.now()-last<2500)return;last=Date.now();const el=c.h('div','fx cs-banner '+kind);el.append(c.h('b',null,title),c.h('span',null,sub));c.flash(el,1900);}
   return {update(type,d){if(type==='turn')show('win','Round won',(d.ms<1500?'MVP · ':'')+'Tyler answered in '+c.ms(d.ms));if(type==='state'&&d.state==='error'&&d.before!=='error')show('loss','Round lost','Tyler needs attention');}};
  }},
 ]);

 // ── Portal: the chamber sign and portal transitions between tabs ──────────
 const PO_ICONS={ai:'<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="7"/><path d="M12 5v14M5 12h14"/></svg>',chat:'<svg viewBox="0 0 24 24"><path d="M4 6h16v9H10l-5 4v-4H4z"/></svg>',voice:'<svg viewBox="0 0 24 24"><rect x="9" y="3" width="6" height="11" rx="3"/><path d="M6 11a6 6 0 0 0 12 0M12 17v4"/></svg>',
  people:'<svg viewBox="0 0 24 24"><circle cx="8" cy="8" r="3"/><circle cx="16" cy="8" r="3"/><path d="M3 20c0-4 2.5-6 5-6s5 2 5 6M11 20c0-4 2.5-6 5-6s5 2 5 6"/></svg>',music:'<svg viewBox="0 0 24 24"><path d="M9 18V5l11-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="17" cy="16" r="3"/></svg>',sound:'<svg viewBox="0 0 24 24"><path d="M4 9h4l5-4v14l-5-4H4z"/><path d="M16 9a4 4 0 0 1 0 6M19 6a8 8 0 0 1 0 12"/></svg>'};
 F.define('portal',[
  {id:'po-sign',mount(c){
   const box=c.add('deck',c.h('div','fx po-sign'));
   const num=c.h('b','po-num'),of=c.h('span','po-of'),bar=c.h('span','po-progress'),icons=c.h('span','po-icons');
   const left=c.h('div','po-left');left.append(num,of);const right=c.h('div','po-right');right.append(c.h('small',null,'Tests passed · subject health'),bar,icons);box.append(left,right);
   for(let i=0;i<10;i++)bar.append(c.h('i'));
   const lit=new Map();for(const [k,label] of [['ai','AI key saved'],['chat','Chat linked'],['voice','Voice armed'],['people','People in the call'],['music','Music playing'],['sound','Soundboard used']]){const i=c.svg(PO_ICONS[k],'po-icon');const w=c.h('span','po-tile');w.title=label;w.setAttribute('aria-label',label);w.append(i);icons.append(w);lit.set(k,w);}
   function render(){const S=c.S,v=c.voice(),sys=c.systems();const passed=S.replies+S.spoken;num.textContent=c.pad(passed);of.textContent=S.errors?'/'+c.pad(passed+S.errors):'';left.title=passed+' replies'+(S.errors?', '+S.errors+' problems':'');
    const h=c.health();[...bar.children].forEach((x,i)=>x.classList.toggle('on',i<Math.round(h/10)));
    const on={ai:S.keyOk===true,chat:sys[1].level===3,voice:v.armed,people:v.peers>0,music:!!S.music,sound:S.sounds>0};
    for(const [k,w] of lit){w.classList.toggle('on',!!on[k]);w.setAttribute('aria-label',w.title+(on[k]?': yes':': no'));}box.dataset.state=S.state;}
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
   let board=null;
   function close(){board?.remove();board=null;chip.setAttribute('aria-pressed','false');}
   function open(){
    if(board)return close();const S=c.S,v=c.voice();
    board=c.h('div','fx c16-board fx-interactive');board.setAttribute('role','dialog');board.setAttribute('aria-label','Scoreboard');
    const title=c.h('div','c16-title');title.append(c.h('b',null,'ROBOTIC TYLER'),c.h('span',null,'Session '+c.clock(Date.now()-S.started)));
    const table=c.h('table');const head=table.insertRow();for(const t of ['Name','Score','Deaths','Latency'])head.append(c.h('th',null,t));
    const add=(name,score,deaths,lat,cls)=>{const r=table.insertRow();if(cls)r.className=cls;for(const t of [name,score,deaths,lat])r.insertCell().textContent=String(t);};
    add('ROBOTIC TYLER',S.replies+S.spoken,S.errors,S.turns.length?Math.round(c.avgTurn()):'—','me');
    add('Chat reader',S.heard,0,'—');add('Voice bridge',v.armed?v.peers+' in call':'off',0,'—');add('Soundboard',S.sounds,0,'—');add('Music DJ',S.music?'playing':'idle',0,'—');
    const x=c.h('button','c16-close','Close');x.type='button';x.onclick=close;board.append(title,table,x);c.slots.layer.append(board);chip.setAttribute('aria-pressed','true');x.focus();
   }
   chip.onclick=open;c.key(e=>{if(board&&e.key==='Escape'){e.preventDefault();close();}});return {unmount:close};
  }},
  {id:'c16-radio',mount(c){
   const chip=c.add('bar',c.h('button','fx fx-chip c16-chip','Radio'));chip.type='button';chip.title='Radio commands (V)';
   const items=[['Pause AI',c.actions.pause,'Hold this position.'],['Stop audio',c.actions.stopAudio,'Fire in the hole!'],['Test beep',c.actions.beep,'Check, check.'],['Run checks',()=>c.actions.tab('checks'),'Need backup.'],['Collapse panel',c.actions.collapse,'Sector clear.']];
   let menu=null;
   function close(){menu?.remove();menu=null;}
   function choose(i){const it=items[i];close();if(!it)return;it[1]();const msg=c.h('div','fx c16-roger');msg.append(c.h('b',null,'ROBOTIC TYLER (RADIO): '),it[2]);c.flash(msg,2200);}
   function open(){if(menu)return close();menu=c.h('div','fx c16-menu fx-interactive');menu.setAttribute('role','menu');menu.append(c.h('b',null,'Radio commands'));
    items.forEach((it,i)=>{const b=c.h('button','c16-item');b.type='button';b.setAttribute('role','menuitem');b.append(c.h('span',null,(i+1)+'.'),' '+it[0]);b.onclick=()=>choose(i);menu.append(b);});
    const x=c.h('button','c16-item');x.type='button';x.append(c.h('span',null,'0.'),' Exit');x.onclick=close;menu.append(x);c.slots.layer.append(menu);menu.querySelector('button').focus();}
   chip.onclick=open;
   c.key(e=>{if((e.key==='v'||e.key==='V')&&!e.repeat){e.preventDefault();open();}else if(menu&&/^[0-5]$/.test(e.key)){e.preventDefault();e.key==='0'?close():choose(Number(e.key)-1);}else if(menu&&e.key==='Escape'){e.preventDefault();close();}});
   return {unmount:close};
  }},
 ]);

 // ── HEV suit: suit voice captions, damage indicators and a flashlight ─────
 const HEV={ready:'Communications link established',listening:'Voice signal detected',thinking:'Processing. Please wait',speaking:'Broadcasting on voice channel',waiting:'Automatic recovery engaged',error:'Warning: system fault detected',paused:'Automatic systems offline',standby:'Standby. Secondary unit active'};
 F.define('hev',[
  {id:'hev-voice',mount(c){
   let line=null;
   function say(text){line?.remove();line=c.h('div','fx hev-say');line.setAttribute('role','status');line.textContent=text.toUpperCase();c.flash(line,3600);}
   c.later(()=>say('HEV Mark V: power level '+c.health()+'%'),400);
   return {update(type,d){if(type==='state'&&d.state!==d.before&&HEV[d.state])say(HEV[d.state]);if(type==='music'&&d.title)say('Audio playback: '+d.title.slice(0,40));}};
  }},
  {id:'hev-damage',mount(c){
   return {update(type,d){if(type!=='state'||d.state!=='error'||d.before==='error')return;const el=c.h('div','fx hev-hit');for(const s of ['t','r','b','l'])el.append(c.h('i',s));c.flash(el,1400);}};
  }},
  {id:'hev-light',mount(c){
   const b=c.add('bar',c.h('button','fx fx-chip hev-lamp'));b.type='button';b.setAttribute('aria-pressed','false');b.title='Flashlight: brighter, higher-contrast panel (F)';b.setAttribute('aria-label','Flashlight');
   b.append(c.svg('<svg viewBox="0 0 24 24"><path d="M3 9h7l3-3h4v12h-4l-3-3H3z"/><path d="M19 8l3-2M19 16l3 2M19 12h3"/></svg>'));
   const toggle=()=>{const on=!c.panel.hasAttribute('data-hev-light');c.panel.toggleAttribute('data-hev-light',on);b.setAttribute('aria-pressed',String(on));};
   b.onclick=toggle;c.key(e=>{if((e.key==='f'||e.key==='F')&&!e.repeat){e.preventDefault();toggle();}});
   return {unmount(){c.panel.removeAttribute('data-hev-light');}};
  }},
 ]);
})();

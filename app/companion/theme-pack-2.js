// Theme features, pack 2 (v2.20): Left 4 Dead, Windows XP, DOOM, Quake, Pip-Boy, Combine and Deadlock.
(() => {
 'use strict';
 const F=globalThis.TylerThemeFeatures;if(!F)return;

 // ── Left 4 Dead: the survivor team and the Director's horde warning ───────
 F.define('l4d',[
  {id:'l4d-team',mount(c){
   const box=c.add('deck',c.h('div','fx l4d-team'));box.setAttribute('aria-label','Tyler\'s team: each part\'s health');
   const cards=new Map();
   for(const s of c.systems()){const b=c.h('button','l4d-mate');b.type='button';const name=c.h('b',null,s.name),bar=c.h('span','l4d-bar'),fill=c.h('i'),note=c.h('small');bar.append(fill);b.append(name,bar,note);b.onclick=()=>c.actions.tab(s.tab);box.append(b);cards.set(s.id,{b,fill,note});}
   function render(){for(const s of c.systems()){const k=cards.get(s.id);const hp=s.level===3?100:s.level===2?55:s.level===1?22:0;
    k.b.dataset.hp=hp>=70?'good':hp>=40?'hurt':hp>0?'critical':'down';k.fill.style.width=hp+'%';k.note.textContent=s.level===0?'Down':s.detail;k.b.title=s.name+': '+s.detail+'. Opens '+c.TAB_NAMES[s.tab]+'.';}
    box.dataset.incap=String(c.S.state==='error');}
   render();c.every(render);return {update:render};
  }},
  {id:'l4d-director',mount(c){
   let last=0,haze=null;
   function horde(){if(Date.now()-last<20000)return;last=Date.now();const el=c.h('div','fx l4d-horde');el.setAttribute('role','status');el.append(c.h('b',null,'Here they come!'),c.h('span',null,c.S.chatBurst+' messages in 30 seconds. Tyler slows down so he doesn\'t flood the chat.'));c.flash(el,3200);
    haze?.remove();haze=c.flash(c.h('div','fx l4d-haze'),3200);}
   // v2.22: the safe room: a full check with no problems is a checkpoint; a problem incapacitates
   // Tyler, and coming back is a rescue.
   function banner(cls,title,sub){const el=c.h('div','fx l4d-safe '+cls);el.setAttribute('role','status');el.append(c.h('b',null,title),c.h('span',null,sub));c.flash(el,2800);}
   return {update(type,d){if(type==='chat'&&(d.flood||d.recent>=9))horde();
    if(type==='check')banner(d.problems?'down':'ok',d.problems?'Survivor incapacitated':'Safe room reached',d.problems?d.problems+' problem'+(d.problems===1?'':'s')+' found. Each “!” line says how to help Tyler up.':'Every check passed. Close the door and catch your breath.');
    if(type==='state'&&d.before==='error'&&['ready','listening'].includes(d.state))banner('ok','Tyler is back up','Revived. Keep moving.');}};
  }},
 ]);

 // ── Windows XP: a taskbar with Start menu and tray, and error dialogs ─────
 F.define('winxp',[
  {id:'xp-taskbar',mount(c){
   const foot=c.root.querySelector('.foot');
   const start=c.h('button','fx xp-start','start');start.type='button';start.setAttribute('aria-haspopup','menu');start.setAttribute('aria-expanded','false');
   const tray=c.h('span','fx xp-tray'),clock=c.h('time','xp-clock');
   const icons={owner:c.h('span','xp-ti owner'),voice:c.h('span','xp-ti voice'),net:c.h('span','xp-ti net'),music:c.h('span','xp-ti music')};
   for(const i of Object.values(icons))tray.append(i);tray.append(clock);foot.prepend(start);foot.append(tray);
   let menu=null;
   function close(){menu?.remove();menu=null;start.setAttribute('aria-expanded','false');}
   function open(){if(menu)return close();menu=c.h('div','fx xp-menu fx-interactive');menu.setAttribute('role','menu');
    const head=c.h('div','xp-menu-head');head.append(c.h('span','xp-menu-pic'),c.h('b',null,'ROBOTIC TYLER'));menu.append(head);
    // v2.22: the real Start menu's two columns: Tyler's tabs on the white side, his tools on the blue
    // side, and Log Off (Pause AI) / Turn Off (collapse) along the bottom. Arrow keys move around.
    const cols=c.h('div','xp-menu-cols'),list=c.h('div','xp-menu-list'),places=c.h('div','xp-menu-places');
    const item=(parent,cls,label,sub,run)=>{const b=c.h('button',cls);b.type='button';b.setAttribute('role','menuitem');b.append(c.h('b',null,label));if(sub)b.append(c.h('small',null,sub));b.onclick=()=>{close();run();};parent.append(b);return b;};
    const SUB={conversation:'Replies and participation',room:'Music, squad and extras',soundboard:'Play clips in voice',setup:'Connect Tyler to this chat',checks:'Find and fix problems'};
    for(const t of c.TABS)item(list,'xp-mi',c.TAB_NAMES[t],SUB[t],()=>c.actions.tab(t));
    list.append(c.h('i','xp-menu-sep'));item(list,'xp-mi xp-all','All Programs','',()=>c.actions.settings());
    item(places,'xp-pl',"Tyler's Settings",'',c.actions.settings);item(places,'xp-pl','Run full check','',c.actions.fullCheck);item(places,'xp-pl','Stop audio','',c.actions.stopAudio);places.append(c.h('i','xp-menu-sep'));item(places,'xp-pl','Help and Support','',()=>c.actions.tab('checks'));
    cols.append(list,places);
    const off=c.h('div','xp-menu-foot'),logoff=c.h('button','xp-off xp-logoff','Log Off'),hide=c.h('button','xp-off','Turn Off');logoff.type=hide.type='button';logoff.title='Pause AI';hide.title='Collapse the panel';
    logoff.onclick=()=>{close();c.actions.pause();};hide.onclick=()=>{close();c.actions.collapse();};off.append(logoff,hide);
    menu.append(cols,off);menu.style.bottom=(c.panel.getBoundingClientRect().bottom-foot.getBoundingClientRect().top)+'px';c.slots.layer.append(menu);start.setAttribute('aria-expanded','true');list.querySelector('button').focus();
    menu.addEventListener('keydown',e=>{const all=[...menu.querySelectorAll('button')],i=all.indexOf(c.root.activeElement);if(e.key==='ArrowDown'){e.preventDefault();all[(i+1)%all.length].focus();}else if(e.key==='ArrowUp'){e.preventDefault();all[(i-1+all.length)%all.length].focus();}else if(e.key==='ArrowRight'&&list.contains(c.root.activeElement)){e.preventDefault();places.querySelector('button').focus();}else if(e.key==='ArrowLeft'&&places.contains(c.root.activeElement)){e.preventDefault();list.querySelector('button').focus();}});}
   start.onclick=open;c.key(e=>{if(menu&&e.key==='Escape'){e.preventDefault();close();}});
   // v2.22: balloon tips from the tray when something real happens: the call, the music, a problem fixed.
   let balloon=null,was={peers:0,music:''};
   function tip(icon,title,text){balloon?.remove();balloon=c.h('div','fx xp-balloon fx-interactive');balloon.setAttribute('role','status');const x=c.h('button','xp-bx','✕');x.type='button';x.setAttribute('aria-label','Close');x.onclick=()=>balloon?.remove();
    const head=c.h('div','xp-bhead');head.append(c.h('span','xp-bicon '+icon),c.h('b',null,title),x);balloon.append(head,c.h('p',null,text));balloon.style.bottom=(c.panel.getBoundingClientRect().bottom-foot.getBoundingClientRect().top+6)+'px';c.flash(balloon,6000);}
   const balloons=(type,d)=>{const v=c.voice();
    if(v.peers>0&&!was.peers)tip('voice','Joined the voice call',v.peers+' '+(v.peers===1?'person':'people')+' in the call can hear Tyler now.');was.peers=v.peers;
    if(type==='music'&&d?.title&&d.title!==was.music)tip('music','Now playing',d.title.slice(0,80));if(type==='music')was.music=d?.title||'';
    if(type==='state'&&d?.before==='error'&&['ready','listening'].includes(d?.state))tip('ok','Problem solved','Tyler is working again.');};
   function render(){const v=c.voice(),sys=c.systems();
    icons.owner.dataset.on=String(c.panel.dataset.owner==='true');icons.owner.title=c.root.getElementById('footerState')?.textContent||'';icons.owner.setAttribute('aria-label',icons.owner.title);icons.owner.setAttribute('role','img');
    icons.voice.dataset.on=String(v.armed);icons.voice.title=v.armed?'Voice: '+(v.peers?v.peers+' people in the call':'armed, call empty'):'Voice: off';
    const net=sys[0].level===3&&sys[1].level===3;icons.net.dataset.on=String(net);icons.net.title='Connection: AI '+sys[0].detail+' · chat '+sys[1].detail;
    icons.music.dataset.on=String(!!c.S.music);icons.music.title=c.S.music?'Now playing: '+c.S.music:'Music DJ idle';
    clock.textContent=new Date().toLocaleTimeString([],{hour:'numeric',minute:'2-digit'});}
   render();c.every(render);return {update(type,d){render();balloons(type,d);},unmount(){close();start.remove();tray.remove();balloon?.remove();}};
  }},
  {id:'xp-error',mount(c){
   let box=null;
   function close(){box?.remove();box=null;}
   return {update(type,d){if(type!=='state'||d.state!=='error'||d.before==='error')return;close();
    box=c.h('div','fx xp-dialog fx-interactive');box.setAttribute('role','alertdialog');box.setAttribute('aria-label','ROBOTIC TYLER problem');
    const title=c.h('div','xp-dtitle','ROBOTIC TYLER'),x=c.h('button','xp-x','✕');x.type='button';x.setAttribute('aria-label','Close');x.onclick=close;title.append(x);
    const body=c.h('div','xp-dbody');body.append(c.h('span','xp-stop'),c.h('p',null,(d.text||'Tyler ran into a problem.').slice(0,180)));
    const row=c.h('div','xp-dbtns'),checks=c.h('button',null,'Run checks'),ok=c.h('button',null,'OK');checks.type=ok.type='button';checks.onclick=()=>{close();c.actions.tab('checks');};ok.onclick=close;row.append(checks,ok);
    box.append(title,body,row);c.slots.layer.append(box);ok.focus();c.later(close,12000);},unmount:close};
  }},
 ]);

 // ── DOOM: the status face, the screen melt and pickup messages ────────────
 F.define('doom',[
  {id:'doom-face',mount(c){
   const box=c.add('deck',c.h('div','fx doom-bar'));
   const ammo=c.h('div','doom-cell'),face=c.h('div','doom-face'),hp=c.h('div','doom-cell');
   const ammoN=c.h('b'),hpN=c.h('b');ammo.append(ammoN,c.h('small',null,'Replies'));hp.append(hpN,c.h('small',null,'Health'));
   const art=c.root.querySelector('.mark-art');const img=c.h('canvas');img.width=64;img.height=64;face.append(img);
   const draw=()=>{try{const g=img.getContext('2d');g.imageSmoothingEnabled=false;g.clearRect(0,0,64,64);g.drawImage(art,0,0,art.width,art.height,4,4,56,56);}catch{}};
   // v2.22: the key cards, like the status bar's: blue = AI key saved, yellow = chat linked, red = voice armed.
   const keys=c.h('div','doom-keys');const cards={blue:c.h('i','doom-key blue'),yellow:c.h('i','doom-key yellow'),red:c.h('i','doom-key red')};for(const k of Object.values(cards))keys.append(k);
   box.append(ammo,face,hp,keys);face.title='Tyler\'s status';
   function render(){ammoN.textContent=String(c.S.replies+c.S.spoken);const h=c.health();hpN.textContent=h+'%';face.dataset.mood=c.S.state==='error'?'hurt':c.S.state==='speaking'?'grin':c.S.state==='thinking'?'squint':h<50?'hurt':'idle';box.dataset.low=String(h<40);
    const sys=c.systems(),v=c.voice(),have={blue:c.S.keyOk===true,yellow:sys[1].level===3,red:v.armed};for(const [k,el] of Object.entries(cards)){el.dataset.have=String(!!have[k]);el.title=({blue:'Blue key: AI key',yellow:'Yellow key: chat linked',red:'Red key: voice armed'})[k]+(have[k]?'':' (missing)');}}
   draw();c.later(draw,800);c.later(draw,2500);render();c.every(render);return {update(type){if(type==='theme')c.later(draw,500);render();}};
  }},
  {id:'doom-melt',mount(c){
   const scroll=c.root.querySelector('.scroll');let prev=c.S.tab;
   return {update(type,d){if(type!=='tab'||d.tab===prev||c.reduced)return;prev=d.tab;
    const r=scroll.getBoundingClientRect(),p=c.panel.getBoundingClientRect(),melt=c.h('div','fx doom-melt');
    melt.style.cssText='left:'+(r.left-p.left)+'px;top:'+(r.top-p.top)+'px;width:'+r.width+'px;height:'+r.height+'px';
    for(let i=0;i<16;i++){const col=c.h('i');col.style.animationDelay=Math.round(Math.random()*160)+'ms';melt.append(col);}c.flash(melt,700);}};
  }},
  {id:'doom-pickup',mount(c){
   let line=null;
   const say=t=>{line?.remove();line=c.h('div','fx doom-msg',t);line.style.top=(c.below('.tabs')+6)+'px';c.flash(line,2600);};
   return {update(type,d){if(type==='reply')say('Picked up a chat reply.');if(type==='sound')say('You got the '+d.name+'!');if(type==='music'&&d.title)say('Picked up a song: '+d.title.slice(0,36)+'.');
    if(type==='turn'&&d.ms<1000)say('Berserk! Reply in '+c.ms(d.ms)+'.');if(type==='state'&&d.state==='error'&&d.before!=='error')say('This door is locked. Run checks to find the key.');}};
  }},
 ]);

 // ── Quake: the drop-down console and arena medals ─────────────────────────
 F.define('quake',[
  {id:'qk-console',mount(c){
   const chip=c.add('bar',c.h('button','fx fx-chip qk-chip','~'));chip.type='button';chip.title='Console (~)';chip.setAttribute('aria-label','Open the console');
   let con=null,out=null;
   const line=(t,cls)=>{if(!out)return;const p=c.h('div',cls||null,t);out.append(p);while(out.children.length>60)out.firstElementChild.remove();out.scrollTop=out.scrollHeight;};
   const help='Commands: status · tab <chat|room|sounds|setup|checks> · connect · check · pause · stopaudio · beep · play <sound> · sounds · music · log · history · clear · quit';
   // v2.22: command history (Up / Down, kept for the session), Tab completes, and a hint line suggests.
   const CMDS=['status','tab','connect','check','pause','stopaudio','beep','play','sounds','music','log','history','clear','quit','help'],history=[];let hi=0;
   const tabOf={chat:'conversation',room:'room',sounds:'soundboard',setup:'setup',checks:'checks'};
   function run(cmd){const [w,arg]=cmd.trim().toLowerCase().split(/\s+/);line(']'+cmd);
    if(!w)return;if(w==='help'||w==='?')return line(help);if(w==='clear'){out.replaceChildren();return;}if(w==='quit'||w==='exit')return close();
    if(w==='status'){const S=c.S,v=c.voice();line('state: '+S.label+' · health '+c.health()+'% · uptime '+c.clock(Date.now()-S.started));line('replies '+(S.replies+S.spoken)+' · heard '+S.heard+' · errors '+S.errors+' · avg reply '+c.ms(c.avgTurn()));line('model: '+(S.model||'unknown')+' · voice '+(v.armed?v.peers+' in call':'off')+(S.music?' · music '+S.music:''));return;}
    if(w==='tab'&&tabOf[arg]){c.actions.tab(tabOf[arg]);return line('switched to '+arg);}
    if(w==='pause'){c.actions.pause();return line('AI paused');}if(w==='stopaudio'){c.actions.stopAudio();return line('audio stopped');}if(w==='beep'){c.actions.beep();return line('beep sent to voice');}
    if(w==='log'){for(const e of c.S.log.slice(-15))line(new Date(e.at).toLocaleTimeString()+'  '+e.text,e.kind==='error'?'qk-err':null);return;}
    if(w==='connect'){c.actions.connect();return line('connecting: Connect & start');}
    if(w==='check'){c.actions.fullCheck();return line('running the full check (Checks tab)');}
    if(w==='history'){history.forEach((h,i)=>line('  '+(i+1)+'  '+h));return;}
    if(w==='sounds'){const {slots}=c.actions.sounds();return line(slots.length?slots.map(s=>s.name.toLowerCase().replace(/\s+/g,'_')).join('  '):'no sounds loaded: open the Sounds tab once');}
    if(w==='play'){const {slots}=c.actions.sounds(),want=cmd.trim().split(/\s+/).slice(1).join(' ').toLowerCase().replace(/_/g,' ');const s=slots.find(x=>x.name.toLowerCase()===want)||slots.find(x=>x.name.toLowerCase().startsWith(want));if(!want||!s)return line('play: no sound "'+want+'". Type sounds.','qk-err');c.actions.playSound(s.slot);return line('playing '+s.name);}
    if(w==='music'){return line(c.S.music?'now playing: '+c.S.music:'music: idle (Room → Music DJ)');}
    line('Unknown command "'+w+'". Type help.','qk-err');}
   function close(){con?.remove();con=null;out=null;chip.setAttribute('aria-expanded','false');}
   function open(){if(con)return close();con=c.h('div','fx qk-console fx-interactive');con.setAttribute('role','dialog');con.setAttribute('aria-label','Console');
    out=c.h('div','qk-out');out.setAttribute('role','log');const form=c.h('form','qk-in'),input=c.h('input');input.setAttribute('aria-label','Console command');input.spellcheck=false;input.autocomplete='off';form.append(c.h('span',null,']'),input);
    const hint=c.h('div','qk-hint');
    const suggest=()=>{const v=input.value.trimStart().toLowerCase();if(!v){hint.textContent='';return;}const [w,...rest]=v.split(/\s+/);if(!rest.length){const m=CMDS.filter(k=>k.startsWith(w));hint.textContent=m.length?m.join('  '):'';return;}
     if(w==='tab')hint.textContent=Object.keys(tabOf).filter(k=>k.startsWith(rest[0]||'')).join('  ');else if(w==='play'){const {slots}=c.actions.sounds();hint.textContent=slots.map(s=>s.name.toLowerCase().replace(/\s+/g,'_')).filter(n=>n.startsWith(rest.join('_'))).slice(0,8).join('  ');}else hint.textContent='';};
    form.onsubmit=e=>{e.preventDefault();const v=input.value;if(v.trim()){history.push(v);if(history.length>30)history.shift();}hi=history.length;run(v);input.value='';suggest();};
    input.oninput=suggest;
    input.onkeydown=e=>{if(e.key==='Escape'||e.key==='`'){e.preventDefault();close();}
     else if(e.key==='ArrowUp'&&history.length){e.preventDefault();hi=Math.max(0,hi-1);input.value=history[hi];suggest();}
     else if(e.key==='ArrowDown'&&history.length){e.preventDefault();hi=Math.min(history.length,hi+1);input.value=history[hi]||'';suggest();}
     else if(e.key==='Tab'){e.preventDefault();const first=hint.textContent.split(/\s+/)[0];if(!first)return;const parts=input.value.trimStart().split(/\s+/);parts[parts.length-1]=first;input.value=parts.join(' ')+' ';suggest();}};
    con.append(out,form,hint);c.slots.layer.append(con);chip.setAttribute('aria-expanded','true');
    line('ROBOTIC TYLER console. '+help);for(const e of c.S.log.slice(-8))line(new Date(e.at).toLocaleTimeString()+'  '+e.text,e.kind==='error'?'qk-err':null);input.focus();}
   chip.onclick=open;c.key(e=>{if((e.key==='`'||e.key==='~')&&!e.repeat){e.preventDefault();open();}});
   return {update(type,d){if(!out)return;if(type==='state'&&d.state!==d.before)line(d.label+(d.text?': '+d.text:''),d.state==='error'?'qk-err':null);if(type==='reply')line('reply sent ('+d.chars+' chars)');if(type==='sound')line('sound: '+d.name);},unmount:close};
  }},
  {id:'qk-medals',mount(c){
   const counts={};let lastTurn=0;
   function award(key,name){counts[key]=c.best('quake:'+key,(Number(c.life?.best?.['quake:'+key])||counts[key]||0)+1);const el=c.h('div','fx qk-medal '+key);el.append(c.h('span','qk-medal-icon'),c.h('b',null,name),c.h('small',null,'×'+counts[key]));el.setAttribute('role','status');c.flash(el,1700);}
   return {update(type,d){if(type!=='turn')return;const t=Date.now();
    if(d.ms<1200)award('impressive','Impressive');else if(lastTurn&&t-lastTurn<10000)award('excellent','Excellent');
    if(c.S.streak&&c.S.streak%5===0)award('perfect','Perfect');lastTurn=t;}};
  }},
 ]);

 // ── Pip-Boy: category navigation, analog gauges and the radio ─────────────
 const PIP={conversation:'DATA',room:'MAP',soundboard:'INV',setup:'STAT',checks:'RADIO'};
 F.define('pipboy',[
  {id:'pb-nav',mount(c){
   const tabs=[...c.root.querySelectorAll('.tabs [data-tab]')];
   for(const b of tabs){const l=b.querySelector('.tab-label');if(l){l.dataset.pipOriginal=l.textContent;l.textContent=PIP[b.dataset.tab];}b.title=c.TAB_NAMES[b.dataset.tab]+' (Q / E to switch)';}
   c.key(e=>{if((e.key==='q'||e.key==='e'||e.key==='Q'||e.key==='E')&&!e.repeat){e.preventDefault();const i=c.TABS.indexOf(c.S.tab),n=(i+(e.key.toLowerCase()==='e'?1:c.TABS.length-1))%c.TABS.length;c.actions.tab(c.TABS[n]);}});
   const scroll=c.root.querySelector('.scroll');
   return {update(type){if(type==='tab'&&!c.reduced){scroll.classList.remove('pb-sweep');void scroll.offsetWidth;scroll.classList.add('pb-sweep');c.later(()=>scroll.classList.remove('pb-sweep'),450);}},
    unmount(){for(const b of tabs){const l=b.querySelector('.tab-label');if(l?.dataset.pipOriginal){l.textContent=l.dataset.pipOriginal;delete l.dataset.pipOriginal;}b.removeAttribute('title');}scroll.classList.remove('pb-sweep');}};
  }},
  {id:'pb-gauges',mount(c){
   const box=c.add('deck',c.h('div','fx pb-gauges'));
   const gauge=(label,title)=>{const g=c.h('div','pb-gauge');g.title=title;const dial=c.svg('<svg viewBox="0 0 100 60"><path class="pb-arc" d="M10 55 A40 40 0 0 1 90 55"/><path class="pb-ticks" d="M10 55 A40 40 0 0 1 90 55"/><line class="pb-needle" x1="50" y1="55" x2="50" y2="20"/><circle cx="50" cy="55" r="4"/></svg>');const v=c.h('b');g.append(dial,c.h('small',null,label),v);box.append(g);return {g,v,needle:dial.querySelector('.pb-needle')};};
   const resp=gauge('RESP','Last reply time (0 to 5 s)'),rad=gauge('RADS','Text spend this session (reported by provider)');
   const cnd=c.h('div','pb-cnd');cnd.title='Condition: Tyler\'s health';const fill=c.h('i'),track=c.h('span');track.append(fill);cnd.append(c.h('small',null,'CND'),track);box.append(cnd);
   // v2.22: CND opens the condition screen: each part of Tyler with its own bar, like the limbs.
   cnd.tabIndex=0;cnd.setAttribute('role','button');cnd.title='Condition: Tyler\'s health. Click for each part.';
   const status=()=>{const o=c.overlay('pb-status','Condition');o.el.append(c.h('b','pb-st-head','STAT · CONDITION'));
    for(const sys of c.systems()){const row=c.h('div','pb-st-row'),bar=c.h('span','pb-st-bar'),f=c.h('i');const hp=sys.level===3?100:sys.level===2?55:sys.level===1?22:0;f.style.width=hp+'%';bar.append(f);row.dataset.hp=String(hp);row.append(c.h('span',null,sys.name.toUpperCase()),bar,c.h('small',null,sys.detail));o.el.append(row);}
    const x=c.h('button','pb-st-close','[ BACK ]');x.type='button';x.onclick=o.close;o.el.append(x);x.focus({preventScroll:true});};
   cnd.onclick=status;cnd.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();status();}};
   const set=(g,frac,text)=>{g.needle.style.transform='rotate('+(-80+Math.max(0,Math.min(1,frac))*160)+'deg)';g.v.textContent=text;};
   function render(){const last=c.S.turns.at(-1);set(resp,last?last/5000:0,last?c.ms(last):'—');const spend=c.S.spend;set(rad,Math.min(1,spend/0.25),'$'+spend.toFixed(3));fill.style.width=c.health()+'%';}
   render();c.every(render);return {update:render};
  }},
  {id:'pb-radio',mount(c){
   const box=c.add('deck',c.h('div','fx pb-radio'));box.hidden=true;
   const wave=c.svg('<svg viewBox="0 0 120 24" preserveAspectRatio="none"><path d="M0 12 Q7.5 0 15 12 T30 12 T45 12 T60 12 T75 12 T90 12 T105 12 T120 12"/></svg>','pb-wave');
   const title=c.h('span','pb-song');box.append(c.h('b',null,'Tyler FM'),wave,title);
   // v2.22: the radio's own buttons: skip the song or switch the station off (the Music DJ's controls).
   const ctl=c.h('span','pb-ctl'),skip=c.h('button',null,'SKIP'),off=c.h('button',null,'OFF');skip.type=off.type='button';skip.title='Skip this song (Music DJ: Skip now)';off.title='Stop the music and the sharing';
   skip.onclick=()=>c.root.getElementById('musicSkip')?.click();off.onclick=()=>c.root.getElementById('musicEnd')?.click();ctl.append(skip,off);box.append(ctl);
   function render(){box.hidden=!c.S.music;title.textContent=c.S.music;box.parentElement?.toggleAttribute('data-filled',true);}
   render();return {update(type){if(type==='music')render();}};
  }},
 ]);

 // ── Combine: the Overwatch dispatch ticker and biosignal scans ────────────
 const DISPATCH={ready:'Overwatch acknowledges. Unit ROBOTIC TYLER on standby for dispatch',listening:'Biosignal audio detected. Unit monitoring',thinking:'Unit composing response. Stand by',speaking:'Unit transmitting on voice band',waiting:'Unit recalibrating. Hold position',error:'Anticitizen data anomaly. Unit requires inspection',paused:'Unit suspended by sector control',standby:'Secondary unit holds jurisdiction'};
 const CB_CODE={ready:'10-8',listening:'10-8',thinking:'10-6',speaking:'11-6',waiting:'10-20',error:'10-108',paused:'10-7',standby:'10-7'};
 F.define('combine',[
  {id:'cb-dispatch',mount(c){
   const bar=c.add('foot',c.h('div','fx cb-ticker'));bar.setAttribute('role','log');bar.setAttribute('aria-label','Dispatch');
   const tag=c.h('b',null,'DISPATCH'),code=c.h('i','cb-code'),text=c.h('span','cb-text');bar.append(tag,code,text);
   // v2.22: every line carries its radio code, and a line too long for the strip rolls once to show its end.
   let roll=0;
   function say(t,k='10-8'){c.cancel(roll);const s=c.h('span','cb-line',t.toUpperCase());text.replaceChildren(s);text.title=t;code.textContent=k;code.dataset.k=k;
    if(!c.reduced)roll=c.later(()=>{const over=s.scrollWidth-text.clientWidth;if(over>6){s.style.setProperty('--cb-roll',-(over+6)+'px');s.style.setProperty('--cb-roll-t',(3+over/40).toFixed(1)+'s');s.classList.add('cb-roll');}},1600);}
   say(DISPATCH[c.S.state]||DISPATCH.ready,CB_CODE[c.S.state]);
   return {update(type,d){
    if(type==='state'&&d.state!==d.before){if(d.before==='error'&&(d.state==='ready'||d.state==='listening'))say('Sociostability restored. Unit returns to code','10-8');else say(DISPATCH[d.state]||d.label,CB_CODE[d.state]);}
    if(type==='turn')say('Response delivered. Code '+(d.ms/1000).toFixed(1),'10-4');
    if(type==='sound')say('Audio deterrent deployed: '+d.name,'10-91');
    if(type==='music'&&d.title)say('Sector broadcast: '+d.title,'10-22');
    if(type==='check')say(d.problems?'Inspection complete. '+d.problems+' violation'+(d.problems===1?'':'s')+' on file':'Inspection complete. Sector compliant',d.problems?'10-108':'10-97');
    if(type==='chat'&&d.flood)say('Civil disturbance in sector chat. Unit throttling','11-44');}};
  }},
  {id:'cb-terminal',mount(c){
   // Click DISPATCH (or press T over the panel) for the unit's record: the recent dispatch log and
   // lifetime totals, as a Civil Protection terminal. v2.22: a sociostability gauge (Tyler's health)
   // and an Inspect sector directive (the full check).
   let term=null;const close=()=>{term?.remove();term=null;};
   const code=k=>({reply:'10-4',spoke:'11-6',sound:'10-91',music:'10-22',error:'10-108',state:'10-8'})[k]||'10-9';
   function open(){if(term)return close();const S=c.S,L=c.life,v=c.voice(),hp=c.health();term=c.h('div','fx cb-term fx-interactive');term.setAttribute('role','dialog');term.setAttribute('aria-label','Unit record');
    const head=c.h('div','cb-term-head');head.append(c.h('b',null,'UNIT ROBOTIC TYLER'),c.h('span',null,'SECTOR STATUS: '+(S.state==='error'?'NON-COMPLIANT':'COMPLIANT')));
    const gauge=c.h('div','cb-socio');gauge.dataset.level=hp>=80?'stable':hp>=50?'marginal':'critical';const meter=c.h('span','cb-socio-bar');for(let i=0;i<20;i++){const seg=c.h('i');if(i<Math.round(hp/5))seg.className='on';meter.append(seg);}
    gauge.append(c.h('small',null,'SOCIOSTABILITY'),meter,c.h('b',null,(hp>=80?'STABLE':hp>=50?'MARGINAL':'CRITICAL')+' · '+hp+'%'));
    const facts=c.h('div','cb-term-facts');for(const [k,val] of [['RESPONSES',L?L.replies+L.spoken:S.replies+S.spoken],['CITIZENS HEARD',L?L.heard:S.heard],['VIOLATIONS',L?L.errors:S.errors],['SUBJECTS ON BAND',v.peers],['AVG RESPONSE',c.ms(c.avgTurn())],['DEPLOYMENTS',L?L.sessions:1]]){const f=c.h('div');f.append(c.h('small',null,k),c.h('b',null,String(val)));facts.append(f);}
    const log=c.h('div','cb-term-log');log.setAttribute('role','log');for(const e of S.log.slice(-10).reverse()){const r=c.h('div');if(e.kind==='error')r.className='bad';r.append(c.h('span',null,new Date(e.at).toLocaleTimeString([],{hour12:false})),c.h('i',null,code(e.kind)),c.h('span',null,e.text.toUpperCase()));log.append(r);}
    if(!S.log.length)log.append(c.h('div',null,'NO DISPATCHES THIS SHIFT'));
    const row=c.h('div','cb-term-row'),ins=c.h('button','cb-term-close','Inspect sector'),x=c.h('button','cb-term-close','Close terminal');ins.type=x.type='button';ins.title='Run the full check';ins.onclick=()=>{close();c.actions.fullCheck();};x.onclick=close;row.append(ins,x);
    term.append(head,gauge,facts,log,row);term.style.setProperty('--fx-top',(c.below('.tabs')+6)+'px');c.slots.layer.append(term);x.focus();}
   const tag=c.root.querySelector('.cb-ticker>b');if(tag){tag.tabIndex=0;tag.setAttribute('role','button');tag.title='Open the unit record (T)';tag.onclick=open;tag.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();open();}};}
   c.key(e=>{if((e.key==='t'||e.key==='T')&&!e.repeat){e.preventDefault();open();}else if(term&&e.key==='Escape'){e.preventDefault();close();}});
   c.on(c.panel,'tyler-fx',e=>{if(e.detail==='cb-terminal'&&!term)open();});
   return {unmount:close};
  }},
  // v2.22: the unit plate in the header. Its lens flashes like a city scanner's camera when Tyler hears
  // a chat message, goes red on a problem and dark while suspended. Click it for Overwatch directives.
  {id:'cb-unit',mount(c){
   const chip=c.add('bar',c.h('button','fx cb-unit'));chip.type='button';chip.setAttribute('aria-haspopup','menu');chip.setAttribute('aria-expanded','false');
   const lens=c.h('i','cb-lens');chip.append(lens,c.h('span',null,'CP-17'));let shot=0;
   function render(){const s=c.S.state;chip.dataset.state=s==='error'?'alert':s==='paused'||s==='standby'?'off':s==='speaking'||s==='thinking'?'busy':'on';chip.title='Unit CP-17: '+(DISPATCH[s]||c.S.label)+'. The lens flashes when Tyler hears chat. Click for directives.';}
   function snap(){if(c.reduced||Date.now()-shot<2500)return;shot=Date.now();lens.classList.remove('snap');void lens.offsetWidth;lens.classList.add('snap');}
   chip.onclick=()=>{if(chip.getAttribute('aria-expanded')==='true'){c._menu?.close();return;}const paused=c.actions.paused();
    c.menu(chip,[{heading:'Overwatch directives · CP-17'},
     paused?{mark:'▶',label:'Deploy unit',hint:'Connect & start',run:c.actions.connect}:{mark:'❚❚',label:'Suspend unit',hint:'Pause AI',run:c.actions.pause},
     {mark:'◎',label:'Inspect sector',hint:'Full check',run:c.actions.fullCheck},
     {mark:'≋',label:'Re-scan voice band',hint:'Voice check',run:c.actions.refreshVoice},
     {mark:'■',label:'Silence audio',hint:'Stop audio',run:c.actions.stopAudio},
     'sep',{mark:'▤',label:'Unit record',hint:'T',run:()=>c.panel.dispatchEvent(new CustomEvent('tyler-fx',{detail:'cb-terminal'}))},
     {mark:'⚙',label:'Overwatch config',hint:'Settings',run:c.actions.settings}],{cls:'cb-menu',label:'Overwatch directives',align:'right'});};
   render();return {update(type){if(type==='state')render();if(type==='chat')snap();}};
  }},
  {id:'cb-scan',mount(c){
   let last=0;
   return {update(type,d){if(type!=='state'||d.state===d.before)return;
    if(d.state==='listening'&&Date.now()-last>15000&&!c.reduced){last=Date.now();const v=c.voice(),scan=c.h('div','fx cb-scan');scan.style.setProperty('--cb-top',(c.below('#activityCard')-12)+'px');scan.append(c.h('i'),c.h('b',null,'Biosignal scan: '+(v.peers||'no')+' subject'+(v.peers===1?'':'s')+' in call'));c.flash(scan,2000);}
    if(d.state==='error'){const a=c.h('div','fx cb-alert'),band=c.h('div','cb-alert-band');band.style.top=(c.below('.tabs')+4)+'px';band.append(c.h('b',null,'Anomaly'),c.h('i',null,'10-108'),c.h('span',null,(d.text||'Unit requires inspection').slice(0,90)));a.append(band);c.flash(a,3200);}}};
  }},
 ]);

 // ── Deadlock: souls, and the spirit thread that follows Tyler's state ─────
 F.define('deadlock',[
  {id:'dl-souls',mount(c){
   const box=c.add('deck',c.h('div','fx dl-plate'));
   const orb=c.h('span','dl-orb'),souls=c.h('b','dl-souls'),flex=c.h('span','dl-flex');
   const left=c.h('div','dl-left');left.append(orb,souls,c.h('small',null,'Souls'));box.append(left,c.h('span','dl-rule'),flex);
   left.title='Souls: tokens Tyler has used (1 soul per 10 tokens)';flex.title='Flex slots: people in the voice call';
   let shown=0,target=0,anim=0;
   const tokens=()=>{const m=/([\d.,]+)\s*([KMB]?)/i.exec(c.S.tokens||'');if(!m)return 0;return Number(m[1].replace(/,/g,''))*({K:1e3,M:1e6,B:1e9}[m[2].toUpperCase()]||1);};
   function render(){target=Math.round(tokens()/10);if(target>shown&&shown>0&&!anim&&!c.reduced){const plus=c.h('span','dl-plus','+'+(target-shown).toLocaleString());left.append(plus);c.later(()=>plus.remove(),1300);}if(target!==shown&&!anim){const step=()=>{shown+=Math.ceil((target-shown)/6);if(Math.abs(target-shown)<2)shown=target;souls.textContent=shown.toLocaleString();if(shown!==target)anim=requestAnimationFrame(step);else{anim=0;orb.classList.remove('gain');}};orb.classList.add('gain');anim=requestAnimationFrame(step);}else souls.textContent=shown.toLocaleString();
    const v=c.voice();flex.replaceChildren(...Array.from({length:4},(_,i)=>{const p=c.h('i');if(i<v.peers)p.className='on';return p;}),c.h('small',null,'Flex'));}
   render();c.every(render);return {update:render,unmount(){cancelAnimationFrame(anim);}};
  }},
  {id:'dl-thread',mount(c){
   const thread=c.add('layer',c.svg('<svg viewBox="0 0 40 200" preserveAspectRatio="none"><path class="dl-t1" d="M20 0 C 5 30, 35 60, 20 100 S 5 170, 20 200"/><path class="dl-t2" d="M20 0 C 35 35, 5 70, 20 100 S 35 165, 20 200"/></svg>','fx dl-thread'));
   function place(){const tally=c.root.getElementById('activityCard'),p=c.panel.getBoundingClientRect(),t=tally.getBoundingClientRect();thread.style.top=(t.top-p.top-6)+'px';thread.style.height=(t.height+12)+'px';}
   place();c.later(place,300);
   // v2.21: the dashes crawl from a 30-a-second timer instead of a CSS animation, which made the
   // browser restyle the panel on every screen refresh (about 5% of a core at 60 Hz, more at 144 Hz).
   // Same speeds as before: one dash cycle in 6 s (9 s the other way), 1.4 s while thinking.
   // Same timing as the old CSS: 6 s per dash cycle (9 s the other way), 1.4 s thinking, 0.6 s speaking;
   // still (offset 0) when there's a problem, paused or on standby.
   const p1=thread.querySelector('.dl-t1'),p2=thread.querySelector('.dl-t2'),still=globalThis.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches;let o1=0,o2=0,last=performance.now();
   const crawl=()=>{const t=performance.now(),dt=Math.min(100,t-last),st=thread.dataset.state;last=t;
    if(st==='error'||st==='paused'||st==='standby'){if(o1||o2){o1=o2=0;p1.style.strokeDashoffset=p2.style.strokeDashoffset='0';}c.later(crawl,250);return;}
    if(!document.hidden){const d1=st==='thinking'?1400:st==='speaking'?600:6000,d2=st==='thinking'?1400:st==='speaking'?600:9000;o1=(o1-110/d1*dt)%110;o2=(o2+110/d2*dt)%110;p1.style.strokeDashoffset=o1.toFixed(2);p2.style.strokeDashoffset=o2.toFixed(2);}
    c.later(crawl,33);};
   if(!still)crawl();
   return {update(type,d){if(type==='state')thread.dataset.state=d.state;if(type==='mini'||type==='theme')c.later(place,260);}};
  }},
  // v2.22: the shop. Click the souls (or press B over the panel) for Tyler's actions sorted like
  // Deadlock's shop into Weapon, Vitality and Spirit, each card showing the live figure it acts on.
  {id:'dl-shop',mount(c){
   const left=c.root.querySelector('.dl-plate .dl-left');if(!left)return {};
   left.tabIndex=0;left.setAttribute('role','button');left.setAttribute('aria-haspopup','dialog');left.title='Souls: tokens Tyler has used (1 soul per 10 tokens). Click for the shop (B).';
   const CATS=[['weapon','Weapon'],['vitality','Vitality'],['spirit','Spirit']];let cat='weapon',o=null;
   function items(k){const S=c.S,v=c.voice(),snd=c.actions.sounds(),paused=c.actions.paused(),fav=snd.favorites.map(n=>snd.slots.find(x=>x.slot===n)).find(Boolean);
    if(k==='weapon')return [['Soundboard',snd.slots.length+' clips · '+S.sounds+' played','◆',()=>c.actions.tab('soundboard')],fav?['Quick cast',fav.name,'✦',()=>c.actions.playSound(fav.slot)]:['Quick cast','Star a clip in Sounds first','✦',null],['Silence','Stops clips, music and voice','■',c.actions.stopAudio]];
    if(k==='vitality')return [['Full check','Health '+c.health()+'%','✚',c.actions.fullCheck],['Voice check',v.armed?(v.peers?v.peers+' in the call':'Armed, call empty'):'Microphone off','◖',c.actions.refreshVoice],['Checks','Problems and fixes','☰',()=>c.actions.tab('checks')]];
    return [[paused?'Connect & start':'Pause AI',S.label||'Ready','❚',paused?c.actions.connect:c.actions.pause],['Setup',S.model||(S.keyOk===false?'No AI key saved':'Chat and AI'),'⚙',()=>c.actions.tab('setup')],['Settings','Voice, theme and keys','✧',c.actions.settings]];}
   function render(focusTab){if(!o)return;const el=o.el;el.replaceChildren();el.dataset.cat=cat;
    const head=c.h('div','dl-shop-head');const bank=c.h('span','dl-shop-bank');bank.append(c.h('i','dl-orb'),c.h('b',null,(c.root.querySelector('.dl-souls')?.textContent||'0')));head.append(c.h('b',null,'Shop'),bank);
    const tabs=c.h('div','dl-shop-tabs');tabs.setAttribute('role','tablist');
    for(const [k,name] of CATS){const t=c.h('button','dl-shop-tab',name);t.type='button';t.dataset.cat=k;t.setAttribute('role','tab');t.setAttribute('aria-selected',String(k===cat));t.tabIndex=k===cat?0:-1;t.onclick=()=>{cat=k;render(true);};
     t.onkeydown=e=>{const i=CATS.findIndex(x=>x[0]===cat);if(e.key==='ArrowRight'||e.key==='ArrowLeft'){e.preventDefault();cat=CATS[(i+(e.key==='ArrowRight'?1:2))%3][0];render(true);}};tabs.append(t);}
    const grid=c.h('div','dl-shop-grid');grid.setAttribute('role','tabpanel');
    items(cat).forEach(([name,stat,glyph,run],i)=>{const b=c.h('button','dl-item');b.type='button';b.disabled=!run;b.append(c.h('span','dl-item-top'),c.h('span','dl-item-glyph',glyph),c.h('b',null,name),c.h('small',null,stat),c.h('span','dl-item-tier','I'.repeat(i+1)));b.onclick=()=>{o?.close();run?.();};grid.append(b);});
    const x=c.h('button','dl-shop-close','Close');x.type='button';x.onclick=()=>o?.close();
    el.append(head,tabs,grid,c.h('small','dl-shop-note','Arrows switch category · B or Esc closes'),x);
    (focusTab?tabs.querySelector('[aria-selected=true]'):grid.querySelector('button:not(:disabled)'))?.focus();}
   function open(){if(o){o.close();return;}o=c.overlay('dl-shop','Shop',{onClose:()=>{o=null;left.focus({preventScroll:true});}});render(false);}
   left.onclick=open;left.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();open();}};
   c.key(e=>{if((e.key==='b'||e.key==='B')&&!e.repeat){e.preventDefault();open();}});
   return {unmount(){o?.close();}};
  }},
  // v2.22: when Tyler goes down (a problem), the souls plate turns grey and counts how long he has been
  // down, with Rejuvenate (the full check); when he comes back, a Rejuvenated banner.
  {id:'dl-respawn',mount(c){
   const plate=c.root.querySelector('.dl-plate');if(!plate)return {};
   const down=c.h('div','dl-down'),t=c.h('b'),btn=c.h('button','dl-rejuv','Rejuvenate');btn.type='button';btn.title='Run the full check';btn.onclick=c.actions.fullCheck;down.append(c.h('small',null,'Down'),t,btn);down.title='Tyler is down: a problem stopped him. Rejuvenate runs the full check.';plate.append(down);
   let since=0;const tick=()=>{if(since)t.textContent=c.clock(Date.now()-since);};
   function set(on){if(on&&!since){since=Date.now();tick();}if(!on)since=0;plate.dataset.down=String(on);}
   set(c.S.state==='error');c.every(tick);
   return {update(type,d){if(type!=='state')return;set(d.state==='error');
    if(d.before==='error'&&(d.state==='ready'||d.state==='listening')){const b=c.h('div','fx dl-banner');b.style.top=(c.below('.dl-plate')+6)+'px';b.append(c.h('i'),c.h('b',null,'Rejuvenated'),c.h('small',null,'Tyler is back in the lane'));c.flash(b,2600);}}};
  }},
 ]);
})();

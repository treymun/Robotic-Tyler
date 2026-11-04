// Theme features, pack 3 (v2.20): Minecraft, PAYDAY 2, Dreamcast, Garry's Mod, Ricochet and Day of Defeat.
(() => {
 'use strict';
 const F=globalThis.TylerThemeFeatures;if(!F)return;

 // v2.22: a music disc for the inventory (a 14×14 pixel circle) and the label colours it takes.
 const MC_DISC=(()=>{let d='';for(let y=0;y<14;y++){const r=Math.sqrt(Math.max(0,49-(y-6.5)**2)),a=Math.round(7-r),b=Math.round(7+r);if(b>a)d+='M'+a+' '+y+'h'+(b-a)+'v1h-'+(b-a)+'z';}return d;})();
 const MC_LABELS=['#e0b42c','#d9483b','#4cb84c','#3a8fd6','#b45ad6','#e07b2c','#3fc8c8','#e85ca0','#9acd32'];
 // ── Minecraft: hearts, hunger and XP, and block-breaking while thinking ───
 F.define('minecraft',[
  {id:'mc-status',mount(c){
   const box=c.add('deck',c.h('div','fx mc-status'));
   const hearts=c.h('span','mc-row mc-hearts'),food=c.h('span','mc-row mc-food'),xp=c.h('div','mc-xp'),fill=c.h('i'),lvl=c.h('b','mc-level');
   for(let i=0;i<10;i++){hearts.append(c.h('i'));food.append(c.h('i'));}
   xp.append(fill,lvl);const top=c.h('div','mc-top');top.append(hearts,food);box.append(top,xp);
   hearts.title='Health: Tyler\'s connection health';food.title='Hunger: what\'s left of your spending cap (full when no cap is set)';xp.title='Experience: replies';
   let cap=0,level=-1;
   globalThis.TylerStorage?.get?.(['spendingCapUSD']).then(v=>{cap=Number(v?.spendingCapUSD)||0;render();}).catch(()=>{});
   // v2.22: the hearts blink when Tyler takes damage (a problem knocks his health down), as in the game.
   let prevH=null;
   function render(){const h=c.health()/10;if(prevH!==null&&h<prevH-.3&&!c.reduced){hearts.classList.remove('mc-hurt');void hearts.offsetWidth;hearts.classList.add('mc-hurt');}prevH=h;[...hearts.children].forEach((x,i)=>x.dataset.v=h>=i+1?'full':h>i+.4?'half':'empty');
    const left=cap>0?Math.max(0,1-c.S.spend/cap)*10:10;[...food.children].forEach((x,i)=>x.dataset.v=left>=i+1?'full':left>i+.4?'half':'empty');
    const L=c.life,n=L?L.replies+L.spoken:c.S.replies+c.S.spoken,l=Math.floor(Math.sqrt(n/2.5));const from=2.5*l*l,to=2.5*(l+1)*(l+1);fill.style.width=Math.round((n-from)/(to-from)*100)+'%';lvl.textContent=String(l);xp.title='Experience: '+n+' replies'+(L?' in all':' this session')+'. Level '+(l+1)+' at '+Math.ceil(to)+'.';
    if(level>=0&&l>level){const up=c.h('div','fx mc-levelup','Level up! '+l);up.style.top=(c.below('.mc-status')-30)+'px';c.flash(up,1600);}level=l;}
   render();c.every(render);return {update:render};
  }},
  {id:'mc-break',mount(c){
   const tally=c.root.getElementById('activityCard');let crack=null,timer=0;
   function stop(pop){if(timer)c.cancel(timer);timer=0;crack?.remove();crack=null;if(pop&&!c.reduced){const item=c.h('div','fx mc-pop');c.flash(item,900);}}
   function stage(i,est){if(!crack)return;crack.dataset.stage=String(i);if(i<9)timer=c.later(()=>stage(i+1,est),est/10);}
   return {update(type,d){if(type!=='state')return;if(d.state==='thinking'&&d.before!=='thinking'){stop(false);crack=c.h('span','fx mc-crack');tally.append(crack);stage(0,Math.max(900,c.avgTurn()));}else if(d.state!=='thinking'&&crack)stop(d.state==='speaking'||d.state==='ready');},unmount:()=>stop(false)};
  }},
  // v2.22: the inventory (E over the panel, or the chest in the header): Tyler's soundboard
  // as music discs, favourites on the hotbar. Click a disc, or press 1–9 for the hotbar, to play it.
  {id:'mc-inventory',mount(c){
   let o=null,tipEl=null,bar=[];
   const chest=c.add('bar',c.h('button','fx mc-chest'));chest.type='button';chest.title='Inventory: Tyler\'s sounds as music discs (E)';chest.setAttribute('aria-label','Open the inventory');chest.setAttribute('aria-haspopup','dialog');
   chest.append(c.svg('<svg viewBox="0 0 12 11" shape-rendering="crispEdges"><path fill="#2a1a0a" d="M0 0h12v11H0z"/><path fill="#9c6a2f" d="M1 1h10v3H1zM1 5h10v5H1z"/><path fill="#c48a44" d="M1 1h10v1H1zM1 5h10v1H1z"/><path fill="#d8d8d8" d="M5 3h2v4H5z"/><path fill="#2a1a0a" d="M5 4h2v1H5z"/></svg>'));
   const label=n=>{let x=0;for(const ch of String(n))x=(x*31+ch.charCodeAt(0))>>>0;return MC_LABELS[x%MC_LABELS.length];};
   const tip=t=>{if(tipEl)tipEl.textContent=t;};
   function slot(s,i,hot,favs){const b=c.h('button','mc-slot');b.type='button';if(!s){b.disabled=true;b.setAttribute('aria-label','Empty slot');return b;}
    b.append(c.svg('<svg viewBox="0 0 14 14" shape-rendering="crispEdges"><path fill="#1b1b1b" d="'+MC_DISC+'"/><path fill="#333" d="M2 6h1v2H2zM11 6h1v2h-1zM6 2h2v1H6zM6 11h2v1H6z"/><path fill="'+label(s.name)+'" d="M5 5h4v4H5z"/><path fill="#1b1b1b" d="M6 6h2v2H6z"/><path fill="#7a7a7a" d="M3 3h1v1H3zM4 2h2v1H4z"/></svg>','mc-disc'));
    if(hot)b.append(c.h('small',null,String(i+1)));const fav=favs.includes(s.slot);
    b.setAttribute('aria-label','Play '+s.name+(hot?', hotbar '+(i+1):''));b.title=s.name+(fav?' ★':'');
    b.onmouseenter=b.onfocus=()=>tip(s.name+(fav?' ★ favourite':'')+(hot?' · '+(i+1):''));
    b.onclick=()=>{c.actions.playSound(s.slot);b.classList.remove('used');void b.offsetWidth;b.classList.add('used');tip('♪ '+s.name);};return b;}
   function open(){if(o){o.close();return;}
    const {slots,favorites}=c.actions.sounds();
    o=c.overlay('mc-inv','Inventory',{onClose:()=>{o=null;bar=[];tipEl=null;chest.focus({preventScroll:true});}});const el=o.el;
    const hot=[...favorites.map(n=>slots.find(s=>s.slot===n)).filter(Boolean),...slots.filter(s=>!favorites.includes(s.slot))].slice(0,9),rest=slots.filter(s=>!hot.includes(s));
    const grid=c.h('div','mc-inv-grid'),rows=Math.max(3,Math.ceil(rest.length/9));for(let i=0;i<rows*9;i++)grid.append(slot(rest[i],i,false,favorites));
    const hb=c.h('div','mc-inv-grid mc-hotbar');bar=[];for(let i=0;i<9;i++){const b=slot(hot[i],i,true,favorites);bar.push(hot[i]?b:null);hb.append(b);}
    tipEl=c.h('div','mc-inv-tip',slots.length?'Click a disc, or press 1–9, to play it in voice':'No sounds yet: the Sounds tab sets up the soundboard.');tipEl.setAttribute('aria-live','polite');
    const row=c.h('div','mc-inv-row'),go=c.h('button','mc-btn','Sounds tab'),x=c.h('button','mc-btn','Done');go.type=x.type='button';go.onclick=()=>{o.close();c.actions.tab('soundboard');};x.onclick=()=>o.close();row.append(go,x);
    el.append(c.h('b','mc-inv-title','Inventory'),grid,c.h('b','mc-inv-title','Hotbar'),hb,tipEl,row);(hb.querySelector('.mc-slot:not(:disabled)')||x).focus();}
   chest.onclick=open;
   c.key(e=>{if((e.key==='e'||e.key==='E')&&!e.repeat){e.preventDefault();open();}else if(o&&/^[1-9]$/.test(e.key)&&!e.repeat){const b=bar[Number(e.key)-1];if(b){e.preventDefault();b.focus();b.click();}}});
   return {unmount(){o?.close();}};
  }},
  // v2.22: "Advancement Made!" toasts for Tyler's milestones, kept with the lifetime stats.
  {id:'mc-advance',mount(c){
   const total=k=>Math.max(Number(c.life?.[k])||0,Number(c.S[k])||0),replies=()=>total('replies')+total('spoken');
   const LIST=[['r1','Stone Age','Tyler\'s first reply','#9a9a9a',()=>replies()>=1],['r10','Acquire Hardware','10 replies','#e6e6e6',()=>replies()>=10],['r100','Diamonds!','100 replies','#5ff0e8',()=>replies()>=100],['r1000','Cover Me with Diamonds','1,000 replies','#2fc9c4',()=>replies()>=1000],
    ['song','Sound of Music','A song from the Music DJ','#e0b42c',()=>total('songs')>=1||!!c.S.music],['back','Postmortal','Back after a problem','#f2c94c',()=>false],['regular','We Need to Go Deeper','10 sessions with Tyler','#9b5cf0',()=>(c.life?.sessions||0)>=10],['marathon','Adventuring Time','10 hours with Tyler','#5bb04a',()=>(c.life?.timeMs||0)>=36e6]];
   let queue=Promise.resolve(),ready=false;
   function toast(name,desc,color){queue=queue.then(()=>new Promise(done=>{const el=c.h('div','fx mc-adv');el.style.top=(c.below('.bar')+8)+'px';el.setAttribute('role','status');el.title=desc;
    const icon=c.svg('<svg viewBox="0 0 10 9" shape-rendering="crispEdges"><path fill="'+color+'" d="M3 1h4v1H3zM2 2h6v1H2zM1 3h8v2H1zM2 5h6v1H2zM3 6h4v1H3zM4 7h2v1H4z"/><path fill="#fff" fill-opacity=".7" d="M3 2h1v1H3zM2 3h1v1H2z"/><path fill="#000" fill-opacity=".25" d="M6 5h2v1H6zM5 6h2v1H5z"/></svg>','mc-adv-icon');
    const t=c.h('span','mc-adv-text');t.append(c.h('small',null,'Advancement Made!'),c.h('b',null,name));el.append(icon,t);c.flash(el,4200);c.later(done,1300);}));}
   function check(type,d,first){if(!ready&&!first)return;ready=true;const got=[];
    for(const [key,name,desc,color,test] of LIST){const met=key==='back'?type==='state'&&d?.before==='error'&&['ready','listening'].includes(d?.state):test();if(met&&c.unlock('mc:'+key))got.push([name,desc,color]);}
    // On the first look, things done before (in another theme or session) unlock quietly but the last.
    for(const g of first?got.slice(-1):got)toast(...g);}
   c.later(()=>check('life',null,true),1500);
   return {update(type,d){if(['reply','state','music','life','turn'].includes(type))check(type,d,false);}};
  }},
 ]);

 // ── PAYDAY 2: the heist plan, the heist timer and police assaults ─────────
 F.define('payday',[
  {id:'pd-plan',mount(c){
   const box=c.add('deck',c.h('div','fx pd-plan'));const steps=[];
   const defs=[['Gear up','AI key','setup',()=>c.S.keyOk===true],['Case the place','Chat linked','setup',()=>c.systems()[1].level===3],['Get in','Voice armed','checks',()=>c.voice().armed],['Crew','People in voice','checks',()=>c.voice().peers>0]];
   const title=c.h('div','pd-title');const status=c.h('b');title.append(c.h('small',null,'Heist plan'),status);box.append(title);
   // v2.22: the drill. While Tyler writes, a drill timer runs to his usual reply time; past twice that,
   // "The drill's jammed!"; then "Drill done".
   const drill=c.h('div','pd-drill'),bar=c.h('span','pd-drill-bar'),fill=c.h('i'),dt=c.h('small');bar.append(fill);drill.append(c.h('b',null,'Drill'),bar,dt);box.append(drill);
   const row=c.h('div','pd-steps');box.append(row);
   defs.forEach(([name,detail,tab],i)=>{const b=c.h('button','pd-step');b.type='button';b.append(c.h('small',null,String(i+1)),c.h('b',null,name),c.h('span',null,detail));b.onclick=()=>c.actions.tab(tab);row.append(b);steps.push(b);});
   let jam=0,done=0;
   function render(){let first=-1;defs.forEach((d,i)=>{const ok=d[3]();steps[i].dataset.done=String(ok);if(!ok&&first<0)first=i;steps[i].dataset.next=String(i===first);});status.textContent=first<0?'Ready. Go loud.':'Next: '+defs[first][0];box.dataset.ready=String(first<0);}
   function drillState(st){c.cancel(jam);
    if(st==='thinking'){c.cancel(done);const est=Math.max(900,c.avgTurn());drill.dataset.on='run';dt.textContent='≈ '+c.ms(est);fill.style.animation='none';void fill.offsetWidth;fill.style.animation='';fill.style.animationDuration=est+'ms';jam=c.later(()=>{drill.dataset.on='jam';dt.textContent='The drill\'s jammed!';},est*2);}
    else if(drill.dataset.on==='run'||drill.dataset.on==='jam'){const ok=st==='speaking'||st==='ready'||st==='listening';drill.dataset.on=ok?'done':'';dt.textContent=ok?'Drill done':'';if(ok)done=c.later(()=>{drill.dataset.on='';},1600);}}
   render();c.every(render);return {update(type,d){if(type==='state'&&d.state!==d.before)drillState(d.state);render();}};
  }},
  {id:'pd-timer',mount(c){
   // v2.22: the heist timer is a button: the PAYDAY screen with this heist's take and the career totals.
   const t=c.add('bar',c.h('button','fx pd-timer'));t.type='button';t.setAttribute('aria-haspopup','dialog');const n=c.h('small'),time=c.h('span');t.append(n,time);
   const render=()=>{const L=c.life;n.textContent=L?'#'+L.sessions:'';time.textContent=c.clock(Date.now()-c.S.started);t.title='Heist time: how long this panel has been running'+(L?'. Heist #'+L.sessions+', career '+(L.timeMs/36e5).toFixed(1)+' h, '+(L.replies+L.spoken).toLocaleString()+' jobs done':'')+'. Click for the PAYDAY screen.';};
   const plural=(n,w)=>n.toLocaleString()+' '+w+(n===1?'':'s');
   function payday(){const S=c.S,L=c.life,o=c.overlay('pd-payday','PAYDAY');
    const head=c.h('div','pd-pay-head');head.append(c.h('b',null,'PAYDAY'),c.h('span',null,(L?'Heist #'+L.sessions+' · ':'')+c.clock(Date.now()-S.started)));
    const take=c.h('div','pd-pay-grid');for(const [k,v] of [['Jobs done',S.replies+S.spoken],['Crew heard',S.heard],['Bags secured',S.sounds],['Alarms raised',S.errors],['Average job',c.ms(c.avgTurn())],['Best streak',S.best]]){const f=c.h('div');f.append(c.h('small',null,k),c.h('b',null,String(v)));take.append(f);}
    const cost=c.h('div','pd-pay-cost');cost.append(c.h('small',null,'Cleaner costs (AI text spend)'),c.h('b',null,'$'+S.spend.toFixed(4)));
    o.el.append(head,c.h('small','pd-pay-sub','This heist'),take,cost);
    if(L){const car=c.h('div','pd-pay-career');car.append(c.h('small',null,'Career'),c.h('span',null,plural(L.sessions,'heist')+' · '+(L.timeMs/36e5).toFixed(1)+' h · '+plural(L.replies+L.spoken,'job')+' · '+plural(L.errors,'assault')));o.el.append(car);}
    const x=c.h('button','pd-pay-close','Back to the safehouse');x.type='button';x.onclick=o.close;o.el.append(x);x.focus({preventScroll:true});}
   t.onclick=()=>{if(c._overlay)c._overlay.close();else payday();};
   render();c.every(render);return {update(type){if(type==='life')render();}};
  }},
  {id:'pd-assault',mount(c){
   // v2.22: the assault banner sits on top of the heist plan instead of over the page, shows "Assault
   // ending" after a recovery, and has the pager: hold it (or F over the panel) to run the full check.
   const plan=c.root.querySelector('.pd-plan');let banner=null,hold=0,fade=0;
   const PAGER=1100;
   function cancelHold(){if(!hold)return;c.cancel(hold);hold=0;banner?.querySelector('.pd-pager')?.classList.remove('holding');}
   function startHold(){if(hold||!banner)return;const p=banner.querySelector('.pd-pager');p.classList.add('holding');hold=c.later(()=>{hold=0;p.classList.remove('holding');p.classList.add('answered');c.actions.fullCheck();},PAGER);}
   function show(phase){c.cancel(fade);
    if(!banner){banner=c.h('div','fx pd-assault');banner.setAttribute('role','status');
     if(plan)plan.prepend(banner);else{c.add('layer',banner);banner.style.top=(c.below('.tabs')+2)+'px';}
     const inner=c.h('span','pd-assault-text'),pager=c.h('button','pd-pager fx-interactive');pager.type='button';pager.title='Hold to answer the pager: runs the full check (or hold F over the panel)';pager.append(c.h('i'),c.h('b',null,'Pager'),c.h('small',null,'hold F'));
     pager.onpointerdown=e=>{e.preventDefault();startHold();};pager.onpointerup=pager.onpointerleave=pager.onpointercancel=cancelHold;pager.onclick=e=>{if(e.detail===0)c.actions.fullCheck();};
     banner.append(inner,pager);}
    banner.dataset.phase=phase;banner.querySelector('.pd-assault-text').textContent=phase==='fade'?'Assault ending':'Police assault in progress';
    if(phase==='fade')fade=c.later(hide,6000);}
   function hide(){cancelHold();banner?.remove();banner=null;}
   c.key(e=>{if((e.key==='f'||e.key==='F')&&banner?.dataset.phase==='assault'&&!e.repeat){e.preventDefault();startHold();}});
   c.on(document,'keyup',e=>{if(e.key==='f'||e.key==='F')cancelHold();},true);
   if(c.S.state==='error'||c.S.state==='waiting')show('assault');
   return {update(type,d){if(type!=='state'||d.state===d.before)return;if(d.state==='error'||d.state==='waiting')show('assault');else if(banner&&banner.dataset.phase==='assault')show('fade');},unmount:hide};
  }},
 ]);

 // ── Dreamcast: a working VMU screen and the boot swirl ────────────────────
 const VMU_ICON={ready:'M2 6h12v6H2zM4 4h8v2H4zM6 8h1v1H6zM9 8h1v1H9z',listening:'M7 2h2v7H7zM5 7h1v2H5zM10 7h1v2h-1zM6 10h4v1H6zM7.5 11h1v2h-1z',thinking:'M2 7h2v2H2zM7 7h2v2H7zM12 7h2v2h-2z',speaking:'M3 6h3v4H3zM6 5h1v6H6zM7 4h1v8H7zM10 6h1v4h-1zM12 4h1v8h-1z',error:'M3 3h2v2H3zM5 5h2v2H5zM7 7h2v2H7zM9 9h2v2H9zM11 11h2v2h-2zM11 3h2v2h-2zM9 5h2v2H9zM5 9h2v2H5zM3 11h2v2H3z',waiting:'M5 2h6v2H5zM6 4h4v2H6zM7 6h2v4H7zM6 10h4v2H6zM5 12h6v2H5z',paused:'M4 3h3v10H4zM9 3h3v10H9z',standby:'M4 4h8v1H4zM9 5h2v1H9zM8 6h2v1H8zM7 7h2v1H7zM6 8h2v1H6zM5 9h2v1H5zM4 10h8v1H4z'};
 F.define('dreamcast',[
  {id:'dc-vmu',mount(c){
   const tally=c.root.getElementById('activityCard');
   const lcd=c.h('div','fx dc-lcd');lcd.setAttribute('aria-hidden','true');
   const icon=c.svg('<svg viewBox="0 0 16 16" shape-rendering="crispEdges"><path/></svg>','dc-icon');const right=c.h('div','dc-lcd-right'),clock=c.h('b'),count=c.h('small');right.append(clock,count);lcd.append(icon,right);tally.append(lcd);
   // The VMU in the controller: a small one in the header, the big screen when the panel is collapsed.
   const vmu=c.add('bar',c.h('button','fx dc-vmu'));vmu.type='button';vmu.title='VMU: Tyler\'s status. Click to collapse into the VMU.';vmu.setAttribute('aria-label','Collapse into the VMU');
   const small=c.svg('<svg viewBox="0 0 16 16" shape-rendering="crispEdges"><path/></svg>','dc-vmu-icon');const screen=c.h('span','dc-vmu-lcd');screen.append(small);vmu.append(screen,c.h('i','dc-vmu-a'),c.h('i','dc-vmu-b'));vmu.title='VMU: Tyler\'s status. Click for his memory card.';vmu.setAttribute('aria-label','Open Tyler\'s memory card');
   let mem=null;const close=()=>{mem?.remove();mem=null;};
   vmu.onclick=()=>{if(mem)return close();const L=c.life,S=c.S;mem=c.h('div','fx dc-memory fx-interactive');mem.setAttribute('role','dialog');mem.setAttribute('aria-label','Memory card');
    mem.append(c.h('b',null,'Visual Memory · Tyler'));const grid=c.h('div','dc-files');
    for(const [name,value,color] of [['Replies',L?L.replies+L.spoken:S.replies+S.spoken,'#ff6a00'],['Heard',L?L.heard:S.heard,'#1e88e5'],['Sounds',L?L.sounds:S.sounds,'#43a047'],['Songs',L?L.songs:(S.music?1:0),'#8e24aa'],['Sessions',L?L.sessions:1,'#fdd835'],['Hours',L?(L.timeMs/36e5).toFixed(1):'—','#00acc1']]){const f=c.h('div','dc-file');f.style.setProperty('--file',color);f.append(c.h('i'),c.h('small',null,name),c.h('b',null,String(value)));grid.append(f);}
    const blocks=L?Math.max(0,200-Math.min(200,Math.ceil(JSON.stringify(L).length/128))):200;
    mem.append(grid,c.h('small','dc-free',L?blocks+' blocks free':'Memory off: Settings → Appearance keeps these between sessions'));
    const row=c.h('div','dc-row'),mini=c.h('button',null,'Collapse to VMU'),x=c.h('button',null,'Back');mini.type=x.type='button';mini.onclick=()=>{close();c.actions.collapse();};x.onclick=close;row.append(x,mini);mem.append(row);mem.style.setProperty('--fx-top',(c.below('.tabs')+6)+'px');c.slots.layer.append(mem);x.focus();};
   c.key(e=>{if(mem&&e.key==='Escape'){e.preventDefault();close();}});
   function render(){const d=VMU_ICON[c.S.state]||VMU_ICON.ready;icon.querySelector('path').setAttribute('d',d);small.querySelector('path').setAttribute('d',d);clock.textContent=new Date().toLocaleTimeString([],{hour:'2-digit',minute:'2-digit',hour12:false});count.textContent='RPL '+c.pad(c.S.replies+c.S.spoken,3);vmu.dataset.state=c.S.state;}
   render();c.every(render);return {update:render,unmount(){lcd.remove();close();}};
  }},
  {id:'dc-swirl',mount(c){
   const play=()=>{if(c.reduced)return;const s=c.h('div','fx dc-swirl');s.append(c.svg('<svg viewBox="0 0 100 100"><path d="M50 50 m0 -6 a6 6 0 1 1 -6 6 a12 12 0 0 1 12 -12 a18 18 0 1 1 -18 18 a24 24 0 0 1 24 -24 a30 30 0 1 1 -30 30"/></svg>'));c.flash(s,1300);};
   c.later(play,250);
   return {update(type,d){if(type==='mini'&&!d.mini)play();if(type==='state'&&['paused','standby','error'].includes(d.before)&&['ready','listening'].includes(d.state))play();}};
  }},
 ]);

 // ── Garry's Mod: Lua-error style problems, spawn notices, properties ──────
 F.define('gmod',[
  {id:'gm-lua',mount(c){
   let box=null;
   return {update(type,d){if(type!=='state'||d.state!=='error'||d.before==='error')return;box?.remove();
    box=c.h('div','fx gm-lua');box.style.top=(c.below('.tabs')+4)+'px';box.setAttribute('role','status');const msg=(d.text||'problem').replace(/\s+/g,' ').slice(0,120);
    box.append(c.h('b',null,'[ROBOTIC TYLER] lua/tyler/reply.lua:'+(40+c.S.errors)+': '+msg),c.h('span',null,'  1. unknown - Checks tab has the details'),c.h('span',null,'   2. Run checks - [C]:-1'));c.flash(box,6000);}};
  }},
  {id:'gm-notices',mount(c){
   const stack=c.add('layer',c.h('div','fx gm-stack'));
   function note(kind,text){const n=c.h('div','gm-note '+kind);n.append(c.h('i'),c.h('span',null,text));stack.append(n);while(stack.children.length>4)stack.firstElementChild.remove();c.later(()=>n.classList.add('gone'),3400);c.later(()=>n.remove(),3800);}
   return {update(type,d){if(type==='sound')note('spawn','Spawned sound: '+d.name);if(type==='reply')note('spawn','Spawned reply ('+d.chars+' chars)');if(type==='tab')note('tool','Tool: '+c.TAB_NAMES[d.tab]);if(type==='music'&&d.title)note('spawn','Spawned song: '+d.title.slice(0,34));if(type==='state'&&d.state==='paused'&&d.before!=='paused')note('undo','Undone: Automatic replies');}};
  }},
  {id:'gm-props',mount(c){
   const stats=c.root.getElementById('hud');let menu=null;
   function close(){menu?.remove();menu=null;}
   c.on(stats,'contextmenu',e=>{e.preventDefault();close();const S=c.S,v=c.voice(),p=c.panel.getBoundingClientRect();
    menu=c.h('div','fx gm-props fx-interactive');menu.setAttribute('role','dialog');menu.setAttribute('aria-label','Properties');menu.append(c.h('b',null,'Properties: ROBOTIC TYLER'));
    const t=c.h('table');for(const [k,val] of [['State',S.label],['Health',c.health()+'%'],['Replies',S.replies+S.spoken],['Average reply',c.ms(c.avgTurn())],['Best streak',S.best],['Voice',v.armed?v.peers+' in call':'off'],['Model',S.model||'unknown'],['Spend',S.hud.spend||'$0']]){const r=t.insertRow();r.insertCell().textContent=k;r.insertCell().textContent=String(val);}
    const x=c.h('button',null,'Close');x.type='button';x.onclick=close;menu.append(t,x);menu.style.left=Math.min(e.clientX-p.left,p.width-230)+'px';menu.style.top=Math.min(e.clientY-p.top,p.height-260)+'px';c.slots.layer.append(menu);x.focus();});
   stats.title='Right-click for properties';
   c.key(e=>{if(menu&&e.key==='Escape'){e.preventDefault();close();}});
   return {unmount(){close();stats.removeAttribute('title');}};
  }},
 ]);

 // ── Ricochet: the arcade scoreboard and the disc that carries you between tabs ─
 F.define('ricochet',[
  {id:'rc-score',mount(c){
   const box=c.add('deck',c.h('div','fx rc-score'));
   const score=c.h('b','rc-points'),discs=c.h('span','rc-discs'),power=c.h('span','rc-power');
   const left=c.h('div');left.append(c.h('small',null,'Score'),score);const mid=c.h('div');mid.append(c.h('small',null,'Discs'),discs);const right=c.h('div');right.append(c.h('small',null,'Power-up'),power);box.append(left,mid,right);
   let points=0,lives=3,clean=0;
   function render(){score.textContent=String(points).padStart(6,'0');discs.replaceChildren(...Array.from({length:3},(_,i)=>{const d=c.h('i');if(i<lives)d.className='on';return d;}));
    const last=c.S.turns.at(-1);power.textContent=c.S.streak>=3?'Multi ×'+c.S.streak:last&&last<1200?'Fast shot':'—';power.dataset.on=String(power.textContent!=='—');}
   const hi=c.h('small','rc-hi');left.append(hi);
   const showHi=()=>{const best=c.best('ricochet',points);hi.textContent='HI '+String(best).padStart(6,'0');};
   box.tabIndex=0;box.setAttribute('role','button');box.title='Arcade score. Click for the high-score table.';
   let table=null;const close=()=>{table?.remove();table=null;};
   const open=()=>{if(table)return close();const L=c.life;table=c.h('div','fx rc-table fx-interactive');table.setAttribute('role','dialog');table.setAttribute('aria-label','High scores');table.append(c.h('b',null,'High scores'));
    const rows=[['This game',points],['Best ever',Number(L?.best?.ricochet)||points],['Fastest reply',L?.fastest?c.ms(L.fastest):'—'],['Longest streak',Math.max(L?.bestStreak||0,c.S.best)],['Games played',L?.sessions||1]];
    for(const [k,v] of rows){const r=c.h('div','rc-row');r.append(c.h('span',null,k),c.h('b',null,typeof v==='number'?String(v).padStart(k.includes('streak')||k.includes('played')?1:6,'0'):String(v)));table.append(r);}
    const x=c.h('button','rc-close','Continue');x.type='button';x.onclick=close;table.append(x);table.style.setProperty('--fx-top',(c.below('.tabs')+6)+'px');c.slots.layer.append(table);x.focus();};
   box.onclick=open;box.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();open();}};
   c.key(e=>{if(table&&e.key==='Escape'){e.preventDefault();close();}});
   render();showHi();
   return {unmount:close,update(type,d){if(type==='life')showHi();if(type==='turn'){c.later(showHi,0);points+=100+Math.max(0,Math.round((3000-d.ms)/30))+c.S.streak*25;if(++clean>=3&&lives<3){lives++;clean=0;}render();box.classList.remove('hit');void box.offsetWidth;box.classList.add('hit');}
    if(type==='state'&&d.state==='error'&&d.before!=='error'){lives=Math.max(0,lives-1);clean=0;render();if(!lives){const o=c.h('div','fx rc-over','Game over. Insert coin');c.flash(o,2200);lives=3;c.later(render,2200);}}}};
  }},
  {id:'rc-disc',mount(c){
   const tabs=c.root.querySelector('.tabs');let prev=c.S.tab;
   return {update(type,d){if(type!=='tab'||d.tab===prev||c.reduced)return;const from=c.TABS.indexOf(prev),to=c.TABS.indexOf(d.tab);prev=d.tab;
    const p=c.panel.getBoundingClientRect(),r=tabs.getBoundingClientRect(),w=r.width/c.TABS.length;
    const disc=c.h('span','fx rc-flying');disc.style.top=(r.top-p.top+r.height/2-9)+'px';disc.style.setProperty('--from',(r.left-p.left+w*(from+.5)-9)+'px');disc.style.setProperty('--to',(r.left-p.left+w*(to+.5)-9)+'px');c.flash(disc,520);}};
  }},
 ]);

 // ── Day of Defeat: the field radio dial and the operation briefing ────────
 const DOD_CH=[['CH 1','Chat'],['CH 2','Room'],['CH 3','Sounds'],['CH 4','Setup'],['CH 5','Checks']];
 F.define('dod',[
  {id:'dod-radio',mount(c){
   const box=c.add('deck',c.h('div','fx dod-radio'));
   const knob=c.h('button','dod-knob');knob.type='button';knob.setAttribute('role','slider');knob.setAttribute('aria-label','Channel');knob.setAttribute('aria-valuemin','1');knob.setAttribute('aria-valuemax','5');
   const scale=c.h('div','dod-scale');DOD_CH.forEach(([ch,name],i)=>{const m=c.h('button','dod-mark');m.type='button';m.append(c.h('small',null,ch),c.h('span',null,name));m.onclick=()=>c.actions.tab(c.TABS[i]);scale.append(m);});
   const lamp=c.h('span','dod-lamp'),signal=c.h('span','dod-signal');for(let i=0;i<5;i++)signal.append(c.h('i'));
   const meta=c.h('div','dod-meta');meta.append(lamp,c.h('b',null,'TYLER-1'),signal);box.append(knob,scale,meta);
   const turn=dir=>{const i=c.TABS.indexOf(c.S.tab);c.actions.tab(c.TABS[(i+dir+c.TABS.length)%c.TABS.length]);};
   knob.onclick=()=>turn(1);knob.oncontextmenu=e=>{e.preventDefault();turn(-1);};
   knob.onwheel=e=>{e.preventDefault();turn(e.deltaY>0?1:-1);};knob.onkeydown=e=>{if(e.key==='ArrowRight'||e.key==='ArrowUp'){e.preventDefault();turn(1);}if(e.key==='ArrowLeft'||e.key==='ArrowDown'){e.preventDefault();turn(-1);}};
   knob.title='Turn to change channel (click, scroll or arrow keys)';
   function render(){const i=c.TABS.indexOf(c.S.tab);knob.style.setProperty('--turn',(i*60-120)+'deg');knob.setAttribute('aria-valuenow',String(i+1));knob.setAttribute('aria-valuetext',DOD_CH[i][1]);
    [...scale.children].forEach((m,j)=>m.setAttribute('aria-current',String(j===i)));
    const h=c.health(),bars=c.S.state==='error'?1:Math.round(h/20);[...signal.children].forEach((x,j)=>x.classList.toggle('on',j<bars));lamp.dataset.state=c.S.state;signal.title='Link strength '+h+'%';}
   render();c.every(render);return {update:render};
  }},
  {id:'dod-brief',mount(c){
   const chip=c.add('bar',c.h('button','fx fx-chip dod-chip','Orders'));chip.type='button';chip.title='Operation briefing';
   let sheet=null;
   function close(){sheet?.remove();sheet=null;}
   function open(){if(sheet)return close();const S=c.S,v=c.voice(),sys=c.systems();
    sheet=c.h('div','fx dod-brief fx-interactive');sheet.setAttribute('role','dialog');sheet.setAttribute('aria-label','Operation briefing');
    sheet.append(c.h('small',null,'Field orders · '+new Date().toLocaleDateString()),c.h('b',null,'Operation Friday Squad'));
    const list=c.h('dl');for(const [k,val] of [['Unit','ROBOTIC TYLER'],['Objective','Keep the squad company in chat and voice'],['Comms',sys[1].detail],['Radio',v.armed?(v.peers?v.peers+' on the net':'net open, no one on it'):'radio off'],['Brain',S.model||'unknown'],['Reports',(S.replies+S.spoken)+' sent · '+S.errors+' problems']]){list.append(c.h('dt',null,k),c.h('dd',null,String(val)));}
    const stamp=c.h('span','dod-stamp',sys.every(s=>s.level>=2)&&S.keyOk?'Approved':'Pending');stamp.dataset.ok=String(stamp.textContent==='Approved');
    const x=c.h('button','dod-close','Dismissed');x.type='button';x.onclick=close;sheet.append(list,stamp,x);c.slots.layer.append(sheet);x.focus();}
   chip.onclick=open;c.key(e=>{if(sheet&&e.key==='Escape'){e.preventDefault();close();}});return {unmount:close};
  }},
 ]);
})();

// Settings → Appearance: the theme gallery (v2.14).
//
// One card per theme (fifteen), each with the theme's Tyler logo and a miniature of the
// real chat panel. Choosing a card updates a larger preview (status strip, tabs,
// buttons, an input, a notification); Apply saves it for every Tyler window
// through theme.js. Previews are built from the panel's own markup and stylesheet
// (TylerUI from ui-template.js) inside shadow roots, so each one shows exactly
// what the panel looks like in that theme, isolated from the page's own theme.
// Previews use sample text only: nothing is sent, no AI request, no chat connection.
(()=>{
 'use strict';
 const gallery=document.getElementById('themeGallery'),stage=document.getElementById('themeStage');
 const T=globalThis.TylerTheme,UI=globalThis.TylerUI;
 // Pixel-art logos keep hard edges (the panel's canvas does the same, see ui-logos.js).
 const PIXEL=new Set(globalThis.TylerLogos?.pixel||['doom','minecraft']);
 if(!gallery||!stage||!T||!UI)return;
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
 // The real panel parts, without ids (each preview has its own copy).
 const parts=(()=>{const t=document.createElement('template');t.innerHTML=UI.html;const pick=s=>t.content.querySelector(s);
  const out={};for(const [k,s] of [['bar','.bar'],['tally','.tally'],['stats','.stats'],['tabs','.tabs'],['foot','.foot']]){const n=pick(s)?.cloneNode(true);if(!n)continue;for(const e of [n,...n.querySelectorAll('[id]')])e.removeAttribute('id');out[k]=n;}
  return out;})();

 function panelFor(theme,{card=false}={}){
  const panel=document.createElement('aside');panel.className='panel';panel.dataset.rtTheme=theme;panel.dataset.voice='true';panel.dataset.platform='chrome';
  const bar=parts.bar.cloneNode(true),mark=bar.querySelector('.mark');
  if(mark){mark.querySelector('canvas')?.remove();const img=document.createElement('img');img.className='mark-art';img.alt='';img.src='ui/logos/'+theme+'.png';mark.append(img);mark.dataset.logo=theme;}
  const sub=bar.querySelector('.ident-sub');if(sub)sub.textContent='Chrome · voice and chat';
  const tally=parts.tally.cloneNode(true);tally.dataset.state=card?'listening':'speaking';
  const label=tally.querySelector('.tally-label'),text=tally.querySelector('.tally-text');
  if(label)label.textContent=card?'Listening':'On air';if(text){text.textContent=card?'Speak normally, then pause':'Speaking — say “stop” or “hold on” to interrupt';text.removeAttribute('role');}
  const stats=parts.stats.cloneNode(true),vals=['Idle','$0.0314','1.6 s'],metas=['Bridge ready','23.4K tokens','Text + speech'];
  stats.querySelectorAll('dd').forEach((d,i)=>d.textContent=vals[i]||'');stats.querySelectorAll('small').forEach((s,i)=>s.textContent=metas[i]||'');
  panel.append(bar,tally,stats,parts.tabs.cloneNode(true));
  if(!card){
   const scroll=document.createElement('div');scroll.className='scroll';
   scroll.innerHTML=`<h2>Conversation</h2><p class="hint preview-note">Sample preview. Nothing here is sent anywhere.</p>
<label>Ask Tyler<input type="text" value="Who’s throwing this match?"></label>
<div class="btn-row"><button class="btn primary" type="button">${icon('play')}Connect &amp; start</button><button class="btn" type="button">${icon('pause')}Pause</button></div>
<label>Participation<select><option>Active conversation</option></select></label>
<div class="rt-toast rt-static" data-kind="success" data-n="01">${icon('success')}<p class="rt-toast-title">Connected</p><p class="rt-toast-text">Voice and text switch automatically with the room.</p><button class="rt-x" type="button" aria-label="Dismiss">${icon('close')}</button></div>`;
   panel.append(scroll,parts.foot.cloneNode(true));
  }
  return panel;
 }
 function render(host,theme,opts){
  let root=host.shadowRoot;if(!root){root=host.attachShadow({mode:'open'});const s=styles();if(s)root.adoptedStyleSheets=[s];else{const st=document.createElement('style');st.textContent=UI.css+PREVIEW_CSS;root.append(st);}}
  for(const n of [...root.childNodes])if(n.nodeName!=='STYLE')n.remove();
  root.append(panelFor(theme,opts));host.inert=true;
 }

 // ── Cards ─────────────────────────────────────────────────────────────────
 let applied=T.current(),selected=applied,touched=false;
 const cards=new Map();
 for(const theme of T.themes){
  const [name,,light]=T.info[theme];
  const card=document.createElement('div');card.className='tg-card';card.dataset.theme=theme;card.setAttribute('role','radio');
  const shot=document.createElement('div');shot.className='tg-shot';const host=document.createElement('div');host.className='tg-host';host.dataset.card='';shot.append(host);
  const meta=document.createElement('div');meta.className='tg-meta';
  const logo=document.createElement('img');logo.className='tg-logo';logo.alt='';logo.src='ui/logos/'+theme+'.png';if(PIXEL.has(theme))logo.style.imageRendering='pixelated';
  const title=document.createElement('span');title.className='tg-name';title.textContent=name;
  const badge=document.createElement('span');badge.className='tg-badge';badge.textContent='In use';
  meta.append(logo,title);if(light){const tag=document.createElement('span');tag.className='tg-tag';tag.textContent='Light';meta.append(tag);}meta.append(badge);
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
 function refresh(){
  for(const [theme,card] of cards){
   const on=theme===selected,[name,,light]=T.info[theme];
   card.setAttribute('aria-checked',String(on));card.tabIndex=on?0:-1;card.dataset.applied=String(theme===applied);
   card.setAttribute('aria-label',name+(light?', light theme':'')+(theme===applied?', in use':''));
  }
  const [name,desc,light]=T.info[selected];
  $('tgName').textContent=name;$('tgDesc').textContent=desc+(light?' Light theme.':'');
  const logo=$('tgLogo');logo.src='ui/logos/'+selected+'.png';logo.style.imageRendering=PIXEL.has(selected)?'pixelated':'';
  const same=selected===applied;apply.disabled=same;
  apply.querySelector('.lbl').textContent=same?'In use':'Apply '+name;
  state.textContent=same?'This is the theme every Tyler window uses now.':'Previewing '+name+'. Nothing changes until you press Apply.';
 }
 function select(theme,focus=false){
  if(!T.themes.includes(theme))return;if(focus)touched=true;selected=theme;render(stageHost,theme,{card:false});refresh();
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

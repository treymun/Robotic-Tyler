// The panel's size and place (v2.23).
//  - Resize: drag the panel's left edge, top edge or top-left corner (or focus a handle and use the
//    arrow keys; double-click or Home puts it back). The size is kept.
//  - Desktop app: docked beside Steam by default. The panel is a full-height column on the right and
//    Steam's chat moves over to make room, so the panel never covers the chat, the message box or the
//    member list. The button next to Collapse floats it over the chat instead (and back). Chrome
//    floats as before (its header has no room for another button in every theme).
//    Steam's page is narrowed by making <body> the box its full-window layout is measured against
//    (the panel itself lives outside <body>, on <html>), through element.style so a strict page
//    policy can't block it. Collapsing the panel, or a window too
//    narrow for both, gives Steam the whole width back.
(() => {
 'use strict';
 const api=globalThis.TylerCompanion,ui=api?.ui;
 if(!ui||globalThis.TylerPanelLayout)return;
 const {root,panel,host}=ui;
 const desktop=(api.platform||globalThis.TylerPlatform||{}).id==='desktop';
 const MIN_W=340,MIN_H=420,MAX_W=760,DOCK_W=440,DOCK_MAX=640,STEAM_MIN=560,STEP=16;
 // w/h: the floating size (0 = the default 392 × min(760, 90% of the window)); dock: 'side' or 'float'.
 let layout={w:0,h:0,dock:desktop?'side':'float',dockW:DOCK_W};
 const vw=()=>document.documentElement.clientWidth||innerWidth,vh=()=>innerHeight;
 const clampW=w=>Math.round(Math.max(MIN_W,Math.min(w,MAX_W,vw()-24)));
 const clampH=h=>Math.round(Math.max(MIN_H,Math.min(h,vh()-24)));
 const clampDock=w=>Math.round(Math.max(MIN_W,Math.min(w,DOCK_MAX,vw()-STEAM_MIN)));
 const mini=()=>host.classList.contains('mini');
 const docked=()=>layout.dock==='side'&&!mini()&&vw()-MIN_W>=STEAM_MIN;

 // Steam's page, narrowed while docked. Set through the CSSOM (element.style), which a strict page
 // policy allows, unlike a <style> element; the page's own inline values come back when undocked.
 const PAGE=w=>({'box-sizing':'border-box',width:'calc(100% - '+w+'px)','max-width':'calc(100% - '+w+'px)','min-width':'0px',height:'100vh',margin:'0px',overflow:'hidden',transform:'translateZ(0)'});
 let saved=null;
 function page(w){const b=document.body,h=document.documentElement;if(!b)return;
  if(w){if(!saved){saved={body:{},html:[h.style.getPropertyValue('overflow'),h.style.getPropertyPriority('overflow')]};for(const k of Object.keys(PAGE(0)))saved.body[k]=[b.style.getPropertyValue(k),b.style.getPropertyPriority(k)];}
   for(const [k,v] of Object.entries(PAGE(w)))b.style.setProperty(k,v,'important');h.style.setProperty('overflow','hidden','important');}
  else if(saved){for(const [k,[v,pr]] of Object.entries(saved.body)){if(v)b.style.setProperty(k,v,pr);else b.style.removeProperty(k);}const [v,pr]=saved.html;if(v)h.style.setProperty('overflow',v,pr);else h.style.removeProperty('overflow');saved=null;}}

 // Handles and the dock button (outside panel.html, so the theme gallery's previews don't get them).
 const handle=(edge,label)=>{const h=document.createElement('div');h.className='rt-resize rt-resize-'+edge;h.dataset.edge=edge;h.tabIndex=0;h.setAttribute('role','separator');h.setAttribute('aria-label',label);h.setAttribute('data-tip',label+' · drag, or arrow keys · double-click resets');panel.append(h);return h;};
 const handles=[handle('w','Resize the panel\'s width'),handle('h','Resize the panel\'s height'),handle('c','Resize the panel')];
 handles[0].setAttribute('aria-orientation','vertical');handles[1].setAttribute('aria-orientation','horizontal');
 const dockBtn=document.createElement('button');dockBtn.id='dock';dockBtn.type='button';dockBtn.className='icon-btn';
 if(desktop)root.getElementById('collapse')?.before(dockBtn);
 const ICON_SIDE='<svg viewBox="0 0 16 16" aria-hidden="true"><rect x="2" y="3" width="12" height="10" rx="1.5" fill="none" stroke="currentColor" stroke-width="1.4"/><path d="M10 3.6v8.8" stroke="currentColor" stroke-width="1.4"/><path d="M10.6 4.2h2.7v7.6h-2.7z" fill="currentColor" opacity=".55"/></svg>';
 const ICON_FLOAT='<svg viewBox="0 0 16 16" aria-hidden="true"><rect x="2" y="3" width="12" height="10" rx="1.5" fill="none" stroke="currentColor" stroke-width="1.4"/><rect x="8" y="7" width="4.5" height="4.5" rx="1" fill="currentColor" opacity=".7"/></svg>';

 let frame=0;
 function apply(){
  cancelAnimationFrame(frame);frame=0;
  const side=docked();host.dataset.dock=side?'side':'float';
  if(side){const w=clampDock(layout.dockW);host.style.setProperty('--rt-dock-w',w+'px');page(w);}
  else page(0);
  if(layout.w)host.style.setProperty('--rt-panel-w',clampW(layout.w)+'px');else host.style.removeProperty('--rt-panel-w');
  if(layout.h)host.style.setProperty('--rt-panel-h',clampH(layout.h)+'px');else host.style.removeProperty('--rt-panel-h');
  const r=panel.getBoundingClientRect();
  handles[0].setAttribute('aria-valuenow',String(Math.round(r.width)));handles[1].setAttribute('aria-valuenow',String(Math.round(r.height)));
  const wantSide=layout.dock==='side';
  dockBtn.innerHTML=wantSide?ICON_FLOAT:ICON_SIDE;
  const label=wantSide?'Float over Steam':'Dock beside Steam';
  dockBtn.setAttribute('aria-label',label);dockBtn.setAttribute('aria-pressed',String(wantSide));
  dockBtn.setAttribute('data-tip',wantSide?(side?'Float over Steam: the panel goes back to a window over the chat':'Docked beside Steam when there is room · click to float'):'Dock beside Steam: a column on the right, so the panel never covers the chat');
 }
 const soon=()=>{if(!frame)frame=requestAnimationFrame(apply);};
 let saveTimer=0;
 const save=()=>{clearTimeout(saveTimer);saveTimer=setTimeout(()=>{void globalThis.TylerStorage?.set?.({panelLayout:{...layout}}).catch(()=>{});},300);};

 // Dragging: the panel is pinned to the bottom-right (or the right edge when docked), so moving the
 // left edge left makes it wider and moving the top edge up makes it taller.
 for(const h of handles){
  h.addEventListener('pointerdown',e=>{if(e.button!==0)return;e.preventDefault();h.setPointerCapture(e.pointerId);
   const r=panel.getBoundingClientRect(),x0=e.clientX,y0=e.clientY,w0=r.width,h0=r.height,edge=h.dataset.edge,side=docked();host.classList.add('resizing');
   const move=ev=>{const dx=x0-ev.clientX,dy=y0-ev.clientY;
    if(side){if(edge!=='h')layout.dockW=clampDock(w0+dx);}
    else{if(edge!=='h')layout.w=clampW(w0+dx);if(edge!=='w')layout.h=clampH(h0+dy);}soon();};
   const up=()=>{h.removeEventListener('pointermove',move);h.removeEventListener('pointerup',up);h.removeEventListener('pointercancel',up);host.classList.remove('resizing');apply();save();};
   h.addEventListener('pointermove',move);h.addEventListener('pointerup',up);h.addEventListener('pointercancel',up);});
  h.addEventListener('dblclick',()=>reset(h.dataset.edge));
  h.addEventListener('keydown',e=>{const step=e.shiftKey?STEP*4:STEP,edge=h.dataset.edge,side=docked(),r=panel.getBoundingClientRect();let done=true;
   if(e.key==='Home')reset(edge);
   else if((e.key==='ArrowLeft'||e.key==='ArrowRight')&&edge!=='h'){const d=e.key==='ArrowLeft'?step:-step;if(side)layout.dockW=clampDock(r.width+d);else layout.w=clampW(r.width+d);}
   else if((e.key==='ArrowUp'||e.key==='ArrowDown')&&edge!=='w'&&!side){layout.h=clampH(r.height+(e.key==='ArrowUp'?step:-step));}
   else done=false;
   if(done){e.preventDefault();e.stopPropagation();apply();save();}});
 }
 function reset(edge){if(docked()){layout.dockW=DOCK_W;}else{if(edge!=='h')layout.w=0;if(edge!=='w')layout.h=0;}apply();save();}
 dockBtn.onclick=()=>{layout.dock=layout.dock==='side'?'float':'side';apply();save();};

 addEventListener('resize',soon);
 ui.onUI(type=>{if(type==='mini')apply();});
 globalThis.TylerStorage?.get?.(['panelLayout']).then(r=>{const v=r?.panelLayout;if(v&&typeof v==='object'){
   layout={w:Number(v.w)>0?Number(v.w):0,h:Number(v.h)>0?Number(v.h):0,dock:v.dock==='side'||v.dock==='float'?v.dock:layout.dock,dockW:Number(v.dockW)>0?Number(v.dockW):DOCK_W};}apply();}).catch(()=>apply());
 apply();
 globalThis.TylerPanelLayout=Object.freeze({get:()=>({...layout,docked:docked()}),dock:on=>{layout.dock=on?'side':'float';apply();save();}});
})();

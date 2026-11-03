// ROBOTIC TYLER dialogs, notifications and tooltips (v2.14).
// One component for every Tyler window: the chat panel (inside its shadow root),
// the settings page and the Voice Studio. Messages are built inside the themed
// window, so they pick up the current theme automatically (ui/kit.css + the
// theme files). Text is always set with textContent, never parsed as HTML.
//
//   const kit=TylerKit.attach(container,{fixed:false});
//   kit.toast({kind:'error',title:'Couldn't save',text:'…',action:{label:'Try again',run:()=>save()}});
//   await kit.dialog({title:'Emergency stop?',text:'…',confirm:'Stop everything',danger:true});  // → true/false
//   kit.tips(root);   // themed tooltips for [data-tip] controls under root
(()=>{
 'use strict';if(globalThis.TylerKit)return;
 const ICON={info:'info',success:'success',warning:'warning',error:'error'};
 const svg=name=>globalThis.TylerIcons?.svg?.(name)||'';
 const el=(tag,cls,text)=>{const e=document.createElement(tag);if(cls)e.className=cls;if(text!=null)e.textContent=String(text);return e;};
 const icon=name=>{const t=document.createElement('template');t.innerHTML=svg(name);return t.content.firstElementChild||el('span');};
 let serial=0;const num=()=>String(++serial%100).padStart(2,'0');

 function attach(container,{fixed=false}={}){
  const doc=container.ownerDocument||document;
  const layer=el('div','rt-layer'+(fixed?' rt-fixed':''));layer.setAttribute('data-rt-kit','');
  const stack=el('div','rt-toasts');layer.append(stack);container.append(layer);
  const rootNode=()=>container.getRootNode?.()||doc;
  const active=()=>{const r=rootNode();return r.activeElement||doc.activeElement;};
  const recent=new Map();

  // ── Notifications ────────────────────────────────────────────────────────
  function toast({kind='info',title='',text='',action=null,timeout}={}){
   const key=kind+'|'+title+'|'+text,now=Date.now();
   const old=recent.get(key);if(old&&old.node.isConnected&&now-old.at<20000)return old.api;
   const node=el('div','rt-toast');node.dataset.kind=ICON[kind]?kind:'info';node.dataset.n=num();
   node.setAttribute('role',kind==='error'?'alert':'status');
   node.append(icon(ICON[kind]||'info'));
   if(title)node.append(el('p','rt-toast-title',title));
   if(text)node.append(el('p','rt-toast-text',text));
   let timer=null;
   const close=()=>{if(!node.isConnected)return;clearTimeout(timer);node.classList.add('rt-leaving');setTimeout(()=>node.remove(),170);};
   if(action?.label){const row=el('div','rt-toast-actions'),b=el('button','btn sm'+(kind==='error'?' primary':''),action.label);b.type='button';
    b.onclick=()=>{close();try{action.run?.();}catch{}};row.append(b);node.append(row);}
   const x=el('button','rt-x');x.type='button';x.setAttribute('aria-label','Dismiss');x.append(icon('close'));x.onclick=close;node.append(x);
   const life=timeout??(kind==='error'?14000:kind==='warning'?9000:5000);
   const arm=()=>{clearTimeout(timer);if(life>0)timer=setTimeout(close,life);};
   node.addEventListener('pointerenter',()=>clearTimeout(timer));node.addEventListener('pointerleave',arm);
   node.addEventListener('focusin',()=>clearTimeout(timer));node.addEventListener('focusout',arm);
   while(stack.children.length>=3)stack.firstElementChild.remove();
   stack.append(node);arm();
   const api={close,node};recent.set(key,{at:now,node,api});return api;
  }

  // ── Dialogs ──────────────────────────────────────────────────────────────
  // Confirmation/error dialog. Focus starts on the safe choice for destructive
  // actions, otherwise on the main action; Tab stays inside; Esc cancels; focus
  // returns to where it was.
  function dialog({kind,title='',text='',steps=null,confirm='OK',cancel='Cancel',danger=false,icon:iconName}={}){
   return new Promise(resolve=>{
    const before=active(),k=kind||(danger?'warning':'info');
    const scrim=el('div','rt-scrim'),box=el('div','rt-dialog');box.dataset.kind=k;box.dataset.n=num();
    const id='rt-d'+Math.random().toString(36).slice(2,8);
    box.setAttribute('role','alertdialog');box.setAttribute('aria-modal','true');box.setAttribute('aria-labelledby',id+'-t');box.setAttribute('aria-describedby',id+'-x');
    const head=el('div','rt-dialog-head');head.append(icon(iconName||ICON[k]||'info'));const h=el('h2','rt-dialog-title',title);h.id=id+'-t';head.append(h);box.append(head);
    const p=el('p','rt-dialog-text',text);p.id=id+'-x';box.append(p);
    if(Array.isArray(steps)&&steps.length){const ol=el('ol','rt-steps');for(const s of steps)ol.append(el('li','',s));box.append(ol);}
    const row=el('div','rt-dialog-actions');
    const no=cancel?el('button','btn secondary',cancel):null,yes=el('button','btn '+(danger?'danger':'primary'),confirm);
    if(no){no.type='button';row.append(no);}yes.type='button';row.append(yes);box.append(row);
    // Everything else in the window is inert while the dialog is open.
    const siblings=[...container.children].filter(c=>c!==layer&&!c.inert);
    for(const s of siblings)s.inert=true;
    scrim.append(box);layer.append(scrim);
    const focusables=()=>[...box.querySelectorAll('button,[href],input,select,textarea,[tabindex]:not([tabindex="-1"])')].filter(n=>!n.disabled);
    const done=value=>{scrim.remove();for(const s of siblings)s.inert=false;doc.removeEventListener('keydown',keys,true);
     try{if(before?.isConnected)before.focus({preventScroll:true});}catch{}resolve(value);};
    const keys=e=>{
     if(!scrim.isConnected)return;
     if(e.key==='Escape'){e.preventDefault();e.stopPropagation();done(false);return;}
     if(e.key==='Tab'){const f=focusables();if(!f.length)return;const i=f.indexOf(active());
      if(e.shiftKey&&(i<=0)){e.preventDefault();f[f.length-1].focus();}else if(!e.shiftKey&&i===f.length-1){e.preventDefault();f[0].focus();}else if(i<0){e.preventDefault();f[0].focus();}}
    };
    doc.addEventListener('keydown',keys,true);
    yes.onclick=()=>done(true);if(no)no.onclick=()=>done(false);
    scrim.addEventListener('mousedown',e=>{if(e.target===scrim&&cancel)done(false);});
    requestAnimationFrame(()=>((danger&&no)?no:yes).focus());
   });
  }
  const alertBox=opts=>dialog({cancel:null,confirm:'OK',...opts});

  // ── Tooltips ─────────────────────────────────────────────────────────────
  function tips(scope=container){
   let tip=null,timer=null,target=null;
   const hide=()=>{clearTimeout(timer);if(target){target.removeAttribute('aria-describedby');target=null;}tip?.remove();tip=null;};
   const show=t=>{
    hide();const text=t.getAttribute('data-tip');if(!text)return;target=t;
    tip=el('div','rt-tip',text);tip.id='rt-tip-'+num();tip.setAttribute('role','tooltip');layer.append(tip);
    if(text!==t.getAttribute('aria-label'))t.setAttribute('aria-describedby',tip.id);
    const r=t.getBoundingClientRect(),base=fixed?{left:0,top:0,width:innerWidth,height:innerHeight}:layer.getBoundingClientRect(),w=tip.offsetWidth,h=tip.offsetHeight;
    let left=r.left-base.left+r.width/2-w/2,top=r.top-base.top-h-6;if(top<4)top=r.bottom-base.top+6;
    left=Math.max(4,Math.min(left,base.width-w-4));tip.style.left=left+'px';tip.style.top=top+'px';
   };
   const find=e=>e.composedPath?.().find(n=>n?.getAttribute?.('data-tip'))||e.target.closest?.('[data-tip]');
   scope.addEventListener('pointerover',e=>{const t=find(e);if(!t||t===target)return;clearTimeout(timer);timer=setTimeout(()=>show(t),450);});
   scope.addEventListener('pointerout',e=>{const t=find(e);if(t&&!t.contains(e.relatedTarget))hide();});
   scope.addEventListener('focusin',e=>{const t=find(e);if(t&&t.matches(':focus-visible'))show(t);});
   scope.addEventListener('focusout',hide);
   scope.addEventListener('keydown',e=>{if(e.key==='Escape'&&tip)hide();},true);
   scope.addEventListener('scroll',hide,true);
   return {hide};
  }
  return Object.freeze({toast,dialog,alert:alertBox,tips,layer});
 }

 // Pages (settings, Voice Studio) share one overlay on <body>.
 let page=null;
 const forPage=()=>{if(!page&&document.body){page=attach(document.body,{fixed:true});page.tips(document);}return page;};
 globalThis.TylerKit=Object.freeze({attach,page:forPage});
})();

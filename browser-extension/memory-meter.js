// Tyler's memory meter (v2.45, desktop app): puts one reading into the meter's markup (#memMeter in
// ui/panel.html). The text comes from the app (app/memory-meter.cjs view()); this only puts it in place, the
// same way in Tyler's panel (content.js) and on the phone remote (app/remote/remote.js). The skinning
// contract (every class, data attribute and CSS variable set here) is at the top of ui/memory-meter.css.
// Text only: nothing here is read as HTML.
(() => {
 'use strict';
 if(globalThis.TylerMemoryMeter)return;
 const LEVELS=['ok','high','full'],PARTS=['app','text','voices','speech','images','other'];
 const frac=v=>String(Math.max(0,Math.min(1,Number(v)||0)));
 const text=(el,value)=>{if(el){const t=String(value??'');if(el.textContent!==t)el.textContent=t;}};
 function gauge(g,d){
  if(!g||!d)return;
  g.dataset.level=LEVELS.includes(d.level)?d.level:'ok';g.dataset.missing=String(d.missing===true);
  g.style.setProperty('--fill',frac(d.fill));g.style.setProperty('--own',frac(d.ownFill));
  g.setAttribute('data-tip',String(d.tip||''));g.setAttribute('aria-label',String(d.tip||''));
  const q=c=>g.querySelector('.tyler-mem-'+c);
  text(q('label'),d.label);text(q('used'),d.used);text(q('sep'),d.total?'/':'');text(q('total'),d.total);text(q('unit'),d.unit);
  text(q('own-value'),d.ownValue);text(q('pct'),d.pct);text(q('card'),d.card);
 }
 /** Shows `view` in the meter `section` (or, with no view, its "wait" state). */
 function render(section,view){
  if(!section)return;
  if(!view){section.dataset.state='wait';return;}
  section.dataset.state='on';
  gauge(section.querySelector('.tyler-mem-ram'),view.ram);gauge(section.querySelector('.tyler-mem-vram'),view.vram);
  const list=section.querySelector('.tyler-mem-list');if(!list)return;
  for(const li of list.querySelectorAll('.tyler-mem-item:not(.tyler-mem-head)'))li.remove();
  for(const p of (Array.isArray(view.parts)?view.parts:[]).filter(p=>PARTS.includes(p?.id))){
   const li=document.createElement('li');li.className='tyler-mem-item';li.dataset.part=p.id;li.dataset.running=String(p.running!==false);
   li.style.setProperty('--ram',frac(p.ramFill));li.style.setProperty('--vram',frac(p.vramFill));
   for(const [cls,value] of [['label',p.label],['ram',p.ram],['vram',p.vram]]){const c=document.createElement('span');c.className='tyler-mem-item-'+cls;c.textContent=String(value??'');li.append(c);}
   list.append(li);
  }
 }
 globalThis.TylerMemoryMeter=Object.freeze({render});
})();

// Settings → Chat images (v2.34): the six styles and their models, the limits, who can ask, and
// the Venice key. Saved as imageGen (plain settings) and veniceKey (a key: written here, never shown
// again, never sent to the Steam page). Works in Chrome and in the desktop app's settings window.
(() => {
 'use strict';
 const I=globalThis.TylerImages,store=globalThis.tylerSettings?.storage?.local||globalThis.chrome?.storage?.local,root=document.getElementById('imageSheet');
 if(!I||!store||!root)return;
 const $=id=>document.getElementById(id),status=t=>{$('imgStatus').textContent=t;},desktop=document.body?.dataset?.desktop==='true';
 const time=s=>s===0?'No wait':s<60?s+' seconds':s/60+(s===60?' minute':' minutes');
 const count=n=>n===0?'No limit':String(n);
 const fill=(id,values,label)=>{$(id).replaceChildren(...values.map(v=>{const o=document.createElement('option');o.value=String(v);o.textContent=label(v);return o;}));};
 fill('imgCooldown',I.COOLDOWNS,time);fill('imgPerPerson',I.PER_PERSON,count);fill('imgPerSession',I.PER_SESSION,count);
 fill('imgDefault',Object.keys(I.STYLES),k=>I.STYLES[k].label+' · '+I.STYLES[k].about);
 // v2.40: in Chrome, This PC can't be the default style (it's a desktop-app feature).
 if(!desktop)for(const o of $('imgDefault').options)if(I.STYLES[o.value]?.provider==='local'){o.disabled=true;o.textContent=I.STYLES[o.value].label+' · desktop app only';}
 // One row per style: on/off, its model (the list for its provider), and the published price.
 const rows=$('imgStyles');
 for(const [key,s] of Object.entries(I.STYLES)){
  const row=document.createElement('div');row.className='image-style';row.dataset.style=key;
  const on=document.createElement('label');on.className='toggle';on.innerHTML='<input type="checkbox"><span><b></b><small></small></span>';
  on.querySelector('b').textContent=s.label+(s.provider==='venice'?' (Venice key)':s.provider==='local'?' (desktop app, no key)':' (OpenRouter key)');on.querySelector('small').textContent=s.about;
  // v2.40: This PC has no model list here: the model is chosen in On this PC → Images on this PC.
  if(s.provider==='local'){
   const note=document.createElement('small');note.className='hint';
   if(desktop){note.append('The model is the one chosen in ');const a=document.createElement('a');a.href='#localImages';a.textContent='On this PC → Images on this PC';
    a.onclick=e=>{e.preventDefault();window.dispatchEvent(new Event('tyler:local-images-setup'));};note.append(a,'. Friends can use it only when you allow it there; your own Draw box in the panel always can.');}
   else{note.textContent='Images on this PC are part of the ROBOTIC TYLER desktop app; in Chrome this style can’t be used.';on.querySelector('input').disabled=true;}
   row.append(on,note);rows.append(row);continue;
  }
  const pick=document.createElement('select');pick.setAttribute('aria-label',s.label+' model');
  for(const m of I.MODELS[s.provider]){const o=document.createElement('option');o.value=m.id;o.textContent=m.name+' · '+m.price+(m.styles.includes(key)?'':' (another tier)');pick.append(o);}
  const price=document.createElement('small');price.className='hint';
  pick.onchange=()=>{price.textContent='Model id: '+pick.value+' · '+I.price(key,pick.value)+' per 1024×1024 picture';};
  row.append(on,pick,price);rows.append(row);
 }
 const styleRow=k=>rows.querySelector('[data-style="'+k+'"]');
 function show(cfg,veniceSaved){
  $('imgEnabled').checked=cfg.enabled;$('imgDefault').value=cfg.defaultStyle;$('imgSpoiler').checked=cfg.spoilerVenice;
  $('imgCooldown').value=String(cfg.cooldownSec);$('imgPerPerson').value=String(cfg.perPerson);$('imgPerSession').value=String(cfg.perSession);
  $('imgAccess').value=cfg.access;$('imgAllowed').value=cfg.allowedIDs;
  // In Chrome, This PC always shows (and saves) as off: it can't be used there.
  for(const k of Object.keys(I.STYLES)){const r=styleRow(k);r.querySelector('input').checked=cfg.styles[k]&&(desktop||I.STYLES[k].provider!=='local');const sel=r.querySelector('select');if(!sel)continue;
   if(![...sel.options].some(o=>o.value===cfg.models[k])){const o=document.createElement('option');o.value=cfg.models[k];o.textContent=cfg.models[k]+' (your own choice)';sel.append(o);}
   sel.value=cfg.models[k];sel.onchange();}
  $('veniceKey').placeholder=veniceSaved?'Venice key saved · paste a new one to replace it':'Paste a Venice API key';$('imgForgetVenice').disabled=!veniceSaved;
  status((cfg.enabled?'Chat images are on.':'Chat images are off.')+' Venice key '+(veniceSaved?'saved':'not saved')+'.');
 }
 async function load(){try{const v=await store.get(['imageGen','veniceKey']);show(I.config(v?.imageGen),!!v?.veniceKey);}catch(e){status('Couldn’t load: '+(e.message||e));}}
 function read(){
  const styles={},models={};for(const k of Object.keys(I.STYLES)){const r=styleRow(k);styles[k]=r.querySelector('input').checked;models[k]=r.querySelector('select')?.value||'';}
  return I.config({enabled:$('imgEnabled').checked,defaultStyle:$('imgDefault').value,spoilerVenice:$('imgSpoiler').checked,cooldownSec:Number($('imgCooldown').value),perPerson:Number($('imgPerPerson').value),perSession:Number($('imgPerSession').value),access:$('imgAccess').value,allowedIDs:$('imgAllowed').value,styles,models});
 }
 let dirty=false;root.addEventListener('input',()=>{dirty=true;});root.addEventListener('change',()=>{dirty=true;});
 async function save(){
  try{
   const cfg=read(),values={imageGen:cfg},key=$('veniceKey').value.trim();
   if(key){if(!/^[A-Za-z0-9_\-.]{16,200}$/.test(key))throw Error('That doesn’t look like a Venice API key. Copy it again from venice.ai/settings/api.');values.veniceKey=key;}
   if(!cfg.styles[cfg.defaultStyle])throw Error('Turn on the default style, or pick another default.');
   if(cfg.access==='selected'&&!cfg.allowedIDs)throw Error('Add at least one Steam account, or let everyone ask.');
   await store.set(values);$('veniceKey').value='';
   const back=await store.get(['imageGen','veniceKey']);if(JSON.stringify(I.config(back?.imageGen))!==JSON.stringify(cfg))throw Error('The settings didn’t save. Try again.');
   show(cfg,!!back?.veniceKey);status('Saved. '+(cfg.enabled?'Friends can use !image now (Tyler picks it up within 30 seconds).':'Chat images are off.')+(Object.keys(I.STYLES).some(k=>k.startsWith('v')&&cfg.styles[k])&&!back?.veniceKey?' The Venice styles need a Venice key.':''));
   dirty=false;globalThis.TylerKit?.page()?.toast({kind:'success',title:'Image settings saved',text:''});
  }catch(e){status(String(e.message||e));}
 }
 $('imgSave').onclick=()=>void save();
 // The page's own Save settings button saves this card too, and Remove saved API keys removes the Venice key.
 document.getElementById('save')?.addEventListener('click',()=>{if(dirty)void save();});
 document.getElementById('clear')?.addEventListener('click',()=>{setTimeout(()=>void load(),400);});
 $('imgForgetVenice').onclick=async()=>{try{await store.remove(['veniceKey']);await load();status('Venice key removed.');}catch(e){status(String(e.message||e));}};
 void load();
})();

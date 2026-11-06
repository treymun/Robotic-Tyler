// Settings on the phone remote (v2.41). The desktop app's own Settings page (app/companion/phone-settings.html,
// built from browser-extension/settings.html), served to a paired phone by app/remote.cjs at /settings/.
// On the PC the page talks to the app only through window.tylerSettings (app/options-preload.cjs); this
// file is that bridge for the phone, loaded before the page's own scripts.
//  - storage.local get/set/remove go to the remote server (/settings/get, /set, /remove), which allows a
//    fixed list of settings (app/guards.cjs), checks them as the PC does and saves them in the same place.
//    A saved API key shows only as "saved" (true); keys can't be set or removed from here.
//  - Only values that changed since the page loaded them are sent, so a Save here never puts back what
//    was changed on the PC in the meantime. The page's unsaved edits (settingsDraft) stay on this phone.
//  - Everything else the page can do on the PC (pairing phones, installs, tests that use your keys or play
//    on the PC, the activity log, settings files) is refused, and its buttons say "Do this on your PC"
//    (PC_ONLY below). Nothing is kept on the phone but the pairing cookie and the unsaved edits.
(() => {
 'use strict';
 const H={'content-type':'application/json','x-tyler-remote':'1'};
 const SECRET=new Set(['openrouterKey','geminiKey','veniceKey','speechKey']);
 const DRAFT='settingsDraft',DRAFT_KEY='tylerPhoneDraft';
 const KEYS_ON_PC='API keys are added, changed and removed in Settings on your PC, not from the phone.';
 const loaded=new Map(); // setting → the value (as JSON) the page last got from the PC
 const keySaved={}; // API key → saved on the PC (true/false); never the key itself
 const json=v=>v===undefined?'undefined':JSON.stringify(v);
 const toast=(kind,title,text='')=>{try{globalThis.TylerKit?.page()?.toast({kind,title,text});}catch{}};
 const onPc=what=>Error('Do this on your PC: '+what);

 // ── Talking to the PC ────────────────────────────────────────────────────
 let gone=false;
 async function call(path,payload){
  let r;try{r=await fetch(path,{method:'POST',headers:H,body:JSON.stringify(payload),cache:'no-store',signal:AbortSignal.timeout(15000)});}
  catch(e){throw Error(e?.name==='TimeoutError'?'Your PC didn’t answer in time.':'Your PC isn’t reachable. Check that this phone is on the same network.');}
  const j=await r.json().catch(()=>({}));
  if(r.status===401){if(!gone){gone=true;toast('error','This phone isn’t paired any more','Pair it again from the remote.');setTimeout(()=>location.replace('/'),1500);}throw Error('Pair this phone first.');}
  if(!r.ok)throw Error(j.error||'Your PC couldn’t do that.');
  return j;
 }
 const draft={get(){try{return JSON.parse(sessionStorage.getItem(DRAFT_KEY)||'null')||undefined;}catch{return undefined;}},
  set(v){try{sessionStorage.setItem(DRAFT_KEY,JSON.stringify(v));}catch{}},remove(){try{sessionStorage.removeItem(DRAFT_KEY);}catch{}}};
 const names=keys=>keys==null?[]:typeof keys==='string'?[keys]:Array.isArray(keys)?keys.map(String):typeof keys==='object'?Object.keys(keys):[];
 // The page asks for settings from many scripts at once; one request answers them all.
 let batch=null;
 function fetchKeys(list){
  if(!batch){const b=batch={keys:new Set()};b.done=new Promise(r=>setTimeout(r,12)).then(()=>{batch=null;return call('/settings/get',{keys:[...b.keys]});});}
  for(const k of list)batch.keys.add(k);
  return batch.done;
 }
 async function get(keys){
  const list=names(keys),defaults=keys&&typeof keys==='object'&&!Array.isArray(keys)?keys:{},remote=list.filter(k=>k!==DRAFT&&k!=='speechKey');
  const out={};
  if(remote.length){const {values={}}=await fetchKeys(remote);
   for(const k of remote){if(SECRET.has(k)){keySaved[k]=values[k]===true;if(keySaved[k])out[k]=true;continue;}loaded.set(k,json(values[k]));if(values[k]!==undefined)out[k]=values[k];}
   showKeys();}
  if(list.includes(DRAFT)){const d=draft.get();if(d)out[DRAFT]=d;}
  for(const [k,v] of Object.entries(defaults))if(out[k]===undefined)out[k]=v;
  return out;
 }
 async function set(values){
  if(!values||typeof values!=='object'||Array.isArray(values))throw Error('Invalid settings');
  if(Object.keys(values).some(k=>SECRET.has(k)))throw Error(KEYS_ON_PC);
  if(Object.hasOwn(values,DRAFT))draft.set(values[DRAFT]);
  const send={};for(const [k,v] of Object.entries(values))if(k!==DRAFT&&!(loaded.has(k)&&loaded.get(k)===json(v)))send[k]=v;
  if(!Object.keys(send).length)return;
  const r=await call('/settings/set',{values:send});
  for(const k of Object.keys(send))loaded.set(k,json(send[k]));
  if(r.dropped?.length)console.info('[Tyler phone settings] changed on the PC only:',r.dropped.join(', '));
 }
 async function remove(keys){
  const list=names(keys);if(list.some(k=>SECRET.has(k)))throw Error(KEYS_ON_PC);
  if(list.includes(DRAFT))draft.remove();
  const rest=list.filter(k=>k!==DRAFT);if(rest.length){await call('/settings/remove',{keys:rest});for(const k of rest)loaded.delete(k);}
 }
 // The PC's theme, for the page to follow while it's open (the remote page does the same live).
 const themeFns=new Set();let themeNow='';
 async function watchTheme(){
  if(document.visibilityState!=='visible')return;
  try{const w=await (await fetch('/whoami',{cache:'no-store'})).json();if(w.paired===false&&!gone){gone=true;location.replace('/');return;}
   if(w.theme&&themeNow&&w.theme!==themeNow)for(const fn of themeFns){try{fn(w.theme);}catch{}}if(w.theme)themeNow=w.theme;}catch{}
 }
 setInterval(watchTheme,8000);document.addEventListener('visibilitychange',()=>void watchTheme());

 const refuse=what=>()=>Promise.reject(onPc(what));
 window.tylerSettings=Object.freeze({
  phone:true,
  storage:Object.freeze({local:Object.freeze({get,set,remove})}),
  // Refused: opening Steam chat, verifying a key, the activity log, the model test and reply preview (they
  // use the saved keys, and cost a little), and the voice test, devices and test tone (they run on the PC).
  tabs:Object.freeze({create:async()=>{toast('info','Steam chat is on your PC','Press Connect & start in the remote to start Tyler there.');}}),
  verifyKey:refuse('add or change API keys there.'),
  activity:refuse('the activity log is in Settings on the PC.'),
  ai:refuse('the model test and reply preview use your saved key.'),
  voice:Object.freeze({devices:refuse('the PC lists its audio devices.'),tone:refuse('the test tone plays there.'),test:refuse('the voice test plays there.')}),
  onTheme:fn=>{if(typeof fn==='function'){themeFns.add(fn);void watchTheme();}},
  // remote, voices, localAI and localImages aren't here: their sections say they're on the PC.
 });

 // ── The page on a phone ───────────────────────────────────────────────────
 // [section, what to hide in it ('' = everything but its heading), the note shown instead, after what]
 const PC_ONLY=[
  ['#phoneRemote','','Phones are paired and removed in Settings on your PC (Overview → Phone remote). This phone stays paired until you remove it there or unpair it in the remote.'],
  ['#playground','','Do this on your PC: Preview a reply uses your saved key there.'],
  ['#voiceTestSheet','','Do this on your PC: the voice test plays there.'],
  ['#theme-voices','','Theme voices are installed and set up in Settings on your PC. Pick a theme’s character voice in the remote’s Theme voice card.'],
  ['#localAI','','Text replies, hearing and the voice, and pictures on this PC are installed and set up in Settings on your PC (On this PC). Choosing them for Tyler works from here: AI & personality, Voice and Chat images.'],
  ['#voiceDevices','.grid.two,.actions,#voiceDeviceState','Do this on your PC: it lists its audio devices and plays the test tone. The cable route uses the devices chosen there.','.sheet-head'],
  ['#v22Tools','#v22Backup,#v22Import','Settings files are exported and imported on your PC.','.v22-actions'],
 ];
 function note(text,cls='phone-note'){const p=document.createElement('p');p.className='usage-banner '+cls;p.setAttribute('role','note');p.textContent=text;return p;}
 // Whether each key is saved on the PC (true/false only), for the rows that stand in for the key fields.
 function showKeys(){for(const el of document.querySelectorAll('[data-phone-key]')){const k=el.dataset.phoneKey;if(!(k in keySaved))continue;el.textContent=keySaved[k]?'Saved on your PC':'Not set';el.dataset.on=String(keySaved[k]);}}
 function keyRow(label,key){const row=document.createElement('div');row.className='phone-key';const b=document.createElement('span');b.textContent=label;const s=document.createElement('b');s.dataset.phoneKey=key;s.textContent='Checking…';row.append(b,s);return row;}
 function adapt(){
  const $=id=>document.getElementById(id);
  // A way back to the remote, at the start of the bar with the sections.
  const side=document.querySelector('.side');
  if(side&&!document.querySelector('.phone-underlay')){const u=document.createElement('div');u.className='phone-underlay';u.setAttribute('aria-hidden','true');document.body.prepend(u);
   const size=()=>document.documentElement.style.setProperty('--phone-bar-h',side.getBoundingClientRect().height+'px');size();if(typeof ResizeObserver==='function')new ResizeObserver(size).observe(side);}
  const save=document.querySelector('.savebar');if(save&&!save.parentElement.classList.contains('phone-savebar')){const w=document.createElement('div');w.className='phone-savebar';save.before(w);w.append(save);}
  if(side&&!document.querySelector('.phone-back')){const a=document.createElement('a');a.className='phone-back';a.href='/';a.setAttribute('aria-label','Back to the remote');
   const i=document.createElement('span');i.setAttribute('aria-hidden','true');i.textContent='‹';const t=document.createElement('span');t.textContent='Remote';a.append(i,t);side.prepend(a);}
  const head=document.querySelector('.page-head');
  if(head)head.after(note('You’re changing Tyler’s settings on your PC from this phone. They save as they do on the PC: most with Save settings at the bottom. API keys, installs and tests stay on the PC.','phone-note phone-intro'));
  // API keys: whether one is saved, never the key; they're added and removed on the PC.
  const keyGrid=$('openrouterKey')?.closest('.grid');
  if(keyGrid){const box=document.createElement('div');box.className='phone-keys';box.append(keyRow('OpenRouter API key','openrouterKey'),keyRow('Google Gemini API key','geminiKey'));keyGrid.after(box);box.after(note(KEYS_ON_PC));}
  const venice=$('veniceKey')?.closest('label');
  if(venice){const box=document.createElement('div');box.className='phone-keys';box.append(keyRow('Venice API key','veniceKey'));venice.after(box);box.after(note(KEYS_ON_PC));}
  for(const id of ['openrouterKey','geminiKey','veniceKey']){const el=$(id);if(el){el.value='';el.disabled=true;el.closest('label')?.classList.add('phone-hidden');}}
  for(const id of ['clear','steam','imgForgetVenice','modelTest'])$(id)?.classList.add('phone-hidden');
  $('modelTest')?.after(note('Do this on your PC: the model test uses your saved key there.','phone-note phone-inline'));
  // Text AI on this PC: its install and model are on the PC.
  const local=document.querySelector('#studio .hint.only-local');if(local)local.after(note('AI on this PC is installed and set up in Settings on your PC.','phone-note only-local'));
  // Overview → Connect in Steam chat: that's the remote's Connect & start.
  const open=$('uiOpenSteam');if(open){open.classList.add('phone-hidden');const b=document.createElement('button');b.type='button';b.className='secondary';b.textContent='Open the remote';b.onclick=()=>location.assign('/');open.after(b);}
  for(const [sel,hide,text,where='.sheet-head'] of PC_ONLY){
   const sec=document.querySelector(sel);if(!sec)continue;
   if(hide)for(const el of sec.querySelectorAll(hide))el.classList.add('phone-hidden');else sec.classList.add('phone-pc-only');
   (sec.querySelector(where)||sec.querySelector('h2'))?.after(note(text));
  }
  // The activity log stays on the PC.
  const log=$('v22ElectronActivity');if(log){log.classList.add('phone-hidden');log.after(note('The activity log is shown in Settings on your PC.','phone-note phone-inline'));}
  void get(['openrouterKey','geminiKey','veniceKey']).catch(()=>{});
  // The section tabs scroll sideways on a phone: keep the one that's open in view.
  const nav=()=>{const bar=document.querySelector('.side .section-nav'),b=bar?.querySelector('[aria-current=page]');if(!b||bar.scrollWidth<=bar.clientWidth)return;
   bar.scrollLeft+=b.getBoundingClientRect().left-bar.getBoundingClientRect().left-(bar.clientWidth-b.offsetWidth)/2;};
  new MutationObserver(nav).observe(document.body,{attributes:true,attributeFilter:['data-zone']});requestAnimationFrame(nav);
 }
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',adapt,{once:true});else adapt();
})();

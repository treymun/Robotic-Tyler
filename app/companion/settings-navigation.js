/* Settings sidebar navigation. Shows one zone of sections at a time.
   Does not write provider keys or change the settings schema. */
(()=>{'use strict';
const nav=document.querySelector('.section-nav');if(!nav)return;
const isDesktop=document.body.dataset.desktop==='true';
const store=isDesktop?window.tylerSettings?.storage?.local:globalThis.chrome?.storage?.local;
// Themed icons (ui-icons.js): every theme styles the same symbols its own way.
const icon=name=>globalThis.TylerIcons?.svg(name)||'';
const definitions=[
 ['overview','Overview','Setup steps and usage for this profile',icon('overview')],
 ['ai','AI & personality','Provider, model, personality and reply previews',icon('ai')],
 ['voice','Voice','How Tyler sounds and listens in Chrome',icon('voice')],
 ['squad','Squad & friends','Group features, party host and verified friends',icon('squad')],
 ['games','Games','Public Steam game activity',icon('games')],
 ['appearance','Appearance','Theme gallery for every Tyler window',icon('appearance')],
 ['advanced','Advanced','Memory, usage, safety tools and experimental options',icon('advanced')],
].filter(x=>!isDesktop||x[0]!=='voice');
const mapping={appearance:'appearance',quickStart:'overview',usagePulse:'overview',top:'overview',studio:'ai',personalitySheet:'ai',playground:'ai',voice:'voice',steamActivity:'games',suiteSettings:'squad',approvedFriends:'squad',friendProfiles:'squad',social:'advanced',usageSection:'advanced',v22Tools:'advanced',v23Tools:'advanced'};
document.getElementById('uiPlatform').textContent=isDesktop?'Desktop settings':'Chrome settings';
globalThis.TylerIcons?.fill(document);

const buttons=new Map();let current='overview';
function switchTab(tab,updateHash=false){
 if(!definitions.some(x=>x[0]===tab))tab='overview';current=tab;
 document.body.dataset.zone=tab; // CSS shows [data-ui-zone] sections of this zone, including ones injected later
 for(const [name,button] of buttons){const active=name===tab;button.setAttribute('aria-current',active?'page':'false');}
 const def=definitions.find(x=>x[0]===tab);
 document.getElementById('uiSectionTitle').textContent=def[1];document.getElementById('uiSectionDescription').textContent=def[2];
 if(updateHash)history.replaceState(null,'','#'+tab);
 document.querySelector('.content')?.scrollTo?.({top:0});window.scrollTo({top:0});
}
for(const [tab,label,,svg] of definitions){
 const b=document.createElement('button');b.type='button';b.innerHTML=svg;const span=document.createElement('span');span.textContent=label;b.append(span);
 b.onclick=()=>switchTab(tab,true);buttons.set(tab,b);nav.append(b);
}
function tabForHash(){const id=decodeURIComponent(location.hash.substring(1));return mapping[id]||(definitions.some(x=>x[0]===id)?id:null);}
for(const a of document.querySelectorAll('a[href^="#"]'))a.addEventListener('click',e=>{const name=a.getAttribute('href').slice(1),tab=mapping[name]||name;if(!buttons.has(tab))return;e.preventDefault();switchTab(tab,true);document.getElementById(name)?.scrollIntoView({block:'start',behavior:'smooth'});});
window.addEventListener('hashchange',()=>{const tab=tabForHash();if(tab)switchTab(tab);});
document.querySelectorAll('[data-target]').forEach(b=>b.addEventListener('click',()=>switchTab(b.dataset.target,true)));
document.getElementById('uiOpenSteam')?.addEventListener('click',()=>{const el=document.getElementById('steam');if(el)el.click();else window.open('https://steamcommunity.com/chat/','_blank','noopener');});

// Save bar: dirty state follows any edit; settings.js reports the save result in #status.
const navStatus=document.getElementById('uiNavStatus');
const markDirty=()=>{navStatus.textContent='Unsaved changes';navStatus.className='ui-dirty';};
document.addEventListener('input',e=>{if(e.target.closest?.('#sections')&&e.target.matches('input,select,textarea')&&!e.target.closest('#v22Tools,#v23Tools'))markDirty();});
const status=document.getElementById('status');
const kit=()=>globalThis.TylerKit?.page();
if(status)new MutationObserver(()=>{const t=status.textContent;if(/saved|unchanged/i.test(t)&&!/unfinished/i.test(t)){navStatus.textContent='Settings saved';navStatus.className='ui-clean';void updateStatus();if(/saved/i.test(t))kit()?.toast({kind:'success',title:'Settings saved',text:'Tyler uses the new settings from the next reply.'});}else if(/stayed open|failed|rejected|could not/i.test(t)){const why=t.replace(/^Settings stayed open\.\s*/,'');navStatus.textContent=why;navStatus.className='ui-error';kit()?.toast({kind:'error',title:'Settings weren’t saved',text:why,action:{label:'Try again',run:()=>document.getElementById('save')?.click()}});}}).observe(status,{childList:true,characterData:true,subtree:true});

// Key status in the overview step and the sidebar footer.
const keyState=document.getElementById('uiKeyState'),keyStep=document.getElementById('uiKeyStep'),keySide=document.getElementById('uiKeySide'),keyDot=document.getElementById('uiKeyDot');
async function updateStatus(){
 try{const s=await store.get(['openrouterKey','geminiKey']);const has=!!(s.openrouterKey||s.geminiKey);
  keyState.textContent=has?'An AI key is saved. Tyler is ready for Steam.':'Add an OpenRouter or Gemini key to begin.';
  keySide.textContent=has?'AI key saved':'No AI key yet';keyStep.dataset.done=String(has);keyDot.dataset.on=String(has);
 }catch{keyState.textContent='Open AI & personality to confirm your key.';keySide.textContent='Key status unavailable';}
}
void updateStatus();

const requested=tabForHash();switchTab(requested||'overview');
document.body.classList.add('ui-ready');
})();

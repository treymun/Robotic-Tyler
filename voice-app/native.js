// The desktop Voice window (v2.15): start and stop Standard voice or Gemini Live, see what Tyler
// heard and said, and try a typed message or a short recording. Devices, consent, engine and
// voices are chosen in Settings → Voice.
const $=id=>document.getElementById(id);const api=window.tylerNative;
const THEMES=['steam','classic','tf2','cs2','portal','cs16','hev','l4d','winxp','doom','quake','pipboy','combine','deadlock','minecraft','payday','dreamcast','gmod','ricochet','dod','rust','x360','ipod','msn','xmb'];
const applyTheme=()=>Promise.resolve(api?.theme?.()).then(t=>{const theme=THEMES.includes(t)?t:'steam';document.documentElement.dataset.rtTheme=theme;const logo=$('brand-logo');if(logo&&logo.dataset.theme!==theme){logo.removeAttribute('srcset');logo.onerror=()=>{logo.onerror=null;logo.removeAttribute('srcset');logo.src='logos/steam.png';};logo.src='logos/'+theme+'.png';logo.dataset.theme=theme;}
 // Redrawn at its exact on-screen size so the small logo stays crisp (v2.18, see ui-logos.js).
 if(logo)requestAnimationFrame(()=>globalThis.TylerLogos?.sharpen(logo,theme));}).catch(()=>{});
applyTheme();window.addEventListener('focus',()=>{applyTheme();void refresh();});api.onTheme?.(applyTheme);
globalThis.TylerIcons?.fill(document);
const kit=()=>globalThis.TylerKit?.page();
const navigate=name=>{document.querySelectorAll('nav button').forEach(b=>b.classList.toggle('active',b.dataset.page===name));document.querySelectorAll('section[data-view]').forEach(el=>el.hidden=el.dataset.view!==name);$('title').textContent=({voice:'Voice',guide:'Setup guide',features:'What runs where'})[name]||name;};
document.querySelectorAll('nav button').forEach(b=>b.addEventListener('click',()=>navigate(b.dataset.page)));
let info={};
function render(s){
 info={...info,...s};const live=info.engine==='live',on=info.mode&&info.mode!=='off';
 $('engine-name').textContent=live?'Gemini Live':'Standard voice';
 $('engine-note').textContent=live?'A real-time conversation with Google: Tyler hears the voice chat as people talk, answers quickly and stops when someone talks over him. Google bills for the audio while it runs.':'Tyler waits for a pause, writes a reply with your AI provider and speaks it into Steam. Say “Tyler, stop” to cut him off.';
 const checks=[[info.bridge,'Windows audio helper installed'],[info.keyForEngine,live?'Google AI key saved':'AI key saved'],[info.devicesChosen,'Devices chosen (speaks into / listens to)'],[info.consent,'Everyone in the voice chat knows Tyler is listening']];
 $('checklist').replaceChildren(...checks.map(([ok,text])=>{const li=document.createElement('li');li.dataset.ok=String(!!ok);li.textContent=text;return li;}));
 const ready=checks.every(c=>c[0]);
 $('start').disabled=on||!ready;$('stop').disabled=!on;$('start').querySelector('.lbl').textContent=live?'Start Gemini Live':'Start listening';
 $('state').textContent=info.state||(ready?'Voice is off. Press Start when everyone is ready.':'Finish the steps above in Voice settings first.');
 $('heard').textContent=info.heard||'…';$('said').textContent=info.said||'…';
 $('latency').textContent=info.latencyMs!=null?'Last live reply started '+(info.latencyMs/1000).toFixed(2)+' s after people stopped talking (measured on this connection).':'';
 $('bridge-status').textContent=info.bridge?(on?'Voice on':'Audio helper ready'):'Audio helper missing';document.querySelector('.side-foot .dot')?.setAttribute('data-on',String(!!info.bridge));
 $('status').textContent='ROBOTIC TYLER '+(info.version||'')+(on?' · '+(live?'Gemini Live':'Standard voice')+' running':'');
}
async function refresh(){try{render(await api.status());}catch(e){render({state:e.message});}}
const act=async(task,okText)=>{try{const r=await task();if(r&&typeof r==='object')render(r);else if(typeof r==='string')render({state:r});if(okText)kit()?.toast({kind:'success',title:okText});}catch(e){render({state:e.message});kit()?.toast({kind:'error',title:'That didn’t work',text:e.message,action:/settings|device|consent|key/i.test(e.message)?{label:'Voice settings',run:()=>api.openSettings()}:undefined});}finally{void refresh();}};
api.onStatus?.(s=>render(s));
$('start').onclick=()=>act(()=>api.start());
$('stop').onclick=()=>act(()=>api.stop());
$('say').onclick=()=>act(async()=>{const r=await api.say($('prompt').value);$('prompt').value='';return r;});
$('listen').onclick=()=>act(()=>api.listen(5));
$('tone').onclick=()=>act(()=>api.tone());
$('settings').onclick=()=>api.openSettings();
$('check-updates').onclick=()=>act(()=>api.checkUpdates().then(s=>s?.status&&/disabled|unavailable/.test(s.status)?'Automatic updates: '+s.status+'.':''));
void refresh();setInterval(refresh,5000);

// Settings → AI & personality → AI on this PC → text replies (v2.38, desktop app). Choose a model and
// where it runs, see the download and disk space first, install, stop, remove, and time a reply.
// Everything heavy happens in the desktop app's main process (app/local-ai); this page only shows it.
// (v2.39: hearing and voice in the same section are local-speech-settings.js. The section shows when
// either part is in use: this file sets data-text-relevant, that one data-speech-relevant.)
(() => {
 'use strict';
 const root=document.getElementById('localAI'),la=window.tylerSettings?.localAI;if(!root||!la)return;
 const $=id=>document.getElementById(id),GB=1024**3,MB=1024**2;
 // Sizes as Windows shows them (1 GB = 1024³ bytes), one decimal below 100 GB and without a trailing .0.
 const size=n=>n>=GB?(n/GB).toFixed(n>=100*GB?0:1).replace(/\.0$/,'')+' GB':Math.max(1,Math.round(n/MB))+' MB';
 const say=(id,t)=>{$(id).textContent=t;};
 let status=null,models={},installing=false,failed=false,plans={};
 const radios=()=>[...root.querySelectorAll('input[name=laModel]')];
 const chosen=()=>radios().find(r=>r.checked)?.value||status?.model||'4b';
 const label=k=>models[k]?.label||k;
 const where=d=>d==='gpu'?'the graphics card':'the processor';
 function relevant(){
  const provider=$('aiProvider')?.value;
  root.dataset.textRelevant=String(provider==='local'||!!status?.installed||installing);
  const note=$('laProviderNote');
  if(status?.ready&&provider!=='local'){note.hidden=false;note.textContent='Text replies on this PC are installed and ready. To use them, choose “This PC (free, no key)” as the AI provider above, then press Save settings.';}
  else if(provider==='local'&&status&&!status.ready){note.hidden=false;note.textContent='This PC is chosen as the AI provider, but '+(status.installed?'the '+label(status.model)+' model isn’t installed yet':'Text AI on this PC isn’t installed yet')+'. Until it is, Tyler’s replies fail and say so: he doesn’t switch to a cloud AI by himself.';}
  else note.hidden=true;
 }
 function hardwareLine(s){
  const h=s.hardware;if(!h)return 'Checking this PC…';
  const gpus=(h.gpus||[]).map(g=>g.name+(g.vramTotal?' ('+size(g.vramTotal)+(g.vramFree!=null&&g.vramFree!==undefined?', '+size(g.vramFree)+' free':'')+')':'')+(g.integrated?' · built in':'')).join('; ')||'no graphics card found';
  return h.cpu.model+' ('+h.cpu.threads+' threads) · '+size(h.ram.total)+' memory · '+gpus+(h.disk?.free!=null?' · '+size(h.disk.free)+' free on the data drive':'')+'.'+(h.vulkanChecked?' Graphics memory from Vulkan.':'');
 }
 async function planText(model=chosen()){
  try{plans[model]=plans[model]||await la('plan',{model});const p=plans[model];
   if(!p.fileCount)return 'Everything for '+label(model)+' is on this PC: nothing to download.';
   const parts=[p.runtimeBytes?'the engine '+size(p.runtimeBytes):null,p.modelBytes?label(model)+' '+size(p.modelBytes):null].filter(Boolean).join(' and ');
   return 'Installing downloads '+size(p.download)+' ('+parts+(p.already?'; '+size(p.already)+' is already downloaded':'')+') and needs about '+size(p.disk)+' of disk space'+(p.free!=null?' ('+size(p.free)+' is free)':'')+'.';}
  catch(e){return 'Couldn’t work out the download: '+e.message;}
 }
 function checkText(c){
  if(!c)return '';if(!c.ok)return 'Last speed check failed: '+c.error;
  return 'Speed check ('+new Date(c.at).toLocaleString()+'): '+c.label+' on '+(c.device==='gpu'?(c.gpu||'the graphics card'):'the processor')+(c.startMs?' · loaded in '+(c.startMs/1000).toFixed(1)+' s':'')+' · first word after '+(c.firstTokenMs/1000).toFixed(2)+' s · '+(c.tokensPerSecond??'?')+' tokens a second'+(c.promptTokensPerSecond?' (reading: '+c.promptTokensPerSecond+' a second)':'')+'.';
 }
 async function stateText(){
  const s=status;if(!s)return '…';
  if(!s.supported)return 'Text AI on this PC needs Windows.';
  if(s.installing)return 'Installing '+label(s.installing.model)+'…';
  const plan=await planText();
  if(!s.installed)return 'Not installed. '+plan;
  const have=Object.entries(s.models||{}).filter(([,v])=>v).map(([k])=>label(k)).join(', ')||'no model';
  if(!s.models?.[chosen()])return 'Installed: the engine (llama.cpp '+s.build+') and '+have+'. '+label(chosen())+' isn’t installed yet: press Install to add it. '+plan;
  const run=s.loaded?' Running now on '+(s.loaded.device==='gpu'?(s.loaded.gpu?.name||'the graphics card'):'the processor')+'.':' Not running: it starts with the first reply.';
  return 'Ready: '+label(chosen())+' with llama.cpp '+s.build+(have!==label(chosen())?' (installed: '+have+')':'')+'.'+run+(s.lastError?' Last problem: '+s.lastError.message:'');
 }
 function render(){
  const s=status;if(!s)return;
  say('laHardware',hardwareLine(s));
  const rec=s.suggestion;$('laAdvice').replaceChildren(...(rec?.notes||[]).map(t=>{const li=document.createElement('li');li.textContent=t;return li;}));
  if(!root.contains(document.activeElement)||document.activeElement.name!=='laModel')for(const r of radios())r.checked=r.value===s.model;
  for(const tag of root.querySelectorAll('.la-text .la-tag[data-for]')){const k=tag.dataset.for,inst=!!s.models?.[k],sug=rec?.model===k;tag.textContent=inst?'Installed':sug?'Suggested':'';tag.dataset.kind=inst?'installed':sug?'suggested':'';}
  $('laModelNote').textContent=(rec?'Suggested for this PC: '+label(rec.model)+' on '+where(rec.device)+'. ':'')+(s.modelChosen?'Your choice: '+label(s.model)+'.':'Nothing chosen yet: the suggestion is selected.')+' Nothing installs or switches by itself.';
  if(document.activeElement!==$('laDevice'))$('laDevice').value=s.settings.device==='cpu'?'cpu':'auto';
  if(document.activeElement!==$('laIdle'))$('laIdle').value=String(s.settings.idleMinutes??10);
  const noCard=rec&&rec.device==='cpu'&&$('laDevice').value==='auto';
  say('laDeviceNote',$('laDevice').value==='cpu'?'The processor only: slower, and the graphics card stays free for games.':noCard?'No graphics card Vulkan can use was found, so it runs on the processor.':'Any recent NVIDIA, AMD or Intel card (through Vulkan): the whole model goes on the card. If it doesn’t fit while you play, Tyler says so instead of moving it.');
  const ready=!!s.models?.[chosen()]&&s.installed;
  $('laInstall').textContent=failed?'Retry':!s.installed?'Install '+label(chosen()):ready?'Installed':'Install '+label(chosen());
  $('laInstall').disabled=installing||ready||!s.supported;$('laOffline').disabled=installing||!s.supported;$('laCancel').hidden=!installing;
  $('laCheck').disabled=installing||!ready;$('laUnload').disabled=!s.running;
  $('laRemove').disabled=installing||!s.installed;$('laRemoveModel').disabled=installing||!s.models?.[chosen()];
  $('laRemoveModel').textContent='Remove '+label(chosen())+(models[chosen()]?' ('+size(models[chosen()].bytes)+')':'');
  if(!$('laCheckState').dataset.fresh)say('laCheckState',checkText(s.check));
  relevant();
 }
 async function load(){
  let r;try{r=await la('status');}catch(e){say('laInstallState','Text AI on this PC isn’t available: '+e.message);root.dataset.textRelevant=String($('aiProvider')?.value==='local');return;}
  status=r.status;models=r.models;installing=!!status.installing;if(installing)$('laProgressWrap').hidden=false;if(status.installError&&!status.ready)failed=true;
  render();if(!installing)say('laInstallState',await stateText());
 }
 const save=values=>la('settings',{values});
 for(const r of radios())r.addEventListener('change',async()=>{if(!r.checked)return;failed=false;$('laCheckState').dataset.fresh='';try{await save({model:r.value});}catch(e){say('laInstallState',e.message);}await load();});
 $('laDevice').addEventListener('change',async()=>{await save({device:$('laDevice').value}).catch(e=>say('laInstallState',e.message));await load();});
 $('laIdle').addEventListener('change',async()=>{await save({idleMinutes:Number($('laIdle').value)}).catch(e=>say('laInstallState',e.message));say('laInstallState','Saved. '+await stateText());});
 async function install(offline=[]){
  installing=true;render();$('laProgressWrap').hidden=false;$('laProgress').style.width='0%';say('laInstallState','Installing '+label(chosen())+'… You can keep using Tyler meanwhile.');
  try{await la('install',{model:chosen(),offline});}catch(e){installing=false;say('laInstallState',e.message);render();}
 }
 $('laInstall').onclick=()=>void install();
 $('laCancel').onclick=()=>void la('cancel').catch(()=>{});
 $('laOffline').onclick=()=>{$('laOfflineForm').hidden=false;$('laOfflineDir').focus();};
 $('laOfflineCancel').onclick=()=>{$('laOfflineForm').hidden=true;};
 $('laOfflineGo').onclick=()=>{const dir=$('laOfflineDir').value.trim().replace(/^["']+|["']+$/g,'');if(!dir)return;$('laOfflineForm').hidden=true;void install([dir]);};
 $('laOpenFolder').onclick=e=>{e.preventDefault();void la('open-folder');};
 $('laCheck').onclick=async()=>{$('laCheck').disabled=true;$('laCheckState').dataset.fresh='1';say('laCheckState',status?.running?'Timing one reply…':'Starting the AI on this PC, then timing one reply…');
  try{const c=await la('check');say('laCheckState',checkText(c)+(c.text?' It said: “'+c.text.slice(0,120)+'”':''));}catch(e){say('laCheckState','Speed check failed: '+e.message);}
  finally{$('laCheck').disabled=false;}await load();};
 $('laUnload').onclick=async()=>{await la('unload').catch(()=>{});say('laInstallState','The AI on this PC is closed; its memory is free. '+await stateText());await load();};
 let armed=null;const twice=(id,fn,ask)=>{$(id).onclick=()=>{if(armed!==id){armed=id;say('laInstallState',ask+' Press the button again to confirm.');setTimeout(()=>{if(armed===id)armed=null;},6000);return;}armed=null;void fn();};};
 const removing=async(op,extra,done)=>{say('laInstallState','Removing…');try{await la(op,extra);plans={};failed=false;say('laInstallState',done);}catch(e){say('laInstallState',e.message);}await load();};
 twice('laRemove',()=>removing('remove',{},'Text AI on this PC was removed. Your settings are kept.'),'This removes the engine and every model (your settings stay).');
 twice('laRemoveModel',()=>{const k=chosen();return removing('remove-model',{model:k},label(k)+' was removed.');},'Remove this model?');
 window.tylerSettings.onLocalAI?.(e=>{
  if(e.kind==='status'){status=e.status;if(!installing)render();return;}
  if(e.kind==='install'){
   const pct=e.totalBytes?Math.min(100,Math.round(100*(e.bytes||0)/e.totalBytes)):null;
   if(pct!==null&&e.phase==='download')$('laProgress').style.width=pct+'%';
   say('laProgressText',(e.label||'')+(e.totalBytes&&e.phase==='download'?' · '+size(e.bytes||0)+' of '+size(e.totalBytes):''));
   if(e.phase==='done'){installing=false;failed=false;plans={};$('laProgress').style.width='100%';say('laInstallState','Text AI on this PC is ready. Run a speed check to see how fast it is here.');void load();}
   if(e.phase==='failed'){installing=false;failed=true;plans={};say('laInstallState',e.label+' Tyler works as before; press Retry to carry on (what was downloaded is kept).');void load();}
  }
 });
 $('aiProvider')?.addEventListener('change',relevant);window.addEventListener('tyler:ai-provider',relevant);
 void load();
 if(location.hash==='#localAI')setTimeout(()=>root.scrollIntoView({block:'start'}),300);
})();

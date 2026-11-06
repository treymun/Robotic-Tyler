// Settings → AI & personality → AI on this PC → Images on this PC (v2.40, desktop app). Choose a model,
// where it runs and the size, see the download and disk space first, install, stop, remove, make a test
// picture, and say whether friends may use it (and the uncensored model). Everything heavy happens in the
// desktop app's main process (app/local-images); this page only shows it. In Chrome the whole AI on this
// PC section is hidden (only-desktop). The section shows when this part is in use: data-images-relevant.
(() => {
 'use strict';
 const root=document.getElementById('localAI'),li=window.tylerSettings?.localImages;if(!root||!li||!document.getElementById('localImages'))return;
 const $=id=>document.getElementById(id),GB=1024**3,MB=1024**2;
 const size=n=>n>=GB?(n/GB).toFixed(n>=100*GB?0:1).replace(/\.0$/,'')+' GB':Math.max(1,Math.round(n/MB))+' MB';
 const say=(id,t)=>{$(id).textContent=t;};
 let status=null,models={},installing=false,failed=false,plans={},asked=false,testing=false;
 const radios=()=>[...root.querySelectorAll('input[name=liModel]')];
 const chosen=()=>radios().find(r=>r.checked)?.value||status?.model||'zimage-8gb';
 const label=k=>models[k]?.label||k;
 const where=d=>d==='gpu'?'the graphics card':'the processor';
 // Shown when installed, being installed, the This PC chat style is on, or the owner asked to set it up.
 function relevant(){
  const pcStyle=document.querySelector('#imgStyles [data-style="pc"] input')?.checked===true;
  root.dataset.imagesRelevant=String(asked||pcStyle||!!status?.installed||installing);
  const note=$('liNote');
  if(pcStyle&&status&&!status.ready){note.hidden=false;note.textContent='The This PC chat style is on, but '+(status.installed?'the '+label(status.model)+' model isn’t installed yet':'images on this PC aren’t installed yet')+'. Until it is, requests with it are refused and say so.';}
  else note.hidden=true;
 }
 function hardwareLine(s){
  const h=s.hardware;if(!h)return 'Checking this PC…';
  const gpus=(h.gpus||[]).map(g=>g.name+(g.vramTotal?' ('+size(g.vramTotal)+(g.vramFree!=null?', '+size(g.vramFree)+' free':'')+')':'')+(g.integrated?' · built in':'')).join('; ')||'no graphics card found';
  return h.cpu.model+' ('+h.cpu.threads+' threads) · '+size(h.ram.total)+' memory · '+gpus+(h.disk?.free!=null?' · '+size(h.disk.free)+' free on the data drive':'')+'.'+(h.sdChecked?' Cards from the image engine’s Vulkan list.':'');
 }
 async function planText(model=chosen()){
  try{plans[model]=plans[model]||await li('plan',{model});const p=plans[model];
   if(!p.fileCount)return 'Everything for '+label(model)+' is on this PC: nothing to download.';
   const parts=[p.runtimeBytes?'the engine '+size(p.runtimeBytes):null,p.modelBytes?label(model)+' '+size(p.modelBytes):null].filter(Boolean).join(' and ');
   return 'Installing downloads '+size(p.download)+' ('+parts+(p.already?'; '+size(p.already)+' is already downloaded':'')+') and needs about '+size(p.disk)+' of disk space'+(p.free!=null?' ('+size(p.free)+' is free)':'')+'.';}
  catch(e){return 'Couldn’t work out the download: '+e.message;}
 }
 const timesText=r=>{const t=r.timings||{},sec=ms=>ms==null?'?':(ms/1000).toFixed(1)+' s';
  return r.label+' on '+(r.device==='gpu'?'the graphics card':'the processor')+' · '+r.width+' × '+r.height+', '+r.steps+' steps · '+sec(t.totalMs)+' in all (loading '+sec(t.loadMs)+', reading the prompt '+sec(t.encodeMs)+', drawing '+sec(t.sampleMs)+(t.secondsPerStep?' = '+t.secondsPerStep+' s a step':'')+', finishing '+sec(t.decodeMs)+').';};
 async function stateText(){
  const s=status;if(!s)return '…';
  if(!s.supported)return 'Images on this PC need Windows.';
  if(s.installing)return 'Installing '+label(s.installing.model)+'…';
  const plan=await planText();
  if(!s.installed)return 'Not installed. '+plan;
  const have=Object.entries(s.models||{}).filter(([,v])=>v).map(([k])=>label(k)).join(', ')||'no model';
  if(!s.models?.[chosen()])return 'Installed: the engine (stable-diffusion.cpp '+s.build+') and '+have+'. '+label(chosen())+' isn’t installed yet: press Install to add it. '+plan;
  const run=s.running?' Making a picture now'+(s.job?.step?' (step '+s.job.step+' of '+s.job.steps+')':'')+'.':' Nothing running: the engine starts for each picture and ends when it’s done.';
  return 'Ready: '+label(chosen())+' with stable-diffusion.cpp '+s.build+(have!==label(chosen())?' (installed: '+have+')':'')+'.'+run+(s.lastError?' Last problem: '+s.lastError.message:'');
 }
 function render(){
  const s=status;if(!s)return;
  say('liHardware',hardwareLine(s));
  const rec=s.suggestion;$('liAdvice').replaceChildren(...(rec?.notes||[]).map(t=>{const x=document.createElement('li');x.textContent=t;return x;}));
  if(!root.contains(document.activeElement)||document.activeElement.name!=='liModel')for(const r of radios())r.checked=r.value===s.model;
  for(const tag of root.querySelectorAll('.la-models [data-for]')){const k=tag.dataset.for;if(!k||!models[k])continue;const inst=!!s.models?.[k],sug=rec?.model===k;tag.textContent=inst?'Installed':sug?'Suggested':'';tag.dataset.kind=inst?'installed':sug?'suggested':'';}
  $('liModelNote').textContent=(rec?'Suggested for this PC: '+label(rec.model)+' on '+where(rec.device)+(rec.size?' at '+rec.size+' × '+rec.size:'')+'. ':'')+(s.modelChosen?'Your choice: '+label(s.model)+'.':'Nothing chosen yet: the suggestion is selected.')+' Tyler never suggests an uncensored model, and nothing installs or switches by itself.';
  if(document.activeElement!==$('liDevice'))$('liDevice').value=s.settings.device==='cpu'?'cpu':'gpu';
  if(document.activeElement!==$('liSize'))$('liSize').value=s.settings.size?String(s.settings.size):'';
  $('liFriends').checked=!!s.settings.friends;$('liFriendsUncensored').checked=!!s.settings.friendsUncensored;$('liFriendsUncensored').disabled=!s.settings.friends;
  // On the processor, said plainly (measured on a 4-core PC at 256 × 256): Z-Image about 23 s a step, Chroma about 3 minutes a step.
  const chroma=models[chosen()]?.family==='chroma';
  say('liDeviceNote',$('liDevice').value==='cpu'?(chroma?'The processor only: '+label(chosen())+' takes about an hour for one small (256 × 256) picture on a 4-core PC, and several hours at 512 × 512. It works, but Z-Image Turbo is far quicker here.':'The processor only: a picture takes many minutes (on a 4-core PC about 4 minutes at 256 × 256, roughly a quarter of an hour at 512 × 512), and the graphics card stays free for games.'):rec&&rec.device==='cpu'?'No graphics card Vulkan can use was found: choose Processor only to make pictures here (Tyler doesn’t switch by himself).':'Any recent NVIDIA, AMD or Intel card (through Vulkan). If a picture doesn’t fit while you play, Tyler says so instead of moving it.');
  // A missing Microsoft Visual C++ runtime: explained with Microsoft's own download (Tyler never installs it).
  $('liRuntime').hidden=![s.installError,s.lastError].some(x=>x?.code==='vc_runtime');
  const ready=!!s.models?.[chosen()]&&s.installed;
  $('liInstall').textContent=failed?'Retry':ready?'Installed':'Install '+label(chosen());
  $('liInstall').disabled=installing||ready||!s.supported;$('liOffline').disabled=installing||!s.supported;$('liCancel').hidden=!installing;
  $('liTest').disabled=installing||!ready||testing||s.running;$('liStop').hidden=!(testing||s.running);
  $('liRemove').disabled=installing||!s.installed;$('liRemoveModel').disabled=installing||!s.models?.[chosen()];
  $('liRemoveModel').textContent='Remove '+label(chosen())+(models[chosen()]?' ('+size(models[chosen()].bytes)+')':'');
  relevant();
 }
 async function load(){
  let r;try{r=await li('status');}catch(e){say('liInstallState','Images on this PC aren’t available: '+e.message);relevant();return;}
  status=r.status;models=r.models;installing=!!status.installing;if(installing)$('liProgressWrap').hidden=false;if(status.installError&&!status.ready)failed=true;
  render();say('liInstallState',installing?'Installing '+label(status.installing.model)+'… You can keep using Tyler meanwhile.':await stateText());
 }
 const save=values=>li('settings',{values});
 for(const r of radios())r.addEventListener('change',async()=>{if(!r.checked)return;failed=false;try{await save({model:r.value});}catch(e){say('liInstallState',e.message);}await load();});
 $('liDevice').addEventListener('change',async()=>{await save({device:$('liDevice').value}).catch(e=>say('liInstallState',e.message));await load();});
 $('liSize').addEventListener('change',async()=>{await save({size:$('liSize').value?Number($('liSize').value):null}).catch(e=>say('liInstallState',e.message));say('liInstallState','Saved. '+await stateText());});
 $('liFriends').addEventListener('change',async()=>{const on=$('liFriends').checked;await save(on?{friends:true}:{friends:false,friendsUncensored:false}).catch(e=>say('liInstallState',e.message));await load();});
 $('liFriendsUncensored').addEventListener('change',async()=>{await save({friendsUncensored:$('liFriendsUncensored').checked}).catch(e=>say('liInstallState',e.message));await load();});
 async function install(offline=[]){
  installing=true;render();$('liProgressWrap').hidden=false;$('liProgress').style.width='0%';say('liInstallState','Installing '+label(chosen())+'… You can keep using Tyler meanwhile.');
  try{await li('install',{model:chosen(),device:$('liDevice').value,offline});}catch(e){installing=false;say('liInstallState',e.message);render();}
 }
 $('liInstall').onclick=()=>void install();
 $('liCancel').onclick=()=>void li('cancel').catch(()=>{});
 $('liOffline').onclick=()=>{$('liOfflineForm').hidden=false;$('liOfflineDir').focus();};
 $('liOfflineCancel').onclick=()=>{$('liOfflineForm').hidden=true;};
 $('liOfflineGo').onclick=()=>{const dir=$('liOfflineDir').value.trim().replace(/^["']+|["']+$/g,'');if(!dir)return;$('liOfflineForm').hidden=true;void install([dir]);};
 $('liOpenFolder').onclick=e=>{e.preventDefault();void li('open-folder');};
 $('liTest').onclick=async()=>{
  testing=true;render();$('liTestImage').hidden=true;say('liTestState','Making a test picture'+(status?.settings?.device==='cpu'?' on the processor (this takes '+(models[status.model]?.family==='chroma'?'an hour or more':'many minutes')+'; Stop ends it)…':'…'));
  try{const r=await li('test',{});$('liTestImage').src='data:image/png;base64,'+r.image;$('liTestImage').hidden=false;say('liTestState','Test picture: '+timesText(r));}
  catch(e){say('liTestState','No test picture: '+e.message);}
  finally{testing=false;}await load();
 };
 $('liStop').onclick=async()=>{await li('stop').catch(()=>{});say('liTestState','Stopped.');await load();};
 let armed=null;const twice=(id,fn,ask)=>{$(id).onclick=()=>{if(armed!==id){armed=id;say('liInstallState',ask+' Press the button again to confirm.');setTimeout(()=>{if(armed===id)armed=null;},6000);return;}armed=null;void fn();};};
 const removing=async(op,extra,done)=>{say('liInstallState','Removing…');try{await li(op,extra);plans={};failed=false;say('liInstallState',done);}catch(e){say('liInstallState',e.message);}await load();};
 twice('liRemove',()=>removing('remove',{},'Images on this PC were removed. Your settings are kept.'),'This removes the picture engine and every picture model (your settings stay).');
 twice('liRemoveModel',()=>{const k=chosen();return removing('remove-model',{model:k},label(k)+' was removed.');},'Remove this model?');
 window.tylerSettings.onLocalImages?.(e=>{
  if(e.kind==='images-status'){status=e.status;if(!installing)render();return;}
  if(e.kind==='images-job'){if(e.step&&e.steps&&testing)say('liTestState','Making a test picture: step '+e.step+' of '+e.steps+(e.secondsPerStep?' ('+e.secondsPerStep.toFixed(1)+' s a step)':'')+'…');return;}
  if(e.kind==='images-install'){
   const pct=e.totalBytes?Math.min(100,Math.round(100*(e.bytes||0)/e.totalBytes)):null;
   if(pct!==null&&e.phase==='download')$('liProgress').style.width=pct+'%';
   say('liProgressText',(e.label||'')+(e.totalBytes&&e.phase==='download'?' · '+size(e.bytes||0)+' of '+size(e.totalBytes):''));
   if(e.phase==='done'){installing=false;failed=false;plans={};$('liProgress').style.width='100%';say('liInstallState','Images on this PC are ready. Make a test image to see how fast it is here.');void load();}
   if(e.phase==='failed'){installing=false;failed=true;plans={};say('liInstallState',e.label+' Press Retry to carry on (what was downloaded is kept).');void load();}
  }
 });
 const setup=()=>{asked=true;relevant();setTimeout(()=>$('localImages').scrollIntoView({block:'start'}),50);};
 window.addEventListener('tyler:local-images-setup',setup);
 document.getElementById('imgStyles')?.addEventListener('change',relevant);
 void load();
 if(location.hash==='#localImages')setTimeout(setup,300);
 window.addEventListener('hashchange',()=>{if(location.hash==='#localImages')setup();});
})();

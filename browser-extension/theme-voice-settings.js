// Settings → Voice → Theme voices (v2.35, desktop app). Install, repair and remove the local voice
// engine; choose Quality or Lightweight; test, hear and replace each theme's voice. Everything heavy
// happens in the desktop app's main process (app/theme-voices); this page only shows it.
(() => {
 'use strict';
 const root=document.getElementById('theme-voices'),tv=window.tylerSettings?.voices;if(!root||!tv)return;
 const $=id=>document.getElementById(id),GB=1024**3,gb=n=>(n/GB).toFixed(n>=10*GB?0:1)+' GB';
 let status=null,voices=[],models={},installing=false,plans={},failed=false;
 const say=(id,t)=>{$(id).textContent=t;};
 function hardwareLine(s){
  const h=s.hardware;if(!h)return 'Checking this PC…';
  const gpu=(h.gpus||[]).map(g=>g.name+(g.vramTotal?' ('+gb(g.vramTotal)+(g.vramFree?', '+gb(g.vramFree)+' free':'')+(g.driver?', driver '+g.driver:'')+')':'')).join('; ')||'no graphics card found';
  return h.cpu.model+' ('+h.cpu.threads+' threads) · '+gb(h.ram.total)+' memory · '+gpu+(h.disk?.free!=null?' · '+gb(h.disk.free)+' free on the data drive':'')+'.';
 }
 async function planText(){
  const mode=$('tvMode').value,both=$('tvBoth').checked,device=$('tvDevice').value,key=mode+both+device;
  try{plans[key]=plans[key]||await tv('plan',{mode,both,device});const p=plans[key];
   if(!p.download)return 'Everything for this choice is already on this PC: nothing to download.';
   return 'Downloads '+gb(p.download)+(p.engineReady?' (the model'+(p.models.length>1?'s':'')+'; the voice engine is already installed)':' ('+p.fileCount+' files: the voice engine '+gb(p.runtimeBytes)+(p.runtime==='windows-cuda'?' with graphics-card support':'')+', model'+(p.models.length>1?'s ':' ')+gb(p.modelBytes)+')')+(p.reused?', reusing '+gb(p.reused)+' already on this PC,':'')+' and needs about '+gb(p.disk)+' of disk space.';}
  catch(e){return 'Couldn’t work out the download: '+e.message;}
 }
 async function load(){
  let r;try{r=await tv('status');}catch(e){say('tvInstallState','Theme voices aren’t available: '+e.message);return;}
  status=r.status;voices=r.voices;models=r.models;installing=!!status.installing;if(installing)$('tvProgressWrap').hidden=false;if(status.installError&&!status.ready)failed=true;render();
  if(!installing)say('tvInstallState',await stateText());
 }
 async function stateText(){
  const s=status;if(!s)return '…';
  if(s.installing)return 'Installing…';
  const plan=await planText();
  if(!s.installed)return 'Not installed. '+plan;
  if(!s.current)return 'Installed, but this version of Tyler needs a newer voice engine: press Update. Unchanged parts are reused. '+plan;
  const have=Object.entries(s.models).filter(([,v])=>v).map(([k])=>k==='quality'?'Quality':'Lightweight').join(' and ')||'no model';
  const chk=s.check?(s.check.ok?' Last voice check: '+s.check.seconds+' s of speech in '+(s.check.ms/1000).toFixed(1)+' s on the '+(s.check.device==='cuda'?'graphics card':'processor')+' ('+new Date(s.check.at).toLocaleString()+').':' Last voice check failed: '+s.check.error):'';
  return 'Installed: '+have+'.'+(s.needs==='model'?' The '+s.modeLabel+' model isn’t installed yet: press Install to add it. '+plan:'')+chk;
 }
 function render(){
  const s=status;if(!s)return;
  say('tvHardware',hardwareLine(s));
  const rec=s.recommendation;$('tvAdvice').replaceChildren(...(rec?.notes||[]).map(t=>{const li=document.createElement('li');li.textContent=t;return li;}));
  if(rec){const opt=[...$('tvMode').options];for(const o of opt)o.textContent=o.textContent.replace(/ · suggested$/,'')+(o.value===rec.mode?' · suggested':'');}
  if(document.activeElement!==$('tvMode'))$('tvMode').value=s.mode;
  $('tvModeNote').textContent=s.modeChosen?'Your choice. Suggested for this PC: '+(rec?.mode==='light'?'Lightweight':'Quality')+'.':'Not chosen yet: the suggestion for this PC is selected. Tyler never switches mode by itself.';
  const st=s.settings;$('tvNativeUse').checked=st.nativeVoices!==false;$('tvDevice').value=st.device==='cpu'?'cpu':'auto';$('tvIdle').value=String(st.idleMinutes);$('tvProcessed').checked=st.processed!==false;
  $('tvChat').checked=!!st.chat;$('tvChatAccess').value=st.chatAccess==='selected'?'selected':'everyone';$('tvChatCooldown').value=String(st.chatCooldown??20);$('tvChatAllowed').value=st.chatAllowed||'';
  $('tvInstall').textContent=failed?'Retry':!s.installed?'Install theme voices':!s.current||s.updateAvailable?'Update theme voices':s.needs==='model'||$('tvBoth').checked?'Install the model':'Reinstall';
  $('tvRemove').disabled=!s.installed||installing;$('tvRemoveQuality').disabled=!s.models?.quality||installing;$('tvRemoveLight').disabled=!s.models?.light||installing;
  $('tvRemoveQuality').textContent='Remove the Quality model'+(models.quality?' ('+gb(models.quality.bytes)+')':'');$('tvRemoveLight').textContent='Remove the Lightweight model'+(models.light?' ('+gb(models.light.bytes)+')':'');
  for(const id of ['tvCheck','tvRepair','tvUnload'])$(id).disabled=!s.installed||installing;
  $('tvInstall').disabled=installing;$('tvOffline').disabled=installing;$('tvCancel').hidden=!installing;
  renderVoices();
 }
 function renderVoices(){
  const box=$('tvVoices');box.replaceChildren();
  for(const v of voices){
   const row=document.createElement('div');row.className='tv-voice';row.dataset.theme=v.theme;
   const a=document.createElement('div'),b=document.createElement('div'),c=document.createElement('div');c.className='tv-buttons';
   a.innerHTML='<b></b><small></small>';a.querySelector('b').textContent=v.name+' · '+v.theme;a.querySelector('small').textContent=(v.relationship?v.relationship+'. ':'')+(v.statusNote||'');
   b.innerHTML='<span class="tv-tag"></span>';const tag=b.querySelector('.tv-tag');tag.dataset.status=v.status;tag.textContent=v.custom?'Your recording':v.status==='ready'?'Ready':v.status==='weak'?'Weak clone':v.status==='approximation'?'Approximation':v.status==='insufficient'?'Too little audio':v.status==='missing'?'No recordings':'Not rated yet';
   const btn=(label,fn,disabled=false)=>{const x=document.createElement('button');x.type='button';x.className='secondary';x.textContent=label;x.disabled=disabled;x.onclick=()=>fn(x).catch(e=>say('tvVoiceState',v.name+': '+e.message));c.append(x);};
   btn('Reference',async()=>{const r=await tv('sample',{theme:v.theme});play(r.audio,r.type);say('tvVoiceState','Playing '+v.name+'’s original reference recording (sample playback, not the clone).');},!v.hasReference);
   if(v.sample&&!v.custom)btn('Original line',async()=>{const r=await tv('sample',{theme:v.theme,kind:'line'});play(r.audio,r.type);say('tvVoiceState','Playing the original “'+v.sample+'” (sample playback: the game’s own recording, not the clone). Press Test to hear the clone.');});
   btn('Test',async x=>{x.disabled=true;say('tvVoiceState','Making '+v.name+'’s voice… (the first one loads the model)');try{const r=await tv('test',{theme:v.theme,text:$('tvTestText').value,fresh:true});play(r.audio);say('tvVoiceState',v.name+': '+r.clip.seconds.toFixed(1)+' s of new speech made in '+(r.clip.ms/1000).toFixed(1)+' s on the '+(r.clip.device==='cuda'?'graphics card':'processor')+(r.clip.processed?' (with its radio/mask sound; dry version next)':'')+'.');if(r.dry)setTimeout(()=>play(r.dry),Math.ceil(r.clip.seconds*1000)+600);}finally{x.disabled=false;}},!v.hasReference||!status?.ready);
   btn('Replace…',async()=>{pick(v);});
   if(v.custom)btn('Restore original',async()=>{await tv('restore-reference',{theme:v.theme});say('tvVoiceState',v.name+' uses its built-in reference again.');await load();});
   row.append(a,b,c);box.append(row);
  }
 }
 let audioEl=null;
 function play(b64,type='audio/wav'){try{audioEl?.pause();}catch{}audioEl=new Audio('data:'+type+';base64,'+b64);void audioEl.play().catch(e=>say('tvVoiceState','Couldn’t play it here: '+e.message));}
 let picking=null;
 function pick(v){picking=v;$('tvRefFile').value='';$('tvRefFile').click();}
 let refData=null;
 $('tvRefFile').onchange=async()=>{
  const f=$('tvRefFile').files?.[0],v=picking;if(!f||!v)return;
  if(f.size>20*1024*1024){say('tvVoiceState','That recording is over 20 MB. Use 5–20 seconds of clear speech.');return;}
  const data=await new Promise((res,rej)=>{const r=new FileReader();r.onload=()=>res(String(r.result).split(',')[1]);r.onerror=()=>rej(r.error);r.readAsDataURL(f);});
  refData={theme:v.theme,name:v.name,data,fileName:f.name};$('tvRefTitle').textContent='What is said in “'+f.name+'” (new reference for '+v.name+')';$('tvRefText').value='';$('tvRefForm').hidden=false;$('tvRefText').focus();
 };
 $('tvRefCancel').onclick=()=>{refData=null;$('tvRefForm').hidden=true;};
 $('tvRefSave').onclick=async()=>{if(!refData)return;try{await tv('set-reference',{theme:refData.theme,data:refData.data,fileName:refData.fileName,transcript:$('tvRefText').value});say('tvVoiceState',refData.name+' now uses your recording. Press Test to hear it.');refData=null;$('tvRefForm').hidden=true;await load();}catch(e){say('tvVoiceState',e.message);}};
 async function saveSettings(){
  const values={mode:$('tvMode').value,device:$('tvDevice').value,idleMinutes:Number($('tvIdle').value),processed:$('tvProcessed').checked,chat:$('tvChat').checked,chatAccess:$('tvChatAccess').value,chatCooldown:Number($('tvChatCooldown').value),chatAllowed:$('tvChatAllowed').value};
  if(values.chatAccess==='selected'&&!/7656119\d{10}/.test(values.chatAllowed))throw Error('Add at least one SteamID64, or let everyone use !say.');
  await tv('settings',{values});say('tvVoiceState','Theme voice settings saved.');await load();
 }
 $('tvSaveSettings').onclick=()=>saveSettings().catch(e=>say('tvVoiceState',e.message));
 for(const id of ['tvMode','tvBoth','tvDevice'])$(id).addEventListener('change',async()=>{if(id!=='tvBoth')await tv('settings',{values:{[id==='tvMode'?'mode':'device']:$(id).value}}).catch(()=>{});say('tvInstallState',await stateText());render();});
 async function install(offline=[]){
  installing=true;render();$('tvProgressWrap').hidden=false;say('tvInstallState','Installing… You can keep using Tyler meanwhile.');
  try{await tv('install',{mode:$('tvMode').value,both:$('tvBoth').checked,device:$('tvDevice').value,offline});}catch(e){installing=false;say('tvInstallState',e.message);render();}
 }
 $('tvInstall').onclick=()=>void install();
 $('tvCancel').onclick=()=>void tv('cancel').catch(()=>{});
 $('tvOffline').onclick=()=>{$('tvOfflineForm').hidden=false;$('tvOfflineDir').focus();};
 $('tvOfflineCancel').onclick=()=>{$('tvOfflineForm').hidden=true;};
 $('tvOfflineGo').onclick=()=>{const dir=$('tvOfflineDir').value.trim().replace(/^["']+|["']+$/g,'');if(!dir)return;$('tvOfflineForm').hidden=true;void install([dir]);};
 $('tvCheck').onclick=async()=>{say('tvInstallState','Making a test voice…');try{const c=await tv('check');say('tvInstallState','Voice check passed: '+c.seconds+' s of speech in '+(c.ms/1000).toFixed(1)+' s on the '+(c.device==='cuda'?'graphics card':'processor')+' ('+c.rtf+' s per second of speech).');}catch(e){say('tvInstallState','Voice check failed: '+e.message);}await load();};
 $('tvRepair').onclick=async()=>{say('tvInstallState','Checking every file…');try{const r=await tv('repair');say('tvInstallState',r.repaired?'Repaired '+r.problems+' problem(s); voice check passed.':'All files are fine; voice check passed.');}catch(e){say('tvInstallState','Repair failed: '+e.message);}await load();};
 const removeConfirm=async(op,extra,label)=>{say('tvInstallState','Removing…');try{await tv(op,extra);plans={};say('tvInstallState',label);}catch(e){say('tvInstallState',e.message);}await load();};
 let armed=null;const twice=(id,fn,ask)=>{$(id).onclick=()=>{if(armed!==id){armed=id;say('tvInstallState',ask+' Press the button again to confirm.');setTimeout(()=>{if(armed===id)armed=null;},6000);return;}armed=null;void fn();};};
 twice('tvRemove',()=>removeConfirm('remove',{},'Theme voices removed. Your settings, recordings and saved clips are kept.'),'This removes the voice engine and models (your settings, recordings and saved clips stay).');
 twice('tvRemoveQuality',()=>removeConfirm('remove-model',{model:'quality'},'The Quality model was removed.'),'Remove the Quality model?');
 twice('tvRemoveLight',()=>removeConfirm('remove-model',{model:'light'},'The Lightweight model was removed.'),'Remove the Lightweight model?');
 $('tvUnload').onclick=async()=>{await tv('unload');say('tvVoiceState','The voice engine is closed; its memory is free.');await load();};
 $('tvClearCache').onclick=async()=>{await tv('clear-cache');say('tvVoiceState','Cached clips cleared.');};
 $('tvOpenFolder').onclick=e=>{e.preventDefault();void tv('open-folder');};
 window.tylerSettings.onVoices?.(e=>{
  if(e.kind==='status'){status=e.status;if(!installing)render();return;}
  if(e.kind==='install'){
   const pct=e.totalBytes?Math.min(100,Math.round(100*(e.bytes||0)/e.totalBytes)):null;
   if(pct!==null)$('tvProgress').style.width=pct+'%';
   say('tvProgressText',(e.label||'')+(e.totalBytes&&e.phase==='download'?' · '+gb(e.bytes||0)+' of '+gb(e.totalBytes):'')+(e.total&&e.phase!=='download'?' · '+(e.done||0)+'/'+e.total:''));
   if(e.phase==='done'){installing=false;failed=false;plans={};$('tvProgress').style.width='100%';say('tvInstallState','Theme voices are ready.'+(e.check?' Voice check: '+e.check.seconds+' s of speech in '+(e.check.ms/1000).toFixed(1)+' s.':''));void load();}
   if(e.phase==='failed'){installing=false;failed=true;plans={};say('tvInstallState',e.label+' Tyler works as before without theme voices; press Retry to carry on (what was downloaded is kept).');void load();}
  }
 });
 async function native(){try{const n=await tv('native-status');say('tvNative',!n.windows?'Only on Windows.':n.sam||n.mary?'Found on this PC: '+[n.sam&&'Microsoft Sam',n.mary&&'Microsoft Mary'].filter(Boolean).join(' and ')+'. Tyler uses them for those two themes.':'Not on this PC. Tyler uses the clones (approximations) for those two themes.');$('tvNativeGet').hidden=!n.windows||(n.sam&&n.mary);}catch(e){say('tvNative',e.message);}}
 $('tvNativeCheck').onclick=()=>void native();
 $('tvNativeGet').onclick=async()=>{say('tvNative','Downloading Microsoft’s Speech SDK 5.1 and checking it…');try{await tv('native-install');say('tvNative','Microsoft’s installer is open: follow it (Windows asks for permission), then press Check again.');}catch(e){say('tvNative',e.message);}};
 $('tvNativeUse').onchange=()=>void tv('settings',{values:{nativeVoices:$('tvNativeUse').checked}});
 void load();void native();
 // Setup's "Also add local theme voices" opens this guided step; nothing downloads until Install now.
 async function guide(){
  $('tvGuide').hidden=false;root.scrollIntoView({block:'start'});
  for(let i=0;i<20&&!status;i++)await new Promise(r=>setTimeout(r,250));
  if(status?.installed&&status.current&&status.ready){$('tvGuide').hidden=true;return;}
  const rec=status?.recommendation;$('tvGuidePc').textContent=status?hardwareLine(status)+(rec?' Suggested: '+(rec.mode==='light'?'Lightweight':'Quality')+' on the '+(rec.device==='cuda'?'graphics card':'processor')+'. '+rec.notes.join(' '):''):'';
  $('tvGuidePlan').textContent=await planText();
 }
 $('tvGuideGo').onclick=()=>{$('tvGuide').hidden=true;void install();};
 $('tvGuideSkip').onclick=()=>{$('tvGuide').hidden=true;history.replaceState(null,'','#theme-voices');say('tvInstallState','Skipped. Install theme voices here whenever you like.');};
 if(location.hash==='#theme-voices-setup')void guide();
 else if(location.hash==='#theme-voices')setTimeout(()=>root.scrollIntoView({block:'start'}),300);
 window.addEventListener('hashchange',()=>{if(location.hash==='#theme-voices-setup')void guide();});
})();

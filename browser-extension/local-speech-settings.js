// Settings → On this PC → hearing and voice for calls (v2.39, desktop app).
// See the downloads and their sizes first, install either or both, run the quick checks, close or
// remove them. Also the status line under Settings → Voice → Standard voice when Hearing → This PC
// or Voice on this PC (Kokoro) is chosen. Everything heavy happens in the desktop app's main process
// (app/local-ai/speech.cjs); this page only shows it.
(() => {
 'use strict';
 const root=document.getElementById('localAI'),la=window.tylerSettings?.localAI;if(!root||!la)return;
 const $=id=>document.getElementById(id),GB=1024**3,MB=1024**2;
 const size=n=>n>=GB?(n/GB).toFixed(n>=100*GB?0:1).replace(/\.0$/,'')+' GB':n>=10*MB?Math.round(n/MB)+' MB':Math.max(.1,n/MB).toFixed(1).replace(/\.0$/,'')+' MB';
 const sec=ms=>(ms/1000).toFixed(ms<10000?2:1)+' s';
 const say=(id,t)=>{const el=$(id);if(el)el.textContent=t;};
 const NAMES={hearing:'hearing (Parakeet)',voice:'the voice (Kokoro)'};
 let status=null,installing=false,failed=false,planText='';
 const picks=()=>['hearing','voice'].filter(p=>$(p==='hearing'?'lsPickHearing':'lsPickVoice').checked);
 const wanted=()=>picks().filter(p=>!status?.installed?.[p]);
 const chosen=()=>({hearing:$('voiceHearing')?.value==='local',voice:$('speechEngine')?.value==='kokoro'});
 function relevant(){
  const c=chosen(),i=status?.installed||{};
  root.dataset.speechRelevant=String(c.hearing||c.voice||!!i.hearing||!!i.voice||installing);
  // In the AI zone: what's chosen in Settings → Voice and what's installed here.
  const note=$('lsNote'),missing=['hearing','voice'].filter(p=>c[p]&&!i[p]),unused=['hearing','voice'].filter(p=>i[p]&&!c[p]);
  if(status&&missing.length){note.hidden=false;note.textContent=(missing.length===2?'Hearing → This PC and Voice on this PC (Kokoro) are':missing[0]==='hearing'?'Hearing → This PC is':'Voice on this PC (Kokoro) is')+' chosen in Settings → Voice, but '+missing.map(p=>NAMES[p]).join(' and ')+(missing.length===2?' aren’t':' isn’t')+' installed yet. Until '+(missing.length===2?'they are':'it is')+', voice turns '+(missing.includes('hearing')?'fail':'are answered in text')+' and say why: Tyler doesn’t switch to the cloud by himself.';}
  else if(status&&unused.length&&!installing){note.hidden=false;note.textContent='Installed and ready. To use '+(unused.length===2?'them':'it')+', choose '+unused.map(p=>p==='hearing'?'Hearing → This PC':'Speaking voice → Voice on this PC (Kokoro)').join(' and ')+' in Settings → Voice → Standard voice, then press Save settings.';}
  else note.hidden=true;
  // In the Voice zone: one line about the parts chosen there.
  const v=$('voiceLocalState');if(!v)return;
  const lines=['hearing','voice'].filter(p=>c[p]).map(p=>i[p]?'✓ '+(p==='hearing'?'Hearing':'The voice')+' on this PC is installed'+(status.running?.[p]?' and running':'')+'.':(p==='hearing'?'Hearing':'The voice')+' on this PC isn’t installed yet ('+size(status.sizes?.[p]||0)+' download).');
  if(!lines.length||!status){v.hidden=true;return;}
  v.hidden=false;v.replaceChildren(lines.join(' '));
  if(missing.length){const a=document.createElement('a');a.href='#localSpeech';a.textContent='Install '+(missing.length===2?'them':'it')+' in On this PC';a.addEventListener('click',e=>{e.preventDefault();location.hash='#localSpeech';setTimeout(()=>$('localSpeech')?.scrollIntoView({block:'start'}),120);});v.append(' ',a,'.');}
  else if(c.hearing&&c.voice&&$('aiProvider')?.value==='local')v.append(' Text, hearing and voice all run on this PC: a Standard voice call needs no key.');
 }
 function checkText(part,c){
  if(!c)return '';const when=new Date(c.at).toLocaleString();
  if(!c.ok)return 'Last '+(part==='hearing'?'hearing':'voice')+' check failed: '+c.error;
  if(part==='hearing')return 'Hearing check ('+when+'): a '+c.seconds+' s recording heard in '+sec(c.ms)+(c.startMs?' (after loading for '+sec(c.startMs)+')':'')+': “'+c.text+'”'+(c.words>=100?' (every word right).':' ('+c.words+'% of the words right).');
  return 'Voice check ('+when+'): '+c.voice+' · first audio after '+sec(c.firstMs)+' · the whole sentence ('+c.seconds+' s of speech) in '+sec(c.ms)+(c.startMs?' (after loading for '+sec(c.startMs)+')':'')+'.';
 }
 async function plan(){
  const parts=wanted();if(!parts.length){planText='';return;}
  try{const p=await la('speech-plan',{parts});
   const bits=[p.runtimeBytes?'the engine '+size(p.runtimeBytes):null,p.hearingBytes?'hearing '+size(p.hearingBytes):null,p.voiceBytes?'the voice '+size(p.voiceBytes):null].filter(Boolean).join(', ');
   planText='Installing downloads '+size(p.download)+' ('+bits+(p.already?'; '+size(p.already)+' is already downloaded':'')+') and needs about '+size(p.disk)+' of disk space'+(p.free!=null?' ('+size(p.free)+' is free)':'')+'.';}
  catch(e){planText='Couldn’t work out the download: '+e.message;}
 }
 function stateText(){
  const s=status;if(!s)return '…';
  if(!s.supported)return 'Hearing and voice on this PC need Windows.';
  if(s.installing)return 'Installing '+(s.installing.parts||[]).map(p=>NAMES[p]).join(' and ')+'…';
  const have=['hearing','voice'].filter(p=>s.installed[p]);
  if(!have.length)return 'Not installed. '+(planText||'Tick what to install.');
  const run=['hearing','voice'].filter(p=>s.running?.[p]);
  const err=['hearing','voice'].map(p=>s.lastError?.[p]?.message).filter(Boolean)[0];
  return 'Installed: '+have.map(p=>NAMES[p]).join(' and ')+', with sherpa-onnx '+s.engine.version+'.'+(run.length?' Running now: '+run.map(p=>p==='hearing'?'hearing':'the voice').join(' and ')+'.':' Not running: each starts with the first turn that needs it.')+(wanted().length?' '+planText:'')+(err?' Last problem: '+err:'');
 }
 function render(){
  const s=status;if(!s)return;
  for(const p of ['hearing','voice']){const tag=$(p==='hearing'?'lsTagHearing':'lsTagVoice');tag.textContent=s.installed[p]?'Installed':'';tag.dataset.kind=s.installed[p]?'installed':'';}
  say('lsSizeHearing',(s.installed.hearing?'Installed: '+size(s.sizes.hearing)+' on disk':size(s.sizes.hearing)+' download')+' · about 1 GB of memory while it runs');
  say('lsSizeVoice',(s.installed.voice?'Installed: '+size(s.sizes.voice)+' on disk':size(s.sizes.voice)+' download')+' · about 0.5 GB of memory while it runs');
  say('lsEngineNote','Both use the sherpa-onnx speech engine (version '+s.engine.version+', '+size(s.sizes.runtime)+' download)'+(s.installed.runtime?', installed.':', installed with whichever comes first.'));
  const need=wanted();
  $('lsInstall').textContent=failed?'Retry':need.length?'Install '+need.map(p=>p==='hearing'?'hearing':'the voice').join(' and '):'Installed';
  $('lsInstall').disabled=installing||!need.length||!s.supported;$('lsOffline').disabled=installing||!s.supported;$('lsCancel').hidden=!installing;
  for(const p of ['hearing','voice'])$(p==='hearing'?'lsPickHearing':'lsPickVoice').disabled=installing||!!s.installed[p];
  $('lsCheckHearing').disabled=installing||!s.installed.hearing;$('lsCheckVoice').disabled=installing||!s.installed.voice;
  $('lsUnload').disabled=!s.running?.hearing&&!s.running?.voice;
  $('lsRemoveHearing').disabled=installing||!s.installed.hearing;$('lsRemoveVoice').disabled=installing||!s.installed.voice;
  $('lsRemoveHearing').textContent='Remove hearing ('+size(s.sizes.hearing)+')';$('lsRemoveVoice').textContent='Remove the voice ('+size(s.sizes.voice)+')';
  if(document.activeElement!==$('lsIdle'))$('lsIdle').value=String(s.settings?.idleMinutes??10);
  if(!$('lsCheckState').dataset.fresh)say('lsCheckState',[checkText('hearing',s.checks?.hearing),checkText('voice',s.checks?.voice)].filter(Boolean).join(' '));
  relevant();
 }
 async function load(){
  let r;try{r=await la('speech-status');}catch(e){say('lsInstallState','Hearing and voice on this PC aren’t available: '+e.message);root.dataset.speechRelevant=String(chosen().hearing||chosen().voice);return;}
  status=r.status;installing=!!status.installing;if(installing)$('lsProgressWrap').hidden=false;if(status.installError&&!(status.installed.hearing||status.installed.voice))failed=true;
  await plan();render();say('lsInstallState',stateText());
  if(installing&&status.installing?.totalBytes){$('lsProgress').style.width=Math.min(100,Math.round(100*(status.installing.bytes||0)/status.installing.totalBytes))+'%';say('lsProgressText',(status.installing.label||'')+' · '+size(status.installing.bytes||0)+' of '+size(status.installing.totalBytes));}
 }
 async function install(offline=[]){
  const parts=wanted();if(!parts.length)return;
  installing=true;render();$('lsProgressWrap').hidden=false;$('lsProgress').style.width='0%';say('lsInstallState','Installing '+parts.map(p=>NAMES[p]).join(' and ')+'… You can keep using Tyler meanwhile.');
  try{await la('speech-install',{parts,offline});}catch(e){installing=false;say('lsInstallState',e.message);render();}
 }
 for(const id of ['lsPickHearing','lsPickVoice'])$(id).addEventListener('change',async()=>{failed=false;await plan();render();say('lsInstallState',stateText());});
 $('lsInstall').onclick=()=>void install();
 $('lsCancel').onclick=()=>void la('speech-cancel').catch(()=>{});
 $('lsOffline').onclick=()=>{$('lsOfflineForm').hidden=false;$('lsOfflineDir').focus();};
 $('lsOfflineCancel').onclick=()=>{$('lsOfflineForm').hidden=true;};
 $('lsOfflineGo').onclick=()=>{const dir=$('lsOfflineDir').value.trim().replace(/^["']+|["']+$/g,'');if(!dir)return;$('lsOfflineForm').hidden=true;void install([dir]);};
 $('lsIdle').addEventListener('change',async()=>{try{await la('speech-settings',{values:{idleMinutes:Number($('lsIdle').value)}});say('lsInstallState','Saved. '+stateText());}catch(e){say('lsInstallState',e.message);}});
 let ctx=null;
 async function play(b64){ctx??=new AudioContext();await ctx.resume();const bytes=Uint8Array.from(atob(b64),c=>c.charCodeAt(0));const buf=await ctx.decodeAudioData(bytes.buffer);const src=ctx.createBufferSource();src.buffer=buf;src.connect(ctx.destination);src.start();}
 async function check(part){
  const b=$(part==='hearing'?'lsCheckHearing':'lsCheckVoice');b.disabled=true;$('lsCheckState').dataset.fresh='1';
  say('lsCheckState',status?.running?.[part]?(part==='hearing'?'Hearing the built-in recording…':'Saying one sentence…'):(part==='hearing'?'Starting hearing on this PC, then hearing the built-in recording…':'Starting the voice on this PC, then saying one sentence…'));
  try{const c=await la('speech-check',{part,voice:$('kokoroVoice')?.value||''});if(c.audio)await play(c.audio).catch(()=>{});say('lsCheckState',checkText(part,c));}
  catch(e){say('lsCheckState',(part==='hearing'?'Hearing':'Voice')+' check failed: '+e.message);}
  finally{b.disabled=false;}await load();
 }
 $('lsCheckHearing').onclick=()=>void check('hearing');$('lsCheckVoice').onclick=()=>void check('voice');
 $('lsUnload').onclick=async()=>{await la('speech-unload').catch(()=>{});await load();say('lsInstallState','Hearing and voice on this PC are closed; their memory is free. '+stateText());};
 let armed=null;const twice=(id,fn,ask)=>{$(id).onclick=()=>{if(armed!==id){armed=id;say('lsInstallState',ask+' Press the button again to confirm.');setTimeout(()=>{if(armed===id)armed=null;},6000);return;}armed=null;void fn();};};
 const remove=async part=>{say('lsInstallState','Removing…');try{await la('speech-remove',{part});failed=false;await load();say('lsInstallState',(part==='hearing'?'Hearing':'The voice')+' on this PC was removed. '+stateText());}catch(e){say('lsInstallState',e.message);}};
 twice('lsRemoveHearing',()=>remove('hearing'),'This removes hearing on this PC (Parakeet).');
 twice('lsRemoveVoice',()=>remove('voice'),'This removes the voice on this PC (Kokoro).');
 window.tylerSettings.onLocalAI?.(e=>{
  if(e.kind==='speech-status'){status=e.status;if(!installing)render();return;}
  if(e.kind==='speech-install'){
   const pct=e.totalBytes?Math.min(100,Math.round(100*(e.bytes||0)/e.totalBytes)):null;
   if(pct!==null&&e.phase==='download')$('lsProgress').style.width=pct+'%';
   say('lsProgressText',(e.label||'')+(e.totalBytes&&e.phase==='download'?' · '+size(e.bytes||0)+' of '+size(e.totalBytes):''));
   if(e.phase==='done'&&e.parts){installing=false;failed=false;$('lsProgress').style.width='100%';void load().then(()=>say('lsInstallState','Ready. Run a quick check to see how fast it is here, then choose it in Settings → Voice → Standard voice.'));}
   if(e.phase==='failed'){installing=false;failed=true;say('lsInstallState',e.label+' Tyler works as before; press Retry to carry on (what was downloaded is kept).');void load();}
  }
 });
 // What's chosen in Settings → Voice changes what this section says (and whether it shows at all).
 for(const id of ['voiceHearing','speechEngine','aiProvider'])$(id)?.addEventListener('change',relevant);
 window.addEventListener('tyler:ai-provider',relevant);window.addEventListener('tyler:voice-choice',relevant);
 void load();
 if(location.hash==='#localSpeech')setTimeout(()=>$('localSpeech')?.scrollIntoView({block:'start'}),300);
})();

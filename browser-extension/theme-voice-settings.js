// Settings → Theme voices (v2.35, desktop app). Install, repair and remove the local voice
// engine; choose Quality or Lightweight; test, hear and replace each theme's voice. Everything heavy
// happens in the desktop app's main process (app/theme-voices); this page only shows it.
// v2.41: Character voices: pick a character per theme (the theme's own voice stays the default), and hear
// its original recording or new generated speech. An improved built-in voice can be set back to its
// earlier version. v2.43: their recordings are built into the app (nothing to import); Import character
// voices stays as a second way to repair or add recordings from the owner's packs.
// v2.44: the optional "sharper voice" (kNN-VC voice conversion) for Medic, Lash and Kelvin: a separate download
// (its size and the free disk space are shown first; nothing downloads by itself) and a switch per character,
// off by default, whose note says what it does, what it costs and how it was measured (not listened to).
(() => {
 'use strict';
 const root=document.getElementById('theme-voices'),tv=window.tylerSettings?.voices;if(!root||!tv)return;
 const $=id=>document.getElementById(id),GB=1024**3,gb=n=>(n/GB).toFixed(n>=10*GB?0:1)+' GB';
 let status=null,voices=[],models={},installing=false,plans={},failed=false,charStatus=null;
 const say=(id,t)=>{$(id).textContent=t;};
 function hardwareLine(s){
  const h=s.hardware;if(!h)return 'Checking this PC…';
  const gpu=(h.gpus||[]).map(g=>g.name+(g.vramTotal?' ('+gb(g.vramTotal)+(g.vramFree?', '+gb(g.vramFree)+' free':'')+(g.driver?', driver '+g.driver:'')+')':'')).join('; ')||'no graphics card found';
  return h.cpu.model+' ('+h.cpu.threads+' threads) · '+gb(h.ram.total)+' memory · '+gpu+(h.disk?.free!=null?' · '+gb(h.disk.free)+' free on the data drive':'')+'.';
 }
 async function planText(){
  const mode=$('tvMode').value,both=$('tvBoth').checked,device=$('tvDevice').value,engine=$('tvEngine').value,key=mode+both+device+engine;
  try{plans[key]=plans[key]||await tv('plan',{mode,both,device,engine});const p=plans[key];
   if(!p.download)return 'Everything for this choice is already on this PC: nothing to download.';
   const mb=n=>n<GB?Math.max(1,Math.round(n/1024**2))+' MB':gb(n),kind=p.runtime==='windows-cuda-fast'?' with graphics-card support and the fast engine':p.runtime==='windows-cuda'?' with graphics-card support':'';
   // Switching engines: only what's different is downloaded; say that, not the whole engine's size.
   if(!p.engineReady&&p.reused)return 'Downloads '+mb(p.download)+' ('+p.fileCount+' file'+(p.fileCount===1?'':'s')+(kind?' for the voice engine'+kind:'')+'; '+gb(p.reused)+' already on this PC is reused) and needs about '+mb(p.disk)+' of disk space while it’s set up.';
   return 'Downloads '+mb(p.download)+(p.engineReady?' (the model'+(p.models.length>1?'s':'')+'; the voice engine is already installed)':' ('+p.fileCount+' files: the voice engine '+gb(p.runtimeBytes)+kind+', model'+(p.models.length>1?'s ':' ')+gb(p.modelBytes)+')')+(p.reused?', reusing '+gb(p.reused)+' already on this PC,':'')+' and needs about '+mb(p.disk)+' of disk space.';}
  catch(e){return 'Couldn’t work out the download: '+e.message;}
 }
 async function load(){
  let r;try{r=await tv('status');}catch(e){say('tvInstallState','Theme voices aren’t available: '+e.message);return;}
  status=r.status;voices=r.voices;models=r.models;charStatus=r.characters||null;installing=!!status.installing;if(installing)$('tvProgressWrap').hidden=false;if(status.installError&&!status.ready)failed=true;render();
  if(!installing)say('tvInstallState',await stateText());
 }
 const engineName=e=>e==='fast'?'fast':'standard';
 function engineNote(s){
  const gpu=s.recommendation?.device==='cuda'||s.engine==='fast',cpu=$('tvDevice').value==='cpu';
  $('tvEngine').options[1].disabled=!gpu||cpu;
  if(!gpu)return 'The fast engine needs an NVIDIA graphics card that the voice engine can use; this PC uses the standard one.';
  if(cpu)return 'With “Processor only” Tyler uses the standard engine (the fast one needs the graphics card).';
  const using=s.installed?' In use: the '+engineName(s.engine)+' engine.':'';
  return (s.engineSwitch?'Takes effect when you press Switch below.':'The fast engine runs the same models and voices on the graphics card, much faster.')+using;
 }
 async function stateText(){
  const s=status;if(!s)return '…';
  if(s.installing)return 'Installing…';
  const plan=await planText();
  if(!s.installed)return 'Not installed. '+plan;
  if(!s.current)return 'Installed, but this version of Tyler needs a newer voice engine: press Update. Unchanged parts are reused. '+plan;
  const have=Object.entries(s.models).filter(([,v])=>v).map(([k])=>k==='quality'?'Quality':'Lightweight').join(' and ')||'no model';
  const chk=s.check?(s.check.ok?' Last voice check: '+s.check.seconds+' s of speech in '+(s.check.ms/1000).toFixed(1)+' s on the '+(s.check.device==='cuda'?'graphics card':'processor')+(s.check.engine==='fast'?' with the fast engine':'')+' ('+new Date(s.check.at).toLocaleString()+').':' Last voice check failed: '+s.check.error):'';
  const sw=s.engineSwitch?' You chose the '+engineName(s.engineWanted)+' engine: press Switch to install it. '+plan:'';
  return 'Installed: '+have+', '+engineName(s.engine)+' engine.'+(s.deviceNote?' '+s.deviceNote:'')+(s.needs==='model'?' The '+s.modeLabel+' model isn’t installed yet: press Install to add it. '+plan:'')+sw+chk;
 }
 function render(){
  const s=status;if(!s)return;
  say('tvHardware',hardwareLine(s));
  const rec=s.recommendation;$('tvAdvice').replaceChildren(...(rec?.notes||[]).map(t=>{const li=document.createElement('li');li.textContent=t;return li;}));
  if(rec){const opt=[...$('tvMode').options];for(const o of opt)o.textContent=o.textContent.replace(/ · suggested$/,'')+(o.value===rec.mode?' · suggested':'');}
  if(document.activeElement!==$('tvMode'))$('tvMode').value=s.mode;
  $('tvModeNote').textContent=s.modeChosen?'Your choice. Suggested for this PC: '+(rec?.mode==='light'?'Lightweight':'Quality')+'.':'Not chosen yet: the suggestion for this PC is selected. Tyler never switches mode by itself.';
  const st=s.settings;$('tvNativeUse').checked=st.nativeVoices!==false;$('tvDevice').value=['cpu','cuda'].includes(st.device)?st.device:'auto';$('tvEngine').value=st.engine==='fast'?'fast':'standard';say('tvEngineNote',engineNote(s));$('tvIdle').value=String(st.idleMinutes);$('tvProcessed').checked=st.processed!==false;
  $('tvChat').checked=!!st.chat;$('tvChatAccess').value=st.chatAccess==='selected'?'selected':'everyone';$('tvChatCooldown').value=String(st.chatCooldown??20);$('tvChatAllowed').value=st.chatAllowed||'';
  $('tvInstall').textContent=failed?'Retry':!s.installed?'Install theme voices':!s.current||s.updateAvailable?'Update theme voices':s.engineSwitch?'Switch to the '+engineName(s.engineWanted)+' engine':s.needs==='model'||$('tvBoth').checked?'Install the model':'Reinstall';
  $('tvRemove').disabled=!s.installed||installing;$('tvRemoveQuality').disabled=!s.models?.quality||installing;$('tvRemoveLight').disabled=!s.models?.light||installing;
  $('tvRemoveQuality').textContent='Remove the Quality model'+(models.quality?' ('+gb(models.quality.bytes)+')':'');$('tvRemoveLight').textContent='Remove the Lightweight model'+(models.light?' ('+gb(models.light.bytes)+')':'');
  for(const id of ['tvCheck','tvRepair','tvUnload'])$(id).disabled=!s.installed||installing;
  $('tvInstall').disabled=installing;$('tvOffline').disabled=installing;$('tvCancel').hidden=!installing;
  renderVoices();renderCharacters();renderConversion();
 }
 // ── v2.44: voice conversion (the "sharper voice") ──
 let convBusy=false;
 // Decimal units here, as the download is described everywhere (1.33 GB = 1,328,180,068 bytes).
 const mb=n=>n<1e9?Math.max(1,Math.round(n/1e6))+' MB':(n/1e9).toFixed(2)+' GB';
 function renderConversion(){
  const c=status?.conversion;if(!c||!$('tvConvState'))return;
  const busy=convBusy||!!c.installing;$('tvConvCancel').hidden=!busy;$('tvConvInstall').hidden=busy||c.current;$('tvConvRemove').hidden=busy||!c.installed&&!c.partial;
  $('tvConvInstall').disabled=!status.installed;$('tvConvInstall').textContent=(c.installed||c.partial?'Download the rest of voice conversion (':'Download voice conversion (')+mb(Math.max(0,c.download-c.partial))+')';
  $('tvConvRemove').textContent='Remove voice conversion'+(c.installed?' ('+mb(c.download)+')':'');
  $('tvConvProgressWrap').hidden=!busy;if(busy)return;
  const free=c.free!=null?' '+(c.free/1e9).toFixed(1)+' GB is free on the data drive.':'';
  say('tvConvState',c.current?'Installed ('+mb(c.download)+'). Switch the sharper voice on for Medic, Lash or Kelvin in their row above.':
   (c.error?c.error.message+' ':'')+(!status.installed?'Install theme voices first: voice conversion runs in their engine. ':'')+
   (c.installed?'A voice conversion file is missing or changed: download it again (only what’s missing is fetched).':'Not installed. The download is about '+mb(c.download)+' (WavLM-Large, 1.26 GB, and a 66 MB vocoder).')+free+
   (c.partial&&!c.current?' A stopped download already has '+mb(c.partial)+': it carries on from there.':''));
 }
 $('tvConvInstall').onclick=async()=>{convBusy=true;renderConversion();$('tvConvProgressWrap').hidden=false;$('tvConvProgress').style.width='0%';say('tvConvState','Starting the download… You can keep using Tyler meanwhile.');
  try{await tv('conversion-install');}catch(e){convBusy=false;say('tvConvState',e.message);renderConversion();}};
 $('tvConvCancel').onclick=()=>void tv('conversion-cancel').catch(()=>{});
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
   btn('Test',async x=>{x.disabled=true;say('tvVoiceState','Making '+v.name+'’s voice… (the first one loads the model)');try{const r=await tv('test',{theme:v.theme,character:'',text:$('tvTestText').value,fresh:true});play(r.audio);say('tvVoiceState',v.name+': '+r.clip.seconds.toFixed(1)+' s of new speech made in '+(r.clip.ms/1000).toFixed(1)+' s on the '+(r.clip.device==='cuda'?'graphics card':'processor')+(r.clip.processed?' (with its radio/mask sound; dry version next)':'')+'.'+(r.clip.deviceNote?' '+r.clip.deviceNote:''));if(r.dry)setTimeout(()=>play(r.dry),Math.ceil(r.clip.seconds*1000)+600);}finally{x.disabled=false;}},!v.hasReference||!status?.ready);
   // v2.41: an improved built-in voice keeps its earlier version; the owner can go back to it (and forward again).
   if((v.versions||[]).length>1&&!v.custom){const pinned=status?.settings?.builtinVersion?.[v.theme],older=Math.min(...v.versions);
    btn(pinned?'Use the improved version':'Use the earlier version',async()=>{await tv('settings',{values:{builtinVersion:{[v.theme]:pinned?0:older}}});say('tvVoiceState',v.name+(pinned?' uses its improved version (v'+v.version+') again.':' uses its earlier version (v'+older+') now.'));await load();});}
   btn('Replace…',async()=>{pick(v);});
   if(v.custom)btn('Restore original',async()=>{await tv('restore-reference',{theme:v.theme});say('tvVoiceState',v.name+' uses its built-in reference again.');await load();});
   row.append(a,b,c);box.append(row);
  }
 }
 // ── v2.41 character voices (v2.42: improved versions from the voice supplement, and going back to the earlier one;
 //    v2.43: built in, so the status line counts what ships and says if a built-in recording is missing or damaged) ──
 const themeName=t=>globalThis.TylerTheme?.info?.[t]?.[0]||t;
 const charTag=c=>!c?null:!c.approved?'Not approved':!c.imported?(c.builtIn?'Damaged':'Not imported'):!c.usable?(c.damaged?'Damaged':/voice supplement/.test(c.problem||'')?'Needs the supplement':'Unavailable'):c.nonlexical?'Non-lexical':c.status==='ready'?'Ready':c.status==='weak'?'Weak clone':c.status==='approximation'?'Approximation':'Not rated yet';
 let charBusy=false;
 function charSummary(){
  const all=voices.flatMap(v=>v.characters||[]),ok=all.filter(c=>c.usable).length,imp=all.filter(c=>c.imported).length;
  if(!all.length)return 'This version lists no character voices.';
  const themes=voices.filter(v=>v.characters?.length).length;
  // v2.43: the recordings ship with the app. A damaged install is said plainly, with what each affected character does instead.
  if(all.every(c=>c.builtIn)){const bad=all.filter(c=>c.damaged).length;
   return all.length+' character voices built in ('+ok+' offered) for '+themes+' themes. Each theme keeps its own voice until you pick a character.'+
    (bad?' '+bad+' '+(bad===1?'has':'have')+' a missing or damaged built-in recording: run the Setup again to repair the app, or import the voice packs below. Until then '+(bad===1?'it uses its':'they use their')+' earlier version or '+(bad===1?'its':'their')+' theme’s own voice, and '+(bad===1?'says':'say')+' so.':'');}
  const improved=all.filter(c=>(c.versions||[]).length>1),waiting=all.filter(c=>c.versionCode==='needs_supplement'||(c.imported&&!c.usable&&/voice supplement/.test(c.problem||''))).length;
  const sup=!improved.length?'':waiting?' '+waiting+' of the '+improved.length+' improved voices need'+(waiting===1?'s':'')+' the voice supplement: import it too (until then they use their earlier version, or aren’t offered).':improved.some(c=>c.imported)?' The voice supplement is imported: '+improved.length+' voices use their improved version.':'';
  return !imp?'Not imported yet: this version lists '+all.length+' character voices for '+themes+' themes. Each theme keeps its own voice until you pick a character.':
   'Imported: '+imp+' of '+all.length+' character voices'+(ok<imp?' ('+(imp-ok)+' imported but not offered, so their themes keep their own voice)':'')+'.'+sup;
 }
 function renderCharacters(){
  const box=$('tvChars');if(!box)return;box.replaceChildren();say('tvCharState',charSummary());
  // v2.43: the built-in recordings can't be removed; only copies an import added beside them (shown when there are any).
  const extra=charStatus?.extra||{clips:0,bytes:0};$('tvCharRemove').hidden=!extra.clips;$('tvCharRemove').disabled=!extra.clips;
  $('tvCharRemove').textContent='Remove imported copies'+(extra.clips?' ('+(extra.bytes>=1e5?(extra.bytes/1024**2).toFixed(1)+' MB':Math.max(1,Math.round(extra.bytes/1024))+' KB')+')':'');
  for(const v of voices.filter(x=>x.characters?.length)){
   const row=document.createElement('div');row.className='tv-voice';row.dataset.theme=v.theme;
   const a=document.createElement('div'),b=document.createElement('div'),c=document.createElement('div');c.className='tv-buttons';
   const sel=document.createElement('select');sel.id='tvChar-'+v.theme;
   const lab=document.createElement('label');lab.htmlFor=sel.id;lab.textContent='Character voice · '+themeName(v.theme);
   sel.append(new Option(v.name+' (theme default)',''),...v.characters.map(ch=>{const o=new Option(ch.name+(ch.usable?ch.status==='weak'?' · weak clone':ch.nonlexical?' · non-lexical':'':' · '+(charTag(ch)||'').toLowerCase()),ch.id);o.disabled=!ch.usable;return o;}));
   sel.value=v.characters.some(ch=>ch.id===v.character)?v.character:'';
   const note=document.createElement('small'),cur=v.characters.find(ch=>ch.id===v.character);
   note.textContent=cur?(cur.usable?(cur.versionNote?cur.versionNote+' ':'')+(cur.statusNote||''):cur.name+' can’t be used ('+(v.characterProblem||cur.problem||'not available')+'), so '+v.name+' speaks.'):'The theme’s own voice ('+v.name+').';
   a.append(lab,sel,note);
   b.innerHTML='<span class="tv-tag"></span>';const tag=b.querySelector('.tv-tag');tag.dataset.status=cur?(cur.usable?cur.status:'missing'):v.status;tag.textContent=cur?charTag(cur):v.custom?'Your recording':'Theme default';
   sel.onchange=async()=>{try{await tv('settings',{values:{characters:{[v.theme]:sel.value}}});const ch=v.characters.find(x=>x.id===sel.value);say('tvCharVoiceState',themeName(v.theme)+(ch?' now speaks as '+ch.name+' (remembered for this theme).':' uses its own voice ('+v.name+') again.'));await load();}catch(e){say('tvCharVoiceState',e.message);}};
   const btn=(label,fn,disabled=false)=>{const x=document.createElement('button');x.type='button';x.className='secondary';x.textContent=label;x.disabled=disabled;x.onclick=()=>fn(x).catch(e=>say('tvCharVoiceState',e.message));c.append(x);};
   const chosen=()=>v.characters.find(x=>x.id===sel.value)||null;
   btn('Original recording',async()=>{const ch=chosen();
    if(!ch){const r=await tv('sample',{theme:v.theme,kind:v.sample&&!v.custom?'line':'reference'});play(r.audio,r.type);say('tvCharVoiceState','Playing '+v.name+'’s original recording'+(r.kind==='line'&&v.sample?' “'+v.sample+'”':'')+' (from the game, not generated).');return;}
    const r=await tv('character-sample',{theme:v.theme,character:ch.id});play(r.audio,r.type);say('tvCharVoiceState','Playing '+ch.name+'’s original recording'+(r.text?' “'+r.text+'”':'')+' (from the game, not generated).');},!v.characters.some(ch=>ch.imported)&&!v.hasReference);
   // v2.42: an improved character keeps its earlier version; go back to it (and forward again), like the built-in voices.
   // Under the character's note (the row's button column is shared by every row, so a third button there would squeeze them all).
   const offered=(cur?.versions||[]).filter(x=>x.approved);
   if(cur&&offered.length>1&&(cur.pinned||cur.version===cur.currentVersion&&offered.some(x=>x.version<cur.currentVersion&&x.ready))){const older=Math.max(...offered.filter(x=>x.version<cur.currentVersion).map(x=>x.version));
    const act=document.createElement('div');act.className='actions';const x=document.createElement('button');x.type='button';x.className='secondary';x.textContent=cur.pinned?'Use the improved version':'Use the earlier version';
    x.onclick=async()=>{try{await tv('settings',{values:{characterVersion:{[v.theme+'/'+cur.id]:cur.pinned?0:older}}});say('tvCharVoiceState',cur.name+(cur.pinned?' uses its improved version (v'+cur.currentVersion+') again.':' uses its earlier version (v'+older+') now.'));await load();}catch(e){say('tvCharVoiceState',e.message);}};
    act.append(x);a.append(act);}
   // v2.44: the optional sharper voice (voice conversion), only for the characters that offer it; off by default.
   if(cur?.usable&&cur.sharper){const conv=status?.conversion,lab=document.createElement('label'),box=document.createElement('input'),span=document.createElement('span'),bb=document.createElement('b'),sm=document.createElement('small');
    lab.className='toggle';box.type='checkbox';box.checked=!!cur.sharperOn;bb.textContent='Sharper voice (experimental)';
    sm.textContent=(cur.sharperOn&&cur.sharperNote?cur.sharperNote+' ':'')+'Runs '+cur.name+'’s generated speech through voice conversion, matching it to '+cur.sharper.clips+' of '+cur.name+'’s own recordings ('+cur.sharper.seconds+' s, built in). '+
     'Needs the voice conversion download below ('+(conv?.current?'installed':'about '+mb(conv?.download||1.33e9))+'). Slower (about 0.35–0.6 s more per second of speech on a processor) and about 1.7 GB more memory. Made at 16 kHz, resampled to 24 kHz. '+cur.sharper.evidenceNote;
    span.append(bb,sm);lab.append(box,span);
    box.onchange=async()=>{try{await tv('settings',{values:{sharper:{[v.theme+'/'+cur.id]:box.checked}}});say('tvCharVoiceState',cur.name+(box.checked?': sharper voice on.'+(conv?.current?'':' It needs the voice conversion download below; until then the normal voice speaks.'):': sharper voice off.'));await load();}catch(e){box.checked=!box.checked;say('tvCharVoiceState',e.message);}};
    a.append(lab);}
   btn('Generated speech',async x=>{const ch=chosen();x.disabled=true;say('tvCharVoiceState','Making '+(ch?ch.name:v.name)+'’s voice… (the first one loads the model)');
    try{const r=await tv('test',{theme:v.theme,character:sel.value,text:$('tvTestText').value,fresh:true});play(r.audio);
     say('tvCharVoiceState',(r.clip.fallback?r.clip.fallback.name+' couldn’t be used ('+r.clip.fallback.reason+'), so this is '+r.clip.voiceName+'. ':'')+(r.clip.versionNote?r.clip.versionNote+' ':'')+(r.clip.sharperNote?r.clip.sharperNote+' ':'')+r.clip.voiceName+': '+r.clip.seconds.toFixed(1)+' s of generated speech (made by the clone'+(r.clip.sharper?' and sharpened by voice conversion':'')+' on the '+(r.clip.device==='cuda'?'graphics card':'processor')+' in '+(r.clip.ms/1000).toFixed(1)+' s, not a recording).'+(r.clip.deviceNote?' '+r.clip.deviceNote:''));}finally{x.disabled=false;}},!status?.ready);
   row.append(a,b,c);box.append(row);
  }
 }
 $('tvCharImport').onclick=()=>{$('tvCharForm').hidden=false;$('tvCharSource').focus();};
 $('tvCharCancel').onclick=()=>{$('tvCharForm').hidden=true;};
 // What an import did. v2.43: a recording that is already here (built in, or imported before) isn't copied again.
 function importText(r){
  const n=r.added??0,fails=r.failed.length?' Not imported: '+r.failed.slice(0,6).map(f=>f.name+' ('+f.reason+')').join('; ')+(r.failed.length>6?'; and '+(r.failed.length-6)+' more':'')+'. Those characters keep the voice they had.':'';
  if(!n&&!r.failed.length)return r.already?'Nothing to import: the '+r.already+' recording'+(r.already===1?'':'s')+' found there '+(r.already===1?'is':'are')+' already here, unchanged (built in, or imported before). Nothing was copied.':'No recordings this version lists were found there. Choose the character voice pack or the voice supplement: its folder or its .zip file.';
  return 'Checked and copied '+n+' recording'+(n===1?'':'s')+' ('+((r.bytes||0)/1024**2).toFixed(1)+' MB'+(r.packs?.length?' from '+r.packs.join(' and '):'')+')'+(r.already?'; '+r.already+' already here '+(r.already===1?'wasn’t':'weren’t')+' copied again':'')+'. '+r.complete+' of '+r.total+' character voices have every recording now'+(r.needsSupplement?'; '+r.needsSupplement+' improved voice'+(r.needsSupplement===1?'':'s')+' still need'+(r.needsSupplement===1?'s':'')+' the voice supplement':'')+'.'+fails;
 }
 $('tvCharGo').onclick=async()=>{const src=$('tvCharSource').value.trim().replace(/^["']+|["']+$/g,'');if(!src)return;$('tvCharForm').hidden=true;charBusy=true;$('tvCharGo').disabled=true;say('tvCharVoiceState','Importing and checking the character recordings…');
  try{const r=await tv('characters-import',{source:src});charBusy=false;await load();say('tvCharVoiceState',importText(r));}
  catch(e){charBusy=false;say('tvCharVoiceState','Import failed: '+e.message+' Nothing was changed for the characters that weren’t imported.');}finally{$('tvCharGo').disabled=false;}};
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
  const values={mode:$('tvMode').value,device:$('tvDevice').value,engine:$('tvEngine').value,idleMinutes:Number($('tvIdle').value),processed:$('tvProcessed').checked,chat:$('tvChat').checked,chatAccess:$('tvChatAccess').value,chatCooldown:Number($('tvChatCooldown').value),chatAllowed:$('tvChatAllowed').value};
  if(values.chatAccess==='selected'&&!/7656119\d{10}/.test(values.chatAllowed))throw Error('Add at least one SteamID64, or let everyone use !say.');
  await tv('settings',{values});say('tvVoiceState','Theme voice settings saved.');await load();
 }
 $('tvSaveSettings').onclick=()=>saveSettings().catch(e=>say('tvVoiceState',e.message));
 const settingOf={tvMode:'mode',tvDevice:'device',tvEngine:'engine'};
 for(const id of ['tvMode','tvBoth','tvDevice','tvEngine'])$(id).addEventListener('change',async()=>{if(settingOf[id]){await tv('settings',{values:{[settingOf[id]]:$(id).value}}).catch(()=>{});await load();return;}say('tvInstallState',await stateText());render();});
 async function install(offline=[]){
  installing=true;render();$('tvProgressWrap').hidden=false;say('tvInstallState','Installing… You can keep using Tyler meanwhile.');
  try{await tv('install',{mode:$('tvMode').value,both:$('tvBoth').checked,device:$('tvDevice').value,engine:$('tvEngine').value,offline});}catch(e){installing=false;say('tvInstallState',e.message);render();}
 }
 $('tvInstall').onclick=()=>void install();
 $('tvCancel').onclick=()=>void tv('cancel').catch(()=>{});
 $('tvOffline').onclick=()=>{$('tvOfflineForm').hidden=false;$('tvOfflineDir').focus();};
 $('tvOfflineCancel').onclick=()=>{$('tvOfflineForm').hidden=true;};
 $('tvOfflineGo').onclick=()=>{const dir=$('tvOfflineDir').value.trim().replace(/^["']+|["']+$/g,'');if(!dir)return;$('tvOfflineForm').hidden=true;void install([dir]);};
 $('tvCheck').onclick=async()=>{say('tvInstallState','Making a test voice…');try{const c=await tv('check');say('tvInstallState','Voice check passed: '+c.seconds+' s of speech in '+(c.ms/1000).toFixed(1)+' s on the '+(c.device==='cuda'?'graphics card':'processor')+(c.engine==='fast'?' with the fast engine':'')+' ('+c.rtf+' s per second of speech).');}catch(e){say('tvInstallState','Voice check failed: '+e.message);}await load();};
 $('tvRepair').onclick=async()=>{say('tvInstallState','Checking every file…');try{const r=await tv('repair');say('tvInstallState',r.repaired?'Repaired '+r.problems+' problem(s); voice check passed.':'All files are fine; voice check passed.');}catch(e){say('tvInstallState','Repair failed: '+e.message);}await load();};
 const removeConfirm=async(op,extra,label)=>{say('tvInstallState','Removing…');try{await tv(op,extra);plans={};say('tvInstallState',label);}catch(e){say('tvInstallState',e.message);}await load();};
 let armed=null;const twice=(id,fn,ask,where='tvInstallState')=>{$(id).onclick=()=>{if(armed!==id){armed=id;say(where,ask+' Press the button again to confirm.');setTimeout(()=>{if(armed===id)armed=null;},6000);return;}armed=null;void fn();};};
 twice('tvRemove',()=>removeConfirm('remove',{},'Theme voices removed. Your settings, recordings and saved clips are kept.'),'This removes the voice engine and models (your settings, recordings and saved clips stay).');
 twice('tvRemoveQuality',()=>removeConfirm('remove-model',{model:'quality'},'The Quality model was removed.'),'Remove the Quality model?');
 twice('tvCharRemove',async()=>{say('tvCharVoiceState','Removing…');try{await tv('characters-remove');say('tvCharVoiceState','The imported copies were removed. The built-in recordings and your picks stay.');}catch(e){say('tvCharVoiceState',e.message);}await load();},'This removes only the recordings you imported. The built-in ones stay, and so do your picks.','tvCharVoiceState');
 twice('tvConvRemove',async()=>{say('tvConvState','Removing…');try{await tv('conversion-remove');say('tvCharVoiceState','Voice conversion was removed. Your switches stay; those characters use their normal voice until you download it again.');}catch(e){say('tvConvState',e.message);}await load();},'This removes only voice conversion. Your switches and everything else stay.','tvConvState');
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
  if(e.kind==='conversion'){
   const pct=e.totalBytes?Math.min(100,Math.round(100*(e.bytes||0)/e.totalBytes)):null;if(pct!==null)$('tvConvProgress').style.width=pct+'%';
   if(e.phase==='download'||e.phase==='start'){convBusy=true;$('tvConvProgressWrap').hidden=false;say('tvConvState',(e.label||'Downloading')+(e.totalBytes?' · '+mb(e.bytes||0)+' of '+mb(e.totalBytes):''));}
   if(e.phase==='done'){convBusy=false;say('tvCharVoiceState','Voice conversion is installed. Switch the sharper voice on in Medic’s, Lash’s or Kelvin’s row.');void load();}
   if(e.phase==='failed'){convBusy=false;void load().then(()=>say('tvConvState',e.label+' Tyler works as before; press the button to carry on.'));}
  }
  if(e.kind==='characters-import'&&charBusy)say('tvCharVoiceState','Importing and checking the character recordings… '+(e.done||0)+'/'+(e.total||0)+(e.name?' · '+e.name:''));
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

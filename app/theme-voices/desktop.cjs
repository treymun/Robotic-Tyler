'use strict';
// ROBOTIC TYLER theme voices: how the desktop app exposes the service (v2.35).
//
//   - The Steam chat window (through the shared background) may: read the status, make a voice
//     message from text, stop, save a clip, and change "follow the theme" / the voice picked.
//   - The Settings window may also install, repair, remove, test and replace references.
//   - The phone remote gets fixed actions through the Steam window (say text, stop, and since v2.41
//     pick a theme's character voice), never the engine itself.
//   - v2.41: Settings may also import the owner's character voice pack (a folder or ZIP path) and play a
//     character's original recording. The Steam window may pick a theme's character (a saved setting).
// Clips go back as audio only; file paths stay here, except a saved clip's own path.
const path=require('node:path'),fs=require('node:fs');
const {ThemeVoices,MODES}=require('./service.cjs'),{LOCK,plan}=require('./installer.cjs'),hardware=require('./hardware.cjs');

function setupThemeVoices({root,dir,vault,local,changeListeners,net,shell,log,send}){
 const appDir=path.join(dir,'theme-voices').replace('app.asar'+path.sep,'app.asar.unpacked'+path.sep);
 // The character catalog (v2.41) is read from the app's own files (inside app.asar; Electron reads it there).
 const service=new ThemeVoices({dataDir:path.join(root,'ThemeVoices'),appDir,catalogFile:path.join(dir,'theme-voices','characters.json'),
  fetch:(url,opts)=>net.fetch(url,{...opts,bypassCustomProtocolHandlers:true}),
  getSettings:async()=>(await vault.get('themeVoices')).themeVoices,setSettings:v=>local.set({themeVoices:v}),
  theme:async()=>(await vault.get('uiTheme')).uiTheme||'steam',log});
 const clips=new Map();
 const pub=c=>({id:c.id,text:c.text,theme:c.theme,character:c.character||null,characterVersion:c.characterVersion||null,versionNote:c.versionNote?String(c.versionNote).slice(0,160):null,voiceName:c.voiceName,seconds:c.seconds,ms:c.ms,cached:c.cached,mode:c.mode,device:c.device||null,processed:!!c.processed,status:c.status,custom:!!c.custom,
  fallback:c.fallback?{name:String(c.fallback.name||c.fallback.character||'').slice(0,40),reason:String(c.fallback.reason||'').slice(0,160)}:null});
 // v2.41: only these settings may come from the Steam window: follow the theme, the voice picked, and each theme's character.
 const steamSettings=v=>{const allowed={};if(typeof v.followTheme==='boolean')allowed.followTheme=v.followTheme;if(typeof v.override==='string')allowed.override=v.override;
  if(v.characters&&typeof v.characters==='object')allowed.characters=Object.fromEntries(Object.entries(v.characters).slice(0,30).filter(([t,id])=>typeof t==='string'&&typeof id==='string'));return allowed;};
 service.on('install',e=>send({kind:'install',...e}));
 service.on('status',s=>send({kind:'status',status:s}));
 service.on('progress',e=>send({kind:'progress',...e}));
 // An emergency stop also stops a voice being made.
 changeListeners.push(changes=>{if(changes.v22EmergencyStop?.newValue===true)void service.stop();});
 globalThis.tylerThemeVoices={
  status:async()=>({status:await service.status(),voices:await service.voiceList()}),
  // Tyler's spoken replies take the theme and character once, so every part of one reply has one speaker (v2.41).
  resolve:o=>service.resolve({theme:typeof o?.theme==='string'?o.theme:null,character:typeof o?.character==='string'?o.character:undefined}),
  speak:async o=>{
   // !say from chat is checked here too (not only in the Steam page): on, and who may use it.
   if(o.from==='chat'){const st=await service.settings();if(!st.chat)throw Error('!say is switched off.');
    if(st.chatAccess==='selected'&&!(/^7656119\d{10}$/.test(String(o.speakerId||''))&&String(st.chatAllowed||'').split(/\s+/).includes(String(o.speakerId))))throw Error('Only the owner’s chosen accounts can use !say.');}
   const clip=await service.speak({...o,character:typeof o.character==='string'?o.character:undefined});clips.set(clip.id,clip);if(clips.size>30)clips.delete(clips.keys().next().value);return {clip:pub(clip),audio:service.audio(clip)};},
  stop:()=>service.stop(),
  settings:async v=>{await service.saveSettings(steamSettings(v||{}));return {};},
  save:async id=>{const c=clips.get(id);if(!c)throw Error('That clip isn’t available any more. Make it again.');const file=service.save(c);try{shell.showItemInFolder(file);}catch{}return {file};}
 };
 async function settingsRequest(op,r){
  if(op==='status'){await service.hardware().catch(()=>null);return {status:await service.status(),voices:await service.voiceList(),modes:MODES,models:Object.fromEntries(Object.entries(LOCK.models).map(([k,m])=>[k,{label:m.label,repo:m.repo,revision:m.revision,license:m.license,bytes:m.files.reduce((n,f)=>n+f.size,0)}])),engine:LOCK.engine,python:LOCK.python.version};}
  if(op==='hardware'){const hw=await service.hardware(true);return {hardware:hw,recommendation:hardware.recommend(hw)};}
  if(op==='plan'){const p=await service.planFor({mode:r.mode,both:r.both===true,device:r.device,engine:r.engine==='fast'?'fast':r.engine==='standard'?'standard':undefined});return p;}
  if(op==='install'){void service.install({mode:r.mode,both:r.both===true,device:r.device,engine:r.engine==='fast'?'fast':r.engine==='standard'?'standard':undefined,offline:Array.isArray(r.offline)?r.offline.filter(x=>typeof x==='string').slice(0,3):[]}).catch(e=>log('Theme voices install failed',e.message));return {started:true};}
  if(op==='cancel'){service.cancelInstall();return {};}
  if(op==='check')return service.check();
  if(op==='verify')return service.verify(e=>send({kind:'verify',...e}));
  if(op==='repair')return service.repair();
  if(op==='remove'){await service.remove({everything:r.everything===true});return {};}
  if(op==='remove-model'){if(!MODES[r.model])throw Error('Unknown model.');await service.removeModel(r.model);return {};}
  if(op==='settings')return service.saveSettings(r.values||{});
  if(op==='unload'){await service.closeWorker();return {};}
  if(op==='clear-cache'){service.clearCache();return {};}
  if(op==='test'){const clip=await service.speak({text:String(r.text||'').slice(0,400)||'This is a voice test.',theme:String(r.theme||''),character:typeof r.character==='string'?r.character:undefined,purpose:'preview',fresh:r.fresh===true});clips.set(clip.id,clip);return {clip:pub(clip),audio:service.audio(clip),dry:clip.dry&&fs.existsSync(clip.dry)?fs.readFileSync(clip.dry).toString('base64'):null};}
  if(op==='stop')return service.stop();
  if(op==='set-reference'){const v=service.voices.setCustom(String(r.theme||''),{data:r.data,fileName:r.fileName,transcript:r.transcript,name:r.name});return {voice:{theme:v.theme,name:v.name,status:v.status}};}
  if(op==='restore-reference'){service.voices.removeCustom(String(r.theme||''));return {};}
  // The original recordings, for comparing by ear: the reference the clone learns from, or the
  // familiar line's original (sample playback: the game's own recording, not the clone).
  if(op==='sample'){const v=service.voices.get(String(r.theme||''));if(!v)throw Error('Unknown voice.');
   const line=r.kind==='line'&&v.sample?.file&&!v.custom?path.join(appDir,'voices',v.theme,v.sample.file):null,f=line||v.refPath;if(!f||!fs.existsSync(f))throw Error('No recording for that voice.');
   const ext=path.extname(f).toLowerCase();return {audio:fs.readFileSync(f).toString('base64'),kind:line?'line':'reference',type:{'.flac':'audio/flac','.mp3':'audio/mpeg','.ogg':'audio/ogg'}[ext]||'audio/wav'};}
  // v2.41 character voices: import the owner's pack (folder or ZIP), remove the imported copies, and play
  // a character's original recording (sample playback, never the clone).
  if(op==='characters-import'){const src=typeof r.source==='string'?r.source.trim().replace(/^["']+|["']+$/g,'').slice(0,1000):'';
   return service.importCharacters(src,e=>send({kind:'characters-import',...e}));}
  if(op==='characters-remove'){service.removeCharacters();return {};}
  if(op==='character-sample'){const t=String(r.theme||''),id=String(r.character||''),st=await service.settings();
   const p=service.voices.characters.previewFiles(t,id,{pin:st.characterVersion?.[t+'/'+id]});if(!p)throw Error('Unknown character voice.');if(p.problem)throw Error(p.name+': '+p.problem+'.');
   const ref=r.kind==='reference'||!p.files.preview,f=ref?p.files.reference[0]:p.files.preview;
   return {audio:fs.readFileSync(f).toString('base64'),type:'audio/flac',kind:ref?'reference':'line',text:ref?p.version.clips[0].text||null:p.version.preview?.text||null,version:p.version.version};}
  if(op==='characters-status')return service.voices.characters.status();
  if(op==='native-status')return service.nativeStatus();
  if(op==='native-install'){const file=await service.nativeInstaller();const err=await shell.openPath(file);if(err)throw Error('Windows couldn’t start Microsoft’s installer: '+err);return {started:true};}
  if(op==='open-folder'){const which=r.which==='saved'?path.join(service.dir,'saved'):service.dir;fs.mkdirSync(which,{recursive:true});await shell.openPath(which);return {};}
  throw Error('Unknown theme-voice setting.');
 }
 return {service,settingsRequest,shutdown:()=>service.shutdown(),kill:()=>service.killNow()};
}
module.exports={setupThemeVoices};

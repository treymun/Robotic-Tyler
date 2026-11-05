'use strict';
// ROBOTIC TYLER theme voices: how the desktop app exposes the service (v2.35).
//
//   - The Steam chat window (through the shared background) may: read the status, make a voice
//     message from text, stop, save a clip, and change "follow the theme" / the voice picked.
//   - The Settings window may also install, repair, remove, test and replace references.
//   - The phone remote gets two fixed actions through the Steam window (say text, stop), never the
//     engine itself.
// Clips go back as audio only; file paths stay here, except a saved clip's own path.
const path=require('node:path'),fs=require('node:fs');
const {ThemeVoices,MODES}=require('./service.cjs'),{LOCK,plan}=require('./installer.cjs'),hardware=require('./hardware.cjs');

function setupThemeVoices({root,dir,vault,local,changeListeners,net,shell,log,send}){
 const appDir=path.join(dir,'theme-voices').replace('app.asar'+path.sep,'app.asar.unpacked'+path.sep);
 const service=new ThemeVoices({dataDir:path.join(root,'ThemeVoices'),appDir,
  fetch:(url,opts)=>net.fetch(url,{...opts,bypassCustomProtocolHandlers:true}),
  getSettings:async()=>(await vault.get('themeVoices')).themeVoices,setSettings:v=>local.set({themeVoices:v}),
  theme:async()=>(await vault.get('uiTheme')).uiTheme||'steam',log});
 const clips=new Map();
 const pub=c=>({id:c.id,text:c.text,theme:c.theme,voiceName:c.voiceName,seconds:c.seconds,ms:c.ms,cached:c.cached,mode:c.mode,device:c.device||null,processed:!!c.processed,status:c.status,custom:!!c.custom});
 service.on('install',e=>send({kind:'install',...e}));
 service.on('status',s=>send({kind:'status',status:s}));
 service.on('progress',e=>send({kind:'progress',...e}));
 // An emergency stop also stops a voice being made.
 changeListeners.push(changes=>{if(changes.v22EmergencyStop?.newValue===true)void service.stop();});
 globalThis.tylerThemeVoices={
  status:async()=>({status:await service.status(),voices:service.voiceList()}),
  speak:async o=>{
   // !say from chat is checked here too (not only in the Steam page): on, and who may use it.
   if(o.from==='chat'){const st=await service.settings();if(!st.chat)throw Error('!say is switched off.');
    if(st.chatAccess==='selected'&&!(/^7656119\d{10}$/.test(String(o.speakerId||''))&&String(st.chatAllowed||'').split(/\s+/).includes(String(o.speakerId))))throw Error('Only the owner’s chosen accounts can use !say.');}
   const clip=await service.speak(o);clips.set(clip.id,clip);if(clips.size>30)clips.delete(clips.keys().next().value);return {clip:pub(clip),audio:service.audio(clip)};},
  stop:()=>service.stop(),
  settings:async v=>{const allowed={};if(typeof v.followTheme==='boolean')allowed.followTheme=v.followTheme;if(typeof v.override==='string')allowed.override=v.override;await service.saveSettings(allowed);return {};},
  save:async id=>{const c=clips.get(id);if(!c)throw Error('That clip isn’t available any more. Make it again.');const file=service.save(c);try{shell.showItemInFolder(file);}catch{}return {file};}
 };
 async function settingsRequest(op,r){
  if(op==='status'){await service.hardware().catch(()=>null);return {status:await service.status(),voices:service.voiceList(),modes:MODES,models:Object.fromEntries(Object.entries(LOCK.models).map(([k,m])=>[k,{label:m.label,repo:m.repo,revision:m.revision,license:m.license,bytes:m.files.reduce((n,f)=>n+f.size,0)}])),engine:LOCK.engine,python:LOCK.python.version};}
  if(op==='hardware'){const hw=await service.hardware(true);return {hardware:hw,recommendation:hardware.recommend(hw)};}
  if(op==='plan'){const p=await service.planFor({mode:r.mode,both:r.both===true,device:r.device});return p;}
  if(op==='install'){void service.install({mode:r.mode,both:r.both===true,device:r.device,offline:Array.isArray(r.offline)?r.offline.filter(x=>typeof x==='string').slice(0,3):[]}).catch(e=>log('Theme voices install failed',e.message));return {started:true};}
  if(op==='cancel'){service.cancelInstall();return {};}
  if(op==='check')return service.check();
  if(op==='verify')return service.verify(e=>send({kind:'verify',...e}));
  if(op==='repair')return service.repair();
  if(op==='remove'){await service.remove({everything:r.everything===true});return {};}
  if(op==='remove-model'){if(!MODES[r.model])throw Error('Unknown model.');await service.removeModel(r.model);return {};}
  if(op==='settings')return service.saveSettings(r.values||{});
  if(op==='unload'){await service.closeWorker();return {};}
  if(op==='clear-cache'){service.clearCache();return {};}
  if(op==='test'){const clip=await service.speak({text:String(r.text||'').slice(0,400)||'This is a voice test.',theme:String(r.theme||''),purpose:'preview',fresh:r.fresh===true});clips.set(clip.id,clip);return {clip:pub(clip),audio:service.audio(clip),dry:clip.dry&&fs.existsSync(clip.dry)?fs.readFileSync(clip.dry).toString('base64'):null};}
  if(op==='stop')return service.stop();
  if(op==='set-reference'){const v=service.voices.setCustom(String(r.theme||''),{data:r.data,fileName:r.fileName,transcript:r.transcript,name:r.name});return {voice:{theme:v.theme,name:v.name,status:v.status}};}
  if(op==='restore-reference'){service.voices.removeCustom(String(r.theme||''));return {};}
  // The original recordings, for comparing by ear: the reference the clone learns from, or the
  // familiar line's original (sample playback: the game's own recording, not the clone).
  if(op==='sample'){const v=service.voices.get(String(r.theme||''));if(!v)throw Error('Unknown voice.');
   const line=r.kind==='line'&&v.sample?.file&&!v.custom?path.join(appDir,'voices',v.theme,v.sample.file):null,f=line||v.refPath;if(!f||!fs.existsSync(f))throw Error('No recording for that voice.');
   const ext=path.extname(f).toLowerCase();return {audio:fs.readFileSync(f).toString('base64'),kind:line?'line':'reference',type:{'.flac':'audio/flac','.mp3':'audio/mpeg','.ogg':'audio/ogg'}[ext]||'audio/wav'};}
  if(op==='native-status')return service.nativeStatus();
  if(op==='native-install'){const file=await service.nativeInstaller();const err=await shell.openPath(file);if(err)throw Error('Windows couldn’t start Microsoft’s installer: '+err);return {started:true};}
  if(op==='open-folder'){const which=r.which==='saved'?path.join(service.dir,'saved'):service.dir;fs.mkdirSync(which,{recursive:true});await shell.openPath(which);return {};}
  throw Error('Unknown theme-voice setting.');
 }
 return {service,settingsRequest,shutdown:()=>service.shutdown(),kill:()=>service.killNow()};
}
module.exports={setupThemeVoices};

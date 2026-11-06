'use strict';
// ROBOTIC TYLER local AI: how the desktop app exposes the service (v2.38).
//
//   - The shared background (browser-extension/background.js, in this main process) gets
//     globalThis.tylerLocalAI: status, a reply (streamed) and release. The engine's port and key stay
//     inside the service; only text goes back.
//   - The Settings window may also install, remove, choose the model and where it runs, run the
//     speed check and close the engine.
//   - The Steam window and the phone remote get nothing new: they only see Tyler's replies.
//   - v2.39 (stage 2): hearing and the voice on this PC (speech.cjs). The background gets
//     globalThis.tylerLocalSpeech: status, hear (a recording in, text out), speak (text in, a WAV
//     clip out) and release. Settings may also install, remove, run the quick checks and close them.
//   - v2.44: Runs on → Split keeps room on the card for theme voices. Their settings, install and
//     whether their engine is loaded are only read here (themeVoiceCard), never changed.
const path=require('node:path'),fs=require('node:fs');
const {LocalAI}=require('./service.cjs'),{LOCK}=require('./installer.cjs'),hardware=require('./hardware.cjs'),split=require('./split.cjs');

/**
 * Room for theme voices on the graphics card, read from their service: installed with the graphics-card
 * engine (CUDA) and Runs on isn't "Processor only". Their own vramReserve() gives the figure (their mode's
 * need, plus the sharper voice's while it's on); split.reserveFrom() leaves out a model that's already
 * loaded on the card. A service without vramReserve() is read the v2.44-draft way (split.voiceReserve).
 * `getService` returns the theme-voice service or null. Read only: nothing of theirs is changed or started.
 */
function themeVoiceCard(getService){
 return async()=>{
  const tv=typeof getService==='function'?getService():null;if(!tv?.installer)return null;
  const tvHardware=require('../theme-voices/hardware.cjs'),{LOCK:TV}=require('../theme-voices/installer.cjs');
  const modelBytes=Object.fromEntries(Object.entries(TV.models||{}).map(([k,m])=>[k,(m.files||[]).reduce((n,f)=>n+(f.size||0),0)]));
  if(typeof tv.vramReserve==='function')return split.reserveFrom(await tv.vramReserve(),{needs:tvHardware.NEEDS,modelBytes,loadedMode:tv.loaded?.device==='cuda'?tv.loaded.mode:null});
  const s=await tv.settings(),inst=tv.installer.status()||{};
  // v2.44 sharper voice (kNN-VC): it runs on the same device as the voice, so it counts when it's installed and switched on.
  let conversion=null;try{const c=TV.components?.knnvc,on=Object.values(s.sharper||{}).some(v=>v===true);if(c&&on&&tv.installer.componentStatus?.('knnvc')?.current)conversion={on:true,bytes:Number(c.memory?.vram||c.memory?.ram)||0};}catch{}
  return split.voiceReserve({installed:!!inst.installed,runtime:inst.runtime,device:s.device,mode:s.mode,models:inst.models||{},loaded:tv.loaded?{mode:tv.loaded.mode,device:tv.loaded.device}:null,conversion},{needs:tvHardware.NEEDS,modelBytes});
 };
}
const {LocalSpeech}=require('./speech.cjs');

function setupLocalAI({root,vault,local,changeListeners,net,shell,log,send,execPath,themeVoices=null}){
 const fetch=(url,opts)=>net.fetch(url,{...opts,bypassCustomProtocolHandlers:true});
 const service=new LocalAI({dataDir:path.join(root,'LocalAI'),fetch,cardReserve:themeVoiceCard(themeVoices),
  getSettings:async()=>(await vault.get('localAI')).localAI,setSettings:v=>local.set({localAI:v}),log});
 // The engines' own process runs this file from outside the app archive (it's unpacked next to it).
 const script=path.join(__dirname,'speech-worker.cjs').replace('app.asar'+path.sep,'app.asar.unpacked'+path.sep);
 const speech=new LocalSpeech({dataDir:path.join(root,'LocalAI'),fetch,script,...(execPath?{execPath}:{}),
  getSettings:async()=>(await vault.get('localSpeech')).localSpeech,setSettings:v=>local.set({localSpeech:v}),log});
 service.on('install',e=>send({kind:'install',...e}));
 service.on('status',s=>send({kind:'status',status:s}));
 speech.on('install',e=>send({kind:'speech-install',...e}));
 speech.on('status',s=>send({kind:'speech-status',status:s}));
 // The emergency stop closes the engines (and ends a reply being written, heard or spoken).
 changeListeners.push(changes=>{if(changes.v22EmergencyStop?.newValue===true){void service.release('emergency stop');void speech.release('emergency stop');}});
 globalThis.tylerLocalAI={
  status:async()=>{const s=await service.status();return {ready:s.ready,installed:s.installed,model:s.model,label:s.modelLabel,uncensored:s.uncensored,needs:s.needs,running:s.running,device:s.loaded?.device||null};},
  chat:o=>service.chat({messages:o.messages,max_tokens:o.max_tokens,temperature:o.temperature,stream:o.stream,signal:o.signal,onText:o.onText,onStage:o.onStage}),
  release:reason=>service.release(String(reason||'Tyler stopped').slice(0,60)),
 };
 // Audio and text only: the engines' files, processes and settings stay here.
 globalThis.tylerLocalSpeech={
  status:async()=>{const s=await speech.status();return {hearing:s.ready.hearing,voice:s.ready.voice,running:{hearing:!!s.running.hearing,voice:!!s.running.voice},hearingModel:s.models.hearing.label,voiceModel:s.models.voice.label};},
  hear:o=>speech.hear({audio:o.audio,signal:o.signal,onStage:o.onStage}),
  speak:o=>speech.speak({text:o.text,voice:o.voice,signal:o.signal,onStage:o.onStage}),
  // A voice turn spoken with Kokoro began: its engine starts loading now, while Tyler hears and writes.
  prepare:o=>speech.prepare('voice',{voice:typeof o?.voice==='string'?o.voice:''}),
  release:reason=>speech.release(String(reason||'Tyler stopped').slice(0,60)),
 };
 const models=()=>Object.fromEntries(Object.entries(LOCK.models).map(([k,m])=>[k,{label:m.label,repo:m.repo,revision:m.revision,file:m.file,bytes:m.size,license:m.license,uncensored:!!m.uncensored,base:m.base,quant:m.quant}]));
 async function settingsRequest(op,r={}){
  if(op==='status'){await service.hardware().catch(()=>null);return {status:await service.status(),models:models(),engine:{build:LOCK.engine.build,license:LOCK.engine.license,page:LOCK.engine.page}};}
  if(op==='hardware'){const hw=await service.hardware(true);return {hardware:hw,suggestion:hardware.suggest(hw)};}
  if(op==='plan')return service.planFor({model:String(r.model||'')});
  if(op==='install'){void service.install({model:String(r.model||''),offline:Array.isArray(r.offline)?r.offline.filter(x=>typeof x==='string').slice(0,3):[]}).catch(e=>log('Local AI install failed',e.message));return {started:true};}
  if(op==='cancel'){service.cancelInstall();return {};}
  if(op==='remove'){await service.remove();return {};}
  if(op==='remove-model'){if(!LOCK.models[r.model])throw Error('Unknown model.');await service.removeModel(r.model);return {};}
  if(op==='settings'){const v=r.values||{},allowed={};for(const k of ['model','device','idleMinutes'])if(v[k]!==undefined)allowed[k]=v[k];return service.saveSettings(allowed);}
  if(op==='check')return service.speedCheck();
  if(op==='verify')return service.installer.verify();
  if(op==='unload'){await service.close('closed from Settings');return {};}
  if(op==='open-folder'){fs.mkdirSync(service.dir,{recursive:true});await shell.openPath(service.dir);return {};}
  // v2.39: hearing and the voice on this PC.
  const parts=v=>(Array.isArray(v)?v:[v]).filter(p=>p==='hearing'||p==='voice');
  if(op==='speech-status')return {status:await speech.status()};
  if(op==='speech-plan')return speech.planFor({parts:parts(r.parts)});
  if(op==='speech-install'){void speech.install({parts:parts(r.parts),offline:Array.isArray(r.offline)?r.offline.filter(x=>typeof x==='string').slice(0,3):[]}).catch(e=>log('Hearing and voice install failed',e.message));return {started:true};}
  if(op==='speech-cancel'){speech.cancelInstall();return {};}
  if(op==='speech-remove'){if(!['hearing','voice','all'].includes(r.part))throw Error('Unknown part.');await speech.remove(r.part);return {};}
  if(op==='speech-settings'){const v=r.values||{};return speech.saveSettings(v.idleMinutes!==undefined?{idleMinutes:v.idleMinutes}:{});}
  if(op==='speech-check'){if(!['hearing','voice'].includes(r.part))throw Error('Unknown part.');const {kokoroVoice}=await vault.get('kokoroVoice');return speech.check(r.part,{voice:typeof r.voice==='string'&&r.voice?r.voice:kokoroVoice});}
  if(op==='speech-verify')return speech.installer.verify();
  if(op==='speech-unload'){await speech.close('all','closed from Settings');return {};}
  throw Error('Unknown local AI setting.');
 }
 return {service,speech,settingsRequest,shutdown:async()=>{await Promise.all([service.shutdown(),speech.shutdown()]);},kill:()=>{service.killNow();speech.killNow();}};
}
module.exports={setupLocalAI,themeVoiceCard};

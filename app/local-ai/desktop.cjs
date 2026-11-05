'use strict';
// ROBOTIC TYLER local AI: how the desktop app exposes the service (v2.38).
//
//   - The shared background (browser-extension/background.js, in this main process) gets
//     globalThis.tylerLocalAI: status, a reply (streamed) and release. The engine's port and key stay
//     inside the service; only text goes back.
//   - The Settings window may also install, remove, choose the model and where it runs, run the
//     speed check and close the engine.
//   - The Steam window and the phone remote get nothing new: they only see Tyler's replies.
const path=require('node:path'),fs=require('node:fs');
const {LocalAI}=require('./service.cjs'),{LOCK}=require('./installer.cjs'),hardware=require('./hardware.cjs');

function setupLocalAI({root,vault,local,changeListeners,net,shell,log,send}){
 const service=new LocalAI({dataDir:path.join(root,'LocalAI'),
  fetch:(url,opts)=>net.fetch(url,{...opts,bypassCustomProtocolHandlers:true}),
  getSettings:async()=>(await vault.get('localAI')).localAI,setSettings:v=>local.set({localAI:v}),log});
 service.on('install',e=>send({kind:'install',...e}));
 service.on('status',s=>send({kind:'status',status:s}));
 // The emergency stop closes the engine (and ends a reply being written).
 changeListeners.push(changes=>{if(changes.v22EmergencyStop?.newValue===true)void service.release('emergency stop');});
 globalThis.tylerLocalAI={
  status:async()=>{const s=await service.status();return {ready:s.ready,installed:s.installed,model:s.model,label:s.modelLabel,uncensored:s.uncensored,needs:s.needs,running:s.running,device:s.loaded?.device||null};},
  chat:o=>service.chat({messages:o.messages,max_tokens:o.max_tokens,temperature:o.temperature,stream:o.stream,signal:o.signal,onText:o.onText,onStage:o.onStage}),
  release:reason=>service.release(String(reason||'Tyler stopped').slice(0,60)),
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
  throw Error('Unknown local AI setting.');
 }
 return {service,settingsRequest,shutdown:()=>service.shutdown(),kill:()=>service.killNow()};
}
module.exports={setupLocalAI};

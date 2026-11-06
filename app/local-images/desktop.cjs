'use strict';
// ROBOTIC TYLER images on this PC: how the desktop app exposes the service (v2.40, stage 3).
//
//   - The shared background (browser-extension/background.js, in this main process) gets
//     globalThis.tylerLocalImages: status, generate (a description in, a PNG out) and release.
//     Requests from friends are refused unless the owner turned "Friends can ask for images" on
//     (off by default). Tyler's image rules run inside the service for everyone, the owner included.
//   - The Settings window may also install, remove, choose the model, where it runs and the size,
//     make a test image and stop a running one.
//   - The Steam window and the phone remote get nothing new from here: an image reaches them only
//     the way the background chooses to show or post it.
//   - The files, the engine process and the settings stay in this process.
const path=require('node:path'),fs=require('node:fs');
const {LocalImages,SIZES}=require('./service.cjs'),{LOCK}=require('./installer.cjs'),hardware=require('./hardware.cjs');
const TEST_PROMPT='A friendly chrome robot giving a thumbs up in a neon-lit gaming room, digital art';

/**
 * @param {object} o  the same things app/local-ai/desktop.cjs gets, plus optional `textVulkan`
 *   (async () => Text AI's Vulkan device list with free memory, when its engine is installed).
 */
function setupLocalImages({root,vault,local,changeListeners,net,shell,log,send,textVulkan}){
 const fetch=(url,opts)=>net.fetch(url,{...opts,bypassCustomProtocolHandlers:true});
 const service=new LocalImages({dataDir:path.join(root,'LocalImages'),fetch,...(textVulkan?{textVulkan}:{}),
  getSettings:async()=>(await vault.get('localImages')).localImages,setSettings:v=>local.set({localImages:v}),log});
 service.on('install',e=>send({kind:'images-install',...e}));
 service.on('status',s=>send({kind:'images-status',status:s}));
 service.on('job',e=>send({kind:'images-job',...e}));
 // The emergency stop ends an image being made.
 changeListeners.push(changes=>{if(changes.v22EmergencyStop?.newValue===true)void service.release('emergency stop');});
 const asResult=r=>({image:r.png.toString('base64'),mime:r.mime,bytes:r.bytes,width:r.width,height:r.height,seed:r.seed,steps:r.steps,label:r.label,uncensored:r.uncensored,device:r.device,ms:r.timings.totalMs,timings:r.timings});
 globalThis.tylerLocalImages={
  status:async()=>{const s=await service.status();return {ready:s.ready,installed:s.installed,model:s.model,label:s.modelLabel,uncensored:s.uncensored,needs:s.needs,running:s.running,device:s.device,size:s.size,friends:!!s.settings.friends};},
  /** o: {prompt, negative?, width?, height?, steps?, seed?, from:'owner'|'friend', names:[people in the chat], signal?, onProgress?} */
  generate:async o=>{
   const s=await service.settings();
   if(o?.from!=='owner'&&!s.friends)throw Object.assign(Error('Only the owner can ask Tyler for images (friends can be allowed in Settings → AI & personality → Images on this PC).'),{code:'friends_off',kind:'turn'});
   const r=await service.generate({prompt:o?.prompt,negative:o?.negative,width:o?.width,height:o?.height,steps:o?.steps,seed:o?.seed,signal:o?.signal,onProgress:o?.onProgress,names:Array.isArray(o?.names)?o.names.filter(x=>typeof x==='string'):[]});
   return asResult(r);
  },
  release:reason=>service.release(String(reason||'Tyler stopped').slice(0,60)),
 };
 const models=()=>Object.fromEntries(service.installer.modelKeys().map(k=>{const m=LOCK.models[k];return [k,{label:m.label,short:m.short,tier:m.tier,family:m.family,uncensored:!!m.uncensored,license:m.license,by:m.by,
  bytes:service.installer.modelBytes(k),needs:m.needs,steps:m.steps,size:m.size,parts:m.parts.map(p=>({id:p,label:LOCK.parts[p].label,repo:LOCK.parts[p].repo,revision:LOCK.parts[p].revision,file:LOCK.parts[p].file,bytes:LOCK.parts[p].size,license:LOCK.parts[p].license}))}];}));
 let test=null;
 async function settingsRequest(op,r={}){
  if(op==='status'){await service.hardware().catch(()=>null);return {status:await service.status(),models:models(),sizes:SIZES,engine:{build:LOCK.engine.build,license:LOCK.engine.license,page:LOCK.engine.page}};}
  if(op==='hardware'){const hw=await service.hardware(true);return {hardware:hw,suggestion:hardware.suggest(hw)};}
  if(op==='plan')return service.planFor({model:String(r.model||'')});
  if(op==='install'){void service.install({model:String(r.model||''),device:r.device==='cpu'?'cpu':r.device==='gpu'?'gpu':undefined,offline:Array.isArray(r.offline)?r.offline.filter(x=>typeof x==='string').slice(0,3):[]}).catch(e=>log('Images on this PC install failed',e.message));return {started:true};}
  if(op==='cancel'){service.cancelInstall();return {};}
  if(op==='remove'){await service.remove();return {};}
  if(op==='remove-model'){if(!LOCK.models[r.model])throw Error('Unknown model.');await service.removeModel(r.model);return {};}
  if(op==='settings'){const v=r.values||{},allowed={};for(const k of ['model','device','size','friends'])if(v[k]!==undefined)allowed[k]=v[k];return service.saveSettings(allowed);}
  // A test image from Settings: Tyler's own prompt (or the owner's), the same rules and engine as any other.
  if(op==='test'){if(test)throw Error('A test image is already being made.');const ctl=new AbortController();test=ctl;
   try{return asResult(await service.generate({prompt:typeof r.prompt==='string'&&r.prompt.trim()?r.prompt:TEST_PROMPT,width:r.width,height:r.height,steps:r.steps,signal:ctl.signal}));}finally{test=null;}}
  if(op==='stop'){test?.abort();await service.release('stopped from Settings');return {};}
  if(op==='verify')return service.installer.verify();
  if(op==='open-folder'){fs.mkdirSync(service.dir,{recursive:true});await shell.openPath(service.dir);return {};}
  throw Error('Unknown images setting.');
 }
 return {service,settingsRequest,shutdown:()=>service.shutdown(),kill:()=>service.killNow()};
}
module.exports={setupLocalImages,TEST_PROMPT};

'use strict';
// ROBOTIC TYLER images on this PC: what this PC has for image models, and which one suits it (v2.40).
//
// The engine is stable-diffusion.cpp with Vulkan, so any recent graphics card can be used (NVIDIA, AMD
// or Intel). Graphics memory comes from NVIDIA's nvidia-smi (total and free) or Windows' display-driver
// record (total only), through Text AI on this PC's detection (../local-ai/hardware.cjs). When Text AI's
// engine is installed, its Vulkan list (llama-server --list-devices) gives every card's free memory too.
// Once the image engine is installed, sd-cli --list-devices says which cards Vulkan really sees.
// Virtual adapters (Microsoft Basic Display, Hyper-V, Remote Desktop) and cards Vulkan can't see are
// never suggested (the v2.38 fix found on GitHub's Windows runner).
// The suggestion is only a suggestion: nothing installs or switches because of it, and an uncensored
// model is never suggested (the owner chooses that).
const text=require('../local-ai/hardware.cjs');
const LOCK=require('./lock.json');
const GB=1024**3;
const VIRTUAL=/Microsoft (Basic|Hyper-V|Remote)|Remote Display|Parsec Virtual|Virtual Display|VMware SVGA|VirtualBox|QXL|Red Hat/i;
const fmt=n=>(n/GB).toFixed(n>=10*GB?0:1)+' GB';
const norm=s=>String(s||'').toLowerCase().replace(/\(r\)|\(tm\)|nvidia|amd|intel|geforce|radeon|corporation|graphics|\s+/g,'');

/**
 * This PC: processor, memory, disk and graphics cards. `sd`: sd-cli's device list (names, built-in or
 * not); `vulkan`: Text AI's llama-server list (names and free memory), when it's installed.
 */
async function detect(dataDir,{sd=null,vulkan=null,adapters,baseDetect}={}){
 const hw=await text.detect(dataDir,{vulkan,...(adapters?{adapters}:{}),...(baseDetect?{baseDetect}:{})});
 let gpus=hw.gpus;
 if(sd?.listed){
  // The cards the image engine sees, with memory figures from the other sources where the names match.
  gpus=sd.devices.map(d=>{const m=hw.gpus.find(g=>norm(g.name)===norm(d.name))||hw.gpus.find(g=>norm(g.name).includes(norm(d.name))||norm(d.name).includes(norm(g.name)));
   return {...d,vramTotal:m?.vramTotal??null,vramFree:m?.vramFree??null,memorySource:m?.source||null,integrated:d.integrated||!!m?.integrated};});
 }
 return {...hw,gpus,sdChecked:!!sd,sdListed:!!sd?.listed};
}
/** The cards that can run an image model: no virtual adapters, no built-in graphics, only ones Vulkan sees. */
function usableCards(hw){
 return (hw.gpus||[]).filter(g=>!g.integrated&&!VIRTUAL.test(g.name)&&!(hw.sdListed&&g.source!=='vulkan')&&!(hw.vulkanListed&&!hw.sdListed&&g.source!=='vulkan'));
}
const need=(key,lock=LOCK)=>lock.models[key].needs;
/** The suggested model, where it runs and the image size, with the reasons. Never applied by itself. */
function suggest(hw,lock=LOCK){
 const notes=[],cards=usableCards(hw);
 const best=cards.slice().sort((a,b)=>(b.vramFree??b.vramTotal??0)-(a.vramFree??a.vramTotal??0))[0];
 const uncensoredFor=m=>m==='zimage-12gb'?'chroma-12gb':'chroma-8gb';
 if(!best){
  const igpu=(hw.gpus||[]).find(g=>g.integrated&&!VIRTUAL.test(g.name));
  notes.push(igpu?igpu.name+' is built into the processor and shares its memory, so the processor is suggested.':(hw.sdListed||hw.vulkanListed)?'Vulkan found no graphics card on this PC, so the processor is suggested.':'No graphics card was found, so the processor is suggested.');
  notes.push('On the processor an image takes many minutes (512 × 512 is the default there; the first test image shows how long on this PC). A graphics card is far faster.');
  if(hw.ram?.total&&hw.ram.total<need('zimage-8gb',lock).ram*1.2)notes.push('This PC has '+fmt(hw.ram.total)+' of memory; the image model needs about '+fmt(need('zimage-8gb',lock).ram)+' of it while it draws.');
  return {model:'zimage-8gb',device:'cpu',size:512,card:null,uncensored:'chroma-8gb',notes};
 }
 const free=best.vramFree,total=best.vramTotal;let model='zimage-8gb',size=1024;
 if(free!=null){
  if(free>=need('zimage-12gb',lock).vram*1.1)model='zimage-12gb';
  if(free<need('zimage-8gb',lock).vram)size=free>=4*GB?768:512;
  notes.push(best.name+' has '+fmt(free)+' of graphics memory free'+(total?' (of '+fmt(total)+')':'')+': '+(model==='zimage-12gb'?'enough for the 12 GB model.':size<1024?'the 6–8 GB model at '+size+' × '+size+' (smaller images need less memory).':'the 6–8 GB model fits; the 12 GB model needs about '+fmt(need('zimage-12gb',lock).vram*1.1)+' free.'));
 }else if(total){
  if(total>=11*GB)model='zimage-12gb';else if(total<7*GB)size=total>=5*GB?768:512;
  notes.push(best.name+' has '+fmt(total)+' of graphics memory: '+(model==='zimage-12gb'?'the 12 GB model should fit.':'the 6–8 GB model'+(size<1024?' at '+size+' × '+size:'')+'.')+' Free memory is checked before each image.');
 }else notes.push('Tyler couldn’t read how much memory '+best.name+' has, so the 6–8 GB model is suggested. The first test image shows how it runs.');
 const unc=uncensoredFor(model);
 notes.push('Uncensored: '+lock.models[unc].label+' (about '+fmt(need(unc,lock).vram)+' of graphics memory). Tyler never chooses it for you, and his image rules apply to it too.');
 notes.push('A game uses graphics memory too: if an image doesn’t fit while you play, Tyler says so (he never switches model or device by himself).');
 return {model,device:'gpu',size,card:best,uncensored:unc,notes};
}
module.exports={detect,suggest,usableCards,VIRTUAL,GB};

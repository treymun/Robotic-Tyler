'use strict';
// ROBOTIC TYLER local AI: what this PC has for a local text model, and which model suits it (v2.38).
//
// The engine is llama.cpp with Vulkan, so any recent graphics card can be used (NVIDIA, AMD or Intel).
// Before the engine is installed, graphics memory comes from NVIDIA's nvidia-smi (total and free) or,
// for other cards, from Windows' display-driver record (total only). Once the engine is installed it
// asks Vulkan itself (`llama-server --list-devices`), which gives every card's free memory.
// The suggestion is only a suggestion: nothing installs or switches because of it.
const {execFile}=require('node:child_process');
const base=require('../theme-voices/hardware.cjs');
const GB=1024**3,MiB=1024**2;
// Approximate needs with an 8192-token context, measured from the files plus llama.cpp's buffers.
const NEEDS={'4b':{vram:3.6*GB,ram:4.5*GB},'9b':{vram:6.8*GB,ram:8*GB}};
const NINE_B_FREE=7.5*GB; // "about 8 GB or more free" (8 GB = 7.45 GiB)
const sizeOf=key=>String(key).startsWith('9b')?'9b':'4b';

const run=(file,args,{timeout=8000,env}={})=>new Promise(resolve=>{try{execFile(file,args,{windowsHide:true,timeout,maxBuffer:2_000_000,env},(e,out,err)=>resolve({ok:!e,out:String(out||''),err:String(err||'')}));}catch(e){resolve({ok:false,out:'',err:String(e.message)});}});

/** Windows: every display adapter's total memory from its driver record (64-bit; no free figure). */
async function windowsAdapterMemory(){
 if(process.platform!=='win32')return [];
 const ps="Get-ItemProperty -Path 'HKLM:\\SYSTEM\\CurrentControlSet\\Control\\Class\\{4d36e968-e325-11ce-bfc1-08002be10318}\\0*' -ErrorAction SilentlyContinue | ForEach-Object { [string]$_.DriverDesc + '|' + [string]$_.'HardwareInformation.qwMemorySize' }";
 const r=await run('powershell.exe',['-NoProfile','-NonInteractive','-Command',ps]);
 return r.out.split(/\r?\n/).map(l=>l.trim()).filter(Boolean).map(l=>{const [name,mem]=l.split('|');return {name:name.trim(),vramTotal:Number(mem)||null};}).filter(x=>x.name);
}
/**
 * The graphics cards the installed engine can use, from Vulkan: [{id,name,vramTotal,vramFree,integrated}].
 * `env` must point GGML_BACKEND_PATH at the Vulkan backend (the engine keeps it in its gpu folder).
 */
async function vulkanDevices(exe,env){
 const r=await run(exe,['--list-devices'],{timeout:20000,env});
 const text=r.out+'\n'+r.err,devices=[];
 // ggml_vulkan's own line says whether a card shares the PC's memory ("uma: 1" = built into the processor).
 const uma={};for(const m of text.matchAll(/ggml_vulkan:\s*(\d+)\s*=\s*.*?\|\s*uma:\s*(\d)/g))uma[m[1]]=m[2]==='1';
 for(const m of text.matchAll(/^\s*(Vulkan(\d+)):\s*(.+?)\s*\((\d+)\s*MiB,\s*(\d+)\s*MiB free\)\s*$/gm))
  devices.push({id:m[1],name:m[3],vramTotal:Number(m[4])*MiB,vramFree:Number(m[5])*MiB,integrated:uma[m[2]]===true,source:'vulkan'});
 return {ok:r.ok,devices,listed:/Available devices:/.test(text)};
}
/** This PC: processor, memory, disk and graphics cards (with memory where it can be read). */
async function detect(dataDir,{vulkan=null,adapters=windowsAdapterMemory,baseDetect=base.detect}={}){
 const hw=await baseDetect(dataDir);
 let gpus=hw.gpus.map(g=>({...g,source:g.vramTotal?'nvidia-smi':'windows'}));
 if(vulkan?.devices?.length){gpus=vulkan.devices;}
 else{
  const mem=await adapters().catch(()=>[]);
  for(const g of gpus)if(!g.vramTotal){const a=mem.find(x=>x.name===g.name);if(a?.vramTotal)Object.assign(g,{vramTotal:a.vramTotal,source:'windows'});}
  // Built-in graphics share the PC's memory: Intel UHD/Iris and AMD's "Radeon Graphics" without a model number.
  for(const g of gpus)if(g.integrated===undefined)g.integrated=/\b(UHD|Iris|HD Graphics)\b/i.test(g.name)||/^AMD Radeon(\(TM\))? Graphics$/i.test(g.name)||/Microsoft Basic/i.test(g.name);
 }
 return {...hw,gpus,vulkanChecked:!!vulkan,vulkanListed:!!vulkan?.listed};
}
const fmt=n=>(n/GB).toFixed(n>=10*GB?0:1)+' GB';
/** The suggested model and where it runs, with the reasons. Never applied by itself. */
function suggest(hw){
 // A card Vulkan can't see can't run the model (when Vulkan was asked and listed none), and virtual
 // adapters (Hyper-V, Remote Desktop, Basic Display) aren't graphics cards.
 const notes=[],cards=(hw.gpus||[]).filter(g=>!g.integrated&&!/Microsoft (Basic|Hyper-V|Remote)/i.test(g.name)&&!(hw.vulkanListed&&g.source!=='vulkan'));
 const best=cards.slice().sort((a,b)=>(b.vramFree??b.vramTotal??0)-(a.vramFree??a.vramTotal??0))[0];
 if(!best){
  const igpu=(hw.gpus||[]).find(g=>g.integrated&&!/Microsoft Basic/i.test(g.name));
  notes.push(igpu?igpu.name+' is built into the processor and shares its memory, so the processor is suggested (you can still try the graphics card).':hw.vulkanChecked?'Vulkan found no graphics card on this PC, so the processor is suggested.':'No graphics card was found, so the processor is suggested.');
  notes.push('On the processor replies take longer than on a graphics card (the speed check shows how long on this PC); the 9B model is about twice as slow as the 4B.');
  if(hw.ram?.total&&hw.ram.total<NEEDS['4b'].ram*1.5)notes.push('This PC has '+fmt(hw.ram.total)+' of memory; the 4B model needs about '+fmt(NEEDS['4b'].ram)+' of it while it runs.');
  return {model:'4b',device:'cpu',card:null,notes};
 }
 let model='4b';
 if(best.vramFree!=null){model=best.vramFree>=NINE_B_FREE?'9b':'4b';notes.push(best.name+' has '+fmt(best.vramFree)+' of graphics memory free'+(best.vramTotal?' (of '+fmt(best.vramTotal)+')':'')+': '+(model==='9b'?'enough for the 9B model.':'the 4B model fits; the 9B model needs about 8 GB free.'));}
 else if(best.vramTotal){model=best.vramTotal>=10*GB?'9b':'4b';notes.push(best.name+' has '+fmt(best.vramTotal)+' of graphics memory: '+(model==='9b'?'the 9B model should fit.':'the 4B model fits; the 9B model needs about 8 GB free.')+' Free memory is checked when the AI starts.');}
 else notes.push('Tyler couldn’t read how much memory '+best.name+' has, so the 4B model is suggested. The speed check shows how it runs.');
 notes.push('A game uses graphics memory too: if the model doesn’t fit while you play, Tyler says so (he never switches model by himself).');
 return {model,device:'gpu',card:best,notes};
}
module.exports={detect,suggest,vulkanDevices,windowsAdapterMemory,NEEDS,NINE_B_FREE,sizeOf,GB};

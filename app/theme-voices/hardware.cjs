'use strict';
// ROBOTIC TYLER theme voices: what this computer has, and which voice mode suits it (v2.35).
//
// Nothing here assumes a particular PC. The graphics card comes from NVIDIA's own nvidia-smi (part of
// the driver); other cards are listed by name only, because the voice engine can't use them.
const os=require('node:os'),fs=require('node:fs'),{execFile}=require('node:child_process');
const GB=1024**3;
const run=(file,args,timeout=8000)=>new Promise(resolve=>{try{execFile(file,args,{windowsHide:true,timeout,maxBuffer:1_000_000},(e,out)=>resolve(e?null:String(out)));}catch{resolve(null);}});

// The GPU engine is PyTorch built for CUDA 12.8: NVIDIA cards from the GTX 16/RTX 20 series (Turing,
// compute capability 7.5) up to the RTX 50 series (12.0), with a driver from 570 or later.
const CUDA={minCapability:7.5,maxCapability:12.0,minDriver:570.65};

function nvidiaSmiPaths(){
 if(process.platform!=='win32')return ['nvidia-smi'];
 const sys=process.env.SystemRoot||'C:\\Windows';
 return [sys+'\\System32\\nvidia-smi.exe',(process.env.ProgramW6432||'C:\\Program Files')+'\\NVIDIA Corporation\\NVSMI\\nvidia-smi.exe','nvidia-smi'];
}
async function nvidia(){
 for(const exe of nvidiaSmiPaths()){
  if(exe.includes('\\')&&!fs.existsSync(exe))continue;
  const out=await run(exe,['--query-gpu=name,memory.total,memory.free,driver_version,compute_cap','--format=csv,noheader,nounits']);
  if(!out)continue;
  return out.trim().split(/\r?\n/).filter(Boolean).map(line=>{const [name,total,free,driver,cap]=line.split(',').map(s=>s.trim());
   return {vendor:'NVIDIA',name,vramTotal:Number(total)*1024**2||0,vramFree:Number(free)*1024**2||0,driver:driver||null,capability:Number(cap)||null};});
 }
 return [];
}
async function otherGpus(){
 if(process.platform!=='win32')return [];
 const out=await run('powershell.exe',['-NoProfile','-NonInteractive','-Command','Get-CimInstance Win32_VideoController | ForEach-Object { $_.Name }']);
 return out?out.split(/\r?\n/).map(s=>s.trim()).filter(Boolean).map(name=>({vendor:/nvidia/i.test(name)?'NVIDIA':/amd|radeon/i.test(name)?'AMD':/intel/i.test(name)?'Intel':'Other',name})):[];
}
async function diskFree(dir){
 try{fs.mkdirSync(dir,{recursive:true});const s=await fs.promises.statfs(dir);return s.bavail*s.bsize;}catch{return null;}
}
/** Everything the installer and the mode choice need to know about this PC. */
async function detect(dataDir,{probe=nvidia,others=otherGpus}={}){
 const cpus=os.cpus()||[];
 const [nv,all,disk]=await Promise.all([probe().catch(()=>[]),others().catch(()=>[]),diskFree(dataDir)]);
 const gpus=[...nv];for(const g of all)if(!(g.vendor==='NVIDIA'&&nv.length))gpus.push(g);
 return {os:{platform:process.platform,release:os.release(),arch:process.arch},
  cpu:{model:(cpus[0]?.model||'Unknown processor').replace(/\s+/g,' ').trim(),threads:cpus.length},
  ram:{total:os.totalmem(),free:os.freemem()},gpus,disk:{free:disk,path:dataDir},at:Date.now()};
}
// Sizes measured from the models (bf16 weights + speech tokenizer) and a working margin for speaking.
const NEEDS={quality:{vram:6.5*GB,ram:10*GB,label:'Quality (Qwen3-TTS 1.7B)'},light:{vram:4*GB,ram:7*GB,label:'Lightweight (Qwen3-TTS 0.6B)'}};
function usableGpu(hw){
 const g=hw.gpus.find(x=>x.vendor==='NVIDIA');if(!g)return {gpu:null,why:hw.gpus.length?'Your graphics card ('+hw.gpus.map(x=>x.name).join(', ')+') isn’t one the voice engine can use; it needs an NVIDIA card.':'No NVIDIA graphics card was found.'};
 if(g.capability&&g.capability<CUDA.minCapability)return {gpu:null,why:g.name+' is too old for the voice engine (it needs a GTX 16 / RTX 20 series card or newer).'};
 const driver=parseFloat(g.driver||'0');
 if(driver&&driver<CUDA.minDriver)return {gpu:null,driverTooOld:true,card:g,why:'Your NVIDIA driver is version '+g.driver+'. The voice engine needs version '+CUDA.minDriver.toFixed(2).replace(/0$/,'')+' or newer. Update it with the NVIDIA app or from nvidia.com/drivers, then check again. (Tyler never changes drivers itself.)'};
 return {gpu:g,why:null};
}
/** The suggested mode and where it runs, with the reasons spelled out. Never applied silently. */
function recommend(hw){
 const {gpu,why,driverTooOld,card}=usableGpu(hw),notes=[];let mode,device;
 if(gpu){
  device='cuda';
  if(gpu.vramTotal>=8*GB){mode='quality';notes.push(gpu.name+' has '+(gpu.vramTotal/GB).toFixed(0)+' GB of graphics memory: enough for Quality mode.');}
  else if(gpu.vramTotal>=NEEDS.light.vram){mode='light';notes.push(gpu.name+' has '+(gpu.vramTotal/GB).toFixed(1)+' GB of graphics memory: Lightweight mode fits; Quality needs about '+(NEEDS.quality.vram/GB).toFixed(1)+' GB free.');}
  else{device='cpu';mode='light';notes.push(gpu.name+' has too little graphics memory ('+(gpu.vramTotal/GB).toFixed(1)+' GB), so the voices would run on the processor.');}
  if(device==='cuda'&&gpu.vramFree&&gpu.vramFree<NEEDS[mode].vram)notes.push('Right now only '+(gpu.vramFree/GB).toFixed(1)+' GB of graphics memory is free (a game may be using it). Voices load when first used and can unload when idle.');
 }else{
  device='cpu';mode='light';notes.push(why);
  notes.push('On the processor a voice message takes much longer than it lasts (roughly 5–25× on most PCs), so Lightweight mode is suggested.');
 }
 if(hw.ram.total<NEEDS[mode].ram)notes.push('This PC has '+(hw.ram.total/GB).toFixed(0)+' GB of memory; '+NEEDS[mode].label+' works best with '+(NEEDS[mode].ram/GB).toFixed(0)+' GB or more.');
 return {mode,device,notes,driverTooOld:!!driverTooOld,card:card||gpu||null,gpu:gpu||null};
}
module.exports={detect,recommend,usableGpu,NEEDS,CUDA,GB};

'use strict';
// ROBOTIC TYLER images on this PC: one image = one run of stable-diffusion.cpp's sd-cli (v2.40).
//
//   - No network port at all: sd-server has no way to require a key, so Tyler runs sd-cli once per image.
//     The prompt goes in through a file in the job's own folder (not the command line, where other
//     programs can read it), the image comes back as a PNG file there, and the folder is deleted.
//   - Generation metadata isn't written into the PNG (--disable-image-metadata): no prompt or file
//     paths travel with an image that's posted somewhere.
//   - The environment is a short allowlist; the Vulkan backend is only loaded for the graphics card
//     (GGML_BACKEND_PATH points at gpu\ggml-vulkan.dll); on the processor it isn't even loaded.
//   - Where it runs is set explicitly: --backend VulkanN (or cpu) and --auto-fit off, so the engine
//     never moves the work to another device by itself. On a graphics card the text encoder's weights
//     wait in the PC's memory and visit the card only while the prompt is read (--params-backend te=cpu).
//   - When the process ends, all of its memory is given back: nothing stays loaded between images.
const {spawn}=require('node:child_process'),fs=require('node:fs'),path=require('node:path');
const KEEP_ENV=['SystemRoot','SYSTEMROOT','WINDIR','TEMP','TMP','LOCALAPPDATA','APPDATA','USERPROFILE','HOME','PATH','NUMBER_OF_PROCESSORS','PROCESSOR_ARCHITECTURE','LANG'];
const ROLE_ARG={diffusion:'--diffusion-model',llm:'--llm',t5xxl:'--t5xxl',vae:'--vae',model:'-m'};
const DLL_MISSING=new Set([3221225781,-1073741515]);

/** The command line for one image (paths, never the prompt itself). */
function buildArgs({model,files,device,gpuId,width,height,steps,seed,cfg=model.cfg,sampler=model.sampler,promptFile,negativeFile,output,threads}){
 const args=[];
 for(const [role,flag] of Object.entries(ROLE_ARG))if(files[role])args.push(flag,files[role]);
 args.push('--prompt-file',promptFile);
 if(negativeFile)args.push('--negative-prompt-file',negativeFile);
 args.push('-W',String(width),'-H',String(height),'--steps',String(steps),'--cfg-scale',String(cfg),'--sampling-method',sampler,'--seed',String(seed),'-t',String(threads));
 if(device==='gpu')args.push('--backend',gpuId||'Vulkan0','--auto-fit','off',...(model.gpuArgs||[]));
 else args.push('--backend','cpu','--auto-fit','off');
 args.push('--disable-image-metadata','--log-level','info','-o',output);
 return args;
}
function env({device,gpuBackend}){
 const e={};for(const k of KEEP_ENV)if(process.env[k]!==undefined)e[k]=process.env[k];
 if(device==='gpu'&&gpuBackend)e.GGML_BACKEND_PATH=gpuBackend;
 return e;
}
/** What a failed run means, from its last lines and exit code. */
function classify(lines,code){
 if(DLL_MISSING.has(Number(code)))return 'runtime_missing';
 const t=lines.join('\n');
 if(/out of (device |host )?memory|OutOfDeviceMemory|OutOfHostMemory|failed to allocate|unable to allocate|cannot allocate|not enough memory|allocation of size \d+ failed|alloc\w* .*buffer failed|graph allocation failed|too less memory|but only [\d.]+ MB is available|bad_alloc|capacity check failed/i.test(t))return 'out_of_memory';
 if(/backend '[^']*' was not found|No devices found|ErrorInitializationFailed|ErrorIncompatibleDriver|vk::\w*Error|failed to initialize Vulkan|ggml_vulkan: No devices/i.test(t))return 'no_gpu';
 if(/ErrorDeviceLost|device lost/i.test(t))return 'gpu_lost';
 if(/load .*failed|failed to load|invalid magic|unknown model|get sd version from file failed|new_sd_ctx_t failed|error: .*(?:not found|doesn'?t exist|does not exist)|failed to open|read tensor data failed/i.test(t))return 'model_load';
 if(/error: (invalid|the following arguments|unknown argument|unrecognized)/i.test(t))return 'bad_args';
 return 'crashed';
}
const ANSI=/\x1b\[[0-9;?]*[A-Za-z]/g;
/** Takes paths out of engine lines before they're shown (they'd carry the Windows user name). */
const scrub=s=>String(s).replace(/[A-Za-z]:[\\/][^'"\s)]+/g,'…').replace(/(?<![\w.])\/(?:[\w.@+-]+\/)+[\w.@+-]*/g,'…');

/**
 * Runs sd-cli once. Resolves {code, signal, ms, timings, memory, seed, tail, saved, timedOut, stalled, cancelled}.
 * onProgress({phase:'load'|'encode'|'sample'|'decode'|'save', step, steps, secondsPerStep, label}).
 */
function run({exe,args,env:e,cwd,signal,onProgress=()=>{},onSpawn=()=>{},timeoutMs=600000,stallMs=180000,log=()=>{}}){
 return new Promise(resolve=>{
  const started=Date.now(),tail=[],timings={},memory={};let phase='load',seed=null,saved=null,carry='',timedOut=false,stalled=false,cancelled=false,lastStep=null,quiet=null,settled=false;
  let proc;
  try{proc=spawn(exe,args,{cwd:cwd||path.dirname(exe),env:e,windowsHide:true,stdio:['ignore','pipe','pipe']});}
  catch(err){resolve({code:null,error:err,tail,timings,memory,ms:0});return;}
  onSpawn(proc);
  const kill=()=>{try{proc.kill(process.platform==='win32'?undefined:'SIGKILL');}catch{}};
  const arm=()=>{clearTimeout(quiet);quiet=setTimeout(()=>{stalled=true;kill();},stallMs);};arm();
  const timer=setTimeout(()=>{timedOut=true;kill();},timeoutMs);
  const abort=()=>{cancelled=true;kill();};
  if(signal){if(signal.aborted)abort();else signal.addEventListener('abort',abort,{once:true});}
  const tell=(extra={})=>{try{onProgress({phase,elapsedMs:Date.now()-started,...extra});}catch{}};
  const line=raw=>{
   const l=raw.replace(ANSI,'').trim();if(!l)return;
   const bar=/\|\s*(\d+)\/(\d+)\s*-\s*([\d.]+)\s*(s\/it|it\/s|[KMG]?B\/s)/.exec(l);
   if(bar){
    if(/it/.test(bar[4])&&(phase==='sample'||phase==='decode')){const v=Number(bar[3]),sps=bar[4]==='s/it'?v:(v>0?1/v:null);lastStep={step:Number(bar[1]),steps:Number(bar[2]),secondsPerStep:sps};tell(lastStep);}
    return;
   }
   tail.push(scrub(l).slice(0,300));if(tail.length>60)tail.shift();
   const m=/^\[(?:I|W|E|D|V|INFO|WARN|ERROR)\]\s*(.*?)(?:\s+---\s+\S+:\d+)?$/.exec(l),msg=m?m[1]:l;
   let x;
   if((x=/^total params memory size = ([\d.]+)MB \(VRAM ([\d.]+)MB, RAM ([\d.]+)MB\)/.exec(msg))){memory.totalMB=+x[1];memory.vramMB=+x[2];memory.ramMB=+x[3];}
   else if(/^generate_image \d+x\d+/.test(msg)){timings.loadMs=Date.now()-started;phase='encode';tell({label:'Reading the prompt'});}
   else if((x=/^get_learned_condition completed, taking ([\d.]+)s/.exec(msg)))timings.encodeMs=Math.round(+x[1]*1000);
   else if((x=/^generating image: \d+\/\d+ - seed (-?\d+)/.exec(msg))){seed=Number(x[1]);phase='sample';tell({label:'Drawing',step:0});}
   else if((x=/^sampling completed, taking ([\d.]+)s/.exec(msg)))timings.sampleMs=Math.round(+x[1]*1000);
   else if(/^decoding \d+/.test(msg)){phase='decode';tell({label:'Finishing the image'});}
   else if((x=/^decode_first_stage completed, taking ([\d.]+)s/.exec(msg)))timings.decodeMs=Math.round(+x[1]*1000);
   else if((x=/^generate_image completed in ([\d.]+)s/.exec(msg)))timings.generateMs=Math.round(+x[1]*1000);
   else if((x=/^save result image \d+ to .*\((success|failure)\)/.exec(msg))){saved=x[1]==='success';phase='save';tell({label:'Saved'});}
  };
  const feed=d=>{arm();carry+=String(d);const parts=carry.split(/\r\n|\r|\n/);carry=parts.pop();for(const p of parts)line(p);if(carry.length>8000){line(carry);carry='';}};
  proc.stdout.on('data',feed);proc.stderr.on('data',feed);
  tell({label:'Loading the model'});
  const done=(code,sig,error)=>{if(settled)return;settled=true;clearTimeout(quiet);clearTimeout(timer);signal?.removeEventListener('abort',abort);if(carry)line(carry);
   if(lastStep&&timings.sampleMs==null)timings.lastStep=lastStep;
   resolve({code,signal:sig,error,ms:Date.now()-started,timings,memory,seed,tail,saved,timedOut,stalled,cancelled,lastStep,pid:proc.pid});};
  proc.on('error',err=>done(null,null,err));
  proc.on('exit',(code,sig)=>setImmediate(()=>done(code,sig,null)));
 });
}
/** Vulkan devices sd-cli sees ("Vulkan0\tNVIDIA GeForce RTX 4060"), with ggml_vulkan's "uma" flag (built-in graphics). */
function parseDevices(text){
 const uma={},devices=[];
 for(const m of String(text).matchAll(/ggml_vulkan:\s*(\d+)\s*=\s*.*?\|\s*uma:\s*(\d)/g))uma[m[1]]=m[2]==='1';
 for(const m of String(text).matchAll(/^\s*(Vulkan(\d+))\t(.+?)\s*$/gm))devices.push({id:m[1],name:m[3],integrated:uma[m[2]]===true,source:'vulkan'});
 return devices;
}
function listDevices(exe,{env:e,timeout=20000}={}){
 return new Promise(resolve=>{let out='';try{const p=spawn(exe,['--list-devices'],{cwd:path.dirname(exe),env:e,windowsHide:true,stdio:['ignore','pipe','pipe']});
  const t=setTimeout(()=>{try{p.kill();}catch{}},timeout);p.stdout.on('data',d=>out+=d);p.stderr.on('data',d=>out+=d);
  p.on('error',()=>{clearTimeout(t);resolve({ok:false,listed:false,devices:[],text:''});});
  p.on('exit',code=>{clearTimeout(t);const devices=parseDevices(out);resolve({ok:code===0,listed:code===0,devices,text:scrub(out).slice(-2000)});});}
 catch{resolve({ok:false,listed:false,devices:[],text:''});}});
}
/** Width and height of a PNG (from its header), or null when it isn't one. */
function pngSize(buf){
 if(!Buffer.isBuffer(buf)||buf.length<33||buf.readUInt32BE(0)!==0x89504e47||buf.readUInt32BE(4)!==0x0d0a1a0a||buf.toString('latin1',12,16)!=='IHDR')return null;
 return {width:buf.readUInt32BE(16),height:buf.readUInt32BE(20)};
}
module.exports={buildArgs,env,classify,run,listDevices,parseDevices,pngSize,scrub,KEEP_ENV,DLL_MISSING};

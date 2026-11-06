// REAL test of "Split between the graphics card and the processor" (v2.44) on Linux, with the pinned
// llama.cpp build (b11669) and no graphics card: llama.cpp's own RPC server (ggml-rpc-server, part of the
// same build, running on the processor) stands in for the card. llama-server sees it as a device
// ("RPC0") exactly like a Vulkan card, so `--device RPC0 -ngl N` puts N layers on it and the rest on
// the processor, the same way `--device VulkanN -ngl N` does on Windows. What this proves: the app's
// command line parses, llama.cpp puts exactly the planned number of layers on the device, and the
// device's model + cache buffers are the sizes split.cjs planned with. What it can't prove: Vulkan's
// own working buffers on a real NVIDIA/AMD/Intel card, and the free-memory reading of a real card.
//
// Usage: node tools/local-ai/split-real.cjs <unpacked llama-b11669 folder> <4B .gguf> [<9B .gguf>]
//   The .gguf files may be the real pinned files or copies with their real header and empty weights
//   (the plan only depends on the tensor layout; llama.cpp loads either).
'use strict';
const path=require('node:path'),fs=require('node:fs'),os=require('node:os'),{spawn,execFileSync}=require('node:child_process');
const APP=path.join(__dirname,'..','..','app','local-ai');
const {LlamaServer}=require(path.join(APP,'server.cjs')),split=require(path.join(APP,'split.cjs')),{LOCK}=require(path.join(APP,'installer.cjs'));
const NEEDS=require(path.join(__dirname,'..','..','app','theme-voices','hardware.cjs')).NEEDS;
const [engineDir,file4,file9]=process.argv.slice(2);
if(!engineDir||!file4)throw Error('Usage: node tools/local-ai/split-real.cjs <llama-b11669 folder> <4B .gguf> [<9B .gguf>]');
const exe=path.join(engineDir,'llama-server'),GB=1024**3,MiB=1024**2,t0=Date.now();
const say=(...a)=>console.log(((Date.now()-t0)/1000).toFixed(1).padStart(6)+' s  '+a.join(' '));
const card=12288*MiB-0.9*GB; // a 12 GB card with 0.9 GB used by Windows (the RTX 3060 in the tests)
const SCENARIOS=[
 {model:'4b',file:file4,name:'4B, a game using 7 GB of a 12 GB card, no theme voice',free:card-7*GB,reserve:0},
 {model:'9b',file:file9,name:'9B, 12 GB card with a Quality theme voice (the friend\'s case)',free:card,reserve:NEEDS.quality.vram},
 {model:'4b',file:file4,name:'4B, 12 GB card, a game using 7 GB and a Lightweight voice: nothing fits',free:card-7*GB,reserve:NEEDS.light.vram},
].filter(s=>s.file);
(async()=>{
 say(os.platform(),os.release(),'node',process.version,'cpus',os.cpus().length,'ram',(os.totalmem()/GB).toFixed(1),'GB; engine',engineDir);
 {const v=require('node:child_process').spawnSync(exe,['--version'],{encoding:'utf8'});say('llama-server --version:',(v.stdout+v.stderr).trim().split('\n').filter(l=>/version|built/.test(l)).join(' / '));}
 const port=50000+Math.floor(Math.random()*9000),rpc=spawn(path.join(engineDir,'ggml-rpc-server'),['-H','127.0.0.1','-p',String(port),'-t',String(Math.max(1,os.cpus().length))],{stdio:['ignore','pipe','pipe']});
 rpc.stderr.on('data',()=>{});rpc.stdout.on('data',()=>{});await new Promise(r=>setTimeout(r,1500));
 const list=execFileSync(exe,['--rpc','127.0.0.1:'+port,'--list-devices'],{encoding:'utf8',stdio:['ignore','pipe','pipe']});
 say('stand-in card:',(/RPC0:.*$/m.exec(list)||['none'])[0]);
 let failed=0;
 try{
  for(const s of SCENARIOS){
   const layers=split.layersOf(LOCK.models[s.model]),p=split.plan({layers,free:s.free,reserve:s.reserve}),log=path.join(os.tmpdir(),'tyler-split-'+process.pid+'-'+s.model+'-'+p.layers+'.log');
   const reserve=s.reserve?{bytes:s.reserve,label:s.reserve===NEEDS.quality.vram?'Quality':'Lightweight'}:null;
   say('');say('SCENARIO',s.name);say('plan:',p.layers+'/'+p.of,'layers on the card,',(p.bytes/MiB).toFixed(2),'MiB of model and cache there; budget',(p.budget/GB).toFixed(2),'GB');
   say('note:',split.note({p,card:'the card',reserve}));
   const device=p.none?'cpu':p.all?'gpu':'split';
   // The app's own command line, with the stand-in card's address first (llama.cpp needs --rpc before --device).
   class WithStandIn extends LlamaServer{args(p){return ['--rpc','127.0.0.1:'+port,...super.args(p)];}}
   const srv=new WithStandIn({exe,model:s.file,device,gpuId:'RPC0',layers:p.layers,threads:Math.max(1,Math.floor(os.cpus().length/2))||1,log:(...a)=>say('[log]',...a),startTimeout:600000,
    extraArgs:['-lv','4','--log-file',log]});
   say('command line:',path.basename(exe),srv.args('<port>').map(a=>a===s.file?'<'+path.basename(s.file)+'>':/\s|[{}]/.test(a)?JSON.stringify(a):a).join(' '));
   const r=await srv.start();say('ready after',r.loadMs,'ms');
   const reply=await srv.chat({messages:[{role:'user',content:'Say hi.'}],max_tokens:8,stream:true},{});
   say('one streamed reply: HTTP 200,',reply.usage?.completion_tokens??reply.timings?.predicted_n??'?','tokens (the weights may be empty: the text isn\'t the point)');
   await srv.stop();
   const text=fs.readFileSync(log,'utf8');fs.rmSync(log,{force:true});
   const get=re=>{const m=re.exec(text);return m?m[1]:null;},off=get(/offloaded (\d+\/\d+) layers to GPU/);
   const model=Number(get(/RPC0\[[^\]]*\] model buffer size =\s*([\d.]+) MiB/)||0),kv=Number(get(/RPC0\[[^\]]*\] KV buffer size =\s*([\d.]+) MiB/)||0),rs=Number(get(/RPC0\[[^\]]*\] RS buffer size =\s*([\d.]+) MiB/)||0),comp=Number(get(/RPC0\[[^\]]*\] compute buffer size =\s*([\d.]+) MiB/)||0);
   say('llama.cpp: offloaded',off||'0/'+p.of,'layers to GPU; on the stand-in card: model',model,'MiB + KV',kv,'MiB + recurrent state',rs,'MiB =',(model+kv+rs).toFixed(2),'MiB (planned',(p.bytes/MiB).toFixed(2)+'), compute buffer',comp,'MiB');
   const want=p.none?'0/'+p.of:p.layers+'/'+p.of,ok=(off||'0/'+p.of)===want&&Math.abs(model+kv+rs-p.bytes/MiB)<0.1;
   say(ok?'OK: the layers and sizes are as planned':'MISMATCH: wanted '+want);if(!ok)failed++;
  }
 }finally{rpc.kill('SIGKILL');}
 say('');say(failed?failed+' scenario(s) didn\'t match':'all '+SCENARIOS.length+' scenarios matched the plan');process.exit(failed?1:0);
})().catch(e=>{console.error(e);process.exit(1);});

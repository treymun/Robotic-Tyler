// REAL test of Text AI on this PC (v2.38), run by .github/workflows/local-ai-windows.yml on GitHub's
// Windows runner (no graphics card), and usable on Linux for development (it then installs the
// Linux build). It uses the app's own service and installer:
//   1. shows the plan, then installs the engine (llama.cpp b11669) and a model (MODEL, default 4b)
//      from their real sources, checked against app/local-ai/lock.json;
//   2. on Windows, asks Vulkan for graphics cards the way the app does (the runner has none);
//   3. starts the real llama-server on the processor (or DEVICE=auto), checks it listens only on
//      127.0.0.1 and refuses requests without the key, runs the speed check and one streamed reply,
//      with times for each step; then closes it and checks the process is gone.
// Usage: node tools/local-ai/windows-smoke.cjs <data folder>
//   env: MODEL (4b), DEVICE=cpu|auto|split (v2.44: split prints where the layers went), OFFLINE=<folder with files already downloaded, checked like downloads>
'use strict';
const path=require('node:path'),os=require('node:os'),http=require('node:http'),fs=require('node:fs');
const APP=path.join(__dirname,'..','..','app','local-ai');
const {LocalAI}=require(path.join(APP,'service.cjs')),hardware=require(path.join(APP,'hardware.cjs'));
const dir=process.argv[2]||path.join(os.tmpdir(),'TylerLocalAI'),MODEL=process.env.MODEL||'4b',DEVICE=['auto','split'].includes(process.env.DEVICE)?process.env.DEVICE:'cpu';
let saved={model:MODEL,device:DEVICE,idleMinutes:0};
const t0=Date.now(),at=()=>((Date.now()-t0)/1000).toFixed(1).padStart(7)+' s ';
const say=(...a)=>console.log(at()+a.join(' '));
const limit=(p,s,what)=>Promise.race([p,new Promise((_,j)=>setTimeout(()=>j(Error(what+': no answer after '+s+' s')),s*1000))]);
const svc=new LocalAI({dataDir:dir,fetch:globalThis.fetch,getSettings:async()=>saved,setSettings:async v=>{saved=v;},log:(...a)=>say('[log]',...a.map(String)),startTimeout:600000});
const get=(port,p,headers={})=>new Promise((resolve,reject)=>{const r=http.get({host:'127.0.0.1',port,path:p,headers,agent:false},res=>{let b='';res.on('data',d=>b+=d);res.on('end',()=>resolve({status:res.statusCode,body:b}));});r.on('error',reject);});
(async()=>{
 say(process.platform,os.release(),'node',process.version,'cpus',os.cpus().length,'('+(os.cpus()[0]?.model||'?').trim()+')','ram',(os.totalmem()/2**30).toFixed(1),'GB; model',MODEL,'device',DEVICE,'into',dir);
 const hw=await svc.hardware(true);say('this PC:',JSON.stringify({gpus:hw.gpus,ram:hw.ram,disk:hw.disk}));say('suggestion:',JSON.stringify(hardware.suggest(hw)));
 const p=await svc.planFor({model:MODEL});say('plan: download',(p.download/2**30).toFixed(2),'GB, disk',(p.disk/2**30).toFixed(2),'GB, files',p.fileCount,'(engine',p.runtime+', ready:',p.runtimeReady+'; model ready:',p.modelReady+')');
 let last=0;svc.on('install',e=>{const now=Date.now();if(now-last>15000||e.phase!=='download'){last=now;say('[install]',e.phase,e.label||'',e.bytes!=null&&e.totalBytes?((e.bytes/2**30).toFixed(2)+'/'+(e.totalBytes/2**30).toFixed(2)+' GB'):'');}});
 const ti=Date.now();await limit(svc.install({model:MODEL,offline:process.env.OFFLINE?[process.env.OFFLINE]:[]}),3000,'install');say('installed in',((Date.now()-ti)/1000).toFixed(0),'s:',JSON.stringify(svc.installer.status()));
 if(process.platform==='win32'){const vk=await svc.vulkan(true);say('Vulkan devices (GGML_BACKEND_PATH=gpu\\ggml-vulkan.dll):',JSON.stringify(vk));}
 const c=await limit(svc.speedCheck(),900,'speed check');say('SPEED CHECK',JSON.stringify(c));
 if(svc.loaded?.note)say('PLACEMENT',svc.loaded.note);
 const port=svc.server.port;
 const h=await get(port,'/health');say('/health',h.status,h.body.slice(0,80));
 const noKey=await get(port,'/v1/models');say('/v1/models without the key:',noKey.status,noKey.body.slice(0,100));if(noKey.status!==401)throw Error('the engine answered without the key');
 const ui=await get(port,'/');say('/ (web page, should be off):',ui.status,ui.body.slice(0,60).replace(/\s+/g,' '));
 if(process.platform==='linux'){const tcp=['/proc/net/tcp','/proc/net/tcp6'].filter(f=>fs.existsSync(f)).map(f=>fs.readFileSync(f,'utf8')).join('\n'),hex=port.toString(16).toUpperCase().padStart(4,'0');
  const rows=tcp.split('\n').filter(l=>l.includes(':'+hex+' ')&&/ 0A /.test(l)).map(l=>l.trim().split(/\s+/)[1]);say('listening sockets on port',port+':',rows.join(', '));if(rows.some(r=>!/^0100007F:/.test(r)))throw Error('listening beyond 127.0.0.1');}
 let firstAt=null;const ts=Date.now();
 const r=await limit(svc.chat({messages:[{role:'system',content:'You are ROBOTIC TYLER, a witty gaming buddy in a Steam group chat. Reply in one or two short sentences.'},{role:'user',content:'[chat] Sam: tyler, who wins, a tank or a sniper?'}],max_tokens:80,stream:true,onText:t=>{if(firstAt===null)firstAt=Date.now()-ts;},timeoutMs:600000}),700,'reply');
 say('REPLY ('+r.label+', '+r.device+'): first text after',firstAt,'ms, whole reply',r.ms,'ms,',JSON.stringify(r.usage),'timings',JSON.stringify(r.timings&&{prompt_n:r.timings.prompt_n,prompt_per_second:r.timings.prompt_per_second,predicted_n:r.timings.predicted_n,predicted_per_second:r.timings.predicted_per_second}));
 say('TEXT:',JSON.stringify(r.text));if(/<think>/i.test(r.text))throw Error('thinking was not turned off');
 const pid=svc.server.proc.pid;await svc.shutdown();
 let gone=false;try{process.kill(pid,0);}catch{gone=true;}say('engine closed:',gone?'yes (process '+pid+' is gone)':'NO, process '+pid+' still runs');if(!gone)throw Error('the engine is still running');
 say('LOCAL AI SMOKE TEST PASSED');process.exit(0);
})().catch(async e=>{say('FAILED:',e.stack||e.message);try{say('engine tail:',JSON.stringify(svc.server?.tail?.slice(-20)||[]));}catch{}try{svc.killNow();}catch{}process.exit(1);});

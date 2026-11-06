// REAL test of images on this PC (v2.40), run by .github/workflows/local-images-windows.yml on GitHub's
// Windows runner (no graphics card), and usable on Linux for development (it then installs the Linux
// build). It uses the app's own service and installer (app/local-images/service.cjs):
//   1. shows this PC, the suggestion and the plan, then installs the engine (stable-diffusion.cpp
//      master-1017) and a model (MODEL, default zimage-8gb) from their real sources, checked against
//      app/local-images/lock.json;
//   2. on Windows, asks Vulkan for graphics cards the way the app does (the runner has none);
//   3. checks that Tyler's image rules refuse a forbidden prompt before the engine starts;
//   4. makes an image on the processor (SIZE × SIZE, STEPS steps), with times for each step, checks the
//      engine process listens on no network port, that the PNG is the right size, and that the process
//      is gone afterwards (its memory given back);
//   5. starts another image and stops it after the first step: the process must end.
// The images are written to <data folder>/smoke-out so they can be looked at.
// Usage: node tools/local-images/windows-smoke.cjs <data folder>
//   env: MODEL (zimage-8gb; dev-sd15 = the small development model), SIZE (256), STEPS (model default
//        is used when empty), SIZE2 (a second, bigger image, e.g. 512; empty = none), DEVICE=cpu|gpu,
//        OFFLINE=<folder with files already downloaded, checked like downloads>
'use strict';
const path=require('node:path'),os=require('node:os'),fs=require('node:fs'),{execFileSync}=require('node:child_process');
const APP=path.join(__dirname,'..','..','app','local-images');
const {LocalImages}=require(path.join(APP,'service.cjs')),hardware=require(path.join(APP,'hardware.cjs')),engine=require(path.join(APP,'engine.cjs'));
const dir=process.argv[2]||path.join(os.tmpdir(),'TylerLocalImages'),out=path.join(dir,'smoke-out');
const MODEL=process.env.MODEL||'zimage-8gb',SIZE=Number(process.env.SIZE||256),STEPS=process.env.STEPS?Number(process.env.STEPS):null,SIZE2=process.env.SIZE2?Number(process.env.SIZE2):null,DEVICE=process.env.DEVICE==='gpu'?'gpu':'cpu';
const PROMPT=process.env.PROMPT||'a friendly chrome robot giving a thumbs up in a neon-lit gaming room, digital art';
let saved={model:MODEL,device:DEVICE};
const t0=Date.now(),at=()=>((Date.now()-t0)/1000).toFixed(1).padStart(7)+' s ';
const say=(...a)=>console.log(at()+a.join(' '));
const limit=(p,s,what)=>Promise.race([p,new Promise((_,j)=>setTimeout(()=>j(Error(what+': no answer after '+s+' s')),s*1000))]);
const svc=new LocalImages({dataDir:dir,fetch:globalThis.fetch,dev:MODEL.startsWith('dev-'),getSettings:async()=>saved,setSettings:async v=>{saved=v;},log:(...a)=>say('[log]',...a.map(String)),limits:{cpuMs:150*60000}});
const gone=pid=>{try{process.kill(pid,0);return false;}catch{return true;}};
/** Listening sockets owned by `pid` (Linux: /proc; Windows: netstat). */
function listening(pid){
 if(process.platform==='linux'){
  const inodes=new Set();try{for(const fd of fs.readdirSync('/proc/'+pid+'/fd')){const l=fs.readlinkSync('/proc/'+pid+'/fd/'+fd);const m=/^socket:\[(\d+)\]$/.exec(l);if(m)inodes.add(m[1]);}}catch{}
  const rows=['/proc/net/tcp','/proc/net/tcp6','/proc/net/udp','/proc/net/udp6'].filter(f=>fs.existsSync(f)).flatMap(f=>fs.readFileSync(f,'utf8').split('\n').slice(1));
  return rows.map(r=>r.trim().split(/\s+/)).filter(c=>c.length>9&&inodes.has(c[9])).map(c=>c[1]);
 }
 if(process.platform==='win32'){const o=execFileSync('netstat',['-ano'],{encoding:'utf8',windowsHide:true});return o.split(/\r?\n/).filter(l=>new RegExp('\\s'+pid+'\\s*$').test(l)&&/LISTENING|UDP/.test(l)).map(l=>l.trim());}
 return [];
}
async function image(size,steps,name){
 let lastShown=0,sockets=null,pid=null;
 const r=await limit(svc.generate({prompt:PROMPT,width:size,height:size,steps:steps??undefined,seed:42,onProgress:e=>{
  if(!pid&&svc.job?.pid){pid=svc.job.pid;}
  if(pid&&sockets===null&&e.phase!=='load'){sockets=listening(pid);}
  const now=Date.now();if(e.step||now-lastShown>20000||e.label){lastShown=now;say('['+e.phase+']',e.label||'',e.step?'step '+e.step+'/'+e.steps+(e.secondsPerStep?' ('+e.secondsPerStep.toFixed(2)+' s a step)':''):'');}
 }}),9000,name);
 fs.writeFileSync(path.join(out,name+'.png'),r.png);
 say('IMAGE '+name+': '+r.width+' × '+r.height+', '+r.steps+' steps, seed '+r.seed+', '+r.label+' on '+r.device+', '+r.bytes+' bytes');
 say('  times: '+JSON.stringify(r.timings)+'  memory: '+JSON.stringify(r.memory));
 const sz=engine.pngSize(r.png);if(!sz||sz.width!==size||sz.height!==size)throw Error('the PNG is not '+size+' × '+size);
 if(pid){say('  engine process',pid,'listening sockets while it ran:',sockets&&sockets.length?sockets.join(', '):'none');if(sockets&&sockets.length)throw Error('the image engine listened on the network');
  await new Promise(r=>setTimeout(r,300));say('  engine process',pid,'after the image:',gone(pid)?'gone (its memory is back)':'STILL RUNNING');if(!gone(pid))throw Error('the engine is still running after the image');}
 return r;
}
(async()=>{
 fs.mkdirSync(out,{recursive:true});
 say(process.platform,os.release(),'node',process.version,'cpus',os.cpus().length,'('+(os.cpus()[0]?.model||'?').trim()+')','ram',(os.totalmem()/2**30).toFixed(1),'GB, free',(os.freemem()/2**30).toFixed(1),'GB; model',MODEL,'device',DEVICE,'size',SIZE,'into',dir);
 const hw=await svc.hardware(true);say('this PC:',JSON.stringify({gpus:hw.gpus,ram:hw.ram,disk:hw.disk}));say('suggestion:',JSON.stringify(hardware.suggest(hw,svc.lock)));
 const p=await svc.planFor({model:MODEL});
 say('plan: download',(p.download/2**30).toFixed(2),'GB, disk',(p.disk/2**30).toFixed(2),'GB, free',p.free!=null?(p.free/2**30).toFixed(1)+' GB':'?','; files',p.fileCount,'(engine '+p.runtime+' ready: '+p.runtimeReady+'; parts: '+p.parts.map(x=>x.id+(x.ready?' (have)':'')).join(', ')+')');
 let last=0;svc.on('install',e=>{const now=Date.now();if(now-last>15000||e.phase!=='download'){last=now;say('[install]',e.phase,e.label||'',e.bytes!=null&&e.totalBytes?((e.bytes/2**30).toFixed(2)+'/'+(e.totalBytes/2**30).toFixed(2)+' GB'):'');}});
 const ti=Date.now();await limit(svc.install({model:MODEL,device:DEVICE,offline:process.env.OFFLINE?[process.env.OFFLINE]:[]}),5400,'install');
 say('installed in',((Date.now()-ti)/1000).toFixed(0),'s:',JSON.stringify(svc.installer.status()),'engine says:',JSON.parse(fs.readFileSync(path.join(svc.installer.engineDir(),'ok'),'utf8')).version);
 if(process.platform==='win32'){const d=await svc.devices(true);say('Vulkan devices (GGML_BACKEND_PATH=gpu\\ggml-vulkan.dll):',JSON.stringify({ok:d?.ok,devices:d?.devices}),'| output:',JSON.stringify((d?.text||'').slice(-400)));}
 // Tyler's image rules: refused before anything runs.
 const before=Date.now();
 try{await svc.generate({prompt:'nude t33n',width:SIZE,height:SIZE});throw Error('a forbidden prompt was not refused');}
 catch(e){if(e.code!=='refused')throw e;say('RULES: refused in',Date.now()-before,'ms, no engine started:',JSON.stringify(e.message.slice(0,140)));}
 await image(SIZE,STEPS,'image-'+SIZE);
 if(SIZE2)await image(SIZE2,STEPS,'image-'+SIZE2);
 // Stop after the first step: the process must end.
 const ctl=new AbortController();let pid=null;const ts=Date.now();
 const stopped=await svc.generate({prompt:PROMPT,width:SIZE,height:SIZE,steps:STEPS??undefined,signal:ctl.signal,onProgress:e=>{pid=pid||svc.job?.pid;if(e.step>=1)ctl.abort();}}).then(()=>'finished',e=>e.code);
 await new Promise(r=>setTimeout(r,500));
 say('STOP: the image ended with',JSON.stringify(stopped),'after',Date.now()-ts,'ms; engine process',pid,gone(pid)?'is gone':'STILL RUNNING');
 if(stopped!=='cancelled'||!gone(pid))throw Error('Stop did not end the image');
 await svc.shutdown();
 say('LOCAL IMAGES SMOKE TEST PASSED');process.exit(0);
})().catch(e=>{say('FAILED:',e.stack||e.message);try{say('last error:',JSON.stringify(svc.lastError));}catch{}try{svc.killNow();}catch{}process.exit(1);});

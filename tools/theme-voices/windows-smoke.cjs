// REAL test of theme voices on Windows (GitHub's Windows runner, no graphics card), run by
// .github/workflows/theme-voices-windows.yml. It uses the app's own service and installer:
//   1. installs the engine (RT, default windows-cuda) and the Lightweight model from the real sources;
//   2. starts the voice worker and asks it "hello", printing every line the engine writes to stderr;
//   3. loads the model on the processor and makes the voice check's line, with times for each step.
// Every step has its own time limit, so a hang shows where it is instead of running until the job's limit.
const path=require('node:path'),fs=require('node:fs'),os=require('node:os');
process.env.TYLER_WORKER_TRACE=process.env.TYLER_WORKER_TRACE||'30'; // the engine prints where it is every 30 s
const APP=path.join(__dirname,'..','..','app','theme-voices');
const {ThemeVoices}=require(path.join(APP,'service.cjs'));
const dir=process.argv[2]||path.join(os.tmpdir(),'TylerThemeVoices');
const RT=process.env.RT||'windows-cuda',ENGINE=RT.endsWith('-fast')?'fast':'standard';
let saved={mode:'light',device:'cpu',engine:ENGINE,idleMinutes:0};
const t0=Date.now(),at=()=>((Date.now()-t0)/1000).toFixed(1).padStart(7)+' s ';
const say=(...a)=>console.log(at()+a.join(' '));
const svc=new ThemeVoices({dataDir:dir,appDir:APP,fetch:globalThis.fetch,getSettings:async()=>saved,setSettings:async v=>{saved=v;},theme:async()=>'cs16',log:(...a)=>say('[log]',...a.map(String))});
// Echo the engine's own stderr as it comes (the app keeps only the last lines).
const workerFor=svc.workerFor.bind(svc);
svc.workerFor=async()=>{const w=await workerFor();if(!w._echo&&w.proc){w._echo=true;w.proc.stderr.on('data',d=>{for(const l of String(d).split(/\r?\n/))if(l.trim())say('[engine]',l.slice(0,400));});}return w;};
const limit=(p,s,what)=>Promise.race([p,new Promise((_,j)=>setTimeout(()=>j(Error(what+': no answer after '+s+' s')),s*1000))]);
(async()=>{
 say('Windows',os.release(),'node',process.version,'cpus',os.cpus().length,'ram',(os.totalmem()/2**30).toFixed(1),'GB; runtime',RT,'into',dir);
 let last=0;
 const st=await limit(svc.installer.install(require(path.join(APP,'installer.cjs')).plan({runtime:RT,models:['light']}),{onProgress:e=>{const now=Date.now();if(now-last>15000||e.phase!=='download'){last=now;say('[install]',e.phase,e.label||'',e.bytes?((e.bytes/2**30).toFixed(2)+'/'+((e.totalBytes||0)/2**30).toFixed(2)+' GB'):'');}}}),2400,'install');
 say('installed',st.runtime,st.engine);
 const w=await limit(svc.workerFor(),120,'worker start');say('worker ready, pid',w.proc?.pid);
 const hello=await limit(w.request('hello',{},{timeout:240000}),250,'hello');say('hello',JSON.stringify(hello));
 const c=await limit(svc.check(),1500,'voice check');say('VOICE CHECK PASSED',JSON.stringify(c));
 await svc.shutdown();process.exit(0);
})().catch(async e=>{say('FAILED:',e.stack||e.message);try{say('stderr tail:',JSON.stringify(svc.worker?.stderrTail||[]));}catch{}try{svc.killNow();}catch{}process.exit(1);});

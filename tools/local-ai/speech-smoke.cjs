// REAL test of hearing and voice on this PC (v2.39), run by .github/workflows/local-speech-windows.yml
// on GitHub's Windows runner, and usable on Linux for development (it then installs the Linux build).
// It uses the app's own service and installer (app/local-ai/speech.cjs):
//   1. shows the plan, then installs the speech engine (sherpa-onnx 1.13.8), hearing (Parakeet TDT
//      0.6B v3) and the voice (Kokoro-82M) from their real sources, checked against app/local-ai/lock.json;
//   2. runs the quick checks from Settings: the built-in clip heard, the first audio of a sentence;
//   3. speaks a longer reply with Kokoro, hears that recording with Parakeet and compares the words
//      (a round trip, so the check needs nothing else), and hears any WAV files given after the folder;
//   4. checks the engine processes listen on no network port, closes them and checks they're gone.
// The spoken clips are written to <data folder>/smoke-out so they can be listened to.
// Usage: node tools/local-ai/speech-smoke.cjs <data folder> [more.wav …]
//   env: OFFLINE=<folder with files already downloaded, checked like downloads>, VOICE=am_michael
//   Under Electron (ELECTRON_RUN_AS_NODE=1 electron tools/local-ai/speech-smoke.cjs …) the engines are
//   started with Electron's own executable, exactly as in the desktop app.
'use strict';
const path=require('node:path'),os=require('node:os'),fs=require('node:fs'),{execFileSync}=require('node:child_process');
const {LocalSpeech,CHECK_TEXT}=require(path.join(__dirname,'..','..','app','local-ai','speech.cjs'));
const [dirArg,...extra]=process.argv.slice(2);
const dir=dirArg||path.join(os.tmpdir(),'TylerLocalSpeech'),out=path.join(dir,'smoke-out'),VOICE=process.env.VOICE||'am_michael';
let saved={idleMinutes:0};
const t0=Date.now(),at=()=>((Date.now()-t0)/1000).toFixed(1).padStart(7)+' s ';
const say=(...a)=>console.log(at()+a.join(' '));
const limit=(p,s,what)=>Promise.race([p,new Promise((_,j)=>setTimeout(()=>j(Error(what+': no answer after '+s+' s')),s*1000))]);
const words=t=>String(t||'').toLowerCase().replace(/[^a-z0-9' ]+/g,' ').split(/\s+/).filter(Boolean);
const overlap=(a,b)=>{const want=words(a),got=new Set(words(b));return Math.round(100*want.filter(w=>got.has(w)).length/Math.max(1,want.length));};
const svc=new LocalSpeech({dataDir:dir,fetch:globalThis.fetch,getSettings:async()=>saved,setSettings:async v=>{saved=v;},log:(...a)=>say('[log]',...a.map(String)),startTimeout:600000});
/** Listening TCP sockets owned by `pid` (Linux: /proc; Windows: netstat). */
function listening(pid){
 if(process.platform==='linux'){
  const inodes=new Set();try{for(const fd of fs.readdirSync('/proc/'+pid+'/fd')){const l=fs.readlinkSync('/proc/'+pid+'/fd/'+fd);const m=/^socket:\[(\d+)\]$/.exec(l);if(m)inodes.add(m[1]);}}catch{}
  const rows=['/proc/net/tcp','/proc/net/tcp6','/proc/net/udp','/proc/net/udp6'].filter(f=>fs.existsSync(f)).flatMap(f=>fs.readFileSync(f,'utf8').split('\n').slice(1));
  return rows.map(r=>r.trim().split(/\s+/)).filter(c=>c.length>9&&inodes.has(c[9])).map(c=>c[1]);
 }
 if(process.platform==='win32'){const o=execFileSync('netstat',['-ano'],{encoding:'utf8',windowsHide:true});return o.split(/\r?\n/).filter(l=>new RegExp('\\s'+pid+'\\s*$').test(l)&&/LISTENING|UDP/.test(l)).map(l=>l.trim());}
 return [];
}
const gone=pid=>{try{process.kill(pid,0);return false;}catch{return true;}};
(async()=>{
 fs.mkdirSync(out,{recursive:true});
 say(process.platform,os.release(),'node',process.version,process.versions.electron?'electron '+process.versions.electron+' (as Node)':'','cpus',os.cpus().length,'('+(os.cpus()[0]?.model||'?').trim()+')','ram',(os.totalmem()/2**30).toFixed(1),'GB, free',(os.freemem()/2**30).toFixed(1),'GB; threads per engine',svc.threads,'; into',dir);
 const p=await svc.planFor({parts:['hearing','voice']});
 say('plan: download',(p.download/2**20).toFixed(0),'MB (engine',(p.runtimeBytes/2**20).toFixed(1),'MB, hearing',(p.hearingBytes/2**20).toFixed(0),'MB, voice',(p.voiceBytes/2**20).toFixed(0),'MB), disk',(p.disk/2**20).toFixed(0),'MB, files',p.fileCount,', free',p.free!=null?(p.free/2**30).toFixed(1)+' GB':'?');
 let last=0;svc.on('install',e=>{const now=Date.now();if(now-last>10000||e.phase!=='download'){last=now;say('[install]',e.phase,e.label||'',e.bytes!=null&&e.totalBytes?((e.bytes/2**20).toFixed(0)+'/'+(e.totalBytes/2**20).toFixed(0)+' MB'):'');}});
 const ti=Date.now();await limit(svc.install({parts:['hearing','voice'],offline:process.env.OFFLINE?[process.env.OFFLINE]:[]}),3000,'install');
 say('installed in',((Date.now()-ti)/1000).toFixed(0),'s:',JSON.stringify(svc.installer.status()));
 // Settings' quick checks (the engines start here: their load time is part of the first check).
 const h=await limit(svc.check('hearing'),600,'hearing check');
 say('HEARING CHECK: loaded in',h.startMs,'ms; heard',h.seconds,'s of audio in',h.ms,'ms (whole request',h.totalMs,'ms):',JSON.stringify(h.text),'- words matched',h.words+'%');
 if(h.words<80)throw Error('the built-in clip was not heard right: '+h.text);
 const v=await limit(svc.check('voice',{voice:VOICE}),600,'voice check');
 fs.writeFileSync(path.join(out,'check-'+VOICE+'.wav'),Buffer.from(v.audio,'base64'));
 say('VOICE CHECK ('+v.voice+'): loaded in',v.startMs,'ms; first audio after',v.firstMs,'ms; whole sentence',v.ms,'ms for',v.seconds,'s of audio');
 // Warm timings (engines loaded), a longer reply, and the round trip.
 const reply='Sniper, obviously. Tanks are slow, loud and easy to flank, and nobody dodges a clean headshot from across the map.';
 const s1=await limit(svc.speak({text:'Nice shot.',voice:VOICE}),120,'short line');say('warm short line: first audio',s1.firstMs,'ms, done',s1.ms,'ms,',s1.seconds,'s');
 const s2=await limit(svc.speak({text:reply,voice:VOICE}),300,'reply');fs.writeFileSync(path.join(out,'reply-'+VOICE+'.wav'),Buffer.from(s2.audio,'base64'));
 say('warm reply ('+reply.length+' characters): first audio',s2.firstMs,'ms, done',s2.ms,'ms,',s2.seconds,'s of audio (real-time factor',(s2.ms/1000/s2.seconds).toFixed(2)+')');
 const r=await limit(svc.hear({audio:s2.audio}),120,'round trip');
 say('ROUND TRIP: Kokoro said it, Parakeet heard',r.seconds,'s in',r.ms,'ms:',JSON.stringify(r.text),'- words matched',overlap(reply,r.text)+'%');
 if(overlap(reply,r.text)<80)throw Error('the round trip lost too many words');
 for(const f of extra){const a=fs.readFileSync(f).toString('base64');const x=await limit(svc.hear({audio:a}),120,'hear '+f);say('heard',path.basename(f),x.seconds,'s in',x.ms,'ms:',JSON.stringify(x.text));}
 for(const name of ['bm_george','af_heart']){const x=await limit(svc.speak({text:'Good game everyone, that was a close one.',voice:name}),300,name);fs.writeFileSync(path.join(out,'gg-'+name+'.wav'),Buffer.from(x.audio,'base64'));say('voice',name+':',x.startMs?'restarted for its accent in '+x.startMs+' ms, ':'','first audio',x.firstMs,'ms,',x.seconds,'s');}
 // No network port, then closed and gone.
 const pids=['hearing','voice'].map(k=>svc.workers[k]?.pid).filter(Boolean);
 for(const pid of pids){const l=listening(pid);say('engine process',pid,'sockets listening:',l.length?l.join(', '):'none');if(l.length)throw Error('an engine process listens on the network');}
 await svc.shutdown();await new Promise(r=>setTimeout(r,500));
 for(const pid of pids){say('engine process',pid,'closed:',gone(pid)?'yes':'NO');if(!gone(pid))throw Error('an engine is still running');}
 say('expected words for the built-in clip:',JSON.stringify(CHECK_TEXT));
 say('LOCAL SPEECH SMOKE TEST PASSED');process.exit(0);
})().catch(e=>{say('FAILED:',e.stack||e.message);try{for(const k of ['hearing','voice'])say(k,'engine tail:',JSON.stringify(svc.workers[k]?.tail?.slice(-15)||[]));}catch{}try{svc.killNow();}catch{}process.exit(1);});

// REAL test of theme voices on Windows (GitHub's Windows runner, no graphics card), run by
// .github/workflows/theme-voices-windows.yml. It uses the app's own service and installer:
//   1. installs the engine (RT, default windows-cuda) and the Lightweight model from the real sources;
//   2. starts the voice worker and asks it "hello", printing every line the engine writes to stderr;
//   3. loads the model on the processor and makes the voice check's line, with times for each step;
//   4. (CHARACTERS=1) character voices with the recordings built into the app (v2.43), no import: the app's
//      own clips (app/theme-voices/characters) are copied to a path like an installed app's, with spaces and an
//      accent (…\ROBOTIC TYLER é\resources\app.asar.unpacked\…), and the real worker speaks from them: Coach
//      (improved, version 2, joined from 6 clips) and Scout (version 1, for one message, like !say tf2/scout).
//      A damaged version-2 clip makes Coach speak his version 1 and say why; a damaged Scout clip falls back
//      to the theme's voice with the reason; importing a pack folder made from the app's clips (spaces and an
//      accent too) copies only the two damaged clips, and Coach speaks version 2 again (from the cache: the
//      key is the clips' content).
// Every step has its own time limit, so a hang shows where it is instead of running until the job's limit.
const path=require('node:path'),fs=require('node:fs'),os=require('node:os');
process.env.TYLER_WORKER_TRACE=process.env.TYLER_WORKER_TRACE||'30'; // the engine prints where it is every 30 s
const APP=path.join(__dirname,'..','..','app','theme-voices');
const {ThemeVoices}=require(path.join(APP,'service.cjs')),{versionsOf}=require(path.join(APP,'characters.cjs'));
const dir=process.argv[2]||path.join(os.tmpdir(),'TylerThemeVoices');
const RT=process.env.RT||'windows-cuda',ENGINE=RT.endsWith('-fast')?'fast':'standard';
let saved={mode:'light',device:'cpu',engine:ENGINE,idleMinutes:0};
const t0=Date.now(),at=()=>((Date.now()-t0)/1000).toFixed(1).padStart(7)+' s ';
const say=(...a)=>console.log(at()+a.join(' '));
// v2.43: the character clips where an installed app has them (a copy, so the check can damage them).
const BUNDLE=process.env.CHARACTERS==='1'?path.join(dir,'..','ROBOTIC TYLER é','resources','app.asar.unpacked','app','theme-voices','characters'):undefined;
if(BUNDLE){fs.rmSync(BUNDLE,{recursive:true,force:true});fs.cpSync(path.join(APP,'characters'),BUNDLE,{recursive:true});}
const svc=new ThemeVoices({dataDir:dir,appDir:APP,fetch:globalThis.fetch,getSettings:async()=>saved,setSettings:async v=>{saved=v;},theme:async()=>'cs16',log:(...a)=>say('[log]',...a.map(String)),...(BUNDLE?{bundledDir:BUNDLE}:{})});
// Echo the engine's own stderr as it comes (the app keeps only the last lines).
const workerFor=svc.workerFor.bind(svc);
svc.workerFor=async()=>{const w=await workerFor();if(!w._echo&&w.proc){w._echo=true;w.proc.stderr.on('data',d=>{for(const l of String(d).split(/\r?\n/))if(l.trim())say('[engine]',l.slice(0,400));});}return w;};
async function characters(){
 const ch=svc.voices.characters,st=ch.status(),line='Character voice check on Windows.';
 say('[characters] built in',JSON.stringify(st));
 if(st.builtIn!==30||st.offered!==29||st.damaged||st.extra.clips)throw Error('expected 30 built-in character voices, 29 offered, none damaged, nothing imported');
 await svc.saveSettings({characters:{l4d:'coach'}});
 const a=await limit(svc.speak({text:line,theme:'l4d'}),1500,'coach speak');say('[characters] coach',JSON.stringify({character:a.character,version:a.characterVersion,note:a.versionNote,voice:a.voiceName,seconds:a.seconds,ms:a.ms,fallback:a.fallback}));
 if(a.character!=='coach'||a.characterVersion!==2||a.versionNote||!(a.seconds>0.5))throw Error('Coach should speak his version 2 from the built-in clips');
 if(!(await svc.voiceFor('l4d','coach')).refPath.every(f=>f.startsWith(BUNDLE)))throw Error('Coach\'s clips should be the built-in ones');
 const b=await limit(svc.speak({text:line,theme:'tf2',character:'scout'}),1500,'scout speak');say('[characters] scout',JSON.stringify({character:b.character,version:b.characterVersion,seconds:b.seconds,ms:b.ms,fallback:b.fallback}));
 if(b.character!=='scout'||b.characterVersion!==1||!(b.seconds>0.5))throw Error('Scout should speak (version 1) from the built-in clips');
 // A damaged clip that only version 2 uses: version 1 speaks and says why.
 const coach=ch.entry('l4d','coach'),[c1,c2]=versionsOf(coach),only2=c2.clips.find(x=>!c1.clips.some(y=>y.sha256===x.sha256)),f2=ch.builtinFile(coach,only2),orig2=fs.readFileSync(f2);fs.appendFileSync(f2,'x');
 const c=await limit(svc.speak({text:line,theme:'l4d'}),1500,'coach v1 speak');say('[characters] coach, damaged v2 clip',JSON.stringify({character:c.character,version:c.characterVersion,note:c.versionNote,seconds:c.seconds,ms:c.ms}));
 if(c.character!=='coach'||c.characterVersion!==1||!/can’t be used \(one of its built-in recordings is damaged/.test(c.versionNote||''))throw Error('a damaged version-2 clip: version 1 should speak and say why');
 // A damaged Scout clip: the theme's own voice speaks, with the reason.
 const scout=ch.entry('tf2','scout'),sx=scout.versions[0].clips[0],sf=ch.builtinFile(scout,sx),origS=fs.readFileSync(sf);fs.appendFileSync(sf,'x');
 const d=await limit(svc.speak({text:'Who speaks now?',theme:'tf2',character:'scout'}),1500,'fallback speak');say('[characters] scout, damaged clip',JSON.stringify({character:d.character,voice:d.voiceName,fallback:d.fallback}));
 if(d.character||!d.fallback||!/built-in recordings is damaged/.test(d.fallback.reason))throw Error('no visible fallback');
 // Import repairs them: a pack folder made from the app's clips (a path with spaces and an accent); only the two damaged ones are copied.
 const pack=path.join(dir,'..','Character pack (smoke) é');fs.rmSync(pack,{recursive:true,force:true});
 for(const [x,bytes] of [[only2,orig2],[sx,origS]]){const dst=path.join(pack,...x.file.split('/'));fs.mkdirSync(path.dirname(dst),{recursive:true});fs.writeFileSync(dst,bytes);}
 const r=await ch.import(pack);say('[characters] repair import',JSON.stringify({added:r.added,already:r.already,failed:r.failed}));
 if(r.added!==2||r.failed.length)throw Error('the import should copy just the two damaged clips');
 const e=await limit(svc.speak({text:line,theme:'l4d'}),120,'coach again');say('[characters] coach after the import',JSON.stringify({version:e.characterVersion,note:e.versionNote,cached:e.cached}));
 if(e.characterVersion!==2||e.versionNote||!e.cached)throw Error('after the repair, Coach should speak version 2 again (from the cache)');
 if(!(await svc.voiceFor('tf2','scout')).character)throw Error('after the repair, Scout should be usable again');
 say('CHARACTER CHECK PASSED');
}
const limit=(p,s,what)=>Promise.race([p,new Promise((_,j)=>setTimeout(()=>j(Error(what+': no answer after '+s+' s')),s*1000))]);
(async()=>{
 say('Windows',os.release(),'node',process.version,'cpus',os.cpus().length,'ram',(os.totalmem()/2**30).toFixed(1),'GB; runtime',RT,'into',dir);
 let last=0;
 const st=await limit(svc.installer.install(require(path.join(APP,'installer.cjs')).plan({runtime:RT,models:['light']}),{onProgress:e=>{const now=Date.now();if(now-last>15000||e.phase!=='download'){last=now;say('[install]',e.phase,e.label||'',e.bytes?((e.bytes/2**30).toFixed(2)+'/'+((e.totalBytes||0)/2**30).toFixed(2)+' GB'):'');}}}),2400,'install');
 say('installed',st.runtime,st.engine);
 const w=await limit(svc.workerFor(),120,'worker start');say('worker ready, pid',w.proc?.pid);
 const hello=await limit(w.request('hello',{},{timeout:240000}),250,'hello');say('hello',JSON.stringify(hello));
 const c=await limit(svc.check(),1500,'voice check');say('VOICE CHECK PASSED',JSON.stringify(c));
 if(process.env.CHARACTERS==='1')await characters();
 await svc.shutdown();process.exit(0);
})().catch(async e=>{say('FAILED:',e.stack||e.message);try{say('stderr tail:',JSON.stringify(svc.worker?.stderrTail||[]));}catch{}try{svc.killNow();}catch{}process.exit(1);});

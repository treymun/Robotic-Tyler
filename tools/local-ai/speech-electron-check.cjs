// REAL check of hearing and voice on this PC from a real Electron MAIN process (v2.39), the way the
// desktop app runs them: the app's service (app/local-ai/speech.cjs) starts each engine with
// Electron's own executable as Node (ELECTRON_RUN_AS_NODE). Run after speech-smoke.cjs has installed
// everything into the same folder:
//   electron tools/local-ai/speech-electron-check.cjs <data folder>      (Linux: add --no-sandbox, xvfb-run)
// Prints one JSON result and exits 0 when hearing heard the built-in clip and Kokoro spoke.
// Why: Electron's V8 refuses buffers that point outside its own memory, which plain Node allows; the
// first version of the voice failed there ("TTS settlement failed") and passed under plain Node.
'use strict';
const {app}=require('electron'),path=require('node:path'),fs=require('node:fs');
const dir=process.argv.find((a,i)=>i>1&&!a.startsWith('-')&&!a.endsWith('.cjs'));
app.whenReady().then(async()=>{
 const res={electron:process.versions.electron,node:process.versions.node,platform:process.platform,dir};
 let svc=null;
 try{
  if(!dir)throw Error('Usage: electron speech-electron-check.cjs <data folder>');
  const {LocalSpeech}=require(path.join(__dirname,'..','..','app','local-ai','speech.cjs'));let saved={idleMinutes:0};
  svc=new LocalSpeech({dataDir:dir,fetch:globalThis.fetch,getSettings:async()=>saved,setSettings:async v=>{saved=v;},log:(...a)=>console.log('[log]',...a.map(String))});
  const h=await svc.check('hearing');res.hearing={ok:h.words>=80,text:h.text,words:h.words,ms:h.ms,startMs:h.startMs};
  const v=await svc.check('voice',{voice:'am_michael'});res.voice={ok:typeof v.audio==='string'&&v.seconds>1,firstMs:v.firstMs,ms:v.ms,seconds:v.seconds,startMs:v.startMs};
  const out=path.join(dir,'smoke-out');fs.mkdirSync(out,{recursive:true});fs.writeFileSync(path.join(out,'electron-check.wav'),Buffer.from(v.audio,'base64'));
  const warm=await svc.speak({text:'Nice shot. That one counted.',voice:'am_michael'});res.warm={firstMs:warm.firstMs,ms:warm.ms,seconds:warm.seconds};
  const back=await svc.hear({audio:warm.audio});res.roundTrip={text:back.text,ms:back.ms};
  res.ok=res.hearing.ok&&res.voice.ok;
 }catch(e){res.ok=false;res.error=String(e.stack||e.message);}
 try{await svc?.shutdown();}catch{}
 console.log('ELECTRON CHECK '+JSON.stringify(res,null,1));
 app.exit(res.ok?0:1);
});

'use strict';
// ROBOTIC TYLER theme voices: the 25 theme voices and the owner's replacements (v2.35).
//
// Built-in voices ship with the app (app/theme-voices/voices/<theme>/: profile.json, a short reviewed
// reference recording and its transcript). A replacement the owner records or picks is kept in the
// ThemeVoices folder (custom-voices/<theme>/) and is never overwritten by an update. Only audio files
// are accepted as references; nothing a user supplies is ever loaded as code or as a model.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const THEMES=['steam','classic','tf2','cs2','portal','cs16','hev','l4d','winxp','doom','quake','pipboy','combine','deadlock','minecraft','payday','dreamcast','gmod','ricochet','dod','rust','x360','ipod','msn','xmb'];
const BACKEND='qwen3-tts-12hz-base';
const AUDIO=/\.(wav|flac|mp3|ogg)$/i;
// Readiness, in the words the panel and settings use.
const STATUS={
 ready:'Ready: clones its reference voice',
 weak:'Weak clone: usable, clearly less like the original',
 approximation:'Approximation: see the note',
 insufficient:'Not enough original speech for a real clone',
 missing:'No usable recordings yet',
 custom:'Your own reference'};

class Voices{
 constructor({builtinDir,dataDir}){this.builtinDir=builtinDir;this.customDir=path.join(dataDir,'custom-voices');}
 builtin(theme){
  const dir=path.join(this.builtinDir,theme);let p=null;try{p=JSON.parse(fs.readFileSync(path.join(dir,'profile.json'),'utf8'));}catch{}
  if(!p)return {theme,name:theme,status:'missing',statusNote:'This voice hasn’t been prepared.',builtin:true};
  const ref=p.reference?path.join(dir,p.reference):null;
  return {...p,theme,builtin:true,refPath:ref&&fs.existsSync(ref)?ref:null};
 }
 custom(theme){
  const dir=path.join(this.customDir,theme);let meta=null;try{meta=JSON.parse(fs.readFileSync(path.join(dir,'voice.json'),'utf8'));}catch{return null;}
  const ref=meta?.reference?path.join(dir,meta.reference):null;if(!ref||!fs.existsSync(ref))return null;
  return {...meta,theme,custom:true,refPath:ref,status:'custom'};
 }
 /** The voice used for a theme: the owner's replacement if there is one, otherwise the built-in. */
 get(theme){if(!THEMES.includes(theme))return null;const b=this.builtin(theme),c=this.custom(theme);return c?{...b,...c,name:c.name||b.name,builtinStatus:b.status,effects:c.effects===undefined?b.effects:c.effects}:b;}
 list(){return THEMES.map(t=>{const v=this.get(t);return {theme:t,name:v.name,target:v.voiceTarget||null,relationship:v.relationship||null,status:v.status,statusLabel:STATUS[v.status]||v.status,statusNote:v.statusNote||'',custom:!!v.custom,hasReference:!!v.refPath,effects:!!v.effects,sample:v.sample?.phrase||null};});}
 /** A fingerprint of everything that shapes the voice (for the cache and the stored conditioning). */
 key(v){if(!v?.refPath)return null;const st=fs.statSync(v.refPath);return crypto.createHash('sha256').update(JSON.stringify([BACKEND,v.theme,v.refPath,st.size,st.mtimeMs,v.transcript||'',v.xvectorOnly||false,v.effects||null,v.profileVersion||1])).digest('hex').slice(0,16);}
 /** Saves an owner's reference recording for a theme (audio only, 20 MB at most). */
 setCustom(theme,{data,fileName,transcript,name}){
  if(!THEMES.includes(theme))throw Error('Unknown theme.');
  const ext=(AUDIO.exec(String(fileName||''))||[])[1];if(!ext)throw Error('Use a WAV, FLAC, MP3 or OGG recording.');
  const bytes=Buffer.from(String(data||''),'base64');if(bytes.length<4000)throw Error('That recording is too short.');if(bytes.length>20*1024*1024)throw Error('That recording is over 20 MB. Use 5–20 seconds of clear speech.');
  const magic=bytes.subarray(0,4).toString('latin1');if(!(/^(RIFF|fLaC|OggS|ID3)/.test(magic)||bytes[0]===0xff))throw Error('That file isn’t an audio recording.');
  const dir=path.join(this.customDir,theme);fs.rmSync(dir,{recursive:true,force:true});fs.mkdirSync(dir,{recursive:true});
  fs.writeFileSync(path.join(dir,'reference.'+ext.toLowerCase()),bytes);
  const text=String(transcript||'').replace(/\s+/g,' ').trim().slice(0,600);
  fs.writeFileSync(path.join(dir,'voice.json'),JSON.stringify({format:1,backend:BACKEND,name:String(name||'').slice(0,60)||undefined,reference:'reference.'+ext.toLowerCase(),transcript:text,xvectorOnly:!text,savedAt:Date.now()},null,1));
  return this.get(theme);
 }
 removeCustom(theme){if(!THEMES.includes(theme))return;fs.rmSync(path.join(this.customDir,theme),{recursive:true,force:true});}
}
module.exports={Voices,THEMES,STATUS,BACKEND};

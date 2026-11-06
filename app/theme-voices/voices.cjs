'use strict';
// ROBOTIC TYLER theme voices: the 25 theme voices and the owner's replacements (v2.35); optional
// character voices per theme and versioned built-in voices (v2.41).
//
// Built-in voices ship with the app (app/theme-voices/voices/<theme>/: profile.json, a short reviewed
// reference recording and its transcript). A replacement the owner records or picks is kept in the
// ThemeVoices folder (custom-voices/<theme>/) and is never overwritten by an update. Only audio files
// are accepted as references; nothing a user supplies is ever loaded as code or as a model.
//
// v2.41: a theme can also speak as one of its optional characters (characters.cjs: TF2's classes,
// Deadlock's heroes…), when the owner has imported them and picked one. The theme's own voice stays the
// default, and a pick that can't be used (missing, changed or not approved) falls back to it with the
// reason attached (voice.fallback), never silently. A built-in voice that was improved keeps its earlier
// version (voices/<theme>/v1/) so it can be used again (settings: builtinVersion).
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {Characters,ID:CHARACTER_ID,fileHash}=require('./characters.cjs');
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
 constructor({builtinDir,dataDir,catalogFile=path.join(builtinDir,'..','characters.json')}){this.builtinDir=builtinDir;this.customDir=path.join(dataDir,'custom-voices');this.characters=new Characters({dataDir,catalogFile,themes:THEMES});}
 /** The built-in voice; `version` picks an earlier version of an improved voice (its baseline), if it has one. */
 builtin(theme,version){
  const dir=path.join(this.builtinDir,theme);let p=null;try{p=JSON.parse(fs.readFileSync(path.join(dir,'profile.json'),'utf8'));}catch{}
  if(!p)return {theme,name:theme,status:'missing',statusNote:'This voice hasn’t been prepared.',builtin:true};
  const versions=[p.profileVersion||1,...(p.history||[]).map(h=>h.profileVersion)];
  const old=version&&version!==(p.profileVersion||1)?(p.history||[]).find(h=>h.profileVersion===version&&/^v\d+\/profile\.json$/.test(String(h.profile||''))):null;
  if(old){let q=null;try{q=JSON.parse(fs.readFileSync(path.join(dir,old.profile),'utf8'));}catch{}
   if(q){const vdir=path.join(dir,path.dirname(old.profile)),ref=q.reference?path.join(vdir,q.reference):null;
    return {...q,theme,builtin:true,versions,currentVersion:p.profileVersion||1,profileVersion:q.profileVersion||version,sample:p.sample,refPath:ref&&fs.existsSync(ref)?ref:null};}}
  const ref=p.reference?path.join(dir,p.reference):null;
  return {...p,theme,builtin:true,versions,currentVersion:p.profileVersion||1,refPath:ref&&fs.existsSync(ref)?ref:null};
 }
 custom(theme){
  const dir=path.join(this.customDir,theme);let meta=null;try{meta=JSON.parse(fs.readFileSync(path.join(dir,'voice.json'),'utf8'));}catch{return null;}
  const ref=meta?.reference?path.join(dir,meta.reference):null;if(!ref||!fs.existsSync(ref))return null;
  return {...meta,theme,custom:true,refPath:ref,status:'custom'};
 }
 /** The voice used for a theme: the owner's replacement if there is one, otherwise the built-in. */
 get(theme,{version}={}){if(!THEMES.includes(theme))return null;const b=this.builtin(theme,version),c=this.custom(theme);return c?{...b,...c,name:c.name||b.name,builtinStatus:b.status,effects:c.effects===undefined?b.effects:c.effects}:b;}
 /**
  * The voice for theme + character (v2.41). No character: the theme's own voice. A character that can't
  * be used right now: the theme's own voice, with `fallback` saying which character and why.
  */
 voiceFor(theme,character,{version,characterVersion}={}){
  const base=this.get(theme,{version});if(!base||!character)return base;
  if(!CHARACTER_ID.test(String(character)))return {...base,fallback:{character:String(character).slice(0,24),name:String(character).slice(0,24),code:'unknown',reason:'it isn’t one of this version’s character voices'}};
  // v2.42: a character can have versions; characterVersion pins one (the owner's rollback), else its current one.
  const r=this.characters.resolve(theme,character,{pin:characterVersion});
  return r.voice||{...base,fallback:{character,...r.problem}};
 }
 list({characters={},characterVersion={}}={}){return THEMES.map(t=>{const v=this.get(t),cs=this.characters.summary(t,{pins:characterVersion}),pick=cs.find(c=>c.id===characters[t])||null;
  return {theme:t,name:v.name,target:v.voiceTarget||null,relationship:v.relationship||null,status:v.status,statusLabel:STATUS[v.status]||v.status,statusNote:v.statusNote||'',custom:!!v.custom,hasReference:!!v.refPath,effects:!!v.effects,sample:v.sample?.phrase||null,
   version:v.currentVersion||v.profileVersion||1,versions:v.versions||[1],
   ...(cs.length?{characters:cs,character:pick?pick.id:'',characterName:pick?pick.name:null,characterProblem:pick&&!pick.usable?pick.problem:characters[t]&&!pick?'That character isn’t available in this version.':null}:{})};});}
 /** A fingerprint of everything that shapes the voice (for the cache and the stored conditioning):
  *  the backend, theme, character, the reference's content (SHA-256), transcript, mode, effects, level and version. */
 key(v){if(!v?.refPath)return null;const refs=[].concat(v.refPath);return crypto.createHash('sha256').update(JSON.stringify([BACKEND,v.theme,v.character||'',refs.map(fileHash),v.transcript||'',v.xvectorOnly||false,v.effects||null,v.volume||0,v.profileVersion||1])).digest('hex').slice(0,16);}
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
module.exports={Voices,THEMES,STATUS,BACKEND,CHARACTER_ID};

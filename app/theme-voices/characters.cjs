'use strict';
// ROBOTIC TYLER theme voices: optional character voices (v2.41; versions and the voice supplement v2.42;
// built in since v2.43).
//
// The catalog (characters.json) gives each character's stable "theme/character" ID, name, and one or more
// versions. A version lists the original clips chosen as its reference (pack path, size, SHA-256, exact
// text, and which pack it comes from), the clip played as its "original recording", and its readiness.
//
// v2.43: the recordings are built in. Every clip the catalog uses (both packs' clips, previews included,
// about 15 MB) ships with the desktop app in app/theme-voices/characters/<theme>/<character>/<sha>.flac,
// unpacked from app.asar (electron-builder's asarUnpack) like the 25 theme voices' references, so the
// Python voice worker reads them where they are. A pack marked "builtIn" in the catalog ships its clips.
// Each built-in clip is checked (exact size and SHA-256) before it is used, so a damaged install can't
// speak with the wrong audio: the character falls back, visibly, to its earlier version or to the theme's
// own voice, with the reason.
//
// Importing stays, as a second way to add or repair recordings: the character voice pack
// (Robotic-Tyler-Character-Voice-Expansion) and the voice supplement (Robotic-Tyler-Complete-Voice-
// Supplement), each as its folder or its ZIP. Each clip is checked (a safe pack path, the exact size, a FLAC
// header and the SHA-256 in the catalog) and copied into ThemeVoices\characters\<theme>\<character>\<sha>.flac
// only if it isn't already here (built in or imported): a clip with the same SHA-256 is never copied
// again. Nothing else in a pack is read, and nothing is ever loaded as code or as a model. Copies a v2.41 or
// v2.42 import made of clips that are now built in are removed once the built-in clip checks out (nothing
// is kept twice); picks and version pins are settings and stay.
//
// A theme's own voice stays its default. A character the owner picks speaks in its current version when
// all of that version's clips are present, unchanged and approved. If the current version can't be used
// (a clip missing or damaged, or, without built-in clips, the voice supplement not imported), its earlier
// version speaks and says so (never silently); if no version can be used, the theme's own voice speaks
// with the reason. The owner can also pin a character to its earlier version (settings: characterVersion),
// like the built-in voices.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),zlib=require('node:zlib');
const {entries}=require('./zip.cjs');
const ID=/^[a-z0-9][a-z0-9-]{1,23}$/;
const CLIP_PATH=/^themes\/[a-z0-9]{2,12}\/[a-z0-9][a-z0-9-]{1,23}\/cleaned\/[A-Za-z0-9][A-Za-z0-9_.()-]{0,120}\.flac$/;
// Limits: one clip at most 4 MB; one import at most 64 MB of clips (both packs' listed clips are about 21 MB);
// a ZIP at most 2 GB; a folder may hold at most 4 pack ZIPs beside unpacked packs.
const MAX_CLIP=4*1024*1024,MAX_TOTAL=64*1024*1024,MAX_ZIP=2*1024**3,MAX_ZIPS=4;
const STORE_FORMAT=2;
const PACKS={expansion:'the character voice pack',supplement:'the voice supplement'};

function loadCatalog(file){try{const c=JSON.parse(fs.readFileSync(file,'utf8'));return c&&Array.isArray(c.characters)?c:{format:1,characters:[]};}catch{return {format:1,characters:[]};}}
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const hashMemo=new Map();
/** SHA-256 of a file, remembered while its size and time stay the same. */
function fileHash(file){
 const st=fs.statSync(file),k=file+'|'+st.size+'|'+st.mtimeMs,hit=hashMemo.get(k);if(hit)return hit;
 const h=sha(fs.readFileSync(file));if(hashMemo.size>600)hashMemo.clear();hashMemo.set(k,h);return h;
}
/** A catalog character's versions, oldest first. A v2.41 entry (no "versions") is its own version 1. */
function versionsOf(c){
 if(Array.isArray(c.versions)&&c.versions.length)return [...c.versions].sort((a,b)=>a.version-b.version);
 return [{version:c.profileVersion||1,status:c.status,approved:c.approved,approvalNote:c.approvalNote,statusNote:c.statusNote,transcript:c.transcript,xvectorOnly:c.xvectorOnly,transcriptSource:c.transcriptSource,effects:c.effects,volume:c.volume,clips:c.clips,preview:c.preview,evaluation:c.evaluation}];
}
/** Every clip a version needs (its reference clips, then its original-recording clip). */
const clipsOf=v=>[...(v.clips||[]),...(v.preview?[v.preview]:[])];
/** Every distinct clip a character needs across its versions (v2.44: and its voice-conversion matching set). */
function allClips(c){const seen=new Map();for(const x of [...versionsOf(c).flatMap(clipsOf),...(Array.isArray(c.matching)?c.matching:[])])if(!seen.has(x.sha256))seen.set(x.sha256,x);return [...seen.values()];}
/**
 * v2.44: the "sharper voice" (optional kNN-VC voice conversion) is offered only for a character whose catalog
 * entry has both a matching set (its own recordings, built in like its reference clips) and its settings.
 */
const sharperOf=c=>c&&c.sharper&&typeof c.sharper==='object'&&Array.isArray(c.matching)&&c.matching.length?c.sharper:null;
const currentOf=c=>{const vs=versionsOf(c);return vs.find(v=>v.version===c.current)||vs.at(-1);};
/** A catalog entry is usable only if its fields are what this code expects (a bad catalog never reaches the disk). */
function validEntry(c,themes){
 if(!c||!themes.includes(c.theme)||!ID.test(String(c.id||''))||!c.name)return false;
 const vs=versionsOf(c);if(!vs.length||vs.length>9||!vs.every(v=>Number.isInteger(v.version)&&v.version>0&&v.clips?.length&&clipsOf(v).length<=40))return false;
 if(new Set(vs.map(v=>v.version)).size!==vs.length)return false;
 // v2.44: a matching set (at most 80 clips) comes with its conversion settings, and k is a small whole number.
 if(c.matching!==undefined&&!(Array.isArray(c.matching)&&c.matching.length<=80&&c.sharper&&Number.isInteger(c.sharper.k)&&c.sharper.k>=1&&c.sharper.k<=16))return false;
 return allClips(c).every(x=>CLIP_PATH.test(String(x.file||''))&&x.file.split('/')[1]===c.theme&&x.file.split('/')[2]===c.id&&/^[0-9a-f]{64}$/.test(String(x.sha256||''))&&Number.isInteger(x.bytes)&&x.bytes>44&&x.bytes<=MAX_CLIP&&(!x.pack||Object.hasOwn(PACKS,x.pack)));
}
const NOT_IMPORTED='its recordings aren’t imported: use Import character voices in Settings → Theme voices';
const BUILTIN_REASON={missing:'one of its built-in recordings is missing: run the Setup again to repair the app',changed:'one of its built-in recordings is damaged: run the Setup again to repair the app'};

class Characters{
 /**
  * @param {object} o
  * @param {string} o.dataDir      …\ThemeVoices (the import store is its characters\ folder)
  * @param {string} o.catalogFile  characters.json
  * @param {string[]} o.themes
  * @param {string} [o.bundledDir] the app's own clips (app/theme-voices/characters, outside app.asar), v2.43
  */
 constructor({dataDir,catalogFile,themes,bundledDir=null}){
  this.dir=path.join(dataDir,'characters');this.themes=themes;this.bundled=bundledDir||null;
  this.catalog=loadCatalog(catalogFile);
  this.list=this.catalog.characters.filter(c=>validEntry(c,themes));
  // v2.43: the packs whose clips ship with the app (both, in this version's catalog).
  const packs=this.catalog.packs&&typeof this.catalog.packs==='object'?this.catalog.packs:{};
  this.builtinPacks=new Set(Object.keys(PACKS).filter(k=>packs[k]?.builtIn===true));
  this.tidied=new Set();
 }
 entry(theme,id){return this.list.find(c=>c.theme===theme&&c.id===id)||null;}
 forTheme(theme){return this.list.filter(c=>c.theme===theme);}
 themesWithCharacters(){return [...new Set(this.list.map(c=>c.theme))];}
 folder(theme,id){return path.join(this.dir,theme,id);}
 clipFile(c,x){return path.join(this.folder(c.theme,c.id),x.sha256+'.flac');}
 /** v2.43: does this clip ship with the app? (Its pack is marked builtIn and the app has a clips folder.) */
 isBuiltIn(x){return !!this.bundled&&this.builtinPacks.has(x.pack||'expansion');}
 builtinFile(c,x){return path.join(this.bundled,c.theme,c.id,x.sha256+'.flac');}
 /** Is a character's every clip built in? */
 builtIn(c){return allClips(c).every(x=>this.isBuiltIn(x));}
 /**
  * Where one clip is, checked: the app's own copy first, then an imported one. {state:'ok', file, builtIn}
  * or {state:'missing'|'changed', builtIn} (builtIn: the app should have had it, so its install is damaged).
  */
 locate(c,x){
  this.tidy(c);
  let b=null;
  if(this.isBuiltIn(x)){const f=this.builtinFile(c,x);b=fileState(f,x);if(b==='ok')return {state:'ok',file:f,builtIn:true};}
  const s=this.meta(c)?this.clipState(c,x):'missing';
  if(s==='ok')return {state:'ok',file:this.clipFile(c,x),builtIn:false}; // an import repaired (or added) it
  return {state:b==='changed'||s==='changed'?'changed':'missing',builtIn:b!==null};
 }
 /**
  * v2.43: an import from v2.41 or v2.42 holds copies of clips that are built in now. Once the built-in clip
  * checks out (size and SHA-256), the copy is removed (nothing is kept twice); a character folder left with
  * no clip goes too. Clips the app doesn't ship (or whose built-in copy is damaged) stay. Once per session.
  */
 tidy(c){
  const k=c.theme+'/'+c.id;if(this.tidied.has(k)||!this.bundled)return;this.tidied.add(k);
  const dir=this.folder(c.theme,c.id);if(!fs.existsSync(dir))return;
  if(!this.meta(c))return; // not a store folder this version understands: leave it alone
  let removed=0;
  for(const x of allClips(c))if(this.isBuiltIn(x)&&fileState(this.builtinFile(c,x),x)==='ok'){const f=this.clipFile(c,x);try{if(fs.lstatSync(f).isFile()){fs.rmSync(f,{force:true});removed++;}}catch{}}
  if(!removed)return;
  try{if(!fs.readdirSync(dir).some(n=>/\.flac$/i.test(n)))fs.rmSync(dir,{recursive:true,force:true});}catch{}
 }
 /** The store's record for a character (v2.41's layout, ref-01.flac…, is moved to the v2.42 one once). */
 meta(c){
  const dir=this.folder(c.theme,c.id);let meta=null;
  try{meta=JSON.parse(fs.readFileSync(path.join(dir,'character.json'),'utf8'));}catch{return null;}
  if(meta?.id!==c.theme+'/'+c.id)return null;
  if(meta.format===1){ // v2.41: files named by position in version 1
   const v1=versionsOf(c)[0];
   clipsOf(v1).forEach((x,i)=>{const old=path.join(dir,(i<v1.clips.length?'ref-':'preview-')+String(i+1).padStart(2,'0')+'.flac');
    try{if(fs.lstatSync(old).isFile()&&fileHash(old)===x.sha256)fs.renameSync(old,this.clipFile(c,x));}catch{}});
   meta={format:STORE_FORMAT,id:meta.id,name:meta.name,importedAt:meta.importedAt,migratedFrom:1};this.writeMeta(c,meta);
  }
  return meta.format===STORE_FORMAT?meta:null;
 }
 writeMeta(c,meta){const dir=this.folder(c.theme,c.id);fs.mkdirSync(dir,{recursive:true});const tmp=path.join(dir,'character.json.tmp');fs.writeFileSync(tmp,JSON.stringify(meta,null,1));fs.renameSync(tmp,path.join(dir,'character.json'));}
 /** Is one imported clip here and unchanged? 'ok', 'missing' or 'changed'. */
 clipState(c,x){return fileState(this.clipFile(c,x),x);}
 /**
  * Is one version's audio here and unchanged (built in, or imported)? {ok, files:{reference:[…], preview}}
  * or {ok:false, code, reason, builtIn} (builtIn: a recording the app ships is missing or damaged).
  */
 checkVersion(c,v){
  const ref=[];let preview=null;const missingPacks=new Set();let changed=false,builtinBad=null;
  for(const [i,x] of clipsOf(v).entries()){
   const r=this.locate(c,x);
   if(r.state==='ok'){if(i<v.clips.length)ref.push(r.file);else preview=r.file;continue;}
   if(r.builtIn){if(builtinBad!=='changed')builtinBad=r.state;continue;}
   if(r.state==='missing')missingPacks.add(x.pack||'expansion');else changed=true;
  }
  // A clip the app ships is missing or damaged: its files aren't what this version installed.
  if(builtinBad)return {ok:false,code:builtinBad,reason:BUILTIN_REASON[builtinBad],builtIn:true};
  if(!missingPacks.size&&!changed)return {ok:true,files:{reference:ref,preview}};
  // Clips the app doesn't ship (a catalog without built-in packs): they come from an import.
  if(!this.meta(c))return {ok:false,code:'not_imported',reason:NOT_IMPORTED};
  if(missingPacks.size){const p=[...missingPacks];
   if(p.length===1&&p[0]==='supplement'&&!changed)return {ok:false,code:'needs_supplement',reason:'it needs the voice supplement: import it in Settings → Theme voices'};
   if(!(p.length===1&&p[0]==='supplement'))return {ok:false,code:'missing',reason:'one of its recordings is missing: import '+p.map(k=>PACKS[k]).join(' and ')+' (again, if you already did)'};}
  return {ok:false,code:'changed',reason:'one of its recordings was changed or damaged: import the pack again'};
 }
 /** v2.41's single-version check (kept for callers that don't care about versions): the current version. */
 check(c){return this.checkVersion(c,currentOf(c));}
 /**
  * The voice to use for theme/character, or why it can't be used. `pin` is a version the owner chose
  * (rollback); otherwise the current version, or an earlier one when the current one can't be used: one
  * of its recordings is missing or damaged (v2.43), or it needs the voice supplement and that isn't
  * imported. The returned voice then says so in versionNote (never silently).
  */
 resolve(theme,id,{pin}={}){
  const c=this.entry(theme,id);
  if(!c)return {problem:{code:'unknown',name:id,reason:'it isn’t one of this version’s character voices'}};
  const vs=versionsOf(c),cur=currentOf(c),pinned=pin&&vs.find(v=>v.version===pin&&v.version!==cur.version)||null;
  const want=pinned||cur;let note=null;
  const usable=v=>v.approved===true&&this.checkVersion(c,v).ok;
  let use=null;
  if(want.approved!==true)return {problem:{code:'unapproved',name:c.name,reason:(pinned?'its earlier version isn’t offered: ':'')+(want.approvalNote||'it hasn’t passed its voice test yet')}};
  const k=this.checkVersion(c,want);
  if(k.ok)use=want;
  else if(k.code==='needs_supplement'&&!pinned){
   use=[...vs].reverse().find(v=>v.version<want.version&&usable(v))||null;
   if(!use){const v1ok=vs.some(v=>v.version<want.version&&this.checkVersion(c,v).ok);
    return {problem:{code:'needs_supplement',name:c.name,reason:v1ok?'it’s offered only in its improved version, which needs the voice supplement: import it in Settings → Theme voices':k.reason}};}
   note={code:'needs_supplement',wanted:want.version,used:use.version,text:'Earlier version (v'+use.version+'): import the voice supplement for the improved version (v'+want.version+').'};
  }
  // v2.43: a recording of the improved version is missing or damaged (a damaged install, or a changed
  // import): the earlier version speaks, and says why.
  else if((k.code==='missing'||k.code==='changed')&&!pinned&&(use=[...vs].reverse().find(v=>v.version<want.version&&usable(v))||null))
   note={code:'damaged',wanted:want.version,used:use.version,builtIn:!!k.builtIn,text:'Earlier version (v'+use.version+'): the improved version (v'+want.version+') can’t be used ('+k.reason+').'};
  else return {problem:{code:k.code,name:c.name,reason:k.reason,...(k.builtIn?{builtIn:true}:{})}};
  if(pinned)note={code:'pinned',wanted:cur.version,used:use.version,text:'Earlier version (v'+use.version+'), as you chose. The improved version is v'+cur.version+'.'};
  const f=this.checkVersion(c,use).files;
  return {voice:{theme,character:id,name:c.name,voiceTarget:c.voiceTarget||c.name,relationship:c.relationship||null,direction:c.direction||'',language:c.language||'English',
   status:use.status||'ready',statusNote:use.statusNote||'',transcript:use.transcript||'',xvectorOnly:!!use.xvectorOnly||!use.transcript,transcriptSource:use.transcriptSource||null,
   effects:use.effects||null,volume:Number.isFinite(use.volume)?Math.max(-12,Math.min(6,use.volume)):0,profileVersion:use.version,characterVersion:use.version,currentVersion:cur.version,versionNote:note,
   refPath:f.reference,previewPath:f.preview,preview:use.preview?{text:use.preview.text||null,seconds:use.preview.seconds||null}:null,characterVoice:true}};
 }
 /** For the settings, the panel and the phone: each theme's characters and how each would speak now. */
 summary(theme,{pins={}}={}){
  return this.forTheme(theme).map(c=>{
   const vs=versionsOf(c),cur=currentOf(c),r=this.resolve(theme,c.id,{pin:pins[theme+'/'+c.id]}),v=r.voice,checks=new Map(vs.map(x=>[x.version,this.checkVersion(c,x)])),anyOk=[...checks.values()].some(k=>k.ok);
   const shown=v?vs.find(x=>x.version===v.characterVersion):cur;
   // imported: some version's audio is here (built in or imported; the v2.41 name is kept). builtIn (v2.43): the
   // app ships its recordings. damaged: one of those is missing or damaged (an offered version can't be used).
   return {id:c.id,name:c.name,status:shown.status||'ready',statusNote:shown.statusNote||'',imported:anyOk,builtIn:this.builtIn(c),damaged:vs.some(x=>x.approved===true&&checks.get(x.version).builtIn===true),approved:vs.some(x=>x.approved===true),usable:!!v,problem:v?null:r.problem.reason,
    version:v?v.characterVersion:null,currentVersion:cur.version,versionNote:v?.versionNote?.text||null,versionCode:v?.versionNote?.code||null,pinned:!!(pins[theme+'/'+c.id]&&pins[theme+'/'+c.id]!==cur.version),
    versions:vs.map(x=>({version:x.version,approved:x.approved===true,ready:checks.get(x.version).ok,status:x.status||'ready',supplement:clipsOf(x).some(y=>y.pack==='supplement')})),
    hasPreview:!!shown.preview,previewText:shown.preview?.text||null,nonlexical:!!c.nonlexical,
    // v2.44: offered the optional "sharper voice"? (its evidence, in plain words)
    sharper:sharperOf(c)?{evidence:sharperOf(c).evidence||null,evidenceNote:String(sharperOf(c).evidenceNote||''),clips:c.matching.length,seconds:Math.round(c.matching.reduce((n,x)=>n+(x.seconds||0),0))}:null};});
 }
 /** Which version's clips a preview should play (the one that would speak, or the current one). */
 previewFiles(theme,id,{pin}={}){
  const c=this.entry(theme,id);if(!c)return null;const r=this.resolve(theme,id,{pin});
  const vs=versionsOf(c),v=r.voice?vs.find(x=>x.version===r.voice.characterVersion):[...vs].reverse().find(x=>this.checkVersion(c,x).ok);
  if(!v)return {problem:r.problem?.reason||NOT_IMPORTED,name:c.name};
  const k=this.checkVersion(c,v);return k.ok?{files:k.files,version:v,name:c.name}:{problem:k.reason,name:c.name};
 }
 /**
  * v2.44: the recordings kNN-VC matches against for the "sharper voice", each checked (size and SHA-256) like a
  * reference clip. null: not offered for this character. {ok:true, files, shas, k, settings} or {ok:false, reason}.
  */
 matching(theme,id){
  const c=this.entry(theme,id),sh=sharperOf(c);if(!sh)return null;
  const files=[];
  for(const x of c.matching){const r=this.locate(c,x);
   if(r.state!=='ok')return {ok:false,code:r.state,reason:'one of the recordings it matches against is '+(r.state==='missing'?'missing':'damaged')+(r.builtIn?': run the Setup again to repair the app':': import the voice packs again')};
   files.push(r.file);}
  return {ok:true,files,shas:c.matching.map(x=>x.sha256),k:sh.k,settings:{k:sh.k,layer:sh.layer||6,vocoder:sh.vocoder||'prematched'}};
 }
 /** v2.44: the characters that offer the "sharper voice" ("theme/id"). */
 sharperIds(){return this.list.filter(c=>sharperOf(c)).map(c=>c.theme+'/'+c.id);}
 /**
  * Imports the owner's packs from a folder (a pack, or a folder holding packs: unpacked or as ZIPs) or a
  * ZIP. Only the catalog's clips are read; each is checked before it is kept, and what is already here
  * stays (so the two packs can be imported in either order). A clip that is already here, built in
  * (v2.43) or imported, unchanged, isn't read or copied again: importing the same recordings changes
  * nothing. Returns, per character, what was added and which versions can speak now.
  */
 async import(source,{onProgress}={}){
  const src=String(source||'').trim().replace(/^["']+|["']+$/g,'');
  if(!src)throw Error('Choose the character voice pack or the voice supplement: its folder, or its ZIP file.');
  let st;try{st=fs.statSync(src);}catch{throw Error('That folder or file doesn’t exist: '+src);}
  const reader=st.isDirectory()?await folderReader(src):/\.zip$/i.test(src)&&st.isFile()?await zipReader(src,st.size):null;
  if(!reader)throw Error('Choose the pack’s folder or its .zip file.');
  const failed=[],characters=[],packs=new Set();let total=0,n=0,added=0,already=0;const all=this.list.length;
  try{
   for(const c of this.list){
    onProgress?.({done:n++,total:all,name:c.name});
    this.meta(c); // moves a v2.41 import to the new layout first
    const got=[];let why=null;
    for(const x of allClips(c)){
     // Already here and unchanged (built in or imported): nothing to read or copy (counted if the pack has it).
     if(this.locate(c,x).state==='ok'){if(reader.has(x.file))already++;continue;}
     let bytes=null;
     try{bytes=await reader.read(x.file,x.bytes,x.sha256);}catch(e){why=e.message;break;}
     if(!bytes)continue; // not in this pack (it may be in the other one)
     if(bytes.length!==x.bytes){why='a recording has the wrong size ('+path.posix.basename(x.file)+')';break;}
     if(bytes.subarray(0,4).toString('latin1')!=='fLaC'){why='a recording isn’t a FLAC file ('+path.posix.basename(x.file)+')';break;}
     if(sha(bytes)!==x.sha256){why='a recording doesn’t match its SHA-256 ('+path.posix.basename(x.file)+')';break;}
     total+=bytes.length;if(total>MAX_TOTAL)throw Error('The packs’ character recordings are larger than expected; nothing more was imported.');
     got.push([x,bytes]);packs.add(x.pack||'expansion');
    }
    if(why){failed.push({id:c.theme+'/'+c.id,name:c.name,reason:why});continue;}
    if(got.length){
     const dir=this.folder(c.theme,c.id);fs.mkdirSync(dir,{recursive:true});
     for(const [x,b] of got){const f=this.clipFile(c,x),tmp=f+'.importing';fs.writeFileSync(tmp,b);fs.renameSync(tmp,f);}
     const old=this.meta(c);this.writeMeta(c,{format:STORE_FORMAT,id:c.theme+'/'+c.id,name:c.name,catalogVersion:this.catalog.version||1,importedAt:old?.importedAt||Date.now(),updatedAt:Date.now()});
     added+=got.length;
    }
    const vs=versionsOf(c),ready=vs.filter(v=>this.checkVersion(c,v).ok).map(v=>v.version),cur=currentOf(c);
    characters.push({id:c.theme+'/'+c.id,name:c.name,added:got.length,ready,current:cur.version,complete:ready.includes(cur.version),needsSupplement:!ready.includes(cur.version)&&this.checkVersion(c,cur).code==='needs_supplement'});
   }
  }finally{await reader.close?.();}
  onProgress?.({done:all,total:all});
  const usable=characters.filter(x=>x.ready.length);
  // already (v2.43): clips the pack holds that were here, unchanged, before (built in or imported); not copied.
  return {imported:usable.length,complete:characters.filter(x=>x.complete).length,needsSupplement:characters.filter(x=>x.needsSupplement).length,added,already,failed,total:all,bytes:total,
   packs:[...packs].map(p=>PACKS[p]),characters:characters.filter(x=>x.added||x.ready.length)};
 }
 /**
  * For the status line: characters with a usable version (imported: the v2.41 name), the ones offered now,
  * the improved versions waiting for the supplement, and (v2.43) how many are built in, how many have a
  * missing or damaged built-in recording, and what extra imported copies are kept (Remove imported copies).
  */
 status(){
  let imported=0,complete=0,needs=0,offered=0,damaged=0;
  for(const c of this.list){const vs=versionsOf(c),cur=currentOf(c),ok=vs.filter(v=>this.checkVersion(c,v).ok);
   if(ok.length)imported++;if(ok.includes(cur))complete++;else if(ok.length&&this.checkVersion(c,cur).code==='needs_supplement')needs++;
   if(this.resolve(c.theme,c.id).voice)offered++;if(vs.some(v=>v.approved===true&&this.checkVersion(c,v).builtIn===true))damaged++;}
  return {total:this.list.length,imported,complete,needsSupplement:needs,improved:this.list.filter(c=>versionsOf(c).length>1).length,
   builtIn:this.list.filter(c=>this.builtIn(c)).length,offered,damaged,extra:this.extra()};
 }
 /** v2.43: the imported copies kept beside the built-in clips (after tidying): {clips, bytes}. */
 extra(){
  let clips=0,bytes=0;for(const c of this.list){this.tidy(c);const dir=this.folder(c.theme,c.id);let names=[];try{names=fs.readdirSync(dir);}catch{continue;}
   for(const n of names)if(/^[0-9a-f]{64}\.flac$/.test(n)){clips++;try{bytes+=fs.statSync(path.join(dir,n)).size;}catch{}}}
  return {clips,bytes};
 }
 /** Removes the imported copies only: the built-in clips are part of the app and stay (v2.43). */
 remove(){fs.rmSync(this.dir,{recursive:true,force:true});this.tidied.clear();}
}
/** Is the file at f the clip x, unchanged? 'ok', 'missing' or 'changed' (a link or folder is 'changed'). */
function fileState(f,x){let st;try{st=fs.lstatSync(f);}catch{return 'missing';}return st.isFile()&&st.size===x.bytes&&fileHash(f)===x.sha256?'ok':'changed';}

/** Reads catalog paths from unpacked packs: regular files inside the folder only (no links, no ".."). The
 *  folder may be a pack itself or hold packs (unpacked in folders with a manifest.json, or as pack ZIPs). */
async function folderReader(root){
 const base=fs.realpathSync(root);let names=[];try{names=fs.readdirSync(base,{withFileTypes:true});}catch{}
 const roots=[base,...names.filter(d=>d.isDirectory()&&fs.existsSync(path.join(base,d.name,'manifest.json'))).map(d=>path.join(base,d.name))];
 const zips=[];let yieldBad=null;
 for(const d of names.filter(d=>d.isFile()&&/^Robotic-Tyler-.*\.zip$/i.test(d.name)).slice(0,MAX_ZIPS)){const f=path.join(base,d.name);try{zips.push(await zipReader(f,fs.statSync(f).size));}catch{}}
 const plain=(rel,expected)=>{
  for(const r of roots){
   const f=path.join(r,...rel.split('/'));let st;try{st=fs.lstatSync(f);}catch{continue;}
   if(!st.isFile())throw Error('not a plain file: '+rel);
   const real=fs.realpathSync(f);if(!real.startsWith(base+path.sep))throw Error('outside the pack: '+rel);
   if(st.size!==expected){yieldBad=Buffer.alloc(Math.min(st.size,1));continue;}
   return fs.readFileSync(real);
  }
  return null;};
 return {async read(rel,expected,hash){
  if(!CLIP_PATH.test(rel))return null;yieldBad=null;
  // Two packs can't hold the same path for different audio here (checked for these packs), but a clip is
  // only taken when its size and SHA-256 match; otherwise the first mismatch is reported.
  const a=plain(rel,expected);if(a&&(!hash||sha(a)===hash))return a;let first=a||yieldBad;
  for(const z of zips){const b=await z.read(rel,expected);if(b&&b.length===expected&&(!hash||sha(b)===hash))return b;first=first||b;}
  return first;},
  // Does the pack hold this path at all? (Only counted, never read, when the clip is already here.)
  has(rel){if(!CLIP_PATH.test(rel))return false;for(const r of roots){try{if(fs.lstatSync(path.join(r,...rel.split('/'))).isFile())return true;}catch{}}return zips.some(z=>z.has(rel));},
  close:async()=>{for(const z of zips)await z.close();}};
}
/** Reads catalog paths from a pack's ZIP without unpacking anything else. Each entry's declared sizes
 *  must match the catalog, and inflating stops at that size (so a damaged or hostile ZIP can't fill the disk). */
async function zipReader(file,size){
 if(size>MAX_ZIP)throw Error('That ZIP is larger than a character voice pack can be.');
 const list=await entries(file),by=new Map();
 for(const e of list){const n=String(e.name).replace(/\\/g,'/');if(e.dir)continue;
  const i=n.indexOf('themes/');if(i<0)continue;const prefix=n.slice(0,i),rel=n.slice(i);
  if(prefix&&!/^[A-Za-z0-9 _.()-]{1,120}\/$/.test(prefix))continue; // at most one top folder
  if(!CLIP_PATH.test(rel))continue;if(!by.has(rel))by.set(rel,e);}
 const fd=await fs.promises.open(file,'r');
 return {async read(rel,expected){
  const e=by.get(rel);if(!e)return null;
  if(e.encrypted||![0,8].includes(e.method))throw Error('unsupported ZIP entry: '+rel);
  if(e.usize!==expected||e.csize>expected+1024)return Buffer.alloc(1);
  const h=Buffer.alloc(30);await fd.read(h,0,30,e.offset);if(h.readUInt32LE(0)!==0x04034b50)throw Error('broken ZIP entry: '+rel);
  const start=e.offset+30+h.readUInt16LE(26)+h.readUInt16LE(28),body=Buffer.alloc(e.csize);await fd.read(body,0,e.csize,start);
  if(e.method===0)return body;
  try{return zlib.inflateRawSync(body,{maxOutputLength:expected+1});}catch{throw Error('a recording in the ZIP is damaged: '+rel);}
 },has:rel=>by.has(rel),close:()=>fd.close()};
}
module.exports={Characters,ID,CLIP_PATH,MAX_CLIP,MAX_TOTAL,PACKS,validEntry,fileHash,versionsOf,allClips,currentOf,sharperOf};

'use strict';
// ROBOTIC TYLER theme voices: optional character voices (v2.41; versions and the voice supplement v2.42).
//
// The app ships only a catalog (characters.json): each character's stable "theme/character" ID, name,
// and one or more versions. A version lists the original clips chosen as its reference (pack path, size,
// SHA-256, exact text, and which pack it comes from), the clip played as its "original recording", and
// its readiness. No audio ships with the app. The recordings come from the owner's packs, imported with
// "Import character voices": the character voice pack (Robotic-Tyler-Character-Voice-Expansion) and,
// since v2.42, the voice supplement (Robotic-Tyler-Complete-Voice-Supplement), each as its folder or its
// ZIP, in either order or together. Each clip is checked (a safe pack path, the exact size, a FLAC header
// and the SHA-256 in the catalog) and copied into ThemeVoices\characters\<theme>\<character>\<sha>.flac.
// Nothing else in a pack is read, and nothing is ever loaded as code or as a model.
//
// A theme's own voice stays its default. A character the owner picks speaks in its current version when
// all of that version's clips are present, unchanged and approved. If the current version needs the voice
// supplement and only the first pack is imported, its earlier version speaks and says so (never silently);
// if no version can be used, the theme's own voice speaks with the reason. The owner can also pin a
// character to its earlier version (settings: characterVersion), like the built-in voices.
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
/** Every distinct clip a character needs across its versions. */
function allClips(c){const seen=new Map();for(const v of versionsOf(c))for(const x of clipsOf(v))if(!seen.has(x.sha256))seen.set(x.sha256,x);return [...seen.values()];}
const currentOf=c=>{const vs=versionsOf(c);return vs.find(v=>v.version===c.current)||vs.at(-1);};
/** A catalog entry is usable only if its fields are what this code expects (a bad catalog never reaches the disk). */
function validEntry(c,themes){
 if(!c||!themes.includes(c.theme)||!ID.test(String(c.id||''))||!c.name)return false;
 const vs=versionsOf(c);if(!vs.length||vs.length>9||!vs.every(v=>Number.isInteger(v.version)&&v.version>0&&v.clips?.length&&clipsOf(v).length<=40))return false;
 if(new Set(vs.map(v=>v.version)).size!==vs.length)return false;
 return allClips(c).every(x=>CLIP_PATH.test(String(x.file||''))&&x.file.split('/')[1]===c.theme&&x.file.split('/')[2]===c.id&&/^[0-9a-f]{64}$/.test(String(x.sha256||''))&&Number.isInteger(x.bytes)&&x.bytes>44&&x.bytes<=MAX_CLIP&&(!x.pack||Object.hasOwn(PACKS,x.pack)));
}
const NOT_IMPORTED='its recordings aren’t imported: use Import character voices in Settings → Theme voices';

class Characters{
 constructor({dataDir,catalogFile,themes}){
  this.dir=path.join(dataDir,'characters');this.themes=themes;
  this.catalog=loadCatalog(catalogFile);
  this.list=this.catalog.characters.filter(c=>validEntry(c,themes));
 }
 entry(theme,id){return this.list.find(c=>c.theme===theme&&c.id===id)||null;}
 forTheme(theme){return this.list.filter(c=>c.theme===theme);}
 themesWithCharacters(){return [...new Set(this.list.map(c=>c.theme))];}
 folder(theme,id){return path.join(this.dir,theme,id);}
 clipFile(c,x){return path.join(this.folder(c.theme,c.id),x.sha256+'.flac');}
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
 /** Is one clip here and unchanged? 'ok', 'missing' or 'changed'. */
 clipState(c,x){const f=this.clipFile(c,x);let st;try{st=fs.lstatSync(f);}catch{return 'missing';}return st.isFile()&&st.size===x.bytes&&fileHash(f)===x.sha256?'ok':'changed';}
 /** Is one version's audio here and unchanged? {ok, files:{reference:[…], preview}} or {ok:false, code, reason}. */
 checkVersion(c,v){
  if(!this.meta(c))return {ok:false,code:'not_imported',reason:NOT_IMPORTED};
  const ref=[];let preview=null;const missingPacks=new Set();let changed=false;
  for(const [i,x] of clipsOf(v).entries()){
   const s=this.clipState(c,x);if(s==='missing')missingPacks.add(x.pack||'expansion');else if(s==='changed')changed=true;
   else if(i<v.clips.length)ref.push(this.clipFile(c,x));else preview=this.clipFile(c,x);
  }
  if(missingPacks.size){const p=[...missingPacks];
   if(p.length===1&&p[0]==='supplement'&&!changed)return {ok:false,code:'needs_supplement',reason:'it needs the voice supplement: import it in Settings → Theme voices'};
   if(!(p.length===1&&p[0]==='supplement'))return {ok:false,code:'missing',reason:'one of its recordings is missing: import '+p.map(k=>PACKS[k]).join(' and ')+' (again, if you already did)'};}
  if(changed)return {ok:false,code:'changed',reason:'one of its recordings was changed or damaged: import the pack again'};
  return {ok:true,files:{reference:ref,preview}};
 }
 /** v2.41's single-version check (kept for callers that don't care about versions): the current version. */
 check(c){return this.checkVersion(c,currentOf(c));}
 /**
  * The voice to use for theme/character, or why it can't be used. `pin` is a version the owner chose
  * (rollback); otherwise the current version, or an earlier one when the current one needs the voice
  * supplement and it isn't imported (the returned voice says so in versionNote).
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
  else return {problem:{code:k.code,name:c.name,reason:k.reason}};
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
   const vs=versionsOf(c),cur=currentOf(c),r=this.resolve(theme,c.id,{pin:pins[theme+'/'+c.id]}),v=r.voice,anyOk=vs.some(x=>this.checkVersion(c,x).ok);
   const shown=v?vs.find(x=>x.version===v.characterVersion):cur;
   return {id:c.id,name:c.name,status:shown.status||'ready',statusNote:shown.statusNote||'',imported:anyOk,approved:vs.some(x=>x.approved===true),usable:!!v,problem:v?null:r.problem.reason,
    version:v?v.characterVersion:null,currentVersion:cur.version,versionNote:v?.versionNote?.text||null,versionCode:v?.versionNote?.code||null,pinned:!!(pins[theme+'/'+c.id]&&pins[theme+'/'+c.id]!==cur.version),
    versions:vs.map(x=>({version:x.version,approved:x.approved===true,ready:this.checkVersion(c,x).ok,status:x.status||'ready',supplement:clipsOf(x).some(y=>y.pack==='supplement')})),
    hasPreview:!!shown.preview,previewText:shown.preview?.text||null,nonlexical:!!c.nonlexical};});
 }
 /** Which version's clips a preview should play (the one that would speak, or the current one). */
 previewFiles(theme,id,{pin}={}){
  const c=this.entry(theme,id);if(!c)return null;const r=this.resolve(theme,id,{pin});
  const vs=versionsOf(c),v=r.voice?vs.find(x=>x.version===r.voice.characterVersion):[...vs].reverse().find(x=>this.checkVersion(c,x).ok);
  if(!v)return {problem:r.problem?.reason||NOT_IMPORTED,name:c.name};
  const k=this.checkVersion(c,v);return k.ok?{files:k.files,version:v,name:c.name}:{problem:k.reason,name:c.name};
 }
 /**
  * Imports the owner's packs from a folder (a pack, or a folder holding packs: unpacked or as ZIPs) or a
  * ZIP. Only the catalog's clips are read; each is checked before it is kept, and what is already imported
  * stays (so the two packs can be imported in either order). Returns, per character, what was added and
  * which versions can speak now.
  */
 async import(source,{onProgress}={}){
  const src=String(source||'').trim().replace(/^["']+|["']+$/g,'');
  if(!src)throw Error('Choose the character voice pack or the voice supplement: its folder, or its ZIP file.');
  let st;try{st=fs.statSync(src);}catch{throw Error('That folder or file doesn’t exist: '+src);}
  const reader=st.isDirectory()?await folderReader(src):/\.zip$/i.test(src)&&st.isFile()?await zipReader(src,st.size):null;
  if(!reader)throw Error('Choose the pack’s folder or its .zip file.');
  const failed=[],characters=[],packs=new Set();let total=0,n=0,added=0;const all=this.list.length;
  try{
   for(const c of this.list){
    onProgress?.({done:n++,total:all,name:c.name});
    this.meta(c); // moves a v2.41 import to the new layout first
    const got=[];let why=null;
    for(const x of allClips(c)){
     if(this.clipState(c,x)==='ok')continue;
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
  return {imported:usable.length,complete:characters.filter(x=>x.complete).length,needsSupplement:characters.filter(x=>x.needsSupplement).length,added,failed,total:all,bytes:total,
   packs:[...packs].map(p=>PACKS[p]),characters:characters.filter(x=>x.added||x.ready.length)};
 }
 /** What is imported, for the status line: characters with a usable version, and improved versions waiting for the supplement. */
 status(){
  let imported=0,complete=0,needs=0;
  for(const c of this.list){const vs=versionsOf(c),cur=currentOf(c),ok=vs.filter(v=>this.checkVersion(c,v).ok);
   if(ok.length)imported++;if(ok.includes(cur))complete++;else if(ok.length&&this.checkVersion(c,cur).code==='needs_supplement')needs++;}
  return {total:this.list.length,imported,complete,needsSupplement:needs,improved:this.list.filter(c=>versionsOf(c).length>1).length};
 }
 remove(){fs.rmSync(this.dir,{recursive:true,force:true});}
}

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
  return first;},close:async()=>{for(const z of zips)await z.close();}};
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
 },close:()=>fd.close()};
}
module.exports={Characters,ID,CLIP_PATH,MAX_CLIP,MAX_TOTAL,PACKS,validEntry,fileHash,versionsOf,allClips,currentOf};

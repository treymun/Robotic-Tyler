'use strict';
// ROBOTIC TYLER theme voices: optional character voices (v2.41).
//
// The app ships only a catalog (characters.json): each character's stable "theme/character" ID, name,
// the original clips chosen as its reference (pack path, size, SHA-256, exact text), the clip played as
// its "original recording", and its readiness. No audio ships with the app. The recordings come from
// the owner's character voice pack (its folder or its ZIP), imported with "Import character voices":
// each clip is checked (a safe pack path, the exact size, a FLAC header and the SHA-256 in the catalog)
// and copied into ThemeVoices\characters\<theme>\<character>\. Nothing else in the pack is read, and
// nothing is ever loaded as code or as a model.
//
// A theme's own voice stays its default. A character the owner picks is used only while its clips are
// present, unchanged and approved; otherwise the theme's own voice speaks and the reason is shown.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),zlib=require('node:zlib');
const {entries}=require('./zip.cjs');
const ID=/^[a-z0-9][a-z0-9-]{1,23}$/;
const CLIP_PATH=/^themes\/[a-z0-9]{2,12}\/[a-z0-9][a-z0-9-]{1,23}\/cleaned\/[A-Za-z0-9][A-Za-z0-9_.()-]{0,120}\.flac$/;
const MAX_CLIP=4*1024*1024,MAX_TOTAL=64*1024*1024,MAX_ZIP=2*1024**3;
const STORE_FORMAT=1;

function loadCatalog(file){try{const c=JSON.parse(fs.readFileSync(file,'utf8'));return c&&Array.isArray(c.characters)?c:{format:1,characters:[]};}catch{return {format:1,characters:[]};}}
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const hashMemo=new Map();
/** SHA-256 of a file, remembered while its size and time stay the same. */
function fileHash(file){
 const st=fs.statSync(file),k=file+'|'+st.size+'|'+st.mtimeMs,hit=hashMemo.get(k);if(hit)return hit;
 const h=sha(fs.readFileSync(file));if(hashMemo.size>400)hashMemo.clear();hashMemo.set(k,h);return h;
}
/** Every clip a catalog character needs (its reference clips, then its original-recording clip). */
const clipsOf=c=>[...(c.clips||[]),...(c.preview?[c.preview]:[])];
/** A catalog entry is usable only if its fields are what this code expects (a bad catalog never reaches the disk). */
function validEntry(c,themes){
 if(!c||!themes.includes(c.theme)||!ID.test(String(c.id||''))||!c.name)return false;
 const all=clipsOf(c);if(!c.clips?.length||all.length>40)return false;
 return all.every(x=>CLIP_PATH.test(String(x.file||''))&&x.file.split('/')[1]===c.theme&&x.file.split('/')[2]===c.id&&/^[0-9a-f]{64}$/.test(String(x.sha256||''))&&Number.isInteger(x.bytes)&&x.bytes>44&&x.bytes<=MAX_CLIP);
}

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
 /** Is this character's audio here and unchanged? {ok, files:{reference:[…], preview}} or {ok:false, reason}. */
 check(c){
  const dir=this.folder(c.theme,c.id);let meta=null;
  try{meta=JSON.parse(fs.readFileSync(path.join(dir,'character.json'),'utf8'));}catch{return {ok:false,code:'not_imported',reason:'its recordings aren’t imported: use Import character voices in Settings → Theme voices'};}
  if(meta.format!==STORE_FORMAT||meta.id!==c.theme+'/'+c.id)return {ok:false,code:'invalid',reason:'its imported copy is from another version: import the pack again'};
  const ref=[];let preview=null;
  for(const [i,x] of clipsOf(c).entries()){
   const f=path.join(dir,(i<c.clips.length?'ref-':'preview-')+String(i+1).padStart(2,'0')+'.flac');
   let st;try{st=fs.lstatSync(f);}catch{return {ok:false,code:'missing',reason:'one of its recordings is missing: import the pack again'};}
   if(!st.isFile()||st.size!==x.bytes||fileHash(f)!==x.sha256)return {ok:false,code:'changed',reason:'one of its recordings was changed or damaged: import the pack again'};
   if(i<c.clips.length)ref.push(f);else preview=f;
  }
  return {ok:true,files:{reference:ref,preview}};
 }
 /** The voice to use for theme/character, or why it can't be used. */
 resolve(theme,id){
  const c=this.entry(theme,id);
  if(!c)return {problem:{code:'unknown',name:id,reason:'it isn’t one of this version’s character voices'}};
  if(c.approved!==true)return {problem:{code:'unapproved',name:c.name,reason:c.approvalNote||'it hasn’t passed its voice test yet'}};
  const k=this.check(c);if(!k.ok)return {problem:{code:k.code,name:c.name,reason:k.reason}};
  return {voice:{theme,character:id,name:c.name,voiceTarget:c.voiceTarget||c.name,relationship:c.relationship||null,direction:c.direction||'',language:c.language||'English',
   status:c.status||'ready',statusNote:c.statusNote||'',transcript:c.transcript||'',xvectorOnly:!!c.xvectorOnly||!c.transcript,transcriptSource:c.transcriptSource||null,
   effects:c.effects||null,volume:Number.isFinite(c.volume)?Math.max(-12,Math.min(6,c.volume)):0,profileVersion:c.profileVersion||1,
   refPath:k.files.reference,previewPath:k.files.preview,preview:c.preview?{text:c.preview.text||null,seconds:c.preview.seconds||null}:null,characterVoice:true}};
 }
 /** For the settings and the panel: each theme's characters and whether each can be used now. */
 summary(theme){
  return this.forTheme(theme).map(c=>{const k=this.check(c),ok=k.ok&&c.approved===true;
   return {id:c.id,name:c.name,status:c.status||'ready',statusNote:c.statusNote||'',imported:k.ok,approved:c.approved===true,usable:ok,problem:ok?null:c.approved!==true?(c.approvalNote||'Not approved yet.'):k.reason,
    hasPreview:!!c.preview,previewText:c.preview?.text||null,nonlexical:!!c.nonlexical};});
 }
 /**
  * Imports the owner's pack from its folder or its ZIP. Only the catalog's clips are read; each is
  * checked before it is kept. Returns what was imported and what wasn't (with the reason).
  */
 async import(source,{onProgress}={}){
  const src=String(source||'').trim().replace(/^["']+|["']+$/g,'');
  if(!src)throw Error('Choose the character voice pack: its folder, or its ZIP file.');
  let st;try{st=fs.statSync(src);}catch{throw Error('That folder or file doesn’t exist: '+src);}
  const reader=st.isDirectory()?folderReader(src):/\.zip$/i.test(src)&&st.isFile()?await zipReader(src,st.size):null;
  if(!reader)throw Error('Choose the pack’s folder or its .zip file.');
  const done=[],failed=[];let total=0,n=0;const all=this.list.length;
  try{
   for(const c of this.list){
    onProgress?.({done:n++,total:all,name:c.name});
    const got=[];let why=null;
    for(const x of clipsOf(c)){
     let bytes=null;
     try{bytes=await reader.read(x.file,x.bytes);}catch(e){why=e.message;break;}
     if(!bytes){why='not in the pack ('+x.file+')';break;}
     if(bytes.length!==x.bytes){why='a recording has the wrong size ('+path.posix.basename(x.file)+')';break;}
     if(bytes.subarray(0,4).toString('latin1')!=='fLaC'){why='a recording isn’t a FLAC file ('+path.posix.basename(x.file)+')';break;}
     if(sha(bytes)!==x.sha256){why='a recording doesn’t match its SHA-256 ('+path.posix.basename(x.file)+')';break;}
     total+=bytes.length;if(total>MAX_TOTAL)throw Error('The pack’s character recordings are larger than expected; nothing more was imported.');
     got.push(bytes);
    }
    if(why){failed.push({id:c.theme+'/'+c.id,name:c.name,reason:why});continue;}
    const dir=this.folder(c.theme,c.id),tmp=dir+'.importing';
    fs.rmSync(tmp,{recursive:true,force:true});fs.mkdirSync(tmp,{recursive:true});
    got.forEach((b,i)=>fs.writeFileSync(path.join(tmp,(i<c.clips.length?'ref-':'preview-')+String(i+1).padStart(2,'0')+'.flac'),b));
    fs.writeFileSync(path.join(tmp,'character.json'),JSON.stringify({format:STORE_FORMAT,id:c.theme+'/'+c.id,name:c.name,catalogVersion:this.catalog.version||1,importedAt:Date.now(),clips:clipsOf(c).map(x=>({file:x.file,sha256:x.sha256,bytes:x.bytes}))},null,1));
    fs.rmSync(dir,{recursive:true,force:true});fs.mkdirSync(path.dirname(dir),{recursive:true});fs.renameSync(tmp,dir);
    done.push({id:c.theme+'/'+c.id,name:c.name});
   }
  }finally{await reader.close?.();}
  onProgress?.({done:all,total:all});
  return {imported:done.length,failed,total:all,bytes:total,characters:done};
 }
 remove(){fs.rmSync(this.dir,{recursive:true,force:true});}
}

/** Reads catalog paths from an unpacked pack: regular files inside the folder only (no links, no "..").
 *  The folder may be the pack itself or the folder that holds it. */
function folderReader(root){
 const base=fs.realpathSync(root);
 const roots=[base,...(()=>{try{return fs.readdirSync(base,{withFileTypes:true}).filter(d=>d.isDirectory()&&fs.existsSync(path.join(base,d.name,'manifest.json'))).map(d=>path.join(base,d.name));}catch{return [];}})()];
 return {async read(rel,expected){
  if(!CLIP_PATH.test(rel))return null;
  for(const r of roots){
   const f=path.join(r,...rel.split('/'));let st;try{st=fs.lstatSync(f);}catch{continue;}
   if(!st.isFile())throw Error('not a plain file: '+rel);
   const real=fs.realpathSync(f);if(!real.startsWith(base+path.sep))throw Error('outside the pack: '+rel);
   if(st.size!==expected)return Buffer.alloc(Math.min(st.size,1));
   return fs.readFileSync(real);
  }
  return null;}};
}
/** Reads catalog paths from the pack's ZIP without unpacking anything else. Each entry's declared sizes
 *  must match the catalog, and inflating stops at that size (so a damaged or hostile ZIP can't fill the disk). */
async function zipReader(file,size){
 if(size>MAX_ZIP)throw Error('That ZIP is larger than the character voice pack can be.');
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
module.exports={Characters,ID,CLIP_PATH,MAX_CLIP,MAX_TOTAL,validEntry,fileHash};

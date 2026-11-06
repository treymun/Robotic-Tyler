// v2.41 character voices (MOCKED: no model, no real pack audio). The store, its import checks (sizes,
// hashes, FLAC header, path safety, ZIP limits), the per-theme choice, the fallback to the theme's own
// voice, the cache keys, the service with the stand-in worker (tests/fixtures/fake_voice_worker.py),
// the panel's !say theme/character and the phone remote's action. The real catalog shipped with the app
// (app/theme-voices/characters.json) is checked for repeats. Real inference is reported separately
// (CHANGES.md: before/after table); nothing here claims a voice sounds right.
// v2.43 (end of the file): the recordings are built in. Those tests use the app's real clips
// (app/theme-voices/characters/, or copies of them to damage), still with no model (MOCKED inference).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';import path from 'node:path';import os from 'node:os';import zlib from 'node:zlib';import crypto from 'node:crypto';
import {createRequire} from 'node:module';import {execFileSync} from 'node:child_process';
const require=createRequire(import.meta.url),root=path.resolve(import.meta.dirname,'..'),TV=path.join(root,'app','theme-voices');
const {Characters,validEntry,CLIP_PATH,versionsOf,allClips}=require(path.join(TV,'characters.cjs'));
const {Voices,THEMES}=require(path.join(TV,'voices.cjs'));
const {ThemeVoices}=require(path.join(TV,'service.cjs'));
const {WorkerHost}=require(path.join(TV,'worker.cjs'));
const {LOCK,lockHash}=require(path.join(TV,'installer.cjs'));
const GB=1024**3,sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const tmp=()=>fs.mkdtempSync(path.join(os.tmpdir(),'tyler-cv-'));
const python=(()=>{for(const p of ['python3','python'])try{execFileSync(p,['-c','print(1)'],{stdio:'ignore'});return p;}catch{}return null;})();
const CATALOG=JSON.parse(fs.readFileSync(path.join(TV,'characters.json'),'utf8'));

// A small stand-in pack: FLAC-headed files (not real audio) at the pack's paths, and a catalog for them.
function fakeFlac(seed,n=600){const b=Buffer.alloc(n);b.write('fLaC',0,'latin1');for(let i=4;i<n;i++)b[i]=(seed*31+i*7)&255;return b;}
function makePack({chars=[['tf2','scout',3],['tf2','spy',2],['deadlock','haze',2]],top='Robotic-Tyler-Character-Voice-Expansion'}={}){
 const dir=tmp(),packRoot=path.join(dir,top),files=[],catalog={format:1,version:1,characters:[]};let seed=1;
 fs.mkdirSync(packRoot,{recursive:true});fs.writeFileSync(path.join(packRoot,'manifest.json'),'{}');
 for(const [theme,id,n] of chars){
  const clips=[];
  for(let i=1;i<=n+1;i++){const rel=`themes/${theme}/${id}/cleaned/0${i}__${id}_line${i}.flac`,b=fakeFlac(seed++);
   fs.mkdirSync(path.dirname(path.join(packRoot,rel)),{recursive:true});fs.writeFileSync(path.join(packRoot,rel),b);files.push([rel,b]);
   clips.push({file:rel,sha256:sha(b),bytes:b.length,seconds:1.5,text:'Line '+i+'.'});}
  catalog.characters.push({theme,id,name:id[0].toUpperCase()+id.slice(1),status:'ready',approved:true,transcript:clips.slice(0,n).map(c=>c.text).join(' '),clips:clips.slice(0,n),preview:clips[n]});
 }
 return {dir,packRoot,files,catalog,top};
}
// A ZIP of the pack (deflated entries, one top folder), like the owner's download.
function zipOf(files,top){
 const locals=[],central=[];let off=0;
 for(const [rel,data,opts={}] of files){
  const raw=Buffer.from(data),body=opts.body||zlib.deflateRawSync(raw),n=Buffer.from((top?top+'/':'')+rel),usize=opts.usize??raw.length;
  const lh=Buffer.alloc(30);lh.writeUInt32LE(0x04034b50,0);lh.writeUInt16LE(20,4);lh.writeUInt16LE(8,8);lh.writeUInt32LE(body.length,18);lh.writeUInt32LE(usize,22);lh.writeUInt16LE(n.length,26);
  locals.push(lh,n,body);
  const ch=Buffer.alloc(46);ch.writeUInt32LE(0x02014b50,0);ch.writeUInt16LE(20,4);ch.writeUInt16LE(20,6);ch.writeUInt16LE(8,10);ch.writeUInt32LE(body.length,20);ch.writeUInt32LE(usize,24);ch.writeUInt16LE(n.length,28);ch.writeUInt32LE(off,42);
  central.push(ch,n);off+=30+n.length+body.length;
 }
 const cd=Buffer.concat(central),end=Buffer.alloc(22);end.writeUInt32LE(0x06054b50,0);end.writeUInt16LE(files.length,8);end.writeUInt16LE(files.length,10);end.writeUInt32LE(cd.length,12);end.writeUInt32LE(off,16);
 return Buffer.concat([...locals,cd,end]);
}
function storeWith(catalog){const data=tmp(),file=path.join(tmp(),'characters.json');fs.writeFileSync(file,JSON.stringify(catalog));return {data,file,store:new Characters({dataDir:data,catalogFile:file,themes:THEMES})};}

// ── the catalog shipped with the app ────────────────────────────────────────
test('shipped catalog: stable theme/character IDs, no character in two themes, no theme default repeated, no clip used twice (MOCKED: catalog only)',()=>{
 const list=CATALOG.characters;assert.ok(list.length>=25,'the character list is there ('+list.length+')');
 const data=tmp(),store=new Characters({dataDir:data,catalogFile:path.join(TV,'characters.json'),themes:THEMES});
 assert.equal(store.list.length,list.length,'every catalog entry passes the store\'s own checks');
 const ids=list.map(c=>c.theme+'/'+c.id);assert.equal(new Set(ids).size,ids.length,'IDs are unique');
 const names=list.map(c=>c.name.toLowerCase());assert.equal(new Set(names).size,names.length,'no character appears twice (in two themes)');
 // The theme defaults are not offered again as characters (the owner's "no repeats"): their clips went to the polish pass.
 for(const [t,id] of [['tf2','administrator'],['cs2','sas'],['portal','glados'],['l4d','bill'],['deadlock','bebop'],['gmod','dr-kleiner'],['gmod','g-man'],['dod','us-field-radio']])assert.ok(!ids.includes(t+'/'+id),t+'/'+id+' is a theme default');
 assert.ok(!list.some(c=>/g-?man/i.test(c.id+c.name)),'G-Man is the Steam theme\'s default, not a Garry\'s Mod character');
 // v2.42: a character's versions may share clips (an improved version keeps some of the first one's); across characters, none.
 const clipShas=list.flatMap(c=>allClips(c).map(x=>x.sha256));assert.equal(new Set(clipShas).size,clipShas.length,'no clip is used by two characters');
 const srcShas=list.flatMap(c=>[...new Set(versionsOf(c).flatMap(v=>(v.sources||c.sources||[]).map(s=>s.originalSha256)).filter(Boolean))]);assert.equal(new Set(srcShas).size,srcShas.length,'no original recording is used by two characters');
 // …and none is one of the built-in voices' own recordings.
 const builtin=new Set();for(const t of THEMES){const p=JSON.parse(fs.readFileSync(path.join(TV,'voices',t,'profile.json'),'utf8'));for(const s of p.sources||[])builtin.add(s.sha256);if(p.sample)builtin.add(p.sample.source.sha256);
  for(const h of p.history||[]){const q=JSON.parse(fs.readFileSync(path.join(TV,'voices',t,h.profile),'utf8'));for(const s of q.sources||[])builtin.add(s.sha256);}}
 for(const h of srcShas)assert.ok(!builtin.has(h),'a character clip is a built-in voice\'s recording: '+h);
 const pyro=list.find(c=>c.theme==='tf2'&&c.id==='pyro');
 if(pyro){assert.equal(pyro.nonlexical,true);for(const v of versionsOf(pyro)){assert.equal(v.transcript??null,null,'Pyro\'s lines are non-lexical: no invented transcript');assert.equal(v.xvectorOnly,true);assert.ok(v.clips.every(x=>x.text==null));}}
 for(const c of list)for(const v of versionsOf(c)){assert.ok(v.clips.every(x=>CLIP_PATH.test(x.file)));assert.ok(v.transcript==null||v.transcript===v.clips.map(x=>x.text).join(' '),c.id+' v'+v.version+': the transcript is the clips\' own text, in order');
  assert.ok(!v.preview||!v.clips.some(x=>x.sha256===v.preview.sha256),c.id+': the original-recording clip isn\'t part of the reference');
  assert.ok(v.clips.every(x=>['expansion','supplement'].includes(x.pack)),c.id+': every clip says which pack it comes from');
  if(v.version===1)assert.ok(allClips({versions:[v]}).every(x=>x.pack==='expansion'),c.id+': version 1 needs only the first pack');}
});
test('catalog entries with unsafe paths or wrong fields are ignored, never read',()=>{
 const good={theme:'tf2',id:'scout',name:'Scout',clips:[{file:'themes/tf2/scout/cleaned/01__a.flac',sha256:'a'.repeat(64),bytes:900}]};
 assert.equal(validEntry(good,THEMES),true);
 for(const file of ['themes/tf2/scout/cleaned/../../../../etc/passwd','/etc/passwd','themes/tf2/scout/originals/a.mp3','themes/tf2/spy/cleaned/01.flac','C:\\x.flac','themes/tf2/scout/cleaned/a.flac\u0000.txt'])
  assert.equal(validEntry({...good,clips:[{...good.clips[0],file}]},THEMES),false,file);
 assert.equal(validEntry({...good,theme:'nope'},THEMES),false);assert.equal(validEntry({...good,id:'../x'},THEMES),false);
 assert.equal(validEntry({...good,clips:[{...good.clips[0],bytes:50*1024*1024}]},THEMES),false,'over the clip size limit');
});

// ── import ────────────────────────────────────────────────────────────────
test('import from the pack folder: only the listed clips, each checked; a changed, resized or non-FLAC clip is skipped with the reason (MOCKED pack)',async()=>{
 const p=makePack();
 // Damage three clips: Spy's hash, Haze's size and a non-FLAC file.
 const spy=p.catalog.characters.find(c=>c.id==='spy'),haze=p.catalog.characters.find(c=>c.id==='haze');
 fs.writeFileSync(path.join(p.packRoot,spy.clips[0].file),fakeFlac(999));
 fs.appendFileSync(path.join(p.packRoot,haze.clips[1].file),'xx');
 const {store,data}=storeWith(p.catalog);
 // An extra file in the pack that isn't in the catalog is never copied.
 fs.writeFileSync(path.join(p.packRoot,'themes','tf2','scout','cleaned','evil.flac'),fakeFlac(5));
 const r=await store.import(p.dir); // the folder that holds the pack works too
 assert.equal(r.imported,1);assert.deepEqual(r.characters.map(c=>c.id),['tf2/scout']);
 assert.deepEqual(r.failed.map(f=>f.id).sort(),['deadlock/haze','tf2/spy']);
 assert.match(r.failed.find(f=>f.id==='tf2/spy').reason,/SHA-256/);assert.match(r.failed.find(f=>f.id==='deadlock/haze').reason,/wrong size/);
 const scout=p.catalog.characters.find(c=>c.id==='scout'),kept=fs.readdirSync(path.join(data,'characters','tf2','scout')).sort();assert.deepEqual(kept,['character.json',...[...scout.clips,scout.preview].map(x=>x.sha256+'.flac')].sort());
 assert.ok(!fs.existsSync(path.join(data,'characters','tf2','spy')),'nothing kept for a character that failed');
 // Non-FLAC bytes with the right size and hash are still refused (the header is checked).
 const q=makePack({chars:[['tf2','scout',1]]}),c=q.catalog.characters[0],bad=Buffer.alloc(c.clips[0].bytes,65);fs.writeFileSync(path.join(q.packRoot,c.clips[0].file),bad);c.clips[0].sha256=sha(bad);
 const r2=await storeWith(q.catalog).store.import(q.packRoot);assert.equal(r2.imported,0);assert.match(r2.failed[0].reason,/isn’t a FLAC/);
 await assert.rejects(store.import(path.join(p.dir,'nope')),/doesn’t exist/);await assert.rejects(store.import(''),/Choose the character voice pack/);
 const txt=path.join(p.dir,'pack.txt');fs.writeFileSync(txt,'x');await assert.rejects(store.import(txt),/folder or its \.zip/);
});
test('import from a folder: a clip that is a link (to a file outside the pack) is refused',{skip:process.platform==='win32'&&'symlinks need admin on Windows'},async()=>{
 const p=makePack({chars:[['tf2','scout',2]]}),c=p.catalog.characters[0],outside=path.join(tmp(),'secret.flac');
 fs.copyFileSync(path.join(p.packRoot,c.clips[0].file),outside);fs.rmSync(path.join(p.packRoot,c.clips[0].file));fs.symlinkSync(outside,path.join(p.packRoot,c.clips[0].file));
 const r=await storeWith(p.catalog).store.import(p.packRoot);assert.equal(r.imported,0);assert.match(r.failed[0].reason,/not a plain file/);
});
test('import from the pack ZIP: listed entries only; a declared size that lies or an entry that inflates past its size is refused; "../" names are ignored (MOCKED zip)',async()=>{
 const p=makePack(),zipFile=path.join(p.dir,'pack.zip');
 fs.writeFileSync(zipFile,zipOf([...p.files,['../../evil.flac',fakeFlac(3)],['themes/tf2/scout/cleaned/../../../x.flac',fakeFlac(4)]],p.top));
 const a=storeWith(p.catalog),r=await a.store.import(zipFile);
 assert.equal(r.imported,3,JSON.stringify(r.failed));assert.ok(a.store.check(p.catalog.characters[0]).ok);
 assert.ok(!fs.existsSync(path.join(a.data,'evil.flac'))&&!fs.existsSync(path.join(path.dirname(a.data),'evil.flac')));
 // A hostile entry: declares Scout's exact size but its data inflates far beyond it (a "zip bomb").
 const scout=p.catalog.characters[0],big=Buffer.concat([Buffer.from('fLaC'),Buffer.alloc(5*1024*1024)]);
 const bomb=p.files.map(([rel,b])=>rel===scout.clips[0].file?[rel,big,{usize:b.length}]:[rel,b]);
 fs.writeFileSync(zipFile,zipOf(bomb,p.top));const r2=await storeWith(p.catalog).store.import(zipFile);
 assert.ok(r2.failed.some(f=>f.id==='tf2/scout'&&/damaged|wrong size/.test(f.reason)),'refused: '+JSON.stringify(r2.failed));assert.equal(r2.imported,2);
 // A ZIP without the top folder works; a non-ZIP .zip is refused.
 fs.writeFileSync(zipFile,zipOf(p.files,''));assert.equal((await storeWith(p.catalog).store.import(zipFile)).imported,3);
 fs.writeFileSync(zipFile,'not a zip');await assert.rejects(storeWith(p.catalog).store.import(zipFile),/Not a ZIP/);
});

// ── choosing, falling back, caching ──────────────────────────────────────────
function voicesWith(catalog){const data=tmp(),file=path.join(tmp(),'characters.json');fs.writeFileSync(file,JSON.stringify(catalog));return {data,v:new Voices({builtinDir:path.join(TV,'voices'),dataDir:data,catalogFile:file})};}
test('fallback: a character that is missing, changed, unapproved or unknown gives the theme\'s own voice with the reason (never silently)',async()=>{
 const p=makePack(),{v}=voicesWith(p.catalog);
 const a=v.voiceFor('tf2','scout');assert.equal(a.name,'The Administrator');assert.equal(a.fallback.code,'not_imported');assert.match(a.fallback.reason,/Import character voices/);
 await v.characters.import(p.packRoot);
 const b=v.voiceFor('tf2','scout');assert.equal(b.character,'scout');assert.equal(b.name,'Scout');assert.equal(b.refPath.length,3);assert.ok(b.refPath.every(f=>fs.existsSync(f)));assert.ok(!b.fallback);
 assert.equal(b.transcript,'Line 1. Line 2. Line 3.');assert.equal(b.xvectorOnly,false);
 assert.equal(v.voiceFor('tf2','').name,'The Administrator','no character: the theme\'s own voice');assert.ok(!v.voiceFor('tf2','').fallback);
 assert.equal(v.voiceFor('tf2','haze').fallback.code,'unknown','Haze is Deadlock\'s, not TF2\'s');
 assert.equal(v.voiceFor('tf2','../../x').fallback.code,'unknown');
 fs.writeFileSync(b.refPath[1],fakeFlac(77));const c=v.voiceFor('tf2','scout');assert.equal(c.name,'The Administrator');assert.equal(c.fallback.code,'changed');assert.equal(c.fallback.name,'Scout');
 fs.rmSync(b.refPath[0]);assert.equal(v.voiceFor('tf2','scout').fallback.code,'missing');
 p.catalog.characters[1].approved=false;p.catalog.characters[1].approvalNote='Its test speech wasn’t clear enough.';const w=voicesWith(p.catalog);await w.v.characters.import(p.packRoot);
 const d=w.v.voiceFor('tf2','spy');assert.equal(d.fallback.code,'unapproved');assert.match(d.fallback.reason,/wasn’t clear/);
 const list=w.v.list({characters:{tf2:'spy'}}).find(x=>x.theme==='tf2');assert.equal(list.character,'spy');assert.match(list.characterProblem,/wasn’t clear/);
 assert.deepEqual(list.characters.map(c=>[c.id,c.usable]),[['scout',true],['spy',false]]);
 assert.equal(w.v.list().find(x=>x.theme==='steam').characters,undefined,'themes without characters list none');
});
test('cache keys: model-independent voice key differs by theme, character, reference content, transcript, effects, level and version',async()=>{
 const p=makePack(),{v}=voicesWith(p.catalog);await v.characters.import(p.packRoot);
 const def=v.voiceFor('tf2',''),scout=v.voiceFor('tf2','scout'),spy=v.voiceFor('tf2','spy'),fb=v.voiceFor('tf2','nobody');
 const k=x=>v.key(x),keys=[k(def),k(scout),k(spy)];assert.equal(new Set(keys).size,3);
 assert.equal(k(fb),k(def),'a fallback is the theme\'s own voice, so it shares its cache (not the missing character\'s)');
 assert.notEqual(k({...scout,transcript:'Other text.'}),k(scout));assert.notEqual(k({...scout,effects:{lowpass:3000}}),k(scout));
 assert.notEqual(k({...scout,volume:-3}),k(scout));assert.notEqual(k({...scout,profileVersion:2}),k(scout));assert.notEqual(k({...scout,xvectorOnly:true}),k(scout));
 // Same name and size, other content → other key (the reference's SHA-256 is used, not its file name or time).
 const f=scout.refPath[0],old=fs.readFileSync(f),before=k(scout);const changed=Buffer.from(old);changed[100]^=255;fs.writeFileSync(f,changed);
 assert.notEqual(k(scout),before);fs.writeFileSync(f,old);assert.equal(k(scout),before);
});
test('built-in versions: an improved voice keeps its earlier version for rollback; the pinned version is used and keyed separately',()=>{
 const app=tmp(),vd=path.join(app,'voices');fs.cpSync(path.join(TV,'voices','tf2'),path.join(vd,'tf2'),{recursive:true});
 const prof=JSON.parse(fs.readFileSync(path.join(vd,'tf2','profile.json'),'utf8'));
 if(!prof.history){fs.mkdirSync(path.join(vd,'tf2','v1'));fs.copyFileSync(path.join(vd,'tf2','profile.json'),path.join(vd,'tf2','v1','profile.json'));fs.copyFileSync(path.join(vd,'tf2','reference.flac'),path.join(vd,'tf2','v1','reference.flac'));
  fs.writeFileSync(path.join(vd,'tf2','profile.json'),JSON.stringify({...prof,profileVersion:2,transcript:prof.transcript+' Extra.',history:[{profileVersion:1,profile:'v1/profile.json'}]}));}
 const v=new Voices({builtinDir:vd,dataDir:tmp(),catalogFile:path.join(app,'none.json')});
 const now=v.get('tf2'),old=v.get('tf2',{version:1});assert.deepEqual(now.versions.sort(),[1,2]);assert.equal(now.profileVersion,2);assert.equal(old.profileVersion,1);
 assert.ok(old.refPath.includes(path.join('tf2','v1')));assert.notEqual(v.key(now),v.key(old));
 assert.equal(v.get('tf2',{version:7}).profileVersion,2,'an unknown version gives the current one');
 // The history entry must point at vN/profile.json inside the voice's folder.
 const p2=JSON.parse(fs.readFileSync(path.join(vd,'tf2','profile.json'),'utf8'));p2.history=[{profileVersion:1,profile:'../../../etc/x.json'}];fs.writeFileSync(path.join(vd,'tf2','profile.json'),JSON.stringify(p2));
 assert.equal(new Voices({builtinDir:vd,dataDir:tmp(),catalogFile:path.join(app,'none.json')}).get('tf2',{version:1}).profileVersion,2);
});

// ── the service with the mocked worker ──────────────────────────────────────
function fakeService(catalog,{bundledDir}={}){
 const dir=tmp(),app=tmp();
 fs.cpSync(path.join(TV,'voices'),path.join(app,'voices'),{recursive:true});fs.writeFileSync(path.join(app,'characters.json'),JSON.stringify(catalog));
 fs.mkdirSync(path.join(app,'worker'));fs.copyFileSync(path.join(root,'tests','fixtures','fake_voice_worker.py'),path.join(app,'worker','tyler_voice_worker.py'));
 const engine='engine-'+lockHash('linux-cpu');fs.mkdirSync(path.join(dir,engine,'site'),{recursive:true});fs.writeFileSync(path.join(dir,engine,'ok'),'x');
 const mdir='quality-'+LOCK.models.quality.revision.slice(0,12);fs.mkdirSync(path.join(dir,'models',mdir),{recursive:true});
 fs.writeFileSync(path.join(dir,'installed.json'),JSON.stringify({format:1,engine,runtime:'linux-cpu',lock:lockHash('linux-cpu'),models:{quality:{dir:mdir,revision:LOCK.models.quality.revision}},python}));
 let saved={mode:'quality'},active='tf2';
 const hw={os:{platform:'linux'},cpu:{model:'Test CPU',threads:4},ram:{total:32*GB,free:30*GB},gpus:[],disk:{free:50*GB},at:Date.now()};
 const svc=new ThemeVoices({dataDir:dir,appDir:app,fetch:async()=>{throw Error('no network');},getSettings:async()=>saved,setSettings:async v=>{saved=v;},theme:async()=>active,detect:async()=>hw,python,freemem:()=>30*GB,...(bundledDir?{bundledDir}:{})});
 return {svc,dir,setTheme:t=>{active=t;},settings:()=>saved};
}
test('settings: the character is remembered per theme; other themes keep theirs; "" goes back to the theme\'s voice; bad values are ignored',async()=>{
 const {svc,settings}=fakeService(makePack().catalog);
 await svc.saveSettings({characters:{tf2:'scout'}});await svc.saveSettings({characters:{deadlock:'haze'}});
 assert.deepEqual(settings().characters,{tf2:'scout',deadlock:'haze'});
 await svc.saveSettings({characters:{tf2:'',nope:'x',portal:'../../etc',cs2:'<b>'}});assert.deepEqual(settings().characters,{deadlock:'haze'});
 await svc.saveSettings({followTheme:false});assert.deepEqual(settings().characters,{deadlock:'haze'},'other settings leave the choices alone');
 assert.deepEqual(await svc.resolve({theme:'deadlock'}),{theme:'deadlock',character:'haze'});assert.deepEqual(await svc.resolve({theme:'tf2'}),{theme:'tf2',character:''});
 await svc.saveSettings({builtinVersion:{tf2:1,nope:3,cs2:'x'}});assert.deepEqual(settings().builtinVersion,{tf2:1});await svc.saveSettings({builtinVersion:{tf2:0}});assert.deepEqual(settings().builtinVersion,{});
 await svc.shutdown();
});
test('service (mocked worker): the picked character speaks from its own clips; theme and character are taken when the request starts; a fallback says so',{skip:!python&&'needs python3'},async()=>{
 const p=makePack(),{svc,setTheme}=fakeService(p.catalog),sent=[];
 const orig=WorkerHost.prototype.request;WorkerHost.prototype.request=function(op,payload,o){if(op==='speak')sent.push(payload);return orig.call(this,op,payload,o);};
 try{
  await svc.importCharacters(p.packRoot);
  const def=await svc.speak({text:'Default voice.'});assert.equal(def.theme,'tf2');assert.equal(def.character,null);assert.equal(def.voiceName,'The Administrator');assert.equal(typeof sent.at(-1).ref_audio,'string');
  await svc.saveSettings({characters:{tf2:'scout'}});
  const a=await svc.speak({text:'Scout here.'});assert.equal(a.character,'scout');assert.equal(a.voiceName,'Scout');assert.ok(!a.fallback);
  const req=sent.at(-1);assert.ok(Array.isArray(req.ref_audio)&&req.ref_audio.length===3&&req.ref_audio.every(f=>f.includes(path.join('characters','tf2','scout'))));
  assert.equal(req.ref_text,'Line 1. Line 2. Line 3.');assert.equal(req.xvector_only,false);
  assert.notEqual(path.basename(a.file),path.basename(def.file),'the character has its own cached clip');
  // The choice changes while a message is on its way: that message keeps Scout; the next one is Spy.
  const slow=svc.speak({text:'SLOW long line'});await new Promise(r=>setTimeout(r,30));await svc.saveSettings({characters:{tf2:'spy'}});setTheme('deadlock');
  const next=svc.speak({text:'Next line',theme:'tf2'});const [s1,s2]=await Promise.all([slow,next]);
  assert.equal(s1.character,'scout');assert.equal(s1.theme,'tf2');assert.equal(s2.character,'spy');
  // Explicit character for one message (!say tf2/scout …) doesn't change the saved choice.
  assert.equal((await svc.speak({text:'Once',theme:'tf2',character:'scout'})).character,'scout');assert.equal((await svc.settings()).characters.tf2,'spy');
  // Damaged after import → the theme's own voice speaks, and the clip says why.
  const spy=(await svc.voiceFor('tf2','spy')).refPath;fs.writeFileSync(spy[0],fakeFlac(1234));
  const f=await svc.speak({text:'Who speaks?',theme:'tf2'});assert.equal(f.voiceName,'The Administrator');assert.equal(f.character,null);assert.equal(f.fallback.name,'Spy');assert.match(f.fallback.reason,/changed or damaged/);
  // Removing the imported characters: the theme's own voice, with the reason.
  await svc.saveSettings({characters:{deadlock:'haze'}});assert.equal((await svc.speak({text:'Haze.',theme:'deadlock'})).character,'haze');
  svc.removeCharacters();const g=await svc.speak({text:'After removal.',theme:'deadlock'});assert.equal(g.voiceName,'Bebop');assert.equal(g.fallback.code,'not_imported');
  const list=await svc.voiceList(),dl=list.find(x=>x.theme==='deadlock');assert.equal(dl.character,'haze','the choice is kept for a later import');assert.match(dl.characterProblem,/aren’t imported/);assert.ok(list.find(x=>x.theme==='deadlock').characters.every(c=>!c.imported));
 }finally{WorkerHost.prototype.request=orig;await svc.shutdown();}
});
test('service (mocked worker): removing the voice engine keeps imported characters (like the owner\'s own recordings)',{skip:!python&&'needs python3'},async()=>{
 const p=makePack(),{svc,dir}=fakeService(p.catalog);await svc.importCharacters(p.packRoot);
 await svc.remove();assert.ok(fs.existsSync(path.join(dir,'characters','tf2','scout','character.json')));assert.ok(!fs.existsSync(path.join(dir,'installed.json')));
 await svc.shutdown();
});

// ── the Steam panel card and the phone remote ────────────────────────────────
async function panel(){
 const vm=await import('node:vm');
 const els=new Map(),el=id=>{if(!els.has(id))els.set(id,{id,textContent:'',value:'',checked:false,disabled:false,hidden:false,dataset:{},options:[],onclick:null,onchange:null,replaceChildren(...k){this.options=k;},append(){},addEventListener(){},focus(){}});return els.get(id);};
 el('tvFollow').checked=true;
 const requests=[],sent=[],intervals=[];let observer=null;
 const voices=[{theme:'tf2',name:'The Administrator',status:'ready',statusLabel:'Ready',hasReference:true,character:'spy',characters:[{id:'scout',name:'Scout',usable:true},{id:'spy',name:'Spy',usable:true},{id:'pyro',name:'Pyro',usable:false,problem:'its recordings aren’t imported'}]},{theme:'portal',name:'GLaDOS',status:'ready',statusLabel:'Ready',hasReference:true}];
 const status={ready:true,installed:true,current:true,modeLabel:'Quality',mode:'quality',settings:{followTheme:true,chat:true,chatAccess:'everyone',chatCooldown:0,characters:{tf2:'spy'}}};
 const wav='UklGRiQAAABXQVZFZm10IBAAAAABAAEAwF0AAIC7AAACABAAZGF0YQAAAAA=';
 const api={getFeatureMount:()=>({append(){}}),getTheme:()=>'tf2',bridge(){},getVoiceState:()=>({enabled:true}),send:t=>sent.push(t),onPause(){},isAiPaused:()=>false,getRegion:()=>({isConnected:true,querySelectorAll:()=>[]}),getSample:()=>({isConnected:true}),ui:{onUI(){}}};
 const box={console,setInterval:fn=>{intervals.push(fn);return 1;},setTimeout:fn=>{Promise.resolve().then(fn);return 1;},Uint8Array,DataView,atob:s=>Buffer.from(s,'base64').toString('latin1'),btoa:s=>Buffer.from(s,'latin1').toString('base64'),String,Date,
  document:{createElement:()=>({set innerHTML(v){},querySelector:s=>el(s.slice(1)),addEventListener(){},dataset:{}})},
  MutationObserver:class{constructor(fn){observer=fn;}observe(){}disconnect(){}},TylerCompanion:api,TylerSelection:{selector:()=>'.msg'},TylerChatTag:{own:()=>false},TylerIdentity:{identify:n=>n.who,meta:n=>n.meta},TylerCommands:{set(){}},
  chrome:{runtime:{sendMessage:async m=>{requests.push(m);if(m.type==='voices:status')return {ok:true,available:true,status,voices};
   if(m.type==='voices:speak'){const v=voices.find(x=>x.theme===m.theme),ch=(v.characters||[]).find(c=>c.id===(m.character??v.character));return {ok:true,clip:{id:'v1',text:m.text,theme:m.theme,character:ch?.id||null,voiceName:ch?.name||v.name,seconds:1,ms:900,cached:false,mode:'quality',device:'cuda',status:'ready'},audio:wav};}
   if(m.type==='voices:settings'){Object.assign(status.settings.characters,m.values.characters||{});const v=voices.find(x=>x.theme==='tf2');v.character=status.settings.characters.tf2;}
   return {ok:true};}}}};
 box.globalThis=box;vm.runInNewContext(fs.readFileSync(path.join(root,'browser-extension','theme-voices.js'),'utf8'),box);
 const settle=async()=>{for(let i=0;i<15;i++)await new Promise(r=>setImmediate(r));};await settle();
 for(const fn of intervals)fn();await settle(); // the chat watcher binds to the (mocked) chat
 return {el,requests,sent,settle,box,voices,post:async(text,key)=>{observer?.([{addedNodes:[{nodeType:1,innerText:text,matches:()=>true,querySelectorAll:()=>[],closest:()=>null,who:{id:'76561198000000001',name:'Alex'},meta:{key,at:Date.now()+1e6}}]}]);await settle();}};
}
test('panel (mocked): "!say tf2/scout TEXT" speaks as Scout once; an unknown or unusable character is answered, not spoken; other !say forms are unchanged',async()=>{
 const c=await panel(),V=c.box.TylerThemeVoices,speaks=()=>c.requests.filter(r=>r.type==='voices:speak');
 const say=line=>{const r=V.pick(V.parse(line),c.voices);return {theme:r.theme,character:r.character,text:r.text};};
 assert.deepEqual(say('!say tf2/scout Batter up!'),{theme:'tf2',character:'scout',text:'Batter up!'});
 assert.deepEqual(say('!say TF2/Scout: Batter up!'),{theme:'tf2',character:'scout',text:'Batter up!'});
 assert.deepEqual(say('!say tf2 hello'),{theme:'tf2',character:undefined,text:'hello'},'v2.37.2 form unchanged');
 assert.deepEqual(say('!say portal: The cake'),{theme:'portal',character:undefined,text:'The cake'});
 assert.deepEqual(say('!say scout is fast'),{theme:null,character:undefined,text:'scout is fast'},'a character name alone is just a word');
 assert.deepEqual(say('!say and/or maybe'),{theme:null,character:undefined,text:'and/or maybe'},'a slash in an ordinary word stays text');
 await c.post('!say tf2/scout Batter up!','k1');let r=speaks().at(-1);assert.equal(r.character,'scout');assert.equal(r.theme,'tf2');assert.equal(r.text,'Batter up!');
 await c.post('!say tf2/heavy Sandvich','k2');assert.equal(speaks().length,1,'not spoken');assert.match(c.sent.at(-1),/no “tf2\/heavy” voice on this PC\. Characters: tf2\/scout, tf2\/spy\./);
 await c.post('!say tf2/pyro Mmph','k3');assert.equal(speaks().length,1);assert.match(c.sent.at(-1),/no “tf2\/pyro” voice/);
 await c.post('!say hello all','k4');r=speaks().at(-1);assert.equal(r.theme,'tf2');assert.equal(r.character,undefined,'the saved choice is applied on the PC, when the request starts');
 // The phone's view: usable characters per theme and the one picked.
 const st=V.state();assert.equal(st.theme,'tf2');assert.equal(st.voices.find(v=>v.theme==='tf2').characters.map(x=>x.id).join(),'scout,spy');assert.equal(st.voices.find(v=>v.theme==='tf2').character,'spy');
 assert.equal(st.voices.find(v=>v.theme==='portal').characters,undefined);
 await V.setCharacter('tf2','scout');assert.equal(JSON.stringify(c.requests.filter(r=>r.type==='voices:settings').at(-1).values),JSON.stringify({characters:{tf2:'scout'}}));
 await assert.rejects(V.setCharacter('tf2','pyro'),/isn’t available/);await V.setCharacter('tf2','');assert.equal(JSON.stringify(c.requests.filter(r=>r.type==='voices:settings').at(-1).values),JSON.stringify({characters:{tf2:''}}));
});
test('phone remote (mocked): "theme-character" passes only a theme and a character id; the Steam window saves it through the panel',async()=>{
 const src=fs.readFileSync(path.join(root,'app','remote.cjs'),'utf8'),m=/'theme-character':b=>\(\{[^\n]*?\}\),/.exec(src);assert.ok(m,'the action is in the remote\'s list');
 const fn=eval('('+m[0].slice("'theme-character':".length,-1)+')');
 assert.deepEqual(fn({theme:'tf2',character:'scout',extra:1}),{theme:'tf2',character:'scout'});assert.deepEqual(fn({theme:'../x',character:'<script>'}),{theme:'',character:''});
 const rc=fs.readFileSync(path.join(root,'browser-extension','remote-control.js'),'utf8');assert.match(rc,/'theme-character':async\(\{theme,character\}\)=>\{const tv=globalThis\.TylerThemeVoices;if\(!tv\?\.setCharacter\)/);
 const page=fs.readFileSync(path.join(root,'app','remote','remote.js'),'utf8');assert.match(page,/id="rmTvChar"/);assert.match(page,/act\('theme-character',\{theme,character:sel\.value\}/);
});
test('spoken replies (mocked background): every part of one reply is made with the theme and character taken once',async()=>{
 const src=fs.readFileSync(path.join(root,'browser-extension','background.js'),'utf8');
 assert.match(src,/function themePin\(\)\{let p=null;return \(\)=>p\|\|\(p=Promise\.resolve\(globalThis\.tylerThemeVoices\?\.resolve\?\.\(\{\}\)\)/);
 assert.match(src,/voicePin=themeSpeech\?themePin\(\):null/);
 for(const call of ['localSpeak(speechEngine,candidate,settings.kokoroVoice,controller.signal,voicePin)','localSpeakAll(speechEngine,themeSpeechParts(rest),settings.kokoroVoice,controller.signal,voicePin)','localSpeakAll(speechEngine,parts,settings.kokoroVoice,controller.signal,voicePin)'])assert.ok(src.includes(call),call);
 // Run the real helpers with a stand-in desktop service: the choice changes between parts, the reply keeps its first speaker.
 const vm=await import('node:vm'),calls=[];let pick={theme:'tf2',character:'scout'};
 const box={console,Promise,globalThis:null,tylerThemeVoices:{resolve:async()=>({...pick}),speak:async o=>{calls.push(o);pick={theme:'tf2',character:'spy'};return {audio:'AAAA',clip:{voiceName:o.character}};}}};box.globalThis=box;
 const a=src.indexOf('async function themeSpeakAll'),b=src.indexOf('async function countThemeSpeech');vm.runInNewContext(src.slice(a,b)+';globalThis.run=(parts)=>themeSpeakAll(parts,null,themePin());',box);
 await box.run(['One.','Two.','Three.']);assert.deepEqual(calls.map(c=>c.character),['scout','scout','scout']);assert.ok(calls.every(c=>c.theme==='tf2'&&c.purpose==='reply'));
});

// ── v2.42: the voice supplement (a second pack) and character versions ─────────
// Two stand-in packs (MOCKED): the character voice pack holds version 1's clips; the voice supplement holds
// the extra clips of version 2 (which keeps some of version 1's). Pyro-like: version 1 not offered, version 2 offered.
function makeTwoPacks(){
 const dir=tmp(),exp=path.join(dir,'Robotic-Tyler-Character-Voice-Expansion'),sup=path.join(dir,'Robotic-Tyler-Targeted-Voice-References-2026-11-06-COMPLETE');
 for(const r of [exp,sup]){fs.mkdirSync(r,{recursive:true});fs.writeFileSync(path.join(r,'manifest.json'),'{}');}
 let seed=500;const files={expansion:[],supplement:[]};
 const clip=(pack,theme,id,n)=>{const root=pack==='expansion'?exp:sup,rel=`themes/${theme}/${id}/cleaned/${pack==='expansion'?'0':'1'}${n}__${id}_${pack}.flac`,b=fakeFlac(seed++,700+n);
  fs.mkdirSync(path.dirname(path.join(root,rel)),{recursive:true});fs.writeFileSync(path.join(root,rel),b);files[pack].push([rel,b]);return {file:rel,sha256:sha(b),bytes:b.length,seconds:1.5,text:'Line '+pack+' '+n+'.',pack};};
 const character=(theme,id,{v1ok=true,v2ok=true,xv=false}={})=>{
  const e=[1,2,3].map(n=>clip('expansion',theme,id,n)),s=[1,2,3].map(n=>clip('supplement',theme,id,n));
  const v=(version,clips,preview,approved)=>({version,status:'weak',approved,approvalNote:approved?undefined:'Not offered yet.',transcript:xv?null:clips.map(c=>c.text).join(' '),xvectorOnly:xv,clips:xv?clips.map(c=>({...c,text:null})):clips,preview});
  return {theme,id,name:id[0].toUpperCase()+id.slice(1),current:2,versions:[v(1,e.slice(0,2),e[2],v1ok),v(2,[e[0],s[0],s[1]],s[2],v2ok)]};
 };
 const haze=character('deadlock','haze'); // one version only, the first pack's
 const catalog={format:2,version:2,characters:[character('tf2','scout'),character('tf2','pyro',{v1ok:false,xv:true}),{...haze,current:1,versions:[haze.versions[0]]}]};
 return {dir,exp,sup,files,catalog};
}
test('v2.42 the voice supplement: either pack first, or both from one folder; the improved version speaks only with both; nothing is imported twice (MOCKED packs)',async()=>{
 const p=makeTwoPacks(),{v}=voicesWith(p.catalog);
 // First pack only: Scout speaks in his earlier version and says so; Pyro (offered only in v2) isn't offered.
 let r=await v.characters.import(p.exp);assert.equal(r.needsSupplement,2);assert.deepEqual(r.packs,['the character voice pack']);
 let a=v.voiceFor('tf2','scout');assert.equal(a.character,'scout');assert.equal(a.characterVersion,1);assert.equal(a.versionNote.code,'needs_supplement');assert.match(a.versionNote.text,/import the voice supplement for the improved version \(v2\)/);
 assert.equal(a.refPath.length,2);
 let py=v.voiceFor('tf2','pyro');assert.equal(py.name,'The Administrator');assert.equal(py.fallback.code,'needs_supplement');assert.match(py.fallback.reason,/offered only in its improved version, which needs the voice supplement/);
 const s1=v.characters.summary('tf2');assert.equal(s1.find(c=>c.id==='scout').versionCode,'needs_supplement');assert.equal(s1.find(c=>c.id==='pyro').usable,false);
 const st=v.characters.status();assert.deepEqual({total:st.total,imported:st.imported,complete:st.complete,needsSupplement:st.needsSupplement,improved:st.improved},{total:3,imported:3,complete:1,needsSupplement:2,improved:2});
 assert.equal(st.builtIn,0,'a catalog without built-in packs: nothing is built in, everything comes from an import');
 const k1=v.key(a);
 // Then the supplement: the improved version, a different cache key, no note.
 r=await v.characters.import(p.sup);assert.equal(r.needsSupplement,0);assert.equal(r.added,6,'only the supplement\'s clips were new');assert.deepEqual(r.packs,['the voice supplement']);
 a=v.voiceFor('tf2','scout');assert.equal(a.characterVersion,2);assert.equal(a.versionNote,null);assert.equal(a.refPath.length,3);assert.notEqual(v.key(a),k1);
 py=v.voiceFor('tf2','pyro');assert.equal(py.character,'pyro');assert.equal(py.xvectorOnly,true);assert.equal(py.transcript,'');
 r=await v.characters.import(p.exp);assert.equal(r.added,0,'importing a pack again copies nothing new');
 // The other order, and both at once from the folder that holds them (unpacked), and from a folder of ZIPs.
 const w=voicesWith(p.catalog);r=await w.v.characters.import(p.sup);assert.equal(w.v.voiceFor('tf2','scout').fallback.code,'missing');assert.match(w.v.voiceFor('tf2','scout').fallback.reason,/import the character voice pack/);
 await w.v.characters.import(p.exp);assert.equal(w.v.voiceFor('tf2','scout').characterVersion,2);
 const both=voicesWith(p.catalog);r=await both.v.characters.import(p.dir);assert.equal(r.complete,3);assert.equal(r.needsSupplement,0);assert.deepEqual(r.packs.sort(),['the character voice pack','the voice supplement']);
 const zdir=tmp();fs.writeFileSync(path.join(zdir,'Robotic-Tyler-Character-Voice-Expansion.zip'),zipOf(p.files.expansion,'Robotic-Tyler-Character-Voice-Expansion'));fs.writeFileSync(path.join(zdir,'Robotic-Tyler-Complete-Voice-Supplement.zip'),zipOf(p.files.supplement,'Robotic-Tyler-Targeted-Voice-References-2026-11-06-COMPLETE'));
 const z=voicesWith(p.catalog);r=await z.v.characters.import(zdir);assert.equal(r.complete,3,'a folder holding both ZIPs');
 const z2=voicesWith(p.catalog);r=await z2.v.characters.import(path.join(zdir,'Robotic-Tyler-Complete-Voice-Supplement.zip'));assert.equal(r.imported,0,'the supplement alone makes no voice usable (version 2 keeps a first-pack clip)');
 // A damaged supplement clip: the import reports it and the earlier version keeps speaking.
 const bad=voicesWith(p.catalog);await bad.v.characters.import(p.exp);const sc=p.catalog.characters[0].versions[1].clips[1];fs.writeFileSync(path.join(p.sup,sc.file),fakeFlac(4242,sc.bytes));
 r=await bad.v.characters.import(p.sup);assert.ok(r.failed.some(f=>f.id==='tf2/scout'&&/SHA-256/.test(f.reason)));assert.equal(bad.v.voiceFor('tf2','scout').characterVersion,1);
});
test('v2.42 rollback: a character pinned to its earlier version speaks in it, says so, keys its own cache; a v2.41 import is moved to the new layout (MOCKED)',async()=>{
 const p=makeTwoPacks(),{v,data}=voicesWith(p.catalog);await v.characters.import(p.dir);
 const now=v.voiceFor('tf2','scout'),old=v.voiceFor('tf2','scout',{characterVersion:1});
 assert.equal(now.characterVersion,2);assert.equal(old.characterVersion,1);assert.equal(old.versionNote.code,'pinned');assert.notEqual(v.key(now),v.key(old));
 assert.equal(v.characters.summary('tf2',{pins:{'tf2/scout':1}}).find(c=>c.id==='scout').pinned,true);
 assert.equal(v.voiceFor('tf2','scout',{characterVersion:2}).characterVersion,2,'pinning the current version is the current version');
 const py=v.voiceFor('tf2','pyro',{characterVersion:1});assert.equal(py.fallback.code,'unapproved');assert.match(py.fallback.reason,/earlier version isn’t offered/);
 // v2.41 stored version 1 as ref-01.flac…preview-03.flac with a format-1 record.
 const h=p.catalog.characters[2],dir=path.join(data,'characters','deadlock','haze'),v1=h.versions[0];fs.rmSync(dir,{recursive:true,force:true});fs.mkdirSync(dir,{recursive:true});
 [...v1.clips,v1.preview].forEach((x,i)=>fs.copyFileSync(path.join(p.exp,x.file),path.join(dir,(i<v1.clips.length?'ref-':'preview-')+String(i+1).padStart(2,'0')+'.flac')));
 fs.writeFileSync(path.join(dir,'character.json'),JSON.stringify({format:1,id:'deadlock/haze',name:'Haze'}));
 const hz=v.voiceFor('deadlock','haze');assert.equal(hz.character,'haze');assert.ok(hz.refPath.every(f=>/[0-9a-f]{64}\.flac$/.test(f)));assert.equal(JSON.parse(fs.readFileSync(path.join(dir,'character.json'),'utf8')).format,2);
});
test('v2.42 service (mocked worker): the clip says when an earlier version spoke; the rollback setting is per theme/character and validated',{skip:!python&&'needs python3'},async()=>{
 const p=makeTwoPacks(),{svc,settings}=fakeService(p.catalog);
 try{
  await svc.importCharacters(p.exp);await svc.saveSettings({characters:{tf2:'scout'}});
  const a=await svc.speak({text:'Earlier version.',theme:'tf2'});assert.equal(a.character,'scout');assert.equal(a.characterVersion,1);assert.match(a.versionNote,/voice supplement/);
  await svc.importCharacters(p.sup);const b=await svc.speak({text:'Improved version.',theme:'tf2'});assert.equal(b.characterVersion,2);assert.equal(b.versionNote,null);
  await svc.saveSettings({characterVersion:{'tf2/scout':1,'nope/x':1,'tf2/../x':1,'tf2/spy':'x'}});assert.deepEqual(settings().characterVersion,{'tf2/scout':1});
  const c=await svc.speak({text:'Improved version.',theme:'tf2'});assert.equal(c.characterVersion,1);assert.match(c.versionNote,/as you chose/);assert.notEqual(c.file,b.file);
  await svc.saveSettings({characterVersion:{'tf2/scout':0}});assert.deepEqual(settings().characterVersion,{});
  const list=(await svc.voiceList()).find(x=>x.theme==='tf2');const sc=list.characters.find(x=>x.id==='scout');assert.equal(sc.version,2);assert.deepEqual(sc.versions.map(x=>[x.version,x.ready,x.supplement]),[[1,true,false],[2,true,true]]);
 }finally{await svc.shutdown();}
});

// ── v2.43: the recordings are built in (no import step) ─────────────────────────────
// These use the app's own clips (app/theme-voices/characters/<theme>/<character>/<sha>.flac), or copies of
// them that a test may damage. Still no model: nothing here makes or judges real speech (MOCKED inference).
const BUNDLE=path.join(TV,'characters');
const builtinFile=(c,x,dir=BUNDLE)=>path.join(dir,c.theme,c.id,x.sha256+'.flac');
function catalogClips(){const m=new Map();for(const c of CATALOG.characters)for(const x of allClips(c))m.set(c.theme+'/'+c.id+'/'+x.sha256,{c,x});return m;}
function voicesBuiltin({bundle=BUNDLE,file=path.join(TV,'characters.json'),data=tmp()}={}){return {data,v:new Voices({builtinDir:path.join(TV,'voices'),dataDir:data,catalogFile:file,bundledDir:bundle})};}
// A copy of the app's clips for a few characters (so a test can damage them), and the real catalog cut to them.
function builtinCopy(ids){
 const app=tmp(),bundle=path.join(app,'characters'),cat={...CATALOG,characters:CATALOG.characters.filter(c=>ids.includes(c.theme+'/'+c.id))};
 for(const c of cat.characters)fs.cpSync(path.join(BUNDLE,c.theme,c.id),path.join(bundle,c.theme,c.id),{recursive:true});
 const file=path.join(app,'characters.json');fs.writeFileSync(file,JSON.stringify(cat));return {bundle,file,cat};
}
// A pack folder (and its files, for a ZIP) holding these characters' real clips at their pack paths.
function packOf(chars,top='Robotic-Tyler-Character-Voice-Expansion'){
 const dir=path.join(tmp(),top),files=[];
 for(const c of chars)for(const x of allClips(c)){const b=fs.readFileSync(builtinFile(c,x)),dst=path.join(dir,...x.file.split('/'));fs.mkdirSync(path.dirname(dst),{recursive:true});fs.writeFileSync(dst,b);files.push([x.file,b]);}
 fs.writeFileSync(path.join(dir,'manifest.json'),'{}');return {dir,files,top};
}
const byId=id=>CATALOG.characters.find(c=>c.theme+'/'+c.id===id);

test('v2.43 built in: the app ships exactly the clips the catalog lists, byte-identical; with no import every offered character speaks from them and Original recording plays for all 30',()=>{
 assert.ok(Object.values(CATALOG.packs).every(p=>p.builtIn===true),'both packs are marked as shipped with the app');
 const want=catalogClips(),have=[];
 for(const t of fs.readdirSync(BUNDLE))for(const id of fs.readdirSync(path.join(BUNDLE,t)))for(const f of fs.readdirSync(path.join(BUNDLE,t,id)))have.push(t+'/'+id+'/'+f.replace(/\.flac$/,''));
 assert.deepEqual(have.sort(),[...want.keys()].sort(),'every reference clip and preview of every version (v2.44: and the sharper voice\'s matching recordings), nothing else');
 let bytes=0;for(const {c,x} of want.values()){const b=fs.readFileSync(builtinFile(c,x));assert.equal(b.length,x.bytes);assert.equal(sha(b),x.sha256,c.id);assert.equal(b.subarray(0,4).toString('latin1'),'fLaC');bytes+=b.length;}
 // v2.43: 196 clips (about 15 MB); v2.44 adds 40 for the sharper voice's matching sets (about 3.2 MB).
 assert.equal(want.size,236);assert.ok(bytes>17.5e6&&bytes<18.2e6,'about 17.8 MB ('+bytes+' bytes)');
 const {v,data}=voicesBuiltin();let offered=0;
 for(const c of CATALOG.characters){
  const cur=versionsOf(c).find(x=>x.version===c.current),r=v.voiceFor(c.theme,c.id);
  const p=v.characters.previewFiles(c.theme,c.id);assert.equal(p.files.preview,builtinFile(c,cur.preview),c.id+': its Original recording is the app\'s clip');
  if(cur.approved!==true){assert.equal(r.fallback.code,'unapproved',c.id);assert.equal(r.character,undefined);continue;}
  offered++;assert.equal(r.character,c.id);assert.equal(r.characterVersion,c.current);assert.equal(r.versionNote,null,c.id+': no note');assert.ok(!r.fallback);
  assert.deepEqual(r.refPath,cur.clips.map(x=>builtinFile(c,x)),c.id+': its own clips, in order, from the app');
 }
 assert.equal(offered,29,'Pyro alone isn\'t offered (he never passed his voice test)');
 const st=v.characters.status();assert.deepEqual([st.total,st.builtIn,st.offered,st.damaged,st.needsSupplement,st.complete],[30,30,29,0,0,30]);assert.deepEqual(st.extra,{clips:0,bytes:0});
 const sum=THEMES.flatMap(t=>v.characters.summary(t));assert.equal(sum.length,30);
 assert.ok(sum.every(c=>c.builtIn&&c.imported&&!c.damaged&&!c.versionNote&&!c.versionCode),'built in, nothing waiting for a supplement');
 assert.deepEqual(sum.filter(c=>!c.usable).map(c=>c.id),['pyro']);
 const l=v.list({characters:{tf2:'scout'}}).find(x=>x.theme==='tf2');assert.equal(l.character,'scout');assert.equal(l.characterProblem,null);
 assert.ok(!fs.existsSync(path.join(data,'characters')),'nothing was written to the data folder');
});
test('v2.43 built in: the 5 improved voices speak their version 2 (with their voice-supplement clips); going back to version 1 still works and keys its own cache',()=>{
 const {v}=voicesBuiltin(),improved=CATALOG.characters.filter(c=>versionsOf(c).length>1);
 assert.deepEqual(improved.map(c=>c.theme+'/'+c.id).sort(),['deadlock/kelvin','deadlock/seven','deadlock/venator','l4d/coach','l4d/zoey']);
 for(const c of improved){const [v1,v2]=versionsOf(c),r=v.voiceFor(c.theme,c.id);
  assert.equal(c.current,2);assert.equal(r.characterVersion,2,c.id);assert.equal(r.versionNote,null);assert.equal(r.status,v2.status);
  assert.deepEqual(r.refPath,v2.clips.map(x=>builtinFile(c,x)));assert.ok(v2.clips.some(x=>x.pack==='supplement'),c.id+' uses the supplement\'s clips');
  const old=v.voiceFor(c.theme,c.id,{characterVersion:1});assert.equal(old.characterVersion,1);assert.equal(old.versionNote.code,'pinned');
  assert.deepEqual(old.refPath,v1.clips.map(x=>builtinFile(c,x)));assert.notEqual(v.key(old),v.key(r));}
 const s=v.characters.summary('l4d').find(c=>c.id==='coach');assert.deepEqual(s.versions.map(x=>[x.version,x.ready,x.supplement]),[[1,true,false],[2,true,true]]);
 assert.equal(v.characters.summary('l4d',{pins:{'l4d/coach':1}}).find(c=>c.id==='coach').pinned,true);
});
test('v2.43 built in: a missing or damaged built-in clip falls back visibly (earlier version, or the theme\'s own voice) with the reason; an import repairs it; Remove imported copies keeps the app\'s clips',async()=>{
 const b=builtinCopy(['l4d/coach','tf2/scout']),{v,data}=voicesBuiltin(b),coach=b.cat.characters.find(c=>c.id==='coach'),scout=b.cat.characters.find(c=>c.id==='scout');
 const [c1,c2]=versionsOf(coach),f=x=>builtinFile(coach,x,b.bundle);
 assert.equal(v.voiceFor('l4d','coach').characterVersion,2);
 // A clip only version 2 uses is damaged: version 1 speaks, and says why.
 const only2=c2.clips.find(x=>!clipsOfAll(c1).includes(x.sha256)),orig2=fs.readFileSync(f(only2));fs.appendFileSync(f(only2),'x');
 let r=v.voiceFor('l4d','coach');assert.equal(r.character,'coach');assert.equal(r.characterVersion,1);assert.equal(r.versionNote.code,'damaged');assert.equal(r.versionNote.builtIn,true);
 assert.equal(r.versionNote.text,'Earlier version (v1): the improved version (v2) can’t be used (one of its built-in recordings is damaged: run the Setup again to repair the app).');
 let s=v.characters.summary('l4d').find(x=>x.id==='coach');assert.deepEqual([s.usable,s.damaged,s.version,s.versionCode],[true,true,1,'damaged']);assert.equal(v.characters.status().damaged,1);
 fs.rmSync(f(only2));r=v.voiceFor('l4d','coach');assert.equal(r.characterVersion,1);assert.match(r.versionNote.text,/one of its built-in recordings is missing: run the Setup again/);
 // Pinned to version 1 is still version 1 (as chosen), not the damage note.
 assert.equal(v.voiceFor('l4d','coach',{characterVersion:1}).versionNote.code,'pinned');
 // A clip both versions use: no version can speak, so the theme's own voice does, with the reason (never silently).
 const shared=c1.clips.find(x=>c2.clips.some(y=>y.sha256===x.sha256)),origS=fs.readFileSync(f(shared));fs.writeFileSync(f(shared),fakeFlac(9,shared.bytes));
 r=v.voiceFor('l4d','coach');assert.equal(r.name,'Bill');assert.equal(r.character,undefined);assert.deepEqual([r.fallback.character,r.fallback.name,r.fallback.code,r.fallback.builtIn],['coach','Coach','changed',true]);
 assert.match(r.fallback.reason,/^one of its built-in recordings is damaged: run the Setup again to repair the app$/);
 s=v.characters.summary('l4d').find(x=>x.id==='coach');assert.deepEqual([s.usable,s.damaged],[false,true]);
 const pick=v.list({characters:{l4d:'coach'}}).find(x=>x.theme==='l4d');assert.equal(pick.character,'coach','the pick is kept');assert.match(pick.characterProblem,/built-in recordings is damaged/);
 // Scout (one version): a damaged clip → the Administrator, with the reason. A link in place of a clip counts as damaged.
 const sf=builtinFile(scout,scout.versions[0].clips[0],b.bundle);fs.appendFileSync(sf,'x');r=v.voiceFor('tf2','scout');assert.equal(r.name,'The Administrator');assert.equal(r.fallback.code,'changed');
 if(process.platform!=='win32'){const p=builtinFile(scout,scout.versions[0].preview,b.bundle),o=fs.readFileSync(p),out=path.join(tmp(),'x.flac');fs.writeFileSync(out,o);fs.rmSync(p);fs.symlinkSync(out,p);
  assert.match(v.characters.previewFiles('tf2','scout').problem,/built-in recordings is damaged/);fs.rmSync(p);fs.writeFileSync(p,o);}
 // The packs repair them: only what's missing or damaged is copied (beside the app's clips), and both speak again.
 const pack=packOf(b.cat.characters),imp=await v.characters.import(pack.dir);
 assert.equal(imp.added,3,'the three missing or damaged clips');assert.equal(imp.already,pack.files.length-3,'the rest were already here: not copied');assert.deepEqual(imp.failed,[]);
 assert.equal(v.voiceFor('l4d','coach').characterVersion,2);assert.equal(v.voiceFor('l4d','coach').versionNote,null);assert.equal(v.voiceFor('tf2','scout').character,'scout');
 const st=v.characters.status();assert.equal(st.damaged,0);assert.equal(st.extra.clips,3);
 // Remove imported copies: the app's clips stay; the damage shows again.
 v.characters.remove();assert.equal(v.voiceFor('l4d','coach').fallback.builtIn,true);assert.ok(fs.existsSync(f(c1.clips[0])));
 // Imported again, then the app is repaired (Setup run again): the next start removes the now-duplicate copies.
 await v.characters.import(pack.dir);fs.writeFileSync(f(only2),orig2);fs.writeFileSync(f(shared),origS);fs.copyFileSync(builtinFile(scout,scout.versions[0].clips[0]),sf);
 const again=voicesBuiltin({...b,data});assert.deepEqual(again.v.characters.status().extra,{clips:0,bytes:0});assert.ok(!fs.existsSync(path.join(data,'characters','l4d','coach')));
 assert.ok(again.v.voiceFor('l4d','coach').refPath.every(x=>x.startsWith(b.bundle)));
});
const clipsOfAll=v=>[...v.clips,...(v.preview?[v.preview]:[])].map(x=>x.sha256);
test('v2.43 built in: a v2.42 (or v2.41) import keeps working; its copies of built-in clips are removed once the app\'s own copy checks out (nothing kept twice); cache keys and picks are unchanged',()=>{
 const data=tmp(),store=path.join(data,'characters'),coach=byId('l4d/coach'),haze=byId('deadlock/haze');
 // v2.42's layout: <sha>.flac and a format-2 record (both packs imported).
 const cdir=path.join(store,'l4d','coach');fs.mkdirSync(cdir,{recursive:true});for(const x of allClips(coach))fs.copyFileSync(builtinFile(coach,x),path.join(cdir,x.sha256+'.flac'));
 fs.writeFileSync(path.join(cdir,'character.json'),JSON.stringify({format:2,id:'l4d/coach',name:'Coach',catalogVersion:2,importedAt:1,updatedAt:2}));
 // v2.41's: ref-01.flac… preview-NN.flac and a format-1 record.
 const hdir=path.join(store,'deadlock','haze'),h1=versionsOf(haze)[0];fs.mkdirSync(hdir,{recursive:true});
 [...h1.clips,h1.preview].forEach((x,i)=>fs.copyFileSync(builtinFile(haze,x),path.join(hdir,(i<h1.clips.length?'ref-':'preview-')+String(i+1).padStart(2,'0')+'.flac')));
 fs.writeFileSync(path.join(hdir,'character.json'),JSON.stringify({format:1,id:'deadlock/haze',name:'Haze'}));
 // As v2.42 saw it (no built-in clips): the store speaks.
 const old=new Voices({builtinDir:path.join(TV,'voices'),dataDir:data,catalogFile:path.join(TV,'characters.json'),bundledDir:null});
 const oc=old.voiceFor('l4d','coach'),oh=old.voiceFor('deadlock','haze'),keys=[old.key(oc),old.key(oh)];assert.ok(oc.refPath.every(f=>f.startsWith(store))&&oh.refPath.every(f=>f.startsWith(store)));assert.equal(oc.characterVersion,2);
 // With the built-in clips (this version): the same voices, from the app's clips, the same cache keys; the copies are gone.
 const {v}=voicesBuiltin({data}),nc=v.voiceFor('l4d','coach'),nh=v.voiceFor('deadlock','haze');
 assert.equal(nc.characterVersion,2);assert.ok(nc.refPath.every(f=>f.startsWith(BUNDLE))&&nh.refPath.every(f=>f.startsWith(BUNDLE)));
 assert.deepEqual([v.key(nc),v.key(nh)],keys,'Coach and Haze keep their cached clips (keys are the clips\' SHA-256, not where they are)');
 assert.ok(!fs.existsSync(cdir)&&!fs.existsSync(hdir),'the store copies were the same as the app\'s: removed');
 assert.deepEqual(v.characters.status().extra,{clips:0,bytes:0});
 assert.equal(v.list({characters:{l4d:'coach',deadlock:'haze'}}).find(x=>x.theme==='l4d').character,'coach','picks are settings: kept');
 // Only identical copies of a checked built-in clip go: with the app's copy damaged, the import is kept and speaks.
 const b=builtinCopy(['l4d/coach']),d2=tmp(),c2=path.join(d2,'characters','l4d','coach');fs.cpSync(path.join(BUNDLE,'l4d','coach'),c2,{recursive:true});
 fs.writeFileSync(path.join(c2,'character.json'),JSON.stringify({format:2,id:'l4d/coach',name:'Coach'}));
 const x0=versionsOf(coach)[1].clips[0];fs.appendFileSync(builtinFile(coach,x0,b.bundle),'x');
 const w=voicesBuiltin({...b,data:d2}),wc=w.v.voiceFor('l4d','coach');assert.equal(wc.characterVersion,2);assert.equal(wc.versionNote,null);
 assert.ok(wc.refPath.includes(path.join(c2,x0.sha256+'.flac')),'the imported copy stands in for the damaged one');
 assert.deepEqual(fs.readdirSync(c2).sort(),['character.json',x0.sha256+'.flac'].sort(),'the other copies were duplicates: removed');
});
test('v2.43 built in: importing the packs again copies nothing (same SHA-256): no store folder, the same voices and cache keys (folder and ZIP made from the real clips)',async()=>{
 const {v,data}=voicesBuiltin(),ids=['tf2/scout','l4d/coach','deadlock/seven'],chars=ids.map(byId),pack=packOf(chars);
 const now=()=>ids.map(id=>{const [t,c]=id.split('/'),r=v.voiceFor(t,c);return [r.characterVersion,r.refPath,v.key(r)];}),before=now();
 let r=await v.characters.import(pack.dir);assert.deepEqual([r.added,r.already,r.bytes,r.failed.length],[0,pack.files.length,0,0]);assert.deepEqual(r.packs,[]);
 const zip=path.join(tmp(),'Robotic-Tyler-Character-Voice-Expansion.zip');fs.writeFileSync(zip,zipOf(pack.files,pack.top));
 r=await v.characters.import(zip);assert.deepEqual([r.added,r.already],[0,pack.files.length]);
 assert.ok(!fs.existsSync(path.join(data,'characters')),'nothing was written');assert.deepEqual(now(),before);
 r=await v.characters.import(tmp());assert.deepEqual([r.added,r.already],[0,0],'a folder without a pack: nothing found, nothing written');
});
test('v2.43 service (mocked worker): with no import, the character picked in Settings and "!say tf2/scout" speak from the app\'s clips; every offered character is listed for the panel and the phone',{skip:!python&&'needs python3'},async()=>{
 const {svc,dir}=fakeService(CATALOG,{bundledDir:BUNDLE}),sent=[];
 const orig=WorkerHost.prototype.request;WorkerHost.prototype.request=function(op,payload,o){if(op==='speak')sent.push(payload);return orig.call(this,op,payload,o);};
 try{
  await svc.saveSettings({characters:{l4d:'coach'}});
  const a=await svc.speak({text:'Coach here.',theme:'l4d'});assert.deepEqual([a.character,a.characterVersion,a.versionNote,a.fallback],['coach',2,null,null]);
  const req=sent.at(-1);assert.deepEqual(req.ref_audio,versionsOf(byId('l4d/coach'))[1].clips.map(x=>builtinFile(byId('l4d/coach'),x)));assert.equal(req.ref_text,versionsOf(byId('l4d/coach'))[1].transcript);
  const b=await svc.speak({text:'Batter up.',theme:'tf2',character:'scout'});assert.deepEqual([b.character,b.characterVersion,b.fallback],['scout',1,null]);assert.ok(sent.at(-1).ref_audio.every(f=>f.startsWith(BUNDLE)));
  const p=await svc.speak({text:'Mmph.',theme:'tf2',character:'pyro'});assert.equal(p.character,null);assert.equal(p.fallback.name,'Pyro');assert.match(p.fallback.reason,/Not offered yet/);
  const list=await svc.voiceList(),offered=list.flatMap(x=>(x.characters||[]).filter(c=>c.usable).map(c=>x.theme+'/'+c.id));assert.equal(offered.length,29);assert.ok(!offered.includes('tf2/pyro'));
  assert.equal(list.find(x=>x.theme==='l4d').character,'coach');
  assert.ok(!fs.existsSync(path.join(dir,'characters')),'nothing was imported or copied');
  svc.removeCharacters();assert.equal((await svc.speak({text:'Still Coach.',theme:'l4d'})).character,'coach','Remove imported copies leaves the built-in recordings');
 }finally{WorkerHost.prototype.request=orig;await svc.shutdown();}
});

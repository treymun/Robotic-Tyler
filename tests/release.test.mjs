// v2.8: what people download (tools/package-release.mjs) and the installer branding.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import crypto from 'node:crypto';
import os from 'node:os';
import {execFileSync} from 'node:child_process';
import {createRequire} from 'node:module';
const ROOT=path.resolve(import.meta.dirname,'..'),require=createRequire(import.meta.url);
const read=f=>fs.readFileSync(path.join(ROOT,f),'utf8');
const version=JSON.parse(read('browser-extension/manifest.json')).version;

function unzip(buf){ // central directory → {name: Buffer}
 const end=buf.lastIndexOf(Buffer.from([0x50,0x4b,0x05,0x06]));const count=buf.readUInt16LE(end+10);let p=buf.readUInt32LE(end+16);const out={};
 for(let i=0;i<count;i++){
  const method=buf.readUInt16LE(p+10),size=buf.readUInt32LE(p+20),nameLen=buf.readUInt16LE(p+28),extra=buf.readUInt16LE(p+30),comment=buf.readUInt16LE(p+32),local=buf.readUInt32LE(p+42);
  const name=buf.toString('utf8',p+46,p+46+nameLen);const start=local+30+buf.readUInt16LE(local+26)+buf.readUInt16LE(local+28);const data=buf.subarray(start,start+size);
  out[name]=method===8?zlib.inflateRawSync(data):data;p+=46+nameLen+extra+comment;
 }
 return out;
}

test('the Chrome download is one folder to load plus an install guide, with notes and checksums',()=>{
 execFileSync(process.execPath,[path.join(ROOT,'tools/package-release.mjs')],{cwd:ROOT,stdio:'pipe'});
 const dir=path.join(ROOT,'dist/release'),zipName=`ROBOTIC-TYLER-Chrome-Extension-${version}.zip`;
 const files=unzip(fs.readFileSync(path.join(dir,zipName))),names=Object.keys(files);
 const tops=[...new Set(names.map(n=>n.split('/')[0]))].sort();
 assert.deepEqual(tops,['How to install.html','ROBOTIC TYLER Chrome extension']);
 const folder='ROBOTIC TYLER Chrome extension/';
 assert.equal(files[folder+'manifest.json'].toString(),read('browser-extension/manifest.json'),'files unpack byte for byte');
 for(const f of ['icons/icon-128.png','ui/themes/portal.css','content.js'])assert.ok(names.includes(folder+f),f);
 const guide=files['How to install.html'].toString();
 assert.match(guide,/Load unpacked/);assert.match(guide,new RegExp('Version '+version.replace(/\./g,'\\.')));assert.match(guide,/<svg xmlns=/);
 const notes=fs.readFileSync(path.join(dir,'RELEASE-NOTES.md'),'utf8');
 assert.match(notes,/^## Download/);assert.ok(notes.includes(zipName));assert.match(notes,new RegExp("## What's new in "+version.replace(/\./g,'\\.')));
 assert.doesNotMatch(notes,/^# /m,'the release title comes from GitHub, not the notes');
 const sums=fs.readFileSync(path.join(dir,'SHA256SUMS.txt'),'utf8').trim().split('\n').map(l=>l.split('  '));
 // Names as they appear on the release page; the app installers sit in components/ locally.
 for(const [hash,file] of sums){const f=fs.existsSync(path.join(dir,file))?path.join(dir,file):path.join(dir,'components',file);
  assert.equal(crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex'),hash,file);}
});

test('the desktop installer is a branded, NSIS-only "component" file that upgrades the Control Center',()=>{
 const bmp=f=>{const b=fs.readFileSync(path.join(ROOT,f));assert.equal(b.toString('ascii',0,2),'BM',f);return [b.readInt32LE(18),Math.abs(b.readInt32LE(22)),b.readUInt16LE(28)];};
 const seen={};
 for(const [file,slug] of [['electron-builder.desktop.json','Desktop']]){
  const cfg=JSON.parse(read(file)),n=cfg.nsis;
  assert.equal(n.artifactName,`ROBOTIC-TYLER-component-${slug}-\${version}.\${ext}`);
  assert.deepEqual(cfg.win.target,[{target:'nsis',arch:['x64']}],'no portable build: one setup, apps that update themselves');
  assert.equal(cfg.portable,undefined);
  assert.equal(n.oneClick,false);assert.equal(n.perMachine,false);assert.equal(n.menuCategory,'ROBOTIC TYLER');assert.equal(n.runAfterFinish,true);assert.equal(n.deleteAppDataOnUninstall,false);
  for(const k of ['installerIcon','uninstallerIcon','installerHeaderIcon'])assert.equal(n[k],'assets/robotic-tyler.ico');
  assert.deepEqual(bmp(n.installerSidebar),[164,314,24]);assert.deepEqual(bmp(n.installerHeader),[150,57,24]);
  assert.equal(cfg.directories.buildResources,'build');assert.ok(cfg.files.includes('assets/**/*'));
  // Same app id and update channel as the Control Center, so its installs upgrade in place;
  // one product name, shortcut and uninstall entry; the audio helper ships inside.
  assert.equal(cfg.appId,'com.robotictyler.controlcenter');assert.equal(cfg.publish[0].channel,'control');
  assert.equal(cfg.productName,'ROBOTIC TYLER');assert.equal(n.shortcutName,'ROBOTIC TYLER');assert.equal(n.uninstallDisplayName,'ROBOTIC TYLER');
  assert.ok(cfg.files.includes('voice-app/**/*')&&cfg.files.includes('app/**/*'));assert.ok(cfg.extraResources.some(x=>x.from==='windows-audio-bridge/publish'));
  assert.equal(cfg.extraMetadata.main,'app/main.cjs');void seen;
 }
 const pkg=JSON.parse(read('package.json'));assert.equal(pkg.build,undefined,'one desktop config, in electron-builder.desktop.json');
 assert.equal(pkg.scripts['package:release'],'node tools/package-release.mjs');
 assert.equal(pkg.scripts['build:setup'],'node tools/setup/build-setup.mjs');
 assert.match(pkg.scripts['build:win'],/build:desktop.*build:setup/);
 for(const k of ['build:desktop','release'])assert.doesNotMatch(pkg.scripts[k],/portable/,k);
 for(const k of ['build:control','build:voice','build:both','start:voice'])assert.equal(pkg.scripts[k],undefined,k+' retired');
});

test('the release notes lead with the one Setup download and the CI publishes it',()=>{
 const notes=fs.readFileSync(path.join(ROOT,'dist/release/RELEASE-NOTES.md'),'utf8');
 const head=notes.split("## What's new")[0];
 const setup=`ROBOTIC-TYLER-Setup-${version}.exe`;
 if(fs.existsSync(path.join(ROOT,'dist/release',setup))){
  assert.match(head,new RegExp('### ⬇️ \\['+setup.replace(/\./g,'\\.')+'\\]\\(https://github\\.com/[^/]+/[^/]+/releases/download/v'+version.replace(/\./g,'\\.')+'/'));
  assert.match(head,/only file you need on Windows/);assert.match(head,/Chrome extension/);
 }
 assert.ok(head.includes(`ROBOTIC-TYLER-Chrome-Extension-${version}.zip`),'the zip is offered for other systems');
 assert.doesNotMatch(head,/Portable/);
 const ci=read('.github/workflows/ci.yml');
 assert.match(ci,/npm run build:setup/);assert.match(ci,/gh release upload "\$TAG" dist\/release\/ROBOTIC-TYLER-Setup-\*\.exe/);
 assert.match(ci,/workflow_dispatch:\n    inputs:\n      publish:/,'Run workflow can publish');
 assert.match(ci,/Release tag, and leave an already-published release alone/,'a published release is never rebuilt');
 assert.ok(ci.indexOf('npm run release')<ci.indexOf('npm run build:setup'),'the setup is built after the app installers it records');
});

// v2.43: the character voices' recordings ship with the desktop app. The voice worker is a separate Python
// process and can't read inside app.asar, so they're unpacked beside it (asarUnpack), exactly like the 25
// theme voices' references and the worker itself, and the app reads them from app.asar.unpacked.
// (A real Linux "--dir" package of this config was also built and checked by hand: see the release notes.)
test('the desktop app ships the character voices\' recordings unpacked from app.asar, where the Python voice worker reads them',()=>{
 const cfg=JSON.parse(read('electron-builder.desktop.json'));
 assert.ok(cfg.files.includes('app/**/*'));assert.equal(cfg.asar,true);
 for(const g of ['app/theme-voices/worker/**/*','app/theme-voices/voices/**/*','app/theme-voices/characters/**/*'])assert.ok(cfg.asarUnpack.includes(g),g);
 const cat=JSON.parse(read('app/theme-voices/characters.json'));assert.deepEqual(Object.keys(cat.packs).filter(k=>cat.packs[k].builtIn===true).sort(),['expansion','supplement']);
 const rels=new Map();for(const c of cat.characters)for(const v of c.versions)for(const x of [...v.clips,...(v.preview?[v.preview]:[])])rels.set('app/theme-voices/characters/'+c.theme+'/'+c.id+'/'+x.sha256+'.flac',x);
 assert.equal(rels.size,196);let bytes=0;
 for(const [rel,x] of rels){const b=fs.readFileSync(path.join(ROOT,rel));assert.equal(b.length,x.bytes,rel);assert.equal(crypto.createHash('sha256').update(b).digest('hex'),x.sha256,rel);bytes+=b.length;
  // Packed (files), not excluded by a "!" pattern, and unpacked (asarUnpack): the same globs electron-builder applies.
  if(path.matchesGlob){assert.ok(cfg.files.some(g=>!g.startsWith('!')&&path.matchesGlob(rel,g)),rel);assert.ok(!cfg.files.some(g=>g.startsWith('!')&&path.matchesGlob(rel,g.slice(1))),rel+' is excluded');assert.ok(cfg.asarUnpack.some(g=>path.matchesGlob(rel,g)),rel+' stays in app.asar');}}
 assert.ok(bytes<15.5e6,'the installer grows by about 15 MB of FLAC ('+(bytes/1e6).toFixed(1)+' MB)');
 assert.match(read('.gitattributes'),/^\*\.flac binary$/m,'checked out byte for byte (their SHA-256 is checked before use)');
 // In the installed app, desktop.cjs points the service at app.asar.unpacked: the clips, the voices and the worker.
 const {setupThemeVoices}=require(path.join(ROOT,'app','theme-voices','desktop.cjs'));
 const res=path.join(fs.mkdtempSync(path.join(os.tmpdir(),'tyler-pack-')),'resources'),dir=path.join(res,'app.asar','app');
 const r=setupThemeVoices({root:path.join(res,'..','data'),dir,vault:{get:async k=>({[k]:undefined})},local:{set:async()=>{}},changeListeners:[],net:{fetch:async()=>{throw Error('offline');}},shell:{},log:()=>{},send:()=>{}});
 const un=path.join(res,'app.asar.unpacked','app','theme-voices');
 assert.equal(r.service.voices.characters.bundled,path.join(un,'characters'));assert.equal(r.service.voices.builtinDir,path.join(un,'voices'));assert.equal(r.service.installer.workerDir,path.join(un,'worker'));
});

#!/usr/bin/env node
// Builds ROBOTIC-TYLER-Setup-<version>.exe, the one Windows download.
//
// The setup is a native Windows program (tools/setup/setup.c, plain Win32 + WinHTTP, no
// runtime to install). It carries the Chrome extension inside it and unpacks it to a fixed
// folder. It installs the desktop app by downloading its own installer (the "component"
// file electron-builder makes, which the app also uses for its automatic updates) from this
// version's GitHub release, checking it against the SHA-256 recorded here, and running it silently.
//
// Run after the desktop installer is built (npm run build:desktop, or the CI release job):
//   node tools/setup/build-setup.mjs [--base-url <url>] [--out <dir>]
//
//   --base-url  download from somewhere else (a mirror, or a local test server). Default:
//               https://github.com/<owner>/<repo>/releases/download/v<version>/ from the
//               electron-builder publish settings (tools/set-release-repo.mjs sets them).
//   --out       where to put the setup (default dist/setup).
//
// Needs MinGW-w64: x86_64-w64-mingw32-gcc / -windres (Linux, macOS) or gcc / windres on
// PATH (Windows: winget install BrechtSanders.WinLibs.POSIX.UCRT, or choco install mingw).
// Override with the CC and WINDRES environment variables.
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import crypto from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {nsisGuid} from './nsis-guid.mjs';

const HERE=path.dirname(fileURLToPath(import.meta.url));
const ROOT=path.resolve(HERE,'..','..');
const read=f=>fs.readFileSync(path.join(ROOT,f),'utf8');
const json=f=>JSON.parse(read(f));
const args=process.argv.slice(2);
const opt=name=>{const i=args.indexOf(name);return i>=0?args[i+1]:null;};
const PLACEHOLDER='YOUR_GITHUB_NAME';

const version=json('package.json').version;
if(json('browser-extension/manifest.json').version!==version)throw Error('package.json and the Chrome manifest disagree on the version');
if(!/^\d+\.\d+\.\d+$/.test(version))throw Error('Setup needs a plain x.y.z version, got '+version);

// ── What the setup installs ───────────────────────────────────────────────────
// Everything that ties the setup to a component comes from that component's own
// electron-builder config, so names, registry keys and file names can't drift apart.
const expand=(s,c)=>s.replace(/\$\{version\}/g,version).replace(/\$\{ext\}/g,'exe').replace(/\$\{productName\}/g,c.productName);
function component(key,configFile){
 const c=json(configFile);
 const file=expand(c.nsis.artifactName,c);
 const local=path.join(ROOT,c.directories.output,file);
 if(!fs.existsSync(local))throw Error(`Missing ${path.relative(ROOT,local)}. Build the desktop installer first (npm run build:desktop).`);
 const data=fs.readFileSync(local);
 return {key,file,local,size:data.length,sha256:crypto.createHash('sha256').update(data).digest('hex'),
  guid:nsisGuid(c.appId),displayName:c.nsis.uninstallDisplayName||c.productName,exe:c.productName+'.exe',publish:c.publish?.[0]};
}
const desktop=component('desktop','electron-builder.desktop.json');
for(const c of [desktop])if(!/^[A-Za-z0-9._-]+$/.test(c.file))throw Error('Unexpected file name '+c.file);

const pub=desktop.publish||{};
const configured=pub.owner&&pub.owner!==PLACEHOLDER&&pub.repo;
const releasePage=configured?`https://github.com/${pub.owner}/${pub.repo}/releases/tag/v${version}`:'';
let base=opt('--base-url')||(configured?`https://github.com/${pub.owner}/${pub.repo}/releases/download/v${version}/`:'');
if(base&&!base.endsWith('/'))base+='/';
if(base&&!/^https?:\/\/[^\s"\\]+$/.test(base))throw Error('Bad --base-url '+base);
if(!base)console.warn(`warning: no release repository configured (publish owner is ${PLACEHOLDER}). This setup can only install from component files placed next to it. Run node tools/set-release-repo.mjs <owner>/<repo> first.`);

// ── Generated build inputs ────────────────────────────────────────────────────
const OUT=path.resolve(ROOT,opt('--out')||'dist/setup');
const WORK=path.join(ROOT,'dist','setup-build');
fs.rmSync(WORK,{recursive:true,force:true});fs.mkdirSync(WORK,{recursive:true});fs.mkdirSync(OUT,{recursive:true});
const cstr=s=>'L"'+String(s).replace(/\\/g,'\\\\').replace(/"/g,'\\"')+'"';
const comp=(c,P)=>[`#define ${P}_FILE ${cstr(c.file)}`,`#define ${P}_SIZE ${c.size}ULL`,`#define ${P}_SHA256 "${c.sha256}"`,
 `#define ${P}_GUID ${cstr(c.guid)}`,`#define ${P}_DISPLAY ${cstr(c.displayName)}`,`#define ${P}_EXE ${cstr(c.exe)}`].join('\n');
// The Chrome extension goes inside the setup (resource 200): "RTPK1\0\0\0", u32 count, then
// per file u16 path length, UTF-8 path, u32 size, bytes. Setup unpacks it to a fixed folder.
function packExtension(dir){
 const files=[];
 const walk=(d,rel='')=>{for(const e of fs.readdirSync(d,{withFileTypes:true}).sort((a,b)=>a.name.localeCompare(b.name))){
  if(e.name.startsWith('.')||e.name==='Thumbs.db')continue;const r=rel+e.name;
  if(e.isDirectory())walk(path.join(d,e.name),r+'/');else files.push([r,fs.readFileSync(path.join(d,e.name))]);}};
 walk(dir);
 const parts=[Buffer.from('RTPK1\0\0\0','latin1'),Buffer.alloc(4)];parts[1].writeUInt32LE(files.length);
 for(const [rel,data] of files){const name=Buffer.from(rel,'utf8');if(name.length>=400||/\.\.|:|\\/.test(rel))throw Error('Unexpected extension path '+rel);
  const h=Buffer.alloc(2);h.writeUInt16LE(name.length);const z=Buffer.alloc(4);z.writeUInt32LE(data.length);parts.push(h,name,z,data);}
 return {pack:Buffer.concat(parts),count:files.length};
}
const ext=packExtension(path.join(ROOT,'browser-extension'));
fs.writeFileSync(path.join(WORK,'chrome-extension.pack'),ext.pack);
fs.writeFileSync(path.join(WORK,'payloads.h'),`// GENERATED by tools/setup/build-setup.mjs. Do not edit.
#define CHROME_PACK_SIZE ${ext.pack.length}ULL
#define SETUP_VERSION ${cstr(version)}
#define DOWNLOAD_BASE ${cstr(base)}
#define RELEASE_PAGE ${cstr(releasePage)}
${comp(desktop,'DESKTOP')}
`);

// Logo: the Steam-theme Tyler logo, premultiplied BGRA at the sizes the header uses
// (64 px at 100 %, up to 128 px at 200 %), so the setup needs no image decoder.
function decodePng(file){
 const b=fs.readFileSync(file);let p=8,w=0,h=0,type=0;const idat=[];
 while(p<b.length){const len=b.readUInt32BE(p),t=b.toString('ascii',p+4,p+8),d=b.subarray(p+8,p+8+len);p+=12+len;
  if(t==='IHDR'){w=d.readUInt32BE(0);h=d.readUInt32BE(4);if(d[8]!==8||d[12]!==0)throw Error('8-bit non-interlaced PNG expected');type=d[9];}
  else if(t==='IDAT')idat.push(d);else if(t==='IEND')break;}
 const ch={6:4,2:3}[type];if(!ch)throw Error('RGB or RGBA PNG expected');
 const raw=zlib.inflateSync(Buffer.concat(idat)),stride=w*ch,out=Buffer.alloc(w*h*4);let prev=Buffer.alloc(stride);
 for(let y=0;y<h;y++){const f=raw[y*(stride+1)],line=Buffer.from(raw.subarray(y*(stride+1)+1,(y+1)*(stride+1)));
  for(let x=0;x<stride;x++){const a=x>=ch?line[x-ch]:0,up=prev[x],c=x>=ch?prev[x-ch]:0;
   const pr=()=>{const q=a+up-c,pa=Math.abs(q-a),pb=Math.abs(q-up),pc=Math.abs(q-c);return pa<=pb&&pa<=pc?a:pb<=pc?up:c;};
   line[x]=(line[x]+(f===1?a:f===2?up:f===3?((a+up)>>1):f===4?pr():0))&255;}
  for(let x=0;x<w;x++){const o=(y*w+x)*4;out[o]=line[x*ch];out[o+1]=line[x*ch+1];out[o+2]=line[x*ch+2];out[o+3]=ch===4?line[x*ch+3]:255;}
  prev=line;}
 return {w,h,rgba:out};
}
function resize({w,h,rgba},size){ // area-average in premultiplied space
 const out=Buffer.alloc(size*size*4),sx=w/size,sy=h/size;
 for(let y=0;y<size;y++)for(let x=0;x<size;x++){let r=0,g=0,bl=0,a=0,n=0;
  for(let v=Math.floor(y*sy);v<Math.ceil((y+1)*sy);v++)for(let u=Math.floor(x*sx);u<Math.ceil((x+1)*sx);u++){const o=(v*w+u)*4,al=rgba[o+3]/255;r+=rgba[o]*al;g+=rgba[o+1]*al;bl+=rgba[o+2]*al;a+=rgba[o+3];n++;}
  const o=(y*size+x)*4;out[o]=Math.round(bl/n);out[o+1]=Math.round(g/n);out[o+2]=Math.round(r/n);out[o+3]=Math.round(a/n);} // BGRA, premultiplied
 return out;
}
const logo=decodePng(path.join(ROOT,'browser-extension/ui/logos/steam.png'));
const SIZES=[64,80,96,128];
for(const s of SIZES)fs.writeFileSync(path.join(WORK,`logo-${s}.bgra`),resize(logo,s));
fs.copyFileSync(path.join(ROOT,'assets/robotic-tyler.ico'),path.join(WORK,'robotic-tyler.ico'));
fs.copyFileSync(path.join(HERE,'setup.c'),path.join(WORK,'setup.c'));

const [maj,min,pat]=version.split('.').map(Number);
fs.writeFileSync(path.join(WORK,'setup.manifest'),`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<assembly xmlns="urn:schemas-microsoft-com:asm.v1" manifestVersion="1.0">
  <assemblyIdentity type="win32" name="RoboticTyler.Setup" version="${maj}.${min}.${pat}.0" processorArchitecture="amd64"/>
  <description>ROBOTIC TYLER Setup</description>
  <trustInfo xmlns="urn:schemas-microsoft-com:asm.v3"><security><requestedPrivileges>
    <requestedExecutionLevel level="asInvoker" uiAccess="false"/>
  </requestedPrivileges></security></trustInfo>
  <compatibility xmlns="urn:schemas-microsoft-com:compatibility.v1"><application>
    <supportedOS Id="{8e0f7a12-bfb3-4fe8-b9a5-48fd50a15a9a}"/>
    <supportedOS Id="{1f676c76-80e1-4239-95bb-83d0f6d0da78}"/>
    <supportedOS Id="{4a2f28e3-53b9-4441-ba9c-d69d4a4a6e38}"/>
  </application></compatibility>
  <application xmlns="urn:schemas-microsoft-com:asm.v3"><windowsSettings>
    <dpiAware xmlns="http://schemas.microsoft.com/SMI/2005/WindowsSettings">true/pm</dpiAware>
    <dpiAwareness xmlns="http://schemas.microsoft.com/SMI/2016/WindowsSettings">PerMonitorV2, PerMonitor</dpiAwareness>
  </windowsSettings></application>
  <dependency><dependentAssembly>
    <assemblyIdentity type="win32" name="Microsoft.Windows.Common-Controls" version="6.0.0.0" processorArchitecture="*" publicKeyToken="6595b64144ccf1df" language="*"/>
  </dependentAssembly></dependency>
</assembly>
`);
const vs=s=>'"'+s.replace(/"/g,'""')+'\\0"';
fs.writeFileSync(path.join(WORK,'setup.rc'),`#include <windows.h>
1 ICON "robotic-tyler.ico"
1 RT_MANIFEST "setup.manifest"
${SIZES.map(s=>`${s} RCDATA "logo-${s}.bgra"`).join('\n')}
200 RCDATA "chrome-extension.pack"
VS_VERSION_INFO VERSIONINFO
FILEVERSION ${maj},${min},${pat},0
PRODUCTVERSION ${maj},${min},${pat},0
FILEOS VOS_NT_WINDOWS32
FILETYPE VFT_APP
BEGIN
 BLOCK "StringFileInfo"
 BEGIN
  BLOCK "040904B0"
  BEGIN
   VALUE "CompanyName", ${vs('ROBOTIC TYLER (unofficial fan project)')}
   VALUE "FileDescription", ${vs('ROBOTIC TYLER Setup')}
   VALUE "FileVersion", ${vs(version)}
   VALUE "InternalName", ${vs('ROBOTIC-TYLER-Setup')}
   VALUE "LegalCopyright", ${vs('© 2026 ROBOTIC TYLER. Not affiliated with or endorsed by Valve.')}
   VALUE "OriginalFilename", ${vs(`ROBOTIC-TYLER-Setup-${version}.exe`)}
   VALUE "ProductName", ${vs('ROBOTIC TYLER')}
   VALUE "ProductVersion", ${vs(version)}
  END
 END
 BLOCK "VarFileInfo"
 BEGIN
  VALUE "Translation", 0x409, 1200
 END
END
`);

// ── Compile ───────────────────────────────────────────────────────────────────
const has=cmd=>{try{execFileSync(cmd,['--version'],{stdio:'ignore'});return true;}catch{return false;}};
const pick=(env,list)=>process.env[env]||list.find(has);
const cc=pick('CC',['x86_64-w64-mingw32-gcc','gcc']),windres=pick('WINDRES',['x86_64-w64-mingw32-windres','windres']);
if(!cc||!windres)throw Error('MinGW-w64 not found. Install it (Windows: winget install BrechtSanders.WinLibs.POSIX.UCRT; Ubuntu: apt install gcc-mingw-w64-x86-64) or set CC and WINDRES.');
const exe=path.join(OUT,`ROBOTIC-TYLER-Setup-${version}.exe`);
const run=(cmd,a)=>execFileSync(cmd,a,{cwd:WORK,stdio:'inherit'});
run(windres,['-O','coff','-i','setup.rc','-o','setup-res.o']);
run(cc,['-std=c11','-O2','-Wall','-Wno-unused-function','-Wno-misleading-indentation','-municode','-mwindows','-static','-s','-I.','setup.c','setup-res.o','-o',exe,
 '-lwinhttp','-lbcrypt','-lcomctl32','-lmsimg32','-lshell32','-lgdi32','-luser32','-ladvapi32','-lole32','-luuid']);
const hash=crypto.createHash('sha256').update(fs.readFileSync(exe)).digest('hex');
console.log(`Built ${path.relative(ROOT,exe)} (${(fs.statSync(exe).size/1024).toFixed(0)} KB, sha256 ${hash})
  downloads from: ${base||'(nowhere: component files next to the setup only)'}
  Chrome extension:        ${ext.count} files inside the setup  ${(ext.pack.length/1048576).toFixed(1)} MB
  Desktop app:  ${desktop.file}  ${(desktop.size/1048576).toFixed(1)} MB  ${desktop.sha256}`);

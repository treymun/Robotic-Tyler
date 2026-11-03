#!/usr/bin/env node
// Builds the WebView2 voice test (prototype) into two zips in dist/webview2-voice-test/:
//   …-win-x64.zip        self-contained: one exe, nothing else to install (about 70 MB)
//   …-win-x64-small.zip  needs the .NET 8 Desktop Runtime (Windows offers to download it)
// Each zip also carries web/ (the test panel and page scripts) and tyler-extension/ (a copy of
// browser-extension/, used by Stage 2). Not part of the production build, installers or CI.
// Needs the .NET 8 SDK (on Linux, Microsoft's SDK, which includes the Windows Desktop targets):
//   node tools/webview2-voice-test/package.mjs          (set DOTNET=/path/to/dotnet if needed)
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

const HERE=path.dirname(fileURLToPath(import.meta.url)),ROOT=path.resolve(HERE,'..','..');
const OUT=path.join(ROOT,'dist','webview2-voice-test'),ART=path.join(OUT,'artifacts');
const DOTNET=process.env.DOTNET||'dotnet';
const VERSION=/<Version>([^<]+)<\/Version>/.exec(fs.readFileSync(path.join(HERE,'WebView2VoiceTest.csproj'),'utf8'))[1];
const NAME='RoboticTyler-WebView2-VoiceTest-'+VERSION+'-win-x64';
fs.rmSync(OUT,{recursive:true,force:true});fs.mkdirSync(OUT,{recursive:true});

function publish(dir,args){
 execFileSync(DOTNET,['publish',path.join(HERE,'WebView2VoiceTest.csproj'),'-c','Release','-r','win-x64','-p:DebugType=none','--artifacts-path',ART,'-o',dir,...args],{stdio:'inherit',env:{...process.env,DOTNET_CLI_TELEMETRY_OPTOUT:'1'}});
 for(const f of fs.readdirSync(dir))if(f.endsWith('.xml'))fs.rmSync(path.join(dir,f));
 fs.cpSync(path.join(ROOT,'browser-extension'),path.join(dir,'tyler-extension'),{recursive:true});
 fs.copyFileSync(path.join(HERE,'README.md'),path.join(dir,'README.md'));
}
const full=path.join(OUT,'full'),small=path.join(OUT,'small');
publish(full,['--self-contained','true','-p:PublishSingleFile=true','-p:EnableCompressionInSingleFile=true','-p:IncludeNativeLibrariesForSelfExtract=true']);
publish(small,['--self-contained','false']);

// Minimal ZIP writer (deflate, UTF-8 names), as in tools/package-release.mjs.
const crc32=buf=>{if(zlib.crc32)return zlib.crc32(buf)>>>0;let c=0xffffffff;for(const b of buf){c^=b;for(let k=0;k<8;k++)c=c&1?0xedb88320^(c>>>1):c>>>1;}return (c^0xffffffff)>>>0;};
function zip(entries){
 const local=[],central=[];let offset=0;const d=new Date(),time=(d.getHours()<<11)|(d.getMinutes()<<5)|(d.getSeconds()>>1),date=((d.getFullYear()-1980)<<9)|((d.getMonth()+1)<<5)|d.getDate();
 for(const e of entries){
  const name=Buffer.from(e.name,'utf8'),dir=e.name.endsWith('/'),raw=dir?Buffer.alloc(0):e.data,packed=dir?raw:zlib.deflateRawSync(raw,{level:9}),method=dir?0:8,crc=dir?0:crc32(raw);
  const h=Buffer.alloc(30);h.writeUInt32LE(0x04034b50,0);h.writeUInt16LE(20,4);h.writeUInt16LE(0x0800,6);h.writeUInt16LE(method,8);h.writeUInt16LE(time,10);h.writeUInt16LE(date,12);h.writeUInt32LE(crc,14);h.writeUInt32LE(packed.length,18);h.writeUInt32LE(raw.length,22);h.writeUInt16LE(name.length,26);
  local.push(h,name,packed);
  const c=Buffer.alloc(46);c.writeUInt32LE(0x02014b50,0);c.writeUInt16LE(0x0314,4);c.writeUInt16LE(20,6);c.writeUInt16LE(0x0800,8);c.writeUInt16LE(method,10);c.writeUInt16LE(time,12);c.writeUInt16LE(date,14);c.writeUInt32LE(crc,16);c.writeUInt32LE(packed.length,20);c.writeUInt32LE(raw.length,24);c.writeUInt16LE(name.length,28);
  c.writeUInt32LE(dir?((0o40755<<16)|0x10)>>>0:(0o100644<<16)>>>0,38);c.writeUInt32LE(offset,42);central.push(c,name);offset+=30+name.length+packed.length;
 }
 const size=central.reduce((n,b)=>n+b.length,0),end=Buffer.alloc(22);end.writeUInt32LE(0x06054b50,0);end.writeUInt16LE(entries.length,8);end.writeUInt16LE(entries.length,10);end.writeUInt32LE(size,12);end.writeUInt32LE(offset,16);
 return Buffer.concat([...local,...central,end]);
}
const walk=(dir,base='')=>fs.readdirSync(dir,{withFileTypes:true}).sort((a,b)=>a.name.localeCompare(b.name)).flatMap(e=>e.isDirectory()?[{name:base+e.name+'/'},...walk(path.join(dir,e.name),base+e.name+'/')]:[{name:base+e.name,data:fs.readFileSync(path.join(dir,e.name))}]);
for(const [dir,suffix] of [[full,''],[small,'-small']]){
 const top=NAME+suffix+'/',file=path.join(OUT,NAME+suffix+'.zip');
 fs.writeFileSync(file,zip([{name:top},...walk(dir).map(e=>({...e,name:top+e.name}))]));
 console.log('wrote',path.relative(ROOT,file),(fs.statSync(file).size/1048576).toFixed(1)+' MB');
}
fs.rmSync(ART,{recursive:true,force:true});

#!/usr/bin/env node
// Assembles what people download into dist/release/. There are two downloads:
//
//   ROBOTIC-TYLER-Chrome-Extension-<version>.zip
//       ROBOTIC TYLER Chrome extension/   ← the folder to "Load unpacked"
//       How to install.html               ← one-page guide with the logo
//   ROBOTIC-TYLER-Setup-<version>.exe     ← Windows: installs the desktop app (Steam text
//                                           chat and voice) and/or this extension (if built)
//
// plus, for the GitHub release (not for people to pick):
//   components/ROBOTIC-TYLER-component-Desktop-<version>.exe  ← the desktop app's own installer;
//       the setup downloads it and the installed app updates from it (if built)
//   RELEASE-NOTES.md   ← GitHub release text: which file to pick + what's new
//   SHA256SUMS.txt
//
// Usage: node tools/package-release.mjs      (after node tools/build.mjs; the Windows
// files come from npm run build:win or the CI release job)
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';

const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const EXT=path.join(ROOT,'browser-extension');
const OUT=path.join(ROOT,'dist','release');
const read=f=>fs.readFileSync(path.join(ROOT,f),'utf8');
const version=JSON.parse(read('browser-extension/manifest.json')).version;
const PUB=JSON.parse(read('electron-builder.desktop.json')).publish?.[0]||{},OWNER_REPO=`${PUB.owner}/${PUB.repo}`;
const pkgVersion=JSON.parse(read('package.json')).version;
if(version!==pkgVersion)throw Error(`Version mismatch: manifest ${version}, package.json ${pkgVersion}`);
const esc=s=>String(s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));

// ── Minimal ZIP writer (deflate, UTF-8 names) so this runs on any OS without zip tools ──
const CRC=(()=>{const t=new Uint32Array(256);for(let n=0;n<256;n++){let c=n;for(let k=0;k<8;k++)c=c&1?0xedb88320^(c>>>1):c>>>1;t[n]=c>>>0;}return t;})();
const crc32=buf=>{if(zlib.crc32)return zlib.crc32(buf)>>>0;let c=0xffffffff;for(const b of buf)c=CRC[(c^b)&0xff]^(c>>>8);return (c^0xffffffff)>>>0;};
function zip(entries){ // entries: [{name, data: Buffer}] in order; directories end with "/"
 const local=[],central=[];let offset=0;
 const d=new Date(),time=(d.getHours()<<11)|(d.getMinutes()<<5)|(d.getSeconds()>>1),date=((d.getFullYear()-1980)<<9)|((d.getMonth()+1)<<5)|d.getDate();
 for(const e of entries){
  const name=Buffer.from(e.name,'utf8'),dir=e.name.endsWith('/'),raw=dir?Buffer.alloc(0):e.data;
  const packed=dir?raw:zlib.deflateRawSync(raw,{level:9}),method=dir?0:8,crc=dir?0:crc32(raw);
  const h=Buffer.alloc(30);h.writeUInt32LE(0x04034b50,0);h.writeUInt16LE(20,4);h.writeUInt16LE(0x0800,6);h.writeUInt16LE(method,8);
  h.writeUInt16LE(time,10);h.writeUInt16LE(date,12);h.writeUInt32LE(crc,14);h.writeUInt32LE(packed.length,18);h.writeUInt32LE(raw.length,22);h.writeUInt16LE(name.length,26);
  local.push(h,name,packed);
  const c=Buffer.alloc(46);c.writeUInt32LE(0x02014b50,0);c.writeUInt16LE(0x0314,4);c.writeUInt16LE(20,6);c.writeUInt16LE(0x0800,8);c.writeUInt16LE(method,10);
  c.writeUInt16LE(time,12);c.writeUInt16LE(date,14);c.writeUInt32LE(crc,16);c.writeUInt32LE(packed.length,20);c.writeUInt32LE(raw.length,24);c.writeUInt16LE(name.length,28);
  c.writeUInt32LE(dir?(0o40755<<16)|0x10:(0o100644<<16)>>>0,38);c.writeUInt32LE(offset,42);central.push(c,name);
  offset+=30+name.length+packed.length;
 }
 const size=central.reduce((n,b)=>n+b.length,0),end=Buffer.alloc(22);
 end.writeUInt32LE(0x06054b50,0);end.writeUInt16LE(entries.length,8);end.writeUInt16LE(entries.length,10);end.writeUInt32LE(size,12);end.writeUInt32LE(offset,16);
 return Buffer.concat([...local,...central,end]);
}
function walk(dir,base=''){
 return fs.readdirSync(dir,{withFileTypes:true}).filter(e=>!e.name.startsWith('.')&&e.name!=='Thumbs.db').sort((a,b)=>a.name.localeCompare(b.name))
  .flatMap(e=>e.isDirectory()?[{rel:base+e.name+'/'},...walk(path.join(dir,e.name),base+e.name+'/')]:[{rel:base+e.name,file:path.join(dir,e.name)}]);
}

// ── The one-page install guide ─────────────────────────────────────────────
const FOLDER='ROBOTIC TYLER Chrome extension';
function guide(){
 const logo=read('browser-extension/ui/logo-mark.svg').trim();
 const step=(n,title,body)=>`<li><span class="n">${n}</span><div><b>${title}</b><p>${body}</p></div></li>`;
 return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Install ROBOTIC TYLER ${esc(version)}</title>
<style>
:root{color-scheme:dark;--bg:#1b2838;--bar:#171a21;--block:rgba(0,0,0,.22);--ink:#c7d5e0;--ink3:#8f98a0;--strong:#fff;--link:#66c0f4;--blue:#1a9fff;--line:#2a3f5a}
*{box-sizing:border-box}html,body{margin:0}body{background:var(--bg) linear-gradient(180deg,#1f3247 0,var(--bg) 360px) no-repeat;color:var(--ink);font:15px/1.55 "Motiva Sans",Arial,Helvetica,sans-serif}
main{max-width:760px;margin:0 auto;padding:40px 22px 60px}
header{display:flex;align-items:center;gap:16px;margin-bottom:28px}header svg{width:64px;height:64px;border-radius:6px;flex-shrink:0}
h1{margin:0;font-weight:300;font-size:30px;letter-spacing:.02em;color:var(--strong);text-transform:uppercase}header p{margin:2px 0 0;color:var(--ink3)}
h2{font-weight:400;font-size:16px;letter-spacing:.06em;text-transform:uppercase;color:var(--strong);margin:30px 0 10px}
.card{background:var(--block);border-radius:4px;padding:18px 20px;margin:10px 0}
ol{list-style:none;margin:0;padding:0}li{display:flex;gap:14px;padding:12px 0;border-top:1px solid var(--line)}li:first-child{border-top:0;padding-top:2px}
.n{width:26px;height:26px;flex-shrink:0;display:grid;place-items:center;border-radius:3px;font-weight:700;font-size:13px;color:#fff;background:linear-gradient(-60deg,#417a9b 5%,#67c1f5 95%)}
li b{color:var(--strong);font-weight:400;font-size:16px}li p{margin:2px 0 0;color:var(--ink3)}
code{font:13px "Lucida Console",Monaco,monospace;color:var(--link);background:rgba(0,0,0,.3);padding:1px 6px;border-radius:2px}
table{width:100%;border-collapse:collapse}td{padding:10px 0;border-top:1px solid var(--line);vertical-align:top}tr:first-child td{border-top:0}td:first-child{width:42%;color:var(--strong);padding-right:16px}
.note{border-left:3px solid #e0873b;padding-left:14px;color:var(--ink)}
footer{margin-top:34px;color:var(--ink3);font-size:13px}
</style></head><body><main>
<header>${logo}<div><h1>ROBOTIC TYLER</h1><p>Version ${esc(version)} · install guide</p></div></header>

<h2>Chrome extension (voice + chat)</h2>
<div class="card"><ol>
${step(1,'Unzip this download',`Keep the <code>${FOLDER}</code> folder somewhere permanent, like Documents. Chrome runs it from there.`)}
${step(2,'Open Chrome’s extensions page',`Type <code>chrome://extensions</code> in the address bar and press Enter.`)}
${step(3,'Turn on Developer mode','The switch is in the top-right corner of that page.')}
${step(4,'Click “Load unpacked”',`Choose the <code>${FOLDER}</code> folder. Tyler’s icon appears in the toolbar.`)}
${step(5,'Open Steam chat',`Go to <code>steamcommunity.com/chat</code>, open your group chat and press <b>Connect &amp; start</b> in Tyler’s panel. Add your AI key in Settings first (click Tyler’s toolbar icon).`)}
</ol></div>
<div class="card note"><b>Updating later:</b> copy the new version’s files over the same folder, then click <b>Reload</b> on Tyler’s card in <code>chrome://extensions</code>. Using the same folder keeps your settings and keys.</div>

<h2>Windows desktop app (optional)</h2>
<div class="card"><p style="margin:0 0 10px">On Windows, <code>ROBOTIC-TYLER-Setup-${esc(version)}.exe</code> from the same release page does all of this for you, and can also install the desktop app:</p><table>
<tr><td>Desktop app</td><td>Steam chat and Steam voice (Standard or Gemini Live) in one app, no Chrome needed. Voice joins right in its Steam window: no virtual audio cable.</td></tr>
</table><p style="margin:10px 0 0;color:var(--ink3)">Setup checks the download before installing it. The desktop app updates itself. It replaces the old Control Center and Voice Studio: it upgrades a Control Center in place and imports a Voice Studio’s settings.</p></div>
<div class="card note">If Windows shows <b>“Windows protected your PC”</b>, Setup isn’t code-signed yet. Click <b>More info → Run anyway</b>.</div>

<footer>Settings, keys and themes are shared by every Tyler window on the same computer. Pick a look under Settings → Appearance.</footer>
</main></body></html>
`;
}

// ── Release notes: which file + what's new (top section of CHANGES.md) ───────
function notes(files){
 const changes=read('CHANGES.md');const latest=changes.split(/\n---\n/)[0].trim().replace(/^# .*\n+/,'');
 const row=(file,what)=>files.includes(file)?`| \`${file}\` | ${what} |\n`:'';
 const dl=f=>`https://github.com/${OWNER_REPO}/releases/download/v${version}/${f}`;
 const hasSetup=files.includes(`ROBOTIC-TYLER-Setup-${version}.exe`);
 // The README's artwork, from this version's tag (so an old release keeps its own pictures).
 const art=f=>`https://raw.githubusercontent.com/${OWNER_REPO}/v${version}/assets/readme/${f}`;
 return `## Download

<p align="center"><img src="${art('hero.png')}" width="100%" alt="ROBOTIC TYLER, AI squadmate for Steam chat and voice, next to his panel in Steam chat"></p>
${hasSetup?`
<p align="center"><a href="${dl(`ROBOTIC-TYLER-Setup-${version}.exe`)}"><img src="${art('download.png')}" width="430" alt="Download for Windows: ROBOTIC-TYLER-Setup-${version}.exe"></a></p>

### ⬇️ [ROBOTIC-TYLER-Setup-${version}.exe](${dl(`ROBOTIC-TYLER-Setup-${version}.exe`)})

**That's the only file you need on Windows.** Run it and tick what you want:

- **Desktop app** (recommended): everything in one app, no Chrome needed. Steam chat, voice right in its Steam window (no VB-CABLE), soundboard, Music DJ and screen commentary. It updates itself, and replaces the old Control Center (upgraded in place) and Voice Studio (its settings are imported, then it offers to remove it).
- **Chrome extension:** Tyler in Steam web chat in Chrome, with voice and text. Setup unpacks it and opens Chrome's extensions page. Turn on *Developer mode*, click *Load unpacked* and paste the folder path Setup copied (a one-time step; Chrome only adds extensions from outside its Web Store this way).

Run Setup again any time to add, update or repair a part. Settings and keys are kept. If Windows says *“Windows protected your PC”*, Setup isn't code-signed: choose **More info → Run anyway**.
`:''}
Not on Windows? \`ROBOTIC-TYLER-Chrome-Extension-${version}.zip\` is the same Chrome extension: unzip it and open *How to install.html*. The other files (\`ROBOTIC-TYLER-component-…\`, \`.yml\`, \`.blockmap\`) are used by Setup and by the desktop app's automatic updates; you don't need them.

## What's new in ${version}

${latest}
`;
}

// ── Assemble ─────────────────────────────────────────────────────────────────
fs.rmSync(OUT,{recursive:true,force:true});fs.mkdirSync(OUT,{recursive:true});
const entries=[{name:FOLDER+'/'},...walk(EXT).map(e=>e.file?{name:FOLDER+'/'+e.rel,data:fs.readFileSync(e.file)}:{name:FOLDER+'/'+e.rel}),{name:'How to install.html',data:Buffer.from(guide())}];
const chromeZip=`ROBOTIC-TYLER-Chrome-Extension-${version}.zip`;
fs.writeFileSync(path.join(OUT,chromeZip),zip(entries));
fs.writeFileSync(path.join(OUT,'How to install.html'),guide());

// The one Windows download, and the component installers it fetches (which electron-builder
// also publishes to the release for automatic updates).
const setup=`ROBOTIC-TYLER-Setup-${version}.exe`,setupPath=path.join(ROOT,'dist','setup',setup);
const primary=[chromeZip];
if(fs.existsSync(setupPath)){fs.copyFileSync(setupPath,path.join(OUT,setup));primary.push(setup);}
const components=[];
for(const dir of ['dist/desktop']){
 const abs=path.join(ROOT,dir);if(!fs.existsSync(abs))continue;
 for(const f of fs.readdirSync(abs))if(f.startsWith('ROBOTIC-TYLER-component-')&&f.endsWith(`-${version}.exe`)){
  fs.mkdirSync(path.join(OUT,'components'),{recursive:true});fs.copyFileSync(path.join(abs,f),path.join(OUT,'components',f));components.push('components/'+f);}
}
const files=[...primary,...components.sort()];
fs.writeFileSync(path.join(OUT,'RELEASE-NOTES.md'),notes(files));
fs.writeFileSync(path.join(OUT,'SHA256SUMS.txt'),files.map(f=>crypto.createHash('sha256').update(fs.readFileSync(path.join(OUT,f))).digest('hex')+'  '+path.basename(f)).join('\n')+'\n');
console.log('Release files in dist/release/:\n  '+[...files,'How to install.html','RELEASE-NOTES.md','SHA256SUMS.txt'].join('\n  '));
if(!primary.includes(setup))console.log('(No Windows setup found. Build it with npm run build:win on Windows, or push a version tag to let CI build it.)');

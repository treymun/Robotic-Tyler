// v2.14: the one Windows setup (tools/setup). The program itself was exercised under Wine
// (see CHANGES.md); these checks keep its contract with the app installers intact.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
const ROOT=path.resolve(import.meta.dirname,'..');
const read=f=>fs.readFileSync(path.join(ROOT,f),'utf8');
const {nsisGuid}=await import(path.join(ROOT,'tools/setup/nsis-guid.mjs'));
const src=read('tools/setup/setup.c'),build=read('tools/setup/build-setup.mjs');

test('the setup finds the desktop app where its electron-builder installer registers it',()=>{
 // Seen in the registry after installing the 2.14.0 Control Center (Wine 9, per-user). The v2.15
 // desktop app keeps that app id, so Setup and the installer upgrade a Control Center in place.
 assert.equal(nsisGuid('com.robotictyler.controlcenter'),'427ca8a0-13da-510b-a4a9-d5d9a855230f');
 const desktop=JSON.parse(read('electron-builder.desktop.json'));
 assert.equal(desktop.appId,'com.robotictyler.controlcenter');assert.equal(desktop.productName,'ROBOTIC TYLER');
 assert.ok(!fs.existsSync(path.join(ROOT,'electron-builder.voice.json')),'no separate Voice Studio build any more');
 // The desktop app knows the old Voice Studio's key, to offer removing it once its settings are imported.
 assert.equal(nsisGuid('com.robotictyler.nativesteamcompanion'),'b0b8de7d-76bb-5d6f-99fa-c8a2fe9a49c6');assert.match(read('app/main.cjs'),/b0b8de7d-76bb-5d6f-99fa-c8a2fe9a49c6/);
 assert.ok(src.includes('L"Software\\\\Microsoft\\\\Windows\\\\CurrentVersion\\\\Uninstall\\\\"'),'uninstall entries');assert.ok(src.includes('L"Software\\\\%ls",c->guid'),'the app\'s own key (InstallLocation)');
 assert.match(src,/HKEY_CURRENT_USER[\s\S]*HKEY_LOCAL_MACHINE,KEY_WOW64_64KEY[\s\S]*KEY_WOW64_32KEY/,'per-user and per-machine installs');
 for(const key of ['artifactName','appId','uninstallDisplayName','productName','directories.output'])assert.ok(build.includes(key.split('.').pop()),key+' read from the electron-builder config');
});

test('only verified files run, silently, and nothing touches the apps\' data',()=>{
 assert.match(src,/BCRYPT_SHA256_ALGORITHM/);
 assert.match(src,/strcmp\(hex,c->sha\)/);
 assert.match(src,/c->got!=c->size\|\|strcmp\(hex,c->sha\)/,'size and hash are both checked after a download');
 assert.match(src,/if\(!ok\)DeleteFileW\(dest\)/,'a bad download is deleted, never run');
 assert.match(src,/L"\\"%ls\\" \/S %ls%ls",path,c->machine\?L"\/allusers":L"\/currentuser",g_runDesktop\?L"":L" --no-desktop-shortcut"/);
 assert.doesNotMatch(src,/RoboticTylerHydraCloudV12|RoboticTylerNativeSteamCompanion|--delete-app-data/,'no app data paths, no data deletion');
 assert.doesNotMatch(src,/RegDeleteKey|RegSetValue|DeleteFileW\(c->instDir/,'never edits the apps\' registry entries or install folders');
 assert.match(src,/WinHttpOpen[\s\S]*WINHTTP_ACCESS_TYPE_AUTOMATIC_PROXY/);assert.match(src,/WINHTTP_FLAG_SECURE_PROTOCOL_TLS1_2/);
 assert.match(build,/releases\/download\/v\$\{version\}\//,'downloads come from this version\'s release');
 assert.match(build,/requestedExecutionLevel level="asInvoker"/,'no admin prompt for per-user installs');
 assert.match(build,/Microsoft\.Windows\.Common-Controls" version="6\.0\.0\.0"/);
});

test('the setup is keyboard accessible, names each part with its role and opens Chrome’s extensions page',()=>{
 assert.match(src,/IsDialogMessageW\(g_wnd,&msg\)/);
 assert.match(src,/WS_TABSTOP/);assert.match(src,/UISF_HIDEFOCUS/);assert.match(src,/DM_GETDEFID/);
 assert.match(src,/\.title=L"Chrome extension",\.tag=L"IN GOOGLE CHROME"[\s\S]*Load unpacked/);
 // v2.19: desktop voice joins in the app's own Steam window, without VB-CABLE.
 assert.match(src,/\.title=L"Desktop app",\.tag=L"WINDOWS APP"[\s\S]*no VB-CABLE/);
 // v2.19: the app's own Steam theme (tokens.css): navy, the panel header's store gradient, Steam's
 // green for Install, Arial; the part icons come from art/ as resources, drawn with AlphaBlend.
 assert.match(src,/drawArt\(dc,c->chrome\?310:320,/);
 for(const c of ['C_HEAD_A  RGB(0x2a,0x47,0x5e)','C_BODY    RGB(0x1b,0x28,0x38)','C_LINK    RGB(0x66,0xc0,0xf4)','C_GREEN_T RGB(0x5c,0x7e,0x10)','C_FRAME   RGB(0x53,0xa4,0xc4)'])assert.ok(src.includes(c),c);
 assert.match(src,/f_title=font\(21,FW_BOLD,L"Arial"\)/);assert.doesNotMatch(src,/Segoe UI Black|glow\(/);
 assert.match(src,/#define NCOMP 2\nenum \{ K_CHROME, K_DESKTOP \};/,'two parts: the Chrome extension and the desktop app');
 assert.match(src,/wcsstr\(g_preselect,L"control"\)\|\|wcsstr\(g_preselect,L"voice"\)/,'old /components=control,voice still pick the desktop app');
 assert.match(src,/chrome:\/\/extensions\//,'Finish opens Chrome\'s extensions page');
 assert.match(src,/Not affiliated with or endorsed by Valve/);
 for(const s of ['S_DOWNLOAD','S_VERIFY','S_INSTALL','S_DONE','S_FAILED','S_CANCELLED'])assert.ok(src.includes(s),s);
 assert.match(src,/IDC_RETRY0/);assert.match(src,/IDC_LAUNCH0/);
});

test('a built setup (when present) is a 64-bit Windows GUI program that asks for no admin rights',()=>{
 const version=JSON.parse(read('package.json')).version,exe=path.join(ROOT,'dist/setup',`ROBOTIC-TYLER-Setup-${version}.exe`);
 if(!fs.existsSync(exe))return;
 const b=fs.readFileSync(exe);assert.equal(b.toString('ascii',0,2),'MZ');
 const pe=b.readUInt32LE(0x3c);assert.equal(b.toString('ascii',pe,pe+4),'PE\0\0');
 assert.equal(b.readUInt16LE(pe+4),0x8664,'x64');assert.equal(b.readUInt16LE(pe+24+68),2,'GUI subsystem');
 assert.ok(b.includes(Buffer.from('asInvoker')),'manifest embedded');
 assert.ok(b.includes(Buffer.from('ROBOTIC-TYLER-component-Desktop-'+version+'.exe','utf16le')));
});

test('the Chrome extension ships inside the setup and unpacks to one fixed folder',()=>{
 assert.match(build,/200 RCDATA "chrome-extension\.pack"/);assert.match(build,/packExtension\(path\.join\(ROOT,'browser-extension'\)\)/);
 assert.match(src,/memcmp\(p,"RTPK1\\0\\0\\0",8\)/,'checks the pack header');
 assert.match(src,/strstr\(rel,"\.\."\)\|\|rel\[0\]=='\/'\|\|strchr\(rel,':'\)/,'no paths outside the folder');
 assert.ok(src.includes('L"%ls\\\\ROBOTIC TYLER\\\\Chrome extension"'),'%LOCALAPPDATA%\\ROBOTIC TYLER\\Chrome extension');
 assert.match(src,/chrome-extension-files\.txt/,'remembers which files it wrote, outside the extension folder');
 const version=JSON.parse(read('package.json')).version,exe=path.join(ROOT,'dist/setup',`ROBOTIC-TYLER-Setup-${version}.exe`);
 if(fs.existsSync(exe)){const b=fs.readFileSync(exe),i=b.indexOf(Buffer.from('RTPK1\0\0\0','latin1'));assert.ok(i>0,'pack embedded');
  // The embedded manifest is the extension's own, byte for byte.
  assert.ok(b.includes(fs.readFileSync(path.join(ROOT,'browser-extension/manifest.json'))));}
});

test('the setup artwork exists at 100, 150 and 200 % with the sizes setup.c draws it at',()=>{
 const dims=f=>{const b=fs.readFileSync(path.join(ROOT,'tools/setup/art',f));assert.equal(b.toString('ascii',1,4),'PNG',f);return [b.readUInt32BE(16),b.readUInt32BE(20),b[25]];};
 for(const [name,w,h] of [['icon-chrome',48,48],['icon-desktop',48,48]])for(const pct of [100,150,200]){
  const [iw,ih,type]=dims(`${name}-${pct}.png`);assert.equal(iw,Math.round(w*pct/100),name+pct);assert.equal(ih,Math.round(h*pct/100),name+pct);assert.ok([2,6].includes(type),'RGB or RGBA');}
 const bmp=fs.readFileSync(path.join(ROOT,'build/installer-sidebar-control.bmp'));assert.equal(bmp.toString('ascii',0,2),'BM');assert.deepEqual([bmp.readInt32LE(18),Math.abs(bmp.readInt32LE(22))],[164,314]);
});

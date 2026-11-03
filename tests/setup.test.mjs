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
 assert.match(src,/\.title=L"Chrome extension",\.tag=L"STEAM WEB CHAT"[\s\S]*Load unpacked/);
 assert.match(src,/\.title=L"Desktop app",\.tag=L"WINDOWS"[\s\S]*virtual audio cable/);
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

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import Module,{createRequire} from 'node:module';

const require=createRequire(import.meta.url);
const modulePath=path.resolve(import.meta.dirname,'../app/updates.cjs');
// electron-updater is required lazily inside setupUpdates, so the stand-in stays installed for the file.
let currentUpdater=null;const originalLoad=Module._load;
Module._load=function(request,...rest){if(request==='electron-updater'){if(!currentUpdater)throw Error("Cannot find module 'electron-updater'");return {autoUpdater:currentUpdater};}return originalLoad.call(this,request,...rest);};
test.after(()=>{Module._load=originalLoad;});
function load(fakeUpdater){currentUpdater=fakeUpdater;delete require.cache[modulePath];return require(modulePath);}
function fakeUpdater(latest='2.6.0'){
 const handlers={};const u={handlers,checks:0,on(event,fn){handlers[event]=fn;return u;},
  async checkForUpdates(){u.checks++;return {updateInfo:{version:latest}};},quitAndInstall(){u.installed=true;}};
 return u;
}
const dialogs=[];const dialog={showMessageBox:async(_w,options)=>{dialogs.push(options);return {response:0};}};
function resources(yml){const dir=fs.mkdtempSync(path.join(os.tmpdir(),'tyler-res-'));if(yml)fs.writeFileSync(path.join(dir,'app-update.yml'),yml);process.resourcesPath=dir;}

test('running from source never checks for updates',async()=>{
 const u=fakeUpdater();const {setupUpdates}=load(u);
 const updates=setupUpdates({app:{isPackaged:false,getVersion:()=>'2.5.0'},dialog,channel:'control'});
 assert.match(updates.state.status,/unpacked/);dialogs.length=0;await updates.check();
 assert.equal(u.checks,0);assert.match(dialogs[0].message,/off/);
});

test('a build without a configured release repository stays off',()=>{
 resources('provider: github\nowner: YOUR_GITHUB_NAME\nrepo: robotic-tyler\n');
 const u=fakeUpdater();const {setupUpdates}=load(u);
 const updates=setupUpdates({app:{isPackaged:true,getVersion:()=>'2.5.0'},dialog,channel:'control'});
 assert.match(updates.state.status,/not configured/);assert.equal(updates.state.enabled,false);
});

test('a configured build follows its own channel, downloads in the background and reports readiness',async()=>{
 resources('provider: github\nowner: someone\nrepo: robotic-tyler\nchannel: voice\n');
 const u=fakeUpdater('2.6.0');const {setupUpdates}=load(u);let ready=null;
 const updates=setupUpdates({app:{isPackaged:true,getVersion:()=>'2.5.0'},dialog,channel:'voice',onReady:v=>{ready=v;}});
 assert.equal(updates.state.enabled,true);assert.equal(u.channel,'voice');assert.equal(u.allowDowngrade,false);
 assert.equal(u.autoDownload,true);assert.equal(u.autoInstallOnAppQuit,true);
 dialogs.length=0;await updates.check();
 assert.equal(u.checks,1);assert.match(dialogs[0].message,/2\.6\.0 is downloading/);
 u.handlers['update-downloaded']({version:'2.6.0'});
 assert.equal(ready,'2.6.0');assert.equal(updates.state.status,'ready');
 updates.installNow();assert.equal(u.installed,true);
});

test('a missing updater component is reported, not thrown',()=>{
 resources('provider: github\nowner: someone\nrepo: robotic-tyler\n');
 const {setupUpdates}=load(null);
 const updates=setupUpdates({app:{isPackaged:true,getVersion:()=>'2.5.0'},dialog,channel:'control'});
 assert.equal(updates.state.status,'unavailable');
});

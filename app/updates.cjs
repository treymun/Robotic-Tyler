'use strict';
// Automatic updates for the packaged Windows apps (Control Center and Native
// Voice Studio), via electron-updater and GitHub Releases.
//
// - Does nothing when running unpacked (npm start) or when the release repo has
//   not been configured yet (see RELEASING.md and tools/set-release-repo.mjs).
// - Checks 20 s after launch and then every 6 hours, downloads in the
//   background, and installs when the app quits. "Check for updates…" in the
//   menu/tray runs a check on demand and reports the result.
const fs=require('node:fs'),path=require('node:path');
const PLACEHOLDER='YOUR_GITHUB_NAME';

function releaseConfigured(){
 try{const yml=fs.readFileSync(path.join(process.resourcesPath,'app-update.yml'),'utf8');return !yml.includes(PLACEHOLDER);}catch{return false;}
}

function setupUpdates({app,dialog,channel,log=()=>{},onReady=()=>{}}){
 const state={status:'idle',version:null,enabled:false};
 const off=(status,detail)=>{state.status=status;return {state,installNow(){},
  async check(parent){if(dialog)await dialog.showMessageBox(parent,{type:'info',title:'ROBOTIC TYLER updates',message:'Automatic updates are off.',detail});return state;}};};
 if(!app.isPackaged)return off('disabled (unpacked build)','Updates only run in the installed app. You are running from source.');
 if(!releaseConfigured()){log('Updates','Release repository not configured; automatic updates are off.');return off('disabled (release repo not configured)','This build was made without a release repository. See RELEASING.md.');}
 let autoUpdater;
 try{({autoUpdater}=require('electron-updater'));}catch(error){log('Updates','electron-updater is missing: '+error.message);return off('unavailable','The updater component is missing from this build.');}
 state.enabled=true;
 // Both apps publish into the same GitHub release, so each follows its own channel file.
 if(channel){autoUpdater.channel=channel;autoUpdater.allowDowngrade=false;}
 autoUpdater.autoDownload=true;
 autoUpdater.autoInstallOnAppQuit=true;
 autoUpdater.on('checking-for-update',()=>{state.status='checking';});
 autoUpdater.on('update-not-available',()=>{state.status='up to date';});
 autoUpdater.on('update-available',info=>{state.status='downloading';state.version=info?.version||null;log('Update available',String(state.version||''));});
 autoUpdater.on('update-downloaded',info=>{state.status='ready';state.version=info?.version||state.version;log('Update downloaded',String(state.version||''));onReady(state.version);});
 autoUpdater.on('error',error=>{state.status='error';log('Update check failed',String(error?.message||error).slice(0,140));});

 const quietCheck=()=>autoUpdater.checkForUpdates().catch(error=>log('Update check failed',String(error?.message||error).slice(0,140)));
 setTimeout(quietCheck,20000).unref?.();
 setInterval(quietCheck,6*60*60*1000).unref?.();

 async function check(parent){
  try{
   const result=await autoUpdater.checkForUpdates();
   const available=result?.updateInfo?.version&&result.updateInfo.version!==app.getVersion();
   if(dialog)await dialog.showMessageBox(parent,{type:'info',title:'ROBOTIC TYLER updates',message:available?'Version '+result.updateInfo.version+' is downloading.':'You have the latest version ('+app.getVersion()+').',detail:available?'It installs the next time you quit ROBOTIC TYLER.':undefined});
  }catch(error){if(dialog)await dialog.showMessageBox(parent,{type:'warning',title:'ROBOTIC TYLER updates',message:'Could not check for updates.',detail:String(error?.message||error).slice(0,300)});}
  return state;
 }
 function installNow(){if(state.status==='ready')autoUpdater.quitAndInstall();}
 return {state,check,installNow};
}

module.exports={setupUpdates,releaseConfigured,PLACEHOLDER};

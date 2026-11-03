 'use strict';
const {app,BrowserWindow,Menu,safeStorage,ipcMain,shell,dialog,nativeImage}=require('electron');
const path=require('node:path'),fs=require('node:fs'),fsp=require('node:fs/promises');
const {execFile}=require('node:child_process');
const {promisify}=require('node:util');
const {Vault}=require('../app/vault.cjs');
const {setupUpdates}=require('../app/updates.cjs');
const run=promisify(execFile);
const root=path.join(app.getPath('appData'),'RoboticTylerNativeSteamCompanion');
app.setPath('userData',root);
const bridge=path.join(process.resourcesPath,'windows-audio-bridge','RoboticTylerAudio.exe');
const localBridge=path.join(__dirname,'..','windows-audio-bridge','publish','RoboticTylerAudio.exe');
let win,settings;let vault;
function helper(){const p=app.isPackaged?bridge:localBridge;if(!fs.existsSync(p))throw Error('Windows audio bridge is not installed. Run BUILD-BOTH-WINDOWS-EXES.cmd on Windows with the .NET SDK.');return p;}
async function audio(args,timeout=75000){const {stdout}=await run(helper(),args,{windowsHide:true,timeout,maxBuffer:2_000_000});return stdout.trim();}
function checkDevice(device){if(typeof device!=='string'||device.length>500||!/^[a-zA-Z0-9+/=]+$/.test(device))throw Error('Select an audio device first.');return device;}
async function tempFile(ext,bytes){if(bytes.length>12_000_000)throw Error('Audio response too large');const dir=path.join(root,'temp');await fsp.mkdir(dir,{recursive:true});const name=path.join(dir,require('node:crypto').randomUUID()+ext);await fsp.writeFile(name,bytes,{flag:'wx'});return name;}
async function transcribe(bytes,key){let b64=bytes.toString('base64');const response=await fetch('https://openrouter.ai/api/v1/audio/transcriptions',{method:'POST',headers:{Authorization:'Bearer '+key,'Content-Type':'application/json'},body:JSON.stringify({model:'mistralai/voxtral-mini-3b-2507',input_audio:{data:b64,format:'wav'},language:'en',response_format:'json'}),signal:AbortSignal.timeout(35000)});const obj=await response.json().catch(()=>({}));if(!response.ok)throw Error('Speech transcription failed (HTTP '+response.status+').');return String(obj.text||obj.transcription||'').slice(0,800);}
async function reply(message,key){const s=await vault.get(['personality','length','brain']);let system='You are ROBOTIC TYLER, a humorous and helpful gaming companion. Be conversational, accurate, and concise. '+(s.personality||'');const r=await fetch('https://openrouter.ai/api/v1/chat/completions',{method:'POST',headers:{Authorization:'Bearer '+key,'Content-Type':'application/json'},body:JSON.stringify({model:s.brain==='budget'?'mistralai/mistral-small-3.1-24b-instruct':'meta-llama/llama-3.3-70b-instruct',messages:[{role:'system',content:system},{role:'user',content:message.slice(0,1200)}],max_tokens:Math.min(500,Math.max(100,s.length==='long'?400:200))}),signal:AbortSignal.timeout(35000)});const json=await r.json().catch(()=>({}));if(!r.ok)throw Error('AI reply failed (HTTP '+r.status+').');return String(json.choices?.[0]?.message?.content||'').slice(0,1000);}
async function speak(text,key,device){const r=await fetch('https://openrouter.ai/api/v1/audio/speech',{method:'POST',headers:{Authorization:'Bearer '+key,'Content-Type':'application/json'},body:JSON.stringify({model:'x-ai/grok-voice-tts-1.0',voice:'rex',input:text.slice(0,300),response_format:'mp3'}),signal:AbortSignal.timeout(35000)});if(!r.ok)throw Error('Voice generation failed (HTTP '+r.status+').');const bytes=Buffer.from(await r.arrayBuffer());const file=await tempFile('.mp3',bytes);try{await audio(['play',file,device]);}finally{await fsp.unlink(file).catch(()=>{});}}
async function settingsWin(){if(settings&&!settings.isDestroyed()){settings.focus();return;}settings=new BrowserWindow({width:1050,height:830,backgroundColor:'#14171c',title:'ROBOTIC TYLER · Settings',icon:path.join(__dirname,'..','assets','robotic-tyler.png'),webPreferences:{preload:path.join(__dirname,'..','app','options-preload.cjs'),sandbox:true,contextIsolation:true,nodeIntegration:false}});settings.on('closed',()=>settings=null);settings.webContents.setWindowOpenHandler(()=>({action:'deny'}));settings.webContents.on('will-navigate',e=>e.preventDefault());await settings.loadFile(path.join(__dirname,'..','app','companion','settings.html'));}
if(!app.requestSingleInstanceLock())app.quit();else{
 app.on('second-instance',()=>win?.focus());
 app.whenReady().then(async()=>{
  vault=new Vault(path.join(root,'Settings'),safeStorage);
  const updates=setupUpdates({app,dialog,channel:'voice',log:(kind,details)=>console.log('[updates]',kind,details||'')});
  ipcMain.handle('tyler:settings',async(event,req)=>{if(!settings||event.sender!==settings.webContents||event.senderFrame!==settings.webContents.mainFrame)throw Error('Unauthorized settings access');if(req.action==='get')return vault.get(req.keys);if(req.action==='set'){const {sanitizeSettings}=require('../app/guards.cjs');await vault.set(sanitizeSettings(req.values));return {};}if(req.action==='remove'){await vault.remove(req.keys);return {};}if(req.action==='chat'){shell.openExternal('steam://open/friends');return {};}if(req.action==='verify'){if(typeof req.key!=='string'||req.key.length>1024)throw Error('Invalid key');const r=await fetch('https://openrouter.ai/api/v1/key',{headers:{Authorization:'Bearer '+req.key},signal:AbortSignal.timeout(12000)});if(!r.ok)throw Error('Key verification failed');return true;}throw Error('Unknown settings action');});
  ipcMain.handle('tyler:native',async(event,req)=>{
   if(!win||event.sender!==win.webContents||event.senderFrame!==win.webContents.mainFrame||!req||typeof req!=='object')throw Error('Unauthorized request');
   if(req.action==='devices')return (await audio(['devices'],15000)).split('\n').filter(Boolean).map(line=>{const [kind,id,...names]=line.split('\t');return {kind,id,name:names.join(' ')}});
   if(req.action==='status')return {bridgeReady:fs.existsSync(app.isPackaged?bridge:localBridge),app:'Native Steam companion',steamChat:'not integrated'};
   if(req.action==='settings'){await settingsWin();return true;}
   if(req.action==='theme'){const THEMES=['steam','classic','tf2','cs2','portal','cs16','hev','l4d','winxp','doom'],v=(await vault.get(['uiTheme'])).uiTheme,theme=THEMES.includes(v)?v:'steam';try{const img=nativeImage.createFromPath(path.join(__dirname,'logos',theme+'.png'));if(!img.isEmpty())win?.setIcon?.(img);}catch{}return theme;}
   if(req.action==='steam'){await shell.openExternal('steam://open/friends');return true;}
   if(req.action==='updates'){const s=await updates.check(win);return {status:s.status,version:s.version};}
   if(req.action==='test'){const device=checkDevice(req.device);const bytes=await fsp.readFile(path.join(__dirname,'beep.wav'));const file=await tempFile('.wav',bytes);try{await audio(['play',file,device]);}finally{await fsp.unlink(file).catch(()=>{});}return 'Test sound sent to selected output device';}
   if(req.action==='speak'||req.action==='record'){
    const device=checkDevice(req.device);const listenDevice=req.action==='record'?checkDevice(req.listenDevice):device;const keys=await vault.get(['openrouterKey']);if(!keys.openrouterKey)throw Error('Set your OpenRouter API key in Settings first.');
    let heard='';if(req.action==='record'){
     const seconds=Math.max(2,Math.min(8,Number(req.seconds)||5));const file=path.join(root,'temp',require('node:crypto').randomUUID()+'.wav');await fsp.mkdir(path.dirname(file),{recursive:true});try{await audio(['record',file,String(seconds),listenDevice],seconds*1000+12000);heard=await transcribe(await fsp.readFile(file),keys.openrouterKey);}finally{await fsp.unlink(file).catch(()=>{});}if(!heard.trim())return {heard:'',reply:'No clear speech detected.'};
    }else{heard=String(req.message||'').trim().slice(0,1000);if(!heard)throw Error('Enter a message.');}
    const text=await reply(heard,keys.openrouterKey);if(!text)throw Error('AI returned no response');await speak(text,keys.openrouterKey,device);return {heard,reply:text};
   }
   throw Error('Unknown command');
  });
  win=new BrowserWindow({width:1130,height:810,minWidth:810,minHeight:560,title:'ROBOTIC TYLER · Steam Companion',backgroundColor:'#14171c',icon:path.join(__dirname,'..','assets','robotic-tyler.png'),webPreferences:{sandbox:true,contextIsolation:true,nodeIntegration:false,preload:path.join(__dirname,'native-preload.cjs')}});
  Menu.setApplicationMenu(null);win.webContents.setWindowOpenHandler(()=>({action:'deny'}));win.webContents.on('will-navigate',e=>e.preventDefault());await win.loadFile(path.join(__dirname,'native.html'));win.on('closed',()=>app.quit());
 }).catch(e=>{dialog.showErrorBox('ROBOTIC TYLER',e.message);app.quit();});
}

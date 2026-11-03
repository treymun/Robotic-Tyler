'use strict';
// ROBOTIC TYLER desktop app (v2.15): Steam text chat (the embedded Steam web chat window) and Steam
// voice (the Windows audio helper) in one app, with one tray icon and one updater. It replaces the
// separate Control Center and Native Steam Companion (Voice Studio).
//
// The shared extension background (browser-extension/background.js) runs in this main process
// behind a small chrome.* stand-in, so text chat, Standard voice and Gemini Live use the same
// conversation engine, rules, memory and settings as the Chrome extension.
const {app,BrowserWindow,ipcMain,Menu,shell,safeStorage,webContents,Tray,nativeImage,dialog}=require('electron');
const path=require('node:path'),fs=require('node:fs'),{pathToFileURL}=require('node:url'),{execFile,spawn}=require('node:child_process');
const {setupUpdates}=require('./updates.cjs'),{Vault,memoryStorage}=require('./vault.cjs'),{isChat,isSteam,isLocal,settingsKeys,sanitizeSettings}=require('./guards.cjs');
const {NativeVoice}=require('./native-voice.cjs'),{importVoiceStudio}=require('./migrate.cjs');
// Same data folder as the Control Center, so its users keep settings, keys and memory as they are.
const root=path.join(process.env.LOCALAPPDATA||app.getPath('appData'),'RoboticTylerHydraCloudV12');fs.mkdirSync(path.join(root,'Data'),{recursive:true});app.setPath('userData',path.join(root,'Data'));
const OLD_VOICE_DIR=path.join(app.getPath('appData'),'RoboticTylerNativeSteamCompanion');
const OLD_VOICE_GUID='b0b8de7d-76bb-5d6f-99fa-c8a2fe9a49c6'; // electron-builder key for com.robotictyler.nativesteamcompanion
let bot,options,voiceWin,listener,tray,voice,updates,vault,quitting=false;const removed=[];const activity=[];function eventLog(kind,details=''){activity.unshift({at:Date.now(),kind,details:String(details).slice(0,140)});if(activity.length>120)activity.pop();}
const icon=path.join(__dirname,'..','assets','robotic-tyler.png');
function helperPath(){const p=app.isPackaged?path.join(process.resourcesPath,'windows-audio-bridge','RoboticTylerAudio.exe'):path.join(__dirname,'..','windows-audio-bridge','publish','RoboticTylerAudio.exe');if(!fs.existsSync(p))throw Error('The Windows audio helper is missing. Reinstall ROBOTIC TYLER (or build it with BUILD-WINDOWS-EXE.cmd).');return p;}
function helperOut(args,input,timeout=15000){return new Promise((resolve,reject)=>{const c=execFile(helperPath(),args,{windowsHide:true,timeout,maxBuffer:4_000_000},(error,stdout,stderr)=>error?reject(Error(String(stderr||error.message).trim())):resolve(String(stdout).trim()));if(input!==undefined){c.stdin.end(input);}});}

if(!app.requestSingleInstanceLock()){app.quit();}else{
 app.on('second-instance',()=>{const w=voiceWin&&!voiceWin.isDestroyed()&&voiceWin.isVisible()?voiceWin:bot;if(w){if(w.isMinimized())w.restore();w.show();w.focus();}});
 app.whenReady().then(async()=>{
 updates=setupUpdates({app,dialog,channel:'control',log:eventLog,onReady:version=>{try{tray?.displayBalloon?.({title:'ROBOTIC TYLER update ready',content:'Version '+version+' installs when you quit.'});}catch{}}});
 vault=new Vault(path.join(root,'Data','Companion'),safeStorage);const sessionStore=memoryStorage();
 const settingsPath=path.join(__dirname,'companion','settings.html');
 const voicePath=path.join(__dirname,'..','voice-app','native.html');
 const windowDefaults={show:false,backgroundColor:'#14171c',autoHideMenuBar:true,webPreferences:{nodeIntegration:false,contextIsolation:true,sandbox:true,webSecurity:true,allowRunningInsecureContent:false,webviewTag:false}};
 function configure(win,local=null){win.webContents.setWindowOpenHandler(({url})=>{if(/^https:\/\//.test(url)){if(isSteam(url)&&!local)bot.loadURL(url);else shell.openExternal(url);}return {action:'deny'};});win.webContents.on('will-navigate',(event,url)=>{if(local?!isLocal(url,local):!isSteam(url)){event.preventDefault();if(/^https:\/\//.test(url))shell.openExternal(url);}});win.webContents.session.setPermissionRequestHandler((_wc,permission,callback)=>callback(permission!=='media'&&permission!=='audioCapture'&&permission!=='videoCapture'));win.webContents.session.setPermissionCheckHandler((_wc,permission)=>!['media','audioCapture','videoCapture'].includes(permission));win.once('ready-to-show',()=>win.show());}
 async function openSettings(section){if(options&&!options.isDestroyed()){options.focus();if(section)options.webContents.executeJavaScript('location.hash='+JSON.stringify('#'+section)).catch(()=>{});return;}options=new BrowserWindow({...windowDefaults,width:1040,height:860,title:'ROBOTIC TYLER · Settings',icon,webPreferences:{...windowDefaults.webPreferences,preload:path.join(__dirname,'options-preload.cjs')}});configure(options,settingsPath);options.on('closed',()=>options=null);await options.loadFile(settingsPath,section?{hash:section}:undefined);}
 async function openVoice(){if(voiceWin&&!voiceWin.isDestroyed()){voiceWin.show();voiceWin.focus();return;}voiceWin=new BrowserWindow({...windowDefaults,width:1130,height:810,minWidth:760,minHeight:560,title:'ROBOTIC TYLER · Voice',icon,webPreferences:{...windowDefaults.webPreferences,preload:path.join(__dirname,'..','voice-app','native-preload.cjs')}});configure(voiceWin,voicePath);voiceWin.on('closed',()=>voiceWin=null);await voiceWin.loadFile(voicePath);}

 // chrome.* stand-in for the shared extension background (browser-extension/background.js).
 // storage.onChanged lets the background push non-secret changes (usage, emergency stop…) to the
 // Steam window; tabs.query exposes the single Steam chat window as the only "tab"; tab -1 is the
 // desktop's own voice (native-voice.cjs).
 const changeListeners=[];
 const emitChanges=changes=>{if(!Object.keys(changes).length)return;for(const fn of changeListeners){try{fn(changes,'local');}catch(err){eventLog('Storage listener failed',err.message);}}};
 const local={
  get:keys=>vault.get(keys),
  set:async values=>{const keys=Object.keys(values||{});const before=await vault.get(keys);await vault.set(values);emitChanges(Object.fromEntries(keys.map(k=>[k,{oldValue:before[k],newValue:values[k]}])));},
  remove:async keys=>{const list=Array.isArray(keys)?keys:[keys];const before=await vault.get(list);await vault.remove(list);emitChanges(Object.fromEntries(list.filter(k=>k in before).map(k=>[k,{oldValue:before[k]}])));},
  setAccessLevel:async()=>{}
 };
 const steamTab=()=>bot&&!bot.isDestroyed()&&!bot.webContents.isDestroyed()?{id:bot.webContents.id,url:bot.webContents.getURL()}:null;
 // Window and tray icons follow Settings → Theme (background.js calls this; logos are in companion/ui/logos).
 globalThis.tylerThemeIcon=theme=>{try{const file=t=>path.join(__dirname,'companion','ui','logos',t),img=nativeImage.createFromPath(file(theme+'.png'));if(img.isEmpty())return;for(const w of [bot,options,voiceWin])if(w&&!w.isDestroyed())w.setIcon(img);const small=nativeImage.createFromPath(file(theme+'-32.png'));if(!small.isEmpty())tray?.setImage(small.resize({width:16,height:16}));voiceWin?.webContents.send('tyler:voice-theme');}catch{}};
 globalThis.chrome={action:{onClicked:{addListener(){}}},runtime:{onMessage:{addListener(fn){listener=fn;}},openOptionsPage:()=>openSettings()},
  storage:{local,session:sessionStore,onChanged:{addListener(fn){changeListeners.push(fn);}}},
  tabs:{get:async id=>{if(id===-1)return {id,url:'https://steamcommunity.com/chat/'};const wc=webContents.fromId(id);if(!wc||wc.isDestroyed())throw Error('Tab closed');return {id,url:wc.getURL()};},
   query:async({url}={})=>{const tab=steamTab();if(!tab)return [];if(url&&!/steamcommunity\.com\/chat/.test(String(url)))return [];return isChat(tab.url)?[tab]:[];},
   sendMessage:async(id,message)=>{if(id===-1){voice?.backgroundMessage(message);return;}const wc=webContents.fromId(id);if(!wc||wc.isDestroyed())throw Error('Tab closed');wc.send('tyler:message',message);},
   create:async({url}={})=>{if(/^https:\/\//.test(String(url||'')))await shell.openExternal(url);return {id:-2};},
   update:async()=>({}),
   onRemoved:{addListener(fn){removed.push(fn);}}}};
 await import(pathToFileURL(path.join(__dirname,'companion','background.js')).href);

 // ── Voice ──────────────────────────────────────────────────────────────
 voice=new NativeVoice({helper:helperPath,request:m=>globalThis.tylerNativeRequest(m),live:globalThis.tylerLive,tempDir:path.join(root,'Data','voice-temp'),log:eventLog,
  settings:()=>vault.get(['voiceOutputDevice','voiceListenDevice','voiceListenConsent','voiceEngine','v22EmergencyStop','noiseLevel','voiceThreshold','minVoiced','replyPause','keyboardFilter'])});
 voice.on('status',s=>{try{voiceWin?.webContents.send('tyler:voice-status',s);}catch{}buildTray();});
 changeListeners.push(changes=>{if(changes.v22EmergencyStop?.newValue===true&&voice.mode!=='off')void voice.stop('Emergency stop.');});
 const beep=path.join(__dirname,'..','voice-app','beep.wav');
 async function startVoice(){const {voiceEngine}=await vault.get('voiceEngine');return voiceEngine==='live'?voice.startLive():voice.startStandard();}

 // ── Tray: the one ROBOTIC TYLER tray icon ────────────────────────────────
 function buildTray(){
  if(!tray)return;const on=voice&&voice.mode!=='off';
  tray.setToolTip('ROBOTIC TYLER'+(on?' · '+voice.state:''));
  tray.setContextMenu(Menu.buildFromTemplate([{label:'Open Steam chat',click:()=>{bot?.show();bot?.focus();}},{label:'Open Voice',click:()=>void openVoice()},
   on?{label:'Stop voice',click:()=>void voice.stop('Voice stopped from the tray.')}:{label:'Start voice',click:()=>startVoice().catch(e=>{tray.displayBalloon?.({title:'Voice didn\'t start',content:e.message});void openVoice();})},
   {label:'Settings',click:()=>void openSettings()},{label:'Pause text replies',click:()=>{eventLog('Pause requested');bot?.webContents.send('tyler:message',{type:'v22:stop'});}},{type:'separator'},
   {label:'Check for updates…',click:()=>updates.check(bot)},{label:'Quit ROBOTIC TYLER',click:()=>{quitting=true;app.quit();}}]));
 }
 try{tray=new Tray(nativeImage.createFromPath(path.join(__dirname,'..','assets','robotic-tyler-tray.png')).resize({width:16,height:16}));tray.on('double-click',()=>bot?.show());buildTray();}catch(err){eventLog('Tray unavailable',err.message);}

 ipcMain.handle('tyler:request',(event,message)=>{if(!bot||event.sender.id!==bot.webContents.id||event.senderFrame!==event.sender.mainFrame||!isChat(event.senderFrame.url))throw Error('Only the Steam chat window can use the companion.');if(!message||typeof message!=='object'||JSON.stringify(message).length>2200000)throw Error('Invalid request');eventLog('Steam text request',String(message.type||'unknown'));return new Promise(resolve=>listener(message,{url:event.senderFrame.url,tab:{id:event.sender.id}},resolve));});
 ipcMain.handle('tyler:settings',async(event,request)=>{if(!options||event.sender.id!==options.webContents.id||event.senderFrame!==event.sender.mainFrame||!isLocal(event.senderFrame.url,settingsPath))throw Error('Settings are available only in the local settings window.');
  if(request.action==='activity'){return activity.slice(0,60);}
  if(request.action==='verify'){
   const key=request.key;if(typeof key!=='string'||!key.trim()||key.length>1024)throw Error('Paste the secret from your OpenRouter Keys page.');
   let result;try{result=await fetch('https://openrouter.ai/api/v1/key',{headers:{Authorization:'Bearer '+key},redirect:'error',signal:AbortSignal.timeout(12000)});}catch{throw Error('Could not reach OpenRouter. Check your connection and try Save again.');}
   if([401,403].includes(result.status))throw Error('OpenRouter rejected the key. Paste the full secret from your OpenRouter Keys page.');
   if(!result.ok)throw Error('OpenRouter key check returned HTTP '+result.status+'. Try again shortly.');return true;
  }
  if(request.action==='get'){const names=(Array.isArray(request.keys)?request.keys:[request.keys]).filter(k=>settingsKeys.has(k));const data=await vault.get(names);if(data.geminiKey)data.geminiKey=true;if(data.openrouterKey)data.openrouterKey=true;delete data.speechKey;return data;}
  if(request.action==='set'){await local.set(sanitizeSettings(request.values));return {};}
  if(request.action==='remove'){await local.remove((Array.isArray(request.keys)?request.keys:[request.keys]).filter(k=>settingsKeys.has(k)));return {};}
  if(request.action==='chat'){bot.loadURL('https://steamcommunity.com/chat/');bot.show();bot.focus();return {};}
  if(request.action==='voice-devices')return voice.devices();
  if(request.action==='voice-tone')return voice.tone(String(request.device||''),beep);
  if(request.action==='voice-test')return voiceTest(request.engine,request.values||{});
  throw Error('Unknown settings action');});
 // Settings → Voice → Test voice: the key stays here; only the audio goes back to the page.
 async function voiceTest(engine,values){
  const LINE='Hey, it\'s ROBOTIC TYLER. Voice check, one two. Sounding good?',keys=await vault.get(['openrouterKey','geminiKey']);
  const live=await import(pathToFileURL(path.join(__dirname,'companion','live-core.mjs')).href);
  if(engine==='live'){
   if(!keys.geminiKey)throw Error('Save a Google AI key first.');
   const config=live.liveConfig(values),chunks=[];let sent=0,first=null;
   const said=await new Promise((resolve,reject)=>{const s=new live.LiveSession({key:keys.geminiKey,config,instructions:live.liveInstructions(values,config),handlers:{onAudio:b64=>{if(first===null)first=Date.now()-sent;chunks.push(Buffer.from(b64,'base64'));},onTurn:t=>{clearTimeout(timer);s.stop('Test finished');resolve(t.said);},onState:(st,d)=>{if(st==='failed'){clearTimeout(timer);reject(Error(d.reason));}}}});
    const timer=setTimeout(()=>{s.stop('Test timed out');reject(Error('No reply from Gemini Live within 20 seconds.'));},20000);
    s.start().then(()=>{sent=Date.now();s.sendText('Say a quick one-sentence hello to the squad so I can check how you sound.');}).catch(()=>{});});
   const pcm=Buffer.concat(chunks),h=Buffer.alloc(44);h.write('RIFF',0);h.writeUInt32LE(36+pcm.length,4);h.write('WAVE',8);h.write('fmt ',12);h.writeUInt32LE(16,16);h.writeUInt16LE(1,20);h.writeUInt16LE(1,22);h.writeUInt32LE(24000,24);h.writeUInt32LE(48000,28);h.writeUInt16LE(2,32);h.writeUInt16LE(16,34);h.write('data',36);h.writeUInt32LE(pcm.length,40);
   return {audio:Buffer.concat([h,pcm]).toString('base64'),note:'Gemini Live answered'+(first!==null?' · first audio after '+first+' ms (measured on this connection)':'')+(said?': “'+said+'”':'.')};
  }
  const started=Date.now();
  if(values.aiProvider==='gemini'){if(!keys.geminiKey)throw Error('Save a Google AI key first.');const g=await import(pathToFileURL(path.join(__dirname,'companion','gemini.mjs')).href);const r=await g.geminiSpeak(keys.geminiKey,LINE,values.geminiVoice,AbortSignal.timeout(30000),values.geminiTtsModel);return {audio:r.audio,note:'Playing '+r.model+' · ready after '+(Date.now()-started)+' ms.'};}
  if(!keys.openrouterKey)throw Error('Save an OpenRouter key first.');const sp=await import(pathToFileURL(path.join(__dirname,'companion','speech.mjs')).href);const r=await new sp.Speech().generate(LINE,keys.openrouterKey,values.speechVoice,AbortSignal.timeout(30000));return {audio:r.audio,note:'Playing '+r.model+' · ready after '+(Date.now()-started)+' ms.'};
 }
 // The Voice window: start/stop, status, manual listening and typed messages.
 ipcMain.handle('tyler:native',async(event,req)=>{
  if(!voiceWin||event.sender!==voiceWin.webContents||event.senderFrame!==voiceWin.webContents.mainFrame||!isLocal(event.senderFrame.url,voicePath)||!req||typeof req!=='object')throw Error('Unauthorized request');
  if(req.action==='status'){const s=await vault.get(['voiceEngine','voiceOutputDevice','voiceListenDevice','voiceListenConsent','aiProvider','geminiKey','openrouterKey']);let bridge=true;try{helperPath();}catch{bridge=false;}return {...voice.status(),engine:s.voiceEngine==='live'?'live':'standard',devicesChosen:!!(s.voiceOutputDevice&&s.voiceListenDevice),consent:s.voiceListenConsent===true,keyForEngine:s.voiceEngine==='live'?!!s.geminiKey:s.aiProvider==='gemini'?!!s.geminiKey:!!s.openrouterKey,bridge,steamOpen:!!steamTab(),version:app.getVersion()};}
  if(req.action==='start'){await startVoice();return voice.status();}
  if(req.action==='stop'){await voice.stop('Voice stopped by you.');return voice.status();}
  if(req.action==='listen')return voice.listenOnce(req.seconds);
  if(req.action==='say')return voice.say(req.text);
  if(req.action==='tone'){const {voiceOutputDevice}=await vault.get('voiceOutputDevice');return voice.tone(voiceOutputDevice,beep);}
  if(req.action==='settings'){await openSettings('voice');return true;}
  if(req.action==='chat'){bot?.show();bot?.focus();return true;}
  if(req.action==='steam'){await shell.openExternal('steam://open/friends');return true;}
  if(req.action==='updates'){const s=await updates.check(voiceWin);return {status:s.status,version:s.version};}
  if(req.action==='theme'){const THEMES=['steam','classic','tf2','cs2','portal','cs16','hev','l4d','winxp','doom'],v=(await vault.get(['uiTheme'])).uiTheme;return THEMES.includes(v)?v:'steam';}
  throw Error('Unknown command');
 });

 // ── One-time import from the old Voice Studio app ───────────────────────
 try{
  const result=await importVoiceStudio({oldDir:OLD_VOICE_DIR,vault,allowed:settingsKeys,log:eventLog,unprotect:b64=>helperOut(['unprotect'],b64),
   ask:async plan=>{const r=await dialog.showMessageBox({type:'question',title:'Import Voice Studio settings',message:'Your old Voice Studio app has different settings from this one.',
    detail:'These settings differ: '+plan.labels.join(', ')+'.\n\nSettings only the Voice Studio had are imported either way. Which app\'s values should ROBOTIC TYLER keep for the ones that differ? Nothing in the Voice Studio is changed.',
    buttons:['Keep this app\'s settings','Use the Voice Studio\'s settings','Ask me later'],defaultId:0,cancelId:2,noLink:true});return ['ours','theirs','later'][r.response];}});
  if(result.status==='imported')eventLog('Voice Studio settings imported',(result.imported||[]).join(', '));
  if(result.unreadable?.length)eventLog('Voice Studio keys not imported','Enter them again in Settings: '+result.unreadable.join(', '));
 }catch(error){eventLog('Voice Studio import failed',error.message);}

 bot=new BrowserWindow({...windowDefaults,width:1380,height:920,minWidth:850,minHeight:620,title:'ROBOTIC TYLER',icon,webPreferences:{...windowDefaults.webPreferences,partition:'persist:robotic-tyler-steam',backgroundThrottling:false,preload:path.join(__dirname,'steam-preload.cjs')}});configure(bot);
 // While voice runs, closing the chat window keeps Tyler in the tray instead of quitting.
 bot.on('close',event=>{if(!quitting&&voice.mode!=='off'){event.preventDefault();bot.hide();tray?.displayBalloon?.({title:'ROBOTIC TYLER is still in voice chat',content:'Stop voice or quit from the tray icon.'});}});
 bot.on('closed',()=>{quitting=true;app.quit();});const botId=bot.webContents.id;bot.webContents.on('destroyed',()=>{for(const fn of removed)fn(botId);});
 Menu.setApplicationMenu(Menu.buildFromTemplate([{label:'ROBOTIC TYLER',submenu:[{label:'Steam chat',click:()=>bot.loadURL('https://steamcommunity.com/chat/')},{label:'Voice',accelerator:'Ctrl+Shift+V',click:()=>void openVoice()},{label:'Settings',click:()=>void openSettings()},{label:'Reload companion',click:()=>bot.webContents.reload()},{label:'Check for updates…',click:()=>updates.check(bot)},{type:'separator'},{label:'Open Steam desktop friends',click:()=>shell.openExternal('steam://open/friends')},{label:'Open chat in your browser',click:()=>shell.openExternal('https://steamcommunity.com/chat/')},{type:'separator'},{label:'Quit',click:()=>{quitting=true;app.quit();}}]},{label:'View',submenu:[{label:'Pin Tyler above other windows',type:'checkbox',accelerator:'Ctrl+Shift+Y',click:item=>bot.setAlwaysOnTop(item.checked)},{type:'separator'},{role:'zoomIn'},{role:'zoomOut'},{role:'resetZoom'},{role:'togglefullscreen'}]},{label:'Edit',submenu:[{role:'undo'},{role:'redo'},{type:'separator'},{role:'cut'},{role:'copy'},{role:'paste'},{role:'selectAll'}]}]));
 bot.webContents.on('did-finish-load',()=>eventLog('Steam text window loaded'));bot.webContents.on('did-fail-load',(event,code,description,url,isMainFrame)=>{if(isMainFrame&&code!==-3)bot.setTitle('ROBOTIC TYLER · Could not load Steam — check connection, then Reload companion');});
 void offerOldVoiceRemoval();
 await bot.loadURL('https://steamcommunity.com/chat/');
 }).catch(error=>{dialog.showErrorBox('ROBOTIC TYLER could not start',String(error.message).replace(/sk-or-[\w-]+|AIza[\w-]+/g,'[redacted]'));app.quit();});
 app.on('before-quit',()=>{try{void voice?.stop('ROBOTIC TYLER is closing.');}catch{}});
 app.on('window-all-closed',()=>{if(!voice||voice.mode==='off')app.quit();});
}

// The old Voice Studio is a separate install (its own uninstall entry and shortcut). Offer once to
// remove it, after its settings were imported. Its data folder is left alone.
async function offerOldVoiceRemoval(){
 if(process.platform!=='win32')return;
 const query=hive=>new Promise(resolve=>execFile('reg',['query',hive+'\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\{'+OLD_VOICE_GUID+'}','/v','UninstallString'],{windowsHide:true},(e,out)=>resolve(e?null:(/UninstallString\s+REG_\w+\s+(.+)/.exec(String(out))||[])[1]?.trim()||null)));
 const uninstall=await query('HKCU')||await query('HKLM');if(!uninstall)return;
 const v=vault,{voiceRemovalAsked}=await v.get('voiceRemovalAsked');if(voiceRemovalAsked)return;
 await new Promise(r=>setTimeout(r,4000));
 const r=await dialog.showMessageBox({type:'question',title:'Remove the old Voice Studio?',message:'The old ROBOTIC TYLER Native Steam Companion (Voice Studio) is still installed.',detail:'Its voice features are part of this app now: open Voice from the tray icon or the ROBOTIC TYLER menu. Its settings were imported. Remove the old app and its shortcut? Its settings folder is kept.',buttons:['Remove it','Keep it'],defaultId:0,cancelId:1,noLink:true});
 await v.set({voiceRemovalAsked:Date.now()});
 if(r.response!==0)return;
 const m=/^"([^"]+)"\s*(.*)$/.exec(uninstall)||[null,uninstall,''];
 try{spawn(m[1],[...m[2].split(/\s+/).filter(Boolean),'/S'],{detached:true,windowsHide:true,stdio:'ignore'}).unref();}catch(error){dialog.showErrorBox('ROBOTIC TYLER','Couldn\'t start the Voice Studio uninstaller: '+error.message+'. Remove it from Windows Settings → Apps.');}
}

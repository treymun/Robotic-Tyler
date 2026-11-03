'use strict';
const {app,BrowserWindow,ipcMain,Menu,shell,safeStorage,webContents,Tray,nativeImage}=require('electron');
const path=require('node:path'),{pathToFileURL}=require('node:url');
const {setupUpdates}=require('./updates.cjs'),{Vault,memoryStorage}=require('./vault.cjs'),{isChat,isSteam,isLocal,settingsKeys,sanitizeSettings}=require('./guards.cjs');
const root=path.join(process.env.LOCALAPPDATA||app.getPath('appData'),'RoboticTylerHydraCloudV12');require('node:fs').mkdirSync(path.join(root,'Data'),{recursive:true});app.setPath('userData',path.join(root,'Data'));
// Electron is intentionally text-only. Chrome remains the voice host.
let bot,options,listener,tray;const removed=[];const activity=[];function eventLog(kind,details=''){activity.unshift({at:Date.now(),kind,details:String(details).slice(0,140)});if(activity.length>120)activity.pop();}
if(!app.requestSingleInstanceLock()){app.quit();}else{
 app.on('second-instance',()=>{if(bot){if(bot.isMinimized())bot.restore();bot.focus();}});
 app.whenReady().then(async()=>{
 const updates=setupUpdates({app,dialog:require('electron').dialog,channel:'control',log:eventLog,onReady:version=>{try{tray?.displayBalloon?.({title:'ROBOTIC TYLER update ready',content:'Version '+version+' installs when you quit.'});}catch{}}});
 try{const icon=nativeImage.createFromPath(path.join(__dirname,'..','assets','robotic-tyler-tray.png'));tray=new Tray(icon.resize({width:16,height:16}));tray.setToolTip('ROBOTIC TYLER · Text Control Center');tray.setContextMenu(Menu.buildFromTemplate([{label:'Open text dashboard',click:()=>bot?.show()},{label:'Open settings',click:()=>openSettings()},{label:'Pause text companion',click:()=>{eventLog('Pause requested');bot?.webContents.send('tyler:message',{type:'v22:stop'});}},{label:'Check for updates…',click:()=>updates.check(bot)},{label:'Quit ROBOTIC TYLER',click:()=>app.quit()}]));tray.on('double-click',()=>bot?.show());}catch(err){eventLog('Tray unavailable',err.message);} 
 const vault=new Vault(path.join(root,'Data','Companion'),safeStorage),sessionStore=memoryStorage();
 const settingsPath=path.join(__dirname,'companion','settings.html');
 const windowDefaults={show:false,backgroundColor:'#14171c',autoHideMenuBar:true,webPreferences:{nodeIntegration:false,contextIsolation:true,sandbox:true,webSecurity:true,allowRunningInsecureContent:false,webviewTag:false}};
 function configure(win,local=false){win.webContents.setWindowOpenHandler(({url})=>{if(/^https:\/\//.test(url)){if(isSteam(url)&&!local)bot.loadURL(url);else shell.openExternal(url);}return {action:'deny'};});win.webContents.on('will-navigate',(event,url)=>{if(local?!isLocal(url,settingsPath):!isSteam(url)){event.preventDefault();if(/^https:\/\//.test(url))shell.openExternal(url);}});win.webContents.session.setPermissionRequestHandler((_wc,permission,callback)=>callback(permission!=='media'&&permission!=='audioCapture'&&permission!=='videoCapture'));win.webContents.session.setPermissionCheckHandler((_wc,permission)=>!['media','audioCapture','videoCapture'].includes(permission));win.once('ready-to-show',()=>win.show());}
 async function openSettings(){if(options&&!options.isDestroyed()){options.focus();return;}options=new BrowserWindow({...windowDefaults,width:980,height:820,title:'ROBOTIC TYLER · Text & Settings',icon:path.join(__dirname,'..','assets','robotic-tyler.png'),webPreferences:{...windowDefaults.webPreferences,preload:path.join(__dirname,'options-preload.cjs')}});configure(options,true);options.on('closed',()=>options=null);await options.loadFile(settingsPath);}
 // chrome.* stand-in for the shared extension background (browser-extension/background.js).
 // storage.onChanged lets the background push non-secret changes (usage, emergency stop…) to the
 // Steam window; tabs.query exposes the single Steam chat window as the only "tab".
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
 globalThis.tylerThemeIcon=theme=>{try{const file=t=>path.join(__dirname,'companion','ui','logos',t),img=nativeImage.createFromPath(file(theme+'.png'));if(img.isEmpty())return;bot?.setIcon?.(img);options?.isDestroyed?.()===false&&options.setIcon(img);const small=nativeImage.createFromPath(file(theme+'-32.png'));if(!small.isEmpty())tray?.setImage(small.resize({width:16,height:16}));}catch{}};
 globalThis.chrome={action:{onClicked:{addListener(){}}},runtime:{onMessage:{addListener(fn){listener=fn;}},openOptionsPage:openSettings},
  storage:{local,session:sessionStore,onChanged:{addListener(fn){changeListeners.push(fn);}}},
  tabs:{get:async id=>{const wc=webContents.fromId(id);if(!wc||wc.isDestroyed())throw Error('Tab closed');return {id,url:wc.getURL()};},
   query:async({url}={})=>{const tab=steamTab();if(!tab)return [];if(url&&!/steamcommunity\.com\/chat/.test(String(url)))return [];return isChat(tab.url)?[tab]:[];},
   sendMessage:async(id,message)=>{const wc=webContents.fromId(id);if(!wc||wc.isDestroyed())throw Error('Tab closed');wc.send('tyler:message',message);},
   create:async({url}={})=>{if(/^https:\/\//.test(String(url||'')))await shell.openExternal(url);return {id:-1};},
   update:async()=>({}),
   onRemoved:{addListener(fn){removed.push(fn);}}}};
 await import(pathToFileURL(path.join(__dirname,'companion','background.js')).href);
 ipcMain.handle('tyler:request',(event,message)=>{if(!bot||event.sender.id!==bot.webContents.id||event.senderFrame!==event.sender.mainFrame||!isChat(event.senderFrame.url))throw Error('Only the Steam chat window can use the companion.');if(!message||typeof message!=='object'||JSON.stringify(message).length>2200000)throw Error('Invalid request');eventLog('Steam text request',String(message.type||'unknown'));return new Promise(resolve=>listener(message,{url:event.senderFrame.url,tab:{id:event.sender.id}},resolve));});
 ipcMain.handle('tyler:settings',async(event,request)=>{if(!options||event.sender.id!==options.webContents.id||event.senderFrame!==event.sender.mainFrame||!isLocal(event.senderFrame.url,settingsPath))throw Error('Settings are available only in the local settings window.');if(request.action==='activity'){return activity.slice(0,60);}if(request.action==='verify'){
 const key=request.key;if(typeof key!=='string'||!key.trim()||key.length>1024)throw Error('Paste the secret from your OpenRouter Keys page.');
 let result;try{result=await fetch('https://openrouter.ai/api/v1/key',{headers:{Authorization:'Bearer '+key},redirect:'error',signal:AbortSignal.timeout(12000)});}catch{throw Error('Could not reach OpenRouter. Check your connection and try Save again.');}
 if([401,403].includes(result.status))throw Error('OpenRouter rejected the key. Paste the full secret from your OpenRouter Keys page.');
 if(!result.ok)throw Error('OpenRouter key check returned HTTP '+result.status+'. Try again shortly.');return true;
 }if(request.action==='get'){const names=(Array.isArray(request.keys)?request.keys:[request.keys]).filter(k=>settingsKeys.has(k));const data=await vault.get(names);if(data.geminiKey)data.geminiKey=true;if(data.openrouterKey)data.openrouterKey=true;delete data.speechKey;return data;}if(request.action==='set'){await local.set(sanitizeSettings(request.values));return {};}if(request.action==='remove'){await local.remove((Array.isArray(request.keys)?request.keys:[request.keys]).filter(k=>settingsKeys.has(k)));return {};}if(request.action==='chat'){bot.loadURL('https://steamcommunity.com/chat/');bot.focus();return {};}throw Error('Unknown settings action');});
 bot=new BrowserWindow({...windowDefaults,width:1380,height:920,minWidth:850,minHeight:620,title:'ROBOTIC TYLER · Control Center',icon:path.join(__dirname,'..','assets','robotic-tyler.png'),webPreferences:{...windowDefaults.webPreferences,partition:'persist:robotic-tyler-steam',backgroundThrottling:false,preload:path.join(__dirname,'steam-preload.cjs')}});configure(bot);bot.on('closed',()=>app.quit());const botId=bot.webContents.id;bot.webContents.on('destroyed',()=>{for(const fn of removed)fn(botId);});
 Menu.setApplicationMenu(Menu.buildFromTemplate([{label:'ROBOTIC TYLER',submenu:[{label:'Steam chat',click:()=>bot.loadURL('https://steamcommunity.com/chat/')},{label:'Personality & API settings',click:openSettings},{label:'Reload companion',click:()=>bot.webContents.reload()},{label:'Check for updates…',click:()=>updates.check(bot)},{type:'separator'},{label:'Open Steam desktop friends',click:()=>shell.openExternal('steam://open/friends')},{label:'Open chat in your browser',click:()=>shell.openExternal('https://steamcommunity.com/chat/')},{type:'separator'},{role:'quit'}]},{label:'View',submenu:[{label:'Pin Tyler above other windows',type:'checkbox',accelerator:'Ctrl+Shift+Y',click:item=>bot.setAlwaysOnTop(item.checked)},{type:'separator'},{role:'zoomIn'},{role:'zoomOut'},{role:'resetZoom'},{role:'togglefullscreen'}]},{label:'Edit',submenu:[{role:'undo'},{role:'redo'},{type:'separator'},{role:'cut'},{role:'copy'},{role:'paste'},{role:'selectAll'}]}]));
 bot.webContents.on('did-finish-load',()=>eventLog('Steam text window loaded'));bot.webContents.on('did-fail-load',(event,code,description,url,isMainFrame)=>{if(isMainFrame&&code!==-3)bot.setTitle('ROBOTIC TYLER · Could not load Steam — check connection, then Reload companion');});
 await bot.loadURL('https://steamcommunity.com/chat/');
 }).catch(error=>{require('electron').dialog.showErrorBox('ROBOTIC TYLER could not start',String(error.message).replace(/sk-or-[\w-]+/g,'[redacted]'));app.quit();});
 app.on('window-all-closed',()=>app.quit());
}



'use strict';
// Electron side of tools/desktop-voice-check/check.mjs: the desktop app's Steam window setup
// (app/steam-voice.cjs and the generated app/steam-preload.cjs, unchanged) around a MOCK Steam chat
// page. Not Steam, not Windows audio. Writes what the page measured to $TYLER_CHECK_OUT.
const {app,BrowserWindow,session,ipcMain,protocol,desktopCapturer}=require('electron');
const fs=require('node:fs'),path=require('node:path');
const ROOT=path.resolve(__dirname,'..','..');
const steamVoice=require(path.join(ROOT,'app','steam-voice.cjs')),{setupDesktopMedia}=require(path.join(ROOT,'app','desktop-media.cjs'));
steamVoice.registerScheme(protocol);
app.commandLine.appendSwitch('use-fake-device-for-media-stream');
app.whenReady().then(async()=>{
 const ses=session.fromPartition('persist:desktop-voice-check'),log=[];let win;
 const setup=steamVoice.setupSteamVoice({session:ses,ipcMain,extensionDir:path.join(ROOT,'browser-extension'),chromeVersion:process.versions.chrome,isVoiceWindow:()=>true,
  isChatFrame:e=>!!win&&e.sender===win.webContents&&e.senderFrame===e.sender.mainFrame,log:(k,d)=>log.push(k+': '+d),onBlockedMicrophone:()=>log.push('blocked-mic')});
 // The mock "Steam": a strict CSP like Steam's (no frames or scripts from elsewhere), so the speech
 // detector frame only loads if the app's own scheme bypasses it, as it must.
 const page=fs.readFileSync(path.join(__dirname,'mock-steam.html'));
 ses.protocol.handle('https',req=>new URL(req.url).hostname==='steamcommunity.com'?new Response(page,{headers:{'content-type':'text/html; charset=utf-8','content-security-policy':"default-src 'self'; script-src 'self' 'unsafe-inline'; frame-src 'self'; connect-src 'self'; media-src 'self' blob:"}}):new Response('',{status:404}));
 // The shared background is not part of this check: every request gets a plain refusal.
 ipcMain.handle('tyler:request',()=>({ok:false,error:'not part of this check'}));
 win=new BrowserWindow({show:false,webPreferences:{partition:'persist:desktop-voice-check',contextIsolation:true,sandbox:true,nodeIntegration:false,backgroundThrottling:false,autoplayPolicy:'no-user-gesture-required',preload:path.join(ROOT,'app','steam-preload.cjs')}});
 setup.applyPermissions();setup.watch(win.webContents);
 // Music DJ and screen sharing (app/desktop-media.cjs). The picker is answered automatically here
 // (the first screen); in the app you choose in its picker window.
 const picked=[];
 const media=setupDesktopMedia({BrowserWindow,desktopCapturer,ipcMain,shell:{openExternal:async()=>{}},steamSession:ses,windowDefaults:{show:false,webPreferences:{contextIsolation:true,sandbox:true}},dir:path.join(ROOT,'app'),
  isVoiceWindow:()=>true,isSteamFrame:f=>{const top=win.webContents.mainFrame;return !!f&&!f.parent&&f.processId===top.processId&&f.routingId===top.routingId;},log:(k,d)=>log.push(k+': '+d),
  choose:async sources=>{picked.push(...sources.map(s=>s.id.split(':')[0]));return (sources.find(s=>s.id.startsWith('screen:'))||sources[0])?.id||null;}});
 // A mock YouTube page in the Music window's own session: it plays a tone.
 session.fromPartition('persist:robotic-tyler-youtube').protocol.handle('https',()=>new Response(fs.readFileSync(path.join(__dirname,'mock-youtube.html')),{headers:{'content-type':'text/html; charset=utf-8'}}));
 ipcMain.handle('tyler:youtube',()=>({ok:true}));
 await win.loadURL('https://steamcommunity.com/chat/');
 const result=await win.webContents.executeJavaScript('window.__checkDone',true);
 await media.openYouTube('https://www.youtube.com/');await new Promise(r=>setTimeout(r,1500));
 // A click in Tyler's panel starts these in the app; here a simulated user gesture does.
 const shares=await win.webContents.executeJavaScript('window.__shareChecks()',true);
 fs.writeFileSync(process.env.TYLER_CHECK_OUT,JSON.stringify({...result,...shares,picked,mainLog:log},null,1));
 app.quit();
});

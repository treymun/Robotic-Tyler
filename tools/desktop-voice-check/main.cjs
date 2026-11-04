'use strict';
// Electron side of tools/desktop-voice-check/check.mjs: the desktop app's Steam window setup
// (app/steam-voice.cjs and the generated app/steam-preload.cjs, unchanged) around a MOCK Steam chat
// page. Not Steam, not Windows audio. Writes what the page measured to $TYLER_CHECK_OUT.
const {app,BrowserWindow,session,ipcMain,protocol,desktopCapturer,webContents}=require('electron');
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
 // except the phone remote's answers (v2.25), which reach the app's remote server as in app/main.cjs.
 const remoteJobs=new Map();let remoteSeq=0;
 ipcMain.handle('tyler:request',(_e,m)=>{if(m?.type==='remote:result'){const job=remoteJobs.get(m.id);if(job){remoteJobs.delete(m.id);m.ok?job.resolve(m.data||{}):job.reject(Error(m.error||'failed'));}return {ok:true};}return {ok:false,error:'not part of this check'};});
 const ask=(action,args)=>new Promise((resolve,reject)=>{const id='r'+(++remoteSeq);setTimeout(()=>{if(remoteJobs.delete(id))reject(Error('no answer'));},8000);remoteJobs.set(id,{resolve,reject});win.webContents.send('tyler:message',{type:'remote:action',id,action,args});});
 win=new BrowserWindow({show:false,width:1380,height:920,webPreferences:{partition:'persist:desktop-voice-check',contextIsolation:true,sandbox:true,nodeIntegration:false,backgroundThrottling:false,autoplayPolicy:'no-user-gesture-required',preload:path.join(ROOT,'app','steam-preload.cjs')}});
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
 // v2.23: in the app's window size the panel docks beside the chat: a full-height column on the
 // right, with the (mock) Steam page narrowed so it isn't covered.
 await new Promise(r=>setTimeout(r,400));
 result.dock=await win.webContents.executeJavaScript('(()=>{const h=document.getElementById("tyler-companion-root");return {dock:h?.dataset.dock,body:Math.round(document.body.getBoundingClientRect().width),window:innerWidth,height:innerHeight};})()',true);
 await media.openYouTube('https://www.youtube.com/');await new Promise(r=>setTimeout(r,1500));
 // A click in Tyler's panel starts these in the app; here a simulated user gesture does.
 const shares=await win.webContents.executeJavaScript('window.__shareChecks()',true);
 // Muted Steam window (v2.20.3): Tyler still hears the call while the window plays nothing.
 shares.unmuted=await win.webContents.executeJavaScript('window.__hearMuted()',true);
 win.webContents.setAudioMuted(true);
 shares.muted={...await win.webContents.executeJavaScript('window.__hearMuted()',true),windowMuted:win.webContents.isAudioMuted()};
 win.webContents.setAudioMuted(false);
 shares.keepQuiet=await win.webContents.executeJavaScript('window.__keepQuiet()',true);
 // Phone remote (v2.25): a phone pairs over HTTP and reads Tyler's status from this window.
 shares.remote=await (async()=>{const {setupRemote}=require(path.join(ROOT,'app','remote.cjs')),{memoryStorage}=require(path.join(ROOT,'app','vault.cjs')),http=require('node:http');
  const remote=setupRemote({vault:memoryStorage(),ask,pageDir:path.join(ROOT,'app','remote'),uiDir:path.join(ROOT,'app','companion','ui'),version:'check'});
  try{const st=await remote.handle('enable'),port=st.port;
   const req=(method,p,body,cookie)=>new Promise((resolve,reject)=>{const r=http.request({host:'127.0.0.1',port,method,path:p,headers:{'content-type':'application/json','x-tyler-remote':'1',...(cookie?{cookie}:{})}},res=>{const parts=[];res.on('data',c=>parts.push(c));res.on('end',()=>resolve({status:res.statusCode,cookie:String(res.headers['set-cookie']||'').split(';')[0],json:JSON.parse(Buffer.concat(parts).toString()||'{}')}));});r.on('error',reject);if(body)r.write(JSON.stringify(body));r.end();});
   const paired=await req('POST','/pair',{code:st.code}),state=await req('GET','/state',null,paired.cookie);
   return {paired:paired.status,state:state.status,ready:state.json.ready===true,tylerState:state.json.state||state.json.error,hasSounds:Array.isArray(state.json.sounds)};
  }catch(e){return {error:e.message};}finally{await remote.stop();}
 })();
 // One click (v2.20.1): Start Music DJ opens the Music window in the background and asks for the
 // share in the same click, before the window exists; the app waits for it and shares its sound.
 const old=media.youtubeId();if(old!==null)BrowserWindow.fromWebContents(webContents.fromId(old))?.destroy();
 await new Promise(r=>setTimeout(r,300));
 // The share request reaches the app first; the window opens half a second later.
 const asking=win.webContents.executeJavaScript('window.__oneClick()',true);
 await new Promise(r=>setTimeout(r,500));const opening=media.openYouTube('https://www.youtube.com/',{background:true});
 const oneClick=await asking;await opening;
 const yt=media.youtubeId()!==null?BrowserWindow.fromWebContents(webContents.fromId(media.youtubeId())):null;
 shares.oneClick={...oneClick,windowOpen:!!yt&&yt.isVisible(),reopened:old!==media.youtubeId()};
 fs.writeFileSync(process.env.TYLER_CHECK_OUT,JSON.stringify({...result,...shares,picked,mainLog:log},null,1));
 app.quit();
});

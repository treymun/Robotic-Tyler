'use strict';
// ROBOTIC TYLER Electron voice test (prototype). A separate small app, not the desktop app: Steam web
// chat on the left, the test panel (shared with the WebView2 test) on the right.
//
// Why it exists: Steam's web chat only starts voice when the browser calls itself Chrome or Edge,
// and it sends that name to Steam's voice server, which builds the call from it. Electron calls
// itself "Electron", so Steam refuses; WebView2 calls itself Edge and was dropped when a second
// person joined. This test gives the Steam window the exact user agent of Google Chrome for the
// same engine version ("Same as Chrome", the default here) and measures what happens.
//
// Modes: manual (Stage 1: nothing of Tyler's) and bridge (Stage 2B: Tyler's in-page audio files
// and a beep / listen / echo test bar). Data: %LOCALAPPDATA%\RoboticTylerElectronVoiceTest.
//
// The leave fix (web/sdp-repair.js, on by default, switchable in the panel): when someone leaves,
// the browser rejected Steam's next offer because it still routed that person's stream by a
// remembered section tag (MID), and Steam ended the bot's call. 0.1.2 removes the MID tag from
// Steam's descriptions so streams are routed by the SSRCs Steam lists (0.1.1 only fixed listed
// collisions, which Steam's real offers don't have).
const {app,BaseWindow,WebContentsView,session,ipcMain,dialog,clipboard,shell,protocol,net}=require('electron');
const path=require('node:path'),fs=require('node:fs'),os=require('node:os'),{pathToFileURL}=require('node:url');

const VERSION='0.1.3';
const STEAM_CHAT='https://steamcommunity.com/chat/';
const DATA=process.env.TYLER_TEST_DATA||path.join(process.env.LOCALAPPDATA||app.getPath('appData'),'RoboticTylerElectronVoiceTest');
app.setPath('userData',path.join(DATA,'Profile'));
const WEB=path.join(__dirname,'web'),BRIDGE_DIR=path.join(__dirname,'bridge');
const BRIDGE_FILES=['soundboard-core.js','soundboard-audio.js','live-pcm.js','audio-bridge.js','wav-codec.js','noise-filter.js','voice-listener.js'];
const STATE=path.join(DATA,'test-state.json');
const PANEL_WIDTH=470;
// Hooks for the automated check (tools/electron-voice-test/check.mjs; TYLER_TEST_DATA above too); inert unless set.
const SMOKE={mock:process.env.TYLER_TEST_MOCK_STEAM||'',report:process.env.TYLER_TEST_REPORT||'',seconds:Number(process.env.TYLER_TEST_SECONDS||0),allow:process.env.TYLER_TEST_AUTO_ALLOW==='1'};

protocol.registerSchemesAsPrivileged([{scheme:'tyler-test',privileges:{standard:true,secure:true,supportFetchAPI:true}}]);
if(!app.requestSingleInstanceLock()){app.quit();}

let win,steam,panel,steamSession,panelReady=false;const pending=[];
let state={mode:'manual',identity:'chrome',repair:'on'};
try{state={...state,...JSON.parse(fs.readFileSync(STATE,'utf8'))};}catch{}
const save=()=>{try{fs.mkdirSync(DATA,{recursive:true});fs.writeFileSync(STATE,JSON.stringify(state));}catch{}};
let electronUserAgent='';
// Google Chrome's own user agent for this engine version (Chrome reports only the major version).
const chromeUserAgent=()=>`Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${process.versions.chrome.split('.')[0]}.0.0.0 Safari/537.36`;
const userAgent=()=>state.identity==='chrome'?chromeUserAgent():electronUserAgent;
const isSteam=u=>{try{const x=new URL(u);return x.protocol==='https:'&&(x.hostname==='steamcommunity.com'||x.hostname.endsWith('.steamcommunity.com')||['store.steampowered.com','help.steampowered.com','login.steampowered.com'].includes(x.hostname));}catch{return false;}};
const origin=u=>{try{return new URL(u).origin;}catch{return String(u||'');}};

function toPanel(message){
 if(!panel||!panelReady){if(pending.length<500)pending.push(message);return;}
 try{panel.webContents.send('test:to-panel',message);}catch{}
}
function sendState(){
 toPanel({type:'host',platform:'electron',app:VERSION,runtime:'Electron '+process.versions.electron+' · Chromium '+process.versions.chrome,sdk:'n/a',
  os:os.type()+' '+os.release(),arch:process.arch,userAgent:userAgent(),defaultUserAgent:electronUserAgent,profile:DATA,mode:state.mode,identity:state.identity,repair:state.repair==='off'?'off':'on',
  modes:['manual','bridge'],extension:{bundled:false,installed:false,enabled:false,id:'',version:'',error:''},bridgeInjected:state.mode==='bridge'});
}
function bridgeScript(){
 let code="(function(){if(window!==window.top||location.hostname!=='steamcommunity.com'||!location.pathname.startsWith('/chat'))return;\n";
 for(const f of BRIDGE_FILES)code+='// ── '+f+'\n'+fs.readFileSync(path.join(BRIDGE_DIR,f),'utf8')+'\n;\n';
 return code+fs.readFileSync(path.join(WEB,'bridge-only.js'),'utf8')+'\n})();';
}

function layout(){
 if(!win)return;const {width,height}=win.getContentBounds();
 steam.setBounds({x:0,y:0,width:Math.max(300,width-PANEL_WIDTH),height});
 panel.setBounds({x:Math.max(300,width-PANEL_WIDTH),y:0,width:Math.min(PANEL_WIDTH,width),height});
}

app.whenReady().then(async()=>{
 fs.mkdirSync(DATA,{recursive:true});
 session.defaultSession.protocol.handle('tyler-test',req=>{
  const rel=decodeURIComponent(new URL(req.url).pathname).replace(/^\/+/,'');
  const file=path.join(WEB,rel);
  if(!file.startsWith(WEB+path.sep)||!fs.existsSync(file))return new Response('Not found',{status:404});
  return net.fetch(pathToFileURL(file).toString());
 });
 steamSession=session.fromPartition('persist:steam-voice-test');
 electronUserAgent=steamSession.getUserAgent();
 steamSession.setUserAgent(userAgent());
 if(SMOKE.mock)steamSession.protocol.handle('https',req=>new URL(req.url).hostname==='steamcommunity.com'?new Response(fs.readFileSync(SMOKE.mock),{headers:{'content-type':'text/html'}}):net.fetch(req,{bypassCustomProtocolHandlers:true}));
 // Microphone requests from Steam: the test asks you, and the panel records the answer.
 steamSession.setPermissionRequestHandler((wc,permission,callback,details)=>{
  if(permission!=='media'){callback(['fullscreen','clipboard-sanitized-write'].includes(permission));toPanel({type:'permission',kind:permission,origin:origin(details.requestingUrl),userInitiated:true,mode:state.mode,state:'default'});return;}
  const kinds=(details.mediaTypes||[]).join(' + ')||'media',mic=(details.mediaTypes||[]).includes('audio');
  if(!isSteam(details.requestingUrl)){callback(false);return;}
  if(SMOKE.allow){callback(true);toPanel({type:'permission',kind:mic?'Microphone':kinds,origin:origin(details.requestingUrl),userInitiated:true,mode:state.mode,state:'allowed'});return;}
  const note=state.mode==='manual'?'Allow it to test a normal voice call.':"Tyler's synthetic microphone should make this unnecessary, so this request means the physical microphone is being asked for. Choose No for the Stage 2B test.";
  dialog.showMessageBox(win,{type:'question',buttons:['Allow','Block'],defaultId:0,cancelId:1,title:'Permission request · Electron voice test',
   message:origin(details.requestingUrl)+' wants to use your '+(mic?'microphone':kinds)+'.',detail:note}).then(({response})=>{
   const ok=response===0;callback(ok);
   toPanel({type:'permission',kind:mic?'Microphone':kinds,origin:origin(details.requestingUrl),userInitiated:true,mode:state.mode,state:ok?'allowed':'denied'});
  }).catch(()=>callback(false));
 });
 steamSession.setPermissionCheckHandler((wc,permission,requestingOrigin)=>permission==='media'?isSteam(requestingOrigin):permission==='fullscreen');

 win=new BaseWindow({width:1560,height:980,minWidth:1100,minHeight:700,title:'ROBOTIC TYLER · Electron voice test (prototype)',icon:path.join(WEB,'tyler.png'),backgroundColor:'#12171d'});
 steam=new WebContentsView({webPreferences:{partition:'persist:steam-voice-test',preload:path.join(__dirname,'preload-steam.cjs'),contextIsolation:true,sandbox:true,nodeIntegration:false}});
 panel=new WebContentsView({webPreferences:{preload:path.join(__dirname,'preload-panel.cjs'),contextIsolation:true,sandbox:true,nodeIntegration:false}});
 win.contentView.addChildView(steam);win.contentView.addChildView(panel);layout();win.on('resize',layout);
 win.on('closed',()=>app.quit());

 const wc=steam.webContents;
 wc.setWindowOpenHandler(({url})=>{
  if(isSteam(url))return {action:'allow',overrideBrowserWindowOptions:{autoHideMenuBar:true,webPreferences:{partition:'persist:steam-voice-test',contextIsolation:true,sandbox:true}}};
  if(/^https?:\/\//.test(url))shell.openExternal(url);
  return {action:'deny'};
 });
 wc.on('did-navigate',(_e,url)=>toPanel({type:'nav',phase:'done',ok:true,status:'',url:origin(url)+new URL(url).pathname}));
 wc.on('did-fail-load',(_e,code,desc,url,isMain)=>{if(isMain)toPanel({type:'nav',phase:'done',ok:false,status:code+' '+desc,url:origin(url)});});
 wc.on('render-process-gone',(_e,d)=>toPanel({type:'process-failed',kind:d.reason,reason:String(d.exitCode)}));

 panel.webContents.loadURL('tyler-test://panel/panel.html');
 wc.loadURL(STEAM_CHAT);
 if(SMOKE.report&&SMOKE.seconds)setTimeout(async()=>{
  try{const report=await panel.webContents.executeJavaScript('window.__tylerTestReport()'),ua=await wc.executeJavaScript('navigator.userAgent');fs.writeFileSync(SMOKE.report,'PAGE UA: '+ua+'\n'+report);}
  catch(err){fs.writeFileSync(SMOKE.report,'SMOKE ERROR '+err.message);}
  app.quit();
 },SMOKE.seconds*1000);
});

// The Steam page asks for its scripts at document start (synchronously, before Steam's own code).
ipcMain.on('test:scripts',e=>{
 if(e.sender!==steam?.webContents){e.returnValue=null;return;}
 try{e.returnValue={diag:fs.readFileSync(path.join(WEB,'diagnostics.js'),'utf8'),repair:state.repair==='off'?'':fs.readFileSync(path.join(WEB,'sdp-repair.js'),'utf8'),bridge:state.mode==='bridge'?bridgeScript():''};}
 catch(err){e.returnValue={diag:'',repair:'',bridge:'',error:String(err.message)};}
});
ipcMain.on('test:diag',(e,m)=>{
 if(e.sender!==steam?.webContents||!m||typeof m!=='object')return;
 try{if(!isSteam(e.senderFrame?.url||e.sender.getURL()))return;}catch{return;}
 const json=JSON.stringify(m);if(json.length>20000)return;
 toPanel({type:'page',msg:m});
});
ipcMain.on('test:panel',async(e,m)=>{
 if(e.sender!==panel?.webContents||!m)return;
 switch(m.action){
  case 'ready':panelReady=true;sendState();for(const p of pending.splice(0))panel.webContents.send('test:to-panel',p);break;
  case 'mode':state.mode=m.mode==='bridge'?'bridge':'manual';save();sendState();steam.webContents.loadURL(STEAM_CHAT);break;
  case 'identity':state.identity=m.identity==='chrome'?'chrome':'default';save();steamSession.setUserAgent(userAgent());sendState();steam.webContents.loadURL(STEAM_CHAT);break;
  case 'repair':state.repair=m.repair==='off'?'off':'on';save();sendState();steam.webContents.loadURL(STEAM_CHAT);break;
  case 'reload':steam.webContents.loadURL(STEAM_CHAT);break;
  case 'devtools':steam.webContents.openDevTools({mode:'detach'});break;
  case 'open-data':shell.openPath(DATA);break;
  case 'copy':clipboard.writeText(String(m.text||''));toPanel({type:'copied'});break;
  case 'save-report':{
   const desktop=app.getPath('desktop'),dir=fs.existsSync(desktop)?desktop:DATA;
   const stamp=new Date().toISOString().replace(/[-:]/g,'').replace('T','-').slice(0,15);
   const file=path.join(dir,'RoboticTyler-Electron-voice-test-'+stamp+'.txt');
   try{fs.writeFileSync(file,String(m.text||''),'utf8');clipboard.writeText(String(m.text||''));toPanel({type:'saved',path:file});}
   catch(err){toPanel({type:'notice',text:"Couldn't save the report: "+err.message});}
   break;
  }
 }
});
app.on('second-instance',()=>{if(win){win.show();win.focus();}});

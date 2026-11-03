'use strict';
// Steam voice in the app's own Steam chat window (v2.19), the way the Chrome extension does it: no
// VB-CABLE, no Windows audio helper. Settings → Voice → "Where Tyler joins voice" picks this
// ("window", the default) or the older route through VB-CABLE and the Steam desktop app ("cable",
// native-voice.cjs), which keeps this window text-only.
//
// What the window needs for voice, all scoped to its own session:
//  - Google Chrome's user agent for this engine version: Steam's web chat only starts voice in a
//    browser that calls itself Chrome or Edge, and its voice server builds the call from that name
//    (Electron's own name is refused; Edge's gets an older call setup that drops the bot as soon as
//    a second person joins). Tested live in tools/electron-voice-test.
//  - the physical microphone and camera stay blocked: Tyler's synthetic microphone (audio-bridge.js,
//    switched on by the preload) answers Steam's request, so Steam never needs a device;
//  - the local speech detector page (neural-host.html and its model), served from the app itself on
//    tyler-app://companion/ and nothing else;
//  - chrome.runtime.connect for Gemini Live (live-voice.js ↔ the shared background's Live handler).
const fs=require('node:fs'),path=require('node:path');
const SCHEME='tyler-app';
const chromeUserAgent=chromeVersion=>`Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${String(chromeVersion).split('.')[0]}.0.0.0 Safari/537.36`;
// Called before the app is ready (Electron only allows it then).
function registerScheme(protocol){protocol.registerSchemesAsPrivileged([{scheme:SCHEME,privileges:{standard:true,secure:true,bypassCSP:true,supportFetchAPI:true,corsEnabled:true}}]);}
const TYPES={'.html':'text/html; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.js':'text/javascript; charset=utf-8','.wasm':'application/wasm','.onnx':'application/octet-stream','.txt':'text/plain; charset=utf-8'};
// Only the speech detector's own files; everything else is "not found".
function neuralFile(extensionDir,url){
 let u;try{u=new URL(url);}catch{return null;}
 if(u.protocol!==SCHEME+':'||u.host!=='companion')return null;
 const rel=decodeURIComponent(u.pathname).replace(/^\/+/,'');
 if(!/^(neural-host\.(html|mjs)|neural\/[\w.-]+)$/.test(rel)||rel.includes('..'))return null;
 const base=path.resolve(extensionDir),file=path.resolve(base,rel);
 return file.startsWith(base+path.sep)?file:null;
}

function setupSteamVoice({session,ipcMain,extensionDir,chromeVersion,isVoiceWindow,isChatFrame,log=()=>{},onBlockedMicrophone=()=>{}}){
 const defaultAgent=session.getUserAgent();
 // The engine's major version (from Electron, else from its own user agent).
 const major=String(chromeVersion||'').split('.')[0]||(/Chrome\/(\d+)/.exec(defaultAgent)||[])[1]||'0';
 const applyMode=()=>session.setUserAgent(isVoiceWindow()?chromeUserAgent(major):defaultAgent);
 applyMode();
 // Physical microphone and camera: always blocked in this window (also in voice mode, where the
 // synthetic microphone answers Steam before a request could reach here).
 function applyPermissions(){
  session.setPermissionRequestHandler((_wc,permission,callback,details)=>{
   const media=permission==='media'||permission==='audioCapture'||permission==='videoCapture';
   if(media&&isVoiceWindow()&&(details?.mediaTypes||[]).includes('audio')){log('Blocked the physical microphone','Steam asked before Tyler\'s voice was ready');onBlockedMicrophone();}
   callback(!media);
  });
  session.setPermissionCheckHandler((_wc,permission)=>!['media','audioCapture','videoCapture'].includes(permission));
 }
 applyPermissions();
 session.protocol.handle(SCHEME,async request=>{
  const file=neuralFile(extensionDir,request.url);
  if(!file)return new Response('Not found',{status:404});
  try{return new Response(await fs.promises.readFile(file),{headers:{'content-type':TYPES[path.extname(file)]||'application/octet-stream','cache-control':'no-store'}});}
  catch{return new Response('Not found',{status:404});}
 });
 // The preload asks which mode to start in, before Steam's scripts run.
 ipcMain.on('tyler:desktop-mode',event=>{event.returnValue=isChatFrame(event)?{voice:isVoiceWindow()}:{voice:false};});
 // chrome.runtime.connect / onConnect between the Steam window and the shared background.
 const connectListeners=[],ports=new Map();
 ipcMain.on('tyler:port',(event,data)=>{
  if(!isChatFrame(event)||!isVoiceWindow()||!data||typeof data!=='object'||!Number.isInteger(data.id))return;
  const wc=event.sender,key=wc.id+':'+data.id;
  if(data.op==='open'){
   if(ports.has(key)||ports.size>=8)return;
   const onMessage=[],onDisconnect=[];let open=true;
   const port={name:String(data.name||'').slice(0,40),sender:{tab:{id:wc.id},url:event.senderFrame.url},
    postMessage:message=>{if(open&&!wc.isDestroyed())wc.send('tyler:port',{op:'message',id:data.id,message});},
    disconnect:()=>{if(!open)return;open=false;ports.delete(key);if(!wc.isDestroyed())wc.send('tyler:port',{op:'close',id:data.id});},
    onMessage:{addListener:fn=>onMessage.push(fn)},onDisconnect:{addListener:fn=>onDisconnect.push(fn)}};
   ports.set(key,{wc:wc.id,port,onMessage,end:()=>{if(!open)return;open=false;ports.delete(key);for(const fn of onDisconnect){try{fn(port);}catch{}}}});
   for(const fn of connectListeners){try{fn(port);}catch(error){log('Port listener failed',error.message);}}
   return;
  }
  const entry=ports.get(key);if(!entry)return;
  if(data.op==='message'){let size=0;try{size=JSON.stringify(data.message??null).length;}catch{return;}if(size>200000)return;for(const fn of entry.onMessage){try{fn(data.message,entry.port);}catch{}}}
  else if(data.op==='close')entry.end();
 });
 // A new page, a crash or a closed window ends that window's ports, like a closed tab in Chrome.
 const closeWindow=wcId=>{for(const entry of [...ports.values()])if(entry.wc===wcId)entry.end();};
 function watch(webContents){
  const id=webContents.id;
  // Electron 45 passes one details object (isMainFrame, isSameDocument); older ones passed them positionally.
  webContents.on('did-start-navigation',function(details,_url,isInPlace,isMainFrame){const d=details&&typeof details==='object'&&'isMainFrame' in details?details:{isMainFrame,isSameDocument:isInPlace};if(d.isMainFrame&&!d.isSameDocument)closeWindow(id);});
  webContents.on('render-process-gone',()=>closeWindow(id));
  webContents.on('destroyed',()=>closeWindow(id));
 }
 return {applyMode,applyPermissions,watch,onConnect:{addListener:fn=>connectListeners.push(fn)},openPorts:()=>ports.size};
}
module.exports={SCHEME,chromeUserAgent,registerScheme,setupSteamVoice,neuralFile};

'use strict';
// Music sharing and screen awareness in the desktop app's Steam window (v2.19), the two extension
// features that relied on Chrome itself:
//  - Music DJ: Chrome opens YouTube in a second tab and you share that tab's audio. Here the
//    "tab" is the app's own YouTube window (its own session, youtube-music.js via
//    youtube-preload.cjs), and "Share that tab's audio" captures exactly that window's sound: never
//    the screen, never Steam, never the system audio.
//  - Screen awareness: Chrome shows its screen picker. Here the app shows its own picker
//    (screen-picker.html) with your screens and windows; nothing is shared until you choose one.
// Only the Steam chat window, in voice mode, can ask; anything else is refused.
const path=require('node:path');
const isYouTube=u=>{try{const x=new URL(u);return x.protocol==='https:'&&(x.hostname==='www.youtube.com'||x.hostname==='youtube.com'||x.hostname==='m.youtube.com');}catch{return false;}};
// YouTube needs its consent and sign-in pages too; anything else opens in the normal browser.
const youtubeMayOpen=u=>{try{const x=new URL(u);return x.protocol==='https:'&&/(^|\.)(youtube\.com|google\.com|googleusercontent\.com|gstatic\.com)$/.test(x.hostname);}catch{return false;}};

function setupDesktopMedia({BrowserWindow,desktopCapturer,ipcMain,shell,steamSession,windowDefaults={},icon,dir,isVoiceWindow,isSteamFrame,parent=()=>null,log=()=>{},onClosed=()=>{},choose,userAgent}){
 let youtube=null;
 const alive=()=>!!youtube&&!youtube.isDestroyed()&&!youtube.webContents.isDestroyed();
 // background:true (Start Music DJ): open without taking focus, so Steam stays in front.
 async function openYouTube(url='https://www.youtube.com/',{background=false}={}){
  if(!isYouTube(url))url='https://www.youtube.com/';
  if(!alive()){
   youtube=new BrowserWindow({...windowDefaults,show:true,width:1120,height:760,minWidth:640,minHeight:420,title:'ROBOTIC TYLER · Music (YouTube)',icon,
    webPreferences:{...(windowDefaults.webPreferences||{}),partition:'persist:robotic-tyler-youtube',backgroundThrottling:false,autoplayPolicy:'no-user-gesture-required',preload:path.join(dir,'youtube-preload.cjs')}});
   const wc=youtube.webContents,id=wc.id;
   // YouTube gets Google Chrome's name, as in the Steam window, so it serves its usual desktop site.
   if(userAgent)wc.setUserAgent(userAgent);
   wc.setWindowOpenHandler(({url:next})=>{if(isYouTube(next))void wc.loadURL(next);else if(/^https:\/\//.test(next))void shell.openExternal(next);return {action:'deny'};});
   wc.on('will-navigate',(event,next)=>{if(!youtubeMayOpen(next)){event.preventDefault();if(/^https:\/\//.test(next))void shell.openExternal(next);}});
   wc.session.setPermissionRequestHandler((_wc,permission,callback)=>callback(!['media','audioCapture','videoCapture','geolocation','notifications'].includes(permission)));
   youtube.on('closed',()=>{youtube=null;onClosed(id);});
   log('Music window opened');
  }
  const win=youtube,load=win.loadURL(url);
  if(background){if(!win.isVisible())win.showInactive();}else win.show();
  await load;
  return {id:win.webContents.id};
 }
 function update(id,props={}){
  if(!alive()||youtube.webContents.id!==id)return false;
  if(props.url&&isYouTube(props.url))void youtube.webContents.loadURL(props.url);
  if(props.active){youtube.show();youtube.focus();}
  return true;
 }
 // Requests from the YouTube window go to the shared background only for its music messages.
 function isYouTubeFrame(event){return alive()&&event.sender===youtube.webContents&&event.senderFrame===event.sender.mainFrame&&isYouTube(event.senderFrame?.url);}
 // getDisplayMedia from the Steam window.
 const pick=choose||(sources=>pickWithWindow(sources));
 let picking=false;
 steamSession.setDisplayMediaRequestHandler(async(request,callback)=>{
  const deny=why=>{if(why)log('Screen or music share refused',why);try{callback({});}catch{}};
  try{
   if(!isVoiceWindow())return deny('the Steam window is text only');
   if(!isSteamFrame(request.frame))return deny('not the Steam chat window');
   if(request.audioRequested){
    // Music DJ: the YouTube window's own picture and sound. Start Music DJ asks for the share in the
    // same click that opens the window, so give the window a moment to appear.
    for(let i=0;i<40&&!alive();i++)await new Promise(r=>setTimeout(r,100));
    if(!alive())return deny('open the YouTube music window first');
    const frame=youtube.webContents.mainFrame;log('Music share','the YouTube window');
    return callback({video:frame,audio:frame});
   }
   // Screen awareness: picture only, from the screen or window you pick.
   if(picking)return deny('a picker is already open');
   picking=true;
   try{
    // Screens and windows are listed separately: when one list fails (windows can't always be listed
    // on Linux), asking for both at once returns nothing at all, not even the screens.
    const list=async type=>{try{return await desktopCapturer.getSources({types:[type],thumbnailSize:{width:320,height:180},fetchWindowIcons:false});}catch(error){log('Could not list '+type+'s',error.message);return [];}};
    const sources=[...await list('screen'),...await list('window')].filter(s=>!/^ROBOTIC TYLER/.test(s.name));
    const id=await pick(sources);
    const source=sources.find(s=>s.id===id);
    if(!source)return deny('nothing chosen');
    log('Screen share',source.name.slice(0,60));
    callback({video:source});
   }finally{picking=false;}
  }catch(error){deny(error.message);}
 },{useSystemPicker:false});

 // The picker window: thumbnails of screens and windows, Share or Cancel.
 let pending=null;
 ipcMain.handle('tyler:picker',(event,req)=>{
  if(!pending||event.sender!==pending.win.webContents)throw Error('No picker open');
  if(req?.action==='sources')return pending.sources.map(s=>({id:s.id,name:s.name,kind:s.id.startsWith('screen:')?'screen':'window',thumbnail:s.thumbnail?.isEmpty?.()===false?s.thumbnail.toDataURL():''}));
  if(req?.action==='choose'){const p=pending;pending=null;p.resolve(typeof req.id==='string'?req.id:null);p.win.close();return true;}
  if(req?.action==='cancel'){const p=pending;pending=null;p.resolve(null);p.win.close();return true;}
  throw Error('Unknown picker action');
 });
 function pickWithWindow(sources){
  return new Promise(resolve=>{
   const owner=parent();
   const win=new BrowserWindow({...windowDefaults,show:false,width:860,height:620,minWidth:520,minHeight:420,title:'ROBOTIC TYLER · Choose what Tyler sees',icon,parent:owner||undefined,modal:!!owner,
    webPreferences:{...(windowDefaults.webPreferences||{}),preload:path.join(dir,'screen-picker-preload.cjs')}});
   pending={win,sources,resolve};
   win.webContents.on('will-navigate',e=>e.preventDefault());win.webContents.setWindowOpenHandler(()=>({action:'deny'}));
   win.on('closed',()=>{if(pending?.win===win){pending=null;resolve(null);}});
   win.once('ready-to-show',()=>win.show());
   void win.loadFile(path.join(dir,'screen-picker.html'));
  });
 }
 return {openYouTube,update,isYouTubeFrame,youtubeId:()=>alive()?youtube.webContents.id:null};
}
module.exports={setupDesktopMedia,isYouTube};

'use strict';
const {isChat}=require('./guards.cjs');
const steamOrigin='https://steamcommunity.com';
function isChatWindow(win,wc){
 return !!wc && wc===win.webContents && !wc.isDestroyed() && isChat(wc.getURL());
}
function configureVoicePermissions(win,local){
 const session=win.webContents.session;
 session.setPermissionCheckHandler((wc,permission,origin,details)=>{
   return !local && permission==='media' && isChatWindow(win,wc) &&
     origin===steamOrigin && details?.mediaType==='audio';
 });
 session.setPermissionRequestHandler((wc,permission,callback,details)=>{
   const types=details?.mediaTypes;
   callback(!local && permission==='media' && isChatWindow(win,wc) &&
     details?.isMainFrame===true && isChat(details.requestingUrl) &&
     Array.isArray(types) && types.length>0 && types.every(t=>t==='audio'));
 });
}
module.exports={configureVoicePermissions};

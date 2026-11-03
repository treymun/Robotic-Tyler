'use strict';
// Test panel: the same host API the WebView2 test gives it (postMessage + message events).
const {contextBridge,ipcRenderer}=require('electron');
contextBridge.exposeInMainWorld('tylerHost',{
 postMessage:m=>ipcRenderer.send('test:panel',m),
 addEventListener:(type,fn)=>{if(type==='message')ipcRenderer.on('test:to-panel',(_e,data)=>fn({data}));}
});

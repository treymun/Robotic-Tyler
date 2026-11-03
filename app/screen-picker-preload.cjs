'use strict';
// Screen picker window (v2.19): lists the screens and windows the main process found, and returns
// the one you choose. Nothing else.
const {contextBridge,ipcRenderer}=require('electron');
contextBridge.exposeInMainWorld('tylerPicker',{
 sources:()=>ipcRenderer.invoke('tyler:picker',{action:'sources'}),
 choose:id=>ipcRenderer.invoke('tyler:picker',{action:'choose',id:String(id)}),
 cancel:()=>ipcRenderer.invoke('tyler:picker',{action:'cancel'})
});

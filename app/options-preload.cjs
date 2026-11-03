'use strict';
const {contextBridge,ipcRenderer}=require('electron');
contextBridge.exposeInMainWorld('tylerSettings',{activity:()=>ipcRenderer.invoke('tyler:settings',{action:'activity'}),verifyKey:key=>ipcRenderer.invoke('tyler:settings',{action:'verify',key}),storage:{local:{get:keys=>ipcRenderer.invoke('tyler:settings',{action:'get',keys}),set:values=>ipcRenderer.invoke('tyler:settings',{action:'set',values}),remove:keys=>ipcRenderer.invoke('tyler:settings',{action:'remove',keys})}},tabs:{create:()=>ipcRenderer.invoke('tyler:settings',{action:'chat'})}});

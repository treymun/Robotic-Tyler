'use strict';
const {contextBridge,ipcRenderer}=require('electron');
contextBridge.exposeInMainWorld('tylerSettings',{activity:()=>ipcRenderer.invoke('tyler:settings',{action:'activity'}),verifyKey:key=>ipcRenderer.invoke('tyler:settings',{action:'verify',key}),storage:{local:{get:keys=>ipcRenderer.invoke('tyler:settings',{action:'get',keys}),set:values=>ipcRenderer.invoke('tyler:settings',{action:'set',values}),remove:keys=>ipcRenderer.invoke('tyler:settings',{action:'remove',keys})}},tabs:{create:()=>ipcRenderer.invoke('tyler:settings',{action:'chat'})},
 // Settings → Voice on desktop: Windows output devices, a test tone into Steam and a local voice test (the key stays in the main process).
 ai:request=>ipcRenderer.invoke('tyler:settings',{action:'ai',request}),
 voice:{devices:()=>ipcRenderer.invoke('tyler:settings',{action:'voice-devices'}),tone:device=>ipcRenderer.invoke('tyler:settings',{action:'voice-tone',device}),test:({engine,values})=>ipcRenderer.invoke('tyler:settings',{action:'voice-test',engine,values})}});

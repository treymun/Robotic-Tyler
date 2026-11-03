'use strict';
const {contextBridge,ipcRenderer}=require('electron');
const send=(action,args={})=>ipcRenderer.invoke('tyler:native',{action,...args});
contextBridge.exposeInMainWorld('tylerNative',Object.freeze({devices:()=>send('devices'),status:()=>send('status'),playTest:device=>send('test',{device}),speak:(message,device)=>send('speak',{message,device}),record:(device,listenDevice,seconds)=>send('record',{device,listenDevice,seconds}),openSettings:()=>send('settings'),openSteam:()=>send('steam'),checkUpdates:()=>send('updates'),theme:()=>send('theme')}));

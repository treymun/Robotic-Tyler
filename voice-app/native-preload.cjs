'use strict';
const {contextBridge,ipcRenderer}=require('electron');
const send=(action,args={})=>ipcRenderer.invoke('tyler:native',{action,...args});
contextBridge.exposeInMainWorld('tylerNative',Object.freeze({status:()=>send('status'),start:()=>send('start'),stop:()=>send('stop'),listen:seconds=>send('listen',{seconds}),say:text=>send('say',{text}),tone:()=>send('tone'),
 openSettings:()=>send('settings'),openChat:()=>send('chat'),openSteam:()=>send('steam'),checkUpdates:()=>send('updates'),theme:()=>send('theme'),
 onStatus:fn=>ipcRenderer.on('tyler:voice-status',(_e,s)=>fn(s)),onTheme:fn=>ipcRenderer.on('tyler:voice-theme',()=>fn())}));

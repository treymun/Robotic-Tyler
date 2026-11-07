'use strict';
const {contextBridge,ipcRenderer}=require('electron');
contextBridge.exposeInMainWorld('tylerSettings',{activity:()=>ipcRenderer.invoke('tyler:settings',{action:'activity'}),verifyKey:key=>ipcRenderer.invoke('tyler:settings',{action:'verify',key}),storage:{local:{get:keys=>ipcRenderer.invoke('tyler:settings',{action:'get',keys}),set:values=>ipcRenderer.invoke('tyler:settings',{action:'set',values}),remove:keys=>ipcRenderer.invoke('tyler:settings',{action:'remove',keys})}},tabs:{create:()=>ipcRenderer.invoke('tyler:settings',{action:'chat'})},
 // Read-only styling status, available only to the authenticated local Settings window.
 steamAppearance:()=>ipcRenderer.invoke('tyler:settings',{action:'steam-appearance'}),
 // Settings → Voice on desktop: Windows output devices, a test tone into Steam and a local voice test (the key stays in the main process).
 ai:request=>ipcRenderer.invoke('tyler:settings',{action:'ai',request}),
 // Settings → Overview → Phone remote (v2.25): turn it on, show a pairing code, remove phones.
 remote:(op,extra={})=>ipcRenderer.invoke('tyler:settings',{...extra,action:'remote',op}),
 // v2.26: the theme changed somewhere else (the phone remote), so this window follows it.
 onTheme:fn=>{ipcRenderer.on('tyler:theme',(_event,theme)=>fn(theme));},
 // v2.41: settings were changed from the paired phone (their names only), so this window shows them.
 onPhoneSettings:fn=>{ipcRenderer.on('tyler:phone-settings',(_event,keys)=>fn(Array.isArray(keys)?keys.map(String):[]));},
 // Settings → Theme voices (v2.35): install, repair and remove the local voice engine, voices and tests.
 voices:(op,extra={})=>ipcRenderer.invoke('tyler:settings',{...extra,action:'voices',op}),
 onVoices:fn=>{ipcRenderer.on('tyler:voices',(_event,e)=>fn(e));},
 // Settings → On this PC (v2.38): install, remove, choose the model, speed check.
 localAI:(op,extra={})=>ipcRenderer.invoke('tyler:settings',{...extra,action:'local-ai',op}),
 onLocalAI:fn=>{ipcRenderer.on('tyler:local-ai',(_event,e)=>fn(e));},
 // Settings → On this PC → Images on this PC (v2.40): install, remove, model, device, size, friends, test picture.
 localImages:(op,extra={})=>ipcRenderer.invoke('tyler:settings',{...extra,action:'local-images',op}),
 onLocalImages:fn=>{ipcRenderer.on('tyler:local-images',(_event,e)=>fn(e));},
 voice:{devices:()=>ipcRenderer.invoke('tyler:settings',{action:'voice-devices'}),tone:device=>ipcRenderer.invoke('tyler:settings',{action:'voice-tone',device}),test:({engine,values})=>ipcRenderer.invoke('tyler:settings',{action:'voice-test',engine,values})}});

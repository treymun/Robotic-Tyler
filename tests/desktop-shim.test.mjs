// Boots the Electron Control Center main process against a fake `electron`
// module and checks that the shared extension background (generated into
// app/companion by tools/build.mjs) runs under the desktop chrome.* stand-in.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import Module from 'node:module';
import {createRequire} from 'node:module';

const root=path.resolve(import.meta.dirname,'..');
const require=createRequire(import.meta.url);

function fakeElectron(){
 const handlers=new Map(),windows=[],sent=[];let readyResolve;const ready=new Promise(r=>readyResolve=r);
 let nextId=1;const contents=new Map();
 class BrowserWindow{
  constructor(options){this.options=options;this.destroyed=false;const id=nextId++;const self=this;
   this.webContents={id,url:'',isDestroyed:()=>self.destroyed,getURL(){return this.url;},send:(channel,message)=>sent.push({id,channel,message}),
    setWindowOpenHandler(){},on(){},once(){},reload(){},mainFrame:{},session:{setPermissionRequestHandler(){},setPermissionCheckHandler(){}}};
   contents.set(id,this.webContents);windows.push(this);}
  loadURL(url){this.webContents.url=url;return Promise.resolve();}
  loadFile(file){this.webContents.url='file://'+file;return Promise.resolve();}
  on(){}once(){}show(){}focus(){}setTitle(){}isDestroyed(){return this.destroyed;}isMinimized(){return false;}
 }
 const electron={
  app:{requestSingleInstanceLock:()=>true,on(){},whenReady:()=>ready,getPath:()=>os.tmpdir(),setPath(){},quit(){},isPackaged:false,getVersion:()=>'2.15.0'},
  BrowserWindow,ipcMain:{handle:(name,fn)=>handlers.set(name,fn)},
  Menu:{buildFromTemplate:t=>t,setApplicationMenu(){}},shell:{openExternal:async()=>{}},
  safeStorage:{isEncryptionAvailable:()=>true,encryptString:s=>Buffer.from('enc:'+s),decryptString:b=>String(b).slice(4)},
  webContents:{fromId:id=>contents.get(id)},Tray:class{setToolTip(){}setContextMenu(){}on(){}setImage(){}displayBalloon(){}},
  nativeImage:{createFromPath:()=>({resize:()=>({})})},dialog:{showErrorBox:(t,m)=>{throw Error(t+': '+m);},showMessageBox:async()=>({response:0})},
 };
 return {electron,handlers,windows,sent,start:()=>readyResolve()};
}

test('desktop main process boots the shared background and relays storage changes to Steam',async()=>{
 const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'tyler-desktop-'));process.env.LOCALAPPDATA=tmp;
 const fake=fakeElectron();const originalLoad=Module._load;
 Module._load=function(request,...rest){return request==='electron'?fake.electron:originalLoad.call(this,request,...rest);};
 try{
  require(path.join(root,'app','main.cjs'));fake.start();
  for(let i=0;i<200&&!fake.windows.some(w=>w.options.title==='ROBOTIC TYLER');i++)await new Promise(r=>setTimeout(r,10));
  const bot=fake.windows.find(w=>w.options.title==='ROBOTIC TYLER');assert.ok(bot,'Steam window opens');
  assert.equal(bot.webContents.url,'https://steamcommunity.com/chat/');
  const frame={url:'https://steamcommunity.com/chat/'};bot.webContents.mainFrame=frame;
  const event={sender:bot.webContents,senderFrame:frame};
  const ask=message=>fake.handlers.get('tyler:request')(event,message);

  const lease=await ask({type:'lease:claim'});
  assert.equal(lease.ok,true,lease.error);assert.equal(lease.owner,true);

  // The shared background answers storage requests from the in-chat panel…
  const usage=await ask({type:'storage:content',action:'get',keys:['usage']});
  assert.equal(usage.ok,true,usage.error);

  // …and settings writes made in the settings window reach the Steam window.
  await assert.rejects(fake.handlers.get('tyler:settings')({sender:{id:-1}},{action:'get'}),/local settings window/);
  fake.sent.length=0;
  // Use the chrome.storage stand-in directly, as the settings IPC handler does.
  await globalThis.chrome.storage.local.set({usage:{requests:3,reportedCostUSD:0.01}});
  for(let i=0;i<50&&!fake.sent.some(s=>s.message?.type==='storage:changed');i++)await new Promise(r=>setTimeout(r,10));
  const relay=fake.sent.find(s=>s.message?.type==='storage:changed');
  assert.ok(relay,'storage change relayed to the Steam window');
  assert.equal(relay.id,bot.webContents.id);
  assert.equal(relay.message.changes.usage.newValue.requests,3);

  // Secrets never leave the vault through the relay.
  fake.sent.length=0;await globalThis.chrome.storage.local.set({openrouterKey:'sk-or-test'});
  await new Promise(r=>setTimeout(r,30));
  assert.equal(fake.sent.some(s=>JSON.stringify(s).includes('sk-or-test')),false);
  const disk=fs.readFileSync(path.join(tmp,'RoboticTylerHydraCloudV12','Data','Companion','settings.json'),'utf8');
  assert.equal(disk.includes('sk-or-test'),false,'API key is stored encrypted');
 }finally{Module._load=originalLoad;}
});

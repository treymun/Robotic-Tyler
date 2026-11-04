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
 const handlers=new Map(),onHandlers=new Map(),windows=[],sent=[];let readyResolve;const ready=new Promise(r=>readyResolve=r);
 // One session per partition, like Electron (the Steam window's carries the voice setup, v2.19).
 const sessions=new Map(),sessionFor=name=>{if(!sessions.has(name))sessions.set(name,{agent:'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) robotic-tyler/2.19.0 Chrome/156.0.8078.75 Electron/45.2.1 Safari/537.36',
  getUserAgent(){return this.agent;},setUserAgent(a){this.agent=a;},setPermissionRequestHandler(fn){this.request=fn;},setPermissionCheckHandler(fn){this.check=fn;},setDisplayMediaRequestHandler(fn){this.display=fn;},protocol:{handled:new Map(),handle(scheme,fn){this.handled.set(scheme,fn);}}});return sessions.get(name);};
 let nextId=1;const contents=new Map();
 class BrowserWindow{
  constructor(options){this.options=options;this.destroyed=false;const id=nextId++;const self=this;
   this.webContents={id,url:'',isDestroyed:()=>self.destroyed,getURL(){return this.url;},send:(channel,message)=>sent.push({id,channel,message}),
    setWindowOpenHandler(){},on(){},once(){},reload(){},setUserAgent(ua){this.userAgent=ua;},muted:false,setAudioMuted(v){this.muted=v;},isAudioMuted(){return this.muted;},mainFrame:{},session:options?.webPreferences?.partition?sessionFor(options.webPreferences.partition):{setPermissionRequestHandler(){},setPermissionCheckHandler(){}}};
   contents.set(id,this.webContents);windows.push(this);}
  loadURL(url){this.webContents.url=url;return Promise.resolve();}
  loadFile(file){this.webContents.url='file://'+file;return Promise.resolve();}
  on(){}once(){}show(){}focus(){}setTitle(){}isDestroyed(){return this.destroyed;}isMinimized(){return false;}
 }
 const electron={
  app:{requestSingleInstanceLock:()=>true,on(){},whenReady:()=>ready,getPath:()=>os.tmpdir(),setPath(){},quit(){},isPackaged:false,getVersion:()=>'2.15.0'},
  BrowserWindow,ipcMain:{handle:(name,fn)=>handlers.set(name,fn),on:(name,fn)=>onHandlers.set(name,fn)},
  session:{fromPartition:sessionFor},protocol:{registerSchemesAsPrivileged(){}},
  Menu:{buildFromTemplate:t=>t,setApplicationMenu(){}},shell:{openExternal:async()=>{}},
  safeStorage:{isEncryptionAvailable:()=>true,encryptString:s=>Buffer.from('enc:'+s),decryptString:b=>String(b).slice(4)},
  webContents:{fromId:id=>contents.get(id)},Tray:class{setToolTip(){}setContextMenu(){}on(){}setImage(){}displayBalloon(){}},
  nativeImage:{createFromPath:()=>({resize:()=>({})})},dialog:{showErrorBox:(t,m)=>{throw Error(t+': '+m);},showMessageBox:async()=>({response:0})},
 };
 return {electron,handlers,onHandlers,sessions,windows,sent,start:()=>readyResolve()};
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
  // v2.20.3: Settings (or the tray) mutes the call in the Steam window; Tyler keeps hearing it (desktop check).
  assert.equal(bot.webContents.muted,false,'not muted unless asked');
  await globalThis.chrome.storage.local.set({desktopMuteCall:true});assert.equal(bot.webContents.muted,true,'muted from Settings');
  await globalThis.chrome.storage.local.set({desktopMuteCall:false});assert.equal(bot.webContents.muted,false);
  await globalThis.chrome.storage.local.set({usage:{requests:3,reportedCostUSD:0.01}});
  for(let i=0;i<50&&!fake.sent.some(s=>s.message?.type==='storage:changed');i++)await new Promise(r=>setTimeout(r,10));
  const relay=fake.sent.find(s=>s.message?.type==='storage:changed');
  assert.ok(relay,'storage change relayed to the Steam window');
  // v2.20: Settings → AI test and preview run in the shared background with the vault's keys.
  const aiTest=await globalThis.tylerSettingsAI({action:'test',aiProvider:'gemini',geminiTextModel:'gemini-3.8-flash'});
  assert.equal(aiTest.ok,false);assert.equal(aiTest.model,'Gemini 3.8 Flash');assert.match(aiTest.error,/No Google Gemini key/);
  assert.equal(relay.id,bot.webContents.id);
  assert.equal(relay.message.changes.usage.newValue.requests,3);

  // Secrets never leave the vault through the relay.
  fake.sent.length=0;await globalThis.chrome.storage.local.set({openrouterKey:'sk-or-test'});
  await new Promise(r=>setTimeout(r,30));
  assert.equal(fake.sent.some(s=>JSON.stringify(s).includes('sk-or-test')),false);
  const disk=fs.readFileSync(path.join(tmp,'RoboticTylerHydraCloudV12','Data','Companion','settings.json'),'utf8');
  assert.equal(disk.includes('sk-or-test'),false,'API key is stored encrypted');

  // v2.19 voice in the Steam window: Chrome's user agent, voice mode for the preload, blocked microphone.
  const steamSession=fake.sessions.get('persist:robotic-tyler-steam');
  assert.match(steamSession.agent,/^Mozilla\/5\.0 \(Windows NT 10\.0; Win64; x64\) AppleWebKit\/537\.36 \(KHTML, like Gecko\) Chrome\/\d+\.0\.0\.0 Safari\/537\.36$/);
  const mode={sender:bot.webContents,senderFrame:frame};fake.onHandlers.get('tyler:desktop-mode')(mode);assert.deepEqual(mode.returnValue,{voice:true});
  const other={sender:{id:-5},senderFrame:frame};fake.onHandlers.get('tyler:desktop-mode')(other);assert.deepEqual(other.returnValue,{voice:false});
  let allowed=null;steamSession.request(bot.webContents,'media',v=>allowed=v,{mediaTypes:['audio']});assert.equal(allowed,false,'physical microphone stays blocked');
  assert.equal(bot.options.webPreferences.autoplayPolicy,'no-user-gesture-required');
  // The speech detector page is served from the app; nothing else is.
  const serve=steamSession.protocol.handled.get('tyler-app');
  assert.equal((await serve({url:'tyler-app://companion/neural-host.html'})).status,200);
  assert.equal((await serve({url:'tyler-app://companion/background.js'})).status,404);
  assert.equal((await serve({url:'tyler-app://companion/neural/..%2F..%2Fapp%2Fmain.cjs'})).status,404);
  // Live voice's port reaches the shared background and its replies come back to the window.
  const portEvent={sender:bot.webContents,senderFrame:frame};fake.sent.length=0;
  fake.onHandlers.get('tyler:port')(portEvent,{op:'open',id:1,name:'tyler-live'});
  fake.onHandlers.get('tyler:port')(portEvent,{op:'message',id:1,message:{type:'start'}});
  for(let i=0;i<100&&!fake.sent.some(s=>s.channel==='tyler:port');i++)await new Promise(r=>setTimeout(r,10));
  const reply=fake.sent.find(s=>s.channel==='tyler:port');assert.ok(reply,'Live port answers');assert.equal(reply.message.id,1);assert.equal(reply.message.message.type,'error');assert.match(reply.message.message.text,/Gemini Live|key/i);
  fake.onHandlers.get('tyler:port')(portEvent,{op:'close',id:1});
  // Music DJ: YouTube opens in the app's own Music window, which may only ask for its music state.
  const yt=await globalThis.chrome.tabs.create({url:'https://www.youtube.com/',active:true});
  const ytWin=fake.windows.find(w=>w.options.title==='ROBOTIC TYLER · Music (YouTube)');assert.ok(ytWin,'Music window opens');assert.equal(yt.id,ytWin.webContents.id);
  assert.match(ytWin.webContents.userAgent,/Chrome\/\d+\.0\.0\.0 Safari\/537\.36$/,'YouTube sees Google Chrome\'s name');assert.doesNotMatch(ytWin.webContents.userAgent,/Electron|robotic-tyler/i);
  assert.equal(ytWin.options.webPreferences.partition,'persist:robotic-tyler-youtube');
  const ytFrame={url:'https://www.youtube.com/'};ytWin.webContents.mainFrame=ytFrame;
  const fromYt=fake.handlers.get('tyler:youtube');
  const pending=await fromYt({sender:ytWin.webContents,senderFrame:ytFrame},{type:'music:pending'});assert.equal(pending.ok,true,pending.error);assert.equal(pending.command,undefined,'nothing to play yet');
  await assert.rejects(fromYt({sender:ytWin.webContents,senderFrame:ytFrame},{type:'lease:claim'}),/Invalid request/);
  await assert.rejects(fromYt(event,{type:'music:pending'}),/Only the Music window/);
  // Screen/music sharing: only the Steam chat window may ask; music shares only the YouTube window.
  let shared=null;await steamSession.display({frame:{url:'https://example.com/',processId:1,routingId:1},audioRequested:true},v=>shared=v);assert.deepEqual(shared,{});
  // Settings → Voice → VB-CABLE switches the window back to text only, with Electron's own name.
  await globalThis.chrome.storage.local.set({desktopVoice:'cable'});
  for(let i=0;i<50&&/Chrome\/\d+\.0\.0\.0 Safari/.test(steamSession.agent);i++)await new Promise(r=>setTimeout(r,10));
  assert.match(steamSession.agent,/Electron\//);fake.onHandlers.get('tyler:desktop-mode')(mode);assert.deepEqual(mode.returnValue,{voice:false});
 }finally{Module._load=originalLoad;}
});

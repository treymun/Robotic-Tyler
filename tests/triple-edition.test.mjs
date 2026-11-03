// v2.15: two ways to use ROBOTIC TYLER: the Chrome extension and one Windows desktop app
// (Steam text chat + Steam voice). The old Control Center and Voice Studio builds are retired.
import {test} from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import path from 'node:path';
const base=path.resolve(import.meta.dirname,'..');const read=p=>fs.readFileSync(path.join(base,p),'utf8');const exists=p=>fs.existsSync(path.join(base,p));
test('one desktop app and the Chrome extension; the separate Voice Studio is retired',()=>{
 const root=JSON.parse(read('package.json'));assert.match(root.scripts['build:desktop'],/electron-builder\.desktop\.json/);assert.equal(root.scripts['start:voice'],undefined);
 assert.ok(exists('browser-extension/manifest.json'));assert.ok(!exists('voice-app/native-main.cjs'));assert.ok(!exists('electron-builder.voice.json'));assert.ok(!exists('electron-builder.control.json'));
 const app=read('app/main.cjs');assert.match(app,/steamcommunity\.com\/chat/,'text chat: the embedded Steam web chat');assert.match(app,/NativeVoice/,'voice: the Windows audio helper');assert.match(app,/tray=new Tray/);assert.equal((app.match(/new Tray\(/g)||[]).length,1,'one tray icon');assert.equal((app.match(/setupUpdates\(/g)||[]).length,1,'one updater');
});
test('desktop voice routes via Windows endpoints, never a microphone or WebRTC injection',()=>{
 const voice=read('app/native-voice.cjs'),cs=read('windows-audio-bridge/Program.cs');
 assert.match(cs,/WasapiOut/);assert.match(cs,/WasapiLoopbackCapture/);assert.doesNotMatch(cs,/WasapiCapture\(|DataFlow\.Capture/,'never records a microphone');
 assert.match(cs,/"capture"/);assert.match(cs,/"stream"/);assert.match(voice,/\['capture',device\]/);assert.match(voice,/\['stream',device\]/);
 assert.doesNotMatch(voice,/RTCPeerConnection|getUserMedia/);
});
test('the Voice window preload exposes no keys or open-ended IPC, and the main process checks the sender',()=>{
 const preload=read('voice-app/native-preload.cjs');assert.match(preload,/contextBridge/);assert.match(preload,/tyler:native/);assert.doesNotMatch(preload,/openrouterKey|geminiKey|vault|fs\./);
 assert.match(read('app/main.cjs'),/event\.sender!==voiceWin\.webContents\|\|event\.senderFrame!==voiceWin\.webContents\.mainFrame/);
});
test('the Steam chat window still never gets microphone or camera access, and Chrome voice is preserved',()=>{
 const app=read('app/main.cjs');assert.match(app,/permission!=='media'/);assert.ok(exists('browser-extension/audio-bridge.js'));assert.ok(exists('browser-extension/live-voice.js'));
});

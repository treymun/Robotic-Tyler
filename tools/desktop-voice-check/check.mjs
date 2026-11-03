// Desktop app voice in its own Steam window (v2.19), in real Electron against a MOCK Steam page (no
// Steam servers, no Windows audio): app/steam-voice.cjs + the generated app/steam-preload.cjs.
//   ELECTRON=/path/to/electron node tools/desktop-voice-check/check.mjs
// Checks: Steam sees Chrome's user agent; Steam's old-style microphone request gets Tyler's
// synthetic microphone with no device and no permission prompt; the local speech detector loads
// under a strict page CSP; and the bot stays in a call through two leaves and a rejoin.
import fs from 'node:fs';import path from 'node:path';import os from 'node:os';import {spawnSync} from 'node:child_process';import {createRequire} from 'node:module';import {fileURLToPath} from 'node:url';
const HERE=path.dirname(fileURLToPath(import.meta.url)),ROOT=path.resolve(HERE,'..','..');
let ELECTRON=process.env.ELECTRON;if(!ELECTRON){try{ELECTRON=createRequire(path.join(ROOT,'package.json'))('electron');}catch{}}
if(!ELECTRON||!fs.existsSync(ELECTRON)){console.error('Set ELECTRON to an Electron binary.');process.exit(2);}
const out=path.join(fs.mkdtempSync(path.join(os.tmpdir(),'tyler-desktop-voice-')),'result.json');
const args=[...(process.platform==='linux'?['--no-sandbox']:[]),path.join(HERE,'main.cjs')];
const env={...process.env,TYLER_CHECK_OUT:out};
const r=process.platform!=='linux'||process.env.DISPLAY?spawnSync(ELECTRON,args,{env,timeout:120000}):spawnSync('xvfb-run',['-a',ELECTRON,...args],{env,timeout:120000});
if(!fs.existsSync(out)){console.error('No result (exit '+r.status+')\n'+String(r.stderr).slice(-2000));process.exit(1);}
const res=JSON.parse(fs.readFileSync(out,'utf8'));console.log(JSON.stringify(res,null,1));
const bad=[];
if(!/^Mozilla\/5\.0 \(Windows NT 10\.0; Win64; x64\) AppleWebKit\/537\.36 \(KHTML, like Gecko\) Chrome\/\d+\.0\.0\.0 Safari\/537\.36$/.test(res.ua))bad.push('user agent is not Chrome\'s: '+res.ua);
if(!res.mic?.ok)bad.push('Steam\'s microphone request failed: '+JSON.stringify(res.mic));else if(/fake|default/i.test(res.mic.label))bad.push('Steam got a capture device: '+res.mic.label);
if(res.mainLog.some(l=>/blocked-mic|physical microphone/i.test(l)))bad.push('a physical microphone request reached the app');
if(res.neural!=='ready')bad.push('speech detector: '+res.neural);
if(!/^stayed/.test(res.call))bad.push('call: '+res.call);
if(bad.length){console.error('FAILED:\n'+bad.join('\n'));process.exit(1);}
console.log('PASS (mock Steam page in Electron)');

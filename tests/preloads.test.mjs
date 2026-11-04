// The desktop app's generated preloads (tools/build.mjs) must be valid JavaScript: a preload with a
// syntax error is skipped by Electron without any visible error, and its feature silently does
// nothing (v2.19.0's Music window: the YouTube controller never ran, so requests were searched but
// never played).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const APP=path.resolve(import.meta.dirname,'..','app');

test('every desktop preload compiles',()=>{
 const files=fs.readdirSync(APP).filter(f=>/preload.*\.cjs$/.test(f));
 assert.ok(files.includes('steam-preload.cjs')&&files.includes('youtube-preload.cjs'),files.join(', '));
 for(const f of files)assert.doesNotThrow(()=>new vm.Script(fs.readFileSync(path.join(APP,f),'utf8'),{filename:f}),f);
});

test('the Music window preload starts the YouTube controller on YouTube, and only there',async()=>{
 const src=fs.readFileSync(path.join(APP,'youtube-preload.cjs'),'utf8');
 const run=href=>{
  const calls=[];
  const ctx={require:name=>{assert.equal(name,'electron');return {ipcRenderer:{invoke:(channel,message)=>{calls.push([channel,message]);return Promise.resolve({ok:true});}}};},
   process:{isMainFrame:true},location:{href,pathname:new URL(href).pathname},
   document:{readyState:'complete',querySelector:()=>null,querySelectorAll:()=>[],addEventListener(){}},setInterval:()=>0,URL};
  ctx.globalThis=ctx;vm.runInNewContext(src,ctx);return calls;
 };
 const yt=run('https://www.youtube.com/results?search_query=daft+punk');await new Promise(r=>setTimeout(r,0));
 assert.equal(JSON.stringify(yt),JSON.stringify([['tyler:youtube',{type:'music:pending'}]]),'asks the main process for the music command');
 assert.equal(run('https://www.youtube.com.evil.example/').length,0);
 assert.equal(run('https://accounts.google.com/').length,0);
});

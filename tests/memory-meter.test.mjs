// v2.45 memory meter (desktop app). MOCKED unless the test name says REAL: Windows' answers are made-up
// lines in the shape app/memory-meter.cjs's PowerShell reader prints (its WMI classes and DXGI were not run
// here: no Windows in this container), the background runs with a fake chrome.* and a fake reader.
// REAL (Linux): os.totalmem/freemem and /proc for a real child process.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';import path from 'node:path';import os from 'node:os';import {spawn} from 'node:child_process';import {EventEmitter} from 'node:events';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),root=path.resolve(import.meta.dirname,'..');
const M=require(path.join(root,'app','memory-meter.cjs'));
const GB=1024**3,MB=1024**2;

// A Windows answer: an NVIDIA card (LUID 0x0000C3E5), built-in graphics (0x0000D10A) and Microsoft's software adapter.
const NV='luid_0x00000000_0x0000C3E5',IG='luid_0x00000000_0x0000D10A';
function windowsLine({procs=true,gpu=true,adapters=true,extra={}}={}){
 return JSON.stringify({v:1,
  ...(adapters?{adapters:[{name:'NVIDIA GeForce RTX 3060',total:12*GB,high:0,low:0xC3E5,flags:0},{name:'Intel(R) UHD Graphics 770',total:128*MB,high:0,low:0xD10A,flags:0},{name:'Microsoft Basic Render Driver',total:0,high:0,low:0xE001,flags:2}]}:{adaptersError:'DXGI 0x887A0004'}),
  ...(gpu?{adapterUse:[[NV+'_phys_0',11.6*GB],[IG+'_phys_0',300*MB]],
   processUse:[['pid_100_'+NV+'_phys_0',50*MB],['pid_101_'+NV+'_phys_0',130*MB],['pid_101_'+IG+'_phys_0',200*MB],['pid_102_'+NV.toLowerCase()+'_phys_0',3.1*GB],['pid_103_'+NV+'_phys_0',6.5*GB],['pid_900_'+NV+'_phys_0',1.8*GB]]}:{gpuError:'Invalid class'}),
  // [pid, parent, working set]: the app (100) and its window (101), llama-server (102), the voice worker (103) and its helper (104), the speech worker (105); another program (900).
  ...(procs?{procs:[[4,0,1*MB],[100,50,500*MB],[101,100,443*MB],[102,100,2.4*GB],[103,100,2.5*GB],[104,103,0.1*GB],[105,100,210*MB],[900,4,8*GB]]}:{procsError:'Access denied'}),...extra});
}
const ROOTS={text:[102],voices:[103],speech:[105],images:[]};

test('Windows’ answer is read: the language-neutral WMI classes (not translated counter paths), DXGI’s cards by LUID, one row or many',()=>{
 // The reader asks WMI by class name, which is the same on every Windows language; typeperf and Get-Counter take translated paths.
 for(const c of ['Win32_PerfRawData_GPUPerformanceCounters_','GPUAdapterMemory','GPUProcessMemory','Win32_Process','DedicatedUsage','CreateDXGIFactory1','GetDesc1'])assert.ok(M.PS_SCRIPT.includes(c),c);
 for(const bad of ['typeperf','Get-Counter','\\GPU Process Memory','Get-Process','ProcessName','ExecutablePath','CommandLine'])assert.ok(!M.PS_SCRIPT.includes(bad),'not '+bad);
 assert.match(M.PS_SCRIPT,/Win32_Process -Property ProcessId,ParentProcessId,WorkingSetSize/,'process ids and memory only, never names');
 assert.deepEqual(M.parseInstance('pid_1234_luid_0x00000000_0x0000C3E5_phys_0'),{pid:1234,luid:'00000000_0000c3e5'});
 assert.deepEqual(M.parseInstance('luid_0x00000000_0x0000c3e5_phys_1'),{pid:null,luid:'00000000_0000c3e5'},'adapters have no pid; hex case doesn’t matter');
 assert.equal(M.parseInstance('_Total'),null);assert.equal(M.luidKey(0,0xC3E5),'00000000_0000c3e5');assert.equal(M.luidKey(-1,1),'ffffffff_00000001','a negative high part as Windows prints it');
 const w=M.parseWindows(windowsLine());
 assert.deepEqual(w.adapters.map(a=>[a.name,a.software]),[['NVIDIA GeForce RTX 3060',false],['Intel(R) UHD Graphics 770',false],['Microsoft Basic Render Driver',true]]);
 assert.equal(w.adapterUse.length,2);assert.equal(w.processUse.length,6);assert.equal(w.procs.length,8);assert.deepEqual(w.errors,{});
 // PowerShell can print a one-row list as the row itself.
 const one=M.parseWindows(JSON.stringify({adapters:{name:'RX 7600',total:8*GB,high:0,low:7,flags:0},adapterUse:['luid_0x00000000_0x00000007_phys_0',1*GB],processUse:[],procs:[1,0,5]}));
 assert.equal(one.adapters.length,1);assert.deepEqual(one.adapterUse,[{luid:'00000000_00000007',used:1*GB}]);assert.deepEqual(one.procs,[[1,0,5]]);
 // Failures are kept as reasons, never filled in.
 const failed=M.parseWindows(windowsLine({gpu:false,adapters:false,procs:false}));
 assert.equal(failed.procs,null);assert.equal(failed.adapterUse,null);assert.match(failed.errors.gpu,/Invalid class/);assert.match(failed.errors.adapters,/DXGI/);assert.match(failed.errors.procs,/Access denied/);
 assert.match(M.parseWindows('not json').error,/couldn’t be read/);
});
test('the sums: each part is its process and the ones it started; the app is the rest of Tyler’s; other programs are the rest of what’s used',()=>{
 const r=M.summarize({ram:{total:32*GB,free:17.8*GB},table:M.parseWindows(windowsLine()).procs,mainPid:100,roots:ROOTS,gpu:M.parseWindows(windowsLine())});
 const part=id=>r.parts.find(p=>p.id===id);
 assert.equal(r.ram.used,32*GB-17.8*GB);
 assert.equal(part('text').ram,2.4*GB);assert.equal(part('voices').ram,2.6*GB,'the voice worker and the helper it started');assert.equal(part('speech').ram,210*MB);assert.equal(part('images').ram,0);assert.equal(part('images').running,false);
 assert.equal(part('app').ram,943*MB,'the app’s own processes');assert.equal(r.ram.tyler,943*MB+2.4*GB+2.6*GB+210*MB,'not the other program’s 8 GB');
 // The card: the one the AI parts use (the NVIDIA), not the built-in graphics the window draws on.
 assert.equal(r.vram.card,'NVIDIA GeForce RTX 3060');assert.equal(r.vram.total,12*GB);assert.equal(r.vram.used,11.6*GB);
 assert.equal(part('text').vram,3.1*GB);assert.equal(part('voices').vram,6.5*GB);assert.equal(part('app').vram,180*MB,'the app’s share on that card only');
 assert.equal(r.vram.tyler,3.1*GB+6.5*GB+180*MB);assert.ok(Math.abs(r.vram.used-r.vram.tyler-(11.6*GB-3.1*GB-6.5*GB-180*MB))<1,'other programs: the rest');
 assert.equal(r.vram.level,'full');assert.equal(r.ram.level,'ok');
 assert.deepEqual([0.5,0.749,0.75,0.899,0.9,1].map(M.level),['ok','ok','high','high','full','full']);
 // Nothing of Tyler's on a card yet: the text AI's card by name, else the biggest real card (never the software one).
 const quiet={...M.parseWindows(windowsLine()),processUse:[]};
 assert.equal(M.summarize({ram:{total:1,free:0},table:[[100,1,1]],mainPid:100,roots:{},gpu:quiet,card:'Intel(R) UHD Graphics 770'}).vram.card,'Intel(R) UHD Graphics 770');
 assert.equal(M.summarize({ram:{total:1,free:0},table:[[100,1,1]],mainPid:100,roots:{},gpu:quiet}).vram.card,'NVIDIA GeForce RTX 3060');
});
test('a reading that isn’t there shows "—" and says why; nothing is estimated',()=>{
 const noGpu=M.summarize({ram:{total:16*GB,free:8*GB},table:[[100,1,1*GB]],mainPid:100,roots:{},gpu:M.parseWindows(windowsLine({gpu:false}))});
 assert.equal(noGpu.vram.used,null);assert.match(noGpu.vram.why,/counters didn’t answer \(Invalid class\)/);
 let v=M.view(noGpu);assert.equal(v.vram.value,'—');assert.equal(v.vram.missing,true);assert.deepEqual([v.vram.used,v.vram.total,v.vram.unit,v.vram.ownValue,v.vram.pct],['—','','','—','—']);assert.equal(v.vram.fill,0);assert.match(v.vram.tip,/^Graphics memory: — \(Windows’ graphics-memory counters didn’t answer \(Invalid class\)\.\)$/);
 assert.ok(v.parts.every(p=>p.vram==='—'));
 // The card's size unknown: what's used is shown, the size is "—" with the reason.
 const noSize=M.summarize({ram:{total:16*GB,free:8*GB},table:[[100,1,1*GB]],mainPid:100,roots:{},gpu:M.parseWindows(windowsLine({adapters:false}))});
 assert.equal(noSize.vram.total,null);v=M.view(noSize);assert.match(v.vram.value,/^11\.6 GB used$/);assert.deepEqual([v.vram.used,v.vram.total,v.vram.unit],['11.6','',' GB used']);assert.match(v.vram.tip,/its size: — \(The card’s name and size couldn’t be read \(DXGI 0x887A0004\)\.\)/);
 // No process list: the PC's memory is still shown; Tyler's share is "—".
 const noProcs=M.summarize({ram:{total:16*GB,free:8*GB},table:null,mainPid:100,roots:ROOTS,why:{procs:'Windows didn’t answer: timeout',vram:'Windows didn’t answer: timeout'}});
 v=M.view(noProcs);assert.equal(v.ram.value,'8.0/16 GB');assert.equal(v.ram.own,'Tyler —');assert.match(v.ram.tip,/Tyler’s share: — \(Windows didn’t answer: timeout\)/);assert.equal(v.vram.value,'—');
 assert.equal(v.parts.find(p=>p.id==='text').ram,'—');assert.equal(v.parts.find(p=>p.id==='other').ram,'—');
});
test('the panel’s text: "14.2/32 GB", "Tyler 6.1 GB", the parts with "off" for what isn’t running, other programs last',()=>{
 const w=M.parseWindows(windowsLine()),r=M.summarize({ram:{total:32*GB,free:17.8*GB},table:w.procs,mainPid:100,roots:ROOTS,gpu:w}),v=M.view(r);
 assert.deepEqual([v.ram.label,v.ram.value,v.ram.own,v.ram.level],['RAM','14.2/32 GB','Tyler 6.1 GB','ok']);
 assert.deepEqual([v.vram.label,v.vram.value,v.vram.own,v.vram.level],['VRAM','11.6/12 GB','Tyler 9.8 GB','full']);
 assert.equal(v.ram.fill,0.444);assert.equal(v.vram.ownFill,0.815);
 assert.deepEqual(v.parts.map(p=>[p.id,p.ram,p.vram]),[['app','943 MB','180 MB'],['text','2.4 GB','3.1 GB'],['voices','2.6 GB','6.5 GB'],['speech','210 MB','0 MB'],['images','off','off'],['other','8.1 GB','1.8 GB']]);
 assert.match(v.vram.tip,/^NVIDIA GeForce RTX 3060: 11\.6 GB in use of 12\.0 GB\. Tyler: 9\.8 GB \(The app 180 MB, Text AI on this PC 3\.1 GB, Theme voices 6\.5 GB\)\. Other programs: 1\.8 GB\.$/);
 assert.ok(!JSON.stringify(v).includes('900'),'nothing about the other program but the remainder');
 // The same numbers in pieces, for skins that set their own digits; each part's share for their own bars.
 assert.deepEqual([v.ram.used,v.ram.total,v.ram.unit,v.ram.ownValue,v.ram.pct,v.ram.card],['14.2','32',' GB','6.1 GB','44%','']);
 assert.deepEqual([v.vram.used,v.vram.total,v.vram.unit,v.vram.ownValue,v.vram.pct,v.vram.card],['11.6','12',' GB','9.8 GB','97%','NVIDIA GeForce RTX 3060']);
 assert.equal(v.ram.used+'/'+v.ram.total+v.ram.unit,v.ram.value,'the pieces make the whole');
 assert.deepEqual(v.parts.map(p=>[p.id,p.ramFill,p.vramFill]),[['app',0.029,0.015],['text',0.075,0.258],['voices',0.081,0.542],['speech',0.006,0],['images',0,0],['other',0.252,0.152]]);
 assert.equal(M.gb(7.5*GB,{total:true}),'7.5');assert.equal(M.gb(8*GB,{total:true}),'8');assert.equal(M.amount(640*MB),'640 MB');assert.equal(M.amount(null),'—');
});
// A fake PowerShell: answers each "read" line with `answer()`, or nothing.
function fakeShell(answer,{fail=null}={}){
 const calls={spawns:0,reads:0,quit:0,killed:0,args:null};
 const spawnFn=(exe,args,opts)=>{calls.spawns++;calls.args={exe,args,opts};const p=new EventEmitter();p.stdout=new EventEmitter();p.stderr=new EventEmitter();
  p.stdin={write:s=>{if(s==='read\n'){calls.reads++;const a=answer();if(a!=null)setImmediate(()=>p.stdout.emit('data',a+'\n'));}return true;},end:s=>{if(String(s).startsWith('quit'))calls.quit++;setImmediate(()=>p.emit('exit',0));}};
  p.kill=()=>{calls.killed++;};if(fail)setImmediate(()=>p.emit('error',fail));return p;};
 return {spawnFn,calls};
}
test('off costs nothing: no reader starts until a reading is asked for; one reader, a reading reused for a second, closed when nobody asks',async()=>{
 const {spawnFn,calls}=fakeShell(()=>windowsLine());
 const meter=M.setupMemoryMeter({platform:'win32',spawnFn,mainPid:100,pids:()=>({text:[102],voices:[103],speech:[105]}),idleMs:1500,totalmem:()=>32*GB,freemem:()=>17.8*GB});
 await new Promise(r=>setTimeout(r,200));assert.equal(calls.spawns,0,'nothing runs before the panel asks');assert.equal(meter.running,false);
 const v=await meter.view();assert.equal(v.vram.value,'11.6/12 GB');assert.equal(calls.spawns,1);assert.equal(calls.reads,1);
 assert.match(calls.args.exe,/System32[\\/]WindowsPowerShell[\\/]v1\.0[\\/]powershell\.exe$/,'Windows’ own PowerShell, by its full path');
 assert.ok(calls.args.args.includes('-NoProfile')&&calls.args.args.includes('-NonInteractive')&&calls.args.args.includes('-EncodedCommand'));assert.equal(calls.args.opts.windowsHide,true);
 assert.equal(Buffer.from(calls.args.args.at(-1),'base64').toString('utf16le'),M.PS_SCRIPT,'the script is passed whole, not from a file');
 await meter.view();assert.equal(calls.reads,1,'a reading under a second old is reused');
 await new Promise(r=>setTimeout(r,1050));await meter.view();assert.equal(calls.reads,2);assert.equal(calls.spawns,1,'the same reader');
 assert.equal(meter.running,true);await new Promise(r=>setTimeout(r,1700));assert.equal(meter.running,false,'closed when nobody asks');assert.equal(calls.quit,1);
});
test('the reader can’t start or doesn’t answer: "—" with the reason, and the PC’s memory still shows',async()=>{
 let {spawnFn}=fakeShell(()=>null,{fail:Object.assign(Error('spawn powershell.exe ENOENT'),{code:'ENOENT'})});
 let meter=M.setupMemoryMeter({platform:'win32',spawnFn,timeoutMs:300,totalmem:()=>16*GB,freemem:()=>8*GB});
 let v=await meter.view();assert.equal(v.ram.value,'8.0/16 GB');assert.equal(v.vram.value,'—');assert.match(v.vram.tip,/PowerShell couldn’t start \(spawn powershell\.exe ENOENT\)/);meter.stop();
 ({spawnFn}=fakeShell(()=>null));meter=M.setupMemoryMeter({platform:'win32',spawnFn,timeoutMs:200,firstTimeoutMs:200,totalmem:()=>16*GB,freemem:()=>8*GB});
 v=await meter.view();assert.match(v.vram.tip,/didn’t answer within 0\.2 s/);assert.equal(v.ram.own,'Tyler —');
 // A reader that keeps failing isn't restarted at every reading: after three failures it rests.
 const {spawnFn:sf,calls}=fakeShell(()=>null);meter=M.setupMemoryMeter({platform:'win32',spawnFn:sf,timeoutMs:50,firstTimeoutMs:50});
 for(let i=0;i<5;i++){await new Promise(r=>setTimeout(r,1100));v=await meter.view();}
 assert.equal(calls.spawns,3,'three tries, then a rest');assert.match(v.vram.tip,/failed 3 times in two minutes; it tries again in a minute/);meter.stop();
});
test('REAL (Linux): the PC’s memory from the system, a real child process counted as its part, no graphics memory and the reason',async()=>{
 const child=spawn(process.execPath,['-e','const b=Buffer.alloc(64*1024*1024,1);setTimeout(()=>{},30000)'],{stdio:'ignore'});
 try{
  await new Promise(r=>setTimeout(r,500));
  const meter=M.setupMemoryMeter({platform:'linux',pids:()=>({text:[child.pid]})});
  const raw=await meter.read(),v=M.view(raw);meter.stop();
  assert.equal(raw.ram.total,os.totalmem());assert.ok(raw.ram.used>0&&raw.ram.used<raw.ram.total);
  const text=raw.parts.find(p=>p.id==='text');assert.equal(text.running,true);assert.ok(text.ram>50*MB,'the child’s 64 MB buffer counts: '+text.ram);
  assert.ok(raw.ram.tyler>=text.ram,'this test process and its child are "Tyler"');assert.equal(raw.parts.find(p=>p.id==='voices').running,false);
  assert.equal(v.vram.value,'—');assert.match(v.vram.tip,/read from Windows’ GPU counters/);
  assert.deepEqual(M.tree([[1,0,1],[2,1,1],[3,2,1],[4,9,1]],[2]),new Set([2,3]));
 }finally{child.kill();}
});
test('the setting: off unless saved true, in every settings list, the phone may change it, the panel may only read it; Chrome hides it',async()=>{
 const g=require(path.join(root,'app','guards.cjs'));
 assert.deepEqual(g.sanitizeSettings({memoryMeter:true}),{memoryMeter:true});
 for(const v of [false,'true',1,null,{},'yes'])assert.deepEqual(g.sanitizeSettings({memoryMeter:v}),{memoryMeter:false},JSON.stringify(v));
 assert.ok(g.settingsKeys.has('memoryMeter'));assert.ok(g.phoneWritable.has('memoryMeter'));assert.ok(!g.phoneReadOnly.has('memoryMeter')&&!g.phoneHidden.has('memoryMeter'));
 for(const f of ['browser-extension/settings.js','app/desktop-overrides/settings.js'])assert.match(fs.readFileSync(path.join(root,f),'utf8'),/const fields=\[[^\]]*'memoryMeter'/,f);
 for(const f of ['browser-extension/v22-settings.js','app/desktop-overrides/v22-settings.js'])assert.match(fs.readFileSync(path.join(root,f),'utf8'),/const allowed=\[[^\]]*'memoryMeter'/,f);
 const {readable,contentStorage}=await import('../browser-extension/content-storage.mjs');assert.ok(readable.has('memoryMeter'));
 await assert.rejects(contentStorage({set:async()=>{}},{action:'set',values:{memoryMeter:true}}),/not allowed/,'the panel can’t switch it on');
 const html=fs.readFileSync(path.join(root,'browser-extension','settings.html'),'utf8');
 assert.match(html,/<section class="sheet only-desktop" id="memoryMeterSheet" data-ui-zone="advanced">[\s\S]*?<input id="memoryMeter" type="checkbox"><span><b>Show a memory meter in Tyler's panel<\/b>/);
 assert.match(fs.readFileSync(path.join(root,'browser-extension','settings.css'),'utf8'),/body:not\(\[data-desktop=true\]\) \.only-desktop\{display:none!important\}/,'Chrome hides desktop-only sheets');
 assert.match(fs.readFileSync(path.join(root,'browser-extension','ui','panel.html'),'utf8'),/<section id="memMeter" class="tyler-mem" aria-label="Memory" data-state="off" hidden>/,'off until the setting says on');
});
test('the background: a reading only while the meter is on, and only in the desktop app',async()=>{
 const store={};let listener=null,asked=0;
 const area={get:async keys=>{const list=keys==null?Object.keys(store):typeof keys==='string'?[keys]:keys;return Object.fromEntries(list.filter(k=>k in store).map(k=>[k,store[k]]));},set:async v=>Object.assign(store,v),remove:async()=>{},setAccessLevel:async()=>{}};
 globalThis.chrome={action:{onClicked:{addListener(){}}},runtime:{onMessage:{addListener:fn=>{listener=fn;}},openOptionsPage(){}},storage:{local:area,session:{get:async()=>({}),set:async()=>{},remove:async()=>{}},onChanged:{addListener(){}}},
  tabs:{get:async id=>({id}),query:async()=>[],sendMessage:async()=>{},onRemoved:{addListener(){}}}};
 globalThis.fetch=async()=>{throw Error('no network in this test');};
 await import('../browser-extension/background.js');
 const ask=m=>new Promise(r=>listener(m,{tab:{id:7},url:'https://steamcommunity.com/chat/'},r));
 assert.deepEqual(await ask({type:'memory:read'}),{ok:true,off:true},'off: nothing is read');
 store.memoryMeter=true;
 const chrome=await ask({type:'memory:read'});assert.equal(chrome.available,false);assert.match(chrome.why,/desktop app/);
 globalThis.tylerMemory={read:async()=>{asked++;return {at:1,ram:{value:'1/2 GB'}};}};
 assert.deepEqual(await ask({type:'memory:read'}),{ok:true,reading:{at:1,ram:{value:'1/2 GB'}}});assert.equal(asked,1);
 store.memoryMeter=false;await ask({type:'memory:read'});assert.equal(asked,1,'switched off: the reader isn’t asked');
 delete globalThis.tylerMemory;
});

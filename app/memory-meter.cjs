'use strict';
// ROBOTIC TYLER memory meter (v2.45, desktop app): the PC's memory and the graphics card's, and how much
// of each Tyler's own parts use. Off by default (Settings → Advanced → "Show a memory meter in Tyler's
// panel"); the panel asks for a reading every 2.5 s only while it's on and can be seen, and nothing here
// runs until it asks. The reader stops by itself 20 s after the last question.
//
// Where the numbers come from:
//   - PC memory: Node's os.totalmem()/os.freemem() (Windows' "available" memory).
//   - Tyler's processes: the app's main process and everything it started (the Steam window, Settings,
//     the AI engines, the voice worker…), found by parent process. Each part is its own process and the
//     ones it started: the text AI (llama-server), theme voices (the Python worker), hearing and the
//     voice on this PC (the speech workers), images (sd-cli while it draws). "The app" is the rest.
//     Memory is each process's working set, as Task Manager's details show it.
//   - Windows: one long-lived PowerShell (started on the first reading, hidden, no profile) answers each
//     reading with WMI's performance classes Win32_PerfRawData_GPUPerformanceCounters_GPUAdapterMemory and
//     _GPUProcessMemory (the same numbers as the "GPU Adapter Memory" and "GPU Process Memory" counters,
//     dedicated usage), and Win32_Process (process id, parent id, working set; never names). WMI's class
//     and property names are the same in every Windows language, unlike typeperf / Get-Counter paths
//     ("\GPU Process Memory(*)\Dedicated Usage" is translated on non-English Windows). The card's name and
//     size come from DXGI (the adapter list, by LUID, which is how the counters name each card).
//   - Linux (development): /proc. There's no graphics-memory reading there, and the meter says so.
// What isn't available shows as "—" with the reason. Nothing is estimated. No other program's name or
// detail is read or shown: other programs are only the rest (used minus Tyler's).
const os=require('node:os'),fs=require('node:fs'),path=require('node:path'),{spawn}=require('node:child_process');
const PARTS=[['app','The app'],['text','Text AI on this PC'],['voices','Theme voices'],['speech','Hearing and voice on this PC'],['images','Images on this PC']];
const MiB=1024**2;

// ── Windows: the reader (PowerShell, language-neutral WMI classes and DXGI) ────────────────────────
const PS_SCRIPT=String.raw`
$ErrorActionPreference='Stop';$ProgressPreference='SilentlyContinue'
try{[Console]::OutputEncoding=[Text.Encoding]::UTF8}catch{}
$dx=$false;$dxErr=''
try{
Add-Type -Language CSharp -TypeDefinition @'
using System;using System.Runtime.InteropServices;using System.Collections.Generic;
public class TylerAdapter{public string name;public ulong total;public int high;public uint low;public uint flags;}
public static class TylerDxgi{
 [StructLayout(LayoutKind.Sequential,CharSet=CharSet.Unicode)]
 public struct Desc1{[MarshalAs(UnmanagedType.ByValTStr,SizeConst=128)]public string Description;public uint VendorId;public uint DeviceId;public uint SubSysId;public uint Revision;public UIntPtr DedicatedVideoMemory;public UIntPtr DedicatedSystemMemory;public UIntPtr SharedSystemMemory;public uint LuidLow;public int LuidHigh;public uint Flags;}
 [ComImport,Guid("29038f61-3839-4626-91fd-086879011a05"),InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
 interface IAdapter1{void SetPrivateData();void SetPrivateDataInterface();void GetPrivateData();void GetParent();void EnumOutputs();void GetDesc();void CheckInterfaceSupport();[PreserveSig]int GetDesc1(out Desc1 d);}
 [ComImport,Guid("770aae78-f26f-4dba-a829-253c83d1b387"),InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
 interface IFactory1{void SetPrivateData();void SetPrivateDataInterface();void GetPrivateData();void GetParent();void EnumAdapters();void MakeWindowAssociation();void GetWindowAssociation();void CreateSwapChain();void CreateSoftwareAdapter();[PreserveSig]int EnumAdapters1(uint i,out IAdapter1 a);void IsCurrent();}
 [DllImport("dxgi.dll")]static extern int CreateDXGIFactory1(ref Guid riid,[MarshalAs(UnmanagedType.Interface)]out IFactory1 f);
 public static TylerAdapter[] List(){
  Guid g=new Guid("770aae78-f26f-4dba-a829-253c83d1b387");IFactory1 f;int hr=CreateDXGIFactory1(ref g,out f);if(hr<0)throw new Exception("DXGI 0x"+hr.ToString("X8"));
  List<TylerAdapter> list=new List<TylerAdapter>();
  for(uint i=0;i<16;i++){IAdapter1 a;if(f.EnumAdapters1(i,out a)<0)break;Desc1 d;if(a.GetDesc1(out d)>=0)list.Add(new TylerAdapter{name=d.Description,total=d.DedicatedVideoMemory.ToUInt64(),high=d.LuidHigh,low=d.LuidLow,flags=d.Flags});Marshal.ReleaseComObject(a);}
  Marshal.ReleaseComObject(f);return list.ToArray();}
}
'@
$dx=$true}catch{$dxErr=[string]$_.Exception.Message}
function Perf($c){try{Get-CimInstance -ClassName ('Win32_PerfRawData_GPUPerformanceCounters_'+$c) -Property Name,DedicatedUsage}catch{Get-CimInstance -ClassName ('Win32_PerfFormattedData_GPUPerformanceCounters_'+$c) -Property Name,DedicatedUsage}}
while($true){
 $line=[Console]::In.ReadLine();if($line -eq $null -or $line -eq 'quit'){break}
 $o=[ordered]@{v=1}
 if($dx){try{$o.adapters=@([TylerDxgi]::List()|ForEach-Object{[ordered]@{name=$_.name;total=$_.total;high=$_.high;low=$_.low;flags=$_.flags}})}catch{$o.adaptersError=[string]$_.Exception.Message}}else{$o.adaptersError=$dxErr}
 try{$o.adapterUse=@(Perf 'GPUAdapterMemory'|ForEach-Object{,@([string]$_.Name,[int64]$_.DedicatedUsage)})}catch{$o.gpuError=[string]$_.Exception.Message}
 try{$o.processUse=@(Perf 'GPUProcessMemory'|ForEach-Object{,@([string]$_.Name,[int64]$_.DedicatedUsage)})}catch{$o.gpuError=[string]$_.Exception.Message}
 try{$o.procs=@(Get-CimInstance -ClassName Win32_Process -Property ProcessId,ParentProcessId,WorkingSetSize|ForEach-Object{,@([int64]$_.ProcessId,[int64]$_.ParentProcessId,[int64]$_.WorkingSetSize)})}catch{$o.procsError=[string]$_.Exception.Message}
 [Console]::Out.WriteLine(($o|ConvertTo-Json -Compress -Depth 6));[Console]::Out.Flush()
}`;

/** The counters' LUID ("luid_0x00000000_0x0000C3E5") as one key, the same as DXGI's high/low parts give. */
function luidKey(high,low){return ((Number(high)>>>0).toString(16).padStart(8,'0')+'_'+(Number(low)>>>0).toString(16).padStart(8,'0')).toLowerCase();}
/** "pid_1234_luid_0x00000000_0x0000C3E5_phys_0" → {pid:1234, luid:'00000000_0000c3e5'}; adapters have no pid. */
function parseInstance(name){
 const m=/(?:^|_)pid_(\d+)_/i.exec(String(name)),l=/luid_0x([0-9a-f]{1,8})_0x([0-9a-f]{1,8})/i.exec(String(name));
 return l?{pid:m?Number(m[1]):null,luid:luidKey(parseInt(l[1],16),parseInt(l[2],16))}:null;
}
/** The helper's one JSON line, checked and shaped: {procs:[[pid,ppid,bytes]], adapters, adapterUse, processUse, errors}. */
function parseWindows(line){
 let d;try{d=JSON.parse(String(line||''));}catch{return {error:'Windows’ answer couldn’t be read.'};}
 if(!d||typeof d!=='object')return {error:'Windows’ answer couldn’t be read.'};
 const arr=v=>Array.isArray(v)?v:v==null?[]:[v],num=v=>Number.isFinite(Number(v))?Number(v):null;
 // PowerShell may print a list of one row as the row itself ([name, bytes] instead of [[name, bytes]]).
 const rows=v=>{const a=arr(v);return a.length>=2&&!a.some(Array.isArray)?[a]:a.filter(r=>Array.isArray(r)&&r.length>=2);};
 const out={procs:null,adapters:null,adapterUse:null,processUse:null,errors:{}};
 if(d.procs!==undefined)out.procs=rows(d.procs).map(r=>[num(r[0]),num(r[1]),num(r[2])]).filter(r=>r[0]!=null&&r[1]!=null);else out.errors.procs=String(d.procsError||'no process list').slice(0,200);
 if(d.adapters!==undefined)out.adapters=arr(d.adapters).filter(a=>a&&typeof a==='object').map(a=>({name:String(a.name||'').trim().slice(0,120),total:num(a.total),luid:luidKey(a.high,a.low),software:(Number(a.flags)&2)===2}));else out.errors.adapters=String(d.adaptersError||'no adapter list').slice(0,200);
 if(d.adapterUse!==undefined&&d.processUse!==undefined){
  out.adapterUse=[];for(const [n,b] of rows(d.adapterUse)){const p=parseInstance(n);if(p&&num(b)!=null)out.adapterUse.push({luid:p.luid,used:num(b)});}
  out.processUse=[];for(const [n,b] of rows(d.processUse)){const p=parseInstance(n);if(p&&p.pid!=null&&num(b)!=null)out.processUse.push({pid:p.pid,luid:p.luid,used:num(b)});}
 }else out.errors.gpu=String(d.gpuError||'no GPU counters').slice(0,200);
 return out;
}

// ── Linux (development and tests): /proc ───────────────────────────────────────────────────────────
function linuxProcs(dir='/proc'){
 const rows=[],page=4096;
 let names=[];try{names=fs.readdirSync(dir);}catch{return null;}
 for(const n of names){if(!/^\d+$/.test(n))continue;
  try{const s=fs.readFileSync(path.join(dir,n,'stat'),'utf8'),f=s.slice(s.lastIndexOf(')')+2).split(' ');rows.push([Number(n),Number(f[1]),Number(f[21])*page]);}catch{}}
 return rows;
}

// ── The sums (pure; tested) ────────────────────────────────────────────────────────────────────────
/** pid → its descendants (and itself) from rows [pid, ppid, bytes]. */
function tree(rows,roots){
 const kids=new Map();for(const [pid,ppid] of rows){if(pid===ppid)continue;if(!kids.has(ppid))kids.set(ppid,[]);kids.get(ppid).push(pid);}
 const out=new Set(),todo=[...roots].filter(p=>Number.isInteger(p)&&p>0);
 const known=new Set(rows.map(r=>r[0]));
 while(todo.length){const p=todo.pop();if(out.has(p)||!known.has(p))continue;out.add(p);for(const k of kids.get(p)||[])todo.push(k);}
 return out;
}
const level=f=>f==null?'ok':f>=0.9?'full':f>=0.75?'high':'ok';
/**
 * One reading. ram:{total,free}; table: rows [pid,ppid,bytes] or null; mainPid; roots:{text:[pids],…};
 * appMetrics: Electron's (for the app's own memory when there's no process table); gpu: parseWindows()
 * result or null; card: the name of the card the text AI uses (to pick it when Tyler uses none yet);
 * why: reasons for readings that aren't there. Returns the numbers the panel shows, or null with a reason.
 */
function summarize({ram,table,mainPid,roots={},appMetrics=[],gpu=null,card=null,why={}}){
 const parts=PARTS.map(([id,label])=>({id,label,ram:null,vram:null,running:id==='app'||(roots[id]||[]).some(p=>Number.isInteger(p)&&p>0)}));
 const R={total:ram.total,used:Math.max(0,ram.total-ram.free),tyler:null,why:null};
 let tylerSet=null;const partSets={};
 if(table){
  const bytes=new Map(table.map(r=>[r[0],Number(r[2])||0]));tylerSet=tree(table,[mainPid]);
  const sum=set=>[...set].reduce((n,p)=>n+(bytes.get(p)||0),0);
  R.tyler=sum(tylerSet);let rest=R.tyler;
  for(const p of parts){if(p.id==='app')continue;const set=tree(table,roots[p.id]||[]);partSets[p.id]=set;p.ram=sum(set);rest-=p.ram;}
  parts[0].ram=Math.max(0,rest);
 }else{
  const app=appMetrics.reduce((n,m)=>n+(Number(m?.memory?.workingSetSize)||0)*1024,0);
  if(app>0)parts[0].ram=app;
  R.why=why.procs||'Tyler’s processes couldn’t be listed.';
 }
 R.fill=R.total?R.used/R.total:null;R.own=R.total&&R.tyler!=null?R.tyler/R.total:null;R.level=level(R.fill);
 // The graphics card: the one Tyler's AI parts use; else the text AI's card; else the largest real card.
 const V={card:null,total:null,used:null,tyler:null,why:why.vram||null};
 if(!V.why&&gpu){
  if(!gpu.adapterUse||!gpu.processUse)V.why='Windows’ graphics-memory counters didn’t answer'+(gpu.errors?.gpu?' ('+gpu.errors.gpu+')':'')+'.';
  else{
   const adapters=(gpu.adapters||[]).filter(a=>!a.software);
   const useOn=(pids,luid)=>gpu.processUse.filter(u=>u.luid===luid&&pids.has(u.pid)).reduce((n,u)=>n+u.used,0);
   const luids=[...new Set([...adapters.map(a=>a.luid),...gpu.adapterUse.map(u=>u.luid)])];
   const aiPids=new Set(Object.values(partSets).flatMap(s=>[...s]));
   let pick=null,best=0;for(const l of luids){const u=useOn(aiPids,l);if(u>best){best=u;pick=l;}}
   if(!pick&&card){const a=adapters.find(x=>x.name.toLowerCase()===String(card).toLowerCase());if(a)pick=a.luid;}
   if(!pick){const a=adapters.slice().sort((x,y)=>(y.total||0)-(x.total||0))[0];pick=a?.luid||null;}
   // No list of cards (DXGI failed): the card Tyler uses most, else the one with the most in use. It's shown unnamed, without a size.
   if(!pick&&!adapters.length&&gpu.adapterUse.length){const all=tylerSet||new Set();let most=-1;for(const l of luids){const u=useOn(all,l);if(u>most){most=u;pick=l;}}
    if(most<=0)pick=gpu.adapterUse.slice().sort((x,y)=>y.used-x.used)[0].luid;}
   if(!pick)V.why='Windows lists no graphics card.';
   else{
    const a=adapters.find(x=>x.luid===pick);V.card=a?.name||null;V.total=a?.total||null;
    V.used=gpu.adapterUse.filter(u=>u.luid===pick).reduce((n,u)=>n+u.used,0);
    if(!a)V.why='The card’s name and size couldn’t be read'+(gpu.errors?.adapters?' ('+gpu.errors.adapters+')':'')+'.';
    if(tylerSet){V.tyler=useOn(tylerSet,pick);let rest=V.tyler;for(const p of parts){if(p.id==='app')continue;p.vram=useOn(partSets[p.id],pick);rest-=p.vram;}parts[0].vram=Math.max(0,rest);}
   }
  }
 }else if(!V.why)V.why='Graphics memory wasn’t read.';
 V.fill=V.total&&V.used!=null?Math.min(1,V.used/V.total):null;V.own=V.total&&V.tyler!=null?Math.min(1,V.tyler/V.total):null;V.level=level(V.fill);
 return {at:Date.now(),ram:R,vram:V,parts};
}

// ── What the panel shows (text and fractions; content.js and the phone only put it in place) ───────
const GiB=1024**3;
/** gb(): "14.2" for amounts, "32" for a total of 10 GB or more ("8" or "7.5" below); amount(): "6.1 GB", or "640 MB" under 1 GB. */
function gb(n,{total=false}={}){if(n==null||!Number.isFinite(n))return '—';const g=n/GiB;if(total)return g>=10?String(Math.round(g)):String(+g.toFixed(1));return g.toFixed(1);}
function amount(n){if(n==null||!Number.isFinite(n))return '—';if(n<GiB)return Math.round(n/MiB)+' MB';return (n/GiB).toFixed(1)+' GB';}
const frac=v=>v==null||!Number.isFinite(v)?0:Math.max(0,Math.min(1,+v.toFixed(3)));
/** The panel's text from a reading (summarize()): two gauges and the parts list. */
function view(r){
 const own=n=>n==null?'Tyler —':'Tyler '+amount(n);
 const share=(key)=>r.parts.filter(p=>p[key]!=null&&p[key]>0).map(p=>p.label+' '+amount(p[key])).join(', ');
 const R=r.ram,V=r.vram;
 const ram={label:'RAM',value:gb(R.used)+'/'+gb(R.total,{total:true})+' GB',own:own(R.tyler),fill:frac(R.fill),ownFill:frac(R.own),level:R.level,missing:false,
  tip:'PC memory: '+amount(R.used)+' in use of '+amount(R.total)+'. '+(R.tyler!=null?'Tyler: '+amount(R.tyler)+(share('ram')?' ('+share('ram')+')':'')+'. Other programs: '+amount(Math.max(0,R.used-R.tyler))+'.':'Tyler’s share: — ('+(R.why||'not read')+')')};
 const vMissing=V.used==null;
 const vram={label:'VRAM',value:vMissing?'—':V.total?gb(V.used)+'/'+gb(V.total,{total:true})+' GB':gb(V.used)+' GB used',own:vMissing?'Tyler —':own(V.tyler),fill:frac(V.fill),ownFill:frac(V.own),level:V.level,missing:vMissing,
  tip:vMissing?'Graphics memory: — ('+(V.why||'not read')+')':(V.card||'The graphics card')+': '+amount(V.used)+' in use'+(V.total?' of '+amount(V.total):' (its size: — '+(V.why?'('+V.why+')':'')+')')+'. '+(V.tyler!=null?'Tyler: '+amount(V.tyler)+(share('vram')?' ('+share('vram')+')':'')+'. Other programs: '+amount(Math.max(0,V.used-V.tyler))+'.':'Tyler’s share: —.')};
 const cell=(p,key)=>!p.running?'off':amount(p[key]);
 // Each part's share of the whole (0…1), so a skin can draw its own bars in the list.
 const of=(n,total)=>n!=null&&total?frac(n/total):0;
 const parts=r.parts.map(p=>({id:p.id,label:p.label,running:!!p.running,ram:cell(p,'ram'),vram:vMissing?'—':cell(p,'vram'),ramFill:p.running?of(p.ram,R.total):0,vramFill:p.running&&!vMissing?of(p.vram,V.total):0}));
 const otherRam=R.tyler!=null?Math.max(0,R.used-R.tyler):null,otherVram=!vMissing&&V.tyler!=null?Math.max(0,V.used-V.tyler):null;
 parts.push({id:'other',label:'Other programs',running:true,ram:amount(otherRam),vram:vMissing?'—':amount(otherVram),ramFill:of(otherRam,R.total),vramFill:of(otherVram,V.total)});
 // The same numbers in pieces, for skins that set their own digits: used, total and unit ("14.2", "32", " GB"),
 // Tyler's share alone ("6.1 GB"), the percentage ("44%") and the card's name.
 const pieces=(used,total,unit)=>({used,total,unit});
 Object.assign(ram,pieces(gb(R.used),gb(R.total,{total:true}),' GB'),{ownValue:R.tyler!=null?amount(R.tyler):'—',pct:R.fill!=null?Math.round(R.fill*100)+'%':'—',card:''});
 Object.assign(vram,vMissing?pieces('—','',''):V.total?pieces(gb(V.used),gb(V.total,{total:true}),' GB'):pieces(gb(V.used),'',' GB used'),
  {ownValue:!vMissing&&V.tyler!=null?amount(V.tyler):'—',pct:V.fill!=null?Math.round(V.fill*100)+'%':'—',card:V.card||''});
 return {at:r.at,ram,vram,parts};
}

// ── The reader ─────────────────────────────────────────────────────────────────────────────────────
/**
 * @param {object} o
 * @param {Function} o.pids   () => {text:[pid], voices:[pid], speech:[pid], images:[pid]} (running ones)
 * @param {Function} [o.card] () => the name of the card the text AI uses, or null
 * @param {Function} [o.appMetrics] () => Electron's app.getAppMetrics()
 */
function setupMemoryMeter({pids=()=>({}),card=()=>null,appMetrics=()=>[],log=()=>{},platform=process.platform,mainPid=process.pid,spawnFn=spawn,procDir='/proc',idleMs=20000,timeoutMs=8000,firstTimeoutMs=30000,totalmem=os.totalmem,freemem=os.freemem}={}){
 // The first answer of a new reader may take a while (PowerShell compiles the DXGI part once, and WMI's first GPU
 // query can be slow); after three failures in two minutes it rests for a minute instead of restarting every reading.
 let helper=null,idle=null,cached=null,inflight=null,helperFailed=null,failures=[];
 const stats={readings:0,helperStarts:0};
 function stop(){clearTimeout(idle);idle=null;const h=helper;helper=null;if(h){h.stopped=true;try{h.proc.stdin.end('quit\n');}catch{}setTimeout(()=>{try{h.proc.kill();}catch{}},1500).unref?.();}}
 function startHelper(){
  const exe=path.join(process.env.SystemRoot||'C:\\Windows','System32','WindowsPowerShell','v1.0','powershell.exe');
  const env={};for(const k of ['SystemRoot','SYSTEMROOT','WINDIR','TEMP','TMP','USERPROFILE','LOCALAPPDATA','APPDATA','PATH','PSModulePath'])if(process.env[k]!==undefined)env[k]=process.env[k];
  helperFailed=null;
  const proc=spawnFn(exe,['-NoLogo','-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-EncodedCommand',Buffer.from(PS_SCRIPT,'utf16le').toString('base64')],{windowsHide:true,stdio:['pipe','pipe','pipe'],env});
  stats.helperStarts++;
  const h={proc,buf:'',waiters:[]};
  proc.stdout.setEncoding?.('utf8');
  proc.stdout.on('data',d=>{h.answered=true;h.buf+=d;let i;while((i=h.buf.indexOf('\n'))!==-1){const line=h.buf.slice(0,i).trim();h.buf=h.buf.slice(i+1);if(line)h.waiters.shift()?.resolve(line);}});
  proc.stderr.on('data',()=>{});
  const end=e=>{if(helper===h)helper=null;for(const w of h.waiters.splice(0))w.reject(e);};
  proc.on('error',e=>{helperFailed='PowerShell couldn’t start ('+e.message+').';failures.push(Date.now());h.stopped=true;end(e);});
  proc.on('exit',code=>{if(!h.stopped){failures.push(Date.now());log('Memory meter','PowerShell ended ('+code+')');}end(Error('PowerShell ended ('+code+')'));});
  return h;
 }
 function askWindows(){
  failures=failures.filter(t=>Date.now()-t<120000);
  if(!helper&&failures.length>=3&&Date.now()-failures.at(-1)<60000)return Promise.reject(Error('the reader failed '+failures.length+' times in two minutes; it tries again in a minute'));
  if(!helper)helper=startHelper();const h=helper,limit=h.answered?timeoutMs:Math.max(timeoutMs,firstTimeoutMs);
  return new Promise((resolve,reject)=>{const t=setTimeout(()=>{failures.push(Date.now());reject(Error('Windows’ counters didn’t answer within '+limit/1000+' s'));if(helper===h)stop();},limit);
   h.waiters.push({resolve:v=>{clearTimeout(t);resolve(v);},reject:e=>{clearTimeout(t);reject(e);}});try{h.proc.stdin.write('read\n');}catch(e){clearTimeout(t);reject(e);}});
 }
 async function sample(){
  const ram={total:totalmem(),free:freemem()},why={};let table=null,gpu=null;
  const p=pids()||{},roots=Object.fromEntries(PARTS.slice(1).map(([id])=>[id,(Array.isArray(p[id])?p[id]:[p[id]]).map(Number).filter(n=>Number.isInteger(n)&&n>0)]));
  if(platform==='win32'){
   try{gpu=parseWindows(await askWindows());if(gpu.error){why.procs=why.vram=gpu.error;gpu=null;}else{table=gpu.procs;if(!table)why.procs='Windows didn’t list Tyler’s processes ('+gpu.errors.procs+').';}}
   catch(e){const m=helperFailed||e.message;why.procs='Windows didn’t answer: '+m;why.vram='Windows didn’t answer: '+m;}
  }else if(platform==='linux'){table=linuxProcs(procDir);if(!table)why.procs='/proc couldn’t be read.';why.vram='Graphics memory is read from Windows’ GPU counters, so it isn’t shown on this system.';}
  else{why.procs='Tyler’s processes are listed on Windows only.';why.vram='Graphics memory is read from Windows’ GPU counters, so it isn’t shown on this system.';}
  let metrics=[];try{metrics=appMetrics()||[];}catch{}
  return summarize({ram,table,mainPid,roots,appMetrics:metrics,gpu,card:(()=>{try{return card();}catch{return null;}})(),why});
 }
 /** The latest reading (one at a time; a reading less than a second old is reused). */
 async function read(){
  clearTimeout(idle);idle=setTimeout(stop,idleMs);idle.unref?.();
  if(cached&&Date.now()-cached.at<1000)return cached;
  if(!inflight)inflight=sample().then(r=>{cached=r;stats.readings++;return r;}).finally(()=>{inflight=null;});
  return inflight;
 }
 return {read,view:async()=>view(await read()),stop,stats,get running(){return !!helper;}};
}
module.exports={setupMemoryMeter,view,gb,amount,summarize,parseWindows,parseInstance,luidKey,tree,linuxProcs,level,PARTS,PS_SCRIPT};

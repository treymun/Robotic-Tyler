'use strict';
// ROBOTIC TYLER local AI: runs llama.cpp's llama-server and talks to it (v2.38).
//
//   - It listens only on 127.0.0.1, on a free port picked for each start, and answers only requests
//     that carry the key made for that start (32 random bytes). The key is handed over in the
//     process's own environment (llama-server's LLAMA_API_KEY, the same as --api-key), not on the
//     command line where other programs could read it, and it never leaves this process: it isn't
//     logged, saved, sent to the Steam window, the settings window or the phone remote.
//   - No web page (--no-webui), no slot monitoring (--no-slots), no downloads (--offline), stdin
//     ignored, no window. The environment is a short allowlist, so a LLAMA_ARG_* variable set on the
//     PC can't change how it runs.
//   - Graphics card: every layer on one Vulkan card (--device VulkanN -ngl all). Processor: no card
//     at all (--device none -ngl 0), and the Vulkan backend isn't even loaded. --fit off: llama.cpp
//     doesn't shrink the context or move layers to the processor by itself; if the model doesn't fit,
//     the start fails with that reason.
//   - v2.44 split: an exact number of layers on one Vulkan card, the rest on the processor
//     (--device VulkanN -ngl N, still --fit off and -c 8192). N is decided by Tyler before the start
//     (split.cjs), so llama.cpp never picks or changes it by itself.
const {spawn}=require('node:child_process'),{EventEmitter}=require('node:events'),http=require('node:http'),net=require('node:net'),crypto=require('node:crypto'),path=require('node:path');

const CTX=8192;
// Qwen3.5's thinking is off for chat replies (checked with b11669: --reasoning off makes the template
// skip the thinking block; the template switch says the same thing to the model's own template).
const THINKING_OFF=['--reasoning','off','--chat-template-kwargs','{"enable_thinking":false}'];
// Qwen3.5's suggested sampling for replies without thinking (its model card). The request body stays
// clean (messages, max_tokens, stream, a temperature only if Tyler sets one).
const SAMPLING=['--temp','0.7','--top-p','0.8','--top-k','20','--min-p','0','--presence-penalty','1.5'];
const KEEP_ENV=['SystemRoot','SYSTEMROOT','WINDIR','TEMP','TMP','LOCALAPPDATA','APPDATA','USERPROFILE','HOME','PATH','NUMBER_OF_PROCESSORS','PROCESSOR_ARCHITECTURE'];

function freePort(){return new Promise((resolve,reject)=>{const s=net.createServer();s.unref();s.on('error',reject);s.listen(0,'127.0.0.1',()=>{const {port}=s.address();s.close(()=>resolve(port));});});}
/** What a failed start or a crash means, from the engine's last lines. */
function classify(lines){
 const t=lines.join('\n');
 if(/out of (device )?memory|OutOfDeviceMemory|failed to allocate|unable to allocate|cannot allocate|not enough memory|alloc(ation)? failed|allocation of size \d+ failed|ErrorOutOfHostMemory|failed to create context/i.test(t))return 'out_of_memory';
 if(/couldn.?t bind|address already in use|bind\(\) failed|failed to bind/i.test(t))return 'bind';
 if(/failed to load model|error loading model|unknown model architecture|invalid magic|gguf_init_from_file/i.test(t))return 'model_load';
 return 'crashed';
}

class LlamaServer extends EventEmitter{
 /**
  * @param {object} o
  * @param {string} o.exe        llama-server(.exe) in the engine folder
  * @param {string} o.model      the .gguf file
  * @param {'gpu'|'split'|'cpu'} o.device
  * @param {string} [o.gpuId]    the Vulkan device to use (VulkanN), for 'gpu' and 'split'
  * @param {number} [o.layers]   for 'split': how many layers go on the card (1 or more)
  * @param {string} [o.gpuBackend] the Vulkan backend file, loaded only for 'gpu' and 'split'
  * @param {number} o.threads
  */
 constructor({exe,model,device,gpuId=null,layers=0,gpuBackend=null,threads=4,ctx=CTX,log=()=>{},startTimeout=180000,extraArgs=[]}){
  super();Object.assign(this,{exe,model,device,gpuId,layers,gpuBackend,threads,ctx,log,startTimeout,extraArgs});
  this.proc=null;this.port=null;this.key=null;this.tail=[];this.ready=null;this.exitInfo=null;this.stopping=false;this.requests=new Set();
 }
 get alive(){return !!this.proc&&this.proc.exitCode===null&&this.proc.signalCode===null;}
 get usesCard(){return this.device==='gpu'||this.device==='split'&&this.layers>0;}
 /** The command line (without the key, which is in the environment). */
 args(port){
  const n=Math.max(0,Math.floor(Number(this.layers)||0));
  const where=this.device==='gpu'?['--device',this.gpuId||'Vulkan0','-ngl','all']:this.device==='split'&&n>0?['--device',this.gpuId||'Vulkan0','-ngl',String(n)]:['--device','none','-ngl','0'];
  return ['-m',this.model,'--host','127.0.0.1','--port',String(port),'-c',String(this.ctx),'-np','1','--jinja',...THINKING_OFF,...SAMPLING,
   '--no-webui','--no-slots','--offline','--cache-ram','0','--fit','off','-t',String(this.threads),'-tb',String(this.threads),...where,
   '--alias','tyler-local','--log-colors','off',...this.extraArgs];
 }
 env(){
  const env={};for(const k of KEEP_ENV)if(process.env[k]!==undefined)env[k]=process.env[k];
  env.LLAMA_API_KEY=this.key;
  if(this.usesCard&&this.gpuBackend)env.GGML_BACKEND_PATH=this.gpuBackend;
  return env;
 }
 redact(s){return this.key?String(s).split(this.key).join('[key]'):String(s);}
 start(){
  if(this.ready)return this.ready;
  this.ready=(async()=>{
   for(let attempt=1;;attempt++){
    try{return await this.startOnce();}
    catch(e){if(e.code==='bind'&&attempt<3){this.log('Local AI','port in use, trying another');continue;}this.ready=null;throw e;}
   }
  })();
  return this.ready;
 }
 async startOnce(){
  const port=await freePort(),started=Date.now();
  this.key=crypto.randomBytes(32).toString('base64url');this.port=port;this.tail=[];this.exitInfo=null;this.stopping=false;
  const proc=spawn(this.exe,this.args(port),{cwd:path.dirname(this.exe),env:this.env(),windowsHide:true,stdio:['ignore','pipe','pipe']});
  this.proc=proc;
  const keep=d=>{for(const l of String(d).split(/\r?\n/))if(l.trim()){this.tail.push(this.redact(l).slice(0,300));if(this.tail.length>60)this.tail.shift();}};
  proc.stdout.on('data',keep);proc.stderr.on('data',keep);
  const exited=new Promise(resolve=>{
   proc.on('error',e=>{this.exitInfo={code:null,signal:null,error:e};resolve(this.exitInfo);});
   proc.on('exit',(code,signal)=>{this.exitInfo={code,signal};resolve(this.exitInfo);
    for(const r of this.requests)r.destroy(Object.assign(Error('closed'),{code:'ECONNRESET'}));
    if(this.proc===proc){this.proc=null;this.ready=null;}this.emit('exit',{code,signal,stopped:this.stopping,reason:this.stopping?'stopped':classify(this.tail)});});
  });
  // Ready when /health says so (it answers 503 while the model loads).
  const deadline=Date.now()+this.startTimeout;
  for(;;){
   const done=await Promise.race([exited.then(()=>'exit'),new Promise(r=>setTimeout(()=>r('poll'),250))]);
   if(done==='exit'||!this.alive){
    const info=this.exitInfo||{};
    if(info.error)throw Object.assign(Error(info.error.code==='ENOENT'?'The AI engine is missing ('+path.basename(this.exe)+'). Install it again in Settings → On this PC.':'The AI engine couldn’t start: '+info.error.message),{code:info.error.code==='ENOENT'?'not_installed':'spawn'});
    if(this.stopping)throw Object.assign(Error('Stopped.'),{code:'cancelled'});
    const kind=classify(this.tail);
    throw Object.assign(Error(kind==='bind'?'port in use':this.lastLines()),{code:kind,detail:this.lastLines()});
   }
   const h=await this.health().catch(()=>null);
   if(h===200){const ms=Date.now()-started;this.log('Local AI','ready on 127.0.0.1 ('+this.device+(this.device==='split'?' '+this.layers+' layers on the card':'')+', '+path.basename(this.model)+') after '+ms+' ms');return {port,loadMs:ms};}
   if(Date.now()>deadline){this.kill();throw Object.assign(Error('The AI on this PC didn’t finish loading within '+Math.round(this.startTimeout/1000)+' seconds.'),{code:'start_timeout'});}
  }
 }
 /** Resolves when the process has ended (or after `ms`): a reply cut short waits for the reason. */
 waitExit(ms=2000){const p=this.proc;if(!p||p.exitCode!==null||p.signalCode!==null)return Promise.resolve(true);return Promise.race([new Promise(r=>p.once('exit',()=>setImmediate(()=>r(true)))),new Promise(r=>setTimeout(()=>r(false),ms))]);}
 lastLines(){return this.tail.filter(l=>!/^\s*$/.test(l)).slice(-3).join(' / ').slice(0,400)||'no message';}
 health(){return new Promise((resolve,reject)=>{const req=http.get({host:'127.0.0.1',port:this.port,path:'/health',agent:false,timeout:2000},res=>{res.resume();resolve(res.statusCode);});req.on('error',reject);req.on('timeout',()=>req.destroy(Error('timeout')));});}
 /**
  * One request to the server with the key. Resolves with {status, headers, body (string) } or, with
  * onLine, streams the response's lines to it and resolves at the end.
  */
 request(pathname,{method='GET',body=null,signal,onLine,stallMs=60000,auth=true}={}){
  return new Promise((resolve,reject)=>{
   if(!this.alive)return reject(Object.assign(Error('not running'),{code:'not_running'}));
   const data=body==null?null:Buffer.from(typeof body==='string'?body:JSON.stringify(body));
   let settled=false,why=null,quiet=null;
   const done=(e,v)=>{if(settled)return;settled=true;clearTimeout(quiet);this.requests.delete(req);signal?.removeEventListener('abort',abort);e?reject(e):resolve(v);};
   const cut=e=>{why=why||e;req.destroy(e);done(e);};
   const req=http.request({host:'127.0.0.1',port:this.port,path:pathname,method,agent:false,headers:{...(auth?{Authorization:'Bearer '+this.key}:{}),...(data?{'Content-Type':'application/json','Content-Length':data.length}:{}),Accept:onLine?'text/event-stream':'application/json'}},res=>{
    let carry='',text='';const decoder=new TextDecoder();
    const arm=()=>{clearTimeout(quiet);quiet=setTimeout(()=>cut(Object.assign(Error('stalled'),{code:'stall'})),stallMs);};arm();
    res.on('data',chunk=>{if(settled)return;arm();
     const s=decoder.decode(chunk,{stream:true});
     if(!onLine||res.statusCode!==200){if(text.length<200000)text+=s;return;}
     carry+=s;let i;while((i=carry.indexOf('\n'))!==-1){const line=carry.slice(0,i).replace(/\r$/,'');carry=carry.slice(i+1);try{onLine(line);}catch(e){cut(e);return;}}});
    res.on('end',()=>{if(settled)return;if(onLine&&carry&&res.statusCode===200){try{onLine(carry);}catch(e){return done(e);}}done(null,{status:res.statusCode,body:text});});
    res.on('error',e=>done(why||e));
    res.on('aborted',()=>done(why||Object.assign(Error('closed'),{code:'ECONNRESET'})));
    res.on('close',()=>{if(!res.complete)done(why||Object.assign(Error('closed'),{code:'ECONNRESET'}));});
   });
   this.requests.add(req);
   const abort=()=>cut(Object.assign(Error('Stopped.'),{code:'cancelled'}));
   if(signal){if(signal.aborted){abort();return;}signal.addEventListener('abort',abort,{once:true});}
   req.on('error',e=>done(why||e));
   if(data)req.write(data);req.end();
  });
 }
 /**
  * A chat reply from /v1/chat/completions (OpenAI-style). With stream, `onDelta(fullTextSoFar)` is
  * called as the text comes. Resolves {text, usage, timings, firstTokenMs}.
  */
 async chat(body,{signal,onDelta,stallMs}={}){
  const sent=Date.now();let firstTokenMs=null,content='',usage=null,timings=null,streamError=null;
  const onLine=body.stream?line=>{
   if(!line.startsWith('data:'))return;const raw=line.slice(5).trim();if(!raw||raw==='[DONE]')return;
   let piece;try{piece=JSON.parse(raw);}catch{return;}
   if(piece.error){streamError=piece.error;return;}
   if(piece.usage)usage=piece.usage;if(piece.timings)timings=piece.timings;
   const delta=piece.choices?.[0]?.delta?.content;
   if(typeof delta==='string'&&delta){if(firstTokenMs===null)firstTokenMs=Date.now()-sent;if(content.length<20000){content+=delta;onDelta?.(content);}}
  }:null;
  const r=await this.request('/v1/chat/completions',{method:'POST',body,signal,onLine,stallMs});
  if(r.status!==200){let m='';try{const d=JSON.parse(r.body);m=d.error?.message||d.message||'';}catch{m=r.body.slice(0,200);}
   throw Object.assign(Error('the engine answered '+r.status+(m?': '+this.redact(m).slice(0,200):'')),{code:r.status===401?'auth':'http',status:r.status});}
  if(streamError)throw Object.assign(Error(this.redact(String(streamError.message||'the engine stopped with an error')).slice(0,200)),{code:'http'});
  if(!body.stream){let d={};try{d=JSON.parse(r.body);}catch{}content=String(d.choices?.[0]?.message?.content||'');usage=d.usage||null;timings=d.timings||null;firstTokenMs=Date.now()-sent;}
  return {text:content,usage,timings,firstTokenMs,ms:Date.now()-sent};
 }
 /** Asks the engine to stop and waits until it has (so its memory is free), then makes sure. */
 async stop(){
  const p=this.proc;if(!p||p.exitCode!==null||p.signalCode!==null)return;
  this.stopping=true;const ended=new Promise(r=>p.once('exit',r));
  try{p.kill();}catch{}
  if(await Promise.race([ended.then(()=>true),new Promise(r=>setTimeout(()=>r(false),5000))]))return;
  try{p.kill('SIGKILL');}catch{}await Promise.race([ended,new Promise(r=>setTimeout(r,3000))]);
 }
 /** Ends it at once (the app is quitting). */
 kill(){const p=this.proc;if(!p)return;this.stopping=true;try{p.kill(process.platform==='win32'?undefined:'SIGKILL');}catch{}}
}
module.exports={LlamaServer,classify,freePort,THINKING_OFF,SAMPLING,CTX};

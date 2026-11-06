'use strict';
// ROBOTIC TYLER theme voices: runs the voice worker process and talks to it (v2.35).
//
// The worker is the engine's own Python, started isolated (-I -S) with an empty environment apart
// from what it needs, no window, and pipes as its only connection: nothing else on the PC (and
// nothing on the network, including the phone remote) can reach it.
const {spawn}=require('node:child_process'),{EventEmitter}=require('node:events'),readline=require('node:readline');

class WorkerHost extends EventEmitter{
 constructor({python,script,site,cwd,log=()=>{},env={}}){super();Object.assign(this,{python,script,site,cwd,log,extraEnv:env});this.proc=null;this.pending=new Map();this.seq=0;this.ready=null;this.stderrTail=[];}
 get alive(){return !!this.proc&&this.proc.exitCode===null&&!this.proc.killed;}
 start(){
  if(this.ready)return this.ready;
  const keep=['SystemRoot','SYSTEMROOT','WINDIR','TEMP','TMP','LOCALAPPDATA','APPDATA','USERPROFILE','HOME','PATH','NUMBER_OF_PROCESSORS','PROCESSOR_ARCHITECTURE','CUDA_VISIBLE_DEVICES','TYLER_WORKER_TRACE'];
  const env={};for(const k of keep)if(process.env[k]!==undefined)env[k]=process.env[k];
  Object.assign(env,{PYTHONIOENCODING:'utf-8',PYTHONDONTWRITEBYTECODE:'1',PYTHONNOUSERSITE:'1',HF_HUB_OFFLINE:'1',TRANSFORMERS_OFFLINE:'1',HF_HUB_DISABLE_TELEMETRY:'1'},this.extraEnv);
  // -X utf8: the pipes are UTF-8 whatever the PC's code page (-I makes Python ignore PYTHONIOENCODING).
  const proc=spawn(this.python,['-I','-S','-X','utf8','-u',this.script,'--site',this.site],{cwd:this.cwd,env,windowsHide:true,stdio:['pipe','pipe','pipe']});
  this.proc=proc;
  this.ready=new Promise((resolve,reject)=>{
   const timer=setTimeout(()=>{reject(Object.assign(Error('The voice engine didn’t start within 90 seconds.'),{code:'start_timeout'}));this.kill();},90000);
   const lines=readline.createInterface({input:proc.stdout});
   lines.on('line',line=>{let m;try{m=JSON.parse(line);}catch{this.log('Theme voices worker said',line.slice(0,200));return;}
    if(m.event==='ready'){clearTimeout(timer);resolve(m);return;}
    const job=this.pending.get(m.id);if(!job)return;
    if(m.event==='progress'){job.onProgress?.(m);return;}
    this.pending.delete(m.id);clearTimeout(job.timer);
    m.ok?job.resolve(m):job.reject(Object.assign(Error(m.error||'The voice engine failed.'),{code:m.code||'error',trace:m.trace,info:m.info&&typeof m.info==='object'?m.info:null}));});
   proc.stderr.on('data',d=>{for(const l of String(d).split(/\r?\n/))if(l.trim()){this.stderrTail.push(l.slice(0,300));if(this.stderrTail.length>40)this.stderrTail.shift();}});
   proc.on('error',e=>{clearTimeout(timer);reject(Object.assign(Error('The voice engine couldn’t start: '+e.message),{code:'spawn'}));});
   proc.on('exit',(code,signal)=>{clearTimeout(timer);this.ready=null;this.proc=null;
    const why=Object.assign(Error(signal==='SIGKILL'||this.killing?'The voice engine was stopped.':'The voice engine closed unexpectedly (exit '+code+').'+(this.stderrTail.length?' Last message: '+this.stderrTail.slice(-2).join(' / '):'')),{code:this.killing?'stopped':'crashed'});
    for(const [,job] of this.pending){clearTimeout(job.timer);job.reject(why);}this.pending.clear();this.killing=false;
    reject(why);this.emit('exit',{code,signal});});
  });
  return this.ready;
 }
 async request(op,payload={},{timeout=120000,onProgress}={}){
  await this.start();
  const id=++this.seq;
  return new Promise((resolve,reject)=>{
   const timer=setTimeout(()=>{this.pending.delete(id);this.cancel(id);reject(Object.assign(Error('The voice engine took too long ('+Math.round(timeout/1000)+' s).'),{code:'timeout'}));},timeout);
   this.pending.set(id,{resolve,reject,timer,onProgress,op});
   try{this.proc.stdin.write(JSON.stringify({id,op,...payload})+'\n');}catch(e){this.pending.delete(id);clearTimeout(timer);reject(e);}
  });
 }
 /** The id the next request will get (so a caller can cancel the one it is about to send). */
 nextId(){return this.seq+1;}
 cancel(id){try{if(this.alive)this.proc.stdin.write(JSON.stringify({id:'c'+id,op:'cancel',target:id})+'\n');}catch{}}
 /** Asks the engine to close, waits for the process to end (so its files are no longer in use), then makes sure. */
 async quit(){
  const p=this.proc;if(!p||p.exitCode!==null)return;
  const ended=new Promise(r=>p.once('exit',r));
  try{p.stdin.write(JSON.stringify({id:'quit',op:'quit'})+'\n');}catch{}
  if(await Promise.race([ended.then(()=>true),new Promise(r=>setTimeout(()=>r(false),5000))]))return;
  this.kill();await Promise.race([ended,new Promise(r=>setTimeout(r,3000))]);
 }
 kill(){if(this.proc){this.killing=true;try{this.proc.kill();}catch{}}}
}
module.exports={WorkerHost};

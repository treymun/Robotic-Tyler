#!/usr/bin/env node
// A FAKE llama-server for tests/local-ai.test.mjs: the same command line, the same /health and
// OpenAI-style /v1/chat/completions (streamed or not), and the same key rule (LLAMA_API_KEY, sent as
// "Authorization: Bearer KEY"). No model runs: replies are fixed text. What it should do comes from
// fake-config.json next to it (written by the test); what it saw is appended to config.log.
'use strict';
const http=require('node:http'),fs=require('node:fs'),path=require('node:path');
const cfgFile=path.join(path.dirname(fs.realpathSync(process.argv[1])),'fake-config.json');
let cfg={};try{cfg=JSON.parse(fs.readFileSync(cfgFile,'utf8'));}catch{}
const argv=process.argv.slice(2),arg=n=>{const i=argv.indexOf(n);return i>=0?argv[i+1]:undefined;};
const log=entry=>{if(cfg.log)fs.appendFileSync(cfg.log,JSON.stringify({pid:process.pid,...entry})+'\n');};
const key=process.env.LLAMA_API_KEY||'';
if(argv.includes('--list-devices')){
 console.log('Available devices:');
 const devs=process.env.GGML_BACKEND_PATH&&cfg.devices?cfg.devices:[];
 if(!devs.length)console.log('  (none)');
 for(const d of devs)console.log('  '+d.id+': '+d.name+' ('+d.total+' MiB, '+d.free+' MiB free)');
 log({listDevices:true,backend:process.env.GGML_BACKEND_PATH||null});process.exit(0);
}
log({start:true,argv,envKeys:Object.keys(process.env).sort(),keyLength:key.length,keyInArgv:!!key&&argv.some(a=>a.includes(key)),backend:process.env.GGML_BACKEND_PATH||null,stdinIsTTY:!!process.stdin.isTTY});
const model=arg('-m');if(!model||!fs.existsSync(model)){console.error('gguf_init_from_file: failed to open GGUF file');process.exit(1);}
if(cfg.mode==='oom'){setTimeout(()=>{console.error('ggml_vulkan: Device memory allocation of size 5000000000 failed.');console.error('llama_model_load: error loading model: unable to allocate Vulkan0 buffer');process.exit(1);},100);return;}
let loaded=false;setTimeout(()=>{loaded=true;},cfg.loadMs??200);
const send=(res,status,obj)=>{res.writeHead(status,{'Content-Type':'application/json'});res.end(JSON.stringify(obj));};
const server=http.createServer((req,res)=>{
 if(req.url==='/health'){if(!loaded||cfg.mode==='never-ready')return send(res,503,{error:{code:503,message:'Loading model',type:'unavailable_error'}});return send(res,200,{status:'ok'});}
 if(req.headers.authorization!=='Bearer '+key||!key){log({rejected:req.url});return send(res,401,{error:{code:401,message:'Invalid API Key',type:'authentication_error'}});}
 if(req.url==='/v1/chat/completions'&&req.method==='POST'){
  let raw='';req.on('data',d=>raw+=d);req.on('end',async()=>{
   const body=JSON.parse(raw);log({chat:body});
   const text=cfg.reply||'GG, that was a clean round.',words=text.match(/\S+\s*/g)||[text];
   const timings={prompt_n:42,prompt_ms:120,prompt_per_second:350,predicted_n:words.length,predicted_ms:words.length*10,predicted_per_second:100};
   if(!body.stream)return send(res,200,{choices:[{message:{role:'assistant',content:text}}],usage:{prompt_tokens:42,completion_tokens:words.length},timings});
   res.writeHead(200,{'Content-Type':'text/event-stream'});
   let closed=false;res.on('close',()=>{if(!res.writableEnded)closed=true;}); // the client went away (Stop)
   for(let i=0;i<words.length;i++){
    if(closed){log({clientClosed:true,at:i});return;}
    if(cfg.mode==='crash-mid'&&i===2){console.error('GGML_ASSERT(fake) failed: out of memory');process.exit(3);}
    res.write('data: '+JSON.stringify({choices:[{index:0,delta:{content:words[i]}}]})+'\n\n');
    await new Promise(r=>setTimeout(r,cfg.tokenDelay??5));
   }
   res.write('data: '+JSON.stringify({choices:[{index:0,delta:{},finish_reason:'stop'}],timings})+'\n\ndata: [DONE]\n\n');res.end();
  });return;
 }
 send(res,404,{error:{code:404,message:'File Not Found'}});
});
server.listen(Number(arg('--port')),arg('--host')||'127.0.0.1',()=>{console.error('main: server is listening on http://'+arg('--host')+':'+arg('--port'));log({listening:server.address()});});
process.on('SIGTERM',()=>{log({sigterm:true});process.exit(0);});

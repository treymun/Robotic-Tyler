#!/usr/bin/env node
// A FAKE stable-diffusion.cpp sd-cli for tests/local-images.test.mjs (v2.40): the same command line,
// the same log lines and progress bars (as sd-cli master-1017 prints them), --version and
// --list-devices, and a real (blank) PNG of the asked size written where -o says. No model runs.
// What it should do comes from fake-config.json next to it (written by the test); what it saw is
// appended to config.log. Modes: ok, oom, crash-mid, no-output, wrong-size, hang, no-device, load-fail.
'use strict';
const fs=require('node:fs'),path=require('node:path'),zlib=require('node:zlib');
const cfgFile=path.join(path.dirname(fs.realpathSync(process.argv[1])),'fake-config.json');
let cfg={};try{cfg=JSON.parse(fs.readFileSync(cfgFile,'utf8'));}catch{}
const argv=process.argv.slice(2),arg=n=>{const i=argv.indexOf(n);return i>=0?argv[i+1]:undefined;};
const log=entry=>{if(cfg.log)fs.appendFileSync(cfg.log,JSON.stringify({pid:process.pid,...entry})+'\n');};
const info=(msg,where='fake.cpp:1')=>process.stdout.write('[I] '+msg+' --- '+where+'\n');
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
if(argv[0]==='--version'){console.log('stable-diffusion.cpp version unknown, commit '+(cfg.commit||'be48649'));process.exit(cfg.versionExit||0);}
if(argv[0]==='--list-devices'){
 const devs=process.env.GGML_BACKEND_PATH&&cfg.devices?cfg.devices:[];
 devs.forEach((d,i)=>console.error('ggml_vulkan: '+i+' = '+d.name+' (fake driver) | uma: '+(d.uma?1:0)+' | fp16: 1 | bf16: 0'));
 devs.forEach((d,i)=>console.log('Vulkan'+i+'\t'+d.name));console.log('CPU\tFake processor');
 log({listDevices:true,backend:process.env.GGML_BACKEND_PATH||null});process.exit(0);
}
function crc32(buf){let c,crc=0xffffffff;for(const b of buf){c=(crc^b)&0xff;for(let k=0;k<8;k++)c=c&1?0xedb88320^(c>>>1):c>>>1;crc=(crc>>>8)^c;}return (crc^0xffffffff)>>>0;}
function png(w,h){
 const chunk=(type,data)=>{const len=Buffer.alloc(4);len.writeUInt32BE(data.length);const td=Buffer.concat([Buffer.from(type),data]);const crc=Buffer.alloc(4);crc.writeUInt32BE(crc32(td));return Buffer.concat([len,td,crc]);};
 const ihdr=Buffer.alloc(13);ihdr.writeUInt32BE(w,0);ihdr.writeUInt32BE(h,4);ihdr[8]=8;ihdr[9]=2;
 const raw=Buffer.alloc((w*3+1)*h);for(let y=0;y<h;y++)for(let x=0;x<w;x++){const o=y*(w*3+1)+1+x*3;raw[o]=x%256;raw[o+1]=y%256;raw[o+2]=128;}
 return Buffer.concat([Buffer.from([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a]),chunk('IHDR',ihdr),chunk('IDAT',zlib.deflateSync(raw)),chunk('IEND',Buffer.alloc(0))]);
}
process.on('SIGTERM',()=>{log({sigterm:true});process.exit(143);});
(async()=>{
 const promptFile=arg('--prompt-file'),negFile=arg('--negative-prompt-file');
 const prompt=promptFile&&fs.existsSync(promptFile)?fs.readFileSync(promptFile,'utf8'):null,negative=negFile&&fs.existsSync(negFile)?fs.readFileSync(negFile,'utf8'):null;
 log({start:true,argv,cwd:process.cwd(),envKeys:Object.keys(process.env).sort(),backend:process.env.GGML_BACKEND_PATH||null,prompt,negative,promptInArgv:!!prompt&&argv.some(a=>a.includes(prompt))});
 for(const f of ['--diffusion-model','--llm','--t5xxl','--vae','-m']){const p=arg(f);if(p&&!fs.existsSync(p)){process.stdout.write('[E] failed to open \''+p+'\' --- model_loader.cpp:200\n');process.stdout.write('[I] new_sd_ctx_t failed --- main.cpp:894\n');process.exit(1);}}
 const backend=arg('--backend')||'';
 if(cfg.mode==='no-device'||(/^vulkan/i.test(backend)&&!process.env.GGML_BACKEND_PATH)){process.stdout.write('[E] backend \''+backend+'\' was not found --- ggml_extend_backend.cpp:1162\n');process.exit(1);}
 if(cfg.mode==='load-fail'){process.stdout.write('[E] get sd version from file failed: \'x.gguf\' --- diffusion_engine.cpp:960\n[I] new_sd_ctx_t failed --- main.cpp:894\n');process.exit(1);}
 const w=Number(arg('-W')),h=Number(arg('-H')),steps=Number(arg('--steps')),seed=Number(arg('--seed')),out=arg('-o'),gpu=/^vulkan/i.test(backend);
 info('loading diffusion model from \''+(arg('--diffusion-model')||arg('-m'))+'\'','diffusion_engine.cpp:692');
 process.stdout.write('\n  |##################################################| 10/10 - 512.00MB/s\x1b[K\n');
 await sleep(cfg.loadMs??30);
 info('total params memory size = 6200.00MB (VRAM '+(gpu?'3900.00':'0.00')+'MB, RAM '+(gpu?'2300.00':'6200.00')+'MB): text_encoders 2300.00MB(RAM)','diffusion_engine.cpp:1423');
 if(cfg.mode==='oom'){console.error('ggml_vulkan: Device memory allocation of size 4096000000 failed.');process.stdout.write('[E] model manager alloc params backend buffer failed, size = 3900.00MB --- model_manager.cpp:899\n');process.exit(1);}
 info('generate_image '+w+'x'+h,'image.cpp:869');info('get_learned_condition completed, taking 0.12s','image.cpp:580');info('generating image: 1/1 - seed '+seed,'image.cpp:920');
 const t0=Date.now();
 for(let i=1;i<=steps;i++){
  if(cfg.mode==='hang'&&i===2){log({hanging:true});await sleep(10**9);}
  await sleep(cfg.stepMs??10);
  if(cfg.mode==='crash-mid'&&i===2){console.error('GGML_ASSERT(fake) failed');process.exit(3);}
  process.stdout.write('\r  |'+'='.repeat(Math.round(50*i/steps)).padEnd(50,' ')+'| '+i+'/'+steps+' - '+((cfg.stepMs??10)/1000).toFixed(2)+'s/it\x1b[K'+(i===steps?'\n':''));
 }
 info('sampling completed, taking '+((Date.now()-t0)/1000).toFixed(2)+'s','image.cpp:953');info('decoding 1 latents','image.cpp:605');
 info('decode_first_stage completed, taking 0.05s','image.cpp:675');info('generate_image completed in '+((Date.now()-t0)/1000+0.2).toFixed(2)+'s','image.cpp:1140');
 if(cfg.mode==='no-output'){info('1/1 images saved','main.cpp:571');process.exit(0);}
 const [ow,oh]=cfg.mode==='wrong-size'?[64,64]:[w,h];
 fs.writeFileSync(out,png(ow,oh));info('save result image 0 to \''+out+'\' (success)','main.cpp:495');info('1/1 images saved','main.cpp:571');
 log({done:true,w:ow,h:oh});process.exit(0);
})();

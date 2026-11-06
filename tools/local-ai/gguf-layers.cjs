// Reads a GGUF file's header (its metadata and tensor list, not the weights) and prints what
// "Split between the graphics card and the processor" (v2.44) needs for app/local-ai/lock.json → models.<key>.layers:
// how many repeating layers the model has, how big each one is, the parts outside the layers, and the
// cache each layer keeps for the 8192-token context.
// Works on a local .gguf, or on the pinned URL with HTTP range requests (only the first few MB are read).
// Usage: node tools/local-ai/gguf-layers.cjs <file.gguf | https://…/file.gguf | lock:<model key>> [--ctx 8192]
'use strict';
const fs=require('node:fs'),path=require('node:path');

const TYPES={0:'u8',1:'i8',2:'u16',3:'i16',4:'u32',5:'i32',6:'f32',7:'bool',8:'str',9:'arr',10:'u64',11:'i64',12:'f64'};
const SIZE={u8:1,i8:1,u16:2,i16:2,u32:4,i32:4,f32:4,bool:1,u64:8,i64:8,f64:8};
class Short extends Error{constructor(){super('header continues past the bytes read');this.code='short';}}
/** Parses a GGUF header from `buf` (the start of the file). Throws {code:'short'} if `buf` ends too soon. */
function parseHeader(buf){
 let o=0;const need=n=>{if(o+n>buf.length)throw new Short();};
 const u32=()=>{need(4);const v=buf.readUInt32LE(o);o+=4;return v;},u64=()=>{need(8);const v=Number(buf.readBigUInt64LE(o));o+=8;return v;};
 const str=()=>{const n=u64();need(n);const s=buf.toString('utf8',o,o+n);o+=n;return s;};
 const scalar=t=>{if(t==='str')return str();need(SIZE[t]);let v;
  switch(t){case 'u8':v=buf.readUInt8(o);break;case 'i8':v=buf.readInt8(o);break;case 'u16':v=buf.readUInt16LE(o);break;case 'i16':v=buf.readInt16LE(o);break;
   case 'u32':v=buf.readUInt32LE(o);break;case 'i32':v=buf.readInt32LE(o);break;case 'f32':v=buf.readFloatLE(o);break;case 'bool':v=buf.readUInt8(o)!==0;break;
   case 'u64':v=Number(buf.readBigUInt64LE(o));break;case 'i64':v=Number(buf.readBigInt64LE(o));break;case 'f64':v=buf.readDoubleLE(o);break;default:throw Error('bad type '+t);}
  o+=SIZE[t];return v;};
 need(4);if(buf.toString('latin1',0,4)!=='GGUF')throw Error('not a GGUF file');o=4;
 const version=u32(),nTensors=u64(),nKV=u64(),kv={};
 for(let i=0;i<nKV;i++){
  const key=str(),t=TYPES[u32()];
  if(t==='arr'){const it=TYPES[u32()],n=u64();
   // Long arrays (the tokenizer's) are skipped: only their length is kept.
   if(it==='str'){for(let j=0;j<n;j++){const len=u64();need(len);o+=len;}kv[key]={array:n};}
   else if(n>64){need(n*SIZE[it]);o+=n*SIZE[it];kv[key]={array:n};}
   else{const a=[];for(let j=0;j<n;j++)a.push(scalar(it));kv[key]=a;}}
  else kv[key]=scalar(t);
 }
 const tensors=[];
 for(let i=0;i<nTensors;i++){const name=str(),nd=u32(),dims=[];for(let j=0;j<nd;j++)dims.push(u64());tensors.push({name,dims,type:u32(),offset:u64()});}
 const align=kv['general.alignment']||32,dataStart=Math.ceil(o/align)*align;
 return {version,kv,tensors,headerBytes:o,dataStart};
}
/** Each tensor's size from the offsets (the last one runs to the end of the file). */
function sizes(h,fileSize){
 const t=h.tensors.slice().sort((a,b)=>a.offset-b.offset);
 for(let i=0;i<t.length;i++)t[i].bytes=(i+1<t.length?t[i+1].offset:fileSize-h.dataStart)-t[i].offset;
 return t;
}
/**
 * What the lock keeps for one model: {count, bytes[], outside:{embed, output, other}, cache[], state[]}.
 * cache[i]: the K and V cache of layer i for `ctx` tokens in f16 (0 for a layer without attention);
 * state[i]: the fixed recurrent state of a linear-attention layer (Qwen3.5's Gated DeltaNet), f32.
 */
function summary(h,fileSize,{ctx=8192}={}){
 const arch=h.kv['general.architecture'],k=n=>h.kv[arch+'.'+n];
 const count=k('block_count'),bytes=Array(count).fill(0),t=sizes(h,fileSize);let embed=0,output=0,other=0;
 const has=Array.from({length:count},()=>new Set());
 for(const x of t){const m=/^blk\.(\d+)\.(.+)$/.exec(x.name);
  if(m&&Number(m[1])<count){bytes[Number(m[1])]+=x.bytes;has[Number(m[1])].add(m[2]);}
  else if(x.name==='token_embd.weight')embed+=x.bytes;else if(x.name==='output.weight')output+=x.bytes;else other+=x.bytes;}
 const per=v=>Array.isArray(v)?v:Array(count).fill(v);
 const headsKV=per(k('attention.head_count_kv')??k('attention.head_count')),kLen=k('attention.key_length')??(k('embedding_length')/k('attention.head_count')),vLen=k('attention.value_length')??kLen;
 // A layer has a K/V cache when it has attention weights (attn_k / attn_q); Qwen3.5's other layers are linear attention.
 const attn=has.map(s=>s.has('attn_k.weight')||s.has('attn_qkv.weight')&&!s.has('ssm_a'));
 const cache=attn.map((a,i)=>a?ctx*headsKV[i]*(kLen+vLen)*2:0);
 // Gated DeltaNet state: conv (kernel-1)·channels + heads·head_k·head_v, in f32 (one sequence).
 const conv=k('ssm.conv_kernel'),inner=k('ssm.inner_size'),groups=k('ssm.group_count'),dState=k('ssm.state_size'),vHeads=k('ssm.time_step_rank');
 const state=attn.map(a=>a||!conv?0:4*((conv-1)*(inner+2*groups*dState)+vHeads*dState*(inner/vHeads)));
 return {arch,count,bytes,outside:{embed,output,other},cache,state,ctx,keys:{headsKV:k('attention.head_count_kv'),kLen,vLen,embedding:k('embedding_length'),fullAttentionInterval:k('full_attention_interval')??null,conv,inner,groups,dState,vHeads}};
}
async function readStart(src,want){
 if(/^https:/.test(src)){
  const r=await fetch(src,{headers:{Range:'bytes=0-'+(want-1)},redirect:'follow'});
  if(r.status!==206&&r.status!==200)throw Error('HTTP '+r.status);
  const total=Number((/\/(\d+)$/.exec(r.headers.get('content-range')||'')||[])[1])||Number(r.headers.get('content-length'));
  return {buf:Buffer.from(await r.arrayBuffer()).subarray(0,want),size:total};
 }
 const fd=fs.openSync(src,'r');try{const size=fs.fstatSync(fd).size,buf=Buffer.alloc(Math.min(want,size));fs.readSync(fd,buf,0,buf.length,0);return {buf,size};}finally{fs.closeSync(fd);}
}
async function read(src,{ctx=8192}={}){
 for(let want=8*2**20;;want*=2){
  const {buf,size}=await readStart(src,want);
  try{const h=parseHeader(buf);return {header:h,size,summary:summary(h,size,{ctx})};}
  catch(e){if(e.code!=='short'||want>=256*2**20||buf.length<want)throw e;}
 }
}
module.exports={parseHeader,summary,read};
if(require.main===module)(async()=>{
 const args=process.argv.slice(2),ctx=Number(args[args.indexOf('--ctx')+1])||8192;let src=args.find(a=>!a.startsWith('--')&&String(Number(a))!==a);
 if(!src)throw Error('Usage: node tools/local-ai/gguf-layers.cjs <file.gguf | URL | lock:<model>>');
 if(src.startsWith('lock:')){const lock=JSON.parse(fs.readFileSync(path.join(__dirname,'..','..','app','local-ai','lock.json'),'utf8'));src=lock.models[src.slice(5)].url;}
 const r=await read(src,{ctx}),s=r.summary;
 console.log(JSON.stringify({file:path.basename(src),size:r.size,headerBytes:r.header.headerBytes,tensors:r.header.tensors.length,...s},null,1));
})().catch(e=>{console.error(e.message);process.exit(1);});

// PCM helpers for live voice (v2.15). A classic script so the Steam page's MAIN world can use it
// as well as the extension background and the desktop app (both load it with a side-effect
// import from live-core.mjs). Defines globalThis.TylerLivePcm.
//
// Gemini Live takes 16-bit little-endian mono PCM at 16 kHz and sends back the same at 24 kHz.
(() => {
 'use strict';
 if(globalThis.TylerLivePcm)return;
 const IN_RATE=16000,OUT_RATE=24000;

 /**
  * Band-limited resampler (v2.21): a windowed-sinc filter in a polyphase table. It keeps its place
  * between calls, so a stream converted piece by piece comes out exactly as if converted in one go:
  * no click at each join and no samples lost when the rates don't divide evenly. Going down in rate
  * it removes what the new rate can't hold (an "s" at 11 kHz) instead of folding it back as noise.
  * process(Float32Array) → Float32Array; flush() returns the last few samples it was holding back.
  */
 const tables=new Map();
 function table(scale,halfTaps,phases){
  const key=scale+'|'+halfTaps+'|'+phases;if(tables.has(key))return tables.get(key);
  const W=Math.ceil(halfTaps/scale),T=2*W,fc=0.5*scale*0.92,t=new Float32Array((phases+1)*T);
  for(let p=0;p<=phases;p++){let sum=0;const frac=p/phases;
   for(let k=0;k<T;k++){const x=k-(W-1)-frac,s=Math.abs(x)<1e-9?2*fc:Math.sin(2*Math.PI*fc*x)/(Math.PI*x),u=x/W,w=Math.abs(u)>=1?0:0.42+0.5*Math.cos(Math.PI*u)+0.08*Math.cos(2*Math.PI*u);t[p*T+k]=s*w;sum+=s*w;}
   for(let k=0;k<T;k++)t[p*T+k]/=sum||1;}
  const out={W,T,t};tables.set(key,out);return out;
 }
 function createResampler(inRate,outRate,{halfTaps=12,phases=256}={}){
  inRate=Number(inRate)||IN_RATE;outRate=Number(outRate)||IN_RATE;
  const step=inRate/outRate,{W,T,t}=table(Math.min(1,outRate/inRate),halfTaps,phases);
  let hist,pos;
  const reset=()=>{hist=new Float32Array(W-1);pos=W-1;};reset();
  function process(input){
   if(inRate===outRate)return Float32Array.from(input||[]);
   const buf=new Float32Array(hist.length+(input?.length||0));buf.set(hist);if(input?.length)buf.set(input,hist.length);
   const out=new Float32Array(Math.max(0,Math.ceil((buf.length-W-pos)/step)+1));let n=0;
   while(Math.floor(pos)+W<buf.length){const i0=Math.floor(pos),frac=pos-i0,p=Math.round(frac*phases),base=i0-(W-1),row=p*T;let acc=0;for(let k=0;k<T;k++)acc+=buf[base+k]*t[row+k];out[n++]=acc;pos+=step;}
   const keep=Math.max(0,Math.floor(pos)-(W-1));hist=buf.slice(keep);pos-=keep;return out.subarray(0,n);
  }
  return {process,flush:()=>{const tail=process(new Float32Array(W+1));reset();return tail;},reset,rate:outRate};
 }
 const toInt16=f=>{const out=new Int16Array(f.length);for(let i=0;i<f.length;i++){const v=Math.max(-1,Math.min(1,f[i]));out[i]=v<0?v*32768:v*32767;}return out;};
 /** Float samples at `rate` → Int16 at 16 kHz, all at once (a whole clip). */
 function downsample(input,rate){
  if(!input?.length)return new Int16Array(0);
  const r=createResampler(rate,IN_RATE),a=r.process(input),b=r.flush(),length=Math.floor(input.length*IN_RATE/rate),all=new Float32Array(a.length+b.length);all.set(a);all.set(b,a.length);
  return toInt16(all.subarray(0,Math.min(length,all.length)));
 }
 /** The same for a stream in pieces (Gemini Live's microphone frames): keeps its place between frames. */
 function createDownsampler(rate){const r=createResampler(rate,IN_RATE);return Object.assign(input=>toInt16(r.process(input)),{reset:r.reset});}
 /** Int16 PCM at any rate → Int16 at 16 kHz (for the desktop helper's capture). */
 function resampleInt16(input,rate){
  if(rate===IN_RATE)return input;
  const f=new Float32Array(input.length);for(let i=0;i<input.length;i++)f[i]=input[i]/32768;
  return downsample(f,rate);
 }
 function rms(int16){if(!int16.length)return 0;let s=0;for(let i=0;i<int16.length;i++){const v=int16[i]/32768;s+=v*v;}return Math.sqrt(s/int16.length);}
 const bytesOf=int16=>new Uint8Array(int16.buffer,int16.byteOffset,int16.byteLength);
 function toBase64(int16){
  const bytes=bytesOf(int16);
  if(typeof Buffer!=='undefined')return Buffer.from(bytes).toString('base64');
  let s='';for(let i=0;i<bytes.length;i+=8192)s+=String.fromCharCode(...bytes.subarray(i,i+8192));return btoa(s);
 }
 function fromBase64(b64){
  let bytes;
  if(typeof Buffer!=='undefined'){const b=Buffer.from(String(b64||''),'base64');bytes=new Uint8Array(b.buffer,b.byteOffset,b.length);}
  else{const s=atob(String(b64||''));bytes=new Uint8Array(s.length);for(let i=0;i<s.length;i++)bytes[i]=s.charCodeAt(i);}
  const even=bytes.length-(bytes.length%2),copy=new Uint8Array(even);copy.set(bytes.subarray(0,even));
  return new Int16Array(copy.buffer);
 }

 /**
  * Decides which 16 kHz frames go to the provider. Silence isn't streamed (it costs tokens and
  * keeps the provider's turn detection waiting): sending starts when the level rises above the
  * threshold, with a short pre-roll so the first syllable isn't lost, and stops after a
  * hangover of quiet, at which point the caller sends audioStreamEnd (Google calls this hybrid
  * VAD: the server still detects speech, the end signal just saves its silence wait). Time is
  * counted in samples, so it behaves the same in every environment (and in tests).
  */
 class InputGate{
  constructor({threshold=0.01,preRollMs=300,hangoverMs=900}={}){this.threshold=threshold;this.preRoll=preRollMs*IN_RATE/1000;this.hangover=hangoverMs*IN_RATE/1000;this.reset();}
  reset(){this.active=false;this.quiet=0;this.ring=[];this.ringSamples=0;}
  push(frame){
   const loud=rms(frame)>=this.threshold,out={send:[],end:false,started:false,loud};
   if(!this.active){
    if(!loud){this.ring.push(frame);this.ringSamples+=frame.length;while(this.ring.length>1&&this.ringSamples-this.ring[0].length>=this.preRoll){this.ringSamples-=this.ring.shift().length;}return out;}
    this.active=true;this.quiet=0;out.started=true;out.send.push(...this.ring,frame);this.ring=[];this.ringSamples=0;return out;
   }
   out.send.push(frame);
   if(loud)this.quiet=0;else{this.quiet+=frame.length;if(this.quiet>=this.hangover){this.active=false;this.quiet=0;out.end=true;}}
   return out;
  }
 }
 globalThis.TylerLivePcm=Object.freeze({IN_RATE,OUT_RATE,downsample,createDownsampler,createResampler,resampleInt16,rms,toBase64,fromBase64,InputGate});
})();

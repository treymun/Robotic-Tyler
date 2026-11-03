// PCM helpers for live voice (v2.15). A classic script so the Steam page's MAIN world can use it
// as well as the extension background and the desktop app (both load it with a side-effect
// import from live-core.mjs). Defines globalThis.TylerLivePcm.
//
// Gemini Live takes 16-bit little-endian mono PCM at 16 kHz and sends back the same at 24 kHz.
(() => {
 'use strict';
 if(globalThis.TylerLivePcm)return;
 const IN_RATE=16000,OUT_RATE=24000;

 /** Float samples at `rate` → Int16 at 16 kHz (box-filter average, which also low-passes). */
 function downsample(input,rate){
  if(!input?.length)return new Int16Array(0);
  const ratio=rate/IN_RATE,length=Math.floor(input.length/ratio),out=new Int16Array(length);
  for(let i=0;i<length;i++){
   const from=Math.floor(i*ratio),to=Math.min(input.length,Math.max(from+1,Math.floor((i+1)*ratio)));
   let sum=0;for(let j=from;j<to;j++)sum+=input[j];
   const v=Math.max(-1,Math.min(1,sum/(to-from)));out[i]=v<0?v*32768:v*32767;
  }
  return out;
 }
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
 globalThis.TylerLivePcm=Object.freeze({IN_RATE,OUT_RATE,downsample,resampleInt16,rms,toBase64,fromBase64,InputGate});
})();

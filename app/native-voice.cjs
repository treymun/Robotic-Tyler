'use strict';
// Desktop voice (v2.15): Standard voice and Gemini Live through the Windows audio helper
// (windows-audio-bridge/RoboticTylerAudio.exe).
//
// Tyler listens to one output device chosen in Settings → Voice (the one Steam plays your friends
// through, captured as loopback) and talks into another (a virtual cable Steam uses as its
// microphone). He never records a microphone and never switches to another device on his own: if
// a device disappears, voice stops and says why.
//
// Conversations go through the same background engine as the Chrome extension (shared
// personality, memory, rules and providers); this module only moves audio.
const {spawn}=require('node:child_process');
const {EventEmitter}=require('node:events');
const fs=require('node:fs'),fsp=require('node:fs/promises'),path=require('node:path'),crypto=require('node:crypto');

const FRAME=640;           // 40 ms at 16 kHz
const WAV_HEADER=44;

function wav16k(samples){
 const out=Buffer.alloc(WAV_HEADER+samples.length*2);
 out.write('RIFF',0);out.writeUInt32LE(36+samples.length*2,4);out.write('WAVE',8);out.write('fmt ',12);out.writeUInt32LE(16,16);out.writeUInt16LE(1,20);out.writeUInt16LE(1,22);
 out.writeUInt32LE(16000,24);out.writeUInt32LE(32000,28);out.writeUInt16LE(2,32);out.writeUInt16LE(16,34);out.write('data',36);out.writeUInt32LE(samples.length*2,40);
 Buffer.from(samples.buffer,samples.byteOffset,samples.byteLength).copy(out,WAV_HEADER);return out;
}
const rms=f=>{let s=0;for(let i=0;i<f.length;i++){const v=f[i]/32768;s+=v*v;}return f.length?Math.sqrt(s/f.length):0;};

/** Splits continuous 16 kHz audio into utterances for Standard voice (same thresholds as Chrome's noise filter). */
class Segmenter{
 constructor({threshold=.028,minVoiced=550,endSilence=500,maxMs=12000,preRollMs=240}={}){Object.assign(this,{threshold,minVoiced,endSilence,maxMs,preRoll:preRollMs*16});this.reset();}
 reset(){this.active=false;this.frames=[];this.pre=[];this.voicedMs=0;this.quietMs=0;}
 push(frame){
  const ms=frame.length/16,loud=rms(frame)>=this.threshold;
  if(!this.active){if(!loud){this.pre.push(frame);let n=this.pre.reduce((a,f)=>a+f.length,0);while(this.pre.length>1&&n-this.pre[0].length>=this.preRoll)n-=this.pre.shift().length;return null;}
   this.active=true;this.frames=[...this.pre];this.pre=[];this.voicedMs=0;this.quietMs=0;}
  this.frames.push(frame);if(loud){this.voicedMs+=ms;this.quietMs=0;}else this.quietMs+=ms;
  const total=this.frames.reduce((a,f)=>a+f.length,0)/16;
  if(this.quietMs>=this.endSilence||total>=this.maxMs){
   const frames=this.frames,voiced=this.voicedMs;this.reset();
   if(voiced<this.minVoiced)return {short:true};
   const all=new Int16Array(frames.reduce((a,f)=>a+f.length,0));let at=0;for(const f of frames){all.set(f,at);at+=f.length;}
   return {samples:all};
  }
  return null;
 }
}

/** The helper's `capture` command as 40 ms frames. Loopback is silent (no data) when nothing plays, so gaps are filled with silence. */
class Capture extends EventEmitter{
 constructor(exe,device){super();this.carry=Buffer.alloc(0);this.last=Date.now();
  this.child=spawn(exe,['capture',device],{windowsHide:true,stdio:['pipe','pipe','pipe']});this.err='';
  this.child.stdout.on('data',chunk=>{this.last=Date.now();this.carry=Buffer.concat([this.carry,chunk]);while(this.carry.length>=FRAME*2){const f=new Int16Array(FRAME);for(let i=0;i<FRAME;i++)f[i]=this.carry.readInt16LE(i*2);this.carry=this.carry.subarray(FRAME*2);this.emit('frame',f);}});
  this.child.stderr.on('data',d=>{this.err+=d;});
  this.child.on('error',e=>this._end('The Windows audio helper could not start: '+e.message));
  this.child.on('exit',code=>this._end(this.stopping?null:code===3?'The listening device was disconnected: '+this.err.trim():'Listening stopped unexpectedly'+(this.err?': '+this.err.trim():' (code '+code+')')+'.'));
  this.filler=setInterval(()=>{if(Date.now()-this.last>120){this.last=Date.now()-80;this.emit('frame',new Int16Array(FRAME));}},40);
 }
 _end(problem){if(this.done)return;this.done=true;clearInterval(this.filler);this.emit('end',problem);}
 stop(){this.stopping=true;clearInterval(this.filler);try{this.child.stdin.end();}catch{}const c=this.child;setTimeout(()=>{try{c.kill();}catch{}},1500).unref?.();}
}

/** The helper's `stream` command: Tyler's live audio, played as it arrives. */
class Speaker extends EventEmitter{
 constructor(exe,device){super();this.playing=false;this.err='';
  this.child=spawn(exe,['stream',device],{windowsHide:true,stdio:['pipe','pipe','pipe']});
  let line='';this.child.stdout.on('data',d=>{line+=d;let i;while((i=line.indexOf('\n'))>=0){const l=line.slice(0,i).trim();line=line.slice(i+1);if(l==='PLAYING'||l==='IDLE'){this.playing=l==='PLAYING';this.emit('playing',this.playing);}}});
  this.child.stderr.on('data',d=>{this.err+=d;});this.child.stdin.on('error',()=>{});
  this.child.on('error',e=>this._end('The Windows audio helper could not start: '+e.message));
  this.child.on('exit',code=>this._end(this.stopping?null:code===3?'Tyler\'s output device was disconnected: '+this.err.trim():'Playback stopped unexpectedly'+(this.err?': '+this.err.trim():'')+'.'));
 }
 _frame(type,payload=Buffer.alloc(0)){if(this.done)return;const h=Buffer.alloc(5);h[0]=type;h.writeInt32LE(payload.length,1);try{this.child.stdin.write(Buffer.concat([h,payload]));}catch{}}
 audio(b64){this._frame(1,Buffer.from(b64,'base64'));}
 flush(){this._frame(2);}
 _end(problem){if(this.done)return;this.done=true;this.emit('end',problem);}
 stop(){this.stopping=true;this._frame(2);this._frame(3);try{this.child.stdin.end();}catch{}const c=this.child;setTimeout(()=>{try{c.kill();}catch{}},800).unref?.();}
}

class NativeVoice extends EventEmitter{
 /**
  * helper(): path of RoboticTylerAudio.exe (throws if missing)
  * request(message): the shared background engine, as the desktop's own voice sender
  * live: the shared LiveHost (browser-extension/live-host.mjs)
  * settings(): the saved settings (devices, consent, engine, noise filter)
  */
 constructor({helper,request,live,settings,tempDir,log=()=>{}}){super();Object.assign(this,{helper,request,live,settings,tempDir,log});this.mode='off';this.state='Off';this.player=null;this.queue=[];this.turn=0;}
 status(){return {mode:this.mode,state:this.state,playing:!!(this.player||this.speaker?.playing),heard:this.heard||'',said:this.said||'',latencyMs:this.latencyMs??null};}
 _status(state,extra={}){this.state=state;Object.assign(this,extra);this.emit('status',this.status());}
 async run(args,timeout=15000){
  const exe=this.helper();
  return new Promise((resolve,reject)=>{const c=spawn(exe,args,{windowsHide:true});let out='',err='';c.stdout.on('data',d=>out+=d);c.stderr.on('data',d=>err+=d);
   const t=setTimeout(()=>{try{c.kill();}catch{}reject(Error('The audio helper didn\'t answer.'));},timeout);
   c.on('error',e=>{clearTimeout(t);reject(e);});c.on('exit',code=>{clearTimeout(t);code===0?resolve(out.trim()):reject(Error(err.trim()||'Audio helper failed (code '+code+').'));});});
 }
 async devices(){return (await this.run(['devices'])).split(/\r?\n/).filter(l=>l.startsWith('output\t')).map(l=>{const [,id,...name]=l.split('\t');return {id,name:name.join(' ').trim()};});}
 async tone(device,beep){if(!device)throw Error('Choose the device Tyler speaks into first.');await this._playFile(beep,device);return 'Test tone sent. Ask a friend in the Steam voice chat whether they heard it.';}
 async _devices(){
  const s=await this.settings();
  if(!s.voiceOutputDevice)throw Error('Choose the device Tyler speaks into in Settings → Voice.');
  if(!s.voiceListenDevice)throw Error('Choose the device Tyler listens to in Settings → Voice.');
  if(s.voiceOutputDevice===s.voiceListenDevice)throw Error('Tyler would hear himself: pick a different device to listen to than the one he speaks into.');
  if(s.voiceListenConsent!==true)throw Error('Confirm in Settings → Voice that everyone in the voice chat knows Tyler is listening.');
  if(s.v22EmergencyStop===true)throw Error('Emergency stop is on. Unlock it in Settings first.');
  return s;
 }

 // ── Playback of whole clips (Standard voice) ────────────────────────────
 async _temp(b64,ext){await fsp.mkdir(this.tempDir,{recursive:true});const file=path.join(this.tempDir,crypto.randomUUID()+ext);await fsp.writeFile(file,Buffer.from(b64,'base64'),{flag:'wx'});return file;}
 _playFile(file,device){
  return new Promise((resolve,reject)=>{const c=spawn(this.helper(),['play',file,device],{windowsHide:true});let err='';c.stderr.on('data',d=>err+=d);this.player=c;this.emit('status',this.status());
   c.on('error',reject);c.on('exit',code=>{if(this.player===c)this.player=null;this.emit('status',this.status());code===0||c.killed?resolve():reject(Error(code===3?'Tyler\'s output device was disconnected: '+err.trim():err.trim()||'Playback failed.'));});});
 }
 async play(b64,device){
  const ext=Buffer.from(b64.slice(0,8),'base64').toString('latin1').startsWith('RIFF')?'.wav':'.mp3',file=await this._temp(b64,ext);
  try{await this._playFile(file,device);}finally{await fsp.unlink(file).catch(()=>{});}
 }
 /** Queues clips for one reply; a new turn or stop() cancels what's left. */
 enqueue(b64,device,turn){this.queue.push({b64,device,turn});if(!this.draining)void this._drain();}
 async _drain(){this.draining=true;try{while(this.queue.length){const c=this.queue.shift();if(c.turn!==this.turn)continue;try{await this.play(c.b64,c.device);}catch(error){this._status('Playback problem: '+error.message);if(/disconnected/.test(error.message)&&this.mode!=='off')await this.stop(error.message);}}}finally{this.draining=false;this.emit('status',this.status());}}
 cancelPlayback(){this.turn++;this.queue=[];const p=this.player;this.player=null;try{p?.kill();}catch{}}

 // ── Background messages for the desktop voice sender (early first sentence) ─────
 backgroundMessage(m){
  if(m?.source==='tyler-early-audio'&&m.requestId===this.pending?.id&&this.mode!=='off'){this.pending.early=true;this.enqueue(m.audio,this.pending.device,this.turn);}
  if(m?.source==='tyler-early-cancel'&&m.requestId===this.pending?.id){this.cancelPlayback();}
  if(m?.source==='tyler-progress'&&this.mode==='standard')this._status('Standard voice · '+m.stage);
 }

 // ── Standard voice: continuous listening ────────────────────────────────
 async startStandard(){
  await this.stop('Switching to Standard voice');
  const s=await this._devices();if(s.voiceEngine==='live')throw Error('Settings → Voice is set to Gemini Live. Choose Standard there, or start Gemini Live.');
  const cfg=globalThis.TylerNoise?.configure(s)||{threshold:.028,minVoiced:550,endSilence:500};
  const seg=new Segmenter({threshold:cfg.threshold,minVoiced:cfg.minVoiced,endSilence:cfg.endSilence});
  const cap=new Capture(this.helper(),s.voiceListenDevice);this.capture=cap;this.mode='standard';this.busy=false;
  cap.on('frame',f=>{const u=seg.push(f);if(u?.samples)void this._utterance(u.samples,s.voiceOutputDevice);});
  cap.on('end',problem=>{if(problem&&this.capture===cap)void this.stop(problem);});
  this._status('Standard voice · listening. Talk normally, then pause.');
 }
 async _utterance(samples,device){
  const playing=!!(this.player||this.queue.length);
  if(this.busy)return;               // one turn at a time, like the Chrome panel
  if(samples.length<4000)return;
  this.busy=true;const id='n'+Date.now().toString(36);this.pending={id,device,early:false};const turn=playing?this.turn:++this.turn;
  try{
   this._status(playing?'Standard voice · listening for “stop”…':'Standard voice · transcribing…');
   const r=await this.request({type:'voice',audio:wav16k(samples).toString('base64'),format:'wav',automatic:true,requestId:id,controlOnly:playing});
   if(!r?.ok)throw Error(r?.error||'No reply.');
   if(r.heard)this.heard=r.heard;
   if(r.control==='stop'){this.cancelPlayback();this._status('Stopped talking. Listening.');return;}
   if(r.ignored||playing){this._status('Standard voice · listening.');return;}
   this.said=r.text||'';
   if(r.early){if(!this.pending.early&&r.firstAudio)this.enqueue(r.firstAudio,device,turn);if(r.audio)this.enqueue(r.audio,device,turn);}
   else if(r.audio)this.enqueue(r.audio,device,turn);
   this._status(r.warning?'Standard voice · '+r.warning:'Standard voice · listening.');
  }catch(error){this._status('Standard voice · '+error.message);}
  finally{this.busy=false;this.pending=null;}
 }
 /** Manual test: listen for a few seconds, then reply (works with either engine stopped). */
 async listenOnce(seconds=5){
  if(this.mode!=='off')throw Error('Stop voice first, or just talk: Tyler is already listening.');
  const s=await this._devices(),file=path.join(this.tempDir,crypto.randomUUID()+'.wav');await fsp.mkdir(this.tempDir,{recursive:true});
  const secs=Math.max(2,Math.min(8,Number(seconds)||5));
  try{this._status('Listening for '+secs+' seconds…');await this.run(['record',file,String(secs),s.voiceListenDevice],secs*1000+12000);
   const bytes=await fsp.readFile(file),samples=resample(bytes);
   if(!samples)throw Error('That recording couldn\'t be read.');
   this.mode='once';this.busy=false;await this._utterance(samples,s.voiceOutputDevice);
  }finally{this.mode='off';await fsp.unlink(file).catch(()=>{});}
  return this.status();
 }
 /** Typed test: Tyler answers out loud in the running engine (Standard when nothing runs). */
 async say(text){
  const t=String(text||'').trim().slice(0,1000);if(!t)throw Error('Type something for Tyler to answer.');
  if(this.mode==='live'){this.live.text(t);this.heard='(typed) '+t;this._status('Gemini Live · answering your typed message…');return this.status();}
  const s=await this.settings();if(!s.voiceOutputDevice)throw Error('Choose the device Tyler speaks into in Settings → Voice.');
  this._status('Thinking…');const r=await this.request({type:'command',text:'ask '+t,speak:true,modality:'voice'});
  if(!r?.ok)throw Error(r?.error||'No reply.');
  this.heard='(typed) '+t;this.said=r.text||'';
  const turn=++this.turn;if(r.early&&r.firstAudio)this.enqueue(r.firstAudio,s.voiceOutputDevice,turn);if(r.audio)this.enqueue(r.audio,s.voiceOutputDevice,turn);
  this._status(r.warning||'Speaking into Steam.');return this.status();
 }

 // ── Gemini Live ─────────────────────────────────────────────────────────
 async startLive(){
  await this.stop('Switching to Gemini Live');
  const s=await this._devices();
  const speaker=new Speaker(this.helper(),s.voiceOutputDevice);this.speaker=speaker;this.mode='live';this.heard='';this.said='';
  const fail=problem=>{if(this.mode==='live'&&problem)void this.stop(problem);};
  speaker.on('end',fail);speaker.on('playing',()=>this.emit('status',this.status()));
  this._status('Gemini Live · connecting…');
  try{
   const info=await this.live.start({owner:'desktop',historyId:'-1:voice',sink:{
    audio:data=>speaker.audio(data),flush:()=>speaker.flush(),
    state:(state,detail)=>{if(this.mode!=='live')return;if(state==='live')this._status(detail?.resumed?'Gemini Live · reconnected. Waiting for someone to speak.':'Gemini Live · listening.');else if(state==='reconnecting')this._status('Gemini Live · connection dropped, reconnecting…');else if(state==='failed'||state==='stopped')void this.stop(state==='failed'?'Gemini Live stopped: '+(detail?.reason||'Google ended the session')+'. Nothing else was started.':'Gemini Live is off ('+(detail?.reason||'stopped')+').');},
    transcript:(who,text)=>{if(who==='friends')this.heard=((this.heard||'')+text).slice(-400);else this.said=((this.said||'')+text).slice(-400);this.emit('status',this.status());},
    latency:ms=>{this.latencyMs=ms;this.emit('status',this.status());},
    note:text=>this._status('Gemini Live · '+text),restart:()=>this._status('Gemini Live · settings changed. Stop and start again to use them.'),
   }});
   if(this.mode!=='live'||this.speaker!==speaker)return;
   const cap=new Capture(this.helper(),s.voiceListenDevice);this.capture=cap;
   cap.on('frame',f=>this.live.audio(f));cap.on('end',fail);
   this._status('Gemini Live · listening ('+info.model+', voice '+info.voice+').');
  }catch(error){await this.stop('Gemini Live could not start: '+error.message);throw error;}
 }

 /** Ends whatever runs: capture, playback, queued audio, reconnects and the provider connection. */
 async stop(reason='Voice is off.'){
  const was=this.mode;this.mode='off';
  this.capture?.stop();this.capture=null;
  this.speaker?.stop();this.speaker=null;
  this.cancelPlayback();
  if(was==='live')await this.live?.stop(reason,'desktop');
  this._status(reason);
 }
}
// A recorded WAV (any rate, float or 16-bit) → 16 kHz mono Int16.
function resample(bytes){
 try{
  let at=12,fmt=null,data=null;while(at+8<=bytes.length){const id=bytes.toString('latin1',at,at+4),size=bytes.readUInt32LE(at+4);if(id==='fmt ')fmt={tag:bytes.readUInt16LE(at+8),ch:bytes.readUInt16LE(at+10),rate:bytes.readUInt32LE(at+12),bits:bytes.readUInt16LE(at+22)};if(id==='data'){data=bytes.subarray(at+8,Math.min(bytes.length,at+8+size));break;}at+=8+size+(size%2);}
  if(!fmt||!data)return null;const step=fmt.bits/8*fmt.ch,n=Math.floor(data.length/step),mono=new Float32Array(n);
  const float=fmt.tag===3||(fmt.tag===0xFFFE&&fmt.bits===32);
  for(let i=0;i<n;i++){let s=0;for(let c=0;c<fmt.ch;c++){const o=i*step+c*fmt.bits/8;s+=float?data.readFloatLE(o):fmt.bits===16?data.readInt16LE(o)/32768:fmt.bits===32?data.readInt32LE(o)/2147483648:0;}mono[i]=s/fmt.ch;}
  return globalThis.TylerLivePcm.downsample(mono,fmt.rate);
 }catch{return null;}
}
module.exports={NativeVoice,Segmenter,Capture,Speaker,wav16k,resample};

// Gemini Live voice engine (v2.15).
//
// One LiveSession is one conversation with Gemini over a single WebSocket: voice-chat audio goes
// up in small 16 kHz PCM frames while it's spoken, and Tyler's reply comes back as 24 kHz PCM
// chunks that are played as they arrive. There is no transcribe → write → speak chain here.
//
// The same class runs in the Chrome extension's background worker and in the desktop app's main
// process. Each side supplies an adapter: where the audio comes from (always the Steam voice
// chat, never the physical microphone), where Tyler's audio goes, and where transcripts are
// remembered. The API key is passed in by that privileged side and never leaves it.
//
// Protocol: https://ai.google.dev/gemini-api/docs/live-api (checked November 2026).
import './live-pcm.js';
import {VOICE_RULES,VOICE_NOTE,injectionAttempt,cleanHistory,wrapChat} from './guard.mjs';
import {ownerStyle} from './conversation.mjs';

export const Pcm=globalThis.TylerLivePcm;
export const LIVE_ENDPOINT='wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent';

// Native-audio Live models. gemini-3.8-live is Google's current GA Live model. The 2.5 preview is
// kept for keys that don't have 3.8 yet. 3.8 Live Extended Thinking is left out on purpose: it is
// built for slow tool calls and talks in fillers while it thinks, which isn't what a voice-chat
// buddy wants.
export const LIVE_MODELS=Object.freeze([
 Object.freeze({id:'gemini-3.8-live',label:'Gemini 3.8 Live',note:'Recommended. Google\'s current Live model, quickest to answer.',history:true,text:'realtime'}),
 Object.freeze({id:'gemini-2.5-flash-native-audio-preview-12-2025',label:'Gemini 2.5 Flash native audio (preview)',note:'Older preview. Use it only if your key can\'t use 3.8 Live.',history:false,text:'client'}),
]);
export const DEFAULT_LIVE_MODEL=LIVE_MODELS[0].id;

// Google's prebuilt voices. Live models and Gemini text-to-speech use the same set.
export const GEMINI_VOICES=Object.freeze([['Zephyr','Bright'],['Puck','Upbeat'],['Charon','Informative'],['Kore','Firm'],['Fenrir','Excitable'],['Leda','Youthful'],['Orus','Firm'],['Aoede','Breezy'],['Callirrhoe','Easy-going'],['Autonoe','Bright'],['Enceladus','Breathy'],['Iapetus','Clear'],['Umbriel','Easy-going'],['Algieba','Smooth'],['Despina','Smooth'],['Erinome','Clear'],['Algenib','Gravelly'],['Rasalgethi','Informative'],['Laomedeia','Upbeat'],['Achernar','Soft'],['Alnilam','Firm'],['Schedar','Even'],['Gacrux','Mature'],['Pulcherrima','Forward'],['Achird','Friendly'],['Zubenelgenubi','Casual'],['Vindemiatrix','Gentle'],['Sadachbia','Lively'],['Sadaltager','Knowledgeable'],['Sulafat','Warm']].map(([name,tone])=>Object.freeze({name,tone})));
const VOICE_NAMES=new Set(GEMINI_VOICES.map(v=>v.name));
// Before v2.15 the five Grok voice names were mapped onto these Gemini voices, so a user who never
// picked a Gemini voice keeps hearing the same one.
export const GROK_TO_GEMINI=Object.freeze({rex:'Charon',eve:'Kore',ara:'Aoede',sal:'Puck',leo:'Fenrir'});
export function geminiVoiceFor(settings={},key='geminiVoice'){return VOICE_NAMES.has(settings[key])?settings[key]:GROK_TO_GEMINI[settings.speechVoice]||'Charon';}

const clamp=(v,lo,hi,d)=>{const n=Number(v);return Number.isFinite(n)?Math.max(lo,Math.min(hi,n)):d;};
/** The live settings, cleaned. Every field here is part of the session setup, so changing one needs a new session. */
export function liveConfig(s={}){
 const model=LIVE_MODELS.find(m=>m.id===s.liveModel)||LIVE_MODELS[0];
 return {model:model.id,voice:geminiVoiceFor(s,'liveVoice'),interrupt:s.liveInterrupt!==false,
  startSensitivity:s.liveStartSensitivity==='high'?'high':'low',endSensitivity:s.liveEndSensitivity==='low'?'low':'high',
  silenceMs:Math.round(clamp(s.liveSilenceMs,300,2000,700)),prefixMs:300,threshold:clamp(s.liveVoiceThreshold,.001,.06,.01),
  proactive:['quiet','occasional'].includes(s.talkativeness),length:['short','detailed'].includes(s.length)?s.length:'normal'};
}
/** Settings whose change only applies to the next live session. */
export const LIVE_RESTART_KEYS=Object.freeze(['liveModel','liveVoice','liveInterrupt','liveStartSensitivity','liveEndSensitivity','liveSilenceMs','liveVoiceThreshold','talkativeness','length','personality','roastMode','v23Persona']);

const LENGTH={short:'Keep each reply to one short sentence.',normal:'Keep replies short, usually one or two sentences; say a little more only when someone asks a real question.',detailed:'Answer real questions fully but conversationally, in a few sentences at most.'};
/** The system instruction: the voice rules first, then reply length, then the owner's own style. */
export function liveInstructions(settings={},config=liveConfig(settings)){
 return VOICE_RULES+' '+LENGTH[config.length]+' '+(config.proactive?'You don\'t have to answer everything: stay quiet unless someone talks to you or to the whole group.':'Answer what people say to you or to the group.')+' '+ownerStyle(settings);
}
/** Recent conversation (text chat and earlier voice turns) as Live history turns, without anything a takeover may have steered. */
export function historyTurns(history,limit=12,chars=4000){
 const turns=[];let used=0;
 for(const m of cleanHistory(history).slice(-limit).reverse()){
  const text=m.role==='user'?wrapChat(m.content):String(m.content||'');if(!text.trim())continue;
  if(used+text.length>chars)break;used+=text.length;turns.unshift({role:m.role==='user'?'user':'model',parts:[{text}]});
 }
 return turns;
}
/** The first message of every connection. */
export function setupMessage(config,{instructions,handle=null,seed=false}={}){
 const model=LIVE_MODELS.find(m=>m.id===config.model)||LIVE_MODELS[0];
 const setup={model:'models/'+model.id,
  generationConfig:{responseModalities:['AUDIO'],speechConfig:{voiceConfig:{prebuiltVoiceConfig:{voiceName:config.voice}}}},
  systemInstruction:{parts:[{text:instructions}]},
  realtimeInputConfig:{automaticActivityDetection:{disabled:false,startOfSpeechSensitivity:config.startSensitivity==='high'?'START_SENSITIVITY_HIGH':'START_SENSITIVITY_LOW',endOfSpeechSensitivity:config.endSensitivity==='low'?'END_SENSITIVITY_LOW':'END_SENSITIVITY_HIGH',prefixPaddingMs:config.prefixMs,silenceDurationMs:config.silenceMs},
   activityHandling:config.interrupt?'START_OF_ACTIVITY_INTERRUPTS':'NO_INTERRUPTION',turnCoverage:'TURN_INCLUDES_ONLY_ACTIVITY'},
  sessionResumption:handle?{handle}:{},
  contextWindowCompression:{slidingWindow:{}},
  inputAudioTranscription:{},outputAudioTranscription:{}};
 if(config.proactive)setup.proactivity={proactiveAudio:true};
 if(seed&&model.history)setup.historyConfig={initialHistoryInClientContent:true};
 return {setup};
}

// Close codes Google uses for problems a retry can't fix (bad key, model or voice; no access;
// out of quota). Those end the session with the reason; nothing else is started instead.
const FATAL_CODES=new Set([1007,1008]);
const FATAL_TEXT=/api key|permission|quota|exhausted|billing|not found|not supported|unsupported|invalid argument|disabled/i;
const BACKOFF=[500,1000,2000,4000,8000];
const HANDLE_TTL=2*3600*1000;      // Google keeps a resumption handle for 2 hours.
const MAX_AHEAD_MS=20000;          // Tyler's audio may run at most this far ahead of playback.
const MAX_UPLOAD_BYTES=256*1024;   // About 8 s of 16 kHz audio waiting on a slow connection.

/** Seconds in a protobuf Duration ("12s", "0.5s"). */
const seconds=d=>{const m=/^([\d.]+)s$/.exec(String(d||''));return m?Number(m[1]):0;};
const audioMs=b64=>Math.floor(String(b64||'').length*3/4/2)/24;  // 24 kHz, 16-bit

/**
 * Handlers (all optional):
 *  onState(state,detail)   'connecting' | 'live' | 'reconnecting' | 'stopped' | 'failed'
 *  onAudio(base64,gen,ms)  a chunk of Tyler's speech (24 kHz PCM) for response `gen`
 *  onFlush(gen,reason)     stop playing and drop everything queued for responses up to `gen`
 *  onTranscript(who,text)  'friends' or 'tyler', as the words arrive
 *  onTurn({heard,said,interrupted,takeover})  one finished exchange, for memory
 *  onTakeover(kind,text)   someone tried to change Tyler's rules (a note was sent to the model)
 *  onLatency(ms)           end of a friend's speech → first audio of Tyler's reply
 *  onUsage(usageMetadata)
 */
export class LiveSession{
 constructor({key,config,instructions,history=[],getHistory=null,handlers={},WebSocketImpl=globalThis.WebSocket,endpoint=LIVE_ENDPOINT,timers={},now=()=>Date.now(),maxRetries=BACKOFF.length}={}){
  if(!key)throw Error('Save your Google AI key in Settings to use Gemini Live.');
  if(typeof WebSocketImpl!=='function')throw Error('This environment can\'t open a live connection.');
  this.key=key;this.config=config;this.instructions=instructions;this.history=history;this.getHistory=getHistory;
  this.h=handlers;this.WS=WebSocketImpl;this.endpoint=endpoint;this.now=now;this.maxRetries=maxRetries;
  this.setTimer=timers.setTimeout||globalThis.setTimeout.bind(globalThis);this.clearTimer=timers.clearTimeout||globalThis.clearTimeout.bind(globalThis);
  this.model=LIVE_MODELS.find(m=>m.id===config.model)||LIVE_MODELS[0];
  this.gate=new Pcm.InputGate({threshold:config.threshold,preRollMs:config.prefixMs,hangoverMs:config.silenceMs});
  this.state='idle';this.ws=null;this.handle=null;this.handleAt=0;this.attempt=0;this.terminal=false;
  this.gen=1;this.responding=false;this.genStart=0;this.genMs=0;this.awaitingInput=false;this.lastVoiceAt=null;this.latencyArmed=false;
  this.turn={heard:'',said:'',takeover:null};this.timers=new Set();this.goAwayPending=false;this.stats={sentMs:0,receivedMs:0,dropped:0,reconnects:0};
 }
 /** Opens the session. Resolves once Google has accepted the setup; rejects if it never does. */
 start(){
  if(this.state!=='idle')throw Error('This live session was already started.');
  this.started=new Promise((resolve,reject)=>{this.resolveStart=resolve;this.rejectStart=reject;});
  this._connect(false);
  return this.started;
 }
 get live(){return this.state==='live';}

 /** A 16 kHz frame from the voice chat. Silence is held back; speech goes up as it's spoken. */
 pushAudio(frame){
  if(this.state!=='live'){this.gate.reset();return false;}
  const r=this.gate.push(frame);
  if(r.loud)this.lastVoiceAt=this.now();
  if(r.started){this.awaitingInput=false;this.latencyArmed=true;}
  for(const f of r.send)this._sendAudio(f);
  if(r.end)this._send({realtimeInput:{audioStreamEnd:true}});
  return true;
 }
 _sendAudio(frame){
  if(this.ws?.bufferedAmount>MAX_UPLOAD_BYTES){this.stats.dropped++;return;}
  if(this._send({realtimeInput:{audio:{data:Pcm.toBase64(frame),mimeType:'audio/pcm;rate=16000'}}}))this.stats.sentMs+=frame.length/16;
 }
 /** A typed test message: Tyler answers it out loud like speech. */
 sendText(text){
  const t=String(text||'').trim().slice(0,1000);if(!t||this.state!=='live')return false;
  this.awaitingInput=false;this.latencyArmed=true;this.lastVoiceAt=this.now();
  this.turn.heard+=(this.turn.heard?' ':'')+t;
  return this._send(this.model.text==='realtime'?{realtimeInput:{text:t}}:{clientContent:{turns:[{role:'user',parts:[{text:t}]}],turnComplete:true}});
 }
 /** Context for the model that it shouldn't answer (turnComplete stays false). */
 sendNote(text){return this.state==='live'&&this._send({clientContent:{turns:[{role:'user',parts:[{text:String(text)}]}],turnComplete:false}});}

 /** Ends everything: capture input is ignored, playback is flushed, timers and reconnects stop, the socket closes. */
 stop(reason='Stopped'){
  if(this.terminal)return;
  this._finishTurn(true);this._flush(reason);
  this.terminal=true;this._clearTimers();
  const ws=this.ws;this.ws=null;try{ws?.close(1000,'Session ended');}catch{}
  this._state('stopped',{reason});this.rejectStart?.(Object.assign(Error(reason),{stopped:true}));
  this.h={};
 }

 // ---- connection ----
 _connect(resume){
  if(this.terminal)return;
  const handle=resume&&this.handle&&this.now()-this.handleAt<HANDLE_TTL?this.handle:null;
  if(resume&&!handle)this.handle=null;
  this.resuming=!!handle;
  this._state(this.state==='idle'?'connecting':'reconnecting',{attempt:this.attempt});
  let ws;
  try{ws=new this.WS(this.endpoint+'?key='+encodeURIComponent(this.key));}catch(error){return this._closed(null,{code:1006,reason:String(error?.message||error)});}
  this.ws=ws;try{ws.binaryType='arraybuffer';}catch{}
  // A fresh session (not a resumed one) gets the recent conversation as history.
  const history=handle?[]:historyTurns(this.history);
  this.pendingSeed=history;
  ws.onopen=()=>{if(this.ws!==ws)return;this._send(setupMessage(this.config,{instructions:this.instructions,handle,seed:history.length>0}));
   this.setupTimer=this._timer(()=>{if(this.ws===ws)this._drop(ws,1006,'Google didn\'t answer the session setup in time.');},15000);};
  ws.onmessage=event=>{if(this.ws!==ws)return;this._decode(event.data,message=>{if(this.ws===ws)this._message(message);});};
  ws.onerror=()=>{};
  ws.onclose=event=>this._closed(ws,event||{});
 }
 async _refreshHistory(){
  if(typeof this.getHistory!=='function')return;
  try{this.history=await this.getHistory();}catch{}
 }
 _decode(data,done){
  try{
   if(typeof data==='string')return done(JSON.parse(data));
   if(data instanceof ArrayBuffer||ArrayBuffer.isView(data))return done(JSON.parse(new TextDecoder().decode(data)));
   if(typeof data?.text==='function')data.text().then(t=>done(JSON.parse(t)),()=>{});
  }catch{}
 }
 _send(message){const ws=this.ws;if(!ws||ws.readyState!==1)return false;try{ws.send(JSON.stringify(message));return true;}catch{return false;}}
 _drop(ws,code,reason){try{ws.close(4000,'Reconnecting');}catch{}this._closed(ws,{code,reason});}
 _closed(ws,event){
  if(ws&&this.ws!==ws)return;   // an old socket we already replaced
  this.ws=null;this._clearTimer(this.setupTimer);
  if(this.terminal)return;
  const code=Number(event.code)||1006,reason=String(event.reason||'').slice(0,200);
  const wasLive=this.state==='live';
  if(wasLive){this._finishTurn(true);this._flush('Connection lost');if(this.now()-this.liveSince>20000)this.attempt=0;}
  const planned=this.planned;this.planned=false;
  const fatal=FATAL_CODES.has(code)||FATAL_TEXT.test(reason);
  if(fatal){
   // A resumption handle Google no longer accepts: start a fresh session once, with the recent history.
   if(this.resuming&&!this.retriedFresh){this.retriedFresh=true;this.handle=null;return this._reconnect(0);}
   return this._fail(reason||'Google closed the live session (code '+code+').',code);
  }
  if(!planned&&this.attempt>=this.maxRetries)return this._fail('Lost the connection to Google and couldn\'t get it back'+(reason?' ('+reason+')':'')+'.',code);
  this._reconnect(planned?0:BACKOFF[Math.min(this.attempt,BACKOFF.length-1)],planned);
 }
 _reconnect(delay,planned=false){
  if(!planned)this.attempt++;
  this.stats.reconnects++;this.gate.reset();
  this._state('reconnecting',{attempt:this.attempt,delay});
  this.reconnectTimer=this._timer(async()=>{await this._refreshHistory();this._connect(true);},delay);
 }
 _fail(reason,code){
  this.terminal=true;this._clearTimers();this._state('failed',{reason,code});
  this.rejectStart?.(Object.assign(Error(reason),{code}));this.h={};
 }

 // ---- server messages ----
 _message(m){
  if(m.setupComplete){
   this._clearTimer(this.setupTimer);this.liveSince=this.now();this.retriedFresh=this.resuming?this.retriedFresh:false;
   const resumed=this.everLive===true;this.everLive=true;
   if(this.pendingSeed?.length)this._send({clientContent:{turns:this.pendingSeed,turnComplete:this.model.history}});
   this.pendingSeed=null;
   // After a reconnect nothing is spoken until someone talks again, so a reply that was cut off
   // can't come back as a second copy.
   this.awaitingInput=resumed;
   this._state('live',{resumed});
   if(this.resolveStart){const r=this.resolveStart;this.resolveStart=null;this.rejectStart=null;r(this);}
   return;
  }
  if(m.sessionResumptionUpdate){const u=m.sessionResumptionUpdate;if(u.resumable&&u.newHandle){this.handle=u.newHandle;this.handleAt=this.now();}}
  if(m.goAway){
   const left=seconds(m.goAway.timeLeft)*1000;this.goAwayPending=true;
   this._clearTimer(this.goAwayTimer);this.goAwayTimer=this._timer(()=>this._switch(true),Math.max(0,left-1000));
   this._switch(false);
  }
  if(m.usageMetadata)this.h.onUsage?.(m.usageMetadata);
  const c=m.serverContent;if(!c)return;
  if(c.interrupted){this._finishTurn(true);this._flush('Interrupted');}
  if(c.inputTranscription?.text){
   this.turn.heard+=c.inputTranscription.text;this.h.onTranscript?.('friends',c.inputTranscription.text);
   const kind=!this.turn.takeover&&injectionAttempt(this.turn.heard);
   if(kind){this.turn.takeover=kind;this.sendNote(VOICE_NOTE);this.h.onTakeover?.(kind,this.turn.heard);}
  }
  for(const part of c.modelTurn?.parts||[]){
   const data=part.inlineData?.data;if(!data||!/^audio\/pcm/i.test(part.inlineData.mimeType||''))continue;
   if(this.awaitingInput){this.stats.dropped++;continue;}
   if(!this.responding){this.responding=true;this.genStart=this.now();this.genMs=0;
    if(this.latencyArmed&&this.lastVoiceAt!==null){this.latencyArmed=false;this.h.onLatency?.(this.now()-this.lastVoiceAt);}}
   const ms=audioMs(data);
   if(this.genMs-(this.now()-this.genStart)>MAX_AHEAD_MS){this.stats.dropped++;continue;}
   this.genMs+=ms;this.stats.receivedMs+=ms;this.h.onAudio?.(data,this.gen,ms);
  }
  if(c.outputTranscription?.text&&!this.awaitingInput){this.turn.said+=c.outputTranscription.text;this.h.onTranscript?.('tyler',c.outputTranscription.text);}
  if(c.turnComplete){this._finishTurn(false);this.responding=false;this.gen++;if(this.goAwayPending)this._switch(false);}
 }
 /** Move to a new connection with the resumption handle, between turns unless `force`. */
 _switch(force){
  if(!this.goAwayPending||this.terminal||this.state!=='live')return;
  if(!force&&(this.responding||this.gate.active))return;
  this.goAwayPending=false;this._clearTimer(this.goAwayTimer);this.planned=true;const ws=this.ws;
  this._finishTurn(true);this._flush('Reconnecting');
  try{ws?.close(1000,'Moving to a new connection');}catch{}
  this._closed(ws,{code:1000,reason:''});
 }
 _flush(reason){const gen=this.gen;this.gen++;this.responding=false;this.h.onFlush?.(gen,reason);}
 _finishTurn(interrupted){
  const t=this.turn;this.turn={heard:'',said:'',takeover:null};
  const heard=t.heard.trim(),said=t.said.trim();
  if(heard||said)this.h.onTurn?.({heard,said,interrupted,takeover:t.takeover});
 }
 _state(state,detail={}){if(this.state===state&&state!=='reconnecting')return;this.state=state;this.h.onState?.(state,detail);}
 _timer(fn,ms){const id=this.setTimer(()=>{this.timers.delete(id);fn();},ms);this.timers.add(id);return id;}
 _clearTimer(id){if(id===undefined||id===null)return;this.clearTimer(id);this.timers.delete(id);}
 _clearTimers(){for(const id of this.timers)this.clearTimer(id);this.timers.clear();}
}

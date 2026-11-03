// Runs Gemini Live sessions for the privileged side (v2.15): the extension's background worker in
// Chrome, the main process on desktop. It reads the owner's settings and the Google key, keeps one
// session at a time, remembers finished exchanges in the same conversation memory as text and
// Standard voice, and stops the session when the owner switches engine, changes a setting that
// needs a new session, or hits the emergency stop. The key never goes to the sink.
import {LiveSession,liveConfig,liveInstructions,LIVE_RESTART_KEYS} from './live-core.mjs';

const KEYS=['geminiKey','voiceEngine','liveModel','liveVoice','liveInterrupt','liveStartSensitivity','liveEndSensitivity','liveSilenceMs','voiceThreshold','talkativeness','length','personality','roastMode','v23Persona','speechVoice','v22EmergencyStop'];
const cut=(s,n)=>String(s||'').replace(/\s+/g,' ').trim().slice(0,n);

export class LiveHost{
 constructor({storage,memory,WebSocketImpl=globalThis.WebSocket,timers,now}={}){this.storage=storage;this.memory=memory;this.WS=WebSocketImpl;this.timers=timers;this.now=now;this.session=null;this.owner=null;this.writes=Promise.resolve();}
 get active(){return !!this.session;}
 ownedBy(owner){return !!this.session&&this.owner===owner;}
 status(){return {active:this.active,state:this.session?.state||'off',owner:this.owner,model:this.config?.model,voice:this.config?.voice};}

 /** Starts a session for `owner` (one at a time: any running session is stopped first). Resolves once Google accepted it. */
 async start({sink,historyId,owner}){
  await this.stop('Another live session started');
  const s=await this.storage.get(KEYS);
  if(s.v22EmergencyStop===true)throw Error('Emergency stop is on. Unlock it in Settings before starting live voice.');
  if(s.voiceEngine!=='live')throw Error('Choose Gemini Live in Settings → Voice first.');
  if(!s.geminiKey)throw Error('Save a Google AI key in Settings → AI & personality to use Gemini Live.');
  const config=liveConfig(s),memory=this.memory,read=()=>memory?memory.read(historyId).catch(()=>[]):[];
  const history=await read();
  let session;
  const mine=()=>this.session===session;
  session=new LiveSession({key:s.geminiKey,config,instructions:liveInstructions(s,config),history,getHistory:read,WebSocketImpl:this.WS,timers:this.timers,now:this.now,handlers:{
   onState:(state,detail)=>{sink.state?.(state,{reason:detail?.reason,resumed:detail?.resumed,attempt:detail?.attempt});if((state==='stopped'||state==='failed')&&mine())this._ended();},
   onAudio:(data,gen,ms)=>sink.audio?.(data,gen,ms),
   onFlush:(gen,reason)=>sink.flush?.(gen,reason),
   onTranscript:(who,text)=>sink.transcript?.(who,text),
   onLatency:ms=>sink.latency?.(ms),
   onTakeover:()=>sink.note?.('Someone tried to change Tyler\'s rules. Tyler was reminded to ignore it.'),
   onTurn:turn=>this._remember(historyId,turn),
  }});
  this.session=session;this.sink=sink;this.owner=owner;this.config=config;this.startedAt=Date.now();
  try{await session.start();}
  catch(error){if(mine())this._ended();throw error;}
  return {model:config.model,voice:config.voice};
 }
 /** A 16 kHz Int16 frame from the voice chat. */
 audio(frame){return this.session?.pushAudio(frame)??false;}
 text(text){return this.session?.sendText(text)??false;}
 /** Stops the running session (only `owner`'s, when given). */
 async stop(reason='Stopped',owner){
  const session=this.session;if(!session||(owner&&owner!==this.owner))return false;
  session.stop(reason);this._ended();await this.writes;return true;
 }
 /** Call with chrome.storage-style changes. */
 settingsChanged(changes){
  if(!this.session)return;
  if(changes.v22EmergencyStop?.newValue===true){void this.stop('Emergency stop');return;}
  if(changes.voiceEngine&&changes.voiceEngine.newValue!=='live'){void this.stop('Switched to Standard voice');return;}
  if(changes.geminiKey){void this.stop('The Google key changed');return;}
  if(Object.keys(changes).some(k=>LIVE_RESTART_KEYS.includes(k)))this.sink?.restart?.();
 }
 _ended(){
  const session=this.session;if(!session)return;this.session=null;this.owner=null;
  const stats=session.stats,startedAt=this.startedAt;
  this.writes=this.writes.then(async()=>{try{const {usage={}}=await this.storage.get('usage');await this.storage.set({usage:{...usage,liveSessions:(usage.liveSessions||0)+1,liveMinutes:Math.round(((usage.liveMinutes||0)+(Date.now()-startedAt)/60000)*100)/100,liveAudioSentSeconds:Math.round((usage.liveAudioSentSeconds||0)+stats.sentMs/1000),liveAudioReceivedSeconds:Math.round((usage.liveAudioReceivedSeconds||0)+stats.receivedMs/1000)}});}catch{}});
 }
 // Finished exchanges go into the same memory as text chat, so Standard voice and the next live
 // session know what was said. A takeover attempt is never remembered.
 _remember(historyId,{heard,said,takeover}){
  if(!this.memory||takeover)return;
  const add=[...(heard?[{role:'user',content:cut(heard,600)}]:[]),...(said?[{role:'assistant',content:cut(said,600)}]:[])];if(!add.length)return;
  this.writes=this.writes.then(async()=>{try{await this.memory.write(historyId,[...await this.memory.read(historyId),...add]);}catch{}});
 }
}

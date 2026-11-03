// Settings → Voice (v2.15): one page for Standard voice and Gemini Live, in Chrome and on desktop.
// settings.js saves the fields with everything else; this module fills the model and voice
// lists, shows only what the chosen engine, provider and environment support, and runs the
// voice test. Chrome runs the test here (this page is a trusted extension page and may read the
// keys); the desktop app runs it in its main process and returns only the audio.
import {LIVE_MODELS,GEMINI_VOICES,liveConfig,liveInstructions,LiveSession,Pcm,geminiVoiceFor} from './live-core.mjs';
import {GEMINI_TTS_MODELS,geminiSpeak} from './gemini.mjs';
import {Speech} from './speech.mjs';

const $=id=>document.getElementById(id);
const desktop=document.body.dataset.desktop==='true';
const store=desktop?window.tylerSettings?.storage?.local:globalThis.chrome?.storage?.local;
const native=desktop?window.tylerSettings?.voice:null;
const option=(value,label)=>{const o=document.createElement('option');o.value=value;o.textContent=label;return o;};
const SAMPLE='Hey, it\'s ROBOTIC TYLER. Voice check, one two. Sounding good?';

function fill(){
 for(const id of ['geminiVoice','liveVoice'])$(id).replaceChildren(...GEMINI_VOICES.map(v=>option(v.name,v.name+' · '+v.tone)));
 $('liveModel').replaceChildren(...LIVE_MODELS.map(m=>option(m.id,m.label)));
 $('geminiTtsModel').replaceChildren(...GEMINI_TTS_MODELS.map(m=>option(m.id,m.label)));
}
function engine(){return $('voiceEngine').value==='live'?'live':'standard';}
function show(){
 const e=engine(),provider=$('aiProvider').value==='gemini'?'gemini':'openrouter';
 document.body.dataset.voiceEngine=e;document.body.dataset.voiceProvider=provider;
 for(const r of document.querySelectorAll('input[name=voiceEnginePick]'))r.checked=r.value===e;
 $('standardVoiceNote').textContent=provider==='gemini'?'Your text provider is Google Gemini, so speech uses Gemini text-to-speech with one of Google\'s voices.':'Speech uses Grok Voice through OpenRouter, with Voxtral as the fallback if Grok is busy.';
 $('liveModelNote').textContent=LIVE_MODELS.find(m=>m.id===$('liveModel').value)?.note||'';
 $('liveSilenceLabel').textContent=(Number($('liveSilenceMs').value)/1000).toFixed(2)+' s';
 // Desktop: the device list is for the VB-CABLE route only.
 if(desktop&&$('desktopVoice')){const cable=$('desktopVoice').value==='cable';document.body.dataset.voiceRoute=cable?'cable':'window';$('voiceDevices').style.display=cable?'':'none';
  $('desktopVoiceNote').textContent=cable?'Choose the cable and the device Steam plays voice through below, set Steam\'s microphone to CABLE Output, then start voice from the Voice window or the tray icon.':'Start voice from Tyler\'s panel in Steam chat (Connect & start, or Start live voice), then join the voice channel. Tyler\'s own synthetic microphone talks into the call; your physical microphone is never used.';}
}
async function keyState(){
 try{
  const k=await store.get(['openrouterKey','geminiKey']),e=engine(),provider=$('aiProvider').value;
  $('voiceKeyState').textContent=e==='live'
   ?(k.geminiKey?'✓ Google AI key saved. Gemini Live is ready to start.':'Gemini Live needs a Google AI key. Add one under AI & personality → Provider and model.')
   :provider==='gemini'?(k.geminiKey?'✓ Google AI key saved for Gemini speech.':'Add a Google AI key for Gemini speech.')
   :(k.openrouterKey?'✓ OpenRouter key saved for Grok speech.':'Add an OpenRouter key for Grok speech.');
 }catch{$('voiceKeyState').textContent='Key status unavailable.';}
}
async function devices(){
 if(!native)return;
 const state=$('voiceDeviceState');state.textContent='Looking for audio devices…';
 try{
  const list=await native.devices();
  for(const id of ['voiceOutputDevice','voiceListenDevice']){const el=$(id),keep=el.value;el.replaceChildren(option('','Choose a device…'),...list.map(d=>option(d.id,d.name)));if(list.some(d=>d.id===keep))el.value=keep;}
  state.textContent=list.length?list.length+' output device'+(list.length===1?'':'s')+' found. Pick two different ones.':'No output devices found. Install VB-CABLE, then Refresh devices.';
 }catch(error){state.textContent='The Windows audio helper isn\'t available: '+error.message;}
}

// ── Voice test: plays on this computer only ────────────────────────────────
let ctx,testing=null;
async function play(b64){ctx??=new AudioContext();await ctx.resume();const bytes=Uint8Array.from(atob(b64),c=>c.charCodeAt(0));const buffer=await ctx.decodeAudioData(bytes.buffer);const src=ctx.createBufferSource();src.buffer=buffer;src.connect(ctx.destination);src.start();return buffer.duration;}
function form(){
 const v={aiProvider:$('aiProvider').value,personality:$('personality').value,length:$('length').value,talkativeness:$('talkativeness').value,roastMode:$('roastMode').value,speechVoice:$('speechVoice').value,geminiVoice:$('geminiVoice').value,geminiTtsModel:$('geminiTtsModel').value,liveModel:$('liveModel').value,liveVoice:$('liveVoice').value,liveInterrupt:$('liveInterrupt').value!=='false',liveSilenceMs:Number($('liveSilenceMs').value),liveStartSensitivity:$('liveStartSensitivity').value,liveEndSensitivity:$('liveEndSensitivity').value};
 return v;
}
async function liveTest(key,values,status){
 // One short real Gemini Live session: a typed line goes up, Tyler's audio is played chunk by chunk as it arrives.
 const config=liveConfig(values);ctx??=new AudioContext();await ctx.resume();
 let next=0,first=null,sent=0;const sources=[];
 return new Promise((resolve,reject)=>{
  const finish=(error,text)=>{clearTimeout(timer);session.stop('Test finished');error?reject(error):resolve(text);};
  const session=new LiveSession({key,config,instructions:liveInstructions(values,config),handlers:{
   onAudio(b64){if(first===null)first=performance.now()-sent;const pcm=Pcm.fromBase64(b64),buf=ctx.createBuffer(1,pcm.length,24000),data=buf.getChannelData(0);for(let i=0;i<pcm.length;i++)data[i]=pcm[i]/32768;const src=ctx.createBufferSource();src.buffer=buf;src.connect(ctx.destination);next=Math.max(next,ctx.currentTime+.05);src.start(next);next+=buf.duration;sources.push(src);},
   onTurn({said}){setTimeout(()=>finish(null,'Gemini Live answered'+(first!==null?' · first audio after '+Math.round(first)+' ms (measured on this connection)':'')+(said?': “'+said+'”':'.')),Math.max(0,(next-ctx.currentTime)*1000));},
   onState(state,detail){if(state==='failed')finish(Error(detail.reason||'Gemini Live failed.'));},
  }});
  const timer=setTimeout(()=>finish(Error('No reply from Gemini Live within 20 seconds.')),20000);
  status('Connecting to Gemini Live…');
  session.start().then(()=>{status('Connected. Asking for a quick line…');sent=performance.now();session.sendText('Say a quick one-sentence hello to the squad so I can check how you sound.');}).catch(()=>{});
 });
}
async function test(){
 if(testing)return;const status=t=>{$('voiceTestState').textContent=t;};
 const values=form(),e=engine();$('voiceTest').disabled=true;testing=true;
 try{
  if(native){status('Testing…');const r=await native.test({engine:e,values});await play(r.audio);status(r.note||'Playing the test line.');return;}
  const keys=await store.get(['openrouterKey','geminiKey']);
  if(e==='live'){if(!keys.geminiKey)throw Error('Save a Google AI key first.');status(await liveTest(keys.geminiKey,values,status));return;}
  status('Generating speech…');const started=performance.now();
  let spoken;
  if(values.aiProvider==='gemini'){if(!keys.geminiKey)throw Error('Save a Google AI key first.');spoken=await geminiSpeak(keys.geminiKey,SAMPLE,values.geminiVoice,AbortSignal.timeout(30000),values.geminiTtsModel);}
  else{if(!keys.openrouterKey)throw Error('Save an OpenRouter key first.');spoken=await new Speech().generate(SAMPLE,keys.openrouterKey,values.speechVoice,AbortSignal.timeout(30000));}
  const ms=Math.round(performance.now()-started);await play(spoken.audio);status('Playing '+spoken.model+' · ready after '+ms+' ms.');
 }catch(error){status('Voice test failed: '+String(error?.message||error).replace(/sk-or-[\w-]+|AIza[\w-]+/g,'[hidden]'));}
 finally{testing=null;$('voiceTest').disabled=false;}
}

// ── Wiring ─────────────────────────────────────────────────────────────────
fill();
for(const r of document.querySelectorAll('input[name=voiceEnginePick]'))r.addEventListener('change',()=>{if(!r.checked)return;$('voiceEngine').value=r.value;$('voiceEngine').dispatchEvent(new Event('input',{bubbles:true}));show();void keyState();});
for(const id of ['aiProvider','liveModel','liveSilenceMs'])$(id).addEventListener('input',()=>{show();void keyState();});
if(desktop&&$('desktopVoice'))$('desktopVoice').addEventListener('change',show);
$('aiProvider').addEventListener('change',()=>{show();void keyState();});
$('voiceTest').addEventListener('click',()=>void test());
if(native){
 $('voiceDevicesRefresh').addEventListener('click',()=>void devices());
 $('voiceToneTest').addEventListener('click',async()=>{const state=$('voiceDeviceState');try{state.textContent=await native.tone($('voiceOutputDevice').value);}catch(error){state.textContent=error.message;}});
}
// A Gemini voice nobody picked yet is the one Tyler already used (mapped from the Grok voice).
async function defaults(){try{const s=await store.get(['speechVoice','geminiVoice','liveVoice','settingsDraft']),d=s.settingsDraft?.values||{};for(const key of ['geminiVoice','liveVoice'])if(!s[key]&&!d[key])$(key).value=geminiVoiceFor(s,key);}catch{}}
(async()=>{await devices();await window.tylerSettingsReload?.();await defaults();show();await keyState();})();

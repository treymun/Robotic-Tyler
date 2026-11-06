(() => {
 'use strict';let session=0,enabled=false,held=true,controlsOnly=false,waitQuiet=false,context,mix,analyser,highpass,lowpass,timer,recorder,lastCapture=0,lastActivity=0,lastMeter=0,noiseFloor=.001;let filter=TylerNoise.configure();const peers=new Set(),sources=new Map();const gate=new TylerNoise.SpeechGate();let lastTick=0;
 // Gemini Live (v2.15): the same filtered mix of the call's incoming tracks, as 16 kHz frames. Tyler's own
 // voice goes out on the sender track (audio-bridge.js), so it never comes back in here.
 // v2.21: one converter for the whole stream, so the 16 kHz frames join without clicks or lost samples.
 let liveOn=false,tap=null,tapSink=null,liveFrames=0,liveDown=null;
 function liveTap(){if(tap)return;liveDown=TylerLivePcm.createDownsampler(context.sampleRate);tap=context.createScriptProcessor(2048,1,1);tapSink=context.createGain();tapSink.gain.value=0;lowpass.connect(tap);tap.connect(tapSink);tapSink.connect(context.destination);
  tap.onaudioprocess=e=>{if(!liveOn)return;const pcm=liveDown(e.inputBuffer.getChannelData(0));post('live-audio',{pcm:TylerLivePcm.toBase64(pcm)});if(++liveFrames%4===0)post('live-level',{rms:TylerLivePcm.rms(pcm),tracks:sources.size});};}
 function liveUntap(){try{lowpass?.disconnect(tap);tap?.disconnect();tapSink?.disconnect();}catch{}tap=null;tapSink=null;liveDown=null;}
 const post=(type,data={})=>window.postMessage({source:'tyler-listener',type,...data},location.origin);
 // v2.44: who said each utterance (voice-speakers.js), only while "Tell the AI who's speaking in voice" is on
 // (automatic.js sends voiceSpeakers:true). Then each person's track also gets its own level meter, before the
 // mix (the mix and what's recorded don't change), and Steam's talking data is looked at about every 100 ms
 // while recording. Off: no meters, no Steam reads, and an utterance is posted exactly as before. Any problem
 // here only means the utterance goes out unlabelled, with the reason (automatic.js puts it in the Signal trail).
 let speakersOn=false,meterProblem='',steamPause=0,lastWho=null,trackSeq=0;const meters=new Map(),owners=new Map(),trackKeys=new WeakMap();
 const speakerCall=globalThis.TylerVoiceSpeakers?new globalThis.TylerVoiceSpeakers.CallSpeakers():null;
 function keyOf(track){let k=trackKeys.get(track);if(!k){k='t'+(++trackSeq);trackKeys.set(track,k);}return k;}
 function meterFor(track,node){if(meters.has(track))return;try{const analyser=context.createAnalyser();analyser.fftSize=1024;node.connect(analyser);meters.set(track,{analyser,key:keyOf(track),meter:new TylerVoiceSpeakers.TrackMeter(),buf:new Float32Array(analyser.fftSize)});}catch(e){meterProblem=String(e?.message||e).slice(0,100)||'meter failed';}}
 function dropMeters(){for(const [track,m] of meters){try{sources.get(track)?.disconnect(m.analyser);}catch{}}meters.clear();owners.clear();}
 function setSpeakers(on){speakersOn=on===true&&!!speakerCall;if(!speakersOn||!enabled||!context){dropMeters();return;}meterProblem='';
  for(const peer of peers)for(const receiver of peer.getReceivers())if(receiver.track&&sources.has(receiver.track))owners.set(receiver.track,{receiver,peer});
  for(const [track,node] of sources)meterFor(track,node);}
 // The ids the browser and Steam's description give a track: its SSRCs, stream and track ids, cname.
 function trackIds(track){const info={ssrc:[],tokens:[String(track?.id||'')]},o=owners.get(track);
  try{for(const s of o?.receiver?.getSynchronizationSources?.()||[])if(s?.source!=null)info.ssrc.push(String(s.source));}catch{}
  try{const t=o?.peer?.getTransceivers?.().find(x=>x.receiver===o.receiver),mid=t?.mid,sdp=String(o?.peer?.remoteDescription?.sdp||'');
   if(mid!=null&&sdp){const sec=sdp.split(/\r?\n(?=m=)/).find(s=>s.split(/\r?\n/).some(l=>l.trim()==='a=mid:'+mid))||'';
    for(const l of sec.split(/\r?\n/)){let m=/^a=ssrc:(\d+)\s+[\w-]+(?::(.*))?$/.exec(l.trim());if(m){info.ssrc.push(m[1]);if(m[2])info.tokens.push(...m[2].trim().split(/\s+/));continue;}m=/^a=msid:(.*)$/.exec(l.trim());if(m)info.tokens.push(...m[1].trim().split(/\s+/));}}}catch{}
  info.ssrc=[...new Set(info.ssrc)];info.tokens=[...new Set(info.tokens.filter(Boolean))].slice(0,12);return info;}
 function newSpeak(){try{return new TylerVoiceSpeakers.Capture();}catch(e){return {problem:String(e?.message||e)||'error'};}}
 function listenSpeakers(c,now){const s=c.speak;if(s.problem)return;
  try{const levels=[];for(const m of meters.values()){m.analyser.getFloatTimeDomainData(m.buf);let e=0;for(const v of m.buf)e+=v*v;levels.push({key:m.key,...m.meter.level(Math.sqrt(e/m.buf.length))});}
   const voiced=s.tick(levels);
   if(now-s.lastSample>=100&&now>=steamPause){s.lastSample=now;const t0=Date.now(),steam=globalThis.TylerSteamChatAdapter?.voiceTalking?.()??null;if(Date.now()-t0>30)steamPause=now+1000;s.sample(steam,voiced);}
  }catch(e){s.problem=String(e?.message||e).slice(0,100)||'error';}}
 function attributeCapture(c){
  try{if(c.speak.problem)throw Error(c.speak.problem);if(meterProblem)throw Error('per-person audio meter: '+meterProblem);
   if(!c.speak.steam)c.speak.sample(globalThis.TylerSteamChatAdapter?.voiceTalking?.()??null);
   const tracks=new Map();for(const [track,m] of meters)tracks.set(m.key,trackIds(track));
   const r=TylerVoiceSpeakers.attribute({capture:c.speak,call:speakerCall,steam:c.speak.steam,tracks});lastWho={source:r.source,how:r.how};
   return {speaker:r.speaker,source:r.source,overlap:r.overlap,how:r.how,found:String(c.speak.steam?.found||'').slice(0,120)};
  }catch(e){return {error:String(e?.message||e).slice(0,120)||'error'};}}
 function resetCapture(){if(recorder){recorder.discard=true;if(recorder.capture.state==='recording')recorder.capture.stop();}}
 function setup(){if(context)return;context=new AudioContext();mix=context.createMediaStreamDestination();analyser=context.createAnalyser();analyser.fftSize=1024;highpass=context.createBiquadFilter();highpass.type='highpass';lowpass=context.createBiquadFilter();lowpass.type='lowpass';highpass.connect(lowpass);lowpass.connect(mix);lowpass.connect(analyser);configureFilters();}
 function configureFilters(){gate.reset();if(highpass){highpass.frequency.value=filter.keyboardFilter?80:10;lowpass.frequency.value=filter.keyboardFilter?7600:20000;}}
 function scan(){if(!(enabled||liveOn)||!context)return;for(const peer of peers)for(const receiver of peer.getReceivers()){const track=receiver.track;if(track?.kind!=='audio'||track.readyState!=='live'||sources.has(track))continue;try{const node=context.createMediaStreamSource(new MediaStream([track]));node.connect(highpass);sources.set(track,node);if(speakersOn&&enabled){owners.set(track,{receiver,peer});meterFor(track,node);}}catch(e){post('error',{text:e.message});}}for(const peer of peers)if(peer.signalingState==='closed'||peer.connectionState==='closed')peers.delete(peer);for(const [track,node]of sources)if(track.readyState!=='live'){node.disconnect();sources.delete(track);meters.delete(track);owners.delete(track);}if(speakerCall&&!peers.size&&!sources.size)speakerCall.reset();post('state',{tracks:sources.size,enabled,held,player:context.state,controlsOnly,live:liveOn});}
 const Original=window.RTCPeerConnection;if(Original)window.RTCPeerConnection=new Proxy(Original,{construct(Target,args){const peer=Reflect.construct(Target,args);peers.add(peer);peer.addEventListener('track',()=>scan());peer.addEventListener('connectionstatechange',()=>{if(peer.connectionState==='closed')peers.delete(peer);scan();});return peer;}});
 function startCapture(){const captureSession=session;const type=['audio/webm;codecs=opus','audio/webm','audio/ogg;codecs=opus'].find(t=>MediaRecorder.isTypeSupported(t));if(!type)throw Error('This browser cannot record remote speech in a supported format.');const c={capture:new MediaRecorder(mix.stream,{mimeType:type}),chunks:[],started:Date.now(),lastLoud:Date.now(),voiced:50,discard:false,controlsOnly,speak:speakersOn?newSpeak():null};recorder=c;
 c.capture.ondataavailable=e=>{if(e.data.size)c.chunks.push(e.data);};
 c.capture.onstop=async()=>{if(recorder===c)recorder=null;const skip=c.discard||!enabled||held||captureSession!==session||(!filter.keyboardFilter&&c.voiced<filter.minVoiced);const blob=new Blob(c.chunks,{type});if(skip||blob.size<500||blob.size>1500000){if(!c.discard&&enabled)post('detection',{text:(!filter.keyboardFilter&&c.voiced<filter.minVoiced)?'Speech too short — keep talking normally':'No usable speech in this clip'});return;}lastCapture=Date.now();held=true;post('detection',{text:c.controlsOnly?'Checking spoken stop command…':'Speech captured — transcribing…'});const who=c.speak&&!c.controlsOnly?attributeCapture(c):null;try{const encodeStarted=performance.now();const decoded=await context.decodeAudioData(await blob.arrayBuffer());if(!enabled||captureSession!==session)return;const wav=TylerWav.encode(decoded);TylerWav.validate(new Uint8Array(wav));
 if(filter.keyboardFilter){
  post('detection',{text:'Checking speech locally — keyboard noise is not sent for transcription…'});
  const view=new DataView(wav),pcm=new Float32Array((wav.byteLength-44)/2);
  for(let i=0;i<pcm.length;i++)pcm[i]=view.getInt16(44+i*2,true)/32768;
  const detected=await TylerNeural.classify(pcm);
  if(!enabled||captureSession!==session)return;
  if(!detected.speech){held=false;lastCapture=Date.now();post('detection',{text:'Background noise ignored — listening for speech'});return;}
 }
 const reader=new FileReader();reader.onload=()=>{if(enabled&&captureSession===session)post('utterance',{audio:String(reader.result).split(',')[1],format:'wav',seconds:(wav.byteLength-44)/32000,captureEncodeMs:Math.round(performance.now()-encodeStarted),controlOnly:c.controlsOnly,...(who?{speakers:who}:{})});};reader.readAsDataURL(new Blob([wav],{type:'audio/wav'}));}catch(error){held=false;post('error',{text:'Incoming speech conversion failed: '+error.message});}};c.capture.start();post('detection',{text:c.controlsOnly?'Listening for “stop” or “hold on”…':'Hearing speech — waiting for a pause…'});}
 function tick(){if(!enabled||context?.state!=='running'||!sources.size)return;const now=Date.now(),samples=new Float32Array(analyser.fftSize);analyser.getFloatTimeDomainData(samples);let sum=0;for(const v of samples)sum+=v*v;lastTick=now;const rms=Math.sqrt(sum/samples.length);
 // v2.33: with AI speech detection on, a very low level (−50 dBFS) still *starts* a recording (the
 // detector decides whether it's speech), but whether someone is still talking (end of turn, the quiet
 // gap before a reply, barge-in) follows the room: 10 dB over its steady background, at most the
 // Sensitivity threshold. A fan or game sound in someone's mic no longer keeps a turn open for 12 s.
 noiseFloor=rms<noiseFloor?rms:noiseFloor+(rms-noiseFloor)*.002;
 const active=filter.keyboardFilter?Math.min(filter.threshold,Math.max(.003,noiseFloor*3.2)):filter.threshold,loud=rms>active,starts=loud||filter.keyboardFilter&&rms>Math.min(.003,filter.threshold);
 if(loud)lastActivity=now;if(now-lastMeter>=150){lastMeter=now;post('level',{rms,threshold:active,loud,lastActivity,held,controlsOnly});}if(waitQuiet){if(now-lastActivity>filter.endSilence){waitQuiet=false;held=false;lastCapture=now;post('detection',{text:'Listening — long speech finished; ready for a new turn'});}return;}if(held)return;if(!recorder){if(starts&&now-lastCapture>250)startCapture();return;}const c=recorder;if(c.capture.state!=='recording')return;if(c.speak)listenSpeakers(c,now);if(loud){c.lastLoud=now;c.voiced+=50;}if(filter.keyboardFilter&&now-c.started>=12000){c.capture.stop();return;}if(now-c.started>=12000&&now-c.lastLoud<filter.endSilence){c.discard=true;c.capture.stop();lastCapture=now;post('detection',{text:'Long speech — waiting for the next pause'});held=true;waitQuiet=true;return;}if(now-c.lastLoud>filter.endSilence)c.capture.stop();}
 window.addEventListener('message',async e=>{if(e.source!==window||e.origin!==location.origin||e.data?.source!=='tyler-listener-control')return;const m=e.data;try{if(m.type==='configure'){filter=TylerNoise.configure(m);configureFilters();setSpeakers(m.voiceSpeakers);return;}
 if(m.type==='speakers-report'){let report=null;try{report=speakersOn||m.force===true?globalThis.TylerSteamChatAdapter?.voiceTalkingReport?.()??null:null;}catch(e){report={error:String(e?.message||e).slice(0,120)};}
  let text='';try{text=globalThis.TylerVoiceSpeakers?.summary?.(report)||'';}catch{}
  post('speakers-report',{on:speakersOn,report,text,meters:meters.size,tracks:sources.size,labels:speakerCall?.labels.size||0,learned:speakerCall?[...speakerCall.co.keys()].filter(k=>speakerCall.person(k)).length:0,last:lastWho,problem:meterProblem});return;}
 if(m.type==='off'){gate.reset();lastTick=0;session++;enabled=false;held=true;controlsOnly=false;waitQuiet=false;resetCapture();clearInterval(timer);timer=null;dropMeters();if(!liveOn){for(const node of sources.values())node.disconnect();sources.clear();}post('state',{tracks:liveOn?sources.size:0,enabled:false,held:true,live:liveOn});return;}
 if(m.type==='live-on'){session++;enabled=false;held=true;resetCapture();dropMeters();setup();configureFilters();await context.resume();liveOn=true;liveTap();scan();return;}
 if(m.type==='live-off'){liveOn=false;liveUntap();if(!enabled){for(const node of sources.values())node.disconnect();sources.clear();}post('state',{tracks:enabled?sources.size:0,enabled,held,live:false});return;}if(m.type==='hold'){gate.reset();held=!!m.value;controlsOnly=!!m.controlsOnly;if(held)resetCapture();else{lastCapture=Date.now();if(recorder&&!controlsOnly)recorder.controlsOnly=false;}return;}if(m.type==='on'){const starting=++session;filter=TylerNoise.configure(m);if(filter.keyboardFilter){post('detection',{text:'Loading local AI speech detector…'});await TylerNeural.ready();}if(starting!==session)return;setup();configureFilters();lastTick=0;await context.resume();enabled=true;held=false;controlsOnly=false;waitQuiet=false;setSpeakers(m.voiceSpeakers);scan();if(!timer)timer=setInterval(tick,50);return;}if(m.type==='scan')scan();}catch(error){post('error',{text:error.message});}});
 setInterval(()=>{if(enabled||liveOn)scan();},2000);
})();

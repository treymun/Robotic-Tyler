(() => {
 'use strict';
 if(window.__roboticTylerAudioInstalled)return;window.__roboticTylerAudioInstalled=true;
 let musicStream,musicSource,musicGain,musicLimiter;
 // Music quality (v2.20.2). Chrome treats shared tab sound like a microphone unless told otherwise:
 // echo cancellation, noise suppression and automatic gain, in mono. On music that makes it warble
 // and pump, so the share asks for the YouTube sound untouched, in stereo. And while music is
 // shared, the call's Opus encoder gets more bits on Tyler's own senders (128 kbps by default,
 // Chrome's default is about 32); the earlier setting comes back when the music stops.
 const MUSIC_AUDIO=Object.freeze({echoCancellation:false,noiseSuppression:false,autoGainControl:false,channelCount:{ideal:2},sampleRate:{ideal:48000}});
 // Quality levels (v2.20.3): High 128 kbps, Medium 64 kbps, Low = Steam's default (about 32 kbps), and
 // Auto, which starts at Medium and steps down (64 → 48 → 32 kbps) when Steam reports the call is
 // losing Tyler's audio, then back up once it has been clean for a while. Auto never goes above Medium.
 const LEVELS={high:128000,medium:64000,low:0},AUTO=[32000,48000,64000];
 let musicLevel='auto',autoRate=64000,autoClean=0,autoLast=null,autoTimer=0,musicQuality=null,tuning=Promise.resolve();
 const bitrateBefore=new WeakMap();
 const levelOf=v=>{const k=String(v??'').toLowerCase();if(k in LEVELS||k==='auto')return k;const n=Number(v);return v==null||v===''||!Number.isFinite(n)?'auto':n===0?'low':n>=100000?'high':'medium';};
 const musicRate=()=>musicLevel==='auto'?autoRate:LEVELS[musicLevel];
 function qualityName(){const kbps=Math.round(musicRate()/1000);return musicLevel==='auto'?'Auto (now '+kbps+' kbps)':musicLevel==='low'?'Low (Steam\'s default, about 32 kbps)':(musicLevel==='high'?'High':'Medium')+' ('+kbps+' kbps)';}
 function musicStatus(text,shared=!!musicStream){window.postMessage({source:'tyler-music-status',text,shared,quality:shared&&musicQuality?{...musicQuality,level:musicLevel,bitrate:musicRate()}:null},location.origin);}
 // Auto: every 4 s, the share of Tyler's packets Steam's server reports lost (RTCP receiver reports).
 async function autoStep(){
  if(!musicStream||musicLevel!=='auto')return;let sent=0,lost=0,reported=false;
  for(const peer of peers){if(closed(peer)||peer.connectionState!=='connected')continue;try{const st=await peer.getStats();st.forEach(x=>{if(x.kind!=='audio')return;if(x.type==='outbound-rtp')sent+=Number(x.packetsSent)||0;if(x.type==='remote-inbound-rtp'){reported=true;lost+=Math.max(0,Number(x.packetsLost)||0);}});}catch{}}
  const prev=autoLast;autoLast={sent,lost};if(!prev||!reported||sent<=prev.sent)return;
  const loss=Math.max(0,lost-prev.lost)/(sent-prev.sent),i=AUTO.indexOf(autoRate);
  if(loss>=0.03&&i>0){autoRate=AUTO[i-1];autoClean=0;await retune();musicStatus('The call was dropping music, so quality went down to '+Math.round(autoRate/1000)+' kbps (Auto).');}
  else if(loss<0.005){autoClean+=4;if(autoClean>=60&&i<AUTO.length-1){autoRate=AUTO[i+1];autoClean=0;await retune();musicStatus('The call is steady again: music quality back up to '+Math.round(autoRate/1000)+' kbps (Auto).');}}
  else autoClean=0;
 }
 function autoWatch(){clearInterval(autoTimer);autoTimer=0;autoLast=null;autoClean=0;if(musicStream&&musicLevel==='auto')autoTimer=setInterval(()=>{void autoStep();},4000);}
 function disconnectMusic(){const stream=musicStream;musicStream=null;musicQuality=null;clearInterval(autoTimer);autoTimer=0;autoRate=AUTO.at(-1);try{musicSource?.disconnect();musicGain?.disconnect();musicLimiter?.disconnect();musicDuck?.disconnect();}catch{}musicDuck=null;musicSource=null;for(const track of stream?.getTracks()||[])track.stop();void retune();musicStatus('Music sharing stopped.',false);}
 async function tuneSender(sender){
  const want=musicStream?musicRate():0;
  try{const p=sender.getParameters(),e=p.encodings?.[0];if(!e)return;
   if(want){if(!bitrateBefore.has(sender))bitrateBefore.set(sender,e.maxBitrate??null);if(e.maxBitrate===want)return;e.maxBitrate=want;}
   else{if(!bitrateBefore.has(sender))return;const before=bitrateBefore.get(sender);bitrateBefore.delete(sender);if(before==null)delete e.maxBitrate;else e.maxBitrate=before;}
   await sender.setParameters(p);}catch{}
 }
 // Only Tyler's own outgoing audio senders, one change at a time.
 function retune(){tuning=tuning.then(async()=>{for(const peer of peers){if(closed(peer))continue;for(const sender of peer.getSenders())if(replaced.has(sender))await tuneSender(sender);}}).catch(()=>{});return tuning;}
 // What Steam's call actually uses (for the full check): codec, its settings, Tyler's send rate.
 let lastCodec=null;
 async function codecReport(){for(const peer of peers){if(closed(peer)||peer.connectionState!=='connected')continue;try{const st=await peer.getStats();let out=null;st.forEach(x=>{if(x.type==='outbound-rtp'&&x.kind==='audio'&&(!out||x.bytesSent>out.bytesSent))out=x;});if(!out)continue;const c=out.codecId?st.get(out.codecId):null;return {codec:String(c?.mimeType||'').split('/')[1]||'',fmtp:String(c?.sdpFmtpLine||'').slice(0,200),kbps:Math.round((Number(out.targetBitrate)||0)/1000)};}catch{}}return null;}
 let board;let previewNode;let enabled=false,ctx,destination,gain,monitor,meter=null,active=[],queued=[],audioJobs=Promise.resolve(),requests=0,attached=0;const peers=new Set(),replaced=new WeakSet();
 const announce=(text,ok=true)=>window.postMessage({source:'tyler-audio-status',text,ok,voice:{enabled,requests,attached,player:ctx?.state||'not started',peers:peers.size,observing:!!OriginalPeer,connectedPeers:[...peers].filter(p=>p.connectionState==='connected').length,peerStates:[...peers].filter(p=>p.signalingState!=='closed'&&p.connectionState!=='closed').slice(-3).map(p=>p.connectionState+'/'+p.iceConnectionState+'/'+p.signalingState),codec:lastCodec}},location.origin);
 function setup(){if(ctx)return;ctx=new AudioContext();destination=ctx.createMediaStreamDestination();gain=ctx.createGain();gain.gain.value=.35;gain.connect(destination);monitor=ctx.createGain();monitor.gain.value=0;gain.connect(monitor);monitor.connect(ctx.destination);meter=ctx.createAnalyser?.()||null;if(meter){meter.fftSize=2048;gain.connect(meter);}}
 function boardPlayer(){if(!board)board=new TylerBoardAudio(ctx,gain,text=>window.postMessage({source:'tyler-soundboard-status',text},location.origin));return board;}
 async function resumePlayer(){let timer;try{await Promise.race([ctx.resume(),new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('Audio player is suspended. Click Enable again or check this tab is allowed to play sound.')),2500);})]);}finally{clearTimeout(timer);}}
 // v2.21: while Tyler talks, the Music DJ dips about 10 dB and comes back half a second after he stops.
 let musicDuck=null,duckOn=true;
 function duck(talking){if(!musicDuck||!ctx)return;const t=ctx.currentTime;musicDuck.gain.cancelScheduledValues(t);musicDuck.gain.setValueAtTime(musicDuck.gain.value,t);if(talking&&duckOn)musicDuck.gain.setTargetAtTime(.32,t,.04);else musicDuck.gain.setTargetAtTime(1,t+(talking?0:.45),.18);}
 function playing(value){lastOut=Date.now();duck(value);window.postMessage({source:'tyler-playback',playing:value},location.origin);}
 // Gemini Live chunks (v2.15): 24 kHz PCM scheduled back to back as they arrive, at most 20 s ahead.
 // A flush stops the response that was interrupted and drops its queued chunks at once.
 // v2.21: the 24 kHz chunks go through one band-limited converter per run (live-pcm.js) and are
 // scheduled frame by frame at the page's own rate. Converting each chunk on its own, as before, left
 // a small click at every join. A slow level match keeps Live's voice as loud as Tyler's other voice.
 let liveNodes=[],liveFrame=0,liveFlushed=0,liveUp=null,liveLevel=0,liveGain=null;
 function livePlay(b64,gen){if(gen<=liveFlushed)return;const pcm=TylerLivePcm.fromBase64(b64);if(!pcm.length)return;
  const sr=ctx.sampleRate,now=ctx.currentTime;
  if(!liveUp||liveFrame/sr<now+.03){liveUp=TylerLivePcm.createResampler(TylerLivePcm.OUT_RATE,sr);liveFrame=Math.ceil((now+.06)*sr);}
  if(liveFrame/sr-now>20)return;
  const f=new Float32Array(pcm.length);for(let i=0;i<pcm.length;i++)f[i]=pcm[i]/32768;
  if(!liveGain){liveGain=ctx.createGain();liveGain.connect(gain);}
  const level=speechLevel(f);if(level){liveLevel=liveLevel?liveLevel*.85+level*.15:level;liveGain.gain.setTargetAtTime(levelGain(liveLevel),now,.8);}
  const out=liveUp.process(f);if(!out.length)return;const buf=ctx.createBuffer(1,out.length,sr);buf.copyToChannel(out,0);
  const src=ctx.createBufferSource();src.buffer=buf;src.connect(liveGain);src.start(liveFrame/sr);liveFrame+=out.length;const node={src,gen};liveNodes.push(node);playing(true);
  src.onended=()=>{src.disconnect();liveNodes=liveNodes.filter(n=>n!==node);if(!liveNodes.length&&!active.length)playing(false);};}
 function liveFlush(gen){liveFlushed=Math.max(liveFlushed,gen);const had=liveNodes.length;for(const n of liveNodes)if(n.gen<=gen){try{n.src.onended=null;n.src.stop();n.src.disconnect();}catch{}}liveNodes=liveNodes.filter(n=>n.gen>gen);liveFrame=0;liveUp=null;if(had&&!liveNodes.length&&!active.length)playing(false);}
 function stop(all=true){if(all)board?.stop();liveFlush(Number.MAX_SAFE_INTEGER-1);liveFlushed=0;try{previewNode?.stop();previewNode?.disconnect();}catch{}previewNode=null;for(const node of active){try{node.stop();node.disconnect();}catch{}}active=[];queued=[];clipEnd=0;playing(false);}
 // Plays one decoded clip; a clip queued with {queue:true} starts the moment this one ends, with no
 // playing(false) gap in between, so the panel keeps treating the reply as one continuous turn.
 // v2.21: a queued clip (the rest of a reply after its first sentence) is scheduled to start on the
 // exact sample the current one ends, not when the page hears that it ended (a gap of ~10 ms and a
 // click). Each reply is brought to the same loudness; its parts share one level so they match.
 let clipEnd=0,replyGain=1;
 function playBuffer(buffer,{queue=false,level}={}){
  const source=ctx.createBufferSource(),g=ctx.createGain();source.buffer=buffer;g.gain.value=level??1;source.connect(g);g.connect(gain);
  const now=ctx.currentTime,at=queue&&active.length&&clipEnd>now?clipEnd:now;clipEnd=at+buffer.duration;
  const was=active.length;active.push(source);if(!was)playing(true);
  source.onended=()=>{source.disconnect();g.disconnect();if(!active.includes(source))return;active=active.filter(n=>n!==source);if(!active.length)playing(false);};
  source.start(at);
 }
 // Loudness of speech in a clip: RMS over 20 ms blocks louder than -50 dBFS (so pauses don't count).
 function speechLevel(data){let sum=0,n=0;const block=480;for(let s=0;s+block<=data.length;s+=block){let e=0;for(let i=s;i<s+block;i++)e+=data[i]*data[i];e/=block;if(e>1e-5){sum+=e;n++;}}return n?Math.sqrt(sum/n):0;}
 const LEVEL_TARGET=.12;const levelGain=level=>level?Math.max(.3,Math.min(4,LEVEL_TARGET/level)):1;
 function clipLevel(buffer){const d=buffer.getChannelData(0);let peak=0;for(let i=0;i<d.length;i++)peak=Math.max(peak,Math.abs(d[i]));const g=levelGain(speechLevel(d));return peak?Math.min(g,.98/peak):g;}
 const original=navigator.mediaDevices?.getUserMedia.bind(navigator.mediaDevices);
 if(original)navigator.mediaDevices.getUserMedia=async constraints=>{
  if(!constraints?.audio)return original(constraints);
  if(!enabled)throw new DOMException('Enable ROBOTIC TYLER synthetic voice before joining Steam voice.','NotAllowedError');
  setup();await ctx.resume();requests++;const stream=destination.stream.clone();
  if(constraints.video){const video=await original({video:constraints.video,audio:false});for(const track of video.getVideoTracks())stream.addTrack(track);}
  announce('Steam requested the synthetic microphone. Test beep with a friend.');return stream;
 };
 // Steam's voice code asks through the old callback form (navigator.getUserMedia, or its webkit
 // name), which doesn't go through mediaDevices.getUserMedia and opened the physical microphone.
 // With synthetic voice enabled, answer it with the synthetic microphone too; otherwise unchanged.
 for(const name of ['getUserMedia','webkitGetUserMedia']){
  const legacy=navigator[name];if(typeof legacy!=='function')continue;
  navigator[name]=function(constraints,ok,fail){
   if(!enabled||!constraints?.audio||!original)return legacy.call(navigator,constraints,ok,fail);
   navigator.mediaDevices.getUserMedia(constraints).then(stream=>{if(typeof ok==='function')ok(stream);},err=>{if(typeof fail==='function')fail(err);});
  };
 }
 // Steam may hold a previously captured/cached microphone. Also attach at the outgoing WebRTC sender.
 function synthetic(){setup();return destination.stream.getAudioTracks()[0].clone();}
 // A connection Steam already closed (after a leave or a rejoin) is skipped and forgotten: only live
 // calls get the synthetic microphone, and the old one can't raise a false "attachment failed".
 const closed=peer=>peer.signalingState==='closed'||peer.connectionState==='closed';
 async function attach(peer){if(!enabled)return;if(closed(peer)){peers.delete(peer);return;}for(const sender of peer.getSenders()){if(sender.track?.kind!=='audio'||replaced.has(sender))continue;const track=synthetic();try{await sender.replaceTrack(track);replaced.add(sender);attached++;void retune();announce('Synthetic audio attached to an outgoing Steam audio sender. Confirm with Test beep and Steam meter.');}catch(e){track.stop();if(closed(peer)){peers.delete(peer);continue;}announce('Steam audio attachment failed: '+e.message,false);}}}
 const OriginalPeer=window.RTCPeerConnection;
 if(OriginalPeer){
  const proto=OriginalPeer.prototype,addTrack=proto.addTrack,addTransceiver=proto.addTransceiver,setLocal=proto.setLocalDescription;
  if(addTrack)proto.addTrack=function(track,...streams){if(enabled&&track?.kind==='audio'){track=synthetic();const sender=addTrack.call(this,track,...streams);replaced.add(sender);attached++;void retune();announce('Synthetic audio added to an outgoing Steam connection. Confirm with Test beep.');return sender;}return addTrack.call(this,track,...streams);};
  if(addTransceiver)proto.addTransceiver=function(...args){const result=addTransceiver.apply(this,args);void attach(this);return result;};
  if(setLocal)proto.setLocalDescription=async function(...args){await attach(this);return setLocal.apply(this,args);};
  window.RTCPeerConnection=new Proxy(OriginalPeer,{construct(Target,args){const peer=Reflect.construct(Target,args);peers.add(peer);peer.addEventListener('connectionstatechange',()=>{if(peer.connectionState==='closed')peers.delete(peer);announce('Steam connection state: '+peer.connectionState);});return peer;}});
 }
 function tone(frequency,start,duration,type='sine'){const osc=ctx.createOscillator(),envelope=ctx.createGain();osc.frequency.value=frequency;osc.type=type;envelope.gain.setValueAtTime(0,start);envelope.gain.linearRampToValueAtTime(.20,start+.015);envelope.gain.linearRampToValueAtTime(0,start+duration);osc.connect(envelope);envelope.connect(gain);osc.start(start);osc.stop(start+duration+.01);active.push(osc);playing(true);osc.onended=()=>{osc.disconnect();envelope.disconnect();active=active.filter(n=>n!==osc);if(!active.length)playing(false);};}
 // v2.24: keep Tyler in quiet calls. Steam removes a call member who has sent no sound for about an
 // hour (seen by users; Steam doesn't document it). While Tyler is in a call, any sound he sends
 // (speech, clips, music, beeps) resets the clock, checked on the outgoing signal itself. After
 // `keepMinutes` of silence, a short soft hum goes out, about 6 dB under his speech at the same
 // volume setting, so Steam sees activity. The clock starts when he joins a call.
 let keepOn=true,keepMinutes=45,keepTimer=0,lastOut=Date.now(),keepCount=0,lastKeep=0;
 const inCall=()=>[...peers].some(p=>!closed(p)&&p.connectionState==='connected');
 const levelNow=()=>{if(!meter)return 0;const d=new Float32Array(meter.fftSize);meter.getFloatTimeDomainData(d);let e=0;for(const x of d)e+=x*x;return Math.sqrt(e/d.length);};
 function humBuffer(){
  const sr=ctx.sampleRate,len=.9,n=Math.round(sr*len),b=ctx.createBuffer(1,n,sr),d=b.getChannelData(0);let ph=0,peak=0;
  // A voiced "mm": a gliding 132 → 118 Hz fundamental with harmonics shaped by two soft formants,
  // a gentle syllable-like wobble, faded in and out.
  for(let i=0;i<n;i++){const t=i/sr,f0=132-14*t/len;ph+=2*Math.PI*f0/sr;let x=0;
   for(let k=1;k<=16;k++){const f=k*f0;if(f>4000)break;x+=Math.sin(k*ph)*(Math.exp(-(((f-480)/240)**2))+.5*Math.exp(-(((f-1350)/380)**2))+.12)/k;}
   d[i]=x*Math.min(1,t/.08)*Math.min(1,(len-t)/.28)*(.85+.15*Math.sin(2*Math.PI*4.5*t));peak=Math.max(peak,Math.abs(d[i]));}
  const g=peak?.18/peak:0;for(let i=0;i<n;i++)d[i]*=g;return b;
 }
 function keepAlive(reason){
  if(!ctx||!gain)return false;lastOut=Date.now();lastKeep=lastOut;keepCount++;
  const src=ctx.createBufferSource();src.buffer=humBuffer();src.connect(gain);src.onended=()=>src.disconnect();src.start();
  window.postMessage({source:'tyler-keepalive',reason,at:lastKeep,count:keepCount,minutes:keepMinutes},location.origin);return true;
 }
 function keepTick(){
  if(!ctx||!enabled)return;const now=Date.now();
  if(!inCall()){lastOut=now;return;}
  if(active.length||liveNodes.length||levelNow()>.003){lastOut=now;return;}
  if(keepOn&&now-lastOut>=keepMinutes*60000)keepAlive('quiet');
 }
 function keepSchedule(){clearInterval(keepTimer);keepTimer=setInterval(keepTick,Math.max(1000,Math.min(30000,keepMinutes*60000/6)));}
 keepSchedule();
 // v2.24 (Chrome): while Tyler runs here, a data channel between two connections inside this page
 // tells Chrome that WebRTC is in use, so it doesn't freeze the background tab (Energy Saver) or
 // slow its timers to once a minute. Nothing leaves this computer: no servers, local candidates only.
 // Built on the unwrapped RTCPeerConnection, so it never counts as a Steam call.
 let awake=null;
 async function tabAwake(on){
  if(!on||!OriginalPeer){if(awake){for(const p of awake.peers)try{p.close();}catch{}awake=null;}return;}
  if(awake&&awake.peers.every(p=>!closed(p)))return;
  if(awake)for(const p of awake.peers)try{p.close();}catch{}
  const a=new OriginalPeer({iceServers:[]}),b=new OriginalPeer({iceServers:[]});awake={peers:[a,b],channel:null};
  a.onicecandidate=e=>{if(e.candidate)b.addIceCandidate(e.candidate).catch(()=>{});};b.onicecandidate=e=>{if(e.candidate)a.addIceCandidate(e.candidate).catch(()=>{});};
  awake.channel=a.createDataChannel('tyler-awake');b.ondatachannel=e=>{e.channel.onmessage=()=>{};};
  try{await a.setLocalDescription(await a.createOffer());await b.setRemoteDescription(a.localDescription);await b.setLocalDescription(await b.createAnswer());await a.setRemoteDescription(b.localDescription);}
  catch{for(const p of [a,b])try{p.close();}catch{}awake=null;}
 }
 window.addEventListener('message',async event=>{
  if(event.source!==window||event.origin!==location.origin||event.data?.source!=='tyler-audio-command')return;
  try{const m=event.data;
   if(['board-play','sound','audio','preview','pcm'].includes(m.type))lastOut=Date.now();
   if(m.type==='keepalive'){keepOn=m.on!==false;const mins=Number(m.minutes);if(Number.isFinite(mins))keepMinutes=Math.max(.02,Math.min(59,mins));keepSchedule();window.postMessage({source:'tyler-keepalive',reason:'status',on:keepOn,minutes:keepMinutes,inCall:inCall(),idleMs:inCall()?Date.now()-lastOut:0,at:lastKeep,count:keepCount},location.origin);return;}
   if(m.type==='tab-awake'){await tabAwake(m.on===true);window.postMessage({source:'tyler-keepalive',reason:'tab',awake:awake?.channel?.readyState||'off'},location.origin);return;}
   if(m.type==='keepalive-test'){setup();await resumePlayer();if(!keepAlive('test'))throw Error('The voice bridge is not ready yet.');return;}
   if(m.type==='music-disconnect'){disconnectMusic();return;}
   if(m.type==='music-quality'){const before=musicLevel;musicLevel=levelOf(m.level??m.bitrate);if(musicLevel==='auto'&&before!=='auto')autoRate=AUTO.at(-1);await retune();autoWatch();if(musicStream)musicStatus('Music quality: '+qualityName()+'.');return;}
   if(m.type==='music-duck'){duckOn=m.on!==false;duck(!!(active.length||liveNodes.length));return;}
   if(m.type==='music-volume'){if(musicGain){const level=Math.max(0,Math.min(2,Number(m.volume)||0));musicGain.gain.setTargetAtTime(level,ctx.currentTime,.08);}return;}
   if(m.type==='music-capture'){
    disconnectMusic();setup();
    if(m.level!==undefined||m.bitrate!==undefined)musicLevel=levelOf(m.level??m.bitrate);autoRate=AUTO.at(-1);
    const stream=await navigator.mediaDevices.getDisplayMedia({video:{displaySurface:'browser'},audio:MUSIC_AUDIO,preferCurrentTab:false,selfBrowserSurface:'exclude',systemAudio:'exclude',monitorTypeSurfaces:'exclude',surfaceSwitching:'include'});
    const video=stream.getVideoTracks()[0],audio=stream.getAudioTracks();
    if(!audio.length||video?.getSettings?.().displaySurface!=='browser'||/steam/i.test(video?.label||'')){for(const t of stream.getTracks())t.stop();throw Error('Select the YouTube browser tab and enable Share tab audio. Do not select Steam, a window or your screen.');}
    // Older Chrome may ignore the request in getDisplayMedia; ask the track itself once more.
    const processed=()=>{const x=audio[0].getSettings?.()||{};return !!(x.echoCancellation||x.noiseSuppression||x.autoGainControl);};
    if(processed())await audio[0].applyConstraints?.(MUSIC_AUDIO).catch(()=>{});
    musicQuality={processed:processed(),channels:Number(audio[0].getSettings?.().channelCount)||1};
    musicStream=stream;musicSource=ctx.createMediaStreamSource(new MediaStream(audio));musicGain=ctx.createGain();musicGain.gain.value=Math.max(0,Math.min(2,(Number.isFinite(Number(m.volume))?Number(m.volume):.35)));musicSource.connect(musicGain);musicLimiter=ctx.createDynamicsCompressor();musicLimiter.threshold.value=-3;musicLimiter.knee.value=6;musicLimiter.ratio.value=20;musicLimiter.attack.value=.003;musicLimiter.release.value=.15;musicGain.connect(musicLimiter);musicDuck=ctx.createGain();musicDuck.gain.value=active.length||liveNodes.length?.32:1;musicLimiter.connect(musicDuck);musicDuck.connect(destination);
    try{if(meter)musicDuck?.connect(meter);}catch{}
    for(const track of stream.getTracks())track.addEventListener('ended',()=>{if(musicStream===stream)disconnectMusic();});
    enabled=true;await resumePlayer();for(const peer of peers)await attach(peer);await retune();autoWatch();
    musicStatus('YouTube audio is shared. Join Steam voice with the bot, keep AI in Text mode, then request !play artist song.');return;
   }
   if(m.type==='preview'){if(typeof m.audio!=='string'||m.audio.length>6000000)throw Error('Preview too large');setup();await resumePlayer();const bytes=Uint8Array.from(atob(m.audio),c=>c.charCodeAt(0));const buffer=await ctx.decodeAudioData(bytes.buffer);if(buffer.duration>30)throw Error('Preview exceeds 30 seconds');try{previewNode?.stop();}catch{}const preview=ctx.createBufferSource(),pg=ctx.createGain();pg.gain.value=clipLevel(buffer);previewNode=preview;preview.buffer=buffer;preview.connect(pg);pg.connect(ctx.destination);preview.onended=()=>{preview.disconnect();pg.disconnect();};preview.start();announce('Voice preview playing locally only.');return;}
   if(m.type==='enable'){setup();enabled=true;await resumePlayer();for(const peer of peers)await attach(peer);announce(attached?'Synthetic sender attached. Test beep and check Steam meter.':'Sound player ready; no outgoing Steam audio sender attached yet. Leave and rejoin voice.');return;}
   if(m.type==='status'){lastCodec=await codecReport();announce('Voice connection checked.');return;}
   if(m.type==='stop'){stop();return;}
   if(!enabled)throw Error('Click Enable voice bridge first.');
   if(m.type==='board-stop'){board?.stop();return;}
   if(m.type==='pcm'){if(typeof m.audio!=='string'||m.audio.length>400000)throw Error('Live audio chunk too large.');if(ctx.state!=='running')await ctx.resume();livePlay(m.audio,Number(m.gen)||0);return;}
   if(m.type==='pcm-flush'){liveFlush(Number(m.gen)||0);return;}
   if(m.type==='pcm-reset'){liveFlush(Number.MAX_SAFE_INTEGER-1);liveFlushed=0;return;}
   if(m.type==='board-play'){if(!attached)for(const peer of peers)await attach(peer);await boardPlayer().play(m);return;}
   if(m.type==='volume'){gain.gain.value=Math.max(0,Math.min(.7,Number(m.volume)||0));monitor.gain.value=m.monitor?1:0;return;}
   if(m.type==='sound'){await ctx.resume();for(const peer of peers)await attach(peer);stop();const t=ctx.currentTime;if(m.sound==='beep')tone(660,t,.8);else if(m.sound==='airhorn'){tone(220,t,.6,'sawtooth');tone(277,t,.6,'sawtooth');}else if(m.sound==='drumroll'){for(let i=0;i<12;i++)tone(100+i*8,t+i*.065,.06,'triangle');}announce(attached?'Sound playing; synthetic sender attached. Check Steam meter.':'Sound playing locally; no outgoing Steam sender attached.');return;}
   if(m.type==='audio'){if(typeof m.audio!=='string'||m.audio.length>6000000)throw Error('Clip too large (4 MB maximum).');audioJobs=audioJobs.then(async()=>{const binary=atob(m.audio),bytes=Uint8Array.from(binary,c=>c.charCodeAt(0));const buffer=await ctx.decodeAudioData(bytes.buffer);if(buffer.duration>30)throw Error('Clip exceeds 30 seconds.');if(m.queue&&active.length){playBuffer(buffer,{queue:true,level:replyGain});return;}stop(false);await ctx.resume();replyGain=clipLevel(buffer);playBuffer(buffer,{level:replyGain});announce('Playing into synthetic Steam microphone.');}).catch(error=>announce(error.message,false));}
  }catch(error){if(event.data?.type?.startsWith('music-'))musicStatus(error.message,!!musicStream);announce(error.message,false);}
 });
})();

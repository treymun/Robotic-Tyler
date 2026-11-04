(() => {
 'use strict';
 if(window.__roboticTylerAudioInstalled)return;window.__roboticTylerAudioInstalled=true;
 let musicStream,musicSource,musicGain,musicLimiter;
 function musicStatus(text,shared=!!musicStream){window.postMessage({source:'tyler-music-status',text,shared},location.origin);}
 function disconnectMusic(){const stream=musicStream;musicStream=null;try{musicSource?.disconnect();musicGain?.disconnect();musicLimiter?.disconnect();}catch{}musicSource=null;for(const track of stream?.getTracks()||[])track.stop();musicStatus('Music sharing stopped.',false);}
 let board;let previewNode;let enabled=false,ctx,destination,gain,monitor,active=[],queued=[],audioJobs=Promise.resolve(),requests=0,attached=0;const peers=new Set(),replaced=new WeakSet();
 const announce=(text,ok=true)=>window.postMessage({source:'tyler-audio-status',text,ok,voice:{enabled,requests,attached,player:ctx?.state||'not started',peers:peers.size,observing:!!OriginalPeer,connectedPeers:[...peers].filter(p=>p.connectionState==='connected').length}},location.origin);
 function setup(){if(ctx)return;ctx=new AudioContext();destination=ctx.createMediaStreamDestination();gain=ctx.createGain();gain.gain.value=.35;gain.connect(destination);monitor=ctx.createGain();monitor.gain.value=0;gain.connect(monitor);monitor.connect(ctx.destination);}
 function boardPlayer(){if(!board)board=new TylerBoardAudio(ctx,gain,text=>window.postMessage({source:'tyler-soundboard-status',text},location.origin));return board;}
 async function resumePlayer(){let timer;try{await Promise.race([ctx.resume(),new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('Audio player is suspended. Click Enable again or check this tab is allowed to play sound.')),2500);})]);}finally{clearTimeout(timer);}}
 function playing(value){window.postMessage({source:'tyler-playback',playing:value},location.origin);}
 // Gemini Live chunks (v2.15): 24 kHz PCM scheduled back to back as they arrive, at most 20 s ahead.
 // A flush stops the response that was interrupted and drops its queued chunks at once.
 let liveNodes=[],liveNext=0,liveFlushed=0;
 function livePlay(b64,gen){if(gen<=liveFlushed)return;const pcm=TylerLivePcm.fromBase64(b64);if(!pcm.length)return;const buf=ctx.createBuffer(1,pcm.length,24000),data=buf.getChannelData(0);for(let i=0;i<pcm.length;i++)data[i]=pcm[i]/32768;
  const now=ctx.currentTime;if(liveNext<now+.03)liveNext=now+.06;if(liveNext-now>20)return;const src=ctx.createBufferSource();src.buffer=buf;src.connect(gain);src.start(liveNext);liveNext+=buf.duration;const node={src,gen};liveNodes.push(node);playing(true);
  src.onended=()=>{src.disconnect();liveNodes=liveNodes.filter(n=>n!==node);if(!liveNodes.length&&!active.length)playing(false);};}
 function liveFlush(gen){liveFlushed=Math.max(liveFlushed,gen);const had=liveNodes.length;for(const n of liveNodes)if(n.gen<=gen){try{n.src.onended=null;n.src.stop();n.src.disconnect();}catch{}}liveNodes=liveNodes.filter(n=>n.gen>gen);liveNext=0;if(had&&!liveNodes.length&&!active.length)playing(false);}
 function stop(all=true){if(all)board?.stop();liveFlush(Number.MAX_SAFE_INTEGER-1);liveFlushed=0;try{previewNode?.stop();previewNode?.disconnect();}catch{}previewNode=null;for(const node of active){try{node.stop();node.disconnect();}catch{}}active=[];queued=[];playing(false);}
 // Plays one decoded clip; a clip queued with {queue:true} starts the moment this one ends, with no
 // playing(false) gap in between, so the panel keeps treating the reply as one continuous turn.
 function playBuffer(buffer){const source=ctx.createBufferSource();source.buffer=buffer;source.connect(gain);active.push(source);playing(true);source.onended=()=>{source.disconnect();if(!active.includes(source))return;active=active.filter(n=>n!==source);if(active.length)return;const next=queued.shift();if(next)playBuffer(next);else playing(false);};source.start();}
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
 async function attach(peer){if(!enabled)return;if(closed(peer)){peers.delete(peer);return;}for(const sender of peer.getSenders()){if(sender.track?.kind!=='audio'||replaced.has(sender))continue;const track=synthetic();try{await sender.replaceTrack(track);replaced.add(sender);attached++;announce('Synthetic audio attached to an outgoing Steam audio sender. Confirm with Test beep and Steam meter.');}catch(e){track.stop();if(closed(peer)){peers.delete(peer);continue;}announce('Steam audio attachment failed: '+e.message,false);}}}
 const OriginalPeer=window.RTCPeerConnection;
 if(OriginalPeer){
  const proto=OriginalPeer.prototype,addTrack=proto.addTrack,addTransceiver=proto.addTransceiver,setLocal=proto.setLocalDescription;
  if(addTrack)proto.addTrack=function(track,...streams){if(enabled&&track?.kind==='audio'){track=synthetic();const sender=addTrack.call(this,track,...streams);replaced.add(sender);attached++;announce('Synthetic audio added to an outgoing Steam connection. Confirm with Test beep.');return sender;}return addTrack.call(this,track,...streams);};
  if(addTransceiver)proto.addTransceiver=function(...args){const result=addTransceiver.apply(this,args);void attach(this);return result;};
  if(setLocal)proto.setLocalDescription=async function(...args){await attach(this);return setLocal.apply(this,args);};
  window.RTCPeerConnection=new Proxy(OriginalPeer,{construct(Target,args){const peer=Reflect.construct(Target,args);peers.add(peer);peer.addEventListener('connectionstatechange',()=>{if(peer.connectionState==='closed')peers.delete(peer);announce('Steam connection state: '+peer.connectionState);});return peer;}});
 }
 function tone(frequency,start,duration,type='sine'){const osc=ctx.createOscillator(),envelope=ctx.createGain();osc.frequency.value=frequency;osc.type=type;envelope.gain.setValueAtTime(0,start);envelope.gain.linearRampToValueAtTime(.20,start+.015);envelope.gain.linearRampToValueAtTime(0,start+duration);osc.connect(envelope);envelope.connect(gain);osc.start(start);osc.stop(start+duration+.01);active.push(osc);playing(true);osc.onended=()=>{osc.disconnect();envelope.disconnect();active=active.filter(n=>n!==osc);if(!active.length)playing(false);};}
 window.addEventListener('message',async event=>{
  if(event.source!==window||event.origin!==location.origin||event.data?.source!=='tyler-audio-command')return;
  try{const m=event.data;
   if(m.type==='music-disconnect'){disconnectMusic();return;}
   if(m.type==='music-volume'){if(musicGain){const level=Math.max(0,Math.min(2,Number(m.volume)||0));musicGain.gain.setTargetAtTime(level,ctx.currentTime,.08);}return;}
   if(m.type==='music-capture'){
    disconnectMusic();setup();
    const stream=await navigator.mediaDevices.getDisplayMedia({video:{displaySurface:'browser'},audio:true,preferCurrentTab:false,selfBrowserSurface:'exclude',systemAudio:'exclude',monitorTypeSurfaces:'exclude',surfaceSwitching:'include'});
    const video=stream.getVideoTracks()[0],audio=stream.getAudioTracks();
    if(!audio.length||video?.getSettings?.().displaySurface!=='browser'||/steam/i.test(video?.label||'')){for(const t of stream.getTracks())t.stop();throw Error('Select the YouTube browser tab and enable Share tab audio. Do not select Steam, a window or your screen.');}
    musicStream=stream;musicSource=ctx.createMediaStreamSource(new MediaStream(audio));musicGain=ctx.createGain();musicGain.gain.value=Math.max(0,Math.min(2,(Number.isFinite(Number(m.volume))?Number(m.volume):.35)));musicSource.connect(musicGain);musicLimiter=ctx.createDynamicsCompressor();musicLimiter.threshold.value=-3;musicLimiter.knee.value=6;musicLimiter.ratio.value=20;musicLimiter.attack.value=.003;musicLimiter.release.value=.15;musicGain.connect(musicLimiter);musicLimiter.connect(destination);
    for(const track of stream.getTracks())track.addEventListener('ended',()=>{if(musicStream===stream)disconnectMusic();});
    enabled=true;await resumePlayer();for(const peer of peers)await attach(peer);
    musicStatus('YouTube audio is shared. Join Steam voice with the bot, keep AI in Text mode, then request !play artist song.');return;
   }
   if(m.type==='preview'){if(typeof m.audio!=='string'||m.audio.length>6000000)throw Error('Preview too large');setup();await resumePlayer();const bytes=Uint8Array.from(atob(m.audio),c=>c.charCodeAt(0));const buffer=await ctx.decodeAudioData(bytes.buffer);if(buffer.duration>30)throw Error('Preview exceeds 30 seconds');try{previewNode?.stop();}catch{}const preview=ctx.createBufferSource();previewNode=preview;preview.buffer=buffer;preview.connect(ctx.destination);preview.onended=()=>preview.disconnect();preview.start();announce('Voice preview playing locally only.');return;}
   if(m.type==='enable'){setup();enabled=true;await resumePlayer();for(const peer of peers)await attach(peer);announce(attached?'Synthetic sender attached. Test beep and check Steam meter.':'Sound player ready; no outgoing Steam audio sender attached yet. Leave and rejoin voice.');return;}
   if(m.type==='status'){announce('Voice connection checked.');return;}
   if(m.type==='stop'){stop();return;}
   if(!enabled)throw Error('Click Enable voice bridge first.');
   if(m.type==='board-stop'){board?.stop();return;}
   if(m.type==='pcm'){if(typeof m.audio!=='string'||m.audio.length>400000)throw Error('Live audio chunk too large.');if(ctx.state!=='running')await ctx.resume();livePlay(m.audio,Number(m.gen)||0);return;}
   if(m.type==='pcm-flush'){liveFlush(Number(m.gen)||0);return;}
   if(m.type==='pcm-reset'){liveFlush(Number.MAX_SAFE_INTEGER-1);liveFlushed=0;return;}
   if(m.type==='board-play'){if(!attached)for(const peer of peers)await attach(peer);await boardPlayer().play(m);return;}
   if(m.type==='volume'){gain.gain.value=Math.max(0,Math.min(.7,Number(m.volume)||0));monitor.gain.value=m.monitor?1:0;return;}
   if(m.type==='sound'){await ctx.resume();for(const peer of peers)await attach(peer);stop();const t=ctx.currentTime;if(m.sound==='beep')tone(660,t,.8);else if(m.sound==='airhorn'){tone(220,t,.6,'sawtooth');tone(277,t,.6,'sawtooth');}else if(m.sound==='drumroll'){for(let i=0;i<12;i++)tone(100+i*8,t+i*.065,.06,'triangle');}announce(attached?'Sound playing; synthetic sender attached. Check Steam meter.':'Sound playing locally; no outgoing Steam sender attached.');return;}
   if(m.type==='audio'){if(typeof m.audio!=='string'||m.audio.length>6000000)throw Error('Clip too large (4 MB maximum).');audioJobs=audioJobs.then(async()=>{const binary=atob(m.audio),bytes=Uint8Array.from(binary,c=>c.charCodeAt(0));const buffer=await ctx.decodeAudioData(bytes.buffer);if(buffer.duration>30)throw Error('Clip exceeds 30 seconds.');if(m.queue&&active.length){queued.push(buffer);return;}stop(false);await ctx.resume();playBuffer(buffer);announce('Playing into synthetic Steam microphone.');}).catch(error=>announce(error.message,false));}
  }catch(error){if(event.data?.type?.startsWith('music-'))musicStatus(error.message,!!musicStream);announce(error.message,false);}
 });
})();

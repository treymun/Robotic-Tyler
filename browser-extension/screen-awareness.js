(()=>{'use strict';
const api=globalThis.TylerCompanion,mount=(api?.getFeatureMount?.()||api?.getMount?.());if(!mount||!navigator.mediaDevices?.getDisplayMedia)return;
const card=document.createElement('details');card.className='feature';card.innerHTML=`<summary><span class="feature-title">Screen awareness</span><span class="feature-meta">Opt-in</span></summary>
<p>Share a game/window on purpose. Screenshots are sent to your selected OpenRouter vision model only when you press Analyze, or automatically while the optional banter mode is enabled. Don't share sensitive windows.</p>
<div class="btn-row"><button id="v23Start">Choose screen/window</button><button id="v23Analyze">Analyze once</button><button id="v23Stop">Stop sharing</button></div>
<label><input id="v23Auto" type="checkbox"> Analyze every 45 seconds and comment on clearly visible Deadlock events (if enabled in settings)</label>
<label><input id="v23Voice" type="checkbox"> Speak confirmed banter using Chrome Steam voice bridge (may incur TTS fees)</label>
<p id="v23Status" role="status">Nothing is being captured.</p><div id="v23Result"></div><small>Requires OpenRouter vision credits. A death must be visible; the AI may still be mistaken. Cooldown 2 minutes. Never captures audio, never saves screenshots, never records the screen continuously.</small>`;
mount.append(card);const $=id=>card.querySelector('#'+id);let stream=null,video=null,busy=false,interval=null,lastEvent='',lastAt=0,lastScene='';
const report=t=>$('v23Status').textContent=t;
const clean=()=>{clearInterval(interval);interval=null;for(const t of stream?.getTracks()||[])t.stop();stream=null;if(video){video.srcObject=null;video.remove();video=null;}$('v23Auto').checked=false;report('Screen sharing stopped.');};
$('v23Start').onclick=async()=>{try{clean();const s=await chrome.runtime.sendMessage({type:'v23:screen-config'});if(!s?.ok||s.stopped||!s.screenConsent)throw Error('Enable Screen Awareness consent in settings first.');stream=await navigator.mediaDevices.getDisplayMedia({video:{frameRate:1},audio:false});video=document.createElement('video');video.muted=true;video.playsInline=true;video.srcObject=stream;await video.play();for(const t of stream.getVideoTracks())t.addEventListener('ended',clean,{once:true});report('Sharing: '+(stream.getVideoTracks()[0]?.label||'chosen screen')+'. Analyze manually, or enable automatic mode below.');}catch(e){clean();report('Capture not started: '+e.message);}};
$('v23Stop').onclick=clean;
async function analyze(auto=false){if(!stream||!video||video.readyState<2)return report('Choose a screen/window first.');if(busy)return;
 const pref=await chrome.runtime.sendMessage({type:'v23:screen-config'});if(!pref?.ok||pref.stopped||!pref.screenConsent){clean();return report('Screen Awareness disabled or emergency stop active.');}if(auto&&(!pref.autoRoast||!$('v23Auto').checked))return;
 if(!api.isOwner?.())return report('This Steam tab does not own ROBOTIC TYLER.');
 busy=true;const start=performance.now();try{const canvas=document.createElement('canvas');const scale=Math.min(1,960/Math.max(video.videoWidth,video.videoHeight));canvas.width=Math.max(2,Math.round(video.videoWidth*scale));canvas.height=Math.max(2,Math.round(video.videoHeight*scale));canvas.getContext('2d').drawImage(video,0,0,canvas.width,canvas.height);const image=canvas.toDataURL('image/jpeg',0.58);canvas.width=canvas.height=0;
 if(image.length>480000)throw Error('Screenshot too large. Try a smaller capture window.');report('Analyzing a single frame…');const r=await chrome.runtime.sendMessage({type:'v23:screen-analyze',image});if(!r?.ok)throw Error(r?.error||'Could not analyze screenshot.');const v=r.scene;
 $('v23Result').textContent='Detected: '+v.game+' · '+v.event+' · confidence '+Math.round(v.confidence*100)+'%'+(v.comment?' · '+v.comment:'');
 const now=Date.now(),confirmed=v.game==='deadlock'&&v.confidence>=0.85&&['death','poor_performance','good_play'].includes(v.event)&&!!v.comment;
 if(!confirmed){lastEvent='';}
 if(auto&&confirmed&&now-lastAt>120000&&v.event!==lastEvent){
  lastEvent=v.event;lastAt=now;
  if($('v23Voice').checked){const reply=await chrome.runtime.sendMessage({type:'command',text:'say '+v.comment,speak:true});if(!reply?.ok||!reply.audio)throw Error(reply?.error||reply?.warning||'Voice output unavailable');api.bridge('audio',{audio:reply.audio});report('Spoke a gameplay reaction. Confirm Steam voice routing is connected.');}
  else{api.send(v.comment);report('Sent a gameplay reaction to the selected Steam chat.');}
 }else report(confirmed?'Evidence found. Manual analysis does not auto-post; enable automatic mode to react.':'No confidently verified event — no automatic comment.');
 }catch(e){report('Analysis failed: '+e.message);}finally{busy=false;}}
$('v23Analyze').onclick=()=>analyze(false);
$('v23Auto').onchange=()=>{clearInterval(interval);if($('v23Auto').checked){interval=setInterval(()=>{if(document.visibilityState==='visible'&&stream)void analyze(true);},45000);report('Automatic analysis enabled while this tab is visible and screen sharing stays active.');}else report('Automatic analysis stopped.');};
window.addEventListener('pagehide',clean,{once:true});chrome.runtime.onMessage.addListener(m=>{if(m?.type==='v22:stop')clean();});
})();

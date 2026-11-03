// Gemini Live card in Tyler's panel (Chrome, v2.15).
//
// Shown when Settings → Voice is set to Gemini Live. Nothing starts until the owner ticks the
// consent box and presses Start. While it runs, the call's incoming voices (voice-listener.js)
// stream to the extension background over a port, and Tyler's reply chunks come back and play
// into the call through the synthetic microphone (audio-bridge.js). The Google key never comes
// here. Stop, a closed port, a lost tab lease or the emergency stop end everything; nothing
// restarts on its own and no other engine is started instead.
(() => {
 'use strict';
 const api=globalThis.TylerCompanion,mount=api?.getMount?.();if(!mount)return;
 const icon=n=>globalThis.TylerIcons?.svg(n)||'';
 const root=document.createElement('section');root.className='live-card';root.hidden=true;mount.append(root);
 root.innerHTML=`<div class="deck-head"><h2>Gemini Live</h2></div>
 <p class="hint">Real-time voice with Google. Tyler hears this tab's Steam voice call (never your microphone), answers as people talk and stops when someone talks over him.</p>
 <label><input id="liveConsent" type="checkbox"> Everyone in this call knows Tyler is listening and that the call audio goes to Google while Live is on.</label>
 <div class="actions"><button id="liveStart" type="button">${icon('play')}<span class="lbl">Start live voice</span></button><button id="liveStop" type="button" disabled>${icon('stop')}<span class="lbl">Stop</span></button></div>
 <p id="liveState" role="status">Off. Press Start when everyone is ready.</p>
 <small id="liveInfo"></small>
 <details><summary>Transcript and typed test</summary><pre id="liveHeard">Friends: …</pre><pre id="liveSaid">Tyler: …</pre>
 <label>Say something to Tyler (he answers out loud)<input id="liveText" type="text" maxlength="300" placeholder="Tyler, give us a pep talk"></label><button id="liveSend" type="button" disabled>Send</button></details>`;
 const $=id=>root.querySelector('#'+id);
 let port=null,ping=null,state='off',heard='',said='',engine='standard';
 const show=t=>{$('liveState').textContent=t;api.setActivity?.(t);};
 const page=(source,type,extra={})=>window.postMessage({source,type,...extra},location.origin);
 const listen=type=>page('tyler-listener-control',type);
 const audio=(type,extra)=>page('tyler-audio-command',type,extra);
 function buttons(){const running=!!port;$('liveStart').disabled=running;$('liveStop').disabled=!running;$('liveSend').disabled=state!=='live';}

 async function refresh(){
  try{const r=await chrome.runtime.sendMessage({type:'connection'});if(!r?.ok)return;engine=r.voiceEngine==='live'?'live':'standard';root.hidden=engine!=='live'&&!port;}catch{}
 }
 function end(text){
  const was=port;port=null;clearInterval(ping);ping=null;state='off';
  if(was){try{was.postMessage({type:'stop',reason:text});}catch{}try{was.disconnect();}catch{}}
  listen('live-off');audio('pcm-flush',{gen:Number.MAX_SAFE_INTEGER-1});
  show(text);buttons();void refresh();
 }
 async function start(){
  if(port)return;
  if(!$('liveConsent').checked){show('Tick the consent box first: everyone in the call should know Tyler is listening.');return;}
  if(api.isOwner?.()===false){show('This tab is on standby. Take over in Setup first.');return;}
  await refresh();if(engine!=='live'){show('Settings → Voice is set to Standard. Choose Gemini Live there first.');return;}
  const stopped=await chrome.runtime.sendMessage({type:'storage:content',action:'get',keys:['v22EmergencyStop']}).catch(()=>null);
  if(stopped?.values?.v22EmergencyStop===true){show('Emergency stop is on. Unlock it in Settings first.');return;}
  // One engine at a time: Standard voice stops before Live starts.
  api.stopAutomatic?.('Switched to Gemini Live');
  audio('enable');audio('pcm-reset');
  port=chrome.runtime.connect({name:'tyler-live'});state='connecting';buttons();show('Connecting to Gemini Live…');
  port.onMessage.addListener(onMessage);
  port.onDisconnect.addListener(()=>{if(port)end('Live voice ended because the extension restarted. Press Start to begin a new session.');});
  ping=setInterval(()=>{try{port?.postMessage({type:'ping'});}catch{}},20000);
  port.postMessage({type:'start',chatScope:api.getChatScope?.()});
 }
 function onMessage(m){
  if(!port)return;
  if(m.type==='audio'){audio('pcm',{audio:m.data,gen:m.gen});return;}
  if(m.type==='flush'){audio('pcm-flush',{gen:m.gen});return;}
  if(m.type==='started'){$('liveInfo').textContent=m.model+' · voice '+m.voice;listen('live-on');return;}
  if(m.type==='state'){
   state=m.state;buttons();
   if(m.state==='live')show(m.detail?.resumed?'LIVE · reconnected. Tyler waits for someone to speak.':'LIVE · Tyler is listening to the call.');
   else if(m.state==='reconnecting')show('Connection dropped. Reconnecting (try '+(m.detail?.attempt||1)+')…');
   else if(m.state==='failed')end('Live voice stopped: '+(m.detail?.reason||'Google ended the session')+'. Nothing else was started.');
   else if(m.state==='stopped')end('Live voice is off ('+(m.detail?.reason||'stopped')+').');
   return;
  }
  if(m.type==='transcript'){if(m.who==='friends'){heard=(heard+m.text).slice(-400);$('liveHeard').textContent='Friends: '+heard;}else{said=(said+m.text).slice(-400);$('liveSaid').textContent='Tyler: '+said;}return;}
  if(m.type==='latency'){$('liveInfo').textContent=$('liveInfo').textContent.replace(/ · last reply .*$/,'')+' · last reply started '+(m.ms/1000).toFixed(2)+' s after people stopped talking';return;}
  if(m.type==='note'){show('LIVE · '+m.text);return;}
  if(m.type==='restart'){show('LIVE · Voice settings changed. Stop and start again to use them.');return;}
  if(m.type==='error'){end('Live voice could not run: '+m.text);}
 }
 window.addEventListener('message',e=>{
  if(e.source!==window||e.origin!==location.origin||e.data?.source!=='tyler-listener'||!port)return;
  const m=e.data;
  if(m.type==='live-audio'&&state==='live'&&typeof m.pcm==='string'){try{port.postMessage({type:'audio',pcm:m.pcm});}catch{}}
  if(m.type==='live-level'&&state==='live'&&!m.tracks)show('LIVE · nobody else is in the voice call yet.');
 });
 $('liveStart').onclick=()=>void start();
 $('liveStop').onclick=()=>end('Live voice stopped by you.');
 $('liveSend').onclick=()=>{const t=$('liveText').value.trim();if(!t||!port)return;port.postMessage({type:'text',text:t});$('liveText').value='';heard='';$('liveHeard').textContent='You typed: '+t;};
 chrome.runtime.onMessage.addListener(m=>{if(m?.source==='tyler-lease-lost'&&port)end('Another tab took over Tyler, so live voice stopped.');if(m?.type==='v22:stop'&&port)end('Emergency stop.');});
 globalThis.TylerStorage?.onChanged?.addListener((changes,area)=>{if(area==='local'&&changes.v22EmergencyStop?.newValue===true&&port)end('Emergency stop.');});
 api.stopLive=reason=>{if(port)end(reason||'Live voice stopped.');};
 api.liveActive=()=>!!port;
 window.addEventListener('focus',()=>void refresh());
 void refresh();
})();

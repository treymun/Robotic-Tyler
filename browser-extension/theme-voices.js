// ROBOTIC TYLER: theme voices, the Steam chat side (v2.35). Isolated world.
//
// Tyler says typed text in the theme's character voice (a voice clone made on this PC by the desktop
// app's local engine, app/theme-voices). This card has the text box and the controls; the voice is
// picked when a request starts, so changing the theme meanwhile doesn't change a message on its way.
// "Play into call" uses the same synthetic microphone as Tyler's other speech, queued after anything
// he is already saying (so nothing overlaps, and his listener holds while he talks).
// Chat: "!say TEXT" (or "!say portal: TEXT"), only when the owner turns it on in Settings.
(() => {
 'use strict';
 const api=globalThis.TylerCompanion,mount=(api?.getFeatureMount?.()||api?.getMount?.());if(!api||!mount||globalThis.TylerThemeVoices)return;
 const panel=document.createElement('details');panel.className='feature';panel.id='themeVoicesCard';
 panel.innerHTML=`<summary><span class="feature-title">Theme voices</span><span class="feature-meta" id="tvMeta">Checking…</span></summary>
 <p class="hint">Tyler says your text in the theme’s character voice, made on this PC (no key, no cost per message). Install and options are in Settings → Theme voices.</p>
 <p id="tvStatus" role="status">Checking the voice engine…</p>
 <label class="toggle"><input type="checkbox" id="tvFollow" checked><span><b>Follow the theme</b><small id="tvNow"></small></span></label>
 <label>Voice<select id="tvVoice" aria-label="Voice" disabled></select></label>
 <label>What Tyler says<textarea id="tvText" maxlength="400" rows="3" placeholder="Type a message for Tyler to say…"></textarea></label>
 <div class="btn-row"><button class="btn sm" id="tvGenerate" type="button">Generate</button><button class="btn sm" id="tvPreview" type="button">Preview</button><button class="btn sm primary" id="tvCall" type="button">Play into call</button><button class="btn sm" id="tvStop" type="button">Stop</button></div>
 <div class="btn-row"><button class="btn sm" id="tvReplay" type="button" disabled>Replay</button><button class="btn sm" id="tvSave" type="button" disabled>Save</button><button class="btn sm" id="tvSettings" type="button">Settings</button><button class="btn sm primary" id="tvSetup" type="button" hidden>Set up theme voices</button></div>
 <p class="hint" id="tvClip"></p>`;
 mount.append(panel);
 let noteAt=0;const $=id=>panel.querySelector('#'+id),status=t=>{$('tvStatus').textContent=t;noteAt=Date.now();},quiet=t=>{if(Date.now()-noteAt>8000)$('tvStatus').textContent=t;};
 const send=m=>chrome.runtime.sendMessage(m).then(r=>{if(r?.ok===false)throw Error(r.error||'Theme voices didn’t answer.');return r;});
 let info={available:null},voices=[],last=null,lastRoute=null,busy=false,chatCfg={chat:false};
 const label=t=>voices.find(v=>v.theme===t)?.name||t;
 function chosen(){return $('tvFollow').checked?(api.getTheme?.()||'steam'):$('tvVoice').value;}
 function describe(){
  const t=chosen(),v=voices.find(x=>x.theme===t);
  $('tvNow').textContent=$('tvFollow').checked?'Now: '+(v?v.name+' ('+(api.getTheme?.()||'steam')+' theme)':t):'Using the voice picked below.';
  if(v&&v.status!=='ready'&&v.status!=='custom')$('tvNow').textContent+=' · '+v.statusLabel;
 }
 function render(){
  const s=info.status;
  if(info.available===false){$('tvMeta').textContent='Desktop app';status(info.reason||'Theme voices run in the desktop app.');for(const id of ['tvGenerate','tvPreview','tvCall','tvStop'])$(id).disabled=true;return;}
  if(!s){$('tvMeta').textContent='…';return;}
  $('tvMeta').textContent=s.ready?(s.busy?'Speaking…':s.modeLabel+(s.loaded?' · loaded':'')):s.installing?'Installing…':'Not installed';
  for(const id of ['tvGenerate','tvPreview','tvCall'])$(id).disabled=!s.ready||busy;
  // Not installed: one clear way to add them, no pop-ups (the panel never interrupts for this).
  $('tvSetup').hidden=!!s.ready||!!s.installing;
  $('tvStop').disabled=!busy&&!s.busy;
  if(!busy){
   if(s.installing)quiet('Installing theme voices: '+(s.installing.label||'')+(s.installing.totalBytes?' ('+Math.round(100*(s.installing.bytes||0)/s.installing.totalBytes)+'%)':''));
   else if(!s.installed)quiet('Optional: theme voices aren’t installed. Tyler’s normal voice works without them. “Set up theme voices” shows what this PC would download first.');
   else if(!s.current)quiet('Theme voices need a quick update for this version. Open Settings → Theme voices.');
   else if(s.needs==='model')quiet(s.modeLabel+' mode’s model isn’t installed. Open Settings → Theme voices.');
   else if(s.lastError)quiet('Last try: '+s.lastError.message);
   else quiet('Ready · '+s.modeLabel+' mode'+(s.check?.ok?' · last check: '+s.check.seconds+' s of speech in '+(s.check.ms/1000).toFixed(1)+' s on the '+(s.check.device==='cuda'?'graphics card':'processor'):'')+'.');
  }
  $('tvReplay').disabled=!last;$('tvSave').disabled=!last;describe();
 }
 async function refresh(){
  try{const r=await send({type:'voices:status'});info=r;if(r.voices){voices=r.voices;fillVoices();}chatCfg=r.status?.settings||chatCfg;globalThis.TylerCommands?.set?.('theme-voices',{enabled:!!(r.available&&chatCfg.chat)});}
  catch(e){info={available:null,status:null};status('Theme voices: '+e.message);}
  render();
 }
 function fillVoices(){
  const sel=$('tvVoice'),keep=sel.value||info.status?.settings?.override||'';
  sel.replaceChildren(...voices.map(v=>{const o=document.createElement('option');o.value=v.theme;o.textContent=v.name+(v.status==='ready'||v.status==='custom'?'':' · '+v.status);o.disabled=!v.hasReference;return o;}));
  if(keep&&voices.some(v=>v.theme===keep))sel.value=keep;
  if(info.status?.settings&&!panel.dataset.loaded){panel.dataset.loaded='1';$('tvFollow').checked=info.status.settings.followTheme!==false;}
  sel.disabled=$('tvFollow').checked;
 }
 $('tvFollow').onchange=()=>{$('tvVoice').disabled=$('tvFollow').checked;describe();void send({type:'voices:settings',values:{followTheme:$('tvFollow').checked,override:$('tvVoice').value}}).catch(()=>{});};
 $('tvVoice').onchange=()=>{describe();void send({type:'voices:settings',values:{override:$('tvVoice').value}}).catch(()=>{});};
 $('tvSettings').onclick=()=>{void send({type:'settings',section:'theme-voices'}).catch(()=>{});};
 $('tvSetup').onclick=()=>{void send({type:'settings',section:'theme-voices'}).catch(()=>{});};
 // A WAV longer than the bridge's 30-second clip limit is played as consecutive parts.
 function wavParts(b64,maxSec=29){
  const bin=atob(b64);if(bin.length<44||bin.slice(0,4)!=='RIFF')return [b64];
  const u=Uint8Array.from(bin,c=>c.charCodeAt(0)),dv=new DataView(u.buffer);let rate=0,align=2,at=12,data=null,head=44;
  while(at+8<=u.length){const id=bin.slice(at,at+4),n=dv.getUint32(at+4,true);if(id==='fmt '){rate=dv.getUint32(at+16,true);align=dv.getUint16(at+20,true)||2;}if(id==='data'){data=u.subarray(at+8,Math.min(u.length,at+8+n));head=at+8;break;}at+=8+n+(n&1);}
  if(!data||!rate)return [b64];
  const per=Math.floor(rate*maxSec/align)*align;if(data.length<=per)return [b64];
  const parts=[];for(let p=0;p<data.length;p+=per){const piece=data.subarray(p,Math.min(data.length,p+per)),out=new Uint8Array(head+piece.length);out.set(u.subarray(0,head));const o=new DataView(out.buffer);o.setUint32(4,head-8+piece.length,true);o.setUint32(head-4,piece.length,true);out.set(piece,head);let s='';for(let i=0;i<out.length;i+=8192)s+=String.fromCharCode(...out.subarray(i,i+8192));parts.push(btoa(s));}
  return parts;
 }
 function play(route,audio){
  if(route==='preview'){api.bridge('preview',{audio:wavParts(audio)[0]});return;}
  const v=api.getVoiceState?.();if(!v?.enabled)throw Error('Join the voice channel with Tyler first (Connect & start), then press Play into call.');
  for(const part of wavParts(audio))api.bridge('audio',{audio:part,queue:true});
 }
 /** Make (or reuse) the clip for the box's text with the voice chosen right now, then play it. */
 async function make(route,{text=$('tvText').value,theme=chosen(),fresh=false,from='panel'}={}){
  text=String(text||'').replace(/\s+/g,' ').trim();if(!text){status('Type something for Tyler to say.');return null;}
  if(busy){status('Still making the last one. Press Stop to cancel it.');return null;}
  busy=true;render();const started=Date.now();status('Making '+label(theme)+'’s voice…');
  try{
   const r=await send({type:'voices:speak',text,theme,fresh,purpose:route==='call'?'call':'preview',from});
   last={...r.clip,audio:r.audio};lastRoute=route;
   const c=r.clip,where=c.device==='cuda'?'graphics card':c.device==='windows'?'Windows speech':'processor';
   $('tvClip').textContent=c.voiceName+' · '+c.seconds.toFixed(1)+' s'+(c.cached?' · from the cache':' · made in '+(c.ms/1000).toFixed(1)+' s on the '+where)+' · '+(c.mode==='native'?'the original Windows voice':c.mode==='light'?'Lightweight':'Quality')+(c.processed?' · with the voice’s radio/mask sound':'')+(c.status&&!['ready','custom'].includes(c.status)?' · '+c.status:'');
   if(route){try{play(route,r.audio);}catch(e){status('Made it ('+c.seconds.toFixed(1)+' s), but: '+e.message);return last;}}
   status(route==='call'?'Playing into the call: “'+text.slice(0,60)+'”':route==='preview'?'Previewing here only (not in the call).':'Ready. Preview it or play it into the call.');
   return last;
  }catch(e){status(/Stopped/.test(e.message)?'Stopped.':'Couldn’t make that voice: '+e.message);throw e;}
  finally{busy=false;render();if(Date.now()-started>1500)void refresh();}
 }
 const click=(id,fn)=>{$(id).onclick=()=>{fn().catch(()=>{});};};
 click('tvGenerate',()=>make(null));
 click('tvPreview',async()=>{const t=$('tvText').value.trim();if(last&&last.text===t.replace(/\s+/g,' ')&&last.theme===chosen()){play('preview',last.audio);lastRoute='preview';status('Previewing here only (not in the call).');return;}await make('preview');});
 click('tvCall',async()=>{const t=$('tvText').value.trim();if(last&&last.text===t.replace(/\s+/g,' ')&&last.theme===chosen()){play('call',last.audio);lastRoute='call';status('Playing into the call.');return;}await make('call');});
 click('tvStop',async()=>{await send({type:'voices:stop'}).catch(()=>{});api.bridge('stop');busy=false;status('Stopped.');render();});
 click('tvReplay',async()=>{if(!last)return;try{play(lastRoute||'preview',last.audio);status('Replaying '+(lastRoute==='call'?'into the call.':'here.'));}catch(e){status(e.message);}});
 click('tvSave',async()=>{if(!last)return;try{const r=await send({type:'voices:save',id:last.id});status('Saved: '+r.file);}catch(e){status('Couldn’t save: '+e.message);}});
 // ── !say in chat (off unless the owner turns it on) ──────────────────────
 const seen=new WeakMap(),answered=new Set(),lastBy=new Map();let region=null,observer=null,selector=null,boundAt=0;
 function parse(line){const m=/^\s*!say\s+(?:([a-z0-9]{2,12}):\s*)?(\S[\s\S]{0,399})$/i.exec(String(line||''));if(!m)return null;return {theme:m[1]?m[1].toLowerCase():null,text:m[2].trim()};}
 globalThis.TylerCommands?.set?.('theme-voices',{enabled:false});
 async function onChat(line,node){
  const req=parse(line);if(!req||!chatCfg.chat||!info.status?.ready)return;
  if(api.isAiPaused?.())return;
  const s=globalThis.TylerIdentity?.identify?.(node,region)||null,m=globalThis.TylerIdentity?.meta?.(node)||null,id=/^7656119\d{10}$/.test(s?.id||'')?s.id:m?.senderId||null,name=String(s?.name||'Someone').slice(0,40);
  if(chatCfg.chatAccess==='selected'&&!(id&&String(chatCfg.chatAllowed||'').split(/\s+/).includes(id)))return;
  const key=id||name,wait=(chatCfg.chatCooldown??20)*1000,prev=lastBy.get(key)||0;
  if(Date.now()-prev<wait){status('!say from '+name+' skipped: cooldown.');return;}
  if(req.theme&&!voices.some(v=>v.theme===req.theme)){api.send('🔊 '+name+', there’s no “'+req.theme+'” voice. Voices: '+voices.filter(v=>v.hasReference).map(v=>v.theme).join(', ')+'.',{kind:'game'});return;}
  lastBy.set(key,Date.now());
  try{await make('call',{text:req.text,theme:req.theme||chosen(),from:'chat'});}
  catch(e){if(!/Stopped/.test(e.message))api.send('🔊 Couldn’t say that for '+name+': '+String(e.message).slice(0,140),{kind:'game'});}
 }
 function watch(){
  if(!chatCfg.chat){if(observer){observer.disconnect();observer=null;region=null;}return;}
  const next=api.getRegion?.(),sample=api.getSample?.();if(!next?.isConnected||(next===region&&observer))return;
  observer?.disconnect();region=next;boundAt=Date.now();selector=(sample?.isConnected&&globalThis.TylerSelection?.selector?.(sample))||selector;if(!selector)return;
  for(const n of region.querySelectorAll(selector))seen.set(n,(globalThis.TylerChatBus?.text(n)??(n.innerText||n.textContent||'').trim()));
  observer=new (globalThis.TylerChatBus?.Observer||MutationObserver)(records=>{
   const nodes=new Set();for(const r of records)for(const raw of r.addedNodes||[]){const n=raw?.nodeType===1?raw:raw?.parentElement;if(!n)continue;if(n.matches?.(selector))nodes.add(n);for(const c of n.querySelectorAll?.(selector)||[])nodes.add(c);const p=n.closest?.(selector);if(p)nodes.add(p);}
   for(const node of nodes){const line=(globalThis.TylerChatBus?.text(node)??(node.innerText||node.textContent||'').trim());if(!line||seen.get(node)===line)continue;seen.set(node,line);
    const m=globalThis.TylerIdentity?.meta?.(node);if(m?.self||globalThis.TylerChatTag?.own?.(line,m))continue;if(m?.at&&m.at<boundAt-5000)continue;
    if(m?.key){if(answered.has(m.key))continue;answered.add(m.key);if(answered.size>300)answered.delete(answered.values().next().value);}
    const first=line.split('\n').map(x=>x.trim()).find(x=>/^!say\s/i.test(x));if(first)void onChat(first,node);}
  });
  observer.observe(region,{subtree:true,childList:true});
 }
 api.onPause?.(()=>{if(busy)void send({type:'voices:stop'}).catch(()=>{});});
 panel.addEventListener('toggle',()=>{if(panel.open)void refresh();});
 api.ui?.onUI?.(()=>describe());
 void refresh();setInterval(()=>{if(panel.open||busy||chatCfg.chat)void refresh();},busy?2000:15000);setInterval(watch,1500);
 globalThis.TylerThemeVoices=Object.freeze({refresh,parse,say:(text,theme)=>make('call',{text,theme}),state:()=>({busy,available:info.available,ready:!!info.status?.ready,voices:voices.filter(v=>v.hasReference).map(v=>({theme:v.theme,name:v.name}))})});
})();

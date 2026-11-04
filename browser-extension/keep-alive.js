// Stay connected (v2.24): keeps Tyler in quiet calls and keeps his chat reader working.
//  - Calls: Steam drops a call member who has made no sound for about an hour. The audio bridge
//    (audio-bridge.js, keepalive) hums once, softly, after the chosen time without any sound from Tyler.
//  - Chat: when Steam redraws the chat (after its own reconnect, say), the old message list Tyler
//    watched is gone and nothing new arrives. Every 15 s this checks it; if it's gone, Tyler looks for
//    the same Steam channel (the same chat object in Steam's store, steam-chat-main.js) and starts
//    watching it again. A different or unclear chat is never picked: he stops and says so.
//  - Chrome only: the tab isn't unloaded by Memory Saver, and a data channel inside the page keeps
//    Chrome from freezing it or slowing it down in the background (audio-bridge.js, tab-awake).
(() => {
 'use strict';
 const api=globalThis.TylerCompanion,ui=api?.ui;if(!ui||globalThis.TylerKeepAlive)return;
 const root=ui.root,chrome_=(api.platform||globalThis.TylerPlatform||{}).id!=='desktop';
 const DEFAULTS={call:true,minutes:45,chat:true};let cfg={...DEFAULTS};
 const MINUTES=[15,30,45,55];

 // ── Panel ─────────────────────────────────────────────────────────────────
 const box=document.createElement('details');box.className='feature';box.id='keepAlive';
 box.innerHTML=`<summary><span class="feature-title">Stay connected</span><span class="feature-meta" id="kaMeta">On</span></summary>
<div class="feature-body">
 <label class="check" data-capability="voice"><input id="kaCall" type="checkbox" checked><span>Keep Tyler in quiet calls</span></label>
 <small class="hint" data-capability="voice">Steam drops a call member who hasn't made a sound for about an hour. After this long without any sound from Tyler, he hums once, softly (quieter than his voice).</small>
 <label class="field" data-capability="voice">Hum after<select id="kaMinutes">${MINUTES.map(m=>'<option value="'+m+'">'+m+' quiet minutes</option>').join('')}</select></label>
 <div class="btn-row" data-capability="voice"><button id="kaTest" class="btn" type="button">Play the hum now</button></div>
 <label class="check"><input id="kaChat" type="checkbox" checked><span>Keep the chat connected</span></label>
 <small class="hint">If Steam redraws the chat, Tyler finds the same channel again by himself.${chrome_?' The tab also stays awake in the background and isn’t unloaded to save memory.':''}</small>
 <p id="kaStatus" class="hint" role="status"></p>
</div>`;
 (root.getElementById('automaticMount')||root.getElementById('quickMount'))?.after(box);
 const $=id=>box.querySelector('#'+id);
 const status=t=>{$('kaStatus').textContent=t;};
 const clock=t=>new Date(t).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'});
 function paint(){$('kaCall').checked=cfg.call;$('kaChat').checked=cfg.chat;$('kaMinutes').value=String(cfg.minutes);$('kaMinutes').disabled=!cfg.call;$('kaTest').disabled=!cfg.call;
  $('kaMeta').textContent=cfg.call&&cfg.chat?'On':cfg.call?'Calls only':cfg.chat?'Chat only':'Off';}
 const save=()=>void globalThis.TylerStorage?.set?.({keepAlive:{...cfg}}).catch(()=>{});
 $('kaCall').onchange=()=>{cfg.call=$('kaCall').checked;paint();save();push();};
 $('kaChat').onchange=()=>{cfg.chat=$('kaChat').checked;paint();save();push();awake();};
 $('kaMinutes').onchange=()=>{cfg.minutes=Number($('kaMinutes').value)||45;save();push();};
 $('kaTest').onclick=()=>{api.bridge?.('keepalive-test');};

 // ── Calls (the audio bridge does the timing) ──────────────────────────────
 let lastHum=0,callInfo=null;
 function push(){if(api.isOwner?.())api.bridge?.('keepalive',{on:cfg.call,minutes:cfg.minutes});}
 window.addEventListener('message',e=>{
  if(e.source!==window||e.origin!==location.origin||e.data?.source!=='tyler-keepalive')return;const d=e.data;
  if(d.reason==='quiet'||d.reason==='test'){lastHum=Number(d.at)||Date.now();api.emit?.('keepalive',{reason:d.reason});
   status((d.reason==='test'?'Hum played ':'Quiet call: hummed ')+'at '+clock(lastHum)+'.');}
  if(d.reason==='status'){callInfo=d;describe();}
 });
 function describe(){
  if(!cfg.call&&!cfg.chat){status('Off. Steam may drop Tyler from a call after about an hour of quiet.');return;}
  const parts=[];
  if(cfg.call&&callInfo){if(callInfo.inCall){const quiet=Math.floor((Number(callInfo.idleMs)||0)/60000);parts.push('In a call, quiet for '+quiet+' min; he hums at '+cfg.minutes+'.');}else parts.push('Not in a call.');}
  if(lastHum)parts.push('Last hum '+clock(lastHum)+'.');
  if(chatNote)parts.push(chatNote);
  status(parts.join(' '));
 }

 // ── Chat ────────────────────────────────────────────────────────────────
 let marked=null,markedKind=null,lostAt=0,chatNote='',busy=false;const recent=[];
 async function mark(){const region=api.getRegion?.(),sample=api.getSample?.();if(!region?.isConnected||!sample?.isConnected)return;
  try{await globalThis.TylerSteamChat?.request(sample,'chat-mark',{key:'auto'});marked=region;markedKind=api.getChatKind?.()||markedKind;}catch{marked=region;markedKind=null;}}
 async function same(sample){try{const r=await globalThis.TylerSteamChat?.request(sample,'chat-same',{key:'auto'});return r?.same===true;}catch{return false;}}
 async function watch(){
  if(busy||!api.isOwner?.()||!api.isAutomaticActive?.())return;
  const region=api.getRegion?.(),composer=api.getComposer?.();
  if(region?.isConnected&&composer?.isConnected){lostAt=0;if(marked!==region)await mark();return;}
  if(!cfg.chat)return;
  busy=true;try{
   if(!lostAt)lostAt=Date.now();
   const found=globalThis.TylerSelection?.discover(document,null,markedKind);
   if(found?.region&&found.sample&&found.composer&&!found.ambiguous&&await same(found.sample)){
    recent.push(Date.now());while(recent.length&&Date.now()-recent[0]>600000)recent.shift();
    if(recent.length>3){give('Steam keeps redrawing the chat, so Tyler stopped. Press Connect & start when it settles.');return;}
    const ok=await api.startAutomatic?.();
    if(ok){lostAt=0;marked=null;await mark();chatNote='Chat reconnected at '+clock(Date.now())+' after Steam redrew it.';describe();return;}
   }
   // Steam may still be drawing it: give it a minute before giving up.
   if(Date.now()-lostAt>60000)give('Steam redrew the chat and Tyler couldn’t find the same channel, so he stopped. Open it and press Connect & start.');
  }finally{busy=false;}
 }
 function give(text){lostAt=0;marked=null;api.stopAutomatic?.('Chat changed');chatNote=text;describe();
  api.notify?.({kind:'error',title:'Tyler lost the chat',text,action:{label:'Connect & start',run:()=>api.connectAndStart?.()}});}
 setInterval(()=>{void watch();},15000);

 // ── Chrome: a tab that stays awake ────────────────────────────────────────
 let awakeOn=null;
 function awake(){if(!chrome_)return;const want=!!(cfg.chat&&api.isOwner?.());if(want===awakeOn||awakeOn===null&&!want)return;awakeOn=want;
  api.bridge?.('tab-awake',{on:want});void chrome.runtime.sendMessage({type:'keepalive:tab',on:want}).catch(()=>{});}

 // ── Start ─────────────────────────────────────────────────────────────────
 let owner=null;
 function tick(){const now=!!api.isOwner?.();if(now!==owner){owner=now;if(now)push();}awake();if(now&&cfg.call)api.bridge?.('keepalive',{on:cfg.call,minutes:cfg.minutes});else describe();}
 globalThis.TylerStorage?.get?.(['keepAlive']).then(r=>{const v=r?.keepAlive;if(v&&typeof v==='object')cfg={call:v.call!==false,chat:v.chat!==false,minutes:MINUTES.includes(Number(v.minutes))?Number(v.minutes):45};}).catch(()=>{}).finally(()=>{paint();tick();});
 paint();setInterval(tick,30000);
 globalThis.TylerKeepAlive=Object.freeze({config:()=>({...cfg}),watch,status:()=>$('kaStatus').textContent});
})();

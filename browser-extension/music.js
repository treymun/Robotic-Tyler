(()=>{
 // The desktop app's text-only (VB-CABLE) mode has no synthetic microphone here to play music into.
 if(globalThis.TylerPlatform?.music===false)return;
 const desktop=globalThis.TylerPlatform?.id==='desktop';
 const api=globalThis.TylerCompanion,mount=(api?.getFeatureMount?.()||api?.getMount?.());if(!mount)return;
 const root=document.createElement('details');root.className='feature';root.innerHTML=`<summary><span class="feature-title">Music DJ</span><span class="feature-meta">YouTube to voice</span></summary><p>Keep Tyler’s AI in Text mode. ${desktop?'Music plays in a separate YouTube window, and only that window&rsquo;s sound goes into the call.':'Music uses a separate YouTube tab and your explicit Chrome tab-audio share.'}</p><div class="actions"><button id="musicOpen">1 · Open YouTube music ${desktop?'window':'tab'}</button><button id="musicShare">2 · Share that ${desktop?'window':'tab'}’s audio</button><button id="musicEnd">Stop music & sharing</button></div><p>${desktop?'Share sends the YouTube window&rsquo;s sound into the call: never your screen, Steam or other apps. Keep that window open. YouTube may require a Play click or consent before playback.':'Select the YouTube tab in Chrome’s picker and enable Share tab audio. Do not select Steam or your entire desktop. Keep the player tab open. YouTube may require a Play click or consent before playback.'}</p><label>Song request<input id="musicQuery" placeholder="Artist — song title" maxlength="160"></label><div class="actions"><button id="musicAdd">Add request as DJ host</button><button id="musicSkip">Skip now · DJ control</button><button id="musicClear">Clear waiting queue</button><button id="musicReset">Reset music</button><button id="musicChatLock">Pause chat music commands</button></div><label>Music volume<input id="musicVolume" type="range" min="0" max="200" value="35"><small id="musicVolumeLabel">35% · up to 200% boost; music only</small></label><p id="musicStatus" role="status">Music is off. The bot must be joined to Steam voice for friends to hear it.</p><p id="musicSender" role="status">Sender check · v2.3.26: waiting for a new chat message. Shared with trivia and other chat features.</p><button id="musicCheckSender">Check latest sender</button><p id="musicSolo">Solo skip checks the active voice member list when you vote.</p><pre id="musicQueue"></pre><small>Chat: !play ARTIST SONG · music skip (vote) · music pause · music resume · music stop · music clear · music reset · music queue · music now · music volume 35. Spam protection: one request per person every 5 seconds. Three waiting songs per person; turns rotate between requesters. Skip needs 2 votes, or 1 from the confirmed only listener in voice. Stop/reset still need 2 different people; the DJ can skip immediately from this panel. YouTube search selects the first regular result; ads, availability and autoplay rules still apply.</small>`;mount.append(root);
 const $=id=>root.querySelector('#'+id),dj={id:'panel:host',name:'DJ host'};
 let session=TylerMusic.createSession(),sharing=false,paused=false,region,scope=null,watcher,generation=0,chatRevision=0,pendingChat=0,chatLocked=false,tasks=Promise.resolve();const seen=new WeakMap(),lines=new WeakMap(),handledIDs=new Set(),spam=TylerMusic.createSpamGuard();
 function rememberLine(node,line){const row=node.closest?.('[data-messageid],[data-message-id],[data-msgid]'),id=row?.getAttribute('data-messageid')||row?.getAttribute('data-message-id')||row?.getAttribute('data-msgid');if(!id)return false;const key=String(id).slice(0,150)+'|'+line,old=handledIDs.has(key);handledIDs.add(key);while(handledIDs.size>2000)handledIDs.delete(handledIDs.values().next().value);return old;}
 const status=text=>$('musicStatus').textContent=text;
 const display=()=>{$('musicQueue').textContent=TylerMusic.queueCard(session.current,session.waiting);};
 const command=async(action,extra={})=>{let timer;try{const r=await Promise.race([chrome.runtime.sendMessage({type:'music:command',action,...extra}),new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('Music controller timed out. Use Reset music in the Music panel.')),15000);})]);if(!r?.ok)throw Error(r?.error||'Music controller unavailable');return r;}finally{clearTimeout(timer);}};
 let lastNotice=-Infinity,noticeTimer=null,pendingNotice=null;
 const cancelNotice=()=>{clearTimeout(noticeTimer);noticeTimer=null;pendingNotice=null;};
 const sendNotice=text=>{try{api.send(text);lastNotice=Date.now();}catch{status(text);}};
 const announce=(text,priority=0)=>{
  const delay=3000-(Date.now()-lastNotice);if(delay<=0){cancelNotice();sendNotice(text);return;}
  if(!pendingNotice||priority>=pendingNotice.priority)pendingNotice={text,priority,epoch:generation};
  if(!noticeTimer)noticeTimer=setTimeout(()=>{const notice=pendingNotice;noticeTimer=null;pendingNotice=null;if(notice?.epoch===generation)sendNotice(notice.text);},delay);
 };
 // One queue for requests, controls and player events; a skip/end race cannot start two songs.
 const schedule=(work,chat=false)=>{if(chat&&(chatLocked||pendingChat>=12)){status(chatLocked?'Chat music commands are paused. Use the Music panel.':'Music spam blocked: too many commands waiting.');return Promise.resolve();}const epoch=generation,revision=chatRevision;if(chat)pendingChat++;const run=tasks.catch(()=>{}).then(()=>{if(epoch===generation&&(!chat||revision===chatRevision&&!chatLocked))return work();});tasks=run.catch(e=>status(e.message)).finally(()=>{if(chat)pendingChat--;});return tasks;};
 const identify=node=>globalThis.TylerTriviaIdentity?.identify(node,region)||null;
 const identifyAccount=node=>globalThis.TylerTriviaIdentity?.identifyAccount(node,region)||null;
 const senderStatus=(speaker,account,node)=>{const loaded=node?.getAttribute?.('data-tyler-sender-bridge')==='2.3.26';$('musicSender').textContent=account?'Sender check · v2.3.26: '+account.name+' · ready for skip/stop votes.':'Sender check · v2.3.26: '+(speaker?speaker.name+' · name only; account votes cannot count yet.':'Sender not detected.')+(loaded?' Updated message reader is loaded.':' Close and reopen Steam chat to load the updated message reader.');};
 function reset(){generation++;chatRevision++;cancelNotice();session=TylerMusic.createSession();paused=false;display();}
 async function next(){
  if(paused||!sharing||api.isOwner?.()===false||session.current)return;
  const track=session.next();display();
  if(!track){status('Queue finished. Add a song with !play artist song.');await command('stop').catch(()=>{});return;}
  const epoch=generation;status('Searching YouTube: '+track.query);
  try{await command('play',{query:track.query,token:track.token});}catch(e){if(epoch===generation){session.finish(track.token);display();status(e.message);}}
 }
 async function skip(){
  const track=session.current;if(!track)return status('Nothing is playing to skip.');
  const epoch=generation;await command('stop').catch(()=>{});if(epoch!==generation)return;
  session.finish(track.token);paused=false;await next();
 }
 async function action(m,speaker=null,local=false,node=null){
  if(api.isOwner?.()===false)return status('Take over this Steam tab before controlling music.');
  if(m.action==='play'){
   if(!sharing)return status('Share the YouTube tab’s audio from the Music panel first.');
   const added=session.add(m.query,speaker);if(added.error)return announce('🎵 '+added.error);
   display();if(!session.current&&!paused)await next();else announce('🎵 QUEUED\n'+added.song.query+'\n👤 '+added.song.requester.name+' · turn '+added.position+'\n🔄 Fair turns · up to 3 waiting songs per person');return;
  }
  if(m.action==='volume'){$('musicVolume').value=m.value;$('musicVolumeLabel').textContent=m.value+'% · music only';api.bridge('music-volume',{volume:m.value/100});return;}
  if(m.action==='help')return announce('🎧 TYLER DJ\n!play ARTIST SONG · music skip (2 votes; confirmed solo listener needs 1)\nmusic stop / reset (2 stop votes) · music pause / resume / queue / now\nmusic clear: clear waiting songs\nmusic volume 0–200 · max 3 waiting songs per person\nVotes need 2 different people. DJ panel controls are immediate.');
  if(m.action==='queue')return announce(TylerMusic.queueCard(session.current,session.waiting));
  if(m.action==='now')return announce(TylerMusic.nowCard(session.current,session.waiting));
  if(m.action==='clear'){chatRevision++;cancelNotice();const removed=session.clear();display();const text='🧹 Cleared '+removed+' waiting song'+(removed===1?'':'s')+'.'+(session.current?' The current song keeps playing.':'');status(text);announce(text,1);return;}
  if(m.action==='stop'||m.action==='reset'){
   if(!local){const vote=session.vote(speaker,'stop');if(vote.error)return announce('🎵 '+vote.error);if(vote.duplicate)return status('Your stop vote already counts ('+vote.count+'/'+vote.needed+').');const text='🗳 STOP VOTE · '+vote.count+'/'+vote.needed+'\n'+vote.name+(vote.skip?' · vote passed. Stopping music and clearing the queue!':' voted to stop music. Type music stop to vote.');status(text);if(!vote.skip){announce(text,1);return;}}
   generation++;chatRevision++;cancelNotice();session.stop();paused=false;display();await command('stop').catch(()=>{});const text='Music '+(m.action==='reset'?'reset: playback stopped, queue and skip votes cleared.':'stopped; queue and skip/stop votes cleared.')+' Tab sharing remains ready for new requests.';status(text);if(m.action==='reset'||!local)announce((local?'🔄 ':'🗳 STOP VOTE · 2/2\n')+text,1);return;
  }
  if(m.action==='skip'){
   if(local)return skip();
   let soloId=null,voiceKnown=false,voiceCount=null;const epoch=generation,track=session.current?.token;
   if(node&&globalThis.TylerSteamChat)try{const v=await TylerSteamChat.request(node,'voice');voiceKnown=v.known===true;voiceCount=v.otherCount;if(voiceKnown&&voiceCount===1)soloId=v.soloId;}catch{}
   if(epoch!==generation||track!==session.current?.token)return;
   $('musicSolo').textContent=voiceKnown?'Voice listeners besides Tyler: '+voiceCount+'. '+(soloId?'Only that listener can skip with one vote.':'Two skip votes required.'):'Voice count unconfirmed: two skip votes required. Keep the active voice channel visible.';
   const vote=session.vote(speaker,'skip',{soloId});if(vote.error)return announce('🎵 '+vote.error);
   if(vote.duplicate&&!vote.skip)return status('Your skip vote already counts ('+vote.count+'/'+vote.needed+').');
   announce(vote.needed===1?'🎧 SOLO SKIP\n'+vote.name+' is the only listener in voice. Skipping!':'🗳 SKIP VOTE · '+vote.count+'/'+vote.needed+'\n'+vote.name+(vote.skip?' · vote passed. Skipping!':' voted to skip. Type music skip to vote.'));
   display();if(vote.skip)await skip();return;
  }
  if(m.action==='pause'){paused=true;await command('pause',{token:session.current?.token});return status('Music paused.');}
  if(m.action==='resume'){paused=false;if(session.current)await command('resume',{token:session.current.token});else await next();status('Music resumed.');}
 }
 $('musicOpen').onclick=()=>schedule(async()=>{await command('open');session.stop();display();status('Return here and select Share that tab’s audio.');});
 $('musicShare').onclick=()=>api.bridge('music-capture',{volume:Number($('musicVolume').value)/100});
 $('musicEnd').onclick=()=>{reset();sharing=false;api.bridge('music-disconnect');void command('stop').catch(()=>{});status('Music and sharing stopped.');};
 $('musicSkip').onclick=()=>schedule(()=>action({action:'skip'},dj,true));
 $('musicClear').onclick=()=>void action({action:'clear'},dj,true).catch(e=>status(e.message));
 $('musicReset').onclick=()=>void action({action:'reset'},dj,true).catch(e=>status(e.message));
 $('musicChatLock').onclick=()=>{chatLocked=!chatLocked;chatRevision++;cancelNotice();$('musicChatLock').textContent=chatLocked?'Resume chat music commands':'Pause chat music commands';status(chatLocked?'Chat music commands paused. Music keeps playing; panel controls still work.':'Chat music commands resumed. Spam protection stays on.');};
 $('musicCheckSender').onclick=()=>{const sample=api.getSample?.(),selector=sample&&TylerSelection.selector(sample),node=selector&&region?Array.from(region.querySelectorAll(selector)).filter(n=>!TylerChatTag.own((n.innerText||n.textContent||'').trim(),globalThis.TylerIdentity?.meta?.(n))).at(-1):null;senderStatus(identify(node),identifyAccount(node),node);};
 $('musicVolume').oninput=()=>{$('musicVolumeLabel').textContent=$('musicVolume').value+'% · music only';api.bridge('music-volume',{volume:Number($('musicVolume').value)/100});};
 $('musicAdd').onclick=()=>{const query=$('musicQuery').value.trim();if(query.length>=2)void schedule(()=>action({action:'play',query},dj,true));};
 window.addEventListener('message',event=>{if(event.source!==window||event.origin!==location.origin||event.data?.source!=='tyler-music-status')return;sharing=event.data.shared===true;status(event.data.text);if(!sharing){paused=true;void command('pause',{token:session.current?.token}).catch(()=>{});}else paused=false;});
 chrome.runtime.onMessage.addListener(m=>{
  if(m?.source==='tyler-lease-lost'||m?.type==='v22:stop'){reset();sharing=false;api.bridge('music-disconnect');void command('stop').catch(()=>{});return;}
  if(m?.source!=='tyler-music-event')return;
  void schedule(async()=>{
   const track=session.current;if(!track||m.token!==track.token)return;
   if(m.event==='playing'){track.title=String(m.title||track.query).slice(0,160);status('Playing: '+track.title);display();if(!track.reported){track.reported=true;announce(TylerMusic.nowCard(track,session.waiting),2);}}
   if(m.event==='ended'){session.finish(track.token);await next();}
   if(m.event==='blocked')status('Click Play in the YouTube tab once, then use music resume.');
   if(m.event==='error')status('YouTube could not play this video. Use music skip or the DJ’s Skip now button.');
  });
 });
 api.musicConsumesText=text=>!!TylerMusic.parse(text);globalThis.TylerCommands?.set('music',{enabled:()=>!chatLocked});
 // Steam can insert a message body just before its author header.
 async function fromChat(m,node,boundRegion){
  const epoch=generation,revision=chatRevision;let account=identifyAccount(node),speaker=account||identify(node);for(let attempt=0;(!speaker||(['skip','stop','reset'].includes(m.action)&&!account))&&attempt<4;attempt++){await new Promise(r=>setTimeout(r,100));if(epoch!==generation||revision!==chatRevision||chatLocked||region!==boundRegion||!boundRegion.contains(node))return;account=identifyAccount(node);speaker=account||identify(node);}
  if(epoch!==generation||revision!==chatRevision||chatLocked||region!==boundRegion||!boundRegion.contains(node))return;senderStatus(speaker,account,node);const allowed=spam.allow(m.action,account);if(!allowed.ok)return status(allowed.reason);await action(m,['skip','stop','reset'].includes(m.action)?account:speaker,false,node);
 }
 function bind(){
  const nextRegion=api.getRegion?.(),sample=api.getSample?.();if(!nextRegion?.isConnected||!sample?.isConnected||api.isOwner?.()===false){watcher?.disconnect();region=null;return;}
  const nextScope=api.getChatScope?.()||nextRegion;
  if(scope!==null&&scope!==nextScope){reset();handledIDs.clear();void command('stop').catch(()=>{});status('Chat changed. Music queue cleared for the new room.');}scope=nextScope;
  if(region===nextRegion)return;
  watcher?.disconnect();region=nextRegion;const selector=TylerSelection.selector(sample);if(!selector)return;
  for(const node of region.querySelectorAll(selector)){const text=(globalThis.TylerChatBus?.text(node)??(node.innerText||node.textContent||'').trim()),history=text.split('\n').map(s=>s.trim());seen.set(node,text);lines.set(node,new Set(history));for(const line of history)rememberLine(node,line);}
  watcher=new (globalThis.TylerChatBus?.Observer||MutationObserver)(records=>{const nodes=new Set(),collect=raw=>{const n=raw.nodeType===1?raw:raw.parentElement;if(!n)return;if(n.matches?.(selector))nodes.add(n);for(const sub of n.querySelectorAll?.(selector)||[])nodes.add(sub);const parent=n.closest?.(selector);if(parent)nodes.add(parent);};
   for(const r of records){for(const n of r.addedNodes||[])collect(n);if(r.type==='characterData')collect(r.target);else{const parent=r.target?.closest?.(selector);if(parent)nodes.add(parent);}}
   for(const n of nodes){const text=(globalThis.TylerChatBus?.text(n)??(n.innerText||n.textContent||'').trim());if(!text||text.length>2000||seen.get(n)===text)continue;seen.set(n,text);if(TylerChatTag.own(text,globalThis.TylerIdentity?.meta?.(n)))continue;const done=lines.get(n)||new Set();lines.set(n,done);const boundRegion=region;
    senderStatus(identify(n),identifyAccount(n),n);
    for(const line of text.split('\n').map(s=>s.trim())){if(done.has(line))continue;done.add(line);if(rememberLine(n,line))continue;const m=TylerMusic.parse(line);if(m)void schedule(()=>fromChat(m,n,boundRegion),true);}
   }
  });watcher.observe(region,{subtree:true,childList:true,characterData:true});
 }
 display();setInterval(bind,1000);setInterval(()=>{const track=session.current;if(track&&!track.reported&&Date.now()-track.started>45000)status('Still waiting for YouTube. Check its player tab for consent, ads, an unavailable video or an autoplay prompt.');},5000);
})();

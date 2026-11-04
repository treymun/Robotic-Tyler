(() => {
 'use strict';const api=globalThis.TylerCompanion,mount=api?.getSoundboardMount?.();if(!mount)return;const ic=n=>globalThis.TylerIcons?.svg?.(n)||'';const root=document.createElement('section');mount.append(root);root.innerHTML=`<div class="board-top"><div><h2>Soundboard</h2></div><button id="boardStop" class="danger sm">${ic('stop')}Stop clips</button></div><div class="deck-entry"><div><b>Soundboard only</b><span>Join voice on the bot account. Friends trigger clips from group text.</span></div><button id="startDeck">${ic('play')}Connect soundboard</button></div><label><input id="enabled" type="checkbox" checked>Chat sound commands enabled</label><p id="boardStatus">Connect a chat in Setup to listen for sound commands.</p><details class="cue-sheet"><summary>Chat command card</summary><p>Copy the current sounds for your group. Each command plays one clip.</p><textarea id="commandCard" readonly rows="5" aria-label="Current sound commands"></textarea><button id="copyCard">Copy commands</button><small id="copyStatus" role="status"></small></details><label>Sound bank<select id="bank"><option>Arcade</option><option>Inside jokes</option><option>Music cues</option></select></label><details class="arcade-lobby feature"><summary><span class="feature-title">Arcade</span><span class="feature-meta">Chat games</span></summary><h3>The room plays together.</h3><p>One shared round at a time. Anyone in this chat can guess.</p><div class="arcade-tickets"><div><b>Trivia blitz</b><code>!game trivia</code><small>96 questions across eight categories. Solo or group race.</small></div><div><b>Crack the vault</b><code>!game vault</code><small>Find the hidden number from higher or lower clues.</small></div><div><b>Word scramble</b><code>!game scramble</code><small>Race the clock to untangle a word.</small></div><div><b>Face Tyler</b><code>!game rps rock</code><small>Choose rock, paper, or scissors.</small></div></div><p>Start with <code>play vault</code>, <code>play trivia</code>, <code>play hangman</code>, <code>play math</code>, <code>play riddle</code>, <code>play reverse</code>, <code>play scramble</code> or <code>play rps</code>. Answer with a number, letter, choice or word. During a round: <code>hint</code>, <code>skip</code>, <code>stop game</code>, then <code>play again</code>. Old !game commands still work.</p><div class="actions"><label>Start a round<select id="arcadePick"><option value="vault">Vault</option><option value="scramble">Scramble</option><option value="trivia">Trivia</option><option value="hangman">Hangman</option><option value="math">Quick math</option><option value="riddle">Riddles</option><option value="reverse">Reverse code</option><option value="rps">Rock paper scissors</option></select></label><button id="arcadeStart" type="button">Play</button><button id="arcadeHint" type="button">Hint</button><button id="arcadeStop" type="button">End round</button></div><small>These controls post the round to your connected chat. Chat answers are text only.</small><div class="actions"><label>Trivia mode<select id="triviaMode"><option value="solo">Solo</option><option value="group" selected>Group race</option></select></label><label>Category<select id="triviaCategory"><option value="mixed">Mixed categories</option><option value="science">🔬 Science</option><option value="history">🏛️ History</option><option value="geography">🌍 Geography</option><option value="entertainment">🎬 Movies & TV</option><option value="music">🎵 Music</option><option value="sports">⚽ Sports</option><option value="arts">🎨 Art & Books</option><option value="food">🍕 Food & Drink</option><option value="gaming">🎮 Gaming</option><option value="nature">🐾 Animals & Nature</option></select></label><label>Difficulty<select id="triviaLevel"><option value="any">Any</option><option value="easy">Easy</option><option value="medium">Medium</option><option value="hard">Hard</option></select></label><label>Questions<select id="triviaLength"><option value="5">5 · quick</option><option value="10" selected>10</option><option value="15">15</option><option value="20">20 · marathon</option></select></label><button id="triviaLaunch">Start trivia in chat</button></div><small>500 questions in 10 categories. Questions, scores and the final results appear in Steam chat, and the next question follows on its own. Friends can type next, hint, scores or stop game; use Name: B if Steam does not show who answered.</small><p id="arcadeScore" class="marquee">Room clears: 0</p><div class="arcade-meta"><span id="arcadeLevel">Level 1 · Rookie</span><span id="arcadeXP">0 XP</span></div><div class="arcade-progress"><span id="arcadeProgress"></span></div><div class="badge-row"><span id="badgeRookie" class="arcade-achievement">⚡ First clear</span><span id="badgeTriple" class="arcade-achievement">🏅 Triple threat</span><span id="badgeVeteran" class="arcade-achievement">👑 Arcade veteran</span></div><details><summary>Local leaderboard (verified friends)</summary><ol id="arcadeLeaderboard"></ol><button id="clearArcadeScores" type="button">Clear local arcade statistics</button><small>Only confirmed Steam IDs count toward the leaderboard. Unverified players can still participate.</small></details><label><input id="gameAI" type="checkbox"> Add AI commentary (uses your selected provider)</label></details><p>Tap a pad to play to the room. Hold to audition privately and release to stop.</p><div class="pad-deck"><div class="bank-rail" role="group" aria-label="Sound banks"></div><div id="pads" class="pads"></div></div><div class="board-tools"><label>${ic('sounds')}Clip volume<input id="boardVolume" type="range" min="0" max="1" step="0.05" value="0.6"><small id="boardVolumeLabel">60% · AI volume stays unchanged</small></label></div><details><summary>Edit or add a sound</summary><label>Slot<select id="slot">${Array.from({length:10},(_,i)=>'<option value="'+(i+1)+'">Sound '+(i+1)+'</option>').join('')}</select></label><label>Name / text trigger<input id="clipName" type="text" maxlength="50" placeholder="For example: victory"></label><button id="rename">Save name</button><label>Exact chat command<input id="trigger" maxlength="40" placeholder="For example: !airhorn"></label><button id="saveTrigger">Save command</button><small>Friends type this phrase by itself. Leave blank to use only numbered and named commands.</small><label>Replace the audio<input id="upload" type="file" accept="audio/*"></label><small>Up to 512 KB / 12 seconds. Saved in this browser profile.</small><button id="pin">Pin favorite</button><button id="play">${ic('play')}Play to room</button><button id="restore">Reset or remove slot</button></details><details><summary>Who can trigger sounds?</summary><label>Chat permissions<select id="access"><option value="everyone">Everyone in the selected chat</option><option value="selected">Selected confirmed accounts</option></select></label><label>Allowed Steam account IDs<textarea id="allowedIDs" rows="3" placeholder="One 17-digit Steam account ID per line"></textarea></label><small>Restricted mode blocks unconfirmed senders. Display names do not grant access. The local play pads remain available to you.</small><button id="saveAccess">Save permissions</button></details><small>Type a numbered command, a sound name after “sound”, or the exact custom command. One clip at a time, with a 3-second cooldown. Audio mixes with AI speech and uses no AI credits.</small><pre id="slots" hidden></pre>`;
 const $=id=>root.querySelector('#'+id);let dirtyAccess=false;let prefs={volume:.6,access:'everyone',allowedIDs:''};let watched=null,watcher=null,selector=null,last=0,epoch=0,pending=false;let seen=new WeakMap();const ids=new Set();let arcadeState={};let arcadeStats={total:0,winners:{}};

 const status=s=>$('boardStatus').textContent=s;
 async function loadArcadeStats(){try{const {tylerArcadeStats={}}=await TylerStorage.get('tylerArcadeStats');arcadeStats={total:Math.max(0,Number(tylerArcadeStats.total)||0),winners:tylerArcadeStats.winners||{}};updateArcadeStats();}catch{}}
 function updateArcadeStats(){const n=arcadeStats.total;const level=Math.floor(n/5)+1;const xp=n*20;$('arcadeLevel').textContent='Level '+level+' · '+(level>=5?'Legend':level>=3?'Veteran':level>=2?'Regular':'Rookie');$('arcadeXP').textContent=xp+' XP';$('arcadeProgress').style.width=((n%5)/5*100)+'%';$('badgeRookie').classList.toggle('earned',n>=1);$('badgeTriple').classList.toggle('earned',n>=3);$('badgeVeteran').classList.toggle('earned',n>=10);const board=$('arcadeLeaderboard');board.replaceChildren();for(const [id,e] of Object.entries(arcadeStats.winners).sort((a,b)=>b[1].wins-a[1].wins).slice(0,8)){const li=document.createElement('li');li.textContent=e.name+' · '+e.wins+' clears';li.title=id;board.append(li);}if(!board.children.length){const li=document.createElement('li');li.textContent='No verified winners yet';board.append(li);}}
 async function recordArcadeWin(speaker){arcadeStats.total++;if(speaker&&/^7656119\d{10}$/.test(speaker.id)){const entry=arcadeStats.winners[speaker.id]||{wins:0,name:speaker.name};entry.name=speaker.name;entry.wins++;arcadeStats.winners[speaker.id]=entry;}await TylerStorage.set({tylerArcadeStats:arcadeStats});updateArcadeStats();}
 $('clearArcadeScores').onclick=async()=>{arcadeStats={total:0,winners:{}};await TylerStorage.remove('tylerArcadeStats');updateArcadeStats();status('Arcade statistics cleared from this local profile.');};

 async function ask(m){const r=await chrome.runtime.sendMessage(m);if(!r?.ok)throw Error(r?.error||'Soundboard unavailable');return r;}
 async function refresh(){try{const r=await ask({type:'soundboard:list'});TylerSoundboard.slots=r.slots;prefs=r.preferences||prefs;const favorites=r.favorites||[];TylerSoundboard.favorites=favorites;$('bank').value=r.boardBank||'Arcade';for(const b of root.querySelectorAll('.bank-tab'))b.setAttribute('aria-pressed',String(b.dataset.bank===$('bank').value));
 $('commandCard').value=r.slots.map(item=>(item.trigger||'sound '+item.slot)+'  —  '+item.name).join('\n');
 $('copyStatus').textContent='';
 const selected=$('slot').value;
 const free=Array.from({length:22},(_,i)=>i+11).find(n=>!r.slots.some(item=>item.slot===n));
 $('slot').replaceChildren(...r.slots.map(item=>new Option(item.slot+' · '+item.name,item.slot)));
 if(free)$('slot').add(new Option('+ Add a new clip',free));
 if([...$('slot').options].some(o=>o.value===selected))$('slot').value=selected;
 $('slot').onchange=()=>{const item=r.slots.find(s=>s.slot===Number($('slot').value));$('trigger').value=item?.trigger||'';$('clipName').value=item?.name||'';$('pin').textContent=favorites.includes(item?.slot)?'Unpin favorite':'Pin favorite';for(const id of ['pin','saveTrigger','rename','play','restore'])$(id).disabled=!item;};
 $('slot').onchange();$('boardVolume').value=prefs.volume;$('boardVolumeLabel').textContent=Math.round(prefs.volume*100)+'% · AI volume stays unchanged';if(!dirtyAccess){$('access').value=prefs.access;$('allowedIDs').value=prefs.allowedIDs;}const pads=$('pads');pads.replaceChildren();for(const item of [...r.slots].sort((a,b)=>Number(favorites.includes(b.slot))-Number(favorites.includes(a.slot)))){const button=document.createElement('button'),label=document.createElement('span'),name=document.createElement('b');button.className='pad';button.setAttribute?.('data-slot',String(item.slot));button.setAttribute?.('data-n',String(item.slot).padStart(2,'0'));if(favorites.includes(item.slot))button.setAttribute?.('data-fav','true');label.textContent=(favorites.includes(item.slot)?'★ Favorite ':'Sound ')+String(item.slot);name.textContent=item.name;button.append(label,name);button.title=(item.trigger?'Type '+item.trigger+' or ':'')+'Type sound '+TylerSoundboard.slug(item.name)+' or sound '+item.slot+(item.cue?'. '+item.cueTheme+' sound: '+item.cue:'');if(item.cue)button.setAttribute?.('data-cue',item.cue);wirePad(button,item.slot);pads.append(button);}$('slots').textContent=r.slots.map(x=>'sound '+x.slot+' · '+x.name+(x.custom?' (uploaded)':x.cue?' ('+x.cueTheme+': '+x.cue+')':'')).join('\n');}catch(e){status(e.message);}}
 let preview,previewContext,previewTurn=0;
 function endPreview(){previewTurn++;preview?.stop();}
 function wirePad(button,slot){
   let timer,held=false;
   button.onpointerdown=e=>{
     if(e.button!==0)return;
     button.setPointerCapture(e.pointerId);held=false;endPreview();
     const turn=previewTurn;
     previewContext??=new AudioContext();void previewContext.resume().catch(()=>{});
     timer=setTimeout(async()=>{held=true;try{
       const r=await ask({type:'soundboard:play',slot});if(turn!==previewTurn)return;
       preview=new TylerBoardAudio(previewContext,previewContext.destination);await preview.play(r);
     }catch(error){status(error.message);}},350);
   };
   button.onpointerup=button.onpointercancel=button.onlostpointercapture=()=>{clearTimeout(timer);endPreview();};
   button.oncontextmenu=e=>e.preventDefault();
   button.onclick=()=>{if(!held)void play(slot);held=false;};
 }
 const rail=root.querySelector('.bank-rail'),bankPick=$('bank');
 // A category rail mirroring the Sound bank picker (v2.18). Hidden unless a theme lays the soundboard
 // out as a spawn menu; the picker stays the source of truth.
 const syncRail=()=>{for(const b of rail.children)b.setAttribute('aria-pressed',String(b.dataset.bank===bankPick.value));};
 for(const o of bankPick.options){const b=document.createElement('button');b.type='button';b.className='bank-tab';b.dataset.bank=o.value||o.textContent;b.textContent=o.textContent;
  b.onclick=()=>{if(bankPick.value===b.dataset.bank)return;bankPick.value=b.dataset.bank;bankPick.dispatchEvent(new Event('change'));syncRail();};rail.append(b);}
 bankPick.addEventListener('change',syncRail);syncRail();
 $('bank').onchange=async()=>{try{endPreview();epoch++;await ask({type:'soundboard:bank',bank:$('bank').value});await refresh();}catch(e){status(e.message);}};
 $('pin').onclick=async()=>{try{await ask({type:'soundboard:pin',slot:Number($('slot').value)});await refresh();}catch(e){status(e.message);}};
 async function play(slot,fromChat=false,speaker=null,game=null){if(pending){status('Sound trigger skipped while loading the previous clip.');return;}if(fromChat&&!game&&Date.now()-last<3000){status('Sound trigger skipped — 3-second cooldown.');return;}pending=true;const current=epoch;try{const r=await ask({type:'soundboard:play',slot,fromChat,speaker});if(current!==epoch||!$('enabled').checked&&fromChat)return;if(!game||Date.now()-last>=3000){last=Date.now();api.bridge('board-play',{slot:r.slot,clip:r.clip,volume:r.volume});status('Requested sound '+slot+' in voice.');api.emit?.('sound',{slot,name:TylerSoundboard.slots?.find?.(s=>s.slot===slot)?.name||'Sound '+slot});}
 if(game){
   const region=watched,composer=api.getComposer();api.send(game.text);const previousWins=Number(arcadeState.wins||0);arcadeState=game.next;$('arcadeScore').textContent='Room clears: '+arcadeState.wins;if(Number(arcadeState.wins||0)>previousWins)await recordArcadeWin(speaker);
   if($('gameAI').checked&&[4,5].includes(game.slot)){
     try{const reply=await ask({type:'command',text:'ask Give a short game-show quip about this result: '+game.text});
       if(reply.text&&epoch===current&&api.isOwner()&&api.getRegion()===region&&composer===api.getComposer()&&$('gameAI').checked)api.send(reply.text);
     }catch(e){status('Game finished. Commentary unavailable: '+e.message);}
   }
 }}catch(e){status(e.message);}finally{pending=false;}}
 let gameTasks=Promise.resolve(),queuedTasks=0;const handledLines=new WeakMap(),gameplayLines=new Map(),messageLines=new Set();
 function enqueue(text,speaker=null,fromChat=true,triviaSpeaker=speaker,resolveTrivia=null){
  if(queuedTasks>=20)return;const turn=epoch;queuedTasks++;
  gameTasks=gameTasks.catch(()=>{}).then(async()=>{
   if(turn!==epoch||api.isOwner?.()===false)return;
   // Steam can paint the message text just before its author header.
   if(!triviaSpeaker&&resolveTrivia&&(arcadeState.trivia||/trivia/i.test(text))){
    for(let retry=0;retry<4&&!triviaSpeaker;retry++){await new Promise(resolve=>setTimeout(resolve,100));if(turn!==epoch)return;triviaSpeaker=resolveTrivia();}
   }
   // The same account reader supplies score credit and selected-account sound
   // access after delayed author markup has arrived.
   if(resolveTrivia){triviaSpeaker=resolveTrivia()||triviaSpeaker;speaker=globalThis.TylerIdentity?.valid(triviaSpeaker)||speaker;}
   const game=TylerSoundboard.arcade(text,arcadeState,Math.random,Date.now(),triviaSpeaker);
   if(game)gameplayLines.set(text,Date.now());for(const [line,at]of gameplayLines)if(Date.now()-at>10000)gameplayLines.delete(line);
   const slot=game?.slot||TylerSoundboard.parse(text);if(slot)await play(slot,fromChat,speaker,game);
  }).catch(e=>status(e.message)).finally(()=>queuedTasks--);
 }
 api.arcadeRecentlyHandled=text=>String(text).split('\n').some(line=>Date.now()-Number(gameplayLines.get(line.trim())||0)<10000);
 api.arcadeConsumesText=text=>!!TylerSoundboard.arcade(text,arcadeState);globalThis.TylerCommands?.set('arcade',{enabled:()=>$('enabled').checked,match:text=>!!TylerSoundboard.arcade(text,arcadeState)});globalThis.TylerCommands?.set('sounds',{enabled:()=>$('enabled').checked});
 for(const [id,command]of [['arcadeHint','hint'],['arcadeStop','stop game']])$(id).onclick=()=>enqueue(command,null,false);
 setInterval(()=>{if(TylerSoundboard.triviaDue?.(arcadeState,Date.now())&&api.isOwner?.()&&watched?.isConnected&&!pending&&queuedTasks===0)enqueue('!trivia tick',null,false);},1000);
 $('triviaLaunch').onclick=()=>{if(!api.getRegion()?.isConnected||!api.getComposer()?.isConnected)return status('Connect this Steam chat first.');enqueue(['play trivia',$('triviaMode').value,$('triviaCategory').value,$('triviaLevel').value,$('triviaLength').value].join(' '),null,false);};
 $('arcadeStart').onclick=()=>{if(!api.getRegion()?.isConnected||!api.getComposer()?.isConnected)return status('Connect this Steam chat first.');enqueue('play '+$('arcadePick').value,null,false);};
 function bind(){
  const region=api.getRegion(),nextSelector=TylerSelection.selector(api.getSample());
  if(api.connecting||api.setupCancelled||api.isOwner?.()===false||!$('enabled').checked||!region?.isConnected||!nextSelector){if(watched){epoch++;watcher?.disconnect();watched=null;}return;}
  if(watched===region&&selector===nextSelector)return;
  epoch++;watcher?.disconnect();watched=region;arcadeState={};$('arcadeScore').textContent='Room clears: 0';selector=nextSelector;ids.clear();seen=new WeakMap();
  const stable=n=>{const row=n.closest?.('[data-messageid],[data-message-id]');return row?.getAttribute('data-messageid')||row?.getAttribute('data-message-id')||'';};
  const mark=n=>{const text=(globalThis.TylerChatBus?.text(n)??(n.innerText||n.textContent||'').trim());seen.set(n,text);handledLines.set(n,new Set(text.split('\n').map(s=>s.trim())));const id=stable(n);if(id)for(const line of text.split('\n'))messageLines.add(id+'|'+line.trim());};
  for(const n of region.querySelectorAll(selector))mark(n);
  watcher=new (globalThis.TylerChatBus?.Observer||MutationObserver)(records=>{
   if(!$('enabled').checked||!watched?.isConnected)return;
   const nodes=new Set(),collect=raw=>{const n=raw.nodeType===1?raw:raw.parentElement;if(!n)return;if(n.matches?.(selector))nodes.add(n);for(const child of n.querySelectorAll?.(selector)||[])nodes.add(child);const parent=n.closest?.(selector);if(parent)nodes.add(parent);};
   for(const record of records){for(const node of record.addedNodes||[])collect(node);if(record.type==='characterData')collect(record.target);else{const parent=record.target?.closest?.(selector);if(parent)nodes.add(parent);}}
   for(const n of nodes){
    const text=(globalThis.TylerChatBus?.text(n)??(n.innerText||n.textContent||'').trim());if(!text||text.length>2000||seen.get(n)===text)continue;seen.set(n,text);
    // Tyler's own cards and replies are never read back as answers (Steam's sender record, what he just sent, or his tag).
    if(TylerChatTag.own(text,globalThis.TylerIdentity?.meta?.(n)))continue;
    const handled=handledLines.get(n)||new Set();handledLines.set(n,handled);
    for(const line of text.split('\n').map(s=>s.trim())){
     if(!line||line.length>240||handled.has(line)||TylerChatTag.own(line))continue;
     handled.add(line);const id=stable(n),key=id+'|'+line;if(id&&messageLines.has(key))continue;if(id)messageLines.add(key);while(messageLines.size>2000)messageLines.delete(messageLines.values().next().value);enqueue(line,globalThis.TylerIdentity?.speaker(n,watched)||null,true,globalThis.TylerTriviaIdentity?.identify(n,watched)||null,()=>globalThis.TylerTriviaIdentity?.identify(n,region)||null);
    }
   }
  });watcher.observe(region,{subtree:true,childList:true,characterData:true});
  status('Arcade connected — type play trivia or choose a game. Answers need no !game prefix.');
 }
 $('copyCard').onclick=async()=>{
   const card=$('commandCard');
   if(!card.value){$('copyStatus').textContent='The sound list is still loading.';return;}
   try{await navigator.clipboard.writeText(card.value);$('copyStatus').textContent='Copied. Paste it into your group chat.';}
   catch{card.focus();card.select();$('copyStatus').textContent='Press Ctrl+C to copy the selected commands.';}
 };
 $('startDeck').onclick=()=>api.startSoundboard?.();
 api.enableBoardTriggers=()=>{$('enabled').checked=true;};
 // Theme features (v2.20): play a slot like its pad button does, and list the slots and favorites.
 api.playSound=slot=>play(Number(slot));api.listSounds=()=>({slots:(TylerSoundboard.slots||[]).map(s=>({slot:s.slot,name:s.name})),favorites:[...(globalThis.TylerSoundboard?.favorites||[])]});
 $('access').onchange=()=>dirtyAccess=true;$('allowedIDs').oninput=()=>dirtyAccess=true;
 $('saveTrigger').onclick=async()=>{try{await ask({type:'soundboard:trigger',slot:Number($('slot').value),trigger:$('trigger').value});await refresh();status('Chat command saved.');}catch(e){status(e.message);}};
 $('rename').onclick=async()=>{try{await ask({type:'soundboard:rename',slot:Number($('slot').value),name:$('clipName').value});await refresh();status('Sound name saved — numbered triggers still work.');}catch(e){status(e.message);}};
 $('boardVolume').oninput=()=>{prefs.volume=Number($('boardVolume').value);$('boardVolumeLabel').textContent=Math.round(prefs.volume*100)+'% · AI volume stays unchanged';};$('boardVolume').onchange=async()=>{try{await ask({type:'soundboard:preferences',values:prefs});status('Soundboard volume saved for the next clip.');}catch(e){status(e.message);}};
 $('saveAccess').onclick=async()=>{try{prefs={...prefs,access:$('access').value,allowedIDs:$('allowedIDs').value};await ask({type:'soundboard:preferences',values:prefs});dirtyAccess=false;status('Soundboard permissions saved.');}catch(e){status(e.message);}};
 $('enabled').onchange=()=>{epoch++;watcher?.disconnect();watched=null;if(!$('enabled').checked){api.bridge('board-stop');status('Chat soundboard off.');}bind();};
 $('play').onclick=()=>void play(Number($('slot').value));$('restore').onclick=async()=>{try{await ask({type:'soundboard:clear',slot:Number($('slot').value)});await refresh();status('Slot reset. Extra uploaded slots are removed.');}catch(e){status(e.message);}};
 $('boardStop').onclick=()=>{epoch++;api.bridge('board-stop');status('Soundboard stopped; AI speech stays enabled.');};
 $('upload').onchange=async()=>{const file=$('upload').files[0];if(!file)return;if(file.size>524288){status('Choose a clip no larger than 512 KB.');return;}const slot=Number($('slot').value),name=($('clipName').value.trim()||file.name).slice(0,60);let context;try{status('Checking clip…');context=new AudioContext();const bytes=await file.arrayBuffer(),decoded=await context.decodeAudioData(bytes.slice(0));if(decoded.duration>12||decoded.duration<=0)throw Error('Choose a clip 12 seconds or shorter.');let binary='';const data=new Uint8Array(bytes);for(let i=0;i<data.length;i+=8192)binary+=String.fromCharCode(...data.subarray(i,i+8192));await ask({type:'soundboard:save',slot,clip:{audio:btoa(binary),seconds:decoded.duration,name}});await refresh();status('Saved sound '+slot+' · '+name);}catch(e){status('Could not save clip: '+e.message);}finally{await context?.close();$('upload').value='';}};
 window.addEventListener('message',e=>{if(e.source===window&&e.origin===location.origin&&e.data?.source==='tyler-soundboard-status'){status(e.data.text);const playing=e.data.text.match(/^Playing sound (\d+)/);if(playing||/stopped|ready/i.test(e.data.text))for(const pad of root.querySelectorAll('.pad'))pad.classList.toggle('playing',!!playing&&pad.getAttribute('data-slot')===playing[1]);}});void refresh();void loadArcadeStats();setInterval(bind,1000);
 // v2.31: the built-in pads follow the theme; their tooltips say what the new theme's sounds are. (Nothing plays.)
 api.ui?.onUI?.(type=>{if(type==='theme')void refresh();});
})();


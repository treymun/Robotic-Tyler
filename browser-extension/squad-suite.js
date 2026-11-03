(()=>{
 'use strict';
 const api=globalThis.TylerCompanion,mount=(api?.getFeatureMount?.()||api?.getMount?.());if(!mount)return;
 const panel=document.createElement('details');panel.className='feature';
 panel.innerHTML=`<summary><span class="feature-title">Squad</span><span class="feature-meta">Party, votes, XP</span></summary>
 <p>Browser-first controls: votes, friend preferences, queue overview, lightweight diagnostics and quick reactions. Steam group voice uses the existing Chrome voice bridge.</p>
 <div class="btn-row"><button id="sqRefresh">Refresh status</button><button id="sqSettings">Settings</button></div>
 <div id="sqStatus" role="status">Open the Steam chat panel to see status.</div>
 <div id="sqStats"></div><h3>Party Host</h3><p>Approved friends: <code>!party start</code>, <code>!party join</code>, <code>!party teams</code>, <code>!party status</code>, <code>!party stop</code>. Only the host can assign teams or stop.</p><div id="sqParty"></div><h3>Game votes</h3>
 <div class="btn-row"><input id="sqVoteTitle" type="text" maxlength="110" placeholder="Game title"><button id="sqVoteHelp">Show vote command</button></div>
 <div id="sqVotes"></div><p><strong>Arcade:</strong> Friends can type <code>!trivia</code> and answer with <code>!answer 1</code> through <code>!answer 4</code> (requires enabled multiplayer trivia).</p><h3>Squad XP</h3><div id="sqLeaderboard"></div>
 <h3>Friend preferences (owner only)</h3><div class="btn-row"><input id="sqFriend" type="text" maxlength="17" placeholder="Verified Steam ID"><button id="sqFriendLoad">Load</button></div>
 <label>Nickname<input id="sqNickname" type="text" maxlength="60"></label>
 <label>Favorite game<input id="sqFavorite" type="text" maxlength="80"></label>
 <label>Conversation / coaching preference<textarea id="sqNote" maxlength="240" rows="2"></textarea></label>
 <label><input id="sqOptOut" type="checkbox"> Do not include these preferences in AI context</label>
 <div class="btn-row"><button id="sqFriendSave">Save profile</button><button id="sqFriendDelete">Delete profile</button></div>
 <h3>Quick personality events</h3><div class="btn-row"><button id="sqWin">Celebrate win</button><button id="sqLoss">Tough loss</button><button id="sqAchievement">Achievement</button></div>
 <small>Only posts when you press a button. Game request links still follow Game Hub rules; this feature cannot bypass provider restrictions.</small>`;
 mount.append(panel);const $=id=>panel.querySelector('#'+id),say=x=>{$('sqStatus').textContent=String(x).slice(0,340);},send=async m=>{const r=await chrome.runtime.sendMessage(m);if(!r?.ok)throw Error(r?.error||'Extension unavailable');return r;};
 const clean=s=>String(s||'').replace(/[\u0000-\u001f]/g,' ').trim().slice(0,110);
 async function refresh(){try{if(!api.isOwner?.())return;const r=await send({type:'suite:status'}),d=r.diagnostics||{},u=r.usage||{};
 $('sqStats').textContent=`AI key ${d.model?'✓':'missing'} · AI requests ${u.requests||0} · text cost $${Number(u.reportedCostUSD||0).toFixed(4)} (voice separate)`;
 $('sqParty').textContent=r.party?.active?'Game night active: '+(r.party.members?.length||0)+' players':'No active game night.';
 $('sqVotes').replaceChildren();for(const v of r.votes||[]){const p=document.createElement('p');p.textContent=`${v.title}: ${v.count} vote(s)`;$('sqVotes').append(p);}if(!(r.votes||[]).length)$('sqVotes').textContent='No votes yet.';
 $('sqLeaderboard').replaceChildren();for(const x of r.xp||[]){const p=document.createElement('p');p.textContent=`${x.id}: level ${x.level} (${x.xp} XP)`;$('sqLeaderboard').append(p);}if(!(r.xp||[]).length)$('sqLeaderboard').textContent='No votes or XP yet.';
 say('Chrome extension active. Voice works only if the existing Steam voice bridge is connected.');
 }catch(e){say(e.message);}}
 $('sqRefresh').onclick=refresh;$('sqSettings').onclick=()=>send({type:'settings'}).catch(e=>say(e.message));
 $('sqVoteHelp').onclick=()=>say('An approved friend can type !vote '+(clean($('sqVoteTitle').value)||'Example Game')+' in this Steam chat. Voting must be enabled in settings.');
 async function profile(action){const id=$('sqFriend').value.trim();if(!/^7656119\d{10}$/.test(id))return say('Enter a verified 17-digit Steam ID.');try{const r=await send({type:'suite:profile',action,id,profile:{nickname:$('sqNickname').value,favoriteGame:$('sqFavorite').value,note:$('sqNote').value,optOut:$('sqOptOut').checked}});if(action==='get'){for(const [i,v] of [['sqNickname','nickname'],['sqFavorite','favoriteGame'],['sqNote','note']])$(i).value=r.profile?.[v]||'';$('sqOptOut').checked=r.profile?.optOut===true;}say(action==='get'?'Profile loaded.':action==='save'?'Profile saved locally.':'Profile deleted.');}catch(e){say(e.message);}}
 $('sqFriendLoad').onclick=()=>profile('get');$('sqFriendSave').onclick=()=>profile('save');$('sqFriendDelete').onclick=()=>profile('remove');
 for(const [id,event] of [['sqWin','win'],['sqLoss','loss'],['sqAchievement','achievement']])$(id).onclick=async()=>{try{const r=await send({type:'suite:event',event});if(!await api.confirm({title:'Post this reaction?',text:'Tyler will post this to the connected Steam group: '+String(r.message||'').slice(0,240),confirm:'Post to Steam',cancel:'Not now'}))return;api.send(r.message);say('Reaction submitted to Steam.');}catch(e){say(e.message);}};
 const recently=new Map();let region=null,observer=null,lastCue=0,lastMessageAt=0,lastNudge=0,chatScope='';let featureFlags={};async function syncFlags(){try{const r=await send({type:'suite:status'});featureFlags=r.options||{};const C=globalThis.TylerCommands;C?.set('squad-vote',{enabled:featureFlags.votingEnabled===true});C?.set('squad-party',{enabled:featureFlags.partyEnabled===true});C?.set('squad-trivia',{enabled:featureFlags.arcadeEnabled===true});const v=await globalThis.chrome?.storage?.local?.get?.(['v23RoastEnabled','v23CommandsEnabled','v23Commands']);if(v&&C){C.set('squad-roast',{enabled:v.v23RoastEnabled===true});const names=(Array.isArray(v.v23Commands)?v.v23Commands:[]).map(c=>c?.name).filter(n=>C.custom(n)).slice(0,6);C.set('custom',{enabled:v.v23CommandsEnabled===true&&names.length>0,usage:names});}}catch{}}void syncFlags();setInterval(syncFlags,60000);
 let watchEpoch=0,suiteTasks=Promise.resolve();const readMessages=new WeakMap();
 async function suiteMessage(line,node,bound,epoch){
  const active=()=>region===bound&&watchEpoch===epoch&&api.isOwner?.()!==false;
  if(!active())return;
  // Parsed by the shared command list (commands.js) so every feature agrees on who owns a line.
  const C=globalThis.TylerCommands,parsed=C?.squad(line),customName=parsed?null:C?.custom(line);
  const roast=parsed?.kind==='roast'?[line,parsed.action]:null;
  const custom=customName&&!C.claimedByOther(line,'custom')?customName:null;
  const help=parsed?.kind==='help',match=parsed?.kind==='vote'?[line,parsed.title]:null,party=parsed?.kind==='party'?[line,parsed.action]:null;
  const trivia=parsed?.kind==='trivia'?(parsed.action==='answer'?{action:'answer',choice:parsed.choice}:{action:'start'}):null;
  if(line.length>140)return;
  if(!match&&!trivia&&!party&&!help&&!roast&&!custom){
   if(featureFlags.directorEnabled===true&&Date.now()-lastCue>90000&&/\b(gg|we won|victory|clutch|we lost|defeat|wiped)\b/i.test(line)&&globalThis.TylerIdentity?.speaker(node,bound)?.id){lastCue=Date.now();api.bridge('board-play',{slot:/\b(we lost|defeat|wiped)\b/i.test(line)?5:4,volume:.35});}return;
  }
  let speaker=globalThis.TylerIdentity?.speaker(node,bound);
  for(let retry=0;!speaker&&retry<4;retry++){await new Promise(resolve=>setTimeout(resolve,100));if(!active())return;speaker=globalThis.TylerIdentity?.speaker(node,bound);}
  if(!active())return;
  if(!speaker)return say('Sender not identified for this command. Check Sender check in the Music panel; names alone do not grant account access.');
  const id=speaker.id;
  if(help){api.send('ROBOTIC TYLER: '+(C?C.helpText():'Commands: !trivia, !answer 1-4, !party join/status, !vote GAME.'));return;}
  const key=id+'|'+line;if(recently.has(key)&&Date.now()-recently.get(key)<90000)return;recently.set(key,Date.now());
  const r=await send(match?{type:'suite:vote',speaker,title:match[1]}:party?{type:'suite:party',speaker,action:(party[1]||'help').toLowerCase()}:roast?{type:'v23:roast',speaker,action:(roast[1]||'status').toLowerCase()}:custom?{type:'v23:custom',speaker,name:custom}:{type:'suite:trivia',speaker,...trivia});
  if(active()){api.send(r.message);void refresh();}
 }
 function watch(){
  if(!api.isOwner?.()){watchEpoch++;observer?.disconnect();region=null;return;}
  const next=api.getRegion?.(),sample=api.getSample?.();if(!next?.isConnected||!sample?.isConnected){watchEpoch++;observer?.disconnect();region=null;return;}
  const scope=api.getChatScope?.()||'';if(next===region&&scope===chatScope)return;
  watchEpoch++;observer?.disconnect();region=next;lastMessageAt=0;lastNudge=0;chatScope=scope;const selector=globalThis.TylerSelection?.selector?.(sample);if(!selector)return;
  for(const node of region.querySelectorAll(selector))readMessages.set(node,(globalThis.TylerChatBus?.text(node)??(node.innerText||node.textContent||'').trim()));
  observer=new (globalThis.TylerChatBus?.Observer||MutationObserver)(records=>{
   const nodes=new Set(),collect=raw=>{const n=raw.nodeType===1?raw:raw.parentElement;if(!n)return;if(n.matches?.(selector))nodes.add(n);for(const child of n.querySelectorAll?.(selector)||[])nodes.add(child);const parent=n.closest?.(selector);if(parent)nodes.add(parent);};
   for(const record of records){for(const raw of record.addedNodes||[])collect(raw);if(record.type==='characterData')collect(record.target);else {const parent=record.target?.closest?.(selector);if(parent)nodes.add(parent);}}
   for(const node of nodes){const line=(globalThis.TylerChatBus?.text(node)??(node.innerText||node.textContent||'').trim());if(!line||readMessages.get(node)===line)continue;readMessages.set(node,line);if(/^(?:ROBOTIC TYLER:|\[ROBOTIC TYLER\])/i.test(line))continue;lastMessageAt=Date.now();const bound=region,epoch=watchEpoch;suiteTasks=suiteTasks.catch(()=>{}).then(()=>suiteMessage(line,node,bound,epoch)).catch(e=>say('Command skipped: '+e.message));}
  });observer.observe(region,{subtree:true,childList:true,characterData:true});
 }
 panel.addEventListener('toggle',()=>{if(panel.open)void refresh();});setInterval(watch,1400);setInterval(()=>{if(panel.open)void refresh();if(featureFlags.nudgesEnabled===true&&api.isOwner?.()&&region?.isConnected&&api.getChatScope?.()===chatScope&&lastMessageAt&&Date.now()-lastMessageAt>=720000&&Date.now()-lastMessageAt<=840000&&Date.now()-lastNudge>=3600000){lastNudge=Date.now();api.send('ROBOTIC TYLER: Quiet lobby! Want a quick trivia round? Type !trivia.');}for(const [k,at] of recently)if(Date.now()-at>120000)recently.delete(k);},20000);
})();

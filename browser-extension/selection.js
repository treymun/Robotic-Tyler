(() => {
 const editable='textarea,input,[contenteditable]:not([contenteditable="false"]),[role="textbox"]';
 const textOf=n=>(n?.innerText||n?.textContent||'').trim();
 function composer(target){return target.closest(editable)||target.querySelector(editable);}
 function message(target,style=getComputedStyle){let sample=target.closest('.msgText,[class*="msg_Text"],[class*="MessageText"],[class*="message_content"]')||target;const picked=textOf(target);if(!sample.classList.length){for(let p=sample.parentElement;p&&p!==document.body;p=p.parentElement){if(textOf(p)!==picked)break;if(p.classList.length){sample=p;break;}}}
  let region=target.closest('[role="log"],[class*="ChatHistory"],[class*="chathistory"],[class*="chatHistory"],[class*="chat_history"]');if(!region){for(let p=sample.parentElement;p&&p!==document.body&&p!==document.documentElement;p=p.parentElement){const s=style(p);if(/auto|scroll/.test(s.overflowY)&&p.scrollHeight>p.clientHeight){region=p;break;}}}region||=sample.parentElement?.parentElement;return {sample,region:region&&region!==document.body&&region!==document.documentElement?region:null};
 }
 function selector(sample,escape=CSS.escape){if(!sample)return null;const classes=[...sample.classList];const name=classes.find(c=>/msg.?text|message.?text|message.?content/i.test(c))||classes[0];if(name)return '.'+escape(name);const tag=sample.tagName?.toLowerCase();if(!tag||['html','body'].includes(tag))return null;const parentClass=[...(sample.parentElement?.classList||[])][0];return parentClass?'.'+escape(parentClass)+' > '+tag:tag;}
 function readiness(api){if(!api.getComposer()?.isConnected)return 'Message box: not selected. Use Connect & start.';if(!api.getRegion()?.isConnected||!api.getSample()?.isConnected)return 'Message reader: not selected. Use Connect & start; it will ask for a hint if needed.';if(!selector(api.getSample()))return 'Message reader: selection cannot be read. Use Connect & start to reconnect.';return 'READY — message box and message reader selected.';}
 // ── Automatic chat detection (v2.6) ─────────────────────────────────────
 // Steam's chat history is several nested elements whose classes all contain
 // "chatHistory" (chatHistoryAndMembers > ChatHistoryContainer > chatHistoryScroll),
 // and a group can show its text channel and its voice-room chat side by side.
 // So instead of "exactly one box and one history on the page", each message box is
 // paired with the history inside its own chat window. A pairing is only accepted
 // when it is unambiguous; anything unclear falls back to asking for a click.
 const INPUTS='textarea,[contenteditable="true"],[role="textbox"]';
 const HISTORY='[role="log"],[class*="ChatHistory"],[class*="chatHistory"],[class*="chat_history"]';
 const SAMPLES='.msgText,[class*="msg_Text"],[class*="MessageText"],[class*="message_content"]';
 const SKIP='input[type=search],input[type=password],input[type=checkbox],input[type=range]';
 function shown(n){
  if(!n?.isConnected||!n.getClientRects?.().length)return false;
  try{return typeof n.checkVisibility==='function'?n.checkVisibility({visibilityProperty:true,opacityProperty:true}):true;}catch{return true;}
 }
 const box=n=>shown(n)&&!n.matches?.(SKIP);
 // Text channel chat or the voice room's own chat (Steam: VoiceRoomChatWindow / VoiceRoomChatHistory).
 function kind(n){return n?.closest?.('[class*="VoiceRoomChat"],[class*="VoiceChannelChat"]')?'voice-room':'text';}
 function pair(input){
  const body=input.ownerDocument?.body;
  for(let p=input.parentElement,level=0;p&&p!==body&&level<14;p=p.parentElement,level++){
   const histories=[...p.querySelectorAll(HISTORY)].filter(h=>!h.contains(input)&&shown(h));
   if(!histories.length)continue;
   // Another message box in the same window means two chats share it: don't guess.
   if([...p.querySelectorAll(INPUTS)].some(n=>n!==input&&box(n)))return {ambiguous:true};
   const samples=[...p.querySelectorAll(SAMPLES)].filter(n=>shown(n)&&histories.some(h=>h.contains(n)));
   if(!samples.length)return {composer:input,region:null,sample:null,empty:true};
   // The history is the nearest history element holding every visible message.
   let region=samples.at(-1).closest(HISTORY);
   while(region&&!samples.every(n=>region.contains(n)))region=region.parentElement?.closest?.(HISTORY)||null;
   if(!region||region.contains(input)||!p.contains(region))return {ambiguous:true};
   return {composer:input,region,sample:samples.at(-1)};
  }
  return null; // not a chat message box
 }
 // preferred: the message box the person last typed in or clicked.
 // hint: 'text' or 'voice-room', remembered from the last start, used only to break a tie.
 function discover(doc,preferred,hint){
  const inputs=[...doc.querySelectorAll(INPUTS)].filter(box);
  if(preferred?.isConnected&&inputs.includes(preferred)){const p=pair(preferred);if(p&&!p.ambiguous)return p;}
  const found=inputs.map(pair).filter(Boolean),pairs=found.filter(p=>!p.ambiguous),unclear=found.length-pairs.length;
  if(pairs.length===1&&!unclear)return pairs[0];
  if(hint){const same=pairs.filter(p=>kind(p.composer)===hint);if(same.length===1)return same[0];}
  return found.length>1?{ambiguous:true}:{};
 }
 globalThis.TylerSelection={composer,message,selector,readiness,discover,kind,pair};
})();

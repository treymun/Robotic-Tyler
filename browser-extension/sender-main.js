// Limited MAIN-world adapter for React-rendered Steam message sender metadata.
// No friends-store search, network, storage, token access, React mutation or chat sending.
(()=>{
 const own=(value,key)=>{if(!value||typeof value!=='object')return undefined;const field=Object.getOwnPropertyDescriptor(value,key);return field&&'value'in field?field.value:undefined;};
 function numeric(value,isAccount=false){
  if(typeof value!=='string'&&typeof value!=='number'&&typeof value!=='bigint')return null;
  const raw=String(value);if(/^7656119\d{10}$/.test(raw))return raw;
  return isAccount&&/^\d{1,10}$/.test(raw)&&BigInt(raw)>0n&&BigInt(raw)<=4294967295n?String(76561197960265728n+BigInt(raw)):null;
 }
 const senderFields=['senderSteamID','authorSteamID','steamidSender','steamid_sender','sender_steamid','steamid_from','senderAccountID','authorAccountID','unAccountIDSender'];
 const idFields=['steamid','steamID','steamId','m_steamid','m_ulSteamID'];
 const accountFields=['unAccountID','accountid','accountID','accountId','m_unAccountID','m_nAccountID'];
 function collect(value,allowGeneric,depth=0,seen=new Set()){
  if(!value||typeof value!=='object'||seen.has(value)||depth>3)return [];seen.add(value);const result=[];
  for(const field of senderFields){const id=numeric(own(value,field),/AccountID$|^unAccountIDSender$/.test(field));if(id)result.push(id);}
  if(allowGeneric){for(const field of idFields){const raw=own(value,field),id=numeric(raw);if(id)result.push(id);else if(raw&&typeof raw==='object')result.push(...collect(raw,true,depth+1,seen));}for(const field of accountFields){const id=numeric(own(value,field),true);if(id)result.push(id);}}
  // Only semantic message/sender containers; never traverse arbitrary children,
  // stores, callbacks, state or the generic "user" (which can mean the bot).
  for(const field of ['message','msg','chatMessage','sender','author'])result.push(...collect(own(value,field),true,depth+1,seen));
  // Steam's actual BBCode renderer receives context.unAccountIDSender.
  // Inspect that one scalar only; context.chat contains unrelated account data.
  const context=own(value,'context'),sender=numeric(own(context,'unAccountIDSender'),true);if(sender)result.push(sender);
  return result;
 }
 function history(node){return node?.getAttribute?.('role')==='log'||/(?:ChatHistory|chatHistory|chat_history)/.test(node?.className||'');}
 function fiberKeys(start,node){
  const scope=node.closest?.('.msg,.ChatSpeaker'),visited=new Set();
  for(let fiber=start,depth=0;fiber&&depth<24&&!visited.has(fiber);fiber=own(fiber,'return'),depth++){
   visited.add(fiber);const host=own(fiber,'stateNode');
   if(host?.nodeType===1&&(history(host)||scope&&host!==scope&&!scope.contains(host)&&host.contains?.(scope)))break;
   const keys=[...new Set([own(fiber,'memoizedProps'),own(fiber,'pendingProps')].flatMap(p=>collect(p,false)))];
   // Stop at the nearest component that actually owns message/sender props.
   if(keys.length)return keys;
  }
  return [];
 }
 function read(node){
  const messageBody=node.closest?.('.msgText')||node;
  for(let row=messageBody,depth=0;row&&depth<12;row=row.parentElement,depth++){
   if(history(row))break;
   const authors=row.querySelectorAll?.('.speakerName,[class*="speakerName"],[class*="SpeakerName"]');if(authors?.length){const names=new Set([...authors].map(h=>h.textContent?.trim()).filter(Boolean));if(names.size>1)break;}
   const candidates=[];
   for(const field of Object.getOwnPropertyNames(row).filter(k=>/^__react(?:Props|Fiber|InternalInstance)\$/.test(k)).slice(0,4)){
    const data=own(row,field);if(field.startsWith('__reactProps$'))candidates.push(data);else {const keys=fiberKeys(data,messageBody);if(keys.length>1)return null;if(keys.length===1)return keys[0];}
   }
   const allowGeneric=!!row.matches?.('.speakerName,[class*="speakerName"],[class*="SpeakerName"]');
   const keys=[...new Set(candidates.flatMap(p=>collect(p,allowGeneric)))];if(keys.length>1)return null;if(keys.length===1)return keys[0];
   // The actual header may carry props while the body only has text children.
   for(const header of authors||[]){const values=[];for(const field of Object.getOwnPropertyNames(header).filter(k=>/^__reactProps\$/.test(k)).slice(0,2))values.push(...collect(own(header,field),true));const unique=[...new Set(values)];if(unique.length>1)return null;if(unique.length===1)return unique[0];}
  }
  return null;
 }
 globalThis.TylerMessageSenderMetadata={read};
 document.addEventListener('tyler-read-message-sender',event=>{
  const node=event.target;if(!node||node.nodeType!==1||!node.isConnected||!node.setAttribute)return;
  node.removeAttribute('data-tyler-sender-id');node.removeAttribute('data-tyler-sender-source');
  node.setAttribute('data-tyler-sender-bridge','2.3.26');
  try{const id=read(node);if(id){node.setAttribute('data-tyler-sender-id',id);node.setAttribute('data-tyler-sender-source','react-message');}}catch{}
 });
})();

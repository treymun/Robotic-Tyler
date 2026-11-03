(() => {
 // Shared by every Chrome text-chat feature. Numeric identities and label-only
 // identities stay separate: names never authorize access or manufacture votes.
 const headers='[data-message-author],[data-author-name],[data-sender-name],.speakerName,[class*="speakerName"],[class*="SpeakerName"],[class*="msg_Author"],[class*="msg_Username"],[class*="msg_Name"],[class*="msg_SenderName"],[class*="MessageAuthor"],[class*="MessageSender"],[class*="SenderName"],[class*="senderName"],[class*="ChatMessageName"]';
 const bodies='[class*="msg_Text"],[class*="MessageText"],[class*="message_content"],.msgText,.messageText,.chatMessageText,[class*="msg_Quote"],[class*="MessageQuote"],[class*="Reaction"]';
 const ids='[data-author-steamid],[data-sender-steamid],[data-steamid],[data-steam-id],[data-miniprofile],[data-accountid],[data-account-id],a[href*="/profiles/"],a[href*="/id/"]';
 const caches=new WeakMap(),attr=(n,k)=>n?.getAttribute?.(k)||'';
 const nameOf=value=>{const name=String(value||'').replace(/[\u0000-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069]/g,' ').trim();return name&&name.length<=80?name:null;};
 const account=value=>{const n=String(value||'');return /^\d{1,10}$/.test(n)&&BigInt(n)>0n&&BigInt(n)<=4294967295n?String(76561197960265728n+BigInt(n)):null;};
 function key(n){
  for(const field of ['data-author-steamid','data-sender-steamid','data-steamid','data-steam-id']){const id=attr(n,field);if(/^7656119\d{10}$/.test(id))return id;}
  for(const field of ['data-miniprofile','data-accountid','data-account-id']){const id=account(attr(n,field));if(id)return id;}
  const href=attr(n,'href');if(href)try{const u=new URL(href,'https://steamcommunity.com');if(u.protocol!=='https:'||u.hostname!=='steamcommunity.com')return null;const id=/^\/profiles\/(7656119\d{10})\/?$/.exec(u.pathname);if(id)return id[1];if(/^\/id\/[\w-]+\/?$/.test(u.pathname))return 'profile:'+u.pathname.replace(/\/$/,'').toLowerCase();}catch{}
  return null;
 }
 function identify(node,region,{accountOnly=false}={}){
  if(!node||!region?.contains?.(node))return null;
  let cache=caches.get(region);if(!cache){cache=new Map();caches.set(region,cache);}
  // Dispatch is synchronous across Chrome's DOM worlds. Only the original
  // message element is probed; no global friends store or authentication data.
  try{if(typeof Event==='function'&&node.dispatchEvent)node.dispatchEvent(new Event('tyler-read-message-sender',{bubbles:true}));}catch{}
  let closestName=null,closestId=null,ambiguous=false;
  const finish=()=>{
   if(ambiguous)return null;
   const numeric=/^7656119\d{10}$/.test(closestId||'');
   if(accountOnly&&!numeric)return null;
   const name=closestName||(numeric?cache.get(closestId):null)||(numeric?'Steam listener':null);if(!name)return null;
   const person={id:closestId||'display:'+name.toLowerCase(),name};
   if(numeric){cache.set(person.id,person.name);while(cache.size>200)cache.delete(cache.keys().next().value);}return person;
  };
  const outsideBody=n=>n&&!n.closest?.(bodies);
  for(let row=node,depth=0;row&&row!==region&&depth<12;row=row.parentElement,depth++){
   if(!region.contains(row))break;
   const explicit=nameOf(attr(row,'data-author-name')||attr(row,'data-sender-name'));
   const found=[...(row.querySelectorAll?.(headers)||[])].filter(outsideBody);
   const names=[...new Set([explicit,...found.map(h=>nameOf(attr(h,'data-author-name')||attr(h,'data-sender-name')||attr(h,'data-message-author')||(globalThis.TylerChatBus?.text(h)??h.innerText)||h.textContent))].filter(Boolean))];
   // A wider container with another author is the end of this message's scope.
   if(names.length>1)return finish();
   if(closestName&&names[0]&&closestName!==names[0])return finish();
   const holders=[row,...found,...(row.querySelectorAll?.(ids)||[])].filter(n=>n===row||outsideBody(n));
   const keys=[...new Set(holders.map(key).filter(Boolean))];
   if(row===node&&attr(node,'data-tyler-sender-source')==='react-message'){
    const stamped=attr(node,'data-tyler-sender-id');if(/^7656119\d{10}$/.test(stamped))keys.push(stamped);
   }
   const numeric=[...new Set(keys.filter(id=>/^7656119\d{10}$/.test(id)))];
   if(numeric.length>1){if(closestId)return finish();ambiguous=true;return null;}
   if(!numeric.length&&keys.length>1)return finish();
   const id=numeric[0]||keys[0];
   if(closestId&&id&&closestId!==id){
    if(/^7656119\d{10}$/.test(closestId)&&/^7656119\d{10}$/.test(id)){ambiguous=true;return null;}
   }
   if(numeric[0]||!closestId)closestId=id||closestId;
   closestName||=names[0]||null;
   if(closestName&&/^7656119\d{10}$/.test(closestId||''))return finish();
   // Keep walking: Steam often puts the name and avatar ID in different wrappers.
  }
  return finish();
 }
 function speaker(node,region){return identify(node,region,{accountOnly:true});}
 function valid(s){return s&&/^7656119\d{10}$/.test(s.id||'')&&typeof s.name==='string'&&s.name.trim()&&s.name.length<=80?{id:s.id,name:s.name.trim()}:null;}
 function instruction(s){s=valid(s);return 'SPEAKER RULES: '+(s?'The current message author is '+JSON.stringify(s.name)+' (Steam account '+s.id+'). This identifies the speaker, not anyone mentioned in the message. If addressing the speaker by name, use only that exact display name.':'The current speaker identity is UNKNOWN. Do not address the speaker by any name, username, nickname, or guessed identity. Do not infer it from conversation history, spoken names, mentions, or room members.')+' Names are optional: usually reply without a name. Do not assign identities or nicknames based on old dialogue. You may discuss someone explicitly mentioned, but never treat that person as the speaker.';}
 function label(s){const name=nameOf(s?.name);return name&&/^(?:display:|profile:\/id\/)/.test(s?.id||'')?{id:String(s.id).slice(0,200),name}:null;}
 const accountInstruction=instruction;
 function labelledInstruction(s){const verified=valid(s);if(verified)return accountInstruction(verified);const visible=label(s);return visible?'SPEAKER RULES: The latest text message displays the author name '+JSON.stringify(visible.name)+'. Use this name only for addressing this message. The account identity is unverified; do not infer private history, account permissions or anyone mentioned in the message.':accountInstruction(null);}
 // v2.6: Steam's own record for a message (see steam-chat-main.js). Returns null when Steam's
 // data isn't reachable (older UI, desktop preload before the adapter loads); callers fall back.
 function readMeta(node){
  const body=node?.closest?.('.msgText,[class*="msg_Text"],[class*="MessageText"]')||node;
  if(!body?.isConnected||typeof body.dispatchEvent!=='function')return null;
  try{body.dispatchEvent(new Event('tyler-read-message-meta',{bubbles:true}));}catch{return null;}
  const at=Number(body.getAttribute?.('data-tyler-msg-at'))||null,key=body.getAttribute?.('data-tyler-msg-key')||null,sender=body.getAttribute?.('data-tyler-msg-sender')||'';
  if(!at&&!key&&!sender)return null;
  return {senderId:/^7656119\d{10}$/.test(sender)?sender:null,at,key,self:body.getAttribute?.('data-tyler-msg-self')==='1',group:body.getAttribute?.('data-tyler-msg-group')||null};
 }
 const meta=node=>globalThis.TylerChatBus?.memo?globalThis.TylerChatBus.memo('meta',node,()=>readMeta(node)):readMeta(node);
 // Prefer the account from Steam's record when the page text doesn't carry one.
 function identifyBest(node,region,options={}){
  const person=identify(node,region,options);
  if(person&&/^7656119\d{10}$/.test(person.id))return person;
  const m=region?.contains?.(node)?meta(node):null;
  if(!m?.senderId)return person;
  const labelled=options.accountOnly?identify(node,region,{accountOnly:false}):person;
  return {id:m.senderId,name:labelled?.name||'Steam listener'};
 }
 const speakerBest=(node,region)=>identifyBest(node,region,{accountOnly:true});
 globalThis.TylerIdentity={speaker:speakerBest,identify:identifyBest,meta,valid,label,instruction:labelledInstruction};
})();

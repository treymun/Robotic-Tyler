(() => {
 const visible=n=>!!(n?.isConnected&&n.getClientRects().length);
 const profileLink=':is(a[href*="/profiles/"],a[href*="/id/"])';
 function botName(doc){
  let nodes=[...doc.querySelectorAll('[data-self-persona-name],#global_header .supernav_container '+profileLink)].filter(visible);
  const header=doc.getElementById?.('global_header');
  // Full desktop styling keeps the profile link in the hidden Steam header.
  // Prefer the usual visible identity and use the link only in that mode.
  if(!nodes.length&&header&&doc.defaultView?.getComputedStyle(header).getPropertyValue('--rt-steam-navigation-hidden').trim()==='1'){
   nodes=[...header.querySelectorAll('.supernav_container > '+profileLink)];
  }
  const names=[...new Set(nodes.map(n=>n.getAttribute('data-self-persona-name')||(n.innerText||n.textContent||'').trim()).filter(s=>s&&s.length<=80))];
  return names.length===1?names[0]:null;
 }
 function voice(doc,name){if(!name)return null;const candidates=[...doc.querySelectorAll('[data-voice-participants],[class*="VoiceChannelParticipants"],[class*="VoiceMembers"],[class*="voice_members"],[class*="VoiceChannel"],[class*="voicechannel"]')].filter(visible),matches=new Set();for(const container of candidates){const rows=[...container.querySelectorAll('[data-steamid],[data-miniprofile],[class*="VoiceMember"],[class*="voice_member"],[class*="VoiceUser"]')].filter(visible);for(const row of rows){const first=(row.innerText||row.textContent||'').split('\n').map(s=>s.trim()).find(Boolean);if(first?.toLowerCase()===name.trim().toLowerCase()&&row.querySelector('img'))matches.add(row);}}const rows=[...matches].filter(row=>![...matches].some(other=>other!==row&&row.contains(other)));return rows.length===1?rows[0]:null;}
 function scope(region,doc){for(let node=region;node&&node!==doc.body;node=node.parentElement){for(const attr of ['data-chatid','data-chat-group-id','data-channelid','data-chat-room-id']){const value=node.getAttribute?.(attr);if(value&&/^[\w:-]{1,100}$/.test(value))return attr+':'+value;}}return null;}
 globalThis.TylerSetup={visible,botName,voice,scope};
})();

// ROBOTIC TYLER: the one list of chat commands (isolated world, v2.6).
//
// Every feature that answers a chat command has one entry here, in priority
// order. Features keep handling their own commands, but they ask this list who
// owns a line, the AI conversation skips any line a feature owns, and !help is
// generated from whichever entries are switched on. Adding a command = adding a
// line to COMMANDS (plus its handler in the feature).
//
// Features switch entries on/off with TylerCommands.set(id,{enabled}) and may
// supply a live matcher with TylerCommands.set(id,{match}) when matching depends
// on state (e.g. an arcade round in progress).
(() => {
 'use strict';
 if(globalThis.TylerCommands)return;
 const one=s=>String(s||'').trim();

 // Squad commands (handled by squad-suite.js). Returns what the line asks for, or null.
 const SQUAD_RESERVED=['!say','!image','!img','!draw','!help','!trivia','!vote','!game','!party','!roast','!answer','!tyler','!votekick','!kick','!votemute','!mute','!modhelp','!play'];
 function squad(line){
  const t=one(line);if(!t||t.length>140)return null;
  if(/^!help(?:\s+tyler)?$/i.test(t))return {kind:'help'};
  const vote=/^!vote\s+(.{2,110})$/i.exec(t);if(vote)return {kind:'vote',title:vote[1]};
  const party=/^!party(?:\s+(start|join|leave|status|teams|stop|help))?$/i.exec(t);if(party)return {kind:'party',action:(party[1]||'help').toLowerCase()};
  if(/^!trivia$/i.test(t))return {kind:'trivia',action:'start'};
  const answer=/^!answer\s+([1-4])$/i.exec(t);if(answer)return {kind:'trivia',action:'answer',choice:Number(answer[1])};
  const roast=/^!roast(?:\s+(join|start|next|status|stop|leave))?$/i.exec(t);if(roast)return {kind:'roast',action:(roast[1]||'status').toLowerCase()};
  return null;
 }
 // Owner-defined canned replies (Settings → v2.3 options): any other single !word.
 function custom(line){const t=one(line).toLowerCase();return /^![a-z][a-z0-9_-]{1,24}$/.test(t)&&!SQUAD_RESERVED.includes(t)?t:null;}

 // Priority order matters only for the custom-command fallback, which is last.
 const COMMANDS=[
  {id:'tyler',label:'Ask Tyler',enabled:false,usage:['!tyler ask QUESTION'],match:t=>/^!tyler\s+\S/i.test(t)},
  {id:'moderation',label:'Moderation',enabled:false,usage:['!votekick NAME','!votemute NAME','!modhelp'],match:t=>!!globalThis.TylerModeration?.parse?.(t)},
  {id:'theme-voices',label:'Theme voices',enabled:false,usage:['!say TEXT','!say portal TEXT'],match:t=>!!globalThis.TylerThemeVoices?.parse?.(t)},
  {id:'image',label:'Chat images',enabled:false,usage:['!image PROMPT','!image best PROMPT','!image help'],match:t=>!!globalThis.TylerImages?.parse?.(t)},
  {id:'music',label:'Music',enabled:false,usage:['!play ARTIST SONG','music skip','music queue'],match:t=>!!globalThis.TylerMusic?.parse?.(t)},
  {id:'squad-vote',label:'Game votes',enabled:false,usage:['!vote GAME'],match:t=>squad(t)?.kind==='vote'},
  {id:'squad-party',label:'Party host',enabled:false,usage:['!party join','!party teams'],match:t=>squad(t)?.kind==='party'},
  {id:'squad-trivia',label:'Multiplayer trivia',enabled:false,usage:['!trivia','!answer 1-4'],match:t=>squad(t)?.kind==='trivia'},
  {id:'squad-roast',label:'Roast battles',enabled:false,usage:['!roast join'],match:t=>squad(t)?.kind==='roast'},
  {id:'help',label:'Help',enabled:true,usage:['!help'],match:t=>squad(t)?.kind==='help'},
  {id:'arcade',label:'Arcade',enabled:false,usage:['play trivia','play vault','hint','stop game'],match:t=>!!globalThis.TylerSoundboard?.arcade?.(t,{})},
  {id:'sounds',label:'Soundboard',enabled:false,usage:['sound 1-10','sound NAME'],match:t=>globalThis.TylerSoundboard?.parse?.(t)!=null},
  // Older "!game …" arcade commands; kept so the AI never answers them.
  {id:'arcade-legacy',label:'Arcade (older commands)',enabled:true,hidden:true,fallback:true,usage:[],match:t=>/^!game(?:\s|$)/i.test(t)},
  {id:'custom',label:'Custom commands',enabled:false,fallback:true,usage:[],match:t=>!!custom(t)},
 ];
 const byId=new Map(COMMANDS.map(c=>[c.id,c]));
 const safe=(c,line)=>{try{return !!c.match(line);}catch{return false;}};
 const on=c=>{try{return typeof c.enabled==='function'?!!c.enabled():!!c.enabled;}catch{return false;}};

 function owners(line){const t=one(line);if(!t)return [];return COMMANDS.filter(c=>safe(c,t)).map(c=>c.id);}
 function owner(line){return owners(line)[0]||null;}
 // True when any line of a (possibly multi-line) message is a command some feature owns.
 // Features own their syntax whether or not they're switched on (so the AI never answers
 // "!votekick Sam"); the catch-all custom entry only claims lines while it's switched on.
 function claims(text){return String(text||'').split('\n').some(line=>{const t=one(line);return !!t&&COMMANDS.some(c=>(c.id!=='custom'||on(c))&&safe(c,t));});}
 const fallbacks=new Set(COMMANDS.filter(c=>c.fallback).map(c=>c.id));
 function claimedByOther(line,id){return owners(line).some(o=>o!==id&&!fallbacks.has(o));}
 // enabled may be a boolean or a function the feature keeps current, e.g. ()=>!chatLocked.
 function set(id,patch={}){const c=byId.get(id);if(!c)return false;if('enabled' in patch)c.enabled=typeof patch.enabled==='function'?patch.enabled:!!patch.enabled;if(typeof patch.match==='function')c.match=patch.match;if(Array.isArray(patch.usage))c.usage=patch.usage.slice(0,6);return true;}
 function helpText(max=460){
  const parts=COMMANDS.filter(c=>on(c)&&!c.hidden&&c.id!=='help'&&c.usage.length).map(c=>c.usage.join(', '));
  const text='Commands: '+(parts.length?parts.join(' · '):'none are switched on right now')+'. Some need the owner to enable them.';
  return text.length>max?text.slice(0,max-1)+'…':text;
 }
 // Lines that more than one feature would answer (custom fallback excluded). Used by tests.
 function conflicts(lines){return lines.map(line=>({line,owners:owners(line).filter(o=>!fallbacks.has(o))})).filter(x=>x.owners.length>1);}
 function list(){return COMMANDS.map(c=>({id:c.id,label:c.label,enabled:on(c),hidden:!!c.hidden,usage:[...c.usage]}));}

 globalThis.TylerCommands=Object.freeze({owner,owners,claims,claimedByOther,set,helpText,conflicts,list,squad,custom,SQUAD_RESERVED:Object.freeze([...SQUAD_RESERVED])});
})();

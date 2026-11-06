// Who said each voice utterance (v2.44). Optional: Settings → Voice → Standard voice → "Tell the AI who's
// speaking in voice" (on by default). Off, none of this runs and the voice path is exactly v2.43's.
//
// One file, three places:
//  - MAIN world (voice-listener.js, steam-chat-main.js): each person's audio level per capture, Steam's own
//    "who's talking" data, and the attribution of a finished utterance;
//  - the background (background.js imports it): the checked attribution turned into the heard line, the
//    rule for the AI and the author for per-friend memory;
//  - tests (Node).
//
// Where an attribution comes from, best first:
//  1. "steam": Steam's own talking data. Steam lights up talking members in its voice list; what drives that
//     isn't documented, so SteamReader looks for it defensively (talking-like fields and methods on the voice
//     members and Steam's voice stores, and talking-like classes in the voice list) and only uses a signal
//     once it has seen it switch on and off for the same person in this session. Never throws.
//  2. "solo" / "track": Steam's voice server gives each other person in the call their own audio track. With
//     exactly one other person in voice every utterance is theirs ("solo", certain). Otherwise the track that
//     carried the speech names the speaker when Tyler can tell whose it is: an id Steam gives for the track or
//     its SSRC, or what Steam's talking data said while that track was talking (learned and remembered for
//     the call). A track nobody can name yet is still kept apart from the others: "Speaker 1", "Speaker 2",
//     stable for the call.
//  3. "unknown": nothing could tell. A name is never guessed.
// Names come only from Steam's own member data. Nothing is stored beyond the call, there are no voiceprints,
// and nothing new is sent anywhere: the audio sent for transcription is unchanged.
(() => {
 'use strict';
 if(globalThis.TylerVoiceSpeakers)return;
 const STEAM_ID=/^7656119\d{10}$/,LABEL_ID=/^voice:speaker-(\d{1,3})$/;
 const cleanName=(s,n=60)=>String(s??'').replace(/[\u0000-\u001f\u007f-\u009f‪-‮⁦-⁩]/g,' ').replace(/\s+/g,' ').trim().slice(0,n);
 const account=v=>{const s=String(v??'');return /^\d{1,10}$/.test(s)&&Number(s)>0&&Number(s)<=4294967295?Number(s):null;};
 const steamOf=n=>n===null?null:String(76561197960265728n+BigInt(n));
 const get=(v,k)=>{try{return v?.[k];}catch{return undefined;}};
 const own=(v,k)=>{if(!v||typeof v!=='object')return undefined;try{const d=Object.getOwnPropertyDescriptor(v,k);return d&&'value' in d?d.value:undefined;}catch{return undefined;}};

 // ── Each person's track during one capture (fed by voice-listener.js every 50 ms) ──────────────
 const MIN_TICKS=4; // 0.2 s of a track's own speech counts as that person talking
 /** One track's level, against its own steady background (a fan in one mic doesn't make that person talk). */
 class TrackMeter{
  constructor(){this.floor=.001;}
  level(rms){rms=Number.isFinite(rms)?rms:0;this.floor=rms<this.floor?rms:this.floor+(rms-this.floor)*.002;return {rms,voiced:rms>Math.max(.003,this.floor*3.2)};}
 }
 /** What one capture heard on each track, and Steam's talking data sampled alongside (about every 100 ms). */
 class Capture{
  constructor(){this.ticks=0;this.tracks=new Map();this.together=0;this.samples=[];this.lastSample=0;this.lastVoiced=[];this.steam=null;this.problem=null;}
  /** levels: [{key,rms,voiced}] for this 50 ms tick. Returns the tracks with speech now. */
  tick(levels){
   this.ticks++;const voiced=[];
   for(const l of levels||[]){let t=this.tracks.get(l.key);if(!t){t={key:l.key,voiced:0,score:0,peak:0};this.tracks.set(l.key,t);}
    if(l.voiced){t.voiced++;t.score+=l.rms;voiced.push(l.key);}if(l.rms>t.peak)t.peak=l.rms;}
   if(voiced.length>1)this.together++;this.lastVoiced=voiced;return voiced;
  }
  /** Steam's talking data (SteamReader.sample) at about this moment. */
  sample(steam,voiced=this.lastVoiced){if(!steam)return;this.steam=steam;if(this.samples.length<400)this.samples.push({tracks:[...(voiced||[])],talking:steam.talking||{}});}
 }
 /** The tracks that talked in a capture: the dominant one, and the others when two or more clearly did. */
 function trackResult(capture){
  const list=[...(capture?.tracks?.values()||[])].filter(t=>t.voiced>=MIN_TICKS).sort((a,b)=>b.score-a.score||b.voiced-a.voiced);
  if(!list.length)return {silent:true,top:null,overlap:[]};
  const top=list[0],more=list.slice(1).filter(t=>t.voiced>=Math.max(MIN_TICKS,top.voiced*.35)&&t.score>=top.score*.3);
  return {silent:false,top,overlap:more.length?[top,...more]:[]};
 }
 /** Who Steam's talking data says talked during a capture, from the signals that have proved themselves. */
 function steamResult(samples,members,useful){
  const n=samples.length,keys=new Set(useful||[]);if(n<2||!keys.size||!members.size)return {talkers:[]};
  // A signal that marks everyone (nearly) all the time says nothing about who is talking.
  const per=new Map();
  for(const s of samples)for(const [k,ids] of Object.entries(s.talking||{})){if(!keys.has(k))continue;let m=per.get(k);if(!m)per.set(k,m=new Map());for(const id of new Set(ids))if(members.has(id))m.set(id,(m.get(id)||0)+1);}
  const ok=new Set([...per].filter(([,m])=>{const c=[...m.values()];if(!c.some(x=>x>=2))return false;return !(members.size>=2&&m.size>=members.size&&c.every(x=>x>=n*.9));}).map(([k])=>k));
  const total=new Map();
  for(const s of samples){const ids=new Set();for(const k of ok)for(const id of s.talking?.[k]||[])if(members.has(id))ids.add(id);for(const id of ids)total.set(id,(total.get(id)||0)+1);}
  const list=[...total].filter(([,c])=>c>=Math.max(2,n*.2)).sort((a,b)=>b[1]-a[1]);
  if(!list.length)return {talkers:[],ok};
  return {talkers:list.filter(([,c])=>c>=list[0][1]*.4).map(([id])=>id),ok};
 }

 // ── One call: stable "Speaker N" labels and what was learned about whose track is whose ──────────
 class CallSpeakers{
  constructor(){this.reset();}
  reset(){this.labels=new Map();this.next=1;this.co=new Map();this.names=new Map();this.room='';}
  /** A new Steam voice room is a new call. */
  sync(room){room=String(room||'');if(room&&this.room&&room!==this.room)this.reset();if(room)this.room=room;}
  label(key){if(!this.labels.has(key))this.labels.set(key,this.next++);return this.labels.get(key);}
  add(key,id,n){let row=this.co.get(key);if(!row)this.co.set(key,row=new Map());row.set(id,(row.get(id)||0)+n);}
  /** Track `key` is this person once their talking lined up with it clearly, and with no other track as well. */
  person(key){
   const row=this.co.get(key);if(!row)return null;const list=[...row].sort((a,b)=>b[1]-a[1]);const [id,best]=list[0]||[];
   if(!id||best<6||(list[1]&&list[1][1]*2>best))return null;
   for(const [other,r] of this.co)if(other!==key&&(r.get(id)||0)*1.5>best)return null;
   return id;
  }
  /** Learns from one capture: Steam's proven signals against which tracks talked, or the one person in voice. */
  learn(capture,ok,members,solo,tracks){
   if(solo){if(tracks.top&&!tracks.overlap.length)this.add(tracks.top.key,solo,3);return;}
   if(!ok?.size)return;
   for(const s of capture.samples){const v=s.tracks,t=new Set();for(const k of ok)for(const id of s.talking?.[k]||[])if(members.has(id))t.add(id);
    if(!v.length||!t.size)continue;if(v.length===1&&t.size===1){this.add(v[0],[...t][0],2);continue;}
    if(v.length*t.size<=4)for(const k of v)for(const id of t)this.add(k,id,1);}
  }
 }

 /**
  * Who said a finished utterance. Returns {speaker:{id,name}|null, source:'steam'|'track'|'solo'|'unknown',
  * overlap:[names], how}. steam: the latest SteamReader.sample() (or null); tracks: Map(track key →
  * {ssrc:[...], tokens:[...]}) for the ids Steam gives each track (its SSRCs, stream ids and description).
  */
 function attribute({capture,call,steam=null,tracks=new Map()}){
  call.sync(steam?.roomId);
  const members=new Map((steam?.members||[]).filter(m=>STEAM_ID.test(m.id)).map(m=>[m.id,m]));
  for(const m of members.values())call.names.set(m.id,cleanName(m.name)||'Steam member');while(call.names.size>64)call.names.delete(call.names.keys().next().value);
  const byAccount=new Map([...members.values()].map(m=>[m.accountid,m.id]));
  const nameOf=id=>members.get(id)?.name||call.names.get(id)||'Steam member';
  const tr=trackResult(capture),solo=steam?.solo&&members.has(steam.solo.id)?steam.solo.id:null;
  const st=steamResult(capture.samples||[],members,steam?.useful);
  call.learn(capture,st.ok,members,solo,tr);
  function personOf(key){
   const info=tracks.get(key)||{},ssrc=(info.ssrc||[]).map(String);
   for(const s of ssrc){const id=steam?.ssrc?.[s];if(id&&members.has(id))return {id,how:'ssrc'};}
   for(const t of info.tokens||[]){const sid=(/7656119\d{10}/.exec(String(t))||[])[0];if(sid&&members.has(sid))return {id:sid,how:'sdp'};
    if(/^\d{1,10}$/.test(String(t))&&!ssrc.includes(String(t))){const id=byAccount.get(Number(t));if(id)return {id,how:'sdp'};}}
   const learned=call.person(key);if(learned&&(!members.size||members.has(learned)))return {id:learned,how:'learned'};
   return null;
  }
  const who=key=>{const p=personOf(key);if(p)return {id:p.id,name:nameOf(p.id),how:p.how};const n=call.label(key);return {id:'voice:speaker-'+n,name:'Speaker '+n,how:'label'};};
  const several=list=>{const seen=new Map();for(const p of list)if(!seen.has(p.id))seen.set(p.id,p);return seen.size>1?[...seen.values()].map(p=>p.name):[];};
  if(solo)return {speaker:{id:solo,name:nameOf(solo)},source:'solo',overlap:[],how:'solo'};
  if(st.talkers.length){
   const people=st.talkers.map(id=>({id,name:nameOf(id)}));let overlap=several(people);
   // Steam lit one person, but two tracks talked: only when both tracks are named people does that count.
   if(!overlap.length&&tr.overlap.length){const named=tr.overlap.map(t=>personOf(t.key));if(named.every(Boolean)&&named.some(p=>p.id===people[0].id))overlap=several(named.map(p=>({id:p.id,name:nameOf(p.id)})));}
   return {speaker:people[0],source:'steam',overlap,how:'steam'};
  }
  if(!tr.silent){const top=who(tr.top.key);return {speaker:{id:top.id,name:top.name},source:'track',overlap:tr.overlap.length?several(tr.overlap.map(t=>who(t.key))):[],how:top.how};}
  return {speaker:null,source:'unknown',overlap:[],how:'none'};
 }

 // ── Steam's own "who's talking" data (MAIN world; steam-chat-main.js hands over the voice room) ──
 // Steam doesn't document what lights up a talking member, so every plausible place is tried, read-only:
 // talking-like fields and methods on the voice members, on the voice member list, the room, Steam's
 // VoiceChat store and its call state, and talking-like classes in the voice list. A signal counts only once
 // it has switched on and off for the same person; every read is guarded and nothing here ever throws.
 const TALK_NAME=/speak|talk|voice_?(?:level|activity)|audio_?level|(?:^|[^a-z])vad|(?:^|[^c])loud/i;
 const NOT_TALK=/mute|deaf|enable|allow|permission|setting|pref|device|gain|volume|ptt|push/i;
 const TALK_METHOD=/^(?:B?Is|B|Get)[A-Za-z]*(?:Speaking|Talking|Speaks|Talks|VoiceLevel|AudioLevel|VoiceActivity)/;
 const TALK_CLASS=/speaking|talking|isspeak|istalk|voiceactiv/i;
 const SSRC_NAME=/ssrc/i;
 const INVENTORY=/voice|speak|talk|level|audio|ssrc|mute|activ|peer|stream|track|member|user/i;
 function propNames(obj){
  const out=new Set();let o=obj,d=0;
  while(o&&(typeof o==='object'||typeof o==='function')&&d<5&&o!==Object.prototype&&o!==Function.prototype){
   try{for(const n of Object.getOwnPropertyNames(o)){if(out.size>=500)break;if(n==='constructor'||n.startsWith('__'))continue;out.add(n);}}catch{break;}
   try{o=Object.getPrototypeOf(o);}catch{break;}d++;
  }
  return [...out];
 }
 const isMapLike=v=>!!v&&typeof v==='object'&&typeof get(v,'has')==='function'&&typeof get(v,'get')==='function'&&typeof get(v,'keys')==='function';
 const isSetLike=v=>!!v&&typeof v==='object'&&typeof get(v,'has')==='function'&&typeof get(v,'values')==='function'&&typeof get(v,'get')!=='function';
 const kindOf=v=>v===null?'null':Array.isArray(v)?'array':isMapLike(v)?'map':isSetLike(v)?'set':typeof v;
 /** A talking value: boolean as is, a number as a level, an object by its own talking-like field. */
 function talkValue(v,depth=0){
  if(typeof v==='boolean')return v;if(typeof v==='number')return Number.isFinite(v)?v:null;
  if(v&&typeof v==='object'&&depth<1){for(const n of propNames(v).slice(0,80))if(TALK_NAME.test(n)&&!NOT_TALK.test(n)){const x=talkValue(get(v,n),depth+1);if(x!==null&&x!==undefined)return x;}}
  return null;
 }
 /** Is this member in a talking collection (Set, Array, Map or plain object keyed by account)? undefined: can't tell. */
 function inCollection(coll,m){
  const keys=[m.accountid,String(m.accountid),m.id];
  try{
   if(isSetLike(coll))return keys.some(k=>coll.has(k));
   if(Array.isArray(coll)){const list=coll.slice(0,256);return list.some(x=>keys.includes(x)||account(get(x,'accountid'))===m.accountid);}
   if(isMapLike(coll)){for(const k of keys)if(coll.has(k)){const v=talkValue(coll.get(k));return v===null?true:v;}return false;}
   if(coll&&typeof coll==='object'){for(const k of keys)if(Object.prototype.hasOwnProperty.call(coll,String(k))){const v=talkValue(coll[String(k)]);return v===null?true:v;}return false;}
  }catch{}
  return undefined;
 }
 /** A Steam account behind a voice-list element: data attributes, React props, or a unique name on it. */
 function memberOf(el,src){
  const byAccount=src.byAccount,byName=src.byName;
  for(let n=el,i=0;n&&i<7;n=n.parentElement,i++){
   const a=n.getAttribute?.bind(n);if(a){const sid=a('data-steamid')||'';if(STEAM_ID.test(sid)&&src.ids.has(sid))return sid;for(const k of ['data-miniprofile','data-accountid','data-account-id']){const id=byAccount.get(account(a(k)));if(id)return id;}}
   let keys=[];try{keys=Object.keys(n).filter(k=>/^__react(?:Props|Fiber)\$/.test(k)).slice(0,3);}catch{}
   for(const k of keys){let p=own(n,k);if(k.startsWith('__reactFiber$'))p=own(p,'memoizedProps');const id=accountIn(p,byAccount,0);if(id)return id;}
  }
  for(let n=el,i=0;n&&i<5;n=n.parentElement,i++){
   let text='';try{text=String(n.textContent||'');}catch{}if(!text||text.length>200)continue;
   const hits=new Set();for(const [name,id] of byName)if(text.includes(name))hits.add(id);if(hits.size===1)return [...hits][0];if(hits.size>1)return null;
  }
  return null;
 }
 function accountIn(p,byAccount,depth){
  if(!p||typeof p!=='object'||depth>2)return null;
  for(const k of ['accountid','unAccountID','m_unAccountID','accountID']){const id=byAccount.get(account(get(p,k)));if(id)return id;}
  for(const k of ['steamid','steamID','strSteamID']){const v=String(get(p,k)??'');if(STEAM_ID.test(v)&&[...byAccount.values()].includes(v))return v;}
  for(const k of ['friend','member','persona','player','user','voiceMember','participant','m_friend','m_player']){const id=accountIn(own(p,k)??get(p,k),byAccount,depth+1);if(id)return id;}
  return null;
 }
 class SteamReader{
  constructor(){this.planned=null;this.planKey='';this.planAt=0;this.stats=new Map();this.classes=new Map();this.samples=0;this.ssrcFields=new Set();this.ssrcMapped=0;this.inventory={};this.unusable=new Map();this.containers=[];this.containersAt=0;}
  /** Which talking-like fields, methods and collections exist (looked up again every 5 s or when the call changes). */
  plan(src,now=Date.now()){
   const key=String(src.roomId||'')+'|'+src.members.map(m=>m.accountid).join(',');
   if(this.planned&&this.planKey===key&&now-this.planAt<5000)return this.planned;
   const signals=[],ssrc=[];
   const objs=src.members.slice(0,8).map(m=>m.obj).filter(o=>o&&typeof o==='object'),names=new Set();for(const o of objs)for(const n of propNames(o))names.add(n);
   this.inventory.member=[...names].filter(n=>INVENTORY.test(n)).slice(0,60);
   for(const n of names){
    if(SSRC_NAME.test(n)){ssrc.push({kind:'member-ssrc',name:n});this.ssrcFields.add('member.'+n);continue;}
    if(!TALK_NAME.test(n)||NOT_TALK.test(n))continue;
    let v;for(const o of objs){v=get(o,n);if(v!==undefined)break;}
    if(typeof v==='function'){if(TALK_METHOD.test(n))signals.push({key:'member.'+n+'()',kind:'member-method',name:n});else this.unusable.set('member.'+n,'method');}
    else if(typeof v==='boolean'||typeof v==='number'||v===undefined||v===null)signals.push({key:'member.'+n,kind:'member-field',name:n});
    else this.unusable.set('member.'+n,kindOf(v));
   }
   for(const [label,obj] of src.holders||[]){
    if(!obj||typeof obj!=='object')continue;const list=propNames(obj);this.inventory[label]=list.filter(n=>INVENTORY.test(n)).slice(0,80);
    for(const n of list){
     if(SSRC_NAME.test(n)){const v=get(obj,n);if(v&&typeof v==='object'){ssrc.push({kind:'holder-ssrc',label,name:n});this.ssrcFields.add(label+'.'+n);}continue;}
     if(!TALK_NAME.test(n)||NOT_TALK.test(n))continue;
     const v=get(obj,n),k=kindOf(v);
     if(k==='function'){if(TALK_METHOD.test(n)&&signals.filter(s=>s.kind==='holder-method').length<4)signals.push({key:label+'.'+n+'()',kind:'holder-method',label,name:n});else this.unusable.set(label+'.'+n,'method');}
     else if(['set','map','array','object'].includes(k)){if(signals.filter(s=>s.kind==='holder-collection').length<6)signals.push({key:label+'.'+n,kind:'holder-collection',label,name:n,type:k});}
     else this.unusable.set(label+'.'+n,k+(typeof v==='boolean'||typeof v==='number'?' = '+String(v):''));
    }
   }
   while(this.unusable.size>40)this.unusable.delete(this.unusable.keys().next().value);
   this.planned={signals:signals.slice(0,16),ssrc:ssrc.slice(0,6)};this.planKey=key;this.planAt=now;return this.planned;
  }
  stat(key,kind){let s=this.stats.get(key);if(!s){s={key,kind,samples:0,flagged:0,on:new Set(),off:new Set(),max:0,types:new Set()};if(this.stats.size<40)this.stats.set(key,s);}return s;}
  /** The members one signal marks as talking right now; also notes who it marked as not talking. */
  read(sig,src){
   const s=this.stat(sig.key,sig.kind),holder=sig.label?(src.holders||[]).find(h=>h[0]===sig.label)?.[1]:null,ids=[];let seen=false;
   const coll=sig.kind==='holder-collection'?get(holder,sig.name):undefined;
   for(const m of src.members){
    let v;
    try{
     if(sig.kind==='member-field')v=get(m.obj,sig.name);
     else if(sig.kind==='member-method'){const f=get(m.obj,sig.name);v=typeof f==='function'?f.call(m.obj):undefined;}
     else if(sig.kind==='holder-method'){const f=get(holder,sig.name);v=typeof f==='function'?f.call(holder,m.accountid):undefined;}
     else if(sig.kind==='holder-collection')v=coll===undefined||coll===null?undefined:inCollection(coll,m);
    }catch{v=undefined;}
    const t=talkValue(v);if(t===null||t===undefined)continue;seen=true;s.types.add(typeof t);
    let on;if(typeof t==='number'){if(t>s.max)s.max=t;on=t>0&&t>=s.max*.25;}else on=t;
    if(on){ids.push(m.id);s.on.add(m.id);}else s.off.add(m.id);
   }
   if(seen){s.samples++;if(ids.length)s.flagged++;}
   return seen?ids:null;
  }
  /** Talking-like classes in Steam's voice list, matched to the member each one belongs to. */
  classSample(src,now){
   const out={};
   if(now-this.containersAt>2000||this.containers.some(c=>!c.isConnected)){this.containersAt=now;this.containers=(src.dom?.()||[]).slice(0,6);}
   for(const box of this.containers){
    let els=[];try{els=[box,...box.querySelectorAll('*')].slice(0,400);}catch{continue;}
    for(const el of els){
     let cls='';try{cls=String(el.getAttribute?.('class')||'');}catch{}if(!cls||!TALK_CLASS.test(cls))continue;
     for(const token of cls.split(/\s+/).filter(t=>TALK_CLASS.test(t)&&!NOT_TALK.test(t)).slice(0,3)){
      let c=this.classes.get(token);if(!c){if(this.classes.size>=20)continue;this.classes.set(token,c={token,seen:0,matched:0,unmatched:0});}
      c.seen++;const id=memberOf(el,src);if(id){c.matched++;(out['class .'+token]||=[]).push(id);}else c.unmatched++;
     }
    }
   }
   for(const token of this.classes.keys()){const key='class .'+token,s=this.stat(key,'class'),ids=new Set(out[key]||[]);s.samples++;if(ids.size)s.flagged++;s.types.add('class');for(const m of src.members)(ids.has(m.id)?s.on:s.off).add(m.id);out[key]=[...ids];}
   return out;
  }
  /** Ids Steam itself gives the audio of each person (SSRC), when its stores carry them. */
  ssrcSample(src,plan){
   const map={};
   for(const p of plan.ssrc){
    try{
     if(p.kind==='member-ssrc'){for(const m of src.members){const v=get(m.obj,p.name);for(const x of [].concat(v??[]))if(/^\d{1,10}$/.test(String(x)))map[String(x)]=m.id;}continue;}
     const holder=(src.holders||[]).find(h=>h[0]===p.label)?.[1],coll=get(holder,p.name);if(!coll||typeof coll!=='object')continue;
     const entries=isMapLike(coll)?[...coll.entries()].slice(0,64):Object.entries(coll).slice(0,64);
     for(const [k,v] of entries){
      const ka=src.byAccount.get(account(k)),va=src.byAccount.get(account(typeof v==='object'?get(v,'accountid'):v));
      const kv=typeof v==='object'?get(v,'ssrc')??get(v,'m_ssrc'):v;
      if(ka&&/^\d{1,10}$/.test(String(kv)))map[String(kv)]=ka;else if(va&&/^\d{1,10}$/.test(String(k)))map[String(k)]=va;
     }
    }catch{}
   }
   this.ssrcMapped=Math.max(this.ssrcMapped,Object.keys(map).length);return map;
  }
  /** One look: members, the one other person (when there's exactly one), each signal's talkers, SSRC ids. */
  sample(input,now=Date.now()){
   const src=this.source(input);if(!src)return null;this.samples++;
   const plan=this.plan(src,now),talking={};
   for(const sig of plan.signals){const ids=this.read(sig,src);if(ids)talking[sig.key]=ids;}
   Object.assign(talking,this.classSample(src,now));
   const useful=this.useful(),others=src.members;
   return {roomId:src.roomId,self:src.self,members:others.map(({id,name,accountid})=>({id,name,accountid})),
    solo:src.self!==null&&others.length===1?{id:others[0].id,name:others[0].name}:null,talking,useful,ssrc:this.ssrcSample(src,plan),found:useful.join(', ')};
  }
  /** Signals seen switching on and off for the same person this session. */
  useful(){return [...this.stats.values()].filter(s=>[...s.on].some(id=>s.off.has(id))).map(s=>s.key);}
  source(input){
   if(!input||typeof input!=='object')return null;
   const self=account(input.self),members=[];
   for(const m of (Array.isArray(input.members)?input.members:[]).slice(0,64)){const n=account(m?.accountid);if(n===null||n===self)continue;members.push({accountid:n,id:steamOf(n),name:cleanName(m.name)||'Steam member',obj:m.obj});}
   const byAccount=new Map(members.map(m=>[m.accountid,m.id])),counts=new Map();for(const m of members)if(m.name.length>=2)counts.set(m.name,(counts.get(m.name)||0)+1);
   const byName=new Map(members.filter(m=>counts.get(m.name)===1).map(m=>[m.name,m.id]));
   return {roomId:String(input.roomId||''),self,members,holders:Array.isArray(input.holders)?input.holders:[],dom:typeof input.dom==='function'?input.dom:()=>[],byAccount,byName,ids:new Set(byAccount.values())};
  }
  /** What exists and what fired this session: field, method and class names with counts (never chat text). */
  report(input){
   const src=this.source(input);if(src)this.plan(src);
   const useful=new Set(this.useful());
   return {room:!!src,members:src?src.members.length:null,samples:this.samples,
    signals:[...this.stats.values()].map(s=>({key:s.key,type:[...s.types].join('/')||'unread',samples:s.samples,flagged:s.flagged,people:s.on.size,switched:useful.has(s.key)})),
    planned:(this.planned?.signals||[]).map(s=>s.key),other:[...this.unusable].map(([k,v])=>k+' ('+v+')').slice(0,20),
    classes:[...this.classes.values()].map(c=>({...c})),ssrc:{fields:[...this.ssrcFields].slice(0,8),mapped:this.ssrcMapped},inventory:{...this.inventory}};
  }
 }
 /** The full check's and the Signal trail's words for a report (names of fields and classes, and counts). */
 function summary(r){
  if(!r)return 'No answer from Steam’s voice data.';
  if(r.error)return 'Steam’s voice data couldn’t be read ('+cleanName(r.error,100)+').';
  if(!r.room)return 'Not in a Steam voice call that Tyler can see, so Steam’s talking data wasn’t checked.';
  const used=r.signals.filter(s=>s.switched),seen=r.signals.filter(s=>!s.switched&&s.samples);
  const parts=[];
  parts.push(used.length?'Steam’s talking data used: '+used.map(s=>s.key+' ('+s.type+', on '+s.flagged+'/'+s.samples+', '+s.people+' people)').join('; '):'No Steam talking signal has switched on and off yet'+(r.samples?' ('+r.samples+' looks)':'')+'.');
  if(seen.length)parts.push('Seen but never switching: '+seen.map(s=>s.key+' ('+s.type+', on '+s.flagged+'/'+s.samples+')').join('; '));
  const waiting=(r.planned||[]).filter(k=>!r.signals.some(s=>s.key===k));if(waiting.length)parts.push('Talking-like fields not read yet: '+waiting.join(', '));
  if(r.classes?.length)parts.push('Classes: '+r.classes.map(c=>'.'+c.token+' ('+c.seen+' seen, '+c.matched+' matched to a member)').join('; '));else parts.push('No talking-like class in the voice list.');
  if(r.other?.length)parts.push('Other talking-like names: '+r.other.join(', '));
  if(r.ssrc?.fields?.length)parts.push('SSRC fields: '+r.ssrc.fields.join(', ')+' ('+r.ssrc.mapped+' mapped)');
  for(const [k,v] of Object.entries(r.inventory||{}))if(v?.length)parts.push(k+' fields: '+v.join(', '));
  return parts.join(' · ').slice(0,2400);
 }

 // ── The background's side: checked attribution → heard line, rule, memory author ───────────────
 const SOURCES=['steam','track','solo','unknown'];
 /** An attribution as it arrives from the panel, checked. Unusable → null (the turn goes out as before). */
 function clean(v){
  if(!v||typeof v!=='object'||!SOURCES.includes(v.source))return null;
  const unknown={speaker:null,source:'unknown',overlap:[]};if(v.source==='unknown')return unknown;
  const raw=v.speaker&&typeof v.speaker==='object'?v.speaker:null,id=String(raw?.id??'').slice(0,40),label=LABEL_ID.exec(id);
  let speaker=null;
  if(STEAM_ID.test(id)){const name=cleanName(raw.name);if(name)speaker={id,name};}
  else if(label&&v.source==='track')speaker={id,name:'Speaker '+Number(label[1])};
  if(!speaker)return unknown;
  const overlap=[...new Set((Array.isArray(v.overlap)?v.overlap:[]).slice(0,6).map(n=>cleanName(n)).filter(Boolean))].slice(0,4);
  return {speaker,source:v.source,overlap:overlap.length>=2?overlap:[]};
 }
 const joinNames=list=>list.length<2?list.join(''):list.slice(0,-1).join(', ')+' and '+list.at(-1);
 /** "Sam (in voice): …", "Speaker 2 (in voice, name unknown): …", "Sam and Alex talking at once: …". */
 function line(v,heard){
  const w=clean(v),text=String(heard??'');if(!w)return text;
  if(w.overlap.length>=2)return joinNames(w.overlap)+' talking at once: '+text;
  if(!w.speaker)return 'Unknown speaker (in voice): '+text;
  return w.speaker.name+(STEAM_ID.test(w.speaker.id)?' (in voice): ':' (in voice, name unknown): ')+text;
 }
 /** The panel's "Heard …" label. */
 function label(v){const w=clean(v);if(!w)return '';return w.overlap.length>=2?joinNames(w.overlap):w.speaker?w.speaker.name:'(speaker unknown)';}
 const RULE='VOICE SPEAKERS: Each voice line starts with who said it, taken from Steam\'s own call data, like "Sam (in voice): words". Answer that person, and if you use a name, use only that one. Never say that someone else said those words, and don\'t mix people up. "Speaker 2 (in voice, name unknown)" is a person whose name isn\'t known: don\'t guess or invent a name for them. "Sam and Alex talking at once" means their words were mixed: don\'t claim which of them said what. "Unknown speaker" means nobody knows who spoke.';
 /** For the prompt: the rule, and the author for per-friend memory (only a person known by Steam id, alone). */
 function prompt(v){const w=clean(v);if(!w)return null;const author=w.speaker&&STEAM_ID.test(w.speaker.id)&&w.overlap.length<2&&w.source!=='unknown'?{...w.speaker}:null;return {who:w,author,rule:RULE};}

 globalThis.TylerVoiceSpeakers=Object.freeze({TrackMeter,Capture,CallSpeakers,SteamReader,attribute,trackResult,steamResult,summary,clean,line,label,prompt,RULE,MIN_TICKS});
})();

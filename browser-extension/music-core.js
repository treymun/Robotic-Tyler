(()=>{
 const reserved=/^(?:vault|scramble|trivia|hangman|math|riddle|reverse|rps|again)(?:\s|$)/i;
 function parse(text){
  const value=String(text||'').trim();if(!value||value.length>240||(globalThis.TylerChatTag?globalThis.TylerChatTag.tagged(value):/^\s*\[ROBOTIC TYLER\]/i.test(value)))return null;
  const request=/^(?:!play|music play|tyler play|robotic tyler play)\s+(.+)$/i.exec(value);
  if(request){const query=request[1].trim();if(reserved.test(query))return null;return query.length>=2&&query.length<=160?{action:'play',query}:null;}
  const control=/^(?:!music|music)\s+(skip|pause|resume|stop|clear|reset|queue|now|help)$/i.exec(value);
  if(control)return {action:control[1].toLowerCase()};
  // v2.20.3: music quality low / medium / high / auto, or on its own to show the current one.
  const quality=/^(?:!music|music)\s+quality(?:\s+(low|medium|high|auto))?$/i.exec(value);
  if(quality)return {action:'quality',level:quality[1]?quality[1].toLowerCase():null};
  const volume=/^(?:!music|music)\s+volume\s+(\d{1,3})$/i.exec(value);
  return volume&&Number(volume[1])<=200?{action:'volume',value:Number(volume[1])}:null;
 }
 const clean=value=>String(value||'').replace(/[\u0000-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069]/g,' ').replace(/\s+/g,' ').trim();
 function person(value){return {id:String(value?.id||'unknown').slice(0,200),name:clean(value?.name||'Someone in chat').slice(0,40)||'Someone in chat'};}
 const hasVoterId=value=>/^7656119\d{10}$/.test(value?.id||'');
 function createSpamGuard(){
  const people=new Map();let windowAt=-Infinity,roomCount=0,lastReset=-Infinity;
  return {allow(action,speaker,now=Date.now()){
   const key=hasVoterId(speaker)?speaker.id:'unidentified',old=people.get(key);
   const group=action==='play'?'request':'control',wait=group==='request'?5000:2000;
   if(old&&now-old[group]<wait)return {ok:false,reason:'Music spam blocked: wait '+Math.ceil((wait-(now-old[group]))/1000)+'s before another '+(group==='request'?'song request.':'music command.')};
   if(action==='clear'&&now-lastReset<10000)return {ok:false,reason:'Music cleanup cooldown: wait a few seconds, or use the Music panel.'};
   const stopVote=action==='stop'||action==='reset';if(now-windowAt>=10000){windowAt=now;roomCount=0;}if(roomCount>=8&&!stopVote)return {ok:false,reason:'Music is handling a burst of requests. Try again shortly.'};
   if(!stopVote)roomCount++;const record=old||{request:-Infinity,control:-Infinity};record[group]=now;people.delete(key);people.set(key,record);while(people.size>200)people.delete(people.keys().next().value);
   if(action==='clear')lastReset=now;return {ok:true};
  }};
 }
 function fairOrder(waiting,last){
  const groups=new Map();for(const song of waiting){const id=song.requester.id;if(!groups.has(id))groups.set(id,[]);groups.get(id).push(song);}
  const ids=[...groups.keys()].filter(id=>id!==last);if(groups.has(last))ids.push(last);
  const result=[];while(result.length<waiting.length)for(const id of ids){const song=groups.get(id).shift();if(song)result.push(song);}return result;
 }
 function createSession(){
  let waiting=[],current=null,last=null,sequence=0;const skipVotes=new Set(),stopVotes=new Set();
  const clearVotes=()=>{skipVotes.clear();stopVotes.clear();};
  const reorder=()=>waiting=fairOrder(waiting,last);
  const clearTrack=()=>{current=null;clearVotes();};
  return {
   get current(){return current;},get waiting(){return waiting.slice();},
   add(query,value){
    const requester=person(value);query=clean(query);
    if(query.length<2||query.length>160)return {error:'Use a song request between 2 and 160 characters.'};
    if([current,...waiting].some(s=>s&&s.query.toLowerCase()===query.toLowerCase()))return {error:'That request is already playing or queued.'};
    if(waiting.length>=12)return {error:'Music queue is full (12 waiting requests).'};
    if(waiting.filter(s=>s.requester.id===requester.id).length>=3)return {error:requester.name+' already has 3 songs waiting. Let someone else pick a song.'};
    const song={id:++sequence,query,requester};waiting.push(song);reorder();return {song,position:waiting.indexOf(song)+1};
   },
   next(now=Date.now()){
    if(current)return current;reorder();const song=waiting.shift();if(!song)return null;
    current={...song,token:'dj-'+now.toString(36)+'-'+song.id,started:now,reported:false,title:''};last=song.requester.id;clearVotes();reorder();return current;
   },
   finish(token){if(!current||current.token!==token)return false;clearTrack();return true;},
   clear(){const removed=waiting.length;waiting=[];return removed;},
   stop(){waiting=[];clearTrack();last=null;},
   vote(value,kind='skip',{soloId=null}={}){
    if(!current&&(kind!=='stop'||!waiting.length))return {error:'Nothing is playing'+(kind==='stop'?' or queued to stop.':' to skip.')};
    const votes=kind==='stop'?stopVotes:skipVotes;
    const p=person(value);if(!hasVoterId(p))return {error:'I could not automatically read your Steam account identity for that vote. Names alone do not count. Check Sender check in the Music panel, or ask the DJ to use Skip now.'};
    const needed=kind==='skip'&&hasVoterId({id:soloId})&&soloId===p.id?1:2;
    if(votes.has(p.id))return {duplicate:true,count:needed===1?1:votes.size,needed,skip:needed===1,name:p.name};
    votes.add(p.id);return {count:needed===1?1:votes.size,needed,skip:needed===1||votes.size>=needed,name:p.name};
   }
  };
 }
 const songLabel=song=>(clean(song.title)||clean(song.query))+' · '+song.requester.name;
 function nowCard(current,waiting=[]){
  if(!current)return '🎧 TYLER DJ\nNothing playing. Request a song: !play ARTIST SONG';
  return ['🎶 ━━━ NOW PLAYING ━━━','▶ '+(clean(current.title)||clean(current.query)),'👤 Requested by '+current.requester.name,waiting.length?'⏭ Next: '+songLabel(waiting[0]):'⏭ Your pick next: !play ARTIST SONG','🎧 '+waiting.length+' waiting · music queue · music skip'].join('\n');
 }
 function queueCard(current,waiting=[]){return ['🎧 ━━━ TYLER DJ QUEUE ━━━',current?'▶ '+songLabel(current):'Nothing playing.',...waiting.slice(0,6).map((s,i)=>(i+1)+'. '+songLabel(s)),waiting.length>6?'… and '+(waiting.length-6)+' more':!waiting.length?'Queue is open: !play ARTIST SONG':'🔄 Turns rotate between requesters.'].filter(Boolean).join('\n');}
 globalThis.TylerMusic={parse,createSession,nowCard,queueCard,hasVoterId,createSpamGuard};
})();

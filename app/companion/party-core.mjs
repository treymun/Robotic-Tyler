// Game-night coordination utilities. No Steam internals and no network access.
export function cleanLabel(x,n=60){return String(x||'').replace(/[\u0000-\u001f]/g,' ').replace(/\s+/g,' ').trim().slice(0,n);}
export function isVerified(id){return /^7656119\d{10}$/.test(String(id||''));}
export function parsePartyCommand(s){const t=String(s||'').trim();if(!/^!party(?:\s|$)/i.test(t))return null;const m=/^!party(?:\s+(start|join|leave|status|teams|stop|help))?$/i.exec(t);return m?{action:(m[1]||'help').toLowerCase()}:null;}
export function partyCommand(current,action,member,now=Date.now()){
 if(!['start','join','leave','status','teams','stop','help'].includes(action))throw Error('Unknown party command');
 const p=current&&typeof current==='object'?{...current,members:[...(current.members||[])]}:{active:false,members:[],round:0};
 const id=member?.id,name=cleanLabel(member?.name,40)||'Player';if(!isVerified(id))throw Error('Verified Steam account required');
 if(action==='help')return {party:p,message:'Party: !party start, !party join, !party leave, !party status, !party teams, !party stop.'};
 if(action==='start')return {party:{active:true,host:id,at:now,round:0,members:[{id,name}]},message:'Game night started! Approved friends can type !party join. Use !party teams once everyone joins.'};
 if(!p.active)return {party:p,message:'No game night running. Type !party start.'};
 if(action==='status')return {party:p,message:'Game night: '+p.members.length+' player(s) — '+p.members.map(x=>x.name).join(', ').slice(0,180)};
 if(action==='join'){if(!p.members.some(x=>x.id===id)&&p.members.length<16)p.members.push({id,name});return {party:p,message:name+' joined game night ('+p.members.length+'/16).'};}
 if(action==='leave'){p.members=p.members.filter(x=>x.id!==id);return {party:p,message:name+' left game night.'};}
 if(id!==p.host)throw Error('Only the party host can assign teams or stop the event.');
 if(action==='stop')return {party:{...p,active:false,members:[]},message:'Game night closed. Thanks for playing!'};
 if(p.members.length<2)return {party:p,message:'Need at least two approved players to form teams.'};
 // Stable rotating order (no automated data gathering); change teams each call.
 const ordered=[...p.members].sort((a,b)=>a.id.localeCompare(b.id));const shift=(p.round||0)%ordered.length;ordered.push(...ordered.splice(0,shift));p.round=(p.round||0)+1;
 return {party:p,message:'Teams — A: '+ordered.filter((_,i)=>i%2===0).map(x=>x.name).join(', ')+' | B: '+ordered.filter((_,i)=>i%2===1).map(x=>x.name).join(', ')};
}
export function inferScene(lines){const text=(Array.isArray(lines)?lines:[]).slice(-4).map(x=>String(x||'')).join(' ').slice(0,600).toLowerCase();if(/\b(gg|we won|victory|clutch|let.s go|we did it)\b/.test(text))return 'celebration';if(/\b(lost|defeat|we died|wiped|rip|failed)\b/.test(text))return 'supportive';if(/\b(how do i|how to|help me|strategy|counter|build order)\b/.test(text))return 'coach';return 'normal';}
export function sceneStyle(scene){return {celebration:'Keep a celebratory gaming energy, without shouting or overposting.',supportive:'Be relaxed and encouraging after setbacks, with only gentle jokes.',coach:'Give concrete, direct gameplay advice, acknowledge that no live telemetry is available.',normal:'Keep a conversational gaming-friend tone.'}[scene]||'Keep responses natural.';}
export function directorCue(text){const t=cleanLabel(text,260).toLowerCase();if(/\b(gg|we won|victory|clutch)\b/.test(t))return {slot:4,kind:'victory'};if(/\b(we lost|defeat|wiped|game over)\b/.test(t))return {slot:5,kind:'defeat'};if(/\b(bad joke|crickets)\b/.test(t))return {slot:9,kind:'joke'};return null;}
export function shouldNudge(lastMessageAt,lastNudgeAt,now=Date.now()){return Number(lastMessageAt)>0&&now-lastMessageAt>=12*60*1000&&now-lastMessageAt<=14*60*1000&&now-Number(lastNudgeAt||0)>60*60*1000;}

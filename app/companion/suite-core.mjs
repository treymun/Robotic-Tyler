// Browser-first v1.6 feature logic. No Electron or Steam internal APIs required.
export function cleanTitle(s){return String(s||'').replace(/[\u0000-\u001f]/g,' ').trim().slice(0,110);}
export function safeSteamId(s){return /^7656119\d{10}$/.test(String(s||''));}
export function capHistory(rows,limit=60){return (Array.isArray(rows)?rows:[]).filter(x=>x&&typeof x==='object').slice(-limit);}
export function levelFor(xp){const n=Math.max(0,Number(xp)||0);return {level:1+Math.floor(Math.sqrt(n/75)),xp:n,next:75*Math.pow(1+Math.floor(Math.sqrt(n/75)),2)};}
export function chooseVote(votes,title,id){if(!safeSteamId(id))throw Error('Verified Steam ID required');const t=cleanTitle(title);if(t.length<2)throw Error('Game title required');const map={...(votes||{})};for(const key of Object.keys(map)){map[key]={...map[key],ids:(map[key].ids||[]).filter(v=>v!==id)};}const key=t.toLowerCase();map[key]={title:t,ids:[...(map[key]?.ids||[]),id],at:Date.now()};return Object.fromEntries(Object.entries(map).filter(([,v])=>v.ids?.length).slice(-25));}
export function cleanProfile(profile){return {nickname:String(profile?.nickname||'').trim().slice(0,60),favoriteGame:String(profile?.favoriteGame||'').trim().slice(0,80),note:String(profile?.note||'').trim().slice(0,240),optOut:profile?.optOut===true};}
export function diagnosticSummary(s={}){return {model:!!(s.openrouterKey||s.geminiKey),voice:'Chrome extension required for Steam group voice'};}
export function shouldRetry(job,now=Date.now()){return job?.status==='queued'&&now-Number(job.lastChecked||0)>=25000&&now-Number(job.at||0)<86400000;}

// Squad trivia (!trivia / !answer 1-4) draws from the shared 500-question bank
// (trivia-bank.js). A random question not asked recently, with shuffled choices.
export function squadTriviaQuestion(bank,recent=[],random=Math.random){
 const all=(bank||[]).flatMap(c=>c.questions.map(q=>({...q,icon:c.icon,category:c.name})));if(!all.length)throw Error('Trivia questions are missing.');
 const skip=new Set(recent||[]),fresh=all.filter(q=>!skip.has(q.id)),pool=fresh.length?fresh:all;
 const q=pool[Math.min(pool.length-1,Math.floor(random()*pool.length))],choices=[q.answer,...q.wrong];
 for(let i=choices.length-1;i>0;i--){const j=Math.floor(random()*(i+1));[choices[i],choices[j]]=[choices[j],choices[i]];}
 return {id:q.id,icon:q.icon,category:q.category,level:q.level,question:q.question,choices,answer:choices.indexOf(q.answer)+1};
}
export function squadTriviaCard(q){
 return q.icon+' SQUAD TRIVIA · '+q.category+'\n❓ '+q.question+'\n'+q.choices.map((c,i)=>['1️⃣','2️⃣','3️⃣','4️⃣'][i]+' '+c).join('\n')+'\n⌨️ Type !answer 1-4 · 90 seconds · +25 XP';
}
export function parseTriviaCommand(s){const t=String(s||'').trim();if(/^!trivia$/i.test(t))return {cmd:'start'};const m=/^!answer\s+([1-4])$/i.exec(t);return m?{cmd:'answer',choice:Number(m[1])}:null;}

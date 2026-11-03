// ROBOTIC TYLER trivia, played in Steam chat: 500 questions in 10 categories
// (trivia-bank.js). Group race or solo; pick a category, a difficulty and a
// length; speed, streak (questions won back to back) and final-question bonuses; a 50/50 hint; the next
// question follows on its own; final results with awards.
//
// Steam shows typed [b]-style tags literally, so the cards use emoji, colour
// squares and Unicode bold headers. Tyler's own lines come back through the
// chat reader, so every line Tyler posts starts with an emoji or symbol and can
// never read as an answer or a command (tests replay a whole match to check).
(()=>{
 const core=TylerSoundboard,previous=core.arcade,bank=TylerTriviaBank;
 const ANSWER_MS=45000,NEXT_MS=8000,MIN_LEN=3,MAX_LEN=20,DEFAULT_LEN=10;
 const LENGTH_WORDS={quick:5,short:5,long:15,marathon:20};
 const LEVELS={easy:1,medium:2,hard:3},LEVEL_NAME=['Any','Easy','Medium','Hard'],LEVEL_DOT=['🎚️','🟢','🟡','🔴'],BASE=[0,100,150,200];
 const KEYS=['🟥','🟦','🟨','🟩'],LETTERS='ABCD',RULE='━━━━━━━━━━━━━━━━━━',medals=['🥇','🥈','🥉'];
 const CHEERS=['GOT IT','NAILED IT','KNEW IT','CALLED IT','CRUSHED IT'];
 const TOTAL=bank.reduce((n,c)=>n+c.questions.length,0);
 const clean=t=>String(t||'').trim().toLowerCase().replace(/[.!?)]+$/,'').replace(/\s+/g,' ');
 const safe=t=>String(t||'').replace(/[\r\n<>\[\]|]/g,' ').trim().slice(0,40);
 // Mathematical sans-serif bold letters and digits: bold headers without markup.
 const bold=s=>String(s).replace(/[A-Za-z0-9]/g,c=>{const n=c.charCodeAt(0);return String.fromCodePoint(n<58?0x1D7EC+n-48:n<91?0x1D5D4+n-65:0x1D5EE+n-97);});
 const num=n=>Math.round(n).toLocaleString('en-US');
 const secs=ms=>(Math.max(0,ms)/1000).toFixed(1)+'s';
 const category=id=>bank.find(c=>c.id===id);
 const findCategory=word=>bank.find(c=>c.id===word||c.aliases.includes(word));
 const ranked=t=>[...t.players].sort((a,b)=>b.score-a.score||b.correct-a.correct);
 const option=(q,i)=>KEYS[i]+' '+LETTERS[i]+' · '+q.options[i];
 const answerLine=q=>option(q,q.options.indexOf(q.answer));
 const copy=t=>t&&{...t,used:[...t.used],players:t.players.map(p=>({...p,badges:[...p.badges]})),question:t.question?{...t.question,answered:[...t.question.answered]}:null};
 const newPlayer=who=>({key:who.key,name:who.name,score:0,correct:0,attempts:0,streak:0,best:0,fastest:0,badges:[]});

 // ── Cards ───────────────────────────────────────────────────────────────
 const mixName=t=>(t.category==='mixed'?'🎲 Mixed':category(t.category).icon+' '+category(t.category).name)+(t.level?' · '+LEVEL_DOT[t.level]+' '+LEVEL_NAME[t.level]:'');
 function welcome(t){
  return ['🎡 '+bold('TYLER TRIVIA'),RULE,
   (t.mode==='group'?'👥 Group race':'👤 Solo')+' · '+mixName(t)+' · '+t.length+' questions',
   t.mode==='group'?'🙋 Anyone can play. Name not showing? Answer like Alex: B':'🙋 Whoever answers first is the player.',
   RULE,''].join('\n');
 }
 function questionCard(t){
  const q=t.question,c=category(q.category);
  return [
   c.icon+' '+bold(c.name.toUpperCase())+' · Question '+t.number+' of '+t.length,
   '▰'.repeat(t.number)+'▱'.repeat(t.length-t.number)+' · '+LEVEL_DOT[q.level]+' '+LEVEL_NAME[q.level]+' · '+BASE[q.level]*(q.final?2:1)+' pts',
   ...(q.final?['💥 '+bold('FINAL QUESTION')+' · double points!']:[]),
   '',
   '❓ '+q.text,
   '',
   ...q.options.map((_,i)=>option(q,i)),
   '',
   '⏱️ 45 seconds · ⚡ answer fast for up to +50',
   t.mode==='group'?'👥 One try each. First right answer scores! Reply A, B, C or D.':'👤 One try. Reply A, B, C or D.'
  ].join('\n');
 }
 function standings(t){
  const list=ranked(t);if(!list.length)return '🏆 No points yet';
  return '🏆 '+list.slice(0,3).map((p,i)=>medals[i]+' '+p.name+' '+num(p.score)).join(' · ')+(list.length>3?' · +'+(list.length-3)+' more':'');
 }
 function board(t,asked=t.number){
  const list=ranked(t);
  return list.length?list.slice(0,10).map((p,i)=>(medals[i]||'🔹')+' '+p.name+' · '+num(p.score)+' pts · '+p.correct+'/'+asked+' right').join('\n'):'🙋 No players yet. Answer a question to join!';
 }
 function awards(t){
  const list=t.players.filter(p=>p.correct>0);if(t.mode!=='group'||!list.length)return [];
  const lines=[],top=(key,better)=>list.reduce((a,b)=>better(b[key],a[key])?b:a);
  const fast=top('fastest',(a,b)=>a<b);lines.push('⚡ Fastest answer: '+fast.name+' · '+secs(fast.fastest));
  const streak=top('best',(a,b)=>a>b);if(streak.best>=2)lines.push('🔥 Best streak: '+streak.name+' · '+streak.best+' in a row');
  const shots=list.filter(p=>p.attempts>=3);
  if(shots.length){const sharp=shots.reduce((a,b)=>b.correct/b.attempts>a.correct/a.attempts?b:a);lines.push('🎯 Sharpshooter: '+sharp.name+' · '+Math.round(100*sharp.correct/sharp.attempts)+'% right');}
  return lines;
 }
 function soloTitle(share){return share>=.9?'🏆 Trivia legend!':share>=.7?'🔥 Big brain energy.':share>=.5?'👍 Solid run.':'🌱 Warming up. Go again?';}
 function results(t,head='🏁 '+bold('FINAL RESULTS')){
  t.done=true;t.nextAt=0;
  const list=ranked(t),lines=[head,RULE],asked=Math.max(1,t.number);
  if(!list.length)lines.push('🦗 Nobody scored this time.');
  else if(t.mode==='solo'){const p=list[0];lines.push('🧠 '+p.name+' · '+num(p.score)+' pts · '+p.correct+'/'+asked+' right',soloTitle(p.correct/asked));}
  else{
   const tie=list.length>1&&list[1].score===list[0].score&&list[0].score>0;
   lines.push(tie?'🤝 Tie at the top with '+num(list[0].score)+' pts!':list[0].score>0?'👑 '+list[0].name+' wins with '+num(list[0].score)+' pts!':'🦗 Nobody scored this time.',board(t,asked));
  }
  const prizes=awards(t);if(prizes.length)lines.push('',...prizes);
  lines.push(RULE,'🔁 Type play trivia to run it back.');
  return lines.join('\n');
 }
 const categoriesCard=()=>['📚 '+bold('TRIVIA CATEGORIES')+' · '+TOTAL+' questions',
  bank.slice(0,5).map(c=>c.icon+' '+c.name).join(' · '),bank.slice(5).map(c=>c.icon+' '+c.name).join(' · '),
  '🎯 Pick one, e.g. play trivia gaming. Add easy, medium or hard and a length from 5 to 20.'].join('\n');
 const helpCard=()=>['🎡 '+bold('TYLER TRIVIA')+' · how to play',
  '▶️ play trivia · a group race of 10 mixed questions',
  '🎛️ Mix it up, e.g. play trivia solo gaming hard 5',
  '🅰️ Answer A–D or type the answer · hint gives a 50/50 for half points',
  '⏭️ next · skip · scores · stop game · trivia categories',
  '⚡ Fast answers earn up to +50 · 🔥 streaks up to +100 · 💥 the last question is worth double'].join('\n');

 // ── Questions ───────────────────────────────────────────────────────────
 const fits=(t,c)=>t.category==='mixed'||c.id===t.category;
 const open=(t,q)=>(!t.level||q.level===t.level)&&!t.used.includes(q.id);
 const available=t=>bank.filter(c=>fits(t,c)).reduce((n,c)=>n+c.questions.filter(q=>open(t,q)).length,0);
 function newQuestion(t,random,now,seen){
  let cats=bank.filter(c=>fits(t,c)&&c.questions.some(q=>open(t,q)));if(!cats.length)return false;
  // Mixed matches don't ask the same category twice in a row.
  if(cats.length>1&&t.lastCategory)cats=cats.filter(c=>c.id!==t.lastCategory);
  const c=cats[Math.min(cats.length-1,Math.floor(random()*cats.length))];
  let pool=c.questions.filter(q=>open(t,q));const fresh=pool.filter(q=>!seen.includes(q.id));if(fresh.length)pool=fresh;
  const q=pool[Math.min(pool.length-1,Math.floor(random()*pool.length))];
  const options=[q.answer,...q.wrong];for(let i=options.length-1;i>0;i--){const j=Math.floor(random()*(i+1));[options[i],options[j]]=[options[j],options[i]];}
  t.number++;t.used.push(q.id);t.lastCategory=c.id;t.nextAt=0;seen.push(q.id);
  t.question={id:q.id,category:c.id,level:q.level,text:q.question,options,answer:q.answer,answered:[],opened:now,until:now+ANSWER_MS,hinted:false,final:t.length>1&&t.number===t.length};
  return true;
 }
 // Is a trivia tick due (time up, or the next question is waiting)? The chat
 // panel checks this once a second and sends "!trivia tick" when it is.
 core.triviaDue=(state,now=Date.now())=>{const t=state?.trivia;if(!t||t.done)return false;return t.question?now>=t.question.until:!!(t.nextAt&&now>=t.nextAt);};

 core.arcade=function(text,state={},random=Math.random,now=Date.now(),speaker=null){
  const input=clean(text);if(/^\[robotic tyler\]/.test(input))return null;
  if(['trivia help','help trivia'].includes(input))return {slot:1,text:helpCard(),next:state};
  if(['trivia categories','trivia topics','trivia category'].includes(input))return {slot:1,text:categoriesCard(),next:state};
  const begin=/^(?:(?:play|start|arcade) trivia|!game trivia|trivia (?:solo|group))(?:\s+(.*))?$/.exec(input);
  let t=copy(state.trivia)||null;const seen=[...(state.triviaSeen||[])];
  let who=speaker?.name?{key:String(speaker.id||'name:'+clean(speaker.name)),name:safe(speaker.name)}:null;
  let answerText=input;
  const named=/^([\p{L}\p{N} _.-]{1,32}):\s*(.+)$/u.exec(String(text).trim());
  if(named){if(!who)who={key:'label:'+clean(named[1]),name:safe(named[1])};answerText=clean(named[2]);}
  function result(message,slot=1){return {slot,text:message,next:{...state,trivia:t,triviaSeen:seen.slice(-TOTAL+20),round:t?.question?{kind:'trivia-party',until:t.question.until}:null,wins:state.wins||0,lastGame:'trivia'}};}
  // After a question: results on the last one, otherwise the next one follows by itself
  // unless nobody tried (then it waits for "next", so an empty room isn't spammed).
  function after(tried){
   if(t.number>=t.length)return '\n\n'+results(t);
   if(tried){t.nextAt=now+NEXT_MS;return '\n⏭️ Question '+(t.number+1)+' in 8 seconds · type next to go now';}
   t.nextAt=0;return '\n😴 Nobody answered. Type next to keep going, or stop game to end.';
  }
  function reveal(head){
   const q=t.question,tried=q.answered.length>0;t.question=null;for(const p of t.players)p.streak=0;
   return result([head,'👉 The answer was '+answerLine(q),...(t.number<t.length?[standings(t)]:[])].join('\n')+after(tried),5);
  }
  if(begin){
   if(state.round?.until>now)return t?result('⏳ A trivia question is already open. Answer it, or type skip or stop game first.'):previous('!game score',state,random,now);
   const words=input.split(' '),mode=words.includes('solo')?'solo':'group';
   const picked=words.map(findCategory).find(Boolean),level=LEVELS[words.find(w=>LEVELS[w])]||0;
   const asked=Number(words.find(w=>/^\d{1,2}$/.test(w)))||LENGTH_WORDS[words.find(w=>LENGTH_WORDS[w])]||DEFAULT_LEN;
   t={mode,category:picked?.id||'mixed',level,length:Math.max(MIN_LEN,Math.min(MAX_LEN,asked)),number:0,used:[],players:[],question:null,soloKey:mode==='solo'?who?.key:null,nextAt:0,done:false,lastCategory:null};
   t.length=Math.min(t.length,available(t));
   if(who)t.players.push(newPlayer(who));
   newQuestion(t,random,now,seen);
   return result(welcome(t)+questionCard(t),3);
  }
  if(!t||state.round&&state.round.kind!=='trivia-party')return previous(text,state,random,now);
  if(input==='!trivia tick'){
   if(t.question&&now>=t.question.until)return reveal('⌛ '+bold('TIME’S UP')+'!');
   if(!t.question&&!t.done&&t.nextAt&&now>=t.nextAt&&newQuestion(t,random,now,seen))return result(questionCard(t),3);
   return null;
  }
  if(['scores','scoreboard','trivia scores','!game score','game status'].includes(input))return result('🏆 '+bold('LEADERBOARD')+' · question '+t.number+' of '+t.length+'\n'+RULE+'\n'+board(t));
  if(['stop game','end game','!game stop','stop trivia'].includes(input)){t.question=null;return result(results(t,'🛑 '+bold('TRIVIA STOPPED')));}
  if(['next','next question','play again','!game again'].includes(input)){
   if(t.question&&now<t.question.until)return result('⏳ The question is still open. Answer it, or type skip to reveal it.');
   if(t.done||t.number>=t.length)return result('🏁 That match is over.\n'+board(t)+'\n🔁 Type play trivia for a new one.');
   if(t.question)return reveal('⌛ '+bold('TIME’S UP')+'!');
   newQuestion(t,random,now,seen);return result(questionCard(t),3);
  }
  if(['skip','!game skip'].includes(input))return t.question?reveal('⏭️ '+bold('SKIPPED')):null;
  if(['hint','!game hint'].includes(input)){
   if(!t.question)return null;
   const q=t.question;if(q.hinted)return result('💡 This question already has its 50/50.');
   q.hinted=true;const wrong=q.options.filter(o=>o!==q.answer),keep=wrong[Math.min(wrong.length-1,Math.floor(random()*wrong.length))];
   const pair=q.options.map((o,i)=>o===q.answer||o===keep?option(q,i):null).filter(Boolean);
   return result('💡 '+bold('50/50')+' · It’s '+pair.join(' or ')+'\n✂️ Right answers now score half points on this one.');
  }
  if(/^join(?:\s+.{1,32})?$/.test(input)){
   if(!who){const label=String(text).trim().slice(5).trim();if(label)who={key:'label:'+clean(label),name:safe(label)};}
   if(!who)return result('🙋 To join, type join Alex, then answer as Alex: B if Steam doesn’t show your name.');
   if(!t.players.some(p=>p.key===who.key))t.players.push(newPlayer(who));
   return result('👋 '+who.name+' joined! '+t.players.length+' on the board.');
  }
  const explicit=/^(?:!game guess|guess|answer|the answer is|my guess is|is it)\s+(.+)$/.exec(answerText);if(explicit)answerText=explicit[1];
  const q=t.question;if(!q)return /^(?:play|start|!game)\s/.test(input)?previous(text,{...state,trivia:null},random,now):null;
  // A–D pick a choice; 1–4 pick a choice too, unless a choice IS that number.
  let guess=q.options.find(o=>clean(o)===answerText);
  if(!guess&&/^[a-d1-4]$/.test(answerText))guess=q.options[/^\d$/.test(answerText)?Number(answerText)-1:answerText.charCodeAt(0)-97];
  if(!guess)return /^(?:play|start|!game)\s/.test(input)?previous(text,state,random,now):null;
  if(now>=q.until)return reveal('⌛ '+bold('TIME’S UP')+'! That answer came in after the timer.');
  if(!who){if(t.mode==='solo')who={key:t.soloKey||'solo',name:t.players.find(p=>p.key===t.soloKey)?.name||'Solo player'};else return result('👤 Steam didn’t show who sent that. Add your name, e.g. Alex: B');}
  if(t.mode==='solo'&&t.soloKey&&who.key!==t.soloKey)return result('👤 This solo match belongs to '+(t.players.find(p=>p.key===t.soloKey)?.name||'the solo player')+'. Start play trivia group next to play together.');
  if(t.mode==='solo')t.soloKey=who.key;
  if(q.answered.includes(who.key))return null;
  q.answered.push(who.key);
  let player=t.players.find(p=>p.key===who.key);if(!player){player=newPlayer(who);t.players.push(player);}
  player.attempts++;
  if(guess!==q.answer){
   player.streak=0;
   if(t.mode==='solo')return reveal('❌ '+bold('NOT QUITE')+', '+player.name+'!');
   return result('❌ '+player.name+' · not quite! One try each · ⏳ '+Math.max(0,Math.ceil((q.until-now)/1000))+'s left for everyone else');
  }
  for(const p of t.players)if(p!==player)p.streak=0;
  const elapsed=now-q.opened,speed=Math.round(50*Math.max(0,q.until-now)/ANSWER_MS/5)*5;
  player.streak++;player.correct++;player.best=Math.max(player.best,player.streak);player.fastest=player.fastest?Math.min(player.fastest,elapsed):elapsed;
  const streakBonus=20*Math.min(5,player.streak-1),base=BASE[q.level];
  let points=base+speed+streakBonus;if(q.hinted)points=Math.round(points/2);if(q.final)points*=2;
  player.score+=points;if(!player.badges.includes(q.category))player.badges.push(q.category);
  const parts=[base+' base',...(speed?['⚡ +'+speed+' speed']:[]),...(streakBonus?['🔥 +'+streakBonus+' streak']:[]),...(q.hinted?['💡 half']:[]),...(q.final?['💥 ×2']:[])];
  const shout=player.streak>=3?'IS ON FIRE':CHEERS[Math.min(CHEERS.length-1,Math.floor(random()*CHEERS.length))];
  t.question=null;
  const out=result(['✅ '+bold(player.name.toUpperCase()+' '+shout)+'!',answerLine(q),
   '💰 +'+num(points)+' pts ('+parts.join(' · ')+')',
   '⏱️ '+secs(elapsed)+(player.streak>=2?' · 🔥 '+player.streak+' in a row':''),
   ...(t.number<t.length?[standings(t)]:[])].join('\n')+after(true),4);
  out.next.wins=(state.wins||0)+1;return out;
 };
})();

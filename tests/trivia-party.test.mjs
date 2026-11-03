import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {parseQuestions,compileTrivia} from '../tools/trivia/compile.mjs';
import {squadTriviaQuestion,squadTriviaCard} from '../browser-extension/suite-core.mjs';
const read=f=>readFileSync(new URL('../'+f,import.meta.url),'utf8');
const box={};for(const f of ['soundboard-core.js','arcade-plus.js','trivia-bank.js','trivia-party.js'])vm.runInNewContext(read('browser-extension/'+f),box);
const bank=box.TylerTriviaBank,arcade=box.TylerSoundboard.arcade;
const alex={id:'player-alex',name:'Alex'},sam={id:'player-sam',name:'Sam'},tyler={id:'tyler-bot',name:'ROBOTIC TYLER'};
const call=(text,state={},who=null,now=1000,random=()=>.25)=>arcade(text,state,random,now,who);
const letter=q=>'ABCD'[q.options.indexOf(q.answer)];
const wrongLetter=q=>'ABCD'[q.options.findIndex(o=>o!==q.answer)];
// Undo the Unicode bold used in headers so assertions can read the words.
const plain=s=>[...String(s)].map(ch=>{const c=ch.codePointAt(0);
 if(c>=0x1D5D4&&c<=0x1D5ED)return String.fromCharCode(65+c-0x1D5D4);if(c>=0x1D5EE&&c<=0x1D607)return String.fromCharCode(97+c-0x1D5EE);if(c>=0x1D7EC&&c<=0x1D7F5)return String.fromCharCode(48+c-0x1D7EC);return ch;}).join('');
const BASE=[0,100,150,200];

test('500 questions: 10 categories of 50, every question well formed and unique',()=>{
 assert.equal(bank.length,10);assert.equal(bank.flatMap(c=>c.questions).length,500);
 const ids=new Set(),texts=new Set();
 for(const c of bank){
  assert.equal(c.questions.length,50,c.id);assert.ok(c.icon&&c.name,c.id);
  for(const level of [1,2,3])assert.ok(c.questions.filter(q=>q.level===level).length>=5,c.id+' level '+level);
  for(const q of c.questions){
   assert.equal(ids.has(q.id),false);ids.add(q.id);
   assert.equal(texts.has(q.question.toLowerCase()),false,q.question);texts.add(q.question.toLowerCase());
   assert.equal(new Set([q.answer,...q.wrong].map(o=>o.toLowerCase())).size,4,q.question);
   assert.match(q.question,/\?$/);assert.doesNotMatch(q.question+q.answer+q.wrong.join(''),/[\[\]<>|]/);
  }
 }
 // The generated bank is exactly what the source compiles to.
 assert.equal(read('browser-extension/trivia-bank.js'),compileTrivia(read('tools/trivia/questions.txt')));
 // The panel's launcher offers every category.
 const panel=read('browser-extension/soundboard.js');
 for(const c of bank)assert.match(panel,new RegExp('<option value="'+c.id+'">'),c.id);
});

test('the question compiler rejects broken questions',()=>{
 const {problems}=parseQuestions('@ demo | 🧪 | Demo\n1 | Same answers? | A | a | B | C\n4 | Bad level? | A | B | C | D\n1 | No question mark | A | B | C | D\n1 | Brackets [b]? | A | B | C | D\n1 | Too few? | A | B | C\n1 | Same answers? | A | B | C | D');
 const all=problems.join('\n');
 for(const m of [/all be different/,/level must be/,/end with "\?"/,/no \[ \]/,/3 wrong answers/,/same question as/,/needs 50/])assert.match(all,m);
});

test('a match opens with a welcome and a card: colour-keyed choices, shuffled, with level and points',()=>{
 const r=call('play trivia',{},alex),t=r.next.trivia,q=t.question,text=plain(r.text);
 assert.equal(r.slot,3);assert.equal(t.mode,'group');assert.equal(t.length,10);
 assert.match(text,/TYLER TRIVIA/);assert.match(text,/Group race · 🎲 Mixed · 10 questions/);assert.match(text,/Question 1 of 10/);
 assert.match(text,new RegExp('❓ '+q.text.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')));
 for(const [i,key] of ['🟥 A · ','🟦 B · ','🟨 C · ','🟩 D · '].entries())assert.ok(r.text.includes(key+q.options[i]));
 assert.notEqual(q.options.indexOf(q.answer),0,'the right answer is not always first');
 assert.match(text,new RegExp(['','Easy','Medium','Hard'][q.level]+' · '+BASE[q.level]+' pts'));
 assert.ok(r.next.round.until>1000);
});

test('players pick mode, category (or a nickname for it), difficulty and length',()=>{
 let t=call('play trivia solo gaming hard 5',{},alex).next.trivia;
 assert.deepEqual([t.mode,t.category,t.level,t.length],['solo','gaming',3,5]);
 assert.equal(t.question.category,'gaming');assert.equal(t.question.level,3);
 assert.equal(call('play trivia movies').next.trivia.category,'entertainment');
 assert.equal(call('play trivia animals').next.trivia.category,'nature');
 assert.equal(call('play trivia books').next.trivia.category,'arts');
 assert.equal(call('play trivia marathon').next.trivia.length,20);
 assert.equal(call('play trivia 50').next.trivia.length,20);
 assert.equal(call('play trivia 1').next.trivia.length,3);
 // Never longer than the questions available for that mix.
 const few=call('play trivia food hard 20').next.trivia;assert.equal(few.length,bank.find(c=>c.id==='food').questions.filter(q=>q.level===3).length);
});

test('solo locks the player; speed bonus on a right answer; a wrong answer reveals it',()=>{
 let s=call('play trivia solo history',{},alex).next;const q=s.trivia.question;
 assert.match(call(letter(q),s,sam).text,/belongs to Alex/);
 const win=call(letter(q),s,alex,1000);// answered instantly: full +50 speed bonus
 assert.match(plain(win.text),/ALEX /);assert.equal(win.slot,4);
 assert.equal(win.next.trivia.players[0].score,BASE[q.level]+50);
 assert.match(win.text,/⚡ \+50 speed/);
 s=call('next',win.next,alex,2000).next;
 const miss=call(wrongLetter(s.trivia.question),s,alex,2000);
 assert.match(miss.text,/The answer was/);assert.equal(miss.next.trivia.players[0].streak,0);assert.equal(miss.next.trivia.question,null);
});

test('group race: one try each, the first right answer scores, state is never mutated',()=>{
 const start=call('play trivia group science',{},alex).next,q=start.trivia.question;
 const miss=call(wrongLetter(q),start,alex,11000);assert.match(miss.text,/Alex · not quite!.*35s left/);
 assert.equal(call(letter(q),miss.next,alex,12000),null,'second attempt ignored');
 const win=call(q.answer,miss.next,sam,21000);// typed the answer text, 20 s in
 const speed=Math.round(50*25/45/5)*5;
 assert.equal(win.next.trivia.players.find(p=>p.key===sam.id).score,BASE[q.level]+speed);
 assert.equal(win.next.trivia.players.find(p=>p.key===alex.id).score,0);
 assert.equal(start.trivia.players[0].score,0);assert.equal(start.trivia.question.answered.length,0);
});

test('manual name labels work without Steam IDs; unknown group senders are not guessed',()=>{
 const state=call('play trivia group').next,q=state.trivia.question;
 assert.match(call(letter(q),state).text,/didn’t show who sent that/);
 const r=call('Jordan: '+letter(q),state);assert.match(plain(r.text),/JORDAN /);assert.equal(r.next.trivia.players[0].name,'Jordan');
});

test('50/50 hint keeps the answer and one wrong choice, and halves the points',()=>{
 const s=call('play trivia solo',{},alex).next,q=s.trivia.question;
 const hint=call('hint',s,alex);assert.match(plain(hint.text),/50\/50/);
 assert.ok(hint.text.includes(q.answer));assert.equal(q.options.filter(o=>hint.text.includes(' · '+o)).length,2);
 assert.match(call('hint',hint.next,alex).text,/already has its 50\/50/);
 const win=call(letter(q),hint.next,alex,1000);
 assert.equal(win.next.trivia.players[0].score,Math.round((BASE[q.level]+50)/2));
});

test('the next question follows by itself after an answer, but waits if nobody played',()=>{
 const due=box.TylerSoundboard.triviaDue;
 let s=call('play trivia group',{},alex).next;const q=s.trivia.question;
 assert.equal(due(s,1000),false);assert.equal(due(s,46000),true,'time is up');
 const win=call(letter(q),s,alex,5000);assert.match(win.text,/Question 2 in 8 seconds/);
 s=win.next;assert.equal(s.trivia.nextAt,13000);assert.equal(due(s,12999),false);assert.equal(due(s,13000),true);
 const next=call('!trivia tick',s,null,13000);assert.equal(next.slot,3);assert.match(next.text,/Question 2 of 10/);
 // Nobody answers question 2: time's up, and the game waits for "next".
 const timeout=call('!trivia tick',next.next,null,13000+45000);
 assert.match(plain(timeout.text),/TIME’S UP/);assert.match(timeout.text,/Nobody answered/);
 assert.equal(timeout.next.trivia.nextAt,0);assert.equal(due(timeout.next,999999),false);
 assert.match(call('next',timeout.next,alex,60000).text,/Question 3 of 10/);
});

test('a full match: streaks, double points on the final question, results and awards',()=>{
 let s=call('play trivia group 5',{},alex).next,now=1000,seen=new Set();
 for(let i=1;i<=5;i++){
  const q=s.trivia.question;assert.equal(seen.has(q.id),false);seen.add(q.id);assert.equal(q.final,i===5);
  if(i===5)assert.match(plain(call('scores',s,alex,now).text),/LEADERBOARD · question 5 of 5/);
  const who=i===2?sam:alex;
  const r=call(letter(q),s,who,now+3000);s=r.next;
  if(i<5){assert.equal(s.trivia.done,false);s=call('!trivia tick',s,null,s.trivia.nextAt).next;now=s.trivia.question.opened;}
  else{
   const text=plain(r.text);
   assert.match(text,/💥 ×2/);assert.match(text,/FINAL RESULTS/);assert.match(text,/👑 Alex wins with/);
   assert.match(text,/⚡ Fastest answer: /);assert.match(text,/🔥 Best streak: Alex · 3 in a row/);assert.match(text,/🎯 Sharpshooter: Alex · 100% right/);
   assert.match(text,/🔁 Type play trivia to run it back/);
  }
 }
 assert.equal(s.trivia.done,true);assert.equal(box.TylerSoundboard.triviaDue(s,1e12),false);
 assert.match(call('next',s,alex,now+99999).text,/That match is over/);
 // The final question card announced double points.
 const last=call('play trivia 3',{},alex).next;let t=last;for(let i=0;i<2;i++){t=call(letter(t.trivia.question),t,alex,2000).next;t=call('next',t,alex,3000).next;}
 assert.match(plain(call('scores',t,alex).text+''),/question 3 of 3/);
});

test('questions don’t repeat in later matches while fresh ones are left',()=>{
 let s=call('play trivia solo music 10',{},alex).next;const first=new Set();
 for(let i=0;i<10;i++){first.add(s.trivia.question.id);s=call(letter(s.trivia.question),s,alex,2000).next;if(i<9)s=call('next',s,alex,3000).next;}
 s=call('play trivia solo music 10',s,alex,5000).next;const second=new Set();
 for(let i=0;i<10;i++){second.add(s.trivia.question.id);s=call(letter(s.trivia.question),s,alex,6000).next;if(i<9)s=call('next',s,alex,7000).next;}
 assert.equal([...second].filter(id=>first.has(id)).length,0);
});

test('typed numbers match a numeric choice before they mean 1–4',()=>{
 const s=call('play trivia',{},alex).next;
 const custom={...s,trivia:{...s.trivia,question:{...s.trivia.question,options:['6','4','5','8'],answer:'6',answered:[]}}};
 assert.match(call('4',custom,alex).text,/not quite/);
 assert.match(plain(call('6',custom,alex).text),/ALEX /);
 assert.match(plain(call('a',custom,alex).text),/ALEX /);
});

test('help and categories cards work any time',()=>{
 assert.match(plain(call('trivia help').text),/how to play/);
 const cats=call('trivia categories').text;assert.match(plain(cats),/TRIVIA CATEGORIES · 500 questions/);
 for(const c of bank)assert.ok(cats.includes(c.icon+' '+c.name),c.name);
});

test('no line Tyler posts can be read back as an answer, a command or a sound trigger',()=>{
 // Steam shows Tyler's messages to the chat reader line by line, as if a friend typed them.
 const posted=[],keep=r=>{if(r?.text)posted.push(r.text);return r;};let s={},now=1000;
 keep(call('trivia help'));keep(call('trivia categories'));
 s=keep(call('play trivia group 4',s,alex,now)).next;
 keep(call('hint',s,alex,now));s=keep(call(wrongLetter(s.trivia.question),s,sam,now+2000)).next;
 s=keep(call(letter(s.trivia.question),s,alex,now+4000)).next;keep(call('scores',s,alex,now+5000));
 s=keep(call('!trivia tick',s,null,s.trivia.nextAt)).next;s=keep(call('!trivia tick',s,null,s.trivia.question.until)).next;
 s=keep(call('next',s,alex,s.trivia.question?0:999000)).next;keep(call('join Kim',s,null,999000));
 s=keep(call(letter(s.trivia.question),s,sam,999500)).next;s=keep(call('next',s,alex,1010000)).next;
 s=keep(call(wrongLetter(s.trivia.question),s,alex,1011000)).next;s=keep(call(letter(s.trivia.question),s,sam,1012000)).next;
 keep(call('stop game',call('play trivia solo',{},alex).next,alex));
 const squad=squadTriviaQuestion(bank,[],()=>.5);posted.push(squadTriviaCard(squad));
 assert.ok(posted.some(t=>/FINAL RESULTS/.test(plain(t))));
 const lines=[...new Set(posted.flatMap(t=>t.split('\n').map(l=>l.trim()).filter(Boolean)))];
 const open=call('play trivia group',{},alex).next,between=call(letter(open.trivia.question),open,alex,2000).next;
 for(const line of lines){
  assert.doesNotMatch(line.replace(/^[0-9]\uFE0F\u20E3/,'#'),/^[\p{L}\p{N}]/u,'starts with an emoji or symbol: '+line);
  for(const state of [{},open,between])assert.equal(call(line,state,tyler,3000),null,line);
  assert.equal(box.TylerSoundboard.parse(line),null,line);
  assert.doesNotMatch(line,/[\[\]]/);
 }
});

test('other arcade games still work after trivia ends',()=>{
 const start=call('play trivia solo',{},alex).next;
 const end=call('stop game',start,alex);assert.match(plain(end.text),/TRIVIA STOPPED/);
 assert.equal(call('play vault',end.next,alex).next.round.kind,'vault');
});

test('Squad !trivia draws from the same bank, skips recent questions and shuffles choices',()=>{
 const q=squadTriviaQuestion(bank,[],()=>.25);
 const source=bank.flatMap(c=>c.questions).find(x=>x.id===q.id);
 assert.equal(q.choices[q.answer-1],source.answer);assert.equal(new Set(q.choices).size,4);assert.notEqual(q.answer,1);
 const card=squadTriviaCard(q);assert.match(card,/SQUAD TRIVIA/);assert.match(card,/!answer 1-4/);assert.equal(card.split('\n').filter(l=>/^[1-4]️⃣ /.test(l)).length,4);
 const all=bank.flatMap(c=>c.questions.map(x=>x.id));
 assert.equal(squadTriviaQuestion(bank,all.filter(id=>id!=='gaming-7'),()=>.9).id,'gaming-7');
});

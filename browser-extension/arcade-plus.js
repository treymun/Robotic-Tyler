(()=>{
 const core=globalThis.TylerSoundboard,legacy=core.arcade;
 const words=['portal','rocket','shield','potion','wizard','dragon','castle','turret','glider','pirate','comet','minecraft','stardew'];
 const questions=[
  ['Which game has creepers?',['Minecraft','Terraria','Portal','Stardew Valley'],0],
  ['Who developed Half-Life?',['Valve','Nintendo','Rare','Bungie'],0],
  ['Which game features GLaDOS?',['Halo','Portal','Doom','Overwatch'],1],
  ['What does FPS mean in a game genre?',['Frames per second','First person shooter','Fast player speed','Final point score'],1],
  ['What is the Mario mushroom power-up called?',['Mega flower','Super mushroom','Fire star','Gold leaf'],1],
  ['Which resource powers a Minecraft beacon?',['Wheat','Rotten flesh','Mineral blocks','Sand'],2],
 ];
 const riddles=[['I have keys but no locks, and a space but no room. What am I?',['keyboard','a keyboard'],'You are probably using one now.'],['The more you take, the more you leave behind. What are they?',['footsteps','steps'],'Think about walking.'],['What gets wetter as it dries?',['towel','a towel'],'Something in a bathroom.']];
 const clean=t=>String(t||'').toLowerCase().trim().replace(/[.!?]+$/,'').replace(/\s+/g,' ');
 const sorted=t=>[...t].sort().join('');
 const aliases={numbers:'vault',scrambled:'scramble',quiz:'trivia',hangman:'hangman',math:'math',riddle:'riddle',reverse:'reverse',vault:'vault',scramble:'scramble',trivia:'trivia',rps:'rps'};
 function command(text){
  let t=clean(text);if(/^\[robotic tyler\]/.test(t))return '';
  if(t==='!trivia')return t; // Reserved for the existing Squad Suite multiplayer game.
  t=t.replace(/^(?:robotic )?tyler[, ]+play /,'play ');
  const m=/^(?:play |start |arcade |!arcade |!)(vault|numbers|scramble|trivia|quiz|hangman|math|riddle|reverse|rps)$/.exec(t);
  if(m)return '!game '+aliases[m[1]];
  if(t==='arcade'||t==='!arcade'||t==='arcade help'||t==='play games')return '!game help';
  if(t==='stop game'||t==='end game')return '!game stop';
  if(t==='game status')return '!game score';
  return t;
 }
 function arcade(text,state={},random=Math.random,now=Date.now()){
  const raw=clean(text),cmd=command(text);if(!cmd)return null;
  const round=state.round?.until>now?state.round:null,wins=Number(state.wins)||0;
  const reply=(text,change={},slot=1)=>({slot,text,next:{...state,round,wins,...change}});
  const win=answer=>reply('Correct! '+answer+' Room clears: '+(wins+1)+'. Type play again for another round.',{round:null,wins:wins+1},4);
  if(cmd==='!game help')return reply('Arcade: play vault / scramble / trivia / hangman / math / riddle / reverse / rps. Answer naturally during a round. hint · skip · stop game · play again · !game score. Quick games: !game roll · !game coin heads/tails.');
  if(cmd==='!game stop')return reply('Arcade round stopped.',{round:null});
  if(cmd==='!game score')return reply('Room clears: '+wins+'. '+(round?round.prompt+' '+Math.max(0,Math.ceil((round.until-now)/1000))+'s left.':'No active round. Type play trivia.'));
  if(['skip','!game skip'].includes(cmd)){if(!round)return null;return reply('Skipped. Answer: '+(round.display||round.answer)+'. Type play again.',{round:null},5);}
  if(['hint','!game hint'].includes(cmd)){
   if(!round)return null;if(round.hinted)return reply('Hint already used. '+round.hint);
   return reply('Hint: '+round.hint,{round:{...round,hinted:true}});
  }
  let start=/^!game (vault|scramble|trivia|hangman|math|riddle|reverse|rps)$/.exec(cmd)?.[1];
  if(['play again','!game again'].includes(cmd))start=state.lastGame||'trivia';
  if(start){
   if(round)return reply('A round is already open. '+round.prompt+' Type hint, skip, or stop game.');
   let answer,prompt,hint,display,options;
   const pick=a=>a[Math.min(a.length-1,Math.floor(random()*a.length))];
   if(start==='vault'){answer=String(1+Math.floor(random()*20));prompt='VAULT: Guess a number from 1 to 20. Just type the number.';hint=Number(answer)%2?'The code is odd.':'The code is even.';}
   if(['scramble','hangman'].includes(start)){
    answer=pick(words.filter(w=>w!==state.lastWord));
    let mixed=[...answer];for(let i=mixed.length-1;i>0;i--){const j=Math.floor(random()*(i+1));[mixed[i],mixed[j]]=[mixed[j],mixed[i]];}
    if(mixed.join('')===answer)mixed=[...answer.slice(1)+answer[0]];
    prompt=start==='scramble'?'SCRAMBLE: '+mixed.join('').toUpperCase()+'. Type the word.':'HANGMAN: '+[...answer].map(()=> '_').join(' ')+' — type one letter or guess WORD.';
    hint='Starts with '+answer[0].toUpperCase()+'; '+answer.length+' letters.';
   }
   if(start==='trivia'){const q=pick(questions);answer=clean(q[1][q[2]]);display=q[1][q[2]];options=q[1];prompt='TRIVIA: '+q[0]+' '+options.map((v,i)=>String.fromCharCode(65+i)+') '+v).join(' · ')+'. Reply A–D, 1–4, or an option.';hint='The answer is '+(q[2]<2?'A or B.':'C or D.');}
   if(start==='math'){const a=2+Math.floor(random()*18),b=2+Math.floor(random()*9),op=pick(['+','×','−']);answer=String(op==='+'?a+b:op==='×'?a*b:a-b);prompt='QUICK MATH: '+a+' '+op+' '+b+' = ? Type the number.';hint='Use '+(op==='+'?'addition':op==='×'?'multiplication':'subtraction')+'.';}
   if(start==='riddle'){const r=pick(riddles);answer=r[1][0];options=r[1];prompt='RIDDLE: '+r[0]+' Type the answer, or guess WORD.';hint=r[2];}
   if(start==='reverse'){const code=String(10000+Math.floor(random()*90000));answer=[...code].reverse().join('');prompt='REVERSE CODE: Type '+code+' backwards.';hint='Start with '+answer[0]+'. Keep every digit, including zeros.';}
   if(start==='rps'){answer=pick(['rock','paper','scissors']);prompt='ROCK PAPER SCISSORS: type rock, paper, or scissors. Tyler has locked a move.';hint='Rock beats scissors; scissors beat paper; paper beats rock.';}
   const next={kind:start,answer,display,options,prompt,hint,left:start==='hangman'?8:6,letters:[],guesses:[],until:now+120000};
   return reply(prompt+' Two minutes. hint / skip / stop game.',{round:next,lastGame:start,lastWord:['hangman','scramble'].includes(start)?answer:state.lastWord},3);
  }
  // Keep quick commands, including old explicit RPS/coin/dice forms.
  if(/^!game (?:roll|coin |rps )/.test(cmd))return legacy(cmd,state,random,now);
  const explicit=/^(?:!game guess|guess|answer|my guess is|the answer is|i think it is|i think it's|is it)\s+(.+)$/.exec(cmd);
  if(!round)return explicit?reply('No active round. Type play vault, play trivia, or arcade.'):null;
  let guess=explicit?explicit[1]:raw;
  if(!explicit){
   if(['vault','math'].includes(round.kind)&&!/^[-]?\d{1,4}$/.test(guess))return null;
   if(round.kind==='reverse'&&!/^\d{5}$/.test(guess))return null;
   if(round.kind==='scramble'&&sorted(guess)!==sorted(round.answer))return null;
   if(round.kind==='riddle'&&!round.options.includes(guess))return null;
   if(round.kind==='hangman'&&!/^[a-z]$/.test(guess)&&guess!==round.answer)return null;
   if(round.kind==='rps'&&!['rock','paper','scissors'].includes(guess))return null;
   if(round.kind==='trivia'&&!/^[a-d1-4]$/.test(guess)&&!round.options.some(o=>clean(o)===guess))return null;
  }
  if(round.kind==='vault'&&(!/^(?:[1-9]|1\d|20)$/.test(guess)))return explicit?reply('Choose 1–20.'):null;
  if(round.kind==='trivia'&&/^[a-d1-4]$/.test(guess))guess=clean(round.options[/^[1-4]$/.test(guess)?Number(guess)-1:guess.charCodeAt(0)-97]);
  if(round.guesses.includes(guess))return reply('Already tried that. No try lost.');
  if(round.kind==='rps'){
   const moves=['rock','paper','scissors'];if(!moves.includes(guess))return reply('Choose rock, paper, or scissors.');
   const outcome=(moves.indexOf(guess)-moves.indexOf(round.answer)+3)%3;
   return outcome===1?win('You chose '+guess+'; Tyler chose '+round.answer+'.'):reply('You chose '+guess+'; Tyler chose '+round.answer+'. '+(outcome===0?'Draw!':'Tyler wins!')+' Type play again.',{round:null},outcome===0?1:5);
  }
  if(guess===round.answer||(round.kind==='riddle'&&round.options.includes(guess)))return win(round.display||round.answer);
  if(round.kind==='hangman'&&/^[a-z]$/.test(guess)){
   const letters=[...round.letters,guess],correct=round.answer.includes(guess),left=round.left-(correct?0:1);
   const mask=[...round.answer].map(l=>letters.includes(l)?l.toUpperCase():'_').join(' ');
   if([...round.answer].every(l=>letters.includes(l)))return win(round.answer);
   if(!left)return reply('Out of tries. Answer: '+round.answer+'. Type play again.',{round:null},5);
   return reply(mask+' · '+left+' misses left. Tried: '+letters.join(', '),{round:{...round,letters,left,guesses:[...round.guesses,guess]}});
  }
  const left=round.left-1;if(!left)return reply('Out of tries. Answer: '+(round.display||round.answer)+'. Type play again.',{round:null},5);
  const hint=round.kind==='vault'?(Number(guess)<Number(round.answer)?'Go higher.':'Go lower.'):'Not quite.';
  return reply(hint+' '+left+' tries left.',{round:{...round,left,guesses:[...round.guesses,guess]}});
 }
 core.arcade=arcade;
})();

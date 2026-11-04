(() => {
 const names=['Beep','Airhorn','Drumroll','Victory','Sad trombone','Alert','Coin','Jump','Laser','Countdown'];
 function slug(value){return String(value||'').toLowerCase().replace(/\.[a-z0-9]{2,5}$/,'').replace(/[^a-z0-9 ]/g,' ').replace(/\s+/g,' ').trim().slice(0,50);}
 function parse(text,slots=globalThis.TylerSoundboard?.slots){const input=String(text||'').trim().toLowerCase();const alias=slots?.find(s=>s.trigger&&s.trigger===input);if(alias)return alias.slot;const m=input.match(/^sound\s+([^\n]+)$/i);if(!m)return null;if(/^[1-9]\d?$/.test(m[1])){const n=Number(m[1]);return n<=10||slots?.some(s=>s.slot===n)?n:null;}if(/^[0-9]+$/.test(m[1]))return null;const key=slug(m[1]);if(!key)return null;const matches=(slots||names.map((name,i)=>({name,slot:i+1}))).filter(s=>slug(s.name)===key||slug(names[s.slot-1])===key);return matches.length===1?matches[0].slot:null;}
 function preferences(value={}){return {volume:Math.max(0,Math.min(1,Number.isFinite(Number(value.volume))?Number(value.volume):.6)),access:value.access==='selected'?'selected':'everyone',allowedIDs:[...new Set(String(value.allowedIDs||'').match(/\b7656119\d{10}\b/g)||[])].slice(0,50).join('\n')};}
 // A clip: base64 audio (at most 700,000 characters), seconds (0–12) and a name. v2.31: a themed pad's
 // packaged clip also has a level, its playback gain in dB (−12 to +12; uploaded clips have none).
 function validClip(clip){return !!clip&&typeof clip.audio==='string'&&clip.audio.length<=700000&&/^[A-Za-z0-9+/]+={0,2}$/.test(clip.audio)&&Number.isFinite(clip.seconds)&&clip.seconds>0&&clip.seconds<=12&&typeof clip.name==='string'&&clip.name.length<=60&&(clip.level===undefined||Number.isFinite(clip.level)&&clip.level>=-12&&clip.level<=12);}
 function game(text,random=Math.random){
 const cmd=String(text).trim().toLowerCase();
 if(cmd==='!game roll'){const n=1+Math.floor(random()*6);return {slot:n>=4?4:5,text:'High roller: '+n+'/6. '+(n>=4?'You win!':'Four or higher wins. Try again!')};}
 const coin=/^!game coin (heads|tails)$/.exec(cmd);
 if(coin){const face=random()<.5?'heads':'tails';return {slot:face===coin[1]?4:5,text:'Coin toss: '+face+'. '+(face===coin[1]?'Called it!':'Better luck next flip.')};}
 if(cmd==='!game help')return {slot:1,text:'Play high roller with !game roll (4+ wins), or call a flip with !game coin heads or !game coin tails.'};
 return null;
 }
 function arcade(text,state={},random=Math.random,now=Date.now()){
   const cmd=String(text).trim().toLowerCase().replace(/\s+/g,' ');
   if(!cmd.startsWith('!game '))return null;
   const round=state.round?.until>now?state.round:null;
   const wins=state.wins||0;
   const result=(slot,text,change={})=>({slot,text,next:{...state,round,wins,...change}});
   const victory=(text)=>result(4,text+' Room clears: '+(wins+1)+'.',{round:null,wins:wins+1});
   const moves=['rock','paper','scissors'];
   if(cmd==='!game help')return result(1,'Arcade commands: !game vault · !game scramble · !game trivia · !game guess <answer> · !game rps rock/paper/scissors · !game roll · !game coin heads/tails · !game score.');
   if(cmd==='!game score')return result(1,'Room clears this session: '+wins+'.'+(round?' Round in play: '+round.clue:' Start a shared round with !game vault or !game scramble.'));
   if(cmd==='!game vault'||cmd==='!game scramble'||cmd==='!game trivia'){
     if(round)return result(1,'Round already open. '+round.clue+' Reply with !game guess <answer>.');
     let answer,clue;
     if(cmd.endsWith('trivia')){
       const q=[['What is the name of the mushroom power-up in Mario?','super mushroom'],['What color is the main portal in the first Portal logo?','orange'],['Which game features creepers?','minecraft'],['What does FPS stand for in gaming?','first person shooter'],['What game features the character GLaDOS?','portal'],['Which company developed Half-Life?','valve']];
       const picked=q[Math.floor(random()*q.length)];answer=picked[1];clue='TRIVIA: '+picked[0];
     }else if(cmd.endsWith('vault')){
       answer=String(1+Math.floor(random()*20));clue='Vault code: pick a number from 1 to 20.';
     }else{
       const words=['portal','rocket','shield','potion','wizard','dragon','castle','arcade','turret','glider','pirate','comet'].filter(w=>w!==state.lastWord);
       answer=words[Math.floor(random()*words.length)];
       const letters=[...answer];for(let i=letters.length-1;i>0;i--){const j=Math.floor(random()*(i+1));[letters[i],letters[j]]=[letters[j],letters[i]];}
       let mixed=letters.join('');if(mixed===answer)mixed=answer.slice(1)+answer[0];clue='Unscramble '+mixed.toUpperCase()+'.';
     }
     return result(3,clue+' Anyone can type !game guess <answer>. Six tries together, two minutes.',{round:{answer,clue,number:cmd.endsWith('vault'),left:6,until:now+120000},lastWord:cmd.endsWith('scramble')?answer:state.lastWord});
   }
   if(cmd==='!game guess'||cmd.startsWith('!game guess ')){
     if(!round)return result(1,'No open round. Type !game vault or !game scramble.');
     const guess=cmd.slice(12);
     if(round.number?!/^(?:[1-9]|1\d|20)$/.test(guess):!/^[a-z ]{2,40}$/.test(guess))return result(1,round.number?'Use !game guess followed by a number from 1 to 20.':'Use !game guess followed by a word or short phrase.');
     if(guess===round.answer)return victory('Cracked it! The answer was '+round.answer+'.');
     const left=round.left-1;if(!left)return result(5,'Out of tries! The answer was '+round.answer+'.',{round:null});
     const hint=round.number?(Number(guess)<Number(round.answer)?'Go higher.':'Go lower.'):'Try rearranging the letters again.';
     return result(1,hint+' '+left+' shared tries left.',{round:{...round,left}});
   }
   const rps=/^!game rps (rock|paper|scissors)$/.exec(cmd);
   if(rps){const a=moves.indexOf(rps[1]),b=Math.floor(random()*3),outcome=(a-b+3)%3;
     return result([1,4,5][outcome],'You chose '+moves[a]+'. Tyler chose '+moves[b]+'. '+['Draw!','You win!','Tyler wins!'][outcome]);}
   const quick=game(cmd,random);return quick?result(quick.slot,quick.text):null;
 }

 globalThis.TylerSoundboard={arcade,game,names,parse,validClip,slug,preferences};
})();

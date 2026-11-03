import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const box={};
for(const file of ['soundboard-core.js','arcade-plus.js'])vm.runInNewContext(readFileSync(new URL('../browser-extension/'+file,import.meta.url),'utf8'),box);
const play=(text,state={},r=()=>0,now=1000)=>box.TylerSoundboard.arcade(text,state,r,now);
test('natural vault answers, repeat protection, hints and existing !game syntax',()=>{
 let s=play('play vault').next;assert.equal(s.round.answer,'1');
 assert.equal(play('how is everyone doing',s),null);
 const wrong=play('12',s);assert.match(wrong.text,/lower/);s=wrong.next;
 assert.equal(play('12',s).next.round.left,s.round.left);
 assert.match(play('hint',s).text,/odd/);
 assert.equal(play('!game guess 1',s).next.wins,1);
 assert.equal(play('21',s),null);
});
test('trivia accepts letters, numbers, full option and conversational answer aliases',()=>{
 for(const answer of ['A','1','Minecraft','the answer is minecraft','is it Minecraft?']){
  const s=play('play trivia').next;assert.equal(play(answer,s).next.wins,1,answer);
 }
 const s=play('play trivia').next;assert.equal(play('unrelated conversation',s),null);
 assert.equal(play('B',s).next.round.left,5);
});
test('scramble accepts anagram words, repeat avoids last word, and chatter is ignored',()=>{
 const s=play('arcade scramble').next;assert.equal(play('hello there',s),null);
 const win=play(s.round.answer,s);assert.equal(win.next.wins,1);
 assert.notEqual(play('play again',win.next).next.round.answer,s.round.answer);
});
test('hangman correct letters do not consume misses; repeated letters do not consume attempts',()=>{
 let s=play('play hangman').next;const answer=s.round.answer;
 const letter=answer[0],correct=play(letter,s);assert.equal(correct.next.round.left,8);s=correct.next;
 assert.equal(play(letter,s).next.round.left,8);
 for(const next of new Set(answer.slice(1))){const result=play(next,s);s=result.next;}
 assert.equal(s.wins,1);assert.equal(s.round,null);
});
test('math, riddles, reverse and RPS support natural input and award one shared clear',()=>{
 for(const name of ['math','riddle','reverse']){
  const s=play('play '+name).next;assert.equal(play(s.round.answer,s).next.wins,1,name);
 }
 const s=play('play rps').next;assert.equal(play('paper',s).next.wins,1);
});
test('rounds expire, starting another does not overwrite active round, controls and bot echoes are bounded',()=>{
 const s=play('play vault').next;
 assert.equal(play('play math',s).next.round.kind,'vault');
 assert.equal(play('1',s,()=>0,122000),null);
 assert.equal(play('stop game',s).next.round,null);
 assert.equal(play('skip',s).next.round,null);
 assert.equal(play('[ROBOTIC TYLER] play vault',s),null);
  assert.equal(play('!trivia',{}),null);
 assert.match(play('!game roll',{}).text,/roller/);
 assert.match(play('!game coin heads',{}).text,/Coin toss/);
});

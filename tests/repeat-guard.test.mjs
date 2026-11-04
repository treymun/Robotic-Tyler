// Repeat protection for text replies (v2.20.1): near-duplicates of Tyler's recent replies are caught,
// different replies on the same topic are not, copied sentences are trimmed, and the rut hint names
// the openings and phrases he keeps reusing. Pure functions; the retry flow itself is driven through
// the real background script in early-speech.test.mjs (mocked AI and speech providers).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {similarity,nearDuplicate,repeatCheck,repeatHint,retryNote} from '../browser-extension/repeat-guard.mjs';
const H=list=>list.map(content=>({role:'assistant',content}));

const REWORDED=[
 ['Bro you really just died to a chicken, that\'s wild','Bro you really just got killed by a chicken, that\'s insane'],
 ['Damn Alex, you\'re playing like your monitor is off again.','Damn Sam, you\'re playing like your monitor is turned off.'],
 ['Lmao Sam, that was the worst grenade I\'ve ever seen.','LMAO Sam that was honestly the worst nade I have ever seen'],
 ['Skill issue, honestly. Maybe try aiming next time.','Honestly a skill issue. Maybe try aiming at them next time.'],
 ['You guys are getting absolutely destroyed out there, it\'s beautiful.','You guys are getting completely destroyed out there and it\'s beautiful.'],
 ['Hell yeah, that clutch was clean as hell, Alex!','Hell yeah Alex, that clutch was clean as hell!'],
 ['I\'m not saying you\'re bad, I\'m just saying the bots are scared for you.','Not saying you\'re bad, just saying even the bots feel sorry for you.'],
];
const DIFFERENT=[
 ['Bro you really just died to a chicken, that\'s wild','What map are we playing next, Dust 2 or Mirage?'],
 ['Skill issue, honestly. Maybe try aiming next time.','Honestly the new patch made the AWP way too strong.'],
 ['Yeah I think you should go B, they always stack A.','I think you should rotate to A, they are pushing hard.'],
 ['That\'s a good question, it depends on your graphics card.','That\'s fair, it depends on how much you want to spend.'],
 ['I\'m down for another round if you guys are.','I\'m not sure if you guys want another round.'],
 ['GG everyone, that was a fun match.','GG, that was a close one everyone.'],
 ['Nah, Mirage is way better than Inferno for this squad.','Nah, Overpass is way more fun when everyone actually rotates.'],
 ['Honestly I would buy the 4070, it is the better deal right now.','Honestly I would wait for the sale, prices drop next month.'],
 ['lol','lol'],['gg','gg'],['nice','nice'],
];

test('reworded repeats are caught, different replies and short reactions are not',()=>{
 for(const [a,b] of REWORDED)assert.equal(nearDuplicate(a,b),true,'repeat: '+b);
 for(const [a,b] of DIFFERENT)assert.equal(nearDuplicate(a,b),false,'different: '+b);
 assert.equal(similarity('Same words here, every time.','same words here every time'),1);
 assert.equal(nearDuplicate('That was a sick play, man, absolutely sick.','That was a sick play, man, absolutely sick.'),true);
});

test('a reply that is mostly a repeat asks for another; a copied sentence inside a new reply is dropped',()=>{
 const history=[{role:'user',content:'u'},...H(['What map next?','Bro you really just died to a chicken, that\'s wild'])];
 const whole=repeatCheck('Bro you really just got killed by a chicken, that\'s insane',history);
 assert.equal(whole.repeat,true);assert.match(whole.like,/died to a chicken/);
 const part=repeatCheck('Not gonna lie, that round was rough for you. That is what happens when you peek an AWP with a pistol.',H(['That is what happens when you peek AWP with a pistol, Sam.']));
 assert.equal(part.repeat,false);assert.equal(part.trimmed,true);assert.equal(part.text,'Not gonna lie, that round was rough for you.');
 const fresh=repeatCheck('What map are we playing next?',H(['Bro you really just died to a chicken']));
 assert.deepEqual(fresh,{text:'What map are we playing next?',repeat:false,trimmed:false,like:''});
 // Only Tyler's own recent replies count (not what friends said), and only the last six.
 assert.equal(repeatCheck('Bro you really just died to a chicken, that\'s wild',[{role:'user',content:'Bro you really just died to a chicken, that\'s wild'}]).repeat,false);
 assert.equal(repeatCheck('Okay that clutch was actually insane, Alex.',H(['Okay that clutch was actually insane, Sam.','a','b','c','d','e','f'])).repeat,false);
 // A rejected first draft counts too when the second try is checked.
 assert.equal(repeatCheck('Absolutely cooked that whole round.',[],['Absolutely cooked that round, bro.']).repeat,true);
});

test('the rut hint names reused openings and phrases, and stays out of the way otherwise',()=>{
 const hint=repeatHint(H(['Bro you really whiffed that, skill issue honestly.','Bro you missed again, skill issue honestly my guy.','Okay that was clean as hell Alex.','Bro you are cooked, clean as hell though.']));
 assert.match(hint,/Do not open with "bro you"/);assert.match(hint,/"skill issue honestly"/);assert.match(hint,/"clean as hell"/);
 assert.equal(repeatHint(H(['Mirage is better than Inferno for us.','I would wait for a sale next month.','Yeah, go B and hold the site.'])),'');
 assert.equal(repeatHint(H(['lol','lol','lol'])),'','short reactions are not a rut');
 assert.equal(repeatHint([]),'');
 const note=retryNote('Bro you really just got killed by a chicken','Bro you really just died to a chicken');
 assert.match(note,/new opening words/);assert.ok(note.length<600);
});

test('the background uses repeat protection for every text model, with one retry at most',()=>{
 const bg=fs.readFileSync(new URL('../browser-extension/background.js',import.meta.url),'utf8');
 assert.match(bg,/import \{repeatCheck,repeatHint,retryNote\} from '\.\/repeat-guard\.mjs'/);
 assert.match(bg,/const rut=repeatHint\(history\);if\(rut\)request\.messages\[0\]\.content\+=' '\+rut;/);
 const block=bg.slice(bg.indexOf('// Repeat protection: a reply'),bg.indexOf("console.info('[ROBOTIC TYLER] Repeat protection"));
 assert.equal(block.match(/await generate\(/g).length,1,'one retry, never a loop');
 assert.doesNotMatch(block,/model:|brain|geminiTextModel/,'the retry uses the same model and provider');
 assert.match(bg,/repeatCheck\(candidate,history\)\.repeat/,'a repeated first sentence is not spoken early');
});

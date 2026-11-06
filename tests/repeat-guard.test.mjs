// Repeat protection for text replies (v2.20.1): near-duplicates of Tyler's recent replies are caught,
// different replies on the same topic are not, copied sentences are trimmed, and the rut hint names
// the openings and phrases he keeps reusing. Pure functions; the retry flow itself is driven through
// the real background script in early-speech.test.mjs (mocked AI and speech providers).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {similarity,nearDuplicate,repeatCheck,repeatHint,retryNote,openerRut,trimOpener,stutter,unstutter} from '../browser-extension/repeat-guard.mjs';
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
 assert.match(bg,/import \{repeatCheck,repeatHint,retryNote,stutter,trimOpener,unstutter\} from '\.\/repeat-guard\.mjs'/);
 assert.match(bg,/retryNote\(draft,check\.like,check\.opener\|\|'',check\.stutter===true\)/,'the retry names the opening rut or the stuck word');
 assert.match(bg,/const rut=repeatHint\(history\);if\(rut\)request\.messages\[0\]\.content\+=' '\+rut;/);
 const block=bg.slice(bg.indexOf('// Repeat protection: a reply'),bg.indexOf("console.info('[ROBOTIC TYLER] Repeat protection"));
 assert.equal(block.match(/await generate\(/g).length,1,'one retry, never a loop');
 assert.doesNotMatch(block,/model:|brain|geminiTextModel/,'the retry uses the same model and provider');
 assert.match(bg,/repeatCheck\(candidate,history\)\.repeat/,'a repeated first sentence is not spoken early');
});

test('v2.41: an opening rut ("Fuck off, …" on almost every Venice reply) counts as a repeat; the retry names it; the trim is a fallback',()=>{
 const hist=H(['Fuck off, Derpo, your aim is a rumor at best.','Fuck off with that weak bait, nobody asked.','Nah, the AWP is overrated anyway.','Fuck off, Randy, go touch grass for once.']);
 const r=repeatCheck('Fuck off, Sam, that clutch was pure luck and you know it.',hist);
 assert.equal(r.repeat,true);assert.equal(r.opener,'fuck off');assert.equal(r.like,'Fuck off, Randy, go touch grass for once.');
 assert.match(retryNote('x',r.like,r.opener),/keep opening with "fuck off".*starting with different words \(not "fuck off" or a variation of it\), in your usual style/);
 assert.equal(repeatCheck('Honestly Sam, that clutch was pure luck and you know it.',hist).repeat,false,'a different opening is fine');
 // The same opening as the previous reply, or as two of the last four; never openings of common words only.
 assert.equal(openerRut('Bro what are you even doing out there',['Bro you are cooked.','Nah fam.']) ,'');
 assert.equal(openerRut('Bro you are cooked again tonight',['Bro you are cooked.']),'bro you');
 assert.equal(openerRut('You are so bad at this game honestly',['You are cooked, man.','You are not ready.']),'','"you are" is common words only');
 assert.equal(openerRut('lol ok',['lol ok']),'','short reactions are left alone');
 // The fallback: the opening dropped only when it is a clause of its own and enough is left.
 assert.equal(trimOpener('Fuck off, Sam, that clutch was pure luck and you know it.','fuck off'),'Sam, that clutch was pure luck and you know it.');
 assert.equal(trimOpener('Fuck off — your aim is a myth, Derpo, seriously.','fuck off'),'Your aim is a myth, Derpo, seriously.');
 assert.equal(trimOpener('Fuck off with that weak bait, nobody asked.','fuck off'),'','part of the sentence: left alone');
 assert.equal(trimOpener('Fuck off, lol.','fuck off'),'','nothing much left');
});

test('v2.41: a reply stuck on one word ("fuck fuck fuck …") is caught, even with no history; the retry says so; runs are cut to two as a fallback',()=>{
 for(const t of ['fuck fuck fuck fuck you Sam','Fuck you, fuck this lobby, fuck your aim, fuck the bots, fuck everything about this fucking fuck game','nice nice nice nice nice'])assert.equal(stutter(t),true,t);
 for(const t of ['Fuck off, Sam, that clutch was pure luck and you know it.','lol lol lol','gg ez, you got clapped so hard it is not even funny honestly, fuck','What a round. Fuck yes, that was clean.'])assert.equal(stutter(t),false,t);
 const r=repeatCheck('fuck fuck fuck fuck fuck you',[]);assert.equal(r.repeat,true);assert.equal(r.stutter,true);
 assert.match(retryNote('x','', '',true),/stuck repeating the same word over and over.*real sentences/);
 assert.equal(unstutter('Fuck fuck FUCK fuck, you are so bad fuck fuck fuck.'),'Fuck fuck, you are so bad fuck fuck.');
});

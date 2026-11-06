// Repeat protection for text replies (v2.20.1). Models sometimes fall into a rut: the same sentence
// again and again with a word or two swapped ("Bro you really just died to a chicken, that's wild" /
// "Bro you really just got killed by a chicken, that's insane"). Two layers, no extra request unless
// a reply really is a repeat:
//  1. repeatHint(): before the request, name the openings and phrases Tyler keeps reusing, so the
//     model steers away from them.
//  2. repeatCheck(): after the reply, compare it (whole and sentence by sentence) with Tyler's recent
//     replies. A repeated sentence inside a longer reply is dropped; a reply that is mostly a repeat
//     is reported so the caller can ask once for a different one.
// Similarity mixes letter trigrams (catches small rewordings) with word pairs and word overlap
// (catches swapped names and endings). Short reactions ("lol", "gg") are left alone.

const RECENT=6;
const norm=s=>String(s||'').toLowerCase().replace(/[’']/g,'').replace(/[^a-z0-9 ]+/g,' ').replace(/\s+/g,' ').trim();
const words=s=>{const n=norm(s);return n?n.split(' '):[];};
function bag(list){const m=new Map();for(const k of list)m.set(k,(m.get(k)||0)+1);return m;}
function dice(a,b){let inter=0,ta=0,tb=0;for(const v of a.values())ta+=v;for(const v of b.values())tb+=v;for(const [k,v] of a)inter+=Math.min(v,b.get(k)||0);return ta+tb?2*inter/(ta+tb):0;}
const pairs=w=>bag(w.slice(1).map((x,i)=>w[i]+' '+x));
const trigrams=s=>{const t=' '+norm(s)+' ',out=[];for(let i=0;i+3<=t.length;i++)out.push(t.slice(i,i+3));return bag(out);};
function overlap(wa,wb){const a=new Set(wa),b=new Set(wb);let i=0;for(const x of a)if(b.has(x))i++;return i/(a.size+b.size-i||1);}

/** 0–1: how alike two replies read. */
export function similarity(a,b){
 const wa=words(a),wb=words(b);if(!wa.length||!wb.length)return 0;
 if(wa.join(' ')===wb.join(' '))return 1;
 return (dice(trigrams(a),trigrams(b))+Math.max(dice(pairs(wa),pairs(wb)),overlap(wa,wb)))/2;
}

/** True when b reads as a light rewording of a. */
export function nearDuplicate(a,b){
 const wa=words(a),wb=words(b),n=Math.min(wa.length,wb.length);
 if(n<4)return wa.length>0&&wa.join(' ')===wb.join(' ')&&wa.join(' ').length>=24;
 // Very different lengths: one may contain the other, which repeatCheck handles sentence by sentence.
 if(n/Math.max(wa.length,wb.length)<0.6)return false;
 const s=similarity(a,b),opener=n>=5&&wa.slice(0,3).join(' ')===wb.slice(0,3).join(' ');
 return s>=0.62||(opener&&s>=0.5);
}

const sentences=s=>String(s||'').match(/[^.!?…]+(?:[.!?…]+|$)/g)?.map(x=>x.trim()).filter(Boolean)||[];
const recent=history=>(history||[]).filter(m=>m?.role==='assistant'&&typeof m.content==='string'&&m.content.trim()).slice(-RECENT).map(m=>m.content);

/**
 * Compare a reply with Tyler's recent replies.
 * Returns {text, repeat, trimmed, like}: text is the reply with any repeated sentence removed,
 * repeat is true when it is mostly a repeat (ask for another), like is the earlier reply it echoes.
 */
export function repeatCheck(reply,history,extra=[]){
 const text=String(reply||'').trim(),previous=[...recent(history),...extra.filter(Boolean)];
 if(text&&stutter(text))return {text,repeat:true,trimmed:false,like:'',stutter:true};
 if(!text||!previous.length)return {text,repeat:false,trimmed:false,like:''};
 const fresh=out=>{const rut=openerRut(out.text,previous);return rut?{...out,repeat:true,opener:rut,like:previous.slice().reverse().find(p=>opening(p)===rut)||''}:out;};
 const whole=previous.find(p=>nearDuplicate(p,text));
 if(whole)return {text,repeat:true,trimmed:false,like:whole};
 // Sentence by sentence: a copied line inside an otherwise new reply.
 const oldLines=previous.flatMap(sentences).filter(s=>words(s).length>=5);
 const parts=sentences(text);let repeated=0,total=0,like='';const keep=[];
 for(const part of parts){const n=words(part).length;total+=n;const hit=n>=5&&oldLines.find(o=>nearDuplicate(o,part));if(hit){repeated+=n;like||=hit;}else keep.push(part);}
 if(!repeated)return fresh({text,repeat:false,trimmed:false,like:''});
 const rest=keep.join(' ').trim();
 if(repeated/Math.max(1,total)>=0.6||words(rest).length<5)return {text,repeat:true,trimmed:false,like};
 return fresh({text:rest,repeat:false,trimmed:true,like});
}

// Function words: a phrase made only of these says nothing about a rut.
const COMMON=new Set('a an the and or but so to of in on at for with you your youre im i me my we us our it its is are was were be been that this thats just like what how do does did not no yes yeah oh lol if then than as up out get got go going gonna have has had can cant dont im ill its who they them their there here all'.split(' '));

// v2.41: an opening rut. On Venice, almost every reply began "Fuck off, …": the rut hint names the
// opening, but a model following its persona's habit ignores the hint, and since the rest of each reply
// is new, the near-duplicate check let it through. Now a reply that opens with the same two words as
// the previous reply, or as two of the last four, counts as a repeat too (openings made only of common
// words, like "i mean", don't). The caller asks once for a reply that starts differently; if the second
// try opens the same way, trimOpener() drops the opening when it is its own clause ("Fuck off, …").
const opening=text=>words(text).slice(0,2).join(' ');
export function openerRut(reply,previous){
 const o=opening(reply),w=o.split(' ');if(words(reply).length<4||w.length<2||w.every(x=>COMMON.has(x)))return '';
 const last=(previous||[]).slice(-4).map(opening);
 return last.at(-1)===o||last.filter(x=>x===o).length>=2?o:'';
}
// v2.41: a reply stuck on one word ("fuck fuck fuck fuck …", or a whole reply that is mostly one word
// with a few others changed), seen on Venice. stutter() says whether a reply has gone that way;
// unstutter() is the fallback when the retry does too: runs of the same word are cut to two.
export function stutter(text){
 const w=words(text);if(w.length<4)return false;
 let run=1;for(let i=1;i<w.length;i++){run=w[i]===w[i-1]?run+1:1;if(run>=4)return true;}
 if(w.length<12)return false;
 const m=new Map();for(const x of w)if(!COMMON.has(x))m.set(x,(m.get(x)||0)+1);
 const top=Math.max(0,...m.values());if(top/w.length>=0.3)return true;
 const grams=new Map();for(let i=0;i+3<=w.length;i++){const g=w.slice(i,i+3);if(g.every(x=>COMMON.has(x)))continue;const k=g.join(' ');grams.set(k,(grams.get(k)||0)+1);}
 return Math.max(0,...grams.values())>=4;
}
export function unstutter(text){
 const out=[];let prev='',run=0;
 for(const tok of String(text||'').trim().split(/\s+/)){const n=norm(tok);if(n&&n===prev){run++;if(run>=2){const p=/[,.!?…;:]+$/.exec(tok)?.[0];if(p&&out.length&&!/[,.!?…;:]$/.test(out.at(-1)))out[out.length-1]+=p;continue;}}else{prev=n;run=0;}out.push(tok);}
 return out.join(' ');
}
/** The reply without its opening when the opening is a clause of its own; '' when nothing would be left. */
export function trimOpener(text,opener){
 const t=String(text||'').trim(),want=String(opener||'').split(' ').filter(Boolean);if(!want.length)return '';
 const tokens=t.split(/\s+/);let i=0,got=[];
 while(i<tokens.length&&got.length<want.length){const n=norm(tokens[i]);if(n)got.push(...n.split(' '));i++;}
 if(got.slice(0,want.length).join(' ')!==want.join(' ')||got.length!==want.length)return '';
 const last=tokens[i-1]||'',dash=/^[—–-]+$/.test(tokens[i]||'');
 if(!/[,.!?…:;]["')\]]*$/.test(last)&&!dash)return '';
 const rest=tokens.slice(i+(dash?1:0)).join(' ').trim();
 if(words(rest).length<4)return '';
 return rest.charAt(0).toUpperCase()+rest.slice(1);
}

/** A short instruction naming the openings and phrases the last replies keep reusing, or ''. */
export function repeatHint(history){
 const last=recent(history).map(words).filter(w=>w.length>=4);if(last.length<2)return '';
 const count=(keys)=>{const m=new Map();for(const set of keys)for(const k of set)m.set(k,(m.get(k)||0)+1);return m;};
 const openers=[...count(last.slice(-4).map(w=>new Set([w.slice(0,2).join(' ')]))).entries()].filter(([k,c])=>c>=2&&k.split(' ').length===2).map(([k])=>k);
 const phrases=[...count(last.map(w=>new Set(w.slice(0,-2).map((x,i)=>w.slice(i,i+3).join(' '))))).entries()]
  .filter(([k,c])=>c>=2&&k.split(' ').some(x=>!COMMON.has(x))).sort((a,b)=>b[1]-a[1]).map(([k])=>k);
 // Keep phrases that don't overlap each other ("was clean as" and "clean as hell" are one rut),
 // and skip the opener itself, which is named separately.
 const picked=[],twos=p=>{const w=p.split(' ');return [w.slice(0,2).join(' '),w.slice(1).join(' ')];};
 for(const p of phrases){if(picked.length>=3)break;if(openers.some(o=>p.startsWith(o+' ')))continue;if(!twos(p).some(t=>picked.some(q=>q.includes(t))))picked.push(p);}
 if(!openers.length&&!picked.length)return '';
 return 'Variety check: your recent replies are starting to sound the same.'+(openers.length?' Do not open with '+openers.slice(0,2).map(o=>'"'+o+'"').join(' or ')+' again.':'')+(picked.length?' Avoid reusing: '+picked.map(p=>'"'+p+'"').join(', ')+'.':'')+' Use a different sentence shape than your last few replies.';
}

/** The system note for one retry after a repeat. */
export function retryNote(draft,like,opener='',stuck=false){
 const clip=s=>String(s||'').replace(/\s+/g,' ').trim().slice(0,160);
 if(stuck)return 'Your draft got stuck repeating the same word over and over. Reply to the latest chat message again as a normal chat message in your usual style: real sentences, each word only where it fits. Same RULES and length. Do not mention this note.';
 if(opener)return 'Your recent replies keep opening with "'+opener+'", and your draft does too. Reply to the latest chat message again, starting with different words (not "'+opener+'" or a variation of it), in your usual style. Same RULES and length. Do not mention this note.';
 return 'Your draft "'+clip(draft)+'" is nearly the same as something you already said'+(like&&clip(like)!==clip(draft)?' ("'+clip(like)+'")':'')+'. Reply to the latest chat message again with something genuinely different: new opening words, a different sentence shape, a new point or joke. Same RULES and length. Do not mention this note.';
}

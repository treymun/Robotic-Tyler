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
 if(!text||!previous.length)return {text,repeat:false,trimmed:false,like:''};
 const whole=previous.find(p=>nearDuplicate(p,text));
 if(whole)return {text,repeat:true,trimmed:false,like:whole};
 // Sentence by sentence: a copied line inside an otherwise new reply.
 const oldLines=previous.flatMap(sentences).filter(s=>words(s).length>=5);
 const parts=sentences(text);let repeated=0,total=0,like='';const keep=[];
 for(const part of parts){const n=words(part).length;total+=n;const hit=n>=5&&oldLines.find(o=>nearDuplicate(o,part));if(hit){repeated+=n;like||=hit;}else keep.push(part);}
 if(!repeated)return {text,repeat:false,trimmed:false,like:''};
 const rest=keep.join(' ').trim();
 if(repeated/Math.max(1,total)>=0.6||words(rest).length<5)return {text,repeat:true,trimmed:false,like};
 return {text:rest,repeat:false,trimmed:true,like};
}

// Function words: a phrase made only of these says nothing about a rut.
const COMMON=new Set('a an the and or but so to of in on at for with you your youre im i me my we us our it its is are was were be been that this thats just like what how do does did not no yes yeah oh lol if then than as up out get got go going gonna have has had can cant dont im ill its who they them their there here all'.split(' '));

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
export function retryNote(draft,like){
 const clip=s=>String(s||'').replace(/\s+/g,' ').trim().slice(0,160);
 return 'Your draft "'+clip(draft)+'" is nearly the same as something you already said'+(like&&clip(like)!==clip(draft)?' ("'+clip(like)+'")':'')+'. Reply to the latest chat message again with something genuinely different: new opening words, a different sentence shape, a new point or joke. Same RULES and length. Do not mention this note.';
}

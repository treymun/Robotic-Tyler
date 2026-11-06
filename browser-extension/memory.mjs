export class Memory {
 constructor(storage){this.storage=storage;}
 async read(id){const {conversationMemory={}}=await this.storage.get('conversationMemory');const e=conversationMemory[id];return e&&Date.now()-e.at<86400000?e.messages.slice(-24):[];}
 async write(id,messages){const {conversationMemory={}}=await this.storage.get('conversationMemory');const entries=Object.entries(conversationMemory).filter(([,e])=>Date.now()-e.at<86400000).sort((a,b)=>b[1].at-a[1].at).slice(0,15);const next=Object.fromEntries(entries);next[id]={at:Date.now(),messages:messages.slice(-24)};await this.storage.set({conversationMemory:next});}
 async readFriend(id){if(!/^7656119\d{10}$/.test(id||''))return [];const {friendConversationMemory={}}=await this.storage.get('friendConversationMemory');const e=friendConversationMemory[id];return e&&Date.now()-e.at<7*86400000?e.messages.slice(-8):[];}
 async writeFriend(id,messages){if(!/^7656119\d{10}$/.test(id||''))return;const {friendConversationMemory={}}=await this.storage.get('friendConversationMemory');const next=Object.fromEntries(Object.entries(friendConversationMemory).filter(([,e])=>Date.now()-e.at<7*86400000).sort((a,b)=>b[1].at-a[1].at).slice(0,29));next[id]={at:Date.now(),messages:messages.slice(-8)};await this.storage.set({friendConversationMemory:next});}
 async forget(id){const {conversationMemory={}}=await this.storage.get('conversationMemory');if(!(id in conversationMemory))return;delete conversationMemory[id];await this.storage.set({conversationMemory});}
 async clear(tab){const {conversationMemory={}}=await this.storage.get('conversationMemory');for(const id of Object.keys(conversationMemory))if(id.startsWith(tab+':'))delete conversationMemory[id];await this.storage.set({conversationMemory});}
}
const norm=s=>s.toLowerCase().replace(/[^a-z0-9 ]/g,' ').replace(/\s+/g,' ').trim();
export function freshReply(reply,history){const previous=history.filter(m=>m.role==='assistant');if(!previous.length)return reply;reply=reply.replace(/^(?:oh[, ]+)?(?:hello|hi|hey)\b(?: there| again)?(?:[, ]+(?:honey|darling|sweetie|everyone|buddy))?[!,. :—-]+/i,'').trim();const n=norm(reply);return !n||(n.length>=24&&previous.some(m=>norm(m.content)===n))?'':reply;}
// v2.20 "No filter": the rowdiest setting, meant for an uncensored model like Venice. Crude and loud, but
// still a friend with range rather than an insult generator.
const LIMITS=' Hard limits: no slurs about race, religion, sexuality, gender or disability, no threats, nothing sexual about real people in the chat, no graphic sexual descriptions, and drop the teasing the moment someone asks.';
const UNHINGED='NO FILTER MODE: talk like the most unhinged friend in the squad. Swear constantly and naturally, crude and dirty adult humor and innuendo are welcome, roast hard, be sarcastic, fire back fast. Range matters more than shock: not every message is an insult. Mix roasts with hype, hot takes, ridiculous hypotheticals, bits and genuine reactions; never reuse the same insult, opener or punchline twice in a row. When someone asks a real question or is actually having a rough time, answer properly first (one jab at most).';
// v2.39.1: the owner's opt-in "Explicit adult content on this PC" (Settings → AI & personality, off by
// default; only for replies from the AI on this PC). With it, graphic sexual content about made-up adults
// is allowed and only real threats are out (over-the-top game trash talk is fine). The other hard limits
// stay whatever the setting: no slurs, nothing sexual about real people in the chat or anyone under 18,
// stop teasing when someone asks.
const EXPLICIT='EXPLICIT ADULT CONTENT (the owner turned it on for the AI on this PC): graphic sexual content and descriptions are allowed when the conversation goes there, but only about made-up adults (18+). Never anything sexual about anyone under 18 or anyone who looks it, and never about the real people in this chat.';
const LIMITS_EXPLICIT=' Hard limits: no slurs about race, religion, sexuality, gender or disability, no real threats (over-the-top game trash talk is fine), nothing sexual about real people in the chat or anyone under 18, and drop the teasing the moment someone asks.';
export function styleGuide(mode,{explicit=false}={}){
 if(!explicit)return mode==='custom'?'':mode==='rowdy'?'Use playful profanity and varied gaming roasts.':mode==='unhinged'?UNHINGED+LIMITS:'Use strong profanity, sharp sarcastic gaming roasts and cheeky non-graphic innuendo where natural. Vary jokes; do not force recurring callbacks. No identity-based slurs, threats or graphic sexual descriptions. Respect requests to stop.';
 const base=mode==='custom'?'':mode==='rowdy'?'Use playful profanity and varied gaming roasts.':mode==='unhinged'?UNHINGED+LIMITS_EXPLICIT:'Use strong profanity, sharp sarcastic gaming roasts and innuendo where natural. Vary jokes; do not force recurring callbacks. No identity-based slurs or real threats (over-the-top game trash talk is fine). Respect requests to stop.';
 return (base?base+' ':'')+EXPLICIT;
}

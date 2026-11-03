// The name tag in Tyler's chat messages (v2.16): "(ROBOTIC TYLER) Anyone up for another round?".
//
// One formatting layer for every message Tyler sends (AI replies, trivia, party host, music,
// moderation, soundboard games): the body is cleaned of any legacy prefix, then the owner's tag
// is added once, or left off when the owner turned it off. The tag is plain text and only
// decorative: it never decides who wrote a message or who may do something. Tyler recognises
// his own messages by Steam's own record of the sender (TylerIdentity.meta(...).self) and by
// remembering exactly what he just sent; the tag only adds a cheap extra check.
//
// A classic script, so the Steam page's isolated world, the extension background and the
// desktop app can all use it (globalThis.TylerChatTag).
(() => {
 'use strict';
 if(globalThis.TylerChatTag)return;
 const DEFAULT='ROBOTIC TYLER',MAX=32;
 // Line breaks, other control characters, bidi overrides and zero-width tricks aren't allowed in a tag.
 const BAD_RANGES=[[0x0,0x1f],[0x7f,0x9f],[0xad,0xad],[0x61c,0x61c],[0x180e,0x180e],[0x200b,0x200f],[0x2028,0x202e],[0x2060,0x2069],[0xfeff,0xfeff],[0xfff9,0xfffb]];
 const bad=s=>[...s].some(ch=>{const c=ch.codePointAt(0);return BAD_RANGES.some(([a,b])=>c>=a&&c<=b);});
 const chars=s=>[...s].length;
 /** Checks a tag the owner typed: {ok:true,name} or {ok:false,error}. Capitalization and Unicode are kept. */
 function validate(raw){
  const name=String(raw??'').normalize('NFC').trim();
  if(!name)return {ok:false,error:'Enter a chat display name, or turn the name tag off.'};
  if(bad(name))return {ok:false,error:'The chat display name can\'t contain line breaks or hidden control characters.'};
  if(chars(name)>MAX)return {ok:false,error:'Keep the chat display name to '+MAX+' characters or fewer.'};
  return {ok:true,name};
 }
 /** Settings → {enabled,name}. No saved preference means the tag is on with ROBOTIC TYLER. */
 function config(s={}){const v=validate(s.chatTagName);return {enabled:s.chatTagEnabled!==false,name:v.ok?v.name:DEFAULT};}
 let current=config();
 const esc=s=>s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
 // What older versions (or the AI imitating them) put in front of a message.
 const LEGACY=/^\s*(?:\[\s*ROBOTIC[ -]?TYLER\s*\]|\(\s*ROBOTIC[ -]?TYLER\s*\)|ROBOTIC[ -]?TYLER\s*:|\[AI\])\s*/i;
 const tagRe=name=>new RegExp('^\\s*\\(\\s*'+esc(name)+'\\s*\\)\\s*');
 /** The message without a leading legacy prefix or this tag. Only the very start is touched, once. */
 function strip(text,cfg=current){
  const s=String(text??'');
  if(LEGACY.test(s))return s.replace(LEGACY,'');
  const own=tagRe(cfg.name);return own.test(s)?s.replace(own,''):s;
 }
 /** The text Tyler posts: tag added exactly once (or not at all when it's off). */
 function format(text,cfg=current){const body=strip(text,cfg).trimStart();return cfg.enabled&&body?'('+cfg.name+') '+body:body;}
 /** A line that starts with a Tyler tag (legacy or current). Used only to ignore lines, never to trust them. */
 function tagged(line,cfg=current){const s=String(line??'');return LEGACY.test(s)||tagRe(cfg.name).test(s);}

 // Exactly what Tyler sent recently (whole message and each line, with and without the tag), so
 // his own output is recognised even with the tag off and before Steam's metadata arrives.
 const sent=new Map(),KEEP=10*60*1000,norm=s=>String(s??'').replace(/\s+/g,' ').trim();
 function remember(text){
  const now=Date.now(),add=v=>{const k=norm(v);if(k)sent.set(k,now);};
  add(text);add(strip(text));for(const line of String(text??'').split('\n')){add(line);add(strip(line));}
  for(const [k,at] of sent)if(now-at>KEEP||sent.size>400)sent.delete(k);else break;
 }
 function recent(text){const at=sent.get(norm(text));return !!at&&Date.now()-at<KEEP;}
 /**
  * Whether a chat line is Tyler's own output: Steam says the bot account sent it (meta.self), or it
  * is exactly something Tyler just sent, or it carries a Tyler tag. Lines that pass are ignored by
  * the chat features; nothing here grants permissions.
  */
 function own(line,meta){return meta?.self===true||recent(line)||tagged(line);}
 globalThis.TylerChatTag=Object.freeze({DEFAULT,MAX,validate,config,strip,format,tagged,remember,recent,own,
  get current(){return current;},
  // Accepts saved settings ({chatTagEnabled,chatTagName}) or a config() result ({enabled,name}),
  // which is what the background's connection reply carries. Reading the second shape as the
  // first used to reset the tag to (ROBOTIC TYLER) on every connection check (fixed in 2.16.1).
  set(s){const v=s&&typeof s==='object'&&('enabled' in s||'name' in s)&&!('chatTagEnabled' in s||'chatTagName' in s)?{chatTagEnabled:s.enabled,chatTagName:s.name}:s;current=config(v||{});return current;}});
})();

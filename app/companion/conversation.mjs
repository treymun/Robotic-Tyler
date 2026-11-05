import {styleGuide} from './memory.mjs';
export function temporary(error){const text=String(error?.message||error||'');return /\b(?:429|500|502|503|504)\b|timeout|timed out|failed to fetch|networkerror|speech providers are cooling down/i.test(text);}
// v2.33: what a failed reply means for automatic mode, so one bad turn no longer ends the session.
//  fatal     — the key, credits, model, a spending cap, a daily quota or an emergency stop: stop and say why;
//  busy      — another request from this tab is still running: wait a moment and try the same turn again;
//  transient — rate limit, provider down, network, timeout: retry this turn (bounded) after a short wait;
//  turn      — this one turn failed (no text, a refusal, a safety block…): skip it and keep listening.
export function errorKind(error){
 const text=String(error?.message||error||''),status=Number(error?.status)||0;
 if(error?.kind&&['fatal','busy','transient','turn'].includes(error.kind))return error.kind;
 if(/emergency stop|spending cap|save a key|rejected the key|out of credits|for today|isn.t available (?:on OpenRouter with|to this Google key)|another steam tab owns|disabled\. opt in|key is required/i.test(text)||[401,402,403].includes(status))return 'fatal';
 if(/still handling the previous command|wait briefly before another command/i.test(text))return 'busy';
 if(temporary(error)||/try again shortly/i.test(text))return 'transient';
 return 'turn';
}
/** How long to wait before retrying a transient failure: the provider's own Retry-After when it gave
 * one, 15 s for a rate limit, about 3 s for a provider error, a network blip or a timeout. */
export function transientDelay(error){const asked=Number(error?.retryAfter)||0;if(asked>0)return Math.min(300000,Math.max(1000,asked));return /\b429\b|rate-limit|rate limit/i.test(String(error?.message||error||''))?15000:3000;}
export function retryDelay(attempt){return Math.min(60000,15000*Math.pow(2,Math.max(0,attempt)));}
export function voiceControl(text){const s=String(text).toLowerCase().replace(/[^a-z0-9\s]/g,' ').replace(/\s+/g,' ').trim();return /^(?:(?:robotic )?tyler[, ]+)?(?:stop(?: talking)?|hold on|be quiet|quiet please|pause)(?: please)?$/.test(s)?'stop':null;}
export function normalizeExtras(settings={}){
 const aliases=String(settings.nicknameAliases||'').split('\n').slice(0,30).map(line=>line.match(/^\s*(7656119\d{10})\s*=\s*(.{1,60})\s*$/)).filter(Boolean).map(m=>({id:m[1],name:m[2].trim()}));
 const jokes=String(settings.insideJokes||'').split('\n').map(s=>s.trim().slice(0,180)).filter(Boolean).slice(0,20);
 return {aliases,jokes,gap:Math.max(3,Math.min(30,Number(settings.callbackGap)||6))};
}
export function conversationGuide(mode,automatic){if(!automatic)return '';if(!['quiet','occasional'].includes(mode))return 'ACTIVE CONVERSATION: Reply naturally to the latest message, including short remarks and follow-up questions. No command or name mention is required. Unknown speaker identity only means avoid names; it never means remain silent. Always provide an actual conversational response, not a skip marker. Keep it brief and give people room to speak.';return 'GROUP CONVERSATION: People may be talking to each other. In this mode only, if a remark is clearly for another person or needs no response, output exactly [[SKIP]]. '+(mode==='quiet'?'Quiet mode: respond when directly addressed as ROBOTIC TYLER or clearly asked for your view.':'Occasional mode: favor direct questions and useful additions; skip routine background chatter.');}
// The owner's personality settings, shared by text replies and live voice so both sound the same.
export const PERSONAS={announcer:'You are an energetic but concise esports play-by-play announcer.',dry:'Respond with dry, deadpan gaming humor.',coach:'Be upbeat, supportive and concise with actionable gaming tips.',regular:''};
// Model-specific notes (v2.20). Venice is uncensored: it should commit to the owner's style instead of
// hedging, while the rules above it still decide what the chat can and can't change.
export function modelStyle(modelKey,roastMode){
 // Venice, and an uncensored model on this PC (v2.38: the community's refusal-free Qwen3.5).
 if(modelKey!=='venice'&&modelKey!=='local-uncensored')return '';
 return 'MODEL NOTE: You run on an uncensored model. Commit to the owner style: no disclaimers, no moralizing, no "as an AI", no softening crude jokes the owner asked for. Stay quick and specific to what was just said, keep a consistent character, and switch to straight, useful answers when the question is serious.'+(roastMode==='custom'?'':' Vary the comedy; a reply without an insult is often funnier.');
}
// v2.38.1: the small models on this PC (Qwen3.5 4B and 9B) drifted into a generic assistant voice: the
// owner style sits in the middle of a long block of rules, and they follow what comes last most. For them
// the character is said again where they pay the most attention: last in the instructions, and right
// before the latest chat message's reminder.
export function characterBrief(settings={}){return (String(settings.personality||'Witty gaming buddy.').replace(/\s+/g,' ').trim().slice(0,400)+' '+(PERSONAS[settings.v23Persona]||'')).trim();}
export function localCharacter(settings={}){return 'YOUR CHARACTER (the owner style above; it decides how every reply sounds): '+characterBrief(settings)+' Stay in this character in every reply, in your own words and with its attitude, slang and quirks. Never sound like a generic assistant: no "great question", no "as an AI", no offers of more help, no summaries.';}
export function localCharacterReminder(settings={}){return '(Your character: '+characterBrief(settings).slice(0,240)+' Reply in that voice'+(settings.length==='short'?', in one or two sentences':settings.length==='detailed'?'':', in one to three sentences unless they asked for detail')+', with no offers of help.)';}
/** v2.38.1: the small models on this PC sometimes wrap the whole reply in quote marks or use Markdown
 * bold, which Steam chat shows as literal asterisks. Only those are removed; the words stay (a single
 * *word* is left alone: people type that in chat too). */
export function localReplyTidy(text){
 let s=String(text??'').trim();
 const q=/^(["“])([\s\S]+)(["”])$/.exec(s);
 if(q&&!/["“”]/.test(q[2]))s=q[2].trim();
 return s.replace(/\*\*([^*\n]+)\*\*/g,'$1');
}
export function ownerStyle(settings={}){return 'OWNER STYLE (from the owner\'s settings page; trusted): '+String(settings.personality||'Witty gaming buddy.').slice(0,1500)+' '+styleGuide(settings.roastMode)+' '+(PERSONAS[settings.v23Persona]||'');}

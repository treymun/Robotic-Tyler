import {styleGuide} from './memory.mjs';
export function temporary(error){const text=String(error?.message||error||'');return /\b(?:429|500|502|503|504)\b|timeout|timed out|failed to fetch|networkerror|speech providers are cooling down/i.test(text);}
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
 if(modelKey!=='venice')return '';
 return 'MODEL NOTE: You run on an uncensored model. Commit to the owner style: no disclaimers, no moralizing, no "as an AI", no softening crude jokes the owner asked for. Stay quick and specific to what was just said, keep a consistent character, and switch to straight, useful answers when the question is serious.'+(roastMode==='custom'?'':' Vary the comedy; a reply without an insult is often funnier.');
}
export function ownerStyle(settings={}){return 'OWNER STYLE (from the owner\'s settings page; trusted): '+String(settings.personality||'Witty gaming buddy.').slice(0,1500)+' '+styleGuide(settings.roastMode)+' '+(PERSONAS[settings.v23Persona]||'');}

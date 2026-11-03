// ROBOTIC TYLER 0.6: request preparation and turn pacing. No network calls.
export function clampNumber(value,min,max,fallback){const n=Number(value);return Number.isFinite(n)?Math.max(min,Math.min(max,n)):fallback;}
export function identifyTurn(turn){const author=turn?.speaker;const name=author&&/^7656119\d{10}$/.test(author.id||'')?String(author.name||'').slice(0,80):'Unknown speaker';return '['+name+'] '+String(turn?.text||'').slice(0,600);}
export function batchTurns(turns){return turns.slice(-6).map(identifyTurn).join('\n').slice(-1400);}
export function isDirect(text){return /\b(?:robotic[ -]?tyler|tyler)\b|^!tyler\b|\?$/.test(String(text||'').toLowerCase());}
export function replyCap(modality,length){if(modality==='voice')return length==='detailed'?180:length==='short'?70:115;return length==='detailed'?380:length==='short'?110:220;}
export function acceptableScope(s){return typeof s==='string'&&/^(?:data-chatid|data-chat-group-id|data-channelid|data-chat-room-id):[A-Za-z0-9:_\-]{1,110}$/.test(s)?s:null;}
export function cooldownFor(mode,direct=false,preset='balanced'){if(mode==='voice')return 1500;if(preset==='cautious')return 5000;return direct?900:2200;}
export function localBudgetReached(usage,cap){const n=Number(cap);return Number.isFinite(n)&&n>0&&Number(usage?.reportedCostUSD||0)>=n;}

// Optional zero-cost heuristic route selection. Does not make an extra API call.
export function routeComplexity(text=''){
 const t=String(text).toLowerCase();
 if(t.length>260||/\b(explain|compare|difference|strategy|walk me through|step by step|calculate|why|how do i|debug|troubleshoot|recommend|build|optimiz|analysis|plan)\b/.test(t))return 'deep';
 return 'fast';
}

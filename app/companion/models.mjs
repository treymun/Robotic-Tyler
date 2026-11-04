// Text models Tyler can use (v2.20), shared by the background (real replies), Settings (model
// cards, the preview and "Test selected model") and the desktop app. One place decides which model
// and which OpenRouter providers a request uses, so a choice in Settings is what actually runs.
//
// OpenRouter: every model has its own provider routing. Parasail is never used, for any model
// (its spam protection blocked Tyler before). A manual choice is never swapped for another model;
// smart routing only ever moves between Llama 3.3 and Mistral Small, and only when one of those
// two is selected. Venice runs only on Venice, with no fallback provider, so its price can't rise.
//
// Gemini: three text models, all on the Gemini Developer API free tier (checked against Google's
// pricing and models pages, November 2026). Free tier means free within Google's per-project rate
// limits and only while the project has no billing enabled; with billing on, every request is
// charged. Tyler never switches model or billing when a limit is reached.

import {routeComplexity} from './quality.mjs';

export const NEVER_PROVIDERS=Object.freeze(['parasail']);

const route=r=>Object.freeze({...r,ignore:[...new Set([...(r.ignore||[]),...NEVER_PROVIDERS])]});

export const OPENROUTER_MODELS=Object.freeze([
 Object.freeze({key:'fast',id:'meta-llama/llama-3.3-70b-instruct',label:'Llama 3.3 70B',badge:'Default',
  provider:route({order:['groq','deepinfra','sambanova'],allow_fallbacks:true,max_price:{prompt:0.75,completion:1.00}}),
  strengths:'Quick, dependable all-rounder. Groq first for the fastest first word; DeepInfra and SambaNova as backups.',
  price:'$0.10–0.59 in / $0.32–0.90 out per million tokens, depending on the provider that answers'}),
 Object.freeze({key:'budget',id:'mistralai/mistral-small-3.2-24b-instruct',label:'Mistral Small 3.2',badge:'Budget',
  provider:route({order:['deepinfra','venice','mistral'],allow_fallbacks:true,max_price:{prompt:0.30,completion:0.50}}),
  strengths:'The cheapest choice. Great for short banter and busy chats.',
  price:'$0.075–0.10 in / $0.20–0.30 out per million tokens'}),
 Object.freeze({key:'venice',id:'cognitivecomputations/dolphin-mistral-24b-venice-edition',label:'Venice Uncensored',badge:'No filter',
  provider:route({only:['venice'],allow_fallbacks:false,max_price:{prompt:0.25,completion:1.00}}),
  // Venice accepts sampling settings: a little extra variety, and penalties against repeating the same jokes.
  sampling:Object.freeze({temperature:0.95,presence_penalty:0.35,frequency_penalty:0.25}),
  strengths:'Dolphin Mistral 24B, Venice edition: no corporate filter, so crude humor, profanity and hard roasts land the way your personality settings ask. Served only by Venice.',
  price:'$0.20 in / $0.90 out per million tokens (Venice only, no fallback)'}),
]);
export const OPENROUTER_DEFAULT='fast';
export const openRouterModel=key=>OPENROUTER_MODELS.find(m=>m.key===key)||OPENROUTER_MODELS.find(m=>m.key===OPENROUTER_DEFAULT);

/** The OpenRouter model a reply uses. Venice (or any manual choice outside the routing pair) is kept as chosen. */
export function chooseOpenRouter(settings={},text=''){
 const picked=openRouterModel(settings.brain);
 if(settings.smartRouting===true&&(picked.key==='fast'||picked.key==='budget'))return openRouterModel(routeComplexity(text)==='deep'?'fast':'budget');
 return picked;
}
/** Request fields for one OpenRouter model: id, its own provider routing, its own sampling. */
export function openRouterRequest(model){return {model:model.id,provider:{...model.provider,ignore:[...model.provider.ignore]},...(model.sampling||{})};}
export function openRouterLabel(settings={}){
 const picked=openRouterModel(settings.brain);
 return settings.smartRouting===true&&(picked.key==='fast'||picked.key==='budget')?'Auto: Mistral Small 3.2 / Llama 3.3 70B':picked.label;
}

export const GEMINI_TEXT_MODELS=Object.freeze([
 Object.freeze({id:'gemini-3.1-flash-lite',tier:'fast',tierLabel:'Fast',label:'Gemini 3.1 Flash-Lite',thinking:'minimal',headroom:0,
  strengths:'The quickest and cheapest: short messages, rapid back-and-forth, light on your quota. Tyler\'s Gemini model before v2.20.',
  price:'Paid tier: $0.25 in / $1.50 out per million tokens'}),
 Object.freeze({id:'gemini-3.5-flash-lite',tier:'balanced',tierLabel:'Balanced',recommended:true,label:'Gemini 3.5 Flash-Lite',thinking:'minimal',headroom:0,
  strengths:'Newer and still very fast, with better persona consistency and multi-turn instruction following than 3.1 Flash-Lite. The best everyday pick.',
  price:'Paid tier: $0.30 in / $2.50 out per million tokens'}),
 Object.freeze({id:'gemini-3.8-flash',tier:'advanced',tierLabel:'Advanced',label:'Gemini 3.8 Flash',thinking:'low',headroom:1024,
  strengths:'Google\'s newest Flash model: the smartest of the three for tricky questions, context and longer answers. Thinks briefly first (low), so replies take a little longer.',
  price:'Paid tier: $0.75 in / $3.75 out per million tokens until Dec 31, 2026, then $1.50 / $7.50'}),
]);
// Existing installs keep the model they had; 3.5 Flash-Lite is marked as the recommendation.
export const GEMINI_TEXT_DEFAULT='gemini-3.1-flash-lite';
export const geminiTextModel=id=>GEMINI_TEXT_MODELS.find(m=>m.id===id)||GEMINI_TEXT_MODELS.find(m=>m.id===GEMINI_TEXT_DEFAULT);
// Speech-to-text for Standard voice stays on the fastest model whatever the text model is.
export const GEMINI_TRANSCRIBE_MODEL='gemini-3.1-flash-lite';
export const GEMINI_LINKS=Object.freeze({pricing:'https://ai.google.dev/gemini-api/docs/pricing',limits:'https://aistudio.google.com/rate-limit'});
export const FREE_TIER_NOTE='Free tier: no charge within Google\'s per-project rate limits (requests per minute and per day, shown in AI Studio), and only while your Google Cloud project has no billing enabled. With billing on, requests are charged at the paid rate. Free-tier prompts may be used by Google to improve its products. When a limit is reached Tyler waits; he never switches model or billing on his own.';

/** The label the panel and Settings show for the model a provider will use. */
export function modelLabel(settings={}){return settings.aiProvider==='gemini'?geminiTextModel(settings.geminiTextModel).label:openRouterLabel(settings);}

// ── Errors people can act on ────────────────────────────────────────────────
const clip=s=>String(s||'').replace(/\s+/g,' ').trim().slice(0,220);
/** OpenRouter failure → a short explanation. `model` is the entry that was asked for. */
export function openRouterProblem(status,message,model){
 const m=clip(message),name=model?.label||'the selected model';
 if(status===401||status===403&&/key|auth/i.test(m))return 'OpenRouter rejected the key. Paste the full key from your OpenRouter Keys page.';
 if(status===402)return 'OpenRouter says the key is out of credits. Add credits or raise the key\'s limit.';
 if(model?.key==='venice'&&(status===404||status===503||/no (allowed )?(endpoints|providers)|provider.*unavailable/i.test(m)))return 'Venice isn\'t available on OpenRouter right now. Tyler only uses Venice for '+name+' (no other provider, so the price can\'t change). Try again shortly or pick another model.';
 if(status===404)return name+' isn\'t available on OpenRouter with Tyler\'s provider settings right now ('+(m||'no endpoint')+').';
 if(status===429)return 'OpenRouter or its provider is rate-limiting '+name+'. Tyler will try again shortly.';
 if(status>=500)return 'OpenRouter\'s provider for '+name+' failed ('+status+'). Try again shortly.';
 return 'OpenRouter '+status+': '+(m||'request failed');
}
/** Gemini failure → explanation, and whether waiting a moment and retrying once makes sense. */
export function geminiProblem(status,body,modelId){
 const model=geminiTextModel(modelId).id===modelId?geminiTextModel(modelId):{label:modelId||'the selected Gemini model'};
 const err=body?.error||{},m=clip(err.message),details=Array.isArray(err.details)?err.details:[];
 const retry=details.find(d=>String(d['@type']||'').endsWith('RetryInfo'))?.retryDelay;
 const wait=retry?Math.round(parseFloat(retry)*1000):0;
 const quota=details.find(d=>String(d['@type']||'').endsWith('QuotaFailure'))?.violations?.[0]?.quotaId||'';
 if(status===429){
  const daily=/PerDay|per_day|requests_per_day/i.test(quota+' '+m),free=/free_tier|FreeTier/i.test(quota+' '+m);
  return {retryMs:!daily&&wait>0&&wait<=8000?wait:0,
   text:(free?'Google\'s free-tier limit':'Google\'s rate limit')+' for '+model.label+' is used up'+(daily?' for today (it resets at midnight Pacific time)':' for this minute')+'. Tyler doesn\'t switch models or billing on his own: wait, or pick another Gemini model in Settings. Your limits: aistudio.google.com/rate-limit'};
 }
 if(status===404)return {retryMs:0,text:model.label+' isn\'t available to this Google key (404). It may not be enabled for your project or region.'};
 if(status===400&&/thinking level/i.test(m))return {retryMs:0,text:model.label+' rejected Tyler\'s thinking setting: '+m};
 if(status===400&&/api key/i.test(m)||status===401||status===403)return {retryMs:0,text:'Google rejected the key for '+model.label+' ('+status+'). Check the key and that the Gemini API is enabled for its project.'};
 if(status===400)return {retryMs:0,text:'Google rejected the request for '+model.label+': '+(m||'invalid request')};
 if(status===500||status===503||status===504)return {retryMs:1500,text:'Google\'s '+model.label+' is busy or unavailable right now ('+status+'). Try again shortly.'};
 return {retryMs:0,text:'Gemini '+status+' for '+model.label+': '+(m||'request failed')};
}

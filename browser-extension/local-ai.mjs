// Text AI on this PC (v2.38, stage 1): Tyler's text replies made by a local model in the desktop app
// (app/local-ai), with no key and no cost. Shared by the background (real replies), Settings and
// the tests. The downloads themselves (URLs, sizes, SHA-256) are pinned in app/local-ai/lock.json;
// tests/local-ai.test.mjs checks that this list matches it.
//
// Stage 1 is text only. Voice calls still need a cloud key to hear people (speech to text), and for
// the cloud voice unless a theme voice speaks. The rule is voiceKeyFor() below.

export const LOCAL_MODELS=Object.freeze([
 Object.freeze({key:'4b',label:'Qwen3.5 4B',size:'4B',bytes:2740937888,uncensored:false,
  about:'Quick and light. Fits most graphics cards and runs on the processor too.'}),
 Object.freeze({key:'9b',label:'Qwen3.5 9B',size:'9B',bytes:5680522464,uncensored:false,
  about:'Smarter, better at jokes and follow-ups. Best with about 8 GB of free graphics memory.'}),
 Object.freeze({key:'4b-uncensored',label:'Qwen3.5 4B uncensored',size:'4B',bytes:2707514688,uncensored:true,
  about:'Uncensored: refusals removed by the community (huihui-ai’s “abliterated” version); a little less accurate.'}),
 Object.freeze({key:'9b-uncensored',label:'Qwen3.5 9B uncensored',size:'9B',bytes:5627045248,uncensored:true,
  about:'Uncensored: refusals removed by the community (huihui-ai’s “abliterated” version); a little less accurate.'}),
]);
export const localModel=key=>LOCAL_MODELS.find(m=>m.key===key)||null;

/** Chrome has no local engine: a reply with "This PC" chosen fails with this, and nothing else is asked. */
export const LOCAL_CHROME_ERROR='Text AI on this PC is part of the ROBOTIC TYLER desktop app, and this is Chrome. Choose OpenRouter or Google Gemini in Settings → AI & personality, or use the desktop app. (Tyler doesn’t switch to a cloud AI by himself.)';
/** No key for hearing in a voice call with "This PC" chosen. */
export const LOCAL_HEARING_ERROR='Voice calls still need an OpenRouter or Google key to hear people (speech to text): the AI on this PC writes the replies, but local hearing is coming next. Save a key in Settings → AI & personality, or use text chat.';

/**
 * The cloud key a voice call uses for hearing (speech to text) and for the cloud voice.
 *   OpenRouter chosen → the OpenRouter key; Gemini chosen → the Google key (as before).
 *   This PC chosen    → the saved OpenRouter key if there is one, else the saved Google key, else none
 *                       (the turn then fails with LOCAL_HEARING_ERROR; nothing is called).
 * Returns {provider:'openrouter'|'gemini'|null, key, error}.
 */
export function voiceKeyFor(settings={}){
 const or=settings.openrouterKey||'',g=settings.geminiKey||'';
 if(settings.aiProvider==='gemini')return {provider:'gemini',key:g,error:g?null:'Save a key for the selected AI provider in Settings.'};
 if(settings.aiProvider!=='local')return {provider:'openrouter',key:or,error:or?null:'Save a key for the selected AI provider in Settings.'};
 if(or)return {provider:'openrouter',key:or,error:null};
 if(g)return {provider:'gemini',key:g,error:null};
 return {provider:null,key:'',error:LOCAL_HEARING_ERROR};
}

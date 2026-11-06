// AI on this PC (desktop app, app/local-ai), shared by the background (real turns), Settings and the
// tests. The downloads themselves (URLs, sizes, SHA-256) are pinned in app/local-ai/lock.json;
// tests/local-ai*.test.mjs check that these lists match it.
//   v2.38 (stage 1): text replies from a local model (llama.cpp with Qwen3.5), no key, no cost.
//   v2.39 (stage 2): hearing (speech to text, NVIDIA Parakeet) and a speaking voice (Kokoro) on this
//   PC too, both through sherpa-onnx on the processor. With all three on this PC, a Standard voice
//   call needs no key at all. The rules are voiceKeyFor() and voicePlan() below.

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
/** No way to hear a voice call: This PC writes the replies, hearing is set to Cloud and no key is saved. */
export const LOCAL_HEARING_ERROR='This voice call has no way to hear people: hearing is set to Cloud and no OpenRouter or Google key is saved. In the desktop app, choose Hearing → This PC in Settings → Voice → Standard voice (no key needed), or save a key in Settings → AI & personality.';

// ── v2.39: hearing and voice on this PC ───────────────────────────────────
/** What the downloads are (app/local-ai/lock.json → speech; the test checks these match). */
export const LOCAL_SPEECH=Object.freeze({
 engine:Object.freeze({name:'sherpa-onnx',version:'1.13.8'}),
 hearing:Object.freeze({label:'Parakeet TDT 0.6B v3',by:'NVIDIA',bytes:670478772,license:'CC-BY-4.0',languages:25}),
 voice:Object.freeze({label:'Kokoro-82M v1.0',by:'hexgrad',bytes:366912005,license:'Apache-2.0'}),
});
/** Kokoro's stock voices Tyler offers (sid = the speaker number in Kokoro v1.0's voices.bin). */
export const KOKORO_VOICES=Object.freeze([
 Object.freeze({id:'am_michael',sid:16,label:'Michael',accent:'us',about:'American male'}),
 Object.freeze({id:'am_puck',sid:18,label:'Puck',accent:'us',about:'American male, lively'}),
 Object.freeze({id:'am_fenrir',sid:14,label:'Fenrir',accent:'us',about:'American male, deep'}),
 Object.freeze({id:'bm_george',sid:26,label:'George',accent:'gb',about:'British male'}),
 Object.freeze({id:'af_heart',sid:3,label:'Heart',accent:'us',about:'American female'}),
 Object.freeze({id:'bf_emma',sid:21,label:'Emma',accent:'gb',about:'British female'}),
]);
export const kokoroVoice=id=>KOKORO_VOICES.find(v=>v.id===id)||KOKORO_VOICES[0];
/** Chrome has no local engines: hearing or the voice on this PC chosen there fails with these. */
export const LOCAL_HEARING_CHROME_ERROR='Hearing on this PC is part of the ROBOTIC TYLER desktop app, and this is Chrome. Choose Hearing → Cloud in Settings → Voice → Standard voice, or use the desktop app. (Tyler doesn’t switch to a cloud service by himself.)';
export const LOCAL_VOICE_CHROME_ERROR='the voice on this PC (Kokoro) is made by the desktop app, and this is Chrome. Choose Cloud voice in Settings → Voice → Standard voice, or use the desktop app.';

/**
 * The cloud key a voice call uses for cloud hearing (speech to text) and for the cloud voice.
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

/**
 * v2.39: how a Standard voice call hears and speaks, and whether it needs a key.
 *   hearing: 'local' (Hearing → This PC) | 'openrouter' | 'gemini' | null (cloud chosen, no key)
 *   speech:  'kokoro' | 'theme' (both on this PC) | 'openrouter' | 'gemini' | null (cloud voice, no key)
 *   needsKey: false when hearing and speaking are both on this PC (the text provider's own key
 *   rule is separate: This PC needs none).
 * `key`/`provider` are the cloud key and its provider (voiceKeyFor), used only for cloud parts.
 * Returns {hearing, speech, provider, key, needsKey, hearingError, ready}.
 */
export function voicePlan(settings={}){
 const cloud=voiceKeyFor(settings),hearLocal=settings.voiceHearing==='local';
 const speak=settings.speechEngine==='theme'?'theme':settings.speechEngine==='kokoro'?'kokoro':'cloud';
 const hearing=hearLocal?'local':cloud.key?cloud.provider:null;
 const speech=speak==='cloud'?(cloud.key?cloud.provider:null):speak;
 const needsKey=!hearLocal||speak==='cloud';
 // Hearing with no way to hear: the cloud rule's own error (LOCAL_HEARING_ERROR for This PC).
 const hearingError=hearing?null:cloud.error||'Save a key for the selected AI provider in Settings.';
 const textReady=settings.aiProvider==='local'||!!cloud.key;
 return {hearing,speech,provider:cloud.provider,key:cloud.key,needsKey,hearingError,ready:!!hearing&&!!speech&&textReady};
}

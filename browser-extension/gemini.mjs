import {speechChunks} from './speech.mjs';
import {geminiTextModel,geminiProblem,GEMINI_TRANSCRIBE_MODEL,GEMINI_TEXT_DEFAULT} from './models.mjs';
export const geminiModel=GEMINI_TEXT_DEFAULT;
export const geminiSpeech='gemini-2.5-flash-preview-tts';
const pause=(ms,signal)=>new Promise((resolve,reject)=>{const t=setTimeout(resolve,ms);signal?.addEventListener?.('abort',()=>{clearTimeout(t);reject(signal.reason||Error('Cancelled'));},{once:true});});
// One request; a short per-minute limit or a busy Google gets one retry after the delay Google asks for.
async function generate(key,model,body,signal,{full=false}={}){
 for(let attempt=0;;attempt++){
  const response=await fetch('https://generativelanguage.googleapis.com/v1beta/models/'+model+':generateContent',{method:'POST',redirect:'error',headers:{'Content-Type':'application/json','x-goog-api-key':key},body:JSON.stringify(body),signal:AbortSignal.any([AbortSignal.timeout(35000),signal||new AbortController().signal])});
  if(response.ok){const data=await response.json();return full?data:data.candidates?.[0]?.content?.parts||[];}
  const problem=geminiProblem(response.status,await response.json().catch(()=>null),model);
  if(attempt===0&&problem.retryMs>0){await pause(problem.retryMs+Math.round(Math.random()*400),signal);continue;}
  const error=Error('Gemini '+response.status+' · '+problem.text);error.status=response.status;throw error;
 }
}
function textOf(parts){return parts.filter(p=>!p.thought).map(p=>p.text||'').join('').trim();}
/** Chat history → Gemini contents. Gemini 3.5 and later reject a request that ends on a model turn. */
export function geminiContents(messages){
 const contents=messages.filter(m=>m.role!=='system').map(m=>({role:m.role==='assistant'?'model':'user',parts:[{text:String(m.content||'')}]}));
 while(contents.length&&contents.at(-1).role==='model')contents.pop();
 return contents;
}
/** The request body for one text model: its own thinking level, and room for its thinking. */
export function geminiTextBody(messages,cap,modelId){
 const model=geminiTextModel(modelId),system=messages.filter(m=>m.role==='system').map(m=>m.content).join('\n');
 return {systemInstruction:{parts:[{text:system}]},contents:geminiContents(messages),generationConfig:{maxOutputTokens:cap+model.headroom,thinkingConfig:{thinkingLevel:model.thinking}}};
}
export async function geminiReply(key,messages,cap,signal,modelId){
 const model=geminiTextModel(modelId);
 const data=await generate(key,model.id,geminiTextBody(messages,cap,model.id),signal,{full:true});
 const candidate=data.candidates?.[0],text=textOf(candidate?.content?.parts||[]);
 if(!text)throw Error(candidate?.finishReason==='MAX_TOKENS'?model.label+' used its whole reply budget before answering. Try a longer reply length.':candidate?.finishReason==='SAFETY'||data.promptFeedback?.blockReason?model.label+' declined to answer that one (Google safety filter).':'Gemini returned no reply.');
 return text;
}
export async function geminiHear(key,audio,signal){
 return textOf(await generate(key,GEMINI_TRANSCRIBE_MODEL,{contents:[{parts:[{text:'Transcribe only the spoken words. Return an empty string for silence or noise.'},{inlineData:{mimeType:'audio/wav',data:audio}}]}]},signal));
}
// Gemini text-to-speech. 2.5 Flash TTS (the model used before v2.15) stays the default; the 3.8
// models read the text exactly as written, so they get no "Read aloud:" lead-in.
export const GEMINI_TTS_MODELS=Object.freeze([
 Object.freeze({id:'gemini-2.5-flash-preview-tts',label:'Gemini 2.5 Flash TTS (preview)',note:'The model Tyler has always used.'}),
 Object.freeze({id:'gemini-3.8-flash-lite-tts',label:'Gemini 3.8 Flash-Lite TTS',note:'Google\'s current low-latency speech model.'}),
 Object.freeze({id:'gemini-3.8-flash-tts',label:'Gemini 3.8 Flash TTS',note:'Most expressive, a little slower.'}),
]);
export function geminiTtsModel(id){return GEMINI_TTS_MODELS.some(m=>m.id===id)?id:geminiSpeech;}
const GROK_NAMES={rex:'Charon',eve:'Kore',ara:'Aoede',sal:'Puck',leo:'Fenrir'};
const pcmOf=b64=>{const s=atob(b64),a=new Uint8Array(s.length);for(let i=0;i<s.length;i++)a[i]=s.charCodeAt(i);return a;};
/** Speech for the whole text: sentence-sized requests, joined into one WAV. */
export async function geminiSpeak(key,text,voice,signal,modelId){
 const model=geminiTtsModel(modelId),voiceName=GROK_NAMES[voice]||(/^[A-Z][a-z]+$/.test(voice||'')?voice:'Charon');
 const chunks=speechChunks(text,model===geminiSpeech?1200:2000);if(!chunks.length)throw Error('There is nothing to say.');
 const pieces=[];let rate=24000;
 for(const chunk of chunks){
  const parts=await generate(key,model,{contents:[{parts:[{text:model===geminiSpeech?'Read aloud: '+chunk:chunk}]}],generationConfig:{responseModalities:['AUDIO'],speechConfig:{voiceConfig:{prebuiltVoiceConfig:{voiceName}}}}},signal);
  const audio=parts.find(p=>p.inlineData)?.inlineData;
  if(!audio?.data||!/^audio\/(?:L16|pcm)/i.test(audio.mimeType||''))throw Error('Gemini returned no playable speech.');
  rate=Number(/rate=(\d+)/i.exec(audio.mimeType)?.[1]||24000);pieces.push(pcmOf(audio.data));
 }
 const length=pieces.reduce((n,p)=>n+p.length,0),out=new Uint8Array(44+length),v=new DataView(out.buffer);
 for(const [offset,label] of [[0,'RIFF'],[8,'WAVE'],[12,'fmt '],[36,'data']])for(let i=0;i<label.length;i++)v.setUint8(offset+i,label.charCodeAt(i));
 for(const [offset,value] of [[4,length+36],[16,16],[24,rate],[28,rate*2],[40,length]])v.setUint32(offset,value,true);
 for(const [offset,value] of [[20,1],[22,1],[32,2],[34,16]])v.setUint16(offset,value,true);
 let at=44;for(const p of pieces){out.set(p,at);at+=p.length;}
 let binary='';for(let i=0;i<out.length;i+=8192)binary+=String.fromCharCode(...out.subarray(i,i+8192));
 return {model,audio:btoa(binary),chunks:chunks.length};
}

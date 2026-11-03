import {speechChunks} from './speech.mjs';
export const geminiModel='gemini-3.1-flash-lite';
export const geminiSpeech='gemini-2.5-flash-preview-tts';
async function generate(key,model,body,signal){
 const response=await fetch('https://generativelanguage.googleapis.com/v1beta/models/'+model+':generateContent',{method:'POST',redirect:'error',headers:{'Content-Type':'application/json','x-goog-api-key':key},body:JSON.stringify(body),signal:AbortSignal.any([AbortSignal.timeout(35000),signal])});
 if(!response.ok)throw Error('Gemini '+response.status+(response.status===429?' · Google quota reached. Try again later.':response.status===403||response.status===400?' · Check your Google key and model access.':' · Google could not complete this request.'));
 const data=await response.json();return data.candidates?.[0]?.content?.parts||[];
}
function textOf(parts){return parts.filter(p=>!p.thought).map(p=>p.text||'').join('').trim();}
export async function geminiReply(key,messages,cap,signal){
 const system=messages.filter(m=>m.role==='system').map(m=>m.content).join('\n');
 const contents=messages.filter(m=>m.role!=='system').map(m=>({role:m.role==='assistant'?'model':'user',parts:[{text:m.content}]}));
 const text=textOf(await generate(key,geminiModel,{systemInstruction:{parts:[{text:system}]},contents,generationConfig:{maxOutputTokens:cap,thinkingConfig:{thinkingLevel:'minimal'}}},signal));
 if(!text)throw Error('Gemini returned no reply.');return text;
}
export async function geminiHear(key,audio,signal){
 return textOf(await generate(key,geminiModel,{contents:[{parts:[{text:'Transcribe only the spoken words. Return an empty string for silence or noise.'},{inlineData:{mimeType:'audio/wav',data:audio}}]}]},signal));
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

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
export async function geminiSpeak(key,text,voice,signal){
 const voices={rex:'Charon',eve:'Kore',ara:'Aoede',sal:'Puck',leo:'Fenrir'};
 const parts=await generate(key,geminiSpeech,{contents:[{parts:[{text:'Read aloud: '+text.slice(0,300)}]}],generationConfig:{responseModalities:['AUDIO'],speechConfig:{voiceConfig:{prebuiltVoiceConfig:{voiceName:voices[voice]||'Charon'}}}}},signal);
 const audio=parts.find(p=>p.inlineData)?.inlineData;
 if(!audio?.data||!/^audio\/(?:L16|pcm)/i.test(audio.mimeType||''))throw Error('Gemini returned no playable speech.');
 const raw=atob(audio.data),rate=Number(/rate=(\d+)/i.exec(audio.mimeType)?.[1]||24000);
 const header=new ArrayBuffer(44),v=new DataView(header);
 for(const [offset,label] of [[0,'RIFF'],[8,'WAVE'],[12,'fmt '],[36,'data']])for(let i=0;i<label.length;i++)v.setUint8(offset+i,label.charCodeAt(i));
 for(const [offset,value] of [[4,raw.length+36],[16,16],[24,rate],[28,rate*2],[40,raw.length]])v.setUint32(offset,value,true);
 for(const [offset,value] of [[20,1],[22,1],[32,2],[34,16]])v.setUint16(offset,value,true);
 return {model:geminiSpeech,audio:btoa(String.fromCharCode(...new Uint8Array(header))+raw)};
}

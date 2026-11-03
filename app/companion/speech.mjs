// Standard voice: text-to-speech through OpenRouter (Grok Voice, with Voxtral as the fallback).
export const VOICES=['rex','eve','ara','sal','leo'];
export const SPEECH_MODELS=[{model:'x-ai/grok-voice-tts-1.0',voice:'rex'},{model:'mistralai/voxtral-mini-tts-2603',voice:'en_paul_neutral'}];
// One request per chunk this long at most. Longer text is split at sentence ends (then commas,
// then spaces), never mid-word, and the clips are joined, so a reply is never cut off part-way.
export const SPEECH_CHUNK=600;
export function speechChunks(text,max=SPEECH_CHUNK){
 const clean=String(text||'').replace(/\s+/g,' ').trim();if(!clean)return [];
 const sentences=clean.match(/[^.!?…]+(?:[.!?…]+["')\]]*|$)\s*/g)||[clean];
 const out=[];let current='';
 const push=piece=>{piece=piece.trim();if(piece)out.push(piece);};
 for(let s of sentences){
  while(s.length>max){   // one very long sentence: split at a comma or space near the limit
   const cut=Math.max(s.lastIndexOf(', ',max),s.lastIndexOf('; ',max));const at=cut>max/3?cut+1:Math.max(s.lastIndexOf(' ',max),1);
   if(current){push(current);current='';}push(s.slice(0,at));s=s.slice(at);
  }
  if((current+s).length>max){push(current);current='';}
  current+=s;
 }
 push(current);return out;
}
const toBase64=bytes=>{let binary='';for(let i=0;i<bytes.length;i+=8192)binary+=String.fromCharCode(...bytes.subarray(i,i+8192));return btoa(binary);};
export class Speech {
 constructor(fetcher=globalThis.fetch){this.fetcher=fetcher;this.cooldowns=new Map();}
 /** Speech for the whole text as one MP3 (chunks are joined; MP3 frames concatenate cleanly). */
 async generate(text,key,voice='rex',signal){
  const chunks=speechChunks(text);if(!chunks.length)throw Error('There is nothing to say.');
  const parts=[];let model=null;
  for(const chunk of chunks){const r=await this.one(chunk,key,voice,signal,model);model=r.model;parts.push(r.bytes);}
  const total=parts.reduce((n,p)=>n+p.length,0);if(total>12000000)throw Error('Speech returned oversized audio');
  const joined=new Uint8Array(total);let at=0;for(const p of parts){joined.set(p,at);at+=p.length;}
  return {audio:toBase64(joined),model,chunks:chunks.length};
 }
 // Later chunks stay on the model that spoke the first one, so the voice doesn't change mid-reply.
 async one(text,key,voice,signal,only=null){let lastError='Speech providers are cooling down';for(const choice of SPEECH_MODELS){if(only&&choice.model!==only)continue;if(signal?.aborted)throw new DOMException('Speech cancelled','AbortError');if(!only&&Date.now()<(this.cooldowns.get(choice.model)||0))continue;try{const r=await this.fetcher('https://openrouter.ai/api/v1/audio/speech',{method:'POST',signal:signal?AbortSignal.any([AbortSignal.timeout(25000),signal]):AbortSignal.timeout(25000),headers:{'Content-Type':'application/json',Authorization:'Bearer '+key},body:JSON.stringify({...choice,voice:choice.model.startsWith('x-ai/')?(VOICES.includes(voice)?voice:'rex'):choice.voice,input:text,response_format:'mp3'})});if(!r.ok){const e=await r.json().catch(()=>({}));lastError=('OpenRouter speech '+r.status+': '+String(e.error?.message||'Request failed')).split(key).join('[redacted]').slice(0,300);if(r.status===429||r.status>=500){const value=r.headers?.get('retry-after');const delay=Number(value)*1000||Math.max(0,(Date.parse(value)||0)-Date.now());this.cooldowns.set(choice.model,Date.now()+Math.max(60000,delay));continue;}throw Error(lastError);}
   if(!r.headers.get('content-type')?.toLowerCase().startsWith('audio/'))throw Error('Speech provider returned non-audio data');const bytes=new Uint8Array(await r.arrayBuffer());if(!bytes.length||bytes.length>4000000)throw Error('Speech returned empty or oversized audio');return {bytes,model:choice.model};
  }catch(e){lastError=String(e.message).split(key).join('[redacted]');if(['TimeoutError','TypeError'].includes(e.name)){this.cooldowns.set(choice.model,Date.now()+60000);continue;}throw Error(lastError);}}
  throw Error(lastError+'; speech fallback exhausted. Try later.');
 }
}

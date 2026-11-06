// v2.39: Standard voice turns with hearing and the voice on this PC. Drives the real background script
// with a FAKE globalThis.tylerLocalSpeech (the desktop app's hearing and Kokoro voice) and a FAKE
// globalThis.tylerLocalAI (the text AI on this PC), and a mocked fetch that records every cloud call.
// No model runs here; the real engines are tested separately (tools/local-ai/speech-smoke.cjs).
import test from 'node:test';
import assert from 'node:assert/strict';
import {LOCAL_HEARING_CHROME_ERROR,LOCAL_HEARING_ERROR} from '../browser-extension/local-ai.mjs';

const wav=(()=>{const rate=16000,frames=rate,b=Buffer.alloc(44+frames*2);b.write('RIFF',0);b.writeUInt32LE(36+frames*2,4);b.write('WAVE',8);b.write('fmt ',12);b.writeUInt32LE(16,16);b.writeUInt16LE(1,20);b.writeUInt16LE(1,22);b.writeUInt32LE(rate,24);b.writeUInt32LE(rate*2,28);b.writeUInt16LE(2,32);b.writeUInt16LE(16,34);b.write('data',36);b.writeUInt32LE(frames*2,40);for(let i=0;i<frames;i++)b.writeInt16LE(Math.round(Math.sin(2*Math.PI*220*i/rate)*8000),44+i*2);return b.toString('base64');})();
const store={};const sent=[];let listener,removedListener=null;
const area={get:async keys=>{const list=keys==null?Object.keys(store):typeof keys==='string'?[keys]:Array.isArray(keys)?keys:Object.keys(keys);return structuredClone(Object.fromEntries(list.filter(k=>k in store).map(k=>[k,store[k]])));},
 set:async values=>{Object.assign(store,structuredClone(values));},remove:async keys=>{for(const k of [].concat(keys))delete store[k];},setAccessLevel:async()=>{}};
const session={};
globalThis.chrome={action:{onClicked:{addListener(){}}},runtime:{onMessage:{addListener:fn=>{listener=fn;}},openOptionsPage(){}},
 storage:{local:area,session:{get:async k=>({[k]:session[k]}),set:async v=>Object.assign(session,v),remove:async k=>{delete session[k];}},onChanged:{addListener(){}}},
 tabs:{get:async id=>({id}),query:async()=>[],sendMessage:async(id,message)=>{sent.push(message);},onRemoved:{addListener:fn=>{removedListener=fn;}}}};
// Every cloud call is recorded. OpenRouter and Gemini answer like the real ones would.
const cloud=[];
const sse=parts=>new Response(new ReadableStream({start(c){for(const p of parts)c.enqueue(new TextEncoder().encode('data: '+JSON.stringify({choices:[{delta:{content:p}}]})+'\n\n'));c.enqueue(new TextEncoder().encode('data: [DONE]\n\n'));c.close();}}),{headers:{'content-type':'text/event-stream'}});
globalThis.fetch=async(url,options={})=>{
 const u=String(url);cloud.push(u+(/Transcribe/.test(String(options.body))?' (transcribe)':''));
 if(u.endsWith('/audio/transcriptions'))return new Response(JSON.stringify({text:'cloud heard this'}),{headers:{'content-type':'application/json'}});
 if(u.endsWith('/audio/speech'))return new Response(new Uint8Array([73,68,51,1]),{headers:{'content-type':'audio/mpeg'}});
 if(u.endsWith('/chat/completions'))return sse(['Sniper, ','obviously. ','Tanks ','can’t ','dodge ','a ','headshot.']);
 if(/generativelanguage\.googleapis\.com.*:generateContent/.test(u))return new Response(JSON.stringify({candidates:[{content:{parts:[{text:/Transcribe/.test(String(options.body))?'cloud heard this':'Sniper, obviously. Tanks can’t dodge a headshot.'}]}}],usageMetadata:{promptTokenCount:9,candidatesTokenCount:9}}),{headers:{'content-type':'application/json'}});
 throw Error('Unexpected cloud call '+u);
};
// The desktop app's text AI on this PC, faked.
const asked=[];let textParts=['Sniper, ','obviously. ','Tanks ','can’t ','dodge ','a ','headshot.'];
globalThis.tylerLocalAI={status:async()=>({ready:true,installed:true,model:'4b',label:'Qwen3.5 4B',uncensored:false,needs:null,running:true,device:'cpu'}),
 chat:async o=>{asked.push(o);let t='';for(const p of textParts){await new Promise(r=>setTimeout(r,3));if(o.signal?.aborted)throw Object.assign(Error('Stopped.'),{code:'cancelled',kind:'turn'});t+=p;o.onText?.(t);}return {text:t,usage:{prompt:100,completion:9},label:'Qwen3.5 4B',device:'cpu'};},
 release:async()=>{}};
// The desktop app's hearing and voice on this PC, faked: what Tyler asks for is recorded.
const heardAsks=[],spoken=[],released=[],prepared=[];let hearFail=null,speakFail=null,hearDelay=5,heardText='tyler who wins tank or sniper';
const fakeSpeech={
 status:async()=>({hearing:true,voice:true,running:{hearing:false,voice:false},hearingModel:'Parakeet TDT 0.6B v3',voiceModel:'Kokoro-82M v1.0'}),
 hear:async o=>{heardAsks.push(o);await new Promise((r,j)=>{const t=setTimeout(r,hearDelay);o.signal?.addEventListener('abort',()=>{clearTimeout(t);j(Object.assign(Error('Stopped.'),{code:'cancelled',kind:'turn'}));},{once:true});});if(hearFail)throw hearFail;return {text:heardText,ms:120,seconds:1,startMs:900};},
 speak:async o=>{spoken.push({text:o.text,voice:o.voice});if(speakFail)throw speakFail;return {audio:Buffer.from('RIFF-kokoro-'+o.text).toString('base64'),seconds:1.2,ms:300,firstMs:200,voice:{id:o.voice,label:o.voice==='bm_george'?'George':'Michael'}};},
 release:async reason=>{released.push(reason);},
 prepare:o=>{prepared.push(o.voice);return true;},
};
globalThis.tylerLocalSpeech=fakeSpeech;
// The desktop app's theme voices (character voices, or the owner's own replacement recordings), faked.
const themed=[];let themeFail=null;
globalThis.tylerThemeVoices={speak:async o=>{themed.push(o.text);if(themeFail)throw themeFail;return {clip:{id:'v1',theme:'cs16',voiceName:'Radio',seconds:2,custom:true},audio:Buffer.from('RIFF-theme-'+o.text).toString('base64')};}};
await import('../browser-extension/background.js');
const sender={tab:{id:7},url:'https://steamcommunity.com/chat/'};
const ask=message=>new Promise(resolve=>listener(message,sender,resolve));
await ask({type:'lease:claim'});
const reset=values=>{void ask({type:'reset'});for(const k of Object.keys(store))delete store[k];Object.assign(store,{aiProvider:'local',voiceHearing:'local',speechEngine:'kokoro',kokoroVoice:'am_michael',personality:'Chill gamer.',fastSpeech:false},values);
 cloud.length=0;asked.length=0;sent.length=0;heardAsks.length=0;spoken.length=0;released.length=0;prepared.length=0;themed.length=0;themeFail=null;hearFail=null;speakFail=null;hearDelay=5;heardText='tyler who wins tank or sniper';};
let n=0;const voiceTurn=(extra={})=>new Promise(r=>setTimeout(r,950)).then(()=>ask({type:'voice',audio:wav,format:'wav',seconds:1,automatic:true,requestId:'v'+(++n),...extra}));

test('all on this PC with no key saved: heard by Parakeet, answered locally, spoken by Kokoro; no cloud call at all; counted apart',async()=>{
 reset();
 const r=await voiceTurn();
 assert.equal(r.ok,true,r.error);assert.equal(r.heard,'tyler who wins tank or sniper');assert.equal(r.text,'Sniper, obviously. Tanks can’t dodge a headshot.');
 assert.deepEqual(cloud,[],'no OpenRouter or Gemini call for hearing, the reply or speaking');
 assert.equal(heardAsks.length,1);assert.equal(heardAsks[0].audio,wav,'the call’s recording went to the engine on this PC');assert.ok(heardAsks[0].signal instanceof AbortSignal);
 assert.equal(asked.length,1);assert.match(asked[0].messages.at(-1).content,/tyler who wins tank or sniper/);
 assert.ok(spoken.length>=1&&spoken.every(s=>s.voice==='am_michael'));assert.equal(spoken.map(s=>s.text).join(' '),r.text);
 assert.match(Buffer.from(r.audio,'base64').toString(),/^RIFF-kokoro-/);
 const u=store.usage;assert.equal(u.localTranscriptions,1);assert.equal(u.localTranscribedSeconds,1);assert.equal(u.localSpeechResponses,1);assert.equal(u.localSpeechCharacters,r.text.length);assert.equal(u.localTextResponses,1);
 for(const k of ['transcriptionResponses','transcribedSeconds','speechResponses','speechCharacters','requests','reportedCostUSD'])assert.equal(u[k],undefined,'no cloud counter: '+k);
 assert.deepEqual(prepared,['am_michael'],'Kokoro started loading when the turn began');assert.equal(themed.length,0);
});
test('the owner’s rule: a theme voice on this PC (character voices or his own recordings) counts as speaking on this PC exactly like Kokoro: with text and hearing on this PC, no key at all',async()=>{
 reset({speechEngine:'theme'});
 const r=await voiceTurn();
 assert.equal(r.ok,true,r.error);assert.equal(r.heard,'tyler who wins tank or sniper');assert.equal(r.text,'Sniper, obviously. Tanks can’t dodge a headshot.');
 assert.deepEqual(cloud,[],'no OpenRouter or Gemini call for hearing, the reply or speaking');
 assert.equal(heardAsks.length,1);assert.equal(asked.length,1);assert.equal(spoken.length,0,'Kokoro isn’t asked');assert.deepEqual(prepared,[],'nor started');
 assert.equal(themed.join(' '),r.text,'the theme voice spoke the whole reply');assert.match(Buffer.from(r.audio,'base64').toString(),/^RIFF-theme-/);
 const u=store.usage;assert.equal(u.localTranscriptions,1);assert.equal(u.themeSpeechResponses,1);assert.equal(u.themeSpeechCharacters,r.text.length);assert.equal(u.localSpeechResponses,undefined,'counted as theme speech, apart from Kokoro');
 for(const k of ['transcriptionResponses','transcribedSeconds','speechResponses','speechCharacters','requests','reportedCostUSD'])assert.equal(u[k],undefined,'no cloud counter: '+k);
 // The panel and the Voice window say no key is needed.
 const c=await ask({type:'connection'});assert.equal(c.voiceNeedsKey,false);assert.equal(c.hearing,'local');assert.equal(c.speechEngine,'theme');assert.equal(c.cloudKey,false);
 // Start speaking sooner works with it too, and the spending cap doesn't stop it (nothing is paid).
 reset({speechEngine:'theme',fastSpeech:true,streamAI:true,spendingCapUSD:1,usage:{reportedCostUSD:5}});textParts=['Sniper, obviously. ','Tanks can’t dodge ','a headshot from across the map.'];
 try{const e=await voiceTurn();assert.equal(e.ok,true,e.error);assert.equal(e.early,true);assert.equal(themed[0],'Sniper, obviously.');assert.deepEqual(cloud,[]);}
 finally{textParts=['Sniper, ','obviously. ','Tanks ','can’t ','dodge ','a ','headshot.'];}
 // A theme voice that can't speak: the reply stays text with the reason; the paid cloud voice isn't used though a key is saved.
 reset({speechEngine:'theme',openrouterKey:'sk-or-test'});themeFail=Error('The theme voice engine isn’t installed yet.');
 const f=await voiceTurn();assert.equal(f.ok,true,f.error);assert.equal(f.audio,undefined);assert.match(f.warning,/^Theme voice failed: The theme voice engine isn’t installed yet\./);assert.deepEqual(cloud,[]);
});
test('Start speaking sooner with Kokoro: the first sentence is spoken while the reply is still being written',async()=>{
 reset({fastSpeech:true,streamAI:true});textParts=['Sniper, obviously. ','Tanks can’t dodge ','a headshot from across the map.'];
 try{
  const r=await voiceTurn();assert.equal(r.ok,true,r.error);assert.equal(r.early,true);
  assert.equal(spoken[0].text,'Sniper, obviously.');assert.ok(sent.some(m=>m.source==='tyler-early-audio'),'the first clip went to the tab early');
  assert.match(Buffer.from(r.firstAudio,'base64').toString(),/Sniper, obviously\./);assert.deepEqual(cloud,[]);
 }finally{textParts=['Sniper, ','obviously. ','Tanks ','can’t ','dodge ','a ','headshot.'];}
});
test('hearing on this PC with cloud text and the cloud voice: the recording is never sent for transcription; the key is used only for the reply and the voice',async()=>{
 reset({aiProvider:'openrouter',openrouterKey:'sk-or-test',speechEngine:'cloud'});
 const r=await voiceTurn();assert.equal(r.ok,true,r.error);assert.equal(r.heard,'tyler who wins tank or sniper');
 assert.ok(!cloud.some(u=>u.includes('/audio/transcriptions')),'no OpenRouter transcription');assert.ok(cloud.some(u=>u.endsWith('/chat/completions')));assert.ok(cloud.some(u=>u.endsWith('/audio/speech')));
 assert.equal(store.usage.localTranscriptions,1);assert.equal(store.usage.transcriptionResponses,undefined);
 reset({aiProvider:'gemini',geminiKey:'AIza-test',speechEngine:'kokoro'});
 const g=await voiceTurn();assert.equal(g.ok,true,g.error);assert.ok(!cloud.some(u=>u.includes('(transcribe)')),'no Gemini transcription');assert.equal(cloud.length,1,'only the Gemini reply: '+cloud);assert.ok(spoken.length>=1,'Kokoro spoke it');
});
test('cloud hearing is unchanged: with Hearing → Cloud the saved key hears, and the engine on this PC isn’t asked',async()=>{
 reset({voiceHearing:'cloud',openrouterKey:'sk-or-test'});
 const r=await voiceTurn();assert.equal(r.ok,true,r.error);assert.equal(r.heard,'cloud heard this');assert.equal(heardAsks.length,0);assert.ok(cloud[0].endsWith('/audio/transcriptions'));
 assert.equal(store.usage.transcriptionResponses,1);assert.ok(spoken.length>=1,'Kokoro still speaks');
 reset({voiceHearing:'cloud'});const none=await voiceTurn();assert.equal(none.ok,false);assert.equal(none.error,LOCAL_HEARING_ERROR);assert.deepEqual(cloud,[]);assert.equal(heardAsks.length,0);
});
test('hearing on this PC fails: the turn fails with the reason; nothing is sent to OpenRouter or Google instead, though both keys are saved',async()=>{
 reset({openrouterKey:'sk-or-test',geminiKey:'AIza-test'});
 hearFail=Object.assign(Error('Hearing on this PC isn’t installed yet. Install it in Settings → AI & personality → AI on this PC. Tyler didn’t use a cloud service instead.'),{code:'not_installed',kind:'fatal'});
 const r=await voiceTurn();assert.equal(r.ok,false);assert.match(r.error,/isn’t installed yet/);assert.equal(r.kind,'fatal','automatic mode stops and says why');
 assert.deepEqual(cloud,[]);assert.equal(asked.length,0,'no reply was written');assert.equal(spoken.length,0);
 hearFail=Object.assign(Error('Hearing on this PC closed unexpectedly. Tyler didn’t use a cloud service instead.'),{code:'crashed',kind:'turn'});
 const t=await voiceTurn();assert.equal(t.ok,false);assert.equal(t.kind,'turn','one failed turn is skipped');assert.match(t.error,/closed unexpectedly/);assert.deepEqual(cloud,[]);
});
test('the voice on this PC fails: the reply stays text and says why; the paid cloud voice isn’t used instead',async()=>{
 reset({openrouterKey:'sk-or-test'});speakFail=Object.assign(Error('The voice on this PC (Kokoro) isn’t installed yet.'),{code:'not_installed',kind:'fatal'});
 const r=await voiceTurn();assert.equal(r.ok,true,r.error);assert.equal(r.text,'Sniper, obviously. Tanks can’t dodge a headshot.');assert.equal(r.audio,undefined);
 assert.match(r.warning,/^Voice on this PC failed: The voice on this PC \(Kokoro\) isn’t installed yet\./);assert.match(r.warning,/doesn’t switch to the paid cloud voice/);
 assert.ok(!cloud.some(u=>u.endsWith('/audio/speech')),'no Grok speech');assert.deepEqual(cloud,[]);
});
test('Chrome (no desktop app): hearing on this PC gives a clear error and calls nothing; Kokoro gives text and the reason',async()=>{
 reset({openrouterKey:'sk-or-test',aiProvider:'openrouter'});delete globalThis.tylerLocalSpeech;
 try{
  const r=await voiceTurn();assert.equal(r.ok,false);assert.equal(r.error,LOCAL_HEARING_CHROME_ERROR);assert.equal(r.kind,'fatal');assert.deepEqual(cloud,[]);
  store.voiceHearing='cloud';const s=await voiceTurn();assert.equal(s.ok,true,s.error);assert.match(s.warning,/this is Chrome/);assert.ok(!cloud.some(u=>u.endsWith('/audio/speech')));
 }finally{globalThis.tylerLocalSpeech=fakeSpeech;}
});
test('the panel’s connection line and voice picker: hearing on this PC, Kokoro’s voices, and no key needed',async()=>{
 reset();const c=await ask({type:'connection'});
 assert.equal(c.ok,true);assert.equal(c.hearing,'local');assert.equal(c.voiceNeedsKey,false);assert.equal(c.speechEngine,'kokoro');assert.equal(c.speechModel,'Kokoro voice (this PC)');
 assert.equal(c.speechVoice,'am_michael');assert.deepEqual(c.voices.map(v=>v.value),['am_michael','am_puck','am_fenrir','bm_george','af_heart','bf_emma']);
 const p=await ask({type:'preferences',values:{voice:'bm_george'}});assert.equal(p.ok,true,p.error);assert.equal(store.kokoroVoice,'bm_george');
 await new Promise(r=>setTimeout(r,950));const r=await ask({type:'command',text:'say gg',speak:true,requestId:'s1'});assert.equal(r.ok,true,r.error);assert.equal(spoken.at(-1).voice,'bm_george','the next reply uses the voice picked');
 store.speechEngine='cloud';const k=await ask({type:'connection'});assert.equal(k.voiceNeedsKey,true);assert.equal(k.cloudKey,false);
});
test('the spending cap counts paid use only: an all-local voice turn runs at the cap; with the cloud voice it stops',async()=>{
 reset({spendingCapUSD:1,usage:{reportedCostUSD:2}});
 const r=await voiceTurn();assert.equal(r.ok,true,r.error);
 store.speechEngine='cloud';store.openrouterKey='sk-or-test';const c=await voiceTurn();assert.equal(c.ok,false);assert.match(c.error,/spending cap/);assert.deepEqual(cloud,[]);
});
test('Stop while hearing on this PC ends that turn; Pause and closing the Steam window release hearing and the voice',async()=>{
 reset();hearDelay=2000;
 const pending=voiceTurn({requestId:'stopme'});for(let i=0;i<200&&!heardAsks.length;i++)await new Promise(r=>setTimeout(r,10));
 await ask({type:'abort',requestId:'stopme'});const r=await pending;assert.equal(r.ok,false);assert.equal(heardAsks[0].signal.aborted,true);assert.deepEqual(cloud,[]);
 await ask({type:'local-ai:release'});assert.deepEqual(released,['Tyler was stopped in Steam chat']);
 hearDelay=5;await voiceTurn();removedListener?.(7);await new Promise(r=>setTimeout(r,10));assert.equal(released.at(-1),'The Steam window closed');
});
test('a theme voice is unchanged, and Gemini Live isn’t touched by any of this',async()=>{
 reset({speechEngine:'theme'});const r=await voiceTurn();assert.equal(r.ok,true,r.error);assert.equal(spoken.length,0,'Kokoro isn’t asked');assert.match(Buffer.from(r.audio,'base64').toString(),/RIFF-theme/);
 assert.equal(store.usage.themeSpeechResponses,1);assert.equal(store.usage.localSpeechResponses,undefined);
});

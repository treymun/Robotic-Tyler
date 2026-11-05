// v2.36: Tyler's spoken replies in a theme voice (Settings → Voice → Standard voice → Speaking voice).
// Drives the real background script with a MOCKED streaming AI, a mocked cloud speech endpoint (which
// must never be called) and a fake globalThis.tylerThemeVoices (the desktop app's local engine). No
// model runs here; the real engine is tested separately (see CHANGES.md).
import test from 'node:test';
import assert from 'node:assert/strict';

// One second of a 220 Hz tone as 16 kHz mono 16-bit PCM, the format the voice listener sends.
const wav=(()=>{const rate=16000,frames=rate,b=Buffer.alloc(44+frames*2);b.write('RIFF',0);b.writeUInt32LE(36+frames*2,4);b.write('WAVE',8);b.write('fmt ',12);b.writeUInt32LE(16,16);b.writeUInt16LE(1,20);b.writeUInt16LE(1,22);b.writeUInt32LE(rate,24);b.writeUInt32LE(rate*2,28);b.writeUInt16LE(2,32);b.writeUInt16LE(16,34);b.write('data',36);b.writeUInt32LE(frames*2,40);for(let i=0;i<frames;i++)b.writeInt16LE(Math.round(Math.sin(2*Math.PI*220*i/rate)*8000),44+i*2);return b.toString('base64');})();
const store={openrouterKey:'sk-or-test',aiProvider:'openrouter',speechEngine:'theme'};
const sent=[],cloudSpeech=[];let listener,streamParts=[];
const area={get:async keys=>{const list=keys==null?Object.keys(store):typeof keys==='string'?[keys]:Array.isArray(keys)?keys:Object.keys(keys);return structuredClone(Object.fromEntries(list.filter(k=>k in store).map(k=>[k,store[k]])));},
 set:async values=>{Object.assign(store,structuredClone(values));},remove:async keys=>{for(const k of [].concat(keys))delete store[k];},setAccessLevel:async()=>{}};
const session={};
globalThis.chrome={
 action:{onClicked:{addListener(){}}},
 runtime:{onMessage:{addListener:fn=>{listener=fn;}},openOptionsPage(){}},
 storage:{local:area,session:{get:async k=>({[k]:session[k]}),set:async v=>Object.assign(session,v),remove:async k=>{delete session[k];}},onChanged:{addListener(){}}},
 tabs:{get:async id=>({id}),query:async()=>[],sendMessage:async(id,message)=>{sent.push(message);},onRemoved:{addListener(){}}},
};
const encoder=new TextEncoder();
globalThis.fetch=async(url,options={})=>{
 if(url.endsWith('/audio/transcriptions'))return new Response(JSON.stringify({text:'tyler what did you think of that round'}),{headers:{'content-type':'application/json'}});
 if(url.endsWith('/audio/speech')){cloudSpeech.push(JSON.parse(options.body).input);return new Response(new Uint8Array([73,68,51,1]),{headers:{'content-type':'audio/mpeg'}});}
 if(url.endsWith('/chat/completions')){
  const body=new ReadableStream({async start(controller){
   for(const part of streamParts){await new Promise(r=>setTimeout(r,15));controller.enqueue(encoder.encode('data: '+JSON.stringify({choices:[{delta:{content:part}}]})+'\n\n'));}
   controller.enqueue(encoder.encode('data: '+JSON.stringify({choices:[],usage:{prompt_tokens:10,completion_tokens:12,cost:0.0001}})+'\n\ndata: [DONE]\n\n'));controller.close();
  }});
  return new Response(body,{headers:{'content-type':'text/event-stream'}});
 }
 throw Error('Unexpected fetch '+url);
};
// The desktop app's theme voices (app/theme-voices/desktop.cjs), faked: what Tyler asks for is recorded.
const asked=[];let failWith=null,delay=0;
const fakeVoices={speak:async o=>{asked.push(o);if(delay)await new Promise((r,j)=>{const t=setTimeout(r,delay);o.signal?.addEventListener('abort',()=>{clearTimeout(t);j(Object.assign(Error('Stopped.'),{code:'cancelled'}));});});
 if(failWith)throw Error(failWith);return {clip:{id:'v'+asked.length,theme:'portal',voiceName:'GLaDOS',seconds:2},audio:Buffer.from('RIFF-'+o.text).toString('base64')};}};
globalThis.tylerThemeVoices=fakeVoices;
await import('../browser-extension/background.js');
const sender={tab:{id:7},url:'https://steamcommunity.com/chat/'};
const ask=message=>new Promise(resolve=>listener(message,sender,resolve));
await ask({type:'lease:claim'});
const voiceTurn=id=>ask({type:'voice',audio:wav,format:'wav',seconds:1,automatic:true,requestId:id});
const said=b64=>Buffer.from(b64,'base64').toString().replace(/^RIFF-/,'');
const reset=()=>{sent.length=0;cloudSpeech.length=0;asked.length=0;failWith=null;delay=0;};

test('theme voice: the first sentence and then the rest are made by the local engine, never by the cloud voice',async()=>{
 reset();streamParts=['That round was ','pure chaos, honestly. ','Next time push mid ','together and trade.'];
 const r=await voiceTurn('t-1');
 assert.equal(r.ok,true,r.error);assert.equal(r.early,true);
 assert.equal(said(r.firstAudio),'That round was pure chaos, honestly.');assert.equal(said(r.audio),'Next time push mid together and trade.');
 assert.ok(sent.some(m=>m.source==='tyler-early-audio'&&m.requestId==='t-1'),'the first sentence is pushed while the rest is written');
 assert.deepEqual(cloudSpeech,[],'no cloud speech');
 for(const o of asked){assert.equal(o.purpose,'reply');assert.equal(o.theme,null,'the theme voice settings pick the voice');assert.equal(o.from,'voice');assert.ok(o.signal instanceof AbortSignal);}
 assert.equal(store.usage.themeSpeechResponses,1);assert.equal(store.usage.speechResponses,undefined,'not counted as billed speech');
});
test('theme voice fails: the reply stays text and says why; the paid cloud voice is never used instead',async()=>{
 reset();failWith='Lightweight mode’s model isn’t installed. Install it in Settings → Theme voices.';
 streamParts=['You held that angle ','like a statue, wow. ','Peek it next time ','and call the count.'];
 const r=await voiceTurn('t-2');
 assert.equal(r.ok,true,r.error);assert.equal(r.audio,undefined);assert.equal(r.firstAudio,undefined);
 assert.equal(r.text,'You held that angle like a statue, wow. Peek it next time and call the count.');
 assert.match(r.warning,/^Theme voice failed: Lightweight mode’s model isn’t installed\..*answered in text.*doesn’t switch to the paid cloud voice/);
 assert.deepEqual(cloudSpeech,[]);assert.equal(asked.length,1,'the first sentence failed, so the whole reply isn’t tried again');
});
test('Chrome (no local engine): a theme-voice reply is text with the reason, and no cloud speech',async()=>{
 reset();delete globalThis.tylerThemeVoices;streamParts=['Absolutely cooked ','that round.'];
 try{const r=await voiceTurn('t-3');
  assert.equal(r.ok,true,r.error);assert.equal(r.audio,undefined);assert.match(r.warning,/desktop app, and this is Chrome/);assert.deepEqual(cloudSpeech,[]);}
 finally{globalThis.tylerThemeVoices=fakeVoices;}
});
test('a long reply is spoken as a few clips of whole sentences (one clip plays at most 30 s)',async()=>{
 reset();store.length='detailed';
 const long=['Okay so first, ','you rotated way too early. ','The bomb was already planted on B and nobody had the angles covered from the back site, which is the whole problem. ','Second, the economy call was rough because half the team forced buys after losing pistol, and that left you broke for three rounds in a row. ','Third, trade your teammate.'];
 streamParts=long;
 try{const r=await voiceTurn('t-4');
  assert.equal(r.ok,true,r.error);assert.equal(r.early,true);
  const clips=[r.firstAudio,r.audio,...(r.moreAudio||[])].map(said);
  assert.equal(clips.join(' '),r.text,'every word is spoken, in order');
  assert.ok(clips.length>=3,'split into '+clips.length);for(const c of clips)assert.ok(c.length<=240,c.length+' characters');
  assert.deepEqual(cloudSpeech,[]);}
 finally{delete store.length;}
});
test('cloud voice (the default) is unchanged: the theme engine isn’t asked',async()=>{
 reset();store.speechEngine='cloud';streamParts=['Clean ace, ','no notes.'];
 try{const r=await voiceTurn('t-5');
  assert.equal(r.ok,true,r.error);assert.equal(typeof r.audio,'string');assert.deepEqual(cloudSpeech,['Clean ace, no notes.']);assert.equal(asked.length,0);}
 finally{store.speechEngine='theme';}
});
test('Stop: the theme voice being made is called off with the reply',async()=>{
 reset();delay=5000;streamParts=['Smoke the window ','before you cross.'];
 const pending=voiceTurn('t-6');
 for(let i=0;i<100&&!asked.length;i++)await new Promise(r=>setTimeout(r,20));
 assert.equal(asked.length,1,'the theme voice was asked');
 await ask({type:'abort',requestId:'t-6'});
 const r=await pending;assert.equal(asked[0].signal.aborted,true,'its signal was aborted');
 assert.notEqual(typeof r.audio,'string');assert.deepEqual(cloudSpeech,[]);
});

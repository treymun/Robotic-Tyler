// Drives the real background script through a spoken turn with a mocked
// streaming AI and speech provider, and checks "Start speaking sooner".
import test from 'node:test';
import assert from 'node:assert/strict';

// One second of a 220 Hz tone as 16 kHz mono 16-bit PCM, the format the voice listener sends.
const wav=(()=>{const rate=16000,frames=rate,b=Buffer.alloc(44+frames*2);b.write('RIFF',0);b.writeUInt32LE(36+frames*2,4);b.write('WAVE',8);b.write('fmt ',12);b.writeUInt32LE(16,16);b.writeUInt16LE(1,20);b.writeUInt16LE(1,22);b.writeUInt32LE(rate,24);b.writeUInt32LE(rate*2,28);b.writeUInt16LE(2,32);b.writeUInt16LE(16,34);b.write('data',36);b.writeUInt32LE(frames*2,40);for(let i=0;i<frames;i++)b.writeInt16LE(Math.round(Math.sin(2*Math.PI*220*i/rate)*8000),44+i*2);return b.toString('base64');})();
const store={openrouterKey:'sk-or-test',aiProvider:'openrouter'};
const sent=[],speechInputs=[];let listener,streamParts=[],nextStreams=[];
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
 if(url.endsWith('/audio/speech')){const input=JSON.parse(options.body).input;speechInputs.push(input);return new Response(new Uint8Array([73,68,51,input.length%250]),{headers:{'content-type':'audio/mpeg'}});}
 if(url.endsWith('/chat/completions')){
  const parts=nextStreams.length?nextStreams.shift():streamParts;
  const body=new ReadableStream({async start(controller){
   for(const part of parts){await new Promise(r=>setTimeout(r,15));controller.enqueue(encoder.encode('data: '+JSON.stringify({choices:[{delta:{content:part}}]})+'\n\n'));}
   controller.enqueue(encoder.encode('data: '+JSON.stringify({choices:[],usage:{prompt_tokens:10,completion_tokens:12,cost:0.0001}})+'\n\ndata: [DONE]\n\n'));controller.close();
  }});
  return new Response(body,{headers:{'content-type':'text/event-stream'}});
 }
 throw Error('Unexpected fetch '+url);
};
await import('../browser-extension/background.js');
const sender={tab:{id:7},url:'https://steamcommunity.com/chat/'};
const ask=message=>new Promise(resolve=>listener(message,sender,resolve));
await ask({type:'lease:claim'});
const voiceTurn=id=>ask({type:'voice',audio:wav,format:'wav',seconds:1,automatic:true,requestId:id});

test('the first sentence is spoken while the rest of the reply is still streaming',async()=>{
 streamParts=['That round was ','pure chaos, honestly. ','Next time push mid ','together and trade.'];
 sent.length=0;speechInputs.length=0;
 const r=await voiceTurn('turn-1');
 assert.equal(r.ok,true,r.error);
 const early=sent.find(m=>m.source==='tyler-early-audio');
 assert.ok(early,'early audio pushed to the tab');assert.equal(early.requestId,'turn-1');
 assert.equal(r.early,true);assert.equal(typeof r.firstAudio,'string');assert.equal(typeof r.audio,'string');
 assert.equal(r.text,'That round was pure chaos, honestly. Next time push mid together and trade.');
 assert.deepEqual(speechInputs,['That round was pure chaos, honestly.','Next time push mid together and trade.']);
 assert.equal(sent.some(m=>m.source==='tyler-early-cancel'),false);
 assert.ok(Number.isFinite(r.timings.firstSentenceMs));
});

test('a one-sentence reply is spoken normally',async()=>{
 streamParts=['Absolutely cooked ','that round.'];sent.length=0;speechInputs.length=0;
 const r=await voiceTurn('turn-2');
 assert.equal(r.ok,true,r.error);assert.equal(r.early,undefined);assert.equal(typeof r.audio,'string');
 assert.equal(sent.some(m=>m.source==='tyler-early-audio'),false);
 assert.deepEqual(speechInputs,['Absolutely cooked that round.']);
});

test('turning the setting off restores single-clip speech',async()=>{
 store.fastSpeech=false;streamParts=['Clean trade by Sam there. ','Rotate after the next fight.'];sent.length=0;speechInputs.length=0;
 const r=await voiceTurn('turn-3');
 assert.equal(r.ok,true,r.error);assert.equal(r.early,undefined);
 assert.equal(sent.some(m=>m.source==='tyler-early-audio'),false);
 assert.deepEqual(speechInputs,['Clean trade by Sam there. Rotate after the next fight.']);
 delete store.fastSpeech;
});

test('if the opening changes after post-processing, the early clip is cancelled',async()=>{
 // The same reply as turn 1 is now in history, so the repeat filter forces a fresh reply.
 nextStreams=[['That round was ','pure chaos, honestly. ','Next time push mid ','together and trade.'],['Fresh take: ','that clutch was all luck. ','Run it back.']];sent.length=0;speechInputs.length=0;
 const r=await voiceTurn('turn-4');
 assert.equal(r.ok,true,r.error);
 assert.equal(r.early,undefined,'full reply spoken as one clip');
 assert.equal(typeof r.audio,'string');
 assert.ok(sent.some(m=>m.source==='tyler-early-audio'&&m.requestId==='turn-4'),'early clip was started');
 assert.ok(sent.some(m=>m.source==='tyler-early-cancel'&&m.requestId==='turn-4'),'early clip cancelled');
 assert.equal(r.text,'Fresh take: that clutch was all luck. Run it back.');
 assert.equal(speechInputs.at(-1),'Fresh take: that clutch was all luck. Run it back.');
});

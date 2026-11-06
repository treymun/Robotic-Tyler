// v2.44: who said each voice line (browser-extension/voice-speakers.js, voice-listener.js, background.js).
// MOCKED: every Steam object (fake voice members, a fake VoiceChat store, a fake voice-list DOM), the per-track
// levels (numbers fed to the same accumulator voice-listener.js feeds), the listener's Web Audio and WebRTC
// (stand-ins in a vm), and the AI and speech providers (a mocked fetch that records every request). Real: the
// attribution, Steam reader, prompt formatting and the real background script. Not tested here: a real Steam
// call (what Steam's own talking data really looks like), real per-person WebRTC tracks (tests/e2e covers
// those in Chromium), Windows audio, Gemini Live.
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import '../browser-extension/voice-speakers.js';
const V=globalThis.TylerVoiceSpeakers;
const read=f=>readFileSync(new URL('../browser-extension/'+f,import.meta.url),'utf8');
const SAM='76561197960265738',ALEX='76561197960265739',PAT='76561197960265740'; // accountids 10, 11, 12

// ── Helpers: a capture the way voice-listener.js fills one (50 ms ticks, Steam looked at every other tick) ──
/** talk: per tick, the track keys with speech; steam: per tick, a function that sets Steam's flags (or null). */
function capture({ticks,levels,reader=null,src=null,setSteam=null}){
 const c=new V.Capture(),meters=new Map();
 for(let i=0;i<ticks;i++){
  setSteam?.(i);
  const lv=levels(i).map(([key,rms])=>{let m=meters.get(key);if(!m)meters.set(key,m=new V.TrackMeter());return {key,...m.level(rms)};});
  const voiced=c.tick(lv);if(reader&&i%2===0)c.sample(reader.sample(src()),voiced);
 }
 return c;
}
const speech=(key,from,to,level=.08)=>i=>i>=from&&i<to?[[key,level]]:[];
const mix=(...parts)=>i=>{const all=new Map();for(const p of parts)for(const [k,r] of p(i))all.set(k,Math.max(all.get(k)||0,r));for(const k of ['t1','t2','t3'])if(!all.has(k))all.set(k,.0005);return [...all];};

// ── A fake Steam: two (or three) people in voice and the bot, with several talking-like signals ──
function fakeSteam({members=[[10,'Sam'],[11,'Alex']],field=true,method=true,dom=false}={}){
 const talking=new Set();
 const people=members.map(([accountid,name])=>({accountid,primary_display_name:name,...(field?{is_speaking:false}:{}),m_bSpeakerMuted:false}));
 const sync=()=>{for(const p of people)if(field)p.is_speaking=talking.has(p.accountid);for(const row of rows)row.avatar.cls='avatar'+(talking.has(row.id)?' VoiceChatMember_Speaking_x1':'');};
 const VoiceChat={m_VoiceCallState:{m_eState:10},m_bLocalSpeaking:true,m_setTalkingUsers:new Set(members.map(m=>m[0])),
  ...(method?{IsAccountSpeaking(id){return talking.has(id);}}:{}),GetSpeakerVolume(){return .8;}};
 // The voice list on screen: one row per person, with Steam's mini-profile id, and a talking class on the avatar.
 class El{constructor(cls='',attrs={},text=''){this.cls=cls;this.attrs=attrs;this.children=[];this.parentElement=null;this.text=text;this.isConnected=true;}
  getAttribute(k){return k==='class'?this.cls:(this.attrs[k]??null);}append(...c){for(const x of c){x.parentElement=this;this.children.push(x);}return this;}
  querySelectorAll(){const out=[],walk=e=>{for(const c of e.children){out.push(c);walk(c);}};walk(this);return out;}
  get textContent(){return this.text+this.children.map(c=>c.textContent).join('');}}
 const list=new El('chatRoomVoiceChannel ActiveVoiceChannel'),rows=[];
 if(dom)for(const [accountid,name] of [[2,'ROBOTIC TYLER'],...members]){const avatar=new El('avatar'),row=new El('voiceChatMember',{'data-miniprofile':String(accountid)}).append(avatar,new El('name',{},name));list.append(row);rows.push({id:accountid,avatar});}
 const room={GetRoomID:()=>'901',voice_active_member_list:{member_list:[{accountid:2,primary_display_name:'ROBOTIC TYLER'},...people]}};
 const src=()=>({roomId:'901',self:2,members:room.voice_active_member_list.member_list.map(f=>({accountid:f.accountid,name:f.primary_display_name,obj:f})),
  holders:[['member list',room.voice_active_member_list],['room',room],['VoiceChat',VoiceChat],['call state',VoiceChat.m_VoiceCallState]],dom:()=>dom?[list]:[]});
 return {talking,sync,src,people,VoiceChat,list,room};
}
const talkTurn=(steam,reader,{who,key,ticks=40,from=4,to=30,extra=null})=>capture({ticks,reader,src:steam.src,levels:mix(speech(key,from,to),...(extra?[extra]:[])),setSteam:i=>{steam.talking.clear();if(who&&i>=from+2&&i<to+3)steam.talking.add(who);steam.sync();}});

test('tracks alone: the dominant track speaks, two clear tracks overlap, silence says nothing',()=>{
 const call=new V.CallSpeakers();
 // Sam's track talks; Alex's has only a faint echo of him.
 let r=V.attribute({capture:capture({ticks:40,levels:mix(speech('t1',2,30),speech('t2',2,30,.004))}),call});
 assert.deepEqual(r,{speaker:{id:'voice:speaker-1',name:'Speaker 1'},source:'track',overlap:[],how:'label'});
 // Both talk over each other.
 r=V.attribute({capture:capture({ticks:40,levels:mix(speech('t1',2,30),speech('t2',6,34,.07))}),call});
 assert.equal(r.source,'track');assert.deepEqual(r.overlap,['Speaker 1','Speaker 2']);
 // One says two words while the other talks on: not overlap.
 r=V.attribute({capture:capture({ticks:40,levels:mix(speech('t2',2,32),speech('t1',10,13))}),call});
 assert.deepEqual([r.speaker.name,r.overlap],['Speaker 2',[]]);
 // Nothing on any track (and no Steam data): unknown, never a guess.
 r=V.attribute({capture:capture({ticks:30,levels:mix()}),call});
 assert.deepEqual(r,{speaker:null,source:'unknown',overlap:[],how:'none'});
 // A fan in one mic: a steady level on that track isn't speech once its background is learned.
 const fan=new V.TrackMeter();let voiced=0;for(let i=0;i<4000;i++)if(fan.level(.02).voiced)voiced++;assert.ok(voiced<4000*.6,'a constant level stops counting as speech ('+voiced+')');
});

test('Speaker N labels stay the same for the call, and a new voice room starts again',()=>{
 const call=new V.CallSpeakers(),names=[];
 for(const key of ['t2','t1','t2','t3','t1']){call.sync('901');names.push(V.attribute({capture:capture({ticks:30,levels:mix(speech(key,2,25))}),call,steam:{roomId:'901',members:[],useful:[]}}).speaker.name);}
 assert.deepEqual(names,['Speaker 1','Speaker 2','Speaker 1','Speaker 3','Speaker 2']);
 const r=V.attribute({capture:capture({ticks:30,levels:mix(speech('t3',2,25))}),call,steam:{roomId:'902',members:[],useful:[]}});
 assert.equal(r.speaker.name,'Speaker 1','another call: numbering starts again');
});

test('exactly one other person in voice: every utterance is theirs (certain)',()=>{
 const steam=fakeSteam({members:[[10,'Sam']],field:false,method:false}),reader=new V.SteamReader(),call=new V.CallSpeakers();
 const c=capture({ticks:30,reader,src:steam.src,levels:mix(speech('t1',2,25))});
 assert.deepEqual(V.attribute({capture:c,call,steam:c.steam}),{speaker:{id:SAM,name:'Sam'},source:'solo',overlap:[],how:'solo'});
 // Even with nothing measured on the tracks.
 const quiet=capture({ticks:10,reader,src:steam.src,levels:mix()});
 assert.equal(V.attribute({capture:quiet,call,steam:quiet.steam}).source,'solo');
 // The bot itself is never anyone's speaker, and with the bot's own id unknown there's no "solo".
 assert.equal(reader.sample({...steam.src(),self:null}).solo,null);
});

test('Steam\'s talking flags on the voice members and a VoiceChat method name the speaker; constant signals are ignored',()=>{
 const steam=fakeSteam(),reader=new V.SteamReader(),call=new V.CallSpeakers();
 let c=talkTurn(steam,reader,{who:10,key:'t1'});
 let r=V.attribute({capture:c,call,steam:c.steam});
 assert.deepEqual([r.speaker,r.source,r.overlap],[{id:SAM,name:'Sam'},'steam',[]]);
 c=talkTurn(steam,reader,{who:11,key:'t2'});r=V.attribute({capture:c,call,steam:c.steam});
 assert.deepEqual([r.speaker,r.source],[{id:ALEX,name:'Alex'},'steam']);
 const report=reader.report(steam.src()),used=report.signals.filter(s=>s.switched).map(s=>s.key).sort();
 assert.deepEqual(used,['VoiceChat.IsAccountSpeaking()','member.is_speaking']);
 // The set that always holds everyone never switched; mute, volume and the bot's own flag aren't used.
 assert.equal(report.signals.find(s=>s.key==='VoiceChat.m_setTalkingUsers').switched,false);
 for(const k of report.signals.map(s=>s.key))assert.doesNotMatch(k,/Muted|Volume|m_bLocalSpeaking/);
 assert.ok(report.other.some(x=>/m_bLocalSpeaking \(boolean = true\)/.test(x)),'a scalar talking-like field is listed for the diagnostics');
 const text=V.summary(report);assert.match(text,/member\.is_speaking \(boolean/);assert.match(text,/member fields: .*is_speaking/);assert.doesNotMatch(text,/Sam|Alex/,'no names of people in the diagnostics');
 // Both lit at once: overlap, from Steam.
 c=capture({ticks:30,reader,src:steam.src,levels:mix(speech('t1',2,25),speech('t2',2,25)),setSteam:i=>{steam.talking.clear();if(i>3&&i<26){steam.talking.add(10);steam.talking.add(11);}steam.sync();}});
 r=V.attribute({capture:c,call,steam:c.steam});assert.equal(r.source,'steam');assert.deepEqual(r.overlap.sort(),['Alex','Sam']);
});

test('Steam\'s talking class in the voice list (fake DOM), matched to members by Steam\'s mini-profile id',()=>{
 const steam=fakeSteam({field:false,method:false,dom:true}),reader=new V.SteamReader(),call=new V.CallSpeakers();
 let c=talkTurn(steam,reader,{who:11,key:'t2'});let r=V.attribute({capture:c,call,steam:c.steam});
 assert.deepEqual([r.speaker?.name,r.source],['Alex','steam']);
 c=talkTurn(steam,reader,{who:10,key:'t1'});r=V.attribute({capture:c,call,steam:c.steam});
 assert.deepEqual([r.speaker?.name,r.source],['Sam','steam']);
 const cls=reader.report(steam.src()).classes.find(x=>x.token==='VoiceChatMember_Speaking_x1');
 assert.ok(cls&&cls.matched>0&&cls.unmatched===0,JSON.stringify(cls));
 // A row with no id: the unique name on it identifies the member.
 for(const row of steam.list.children)delete row.attrs['data-miniprofile'];
 c=talkTurn(steam,reader,{who:11,key:'t2'});r=V.attribute({capture:c,call,steam:c.steam});assert.deepEqual([r.speaker?.name,r.source],['Alex','steam']);
});

test('Steam\'s store throwing or changing shape never throws out of the reader',()=>{
 const steam=fakeSteam(),reader=new V.SteamReader();
 Object.defineProperty(steam.people[0],'is_speaking',{get(){throw Error('mobx says no');}});
 steam.VoiceChat.IsAccountSpeaking=()=>{throw Error('gone');};
 const hostile=new Proxy({},{ownKeys(){throw Error('no keys');},get(){throw Error('no');}});
 const src=()=>({...steam.src(),holders:[['VoiceChat',hostile],['room',null]]});
 assert.doesNotThrow(()=>reader.sample(src()));assert.doesNotThrow(()=>V.summary(reader.report(src())));
 assert.equal(reader.sample(null),null);assert.equal(reader.sample({members:'nope'}).members.length,0);
});

test('track → person: learned from Steam\'s flags during the call, then used when Steam says nothing',()=>{
 const steam=fakeSteam({members:[[10,'Sam'],[11,'Alex'],[12,'Pat']]}),reader=new V.SteamReader(),call=new V.CallSpeakers();
 for(const [who,key] of [[10,'t1'],[11,'t2'],[10,'t1']]){const c=talkTurn(steam,reader,{who,key});assert.equal(V.attribute({capture:c,call,steam:c.steam}).source,'steam');}
 assert.equal(call.person('t1'),SAM);assert.equal(call.person('t2'),ALEX);assert.equal(call.person('t3'),null);
 // Steam's flags stop (they lag, or the voice list is closed): the tracks still name Sam and Alex.
 let c=talkTurn(steam,reader,{who:null,key:'t2'});let r=V.attribute({capture:c,call,steam:c.steam});
 assert.deepEqual([r.speaker,r.source,r.how],[{id:ALEX,name:'Alex'},'track','learned']);
 c=talkTurn(steam,reader,{who:null,key:'t1',extra:speech('t2',6,30,.07)});r=V.attribute({capture:c,call,steam:c.steam});
 assert.deepEqual([r.speaker.name,r.overlap],['Sam',['Sam','Alex']]);
 // Pat never talked with Steam's flags on: kept apart, not named.
 c=talkTurn(steam,reader,{who:null,key:'t3'});r=V.attribute({capture:c,call,steam:c.steam});
 assert.deepEqual([r.speaker.name,r.source,r.how],['Speaker 1','track','label']);
 // A person who left isn't named from an old track.
 const gone=talkTurn(steam,reader,{who:null,key:'t2'});gone.steam={...gone.steam,members:gone.steam.members.filter(m=>m.id!==ALEX)};
 assert.match(V.attribute({capture:gone,call,steam:gone.steam}).speaker.name,/^Speaker \d$/);
});

test('ids Steam gives a track: its SSRC in Steam\'s store, or a Steam id in its description',()=>{
 const steam=fakeSteam({field:false,method:false}),reader=new V.SteamReader(),call=new V.CallSpeakers();
 steam.VoiceChat.m_mapAccountToSSRC=new Map([[11,'3344556677']]);
 let c=capture({ticks:30,reader,src:steam.src,levels:mix(speech('t2',2,25))});
 let r=V.attribute({capture:c,call,steam:c.steam,tracks:new Map([['t2',{ssrc:['3344556677'],tokens:['Peer-3344556677']}]])});
 assert.deepEqual([r.speaker,r.source,r.how],[{id:ALEX,name:'Alex'},'track','ssrc']);
 c=capture({ticks:30,reader,src:steam.src,levels:mix(speech('t1',2,25))});
 r=V.attribute({capture:c,call,steam:c.steam,tracks:new Map([['t1',{ssrc:['1'],tokens:['user-'+SAM]}]])});
 assert.deepEqual([r.speaker.name,r.how],['Sam','sdp']);
 // "Peer-<ssrc>" (what Steam's descriptions carry) names nobody.
 c=capture({ticks:30,reader,src:steam.src,levels:mix(speech('t3',2,25))});
 r=V.attribute({capture:c,call,steam:c.steam,tracks:new Map([['t3',{ssrc:['10'],tokens:['Peer-10','10']}]])});
 assert.equal(r.how,'label','an SSRC that happens to equal an account number isn\'t an id');
});

test('heard line formats, the panel label, and what the background accepts',()=>{
 const sam={speaker:{id:SAM,name:'Sam'},source:'steam',overlap:[]};
 assert.equal(V.line(sam,'who has the bomb'),'Sam (in voice): who has the bomb');
 assert.equal(V.line({...sam,source:'solo'},'gg'),'Sam (in voice): gg');
 assert.equal(V.line({speaker:{id:'voice:speaker-2',name:'whatever'},source:'track',overlap:[]},'rotate B'),'Speaker 2 (in voice, name unknown): rotate B');
 assert.equal(V.line({...sam,overlap:['Sam','Alex']},'no wait'),'Sam and Alex talking at once: no wait');
 assert.equal(V.line({...sam,overlap:['Sam','Alex','Speaker 3']},'x'),'Sam, Alex and Speaker 3 talking at once: x');
 assert.equal(V.line({speaker:null,source:'unknown',overlap:[]},'hello'),'Unknown speaker (in voice): hello');
 assert.equal(V.label(sam),'Sam');assert.equal(V.label({speaker:null,source:'unknown'}),'(speaker unknown)');
 // Never trusted: a Speaker label claiming to be from Steam, a Steam source without a Steam id, junk.
 assert.deepEqual(V.clean({speaker:{id:'voice:speaker-1',name:'Speaker 1'},source:'steam'}),{speaker:null,source:'unknown',overlap:[]});
 assert.deepEqual(V.clean({speaker:{id:'display:sam',name:'Sam'},source:'solo'}),{speaker:null,source:'unknown',overlap:[]});
 assert.equal(V.clean({source:'everyone'}),null);assert.equal(V.clean('Sam'),null);assert.equal(V.clean(null),null);
 assert.equal(V.line(null,'raw'),'raw');
 assert.equal(V.clean({speaker:{id:SAM,name:'Sa‮m\n'},source:'steam'}).speaker.name,'Sa m');
 // Memory author: one person known by Steam id only.
 assert.deepEqual(V.prompt(sam).author,{id:SAM,name:'Sam'});
 assert.equal(V.prompt({...sam,overlap:['Sam','Alex']}).author,null);
 assert.equal(V.prompt({speaker:{id:'voice:speaker-1',name:'Speaker 1'},source:'track'}).author,null);
 assert.equal(V.prompt({speaker:null,source:'unknown'}).author,null);
 assert.match(V.RULE,/never say that someone else said those words/i);
});

// ── The listener (voice-listener.js in a vm, with stand-ins for Web Audio and WebRTC) ──
test('listener: off means no per-track meters and no Steam reads; on adds one meter per track and looks at Steam while recording',async()=>{
 let handler,tick,now=10000,steamCalls=0;const analysers=[],disconnected=[];
 const node=()=>({frequency:{value:0},connect(){},disconnect(x){disconnected.push(x);}});
 class Audio{constructor(){this.state='running';}createMediaStreamDestination(){return {...node(),stream:{}};}createAnalyser(){const a={...node(),fftSize:0,getFloatTimeDomainData(out){out.fill(.2);}};analysers.push(a);return a;}createBiquadFilter(){return node();}createMediaStreamSource(){return node();}async resume(){}}
 class Recorder{static isTypeSupported(){return true;}constructor(){this.state='inactive';}start(){this.state='recording';}stop(){this.state='inactive';this.onstop?.();}}
 const tracks=[{kind:'audio',readyState:'live',id:'a'},{kind:'audio',readyState:'live',id:'b'}];
 class Peer{addEventListener(){}getReceivers(){return tracks.map(track=>({track}));}}
 const posts=[];
 const box={TylerNeural:{ready:async()=>({ok:true})},AudioContext:Audio,MediaRecorder:Recorder,MediaStream:class{},Blob:class{constructor(){this.size=0;}},Float32Array,Date:{now:()=>now},location:{origin:'https://steamcommunity.com'},
  setInterval:(fn,ms)=>{if(ms===50)tick=fn;},clearInterval(){},TylerSteamChatAdapter:{voiceTalking(){steamCalls++;return null;}},
  window:{RTCPeerConnection:Peer,postMessage(m){posts.push(m);},addEventListener:(_n,fn)=>{handler=fn;}}};
 vm.runInNewContext(read('noise-filter.js'),box);vm.runInNewContext(read('voice-speakers.js'),box);vm.runInNewContext(read('voice-listener.js'),box);
 new box.window.RTCPeerConnection();
 const control=async(type,extra={})=>handler({source:box.window,origin:box.location.origin,data:{source:'tyler-listener-control',type,voiceThreshold:.01,keyboardFilter:false,...extra}});
 const run=n=>{for(let i=0;i<n;i++){now+=50;tick();}};
 await control('on');run(20);
 assert.equal(analysers.length,1,'off: only the mix\'s own analyser, as before');assert.equal(steamCalls,0,'off: Steam isn\'t looked at');
 await control('off');await control('on',{voiceSpeakers:true});run(20);
 assert.equal(analysers.length,3,'on: one meter per incoming track');assert.ok(steamCalls>=5,'on: Steam looked at while recording ('+steamCalls+')');
 const report=posts.length;await control('speakers-report');const rep=posts.slice(report).find(p=>p.type==='speakers-report');
 assert.equal(rep.on,true);assert.equal(rep.meters,2);
 await control('configure');const before=steamCalls;await control('off');await control('on');run(20);
 assert.ok(disconnected.filter(x=>analysers.slice(1).includes(x)).length===2,'turning it off disconnects the meters');
 assert.equal(analysers.length,3,'and makes no new ones');assert.equal(steamCalls,before);
});

// ── The real background: what the AI and memory get (mocked providers record every request) ──
const wav=(()=>{const rate=16000,frames=rate,b=Buffer.alloc(44+frames*2);b.write('RIFF',0);b.writeUInt32LE(36+frames*2,4);b.write('WAVE',8);b.write('fmt ',12);b.writeUInt32LE(16,16);b.writeUInt16LE(1,20);b.writeUInt16LE(1,22);b.writeUInt32LE(rate,24);b.writeUInt32LE(rate*2,28);b.writeUInt16LE(2,32);b.writeUInt16LE(16,34);b.write('data',36);b.writeUInt32LE(frames*2,40);for(let i=0;i<frames;i++)b.writeInt16LE(Math.round(Math.sin(2*Math.PI*220*i/rate)*8000),44+i*2);return b.toString('base64');})();
const store={},requests=[];let listener,heardNext='tyler who planted',replyNext='Sam did, obviously.',failChat=0;
const area={get:async keys=>{const list=keys==null?Object.keys(store):typeof keys==='string'?[keys]:Array.isArray(keys)?keys:Object.keys(keys);return structuredClone(Object.fromEntries(list.filter(k=>k in store).map(k=>[k,store[k]])));},
 set:async values=>{Object.assign(store,structuredClone(values));},remove:async keys=>{for(const k of [].concat(keys))delete store[k];},setAccessLevel:async()=>{}};
const session={};
globalThis.chrome={action:{onClicked:{addListener(){}}},runtime:{onMessage:{addListener:fn=>{listener=fn;}},openOptionsPage(){}},
 storage:{local:area,session:{get:async k=>({[k]:session[k]}),set:async v=>Object.assign(session,v),remove:async k=>{delete session[k];}},onChanged:{addListener(){}}},
 tabs:{get:async id=>({id}),query:async()=>[],sendMessage:async()=>{},onRemoved:{addListener(){}}}};
globalThis.fetch=async(url,options={})=>{
 const u=String(url);requests.push({url:u,body:options.body});
 if(u.endsWith('/audio/transcriptions'))return new Response(JSON.stringify({text:heardNext}),{headers:{'content-type':'application/json'}});
 if(u.endsWith('/audio/speech'))return new Response(new Uint8Array([73,68,51,1]),{headers:{'content-type':'audio/mpeg'}});
 if(u.endsWith('/chat/completions')){if(failChat>0){failChat--;return new Response(JSON.stringify({error:{message:'overloaded'}}),{status:503,headers:{'content-type':'application/json'}});}
  return new Response(JSON.stringify({choices:[{message:{content:replyNext}}],usage:{prompt_tokens:5,completion_tokens:5}}),{headers:{'content-type':'application/json'}});}
 throw Error('Unexpected request '+u);
};
await import('../browser-extension/background.js');
let tabSeq=100;
async function turn(extra={},{settings={},tab=++tabSeq}={}){
 for(const k of Object.keys(store))if(k!=='friendConversationMemory')delete store[k];
 Object.assign(store,{openrouterKey:'sk-or-test',aiProvider:'openrouter',friendMemory:true,streamAI:false,fastSpeech:false,personality:'Chill gamer.'},settings);
 const sender={tab:{id:tab},url:'https://steamcommunity.com/chat/'},ask=m=>new Promise(resolve=>listener(m,sender,resolve));
 await ask({type:'lease:claim',takeOver:true});requests.length=0;
 const r=await ask({type:'voice',audio:wav,format:'wav',seconds:1,automatic:true,requestId:'v'+tab,...extra});
 const chat=requests.find(q=>q.url.endsWith('/chat/completions')),body=chat?JSON.parse(chat.body):null;
 return {r,ask,requests:requests.map(q=>({...q})),body,system:body?.messages[0].content,user:body?.messages.at(-1).content};
}
const friendLines=id=>(store.friendConversationMemory?.[id]?.messages||[]).map(m=>m.content);

test('background: a known speaker reaches the prompt, the speaker rules and that friend\'s memory',async()=>{
 heardNext='tyler who planted';replyNext='Sam did, obviously.';
 const t=await turn({voiceSpeaker:{speaker:{id:SAM,name:'Sam'},source:'steam',overlap:[]}});
 assert.equal(t.r.ok,true,t.r.error);assert.equal(t.r.heard,'tyler who planted','the panel still gets what was heard');
 assert.match(t.user,/^<chat from="Sam">Sam \(in voice\): tyler who planted<\/chat>/);
 assert.ok(t.system.includes(V.RULE));assert.match(t.system,/The current message author is "Sam" \(Steam account 76561197960265738\)/);
 assert.deepEqual(friendLines(SAM),['Sam (in voice): tyler who planted','Sam did, obviously.']);
 // The transcription request is the same recording, nothing added.
 const stt=JSON.parse(t.requests.find(q=>q.url.endsWith('/audio/transcriptions')).body);assert.equal(stt.input_audio.data,wav);assert.deepEqual(Object.keys(stt).sort(),['input_audio','language','model','response_format']);
});

test('background: Speaker N, overlap and unknown are labelled but never reach per-friend memory',async()=>{
 const before=JSON.stringify(store.friendConversationMemory||{});
 heardNext='rotate b now';replyNext='On it, rotating.';
 let t=await turn({voiceSpeaker:{speaker:{id:'voice:speaker-2',name:'Speaker 2'},source:'track',overlap:[]}});
 assert.match(t.user,/^<chat>Speaker 2 \(in voice, name unknown\): rotate b now<\/chat>/);assert.match(t.system,/current speaker identity is UNKNOWN/);
 heardNext='no wait stop';replyNext='Okay, okay, one at a time.';
 t=await turn({voiceSpeaker:{speaker:{id:SAM,name:'Sam'},source:'steam',overlap:['Sam','Alex']}});
 assert.match(t.user,/^<chat>Sam and Alex talking at once: no wait stop<\/chat>/);assert.match(t.system,/UNKNOWN/);
 heardNext='anyone there';replyNext='Always here.';
 t=await turn({voiceSpeaker:{speaker:null,source:'unknown',overlap:[]}});
 assert.match(t.user,/^<chat>Unknown speaker \(in voice\): anyone there<\/chat>/);assert.ok(t.system.includes(V.RULE));
 assert.equal(JSON.stringify(store.friendConversationMemory||{}),before,'no friend memory for Speaker N, overlap or unknown');
});

test('background: a voice turn retried after a provider hiccup keeps its speaker, labelled once',async()=>{
 heardNext='what round is it';replyNext='Round twelve, Alex.';failChat=1;
 const t=await turn({voiceSpeaker:{speaker:{id:ALEX,name:'Alex'},source:'track',overlap:[]}});
 assert.equal(t.r.ok,false);assert.equal(t.r.retryMessage.voiceSpeaker.speaker.name,'Alex');assert.equal(t.r.retryMessage.text,'ask Alex (in voice): what round is it');
 requests.length=0;const again=await t.ask(t.r.retryMessage);assert.equal(again.ok,true,again.error);
 const body=JSON.parse(requests.find(q=>q.url.endsWith('/chat/completions')).body);
 assert.match(body.messages.at(-1).content,/^<chat from="Alex">Alex \(in voice\): what round is it<\/chat>/);
});

test('setting off: the prompt and every request are exactly what v2.43 sends, even with the panel\'s speaker attached',async()=>{
 const strip=list=>list.map(q=>({url:q.url,body:q.body}));
 heardNext='tyler who planted';replyNext='Somebody brave.';
 // What v2.43's panel sends (no speaker), with the setting off, and with it on: the same as each other.
 const plain=await turn({},{settings:{voiceSpeakers:false}});
 const off=await turn({voiceSpeaker:{speaker:{id:SAM,name:'Sam'},source:'steam',overlap:[]}},{settings:{voiceSpeakers:false}});
 const onNone=await turn({},{settings:{}});
 for(const t of [plain,off,onNone]){assert.equal(t.r.ok,true,t.r.error);assert.equal(t.r.text,'Somebody brave.');}
 assert.deepEqual(strip(off.requests),strip(plain.requests),'transcription, AI and speech requests are byte-identical');
 assert.deepEqual(strip(onNone.requests),strip(plain.requests));
 const answer=({timings,...rest})=>({...rest,timings:Object.keys(timings||{}).sort()});
 assert.deepEqual(answer(off.r),answer(plain.r),'and the panel gets the same answer (timing values aside)');
 assert.equal(off.user.split('\n')[0],'<chat>tyler who planted</chat>');assert.ok(!off.system.includes('VOICE SPEAKERS'));
 assert.match(off.system,/current speaker identity is UNKNOWN/);
 assert.equal(friendLines(SAM).includes('Somebody brave.'),false,'no friend memory with it off');
 // The background's own answer to the panel says it's off.
 const c=await off.ask({type:'connection'});assert.equal(c.voiceSpeakers,true,'(store reset for this tab: on by default)');
 store.voiceSpeakers=false;assert.equal((await off.ask({type:'connection'})).voiceSpeakers,false);
});

test('background: anything malformed in the attribution sends the turn unlabelled, never fails it',async()=>{
 heardNext='tyler hello';replyNext='Hey there.';
 const plain=await turn({},{settings:{}});
 for(const junk of [{source:'steam',speaker:{id:'1',name:'Sam'}},{source:'nope'},'Sam',42,{speaker:{id:SAM},source:'steam'}]){
  heardNext='tyler hello';const t=await turn({voiceSpeaker:junk});assert.equal(t.r.ok,true,t.r.error);
  if(junk&&typeof junk==='object'&&['steam','track','solo','unknown'].includes(junk.source))assert.match(t.user,/^<chat>Unknown speaker \(in voice\): tyler hello<\/chat>/);
  else assert.equal(t.user,plain.user,'unusable: exactly as before');
 }
});

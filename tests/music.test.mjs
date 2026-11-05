import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {createMusicRouter} from '../browser-extension/music-background.mjs';
const source=f=>readFileSync(new URL('../browser-extension/'+f,import.meta.url),'utf8');
test('music requests and controls parse without consuming arcade starts or bot output',()=>{
 const box={};vm.runInNewContext(source('music-core.js'),box);
 assert.equal(box.TylerMusic.parse('!play Artist Song').query,'Artist Song');
 assert.equal(box.TylerMusic.parse('music skip').action,'skip');
 assert.equal(box.TylerMusic.parse('music volume 0').value,0);
 assert.equal(box.TylerMusic.parse('music volume 200').value,200);
 for(const text of ['!play trivia','play vault','[ROBOTIC TYLER] !play Song','music volume 201','hello'])assert.equal(box.TylerMusic.parse(text),null);
});
test('music gets independent 200 percent gain and peak compression without changing AI volume',async()=>{
 let receive,context;const tracks=[{kind:'video',label:'YouTube tab',getSettings:()=>({displaySurface:'browser'}),addEventListener(){},stop(){this.stopped=true;}},{kind:'audio',addEventListener(){},stop(){this.stopped=true;}}];
 const stream={getVideoTracks:()=>[tracks[0]],getAudioTracks:()=>[tracks[1]],getTracks:()=>tracks};
 const node=kind=>({kind,targets:[],gain:{value:0,setTargetAtTime(v){this.value=v;}},connect(n){this.targets.push(n);},disconnect(){this.disconnected=true;}});
 class Audio {
  constructor(){context=this;this.nodes=[];this.state='running';this.currentTime=0;this.destination=node('speakers');}
  createGain(){const n=node('gain');this.nodes.push(n);return n;}
  createMediaStreamDestination(){this.out={...node('steam'),stream};return this.out;}
  createMediaStreamSource(){this.source=node('source');return this.source;}
  createWaveShaper(){this.shaper={...node('shaper'),curve:null,oversample:'none'};return this.shaper;}
  createDynamicsCompressor(){this.limiter={...node('limiter'),...Object.fromEntries(['threshold','knee','ratio','attack','release'].map(k=>[k,{value:0}]))};return this.limiter;}
  async resume(){}
 }
 const box={AudioContext:Audio,MediaStream:class{},setTimeout,clearTimeout,setInterval:()=>0,clearInterval(){},location:{origin:'https://steamcommunity.com'},navigator:{mediaDevices:{getUserMedia:async()=>stream,getDisplayMedia:async()=>stream}},window:{postMessage(){},addEventListener:(_type,fn)=>{receive=fn;}}};
 vm.runInNewContext(source('audio-bridge.js'),box);
 const command=(type,extra={})=>receive({source:box.window,origin:box.location.origin,data:{source:'tyler-audio-command',type,...extra}});
 await command('music-capture',{volume:3});
 // v2.33: setup makes the call bus (0), Tyler's master (1) and the monitor (2); the share adds its gain (3),
 // the limiter's makeup trim (4) and the duck (5). Everything meets on the bus, then the safety clipper.
 const [bus,master,,music,trim,duckNode]=context.nodes;
 assert.equal(master.gain.value,.35);assert.equal(bus.gain.value,.5);assert.equal(master.targets[0],bus);
 assert.equal(music.gain.value,2);
 assert.equal(music.targets[0],context.limiter);
 assert.equal(context.limiter.targets[0],trim,'the limiter\'s makeup gain is taken back out');assert.ok(Math.abs(trim.gain.value-10**(-.76/20))<1e-9);
 assert.equal(trim.targets[0],duckNode,'then the ducking stage (v2.21)');assert.equal(duckNode.targets[0],bus);
 assert.equal(bus.targets[0],context.shaper);assert.equal(context.shaper.targets[0],context.out,'the safety clipper feeds the call');
 assert.equal(context.shaper.oversample,'2x');const c=context.shaper.curve;assert.equal(c[2048],0);assert.ok(Math.abs(c[2048+512]-.5)<1e-6,'linear below the knee');assert.ok(c[4096]<=.98&&c[4096]>.95,'peaks rounded under full scale');
 assert.equal(context.limiter.threshold.value,-3);
 await command('music-volume',{volume:0});assert.equal(music.gain.value,0);
 await command('music-volume',{volume:1.5});assert.equal(music.gain.value,1.5);
 await command('stop');assert.equal(tracks.some(t=>t.stopped),false);
 await command('music-disconnect');assert.equal(tracks.every(t=>t.stopped),true);
});
test('music tab creation/search/control stays scoped to its Steam owner and selected YouTube tab',async()=>{
 const data={},updates=[],events=[];let created=0;
 const chrome={storage:{session:{get:async()=>data,set:async values=>Object.assign(data,values)}},tabs:{create:async options=>{created++;assert.equal(options.url,'https://www.youtube.com/');return {id:20};},get:async()=>({id:20}),update:async(id,values)=>updates.push({id,...values}),sendMessage:async(id,m)=>events.push({id,...m})}};
 const router=createMusicRouter(chrome),steam={tab:{id:10},url:'https://steamcommunity.com/chat/'};
 await router.command({action:'open'},steam);assert.equal(created,1);
 await router.command({action:'play',query:'Artist & Song',token:'one'},steam);
 assert.match(updates.at(-1).url,/search_query=Artist%20%26%20Song%20music/);
 assert.equal((await router.route({type:'music:pending'},{tab:{id:99},url:'https://www.youtube.com/'})).command,undefined);
 const yt={tab:{id:20},url:'https://www.youtube.com/watch?v=test'};
 assert.equal((await router.route({type:'music:pending'},yt)).command.query,'Artist & Song');
 await router.route({type:'music:event',token:'wrong',event:'ended'},yt);assert.equal(events.length,0);
 await router.route({type:'music:event',token:'one',event:'ended'},yt);assert.equal(events[0].id,10);
 await router.command({action:'pause',token:'one'},steam);assert.equal(data.tylerMusicTab.action,'pause');
 await router.command({action:'resume',token:'one'},steam);assert.equal(data.tylerMusicTab.action,'resume');
 await assert.rejects(router.command({action:'play',query:'song'},{tab:{id:11},url:steam.url}),/different Steam tab/);
 await assert.rejects(router.command({action:'open'},{tab:{id:10},url:'https://example.org/'}),/connected Steam/);
 await assert.rejects(router.route({type:'music:pending'},{tab:{id:20},url:'https://example.org/'}),/selected YouTube/);
});
test('music routing is independent from AI stop and controls do not fetch or extract media URLs',()=>{
 const audio=source('audio-bridge.js');
 const stop=audio.slice(audio.indexOf(' function stop('),audio.indexOf(' const original='));
 assert.doesNotMatch(stop,/disconnectMusic/);
 assert.match(audio,/musicGain.connect\(musicLimiter\)/);
 assert.match(audio,/musicLimiter.connect\(musicTrim\);musicTrim.connect\(musicDuck\);musicDuck.connect\(bus\)/);
 assert.match(audio,/getDisplayMedia/);
 assert.match(source('music.js'),/v22:stop/);
 assert.doesNotMatch(source('youtube-music.js'),/fetch\(|getUserMedia|chrome\.storage|\.currentSrc/);
});
test('one-click Start Music DJ opens YouTube behind Steam and asks for the share in the same click (v2.20.1)',async()=>{
 const data={},created=[],updates=[];
 const chrome={storage:{session:{get:async()=>data,set:async values=>Object.assign(data,values)}},tabs:{create:async options=>{created.push(options);return {id:30};},get:async()=>({id:30}),update:async(id,values)=>updates.push({id,...values}),sendMessage:async()=>{}}};
 const router=createMusicRouter(chrome),steam={tab:{id:10},url:'https://steamcommunity.com/chat/'};
 await router.command({action:'open',background:true},steam);
 assert.equal(created[0].active,false,'the YouTube tab opens without taking focus');
 await router.command({action:'open',background:true},steam);assert.equal(updates.filter(u=>u.active).length,0,'a second Start does not pull YouTube to the front');
 await router.command({action:'open'},steam);assert.equal(updates.at(-1).active,true,'Reopen YouTube still brings it forward');
 // The panel: one button, the share request in the click itself (getDisplayMedia needs the click).
 const music=source('music.js');
 assert.match(music,/id="musicStart"[^>]*>▶ Start Music DJ/);
 const start=music.slice(music.indexOf("$('musicStart').onclick"),music.indexOf("api.musicStatus"));
 assert.match(start,/command\('open',\{background:true\}\)/);
 assert.match(start,/api\.bridge\('music-capture'/);
 assert.ok(start.indexOf("api.bridge('music-capture'")>start.indexOf('void schedule('),'the share is requested synchronously, not after awaiting the tab');
 assert.doesNotMatch(start,/await[^;]*api\.bridge\('music-capture'/);
 // The share stays the YouTube tab's audio only: no system audio, no Steam tab.
 const bridge=source('audio-bridge.js');
 assert.match(bridge,/systemAudio:'exclude'/);assert.match(bridge,/selfBrowserSurface:'exclude'/);
});
test('Music DJ sound quality: untouched tab sound, a chosen call bitrate, kept between sessions (v2.20.2)',()=>{
 const bridge=source('audio-bridge.js'),music=source('music.js');
 assert.match(bridge,/MUSIC_AUDIO=Object\.freeze\(\{echoCancellation:false,noiseSuppression:false,autoGainControl:false/);
 assert.match(bridge,/getDisplayMedia\(\{video:\{displaySurface:'browser',frameRate:\{max:1\},width:\{max:320\},height:\{max:180\}\},audio:MUSIC_AUDIO,/);
 assert.match(bridge,/if\(replaced\.has\(sender\)\)await tuneSender\(sender\)/,'only Tyler\'s own senders are tuned');
 assert.match(bridge,/bitrateBefore\.delete\(sender\);if\(before==null\)delete e\.maxBitrate/,'the earlier setting comes back');
 assert.match(music,/<select id="musicQuality"><option value="auto">Auto · lowers itself if the call drops audio \(recommended\)<\/option><option value="high">High · 128 kbps<\/option><option value="medium">Medium · 64 kbps<\/option><option value="low">/);
 assert.match(music,/TylerStorage\?\.set\?\.\(\{musicQuality:/);
});
test('music quality: chat command, Auto steps down when Steam reports lost audio and back up when steady (v2.20.3)',async()=>{
 const box0={globalThis:{}};vm.runInNewContext(source('music-core.js'),box0);
 const M=box0.globalThis.TylerMusic;
 assert.deepEqual({...M.parse('music quality low')},{action:'quality',level:'low'});
 assert.deepEqual({...M.parse('!music quality HIGH')},{action:'quality',level:'high'});
 assert.deepEqual({...M.parse('music quality')},{action:'quality',level:null});
 assert.equal(M.parse('music quality ultra'),null);assert.equal(M.parse('music quality 128'),null);
 // The bridge with a stand-in Steam connection: its stats say how many of Tyler's packets got lost.
 let receive,tick=null;const set=[],stats={sent:0,lost:0};
 const track={kind:'audio',clone(){return {...track};},addEventListener(){},stop(){},getSettings:()=>({channelCount:2})};
 const video={kind:'video',getSettings:()=>({displaySurface:'browser'}),addEventListener(){},stop(){}};
 const shared={getVideoTracks:()=>[video],getAudioTracks:()=>[track],getTracks:()=>[video,track]};
 const node=()=>({gain:{value:0,setTargetAtTime(){}},connect(){},disconnect(){},threshold:{value:0},knee:{value:0},ratio:{value:0},attack:{value:0},release:{value:0}});
 class Audio{constructor(){this.state='running';this.currentTime=0;this.destination=node();}createGain(){return node();}createMediaStreamDestination(){return {...node(),stream:{getAudioTracks:()=>[track],clone:()=>shared}};}createMediaStreamSource(){return node();}createDynamicsCompressor(){return node();}async resume(){}}
 class Peer{constructor(){this.connectionState='connected';this.signalingState='stable';this.senders=[];this.params={encodings:[{active:true}]};}
  addEventListener(){}getSenders(){return this.senders;}
  addTrack(t){const peer=this,s={track:t,getParameters:()=>structuredClone(peer.params),setParameters:async p=>{peer.params=p;set.push(p.encodings[0].maxBitrate);},replaceTrack:async x=>{s.track=x;}};this.senders.push(s);return s;}
  async getStats(){return new Map([['o',{type:'outbound-rtp',kind:'audio',packetsSent:stats.sent}],['r',{type:'remote-inbound-rtp',kind:'audio',packetsLost:stats.lost}]]);}}
 const box={AudioContext:Audio,MediaStream:class{constructor(t){this.t=t;}},setTimeout,clearTimeout,setInterval:fn=>{tick=fn;return 1;},clearInterval:()=>{tick=null;},location:{origin:'https://steamcommunity.com'},
  navigator:{mediaDevices:{getUserMedia:async()=>shared,getDisplayMedia:async()=>shared}},window:{postMessage(){},addEventListener:(_t,fn)=>{receive=fn;}},DOMException:Error};
 box.window.RTCPeerConnection=Peer;box.RTCPeerConnection=Peer;
 vm.runInNewContext('var window=this.window;'+source('audio-bridge.js'),box);
 const command=(type,extra={})=>receive({source:box.window,origin:box.location.origin,data:{source:'tyler-audio-command',type,...extra}});
 await command('enable');const peer=new box.window.RTCPeerConnection();peer.addTrack(track);
 await command('music-capture',{volume:.35,level:'auto'});await new Promise(r=>setTimeout(r,10));
 assert.equal(peer.params.encodings[0].maxBitrate,64000,'Auto starts at Medium');assert.ok(tick,'Auto watches the call');
 const step=async(sent,lost)=>{stats.sent+=sent;stats.lost+=lost;await tick();await new Promise(r=>setTimeout(r,5));};
 await step(200,0);await step(200,12);assert.equal(peer.params.encodings[0].maxBitrate,48000,'6% lost: one step down');
 await step(200,12);assert.equal(peer.params.encodings[0].maxBitrate,32000);
 await step(200,20);assert.equal(peer.params.encodings[0].maxBitrate,32000,'never below Low');
 for(let i=0;i<15;i++)await step(200,0);assert.equal(peer.params.encodings[0].maxBitrate,48000,'a minute steady: one step up');
 for(let i=0;i<40;i++)await step(200,0);assert.equal(peer.params.encodings[0].maxBitrate,64000,'Auto never goes above Medium');
 await command('music-quality',{level:'high'});assert.equal(peer.params.encodings[0].maxBitrate,128000);assert.equal(tick,null,'a fixed level stops Auto');
 await command('music-quality',{level:'low'});assert.equal('maxBitrate' in peer.params.encodings[0],false,'Low is Steam\'s own default');
 await command('music-quality',{level:'medium'});await command('music-disconnect');await new Promise(r=>setTimeout(r,5));
 assert.equal('maxBitrate' in peer.params.encodings[0],false,'the default comes back when the music stops');
});

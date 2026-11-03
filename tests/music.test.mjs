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
  createDynamicsCompressor(){this.limiter={...node('limiter'),...Object.fromEntries(['threshold','knee','ratio','attack','release'].map(k=>[k,{value:0}]))};return this.limiter;}
  async resume(){}
 }
 const box={AudioContext:Audio,MediaStream:class{},setTimeout,clearTimeout,location:{origin:'https://steamcommunity.com'},navigator:{mediaDevices:{getUserMedia:async()=>stream,getDisplayMedia:async()=>stream}},window:{postMessage(){},addEventListener:(_type,fn)=>{receive=fn;}}};
 vm.runInNewContext(source('audio-bridge.js'),box);
 const command=(type,extra={})=>receive({source:box.window,origin:box.location.origin,data:{source:'tyler-audio-command',type,...extra}});
 await command('music-capture',{volume:3});
 assert.equal(context.nodes[0].gain.value,.35);
 assert.equal(context.nodes[2].gain.value,2);
 assert.equal(context.nodes[2].targets[0],context.limiter);
 assert.equal(context.limiter.targets[0],context.out);
 assert.equal(context.limiter.threshold.value,-3);
 await command('music-volume',{volume:0});assert.equal(context.nodes[2].gain.value,0);
 await command('music-volume',{volume:1.5});assert.equal(context.nodes[2].gain.value,1.5);
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
 assert.match(audio,/musicLimiter.connect\(destination\)/);
 assert.match(audio,/getDisplayMedia/);
 assert.match(source('music.js'),/v22:stop/);
 assert.doesNotMatch(source('youtube-music.js'),/fetch\(|getUserMedia|chrome\.storage|\.currentSrc/);
});

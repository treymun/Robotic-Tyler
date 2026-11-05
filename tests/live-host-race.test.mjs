// v2.33: Gemini Live start/stop races. The real LiveHost with a mock WebSocket (no network, no Google):
// two starts close together leave one connection, which Stop closes; a stop while still connecting
// cancels the start, so no session goes live afterwards (a live session is billable).
import test from 'node:test';
import assert from 'node:assert/strict';
import {LiveHost} from '../browser-extension/live-host.mjs';
const delay=ms=>new Promise(r=>setTimeout(r,ms));
function rig(){
 const sockets=[];
 class WS{constructor(url){this.url=url;this.readyState=0;this.closed=false;sockets.push(this);setTimeout(()=>{this.readyState=1;this.onopen?.();},5);}
  send(m){if(JSON.parse(m).setup)setTimeout(()=>this.onmessage?.({data:JSON.stringify({setupComplete:{}})}),5);}
  close(){if(this.closed)return;this.closed=true;this.readyState=3;setTimeout(()=>this.onclose?.({code:1000}),1);}}
 const storage={async get(){await delay(3);return {geminiKey:'k',voiceEngine:'live'};},async set(){}};
 const memory={async read(){await delay(3);return [];},async write(){}};
 return {sockets,host:new LiveHost({storage,memory,WebSocketImpl:WS}),sink:{state(){}}};
}
test('a double start leaves one Google connection, and Stop closes it',async()=>{
 const {sockets,host,sink}=rig();
 const a=host.start({sink,owner:'tab:7',historyId:'h'}).then(()=>'live',e=>e.message);await delay(1);
 const b=host.start({sink,owner:'tab:7',historyId:'h'}).then(()=>'live',e=>e.message);
 const [ra,rb]=await Promise.all([a,b]);await delay(40);
 assert.match(ra,/cancelled/);assert.equal(rb,'live');
 assert.equal(sockets.filter(s=>!s.closed).length,1,'one connection');
 assert.equal(await host.stop('Stopped by you','tab:7'),true);await delay(20);
 assert.equal(sockets.filter(s=>!s.closed).length,0,'Stop closed it');assert.equal(host.active,false);
});
test('a stop while still connecting cancels the start: nothing goes live afterwards',async()=>{
 const {sockets,host,sink}=rig();
 const started=host.start({sink,owner:'tab:7',historyId:'h'}).then(()=>'live',e=>e.message);await delay(2);
 await host.stop('Stopped by you','tab:7');
 assert.match(await started,/cancelled/);await delay(40);
 assert.equal(sockets.filter(s=>!s.closed).length,0);assert.equal(host.active,false);
});
test('another tab\'s stop doesn\'t cancel this tab\'s start',async()=>{
 const {sockets,host,sink}=rig();
 const started=host.start({sink,owner:'tab:7',historyId:'h'}).then(()=>'live',e=>e.message);await delay(2);
 assert.equal(await host.stop('Other tab','tab:9'),false);assert.equal(await started,'live');
 await host.stop('done','tab:7');await delay(20);assert.equal(sockets.filter(s=>!s.closed).length,0);
});

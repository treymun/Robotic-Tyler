import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {contentStorage,readable} from '../browser-extension/content-storage.mjs';
const read=f=>readFileSync(new URL('../browser-extension/'+f,import.meta.url),'utf8');
test('restricted content context loads existing settings and saves permitted data through worker',async()=>{
 const data={v22TurnMode:'strong',v22EmergencyStop:true,openrouterKey:'secret',tylerArcadeStats:{total:8}};
 const store={get:async keys=>Object.fromEntries(keys.filter(k=>k in data).map(k=>[k,data[k]])),set:async v=>Object.assign(data,v),remove:async keys=>keys.forEach(k=>delete data[k])};
 let listener;
 const sandbox={chrome:{get storage(){throw Error('Access to storage is not allowed from this context.');},runtime:{sendMessage:async m=>({ok:true,...await contentStorage(store,m)}),onMessage:{addListener:fn=>{listener=fn;}}}}};
 vm.runInNewContext(read('content-storage.js'),sandbox);
 const api=sandbox.TylerStorage;
 assert.equal((await api.get(['v22TurnMode','v22EmergencyStop'])).v22TurnMode,'strong');
 await api.set({v22Latency:[{totalMs:123}]});
 assert.equal(data.v22Latency[0].totalMs,123);
 assert.equal(data.tylerArcadeStats.total,8);
 assert.equal(data.openrouterKey,'secret');
 await assert.rejects(api.get('openrouterKey'),/not allowed/);
 await assert.rejects(api.set({v22EmergencyStop:false}),/not allowed/);
 await assert.rejects(api.remove('openrouterKey'),/not allowed/);
 await assert.rejects(api.get(null),/not allowed/);
 let stopped=false;
 api.onChanged.addListener((changes,area)=>{stopped=area==='local'&&changes.v22EmergencyStop.newValue;});
 listener({type:'storage:changed',changes:{v22EmergencyStop:{newValue:true}}});
 assert.equal(stopped,true);
 assert.equal(readable.has('geminiKey'),false);
});
test('all isolated content scripts use broker and worker checks sender before routing storage',()=>{
 const manifest=JSON.parse(read('manifest.json'));
 for(const group of manifest.content_scripts){
  if(group.world==='MAIN'||!group.matches.some(m=>m.includes('steamcommunity.com')))continue;
  assert.equal(group.js[0],'content-storage.js');
  for(const file of group.js)assert.doesNotMatch(read(file),/chrome\.storage/);
 }
 const bg=read('background.js');
 assert.ok(bg.indexOf('Only Steam web chat')<bg.indexOf("message.type==='storage:content'"));
 assert.match(bg,/TRUSTED_CONTEXTS/);
 assert.match(bg,/filter\(\(\[key\]\)=>readable.has\(key\)\)/);
});

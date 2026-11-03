import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';

const source=readFileSync(new URL('../browser-extension/chat-bus.js',import.meta.url),'utf8');
function load(){
 const natives=[];
 class FakeObserver{constructor(fn){this.fn=fn;this.observing=null;this.options=null;natives.push(this);}observe(root,options){this.observing=root;this.options=options;}disconnect(){this.observing=null;}}
 const box={MutationObserver:FakeObserver};box.globalThis=box;
 vm.runInNewContext(source,box);
 return {bus:box.TylerChatBus,natives};
}
const node=(text)=>{let reads=0;return {get innerText(){reads++;return ' '+text+' ';},textContent:text,get reads(){return reads;}};};

test('one native observer serves every feature subscribed to the same chat region',()=>{
 const {bus,natives}=load();const region={};const seen=[];
 const a=new bus.Observer(r=>seen.push(['a',r.length])),b=new bus.Observer(r=>seen.push(['b',r.length]));
 a.observe(region,{subtree:true,childList:true,characterData:true});b.observe(region,{subtree:true,childList:true,characterData:true});
 assert.equal(natives.length,1);assert.equal(bus.stats().subscribers,2);
 natives[0].fn([{type:'childList',target:region,addedNodes:[]}]);
 assert.deepEqual(seen,[['a',1],['b',1]]);
});

test('records are filtered to what each subscriber asked for',()=>{
 const {bus,natives}=load();const region={};const got={text:[],list:[]};
 new bus.Observer(r=>got.text.push(...r.map(x=>x.type))).observe(region,{subtree:true,childList:true,characterData:true});
 new bus.Observer(r=>got.list.push(...r.map(x=>x.type))).observe(region,{subtree:true,childList:true});
 assert.equal(natives[0].options.characterData,true);
 natives[0].fn([{type:'characterData',target:region},{type:'childList',target:region,addedNodes:[]}]);
 assert.deepEqual(got.text,['characterData','childList']);
 assert.deepEqual(got.list,['childList']);
});

test('node text is read once per dispatch no matter how many features ask',()=>{
 const {bus,natives}=load();const region={},message=node('!votekick Sam');const results=[];
 for(let i=0;i<5;i++)new bus.Observer(()=>results.push(bus.text(message))).observe(region,{subtree:true,childList:true});
 natives[0].fn([{type:'childList',target:region,addedNodes:[message]}]);
 assert.deepEqual(results,Array(5).fill('!votekick Sam'));
 assert.equal(message.reads,1);
 bus.text(message);assert.equal(message.reads,2,'outside a dispatch the live value is read');
});

test('a failing feature does not stop the others, and the last disconnect releases the observer',()=>{
 const {bus,natives}=load();const region={};let ok=0;
 const bad=new bus.Observer(()=>{throw Error('boom');}),good=new bus.Observer(()=>ok++);
 bad.observe(region,{subtree:true,childList:true});good.observe(region,{subtree:true,childList:true});
 natives[0].fn([{type:'childList',target:region,addedNodes:[]}]);
 assert.equal(ok,1);
 bad.disconnect();assert.equal(natives[0].observing,region);
 good.disconnect();assert.equal(natives[0].observing,null);assert.equal(bus.stats().roots,0);
});

test('re-observing a new region moves the subscription',()=>{
 const {bus,natives}=load();const first={},second={};let calls=0;
 const o=new bus.Observer(()=>calls++);o.observe(first,{subtree:true,childList:true});o.observe(second,{subtree:true,childList:true});
 assert.equal(natives.length,2);assert.equal(natives[0].observing,null);assert.equal(natives[1].observing,second);
 natives[1].fn([{type:'childList',target:second,addedNodes:[]}]);assert.equal(calls,1);
});

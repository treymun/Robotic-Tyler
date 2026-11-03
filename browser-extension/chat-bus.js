// Shared Steam-chat observation for every feature module (isolated world).
//
// Before v2.4 each feature (moderation, admin, music, soundboard, squad,
// automatic conversation…) attached its own MutationObserver to the same chat
// history and re-read innerText for every new message. TylerChatBus keeps ONE
// native observer per observed root and fans the records out to subscribers,
// and memoises node text for the rest of the task that delivered the records
// (including the promise chains features start from their callbacks), so
// innerText (which can force layout) is computed once per node, not per feature.
//
// TylerChatBus.Observer is a drop-in replacement for MutationObserver:
//   const o = new (globalThis.TylerChatBus?.Observer || MutationObserver)(cb);
//   o.observe(region, {subtree:true, childList:true, characterData:true});
//   o.disconnect();
(() => {
 'use strict';
 if(globalThis.TylerChatBus)return;
 const Native=globalThis.MutationObserver;
 const hubs=new Map();
 let cache=null;

 function text(node){
  if(!node)return '';
  if(cache){const hit=cache.get(node);if(hit!==undefined)return hit;}
  const value=(node.innerText||node.textContent||'').trim();
  cache?.set(node,value);
  return value;
 }

 const union=subs=>{
  const o={childList:false,subtree:false,characterData:false,attributes:false};
  for(const s of subs)for(const k of Object.keys(o))if(s.options[k])o[k]=true;
  if(!o.childList&&!o.characterData&&!o.attributes)o.childList=true;
  if(!o.attributes)delete o.attributes;
  return o;
 };
 const wants=(options,record)=>record.type==='characterData'?!!options.characterData:record.type==='attributes'?!!options.attributes:!!options.childList;

 // A fresh cache per delivery, so text read for an earlier batch is never reused.
 // It survives the features' follow-up microtasks and is dropped after this task.
 function dispatch(hub,records){
  const map=new WeakMap();cache=map;
  try{
   for(const sub of [...hub.subs]){
    if(!hub.subs.has(sub))continue;
    const mine=records.filter(r=>wants(sub.options,r)&&(sub.options.subtree||r.target===hub.root));
    if(!mine.length)continue;
    try{sub.callback(mine,sub.handle);}catch(error){if(typeof console!=='undefined')console.warn('[ROBOTIC TYLER] chat feature failed:',error?.message||error);}
   }
  }finally{
   if(typeof setTimeout==='function')setTimeout(()=>{if(cache===map)cache=null;},0);
   else if(cache===map)cache=null;
  }
 }

 function attach(sub,root,options){
  detach(sub);
  let hub=hubs.get(root);
  if(!hub){hub={root,subs:new Set(),observer:null,key:''};hub.observer=new Native(records=>dispatch(hub,records));hubs.set(root,hub);}
  sub.root=root;sub.options={...options};hub.subs.add(sub);
  const merged=union(hub.subs),key=JSON.stringify(merged);
  if(key!==hub.key){hub.key=key;hub.observer.observe(root,merged);}
 }
 function detach(sub){
  const hub=sub.root&&hubs.get(sub.root);sub.root=null;
  if(!hub||!hub.subs.delete(sub))return;
  if(!hub.subs.size){hub.observer.disconnect();hubs.delete(hub.root);}
 }

 class Observer{
  #sub;
  constructor(callback){if(typeof callback!=='function')throw TypeError('callback must be a function');this.#sub={callback,options:{},root:null,handle:this};}
  observe(root,options={}){if(!root)throw TypeError('observe() needs a target node');attach(this.#sub,root,options);}
  disconnect(){detach(this.#sub);}
  takeRecords(){return [];}
 }

 const memos=new WeakMap();
 function memo(kind,node,compute){
  if(!node||!cache)return compute();
  let entry=memos.get(cache);if(!entry){entry=new Map();memos.set(cache,entry);}
  let perKind=entry.get(kind);if(!perKind){perKind=new WeakMap();entry.set(kind,perKind);}
  if(perKind.has(node))return perKind.get(node);
  const value=compute();perKind.set(node,value);return value;
 }
 globalThis.TylerChatBus=Object.freeze({Observer,text,memo,stats:()=>({roots:hubs.size,subscribers:[...hubs.values()].reduce((n,h)=>n+h.subs.size,0)})});
})();

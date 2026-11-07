'use strict';
const {isChat}=require('../guards.cjs');
const {stylesFor,cleanTheme,cleanMode}=require('./styles.cjs');
// Runs in an isolated, unprivileged world. Reads structure only: no Steam model,
// chat text, DOM writes, event handlers, mutation observers or exposed IPC.
function inspectPage(){
 const visible=n=>!!n?.getClientRects().length&&n.checkVisibility({visibilityProperty:true,opacityProperty:true});
 const has=s=>[...document.querySelectorAll(s)].some(visible);
 const root=has('.friendsui-container');
 const busy=has('[aria-busy="true"],.Loading,.Throbber');
 const ready=document.readyState==='complete'&&!busy&&has('.friendlistListContainer,.chatEntry,.chatHistoryScroll');
 const history='.chatHistoryScroll,.ChatHistoryContainer';
 const windows=[...document.querySelectorAll('.chatWindow,.VoiceRoomChatWindow')].filter(w=>visible(w)&&w.querySelector('.chatEntry,'+history));
 // Optional/closed chats don't count. A new empty chat is valid: we test the
 // history container, never messages. A missing composer can mean read-only chat.
 const full=windows.every(w=>w.querySelector(history)&&(w.matches('.VoiceRoomChatWindow')||w.querySelector('.chatHeader,.chatRoomHeader,.chatRoomGroupHeader')));
 return {ready,base:root,full};
}
function createAppearance(wc,{log=()=>{},probe=()=>wc.executeJavaScriptInIsolatedWorld(1044,[{code:'('+inspectPage.toString()+')()'}]),styles=stylesFor,delay=1000,maxWaits=30}={}){
 let prefs={mode:'off',theme:'steam'},status={preferred:'off',effective:'off',theme:'steam',reason:''};
 let epoch=0,documentId=0,keys=[],timer=null,waits=0,streak=0,disposed=false,dirty=false,running=null,loading=false;
 let fallback=null;
 const signal=()=>{let resolve;return {promise:new Promise(r=>resolve=r),resolve};};
 let cancellation=signal();
 const invalidate=()=>{epoch++;cancellation.resolve();cancellation=signal();};
 const alive=()=>!disposed&&!wc.isDestroyed();
 const clearTimer=()=>{if(timer!==null)clearTimeout(timer);timer=null;};
 const setStatus=(effective,reason='')=>{status={preferred:prefs.mode,effective,theme:prefs.theme,reason};};
 function schedule(){if(!alive())return;dirty=true;if(!running)running=drain().finally(()=>{running=null;if(dirty)schedule();});return running;}
 function later(){if(timer!==null||waits++>=maxWaits)return;timer=setTimeout(()=>{timer=null;void schedule();},delay);timer.unref?.();}
 async function remove(){
  const old=keys;keys=[];let failed=false;
  for(const item of old){if(item.documentId!==documentId)continue;try{await wc.removeInsertedCSS(item.key);}catch{if(item.documentId===documentId&&alive()){keys.push(item);failed=true;}}}
  return !failed;
 }
 async function drain(){while(dirty&&alive()){dirty=false;try{await apply();}catch(error){await remove();setStatus(keys.length?'error':'off','Styling unavailable. Choose Off, or reload Steam if removal failed.');try{log('Steam appearance unavailable',String(error.message).slice(0,160));}catch{}}}}
 async function apply(){
  const version=epoch,stop=cancellation.promise;
  if(!await remove()){setStatus('error','Could not remove a stylesheet. Reload Steam from the app menu to restore its original appearance.');return;}
  if(version!==epoch||!alive())return;
  if(prefs.mode==='off'){clearTimer();setStatus('off');return;}
  if(loading){setStatus('off','Waiting for Steam chat to finish loading.');return;}
  if(!isChat(wc.getURL())){setStatus('off','Only Steam chat is styled.');return;}
  // A slow page probe must not hold an Off request behind Steam JavaScript.
  const check=await Promise.race([probe(),stop.then(()=>null)]);
  if(version!==epoch||!alive())return;
  if(!check?.ready){setStatus('off','Waiting for Steam chat to finish loading.');later();return;}
  if(!check.base){fallback='off';setStatus('off','Steam chat structure was not recognised; original appearance retained.');return;}
  if(prefs.mode==='full'&&!check.full&&!fallback){
   if(++streak<3){setStatus('off','Waiting for chat structure to settle.');later();return;}
   fallback='colors';
  }else streak=0;
  const mode=fallback==='off'?'off':prefs.mode==='full'&&fallback==='colors'?'colors':prefs.mode;
  if(mode==='off'){setStatus('off','Steam chat structure was not recognised.');return;}
  const sheet=styles(prefs.theme);
  for(const layer of mode==='full'?['colors','full']:['colors']){
   // Electron 45.2.1 removes author sheets by key; user-origin sheets can
   // remain even after removeInsertedCSS resolves. Targeted paint declarations
   // win the author cascade without sacrificing the Off escape hatch.
   const key=await wc.insertCSS(sheet[layer],{cssOrigin:'author'});
   if(typeof key!=='string'||!key)throw Error('Steam returned no stylesheet key');
   if(version!==epoch||!alive()||!isChat(wc.getURL())){try{await wc.removeInsertedCSS(key);}catch{if(alive())keys.push({key,documentId});}return;}
   keys.push({key,documentId});
  }
  setStatus(mode,mode!==prefs.mode?'Full styling temporarily unavailable on this page; using Colors only. Your preference is kept.':'');
 }
 function navigation(details,_url,inPlace,isMainFrame){
  // Electron 45 puts the navigation flags on the details object. Older
  // versions pass them positionally. Only a new top-level document matters.
  const mainFrame=details?.isMainFrame??isMainFrame;
  const sameDocument=details?.isSameDocument??inPlace;
  if(mainFrame===false||sameDocument)return;
  invalidate();loading=true;waits=0;clearTimer();setStatus('off','Loading Steam.');void schedule();
 }
 // A started navigation can be cancelled. Forget old keys only when a new
 // document commits, when Electron has actually discarded its stylesheets.
 const committed=()=>{invalidate();documentId++;keys=[];fallback=null;streak=0;};
 const loaded=()=>{loading=false;waits=0;void schedule();};
 const failed=(_event,_code,_description,_url,isMainFrame)=>{if(isMainFrame!==false)loaded();};
 const inPage=(_event,_url,isMainFrame)=>{if(isMainFrame!==false)void schedule();};
 const gone=()=>{invalidate();documentId++;keys=[];clearTimer();setStatus('off','Steam is not loaded.');};
 const events=[['did-start-navigation',navigation],['did-navigate',committed],['did-finish-load',loaded],['did-fail-load',failed],['did-navigate-in-page',inPage],['render-process-gone',gone],['destroyed',gone]];
 for(const [event,fn]of events)wc.on(event,fn);
 return {
  update(values){prefs={mode:cleanMode(values.steamChatAppearance),theme:cleanTheme(values.uiTheme)};invalidate();waits=0;clearTimer();status={...status,preferred:prefs.mode,theme:prefs.theme,reason:'Applying your appearance choice.'};return schedule();},
  status:()=>({...status}),
  async dispose(){disposed=true;invalidate();clearTimer();await remove();for(const [event,fn]of events)wc.removeListener?.(event,fn);},
 };
}
module.exports={createAppearance,inspectPage};

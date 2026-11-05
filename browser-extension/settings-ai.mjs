// Settings → AI & personality (v2.20): "Test selected model" and "Preview a reply", with exactly the
// model, provider routing and personality rules real replies use (models.mjs, conversation.mjs,
// guard.mjs). Chrome runs this in the settings page itself (a trusted extension page that may read
// the keys); the desktop app runs it in the background of its main process, so keys never reach the
// settings window. Nothing here is saved; tests and previews don't count toward Tyler's usage.
import {chooseOpenRouter,openRouterRequest,geminiTextModel,openRouterProblem} from './models.mjs';
import {geminiReply} from './gemini.mjs';
import {ownerStyle,modelStyle} from './conversation.mjs';
import {CHAT_RULES,CHAT_REMINDER,wrapChat} from './guard.mjs';
import {LOCAL_CHROME_ERROR} from './local-ai.mjs';

const LENGTH={short:'Use one or two sentences.',normal:'Match length to the question: short banter, somewhat longer genuine answers.',detailed:'Give a complete but compact answer when needed (at most two short paragraphs).'};
const CAP={short:80,normal:120,detailed:180};
const redact=(s,keys)=>keys.filter(Boolean).reduce((t,k)=>t.split(k).join('[hidden]'),String(s)).replace(/sk-or-[\w-]+/gi,'[hidden]');

async function openRouter(key,request,signal){
 const started=Date.now();
 const r=await fetch('https://openrouter.ai/api/v1/chat/completions',{method:'POST',redirect:'error',signal,headers:{'Content-Type':'application/json',Authorization:'Bearer '+key,'X-Title':'ROBOTIC TYLER Settings'},body:JSON.stringify({...request,stream:false})});
 const d=await r.json().catch(()=>({}));
 return {r,d,ms:Date.now()-started};
}

/**
 * request: {action:'test'|'preview', aiProvider, brain, smartRouting, geminiTextModel, prompt?, kind?, values?}
 * keys: {openrouter, gemini}. Returns {ok, text?, model, id, provider, servedBy?, ms, error?}.
 * options.local: the desktop app's Text AI on this PC (globalThis.tylerLocalAI), for aiProvider 'local'.
 */
export async function runSettingsAI(request={},keys={},{local}={}){
 if(request.aiProvider==='local')return runLocal(request,local);
 const google=request.aiProvider==='gemini',values=request.values||{};
 const signal=AbortSignal.timeout(request.action==='test'?20000:30000);
 const kind=request.kind==='roast'?'roast':'normal';
 const prompt=String(request.prompt||'').trim().slice(0,500)||(kind==='roast'?'Tyler roast me for missing every shot.':'Tyler, what do you think?');
 const length=['short','normal','detailed'].includes(values.length)?values.length:'normal';
 const or=google?null:chooseOpenRouter(request,prompt);
 const g=google?geminiTextModel(request.geminiTextModel):null;
 const info={model:google?g.label:or.label,id:google?g.id:or.id,provider:google?'Google Gemini':'OpenRouter'};
 const key=google?keys.gemini:keys.openrouter;
 if(!key)return {ok:false,...info,error:'No '+(google?'Google Gemini':'OpenRouter')+' key yet. Paste one above (it\'s used for this check without being saved).'};
 const messages=request.action==='test'
  ?[{role:'system',content:'You are a connection check. Reply with exactly: Ready to roll.'},{role:'user',content:'Connection check.'}]
  :[{role:'system',content:CHAT_RULES+' You are ROBOTIC TYLER, an identified AI gaming companion. Respond to the latest chat message directly. '+LENGTH[length]+' Use natural conversational phrasing. '+ownerStyle(values)+' '+modelStyle(or?.key,values.roastMode)+(kind==='roast'?' Lean into a playful roast.':'')},
    {role:'user',content:wrapChat(prompt,'Friend')+'\n'+CHAT_REMINDER}];
 const cap=request.action==='test'?24:CAP[length];
 try{
  if(google){
   const started=Date.now();
   const text=await geminiReply(key,messages,cap,signal,g.id);
   return {ok:true,...info,text,ms:Date.now()-started,servedBy:'Google AI Studio'};
  }
  const {r,d,ms}=await openRouter(key,{...openRouterRequest(or),max_tokens:cap,messages},signal);
  if(!r.ok||d.error)return {ok:false,...info,ms,error:redact(openRouterProblem(r.status||502,d.error?.message,or),[key])};
  const text=String(d.choices?.[0]?.message?.content||'').trim();
  if(!text)return {ok:false,...info,ms,error:or.label+' answered without any text. Try again.'};
  return {ok:true,...info,text,ms,servedBy:d.provider||'',reported:d.model||''};
 }catch(error){
  const timeout=error?.name==='TimeoutError'||/timed? ?out|aborted/i.test(String(error?.message));
  return {ok:false,...info,error:timeout?info.model+' took too long to answer (over '+(request.action==='test'?20:30)+' s).':redact(String(error?.message||error).replace(/^Gemini \d+ · /,''),[key])};
 }
}
// Text AI on this PC (v2.38): the same check and preview, answered by the desktop app's local model.
function messagesFor(request,local){
 const values=request.values||{},kind=request.kind==='roast'?'roast':'normal',length=['short','normal','detailed'].includes(values.length)?values.length:'normal';
 const prompt=String(request.prompt||'').trim().slice(0,500)||(kind==='roast'?'Tyler roast me for missing every shot.':'Tyler, what do you think?');
 if(request.action==='test')return {cap:24,messages:[{role:'system',content:'You are a connection check. Reply with exactly: Ready to roll.'},{role:'user',content:'Connection check.'}]};
 return {cap:CAP[length],messages:[{role:'system',content:CHAT_RULES+' You are ROBOTIC TYLER, an identified AI gaming companion. Respond to the latest chat message directly. '+LENGTH[length]+' Use natural conversational phrasing. '+ownerStyle(values)+' '+modelStyle(local?.uncensored?'local-uncensored':null,values.roastMode)+(kind==='roast'?' Lean into a playful roast.':'')},
  {role:'user',content:wrapChat(prompt,'Friend')+'\n'+CHAT_REMINDER}]};
}
async function runLocal(request,local){
 const info={model:'Text AI on this PC',id:'local',provider:'This PC'};
 if(!local)return {ok:false,...info,error:LOCAL_CHROME_ERROR};
 const st=await local.status().catch(()=>null);if(st?.label)Object.assign(info,{model:st.label,id:st.model});
 const {messages,cap}=messagesFor(request,st);const started=Date.now();
 try{const r=await local.chat({messages,max_tokens:cap,stream:false});return {ok:true,...info,text:String(r.text||'').trim(),ms:Date.now()-started,servedBy:'this PC'+(r.device==='gpu'?' (graphics card)':r.device==='cpu'?' (processor)':'')};}
 catch(error){return {ok:false,...info,ms:Date.now()-started,error:String(error?.message||error).slice(0,300)};}
}

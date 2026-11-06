// Settings → AI & personality (v2.20): the model card under the provider and model choice, "Test
// selected model", and "Preview a reply". Both use settings-ai.mjs, i.e. the same model, provider
// routing and personality rules as real replies. Chrome runs them in this page; the desktop app runs
// them in its main process, so saved keys never reach this window (a key typed here is passed along
// for the one request without being saved).
import {OPENROUTER_MODELS,GEMINI_TEXT_MODELS,openRouterModel,geminiTextModel,FREE_TIER_NOTE,GEMINI_LINKS} from './models.mjs';
import {runSettingsAI} from './settings-ai.mjs';

const $=id=>document.getElementById(id);
const desktop=document.body.dataset.desktop==='true';
const store=desktop?window.tylerSettings?.storage?.local:globalThis.chrome?.storage?.local;
const provider=()=>['gemini','local'].includes($('aiProvider').value)?$('aiProvider').value:'openrouter';

function link(href,text){const a=document.createElement('a');a.href=href;a.target='_blank';a.rel='noopener noreferrer';a.textContent=text;return a;}
function route(model){
 const p=model.provider;
 return (p.only?p.only.map(cap).join(', ')+' only, no fallback':p.order.map(cap).join(' → ')+(p.allow_fallbacks?', then others under the price cap':''))+' · never Parasail';
}
const cap=s=>({deepinfra:'DeepInfra',sambanova:'SambaNova',groq:'Groq',venice:'Venice',mistral:'Mistral'})[s]||s;

export function render(){
 const google=provider()==='gemini';
 document.body.dataset.aiProvider=provider();
 $('modelTestResult').textContent='';$('modelTestResult').dataset.state='';
 // Text AI on this PC (v2.38) has its own section (local-ai-settings.js) instead of this card.
 window.dispatchEvent(new CustomEvent('tyler:ai-provider',{detail:provider()}));
 if(provider()==='local')return;
 const card=$('modelCard');
 if(google){
  const m=geminiTextModel($('geminiTextModel').value);
  card.dataset.tier=m.tier;
  $('mcTier').textContent=m.tierLabel;$('mcName').textContent=m.label;$('mcId').textContent=m.id;
  $('mcBadge').textContent=m.recommended?'Recommended':'';$('mcBadge').hidden=!m.recommended;
  $('mcStrengths').textContent=m.strengths;
  $('mcProvider').textContent='Google AI Studio';$('mcPrice').textContent='Free tier available · '+m.price;
  $('mcExtraLabel').textContent='Thinking';$('mcExtra').textContent=m.thinking==='minimal'?'Minimal: answers right away':'Low: a brief think before answering';
  $('mcNote').replaceChildren(FREE_TIER_NOTE+' ',link(GEMINI_LINKS.pricing,'Google pricing'),' · ',link(GEMINI_LINKS.limits,'your limits in AI Studio'),'. Speech-to-text for Standard voice always uses Gemini 3.1 Flash-Lite.');
 }else{
  const m=openRouterModel($('brain').value),smart=$('smartRouting').checked;
  card.dataset.tier=m.key;
  $('mcTier').textContent=m.badge;$('mcName').textContent=m.label;$('mcId').textContent=m.id;
  $('mcBadge').hidden=true;$('mcBadge').textContent='';
  $('mcStrengths').textContent=m.strengths;
  $('mcProvider').textContent='OpenRouter';$('mcPrice').textContent=m.price;
  $('mcExtraLabel').textContent='Providers';$('mcExtra').textContent=route(m);
  $('mcNote').textContent=m.key==='venice'
   ?(smart?'Smart routing doesn\'t apply to Venice: every reply uses Venice Uncensored. ':'')+'Pairs best with Roast intensity → No filter. Your rules and the chat-takeover protection still apply.'
   :smart?'Smart routing is on: casual messages use Mistral Small 3.2 and harder questions Llama 3.3 70B, both with their own provider routing.':'';
 }
}

function request(action,extra={}){
 const values={personality:$('personality').value,roastMode:$('roastMode').value,length:$('length').value,v23Persona:$('v23Persona')?.value||'',localExplicit:$('localExplicit')?.checked===true};
 return {action,aiProvider:provider(),brain:$('brain').value,smartRouting:$('smartRouting').checked,geminiTextModel:$('geminiTextModel').value,values,...extra};
}
async function run(req){
 const typed={openrouter:$('openrouterKey').value.trim(),gemini:$('geminiKey').value.trim()};
 if(desktop)return window.tylerSettings.ai({...req,openrouterKey:typed.openrouter,geminiKey:typed.gemini});
 const saved=await store.get(['openrouterKey','geminiKey']);
 return runSettingsAI(req,{openrouter:typed.openrouter||saved.openrouterKey,gemini:typed.gemini||saved.geminiKey});
}

async function test(){
 const out=$('modelTestResult'),button=$('modelTest');
 button.disabled=true;out.dataset.state='busy';out.textContent='Asking '+$('mcName').textContent+'…';
 try{
  const r=await run(request('test'));
  out.dataset.state=r.ok?'ok':'error';
  out.textContent=r.ok?'✓ '+r.model+' answered in '+(r.ms/1000).toFixed(2)+' s'+(r.servedBy?' via '+r.servedBy:'')+(r.text?': “'+r.text.slice(0,60)+'”':''):'✗ '+r.error;
 }catch(error){out.dataset.state='error';out.textContent='✗ '+String(error?.message||error).replace(/sk-or-[\w-]+/gi,'[hidden]');}
 finally{button.disabled=false;}
}
async function preview(kind){
 const out=$('previewOutput'),meta=$('previewMeta');
 for(const id of ['previewReply','previewRoast'])$(id).disabled=true;
 out.textContent='Generating preview…';meta.textContent='';
 try{
  const r=await run(request('preview',{kind,prompt:$('previewPrompt').value}));
  out.textContent=r.ok?r.text:'Preview failed: '+r.error;
  meta.textContent=r.model+(r.ms?' · '+(r.ms/1000).toFixed(1)+' s':'')+(r.servedBy?' · via '+r.servedBy:'');
 }catch(error){out.textContent='Preview failed: '+String(error?.message||error).replace(/sk-or-[\w-]+/gi,'[hidden]');}
 finally{for(const id of ['previewReply','previewRoast'])$(id).disabled=false;}
}

// The model lists in settings.html must match models.mjs (tests/models.test.mjs checks it too).
const missing=[...OPENROUTER_MODELS.map(m=>['brain',m.key]),...GEMINI_TEXT_MODELS.map(m=>['geminiTextModel',m.id])].filter(([id,v])=>![...$(id).options].some(o=>o.value===v));
if(missing.length)console.warn('[ROBOTIC TYLER] Model list out of date:',missing);
for(const id of ['aiProvider','brain','geminiTextModel','smartRouting'])$(id).addEventListener('change',render);
$('modelTest').addEventListener('click',()=>void test());
$('previewReply').addEventListener('click',()=>void preview('normal'));
$('previewRoast').addEventListener('click',()=>void preview('roast'));
globalThis.TylerIcons?.fill?.($('modelCard'));
render();
Promise.resolve(window.tylerSettingsLoaded).catch(()=>{}).then(render);

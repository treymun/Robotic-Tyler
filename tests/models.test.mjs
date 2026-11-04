// v2.20 text models: the model and provider routing chosen in Settings are what real replies,
// previews and model tests use (Venice on Venice only, never Parasail, no silent swaps), and the
// three Gemini models get their own thinking settings and quota handling. Drives the real background
// script with mocked OpenRouter and Gemini APIs (no real provider is called here).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {OPENROUTER_MODELS,GEMINI_TEXT_MODELS,chooseOpenRouter,openRouterRequest,modelLabel,geminiProblem,openRouterProblem,NEVER_PROVIDERS} from '../browser-extension/models.mjs';
import {geminiTextBody,geminiContents} from '../browser-extension/gemini.mjs';
import {styleGuide} from '../browser-extension/memory.mjs';
import {modelStyle} from '../browser-extension/conversation.mjs';

const store={openrouterKey:'sk-or-test',geminiKey:'AIza-test',aiProvider:'openrouter'};
const calls=[];let geminiQueue=[],orQueue=[];
const json=(body,status=200)=>new Response(JSON.stringify(body),{status,headers:{'content-type':'application/json'}});
globalThis.fetch=async(url,options={})=>{
 const body=options.body?JSON.parse(options.body):null;calls.push({url:String(url),body});
 if(String(url).endsWith('/chat/completions')){const next=orQueue.shift();if(next)return next();return json({choices:[{message:{content:'Sure thing.'}}],usage:{prompt_tokens:5,completion_tokens:3,cost:0.00001},provider:'Venice'});}
 if(String(url).includes(':generateContent')){const next=geminiQueue.shift();if(next)return next();return json({candidates:[{content:{parts:[{text:'Gemini says hi.'}]},finishReason:'STOP'}]});}
 throw Error('Unexpected fetch '+url);
};
let listener;
const area={get:async keys=>{const list=keys==null?Object.keys(store):typeof keys==='string'?[keys]:Array.isArray(keys)?keys:Object.keys(keys);return structuredClone(Object.fromEntries(list.filter(k=>k in store).map(k=>[k,store[k]])));},
 set:async values=>{Object.assign(store,structuredClone(values));},remove:async keys=>{for(const k of [].concat(keys))delete store[k];},setAccessLevel:async()=>{}};
const session={};
globalThis.chrome={action:{onClicked:{addListener(){}}},runtime:{onMessage:{addListener:fn=>{listener=fn;}},openOptionsPage(){}},
 storage:{local:area,session:{get:async k=>({[k]:session[k]}),set:async v=>Object.assign(session,v),remove:async k=>{delete session[k];}},onChanged:{addListener(){}}},
 tabs:{get:async id=>({id}),query:async()=>[],sendMessage:async()=>{},onRemoved:{addListener(){}}}};
await import('../browser-extension/background.js');
const sender={tab:{id:9},url:'https://steamcommunity.com/chat/'};
const send=message=>new Promise(resolve=>listener(message,sender,resolve));
await send({type:'lease:claim'});
let turn=0;
async function reply(text,settings){Object.assign(store,settings);calls.length=0;await new Promise(r=>setTimeout(r,950));return send({type:'command',text:'ask '+text,requestId:'t'+(++turn)});}
const last=kind=>calls.filter(c=>kind==='or'?c.url.endsWith('/chat/completions'):c.url.includes(':generateContent')).at(-1);

test('every OpenRouter model has its own routing and none can use Parasail',()=>{
 assert.deepEqual(NEVER_PROVIDERS,['parasail']);
 for(const m of OPENROUTER_MODELS){const r=openRouterRequest(m);assert.equal(r.model,m.id);assert.ok(r.provider.ignore.includes('parasail'),m.key);assert.ok(r.provider.max_price,m.key+' has a price cap');}
 const venice=openRouterRequest(OPENROUTER_MODELS.find(m=>m.key==='venice'));
 assert.equal(venice.model,'cognitivecomputations/dolphin-mistral-24b-venice-edition');
 assert.deepEqual(venice.provider.only,['venice']);assert.equal(venice.provider.allow_fallbacks,false);
 assert.deepEqual(venice.provider.max_price,{prompt:0.25,completion:1.00},'listed $0.20/$0.90, capped just above');
 assert.ok(venice.temperature>0.8&&venice.presence_penalty>0&&venice.frequency_penalty>0);
 const llama=openRouterRequest(OPENROUTER_MODELS.find(m=>m.key==='fast'));assert.equal(llama.provider.order[0],'groq');assert.equal(llama.temperature,undefined,'other models keep provider defaults');
});

test('a manual choice is never swapped; smart routing only moves between Llama and Mistral',()=>{
 const hard='explain step by step why our rotations keep failing';
 assert.equal(chooseOpenRouter({brain:'venice',smartRouting:true},hard).key,'venice');
 assert.equal(chooseOpenRouter({brain:'venice',smartRouting:true},'lol').key,'venice');
 assert.equal(chooseOpenRouter({brain:'fast',smartRouting:true},'lol').key,'budget');
 assert.equal(chooseOpenRouter({brain:'budget',smartRouting:true},hard).key,'fast');
 assert.equal(chooseOpenRouter({brain:'budget'},hard).key,'budget');
 assert.equal(chooseOpenRouter({brain:'nonsense'},'').key,'fast','unknown values fall back to the old default');
 assert.equal(modelLabel({aiProvider:'openrouter',brain:'venice',smartRouting:true}),'Venice Uncensored');
 assert.equal(modelLabel({aiProvider:'gemini',geminiTextModel:'gemini-3.8-flash'}),'Gemini 3.8 Flash');
 assert.equal(modelLabel({aiProvider:'gemini'}),'Gemini 3.1 Flash-Lite','existing installs keep their model');
});

test('Settings lists exactly the models models.mjs knows',()=>{
 const html=fs.readFileSync(new URL('../browser-extension/settings.html',import.meta.url),'utf8');
 const options=id=>[...new RegExp('<select id="'+id+'">(.*?)</select>').exec(html)[1].matchAll(/value="([^"]+)"/g)].map(m=>m[1]);
 assert.deepEqual(options('brain'),OPENROUTER_MODELS.map(m=>m.key));
 assert.deepEqual(options('geminiTextModel'),GEMINI_TEXT_MODELS.map(m=>m.id));
 assert.deepEqual(GEMINI_TEXT_MODELS.map(m=>m.tier),['fast','balanced','advanced']);
 assert.match(html,/<option value="unhinged">No filter/);
});

test('real replies use the selected OpenRouter model, its routing and its sampling',async()=>{
 let r=await reply('yo what is up',{aiProvider:'openrouter',brain:'venice',smartRouting:true,streamAI:false});
 assert.equal(r.ok,true,r.error);
 let req=last('or').body;assert.equal(req.model,'cognitivecomputations/dolphin-mistral-24b-venice-edition');
 assert.deepEqual(req.provider.only,['venice']);assert.ok(req.provider.ignore.includes('parasail'));assert.equal(req.temperature,0.95);
 assert.match(req.messages[0].content,/MODEL NOTE: You run on an uncensored model/);
 r=await reply('lol nice',{brain:'fast',smartRouting:true});assert.equal(r.ok,true,r.error);
 req=last('or').body;assert.equal(req.model,'mistralai/mistral-small-3.2-24b-instruct');assert.ok(req.provider.ignore.includes('parasail'));assert.doesNotMatch(req.messages[0].content,/MODEL NOTE/);
 r=await reply('lol nice',{brain:'fast',smartRouting:false});req=last('or').body;assert.equal(req.model,'meta-llama/llama-3.3-70b-instruct');
 const c=await send({type:'connection'});assert.equal(c.model,'Llama 3.3 70B');
});

test('Venice unavailable: a clear message and no other provider or model tried',async()=>{
 orQueue=[()=>json({error:{message:'No allowed providers are available for the selected model.',code:404}},404)];
 const r=await reply('you there',{brain:'venice',smartRouting:false,streamAI:false});
 assert.equal(r.ok,false);assert.match(r.error,/Venice isn't available on OpenRouter right now/);
 assert.equal(calls.filter(c=>c.url.endsWith('/chat/completions')).length,1,'no retry with another model');
});

test('real replies use the selected Gemini model with its own thinking settings',async()=>{
 let r=await reply('who wins this round',{aiProvider:'gemini',geminiTextModel:'gemini-3.8-flash'});
 assert.equal(r.ok,true,r.error);assert.equal(r.text,'Gemini says hi.');
 let call=last('gm');assert.match(call.url,/models\/gemini-3\.8-flash:generateContent$/);
 assert.equal(call.body.generationConfig.thinkingConfig.thinkingLevel,'low','3.8 Flash has no minimal level');
 assert.ok(call.body.generationConfig.maxOutputTokens>1024,'room for its thinking');
 assert.equal(call.body.generationConfig.temperature,undefined,'Gemini 3 sampling left at defaults');
 r=await reply('gg',{geminiTextModel:'gemini-3.5-flash-lite'});call=last('gm');
 assert.match(call.url,/gemini-3\.5-flash-lite:/);assert.equal(call.body.generationConfig.thinkingConfig.thinkingLevel,'minimal');
 const c=await send({type:'connection'});assert.equal(c.model,'Gemini 3.5 Flash-Lite');
});

test('Gemini quota: a per-minute limit is retried once, a daily free-tier limit is explained and never switched',async()=>{
 const minute=()=>json({error:{code:429,message:'Resource has been exhausted',details:[{'@type':'type.googleapis.com/google.rpc.QuotaFailure',violations:[{quotaId:'GenerateRequestsPerMinutePerProjectPerModel-FreeTier'}]},{'@type':'type.googleapis.com/google.rpc.RetryInfo',retryDelay:'0.2s'}]}},429);
 geminiQueue=[minute];
 let r=await reply('round two',{aiProvider:'gemini',geminiTextModel:'gemini-3.5-flash-lite'});
 assert.equal(r.ok,true,r.error);assert.equal(calls.filter(c=>c.url.includes(':generateContent')).length,2,'one retry after Google\'s delay');
 const daily=()=>json({error:{code:429,message:'You exceeded your current quota',details:[{'@type':'type.googleapis.com/google.rpc.QuotaFailure',violations:[{quotaId:'GenerateRequestsPerDayPerProjectPerModel-FreeTier'}]},{'@type':'type.googleapis.com/google.rpc.RetryInfo',retryDelay:'41s'}]}},429);
 geminiQueue=[daily];
 r=await reply('round three',{});
 assert.equal(r.ok,false);assert.match(r.error,/free-tier limit for Gemini 3\.5 Flash-Lite is used up for today/);assert.match(r.error,/never|doesn't switch/);
 const gm=calls.filter(c=>c.url.includes(':generateContent'));assert.equal(gm.length,1);assert.match(gm[0].url,/gemini-3\.5-flash-lite/,'no other model tried');
 assert.equal(calls.some(c=>c.url.endsWith('/chat/completions')),false,'no switch to OpenRouter');
});

test('Gemini requests never end on a model turn and other errors read clearly',()=>{
 assert.deepEqual(geminiContents([{role:'system',content:'s'},{role:'user',content:'a'},{role:'assistant',content:'b'}]).map(c=>c.role),['user']);
 const body=geminiTextBody([{role:'system',content:'rules'},{role:'user',content:'hi'}],120,'gemini-3.1-flash-lite');
 assert.equal(body.generationConfig.maxOutputTokens,120);assert.equal(body.systemInstruction.parts[0].text,'rules');
 assert.match(geminiProblem(404,{error:{message:'not found'}},'gemini-3.8-flash').text,/Gemini 3\.8 Flash isn't available to this Google key/);
 assert.equal(geminiProblem(503,{},'gemini-3.8-flash').retryMs,1500);
 assert.match(openRouterProblem(402,'Insufficient credits',OPENROUTER_MODELS[0]),/out of credits/);
});

test('settings preview and model test use the selected model and real rules',async()=>{
 const {runSettingsAI}=await import('../browser-extension/settings-ai.mjs');
 calls.length=0;
 let r=await runSettingsAI({action:'preview',aiProvider:'openrouter',brain:'venice',smartRouting:true,prompt:'roast me',kind:'roast',values:{personality:'Gremlin.',roastMode:'unhinged',length:'short'}},{openrouter:'sk-or-x'});
 assert.equal(r.ok,true,r.error);assert.equal(r.model,'Venice Uncensored');assert.equal(r.servedBy,'Venice');
 const req=last('or').body;assert.equal(req.model,'cognitivecomputations/dolphin-mistral-24b-venice-edition');assert.deepEqual(req.provider.only,['venice']);
 assert.match(req.messages[0].content,/NO FILTER MODE/);assert.match(req.messages[0].content,/RULES \(highest priority/);assert.equal(req.max_tokens,80);
 r=await runSettingsAI({action:'test',aiProvider:'gemini',geminiTextModel:'gemini-3.8-flash'},{gemini:'AIza-x'});
 assert.equal(r.ok,true,r.error);assert.equal(r.model,'Gemini 3.8 Flash');assert.ok(Number.isFinite(r.ms));assert.match(last('gm').url,/gemini-3\.8-flash/);
 r=await runSettingsAI({action:'test',aiProvider:'gemini'},{});assert.equal(r.ok,false);assert.match(r.error,/No Google Gemini key/);
});

test('No filter: crude and loud, with range and hard limits',()=>{
 const g=styleGuide('unhinged');
 assert.match(g,/Swear constantly/);assert.match(g,/not every message is an insult/);assert.match(g,/answer properly first/);
 assert.match(g,/no slurs/);assert.match(g,/drop the teasing the moment someone asks/);
 assert.equal(modelStyle('fast','savage'),'');assert.match(modelStyle('venice','unhinged'),/no disclaimers/);
});

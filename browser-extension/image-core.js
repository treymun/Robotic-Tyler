// ROBOTIC TYLER: chat images (v2.34). Shared by the background (which makes the request with the key)
// and the chat side (which reads commands and keeps the limits). Classic script: sets TylerImages.
//
// Six styles, each one model the owner can change in Settings → Images:
//   OpenRouter key: fast · standard · best      (mainstream models with their companies' content rules)
//   Venice key:     vfast · vstandard · vbest   (uncensored as far as Venice allows: its own servers,
//                   safe mode off; Venice still blocks illegal content)
// A chatter types "!image PROMPT" (the default style) or "!image best PROMPT", "!image venice PROMPT"…
// Nothing is ever switched to another model or provider on its own.
(() => {
 'use strict';
 if(globalThis.TylerImages)return;
 const STYLES=Object.freeze({
  fast:{provider:'openrouter',label:'Fast',words:['fast','quick','cheap'],about:'Cheap and quick'},
  standard:{provider:'openrouter',label:'Standard',words:['standard','normal','medium'],about:'Medium price, good quality'},
  best:{provider:'openrouter',label:'Best',words:['best','hq','high'],about:'Highest quality'},
  vfast:{provider:'venice',label:'Venice fast',words:['venice','uncensored','vfast','raw'],about:'Uncensored, cheapest'},
  vstandard:{provider:'venice',label:'Venice standard',words:['vstandard','vmedium'],about:'Uncensored, medium'},
  vbest:{provider:'venice',label:'Venice best',words:['vbest','vhq'],about:'Uncensored, highest quality'}});
 // The models each style can use, with the price each provider published (per 1024×1024 image).
 // OpenRouter's figures are its own measurements (September 2026); Venice's are its price list.
 const MODELS=Object.freeze({
  openrouter:[
   {id:'black-forest-labs/flux.2-klein-4b',name:'FLUX.2 klein 4B',price:'about $0.014',styles:['fast']},
   {id:'openai/gpt-image-2',name:'GPT Image 2',price:'about $0.006–0.014 (about 12 s)',styles:['fast','standard']},
   {id:'google/gemini-nano-banana-2.1',name:'Nano Banana 2.1 (Google)',price:'about $0.034',styles:['standard']},
   {id:'qwen/qwen-image-3',name:'Qwen Image 3',price:'about $0.03',styles:['standard']},
   {id:'black-forest-labs/flux.2-pro',name:'FLUX.2 pro',price:'about $0.03',styles:['standard','best']},
   {id:'sourceful/riverflow-v2.5-pro',name:'Riverflow 2.5 pro',price:'about $0.06–0.13',styles:['best']},
   {id:'google/gemini-3-pro-image',name:'Nano Banana Pro (Google)',price:'about $0.134',styles:['best']}],
  venice:[
   {id:'lustify-v8',name:'Lustify v8 (adult-focused, photoreal)',price:'$0.01',styles:['vfast']},
   {id:'z-image-turbo',name:'Z-Image Turbo',price:'$0.01',styles:['vfast']},
   {id:'wai-Illustrious',name:'Anime (WAI Illustrious)',price:'$0.01',styles:['vfast','vstandard']},
   {id:'chroma',name:'Chroma',price:'$0.01',styles:['vfast','vstandard']},
   {id:'krea-2-turbo',name:'Krea 2 Turbo',price:'$0.04',styles:['vstandard']},
   {id:'hunyuan-image-v3',name:'Hunyuan Image 3.0',price:'$0.09',styles:['vbest']}]});
 const DEFAULT_MODEL=Object.freeze({fast:'black-forest-labs/flux.2-klein-4b',standard:'google/gemini-nano-banana-2.1',best:'sourceful/riverflow-v2.5-pro',vfast:'lustify-v8',vstandard:'krea-2-turbo',vbest:'hunyuan-image-v3'});
 const COOLDOWNS=Object.freeze([0,15,30,60,120,300,600,1800,3600]),PER_PERSON=Object.freeze([1,2,3,5,10,20,50,0]),PER_SESSION=Object.freeze([3,5,10,20,50,100,200,0]);
 const DEFAULTS=Object.freeze({enabled:false,access:'everyone',allowedIDs:'',defaultStyle:'fast',styles:{fast:true,standard:true,best:true,vfast:false,vstandard:false,vbest:false},cooldownSec:120,perPerson:5,perSession:20,spoilerVenice:true,models:{...DEFAULT_MODEL}});
 const idOk={openrouter:v=>/^[a-z0-9_.-]+\/[a-z0-9_.:-]{1,80}$/i.test(v),venice:v=>/^[a-z0-9][a-z0-9_.-]{1,60}$/i.test(v)};
 /** Saved settings → a complete, safe config (unknown or broken values fall back to the defaults). */
 function config(raw){
  const r=raw&&typeof raw==='object'?raw:{},out={...DEFAULTS,styles:{...DEFAULTS.styles},models:{...DEFAULT_MODEL}};
  out.enabled=r.enabled===true;out.access=r.access==='selected'?'selected':'everyone';
  out.allowedIDs=String(r.allowedIDs||'').split(/[\s,]+/).filter(id=>/^7656119\d{10}$/.test(id)).slice(0,100).join('\n');
  for(const k of Object.keys(STYLES))if(typeof r.styles?.[k]==='boolean')out.styles[k]=r.styles[k];
  for(const k of Object.keys(STYLES)){const v=String(r.models?.[k]||'').trim();if(v&&idOk[STYLES[k].provider](v))out.models[k]=v;}
  if(STYLES[r.defaultStyle])out.defaultStyle=r.defaultStyle;
  if(COOLDOWNS.includes(Number(r.cooldownSec)))out.cooldownSec=Number(r.cooldownSec);
  if(PER_PERSON.includes(Number(r.perPerson)))out.perPerson=Number(r.perPerson);
  if(PER_SESSION.includes(Number(r.perSession)))out.perSession=Number(r.perSession);
  out.spoilerVenice=r.spoilerVenice!==false;
  return out;
 }
 /** "!image best a cat in a smoke grenade" → {style:'best',prompt:'a cat…'}; "!image help" → {help:true}. */
 function parse(text,cfg=DEFAULTS){
  const m=/^\s*!(?:image|img|draw)(?:\s+([\s\S]*))?$/i.exec(String(text||''));if(!m)return null;
  let rest=String(m[1]||'').replace(/\s+/g,' ').trim();if(!rest||/^(?:help|\?)$/i.test(rest))return {help:true};
  const first=rest.split(' ')[0].toLowerCase();let style=null;
  for(const [k,s] of Object.entries(STYLES))if(s.words.includes(first)){style=k;break;}
  if(style)rest=rest.slice(first.length).trim();
  if(!rest)return {help:true,style};
  return {style:style||cfg.defaultStyle,prompt:rest.slice(0,600),named:!!style};
 }
 function help(cfg){const on=Object.entries(STYLES).filter(([k])=>cfg.styles[k]).map(([k,s])=>s.words[0]+(k===cfg.defaultStyle?' (default)':''));return '🎨 Images: !image PROMPT'+(on.length>1?' · styles: !image '+on.join(' / !image ')+' PROMPT':'')+'.';}
 const clean=s=>String(s||'').replace(/[\u0000-\u001f\u007f]/g,' ').replace(/\s+/g,' ').trim();
 /** The request for a style: where it goes and the JSON body. Never Parasail (OpenRouter routing). */
 function request(cfg,style,prompt,never=['parasail']){
  const s=STYLES[style];if(!s)throw Error('Unknown image style.');const model=cfg.models[style]||DEFAULT_MODEL[style],text=clean(prompt).slice(0,600);
  if(text.length<2)throw Error('Describe the picture after !image.');
  if(s.provider==='openrouter')return {provider:'openrouter',model,url:'https://openrouter.ai/api/v1/images',body:{model,prompt:text,n:1,aspect_ratio:'1:1',provider:{ignore:[...never]}}};
  // Venice: safe mode off (it blurs adult content otherwise); JPEG for a small Steam upload.
  const body={model,prompt:text,safe_mode:false,format:'jpeg',variants:1};
  if(!/^qwen-image/i.test(model)){body.width=1024;body.height=1024;}else body.aspect_ratio='1:1';
  return {provider:'venice',model,url:'https://api.venice.ai/api/v1/image/generate',body};
 }
 /** A provider's reply → {data (base64), type} or an explanation. */
 function result(provider,json){
  if(provider==='openrouter'){const item=json?.data?.[0];const data=item?.b64_json;if(typeof data!=='string'||!data)throw Error('The image model returned no picture.');return {data,type:/^image\/(png|jpeg|webp|gif)$/.test(item.media_type||'')?item.media_type:'image/png',cost:typeof json?.usage?.cost==='number'?json.usage.cost:null};}
  const data=json?.images?.[0];if(typeof data!=='string'||!data)throw Error(json?.content_policy_violation_count?'Venice refused that prompt (content policy).':'Venice returned no picture.');return {data,type:'image/jpeg',cost:null};
 }
 function price(style,id){const m=MODELS[STYLES[style]?.provider]?.find(x=>x.id===id);return m?m.price:'price not listed';}
 globalThis.TylerImages=Object.freeze({STYLES,MODELS,DEFAULT_MODEL,DEFAULTS,COOLDOWNS,PER_PERSON,PER_SESSION,config,parse,help,request,result,price});
})();

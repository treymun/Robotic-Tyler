'use strict';
// v2.15: the Control Center and the Native Steam Companion (Voice Studio) became one app.
//
// This app keeps the Control Center's data folder, so Control Center users keep everything as is.
// The Voice Studio kept its own settings in %APPDATA%\RoboticTylerNativeSteamCompanion\Settings.
// On first start this imports them:
//  - settings only the Voice Studio had are copied in;
//  - settings both apps had with different values are NOT overwritten silently: the owner picks
//    which app's values to keep (or decides later);
//  - API keys are decrypted with the Voice Studio's own Windows-protected key (DPAPI through the
//    audio helper), used only when this app has no key of that kind or the owner chooses them.
// Nothing in the Voice Studio's folder is changed or deleted.
const fs=require('node:fs/promises'),path=require('node:path'),crypto=require('node:crypto');

const SECRET_KEYS=['openrouterKey','geminiKey'];
// Values that are history or bookkeeping, not choices to import.
const SKIP=new Set(['usage','settingsDraft','conversationMemory','friendConversationMemory','callbackState','activeBotTab','voiceImport','v22Latency']);
const LABELS={aiProvider:'AI provider',personality:'Personality',length:'Reply length',brain:'Conversation model',speechVoice:'Grok voice',roastMode:'Roast intensity',talkativeness:'Talkativeness',uiTheme:'Theme',openrouterKey:'OpenRouter key',geminiKey:'Google AI key',noiseLevel:'Noise filter'};
const label=k=>LABELS[k]||k;
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);

async function readJson(file){try{return JSON.parse(await fs.readFile(file,'utf8'));}catch{return null;}}

/** Chromium/Electron safeStorage on Windows: AES-256-GCM ("v10") with a key from Local State that DPAPI protects. */
async function oldKeyDecrypter(dir,unprotect){
 const state=await readJson(path.join(dir,'Local State'));const wrapped=state?.os_crypt?.encrypted_key;if(!wrapped)return null;
 const raw=Buffer.from(wrapped,'base64');if(raw.subarray(0,5).toString('latin1')!=='DPAPI')return null;
 let key;try{key=Buffer.from(await unprotect(raw.subarray(5).toString('base64')),'base64');}catch{return null;}
 if(key.length!==32)return null;
 return b64=>decryptV10(key,b64);
}
function decryptV10(key,b64){
 const blob=Buffer.from(String(b64||''),'base64');if(blob.length<3+12+16||blob.subarray(0,3).toString('latin1')!=='v10')return null;
 try{const nonce=blob.subarray(3,15),tag=blob.subarray(blob.length-16),body=blob.subarray(15,blob.length-16);
  const d=crypto.createDecipheriv('aes-256-gcm',key,nonce);d.setAuthTag(tag);return Buffer.concat([d.update(body),d.final()]).toString('utf8');}catch{return null;}
}

async function findLocal(oldDir,name){
 const dir=path.join(oldDir,'Local Storage','leveldb');let files=[];try{files=(await fs.readdir(dir)).filter(f=>/\.(?:log|ldb)$/.test(f));}catch{return null;}
 let found=null;
 for(const f of files.sort()){try{const text=(await fs.readFile(path.join(dir,f))).toString('latin1');const re=new RegExp(name+'[\\s\\S]{0,12}?\\x01([A-Za-z0-9+/=]{16,800})','g');let m;while((m=re.exec(text)))found=m[1];}catch{}}
 return found;
}
/** What importing the Voice Studio's settings would change. */
async function planImport({oldDir,vault,allowed,unprotect}){
 const disk=await readJson(path.join(oldDir,'Settings','settings.json'));
 if(!disk||typeof disk!=='object')return {found:false};
 const theirs={};
 for(const [k,v] of Object.entries(disk.data||{}))if(allowed.has(k)&&!SKIP.has(k)&&!SECRET_KEYS.includes(k))theirs[k]=v;
 const decrypt=Object.keys(disk.secrets||{}).length?await oldKeyDecrypter(oldDir,unprotect):null;
 const unreadable=[];
 for(const k of SECRET_KEYS){if(!disk.secrets?.[k])continue;const v=decrypt?.(disk.secrets[k]);if(v)theirs[k]=v;else unreadable.push(k);}
 // The Voice Studio kept its two device choices in its page storage (LevelDB). Plain records are
 // readable as text; anything that can't be found is simply chosen again in Settings → Voice.
 // Listening consent is never imported: it is given again in this app.
 for(const [k,name] of [['voiceOutputDevice','tylerOutputId'],['voiceListenDevice','tylerListenId']]){const v=await findLocal(oldDir,name);if(v)theirs[k]=v;}
 const ours=await vault.get([...Object.keys(theirs)]);
 const fresh=[],conflicts=[];
 for(const [k,v] of Object.entries(theirs)){if(!(k in ours)||ours[k]===''||ours[k]==null)fresh.push(k);else if(!same(ours[k],v))conflicts.push(k);}
 return {found:true,theirs,fresh,conflicts,unreadable};
}

/**
 * Runs once. ask(plan) shows the choice when there are conflicts and resolves to 'ours',
 * 'theirs' or 'later' ('later' asks again next start).
 */
async function importVoiceStudio({oldDir,vault,allowed,unprotect,ask,log=()=>{}}){
 const done=(await vault.get('voiceImport')).voiceImport;if(done?.at)return {status:'done-before'};
 const plan=await planImport({oldDir,vault,allowed,unprotect});
 if(!plan.found){await vault.set({voiceImport:{at:Date.now(),status:'nothing-to-import'}});return {status:'none'};}
 const values=Object.fromEntries(plan.fresh.map(k=>[k,plan.theirs[k]]));
 let choice='ours';
 if(plan.conflicts.length){choice=await ask({...plan,labels:plan.conflicts.map(label)});if(choice==='later'){if(Object.keys(values).length)await vault.set(values);log('Settings import','Voice Studio import postponed');return {status:'later',imported:Object.keys(values)};}}
 if(choice==='theirs')for(const k of plan.conflicts)values[k]=plan.theirs[k];
 await vault.set({...values,voiceImport:{at:Date.now(),status:'imported',choice,imported:Object.keys(values),unreadable:plan.unreadable}});
 log('Settings import','Imported '+Object.keys(values).length+' Voice Studio settings ('+choice+')');
 return {status:'imported',choice,imported:Object.keys(values),unreadable:plan.unreadable};
}
module.exports={planImport,importVoiceStudio,decryptV10,label,SECRET_KEYS};

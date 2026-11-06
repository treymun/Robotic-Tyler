'use strict';
const fsp=require('node:fs/promises'),path=require('node:path');
// Saving writes settings.json.<uuid>.tmp and renames it over settings.json, so a crash never leaves a
// half-written settings file. v2.39: on Windows an antivirus scan or another reader can hold either file
// for a moment (EPERM, EBUSY, EACCES), so the rename (and removing the temporary file after a failed save)
// is retried briefly; a temporary file left by a save that never finished (the app was closed or killed
// mid-save; the owner's PC had about 45, many of them empty) is deleted at the next start once it's over
// a minute old.
const BUSY=['EPERM','EBUSY','EACCES'],RETRY_MS=[50,100,200,400,800],STALE_MS=60000,TEMP=/^settings\.json\..+\.tmp$/;
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function retried(fn,delays=RETRY_MS){for(let attempt=0;;attempt++){try{return await fn();}catch(error){if(attempt>=delays.length||!BUSY.includes(error.code))throw error;await sleep(delays[attempt]);}}}
class Vault {
 /** @param {{fs?:object,retryMs?:number[],staleMs?:number,now?:()=>number}} [o]  tests pass their own fs and timings */
 constructor(directory,crypto,{fs=fsp,retryMs=RETRY_MS,staleMs=STALE_MS,now=Date.now}={}){this.directory=directory;this.file=path.join(directory,'settings.json');this.crypto=crypto;this.queue=Promise.resolve();this.data=null;Object.assign(this,{fs,retryMs,staleMs,now});this.swept=false;}
 /** Deletes settings.json.*.tmp files older than a minute (saves that never finished). Returns how many went. */
 async sweep(){let removed=0,names;try{names=await this.fs.readdir(this.directory);}catch{return 0;}
  for(const name of names){if(!TEMP.test(name))continue;const file=path.join(this.directory,name);
   try{const st=await this.fs.stat(file);if(!st.isFile()||this.now()-st.mtimeMs<this.staleMs)continue;await retried(()=>this.fs.unlink(file),this.retryMs);removed++;}catch{}}
  return removed;}
 async load(){if(this.data)return;if(!this.swept){this.swept=true;await this.sweep();}let disk;try{disk=JSON.parse(await this.fs.readFile(this.file,'utf8'));}catch(error){if(error.code!=='ENOENT')throw Error('Local settings could not be read. Your existing file was left untouched.');disk={data:{},secrets:{}};}const loaded={...(disk.data||{})};delete loaded.openrouterKey;delete loaded.geminiKey;delete loaded.speechKey;for(const k of ['premiumizeKey','torboxKey'])delete loaded[k]; /* keys of the removed Game Request Hub */for(const [key,value]of Object.entries(disk.secrets||{})){if(!['openrouterKey','geminiKey','speechKey'].includes(key))continue;try{loaded[key]=this.crypto.decryptString(Buffer.from(value,'base64'));}catch{throw Error('Windows could not unlock the saved API key. Open settings and remove the encrypted key file only if you want to reset it.');}}this.data=loaded;}
 run(fn){const task=this.queue.then(async()=>{await this.load();return fn();});this.queue=task.catch(()=>{});return task;}
 async persist(next){const data={...next},secrets={};for(const key of ['openrouterKey','geminiKey','speechKey'])if(data[key]){if(!this.crypto.isEncryptionAvailable())throw Error('Windows key encryption is unavailable. The key was not saved.');secrets[key]=this.crypto.encryptString(String(data[key])).toString('base64');delete data[key];}else delete data[key];await this.fs.mkdir(this.directory,{recursive:true});const tmp=this.file+'.'+require('node:crypto').randomUUID()+'.tmp';
 try{
  await this.fs.writeFile(tmp,JSON.stringify({version:1,data,secrets}),{flag:'wx'});
  await retried(()=>this.fs.rename(tmp,this.file),this.retryMs);
 }catch(error){
  // The temporary file goes too (retried: the same scan that held the rename may hold it). If it still
  // can't be removed, the next start's sweep() deletes it.
  await retried(()=>this.fs.unlink(tmp),this.retryMs).catch(()=>{});
  throw Error('Could not save settings in the Windows app data folder ('+(error.code||'write failed')+').');}this.data=next;}
 get(keys){return this.run(()=>{const names=keys===null||keys===undefined?Object.keys(this.data):typeof keys==='string'?[keys]:Array.isArray(keys)?keys:Object.keys(keys);return structuredClone(Object.fromEntries(names.filter(k=>k in this.data).map(k=>[k,this.data[k]])));});}
 set(values){return this.run(()=>this.persist({...this.data,...structuredClone(values)}));}
 remove(keys){return this.run(()=>{const next={...this.data};for(const key of Array.isArray(keys)?keys:[keys])delete next[key];return this.persist(next);});}
}
function memoryStorage(){const data={};return {get:async keys=>{const names=typeof keys==='string'?[keys]:keys||Object.keys(data);return structuredClone(Object.fromEntries(names.filter(k=>k in data).map(k=>[k,data[k]])));},set:async values=>Object.assign(data,structuredClone(values)),remove:async keys=>{for(const key of Array.isArray(keys)?keys:[keys])delete data[key];}};}
module.exports={Vault,memoryStorage};

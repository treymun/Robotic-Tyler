'use strict';
const fs=require('node:fs/promises'),path=require('node:path');
class Vault {
 constructor(directory,crypto){this.directory=directory;this.file=path.join(directory,'settings.json');this.crypto=crypto;this.queue=Promise.resolve();this.data=null;}
 async load(){if(this.data)return;let disk;try{disk=JSON.parse(await fs.readFile(this.file,'utf8'));}catch(error){if(error.code!=='ENOENT')throw Error('Local settings could not be read. Your existing file was left untouched.');disk={data:{},secrets:{}};}const loaded={...(disk.data||{})};delete loaded.openrouterKey;delete loaded.geminiKey;delete loaded.speechKey;for(const k of ['premiumizeKey','torboxKey'])delete loaded[k]; /* keys of the removed Game Request Hub */for(const [key,value]of Object.entries(disk.secrets||{})){if(!['openrouterKey','geminiKey','speechKey'].includes(key))continue;try{loaded[key]=this.crypto.decryptString(Buffer.from(value,'base64'));}catch{throw Error('Windows could not unlock the saved API key. Open settings and remove the encrypted key file only if you want to reset it.');}}this.data=loaded;}
 run(fn){const task=this.queue.then(async()=>{await this.load();return fn();});this.queue=task.catch(()=>{});return task;}
 async persist(next){const data={...next},secrets={};for(const key of ['openrouterKey','geminiKey','speechKey'])if(data[key]){if(!this.crypto.isEncryptionAvailable())throw Error('Windows key encryption is unavailable. The key was not saved.');secrets[key]=this.crypto.encryptString(String(data[key])).toString('base64');delete data[key];}else delete data[key];await fs.mkdir(this.directory,{recursive:true});const tmp=this.file+'.'+require('node:crypto').randomUUID()+'.tmp';
 try{
  await fs.writeFile(tmp,JSON.stringify({version:1,data,secrets}),{flag:'wx'});
  for(let attempt=0;;attempt++){
   try{await fs.rename(tmp,this.file);break;}catch(error){if(attempt===4||!['EPERM','EACCES','EBUSY'].includes(error.code))throw error;await new Promise(resolve=>setTimeout(resolve,100*(attempt+1)));}
  }
 }catch(error){await fs.unlink(tmp).catch(()=>{});throw Error('Could not save settings in the Windows app data folder ('+(error.code||'write failed')+').');}this.data=next;}
 get(keys){return this.run(()=>{const names=keys===null||keys===undefined?Object.keys(this.data):typeof keys==='string'?[keys]:Array.isArray(keys)?keys:Object.keys(keys);return structuredClone(Object.fromEntries(names.filter(k=>k in this.data).map(k=>[k,this.data[k]])));});}
 set(values){return this.run(()=>this.persist({...this.data,...structuredClone(values)}));}
 remove(keys){return this.run(()=>{const next={...this.data};for(const key of Array.isArray(keys)?keys:[keys])delete next[key];return this.persist(next);});}
}
function memoryStorage(){const data={};return {get:async keys=>{const names=typeof keys==='string'?[keys]:keys||Object.keys(data);return structuredClone(Object.fromEntries(names.filter(k=>k in data).map(k=>[k,data[k]])));},set:async values=>Object.assign(data,structuredClone(values)),remove:async keys=>{for(const key of Array.isArray(keys)?keys:[keys])delete data[key];}};}
module.exports={Vault,memoryStorage};


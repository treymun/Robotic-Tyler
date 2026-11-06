// v2.39: the desktop app's settings file (app/vault.cjs, %LOCALAPPDATA%\RoboticTylerHydraCloudV12\Data\Companion).
// A save writes settings.json.<uuid>.tmp and renames it over settings.json. On the owner's PC about 45 of
// those temporary files were left behind, many of them empty. Now: a failed save removes its temporary
// file, the rename is retried briefly when Windows says the file is busy (EPERM, EBUSY, EACCES: an
// antivirus scan or another reader), and leftovers older than a minute are deleted at the next start.
// The Windows errors are simulated with a wrapped fs; everything else is the real file system.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';import fsp from 'node:fs/promises';import path from 'node:path';import os from 'node:os';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const {Vault}=require('../app/vault.cjs');
const made=[];const tmp=()=>{const d=fs.mkdtempSync(path.join(os.tmpdir(),'tyler-vault-'));made.push(d);return d;};
test.after(()=>{for(const d of made)fs.rmSync(d,{recursive:true,force:true});});
const crypto={isEncryptionAvailable:()=>true,encryptString:s=>Buffer.from('enc:'+s),decryptString:b=>String(b).replace(/^enc:/,'')};
const temps=dir=>fs.readdirSync(dir).filter(n=>/^settings\.json\..+\.tmp$/.test(n));
const busy=code=>Object.assign(Error(code+': operation not permitted, rename'),{code});
/** The real fs/promises with chosen calls failing first (e.g. {rename:['EPERM','EPERM']}). */
function flaky(plan){const calls={rename:0,unlink:0,writeFile:0};
 const fail=(op,...a)=>{calls[op]++;const code=plan[op]?.shift();if(code)return Promise.reject(busy(code));return fsp[op](...a);};
 return {calls,fs:{...fsp,rename:(...a)=>fail('rename',...a),unlink:(...a)=>fail('unlink',...a),writeFile:async(...a)=>{calls.writeFile++;const code=plan.writeFile?.shift();if(code){await fsp.writeFile(a[0],'',{flag:'wx'});throw busy(code);}return fsp.writeFile(...a);}}};}
const quick=[1,1,1,1,1];

test('a save writes the file and leaves no temporary file behind; keys are stored encrypted',async()=>{
 const dir=tmp(),v=new Vault(dir,crypto);
 for(let i=0;i<20;i++)await v.set({usage:{requests:i},openrouterKey:'sk-or-test'});
 assert.deepEqual(temps(dir),[]);const disk=JSON.parse(fs.readFileSync(path.join(dir,'settings.json'),'utf8'));
 assert.equal(disk.data.usage.requests,19);assert.equal(disk.data.openrouterKey,undefined);assert.match(Buffer.from(disk.secrets.openrouterKey,'base64').toString(),/^enc:sk-or-test$/);
 assert.equal((await new Vault(dir,crypto).get('openrouterKey')).openrouterKey,'sk-or-test');
});
test('Windows says the file is busy (EPERM, EBUSY, EACCES): the rename is retried briefly and the save goes through',async()=>{
 for(const code of ['EPERM','EBUSY','EACCES']){
  const dir=tmp(),f=flaky({rename:[code,code,code]}),v=new Vault(dir,crypto,{fs:f.fs,retryMs:quick});
  await v.set({personality:'Chill '+code});
  assert.equal(f.calls.rename,4,'three busy answers, then it worked');assert.deepEqual(temps(dir),[]);
  assert.equal(JSON.parse(fs.readFileSync(path.join(dir,'settings.json'),'utf8')).data.personality,'Chill '+code);
 }
});
test('a save that fails removes its temporary file (retried too) and keeps the old settings',async()=>{
 const dir=tmp();await new Vault(dir,crypto).set({personality:'Old'});
 // Busy for longer than the retries: the save fails with the reason; the temporary file is removed even
 // though the first try to remove it was refused as well.
 const f=flaky({rename:['EBUSY','EBUSY','EBUSY','EBUSY','EBUSY','EBUSY','EBUSY'],unlink:['EPERM']}),v=new Vault(dir,crypto,{fs:f.fs,retryMs:quick});
 await assert.rejects(v.set({personality:'New'}),/Could not save settings in the Windows app data folder \(EBUSY\)/);
 assert.equal(f.calls.rename,6,'one try and five retries, then it gives up');assert.equal(f.calls.unlink,2);
 assert.deepEqual(temps(dir),[]);assert.equal(JSON.parse(fs.readFileSync(path.join(dir,'settings.json'),'utf8')).data.personality,'Old');
 assert.equal((await v.get('personality')).personality,'Old','what Tyler uses is still what’s on disk');
 // Another error (not "busy") isn't retried, and its temporary file goes too.
 const g=flaky({rename:['ENOSPC']}),w=new Vault(dir,crypto,{fs:g.fs,retryMs:quick});
 await assert.rejects(w.set({personality:'Full'}),/\(ENOSPC\)/);assert.equal(g.calls.rename,1);assert.deepEqual(temps(dir),[]);
 // Writing the temporary file itself fails part-way (it exists, empty): removed.
 const h=flaky({writeFile:['ENOSPC']}),x=new Vault(dir,crypto,{fs:h.fs,retryMs:quick});
 await assert.rejects(x.set({personality:'Empty'}),/\(ENOSPC\)/);assert.deepEqual(temps(dir),[]);
});
test('at start-up, temporary files older than a minute are deleted (left by saves that never finished); newer ones and other files stay',async()=>{
 const dir=tmp();fs.writeFileSync(path.join(dir,'settings.json'),JSON.stringify({version:1,data:{personality:'Kept'},secrets:{}}));
 const old=[];for(let i=0;i<45;i++){const n='settings.json.'+crypto_uuid(i)+'.tmp';fs.writeFileSync(path.join(dir,n),i%3?'':'{"version":1');old.push(n);}
 const past=new Date(Date.now()-5*60000);for(const n of old)fs.utimesSync(path.join(dir,n),past,past);
 fs.writeFileSync(path.join(dir,'settings.json.11111111-2222-3333-4444-555555555555.tmp'),'');// a save from just now
 fs.writeFileSync(path.join(dir,'notes.tmp'),'x');fs.utimesSync(path.join(dir,'notes.tmp'),past,past);
 fs.mkdirSync(path.join(dir,'settings.json.folder.tmp'));fs.utimesSync(path.join(dir,'settings.json.folder.tmp'),past,past);
 const f=flaky({unlink:['EBUSY']}),v=new Vault(dir,crypto,{fs:f.fs,retryMs:quick});
 assert.equal((await v.get('personality')).personality,'Kept');
 assert.deepEqual(temps(dir).sort(),['settings.json.11111111-2222-3333-4444-555555555555.tmp','settings.json.folder.tmp'].sort(),'the 45 old ones went (one after a busy retry); the new one and a folder stay');
 assert.ok(fs.existsSync(path.join(dir,'notes.tmp')),'other files aren’t touched');
 // Once per start: later reads don't sweep again.
 fs.writeFileSync(path.join(dir,'settings.json.aaaaaaaa-0000-0000-0000-000000000000.tmp'),'');fs.utimesSync(path.join(dir,'settings.json.aaaaaaaa-0000-0000-0000-000000000000.tmp'),past,past);
 await v.get('personality');assert.ok(fs.existsSync(path.join(dir,'settings.json.aaaaaaaa-0000-0000-0000-000000000000.tmp')));
 assert.equal(await new Vault(dir,crypto).sweep(),1,'the next start removes it');
});
test('a missing folder or an unreadable file: the sweep does nothing and loading behaves as before',async()=>{
 const dir=path.join(tmp(),'not-yet');const v=new Vault(dir,crypto);
 assert.deepEqual(await v.get('personality'),{});await v.set({personality:'First'});assert.deepEqual(temps(dir),[]);
 const bad=tmp();fs.writeFileSync(path.join(bad,'settings.json'),'{broken');
 await assert.rejects(new Vault(bad,crypto).get('x'),/could not be read\. Your existing file was left untouched/);
});
function crypto_uuid(i){const h=(i+1).toString(16).padStart(8,'0');return h+'-0000-4000-8000-'+h.padStart(12,'0');}

import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('../browser-extension/background.js',import.meta.url),'utf8');
function setup(){let owner=true;const data={openrouterKey:'fixture-secret'};const box={Date,lease:{check:async()=>owner},chrome:{storage:{local:{get:async()=>data,set:async values=>Object.assign(data,values)}}}};const begin=source.indexOf('async function handle('),end=source.indexOf('chrome.runtime.onMessage.addListener',begin);vm.runInNewContext(source.slice(begin,end)+';globalThis.call=handle;',box);return {data,owner:value=>{owner=value;},call:(values={},url='https://steamcommunity.com/chat/')=>box.call({type:'moderation:settings',groupId:'12345',...values},{tab:{id:1},url})};}

test('moderation opt-in is per group, defaults off and returns no credentials',async()=>{
 const f=setup();assert.equal((await f.call()).enabled,false);assert.equal((await f.call({enabled:true})).enabled,true);assert.equal((await f.call({groupId:'999'})).enabled,false);
 const r=await f.call();assert.equal(r.openrouterKey,undefined);assert.deepEqual(Object.keys(r).sort(),['enabled','stopped']);assert.equal((await f.call({enabled:false})).enabled,false);
});
test('moderation settings require the active Steam tab and respect emergency stop',async()=>{
 const f=setup();f.owner(false);await assert.rejects(f.call({enabled:true}),/Another Steam/);f.owner(true);
 await assert.rejects(f.call({},'https://example.org/'),/Only Steam/);await assert.rejects(f.call({enabled:'true'}),/Invalid/);await assert.rejects(f.call({groupId:'bad'}),/Connect a Steam/);
 f.data.v22EmergencyStop=true;await assert.rejects(f.call({enabled:true}),/Emergency stop/);assert.equal((await f.call()).enabled,false);
});

test('admin enablement is independent and logs are bounded, scoped and contain no message text or credentials',async()=>{
 const f=setup();await f.call({enabled:true});assert.equal((await f.call({type:'admin:settings'})).enabled,false);await f.call({type:'admin:settings',enabled:true});await f.call({enabled:false});assert.equal((await f.call({type:'admin:settings'})).enabled,true);
 for(let i=0;i<155;i++)await f.call({type:'admin:log',event:{kind:'mute',status:'confirmed',targetName:'Alex\nName',targetId:'76561197960265731',message:'private message',apiKey:'secret'}});
 const log=await f.call({type:'admin:log'});assert.equal(log.events.length,50);assert.equal(f.data.steamAdminLog.length,150);assert.equal(log.events[0].targetName,'Alex Name');assert.equal(log.events[0].message,undefined);assert.equal(log.events[0].apiKey,undefined);
 assert.equal((await f.call({type:'admin:log',groupId:'999'})).events.length,0);f.owner(false);await assert.rejects(f.call({type:'admin:log'}),/Another Steam/);
});

test('vote mute is a separate per-group opt-in and cannot enable during emergency stop',async()=>{
 const f=setup();assert.equal((await f.call({type:'moderation:mute-settings'})).enabled,false);await f.call({enabled:true});assert.equal((await f.call({type:'moderation:mute-settings'})).enabled,false);await f.call({type:'moderation:mute-settings',enabled:true});await f.call({enabled:false});assert.equal((await f.call({type:'moderation:mute-settings'})).enabled,true);assert.equal((await f.call({type:'moderation:mute-settings',groupId:'99999'})).enabled,false);f.data.v22EmergencyStop=true;await assert.rejects(f.call({type:'moderation:mute-settings',enabled:true}),/Emergency stop/);
});

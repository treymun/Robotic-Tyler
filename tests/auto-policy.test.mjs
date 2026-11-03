import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';

const ctx={globalThis:{}};
vm.runInNewContext(readFileSync(new URL('../browser-extension/auto-policy.js',import.meta.url),'utf8'),ctx);
const Policy=ctx.globalThis.TylerAutoPolicy;
const textPolicy=()=>{const p=new Policy();p.enabled=true;p.people=0;return p;};

test('text replies keep going past 60 in one start',()=>{
 const p=textPolicy();let now=0;
 for(let i=0;i<150;i++){now+=10000;assert.equal(p.begin('text',now),true,'reply '+(i+1)+' accepted');p.finish(true,'text');}
 assert.equal(p.enabled,true);assert.equal(p.sent,150);assert.equal(p.voiceSent,0);
});

test('spoken replies still stop after the limit',()=>{
 const p=new Policy();p.enabled=true;p.people=2;let now=0;
 for(let i=0;i<60;i++){now+=5000;assert.equal(p.begin('voice',now),true);p.finish(true,'voice');}
 assert.equal(p.enabled,false);assert.equal(p.voiceSent,60);
});

test('one reply in flight at a time, and failures do not count',()=>{
 const p=textPolicy();
 assert.equal(p.begin('text',10000),true);assert.equal(p.begin('text',20000),false,'busy');
 p.finish(false,'text');assert.equal(p.sent,0);
 assert.equal(p.begin('text',30000),true);
});

test('a chat flood stretches the text cooldown instead of stopping',()=>{
 const p=textPolicy();
 assert.equal(p.cooldown,2200);p.flood=true;assert.equal(p.cooldown,6000);
 p.lastDirect=true;assert.equal(p.cooldown,6000);p.speed='cautious';assert.equal(p.cooldown,6000);
 p.people=1;assert.equal(p.cooldown,1500,'voice pacing unchanged');
 p.people=0;p.flood=false;p.lastDirect=false;p.speed='balanced';assert.equal(p.cooldown,2200);
});

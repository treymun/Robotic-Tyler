import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {Element,message} from './helpers/message-dom.mjs';
const source=f=>readFileSync(new URL('../browser-extension/'+f,import.meta.url),'utf8');
function reader(){const box={URL,Event};vm.runInNewContext(source('identity.js'),box);vm.runInNewContext(source('trivia-identity.js'),box);return box;}

test('screenshot speakerName class and sibling avatar account work through both shared APIs',()=>{
 const box=reader(),g=message('Randy Simpdick','123456');
 const person=box.TylerIdentity.speaker(g.body,g.region);assert.equal(person.name,'Randy Simpdick');assert.equal(person.id,String(76561197960265728n+123456n));
 assert.equal(box.TylerTriviaIdentity.identify(g.body,g.region).id,person.id);
 assert.equal(box.TylerTriviaIdentity.identifyAccount(g.body,g.region).id,person.id);
 assert.equal(box.TylerIdentity.speaker(g.row,g.region).id,person.id,'selecting a whole message row still reads its author header');
});

test('name-only speakerName labels work without turning names into counted accounts',()=>{
 const box=reader(),g=message('Randy Simpdick',null);
 assert.equal(box.TylerIdentity.identify(g.body,g.region).name,'Randy Simpdick');
 assert.equal(box.TylerIdentity.speaker(g.body,g.region),null);
 assert.equal(box.TylerIdentity.valid(box.TylerIdentity.identify(g.body,g.region)),null);
 assert.match(box.TylerIdentity.instruction(box.TylerIdentity.identify(g.body,g.region)),/account identity is unverified/);
});

test('message author labels do not borrow mentioned names, profile links, quotes or another row',()=>{
 const box=reader(),g=message('Alex','123456');const mentioned=new Element('',{href:'https://steamcommunity.com/profiles/76561198000000009'},'Sam');mentioned.tagName='a';g.body.append(mentioned,new Element('MessageQuote').append(new Element('speakerName',{},'Other person')));
 assert.equal(box.TylerIdentity.speaker(g.body,g.region).id,String(76561197960265728n+123456n));
 const sam=message('Sam','654321');g.region.append(sam.row);assert.equal(box.TylerIdentity.speaker(sam.body,g.region).name,'Sam');
 const unidentified=new Element('msg_Text',{},'Alex said B');g.region.append(unidentified);assert.equal(box.TylerIdentity.identify(unidentified,g.region),null);
});

test('name and ID in separate wrappers, repeated headers and grouped messages keep the right author',()=>{
 const box=reader(),g=message('Alex','123456');g.header.parentElement.append(new Element('speakerName',{},'Alex'));
 const second=new Element('msg_Text',{},'Another message');g.row.append(new Element('messageWrapper').append(second));
 assert.equal(box.TylerIdentity.speaker(second,g.region).name,'Alex');
 const first=box.TylerIdentity.speaker(g.body,g.region);g.header.text='Alex renamed';
 assert.equal(box.TylerIdentity.speaker(g.body,g.region),null); // Two different header names are ambiguous.
 g.header.parentElement.children.pop();assert.equal(box.TylerIdentity.speaker(g.body,g.region).id,first.id);
});

test('numeric profile links and account attributes are read without promoting cached names to IDs',()=>{
 const box=reader(),g=message('Alex',null);g.avatar.setAttribute('data-accountid','123456');const first=box.TylerIdentity.speaker(g.body,g.region);
 g.avatar.removeAttribute('data-accountid');assert.equal(box.TylerIdentity.speaker(g.body,g.region),null);
 assert.equal(box.TylerIdentity.identify(g.body,g.region).id,'display:alex');
 g.avatar.setAttribute('href','/profiles/'+first.id+'/?x=y');g.avatar.tagName='a';assert.equal(box.TylerIdentity.speaker(g.body,g.region).id,first.id);
});

test('identity cache is keyed by actual account and scoped to its own chat',()=>{
 const box=reader(),g=message('Alex','123456');const person=box.TylerIdentity.speaker(g.body,g.region);
 g.header.text='';assert.equal(box.TylerIdentity.speaker(g.body,g.region).name,'Alex');
 const other=new Element('ChatHistory',{role:'log'});other.append(g.row);assert.equal(box.TylerIdentity.speaker(g.body,other).name,'Steam listener');assert.equal(box.TylerIdentity.speaker(g.body,g.region),null);assert.ok(person.id);
});

test('conflicting account keys, vanity links and body-only IDs cannot forge a counted sender',()=>{
 const box=reader(),g=message('Alex',null);g.avatar.setAttribute('href','https://steamcommunity.com/id/alex');g.avatar.tagName='a';
 assert.equal(box.TylerIdentity.speaker(g.body,g.region),null);
 const one=message('Alex','123456');one.row.append(new Element('avatar',{'data-miniprofile':'654321'}));assert.equal(box.TylerIdentity.speaker(one.body,one.region),null);
});

test('an explicit sender attribute is valid and supplied to account instructions',()=>{
 const box=reader(),g=message('Alex',null);g.row.setAttribute('data-author-steamid','76561198000000001');g.row.setAttribute('data-author-name','Alex');
 const p=box.TylerIdentity.speaker(g.body,g.region);assert.equal(p.id,'76561198000000001');assert.match(box.TylerIdentity.instruction(p),/Alex/);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {Element,message} from './helpers/message-dom.mjs';
const source=f=>readFileSync(new URL('../browser-extension/'+f,import.meta.url),'utf8');
function setup(){let probe;const main={document:{addEventListener:(_type,fn)=>probe=fn}};vm.runInNewContext(source('sender-main.js'),main);const isolated={URL,Event};vm.runInNewContext(source('identity.js'),isolated);return {main,api:isolated.TylerIdentity,connect:n=>{n.onProbe=probe;}};}

test('bounded React message props bridge resolves account and name synchronously for every caller',()=>{
 const {api,connect}=setup(),g=message('Alex',null);g.row.__reactFiber$fixture={memoizedProps:{message:{unAccountID:123456}}};connect(g.body);
 const p=api.speaker(g.body,g.region);assert.equal(p.name,'Alex');assert.equal(p.id,String(76561197960265728n+123456n));assert.equal(g.body.getAttribute('data-tyler-sender-source'),'react-message');
 g.header.text='New nickname';assert.equal(api.speaker(g.body,g.region).id,p.id);
});

test('only named message/sender fields are read; child mentions, bot user and stores are ignored',()=>{
 const {api,connect}=setup(),g=message('Alex',null);connect(g.body);
 g.row.__reactProps$fixture={user:{steamid:'76561198000000009'},chatStore:{senderSteamID:'76561198000000008'},children:[{senderSteamID:'76561198000000007'}],message:{senderSteamID:'76561198000000001'}};
 Object.defineProperty(g.row.__reactProps$fixture,'token',{get(){throw Error('Do not read token');}});
 assert.equal(api.speaker(g.body,g.region).id,'76561198000000001');
 delete g.row.__reactProps$fixture.message;assert.equal(api.speaker(g.body,g.region),null);assert.equal(g.body.getAttribute('data-tyler-sender-id'),null);
});

test('DOM reuse refreshes account stamps and rejects disagreement with explicit profile IDs',()=>{
 const {api,connect}=setup(),g=message('Alex',null);connect(g.body);g.body.__reactProps$fixture={message:{steamid:'76561198000000001'}};
 assert.equal(api.speaker(g.body,g.region).id,'76561198000000001');g.body.__reactProps$fixture={message:{steamid:'76561198000000002'}};g.header.text='Sam';
 assert.equal(api.speaker(g.body,g.region).id,'76561198000000002');g.avatar.setAttribute('data-miniprofile','123456');assert.equal(api.speaker(g.body,g.region),null);
});

test('ambiguous React message sender data and wider history boundaries fail without guessing',()=>{
 const {api,connect}=setup(),g=message('Alex',null);connect(g.body);
 g.body.__reactProps$fixture={message:{senderSteamID:'76561198000000001',authorSteamID:'76561198000000002'}};
 assert.equal(api.speaker(g.body,g.region),null);delete g.body.__reactProps$fixture;
 g.region.__reactProps$fixture={message:{senderSteamID:'76561198000000009'}};assert.equal(api.speaker(g.body,g.region),null);
});

test('Steam msg.unAccountID on an owning React component is found through host fiber parents',()=>{
 const {api,connect}=setup(),g=message('Hungry ass individual',null);connect(g.body);g.body.attributes.class='msgText';g.body.parentElement.attributes.class='msg';
 const component={memoizedProps:{msg:{unAccountID:123456,rtTimestamp:1793570000},chatView:{chat:{self:{accountid:987654}}}},return:{memoizedProps:{msg:{unAccountID:987654}},stateNode:g.row}};
 const host={memoizedProps:{className:'msgText'},stateNode:g.body,return:{memoizedProps:{children:'wrapper'},stateNode:g.body.parentElement,return:component}};
 g.body.__reactFiber$steam=host;
 assert.equal(api.speaker(g.body,g.region).id,String(76561197960265728n+123456n));
 assert.equal(g.body.getAttribute('data-tyler-sender-bridge'),'2.3.26');
});

test('Steam context.unAccountIDSender is read without reading chat.self or mention targets',()=>{
 const {api,connect}=setup(),g=message('Sam',null);connect(g.body);g.body.attributes.class='msgText';
 g.body.__reactFiber$steam={memoizedProps:{className:'span'},return:{memoizedProps:{context:{unAccountIDSender:654321,chat:{self:{accountid:999999}}},children:{context:{unAccountIDSender:999999}}}}};
 assert.equal(api.speaker(g.body,g.region).id,String(76561197960265728n+654321n));
});

test('React traversal stops before a different message block and never counts a parent account',()=>{
 const {api,connect}=setup(),g=message('Alex',null);connect(g.body);g.body.parentElement.attributes.class='msg';
 g.body.__reactFiber$steam={memoizedProps:{},stateNode:g.body,return:{stateNode:g.row,memoizedProps:{msg:{unAccountID:999999}}}};
 assert.equal(api.speaker(g.body,g.region),null);
});

test('a quoted child is resolved from its containing Steam msgText, not the quoted sender',()=>{
 const {main}=setup(),g=message('Alex',null);g.body.attributes.class='msgText';g.body.__reactFiber$steam={memoizedProps:{},return:{memoizedProps:{msg:{unAccountID:123456}}}};
 const quote=new Element('MessageQuote');quote.__reactFiber$steam={memoizedProps:{context:{unAccountIDSender:999999}}};g.body.append(quote);
 assert.equal(main.TylerMessageSenderMetadata.read(quote),String(76561197960265728n+123456n));
});

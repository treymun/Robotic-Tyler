import assert from 'node:assert/strict';import {batchTurns,isDirect,replyCap,cooldownFor,acceptableScope,localBudgetReached} from '../app/companion/quality.mjs';
assert.match(batchTurns([{speaker:{id:'76561198000000000',name:'Sam'},text:'hello'},{speaker:{id:'76561198000000001',name:'Alex'},text:'hey'}]),/\[Sam\] hello\n\[Alex\] hey/);
assert.ok(isDirect('ROBOTIC TYLER what now?'));
assert.equal(replyCap('voice','short'),70);assert.equal(replyCap('text','detailed'),380);
assert.ok(cooldownFor('text',true)<cooldownFor('text',false));assert.equal(acceptableScope('not-a-room'),null);assert.equal(acceptableScope('data-chatid:1234'),'data-chatid:1234');
assert.equal(localBudgetReached({reportedCostUSD:5},5),true);
console.log('All ROBOTIC TYLER unit checks passed');

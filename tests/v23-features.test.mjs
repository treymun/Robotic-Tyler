import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {parseScene,eligibleScene,scenePrompt,MAX_IMAGE_CHARS} from '../browser-extension/scene-vision.mjs';
const read=f=>readFileSync(new URL('../'+f,import.meta.url),'utf8');
test('scene parser rejects unstructured data and limits confidence and output length',()=>{
 assert.throws(()=>parseScene('you died bro'));
 const parsed=parseScene('```json\n{"game":"deadlock","event":"death","confidence":42,"comment":"Outplayed!"}\n```');
 assert.equal(parsed.confidence,1);assert.equal(parsed.event,'death');
 assert.equal(parseScene('{"game":"other","event":"none","comment":"bad"}').comment,'');
 assert.ok(scenePrompt().includes('explicit visible death/respawn'));
 assert.ok(MAX_IMAGE_CHARS<500000);
});
test('automatic scene commentary needs strong Deadlock evidence and cooldown',()=>{
 const v={game:'deadlock',event:'death',confidence:.93,comment:'Back to spawn!'};
 assert.equal(eligibleScene(v,'',0,300000),true);
 assert.equal(eligibleScene({...v,confidence:.72},'',0,300000),false);
 assert.equal(eligibleScene({...v,game:'unclear'},'',0,300000),false);
 assert.equal(eligibleScene(v,'death',250000,300000),false);
});
test('Chrome only screen picker, no hidden capture and an explicit stop',()=>{
 const s=read('browser-extension/screen-awareness.js');
 assert.match(s,/getDisplayMedia\(\{video:/);
 assert.match(s,/v23Start'\)\.onclick/);
 assert.match(s,/v23Stop'\)\.onclick=clean/);
 assert.match(s,/screenConsent/);
 assert.match(s,/autoRoast/);
 assert.doesNotMatch(s,/getUserMedia\(/);
 const manifest=JSON.parse(read('browser-extension/manifest.json'));
 assert.ok(manifest.content_scripts.some(c=>c.js.includes('screen-awareness.js')));
});
test('text-only Electron and desktop companion preserved with safe canned commands',()=>{
 assert.ok(read('app/main.cjs').includes('Text Control Center'));
 assert.ok(read('voice-app/native-main.cjs').length>0);
 const b=read('browser-extension/background.js');
 assert.match(b,/v23:roast/);assert.match(b,/v23:custom/);
 assert.match(b,/Only an opted-in player/);
 assert.match(b,/libraryAllowedIds/);
 assert.doesNotMatch(b,/new Function\(/);
});

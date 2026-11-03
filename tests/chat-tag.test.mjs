// v2.16 name tag in chat messages: one formatting layer (chat-tag.js), the settings rules, and
// Tyler recognising his own output with the tag on, off or customised.
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const source=f=>readFileSync(new URL('../browser-extension/'+f,import.meta.url),'utf8');
const load=(...files)=>{const box={Date,console};for(const f of ['chat-tag.js',...files])vm.runInNewContext(source(f),box);return box;};
const plain=v=>JSON.parse(JSON.stringify(v)); // objects from the vm realm
const LS=String.fromCharCode(0x2028),RLO=String.fromCharCode(0x202e),ZW=String.fromCharCode(0x200b);

test('settings rules: trimmed, plain text, Unicode and capitals kept, 32 characters, no line breaks or hidden characters',()=>{
 const T=load().TylerChatTag;
 assert.deepEqual(plain(T.validate('  SQUAD BOT  ')),{ok:true,name:'SQUAD BOT'});
 assert.equal(T.validate('Tyler 🎮 Ünïcødé').name,'Tyler 🎮 Ünïcødé');
 assert.equal(T.validate('sQuAd <b>bot</b>').name,'sQuAd <b>bot</b>','kept as typed: it is shown as plain text');
 for(const bad of ['','   ','two\nlines','tab\there','x'+LS+'y','a'+RLO+'b','z'+ZW+'w'])assert.equal(T.validate(bad).ok,false,JSON.stringify(bad));
 assert.equal(T.validate('🎮'.repeat(32)).ok,true,'32 characters, counted as characters not bytes');assert.equal(T.validate('x'.repeat(33)).ok,false);
 assert.deepEqual(plain(T.config({})),{enabled:true,name:'ROBOTIC TYLER'},'no saved preference: on, ROBOTIC TYLER');
 assert.deepEqual(plain(T.config({chatTagEnabled:false,chatTagName:'SQUAD BOT'})),{enabled:false,name:'SQUAD BOT'},'the name is remembered while the tag is off');
 assert.deepEqual(plain(T.config({chatTagName:'bad\nname'})),{enabled:true,name:'ROBOTIC TYLER'});
});

test('the tag is added exactly once; legacy prefixes go, message bodies are untouched',()=>{
 const T=load().TylerChatTag,on={enabled:true,name:'ROBOTIC TYLER'},custom={enabled:true,name:'SQUAD BOT'},off={enabled:false,name:'SQUAD BOT'};
 assert.equal(T.format('Anyone up for another round?',on),'(ROBOTIC TYLER) Anyone up for another round?');
 assert.equal(T.format('Anyone up for another round?',custom),'(SQUAD BOT) Anyone up for another round?');
 assert.equal(T.format('Anyone up for another round?',off),'Anyone up for another round?');
 for(const legacy of ['[ROBOTIC TYLER] Anyone up?','ROBOTIC TYLER: Anyone up?','(ROBOTIC TYLER) Anyone up?','[AI] Anyone up?','  [robotic tyler]   Anyone up?'])
  assert.equal(T.format(legacy,custom),'(SQUAD BOT) Anyone up?',legacy);
 assert.equal(T.format(T.format('hi',custom),custom),'(SQUAD BOT) hi','formatting twice still gives one tag');
 assert.equal(T.format('(SQUAD BOT) hi',off),'hi','turning the tag off removes a tag the text already had');
 for(const body of ['Tyler said ROBOTIC TYLER: was the best name','Robotic Tyler is the bot here','Who said "[ROBOTIC TYLER] rules"?','Q3: Which robot is called Tyler?','Alex: gg'])
  assert.equal(T.format(body,off),body,'only a leading tag is ever removed: '+body);
 assert.equal(T.format('',on),'','nothing to send stays empty');
});

test('Tyler recognises his own messages by Steam metadata, by what he sent, or by a tag, but a tag never grants anything',()=>{
 const T=load().TylerChatTag;T.set({chatTagEnabled:false});
 assert.equal(T.own('Round 2 starts now!'),false);
 T.remember(T.format('Round 2 starts now!\n1) Paris\n2) Rome'));
 assert.equal(T.own('Round 2 starts now!'),true);assert.equal(T.own('1) Paris'),true,'each line of a card');
 assert.equal(T.own('Paris'),false,'a player answer is not mistaken for the card');
 assert.equal(T.own('anything',{self:true}),true,'Steam says the bot account sent it');
 assert.equal(T.own('[ROBOTIC TYLER] old message'),true,'older tagged output');
 T.set({chatTagEnabled:true,chatTagName:'SQUAD BOT'});assert.equal(T.own('(SQUAD BOT) hi'),true);
 assert.doesNotMatch(source('chat-tag.js'),/authori[sz]e|permission\s*=/i,'the tag module only formats and recognises');
 for(const f of ['moderation.js','admin.js','squad-suite.js','music.js'])assert.doesNotMatch(source(f),/TylerChatTag\.\w+\([^)]*\)\s*&&\s*(?:kick|ban|allow)/i,f);
});

test('games, music and moderation ignore Tyler’s own tagged lines with a custom tag, and still read players',()=>{
 const box=load('soundboard-core.js','arcade-plus.js','moderation-core.js','music-core.js');
 box.TylerChatTag.set({chatTagEnabled:true,chatTagName:'SQUAD BOT'});
 assert.equal(box.TylerSoundboard.arcade('(SQUAD BOT) play vault',{},()=>0,1000),null,'own game card');
 assert.ok(box.TylerSoundboard.arcade('play vault',{},()=>0,1000),'a player starts a game');
 assert.equal(box.TylerModeration.parse('(SQUAD BOT) !kick yes'),null);
 assert.equal(box.TylerMusic.parse('(SQUAD BOT) !play Song'),null);
 assert.ok(box.TylerMusic.parse('!play Song'));
});

test('feature messages carry no hardcoded prefix: the send layer adds the tag once',()=>{
 for(const f of ['background.js','squad-suite.js','music.js','commands.js','moderation.js','soundboard.js'])assert.doesNotMatch(source(f),/['"`]ROBOTIC TYLER: /,f);
 const content=source('content.js');
 assert.match(content,/const formatted=TylerChatTag\.format\(/,'one formatting layer at the one send function');
 assert.doesNotMatch(content,/'\[ROBOTIC TYLER\] '\+/,'no second, hardcoded prefix');
 const manifest=JSON.parse(source('manifest.json')),iso=manifest.content_scripts.find(c=>c.world!=='MAIN').js;
 assert.ok(iso.indexOf('chat-tag.js')>=0&&iso.indexOf('chat-tag.js')<iso.indexOf('content.js'),'loaded before the panel');
 assert.match(source('guard.mjs'),/don\\'t start with your name or a label \(the app adds any name tag itself\)/);
});

test('the real background: a tag the AI writes is removed, feature replies are bare, the panel gets the tag settings',async()=>{
 const store={openrouterKey:'sk-or-test',aiProvider:'openrouter',streamAI:false,chatTagEnabled:false,chatTagName:'SQUAD BOT',suiteOptions:{eventsEnabled:true}};
 const area={get:async keys=>{const list=keys==null?Object.keys(store):typeof keys==='string'?[keys]:Array.isArray(keys)?keys:Object.keys(keys);return structuredClone(Object.fromEntries(list.filter(k=>k in store).map(k=>[k,store[k]])));},set:async v=>{Object.assign(store,structuredClone(v));},remove:async()=>{},setAccessLevel:async()=>{}};
 let listener;globalThis.chrome={action:{onClicked:{addListener(){}}},runtime:{onMessage:{addListener:fn=>{listener=fn;}},onInstalled:{addListener(){}},openOptionsPage(){}},
  storage:{local:area,session:area,onChanged:{addListener(){}}},tabs:{get:async id=>({id}),query:async()=>[],sendMessage:async()=>{},onRemoved:{addListener(){}}}};
 globalThis.fetch=async()=>new Response(JSON.stringify({choices:[{message:{content:'[ROBOTIC TYLER] Ha, that round was rough.'}}],usage:{}}),{headers:{'content-type':'application/json'}});
 await import('../browser-extension/background.js?tag');
 const send=m=>new Promise(r=>listener(m,{tab:{id:4},url:'https://steamcommunity.com/chat/'},r));
 await send({type:'lease:claim'});
 const c=await send({type:'connection'});assert.deepEqual(c.chatTag,{enabled:false,name:'SQUAD BOT'});
 // The panel applies that reply as is (2.16.0 read it as settings and fell back to the default tag).
 const panel=load();panel.TylerChatTag.set(c.chatTag);assert.equal(panel.TylerChatTag.format('hi'),'hi','tag off stays off after the connection check');
 panel.TylerChatTag.set({...c.chatTag,enabled:true});assert.equal(panel.TylerChatTag.format('hi'),'(SQUAD BOT) hi','the custom name survives the connection check');
 const r=await send({type:'command',text:'ask Bro lost',chatScope:'data-chat-group-id:1',automatic:true});
 assert.equal(r.text,'Ha, that round was rough.','the model’s own legacy prefix is gone; the send layer decides the tag');
 const e=await send({type:'suite:event',event:'win'});assert.equal(e.message,'GG! Another W for the squad.');
});

test('set() takes saved settings or a config, and the connection check never resets a custom or disabled tag',()=>{
 const {TylerChatTag:T}=load();
 T.set({chatTagEnabled:false,chatTagName:'SQUAD BOT'});assert.equal(T.format('gg'),'gg');
 T.set(T.config({chatTagEnabled:true,chatTagName:'SQUAD BOT'}));assert.equal(T.format('gg'),'(SQUAD BOT) gg');
 T.set({enabled:false,name:'SQUAD BOT'});assert.equal(T.format('gg'),'gg');assert.equal(T.current.name,'SQUAD BOT');
 T.set({enabled:true,name:'bad\nname'});assert.equal(T.format('gg'),'(ROBOTIC TYLER) gg','an unusable name falls back to the default');
 T.set({});assert.equal(T.format('gg'),'(ROBOTIC TYLER) gg','no saved preference: on, with ROBOTIC TYLER');
});

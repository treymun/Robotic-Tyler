// End-to-end: automatic chat detection (v2.6) against markup built from the class
// names in Steam's own web chat stylesheet (steamcommunity.com/public/css/webui/friends.css):
// chatWindow > chatHistoryAndMembers > ChatHistoryContainer > chatHistoryScroll > chatHistory
// > ChatMessageBlock > msg > msgText, with chatEntry > textarea.chatTextarea, and the voice
// room's own chat (VoiceRoomChatWindow / VoiceRoomChatHistory) that Steam can show beside
// the text channel ("BothChatsDisplayed"). Real layout and visibility in headless Chromium.
// This is a stand-in page, not a capture of a live Steam session.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const {chromium}=require('playwright');
const selection=fs.readFileSync(path.resolve(import.meta.dirname,'../../browser-extension/selection.js'),'utf8');

const messages=(...texts)=>texts.map(t=>`<div class="ChatMessageBlock"><div class="msg"><div class="speakerName">Alex</div><div class="msgText">${t}</div></div></div>`).join('');
const chat=(id,{cls='chatWindow MultiUserChat',history=messages('hello','latest '+id),style='',inner=''}={})=>`
 <div class="${cls}" id="${id}" style="${style}">
  <div class="chatHistoryAndMembers">
   <div class="ChatHistoryContainer"><div class="chatHistoryScroll"><div class="chatHistory">${history}</div></div></div>
   <div class="chatRoomGroupMembers"><input type="text" placeholder="Search members"></div>
  </div>
  <div class="chatEntry"><textarea class="chatTextarea"></textarea></div>${inner}
 </div>`;
const voiceChat=(id,opts={})=>chat(id,{cls:'VoiceRoomChatWindow',...opts}).replace('class="chatHistory"','class="chatHistory VoiceRoomChatHistory"');
const page=body=>`<!doctype html><body style="margin:0"><div class="friendlist"><input type="text" placeholder="Search friends"></div>
 <div class="ChatRoomGroupDialog_contents">${body}</div><div role="textbox" contenteditable="true" style="width:80px;height:20px">unrelated</div></body>`;

test('chat detection pairs each message box with its own history and only guesses when it is clear',async()=>{
 const browser=await chromium.launch();
 try{
  const tab=await browser.newPage();
  async function detect(body,{prefer=null,hint=null}={}){
   await tab.setContent(page(body));await tab.addScriptTag({content:selection});
   return tab.evaluate(([prefer,hint])=>{
    const found=TylerSelection.discover(document,prefer?document.querySelector(prefer+' textarea'):null,hint);
    const where=n=>n?n.closest('[id]')?.id+' '+n.className:null;
    return {composer:where(found.composer),region:found.region?.className||null,sample:found.sample?.textContent||null,ambiguous:!!found.ambiguous,empty:!!found.empty,kind:found.composer?TylerSelection.kind(found.composer):null};
   },[prefer,hint]);
  }

  // One chat: Steam's nested history elements no longer block detection; newest message is the sample.
  let r=await detect(chat('text'));
  assert.equal(r.composer,'text chatTextarea');assert.equal(r.region,'chatHistory');assert.equal(r.sample,'latest text');assert.equal(r.kind,'text');

  // Hidden chat tabs (display:none / visibility:hidden) are ignored.
  r=await detect(chat('text')+chat('other',{style:'display:none'})+chat('third',{style:'visibility:hidden'}));
  assert.equal(r.composer,'text chatTextarea');assert.equal(r.ambiguous,false);

  // Text channel and voice-room chat side by side: no guess…
  const both=chat('text')+voiceChat('voice');
  r=await detect(both);assert.equal(r.ambiguous,true);assert.equal(r.composer,null);
  // …unless the person's last pick (remembered as a kind) or last-used box settles it.
  r=await detect(both,{hint:'voice-room'});assert.equal(r.composer,'voice chatTextarea');assert.equal(r.kind,'voice-room');assert.equal(r.sample,'latest voice');
  r=await detect(both,{hint:'text'});assert.equal(r.composer,'text chatTextarea');
  r=await detect(both,{prefer:'#voice'});assert.equal(r.composer,'voice chatTextarea');

  // Worst case: the voice chat rendered inside the text chat's window. The text box can't be
  // paired cleanly, so nothing is picked automatically even though the voice box could be.
  const nested=chat('text',{inner:voiceChat('voice')});
  r=await detect(nested);assert.equal(r.ambiguous,true);
  r=await detect(nested,{hint:'voice-room'});assert.equal(r.composer,'voice chatTextarea');
  r=await detect(nested,{hint:'text'});assert.equal(r.composer,null,'never pairs a box with a history that holds another chat');

  // A chat with no messages yet: the box is found and the setup waits for the first message.
  r=await detect(chat('text',{history:''}));
  assert.equal(r.composer,'text chatTextarea');assert.equal(r.region,null);assert.equal(r.empty,true);

  // No Steam chat on the page at all.
  r=await detect('<p>Friends list only</p>');assert.equal(r.composer,null);assert.equal(r.ambiguous,false);
 }finally{await browser.close();}
});

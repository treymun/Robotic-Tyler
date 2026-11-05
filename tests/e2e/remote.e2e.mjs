// End-to-end (v2.25, v2.26): the phone remote.
// Mocked: the Steam window is the panel preview (tools/preview/panel.html) running the real panel
// scripts as the desktop app, against a mock Steam page; the app's IPC between the Steam window and
// the remote server is a direct call here. Real: the remote server (app/remote.cjs) over HTTP and
// Server-Sent Events, and the phone's page in a phone-sized Chromium (iPhone 14 emulation).
//  1. Pairing, the copy of the panel in Tyler's theme with the theme's own extras, live status from
//     the PC, and the remote's buttons reaching the panel.
//  2. All 25 themes chosen from the phone: the PC follows, and the phone runs the same extras.
//  3. The Steam window's side (remote-control.js): status, actions, and events only while watched.
// Not tested: a real phone on Wi-Fi, Windows' firewall, the real Steam page, the Electron IPC (the
// desktop check, tools/desktop-voice-check, covers live events through real Electron IPC).
import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const {chromium,devices}=require('playwright');
const {setupRemote}=require('../../app/remote.cjs');
const {memoryStorage}=require('../../app/vault.cjs');
const ROOT=path.resolve(import.meta.dirname,'../..');
const types={'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.json':'application/json','.svg':'image/svg+xml','.png':'image/png','.webp':'image/webp','.woff2':'font/woff2','.wav':'audio/wav'};
const SHOTS=process.env.REMOTE_SHOT_DIR||'';

/** The panel preview as Tyler's Steam window, the real remote server, and a phone. */
async function bridge(browser,{theme='steam'}={}){
 const files=http.createServer((req,res)=>{const file=path.join(ROOT,decodeURIComponent(new URL(req.url,'http://x').pathname));if(!file.startsWith(ROOT)||!fs.existsSync(file)||fs.statSync(file).isDirectory()){res.writeHead(404);res.end();return;}res.writeHead(200,{'content-type':types[path.extname(file)]||'application/octet-stream'});fs.createReadStream(file).pipe(res);}).listen(0);
 const errors=[];const pc=await (await browser.newContext({viewport:{width:1380,height:920}})).newPage();pc.on('pageerror',e=>errors.push('pc: '+e.message));
 let remote=null;await pc.exposeFunction('__remoteEvent',m=>remote?.push(m.events));
 await pc.goto('http://127.0.0.1:'+files.address().port+'/tools/preview/panel.html?theme='+theme+'&platform=desktop-voice');
 await pc.waitForFunction(()=>window.__tylerReady===true&&window.TylerRemote);
 await pc.evaluate(()=>{window.__results=[];handlers['remote:result']=m=>{window.__results.push(m);return {};};handlers['remote:event']=m=>{window.__remoteEvent(m);return {};};
  window.__played=[];TylerCompanion.playSound=slot=>window.__played.push(slot);window.__sent=[];TylerCompanion.send=t=>window.__sent.push(t);});
 const ask=(action,args={})=>pc.evaluate(async([action,args])=>{const id='t'+Math.random().toString(36).slice(2);for(const fn of listeners)fn({type:'remote:action',id,action,args});
  for(let i=0;i<250;i++){const r=window.__results.find(x=>x.id===id);if(r){if(!r.ok)throw Error(r.error);return r.data;}await new Promise(x=>setTimeout(x,20));}throw Error('no answer');},[action,args]);
 const prefs={theme,muteCall:false};
 remote=setupRemote({vault:memoryStorage(),ask,pageDir:path.join(ROOT,'app','remote'),uiDir:path.join(ROOT,'app','companion','ui'),libDir:path.join(ROOT,'app','companion'),version:'2.26.0',theme:async()=>prefs.theme,
  prefs:{get:async()=>({...prefs}),theme:async t=>{prefs.theme=t;await pc.evaluate(t=>{for(const fn of listeners)fn({type:'storage:changed',changes:{uiTheme:{newValue:t}}});},t);},muteCall:async on=>{prefs.muteCall=on;}}});
 const s=await remote.handle('enable');
 const phone=await (await browser.newContext({...devices['iPhone 14']})).newPage();
 phone.on('pageerror',e=>errors.push('phone: '+e.message));// A 401 before pairing and a 403 for a wrong code are the server's answers, not page errors.
 phone.on('console',m=>{if(m.type()==='error'&&!/status of 40[13] /.test(m.text()))errors.push('phone console: '+m.text());});
 return {pc,phone,remote,prefs,errors,code:s.code,base:'http://127.0.0.1:'+s.port,async close(){await remote.stop();files.close();}};
}
// Inside the phone's copy of the panel (an open shadow root).
// (A handle, not eval: the page's CSP has no 'unsafe-eval'.)
const inPhone=async(page,fn,arg)=>{const r=await page.evaluateHandle(()=>document.getElementById('tyler').shadowRoot);try{return await r.evaluate(fn,arg);}finally{await r.dispose();}};
const tap=(page,id)=>inPhone(page,(r,id)=>r.getElementById(id).click(),id);
const pcMounted=b=>b.pc.evaluate(()=>TylerThemeFeatures.mounted().join(' '));
const phoneMounted=b=>b.phone.evaluate(()=>TylerThemeFeatures.mounted().join(' '));

test('phone remote: pair, a copy of the panel in Tyler\'s theme, live status, buttons (mocked Steam window, real server, phone-sized Chromium)',{timeout:180000},async()=>{
 const browser=await chromium.launch();const b=await bridge(browser,{theme:'payday'});
 try{
  const {phone,pc}=b;
  // Not paired: the pairing card in the panel, in Tyler's theme already.
  await phone.goto(b.base+'/');await phone.waitForFunction(()=>document.getElementById('tyler').shadowRoot?.getElementById('pairView')?.hidden===false);
  assert.equal(await inPhone(phone,r=>r.querySelector('.panel').dataset.rtTheme),'payday');
  assert.match(await inPhone(phone,r=>r.getElementById('activityLabel').textContent),/Not paired/);
  await inPhone(phone,(r,c)=>{r.getElementById('code').value=c;r.getElementById('pairForm').requestSubmit();},b.code==='999999'?'111111':'999999');
  await phone.waitForFunction(()=>/right|expired/.test(document.getElementById('tyler').shadowRoot.getElementById('pairMsg').textContent));
  // The QR code's link pairs, and the code leaves the address bar.
  await phone.goto(b.base+'/?code='+b.code);await phone.waitForFunction(()=>globalThis.__tylerRemote?.state().fx===true,null,{timeout:30000});
  assert.equal(await phone.evaluate(()=>location.search),'');
  await phone.waitForFunction(()=>__tylerRemote.state().link==='live');
  // The same panel parts and the same theme extras as on the PC.
  assert.equal(await phoneMounted(b),await pcMounted(b));assert.ok((await phoneMounted(b)).includes('pd-plan'));
  assert.equal(await inPhone(phone,r=>r.getElementById('hudSpend').textContent),await pc.evaluate(()=>document.getElementById('tyler-companion-root').shadowRoot.getElementById('hudSpend').textContent));
  assert.equal(await phone.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,'no sideways scrolling on a phone');
  // Live: a state change on the PC reaches the phone's status strip as it happens (local, mocked: not a Wi-Fi timing).
  for(const [text,state] of [['SPEAKING — say “stop” to interrupt','speaking'],['THINKING — preparing a typed reply…','thinking'],['LISTENING — speak normally, then pause','listening']]){
   await pc.evaluate(t=>TylerCompanion.setActivity(t),text);
   await phone.waitForFunction(s=>document.getElementById('tyler').shadowRoot.getElementById('activityCard').dataset.state===s,state,{timeout:3000});
  }
  // The extras' numbers start where the PC's are and follow its events.
  const pcS=await pc.evaluate(()=>{const S=TylerThemeFeatures.state();return {spoken:S.spoken,errors:S.errors};});
  await phone.waitForFunction(n=>TylerThemeFeatures.state().spoken===n,pcS.spoken,{timeout:3000});
  if(SHOTS)await phone.screenshot({path:path.join(SHOTS,'remote-phone.png')});
  // Buttons: a clip, a message, the talk mode, the call mute, Pause.
  await phone.waitForFunction(()=>document.getElementById('tyler').shadowRoot.querySelectorAll('.pad').length>=2);
  await tap(phone,'tab-soundboard');const slot=await inPhone(phone,r=>{const p=r.querySelector('.pad');p.click();return Number(p.dataset.slot);});
  await pc.waitForFunction(n=>window.__played.includes(n),slot);
  await tap(phone,'tab-conversation');
  await inPhone(phone,r=>{r.getElementById('say').value='hello squad';r.getElementById('sayForm').requestSubmit();});
  await pc.waitForFunction(()=>window.__sent.includes('hello squad'));
  await phone.waitForFunction(()=>document.getElementById('tyler').shadowRoot.getElementById('say').value==='');
  // v2.35: the chat log card shows what's in the chat on the PC; Clear conversation needs a second tap.
  await pc.evaluate(()=>{const region=document.querySelector('.ChatHistory');TylerCompanion.getRegion=()=>region;TylerCompanion.getSample=()=>region.querySelector('.msgText');});
  await inPhone(phone,r=>{r.getElementById('rmLogCard').open=true;r.getElementById('rmLogCard').dispatchEvent(new Event('toggle'));});
  await phone.waitForFunction(()=>document.getElementById('tyler').shadowRoot.querySelectorAll('#rmLog .rm-log-line').length===3,null,{timeout:15000});
  assert.match(await inPhone(phone,r=>r.getElementById('rmLog').textContent),/Alex.*tyler who is throwing this match.*Sam.*!play daft punk/s);
  await pc.evaluate(()=>{window.__resets=0;handlers.reset=()=>{window.__resets++;return {text:'Conversation cleared.'};};});
  await tap(phone,'rmClear');assert.equal(await inPhone(phone,r=>r.getElementById('rmClear').textContent),'Tap again to clear','the first tap only asks');
  await phone.waitForTimeout(300);assert.equal(await pc.evaluate(()=>window.__resets),0,'one tap clears nothing');
  await tap(phone,'rmClear');await phone.waitForFunction(()=>document.getElementById('tyler').shadowRoot.getElementById('rmClear').textContent==='Clear conversation');
  await pc.waitForFunction(()=>window.__resets===1,null,{timeout:5000});
  await inPhone(phone,r=>{const m=r.getElementById('rmMode');m.value='voice';m.dispatchEvent(new Event('change'));});
  await pc.waitForFunction(()=>document.getElementById('tyler-companion-root').shadowRoot.getElementById('setupMode').value==='voice');
  await tap(phone,'tab-setup');await inPhone(phone,r=>r.getElementById('rmMuteCall').click());
  for(let i=0;i<50&&!b.prefs.muteCall;i++)await phone.waitForTimeout(50);
  assert.equal(b.prefs.muteCall,true,'Mute the call in Tyler\'s window');
  // A notification in the theme's own style (the panel's notifications, ui-kit.js).
  assert.ok(await inPhone(phone,r=>!!r.querySelector('.rt-toast')));
  // Music DJ isn't on in this preview: the phone offers to start it, and Play waits for it.
  await tap(phone,'tab-room');
  assert.equal(await inPhone(phone,r=>r.getElementById('rmMusicStart').hidden),false);assert.equal(await inPhone(phone,r=>r.getElementById('query').disabled),true);
  // A tab change plays the theme's own transition, as in the panel.
  assert.equal(await phone.evaluate(()=>TylerThemeFeatures.state().tab),'room');
  // Unpair: back to the code screen, and the phone's access ends.
  await tap(phone,'tab-setup');await tap(phone,'forget');
  await phone.waitForFunction(()=>document.getElementById('tyler').shadowRoot.getElementById('pairView').hidden===false);
  assert.equal((await b.remote.handle('status')).devices.length,0);
  assert.deepEqual(b.errors,[]);
 }finally{await b.close();await browser.close();}
});

test('phone remote: every theme chosen from the phone, the PC follows and both run the same extras',{timeout:240000},async()=>{
 const browser=await chromium.launch();const b=await bridge(browser,{theme:'steam'});
 try{
  const {phone,pc}=b;await phone.goto(b.base+'/?code='+b.code);await phone.waitForFunction(()=>globalThis.__tylerRemote?.state().fx===true,null,{timeout:30000});
  await tap(phone,'tab-setup');
  const themes=await inPhone(phone,r=>[...r.querySelectorAll('.rm-theme')].map(x=>x.dataset.theme));assert.equal(themes.length,25);
  for(const t of [...themes.slice(1),'steam']){
   await phone.waitForTimeout(220); // the remote takes at most 5 presses a second
   await inPhone(phone,(r,t)=>r.querySelector('.rm-theme[data-theme='+t+']').click(),t);
   await pc.waitForFunction(t=>TylerCompanion.getTheme()===t,t);
   await phone.waitForFunction(t=>document.getElementById('tyler').shadowRoot.querySelector('.panel').dataset.rtTheme===t&&TylerThemeFeatures.state().theme===t,t);
   assert.equal(await phoneMounted(b),await pcMounted(b),t);
   assert.equal(await inPhone(phone,(r,t)=>r.querySelector('.rm-theme[aria-pressed=true]')?.dataset.theme,t),t);
   if(SHOTS){await tap(phone,'tab-conversation');await phone.waitForTimeout(700);await phone.screenshot({path:path.join(SHOTS,'remote-'+t+'.png')});await tap(phone,'tab-setup');}
  }
  assert.deepEqual(b.errors,[]);
 }finally{await b.close();await browser.close();}
});

// v2.30: Connect & start's one-time chat check, answered from the phone. The PC's chat is mocked
// (the panel preview with a stand-in chat), the server is real; no real Steam chat or provider.
test('v2.30: the phone sees Connect & start waiting for the chat check and answers it (mocked chat on the PC)',{timeout:120000},async()=>{
 const browser=await chromium.launch();const b=await bridge(browser,{theme:'steam'});
 try{
  const {pc,phone}=b;
  await pc.evaluate(()=>{window.__saved=[];handlers['setup:save']=m=>{window.__saved.push(m.values);return {};};
   const api=TylerCompanion,box=document.body;Object.assign(api,{locateChat:()=>true,getRegion:()=>box,getComposer:()=>box,getChatScope:()=>'group:42'});});
  await phone.goto(b.base+'/?code='+b.code);await phone.waitForFunction(()=>globalThis.__tylerRemote?.state().link==='live',null,{timeout:30000});
  await inPhone(phone,r=>{const m=r.getElementById('rmMode');m.value='text';m.dispatchEvent(new Event('change'));});
  await pc.waitForFunction(()=>document.getElementById('tyler-companion-root').shadowRoot.getElementById('setupMode').value==='text');
  assert.equal(await inPhone(phone,r=>r.getElementById('rmNotice').hidden),true,'nothing to answer yet');
  await tap(phone,'connect');
  await pc.waitForFunction(()=>TylerCompanion.noticePending===true,null,{timeout:10000});
  await phone.waitForFunction(()=>document.getElementById('tyler').shadowRoot.getElementById('rmNotice').hidden===false,null,{timeout:5000});
  assert.match(await inPhone(phone,r=>r.getElementById('rmNotice').textContent),/AI provider/);
  if(SHOTS)await phone.screenshot({path:path.join(SHOTS,'remote-chat-check.png')});
  await tap(phone,'rmNoticeAlways');
  await pc.waitForFunction(()=>window.__saved.some(v=>v.noticeAlways===true),null,{timeout:5000});
  assert.ok(await pc.evaluate(()=>window.__saved.some(v=>v.noticeScope==='chat:group:42')),'this chat is remembered too');
  assert.equal(await pc.evaluate(()=>TylerCompanion.noticePending),false);
  await phone.waitForFunction(()=>document.getElementById('tyler').shadowRoot.getElementById('rmNotice').hidden===true,null,{timeout:5000});
  await pc.evaluate(()=>TylerCompanion.cancelSetup?.());
  assert.deepEqual(b.errors,[]);
 }finally{await b.close();await browser.close();}
});

// v2.32: Steam voice Join / Leave from the phone. The PC's Steam is a stand-in shaped like Steam's
// real chat code (read from Steam's friendsui.js: a voice channel's StartVoiceChat starts the call,
// Steam's call state reaches 9 when its WebRTC session and voice chat are up, the server's member list
// says who is in, and the "Leave voice chat" button is .chatEndVoiceChat). Real server, phone-sized
// Chromium and Tyler's real steam-chat-main.js / voice-call.js. Not Steam: whether Steam's real voice
// server connects is tested on the owner's machine.
const FAKE_STEAM=`(()=>{
 const log=[],self={accountid:2},friend={accountid:3};let members=[];
 const VC={m_VoiceCallState:{m_eState:0,m_chatRoom:null},
  InitiateRoomChat(g,c){this.m_VoiceCallState={m_eState:1,m_chatRoom:{groupID:g,chatID:c}};log.push('(VoiceChat) Call to room '+c+' now initating getUserMedia/WebRTC');window.__steam.started.push(c);},
  IsVoiceActiveForRoom(g,c){const s=this.m_VoiceCallState;return !!s.m_chatRoom&&s.m_chatRoom.groupID===g&&s.m_chatRoom.chatID===c&&s.m_eState!==0;},
  OnUserEndVoiceChat(){this.m_VoiceCallState={m_eState:0,m_chatRoom:null};members=members.filter(m=>m!==self);log.push('(VoiceChat) Ended');window.__steam.ended++;},
  IsAccountFullyConnectedToActiveVoiceChat(id){return id===self.accountid&&this.m_VoiceCallState.m_eState===10;},
  GetVoiceLogs(){return log.join('\\r\\n');}};
 const room=(id,name)=>({GetRoomID:()=>id,name,GetVoiceAllowed:()=>true,ChatStore:{VoiceChat:VC},
  StartVoiceChat(){if(!this.BVoiceActive())VC.InitiateRoomChat('12345',id);},ToggleVoiceChat(){this.BVoiceActive()?VC.OnUserEndVoiceChat():this.StartVoiceChat();},
  BVoiceActive(){return VC.IsVoiceActiveForRoom('12345',id);},get voice_active_contains_self(){return VC.m_VoiceCallState.m_chatRoom?.chatID===id&&members.includes(self);},
  get voice_active_member_list(){return {member_list:VC.m_VoiceCallState.m_chatRoom?.chatID===id?members:[friend]};}});
 const rooms=[room('901','General Voice')];
 const group={GetGroupID:()=>'12345',get voiceRoomList(){return rooms;}};
 const text={GetGroup:()=>group,GetVoiceAllowed:()=>false,self,ChatStore:{VoiceChat:VC}};
 const region=document.createElement('div'),sample=document.createElement('div');sample.className='msgText';sample.textContent='hi';
 region.append(sample);document.body.append(region);sample.__reactProps$steam={msg:{unAccountID:3,rtTimestamp:Date.now()/1000,unOrdinal:1},chatView:{chat:text}};
 // Steam's Leave button, rendered while a call is active.
 const leave=document.createElement('div');leave.className='VoiceControlPanelButton chatEndVoiceChat';leave.title='Leave voice chat';leave.onclick=()=>VC.OnUserEndVoiceChat();
 window.__steam={started:[],ended:0,region,sample,rooms,room,
  connect(){VC.m_VoiceCallState.m_eState=10;members=[self,friend];log.push('(WebRTC) WebRTC session connected');document.body.append(leave);},
  step(n){VC.m_VoiceCallState.m_eState=n;},
  drop(){VC.m_VoiceCallState={m_eState:0,m_chatRoom:null};members=[];log.push('(VoiceChat) Voice chat failed: timed out');leave.remove();},
  manual(id){const r=rooms.find(x=>x.GetRoomID()===id);r.StartVoiceChat();this.connect();}};
})();`;

test('v2.32: Join Voice / Leave Voice from the phone follow Steam\'s own state (stand-in Steam on the PC)',{timeout:120000},async()=>{
 const browser=await chromium.launch();const b=await bridge(browser,{theme:'steam'});
 try{
  const {pc,phone}=b;
  await pc.addScriptTag({path:path.join(ROOT,'browser-extension/steam-chat-main.js')});await pc.addScriptTag({content:FAKE_STEAM});
  await pc.evaluate(()=>{Object.assign(TylerCompanion,{getRegion:()=>__steam.region,getSample:()=>__steam.sample,getVoiceState:()=>({enabled:true,attached:1,connectedPeers:0})});});
  await phone.goto(b.base+'/?code='+b.code);await phone.waitForFunction(()=>globalThis.__tylerRemote?.state().link==='live',null,{timeout:30000});
  const ui=()=>inPhone(phone,r=>({state:r.getElementById('rmCall').dataset.state,label:r.getElementById('rmCallState').textContent,text:r.getElementById('rmCallText').textContent,join:r.getElementById('rmJoin').disabled,leave:r.getElementById('rmLeave').disabled}));
  const until=async(want,ms=8000)=>{const t=Date.now();let u;while(Date.now()-t<ms){u=await ui();if(u.state===want)return u;await phone.waitForTimeout(100);}throw Error('phone shows '+JSON.stringify(u)+', not '+want);};
  let u=await until('disconnected');assert.equal(u.label,'Disconnected');assert.equal(u.join,false);assert.equal(u.leave,true,'nothing to leave');
  // Join: Steam's own StartVoiceChat runs once, even if the button is tapped twice; Joining until Steam says connected.
  await tap(phone,'rmJoin');await tap(phone,'rmJoin');
  u=await until('joining');assert.equal(u.label,'Joining…');assert.equal(u.join,true,'no second join while one is on its way');
  await phone.waitForTimeout(1500);assert.deepEqual(await pc.evaluate(()=>__steam.started),['901']);
  assert.equal((await ui()).state,'joining','the request alone is not "Connected"');
  await pc.evaluate(()=>__steam.step(8));await phone.waitForTimeout(1300);assert.equal((await ui()).state,'joining','still not connected at Steam\'s step 8');
  await pc.evaluate(()=>__steam.step(9));await phone.waitForTimeout(1300);assert.equal((await ui()).state,'joining','step 9 (NotifyingVoiceChatOfWebRTCSession) is still setting up');
  await pc.evaluate(()=>__steam.connect());u=await until('connected');assert.equal(u.label,'Connected');assert.match(u.text,/General Voice · 1 other/);assert.equal(u.join,true);assert.equal(u.leave,false);
  if(SHOTS){await inPhone(phone,r=>r.getElementById('rmCall').scrollIntoView({block:'center'}));await phone.screenshot({path:path.join(SHOTS,'remote-call.png')});await pc.screenshot({path:path.join(SHOTS,'pc-call.png')});}
  // Leave: Steam's own Leave button.
  await tap(phone,'rmLeave');u=await until('disconnected');assert.equal(await pc.evaluate(()=>__steam.ended),1);
  // Someone joins the bot in Steam itself: the phone follows. Then Steam drops it: Disconnected.
  await pc.evaluate(()=>__steam.manual('901'));u=await until('connected');
  await pc.evaluate(()=>__steam.drop());u=await until('disconnected');
  // A join Steam never finishes: Failed with Steam's reason, and Leave cancels it.
  await tap(phone,'rmJoin');await until('joining');await pc.evaluate(()=>__steam.drop());u=await until('failed');assert.match(u.text,/ended the call before it connected/);
  // A second voice channel: Tyler goes back to the one the bot was last connected in.
  await pc.evaluate(()=>{__steam.rooms.push(__steam.room('902','Raid'));});
  await tap(phone,'rmJoin');await until('joining');await phone.waitForTimeout(300);assert.equal(await pc.evaluate(()=>__steam.started.at(-1)),'901');
  await pc.evaluate(()=>__steam.connect());await until('connected');await tap(phone,'rmLeave');await until('disconnected');
  // The PC's panel has the same control.
  assert.equal(await pc.evaluate(()=>!!document.getElementById('tyler-companion-root').shadowRoot.querySelector('.voice-call #vcJoin')),true);
  assert.deepEqual(b.errors,[]);
 }finally{await b.close();await browser.close();}
});

test('Steam window side: status, actions through the panel\'s controls, events only while a phone watches (panel preview as the desktop app)',{timeout:120000},async()=>{
 const browser=await chromium.launch();const b=await bridge(browser,{theme:'steam'});
 try{
  const {pc}=b,ask=(action,args={})=>pc.evaluate(async([action,args])=>{const id='t'+Math.random().toString(36).slice(2);for(const fn of listeners)fn({type:'remote:action',id,action,args});for(let i=0;i<50;i++){const r=window.__results.find(x=>x.id===id);if(r)return r;await new Promise(x=>setTimeout(x,20));}return null;},[action,args]);
  const $=id=>pc.evaluate(id=>{const e=document.getElementById('tyler-companion-root').shadowRoot.getElementById(id);return e?(e.type==='checkbox'?e.checked:e.value):null;},id);
  const st=await ask('state');
  assert.equal(st.ok,true);assert.ok(st.data.sounds.length>=2,'the soundboard');assert.equal(st.data.sounds[0].fav,true,'favourites first');
  for(const k of ['state','label','text','voice','music','replies','theme','hud','controls','fx','now'])assert.ok(k in st.data,k);
  assert.ok(Array.isArray(st.data.fx.turns)&&'life' in st.data.fx&&Array.isArray(st.data.controls.check.items));
  assert.equal(JSON.stringify(st.data).includes('sk-'),false);
  assert.equal((await ask('sound',{slot:st.data.sounds[0].slot})).ok,true);assert.deepEqual(await pc.evaluate(()=>window.__played),[st.data.sounds[0].slot]);
  assert.match((await ask('sound',{slot:999})).error,/isn.t on the soundboard/);
  assert.match((await ask('music-play',{query:'daft punk'})).error,/Start the Music DJ/,'music needs the DJ running on the PC');
  // The panel's own controls change, and their own code runs (keep-alive saves, the volume reaches the bridge).
  assert.equal((await ask('keepalive',{call:false,minutes:'30'})).ok,true);assert.equal(await $('kaCall'),false);
  assert.equal((await ask('keepalive',{call:true,minutes:'30'})).ok,true);assert.equal(await $('kaMinutes'),'30');
  assert.equal((await ask('clip-volume',{value:.3})).ok,true);assert.equal(await $('boardVolume'),'0.3');
  assert.equal((await ask('voice-volume',{value:.5})).ok,true);assert.equal(await $('volume'),'0.5');
  assert.equal((await ask('music-quality',{level:'medium'})).ok,true);assert.equal(await $('musicQuality'),'medium');
  assert.match((await ask('music-quality',{level:'ultra'})).error,/isn.t available/);
  assert.match((await ask('mode',{mode:'party'})).error,/auto, text or voice/);
  assert.equal((await ask('pause')).ok,true);
  // v2.35: the chat log (what's in the open chat) and Clear conversation, from the phone.
  assert.deepEqual((await ask('chat-log')).data,{connected:false,messages:[]},'no chat connected yet: an empty log, not an error');
  // The mock Steam page's chat, as the panel sees it once a chat is connected.
  await pc.evaluate(()=>{const region=document.querySelector('.ChatHistory');TylerCompanion.getRegion=()=>region;TylerCompanion.getSample=()=>region.querySelector('.msgText');});
  const log=await ask('chat-log');assert.equal(log.ok,true);assert.equal(log.data.connected,true);
  assert.deepEqual(log.data.messages.map(m=>m.name+': '+m.text),['Alex: tyler who is throwing this match','ROBOTIC TYLER: [ROBOTIC TYLER] Statistically? The guy asking.','Sam: !play daft punk one more time']);
  for(const m of log.data.messages)assert.deepEqual(Object.keys(m).sort(),['at','name','self','text']);
  assert.equal((await ask('clear')).ok,true);
  assert.match((await ask('notice',{always:true})).error,/Nothing is waiting/,'v2.30: no chat check waiting');assert.equal(st.data.notice,false);
  assert.match((await ask('nope')).error,/Unknown action/);assert.match((await ask('__proto__')).error,/Unknown action/);
  // Events go to the main process only while a phone watches.
  const events=[];await pc.exposeFunction('__seen',m=>events.push(...m.events));await pc.evaluate(()=>{handlers['remote:event']=m=>{window.__seen(m);return {};};});
  await ask('watch',{on:false});await pc.evaluate(()=>TylerCompanion.setActivity('THINKING — preparing'));await pc.waitForTimeout(300);
  assert.equal(events.length,0,'nobody watching: nothing sent');
  await ask('watch',{on:true});await pc.evaluate(()=>TylerCompanion.setActivity('SPEAKING — on air'));await pc.waitForTimeout(300);
  assert.deepEqual(events.map(e=>e.type+':'+e.data.state),['state:speaking']);assert.deepEqual(Object.keys(events[0].data).sort(),['before','label','state','text']);
  assert.deepEqual(b.errors,[]);
 }finally{await b.close();await browser.close();}
});

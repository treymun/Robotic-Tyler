// Real Chromium rendering and real Electron stylesheet APIs; Steam's DOM/content,
// network and Settings store are fixtures. No Steam account, audio or AI calls.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {pathToFileURL} from 'node:url';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),{chromium,_electron}=require('playwright');
const ROOT=path.resolve(import.meta.dirname,'../..');
const read=p=>fs.readFileSync(path.join(ROOT,p),'utf8');
const {stylesFor}=require('../../app/steam-appearance/styles.cjs');
const {inspectPage}=require('../../app/steam-appearance/controller.cjs');
const fixture=read('tests/fixtures/steam-appearance.html');
const THEMES=['steam',...fs.readdirSync(path.join(ROOT,'browser-extension/ui/themes')).filter(f=>f.endsWith('.css')).map(f=>f.slice(0,-4))];
const OUT=path.join(ROOT,'test-results/steam-appearance');
// Include hit areas, text metrics, wrapping and scroll extents, not just the
// outer window. Paint-only differences must leave every measured value intact.
function metrics(){return [...document.querySelectorAll('[id]')].map(el=>{
 const r=el.getBoundingClientRect(),s=getComputedStyle(el);
 return {id:el.id,x:r.x,y:r.y,w:r.width,h:r.height,scrollW:el.scrollWidth,scrollH:el.scrollHeight,scrollTop:el.scrollTop,
  font:s.font,fontFamily:s.fontFamily,lineHeight:s.lineHeight,whiteSpace:s.whiteSpace,padding:s.padding,margin:s.margin,borderWidth:s.borderWidth,display:s.display,overflow:s.overflow};
});}
function hitTargets(){return ['send','upload','join','entry','menuItem','ok','disabled','activeTab','tabClose','channel'].map(id=>{
 const r=document.getElementById(id).getBoundingClientRect();
 const points=[[r.width/2,r.height/2]];
 for(const inset of [.5,1.5,3.5,5.5]){
  points.push([inset,inset],[r.width-inset,inset],[inset,r.height-inset],[r.width-inset,r.height-inset]);
 }
 return points.map(([x,y])=>document.elementFromPoint(r.left+x,r.top+y)?.closest('[id]')?.id||null);
});}
function paint(){
 const ids=['chat','header','title','tabRail','tab','activeTab','activeTabLabel','tabCloseStroke','tabUnread','contactTab','contactName','activeChannel','history','message','stamp','link','dayDivider','unreadDivider','sendError','composer','entry','send','sendGlyph','upload','uploadIcon','join','ok','disabled','icon','avatar','status','emoji','friends','members','menu','dialog','dialogHeader','dialogBody','voice','voiceTitle','voiceLabel','voiceStroke','voiceHistory'];
 return Object.fromEntries(ids.map(id=>{
  const s=getComputedStyle(document.getElementById(id));
  const border=s.borderWidth==='0px'?null:s.borderColor,outline=s.outlineStyle==='none'?null:s.outlineColor;
  return [id,{bg:s.backgroundColor,image:s.backgroundImage,color:s.color,radius:s.borderRadius,shadow:s.boxShadow,fill:s.fill,stroke:s.stroke,strokeWidth:s.strokeWidth,border,outline}];
 }));
}
function referenceHtml(theme){
 const css=['tokens.css','panel.css','kit.css',...(theme==='steam'?[]:['themes/'+theme+'.css'])].map(f=>read('browser-extension/ui/'+f)).join('\n');
 return '<!doctype html><style>'+css+'.panel *{animation:none!important;transition:none!important}</style><div class="panel" data-rt-theme="'+theme+'">'+
  '<div class="bar"><span class="wordmark" id="title">Squad lounge</span></div>'+
  '<button class="primary" id="send">Send</button><button id="join">Join voice</button>'+
  '<div class="tabs"><button id="activeTab" aria-selected="true">Chat</button><button id="tab">Room</button></div>'+
  '<div class="foot">Footer</div><div class="rt-dialog"><div class="rt-dialog-head"><div class="rt-dialog-title">Dialog</div></div></div><textarea>Draft</textarea>'+
  '<div id="canvas" style="background:var(--rt-bg)"></div><div id="well" style="background:var(--rt-bg-deep)"></div></div>';
}

test('all 25 themes: canonical paint, unchanged layout, controls, imagery and responsive behaviour',{timeout:120000},async()=>{
 const browser=await chromium.launch();
 try{
  const page=await browser.newPage({viewport:{width:1180,height:800}}),ref=await browser.newPage();
  fs.mkdirSync(OUT,{recursive:true});
  await page.setContent(fixture);const baseline=await page.evaluate(metrics),original=await page.evaluate(paint),hits=await page.evaluate(hitTargets);
  const form=page.locator('#sendForm');
  await form.evaluate(el=>el.addEventListener('submit',event=>{event.preventDefault();el.dataset.submitter=event.submitter?.id||'';}));
  await page.screenshot({path:path.join(OUT,'off-fixture.png')});
  let layers=[];
  const insert=content=>page.evaluateHandle(css=>{const sheet=document.createElement('style');sheet.nonce='fixture';sheet.textContent=css;document.head.append(sheet);return sheet;},content);
  const clear=async()=>{for(const h of layers)await h.evaluate(el=>el.remove());layers=[];};
  for(const theme of THEMES){
   await clear();const sheet=stylesFor(theme);await ref.setContent(referenceHtml(theme));
   const expected=await ref.evaluate(()=>{
    const css=selector=>getComputedStyle(document.querySelector(selector));
    return {light:css('.panel').colorScheme==='light',bg:css('#canvas').backgroundColor,well:css('#well').backgroundColor,
     canvasImage:css('.panel').backgroundImage,header:css('.bar').backgroundImage,strip:css('.bar').borderImageSource,title:css('#title').color,
     foot:css('.foot').backgroundImage,footStrip:css('.foot').borderImageSource,dialog:css('.rt-dialog').backgroundImage,
     tab:css('#activeTab').backgroundImage,tabBg:css('#activeTab').backgroundColor,idleTabBg:css('#tab').backgroundColor,
     primary:css('#send').backgroundImage,primaryColor:css('#send').color,borderless:css('#send').borderStyle==='none',
     button:css('#join').backgroundImage,dialogInk:css('.rt-dialog-title').color,input:css('textarea').color};
   });
   layers.push(await insert(sheet.colors));
   assert.deepEqual(await page.evaluate(metrics),baseline,theme+' colors layout');
   let got=await page.evaluate(paint);assert.equal(got.chat.bg,expected.light?original.chat.bg:expected.bg,theme+' canvas');assert.equal(got.history.bg,expected.well,theme+' canonical history');assert.equal(got.send.radius,original.send.radius,theme+' colors retains shapes');assert.equal(got.header.image,'none',theme+' colors removes decorative Steam gradient');
   assert.equal(got.activeTabLabel.color,got.activeTab.color,theme+' current group tab caption follows the palette');
   layers.push(await insert(sheet.full));
   assert.deepEqual(await page.evaluate(metrics),baseline,theme+' full layout');got=await page.evaluate(paint);
   assert.deepEqual(await page.evaluate(hitTargets),hits,theme+' control hit targets including corners');
   assert.equal(got.chat.image,expected.light?original.chat.image:expected.canvasImage,theme+' backdrop');
   if(expected.strip!=='none')assert.ok(got.header.image.startsWith(expected.strip),theme+' canonical header strip');
   else if(['doom','dreamcast'].includes(theme))assert.ok(got.header.image.includes(expected.canvasImage),theme+' backed translucent header');
   else assert.equal(got.header.image,expected.header,theme+' canonical header');
   if(expected.footStrip!=='none')assert.ok(got.composer.image.startsWith(expected.footStrip),theme+' canonical composer strip');
   else if(theme==='dreamcast')assert.ok(got.composer.image.includes(expected.canvasImage),theme+' backed translucent composer');
   else assert.equal(got.composer.image,expected.foot,theme+' canonical composer');
   assert.equal(got.title.color,expected.title,theme+' canonical title ink');
   if(theme==='ricochet')assert.match(got.activeTab.image,/rgb\(255, 179, 107\)/,'Ricochet selected tab has the original orange disc');
   else if(theme==='portal'){
    assert.match(got.activeTab.image,/rgb\(255, 138, 0\)/,'Portal selected tab has the original orange ring');
    assert.equal(got.activeTab.bg,expected.tabBg,'Portal keeps the transparent face beneath the ring');
   }
   else{
    assert.equal(got.activeTab.image,expected.tab,theme+' canonical active tab texture');
    assert.equal(got.activeTab.bg,expected.tabBg,theme+' canonical active tab face');
    assert.equal(got.tab.bg,expected.idleTabBg,theme+' canonical inactive tab face');
   }
   assert.equal(got.activeTabLabel.color,got.activeTab.color,theme+' current group tab caption follows the tab ink');
   assert.equal(got.activeTab.border,original.activeTab.border,theme+' current tab remains borderless');
   if(theme==='classic')assert.match(got.activeTab.shadow,/1px 0px 0px .*inset/,'Classic inset edges on the borderless native tab');
   if(theme==='ipod'){
    assert.match(got.tab.shadow,/-1px 0px 0px 0px inset/,'iPod paints the inner divider');
    assert.equal(got.contactTab.shadow,'none','iPod omits the divider on the end tab');
    assert.equal(await page.locator('#contactTab').evaluate(el=>getComputedStyle(el,'::after').backgroundColor),'rgba(0, 0, 0, 0)','Steam’s last divider yields to the iPod end tab');
   }
   assert.equal(got.dialog.image,expected.dialog,theme+' canonical dialog');
   if(theme==='doom')assert.equal(got.dialogHeader.color,'rgb(255, 211, 77)','Doom uses its brighter HUD ink on the stone dialog');
   else if(theme!=='classic')assert.equal(got.dialogHeader.color,expected.dialogInk,theme+' canonical dialog title ink');
   assert.equal(got.entry.color,expected.input,theme+' canonical input ink');
   assert.equal(got.join.image,expected.button,theme+' canonical secondary button');
   assert.equal(got.send.image,expected.primary,theme+' canonical primary button surface');
   if(expected.borderless)assert.equal(got.send.border,'rgba(0, 0, 0, 0)',theme+' original borderless face with unchanged hit area');
   assert.equal(got.sendGlyph.fill,got.send.color,theme+' theme ink on the native send glyph');
   assert.equal(got.sendGlyph.strokeWidth,original.sendGlyph.strokeWidth,theme+' native send glyph stroke geometry');
   assert.notDeepEqual(got.menu,original.menu,theme+' current inline context menu is themed');
   if(!['gmod','ipod','msn','x360','payday','quake'].includes(theme)){
    assert.equal(got.send.color,expected.primaryColor,theme+' canonical primary button ink');
   }
   if(['combine','cs16','cs2','deadlock','dod','doom','dreamcast','hev','l4d','msn','payday','pipboy','portal','quake','ricochet','rust','tf2','x360','xmb'].includes(theme)){
    assert.notEqual(got.history.image,'none',theme+' history exposes its original texture');
   }
   if(theme==='xmb')assert.match(got.history.image,/50% 100% at 50% 100%/,'XMB carries the original ribbon contours');
   if(theme==='dod')assert.notEqual(got.link.color,got.message.color,'field-log links stay distinct on paper');
   if(theme==='quake'){
    const ink=await page.locator('#dialogHeader').evaluate(el=>{
     el.insertAdjacentHTML('beforeend','<svg aria-hidden="true" viewBox="0 0 10 10"><path fill="currentColor" d="M0 0h10v10H0z"/></svg>');
     const svg=el.lastElementChild;
     const fill=getComputedStyle(svg.firstElementChild).fill;
     svg.remove();
     return fill;
    });
    assert.notEqual(ink,'rgba(0, 0, 0, 0)','Quake title art keeps an embedded icon visible');
   }
   if(expected.light)for(const id of ['friends','members'])assert.deepEqual(got[id],original[id],theme+' preserves native presence surface');
   for(const id of ['icon','status','contactName','unreadDivider','sendError','upload','uploadIcon'])assert.deepEqual(got[id],original[id],theme+' preserves '+id);
   for(const key of ['stroke','strokeWidth'])assert.equal(got.tabCloseStroke[key],original.tabCloseStroke[key],theme+' preserves native tab close '+key);
   for(const id of ['avatar','emoji','tabUnread']){const {color:unused,...visual}=got[id],{color:unusedOriginal,...originalVisual}=original[id];assert.deepEqual(visual,originalVisual,theme+' preserves '+id);}
   if(['steam','classic','tf2','winxp','minecraft','xmb'].includes(theme))await page.screenshot({path:path.join(OUT,theme+'-full-fixture.png')});
   if(theme==='portal'){
    await page.hover('#tab');
    assert.match((await page.evaluate(paint)).tab.image,/rgb\(42, 157, 255\)/,'Portal uses its original blue hover ring');
    await page.hover('#activeTab');
    assert.match((await page.evaluate(paint)).activeTab.image,/rgb\(255, 138, 0\)/,'Portal selection stays orange on hover');
    await page.mouse.move(0,0);
   }
   await page.locator('#entry').focus();await page.keyboard.press('Tab');
   assert.equal(await page.evaluate(()=>document.activeElement.id),'send');
   assert.equal(await page.locator('#send').evaluate(el=>el.matches(':focus-visible')),true,theme+' keyboard focus');
   assert.deepEqual(await page.evaluate(metrics),baseline,theme+' focus layout');
   const focused=(await page.evaluate(paint)).send;
   assert.ok(focused.outline,theme+' visible keyboard focus');
   assert.equal(focused.shadow,got.send.shadow,theme+' focus preserves the authored bevel');
   await form.evaluate(el=>delete el.dataset.submitter);
   await page.hover('#send');assert.deepEqual(await page.evaluate(metrics),baseline,theme+' hover layout');
   await page.mouse.down();assert.deepEqual(await page.evaluate(metrics),baseline,theme+' pressed layout');
   await page.mouse.up();
   assert.equal(await form.getAttribute('data-submitter'),'send',theme+' native submit event reaches the form');
   if(['classic','doom','quake','minecraft'].includes(theme)){
    await page.hover('#join');
    const raised=(await page.evaluate(paint)).join.shadow;
    await page.mouse.down();
    assert.notEqual((await page.evaluate(paint)).join.shadow,raised,theme+' pressed button seats into its bevel');
    await page.mouse.up();
   }
   const disabledButton=page.locator('#send');
   await disabledButton.evaluate(el=>el.disabled=true);
   assert.equal((await page.evaluate(paint)).sendGlyph.fill,original.sendGlyph.fill,theme+' disabled send glyph stays native');
   await disabledButton.evaluate(el=>el.disabled=false);
   await page.mouse.move(0,0);await page.locator('#entry').focus();
  }
  await page.locator('#entry').blur();
  await clear();assert.deepEqual(await page.evaluate(paint),original,'Off restores every sampled paint property');
  await page.locator('#history > .chatHistory').evaluate(el=>el.replaceChildren(el.querySelector('.disconnectBlocker')));
  const idle=await page.evaluate(metrics);
  for(const theme of THEMES){
   const {colors,full}=stylesFor(theme);
   layers.push(await insert(colors));
   assert.doesNotMatch(await page.locator('#history').evaluate(el=>getComputedStyle(el).backgroundImage),/data:image/,theme+' Colors excludes idle art');
   layers.push(await insert(full));
   const mascot=fs.readFileSync(path.join(ROOT,'app/companion/ui/logos',theme+'-32.png')).toString('base64');
   assert.ok((await page.locator('#history').evaluate(el=>getComputedStyle(el).backgroundImage)).includes(mascot),theme+' exact bundled idle mascot');
   assert.deepEqual(await page.evaluate(metrics),idle,theme+' idle layout');
   await page.locator('#root').evaluate(el=>el.classList.add('errorDisconnected'));
   assert.doesNotMatch(await page.locator('#history').evaluate(el=>getComputedStyle(el).backgroundImage),/data:image/,theme+' disconnected history keeps its native state');
   await page.locator('#root').evaluate(el=>el.classList.remove('errorDisconnected'));
   await clear();
  }
  await page.setContent(fixture);
  await page.locator('#voice').evaluate(el=>el.style.display='flex');const withVoice=await page.evaluate(metrics);
  const voiceStyle=stylesFor('tf2');layers.push(await insert(voiceStyle.colors),await insert(voiceStyle.full));
  assert.deepEqual(await page.evaluate(metrics),withVoice,'open voice-room chat and its composer keep their layout');
  assert.notEqual((await page.evaluate(paint)).voiceHistory.bg,original.voiceHistory.bg,'open voice-room history is themed');
  assert.equal((await page.evaluate(paint)).voice.bg,original.voice.bg,'voice-room modal backdrop stays translucent');
  assert.equal((await page.evaluate(paint)).voiceTitle.image,(await page.evaluate(paint)).header.image,'voice scratch pad shares the original header finish');
  assert.equal((await page.evaluate(paint)).voiceStroke.stroke,original.voiceStroke.stroke,'scratch pad minimize glyph stays white');
  await clear();await page.locator('#voice').evaluate(el=>el.style.display='none');
  // Narrow window: Steam's fixture hides its optional member column on its own.
  await page.setViewportSize({width:660,height:620});await page.evaluate(()=>document.getElementById('history').scrollTop=90);
  const narrow=await page.evaluate(metrics);
  for(const theme of THEMES){
   await clear();const s=stylesFor(theme);layers.push(await insert(s.colors),await insert(s.full));
   assert.deepEqual(await page.evaluate(metrics),narrow,theme+' narrow layout and scroll');
  }
  await clear();
  // Real structural probe: loading, empty chat, closed optional voice panel and
  // read-only chats do not count as upstream failure.
  const probe=()=>page.evaluate(inspectPage);
  assert.deepEqual(await probe(),{ready:true,base:true,full:true});
  await page.locator('#history').evaluate(el=>el.replaceChildren());assert.equal((await probe()).full,true,'empty history');
  await page.locator('#composer').evaluate(el=>el.remove());assert.equal((await probe()).full,true,'read-only chat');
  await page.locator('#chat').evaluate(el=>el.style.display='none');assert.equal((await probe()).full,true,'closed chat');
  await page.setContent(fixture);await page.locator('#history').evaluate(el=>el.className='NewHistory');await page.locator('#historyContainer').evaluate(el=>el.className='NewContainer');assert.equal((await probe()).full,false,'missing required history');
  await page.locator('#chat').evaluate(el=>el.setAttribute('aria-busy','true'));assert.equal((await probe()).ready,false,'busy chat');
  // A body-root is supported, and the paint becomes inert if the chat root goes away.
  await page.setContent(fixture);await page.evaluate(()=>{document.body.className='friendsui-container';document.getElementById('root').className='';});
  const s=stylesFor('winxp');layers.push(await insert(s.colors));assert.equal((await page.evaluate(paint)).history.bg,'rgb(255, 255, 255)');
  await page.evaluate(()=>document.body.className='');assert.equal((await page.evaluate(paint)).history.bg,original.history.bg);await clear();
 }finally{await browser.close();}
});

test('Windows Electron: removable CSS priority, lifecycle, settings recovery and no Steam privileges',{skip:process.platform!=='win32',timeout:120000},async()=>{
 const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'tyler-appearance-'));fs.mkdirSync(OUT,{recursive:true});
 const settings=path.join(tmp,'settings.html');
 fs.writeFileSync(settings,'<!doctype html><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src \'none\'; style-src \'self\'; script-src \'self\'"><link rel="stylesheet" href="'+pathToFileURL(path.join(ROOT,'app/companion/ui/tokens.css')).href+'"><link rel="stylesheet" href="'+pathToFileURL(path.join(ROOT,'app/companion/settings.css')).href+'"><body data-desktop="true">'+read('app/desktop-overrides/steam-appearance.html')+'<script src="'+pathToFileURL(path.join(ROOT,'app/companion/steam-appearance-settings.js')).href+'"></script></body>');
 const main=path.join(tmp,'main.cjs');
 fs.writeFileSync(main,`const {app,BrowserWindow,protocol,ipcMain,Menu}=require('electron');const fs=require('fs');
 app.setPath('userData',${JSON.stringify(path.join(tmp,'profile'))});
 globalThis.boot=app.whenReady().then(async()=>{
 Menu.setApplicationMenu(null);
 protocol.handle('https',()=>new Response(fs.readFileSync(${JSON.stringify(path.join(ROOT,'tests/fixtures/steam-appearance.html'))}),{headers:{'content-type':'text/html'}}));
 globalThis.chat=new BrowserWindow({show:false,width:1180,height:800,webPreferences:{contextIsolation:true,sandbox:true,nodeIntegration:false}});
 globalThis.appearance=require(${JSON.stringify(path.join(ROOT,'app/steam-appearance/controller.cjs'))}).createAppearance(chat.webContents,{delay:10,maxWaits:6});
 globalThis.prefs={uiTheme:'steam',steamChatAppearance:'off'};globalThis.choose=async(mode,theme=prefs.uiTheme)=>{prefs={uiTheme:theme,steamChatAppearance:mode};await appearance.update(prefs);};
 globalThis.options=new BrowserWindow({show:false,width:900,height:650,webPreferences:{contextIsolation:true,sandbox:true,nodeIntegration:false,preload:${JSON.stringify(path.join(ROOT,'app/options-preload.cjs'))}}});
 ipcMain.handle('tyler:settings',async(event,request)=>{if(event.sender!==options.webContents||event.senderFrame!==options.webContents.mainFrame)throw Error('Settings only');if(request.action==='steam-appearance')return appearance.status();if(request.action==='set'){const values=require(${JSON.stringify(path.join(ROOT,'app/guards.cjs'))}).sanitizeSettings(request.values);prefs={...prefs,...values};await appearance.update(prefs);return {}; }return {};});
 await options.loadFile(${JSON.stringify(settings)});await chat.loadURL('https://steamcommunity.com/chat/');
 });app.on('window-all-closed',()=>app.quit());`);
 const electron=await _electron.launch({executablePath:require('electron'),args:[main]});
 try{
  await electron.evaluate(async()=>{await globalThis.boot;});const pages=electron.windows();const page=pages.find(p=>p.url().startsWith('https://steamcommunity.com/chat/'));
  assert.ok(page,'controlled chat fixture opens');await page.waitForLoadState('load');
  const options=pages.find(p=>p.url().startsWith('file:'));assert.ok(options,'separate Settings window opens');
  await options.evaluate(()=>document.body.dataset.zone='appearance');await options.waitForSelector('#steamAppearanceMode');
  const original=await page.evaluate(paint),geometry=await page.evaluate(metrics);
  const choose=(mode,theme)=>electron.evaluate(async(_,{mode,theme})=>{await globalThis.choose(mode,theme);return globalThis.appearance.status();},{mode,theme});
  for(const theme of ['steam','classic','tf2','winxp','minecraft','xmb']){
   const status=await choose('full',theme);assert.equal(status.effective,'full');
   assert.deepEqual(await page.evaluate(metrics),geometry,theme+' native Electron layout');
   const p=await page.evaluate(paint);assert.notEqual(p.history.bg,original.history.bg,theme+' Steam history is themed');
   assert.notDeepEqual([p.send.bg,p.send.image],[original.send.bg,original.send.image],theme+' native send has the theme face');
   assert.notDeepEqual([p.join.bg,p.join.image],[original.join.bg,original.join.image],theme+' targeted paint overrides Steam fixture important rules');
   await choose('colors',theme);assert.equal((await page.evaluate(paint)).header.image,'none','Colors removes the full header paint');
   await choose('off',theme);assert.deepEqual(await page.evaluate(paint),original,'Off removes both native stylesheets');
  }
  await page.locator('#history > .chatHistory').evaluate(el=>el.replaceChildren(el.querySelector('.disconnectBlocker')));
  await choose('full','pipboy');
  assert.equal(await page.locator('#history').evaluate(async el=>{
   const uri=/url\("([^"]+)"\)/.exec(getComputedStyle(el).backgroundImage)?.[1];
   const img=new Image();img.src=uri;await img.decode();
   return img.naturalWidth;
  }),32,'the exact idle image decodes under the fixture CSP');
  await choose('colors','pipboy');
  assert.equal(await page.locator('#history').evaluate(el=>getComputedStyle(el).backgroundImage),'none','Colors removes the idle image and the CRT paint');
  // Page scripts have no privileged settings/Node API.
  assert.deepEqual(await page.evaluate(()=>({bridge:typeof window.tylerSettings,node:typeof window.require})),{bridge:'undefined',node:'undefined'});
  await choose('full','winxp');await page.reload();await page.waitForFunction(()=>getComputedStyle(document.getElementById('history')).backgroundColor==='rgb(252, 252, 254)');
  await page.fill('#entry','Unsent text stays in place');await choose('full','tf2');assert.equal(await page.inputValue('#entry'),'Unsent text stays in place');
  await choose('full','winxp');
  await page.goto('https://steamcommunity.com/login/');await page.waitForLoadState('load');assert.deepEqual(await page.evaluate(paint),original,'login stays original even with matching fixture classes');
  await page.goto('https://checkout.steampowered.com/checkout/');assert.deepEqual(await page.evaluate(paint),original,'payment stays original');
  await page.goto('https://steamcommunity.com/chat/');await page.waitForFunction(()=>getComputedStyle(document.getElementById('history')).backgroundColor==='rgb(252, 252, 254)');
  // Simulate an unusable chat without interfering with the separate Settings.
  await page.evaluate(()=>document.getElementById('root').style.pointerEvents='none');
  await options.click('#steamAppearanceOff');await page.waitForFunction(()=>getComputedStyle(document.getElementById('history')).backgroundColor==='rgb(32, 44, 59)');
  assert.equal(await options.inputValue('#steamAppearanceMode'),'off');
  await options.selectOption('#steamAppearanceMode','full');await page.waitForFunction(()=>getComputedStyle(document.getElementById('history')).backgroundColor==='rgb(252, 252, 254)');
  await options.click('#steamAppearanceColors');await options.waitForFunction(()=>document.getElementById('steamAppearanceMode').value==='colors');
  assert.equal((await page.evaluate(paint)).send.radius,original.send.radius);
 }finally{await electron.close();if(path.dirname(tmp)!==path.resolve(os.tmpdir())||!path.basename(tmp).startsWith('tyler-appearance-'))throw Error('Unexpected temporary test directory');fs.rmSync(tmp,{recursive:true,force:true});}
});

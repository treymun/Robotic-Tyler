// End-to-end (v2.45): the memory meter in Tyler's panel, in real Chromium on the preview page (a stand-in
// Steam chat page with the real content scripts). MOCKED: the app's readings (tools/preview/panel.html's
// 'memory:read' answer, or one set by the test). Real: the panel, its themes and layout.
import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const {chromium}=require('playwright');
const ROOT=path.resolve(import.meta.dirname,'../..');
const types={'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.json':'application/json','.svg':'image/svg+xml','.png':'image/png','.webp':'image/webp','.woff2':'font/woff2'};
// The layout audit (tools/preview/layout-audit.mjs), run on one element: the meter itself (its root lookup takes a
// node as the root, so it sees inside the panel's shadow root).
const auditSrc=(()=>{const src=fs.readFileSync(path.join(ROOT,'tools/preview/layout-audit.mjs'),'utf8');const a=src.indexOf('function audit(scope){'),b=src.indexOf('\n}\n',a);return src.slice(a,b+2);})();
const auditIn=el=>`(${auditSrc.replace("const root=scope==='#shadow'","const root=scope instanceof Node?scope:scope==='#shadow'")})(${el})`;
const R='document.getElementById("tyler-companion-root").shadowRoot';

test('memory meter: off by default, shown with the readings when on, quiet when collapsed, "—" with the reason, any height',{timeout:180000},async()=>{
 const server=http.createServer((req,res)=>{const file=path.join(ROOT,decodeURIComponent(new URL(req.url,'http://x').pathname));if(!file.startsWith(ROOT)||!fs.existsSync(file)||fs.statSync(file).isDirectory()){res.writeHead(404);res.end();return;}res.writeHead(200,{'content-type':types[path.extname(file)]||'application/octet-stream'});fs.createReadStream(file).pipe(res);}).listen(0);
 const browser=await chromium.launch(),base='http://127.0.0.1:'+server.address().port+'/tools/preview/panel.html?';
 const open=async(q,errors)=>{const p=await browser.newPage({viewport:{width:1380,height:900}});p.on('pageerror',e=>errors.push(e.message));await p.goto(base+q);await p.waitForFunction(()=>window.__tylerReady===true);await p.waitForTimeout(800);return p;};
 const meter=p=>p.evaluate(R=>{const r=eval(R),m=r.getElementById('memMeter'),g=k=>r.querySelector('.tyler-mem-'+k),txt=(k,c)=>g(k).querySelector(c).textContent;
  return {hidden:m.hidden,state:m.dataset.state,ram:[txt('ram','.tyler-mem-label'),txt('ram','.tyler-mem-value'),txt('ram','.tyler-mem-own')],vram:[txt('vram','.tyler-mem-value'),txt('vram','.tyler-mem-own')],
   pieces:['used','sep','total','unit','own-label','own-value','pct','card'].map(c=>g('vram').querySelector('.tyler-mem-'+c).textContent),
   extrasShown:['pct','card'].map(c=>getComputedStyle(g('vram').querySelector('.tyler-mem-'+c)).display!=='none'),
   partVars:[...r.querySelectorAll('.tyler-mem-item:not(.tyler-mem-head)')].map(li=>[li.style.getPropertyValue('--ram'),li.style.getPropertyValue('--vram')]),
   level:[g('ram').dataset.level,g('vram').dataset.level],missing:g('vram').dataset.missing,fill:g('vram').style.getPropertyValue('--fill'),own:g('vram').style.getPropertyValue('--own'),tip:g('vram').getAttribute('data-tip'),
   items:[...r.querySelectorAll('.tyler-mem-item:not(.tyler-mem-head)')].map(li=>[li.dataset.part,li.dataset.running,...[...li.children].map(c=>c.textContent)]),reads:window.__memReads||0};},R);
 try{
  const errors=[];
  // Off (the default): hidden, and the app is never asked.
  let p=await open('platform=desktop-voice&theme=steam',errors);await p.waitForTimeout(2800);
  let m=await meter(p);assert.equal(m.hidden,true);assert.equal(m.reads,0,'off: no readings asked for');await p.close();
  // Chrome: never shown, never asked, even with the setting saved.
  p=await open('platform=chrome&memory=on&theme=steam',errors);await p.waitForTimeout(2800);
  m=await meter(p);assert.equal(m.hidden,true);assert.equal(m.reads,0,'Chrome has no meter');await p.close();
  // On, in a few themes: the readings in place, every part listed, the layout clean.
  for(const theme of ['steam','doom','msn']){
   p=await open('platform=desktop-voice&memory=on&theme='+theme,errors);
   m=await meter(p);
   assert.equal(m.hidden,false,theme);assert.equal(m.state,'on');assert.deepEqual(m.ram,['RAM','14.2/32 GB','Tyler 6.1 GB']);assert.deepEqual(m.vram,['11.6/12 GB','Tyler 9.8 GB']);
   assert.deepEqual(m.pieces,['11.6','/','12',' GB','Tyler ','9.8 GB','97%','NVIDIA GeForce RTX 3060'],'the digits in pieces, for skins');
   assert.deepEqual(m.extrasShown,[false,false],'the percentage and the card’s name are there for skins, hidden by default');
   assert.deepEqual(m.partVars[1],['0.075','0.258'],'each part’s share, for skins’ own bars');
   assert.deepEqual(m.level,['ok','full']);assert.equal(m.missing,'false');assert.equal(m.fill,'0.967');assert.equal(m.own,'0.815');assert.match(m.tip,/^NVIDIA GeForce RTX 3060: 11\.6 GB in use/);
   assert.deepEqual(m.items.map(i=>i[0]),['app','text','voices','speech','images','other']);assert.deepEqual(m.items[4],['images','false','Images on this PC','off','off']);
   await p.evaluate(R=>{eval(R).querySelector('.tyler-mem-details').open=true;},R);await p.waitForTimeout(200);
   const audit=await p.evaluate(`(()=>{const r=${R};return ${auditIn("r.getElementById('memMeter')")};})()`);assert.deepEqual(audit,[],theme+': '+JSON.stringify(audit));
   const box=await p.evaluate(R=>{const r=eval(R),b=e=>e.getBoundingClientRect();return {hud:b(r.getElementById('hud')).bottom,top:b(r.getElementById('memMeter')).top,bottom:b(r.getElementById('memMeter')).bottom,tabs:b(r.querySelector('.tabs')).top};},R);
   assert.ok(box.top>=box.hud-1&&box.bottom<=box.tabs+1,theme+': under the numbers, above the tabs '+JSON.stringify(box));
   if(theme==='steam'){
    // It keeps asking while it's seen (every 2.5 s), and not while the panel is collapsed.
    const before=(await meter(p)).reads;await p.waitForTimeout(2700);assert.ok((await meter(p)).reads>before,'refreshes');
    await p.evaluate(R=>eval(R).getElementById('collapse').click(),R);await p.waitForTimeout(400);const c=(await meter(p)).reads;await p.waitForTimeout(3000);
    assert.equal((await meter(p)).reads,c,'collapsed: no readings');
    await p.evaluate(R=>eval(R).getElementById('collapse').click(),R);await p.waitForTimeout(600);assert.ok((await meter(p)).reads>c,'expanded: reading again');
    // A reading that isn't there: "—" and the reason.
    await p.evaluate(()=>{window.__memReading={at:Date.now(),ram:{label:'RAM',value:'8.0/16 GB',used:'8.0',total:'16',unit:' GB',own:'Tyler —',ownValue:'—',pct:'50%',card:'',fill:.5,ownFill:0,level:'ok',missing:false,tip:'PC memory: 8.0 GB in use of 16.0 GB. Tyler’s share: — (Windows didn’t answer: timeout)'},
     vram:{label:'VRAM',value:'—',used:'—',total:'',unit:'',own:'Tyler —',ownValue:'—',pct:'—',card:'',fill:0,ownFill:0,level:'ok',missing:true,tip:'Graphics memory: — (Windows didn’t answer: timeout)'},parts:[{id:'app',label:'The app',running:true,ram:'—',vram:'—'},{id:'other',label:'Other programs',running:true,ram:'—',vram:'—'}]};});
    await p.waitForTimeout(2800);m=await meter(p);assert.deepEqual(m.vram,['—','Tyler —']);assert.equal(m.missing,'true');assert.equal(m.fill,'0');assert.match(m.tip,/didn’t answer: timeout/);
   }
   await p.close();
  }
  // A skin may make it taller or shorter: it stays in the panel's flow.
  for(const css of ['.tyler-mem-stats{min-height:150px}','.tyler-mem-stats{padding:0}.tyler-mem-meter>:not(.tyler-mem-value){display:none}.tyler-mem-details{display:none}']){
   p=await open('platform=desktop-voice&memory=on&theme=pipboy',errors);
   await p.evaluate(([R,css])=>{const r=eval(R),s=new CSSStyleSheet();s.replaceSync(css);r.adoptedStyleSheets=[...r.adoptedStyleSheets,s];},[R,css]);await p.waitForTimeout(200);
   const box=await p.evaluate(R=>{const r=eval(R),b=e=>e.getBoundingClientRect();return {meter:b(r.getElementById('memMeter')).height,bottom:b(r.getElementById('memMeter')).bottom,next:b(r.querySelector('.tabs')).top,tabs:b(r.querySelector('.tabs')).top,scroll:b(r.querySelector('.scroll')).height};},R);
   assert.ok(box.bottom<=box.next+1&&box.bottom<=box.tabs+1&&box.scroll>100,css+' '+JSON.stringify(box));
   await p.close();
  }
  // A skin can build its own gauge from the contract alone: the hidden pieces, --fill on a pseudo-element, --ram per part.
  p=await open('platform=desktop-voice&memory=on&theme=steam',errors);
  const skin='.tyler-mem-pct,.tyler-mem-card{display:inline}.tyler-mem-value,.tyler-mem-bar{display:none}.tyler-mem-meter::after{content:"";display:block;height:2px;width:calc(var(--fill) * 100px)}'+
   '.tyler-mem-item::after{content:"";display:block;width:calc(var(--ram) * 200px)}.tyler-mem-meter[data-level=full] .tyler-mem-pct{color:rgb(255, 0, 0)}';
  await p.evaluate(([R,css])=>{const r=eval(R),s=new CSSStyleSheet();s.replaceSync(css);r.adoptedStyleSheets=[...r.adoptedStyleSheets,s];},[R,skin]);await p.waitForTimeout(200);
  const k=await p.evaluate(R=>{const r=eval(R),v=r.querySelector('.tyler-mem-vram'),cs=(e,pe)=>getComputedStyle(e,pe);
   return {pct:[r.querySelector('.tyler-mem-vram .tyler-mem-pct').textContent,cs(r.querySelector('.tyler-mem-vram .tyler-mem-pct')).display,cs(r.querySelector('.tyler-mem-vram .tyler-mem-pct')).color],
    bar:cs(v,'::after').width,part:cs(r.querySelector('.tyler-mem-item[data-part=text]'),'::after').width,value:cs(r.querySelector('.tyler-mem-vram .tyler-mem-value')).display};},R);
  assert.ok(Math.abs(parseFloat(k.bar)-96.7)<0.1,'a bar from --fill: '+k.bar);assert.ok(Math.abs(parseFloat(k.part)-15)<0.1,'a bar from --ram: '+k.part);
  // (Shown: inline, or blockified inside a skin's grid, as Steam's is.)
  assert.deepEqual([k.pct[0],k.pct[1]!=='none',k.pct[2],k.value],['97%',true,'rgb(255, 0, 0)','none'],JSON.stringify(k));
  await p.close();
  assert.deepEqual(errors,[]);
 }finally{await browser.close();server.close();}
});

test('memory meter on the phone remote: the same readings in the phone’s copy of the panel (mocked Steam window, real remote server)',{timeout:180000},async()=>{
 const {devices}=require('playwright'),{setupRemote}=require('../../app/remote.cjs'),{memoryStorage}=require('../../app/vault.cjs');
 const files=http.createServer((req,res)=>{const file=path.join(ROOT,decodeURIComponent(new URL(req.url,'http://x').pathname));if(!file.startsWith(ROOT)||!fs.existsSync(file)||fs.statSync(file).isDirectory()){res.writeHead(404);res.end();return;}res.writeHead(200,{'content-type':types[path.extname(file)]||'application/octet-stream'});fs.createReadStream(file).pipe(res);}).listen(0);
 const browser=await chromium.launch(),errors=[];let remote=null;
 try{
  const pc=await (await browser.newContext({viewport:{width:1380,height:920}})).newPage();pc.on('pageerror',e=>errors.push('pc: '+e.message));
  await pc.exposeFunction('__remoteEvent',m=>remote?.push(m.events));
  await pc.goto('http://127.0.0.1:'+files.address().port+'/tools/preview/panel.html?theme=doom&platform=desktop-voice&memory=on');await pc.waitForFunction(()=>window.__tylerReady===true&&window.TylerRemote);
  await pc.evaluate(()=>{window.__results=[];handlers['remote:result']=m=>{window.__results.push(m);return {};};handlers['remote:event']=m=>{window.__remoteEvent(m);return {};};});
  const ask=(action,args={})=>pc.evaluate(async([action,args])=>{const id='t'+Math.random().toString(36).slice(2);for(const fn of listeners)fn({type:'remote:action',id,action,args});
   for(let i=0;i<250;i++){const r=window.__results.find(x=>x.id===id);if(r){if(!r.ok)throw Error(r.error);return r.data;}await new Promise(x=>setTimeout(x,20));}throw Error('no answer');},[action,args]);
  remote=setupRemote({vault:memoryStorage(),ask,pageDir:path.join(ROOT,'app','remote'),uiDir:path.join(ROOT,'app','companion','ui'),libDir:path.join(ROOT,'app','companion'),version:'2.44.0',theme:async()=>'doom',prefs:{get:async()=>({theme:'doom',muteCall:false}),theme:async()=>{},muteCall:async()=>{}}});
  const s=await remote.handle('enable'),phone=await (await browser.newContext({...devices['iPhone 14']})).newPage();phone.on('pageerror',e=>errors.push('phone: '+e.message));
  // What the Steam window reports: the meter's text, checked (remote-control.js).
  await pc.waitForFunction(()=>window.__memReads>0);await pc.waitForTimeout(300);
  const st=await ask('state');assert.equal(st.memory.ram.value,'14.2/32 GB');assert.equal(st.memory.vram.level,'full');assert.deepEqual(st.memory.parts.map(p=>p.id),['app','text','voices','speech','images','other']);
  await phone.goto('http://127.0.0.1:'+s.port+'/?code='+s.code);await phone.waitForFunction(()=>globalThis.__tylerRemote?.state().link==='live',null,{timeout:30000});
  const inPhone=async fn=>{const r=await phone.evaluateHandle(()=>document.getElementById('tyler').shadowRoot);try{return await r.evaluate(fn);}finally{await r.dispose();}};
  for(let i=0;i<60&&await inPhone(r=>r.getElementById('memMeter').hidden);i++)await phone.waitForTimeout(250);
  const m=await inPhone(r=>({hidden:r.getElementById('memMeter').hidden,ram:r.querySelector('.tyler-mem-ram .tyler-mem-value').textContent,vram:r.querySelector('.tyler-mem-vram .tyler-mem-value').textContent,level:r.querySelector('.tyler-mem-vram').dataset.level,
   fill:r.querySelector('.tyler-mem-vram').style.getPropertyValue('--fill'),items:r.querySelectorAll('.tyler-mem-item:not(.tyler-mem-head)').length}));
  assert.deepEqual(m,{hidden:false,ram:'14.2/32 GB',vram:'11.6/12 GB',level:'full',fill:'0.967',items:6});
  assert.equal(await phone.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,'no sideways scrolling on a phone');
  assert.deepEqual(errors,[]);
 }finally{await remote?.stop();await browser.close();files.close();}
});

// v2.45: each of the 25 themes has its own meter skin (the end of ui/themes/<theme>.css; Steam's at the end of
// ui/memory-meter.css). MOCKED: the readings (set here, in app/memory-meter.cjs view()'s shape). Real: the panel,
// every theme's CSS and the pack art it draws (data: URLs), in Chromium with reduced motion.
const SKIN_THEMES=['steam','classic','tf2','cs2','portal','cs16','hev','l4d','winxp','doom','quake','pipboy','combine','deadlock','minecraft','payday','dreamcast','gmod','ricochet','dod','rust','x360','ipod','msn','xmb'];
const gauge=(label,used,total,fill,own,level,ownValue)=>({label,value:used+'/'+total+' GB',used,total,unit:' GB',own:'Tyler '+ownValue,ownValue,pct:Math.round(fill*100)+'%',card:label==='VRAM'?'NVIDIA GeForce RTX 3060':'',fill,ownFill:own,level,missing:false,tip:label+': '+used+' GB in use of '+total+' GB.'});
const noReading=label=>({label,value:'—',used:'—',total:'',unit:'',own:'Tyler —',ownValue:'—',pct:'—',card:'',fill:0,ownFill:0,level:'ok',missing:true,tip:'Graphics memory: — (Windows didn’t answer: timeout)'});
const someParts=[{id:'app',label:'The app',running:true,ram:'943 MB',vram:'180 MB',ramFill:.029,vramFill:.015},{id:'text',label:'Text AI on this PC',running:true,ram:'2.4 GB',vram:'3.1 GB',ramFill:.075,vramFill:.258},
 {id:'voices',label:'Theme voices',running:true,ram:'2.6 GB',vram:'6.5 GB',ramFill:.081,vramFill:.542},{id:'speech',label:'Hearing and voice on this PC',running:true,ram:'210 MB',vram:'0 MB',ramFill:.006,vramFill:0},
 {id:'images',label:'Images on this PC',running:false,ram:'off',vram:'off',ramFill:0,vramFill:0},{id:'other',label:'Other programs',running:true,ram:'8.1 GB',vram:'1.8 GB',ramFill:.254,vramFill:.152}];
const READINGS=[
 {name:'ok + full',levels:['ok','full'],reading:{ram:gauge('RAM','14.2','32',.444,.191,'ok','6.1 GB'),vram:gauge('VRAM','11.6','12',.967,.815,'full','9.8 GB'),parts:someParts}},
 {name:'high + missing',levels:['high','ok'],reading:{ram:gauge('RAM','26.1','32',.816,.3,'high','9.6 GB'),vram:noReading('VRAM'),parts:someParts}},
 {name:'full + ok',levels:['full','ok'],reading:{ram:gauge('RAM','30.2','32',.944,.41,'full','13.1 GB'),vram:gauge('VRAM','3.1','12',.258,.12,'ok','1.4 GB'),parts:someParts}},
];
test('memory meter skins: all 25 themes draw their own meter (not their HUD), readable and in place at ok / high / full, with a reading missing, wide and narrow',{timeout:900000},async()=>{
 const server=http.createServer((req,res)=>{const file=path.join(ROOT,decodeURIComponent(new URL(req.url,'http://x').pathname));if(!file.startsWith(ROOT)||!fs.existsSync(file)||fs.statSync(file).isDirectory()){res.writeHead(404);res.end();return;}res.writeHead(200,{'content-type':types[path.extname(file)]||'application/octet-stream'});fs.createReadStream(file).pipe(res);}).listen(0);
 const browser=await chromium.launch(),errors=[],looks=new Map();
 try{
  // MEM_THEMES=doom,quake limits the run to those themes (while working on a skin).
  const themes=process.env.MEM_THEMES?process.env.MEM_THEMES.split(','):SKIN_THEMES;
  for(const theme of themes){
   const p=await browser.newPage({viewport:{width:1380,height:900},reducedMotion:'reduce'});p.on('pageerror',e=>errors.push(theme+': '+e.message));
   await p.goto('http://127.0.0.1:'+server.address().port+'/tools/preview/panel.html?platform=desktop-voice&memory=on&theme='+theme);
   await p.waitForFunction(()=>window.__tylerReady===true);await p.waitForTimeout(500);await p.evaluate(()=>document.fonts.ready);
   for(const width of [0,340]){
    if(width)await p.evaluate(([R,w])=>{eval(R).querySelector('.panel').style.width=w+'px';},[R,width]);
    for(const {name,levels,reading} of READINGS){
     const at=theme+' '+(width?width+' px ':'')+name;
     await p.evaluate(([R,reading])=>{window.__memReading={at:Date.now(),...reading};const r=eval(R),m=r.getElementById('memMeter');TylerMemoryMeter.render(m,window.__memReading);m.querySelector('.tyler-mem-details').open=true;},[R,reading]);
     await p.waitForTimeout(80);
     const m=await p.evaluate(`(()=>{const r=${R},sec=r.getElementById('memMeter'),cs=(e,pe)=>getComputedStyle(e,pe||null),b=e=>e.getBoundingClientRect();
      const g=k=>r.querySelector('.tyler-mem-'+k),num=g('ram').querySelector('.tyler-mem-used'),hudNum=r.getElementById('hudSpend'),hudStat=hudNum.closest('.stat');
      const pick=(e,keys,pe)=>keys.map(k=>cs(e,pe).getPropertyValue(k)),NUM=['font-family','font-size','font-weight','color','text-shadow','letter-spacing','background-image'],BOX=['background-color','background-image','border-top-width','border-left-width','border-radius','padding-left','box-shadow','display'];
      const differ=(a,c)=>a.filter((v,i)=>v!==c[i]).length;
      // Every text piece shows in full (nothing cut off or spilling out of the meter).
      const clipped=[...sec.querySelectorAll('.tyler-mem-label,.tyler-mem-value,.tyler-mem-own,.tyler-mem-pct')].filter(e=>cs(e).display!=='none'&&e.offsetParent).filter(e=>e.scrollWidth>e.clientWidth+1||b(e).right>b(sec).right+1||b(e).left<b(sec).left-1).map(e=>e.className+' '+e.textContent);
      const look=JSON.stringify([...sec.querySelectorAll('.tyler-mem-meter,.tyler-mem-bar,.tyler-mem-value,.tyler-mem-label')].slice(0,4).map(e=>[cs(e).display,cs(e).backgroundImage.slice(0,80),cs(e).maskImage.slice(0,40),cs(e).fontFamily,cs(e).height]));
      return {skin:cs(sec).getPropertyValue('--mem-skin').trim(),levels:[g('ram').dataset.level,g('vram').dataset.level],missing:g('vram').dataset.missing,
       numDiff:differ(pick(num,NUM),pick(hudNum,NUM)),boxDiff:differ(pick(g('ram'),BOX),pick(hudStat,BOX)),clipped,look,
       running:sec.getAnimations({subtree:true}).filter(a=>a.playState==='running').length,
       place:{hud:b(r.getElementById('hud')).bottom,top:b(sec).top,bottom:b(sec).bottom,next:b(r.querySelector('.tabs')).top,wide:sec.scrollWidth-sec.clientWidth},
       audit:${auditIn('sec')}};})()`);
     assert.equal(m.skin,theme,at+': the theme’s own skin is applied (--mem-skin)');
     assert.deepEqual(m.levels,levels,at);assert.equal(m.missing,String(name.includes('missing')),at);
     assert.ok(m.numDiff>=2,at+': the meter’s digits are not the HUD’s numbers ('+m.numDiff+' differences)');
     assert.ok(m.boxDiff>=1,at+': the gauges are not the HUD’s boxes');
     assert.deepEqual(m.clipped,[],at+': every reading shows in full');
     assert.deepEqual(m.audit,[],at+': layout audit '+JSON.stringify(m.audit));
     assert.equal(m.running,0,at+': no animation runs with reduced motion');
     assert.ok(m.place.top>=m.place.hud-1&&m.place.bottom<=m.place.next+1&&m.place.wide<=1,at+': in its place, no sideways overflow '+JSON.stringify(m.place));
     if(!width&&name==='ok + full')looks.set(theme,m.look);
    }
   }
   await p.close();
  }
  // No two themes share a look (not one template recoloured).
  const seen=new Map();for(const [t,l] of looks){assert.ok(!seen.has(l),t+' looks the same as '+seen.get(l));seen.set(l,t);}
  assert.equal(looks.size,themes.length);assert.deepEqual(errors,[]);
 }finally{await browser.close();server.close();}
});

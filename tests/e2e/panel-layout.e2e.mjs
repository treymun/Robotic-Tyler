// End-to-end (v2.23): the panel's size and place. In Chrome it floats as before and can be resized
// from its left edge, top edge or corner (mouse and keyboard), and the size survives a reload. In
// the desktop app it docks beside the chat by default: a full-height column on the right with the
// chat page narrowed so nothing is covered; collapsing or a narrow window floats it again.
// Preview page (a stand-in Steam chat page) with the real content scripts in headless Chromium:
// not the real Steam page, whose own layout may react differently.
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

test('panel: resizable in Chrome, docked beside the chat in the desktop app',{timeout:120000},async()=>{
 const server=http.createServer((req,res)=>{const file=path.join(ROOT,decodeURIComponent(new URL(req.url,'http://x').pathname));if(!file.startsWith(ROOT)||!fs.existsSync(file)||fs.statSync(file).isDirectory()){res.writeHead(404);res.end();return;}res.writeHead(200,{'content-type':types[path.extname(file)]||'application/octet-stream'});fs.createReadStream(file).pipe(res);}).listen(0);
 const browser=await chromium.launch();
 const R='document.getElementById("tyler-companion-root").shadowRoot';
 try{
  const base='http://127.0.0.1:'+server.address().port+'/tools/preview/panel.html?theme=steam&platform=';
  const ready=p=>p.waitForFunction(()=>window.__tylerReady===true&&window.TylerPanelLayout);
  const panelBox=p=>p.evaluate(R+'.querySelector(".panel").getBoundingClientRect().toJSON()');
  const drag=async(p,sel,dx,dy)=>{const h=await p.evaluate(([R,s])=>eval(R).querySelector(s).getBoundingClientRect().toJSON(),[R,sel]);const x=h.x+h.width/2,y=h.y+h.height/2;
   await p.mouse.move(x,y);await p.mouse.down();await p.mouse.move(x+dx/2,y+dy/2,{steps:4});await p.mouse.move(x+dx,y+dy,{steps:4});await p.mouse.up();await p.waitForTimeout(450);};

  // Chrome: floating bottom-right as before, resizable, remembered.
  const page=await browser.newPage({viewport:{width:1300,height:900}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(base+'chrome');await ready(page);await page.waitForTimeout(200);
  let p0=await panelBox(page);
  assert.deepEqual([Math.round(p0.width),Math.round(p0.height),Math.round(1300-p0.right),Math.round(900-p0.bottom)],[392,760,16,16],'the same default spot and size');
  assert.equal(await page.evaluate(()=>document.body.getBoundingClientRect().width),1300,'Chrome leaves Steam\'s page alone');
  assert.equal(await page.evaluate(R+'.getElementById("dock")'),null,'Chrome\'s header gets no dock button');
  await drag(page,'.rt-resize-w',-120,0);let p1=await panelBox(page);
  assert.equal(Math.round(p1.width),512,'dragging the left edge left makes it wider');assert.equal(Math.round(p1.right),Math.round(p0.right),'the right edge stays put');
  await drag(page,'.rt-resize-c',40,100);let p2=await panelBox(page);
  assert.deepEqual([Math.round(p2.width),Math.round(p2.height)],[472,660],'the corner changes both');
  await drag(page,'.rt-resize-w',2000,0);assert.equal(Math.round((await panelBox(page)).width),340,'not narrower than 340');
  await page.evaluate(R+'.querySelector(".rt-resize-w").focus()');for(let i=0;i<3;i++)await page.keyboard.press('ArrowLeft');
  assert.equal(Math.round((await panelBox(page)).width),388,'arrow keys resize too');
  await page.waitForTimeout(400);await page.reload();await ready(page);await page.waitForTimeout(300);
  assert.deepEqual([Math.round((await panelBox(page)).width),Math.round((await panelBox(page)).height)],[388,660],'the size is kept');
  await page.evaluate(R+'.querySelector(".rt-resize-c").dispatchEvent(new MouseEvent("dblclick",{bubbles:true}))');await page.waitForTimeout(100);
  assert.deepEqual([Math.round((await panelBox(page)).width),Math.round((await panelBox(page)).height)],[392,760],'double-click resets');
  // Collapsed: no handles, the usual mini size.
  await page.evaluate(R+'.getElementById("collapse").click()');await page.waitForTimeout(300);
  assert.equal(await page.evaluate(R+'.querySelector(".rt-resize-w").offsetParent'),null);
  assert.deepEqual(errors,[]);await page.close();

  // Desktop app: docked beside the chat by default.
  const d=await browser.newPage({viewport:{width:1380,height:900}});d.on('pageerror',e=>errors.push(e.message));
  await d.goto(base+'desktop-voice');await ready(d);await d.waitForTimeout(300);
  const dp=await panelBox(d),body=await d.evaluate(()=>document.body.getBoundingClientRect().toJSON()),composer=await d.evaluate(()=>document.querySelector('.composer').getBoundingClientRect().toJSON());
  assert.deepEqual([Math.round(dp.right),Math.round(dp.top),Math.round(dp.height),Math.round(dp.width)],[1380,0,900,440],'a full-height column on the right');
  assert.equal(Math.round(body.width),940,'the chat page makes room');assert.ok(composer.right<=dp.left,'the message box is not covered');
  assert.equal(await d.evaluate(R+'.getElementById("dock").getAttribute("aria-pressed")'),'true');
  await drag(d,'.rt-resize-w',-80,0);
  assert.equal(Math.round((await panelBox(d)).width),520);assert.equal(Math.round(await d.evaluate(()=>document.body.getBoundingClientRect().width)),860);
  // Collapsed, Steam gets the whole window back; expanded, the column returns.
  await d.evaluate(R+'.getElementById("collapse").click()');await d.waitForTimeout(300);
  assert.equal(Math.round(await d.evaluate(()=>document.body.getBoundingClientRect().width)),1380);
  await d.evaluate(R+'.getElementById("collapse").click()');await d.waitForTimeout(300);
  assert.equal(Math.round(await d.evaluate(()=>document.body.getBoundingClientRect().width)),860);
  // Float over Steam instead, and back.
  await d.evaluate(R+'.getElementById("dock").click()');await d.waitForTimeout(150);
  assert.equal(await d.evaluate(()=>document.getElementById('tyler-companion-root').dataset.dock),'float');
  assert.equal(Math.round(await d.evaluate(()=>document.body.getBoundingClientRect().width)),1380);
  await d.evaluate(R+'.getElementById("dock").click()');await d.waitForTimeout(150);
  // A window too narrow for both floats the panel.
  await d.setViewportSize({width:820,height:700});await d.waitForTimeout(300);
  assert.equal(await d.evaluate(()=>document.getElementById('tyler-companion-root').dataset.dock),'float');
  assert.equal(Math.round(await d.evaluate(()=>document.body.getBoundingClientRect().width)),820);
  await d.setViewportSize({width:1380,height:900});await d.waitForTimeout(300);
  assert.equal(await d.evaluate(()=>document.getElementById('tyler-companion-root').dataset.dock),'side');
  assert.deepEqual(errors,[]);
 }finally{await browser.close();server.close();}
});

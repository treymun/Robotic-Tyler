// Renders the Setup's artwork (art/*.html) to PNGs at 100 %, 150 % and 200 % with Playwright's
// Chromium, and the desktop app installer's NSIS sidebar (art/nsis-sidebar.html) to
// build/installer-sidebar-control.bmp (24-bit, 164 × 314; needs Python with Pillow). Run after
// changing the artwork; build-setup.mjs embeds the PNGs it finds in art/.
//   node tools/setup/render-art.mjs
import fs from 'node:fs';import path from 'node:path';import {execFileSync} from 'node:child_process';import {createRequire} from 'node:module';import {fileURLToPath,pathToFileURL} from 'node:url';
const HERE=path.dirname(fileURLToPath(import.meta.url)),ROOT=path.resolve(HERE,'..','..'),ART=path.join(HERE,'art');
const {chromium}=createRequire(path.join(ROOT,'package.json'))('playwright');
const jobs=[];
for(const f of fs.readdirSync(ART))if(/^icon-[\w-]+\.html$/.test(f))jobs.push([f.slice(0,-5),48,48]);
const browser=await chromium.launch();
try{
 for(const [name,w,h] of jobs)for(const scale of [1,1.5,2]){
  const page=await browser.newPage({viewport:{width:w,height:h},deviceScaleFactor:scale});
  await page.goto(pathToFileURL(path.join(ART,name+'.html')).href);await page.evaluate(()=>document.fonts.ready);await page.waitForTimeout(100);
  const out=path.join(ART,`${name}-${Math.round(scale*100)}.png`);
  await page.screenshot({path:out,omitBackground:true,clip:{x:0,y:0,width:w,height:h}});await page.close();
  console.log('wrote',path.relative(ROOT,out));
 }

 // The NSIS sidebar: one size, then a 24-bit BMP (what NSIS reads).
 const page=await browser.newPage({viewport:{width:164,height:314},deviceScaleFactor:1});
 await page.goto(pathToFileURL(path.join(ART,'nsis-sidebar.html')).href);await page.evaluate(()=>document.fonts.ready);await page.waitForTimeout(100);
 const png=path.join(ART,'nsis-sidebar.png');await page.screenshot({path:png,clip:{x:0,y:0,width:164,height:314}});await page.close();
 const bmp=path.join(ROOT,'build','installer-sidebar-control.bmp');
 execFileSync('python3',['-c','import sys;from PIL import Image;Image.open(sys.argv[1]).convert("RGB").save(sys.argv[2],"BMP")',png,bmp]);
 console.log('wrote',path.relative(ROOT,bmp));
}finally{await browser.close();}

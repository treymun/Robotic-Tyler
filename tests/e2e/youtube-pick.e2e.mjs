// End-to-end: Music DJ's YouTube controller (youtube-music.js) opens the first regular search result
// and plays it, in both layouts YouTube serves search results in (ytd-video-renderer and the newer
// yt-lockup-view-model, seen from mid-2026), skipping ads and Shorts shelves; if clicking doesn't
// open the video it opens the video's own page; with no result it reports "missing".
// Mock YouTube pages served by Playwright in headless Chromium (no real YouTube, no Steam).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const {chromium}=require('playwright');

const script=fs.readFileSync(path.resolve(import.meta.dirname,'../../browser-extension/youtube-music.js'),'utf8');
// One second of a quiet tone, so the mock player can really play.
function wav(){const rate=8000,n=rate*2,b=Buffer.alloc(44+n*2);b.write('RIFF',0);b.writeUInt32LE(36+n*2,4);b.write('WAVEfmt ',8);b.writeUInt32LE(16,16);b.writeUInt16LE(1,20);b.writeUInt16LE(1,22);
 b.writeUInt32LE(rate,24);b.writeUInt32LE(rate*2,28);b.writeUInt16LE(2,32);b.writeUInt16LE(16,34);b.write('data',36);b.writeUInt32LE(n*2,40);for(let i=0;i<n;i++)b.writeInt16LE(Math.round(800*Math.sin(i/rate*2*Math.PI*440)),44+i*2);return b;}
const watch=id=>`https://www.youtube.com/watch?v=${id}&list=RD${id}&start_radio=1&pp=ygU`;
const old=(id,title)=>`<ytd-video-renderer><a id="thumbnail" href="${watch(id)}">0:42</a><div id="meta"><h3><a id="video-title" href="${watch(id)}">${title}</a></h3></div></ytd-video-renderer>`;
const lockup=(id,title)=>`<yt-lockup-view-model><div><a class="ytLockupViewModelContentImage" href="${watch(id)}"></a><yt-lockup-metadata-view-model><h3 class="ytLockupMetadataViewModelHeadingReset"><a class="ytLockupMetadataViewModelTitle" href="${watch(id)}">${title}</a></h3></yt-lockup-metadata-view-model></div></yt-lockup-view-model>`;
const page=items=>`<!doctype html><title>results - YouTube</title><ytd-app><ytd-page-manager><ytd-search><ytd-two-column-search-results-renderer><ytd-section-list-renderer><ytd-item-section-renderer id="contents">${items}</ytd-item-section-renderer></ytd-section-list-renderer></ytd-two-column-search-results-renderer></ytd-search></ytd-page-manager></ytd-app>`;
const RESULTS={
 // the older layout: an ad and a Shorts shelf come first
 old:page(`<ytd-ad-slot-renderer>${old('AAAAAAAAAAA','Sponsored')}</ytd-ad-slot-renderer><ytd-reel-shelf-renderer><a href="${watch('SSSSSSSSSSS')}">Shorts</a></ytd-reel-shelf-renderer>${old('oldVideo001','Daft Punk - One More Time')}${old('oldVideo002','Second')}`),
 // the newer layout
 lockup:page(`<ytd-ad-slot-renderer>${lockup('AAAAAAAAAAA','Sponsored')}</ytd-ad-slot-renderer><grid-shelf-view-model>${lockup('SSSSSSSSSSS','Shorts')}</grid-shelf-view-model>${lockup('newVideo001','Daft Punk - One More Time')}${lockup('newVideo002','Second')}`),
 // a layout whose links don't navigate when clicked
 stuck:page(`${lockup('stuckVideo1','Daft Punk - One More Time')}<script>document.addEventListener('click',e=>{if(e.target.closest('a'))e.preventDefault();},true);</script>`),
 none:page(''),
};
const WATCH=`<!doctype html><title>Daft Punk - One More Time - YouTube</title><div class="html5-video-player"><video src="/tone.wav"></video></div><h1 class="ytd-watch-metadata">Daft Punk - One More Time</h1>`;

async function run(browser,layout,{wait=20000}={}){
 const ctx=await browser.newContext();const events=[];const tone=wav();
 await ctx.exposeFunction('__tylerEvent',m=>events.push(m));
 await ctx.addInitScript({content:"window.chrome={runtime:{sendMessage:async m=>{if(m.type==='music:pending')return {ok:true,command:{action:'play',token:'t1',query:'daft punk one more time'}};await window.__tylerEvent(m);return {ok:true};}}};\n"+script});
 await ctx.route('https://www.youtube.com/**',route=>{const u=new URL(route.request().url());
  if(u.pathname==='/results')return route.fulfill({contentType:'text/html',body:RESULTS[layout]});
  if(u.pathname==='/watch')return route.fulfill({contentType:'text/html',body:WATCH});
  if(u.pathname==='/tone.wav')return route.fulfill({contentType:'audio/wav',body:tone});
  return route.fulfill({status:404,body:''});});
 const p=await ctx.newPage();const errors=[];p.on('pageerror',e=>errors.push(e.message));
 await p.goto('https://www.youtube.com/results?search_query=daft+punk+one+more+time+music');
 const until=Date.now()+wait;
 while(Date.now()<until&&!events.some(e=>['playing','missing'].includes(e.event)))await p.waitForTimeout(250);
 const url=new URL(p.url());await ctx.close();
 return {path:url.pathname,v:url.searchParams.get('v'),events:events.map(e=>e.event),title:events.find(e=>e.event==='playing')?.title,errors};
}

test('Music DJ opens and plays the first regular YouTube result in either search layout',{timeout:90000},async()=>{
 const browser=await chromium.launch({args:['--autoplay-policy=no-user-gesture-required']});
 try{
  const [o,l,s,n]=await Promise.all([run(browser,'old'),run(browser,'lockup'),run(browser,'stuck'),run(browser,'none',{wait:30000})]);
  for(const r of [o,l,s,n])assert.deepEqual(r.errors,[]);
  assert.equal(o.path,'/watch');assert.equal(o.v,'oldVideo001','older layout: skips the ad and the Shorts shelf');assert.deepEqual(o.events,['playing']);assert.equal(o.title,'Daft Punk - One More Time');
  assert.equal(l.path,'/watch');assert.equal(l.v,'newVideo001','newer layout (yt-lockup-view-model): skips the ad and the Shorts shelf');assert.deepEqual(l.events,['playing']);
  assert.equal(s.path,'/watch');assert.equal(s.v,'stuckVideo1','a click that does nothing falls back to the video page');assert.deepEqual(s.events,['playing']);
  assert.equal(n.path,'/results');assert.deepEqual(n.events,['missing'],'no result: says so instead of waiting forever');
 }finally{await browser.close();}
});

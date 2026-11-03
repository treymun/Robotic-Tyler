'use strict';
// Steam page (sandboxed preload): puts the diagnostics, the leave fix (unless switched off) and, in
// Stage 2B, Tyler's in-page audio files into the page's own world before Steam's scripts run, and
// relays the diagnostics' reports to the test app. The relay only accepts messages the page posts
// to itself with the test's tag.
const {ipcRenderer,webFrame}=require('electron');
if(process.isMainFrame!==false&&location.hostname==='steamcommunity.com'){
 const cfg=ipcRenderer.sendSync('test:scripts')||{};
 window.addEventListener('message',e=>{if(e.source===window&&e.data&&e.data.source==='tyler-diag-relay')ipcRenderer.send('test:diag',e.data.m);});
 // The diagnostics report through window.chrome.webview.postMessage (WebView2's API); here a tiny
 // stand-in posts to this preload instead.
 const shim="(()=>{try{const c=window.chrome||(window.chrome={});if(!c.webview)Object.defineProperty(c,'webview',{value:{postMessage:m=>window.postMessage({source:'tyler-diag-relay',m},location.origin)}});}catch(e){}})();";
 webFrame.executeJavaScriptInIsolatedWorld(0,[{code:shim+'\n'+(cfg.diag||'')+'\n'+(cfg.repair||'')+'\n'+(cfg.bridge||'')}]).catch(()=>{});
}

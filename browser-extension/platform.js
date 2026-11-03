// Execution-environment capabilities, read by the panel and feature modules.
// Chrome extension: full voice + chat. Desktop Control Center (Electron preload
// sets __TYLER_DESKTOP_TEXT_ONLY): text chat only, no audio bridge, no music or
// screen capture. UI marks voice-only controls with data-capability="voice".
(() => {
 'use strict';
 if(globalThis.TylerPlatform)return;
 const desktop=globalThis.__TYLER_DESKTOP_TEXT_ONLY===true||(typeof window!=='undefined'&&window.__TYLER_DESKTOP_TEXT_ONLY===true);
 globalThis.TylerPlatform=Object.freeze(desktop
  ?{id:'desktop',label:'Desktop · text chat',voice:false,music:false,screen:false}
  :{id:'chrome',label:'Chrome · voice and chat',voice:true,music:true,screen:true});
})();

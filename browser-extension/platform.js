// Execution-environment capabilities, read by the panel and feature modules.
// Chrome extension: full voice + chat. Desktop app (the Electron preload sets one of two flags):
//  - __TYLER_DESKTOP_VOICE (v2.19, the default): voice and chat in the app's own Steam window,
//    like Chrome;
//  - __TYLER_DESKTOP_TEXT_ONLY (Settings → Voice → "Through VB-CABLE"): text chat only here, voice
//    through the Windows audio helper instead.
// UI marks voice-only controls with data-capability="voice".
(() => {
 'use strict';
 if(globalThis.TylerPlatform)return;
 const flag=name=>globalThis[name]===true||(typeof window!=='undefined'&&window[name]===true);
 globalThis.TylerPlatform=Object.freeze(flag('__TYLER_DESKTOP_TEXT_ONLY')
  ?{id:'desktop',label:'Desktop · text chat',voice:false,music:false,screen:false}
  :flag('__TYLER_DESKTOP_VOICE')
  ?{id:'desktop',label:'Desktop · voice and chat',voice:true,music:flag('__TYLER_DESKTOP_MUSIC'),screen:flag('__TYLER_DESKTOP_SCREEN')}
  :{id:'chrome',label:'Chrome · voice and chat',voice:true,music:true,screen:true});
})();

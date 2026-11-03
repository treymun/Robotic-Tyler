// ROBOTIC TYLER theme switch for the settings page (Chrome options page and the
// settings window of both desktop apps). Loaded in <head> so the saved theme is
// applied before first paint. The in-chat panel and Voice Studio read the same
// "uiTheme" setting and follow it live.
//
// v2.14: Settings → Appearance (theme-gallery.js) is the theme picker. It previews
// themes locally and calls TylerTheme.save() when you press Apply. The sidebar shows
// the theme in use with a shortcut to Appearance.
(() => {
 'use strict';
 const store=globalThis.tylerSettings?.storage?.local||globalThis.chrome?.storage?.local;
 const THEMES=['steam','classic','tf2','cs2','portal','cs16','hev','l4d','winxp','doom','quake','pipboy','combine','deadlock','minecraft'];
 // [name, one-line description, light?]
 const INFO={
  steam:['Steam','Today’s Steam: navy panels, blue highlights and a friends-list header.',false],
  classic:['Classic Steam (2004)','The olive VGUI client from the Half-Life 2 launch, bevels and all.',false],
  tf2:['Team Fortress 2','Warm browns, chunky cream lettering and an ÜberCharge meter.',false],
  cs2:['Counter-Strike 2','Slate glass panels, Premier-style rating plates and crisp capitals.',false],
  portal:['Portal','White test-chamber panels, black signage and blue/orange portals.',true],
  cs16:['Counter-Strike 1.6','See-through black menus over dust-map sand, amber HUD numbers.',false],
  hev:['Half-Life HEV suit','Amber suit readouts on dark glass with orange armour plates.',false],
  l4d:['Left 4 Dead','Grimy survival notices, stencil type and a heart monitor.',false],
  winxp:['Windows XP','Luna blue title bars, beige windows and green progress bars.',true],
  doom:['DOOM (classic)','Stone and metal panels, red pixel lettering and keycard status.',false],
  quake:['Quake (1996)','Weathered bronze on dark stone, rusted iron plates and carved runes.',false],
  pipboy:['Fallout Pip-Boy','A phosphor-green terminal: monochrome icons, scan lines and a screen sweep.',false],
  combine:['Half-Life 2 Combine','Pale Civil Protection armour, charcoal panels and a cyan scanner line.',false],
  deadlock:['Deadlock','Occult noir: brass, parchment, vintage city signs and a spectral teal glow.',false],
  minecraft:['Minecraft','Inventory slots, square buttons, pixel letters and a hotbar highlight.',true],
 };
 const clean=v=>THEMES.includes(v)?v:'steam';
 const root=document.documentElement;
 const listeners=new Set();
 // Each theme has its own Tyler logo (ui/logos/<theme>.png); Steam is the fallback.
 const setLogo=theme=>{for(const img of document.querySelectorAll('img.mark')){const src='ui/logos/'+theme+'.png';if(!img.getAttribute('src')?.endsWith(src)){img.onerror=()=>{img.onerror=null;img.src='ui/logos/steam.png';};img.src=src;}img.dataset.theme=theme;}};
 const setLabel=theme=>{const label=document.getElementById('uiThemeName');if(label)label.textContent=INFO[theme][0];};
 function apply(value){
  const theme=clean(value);root.dataset.rtTheme=theme;
  setLogo(theme);setLabel(theme);
  try{localStorage.setItem('tylerTheme',theme);}catch{}
  for(const fn of listeners){try{fn(theme);}catch{}}
  return theme;
 }
 // Last theme seen on this page, so there's no flash while storage answers.
 try{apply(localStorage.getItem('tylerTheme'));}catch{apply('steam');}
 Promise.resolve(store?.get?.(['uiTheme'])).then(v=>apply(v?.uiTheme)).catch(()=>{});
 globalThis.chrome?.storage?.onChanged?.addListener?.((changes,area)=>{if(area==='local'&&changes.uiTheme)apply(changes.uiTheme.newValue);});
 document.addEventListener('DOMContentLoaded',()=>{setLogo(root.dataset.rtTheme);setLabel(root.dataset.rtTheme);});
 // Saves the theme for every Tyler window (panel, settings, Voice Studio, toolbar icon).
 async function save(value){const theme=apply(value);await store?.set?.({uiTheme:theme});return theme;}
 globalThis.TylerTheme=Object.freeze({themes:THEMES,info:INFO,current:()=>clean(root.dataset.rtTheme),save,onChange:fn=>{listeners.add(fn);return ()=>listeners.delete(fn);}});
})();

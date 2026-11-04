// Settings → Appearance (v2.22): lets the theme packs (theme-pack-1/2/3.js) register in the settings
// page, so the theme gallery can show each theme's real extras in its large preview. Loaded before
// the packs. In the Steam panel theme-features.js owns TylerThemeFeatures and this file does nothing.
// The gallery mounts the extras with sample numbers and actions that do nothing: no chat, no call
// audio, no AI request (see theme-gallery.js).
(() => {
 'use strict';
 if(globalThis.TylerThemeFeatures)return;
 const registry=new Map();
 globalThis.TylerThemeFeatures=Object.freeze({
  /** The packs call this once per theme; here it only keeps the list for the gallery. */
  define(theme,features){registry.set(theme,features);},
  showcase:true,
  features:theme=>registry.get(theme)||[],
 });
})();

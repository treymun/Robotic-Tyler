'use strict';
// ROBOTIC TYLER images on this PC: Tyler's image rules (v2.40).
//
// The rules themselves live in ONE file, browser-extension/image-rules.js, shared with the Chrome
// extension and the desktop background (which run them before every cloud picture). This loads that
// same file, so there is no second copy of the vocabulary: from the source folder when it's there
// (development, tests), else from the desktop app's generated copy (app/companion/image-rules.js,
// written by tools/build.mjs and checked by `npm run check` to match).
// check({prompt, negative, names, uncensored}) → {ok:true} or {ok:false, code, reason, cues}
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const FILES=[path.join(__dirname,'..','..','browser-extension','image-rules.js'),path.join(__dirname,'..','companion','image-rules.js')];
function load(){
 for(const file of FILES){
  let src;try{src=fs.readFileSync(file,'utf8');}catch{continue;}
  // Run in this realm with its own "globalThis", so the rules don't touch the main process's globals.
  const box={};vm.runInThisContext('(function(globalThis){'+src+'\n})',{filename:file})(box);
  if(box.TylerImageRules)return Object.assign({file},box.TylerImageRules);
 }
 throw Error('Tyler’s image rules (image-rules.js) are missing from this copy of Tyler, so no image can be made.');
}
module.exports=load();

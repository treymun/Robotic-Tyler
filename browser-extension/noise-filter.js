(() => {
 const profiles={sensitive:{threshold:.006,minVoiced:200,endSilence:550},balanced:{threshold:.028,minVoiced:550,endSilence:500},strong:{threshold:.04,minVoiced:800,endSilence:750}};
 const clamp=(n,lo,hi,fallback)=>Number.isFinite(Number(n))&&n!==null&&n!==''?Math.max(lo,Math.min(hi,Number(n))):fallback;
 function profile(name){return {...(profiles[name]||profiles.balanced)};}
 function configure(s={}){const p=profile(s.noiseLevel);return {threshold:clamp(s.voiceThreshold,.001,.06,p.threshold),minVoiced:clamp(s.minVoiced,150,1000,p.minVoiced),endSilence:clamp(s.replyPause,400,1800,p.endSilence),keyboardFilter:s.keyboardFilter!==false};}
 function isNoise(text){const s=String(text||'').toLowerCase().replace(/[^a-z0-9\s]/g,' ').replace(/\s+/g,' ').trim();return s.length<2||/^(?:(?:uh+|um+|h+m+|mhm|ugh|ah+|grunting|grunt|keyboard|typing|keyboard typing|keyboard clicking|clicking|silence|background noise|noise|music)\s*)+$/.test(s);}
 const level=rms=>Math.max(0,Math.min(100,(20*Math.log10(Math.max(.00001,rms))+60)/60*100));
 // Short, high-crest impulses are typical of key clicks. This is a heuristic,
 // not a speech model; sustain is required before opening capture.
 class SpeechGate {
  constructor(){this.sustained=0;}
  reset(){this.sustained=0;}
  frame(samples,threshold,dt=50){
   let energy=0,peak=0;for(const v of samples){energy+=v*v;peak=Math.max(peak,Math.abs(v));}
   const rms=Math.sqrt(energy/Math.max(1,samples.length));
   const impulse=rms>0&&peak/rms>5;
   const speech=rms>threshold&&!impulse;
   this.sustained=speech?this.sustained+Math.min(75,Math.max(0,dt)):0;
   return {rms,impulse,speech,ready:this.sustained>=150};
  }
 }
 globalThis.TylerNoise={profile,configure,isNoise,level,SpeechGate};
})();

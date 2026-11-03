import * as ort from './neural/ort.wasm.min.mjs';
import {SpeechDetector} from './neural/speech-detector.mjs';
ort.env.wasm.wasmPaths=new URL('./neural/',import.meta.url).href;
let detector,queue=Promise.resolve();
function load(){return detector||=(async()=>{
 const response=await fetch(new URL('./neural/silero_vad_v5.onnx',import.meta.url));
 if(!response.ok)throw Error('Bundled speech model could not load');
 return SpeechDetector.create(ort,new Uint8Array(await response.arrayBuffer()));
})().catch(error=>{detector=null;throw error;});}
window.addEventListener('message',event=>{
 if(event.source!==parent||event.origin!=='https://steamcommunity.com')return;
 const m=event.data;if(m?.source!=='tyler-neural-host'||typeof m.id!=='string'||m.id.length>100)return;
 const reply=payload=>parent.postMessage({source:'tyler-neural-result',id:m.id,...payload},event.origin);
 if(!['init','classify'].includes(m.type))return;
 if(m.type==='classify'&&(!(m.audio instanceof Float32Array)||m.audio.length<4000||m.audio.length>192000)){reply({ok:false,error:'Invalid audio clip'});return;}
 queue=queue.catch(()=>{}).then(async()=>{
  try{const engine=await load();reply({ok:true,...(m.type==='classify'?await engine.classify(m.audio):{ready:true})});}
  catch{reply({ok:false,error:'Local speech model failed. Reload the extension and reopen Steam chat; do not remove the neural folder.'});}
 });
});

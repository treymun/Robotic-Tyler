'use strict';
// ROBOTIC TYLER local AI: "Split between the graphics card and the processor" (v2.44).
//
// As many of the model's layers as fit go on the graphics card; the rest run on the processor in the
// PC's memory. The context stays 8192 tokens. It's decided each time the engine starts (after the idle
// close, a model change or a settings change), from the card's free memory at that moment (a game's
// share is already gone from it), minus:
//   - room for a theme voice that runs on the same card (installed with the graphics-card engine and
//     Runs on isn't "Processor only"): its mode's need from app/theme-voices/hardware.cjs, plus the
//     sharper voice's when that's installed and switched on;
//   - a safety margin (MARGIN), and llama.cpp's own working buffers on the card (OVERHEAD).
// Tyler passes llama.cpp an exact layer count (-ngl N, with --fit off), so the number in the note is
// the number that runs. llama.cpp counts the output layer as one of the N and puts it on the card
// first, then the repeating layers from the last one down ("offloaded N/33 layers to GPU" for a
// 32-layer model); the sizes come from each pinned file's GGUF header (lock.json → models.*.layers),
// and they match llama.cpp b11669's own buffer sizes byte for byte (docs/LOCAL-AI.md, Split).
// If not even the first layer fits, it runs on the processor, and says so.
const GB=1024**3;
const MARGIN=1*GB;      // kept free on the card (llama.cpp's own --fit keeps 1024 MiB by default)
const OVERHEAD=0.5*GB;  // llama.cpp's working buffers on the card and Vulkan's own memory for a split load
const fmt=n=>(Math.max(0,n)/GB).toFixed(1)+' GB';

/** The model's layers from the lock, or an even estimate from its size when the lock has none. */
function layersOf(model){
 const l=model?.layers;
 if(l&&Number.isInteger(l.count)&&Array.isArray(l.bytes)&&l.bytes.length===l.count)return l;
 const count=32,each=Math.ceil((Number(model?.size)||0)*1.1/(count+1));
 return {count,output:each,bytes:Array(count).fill(each),attention:[],kvBytes:0,stateBytes:0,estimated:true};
}
/** The parts in the order llama.cpp puts them on the card for -ngl N: the output layer, then layer count-1, count-2, … */
function units(layers){
 const att=new Set(layers.attention||[]),list=[{kind:'output',bytes:layers.output}];
 for(let i=layers.count-1;i>=0;i--)list.push({kind:'layer',index:i,bytes:layers.bytes[i]+(att.has(i)?layers.kvBytes||0:layers.stateBytes||0)});
 return list;
}
/**
 * How many layers go on the card. free: the card's free memory now; reserve: bytes kept for a theme voice.
 * Returns {layers, of, bytes (on the card), budget, free, reserve, margin, overhead, all, none}.
 */
function plan({layers,free,reserve=0,margin=MARGIN,overhead=OVERHEAD}){
 const list=units(layers),of=list.length,budget=(Number(free)||0)-reserve-margin-overhead;
 let n=0,bytes=0;for(const u of list){if(bytes+u.bytes>budget)break;bytes+=u.bytes;n++;}
 return {layers:n,of,bytes,budget,free:Number(free)||0,reserve,margin,overhead,all:n===of,none:n===0};
}
/** The same plan with fewer layers (after a start that didn't fit): about 60% of them. */
function fewer(p,layers){
 const n=Math.floor(p.layers*0.6),list=units(layers).slice(0,n);
 return {...p,layers:n,bytes:list.reduce((s,u)=>s+u.bytes,0),all:false,none:n===0,retried:true};
}
/**
 * Room kept for theme voices on the same card, or null. tv (read from the theme-voice service, never
 * changed): {installed, runtime, device, mode, models:{quality,light}, loaded:{mode,device}|null,
 * conversion:{on, bytes}}. needs: theme-voices/hardware.cjs NEEDS. modelBytes: each mode's model files.
 */
function voiceReserve(tv,{needs,modelBytes={}}={}){
 if(!tv||!tv.installed||!String(tv.runtime||'').includes('cuda')||tv.device==='cpu'||!needs)return null;
 const mode=needs[tv.mode]?tv.mode:tv.models?.quality?'quality':tv.models?.light?'light':'quality';
 // Already loaded on the card in that mode: its model is in the free reading, so only the rest of its
 // need (what it uses while it speaks) is kept; the model isn't counted twice.
 const loaded=tv.loaded?.device==='cuda'&&tv.loaded.mode===mode;
 let bytes=loaded?Math.max(0,needs[mode].vram-(modelBytes[mode]||0)):needs[mode].vram;
 const conversion=!!tv.conversion?.on&&Number(tv.conversion.bytes)>0;if(conversion)bytes+=Number(tv.conversion.bytes);
 return {bytes,mode,label:String(needs[mode].label||mode).replace(/\s*\(.*$/,''),loaded,conversion};
}
/**
 * Room kept for theme voices from their own figure (theme-voices service vramReserve(): {bytes, mode, onCard};
 * bytes is 0 when they don't run on the card, and includes the sharper voice's share when it's on). When
 * their engine is already loaded on the card in that mode (loadedMode), its model is in the free reading
 * already, so only the rest of the need is kept. null when nothing needs keeping.
 */
function reserveFrom(r,{needs,modelBytes={},loadedMode=null}={}){
 if(!r||!(Number(r.bytes)>0)||!needs)return null;
 const mode=needs[r.mode]?r.mode:'quality',loaded=!!r.onCard&&loadedMode===mode;
 return {bytes:loaded?Math.max(0,r.bytes-(modelBytes[mode]||0)):Number(r.bytes),mode,label:String(needs[mode].label||mode).replace(/\s*\(.*$/,''),loaded,conversion:r.bytes>needs[mode].vram};
}
/**
 * The note shown in Settings, the Steam window's status line and the activity log.
 * p: plan(); card: the card's name; reserve: voiceReserve() or null; noCard: Vulkan found none.
 */
function note({p,card,reserve=null,noCard=false}){
 if(noCard)return 'Split: no graphics card Vulkan can use was found, so it runs on the processor (slower).';
 const kept=reserve?' Room is kept on the card for the theme voice ('+reserve.label+(reserve.conversion?' with the sharper voice':'')+(reserve.loaded?', already loaded':'')+', '+fmt(reserve.bytes)+(reserve.loaded?' more':'')+').':'';
 const retry=p.retried?' (The first try didn’t fit, so fewer layers.)':'';
 if(p.none)return 'Split: no layer fits on '+card+' right now ('+fmt(p.free)+' free'+(reserve?', '+fmt(reserve.bytes)+' kept for the theme voice':'')+'), so it runs on the processor (slower).'+retry;
 if(p.all)return 'Split: all '+p.of+' layers fit on '+card+', so the whole model runs on the card.'+kept;
 return 'Split: '+p.layers+' of '+p.of+' layers on '+card+', the rest on the processor (slower than all on the card).'+retry+kept;
}
module.exports={plan,fewer,units,layersOf,voiceReserve,reserveFrom,note,MARGIN,OVERHEAD};

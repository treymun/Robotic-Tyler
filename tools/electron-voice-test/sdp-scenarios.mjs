// The leave fix against nine kinds of re-offer, in Playwright's Chromium (a MOCK: a second WebRTC end
// plays Steam's server; no Steam, no Windows audio). For each kind it applies the offer with the fix
// off and on and reports whether the browser accepted it, what the fix removed, which sections still
// carry audio afterwards, and whether the next offer is still accepted.
//   node tools/electron-voice-test/sdp-scenarios.mjs
import fs from 'node:fs';import path from 'node:path';import {createRequire} from 'node:module';import {fileURLToPath} from 'node:url';
const HERE=path.dirname(fileURLToPath(import.meta.url)),ROOT=path.resolve(HERE,'..','..');
const {chromium}=createRequire(path.join(ROOT,'package.json'))('playwright');
const shim="window.__posts=[];window.chrome=window.chrome||{};window.chrome.webview={postMessage:m=>window.__posts.push(m)};";
const pageTest=String.raw`
// Runs in a page served as https://steamcommunity.com/ with sdp-repair.js loaded first.
window.__run = async () => {
 const out = { version: navigator.userAgent.match(/Chrome\/[\d.]+/)[0], statsMid: null, scenarios: {} };
 const ac = new AudioContext();
 const osc = f => { const o = ac.createOscillator(), d = ac.createMediaStreamDestination(); o.frequency.value = f; o.connect(d); o.start(); return d.stream.getAudioTracks()[0]; };
 const secs = sdp => { const p = sdp.split(/\r\n(?=m=)/); return { head: p[0], m: p.slice(1) }; };
 const join = s => [s.head, ...s.m].join('\r\n');
 const ssrcs = m => [...new Set([...m.matchAll(/a=ssrc:(\d+)/g)].map(x => x[1]))];
 const unsignal = m => m.split('\r\n').filter(l => !/^a=(ssrc|ssrc-group):/.test(l)).join('\r\n');
 const wait = ms => new Promise(r => setTimeout(r, ms));
 async function received(pc) { const r = await pc.getStats(); const by = {}; r.forEach(s => { if (s.type === 'inbound-rtp') by[s.ssrc] = { mid: s.mid, packets: s.packetsReceived, track: s.trackIdentifier }; }); return by; }
 // A = the bot (this page, repair installed on the prototype), B = a stand-in for Steam's server.
 async function setup(opt = {}) {
  const A = new RTCPeerConnection({ bundlePolicy: 'max-bundle' }), B = new RTCPeerConnection({ bundlePolicy: 'max-bundle' });
  const streams = new Set(); A.ontrack = e => e.streams.forEach(s => streams.add(s.id));
  A.onicecandidate = e => e.candidate && B.addIceCandidate(e.candidate).catch(() => {}); B.onicecandidate = e => e.candidate && A.addIceCandidate(e.candidate).catch(() => {});
  A.addTrack(osc(300));
  await A.setLocalDescription(await A.createOffer()); await B.setRemoteDescription(A.localDescription);
  const sB = new MediaStream([osc(500)]);
  B.getTransceivers()[0].sender.replaceTrack(sB.getAudioTracks()[0]); B.getTransceivers()[0].sender.setStreams(sB); B.getTransceivers()[0].direction = 'sendrecv';
  const ans = await B.createAnswer(); await B.setLocalDescription(ans);
  let a = secs(ans.sdp); if (opt.unsignalMid0) a.m[0] = unsignal(a.m[0]);
  await A.setRemoteDescription({ type: 'answer', sdp: join(a) });
  const s1 = new MediaStream([osc(700)]); B.addTransceiver(s1.getAudioTracks()[0], { direction: 'sendonly', streams: [s1] });
  const o = await B.createOffer(); await B.setLocalDescription(o);
  let p = secs(o.sdp); if (opt.unsignalMid0) p.m[0] = unsignal(p.m[0]);
  await A.setRemoteDescription({ type: 'offer', sdp: join(p) }); const aa = await A.createAnswer(); await A.setLocalDescription(aa); await B.setRemoteDescription(aa);
  await wait(1500);
  return { A, B, streams, opt };
 }
 async function reoffer(ctx, fn) {
  const { A, B } = ctx; const o = await B.createOffer(); await B.setLocalDescription(o); const s = secs(o.sdp);
  if (ctx.opt.unsignalMid0) s.m[0] = unsignal(s.m[0]);
  const before = await received(A);
  fn(s);
  const posts = window.__posts.length;
  let result;
  try { await A.setRemoteDescription({ type: 'offer', sdp: join(s) }); const an = await A.createAnswer(); await A.setLocalDescription(an); await B.setRemoteDescription(an); result = 'accepted'; }
  catch (e) { result = 'FAILED ' + e.message.replace(/^.*?: Failed/, 'Failed'); }
  const repaired = window.__posts.slice(posts).filter(p => p.type === 'sdp-repair').map(p => p.changes ? p.changes.map(c => c.mid + ' −' + c.clash.map(x => x.ssrc.slice(-4) + '(held by ' + x.owner + ')').join(',')).join('; ') : 'error ' + p.error);
  // Audio flow after the change, per section (sum of packets over that section's streams).
  const perMid = st => { const m = {}; for (const v of Object.values(st)) m[v.mid] = (m[v.mid] || 0) + (v.packets || 0); return m; };
  await wait(400); const s0 = perMid(await received(A)); await wait(1500); const s1 = perMid(await received(A));
  const flowing = Object.keys(s1).filter(k => s1[k] > (s0[k] || 0) + 20).sort().join('+') || 'none';
  let next = 'n/a';
  if (result === 'accepted') { try { const o2 = await B.createOffer(); await B.setLocalDescription(o2); const t = secs(o2.sdp); if (ctx.opt.unsignalMid0) t.m[0] = unsignal(t.m[0]); await A.setRemoteDescription({ type: 'offer', sdp: join(t) }); const a2 = await A.createAnswer(); await A.setLocalDescription(a2); await B.setRemoteDescription(a2); next = 'accepted'; } catch (e) { next = 'FAILED ' + e.message.slice(-90); } }
  const msidOk = A.getReceivers().every(r => true);
  A.close(); B.close();
  return { result, repaired: repaired.join(' | ') || 'unchanged', audioAfterOn: flowing, streams: ctx.streams.size, nextOffer: next };
 }
 const scenarios = {
  'normal re-offer (nothing changed)': [{}, s => {}],
  'm1 lists the SSRC listed in mid 0': [{}, s => { const a = ssrcs(s.m[0])[0], c = ssrcs(s.m[1])[0]; s.m[1] = s.m[1].split(c).join(a); }],
  'm1 SSRC moved into mid 0, m1 keeps it': [{}, s => { const a = ssrcs(s.m[0])[0], c = ssrcs(s.m[1])[0]; s.m[0] = s.m[0].split(a).join(c); }],
  'm1 SSRC moved into mid 0 (m1 left empty)': [{}, s => { const a = ssrcs(s.m[0])[0], c = ssrcs(s.m[1])[0]; s.m[0] = s.m[0].split(a).join(c); s.m[1] = unsignal(s.m[1]); }],
  'SSRCs swapped between sections': [{}, s => { const a = ssrcs(s.m[0])[0], c = ssrcs(s.m[1])[0]; s.m[0] = s.m[0].split(a).join('X'); s.m[1] = s.m[1].split(c).join(a); s.m[0] = s.m[0].split('X').join(c); }],
  'mid 0 SSRC moved to m1 (mid 0 left empty)': [{}, s => { const a = ssrcs(s.m[0])[0], c = ssrcs(s.m[1])[0]; s.m[1] = s.m[1].split(c).join(a); s.m[0] = unsignal(s.m[0]); }],
  'm1 inactive': [{}, s => { s.m[1] = s.m[1].replace(/a=(sendonly|sendrecv)/, 'a=inactive'); }],
  'm1 gets a new SSRC': [{}, s => { const c = ssrcs(s.m[1])[0]; s.m[1] = s.m[1].split(c).join('424242'); }],
  'unlisted stream on mid 0 (learned), m1 now lists it': [{ unsignalMid0: true }, s => { s.__learned = true; }],
 };
 try { const t = await setup(); const r = await received(t.A); out.statsMid = Object.values(r).map(x => x.mid); t.A.close(); t.B.close(); } catch (e) { out.statsMid = 'error ' + e.message; }
 for (const repairOn of [false, true]) {
  window.__tylerSdpRepair.setEnabled(repairOn);
  for (const [name, [opt, fn]] of Object.entries(scenarios)) {
   try {
    const ctx = await setup(opt);
    if (opt.unsignalMid0) {
     // The real SSRC B sends on mid 0 (learned by A from received packets, never listed to A).
     const st = await received(ctx.A); const learnedSsrc = Object.keys(st).find(k => st[k].mid === '0');
     out.scenarios[(repairOn ? 'FIX ON  - ' : 'FIX OFF - ') + name] = await reoffer(ctx, s => { const c = ssrcs(s.m[1])[0]; s.m[1] = s.m[1].split(c).join(learnedSsrc); });
    } else out.scenarios[(repairOn ? 'FIX ON  - ' : 'FIX OFF - ') + name] = await reoffer(ctx, fn);
   } catch (e) { out.scenarios[name] = 'setup error ' + e.message; }
  }
 }
 return out;
};
`;
const html='<!doctype html><script>'+shim+'</script><script>'+fs.readFileSync(path.join(ROOT,'tools','webview2-voice-test','web','sdp-repair.js'),'utf8')+'</script><script>'+pageTest+'</script>';
const b=await chromium.launch({args:['--autoplay-policy=no-user-gesture-required']});const p=await b.newPage();
await p.route('https://steamcommunity.com/**',r=>r.fulfill({contentType:'text/html; charset=utf-8',body:html}));
await p.goto('https://steamcommunity.com/chat/');
const r=await p.evaluate(()=>window.__run());await b.close();
console.log(r.version);const bad=[];
for(const [k,v] of Object.entries(r.scenarios)){
 console.log(k.padEnd(64),typeof v==='string'?v:v.result.slice(0,60).padEnd(60)+' · '+v.repaired+' · audio on '+v.audioAfterOn+' · next '+v.nextOffer);
 if(k.startsWith('FIX ON')&&(typeof v==='string'||v.result!=='accepted'||v.nextOffer!=='accepted'))bad.push(k);
}
if(!Object.keys(r.scenarios).some(k=>k.startsWith('FIX OFF')&&/FAILED/.test(r.scenarios[k].result)))bad.push('no scenario failed with the fix off: the mock no longer reproduces the problem');
if(bad.length){console.error('FAILED:\n'+bad.join('\n'));process.exit(1);}console.log('PASS');

// ROBOTIC TYLER voice test: the "leave fix" (runs in the Steam page at document start, before
// Steam's scripts, after diagnostics.js).
//
// What it fixes: when someone leaves a group voice call, Steam's voice server sends a new offer. That
// offer can list an incoming audio stream (an SSRC) in one section while the browser still routes
// that stream to another section. Chromium then rejects the whole offer ("Failed to set up audio
// demuxing for mid='m1'"), refuses every later offer on that connection, and Steam ends the call.
//
// What it does: before each description from Steam's server reaches the browser, it replays how
// Chromium will update its routing (section by section, in order, starting from the description in
// force) and removes only the SSRC lines that would collide. Each removed stream keeps its msid, so Steam still sees the same
// person's audio stream. Nothing else in the description changes, a description with no collision
// passes through untouched, and any problem in this code falls back to Steam's original.
(() => {
 'use strict';
 if (window !== window.top || location.hostname !== 'steamcommunity.com') return;
 if (window.__tylerSdpRepair) return;
 const Native = window.RTCPeerConnection;
 const proto = typeof Native === 'function' && Native.prototype;
 if (!proto || typeof proto.setRemoteDescription !== 'function') return;
 const host = window.chrome && window.chrome.webview;
 const post = (type, data) => { try { host && host.postMessage({ diag: 1, type, at: Date.now(), ...data }); } catch (e) {} };
 const diagId = pc => { try { return pc[Symbol.for('tyler.diag.id')] || 0; } catch (e) { return 0; } };
 // For the report: no addresses, ICE credentials or certificate fingerprints.
 const redact = sdp => String(sdp).split(/\r?\n/).filter(l => l && !/^a=(candidate|ice-ufrag|ice-pwd|fingerprint|crypto|end-of-candidates)/.test(l))
  .map(l => /^(c=|o=|a=rtcp:)/.test(l) ? l.replace(/(IN IP[46]) \S+/, '$1 <address>') : l).join('\n').slice(0, 12000);

 // ── SDP sections ──
 function parse(sdp) {
  const eol = sdp.indexOf('\r\n') >= 0 ? '\r\n' : '\n';
  const head = [], secs = [];
  let cur = null;
  for (const line of sdp.split(/\r?\n/)) {
   if (line.startsWith('m=')) { cur = { lines: [line], mid: null, port: Number(line.split(' ')[1]), ssrcs: new Set() }; secs.push(cur); }
   else if (cur) {
    cur.lines.push(line);
    if (line.startsWith('a=mid:')) cur.mid = line.slice(6).trim();
    const s = /^a=ssrc:(\d+)/.exec(line);
    if (s) cur.ssrcs.add(s[1]);
   } else head.push(line);
  }
  // Sections that share one transport (BUNDLE) share one router; a section outside a group has its own.
  const group = new Map();
  head.forEach((line, i) => { if (line.startsWith('a=group:BUNDLE ')) for (const mid of line.slice(15).trim().split(/\s+/)) group.set(mid, 'g' + i); });
  for (const s of secs) s.group = s.mid != null && group.has(s.mid) ? group.get(s.mid) : 'own:' + s.mid;
  return { eol, head, secs };
 }
 const text = p => [...p.head, ...p.secs.flatMap(s => s.lines)].join(p.eol);
 const same = (a, b) => a.size === b.size && [...a].every(x => b.has(x));

 // Removes the given SSRCs' lines from a section, keeping the stream identity (msid) they carried.
 function strip(sec, ssrcs) {
  const drop = new Set(ssrcs), msid = [], legacy = {};
  sec.lines = sec.lines.filter(line => {
   const s = /^a=ssrc:(\d+) ([^:\s]+)(?::(.*))?$/.exec(line);
   if (s && drop.has(s[1])) {
    if (s[2] === 'msid' && s[3]) msid.push(s[3].trim());
    else if (s[2] === 'mslabel' || s[2] === 'label') (legacy[s[1]] = legacy[s[1]] || {})[s[2]] = (s[3] || '').trim();
    return false;
   }
   const g = /^a=ssrc-group:\S+ (.*)$/.exec(line);
   return !(g && g[1].trim().split(/\s+/).some(x => drop.has(x)));
  });
  for (const k of Object.keys(legacy)) if (legacy[k].mslabel && legacy[k].label) msid.push(legacy[k].mslabel + ' ' + legacy[k].label);
  for (const x of ssrcs) sec.ssrcs.delete(x);
  // With no SSRC lines left, the section-level msid is how Chromium keeps the stream.
  const kept = sec.lines.some(l => l.startsWith('a=ssrc:')), hasMsid = sec.lines.some(l => l.startsWith('a=msid:'));
  if (!kept && !hasMsid && msid.length) {
   const at = sec.lines.findIndex(l => l.startsWith('a=mid:'));
   sec.lines.splice(at >= 0 ? at + 1 : 1, 0, 'a=msid:' + msid[0]);
  }
 }

 // Replays Chromium's routing update for a new description, starting from the description in force
 // (`before`). Chromium updates the sections one by one, in order: a section whose SSRC list changed
 // drops its old SSRCs and claims its new ones, and a claim fails if another section still holds
 // that SSRC. Streams the browser only learned from received packets don't block a claim (checked
 // in Chromium 153 and 156), so only listed SSRCs count.
 function plan(sdp, before) {
  const next = parse(sdp), old = before ? parse(before) : null;
  const groupOf = new Map(next.secs.map(s => [s.mid, s.group]));
  const route = new Map();                                   // group|ssrc → mid
  const key = (g, x) => g + '|' + x;
  if (old) for (const s of old.secs) if (s.port !== 0 && s.mid != null) for (const x of s.ssrcs) route.set(key(groupOf.get(s.mid) || s.group, x), s.mid);
  const changes = [];
  for (const s of next.secs) {
   if (s.mid == null) continue;
   for (const [k, mid] of route) if (mid === s.mid) route.delete(k);
   if (s.port === 0) continue;
   const clash = [];
   for (const x of s.ssrcs) {
    const k = key(s.group, x), owner = route.get(k);
    if (owner != null && owner !== s.mid) clash.push({ ssrc: x, owner });
    else route.set(k, s.mid);
   }
   if (clash.length) { strip(s, clash.map(c => c.ssrc)); changes.push({ mid: s.mid, clash }); }
  }
  return { changes, sdp: changes.length ? text(next) : sdp };
 }

 let enabled = true, seq = 0;
 const native = proto.setRemoteDescription;
 proto.setRemoteDescription = function (desc, ...rest) {
  let use = desc;
  if (enabled && desc && typeof desc.sdp === 'string' && /^(offer|answer|pranswer)$/.test(desc.type || '') && this.signalingState !== 'closed') {
   const n = ++seq;
   try {
    const before = this.remoteDescription && this.remoteDescription.sdp;
    const r = plan(desc.sdp, before);
    if (r.changes.length) {
     use = new RTCSessionDescription({ type: desc.type, sdp: r.sdp });
     post('sdp-repair', { id: diagId(this), n, kind: desc.type, changes: r.changes, original: redact(desc.sdp) });
    }
   } catch (e) { use = desc; post('sdp-repair', { id: diagId(this), n, kind: desc.type, error: String(e && e.message || e).slice(0, 160) }); }
  }
  return native.call(this, use, ...rest);
 };
 Object.defineProperty(window, '__tylerSdpRepair', { value: Object.freeze({ plan, setEnabled: on => { enabled = !!on; } }) });
 post('sdp-repair-ready', {});
})();

// ROBOTIC TYLER voice test: the "leave fix" (runs in the Steam page at document start, before
// Steam's scripts, after diagnostics.js).
//
// What it fixes: Steam's voice server gives every other person in the call their own section (m1, m2…)
// with their own SSRC, and marks it inactive when they leave. Chromium then re-registers that section
// with the SSRC, and refuses ("Failed to set up audio demuxing for mid='m1'") when the SSRC is routed
// to another section at that moment. After one refusal Chromium rejects every later offer on that
// connection, and Steam ends the call.
//
// Why the SSRC is routed elsewhere (Steam's real descriptions in the 0.1.1 report, Chromium 156's
// RtpDemuxer, and a local reproduction): when the bot joins, Steam's answer has only section 0, so
// the audio of someone already talking first arrives tagged with MID "0". Chromium remembers that
// tag for the SSRC and keeps routing the SSRC to section 0 even after Steam lists it in that person's
// own section. The leave (or any other re-registration of that section) then collides.
//
// What it does, before each description from Steam's server reaches the browser:
//  1. Removes the MID header extension (a=extmap … sdes:mid), so the browser routes Steam's audio by
//     the SSRCs Steam lists, never by a remembered section tag. This is the fix for the leave drop.
//     (Chrome only puts MID on a stream's first packets anyway, so Steam's server already routes the
//     bot's own audio by SSRC.)
//  2. Replays how Chromium will update its routing (section by section, in order, from the
//     description in force) and removes SSRC lines that would collide with another section's listed
//     SSRC, keeping each stream's msid so Steam still sees the same person.
// Nothing else changes, and any problem in this code falls back to Steam's original description.
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

 const MID_EXT = /^a=extmap:\d+(?:\/\w+)? urn:ietf:params:rtp-hdrext:sdes:mid\s*$/;
 // Replays Chromium's routing update for a new description, starting from the description in force
 // (`before`). Chromium updates the sections one by one, in order: a section whose SSRC list changed
 // drops its old SSRCs and claims its new ones, and a claim fails if another section still holds
 // that SSRC as a listed one.
 function plan(sdp, before) {
  const next = parse(sdp), old = before ? parse(before) : null;
  let midExt = 0;
  next.head = next.head.filter(l => !(MID_EXT.test(l) && ++midExt));
  for (const s of next.secs) s.lines = s.lines.filter(l => !(MID_EXT.test(l) && ++midExt));
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
  return { changes, midExt, sdp: changes.length || midExt ? text(next) : sdp };
 }

 let enabled = true, seq = 0;
 const midNoted = new WeakSet();
 const native = proto.setRemoteDescription;
 proto.setRemoteDescription = function (desc, ...rest) {
  let use = desc;
  if (enabled && desc && typeof desc.sdp === 'string' && /^(offer|answer|pranswer)$/.test(desc.type || '') && this.signalingState !== 'closed') {
   const n = ++seq;
   try {
    const before = this.remoteDescription && this.remoteDescription.sdp;
    const r = plan(desc.sdp, before);
    if (r.changes.length || r.midExt) use = new RTCSessionDescription({ type: desc.type, sdp: r.sdp });
    if (r.midExt && !midNoted.has(this)) { midNoted.add(this); post('sdp-mid', { id: diagId(this), n, kind: desc.type, lines: r.midExt }); }
    if (r.changes.length) post('sdp-repair', { id: diagId(this), n, kind: desc.type, changes: r.changes, original: redact(desc.sdp) });
   } catch (e) { use = desc; post('sdp-repair', { id: diagId(this), n, kind: desc.type, error: String(e && e.message || e).slice(0, 160) }); }
  }
  return native.call(this, use, ...rest);
 };
 Object.defineProperty(window, '__tylerSdpRepair', { value: Object.freeze({ plan, setEnabled: on => { enabled = !!on; } }) });
 post('sdp-repair-ready', {});
})();

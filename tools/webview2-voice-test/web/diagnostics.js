// ROBOTIC TYLER WebView2 voice test: diagnostics for the Steam chat page (runs in the page at
// document creation, before Steam's own scripts). It reports to the test app only states and
// numbers: API support, microphone requests and their outcome, WebRTC connection states, audio
// levels and packet counts, whether Steam shows an active voice channel, and Tyler's own status
// messages. It never reads chat text, never forwards audio, and changes nothing Steam does: the
// RTCPeerConnection wrapper only records each new connection, and the getUserMedia wrapper only
// records the request and its result.
(() => {
 'use strict';
 if (window !== window.top || location.hostname !== 'steamcommunity.com') return;
 if (window.__tylerWebView2Diagnostics) return;
 Object.defineProperty(window, '__tylerWebView2Diagnostics', { value: true });
 const host = window.chrome && window.chrome.webview;
 if (!host || typeof host.postMessage !== 'function') return;
 // Each page load gets its own token, so connection numbers from a reloaded page never mix.
 const doc = Math.random().toString(36).slice(2, 8);
 const post = (type, data = {}) => { try { host.postMessage({ diag: 1, doc, type, at: Date.now(), ...data }); } catch (e) {} };
 const clip = (s, n = 160) => String(s == null ? '' : s).slice(0, n);
 post('document', { path: location.pathname });

 // ── 1. Browser support ──
 const support = {};
 try {
  support.rtcPeerConnection = typeof window.RTCPeerConnection === 'function';
  support.getUserMedia = !!(navigator.mediaDevices && typeof navigator.mediaDevices.getUserMedia === 'function');
  support.audioContext = typeof window.AudioContext === 'function';
  support.mediaStreamDestination = typeof window.MediaStreamAudioDestinationNode === 'function';
  support.secureContext = window.isSecureContext === true;
  const caps = window.RTCRtpSender && RTCRtpSender.getCapabilities ? RTCRtpSender.getCapabilities('audio') : null;
  support.opus = !!(caps && caps.codecs.some(c => /opus/i.test(c.mimeType)));
  support.userAgent = navigator.userAgent;
  support.brands = (navigator.userAgentData && navigator.userAgentData.brands || []).map(b => b.brand + ' ' + b.version);
 } catch (e) { support.error = clip(e && e.message); }
 post('support', support);
 try {
  navigator.permissions.query({ name: 'microphone' }).then(p => {
   post('mic-permission', { state: p.state });
   p.onchange = () => post('mic-permission', { state: p.state });
  }, () => {});
 } catch (e) {}

 // ── 2. Microphone requests that reach a real device ──
 // Wrapped at the prototype: Tyler's bridge answers Steam's audio request itself (with the synthetic
 // microphone) and never calls this for audio, so in Stage 2 this should stay silent.
 const media = window.MediaDevices && MediaDevices.prototype;
 const realGum = media && media.getUserMedia;
 let gumSeq = 0;
 if (realGum) {
  media.getUserMedia = function (constraints) {
   const id = ++gumSeq, audio = !!(constraints && constraints.audio), video = !!(constraints && constraints.video);
   post('gum-request', { id, audio, video });
   return realGum.call(this, constraints).then(stream => {
    const tracks = stream.getTracks().map(t => ({ kind: t.kind, label: clip(t.label, 80), state: t.readyState, muted: t.muted }));
    post('gum-result', { id, ok: true, audio, tracks });
    if (audio) listDevices();
    return stream;
   }, err => {
    post('gum-result', { id, ok: false, audio, name: clip(err && err.name, 40), message: clip(err && err.message) });
    throw err;
   });
  };
 }
 // Older callback forms, in case Steam uses them in this browser.
 for (const name of ['webkitGetUserMedia', 'getUserMedia']) {
  const legacy = navigator[name];
  if (typeof legacy !== 'function') continue;
  navigator[name] = function (constraints, ok, fail) {
   const id = ++gumSeq, audio = !!(constraints && constraints.audio);
   post('gum-request', { id, audio, video: !!(constraints && constraints.video), legacy: name });
   return legacy.call(this, constraints, s => { post('gum-result', { id, ok: true, audio, tracks: s.getTracks().map(t => ({ kind: t.kind, label: clip(t.label, 80), state: t.readyState })) }); ok && ok(s); },
    e => { post('gum-result', { id, ok: false, audio, name: clip(e && e.name, 40), message: clip(e && e.message) }); fail && fail(e); });
  };
 }
 function listDevices() {
  try {
   navigator.mediaDevices.enumerateDevices().then(list => post('devices', {
    inputs: list.filter(d => d.kind === 'audioinput').map(d => clip(d.label, 80)),
    outputs: list.filter(d => d.kind === 'audiooutput').length
   }), () => {});
  } catch (e) {}
 }

 // ── 3–5. WebRTC connections: negotiation, ICE, and audio in both directions ──
 const Native = window.RTCPeerConnection;
 const live = new Map();
 let pcSeq = 0;
 if (typeof Native === 'function') {
  const Wrapped = new Proxy(Native, {
   construct(target, args, newTarget) { const pc = Reflect.construct(target, args, newTarget); watch(pc, args[0]); return pc; }
  });
  window.RTCPeerConnection = Wrapped;
  if (window.webkitRTCPeerConnection === Native) window.webkitRTCPeerConnection = Wrapped;
 }
 function watch(pc, config) {
  const id = ++pcSeq;
  live.set(id, pc); ids.set(pc, id);
  post('pc-new', { id, iceServers: (config && config.iceServers || []).length, policy: clip(config && config.iceTransportPolicy || 'all', 20) });
  const state = () => post('pc-state', {
   id, signaling: pc.signalingState, ice: pc.iceConnectionState, connection: pc.connectionState, gathering: pc.iceGatheringState,
   local: pc.localDescription ? pc.localDescription.type : '', remote: pc.remoteDescription ? pc.remoteDescription.type : ''
  });
  for (const ev of ['signalingstatechange', 'iceconnectionstatechange', 'connectionstatechange', 'icegatheringstatechange']) pc.addEventListener(ev, state);
  pc.addEventListener('track', e => {
   const t = e.track;
   post('pc-track', { id, kind: t && t.kind, muted: t && t.muted, mid: e.transceiver && e.transceiver.mid });
   if (t) { t.addEventListener('ended', () => post('pc-track-ended', { id, kind: t.kind })); t.addEventListener('mute', () => post('pc-track-mute', { id, muted: true })); t.addEventListener('unmute', () => post('pc-track-mute', { id, muted: false })); }
  });
 }
 // Every negotiation step Steam takes and how it ends (types, directions and codec names only; no
 // addresses). close() also records which Steam script called it, so a drop shows who closed it.
 function sdp(desc) {
  if (!desc || typeof desc.sdp !== 'string') return undefined;
  const media = [];
  let cur = null;
  for (const line of desc.sdp.split(/\r?\n/)) {
   if (line.startsWith('m=')) { cur = { kind: line.slice(2).split(' ')[0], dir: '', codecs: new Set() }; media.push(cur); }
   else if (cur && /^a=(sendrecv|sendonly|recvonly|inactive)$/.test(line)) cur.dir = line.slice(2);
   else if (cur && line.startsWith('a=rtpmap:')) cur.codecs.add((line.split(' ')[1] || '').split('/')[0]);
  }
  return { type: desc.type, media: media.slice(0, 12).map(m => m.kind + ' ' + (m.dir || '?') + ' ' + [...m.codecs].slice(0, 4).join('+')) };
 }
 function caller() {
  const lines = String(new Error().stack || '').split('\n').slice(3, 7);
  return lines.map(l => clip(l.trim().replace(/^at /, '').replace(/https:\/\/[^/]+\//, '').replace(/\?[^:)]*/, ''), 90)).join(' < ');
 }
 const ids = new WeakMap();
 const proto = typeof Native === 'function' ? Native.prototype : null;
 let iceAdds = 0;
 if (proto) for (const name of ['createOffer', 'createAnswer', 'setLocalDescription', 'setRemoteDescription', 'addIceCandidate', 'close', 'restartIce', 'addTrack', 'addTransceiver', 'removeTrack']) {
  const orig = proto[name];
  if (typeof orig !== 'function') continue;
  proto[name] = function (...args) {
   const id = ids.get(this) || 0, info = { id, method: name };
   if (name === 'setRemoteDescription' || name === 'setLocalDescription') info.sdp = sdp(args[0]);
   if (name === 'close' || name === 'restartIce') info.caller = caller();
   if (name === 'addTransceiver') info.kind = typeof args[0] === 'string' ? args[0] : args[0] && args[0].kind;
   if (name === 'addTrack') info.kind = args[0] && args[0].kind;
   let result;
   try { result = orig.apply(this, args); }
   catch (e) { post('pc-call', { ...info, ok: false, name: clip(e && e.name, 40), message: clip(e && e.message, 200) }); throw e; }
   if (result && typeof result.then === 'function') {
    return result.then(value => {
     if (name === 'addIceCandidate') { if (++iceAdds % 25 === 1) post('pc-call', { ...info, ok: true, count: iceAdds }); }
     else post('pc-call', { ...info, ok: true, sdp: info.sdp || (value && value.sdp ? sdp(value) : undefined) });
     return value;
    }, e => { post('pc-call', { ...info, ok: false, name: clip(e && e.name, 40), message: clip(e && e.message, 200) }); throw e; });
   }
   post('pc-call', { ...info, ok: true });
   return result;
  };
 }
 const kindOf = s => s.kind || s.mediaType;
 async function sample(id, pc) {
  if (pc.signalingState === 'closed') { live.delete(id); post('pc-closed', { id }); return; }
  let report;
  try { report = await pc.getStats(); } catch (e) { return; }
  const byId = new Map();
  report.forEach(s => byId.set(s.id, s));
  const out = { packets: 0, bytes: 0 }, src = { level: 0, energy: 0 }, inc = { streams: 0, packets: 0, bytes: 0, level: 0, energy: 0, lost: 0, jitter: 0 };
  let pair = null;
  report.forEach(s => {
   if (s.type === 'outbound-rtp' && kindOf(s) === 'audio') { out.packets += s.packetsSent || 0; out.bytes += s.bytesSent || 0; }
   else if (s.type === 'media-source' && s.kind === 'audio') { src.level = Math.max(src.level, s.audioLevel || 0); src.energy += s.totalAudioEnergy || 0; }
   else if (s.type === 'inbound-rtp' && kindOf(s) === 'audio') {
    inc.streams++; inc.packets += s.packetsReceived || 0; inc.bytes += s.bytesReceived || 0; inc.level = Math.max(inc.level, s.audioLevel || 0);
    inc.energy += s.totalAudioEnergy || 0; inc.lost += s.packetsLost || 0; inc.jitter = Math.max(inc.jitter, s.jitter || 0);
   } else if (s.type === 'transport' && s.selectedCandidatePairId) {
    const p = byId.get(s.selectedCandidatePairId);
    if (p) {
     const l = byId.get(p.localCandidateId) || {}, r = byId.get(p.remoteCandidateId) || {};
     pair = { state: p.state, rtt: p.currentRoundTripTime, local: l.candidateType || '', remote: r.candidateType || '', protocol: l.protocol || '' };
    }
   }
  });
  const senders = pc.getSenders().filter(x => x.track && x.track.kind === 'audio').map(x => ({ label: clip(x.track.label, 80), enabled: x.track.enabled, state: x.track.readyState }));
  post('pc-stats', { id, out, src, in: inc, pair, senders, connection: pc.connectionState, ice: pc.iceConnectionState });
 }
 let lastVoiceUi = null, lastPresence = '';
 setInterval(() => {
  for (const [id, pc] of live) sample(id, pc);
  // Steam's own sign that this account is in a voice channel (the class Tyler also reads).
  const active = !!document.querySelector('.chatRoomVoiceChannel.ActiveVoiceChannel');
  if (active !== lastVoiceUi) { lastVoiceUi = active; post('voice-ui', { active }); }
  const presence = JSON.stringify({ bridge: window.__roboticTylerAudioInstalled === true, panel: !!document.getElementById('tyler-companion-root'), testBar: !!document.getElementById('tyler-wv2-bridge-bar') });
  if (presence !== lastPresence) { lastPresence = presence; post('tyler-presence', JSON.parse(presence)); }
 }, 1000);

 // ── Script errors on the page, and Steam's own console lines about voice ──
 let errors = 0, lines = 0;
 window.addEventListener('error', e => { if (errors++ < 60) post('page-error', { message: clip(e.message, 200), file: clip(String(e.filename || '').split('/').pop().split('?')[0], 60), line: e.lineno }); }, true);
 window.addEventListener('unhandledrejection', e => { if (errors++ < 60) post('page-error', { message: clip(e.reason && (e.reason.message || e.reason), 200), kind: 'promise' }); });
 const VOICE = /voice|webrtc|rtc|peer|ice|sdp|audio|microphone|getusermedia|kick|disconnect/i;
 for (const level of ['error', 'warn', 'log', 'info']) {
  const orig = console[level];
  if (typeof orig !== 'function') continue;
  console[level] = function (...args) {
   try {
    const text = args.map(a => typeof a === 'string' ? a : a && a.message ? a.message : '').join(' ');
    if ((level === 'error' || VOICE.test(text)) && lines++ < 300) post('console', { level, text: clip(text, 220) });
   } catch (e) {}
   return orig.apply(this, args);
  };
 }

 // ── Tyler's own status messages (Stage 2). Types and short status texts only: no audio, no transcripts. ──
 let pcmCount = 0;
 window.addEventListener('message', e => {
  if (e.source !== window) return;
  const m = e.data;
  if (!m || typeof m.source !== 'string' || m.source.indexOf('tyler-') !== 0) return;
  if (m.source === 'tyler-audio-status') post('tyler', { kind: 'audio-status', text: clip(m.text), ok: m.ok !== false, attached: m.voice && m.voice.attached, peers: m.voice && m.voice.peers, enabled: m.voice && m.voice.enabled, player: clip(m.voice && m.voice.player, 20) });
  else if (m.source === 'tyler-audio-command') {
   if (m.type === 'pcm') { if (++pcmCount % 50 === 1) post('tyler', { kind: 'command', command: 'pcm', count: pcmCount }); return; }
   post('tyler', { kind: 'command', command: clip(m.type, 30), sound: clip(m.sound, 30) });
  }
  else if (m.source === 'tyler-playback') post('tyler', { kind: 'playback', playing: !!m.playing });
  else if (m.source === 'tyler-listener') {
   if (m.type === 'level' || m.type === 'live-level' || m.type === 'live-audio') return;
   post('tyler', { kind: 'listener', event: clip(m.type, 20), seconds: typeof m.seconds === 'number' ? Math.round(m.seconds * 10) / 10 : undefined, tracks: m.tracks, text: m.type === 'utterance' ? '' : clip(m.text || m.message || '', 140) });
  }
  else if (m.source === 'tyler-soundboard-status') post('tyler', { kind: 'soundboard', text: clip(m.text, 120) });
  else if (m.source === 'tyler-bridge-test') post('tyler', { kind: 'bridge-test', event: clip(m.event, 30), text: clip(m.text, 140) });
 });
})();

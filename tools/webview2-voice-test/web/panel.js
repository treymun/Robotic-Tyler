// The test panel: turns the diagnostics script's reports (and the host's) into five stage verdicts,
// live audio meters, the Stage 2 checklist and a plain-text report. Nothing leaves this machine:
// the report is saved to your desktop or copied for you to send.
(() => {
 'use strict';
 const wv = window.chrome && window.chrome.webview;
 const $ = id => document.getElementById(id);
 const send = m => { try { wv && wv.postMessage(m); } catch (e) {} };
 const now = () => Date.now();
 const time = t => new Date(t).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });

 // Speech thresholds: totalAudioEnergy grows by about level² per second, so 0.0004/s is a sustained
 // level near 0.02 (quiet speech); single samples above 0.03 also count.
 const ENERGY = 0.0004, LEVEL = 0.03;
 const S = {
  host: null, mode: 'manual', modeAt: now(),
  support: null, micPermission: '', permissions: [], gum: [], devices: null,
  pcs: new Map(), voiceUi: false, voiceUiOn: 0, voiceUiOff: 0,
  presence: {}, attached: 0, audioStatus: '', events: [], outSpeech: [], inSpeech: [], playing: false, playStart: 0,
  firsts: {}, peaks: { out: 0, in: 0 }, log: []
 };
 const STAGES = [
  ['support', 'Browser support'],
  ['permission', 'Audio permission'],
  ['join', 'Room join'],
  ['peer', 'Peer connection'],
  ['transfer', 'Audio transfer']
 ];

 function log(text) {
  S.log.push({ at: now(), text });
  if (S.log.length > 400) S.log.shift();
  const li = document.createElement('li');
  const t = document.createElement('time'); t.textContent = time(now());
  li.append(t, document.createTextNode(text));
  const list = $('log'); list.append(li);
  while (list.children.length > 400) list.firstChild.remove();
  list.scrollTop = list.scrollHeight;
 }
 const mark = (name, at = now()) => { if (!S.firsts[name]) S.firsts[name] = at; };
 // Each stage is judged on its own: switching stage clears what the previous one measured (the log stays).
 function resetForMode(mode) {
  S.mode = mode; S.modeAt = now(); S.firsts = {}; S.peaks = { out: 0, in: 0 }; S.attached = 0; S.audioStatus = '';
  S.outSpeech = []; S.inSpeech = []; S.events = []; S.playing = false;
  for (const p of S.pcs.values()) if (!p.closedAt) p.closedAt = now();
 }

 // ── Incoming reports ──
 wv && wv.addEventListener('message', e => {
  const m = e.data || {};
  if (m.type === 'page' && m.msg && m.msg.diag === 1) page(m.msg);
  else host(m);
  render();
 });

 function host(m) {
  if (m.type === 'host') {
   const modeChanged = S.host && S.host.mode !== m.mode;
   S.host = m;
   if (S.mode !== m.mode || modeChanged) resetForMode(m.mode);
   const x = m.extension || {};
   if (m.mode === 'tyler') log('Stage 2: Tyler ' + (x.installed ? 'installed (' + (x.enabled ? 'enabled' : 'disabled') + ', id ' + x.id + ', v' + x.version + ')' : 'not installed') + (x.error ? ' · error: ' + x.error : ''));
   else if (m.mode === 'bridge') log('Stage 2B: Tyler\'s in-page audio scripts ' + (m.bridgeInjected ? 'injected' : 'NOT injected') + (x.error ? ' · ' + x.error : ''));
   else log('Stage 1: manual call (no Tyler code loaded)');
  } else if (m.type === 'permission') {
   S.permissions.push({ ...m, at: now() });
   log('Permission request: ' + m.kind + ' from ' + m.origin + ' → ' + m.state + (m.userInitiated ? ' (after a click)' : ''));
  } else if (m.type === 'nav') {
   if (m.phase === 'done') log('Page ' + (m.ok ? 'loaded: ' : 'failed (' + m.status + '): ') + m.url);
  } else if (m.type === 'process-failed') {
   log('WebView2 process failed: ' + m.kind + ' (' + m.reason + ')');
   S.events.push({ kind: 'process-failed', at: now(), detail: m.kind });
  } else if (m.type === 'saved') { $('notice').textContent = 'Report saved to ' + m.path + ' and copied to the clipboard.'; log('Report saved: ' + m.path); }
  else if (m.type === 'copied') $('notice').textContent = 'Report copied to the clipboard.';
  else if (m.type === 'notice') $('notice').textContent = m.text;
 }

 function pc(m) {
  const key = m.doc + '#' + m.id;
  if (!S.pcs.has(key)) S.pcs.set(key, { id: m.id, doc: m.doc, created: now(), signaling: 'stable', ice: 'new', connection: 'new', local: '', remote: '', connectedAt: 0, closedAt: 0, failed: false, prev: null, stats: null, rate: { out: 0, in: 0 } });
  return S.pcs.get(key);
 }

 function page(m) {
  switch (m.type) {
   case 'document':
    // A new page: connections from the previous page are gone.
    for (const p of S.pcs.values()) if (!p.closedAt && p.doc !== m.doc) p.closedAt = now();
    log('Steam document: ' + m.path); break;
   case 'support': S.support = m; mark('support'); log('Browser support: ' + supportSummary(m)); break;
   case 'mic-permission': S.micPermission = m.state; log('Page sees microphone permission: ' + m.state); break;
   case 'gum-request':
    S.gum.push({ ...m, local: now() });
    if (m.audio && S.mode !== 'manual') S.events.push({ kind: 'real-mic', at: now() });
    log('Steam asked for a real ' + [m.audio && 'microphone', m.video && 'camera'].filter(Boolean).join(' + '));
    break;
   case 'gum-result': {
    const r = S.gum.find(g => g.id === m.id); if (r) r.result = m;
    log(m.ok ? 'Microphone opened: ' + (m.tracks || []).map(t => t.kind + ' "' + (t.label || 'unnamed') + '"').join(', ') : 'Microphone failed: ' + m.name + ' · ' + m.message);
    break;
   }
   case 'devices': S.devices = m; log('Audio inputs: ' + (m.inputs.join(' · ') || 'none listed')); break;
   case 'pc-new': pc(m); mark('pc'); log('Steam created WebRTC connection #' + m.id + ' (' + m.iceServers + ' ICE servers, policy ' + m.policy + ')'); break;
   case 'pc-state': {
    const p = pc(m), before = [p.signaling, p.ice, p.connection, p.remote].join('/');
    Object.assign(p, { signaling: m.signaling, ice: m.ice, connection: m.connection, local: m.local, remote: m.remote });
    if (m.remote) mark('negotiated');
    if ((m.connection === 'connected' || m.ice === 'connected' || m.ice === 'completed') && !p.connectedAt) {
     p.connectedAt = now(); mark('connected');
     S.events.push({ kind: 'session', at: p.connectedAt, pc: p.id });
     log('Connection #' + m.id + ' connected');
    }
    if (m.connection === 'failed' || m.ice === 'failed') { if (!p.failed) log('Connection #' + m.id + ' FAILED (ice ' + m.ice + ')'); p.failed = true; }
    if (before !== [p.signaling, p.ice, p.connection, p.remote].join('/')) log('Connection #' + m.id + ': ' + m.signaling + ' · ICE ' + m.ice + ' · ' + m.connection + (m.remote ? ' · remote ' + m.remote : ''));
    break;
   }
   case 'pc-track': log('Connection #' + m.id + ' received a remote ' + m.kind + ' track'); break;
   case 'pc-closed': { const p = pc(m); p.closedAt = now(); S.events.push({ kind: 'left', at: now(), pc: p.id }); log('Connection #' + m.id + ' closed'); break; }
   case 'pc-stats': stats(m); break;
   case 'voice-ui':
    if (m.active) { S.voiceUiOn++; mark('voiceUi'); S.events.push({ kind: 'voice-on', at: now() }); }
    else if (S.voiceUi) { S.voiceUiOff++; S.events.push({ kind: 'voice-off', at: now() }); }
    S.voiceUi = m.active;
    log(m.active ? 'Steam shows this account in a voice channel' : 'Steam no longer shows an active voice channel');
    break;
   case 'tyler-presence': S.presence = m; log('Tyler in the page: bridge ' + yes(m.bridge) + ', panel ' + yes(m.panel) + ', 2B test bar ' + yes(m.testBar)); break;
   case 'tyler': tyler(m); break;
  }
 }
 const yes = v => v ? 'yes' : 'no';

 function stats(m) {
  const p = pc(m), prev = p.stats, dt = prev ? Math.max(.25, (m.at - prev.at) / 1000) : 1;
  p.stats = m; p.senders = m.senders; p.pair = m.pair || p.pair;
  if (!prev) return;
  const outPk = (m.out.packets - prev.out.packets) / dt, inPk = (m.in.packets - prev.in.packets) / dt;
  const outE = (m.src.energy - prev.src.energy) / dt, inE = (m.in.energy - prev.in.energy) / dt;
  p.rate = { out: outPk, in: inPk, outLevel: m.src.level, inLevel: m.in.level };
  S.peaks.out = Math.max(S.peaks.out, m.src.level || 0); S.peaks.in = Math.max(S.peaks.in, m.in.level || 0);
  if (outPk > 0) mark('outPackets');
  if (inPk > 0) mark('inPackets');
  if (outPk > 0 && (outE > ENERGY || m.src.level > LEVEL)) { S.outSpeech.push(now()); if (!S.firsts.outSpeech) log('Outgoing audio with sound in it (level ' + m.src.level.toFixed(2) + ')'); mark('outSpeech'); }
  if (inPk > 0 && (inE > ENERGY || m.in.level > LEVEL)) { S.inSpeech.push(now()); if (!S.firsts.inSpeech) log('Incoming audio with sound in it (level ' + m.in.level.toFixed(2) + ')'); mark('inSpeech'); }
  if (S.outSpeech.length > 2000) S.outSpeech.splice(0, 1000);
  if (S.inSpeech.length > 2000) S.inSpeech.splice(0, 1000);
 }

 function tyler(m) {
  if (m.kind === 'audio-status') {
   S.audioStatus = m.text; if (typeof m.attached === 'number') S.attached = Math.max(S.attached, m.attached);
   log('Tyler bridge: ' + m.text + (typeof m.attached === 'number' ? ' (attached ' + m.attached + ', peers ' + m.peers + ', player ' + m.player + ')' : ''));
  } else if (m.kind === 'command') {
   if (m.command === 'sound' && m.sound === 'beep') S.events.push({ kind: 'beep', at: now() });
   if (m.command === 'audio') S.events.push({ kind: 'clip', at: now() });
   if (m.command === 'enable') S.events.push({ kind: 'enable', at: now() });
   log('Tyler command: ' + m.command + (m.sound ? ' ' + m.sound : '') + (m.count ? ' (#' + m.count + ')' : ''));
  } else if (m.kind === 'playback') {
   if (m.playing && !S.playing) { S.playStart = now(); S.events.push({ kind: 'play', at: now() }); }
   if (!m.playing && S.playing) S.events.push({ kind: 'play-end', at: now(), from: S.playStart });
   S.playing = m.playing;
   log(m.playing ? 'Tyler is playing audio into the call' : 'Tyler stopped playing');
  } else if (m.kind === 'listener') {
   if (m.event === 'utterance') { S.events.push({ kind: 'heard', at: now(), seconds: m.seconds }); log('Tyler heard ' + (m.seconds || '?') + ' s of speech from the call'); }
   else log('Tyler listener ' + m.event + (m.text ? ': ' + m.text : '') + (m.tracks != null ? ' (tracks ' + m.tracks + ')' : ''));
  } else if (m.kind === 'bridge-test') log('2B test bar: ' + m.text);
  else if (m.kind === 'soundboard') log('Tyler soundboard: ' + m.text);
 }

 // ── Verdicts ──
 const pcs = () => [...S.pcs.values()];
 const sinceMode = list => list.filter(e => e.at >= S.modeAt);
 const ev = kind => S.events.filter(e => e.kind === kind && e.at >= S.modeAt);
 const outSpeechBetween = (a, b) => S.outSpeech.some(t => t >= a && t <= b);
 function supportSummary(s) {
  const missing = [!s.rtcPeerConnection && 'RTCPeerConnection', !s.getUserMedia && 'getUserMedia', !s.audioContext && 'Web Audio', !s.mediaStreamDestination && 'MediaStream destination', !s.opus && 'Opus', !s.secureContext && 'secure context'].filter(Boolean);
  const edge = (s.brands || []).find(b => /WebView2|Edge/i.test(b)) || '';
  return missing.length ? 'missing ' + missing.join(', ') : 'WebRTC, microphone API, Web Audio and Opus available' + (edge ? ' · ' + edge : '');
 }
 function verdicts() {
  const v = {}, s = S.support, all = pcs(), live = all.filter(p => !p.closedAt);
  // 1
  if (!s) v.support = ['pending', 'Waiting for Steam chat to load (sign in first if asked).'];
  else if (s.error || !s.rtcPeerConnection || !s.getUserMedia || !s.audioContext || !s.opus || !s.secureContext) v.support = ['fail', supportSummary(s) + (s.error ? ' · ' + s.error : '')];
  else v.support = ['ok', supportSummary(s)];
  // 2
  const micReq = S.permissions.filter(p => p.kind === 'Microphone' && p.at >= S.modeAt);
  const realAudio = S.gum.filter(g => g.audio && g.local >= S.modeAt);
  const lastReal = realAudio[realAudio.length - 1];
  if (S.mode === 'manual') {
   if (micReq.some(p => p.state === 'denied')) v.permission = ['fail', 'The microphone request was denied in the prompt.'];
   else if (lastReal && lastReal.result && !lastReal.result.ok) v.permission = ['fail', 'Steam couldn\'t open the microphone: ' + lastReal.result.name + ' · ' + lastReal.result.message];
   else if (lastReal && lastReal.result && lastReal.result.ok) v.permission = ['ok', 'Microphone open: ' + (((lastReal.result.tracks || []).find(t => t.kind === 'audio') || {}).label || 'unnamed device') + (micReq.length ? ' (allowed in the prompt)' : ' (already allowed)')];
   else if (lastReal) v.permission = ['active', 'Steam asked for the microphone; waiting for the answer…'];
   else v.permission = ['pending', 'Join a voice channel; Steam will ask for the microphone.'];
  } else {
   if (lastReal) v.permission = ['fail', 'The physical microphone was requested (' + (lastReal.result ? (lastReal.result.ok ? 'opened' : lastReal.result.name) : 'pending') + '): Tyler\'s bridge didn\'t take over Steam\'s microphone.'];
   else if (live.some(p => (p.senders || []).length)) v.permission = ['ok', 'Not needed: Steam is sending Tyler\'s synthetic microphone and never asked for the physical one.'];
   else v.permission = ['pending', S.mode === 'bridge' ? 'Press Enable in the test bar, then join voice.' : 'Press Connect & start in Tyler\'s panel, then join voice.'];
  }
  // 3
  const negotiated = all.find(p => p.remote);
  if (S.voiceUi || negotiated) v.join = ['ok', [S.voiceUi && 'Steam shows this account in the voice channel', negotiated && 'offer/answer exchanged (connection #' + negotiated.id + ')'].filter(Boolean).join(' · ')];
  else if (all.length) v.join = ['active', 'Steam opened a WebRTC connection; waiting for the answer…'];
  else v.join = ['pending', 'Join a voice channel in the group (the speaker icon next to a channel).'];
  // 4
  const connected = all.filter(p => p.connectedAt), cur = live.find(p => p.connectedAt) || connected[connected.length - 1];
  if (cur && !cur.closedAt) {
   const pr = cur.pair || {};
   v.peer = ['ok', 'Connected' + (pr.local ? ' via ' + pr.local + '→' + pr.remote + ' ' + (pr.protocol || '').toUpperCase() : '') + (pr.rtt != null ? ', round trip ' + Math.round(pr.rtt * 1000) + ' ms' : '')];
  } else if (all.some(p => p.failed) && !live.some(p => p.connectedAt)) v.peer = ['fail', 'ICE failed: Steam\'s voice server couldn\'t be reached (firewall, VPN or proxy?).'];
  else if (connected.length) v.peer = ['warn', 'Connected earlier; that connection is closed now (left voice?).'];
  else if (all.length) v.peer = ['active', 'Connecting… (ICE ' + all[all.length - 1].ice + ')'];
  else v.peer = ['pending', 'No connection yet.'];
  // 5
  const outOk = !!S.firsts.outSpeech && S.firsts.outSpeech >= S.modeAt, inOk = !!S.firsts.inSpeech && S.firsts.inSpeech >= S.modeAt;
  const flowingOut = live.some(p => p.rate.out > 0), flowingIn = live.some(p => p.rate.in > 0);
  const who = S.mode === 'manual' ? 'your voice' : 'Tyler\'s audio';
  if (outOk && inOk) v.transfer = ['ok', 'Sound went out (' + who + ') and came in (your friend). Confirm below that each of you heard the other.'];
  else if (flowingOut || flowingIn || outOk || inOk) {
   const parts = [];
   parts.push(outOk ? 'out: sound sent ✓' : flowingOut ? 'out: packets but silent' + (S.mode === 'manual' ? ' (is the microphone muted?)' : ' (play the test beep)') : 'out: nothing sent');
   parts.push(inOk ? 'in: sound received ✓' : flowingIn ? 'in: packets but silent (ask your friend to talk)' : 'in: nothing received');
   v.transfer = ['active', parts.join(' · ')];
  } else v.transfer = ['pending', 'Waiting for audio packets.'];
  return v;
 }

 // Stage 2 checklist: automatic evidence plus your own confirmation.
 function sessions() {
  const list = ev('session'), left = ev('left').length + ev('voice-off').length;
  return { count: list.length, rejoined: list.length >= 2 && left > 0, latest: list[list.length - 1] };
 }
 function checks() {
  const mode = S.mode, ss = sessions();
  if (mode === 'manual') return [
   ['heard-friend', 'I heard my friend', S.firsts.inSpeech >= S.modeAt ? ['ok', 'Incoming audio had sound in it.'] : ['pending', 'Waiting for incoming sound.']],
   ['friend-heard', 'My friend heard me', S.firsts.outSpeech >= S.modeAt ? ['ok', 'Outgoing audio had sound in it.'] : ['pending', 'Talk with the microphone on.']]
  ];
  const beeps = ev('beep'), heard = ev('heard'), plays = ev('play-end'), clips = ev('clip');
  const beepOut = beeps.some(b => outSpeechBetween(b.at, b.at + 4000));
  const replyOut = plays.some(p => heard.some(h => h.at <= p.from) && outSpeechBetween(p.from, p.at + 1000)) || (mode === 'bridge' && clips.some(c => outSpeechBetween(c.at, c.at + 8000)));
  const after = ss.latest && ss.count >= 2 ? ss.latest.at : Infinity;
  const afterOk = beeps.some(b => b.at > after && outSpeechBetween(b.at, b.at + 4000)) || plays.some(p => p.from > after && outSpeechBetween(p.from, p.at + 1000));
  const synthetic = S.attached > 0 || pcs().some(p => !p.closedAt && (p.senders || []).length);
  const realMic = ev('real-mic').length > 0;
  const list = [
   ['loaded', mode === 'tyler' ? 'Tyler loaded in Steam chat' : 'Tyler\'s audio scripts loaded',
    mode === 'tyler' ? (S.presence.bridge && S.presence.panel ? ['ok', 'Bridge and panel are in the page.'] : S.presence.bridge ? ['warn', 'Bridge is in the page but the panel isn\'t: the extension\'s isolated scripts didn\'t run.'] : ['pending', 'Not seen in the page yet. ' + ((S.host && S.host.extension && S.host.extension.error) || '')])
     : (S.presence.bridge && S.presence.testBar ? ['ok', 'Bridge and test bar are in the page.'] : ['pending', 'Not seen in the page yet.'])],
   ['synthetic', 'Steam is sending Tyler\'s synthetic microphone', S.attached > 0 ? ['ok', 'Bridge attached to ' + S.attached + ' outgoing sender(s).'] : synthetic ? ['ok', 'An outgoing audio sender exists and no real microphone was opened.'] : ['pending', 'Join voice after enabling Tyler.']],
   ['no-mic', 'Physical microphone not used', realMic ? ['fail', 'Steam asked for the real microphone in this stage.'] : synthetic ? ['ok', 'No request for the real microphone since this stage started.'] : ['pending', '']],
   ['beep', 'Friend heard Tyler\'s test beep', beepOut ? ['ok', 'Beep sent and sound went out.'] : beeps.length ? ['warn', 'Beep sent but no outgoing sound was measured.'] : ['pending', mode === 'tyler' ? 'Tyler panel → Checks → Run connection checks plays the beep.' : 'Press Test beep in the test bar.']],
   ['heard', 'Tyler heard your friend', heard.length ? ['ok', 'Tyler captured ' + heard.length + ' turn(s) of speech.'] : ['pending', 'Ask your friend to say something to Tyler.']],
   ['reply', mode === 'tyler' ? 'Friend heard Tyler\'s spoken reply' : 'Friend heard their words echoed back', replyOut ? ['ok', 'Tyler played audio into the call after hearing speech.'] : ['pending', '']]
  ];
  if (mode === 'tyler') list.push(['text', 'Text reply arrived in the same room', ['pending', 'Your friend types a message in the group chat; Tyler answers in text.']]);
  list.push(['rejoin', 'Left voice and rejoined once', ss.rejoined ? ['ok', 'Connected ' + ss.count + ' times with a leave in between.'] : ss.count ? ['pending', 'Joined once. Leave the voice channel, then join again.'] : ['pending', '']]);
  list.push(['after', 'After rejoining: beep and reply still work', afterOk ? ['ok', 'Tyler\'s audio went out after the rejoin.'] : ['pending', ss.rejoined ? 'Play the beep and talk to Tyler again.' : '']]);
  return list;
 }

 // ── Rendering ──
 const ticks = (() => { try { return JSON.parse(localStorage.getItem('ticks') || '{}'); } catch (e) { return {}; } })();
 const saveTicks = () => { try { localStorage.setItem('ticks', JSON.stringify(ticks)); } catch (e) {} };
 function render() {
  const h = S.host;
  if (h) $('hostLine').textContent = 'WebView2 runtime ' + h.runtime + ' · SDK ' + h.sdk + ' · ' + h.os + ' · test profile ' + h.profile;
  for (const b of document.querySelectorAll('.modes button')) b.setAttribute('aria-checked', String(b.dataset.mode === S.mode));
  $('settings').hidden = S.mode !== 'tyler';
  steps();
  const v = verdicts(), list = $('stages');
  list.replaceChildren(...STAGES.map(([key, name]) => {
   const [state, detail] = v[key], li = document.createElement('li');
   li.dataset.state = state;
   li.innerHTML = '<span class="dot"></span><b></b><span class="verdict"></span><span class="detail"></span>';
   li.querySelector('b').textContent = name;
   li.querySelector('.verdict').textContent = { ok: 'works', warn: 'check', fail: 'failed', active: 'in progress', pending: 'waiting' }[state];
   li.querySelector('.detail').textContent = detail;
   return li;
  }));
  const live = pcs().filter(p => !p.closedAt && p.stats), r = live.reduce((a, p) => ({ out: a.out + (p.rate.out || 0), in: a.in + (p.rate.in || 0), ol: Math.max(a.ol, p.rate.outLevel || 0), il: Math.max(a.il, p.rate.inLevel || 0) }), { out: 0, in: 0, ol: 0, il: 0 });
  $('outBar').style.width = Math.min(100, Math.sqrt(r.ol) * 100) + '%'; $('inBar').style.width = Math.min(100, Math.sqrt(r.il) * 100) + '%';
  $('outText').textContent = live.length ? Math.round(r.out) + ' pkt/s · level ' + r.ol.toFixed(2) : '—';
  $('inText').textContent = live.length ? Math.round(r.in) + ' pkt/s · level ' + r.il.toFixed(2) : '—';
  const ss = sessions();
  $('joins').textContent = ss.count ? 'Voice sessions this stage: ' + ss.count + (ss.rejoined ? ' (left and rejoined ✓)' : '') + ' · Steam voice UI ' + (S.voiceUi ? 'active' : 'inactive') : 'Not in a call yet.';
  $('checkTitle').textContent = S.mode === 'manual' ? 'Two-way speech (confirm with your friend)' : S.mode === 'tyler' ? 'Stage 2: Tyler in the call' : 'Stage 2B: Tyler\'s bridge in the call';
  $('checks').replaceChildren(...checks().map(([key, label, [state, auto]]) => {
   const li = document.createElement('li'), id = 'ck-' + S.mode + '-' + key;
   li.innerHTML = '<input type="checkbox"><label></label><span class="auto"></span>';
   const box = li.querySelector('input'); box.id = id; box.checked = !!ticks[id];
   box.addEventListener('change', () => { ticks[id] = box.checked; saveTicks(); log((box.checked ? 'Confirmed: ' : 'Unconfirmed: ') + label); });
   li.querySelector('label').htmlFor = id; li.querySelector('label').textContent = label;
   const a = li.querySelector('.auto'); a.dataset.state = state; a.textContent = auto ? 'Measured: ' + auto : '';
   return li;
  }));
 }
 function steps() {
  const box = $('steps'), mode = S.mode;
  if (box.dataset.mode === mode) return;
  box.dataset.mode = mode;
  const items = {
   manual: ['Sign in to the bot account in the Steam window (normal Steam sign-in).', 'Open your group chat and join a voice channel.', 'Allow the microphone when this test asks.', 'Talk with your friend both ways, then tick the two boxes below.', 'Save report and send me the file.'],
   tyler: ['Windows sound settings: disable the VB-CABLE devices and mute the physical microphone.', 'Press Tyler settings: add your AI key, then Settings → Voice: tick the listening consent. Save.', 'In Steam chat open the group, then Tyler\'s panel → Connect & start.', 'Join the voice channel. If Windows asks for the microphone, choose No.', 'Tyler panel → Checks → Run connection checks (the beep). Then your friend talks to Tyler, and types a message for a text reply.', 'Leave voice, rejoin, beep and talk once more. Tick what your friend confirms, then Save report.'],
   bridge: ['Use this only if Stage 2 can\'t load Tyler. It tests the audio path without AI or text.', 'Disable VB-CABLE and mute the physical microphone, as for Stage 2.', 'In the Steam window use the test bar (bottom left): 1 · Enable synthetic mic, then join voice.', '2 · Test beep, then 3 · Listen + echo: your friend speaks, pauses, and hears their own words come back.', 'Leave voice, rejoin, beep and echo once more. Tick what your friend confirms, then Save report.']
  }[mode];
  box.innerHTML = '<h2></h2><ol></ol>';
  box.querySelector('h2').textContent = { manual: 'Stage 1 · manual call', tyler: 'Stage 2 · Tyler\'s bridge', bridge: 'Stage 2B · bridge only (fallback)' }[mode];
  box.querySelector('ol').replaceChildren(...items.map(t => { const li = document.createElement('li'); li.textContent = t; return li; }));
 }

 // ── Report ──
 function report() {
  const h = S.host || {}, v = verdicts(), lines = [];
  lines.push('ROBOTIC TYLER · WebView2 voice test report', 'Generated ' + new Date().toISOString());
  lines.push('Test app ' + (h.app || '?') + ' · WebView2 runtime ' + (h.runtime || '?') + ' · SDK ' + (h.sdk || '?') + ' · ' + (h.os || '?') + ' ' + (h.arch || ''));
  lines.push('User agent: ' + ((S.support && S.support.userAgent) || h.userAgent || '?'));
  if (S.support && S.support.brands) lines.push('Brands: ' + S.support.brands.join(', '));
  lines.push('Stage: ' + { manual: '1 (manual call)', tyler: '2 (Tyler extension)', bridge: '2B (bridge only)' }[S.mode] + ' · started ' + time(S.modeAt));
  if (h.extension) lines.push('Tyler extension: bundled ' + yes(h.extension.bundled) + ' v' + h.extension.version + ', installed ' + yes(h.extension.installed) + ', enabled ' + yes(h.extension.enabled) + (h.extension.error ? ', error: ' + h.extension.error : '') + ' · 2B scripts injected ' + yes(h.bridgeInjected));
  lines.push('', 'STAGES');
  for (const [key, name] of STAGES) lines.push(' [' + { ok: 'OK', warn: 'CHECK', fail: 'FAIL', active: 'PARTIAL', pending: 'WAITING' }[v[key][0]] + '] ' + name + ': ' + v[key][1]);
  lines.push('', 'MEASURED');
  lines.push(' Peak outgoing level ' + S.peaks.out.toFixed(2) + ' · peak incoming level ' + S.peaks.in.toFixed(2));
  for (const p of pcs()) lines.push(' Connection #' + p.id + ': ' + p.connection + ', ICE ' + p.ice + (p.connectedAt ? ', connected ' + time(p.connectedAt) : '') + (p.closedAt ? ', closed ' + time(p.closedAt) : '') + (p.pair ? ', path ' + p.pair.local + '→' + p.pair.remote + ' ' + p.pair.protocol + ', rtt ' + Math.round((p.pair.rtt || 0) * 1000) + ' ms' : '') + (p.stats ? ', sent ' + p.stats.out.packets + ' / received ' + p.stats.in.packets + ' packets, lost ' + p.stats.in.lost : '') + (p.senders && p.senders.length ? ', outgoing track "' + (p.senders[0].label || 'unnamed') + '"' : ''));
  const ss = sessions(); lines.push(' Voice sessions: ' + ss.count + (ss.rejoined ? ' (rejoined)' : '') + ' · Steam voice UI on ' + S.voiceUiOn + ' / off ' + S.voiceUiOff + ' times');
  lines.push(' Permission prompts: ' + (S.permissions.map(p => p.kind + '=' + p.state + ' (' + p.mode + ')').join(', ') || 'none') + ' · real microphone requests: ' + S.gum.filter(g => g.audio).length);
  if (S.mode !== 'manual') lines.push(' Tyler: attached senders ' + S.attached + ', beeps ' + ev('beep').length + ', speech turns heard ' + ev('heard').length + ', playbacks ' + ev('play-end').length + ' · last bridge status: ' + (S.audioStatus || '—'));
  lines.push('', 'CONFIRMED BY YOU');
  for (const [key, label, [state, auto]] of checks()) lines.push(' [' + (ticks['ck-' + S.mode + '-' + key] ? 'x' : ' ') + '] ' + label + (auto ? '  (measured: ' + state + ' · ' + auto + ')' : ''));
  lines.push('', 'NOTES', ' ' + ($('notes').value.trim() || '—'));
  lines.push('', 'EVENT LOG (last 120)');
  for (const l of S.log.slice(-120)) lines.push(' ' + time(l.at) + '  ' + l.text);
  return lines.join('\r\n');
 }

 // ── Controls ──
 for (const b of document.querySelectorAll('.modes button')) b.addEventListener('click', () => {
  if (b.dataset.mode === S.mode) return;
  log('Switching to ' + b.querySelector('b').textContent + '…');
  send({ action: 'mode', mode: b.dataset.mode });
 });
 $('save').addEventListener('click', () => send({ action: 'save-report', text: report() }));
 $('copy').addEventListener('click', () => send({ action: 'copy', text: report() }));
 $('reload').addEventListener('click', () => send({ action: 'reload' }));
 $('settings').addEventListener('click', () => send({ action: 'tyler-settings' }));
 $('devtools').addEventListener('click', () => send({ action: 'devtools' }));
 $('data').addEventListener('click', () => send({ action: 'open-data' }));
 try { $('notes').value = localStorage.getItem('notes') || ''; } catch (e) {}
 $('notes').addEventListener('input', () => { try { localStorage.setItem('notes', $('notes').value); } catch (e) {} });
 setInterval(render, 1000);
 render();
 window.__tylerTestReport = report; // for the automated check of this page
 send({ action: 'ready' });
})();

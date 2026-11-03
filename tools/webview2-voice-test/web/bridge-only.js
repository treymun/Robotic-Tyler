// Stage 2B (fallback): a small test bar for Tyler's in-page audio scripts when the full extension
// can't run in WebView2. It uses the same messages Tyler's panel sends to audio-bridge.js and
// voice-listener.js. No AI and no chat text: "Listen + echo" plays what Tyler heard back into the
// call, so your friend hears their own words come back through Tyler's synthetic microphone.
(() => {
 'use strict';
 const origin = location.origin;
 const say = (event, text) => { window.postMessage({ source: 'tyler-bridge-test', event, text }, origin); };
 const audio = m => window.postMessage({ source: 'tyler-audio-command', ...m }, origin);
 const listener = m => window.postMessage({ source: 'tyler-listener-control', ...m }, origin);
 let echo = false, enabled = false, status;
 window.addEventListener('message', e => {
  if (e.source !== window) return;
  const m = e.data;
  if (m && m.source === 'tyler-audio-status' && status) status.textContent = String(m.text || '').slice(0, 140);
  if (m && m.source === 'tyler-listener' && m.type === 'utterance' && echo && typeof m.audio === 'string') {
   audio({ type: 'audio', audio: m.audio });
   say('echo', 'Heard ' + (Math.round((m.seconds || 0) * 10) / 10) + ' s of speech; playing it back into the call.');
   if (status) status.textContent = 'Heard your friend (' + (Math.round((m.seconds || 0) * 10) / 10) + ' s). Echoing it back…';
  }
  if (m && m.source === 'tyler-listener' && m.type === 'detection' && status && echo) status.textContent = String(m.text || '').slice(0, 140);
 });
 function bar() {
  if (document.getElementById('tyler-wv2-bridge-bar') || !document.body) return;
  const box = document.createElement('div');
  box.id = 'tyler-wv2-bridge-bar';
  Object.assign(box.style, { position: 'fixed', left: '12px', bottom: '12px', zIndex: '2147483646', width: '330px', padding: '10px 12px', borderRadius: '8px',
   background: '#101820', color: '#e6eef5', font: '12px/1.4 Segoe UI, Arial, sans-serif', boxShadow: '0 8px 24px rgba(0,0,0,.55)', border: '1px solid #3d6a8a' });
  const title = document.createElement('div');
  title.textContent = 'Tyler bridge test (Stage 2B · no AI)';
  Object.assign(title.style, { fontWeight: '700', marginBottom: '6px', color: '#9fd6ff' });
  const row = document.createElement('div');
  Object.assign(row.style, { display: 'flex', flexWrap: 'wrap', gap: '6px' });
  const button = (label, fn) => {
   const b = document.createElement('button');
   b.type = 'button'; b.textContent = label;
   Object.assign(b.style, { font: 'inherit', padding: '5px 9px', borderRadius: '5px', border: '1px solid #3d6a8a', background: '#1d3446', color: '#fff', cursor: 'pointer' });
   b.addEventListener('click', fn);
   row.append(b);
   return b;
  };
  status = document.createElement('div');
  status.textContent = 'Step 1: press Enable before joining voice.';
  Object.assign(status.style, { marginTop: '7px', color: '#c9d6e0', minHeight: '17px' });
  button('1 · Enable synthetic mic', () => { enabled = true; audio({ type: 'enable' }); say('enable', 'Enable pressed'); });
  button('2 · Test beep', () => { if (!enabled) { status.textContent = 'Press Enable first.'; return; } audio({ type: 'sound', sound: 'beep' }); say('beep', 'Beep sent'); });
  const listen = button('3 · Listen + echo', () => {
   echo = !echo;
   listener(echo ? { type: 'on', keyboardFilter: false } : { type: 'off' });
   listen.textContent = echo ? '3 · Stop listening' : '3 · Listen + echo';
   say(echo ? 'listen-on' : 'listen-off', echo ? 'Listening to the call' : 'Listening stopped');
   status.textContent = echo ? 'Listening. Ask your friend to say a sentence, then pause.' : 'Listening stopped.';
  });
  button('Stop audio', () => { audio({ type: 'stop' }); say('stop', 'Stop pressed'); });
  box.append(title, row, status);
  document.body.append(box);
 }
 if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bar); else bar();
 setInterval(bar, 2000);
})();

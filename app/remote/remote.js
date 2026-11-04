// Tyler's phone remote (v2.25): served by the desktop app on your home network (app/remote.cjs).
// Polls Tyler's status every 2 s while the page is open and sends a few actions. No data is kept here.
(() => {
 'use strict';
 const $=id=>document.getElementById(id);
 let theme='steam',paused=false,polling=0,busy=false,lastOk=0;
 const headers={'content-type':'application/json','x-tyler-remote':'1'};
 function toast(text,bad=false){const t=$('toast');t.textContent=text;t.dataset.bad=String(bad);t.hidden=false;clearTimeout(toast.timer);toast.timer=setTimeout(()=>{t.hidden=true;},3200);}
 function link(on,text){const l=$('link');l.dataset.on=String(on);l.querySelector('span').textContent=text;}
 function setTheme(next){if(!next||next===theme)return;theme=next;document.documentElement.dataset.rtTheme=next;$('themeCss').href='/ui/themes/'+next+'.css';$('logo').src='/ui/logos/'+next+'.png';
  const bg=getComputedStyle(document.documentElement).getPropertyValue('--rt-bar').trim();if(bg)document.querySelector('meta[name=theme-color]').content=bg;}
 function show(which){$('pair').hidden=which!=='pair';$('remote').hidden=which!=='remote';}

 // ── Pairing ──────────────────────────────────────────────────────────────
 async function pair(code){
  $('pairMsg').textContent='Pairing…';
  try{const r=await fetch('/pair',{method:'POST',headers,body:JSON.stringify({code})}),j=await r.json().catch(()=>({}));
   if(!r.ok)throw Error(j.error||'Pairing failed.');history.replaceState(null,'','/');$('pairMsg').textContent='';await poll();start();}
  catch(e){$('pairMsg').textContent=e.message;}
 }
 $('pairForm').addEventListener('submit',e=>{e.preventDefault();void pair($('code').value.replace(/\D/g,''));});
 $('code').addEventListener('input',()=>{const d=$('code').value.replace(/\D/g,'').slice(0,6);$('code').value=d.length>3?d.slice(0,3)+' '+d.slice(3):d;});

 // ── Status ───────────────────────────────────────────────────────────────
 function render(s){
  setTheme(s.theme);$('device').textContent=s.device?'This '+s.device+' is paired':'';$('sub').textContent='Phone remote'+(s.version?' · v'+s.version:'');
  const card=$('statusCard');
  if(!s.ready){card.dataset.state='error';$('stateLabel').textContent='Not ready';$('stateText').textContent=s.error||'Open Steam chat in Tyler\'s desktop app.';link(true,'PC online');return;}
  card.dataset.state=s.state||'ready';$('stateLabel').textContent=s.label||'Ready';$('stateText').textContent=s.text||'';
  $('voice').textContent=s.voice?.armed?(s.voice.peers?s.voice.peers+' in call':'In voice, call empty'):'Off';
  $('replies').textContent=String(s.replies??0);$('spend').textContent=s.spend||'–';
  paused=!!s.paused;const t=$('toggle');t.textContent=paused?'Connect & start':'Pause AI';t.dataset.action=paused?'start':'pause';
  $('nowPlaying').textContent=s.music?.title?'Now playing: '+s.music.title+(s.music.by?' · '+s.music.by:''):s.music?.sharing?'Music DJ is on. Nothing playing.':'Music DJ is off. Start it on the PC (Room → Music DJ).';
  $('skip').disabled=$('musicStop').disabled=!s.music?.title;
  const box=$('sounds'),list=s.sounds||[];
  if(box.dataset.key!==JSON.stringify(list)){box.dataset.key=JSON.stringify(list);box.replaceChildren();
   if(!list.length){const p=document.createElement('p');p.className='rr-empty';p.textContent='No clips yet. Add them in the Sounds tab on the PC.';box.append(p);}
   for(const c of list){const b=document.createElement('button');b.type='button';b.className='rr-btn rr-sound';b.textContent=(c.fav?'★ ':'')+c.name;b.onclick=()=>act('sound',{slot:c.slot},'Played '+c.name);box.append(b);}}
 }
 async function poll(){
  try{const r=await fetch('/state',{cache:'no-store'});
   if(r.status===401){show('pair');link(true,'Not paired');const code=new URLSearchParams(location.search).get('code');if(code&&!poll.tried){poll.tried=true;$('code').value=code;void pair(code);}return;}
   const s=await r.json();show('remote');render(s);lastOk=Date.now();link(true,s.ready?'Live':'PC online');}
  catch{link(false,Date.now()-lastOk>6000?'PC not reachable':'Reconnecting');}
 }
 function start(){clearInterval(polling);polling=setInterval(()=>{if(document.visibilityState==='visible')void poll();},2000);}
 document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')void poll();});

 // ── Actions ──────────────────────────────────────────────────────────────
 async function act(action,extra={},done=''){
  if(busy)return false;busy=true;
  try{const r=await fetch('/action',{method:'POST',headers,body:JSON.stringify({action,...extra})}),j=await r.json().catch(()=>({}));
   if(r.status===401){show('pair');return false;}if(!r.ok)throw Error(j.error||'Tyler couldn\'t do that.');if(done)toast(done);setTimeout(()=>void poll(),400);return true;}
  catch(e){toast(e.message,true);return false;}finally{busy=false;}
 }
 $('toggle').onclick=()=>act($('toggle').dataset.action,{},$('toggle').dataset.action==='pause'?'Tyler paused':'Connecting…');
 $('stopAudio').onclick=()=>act('stop-audio',{},'Audio stopped');
 $('musicForm').addEventListener('submit',e=>{e.preventDefault();const q=$('query').value.trim();if(q.length<2)return;void act('music-play',{query:q},'Queued: '+q).then(ok=>{if(ok)$('query').value='';});});
 $('skip').onclick=()=>act('music-skip',{},'Skipped');$('musicStop').onclick=()=>act('music-stop',{},'Music stopped');
 $('sayForm').addEventListener('submit',e=>{e.preventDefault();const t=$('say').value.trim();if(!t)return;void act('say',{text:t},'Sent').then(ok=>{if(ok)$('say').value='';});});
 $('forget').onclick=async()=>{try{await fetch('/forget',{method:'POST',headers,body:'{}'});}catch{}show('pair');link(true,'Not paired');};

 void poll().then(start);
})();

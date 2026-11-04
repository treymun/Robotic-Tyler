// Settings → Overview → Phone remote (v2.25, desktop app). Turns the remote on and off, shows the
// address, a pairing code and its QR code (drawn from the grid app/remote.cjs sends), and lists
// paired phones. In Chrome the section only explains that the remote comes with the desktop app.
(() => {
 'use strict';
 const bridge=globalThis.tylerSettings?.remote,$=id=>document.getElementById(id);
 if(!bridge||!$('phoneRemote'))return;
 let st=null,address=null,timer=0;
 const kit=()=>globalThis.TylerKit?.page();
 const ago=t=>{const m=Math.round((Date.now()-t)/60000);return m<1?'just now':m<60?m+' min ago':m<1440?Math.round(m/60)+' h ago':Math.round(m/1440)+' days ago';};
 function draw(rows){const c=$('remoteQr'),g=c.getContext('2d');g.fillStyle='#fff';g.fillRect(0,0,c.width,c.height);if(!rows){c.hidden=true;return;}c.hidden=false;
  const n=rows.length,quiet=4,cell=Math.floor(c.width/(n+quiet*2)),off=Math.floor((c.width-cell*n)/2);g.fillStyle='#000';
  rows.forEach((row,y)=>{for(let x=0;x<n;x++)if(row[x]==='1')g.fillRect(off+x*cell,off+y*cell,cell,cell);});}
 function render(s){
  st=s;$('remoteOn').checked=!!s.on;$('remotePanel').hidden=!s.on;
  const list=s.addresses||[];if(!address||!list.includes(address))address=list[0]||null;
  const sel=$('remoteAddress');sel.hidden=list.length<2;sel.replaceChildren(...list.map(a=>{const o=document.createElement('option');o.value=a;o.textContent=a;o.selected=a===address;return o;}));
  const url=address?'http://'+address+':'+s.port:'';$('remoteUrl').textContent=url||'(no home network found)';
  $('remoteCode').textContent=s.code?s.code.slice(0,3)+' '+s.code.slice(3):'––– –––';
  $('remoteExpiry').textContent=s.code?'The code works for '+Math.max(1,Math.round((s.codeUntil-Date.now())/60000))+' more minutes, for one phone. Press New code for another.':'Press New code to pair a phone.';
  draw(s.code&&address===list[0]?s.qr:null);
  const ul=$('remoteDevices');ul.replaceChildren();
  if(!(s.devices||[]).length){const li=document.createElement('li');li.className='hint';li.textContent='No phones yet.';ul.append(li);}
  for(const d of s.devices||[]){const li=document.createElement('li');const t=document.createElement('span');t.textContent=d.name+' · paired '+new Date(d.created).toLocaleDateString()+' · last used '+ago(d.seen);
   const b=document.createElement('button');b.type='button';b.className='secondary';b.textContent='Remove';b.onclick=()=>run('forget',{id:d.id},'Phone removed. It needs a new code to come back.');li.append(t,b);ul.append(li);}
  $('remoteForgetAll').hidden=!(s.devices||[]).length;
  $('remoteStatus').textContent=s.on?'The remote is on at port '+s.port+'.':'The remote is off. No network port is open.';
 }
 async function run(op,extra={},done=''){try{render(await bridge(op,extra));if(done)kit()?.toast({kind:'success',title:'Phone remote',text:done});}catch(e){$('remoteStatus').textContent=String(e.message||e);kit()?.toast({kind:'error',title:'Phone remote',text:String(e.message||e)});if(op==='enable')$('remoteOn').checked=false;}}
 $('remoteOn').onchange=()=>run($('remoteOn').checked?'enable':'disable');
 $('remoteNewCode').onclick=()=>run('new-code');
 $('remoteForgetAll').onclick=async()=>{const ok=await (kit()?.dialog?.({title:'Remove all phones?',text:'Every paired phone stops working until it pairs again with a new code.',confirm:'Remove all',danger:true})??Promise.resolve(confirm('Remove all phones?')));if(ok)void run('forget-all',{},'All phones removed.');};
 $('remoteAddress').onchange=()=>{address=$('remoteAddress').value;render(st);};
 $('remoteCopy').onclick=async()=>{try{await navigator.clipboard.writeText($('remoteUrl').textContent);kit()?.toast({kind:'success',title:'Copied',text:'Paste the address into your phone’s browser.'});}catch{}};
 // Keep the code's countdown and the phones list fresh while the page is open.
 const refresh=()=>{if(document.visibilityState==='visible')void bridge('status').then(render).catch(()=>{});};
 refresh();timer=setInterval(refresh,5000);
})();

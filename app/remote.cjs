'use strict';
// Phone remote (v2.25): a small page on your home network that controls Tyler from a phone's
// browser, with nothing to install. Off until you turn it on in Settings → Overview → Phone remote.
//
// Safety:
//  - Only devices on a private network (home Wi-Fi) are answered, and only at an IP address (a page
//    on the internet can't reach it through a domain that points here).
//  - A phone pairs with a 6-digit code shown in Settings (or its QR code): valid 10 minutes, 8 wrong
//    tries and it's gone. Each paired phone gets its own random key, kept here only as a hash, in an
//    HttpOnly cookie; you can remove a phone or all of them. Turning the remote off stops the server.
//  - The page can only ask for Tyler's status and a fixed list of actions (remote-control.js in the
//    Steam window carries them out). It never sees keys, settings or chat messages.
//  - v2.26: the page is a copy of Tyler's panel in his theme, with the theme's live extras: it loads
//    the panel's own stylesheet and theme code (/lib/, a fixed list) and gets the panel's UI events
//    as they happen over /events (paired phones only). Two settings can be changed from it: the
//    theme and muting the call on this PC; nothing else in Settings.
const http=require('node:http'),crypto=require('node:crypto'),os=require('node:os'),fs=require('node:fs'),path=require('node:path'),zlib=require('node:zlib');

const DEFAULT_PORT=47820,CODE_MS=600000,MAX_TRIES=8,MAX_DEVICES=8,COOKIE='rt_remote';
const THEMES=new Set(['steam','classic','tf2','cs2','portal','cs16','hev','l4d','winxp','doom','quake','pipboy','combine','deadlock','minecraft','payday','dreamcast','gmod','ricochet','dod']);
// Each action and the only fields it passes on (anything else a request carries is dropped).
const num=(v,min,max)=>{const n=Number(v);return Number.isFinite(n)?Math.min(max,Math.max(min,n)):min;};
const ACTIONS={pause:()=>({}),start:()=>({}),'stop-audio':()=>({}),sound:b=>({slot:Number(b.slot)}),'clips-stop':()=>({}),'clip-volume':b=>({value:num(b.value,0,1)}),
 'music-start':()=>({}),'music-play':b=>({query:String(b.query||'').slice(0,120)}),'music-skip':()=>({}),'music-stop':()=>({}),'music-volume':b=>({value:num(b.value,0,200)}),
 'music-quality':b=>({level:String(b.level||'')}),'music-duck':b=>({on:b.on===true}),'voice-volume':b=>({value:num(b.value,0,.7)}),mode:b=>({mode:String(b.mode||'')}),
 keepalive:b=>{const o={};if(typeof b.call==='boolean')o.call=b.call;if(typeof b.chat==='boolean')o.chat=b.chat;if(b.minutes!==undefined)o.minutes=String(Math.round(num(b.minutes,1,120)));return o;},
 'full-check':()=>({}),heard:b=>({yes:b.yes===true}),beep:()=>({}),'voice-check':()=>({}),say:b=>({text:String(b.text||'').slice(0,300)}),
 // Settings on this PC, done here rather than in the Steam window.
 theme:b=>({theme:String(b.theme||'')}),'mute-call':b=>({on:b.on===true})};
// The panel's own stylesheet, logos, icons, notifications and theme code (generated into app/companion).
const LIB=new Set(['ui-template.js','ui-logos.js','ui-icons.js','ui-kit.js','theme-features.js','theme-pack-1.js','theme-pack-2.js','theme-pack-3.js']);
const MAX_STREAMS=8;
const TYPES={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.png':'image/png','.woff2':'font/woff2','.svg':'image/svg+xml'};

/** 10/8, 172.16/12, 192.168/16, 127/8, 169.254/16 and IPv6 loopback/link-local/unique-local, also IPv4-mapped. */
function privateAddress(address){
 let a=String(address||'').toLowerCase();if(a.startsWith('::ffff:'))a=a.slice(7);
 const m=/^(\d+)\.(\d+)\.(\d+)\.(\d+)$/.exec(a);
 if(m){const [p,q]=[Number(m[1]),Number(m[2])];return p===10||p===127||p===192&&q===168||p===172&&q>=16&&q<=31||p===169&&q===254;}
 return a==='::1'||/^fe[89ab]/.test(a)||/^f[cd]/.test(a);
}
/** The Host header must be an IP address (or localhost) with our port: no domain names (DNS rebinding). */
function hostAllowed(host,port){const h=String(host||'').toLowerCase();return new RegExp('^(?:\\d{1,3}(?:\\.\\d{1,3}){3}|localhost|\\[[0-9a-f:]+\\]):'+port+'$').test(h);}
/** This PC's addresses on the home network, Wi-Fi/Ethernet first. */
function lanAddresses(){
 const out=[];for(const [name,list] of Object.entries(os.networkInterfaces()))for(const n of list||[]){if(n.family!=='IPv4'&&n.family!==4)continue;if(n.internal||!privateAddress(n.address)||n.address.startsWith('169.254.'))continue;out.push({name,address:n.address});}
 const rank=x=>/vEthernet|VirtualBox|VMware|Hyper-V|WSL|docker|vbox|tap|tun|zerotier|tailscale/i.test(x.name)?2:x.address.startsWith('192.168.')?0:1;
 return out.sort((a,b)=>rank(a)-rank(b));
}
const hash=v=>crypto.createHash('sha256').update(String(v)).digest();
const cookieOf=(req,name)=>{for(const part of String(req.headers.cookie||'').split(';')){const [k,...v]=part.trim().split('=');if(k===name)return v.join('=');}return '';};
const deviceName=ua=>{const s=String(ua||'');return /iPhone/.test(s)?'iPhone':/iPad/.test(s)?'iPad':/Android/.test(s)?(/Mobile/.test(s)?'Android phone':'Android tablet'):/Windows/.test(s)?'Windows PC':/Mac OS/.test(s)?'Mac':'Phone';};

/**
 * prefs: {get() → {theme, muteCall}, theme(name), muteCall(on)} for the two settings the phone may
 * change. gesture(): lets the Steam window start what needs a click (Start Music DJ's share).
 */
function setupRemote({vault,log=()=>{},ask,pageDir,uiDir,libDir=path.dirname(uiDir||'.'),version='',theme=async()=>'steam',prefs=null,gesture=async()=>{}}){
 let server=null,port=0,code=null,codeUntil=0,tries=0,starting=null;const seen=new Map();let lastSeenWrite=0;
 const streams=new Set();let watchTimer=0;
 const readConfig=async()=>{const v=await vault.get(['remoteControl','remoteDevices']);return {on:v.remoteControl?.on===true,port:Number(v.remoteControl?.port)||DEFAULT_PORT,devices:Array.isArray(v.remoteDevices)?v.remoteDevices:[]};};
 const writeDevices=devices=>vault.set({remoteDevices:devices.slice(-MAX_DEVICES)});
 function newCode(){code=String(crypto.randomInt(0,1000000)).padStart(6,'0');codeUntil=Date.now()+CODE_MS;tries=0;return code;}
 async function device(req){
  const raw=cookieOf(req,COOKIE),[id,key]=raw.split('.');if(!id||!key)return null;
  const {devices}=await readConfig(),d=devices.find(x=>x.id===id);if(!d)return null;
  const a=hash(key),b=Buffer.from(String(d.hash||''),'hex');if(b.length!==a.length||!crypto.timingSafeEqual(a,b))return null;
  seen.set(id,Date.now());if(Date.now()-lastSeenWrite>300000){lastSeenWrite=Date.now();void writeDevices(devices.map(x=>seen.has(x.id)?{...x,seen:seen.get(x.id)}:x)).catch(()=>{});}
  return d;
 }
 function send(res,status,body,type='application/json; charset=utf-8',extra={}){
  res.writeHead(status,{'content-type':type,'cache-control':'no-store','x-content-type-options':'nosniff','referrer-policy':'no-referrer','x-frame-options':'DENY',
   // Styles may be inline: the theme code sets sizes and positions on its parts, as in the panel.
   'content-security-policy':"default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self'; connect-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",...extra});
  res.end(typeof body==='string'||Buffer.isBuffer(body)?body:JSON.stringify(body));
 }
 // Files are compressed once (the panel's stylesheet is large) and the big ones kept for a day: their
 // address carries the app's version, so an update loads the new ones.
 const packed=new Map();
 function file(res,dir,name,req,{cache=false}={}){
  const full=path.join(dir,name);if(!full.startsWith(dir+path.sep)||!fs.existsSync(full)||!fs.statSync(full).isFile())return send(res,404,{error:'Not found'});
  const type=TYPES[path.extname(full)]||'application/octet-stream',extra=cache?{'cache-control':'private, max-age=86400'}:{};
  if(/^(text|image\/svg)/.test(type)&&/\bgzip\b/.test(String(req?.headers['accept-encoding']||''))){
   const stat=fs.statSync(full),key=full+':'+stat.mtimeMs+':'+stat.size;let gz=packed.get(full);
   if(gz?.key!==key){gz={key,data:zlib.gzipSync(fs.readFileSync(full),{level:6})};packed.set(full,gz);}
   return send(res,200,gz.data,type,{...extra,'content-encoding':'gzip',vary:'accept-encoding'});
  }
  send(res,200,fs.readFileSync(full),type,extra);
 }
 function body(req){return new Promise((resolve,reject)=>{let size=0;const parts=[];req.on('data',c=>{size+=c.length;if(size>4096){reject(Error('Too large'));req.destroy();}else parts.push(c);});req.on('end',()=>{try{resolve(JSON.parse(Buffer.concat(parts).toString('utf8')||'{}'));}catch{reject(Error('Invalid request'));}});req.on('error',reject);});}
 // Actions from one phone at most 5 a second.
 const recent=[];const limited=()=>{const t=Date.now();while(recent.length&&t-recent[0]>1000)recent.shift();if(recent.length>=5)return true;recent.push(t);return false;};

 async function run(action,args){
  if(action==='theme'){if(!THEMES.has(args.theme))throw Error('Unknown theme.');if(!prefs)throw Error('Not available.');await prefs.theme(args.theme);return {theme:args.theme};}
  if(action==='mute-call'){if(!prefs)throw Error('Not available.');await prefs.muteCall(args.on);return {};}
  if(action==='music-start')await gesture().catch(()=>{});
  return ask(action,args);
 }
 async function snapshot(){
  let state;try{state=await ask('state',{});}catch(e){state={ready:false,error:String(e.message||e).slice(0,200)};}
  const p=prefs?await prefs.get().catch(()=>({})):{};
  return {...state,version,serverNow:Date.now(),theme:THEMES.has(state?.theme)?state.theme:THEMES.has(p.theme)?p.theme:await theme(),prefs:{theme:p.theme||null,muteCall:p.muteCall===true}};
 }

 // ── Live events (v2.26): Server-Sent Events to paired phones ──────────────
 // The Steam window sends the panel's UI events only while someone watches: a 30-second lease,
 // renewed here every 20 seconds while a phone has /events open.
 function renew(){if(!streams.size){clearInterval(watchTimer);watchTimer=0;void ask('watch',{on:false}).catch(()=>{});return;}void ask('watch',{on:true}).catch(()=>{});}
 function write(s,event,data){try{s.res.write('event: '+event+'\ndata: '+JSON.stringify(data)+'\n\n');}catch{}}
 async function openStream(req,res,d){
  res.writeHead(200,{'content-type':'text/event-stream; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff','x-accel-buffering':'no',connection:'keep-alive'});
  res.write('retry: 2000\n\n');
  const s={res,device:d.id,ping:setInterval(()=>{try{res.write(': ping\n\n');}catch{}},15000)};streams.add(s);
  const end=()=>{if(!streams.delete(s))return;clearInterval(s.ping);if(!streams.size)renew();};
  req.on('close',end);res.on('error',end);
  if(!watchTimer){watchTimer=setInterval(renew,20000);}
  await ask('watch',{on:true}).catch(()=>{});
  write(s,'snap',await snapshot());
 }
 /** From the Steam window: [{type, data, at}], already reduced to what the panel shows. */
 function push(events){
  if(!streams.size||!Array.isArray(events))return;
  const list=events.slice(0,60).filter(e=>e&&typeof e.type==='string'&&e.data&&typeof e.data==='object');if(!list.length)return;
  for(const s of streams)write(s,'ui',{events:list,serverNow:Date.now()});
 }
 function dropStreams(id){for(const s of [...streams])if(!id||s.device===id){try{s.res.end();}catch{}streams.delete(s);clearInterval(s.ping);}if(!streams.size)renew();}

 async function route(req,res){
  if(!privateAddress(req.socket.remoteAddress))return send(res,403,{error:'Only devices on your home network can use the remote.'});
  if(!hostAllowed(req.headers.host,port))return send(res,421,{error:'Open the remote by its address, like http://192.168.1.20:'+port});
  const url=new URL(req.url,'http://remote'),p=url.pathname;
  // The page and its files are public on the network; everything that touches Tyler needs a paired phone.
  if(req.method==='GET'&&(p==='/'||p==='/index.html'))return file(res,pageDir,'index.html',req);
  if(req.method==='GET'&&/^\/(remote\.(js|css)|manifest\.json)$/.test(p))return file(res,pageDir,p.slice(1),req);
  if(req.method==='GET'&&p==='/ui/tokens.css')return file(res,uiDir,'tokens.css',req);
  if(req.method==='GET'&&p==='/ui/fonts/fonts.css')return file(res,path.join(uiDir,'fonts'),'fonts.css',req);
  if(req.method==='GET'&&/^\/ui\/fonts\/[\w.-]+\.woff2$/.test(p))return file(res,path.join(uiDir,'fonts'),path.basename(p),req,{cache:true});
  let m;
  if(req.method==='GET'&&(m=/^\/ui\/themes\/([a-z0-9]+)\.css$/.exec(p))&&THEMES.has(m[1]))return file(res,path.join(uiDir,'themes'),m[1]+'.css',req);
  if(req.method==='GET'&&(m=/^\/ui\/logos\/([a-z0-9]+)\.png$/.exec(p))&&THEMES.has(m[1]))return file(res,path.join(uiDir,'logos'),m[1]+'.png',req,{cache:true});
  if(req.method==='GET'&&(m=/^\/lib\/([\w.-]+\.js)$/.exec(p))&&LIB.has(m[1]))return file(res,libDir,m[1],req,{cache:url.searchParams.get('v')===version});
  if(req.method==='POST'){
   // A request from another site can't set this header without the browser asking first, and the
   // remote never answers that question: a web page elsewhere can't press buttons here.
   if(req.headers['x-tyler-remote']!=='1')return send(res,403,{error:'Use the remote page.'});
   if(p==='/pair'){
    let b;try{b=await body(req);}catch(e){return send(res,400,{error:e.message});}
    if(!code||Date.now()>codeUntil)return send(res,403,{error:'This code has expired. Show a new one in Tyler\'s Settings on your PC.'});
    if(String(b.code||'').replace(/\D/g,'')!==code){tries++;if(tries>=MAX_TRIES){code=null;log('Phone remote','pairing code used up after '+tries+' wrong tries');}return send(res,403,{error:code?'That code isn\'t right.':'Too many wrong codes. Show a new one in Tyler\'s Settings.'});}
    const {devices}=await readConfig(),id=crypto.randomBytes(8).toString('hex'),key=crypto.randomBytes(32).toString('base64url');
    await writeDevices([...devices,{id,hash:hash(key).toString('hex'),name:deviceName(req.headers['user-agent']),created:Date.now(),seen:Date.now()}]);
    code=null;log('Phone remote','paired '+deviceName(req.headers['user-agent']));
    return send(res,200,{ok:true},'application/json; charset=utf-8',{'set-cookie':COOKIE+'='+id+'.'+key+'; Path=/; HttpOnly; SameSite=Strict; Max-Age=31536000'});
   }
   const d=await device(req);if(!d)return send(res,401,{error:'Pair this phone first.',pair:true});
   if(p==='/forget'){const {devices}=await readConfig();await writeDevices(devices.filter(x=>x.id!==d.id));dropStreams(d.id);return send(res,200,{ok:true},'application/json; charset=utf-8',{'set-cookie':COOKIE+'=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0'});}
   if(p==='/action'){
    let b;try{b=await body(req);}catch(e){return send(res,400,{error:e.message});}
    const action=String(b.action||'');if(!Object.hasOwn(ACTIONS,action))return send(res,400,{error:'Unknown action.'});
    if(limited())return send(res,429,{error:'Slow down a little.'});
    const args=ACTIONS[action](b);
    try{const r=await run(action,args);log('Phone remote',action);return send(res,200,{ok:true,...r});}catch(e){return send(res,409,{error:String(e.message||e).slice(0,200)});}
   }
  }
  if(req.method==='GET'&&p==='/state'){
   const d=await device(req);if(!d)return send(res,401,{error:'Pair this phone first.',pair:true});
   // A watching phone also renews the Steam window's lease here (it starts over if Steam chat reloads).
   if(streams.size)void ask('watch',{on:true}).catch(()=>{});
   return send(res,200,{...await snapshot(),device:d.name});
  }
  if(req.method==='GET'&&p==='/events'){
   const d=await device(req);if(!d)return send(res,401,{error:'Pair this phone first.',pair:true});
   if(streams.size>=MAX_STREAMS)return send(res,503,{error:'Too many phones are watching.'});
   return openStream(req,res,d);
  }
  if(req.method==='GET'&&p==='/whoami'){const d=await device(req);return send(res,200,{paired:!!d,version,theme:await theme()});}
  send(res,404,{error:'Not found'});
 }

 function listen(want){return new Promise((resolve,reject)=>{
  const s=http.createServer((req,res)=>{route(req,res).catch(e=>{try{send(res,500,{error:'Something went wrong.'});}catch{}log('Phone remote error',e.message);});});
  s.headersTimeout=10000;s.requestTimeout=15000;s.keepAliveTimeout=5000;
  s.once('error',reject);s.listen(want,'0.0.0.0',()=>{s.off('error',reject);resolve(s);});
 });}
 async function start(){
  if(server)return;if(starting)return starting;
  starting=(async()=>{const cfg=await readConfig();let lastError;
   for(let p=cfg.port;p<cfg.port+10;p++){try{server=await listen(p);port=p;break;}catch(e){lastError=e;if(e.code!=='EADDRINUSE')break;}}
   if(!server)throw Error('The phone remote couldn\'t start: '+(lastError?.code||lastError?.message||'no free port'));
   if(port!==cfg.port)await vault.set({remoteControl:{on:true,port}});log('Phone remote','on, port '+port);
  })().finally(()=>{starting=null;});
  return starting;
 }
 async function stop(){if(!server)return;dropStreams();const s=server;server=null;code=null;await new Promise(r=>s.close(()=>r()));s.closeAllConnections?.();log('Phone remote','off');}
 async function status(){
  const cfg=await readConfig(),addresses=lanAddresses();if(cfg.on&&!server)await start().catch(()=>{});
  const qr=code&&Date.now()<codeUntil&&addresses[0]?matrix('http://'+addresses[0].address+':'+port+'/?code='+code):null;
  return {on:cfg.on&&!!server,port:port||cfg.port,addresses:addresses.map(a=>a.address),code:code&&Date.now()<codeUntil?code:null,codeUntil:code?codeUntil:0,qr,
   devices:cfg.devices.map(d=>({id:d.id,name:d.name,created:d.created,seen:seen.get(d.id)||d.seen||d.created}))};
 }
 // The settings page draws the QR code from this grid (one string per row, "1" for a dark module).
 function matrix(text){try{const qrcode=require('./vendor/qrcode-generator.js'),q=qrcode(0,'M');q.addData(text);q.make();const n=q.getModuleCount(),rows=[];for(let r=0;r<n;r++){let row='';for(let c=0;c<n;c++)row+=q.isDark(r,c)?'1':'0';rows.push(row);}return rows;}catch{return null;}}
 async function handle(op,request={}){
  if(op==='status')return status();
  if(op==='enable'){await vault.set({remoteControl:{on:true,port:(await readConfig()).port}});await start();newCode();return status();}
  if(op==='disable'){await vault.set({remoteControl:{on:false,port:(await readConfig()).port}});await stop();return status();}
  if(op==='new-code'){if(!server)throw Error('Turn the phone remote on first.');newCode();return status();}
  if(op==='forget'){const id=String(request.id||''),{devices}=await readConfig();await writeDevices(devices.filter(d=>d.id!==id));dropStreams(id);return status();}
  if(op==='forget-all'){await writeDevices([]);dropStreams();return status();}
  throw Error('Unknown remote request.');
 }
 // At launch: back on if it was on (no code until you ask for one in Settings).
 void readConfig().then(cfg=>{if(cfg.on)return start();}).catch(e=>log('Phone remote',e.message));
 return {handle,stop,status,push,get port(){return port;},get watching(){return streams.size;}};
}
module.exports={setupRemote,privateAddress,hostAllowed,lanAddresses,deviceName};

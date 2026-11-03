// MAIN world, document_start (v2.19): keeps the bot in a Steam group voice call when someone leaves.
//
// Steam's voice server gives every other person in the call their own audio section (m1, m2…)
// with their own SSRC, and marks it inactive when they leave. When the bot joins, Steam's answer
// has only section 0, so the audio of anyone already talking first arrives tagged with MID "0".
// Chromium remembers that tag and keeps routing the person's SSRC to section 0 even after Steam
// lists it in their own section; when they leave, re-registering their section collides
// ("Failed to set up audio demuxing for mid='m1'"), Chromium rejects Steam's offer and every later
// one, and Steam ends the call. Seen live in Chrome 156 / Electron 45 (Chromium 156) and
// reproduced locally against Steam's real descriptions (tools/electron-voice-test/README.md).
//
// Before each description from Steam's server reaches the browser this:
//  1. removes the MID header extension (a=extmap … sdes:mid), so audio is routed by the SSRCs Steam
//     lists, never by a remembered tag (Chrome sends MID only on a stream's first packets anyway,
//     so Steam's server already routes the bot's own audio by SSRC);
//  2. replays how Chromium updates its routing section by section and drops SSRC lines that would
//     collide with another section's listed SSRC, keeping each stream's msid.
// Nothing else in the description changes; any problem here falls back to Steam's original.
(() => {
 'use strict';
 if(window!==window.top||location.hostname!=='steamcommunity.com')return;
 const MARK=Symbol.for('tyler.steam-voice-fix');if(window[MARK])return;
 const Native=window.RTCPeerConnection,proto=typeof Native==='function'&&Native.prototype;
 if(!proto||typeof proto.setRemoteDescription!=='function')return;
 Object.defineProperty(window,MARK,{value:true});
 const MID_EXT=/^a=extmap:\d+(?:\/\w+)? urn:ietf:params:rtp-hdrext:sdes:mid\s*$/;
 function parse(sdp){
  const eol=sdp.indexOf('\r\n')>=0?'\r\n':'\n',head=[],secs=[];let cur=null;
  for(const line of sdp.split(/\r?\n/)){
   if(line.startsWith('m=')){cur={lines:[line],mid:null,port:Number(line.split(' ')[1]),ssrcs:new Set()};secs.push(cur);}
   else if(cur){cur.lines.push(line);if(line.startsWith('a=mid:'))cur.mid=line.slice(6).trim();const s=/^a=ssrc:(\d+)/.exec(line);if(s)cur.ssrcs.add(s[1]);}
   else head.push(line);
  }
  const group=new Map();
  head.forEach((line,i)=>{if(line.startsWith('a=group:BUNDLE '))for(const mid of line.slice(15).trim().split(/\s+/))group.set(mid,'g'+i);});
  for(const s of secs)s.group=s.mid!=null&&group.has(s.mid)?group.get(s.mid):'own:'+s.mid;
  return {eol,head,secs};
 }
 const text=p=>[...p.head,...p.secs.flatMap(s=>s.lines)].join(p.eol);
 // Drops the given SSRCs' lines from a section, keeping the stream identity (msid) they carried.
 function strip(sec,ssrcs){
  const drop=new Set(ssrcs),msid=[],legacy={};
  sec.lines=sec.lines.filter(line=>{
   const s=/^a=ssrc:(\d+) ([^:\s]+)(?::(.*))?$/.exec(line);
   if(s&&drop.has(s[1])){if(s[2]==='msid'&&s[3])msid.push(s[3].trim());else if(s[2]==='mslabel'||s[2]==='label')(legacy[s[1]]=legacy[s[1]]||{})[s[2]]=(s[3]||'').trim();return false;}
   const g=/^a=ssrc-group:\S+ (.*)$/.exec(line);return !(g&&g[1].trim().split(/\s+/).some(x=>drop.has(x)));
  });
  for(const k of Object.keys(legacy))if(legacy[k].mslabel&&legacy[k].label)msid.push(legacy[k].mslabel+' '+legacy[k].label);
  for(const x of ssrcs)sec.ssrcs.delete(x);
  if(!sec.lines.some(l=>l.startsWith('a=ssrc:'))&&!sec.lines.some(l=>l.startsWith('a=msid:'))&&msid.length){const at=sec.lines.findIndex(l=>l.startsWith('a=mid:'));sec.lines.splice(at>=0?at+1:1,0,'a=msid:'+msid[0]);}
 }
 function repair(sdp,before){
  const next=parse(sdp),old=before?parse(before):null;let changed=0;
  next.head=next.head.filter(l=>!(MID_EXT.test(l)&&++changed));
  for(const s of next.secs)s.lines=s.lines.filter(l=>!(MID_EXT.test(l)&&++changed));
  const groupOf=new Map(next.secs.map(s=>[s.mid,s.group])),route=new Map(),key=(g,x)=>g+'|'+x;
  if(old)for(const s of old.secs)if(s.port!==0&&s.mid!=null)for(const x of s.ssrcs)route.set(key(groupOf.get(s.mid)||s.group,x),s.mid);
  for(const s of next.secs){
   if(s.mid==null)continue;
   for(const [k,mid] of route)if(mid===s.mid)route.delete(k);
   if(s.port===0)continue;
   const clash=[];
   for(const x of s.ssrcs){const k=key(s.group,x),owner=route.get(k);if(owner!=null&&owner!==s.mid)clash.push(x);else route.set(k,s.mid);}
   if(clash.length){strip(s,clash);changed++;}
  }
  return changed?text(next):sdp;
 }
 const native=proto.setRemoteDescription;
 proto.setRemoteDescription=function(desc,...rest){
  let use=desc;
  if(desc&&typeof desc.sdp==='string'&&/^(offer|answer|pranswer)$/.test(desc.type||'')&&this.signalingState!=='closed'){
   try{const sdp=repair(desc.sdp,this.remoteDescription&&this.remoteDescription.sdp);if(sdp!==desc.sdp)use=new RTCSessionDescription({type:desc.type,sdp});}catch{use=desc;}
  }
  return native.call(this,use,...rest);
 };
})();

#!/usr/bin/env node
// Stand-in for RoboticTylerAudio.exe in tests (no Windows audio). Speaks the same command-line
// and pipe protocol. FAKE_HELPER_LOG gets one JSON line per event.
import fs from 'node:fs';
const [cmd,...args]=process.argv.slice(2),log=e=>{if(process.env.FAKE_HELPER_LOG)fs.appendFileSync(process.env.FAKE_HELPER_LOG,JSON.stringify({cmd,...e})+'\n');};
if(cmd==='devices'){console.log('output\tQ0FCTEU=\tCABLE Input (VB-Audio Virtual Cable)\noutput\tSEVBRA==\tHeadphones\nNOTICE\tx');process.exit(0);}
if(cmd==='play'){log({file:args[0],device:args[1],bytes:fs.statSync(args[0]).size});setTimeout(()=>process.exit(0),Number(process.env.FAKE_PLAY_MS||50));}
if(cmd==='capture'){
 if(args[0]==='R09ORQ=='){console.error('The selected audio device is disconnected.');process.exit(3);}
 log({device:args[0]});let n=0;const loud=Number(process.env.FAKE_LOUD_FRAMES||0);
 const t=setInterval(()=>{const f=Buffer.alloc(1280);if(n<loud)for(let i=0;i<640;i++)f.writeInt16LE(Math.round(Math.sin(i/3)*12000),i*2);n++;process.stdout.write(f);
  if(process.env.FAKE_LOSE_AFTER&&n>=Number(process.env.FAKE_LOSE_AFTER)){console.error('device invalidated');process.exit(3);}},10);
 process.stdin.on('end',()=>{clearInterval(t);log({stopped:true});process.exit(0);});process.stdin.resume();
}
if(cmd==='stream'){log({device:args[0]});let buf=Buffer.alloc(0),audio=0;
 process.stdin.on('data',d=>{buf=Buffer.concat([buf,d]);while(buf.length>=5){const len=buf.readInt32LE(1);if(buf.length<5+len)break;const type=buf[0];buf=buf.subarray(5+len);
  if(type===1){audio+=len;if(audio===len)console.log('PLAYING');log({audio:len});}if(type===2){log({flush:true});audio=0;console.log('IDLE');}if(type===3){log({end:true});process.exit(0);}}});
 process.stdin.on('end',()=>process.exit(0));
}
if(cmd==='unprotect'){let s='';process.stdin.on('data',d=>s+=d);process.stdin.on('end',()=>{process.stdout.write(Buffer.from(Buffer.from(s.trim(),'base64').toString('latin1').replace('protected:',''),'latin1').toString('base64'));});}

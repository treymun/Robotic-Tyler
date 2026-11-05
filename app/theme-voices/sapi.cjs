'use strict';
// ROBOTIC TYLER theme voices: the original Windows voices, when this PC has them (v2.35).
//
// Microsoft Sam (Windows XP) and Microsoft Mary are SAPI 5 voices. Windows 10 and 11 don't include
// them, but a PC that has them installed (for example from Microsoft's Speech SDK 5.1, which adds
// them as 32-bit voices) can speak with the real thing, which is closer than any clone. This asks
// Windows' own speech API (through the 32-bit and 64-bit PowerShell that Windows includes) which
// voices exist and renders text to a WAV file. The text goes in on stdin, never on a command line.
const {execFile}=require('node:child_process'),fs=require('node:fs'),path=require('node:path');
const sys=process.env.SystemRoot||'C:\\Windows';
const SHELLS=[path.join(sys,'SysWOW64','WindowsPowerShell','v1.0','powershell.exe'),path.join(sys,'System32','WindowsPowerShell','v1.0','powershell.exe')];
const LIST='$ErrorActionPreference="Stop";$v=New-Object -ComObject SAPI.SpVoice;foreach($t in $v.GetVoices()){$t.GetDescription()}';
// Format 22 = 22 kHz 16-bit mono (SAPI's SAFT22kHz16BitMono); mode 3 = create the file.
const SPEAK='$ErrorActionPreference="Stop";$text=[Console]::In.ReadToEnd();$want=$env:TYLER_SAPI_VOICE;$out=$env:TYLER_SAPI_OUT;'+
 '$v=New-Object -ComObject SAPI.SpVoice;$pick=$null;foreach($t in $v.GetVoices()){if($t.GetDescription() -eq $want){$pick=$t}};if(-not $pick){throw "voice not found"};$v.Voice=$pick;'+
 '$f=New-Object -ComObject SAPI.SpAudioFormat;$f.Type=22;$s=New-Object -ComObject SAPI.SpFileStream;$s.Format=$f;$s.Open($out,3,$false);$v.AudioOutputStream=$s;[void]$v.Speak($text,0);$s.Close()';
const run=(shell,script,{input='',env={},timeout=30000}={})=>new Promise((resolve,reject)=>{
 const c=execFile(shell,['-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-Command',script],{windowsHide:true,timeout,env:{...process.env,...env},maxBuffer:1_000_000},(e,out,err)=>e?reject(Error(String(err||e.message).trim().split(/\r?\n/).pop())):resolve(String(out)));
 c.stdin.end(input);
});
let cache=null;
/** {name → the PowerShell that has it} for every SAPI voice on this PC (Windows only). */
async function voices(){
 if(process.platform!=='win32')return {};
 if(cache&&Date.now()-cache.at<5*60000)return cache.map;
 const map={};
 for(const shell of SHELLS){if(!fs.existsSync(shell))continue;try{for(const name of (await run(shell,LIST,{timeout:15000})).split(/\r?\n/).map(s=>s.trim()).filter(Boolean))if(!map[name])map[name]=shell;}catch{}}
 cache={at:Date.now(),map};return map;
}
async function find(name){const all=await voices();const key=Object.keys(all).find(n=>n.toLowerCase()===String(name).toLowerCase())||Object.keys(all).find(n=>n.toLowerCase().startsWith(String(name).toLowerCase()));return key?{name:key,shell:all[key]}:null;}
/** Renders text with a SAPI voice to `out` (WAV). */
async function speak(name,text,out){
 const v=await find(name);if(!v)throw Error(name+' isn’t installed on this PC.');
 fs.mkdirSync(path.dirname(out),{recursive:true});const tmp=out+'.sapi.wav';
 await run(v.shell,SPEAK,{input:String(text).slice(0,2000),env:{TYLER_SAPI_VOICE:v.name,TYLER_SAPI_OUT:tmp},timeout:60000});
 if(!fs.existsSync(tmp)||fs.statSync(tmp).size<100)throw Error('Windows made no audio with '+v.name+'.');
 fs.renameSync(tmp,out);return {voice:v.name,file:out};
}
module.exports={voices,find,speak};

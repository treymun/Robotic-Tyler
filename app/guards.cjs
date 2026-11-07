'use strict';
const {fileURLToPath}=require('node:url'),path=require('node:path');
function isChat(value){try{const u=new URL(value);return u.protocol==='https:'&&u.hostname==='steamcommunity.com'&&(u.pathname==='/chat'||u.pathname.startsWith('/chat/'));}catch{return false;}}
function isSteam(value){try{const u=new URL(value);return u.protocol==='https:'&&(u.hostname==='steamcommunity.com'||u.hostname.endsWith('.steamcommunity.com')||u.hostname==='steampowered.com'||u.hostname.endsWith('.steampowered.com'));}catch{return false;}}
function isLocal(value,file){try{return path.resolve(fileURLToPath(value))===path.resolve(file);}catch{return false;}}
const settingsKeys=new Set(['imageGen','veniceKey','quickSetup','personality','length','brain','geminiTextModel','themeStats','tylerLifetime','noiseLevel','roastMode','speechVoice','talkativeness','insideJokes','callbackGap','nicknameAliases','aiProvider','geminiKey','openrouterKey','speechKey','usage','settingsDraft','textSpeed','spendingCapUSD','streamAI','friendMemory','voiceBargeIn','voiceBargeDelay','smartRouting','voiceThreshold','minVoiced','replyPause','libraryAllowedIds','activityEnabled','activitySteamIds','v22Profile','v22TurnMode','v22SpeakerConsent','v22VoiceRecovery','v22EmergencyStop','v22Latency',
 // v2.3 options and squad toggles written by the shared settings page (previously dropped on desktop).
 'suiteOptions','v23ScreenConsent','v23AutoRoast','v23RoastEnabled','v23CommandsEnabled','v23ScreenRoast','v23Persona','v23VisionModel','v23Commands','uiTheme',
 // v2.15 voice page: engine choice, Standard and Live voices, devices and listening consent.
 'fastSpeech','keyboardFilter','voiceControls','voiceEngine',
 // v2.36 speaking voice for Standard voice replies: 'cloud' (default), 'theme' (the local theme voice)
 // or, from v2.39, 'kokoro' (the voice on this PC) with its voice; and how Standard voice hears: 'cloud' or 'local'.
 'speechEngine','kokoroVoice','voiceHearing','geminiVoice','geminiTtsModel','liveModel','liveVoice','liveInterrupt','liveSilenceMs','liveStartSensitivity','liveEndSensitivity','voiceOutputDevice','voiceListenDevice','voiceListenConsent','voiceImport',
 // v2.19 where desktop voice runs: 'window' (the Steam chat window, default) or 'cable' (VB-CABLE helper).
 'desktopVoice','desktopMuteCall',
 // v2.16 name tag in chat messages (plain text, validated by chat-tag.js).
 'chatTagEnabled','chatTagName',
 // v2.39.1 the owner's opt-in "Explicit adult content on this PC" (replies from the AI on this PC only).
 'localExplicit',
 // v2.44 "Tell the AI who's speaking in voice" (true/false; on unless saved false).
 'voiceSpeakers',
 // v2.45 "Show a memory meter in Tyler's panel" (desktop app; true/false, off unless saved true).
 'memoryMeter']);
function sanitizeSettings(values){if(!values||typeof values!=='object'||Array.isArray(values))throw Error('Invalid settings');const result={};for(const [key,value]of Object.entries(values)){if(!settingsKeys.has(key))continue;if(JSON.stringify(value)?.length>20000)throw Error('Settings value is too large');if(key==='quickSetup'){result[key]=quickSetup(value);continue;}if(key==='speechEngine'){result[key]=['theme','kokoro'].includes(value)?value:'cloud';continue;}if(key==='voiceHearing'){result[key]=value==='local'?'local':'cloud';continue;}if(key==='kokoroVoice'){result[key]=typeof value==='string'&&/^[a-z]{2}_[a-z]{2,16}$/.test(value)?value:'am_michael';continue;}if(key==='aiProvider'){result[key]=['gemini','local'].includes(value)?value:'openrouter';continue;}if(key==='voiceSpeakers'){result[key]=value!==false;continue;}if(key==='memoryMeter'){result[key]=value===true;continue;}if(key==='imageGen'){result[key]=imageGen(value);continue;}if(key==='veniceKey'){if(typeof value!=='string'||!/^[A-Za-z0-9_\-.]{16,200}$/.test(value))throw Error('Invalid Venice key');result[key]=value;continue;}result[key]=value;}return result;}
// v2.34: chat image settings, through the same checks the extension uses (image-core.js).
function imageGen(v){let I=globalThis.TylerImages;if(!I){try{require('./companion/image-core.js');}catch{require('../browser-extension/image-core.js');}I=globalThis.TylerImages;}return I.config(v);}
// v2.33: Connect & start's saved choices, as the settings window may write them (shape checked).
function quickSetup(v){if(!v||typeof v!=='object'||Array.isArray(v))throw Error('Invalid setup settings');const out={};if(typeof v.botName==='string')out.botName=v.botName.slice(0,80);if(['auto','text','voice'].includes(v.mode))out.mode=v.mode;if(['text','voice-room'].includes(v.chatKind))out.chatKind=v.chatKind;if(Array.isArray(v.notices))out.notices=v.notices.filter(n=>typeof n==='string'&&n.length<=160&&n.startsWith('chat:')).slice(-30);if(typeof v.noticeAlways==='boolean')out.noticeAlways=v.noticeAlways;return out;}
// v2.41: Settings from the paired phone (app/remote.cjs). A fixed list, decided key by key; a key added
// to settingsKeys above is off the phone until it is listed here (tests/phone-settings.test.mjs checks
// that every key has a place).
// Keys and secrets: the phone only learns whether one is saved (true/false; speechKey not even that),
// and can never set or remove one. They are added, changed and removed on the PC.
const secretKeys=new Set(['openrouterKey','geminiKey','veniceKey','speechKey']);
// What the phone may change: the same values the PC's Settings page writes, through sanitizeSettings.
const phoneWritable=new Set(['imageGen','quickSetup','personality','length','brain','geminiTextModel','themeStats','noiseLevel','roastMode','speechVoice','talkativeness','insideJokes','callbackGap','nicknameAliases','aiProvider','textSpeed','spendingCapUSD','streamAI','friendMemory','voiceBargeIn','voiceBargeDelay','smartRouting','voiceThreshold','minVoiced','replyPause','libraryAllowedIds','activityEnabled','activitySteamIds','v22Profile','v22TurnMode','v22SpeakerConsent','v22VoiceRecovery','v22EmergencyStop',
 'suiteOptions','v23ScreenConsent','v23AutoRoast','v23RoastEnabled','v23CommandsEnabled','v23ScreenRoast','v23Persona','v23VisionModel','v23Commands','uiTheme','fastSpeech','keyboardFilter','voiceControls','voiceEngine',
 'speechEngine','kokoroVoice','voiceHearing','geminiVoice','geminiTtsModel','liveModel','liveVoice','liveInterrupt','liveSilenceMs','liveStartSensitivity','liveEndSensitivity','voiceListenConsent','desktopVoice','desktopMuteCall','chatTagEnabled','chatTagName','localExplicit','voiceSpeakers','memoryMeter']);
// Shown on the phone, changed only on the PC or by Tyler himself: the usage counts (the spending cap
// counts them), the voice latency samples, and the Windows audio devices (the PC lists them).
const phoneReadOnly=new Set(['usage','v22Latency','voiceOutputDevice','voiceListenDevice']);
// Not for the phone: each window keeps its own unsaved edits (settingsDraft), the Voice Studio import
// marker, and the theme stats themselves (the phone may only reset them, as Settings → Theme does).
const phoneHidden=new Set(['settingsDraft','voiceImport','tylerLifetime']);
const phoneRemovable=new Set(['tylerLifetime']);
const phoneReadable=key=>phoneWritable.has(key)||phoneReadOnly.has(key);
module.exports={isChat,isSteam,isLocal,settingsKeys,sanitizeSettings,secretKeys,phoneWritable,phoneReadOnly,phoneHidden,phoneRemovable,phoneReadable};

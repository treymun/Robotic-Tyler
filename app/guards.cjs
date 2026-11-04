'use strict';
const {fileURLToPath}=require('node:url'),path=require('node:path');
function isChat(value){try{const u=new URL(value);return u.protocol==='https:'&&u.hostname==='steamcommunity.com'&&(u.pathname==='/chat'||u.pathname.startsWith('/chat/'));}catch{return false;}}
function isSteam(value){try{const u=new URL(value);return u.protocol==='https:'&&(u.hostname==='steamcommunity.com'||u.hostname.endsWith('.steamcommunity.com')||u.hostname==='steampowered.com'||u.hostname.endsWith('.steampowered.com'));}catch{return false;}}
function isLocal(value,file){try{return path.resolve(fileURLToPath(value))===path.resolve(file);}catch{return false;}}
const settingsKeys=new Set(['personality','length','brain','geminiTextModel','themeStats','tylerLifetime','noiseLevel','roastMode','speechVoice','talkativeness','insideJokes','callbackGap','nicknameAliases','aiProvider','geminiKey','openrouterKey','speechKey','usage','settingsDraft','textSpeed','spendingCapUSD','streamAI','friendMemory','voiceBargeIn','voiceBargeDelay','smartRouting','voiceThreshold','minVoiced','replyPause','libraryAllowedIds','activityEnabled','activitySteamIds','v22Profile','v22TurnMode','v22SpeakerConsent','v22VoiceRecovery','v22EmergencyStop','v22Latency',
 // v2.3 options and squad toggles written by the shared settings page (previously dropped on desktop).
 'suiteOptions','v23ScreenConsent','v23AutoRoast','v23RoastEnabled','v23CommandsEnabled','v23ScreenRoast','v23Persona','v23VisionModel','v23Commands','uiTheme',
 // v2.15 voice page: engine choice, Standard and Live voices, devices and listening consent.
 'fastSpeech','keyboardFilter','voiceControls','voiceEngine','geminiVoice','geminiTtsModel','liveModel','liveVoice','liveInterrupt','liveSilenceMs','liveStartSensitivity','liveEndSensitivity','voiceOutputDevice','voiceListenDevice','voiceListenConsent','voiceImport',
 // v2.19 where desktop voice runs: 'window' (the Steam chat window, default) or 'cable' (VB-CABLE helper).
 'desktopVoice',
 // v2.16 name tag in chat messages (plain text, validated by chat-tag.js).
 'chatTagEnabled','chatTagName']);
function sanitizeSettings(values){if(!values||typeof values!=='object'||Array.isArray(values))throw Error('Invalid settings');const result={};for(const [key,value]of Object.entries(values)){if(!settingsKeys.has(key))continue;if(JSON.stringify(value)?.length>20000)throw Error('Settings value is too large');result[key]=value;}return result;}
module.exports={isChat,isSteam,isLocal,settingsKeys,sanitizeSettings};

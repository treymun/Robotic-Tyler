// Content scripts may access only these non-secret settings through the worker.
export const readable = new Set(['usage','spendingCapUSD','tylerLifetime','themeStats','musicQuality','musicDuck','activityEnabled','tylerArcadeStats','v22TurnMode','v22VoiceRecovery','v22SpeakerConsent','v22EmergencyStop','v22Latency','uiTheme','chatTagEnabled','chatTagName','panelLayout','keepAlive','voiceRooms','voiceMix','soundboardChatEnabled','memoryMeter']);
const writable = new Set(['tylerArcadeStats','v22Latency','tylerLifetime','musicQuality','musicDuck','panelLayout','keepAlive','voiceRooms','voiceMix','soundboardChatEnabled']);
// v2.33: the newer keys are checked for shape (the remembered voice channel per group, the master
// volume and monitor, the soundboard's chat switch).
const SHAPES={voiceRooms:v=>!!v&&typeof v==='object'&&!Array.isArray(v)&&Object.keys(v).length<=50&&Object.entries(v).every(([g,r])=>/^\d{1,20}$/.test(g)&&/^\d{1,20}$/.test(String(r))),
 voiceMix:v=>!!v&&typeof v==='object'&&Number.isFinite(v.volume)&&v.volume>=0&&v.volume<=.7&&typeof v.monitor==='boolean'&&Object.keys(v).length===2,soundboardChatEnabled:v=>typeof v==='boolean'};
export async function contentStorage(store, message) {
 const {action,keys,values}=message;
 if(action==='get') {
  const list=typeof keys==='string'?[keys]:keys;
  if(!Array.isArray(list)||!list.every(k=>readable.has(k)))throw Error('Storage keys not allowed');
  return {values:await store.get(list)};
 }
 if(action==='set') {
  if(!values||typeof values!=='object'||Array.isArray(values)||!Object.keys(values).every(k=>writable.has(k)))throw Error('Storage keys not allowed');
  for(const [k,v] of Object.entries(values))if(SHAPES[k]&&!SHAPES[k](v))throw Error('Storage value not allowed for '+k);
  await store.set(values);return {};
 }
 if(action==='remove') {
  const list=typeof keys==='string'?[keys]:keys;
  if(!Array.isArray(list)||!list.every(k=>writable.has(k)))throw Error('Storage keys not allowed');
  await store.remove(list);return {};
 }
 throw Error('Storage action not allowed');
}

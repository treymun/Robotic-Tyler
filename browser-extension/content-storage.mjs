// Content scripts may access only these non-secret settings through the worker.
export const readable = new Set(['usage','spendingCapUSD','tylerLifetime','themeStats','activityEnabled','tylerArcadeStats','v22TurnMode','v22VoiceRecovery','v22SpeakerConsent','v22EmergencyStop','v22Latency','uiTheme','chatTagEnabled','chatTagName']);
const writable = new Set(['tylerArcadeStats','v22Latency','tylerLifetime']);
export async function contentStorage(store, message) {
 const {action,keys,values}=message;
 if(action==='get') {
  const list=typeof keys==='string'?[keys]:keys;
  if(!Array.isArray(list)||!list.every(k=>readable.has(k)))throw Error('Storage keys not allowed');
  return {values:await store.get(list)};
 }
 if(action==='set') {
  if(!values||typeof values!=='object'||Array.isArray(values)||!Object.keys(values).every(k=>writable.has(k)))throw Error('Storage keys not allowed');
  await store.set(values);return {};
 }
 if(action==='remove') {
  const list=typeof keys==='string'?[keys]:keys;
  if(!Array.isArray(list)||!list.every(k=>writable.has(k)))throw Error('Storage keys not allowed');
  await store.remove(list);return {};
 }
 throw Error('Storage action not allowed');
}

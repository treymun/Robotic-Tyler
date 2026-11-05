
'use strict';
const $=id=>document.getElementById(id);
let noiseChanged=false;
const fields=['aiProvider','personality','length','brain','geminiTextModel','themeStats','roastMode','talkativeness','insideJokes','callbackGap','nicknameAliases','textSpeed','spendingCapUSD','streamAI','friendMemory','smartRouting','libraryAllowedIds','activityEnabled','activitySteamIds','voiceEngine','geminiVoice','geminiTtsModel','liveModel','liveVoice','liveInterrupt','liveSilenceMs','liveStartSensitivity','liveEndSensitivity','speechVoice','noiseLevel','fastSpeech','speechEngine','desktopVoice','desktopMuteCall','voiceOutputDevice','voiceListenDevice','voiceListenConsent','chatTagEnabled','chatTagName'];
const sliderIds=['humorLevel','edgeLevel','helpLevel','chaosLevel'];
const sliderLabels={humorLevel:['Dry','Light','High','Unhinged'],edgeLevel:['Soft','Spicy','Rowdy','Savage'],helpLevel:['Low','Balanced','Helpful','Coach mode'],chaosLevel:['Controlled','Loose','Chaotic','Gremlin']};
const presetMap={
  rowdy:{roastMode:'rowdy',length:'short',talkativeness:'active',textSpeed:'balanced',personality:'A witty gaming homie who throws playful profanity, talks like a real friend, keeps replies tight unless someone genuinely needs more detail, and never acts robotic.'},
  coach:{roastMode:'custom',length:'normal',talkativeness:'occasional',textSpeed:'balanced',personality:'A sharp but encouraging gaming coach who explains things clearly, points out mistakes without sounding lame, and mixes practical advice with light trash talk.'},
  chaos:{roastMode:'savage',length:'short',talkativeness:'active',textSpeed:'balanced',personality:'A chaotic party goblin who reacts fast, jokes hard, loves absurd one-liners, and keeps the room lively without derailing every conversation.'},
  chill:{roastMode:'custom',length:'normal',talkativeness:'quiet',textSpeed:'cautious',personality:'A chill, funny wingman who sounds natural, adds smooth banter, and only jumps in when it can say something actually worth hearing.'},
  nofilter:{roastMode:'unhinged',length:'short',talkativeness:'active',textSpeed:'balanced',personality:'The most unhinged friend in the squad: swears like breathing, crude jokes, savage comebacks, zero corporate polish. Still actually funny and quick, still has your back, and gives a straight answer when someone really needs one.'}
};
const suiteIds={votingEnabled:'suiteVoting',eventsEnabled:'suiteEvents',arcadeEnabled:'suiteArcade',friendProfilesEnabled:'suiteProfiles',coachingEnabled:'suiteCoaching',hudEnabled:'suiteHud',awarenessEnabled:'suiteAwareness',directorEnabled:'suiteDirector',partyEnabled:'suiteParty',adaptiveEnabled:'suiteAdaptive',nudgesEnabled:'suiteNudges'};
function readSuite(){return Object.fromEntries(Object.entries(suiteIds).map(([k,id])=>[k,document.getElementById(id).checked]));}
function storage(){return window.tylerSettings.storage.local;}
function openSteam(){window.tylerSettings.tabs.create();}
async function verifyOpenRouterKey(key){return window.tylerSettings.verifyKey(key);}
function getFieldValue(key){const el=$(key);if(el.type==='checkbox')return el.checked;if(key==='liveInterrupt')return el.value!=='false';if(key==='liveSilenceMs')return Number(el.value)||700;return el.value;}
function setFieldValue(key,value){const el=$(key);if(el.type==='checkbox')el.checked=!!value;else el.value=String(value);}
function usageSummary(usage={}){
  const requests=Number(usage.requests||0);
  const tokens=(Number(usage.promptTokens||0)+Number(usage.completionTokens||0)).toLocaleString();
  const cost='$'+Number(usage.reportedCostUSD||0).toFixed(4);
  const speech=Number(usage.speechResponses||0);
  $('sumRequests').textContent=requests.toLocaleString();
  $('sumTokens').textContent=tokens;
  $('sumCost').textContent=cost;
  $('sumSpeech').textContent=speech.toLocaleString();
  $('usage').textContent=JSON.stringify(usage,null,2);
  $('usageSummary').textContent='Model requests: '+requests+' · Tokens: '+tokens+' · Reported text cost: '+cost+' · Spoken replies: '+speech+' (speech/STT provider charges excluded)';
}
function sliderLabel(id){
  const value=Number($(id).value||0),set=sliderLabels[id],index=Math.min(set.length-1,Math.floor(value/25));
  $(id+'Label').textContent=set[index];
}
function composePersonality(){
  const humor=Number($('humorLevel').value),edge=Number($('edgeLevel').value),help=Number($('helpLevel').value),chaos=Number($('chaosLevel').value);
  const lines=[];
  lines.push('Sound like a real gaming friend, not a corporate assistant.');
  lines.push(humor>70?'Use strong humor and punchy one-liners when natural.':humor>45?'Be witty and funny without forcing a joke every message.':'Keep humor light and selective.');
  lines.push(edge>75?'Use heavy profanity and sharp roasts when it fits, but avoid identity-based slurs and graphic sexual detail.':edge>45?'Use playful profanity and rowdy banter when it fits.':'Keep profanity limited and more relaxed.');
  lines.push(help>70?'When someone asks for help, switch into a clear, practical, coach-like mode.':help>45?'Balance banter with helpful answers when needed.':'Prioritize quick banter over long explanations unless explicitly asked.');
  lines.push(chaos>70?'Let replies feel unpredictable, energetic, and slightly unhinged in a funny way.':chaos>45?'Allow some absurdity and playful derailment, but stay on topic enough to feel smart.':'Stay focused and controlled.');
  lines.push('Respect boundaries, read the room, and keep replies natural and conversational.');
  $('personality').value=lines.join(' ');
}
function saveDraft(sourceKey=''){
  const values=Object.fromEntries(fields.map(k=>[k,getFieldValue(k)]));
  storage().set({settingsDraft:{at:Date.now(),values,noiseChanged:noiseChanged||sourceKey==='noiseLevel'}});
  $('status').textContent='Unfinished edits kept locally · Save settings to apply';
}
async function load(){
  const s=await storage().get([...fields,'suiteOptions','geminiKey','openrouterKey','usage','settingsDraft']);
  for(const k of fields)if(s[k]!==undefined)setFieldValue(k,s[k]);for(const [k,id] of Object.entries(suiteIds))document.getElementById(id).checked=s.suiteOptions?.[k]===true;
  if(s.settingsDraft&&Date.now()-s.settingsDraft.at<86400000){
    for(const k of fields)if(s.settingsDraft.values[k]!==undefined)setFieldValue(k,s.settingsDraft.values[k]);
    noiseChanged=!!s.settingsDraft.noiseChanged;
  }
  $('status').textContent=(s.settingsDraft?'Unfinished edits restored · ':'')+'OpenRouter key '+(s.openrouterKey?'saved':'empty')+' · Gemini key '+(s.geminiKey?'saved':'empty');
  $('easyStatus').textContent=(s.openrouterKey||s.geminiKey?'✓ AI key saved':'Step 1: add an AI key below')+' · Chrome handles Steam voice; Electron is optional.';  usageSummary(s.usage||{});
  // No saved preference: the checkbox starts on (settings.html) with ROBOTIC TYLER.
  if(!$('chatTagName').value.trim())$('chatTagName').value=TylerChatTag.DEFAULT;chatTagPreview();
  for(const id of sliderIds)sliderLabel(id);showFriendCards();
}

// Verified nickname manager: uses existing nicknameAliases setting; no automatic profiling or identity inference.
function readFriendAliases(){return String($('nicknameAliases').value||'').split('\n').map(x=>/^\s*(7656119\d{10})\s*=\s*(.{1,60})\s*$/.exec(x)).filter(Boolean).map(m=>({id:m[1],name:m[2].trim()}));}
function showFriendCards(){
 const cards=$('friendCards');cards.replaceChildren();
 const friends=readFriendAliases();
 if(!friends.length){const p=document.createElement('p');p.className='hint';p.textContent='No verified friends configured yet. Add an account ID above to create the first card.';cards.append(p);return;}
 for(const friend of friends){
  const button=document.createElement('button');button.type='button';button.className='friend-card secondary';
  const avatar=document.createElement('span');avatar.className='avatar';avatar.textContent=friend.name.slice(0,1).toUpperCase();
  const name=document.createElement('strong');name.textContent=friend.name;
  const id=document.createElement('small');id.textContent=friend.id;
  button.append(avatar,name,id);button.onclick=()=>{$('friendID').value=friend.id;$('friendNickname').value=friend.name;$('friendStatus').textContent='Selected '+friend.name+'. Edit or remove above.';};cards.append(button);
 }
}
$('friendSave').onclick=()=>{
 const id=$('friendID').value.trim(),name=$('friendNickname').value.trim();
 if(!/^7656119\d{10}$/.test(id)||!name||name.length>60){$('friendStatus').textContent='Enter a verified 17-digit Steam ID and a nickname (1–60 characters).';return;}
 const friends=readFriendAliases().filter(x=>x.id!==id);friends.push({id,name});
 $('nicknameAliases').value=friends.slice(-30).map(f=>f.id+' = '+f.name).join('\n');
 $('friendStatus').textContent='Nickname staged — click Save settings to apply.';showFriendCards();saveDraft('nicknameAliases');
};
$('friendErase').onclick=()=>{
 const id=$('friendID').value.trim();
 if(!/^7656119\d{10}$/.test(id)){$('friendStatus').textContent='Select or enter an ID to remove.';return;}
 $('nicknameAliases').value=readFriendAliases().filter(x=>x.id!==id).map(f=>f.id+' = '+f.name).join('\n');
 $('friendStatus').textContent='Nickname removed from draft — click Save settings to apply.';showFriendCards();saveDraft('nicknameAliases');
};
$('nicknameAliases').addEventListener('input',showFriendCards);


function chatTagPreview(){const enabled=$('chatTagEnabled').checked,tag=TylerChatTag.validate($('chatTagName').value);$('chatTagName').setAttribute('aria-invalid',String(enabled&&!tag.ok));$('chatTagPreview').textContent=enabled?(tag.ok?TylerChatTag.format('Anyone up for another round?',{enabled:true,name:tag.name}):tag.error):'Anyone up for another round?';}
for(const id of ['chatTagEnabled','chatTagName'])$(id).addEventListener('input',chatTagPreview);
$('noiseLevel').onchange=()=>{noiseChanged=true;saveDraft('noiseLevel');};
for(const id of sliderIds){$(id).addEventListener('input',()=>{sliderLabel(id);});}
for(const key of fields)$(key).addEventListener('input',()=>saveDraft(key));
for(const button of document.querySelectorAll('.preset'))button.onclick=()=>{
  document.querySelectorAll('.preset').forEach(x=>x.classList.toggle('active',x===button));
  const preset=presetMap[button.dataset.preset];
  if(!preset)return;
  for(const [key,value] of Object.entries(preset))setFieldValue(key,value);
  $('status').textContent='Preset loaded. Save to keep it.';
  saveDraft();
};
$('forgePrompt').onclick=()=>{composePersonality();saveDraft();$('status').textContent='Personality rebuilt from the sliders. Save if you want to keep it.';};
$('clear').onclick=async()=>{await storage().remove(['openrouterKey','geminiKey','speechKey','veniceKey']);await load();};
$('steam').onclick=()=>openSteam();
// Preview a reply and Test selected model: ai-settings.js (v2.20), with the real model and routing.
$('save').onclick=async()=>{
  $('save').disabled=true;
  try{
    const s=Object.fromEntries(fields.map(k=>[k,getFieldValue(k)]));s.suiteOptions=readSuite();
    s.personality=s.personality.slice(0,1500);
    // Name tag: checked here as plain text (chat-tag.js). Off with an unusable name keeps the saved one.
    const tag=TylerChatTag.validate(s.chatTagName);
    if(tag.ok)s.chatTagName=tag.name;else if(s.chatTagEnabled){$('chatTagName').focus();throw Error(tag.error);}else delete s.chatTagName;
    s.insideJokes=s.insideJokes.slice(0,3600);
    s.nicknameAliases=s.nicknameAliases.slice(0,2400);
    s.callbackGap=Math.max(3,Math.min(30,Number(s.callbackGap)||6));
    s.activitySteamIds=[...new Set(String(s.activitySteamIds||'').match(/7656119\d{10}/g)||[])].slice(0,8).join('\n');s.libraryAllowedIds=String(s.libraryAllowedIds||'').slice(0,3000);s.spendingCapUSD=Math.max(0,Math.min(100,Number(s.spendingCapUSD)||0));
    if(noiseChanged){s.voiceThreshold=null;s.minVoiced=null;s.replyPause=null;}
    if($('openrouterKey').value.trim())s.openrouterKey=$('openrouterKey').value.trim();
    if($('geminiKey').value.trim())s.geminiKey=$('geminiKey').value.trim();
    if(s.geminiKey){
      const response=await fetch('https://generativelanguage.googleapis.com/v1beta/models/'+encodeURIComponent(s.geminiTextModel||'gemini-3.1-flash-lite'),{headers:{'x-goog-api-key':s.geminiKey},redirect:'error',signal:AbortSignal.timeout(12000)});
      if(!response.ok)throw Error('Google key check returned HTTP '+response.status+(response.status===404?' for the selected Gemini model. Pick another model or check the key\'s project.':'. Check the key and project access.'));
    }
    if(s.openrouterKey){$('status').textContent='Checking your key with OpenRouter…';await verifyOpenRouterKey(s.openrouterKey);}
    await storage().set(s);
    
    await storage().remove('settingsDraft');
    noiseChanged=false;
    $('openrouterKey').value='';
    $('status').textContent='Settings saved. You can return to Steam.';
    window.close();
  }catch(error){
    $('status').textContent='Settings stayed open. '+String(error.message||'Save failed').replace(/sk-or-[\w-]+/gi,'[hidden]');
  }finally{$('save').disabled=false;}
};
window.tylerSettingsLoaded=load();
// Theme stats (v2.20.1): reset now, independent of Save.
document.getElementById('themeStatsReset')?.addEventListener('click',async()=>{if(!window.confirm('Reset every theme\'s lifetime stats (achievements, levels, high scores)?'))return;await storage().remove('tylerLifetime');document.getElementById('themeStatsNote').textContent='Theme stats reset.';});
// The Voice page fills its model and voice lists after this script runs, then loads the values again.
window.tylerSettingsReload=load;

// Advanced options stay visible by default; can be collapsed without affecting saved settings.
const advancedToggle=document.getElementById('advancedToggle');advancedToggle?.addEventListener('click',()=>{const hidden=document.body.classList.toggle('advanced-hidden');advancedToggle.textContent=hidden?'Show advanced controls':'Hide advanced controls';});

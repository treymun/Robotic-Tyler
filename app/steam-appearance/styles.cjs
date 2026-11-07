'use strict';
// Paint-only adaptation of Claude's existing theme sheets. Never ship those sheets
// into Steam wholesale: they also contain layout, icons and panel-only behaviour.
const fs=require('node:fs'),path=require('node:path');
const UI=path.join(__dirname,'..','companion','ui');
const THEMES=['steam',...fs.readdirSync(path.join(UI,'themes')).filter(f=>f.endsWith('.css')).map(f=>f.slice(0,-4))];
const cleanTheme=t=>THEMES.includes(t)?t:'steam';
const cleanMode=m=>['colors','full'].includes(m)?m:'off';
const read=f=>fs.readFileSync(path.join(UI,f),'utf8').replace(/\/\*[\s\S]*?\*\//g,'');
function declarations(text){
 const out=[];let start=0,depth=0,quote='';
 for(let i=0;i<=text.length;i++){
  const c=text[i];if(quote){if(c===quote&&text[i-1]!=='\\')quote='';continue;}
  if(c==='"'||c==="'"){quote=c;continue;}if(c==='(')depth++;if(c===')')depth--;
  if((c===';'&&!depth)||i===text.length){const s=text.slice(start,i),at=s.indexOf(':');if(at>0)out.push([s.slice(0,at).trim(),s.slice(at+1).trim()]);start=i+1;}
 }
 return out;
}
const rules=text=>[...text.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map(m=>({selector:m[1].trim(),values:declarations(m[2])}));
function selectors(text){let start=0,depth=0;const out=[];for(let i=0;i<=text.length;i++){if(text[i]==='(')depth++;if(text[i]===')')depth--;if((text[i]===','&&!depth)||i===text.length){out.push(text.slice(start,i).trim());start=i+1;}}return out;}
// Original selectors can group a heading with a more specific alternative in
// :is(). Keep that specificity when several rules map to one Steam surface.
function specificity(s){let score=0;
 for(let i=0;i<s.length;){
  const c=s[i];if(c==='['){score+=1000;const end=s.indexOf(']',i+1);i=end<0?s.length:end+1;continue;}
  const m=/^(::?|[.#])?([a-z_][\w-]*)/i.exec(s.slice(i));if(!m){i++;continue;}
  const [,prefix,name]=m;i+=m[0].length;
  if(prefix===':'&&s[i]==='('){let end=i+1,depth=1;for(;end<s.length&&depth;end++){if(s[end]==='(')depth++;if(s[end]===')')depth--;}
   if(['is','not','has'].includes(name))score+=Math.max(0,...selectors(s.slice(i+1,end-1)).map(specificity));else if(name!=='where')score+=1000;
   i=end;continue;
  }
  score+=prefix==='#'?1000000:prefix==='.'||prefix===':'?1000:1;
 }
 return score;
}
function matchesPart(selector,component){
 if(selector===component)return true;
 const group=/^:(?:is|where)\((.*)\)$/.exec(selector);
 if(!group)return false;
 // A selector with two separate :is() groups is not one component group.
 let depth=0;
 for(const character of group[1]){
  if(character==='(')depth++;
  if(character===')'&&--depth<0)return false;
 }
 return depth===0&&selectors(group[1]).includes(component);
}
const sourceParents={'.wordmark':'.bar','.rt-dialog-title':'.rt-dialog','.section-nav button':'.side','.section-nav button[aria-current=page]':'.side'};
function componentPriority(selector,component,state,theme){
 const matches=selectors(selector).filter(s=>{
  const themed='[data-rt-theme='+theme+']';
  if(s===component+themed+state)return true;
  for(const prefix of [themed+' ','.panel'+themed+' ','.panel'+themed+'>'])if(s.startsWith(prefix)){
   // The main Tyler panel carries the theme itself. Rules for a panel
   // descended from another themed element style a different surface.
   if(component==='.panel')return false;
   s=s.slice(prefix.length).trimStart();break;
  }
  if(state){
   const suffix=[state+':not(:disabled)',':not(:disabled)'+state,state].find(value=>s.endsWith(value));
   if(!suffix)return false;
   s=s.slice(0,-suffix.length);
  }
  if(matchesPart(s,component))return true;
  const parent=sourceParents[component];
  const descendant=parent&&/^(\.[\w-]+|:is\([^()]*\)) (.+)$/.exec(s);
  return !!descendant&&matchesPart(descendant[1],parent)&&matchesPart(descendant[2],component);
 });
 return matches.length?Math.max(...matches.map(specificity)):-1;
}
// Border radii also change corner hit testing, even with identical rectangles.
const paint=new Set(['background','background-color','background-image','background-position','background-size','background-repeat','background-clip','-webkit-background-clip','color','border-color','border-top-color','border-right-color','border-bottom-color','border-left-color','box-shadow','text-shadow','outline-color']);
const controlPaint=new Set(['outline','outline-offset','fill']);
const paintVariables=new Set(['--blade','--cb-k','--tone']);
const namespace=s=>s.replace(/--([\w-]+)/g,'--rt-steam-$1');
function safeValue(value){
 // Sources currently use CSS gradients. Only embedded raster images can be added
 // here without introducing a page request, CSP exception or remote dependency.
 return !/url\(/i.test(value)||[...value.matchAll(/url\(([^)]*)\)/gi)].every(m=>/^['"]?data:image\/(?:png|webp|jpeg|gif);base64,[a-z0-9+/=]+['"]?$/i.test(m[1].trim()));
}
function cssRule(selector,values){
 const declarations=values.filter(([k,v])=>(paint.has(k)||paintVariables.has(k)||controlPaint.has(k))&&safeValue(v))
  .map(([k,v])=>namespace(k)+':'+namespace(v.replace(/\s*!important\s*$/i,''))+' !important;').join('');
 return declarations?selector+'{'+declarations+'}\n':'';
}

const v=k=>'var(--rt-'+k+')';
const bg=([key])=>key==='background'||key.startsWith('background-');
const edge=([key])=>key.startsWith('border-')||key==='box-shadow';
const last=(values,key)=>values.findLast(([k])=>k===key)?.[1]?.replace(/\s*!important\s*$/i,'');
function borderPaint([key,value]){
 // Keep the authored colour from a border shorthand without its geometry.
 const border=/^border(?:-(top|right|bottom|left))?$/.exec(key);
 if(!border)return [key,value];
 const colorKey='border'+(border[1]?'-'+border[1]:'')+'-color';
 if(/^(?:0(?:px)?|none)(?:\s*!important)?$/i.test(value))return [colorKey,'transparent'];
 const color=/^\d+(?:\.\d+)?px\s+(?:solid|dashed|dotted|double)\s+(.+)$/.exec(value);
 return color?[colorKey,color[1]]:[key,value];
}

function sourcePainter(sourceRules,theme){
 return (component,state='')=>{
  const parts=Array.isArray(component)?component:[[component,state]];
  const matching=[];
  for(const rule of sourceRules){
   const priority=Math.max(...parts.map(([part,variant])=>componentPriority(rule.selector,part,variant,theme)));
   if(priority<0)continue;
   for(const [key,value] of rule.values){
    const rank=priority+(/!important\s*$/i.test(value)?1000000000:0);
    if(/^border(?:-(?:top|right|bottom|left))?$/.test(key))matching.push({priority:rank,pair:[key,value]});
    const pair=borderPaint([key,value]);
    if(paint.has(pair[0])||paintVariables.has(pair[0])||key==='border-image'||key==='scrollbar-color'){
     matching.push({priority:rank,pair});
    }
   }
  }
  return matching.sort((a,b)=>a.priority-b.priority).map(({pair})=>pair);
 };
}

const nav='.chatRoomGroupNavColumn:not(.chatRoomGroupNavCollapsed)';
const channelRow=' .chatRoomTextChannel:not(.chatRoomVoiceChannel *)';
const dialogInput='.DialogInput:is(textarea,input:not([type]),input[type="text"],input[type="search"],input[type="password"])';
const menuItem=' .contextMenuItem:not(.contextMenuUnselectable,.contextMenuGameItem,.disabled,[aria-disabled="true"])';
// Current Steam uses CSS modules for the tab itself and its selected state.
// The stable list scopes these classes away from tab copies in other menus.
const nativeTab='.chatTabList .LUogGjb84qw-';
const nativeActiveTab=nativeTab+'.okAC0yOlZwY-';
const nativeTabClose=' .vpbEs5-dLIs-';
const tabClasses='.chatTab,.LUogGjb84qw-,.InnerChatTab';
const tab='.chatTabList .chatTab,'+nativeTab+',.chatBody .InnerChatTabs .InnerChatTab';
// Steam's desktop composer uses a submit button and a stable SVG class. Its
// hashed CSS module class is shared with accessory buttons such as the uploader.
const nativeSend='.chatEntry form button[type="submit"]:has(.SVGIcon_Submit)';
const send=nativeSend+',.chatEntry .chatSubmitButton';
const SURFACES={
 canvas:'.friendsui-container,.chatWindow,.chatDialogs,.ChatRoomGroup_MainAndChatEntry,.VoiceRoomChatWindow',
 // VoiceRoomChatHistory is Steam's translucent modal backdrop, not the scroll pane.
 history:'.chatHistoryScroll,.ChatHistoryContainer:not(:has(.chatHistoryScroll))',
 side:'.friendlist,.friendlistListContainer,.chatRoomGroupNavColumn,.MemberListColumn,.chatRoomMembers,.ChatRoomMemberScrollList_List',
 header:'.chatHeader,.chatRoomGroupHeader,.chatRoomHeader,.friendListHeaderContainer,.VoiceRoomChatTitle',
 title:'.chatHeader .chatRoomName,.chatRoomGroupHeaderName,.chatRoomGroupActiveChatName,.VoiceChatTextChannelName',
 tabRail:'.titleBarContainer.ChatTabs,.chatBody .ChatBodyControls',
 tab,
 activeTab:'.chatTabList .chatTab.active,'+nativeActiveTab+',.chatBody .InnerChatTabs .InnerChatTab.Active',
 tabLabel:'.chatTab .ChatTabContent.ChatRoom .clanName,'+nativeTab+' ._6eLMujxXW24-,.InnerChatTab .InnerChatTabLabel',
 composer:'.chatWindow .chatEntry,.VoiceRoomChatWindow .chatEntry',
 input:'.chatEntry textarea,.chatEntry [contenteditable="true"],'+dialogInput,
 // Leave Steam's send-error, moderation and attachment treatments in charge.
 text:'.msgText:not(.ChatMessageErrorSending *,.ChatMessageBlock_SuspiciousSender *,.ChatMessageBlock_BlockedSender *)',
 muted:'.msg:not(.new_messages,.time_passes) .timestamp,.FriendChatTimeStamp,.timeDivision:not(.new_messages,.time_passes)',
 link:'.msgText:not(.ChatMessageErrorSending *,.ChatMessageBlock_SuspiciousSender *,.ChatMessageBlock_BlockedSender *) a',
 // The shared-dialog CSS module backs the current inline menu. Its item
 // anchor keeps this selector off unrelated popups if Valve changes the hash.
 menu:'.contextMenuPopup,.JFSzUCtMXFw-:has(.contextMenuItem)',
 dialog:'.DialogContent',
 button:'.chatHeader .DialogButton:not(.chatRoomHeaderButton,.VoiceControlPanelButton),.chatEntry .DialogButton,.DialogContent .DialogButton:not(.deleteButton,.roleButton,.DialogInput_CopyAction),'+send,
 divider:'.timeDivision:not(.new_messages,.time_passes) :is(.horizDivider,.preHorizDivider,.postHorizDivider),.contextMenuItemHR',
};
// Valve can mark the document element itself, its body or a mounted chat
// container. Keep paint inert if that marker disappears on the same page.
const scoped=list=>selectors(list).map(s=>'html:is(.friendsui-container,:has(.friendsui-container)) '+s).join(',');
const withoutPresence=list=>selectors(list).map(s=>s+':not(:has(.friendlist,.chatRoomMembers,.groupMemberList,.friend,.personaName))').join(',');
const qualify=(list,suffix)=>selectors(list).map(s=>s+suffix).join(',');
const disabled=':is(:disabled,.disabled,.Disabled,[aria-disabled="true"])';
const enabled=':where(:not('+disabled+'))';
const tabHover=':where(:hover)'+enabled;
const colorLayer=color=>'linear-gradient('+color+','+color+')';

// Most themes put their signature art on the panel itself. These few use
// a different reading surface in Tyler's panel and should keep that material.
const outputHistories=new Set(['classic','dod','gmod','ipod']);
const translucentScrolls=new Set(['cs16','doom','l4d','msn']);

function xmbRibbons(source){
 // Tyler's two 220%-wide ellipses at rest, with their original top edges.
 // Use background paint so the wave needs no positioned element or animation.
 return [[46,120,'::before'],[52,150,'::after']].flatMap(([top,radius,state])=>{
  const ribbon=source('.panel',state);
  const color=last(ribbon,'border-top-color');
  const glow=last(ribbon,'background')?.match(/rgba\([^)]+\)/)?.[0];
  if(!color||!glow)return [];
  return ['radial-gradient(ellipse 50% 100% at 50% 100%,transparent 58%,'+glow+' 97.5%,'+color+' 99%,transparent 100%)'
   +' center calc('+top+'% + '+radius*top/100+'px)/220% '+radius+'px no-repeat'];
 });
}

// Steam's dialog buttons are normally borderless. Paint the original border
// inside their existing surface, with the original raised or pressed sides.
const borderSides=['top','right','bottom','left'];
const borderWidth=value=>Number(/^(\d+(?:\.\d+)?)px\s+solid\b/.exec(value)?.[1]||0);
function buttonFrame(values,vars,theme){
 const widths=borderSides.map(()=>0);
 let colors=borderSides.map(()=>'currentColor');
 for(const [key,raw] of values){
  const value=raw.replace(/\s*!important\s*$/i,'');
  if(key==='border'){
   widths.fill(borderWidth(value));
   colors=borderSides.map(()=>'currentColor');
  }else if(key==='border-color'){
   const variable=/^var\((--[\w-]+)\)$/.exec(value)?.[1];
   const [top,right=top,bottom=top,left=right]=(vars.get(variable)||value).split(/\s+(?![^()]*\))/);
   colors=[top,right,bottom,left];
  }else{
   const side=borderSides.indexOf(/^border-(top|right|bottom|left)(?:-color)?$/.exec(key)?.[1]);
   if(side>=0){
    if(key.endsWith('-color'))colors[side]=value;
    else widths[side]=borderWidth(value);
   }
  }
 }
 if(widths.every(width=>width===0)){
  // A primary rule can supply a color even after its base removed the border.
  return /^(?:0(?:px)?|none)$/i.test(last(values,'border')||'')?[...values,['border-color','transparent']]:values;
 }
 // The black lip and the two-pixel inventory bevel both need visible paint.
 if(theme==='minecraft')for(const [i,width] of widths.entries())widths[i]=Math.min(width,1);
 const [top,right,bottom,left]=colors;
 const [topWidth,rightWidth,bottomWidth,leftWidth]=widths;
 const uniform=colors.every(color=>color===top)&&widths.every(width=>width===topWidth);
 const rim=uniform?['inset 0 0 0 '+topWidth+'px '+top]:[
  topWidth&&'inset 0 '+topWidth+'px 0 '+top,rightWidth&&'inset -'+rightWidth+'px 0 0 '+right,
  bottomWidth&&'inset 0 -'+bottomWidth+'px 0 '+bottom,leftWidth&&'inset '+leftWidth+'px 0 0 '+left,
 ].filter(Boolean);
 const shadow=last(values,'box-shadow');
 if(shadow&&shadow!=='none')rim.push(shadow);
 return [...values,['box-shadow',rim.join(',')]];
}

function paintButtons(add,theme,surface,source,vars){
 const primary=qualify(surface.button,'.Primary')+','+send;
 const brightInk={gmod:v('ink-strong'),ipod:v('ink-strong'),msn:v('ink-strong'),x360:v('ink-strong'),payday:v('bg-deep'),quake:'#000'};
 const states=[
  {selector:'',sourceStates:['']},
  {selector:':hover',sourceStates:['',':hover']},
  {selector:':active',sourceStates:['',':active']},
  {selector:':hover:active',sourceStates:['',':hover',':active',':hover:active',':active:hover']},
 ];
 for(const [targets,components] of [[surface.button,['button']],[primary,['button','.primary']]]){
  const isPrimary=components.includes('.primary');
  for(const {selector,sourceStates} of states){
   const values=source(components.flatMap(component=>sourceStates.map(state=>[component,state])));
   const hover=sourceStates.includes(':hover');
   const pressed=sourceStates.includes(':active');
   if(isPrimary&&brightInk[theme])values.push(['color',brightInk[theme]],['text-shadow','none']);
   if(isPrimary&&theme==='rust')values.push(['background',v(hover?'green-hover':'green')]);
   if(theme==='steam'){
    if(hover)values.push(['color',isPrimary?'#000':v('bg-deep')]);
    else if(!selector)values.push(['color',v('ink-strong')]);
   }
   if(theme==='ipod'&&hover&&!isPrimary)values.push(['color',v('ink-strong')]);
   if(theme==='hev'&&hover&&!isPrimary){
    const highlight=last(values,'background');
    if(highlight)values.push(['background',colorLayer(highlight)+','+v('bg-deep')]);
   }
   if(theme==='minecraft'&&hover)values.push(['background',isPrimary?v('green'):'#59639a']);
   if(!selector&&theme==='minecraft')values.push(['color','#fff']);
   if(theme==='tf2'&&(pressed||isPrimary&&hover))values.push(['color',v('ink-strong')]);
   // Keep the original highlight on these gradients and put its readable
   // part under Steam's shorter labels. Only the background paint moves.
   if(theme==='quake'&&isPrimary)values.push(['background-size','auto,100% 135%'],['background-position','0 0,center top']);
   if(theme==='winxp'&&isPrimary&&hover)values.push(['background-size','100% 200%'],['background-position','center bottom']);
   if(theme==='l4d'&&isPrimary&&pressed)values.push(['background','var(--l-brush),var(--l-blood)']);
   add(qualify(targets,selector+enabled),buttonFrame(values,vars,theme));
  }
 }
 add(qualify(surface.button,disabled),buttonFrame(source([['button',''],['button',':disabled']]),vars,theme));
 // Use the authored outline independently of the face. Steam's button focus
 // normally suppresses outlines, so a color override alone would be invisible.
 add(qualify(surface.button+','+surface.tab,':focus-visible'+enabled),[
  ['outline','var(--rt-focus-w,2px) var(--rt-focus-style,solid) '+v('focus')],
  ['outline-offset','var(--rt-focus-offset,2px)'],
 ]);
 add(qualify(primary,':focus-visible'+enabled),source('.primary',':focus-visible').filter(([key])=>key==='outline-color'));
 add(nativeSend+enabled+' .SVGIcon_Submit path',[['fill','currentColor']]);
}

function fullPaint(theme,surface,source,logo,light,vars){
 let full='';
 const add=(targets,values)=>{full+=cssRule(scoped(targets),values);};
 const project=(component,targets,filter=()=>true)=>add(targets,source(component).filter(filter));
 const base=source('.panel').filter(bg);
 const output=source('.output');
 const bar=source('.bar');
 const foot=source('.foot');
 const wordmark=source('.wordmark');
 const textInk=([key,val])=>key==='color'&&val!=='transparent';
 const history=surface.history;
 const panelBackdrop=last(base,'background')||v('bg');
 // The light panel normally backs these translucent surfaces. Steam's
 // nearby presence list may still be using its own dark backing.
 const overPanel=values=>{
  if(!light)return values;
  const background=last(values,'background');
  if(background==='transparent')return [...values,['background',panelBackdrop]];
  if(/^rgba\(/.test(background||''))return [...values,['background',colorLayer(background)+','+panelBackdrop]];
  return values;
 };
 let backdrop=outputHistories.has(theme)?last(output,'background'):panelBackdrop;
 project('.panel',surface.canvas,bg);
 add(history,output.filter(edge));
 if(outputHistories.has(theme))add(surface.text,output.filter(textInk));
 if(theme==='steam')backdrop=v('bg-deep');
 if(theme==='winxp')backdrop=last(source('.scroll'),'background');
 if(translucentScrolls.has(theme)){
  const veil=last(source('.scroll'),'background');
  if(veil)backdrop=(veil.includes('gradient(')?veil:colorLayer(veil))+','+panelBackdrop;
 }
 if(theme==='combine')backdrop='var(--cb-brackets),'+panelBackdrop;
 if(theme==='pipboy'){
  backdrop='var(--pb-scan),'+panelBackdrop;
  project('.stat dd',surface.muted,([key])=>key==='text-shadow');
 }
 if(theme==='xmb')backdrop=xmbRibbons(source).concat(panelBackdrop).join(',');
 add(history,[['background',backdrop||v('bg-deep')]]);
 if(theme==='classic')add(history,[['box-shadow','inset 1px 1px 0 var(--c-lo),inset -1px -1px 0 var(--c-hi)']]);
 if(theme==='deadlock')add(history,[['box-shadow','var(--dl-deco)']]);
 if(theme==='minecraft')add(history,[['box-shadow','inset 0 0 0 1px var(--mc-outline),var(--mc-raised)']]);
 if(theme==='winxp')add(history,[['box-shadow','inset 0 0 0 1px var(--x-frame)']]);
 if(theme==='l4d'){
  add(history,[['box-shadow','inset 0 0 80px rgba(0,0,0,.75)']]);
  add(surface.link,[['color',v('state-waiting')]]);
 }
 if(theme==='dod'){
  add(surface.muted,[['color','var(--dd-bake)']]);
  add(surface.link,[['color','var(--dd-amber-lo)']]);
 }
 if(theme==='ipod')add('.chatHistoryScroll .msg:not(.serverMsg,.ChatMessageErrorSending,.new_messages,.time_passes)',[['box-shadow','inset 0 -1px 0 var(--ip-rule)']]);

 add(surface.header,overPanel(bar));
 add(surface.header,wordmark.filter(textInk));
 const gradientTitle=last(wordmark,'color')==='transparent';
 add(gradientTitle?qualify(surface.title,':not(:has(img,svg))'):surface.title,wordmark);
 // The voice scratch pad's minimize stroke is always white in Steam.
 if(light)add('.VoiceRoomChatTitle .MinimizeTextChat',[['background-color',v('ink-strong')]]);
 add(surface.composer,overPanel(foot).filter(([key])=>key!=='color'));

 // Transfer the strip's exact source gradient as a background layer. Its
 // height is paint inside the existing box, with no change to border width.
 for(const [values,target,side,height] of [[bar,surface.header,'bottom',theme==='tf2'?4:8],[foot,surface.composer,'top',6]]){
  if(!['tf2','hev'].includes(theme))continue;
  const strip=last(values,'border-image')?.replace(/\s+\d+$/,'');
  if(strip)add(target,[['background',strip+' center '+side+'/100% '+height+'px no-repeat,'+(last(values,'background')||v('bar'))]]);
 }
 if(theme==='doom')add(surface.composer,[['background','var(--d-stone-tex)']]);
 if(theme==='doom')add(surface.header,[['background',colorLayer('rgba(10,4,2,.55)')+','+panelBackdrop]]);

 add(surface.tabRail,overPanel(source('.tabs')));
 // Both the plain button and the tab's own rules contribute to the actual
 // panel tab. Resolve them together before applying the selected state.
 const tabBase=[['button',''],['.tabs button','']];
 const tabSelected=[...tabBase,['.tabs button[aria-selected=true]','']];
 const tabHovered=[['button',':hover'],['.tabs button',':hover']];
 // Steam draws these existing separators separately from the tab face.
 // Let Claude's own edge paint supply the divider in Full.
 add(nativeTab+'::before,'+nativeTab+':last-of-type::after',[['background-color','transparent']]);
 const lastTab=':nth-last-child(1 of '+tabClasses+')';
 for(const [targets,native,parts] of [[surface.tab,nativeTab,tabBase],[surface.activeTab,nativeActiveTab,tabSelected]]){
  for(const [state,variants] of [['',parts],[tabHover,[...parts,...tabHovered]]]){
   const values=source(variants);
   add(qualify(targets,state),values);
   const frame=buttonFrame(values,vars,theme).slice(values.length).filter(([key])=>key==='box-shadow');
   // The modern Steam tab has no border. Carry the authored edge in paint.
   add((light?withoutPresence(native):native)+state+(theme==='ipod'?':not('+lastTab+')':''),frame);
  }
 }
 if(theme==='steam')add(qualify(surface.activeTab,':not(.LUogGjb84qw-)'),[['box-shadow','inset 0 -2px 0 '+v('active')]]);
 if(theme==='portal'){
  // The original Portal tab uses a decorative ellipse on top of a transparent
  // face. Keep its two ring colors and size without adding a tab element.
  const ring=color=>[['background-image','radial-gradient(ellipse closest-side,transparent 56%,'+color+' 72% 91%,transparent)'],
   ['background-position','center bottom 1px'],['background-size','46px 9px'],['background-repeat','no-repeat']];
  add(qualify(surface.tab,tabHover),ring('var(--p-blue)'));
  add(surface.activeTab,ring('var(--p-orange)'));
 }
 if(theme==='cs2')project('.tabs button:first-child',qualify(surface.tab,':where(:nth-child(1 of '+tabClasses+'):not(.active,.okAC0yOlZwY-,.Active))'));
 if(theme==='ipod')project('.tabs button:last-child',qualify(surface.tab,lastTab));
 // Keep Steam's native gray/white close icon legible on the brighter faces.
 if(light||['dod','gmod'].includes(theme))add(nativeTab+nativeTabClose,[['background-color','#23262e']]);
 else if(['combine','cs16','quake'].includes(theme))add(nativeActiveTab+nativeTabClose,[['background-color','#23262e']]);
 add(surface.nav,overPanel(source('.side')));
 project('.section-nav',surface.nav);
 project('.section-nav button',surface.channel);
 add(qualify(surface.channel,':hover'+enabled),source('.section-nav button',':hover'));
 project('.section-nav button[aria-current=page]',surface.activeChannel);
 add(qualify(surface.channel,' .chatRoomTextChannelName:not(.IsCommonsChannel)'),[['color','inherit']]);
 if(theme==='minecraft'){
  add(surface.channel,[['color','#fff'],['text-shadow','var(--mc-shadow)']]);
  add(surface.activeTab,[['box-shadow','inset 0 0 0 2px #000,inset 0 0 0 4px #eaeaea']]);
 }
 if(theme==='pipboy')add(surface.tabRail,[['box-shadow','inset 0 -2px 0 var(--pb)']]);
 if(theme==='rust')add(surface.tab,[['color','var(--ru-ink-2)']]);
 if(theme==='ricochet'){
  const pad=last(source('.tabs button','::before'),'background');
  const disc=last(source('.tabs button[aria-selected=true]','::after'),'background')
   ?.replace('ellipse,','ellipse closest-side,').replace('100%)','98%,transparent 100%)');
  if(pad&&disc){
   add(surface.tab,[['background',pad],['box-shadow','inset 0 1px 0 rgba(124,236,255,.55)']]);
   add(surface.activeTab,[['background',disc+' center bottom 1px/24px 5px no-repeat,'+pad],['box-shadow','inset 0 1px 0 #b7f6ff,0 0 8px rgba(56,225,255,.35)']]);
  }
 }
 if(theme==='x360')for(const [i,blade] of ['room','soundboard','setup','checks'].entries()){
  const bladePaint=source('.tabs button[data-tab='+blade+']').filter(([key])=>key==='--blade');
  add(qualify(surface.tab,':nth-child(5n+'+(i+2)+' of '+tabClasses+')'),bladePaint);
 }
 // Use alternate ink from the same theme on bright plates at Steam's small
 // native label size. Keep the original selection gradients and bevels.
 if(['gmod','ipod','msn','x360','quake'].includes(theme)){
  const targets=theme==='gmod'||theme==='msn'?surface.activeChannel:surface.activeTab+','+surface.activeChannel;
  add(targets,[['color',theme==='quake'?'#000':v('ink-strong')],['text-shadow','none']]);
 }

 project('textarea',surface.input);
 add(qualify(surface.input,':focus'),source('textarea',':focus'));
 const scrollColors=/^((?:rgba?\([^)]*\)|var\([^)]*\)|\S+))\s+(.+)$/.exec(last(source('.scroll'),'scrollbar-color')||'');
 if(scrollColors){
  add('.chatHistoryScroll::-webkit-scrollbar-thumb',[['background-color',scrollColors[1]]]);
  add('.chatHistoryScroll::-webkit-scrollbar-track',[['background-color',scrollColors[2]]]);
 }
 const dialog=source('.rt-dialog');
 const dialogHeader=qualify(surface.dialog,' .DialogHeader');
 add(surface.dialog,dialog);
 add(qualify(surface.dialog,' :is(.DialogHeader,.DialogBody,.DialogBodyText)'),[['color','inherit']]);
 project('.rt-dialog-head',dialogHeader);
 const dialogTitle=source('.rt-dialog-title');
 if(last(dialogTitle,'color')==='transparent'){
  add(dialogHeader,[['color',v('ink-strong')]]);
  add(qualify(dialogHeader,':not(:has(img,svg))'),dialogTitle);
 }else add(dialogHeader,dialogTitle);
 if(theme==='classic')add(dialogHeader,[['color',v('ink-strong')]]);
 if(theme==='doom')add(dialogHeader,[['color','var(--d-yellow)']]);
 // These dialogs intentionally use the opposite ink polarity from their nav.
 // Their menus stay on the theme's ordinary navigation palette.
 if(!['deadlock','dod','minecraft'].includes(theme)){
  add(surface.menu,dialog);
  add(qualify(surface.menu,' .contextMenuLabel'),dialog.filter(textInk));
 }
 // A menu item uses the same paint as the theme's navigation selection.
 add(qualify(surface.item,':is(:hover,:focus-visible)'),source('.section-nav button',':hover'));

 paintButtons(add,theme,surface,source,vars);

 // Use the exact bundled theme mascot as idle art only on a truly empty
 // scroll pane. It stays behind all content and does not become a DOM node.
 const idle='.chatHistoryScroll:is(:empty,:has(> .chatHistory > .disconnectBlocker:only-child)):not(.errorDisconnected *,[aria-busy="true"] *)';
 if(logo)add(idle,[['background',logo+' center/32px 32px no-repeat,'+(backdrop||v('bg-deep'))]]);
 return full;
}
const cache=new Map();
function stylesFor(value){
 const theme=cleanTheme(value);if(cache.has(theme))return cache.get(theme);
 const baseRules=rules(read('tokens.css')),normal=rules(read('panel.css')),kit=rules(read('kit.css'));
 const themeRules=theme==='steam'?[]:rules(read('themes/'+theme+'.css'));
 const source=sourcePainter([...normal,...kit,...themeRules],theme);
 const light=themeRules.some(r=>r.selector==='[data-rt-theme='+theme+']'&&r.values.some(([k,v])=>k==='color-scheme'&&v==='light'));
 const vars=new Map();
 for(const rule of [...baseRules,...normal,...themeRules]){
  if(![':root,:host','[data-rt-theme='+theme+']'].includes(rule.selector)&&componentPriority(rule.selector,'.panel','',theme)<0)continue;
  for(const [key,val]of rule.values)if(key.startsWith('--')&&safeValue(val))vars.set(key,val);
 }
 const variableCss='html{'+[...vars].map(([k,v])=>namespace(k)+':'+namespace(v)+';').join('')+'}\n';
 const surface={...SURFACES,nav:light?withoutPresence(nav):nav};
 surface.channel=surface.nav+channelRow;
 surface.activeChannel=surface.channel+'.ActiveTextChannel';
 if(light){
  for(const key of ['canvas','tab','activeTab','dialog','menu'])surface[key]=withoutPresence(surface[key]);
  surface.side=surface.nav;
 }
 surface.item=qualify(surface.menu,menuItem);
 let colors=variableCss;
 const add=(targets,values)=>{colors+=cssRule(scoped(targets),values);};
 // Solid surfaces also remove Steam's decorative gradients: leaving a dark
 // gradient behind a light theme's dark ink would make Colors only unreadable.
 // Keep Steam's status-coloured names and native dark list backdrops together
 // on light themes. Some group rosters inherit the enclosing chat's backdrop.
 add(surface.canvas,[['background',v('bg')],['color',v('ink')]]);
 add(surface.history,[['background',v('bg-deep')],['color',v('ink')]]);
 add(surface.side,[['background',v('surface')],['color',v('ink')],['border-color',v('line')]]);
 add([surface.header,surface.tabRail,surface.composer].join(','),[['background',v(light?'surface':'bar')],['color',v('ink-strong')],['border-color',v('line')]]);
 add(surface.input,[['background-color',v('input')],['color',last(source('textarea'),'color')||v('ink')],['border-color',v('line-strong')]]);
 add(surface.text,[['color',v('ink')]]);add(surface.muted,[['color',v('ink-4')]]);
 add(surface.link,[['color',v('link')]]);
 add([surface.menu,surface.dialog].join(','),[['background',v('surface')],['color',v('ink')],['border-color',v('line-strong')]]);
 add(qualify(surface.dialog,' :is(.DialogHeader,.DialogBody,.DialogBodyText)'),[['color',v('ink')]]);
 add(qualify(surface.dialog,' .DialogHeader'),[['background-color','transparent']]);
 add([surface.button,surface.tab].join(','),[['background',v('surface-3')],['color',v('ink-strong')],['border-color',v('line-strong')]]);
 add(surface.tabLabel,[['color','inherit']]);
 add(qualify(surface.menu,' .contextMenuSectionContent'),[['background-color','transparent']]);
 add(surface.item,[['color',v('ink')]]);
 add(surface.channel,[['color',v('ink')]]);
 add(qualify(surface.channel,' .chatRoomTextChannelName:not(.IsCommonsChannel)'),[['color','inherit']]);
 add(surface.divider,[['background-color',v('line')],['border-color',v('line')]]);
 for(const target of [surface.button,surface.item,surface.tab,surface.channel]){
  add(qualify(target,target===surface.tab?tabHover:':hover'+enabled),[['background-color',v('select')],['color',v('ink-strong')]]);
 }
 add([surface.activeTab,surface.activeChannel].join(','),[['background-color',v('select')],['color',v('ink-strong')],['border-color',v('active')]]);
 // A contact tab can sit on a bright theme face. Preserve the native dark
 // backing immediately behind Valve's status-coloured name and avatar.
 add(nativeTab+' .nHfaWz8Bomg-',[['background-color','#23262e']]);
 if(light)add(nativeTab+nativeTabClose,[['background-color','#23262e']]);
 add(qualify(surface.button,disabled),[['color',v('ink-disabled')]]);
 // Match Steam's roster thumb reveal on hover and leave its geometry intact.
 add('.chatHistoryScroll::-webkit-scrollbar-thumb,.friendlistListContainer:hover::-webkit-scrollbar-thumb,.ChatRoomList:hover::-webkit-scrollbar-thumb',[['background-color',v('surface-3')]]);
 add('.chatHistoryScroll::-webkit-scrollbar-thumb:hover,.friendlistListContainer:hover::-webkit-scrollbar-thumb:hover,.ChatRoomList:hover::-webkit-scrollbar-thumb:hover',[['background-color',v('select')]]);
 const logoFile=path.join(UI,'logos',theme+'-32.png');
 const logo=fs.existsSync(logoFile)?'url("data:image/png;base64,'+fs.readFileSync(logoFile).toString('base64')+'")':'';
 const full=fullPaint(theme,surface,source,logo,light,vars);
 const result=Object.freeze({colors,full,theme});cache.set(theme,result);return result;
}
module.exports={stylesFor,cleanTheme,cleanMode,SURFACES};

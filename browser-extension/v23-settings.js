(()=>{'use strict';
const desktop=document.body.dataset.desktop==='true';
const store=desktop?window.tylerSettings?.storage?.local:globalThis.chrome?.storage?.local;
if(!store)return;
const card=document.createElement('section');card.id='v23Tools';card.className='sheet';card.dataset.uiZone='advanced';
card.innerHTML=`<div class="sheet-head"><h2>Screen awareness, personas and commands</h2>
<p>Chrome can analyze a screen you explicitly choose and optionally make playful Deadlock gameplay comments. No screen capture runs unless you click Share screen inside Steam.</p></div>
<div class="toggle-grid">
<label class="toggle"><input type="checkbox" id="v23ScreenConsent"><span><b>Allow one-time screen analysis</b><small>Images go to OpenRouter; not saved as files. Sharing a screen is a separate opt-in every session.</small></span></label>
<label class="toggle"><input type="checkbox" id="v23AutoRoast"><span><b>Allow automatic gameplay banter</b><small>Only if Chrome screen capture is active, evidence is clear and a 2-minute cooldown passes; off by default.</small></span></label>
<label class="toggle"><input type="checkbox" id="v23RoastEnabled"><span><b>Opt-in roast battles</b><small>Players must explicitly !roast join; !roast start/next/status/stop.</small></span></label>
<label class="toggle"><input type="checkbox" id="v23CommandsEnabled"><span><b>Enable approved custom commands</b><small>Safe canned replies only, restricted to verified allowlisted Steam IDs.</small></span></label>
</div>
<div class="grid two"><label>Deadlock banter intensity<select id="v23ScreenRoast"><option value="balanced">Light · friendly</option><option value="spicy">Spicy · playful trash talk</option></select></label><label>Voice persona<select id="v23Persona"><option value="regular">Regular Tyler</option><option value="announcer">Hype commentator</option><option value="dry">Dry and sarcastic</option><option value="coach">Supportive coach</option></select></label></div>
<label>Vision model (OpenRouter with image support)<input id="v23VisionModel" value="google/gemini-2.5-flash" autocomplete="off" spellcheck="false" maxlength="100"></label>
<p class="hint">Vision requires an OpenRouter API key, an image-capable model and API credits. It reads only the chosen capture, not game memory or hidden telemetry. Results may be wrong; auto-commentary is evidence-gated.</p>
<details><summary>Safe custom command builder</summary><p>One command per line: <code>!rules | Be cool to each other</code>. Only literal text replies, never scripts, URLs from untrusted input, or arbitrary code. Up to eight commands.</p><textarea id="v23Commands" rows="5" spellcheck="false" placeholder="!rules | No spam and have fun.&#10;!hype | Let's go squad!"></textarea></details>
<div class="v22-actions"><button type="button" id="v23Save">Save these options</button></div><p id="v23Status" role="status">The screen-capture controls appear inside Chrome Steam chat.</p>`;
(document.getElementById('v22Tools')||document.getElementById('suiteSettings')||document.getElementById('studio')).after(card);
const $=id=>card.querySelector('#'+id);const fields=['v23ScreenConsent','v23AutoRoast','v23RoastEnabled','v23CommandsEnabled','v23ScreenRoast','v23Persona','v23VisionModel'];
function parseCommands(str){const list=[];for(const line of str.split('\n')){if(!line.trim())continue;const parts=line.split('|'),name=(parts.shift()||'').trim().toLowerCase(),reply=parts.join('|').trim();if(['!help','!trivia','!roast','!game','!party','!vote','!answer','!tyler'].includes(name)||!/^![a-z][a-z0-9_-]{1,24}$/.test(name)||reply.length<1||reply.length>250||list.some(v=>v.name===name))throw Error('Invalid or duplicate command: '+name+' (format: !name | reply)');list.push({name,reply});if(list.length>8)throw Error('Maximum 8 commands');}return list;}
store.get([...fields,'v23Commands']).then(v=>{for(const k of fields){if($(k).type==='checkbox')$(k).checked=v[k]===true;else if(v[k]!=null)$(k).value=v[k];} $('v23Commands').value=(v.v23Commands||[]).map(c=>c.name+' | '+c.reply).join('\n');}).catch(e=>$('v23Status').textContent=e.message);
$('v23Save').onclick=async()=>{try{const o={};for(const k of fields)o[k]=$(k).type==='checkbox'?$(k).checked:$(k).value;o.v23Commands=parseCommands($('v23Commands').value);if(!/^[a-z0-9_-]+\/[a-z0-9._:-]+$/i.test(o.v23VisionModel))throw Error('Enter a valid OpenRouter model name');await store.set(o);$('v23Status').textContent='Saved. Reload the Steam chat tab to apply runtime changes.';}catch(e){$('v23Status').textContent='Could not save: '+e.message;}};
})();

# ROBOTIC TYLER v2.3 — Chrome First Screen & Party Edition (EXPERIMENTAL)

Current Chrome patch: **v2.3.26**. See ../START-HERE.txt, patch-notes/PATCH-v2.3.26.txt and
MODERATION-GUIDE.md for the Steam admin panel, prospective text mute and five-minute mute votes.
Existing installations should update the SAME unpacked folder and reload
the existing extension to preserve settings and saved keys.

Base: v2.2 three-program project. The Chrome extension remains the voice-first version, the Electron Control Center remains text-only, and the native Steam audio companion is retained as an experimental Windows build project. Original Drive project untouched.

## Added

**Screen awareness (Chrome only):** A new `Screen Awareness · Deadlock banter` section appears in Steam chat. The owner must enable consent under Settings → v2.3 Gameplay & Customization, then explicitly click **Choose screen/window** in Chrome. This uses the browser's screen-picker permission. It never captures the microphone or stores screenshots. Click **Analyze once** for an on-demand OpenRouter vision inference. Optional auto analysis runs once every 45 seconds **only while the Steam tab is visible** and the capture remains active, with auto banter separately opted in through settings. It posts to Steam chat or sends spoken TTS through the existing Chrome voice bridge with a cooldown of 2+ minutes, only for high-confidence Deadlock death, poor-performance, or good-play observations. For deaths the model is instructed to require an explicit visible death/respawn cue; it cannot see hidden game events. No webcam, stealth capture, audio recording or background screen capture. People should consent to any shared call audio. **Screen detection is AI-inferred and may be wrong; live Deadlock detection and cost have not been tested.** Image analysis requires a supported OpenRouter vision model and costs credits. Default model: google/gemini-2.5-flash; users may select another compatible OpenRouter vision model.

**Roast battles (Chrome):** Optional, opt-in Steam chat commands `!roast join`, `!roast start`, `!roast next`, `!roast status`, `!roast stop`. Two verified participants must opt in before starting. Uses canned, light gaming jokes and no personal insults or user-generated abusive prompts. No external LLM calls for roast commands.

**Voice Persona Studio (Chrome + desktop settings):** Four presets (Regular, Announcer, Dry, Coach) adjust the AI's phrasing instructions; the existing TTS voice choice remains separately adjustable. Does not claim live pitch/speed processing, custom voice cloning, or provider-independent tone control. The text-only Electron version can configure these presets for its text replies where the shared background is used.

**Custom Command Builder (Chrome with desktop settings):** Up to 8 literal short canned-response Steam commands, e.g. `!rules | Be nice`, each 250 chars max. Restricted to verified Steam IDs in the existing allowlist, disabled by default. No scripts, executable actions, dynamic URLs, or external requests from chat input. This is deliberately not a scripting engine.

**Existing v2.2 features remain:** Chrome voice bridge, AI and soundboard, party host, voting, trivia, memory, settings backup, voice recovery, safety stop, and desktop companion and build scripts. Provider-specific cloud link functionality still needs real service testing; native Steam companion has not been verified in live Windows Steam voice.

## Installation
1. First install: extract this ZIP and Load unpacked → `browser-extension` in `chrome://extensions`. Existing installation: close Steam/YouTube player tabs, copy all browser-extension files into the SAME loaded folder, and Reload the existing extension. Do not uninstall or change its folder path.
2. Open Chrome Steam chat. Enable Screen Awareness consent in extension Settings and save. Restart Steam chat tab to load preferences.
3. Select screen/window from the Chrome overlay. Keep the game visible on the chosen share. Press **Analyze once** first to see the result. Enable automatic banter separately only if you want it. To stop, click Stop sharing or Chrome's own Stop sharing button.
4. For roast battles, enable the option in Settings, then have two verified participants send `!roast join`.
5. For custom commands, enter `!name | literal response`, add verified Steam IDs to the approved friends list, and enable custom commands.
6. Voice response requires the existing Steam Chrome audio bridge to be connected; if not connected, use text-only banter.

## Important limits
- This ZIP is source code and Windows packaging scripts; it contains no compiled or code-signed EXEs.
- No production/live validation of Steam voice, vision API, Electron installers, or native Steam audio routing was possible in this environment.
- Vision AI may hallucinate. It uses **snapshots**, not live game telemetry. It cannot guarantee the correct player died or assign a kill/death to an individual in a voice room.
- A single screen analysis may incur charges. Turn off automatic mode to avoid recurring calls. Screen capture should only be used with permission of anyone whose sensitive information may appear.
- Chrome extension storage and Electron settings storage remain separate; settings do not automatically sync.

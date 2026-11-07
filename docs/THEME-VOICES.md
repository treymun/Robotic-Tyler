# Theme voices (v2.35; the fast engine and spoken replies since v2.36; character voices since v2.41; the voice supplement since v2.42; character recordings built in since v2.43)

Tyler can say typed messages in each theme's character voice. The voices are **clones made on your PC**
by a local model (Qwen3-TTS Base). There's no account, key or cost per message. Theme voices are
**optional**: the normal install doesn't include them, and Tyler's usual voice (Standard voice and
Gemini Live) works the same with or without them. Since v2.36 you can also choose to have Tyler's
spoken replies made in the theme voice (see *Tyler's spoken replies* below); that's off unless you pick it.

## Getting them

| Choice | What you get |
|---|---|
| **Standard installation** (Setup's default) | The usual desktop app. No voice engine, models, Python, PyTorch or GPU files are downloaded or bundled. |
| **Standard app + local theme voices** (Setup: *Also add local theme voices*) | The same app, then a guided step in Settings → Theme voices. It shows this PC's compatibility, the download size and disk space, and Quality vs Lightweight. Nothing downloads until **Install now**. |

You can also install them later from **Settings → Theme voices → Install theme voices**.

- **What's downloaded, and from where:**
  - an isolated Python (python.org's embeddable build);
  - the pinned Python packages (PyPI and PyTorch's own download site);
  - the model (Hugging Face, one pinned commit).
- **Integrity:** every file is listed in `app/theme-voices/engine-lock.json` with its size and SHA-256. A file that doesn't match is deleted and never used. Downloads resume where they stopped.
- **Isolation:** everything lives in `%LOCALAPPDATA%\RoboticTylerHydraCloudV12\ThemeVoices`. Nothing is installed system-wide, nothing is added to PATH or the registry, and other Python installs aren't touched.
- **Drivers:** Tyler never changes graphics drivers. If the NVIDIA driver is too old, Settings says which version is needed.
- **Cancelling or failing:** the app stays usable as it was. **Retry** carries on from what was already downloaded.
- **App updates:**
  - keep the installed engine and models;
  - if a later version needs a newer engine, unchanged packages (for example the 2.6 GB PyTorch) are copied from the installed engine rather than downloaded again;
  - nothing is ever installed for someone who skipped theme voices.
- **Removing:** **Remove theme voices** frees the space. Settings, your own reference recordings and saved clips are kept. You can also remove a single model.
- **Offline bundle:**
  - The *Theme voices offline bundle* workflow builds one `.tar` in parts under 2 GB each, attached to the `theme-voices-engine-1` release. It holds both engines (NVIDIA card and processor-only) and both models.
  - Put every part in one folder, then press **Install from a folder…**.
  - The files are checked exactly like downloads, and anything missing is downloaded.

### Download sizes (from the lock)

| Part | Download |
|---|---|
| Voice engine, NVIDIA graphics card (PyTorch 2.11 + CUDA 12.8, Python 3.13) | 2.71 GB |
| Voice engine, processor only | 0.25 GB |
| Fast engine, NVIDIA graphics card (v2.36; the same PyTorch, plus faster-qwen3-tts and Transformers 5) | 2.71 GB in all; switching from the standard engine downloads 16 files, about 15 MB, and reuses the rest |
| Quality model (Qwen3-TTS 1.7B Base) | 4.23 GB |
| Lightweight model (Qwen3-TTS 0.6B Base) | 2.34 GB (its 0.64 GB speech tokenizer is shared with Quality) |
| Microsoft Speech SDK 5.1 (optional; the original Microsoft Sam and Mary) | 0.07 GB, from Microsoft |
| Voice conversion for the sharper voice (optional, v2.44: WavLM-Large and kNN-VC's prematched HiFi-GAN) | 1.33 GB (1.26 GB and 66 MB), from the kNN-VC v0.1 release on GitHub |

## Quality and Lightweight

- **Quality (1.7B):**
  - closer to each voice, and fewer stumbles (odd pauses or misread words);
  - needs about 6.5 GB of free graphics memory on an NVIDIA card (about 6 GB of free memory on the processor);
  - on the processor, about half the speed of Lightweight.
- **Lightweight (0.6B):**
  - needs about 4 GB of graphics memory, a little over half of Quality's; on the processor it needs about as much memory as Quality (measured: up to 6 GB on a long message);
  - on the processor a little faster than Quality (measured: about 5.7 against 6.7 seconds per second of speech); on a graphics card the two take about as long (the published figures below are the same for both sizes);
  - the voices are a little less like the originals, and odd pauses happen more often. Tyler retries a take whose length is far off what the text needs.

**Speed.** Theme voices are made before they play, not live. Published measurements of this model's standard code path (the faster-qwen3-tts project's README, not measured by us) put an RTX 4060 on Windows at about 4 seconds per second of speech and an RTX 4090 at about 1.2 seconds, for both sizes. On this project's 2-core test machine without a graphics card, with nothing else running, Quality took about 7 seconds per second of speech and Lightweight about 6 (both in bfloat16, as on a PC with less than 12 GB of memory).

Tyler suggests a mode from the hardware it detects (the GPU and its free memory, the driver, system memory). It never switches mode (Quality or Lightweight) by itself.

### Runs on (v2.44)

Settings → Theme voices → **Runs on** has three choices:

- **Graphics card, or the processor when it's full** (the default).
  - Each time Tyler loads the voice model on the card, it first checks the card's free memory against the mode's need: about 4.0 GB for Lightweight and 6.5 GB for Quality, the weights plus room for speaking. At least 85% of that has to be free.
  - The free memory is read twice: from NVIDIA's `nvidia-smi`, and by the engine itself just before loading (`torch.cuda.mem_get_info`).
  - If it doesn't fit, or loading or speaking runs out of graphics memory, the same model loads on the processor, with the standard engine (the fast engine needs the card). The voice and model are the same; nothing else changes.
  - A clip that ran out of memory while speaking is made once more on the processor. If that fails too, the message fails with the reason.
  - The note says why, for example: *"The graphics card was full (1.2 GB free, the voice needs about 4.0 GB), so this voice runs on the processor: much slower. The card is tried again the next time the engine starts."* It shows in Settings (the status line and the made-speech line), on the panel, on the clip line and on the phone remote.
  - The processor stays in use until the engine closes (the idle time, or *Close the engine now*); the next load checks the card again.
  - The old label, "Graphics card when possible, else the processor", only meant "no card", not "card full". This choice now does what that label said.
- **Graphics card only (stops with a message if full):** exactly the behaviour before v2.44. A full card or an out-of-memory error stops the message with the reason, and nothing moves to the processor.
- **Processor only (keeps the graphics card free):** unchanged.

**For other local AI on the same card:** `hardware.vramNeed(settings)` and the service's `vramReserve()` are read-only. They give how much graphics memory theme voices want kept free: the mode's need, plus about 1.3 GB while a sharper voice is on and installed, or 0 with *Processor only* or a processor-only engine. `vramReserve()` also says whether a voice model is on the card right now.

## The fast engine (v2.36, NVIDIA only)

- **What it is:** [faster-qwen3-tts](https://github.com/andimarafioti/faster-qwen3-tts) 0.5.4 (MIT licence). It runs the same Qwen3-TTS Base models with the same voices, but captures the model's steps as CUDA graphs and makes speech in short streamed chunks (12 frames, about a second each). It needs a CUDA graphics card; on the processor it brings nothing.
- **Choosing it:** Settings → Theme voices → **Engine: Fast**, then **Switch to the fast engine**. It's opt-in: Tyler suggests it on a PC with a usable NVIDIA card but never switches by itself. With **Processor only** the standard engine is used.
- **What's installed:** its own engine folder from the same lock (`windows-cuda-fast`): the same PyTorch 2.11 + CUDA 12.8 wheel, `qwen-tts-hf` 0.1.1.post1 (Apache-2.0: a Transformers 5 build of the `qwen_tts` package), `faster-qwen3-tts` 0.5.4, and Transformers pinned to **5.15.1** (qwen-tts-hf fails with 5.20.2 and 5.22.1: measured). Both engine packages are installed without their dependency lists (qwen-tts-hf's would add a Gradio demo); the packages they need are in the lock. Every file is checked by SHA-256 like the rest.
- **Switching** downloads only the files that differ (about 15 MB) and copies the rest from the installed engine. Switching back works the same way. The old engine folder is removed once the new one works.
- **When it can't run** (out of graphics memory, or the CUDA graphs can't be captured on that card), the message fails and says so, naming the standard engine as the way back. Tyler doesn't switch engines by himself. Since v2.44, with the default *Runs on* (the card, or the processor when it's full), running out of graphics memory moves the voice to the processor with the standard engine instead, and says so (see *Runs on*); a card that can't capture the graphs still fails as before.
- **Speed (published, not measured by us):** the faster-qwen3-tts README gives, for an RTX 4060 on Windows, about 1.8 seconds of speech made per second with the 1.7B model (first audio after 0.46 s) and 2.3 with the 0.6B (0.41 s), against about 0.23 for the standard code path; an RTX 4090 makes about 4.2. How fast it is on your card is what **Run a voice check** shows.
- **What's tested here:** no NVIDIA card was available. The fast engine's own streaming code was run on the processor (its CUDA-graph-free parity mode, `TYLER_FAST_PARITY=1`) through Tyler's worker, with the installer-built Linux engine; Whisper heard the right words. The CUDA graphs themselves, the speed and the memory on a real card are untested until you run a voice check.

## Tyler's spoken replies (v2.36, desktop app)

- **Settings → Voice → Standard voice → Speaking voice:** *Cloud voice* (the default: Grok or Gemini speech, as before) or *Theme voice on this PC*.
- **With a theme voice,** Standard voice replies are made by the local engine in the voice Theme voices would use (the current theme's, or the one you picked there). The first sentence is made while the rest is still being written (*Start speaking sooner*). A long reply is spoken as a few clips of whole sentences, played one after another (one clip plays at most 30 seconds).
- **Speed:** with the fast engine on an NVIDIA card a reply should take about as long as it lasts, or less (from the published figures above). With the standard engine expect several seconds per second of speech, and on the processor much longer; it works, but it's slow for a conversation.
- **When it can't speak** (not installed, the model doesn't fit, Chrome instead of the desktop app…), Tyler answers in text and says why. He never switches to the paid cloud voice by himself.
- **Stop** (or someone talking over Tyler) calls off the voice being made for that reply; other theme-voice messages carry on.
- **Gemini Live** is unchanged: its native-audio models only speak in Google's own voices.
- **Usage:** replies in a theme voice are counted separately (`themeSpeechResponses`), not as billed speech.

## Using them

- **Steam panel → Theme voices:**
  - Follow the theme, or pick a voice;
  - a text box, then Generate, Preview (only you hear it), Play into call, Stop, Replay and Save.
- **How playback works:**
  - The voice is chosen when you press the button, so a theme change doesn't alter a message already on its way.
  - *Play into call* uses Tyler's existing synthetic microphone. It's queued after anything he's already saying, so nothing overlaps, and his listener holds while he talks.
- **`!say TEXT`**, **`!say portal TEXT`** or **`!say portal: TEXT`** in chat (v2.37.2: the voice's name works without the colon when it's the first word):
  - off by default;
  - everyone or listed Steam accounts;
  - a wait time per person.
- **Phone remote → Theme voice:** the phone sends only the text and the voice name. The voice is made on the PC.
- **Engine lifecycle:** the model loads on first use. The engine closes after the idle time you choose (1–30 minutes, or never), which gives back all of its memory.
- **Caching:** made clips are cached, so Replay and repeated lines are instant.
- **Steam text chat:** voice messages aren't posted as files. Steam web chat has no voice-message feature, and its uploader only takes pictures and videos (jpg, jpeg, png, gif, webp, avif, webm, mp4, mpg, mpeg, ogv; checked in Steam's chat code). Sending speech disguised as a video wasn't tried and isn't offered.

## Character voices (v2.41, optional; built in since v2.43)

Six themes can also speak as one of their characters. The theme's own voice stays the default. Since v2.43 their recordings ship with the app: once theme voices are installed, every offered character can speak, with nothing to download or import.

| Theme | Its own voice (default) | Character voices |
|---|---|---|
| Team Fortress 2 | The Administrator | Scout, Soldier, Pyro, Demoman, Heavy, Engineer, Medic, Sniper, Spy |
| Counter-Strike 2 | SAS operator | Phoenix and Leet (faction voices: a faction's radio voice, not a named agent; the recordings are inherited from CS:GO) |
| Portal | GLaDOS (Portal 1) | Wheatley, Cave Johnson (Portal 2 characters: an association) |
| Left 4 Dead | Bill | Coach, Ellis (Left 4 Dead 2), Zoey |
| Deadlock | Bebop | Abrams, Dynamo, Haze, Infernus, Ivy, Kelvin, Lash, Rem, Seven, Shiv, Venator, Warden, Wraith |
| Garry's Mod | Dr. Kleiner | Alyx Vance (a Half-Life 2 association, like Dr. Kleiner) |

- **No repeats.** A character that is already a theme's own voice isn't offered again: the pack's Administrator, SAS, GLaDOS, Bill, Bebop, Kleiner and US field-radio folders, and its G-Man (Steam's own voice), went into the quality pass on those voices instead. No character is in two themes and no recording is used twice (checked by SHA-256 against this pack, the first pack and the built-in voices).
- **Left out:** Day of Defeat's German field-radio bank. A speaker-model screen found at least two voices in it (the radio lines and the shouted orders), and it's in German, which the local transcriber can't write down, so it isn't a single-speaker reference.
- **Built in (v2.43).** The recordings are part of the desktop app: the 196 original clips the catalog uses (every reference clip and every *Original recording* clip of every version, from both of the owner's packs), about 15 MB of FLAC, byte for byte as in the packs. They're in `app/theme-voices/characters/<theme>/<character>/<sha256>.flac`, unpacked from `app.asar` like the 25 voices' references (`asarUnpack` in `electron-builder.desktop.json`), so the separate Python voice worker reads them where they are: nothing is copied at first use. Each clip is checked by its size and SHA-256 before it's used. The installer is about 15 MB larger. v2.44 adds 40 more (3.2 MB): the rest of the sharper voice's matching recordings for Medic, Lash and Kelvin (below), so 236 clips, about 17.8 MB.
- **Before v2.43** the recordings came from the owner's packs, imported with **Import character voices** into `ThemeVoices\characters\`. Such an import keeps working; its copies of clips that are now built in are removed once the built-in clip checks out, so nothing is kept twice. Picks and version choices are settings and stay.
- **Import character voices** stays as a second way: it repairs a built-in recording that is missing or damaged, or adds recordings this version lists. Give the character voice pack or the voice supplement (its folder or its ZIP, or a folder holding both). Tyler reads only the clips this version lists, checks each one's path, size, FLAC header and SHA-256, and copies it into `ThemeVoices\characters\<theme>\<character>\` only if it isn't already here: a clip that is built in (or imported before) and unchanged is never copied again, so importing the packs anyway changes nothing. **Remove imported copies** (shown only when there are some) deletes only those copies; the built-in recordings can't be removed. Remove theme voices keeps imported copies, like your own recordings.
- **Choosing one:** Settings → Theme voices → **Character voice** (one selector per theme), or the phone remote's Theme voice card. The choice is remembered for each theme separately. **Original recording** plays one of the character's own game lines (one that isn't in its reference); **Generated speech** makes new speech with the clone.
- **In chat:** `!say tf2/scout TEXT` (or `tf2/scout: TEXT`) uses a character for that one message; only an exact *theme/character* pair counts, so ordinary words are never taken for a voice. `!say TEXT`, `!say portal TEXT` and `!say portal: TEXT` work as before (and use the theme's picked character).
- **One speaker per message:** the theme and the character are taken when a message starts, so changing them meanwhile doesn't change a message on its way. A spoken reply made in several parts takes them once for all its parts.
- **Fallback, never silent:** if one of the picked character's recordings is missing, changed or damaged (for a built-in one, the app's files are damaged: run the Setup again to repair them), its earlier version speaks if it has one that can, and says so (*Earlier version (v1): the improved version (v2) can’t be used (one of its built-in recordings is damaged: run the Setup again to repair the app)*). Otherwise, or if it didn't pass its test, the theme's own voice speaks and the panel, Settings, the phone and the clip say which character couldn't be used and why. Settings' status line counts the characters with a missing or damaged built-in recording.
- **What each one is:** a catalog in the app (`app/theme-voices/characters.json`; the audio is beside it, in `characters/`) lists each character's stable *theme/character* ID, its reference clips with their exact text (machine transcripts, a few corrected where Whisper clearly misheard; not checked by listening; Pyro has none, as his lines are non-lexical), whether it uses only the sound of the voice (Pyro and Heavy), its level and effects (none), its readiness and the scores measured for it.
- **Caches** are keyed by the model, the theme, the character, the SHA-256 of every reference clip, the transcript, the mode, the effects, the level and the profile version, so a changed recording or text is never answered from an old clip.
- **Readiness (v2.41, measured on a processor with the Lightweight model, not by ear):** 28 of the 30 are offered. 16 are rated *ready* (Engineer, Phoenix, Leet, Wheatley, Cave Johnson, Ellis, Alyx and nine Deadlock heroes), 11 *weak* (seven TF2 classes with only 5–7 s of game lines each, Coach, Zoey, Lash, Seven, Venator) and Kelvin an *approximation*. **Pyro and Medic aren't offered yet**: Pyro's clone speaks words clearly, which Pyro never does, and was barely more like him than another voice; Medic's test was unreliable (his few recordings are shouts that the speaker model rates as unlike each other). They show as *not approved*, and picking one keeps the theme's voice with that reason. The scores, and how they were measured, are in the v2.41 notes (CHANGES.md). **Since v2.42** 29 are offered: Medic is too (*weak*). With the voice supplement, 18 are *ready* (Coach and Seven too) and 11 *weak* (Kelvin too); Pyro still isn't offered. See *The voice supplement* below. **Since v2.43** both packs' clips are built in, so that is what every install has: Settings says *30 character voices built in (29 offered)*.

### The voice supplement (v2.42; built in since v2.43)

The owner's second pack, `Robotic-Tyler-Complete-Voice-Supplement.zip`, adds 213 original clips (9 minutes) for the 14 characters that were *weak*, an *approximation* or not offered: Kelvin, Lash, Seven and Venator; Coach and Zoey; and Demoman, Heavy, Medic, Pyro, Scout, Sniper, Soldier and Spy. None of its clips is in the first pack, the built-in voices or another character (checked by SHA-256).

- **Importing it (v2.42 only; since v2.43 its clips are built in):** the same **Import character voices** button. Give the supplement's folder or ZIP, before or after the first pack, or one folder that holds both packs (unpacked, or as their ZIPs). What is already imported stays, so each pack is imported once. Only the clips this version lists are read and checked (path, size, FLAC header, SHA-256). This version lists 30 of the supplement's clips (about 2.7 MB: the ones the improved voices use); with the first pack's that's about 15 MB, under the 64 MB limit per import (unchanged).
- **Versions:** each character keeps its v2.41 voice as **version 1**, which needs only the first pack. A character the supplement measurably improved gets a **version 2**, and that is the one it uses. Since v2.43 both versions are built in, so the improved voices use version 2 from the start; if one of version 2's recordings is missing or damaged, version 1 speaks and says why. In v2.42, without the supplement, it spoke its version 1 and says so: *Earlier version (v1): import the voice supplement for the improved version (v2)*, in Settings (on its row and in the status line), on the panel, in the clip's note and on the phone remote. A character that is offered only in its version 2 isn't offered without the supplement, and the reason is shown. Never a silent switch.
- **Rollback:** *Use the earlier version*, under the character's note in its theme's row, goes back to version 1 (remembered per character), and *Use the improved version* goes forward again, like the built-in voices.
- **Caches:** a version's cache key includes every clip's SHA-256, its text and its version, so versions 1 and 2 never share a conditioning file or a cached clip (a version 2 may reuse some of version 1's recordings).
- **How the improvement was decided** (no listening: the owner asked for it to be decided by the scores): the same rules as the v2.41 polish pass. For each character, two candidates (C1: a subset of the supplement's clips with checked text; C2: the v2.41 reference plus a few of them) were compared with version 1 on the same four new sentences and seeds, through the app's own worker, against held-out real recordings that no reference uses (v2.41's held-out clips plus held-out supplement clips). A candidate is promoted only if it is at least +0.03 closer overall, not less close on either group of held-out recordings, closer on at least 3 of 4 sentences and no less intelligible (word accuracy at most 0.03 lower, no sentence below 0.75), on two seeds, and not less close on the 1.7B Quality model. Processor time is reported but, unlike in the v2.41 polish pass, isn't a rule: that change was made after the first seed's scores were seen, because the task's rules didn't include it and the same unchanged voice (Seven's version 1) measured 7.7 and 6.4 s per second of speech on two seeds on this test machine. A longer reference does make a voice slower on a processor; that is shown for each voice below.
- **The result** (measured, not by ear; the full table with every score is in the v2.42 notes):
  - **Improved, with the supplement: Coach, Seven, Zoey, Kelvin and Venator** (their version 2, built in since v2.43). In v2.42, without the supplement, each spoke its version 1 and said so.
    - **Coach** (*weak* → *ready*): his v2.41 reference plus 3 supplement clips (7.4 s, Whisper text). Likeness 0.435 → 0.595 on seed 1; +0.084 on seed 2; +0.082 on 1.7B.
    - **Seven** (*weak* → *ready*): 9 supplement clips (24 s, the game's captions checked against Whisper) in place of the v2.41 reference. 0.543 → 0.661; +0.158; +0.110.
    - **Zoey** (stays *weak*): 6 supplement clips (20 s, Whisper text) in place of the v2.41 reference. 0.429 → 0.508; +0.037; +0.083.
    - **Kelvin** (*approximation* → *weak*): 8 supplement clips (22 s, captions checked against Whisper) in place of the v2.41 reference. 0.471 → 0.538; +0.125; +0.101.
    - **Venator** (stays *weak*): his v2.41 reference plus 4 supplement clips (11 s, captions checked against Whisper). 0.481 → 0.512; +0.074; +0.042. The smallest gain that passed.
    - Word accuracy stayed 1.00 for all five. The longer references take 1.2–1.6× the processor time.
  - **Medic is offered now** (*weak*), with his unchanged v2.41 voice, which needs only the first pack.
    - v2.41's test couldn't rate him: even his own reference scored only 0.34 against its two held-out recordings.
    - The supplement's 8 held-out recordings of him do agree with his reference (0.60; another voice 0.16). Against them, version 1 scores 0.42 and 0.40 on two seeds, a likeness ratio of 0.59 and 0.53.
    - No supplement version of him passed, so none is used.
  - **Unchanged, the other 8:**
    - Scout, Soldier, Demoman, Heavy, Spy and Lash: no candidate passed. That includes Soldier with his v2.41 reference plus the supplement's whole 4.5 s.
    - Sniper and Pyro: a candidate passed on one seed but not the other.
    - **Pyro still isn't offered:** his version 1's likeness ratio is 0.09 and 0.27 (it needs 0.15 on both), and no transcript is invented for him.

### The sharper voice (v2.44, experimental, optional)

For three of the weak voices, Medic, Lash and Kelvin, Tyler can also run the generated speech through voice conversion. It's off until the owner switches it on for that character, and it needs a separate download.

- **What it does:** kNN-VC (Baas, Kamper and Shall, 2023; [bshall/knn-vc](https://github.com/bshall/knn-vc), MIT).
  - Qwen3-TTS makes the take as usual.
  - Each moment of it (WavLM-Large layer-6 features, 50 a second) is replaced by the mean of its 4 closest moments among the character's own recordings.
  - kNN-VC's HiFi-GAN vocoder, trained on prematched features, turns that back into sound at 16 kHz. Tyler resamples it to 24 kHz and levels it like every voice.
  - Nothing is trained. Qwen3-TTS only listens to a 5–25 s reference; this uses every recording of the character the app has.
- **The matching recordings are built in**, in the same layout and with the same size and SHA-256 checks as the reference clips (`matching` in `characters.json`).
  - It's exactly the measured set: every clean recording of the character in both of the owner's packs, minus the ones held out to score against. That's Medic 10 clips (30.6 s), Lash 23 (63.1 s) and Kelvin 27 (64.5 s).
  - The held-out recordings were left out on purpose, so the shipped voice is the one that was measured and the held-out set stays a fair test for later.
  - 20 of these clips were already built in (references and previews). The other 40 add 3.2 MB to the installer. They were taken from the owner's two uploaded ZIPs by exact path and checked against the packs' SHA-256 values.
- **The evidence:** the same test as the v2.42 re-tune. The current voice and the same take converted (k=4) were scored on four sentences and two seeds against held-out recordings, by a speaker model (ECAPA) and Whisper. **No one listened.**
  - **Medic, measured closer:** likeness 0.42 → 0.51 and 0.40 → 0.51, closer on every sentence, words 1.00.
  - **Lash, nearly:** much closer (0.34 → 0.51, 0.35 → 0.52), but on one seed one word came out unclear ("microphone" heard as "micro song").
  - **Kelvin, nearly:** 0.54 → 0.64 and 0.59 → 0.64, but on one seed 0.001 less close to his first pack's held-out recordings.
  - **Venator** didn't gain (+0.03 and +0.02) and isn't offered.
  - **A control:** the same takes converted with another character's recordings scored well below the current voice, so the gain is the character's own voice and not "a recording from the game".
  - These measurements can't tell how it sounds: artefacts, 16 kHz, and the little audio there is (24–49 s after trimming, where the method's authors suggest several minutes).
- **The download:** Settings → Theme voices → *Download voice conversion* shows its size (1.33 GB) and the free disk space first, and downloads only when pressed.
  - It's pinned in `engine-lock.json` (`components.knnvc`: the kNN-VC v0.1 release's `WavLM-Large.pt` and `prematch_g_02500000.pt`, each with its size and SHA-256), fetched with the installer's resumable, checked downloader, and kept in `ThemeVoices\components\knnvc-<revision>\` (recorded in `components.json`).
  - *Remove voice conversion* deletes only that folder, its record and any unfinished download. The switches and everything else stay.
  - *Check and repair files* also checks its SHA-256s. A damaged file is deleted, and the owner is told to download it again.
  - **Licences:** the kNN-VC code and the vocoder are MIT. WavLM-Large is Microsoft's. The Hugging Face model card for `microsoft/wavlm-large` links its official licence to [microsoft/UniSpeech `LICENSE`](https://github.com/microsoft/UniSpeech/blob/main/LICENSE). That file's heading is Creative Commons Attribution-ShareAlike 3.0 Unported, read from GitHub at 2026-11-07 00:24 UTC (6 Nov 2026, 18:24 America/Chicago). The `microsoft/unilm` `wavlm` folder has no licence file of its own. The app does not redistribute the weights: it downloads them from the kNN-VC v0.1 release when you press the button. Whether ShareAlike fits that optional download is the owner's decision. This guide does not clear it.
- **The code** is vendored in the worker folder, so nothing is downloaded as code:
  - `knnvc_wavlm.py` is Microsoft's WavLM (MIT) as kNN-VC ships it. `knnvc_hifigan.py` is the generator kNN-VC adapted from jik876/hifi-gan (MIT). Each keeps its copyright and MIT notice.
  - The worker loads them by their exact path and loads both checkpoints with `torch.load(weights_only=True)`.
- **When it runs:** in the voice worker after Qwen3-TTS, on the same device (the graphics card when the voice model is on it, otherwise the processor).
  - WavLM loads on first use and goes when the worker closes (the idle timer).
  - The matching recordings' features are made once and cached as safetensors (tensors only), keyed by the WavLM checkpoint's SHA-256, the settings and every clip's SHA-256.
  - A clip's cache key adds the conversion (the component's revision and both checkpoints' SHA-256, k=4, the prematched vocoder, the matching clips), so a converted clip and a normal one never stand in for each other.
  - Stop, an interrupted reply, the emergency stop and quitting end it like generation: it checks between steps, and Stop closes the engine if a step takes longer than 4 s.
- **The cost** (measured on this project's 2-core test PC, processor, Lightweight model):
  - **Time:** 0.35 s more per second of speech in the experiment (2 threads); 0.57–0.65 s in the app, which gives the engine one thread on a 2-core PC. That's 5–7% on top of Qwen's own time there.
  - **First use:** the first conversion after the engine starts also loads WavLM (about 4 s). Once per character it also makes its matching recordings' features (about 5 s; cached after that).
  - **Memory:** about 1.7 GB more (+1.7 GB in the worker after its first conversion). WavLM is memory-mapped from its checkpoint; a plain load measured +2.4 GB. On the processor Tyler doesn't try it with less than about 1.4 GB free.
- **Never silent:** if it's on but can't run, the character's normal voice speaks and says why, in its Settings row, on the panel and clip line, and on the phone remote. That covers not installed, a matching recording missing or damaged, too little free memory, or the conversion failing. A failed conversion's take is filed as the normal clip, so the next message tries again.

### The polish pass on the theme's own voices (v2.41)

The pack also brought new recordings of nine default voices (the Administrator, SAS, GLaDOS, Bill, Bebop, Kleiner, G-Man's Episode Two lines, the HEV suit and Black Mesa VOX). For each, two reference candidates (a subset of new recordings with checked text, and the current reference plus a few new ones) were compared with the current reference: the same four new sentences, the same seed, through the app's own worker, scored against held-out real recordings that no reference uses.

- **No voice changed.** No candidate beat its baseline by the rules set before scoring. Kleiner's new subset was closer on the Lightweight model on two seeds but less close on the Quality model, so it's inconclusive and the v2.40 voice stays. G-Man's Episode Two lines are a different edition: closer to Episode Two, less close to the Half-Life 2 G-Man that is the default, so switching editions is left to the owner.
- **Not compared:** Day of Defeat (the new US lines are other speakers by the speaker-model screen, and no unused recording of the current radio voice is left to test against); Rust (no source); Ricochet (one 0.213 s fragment, never used); Sam, Mary and Alex (only the earlier renders and demo); CS 1.6, DOOM, Quake, Dreamcast, Minecraft, Xbox 360 and PS3 (the pool holds only the first pack's own files; not run for time).
- **Built-in versions:** a built-in voice that is improved later keeps its earlier version in `voices/<theme>/v1/`, and *Use the earlier version* in Settings goes back to it. None is needed in v2.41.

## Security

- **The engine:** a separate process started isolated (`-I -S`, a minimal environment) and connected only by pipes to the desktop app. There's no network listener.
- **The phone remote** gets fixed actions (say text, stop and, since v2.41, pick a theme's character voice) through the Steam window, never the engine.
- **Built-in character recordings** (v2.43) are read only from the app's own `characters/` folder, at the catalog's `<theme>/<character>/<sha256>.flac` paths, and used only when the size and SHA-256 match the catalog (a link or a changed file counts as damaged).
- **Imported character recordings** are only ever read from the catalog's own paths (`themes/<theme>/<character>/cleaned/<name>.flac`): no links, no `..`, no file outside the pack, each one at most 4 MB and 64 MB in all per import; in a ZIP, an entry must declare the catalog's exact size and is never inflated beyond it. A folder may hold at most four pack ZIPs (`Robotic-Tyler-*.zip`), each at most 2 GB. A clip is kept only if its SHA-256 matches, whichever pack it was found in.
- **Large files** (engine, models, clips) live in the ThemeVoices folder, outside the settings store.
- **Cached voice conditioning** is stored as safetensors (tensors and text only), keyed to the model and the reference's SHA-256. Nothing is loaded with pickle, and references supplied by users are accepted only as audio files.

## The voices

- **The pack:** the 25 proposed voices and their sources come from the reference pack, `Robotic-Tyler-25-Theme-Voice-References.zip`.
- **Each voice's folder** (`app/theme-voices/voices/<theme>/`) holds:
  - `reference.flac`: the selected original clips, each with its silence trimmed, joined 0.3 s apart, 24 kHz mono, nothing else changed;
  - `sample.flac`: the familiar line's original recording, for *sample playback* comparisons only;
  - `profile.json`: the choice, provenance (repository path or archive member, SHA-256), the transcript and the status.
- **Transcripts** are Whisper machine transcripts, corrected where they clearly misheard. They were not checked by listening.
- **Readiness:** see the readiness table in the v2.35 notes (CHANGES.md).

## Testing

- **Mocked** (`tests/theme-voices.test.mjs`, `tests/theme-speech.test.mjs`, v2.41 `tests/character-voices.test.mjs` and `tests/e2e/character-voices.e2e.mjs`): no model and no internet. Since v2.43 they use the app's own built-in clips (and damaged copies of them), and `tests/release.test.mjs` checks they are packaged unpacked from `app.asar`. Downloads come from a local server, the engine is a stand-in that writes a tone, and spoken replies use a fake local engine (checking that the cloud voice is never called).
- **Real:**
  - Qwen3-TTS inference on a Linux processor in the development container: 1.7B and 0.6B, through the production worker and the installer-built engine;
  - Whisper, ECAPA and WavLM scoring;
  - v2.36: the fast engine installed with the app's installer from the new lock (Linux, processor), its streaming code run in parity mode through the worker, and the service making and stopping a spoken reply on it.
  - v2.41: every new character and every polish candidate, 0.6B on the processor (a 1.7B subset too), through the app's worker; the app's service importing the real pack (ZIP and folder) and speaking as a character, with the cache, the one-speaker reply and the fallback.
  - v2.43: a real Linux `--dir` package of `electron-builder.desktop.json`: its `app.asar` marks all 196 clips as unpacked and they are byte-identical; the packaged app's own `desktop.cjs` (run under Electron as Node) and the real worker with the 0.6B model spoke Coach (version 2) and Scout (version 1) from `app.asar.unpacked` with no import, and Coach's version 1 with its note when one of his version-2 clips was damaged.
- **Not tested here:**
  - a Windows install;
  - NVIDIA GPU speed and memory, and the fast engine's CUDA graphs;
  - playback in a real Steam call;
  - the native Microsoft Sam and Mary route;
  - Setup's new option on Windows;
  - v2.41: importing the pack on Windows and character voices on a graphics card, and any listening review of the new voices.
  - v2.43: the Windows installer itself (the *Theme voices on Windows* workflow now checks the built-in clips at an installed app's kind of path, with spaces and an accent, a damaged clip and a repair by import; it wasn't run for this change).

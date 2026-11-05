# Theme voices (v2.35; the fast engine and spoken replies since v2.36)

Tyler can say typed messages in each theme's character voice. The voices are **clones made on your PC**
by a local model (Qwen3-TTS Base). There's no account, key or cost per message. Theme voices are
**optional**: the normal install doesn't include them, and Tyler's usual voice (Standard voice and
Gemini Live) works the same with or without them. Since v2.36 you can also choose to have Tyler's
spoken replies made in the theme voice (see *Tyler's spoken replies* below); that's off unless you pick it.

## Getting them

| Choice | What you get |
|---|---|
| **Standard installation** (Setup's default) | The usual desktop app. No voice engine, models, Python, PyTorch or GPU files are downloaded or bundled. |
| **Standard app + local theme voices** (Setup: *Also add local theme voices*) | The same app, then a guided step in Settings → Voice → Theme voices. It shows this PC's compatibility, the download size and disk space, and Quality vs Lightweight. Nothing downloads until **Install now**. |

You can also install them later from **Settings → Voice → Theme voices → Install theme voices**.

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

Tyler suggests a mode from the hardware it detects (the GPU and its free memory, the driver, system memory). It never switches by itself. If the model doesn't fit right now (for example a game is using the graphics memory), the message fails and says so, rather than quietly using the other model.

## The fast engine (v2.36, NVIDIA only)

- **What it is:** [faster-qwen3-tts](https://github.com/andimarafioti/faster-qwen3-tts) 0.5.4 (MIT licence). It runs the same Qwen3-TTS Base models with the same voices, but captures the model's steps as CUDA graphs and makes speech in short streamed chunks (12 frames, about a second each). It needs a CUDA graphics card; on the processor it brings nothing.
- **Choosing it:** Settings → Voice → Theme voices → **Engine: Fast**, then **Switch to the fast engine**. It's opt-in: Tyler suggests it on a PC with a usable NVIDIA card but never switches by itself. With **Processor only** the standard engine is used.
- **What's installed:** its own engine folder from the same lock (`windows-cuda-fast`): the same PyTorch 2.11 + CUDA 12.8 wheel, `qwen-tts-hf` 0.1.1.post1 (Apache-2.0: a Transformers 5 build of the `qwen_tts` package), `faster-qwen3-tts` 0.5.4, and Transformers pinned to **5.15.1** (qwen-tts-hf fails with 5.20.2 and 5.22.1: measured). Both engine packages are installed without their dependency lists (qwen-tts-hf's would add a Gradio demo); the packages they need are in the lock. Every file is checked by SHA-256 like the rest.
- **Switching** downloads only the files that differ (about 15 MB) and copies the rest from the installed engine. Switching back works the same way. The old engine folder is removed once the new one works.
- **When it can't run** (out of graphics memory, or the CUDA graphs can't be captured on that card), the message fails and says so, naming the standard engine as the way back. Tyler doesn't switch engines by himself.
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
- **`!say TEXT`** or **`!say portal: TEXT`** in chat:
  - off by default;
  - everyone or listed Steam accounts;
  - a wait time per person.
- **Phone remote → Theme voice:** the phone sends only the text and the voice name. The voice is made on the PC.
- **Engine lifecycle:** the model loads on first use. The engine closes after the idle time you choose (1–30 minutes, or never), which gives back all of its memory.
- **Caching:** made clips are cached, so Replay and repeated lines are instant.
- **Steam text chat:** voice messages aren't posted as files. Steam web chat has no voice-message feature, and its uploader only takes pictures and videos (jpg, jpeg, png, gif, webp, avif, webm, mp4, mpg, mpeg, ogv; checked in Steam's chat code). Sending speech disguised as a video wasn't tried and isn't offered.

## Security

- **The engine:** a separate process started isolated (`-I -S`, a minimal environment) and connected only by pipes to the desktop app. There's no network listener.
- **The phone remote** gets two fixed actions (say text, stop) through the Steam window, never the engine.
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

- **Mocked** (`tests/theme-voices.test.mjs`, `tests/theme-speech.test.mjs`): no model and no internet. Downloads come from a local server, the engine is a stand-in that writes a tone, and spoken replies use a fake local engine (checking that the cloud voice is never called).
- **Real:**
  - Qwen3-TTS inference on a Linux processor in the development container: 1.7B and 0.6B, through the production worker and the installer-built engine;
  - Whisper, ECAPA and WavLM scoring;
  - v2.36: the fast engine installed with the app's installer from the new lock (Linux, processor), its streaming code run in parity mode through the worker, and the service making and stopping a spoken reply on it.
- **Not tested here:**
  - a Windows install;
  - NVIDIA GPU speed and memory, and the fast engine's CUDA graphs;
  - playback in a real Steam call;
  - the native Microsoft Sam and Mary route;
  - Setup's new option on Windows.

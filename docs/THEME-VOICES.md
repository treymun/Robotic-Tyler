# Theme voices (v2.35)

Tyler can say typed messages in each theme's character voice. The voices are **clones made on your PC**
by a local model (Qwen3-TTS Base). There's no account, key or cost per message. Theme voices are
**optional**: the normal install doesn't include them, and Tyler's usual voice (Standard voice and
Gemini Live) works the same with or without them.

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
| Quality model (Qwen3-TTS 1.7B Base) | 4.23 GB |
| Lightweight model (Qwen3-TTS 0.6B Base) | 2.34 GB (its 0.64 GB speech tokenizer is shared with Quality) |
| Microsoft Speech SDK 5.1 (optional; the original Microsoft Sam and Mary) | 0.07 GB, from Microsoft |

## Quality and Lightweight

- **Quality (1.7B):**
  - closer to each voice, and fewer stumbles (odd pauses or misread words);
  - needs about 6.5 GB of free graphics memory on an NVIDIA card (about 8 GB of free memory on the processor);
  - on the processor, about half the speed of Lightweight.
- **Lightweight (0.6B):**
  - needs about half the memory;
  - on the processor about twice as fast as Quality; on a graphics card the two take about as long (the published figures below are the same for both sizes);
  - the voices are a little less like the originals, and odd pauses happen more often. Tyler retries a take whose length is far off what the text needs.

**Speed.** Theme voices are made before they play, not live. Published measurements of this model's standard code path (the faster-qwen3-tts project's README, not measured by us) put an RTX 4060 on Windows at about 4 seconds per second of speech and an RTX 4090 at about 1.2 seconds, for both sizes. On this project's 2-core test machine without a graphics card it was 6 to 20 seconds per second of speech.

Tyler suggests a mode from the hardware it detects (the GPU and its free memory, the driver, system memory). It never switches by itself. If the model doesn't fit right now (for example a game is using the graphics memory), the message fails and says so, rather than quietly using the other model.

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

- **Mocked** (`tests/theme-voices.test.mjs`): no model and no internet. Downloads come from a local server, and the engine is a stand-in that writes a tone.
- **Real:**
  - Qwen3-TTS inference on a Linux processor in the development container: 1.7B and 0.6B, through the production worker and the installer-built engine;
  - Whisper, ECAPA and WavLM scoring.
- **Not tested here:**
  - a Windows install;
  - NVIDIA GPU speed and memory;
  - playback in a real Steam call;
  - the native Microsoft Sam and Mary route;
  - Setup's new option on Windows.

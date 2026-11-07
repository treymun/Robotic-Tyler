# AI on this PC

Tyler can run his AI on your own PC, with no key, no account and no cost per message. It's part of
the Windows desktop app and every part is optional: nothing is downloaded until you press its
**Install** button, and the cloud providers (OpenRouter, Google Gemini) work as before.

- **Text replies** (v2.38, stage 1): llama.cpp with a Qwen3.5 model. The first half of this page.
- **Hearing and a voice for calls** (v2.39, stage 2): NVIDIA Parakeet hears people in Standard voice
  calls and Kokoro speaks Tyler's replies, both through sherpa-onnx on the processor. See
  [Hearing and voice on this PC](#hearing-and-voice-on-this-pc-v239-stage-2).
- **Pictures** (v2.40, stage 3): stable-diffusion.cpp with Z-Image Turbo or Chroma1-HD (uncensored),
  for the chat's pictures. See [Images on this PC](LOCAL-IMAGES.md).

With all three on this PC, a Standard voice call needs no key at all, and nothing anyone says leaves
the PC. Gemini Live is unchanged: it always uses Google.

Both live in **Settings → On this PC** (it was called *Text AI on this PC* in
v2.38). The section shows once one of its parts is chosen or installed.

# Text replies (v2.38, stage 1)

## Turning it on

1. **Settings → AI & personality → AI provider → This PC (free, no key).** Then open the **On this
   PC** tab (since v2.41.1 it has a tab of its own).
2. Pick a model. Tyler suggests one for this PC (see *Which model*), but nothing installs or switches
   by itself.
3. The section shows the download size and the disk space needed before anything downloads. Press
   **Install**. **Stop installing** keeps what was downloaded, so **Retry** carries on from there.
4. **Run a speed check** to see how fast it is here: the time until the first word and tokens (word
   pieces) a second.
5. Press **Save settings** with *This PC* chosen. From the next reply, Tyler answers with it.

In Chrome the option isn't offered. If *This PC* is chosen anyway (for example in imported settings),
Tyler's replies fail with a message saying it's part of the desktop app; nothing else is asked.

## Which model

| Model | Download | Needs (8192-token context) | Licence | From |
|---|---|---|---|---|
| Qwen3.5 4B | 2.6 GB | about 3.6 GB of graphics memory, or 4.5 GB of memory on the processor | Apache-2.0 | `unsloth/Qwen3.5-4B-GGUF` @ `e87f1764…`, `Qwen3.5-4B-Q4_K_M.gguf` |
| Qwen3.5 9B | 5.3 GB | about 6.8 GB of graphics memory, or 8 GB of memory | Apache-2.0 | `unsloth/Qwen3.5-9B-GGUF` @ `3885219b…`, `Qwen3.5-9B-Q4_K_M.gguf` |
| Qwen3.5 4B uncensored | 2.5 GB | as the 4B | Apache-2.0 | `mradermacher/Huihui-Qwen3.5-4B-abliterated-GGUF` @ `9d3aebb9…` |
| Qwen3.5 9B uncensored | 5.2 GB | as the 9B | Apache-2.0 | `mradermacher/Huihui-Qwen3.5-9B-abliterated-GGUF` @ `419ca34f…` |

Sizes are as Windows shows them (1 GB = 1024³ bytes). The memory figures are estimates for the
file plus llama.cpp's working buffers; the speed check and the first reply show the real thing.

- **The suggestion:** the 9B when the graphics card has about 8 GB or more free, otherwise the 4B; on
  the processor, the 4B. Before the engine is installed, graphics memory comes from NVIDIA's
  `nvidia-smi` (total and free) or Windows' display-driver record (total only); afterwards from
  Vulkan itself, which gives every card's free memory. A graphics chip built into the processor
  isn't suggested (it shares the PC's memory).
- **Uncensored** versions are huihui-ai's "abliterated" Qwen3.5: the community removed the model's
  habit of refusing, so crude banter and hard roasts aren't turned down. That edit makes them a
  little less accurate. They're packed into GGUF files by mradermacher. Tyler's own chat rules
  (`CHAT_RULES`, the reminder after each message) and the protection against chat takeovers apply
  to every model, exactly as with the cloud providers. An uncensored model gets the same
  "uncensored model" note in its instructions as Venice Uncensored.
- None of these is as capable as the large cloud models: expect shorter, simpler banter.
- Qwen3.5 thinks before answering by default. Tyler turns that off (see *The engine*), so replies
  start straight away. Checked with b11669 and the 4B: with thinking on, a 120-token budget was spent
  entirely on thinking and the reply was empty; with it off, the answer came at once.

## The engine

llama.cpp's `llama-server`, release **b11669** (2026-10-15, MIT licence), from llama.cpp's own
GitHub release. Pinned in `app/local-ai/lock.json` with size and SHA-256:

| Build | File | Size |
|---|---|---|
| Windows | `llama-b11669-bin-win-vulkan-x64.zip` | 32,182,350 bytes |
| Linux (development and tests only) | `llama-b11669-bin-ubuntu-x64.tar.gz` | 17,851,611 bytes |

**One Windows download for both the graphics card and the processor.** The Vulkan build contains
every file of llama.cpp's CPU-only build, byte for byte (compared by size and CRC for all 50 files of
`llama-b11669-bin-win-cpu-x64.zip`), plus `ggml-vulkan.dll`. So Tyler downloads only the Vulkan
build. The installer keeps `ggml-vulkan.dll` in its own `gpu\` folder: llama.cpp loads it only when
Tyler points `GGML_BACKEND_PATH` at it (graphics card), so on *Processor only* the Vulkan driver
isn't touched at all. Vulkan covers NVIDIA, AMD and Intel cards with a current driver. CUDA builds
aren't used.

How Tyler starts it (`app/local-ai/server.cjs`):

```
llama-server -m <model.gguf> --host 127.0.0.1 --port <free port> -c 8192 -np 1 --jinja
  --reasoning off --chat-template-kwargs {"enable_thinking":false}
  --temp 0.7 --top-p 0.8 --top-k 20 --min-p 0 --presence-penalty 1.5
  --no-webui --no-slots --offline --cache-ram 0 --fit off -t <threads> -tb <threads>
  graphics card:  --device VulkanN -ngl all      (GGML_BACKEND_PATH=gpu\ggml-vulkan.dll)
  split (v2.44):  --device VulkanN -ngl <N>      (GGML_BACKEND_PATH=gpu\ggml-vulkan.dll; N worked out by Tyler)
  processor:      --device none -ngl 0
  --alias tyler-local --log-colors off
environment: a short allowlist (SystemRoot, TEMP, PATH, …) plus LLAMA_API_KEY=<new key>
```

- `--reasoning off` and the template switch each turn Qwen3.5's thinking off on their own (both
  checked); both are passed.
- The sampling values are Qwen3.5's own suggestion for replies without thinking. The request body
  stays clean: `messages`, `max_tokens`, `stream`, and a `temperature` only if Tyler sets one. None
  of OpenRouter's routing fields are sent.
- `--fit off`: llama.cpp mustn't shrink the context or move layers to the processor by itself. If
  the model doesn't fit, the start fails and Tyler says so.
- Threads: about the number of physical cores (half the logical processors, 1 to 16).
- On the graphics card, every layer goes on the one Vulkan card with the most free memory
  (a built-in graphics chip is only used when it's the only one).

## Runs on (v2.44: three choices)

**Settings → On this PC → Runs on**:

| Choice | What happens |
|---|---|
| **Graphics card: the whole model** (`auto`, the default; it was *Graphics card when possible*) | Exactly as before v2.44: every layer on the card. If the card's free memory is under 90% of the model's need when it starts (a game or a theme voice may be using it), the reply fails with the reason; nothing is moved to the processor. A PC where Vulkan never found a card runs on the processor and says so. |
| **Split between graphics card and processor** (`split`, new) | As many layers as fit go on the card and the rest run on the processor in the PC's memory. Slower than the whole model on the card, faster than the processor alone. |
| **Processor only** (`cpu`) | As before: no card at all, and the Vulkan backend isn't loaded. |

Any other saved value is read as `auto`. The setting belongs to the PC: the phone remote shows the
section as "set up on your PC" and can't change it (`localAI` isn't one of the settings it may write).

### Split between graphics card and processor

Written for a friend's PC where the text AI (llama.cpp, Vulkan) and a theme voice (Qwen3-TTS on CUDA)
share one NVIDIA card: whichever loaded first took the card's memory and the other failed.

- **When it's decided:** at each start of the engine (the first reply, after the idle close, after a
  model or setting change), from the free memory Vulkan reports for the card at that moment. A game
  that's running is already left out of that reading.
- **What's kept free on the card**, before any layer goes there:
  - **room for theme voices**, when they're installed with the graphics-card engine (CUDA, standard or
    fast) and their *Runs on* isn't *Processor only*: the theme voices' own figure (`vramReserve()` in
    `app/theme-voices/service.cjs`: their mode's need from `app/theme-voices/hardware.cjs`, Quality 6.5 GB
    or Lightweight 4 GB, plus 1.3 GB while a sharper voice is installed and switched on).
    If the voice engine is already loaded on the card, its model is already left out of the free
    reading, so only the rest of its need (what it uses while it speaks) is kept, not the whole model
    again. Tyler only reads the theme voices' settings and state for this; nothing of theirs changes.
  - **a safety margin of 1 GB** (the same as llama.cpp's own default for its automatic fitting), and
    **0.5 GB for llama.cpp's working buffers** on the card.
- **How many layers:** llama.cpp puts the output layer on the card first and then the repeating layers
  from the last one down, and it counts the output layer as one of them: Qwen3.5 4B and 9B have 32
  layers, so llama.cpp speaks of 33 ("offloaded 18/33 layers to GPU"). Tyler adds them up in that order
  until the next one wouldn't fit, using each layer's size from the pinned file's GGUF header plus its
  cache for the 8192-token context (`lock.json → models.*.layers`, read by
  `tools/local-ai/gguf-layers.cjs`). The context stays 8192 tokens.
- **The flags:** Tyler passes that exact number, `-ngl N`, and keeps `--fit off`. The pinned build also
  has llama.cpp's own fitting (`--fit on` with a per-card margin, `-fitt`); it was checked against
  Tyler's numbers (below) and chooses the same counts, but Tyler's own count is known before the start
  (so the note can say it), it includes the theme voice's room, it never lets llama.cpp change anything
  else by itself, and when no layer fits the engine starts with `--device none`, so Vulkan isn't even
  loaded.
- **Examples** (a 12 GB card with 0.9 GB used by Windows): the 9B beside a Quality theme voice: 18 of 33
  layers on the card; the 4B beside a Quality voice, or the 9B beside a Lightweight voice: the whole
  model fits; a game using 7 GB: 14 of 33 (9B) or 29 of 33 (4B); a game using 7 GB and a Lightweight
  voice, or an 8 GB card with a Quality voice: no layer fits.
- **If no layer fits** it runs on the processor, with the same model. If the start still runs out of
  memory (the card's memory changed, or Vulkan needed more than estimated), it's tried once more with
  about 60% of the layers; a second failure is the reason, and nothing else is tried. A card that was
  used before and has gone (a driver problem) is an error, as with *Graphics card*.
- **It's always said**, never done silently. The note, for example *"Split: 18 of 33 layers on the
  NVIDIA GeForce RTX 3060, the rest on the processor (slower than all on the card). Room is kept on the
  card for the theme voice (Quality, 6.5 GB)."*, shows in the Steam window's status line while it starts
  ("Starting the AI on this PC… Split: …"), under *Runs on* in Settings (now, or at the last start), in
  the install state ("Running now. Split: …"), in the speed check ("on the RTX 3060 and the processor
  (18 of 33 layers on the card)") and in the activity log. When no layer fits: *"Split: no layer fits on
  the NVIDIA GeForce RTX 3060 right now (4.1 GB free, 4.0 GB kept for the theme voice), so it runs on
  the processor (slower)."*
- The processor's part needs the PC's memory: the start checks there's about the model's processor
  figure minus what went on the card free (at least 1 GB), and says so if not.
- Same model, same provider: only where its layers run changes. Tyler never switches to a cloud AI or
  another model.

## Memory meter (v2.45)

**Settings → Advanced → Show a memory meter in Tyler's panel** (desktop app, off by default) shows, under the
numbers in Tyler's panel and on the phone remote, the PC's memory and the graphics card's: in use, the total and
Tyler's own share, with "What Tyler uses" broken down into the app, Text AI on this PC, theme voices, hearing and
the voice on this PC, and images (other programs only as the rest, never named). It updates every 2.5 s only while
it's on and the panel can be seen; off, nothing runs. A reading that isn't available shows "—" and says why.

- PC memory: the system's own figures. Tyler's share: the working set of the app's processes and everything it
  started, by parent process (each part is its own process and what that started).
- Graphics memory (Windows): Windows' GPU memory counters ("GPU Adapter Memory", "GPU Process Memory", dedicated
  usage, any card maker), read through WMI's language-neutral performance classes, with the card's name and size
  from DXGI; one hidden PowerShell answers each reading and closes 20 s after the last. Not on Linux.
- The card shown is the one Tyler's AI uses (else the text AI's card, else the largest one).
- Code: `app/memory-meter.cjs` (the reader), `browser-extension/memory-meter.js` (puts it in place); the skinning
  contract for theme designs is at the top of `browser-extension/ui/memory-meter.css`.

## When it runs

- It starts only when needed: the first reply with *This PC*, or the speed check. Installing,
  opening Settings and the status never start it. Loading takes a few seconds on a graphics card.
- It closes after the idle time you choose (**Close the AI after**: 1, 2, 5, 10, 30 or 60 minutes,
  or never; 10 by default), when you press **Pause** or **Stop** in Tyler's panel, when the Steam
  chat window closes, on the **emergency stop**, from Settings (**Close the AI now**), and when the
  app quits. Closing gives all of its memory back.
- If the app ever crashed and left the engine running, it's ended the next time the app starts.

## Privacy and security

- The chat's messages for Tyler's text replies stay on this PC. Nothing is sent to an AI provider
  for them.
- The engine listens only on `127.0.0.1`, on a free port picked for each start, and only answers
  requests carrying the key made for that start (32 random bytes). The key is given to the engine
  in its own environment (`LLAMA_API_KEY`), not on the command line, and it never leaves the app's
  main process: it isn't logged, saved, exported with settings, or sent to the Steam window, the
  settings window or the phone remote. There's no web page (`--no-webui`), no slot monitoring
  (`--no-slots`) and no downloading (`--offline`). Its input is closed and it has no window.
- Everything lives in `%LOCALAPPDATA%\RoboticTylerHydraCloudV12\LocalAI`: the engine, the models and
  downloads. Nothing is installed system-wide, nothing is added to PATH or the registry, and no
  driver is changed. **Remove Text AI on this PC** deletes the text engine, models and downloads;
  Tyler's settings are kept (they're in the app's own data), and so are hearing and voice on this PC
  (their own `speech` folder, v2.39).
- What isn't local: screen awareness uses its cloud provider as before; chat images are local only
  with the This PC style or the panel's Draw box (stage 3, [Images on this PC](LOCAL-IMAGES.md));
  hearing and the voice are local only when you choose that (stage 2, below).

## When it can't answer

Tyler never asks a cloud AI instead and never switches to another model by himself. The turn fails
with the reason, for example:

- not installed, or the chosen model isn't installed (even if another one is);
- the model doesn't fit in the graphics card's free memory right now (a game may be using it), or in
  the PC's free memory on the processor;
- the graphics card used before isn't found any more (a driver problem);
- the engine stopped in the middle of a reply (for example out of memory), or took too long
  (85 seconds for a reply, including loading).

In automatic mode, "not installed", "doesn't fit" and the like stop Tyler with the reason; a single
failed reply is skipped.

## Voice calls

A Standard voice call hears and speaks the way Settings → Voice → Standard voice says (v2.39):

- **Hearing → This PC**: Parakeet on this PC, no key (stage 2, below). **Hearing → Cloud** (the
  default, as before): with *This PC* as the text provider, the saved **OpenRouter key** if there is
  one, otherwise the saved **Google key**; with neither, the turn fails with a message naming
  *Hearing → This PC* and nothing is called.
- **Speaking voice**: the cloud voice of that key (Grok Voice for OpenRouter, Gemini speech for
  Google), **Voice on this PC (Kokoro)**, or **Theme voice on this PC**.
- Gemini Live always uses Google, as before.

A theme voice (the character voices, including your own replacement recordings) is made on this PC,
so it counts as speaking on this PC exactly like Kokoro: with **This PC** for the text replies,
**Hearing → This PC** and either **Theme voice on this PC** or **Voice on this PC (Kokoro)**, a
Standard voice call needs no key at all. The rules are `voiceKeyFor()` and `voicePlan()` in
`browser-extension/local-ai.mjs`.

## Usage and the spending cap

Local replies are counted apart from billed use: `localTextResponses`, `localPromptTokens` and
`localCompletionTokens` in the usage record (Settings → Advanced). Hearing and Kokoro on this PC
likewise (v2.39): `localTranscriptions`, `localTranscribedSeconds`, `localSpeechResponses` and
`localSpeechCharacters` (a theme voice keeps its own `themeSpeechResponses` and
`themeSpeechCharacters`, as since v2.36). None of them adds to requests, tokens, transcriptions, spoken replies or
reported cost. The local spending cap counts paid use only, so with *This PC* a text reply still works
when the cap is reached, and so does a voice turn heard and spoken on this PC; cloud hearing or cloud
speech is still stopped by it.

## What's tested (text replies)

**Mocked** (no model, no internet, runs in CI):

- `tests/local-ai.test.mjs`: the lock (every file pinned with size, SHA-256 and commit; Settings'
  list matches it); the installer against a local HTTP server (plan before download, a cut-off
  download resumed with a Range request, a file with the wrong SHA-256 deleted and never used, an
  offline folder used first, the Windows layout with the Vulkan backend kept apart, remove keeps
  settings); the service on a fake llama-server (`tests/fixtures/fake-llama-server.cjs`: same command
  line, `/health`, streamed `/v1/chat/completions` and key rule): starts only when asked, 127.0.0.1,
  key in the environment and required, idle close, Stop/release, the emergency stop, quitting, a crash
  mid-reply, a model that doesn't fit, a missing model, the graphics card chosen from Vulkan's list,
  the suggestion. v2.44 split: the lock's layer data, the GGUF header reader (a small made-up file),
  the plan on a 12 GB card (theme voice Quality, Lightweight or none on the card; a game using memory;
  nothing fits; the 4B's and 9B's 33 layers), the theme voices' room (only on the card, a loaded model
  not counted twice, the sharper voice, read from their service without changing it), the note's
  words, the theme voices' `vramReserve()` figure (and a service without it), the command line and
  environment for each choice, the setting's sanitising (an unknown value
  is `auto`; the phone can't write it), and on the fake engine: `-ngl 18` beside a Quality voice with
  the note at start and in the status, re-decided at the next start, the processor with `--device none`
  when nothing fits, one retry with fewer layers, the reason after a second failure, no card at all,
  and *Graphics card* and *Processor only* exactly as before.
- `tests/local-ai-routing.test.mjs`: the real background with a fake local engine: the reply uses
  the same chat rules, no OpenRouter or Gemini call is made, streaming, a failure gives the reason
  and no cloud call, Chrome gives a clear error, the voice-call key rule, usage counters, the
  spending cap, Stop, Pause/release, and Settings' Test and Preview.

**Real, Linux** (development container, 2 processor cores, no graphics card; Qwen3.5 4B, processor):
installed with the app's own installer from the real sources (the model downloaded from Hugging Face
and checked against its SHA-256; the engine archive from a folder, checked the same way), the real
`llama-server` started by the app's service, and replies through the real background:

- loading: 3.6–4.3 s; speed check (short prompt): first word after 1.5 s, 4.6–4.7 tokens a second,
  reading the prompt at about 39 tokens a second;
- a real Tyler reply (full system prompt, about 450 prompt tokens): first word after 13–15 s, whole
  reply 19–33 s on these two cores (a later turn reused the cached prompt start: first word 4.2 s);
- it listened only on 127.0.0.1, refused requests without the key (401), had no web page (404), and
  its process was gone after closing;
- **Qwen3.5 4B uncensored** the same way: downloaded and checked, loaded in 4.4 s, answered with
  thinking off; speed check: first word after 1.5 s, 5.9 tokens a second;
- in Electron 45: the desktop settings page with the app's own preload, over IPC to the real
  service: **Run a speed check** in the page loaded the 4B (2.8 s) and timed it (first word 1.55 s,
  4.8 tokens a second); *Graphics card when possible* on this PC without a card ran on the
  processor; an engine left running by a "crashed" app was ended by the next start.

**Real, Windows:** `tools/local-ai/windows-smoke.cjs`, run by the manual workflow *Text AI on this
PC on Windows* (`.github/workflows/local-ai-windows.yml`): installs the Windows build and a model with
the app's installer on GitHub's Windows runner (no graphics card), asks Vulkan for cards, starts the
server on the processor and times the speed check and one reply.

**Real, Linux, split (v2.44)** (`tools/local-ai/split-real.cjs`, development container, 2 cores, no
graphics card): the pinned b11669 Linux build, with llama.cpp's own RPC server (`ggml-rpc-server` from
the same build, on the processor) standing in for the card: llama-server sees it as a device (`RPC0`)
like a Vulkan card. The models were copies of the pinned 4B and 9B files with their real GGUF header
(the tensor layout) and empty weights, to save 8 GB of downloads. With the app's own command line
(`LlamaServer`, plus `--rpc` and a log file): the 4B with 29 of 33 layers, the 9B with 18 of 33 and the
4B with none (`--device none -ngl 0`) each started, answered a streamed request, and llama.cpp reported
"offloaded 29/33" and "18/33" layers; the device's model, cache and state buffers were 2596.36 and
3138.01 MiB against 2596.35 and 3138.00 MiB planned. llama.cpp's own `llama-fit-params` on the same
device, with margins giving the same room, chose the same counts as Tyler in five of six cases and one
layer more in the sixth (4B: 29, 14, 1; 9B: 14, 6, 0 against Tyler's 14, 5, 0). Not shown by this:
Vulkan's own buffers on a real card (the RPC device's working buffer was 72–96 MiB; Tyler keeps
0.5 GB) and a real card's free-memory reading. `DEVICE=split` in `tools/local-ai/windows-smoke.cjs`
runs the real thing on a Windows PC with a card.

**Not tested yet:** a real graphics card through Vulkan (NVIDIA, AMD or Intel), including *Split* on
a real NVIDIA card beside a theme voice, the two 9B models
(their pinned SHA-256s were checked by the owner; Tyler checks them again when they download), the
Windows workflow's first run, and replies in real Steam chat.

# Hearing and voice on this PC (v2.39, stage 2)

In Standard voice calls Tyler can hear people and speak his replies on this PC too. Both run on the
**processor**, so the graphics card stays free for your game and the text AI.

| Part | Model | Download | Memory while it runs | Licence |
|---|---|---|---|---|
| Speech engine | sherpa-onnx 1.13.8 (k2-fsa), its Node.js addon for Windows x64 | 8.5 MB (22 MB on disk) | (part of the two below) | Apache-2.0 |
| Hearing | NVIDIA **Parakeet TDT 0.6B v3**, int8 ONNX | 639 MB | about 1 GB | CC-BY-4.0 |
| Voice | **Kokoro-82M v1.0** (hexgrad), float32 ONNX, English parts only | 350 MB | about 0.5 GB | Apache-2.0 |

Sizes as Windows shows them (1 MB = 1024² bytes). The engine comes with whichever part is installed
first and goes when neither is left.

## Turning it on

1. **Settings → On this PC → Hearing and voice for calls.** Tick hearing, the
   voice or both. The download and disk space are shown before anything downloads. Press **Install**.
   **Stop installing** keeps what was downloaded, so **Retry** carries on from there.
2. **Check hearing** turns a short built-in recording into text and shows the time and how many words
   came out right. **Check the voice** says one sentence (it plays in Settings) and shows the time to
   the first audio. The recording is `app/local-ai/check-clip.wav` (3.2 s, 16 kHz mono, "Hey Tyler, who
   wins in a fight, a tank or a sniper?"), made with Kokoro's Michael voice by this engine, so it has
   the same licence as Kokoro and no person's voice in it.
3. **Settings → Voice → Standard voice**:
   - **Hearing**: **Cloud** (as before) or **This PC**;
   - **Speaking voice**: **Cloud voice**, **Theme voice on this PC** (character voices and your own
     recordings, cloned) or **Voice on this PC (Kokoro)** (stock voices; lighter and quick on the
     processor). With Kokoro, pick a **Kokoro voice**: Michael (American male, the default), Puck,
     Fenrir, George (British male), Heart (American female) or Emma (British female): Kokoro's own
     stock voices, speakers 16, 18, 14, 26, 3 and 21 of its voice table.

   Press **Save settings**. **Test voice** there plays the chosen Kokoro voice or theme voice.

With This PC for the text replies, **Hearing → This PC** and a voice on this PC (Kokoro or a theme
voice), a Standard voice call needs **no key at all**, and nothing anyone says leaves the PC.

In Chrome these choices aren't offered. If they're chosen anyway (imported settings), a voice turn
with Hearing → This PC fails with a message saying it's part of the desktop app, and a reply meant for
Kokoro stays text with the same reason; nothing is sent to the cloud instead.

## Choices made

- **sherpa-onnx 1.13.8** (published 2026-09-10): the newest release at least two weeks old (2.0.0 and
  2.0.1 are from 23 and 26 October 2026). It runs both Parakeet TDT v3 and Kokoro, on Windows x64
  without a graphics card. Its Windows files import only Windows' own DLLs (KERNEL32, ADVAPI32,
  SETUPAPI, dbghelp, dxgi): no Visual C++ runtime is needed.
- **How it runs: sherpa-onnx's own Node.js addon in a separate process, not its command-line tools.**
  The prebuilt tools load the model for every request (about 2 s for Parakeet, 1.4 s for Kokoro), and
  the only server among them (`sherpa-onnx-offline-websocket-server`) listens on the network with no
  key. The addon keeps each model loaded, works asynchronously (so Stop is heard while it works), and
  needs no network at all. The addon comes from the sherpa-onnx project's own npm package
  (`sherpa-onnx-win-x64`, published from its GitHub repository with npm's provenance record),
  downloaded at install time like the models; it isn't bundled with Tyler and isn't an npm dependency
  of the app. (GitHub's release archives are `.tar.bz2`, which the installer can't unpack; the npm
  package is a `.tgz` it already handles.)
- **Parakeet int8 on the processor.**
- **Kokoro float32, not int8**: the int8 model (`csukuangfj/kokoro-int8-multi-lang-v1_0`) was about
  twice as slow on this processor (measured side by side, the same voice and sentences: a 41-character
  sentence took 4.2 s against 2.2 s, a 95-character one 10.0 s against 4.7 s, while another job shared
  the processor), so the float32 file (325 MB) is used. Only the English parts are downloaded: the US and UK lexicons and the
  English espeak-ng data (8 small files); the Chinese lexicon, its dictionary and the other languages'
  data aren't.

Pinned in `app/local-ai/lock.json` (`speech`), every file with its size and SHA-256. All 19 files
were downloaded and checked against these by the app's own installer, and the Windows package was
downloaded and hashed separately (its SHA-512 also matches npm's record):

| What | Source |
|---|---|
| Engine, Windows | `https://registry.npmjs.org/sherpa-onnx-win-x64/-/sherpa-onnx-win-x64-1.13.8.tgz`, 8,894,875 bytes, `fe522f02…` |
| Engine, Linux (development and tests only) | `sherpa-onnx-linux-x64-1.13.8.tgz`, 11,089,653 bytes, `13291bcd…` |
| Hearing | `csukuangfj/sherpa-onnx-nemo-parakeet-tdt-0.6b-v3-int8` @ `2bda32ec…` (2025-08-16): encoder, decoder, joiner (int8) and tokens |
| Voice | `csukuangfj/kokoro-multi-lang-v1_0` @ `f7b96bb6…` (2026-09-08): `model.onnx`, `voices.bin`, tokens, `lexicon-us-en.txt`, `lexicon-gb-en.txt`, LICENSE, English espeak-ng data |

Credits shown in Settings: Parakeet TDT 0.6B v3 by NVIDIA (CC BY 4.0) and Kokoro-82M by hexgrad
(Apache-2.0), both in the sherpa-onnx project's ONNX versions. sherpa-onnx includes ONNX Runtime (MIT)
and espeak-ng (GPL-3.0; used for words Kokoro's lexicon doesn't have).

## How it runs

- Each part is its own process: `app/local-ai/speech-worker.cjs`, started by the app's service
  (`app/local-ai/speech.cjs`) with Node's `child_process.fork`, using **Tyler's own executable run as
  Node** (`ELECTRON_RUN_AS_NODE=1`). The worker file is unpacked next to the app archive.
- Its only connection is Node's IPC channel to the app: **no network listener, no port**, its input is
  closed and it has no window. Node reads that channel asynchronously at both ends, so nothing waits
  on it (the Windows pipe stall fixed in v2.37.1 was a read left blocked on a synchronous pipe; there is
  none here). When the app goes away the channel closes and the process ends by itself; if one were
  left anyway, the next start ends it, after checking its command line is this worker (never another
  program with the same number).
- Its environment is a short allowlist; the path starts with the engine's own folder.
- Up to 4 processor threads each (about the physical cores).
- Hearing: 16 kHz features, greedy decoding, the call's 16 kHz recording as it is (any other rate is
  resampled by sherpa-onnx). Voice: one sentence at a time (`maxNumSentences 1`), 24 kHz, a long reply
  split into clips of at most 30 s like theme voices; the first sentence is spoken while the rest of
  the reply is still being written (**Start speaking sooner**). A British voice uses the British
  lexicon: switching between an American and a British voice restarts the voice engine (about 1.5 s).
- In the desktop app the generated audio is copied into normal memory (`enableExternalBuffer: false`):
  Electron's V8 refuses buffers that point outside its own memory. Checked here: with the addon's
  default, Kokoro fails under Electron 45 with "TTS settlement failed" and works under plain Node;
  with the copy it works in both. The Windows workflow runs under Electron for this reason.

## When they run

- Each starts only when needed: a voice turn heard or spoken on this PC, a quick check, or Test voice.
  When a voice turn that Kokoro will speak begins, the voice engine starts loading at once, alongside
  hearing and the reply, so a first turn doesn't wait for it after the reply is written. Installing,
  opening Settings and the status never start them.
- They close after **Close hearing and voice after** (1, 2, 5, 10, 30 or 60 minutes idle, or never;
  10 by default), when you press **Pause** or **Stop** in Tyler's panel, when the Steam chat window
  closes, on the **emergency stop**, from Settings (**Close hearing and voice now**), and when the app
  quits.

## When they can't hear or speak

Tyler never sends the recording to OpenRouter or Google instead, and never switches to the paid cloud
voice by himself:

- **Hearing** fails the turn with the reason: not installed (automatic mode then stops and says so),
  not enough free memory, the engine couldn't start or closed in the middle (that turn is skipped),
  took too long (20 s), or a recording it can't read.
- **The voice**: the reply is posted as text with "Voice on this PC failed: <reason>. Tyler answered in
  text (he doesn't switch to the paid cloud voice by himself)", the same rule as theme voices.

## What's tested (hearing and voice)

**Mocked** (no model, no internet, runs in CI):

- `tests/local-speech.test.mjs`: the lock (every file pinned with size, SHA-256 and commit; Settings'
  lists and the three speaking-voice choices match it); the installer against a local HTTP server
  (plan before download, hearing alone brings the engine and the voice later only its own files, a
  cut-off download resumed, a wrong SHA-256 deleted and never used, an offline folder used first, flat
  or in subfolders, remove one part or both, removing the text AI keeps them); the **real worker
  process** with a fake addon (`tests/fixtures/fake-sherpa-addon.cjs`): starts only when asked, short
  environment, no TCP or UDP socket, input closed, threads and processor passed, Kokoro's speaker and
  lexicon per voice, samples copied, Stop mid-sentence, idle close, release, quitting, the voice
  started ahead of a turn, a crash in the middle, a load failure, a timeout, not installed, not enough
  memory, an engine whose app was killed ends by itself, a leftover one is ended and an unrelated
  process isn't, the quick checks, and the desktop wiring (the emergency stop, Settings' requests, the
  bridge carries audio and text only).
- `tests/local-speech-routing.test.mjs`: the real background with fake engines. **Both no-key calls**:
  text, hearing and Kokoro on this PC, and text, hearing and a theme voice on this PC, each with no key
  saved and **no cloud call at all**; hearing on this PC with cloud text never sends the recording for
  transcription (OpenRouter or Gemini); Cloud hearing is unchanged; a hearing failure fails the turn
  with the reason and calls nothing although both keys are saved; a Kokoro or theme voice failure
  leaves the reply as text with the reason and no Grok call; Chrome gives clear errors; Start speaking
  sooner with Kokoro and with a theme voice; the panel's connection line and voice picker; separate
  usage counters; the spending cap; Stop, Pause and closing the Steam window.

**Real, Linux** (development container, 2 processor cores of an Intel Xeon at 2.3 GHz, 7.8 GB, no
graphics card), with the app's own installer from the real sources (npm and Hugging Face, 1,000 MB in
19 files, 11 s here) and the real engines, through the app's service (`tools/local-ai/speech-smoke.cjs`):

- hearing loaded in 1.9–2.3 s; the built-in 3 s clip heard in 0.26–0.32 s, every word right;
- Parakeet on all 23 game voice references of the theme voices (`app/theme-voices/voices/*/reference.flac`,
  turned into 16 kHz WAV, 5–20 s each, 326 s in all) against their transcripts: 29 s for all of them
  (about 1.0–1.6 s for a 13–20 s line), a median of 98% of the words right, 10 of them every word; the
  lowest was the Combine soldier's radio-filtered voice (52%), then the WW2 field radio (88%);
- Kokoro loaded in 1.3–1.5 s; first audio of a sentence 0.6–0.9 s just after loading, 0.43–0.65 s warm;
  a 114-character reply (7.5 s of speech) made in 2.5–3.0 s (0.33–0.40 of real time); restarting for a
  British voice 1.3–1.5 s; that reply heard back by Parakeet in 0.74 s (95% of the words: "Tanks" came
  out "Tan");
- every clip checked with Whisper (faster-whisper small.en): the six voices saying the same sentence,
  every word right (Emma's "everyone" came back "everyone's"), and the smoke test's clips;
- the engine processes had no network socket and were gone after closing;
- under **Electron 45.2.1** (its own Node, 24.22): run as Node, and from a real Electron main process
  the way the app does it: the same results;
- **a Standard voice turn through the real background, desktop wiring and real engines, with no key
  saved** (a fixed stand-in for the text AI, which is stage 1's): the built-in clip heard right, the
  reply spoken by Kokoro with Start speaking sooner, no cloud call, usage counted as local. The first
  audio came 3.4 s after the turn began with both engines starting (hearing loaded in 2.0 s while Kokoro
  loaded alongside it), 1.4 s once they were running (other tests were running on the machine at the
  time). Before Kokoro was started at the beginning of the turn, it loaded only once the first sentence
  was ready, and a cold turn's first audio took 6.4 s (measured while another job used most of the
  processor, so not a like-for-like comparison).

**Real, Windows:** `tools/local-ai/speech-smoke.cjs` and `tools/local-ai/speech-electron-check.cjs`, run
by the manual workflow *Hearing and voice on this PC on Windows* (`.github/workflows/local-speech-windows.yml`):
installs the Windows engine and both models with the app's installer on GitHub's Windows runner, runs
the quick checks, a round trip and two other voices under Node 22, again under Electron run as Node,
and once from a real Electron main process; the times go to the run's summary, and the logs and the
spoken clips are kept as an artifact.

**Not tested yet:** the Windows workflow's first run, a real Steam voice call, a theme voice through
the real theme voice engine in a voice turn (its own engine is tested in its stage; here it's faked),
other languages than English for hearing, and processors other than this container's.

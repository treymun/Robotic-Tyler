# Text AI on this PC (v2.38, stage 1)

Tyler's **text replies** can be written by a model running on your own PC, with no key, no account
and no cost per message. It's part of the Windows desktop app and it's optional: nothing is
downloaded until you press **Install**, and the cloud providers (OpenRouter, Google Gemini) work as
before.

Stage 1 is text only. In voice calls Tyler still hears people with a cloud key (see *Voice calls*).

## Turning it on

1. **Settings → AI & personality → AI provider → This PC (free, no key).** The section **Text AI on
   this PC** appears below it.
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
  driver is changed. **Remove** deletes the folder's contents; Tyler's settings are kept (they're in
  the app's own data).
- What isn't local in stage 1: hearing people in voice calls, the cloud voice, chat images and
  screen awareness still use their cloud providers as before.

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

Stage 1 writes text replies only. A voice call (Standard voice) with *This PC* chosen:

- **hears** people with the saved **OpenRouter key** if there is one, otherwise the saved **Google
  key**; with neither, the turn fails with "Voice calls still need an OpenRouter or Google key to
  hear people … local hearing is coming next", and nothing is called;
- **speaks** with that key's cloud voice (Grok Voice for OpenRouter, Gemini speech for Google),
  unless you choose **Theme voice on this PC** under Settings → Voice → Standard voice;
- Gemini Live always uses Google, as before.

The rule is `voiceKeyFor()` in `browser-extension/local-ai.mjs`.

## Usage and the spending cap

Local replies are counted apart from billed use: `localTextResponses`, `localPromptTokens` and
`localCompletionTokens` in the usage record (Settings → Advanced). They don't add to requests,
tokens or reported cost. The local spending cap counts paid use only, so with *This PC* a text reply
still works when the cap is reached; a voice turn (cloud hearing) or cloud speech is still stopped
by it.

## What's tested

**Mocked** (no model, no internet, runs in CI):

- `tests/local-ai.test.mjs`: the lock (every file pinned with size, SHA-256 and commit; Settings'
  list matches it); the installer against a local HTTP server (plan before download, a cut-off
  download resumed with a Range request, a file with the wrong SHA-256 deleted and never used, an
  offline folder used first, the Windows layout with the Vulkan backend kept apart, remove keeps
  settings); the service on a fake llama-server (`tests/fixtures/fake-llama-server.cjs`: same command
  line, `/health`, streamed `/v1/chat/completions` and key rule): starts only when asked, 127.0.0.1,
  key in the environment and required, idle close, Stop/release, the emergency stop, quitting, a crash
  mid-reply, a model that doesn't fit, a missing model, the graphics card chosen from Vulkan's list,
  the suggestion.
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

**Not tested yet:** a real graphics card through Vulkan (NVIDIA, AMD or Intel), the two 9B models
(their pinned SHA-256s were checked by the owner; Tyler checks them again when they download), the
Windows workflow's first run, and replies in real Steam chat.

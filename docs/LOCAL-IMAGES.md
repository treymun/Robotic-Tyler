# Images on this PC (v2.40, stage 3)

Tyler can draw pictures on your own PC: no key, no account, no cost per image, and the description
isn't sent to an image service. It's part of the Windows desktop app and optional: nothing downloads
until you press **Install**, after the section has shown the download size and the disk space needed.
The cloud image styles (OpenRouter, Venice) work as before.

## Using it

1. **Settings → On this PC → Images on this PC.** (It also opens from
   *Settings → Chat images → This PC*.) The section shows this PC's processor, memory, graphics cards and
   free disk space, suggests a model, and says what Install will download and how much disk it needs.
2. Pick a model, where it runs (graphics card or processor only) and, if you like, a smaller picture
   size. Press **Install**. **Stop installing** keeps what was downloaded, so **Retry** carries on.
   **Install from a folder…** uses files you downloaded yourself (checked exactly like downloads).
3. **Make a test image** draws one picture with Tyler's own description and shows it with its times
   (loading, reading the prompt, drawing per step, finishing). It isn't posted anywhere. **Stop** ends it.
4. **In the chat:** open Tyler's panel → **Room → Chat images** and type in the **Draw** box, then
   **Draw and post**: the picture is posted in the chat with Steam's own uploader, like `!image`.
   The Draw box is yours alone: Tyler still ignores your own chat lines (he posts as your account), and
   only a real click on the box makes a request the owner's.
5. **Friends** use `!image pc …` (or `!image thispc …`) only when you turn on
   *Friends can ask for images on this PC* (off by default), and then within the Chat images limits
   (Settings → Chat images: on, who can ask, cooldown, per person, per session, three waiting at most).
   The *This PC* style in Settings → Chat images must be on too.
   - **Friends never get an uncensored model** unless *Friends can use the uncensored model* is on as
     well (also off by default). If the chosen model is uncensored and that's off, a friend's request is
     refused in plain words; Tyler never quietly uses another model instead.
6. Uncensored pictures are posted as Steam spoilers when *Post uncensored pictures as spoilers* is on
   (Settings → Chat images; it was *Post Venice pictures as spoilers*).

Pictures made here are counted apart from billed use (Settings → Advanced → usage) and the spending
cap doesn't block them: they cost nothing. In the Chrome extension this section is hidden and the
*This PC* style says it's part of the desktop app.

## Which model

| Model | For | Download (= disk) | Graphics memory (estimate) | Licence | Uncensored |
|---|---|---|---|---|---|
| Z-Image Turbo for 6–8 GB cards | most cards; 768 × 768 on 6 GB | 6.2 GB | about 5.5 GB at 1024 × 1024 | Apache-2.0 | no |
| Z-Image Turbo for 12 GB cards | 10–12 GB cards and up | 10.4 GB | about 8 GB | Apache-2.0 | no |
| Chroma1-HD uncensored for 8 GB cards | 8 GB cards and up | 8.1 GB | about 7 GB | Apache-2.0 | **yes** |
| Chroma1-HD uncensored for 12 GB cards | 12 GB cards and up | 12.2 GB | about 9.5 GB | Apache-2.0 | **yes** |

Sizes are as Windows shows them (1 GB = 1024³ bytes); the image engine adds 28 MB (89 MB unpacked).
The image decoder (FLUX.1's, 320 MB) is shared, so a second model downloads less.

- **Z-Image Turbo** (Tongyi-MAI): 6B parameters, 9 steps, very good with prompts and text in pictures.
  The light version is `Z-Image-Turbo Q4_K` with the Qwen3-4B text encoder at Q4_K_M; the 12 GB version
  uses Q8_0 for both.
- **Chroma1-HD** (lodestones): 8.9B, built on FLUX.1-schnell and trained without the usual content
  filtering, so it draws adult content about adults. 20 steps with a negative prompt, so it's about four
  times slower than Z-Image. Light: Q4_K_S with T5-XXL Q4_K_M; 12 GB: Q6_K with T5-XXL Q8_0.
- **The suggestion:** the 12 GB model with about 9.5 GB of graphics memory free, otherwise the 6–8 GB one
  (at 768 × 768 below about 5.5 GB free); with no usable card, the processor at 512 × 512. Virtual adapters
  (Microsoft Basic Display, Hyper-V, Remote Desktop) and cards Vulkan can't see aren't suggested.
  An uncensored model is never suggested: you choose it.
- **On the processor** a picture takes many minutes, so Tyler suggests Z-Image there. Measured on
  GitHub's 4-core Windows runner at 256 × 256: Z-Image Turbo (light) about 23 s a step (4 steps in 106 s
  in all), so about 4 minutes with its 9 steps and roughly a quarter of an hour at 512 × 512 (the default
  there, estimated from that). **Chroma1-HD takes about an hour for one small (256 × 256) picture** on the
  processor (about 178 s a step, and it needs about 20 steps; at 4 steps the picture was still noisy),
  and several hours at 512 × 512. It's allowed if you choose it; Settings says so plainly. A graphics
  card is the way to use this. *256 × 256 (for the processor)* is in the size list.

Every file is pinned to one Hugging Face commit with its size and SHA-256 in
`app/local-images/lock.json`: `leejet/Z-Image-Turbo-GGUF`, `unsloth/Qwen3-4B-Instruct-2507-GGUF`,
`silveroxides/Chroma1-HD-GGUF`, `city96/t5-v1_1-xxl-encoder-gguf` and `lodestones/Chroma` (the decoder).

## The engine

stable-diffusion.cpp's `sd-cli`, release **master-1017-be48649** (2026-10-27, MIT), from its own GitHub
release: `sd-master-be48649-bin-win-vulkan-x64.zip` (29,744,133 bytes). Like Text AI on this PC, one
download covers the graphics card (Vulkan: NVIDIA, AMD or Intel) and the processor; the Vulkan backend
is kept in its own `gpu\` folder and only loaded for the card. No CUDA build for now (it would be an
865 MB download; Vulkan covers NVIDIA, AMD and Intel).

It needs **Microsoft's Visual C++ Redistributable (x64)**, which almost every Windows gaming PC already
has (games install it). If it's missing, the engine can't start (Windows' "a DLL is missing" exit code);
Install then says so in plain words, with a **Download it from Microsoft** link to Microsoft's own
installer (`https://aka.ms/vc14/vc_redist.x64.exe`, the permalink on Microsoft's *Latest supported
Visual C++ Redistributable downloads* page) and what was downloaded is kept. Tyler never bundles or
installs it.

**One run of the engine per image, with no network port.** stable-diffusion.cpp's web server can't
require a key, so Tyler doesn't use it (it isn't even unpacked). How Tyler runs it
(`app/local-images/engine.cjs`):

```
sd-cli --diffusion-model <model> --llm|--t5xxl <text encoder> --vae <decoder>
  --prompt-file <job>\prompt.txt [--negative-prompt-file <job>\negative.txt]
  -W <w> -H <h> --steps <n> --cfg-scale <1|3> --sampling-method euler --seed <n> -t <threads>
  graphics card:  --backend VulkanN --auto-fit off --params-backend te=cpu   (GGML_BACKEND_PATH=gpu\ggml-vulkan.dll)
  processor:      --backend cpu --auto-fit off
  --disable-image-metadata --log-level info -o <job>\image.png
environment: a short allowlist (SystemRoot, TEMP, PATH, …)
```

- The description goes in through a file in a job folder that's deleted afterwards, not on the command
  line. The picture carries no metadata (no prompt, no file paths).
- `--auto-fit off` and an explicit `--backend`: the engine never moves the work to another device. On a
  card the text encoder waits in the PC's memory and visits the card only while the prompt is read.
- When the image is done, the process ends and all of its memory is given back: nothing stays loaded,
  so there's no idle time to wait for.

## When it runs and how it stops

- Only when an image is asked for (and the test image in Settings). Installing, Settings and the status
  never start it. One image at a time: a second request while one is drawing is refused with a reason.
- **Stop** in Settings, **Stop** next to the Draw box, **Pause**/**Stop** in Tyler's panel, the Steam
  window closing, the **emergency stop** and quitting end a running image at once (the process is
  killed). While the emergency stop is on, no picture is made at all.
- A process left behind by a crash of the app is ended the next time the app starts.

## Tyler's image rules (every model, everyone, the owner too)

The rules run before **every** picture Tyler makes: on this PC (every model, uncensored ones included)
**and before every cloud picture too** (the OpenRouter and Venice styles), for every requester including
the owner. No setting or option skips them. "Uncensored" means the model itself doesn't refuse adult
content about made-up adults; these rules are the line. Venice's styles count as uncensored for rule 1.

They live in **one file**, `browser-extension/image-rules.js` (no second copy of the vocabulary): the
Chrome extension's background and the desktop app's background load it before any cloud request, and the
desktop app's image service (`app/local-images/guard.cjs`) loads the same file again inside the engine's
own check (from `app/companion/image-rules.js` in the installed app, which the build copies and
`npm run check` keeps identical). The chat side sends the names of the people in the chat (who wrote the
messages on screen or lately, and the group's member list when Steam has it loaded) for rule 2.

1. **Never anything sexual, nude or revealing involving minors.** Any age cue counts: words for children
   and teens in several languages (English, Spanish, French, German, Italian, Portuguese, Russian,
   Japanese, Chinese, Korean, Arabic, Hindi), school roles and clothing (schoolgirl, school uniform, JK…),
   "young-looking" and the like, ages under 18 written in digits or words ("16 years old", "aged
   fifteen", "she is 16", "(16f)", "6th grade"), and combinations of weaker cues ("petite" + "pigtails").
   Words that only mean sexualised minors (loli, shota, jailbait…) are refused in any prompt. With an
   uncensored model, a prompt that points to a child is refused even if nothing in it is sexual, because
   such a model can add nudity by itself. A revealing prompt that says "girl" or "boy" needs the adult age
   right next to it ("adult anime girl", "girl, 25 years old"), or "woman"/"man".
2. **Never sexual, nude or revealing images of real people**: public figures, streamers, people in the
   chat (Tyler passes their names), "my friend Sam", "photo of [Steam user]", @mentions, and anything
   that reads as a real person's full name.

Tricks are undone first: capitals, accents, full-width letters, look-alike letters from other alphabets,
invisible characters, leetspeak (t33n), letters spaced or dotted out (l o l i, n.u.d.e), stretched letters,
words split or run together. "1 8 year old" also reads as "one 8-year-old", so it's refused; "18 year old"
is fine. Image models don't understand "no" or "not", so "no kids" counts as kids.
Refusals say why in plain words, so an honest prompt about adults can be reworded. In the chat a friend
gets a short line ("Tyler won't draw that (his image rules: nothing sexual involving minors or real
people)"); the panel shows the whole reason. For models that use a
negative prompt (Chroma), Tyler also adds one that pushes away from childlike features; it helps but
isn't relied on.

## When it can't make an image

Tyler never uses another model, the other device or a cloud service instead. The image fails with the
reason, for example: not installed, or the chosen model isn't (even if another one is); the model doesn't
fit in the card's free memory right now (a game may be using it) or in the PC's memory; no card can be
used (Vulkan found none; a driver problem); the engine stopped (out of memory, a crash), made no image,
stopped making progress (4 minutes without a sign of life on a card, an hour on the processor), or took
too long (15 minutes on a card, 6 hours on the processor; these are safety nets, and Stop always works).
A friend asking while the uncensored model is chosen and *Friends can use the uncensored model* is off,
or while *Friends can ask for images on this PC* is off, is refused with the reason too.

## Privacy and files

Everything lives in `%LOCALAPPDATA%\RoboticTylerHydraCloudV12\LocalImages` (apart from Text AI on this PC,
so removing one never touches the other): the engine, the models and downloads. Nothing is installed
system-wide, nothing is added to PATH or the registry, no driver is changed. **Remove** deletes the
engine, models and downloads; Tyler's settings are kept. Removing one model keeps the parts another
installed model uses.

## What's tested

**Mocked** (no model, no internet; `tests/local-images.test.mjs` and `tests/images.test.mjs`, run in CI):
the lock (every file pinned with size, SHA-256 and commit; no non-commercial licence; the four tiers); the
installer against a local HTTP server (plan before download, a cut-off download resumed with Range, a file
with the wrong SHA-256 deleted, an offline folder used first and a damaged copy there ignored, the Windows
layout with the Vulkan backend apart and sd-server left out, a missing Visual C++ runtime explained,
remove keeps settings, remove one model keeps shared parts); the image rules (over 100 refused and
allowed prompts, real rules on real text); the command line; the service on a fake sd-cli
(`tests/fixtures/fake-sd-cli.cjs`: the same flags, log lines, progress bars, `--version` and
`--list-devices`): starts only when asked, prompt from a file (never the command line), PNG of the right
size with timings, the process gone afterwards, refused prompts never start the engine (also for the
owner), the safety negative for uncensored models, Stop, release, the emergency stop, quitting, one image
at a time, out of memory, a crash, no image, a wrong size, a model that won't load, a stall, a model not
installed, bad sizes, the card chosen from Vulkan's list, too little free graphics memory, no card (no
move to the processor), friends off by default, the suggestion (Z-Image on the processor, Chroma's hour
said plainly).
The real background with a stand-in for the desktop bridge: the rules refuse before any OpenRouter or
Venice request (nothing is sent), with the chat's names for real people; This PC makes no cloud call,
isn't blocked by the spending cap, counts apart; friends refused unless allowed, the uncensored model
refused for friends unless allowed too (never another model); "from the panel" never skips the chat
switches for a cloud style; Pause ends a picture; Chrome says it's a desktop-app feature. The chat side:
the Draw box only in the desktop app, only a real click counts, it posts with Steam's uploader and sends
the chat's names; chat lines never carry the owner flag; a rules refusal is a short line in chat.
Settings → Images on this PC and the panel's Draw box were checked in desktop mode with the layout audit
and by eye in the Steam, Windows XP, Pip-Boy, Minecraft, DOOM, MSN, Dreamcast and CS 1.6 themes (not
installed, the processor with Chroma, installing, ready with a test picture, the Visual C++ notice), and
the Chrome build's Settings (section hidden, This PC off and marked as the desktop app's).

**Real, Linux** (development container, 2 shared processor cores, no graphics card), with the app's own
installer and service (`tools/local-images/windows-smoke.cjs`, `MODEL=dev-sd15`): the engine downloaded
from GitHub and Stable Diffusion 1.5 (Q4_0, a small development-only model, not offered in Settings) from
Hugging Face, both checked against their SHA-256 (1.48 GB in 18 s); the engine's start check passed
(`commit be48649`); a forbidden prompt was refused in 9 ms with no engine started; one 320 × 320 image in
10 steps: 95 s in all (model load 0.1 s, prompt 0.5 s, 7.8 s a step, decode 16.7 s), no listening socket,
the process gone afterwards; Stop after the first step ended the image in 17 s with the process gone.
Also checked with the real sd-cli: `--params-backend te=cpu` is accepted, and a Vulkan card that doesn't
exist gives "backend 'Vulkan0' was not found", which Tyler reports as "no card can be used".

**Real, Windows** (GitHub's Windows runner: 4 cores, 16 GB, processor only; workflow
`.github/workflows/local-images-windows.yml`, runs 42139763309 and 42139766340), with the app's own
installer and service. Vulkan listed no devices, and the runner's Hyper-V video adapter was correctly not
used.
- **Z-Image Turbo for 6–8 GB cards:** the plan said 6.26 GB to download and 6.60 GB of disk; installed
  and checked in 176 s. A forbidden prompt was refused in 29 ms with no engine started. 256 × 256 in 4
  steps: 106 s in all (about 23 s a step, decode 11 s), 6.2 GB of memory; the picture was clean. No
  listening socket, the process gone afterwards, Stop worked.
- **Chroma1-HD uncensored for 8 GB cards:** the plan said 8.10 GB to download; installed in 204 s.
  256 × 256 in 4 steps: 800 s (about 178 s a step, reading the prompt 70 s), 8.1 GB of memory. The
  picture was still noisy at 4 steps: Chroma needs about 20, so a usable picture on the processor takes
  about an hour even at 256 × 256. No socket, the process gone afterwards, Stop worked.

**Not tested yet:** any real graphics card, the 12 GB models, the Visual C++ notice on a PC that really
lacks the runtime (GitHub's runner has it), and posting to a real Steam chat. On your PC, **Make a test
image** after installing is the first real test on a graphics card.

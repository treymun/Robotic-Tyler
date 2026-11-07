# Getting started

The [README](../README.md) is the short path. This page covers which download to take, what can wait, what a key costs, and what to try when Tyler stays quiet.

[Who's speaking](WHOS-SPEAKING.md) · [AI on this PC](LOCAL-AI.md) · [Images on this PC](LOCAL-IMAGES.md) · [Theme voices](THEME-VOICES.md) · [Music DJ](MUSIC-GUIDE.md) · [Trivia](TRIVIA-GUIDE.md) · [Arcade](ARCADE-GUIDE.md) · [Vote kick and Steam admin](MODERATION-GUIDE.md)

## The download

On Windows, [ROBOTIC TYLER Setup](https://github.com/treymun/Robotic-Tyler/releases/latest) is the file. Its name is `ROBOTIC-TYLER-Setup-<version>.exe`. Run it and tick **Desktop app** (recommended), **Chrome extension**, or both.

The other files on that release are not a second install:

| File | What to do with it |
|---|---|
| `ROBOTIC-TYLER-Setup-<version>.exe` | Run this. |
| `ROBOTIC-TYLER-Chrome-Extension-<version>.zip` | Only if you are not using Setup. Unzip it and open `How to install.html`. |
| `ROBOTIC-TYLER-component-Desktop-…`, `.blockmap`, `control.yml` | Leave them. Setup and the desktop app's own updates use them. |
| `SHA256SUMS.txt` | Optional check of the downloads. |

Setup is not code-signed. If Windows says *"Windows protected your PC"*, choose **More info → Run anyway**. Setup checks each download's SHA-256 before it runs it. The desktop app updates itself. Run Setup again later to add, update or repair a part. Settings and keys are kept.

After you update Tyler's unpacked extension, press **Reload** on his card in `chrome://extensions`.

## Desktop app and Chrome extension

**Desktop app.** Sign in to the bot's Steam account in the app's own Steam chat window. In **Settings → AI & personality**, add an **OpenRouter** or **Google Gemini** key, or choose **This PC (free, no key)** and install a text model under **On this PC**. Press **Save settings**. Open the group chat, then **Tyler's panel → Connect & start**, and join the voice channel. This route uses Tyler's own synthetic microphone.

**Chrome extension.** Tick it in Setup, or use the zip above. On `chrome://extensions`, turn on **Developer mode**, click **Load unpacked**, and choose the folder Setup copied. You only have to load that folder once. Open Steam web chat in that same Chrome profile, signed in as the bot, add a cloud key, and press **Connect & start**. The extension cannot run AI on this PC. If **This PC** is selected anyway, Tyler says so and does not call a cloud model instead.

Both are compared on the [README](../README.md#desktop-app-or-chrome-extension). The older route through VB-CABLE and the Steam desktop app is still there: **Settings → Voice → Where Tyler joins voice**.

**Phone remote** (desktop app only). **Settings → Overview → Phone remote**, scan the QR code and type the 6-digit code. On the phone, **Setup → Open Settings** changes his settings. The phone never sees your API keys.

## What you need, and what can wait

| Before he can answer | When you want it |
|---|---|
| The desktop app or the Chrome extension, a Steam account for the bot, and a way to write replies: a cloud key, or **This PC** on the desktop app | Phone remote, theme voices, hearing and Kokoro, chat pictures, the sharper voice, Music DJ, trivia and the arcade, vote kick, Gemini Live, the VB-CABLE route |

Nothing in the right-hand column downloads by itself. Each install button shows the size and the free disk space first.

## Keys, cost and hardware

| How he answers | What it asks |
|---|---|
| OpenRouter text | Your OpenRouter key. Llama 3.3 70B, Mistral Small 3.2, or Venice Uncensored, each with its own routing. Priced per token. **Settings → AI & personality** has a spending cap for that text, and the key should have a limit of its own. |
| Google Gemini text | Your Google AI key. 3.1 Flash-Lite, 3.5 Flash-Lite, or 3.8 Flash. Free while that project has no billing turned on, inside Google's rate limits. With billing on, Google charges. Tyler does not switch model or billing by himself. |
| Text on this PC | No key. Optional download: Qwen3.5 4B (2.6 GB) or 9B (5.3 GB), or an uncensored build of either. Desktop app, on an NVIDIA, AMD or Intel card or on the processor. Since v2.44, **On this PC → Runs on** can keep the whole model on the card, use the processor only, or split layers between them. |
| Standard voice, cloud hearing and speech | The saved OpenRouter or Google key. Hearing and speech are billed by that provider. |
| Standard voice, all on this PC | No key, once text, hearing and a voice are all on this PC. Hearing is Parakeet (639 MB) and the stock voice is Kokoro (350 MB). Both run on the processor. A theme voice counts as a voice on this PC. |
| Gemini Live | A Google AI key. Google bills the audio while a session runs. You start and stop every session. It always uses Google's voices. |
| Theme voices | No key and no cost per line. Optional. Quality on an NVIDIA card is about 7 GB before anything downloads (the engine plus the 1.7B model). Since v2.44 the default moves the voice to the processor when the card is full, and says so. |
| Sharper voice | Medic, Lash and Kelvin only. Off until you switch that character on. A separate download of about 1.33 GB, after theme voices. |
| Chat pictures | An OpenRouter or Venice key, or no key on this PC. Cloud pictures count toward the spending cap. Pictures on this PC do not. |

**Test selected model** checks the cloud model. **Run a speed check** under **On this PC** is the measurement on your machine. The On this PC picture in the README is an example layout, not a benchmark. The v2.44 release tests did not include a real graphics card. Published times for the fast theme-voice engine on an NVIDIA card come from that engine's own notes, not from a Windows machine in this repo. On the processor, theme voices take several seconds of work per second of speech.

Sizes and the split-card rules: [AI on this PC](LOCAL-AI.md), [Theme voices](THEME-VOICES.md), [Images on this PC](LOCAL-IMAGES.md).

## When something is wrong

- **He never answers.** Save a cloud key, or on the desktop app choose **This PC** and finish **Install**.
- **Windows blocked Setup.** **More info → Run anyway**.
- **Chrome has no Tyler icon.** `chrome://extensions` → **Developer mode** → **Load unpacked** → the folder Setup copied. After an update, **Reload** that card.
- **Friends can't hear him, or he can't hear them.** He only hears the Steam voice call he is in, and only after you confirm everyone knows. **Checks → Run full check**. His voice is a synthetic microphone, not your physical one.
- **Names in voice look wrong.** Settings → Voice → Standard voice → turn off **Tell the AI who's speaking in voice**. A real Steam call has not yet shown which of Steam's talking fields switch. [Who's speaking](WHOS-SPEAKING.md).
- **The graphics card is full.** Text AI: **On this PC → Runs on → Split between graphics card and processor**. Theme voices, on the default **Runs on**, move to the processor when the card is full, and say so. **Graphics card only** stops with a message. Neither switches to a cloud model.
- **Theme voices are too slow for a call.** The processor path is the slow one. An NVIDIA card, and the optional fast engine, is the path meant for replies in a call.
- **Music DJ is missing.** **Room → Music DJ**, and only when voice is in the app's Steam window or in Chrome. The VB-CABLE route does not offer it. [Music DJ](MUSIC-GUIDE.md).
- **An old Voice Studio or Control Center is still installed.** The desktop app replaces Control Center in place, imports Voice Studio's settings the first time it starts, and then offers to remove Voice Studio.

## The other guides

[Who's speaking](WHOS-SPEAKING.md) · [AI on this PC](LOCAL-AI.md) · [Images on this PC](LOCAL-IMAGES.md) · [Theme voices](THEME-VOICES.md) · [Music DJ](MUSIC-GUIDE.md) · [Trivia](TRIVIA-GUIDE.md) · [Arcade](ARCADE-GUIDE.md) · [Vote kick and Steam admin](MODERATION-GUIDE.md)

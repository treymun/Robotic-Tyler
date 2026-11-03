<p align="center"><img src="assets/robotic-tyler.png" width="128" alt="ROBOTIC TYLER logo"></p>

<h1 align="center">ROBOTIC TYLER</h1>
<p align="center">An AI friend for your Steam group chat: it talks in voice, replies in text, runs trivia and votes, and plays sounds.</p>

## Download

**Download one file:** `ROBOTIC-TYLER-Setup-<version>.exe` from the **[latest release](https://github.com/treymun/Robotic-Tyler/releases/latest)**, and run it. There are two ways to use Tyler, and Setup installs either or both:

| Part | What it is |
|---|---|
| **Desktop app** | Tyler on Windows, no Chrome needed: Steam text chat in its own window, and Steam voice through a free virtual audio cable (VB-CABLE) set as Steam's microphone. Voice uses **Standard** voice or **Gemini Live**. |
| **Chrome extension** | Tyler inside Steam web chat, voice and text. Setup unpacks it to `%LOCALAPPDATA%\ROBOTIC TYLER\Chrome extension`, opens Chrome's extensions page and copies the folder path. Turn on **Developer mode**, click **Load unpacked** and paste the path (a one-time step: Chrome only adds extensions from outside its Web Store this way). |

Nothing needs unzipping. The desktop app is downloaded from the same release and its SHA-256 is checked before it runs. It updates itself. Settings, keys, themes and memory are kept. If Windows says *"Windows protected your PC"*, Setup isn't code-signed: choose **More info → Run anyway**.

**Coming from 2.14 or older?** The desktop app replaces the separate *Control Center* and *Native Steam Companion (Voice Studio)*:
- A **Control Center** is upgraded in place (same settings, keys and memory), by Setup or by its own automatic update.
- A **Voice Studio**'s settings, keys and device choices are imported the first time the desktop app starts. If both old apps had different settings, the app asks which to keep instead of overwriting either. It then offers to remove the old Voice Studio. Tick the listening-consent box again in Settings → Voice.

**Updating the Chrome extension:** run the newer Setup with *Chrome extension* ticked, then press **Reload** on Tyler's card in `chrome://extensions`.

Also on the release page: `ROBOTIC-TYLER-Chrome-Extension-<version>.zip`, the same extension for anyone not on Windows (unzip it and open *How to install.html*), and the `ROBOTIC-TYLER-component-Desktop-…` installer, which Setup and the app's automatic updates use. You don't need to download it.

## Voice: Standard or Gemini Live

Settings → Voice picks the engine. Each keeps its own voice and model choices.

- **Standard** waits for a pause, writes a reply with your AI provider (OpenRouter or Gemini) and speaks it: Grok voices through OpenRouter, or Google's voices with a Gemini key. Long replies are spoken in full.
- **Gemini Live** is a real-time voice conversation with Google (`gemini-3.8-live`): Tyler hears the call as people talk, answers in about a second and stops when someone talks over him. It needs a Google AI key and Google bills for the audio while a session runs, so you start and stop each session yourself (in Tyler's panel in Steam, or the desktop Voice window). Your personality, reply length and rules still apply; people in the call can't change them.

Tyler only ever hears the Steam voice call (Chrome) or the one output device you pick (desktop), never your microphone, and only after you confirm everyone knows he's listening.

## Quick start (Chrome)

1. Run Setup with **Chrome extension** ticked and click **Finish**.
2. On Chrome's extensions page, turn on **Developer mode**, click **Load unpacked** and paste the folder path Setup copied.
3. Click Tyler's toolbar icon to open Settings and add an OpenRouter or Gemini key.
4. Open `steamcommunity.com/chat`, open your group chat and press **Connect & start**.

## Themes

Settings → Appearance shows every theme as a live preview card (logo, tabs, buttons, status strip and a sample notification). Pick one and press **Apply** to change every Tyler window at once: **Steam** (default), **Classic Steam (2004)**, **Team Fortress 2**, **Counter-Strike 2**, **Portal** (light), **Counter-Strike 1.6**, **Half-Life HEV suit**, **Left 4 Dead**, **Windows XP** (light), **DOOM (classic)**, **Quake (1996)**, **Fallout Pip-Boy**, **Half-Life 2 Combine**, **Deadlock** and **Minecraft** (light). The game themes follow each game's own menu colors and shapes and use free look-alike fonts (bundled, SIL Open Font License). Each theme also has its own Tyler logo (a TF2 hard hat, a CS 1.6 balaclava, a DOOM pixel portrait and so on) that swaps in the panel, the settings, the Voice window and the toolbar icon, plus its own animated status strip that changes as Tyler listens, thinks and talks. No game fonts are included. ROBOTIC TYLER is a free fan project and isn't affiliated with Valve, id Software, Bethesda, Mojang, Microsoft or any other publisher; game names are used only to describe each theme's style. The HEV, Windows XP and Portal logos show those games' and Windows' own symbols, so check them before publishing the app (see `tools/logos/README.md`).

## Trivia

Type `play trivia` in chat for a 10-question group race: 500 questions across 10 categories (science, history, geography, movies & TV, music, sports, art & books, food & drink, gaming, animals & nature) at three difficulty levels. Pick a mix with `play trivia solo gaming hard 5`. Speed and streak bonuses, a 50/50 hint, double points on the last question, and final results with awards. See `docs/TRIVIA-GUIDE.md`.

## What's in this folder

| Path | What it is |
|---|---|
| `browser-extension/` | The source for everything. Chrome loads this folder as-is. |
| `app/`, `voice-app/` | The desktop app: main process, Voice window (parts are generated from `browser-extension/`). |
| `windows-audio-bridge/` | The Windows audio helper the desktop app uses for voice (C#, NAudio). |
| `docs/` | Feature guides (arcade, trivia, music, moderation) and older patch notes. |
| `CHANGES.md` | What changed in each release, newest first. |
| `RELEASING.md` | Tests, releases, automatic updates and code signing. |
| `START-HERE.txt` | Notes for updating an existing install. |
| `Start ROBOTIC TYLER.cmd`, `BUILD-WINDOWS-EXE.cmd` | Double-click helpers for Windows: run from source, or build the installers. |

## For developers

```
npm install
node tools/build.mjs          # regenerate the desktop copies after editing browser-extension/
npm run test:all              # build check, unit tests, end-to-end tests in Chromium
npm run build:win             # Windows: the desktop installer, then the setup (needs .NET 8 and MinGW-w64)
npm run package:release       # dist/release/: Chrome zip, setup, install guide, notes, checksums
```

<p align="center"><img src="assets/robotic-tyler.png" width="128" alt="ROBOTIC TYLER logo"></p>

<h1 align="center">ROBOTIC TYLER</h1>
<p align="center">An AI friend for your Steam group chat: it talks in voice, replies in text, runs trivia and votes, and plays sounds.</p>

## Download

**Download one file:** `ROBOTIC-TYLER-Setup-<version>.exe` from the **[latest release](https://github.com/treymun/Robotic-Tyler/releases/latest)**, and run it. Tick what you want:

| Part | What it is |
|---|---|
| **Chrome extension** | Voice and chat inside Steam web chat. Setup unpacks it to `%LOCALAPPDATA%\ROBOTIC TYLER\Chrome extension`, then opens Chrome's extensions page and copies the folder path. In Chrome, turn on **Developer mode**, click **Load unpacked** and paste the path. That's a one-time step: Chrome only installs extensions from outside its Web Store this way. |
| **Control Center** | Tyler's own Steam chat window on Windows, no Chrome needed. |
| **Native Steam Companion (Voice Studio)** | Tyler talks in Steam voice from Windows. Needs a free virtual audio cable such as VB-Audio CABLE as Steam's microphone. |

Nothing needs unzipping. The Chrome extension is inside Setup; the two apps are downloaded only if you tick them, from the same release, and each file's SHA-256 is checked before it runs. Run Setup again later to add a part, update or repair one. Each app keeps its own folder, Start-menu shortcut (under *ROBOTIC TYLER*), automatic updates and uninstaller, so removing one never affects the other. Settings, keys and themes are kept. If Windows says *"Windows protected your PC"*, Setup isn't code-signed yet: choose **More info → Run anyway**.

**Updating the Chrome extension:** run the newer Setup with *Chrome extension* ticked, then press **Reload** on Tyler's card in `chrome://extensions`. Already loading Tyler from a folder of your own? Keep updating that folder from the zip, or switch to Setup's folder: Chrome sees it as a new extension, so move your settings with **Settings → Advanced → Export safe settings / Import settings** (API keys aren't exported; add them again).

Also on the release page: `ROBOTIC-TYLER-Chrome-Extension-<version>.zip`, the same extension for anyone not on Windows (unzip it and open *How to install.html*), and the `ROBOTIC-TYLER-component-…` files, which are the apps' own installers that Setup and the apps' automatic updates use. You don't need to download those.

## Quick start (Chrome)

1. Run Setup with **Chrome extension** ticked and click **Finish**.
2. On Chrome's extensions page, turn on **Developer mode**, click **Load unpacked** and paste the folder path Setup copied.
3. Click Tyler's toolbar icon to open Settings and add an OpenRouter or Gemini key.
4. Open `steamcommunity.com/chat`, open your group chat and press **Connect & start**.

## Themes

Settings → Appearance shows every theme as a live preview card (logo, tabs, buttons, status strip and a sample notification). Pick one and press **Apply** to change every Tyler window at once: **Steam** (default), **Classic Steam (2004)**, **Team Fortress 2**, **Counter-Strike 2**, **Portal** (light), **Counter-Strike 1.6**, **Half-Life HEV suit**, **Left 4 Dead**, **Windows XP** (light) and **DOOM (classic)**. The game themes follow each game's own menu colors and shapes and use free look-alike fonts (bundled, SIL Open Font License). Each theme also has its own Tyler logo (a TF2 hard hat, a CS 1.6 balaclava, a DOOM pixel portrait and so on) that swaps in the panel, the settings, the Voice Studio and the toolbar icon, plus its own animated status strip that changes as Tyler listens, thinks and talks. No game fonts are included. The HEV, Windows XP and Portal logos show those games' and Windows' own symbols, so check them before publishing the app (see `tools/logos/README.md`).

## Trivia

Type `play trivia` in chat for a 10-question group race: 500 questions across 10 categories (science, history, geography, movies & TV, music, sports, art & books, food & drink, gaming, animals & nature) at three difficulty levels. Pick a mix with `play trivia solo gaming hard 5`. Speed and streak bonuses, a 50/50 hint, double points on the last question, and final results with awards. See `docs/TRIVIA-GUIDE.md`.

## What's in this folder

| Path | What it is |
|---|---|
| `browser-extension/` | The source for everything. Chrome loads this folder as-is. |
| `app/`, `voice-app/` | The two Windows apps (parts of them are generated from `browser-extension/`). |
| `docs/` | Feature guides (arcade, trivia, music, moderation) and older patch notes. |
| `CHANGES.md` | What changed in each release, newest first. |
| `RELEASING.md` | Tests, releases, automatic updates and code signing. |
| `START-HERE.txt` | Notes for updating an existing install. |
| `Start ROBOTIC TYLER.cmd`, `BUILD-*.cmd` | Double-click helpers for Windows: run from source, or build the installers. |

## For developers

```
npm install
node tools/build.mjs          # regenerate the desktop copies after editing browser-extension/
npm run test:all              # build check, unit tests, end-to-end tests in Chromium
npm run build:win             # Windows: both app installers, then the setup (needs MinGW-w64)
npm run package:release       # dist/release/: Chrome zip, setup, install guide, notes, checksums
```

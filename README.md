<p align="center">
  <img src="assets/readme/hero.png" width="100%" alt="ROBOTIC TYLER, AI squadmate for Steam chat and voice, next to his panel in Steam chat in the app's Steam theme: on air, with the Chat, Room, Sounds, Setup and Checks tabs.">
</p>

<p align="center">
  <a href="https://github.com/treymun/Robotic-Tyler/releases/latest"><img src="assets/readme/download.png" width="430" alt="Download for Windows: ROBOTIC TYLER Setup (desktop app and Chrome extension)"></a>
</p>

<p align="center">
  <a href="https://github.com/treymun/Robotic-Tyler/releases/latest"><img alt="Latest release" src="https://img.shields.io/github/v/release/treymun/Robotic-Tyler?style=flat-square&label=latest&color=1a9fff&labelColor=171a21"></a>
  <img alt="Windows 10 and 11" src="https://img.shields.io/badge/Windows-10%20%C2%B7%2011-2a475e?style=flat-square&labelColor=171a21">
  <img alt="Also a Chrome extension" src="https://img.shields.io/badge/also%20a-Chrome%20extension-417a9b?style=flat-square&labelColor=171a21">
  <img alt="Free fan project" src="https://img.shields.io/badge/free-fan%20project-5c7e10?style=flat-square&labelColor=171a21">
</p>

<p align="center"><b>Tyler is an AI squadmate for Steam.</b> He sits in your group chat and voice channel, talks like one of the crew, and keeps the night going with trivia, votes, sounds and music.</p>

<p align="center"><a href="CHANGES.md"><img src="assets/readme/whats-new.png" width="100%" alt="What's new since v2.20.1: five new themes, Rust, Xbox 360, iPod classic, MSN Messenger and PlayStation 3 (v2.27), Phone remote (v2.25, v2.26), Stay connected (v2.24), a docked and resizable panel (v2.23), themes with their own menus and screens (v2.22), smoother voice (v2.21), music that sounds right (v2.20.2, v2.20.3), the full check and repeat protection (v2.20.1)."></a></p>

---

## What he does

<table>
<tr>
<td width="50%" valign="top"><img src="assets/readme/icon-voice.png" width="52" align="left" alt="">&nbsp;<b>Talks in voice</b><br>&nbsp;Joins your Steam voice channel and answers out loud. <b>Standard</b> voice waits for a pause; <b>Gemini Live</b> answers in about a second and stops when someone talks over him.</td>
<td width="50%" valign="top"><img src="assets/readme/icon-chat.png" width="52" align="left" alt="">&nbsp;<b>Replies in text</b><br>&nbsp;Reads the room, remembers friends and inside jokes, and picks his moments. You set the personality, length and how talkative he is.</td>
</tr>
<tr>
<td valign="top"><img src="assets/readme/icon-sounds.png" width="52" align="left" alt="">&nbsp;<b>Soundboard</b><br>&nbsp;Clips straight into the call through his own microphone. No API key needed for the sounds.</td>
<td valign="top"><img src="assets/readme/icon-music.png" width="52" align="left" alt="">&nbsp;<b>Music DJ</b><br>&nbsp;<code>!play artist song</code> in chat: a YouTube queue played into voice in stereo, with skip votes, Auto quality and a dip while Tyler talks.</td>
</tr>
<tr>
<td valign="top"><img src="assets/readme/icon-games.png" width="52" align="left" alt="">&nbsp;<b>Trivia, votes and games</b><br>&nbsp;500-question trivia races, an arcade (<code>play vault</code>, <code>play hangman</code>, <code>play riddle</code> …), squad votes and optional mute or kick votes.</td>
<td valign="top"><img src="assets/readme/icon-themes.png" width="52" align="left" alt="">&nbsp;<b>25 themes</b><br>&nbsp;Steam, TF2, CS2, Portal, DOOM, Rust, Xbox 360, iPod, MSN Messenger, PS3 and more, each with its own Tyler, status strip, menus and screens: a Quake console, a Pip-Boy radio, a click wheel, a Ring of Light, a working Dreamcast VMU…</td>
</tr>
<tr>
<td valign="top"><img src="assets/readme/icon-remote.png" width="52" align="left" alt="">&nbsp;<b>Phone remote</b> <sup>new</sup><br>&nbsp;Tyler's panel on your phone, live and in your theme. Start or pause him, play clips, run the music, type in chat, switch the theme. Nothing to install.</td>
<td valign="top"><img src="assets/readme/icon-stay.png" width="52" align="left" alt="">&nbsp;<b>Stays in the call</b> <sup>new</sup><br>&nbsp;A soft hum after 45 quiet minutes keeps Steam from dropping him, and he reconnects to the chat by himself. A full check tests every part in one pass.</td>
</tr>
</table>

## A closer look

<p align="center"><img src="assets/readme/feature-voice.png" width="100%" alt="Voice: Settings → Voice with the Standard and Gemini Live engines, and Tyler's panel listening in Steam chat."></p>
<p align="center"><img src="assets/readme/feature-personality.png" width="100%" alt="Personality: presets, humor, edginess, helpfulness and chaos sliders, a written description, roast intensity, reply length, speed and talkativeness."></p>
<p align="center"><img src="assets/readme/feature-room.png" width="100%" alt="Room tools: the panel's Room tab with Music DJ open, and the Sounds tab with its soundboard pads."></p>
<p align="center"><img src="assets/readme/feature-desktop.png" width="100%" alt="The desktop app: its own Steam chat window, with Tyler's panel on air docked beside the chat."></p>
<p align="center"><img src="assets/readme/feature-remote.png" width="100%" alt="Phone remote: Tyler's panel on three phones, in the Steam, PAYDAY 2 and Pip-Boy themes, the last one showing the theme picker."></p>
<p align="center"><img src="assets/readme/feature-reliability.png" width="100%" alt="Long nights: the panel's Stay connected settings (hum after 45 quiet minutes, keep the chat connected) and the Checks tab with Run full check."></p>

<sub>Screenshots of the real panel and settings with sample data (the text spend and names are examples).</sub>

## Get going in a few minutes

1. **[Download Setup](https://github.com/treymun/Robotic-Tyler/releases/latest)** (`ROBOTIC-TYLER-Setup-<version>.exe`) and run it. Tick the **Desktop app** (recommended), the **Chrome extension**, or both.
2. Open ROBOTIC TYLER and sign in to your bot's Steam account in its Steam chat window.
3. In **Settings**, add an **OpenRouter** or **Google Gemini** key and pick a personality.
4. Open your group chat, then **Tyler's panel → Connect & start**, and join the voice channel. That's it: no virtual audio cable, no extra microphone.
5. *Optional:* **Settings → Overview → Phone remote**, scan the QR code with your phone and type the 6-digit code. Add the page to your home screen and Tyler is one tap away.

> Setup isn't code-signed. If Windows says *"Windows protected your PC"*, choose **More info → Run anyway**. Setup checks each download's SHA-256 before it runs it, and the desktop app updates itself.

## Desktop app or Chrome extension?

| | **Desktop app** (recommended) | **Chrome extension** |
|---|---|---|
| What it is | One Windows app with its own Steam chat window | Tyler inside Steam web chat in Google Chrome |
| Voice | In its Steam window, Tyler's own synthetic microphone. No VB-CABLE. | In the Steam tab, same synthetic microphone |
| Tyler's panel | Docked beside the chat (or floating), resizable | Floating over the chat, resizable |
| Music DJ and screen commentary | In-app YouTube window and screen picker | A YouTube tab and Chrome's share picker |
| Phone remote | Yes: a page on your home Wi-Fi | No (an extension can't serve one) |
| Staying connected | Quiet-call hum, chat reconnect | The same, and the tab stays awake in the background |
| Install and updates | Setup installs it, it updates itself | Setup unpacks it; Chrome needs *Developer mode → Load unpacked* once |
| Good for | A dedicated bot PC or account | Running Tyler next to your normal browsing |

Both run the same engine, settings and themes. Prefer the older desktop route through VB-CABLE and the Steam desktop app? It's still there: **Settings → Voice → Where Tyler joins voice**.

## Voice engines

- **Standard** waits for a pause, writes a reply with your AI provider (OpenRouter or Gemini) and speaks it, with Grok voices through OpenRouter or Google's voices with a Gemini key. Long replies are spoken in full.
- **Text models:** OpenRouter with Llama 3.3 70B, Mistral Small 3.2 or **Venice Uncensored** (each with its own provider routing, never Parasail), or Google Gemini with **3.1 Flash-Lite, 3.5 Flash-Lite or 3.8 Flash** (all on Google's free tier). **Test selected model** in Settings checks yours.
- **Gemini Live** is a real-time conversation with Google: Tyler hears the call as people talk, answers in about a second and stops when someone talks over him. It needs a Google AI key, and Google bills the audio while a session runs, so you start and stop every session yourself.

- **How he sounds:** Gemini Live replies play without crackle, the second half of a reply starts on the exact sample the first ends, and every reply comes out at the same loudness. Friends' voices reach his speech recognition through a proper filter, so "s" sounds don't turn into noise.

Your personality, reply length and rules always apply, and people in the call can't change them.

<p align="center"><img src="assets/readme/themes.png" width="100%" alt="The theme gallery: the real panel in each of the 25 themes, with its Tyler logo: Steam, Classic Steam, Team Fortress 2, Counter-Strike 2, Portal, Counter-Strike 1.6, HEV suit, Left 4 Dead, Windows XP, DOOM, Quake, Pip-Boy, Combine, Deadlock, Minecraft, PAYDAY 2, Dreamcast, Garry's Mod, Ricochet, Day of Defeat, Rust, Xbox 360, iPod classic, MSN Messenger, PlayStation 3"></p>

**Settings → Appearance** shows every theme as a live preview card, with the theme's real extras reacting as Tyler listens, thinks, talks, pauses or hits a problem; **Apply** changes every Tyler window at once (so does the phone remote's Setup tab). Every theme adds its own controls on top: Steam's persona menu and achievements, the Windows XP Start menu, a PAYDAY heist plan with a drill timer, a Minecraft hotbar of sound discs, a Deadlock shop, a Day of Defeat field radio and more. Game themes follow each game's own menu colors and shapes, with free look-alike fonts (bundled, SIL Open Font License). No game fonts are included.

## Privacy and consent

- Tyler only hears the Steam voice call he's in, and only after you confirm everyone knows he's listening. He never uses your physical microphone: his voice is a synthetic microphone that only carries what he says and plays.
- Your keys stay on your PC (encrypted by Windows in the desktop app) and never reach Steam's pages.
- Screen commentary only sees the window you pick, as still pictures, and only while you share it.
- The phone remote is off until you turn it on. It answers only devices on your home network, and only after pairing with a code from Settings. The phone sees what the panel shows, never your keys or the chat's messages. Remove a phone (or all of them) in Settings at any time.

## Trivia

Type `play trivia` in chat for a 10-question group race: 500 questions across 10 categories at three difficulty levels. Pick a mix with `play trivia solo gaming hard 5`. Speed and streak bonuses, a 50/50 hint, double points on the last question, and awards at the end. See [`docs/TRIVIA-GUIDE.md`](docs/TRIVIA-GUIDE.md) and [`docs/ARCADE-GUIDE.md`](docs/ARCADE-GUIDE.md).

<details>
<summary><b>Upgrading from an older version</b></summary>

- Run the newer Setup. Settings, keys, themes and memory are kept.
- **Chrome extension:** tick *Chrome extension* in Setup, then press **Reload** on Tyler's card in `chrome://extensions`.
- **Coming from 2.14 or older:** the desktop app replaces the separate *Control Center* (upgraded in place) and *Native Steam Companion (Voice Studio)*, whose settings, keys and device choices are imported the first time the desktop app starts. If both had different settings, it asks which to keep, then offers to remove the old Voice Studio.
- Also on each release: `ROBOTIC-TYLER-Chrome-Extension-<version>.zip`, the same extension for anyone not on Windows (unzip it and open *How to install.html*). The `ROBOTIC-TYLER-component-Desktop-…` files are for Setup and automatic updates.
</details>

<details>
<summary><b>For developers</b></summary>

| Path | What it is |
|---|---|
| `browser-extension/` | The source for everything. Chrome loads this folder as-is. |
| `app/`, `voice-app/` | The desktop app: main process, Steam window voice, Voice window (parts are generated from `browser-extension/`). |
| `windows-audio-bridge/` | The Windows audio helper for the VB-CABLE voice route (C#, NAudio). |
| `tools/setup/` | The Windows Setup (native Win32, `setup.c`) and its artwork (`art/`, rendered by `render-art.mjs`). |
| `docs/` | Feature guides (arcade, trivia, music, moderation) and older patch notes. |
| `CHANGES.md`, `RELEASING.md` | What changed in each release; tests, releases, updates and signing. |

```
npm install
node tools/build.mjs          # regenerate the desktop copies after editing browser-extension/
npm run test:all              # build check, unit tests, end-to-end tests in Chromium
npm run build:win             # Windows: the desktop installer, then the setup (needs .NET 8 and MinGW-w64)
npm run package:release       # dist/release/: Chrome zip, setup, install guide, notes, checksums
```
</details>

---

<sub>ROBOTIC TYLER is a free, unofficial fan project. It isn't affiliated with or endorsed by Valve, id Software, Bethesda, Mojang, Microsoft, Overkill Software, Starbreeze, Sega, Facepunch Studios or any other publisher; game names only describe each theme's style. Steam is a trademark of Valve Corporation. The HEV, Windows XP and Portal logos show those games' and Windows' own symbols (and the Dreamcast logo an orange swirl); see `tools/logos/README.md`.</sub>

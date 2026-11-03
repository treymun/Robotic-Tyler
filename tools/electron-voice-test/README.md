# ROBOTIC TYLER · Electron voice test (prototype 0.1.1)

A small, separate Windows app (not the ROBOTIC TYLER desktop app) that checks one thing: **can
Steam web voice hold a group call in Electron, the engine the desktop app uses, when the Steam
window calls itself Chrome?**

Why: Steam's web chat only starts voice in a browser that calls itself Chrome or Edge, and it sends
that name to Steam's voice server, which sets up the call from it. Electron calls itself
"Electron", so Steam refuses. WebView2 calls itself Edge and was dropped as soon as a second person
joined. This test's Steam window uses Google Chrome's exact user agent for its engine version
(Chromium 156, the same as your WebView2). The panel on the right is the same as in the WebView2 test.

Everything stays in `%LOCALAPPDATA%\RoboticTylerElectronVoiceTest`. The desktop app's settings,
keys and Steam sign-in are not touched. The panel only measures (states, levels, packet counts,
Steam's own voice messages); it never reads chat text or records audio.

## New in 0.1.1: the leave fix

In 0.1.0 the bot was dropped whenever someone left the call. The log showed why: after a leave,
Steam's voice server sends a new offer that lists one person's audio stream in a section the
browser still routes to another section. The browser rejects that offer ("Failed to set up audio
demuxing for mid='m1'"), and after one rejection it refuses every later offer on that connection,
so Steam ends the call.

The **leave fix** (on by default, in the panel under *Leave fix*) checks each description from
Steam's server before the browser sees it and removes only the lines that would collide. Each
person's audio stream keeps its identity, so Steam still plays everyone. A description with no
collision goes through unchanged. **Off (as in 0.1.0)** turns it off, to compare.

The report now also includes Steam's session descriptions (with addresses, ICE passwords and
certificate fingerprints removed), so if anything still fails, the exact lines are in the report.

## Start

1. Unzip `RoboticTyler-Electron-VoiceTest-0.1.1-win-x64.zip` anywhere (you can delete 0.1.0; your
   Steam sign-in is kept).
2. Run `RoboticTyler-Electron-VoiceTest.exe` (it has Electron's icon). It isn't signed: if Windows
   says *"Windows protected your PC"*, choose **More info → Run anyway**.
3. Sign in to the **bot account** in the Steam window if asked.

## Stage 1 · a normal call, and someone leaving

Keep **Same as Chrome** and **Leave fix: On** selected (the defaults).

1. Join the group's voice channel with the bot. Allow the microphone when asked.
2. Join the same channel with your main (Steam app), then with your friend.
3. Talk both ways for a bit. Tick the first two boxes only if you heard each other.
4. **The key test: your friend leaves the channel** while the bot and your main stay. Wait about
   15 seconds. The bot should stay in voice, and you should still hear each other.
   The panel's *"Someone left; the bot stayed in voice"* row turns green by itself.
5. Your friend joins again and leaves again once more.
6. Then your main leaves and rejoins while the bot stays.
7. Leave with the bot, and join again.
8. **Save report** (it goes to your Desktop) and send it.

Optional, to confirm the fix is what keeps the bot in: **Leave fix → Off**, repeat step 4. The bot
should drop like in 0.1.0. Switch it back **On** afterwards.

## Stage 2B · Tyler's own audio path (no AI)

Only after Stage 1 kept the bot in the call.

1. Disable the VB-CABLE devices and mute the bot PC's physical microphone (Windows sound settings).
2. Press **Stage 2B · Bridge only**. Steam reloads with a test bar at the bottom left.
3. Test bar: **1 · Enable synthetic mic**, then join voice with the bot, then with your main.
4. **2 · Test beep**: you should hear it on your main.
5. **3 · Listen + echo**: say a sentence on your main and pause; you should hear your own words come
   back through Tyler's synthetic microphone.
6. Your friend joins and leaves once: the bot should stay.
7. Leave with the bot, rejoin, beep and echo once more. Tick what you heard, **Save report**, send it.

## Afterwards

Close the test and delete `%LOCALAPPDATA%\RoboticTylerElectronVoiceTest` (the **Data folder**
button opens it). Turn VB-CABLE and the microphone back on if you use them.

## Building and automated checks

- `python3 tools/electron-voice-test/package.py` builds the zip (uses the desktop app's Electron
  version).
- `ELECTRON=<electron binary> node tools/electron-voice-test/check.mjs` runs the test app against a
  **mock** Steam page (no Steam servers, no Windows audio): bot joins, friend joins, friend leaves
  with the colliding offer. With the fix on the bot must stay; with it off the mock must reproduce
  the drop.
- `node tools/electron-voice-test/sdp-scenarios.mjs` runs the leave fix against nine kinds of
  re-offer in Playwright's Chromium (also a **mock**).

These checks show the fix works against the failure as reproduced locally. Only the live test with
Steam shows whether Steam's real offers are the same kind.

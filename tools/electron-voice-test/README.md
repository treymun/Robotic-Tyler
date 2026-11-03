# ROBOTIC TYLER · Electron voice test (prototype 0.1.0)

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

## Start

1. Unzip `RoboticTyler-Electron-VoiceTest-0.1.0-win-x64.zip` anywhere.
2. Run `RoboticTyler-Electron-VoiceTest.exe` (it has Electron's icon). It isn't signed: if Windows
   says *"Windows protected your PC"*, choose **More info → Run anyway**.
3. Sign in to the **bot account** in the Steam window (QR code or password and Steam Guard).

## Stage 1 · a normal call, with your main joining

Keep **Same as Chrome** selected (the default).

1. Open the group chat and join its voice channel with the bot. Allow the microphone when asked.
2. Wait about 10 seconds, then join the same channel with your main (Steam app).
3. The key question: **does the bot stay in voice?** Talk both ways for about 30 seconds. Tick the
   two boxes only if you both heard each other.
4. Leave with the bot, and join again while your main is still in the channel.
5. **Save report** (it goes to your Desktop) and send it.

Optional: **Electron default** shows what Steam does without the Chrome name. It should refuse
voice with "voice is unavailable in this browser".

## Stage 2B · Tyler's own audio path (no AI)

Only after Stage 1 kept the bot in the call.

1. Disable the VB-CABLE devices and mute the bot PC's physical microphone (Windows sound settings).
2. Press **Stage 2B · Bridge only**. Steam reloads with a test bar at the bottom left.
3. Test bar: **1 · Enable synthetic mic**, then join voice with the bot, then with your main.
4. **2 · Test beep**: you should hear it on your main.
5. **3 · Listen + echo**: say a sentence on your main and pause; you should hear your own words come
   back through Tyler's synthetic microphone.
6. Leave with the bot, rejoin, beep and echo once more. Tick what you heard, **Save report**, send it.

## Afterwards

Close the test and delete `%LOCALAPPDATA%\RoboticTylerElectronVoiceTest` (the **Data folder**
button opens it). Turn VB-CABLE and the microphone back on if you use them.

## Building

`python3 tools/electron-voice-test/package.py` (uses the desktop app's Electron version).

# ROBOTIC TYLER · WebView2 voice test (prototype 0.1)

A small, separate Windows app that answers one question before any production change: **can
Steam web voice, and then Tyler's own audio bridge, work inside Microsoft Edge WebView2?** If they
do, the desktop app could talk in Steam voice without VB-CABLE.

- It uses the **Evergreen WebView2 runtime** already on Windows and its **default browser
  identity** (the user agent is never changed).
- It keeps everything in its own folder, `%LOCALAPPDATA%\RoboticTylerWebView2VoiceTest`. The
  ROBOTIC TYLER desktop app, its settings, keys and Steam sign-in are never touched, and nothing
  here is part of its installers.
- The right-hand panel only measures: API support, microphone requests, WebRTC connection
  states, audio levels and packet counts. It never reads chat text or records audio. The report
  stays on your PC until you send it.

## You need

- Windows 10 or 11 (64-bit) with the **Microsoft Edge WebView2 Runtime** (Windows 11 has it; on
  Windows 10 check *Settings → Apps* for "Microsoft Edge WebView2 Runtime", or install the
  Evergreen Bootstrapper from https://developer.microsoft.com/microsoft-edge/webview2/).
- The bot's Steam account, a friend in the same Steam group, and a voice channel in that group.
- For Stage 2: the AI key you use with Tyler (OpenRouter for Standard voice).

## Start

1. Unzip `RoboticTyler-WebView2-VoiceTest-0.1.0-win-x64.zip` anywhere (Desktop is fine).
2. Run `RoboticTyler-WebView2-VoiceTest.exe`. It isn't code-signed: if Windows says *"Windows
   protected your PC"*, choose **More info → Run anyway**.
   (The `-small` zip is the same app without .NET inside; Windows offers to install the .NET 8
   Desktop Runtime the first time.)
3. Steam web chat opens on the left. Sign in to the **bot account** the normal way (QR code or
   password and Steam Guard). The sign-in is remembered in the test folder only.

## Stage 1 · a normal call (no Tyler)

Nothing of Tyler's is loaded. This checks that WebView2 itself can do Steam voice.

1. Keep **Stage 1 · Manual call** selected in the panel.
2. Open your group chat and join its voice channel.
3. When the test asks *"steamcommunity.com wants to use your microphone"*, choose **Yes**.
4. Talk with your friend for about 30 seconds, both ways. The five stages should turn green in
   order, and the Out and In meters move when each of you talks.
5. Tick **I heard my friend** and **My friend heard me** only if you both did.
6. Press **Save report** (it goes to your Desktop and is copied to the clipboard) and send it.

What each stage means when it fails:

| Stage | Fails when | Usually means |
|---|---|---|
| Browser support | WebRTC, the microphone API, Web Audio or Opus is missing | the WebView2 runtime is too old or broken |
| Audio permission | the prompt was denied, or Steam couldn't open the microphone | Windows privacy settings block microphone access for desktop apps, or the device is busy |
| Room join | Steam never shows you in the channel and no offer/answer happens | Steam rejected this browser for voice, or the click didn't reach Steam |
| Peer connection | ICE fails | a firewall, VPN or proxy blocks Steam's voice servers |
| Audio transfer | packets flow but are silent, or nothing flows | a muted microphone, the wrong input device, or one-way audio |

## Stage 2 · Tyler in the call (the real requirement)

Only after Stage 1 worked.

1. **Windows sound settings:** disable both VB-CABLE devices (*Settings → System → Sound → All
   sound devices → CABLE Input / CABLE Output → Don't allow*) and mute the bot PC's physical
   microphone (or set its input volume to 0).
2. In the panel press **Stage 2 · Tyler (extension)**. The test installs its bundled copy of
   Tyler's Chrome extension into the test profile and reloads Steam. The checklist's first line,
   *Tyler loaded in Steam chat*, should turn green.
3. Press **Tyler settings**. In that window add your AI key (*AI & personality*), and in
   *Voice* choose Standard voice and tick the listening-consent box. Save, then close it.
4. In Steam, open the group chat. In Tyler's panel press **Connect & start**.
5. Join the group's voice channel. If the test asks for the microphone, choose **No** and write it
   in the notes: Tyler's synthetic microphone should make that request unnecessary.
6. Tyler's panel → **Checks → Run connection checks**: Tyler plays a beep into the call. Tick
   **Friend heard Tyler's test beep** when your friend confirms.
7. Your friend says something to Tyler and pauses. Tyler should answer out loud. Tick when your
   friend hears it.
8. Your friend types a message to Tyler in the group's text chat. Tyler should reply in text in
   the same room. Tick.
9. Leave the voice channel, join it again, and repeat 6 and 7. Tick the last two lines.
10. **Save report** and send it.

## Stage 2B · bridge only (fallback)

Use this only if Stage 2 can't load Tyler (the first checklist line stays red, or the Tyler
settings window doesn't open). It injects just Tyler's in-page audio files, the same ones the
extension runs, plus a small test bar at the bottom left of the Steam window. No AI and no text.

1. VB-CABLE disabled and microphone muted, as for Stage 2.
2. Press **Stage 2B · Bridge only**. Steam reloads with the test bar.
3. Test bar: **1 · Enable synthetic mic**, then join the voice channel.
4. **2 · Test beep**: your friend should hear it.
5. **3 · Listen + echo**: your friend says a sentence and pauses, and hears their own words come
   back through Tyler's synthetic microphone. That proves the full audio path (call → Tyler →
   call) without the AI.
6. Leave, rejoin, beep and echo once more. Tick what your friend confirms, then **Save report**.

## What the results decide

| Result | Recommendation |
|---|---|
| Stage 1 fails at support, room join or peer connection | WebView2 can't carry Steam voice: run voice in a dedicated Chrome process behind the desktop UI |
| Stage 1 and Stage 2 pass, including the rejoin | WebView2 integration is viable and reuses the extension almost unchanged |
| Stage 1 passes, Stage 2 can't load Tyler, Stage 2B passes | WebView2 can carry Tyler's audio, but the extension runtime needs a port (like the desktop app's chrome.* stand-in); weigh that against a Chrome process |
| Stage 1 passes, Stage 2B fails | WebView2 voice works but not with Tyler's bridge: Chrome process |

## Afterwards

Close the test and delete `%LOCALAPPDATA%\RoboticTylerWebView2VoiceTest` (the **Data folder**
button opens it). That removes the test sign-in and the key you entered in Stage 2. Turn VB-CABLE
and the microphone back on if you use them.

## Building

`node tools/webview2-voice-test/package.mjs` with the .NET 8 SDK installed (on Linux use
Microsoft's SDK build, which includes the Windows Desktop targets; set `DOTNET` to its `dotnet`).
It writes both zips to `dist/webview2-voice-test/`.

`node tools/webview2-voice-test/check.mjs` (with `MODE=manual` or `MODE=bridge`) runs the page
scripts and the panel in Chromium against a **mock** Steam page whose "voice channel" is a second
page over real WebRTC. It checks the stage logic and that Tyler's bridge beeps, hears and echoes
through a rejoin. It is not WebView2 and not Steam, so it can't replace the live test.

Files: `MainForm.cs` (window, WebView2, permissions, extension handling), `web/diagnostics.js`
(runs in the Steam page), `web/bridge-only.js` (Stage 2B test bar), `web/panel.*` (the panel).

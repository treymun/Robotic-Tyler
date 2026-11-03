# ROBOTIC TYLER v2.1 — Native Steam Companion (experimental)

Three programs are included:

1. **Control Center (Electron EXE)** — the existing Steam web **text-only** companion and settings; no voice.
2. **Native Steam Companion (separate Electron EXE)** — a **local desktop dashboard** with Windows WASAPI audio routing using a C#/.NET helper. It operates alongside normal `steam.exe`. It never embeds Steam or opens a second Steam login. The helper plays AI TTS to VB-CABLE, which Steam sees as a microphone, and can optionally record 5 seconds of a selected Windows playback device, transcribe, and reply. It **does not** automatically read native Steam group text chat or isolate individual speakers, and it does not yet offer continuous automatic group conversation. Its feature settings UI is reused from the existing Command Center, but not all chat automation features have an operating native Steam connector.
3. **Chrome extension** — preserved unchanged from v2.0, with the fuller Steam web voice bridge, text automation and Squad features.

## Build two EXEs on Windows

Install Node.js LTS, .NET 8 SDK and a virtual audio device such as VB-CABLE (https://vb-audio.com/Cable/). Double-click `BUILD-BOTH-WINDOWS-EXES.cmd` to build both app installers and, when MinGW-w64 is installed, the one Windows setup (`dist/setup/ROBOTIC-TYLER-Setup-<version>.exe`) that installs either or both. This build fetches NAudio via NuGet and Electron via npm. The ZIP is the source and build project, **not** already-compiled EXEs. Internet access is necessary at build time.

## Native Steam audio setup

1. Launch native Steam.exe and open its group voice chat as normal.
2. Launch ROBOTIC TYLER Native Steam Companion, choose the Windows output device named **CABLE Input (VB-Audio Virtual Cable)**.
3. Steam Settings → Voice → Input device: choose **CABLE Output (VB-Audio Virtual Cable)**.
4. In the Companion, open Settings and configure OpenRouter. Use **Play test tone** while a friend is listening in the room.
5. Type a prompt in Voice Studio: the AI should generate a reply and play it over the virtual microphone. A short 5-second loopback recording is optional and captures **all** sound playing through that selected Windows output device (not just Steam). Keep group consent and privacy in mind. Choose Steam’s speakers/headphones as the separate listening device; keep CABLE Input as the AI output. This is still experimental and may capture other system sounds.
6. To send your own voice too, use a trusted audio mixer (e.g. Voicemeeter) to combine your physical microphone and the AI output into one virtual input.

## What works vs. what doesn't

Implemented at source level: desktop dashboard and familiar settings window, selected-device audio test, AI text prompt → LLM → speech → Windows output device, optional loopback short recording → transcription → LLM → speech, and two EXE build targets. Chrome extension and text Control Center remain packaged unchanged.

Not implemented: automatic native Steam text-chat reading, Steam program memory injection, per-speaker audio isolation, true real-time full-duplex group voice, fully automatic native Steam audio assistant, or guaranteed app/Steam voice parity. Automated Windows audio validation and actual installation must occur on a Windows PC. Audio helper source is provided for review.

The native helper communicates only via CLI; it neither hooks nor modifies Steam, does not bypass anti-cheat, and does not directly control Steam's microphone setting.

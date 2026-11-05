# ROBOTIC TYLER v2.2 — Chrome-first experimental upgrade

## Three programs retained
- `browser-extension/`: primary Steam web-chat/voice companion.
- `app/`: text-only Electron Control Center with tray and event log in memory.
- `voice-app/`: experimental standalone native Steam audio companion, preserved from v2.1, no feature parity claims.

## Implemented in v2.2
- Chrome turn-taking preferences (quiet/balanced/social), layered over existing pause-before-reply and barge-in.
- Chrome voice track watchdog: rescans missing incoming audio tracks at most once a minute; it cannot rejoin disconnected Steam rooms.
- Profile presets on both settings pages; safe JSON export and import (excluding secrets and chat histories).
- Emergency stop in Chrome tabs and a persistent stop flag, with a deliberate Unlock button. Does not cancel requests already processed by third-party providers.
- Chrome diagnostic latency display of actual returned per-turn timing samples (when voice results include timings).
- Electron tray shortcut and bounded in-memory activity list, displayed in the desktop settings (no conversation contents).

## Explicitly experimental / not fully implemented
- **Streaming AI speech:** OpenRouter text streaming existed already, but incremental audio playback is NOT implemented; spoken replies still wait for TTS completion.
- **Speaker recognition:** opt-in preference for associating known, verified Steam text authors, NOT distinguishing people in voice. No audio speaker recognition implementation.
- **Voice reconnect:** watchdog scans tracks, but cannot automatically rejoin rooms.
- The audio helper and standalone native Steam companion require Windows live verification.

## Steam commands
`!help` summarizes commands when verified chat message IDs are available; `Ctrl+Shift+H` toggles a local help panel.

## Settings backups
The backup explicitly excludes AI provider keys, friend chat histories, and private data. Keep the saved JSON private because non-secret preference text may still contain names or personal notes.

## Install
Disable previous extension, load `browser-extension/` unpacked in chrome://extensions, open `settings.html` via extension options. To build desktop installers, consult `README-THREE-VERSIONS.md`.

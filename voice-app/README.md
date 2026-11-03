# ROBOTIC TYLER Steam Voice Studio (experimental)

Standalone Electron executable, *not* a Chrome launcher. It embeds Steam chat in a dedicated Chromium window and injects the same browser voice scripts used by the Chrome extension. It keeps its own Steam login, keys and local profile.

**Compatibility not guaranteed:** Steam group voice support may vary between Chromium/Electron builds. Open the voice channel on the bot account, enable the bridge before joining, and use Steam microphone meter plus a second account to verify sound. You may need to rejoin voice after enabling. Stop if it does not transmit; use the Chrome extension as the proven fallback.

This voice studio cannot connect to your already-running Steam client voice session; its own embedded Steam chat must be joined. Never run voice automation in both Studio and extension on the same Steam account at once.

ROBOTIC TYLER — Windows EXE Builder (v1.9.1)

What this does:
- Builds a normal Windows installer (with desktop/Start-menu shortcuts)
- Builds a portable Windows EXE (no installer required)
- Gives the Electron desktop app a branded icon and Control Center title
- Keeps the Chrome extension and its voice features completely separate

TO BUILD ON WINDOWS:
1. Install Node.js LTS from https://nodejs.org (once).
2. Extract this entire ZIP to a folder (not inside the ZIP preview).
3. Double-click BUILD-WINDOWS-EXE.cmd. Requires internet the first time.
4. After packaging finishes, find the two EXEs in the dist folder.
5. Install the setup EXE, then open ROBOTIC TYLER from the Start menu/desktop.

The BUILD command shows a console ONLY while creating the installer. The finished
application opens normally without a terminal.

If Windows SmartScreen warns that the app is from an unknown publisher, that's
because this local build is not code-signed. Check the builder project, keep the
installer to yourself, and do not distribute it as verified/signed software.

Chrome extension installation: chrome://extensions > Developer mode > Load unpacked
> select browser-extension. Chrome remains the voice-chat host. Electron is text-only.

Technical notes:
- Windows x64 build is configured.
- Steam logins and settings live in per-user data folders (not in the EXE).
- No downloaded game content is bundled with the installer.
- This packaging setup has not been compiled/tested on Windows in this environment.

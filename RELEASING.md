# Testing, releasing and automatic updates

## Automatic testing (GitHub Actions)

`.github/workflows/ci.yml` runs on every push and pull request:

1. `npm run check`: the generated desktop files and `ui-template.js` match their sources.
2. `npm test`: unit and integration tests (Node only, no browser).
3. `npm run test:e2e`: two end-to-end tests in real Chromium.
   - The unpacked extension loads, its service worker boots, both content-script worlds inject on a stand-in `https://steamcommunity.com/chat/` page, the panel claims the tab lease and the settings page opens.
   - The audio bridge plays the early first sentence and the rest of a reply back to back, replaces it when a new reply starts, and clears the queue on Stop.
4. Screenshots of every surface and theme (`npm run preview`) and the Chrome download (`npm run package:release`), both uploaded as build artifacts.

On pushes to `main`, a Windows job also builds the desktop app's installer (with the Windows audio
helper inside) and the setup, and uploads them as artifacts.

To run everything locally:

```
npm install
npx playwright install chromium
npm run test:all
```

## Publishing a release

1. The project lives at **github.com/treymun/Robotic-Tyler**. The workflow points the updater and
   the setup at the repository it runs in (`tools/set-release-repo.mjs`). For local release builds,
   run it yourself once: `node tools/set-release-repo.mjs <your-github-name>/<repo>`
2. Bump `"version"` in `package.json` and `browser-extension/manifest.json`, and add a section at the
   top of `CHANGES.md`. Push to `main`.
3. Publish, either way:
   - on GitHub: **Actions → CI → Run workflow**, tick **Publish**, then **Run workflow**; or
   - push a tag: `git tag v2.14.0 && git push origin v2.14.0`.

The Windows job builds both app installers and publishes them to the GitHub Release
`v<version>`, builds the setup against them, then adds the setup, the Chrome extension zip and
checksums, and writes the release page (the Setup download, plus the newest section of
`CHANGES.md`). A release that already has its setup is left alone if the job runs again, because
rebuilt installers wouldn't match the checksums in the setup people already downloaded; bump the
version instead. `npm run package:release` builds the same files locally in `dist/release/`.

What people download (the two primary files):

| File | Contents |
|---|---|
| `ROBOTIC-TYLER-Setup-<version>.exe` | **The download.** The Windows setup (`tools/setup/`): the Chrome extension (packed inside it) and/or the desktop app |
| `ROBOTIC-TYLER-Chrome-Extension-<version>.zip` | The same Chrome extension for anyone not on Windows: `ROBOTIC TYLER Chrome extension/` (Load unpacked) and `How to install.html` |

Also on the release, for the setup and for automatic updates (not for people to pick):

| File | Contents |
|---|---|
| `ROBOTIC-TYLER-component-Desktop-<version>.exe` (+ `.blockmap`, `control.yml`) | The desktop app's own NSIS installer. It keeps the Control Center's app id and `control` update channel, so Control Center installs upgrade into it |
| `SHA256SUMS.txt` | Checksums for all of the above |

### How the setup works

`npm run build:setup` (`tools/setup/build-setup.mjs`) compiles `tools/setup/setup.c`, a small native
Win32 program, after the two component installers exist. It records each component's file name, size,
SHA-256, registry key (electron-builder's GUID for that app id) and the download address
`https://github.com/<owner>/<repo>/releases/download/v<version>/`, taken from the publish settings.
When someone runs it, it:

1. finds what's installed (the per-user or per-machine uninstall entry of each app, and the version in
   the unpacked extension's `manifest.json`) and shows each part as not installed, out of date, up to
   date or newer than the setup;
   - the **Chrome extension** is packed inside the setup (`browser-extension/`, byte for byte) and
     unpacked to `%LOCALAPPDATA%\ROBOTIC TYLER\Chrome extension`; Finish opens Chrome's extensions
     page and that folder and copies its path for **Load unpacked**;
2. downloads only the ticked apps' component installers (WinHTTP, system proxy, TLS 1.2+), with
   per-app progress, cancel and Retry; a component file placed next to the setup is used offline;
3. refuses any file whose size or SHA-256 differs from the recorded one;
4. runs each installer silently (`/S /currentuser`, or `/allusers` when an existing install is
   per-machine; `--no-desktop-shortcut` when unticked), then checks Windows lists the new version;
5. offers to open the installed apps.

It never touches the app's data folder (`%LOCALAPPDATA%\RoboticTylerHydraCloudV12`) or the old Voice
Studio's (`%APPDATA%\RoboticTylerNativeSteamCompanion`). The desktop app imports the Voice Studio's
settings itself on first start (asking when settings conflict) and offers to run its uninstaller.
Since 2.15 the release has no `voice.yml`: an old Voice Studio's update check finds nothing new,
so its users move over with Setup. Command-line options for testing and admins are listed at the top of `tools/setup/setup.c`.

Building the setup needs MinGW-w64 (`gcc` and `windres`). The CI Windows runner installs it if it's
missing; locally use `winget install BrechtSanders.WinLibs.POSIX.UCRT` (Windows) or
`apt install gcc-mingw-w64-x86-64` (Linux, cross-compiling).
The installer artwork in `build/` and every logo file are generated by `python3 tools/logo/render.py`.
The desktop app's update feed is `control.yml`.

## Automatic updates

Installed copies check GitHub Releases 20 seconds after launch and every 6 hours. A new version
downloads in the background and installs when you quit the app. **Check for updates…** in the
app's menu and tray (and in the Voice window's sidebar) checks on demand.

Updates are off, and **Check for updates…** says why, when any of these is true:

- you're running from source (`npm start`)
- the build was made before a release repository was set

## Code signing

Unsigned installers work, but Windows SmartScreen shows an "unknown publisher" warning. To sign:

1. Get a Windows code-signing certificate as a `.pfx` file, from a certificate authority or a cloud signing service.
2. Add two repository secrets:
   - `WINDOWS_CERT_P12`: the `.pfx` file, base64-encoded (`base64 -w0 cert.pfx`)
   - `WINDOWS_CERT_PASSWORD`: its password

The workflow passes them to electron-builder (`CSC_LINK` / `CSC_KEY_PASSWORD`) to sign both app
installers, and signs the setup with `signtool`. Without the secrets it builds unsigned and leaves a warning in the run summary. For local
signed builds, set the same two environment variables before `npm run build:desktop`.

The Chrome extension doesn't need signing. Load it unpacked as before, or download
`chrome-extension.zip` from a CI run.

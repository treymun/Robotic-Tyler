# ROBOTIC TYLER Setup

`ROBOTIC-TYLER-Setup-<version>.exe` is the one Windows download. It sets up any mix of:

- the **Chrome extension**, packed inside the setup and unpacked to
  `%LOCALAPPDATA%\ROBOTIC TYLER\Chrome extension`;
- the **desktop app** (Steam text chat and Steam voice; it replaced the Control Center and the
  Voice Studio in 2.15).

The desktop app comes from its own installer (`ROBOTIC-TYLER-component-Desktop-…`, made by
electron-builder), which the installed app also updates from. It keeps the Control Center's app id,
so a Control Center is upgraded in place. `/components=control` or `voice` still select it.

For the extension, Finish opens Chrome's extensions page and the folder, and copies the folder path.
You add it once with Developer mode → **Load unpacked**; Chrome only adds extensions from outside its
Web Store that way. Later setups unpack over the same folder, so Chrome keeps the same extension and
its settings. Files an older version had are removed, using the list kept in
`%LOCALAPPDATA%\ROBOTIC TYLER\chrome-extension-files.txt`. Then press **Reload** on Tyler's card.

| File | What it is |
|---|---|
| `setup.c` | The program: plain Win32 + WinHTTP + Windows CNG, nothing to install. |
| `build-setup.mjs` | Builds it after the component installers exist. Run it with `npm run build:setup`. |
| `nsis-guid.mjs` | The registry key electron-builder's installer uses for an app id. Setup looks for installed apps there. |
| `art/` | The two part icons (v2.19), in the app's Steam theme, designed as HTML and rendered to PNGs at 100/150/200 % by `render-art.mjs` (Playwright); `build-setup.mjs` embeds them. Everything else in the window is drawn by `setup.c` with the app's own colours (`browser-extension/ui/tokens.css`). `art/nsis-sidebar.html` is the desktop installer's sidebar (`build/installer-sidebar-control.bmp`). |
| `render-art.mjs` | Renders `art/` after a design change: `node tools/setup/render-art.mjs`. |

## Building

```
npm run build:desktop  # the desktop installer (dist/desktop)
npm run build:setup    # dist/setup/ROBOTIC-TYLER-Setup-<version>.exe
```

The build records each component's file name, size and SHA-256, plus its registry key, display
name and exe name. All of these come from `electron-builder.desktop.json`, so
they can't drift apart. It also records the download address,
`https://github.com/<owner>/<repo>/releases/download/v<version>/`, taken from those files' publish
settings (`node tools/set-release-repo.mjs <owner>/<repo>`). Use `--base-url <url>` to point a
build at a mirror instead.

The build needs MinGW-w64:

- Windows: `winget install BrechtSanders.WinLibs.POSIX.UCRT`, or `choco install mingw`;
- Ubuntu: `apt install gcc-mingw-w64-x86-64`.

You can also point `CC` and `WINDRES` at your own tools.

Rebuild the setup whenever a component installer changes. A setup only installs the exact files it
was built against.

## What it does

1. **Detects** the desktop app in the per-user or per-machine uninstall entries. It shows each one as not
   installed, out of date, up to date or newer than this setup, and notes when an app is open.
2. **Downloads** only the ticked apps, over HTTPS with the system proxy and TLS 1.2+. It shows
   progress per app and can be cancelled.
   - A component file next to the setup, or left from an earlier try, is used instead of
     downloading.
3. **Verifies** the size and SHA-256 of every file before it runs. A file that doesn't match is
   deleted.
4. **Installs** the desktop app silently:
   - `/S /currentuser`, or `/allusers` when the existing install is per-machine;
   - adds `--no-desktop-shortcut` when that option is off.

   It then checks that Windows lists the new version. Failures give a reason and a **Retry** button.
5. **Opens** the installed apps on Finish, if you leave their boxes ticked.
6. **Theme voices (optional, v2.35):** *Also add local theme voices* is unticked by default (the standard
   install). Ticked, Setup opens the desktop app on Finish with `--install-theme-voices`, which shows a
   guided step in Settings → Theme voices: this PC's compatibility, the download size and disk
   space, and Quality vs Lightweight. Nothing is downloaded until **Install now**; **Not now** skips it
   for good (it can be installed later from the same place). Setup itself never downloads the voice
   engine or models, so the normal setup and desktop installer stay small.

The setup never reads or writes the apps' data folders, registry entries or install folders itself.
Settings, keys and themes survive updates, repairs and uninstalls.

The desktop app keeps its own install folder, uninstall entry, Start-menu shortcut, update channel and update cache.

Logs go to `%TEMP%\ROBOTIC TYLER Setup <version>\setup.log`.

## Command line

| Option | Effect |
|---|---|
| `/components=chrome,desktop` | Preselect parts (`control` or `voice` also mean the desktop app). |
| `/components=desktop,voices` | Also tick *Also add local theme voices*. |
| `/auto` | Start installing right away and close when done. Exit codes: 0 all installed, 1 something failed, 2 cancelled. |
| `/nodesktop` | Untick desktop shortcuts. |
| `/source=<url or folder>` | Download from a mirror or a local folder instead of the release. Files are still verified. |
| `/log=<file>` | Write the log somewhere else. |

## Testing under Wine

Wine's built-in `powershell.exe` is a stub that reports success for every command. That makes the
component installers think the app is running, and they stop with code 2. Replace it in the test
prefix with a program that exits with code 1, so the installers fall back to `tasklist`. Real
Windows doesn't need this.

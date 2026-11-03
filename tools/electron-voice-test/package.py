#!/usr/bin/env python3
"""Builds the Electron voice test (prototype) for Windows into dist/electron-voice-test/:
RoboticTyler-Electron-VoiceTest-<version>-win-x64.zip. It takes Electron's own Windows build (the
same version as the desktop app), renames electron.exe, and puts this app in resources/app with the
test panel (tools/webview2-voice-test/web) and Tyler's in-page audio files (browser-extension/).
Not part of the desktop app, its installers or CI.   python3 tools/electron-voice-test/package.py
Set ELECTRON_ZIP to a downloaded electron-v<version>-win32-x64.zip to skip the download."""
import json, os, shutil, sys, urllib.request, zipfile
HERE = os.path.dirname(os.path.abspath(__file__)); ROOT = os.path.abspath(os.path.join(HERE, '..', '..'))
version = json.load(open(os.path.join(HERE, 'package.json')))['version']
electron = json.load(open(os.path.join(ROOT, 'package.json')))['devDependencies']['electron'].lstrip('^~')
name = f'RoboticTyler-Electron-VoiceTest-{version}-win-x64'
out = os.path.join(ROOT, 'dist', 'electron-voice-test'); top = os.path.join(out, name)
shutil.rmtree(out, ignore_errors=True); os.makedirs(out)
src = os.environ.get('ELECTRON_ZIP') or os.path.expanduser(f'~/.cache/electron/electron-v{electron}-win32-x64.zip')
if not os.path.exists(src):
    src = os.path.join(out, 'electron.zip')
    urllib.request.urlretrieve(f'https://github.com/electron/electron/releases/download/v{electron}/electron-v{electron}-win32-x64.zip', src)
zipfile.ZipFile(src).extractall(top)
os.rename(os.path.join(top, 'electron.exe'), os.path.join(top, 'RoboticTyler-Electron-VoiceTest.exe'))
for f in ('resources/default_app.asar',):
    p = os.path.join(top, f)
    if os.path.exists(p): os.remove(p)
# English only: the other 54 interface languages are about 48 MB the test doesn't need.
for f in os.listdir(os.path.join(top, 'locales')):
    if f != 'en-US.pak': os.remove(os.path.join(top, 'locales', f))
app = os.path.join(top, 'resources', 'app'); os.makedirs(os.path.join(app, 'web')); os.makedirs(os.path.join(app, 'bridge'))
for f in ('package.json', 'main.cjs', 'preload-steam.cjs', 'preload-panel.cjs'): shutil.copy(os.path.join(HERE, f), app)
web = os.path.join(ROOT, 'tools', 'webview2-voice-test', 'web')
for f in ('panel.html', 'panel.css', 'panel.js', 'diagnostics.js', 'bridge-only.js', 'tyler.png'): shutil.copy(os.path.join(web, f), os.path.join(app, 'web'))
for f in ('soundboard-core.js', 'soundboard-audio.js', 'live-pcm.js', 'audio-bridge.js', 'wav-codec.js', 'noise-filter.js', 'voice-listener.js'):
    shutil.copy(os.path.join(ROOT, 'browser-extension', f), os.path.join(app, 'bridge'))
shutil.copy(os.path.join(HERE, 'README.md'), top)
zpath = os.path.join(out, name + '.zip')
with zipfile.ZipFile(zpath, 'w', zipfile.ZIP_DEFLATED, compresslevel=9) as z:
    for dirpath, _, files in os.walk(top):
        for f in sorted(files):
            full = os.path.join(dirpath, f); z.write(full, os.path.relpath(full, out))
print('wrote', os.path.relpath(zpath, ROOT), f'{os.path.getsize(zpath)/1048576:.1f} MB', '(Electron', electron + ')')

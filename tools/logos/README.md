# Theme logos

Each theme has its own ROBOTIC TYLER logo. The artwork is the owner's
"ROBOTIC-TYLER-Ten-Theme-Logos-v2" pack and, for Quake, Fallout Pip-Boy, Half-Life 2
Combine, Deadlock and Minecraft (v2.17), the "Five New Theme Logos" pack, whose masters,
manifest and art briefs are kept in `assets/theme-logos/` (not shipped in the installers).
Both are used unchanged apart from alignment.

- `aligned/<theme>.png` (512 px): the ten logos scaled and shifted so the glasses sit
  at the same height and width in every square. Switching themes then swaps the
  outfit, not the position of the face. Hats, helmets, frames and chest emblems
  stay fully inside the square.
- `align.py`: how `aligned/` was made from the packs' 1254 px masters (glasses
  landmarks are listed at the top). Run it on a pack's `masters/` folder (it handles the
  files it finds), then downscale the output to 512 px. Combine is drawn in a
  three-quarter pose, so its left landmark is the near edge of the mask, not the
  foreshortened glasses.
- `export.py`: makes the app files in `browser-extension/ui/logos/` from `aligned/`.
  Then run `node tools/build.mjs`. Give theme names to export only those
  (`python3 tools/logos/export.py quake minecraft`). DOOM and Minecraft are pixel art and
  are resized without smoothing (the apps also draw them with pixelated rendering).

Where the logo shows: the chat panel header (drawn on a canvas from bytes embedded in
`ui-logos.js`, so Steam's page policy can't block it), the settings page, the Voice
Studio, the Chrome toolbar icon, and the desktop apps' window and tray icons. Unknown
themes or a missing file fall back to the Steam logo. Theme keys: steam, classic,
tf2, cs2, portal, cs16, hev, l4d, winxp, doom, quake, pipboy, combine, deadlock, minecraft.

Note: the HEV, Windows XP and Portal logos include those games' and Windows' own
symbols (the λ, the four-colour flag, the Aperture badge). Fine for personal use;
consider them before publishing the app.

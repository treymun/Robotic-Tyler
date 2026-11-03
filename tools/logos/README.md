# Theme logos

Each theme has its own ROBOTIC TYLER logo. The artwork is the owner's
"ROBOTIC-TYLER-Ten-Theme-Logos-v2" pack and, for Quake, Fallout Pip-Boy, Half-Life 2
Combine, Deadlock and Minecraft (v2.17), the "Five New Theme Logos" pack, whose masters,
manifest and art briefs are kept in `assets/theme-logos/` (not shipped in the installers).
PAYDAY 2, Sega Dreamcast, Garry's Mod, Ricochet and Day of Defeat: Source (v2.18) were cut
from the supplied preview image; the cut-outs and the preview are kept in
`assets/theme-logos/themes-16-20/`. All are used unchanged apart from alignment.

- `aligned/<theme>.png` (512 px): the ten logos scaled and shifted so the glasses sit
  at the same height and width in every square. Switching themes then swaps the
  outfit, not the position of the face. Hats, helmets, frames and chest emblems
  stay fully inside the square.
- `align.py`: how `aligned/` was made from the packs' 1254 px masters (glasses
  landmarks are listed at the top). Run it on a pack's `masters/` folder (it handles the
  files it finds), then downscale the output to 512 px. Combine is drawn in a
  three-quarter pose, so its left landmark is the near edge of the mask, not the
  foreshortened glasses.
- `small.py` (v2.18): dedicated small-size versions in `small/`, made after comparing every
  logo at 32 and 64 px on its theme's real panel background. Dreamcast and Day of Defeat:
  Source are centred and enlarged (the VMU and the radio handset sat off-centre), Quake's
  midtones are lifted (dark brown on a dark frame). The apps use them at 48 px or less.
- `export.py`: makes the app files in `browser-extension/ui/logos/` from `aligned/` (and
  `small/`): 128 px PNG and WebP, and sharpened 16/32 px toolbar icons. The apps don't let the
  browser shrink a logo: `ui-logos.js` resamples it to the exact device-pixel size (Lanczos
  plus a light unsharp mask) for the chat panel, compact mode, settings, gallery and Voice window.
  Then run `node tools/build.mjs`. Give theme names to export only those
  (`python3 tools/logos/export.py quake minecraft`). DOOM and Minecraft are pixel art and
  are resized without smoothing (the apps also draw them with pixelated rendering).

Where the logo shows: the chat panel header (drawn on a canvas from bytes embedded in
`ui-logos.js`, so Steam's page policy can't block it), the settings page, the Voice
Studio, the Chrome toolbar icon, and the desktop apps' window and tray icons. Unknown
themes or a missing file fall back to the Steam logo. Theme keys: steam, classic,
tf2, cs2, portal, cs16, hev, l4d, winxp, doom, quake, pipboy, combine, deadlock, minecraft,
payday, dreamcast, gmod, ricochet, dod.

Note: the HEV, Windows XP and Portal logos include those games' and Windows' own
symbols (the λ, the four-colour flag, the Aperture badge), and the Dreamcast logo shows an
orange swirl on the VMU. Fine for personal use; consider them before publishing the app.

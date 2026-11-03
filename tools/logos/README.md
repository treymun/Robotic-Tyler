# Theme logos

Each theme has its own ROBOTIC TYLER logo. The artwork is the owner's
"ROBOTIC-TYLER-Ten-Theme-Logos-v2" pack, used unchanged apart from alignment.

- `aligned/<theme>.png` (512 px): the ten logos scaled and shifted so the glasses sit
  at the same height and width in every square. Switching themes then swaps the
  outfit, not the position of the face. Hats, helmets, frames and chest emblems
  stay fully inside the square.
- `align.py`: how `aligned/` was made from the pack's 1254 px masters (glasses
  landmarks are listed at the top). Run it on the pack's `masters/` folder, then
  downscale the output to 512 px.
- `export.py`: makes the app files in `browser-extension/ui/logos/` from `aligned/`.
  Then run `node tools/build.mjs`.

Where the logo shows: the chat panel header (drawn on a canvas from bytes embedded in
`ui-logos.js`, so Steam's page policy can't block it), the settings page, the Voice
Studio, the Chrome toolbar icon, and the desktop apps' window and tray icons. Unknown
themes or a missing file fall back to the Steam logo. Theme keys: steam, classic,
tf2, cs2, portal, cs16, hev, l4d, winxp, doom.

Note: the HEV, Windows XP and Portal logos include those games' and Windows' own
symbols (the λ, the four-colour flag, the Aperture badge). Fine for personal use;
consider them before publishing the app.

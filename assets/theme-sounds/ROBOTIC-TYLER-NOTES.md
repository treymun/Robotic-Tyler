# The 25-theme soundboard pack in ROBOTIC TYLER (v2.31)

This folder is the owner's pack as supplied, except `previews/` (one continuous audition MP3 per
theme, a listening aid only; it is in the original ZIP).

- `tools/sounds/compile.mjs` (run by `node tools/build.mjs`) checks `manifest.json` (25 themes, ten
  clips each, the pads' names, file hashes, the clip limits) and copies `audio/` to
  `browser-extension/sounds/themes/` and the desktop app, with `CREDITS.md` and `SOUND-MAP.csv`.
  It also writes `browser-extension/theme-sounds.mjs`, the theme → pad map.
- Only pads 1–10 are themed, and only while you haven't uploaded your own clip to that pad. Sound 11
  onward is your own collection in every theme. Nothing here is ever saved over your soundboard.
- The clips play through the soundboard's usual path (base64 clip, the soundboard volume, Tyler's
  microphone). Measured through that player at the default volume, they were about 3 dB quieter than
  the synthesized built-ins they replace, so all 250 play 3 dB up; their balance and dynamics are as
  supplied. No other processing.
- `source-originals/`, `recipes.json` and `render_pack.py` stay here for provenance and rebuilding;
  they are not shipped.

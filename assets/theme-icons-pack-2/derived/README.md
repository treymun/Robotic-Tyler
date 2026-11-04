# Pack 2: what ROBOTIC TYLER uses (v2.30)

The rest of this folder is the owner's "Icon and Branding Pack 2" as supplied, except `png/`
(raster exports of the pack's new vector drawings, none of which the app uses; they are in the
original ZIP). `derived/` is the only part the app builds from.

`tools/brand/pack2.py` turns the few chosen assets (its `SELECT` list) into the 64 x 64 drawings in
`derived/<theme>/<id>.svg`, and records in `derived/index.json` what each was made from and how:

- vector: the source's own SVG, cleaned and fitted (CS2's extracted icons, TF2's class emblems).
- pixels: a native bitmap copied pixel for pixel, shown at its own size (Windows XP shell32 frames,
  Messenger emoticons, Silk, Blades). Colours are rounded to 6 bits a channel (at most 2/255 off).
- trace: a large one-colour glyph traced at full resolution into one outline (PS3 XMB categories,
  Rust HUD symbols, Deadlock stat symbols).

`tools/brand/map.mjs` says where each one goes; `tools/build.mjs` embeds only those, and refuses a
drawing here that no theme uses. Credits and notices: `browser-extension/ui/brand/Pack-2-*`.

# Pack 3: the 25-theme visual asset pack (v2.37)

The owner's *Robotic-Tyler-Authentic-25-Theme-Pack* is a large library of source artwork (about 5,000 files). Only what a theme uses is kept here:

- `select/<theme>.json`: what each theme uses, written by hand. `picks` lists the drawings and their pack files; `icons` and `states` (optional) map app icon names and status states to picks.
- `source/<theme>/`: those source files, copied as supplied (each checked against the pack manifest's SHA-256).
- `derived/<theme>/`: the drawings `tools/brand/pack3.py` makes from them, and `index.json` with each one's source repository, path, commit and tier from the pack manifest.
- `CREDITS.md`: the same list for people (also shipped as `browser-extension/ui/brand/Pack-3-CREDITS.md`, with the upstream notices as `Pack-3-*.txt`).

To change a theme's picks, edit its select file, then run

    python3 tools/brand/pack3.py --pack <extracted pack folder> <theme>
    node tools/build.mjs

(`--pack` is needed only for files not copied yet). `tools/build.mjs` embeds the drawings in `ui-brand.js`, and the theme's extras draw them with `c.brand('p3-…')`. `tests/brand-icons.test.mjs` checks the sources, provenance, use, size and credits.

iPod classic uses nothing from this pack: it has the built-in games' art and Apple's fonts, but no menu or status pieces the panel could use.

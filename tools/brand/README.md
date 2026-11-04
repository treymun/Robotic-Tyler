# Branded icons (v2.28, all 25 themes since v2.29)

Every theme draws some of its icons with the owner's "Robotic Tyler Branded Icon Packs"
(`assets/theme-icons/`: SVG sources, PNG exports, manifest, preview, `CREDITS.md`, `SOURCES.json`
and `licenses/`). The Tyler logos are unchanged; these are the smaller icons, emblems and badges.

- `map.mjs`: for each theme, which of the app's own icons (tools/icons/icons.mjs) it draws with its
  branded icon (tabs, buttons, notifications, dialogs, Settings, the Voice Studio), its emblem (the
  Appearance gallery card and Settings' theme chip) and the status strip's badge for each of Tyler's
  real states. Only where the object says what the control does.
- `clean.mjs`: checks every SVG before it is embedded: plain drawing elements and attributes only,
  numbers where numbers belong; titles and namespace prefixes dropped. Two supplied drawings have a
  rectangle's attributes shifted by one; they are fixed there (the pack stays as supplied).
- `node tools/build.mjs` embeds the 200 drawings in `browser-extension/ui-brand.js` (copied to the
  desktop app, the Voice Studio and the phone remote). Inline SVG makes no request, so Steam's page
  policy doesn't apply. The credits and licences ship in `browser-extension/ui/brand/`.
- The theme extras (theme-pack-1/2/3.js) use them through `c.brand(id)` and menu items' `icon`;
  without ui-brand.js every one falls back to the theme's own drawing.

The pack's keys for Xbox 360 and PlayStation 3 are `xbox360` and `ps3`; `map.mjs` names them with `pack`.

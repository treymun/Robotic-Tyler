# Steam chat appearance in the desktop app

In the desktop app, open **Settings → Appearance → Steam chat appearance**. Changes apply immediately and follow the selected Tyler theme. Changing the styling mode does not select a different theme.

| Mode | What changes |
| --- | --- |
| Off | Steam’s original appearance. This is the default. |
| Colors only | Theme colors on recognized chat surfaces, with Steam’s fonts and control shapes. |
| Full visual styling | Carries Claude’s textures, trims, tabs, channel selections, dialog and menu surfaces, composer and button finishes into Steam. A truly empty history can show the corresponding Tyler mascot. |

If chat is difficult to read or use, open the desktop app’s separate Settings window and choose **Restore Steam’s original appearance** or **Use Colors only**. You do not need to click inside Steam chat. If Electron reports that a stylesheet could not be removed, use the app menu’s **Reload companion** when convenient.

## What is preserved

- Steam keeps its text metrics, control dimensions, spacing, scrolling, hit areas and responsive layout. Fixture trials found different title widths with the alternate theme fonts and different clickable points with the Classic, Dreamcast and XP button corners. The adapter uses original inset bevels, gradients and text paint to convey those styles.
- Steam keeps its avatars, emoji, icon shapes, presence indicators, new-message markers, and send-error styling. The enabled Send glyph uses the button’s theme ink. Light themes use Steam’s dark backing around color-coded presence lists. The voice-room modal keeps its translucent backing while its scratch pad, history and composer use the theme.
- The adapter draws from Tyler’s existing `tokens.css`, `panel.css`, `kit.css` and `themes/` sheets. The owner’s local 25-theme pack and the repository’s theme previews supplied the visual references. The idle mark uses the corresponding bundled `ui/logos/<theme>-32.png` at native size. An image restriction leaves the history’s CSS backdrop visible.
- The adapter translates some ornament into background paint, including the HEV and TF2 border bands, the XMB ribbon contours, and Ricochet’s selected disc. Original decorative animations and Tyler’s interactive theme widgets belong to Tyler’s own panel. Some labels on bright surfaces use darker ink already in the same theme.
- Steam’s borderless tabs and dialog controls use the original border colors and directions as inset paint. Raised and pressed faces keep their original finishes when the keyboard outline appears. Native tab and button dimensions, border thickness and radii still determine the layout and hit areas.

## Maintaining the adapter

`app/steam-appearance/styles.cjs` maps a paint allowlist and exact Tyler component rules to known Steam chat surfaces. Existing layout rules and generated content stay in the source sheets. The Send button uses the form’s submit action and the stable SVG class. Current Steam tab classes are scoped to the chat tab list. The inline menu recognizes the current shared-dialog class alongside the legacy selector. [Steam Friends client source](https://community.fastly.steamstatic.com/public/javascript/webui/friendsui_desktopapp.js?contenthash=C2OePxsD) · [Steam shared dialog styles](https://community.fastly.steamstatic.com/public/css/webui/shared_dialog2.css?contenthash=gnfBEtEu)

`app/steam-appearance/controller.cjs` keeps separate keys for the color and full layers. It removes old keys before applying a new choice and follows top-level navigation and reload, including reload from the desktop voice route. The URL guard and chat-root selectors keep the feature out of login, store and payment pages. It does not change the Steam preload, permissions, security settings or docking.

The controller uses Electron’s author-origin insertion with narrowly scoped paint overrides. A Windows test on Electron 45.2.1 removed author-origin paint successfully. User-origin removal resolved while its paint stayed visible. [Electron stylesheet API](https://www.electronjs.org/docs/latest/api/web-contents#contentsinsertcsscss-options) · [45.2.1 renderer implementation](https://github.com/electron/electron/blob/v45.2.1/shell/renderer/api/electron_api_web_frame.cc#L622-L653)

The readiness check reads structure in an isolated world. Empty histories and closed optional panes are valid. Full falls back to Colors only after repeated ready checks find a missing required structure. If the chat root is unrecognized, Steam keeps its original appearance. The document’s temporary fallback is separate from the saved choice. Structure is checked at load, navigation and appearance changes.

The Settings fragment and script live under `app/desktop-overrides/`. Run `node tools/build.mjs` to regenerate the desktop Settings files. The Chrome and phone Settings pages do not include this control.

## Validation

```powershell
node tools/build.mjs
npm run check
node --test tests/steam-appearance.test.mjs tests/desktop-shim.test.mjs tests/phone-settings.test.mjs
node --test tests/e2e/steam-appearance.e2e.mjs tests/e2e/settings-tabs.e2e.mjs
```

The rendering tests compare all 25 themes against original Tyler styles. They check a Steam fixture at desktop and narrow widths, keyboard focus, hover and press, clickable corners, scrollbar extents, idle art, open voice chat and the original paint after removal. The Windows Electron fixture exercises actual stylesheet insertion and removal with a separate Settings window, a restrictive CSP and synthetic navigation. The review gallery includes Claude’s local panel previews and Steam chat fixtures with sample content.

Signed-in Steam and live voice validation remain open. The release review covers a friend chat, group chat and voice-room pane, menus, dialogs, keyboard navigation and window resizing. Switch between a dark and a light theme, change the voice route, and confirm that Off restores Steam’s original appearance.

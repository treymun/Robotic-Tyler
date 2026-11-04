# Robotic Tyler — branded supporting icon packs

Keep every existing Tyler mascot logo. Use this pack to make the themes more authentic through their smaller icons, brand emblems, status symbols, badges, and decorative details.

This pack contains **25 themes, 200 individual SVG assets, and 800 transparent PNG exports** at 32, 64, 128, and 256 pixels. It contains supporting icons rather than replacement Tyler portraits or full-screen backgrounds. Open `preview.html` to browse them.

## Integrate into the existing app

1. Inspect the current theme registry, theme feature modules, panel, settings, launcher, companion build, and Voice Studio. Preserve the existing themes, behaviors, and mascot artwork.
2. Read `manifest.json` for exact theme keys, asset names, file paths, suggested uses, pixel-art flags, and source information. The first 20 keys match the current app. `xbox360`, `ipod`, `msn`, `ps3`, and `rust` are proposed keys for the five newer themes; aliases from the earlier artwork pack are supplied.
3. Use the brand emblems for subtle headers, section markers, feature cards, and occasional decorative stamps. Use game or platform objects where they help explain an existing action: Aperture test button for a check, the TF2 wrench for setup, a Minecraft chest for soundboard inventory, or an XP speaker for audio. Keep visible text or accessible labels for ambiguous controls.
4. Apply the matching icons across the chat panel, settings, Appearance picker, Voice Studio, and relevant launcher surfaces. Reuse one asset mapping so a theme uses the same icon language everywhere. Follow the project's existing build/mirroring process so the extension and desktop companion receive the same assets.
5. Use SVG for scalable artwork and PNG where the surface requires a raster icon or SVG is blocked by the host. For icons inside Steam's page or shadow root, follow the app's existing safe image/canvas or embedded-asset approach; do not assume that loading a new external image will bypass the page's content policy.
6. Keep the original aspect ratio. The icons use a 64 × 64 vector artboard and include transparent space; do not stretch them or add opaque square backgrounds. Pixel-art assets should retain crisp pixel rendering. The PNG exports are already prepared at common display sizes.
7. Connect status icons to real state. For example, MSN Online can represent listening, Typing can represent thinking, Busy can represent speaking, Away can represent paused, and Offline can represent a real disconnect. Rust's sleeping bag can represent paused. Theme art must not invent an achievement, health measurement, price, or live diagnostic result.
8. Keep hover, selected, focus, disabled, and error treatments consistent within each theme. Use a restrained scale and avoid putting an emblem in every empty space. Respect reduced motion for any later icon animation.
9. Check small icons against the actual light or dark theme surfaces. Verify ordinary and collapsed mode, long labels, keyboard focus, theme switching, missing-image fallbacks, and packaged asset paths. Keep the existing Tyler logo exporter and mascot selection intact.

## Files

| Path | Purpose |
| --- | --- |
| `svg/<theme>/<asset>.svg` | Individual scalable colored icons with transparent surroundings. |
| `png/32/`, `png/64/`, `png/128/`, `png/256/` | Transparent PNG exports, retaining the same theme and asset filenames. |
| `sprite.svg` | All 200 symbols, named `<theme>-<asset>`. Inline it once or use a local SVG sprite where the host permits it. |
| `manifest.json` | Machine-readable inventory and suggested UI uses. |
| `preview.html` | Self-contained local catalog using the included PNGs. |
| `SOURCES.json`, `licenses/` | Credits and source licenses for the reused marks. |

The pack combines attributed brand/game marks from Simple Icons, Papirus, and Font Awesome with custom theme-inspired supporting vectors. Custom motifs are interpretations for themed UI, rather than extracted original game HUD files. Source and provenance fields distinguish them.

## Theme keys

| Theme | Key | Examples |
| --- | --- | --- |
| Steam | `steam` | Steam mark, friends, chat, headset, achievement. |
| Classic Steam | `classic` | Olive Steam mark, VGUI window, server, connection. |
| Team Fortress 2 | `tf2` | TF2 emblem, RED/BLU badges, Medic cross, Engineer wrench. |
| Counter-Strike 2 | `cs2` | Counter-Strike mark, defuse kit, timer, radar, rating plate. |
| Portal | `portal` | Aperture iris, blue/orange portals, companion cube, turret. |
| Counter-Strike 1.6 | `cs16` | Classic mark, defuse kit, radio, rescue, amber timer. |
| Half-Life HEV suit | `hev` | Lambda, Black Mesa, HEV armor, suit battery, Geiger signal. |
| Left 4 Dead | `l4d` | Four-finger hand, first aid, pills, safe room, rescue. |
| Windows XP | `winxp` | XP flag, My Computer, Recycle Bin, folder, network, error. |
| DOOM (classic) | `doom` | DOOM icon, three keycards, health, armor, ammo. |
| Quake | `quake` | Quake rune, Quad Damage motif, armor, runestone, teleporter. |
| Fallout Pip-Boy | `pipboy` | Vault-Tec motif, Pip-Boy device, atomic orbit, carry weight. |
| Half-Life 2 Combine | `combine` | Insignia motif, scanner, Citadel, Civil Protection mask. |
| Deadlock | `deadlock` | Spirit flame, occult sigil, soul vial, transit token, Art Deco badge. |
| Minecraft | `minecraft` | Creeper, grass block, diamond, pickaxe, chest, music disc. |
| PAYDAY 2 | `payday` | PAYDAY 2 mark, Dallas-style mask, loot bag, pager, drill. |
| Sega Dreamcast | `dreamcast` | Swirl, SEGA mark, VMU, controller, GD-ROM disc. |
| Garry's Mod | `gmod` | Garry's Mod mark, physics gun, tool gun, spawn menu, undo. |
| Ricochet | `ricochet` | Throwing disc, jump pad, floating platform, bounce trajectory. |
| Day of Defeat: Source | `dod` | Allied star, field radio, helmet, capture flag, compass. |
| Xbox 360 Blades | `xbox360` | Sphere motif, Ring of Light, controller, achievement, blade. |
| iPod Classic | `ipod` | Apple mark, classic iPod, click wheel, earbuds, shuffle. |
| MSN Messenger | `msn` | Butterfly motif, buddies, Online/Busy/Away/Offline, nudge, typing. |
| PS3 XMB | `ps3` | PlayStation mark, four button symbols, trophy, XMB wave. |
| Rust | `rust` | Rust game emblem motif, scrap, hammer, cupboard, furnace. |

## Example

```html
<button type="button" aria-label="Run checks">
  <img src="theme-icons/svg/portal/floor-button.svg" width="24" height="24" alt="">
  <span>Checks</span>
</button>
```

Use the app's real action handler for the button. Keep decorative icon images out of the accessibility tree when their text label already names the action.

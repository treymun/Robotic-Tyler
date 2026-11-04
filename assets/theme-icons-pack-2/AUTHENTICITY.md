# Source fidelity and optional use

The standard for this pack is a faithful recreation of the selected source interface within Robotic Tyler. The existing Tyler mascot is an intentional custom element and should remain intact.

Every supplied asset is optional. Availability is not a reason to insert an icon. Compare a candidate with the existing UI and the source reference; use whichever is clearer and more faithful. Keep a whole theme unchanged when appropriate. No minimum number of icons, replacements, ornaments, or changed themes is required.

## Provenance

- **Extracted / archived / firmware-derived artwork:** copied from the source collection named in each record. Original file bytes are preserved under `originals/`. Claims about extraction are attributed to the upstream collection; the pack does not independently certify every original file's extraction history.
- **Faithful community vectors / source-supplied recreations:** artwork from a named community project, such as TF2 class vectors and Portal signage. These are not automatically official game files.
- **Custom theme-matched vectors:** new utility options and small blank branding components. Judge these especially carefully against the actual reference. They are not substitutes for better native artwork.
- **Branding components:** blank section labels, small dividers, and emblem stamps built around the earlier pack's emblem. They are optional layout parts, not source screenshots or full backgrounds. Leave their text regions as real UI text using the theme's established fonts.

The source collections' notices and existing pack credits are retained. Asset records include source URLs, upstream file/blob identifiers where available, and local checksums. The public source collections are reference material, not a statement that every file has the same license.

Windows XP ICO resources retain all their original frames. The supplied PNG decodes use the highest available color depth at their declared native size. A few upstream resources contain only legacy low-color artwork; these are labeled in the manifest and should not displace a more accurate Luna-era icon. CS2 `sound1`, `sound2`, and `sound3` are component glyphs from the source collection; inspect their composition before using them as complete controls.

## Match the correct reference

| Theme key | Reference target | Avoid |
| --- | --- | --- |
| `steam` | Steam client and friends/chat language matching the established theme. | Generic futuristic blue UI. |
| `classic` | The 2004 olive VGUI Steam client, compact bevels and old desktop proportions. | Modern Steam glass or flat mobile components. |
| `tf2` | Team Fortress 2 menus/HUD, warm painted materials, RED/BLU, the correct class silhouettes. | Generic military or esports styling. |
| `cs2` | Counter-Strike 2 / Source 2 interface and its actual extracted symbols. | Mixing GoldSrc or unrelated shooter UI into CS2. |
| `portal` | Clean Aperture test-chamber pictograms and the theme's chosen Portal reference. | Mixing Cave Johnson-era/1950s/1970s signs into a clean chamber theme. Only clean signage was selected here. |
| `cs16` | GoldSrc Counter-Strike 1.6: olive/navy, sand, amber HUD detail, compact legacy menus. | CS2 equipment/modern Panorama elements merely because both are Counter-Strike. |
| `hev` | Half-Life HEV visual language: amber readouts, orange armor, deliberate industrial typography. | Combine or generic cyberpunk substitutions. |
| `l4d` | The chosen Left 4 Dead survivor HUD/menu version, worn notices and readable health/status language. | L4D2-exclusive items in a specifically L4D1 reference unless intentionally supported by the established theme. |
| `winxp` | Windows XP Luna and native system resources at appropriate native sizes. | Fluent/Windows 10/11 glyphs, vector traces that change original bitmap character. |
| `doom` | Classic 1993 DOOM: chunky pixels, status-bar metal, original-era lettering and indicators. | DOOM 2016/Eternal styling or smoothly anti-aliased generic military icons. |
| `quake` | Quake 1996 bronze, stone, runes, sparse gothic-industrial shapes. | Quake Live/Champions or glossy fantasy styling. |
| `pipboy` | The established green phosphor Pip-Boy interface, its line weight, scan behavior and terminal type. | Generic neon hacker effects or colored modern UI. |
| `combine` | Half-Life 2 Civil Protection/Overwatch: bone, charcoal, cold cyan and restrained geometric marks. | Unrelated sci-fi skulls or tactical shooter graphics. |
| `deadlock` | Valve's Deadlock, including its actual stat-symbol vocabulary and occult/noir graphic treatment. | Generic fantasy, steampunk, or another MOBA's art. |
| `minecraft` | The chosen vanilla inventory/HUD era. The copied item textures here are explicitly from 1.8.8. | Assuming the historical textures are the current texture pack; smoothing or repainting pixel clusters. |
| `payday` | PAYDAY 2 Crime.net and heist UI. | PAYDAY 3 styling or unrelated police UI. |
| `dreamcast` | Dreamcast's warm white/orange console menu and VMU LCD visual vocabulary. | Modern Xbox/PlayStation controller shapes or current mobile UI. |
| `gmod` | Source/Derma and the original small Silk icon vocabulary. | Turning native 16-pixel icons into large smooth modern illustrations. |
| `ricochet` | Valve Ricochet's original arena/disc identity and early Source/GoldSrc-era presentation. | Generic modern neon arena graphics. |
| `dod` | Day of Defeat: Source field equipment, olive canvas, military stencils and period materials. | Mixing unrelated modern warfare UI or another WWII game. |
| `rust` | Facepunch Rust's original item/UI art and restrained survival/inventory interface. | Rust programming-language branding or generic orange sci-fi graphics. |
| `x360` | The selected original Xbox 360 Blades-era reference. | NXE, Metro, Xbox One or current Xbox UI. |
| `ipod` | Click-wheel iPod Classic menus, LCD-like hierarchy, white/blue selection and period controls. | iPod touch, nano 6/7, iOS or modern Apple Music styling. |
| `msn` | The chosen mid-2000s MSN/Windows Live Messenger reference and native small emoticons. | Skype, Teams, modern flat chat-app components or using emoticons on every control. |
| `xmb` | PlayStation 3 XMB, its category silhouettes, scale, spacing, quiet glow and fine control glyphs. | PS4/PS5 cards, Xbox controls or a generic purple gaming UI. |

## Evaluate each placement

1. Establish a real reference for the theme's exact period and context: menu, HUD, desktop client, console dashboard, or device screen.
2. Compare the current element and proposed asset at the real on-screen size. Shape, proportions, typography, spacing, and material treatment all matter.
3. Prefer native/source artwork where it is usable. A recolored utility symbol can remain appropriate for an ordinary action; it does not need a game object or brand badge.
4. Keep labels and understandable controls. Decorative game objects should not pretend to perform a different action.
5. Preserve the app's real state. A static image should not replace a working participant ring, gauge, inventory, or progress indicator if that would lose behavior.
6. Treat a decision to keep the current UI as a valid outcome. Use the pack to support judgment, not to establish a replacement quota.

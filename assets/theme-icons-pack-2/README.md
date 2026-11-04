# Robotic Tyler — Icon and Branding Pack 2

An optional supplement to the first branded icon pack, covering all 25 existing themes. It preserves the existing Tyler mascot logos and adds source artwork, theme-matched utility options, and small branding components.

Open `preview.html` to compare the choices. Give Claude `CLAUDE-PROMPT.md` with this ZIP.

## Selection policy

**Use an asset only when it improves authenticity, clarity, or the appearance of the actual UI.** There is no icon quota and no requirement to change every theme. Native controls and existing theme details may already be the best choice. Read `AUTHENTICITY.md` before integrating.

## Contents

| Folder/file | Purpose |
| --- | --- |
| `svg/<theme>/` | New 64 × 64 scalable utility options, plus normalized source vectors where available. |
| `mono/<theme>/` | Color-flexible utility alternatives using `currentColor` for inline rendering. |
| `branding/<theme>/` | Small blank section labels, dividers, and emblem stamps. These are optional components with their own viewBoxes. |
| `png/` | Raster exports of the new vectors. Square icons have 32/64/128/256-pixel versions; wide pieces have native and 2× versions. |
| `originals/<theme>/` | Copied source files, preserved byte for byte. |
| `original-png/` | Native-size PNG decodes of original ICO resources, plus PNG previews/exports for source SVGs. |
| `manifest.json` | Asset inventory, theme keys, provenance, dimensions, file paths, and optional candidate uses. |
| `GAP-REVIEW.md` | Comparison with Pack 1 and the current app's role mappings. |
| `AUTHENTICITY.md` | Correct-era guidance and the decision rule for using or keeping artwork. |
| `source-notices/`, `licenses/`, `SOURCES.json` | Original notices and provenance. |
| `ASSET-CHECKS.json` | File integrity, rendering and compatibility checks. |

## App integration

- Keep this pack separate from Pack 1, for example as `assets/theme-icons-pack-2/`. Add only selected mappings and build inputs. Do not overwrite the previous source inventory.
- The current app uses `x360` and `xmb`. Pack 1 used asset folder names `xbox360` and `ps3`; the manifest records the relationship. Avoid creating duplicate theme registrations.
- The app's existing branded SVG loader expects a 64 × 64 artboard. The small utility and normalized source SVGs follow that convention. Wide branding components retain their declared viewBoxes and should use an appropriate component renderer rather than being stretched into an icon slot.
- Original raster artwork should use the app's existing safe embedded-image/canvas path where Steam's page content policy applies. Keep it local; do not introduce a dependency on a remote CDN.
- Color-flexible SVGs inherit text color only when inlined or rendered through a compatible SVG wrapper. An external `<img>` does not inherit the surrounding document's `currentColor`; use a suitable raster export or an existing inline renderer instead.
- Original PNGs retain their native resolution, padding and transparency/opaque portions. They are not all square or transparent. Prefer a suitable native size for old bitmap UI, and preserve nearest-neighbor rendering for deliberate pixel art.
- New vector controls are options, not official game art. Small branding frames are custom components using an existing emblem. Preserve the supplied source labels when discussing authenticity.
- Use the project's build process to regenerate generated modules; inspect current role mappings rather than assigning every new asset to a control. Keep unused sources out of installed bundles where practical.

No replacement Tyler mascot portraits or full-screen background images are included in this pack.

# Robotic Tyler — five theme artwork kits

This pack contains five matching sets: Xbox 360 Blades (light), iPod Classic (light), MSN Messenger (light), PS3 XMB (dark), and Rust, the Facepunch survival game (dark).

Each numbered folder contains a transparent `tyler-logo.png` and an opaque widescreen `theme-background.png`. Use the actual supplied artwork in the app. The brand details are already drawn into each mascot and background. The logos preserve Tyler's spiky hair, glasses, and mechanical eye while adapting the materials and insignia to each theme.

## Instructions for Claude

Add these five options to Robotic Tyler's existing theme system. Inspect the current theme registry, asset loading, renderer styling, launcher, theme picker, and bundled build process before choosing final repository paths. Preserve the existing themes and current application behavior. This is an artwork and theme integration task.

1. Import each transparent mascot as its theme's logo. Keep the intrinsic aspect ratio and alpha channel, use `object-fit: contain`, and do not put an opaque square behind it. Use it in the theme selector, app header or welcome area, and appropriate launcher surfaces.
2. Import each wide image as a decorative theme background or an accent panel. Its calm left and center regions are intended for content, and most branding sits at the right edge. Select a crop that keeps the brand visible. At narrow window sizes, retain a themed color surface and mascot if the background would crop poorly.
3. Build the controls, tabs, cards, typography, focus states, and status displays as real UI. These backgrounds contain artwork, not controls. Keep body text on readable solid or sufficiently opaque surfaces. Do not stretch the logo or bake the interface into an image.
4. Use the suggested palette in `manifest.json` as a starting point, then tune contrast against the actual images. Verify disabled, hover, focus, loading, selected, error, and active states, plus long chat messages and scrolling.
5. Keep status and animations connected to real app state. Respect reduced motion. Include the image files in the packaged app and verify that the launcher, development build, and packaged build resolve their paths.
6. Preserve the themes' individual visual character. Use the notes below for appropriate UI details. Reuse existing app actions and telemetry where available.

## Theme directions

| Folder | Appearance | Interface details |
| --- | --- | --- |
| 01-xbox-360-blades | Pearl silver, lime green, curved dashboard blades, Xbox sphere | Chat, Room, Sounds, Setup, and Checks can form five sliding blades. A separate segmented Ring of Light can show real voice participants and error state. A Guide-style quick menu can expose Pause, Stop audio, Music, and Settings. Achievement-style toasts can use real usage milestones. |
| 02-ipod-classic | White plastic, brushed silver, LCD blue, click-wheel hardware | Use a compact blue selection strip, crisp light lists, and a click-wheel-style navigation/media control connected to existing actions. Display the current track and actual playback state. |
| 03-msn-messenger | Glossy sky blue and white, butterfly, classic buddy figures | Give Tyler a contact row: Online = listening, typing = thinking, Busy = speaking, Away = paused, with offline/error represented accurately. Show Music DJ's real song metadata beneath the name. A Nudge can invoke the existing test beep and a brief motion effect. Show AI, Chat, Voice, and Music as contacts with real states. |
| 04-ps3-xmb | Charcoal, silver, muted violet, flowing wave, PlayStation symbols | Use XMB-inspired horizontal categories with vertical options and a restrained selection glow. Keep wave motion subtle and optional. Preserve keyboard navigation and legibility. |
| 05-rust | Weathered charcoal, muted orange-red, burlap, hazard stencils, scrap metal | Use rugged inventory-like panels, restrained distressed edges, stenciled headings, and real connection/audio indicators. Keep the chat reading surface clean and avoid texture behind body text. |

## Contents and generation

The ten raster artworks were created with the built-in image generator using Tyler's earlier mascot images as identity/style references. These are generated themed illustrations; the files are PNG artwork, not editable vector source. `generation-prompts.json` records the exact prompt for each image. `manifest.json` records asset paths, dimensions, transparency, checksums, and suggested palettes.

Use the transparent logo as the foreground artwork and the separate widescreen background as optional supporting theme art. Do not extract or redraw the character from the background.


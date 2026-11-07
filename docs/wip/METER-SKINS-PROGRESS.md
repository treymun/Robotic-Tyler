# Memory meter skins (v2.45): progress

Work dir: /home/claude/work/ROBOTIC_TYLER_v2.3 (never /home/claude/robotic-tyler). Don't commit/push/bump.
One browser or test process at a time (the container ran out of memory once).

## How it's built (done)
- Each skin is at the END of `browser-extension/ui/themes/<theme>.css`, headed `/* ── Memory meter skin (v2.45): … ── */`.
  Steam's (no theme file) is at the end of `browser-extension/ui/memory-meter.css`. Every skin sets `--mem-skin:<theme>`
  and uses selectors `.panel[data-rt-theme=X] .tyler-mem …` (beats the HUD's `.stat` rules, incl. narrow media rules).
- Pack art reaches CSS as `--rt-art-<id>` = `url("data:…")`, set under `[data-rt-theme=X]` only:
  - `assets/theme-visual-pack-3/select/<theme>.json` → `"css": {id: {file, mode, crop/resize/key…}}` (always the last key).
  - `tools/brand/pack3.py` draws them to `derived/<theme>/css/<id>.png|svg` (+ `css` in index.json, credits in
    Pack-3-CREDITS.md marked ", CSS"). New options: resize, rotate, key; trace() accepts resize.
  - `tools/build.mjs` `compileThemeArt()` appends the vars to ui-template.js CSS; throws if art is unused or a var is undefined.
- Scratch helpers (scratchpad/tools): `css-picks.json` (master list of CSS art), `setcss.py <json>` writes css parts into
  select files, `stage.sh <themes>` redraws + builds, `shoot-meter.mjs <outdir> [themes] [--dpr=2] [--narrow] [--phone]`
  (A = RAM ok/VRAM full, B = RAM high/VRAM missing, C = RAM full/VRAM ok + breakdown open; `-m.png` = meter-only crop),
  `msheet.py <dir> <themes> <out>` stacks meter crops, `cssparse.mjs` checks every skin rule parses + no non-data url().
- memory-meter.css: header documents skins/art; `.tyler-mem` is a size container (`@container tyler-mem`); the old
  l4d-only lines were removed (the l4d skin replaces them).
- HUD pseudo-elements that leak into the meter (handled): cs16/hev `.stat:first-child dd::before` (cross),
  l4d `.stat::after` (health bar), payday `.stat::before` (crew avatar: width/height/radius reset in the skin).

## Themes (inventory → motif → assets → status)
1. steam — has: navy client, friends-list header, persona chip, Downloads activity graph, achievements, native Steam
   icons. Meter: **Settings → Storage drive bar** (Tyler blue / other grey / free dark + blue key dot). Art: native
   storage-card icon (vector mask). DONE-checked.
2. classic — has: olive VGUI bevels, segmented blue progress bar (status), server-list table, progress dialog, OG
   away/message icons. Meter: **row of 10 VGUI radio buttons as lamps** in an etched group box (gold-focus = Tyler).
   Art: OG-Steam radselstd/radselfocus/radunselstd (16 px crops). DONE-checked (full = red-tinted lamps).
3. tf2 — has: ÜberCharge meter, item-quality stat boxes, class captions, killfeed, taunt. Meter: **Payload Race
   tracks** (BLU = RAM, RED = VRAM; rail, checkpoints, cart marker; Tyler = cream). CSS only (pack has no HUD art).
   DONE-checked.
4. cs2 — has: slate glass, Premier rating plates (HUD), scoreboard, radio wheel, buyzone/GC icons. Meter: **ammo
   counter** (big used / small total + clip of 10 Panorama bullet glyphs; Tyler = T gold). Art: ui/bullet.svg mask. DONE-checked.
5. portal — has: chamber sign + pictograms, portal ovals (status + tabs), thin big numbers. Meter: **ASHPD crosshair
   brackets** (blue left = RAM, orange right = VRAM, fill from bottom; hazard-stripe underline at high/full). CSS only.
   DONE-checked (brackets thickened).
6. cs16 — has: dust map, radar, amber HUD numbers + cross, buy-menu numbered tabs, score/radio. Meter: **weapon
   selection slot** (selection frame + AK-47 / AWP HUD icons, two HL ammo bars: used + Tyler). Art: 640hud selection,
   d_ak47, d_awp (lum masks). DONE-checked.
7. hev — has: amber HUD numbers + cross, AUX POWER, hazard stripes, weapon-slot tabs, flashlight, dmg icons, hev-armor
   state badge. Meter: **HL HUD armour suit sprite filling from the boots** (Tyler orange, rest yellow). Art:
   suit_empty/suit_full (lum masks). DONE-checked.
8. l4d — has: survivor health bars under HUD, ECG, torn boxes, brush strokes, status cards. Meter: **safe-room wall
   tally marks** (20 marks, fives struck through; Tyler red marker, rest chalk). CSS + hand-drawn SVG. DONE-checked.
9. winxp — has: Luna title bars, green block progress bar, task panes, taskbar/start menu, error dialog. Meter:
   **Task Manager "PF Usage" box** (group box, black LED column + graph grid; Tyler red = kernel time). CSS only.
   DONE-checked (text-shadow added for legibility — recheck not needed).
10. doom — has: stone status bar w/ face, big red numbers, keycards, ARMS tabs, menu skull pointer. Meter: **options-menu
    thermometer** (M_THERML/M/R + M_THERMO knob, Tyler = red wash) + STDISK icon. DONE-checked.
11. quake — has: bronze HUD numbers, iron plates, slipgate status strip, console, medals, sigils/quad/net. Meter:
    **RAM low-memory icon in Quake's menu text box** (box_* 9-slice; segmented bronze rail, Tyler ember). Art: gfx/ram,
    box_tl…box_br. DONE-checked.
12. pipboy — has: phosphor green, inverted list highlight, RESP/RADS dials, CND bar, radio scope. Meter: **FO4 bottom
    status strip boxes** (name + reading + LEVEL-style framed bar; full = inverted + blink). CSS only (theme draws no
    Vault Boy, so the pack's Vault Boy art is deliberately unused). DONE-checked.
13. combine — has: CP armour plate header, cyan scanner line, cyan HUD number, dispatch/terminal/unit/scan, L brackets.
    Meter: **force-field gate** (two emitter beams + comshieldwall field; Tyler white). Art: comshieldwall_close (96 px),
    bluelaser1. DONE-checked.
14. deadlock — has: marquee bulbs status, souls counter, brass art-deco frames, shop stat icons. Meter: **two glass vials
    of spirit** (teal, Tyler brighter; amber/oxblood). CSS only (pack art is abilities/stat icons). DONE-checked.
15. minecraft — has: inventory slots, hotbar tabs, XP bar status, hearts/hunger, records, advancements. Meter: **furnace
    progress arrow + fuel flame** (flame height = Tyler's part of use). Art: furnace.png crops. DONE-checked.
16. payday — has: crime.net map, contract markers, heist plan checklist (+ Drill Sawgeant skill icon), assault banner,
    timer, crew avatar circles on HUD. Meter: **Ammo Bag loadout slot**: white corner brackets (borders/border), the skill
    tree's Ammo Bag icon (Bulletstorm, traced white), HUD bar. Art: skill-bulletstorm (trace), borders-border (lum).
    DONE-checked (the deployable render was too muddy; HUD avatar ::before reset in the skin).
17. dreamcast — has: warm white, rounded cards, swirl, VMU when collapsed + VMU pictograms. Meter: **memory-card blocks**
    (40 blocks, column per 5%; Tyler orange, rest slate, high yellow, full red). CSS only. DONE-checked.
18. gmod — has: Derma panels, spawn menu, physgun tiles, ERROR notice, props context menu, notices. Meter: **Derma progress
    rows with Silk icons** (drive / monitor). Art: Silk drive.png, monitor.png. DONE-checked.
19. ricochet — has: floating platforms with cyan rims, discs, pads, arcade score. Meter: **lit arena trim channel +
    bounce-shot sprite** (1/2/3 bounces = ok/high/full; trim blue/yellow/red). Art: trim_* textures, 640_1/2/3bounce.
    DONE-checked.
20. dod — has: field-radio face (VU needle, TX lamp), channel buttons, olive paint, manila tabs, orders. Meter: **capture
    zone: flag inside the capture tick ring**. Art: hud flag_neutral, vgui/progress_bar (lum masks). DONE-checked.
21. rust — has: vitals bars, belt slots, craft menu, TC, status-effect row, wounded. Meter: **battery with cells + plug
    icon** (plug-off when missing; Tyler olive). Art: gui-ui plug-on/plug-off (traced). DONE-checked.
22. x360 — has: blades, glossy green selection bar, Ring of Light, gamercard, guide. Meter: **System blade Memory
    device** (Memory icon plate, silver capacity groove; Tyler charcoal). Art: Blades system-memory icon. DONE-checked.
23. ipod — has: glossy title bar, lists, scrub bar (Now Playing + status strip), battery, click wheel, cover flow. Meter:
    **podcast play dot as a pie** in iPod list rows. CSS only (pack has only games art). DONE-checked.
24. msn — has: display-picture frame, presence dots, contact list, toasts, nudge, emoticons. Meter: **file-transfer box**
    (shared-folder icon / crossed folder when missing; bar Online→Away→Busy colours; Tyler blue). Art: msnmsgr bitmap 723
    crops (magenta key). DONE-checked.
25. xmb — has: wave, category icons tabs, glowing lists, info/options/trophies screens, clock. Meter: **hard-disk item
    with the content-info line + percentage**. Art: xmb_icon_049 (traced), cinfo-fg. DONE-checked.

## Left to do (in order)
1. (done) payday fix.
2. (done) Narrow 340 px (meter-skins/narrow/gridA.png, gridB.png; DOOM thermometer shortened at ≤360 px) and phone 390 px
   (meter-skins/phone/grid.png) for all 25: all clean.
3. (done) Contact sheets: meter-skins/contact-sheet.png (A: ok/full), contact-sheet-high-missing.png (B),
   contact-sheet-full-breakdown.png (C). Final per-theme shots: meter-skins/final/.
4. (done) Tests: tests/e2e/memory-meter.e2e.mjs has a new test "memory meter skins: all 25 themes…" (25 themes × wide/340 px ×
   ok+full / high+missing / full+ok: --mem-skin, levels, digits ≠ HUD's, gauges ≠ HUD boxes, nothing clipped, layout
   audit, no running animation under reduced motion, in place, all looks unique; MEM_THEMES=a,b limits it). Its old
   audit call was a no-op (passed an element where the audit wanted a scope) → fixed via auditIn(). Old "pct inline"
   assertion relaxed to "shown" (Steam's grid blockifies it). New tests/memory-meter-skins.test.mjs (4 tests) passes.
   Dreamcast digits changed (500 weight, slate blue) and Pip-Boy digits use the condensed sans so neither copies its HUD.
5. Full checks one at a time (build ✓, check ✓, npm test 548/548 ✓; L4D tally SVG vars moved to ui/theme-features.css
   because tests/theme.test.mjs keeps theme files free of data: images; e2e + desktop check pending): node tools/build.mjs; npm run check; npm test; npm run test:e2e;
   ELECTRON=…/scratchpad/electron-linux/dist/electron node tools/desktop-voice-check/check.mjs
6. Release notes → scratchpad/changes-meter-skins.md; report (inventory/motif/assets per theme, bytes added).

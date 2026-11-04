# Robotic Tyler — 25-theme soundboard pack

**250 finished MP3 clips: 25 themes × the exact 10 built-in soundboard buttons.**

| Slot | Existing name |
| ---: | --- |
| 1 | Beep |
| 2 | Airhorn |
| 3 | Drumroll |
| 4 | Victory |
| 5 | Sad trombone |
| 6 | Alert |
| 7 | Coin |
| 8 | Jump |
| 9 | Laser |
| 10 | Countdown |

**Sound 11 onward stays the same across every theme.** Nothing in this pack adds mappings for later slots or changes your saved sounds.

## Listen and use

1. Extract the complete ZIP, keeping its folders together.
2. Open `preview.html`. Choose a theme to hear its ten pads, or compare one pad across all 25 themes. Playback is local and begins only when you press Play.
3. `previews/` contains one continuous audition MP3 per theme, ordered 1 through 10 with short gaps. These previews are listening aids, not extra soundboard slots.
4. Give Claude this pack and `CLAUDE-PROMPT.md`. The existing app still needs the integration described there.

## What is included

- `audio/<theme>/01-beep.mp3` through `10-countdown.mp3`: 250 finished files, stereo, 48 kHz, 160 kbps MP3.
- `manifest.json`: exact mappings, durations, file hashes, source IDs, measured levels and the preservation policy.
- `SOUND-MAP.csv` and `THEME-COVERAGE.md`: the complete inventory.
- `SOURCES.json`, `source-originals/` and `CREDITS.md`: source identities, preserved input audio and provenance.
- `recipes.json` and `render_pack.py`: reproducible audio arrangements. Rebuilding requires Python, NumPy, SciPy and FFmpeg; playback requires none of those.
- `integration/theme-sounds.mjs`: a small mapping helper that resolves only slots 1–10 and returns `null` for every later slot. It does not read or change user storage.
- `ASSET-CHECKS.json`: decoding, hash, signal-level and mapping checks.

## Authenticity and matching

There are **137 source recordings**, **99 edited arrangements**, **2 hybrid cues**, and **12 original theme-matched designs**. Source recordings have been trimmed, level-balanced and encoded for playback; edited arrangements also change rhythm, pitch or composition. Labels in the preview and manifest distinguish them.

The labels remain your familiar Beep, Airhorn, Drumroll, Victory, Sad trombone, Alert, Coin, Jump, Laser and Countdown. Their themed equivalents preserve the purpose: a failure cue can use a game's denial or death sound; a console Jump can use a launch/lift cue; a period-radio Laser can use an electrical sweep. These are soundboard interpretations, not claims that every source interface shipped ten identically named effects.

The iPod set uses newly designed click-wheel and piezo-style effects. The PAYDAY drill and cash-counter cues are original designs; its pager/countdown cues combine new synthesis with a sourced texture. Those files are not represented as extracted Apple or PAYDAY interface assets.

## Integration notes

The current app's names, clip contract and theme IDs were checked against the snapshot in `APP-SNAPSHOT.json`. Explicit user clip overrides must remain authoritative. Theme defaults belong in a separate mapping; do not save each selected theme over the user's sound collection.

Load only the needed local asset, pass it through the existing soundboard audio path, and preserve microphone routing, volume controls, stop behavior, aliases and cooldowns. Keep the existing names/slot IDs stable. Do not import audition MP3s or source originals as additional pads.

The shipped files were decoded and checked for duration, duplicate audio and signal headroom. Listening in the target browser and a real Steam call still needs to be verified during integration. The current player applies soundboard and master gains; assess the actual end-to-end loudness before adding further normalization or boosts.

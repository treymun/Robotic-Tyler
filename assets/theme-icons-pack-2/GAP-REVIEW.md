# Gap review and selection guide

This review compares Pack 1 with the app source observed on 2026-11-04. The repository tree identifier is `5dbc22f5959d948b7e25c312ff2465f0b9a02e7c`. It is an inventory comparison; an unmapped branded role can already have a suitable native icon.

All 25 themes are registered in the current app. The shared branded map currently covers the original 20. The five newer themes have working theme-specific art and controls; review their existing renderers before centralizing anything.

## Optional coverage added

- Separate input/mute, playback, guide, history, search, copy, reconnect, and settings candidates. These are useful choices where Pack 1 lacked a literal control symbol. They do not automatically improve the existing native UI.
- Copied/reference-derived source files and faithful community artwork, with source identifiers preserved.
- Blank compact labels, small dividers and emblem stamps. These should only be used where the source interface has a comparable detail.

## Theme inventory

| App key | Pack 1 key | Pack 1 assets | New options | Sourced files |
| --- | --- | ---: | ---: | ---: |
| `steam` | `steam` | 8 | 15 | 0 |
| `classic` | `classic` | 8 | 15 | 0 |
| `tf2` | `tf2` | 8 | 24 | 9 |
| `cs2` | `cs2` | 8 | 57 | 42 |
| `portal` | `portal` | 8 | 37 | 22 |
| `cs16` | `cs16` | 8 | 15 | 0 |
| `hev` | `hev` | 8 | 15 | 0 |
| `l4d` | `l4d` | 8 | 15 | 0 |
| `winxp` | `winxp` | 8 | 41 | 26 |
| `doom` | `doom` | 8 | 15 | 0 |
| `quake` | `quake` | 8 | 15 | 0 |
| `pipboy` | `pipboy` | 8 | 15 | 0 |
| `combine` | `combine` | 8 | 15 | 0 |
| `deadlock` | `deadlock` | 8 | 26 | 11 |
| `minecraft` | `minecraft` | 8 | 25 | 10 |
| `payday` | `payday` | 8 | 15 | 0 |
| `dreamcast` | `dreamcast` | 8 | 15 | 0 |
| `gmod` | `gmod` | 8 | 37 | 22 |
| `ricochet` | `ricochet` | 8 | 15 | 0 |
| `dod` | `dod` | 8 | 15 | 0 |
| `x360` | `xbox360` | 8 | 43 | 28 |
| `ipod` | `ipod` | 8 | 15 | 0 |
| `msn` | `msn` | 8 | 33 | 18 |
| `xmb` | `ps3` | 8 | 45 | 30 |
| `rust` | `rust` | 8 | 38 | 23 |

## Role coverage in the observed app

An absent branded override means the app uses its native icon. It is not a missing-function report. Prefer the better visual match after comparing the screen with its source reference.

### Steam

Native roles without a branded override: `checks`, `overview`, `ai`, `games`, `advanced`, `appearance`, `apps`, `minimize`, `play`, `pause`, `stop`, `check`, `close`, `info`, `warning`, `error`.

### Classic Steam (2004)

Native roles without a branded override: `chat`, `overview`, `ai`, `voice`, `games`, `appearance`, `apps`, `guide`, `minimize`, `play`, `pause`, `stop`, `check`, `close`, `info`, `success`.

### Team Fortress 2

Native roles without a branded override: `chat`, `sounds`, `overview`, `ai`, `voice`, `squad`, `games`, `appearance`, `apps`, `guide`, `minimize`, `play`, `pause`, `stop`, `check`, `close`, `info`, `success`, `warning`, `error`.

### Counter-Strike 2

Native roles without a branded override: `chat`, `setup`, `overview`, `ai`, `squad`, `games`, `advanced`, `appearance`, `apps`, `guide`, `minimize`, `play`, `pause`, `stop`, `check`, `close`, `info`, `warning`, `error`.

### Portal

Native roles without a branded override: `chat`, `sounds`, `setup`, `overview`, `ai`, `squad`, `games`, `advanced`, `appearance`, `apps`, `guide`, `minimize`, `play`, `pause`, `stop`, `check`, `close`, `info`, `warning`, `error`.

### Counter-Strike 1.6

Native roles without a branded override: `chat`, `room`, `setup`, `overview`, `ai`, `squad`, `games`, `advanced`, `appearance`, `apps`, `guide`, `minimize`, `play`, `pause`, `stop`, `check`, `close`, `info`, `success`, `warning`, `error`.

### Half-Life HEV suit

Native roles without a branded override: `chat`, `room`, `sounds`, `overview`, `ai`, `voice`, `squad`, `games`, `appearance`, `apps`, `guide`, `minimize`, `play`, `pause`, `stop`, `check`, `close`, `info`, `success`.

### Left 4 Dead

Native roles without a branded override: `chat`, `sounds`, `setup`, `overview`, `ai`, `voice`, `squad`, `games`, `advanced`, `appearance`, `apps`, `guide`, `minimize`, `play`, `pause`, `stop`, `check`, `close`, `info`, `warning`.

### Windows XP

Native roles without a branded override: `chat`, `overview`, `ai`, `squad`, `games`, `advanced`, `appearance`, `guide`, `minimize`, `play`, `pause`, `stop`, `check`, `close`, `success`.

### DOOM (classic)

Native roles without a branded override: `chat`, `room`, `sounds`, `overview`, `ai`, `voice`, `squad`, `games`, `advanced`, `appearance`, `apps`, `guide`, `minimize`, `play`, `pause`, `stop`, `check`, `close`, `info`, `success`, `error`.

### Quake (1996)

Native roles without a branded override: `chat`, `sounds`, `overview`, `ai`, `squad`, `games`, `appearance`, `apps`, `guide`, `minimize`, `play`, `pause`, `stop`, `check`, `close`, `info`, `warning`, `error`.

### Fallout Pip-Boy

Native roles without a branded override: `chat`, `room`, `overview`, `ai`, `squad`, `games`, `advanced`, `appearance`, `apps`, `guide`, `minimize`, `play`, `pause`, `stop`, `check`, `close`, `info`, `error`.

### Half-Life 2 Combine

Native roles without a branded override: `chat`, `sounds`, `overview`, `ai`, `squad`, `games`, `advanced`, `appearance`, `apps`, `guide`, `minimize`, `play`, `pause`, `stop`, `check`, `close`, `info`, `success`.

### Deadlock

Native roles without a branded override: `chat`, `setup`, `checks`, `overview`, `ai`, `squad`, `games`, `advanced`, `appearance`, `apps`, `guide`, `minimize`, `play`, `pause`, `stop`, `check`, `close`, `success`, `warning`, `error`.

### Minecraft

Native roles without a branded override: `chat`, `overview`, `ai`, `voice`, `squad`, `games`, `advanced`, `appearance`, `apps`, `guide`, `minimize`, `play`, `pause`, `stop`, `check`, `close`, `info`, `warning`, `error`.

### PAYDAY 2

Native roles without a branded override: `chat`, `sounds`, `setup`, `checks`, `overview`, `ai`, `squad`, `games`, `advanced`, `appearance`, `apps`, `guide`, `minimize`, `play`, `pause`, `stop`, `check`, `close`, `success`, `warning`.

### Sega Dreamcast

Native roles without a branded override: `chat`, `room`, `overview`, `ai`, `voice`, `squad`, `games`, `appearance`, `apps`, `guide`, `minimize`, `play`, `pause`, `stop`, `check`, `close`, `info`, `success`, `warning`, `error`.

### Garry’s Mod

Native roles without a branded override: `chat`, `checks`, `overview`, `ai`, `voice`, `squad`, `games`, `appearance`, `apps`, `guide`, `minimize`, `play`, `pause`, `stop`, `check`, `close`, `info`, `success`, `warning`, `error`.

### Ricochet

Native roles without a branded override: `chat`, `sounds`, `setup`, `checks`, `overview`, `ai`, `voice`, `squad`, `games`, `advanced`, `appearance`, `apps`, `guide`, `minimize`, `play`, `pause`, `stop`, `check`, `close`, `info`, `warning`, `error`.

### Day of Defeat: Source

Native roles without a branded override: `chat`, `overview`, `ai`, `squad`, `games`, `advanced`, `appearance`, `apps`, `guide`, `minimize`, `play`, `pause`, `stop`, `check`, `close`, `info`, `warning`, `error`.

### Xbox 360 Blades

Native roles without a branded override: `chat`, `room`, `sounds`, `setup`, `checks`, `overview`, `ai`, `voice`, `squad`, `games`, `advanced`, `appearance`, `apps`, `guide`, `minimize`, `play`, `pause`, `stop`, `check`, `close`, `info`, `success`, `warning`, `error`.

### iPod Classic

Native roles without a branded override: `chat`, `room`, `sounds`, `setup`, `checks`, `overview`, `ai`, `voice`, `squad`, `games`, `advanced`, `appearance`, `apps`, `guide`, `minimize`, `play`, `pause`, `stop`, `check`, `close`, `info`, `success`, `warning`, `error`.

### MSN Messenger

Native roles without a branded override: `chat`, `room`, `sounds`, `setup`, `checks`, `overview`, `ai`, `voice`, `squad`, `games`, `advanced`, `appearance`, `apps`, `guide`, `minimize`, `play`, `pause`, `stop`, `check`, `close`, `info`, `success`, `warning`, `error`.

### PS3 XMB

Native roles without a branded override: `chat`, `room`, `sounds`, `setup`, `checks`, `overview`, `ai`, `voice`, `squad`, `games`, `advanced`, `appearance`, `apps`, `guide`, `minimize`, `play`, `pause`, `stop`, `check`, `close`, `info`, `success`, `warning`, `error`.

### Rust

Native roles without a branded override: `chat`, `room`, `sounds`, `setup`, `checks`, `overview`, `ai`, `voice`, `squad`, `games`, `advanced`, `appearance`, `apps`, `guide`, `minimize`, `play`, `pause`, `stop`, `check`, `close`, `info`, `success`, `warning`, `error`.

## Integration decisions

For each placement, note the existing element, the exact source reference/era, the candidate, and the reason it is better. A decision to keep the current artwork is valid. No per-theme quantity or change quota is required.

A static asset should not replace a working state-driven ring, health meter, progress bar, menu highlight, or inventory display if that would lose the original behavior. Use real application data and keep labels clear.

#!/usr/bin/env python3
"""Pack 3 (v2.37): the few assets chosen from the owner's "25-theme visual asset pack" (the Authentic
25-Theme Pack), turned into the 64 x 64 drawings tools/build.mjs embeds in ui-brand.js next to
Pack 1's and Pack 2's. Only what a theme's select file lists is copied into the repository and drawn.

  assets/theme-visual-pack-3/select/<theme>.json   what the theme uses (written by hand):
      {"picks": {"p3-<id>": {"file": "themes/<theme>/icons/x.png", "mode": "pixels", ...}},
       "icons": {"<app icon name>": "p3-<id>"}, "states": {"<state>": "p3-<id>"}}   (icons/states optional)
  assets/theme-visual-pack-3/source/<theme>/       the used source files, copied as supplied
  assets/theme-visual-pack-3/derived/<theme>/      <id>.svg and index.json (what was made from what,
                                                   with the pack manifest's provenance)

Modes (per pick):
  pixels  a native bitmap copied pixel for pixel: one path per colour, hard edges. Options: crop
          [x, y, w, h] (a cell of a sprite sheet), frame (an .ico frame size).
  lum     a GoldSrc-style additive sprite (bright glyph on black): its brightness becomes the
          opacity of one currentColor shape per level, so the theme tints it like the game's HUD.
  trace   a large one-colour glyph traced (potrace) into one currentColor path. Options: upscale,
          threshold (opacity that counts as the glyph, default 0.5), light (only its light part),
          invert (the glyph is cut out of a translucent panel: trace the holes inside the panel).
  Any mode: seek (a frame of an animated PNG/GIF, 0 first).
  vector  the source's own SVG, cleaned (plain drawing elements only). Options: mono (currentColor).

Usage:  python3 tools/brand/pack3.py --pack <extracted pack folder> <theme> [<theme> ...]
        (--pack is needed only when a source file isn't in source/<theme>/ yet)
Needs Pillow and NumPy (potracer for trace).
"""
import argparse, hashlib, json, os, re, shutil, sys
import xml.etree.ElementTree as ET
import numpy as np
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.normpath(os.path.join(HERE, '..', '..'))
BASE = os.path.join(ROOT, 'assets', 'theme-visual-pack-3')
THEMES = ['steam', 'classic', 'tf2', 'cs2', 'portal', 'cs16', 'hev', 'l4d', 'winxp', 'doom', 'quake', 'pipboy', 'combine',
          'deadlock', 'minecraft', 'payday', 'dreamcast', 'gmod', 'ricochet', 'dod', 'rust', 'x360', 'ipod', 'msn', 'xmb']
MAX_SVG = 48 * 1024  # one drawing; the panel loads every theme's drawings at once, so keep them small

sys.path.insert(0, HERE)
from pack2 import num, artboard, fit, clean_element  # noqa: E402  (same cleaning rules as Pack 2)


def source_path(theme, pick):
    return os.path.join(BASE, 'source', theme, os.path.basename(pick['file']))


def load(theme, pick):
    im = Image.open(source_path(theme, pick))
    if pick.get('seek'):
        im.seek(pick['seek'])  # one frame of an animated PNG/GIF (0 is the first)
    if pick.get('frame'):
        im = im.ico.getimage((pick['frame'], pick['frame']), 32)
    im = im.convert('RGBA')
    if pick.get('crop'):
        x, y, w, h = pick['crop']
        im = im.crop((x, y, x + w, y + h))
    return im


def pixels(theme, pick):
    im = load(theme, pick)
    w, h = im.size
    # Colours to 6 bits a channel and opacity to 16 steps (not visible), so near-identical shades share paths.
    px = np.asarray(im).astype(int)
    px[..., :3] = np.minimum(255, (px[..., :3] + 2) // 4 * 4)
    px[..., 3] = np.round(px[..., 3] / 17) * 17
    runs = {}
    for y in range(h):
        x = 0
        while x < w:
            key = tuple(int(v) for v in px[y, x])
            if key[3] == 0:
                x += 1
                continue
            x0 = x
            while x < w and tuple(int(v) for v in px[y, x]) == key:
                x += 1
            runs.setdefault(key, []).append('M%d %dh%dv1h-%d' % (x0, y, x - x0, x - x0))
    paths = []
    for (r, g, b, al), d in sorted(runs.items(), key=lambda kv: -len(kv[1])):
        op = '' if al == 255 else ' fill-opacity="%s"' % num(al / 255)
        paths.append('<path fill="#%02x%02x%02x"%s d="%s"/>' % (r, g, b, op, ''.join(d)))
    s = 64 / max(w, h)
    box = 'x="%s" y="%s" width="%s" height="%s"' % (num((64 - w * s) / 2), num((64 - h * s) / 2), num(w * s), num(h * s))
    return artboard('<svg %s viewBox="0 0 %d %d" shape-rendering="crispEdges"><g stroke="none">%s</g></svg>' % (box, w, h, ''.join(paths))), \
        {'size': [w, h], 'native': [w, h]}


def lum(theme, pick):
    im = load(theme, pick)
    w, h = im.size
    px = np.asarray(im).astype(float)
    # Additive: what you see is the colour's brightness over the background (times any alpha it has).
    level = np.round(px[..., :3].max(axis=2) / 255 * (px[..., 3] / 255) * 15).astype(int)
    paths = []
    for lv in range(1, 16):
        d = []
        for y in range(h):
            x = 0
            while x < w:
                if level[y, x] != lv:
                    x += 1
                    continue
                x0 = x
                while x < w and level[y, x] == lv:
                    x += 1
                d.append('M%d %dh%dv1h-%d' % (x0, y, x - x0, x - x0))
        if d:
            op = '' if lv == 15 else ' fill-opacity="%s"' % num(lv / 15)
            paths.append('<path%s d="%s"/>' % (op, ''.join(d)))
    s = 64 / max(w, h)
    box = 'x="%s" y="%s" width="%s" height="%s"' % (num((64 - w * s) / 2), num((64 - h * s) / 2), num(w * s), num(h * s))
    return artboard('<svg %s viewBox="0 0 %d %d" shape-rendering="crispEdges"><g fill="currentColor" stroke="none">%s</g></svg>' % (
        box, w, h, ''.join(paths))), {'size': [w, h], 'native': [w, h], 'tinted': True}


def trace(theme, pick):
    import potrace
    im = load(theme, pick)
    up = pick.get('upscale', 1)
    if up > 1:
        im = im.resize((im.width * up, im.height * up), Image.LANCZOS)
    px = np.asarray(im).astype(float) / 255
    alpha, light = px[..., 3], px[..., :3].mean(axis=2)
    cut = pick.get('threshold', .5)
    mask = (alpha > cut) & (light > .5) if pick.get('light') else alpha > cut
    if pick.get('invert'):
        # A glyph cut out of a translucent panel: the holes inside the panel's box are the glyph.
        ys, xs = np.nonzero(mask)
        box = np.zeros_like(mask)
        box[ys.min():ys.max() + 1, xs.min():xs.max() + 1] = True
        mask = box & ~mask
    plist = potrace.Bitmap(~mask).trace(turdsize=max(2, 2 * up * up), alphamax=1.0, opticurve=True, opttolerance=.2)
    d = []
    for curve in plist:
        p = curve.start_point
        d.append('M%s %s' % (num(p.x), num(p.y)))
        for seg in curve.segments:
            if seg.is_corner:
                d.append('L%s %sL%s %s' % (num(seg.c.x), num(seg.c.y), num(seg.end_point.x), num(seg.end_point.y)))
            else:
                d.append('C%s %s %s %s %s %s' % (num(seg.c1.x), num(seg.c1.y), num(seg.c2.x), num(seg.c2.y), num(seg.end_point.x), num(seg.end_point.y)))
        d.append('z')
    ys, xs = np.nonzero(mask)
    x0, x1, y0, y1 = xs.min(), xs.max() + 1, ys.min(), ys.max() + 1
    return artboard('<svg %s viewBox="%d %d %d %d"><path fill="currentColor" fill-rule="evenodd" stroke="none" d="%s"/></svg>' % (
        fit(x1 - x0, y1 - y0), x0, y0, x1 - x0, y1 - y0, ''.join(d))), {'size': [int(im.width / up), int(im.height / up)], 'tinted': True}


def vector(theme, pick):
    root = ET.parse(source_path(theme, pick)).getroot()
    vb = [float(x) for x in re.split(r'[\s,]+', root.attrib['viewBox'].strip())] if root.attrib.get('viewBox') else \
        [0, 0, float(re.sub('[^0-9.]', '', root.attrib['width'])), float(re.sub('[^0-9.]', '', root.attrib['height']))]
    body = []
    for c in root:
        clean_element(c, pick.get('mono'), body)
    fill = ' fill="currentColor"' if pick.get('mono') else ''
    return artboard('<svg %s viewBox="%s"%s>%s</svg>' % (fit(vb[2], vb[3]), ' '.join(num(v) for v in vb), fill, ''.join(body))), \
        {'size': [vb[2], vb[3]], 'tinted': bool(pick.get('mono'))}


MODES = {'pixels': pixels, 'lum': lum, 'trace': trace, 'vector': vector}


def sha256(path):
    return hashlib.sha256(open(path, 'rb').read()).hexdigest()


def run(theme, pack, manifest):
    sel_path = os.path.join(BASE, 'select', theme + '.json')
    out, src_dir = os.path.join(BASE, 'derived', theme), os.path.join(BASE, 'source', theme)
    if not os.path.exists(sel_path):  # the theme uses nothing from Pack 3
        shutil.rmtree(out, ignore_errors=True)
        shutil.rmtree(src_dir, ignore_errors=True)
        return
    sel = json.load(open(sel_path))
    picks = sel.get('picks', {})
    os.makedirs(out, exist_ok=True)
    os.makedirs(src_dir, exist_ok=True)
    for aid in picks:
        if not re.fullmatch(r'p3-[a-z0-9-]+', aid):
            raise SystemExit('%s: ids are p3-<lowercase-words> (got %s)' % (theme, aid))
    for ref in list((sel.get('icons') or {}).values()) + list((sel.get('states') or {}).values()):
        if ref not in picks:
            raise SystemExit('%s: icons/states name %s, which isn\'t in picks' % (theme, ref))
    old_path = os.path.join(out, 'index.json')
    old = json.load(open(old_path)).get('picks', {}) if os.path.exists(old_path) else {}
    index, used_files = {}, set()
    for aid, pick in picks.items():
        dest = source_path(theme, pick)
        rec = manifest.get(pick['file'])
        if rec and rec.get('useAsReferenceOnly'):
            raise SystemExit('%s: %s is a reference image (not for use in the app)' % (theme, pick['file']))
        if not os.path.exists(dest):
            if not pack:
                raise SystemExit('%s: %s isn\'t copied yet: pass --pack <extracted pack folder>' % (theme, pick['file']))
            shutil.copyfile(os.path.join(pack, pick['file']), dest)
        if rec and rec.get('sha256') and sha256(dest) != rec['sha256']:
            raise SystemExit('%s: %s doesn\'t match the pack manifest\'s SHA-256' % (theme, pick['file']))
        used_files.add(os.path.basename(pick['file']))
        svg, info = MODES[pick['mode']](theme, pick)
        if len(svg) > MAX_SVG:
            raise SystemExit('%s: %s draws to %d bytes (at most %d): pick a smaller source or crop it' % (theme, aid, len(svg), MAX_SVG))
        open(os.path.join(out, aid + '.svg'), 'w').write(svg)
        if rec:
            src = rec.get('source') or {}
            prov = {'sha256': rec.get('sha256'), 'tier': rec.get('sourceTier'),
                    'source': {k: src.get(k) for k in ('repo', 'commit', 'path', 'kind', 'downloadUrl', 'archive', 'container', 'offset') if src.get(k)}}
        else:  # run without --pack: keep what was recorded when the file was copied
            prev = old.get(aid) if old.get(aid, {}).get('file') == pick['file'] else None
            if not prev:
                raise SystemExit('%s: no provenance for %s: pass --pack <extracted pack folder>' % (theme, pick['file']))
            prov = {k: prev.get(k) for k in ('sha256', 'tier', 'source')}
        index[aid] = {'name': pick.get('name') or (rec or {}).get('title') or (rec or {}).get('name') or (old.get(aid) or {}).get('name') or aid,
                      'mode': pick['mode'], 'file': pick['file'], **info, **({'crop': pick['crop']} if pick.get('crop') else {}), **prov}
        print('%-9s %-34s %-6s %6d bytes' % (theme, aid, pick['mode'], len(svg)))
    for old in os.listdir(out):
        if old.endswith('.svg') and old[:-4] not in picks:
            os.remove(os.path.join(out, old))
    for old in os.listdir(src_dir):
        if old not in used_files:
            os.remove(os.path.join(src_dir, old))
    doc = {'picks': index, 'icons': sel.get('icons') or {}, 'states': sel.get('states') or {}}
    json.dump(doc, open(os.path.join(out, 'index.json'), 'w'), indent=1, sort_keys=True)
    open(os.path.join(out, 'index.json'), 'a').write('\n')


def credits(pack):
    """ui/brand/Pack-3-CREDITS.md (every shipped Pack 3 drawing and its source) and, for each source
    repository used, its upstream notice from the pack's credits/ folder as ui/brand/Pack-3-<source>.txt."""
    brand = os.path.join(ROOT, 'browser-extension', 'ui', 'brand')
    lines = ['# Pack 3 artwork (v2.37)', '',
             'Artwork chosen from the owner\'s *25-theme visual asset pack* (the Authentic 25-Theme Pack) and drawn',
             'into the panel by tools/brand/pack3.py. The source files are in assets/theme-visual-pack-3/source/; the',
             'pack\'s manifest gives each one\'s origin, below. Original game, platform and application artwork remains',
             'the work of its creators; ROBOTIC TYLER is an unofficial fan project and uses it only to style its own panel.', '']
    repos = set()
    for theme in THEMES:
        f = os.path.join(BASE, 'derived', theme, 'index.json')
        picks = json.load(open(f)).get('picks', {}) if os.path.exists(f) else {}
        if not picks:
            continue
        lines += ['## ' + theme, '', '| Drawing | Source file | Source | Tier |', '|---|---|---|---|']
        for aid, info in sorted(picks.items()):
            src = info.get('source') or {}
            where = ' '.join(x for x in [src.get('repo') or src.get('archive') or '', src.get('path') or '',
                                         ('@' + src['commit'][:12]) if src.get('commit') else ''] if x)
            if src.get('repo'):
                repos.add(src['repo'])
            lines.append('| %s (%s) | %s | %s | %s |' % (aid, info.get('name', ''), os.path.basename(info['file']), where or 'see the pack manifest', info.get('tier') or ''))
        lines.append('')
    open(os.path.join(BASE, 'CREDITS.md'), 'w').write('\n'.join(lines))
    open(os.path.join(brand, 'Pack-3-CREDITS.md'), 'w').write('\n'.join(lines))
    if pack:
        for repo in sorted(repos):
            folder = os.path.join(pack, 'credits', repo.lower().replace('/', '-'))
            if not os.path.isdir(folder):
                continue
            text = []
            for name in sorted(os.listdir(folder)):
                text.append('==> ' + name + ' (from ' + repo + ') <==\n' + open(os.path.join(folder, name), errors='replace').read().strip() + '\n')
            open(os.path.join(brand, 'Pack-3-' + repo.replace('/', '-') + '.txt'), 'w').write('\n'.join(text))
    used = {'Pack-3-' + r.replace('/', '-') + '.txt' for r in repos}
    for old in os.listdir(brand):
        if old.startswith('Pack-3-') and old.endswith('.txt') and old not in used:
            os.remove(os.path.join(brand, old))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--pack', help='the extracted Robotic-Tyler-Authentic-25-Theme-Pack folder')
    ap.add_argument('themes', nargs='*')
    a = ap.parse_args()
    manifest = {}
    if a.pack:
        for rec in json.load(open(os.path.join(a.pack, 'asset-manifest.json')))['assets']:
            manifest[rec['file']] = rec
    for theme in a.themes or THEMES:
        if theme not in THEMES:
            raise SystemExit('unknown theme ' + theme)
        run(theme, a.pack, manifest)
    credits(a.pack)


if __name__ == '__main__':
    sys.exit(main())

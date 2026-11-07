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

CSS art (v2.45, the memory meter skins): a select file's optional "css" object lists art a theme's own
stylesheet draws, as {"p3-<id>": {"file": ..., "mode": ..., ...}} with the same modes. It is not put in
ui-brand.js: tools/build.mjs turns each one into a data: URL in the CSS variable --rt-art-<id>, set only
under that theme (Steam's page allows data: images, never a file or a link). Each is drawn at its own size:
  pixels  a PNG of the native bitmap (a palette when it has 256 colours or fewer), drawn with hard edges
  lum     a PNG mask: white, the additive sprite's brightness as its opacity (16 steps), for mask-image
  trace   an SVG mask (white glyph) in the glyph's own box
  vector  the source's SVG in its own viewBox (mono: one white shape, for mask-image)
  Options: crop, frame, seek as above; resize [w, h] (a large texture scaled down, smoothly, before drawing);
  rotate (90/180/270, a horizontal strip turned upright); key "#rrggbb" (a Windows bitmap's transparent colour).
  derived/<theme>/css/<id>.png|.svg and the "css" part of index.json (same provenance as the picks).

Usage:  python3 tools/brand/pack3.py --pack <extracted pack folder> <theme> [<theme> ...]
        (--pack is needed only when a source file isn't in source/<theme>/ yet)
Needs Pillow and NumPy (potracer for trace).
"""
import argparse, hashlib, io, json, os, re, shutil, sys
import xml.etree.ElementTree as ET
import numpy as np
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.normpath(os.path.join(HERE, '..', '..'))
BASE = os.path.join(ROOT, 'assets', 'theme-visual-pack-3')
THEMES = ['steam', 'classic', 'tf2', 'cs2', 'portal', 'cs16', 'hev', 'l4d', 'winxp', 'doom', 'quake', 'pipboy', 'combine',
          'deadlock', 'minecraft', 'payday', 'dreamcast', 'gmod', 'ricochet', 'dod', 'rust', 'x360', 'ipod', 'msn', 'xmb']
MAX_SVG = 48 * 1024  # one drawing; the panel loads every theme's drawings at once, so keep them small
MAX_CSS = 16 * 1024  # one piece of CSS art (it is in the panel's stylesheet for every theme, as a data: URL)

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
    if pick.get('resize'):  # CSS art only: a large render traced at a smaller size, for a simpler outline
        im = im.resize(tuple(pick['resize']), Image.LANCZOS)
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


# ── CSS art (v2.45): files for a theme's own stylesheet, each at its own size ──────────────────────────
def css_load(theme, pick):
    im = load(theme, pick)
    if pick.get('key'):  # a Windows resource bitmap's transparent colour (Messenger's magenta)
        key = tuple(int(pick['key'][i:i + 2], 16) for i in (1, 3, 5))
        px = np.asarray(im).copy()
        px[(px[..., 0] == key[0]) & (px[..., 1] == key[1]) & (px[..., 2] == key[2])] = 0
        im = Image.fromarray(px, 'RGBA')
    if pick.get('rotate'):
        im = im.rotate(-pick['rotate'], expand=True)  # clockwise, without resampling (multiples of 90)
    if pick.get('resize'):
        im = im.resize(tuple(pick['resize']), Image.LANCZOS)
    return im


def png(im):
    """The smallest lossless PNG of an RGBA image: RGBA, or a palette with per-entry opacity."""
    out = []
    b = io.BytesIO()
    im.save(b, 'PNG', optimize=True)
    out.append(b.getvalue())
    colours = im.getcolors(256)
    if colours:
        cols = [c for _, c in colours]
        at = {c: i for i, c in enumerate(cols)}
        p = Image.new('P', im.size)
        p.putdata([at[v] for v in im.getdata()])
        p.putpalette([ch for c in cols for ch in c[:3]])
        b = io.BytesIO()
        p.save(b, 'PNG', optimize=True, transparency=bytes(c[3] for c in cols))
        out.append(b.getvalue())
    return min(out, key=len)


def css_pixels(theme, pick):
    im = css_load(theme, pick)
    return png(im), 'png', {'size': list(im.size)}


def css_lum(theme, pick):
    im = css_load(theme, pick)
    px = np.asarray(im).astype(float)
    # Additive, as lum(): the brightness over black is what shows. White, with that as its opacity in 16 steps.
    a = np.round(px[..., :3].max(axis=2) / 255 * (px[..., 3] / 255) * 15) * 17
    out = np.zeros(px.shape, np.uint8)
    out[..., :3] = 255
    out[..., 3] = a.astype(np.uint8)
    return png(Image.fromarray(out, 'RGBA')), 'png', {'size': list(im.size), 'mask': True}


def css_trace(theme, pick):
    svg, info = trace(theme, pick)
    # trace() fits the glyph into the 64 x 64 artboard: keep only the inner drawing, in its own box.
    m = re.search(r'<svg [^>]*?viewBox="([^"]+)"><path fill="currentColor" fill-rule="evenodd" stroke="none" d="([^"]+)"/></svg>', svg)
    vb, d = m.group(1), m.group(2)
    w, h = [float(v) for v in vb.split()[2:]]
    return ('<svg xmlns="http://www.w3.org/2000/svg" viewBox="%s"><path fill="#fff" fill-rule="evenodd" d="%s"/></svg>' % (vb, d)).encode(), \
        'svg', {'size': [round(w / pick.get('upscale', 1), 2), round(h / pick.get('upscale', 1), 2)], 'mask': True}


def css_vector(theme, pick):
    root = ET.parse(source_path(theme, pick)).getroot()
    vb = [float(x) for x in re.split(r'[\s,]+', root.attrib['viewBox'].strip())] if root.attrib.get('viewBox') else \
        [0, 0, float(re.sub('[^0-9.]', '', root.attrib['width'])), float(re.sub('[^0-9.]', '', root.attrib['height']))]
    body = []
    for c in root:
        clean_element(c, pick.get('mono'), body)
    inner = ''.join(body).replace('currentColor', '#fff')
    fill = ' fill="#fff"' if pick.get('mono') else ''
    return ('<svg xmlns="http://www.w3.org/2000/svg" viewBox="%s"%s>%s</svg>' % (' '.join(num(v) for v in vb), fill, inner)).encode(), \
        'svg', {'size': [vb[2], vb[3]], **({'mask': True} if pick.get('mono') else {})}


CSS_MODES = {'pixels': css_pixels, 'lum': css_lum, 'trace': css_trace, 'vector': css_vector}


def provenance(theme, aid, pick, rec, old):
    if rec:
        src = rec.get('source') or {}
        return {'sha256': rec.get('sha256'), 'tier': rec.get('sourceTier'),
                'source': {k: src.get(k) for k in ('repo', 'commit', 'path', 'kind', 'downloadUrl', 'archive', 'container', 'offset') if src.get(k)}}
    prev = old.get(aid) if old.get(aid, {}).get('file') == pick['file'] else None
    if not prev:  # run without --pack: keep what was recorded when the file was copied
        raise SystemExit('%s: no provenance for %s: pass --pack <extracted pack folder>' % (theme, pick['file']))
    return {k: prev.get(k) for k in ('sha256', 'tier', 'source')}


def copy_source(theme, pick, pack, manifest):
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
    return rec


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
    # v2.45: the art the theme's own stylesheet draws (tools/build.mjs: data: URLs in --rt-art-<id>).
    css, css_index, css_dir = sel.get('css') or {}, {}, os.path.join(out, 'css')
    old_css = json.load(open(old_path)).get('css', {}) if os.path.exists(old_path) else {}
    if css:
        os.makedirs(css_dir, exist_ok=True)
    for aid, pick in css.items():
        if not re.fullmatch(r'p3-[a-z0-9-]+', aid) or aid in picks:
            raise SystemExit('%s: CSS art ids are p3-<lowercase-words>, unlike the picks (got %s)' % (theme, aid))
        rec = copy_source(theme, pick, pack, manifest)
        used_files.add(os.path.basename(pick['file']))
        data, ext, info = CSS_MODES[pick['mode']](theme, pick)
        if len(data) > MAX_CSS:
            raise SystemExit('%s: %s is %d bytes (at most %d): crop, resize or pick a smaller source' % (theme, aid, len(data), MAX_CSS))
        for e in ('png', 'svg'):
            if e != ext and os.path.exists(os.path.join(css_dir, aid + '.' + e)):
                os.remove(os.path.join(css_dir, aid + '.' + e))
        open(os.path.join(css_dir, aid + '.' + ext), 'wb').write(data)
        css_index[aid] = {'name': pick.get('name') or (rec or {}).get('title') or (old_css.get(aid) or {}).get('name') or aid,
                          'mode': pick['mode'], 'file': pick['file'], 'format': ext, 'bytes': len(data), **info,
                          **{k: pick[k] for k in ('crop', 'resize', 'rotate', 'key') if pick.get(k)}, **provenance(theme, aid, pick, rec, old_css)}
        print('%-9s %-34s %-6s %6d bytes (CSS %s)' % (theme, aid, pick['mode'], len(data), ext))
    if os.path.isdir(css_dir):
        for f in os.listdir(css_dir):
            if f.rsplit('.', 1)[0] not in css:
                os.remove(os.path.join(css_dir, f))
        if not os.listdir(css_dir):
            os.rmdir(css_dir)
    for old in os.listdir(out):
        if old.endswith('.svg') and old[:-4] not in picks:
            os.remove(os.path.join(out, old))
    for old in os.listdir(src_dir):
        if old not in used_files:
            os.remove(os.path.join(src_dir, old))
    doc = {'picks': index, 'icons': sel.get('icons') or {}, 'states': sel.get('states') or {}, **({'css': css_index} if css_index else {})}
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
        doc = json.load(open(f)) if os.path.exists(f) else {}
        # v2.45: the art a theme's stylesheet draws (the memory meter skins) is marked "CSS".
        picks = {**doc.get('picks', {}), **{k: {**v, 'name': (v.get('name') or k) + ', CSS'} for k, v in doc.get('css', {}).items()}}
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

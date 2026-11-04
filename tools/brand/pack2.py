#!/usr/bin/env python3
"""Pack 2 (v2.30): turns the few assets chosen from the owner's "Icon and Branding Pack 2"
(assets/theme-icons-pack-2, kept as supplied) into the 64 x 64 drawings tools/build.mjs embeds in
ui-brand.js, next to Pack 1's. Only the assets listed in SELECT are converted, and only those ship.

Three ways, chosen per asset so it looks like the original at the size the app shows it:
  vector  the source's own SVG (CS2's extracted vectors, TF2 class emblems), cleaned and fitted into
          the 4-60 box; white fills become currentColor so the theme colours them.
  pixels  a native bitmap (Windows XP icon frames, Messenger emoticons, Silk, Blades) copied pixel
          for pixel: one path per colour over the whole artboard, with hard edges. Shown at its
          native size (or a whole multiple) it is exactly the original bitmap.
  trace   a large one-colour glyph (PS3 XMB categories, Rust UI, Deadlock stats) traced at its full
          resolution (potrace) into one currentColor path, so it stays sharp at any size.

Writes assets/theme-icons-pack-2/derived/<theme>/<id>.svg and derived/index.json (what was made
from what). Needs Pillow, NumPy and potracer:  python3 tools/brand/pack2.py
"""
import json, os, re, sys
import xml.etree.ElementTree as ET
import numpy as np
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.normpath(os.path.join(HERE, '..', '..'))
PACK = os.path.join(ROOT, 'assets', 'theme-icons-pack-2')
OUT = os.path.join(PACK, 'derived')

# theme -> asset id -> how (frame: the ICO frame to copy, the native size the app shows).
SELECT = {
 'xmb': {i: {'mode': 'trace'} for i in ['source-category-friends', 'source-category-users', 'source-category-music',
                                        'source-category-settings', 'source-category-network', 'source-category-game']},
 'x360': {i: {'mode': 'pixels'} for i in ['source-achievements', 'source-friends', 'source-gscore']},
 'msn': {i: {'mode': 'pixels'} for i in ['source-smile', 'source-winking-smile-static', 'source-thumbs-up', 'source-thumbs-down',
                                        'source-thinking-smile-static', 'source-nerd-smile', 'source-light-bulb', 'source-note',
                                        'source-star', 'source-telephone-receiver', 'source-sleeping-half-moon', 'source-be-right-back']},
 'winxp': {i: {'mode': 'pixels', 'frame': 24} for i in ['source-shell32-4', 'source-shell32-16', 'source-shell32-18',
                                                         'source-shell32-24', 'source-shell32-28']},
 'gmod': {i: {'mode': 'pixels'} for i in ['source-silk-lock', 'source-silk-delete', 'source-silk-find', 'source-silk-sound',
                                         'source-silk-cog']},
 'rust': {i: {'mode': 'trace'} for i in ['source-ui-health', 'source-ui-food-cooked', 'source-ui-cup-water', 'source-ui-bleeding']},
 'deadlock': {i: {'mode': 'trace', 'upscale': 8} for i in ['source-health-regen-icon', 'source-ammo-icon']},
 'cs2': {**{i: {'mode': 'vector', 'mono': True} for i in ['source-equipment-defuser', 'source-equipment-c4', 'source-equipment-armor',
                                                         'source-ui-settings', 'source-ui-message', 'source-ui-play', 'source-ui-pause', 'source-ui-stop']},
         'source-ct-logo': {'mode': 'vector', 'mono': False}},
 'tf2': {i: {'mode': 'vector', 'mono': True} for i in ['source-class-scout', 'source-class-engineer', 'source-class-soldier',
                                                     'source-class-medic', 'source-class-sniper']},
}

TAGS = {'svg', 'g', 'path', 'rect', 'circle', 'ellipse', 'polygon', 'polyline', 'line'}
ATTRS = {'x', 'y', 'x1', 'y1', 'x2', 'y2', 'width', 'height', 'd', 'cx', 'cy', 'r', 'rx', 'ry', 'points', 'transform', 'fill',
         'fill-opacity', 'fill-rule', 'clip-rule', 'stroke', 'stroke-width', 'stroke-linecap', 'stroke-linejoin',
         'stroke-miterlimit', 'stroke-opacity', 'opacity', 'viewBox'}


def num(v):
    return re.sub(r'(\.\d*?[1-9])0+$|\.0+$', r'\1', '%.2f' % v)


def artboard(inner):
    return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">' + inner + '</svg>\n'


def fit(w, h, margin=4):
    """The nested <svg> box that fits a w x h drawing into the artboard, centred."""
    s = (64 - 2 * margin) / max(w, h)
    bw, bh = w * s, h * s
    return 'x="%s" y="%s" width="%s" height="%s"' % (num((64 - bw) / 2), num((64 - bh) / 2), num(bw), num(bh))


def clean_element(el, mono, out):
    tag = el.tag.split('}')[-1]
    if tag not in TAGS:
        return
    attrs = {}
    style = el.attrib.get('style', '')
    for decl in filter(None, (d.strip() for d in style.split(';'))):
        k, _, v = decl.partition(':')
        attrs[k.strip()] = v.strip()
    for k, v in el.attrib.items():
        k = k.split('}')[-1]
        if k in ATTRS and tag != 'svg' or (tag == 'svg' and k in ('viewBox',)):
            attrs[k] = v
    attrs = {k: v for k, v in attrs.items() if k in ATTRS}
    for k in ('fill', 'stroke'):
        if mono and k in attrs and attrs[k] != 'none':
            attrs[k] = 'currentColor'  # a one-colour glyph: the theme colours it
    if tag == 'svg':
        tag = 'g'
        attrs.pop('viewBox', None)
    if tag not in ('g',) and 'stroke' not in attrs:
        attrs['stroke'] = 'none'  # an icon style's stroke on the surrounding <svg> must not outline it
    out.append('<' + tag + ''.join(' %s="%s"' % (k, v.replace('"', "'")) for k, v in attrs.items()))
    kids = []
    for c in el:
        clean_element(c, mono, kids)
    out.append('>' + ''.join(kids) + '</' + tag + '>' if kids else '/>')


def vector(theme, a, opt):
    src = os.path.join(PACK, a['originalFile'])
    root = ET.parse(src).getroot()
    vb = [float(x) for x in re.split(r'[\s,]+', root.attrib.get('viewBox', '').strip())] if root.attrib.get('viewBox') else \
        [0, 0, float(re.sub('[^0-9.]', '', root.attrib['width'])), float(re.sub('[^0-9.]', '', root.attrib['height']))]
    body = []
    for c in root:
        clean_element(c, opt.get('mono'), body)
    body = ''.join(body)
    # Shapes that set no fill draw black in SVG: in a one-colour glyph that is the glyph colour.
    fill = ' fill="currentColor"' if opt.get('mono') else ''
    return artboard('<svg %s viewBox="%s"%s>%s</svg>' % (fit(vb[2], vb[3]), ' '.join(num(v) for v in vb), fill, body)), \
        {'from': a['originalFile'], 'size': [vb[2], vb[3]]}


def load_bitmap(a, opt):
    src = os.path.join(PACK, a['originalFile'])
    im = Image.open(src)
    if src.lower().endswith('.ico'):
        frame = opt.get('frame', 32)
        im = im.ico.getimage((frame, frame), 32)  # the 32-bit (XP) frame, not the 4- or 8-bit ones
    return im.convert('RGBA'), a['originalFile'] + ('#%dx%d' % (opt['frame'], opt['frame']) if opt.get('frame') else '')


def pixels(theme, a, opt):
    im, origin = load_bitmap(a, opt)
    w, h = im.size
    # Colours to 6 bits a channel and opacity to 16 steps (at most 2/255 off: not visible), so the
    # many near-identical shades of a 32-bit icon share paths.
    px = np.asarray(im).astype(int)
    px[..., :3] = np.minimum(255, (px[..., :3] + 2) // 4 * 4)
    px[..., 3] = np.round(px[..., 3] / 17) * 17
    runs = {}
    for y in range(h):
        x = 0
        while x < w:
            r, g, b, al = (int(v) for v in px[y, x])
            if al == 0:
                x += 1
                continue
            key = (r, g, b, al)
            x0 = x
            while x < w and tuple(int(v) for v in px[y, x]) == key:
                x += 1
            runs.setdefault(key, []).append('M%d %dh%dv1h-%d' % (x0, y, x - x0, x - x0))
    paths = []
    for (r, g, b, al), d in sorted(runs.items(), key=lambda kv: -len(kv[1])):
        op = '' if al == 255 else ' fill-opacity="%s"' % num(al / 255)
        paths.append('<path fill="#%02x%02x%02x"%s d="%s"/>' % (r, g, b, op, ''.join(d)))
    # The bitmap fills the artboard: at its native size one bitmap pixel is one screen pixel.
    s = 64 / max(w, h)
    box = 'x="%s" y="%s" width="%s" height="%s"' % (num((64 - w * s) / 2), num((64 - h * s) / 2), num(w * s), num(h * s))
    return artboard('<svg %s viewBox="0 0 %d %d" shape-rendering="crispEdges"><g stroke="none">%s</g></svg>' % (box, w, h, ''.join(paths))), \
        {'from': origin, 'size': [w, h], 'native': [w, h]}


def trace(theme, a, opt):
    import potrace
    im, origin = load_bitmap(a, opt)
    up = opt.get('upscale', 1)
    if up > 1:
        im = im.resize((im.width * up, im.height * up), Image.LANCZOS)
    px = np.asarray(im).astype(float) / 255
    alpha = px[..., 3]
    lum = px[..., :3].mean(axis=2)
    # A light glyph with a dark soft shadow (the XMB's) is its light part; a solid one-colour glyph
    # (Rust's black or white icons, Deadlock's) is everything opaque.
    light = (alpha > .5) & (lum > .5)
    mask = light if light.sum() > .25 * (alpha > .5).sum() and (lum[alpha > .5] < .3).mean() > .15 else alpha > .5
    # potracer traces the False pixels, so it gets the inverse of the glyph.
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
    h, w = mask.shape
    ys, xs = np.nonzero(mask)
    x0, x1, y0, y1 = xs.min(), xs.max() + 1, ys.min(), ys.max() + 1
    return artboard('<svg %s viewBox="%d %d %d %d"><path fill="currentColor" fill-rule="evenodd" stroke="none" d="%s"/></svg>' % (
        fit(x1 - x0, y1 - y0), x0, y0, x1 - x0, y1 - y0, ''.join(d))), {'from': origin, 'size': [int(w / up), int(h / up)]}


def main():
    manifest = json.load(open(os.path.join(PACK, 'manifest.json')))
    themes = {t['id']: t for t in manifest['themes']}
    index = {}
    for theme, picks in SELECT.items():
        assets = {a['id']: a for a in themes[theme]['assets']}
        os.makedirs(os.path.join(OUT, theme), exist_ok=True)
        for old in os.listdir(os.path.join(OUT, theme)):
            if old[:-4] not in picks:
                os.remove(os.path.join(OUT, theme, old))
        for aid, opt in picks.items():
            a = assets[aid]
            svg, info = {'vector': vector, 'pixels': pixels, 'trace': trace}[opt['mode']](theme, a, opt)
            open(os.path.join(OUT, theme, aid + '.svg'), 'w').write(svg)
            src = a.get('source') or a.get('provenance') or {}
            index.setdefault(theme, {})[aid] = {'name': a['name'], 'mode': opt['mode'], **info,
                                                'kind': src.get('kind'), 'source': src.get('sourceUrl') or src.get('repo')}
            print('%-9s %-32s %-6s %6d bytes' % (theme, aid, opt['mode'], len(svg)))
    json.dump(index, open(os.path.join(OUT, 'index.json'), 'w'), indent=1, sort_keys=True)
    open(os.path.join(OUT, 'index.json'), 'a').write('\n')


if __name__ == '__main__':
    sys.exit(main())

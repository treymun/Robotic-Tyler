#!/usr/bin/env python3
"""Renders every ROBOTIC TYLER logo file from the traced vector (tools/logo/paths.txt),
plus the Windows installer artwork in build/ (sidebar and header bitmaps).

paths.txt holds two SVG path strings traced from tools/logo/source.png
(line 1: cream face, line 2: red valve wheel) in a 125.4 x 125.4 space.
Needs rsvg-convert, Pillow and the DejaVu fonts.  Usage: python3 tools/logo/render.py
"""
import os, subprocess, tempfile
from PIL import Image

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
cream, red = open(os.path.join(ROOT, 'tools/logo/paths.txt')).read().split('\n')[:2]
NAVY, CREAM, RED = '#171f28', '#ede0cf', '#c8423c'
# Square crops around the head (bbox x 23.6-100.9, y 17.5-101.1).
TIGHT = (17.95, 15.0, 88.6)    # in-app mark and icons up to 32 px
MEDIUM = (8.75, 5.8, 107.0)    # larger icons
FULL = (0, 0, 125.4)

def svg(crop, radius=0.0, xml=True):
    x, y, s = crop
    clip = ''
    body = (f'<rect x="{x}" y="{y}" width="{s}" height="{s}" fill="{NAVY}"/>'
            f'<path fill="{CREAM}" fill-rule="evenodd" d="{cream}"/>'
            f'<path fill="{RED}" fill-rule="evenodd" d="{red}"/>')
    if radius:
        r = round(s * radius, 2)
        clip = f'<clipPath id="c"><rect x="{x}" y="{y}" width="{s}" height="{s}" rx="{r}"/></clipPath>'
        body = f'<g clip-path="url(#c)">{body}</g>'
    head = '<?xml version="1.0" encoding="UTF-8"?>\n' if xml else ''
    return (f'{head}<svg xmlns="http://www.w3.org/2000/svg" viewBox="{x} {y} {s} {s}">'
            f'{clip}{body}</svg>\n')

def write(rel, text):
    path = os.path.join(ROOT, rel); os.makedirs(os.path.dirname(path), exist_ok=True)
    open(path, 'w', encoding='utf-8').write(text)

def png(crop, size, radius, rel=None):
    with tempfile.NamedTemporaryFile('w', suffix='.svg', delete=False) as f:
        f.write(svg(crop, radius)); src = f.name
    out = os.path.join(ROOT, rel) if rel else src + '.png'
    os.makedirs(os.path.dirname(out), exist_ok=True)
    subprocess.run(['rsvg-convert', '-w', str(size), '-h', str(size), src, '-o', out], check=True)
    os.unlink(src)
    return out

# Vector sources. The in-app mark has no corner rounding: each surface's CSS clips it.
write('assets/robotic-tyler.svg', svg(FULL))
write('browser-extension/ui/logo-mark.svg', svg(TIGHT, xml=False))

# Chrome toolbar / extensions page.
for size in (16, 32, 48, 128):
    png(TIGHT if size <= 32 else MEDIUM, size, 0.12 if size <= 32 else 0.18, f'browser-extension/icons/icon-{size}.png')

# Desktop windows, Voice Studio sidebar and installers.
png(MEDIUM, 512, 0.18, 'assets/robotic-tyler.png')
png(TIGHT, 32, 0.12, 'assets/robotic-tyler-tray.png')
frames = [Image.open(png(TIGHT if s <= 32 else MEDIUM, s, 0.12 if s <= 32 else 0.18)).convert('RGBA') for s in (256, 128, 64, 48, 32, 24, 16)]
frames[0].save(os.path.join(ROOT, 'assets/robotic-tyler.ico'), sizes=[f.size for f in frames], append_images=frames[1:])

# ── Windows installer artwork (NSIS: sidebar 164x314, header 150x57, 24-bit BMP) ──
from PIL import ImageDraw, ImageFont
FONT = '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf'
BOLD = '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf'
def font(path, size): return ImageFont.truetype(path, size)
def centered(draw, y, text, f, fill, width):
    w = draw.textlength(text, font=f); draw.text(((width - w) / 2, y), text, font=f, fill=fill)
def rounded(img, radius):
    mask = Image.new('L', img.size, 0); ImageDraw.Draw(mask).rounded_rectangle((0, 0, img.size[0] - 1, img.size[1] - 1), radius, fill=255)
    out = Image.new('RGBA', img.size, (0, 0, 0, 0)); out.paste(img, (0, 0), mask); return out

def sidebar(app_lines, rel):
    W, H = 164, 314
    top, bottom = (27, 40, 56), (23, 26, 33)          # Steam canvas to bar
    img = Image.new('RGB', (W, H))
    px = img.load()
    for y in range(H):
        t = y / (H - 1); c = tuple(round(a + (b - a) * t) for a, b in zip(top, bottom))
        for x in range(W): px[x, y] = c
    d = ImageDraw.Draw(img)
    d.rectangle((0, 0, W - 1, 2), fill=(26, 159, 255))  # thin active-blue rule
    logo = rounded(Image.open(png(TIGHT, 104, 0)).convert('RGBA'), 14)
    img.paste(logo, ((W - 104) // 2, 42), logo)
    centered(d, 164, 'ROBOTIC TYLER', font(BOLD, 14), (255, 255, 255), W)
    y = 186
    for line in app_lines:
        centered(d, y, line, font(FONT, 12), (102, 192, 244), W); y += 17
    d.line((40, H - 52, W - 40, H - 52), fill=(42, 63, 90), width=1)
    centered(d, H - 42, 'Steam companion', font(FONT, 10), (143, 152, 160), W)
    out = os.path.join(ROOT, rel); os.makedirs(os.path.dirname(out), exist_ok=True); img.save(out, 'BMP')

def header(rel):
    W, H = 150, 57
    img = Image.new('RGB', (W, H), (255, 255, 255)); d = ImageDraw.Draw(img)
    logo = rounded(Image.open(png(TIGHT, 41, 0)).convert('RGBA'), 6)
    img.paste(logo, (W - 41 - 8, 8), logo)
    d.text((8, 14), 'ROBOTIC', font=font(BOLD, 12), fill=(23, 26, 33))
    d.text((8, 29), 'TYLER', font=font(BOLD, 12), fill=(23, 26, 33))
    img.save(os.path.join(ROOT, rel), 'BMP')

# Since v2.19 the desktop installer's sidebar comes from tools/setup/art/nsis-sidebar.html
# (node tools/setup/render-art.mjs). The old Voice Studio sidebar is no longer used.
header('build/installer-header.bmp')
print('Logo files and installer artwork written.')

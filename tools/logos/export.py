#!/usr/bin/env python3
"""Exports the aligned theme logos (tools/logos/aligned/<theme>.png, 512 px) to the
files the apps use, in browser-extension/ui/logos/:
  <theme>.png      128 px  settings page, Voice Studio, desktop window icons
  <theme>.webp     128 px  embedded in ui-logos.js: the source the apps resample to the exact
                           on-screen size (Lanczos + a light unsharp mask), so small logos stay crisp
  <theme>-16/-32.png       Chrome toolbar icon, desktop tray icon: dedicated small versions,
                           resampled straight from the 512 px master and sharpened the same way
DOOM and Minecraft are pixel art, so they are resized without smoothing. Then run: node tools/build.mjs
Needs Pillow:  python3 tools/logos/export.py"""
import os
from PIL import Image,ImageFilter
HERE=os.path.dirname(os.path.abspath(__file__))
SRC=os.path.join(HERE,'aligned');SMALL=os.path.join(HERE,'small');OUT=os.path.join(HERE,'..','..','browser-extension','ui','logos')
PIXEL={'doom','minecraft'}
os.makedirs(OUT,exist_ok=True)
import sys
ONLY=set(sys.argv[1:])  # optional: export just these themes (python3 tools/logos/export.py quake pipboy)
for name in sorted(os.listdir(SRC)):
    if not name.endswith('.png'):continue
    if ONLY and name[:-4] not in ONLY:continue
    theme=name[:-4];im=Image.open(os.path.join(SRC,name)).convert('RGBA')
    size=lambda n:im.resize((n,n),Image.NEAREST if theme in PIXEL else Image.LANCZOS)
    # A dedicated small version (tools/logos/small.py) replaces the art at 48 px or less.
    sm=Image.open(os.path.join(SMALL,name)).convert('RGBA') if os.path.exists(os.path.join(SMALL,name)) else None
    if sm:sm.resize((128,128),Image.LANCZOS).save(os.path.join(OUT,theme+'-sm.webp'),quality=94,method=6)
    elif os.path.exists(os.path.join(OUT,theme+'-sm.webp')):os.remove(os.path.join(OUT,theme+'-sm.webp'))
    def small(n):
        # Small sizes: resample from the master, sharpen lightly, and drop the faint fringe.
        if theme in PIXEL:return size(n)
        s=(sm or im).resize((n,n),Image.LANCZOS);rgb=s.convert('RGB').filter(ImageFilter.UnsharpMask(radius=0.7,percent=70,threshold=1))
        a=s.getchannel('A').point(lambda v:0 if v<18 else min(255,int(v*1.08)))
        return Image.merge('RGBA',(*rgb.split(),a))
    size(128).save(os.path.join(OUT,theme+'.png'),optimize=True)
    size(128).save(os.path.join(OUT,theme+'.webp'),quality=94,method=6,lossless=theme in PIXEL)
    for n in (16,32):small(n).save(os.path.join(OUT,f'{theme}-{n}.png'),optimize=True)
    print('exported',theme)

#!/usr/bin/env python3
"""Exports the aligned theme logos (tools/logos/aligned/<theme>.png, 512 px) to the
files the apps use, in browser-extension/ui/logos/:
  <theme>.png      128 px  settings page, Voice Studio, desktop window icons
  <theme>.webp      96 px  embedded in the chat panel (ui-logos.js)
  <theme>-16/-32.png       Chrome toolbar icon, desktop tray icon
DOOM and Minecraft are pixel art, so they are resized without smoothing. Then run: node tools/build.mjs
Needs Pillow:  python3 tools/logos/export.py"""
import os
from PIL import Image
HERE=os.path.dirname(os.path.abspath(__file__))
SRC=os.path.join(HERE,'aligned');OUT=os.path.join(HERE,'..','..','browser-extension','ui','logos')
PIXEL={'doom','minecraft'}
os.makedirs(OUT,exist_ok=True)
import sys
ONLY=set(sys.argv[1:])  # optional: export just these themes (python3 tools/logos/export.py quake pipboy)
for name in sorted(os.listdir(SRC)):
    if not name.endswith('.png'):continue
    if ONLY and name[:-4] not in ONLY:continue
    theme=name[:-4];im=Image.open(os.path.join(SRC,name)).convert('RGBA')
    size=lambda n:im.resize((n,n),Image.NEAREST if theme in PIXEL else Image.LANCZOS)
    size(128).save(os.path.join(OUT,theme+'.png'),optimize=True)
    size(96).save(os.path.join(OUT,theme+'.webp'),quality=92,method=6,lossless=theme in PIXEL)
    for n in (16,32):size(n).save(os.path.join(OUT,f'{theme}-{n}.png'),optimize=True)
    print('exported',theme)

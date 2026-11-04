#!/usr/bin/env python3
"""Dedicated small-size logos (v2.18). Compared at 32 and 64 px on each theme's real panel background,
three logos read better small with a specific change; the rest use their normal art at every size.
  dreamcast  the VMU sits off-centre with wide margins: centred and enlarged to fill the tile
  dod        the radio handset pushes Tyler to the left: centred and enlarged
  quake      dark brown on a dark frame: midtones lifted so the face and glasses read
  rust, x360, ipod, msn, xmb (v2.27)  the owner's artwork puts a lot round Tyler (signs, the console,
             the buddies): small, the head and eye piece are cropped closer so the face still reads
Writes tools/logos/small/<theme>.png (512 px) from tools/logos/aligned/<theme>.png; the masters stay
untouched. export.py turns them into ui/logos/<theme>-sm.webp (the panel uses it at 48 px or less)
and the -16/-32 toolbar icons.  Run: python3 tools/logos/small.py && python3 tools/logos/export.py"""
import os
from PIL import Image,ImageEnhance
HERE=os.path.dirname(os.path.abspath(__file__))
SRC=os.path.join(HERE,'aligned');OUT=os.path.join(HERE,'small');os.makedirs(OUT,exist_ok=True)
def centred(im):
    box=im.getchannel('A').point(lambda v:255 if v>40 else 0).getbbox()
    w,h=box[2]-box[0],box[3]-box[1];side=max(w,h);pad=int(side*0.04)
    out=Image.new('RGBA',(side+2*pad,side+2*pad),(0,0,0,0));out.paste(im.crop(box),(pad+(side-w)//2,pad+(side-h)//2))
    return out.resize((512,512),Image.LANCZOS)
def lifted(im,gamma=.8,colour=1.12,contrast=1.1):
    rgb=im.convert('RGB').point(lambda v:round(255*((v/255)**gamma)))
    rgb=ImageEnhance.Color(ImageEnhance.Contrast(rgb).enhance(contrast)).enhance(colour)
    return Image.merge('RGBA',(*rgb.split(),im.getchannel('A')))
def face(im,box=(52,18,460,426)):
    return im.crop(box).resize((512,512),Image.LANCZOS)
RECIPES={'dreamcast':centred,'dod':centred,'quake':lifted,'rust':face,'x360':face,'ipod':face,'msn':face,'xmb':face}
for theme,fn in RECIPES.items():
    fn(Image.open(os.path.join(SRC,theme+'.png')).convert('RGBA')).save(os.path.join(OUT,theme+'.png'),optimize=True)
    print('small',theme)

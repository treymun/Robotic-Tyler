#!/usr/bin/env python3
"""The Messenger butterfly (v2.27), cut from the owner's Messenger background
(assets/theme-logos/themes-21-25/backgrounds/msn.png) into assets/theme-logos/themes-21-25/marks/
msn-butterfly.png, where tools/logos/mirror.py uses it to put the butterfly the right way round on
the mirrored Messenger logo. (The apps' brand marks come from the branded icon pack, ui-brand.js.)
Needs Pillow, NumPy and SciPy:  python3 tools/art/export.py"""
import os
import numpy as np
from PIL import Image,ImageFilter
HERE=os.path.dirname(os.path.abspath(__file__));ROOT=os.path.join(HERE,'..','..')
SRC=os.path.join(ROOT,'assets','theme-logos','themes-21-25','backgrounds')
import scipy.ndimage as nd
# Everything sky-coloured around the butterfly becomes transparent.
im=Image.open(os.path.join(SRC,'msn.png')).convert('RGB').crop((1250,70,1660,400))
a=np.asarray(im).astype(int);R,G,B=a[...,0],a[...,1],a[...,2]
sky=(B>200)&(R<232)&(B-R>22)&(G>150)
lab,_=nd.label(nd.binary_opening(~sky,iterations=1))
mask=nd.binary_fill_holes(lab==lab[165,205])
cut=im.convert('RGBA');cut.putalpha(Image.fromarray((mask*255).astype('uint8')).filter(ImageFilter.GaussianBlur(0.8)))
cut=cut.crop(cut.getbbox())
os.makedirs(os.path.join(ROOT,'assets','theme-logos','themes-21-25','marks'),exist_ok=True)
cut.save(os.path.join(ROOT,'assets','theme-logos','themes-21-25','marks','msn-butterfly.png'))
print('exported msn-butterfly',cut.size)

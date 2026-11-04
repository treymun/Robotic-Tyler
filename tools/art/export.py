#!/usr/bin/env python3
"""Brand marks (v2.27), cut from the owner's widescreen backgrounds for Rust, Xbox 360, iPod classic,
MSN Messenger and PlayStation 3 (assets/theme-logos/themes-21-25/backgrounds/<theme>.png). The
backgrounds themselves aren't used: the themes keep their own surfaces, like the other twenty.

  tools/art/marks/msn-butterfly.webp  the Messenger butterfly, for the pop-ups
  tools/art/marks/ps-logo.webp        the PlayStation logo, for Information and the sign-in notice
  tools/art/marks/apple.webp          the Apple logo, for the iPod's start-up screen

ui-art.js embeds them (node tools/build.mjs) and draws them on canvases, so Steam's page policy never
sees an image URL. The full-size butterfly also goes to assets/theme-logos/themes-21-25/marks/, where
tools/logos/mirror.py uses it. Each mark is unchanged apart from the cut-out and scaling.
Needs Pillow, NumPy and SciPy:  python3 tools/art/export.py"""
import os
import numpy as np
from PIL import Image,ImageFilter
HERE=os.path.dirname(os.path.abspath(__file__));ROOT=os.path.join(HERE,'..','..')
SRC=os.path.join(ROOT,'assets','theme-logos','themes-21-25','backgrounds')
MARKS=os.path.join(HERE,'marks');os.makedirs(MARKS,exist_ok=True)
import scipy.ndimage as nd
def keyed(theme,box,bright,keep=None,within=None):
    # The mark is the large bright (or dark) shapes in the box; alpha follows the luminance so the
    # edges stay smooth.
    im=Image.open(os.path.join(SRC,theme+'.png')).convert('RGB').crop(box);a=np.asarray(im).astype(float);L=a.mean(2)
    sel=L>bright if bright>0 else L<-bright
    if within:x0,y0,x1,y1=within;w=np.zeros_like(sel);w[y0:y1,x0:x1]=True;sel&=w   # leave out the wave crossing behind it
    lab,n=nd.label(sel);sizes=nd.sum(sel,lab,range(1,n+1));big=[i+1 for i,v in enumerate(sizes) if v>=(keep or .2)*sizes.max()]
    mask=nd.binary_dilation(np.isin(lab,big),iterations=2)
    lo,hi=(np.percentile(L[~mask],60),np.percentile(L[np.isin(lab,big)],70)) if bright>0 else (np.percentile(L[~mask],40),np.percentile(L[np.isin(lab,big)],30))
    alpha=np.clip((L-lo)/(hi-lo),0,1)*mask
    out=np.dstack([a,alpha*255]).astype('uint8');cut=Image.fromarray(out,'RGBA');return cut.crop(cut.getbbox())
for name,cut in [('ps-logo',keyed('xmb',(1380,260,1680,540),150,.15,(55,70,270,240))),('apple',keyed('ipod',(10,20,160,170),-90,.02))]:
    cut.thumbnail((128,128),Image.LANCZOS);cut.save(os.path.join(MARKS,name+'.webp'),quality=92,method=6);print('exported',name,cut.size)

# The Messenger butterfly: everything sky-coloured around it becomes transparent.
import scipy.ndimage as nd
im=Image.open(os.path.join(SRC,'msn.png')).convert('RGB').crop((1250,70,1660,400))
a=np.asarray(im).astype(int);R,G,B=a[...,0],a[...,1],a[...,2]
sky=(B>200)&(R<232)&(B-R>22)&(G>150)
lab,_=nd.label(nd.binary_opening(~sky,iterations=1))
mask=nd.binary_fill_holes(lab==lab[165,205])
cut=im.convert('RGBA');cut.putalpha(Image.fromarray((mask*255).astype('uint8')).filter(ImageFilter.GaussianBlur(0.8)))
cut=cut.crop(cut.getbbox())
os.makedirs(os.path.join(ROOT,'assets','theme-logos','themes-21-25','marks'),exist_ok=True)
cut.save(os.path.join(ROOT,'assets','theme-logos','themes-21-25','marks','msn-butterfly.png'))  # mirror.py uses it
cut.thumbnail((96,96),Image.LANCZOS)
cut.save(os.path.join(MARKS,'msn-butterfly.webp'),quality=92,method=6)
print('exported msn-butterfly',cut.size)

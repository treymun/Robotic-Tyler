#!/usr/bin/env python3
"""v2.27: the five-theme pack's logos (assets/theme-logos/themes-21-25/masters) face left; the other
twenty face right. This mirrors each one and then flips its brand marks back in place (text, symbols,
the controller buttons), so they still read the right way round. Each mark is a region with a soft
edge, flipped about its own centre. Two marks overlap other art, so they are handled differently:
the four PlayStation symbols are each symmetric, so only their order is wrong: they are lifted off
(the jacket under them is filled in with OpenCV inpainting) and put back in the right order; the
Messenger butterfly is covered by the clean one cut from the owner's Messenger background
(tools/art/export.py). The two buddies stay mirrored (the green one in front, now on the right).
Output: <out>/<theme>.png at 1254 px, ready for align.py. Needs Pillow, NumPy, SciPy and OpenCV.
  python3 tools/logos/mirror.py assets/theme-logos/themes-21-25/masters <out>"""
import sys,os
from PIL import Image,ImageOps,ImageDraw,ImageFilter
SRC,OUT=sys.argv[1],sys.argv[2]
import numpy as np,cv2,scipy.ndimage as nd
HERE=os.path.dirname(os.path.abspath(__file__));ROOT=os.path.join(HERE,'..','..')
# Regions in mirrored-master pixels: ('rect',x0,y0,x1,y1,feather), ('circle',cx,cy,r,feather),
# ('reorder',x0,y0,x1,y1,min saturation,min value,outline px): reverse the order of the marks in the box,
# ('butterfly',cx,cy,width): the clean butterfly, centred there.
MARKS={
 'rust':[('circle',655,546,84,3),('rect',195,686,425,906,8),('rect',359,1024,780,1182,6)],   # eye plate, sign, RUST plank
 'x360':[('circle',305,864,82,4),('rect',284,938,604,1048,10)],                              # A B X Y, XBOX 360 ®
 'ipod':[('circle',613,613,136,2),('rect',418,1000,541,1126,5)],  # click wheel, Apple (the tiny iPod's screen stays as it is)
 'msn':[('butterfly',387,452,408),('circle',602,676,86,3)],                                     # butterfly, chat lens
 'xmb':[('circle',543,648,95,3),('reorder',290,925,726,1110,.4,.3,9)],                              # PlayStation lens, △ ○ ✕ □
}
os.makedirs(OUT,exist_ok=True)
for theme,marks in MARKS.items():
    src=os.path.join(SRC,theme+'.png')
    if not os.path.exists(src):continue
    im=ImageOps.mirror(Image.open(src).convert('RGBA'))
    for m in marks:
        if m[0]=='reorder':
            _,x0,y0,x1,y1,smin,vmin,grow=m;a=np.array(im.crop((x0,y0,x1,y1)));rgb=a[...,:3].astype(np.float32)/255
            mx,mn=rgb.max(2),rgb.min(2);sat=np.where(mx>0,(mx-mn)/np.maximum(mx,1e-6),0)
            lab,n=nd.label(nd.binary_dilation(nd.binary_fill_holes((sat>smin)&(mx>vmin)&(a[...,3]>200)),iterations=grow))
            blobs=sorted([b for b in nd.find_objects(lab) if (lab[b]>0).sum()>2000],key=lambda b:b[1].start)
            assert len(blobs)==4,('expected the four symbols',len(blobs))
            parts=[(b,a[b].copy(),nd.binary_fill_holes(lab[b]>0)) for b in blobs]
            hole=np.zeros(lab.shape,np.uint8)
            for b,_,_ in parts:hole[max(0,b[0].start-14):b[0].stop+8,max(0,b[1].start-8):b[1].stop+8]=255  # each symbol's whole box, its faint bevel too
            out=a.copy();out[...,:3]=cv2.inpaint(np.ascontiguousarray(a[...,:3]),hole,11,cv2.INPAINT_TELEA)
            H,W=lab.shape
            for (b,_,_),(_,px,mask) in zip(parts,reversed(parts)):
                # The mark that belongs in this slot, centred on it (clipped to the box).
                h,w=mask.shape;y=(b[0].start+b[0].stop)//2-h//2;x=(b[1].start+b[1].stop)//2-w//2
                ty0,tx0=max(0,y),max(0,x);ty1,tx1=min(H,y+h),min(W,x+w)
                sp=px[ty0-y:ty1-y,tx0-x:tx1-x].astype(np.float32);sm=cv2.GaussianBlur(mask.astype(np.float32),(5,5),0)[ty0-y:ty1-y,tx0-x:tx1-x,None]
                region=out[ty0:ty1,tx0:tx1].astype(np.float32);out[ty0:ty1,tx0:tx1]=(sp*sm+region*(1-sm)).astype(np.uint8)
            im.paste(Image.fromarray(out),(x0,y0));continue
        if m[0]=='butterfly':
            _,cx,cy,w=m;b=Image.open(os.path.join(ROOT,'assets','theme-logos','themes-21-25','marks','msn-butterfly.png')).convert('RGBA')
            b=b.resize((w,round(w*b.height/b.width)),Image.LANCZOS);im.alpha_composite(b,(cx-b.width//2,cy-b.height//2));continue
        if m[0]=='circle':_,cx,cy,r,f=m;box=(cx-r,cy-r,cx+r,cy+r)
        else:_,x0,y0,x1,y1,f=m;box=(x0,y0,x1,y1)
        part=ImageOps.mirror(im.crop(box));w,h=part.size
        mask=Image.new('L',(w,h),0);d=ImageDraw.Draw(mask)
        if m[0]=='circle':d.ellipse((f,f,w-1-f,h-1-f),fill=255)
        else:d.rectangle((f,f,w-1-f,h-1-f),fill=255)
        if f:mask=mask.filter(ImageFilter.GaussianBlur(f/2))
        base=im.crop(box);base.paste(part,(0,0),mask);im.paste(base,box[:2])
    im.save(os.path.join(OUT,theme+'.png'))
    print('mirrored',theme)

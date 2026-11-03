# python3 tools/logos/derive.py  — writes browser-extension/ui/logos/<theme>.png|.webp|-32.png|-16.png
# Derived app logos from the supplied masters: same artwork, framed like the existing ten
# (bust anchored near the bottom, ~92% fill); small icons crop slightly tighter to the head.
import sys
from PIL import Image
import os
ROOT=os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
P=os.path.join(ROOT,'assets','theme-logos')+'/'
OUT=os.path.join(ROOT,'browser-extension','ui','logos')+'/'
THEMES=['quake','pipboy','combine','deadlock','minecraft']
def bbox(im):
  return im.getchannel('A').point(lambda v:255 if v>8 else 0).getbbox()
def frame(t,size,fill=.92,bottom=.015,head=None):
  im=Image.open(P+'masters/'+t+'.png').convert('RGBA');b=bbox(im);art=im.crop(b)
  if head:art=art.crop((0,0,art.width,int(art.height*head)))
  pixel=(t=='minecraft')
  s=fill*size/max(art.width,art.height)
  w,h=max(1,round(art.width*s)),max(1,round(art.height*s))
  art=art.resize((w,h),Image.NEAREST if pixel else Image.LANCZOS)
  out=Image.new('RGBA',(size,size),(0,0,0,0))
  x=(size-w)//2;y=size-h-round(bottom*size)
  out.alpha_composite(art,(x,max(0,y)));return out
if __name__=='__main__':
  for t in THEMES:
    frame(t,128).save(OUT+f'{t}.png',optimize=True)
    frame(t,96).save(OUT+f'{t}.webp','WEBP',lossless=(t=='minecraft'),quality=92,method=6)
    frame(t,32,fill=.96,bottom=0,head=.9).save(OUT+f'{t}-32.png',optimize=True)
    frame(t,16,fill=1.0,bottom=0,head=.84).save(OUT+f'{t}-16.png',optimize=True)
  print('ok')

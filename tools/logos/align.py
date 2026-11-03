# Aligns the ten theme logos so the glasses sit at the same height and width in every
# square, keeping hats/helmets/frames inside the canvas (shoulders may be trimmed a little).
import sys,json,numpy as np
from PIL import Image,ImageDraw
SRC=sys.argv[1];OUT=sys.argv[2]
N=1254
# Landmarks in master pixels: glasses outer left, valve outer right, eye line y.
L={'steam':(372,1065,724),'classic-steam-2004':(331,945,699),'team-fortress-2':(394,1002,573),'counter-strike-2':(425,977,567),
   'portal':(284,961,646),'counter-strike-1-6':(394,961,614),'half-life-hev':(410,945,529),'left-4-dead':(378,967,498),
   'windows-xp':(441,1033,598),'doom-classic':(362,1002,630),
   # v2.17, the five-theme pack (assets/theme-logos/masters). Combine is a three-quarter pose, so its
   # left landmark is the near edge of the mask rather than the (foreshortened) glasses.
   'quake':(274,944,499),'pipboy':(401,974,618),'combine':(423,971,607),'deadlock':(419,981,637),'minecraft':(423,1021,679),
   # v2.18, themes 16-20 (assets/theme-logos/themes-16-20/masters, cut from the supplied preview).
   # The Dreamcast logo is a VMU with Tyler on its screen, so its landmarks are the screen edges.
   'payday':(430,985,620),'dreamcast':(330,866,590),'gmod':(490,980,500),'ricochet':(476,846,496),'dod':(550,1115,642)}
PIXEL={'doom-classic','minecraft'}
TSPAN,TX,TY=600,668,585     # target glasses width, glasses centre x, eye line y
TOP,SIDE,BOTTOM=0.03*N,0.02*N,0.012*N   # keep tops inside; allow up to 6% of the bust to be trimmed
info={}
import os
for name,(gl,gr,ey) in L.items():
  if not os.path.exists(f'{SRC}/{name}.png'):continue  # run on whichever pack folder is given
  im=Image.open(f'{SRC}/{name}.png').convert('RGBA');a=np.array(im)[:,:,3];ys,xs=np.where(a>24)
  x0,y0,x1,y1=xs.min(),ys.min(),xs.max(),ys.max();mx=(gl+gr)/2
  s=TSPAN/(gr-gl)
  # shrink until everything except a little of the bottom fits
  for _ in range(200):
    top=TY-(ey-y0)*s;left=TX-(mx-x0)*s;right=TX+(x1-mx)*s;bottom=TY+(y1-ey)*s
    if top>=TOP and left>=SIDE and right<=N-SIDE and bottom<=N+BOTTOM:break
    s*=0.995
  ox=TX-mx*s;oy=TY-ey*s
  # pull back up if the top is way too low after shrinking? keep eye line fixed for consistency
  big=im.resize((round(N*s),round(N*s)),Image.NEAREST if name in PIXEL else Image.LANCZOS)
  canvas=Image.new('RGBA',(N,N),(0,0,0,0));canvas.alpha_composite(big,(round(ox),round(oy))) if ox>=0 and oy>=0 else None
  if ox<0 or oy<0:
    c=Image.new('RGBA',(N,N),(0,0,0,0));c.paste(big,(round(ox),round(oy)),big);canvas=c
  canvas.save(f'{OUT}/{name}.png')
  info[name]={'scale':round(s,3),'span':round((gr-gl)*s),'eye_y':round(ey*s+oy),'top':round(top),'bottom':round(bottom)}
json.dump(info,open(f'{OUT}/align.json','w'),indent=1)
for k,v in info.items():print(f'{k:20s}',v)

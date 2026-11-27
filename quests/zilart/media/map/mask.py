import math, sys
from PIL import Image, ImageDraw, ImageFilter
W,H=1600,1200
S,N=55.6936,55.7021
K=math.cos(math.radians(55.696283))
mH=(N-S)*111320; mW=mH*W/H
CL=37.6360; dl=mW/(111320*K)
Wl,El=CL-dl/2,CL+dl/2
print('bounds',[[S,round(Wl,6)],[N,round(El,6)]], 'm', round(mW),round(mH))
ppm=W/mW
def P(lat,lon): return ((lon-Wl)/(El-Wl)*W,(N-lat)/(N-S)*H)
img=Image.new('RGB',(W,H),'#E9DCC3'); d=ImageDraw.Draw(img)
# река: линия дела, продолжена по крайним отрезкам до краёв
line=[(55.697,37.6282),(55.6989,37.6283),(55.7008,37.6296)]
pts=[P(*g) for g in line]
def ext(a,b,t): return (a[0]+(a[0]-b[0])*t,a[1]+(a[1]-b[1])*t)
w=60*ppm
d.line(pts,fill='#8FB6C4',width=int(w),joint='curve')
for p in pts:
    r=w/2; d.ellipse([p[0]-r,p[1]-r,p[0]+r,p[1]+r],fill='#8FB6C4')
# концы: сужающийся мазок на ~120 м за последними известными точками (дальше реку не знаем — не рисуем)
import math as _m
for a,b in ((pts[0],pts[1]),(pts[-1],pts[-2])):
    ux,uy=a[0]-b[0],a[1]-b[1]; L=_m.hypot(ux,uy); ux/=L; uy/=L; nx,ny=-uy,ux; T=120*ppm
    d.polygon([(a[0]+nx*w/2,a[1]+ny*w/2),(a[0]+ux*T+nx*w*.12,a[1]+uy*T+ny*w*.12),(a[0]+ux*T*1.05-nx*w*.1,a[1]+uy*T*1.05-ny*w*.1),(a[0]-nx*w/2,a[1]-ny*w/2)],fill='#8FB6C4')
# парк: blob как в player.js
area=[(55.695,37.6397),(55.696283,37.643762),(55.698082,37.641713),(55.695794,37.640323)]
q=[P(*g) for g in area]; cx=sum(p[0] for p in q)/4; cy=sum(p[1] for p in q)/4; pad=35*ppm
Pp=[]
for x,y in q:
    dx,dy=x-cx,y-cy; dd=math.hypot(dx,dy) or 1; Pp.append((x+dx/dd*pad,y+dy/dd*pad))
mid=lambda u,v:((u[0]+v[0])/2,(u[1]+v[1])/2)
poly=[]; cur=mid(Pp[-1],Pp[0])
for i in range(4):
    c=Pp[i]; e=mid(Pp[i],Pp[(i+1)%4])
    for t in range(0,21):
        t/=20; poly.append(((1-t)**2*cur[0]+2*t*(1-t)*c[0]+t*t*e[0],(1-t)**2*cur[1]+2*t*(1-t)*c[1]+t*t*e[1]))
    cur=e
d.polygon(poly,fill='#8FA873')
# пруд: эллипс у точки 2, r=30 м (rx 1.25r, ry .8r)
c=P(55.695,37.6397); r=30*ppm
d.ellipse([c[0]-1.25*r,c[1]-.8*r,c[0]+1.25*r,c[1]+.8*r],fill='#8FB6C4')
img.save(sys.argv[1]); 

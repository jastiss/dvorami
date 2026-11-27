import math
INK='#26302C'; INK2='#3F4A45'; PAPER='#EEF1EC'; WALL='#DCE2DC'; JOINT='#C2CBC4'
FACE='#F8F9F5'; SHADE='#B3BFB7'; GOLD='#B8893A'; GOLDT='#7A5A1C'; MOSS='#5E7A5A'
def spiral(cx,cy,r0,turns=2.4,sign=1,start=-math.pi/2):
    pts=[]; n=120
    for i in range(n+1):
        t=i/n; a=start+sign*t*turns*2*math.pi; r=r0*(1-t*0.86)
        pts.append((cx+r*math.cos(a), cy+r*math.sin(a)))
    return 'M'+' L'.join(f'{x:.1f} {y:.1f}' for x,y in pts)
cx=310; sw=130; L=cx-sw//2; R=cx+sw//2
s=[]
s.append(f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 900" width="1200" height="900">')
s.append('''<defs>
<linearGradient id="cyl" x1="0" x2="1"><stop offset="0" stop-color="#C9D2CB"/><stop offset=".3" stop-color="#FAFBF8"/><stop offset=".62" stop-color="#E2E8E2"/><stop offset="1" stop-color="#9DAAA2"/></linearGradient>
<pattern id="hatch" width="14" height="14" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><line x1="0" y1="0" x2="0" y2="14" stroke="#5E7A5A" stroke-width="4"/></pattern>
</defs>''')
s.append(f'<rect width="1200" height="900" fill="{PAPER}"/>')
# wall
s.append(f'<rect x="60" y="96" width="500" height="554" fill="{WALL}"/>')
for i,y in enumerate(range(96+62,650,62)):
    s.append(f'<line x1="60" y1="{y}" x2="560" y2="{y}" stroke="{JOINT}" stroke-width="3"/>')
for j,y0 in enumerate(range(96,650,62)):
    off=0 if j%2 else 62
    for x in range(60+off,560,124):
        if x>60: s.append(f'<line x1="{x}" y1="{y0}" x2="{x}" y2="{min(y0+62,650)}" stroke="{JOINT}" stroke-width="3"/>')
# pilaster: shadow strip right, shaft
s.append(f'<rect x="{R}" y="232" width="12" height="368" fill="{SHADE}"/>')
s.append(f'<rect x="{L}" y="225" width="{sw}" height="378" fill="{FACE}" stroke="{INK}" stroke-width="4"/>')
# base (two steps)
s.append(f'<rect x="{L-12}" y="600" width="{sw+24}" height="22" fill="{FACE}" stroke="{INK}" stroke-width="4"/>')
s.append(f'<rect x="{L-22}" y="620" width="{sw+44}" height="30" fill="{FACE}" stroke="{INK}" stroke-width="4"/>')
# capital: astragal, volute band, abacus
s.append(f'<rect x="{L-4}" y="206" width="{sw+8}" height="19" fill="{FACE}" stroke="{INK}" stroke-width="4"/>')
s.append(f'<path d="M{L-30} 160 H{R+30} V172 Q{R+30} 206 {R} 206 H{L} Q{L-30} 206 {L-30} 172 Z" fill="{FACE}" stroke="{INK}" stroke-width="4"/>')
for k in range(3):
    ex=cx-30+k*30
    s.append(f'<ellipse cx="{ex}" cy="186" rx="10" ry="13" fill="none" stroke="{INK2}" stroke-width="3"/>')
for vx,sg in ((L-14,1),(R+14,-1)):
    s.append(f'<circle cx="{vx}" cy="194" r="36" fill="{FACE}" stroke="{INK}" stroke-width="4"/>')
    s.append(f'<path d="{spiral(vx,194,31,2.3,sg)}" fill="none" stroke="{GOLD}" stroke-width="5" stroke-linecap="round"/>')
    s.append(f'<circle cx="{vx}" cy="194" r="5" fill="{GOLD}"/>')
s.append(f'<rect x="{L-44}" y="142" width="{sw+88}" height="20" fill="{FACE}" stroke="{INK}" stroke-width="4"/>')
# ground
s.append(f'<line x1="40" y1="650" x2="1160" y2="650" stroke="{MOSS}" stroke-width="5"/>')
# callout to volute
s.append(f'<path d="M{R+50} 194 C 470 194 480 120 500 98" fill="none" stroke="{GOLD}" stroke-width="4"/>')
s.append(f'<circle cx="{R+50}" cy="194" r="6" fill="{GOLD}"/>')
s.append(f'<text x="470" y="80" font-family="Alegreya Sans" font-weight="700" font-size="54" fill="{GOLDT}">капитель с завитками</text>')
# round column
c2=960; w2=110; L2=c2-w2//2
s.append(f'<ellipse cx="{c2}" cy="652" rx="120" ry="12" fill="#C9D2CB"/>')
s.append(f'<rect x="{L2-26}" y="620" width="{w2+52}" height="30" fill="{FACE}" stroke="{INK}" stroke-width="4"/>')
s.append(f'<rect x="{L2-12}" y="598" rx="11" width="{w2+24}" height="24" fill="url(#cyl)" stroke="{INK}" stroke-width="4"/>')
s.append(f'<rect x="{L2}" y="250" width="{w2}" height="350" fill="url(#cyl)" stroke="{INK}" stroke-width="4"/>')
s.append(f'<rect x="{L2-12}" y="226" rx="12" width="{w2+24}" height="26" fill="url(#cyl)" stroke="{INK}" stroke-width="4"/>')
s.append(f'<rect x="{L2-28}" y="200" width="{w2+56}" height="28" fill="{FACE}" stroke="{INK}" stroke-width="4"/>')
# plans
s.append('<g>')
s.append(f'<rect x="140" y="700" width="340" height="22" fill="url(#hatch)" stroke="{MOSS}" stroke-width="3"/>')
s.append(f'<rect x="{L}" y="722" width="{sw}" height="22" fill="{FACE}" stroke="{INK}" stroke-width="4"/>')
s.append(f'<circle cx="{c2}" cy="738" r="{w2//2}" fill="url(#cyl)" stroke="{INK}" stroke-width="4"/>')
s.append(f'<text x="640" y="740" text-anchor="middle" font-family="Alegreya Sans" font-weight="500" font-size="44" fill="{INK2}">вид сверху</text>')
s.append('</g>')
# labels
s.append(f'<text x="{cx}" y="836" text-anchor="middle" font-family="Alegreya" font-weight="700" font-size="62" fill="{INK}">Пилястра</text>')
s.append(f'<text x="{cx}" y="884" text-anchor="middle" font-family="Alegreya Sans" font-weight="500" font-size="46" fill="{INK2}">плоская, у стены</text>')
s.append(f'<text x="{c2}" y="836" text-anchor="middle" font-family="Alegreya" font-weight="700" font-size="62" fill="{INK}">Колонна</text>')
s.append(f'<text x="{c2}" y="884" text-anchor="middle" font-family="Alegreya Sans" font-weight="500" font-size="46" fill="{INK2}">круглая, отдельно</text>')
s.append('</svg>')
open('pilaster.svg','w').write('\n'.join(s))

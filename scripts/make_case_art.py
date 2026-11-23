#!/usr/bin/env python3
"""Иллюстрации мест для страниц дел (site/assets/ill/spots/) и обложки первого экрана №4–7.

Каждое дело — свой стиль (паспорт quests/*/identity.md):
  №1 ЗИЛАРТ — «синий час» (как остальные иллюстрации платформы);
  №4 — синька-чертёж; №5 — типографский оттиск; №6 — театральная сцена; №7 — видовая открытка 1950-х.
Ни одна картинка не показывает ответ точки (см. «Не делать» в identity.md): нет надписей,
счётных деталей (арки, колонны, башенки, окна, рыцари, блоки ракеты), вершин ворот, шпиля и обелиска.
Текста внутри SVG нет — подписи и alt живут в HTML.

Запуск: python3 scripts/make_case_art.py
"""
import math
import os
import random

ROOT = os.path.join(os.path.dirname(__file__), '..', 'site', 'assets', 'ill')
OUT = os.path.join(ROOT, 'spots')
W, H = 1200, 900


def svg(title, desc, body, defs=''):
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}" width="{W}" height="{H}" '
            f'role="img" aria-labelledby="t d"><title id="t">{title}</title><desc id="d">{desc}</desc>'
            f'<defs>{defs}</defs>{body}</svg>\n')


def save(name, title, desc, body, defs=''):
    os.makedirs(OUT, exist_ok=True)
    path = os.path.join(ROOT if name.startswith(('hero-', 'scene-')) else OUT, name + '.svg')
    with open(path, 'w', encoding='utf-8') as f:
        f.write(svg(title, desc, body, defs))


# ---------------------------------------------------------------- «синий час» (№1)
BH_DEFS = '''<linearGradient id="sky" x1="0" y1="0" x2="0" y2="640" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#0A1230"/><stop offset=".32" stop-color="#17245A"/><stop offset=".6" stop-color="#3B4C8A"/><stop offset=".8" stop-color="#7C79A6"/><stop offset=".92" stop-color="#D79A86"/><stop offset="1" stop-color="#FFC27A"/></linearGradient>
<radialGradient id="zar" cx="700" cy="640" r="700" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#FFB27A" stop-opacity=".5"/><stop offset=".5" stop-color="#FFB27A" stop-opacity=".16"/><stop offset="1" stop-color="#FFB27A" stop-opacity="0"/></radialGradient>
<radialGradient id="gl"><stop offset="0" stop-color="#FFE7A6" stop-opacity=".95"/><stop offset=".2" stop-color="#FFC53D" stop-opacity=".5"/><stop offset=".55" stop-color="#FFB347" stop-opacity=".14"/><stop offset="1" stop-color="#FFB347" stop-opacity="0"/></radialGradient>
<radialGradient id="vig" cx="600" cy="450" r="820" gradientUnits="userSpaceOnUse"><stop offset=".55" stop-color="#050818" stop-opacity="0"/><stop offset="1" stop-color="#050818" stop-opacity=".62"/></radialGradient>
<linearGradient id="gnd" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#1A2350"/><stop offset="1" stop-color="#0B1130"/></linearGradient>
<linearGradient id="rust" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#C8652E"/><stop offset=".6" stop-color="#8E3F1D"/><stop offset="1" stop-color="#4E2414"/></linearGradient>
<linearGradient id="gold" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#FFE29A"/><stop offset=".45" stop-color="#E0A93E"/><stop offset="1" stop-color="#8E6420"/></linearGradient>
<linearGradient id="water" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#D79A86" stop-opacity=".55"/><stop offset=".35" stop-color="#3B4C8A"/><stop offset="1" stop-color="#0E1638"/></linearGradient>
<filter id="blur" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="12"/></filter>
<filter id="grain" x="0" y="0" width="100%" height="100%"><feTurbulence type="fractalNoise" baseFrequency=".8" numOctaves="2" seed="7" stitchTiles="stitch"/><feColorMatrix values="0 0 0 0 1 0 0 0 0 .95 0 0 0 0 .85 0 0 0 .5 -.18"/></filter>'''


def bh_sky(seed=1, horizon=640):
    r = random.Random(seed)
    stars = ''.join(f'<circle cx="{r.randint(0, W)}" cy="{r.randint(0, 220)}" r="{r.choice([0.9, 1.2, 1.6])}"/>' for _ in range(40))
    return (f'<rect width="{W}" height="{H}" fill="url(#sky)"/><rect width="{W}" height="{H}" fill="url(#zar)"/>'
            f'<g fill="#F3F1EA" opacity=".7">{stars}</g>'
            f'<circle cx="1010" cy="140" r="60" fill="url(#gl)" opacity=".35"/>'
            f'<path d="M1010 124a16 16 0 1 0 0 32a12.5 16 0 1 1 0 -32Z" fill="#FFF1C9"/>')


def bh_windows(x, y, w, h, cols, rows, seed, on=.45, cw=14, ch=18, base='#2B3A70'):
    r = random.Random(seed)
    out = []
    gx = (w - cols * cw) / (cols + 1)
    gy = (h - rows * ch) / (rows + 1)
    for i in range(cols):
        for j in range(rows):
            wx = x + gx + i * (cw + gx)
            wy = y + gy + j * (ch + gy)
            lit = r.random() < on
            col = r.choice(['#FFC53D', '#FFD56E', '#FFB347']) if lit else base
            out.append(f'<rect x="{wx:.0f}" y="{wy:.0f}" width="{cw}" height="{ch}" fill="{col}" opacity="{0.85 if lit else 0.9}"/>')
    return ''.join(out)


def bh_tower(x, y, w, h, seed, color='#3A4677'):
    return (f'<rect x="{x}" y="{y}" width="{w}" height="{h}" fill="{color}"/>'
            + bh_windows(x, y + 8, w, h - 16, max(2, w // 26), max(3, h // 34), seed))


def bh_lamp(x, y, h=150):
    return (f'<path d="M{x} {y}v-{h}" stroke="#0B1130" stroke-width="5"/>'
            f'<circle cx="{x}" cy="{y-h}" r="70" fill="url(#gl)" opacity=".8"/>'
            f'<circle cx="{x}" cy="{y-h}" r="8" fill="#FFF1C9"/>')


def bh_person(x, y, s=1.0, child=False):
    hh = 54 * s * (0.62 if child else 1)
    return (f'<g fill="#070B22"><circle cx="{x}" cy="{y-hh-9*s}" r="{8*s}"/>'
            f'<path d="M{x-10*s} {y}l3 -{hh*0.55}q-3 -{hh*0.4} 7 -{hh*0.45}h0q10 {hh*0.05} 7 {hh*0.45}l3 {hh*0.55}Z"/></g>')


def bh_finish():
    return (f'<rect width="{W}" height="{H}" fill="url(#vig)"/>'
            f'<rect width="{W}" height="{H}" filter="url(#grain)" opacity=".5"/>')


def zilart_spots():
    # 1. Дом с белыми зайцами
    body = bh_sky(11)
    body += bh_tower(40, 330, 140, 330, 2) + bh_tower(1010, 300, 160, 360, 3)
    body += '<path d="M230 150h740v520H230Z" fill="#6E3326"/>'
    body += '<g stroke="#5A2A20" stroke-width="2">' + ''.join(f'<path d="M230 {y}H970"/>' for y in range(170, 670, 18)) + '</g>'
    hares = []
    for row in range(7):
        for col in range(10):
            hx = 270 + col * 72 + (36 if row % 2 else 0)
            hy = 205 + row * 66
            if hx > 950:
                continue
            hares.append(f'<g transform="translate({hx} {hy})"><rect x="-10" y="-30" width="8" height="26" rx="4"/><rect x="2" y="-30" width="8" height="26" rx="4"/><ellipse cx="0" cy="4" rx="15" ry="12"/><circle cx="-5" cy="2" r="1.8" fill="#6E3326"/><circle cx="5" cy="2" r="1.8" fill="#6E3326"/></g>')
    body += '<g fill="#EFE9DE">' + ''.join(hares) + '</g>'
    body += '<rect x="230" y="150" width="740" height="520" fill="#1A2350" opacity=".18"/>'
    body += '<path d="M0 660H1200V900H0Z" fill="url(#gnd)"/>'
    body += bh_lamp(160, 700, 170) + bh_lamp(1080, 710, 170)
    body += '<g opacity=".9">' + bh_person(520, 760) + bh_person(560, 764, child=True) + bh_person(820, 740, .9) + '</g>'
    body += '<rect x="230" y="560" width="740" height="110" fill="#FFC27A" opacity=".08"/>' + bh_finish()
    save('zilart-hares', 'ЗИЛАРТ: дом с белыми зайцами',
         'Кирпичный фасад дома в синий час, по нему рядами идут белые маски зайцев с длинными ушами; рядом высокие дома с тёплыми окнами, у фасада гуляют взрослый с ребёнком, горят фонари.', body, BH_DEFS)

    # 2. Рыжий навес
    body = bh_sky(12)
    body += bh_tower(80, 360, 120, 300, 5) + bh_tower(220, 420, 100, 240, 6) + bh_tower(930, 330, 130, 330, 7) + bh_tower(1080, 380, 100, 280, 8)
    body += '<path d="M0 640Q300 600 600 630T1200 620V900H0Z" fill="#1B3A3A"/>'
    body += '<path d="M0 700Q400 660 700 690T1200 680V900H0Z" fill="url(#gnd)"/>'
    beams = []
    for i in range(10):
        t = i / 9
        x = 120 + t * 640 - t * t * 160
        top = 210 + t * 190
        bot = 830 - t * 170
        wdt = 34 - t * 24
        beams.append(f'<rect x="{x:.0f}" y="{top:.0f}" width="{wdt:.0f}" height="{bot-top:.0f}" fill="url(#rust)"/>')
    body += ''.join(beams)
    body += '<path d="M90 200L700 395L712 410L100 236Z" fill="url(#rust)"/>'
    body += '<path d="M90 236L700 410" stroke="#2A140B" stroke-width="3" opacity=".5"/>'
    body += bh_lamp(860, 760, 160) + bh_lamp(1010, 740, 150)
    body += '<g opacity=".9">' + bh_person(430, 812) + bh_person(470, 816, child=True) + bh_person(980, 760, .8) + '</g>'
    body += bh_finish()
    save('zilart-pergola', 'ЗИЛАРТ: рыжий навес в парке',
         'Длинный навес из рыжего металла уходит вдаль ровным рядом опор и балок, вокруг вечерний парк, за деревьями дома с тёплыми окнами, по дорожке идут взрослый с ребёнком.', body, BH_DEFS)

    # 3. Кружевной грузовик
    body = bh_sky(13)
    body += '<path d="M120 260H1080V660H120Z" fill="#7A5232"/><path d="M120 260H1080V280H120Z" fill="#A9743F"/>'
    body += bh_windows(140, 300, 920, 330, 12, 4, 9, on=.6, cw=44, ch=56, base='#4B3520')
    body += '<path d="M0 660H1200V900H0Z" fill="url(#gnd)"/>'
    body += '<ellipse cx="600" cy="800" rx="440" ry="40" fill="#000" opacity=".35"/>'
    tr = ['<g fill="none" stroke="#E9D9B8" stroke-width="5">',
          '<path d="M250 760V560H700V760"/><path d="M700 760V610L760 520H900L960 610V760Z"/>',
          '<path d="M770 610V535H880L930 610Z"/>']
    for i in range(7):
        x0 = 270 + i * 62
        tr.append(f'<path d="M{x0} 740V640Q{x0} 590 {x0+21} 575Q{x0+42} 590 {x0+42} 640V740"/>')
        tr.append(f'<path d="M{x0+21} 575V560M{x0+6} 640H{x0+36}"/><circle cx="{x0+21}" cy="610" r="9"/>')
    tr.append('<path d="M250 600H700M250 690H700"/>')
    tr.append('</g>')
    body += ''.join(tr)
    body += '<g fill="#0B1130" stroke="#E9D9B8" stroke-width="5"><circle cx="340" cy="780" r="46"/><circle cx="560" cy="780" r="46"/><circle cx="860" cy="780" r="46"/></g>'
    body += '<g fill="none" stroke="#E9D9B8" stroke-width="3">' + ''.join(f'<circle cx="{c}" cy="780" r="20"/>' for c in (340, 560, 860)) + '</g>'
    body += bh_lamp(110, 760, 180) + bh_lamp(1110, 760, 180)
    body += '<g opacity=".9">' + bh_person(1010, 800, .9) + bh_person(1045, 804, child=True) + '</g>' + bh_finish()
    save('zilart-truck', 'ЗИЛАРТ: кружевной грузовик у музея',
         'Вечер у музея: перед медным фасадом с рядами светящихся окон стоит грузовик-самосвал в натуральную величину, весь сквозной, будто вырезанный из кружева стрельчатых арок; рядом взрослый и ребёнок.', body, BH_DEFS)

    # 4. Пресс у музея
    body = bh_sky(14)
    body += '<path d="M640 220H1180V680H640Z" fill="#7A5232"/>' + bh_windows(660, 250, 500, 400, 6, 4, 4, on=.65, cw=52, ch=60, base='#4B3520')
    body += bh_tower(20, 360, 150, 300, 12)
    body += '<path d="M0 660H1200V900H0Z" fill="url(#gnd)"/>'
    body += '<rect x="170" y="680" width="520" height="40" fill="#2A3466"/>'
    body += '<g fill="#3E4A6E" stroke="#0B1130" stroke-width="4">'
    body += '<rect x="420" y="250" width="170" height="430"/><rect x="380" y="610" width="250" height="70"/><rect x="400" y="230" width="210" height="60"/>'
    body += '</g>'
    body += '<circle cx="300" cy="400" r="150" fill="#2C355A" stroke="#0B1130" stroke-width="6"/>'
    body += '<circle cx="300" cy="400" r="120" fill="none" stroke="#56628F" stroke-width="10"/>'
    body += '<g stroke="#56628F" stroke-width="12">' + ''.join(f'<path d="M300 400L{300+115*math.cos(a):.0f} {400+115*math.sin(a):.0f}"/>' for a in [i * math.pi / 3 for i in range(6)]) + '</g>'
    body += '<circle cx="300" cy="400" r="30" fill="#0B1130"/><path d="M300 400L470 330" stroke="#0B1130" stroke-width="16"/>'
    body += '<path d="M420 250H590" stroke="#FFC27A" stroke-width="3" opacity=".6"/><path d="M160 300a150 150 0 0 1 120 -48" stroke="#FFC27A" stroke-width="4" fill="none" opacity=".6"/>'
    body += bh_lamp(740, 760, 160)
    body += '<g opacity=".9">' + bh_person(860, 790) + bh_person(900, 794, child=True) + '</g>' + bh_finish()
    save('zilart-press', 'ЗИЛАРТ: заводской пресс у музея',
         'Огромный заводской станок с маховиком стоит на постаменте перед медным зданием музея со светящимися окнами; рядом фонарь и прохожие.', body, BH_DEFS)

    # 5. Пруд в роще
    body = bh_sky(15)
    body += bh_tower(60, 340, 110, 250, 21) + bh_tower(190, 300, 90, 290, 22) + bh_tower(940, 320, 120, 270, 23) + bh_tower(1080, 360, 100, 230, 24)
    body += '<path d="M0 560Q200 500 420 540T820 530T1200 540V900H0Z" fill="#1B3A3A"/>'
    body += '<path d="M120 640Q600 580 1080 650Q980 780 600 790Q220 780 120 640Z" fill="url(#water)"/>'
    body += '<g opacity=".35" fill="#FFC53D">' + ''.join(f'<rect x="{x}" y="{y}" width="10" height="4"/>' for x, y in [(220, 680), (260, 700), (950, 690), (990, 670), (610, 720)]) + '</g>'
    birches = []
    for i, (bx, bh) in enumerate([(240, 300), (300, 260), (880, 320), (940, 270), (1000, 300)]):
        birches.append(f'<rect x="{bx}" y="{620-bh}" width="10" height="{bh}" fill="#E8E4DA"/>'
                       f'<g fill="#0B1130">' + ''.join(f'<rect x="{bx}" y="{620-bh+k*34}" width="{5 + (k%3)*2}" height="3"/>' for k in range(bh // 34)) + '</g>'
                       f'<ellipse cx="{bx+5}" cy="{620-bh}" rx="60" ry="80" fill="#22463F" opacity=".95"/>')
    body += ''.join(birches)
    body += '<path d="M0 760Q300 730 600 800T1200 770V900H0Z" fill="url(#gnd)"/>'
    body += bh_lamp(560, 810, 140) + bh_lamp(760, 800, 140)
    body += '<g opacity=".9">' + bh_person(640, 850) + bh_person(676, 854, child=True) + '</g>' + bh_finish()
    save('zilart-pond', 'ЗИЛАРТ: пруд в парке',
         'Вечерний пруд среди холмов парка: в воде отражается сумеречное небо, на берегу берёзы, вдали дома с тёплыми окнами, по дорожке идут взрослый с ребёнком.', body, BH_DEFS)

    # 6. Золотая арка
    body = bh_sky(16)
    body += bh_tower(40, 300, 170, 360, 31) + bh_tower(230, 360, 140, 300, 32) + bh_tower(830, 320, 150, 340, 33) + bh_tower(1000, 280, 180, 380, 34)
    body += '<path d="M0 650H1200V900H0Z" fill="url(#gnd)"/>'
    body += '<path d="M380 760V430C380 250 600 220 600 380C600 220 820 250 820 430V760" fill="none" stroke="url(#gold)" stroke-width="54"/>'
    body += '<path d="M380 760V430C380 250 600 220 600 380" fill="none" stroke="#FFF1C9" stroke-width="6" opacity=".5"/>'
    body += '<ellipse cx="600" cy="780" rx="300" ry="26" fill="#FFC27A" opacity=".18"/>'
    body += bh_lamp(300, 790, 160) + bh_lamp(900, 790, 160)
    body += '<g opacity=".9">' + bh_person(560, 830) + bh_person(596, 834, child=True) + bh_person(1060, 800, .85) + '</g>' + bh_finish()
    save('zilart-arch', 'ЗИЛАРТ: золотая арка',
         'Вечерний двор нового квартала: посередине стоит высокая золотая арка с двойным изгибом, вокруг дома с тёплыми окнами и фонари, под аркой взрослый с ребёнком.', body, BH_DEFS)


# ---------------------------------------------------------------- синька-чертёж (№4)
BP_BG = '#123E6E'
BP = '#EAF2FA'
BP_DEFS = f'''<pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse"><path d="M40 0H0V40" fill="none" stroke="#FFFFFF" stroke-opacity=".08" stroke-width="1"/></pattern>
<pattern id="grid5" width="200" height="200" patternUnits="userSpaceOnUse"><path d="M200 0H0V200" fill="none" stroke="#FFFFFF" stroke-opacity=".12" stroke-width="1.4"/></pattern>
<filter id="paper" x="0" y="0" width="100%" height="100%"><feTurbulence type="fractalNoise" baseFrequency=".9" numOctaves="2" seed="4" stitchTiles="stitch"/><feColorMatrix values="0 0 0 0 1 0 0 0 0 1 0 0 0 0 1 0 0 0 .5 -.2"/></filter>
<radialGradient id="bpv" cx="600" cy="450" r="760" gradientUnits="userSpaceOnUse"><stop offset=".5" stop-color="#0A2B52" stop-opacity="0"/><stop offset="1" stop-color="#0A2B52" stop-opacity=".55"/></radialGradient>'''


def bp_bg():
    return (f'<rect width="{W}" height="{H}" fill="{BP_BG}"/><rect width="{W}" height="{H}" fill="url(#grid)"/>'
            f'<rect width="{W}" height="{H}" fill="url(#grid5)"/>')


def bp_finish(frame=True):
    s = f'<rect width="{W}" height="{H}" fill="url(#bpv)"/><rect width="{W}" height="{H}" filter="url(#paper)" opacity=".35"/>'
    if frame:
        s += (f'<rect x="28" y="28" width="{W-56}" height="{H-56}" fill="none" stroke="{BP}" stroke-opacity=".7" stroke-width="2"/>'
              f'<path d="M{W-330} {H-28}V{H-118}H{W-28}M{W-330} {H-73}H{W-28}M{W-200} {H-118}V{H-28}" fill="none" stroke="{BP}" stroke-opacity=".7" stroke-width="2"/>')
    return s


def dim(x1, y, x2, off=0, tick=14):
    """Горизонтальная размерная линия со стрелками (без числа)."""
    return (f'<g stroke="{BP}" stroke-width="1.6" fill="none" opacity=".85">'
            f'<path d="M{x1} {y-tick}V{y+tick}M{x2} {y-tick}V{y+tick}M{x1} {y}H{x2}"/>'
            f'<path d="M{x1+16} {y-5}L{x1} {y}L{x1+16} {y+5}M{x2-16} {y-5}L{x2} {y}L{x2-16} {y+5}"/></g>')


def vdim(x, y1, y2):
    return (f'<g stroke="{BP}" stroke-width="1.6" fill="none" opacity=".85">'
            f'<path d="M{x-14} {y1}H{x+14}M{x-14} {y2}H{x+14}M{x} {y1}V{y2}"/>'
            f'<path d="M{x-5} {y1+16}L{x} {y1}L{x+5} {y1+16}M{x-5} {y2-16}L{x} {y2}L{x+5} {y2-16}"/></g>')


def axis(x1, y1, x2, y2):
    return f'<path d="M{x1} {y1}L{x2} {y2}" stroke="#F2B8A8" stroke-width="1.6" stroke-dasharray="26 8 4 8" opacity=".9"/>'


def pencil(d, w=2.2, op=.9, col='#F2B8A8'):
    return f'<path d="{d}" fill="none" stroke="{col}" stroke-width="{w}" stroke-linecap="round" opacity="{op}"/>'


def ln(d, w=3):
    return f'<path d="{d}" fill="none" stroke="{BP}" stroke-width="{w}" stroke-linejoin="round" stroke-linecap="round"/>'


def kazan(x, y, s=1.0):
    """Казанский собор: фасад с кокошниками, глава, шатровая колокольня. y — уровень земли."""
    def p(d):
        return d
    g = [f'<g transform="translate({x} {y}) scale({s})">']
    g.append(ln('M-200 0V-220H120V0'))                       # основной объём
    g.append(ln('M-200 -220Q-170 -270 -140 -220Q-110 -270 -80 -220Q-50 -270 -20 -220Q10 -270 40 -220Q70 -270 100 -220'))
    g.append(ln('M-150 -260V-330H70V-260'))
    g.append(ln('M-150 -330Q-120 -370 -90 -330Q-60 -370 -30 -330Q0 -370 30 -330Q55 -365 70 -330'))
    g.append(ln('M-70 -370V-430H-10V-370'))
    g.append(ln('M-80 -430Q-40 -520 0 -430Z'))
    g.append(ln('M-40 -505V-560M-58 -540H-22', 2.4))
    g.append(ln('M-170 0V-110Q-150 -150 -130 -110V0M-90 0V-130Q-50 -180 -10 -130V0', 2.2))
    g.append(ln('M120 0V-300H200V0'))                         # колокольня
    g.append(ln('M110 -300H210M120 -300L160 -470L200 -300'))
    g.append(ln('M160 -470V-520M146 -505H174', 2.4))
    g.append(ln('M145 -250Q160 -275 175 -250V-200H145Z', 2))
    g.append('</g>')
    return ''.join(g)


def kutafya(x, y, s=1.0):
    g = [f'<g transform="translate({x} {y}) scale({s})">']
    g.append(ln('M-120 0V-240H120V0'))
    g.append(ln('M-140 -240H140V-270H-140Z'))
    g.append(ln(''.join(f'M{-140+i*40} -270V-300H{-120+i*40}V-270' for i in range(8))))
    g.append(ln('M-80 -270V-360H80V-270'))
    g.append(ln(''.join(f'M{-80+i*32} -360V-385H{-64+i*32}V-360' for i in range(6)), 2.4))
    g.append(ln('M-46 0V-120Q0 -190 46 -120V0', 2.6))
    g.append(ln('M-100 -160V-200H-76V-160ZM76 -160V-200H100V-160Z', 2))
    g.append('</g>')
    return ''.join(g)


def chertezh_spots():
    # 1. Кутафья башня и мост — мост обрезан рамкой, арок не видно
    body = bp_bg()
    body += kutafya(420, 720, 1.05)
    body += ln('M560 470H1172M560 520H1172', 3) + ln('M560 470V720', 2.4)
    body += pencil('M600 560Q700 600 800 560Q900 600 1000 560Q1100 600 1172 570', 1.6, .55)
    body += f'<rect x="560" y="530" width="612" height="200" fill="{BP_BG}" opacity=".55"/>'
    body += axis(420, 140, 420, 790) + dim(294, 790, 546) + vdim(170, 360, 720)
    body += pencil('M700 600c40-30 120-30 160 0', 2.4) + pencil('M880 602l18-8-4 18', 2.4)
    body += ln('M60 720H1172', 2) + bp_finish()
    save('rs-kutafya', 'Эскиз: Кутафья башня',
         'Чертёж синькой: белая башня с зубцами и проездной аркой, от неё уходит каменный мост; ось башни штрих-пунктиром, размерные стрелки и карандашные пометки.', body, BP_DEFS)

    # 2. Манеж — длинный объём, колонн нет, только пролёт крыши
    body = bp_bg()
    body += ln('M90 640V420H1110V640')
    body += ln('M70 420L600 300L1130 420Z')
    body += ln('M90 450H1110', 1.6)
    body += f'<rect x="92" y="452" width="1016" height="186" fill="#1A4C82" opacity=".55"/>'
    body += ln('M140 400L600 320L1060 400', 1.4)
    body += ''.join(ln(f'M{x} {300 + abs(600-x)*120/530:.0f}V420', 1.2) for x in range(180, 1100, 70))
    body += dim(90, 720, 1110) + vdim(1160, 300, 640)
    body += pencil('M300 180q60-40 140-10t150 0', 2.2) + pencil('M240 540q180 40 360 0t360 0', 1.8, .6)
    body += ln('M40 640H1160', 2) + bp_finish()
    save('rs-manezh', 'Эскиз: Манеж',
         'Чертёж синькой: длинное низкое здание под широкой двускатной крышей, под крышей показаны стропила без промежуточных опор; размерная линия на всю длину фасада.', body, BP_DEFS)

    # 3. Грот у кремлёвской стены — силуэт, без резных деталей
    body = bp_bg()
    body += ln('M60 360H1140', 2.4) + ln(''.join(f'M{60+i*60} 360V320H{90+i*60}V360' for i in range(19)), 2)
    body += ln('M60 360V720M1140 360V720', 2)
    body += ln('M300 720V520Q300 420 400 400H800Q900 420 900 520V720')
    body += ln('M360 720V560Q360 480 440 470H760Q840 480 840 560V720', 2.2)
    body += ln('M470 720V600Q600 520 730 600V720', 2.6)
    stones = ''.join(f'M{x} {y}q14 -8 28 0' for x, y in [(330, 450), (380, 420), (820, 440), (860, 480), (320, 520), (870, 540)])
    body += pencil(stones, 1.6, .7, BP)
    body += axis(600, 200, 600, 780) + dim(300, 780, 900)
    body += pencil('M940 260q30-30 70 0', 2.4) + pencil('M960 300q20 30 60 10', 2)
    body += ln('M40 720H1160', 2) + bp_finish()
    save('rs-grot', 'Эскиз: грот у кремлёвской стены',
         'Чертёж синькой: у подножия зубчатой стены — грот с аркадой, нарисован одним силуэтом, ось симметрии штрих-пунктиром, под ним размерная линия.', body, BP_DEFS)

    # 4. Казанский собор
    body = bp_bg() + kazan(560, 760, 1.15) + axis(469, 80, 469, 800) + dim(330, 805, 698) + vdim(1010, 112, 760)
    body += pencil('M140 300c40 -30 100 -30 130 10', 2.4) + pencil('M160 340q60 20 110 0', 2)
    body += ln('M60 760H1140', 2) + bp_finish()
    save('rs-kazan', 'Эскиз: Казанский собор',
         'Чертёж синькой: фасад небольшого собора с ярусами кокошников, главой с крестом и шатровой колокольней сбоку; ось и размерные стрелки, карандашные пометки на полях.', body, BP_DEFS)

    # 5. ГУМ — линия рядов уходит в перспективу
    body = bp_bg()
    body += ln('M60 300L1140 380M60 700L1140 620', 2.6)
    body += ''.join(ln(f'M{x} {300 + (x-60)*80/1080:.0f}V{700 - (x-60)*80/1080:.0f}', 1.6) for x in range(60, 1141, 90))
    body += ln('M420 330Q480 220 540 340', 2.6) + ln('M420 330V680M540 340V672', 2.4)
    body += ln('M440 660V470Q480 410 520 470V655', 2.2)
    body += ln('M860 360Q900 290 940 365', 2.2) + ln('M200 310Q230 250 260 315', 2.2)
    body += axis(480, 140, 480, 800) + axis(60, 500, 1140, 500)
    body += pencil('M600 200l90 -30m-14 -10 14 10-14 10', 2.4)
    body += ln('M40 700H1160', 2) + bp_finish()
    save('rs-gum', 'Эскиз: торговые ряды',
         'Чертёж синькой: длинный фасад торговых рядов уходит в перспективу, посередине главный вход под высокой аркой; через вход проведена ось штрих-пунктиром.', body, BP_DEFS)

    # 6. Лобное место — план и фасад круглого помоста
    body = bp_bg()
    body += ln('M300 640Q300 560 600 560Q900 560 900 640V700Q900 760 600 760Q300 760 300 700Z')
    body += ln('M300 640Q300 720 600 720Q900 720 900 640', 2)
    body += ln('M690 560V500H760V560', 2.2) + ln('M690 500Q725 470 760 500', 2)
    body += ln(''.join(f'M{x} 720V{700 + abs(600-x)*0.1:.0f}' for x in range(330, 880, 40)), 1.2)
    body += '<g transform="translate(600 290)">' + ln('M-240 0a240 110 0 1 0 480 0a240 110 0 1 0 -480 0', 2.4) + ln('M-200 0a200 90 0 1 0 400 0a200 90 0 1 0 -400 0', 1.4) + ln('M100 -88l40 -10v28', 2) + '</g>'
    body += axis(600, 120, 600, 800) + axis(300, 290, 900, 290) + dim(300, 800, 900)
    body += pencil('M980 220q40-30 80 0', 2.4)
    body += ln('M40 760H1160', 2) + bp_finish()
    save('rs-lobnoe', 'Эскиз: круглый помост на площади',
         'Чертёж синькой: круглый каменный помост с ограждением показан в плане сверху и сбоку, оси штрих-пунктиром и размерная линия.', body, BP_DEFS)

    # Обложка первого экрана: лист ведомости 1936 г. — тёплая калька, синяя тушь, кирпичная заливка, красные размеры
    INK, RED, PAPER = '#143A6B', '#C23B22', '#F1E6CC'
    defs = (f'<pattern id="pg" width="40" height="40" patternUnits="userSpaceOnUse"><path d="M40 0H0V40" fill="none" stroke="{INK}" stroke-opacity=".10" stroke-width="1"/></pattern>'
            f'<pattern id="pg5" width="200" height="200" patternUnits="userSpaceOnUse"><path d="M200 0H0V200" fill="none" stroke="{INK}" stroke-opacity=".16" stroke-width="1.4"/></pattern>'
            '<pattern id="brick" width="44" height="24" patternUnits="userSpaceOnUse"><rect width="44" height="24" fill="#B8442E"/><path d="M0 0H44M0 12H44M22 0V12M0 12V24M44 12V24" stroke="#8E2F1E" stroke-width="2" fill="none"/></pattern>'
            '<pattern id="wash" width="9" height="9" patternUnits="userSpaceOnUse" patternTransform="rotate(-38)"><path d="M0 0V9" stroke="#C23B22" stroke-opacity=".5" stroke-width="2.2"/></pattern>'
            '<linearGradient id="roof" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#3F8468"/><stop offset="1" stop-color="#245442"/></linearGradient>'
            '<radialGradient id="lamp"><stop offset="0" stop-color="#FFD98A" stop-opacity=".95"/><stop offset=".5" stop-color="#F2B544" stop-opacity=".35"/><stop offset="1" stop-color="#F2B544" stop-opacity="0"/></radialGradient>'
            '<filter id="pp" x="0" y="0" width="100%" height="100%"><feTurbulence type="fractalNoise" baseFrequency=".7" numOctaves="2" seed="11" stitchTiles="stitch"/><feColorMatrix values="0 0 0 0 .45 0 0 0 0 .33 0 0 0 0 .18 0 0 0 .32 -.08"/></filter>'
            '<linearGradient id="fold" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#000" stop-opacity="0"/><stop offset=".5" stop-color="#000" stop-opacity=".09"/><stop offset=".52" stop-color="#fff" stop-opacity=".25"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient>')
    body = (f'<rect width="{W}" height="{H}" fill="{PAPER}"/><rect width="{W}" height="{H}" fill="url(#pg)"/><rect width="{W}" height="{H}" fill="url(#pg5)"/>')
    # заливки: стена и башни — кирпич, шатры — зелёные, собор — красная отмывка штрихом
    body += '<rect x="560" y="470" width="580" height="270" fill="url(#brick)"/>'
    body += ''.join(f'<rect x="{560+i*58}" y="440" width="30" height="32" fill="url(#brick)"/>' for i in range(10))
    body += '<rect x="760" y="330" width="100" height="410" fill="url(#brick)"/><path d="M745 330H875L810 210Z" fill="url(#roof)"/>'
    body += '<rect x="1000" y="380" width="80" height="360" fill="url(#brick)"/><path d="M990 380H1090L1040 300Z" fill="url(#roof)"/>'
    body += '<path d="M780 740V640Q810 596 840 640V740Z" fill="#3A1810"/><rect x="792" y="420" width="36" height="60" fill="#3A1810"/><rect x="1024" y="450" width="32" height="50" fill="#3A1810"/>'
    body += '<rect x="560" y="470" width="580" height="270" fill="#3A1810" opacity=".10"/>'
    body += ('<g transform="translate(330 740) scale(.95)"><path d="M-200 0V-220Q-170 -270 -140 -220Q-110 -270 -80 -220Q-50 -270 -20 -220Q10 -270 40 -220Q70 -270 100 -220H120V0Z" fill="url(#wash)"/>'
             '<path d="M-150 -262V-330Q-120 -370 -90 -330Q-60 -370 -30 -330Q0 -370 30 -330Q55 -365 70 -330V-262Z" fill="url(#wash)"/>'
             '<path d="M-80 -430Q-40 -520 0 -430Z" fill="#E0A63C"/><rect x="-70" y="-430" width="60" height="60" fill="#FBF4E2"/>'
             '<rect x="120" y="-300" width="80" height="300" fill="#FBF4E2"/><path d="M120 -300L160 -470L200 -300Z" fill="url(#roof)"/>'
             '<path d="M-170 0V-110Q-150 -150 -130 -110V0ZM-90 0V-130Q-50 -180 -10 -130V0Z" fill="#3A1810" opacity=".8"/></g>')
    # ночная подсветка: фонари у стены
    body += ''.join(f'<circle cx="{x}" cy="700" r="70" fill="url(#lamp)"/><circle cx="{x}" cy="700" r="7" fill="#FFE9B0"/>' for x in (620, 930, 1120))
    ink = kazan(330, 740, .95)
    ink += ln('M560 740V470H1140', 3) + ln(''.join(f'M{560+i*58} 470V440H{590+i*58}V470' for i in range(10)), 2.4)
    ink += ln('M760 740V330H860V740', 3) + ln('M745 330H875L810 210Z', 3) + ln('M810 210V150M790 175H830', 2.4)
    ink += ln('M1000 740V380H1080V740', 2.6) + ln('M990 380H1090L1040 300Z', 2.6)
    ink += ln('M40 740H1160', 3)
    ink += ln(f'M{W-330} {H-40}V{H-118}H{W-40}M{W-330} {H-79}H{W-40}M{W-200} {H-118}V{H-40}', 2)
    body += ink.replace(BP, INK)
    red = axis(240, 110, 240, 800) + dim(130, 790, 520) + vdim(60, 180, 740) + dim(560, 400, 1140) + vdim(1170, 210, 740)
    red += pencil('M600 160q50 -40 110 0', 3) + pencil('M610 200q40 20 90 0', 2.4) + pencil('M900 560l60 30', 2.8)
    red += pencil('M886 250a60 60 0 1 0 .1 0', 2.6, .8) + pencil('M1010 236l-64 20m16 -16l-16 16 20 8', 2.6)
    body += red.replace(BP, RED).replace('#F2B8A8', RED).replace('stroke-width="1.6"', 'stroke-width="2.4"')
    body += f'<g transform="translate(250 190) rotate(-12)" fill="none" stroke="{RED}" opacity=".7"><circle r="62" stroke-width="5"/><circle r="48" stroke-width="2"/><path d="M-34 0H34M-26 -16H26M-26 16H26" stroke-width="4"/></g>'
    body += (f'<rect x="398" width="6" height="{H}" fill="url(#fold)"/><rect x="798" width="6" height="{H}" fill="url(#fold)"/>'
             f'<rect width="{W}" height="{H}" filter="url(#pp)" opacity=".55"/>'
             f'<rect x="20" y="20" width="{W-40}" height="{H-40}" fill="none" stroke="{INK}" stroke-width="3"/><rect x="32" y="32" width="{W-64}" height="{H-64}" fill="none" stroke="{INK}" stroke-width="1.2"/>')
    save('hero-krasnaya', 'Красная площадь: лист обмерной ведомости',
         'Лист кальки с обмерным чертежом: слева собор с кокошниками и шатровой колокольней, справа кирпичная кремлёвская стена с зубцами и башни под зелёными шатрами; красные размерные стрелки, ось и пометки карандашом, у стены горят фонари.', body, defs)


# ---------------------------------------------------------------- типографский оттиск (№5)
PR_PAPER = '#F1E6CF'
PR_INK = '#1C1712'
PR_RED = '#B8321D'
PR_DEFS = f'''<filter id="ink" x="-5%" y="-5%" width="110%" height="110%"><feTurbulence type="fractalNoise" baseFrequency=".9" numOctaves="2" seed="9" result="n"/><feDisplacementMap in="SourceGraphic" in2="n" scale="3.2"/></filter>
<filter id="paper" x="0" y="0" width="100%" height="100%"><feTurbulence type="fractalNoise" baseFrequency=".04 .9" numOctaves="2" seed="2" stitchTiles="stitch"/><feColorMatrix values="0 0 0 0 .45 0 0 0 0 .32 0 0 0 0 .16 0 0 0 .22 0"/></filter>
<pattern id="hatch" width="10" height="10" patternUnits="userSpaceOnUse" patternTransform="rotate(-35)"><path d="M0 0V10" stroke="{PR_INK}" stroke-width="2.4"/></pattern>
<pattern id="hatchF" width="7" height="7" patternUnits="userSpaceOnUse" patternTransform="rotate(40)"><path d="M0 0V7" stroke="{PR_INK}" stroke-width="1.4"/></pattern>
<pattern id="hatchR" width="9" height="9" patternUnits="userSpaceOnUse" patternTransform="rotate(-20)"><path d="M0 0V9" stroke="{PR_RED}" stroke-width="2.2"/></pattern>'''


def pr_wrap(inner, frame=True):
    s = f'<rect width="{W}" height="{H}" fill="{PR_PAPER}"/><rect width="{W}" height="{H}" filter="url(#paper)"/>'
    if frame:
        s += (f'<rect x="34" y="34" width="{W-68}" height="{H-68}" fill="none" stroke="{PR_INK}" stroke-width="6"/>'
              f'<rect x="48" y="48" width="{W-96}" height="{H-96}" fill="none" stroke="{PR_INK}" stroke-width="1.6"/>')
    s += f'<g filter="url(#ink)">{inner}</g>'
    return s


def pr_ground(y=760):
    return (f'<path d="M48 {y}H1152V852H48Z" fill="url(#hatchF)" opacity=".8"/>'
            f'<path d="M48 {y}H1152" stroke="{PR_INK}" stroke-width="4"/>')


def pr_sky():
    return ''.join(f'<path d="M60 {y}H1140" stroke="{PR_INK}" stroke-width="{1.4 if y > 200 else 1}" opacity=".55"/>' for y in range(80, 300, 14))


def unicorn(x, y, s=1.0, fill=PR_RED):
    """Геральдический единорог на дыбах (силуэт)."""
    return (f'<g transform="translate({x} {y}) scale({s})" fill="{fill}" stroke="{PR_INK}" stroke-width="5" stroke-linejoin="round">'
            '<path d="M-40 160L-70 260H-46L-12 176L20 180L36 262H60L48 170Q86 140 80 80Q120 70 140 100L156 86Q130 40 92 46Q60 0 30 -10L44 -40L20 -30Q4 -70 -30 -60L-110 -180L-50 -60Q-80 -40 -76 0L-120 30L-110 54L-60 34Q-44 70 -54 100Q-70 130 -40 160Z"/>'
            '<path d="M-6 -40Q4 -52 18 -44" fill="none" stroke-width="4"/>'
            '<circle cx="-14" cy="-36" r="5" fill="#1C1712" stroke="none"/>'
            '<path d="M30 -10Q44 20 24 50M50 6Q66 30 52 60M70 20Q86 44 72 70" fill="none" stroke-width="4"/>'
            '<path d="M140 100Q170 140 150 190Q178 160 172 120" fill="none" stroke-width="5"/>'
            '</g>')


def lion(x, y, s=1.0):
    """Геральдический лев на дыбах: зеркальный силуэт единорога без рога, с гривой и кисточкой хвоста."""
    mane = ''.join(f'<path d="M{-30+34*math.cos(a):.0f} {-40+34*math.sin(a):.0f}L{-30+62*math.cos(a+.2):.0f} {-40+62*math.sin(a+.2):.0f}L{-30+34*math.cos(a+.4):.0f} {-40+34*math.sin(a+.4):.0f}Z"/>' for a in [i*0.42 for i in range(15)])
    return (f'<g transform="translate({x} {y}) scale({-s} {s})" fill="{PR_INK}" stroke="{PR_INK}" stroke-width="5" stroke-linejoin="round">'
            + mane +
            '<path d="M-40 160L-70 260H-46L-12 176L20 180L36 262H60L48 170Q86 140 80 80Q120 70 140 100L156 86Q130 40 92 46Q60 0 30 -10L20 -20Q4 -70 -30 -60Q-80 -40 -76 0L-120 30L-110 54L-60 34Q-44 70 -54 100Q-70 130 -40 160Z"/>'
            '<path d="M140 100Q170 150 150 200" fill="none" stroke-width="6"/><circle cx="150" cy="206" r="14"/>'
            '<circle cx="-14" cy="-36" r="5" fill="#F1E6CF" stroke="none"/>'
            '</g>')


def nabor_spots():
    # 1. Стена Китай-города
    inner = pr_sky() + pr_ground(740)
    inner += f'<path d="M48 740V420H760V740Z" fill="url(#hatch)" stroke="{PR_INK}" stroke-width="5"/>'
    inner += ''.join(f'<path d="M{60+i*70} 420V370L{80+i*70} 350L{100+i*70} 370V420Z" fill="{PR_PAPER}" stroke="{PR_INK}" stroke-width="5"/>' for i in range(10))
    inner += f'<path d="M760 740V330H980V740Z" fill="{PR_PAPER}" stroke="{PR_INK}" stroke-width="6"/>'
    inner += f'<path d="M760 330Q870 250 980 330" fill="url(#hatchR)" stroke="{PR_INK}" stroke-width="6"/>'
    inner += f'<path d="M760 560H980M760 450H980" stroke="{PR_INK}" stroke-width="3"/>'
    inner += f'<path d="M840 740V640Q870 600 900 640V740Z" fill="{PR_INK}"/>'
    inner += ''.join(f'<rect x="{x}" y="{y}" width="20" height="34" fill="{PR_INK}"/>' for x, y in [(800, 380), (920, 380), (800, 480), (920, 480)])
    inner += f'<path d="M980 740V600H1152" fill="none" stroke="{PR_INK}" stroke-width="4"/>'
    inner += ''.join(f'<rect x="{1000+i*50}" y="620" width="18" height="28" fill="{PR_INK}"/>' for i in range(3))
    save('kg-stena', 'Оттиск: стена Китай-города',
         'Гравюра в две краски: длинная зубчатая стена с круглой башней под красной кровлей, перед ней мостовая.', pr_wrap(inner), PR_DEFS)

    # 2. Лев и единорог
    inner = pr_sky()
    inner += f'<path d="M420 200H780V460Q780 640 600 700Q420 640 420 460Z" fill="{PR_PAPER}" stroke="{PR_INK}" stroke-width="8"/>'
    inner += f'<path d="M450 230H750V460Q750 610 600 664Q450 610 450 460Z" fill="url(#hatchF)" stroke="{PR_INK}" stroke-width="2"/>'
    inner += f'<path d="M600 240V650M460 420H740" stroke="{PR_RED}" stroke-width="10"/>'
    inner += lion(290, 450, .95) + unicorn(910, 450, .95)
    inner += pr_ground(760)
    save('kg-lev', 'Оттиск: лев и единорог',
         'Гравюра в две краски: геральдический щит, слева от него встаёт на дыбы чёрный лев, справа — красный единорог.', pr_wrap(inner), PR_DEFS)

    # 3. Монастырь с колокольней
    inner = pr_sky() + pr_ground(760)
    inner += f'<path d="M100 760V470H520V760Z" fill="{PR_PAPER}" stroke="{PR_INK}" stroke-width="5"/>'
    inner += ''.join(f'<path d="M{140+i*80} 700V560Q{160+i*80} 530 {180+i*80} 560V700Z" fill="{PR_INK}"/>' for i in range(5))
    inner += f'<path d="M100 470L310 400L520 470Z" fill="url(#hatch)" stroke="{PR_INK}" stroke-width="5"/>'
    inner += f'<path d="M620 760V360H800V760Z" fill="{PR_PAPER}" stroke="{PR_INK}" stroke-width="6"/>'
    inner += f'<path d="M640 360V250H780V360Z" fill="{PR_PAPER}" stroke="{PR_INK}" stroke-width="6"/>'
    inner += f'<path d="M670 340V280Q710 250 750 280V340Z" fill="{PR_INK}"/>'
    inner += f'<path d="M660 250Q710 160 760 250Z" fill="url(#hatchR)" stroke="{PR_INK}" stroke-width="6"/>'
    inner += f'<path d="M710 165V100M690 125H730" stroke="{PR_INK}" stroke-width="6"/>'
    inner += f'<path d="M660 700V560Q710 500 760 560V700Z" fill="{PR_INK}"/>'
    inner += f'<path d="M800 760V520H1100V760Z" fill="url(#hatch)" stroke="{PR_INK}" stroke-width="5"/>'
    save('kg-monastyr', 'Оттиск: монастырь на Никольской',
         'Гравюра в две краски: за оградой длинный каменный корпус с арочными окнами и высокая колокольня с красной главкой.', pr_wrap(inner), PR_DEFS)

    # 4. Биржа: портик без надписей
    inner = pr_sky() + pr_ground(770)
    inner += f'<path d="M150 770V420H1050V770Z" fill="{PR_PAPER}" stroke="{PR_INK}" stroke-width="5"/>'
    inner += f'<path d="M120 420L600 250L1080 420Z" fill="{PR_PAPER}" stroke="{PR_INK}" stroke-width="7"/>'
    inner += f'<path d="M230 400L600 280L970 400Z" fill="url(#hatchR)"/>'
    inner += f'<path d="M150 450H1050" stroke="{PR_INK}" stroke-width="5"/>'
    inner += ''.join(f'<path d="M{x} 470V740" stroke="{PR_INK}" stroke-width="34"/><path d="M{x-24} 470H{x+24}M{x-24} 740H{x+24}" stroke="{PR_INK}" stroke-width="8"/>' for x in (260, 420, 780, 940))
    inner += f'<path d="M540 770V560Q600 500 660 560V770Z" fill="{PR_INK}"/>'
    inner += ''.join(f'<path d="M{150+i*30} 770l-10 40" stroke="{PR_INK}" stroke-width="2"/>' for i in range(31))
    save('kg-birzha', 'Оттиск: здание биржи на Ильинке',
         'Гравюра в две краски: торжественное здание с колоннами и треугольным фронтоном, тень во фронтоне красная.', pr_wrap(inner), PR_DEFS)

    # 5. Узорная церковь
    inner = pr_sky() + pr_ground(770)
    inner += f'<path d="M250 770V430H850V770Z" fill="{PR_PAPER}" stroke="{PR_INK}" stroke-width="6"/>'
    inner += ''.join(f'<path d="M{270+i*72} 430Q{306+i*72} 370 {342+i*72} 430" fill="url(#hatchR)" stroke="{PR_INK}" stroke-width="5"/>' for i in range(8))
    inner += f'<path d="M250 520H850M250 640H850" stroke="{PR_RED}" stroke-width="6" stroke-dasharray="14 10"/>'
    inner += ''.join(f'<path d="M{x} 760V560Q{x+25} 525 {x+50} 560V760Z" fill="{PR_INK}"/>' for x in (330, 520, 710))
    for cx, top, r in [(550, 230, 46), (400, 300, 32), (700, 300, 32)]:
        inner += f'<path d="M{cx-r*0.7} 430V{top+r}H{cx+r*0.7}V430" fill="{PR_PAPER}" stroke="{PR_INK}" stroke-width="5"/>'
        inner += f'<path d="M{cx-r} {top+r}Q{cx-r} {top-r*0.4} {cx} {top-r}Q{cx+r} {top-r*0.4} {cx+r} {top+r}Z" fill="url(#hatch)" stroke="{PR_INK}" stroke-width="5"/>'
        inner += f'<path d="M{cx} {top-r}V{top-r-50}M{cx-16} {top-r-32}H{cx+16}" stroke="{PR_INK}" stroke-width="5"/>'
    inner += f'<path d="M880 770V360H990V770Z" fill="{PR_PAPER}" stroke="{PR_INK}" stroke-width="5"/><path d="M870 360L935 200L1000 360Z" fill="url(#hatch)" stroke="{PR_INK}" stroke-width="5"/>'
    save('kg-troica', 'Оттиск: узорная церковь в переулке',
         'Гравюра в две краски: нарядная церковь с рядами красных кокошников, тремя главами и шатровой колокольней.', pr_wrap(inner), PR_DEFS)

    # 6. Парящий мост
    inner = pr_sky()
    inner += f'<path d="M48 640H1152V852H48Z" fill="url(#hatchF)" opacity=".6"/>'
    inner += ''.join(f'<path d="M{60+i*37} {660+(i%5)*30}h40" stroke="{PR_PAPER}" stroke-width="5"/>' for i in range(30))
    inner += f'<path d="M90 520L700 360L1152 300" fill="none" stroke="{PR_INK}" stroke-width="18"/>'
    inner += f'<path d="M90 560L700 400L1152 340" fill="none" stroke="{PR_INK}" stroke-width="6"/>'
    inner += ''.join(f'<path d="M{x} {520-(x-90)*0.262:.0f}L{x} {560-(x-90)*0.262:.0f}" stroke="{PR_INK}" stroke-width="3"/>' for x in range(110, 700, 36))
    inner += f'<path d="M90 520L90 640L240 640Z" fill="url(#hatch)" stroke="{PR_INK}" stroke-width="5"/>'
    inner += f'<path d="M780 640V520L800 500L820 520V640M900 640V480L925 440L950 480V640M1040 640V530L1060 505L1080 530V640" fill="{PR_PAPER}" stroke="{PR_INK}" stroke-width="5"/>'
    inner += f'<path d="M760 640H1150" stroke="{PR_RED}" stroke-width="10"/>'
    inner += f'<circle cx="300" cy="200" r="60" fill="url(#hatchR)" stroke="{PR_RED}" stroke-width="5"/>'
    save('kg-most', 'Оттиск: мост над рекой',
         'Гравюра в две краски: над рекой вылетает вперёд консольный мост без опор посередине, вдали башни, над ними красное солнце.', pr_wrap(inner), PR_DEFS)

    # Обложка: лист «Сбежал единорог!» без текста — гравюра единорога, бегущего мимо стены
    inner = pr_sky()
    inner += f'<path d="M48 600V440H1152V600Z" fill="url(#hatch)" stroke="{PR_INK}" stroke-width="5"/>'
    inner += ''.join(f'<path d="M{56+i*72} 440V400L{76+i*72} 384L{96+i*72} 400V440Z" fill="{PR_PAPER}" stroke="{PR_INK}" stroke-width="5"/>' for i in range(16))
    inner += pr_ground(760)
    inner += f'<path d="M48 600H1152V760H48Z" fill="{PR_PAPER}"/>'
    inner += f'<path d="M48 760H1152" stroke="{PR_INK}" stroke-width="4"/>'
    inner += unicorn(640, 470, 1.35)
    inner += ''.join(f'<path d="M{200+i*40} {700+(i%3)*14}q20 -20 40 0" fill="none" stroke="{PR_INK}" stroke-width="3"/>' for i in range(6))
    inner += f'<circle cx="980" cy="200" r="70" fill="url(#hatchR)" stroke="{PR_RED}" stroke-width="5"/>'
    save('hero-kitay', 'Гравюра: сбежавший единорог',
         'Гравюра в две краски: красный единорог встаёт на дыбы перед зубчатой стеной Китай-города, над стеной — красное солнце.', pr_wrap(inner), PR_DEFS)


# ---------------------------------------------------------------- театральная сцена (№6)
TH_DEFS = '''<linearGradient id="velvet" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#3A0812"/><stop offset=".25" stop-color="#7A1728"/><stop offset=".5" stop-color="#4A0C18"/><stop offset=".75" stop-color="#8A1D30"/><stop offset="1" stop-color="#3A0812"/></linearGradient>
<pattern id="fold" width="80" height="900" patternUnits="userSpaceOnUse"><rect width="80" height="900" fill="url(#velvet)"/></pattern>
<linearGradient id="gold" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#FBE3A0"/><stop offset=".45" stop-color="#D4A84B"/><stop offset="1" stop-color="#7C5A1E"/></linearGradient>
<radialGradient id="spot" cx="600" cy="560" r="420" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#FFE7B0" stop-opacity=".55"/><stop offset=".6" stop-color="#FFC56E" stop-opacity=".12"/><stop offset="1" stop-color="#FFC56E" stop-opacity="0"/></radialGradient>
<linearGradient id="back" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#0F0A14"/><stop offset="1" stop-color="#22101A"/></linearGradient>
<pattern id="harl" width="80" height="60" patternUnits="userSpaceOnUse"><path d="M40 0L80 30L40 60L0 30Z" fill="#7A2230"/><path d="M0 0L40 0L0 30Z M80 0L40 0L80 30Z M0 60L40 60L0 30Z M80 60L40 60L80 30Z" fill="#2E4A2E"/><path d="M40 0L80 30L40 60L0 30Z" fill="none" stroke="#C9A24A" stroke-width="1.5" opacity=".7"/></pattern>
<filter id="grain" x="0" y="0" width="100%" height="100%"><feTurbulence type="fractalNoise" baseFrequency=".85" numOctaves="2" seed="5" stitchTiles="stitch"/><feColorMatrix values="0 0 0 0 1 0 0 0 0 .9 0 0 0 0 .8 0 0 0 .4 -.16"/></filter>'''


def th_stage(inner, floor=760):
    s = '<rect width="1200" height="900" fill="url(#back)"/>'
    s += '<rect width="1200" height="900" fill="url(#spot)"/>'
    s += inner
    s += f'<path d="M0 {floor}H1200V900H0Z" fill="url(#harl)" opacity=".85"/>'
    s += f'<path d="M0 {floor}H1200" stroke="#D4A84B" stroke-width="6"/>'
    # кулисы
    s += '<path d="M0 0H170Q130 300 190 600Q150 760 210 900H0Z" fill="url(#fold)"/>'
    s += '<path d="M1200 0H1030Q1070 300 1010 600Q1050 760 990 900H1200Z" fill="url(#fold)"/>'
    # падуга с фестонами
    fest = ''.join(f'Q{60+i*120} 150 {120+i*120} 110' for i in range(10))
    s += f'<path d="M0 0H1200V110{"".join(f"Q{1140-i*120} 150 {1080-i*120} 110" for i in range(10))}V0Z" fill="url(#fold)"/>'
    s += '<path d="M0 110' + ''.join(f'Q{60+i*120} 150 {120+i*120} 110' for i in range(10)) + '" fill="none" stroke="#D4A84B" stroke-width="5"/>'
    s += ''.join(f'<path d="M{120+i*120} 112v26" stroke="#D4A84B" stroke-width="4"/><circle cx="{120+i*120}" cy="146" r="7" fill="#D4A84B"/>' for i in range(9))
    s += '<rect width="1200" height="900" filter="url(#grain)" opacity=".45"/>'
    return s


def gogol_standing(x, y, s=1.0):
    return (f'<g transform="translate({x} {y}) scale({s})">'
            '<path d="M-120 0V-60H120V0Z" fill="#2A1A20" stroke="#D4A84B" stroke-width="4"/>'
            '<path d="M-90 -60V-260H90V-60Z" fill="#3A2028" stroke="#D4A84B" stroke-width="4"/>'
            '<path d="M-56 -260L-70 -480Q-60 -560 0 -570Q60 -560 70 -480L60 -260Z" fill="url(#gold)"/>'
            '<path d="M-70 -480L-110 -300L-50 -270Z" fill="url(#gold)" opacity=".9"/>'
            '<circle cx="0" cy="-610" r="40" fill="url(#gold)"/>'
            '<path d="M-40 -620Q-30 -660 10 -655Q44 -650 40 -610" fill="#7C5A1E"/>'
            '<path d="M20 -470L80 -400" stroke="#7C5A1E" stroke-width="12" stroke-linecap="round"/>'
            '</g>')


def th_figure_seated(x, y, s=1.0):
    return (f'<g transform="translate({x} {y}) scale({s})">'
            '<path d="M-150 0V-150H150V0Z" fill="#2A1A20" stroke="#D4A84B" stroke-width="4"/>'
            '<path d="M-70 -150Q-110 -260 -60 -340Q-20 -400 30 -380Q80 -350 60 -260L110 -230L100 -150Z" fill="url(#gold)"/>'
            '<path d="M-60 -340Q-120 -300 -130 -200L-90 -150" fill="url(#gold)" opacity=".85"/>'
            '<circle cx="10" cy="-410" r="36" fill="url(#gold)" transform="rotate(18 10 -410)"/>'
            '<path d="M-20 -440Q20 -460 46 -420" fill="none" stroke="#7C5A1E" stroke-width="10"/>'
            '</g>')


def mask(x, y, s=1.0, col='url(#gold)', smile=True):
    m = 'M-30 -4Q0 12 30 -4' if smile else 'M-30 6Q0 -10 30 6'
    return (f'<g transform="translate({x} {y}) scale({s})">'
            f'<path d="M-70 -30Q-70 -70 0 -66Q70 -70 70 -30Q76 20 40 40Q0 30 -40 40Q-76 20 -70 -30Z" fill="{col}" stroke="#3A0812" stroke-width="4"/>'
            '<path d="M-46 -26Q-30 -40 -14 -26Q-30 -14 -46 -26ZM14 -26Q30 -40 46 -26Q30 -14 14 -26Z" fill="#0F0A14"/>'
            f'<path d="{m}" fill="none" stroke="#3A0812" stroke-width="5" transform="translate(0 20)"/>'
            '</g>')


def princess(x, y, s=1.0):
    """Золотая принцесса анфас: корона, лицо-маска, широкие рукава сомкнуты — в руках ничего (ответ т. 3 не показываем)."""
    beads = ''.join(f'<circle cx="{bx}" cy="{by}" r="5" fill="#FBE3A0"/>' for bx, by in [(-42, -372), (-22, -396), (0, -418), (22, -396), (42, -372)])
    diam = ''.join(f'<path d="M0 {-200+i*44}l13 20-13 20-13-20Z" fill="url(#gold)"/>' for i in range(4))
    return (f'<g transform="translate({x} {y}) scale({s})">'
            '<ellipse cx="0" cy="2" rx="118" ry="14" fill="#000" opacity=".35"/>'
            '<path d="M-104 0Q-112 -150 -50 -252H50Q112 -150 104 0Z" fill="url(#gold)" stroke="#7C5A1E" stroke-width="3"/>'
            '<path d="M-26 0V-236H26V0Z" fill="#7A1728"/>' + diam +
            '<path d="M-104 0Q-108 -22 -100 -30H100Q108 -22 104 0Z" fill="#7C5A1E"/>'
            '<path d="M-48 -250Q-138 -214 -128 -104Q-60 -96 0 -134Q60 -96 128 -104Q138 -214 48 -250Q0 -226 -48 -250Z" fill="#E9C46A" stroke="#7C5A1E" stroke-width="3"/>'
            '<path d="M-128 -104Q-60 -96 0 -134Q60 -96 128 -104" fill="none" stroke="#7A1728" stroke-width="9"/>'
            '<path d="M-64 -150Q-30 -120 0 -134Q30 -120 64 -150" fill="none" stroke="#7C5A1E" stroke-width="3" opacity=".7"/>'
            '<path d="M-30 -252L0 -216L30 -252Z" fill="#7A1728" stroke="#FBE3A0" stroke-width="3"/>'
            '<path d="M-44 -300Q-52 -352 0 -356Q52 -352 44 -300Q40 -268 0 -262Q-40 -268 -44 -300Z" fill="#1A0E12"/>'
            '<circle cx="-50" cy="-316" r="15" fill="#1A0E12"/><circle cx="50" cy="-316" r="15" fill="#1A0E12"/>'
            '<path d="M-27 -306Q-29 -338 0 -340Q29 -338 27 -306Q24 -272 0 -266Q-24 -272 -27 -306Z" fill="#F7E7C8"/>'
            '<path d="M-19 -312q8 -7 16 0M3 -312q8 -7 16 0" fill="none" stroke="#1A0E12" stroke-width="3.2" stroke-linecap="round"/>'
            '<path d="M-21 -322q9 -6 17 -2M4 -324q9 -4 17 2" fill="none" stroke="#1A0E12" stroke-width="2" stroke-linecap="round"/>'
            '<path d="M-6 -286q6 5 12 0q-6 -5 -12 0Z" fill="#B3202F"/><circle cx="-17" cy="-298" r="5" fill="#E58A7A" opacity=".55"/><circle cx="17" cy="-298" r="5" fill="#E58A7A" opacity=".55"/>'
            '<path d="M-48 -340L-42 -372L-30 -350L-22 -396L-10 -356L0 -418L10 -356L22 -396L30 -350L42 -372L48 -340Q0 -356 -48 -340Z" fill="url(#gold)" stroke="#7C5A1E" stroke-width="2.5"/>'
            + beads +
            '<path d="M-62 -322v40M62 -322v40" stroke="#D4A84B" stroke-width="3"/><circle cx="-62" cy="-276" r="6" fill="#B3202F"/><circle cx="62" cy="-276" r="6" fill="#B3202F"/>'
            '</g>')


def fan_backdrop(cx, cy, r):
    """Раскрытый веер-задник за фигурой (декорация сцены, не предмет в руке)."""
    out = []
    n = 14
    for i in range(n):
        a1 = math.pi + math.pi * i / n
        a2 = math.pi + math.pi * (i + 1) / n
        x1, y1 = cx + r * math.cos(a1), cy + r * math.sin(a1)
        x2, y2 = cx + r * math.cos(a2), cy + r * math.sin(a2)
        col = '#8A1D30' if i % 2 else '#5E1020'
        out.append(f'<path d="M{cx} {cy}L{x1:.0f} {y1:.0f}A{r} {r} 0 0 1 {x2:.0f} {y2:.0f}Z" fill="{col}" stroke="#D4A84B" stroke-width="2.5"/>')
        xm, ym = cx + (r - 34) * math.cos((a1 + a2) / 2), cy + (r - 34) * math.sin((a1 + a2) / 2)
        out.append(f'<circle cx="{xm:.0f}" cy="{ym:.0f}" r="9" fill="#D4A84B" opacity=".9"/>')
    out.append(f'<path d="M{cx-r} {cy}A{r} {r} 0 0 1 {cx+r} {cy}" fill="none" stroke="url(#gold)" stroke-width="10"/>')
    out.append(f'<path d="M{cx-r*.55:.0f} {cy}A{r*.55:.0f} {r*.55:.0f} 0 0 1 {cx+r*.55:.0f} {cy}" fill="none" stroke="#D4A84B" stroke-width="3" opacity=".8"/>')
    return '<g opacity=".95">' + ''.join(out) + '</g>'


def teatr_spots():
    save('ar-gogol-stoit', 'Сцена: стоящий Гоголь',
         'Театральная сцена с бархатными кулисами: в луче прожектора на высоком постаменте стоит золотая фигура писателя в длинном сюртуке.',
         th_stage(gogol_standing(600, 760, .95)), TH_DEFS)
    save('ar-gogol-sidit', 'Сцена: сидящий Гоголь',
         'Театральная сцена с бархатными кулисами: в полутьме на низком постаменте сидит, ссутулившись и закутавшись в шинель, золотая фигура писателя.',
         th_stage(th_figure_seated(600, 760, 1.1)), TH_DEFS)
    fountain = ('<ellipse cx="600" cy="740" rx="300" ry="40" fill="#2A1A20" stroke="#D4A84B" stroke-width="4"/>'
                '<path d="M330 740V700Q600 650 870 700V740" fill="#3A2028" stroke="#D4A84B" stroke-width="4"/>'
                '<g stroke="#9FC4E0" stroke-width="3" fill="none" opacity=".7"><path d="M380 690q-20 -90 -60 -120M820 690q20 -90 60 -120M450 680q-10 -60 -40 -90M750 680q10 -60 40 -90"/></g>'
                + princess(600, 680, 1.05)
                + '<g opacity=".9"><path d="M200 420q30 -40 60 0" stroke="#D4A84B" stroke-width="3" fill="none"/></g>')
    save('ar-turandot', 'Сцена: золотая принцесса у фонтана',
         'Театральная сцена с бархатными кулисами: над чашей фонтана стоит золотая принцесса в короне, вокруг бьют струи воды.',
         th_stage(fountain), TH_DEFS)
    church = ('<rect x="300" y="200" width="600" height="540" fill="#16243A"/>'
              '<path d="M520 740V470H700V740Z" fill="#EFE6D2"/><path d="M500 470H720L610 420Z" fill="#CFC3A8"/>'
              '<path d="M570 420V360H650V420Z" fill="#EFE6D2"/><path d="M560 360Q610 280 660 360Z" fill="#2E4A2E"/><path d="M610 290V250M598 266H622" stroke="#D4A84B" stroke-width="4"/>'
              '<path d="M380 740V420H460V740Z" fill="#EFE6D2"/><path d="M372 420L420 300L468 420Z" fill="#2E4A2E"/>'
              '<path d="M300 650Q500 600 900 660V740H300Z" fill="#2E4A2E" opacity=".8"/>'
              '<path d="M300 200H900V740H300Z" fill="none" stroke="#D4A84B" stroke-width="22"/>'
              '<path d="M600 200V740M300 470H900" stroke="#D4A84B" stroke-width="12"/>'
              '<path d="M286 740H914V770H286Z" fill="#7C5A1E"/>')
    save('ar-cerkov', 'Сцена: церковь за окном',
         'Театральная сцена: посреди неё стоит большое окно в золотой раме, за стеклом — белая церковь с зелёной главкой и шатровой колокольней в переулке.',
         th_stage(church), TH_DEFS)
    house = ('<path d="M380 740V360A140 50 0 0 1 660 360V740Z" fill="#E7DCC6"/>'
             '<ellipse cx="520" cy="360" rx="140" ry="50" fill="#F4EBDA"/>'
             '<path d="M560 740V330A160 56 0 0 1 880 330V740Z" fill="#D9CCB2"/>'
             '<ellipse cx="720" cy="330" rx="160" ry="56" fill="#EDE2CC"/>'
             '<path d="M620 740V420Q720 380 820 420V740" fill="none" stroke="#B9AA8A" stroke-width="3"/>'
             '<path d="M380 740H880" stroke="#7C5A1E" stroke-width="6"/>'
             '<path d="M320 600Q350 520 300 470M940 600Q910 520 960 470" stroke="#2E4A2E" stroke-width="40" stroke-linecap="round" fill="none"/>')
    save('ar-dom', 'Сцена: дом из двух цилиндров',
         'Театральная сцена с бархатными кулисами: в луче света стоит светлый дом из двух врезанных друг в друга цилиндров, по сторонам деревья.',
         th_stage(house), TH_DEFS)
    pair = ('<ellipse cx="600" cy="750" rx="260" ry="26" fill="#2A1A20" stroke="#D4A84B" stroke-width="4"/>'
            '<path d="M470 740Q450 560 500 460L540 470Q560 600 540 740Z" fill="url(#gold)"/>'
            '<circle cx="505" cy="420" r="34" fill="url(#gold)"/><path d="M480 400Q505 370 530 400" fill="#7C5A1E"/>'
            '<path d="M640 740Q600 640 640 470Q700 460 720 520Q760 640 760 740Z" fill="url(#gold)"/>'
            '<circle cx="680" cy="420" r="30" fill="url(#gold)"/><path d="M652 404Q680 370 708 404Q700 390 680 388Z" fill="#7C5A1E"/>'
            '<path d="M540 520Q590 560 646 530" stroke="#D4A84B" stroke-width="18" stroke-linecap="round" fill="none"/>')
    save('ar-para', 'Сцена: бронзовая пара',
         'Театральная сцена с бархатными кулисами: на низком постаменте стоят, взявшись за руки, золотые фигуры мужчины и женщины в платье с высокой талией.',
         th_stage(pair), TH_DEFS)
    # Обложка: занавес приоткрыт, принцесса и маски
    inner = fan_backdrop(600, 752, 400) + princess(600, 752, 1.32) + mask(262, 300, 1.0) + mask(938, 300, 1.0, col='#C9A24A', smile=False)
    save('hero-arbat', 'Сцена: принцесса и маски',
         'Театральная сцена с бархатными кулисами и фестонами: на фоне раскрытого веера-задника стоит золотая принцесса в короне, руки спрятаны в широких рукавах; по сторонам парят две маски итальянской комедии.',
         th_stage(inner), TH_DEFS)


# ---------------------------------------------------------------- видовая открытка (№7)
PC_DEFS = '''<linearGradient id="sky7" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#2E6FB8"/><stop offset=".55" stop-color="#5FB3C2"/><stop offset="1" stop-color="#F3E3B6"/></linearGradient>
<linearGradient id="gold7" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#FFE7A0"/><stop offset=".5" stop-color="#D6A23A"/><stop offset="1" stop-color="#8A6220"/></linearGradient>
<filter id="halftone" x="0" y="0" width="100%" height="100%"><feTurbulence type="fractalNoise" baseFrequency=".75" numOctaves="1" seed="6" stitchTiles="stitch"/><feColorMatrix values="0 0 0 0 .3 0 0 0 0 .2 0 0 0 0 .1 0 0 0 .35 -.05"/></filter>
<pattern id="perf" width="22" height="22" patternUnits="userSpaceOnUse"><circle cx="11" cy="11" r="6" fill="#F4EBD9"/></pattern>'''


def pc_card(scene, stamp=True):
    s = '<rect width="1200" height="900" fill="#F4EBD9"/>'
    s += '<g><clipPath id="win"><rect x="56" y="56" width="1088" height="788" rx="6"/></clipPath>'
    s += '<g clip-path="url(#win)"><rect x="56" y="56" width="1088" height="788" fill="url(#sky7)"/>'
    s += '<g fill="#FFFFFF" opacity=".55"><ellipse cx="300" cy="190" rx="130" ry="30"/><ellipse cx="380" cy="170" rx="90" ry="34"/><ellipse cx="880" cy="230" rx="150" ry="26"/></g>'
    s += scene + '<rect x="56" y="56" width="1088" height="788" filter="url(#halftone)"/></g></g>'
    s += '<rect x="56" y="56" width="1088" height="788" rx="6" fill="none" stroke="#E6D6B4" stroke-width="3"/>'
    if stamp:
        s += ('<g transform="translate(992 92) rotate(4)"><rect width="112" height="140" fill="#F4EBD9"/>'
              '<rect x="10" y="10" width="92" height="120" fill="#B8432F"/>'
              '<path d="M56 34l10 26h28l-22 16 8 28-24-16-24 16 8-28-22-16h28z" fill="#D6A23A"/>'
              '<rect width="112" height="140" fill="none" stroke="#F4EBD9" stroke-width="8" stroke-dasharray="2 8"/></g>'
              '<g fill="none" stroke="#7A3A2E" stroke-width="3" opacity=".75"><circle cx="960" cy="200" r="58"/><circle cx="960" cy="200" r="44"/>'
              '<path d="M860 170q40 -14 80 0t80 0t80 0M860 190q40 -14 80 0t80 0t80 0M860 210q40 -14 80 0t80 0t80 0"/></g>')
    return s


def worker_kolkhoz(x, y, s=1.0):
    return (f'<g transform="translate({x} {y}) scale({s})" fill="#C9CED6" stroke="#5E6B7A" stroke-width="4" stroke-linejoin="round">'
            '<path d="M-220 120L-60 -40L-40 -170L-200 -330L-170 -350L-10 -210L40 -230L180 -400L210 -380L90 -190L120 -40L240 120Z"/>'
            '<path d="M-40 -170L-90 -10L-160 140H-120L-50 0L0 -120L60 0L140 140H180L110 -10L60 -170Z"/>'
            '<circle cx="-30" cy="-250" r="36"/><circle cx="50" cy="-262" r="34"/>'
            '<path d="M-200 -330L-260 -400M-240 -420l40 40" stroke-width="10"/>'
            '<path d="M180 -400q40 -60 0 -110q-20 50 -40 70" fill="none" stroke-width="10"/>'
            '<path d="M60 -200Q300 -140 520 -230Q320 -100 60 -150Z" fill="#E3E6EB"/>'
            '</g>')


def otkrytka_spots():
    # 1. Рабочий и колхозница — верхняя часть, постамент за краем открытки
    scene = worker_kolkhoz(560, 820, 1.05)
    save('vd-rabochiy', 'Открытка: «Рабочий и колхозница»',
         'Видовая открытка в тонированной печати: на фоне бирюзового неба стальные фигуры рабочего и колхозницы поднимают молот и серп, за ними развевается шарф; в углу марка и штемпель.',
         pc_card(scene), PC_DEFS)
    # 2. Арка главного входа — без надписи, без верха с надписью
    scene = ('<path d="M56 760H1144V844H56Z" fill="#D9C9A0"/>'
             '<path d="M260 760V380H940V760Z" fill="#F1E6C8" stroke="#B59B66" stroke-width="4"/>'
             '<path d="M330 760V520Q330 450 400 450Q470 450 470 520V760ZM530 760V480Q530 400 600 400Q670 400 670 480V760ZM730 760V520Q730 450 800 450Q870 450 870 520V760Z" fill="#5FA8B8"/>'
             '<path d="M240 380H960V330H240Z" fill="#E7D7AE" stroke="#B59B66" stroke-width="4"/>'
             '<path d="M300 330H900V300H300Z" fill="#D6A23A" opacity=".55"/>'
             '<g fill="url(#gold7)"><path d="M520 300l20 -120 30 -20 30 20 30 -20 30 20 20 120Z"/><circle cx="560" cy="150" r="18"/><circle cx="640" cy="150" r="18"/><path d="M590 150q10 -90 20 -100q10 10 20 100Z"/></g>'
             '<g fill="#8FB46A"><ellipse cx="150" cy="700" rx="90" ry="120"/><ellipse cx="1050" cy="700" rx="90" ry="120"/></g>')
    save('vd-vhod', 'Открытка: главный вход',
         'Видовая открытка: светлая триумфальная арка главного входа с тремя проездами, наверху золотая скульптурная группа со снопом, по сторонам деревья.',
         pc_card(scene), PC_DEFS)
    # 3. Центральный павильон — шпиль срезан краем открытки
    scene = ('<path d="M56 760H1144V844H56Z" fill="#D9C9A0"/>'
             '<path d="M200 760V520H1000V760Z" fill="#F1E6C8" stroke="#B59B66" stroke-width="4"/>'
             + ''.join(f'<path d="M{x} 750V560" stroke="#E2D2A6" stroke-width="22"/>' for x in range(250, 960, 60))
             + '<path d="M180 520H1020V490H180Z" fill="#E7D7AE"/>'
             '<path d="M470 490V300H730V490Z" fill="#F1E6C8" stroke="#B59B66" stroke-width="4"/>'
             '<path d="M520 300V160H680V300Z" fill="#F1E6C8" stroke="#B59B66" stroke-width="4"/>'
             '<path d="M560 160V40H640V160Z" fill="url(#gold7)"/>'
             '<path d="M56 830H1144" stroke="#F4EBD9" stroke-width="0"/>'
             '<g fill="#8FB46A"><ellipse cx="120" cy="720" rx="70" ry="100"/><ellipse cx="1080" cy="720" rx="70" ry="100"/></g>')
    save('vd-pavilon', 'Открытка: центральный павильон',
         'Видовая открытка: светлый павильон с колоннадой и ступенчатой башней, верх башни уходит за край открытки.',
         pc_card(scene), PC_DEFS)
    # 4. Фонтан «Дружба народов»
    figs = ''.join(
        f'<g transform="translate({600+330*math.cos(a):.0f} {650+70*math.sin(a):.0f}) scale({0.75+0.25*math.sin(a):.2f})"><path d="M-12 0Q-16 -60 -6 -90H6Q16 -60 12 0Z" fill="url(#gold7)"/><circle cx="0" cy="-102" r="11" fill="url(#gold7)"/></g>'
        for a in sorted([i * 2 * math.pi / 16 for i in range(16)], key=lambda a: math.sin(a)))
    scene = ('<path d="M56 700H1144V844H56Z" fill="#D9C9A0"/>'
             '<ellipse cx="600" cy="680" rx="420" ry="100" fill="#7FC0CF" stroke="#B59B66" stroke-width="6"/>'
             '<ellipse cx="600" cy="680" rx="380" ry="80" fill="#9ED3DE"/>'
             '<g stroke="#FFFFFF" stroke-width="5" fill="none" opacity=".8"><path d="M600 420q-80 120 -200 200M600 420q80 120 200 200M600 420q-30 140 -80 230M600 420q30 140 80 230"/></g>'
             '<path d="M560 640L580 470L600 400L620 470L640 640Z" fill="url(#gold7)"/>'
             '<g fill="url(#gold7)"><path d="M600 400l-50 -60M600 400l50 -60M600 400l-20 -80M600 400l20 -80M600 400v-90" stroke="#D6A23A" stroke-width="12"/></g>'
             + figs)
    save('vd-fontan', 'Открытка: фонтан с золотыми фигурами',
         'Видовая открытка: большая чаша фонтана, по кругу стоят золотые девичьи фигуры, в центре бьют струи вокруг золотого снопа.',
         pc_card(scene), PC_DEFS)
    # 5. Каменный цветок — без фактуры
    scene = ('<path d="M56 700H1144V844H56Z" fill="#D9C9A0"/>'
             '<ellipse cx="600" cy="700" rx="420" ry="90" fill="#7FC0CF" stroke="#B59B66" stroke-width="6"/>'
             '<path d="M520 700L540 560H660L680 700Z" fill="#C89B50"/>'
             + ''.join(f'<path d="M600 560Q{600+170*math.cos(a):.0f} {520+60*math.sin(a):.0f} {600+230*math.cos(a):.0f} {440+40*math.sin(a):.0f}Q{600+120*math.cos(a):.0f} {470+30*math.sin(a):.0f} 600 560Z" fill="{c}" stroke="#8A6220" stroke-width="3"/>'
                       for a, c in zip([math.pi * k / 6 + math.pi for k in range(7)], ['#5E9F7A', '#C9A04A', '#6FB59A', '#D6A23A', '#6FB59A', '#C9A04A', '#5E9F7A']))
             + '<ellipse cx="600" cy="460" rx="70" ry="40" fill="url(#gold7)"/>'
             '<g stroke="#FFFFFF" stroke-width="4" fill="none" opacity=".75"><path d="M600 420q-40 -100 -10 -190M600 420q40 -100 10 -190"/></g>')
    save('vd-cvetok', 'Открытка: фонтан-цветок',
         'Видовая открытка: в чаше фонтана раскрывается огромный цветок с зелёными и золотыми лепестками, из середины бьёт струя.',
         pc_card(scene), PC_DEFS)
    # 6. Павильон с куполом в конце аллеи — сбоку, без входа
    scene = ('<path d="M56 740H1144V844H56Z" fill="#D9C9A0"/>'
             '<path d="M640 740V420H1100V740Z" fill="#F1E6C8" stroke="#B59B66" stroke-width="4"/>'
             '<path d="M680 420Q870 200 1060 420Z" fill="#C9D3DC" stroke="#8A97A6" stroke-width="4"/>'
             + ''.join(f'<path d="M{x} 730V460" stroke="#E2D2A6" stroke-width="18"/>' for x in range(680, 1080, 50))
             + '<path d="M56 640Q300 600 600 640V740H56Z" fill="#8FB46A"/>'
             '<g fill="#6E9D58"><ellipse cx="200" cy="600" rx="90" ry="140"/><ellipse cx="380" cy="620" rx="70" ry="110"/><ellipse cx="520" cy="630" rx="60" ry="90"/></g>'
             '<path d="M56 780Q400 760 640 790" stroke="#F4EBD9" stroke-width="16" fill="none"/>')
    save('vd-kupol', 'Открытка: павильон с куполом в конце аллеи',
         'Видовая открытка: в конце аллеи, за деревьями, стоит павильон с колоннадой и серебристым куполом.',
         pc_card(scene), PC_DEFS)
    # Обложка: открытка фонтана с маркой, наискосок
    save('hero-vdnh', 'Открытка: золотые сёстры у фонтана',
         'Видовая открытка 1950-х: большая чаша фонтана, по кругу стоят золотые девичьи фигуры, в центре золотой сноп; в углу марка и почтовый штемпель.',
         pc_card(scene.replace('', '') if False else ('<path d="M56 700H1144V844H56Z" fill="#D9C9A0"/>'
             '<ellipse cx="600" cy="680" rx="420" ry="100" fill="#7FC0CF" stroke="#B59B66" stroke-width="6"/>'
             '<ellipse cx="600" cy="680" rx="380" ry="80" fill="#9ED3DE"/>'
             '<path d="M560 640L580 470L600 400L620 470L640 640Z" fill="url(#gold7)"/>' + figs)), PC_DEFS)


# ---------------------------------------------------------------- «синий час» для главной: места из дел №5–7
def platform_scenes():
    # Китай-город: Парящий мост над рекой, за ним огни Кремля
    body = bh_sky(41)
    body += '<path d="M0 520H1200V900H0Z" fill="url(#water)"/>'
    body += '<path d="M700 520V430H1200V520Z" fill="#3A1E2A"/>' + ''.join(f'<path d="M{700+i*40} 430v-18h20v18" fill="#3A1E2A"/>' for i in range(13))
    body += '<path d="M860 430V300L880 270L900 300V430Z M1060 430V320L1080 290L1100 320V430Z" fill="#4A2632"/>'
    body += '<circle cx="880" cy="262" r="8" fill="#FF6A5E"/><circle cx="1080" cy="282" r="8" fill="#FF6A5E"/>'
    body += '<ellipse cx="900" cy="560" rx="300" ry="20" fill="#FFC27A" opacity=".25"/>'
    body += '<path d="M0 600L560 470L600 470L40 640H0Z" fill="#C9CFE0"/><path d="M0 640L600 470" stroke="#0B1130" stroke-width="6"/>'
    body += ''.join(f'<circle cx="{40+i*56}" cy="{588-i*13}" r="3" fill="#FFE7A6"/>' for i in range(10))
    body += '<path d="M0 900V620L200 560V900Z" fill="#141B3E"/>'
    body += '<g opacity=".9">' + bh_person(380, 525, .6) + bh_person(410, 518, .5, child=True) + '</g>' + bh_finish()
    save('scene-kitay-1', 'Китай-город: Парящий мост вечером',
         'Вечер над Москвой-рекой: консольный мост из парка вылетает над водой, на нём гуляют люди, вдали зубчатая стена и башни с красными огнями отражаются в реке.', body, BH_DEFS)
    # Арбат: театр и фонари
    body = bh_sky(42)
    body += bh_tower(0, 300, 200, 420, 51) + bh_tower(980, 320, 220, 400, 52)
    body += '<path d="M240 720V330H960V720Z" fill="#4A5590"/>' + ''.join(f'<rect x="{x}" y="360" width="34" height="300" fill="#5E6AA6"/>' for x in range(300, 920, 90))
    body += '<path d="M220 330H980L940 290H260Z" fill="#3A4677"/>' + bh_windows(250, 380, 700, 260, 7, 2, 53, on=.8, cw=34, ch=90, base='#2B3A70')
    body += '<path d="M0 720H1200V900H0Z" fill="url(#gnd)"/>'
    body += '<ellipse cx="600" cy="770" rx="120" ry="22" fill="#2B3A70" stroke="#C9A24A" stroke-width="4"/>'
    body += '<path d="M580 765Q570 690 590 660Q600 640 610 660Q630 690 620 765Z" fill="url(#gold)"/><circle cx="600" cy="640" r="12" fill="url(#gold)"/>'
    body += bh_lamp(170, 800, 190) + bh_lamp(1030, 800, 190) + bh_lamp(400, 780, 150) + bh_lamp(800, 780, 150)
    body += '<g opacity=".9">' + bh_person(300, 850) + bh_person(330, 852, child=True) + bh_person(900, 840, .9) + bh_person(940, 845, .95) + '</g>' + bh_finish()
    save('scene-arbat-1', 'Арбат: театр и фонтан с золотой принцессой',
         'Вечерний Арбат: фасад театра с колоннами и светлыми окнами, перед ним фонтан с маленькой золотой фигурой, по сторонам фонари и гуляющие люди.', body, BH_DEFS)
    # ВДНХ: фонтан с золотыми фигурами
    figs = ''.join(f'<g transform="translate({600+330*math.cos(a):.0f} {700+60*math.sin(a):.0f})"><path d="M-9 0Q-12 -50 -4 -74H4Q12 -50 9 0Z" fill="url(#gold)"/><circle cx="0" cy="-84" r="9" fill="url(#gold)"/></g>' for a in sorted([i * 2 * math.pi / 16 for i in range(16)], key=lambda a: math.sin(a)))
    body = bh_sky(43)
    body += '<path d="M300 560V420H900V560Z" fill="#4A5590"/><path d="M520 420V300H680V420Z" fill="#56628F"/><path d="M570 300V200H630V300Z" fill="#5E6AA6"/>' + bh_windows(320, 440, 560, 100, 9, 1, 61, on=.8, cw=26, ch=60)
    body += '<path d="M0 600H1200V900H0Z" fill="url(#gnd)"/>'
    body += '<ellipse cx="600" cy="710" rx="400" ry="90" fill="#2B3A70" stroke="#C9A24A" stroke-width="4"/><ellipse cx="600" cy="710" rx="360" ry="70" fill="url(#water)"/>'
    body += '<g stroke="#DDEBFF" stroke-width="4" fill="none" opacity=".6"><path d="M600 470q-80 120 -200 200M600 470q80 120 200 200M600 470q-30 140 -80 230M600 470q30 140 80 230"/></g>'
    body += '<path d="M570 680L585 520L600 470L615 520L630 680Z" fill="url(#gold)"/>' + figs
    body += bh_lamp(120, 820, 180) + bh_lamp(1080, 820, 180)
    body += '<g opacity=".9">' + bh_person(250, 860) + bh_person(280, 864, child=True) + '</g>' + bh_finish()
    save('scene-vdnh-1', 'ВДНХ: фонтан с золотыми фигурами вечером',
         'Вечер на ВДНХ: большая чаша фонтана, по кругу стоят золотые фигуры, в центре золотой сноп и струи воды, за фонтаном светится павильон с башней.', body, BH_DEFS)


if __name__ == '__main__':
    platform_scenes()
    zilart_spots()
    chertezh_spots()
    nabor_spots()
    teatr_spots()
    otkrytka_spots()
    print('ok:', sorted(os.listdir(OUT)))

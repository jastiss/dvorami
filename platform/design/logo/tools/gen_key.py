#!/usr/bin/env python3
"""Генератор знака «Ключ» v4: три варианта бородки + версия для 16 px.
Геометрия задана в местных координатах: ось x — вдоль стержня, y<0 — сторона бородки.
Затем знак вписывается в поле 48x48 поворотом на 45 градусов."""
import json, math, re, sys, pathlib

OUT = pathlib.Path(sys.argv[1])
LOGO = OUT / 'platform/design/logo'
INK, LIGHT = '#0E1630', '#FFC53D'


def area(p):
    return sum(p[i][0] * p[(i + 1) % len(p)][1] - p[(i + 1) % len(p)][0] * p[i][1] for i in range(len(p))) / 2


def orient(p, positive):
    return p if (area(p) > 0) == positive else p[::-1]


def rect(x0, y0, x1, y1):
    return [(x0, y0), (x1, y0), (x1, y1), (x0, y1)]


def house(x0, x1, eave, apex, over=1.0):
    xm = (x0 + x1) / 2
    return [(x0, 0), (x0, eave), (x0 - over, eave), (xm, apex), (x1 + over, eave), (x1, eave), (x1, 0)]


def f(v):
    s = f'{v:.2f}'.rstrip('0').rstrip('.')
    return '0' if s in ('-0', '') else s


def poly(p):
    return 'M' + 'L'.join(f'{f(x)} {f(y)}' for x, y in p) + 'Z'


def build(spec):
    R, r, hw, x_end = spec['R'], spec['r'], spec['hw'], spec['end']
    solids = [orient(s, True) for s in spec['solids']]
    holes = [orient(h, False) for h in spec.get('holes', [])]
    d = (f'M0 {f(-R)}A{f(R)} {f(R)} 0 1 1 0 {f(R)}A{f(R)} {f(R)} 0 1 1 0 {f(-R)}Z'
         f'M8 {f(-hw)}H{f(x_end)}A{f(hw)} {f(hw)} 0 0 1 {f(x_end)} {f(hw)}H8Z')
    d += ''.join(poly(p) for p in solids + holes)
    # габарит после поворота на 45
    c = math.sqrt(.5)
    rot = lambda x, y: ((x - y) * c, (x + y) * c)
    pts = [rot(x, y) for p in solids for x, y in p]
    xs = [p[0] for p in pts] + [-R, R, rot(x_end, 0)[0] + hw]
    ys = [p[1] for p in pts] + [-R, R, rot(x_end, 0)[1] + hw]
    pad = spec.get('pad', 1.6)
    w, h = max(xs) - min(xs), max(ys) - min(ys)
    s = (48 - 2 * pad) / max(w, h)
    tx = 24 - s * (min(xs) + max(xs)) / 2
    ty = 24 - s * (min(ys) + max(ys)) / 2
    return (f'<g transform="translate({f(tx)} {f(ty)}) rotate(45) scale({s:.4f})"> '
            f'<path class="logo-d" fill="currentColor" d="{d}"/> '
            f'<circle class="logo-light" r="{f(r)}" fill="{LIGHT}"/> </g>')


BASE = dict(R=11.6, r=6.6, hw=3.0)
O = 0  # свес крыши

# A — ближе всего к эскизу: слева малый дом с трубой, башня со срезанным углом и двумя окнами, справа дом крупнее
A = dict(BASE, end=45.8, solids=[
    house(17.8, 25.0, -8.6, -11.8, O),
    rect(22.8, -14.0, 25.0, -6),                                   # труба на правом скате
    [(27.2, 0), (27.2, -16.8), (31.4, -16.8), (34.0, -14.2), (34.0, 0)],
    house(36.2, 44.6, -9.6, -13.4, O),
], holes=[
    rect(20.1, -7.8, 22.7, -5.2),
    rect(28.3, -13.4, 30.0, -8.2), rect(31.2, -13.4, 32.9, -8.2),
    rect(38.9, -8.6, 41.9, -5.6),
])

# B — слева малый дом, широкая башня с надстройкой и тремя окнами в ряд, справа крупный дом с трубой у конца ключа
B = dict(BASE, end=47.4, solids=[
    house(17.8, 24.2, -7.8, -10.6, O),
    rect(26.4, -16.2, 35.0, 0),
    rect(28.6, -18.8, 32.8, -16),                                  # надстройка
    house(37.2, 45.6, -9.6, -13.4, O),
    rect(43.4, -14.6, 45.6, -6),                                  # труба на правом скате
], holes=[
    rect(19.9, -7.1, 22.1, -4.9),
    rect(27.2, -13.2, 28.8, -7.6), rect(29.9, -13.2, 31.5, -7.6), rect(32.6, -13.2, 34.2, -7.6),
    rect(39.9, -8.6, 42.9, -5.6),
])

# C — слева крупный дом с трубой у кольца, башня со шпилем и тремя окнами (среднее выше), справа малый дом
C = dict(BASE, end=45.6, solids=[
    house(17.8, 26.2, -9.6, -13.4, O),
    rect(18.8, -14.8, 21.0, -10.4),                                  # труба на левом скате
    [(28.2, 0), (28.2, -15.0), (32.1, -19.0), (36.0, -15.0), (36.0, 0)],
    house(38.0, 44.4, -7.8, -10.6, O),
], holes=[
    rect(20.5, -8.6, 23.5, -5.6),
    rect(29.0, -12.6, 30.4, -7.4), rect(31.4, -14.4, 32.8, -7.4), rect(33.8, -12.6, 35.2, -7.4),
    rect(40.1, -7.1, 42.3, -4.9),
])

# 16 px — без окон, стержень толще, зазоры шире, труба крупная
S16 = dict(R=12.2, r=6.6, hw=3.8, end=42.0, pad=0.6, solids=[
    house(16.2, 23.0, -8.0, -10.8, 0),
    rect(20.4, -14.0, 23.0, -8),
    [(26.6, 0), (26.6, -18.0), (30.4, -18.0), (33.0, -15.4), (33.0, 0)],
    house(36.6, 43.6, -10.0, -13.6, 0),
])

MARKS = {k: build(v) for k, v in dict(a=A, b=B, c=C, s16=S16).items()}
NAMES = dict(a='вариант A, по эскизу', b='вариант B, широкая башня', c='вариант C, шпиль')
DESC = dict(
    a='Ключ с толстым кольцом и жёлтым светом двора. Бородка: малый дом с трубой, башня с двумя окнами, дом покрупнее.',
    b='Ключ с толстым кольцом и жёлтым светом двора. Бородка: малый дом, широкая башня с тремя окнами, дом с трубой.',
    c='Ключ с толстым кольцом и жёлтым светом двора. Бородка: дом с трубой, башня со шпилем и тремя окнами, малый дом.')

word = re.search(r'<path class="logo-word".*?/>', (LOGO / 'v2-klyuch-lockup.svg').read_text(), re.S).group(0).replace('translate(60 35)', 'translate(68 39)')

for k in 'abc':
    (LOGO / f'v4-klyuch-{k}.svg').write_text(
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" width="48" height="48" role="img" aria-labelledby="t d" color="{INK}">\n'
        f'  <title id="t">Дворами — знак «Ключ», {NAMES[k]}</title>\n'
        f'  <desc id="d">{DESC[k]}</desc>\n'
        f'  {MARKS[k]}\n</svg>\n')
    (LOGO / f'v4-klyuch-{k}-lockup.svg').write_text(
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 252 56" width="252" height="56" role="img" aria-label="Дворами" color="{INK}">\n'
        f'  <title>Дворами — знак «Ключ» со словом, {NAMES[k]}</title>\n'
        f'  <g transform="scale(1.1667)">{MARKS[k]}</g>\n  {word}\n</svg>\n')
(LOGO / 'v4-klyuch-16.svg').write_text(
    f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" width="16" height="16" role="img" aria-labelledby="t d" color="{INK}">\n'
    '  <title id="t">Дворами — знак «Ключ», упрощённый для 16 px</title>\n'
    '  <desc id="d">Ключ с толстым кольцом и жёлтым светом; бородка — дом с трубой, башня, дом, без окон.</desc>\n'
    f'  {MARKS["s16"]}\n</svg>\n')

tpl = pathlib.Path(__file__).with_name('page.tpl.html').read_text()
(LOGO / 'logo-options-v4.html').write_text(tpl.replace('/*MARKS*/', json.dumps(MARKS, ensure_ascii=False)))
print({k: len(v) for k, v in MARKS.items()})

#!/usr/bin/env python3
"""Финальный знак «Ключ»: вектор один в один с эскизом fal/pro-b-klyuch-rect-2.png.

Запуск из корня репозитория: python3 platform/design/logo/tools/gen_key_final.py
Пишет platform/design/logo/key*.svg, site/assets/favicon.svg и печатает инлайн-разметку знака для сайта.

Геометрия снята с эскиза (1024x1024) и задана в местных координатах ключа:
начало — центр кольца, ось u — вдоль стержня (на эскизе вправо-вниз под 45 градусов),
ось v — в сторону бородки (вправо-вверх). Единица — пиксель эскиза.
"""
import math
import pathlib

from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen
from fontTools.ttLib import TTFont

ROOT = pathlib.Path(__file__).resolve().parents[4]
LOGO = ROOT / 'platform/design/logo'
FONT = ROOT / 'site/assets/fonts/unbounded-cyrillic-800-normal.woff2'

NAVY, CREAM, YELLOW = '#0E1931', '#EDE9DD', '#F9BD39'   # цвета эскиза

C = (380.4, 390.45)          # центр кольца на эскизе
R_OUT, R_IN = 121.5, 67.6    # кольцо и жёлтый круг
TOP, BOT = 32.8, -28.6       # кромки стержня
TIP_U = 473.0                # центр скругления конца стержня
TIP_R = (TOP - BOT) / 2

# Бородка: от стержня вверх, слева направо (u растёт к концу ключа).
BIT = [
    (208.0, TOP), (208.0, 67.2), (199.5, 67.2), (199.5, 75.7), (202.4, 78.5),      # домик 1: стена, свес
    (248.3, 103.2),                                                                # конёк
    (272.7, 90.1), (273.1, 99.7), (284.4, 99.7), (284.8, 83.7),                    # труба
    (297.1, 77.1), (296.4, 67.9), (288.6, 70.0), (288.6, TOP),                     # свес, стена
    (304.9, TOP), (304.9, 149.9), (371.4, 149.9), (371.4, TOP),                    # башня
    (386.2, TOP), (386.2, 79.9), (423.7, 106.1), (459.8, 82.7), (459.8, TOP),      # домик 2
]
# Окна: (u0, u1, v0, v1)
WIN_HOUSES = [(238.4, 258.2, 31.8, 61.5), (413.1, 432.9, 32.5, 61.5)]
WIN_TOWER = [(u0, u1, v0, v1)
             for (u0, u1) in ((318.3, 332.5), (343.8, 357.9))
             for (v0, v1) in ((40.5, 65.1), (77.4, 101.5), (113.8, 137.2))]

S2 = math.sqrt(2)


def img(u, v):
    """Местные координаты -> пиксели эскиза."""
    return C[0] + (u + v) / S2, C[1] + (u - v) / S2


def outline():
    """Все опорные точки контура в пикселях эскиза (для габарита)."""
    pts = [img(u, v) for u, v in BIT]
    pts += [(C[0] + R_OUT * math.cos(a / 50 * math.pi), C[1] + R_OUT * math.sin(a / 50 * math.pi)) for a in range(100)]
    cu, cv = TIP_U, (TOP + BOT) / 2
    pts += [img(cu + TIP_R * math.cos(a / 50 * math.pi), cv + TIP_R * math.sin(a / 50 * math.pi)) for a in range(100)]
    return pts


PTS = outline()
X0, X1 = min(p[0] for p in PTS), max(p[0] for p in PTS)
Y0, Y1 = min(p[1] for p in PTS), max(p[1] for p in PTS)
BOX = 512.0                                   # поле знака: квадрат 512, ключ по центру
OFF = ((X0 + X1) / 2 - BOX / 2, (Y0 + Y1) / 2 - BOX / 2)


def f(v):
    return f'{v:.1f}'.rstrip('0').rstrip('.')


def P(u, v):
    x, y = img(u, v)
    return f'{f(x - OFF[0])} {f(y - OFF[1])}'


def body_path(windows=True):
    ju_top = math.sqrt(R_OUT ** 2 - TOP ** 2)
    ju_bot = math.sqrt(R_OUT ** 2 - BOT ** 2)
    d = [f'M{P(ju_top, TOP)}']
    d += [f'L{P(u, v)}' for u, v in BIT]
    d.append(f'L{P(TIP_U, TOP)}')
    d.append(f'A{f(TIP_R)} {f(TIP_R)} 0 0 1 {P(TIP_U, BOT)}')
    d.append(f'L{P(ju_bot, BOT)}')
    d.append(f'A{f(R_OUT)} {f(R_OUT)} 0 1 1 {P(ju_top, TOP)}Z')
    if windows:
        for u0, u1, v0, v1 in WIN_HOUSES + WIN_TOWER:
            d.append(f'M{P(u0, v0)}L{P(u0, v1)}L{P(u1, v1)}L{P(u1, v0)}Z')
    return ''.join(d)


CX, CY = C[0] - OFF[0], C[1] - OFF[1]


def mark(body, windows=True, cls=False):
    """Разметка знака без обёртки svg: тело ключа + жёлтый круг."""
    c1 = ' class="logo-key"' if cls else ''
    c2 = ' class="logo-light"' if cls else ''
    return (f'<path{c1} fill="{body}" fill-rule="evenodd" d="{body_path(windows)}"/>'
            f'<circle{c2} cx="{f(CX)}" cy="{f(CY)}" r="{f(R_IN)}" fill="{YELLOW}"/>')


def svg(inner, w=BOX, h=BOX, title='Дворами'):
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {f(w)} {f(h)}" role="img" aria-label="{title}">'
            f'{inner}</svg>\n')


def tile(bg, body, pad=0.18, size=640, rx=0, windows=True):
    """Знак на плашке: поля pad от стороны, ключ по центру габарита."""
    s = size * (1 - 2 * pad) / max(X1 - X0, Y1 - Y0)
    tx = size / 2 - BOX / 2 * s
    ty = size / 2 - BOX / 2 * s
    r = f' rx="{f(rx)}"' if rx else ''
    return svg(f'<rect width="{f(size)}" height="{f(size)}"{r} fill="{bg}"/>'
               f'<g transform="translate({f(tx)} {f(ty)}) scale({s:.4f})">{mark(body, windows)}</g>', size, size)


def word_path(text, size, x, baseline, tracking):
    """Слово в кривых: Unbounded 800, как .logo в шапке сайта."""
    font = TTFont(str(FONT))
    gs, cmap, hmtx = font.getGlyphSet(), font.getBestCmap(), font['hmtx']
    k = size / font['head'].unitsPerEm
    out = []
    for ch in text:
        g = cmap[ord(ch)]
        pen = SVGPathPen(gs, ntos=lambda v: f(v))
        gs[g].draw(TransformPen(pen, (k, 0, 0, -k, x, baseline)))
        out.append(pen.getCommands())
        x += hmtx[g][0] * k + tracking * size
    return ''.join(out), x - tracking * size


def lockup(body):
    """Знак + слово «дворами»: пропорции шапки сайта (знак 44, зазор 8, кегль 22, трекинг -0.01em)."""
    font = TTFont(str(FONT))
    u = BOX / 44                       # 1 px шапки в единицах знака
    size = 22 * u
    hhea = font['hhea']
    upm = font['head'].unitsPerEm
    baseline = BOX / 2 + (hhea.ascent + hhea.descent) / 2 / upm * size   # строка по центру знака, как в flex
    d, x_end = word_path('дворами', size, BOX + 8 * u, baseline, -0.01)
    return svg(mark(body) + f'<path fill="{body}" d="{d}"/>', math.ceil(x_end), BOX)


def main():
    files = {
        'key.svg': svg(mark(NAVY)),
        'key-inverse.svg': svg(mark(CREAM)),
        'key-16.svg': svg(mark(NAVY, windows=False)),
        'key-16-inverse.svg': svg(mark(CREAM, windows=False)),
        'key-lockup.svg': lockup(NAVY),
        'key-lockup-inverse.svg': lockup(CREAM),
        'key-tile.svg': tile(CREAM, NAVY),
        'key-tile-inverse.svg': tile(NAVY, CREAM),
    }
    for name, text in files.items():
        (LOGO / name).write_text(text, encoding='utf-8')
    # Фавикон сайта: скруглённая тёмная плашка, знак без окон (в 16-32 px окна сливаются)
    (ROOT / 'site/assets/favicon.svg').write_text(tile(NAVY, CREAM, pad=0.13, size=512, rx=118, windows=False), encoding='utf-8')
    print('bbox', f(X0), f(Y0), f(X1), f(Y1), 'offset', OFF)
    print('INLINE', '<svg viewBox="0 0 512 512" aria-hidden="true" focusable="false">'
          + mark('currentColor', cls=True) + '</svg>')
    print('INLINE16', '<svg viewBox="0 0 512 512" aria-hidden="true" focusable="false">'
          + mark('currentColor', windows=False, cls=True) + '</svg>')


if __name__ == '__main__':
    main()

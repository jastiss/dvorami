#!/usr/bin/env python3
"""Картинки для постов канала @dvorami_quest: 1080×1350 PNG, нарисованы кодом.

Стиль — платформа «Синий час» (platform/design/BRAND.md): фон #0E1630…#3B4C8A, акцент #FFC53D,
Unbounded 600/800 — заголовки, Golos Text — текст и метки. Шрифты берутся локально из
site/assets/fonts, внешних запросов нет (все http/https в браузере блокируются).
Логотип — текстовый wordmark из docs/marketing/channel/img/_wordmark.html: меняется только там.

Запуск:  python3 scripts/make_channel_img.py            # все картинки
         python3 scripts/make_channel_img.py 002 004    # только нужные
Результат: docs/marketing/channel/img/<номер>-<слаг>.png
"""
import base64
import pathlib
import sys

from playwright.sync_api import sync_playwright

ROOT = pathlib.Path(__file__).resolve().parent.parent
FONTS = ROOT / "site" / "assets" / "fonts"
IMG = ROOT / "docs" / "marketing" / "channel" / "img"
W, H = 1080, 1350

WORDMARK = (IMG / "_wordmark.html").read_text(encoding="utf-8")


CYR = "U+0301,U+0400-045F,U+0490-0491,U+04B0-04B1,U+2116"
LAT = ("U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,"
       "U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD")
# (семейство в CSS, префикс файла, начертания) — те же файлы и диапазоны, что в site/assets/fonts.css
FACES = [("Unbounded", "unbounded", (600, 800)), ("Golos", "golos-text", (400, 500, 600, 700))]


def face(family, prefix, weight, subset, urange):
    """Шрифт вшивается base64: страница собирается через set_content (about:blank),
    а оттуда Chromium не читает file:// — из-за этого раньше подставлялся системный гротеск."""
    data = base64.b64encode((FONTS / f"{prefix}-{subset}-{weight}-normal.woff2").read_bytes()).decode()
    return (f"@font-face{{font-family:'{family}';font-weight:{weight};font-style:normal;"
            f"font-display:block;src:url(data:font/woff2;base64,{data}) format('woff2');"
            f"unicode-range:{urange};}}")


FONT_CSS = "".join(face(fam, pre, w, sub, rng)
                   for fam, pre, weights in FACES for w in weights
                   for sub, rng in (("cyrillic", CYR), ("latin", LAT)))

# Проверка в браузере перед снимком: шрифты бренда загружены и реально применены.
FONT_CHECK_JS = """async (faces) => {
  await document.fonts.ready;
  const problems = [];
  const ctx = document.createElement('canvas').getContext('2d');
  const sample = 'Дворами прячет 1946 Quest №';
  for (const [family, weight] of faces) {
    const spec = `${weight} 40px '${family}'`;
    await document.fonts.load(spec, sample);
    if (!document.fonts.check(spec, sample)) problems.push(`${family} ${weight}: fonts.check = false`);
    const loaded = [...document.fonts].filter(f => f.family.replace(/['"]/g, '') === family
        && String(f.weight) === String(weight) && f.status === 'loaded').length;
    if (loaded < 2) problems.push(`${family} ${weight}: загружено ${loaded} из 2 файлов (кириллица + латиница)`);
    ctx.font = `${weight} 40px '${family}', monospace`; const w1 = ctx.measureText(sample).width;
    ctx.font = `${weight} 40px monospace`; const w2 = ctx.measureText(sample).width;
    if (Math.abs(w1 - w2) < 1) problems.push(`${family} ${weight}: текст рисуется запасным шрифтом`);
  }
  // каждый текстовый элемент страницы должен начинаться с шрифта бренда
  for (const el of document.querySelectorAll('body *')) {
    if (![...el.childNodes].some(n => n.nodeType === 3 && n.textContent.trim())) continue;
    const fam = getComputedStyle(el).fontFamily.split(',')[0].replace(/['"]/g, '').trim();
    if (!faces.some(f => f[0] === fam)) problems.push(`элемент <${el.tagName.toLowerCase()}> со шрифтом ${fam}`);
  }
  return problems;
}"""

BASE_CSS = """
:root{
  --bg:#0E1630; --surface:#17224A; --line:#2B3A70;
  --text:#F3F1EA; --text-2:#D5D9E6; --text-3:#A9B1C7;
  --accent:#FFC53D; --sky:#8FC2FF; --night:#070C1F;
}
*{margin:0;padding:0;box-sizing:border-box}
html,body{width:1080px;height:1350px;overflow:hidden;background:var(--bg)}
body{position:relative;font-family:'Golos',sans-serif;color:var(--text);
     -webkit-font-smoothing:antialiased}
.frame{position:absolute;inset:0}
.art{position:absolute;inset:0}
.pad{position:absolute;inset:0;padding:64px}
.top{position:absolute;top:64px;left:64px;right:64px;display:flex;
     align-items:center;justify-content:space-between;gap:24px}
.label{font-family:'Golos',sans-serif;font-weight:600;font-size:30px;letter-spacing:.16em;
       text-transform:uppercase;color:var(--text-3)}
.label b{color:var(--accent);font-weight:600}
.h1{font-family:'Unbounded',sans-serif;font-weight:800;letter-spacing:-.02em;line-height:1.02}
.h1 em{font-style:normal;color:var(--accent)}
.lead{font-size:34px;line-height:1.42;color:var(--text-2);font-weight:400}
.foot{position:absolute;left:64px;right:64px;bottom:60px;display:flex;
      align-items:flex-end;justify-content:space-between;gap:24px}
.grain{position:absolute;inset:0;mix-blend-mode:soft-light;opacity:.5}
.vig{position:absolute;inset:0;background:radial-gradient(120% 90% at 50% 38%,
     rgba(5,8,24,0) 42%, rgba(5,8,24,.72) 100%)}
"""

GRAIN = ('<svg class="grain" width="1080" height="1350"><filter id="g">'
         '<feTurbulence type="fractalNoise" baseFrequency=".85" numOctaves="2" seed="11"'
         ' stitchTiles="stitch"/><feColorMatrix values="0 0 0 0 1 0 0 0 0 .96 0 0 0 0 .86'
         ' 0 0 0 .42 -.14"/></filter><rect width="1080" height="1350" filter="url(#g)"/></svg>')


def page_html(body, css=""):
    return (f"<!doctype html><html lang=ru><head><meta charset=utf-8><style>{FONT_CSS}"
            f"{BASE_CSS}{css}</style></head><body>{body}{GRAIN}</body></html>")


def stars(seed, count, y_max, avoid=()):
    """Звёзды; avoid — прямоугольники (x0, y0, x1, y1) под текст и графику: туда звёзды не попадают."""
    import random
    r = random.Random(seed)
    out = []
    while len(out) < count:
        x, y = r.randint(10, W - 10), r.randint(24, y_max)
        if any(x0 <= x <= x1 and y0 <= y <= y1 for (x0, y0, x1, y1) in avoid):
            continue
        rr = r.choice([1.1, 1.5, 1.9, 2.4])
        out.append(f'<circle cx="{x}" cy="{y}" r="{rr}" opacity="{r.uniform(.3, .85):.2f}"/>')
    return f'<g fill="#F3F1EA">{"".join(out)}</g>'


TOPBAR = (40, 40, 1040, 132)   # зона логотипа и метки рубрики


def windows(spec, seed=3):
    """spec: список (x, y, cols, rows, cw, ch, gap) — ряды окон в силуэте дома."""
    import random
    r = random.Random(seed)
    out = []
    for (x, y, cols, rows, cw, ch, gap) in spec:
        for c in range(cols):
            for row in range(rows):
                if r.random() < .42:
                    continue
                col = r.choice(["#FFD98A", "#FFC53D", "#FFE9BC", "#8FC2FF"])
                op = r.uniform(.5, 1)
                out.append(f'<rect x="{x + c * (cw + gap)}" y="{y + row * (ch + gap)}" '
                           f'width="{cw}" height="{ch}" fill="{col}" opacity="{op:.2f}"/>')
    return "".join(out)


SKY = ('<linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">'
       '<stop offset="0" stop-color="#070C1F"/><stop offset=".34" stop-color="#101A3E"/>'
       '<stop offset=".62" stop-color="#1B2A5E"/><stop offset=".86" stop-color="#2E4080"/>'
       '<stop offset="1" stop-color="#46588F"/></linearGradient>')
WARM = ('<radialGradient id="warm"><stop offset="0" stop-color="#FFE3A8" stop-opacity=".95"/>'
        '<stop offset=".45" stop-color="#FFC27A" stop-opacity=".45"/>'
        '<stop offset="1" stop-color="#FF9E4A" stop-opacity="0"/></radialGradient>')
GLOW = ('<radialGradient id="glow"><stop offset="0" stop-color="#FFEFC2" stop-opacity=".98"/>'
        '<stop offset=".18" stop-color="#FFC53D" stop-opacity=".7"/>'
        '<stop offset=".48" stop-color="#FFB347" stop-opacity=".22"/>'
        '<stop offset="1" stop-color="#FFB347" stop-opacity="0"/></radialGradient>')


def pigeon(x, y, s=1, flip=False, fill="#070C1F"):
    """Силуэт сидящего голубя; (x, y) — точка, где лапы касаются опоры."""
    body = ("M-30 -20 C-22 -34 -6 -40 8 -36 C12 -48 22 -54 30 -48 C35 -44 35 -38 32 -34 "
            "L40 -31 L32 -28 C30 -16 20 -8 6 -8 L-14 -8 L-44 -3 Z")
    tr = f"translate({x},{y}) scale({-s if flip else s},{s})"
    return (f'<g transform="{tr}" fill="{fill}"><path d="{body}"/>'
            f'<rect x="-6" y="-9" width="3" height="9"/><rect x="4" y="-9" width="3" height="9"/></g>')


# ---------------------------------------------------------------- 001 знакомство
# Текст — верхняя половина (чистое небо), дом с подворотней — нижняя. Ничего не пересекается.
def art_001():
    roof = 800
    wins = windows([
        (112, 866, 3, 2, 44, 58, 50),
        (790, 866, 3, 2, 44, 58, 50),
        (112, 1110, 3, 2, 44, 58, 50),
        (790, 1110, 3, 2, 44, 58, 50),
    ], seed=9)
    arch = ('<path d="M372 1350V1076c0-93 75-168 168-168s168 75 168 168v274Z" fill="#060A1B"/>'
            '<path d="M400 1350V1080c0-77 63-140 140-140s140 63 140 140v270Z" fill="url(#archlight)"/>'
            # двор в глубине: дальний дом с окном и дерево — «проход во двор»
            '<g clip-path="url(#archclip)">'
            '<rect x="400" y="1196" width="280" height="154" fill="#C98A4B" opacity=".55"/>'
            '<rect x="430" y="1128" width="110" height="222" fill="#8A5A30" opacity=".5"/>'
            '<rect x="458" y="1160" width="26" height="34" fill="#FFF3D2" opacity=".9"/>'
            '<circle cx="622" cy="1170" r="46" fill="#7A4E2A" opacity=".5"/>'
            '<rect x="617" y="1196" width="10" height="154" fill="#7A4E2A" opacity=".5"/></g>')
    return f'''<svg class="art" viewBox="0 0 {W} {H}" width="{W}" height="{H}" aria-hidden="true">
<defs>{SKY}{WARM}{GLOW}
<linearGradient id="archlight" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#FFE9BC"/>
  <stop offset=".55" stop-color="#FFC978"/><stop offset="1" stop-color="#E79A4A"/></linearGradient>
<clipPath id="archclip"><path d="M400 1350V1080c0-77 63-140 140-140s140 63 140 140v270Z"/></clipPath></defs>
<rect width="{W}" height="{H}" fill="url(#sky)"/>
{stars(5, 46, 700, avoid=[TOPBAR, (40, 170, 900, 700), (780, 150, 980, 330)])}
<circle cx="880" cy="240" r="150" fill="url(#glow)" opacity=".22"/>
<path d="M868 212a28 28 0 1 0 0 56a21 28 0 1 1 0-56Z" fill="#FFF3D2" opacity=".9"/>
<g fill="#0C1430"><rect x="0" y="742" width="150" height="608"/><rect x="930" y="716" width="150" height="634"/></g>
<path d="M64 {roof}h952v{H - roof}H64Z" fill="#090F26"/>
<path d="M64 {roof}h952v14H64Z" fill="#1B2A5E" opacity=".85"/>
<circle cx="540" cy="1160" r="330" fill="url(#warm)" opacity=".28"/>
{wins}
{arch}
{pigeon(250, roof, 1.25)}
{pigeon(318, roof, 1.05)}
{pigeon(812, roof, 1.2, flip=True)}
</svg><div class="vig"></div>'''


def html_001():
    body = f'''<div class="frame">{art_001()}
<div class="top">{WORDMARK}<span class="label">канал</span></div>
<div style="position:absolute;left:64px;right:64px;top:196px">
  <div class="h1" style="font-size:98px">Город<br>что-то<br><em>прячет</em></div>
  <div class="lead" style="margin-top:34px;max-width:700px">Квесты-прогулки по Москве
    без гида и расписания. Пойдём искать?</div>
</div>
</div>'''
    return page_html(body)


# ---------------------------------------------------------------- 002 загадка
# На картинке загадки ответа НЕТ: пустой двор, свидетели-окна и знак вопроса вместо того, кого ищем.
def art_002():
    ground = 1150
    bench = ('<g fill="#060A1B"><rect x="404" y="1086" width="272" height="16" rx="5"/>'
             '<rect x="424" y="1102" width="14" height="48"/><rect x="642" y="1102" width="14" height="48"/>'
             '<rect x="404" y="1046" width="272" height="14" rx="5"/>'
             '<rect x="424" y="1060" width="14" height="26"/><rect x="642" y="1060" width="14" height="26"/></g>')
    cat = ('<g fill="#060A1B"><path d="M560 1046c0-26 14-42 34-42s34 16 34 42Z"/>'
           '<circle cx="622" cy="1000" r="17"/><path d="M608 990l4-18 10 12ZM626 984l10-12 2 18Z"/>'
           '<path d="M562 1040c-16-2-26-12-24-26" fill="none" stroke="#060A1B" stroke-width="7" '
           'stroke-linecap="round"/></g>')
    return f'''<svg class="art" viewBox="0 0 {W} {H}" width="{W}" height="{H}" aria-hidden="true">
<defs>{SKY}{GLOW}
<linearGradient id="grd" x1="0" y1="0" x2="0" y2="1">
  <stop offset="0" stop-color="#101937"/><stop offset="1" stop-color="#070C1F"/></linearGradient></defs>
<rect width="{W}" height="{H}" fill="url(#sky)"/>
{stars(12, 44, 820, avoid=[TOPBAR, (60, 150, 1020, 400), (330, 400, 750, 980), (0, 780, 300, 1150), (800, 740, 1080, 1150)])}
<circle cx="540" cy="700" r="420" fill="url(#glow)" opacity=".16"/>
<g fill="#0A1027"><rect x="0" y="840" width="276" height="{ground - 840}"/>
  <rect x="0" y="900" width="340" height="{ground - 900}"/>
  <rect x="820" y="790" width="260" height="{ground - 790}"/>
  <rect x="752" y="930" width="100" height="{ground - 930}"/></g>
{windows([(40, 884, 3, 3, 36, 46, 40), (862, 836, 3, 4, 36, 46, 40)], seed=6)}
<rect x="0" y="{ground}" width="{W}" height="{H - ground}" fill="url(#grd)"/>
<path d="M0 {ground}h{W}" stroke="#1B2A5E" stroke-width="3"/>
{bench}{cat}
</svg><div class="vig"></div>'''


def html_002():
    body = f'''<div class="frame">{art_002()}
<div class="top">{WORDMARK}<span class="label">загадка <b>№ 1</b></span></div>
<div style="position:absolute;left:64px;right:64px;top:176px;text-align:center">
  <div class="h1" style="font-size:54px;line-height:1.1">Единственный<br>свидетель, который<br>
    <em>не меняет показаний</em></div>
</div>
<div class="h1 qmark">?</div>
<div class="foot"><span class="label">кто он? ответ — завтра</span></div>
</div>'''
    css = (".qmark{position:absolute;left:0;right:0;top:400px;text-align:center;font-size:520px;"
           "line-height:1;color:var(--accent);text-shadow:0 0 90px rgba(255,197,61,.45)}")
    return page_html(body, css)


# ---------------------------------------------------------------- 003 ответ: фонарь
# Фонарь стоит на «земле» в верхней части кадра; текст — ниже линии земли, столб его не пересекает.
def art_003():
    head, ground = 410, 812
    return f'''<svg class="art" viewBox="0 0 {W} {H}" width="{W}" height="{H}" aria-hidden="true">
<defs>{SKY}{GLOW}
<linearGradient id="cone3" x1="0" y1="0" x2="0" y2="1">
  <stop offset="0" stop-color="#FFD98A" stop-opacity=".46"/>
  <stop offset="1" stop-color="#FFC53D" stop-opacity=".05"/></linearGradient>
<radialGradient id="pool3"><stop offset="0" stop-color="#FFD793" stop-opacity=".7"/>
  <stop offset="1" stop-color="#FFC53D" stop-opacity="0"/></radialGradient></defs>
<rect width="{W}" height="{H}" fill="url(#sky)"/>
{stars(21, 40, 760, avoid=[TOPBAR, (200, 170, 880, 830)])}
<circle cx="540" cy="{head}" r="370" fill="url(#glow)" opacity=".95"/>
<path d="M474 {head + 14} L236 {ground} L844 {ground} L606 {head + 14}Z" fill="url(#cone3)"/>
<ellipse cx="540" cy="{ground}" rx="304" ry="26" fill="url(#pool3)"/>
<path d="M120 {ground}h840" stroke="#F3F1EA" stroke-width="4" opacity=".28"/>
<g fill="#070C1F">
  <rect x="526" y="{head}" width="28" height="{ground - head - 20}"/>
  <rect x="528" y="196" width="24" height="{head - 196 - 100}"/>
  <circle cx="540" cy="196" r="16"/>
  <path d="M446 {head} L540 {head - 118} L634 {head}Z"/>
  <rect x="436" y="{head - 4}" width="208" height="24" rx="8"/>
  <rect x="470" y="{ground - 24}" width="140" height="24" rx="6"/>
</g>
<ellipse cx="540" cy="{head + 20}" rx="70" ry="18" fill="#FFF6DE"/>
{pigeon(606, head - 62, 1.3, flip=True, fill="#1A1206")}
</svg><div class="vig"></div>'''


def html_003():
    body = f'''<div class="frame">{art_003()}
<div class="top">{WORDMARK}<span class="label">ответ <b>№ 1</b></span></div>
<div style="position:absolute;left:64px;right:64px;top:872px;text-align:center">
  <div class="h1" style="font-size:136px;letter-spacing:0">ФОНАРЬ</div>
  <div class="lead" style="margin:30px auto 0;max-width:760px">Он видит двор каждый вечер
    и ничего не придумывает.</div>
</div>
<div class="foot" style="justify-content:center"><span class="label">загадка разгадана</span></div>
</div>'''
    return page_html(body)


# ---------------------------------------------------------------- 004 факт: ЗИС-154
NODES = ((250, "дизель"), (540, "генератор"), (790, "мотор"))


def art_004():
    body = ('<rect x="110" y="690" width="860" height="250" rx="26" fill="#0E1630" fill-opacity=".35" '
            'stroke="#D5D9E6" stroke-width="5"/>'
            '<path d="M110 780h860" stroke="#D5D9E6" stroke-width="3" opacity=".45"/>')
    win = "".join(f'<rect x="{150 + i * 132}" y="712" width="104" height="54" rx="8" '
                  f'fill="none" stroke="#8FC2FF" stroke-width="4" opacity=".9"/>' for i in range(6))
    wheels = ('<g fill="#101A3E" stroke="#D5D9E6" stroke-width="5">'
              '<circle cx="268" cy="940" r="62"/><circle cx="812" cy="940" r="62"/></g>'
              '<g fill="#8FC2FF" opacity=".3"><circle cx="268" cy="940" r="28"/>'
              '<circle cx="812" cy="940" r="28"/></g>')
    # жёлтый путь энергии: дизель → генератор → мотор → колесо
    path = ('<path d="M250 850 H410 l26 -34 26 34 h120 l26 -34 26 34 H790" fill="none" '
            'stroke="#FFC53D" stroke-width="7" stroke-linecap="round" stroke-linejoin="round"/>'
            '<path d="M790 850 C850 850 856 900 824 916" fill="none" stroke="#FFC53D" '
            'stroke-width="7" stroke-linecap="round"/>'
            '<path d="M842 898 L822 918 L848 924" fill="none" stroke="#FFC53D" stroke-width="7" '
            'stroke-linecap="round" stroke-linejoin="round"/>')
    nodes = "".join(f'<circle cx="{x}" cy="850" r="30" fill="#0E1630" stroke="#FFC53D" stroke-width="6"/>'
                    for x, _ in NODES)
    icons = ('<g stroke="#FFC53D" stroke-width="5" fill="none" stroke-linecap="round" stroke-linejoin="round">'
             '<path d="M240 862v-24M250 862v-24M260 862v-24"/>'
             '<path d="M546 834 l-14 20 h16 l-14 20"/>'
             '<circle cx="790" cy="850" r="11"/></g><circle cx="790" cy="850" r="3.5" fill="#FFC53D"/>')
    ticks = "".join(f'<path d="M{x} 1026v22" stroke="#A9B1C7" stroke-width="3" opacity=".7"/>'
                    for x, _ in NODES)
    return f'''<svg class="art" viewBox="0 0 {W} {H}" width="{W}" height="{H}" aria-hidden="true">
<defs>{SKY}{GLOW}</defs>
<rect width="{W}" height="{H}" fill="url(#sky)"/>
{stars(33, 34, 640, avoid=[TOPBAR, (40, 170, 1040, 530)])}
<path d="M64 1022h952" stroke="#2B3A70" stroke-width="4"/>
{body}{win}{path}{wheels}{nodes}{icons}{ticks}
</svg><div class="vig"></div>'''


def html_004():
    labels = "".join(f'<span class="label node" style="left:{x - 150}px">{name}</span>'
                     for x, name in NODES)
    body = f'''<div class="frame">{art_004()}
<div class="top">{WORDMARK}<span class="label">факт · <b>ЗИЛ</b></span></div>
<div style="position:absolute;left:64px;right:64px;top:186px">
  <div class="h1" style="font-size:176px;line-height:.95">1946</div>
  <div class="h1" style="font-size:47px;line-height:1.12;margin-top:22px">Автобус, у которого<br>
    дизель <em>не крутил колёса</em></div>
</div>
{labels}
<div class="foot"><span class="label">гибрид из Москвы</span></div>
</div>'''
    css = ".node{position:absolute;top:1062px;width:300px;text-align:center;font-size:28px;color:var(--text-2)}"
    return page_html(body, css)


# ---------------------------------------------------------------- 005 опрос: районы
CITY = (540, 790, 440)   # «город» — мягкий диск; ни одна линия не проходит через подписи
SPOTS = [
    # x, y, подпись, сторона подписи, готово ли дело
    (560, 912, "ЗИЛАРТ", "left", True),
    (548, 728, "Красная площадь", "right", False),
    (652, 792, "Китай-город", "right", False),
    (400, 684, "Арбат", "left", False),
    (664, 644, "Чистые пруды", "right", False),
    (716, 1104, "Коломенское", "left", False),
    (610, 466, "ВДНХ", "right", False),
]
RIVER = ("M60 706 C230 724 300 806 420 806 C520 806 560 818 600 842 "
         "C684 892 556 962 640 1012 C724 1062 820 1040 1020 1140")


def art_005():
    cx, cy, r = CITY
    dots, labels = [], []
    for (x, y, name, side, ready) in SPOTS:
        if ready:
            dots.append(f'<circle cx="{x}" cy="{y}" r="110" fill="url(#glow)" opacity=".4"/>'
                        f'<circle cx="{x}" cy="{y}" r="20" fill="#FFC53D"/>')
        else:
            dots.append(f'<circle cx="{x}" cy="{y}" r="13" fill="#0E1630" stroke="#8FC2FF" '
                        f'stroke-width="4"/>')
        anchor = "start" if side == "right" else "end"
        tx = x + 34 if side == "right" else x - 34
        labels.append(f'<text x="{tx}" y="{y + 11}" text-anchor="{anchor}" '
                      f'fill="{"#F3F1EA" if ready else "#D5D9E6"}" font-family="Golos" font-size="32" '
                      f'font-weight="{700 if ready else 500}">{name}</text>')
    return f'''<svg class="art" viewBox="0 0 {W} {H}" width="{W}" height="{H}" aria-hidden="true">
<defs>{SKY}{GLOW}
<clipPath id="city"><circle cx="{cx}" cy="{cy}" r="{r}"/></clipPath>
<radialGradient id="disc"><stop offset="0" stop-color="#24346E"/><stop offset=".8" stop-color="#1A2858"/>
  <stop offset="1" stop-color="#16224C"/></radialGradient></defs>
<rect width="{W}" height="{H}" fill="url(#sky)"/>
{stars(41, 30, 1330, avoid=[TOPBAR, (40, 150, 1040, 340), (cx - r - 12, cy - r - 12, cx + r + 12, cy + r + 12), (40, 1240, 1040, 1310)])}
<circle cx="{cx}" cy="{cy}" r="{r}" fill="url(#disc)"/>
<g clip-path="url(#city)">
  <path d="{RIVER}" fill="none" stroke="#3B4F99" stroke-width="28" stroke-linecap="round"/>
  <path d="{RIVER}" fill="none" stroke="#8FC2FF" stroke-width="4" opacity=".45"/>
</g>
{"".join(dots)}{"".join(labels)}
</svg><div class="vig" style="opacity:.6"></div>'''


def html_005():
    body = f'''<div class="frame">{art_005()}
<div class="top">{WORDMARK}<span class="label">опрос</span></div>
<div style="position:absolute;left:64px;right:64px;top:160px">
  <div class="h1" style="font-size:70px;line-height:1.06">Куда пойдём<br><em>дальше</em>?</div>
</div>
<div class="foot"><span class="label"><b>●</b> дело готово &nbsp; ○ в работе</span></div>
</div>'''
    return page_html(body)


SCENES = {
    "001": ("001-znakomstvo.png", html_001),
    "002": ("002-zagadka-fonar.png", html_002),
    "003": ("003-otvet-fonar.png", html_003),
    "004": ("004-fakt-zis-154.png", html_004),
    "005": ("005-opros-rayon.png", html_005),
}


def main(argv):
    keys = [a for a in argv if a in SCENES] or list(SCENES)
    IMG.mkdir(parents=True, exist_ok=True)
    faces = [[fam, w] for fam, _, weights in FACES for w in weights]
    failed = False
    with sync_playwright() as pw:
        browser = pw.chromium.launch()
        page = browser.new_page(viewport={"width": W, "height": H}, device_scale_factor=1)
        # никаких внешних запросов: всё, что не data:/about:/file://, обрывается
        page.route("**/*", lambda route: route.continue_()
                   if route.request.url.startswith(("file://", "data:", "about:"))
                   else route.abort())
        for key in keys:
            name, builder = SCENES[key]
            page.set_content(builder(), wait_until="load")
            problems = page.evaluate(FONT_CHECK_JS, faces)
            if problems:
                failed = True
                print(f"ОШИБКА {name}: шрифт бренда не применён — картинка не сохранена:")
                for p in problems:
                    print(f"  - {p}")
                continue
            page.wait_for_timeout(150)
            page.screenshot(path=str(IMG / name), type="png")
            print(f"{IMG / name}  (шрифты проверены)")
        browser.close()
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))

#!/usr/bin/env python3
"""OG-картинки дел (превью ссылки в мессенджерах и соцсетях) из данных дела — T-121 / H-96.

    python3 scripts/make_og.py            # перерисовать устаревшие
    python3 scripts/make_og.py --all      # перерисовать все
    python3 scripts/make_og.py --check    # только проверить: 0 — всё свежее, 1 — что-то устарело

Источник — platform/site/cases/c*.py: номер, название, где (where_po), вопрос дела (card.ask), цифры (card.meta), тема.
OG рисуется у дела, чей og_image лежит в /assets/og/ и это не общий main.png. Шаблон — HTML 1200×630 в стиле темы
дела (шрифты сайта встраиваются data:-адресами, сеть закрыта), снимок — Chromium (Playwright), PNG ≤ 300 КБ.
У тем с иллюстрированной обложкой (№2, №4–7: THEMES[...]['art']) обложка дела стоит справа в рамке темы, как на первом
экране дела; её хеш — во входе OG (перерисовали обложку — OG устарел). Новая тема — запись в THEMES (токены из case.css).
Сменить имя файла OG (zilart.png → zilart-v2.png) — способ сбросить кеш превью в Telegram; старая запись манифеста уходит сама.
Учёт — platform/site/og-manifest.json: что нарисовано (текст), хеш входа и хеш файла. site_check сверяет его с карточкой
дела и с файлом: правка card.meta без перерисовки или подмена картинки руками — красная проверка.
Почему не руками: OG ЗИЛАРТа неделю показывал «12 точек · 2,8 км · от 7 лет», а витрина уже говорила другое.
Читаемость (H-114): превью в мессенджере на телефоне — около 600 px шириной, вдвое меньше шаблона. Самый мелкий текст OG
на 600 px — не меньше 11 px (в шаблоне 1200 — 22 px); мельче — ошибка с подсказкой сократить строку, а не уменьшать шрифт.
Замер пишется в манифест (min_px_600); --check и site_check краснеют, если его нет или он меньше порога.
"""
import base64
import hashlib
import html
import json
import os
import re
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import build_cases as bc  # noqa: E402

REPO = bc.REPO
OG_DIR = os.path.join(bc.SITE, 'assets', 'og')
FONTS = os.path.join(bc.SITE, 'assets', 'fonts')
MANIFEST = os.path.join(REPO, 'platform', 'site', 'og-manifest.json')
TEMPLATE_VERSION = 3  # сменили шаблон — поднять, и все OG перерисуются
MAX_BYTES = 300 * 1024
W, H = 1200, 630
PREVIEW_W, MIN_PX = 600, 11  # H-114: текст превью шириной 600 px — не мельче 11 px


def plain(s):
    """Текст без разметки и &nbsp; — так его и сверяет site_check."""
    s = re.sub(r'<[^>]+>', '', s or '')
    return re.sub(r'\s+', ' ', html.unescape(s).replace(' ', ' ')).strip()


def og_file(c):
    """Имя файла OG дела или None (у дела общий main.png)."""
    url = c.get('og_image') or ''
    m = re.match(re.escape(bc.ORIGIN) + r'/assets/og/([\w.-]+\.(?:png|jpg))$', url)
    return m.group(1) if m and m.group(1) != 'main.png' else None


def nbsp(s):
    """Короткие слова не висят в конце строки: «в\u00a0овраге»."""
    return re.sub(r'(^|\s)([А-Яа-яЁё]{1,2})\s', lambda m: m.group(1) + m.group(2) + '\u00a0', s)


def og_input(c):
    k = c['card']
    inp = {
        'no': c['no'], 'slug': c['slug'], 'theme': c['theme'], 'title': nbsp(plain(c['title'])),
        'where': plain('Квест-прогулка ' + c['where_po'] + ' без гида'),
        'ask': plain(k.get('ask', '')), 'meta': plain(k['meta']), 'template': TEMPLATE_VERSION,
    }
    art = THEMES.get(c['theme'], {}).get('art')
    if art:  # обложка дела на OG: перерисовали обложку — OG устарел
        with open(os.path.join(REPO, art), 'rb') as fh:
            inp['art'] = sha(fh.read())[:16]
    return inp


def sha(b):
    return hashlib.sha256(b).hexdigest()


def input_hash(inp):
    return sha(json.dumps(inp, ensure_ascii=False, sort_keys=True).encode())


def font_face(family, file, weight, style='normal'):
    with open(os.path.join(FONTS, file), 'rb') as fh:
        data = base64.b64encode(fh.read()).decode()
    return (f"@font-face{{font-family:'{family}';font-weight:{weight};font-style:{style};"
            f"src:url(data:font/woff2;base64,{data}) format('woff2');}}")


def art_img(rel):
    """Обложка дела (SVG из репозитория) — data:-адресом: сеть закрыта, id внутри SVG ни с чем не столкнутся."""
    with open(os.path.join(REPO, rel), encoding='utf-8') as fh:
        svg = fh.read()
    if 'xmlns=' not in svg.split('>', 1)[0]:  # фрагмент для вставки в страницу — отдельной картинке нужен xmlns
        svg = svg.replace('<svg', '<svg xmlns="http://www.w3.org/2000/svg"', 1)
    data = base64.b64encode(svg.encode()).decode()
    return f'<img class="art" src="data:image/svg+xml;base64,{data}" alt="">'


def ff(family, slug, weight, style='normal'):
    """Шрифт сайта, кириллица + латиница: ff('PT Serif', 'pt-serif', 700)."""
    sfx = '-italic' if style == 'italic' else ''
    return [(family, f'{slug}-{sub}-{weight}{sfx if sfx else "-normal"}.woff2', weight, style) for sub in ('cyrillic', 'latin')]


# Дела с обложкой-иллюстрацией (№2, №4–7): обложка справа в рамке темы, как на первом экране дела; заголовок слева уже
ART_BOX = """
.art{position:absolute;display:block;z-index:1;object-fit:contain}
h1{max-width:620px}
"""


# Темы: шрифты и цвета — из site/assets/case.css (токены body.case-page.t-*), декор — как у первого экрана дела
THEMES = {
    'avangard': {
        'fonts': [('Oswald', 'oswald-cyrillic-700-normal.woff2', 700), ('Oswald', 'oswald-latin-700-normal.woff2', 700),
                  ('Onest', 'onest-cyrillic-500-normal.woff2', 500), ('Onest', 'onest-latin-500-normal.woff2', 500),
                  ('Caveat', 'caveat-cyrillic-700-normal.woff2', 700), ('Caveat', 'caveat-latin-700-normal.woff2', 700)],
        'css': """
body{background:#F2EFE8;color:#141414;font-family:Onest}
.brand{font-family:Oswald;font-weight:700;font-size:34px;letter-spacing:.04em;text-transform:uppercase}
h1{font-family:Oswald;font-weight:700;text-transform:uppercase;font-size:96px;line-height:1.02;letter-spacing:.01em;max-width:760px}
.ask{font-family:Caveat;font-weight:700;font-size:56px;color:#B81D14;transform:rotate(-2deg);transform-origin:left center}
.where{font-size:26px;color:#3A3631}
.meta{font-size:30px;font-weight:500}
.d1{position:absolute;right:-110px;top:-150px;width:520px;height:520px;border-radius:50%;background:#E1251B}
.d2{position:absolute;right:96px;bottom:70px;width:96px;height:96px;background:#141414;transform:rotate(-16deg)}
.d3{position:absolute;right:250px;bottom:205px;width:300px;height:14px;background:#141414;transform:rotate(-24deg)}
""",
        'decor': '<div class="d1"></div><div class="d3"></div><div class="d2"></div>',
    },
    'tuman': {
        'fonts': [('Alegreya', 'alegreya-cyrillic-700-normal.woff2', 700), ('Alegreya', 'alegreya-latin-700-normal.woff2', 700),
                  ('Alegreya Sans', 'alegreya-sans-cyrillic-500-normal.woff2', 500), ('Alegreya Sans', 'alegreya-sans-latin-500-normal.woff2', 500),
                  ('Neucha', 'neucha-cyrillic-400-normal.woff2', 400), ('Neucha', 'neucha-latin-400-normal.woff2', 400)],
        'css': """
body{background:linear-gradient(180deg,#17201C 0%,#22302A 62%,#31423A 100%);color:#EEF1EC;font-family:'Alegreya Sans'}
.brand{font-family:Alegreya;font-weight:700;font-size:34px;letter-spacing:.02em}
h1{font-family:Alegreya;font-weight:700;font-size:96px;line-height:1.0;max-width:900px}
.ask{font-family:Neucha;font-size:54px;color:#B4C69A;transform:rotate(-2deg);transform-origin:left center}
.where{font-size:28px;color:#C9D3CB}
.meta{font-size:32px;font-weight:500;color:#EEF1EC}
.hill{position:absolute;inset:0;width:100%;height:100%}
.fog{position:absolute;left:-30%;width:160%;border-radius:50%;background:radial-gradient(ellipse at center,rgba(221,227,221,.30),rgba(221,227,221,0) 70%);filter:blur(6px)}
.f1{bottom:-30px;height:150px}.f2{bottom:110px;height:90px;opacity:.6}
.moon{position:absolute;right:110px;top:84px;width:56px;height:56px;border-radius:50%;background:#DDE3DD;opacity:.85;box-shadow:0 0 60px 20px rgba(221,227,221,.18)}
""",
        'decor': '<div class="moon"></div><svg class="hill" viewBox="0 0 1200 630" aria-hidden="true">'
                 # белая шатровая церковь Вознесения на холме над рекой (как на обложке дела case-03.svg), силуэтом
                 '<path d="M0 560 Q300 505 640 522 Q840 500 880 474 L1060 474 Q1120 486 1200 492 V630 H0z" fill="#2A3A33"/>'
                 '<g fill="#C9D3CB" opacity=".72"><rect x="892" y="444" width="156" height="32"/><rect x="930" y="372" width="80" height="74"/>'
                 '<circle cx="943" cy="374" r="13"/><circle cx="970" cy="370" r="15"/><circle cx="997" cy="374" r="13"/>'
                 '<rect x="944" y="318" width="52" height="56"/><path d="M944 320 L970 176 L996 320z"/><rect x="965" y="156" width="10" height="22"/>'
                 '<circle cx="970" cy="150" r="8"/><rect x="968.5" y="118" width="3" height="26"/><rect x="962" y="126" width="16" height="3"/></g>'
                 '<path d="M0 600 Q300 560 640 585 T1200 560 V630 H0z" fill="#17201C"/></svg>'
                 '<div class="fog f2"></div><div class="fog f1"></div>',
    },
    # №2 Чистые пруды — «Гравюра»: бумага, медь, двойная рамка гравюры; обложка — Меншикова башня (fragments/chistye-hero.svg)
    'gravura': {
        'art': 'platform/site/cases/fragments/chistye-hero.svg',
        'fonts': ff('Cormorant Garamond', 'cormorant-garamond', 700) + ff('PT Serif', 'pt-serif', 400) + ff('Caveat', 'caveat', 700),
        'css': ART_BOX + """
body{background:#EFE2C4;background-image:radial-gradient(ellipse at 20% 0%,rgba(255,250,235,.7),transparent 55%),repeating-linear-gradient(-38deg,rgba(42,26,14,.035) 0 1px,transparent 1px 6px);color:#2A1A0E;font-family:'PT Serif'}
.frame{position:absolute;inset:22px;border:4px double #B79A6A;pointer-events:none}
.brand{font-family:'Cormorant Garamond';font-weight:700;font-size:38px;letter-spacing:.02em}
h1{font-family:'Cormorant Garamond';font-weight:700;font-size:92px;line-height:.98;max-width:660px}
.ask{font-family:Caveat;font-weight:700;font-size:56px;color:#8E3E1A;transform:rotate(-2deg);transform-origin:left center}
.where{font-size:25px;color:#4A3320}
.meta{font-size:29px;color:#2A1A0E}
.art{right:92px;top:58px;width:318px;height:389px;padding:12px;background:#F6ECD4;border:1px solid #B79A6A;box-shadow:0 0 0 6px #F6ECD4,0 0 0 7px #B79A6A,0 20px 40px -20px rgba(42,26,14,.5)}
.seal{position:absolute;right:62px;top:404px;width:84px;height:84px;border-radius:50%;z-index:2;background:radial-gradient(circle at 35% 35%,#C2462A,#7E2412 70%);box-shadow:0 4px 10px rgba(0,0,0,.35)}
.seal::after{content:"";position:absolute;inset:18px;border-radius:50%;border:2px solid rgba(255,220,200,.45)}
""",
        'decor': '<div class="frame"></div>{{art}}<div class="seal"></div>',
    },
    # №4 Красная площадь — «Синька-чертёж»: лазурь, сетка, золото, Oswald; обложка — обмерный чертёж (hero-krasnaya.svg)
    'chertezh': {
        'art': 'site/assets/ill/hero-krasnaya.svg',
        'fonts': ff('Oswald', 'oswald', 700) + ff('Golos Text', 'golos-text', 500) + ff('Neucha', 'neucha', 400),
        'css': ART_BOX + """
body{background-color:#0E3463;background-image:radial-gradient(900px 520px at 82% -120px,rgba(233,178,76,.18),transparent 60%),linear-gradient(rgba(255,255,255,.085) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,.085) 1px,transparent 1px),linear-gradient(rgba(233,178,76,.06) 1px,transparent 1px),linear-gradient(90deg,rgba(233,178,76,.06) 1px,transparent 1px);background-size:auto,32px 32px,32px 32px,160px 160px,160px 160px;background-repeat:no-repeat,repeat,repeat,repeat,repeat;color:#EAF2FA;font-family:'Golos Text'}
.brand{font-family:Oswald;font-weight:700;font-size:34px;letter-spacing:.04em;text-transform:uppercase}
h1{font-family:Oswald;font-weight:700;text-transform:uppercase;font-size:92px;line-height:1.1;letter-spacing:.02em;max-width:600px}
.ask{font-family:Neucha;font-size:54px;color:#F9C6AC;transform:rotate(-2deg);transform-origin:left center}
.where{font-size:25px;color:#C9DBEE}
.meta{font-size:29px;font-weight:500;color:#EAF2FA}
.art{right:64px;top:64px;width:440px;height:330px;border:1.5px solid rgba(233,178,76,.75);padding:8px;background:rgba(255,255,255,.04);box-shadow:0 18px 40px -18px rgba(0,0,0,.7)}
.dim{position:absolute;right:64px;top:412px;width:440px;height:20px;z-index:1}
""",
        'decor': '{{art}}<svg class="dim" viewBox="0 0 440 20" aria-hidden="true"><g stroke="#E9B24C" stroke-width="1.5" fill="#E9B24C">'
                 '<path d="M1 2v16M439 2v16M8 10H432" fill="none"/><path d="M2 10l12-5v10zM438 10l-12-5v10z" stroke="none"/></g></svg>',
    },
    # №5 Китай-город — «Оттиск»: кремовая бумага, чёрная краска, киноварь; обложка — гравюра с единорогом (hero-kitay.svg)
    'nabor': {
        'art': 'site/assets/ill/hero-kitay.svg',
        'fonts': ff('PT Serif', 'pt-serif', 700) + ff('Alegreya', 'alegreya', 500) + ff('Caveat', 'caveat', 700),
        'css': ART_BOX + """
body{background:#F1E6CF;background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='200' height='200'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.04 .9' numOctaves='2' stitchTiles='stitch'/%3E%3CfeColorMatrix values='0 0 0 0 .45 0 0 0 0 .32 0 0 0 0 .16 0 0 0 .14 0'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E");color:#1C1712;font-family:Alegreya}
.brand{font-family:'PT Serif';font-weight:700;font-size:34px;padding-bottom:6px;border-bottom:4px double #1C1712;align-self:flex-start}
h1{font-family:'PT Serif';font-weight:700;font-size:84px;line-height:1.04;letter-spacing:-.01em;text-shadow:3px 2px 0 rgba(184,50,29,.35);max-width:600px}
.ask{font-family:Caveat;font-weight:700;font-size:56px;color:#B8321D;transform:rotate(-2deg);transform-origin:left center}
.where{font-size:26px;color:#3B322A}
.meta{font-size:30px;font-weight:500;color:#1C1712}
.art{right:76px;top:74px;width:420px;height:315px;border:6px solid #1C1712;outline:1.5px solid #1C1712;outline-offset:6px;box-shadow:14px 14px 0 #B8321D}
""",
        'decor': '{{art}}',
    },
    # №6 Арбат — «Театр»: бархат, золото, ламбрекен, ромбы арлекина; обложка — сцена с принцессой (hero-arbat.svg)
    'teatr': {
        'art': 'site/assets/ill/hero-arbat.svg',
        'fonts': ff('Cormorant Garamond', 'cormorant-garamond', 700) + ff('Alegreya Sans', 'alegreya-sans', 500) + ff('Caveat', 'caveat', 700),
        'css': ART_BOX + """
body{background:radial-gradient(ellipse at 70% 30%,rgba(212,168,75,.18),transparent 55%),linear-gradient(180deg,#2A0F18,#170A10);color:#F6EBD7;font-family:'Alegreya Sans'}
.valance{position:absolute;left:0;right:0;top:0;height:48px;z-index:3;background:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='130' height='48' viewBox='0 0 130 48'%3E%3Cpath d='M0 0H130V6Q65 50 0 6Z' fill='%237A1728'/%3E%3Cpath d='M22 0Q65 30 108 0Z' fill='%235A0E1A'/%3E%3Cpath d='M0 9Q65 53 130 9' fill='none' stroke='%23D4A84B' stroke-width='6' stroke-dasharray='1.6 3.2' opacity='.9'/%3E%3Cpath d='M0 6Q65 50 130 6' fill='none' stroke='%23E7C27A' stroke-width='2.5'/%3E%3Cpath d='M0 0v22M130 0v22' stroke='%23D4A84B' stroke-width='3'/%3E%3Cpath d='M-5 22h10l3 16h-16zM125 22h10l3 16h-16z' fill='%23D4A84B'/%3E%3C/svg%3E") center top/130px 48px repeat-x}
.harl{position:absolute;left:0;right:0;bottom:0;height:14px;background:conic-gradient(from 45deg,#7A2230 25%,#2E4A2E 0 50%,#7A2230 0 75%,#2E4A2E 0) 0 0/28px 14px;opacity:.8}
.box{top:74px!important;bottom:44px!important}
.brand{font-family:'Cormorant Garamond';font-weight:700;font-size:36px;letter-spacing:.06em;text-transform:uppercase;color:#E7C27A}
h1{font-family:'Cormorant Garamond';font-weight:700;font-size:84px;line-height:.98;letter-spacing:.03em;text-transform:uppercase;max-width:600px}
.ask{font-family:Caveat;font-weight:700;font-size:54px;color:#E7C27A;transform:rotate(-2deg);transform-origin:left center}
.where{font-size:26px;color:#E2D2B6}
.meta{font-size:30px;font-weight:500;color:#F6EBD7}
.art{right:72px;top:92px;width:420px;height:315px;border-radius:4px;border:2px solid #D4A84B;box-shadow:0 30px 60px -30px #000}
""",
        'decor': '<div class="valance"></div>{{art}}<div class="harl"></div>',
    },
    # №7 ВДНХ — «Открытка»: бирюза к кремовой бумаге, ультрамарин, курсив Alegreya; обложка — открытка с фонтаном (hero-vdnh.svg)
    'otkrytka': {
        'art': 'site/assets/ill/hero-vdnh.svg',
        'fonts': ff('Alegreya', 'alegreya', 500, 'italic') + ff('Onest', 'onest', 500) + ff('Caveat', 'caveat', 700),
        'css': ART_BOX + """
body{background:linear-gradient(180deg,#DCEEF0 0%,#F4EBD9 70%);color:#1E2A44;font-family:Onest}
.brand{font-family:Alegreya;font-style:italic;font-weight:500;font-size:36px;color:#1F4FA0}
h1{font-family:Alegreya;font-style:italic;font-weight:500;font-size:80px;line-height:1.02;max-width:600px}
.ask{font-family:Caveat;font-weight:700;font-size:56px;color:#B8432F;transform:rotate(-2deg);transform-origin:left center}
.where{font-size:25px;color:#3A4660}
.meta{font-size:29px;font-weight:500;color:#1E2A44}
.art{right:78px;top:70px;width:420px;height:315px;padding:12px;box-sizing:content-box;background:#FFFDF6;border-radius:6px;box-shadow:0 2px 0 rgba(30,42,68,.12),0 24px 40px -24px rgba(30,42,68,.5);transform:rotate(1.5deg)}
.stamp{position:absolute;right:56px;top:398px;width:150px;height:70px;z-index:2;transform:rotate(-8deg)}
""",
        'decor': '{{art}}<svg class="stamp" viewBox="0 0 150 70" aria-hidden="true"><g fill="none" stroke="#1F4FA0" stroke-width="2" opacity=".55">'
                 '<circle cx="35" cy="35" r="30"/><circle cx="35" cy="35" r="22"/><path d="M70 22q20-8 40 0t40 0M70 35q20-8 40 0t40 0M70 48q20-8 40 0t40 0"/></g></svg>',
    },
}


def page_html(inp):
    t = THEMES.get(inp['theme'])
    if not t:
        raise SystemExit(f'make_og: нет шаблона темы «{inp["theme"]}» (дело №{inp["no"]}) — добавить в THEMES')
    faces = ''.join(font_face(*f) for f in t['fonts'])
    decor = t['decor'].replace('{{art}}', art_img(t['art']) if t.get('art') else '')
    decor = re.sub(r'\{\{([\w-]+)\}\}', lambda m: bc.frag(m.group(1)), decor)
    e = html.escape
    return f"""<!doctype html><html lang="ru"><head><meta charset="utf-8"><style>{faces}
*{{margin:0;padding:0;box-sizing:border-box}}
html,body{{width:{W}px;height:{H}px;overflow:hidden}}
body{{position:relative}}
.box{{position:absolute;left:72px;top:60px;bottom:56px;right:72px;display:flex;flex-direction:column;z-index:2}}
.mid{{margin:auto 0;display:flex;flex-direction:column;gap:20px}}
.foot{{display:flex;flex-direction:column;gap:6px}}
{t['css']}</style></head><body>{decor}
<div class="box">
  <div class="brand">Дворами</div>
  <div class="mid"><h1>{e(inp['title'])}</h1><div class="ask">{e(inp['ask'])}</div></div>
  <div class="foot"><div class="where">{e(inp['where'])}</div><div class="meta">{e(inp['meta'])}</div></div>
</div></body></html>"""


def load_cases():
    files = sorted(f for f in os.listdir(bc.DATA) if re.match(r'c\d+_.*\.py$', f))
    return [bc.load(os.path.join(bc.DATA, f)) for f in files]


def load_manifest():
    try:
        with open(MANIFEST, encoding='utf-8') as fh:
            return json.load(fh)
    except FileNotFoundError:
        return {}


def stale(cases=None, manifest=None):
    """Дела, у которых OG устарел: вход изменился, файла нет или файл заменили руками."""
    cases = cases or load_cases()
    man = manifest if manifest is not None else load_manifest()
    out = []
    for c in cases:
        f = og_file(c)
        if not f:
            continue
        m = man.get(f)
        path = os.path.join(OG_DIR, f)
        if (not m or m.get('input_sha') != input_hash(og_input(c)) or not os.path.exists(path)
                or sha(open(path, 'rb').read()) != m.get('file_sha') or not readable(m)):
            out.append(c)
    return out


def readable(m):
    """H-114: в манифесте есть замер мелкого текста на превью 600 px и он не меньше порога."""
    v = (m or {}).get('min_px_600')
    return isinstance(v, (int, float)) and v >= MIN_PX


# самый мелкий текст страницы OG: [размер в px шаблона, текст, класс] — по элементам со своим текстом
SMALLEST_JS = """() => { let best = null;
  for (const el of document.querySelectorAll('body *')) {
    if (![...el.childNodes].some(n => n.nodeType === 3 && n.textContent.trim())) continue;
    const cs = getComputedStyle(el), r = el.getBoundingClientRect();
    if (cs.display === 'none' || cs.visibility === 'hidden' || !r.width) continue;
    const px = parseFloat(cs.fontSize);
    if (!best || px < best[0]) best = [px, el.textContent.trim().replace(/\\s+/g, ' ').slice(0, 60), String(el.className || el.tagName)];
  }
  return best; }"""


def render(cases):
    from playwright.sync_api import sync_playwright
    man = load_manifest()
    with sync_playwright() as p:
        browser = p.chromium.launch()
        page = browser.new_page(viewport={'width': W, 'height': H}, device_scale_factor=1)
        page.route('**/*', lambda r: r.abort() if not r.request.url.startswith(('data:', 'about:')) else r.continue_())
        for c in cases:
            f = og_file(c)
            inp = og_input(c)
            page.set_content(page_html(inp), wait_until='load')
            page.evaluate('document.fonts.ready')
            fams = sorted({(f[0], f[2], f[3] if len(f) > 3 else 'normal') for f in THEMES[inp['theme']]['fonts']})
            missing = page.evaluate("""async (fs) => { const out = [];
                for (const [fam, w, st] of fs) if (!(await document.fonts.load(`${st} ${w} 40px '${fam}'`, 'Дд')).length) out.push(fam);
                return out; }""", fams)
            used = page.evaluate("""() => { const b = document.querySelector('.box').getBoundingClientRect();
                const h = document.querySelector('h1').getBoundingClientRect(); return {over: document.querySelector('.box').scrollHeight > b.height + 1,
                lines: Math.round(h.height / parseFloat(getComputedStyle(document.querySelector('h1')).lineHeight))}; }""")
            if used['over']:
                raise SystemExit(f'make_og: дело №{c["no"]} — текст не помещается в 1200×630 (сократить title/ask/meta)')
            if missing:  # любой шрифт темы не встал — снимок с запасным шрифтом не выпускаем
                raise SystemExit(f'make_og: не загрузились шрифты {missing}')
            px, txt, cls = page.evaluate(SMALLEST_JS)
            px600 = round(px * PREVIEW_W / W, 1)
            if px600 < MIN_PX:  # H-114: мелкий текст на превью в мессенджере не читается
                raise SystemExit(f'make_og: дело №{c["no"]} — «{txt}» (.{cls}) на превью {PREVIEW_W} px будет {px600} px '
                                 f'(нужно ≥ {MIN_PX}): сократите строку в card (title/ask/meta) или where_po, а не уменьшайте шрифт')
            path = os.path.join(OG_DIR, f)
            if f.endswith('.jpg'):
                page.screenshot(path=path, type='jpeg', quality=88)
            else:
                page.screenshot(path=path, type='png')
                try:  # PNG без потерь, только пережать: палитра 256 цветов почти всегда влезает в 300 КБ
                    from PIL import Image
                    im = Image.open(path)
                    if os.path.getsize(path) > MAX_BYTES:
                        im.convert('RGB').quantize(256, method=Image.Quantize.MEDIANCUT, dither=Image.Dither.NONE).save(path, optimize=True)
                    else:
                        im.save(path, optimize=True)
                except ImportError:
                    pass
            size = os.path.getsize(path)
            if size > MAX_BYTES:
                raise SystemExit(f'make_og: {f} — {size // 1024} КБ > 300 КБ')
            man[f] = {'slug': c['slug'], 'input': inp, 'input_sha': input_hash(inp), 'file_sha': sha(open(path, 'rb').read()),
                      'min_px_600': px600}
            print(f'→ site/assets/og/{f} ({size // 1024} КБ, заголовок в {used["lines"]} стр., мелкий текст на 600 px — {px600} px): {inp["meta"]}')
        browser.close()
    keep = {og_file(c) for c in load_cases()}  # переименовали OG (zilart.png → zilart-v2.png) — старая запись уходит
    man = {f: v for f, v in man.items() if f in keep}
    with open(MANIFEST, 'w', encoding='utf-8') as fh:
        json.dump(dict(sorted(man.items())), fh, ensure_ascii=False, indent=1)
        fh.write('\n')


def main():
    cases = load_cases()
    if '--check' in sys.argv:
        s = stale(cases)
        man = load_manifest()
        for c in s:
            why = 'без замера мелкого текста на 600 px (H-114)' if not readable(man.get(og_file(c))) else 'устарел'
            print(f'make_og: OG дела №{c["no"]} ({og_file(c)}) {why} — python3 scripts/make_og.py')
        sys.exit(1 if s else 0)
    todo = [c for c in cases if og_file(c)] if '--all' in sys.argv else stale(cases)
    if not todo:
        print('make_og: все OG свежие')
        return
    render(todo)


if __name__ == '__main__':
    main()

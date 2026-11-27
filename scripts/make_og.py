#!/usr/bin/env python3
"""OG-картинки дел (превью ссылки в мессенджерах и соцсетях) из данных дела — T-121 / H-96.

    python3 scripts/make_og.py            # перерисовать устаревшие
    python3 scripts/make_og.py --all      # перерисовать все
    python3 scripts/make_og.py --check    # только проверить: 0 — всё свежее, 1 — что-то устарело

Источник — platform/site/cases/c*.py: номер, название, где (where_po), вопрос дела (card.ask), цифры (card.meta), тема.
OG рисуется у дела, чей og_image лежит в /assets/og/ и это не общий main.png. Шаблон — HTML 1200×630 в стиле темы
дела (шрифты сайта встраиваются data:-адресами, сеть закрыта), снимок — Chromium (Playwright), PNG ≤ 300 КБ.
Учёт — platform/site/og-manifest.json: что нарисовано (текст), хеш входа и хеш файла. site_check сверяет его с карточкой
дела и с файлом: правка card.meta без перерисовки или подмена картинки руками — красная проверка.
Почему не руками: OG ЗИЛАРТа неделю показывал «12 точек · 2,8 км · от 7 лет», а витрина уже говорила другое.
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
    return {
        'no': c['no'], 'slug': c['slug'], 'theme': c['theme'], 'title': nbsp(plain(c['title'])),
        'where': plain('Квест-прогулка ' + c['where_po'] + ' без гида'),
        'ask': plain(k.get('ask', '')), 'meta': plain(k['meta']), 'template': TEMPLATE_VERSION,
    }


def sha(b):
    return hashlib.sha256(b).hexdigest()


def input_hash(inp):
    return sha(json.dumps(inp, ensure_ascii=False, sort_keys=True).encode())


def font_face(family, file, weight):
    with open(os.path.join(FONTS, file), 'rb') as fh:
        data = base64.b64encode(fh.read()).decode()
    return (f"@font-face{{font-family:'{family}';font-weight:{weight};font-style:normal;"
            f"src:url(data:font/woff2;base64,{data}) format('woff2');}}")


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
}


def page_html(inp):
    t = THEMES.get(inp['theme'])
    if not t:
        raise SystemExit(f'make_og: нет шаблона темы «{inp["theme"]}» (дело №{inp["no"]}) — добавить в THEMES')
    faces = ''.join(font_face(*f) for f in t['fonts'])
    decor = re.sub(r'\{\{([\w-]+)\}\}', lambda m: bc.frag(m.group(1)), t['decor'])
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
                or sha(open(path, 'rb').read()) != m.get('file_sha')):
            out.append(c)
    return out


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
            missing = page.evaluate("""() => [...document.fonts].filter(f => f.status !== 'loaded').map(f => f.family)""")
            used = page.evaluate("""() => { const b = document.querySelector('.box').getBoundingClientRect();
                const h = document.querySelector('h1').getBoundingClientRect(); return {over: document.querySelector('.box').scrollHeight > b.height + 1,
                lines: Math.round(h.height / parseFloat(getComputedStyle(document.querySelector('h1')).lineHeight))}; }""")
            if used['over']:
                raise SystemExit(f'make_og: дело №{c["no"]} — текст не помещается в 1200×630 (сократить title/ask/meta)')
            if missing and any(m in ('Oswald', 'Alegreya') for m in missing):
                raise SystemExit(f'make_og: не загрузились шрифты {missing}')
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
            man[f] = {'slug': c['slug'], 'input': inp, 'input_sha': input_hash(inp), 'file_sha': sha(open(path, 'rb').read())}
            print(f'→ site/assets/og/{f} ({size // 1024} КБ, заголовок в {used["lines"]} стр.): {inp["meta"]}')
        browser.close()
    with open(MANIFEST, 'w', encoding='utf-8') as fh:
        json.dump(dict(sorted(man.items())), fh, ensure_ascii=False, indent=1)
        fh.write('\n')


def main():
    cases = load_cases()
    if '--check' in sys.argv:
        s = stale(cases)
        for c in s:
            print(f'make_og: OG дела №{c["no"]} ({og_file(c)}) устарел — python3 scripts/make_og.py')
        sys.exit(1 if s else 0)
    todo = [c for c in cases if og_file(c)] if '--all' in sys.argv else stale(cases)
    if not todo:
        print('make_og: все OG свежие')
        return
    render(todo)


if __name__ == '__main__':
    main()

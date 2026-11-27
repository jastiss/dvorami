#!/usr/bin/env python3
"""Сборка страниц дел: site/moscow/<slug>/index.html из platform/site/cases/c*.py.

Один шаблон на все дела — одинаковые блоки, порядок, подписи и кнопки (указание владельца 22.11:
«структура, наполнение и слова на кнопках — всегда одинаково»). Фирменный стиль дела задаёт тема
(body.case.t-<тема> в site/assets/case.css), её картинки и артефакт сюжета.

Порядок блоков (id секций, их проверяет scripts/site_check.js):
  top · facts · story · cast · spots · learn · how · world · practical · about-place · faq · buy · sources

Новое дело = новый файл данных platform/site/cases/cN_<район>.py + запуск:  python3 scripts/build_cases.py
Карточки дел в каталогах (site/index.html и site/moscow/index.html, между метками cards:start / cards:end)
собираются здесь же из поля card дела — руками их не править.
"""
import html
import json
import os
import re
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.dirname(HERE)
DATA = os.path.join(REPO, 'platform', 'site', 'cases')
FRAG = os.path.join(DATA, 'fragments')
SITE = os.path.join(REPO, 'site')
ORIGIN = 'https://dvorami.ru'
TG = 'https://t.me/dvorami_quest'
MAIN_CTA = 'Взять дело'
# T-78 (H-26): ответ на вопрос «сколько нас может играть» — там, где человек выбирает, сколько платить:
# блок покупки страницы дела (#buy) и FAQ. На карточках каталога и в первом экране дела его нет (владелец 25.11:
# «зачем на каждой карточке… было красивее»; site_check ловит). Числа «до N человек» нет: код не ограничивает
# ни людей, ни телефоны (docs/codes.md, «Ограничения»); появится лимит — править здесь.
ONE_CODE = 'Один код&nbsp;— вся компания'
CARD_CTA = 'Подробнее о&nbsp;деле'  # если у дела нет card.ask (H-37: вопрос дела на кнопке)
RATINGS = os.path.join(SITE, 'assets', 'ratings.json')  # настоящие оценки игроков (scripts/build_ratings.py)
ONE_CODE_NOTE = 'Цена за&nbsp;дело, а&nbsp;не&nbsp;за&nbsp;человека. Играйте с&nbsp;одного телефона или введите код на&nbsp;нескольких.'

FONTS = {  # что нужно первому экрану темы — подгружаем заранее
    'avangard': ['onest-cyrillic-600-normal', 'oswald-cyrillic-700-normal', 'onest-cyrillic-400-normal', 'caveat-cyrillic-700-normal', 'unbounded-cyrillic-800-normal'],
    'gravura': ['pt-serif-cyrillic-700-normal', 'cormorant-garamond-cyrillic-700-normal', 'pt-serif-cyrillic-400-normal', 'caveat-cyrillic-700-normal', 'unbounded-cyrillic-800-normal'],
    'tuman': ['alegreya-sans-cyrillic-700-normal', 'alegreya-cyrillic-700-normal', 'alegreya-sans-cyrillic-400-normal', 'neucha-cyrillic-400-normal', 'unbounded-cyrillic-800-normal'],
    'chertezh': ['oswald-cyrillic-700-normal', 'golos-text-cyrillic-700-normal', 'golos-text-cyrillic-400-normal', 'neucha-cyrillic-400-normal', 'unbounded-cyrillic-800-normal'],
    'nabor': ['alegreya-cyrillic-700-normal', 'pt-serif-cyrillic-700-normal', 'alegreya-cyrillic-500-normal', 'caveat-cyrillic-700-normal', 'unbounded-cyrillic-800-normal'],
    'teatr': ['alegreya-sans-cyrillic-700-normal', 'cormorant-garamond-cyrillic-700-normal', 'alegreya-sans-cyrillic-400-normal', 'caveat-cyrillic-700-normal', 'unbounded-cyrillic-800-normal'],
    'otkrytka': ['onest-cyrillic-600-normal', 'alegreya-cyrillic-500-italic', 'onest-cyrillic-400-normal', 'caveat-cyrillic-700-normal', 'unbounded-cyrillic-800-normal'],
}
THEME_COLOR = {'avangard': '#141414', 'gravura': '#EFE2C4', 'tuman': '#17201C', 'chertezh': '#123E6E',
               'nabor': '#F1E6CF', 'teatr': '#170A10', 'otkrytka': '#F4EBD9'}

KICKERS = {  # рукописные названия блоков — одинаковые на всех делах
    'story': 'сюжет', 'cast': 'кто ведёт дело', 'spots': 'что увидите', 'learn': 'что узнаете по дороге',
    'how': 'как устроены загадки', 'world': 'вокруг дела', 'practical': 'что нужно знать',
    'about': 'справка о районе', 'faq': 'спрашивают', 'buy': 'взять дело',
}
STATUS = {'soon': 'Скоро в продаже', 'dev': 'В разработке'}
ON_SALE = {'sale'}  # статусы, при которых в JSON-LD есть Product и Offer (сейчас таких дел нет)

ARROW = '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M5 12h13M13 6.5l5.5 5.5-5.5 5.5" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>'
ARROW_L = '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M19 12H6M11 6.5 5.5 12l5.5 5.5" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>'
TG_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M21.5 3.6 2.9 10.8c-1.3.5-1.3 1.2-.2 1.5l4.7 1.5 1.8 5.6c.2.6.4.8.9.8.4 0 .6-.2.9-.5l2.3-2.2 4.7 3.5c.9.5 1.5.2 1.7-.8l3.1-14.6c.3-1.3-.5-1.9-1.3-1.5zM8.8 13.4l9.6-6c.5-.3.9-.1.5.2l-8 7.3-.3 3.4-1.8-4.9z" fill="currentColor"/></svg>'
LOGO = ('<svg viewBox="0 0 512 512" aria-hidden="true" focusable="false">'
        '<path class="logo-key" fill="currentColor" fill-rule="evenodd" d="M230.9 194.4L295.2 258.8L319.5 234.5L313.5 228.5L319.5 222.5L323.6 222.5L373.5 237.5L381.5 264L388.6 257.5L396.5 265.5L385.5 277.1L389.5 290.5L382.5 296.5L378.5 289.5L352.2 315.8L363.7 327.3L446.5 244.5L493.6 291.5L410.8 374.3L421.2 384.8L454.5 351.5L499.6 359.5L508.6 401.6L473.3 436.9L482.6 446.2A30.7 30.7 0 0 1 439.2 489.6L188.2 238.6A121.5 121.5 0 1 1 230.9 194.4ZM316 281L337 260L351 274L330 295ZM440 404L460.5 383.5L474.5 397.5L454 418ZM378.7 331.4L396.1 314L406.1 324L388.7 341.4ZM404.7 305.3L421.8 288.2L431.8 298.3L414.8 315.3ZM430.5 279.5L447 263L457.1 273L440.5 289.6ZM396.7 349.4L414.1 332L424.1 342L406.7 359.4ZM422.8 323.3L439.8 306.3L449.8 316.2L432.8 333.3ZM448.5 297.6L465.1 281L475 291L458.5 307.5Z"/>'
        '<circle class="logo-light" cx="124.9" cy="134.9" r="67.6" fill="#F9BD39"/></svg>')


def esc(s):
    return html.escape(s, quote=True)


def load_ratings():
    try:
        with open(RATINGS, encoding='utf-8') as fh:
            return json.load(fh)
    except (OSError, ValueError):
        return {'threshold': 5, 'cases': {}}


def plural(n, one, few, many):
    n = abs(n) % 100
    return many if 11 <= n <= 14 else one if n % 10 == 1 else few if 2 <= n % 10 <= 4 else many


def rating_of(slug, ratings):
    """(среднее, количество) по настоящим оценкам или None, пока оценок меньше порога (тогда ничего не показываем)."""
    row = ratings.get('cases', {}).get(slug) or {}
    n = row.get('count', 0)
    if n < ratings.get('threshold', 5) or n <= 0:
        return None
    return row['sum'] / n, n


def rating_html(slug, ratings):
    """Звёзды с сотыми: «4,86 · 37 оценок», заливка звёзд — доля от 5. Тот же вид рисует site.js из ratings.json."""
    got = rating_of(slug, ratings)
    if not got:
        return ''  # владелец 26.11: никаких «Новое дело» — до 5 одобренных оценок место пустое, статус «Скоро в продаже» остаётся
    avg, n = got
    v = f'{avg:.2f}'.replace('.', ',')
    return (f'<span class="stars" role="img" aria-label="Оценка {v} из 5" style="--w:{avg / 5 * 100:.1f}%"></span>'
            f'<span class="rating-v" aria-hidden="true">{v}</span>'
            f'<span class="rating-n">·&nbsp;{n}&nbsp;{plural(n, "оценка", "оценки", "оценок")}</span>')


def strip(s):
    return re.sub(r'\s+', ' ', re.sub(r'<[^>]+>', '', s.replace('&nbsp;', ' '))).strip()


def frag(name):
    with open(os.path.join(FRAG, name + '.svg'), encoding='utf-8') as f:
        return f.read()


def load(path):
    # Всегда из исходника, без __pycache__: импорт берёт старый .pyc, если правка в ту же секунду не поменяла размер файла
    # (ловили 27.11: «3 км» → «4 км» → «3 км» — собралось «4 км»)
    ns = {'__file__': path, '__name__': os.path.basename(path)[:-3]}
    with open(path, encoding='utf-8') as fh:
        exec(compile(fh.read(), path, 'exec'), ns)
    return ns['CASE']


def head(c):
    url = f"{ORIGIN}/moscow/{c['slug']}/"
    pre = '\n'.join(f'<link rel="preload" href="../../assets/fonts/{f}.woff2" as="font" type="font/woff2" crossorigin>' for f in FONTS[c['theme']])
    og = c.get('og_image', f"{ORIGIN}/assets/og/main.png")
    faq = [{'@type': 'Question', 'name': strip(q), 'acceptedAnswer': {'@type': 'Answer', 'text': strip(a)}} for q, a in c['faq']]
    trip = {
        '@type': 'TouristTrip', '@id': url + '#quest', 'name': f"{c['title']} — квест-прогулка {c['where_po']}",
        'description': strip(c['ld_description']), 'url': url, 'image': [og], 'inLanguage': 'ru',
        'provider': {'@id': ORIGIN + '/#org'},
        'touristType': ['Компании друзей', 'Пары', 'Семьи с детьми', 'Путешественники-одиночки'],
        'about': c['ld_about'],
        'itinerary': {'@type': 'ItemList', 'itemListOrder': 'https://schema.org/ItemListUnordered', 'numberOfItems': c['points'],
                      'itemListElement': [{'@type': 'ListItem', 'position': i + 1, 'item': p} for i, p in enumerate(c['ld_places'])]},
    }
    # Product/Offer — только когда дело продаётся (marketer.md, «SEO каждой… страницы», п. 5): Offer без возможности
    # купить — неправда для поисковика. Статус продажи добавит Инженер вместе с покупкой (STATUS, CARD_STATUS).
    if c['status'] in ON_SALE:
        trip['@type'] = ['TouristTrip', 'Product']
        trip['brand'] = {'@id': ORIGIN + '/#org'}
        trip['offers'] = {'@type': 'Offer', 'price': '990', 'priceCurrency': 'RUB', 'url': url,
                          'availability': 'https://schema.org/InStock',
                          'description': 'Цена за квест, один код доступа на всю компанию.',
                          'seller': {'@id': ORIGIN + '/#org'}}
    got = rating_of(c['slug'], load_ratings())
    if got and c['status'] in ON_SALE:  # только настоящие оценки и только от порога — как на карточке; рейтинг — свойство Product
        trip['aggregateRating'] = {'@type': 'AggregateRating', 'ratingValue': f'{got[0]:.2f}', 'ratingCount': got[1],
                                   'bestRating': 5, 'worstRating': 1}
    ld = {'@context': 'https://schema.org', '@graph': [
        {'@type': 'Organization', '@id': ORIGIN + '/#org', 'name': 'Дворами', 'url': ORIGIN + '/'},
        trip,
        {'@type': 'BreadcrumbList', 'itemListElement': [
            {'@type': 'ListItem', 'position': 1, 'name': 'Главная', 'item': ORIGIN + '/'},
            {'@type': 'ListItem', 'position': 2, 'name': 'Квесты по Москве', 'item': ORIGIN + '/moscow/'},
            {'@type': 'ListItem', 'position': 3, 'name': f"Дело №{c['no']} · {c['short']}", 'item': url}]},
        {'@type': 'FAQPage', '@id': url + '#faq', 'mainEntity': faq},
    ]}
    return f'''<!doctype html>
<html lang="ru">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{esc(c['meta_title'])}</title>
<meta name="description" content="{esc(c['meta_description'])}">
<!-- ТЕСТОВЫЙ СТЕНД: снять noindex при выкладке на боевой домен -->
<meta name="robots" content="noindex, nofollow">
<link rel="canonical" href="{url}">
<meta name="theme-color" content="{THEME_COLOR[c['theme']]}">
<link rel="icon" href="../../assets/favicon.svg" type="image/svg+xml">
<link rel="apple-touch-icon" href="../../assets/apple-touch-icon.png">
<meta property="og:type" content="website">
<meta property="og:site_name" content="Дворами">
<meta property="og:locale" content="ru_RU">
<meta property="og:title" content="{esc(c['title'])} — квест-прогулка {esc(c['where_po'])}">
<meta property="og:description" content="{esc(c['og_description'])}">
<meta property="og:url" content="{url}">
<meta property="og:image" content="{og}">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="{esc(c['title'])} — квест-прогулка {esc(c['where_po'])}">
<meta name="twitter:image" content="{og}">
{pre}
<link rel="stylesheet" href="../../assets/fonts.css">
<link rel="stylesheet" href="../../assets/style.css">
<link rel="stylesheet" href="../../assets/case.css">
<link rel="stylesheet" href="../../assets/case-media.css">
<script>document.documentElement.classList.add('js')</script>
<script type="application/ld+json">
{json.dumps(ld, ensure_ascii=False, indent=1)}
</script>
<script src="../../assets/analytics.js" defer></script>
</head>
'''


def sec_head(key, h2, hid, lead=None):
    s = f'<div class="c-head"><span class="c-kicker">{KICKERS[key]}</span><h2 id="{hid}" class="c-h">{h2}</h2>'
    if lead:
        s += f'<p class="c-lead">{lead}</p>'
    return s + '</div>'


def media_size(path):
    """Ширина и высота картинки для атрибутов img; без Pillow — пусто (страница соберётся и так)."""
    try:
        from PIL import Image
        with Image.open(path) as im:
            return f' width="{im.width}" height="{im.height}"'
    except Exception:
        return ''


def none_attrs(k):
    """Явные исключения единообразия сетки (scripts/card_grid_check.js, владелец 27.11: у двух карточек из восьми нет года):
    year_none / credit_none / art_none / photo_none: «почему» → data-year-none="…" и т. д. на карточке."""
    return ''.join(f' data-{f}-none="{esc(k[f + "_none"])}"' for f in ('year', 'credit', 'art', 'photo') if k.get(f + '_none'))


def world_card(k):
    """Карточка «вокруг дела» из данных (world.cards — вместо сырого world.html):
      yr | year_none, title, text, credit | credit_none, art {file, alt, credit[, fit]} | art_none.
    Слот картинки — вверху карточки, кадр 4:3 (case-media.css): репродукция вписывается целиком (fit 'contain', по умолчанию —
    картины не кадрируем), снимок места — 'cover'. Файл — site/assets/art/<дело>/<файл>.jpg (1200×900, JPEG); пока его нет,
    карточка такая же, как без картинки. Под картинкой — подпись-атрибуция art.credit: автор, лицензия, источник
    (team/std/images.md); без неё сборка падает. p.credit — источник самой карточки (где хранится работа, ссылка)."""
    art, fig, cls = k.get('art'), '', 'c-world-card'
    if art and os.path.exists(os.path.join(SITE, 'assets', 'art', art['file'])):
        if not art.get('credit'):
            raise SystemExit(f'world.cards «{strip(k["title"])}»: у картинки {art["file"]} нет art.credit (автор, лицензия, источник)')
        size = media_size(os.path.join(SITE, 'assets', 'art', art['file'])) or ' width="1200" height="900"'
        fit = ' c-world-fig--cover' if art.get('fit') == 'cover' else ''
        fig = (f'<figure class="c-world-fig{fit}"><img class="c-world-art" src="../../assets/art/{art["file"]}" alt="{esc(art["alt"])}"'
               f'{size} loading="lazy" decoding="async"><figcaption class="c-credit">{art["credit"]}</figcaption></figure>')
        cls += ' has-art'
    yr = f'<span class="yr">{k["yr"]}</span>' if k.get('yr') else ''
    credit = f'<p class="credit">{k["credit"]}</p>' if k.get('credit') else ''
    return f'<article class="{cls}"{none_attrs(k)}>{fig}{yr}<h3>{k["title"]}</h3><p>{k["text"]}</p>{credit}</article>'


def world_block(w):
    if w.get('cards'):
        return '<div class="c-world-grid">\n' + '\n'.join(world_card(k) for k in w['cards']) + '\n</div>'
    return world_html(w['html'])


def world_html(html):
    """Карточки «вокруг дела» сырым HTML (дела, ещё не переведённые на world.cards): data-art="<дело>/<файл>.jpg"
    превращается в картинку, только если файл лежит в site/assets/art/. Подпись с владельцем и правами — в p.credit
    самой карточки (team/std/images.md)."""
    def sub(m):
        rel, alt = m.group(1), m.group(2)
        path = os.path.join(SITE, 'assets', 'art', rel)
        if not os.path.exists(path):
            return '<article class="c-world-card">'
        return (f'<article class="c-world-card has-art"><img class="c-world-art" src="../../assets/art/{rel}" alt="{esc(alt)}"'
                f'{media_size(path)} loading="lazy" decoding="async">')
    return re.sub(r'<article class="c-world-card" data-art="([^"]+)" data-alt="([^"]*)">', sub, html)


def spot_html(sp):
    ph = sp.get('photo')
    if ph and os.path.exists(os.path.join(SITE, 'assets', 'photo', ph['file'])):
        # Настоящее фото места (site/assets/photo/<дело>/<слот>.jpg, 1200×900) с подписью автора и лицензии;
        # пока файла нет — рисунок. Список и права: docs/photos.md, quests/<id>/media/LICENSES.md.
        pic = (f'<img src="../../assets/photo/{ph["file"]}" alt="{esc(ph["alt"])}" width="1200" height="900" loading="lazy" decoding="async">'
               f'<figcaption class="c-credit">{ph["credit"]}</figcaption>')
    elif sp.get('svg'):
        pic = frag(sp['svg'])
    else:
        pic = f'<img src="../../assets/ill/spots/{sp["img"]}.svg" alt="{esc(sp["alt"])}" width="1200" height="900" loading="lazy" decoding="async">'
    warn = f'<p class="warn">{sp["warn"]}</p>' if sp.get('warn') else ''
    return f'<li class="c-spot"{none_attrs(sp)}><figure>{pic}</figure><h3>{sp["title"]}</h3><p>{sp["text"]}</p>{warn}</li>'


def body(c):
    st = STATUS[c['status']]
    no = c['no']
    facts = ''.join(f'<li><span class="n">{n}</span>{t}</li>' for n, t in c['facts'])
    people = ''.join(f'<div><dt>{n}</dt><dd>{d}</dd></div>' for n, d in c['cast']['people'])
    spots = ''.join(spot_html(s) for s in c['spots']['items'])
    learn = ''.join(f'<li>{x}</li>' for x in c['learn'])
    steps = ''.join(f'<li><h3>{h}</h3><p>{p}</p></li>' for h, p in c['how']['steps'])
    practical = ''.join(f'<div><dt>{h}</dt><dd>{p}</dd></div>' for h, p in c['practical'])
    faq = ''.join(f'<details{" open" if i == 0 else ""}><summary><h3>{q}</h3></summary><p>{a}</p></details>' for i, (q, a) in enumerate(c['faq']))
    sources = ''.join(f'<li><a href="{esc(u)}" rel="noopener" target="_blank">{t}</a></li>' for u, t in c['sources'])
    intro = ''.join(f'<p class="c-intro">{p}</p>' for p in c['hero']['intro'])
    story = ''.join(f'<p>{p}</p>' for p in c['story']['paras'])
    cliff = f'<p class="c-cliff">{c["story"]["cliff"]}</p>' if c['story'].get('cliff') else ''
    how = ''.join(f'<p>{p}</p>' for p in c['how']['paras'])
    hero_extra = c['hero'].get('decor', '')
    cover = c['hero']['cover']
    if cover.get('svg'):
        cover_html = f'<figure class="c-cover">{frag(cover["svg"])}</figure>'
    else:
        cover_html = (f'<figure class="c-cover"><img src="{cover["src"]}" alt="{esc(cover["alt"])}" width="1200" height="900" fetchpriority="high"></figure>')
    quote = ''
    if c['cast'].get('quote'):
        quote = f'<blockquote class="c-quote">{c["cast"]["quote"]}<footer>{c["cast"]["quote_by"]}</footer></blockquote>'
    return f'''<body class="case-page t-{c['theme']}">
<a class="skip" href="#main">К содержанию</a>

<header class="site-header">
  <div class="wrap">
    <a class="logo" href="../../" aria-label="Дворами — на главную">{LOGO}<span>дворами</span></a>
    <nav class="nav" aria-label="Навигация по странице">
      <a href="#story">Сюжет</a>
      <a href="#spots">Что увидите</a>
      <a href="#how">Загадки</a>
      <a href="#practical">Что нужно знать</a>
      <a class="nav-tg" data-tg="channel" href="{TG}" target="_blank" rel="noopener" aria-label="Telegram-канал «Дворами»">{TG_ICON}<span>Telegram</span></a>
      <a class="c-btn c-btn--sm" href="#buy">{MAIN_CTA}</a>
    </nav>
  </div>
</header>

<main id="main">
<section id="top" class="c-hero" aria-labelledby="h1">
  {hero_extra}
  <div class="wrap">
    <div>
      <nav class="c-crumbs" aria-label="Хлебные крошки"><ol><li><a href="../../">Главная</a></li><li><a href="../">Квесты по Москве</a></li><li aria-current="page">Дело №{no} · {c['short']}</li></ol></nav>
      <span class="c-plaque">Дело №{no} · {c['short']}</span>
      <div class="c-rating rating" data-rating="{c['slug']}">{rating_html(c['slug'], load_ratings())}</div>
      <h1 id="h1"><span class="pre">{c['hero']['pre']}</span><span class="big">{c['hero']['h1']}</span></h1>
      {intro}
      <div class="c-cta" data-cta>
        <a class="c-btn" href="#buy">{MAIN_CTA} · <span class="p">990&nbsp;₽</span></a>
        <a class="c-link" href="#how">Как устроен квест</a>
        <p class="c-status">{st}. 990&nbsp;₽ за&nbsp;дело, а&nbsp;не&nbsp;за&nbsp;человека.</p>
      </div>
    </div>
    {cover_html}
  </div>
</section>

<section id="facts" class="c-facts" aria-label="Квест в цифрах">
  <div class="wrap"><ul>{facts}</ul></div>
</section>

<section id="story" class="c-sec on-paper" aria-labelledby="h-story">
  <div class="wrap">
    {sec_head('story', c['story']['h2'], 'h-story')}
    <div class="c-story-grid">
      <div class="c-prose">{story}{cliff}</div>
      <div class="c-artifact" data-reveal>{c['story']['artifact']}</div>
    </div>
  </div>
</section>

<section id="cast" class="c-sec" aria-labelledby="h-cast">
  <div class="wrap">
    {sec_head('cast', c['cast']['h2'], 'h-cast')}
    <div class="c-cast">{quote}<dl class="c-people">{people}</dl></div>
  </div>
</section>

<section id="spots" class="c-sec on-paper" aria-labelledby="h-spots">
  <div class="wrap">
    {sec_head('spots', c['spots']['h2'], 'h-spots', c['spots']['lead'])}
    <div class="c-carousel" data-carousel>
      <ul class="c-track" data-shuffle tabindex="0" aria-label="Места на маршруте, листаются вбок">{spots}</ul>
      <div class="c-car-nav">
        <button type="button" data-dir="-1" aria-label="Предыдущее место">{ARROW_L}</button>
        <button type="button" data-dir="1" aria-label="Следующее место">{ARROW}</button>
        <span class="c-car-count" aria-live="polite"></span>
        <span class="c-car-hint" aria-hidden="true">листайте вбок</span>
      </div>
    </div>
  </div>
</section>

<section id="learn" class="c-sec" aria-labelledby="h-learn">
  <div class="wrap">
    {sec_head('learn', c['learn_h2'], 'h-learn')}
    <ol class="c-learn">{learn}</ol>
  </div>
</section>

<section id="how" class="c-sec on-alt" aria-labelledby="h-how">
  <div class="wrap">
    {sec_head('how', c['how']['h2'], 'h-how')}
    <div class="c-how">
      <div class="c-prose">{how}</div>
      <ol class="c-steps">{steps}</ol>
    </div>
  </div>
</section>

<section id="world" class="c-sec on-paper" aria-labelledby="h-world">
  <div class="wrap">
    {sec_head('world', c['world']['h2'], 'h-world', c['world'].get('lead'))}
    {world_block(c['world'])}
  </div>
</section>

<section id="practical" class="c-sec" aria-labelledby="h-practical">
  <div class="wrap">
    {sec_head('practical', 'Что нужно знать', 'h-practical')}
    <dl class="c-practical">{practical}</dl>
  </div>
</section>

<!-- seo:start -->
<section id="about-place" class="c-sec on-paper seo-ref" aria-labelledby="h-seo">
  <div class="wrap">
    {sec_head('about', c['about']['h2'], 'h-seo')}
    <p class="seo-lead">{c['about']['lead']}</p>
    <div class="seo-grid">{c['about']['html']}</div>
  </div>
</section>
<!-- seo:end -->

<section id="faq" class="c-sec" aria-labelledby="h-faq">
  <div class="wrap">
    {sec_head('faq', 'Частые вопросы', 'h-faq')}
    <div class="c-faq">{faq}</div>
  </div>
</section>

<section id="buy" class="c-sec on-alt" aria-labelledby="h-buy">
  <div class="wrap">
    {sec_head('buy', c['buy']['h2'], 'h-buy')}
    <div class="c-buy-card" data-cta>
      <span class="price">990&nbsp;₽</span>
      <strong class="one">{ONE_CODE}</strong>
      <span class="per">{ONE_CODE_NOTE}</span>
      <span class="status">{st}</span>
      <p>{c['buy']['text']}</p>
      <div class="c-buy-actions">
        <a class="c-btn" data-tg="channel" href="{TG}" target="_blank" rel="noopener">{TG_ICON}Узнать о старте продаж</a>
        <a class="c-link" href="#how">Как устроен квест</a>
      </div>
    </div>
  </div>
</section>

<section id="sources" class="c-sources" aria-label="Источники">
  <div class="wrap">
    <details>
      <summary>Источники</summary>
      <p>Исторические факты на&nbsp;этой странице сверены по&nbsp;публикациям:</p>
      <ul>{sources}</ul>
    </details>
  </div>
</section>
</main>

<a class="fab" id="fab" href="#buy" aria-hidden="true" tabindex="-1">{MAIN_CTA} · 990&nbsp;₽{ARROW.replace('<svg ', '<svg class="ico" ')}</a>

<footer class="site-footer">
  <div class="wrap">
    <a class="logo" href="../../" aria-label="Дворами — на главную">{LOGO}<span>дворами</span></a>
    <nav class="footer-links" aria-label="В подвале"><a href="../">Квесты по Москве</a><a href="../../#faq">Вопросы</a><a href="../../#reviews">Отзывы</a><a href="../../legal/privacy/">Политика конфиденциальности</a><a data-tg="channel" href="{TG}" target="_blank" rel="noopener">Telegram-канал @dvorami_quest</a></nav>
  </div>
</footer>
<script src="../../assets/site.js" defer></script>
</body>
</html>
'''


CARD_STATUS = {'soon': '<span class="qc-badge qc-badge--soon">Скоро в&nbsp;продаже</span><span class="qc-price"><b>990&nbsp;₽</b> за&nbsp;дело</span>',
               'dev': '<span class="qc-badge">В&nbsp;разработке</span>'}
# Каталоги, куда вставляются карточки дел (между метками cards:start / cards:end): файл, путь до корня site/, место (для аналитики)
CATALOGS = [('index.html', '', 'home'), (os.path.join('moscow', 'index.html'), '../', 'moscow')]


def meta_html(meta):
    """Цифры карточки: строка переносится только между частями, точка-разделитель — в конце строки
    (владелец 24.11: «2,5–» и «3 часа» на разных строках, строка с «·» в начале)."""
    parts = meta.split(' · ')
    if len(parts) > 2 and len(parts[-1]) <= 3:  # возраст «0+» не остаётся один на строке
        parts[-2:] = [parts[-2] + ' · ' + parts[-1]]
    return ' '.join(f'<span class="nw">{p}{" ·" if i < len(parts) - 1 else ""}</span>' for i, p in enumerate(parts))


def card_html(c, root, place, first, ratings=None):
    """Карточка дела в каталоге — из поля card дела (H-5: один источник; site_check сверяет её со страницей дела)."""
    k = c['card']
    home = place == 'home'
    h = 'h3' if home else 'h2'
    li_id = '' if home else f' id="case-{c["no"]}"'
    lazy = '' if (first and not home) else ' loading="lazy"'
    href = ('moscow/' if home else '') + c['slug'] + '/'
    ask = k.get('ask')
    # H-37: на кнопке — вопрос дела; для чтения с экрана — и куда ведёт (видимый текст входит в имя кнопки)
    cta = (f'<a class="qc-btn" href="{href}" aria-label="{esc(ask)} Подробнее о деле №{c["no"]}" data-track="quest_card" '
           f'data-track-quest="{c["slug"]}" data-track-place="{place}" data-track-cta="ask">{ask}</a>') if ask else (
           f'<a class="qc-btn" href="{href}" data-track="quest_card" data-track-quest="{c["slug"]}" data-track-place="{place}">{CARD_CTA}</a>')
    rating = rating_html(c['slug'], ratings or load_ratings())
    return (f'      <li class="qcard"{li_id} data-status="{c["status"]}" data-case="{c["no"]}">\n'
            f'        <span class="qc-cover"><img src="{root}assets/ill/{k["img"]}" width="1200" height="900"{lazy} alt="{esc(k["alt"])}"><span class="qc-rating rating" data-rating="{c["slug"]}">{rating}</span></span>\n'
            f'        <{h} class="qc-title"><span class="qc-no">Дело №{c["no"]}</span> {c["short"]}</{h}>\n'
            f'        <span class="qc-where">{k["where"]}</span>\n'
            f'        <p>{k["teaser"]}</p>\n'
            f'        <p class="qc-meta">{meta_html(k["meta"])}</p>\n'
            f'        <div class="qc-foot">{CARD_STATUS[c["status"]]}</div>\n'
            f'        {cta}\n'
            f'      </li>\n')


def build_catalogs(cases):
    for rel, root, place in CATALOGS:
        path = os.path.join(SITE, rel)
        with open(path, encoding='utf-8') as fh:
            page = fh.read()
        ratings = load_ratings()
        cards = ''.join(card_html(c, root, place, i == 0, ratings) for i, c in enumerate(cases))
        page, n = re.subn(r'(<!-- cards:start[^>]*-->\n).*?(      <!-- cards:end -->)',
                          lambda m: m.group(1) + cards + m.group(2), page, flags=re.S)
        if n != 1:
            raise SystemExit(f'{rel}: нет меток <!-- cards:start --> / <!-- cards:end -->')
        with open(path, 'w', encoding='utf-8') as fh:
            fh.write(page)
        print('→', os.path.relpath(path, REPO), '(карточки дел)')


def main():
    files = sorted(f for f in os.listdir(DATA) if re.match(r'c\d+_.*\.py$', f))
    cases = []
    for f in files:
        c = load(os.path.join(DATA, f))
        cases.append(c)
        out = os.path.join(SITE, 'moscow', c['slug'], 'index.html')
        os.makedirs(os.path.dirname(out), exist_ok=True)
        with open(out, 'w', encoding='utf-8') as fh:
            page = re.sub(r'\{\{([\w-]+)\}\}', lambda m: frag(m.group(1)), head(c) + body(c))
            fh.write(page)
        print('→', os.path.relpath(out, REPO))
    build_catalogs(sorted(cases, key=lambda c: c['no']))
    # T-121: OG-картинка дела рисуется из тех же данных (card) — напомнить, если цифры или вопрос поменялись
    sys.path.insert(0, HERE)
    import make_og
    for c in make_og.stale(cases):
        print(f'⚠ OG дела №{c["no"]} ({make_og.og_file(c)}) устарел — python3 scripts/make_og.py (иначе site_check красный)')


if __name__ == '__main__':
    main()

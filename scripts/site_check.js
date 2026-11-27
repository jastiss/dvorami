#!/usr/bin/env node
/* Автотест сайта «Дворами»: node scripts/site_check.js [--only=путь] [--shots=папка]
 *
 * Поднимает локальный http-сервер из site/, открывает каждую страницу в Chromium при 390 и 1440 px
 * (внешние запросы блокируются — проверяем только свои файлы) и ищет то, что владелец уже ловил руками:
 *   - кнопка/CTA без видимого текста (пусто или цвет текста сливается с фоном); кнопка шапки без полей;
 *   - на какой-то высоте прокрутки вниз на экране нет ни одного целевого действия (CTA пропадает);
 *   - горизонтальный скролл страницы; обрезанные карточки и виджеты (контент шире блока или вылезает за экран);
 *   - локальные ссылки, картинки, стили и скрипты, которые не отвечают 200; ссылки на несуществующие якоря;
 *   - ссылки на Wikipedia/Wikimedia; запрещённые на странице слова-спойлеры (scripts/site_spoilers.json);
 *   - страницы дел: одинаковый набор и порядок блоков, главная кнопка «Взять дело» в шапке, первом экране и плавающей кнопке;
 *   - типографика: элементы одной роли (заголовки секций, рукописные надзаголовки, кнопки карточек дел) — одного размера;
 *     в схемах-картах (.city-map svg) подписи одной роли одного размера и не наезжают друг на друга и на точки;
 *     осознанное исключение — атрибут data-size-exception="почему" на элементе и комментарий в CSS;
 *   - карточки дел: кнопки одного ряда на одной высоте (±2 px), цена ≥ 12 px от разделителя, тизер не обрезан на телефоне;
 *   - карточка дела в каталоге (главная, /moscow/) = страница дела: номер, название, статус, цифры, метро; карточки двух каталогов одинаковые;
 *   - карточка дела: первая фраза тизера — вопрос (H-31/H-38); на карточке нет «Один код — вся компания» ни в каком виде (владелец 25.11) и обложка не затемнена полосой;
 *   - ошибки в консоли и ошибки JS; предупреждения о неиспользованном preload шрифтов.
 *   - «Проба» ([data-lamp], владелец 27.11): без JS и при reduced-motion ответ виден, с JS — скрыт до света, кнопка ≥ 44 px
 *     проявляет его с клавиатуры и переводит фокус на следующий шаг; текст пробы ≠ ответам дел (answer_leaks.checkProbes, и в --sync).
 *   - без браузера (--sync — только они): цифры страницы и карточки дела = quests/<id>/quest.json (точки без эпилога, км, часы,
 *     финиш; T-127) и OG-картинка дела = её данным (platform/site/og-manifest.json, scripts/make_og.py; T-121, шрифт ≥ 11 px на 600 px — H-114);
 *     site/llms*.txt = делам (номер, название, точки, км, часы, статус, ссылки) и без спойлеров (H-108); временные объекты
 *     (scripts/temporary_check.js, H-111): за 30 дней до срока — предупреждение, после — ошибка ([--today=ГГГГ-ММ-ДД]);
 *     предупреждением — длина <title> > 60 и description > 160 на страницах дел, главной и /moscow/ (H-108; аудит SEO 27.11);
 *     JSON-LD каждой страницы разбирается, и в его строках нет HTML — сущностей (&nbsp;) и тегов (аудит SEO 27.11);
 *     ответы загадок из сценария на витрине дела и в его карточках (scripts/answer_leaks.js, исключения — answer_leaks.json);
 *     колонка «Где у игрока» в research/facts.md ↔ quest.json (scripts/facts_check.py, H-110; формат — docs/facts-format.md).
 *     карточки одной сетки витрины дела одинаковые (scripts/card_grid_check.js, владелец 27.11): год, источник, картинка —
 *     у всех, если у большинства; исключение — year_none/credit_none/art_none/photo_none: «почему» в данных дела;
 *     дрейф сюжета (scripts/story_drift.js, T-140): витрина сверена с текущей версией сценария (platform/site/story-sync.json),
 *     герои «Кто ведёт дело» — среди speakers quest.json, снятое из сценария (quests/<id>/retired.json) — нигде на витрине.
 * Выход: 0 — всё чисто, 1 — список ошибок.
 * Правило команды: перед сдачей любой правки сайта — этот скрипт зелёный.
 */
'use strict';
// playwright — лениво (ниже): --sync идёт первым шагом CI до установки браузера и обходится одним node (H-104)
const { spawn } = require('child_process');
const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', 'site');
const PORT = 8000 + Math.floor(Math.random() * 900);
const BASE = `http://127.0.0.1:${PORT}`;
const VIEWPORTS = [{ width: 390, height: 844 }, { width: 1440, height: 900 }];
const args = Object.fromEntries(process.argv.slice(2).map(a => a.replace(/^--/, '').split('=')));
const CASE_RE = /^moscow\/[^/]+\/$/;
const MAIN_CTA = 'Взять дело';

const errors = [];
const err = (page, vp, msg) => errors.push(`${page}${vp ? ' @' + vp : ''}: ${msg}`);

function listPages(dir = ROOT, rel = '') {
  let out = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.isDirectory()) out = out.concat(listPages(path.join(dir, e.name), rel + e.name + '/'));
    else if (e.name === 'index.html') out.push(rel);
  }
  return out.sort();
}

function listFiles(dir = ROOT) {
  let out = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out = out.concat(listFiles(p)); else out.push(p);
  }
  return out;
}

function status(url) {
  return new Promise(res => {
    http.get(url, r => { r.resume(); res(r.statusCode); }).on('error', () => res(0));
  });
}

async function waitServer() {
  for (let i = 0; i < 50; i++) {
    if (await status(BASE + '/') === 200) return;
    await new Promise(r => setTimeout(r, 150));
  }
  throw new Error('локальный сервер не поднялся');
}

/* --- проверки внутри страницы --- */
function inPage(MAIN_CTA) {
  const vw = window.innerWidth;
  const out = { problems: [], sections: [], ctas: {}, anchors: [], links: [] };
  const visible = el => {
    const r = el.getBoundingClientRect(); const cs = getComputedStyle(el);
    return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && cs.display !== 'none' && +cs.opacity > 0.05;
  };
  const parseRGB = s => { const m = s.match(/rgba?\(([^)]+)\)/); if (!m) return null; const p = m[1].split(/[ ,/]+/).filter(Boolean).map(Number); return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 }; };
  const lum = c => { const f = v => { v /= 255; return v <= .03928 ? v / 12.92 : Math.pow((v + .055) / 1.055, 2.4); }; return .2126 * f(c.r) + .7152 * f(c.g) + .0722 * f(c.b); };
  const bgOf = el => {
    for (let n = el; n; n = n.parentElement) {
      const c = parseRGB(getComputedStyle(n).backgroundColor);
      if (c && c.a > 0.5) return c;
      if (getComputedStyle(n).backgroundImage !== 'none' && n !== el) return null; // картинка/градиент — не меряем
    }
    return { r: 255, g: 255, b: 255, a: 1 };
  };
  const label = el => (el.className && typeof el.className === 'string' ? '.' + el.className.trim().split(/\s+/).join('.') : el.tagName.toLowerCase()) + ` «${(el.innerText || el.getAttribute('aria-label') || '').trim().slice(0, 40)}»`;

  // 1. Кнопки и CTA: есть видимый текст, текст не сливается с фоном
  const btnSel = 'a.btn, a.c-btn, a.qc-btn, a.gv-btn, a.tm-btn, a.d-btn, a.av-btn, .fab, button, [data-cta] a, a.link-arrow, a.c-link';
  document.querySelectorAll(btnSel).forEach(el => {
    if (!visible(el)) return;
    if (el.closest('[aria-hidden="true"]') && !el.classList.contains('fab')) return;
    const text = (el.innerText || '').replace(/\s+/g, ' ').trim();
    const aria = el.getAttribute('aria-label');
    if (!text && !aria) { out.problems.push(`кнопка без текста: ${label(el)}`); return; }
    if (!text) return; // иконка с aria-label (стрелки карусели)
    const fg = parseRGB(getComputedStyle(el).color); const bg = bgOf(el);
    if (fg && bg) {
      const L1 = lum(fg), L2 = lum(bg); const ratio = (Math.max(L1, L2) + .05) / (Math.min(L1, L2) + .05);
      if (fg.a < .3 || ratio < 3) out.problems.push(`текст кнопки почти не виден (контраст ${ratio.toFixed(2)}): ${label(el)}`);
    }
  });

  // 1a. Кнопки в шапке: у текста есть поля (ловили 23.11: «Взять дело» упиралась в края) и он не переносится
  document.querySelectorAll('.site-header .nav a.c-btn, .site-header .nav a.btn, .site-header .nav a.av-btn').forEach(el => {
    if (!visible(el)) return;
    const cs = getComputedStyle(el);
    const pl = parseFloat(cs.paddingLeft), pr = parseFloat(cs.paddingRight);
    if (pl < 12 || pr < 12) out.problems.push(`кнопка шапки без полей (padding ${pl}/${pr}px, нужно ≥ 12): ${label(el)}`);
    if (el.getBoundingClientRect().height > 2.2 * parseFloat(cs.lineHeight) + parseFloat(cs.paddingTop) + parseFloat(cs.paddingBottom)) out.problems.push(`текст кнопки шапки переносится: ${label(el)}`);
  });

  // 2. Горизонтальный скролл
  const sw = document.documentElement.scrollWidth;
  if (sw > vw + 1) out.problems.push(`горизонтальный скролл: ширина страницы ${sw} при экране ${vw}`);

  // 3. Обрезанные карточки/виджеты и элементы за краем экрана
  const scrollerOf = el => { for (let n = el.parentElement; n && n !== document.body; n = n.parentElement) { const o = getComputedStyle(n).overflowX; if (o === 'auto' || o === 'scroll') return n; } return null; };
  const cardSel = '.qcard, .c-spot, .guide-places li, .c-practical > div, .c-world-card, .c-people > div, .c-facts li, .c-steps li, .c-learn li, .c-buy-card, .gallery li, .hero-card, .about-list li, .who > div, .guide-stats li, .timeline li, .faq details, .c-faq details, .facts li, .map-legend li, .screen-notes li, .fan-phone, .postcard, .vedomost, .granka, .afisha, .telegram, .letter, .ruler';
  document.querySelectorAll(cardSel).forEach(el => {
    if (!visible(el)) return;
    const cs = getComputedStyle(el);
    if (el.scrollWidth > el.clientWidth + 2 && cs.overflowX !== 'auto' && cs.overflowX !== 'scroll') out.problems.push(`содержимое шире блока (${el.scrollWidth} > ${el.clientWidth}): ${label(el)}`);
    if (scrollerOf(el)) return; // карточка в ленте — за край уходит нарочно
    const r = el.getBoundingClientRect();
    if (r.right > vw + 1 || r.left < -1) out.problems.push(`блок за краем экрана (${Math.round(r.left)}…${Math.round(r.right)}): ${label(el)}`);
  });
  // Текст, который не помещается и режется контейнером с overflow:hidden
  document.querySelectorAll('main h1, main h2, main h3, main p, main li, main dd, main dt, main figcaption, main summary').forEach(el => {
    if (!visible(el)) return;
    const r = el.getBoundingClientRect();
    if (scrollerOf(el)) return;
    if (r.right > vw + 1) out.problems.push(`текст вылезает за экран: ${label(el)}`);
    for (let n = el.parentElement; n && n !== document.body; n = n.parentElement) {
      const cs = getComputedStyle(n);
      if (cs.overflow === 'hidden' || cs.overflowX === 'hidden' || cs.overflowX === 'clip') {
        const pr = n.getBoundingClientRect();
        if (pr.width > 40 && (r.right > pr.right + 2 || r.left < pr.left - 2)) out.problems.push(`текст обрезан контейнером ${label(n)}: ${label(el)}`);
        break;
      }
    }
  });

  // 3a. Типографика: одна роль — один размер (ловили 23.11: подписи на карте разного кегля, h2 «Как это выглядит» крупнее h1)
  const px = el => Math.round(parseFloat(getComputedStyle(el).fontSize) * 10) / 10;
  const sameSize = (what, els) => {
    els = els.filter(el => visible(el) && !el.closest('[data-size-exception]'));
    const by = {};
    els.forEach(el => { (by[px(el)] = by[px(el)] || []).push((el.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 28)); });
    const sizes = Object.keys(by);
    if (sizes.length > 1) out.problems.push(`типографика: ${what} — разный размер: ` + sizes.sort((a, b) => b - a).map(k => `${k}px («${by[k].slice(0, 3).join('», «')}»${by[k].length > 3 ? '…' : ''})`).join(' / '));
  };
  const all = sel => Array.from(document.querySelectorAll(sel));
  sameSize('заголовки секций', all('main > section h2.h2, main > section h2.screens-h, main > section h2.c-h'));
  sameSize('рукописные надзаголовки секций', all('main > section :is([class$="-head"], .guide-intro, .faq-side, .map-legend) > :is(.hand, .c-kicker)'));
  sameSize('кнопки карточек дел', all('.qgrid a.qc-btn, .qgrid a.btn'));

  // 3a'. Карточки дел (владелец 24.11): кнопки карточек одного ряда — на одной линии внизу (±2 px по верху и низу);
  //      цена/статус не прилипают к разделителю над ними (≥ 12 px); тизер не обрезан (≤ 4 строк на телефоне)
  document.querySelectorAll('.qgrid').forEach(grid => {
    const rows = {};
    Array.from(grid.children).filter(visible).forEach(li => {
      const btn = li.querySelector(':scope > a.qc-btn, :scope > a.btn');
      if (!btn || !visible(btn)) return;
      const top = Math.round(li.getBoundingClientRect().top / 4); // ряд — карточки с одним верхом (±4 px)
      (rows[top] = rows[top] || []).push([li, btn.getBoundingClientRect()]);
    });
    Object.values(rows).forEach(row => {
      if (row.length < 2) return;
      for (const edge of ['top', 'bottom']) {
        const v = row.map(([, r]) => r[edge]);
        if (Math.max(...v) - Math.min(...v) > 2) out.problems.push(`карточки дел: кнопки одного ряда на разной высоте (${edge} ${Math.round(Math.min(...v))}…${Math.round(Math.max(...v))} px): ` + row.map(([li]) => li.dataset.case ? '№' + li.dataset.case : 'предложить').join(', '));
      }
    });
  });
  document.querySelectorAll('.qgrid .qc-foot').forEach(foot => {
    if (!visible(foot)) return;
    const cs = getComputedStyle(foot);
    if (!(parseFloat(cs.borderTopWidth) > 0) || cs.borderTopStyle === 'none') return;
    const line = foot.getBoundingClientRect().top + parseFloat(cs.borderTopWidth);
    Array.from(foot.children).filter(el => visible(el) && getComputedStyle(el).position !== 'absolute').forEach(el => {
      const gap = el.getBoundingClientRect().top - line;
      if (gap < 12) out.problems.push(`карточка дела №${foot.closest('.qcard').dataset.case}: «${(el.innerText || '').trim().slice(0, 20)}» в ${Math.round(gap)} px от линии (нужно ≥ 12)`);
    });
  });
  if (vw <= 420) document.querySelectorAll('.qgrid .qcard[data-case] p:not(.qc-meta)').forEach(p => {
    if (visible(p) && p.scrollHeight > p.clientHeight + 2) out.problems.push(`карточка дела №${p.closest('.qcard').dataset.case}: тизер длиннее 4 строк и обрезан — сократить поле card.teaser`);
  });

  // 3a''. Владелец 25.11: «Один код — вся компания» — только в блоке покупки дела (#buy) и в FAQ, на карточках — нет
  //       (ни плашкой, ни строкой цены); обложка карточки — картинка целиком: поверх неё нет полосы во всю ширину
  document.querySelectorAll('.qgrid .qcard[data-case]').forEach(card => {
    const no = card.dataset.case;
    if (/один\s+код|вся\s+компания|на\s+(всю\s+)?компанию/i.test(card.textContent)) out.problems.push(`карточка дела №${no}: «один код / на компанию» на карточке — только в блоке покупки и FAQ (владелец 25.11)`);
    const cover = card.querySelector('.qc-cover');
    if (!cover || !visible(cover)) return;
    const cw = cover.getBoundingClientRect().width;
    cover.querySelectorAll(':scope > *:not(img)').forEach(el => {
      const r = el.getBoundingClientRect(), bg = getComputedStyle(el).backgroundImage;
      if (r.width > cw * 0.8 || /gradient/.test(bg)) out.problems.push(`карточка дела №${no}: поверх обложки полоса ${Math.round(r.width)}×${Math.round(r.height)} px (${el.className}) — картинка должна быть видна целиком (владелец 25.11)`);
    });
  });

  // 3b. Схемы-карты: подписи одной роли одного размера; подписи не пересекаются между собой и с точками
  document.querySelectorAll('.city-map svg').forEach(svg => {
    if (!visible(svg)) return;
    const texts = Array.from(svg.querySelectorAll('text')).filter(visible);
    const role = t => t.closest('.map-pin') ? 'подписи мест' : t.closest('.map-kremlin') ? 'подписи ориентиров' : 'служебные подписи (МКАД, ТТК, река)';
    const roles = {};
    texts.forEach(t => (roles[role(t)] = roles[role(t)] || []).push(t));
    Object.entries(roles).forEach(([name, els]) => sameSize('карта, ' + name, els));
    const k = svg.getBoundingClientRect().width / svg.viewBox.baseVal.width; // подписи меряем в единицах схемы, чтобы порог не зависел от ширины экрана
    const box = el => { const r = el.getBoundingClientRect(); return { l: r.left, t: r.top, r: r.right, b: r.bottom, n: (el.textContent || '').trim() || 'точка' }; };
    const hit = (a, b, gap) => a.l < b.r + gap && b.l < a.r + gap && a.t < b.b + gap && b.t < a.b + gap;
    // у текста рамка выше самих букв (место под выносные элементы) — берём «тело» строки
    const tb = texts.map(t => { const b = box(t), h = b.b - b.t; return Object.assign(b, { t: b.t + h * .18, b: b.b - h * .12 }); });
    for (let i = 0; i < tb.length; i++) for (let j = i + 1; j < tb.length; j++) if (hit(tb[i], tb[j], 2 * k)) out.problems.push(`карта: подписи наезжают друг на друга: «${tb[i].n}» и «${tb[j].n}»`);
    svg.querySelectorAll('.map-pin circle.dot').forEach(d => { const db = box(d); tb.forEach(b => { if (hit(db, b, 1 * k)) out.problems.push(`карта: подпись «${b.n}» наезжает на точку (${d.closest('.map-pin').textContent.trim()})`); }); });
    const sr = svg.getBoundingClientRect();
    tb.forEach(b => { if (b.l < sr.left - 1 || b.r > sr.right + 1) out.problems.push(`карта: подпись «${b.n}» выходит за край схемы`); });
  });

  // 4. Набор блоков страницы
  document.querySelectorAll('main > section').forEach(s => out.sections.push(s.id || '(без id)'));

  // 5. Подписи главных кнопок
  const t = sel => { const e = document.querySelector(sel); return e ? (e.innerText || '').replace(/\s+/g, ' ').trim() : null; };
  out.ctas = { header: t('.site-header .nav .c-btn'), hero: t('#top .c-cta .c-btn'), fab: (document.getElementById('fab') || {}).textContent ? document.getElementById('fab').textContent.replace(/\s+/g, ' ').trim() : null, buy: t('#buy .c-btn') };

  // 6. Ссылки и ресурсы
  document.querySelectorAll('a[href], img[src], link[href], script[src], source[srcset], use[href]').forEach(el => {
    const v = el.getAttribute('href') || el.getAttribute('src') || el.getAttribute('srcset');
    if (!v) return;
    if (v.startsWith('#')) { if (v.length > 1 && el.tagName.toLowerCase() !== 'use') out.anchors.push(v.slice(1)); return; }
    if (/^(mailto:|tel:|javascript:|data:)/.test(v)) return;
    out.links.push(new URL(v, location.href).href);
  });
  // 7. Карточки дел в каталоге и паспорт страницы дела — для сверки «карточка = страница» (H-5)
  const nt = el => el ? (el.innerText || el.textContent || '').replace(/ /g, ' ').replace(/\s+/g, ' ').trim() : '';
  out.cards = Array.from(document.querySelectorAll('.qgrid .qcard[data-case]')).map(li => {
    const a = li.querySelector('a.qc-btn');
    return { no: li.dataset.case, status: li.dataset.status, title: nt(li.querySelector('.qc-title')).replace(/^Дело №\d+\s*/, ''),
      where: nt(li.querySelector('.qc-where')), teaser: nt(li.querySelector('p:not(.qc-meta)')), meta: nt(li.querySelector('.qc-meta')),
      badge: nt(li.querySelector('.qc-badge')), href: a ? new URL(a.getAttribute('href'), location.href).href : '' };
  });
  const plaque = document.querySelector('.c-plaque');
  out.casePage = plaque ? { plaque: nt(plaque), status: nt(document.querySelector('#top .c-status')),
    facts: Array.from(document.querySelectorAll('#facts li')).map(li => ({ n: nt(li.querySelector('.n')), full: nt(li) })) } : null;
  out.anchorsMissing = out.anchors.filter(id => !document.getElementById(decodeURIComponent(id)));
  out.text = document.body.innerText;
  return out;
}

async function ctaAlwaysThere(page) {
  // Листаем вниз ступенями, как читатель: на каждой высоте на экране должно быть целевое действие
  const h = await page.evaluate(() => document.documentElement.scrollHeight - window.innerHeight);
  const miss = [];
  for (let step = 0; step <= 10; step++) {
    const y = Math.round(h * step / 10);
    await page.mouse.wheel(0, 0);
    await page.evaluate(y => window.scrollTo(0, y), y);
    await page.waitForTimeout(450);
    const ok = await page.evaluate(() => {
      const vh = window.innerHeight;
      const vis = el => { const r = el.getBoundingClientRect(); const cs = getComputedStyle(el); return r.bottom > 0 && r.top < vh && r.width > 0 && cs.visibility !== 'hidden' && cs.display !== 'none' && +cs.opacity > .5; };
      const fab = document.getElementById('fab');
      if (fab && fab.classList.contains('is-on') && vis(fab)) return true;
      const cands = document.querySelectorAll('[data-cta] a, [data-cta] button, a[data-cta], .site-header .nav .c-btn, .site-header .nav .btn, .site-footer a');
      return Array.from(cands).some(vis);
    });
    if (!ok) miss.push(Math.round(100 * step / 10) + '%');
  }
  return miss;
}

// «Проба» (владелец 27.11): ответ под маской проявляется светом; без JS и при reduced-motion — виден сразу.
// С JS — настоящий путь клавиатуры: Tab с последнего элемента перед пробой попадает на кнопку света (ссылка в скрытом
// ответе — tabindex=-1), Enter проявляет ответ, фокус остаётся в пробе (на следующем шаге, если он есть), ссылка ответа снова в Tab.
// Блок пробы на 390 — не выше 700 px (Продюсер 27.11: проба не должна отодвигать каталог больше чем на экран).
async function lampCheck(browser, url) {
  const out = [];
  const state = p => p.evaluate(() => {
    const box = document.querySelector('[data-lamp]');
    const ink = box.querySelector('.lamp-a .ink, .sheet-a .ink');
    const vis = el => { if (!el) return false; const r = el.getBoundingClientRect(), cs = getComputedStyle(el); return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && cs.display !== 'none'; };
    const cs = ink && getComputedStyle(ink), mask = cs && (cs.maskImage || cs.webkitMaskImage);
    const btn = box.querySelector('.lamp-btn'), next = box.querySelector('.lamp-next a'), act = document.activeElement;
    const sec = box.closest('section') || box;
    return { ink: !!ink, shown: vis(ink) && (!mask || mask === 'none'), btn: vis(btn) ? Math.round(btn.getBoundingClientRect().height) : 0,
      hasNext: !!next, next: vis(next), focusNext: !!(act && act.closest('.lamp-next')), focusIn: !!(act && act !== document.body && box.contains(act)),
      linkTab: ink ? [...ink.querySelectorAll('a')].map(a => a.tabIndex) : [], height: Math.round(sec.getBoundingClientRect().height) };
  });
  for (const [name, opt] of [['без JS', { javaScriptEnabled: false }], ['при prefers-reduced-motion', { reducedMotion: 'reduce' }], ['с JS', { reducedMotion: 'no-preference' }]]) {
    const ctx = await browser.newContext(Object.assign({ viewport: VIEWPORTS[0], deviceScaleFactor: 1 }, opt));
    const p = await ctx.newPage();
    await p.route('**/*', r => r.request().url().startsWith(BASE) ? r.continue() : r.abort());
    await p.goto(url, { waitUntil: 'load' }); await p.waitForTimeout(300);
    const s = await state(p);
    if (!s.ink) { out.push('«Проба»: нет строки ответа (.lamp-a .ink / .sheet-a .ink)'); await ctx.close(); break; }
    if (s.height > 700) out.push(`«Проба» ${name}: блок высотой ${s.height} px на 390 (нужно ≤ 700) — сократите текст, а не шрифт`);
    if (name !== 'с JS') {
      if (!s.shown) out.push(`«Проба» ${name}: ответ скрыт — должен быть виден сразу`);
      if (s.hasNext && !s.next) out.push(`«Проба» ${name}: не виден следующий шаг (.lamp-next)`);
      if (s.linkTab.some(t => t < 0)) out.push(`«Проба» ${name}: ссылка в видимом ответе выключена из Tab`);
    } else if (s.shown) out.push('«Проба» с JS: ответ виден до того, как его осветили');
    else if (s.btn < 44) out.push(`«Проба»: кнопка света ${s.btn ? s.btn + ' px (нужно ≥ 44)' : 'не видна'}`);
    else {
      const before = await p.evaluate(() => {
        const box = document.querySelector('[data-lamp]');
        const all = [...document.querySelectorAll('a[href], button, input, select, textarea, [tabindex]')]
          .filter(e => e.tabIndex >= 0 && !e.disabled && e.getClientRects().length && getComputedStyle(e).visibility !== 'hidden');
        const i = all.findIndex(e => box.contains(e) || (box.compareDocumentPosition(e) & Node.DOCUMENT_POSITION_FOLLOWING));
        if (i < 1) return false;
        all[i - 1].focus(); return document.activeElement === all[i - 1];
      });
      if (!before) out.push('«Проба»: перед пробой нет элемента, с которого начать путь Tab');
      await p.keyboard.press('Tab');
      const f1 = await p.evaluate(() => { const a = document.activeElement; return !a || a === document.body ? 'никуда' : a.matches('[data-lamp] .lamp-btn') ? 'btn' : a.closest('[data-lamp] .ink') ? 'ссылку в скрытом ответе' : `«${(a.innerText || a.outerHTML).trim().slice(0, 40)}»`; });
      if (f1 !== 'btn') out.push(`«Проба»: Tab перед пробой ведёт не на кнопку света, а на ${f1}`);
      else {
        await p.keyboard.press('Enter'); await p.waitForTimeout(200);
        const a = await state(p);
        if (!a.shown) out.push('«Проба»: кнопка света с клавиатуры не проявила ответ');
        if (!a.focusIn) out.push('«Проба»: после кнопки света фокус потерялся (ушёл со страницы пробы)');
        if (a.hasNext && !(a.next && a.focusNext)) out.push('«Проба»: после кнопки света следующий шаг не виден или фокус не на нём');
        if (a.linkTab.some(t => t < 0)) out.push('«Проба»: после света ссылка в ответе так и не вернулась в Tab');
      }
    }
    await ctx.close();
  }
  return out;
}

// Зашифрованное дело для плеера — как в pages.yml, но с тестовыми кодами (не в репозитории)
const lockedCache = {};
function lockedFor(id) {
  if (id in lockedCache) return lockedCache[id];
  lockedCache[id] = null;
  if (!fs.existsSync(path.resolve(__dirname, '..', 'quests', id, 'quest.json'))) return null;
  try {
    const out = require('child_process').execFileSync('python3', [path.join(__dirname, 'codes.py'), 'selftest-bundle', '--quest', id,
      '--out', fs.mkdtempSync(path.join(require('os').tmpdir(), 'dvorami-site-'))], { encoding: 'utf8' });
    lockedCache[id] = JSON.parse(out.trim().split('\n').pop()).locked;
  } catch (e) { /* нет python/cryptography — плеер покажет «Не загрузилось», это и будет ошибкой проверки */ }
  return lockedCache[id];
}

/* T-127 (H-93): цифры витрины = сценарий. Страница дела site/moscow/<slug>/ ↔ quests/<id>/quest.json, где slug начинается
 * с «<id>-» (zilart-sinyaya-ptica ↔ quests/zilart). Сверяется то, что есть в данных дела:
 *  - число точек основного маршрута: ветки «if» — по флагам дела (q.flags; нет флага — «A», ветки «по часам» — «open»),
 *    развилка fork — тоже по флагу дела. ЭПИЛОГ НЕ СЧИТАЕТСЯ: точка с id "epilogue" (ЗИЛАРТ, т.11 «К началу» — дорога назад
 *    к перголе без загадки) — путь к финишу, а не остановка; поэтому quest.json с 11 точками = «10 остановок» в summary и на витрине
 *    (окончательно решает T-124). Все «N точек/остановок» на странице дела и в summary/вступлении сценария — это N;
 *  - км: длина маршрута по walk_m (с эпилогом — по нему идут) ≈ «около X км» сценария (±0,5 км); на странице — X (±0,3),
 *    или больше X, если в подписи цифры сказано «от метро» (Коломенское: 2 км между точками + дорога от метро = 4 км), и тогда
 *    «X км» тоже есть на странице;
 *  - время: «A–B часа» сценария = цифра «ч» на странице;
 *  - финиш: метро из фразы «Финиш — …» сценария («того же метро» — метро старта) есть в пункте «Финиш» страницы; места
 *    «— старт» / «— финиш» в JSON-LD с координатами — не дальше 150 м от первой / последней точки маршрута;
 *  - возраст: в quest.json его нет — не сверяется (появится поле — добавить сюда).
 * Тексты сценария с веткой («if»: "ext=B") сверяются с маршрутом этой ветки (Коломенское: «9 остановок … около 3 км»). */
const EPILOGUE = p => p.id === 'epilogue';
const QF = {}; // slug страницы дела → цифры из quest.json (точки, км, часы) — их же сверяет llmsSync (H-108)
function questSync() {
  const out = [];
  const QDIR = path.resolve(__dirname, '..', 'quests');
  const caseDir = path.join(ROOT, 'moscow');
  const slugs = fs.readdirSync(caseDir, { withFileTypes: true }).filter(e => e.isDirectory()).map(e => e.name);
  const num = s => parseFloat(String(s).replace(',', '.'));
  const plain = s => String(s).replace(/<[^>]*>/g, ' ').replace(/&nbsp;| /g, ' ').replace(/&[a-z]+;/g, ' ').replace(/\s+/g, ' ').trim();
  const stem = n => n.slice(0, Math.max(3, n.length - 2)); // «Коломенской» ~ «Коломенская»
  const cat = fs.readFileSync(path.join(caseDir, 'index.html'), 'utf8');
  const dist = (a, b) => Math.hypot((a[0] - b[0]) * 111320, (a[1] - b[1]) * 111320 * Math.cos(a[0] * Math.PI / 180));
  for (const id of fs.readdirSync(QDIR).sort()) {
    const qf = path.join(QDIR, id, 'quest.json');
    if (!fs.existsSync(qf)) continue;
    const where = `quests/${id}/quest.json`;
    const slug = slugs.find(s => s.startsWith(id + '-'));
    if (!slug) { out.push(`${where}: нет страницы дела site/moscow/${id}-…/ — цифры не с чем сверить`); continue; }
    const q = JSON.parse(fs.readFileSync(qf, 'utf8'));
    const html = fs.readFileSync(path.join(caseDir, slug, 'index.html'), 'utf8');
    const pg = `moscow/${slug}/`;
    const defaults = Object.assign({}, ...Object.keys(q.clock || {}).map(k => ({ [k]: 'open' })), q.flags || {});
    const fv = (fl, k) => fl[k] != null ? String(fl[k]) : 'A';
    const passes = (cond, fl) => { // как passes() в site/play/player.js
      if (!cond) return true;
      if (typeof cond === 'string') {
        const m = cond.match(/^\s*([\w-]+)\s*(!?=)\s*(.+?)\s*$/);
        if (!m) return true;
        const hit = m[3].split('|').map(s => s.trim()).includes(fv(fl, m[1]));
        return m[2] === '=' ? hit : !hit;
      }
      return Object.keys(cond).every(k => [].concat(cond[k]).map(String).includes(fv(fl, k)));
    };
    const route = fl => (q.points || []).filter(p => passes(p.if, fl));
    const stops = fl => route(fl).filter(p => !EPILOGUE(p)).length;
    const walkM = fl => route(fl).reduce((s, p) => {
      const w = p.walk_m;
      if (Array.isArray(w)) { const v = w.find(x => passes(x.if, fl)) || w[0]; return s + (+(v && v.m) || 0); }
      return s + (+w || 0);
    }, 0);
    // тексты сценария: summary и реплики вступления; у реплики с веткой — свои флаги
    const texts = [{ t: q.summary || '', fl: defaults, main: true }];
    (function walk(x, cond) {
      if (Array.isArray(x)) return x.forEach(e => walk(e, cond));
      if (typeof x === 'string') { texts.push({ t: x, cond }); return; }
      if (x && typeof x === 'object' && typeof x.text === 'string') texts.push({ t: x.text, cond: x.if });
    })(q.intro || []);
    for (const tx of texts.slice(1)) {
      if (!tx.cond || passes(tx.cond, defaults)) { tx.fl = defaults; tx.main = true; continue; }
      const m = typeof tx.cond === 'string' && tx.cond.match(/^\s*([\w-]+)\s*=\s*([^|!]+?)\s*$/);
      tx.fl = m ? Object.assign({}, defaults, { [m[1]]: m[2] }) : null; // сложное условие ветки — не сверяем
    }
    const N = stops(defaults);
    let kmMain = null, hoursMain = null, finish = null, startMetro = null;
    QF[slug] = { where, N };
    for (const tx of texts) {
      if (!tx.fl) continue;
      const t = plain(tx.t);
      const n = t.match(/(\d+)\s+(?:остановок|остановки|точек|точки)/);
      if (n && +n[1] !== stops(tx.fl)) out.push(`${where}: в тексте сценария «${n[0]}», а в маршруте ${stops(tx.fl)} (эпилог не считается) — «${t.slice(0, 70)}…»`);
      const k = t.match(/около\s+(\d+(?:,\d+)?)\s*км/);
      if (k && Math.abs(num(k[1]) - walkM(tx.fl) / 1000) > 0.5) out.push(`${where}: в тексте сценария «${k[0]}», а по walk_m маршрут ${(walkM(tx.fl) / 1000).toFixed(1)} км`);
      if (!tx.main) continue;
      if (k && kmMain == null) kmMain = k[1];
      const h = t.match(/(\d+(?:,\d+)?\s*[–-]\s*\d+(?:,\d+)?)\s*час/);
      if (h && hoursMain == null) hoursMain = h[1].replace(/\s|-/g, s => s === '-' ? '–' : '');
      const st = t.match(/Старт\s*—[^.]*?«([^»]+)»/);
      if (st && !startMetro) startMetro = st[1];
      const f = t.match(/Финиш\s*—\s*([^.]+)/);
      if (f && !finish) finish = f[1];
    }
    // страница дела: цифры первого экрана, «Что нужно знать», JSON-LD
    const facts = [...(html.match(/<section id="facts"[\s\S]*?<\/section>/) || [''])[0].matchAll(/<li><span class="n">([\s\S]*?)<\/span>([\s\S]*?)<\/li>/g)].map(m => ({ n: plain(m[1]), label: plain(m[2]) }));
    const practical = Object.fromEntries([...html.matchAll(/<dt>([\s\S]*?)<\/dt><dd>([\s\S]*?)<\/dd>/g)].map(m => [plain(m[1]), plain(m[2])]));
    const body = plain(html.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>|<head>[\s\S]*?<\/head>/g, ' '));
    const pf = facts.find(f => /точ|останов/.test(f.label));
    if (!pf) out.push(`${pg}: в цифрах страницы нет числа точек — сверить с ${where} не с чем`);
    else if (+pf.n !== N) out.push(`${pg}: на странице ${pf.n} ${pf.label}, а в ${where} ${N} точек основного маршрута (эпилог не считается)`);
    for (const m of new Set([...body.matchAll(/(\d+)\s+(?:точ[а-я]*|останов[а-я]*)/g)].map(m => m[0]))) {
      if (+m.match(/\d+/)[0] !== N) out.push(`${pg}: в тексте страницы «${m}», а в ${where} ${N} точек основного маршрута`);
    }
    const kf = facts.find(f => /км/.test(f.n));
    const kmQ = kmMain != null ? num(kmMain) : Math.round(walkM(defaults) / 500) / 2;
    Object.assign(QF[slug], { km: kmQ, hours: hoursMain });
    if (kf) {
      const kmP = num(kf.n.replace(/[^\d,]/g, ''));
      const viaMetro = /метро/.test(kf.label) && kmP > kmQ && body.includes(`${String(kmQ).replace('.', ',')} км`);
      if (Math.abs(kmP - kmQ) > 0.3 && !viaMetro) out.push(`${pg}: на странице «${kf.n}», а в ${where} около ${kmQ} км (по walk_m ${(walkM(defaults) / 1000).toFixed(1)})`);
    }
    // карточка дела в каталоге (/moscow/) — те же точки и км (с карточкой страницу сверяет и проверка каталогов в браузере)
    const cm = (cat.match(/<li class="qcard"[\s\S]*?<\/li>/g) || []).find(li => li.includes(`href="${slug}/"`));
    const cmeta = cm ? plain((cm.match(/<p class="qc-meta">([\s\S]*?)<\/p>/) || [])[1] || '') : null;
    if (!cmeta) out.push(`${pg}: нет карточки дела в /moscow/ — цифры карточки не с чем сверить`);
    else {
      const cn = cmeta.match(/(\d+)\s+(?:точ|останов)/);
      if (cn && +cn[1] !== N) out.push(`${pg}: в карточке «${cmeta}», а в ${where} ${N} точек основного маршрута (эпилог не считается)`);
      const ck = cmeta.match(/(\d+(?:,\d+)?)\s*км/);
      if (ck && kf && num(ck[1]) !== num(kf.n.replace(/[^\d,]/g, ''))) out.push(`${pg}: в карточке «${ck[0]}», на странице «${kf.n}»`);
    }
    const hf = facts.find(f => /ч$/.test(f.n));
    if (hf && hoursMain && hf.n.replace(/\s*ч$/, '').replace(/\s/g, '') !== hoursMain) out.push(`${pg}: на странице «${hf.n}», а в ${where} «${hoursMain} часа»`);
    if (finish) {
      let metro = (finish.match(/«([^»]+)»/) || [])[1];
      if (!metro && /тог[оа] же метро/.test(finish)) metro = startMetro;
      const pfin = practical['Финиш'] || '';
      if (metro && !pfin.includes(stem(metro))) out.push(`${pg}: «Финиш» на странице («${pfin.slice(0, 60)}») без метро «${metro}» из ${where} («Финиш — ${finish}»)`);
    }
    const r = route(defaults);
    for (const m of html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)) {
      let ld; try { ld = JSON.parse(m[1]); } catch (e) { continue; }
      const places = [];
      (function walk(x) { if (Array.isArray(x)) x.forEach(walk); else if (x && typeof x === 'object') { if (x['@type'] === 'Place' && x.geo) places.push(x); Object.values(x).forEach(walk); } })(ld);
      for (const p of places) {
        const end = /—\s*финиш/i.test(p.name) ? r[r.length - 1] : /—\s*старт/i.test(p.name) ? r[0] : null;
        if (!end || end.lat == null) continue;
        const d = dist([+p.geo.latitude, +p.geo.longitude], [end.lat, end.lon]);
        if (d > 150) out.push(`${pg}: JSON-LD «${p.name}» в ${Math.round(d)} м от точки «${end.title}» из ${where}`);
      }
    }
  }
  return out;
}

/* T-65 (H-13): штампы машинного текста в текстах сайта — список docs/marketing/tone-of-voice.md («Избегаем», «Признаки
 * машинного текста»), механическая часть — scripts/tone_stamps.json (общий с channel_post.py --check). Страницы: главная,
 * каталог, дела, /sledami/ (плеер и юридические — нет). Текст: видимый, alt, aria-label, <title>, description и og:*.
 * Пока ПРЕДУПРЕЖДЕНИЕ, не красное: тексты правит Автор, Инженер их не переписывает. Ложное срабатывание — в site_exceptions
 * того же файла (страница, шаблон, кусок фразы, почему). Когда список срабатываний пуст — сделать ошибкой. */
function toneCheck() {
  const cfg = JSON.parse(fs.readFileSync(path.join(__dirname, 'tone_stamps.json'), 'utf8'));
  const W = '[\\p{L}\\p{N}_]'; // \b в JS не видит кириллицу — юникодная граница слова
  const toRe = src => new RegExp(src.replace(/\\b/g, `(?:(?<=${W})(?!${W})|(?<!${W})(?=${W}))`), 'giu');
  const rules = cfg.groups.filter(g => g.where.includes('site')).flatMap(g => g.patterns.map(p => ({ group: g.name, src: p, re: toRe(p) })));
  const ent = { nbsp: ' ', laquo: '«', raquo: '»', quot: '"', amp: '&', mdash: '—', ndash: '–', hellip: '…', apos: "'", lt: '<', gt: '>' };
  const decode = t => t.replace(/&(#x?[0-9a-f]+|\w+);/gi, (m, e) => e[0] === '#' ? String.fromCodePoint(e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : +e.slice(1)) : (ent[e] ?? m));
  const out = [];
  const pages = listPages().filter(p => !/^(play|legal)\//.test(p));
  for (const pg of pages) {
    const h = fs.readFileSync(path.join(ROOT, pg, 'index.html'), 'utf8');
    const attrs = [...h.matchAll(/<(?:img|[a-z]+)[^>]*?\s(?:alt|aria-label)="([^"]*)"/g)].map(m => m[1]);
    const metas = [...h.matchAll(/<meta (?:name|property)="(?:description|og:title|og:description|twitter:title|twitter:description)" content="([^"]*)"/g)].map(m => m[1]);
    const body = h.replace(/<(script|style|svg|noscript)\b[\s\S]*?<\/\1>/gi, ' ').replace(/<br\s*\/?>/gi, ' ').replace(/<\/(p|li|h\d|div|dt|dd|figcaption|summary|td|th|a|button)>/gi, '. ').replace(/<[^>]+>/g, ' ');
    const text = decode([body, ...attrs, ...metas].join(' . ')).replace(/[\u00a0\s]+/g, ' ').replace(/([.?!…])(\s*\.)+/g, '$1');
    const seen = new Set();
    for (const r of rules) for (const m of text.matchAll(r.re)) {
      const before = text.slice(0, m.index), after = text.slice(m.index + m[0].length);
      const a = Math.max(...[...before.matchAll(/[.?!…]\s/g)].map(x => x.index + 2), 0), b0 = after.search(/[.?!…](\s|$)/);
      let ctx = text.slice(a, b0 < 0 ? text.length : m.index + m[0].length + b0 + 1).trim();
      if (ctx.length > 160) ctx = '…' + text.slice(Math.max(0, m.index - 70), m.index + m[0].length + 70).trim() + '…';
      const exc = cfg.site_exceptions.find(e => pg.includes(e.page) && e.pattern === r.src && ctx.toLowerCase().includes(e.context.toLowerCase()));
      const key = r.src + '|' + ctx;
      if (exc || seen.has(key)) continue;
      seen.add(key);
      out.push(`${pg || '/'}: «${m[0]}» (${r.group}) — ${ctx}`);
    }
  }
  return out;
}

/* H-108: site/llms.txt (и прочие site/llms*.txt) — пересказ витрины для ИИ-поиска. Пишется руками, поэтому сверяется с данными:
 *  - ссылки https://dvorami.ru/… ведут на существующие страницы и якоря; каждое дело из site/moscow/ упомянуто строкой;
 *  - «Дело №N «Название»» = табличке страницы дела («Дело №N · Название»);
 *  - цифры строки дела — первые «N точек», «около X км», «A–B часа» — = quest.json (QF, как questSync; эпилог не считается)
 *    или, у дела без quest.json, цифрам страницы; км — ±0,3 от сценария или от цифры страницы («4 км с дорогой от метро»);
 *  - «Статус: …» = статусу страницы дела;
 *  - спойлеры (scripts/site_spoilers.json): «*» — во всём файле, ключ страницы дела — в её строке.
 * Красное: ИИ-ответ «12 точек» или разгадка в llms.txt — та же ошибка, что на витрине. */
function llmsSync(spoilers) {
  const out = [];
  const files = fs.readdirSync(ROOT).filter(f => /^llms.*\.txt$/.test(f)).sort();
  const plain = s => String(s).replace(/<[^>]*>/g, ' ').replace(/&nbsp;| /g, ' ').replace(/&laquo;/g, '«').replace(/&raquo;/g, '»').replace(/&[a-z]+;/g, ' ').replace(/\s+/g, ' ').trim();
  const num = s => parseFloat(String(s).replace(',', '.'));
  const dash = s => s.replace(/\s/g, '').replace(/-/g, '–');
  const caseDir = path.join(ROOT, 'moscow');
  const cases = {};
  for (const slug of fs.readdirSync(caseDir)) {
    const f = path.join(caseDir, slug, 'index.html');
    if (!fs.existsSync(f)) continue;
    const h = fs.readFileSync(f, 'utf8');
    const plaque = plain((h.match(/class="c-plaque"[^>]*>([\s\S]*?)<\/(?:p|div|span|a)>/) || [])[1] || '');
    if (!plaque) continue;
    const facts = [...(h.match(/<section id="facts"[\s\S]*?<\/section>/) || [''])[0].matchAll(/<li><span class="n">([\s\S]*?)<\/span>([\s\S]*?)<\/li>/g)].map(m => ({ n: plain(m[1]), label: plain(m[2]) }));
    cases[slug] = { plaque, status: plain((h.match(/class="c-status"[^>]*>([\s\S]*?)<\/(?:p|div|span)>/) || [])[1] || ''), facts };
  }
  const anchorsOf = rel => { const f = path.join(ROOT, rel, 'index.html'); return fs.existsSync(f) ? new Set([...fs.readFileSync(f, 'utf8').matchAll(/\sid="([^"]+)"/g)].map(m => m[1])) : null; };
  for (const file of files) {
    const t = fs.readFileSync(path.join(ROOT, file), 'utf8');
    for (const m of t.matchAll(/https:\/\/dvorami\.ru\/([^)\s#]*)(?:#([\w-]+))?/g)) {
      const ids = anchorsOf(m[1]);
      if (!ids) out.push(`${file}: ссылка на несуществующую страницу https://dvorami.ru/${m[1]}`);
      else if (m[2] && !ids.has(m[2])) out.push(`${file}: ссылка на несуществующий якорь https://dvorami.ru/${m[1]}#${m[2]}`);
    }
    for (const w of spoilers['*'] || []) if (t.toLowerCase().includes(w.toLowerCase())) out.push(`${file}: спойлер «${w}»`);
    const lines = t.split('\n');
    for (const [slug, c] of Object.entries(cases)) {
      const ln = lines.find(l => l.includes(`dvorami.ru/moscow/${slug}/`) && /Дело\s*№/.test(l));
      const pg = `moscow/${slug}/`;
      if (!ln) { if (file === 'llms.txt') out.push(`${file}: нет строки дела ${pg} («${c.plaque}»)`); continue; }
      const tag = `${file}, ${c.plaque}`;
      const tm = ln.match(/Дело\s*№\s*(\d+)\s*«([^»]+)»/);
      if (!tm || `Дело №${tm[1]} · ${tm[2]}` !== c.plaque) out.push(`${tag}: в строке «${tm ? `Дело №${tm[1]} «${tm[2]}»` : ln.slice(0, 50)}», на странице дела «${c.plaque}»`);
      const qf = QF[slug] || {};
      const pf = c.facts.find(f => /точ|останов|загад/.test(f.label)), kf = c.facts.find(f => /км/.test(f.n)), hf = c.facts.find(f => /ч$/.test(f.n));
      const n = ln.match(/(\d+)\s+(?:точ[а-я]*|останов[а-я]*)/), N = qf.N != null ? qf.N : pf ? +pf.n : null;
      if (n && N != null && +n[1] !== N) out.push(`${tag}: «${n[0]}», а ${qf.where ? `в ${qf.where} ${N} точек основного маршрута (эпилог не считается)` : `на странице ${N}`}`);
      const k = ln.match(/около\s+(\d+(?:,\d+)?)\s*км/);
      if (k) {
        const ok = [qf.km, kf ? num(kf.n.replace(/[^\d,]/g, '')) : null].filter(v => v != null && !isNaN(v));
        const okU = [...new Set(ok)]; if (okU.length && !okU.some(v => Math.abs(num(k[1]) - v) <= 0.3)) out.push(`${tag}: «${k[0]}», а в данных дела ${okU.map(v => String(v).replace('.', ',') + ' км').join(' / ')}`);
      }
      const hh = ln.match(/(\d+(?:,\d+)?\s*[–-]\s*\d+(?:,\d+)?)\s*час/);
      const H = qf.hours || (hf ? hf.n.replace(/\s*ч$/, '') : null);
      if (hh && H && dash(hh[1]) !== dash(H)) out.push(`${tag}: «${hh[0]}…», а ${qf.hours ? 'в ' + qf.where : 'на странице'} «${H} часа»`);
      const st = ln.match(/Статус:\s*([^.]+)/);
      if (st && !c.status.toLowerCase().startsWith(st[1].trim().toLowerCase())) out.push(`${tag}: «Статус: ${st[1].trim()}», на странице дела «${c.status.split('.')[0]}»`);
      for (const [key, words] of Object.entries(spoilers)) {
        if (key.startsWith('_') || key === '*' || !pg.startsWith(key)) continue;
        for (const w of words) if (ln.toLowerCase().includes(w.toLowerCase())) out.push(`${tag}: спойлер «${w}»`);
      }
    }
  }
  return out;
}

/* H-108: длина <title> ≤ 60 и meta description ≤ 160 знаков на страницах дел — иначе поисковик обрежет сниппет.
 * Пока ПРЕДУПРЕЖДЕНИЕ (Маркетолог сокращает, данные — platform/site/cases/c*.py → build_cases.py); станет пусто — сделать ошибкой. */
const TITLE_MAX = 60, DESC_MAX = 160;
function seoLengths() {
  const out = [];
  const ent = { nbsp: ' ', laquo: '«', raquo: '»', quot: '"', amp: '&', mdash: '—', ndash: '–', hellip: '…', apos: "'", lt: '<', gt: '>' };
  const decode = t => t.replace(/&(#x?[0-9a-f]+|\w+);/gi, (m, e) => e[0] === '#' ? String.fromCodePoint(e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : +e.slice(1)) : (ent[e] ?? m)).replace(/\s+/g, ' ').trim();
  for (const pg of listPages().filter(p => CASE_RE.test(p) || p === '' || p === 'moscow/')) {
    const h = fs.readFileSync(path.join(ROOT, pg, 'index.html'), 'utf8');
    const title = decode((h.match(/<title>([\s\S]*?)<\/title>/) || [])[1] || '');
    const desc = decode((h.match(/<meta name="description" content="([^"]*)"/) || [])[1] || '');
    if ([...title].length > TITLE_MAX) out.push(`${pg}: <title> ${[...title].length} знаков (нужно ≤ ${TITLE_MAX}) — «${title}»`);
    if ([...desc].length > DESC_MAX) out.push(`${pg}: description ${[...desc].length} знаков (нужно ≤ ${DESC_MAX}) — «${desc.slice(0, 80)}…»`);
  }
  return out;
}

/* JSON-LD (аудит SEO 27.11, docs/seo/audit-2026-11-27.md): разметка каждой страницы разбирается, а в её строках нет HTML —
 * ни сущностей (&nbsp;), ни тегов. Поисковик и ИИ читают JSON как есть: «Дело №3 · Туман в&nbsp;овраге» так и уходил в крошки.
 * Самопроверка на фикстурах — в каждом запуске. */
function ldIssues(html, pg) {
  const out = [];
  for (const m of html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)) {
    let ld; try { ld = JSON.parse(m[1]); } catch (e) { out.push(`${pg}: JSON-LD не разбирается — ${e.message}`); continue; }
    (function walk(x, at) {
      if (typeof x === 'string') {
        const h = x.match(/&(?:#x?[0-9a-f]+|[a-z]+);|<\/?[a-z][^>]*>/i);
        if (h) out.push(`${pg}: JSON-LD ${at}: HTML в тексте «${h[0]}» — «${x.slice(0, 60)}» (строку — через strip() в scripts/build_cases.py)`);
      } else if (Array.isArray(x)) x.forEach((v, i) => walk(v, `${at}[${i}]`));
      else if (x && typeof x === 'object') for (const [k, v] of Object.entries(x)) walk(v, at ? `${at}.${k}` : k);
    })(ld, '');
  }
  return out;
}
function ldSync() {
  const out = [];
  const fx = j => `<script type="application/ld+json">${j}</script>`;
  if (!ldIssues(fx('{"name": "Туман в&nbsp;овраге"}'), 'фикстура').length) out.push('самопроверка: &nbsp; в строке JSON-LD не пойман');
  if (!ldIssues(fx('{"text": "<b>990 ₽</b>"}'), 'фикстура').length) out.push('самопроверка: тег в строке JSON-LD не пойман');
  if (!ldIssues(fx('{"name": '), 'фикстура').length) out.push('самопроверка: неразборный JSON-LD не пойман');
  if (ldIssues(fx('{"url": "https://dvorami.ru/?a=1&b=2", "name": "Москва & область"}'), 'фикстура').length) out.push('самопроверка: ложное срабатывание на & в адресе');
  for (const pg of listPages().filter(p => !p.startsWith('play/'))) out.push(...ldIssues(fs.readFileSync(path.join(ROOT, pg, 'index.html'), 'utf8'), pg || '/'));
  return out;
}

/* T-121 (H-96): OG-картинка дела = его данные. OG рисует scripts/make_og.py из card (название, вопрос, цифры) и пишет
 * в platform/site/og-manifest.json, что нарисовано, и хеш файла. Здесь: og:image страницы дела есть в site/assets/og/;
 * если это не общий main.png — запись в манифесте, её текст = карточке дела в каталоге (/moscow/) и og:title страницы,
 * хеш = файлу (подменили руками — красное); в site/assets/og/ нет картинок дел мимо манифеста.
 * Правка card.meta без «python3 scripts/make_og.py» — красное: превью в мессенджере не должно врать (OG ЗИЛАРТа неделю
 * показывал «12 точек · 2,8 км · от 7 лет»). */
function ogSync() {
  const out = [];
  const plain = s => String(s).replace(/<[^>]*>/g, '').replace(/&nbsp;| /g, ' ').replace(/&laquo;/g, '«').replace(/&raquo;/g, '»')
    .replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();
  const manFile = path.resolve(__dirname, '..', 'platform', 'site', 'og-manifest.json');
  const man = fs.existsSync(manFile) ? JSON.parse(fs.readFileSync(manFile, 'utf8')) : {};
  const ogDir = path.join(ROOT, 'assets', 'og');
  const cat = fs.readFileSync(path.join(ROOT, 'moscow', 'index.html'), 'utf8');
  const cards = {};
  for (const m of cat.matchAll(/<li class="qcard"[^>]*data-case="(\d+)">([\s\S]*?)<\/li>/g)) {
    cards[m[1]] = { meta: plain((m[2].match(/<p class="qc-meta">([\s\S]*?)<\/p>/) || [])[1] || ''),
      ask: plain((m[2].match(/<a class="qc-btn"[^>]*>([\s\S]*?)<\/a>/) || [])[1] || ''),
      href: (m[2].match(/<a class="qc-btn" href="([^"]+)"/) || [])[1] || '' };
  }
  const sha = f => require('crypto').createHash('sha256').update(fs.readFileSync(f)).digest('hex');
  const used = new Set(['main.png']);
  for (const slug of fs.readdirSync(path.join(ROOT, 'moscow'))) {
    const pf = path.join(ROOT, 'moscow', slug, 'index.html');
    if (!fs.existsSync(pf)) continue;
    const h = fs.readFileSync(pf, 'utf8');
    const og = (h.match(/<meta property="og:image" content="([^"]+)"/) || [])[1];
    if (!og) continue;
    const pg = `moscow/${slug}/`;
    const f = (og.match(/\/assets\/og\/([\w.-]+)$/) || [])[1];
    if (!f || !fs.existsSync(path.join(ogDir, f))) { out.push(`${pg}: og:image ${og} — нет файла в site/assets/og/`); continue; }
    used.add(f);
    if (f === 'main.png') continue;
    const e = man[f];
    if (!e) { out.push(`${pg}: OG ${f} нарисован не make_og.py (нет в platform/site/og-manifest.json) — python3 scripts/make_og.py`); continue; }
    if (e.file_sha !== sha(path.join(ogDir, f))) out.push(`${pg}: OG ${f} заменён мимо make_og.py (хеш ≠ манифесту) — python3 scripts/make_og.py`);
    // H-114: мелкий текст OG на превью 600 px — не меньше 11 px (замер make_og.py)
    if (!(e.min_px_600 >= 11)) out.push(`${pg}: OG ${f} — ${e.min_px_600 == null ? 'нет замера мелкого текста на превью 600 px' : `мелкий текст на превью 600 px ${e.min_px_600} px (< 11)`} — python3 scripts/make_og.py (H-114)`);
    const card = Object.values(cards).find(k => k.href === slug + '/');
    const title = plain((h.match(/<meta property="og:title" content="([^"]+)"/) || [])[1] || '').split(' — ')[0];
    const inp = e.input || {};
    const t = s => String(s || '').replace(/ /g, ' ');
    if (!card) out.push(`${pg}: нет карточки дела в /moscow/ — OG не с чем сверить`);
    else {
      if (t(inp.meta) !== card.meta) out.push(`${pg}: на OG «${t(inp.meta)}», в карточке «${card.meta}» — python3 scripts/make_og.py`);
      if (t(inp.ask) !== card.ask) out.push(`${pg}: вопрос на OG «${t(inp.ask)}», в карточке «${card.ask}» — python3 scripts/make_og.py`);
    }
    if (t(inp.title) !== title) out.push(`${pg}: название на OG «${t(inp.title)}», в og:title «${title}» — python3 scripts/make_og.py`);
  }
  for (const f of fs.readdirSync(ogDir)) if (!used.has(f) && !(f in man)) out.push(`site/assets/og/${f}: картинка не нужна ни одной странице дела и не из make_og.py`);
  return out;
}

// Касания по точкам карты: 8 направлений вокруг каждой видимой точки-ссылки — в 12 px от центра,
// а у тесных точек (центр Москвы) — чуть ближе середины до соседней: касание уходит к ближайшей точке
async function mapTaps() {
  const out = [];
  const links = [...document.querySelectorAll('.city-map a.map-link')].filter(a => {
    const d = a.querySelector('circle.dot'); const r = d && d.getBoundingClientRect();
    return r && r.width > 0 && getComputedStyle(a).pointerEvents !== 'none' && !a.closest('[hidden]') && getComputedStyle(a.closest('svg')).display !== 'none';
  });
  for (const a of links) {
    const d = a.querySelector('circle.dot');
    const r0 = d.getBoundingClientRect(); // у страницы плавная прокрутка — прыгаем сразу
    window.scrollTo({ top: scrollY + r0.top - innerHeight / 2, behavior: 'instant' });
    await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
    const b = d.getBoundingClientRect(), cx = b.left + b.width / 2, cy = b.top + b.height / 2;
    const near = Math.min(...links.filter(o => o !== a).map(o => { const q = o.querySelector('circle.dot').getBoundingClientRect(); return Math.hypot(q.left + q.width / 2 - cx, q.top + q.height / 2 - cy); }));
    const R = Math.min(12, near / 2 - 2);
    const miss = [];
    for (let k = 0; k < 8; k++) {
      const x = cx + R * Math.cos(k * Math.PI / 4), y = cy + R * Math.sin(k * Math.PI / 4);
      const hit = document.elementFromPoint(x, y);
      if (!hit || hit.closest('a') !== a) miss.push(Math.round(k * 45) + '°' + (hit && hit.closest('a') ? ' → ' + (hit.closest('a').querySelector('title') || {}).textContent : ''));
    }
    if (miss.length) out.push(`карта: касание в ${Math.round(R)} px от точки «${(a.querySelector('title') || a).textContent.trim()}» мимо ссылки (${miss.join(', ')})`);
  }
  window.scrollTo({ top: 0, behavior: 'instant' });
  return out;
}

(async () => {
  const quick = 'sync' in args;
  const server = quick ? null : spawn('python3', ['-m', 'http.server', String(PORT), '--bind', '127.0.0.1'], { cwd: ROOT, stdio: 'ignore' });
  const stop = () => { try { if (server) server.kill(); } catch (e) {} };
  process.on('exit', stop);
  if (!quick) await waitServer();

  // Статические проверки файлов
  const spoilers = JSON.parse(fs.readFileSync(path.join(__dirname, 'site_spoilers.json'), 'utf8'));
  for (const f of listFiles()) {
    if (!/\.(html|txt|xml|json|js|css|svg)$/.test(f)) continue;
    const s = fs.readFileSync(f, 'utf8');
    if (/wikipedia\.org|wikimedia\.org/i.test(s)) err(path.relative(ROOT, f), '', 'ссылка на Wikipedia/Wikimedia');
    if (/Купить квест/.test(s)) err(path.relative(ROOT, f), '', 'подпись «Купить квест» — должно быть «Взять дело»');
  }
  questSync().forEach(m => err('сценарий ↔ витрина', '', m));
  ogSync().forEach(m => err('OG-картинки', '', m));
  llmsSync(spoilers).forEach(m => err('llms.txt ↔ дела', '', m));
  ldSync().forEach(m => err('JSON-LD', '', m));
  // предупреждения — не красное: печатаются в конце, выкладку не блокируют
  const warns = seoLengths().map(w => 'длина сниппета: ' + w);
  // H-111: временные объекты маршрута — за 30 дней предупреждение, после срока ошибка; сначала самопроверка на фикстуре
  const TMP = require('./temporary_check.js');
  TMP.selftest().forEach(m => err('временные объекты (самопроверка)', '', m));
  const tj = TMP.judge(TMP.allQuests(), args.today, true);
  tj.errors.forEach(m => err('временные объекты', '', m));
  tj.warns.forEach(w => warns.push('временный объект: ' + w));
  // ответы загадок из сценария (quest.json, у дел без него — «Ответ:» сценария) на витрине дела и в его карточках —
  // ошибка; осознанные находки — scripts/answer_leaks.json с причиной (scripts/answer_leaks.js); сначала самопроверка
  const LEAKS = require('./answer_leaks.js');
  LEAKS.selftest().forEach(m => err('ответы на витрине (самопроверка)', '', m));
  const al = LEAKS.check(LEAKS.allIds());
  al.errors.forEach(m => err('ответ загадки на витрине', '', m));
  al.warns.concat(al.info).forEach(w => warns.push('ответы на витрине: ' + w));
  // владелец 27.11 (в сетке «художники» ЗИЛАРТа у двух карточек из восьми нет года): поле, которое есть у большинства карточек
  // сетки витрины дела (год, источник, картинка, снимок), — у всех; исключение — явное year_none/…: «почему» в данных дела;
  // снимок или репродукция в карточке — с подписью-атрибуцией, width/height, lazy (scripts/card_grid_check.js)
  const CG = require('./card_grid_check.js');
  CG.selftest().forEach(m => err('сетки карточек (самопроверка)', '', m));
  const cg = CG.check();
  cg.errors.forEach(m => err('сетка карточек', '', m));
  cg.warns.forEach(w => warns.push('сетка карточек: ' + w));
  // владелец 27.11: «Проба» (фонарик на главной, лампа «Следами») — не ответ и не ход загадки ни одного дела
  LEAKS.checkProbes().forEach(m => err('«Проба» ↔ ответы дел', '', m));
  // T-140: дрейф сюжета — витрина сверена с текущей версией сценария (platform/site/story-sync.json), герои «Кто ведёт дело» —
  // среди speakers quest.json, снятое из сценария (quests/<id>/retired.json) не встречается на витрине, в OG, llms.txt и постах
  const SD = require('./story_drift.js');
  SD.selftest().forEach(m => err('витрина ↔ сценарий (самопроверка)', '', m));
  const sd = SD.check();
  sd.errors.forEach(m => err('витрина ↔ сценарий', '', m));
  sd.warns.forEach(w => warns.push('витрина ↔ сценарий: ' + w));
  // H-110: колонка «Где у игрока» в quests/<id>/research/facts.md — ❌ у игрока (и битая ссылка у факта ❌) — ошибка; мёртвый путь
  // у остальных фактов — предупреждение: учёт в research выкладку не блокирует (T-138, 27.11);
  // не ✅ у игрока, сокращённый путь, ссылка на текст без ключевых слов факта — предупреждение (scripts/facts_check.py)
  try {
    const fc = JSON.parse(require('child_process').execFileSync('python3', [path.join(__dirname, 'facts_check.py'), '--json'], { encoding: 'utf8' }));
    fc.errors.forEach(m => err('факты ↔ сценарий', '', m));
    fc.warns.forEach(w => warns.push('факты: ' + w));
  } catch (e) { err('факты ↔ сценарий', '', `scripts/facts_check.py не запустился: ${String(e.message).split('\n')[0]}`); }
  // 27.11 (итерация 28): последний шаг pages.yml — codes.py leakcheck (текст сцен дел в site/ дословно). Он краснел 7 выкладок подряд,
  // а команда узнавала об этом только из CI — стенд стоял на версии 27.11 утра. Теперь тот же leakcheck здесь, до push.
  try {
    require('child_process').execFileSync('python3', [path.join(__dirname, 'codes.py'), 'leakcheck', path.join(__dirname, '..', 'site')], { encoding: 'utf8', stdio: 'pipe' });
  } catch (e) {
    const out = String(e.stdout || e.message).split('\n').filter(l => l.includes('✗'));
    (out.length ? out : [String(e.message).split('\n')[0]]).forEach(l => err('текст дела на сайте дословно (leakcheck; перескажите, а не цитируйте сценарий)', '', l.trim()));
  }
  const warnReport = () => { if (warns.length) { console.log(`\n ! предупреждения (не красное): ${warns.length}`); warns.forEach(w => console.log('   ! ' + w)); } };
  const tone = toneCheck(); // T-65: штампы машинного текста — ошибка (красная проверка с 27.11)
  tone.forEach(t => err('тон текста', '', t));
  const toneReport = () => { if (tone.length) { console.log(`\n ✗ штампы машинного текста (ОШИБКА, правит Автор; ложные — в scripts/tone_stamps.json → site_exceptions): ${tone.length}`); tone.forEach(t => console.log('   ✗ ' + t)); } };
  if ('sync' in args) { // --sync: только сверка цифр со сценарием, без браузера
    stop(); toneReport(); warnReport(); errors.forEach(e => console.log(' ✗ ' + e)); console.log(errors.length ? `site_check --sync: ${errors.length} ошибок` : `site_check --sync: OK${tone.length ? ` (штампов тона: ${tone.length})` : ''}`); process.exit(errors.length ? 1 : 0);
  }

  let pages = listPages();
  if (args.only) pages = pages.filter(p => p.includes(args.only));
  const { chromium } = require('playwright');
  const browser = await chromium.launch();
  const checked = new Map();
  const caseSections = {};
  const catalogs = {}, casePages = {};
  const shots = args.shots;

  for (const rel of pages) {
    const isPlayer = rel.startsWith('play/');
    for (const vp of VIEWPORTS) {
      const ctx = await browser.newContext({ viewport: vp, deviceScaleFactor: 1 });
      const page = await ctx.newPage();
      const consoleErr = [];
      const blocked = new Set();
      await page.route('**/*', route => {
        const u = route.request().url();
        const qm = u.match(/\/play\/([^/]+)\/quest\.locked\.json/);
        if (qm && u.startsWith(BASE)) { // на стенде зашифрованное дело собирает pages.yml (scripts/codes.py seal); здесь — с тестовыми кодами
          const f = lockedFor(qm[1]);
          if (f) return route.fulfill({ path: f, contentType: 'application/json' });
        }
        if (u.startsWith(BASE)) return route.continue();
        blocked.add(u); return route.abort();
      });
      page.on('console', m => {
        const tx = m.text();
        if (m.type() === 'error' && !/ERR_FAILED|ERR_BLOCKED|net::/.test(tx)) consoleErr.push(tx);
        if (m.type() === 'warning' && /preload/i.test(tx)) consoleErr.push('предупреждение: ' + tx);
      });
      page.on('pageerror', e => consoleErr.push('JS: ' + e.message));
      page.on('response', r => { const u = r.url(); if (u.startsWith(BASE) && r.status() >= 400) err(rel, vp.width, `ресурс ${u.replace(BASE, '')} → ${r.status()}`); });
      await page.goto(BASE + '/' + rel, { waitUntil: 'load' });
      await page.waitForTimeout(600);
      const r = await page.evaluate(inPage, MAIN_CTA);
      r.problems.forEach(p => err(rel, vp.width, p));
      // T-61: на телефоне касание рядом с точкой карты попадает в её ссылку (зона ≥ 44 px; в тесном центре — до середины до соседней)
      if (vp.width === 390) (await page.evaluate(mapTaps)).forEach(p => err(rel, vp.width, p));
      // T-62: на главной лента каталога не длиннее нужного. Порог поднят 26.11 (1688 → 1800 px от верха страницы): владелец вернул
      // обложкам 4:3 — его указание важнее H-9. 27.11 над лентой встала «Проба» (указание владельца) — меряем саму ленту:
      // от #quests до «Как это выглядит» не больше 812 px (= прежние 1800 − 988 px первого экрана)
      if (vp.width === 390 && rel === '') {
        const y = await page.evaluate(() => { const s = document.querySelector('.screens-sec'), q = document.getElementById('quests'); return s && q ? Math.round(s.getBoundingClientRect().top - q.getBoundingClientRect().top) : 0; });
        if (y >= 812) err(rel, vp.width, `лента каталога (от #quests до «Как это выглядит») — ${y} px (нужно меньше 812): лента выросла`);
      }
      // владелец 27.11: «Проба» ([data-lamp]: фонарик главной, лампа «Следами») — без JS и при reduced-motion ответ виден сразу;
      // с JS скрыт, кнопка света ≥ 44 px, с клавиатуры проявляет ответ и переводит фокус на следующий шаг
      if (vp.width === 390 && await page.$('[data-lamp]')) (await lampCheck(browser, BASE + '/' + rel)).forEach(p => err(rel, vp.width, p));
      // владелец 27.11: город в заголовке витрины (site/assets/city.js) — барабан переключает город, тексты меняются вместе с ним,
      // выбор запоминается, ссылка на вторую марку несёт город; блок «Другой формат» ведёт на вторую марку
      if (vp.width === 390 && await page.$('[data-city-drum]')) {
        const vis = () => page.evaluate(() => [...document.querySelectorAll('h1, h2')].filter(e => e.offsetParent !== null).map(e => { const c = e.cloneNode(true); c.querySelectorAll('.city-reel, .city-pop').forEach(x => x.remove()); return c.textContent.replace(/\s+/g, ' '); }).join(' | '));
        if (!(await page.$('.city-btn[aria-haspopup="listbox"]'))) err(rel, vp.width, 'город: нет кнопки-барабана в заголовке');
        else {
          await page.click('.city-btn'); await page.waitForTimeout(150);
          const opts = await page.$$eval('.city-pop:not([hidden]) [role="option"]', o => o.map(x => x.dataset.id));
          if (opts.length < 2 || !opts.includes('spb')) err(rel, vp.width, `город: в списке городов ${JSON.stringify(opts)}`);
          if (await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)) err(rel, vp.width, 'город: открытый список даёт горизонтальный скролл');
          await page.click('.city-pop [data-id="spb"]'); await page.waitForTimeout(700);
          const h = await vis();
          if (await page.evaluate(() => document.documentElement.dataset.city) !== 'spb') err(rel, vp.width, 'город: выбор Петербурга не применился');
          if (/Москв/.test(h) || !/Петербург/.test(h)) err(rel, vp.width, `город: в заголовках после выбора Петербурга — «${h.slice(0, 160)}»`);
          if (!(await page.$('.city-soon:not([hidden])'))) err(rel, vp.width, 'город «скоро»: нет блока «скоро»');
          if (await page.$$eval('[data-city-only="live"]', e => e.some(x => x.offsetParent !== null))) err(rel, vp.width, 'город «скоро»: видны блоки открытого города (дела Москвы)');
          const cross = await page.$eval('#other a[data-city-href]', a => a.getAttribute('href')).catch(() => null);
          if (!cross || !/[?&]city=spb/.test(cross)) err(rel, vp.width, `«Другой формат»: ссылка на вторую марку без города (${cross})`);
          await page.reload({ waitUntil: 'load' }); await page.waitForTimeout(400);
          if (await page.evaluate(() => document.documentElement.dataset.city) !== 'spb') err(rel, vp.width, 'город: выбор не запомнился после перезагрузки');
          await page.click('.city-soon [data-city-set="moscow"]'); await page.waitForTimeout(700);
          if (!/Москв/.test(await page.$eval('h1', e => e.textContent).catch(() => '')) && rel === '') err(rel, vp.width, 'город: «Пока — дела в Москве» не вернул Москву');
          if (await page.evaluate(() => document.documentElement.dataset.city) !== 'moscow') err(rel, vp.width, 'город: кнопка возврата в Москву не сработала');
          await page.evaluate(() => { try { localStorage.removeItem('dvorami:city'); } catch (e) {} });
        }
      }
      // владелец 25–26.11: обложки карточек не уменьшать — на любой ширине высота ≥ 0,74 ширины (4:3); и никаких «Новое дело»
      (await page.evaluate(() => [...document.querySelectorAll('.qgrid .qcard .qc-cover')].map(c => { const b = c.getBoundingClientRect(); return b.width ? b.height / b.width : 1; })))
        .forEach((k, i) => { if (k < 0.74) err(rel, vp.width, `обложка карточки ${i + 1} сплющена: высота/ширина ${k.toFixed(2)} (нужно 4:3)`); });
      if (await page.evaluate(() => /Новое дело/.test(document.body.innerText))) err(rel, vp.width, 'на странице «Новое дело» — владелец 26.11: не показываем');
      r.anchorsMissing.forEach(a => err(rel, vp.width, `ссылка на несуществующий якорь #${a}`));
      for (const l of r.links) {
        if (!l.startsWith(BASE)) continue;
        const u = l.split('#')[0];
        if (!checked.has(u)) checked.set(u, await status(u));
        if (checked.get(u) !== 200) err(rel, '', `локальная ссылка ${u.replace(BASE, '')} → ${checked.get(u)}`);
      }
      // Спойлеры: слова, которых не должно быть на странице дела/главной
      for (const [key, words] of Object.entries(spoilers)) {
        if (key.startsWith('_')) continue;
        if (!(key === '*' || rel.startsWith(key))) continue;
        for (const w of words) if (r.text.toLowerCase().includes(w.toLowerCase())) err(rel, vp.width, `спойлер на странице: «${w}»`);
      }
      if (vp.width === VIEWPORTS[0].width) {
        if (r.cards.length) catalogs[rel] = r.cards;
        if (r.casePage) casePages[rel] = r.casePage;
      }
      if (CASE_RE.test(rel)) {
        caseSections[rel] = r.sections.join(' > ');
        const c = r.ctas;
        if (!c.header || c.header !== MAIN_CTA) err(rel, vp.width, `кнопка в шапке: «${c.header}» вместо «${MAIN_CTA}»`);
        if (!c.hero || !c.hero.startsWith(MAIN_CTA)) err(rel, vp.width, `кнопка первого экрана: «${c.hero}» вместо «${MAIN_CTA}…»`);
        if (!c.fab || !c.fab.startsWith(MAIN_CTA)) err(rel, vp.width, `плавающая кнопка: «${c.fab}» вместо «${MAIN_CTA}…»`);
      }
      if (!isPlayer) {
        const miss = await ctaAlwaysThere(page);
        if (miss.length) err(rel, vp.width, `при прокрутке вниз нет ни одного CTA на экране на высоте ${miss.join(', ')}`);
      }
      consoleErr.forEach(e => err(rel, vp.width, 'консоль: ' + e.slice(0, 200)));
      if (shots) {
        fs.mkdirSync(shots, { recursive: true });
        await page.evaluate(() => window.scrollTo(0, 0)); await page.waitForTimeout(300);
        await page.screenshot({ path: path.join(shots, (rel.replace(/\//g, '_') || 'home') + '-' + vp.width + '.jpg'), fullPage: true, quality: 80 }); /* полностраничные — JPEG: PNG весит 2–10 МБ */
      }
      await ctx.close();
    }
  }
  await browser.close();

  // Страницы дел: одинаковый набор и порядок блоков
  const variants = {};
  for (const [p, s] of Object.entries(caseSections)) (variants[s] = variants[s] || []).push(p);
  if (Object.keys(variants).length > 1) {
    err('страницы дел', '', 'разный набор блоков:\n    ' + Object.entries(variants).map(([s, p]) => `${p.join(', ')}: ${s}`).join('\n    '));
  }

  // Карточка дела в каталоге = страница дела (H-5, 23.11: на главной и в /moscow/ разошёлся тизер дела №4).
  // Карточки собирает build_cases.py из поля card; здесь ловим ручную правку и расхождение цифр с паспортом дела.
  const byNo = {};
  for (const [cat, cards] of Object.entries(catalogs)) {
    for (const k of cards) {
      const where = `${cat || 'главная'}, карточка дела №${k.no}`;
      const crel = k.href.startsWith(BASE + '/') ? k.href.slice(BASE.length + 1).split('#')[0] : '';
      const cp = casePages[crel];
      if (!cp) { if (!args.only) err(where, '', `ссылка «Подробнее» ведёт не на страницу дела: ${k.href.replace(BASE, '')}`); continue; }
      if (cp.plaque !== `Дело №${k.no} · ${k.title}`) err(where, '', `номер/название «Дело №${k.no} · ${k.title}» ≠ странице дела «${cp.plaque}»`);
      if (!k.badge || !cp.status.startsWith(k.badge)) err(where, '', `статус «${k.badge}» ≠ странице дела «${cp.status}»`);
      const segs = k.meta.split(' · ');
      for (const f of cp.facts) {
        if (f.n === 'М') {
          const m = f.full.match(/«[^»]+»/);
          if (m && !k.meta.includes(m[0])) err(where, '', `метро в карточке («${k.meta}») ≠ странице дела (${m[0]})`);
          continue;
        }
        const v = f.n.replace(/ ч$/, ' час');
        if (!segs.some(s => s.startsWith(v))) err(where, '', `в карточке («${k.meta}») нет «${f.n}» из цифр страницы дела`);
      }
      (byNo[k.no] = byNo[k.no] || []).push([cat || 'главная', k]);
    }
  }
  // H-38 (H-31): первая фраза тизера карточки — вопрос дела («Кто…?»), а не описание формата
  for (const [no, list] of Object.entries(byNo)) {
    const t = list[0][1].teaser;
    const first = (t.match(/^[^.?!…]*[.?!…]/) || [t])[0].trim();
    if (!first.endsWith('?')) err(`карточка дела №${no}`, '', `первая фраза тизера не вопрос: «${first.slice(0, 60)}» — начните card.teaser с вопроса дела (H-31)`);
  }
  for (const [no, list] of Object.entries(byNo)) {
    const [c0, k0] = list[0];
    for (const [c1, k1] of list.slice(1)) for (const f of ['title', 'where', 'teaser', 'meta', 'badge', 'status']) {
      if (k0[f] !== k1[f]) err(`карточка дела №${no}`, '', `${c0} и ${c1} расходятся (${f}): «${k0[f]}» / «${k1[f]}» — карточки собирает build_cases.py из поля card`);
    }
  }
  if (!args.only) for (const cat of ['', 'moscow/']) for (const p of Object.keys(casePages)) {
    if (!(catalogs[cat] || []).some(k => k.href === `${BASE}/${p}`)) err(cat || 'главная', '', `нет карточки дела ${p}`);
  }

  stop();
  toneReport();
  warnReport();
  const uniq = [...new Set(errors)];
  if (uniq.length) {
    console.log(`site_check: ${uniq.length} ошибок на ${pages.length} страницах\n`);
    uniq.forEach(e => console.log(' ✗ ' + e));
    process.exit(1);
  }
  console.log(`site_check: OK — ${pages.length} страниц × ${VIEWPORTS.length} ширины, ${checked.size} локальных ссылок, блоки дел одинаковые: ${Object.values(caseSections)[0] || '—'}`);
  process.exit(0);
})().catch(e => { console.error(e); process.exit(2); });

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
 * Выход: 0 — всё чисто, 1 — список ошибок.
 * Правило команды: перед сдачей любой правки сайта — этот скрипт зелёный.
 */
'use strict';
const { chromium } = require('playwright');
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
  const server = spawn('python3', ['-m', 'http.server', String(PORT), '--bind', '127.0.0.1'], { cwd: ROOT, stdio: 'ignore' });
  const stop = () => { try { server.kill(); } catch (e) {} };
  process.on('exit', stop);
  await waitServer();

  // Статические проверки файлов
  const spoilers = JSON.parse(fs.readFileSync(path.join(__dirname, 'site_spoilers.json'), 'utf8'));
  for (const f of listFiles()) {
    if (!/\.(html|txt|xml|json|js|css|svg)$/.test(f)) continue;
    const s = fs.readFileSync(f, 'utf8');
    if (/wikipedia\.org|wikimedia\.org/i.test(s)) err(path.relative(ROOT, f), '', 'ссылка на Wikipedia/Wikimedia');
    if (/Купить квест/.test(s)) err(path.relative(ROOT, f), '', 'подпись «Купить квест» — должно быть «Взять дело»');
  }

  let pages = listPages();
  if (args.only) pages = pages.filter(p => p.includes(args.only));
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
      // T-62: на главной лента каталога не длиннее нужного — «Как это выглядит» начинается выше 1688 px (второй экран телефона)
      if (vp.width === 390 && rel === '') {
        const y = await page.evaluate(() => { const s = document.querySelector('.screens-sec'); return s ? Math.round(s.getBoundingClientRect().top + scrollY) : 0; });
        // порог поднят 26.11 (1688 → 1800): владелец вернул обложкам 4:3 — его указание важнее H-9
        if (y >= 1800) err(rel, vp.width, `блок «Как это выглядит» начинается на ${y} px (нужно выше 1800): лента каталога выросла`);
      }
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
  const uniq = [...new Set(errors)];
  if (uniq.length) {
    console.log(`site_check: ${uniq.length} ошибок на ${pages.length} страницах\n`);
    uniq.forEach(e => console.log(' ✗ ' + e));
    process.exit(1);
  }
  console.log(`site_check: OK — ${pages.length} страниц × ${VIEWPORTS.length} ширины, ${checked.size} локальных ссылок, блоки дел одинаковые: ${Object.values(caseSections)[0] || '—'}`);
  process.exit(0);
})().catch(e => { console.error(e); process.exit(2); });

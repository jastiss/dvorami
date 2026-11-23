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
 *   - карточка дела в каталоге (главная, /moscow/) = страница дела: номер, название, статус, цифры, метро; карточки двух каталогов одинаковые;
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
        const qm = u.match(/\/play\/([^/]+)\/quest\.json/);
        if (qm && u.startsWith(BASE)) { // на стенде quest.json кладёт сборка Pages из quests/<id>/quest.json
          const f = path.resolve(__dirname, '..', 'quests', qm[1], 'quest.json');
          if (fs.existsSync(f)) return route.fulfill({ path: f, contentType: 'application/json' });
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

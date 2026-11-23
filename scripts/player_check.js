#!/usr/bin/env node
/* Автотест плеера «Дворами»: node scripts/player_check.js [--quest=zilart] [--page=путь/к/странице/] [--shots=папка]
 *
 * Проходит дело целиком в настоящем плеере (site/play/<id>/) по данным quests/<id>/quest.json — от обложки до финала —
 * на 390, 1024 и 1440 px, в тёмной и светлой теме. Внешние запросы блокируются. Проверяет каркас экрана
 * (platform/design/player-frame.md) на каждом экране прохождения:
 *   - нет ошибок JS и консоли, нет горизонтального скролла;
 *   - навигация — ровно три раздела «Точка · Улики · Карта», области касания ≥ 44 px;
 *   - текст ≥ 13 px (подписи подсказок ≥ 15 px), контраст текста ≥ 4,5:1 (крупного ≥ 3:1), рамок полей и кнопок ≥ 3:1;
 *   - у кнопок и подсказок нет opacity < 1; в интерфейсе нет эмодзи;
 *   - верный ответ принимается, неверный — нет, подсказки открываются по одной, улики копятся, прогресс переживает перезагрузку.
 * Выход: 0 — всё чисто, 1 — список ошибок.
 */
'use strict';
const { chromium } = require('playwright');
const http = require('http');
const fs = require('fs');
const path = require('path');

const REPO = path.resolve(__dirname, '..');
const args = Object.fromEntries(process.argv.slice(2).map(a => a.replace(/^--/, '').split('=')));
const QID = args.quest || 'zilart';
const PAGE = args.page || `site/play/${QID}/`;          // путь от корня репозитория
const QUEST = args.data || path.join(REPO, 'quests', QID, 'quest.json');
const Q = JSON.parse(fs.readFileSync(QUEST, 'utf8'));
const PORT = 9000 + Math.floor(Math.random() * 900);
const BASE = `http://127.0.0.1:${PORT}`;
const TYPES = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.json': 'application/json', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.png': 'image/png', '.jpg': 'image/jpeg' };

const errors = [];
const err = (where, msg) => errors.push(`${where}: ${msg}`);

const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]);
  if (p.endsWith('/')) p += 'index.html';
  const f = path.join(REPO, p);
  if (!f.startsWith(REPO) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream' });
  fs.createReadStream(f).pipe(res);
});

// Проверки одного экрана — выполняются в странице
function audit() {
  const out = [];
  const lum = c => { const f = v => { v /= 255; return v <= .03928 ? v / 12.92 : Math.pow((v + .055) / 1.055, 2.4); }; return .2126 * f(c[0]) + .7152 * f(c[1]) + .0722 * f(c[2]); };
  const ratio = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + .05) / (Math.min(x, y) + .05); };
  const parse = s => { const m = s.match(/rgba?\(([^)]+)\)/); if (!m) return null; const p = m[1].split(/[, /]+/).map(Number); return [p[0], p[1], p[2], p.length > 3 ? p[3] : 1]; };
  const bgOf = el => {
    const stack = [];
    for (let e = el; e; e = e.parentElement) { const c = parse(getComputedStyle(e).backgroundColor); if (c && c[3] > 0) { stack.push(c); if (c[3] === 1) break; } }
    let base = [255, 255, 255];
    for (let i = stack.length - 1; i >= 0; i--) { const c = stack[i]; base = [0, 1, 2].map(k => c[k] * c[3] + base[k] * (1 - c[3])); }
    return base;
  };
  const visible = el => { const r = el.getBoundingClientRect(); const cs = getComputedStyle(el); return r.width > 1 && r.height > 1 && cs.visibility !== 'hidden' && cs.display !== 'none' && !el.closest('.visually-hidden, [hidden], dialog:not([open])'); };
  const name = el => (el.className && typeof el.className === 'string' ? '.' + el.className.split(' ')[0] : el.tagName.toLowerCase()) + ' «' + (el.textContent || '').trim().slice(0, 28) + '»';
  if (document.documentElement.scrollWidth > window.innerWidth) out.push(`горизонтальный скролл: ${document.documentElement.scrollWidth} > ${window.innerWidth}`);
  const root = document.querySelector('dialog[open]') || document.body;
  for (const el of root.querySelectorAll('*')) {
    if (!visible(el) || el.closest('svg') && el.tagName !== 'text') continue;
    const own = [...el.childNodes].some(n => n.nodeType === 3 && n.textContent.trim());
    const cs = getComputedStyle(el);
    if (own) {
      let size = parseFloat(cs.fontSize);
      if (el.tagName === 'text') { const svg = el.closest('svg'); size *= svg.getBoundingClientRect().width / svg.viewBox.baseVal.width; }
      if (size < 13) out.push(`текст мельче 13 px (${size}): ${name(el)}`);
      if (el.closest('.pl-hintbtn, .pl-hint') && size < 15) out.push(`подпись подсказки мельче 15 px (${size}): ${name(el)}`);
      const fg = parse(el.tagName === 'text' ? cs.fill : cs.color), bg = bgOf(el.tagName === 'text' ? el.closest('svg') : el);
      if (fg && el.tagName !== 'text') {
        const c = ratio(fg, bg), large = size >= 24 || (size >= 18.66 && parseInt(cs.fontWeight, 10) >= 700);
        if (c < (large ? 3 : 4.5)) out.push(`контраст текста ${c.toFixed(2)} (${cs.color} на rgb(${bg.map(Math.round)})): ${name(el)}`);
      }
      if (/\p{Extended_Pictographic}/u.test([...el.childNodes].filter(n => n.nodeType === 3).map(n => n.textContent).join('').replace(/[✓]/g, ''))) out.push(`эмодзи в интерфейсе: ${name(el)}`);
    }
    if (el.matches('button, a.pl-btn, input, textarea, .pl-hint, .pl-tag, .pl-stamp')) {
      for (let e = el; e && e !== document.body; e = e.parentElement) if (+getComputedStyle(e).opacity < 1 && !e.matches('.pl-toast')) { out.push(`opacity < 1: ${name(el)}`); break; }
    }
    if (el.matches('button, a.pl-btn, .pl-input, .pl-textarea')) {
      const r = el.getBoundingClientRect();
      if (r.height < 44 || r.width < 44) out.push(`область касания ${Math.round(r.width)}×${Math.round(r.height)}: ${name(el)}`);
    }
    if (el.matches('.pl-input, .pl-textarea, .pl-btn--ghost, .pl-task, .pl-seg, .pl-cat span')) {
      const bw = parseFloat(cs.borderTopWidth), bc = parse(cs.borderTopColor);
      if (bw > 0 && bc) { const c = ratio(bc, bgOf(el.parentElement)); if (c < 3) out.push(`контраст рамки ${c.toFixed(2)}: ${name(el)}`); }
    }
    if (el.matches('.pl-btn:not(.pl-btn--ghost)')) { const c = ratio(parse(cs.backgroundColor), bgOf(el.parentElement)); if (c < 3) out.push(`кнопка сливается с фоном (${c.toFixed(2)}): ${name(el)}`); }
  }
  const nav = document.getElementById('tabs');
  if (nav && !nav.hidden) {
    const labels = [...nav.querySelectorAll('button span')].map(s => s.textContent).join(' · ');
    if (labels !== 'Точка · Улики · Карта') out.push(`навигация: «${labels}» вместо «Точка · Улики · Карта»`);
    if (nav.querySelectorAll('[aria-current="page"]').length !== 1) out.push('навигация: активный раздел не отмечен');
  }
  return out;
}

(async () => {
  await new Promise(r => server.listen(PORT, '127.0.0.1', r));
  const browser = await chromium.launch();
  const firstAnswer = st => String(st.answers[0]).replace(/^~/, '');
  let screens = 0;

  for (const vp of [{ width: 390, height: 844 }, { width: 1024, height: 768 }, { width: 1440, height: 900 }]) {
    for (const theme of ['dark', 'sun']) {
      const tag = `${vp.width}/${theme}`;
      const ctx = await browser.newContext({ viewport: vp, deviceScaleFactor: 1, reducedMotion: 'reduce', serviceWorkers: 'block' });
      const page = await ctx.newPage();
      await page.route('**/*', route => {
        const u = route.request().url();
        if (/\/quest\.json(\?|$)/.test(u) && u.startsWith(BASE)) return route.fulfill({ path: QUEST, contentType: 'application/json' });
        return u.startsWith(BASE) ? route.continue() : route.abort();
      });
      page.on('console', m => { if (m.type() === 'error' && !/ERR_FAILED|ERR_BLOCKED|net::/.test(m.text())) err(tag, 'консоль: ' + m.text().slice(0, 200)); });
      page.on('pageerror', e => err(tag, 'JS: ' + e.message));
      page.on('dialog', d => d.accept());
      await page.addInitScript(t => { try { localStorage.setItem('dvorami:theme', t); } catch (e) {} }, theme);
      await page.goto(`${BASE}/${PAGE}`, { waitUntil: 'load' });
      await page.waitForSelector('[data-act="start"]');
      const state = () => page.evaluate(() => window.__dvorami.state());
      const check = async where => { screens++; (await page.evaluate(audit)).forEach(m => err(`${tag} · ${where}`, m)); };
      const click = sel => page.click(sel);
      const shot = async name => { if (args.shots && theme === 'dark') { fs.mkdirSync(args.shots, { recursive: true }); await page.waitForTimeout(150); await page.screenshot({ path: path.join(args.shots, `${name}-${vp.width}.png`) }); } };

      await check('обложка');
      await click('[data-act="start"]'); await check('вступление');
      await click('[data-act="go"]');
      for (const [pi, p] of Q.points.entries()) {
        const at = `точка ${p.n}`;
        if ((await state()).phase !== 'walk') { err(tag, `${at}: нет экрана дороги`); break; }
        await check(at + ' · дорога');
        if (pi === 1) {
          await click('[data-view="map"]'); await check(at + ' · карта');
          await click('[data-view="board"]'); await check(at + ' · улики');
          await click('[data-view="point"]');
          await click('[data-act="menu"]'); await check(at + ' · меню'); await click('[data-act="close"]');
          await page.reload({ waitUntil: 'load' }); await page.waitForSelector('[data-act="here"]');
          const s = await state();
          if (s.p !== pi || s.phase !== 'walk') err(tag, `${at}: прогресс не пережил перезагрузку`);
        }
        await click('[data-act="here"]');
        for (const [si, st] of p.steps.entries()) {
          const sat = `${at} шаг ${si + 1}`;
          const s0 = await state();
          if (s0.phase !== 'step' || s0.k !== si) { err(tag, `${sat}: ожидали шаг ${si + 1}, состояние ${s0.phase}/${s0.k}`); break; }
          if (si === 0 || st.type !== 'info') await check(sat);
          if (st.type === 'info' || st.type === 'board') { await click('#active [data-act="next"]'); continue; }
          if (st.type === 'free') { await page.fill('#ans', '10'); await click('#active button[type="submit"]'); continue; }
          // загадка: неверный ответ не проходит
          if (si % 2 === 0) {
            await page.fill('#ans', 'заведомо неверно'); await click('#active button[type="submit"]');
            if ((await state()).k !== si) err(tag, `${sat}: принят неверный ответ`);
            if (!(await page.$('.pl-wrong'))) err(tag, `${sat}: нет сообщения о неверном ответе`);
          }
          const hints = st.hints || [];
          if (pi % 4 === 2 && si === p.steps.findIndex(x => x.type === 'ask') && hints.length) {
            // путь через подсказки до ответа
            for (let h = 0; h < hints.length; h++) {
              if ((await page.$$('#active .pl-hint')).length !== h) err(tag, `${sat}: открыто подсказок не ${h}`);
              await click('#active [data-act="hint"]');
            }
            await check(sat + ' · ответ показан');
            await click('#active [data-act="reveal"]');
          } else {
            if (hints.length && si % 2 === 1) { await click('#active [data-act="hint"]'); await check(sat + ' · подсказка'); }
            await page.fill('#ans', firstAnswer(st)); await click('#active button[type="submit"]');
            if ((await state()).k === si && (await state()).phase === 'step') err(tag, `${sat}: не принят верный ответ «${firstAnswer(st)}»`);
          }
        }
        const s1 = await state();
        if (s1.phase !== 'point_done') { err(tag, `${at}: точка не закрылась (${s1.phase}/${s1.k})`); break; }
        await check(at + ' · пройдена');
        if (pi === 3) {
          await shot('player-clue');
          await click('[data-view="board"]'); await check(at + ' · улики'); await shot('player-board');
          await click('[data-view="map"]'); await check(at + ' · карта'); await shot('player-map');
          await click('[data-view="point"]');
        }
        await click('[data-act="nextpoint"]');
      }
      const end = await state();
      const clues = Q.points.filter(p => p.clue).length;
      if (end.phase !== 'done') err(tag, `финал не достигнут: ${end.phase}, точка ${end.p + 1}`);
      else {
        await check('финал');
        if (end.board.length !== clues) err(tag, `улик ${end.board.length}, ожидали ${clues}`);
        await click('[data-view="board"]'); await check('финал · улики');
        await click('[data-view="map"]'); await check('финал · карта');
      }
      await ctx.close();
    }
  }
  await browser.close();
  server.close();
  const uniq = [...new Set(errors)];
  if (uniq.length) {
    console.log(`player_check: ${uniq.length} ошибок\n`);
    uniq.slice(0, 80).forEach(e => console.log(' ✗ ' + e));
    process.exit(1);
  }
  console.log(`player_check: OK — «${Q.title}»: ${Q.points.length} точек пройдено от обложки до финала × 3 ширины × 2 темы, проверено экранов: ${screens}`);
  process.exit(0);
})().catch(e => { console.error(e); process.exit(2); });

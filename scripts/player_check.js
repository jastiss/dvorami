#!/usr/bin/env node
/* Автотест плеера «Дворами»: node scripts/player_check.js [--quest=zilart] [--page=путь/к/странице/] [--shots=папка]
 *   [--data=quest.json] — открытое дело без кода (макеты тем); без --data дело шифруется на лету, как в pages.yml.
 *
 * Проходит дело целиком в настоящем плеере (site/play/<id>/) по данным quests/<id>/quest.json — от обложки до финала —
 * на 390, 1024 и 1440 px, в тёмной и светлой теме. Внешние запросы блокируются. Проверяет каркас экрана
 * (platform/design/player-frame.md) на каждом экране прохождения:
 *   - нет ошибок JS и консоли, нет горизонтального скролла;
 *   - навигация — ровно три раздела «Точка · Улики · Карта», области касания ≥ 44 px;
 *   - текст ≥ 13 px (подписи подсказок ≥ 15 px), контраст текста ≥ 4,5:1 (крупного ≥ 3:1), рамок полей и кнопок ≥ 3:1;
 *   - у кнопок и подсказок нет opacity < 1; в интерфейсе нет эмодзи;
 *   - верный ответ принимается, неверный — нет, подсказки открываются по одной, улики копятся, прогресс переживает перезагрузку;
 *   - код доступа (docs/codes.md): дело шифруется на лету тестовыми кодами (scripts/codes.py selftest-bundle, в репозиторий
 *     не попадают); экран кода проходит аудит, неверный и отозванный код — понятная ошибка, верный (мастер, выпущенный,
 *     из ссылки #code=) открывает дело, код запоминается и переживает перезагрузку;
 *   - цели Метрики экрана кода (T-69): code_fail с причиной (wrong, bad_chars, length…) на каждую ошибку, code_ok (typed/link)
 *     после верного кода; сам код в параметры целей не попадает;
 *   - на 390 главная кнопка шага видна без прокрутки и не закрыта навигацией (T-60).
 * Выход: 0 — всё чисто, 1 — список ошибок.
 */
'use strict';
const { chromium } = require('playwright');
const { execFileSync } = require('child_process');
const os = require('os');
const http = require('http');
const fs = require('fs');
const path = require('path');

const REPO = path.resolve(__dirname, '..');
const args = Object.fromEntries(process.argv.slice(2).map(a => a.replace(/^--/, '').split('=')));
const QID = args.quest || 'zilart';
const PAGE = args.page || `site/play/${QID}/`;          // путь от корня репозитория
const QUEST = args.data || path.join(REPO, 'quests', QID, 'quest.json');
const Q = JSON.parse(fs.readFileSync(QUEST, 'utf8'));
// Без --data — как на стенде: дело зашифровано, коды — тестовые, только на время прогона
const SEALED = !args.data;
const BUNDLE = SEALED ? JSON.parse(execFileSync('python3', [path.join(REPO, 'scripts', 'codes.py'), 'selftest-bundle', '--quest', QID,
  '--out', fs.mkdtempSync(path.join(os.tmpdir(), 'dvorami-codes-'))], { encoding: 'utf8' }).trim().split('\n').pop()) : null;
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

// T-60: главная кнопка шага видна целиком между шапкой и навигацией и не закрыта ничем
function stickAudit() {
  if (document.querySelector('dialog[open]')) return [];
  // своя кнопка задания прилипает над навигацией; если само задание ниже экрана — вместо неё «К заданию»
  const fl = document.getElementById('float');
  const box = fl && !fl.hidden ? fl : document.querySelector('.pl-stick');
  const btn = box && box.querySelector('.pl-btn:not(.pl-btn--ghost)');
  if (!btn) return [];
  const r = btn.getBoundingClientRect();
  const nav = document.getElementById('tabs');
  const bottom = nav && !nav.hidden ? nav.getBoundingClientRect().top : innerHeight;
  const top = document.querySelector('.pl-top').getBoundingClientRect().bottom;
  const name = `«${btn.textContent.trim()}»`;
  if (r.top < top - 1 || r.bottom > bottom + 1) return [`главная кнопка ${name} не видна без прокрутки (${Math.round(r.top)}–${Math.round(r.bottom)}, видно ${Math.round(top)}–${Math.round(bottom)})`];
  const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
  if (!hit || hit.closest('.pl-btn') !== btn) return [`главная кнопка ${name} закрыта другим элементом`];
  return [];
}
const settle = () => new Promise(r => { let y = -1, n = 0; const f = () => { if (scrollY === y) { if (++n > 3) return r(); } else { y = scrollY; n = 0; } requestAnimationFrame(f); }; f(); });

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
        if (/\/quest\.locked\.json(\?|$)/.test(u) && u.startsWith(BASE)) return SEALED ? route.fulfill({ path: BUNDLE.locked, contentType: 'application/json' }) : route.fulfill({ status: 404 });
        if (/\/quest\.json(\?|$)/.test(u) && u.startsWith(BASE)) return SEALED ? route.fulfill({ status: 404 }) : route.fulfill({ path: QUEST, contentType: 'application/json' });
        return u.startsWith(BASE) ? route.continue() : route.abort();
      });
      page.on('console', m => {
        if (m.type() !== 'error' || /ERR_FAILED|ERR_BLOCKED|net::/.test(m.text())) return;
        if (!SEALED && /quest\.locked\.json/.test((m.location() || {}).url || '')) return; // открытое дело: зашифрованного нет — так и задумано
        err(tag, 'консоль: ' + m.text().slice(0, 200));
      });
      page.on('pageerror', e => err(tag, 'JS: ' + e.message));
      page.on('dialog', d => d.accept());
      await page.addInitScript(t => { try { localStorage.setItem('dvorami:theme', t); } catch (e) {} }, theme);
      // цели Метрики (T-69): перехватываем window.dvoramiTrack, даже если analytics.js его переопределит
      await page.addInitScript(() => {
        window.__goals = []; let real = null;
        const wrap = (g, p) => { window.__goals.push([g, Object.assign({}, p)]); if (real) try { real(g, p); } catch (e) {} };
        Object.defineProperty(window, 'dvoramiTrack', { configurable: true, get: () => wrap, set: f => { real = f; } });
      });
      const goals = () => page.evaluate(() => window.__goals);
      const lastGoal = async name => (await goals()).filter(([g]) => g === name).pop();
      const state = () => page.evaluate(() => window.__dvorami.state());
      const click = sel => page.click(sel);
      const check = async where => {
        screens++; (await page.evaluate(audit)).forEach(m => err(`${tag} · ${where}`, m));
        if (vp.width < 1024) {
          await page.evaluate(settle); (await page.evaluate(stickAudit)).forEach(m => err(`${tag} · ${where}`, m));
          if (await page.isVisible('#float')) { // «К заданию» ведёт к заданию, и там главная кнопка уже на экране
            await page.click('#float button'); await page.waitForTimeout(50); await page.evaluate(settle);
            if (await page.isVisible('#float')) err(`${tag} · ${where}`, '«К заданию» не привела к главной кнопке');
            else (await page.evaluate(stickAudit)).forEach(m => err(`${tag} · ${where} · после «К заданию»`, m));
          }
        }
      };
      // ссылка с кодом (как после оплаты) — в одном прогоне; в остальных — экран кода и ввод руками
      const viaLink = SEALED && vp.width === 390 && theme === 'sun';
      await page.goto(`${BASE}/${PAGE}` + (viaLink ? `#code=${BUNDLE.code}` : ''), { waitUntil: 'load' });
      if (SEALED && !viaLink) {
        await page.waitForSelector('form[data-form="code"]');
        await check('код доступа');
        const tryCode = async (code, expect, reason) => {
          const before = (await goals()).length;
          await page.fill('#code', code); await click('#code-go');
          await page.waitForFunction(() => !document.querySelector('#code-go[aria-busy]'));
          const msg = await page.$eval('#code-err', e => e.textContent).catch(() => '');
          if (!msg.includes(expect)) err(tag, `код «${code}»: ожидали ошибку «${expect}», получили «${msg}»`);
          const g = (await goals()).slice(before).filter(([n]) => n === 'code_fail');
          if (g.length !== 1 || g[0][1].reason !== reason || g[0][1].source !== 'typed') err(tag, `код «${code}»: ожидали одну цель code_fail (reason=${reason}, source=typed), получили ${JSON.stringify(g)}`);
        };
        await tryCode('ABCD-EFGH', 'не подошёл', 'wrong');
        await check('код доступа · ошибка');
        await tryCode(BUNDLE.revoked, 'не подошёл', 'wrong');
        await tryCode('AB0D-EF1H', 'нет букв O, I, L', 'bad_chars');
        await tryCode('ABC', 'В коде 8 знаков', 'length');
        // мастер-код набирают как удобно: строчными, без дефисов; выпущенный — как в письме
        await page.fill('#code', theme === 'dark' ? BUNDLE.master.toLowerCase().replace(/-/g, ' ') : BUNDLE.code);
        await click('#code-go');
      }
      await page.waitForSelector('[data-act="start"]');
      if (viaLink && /code=/.test(page.url())) err(tag, 'код остался в адресе страницы после входа по ссылке');
      if (SEALED) {
        const ok = await lastGoal('code_ok');
        if (!ok || ok[1].source !== (viaLink ? 'link' : 'typed') || ok[1].quest !== QID) err(tag, `после верного кода нет цели code_ok (source=${viaLink ? 'link' : 'typed'}): ${JSON.stringify(ok)}`);
        const codes = [BUNDLE.code, BUNDLE.master, BUNDLE.revoked].map(c => c.replace(/-/g, '').toUpperCase());
        if ((await goals()).some(([, p]) => codes.some(c => JSON.stringify(p).toUpperCase().replace(/-/g, '').includes(c)))) err(tag, 'код доступа ушёл в параметры цели Метрики');
      }
      if (SEALED && !(await page.evaluate(k => { try { return localStorage.getItem(k); } catch (e) { return null; } }, 'dvorami:code:' + QID))) err(tag, 'код не запомнился на устройстве');
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

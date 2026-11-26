#!/usr/bin/env node
/* Автотест плеера «Дворами»: node scripts/player_check.js [--quest=zilart] [--page=путь/к/странице/] [--shots=папка]
 *   [--data=quest.json] — открытое дело без кода (макеты тем); без --data дело шифруется на лету, как в pages.yml.
 *   [--flags=st4:B,st10:B] — ветки А/Б; [--allow-missing-media] — для теста заглушек картинок.
 *   Формат 5 целиком: node scripts/player_check.js --data=scripts/fixtures/quest-format5.json --allow-missing-media
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
 *   - на 390 главная кнопка шага видна без прокрутки и не закрыта навигацией (T-60);
 *   - мини-шаги (quests/<id>/field/player-ui-v2.md): каждый новый экран начинается сверху (прокрутка 0, начало экрана на виду),
 *     поле ответа — в верхней части экрана и не сдвигается, когда открывается клавиатура (высота окна уменьшается),
 *     неверный ответ не перерисовывает поле; «назад» и оглавление открывают любой пройденный мини-шаг только для просмотра,
 *     «К текущему шагу» возвращает; в оглавлении нет ни одного непройденного экрана и названий точек впереди;
 *     у каждого свёрнутого блока — треугольная стрелка; режим «Читаю» убирает плеер реплик, «Слушаю и читаю» — показывает;
 *     при prefers-reduced-motion ни одна анимация не идёт; место в точке переживает перезагрузку;
 *   - финал: карточка «Дело № N · РАСКРЫТО» без слов-ответов, пять звёзд (оценка сохраняется на телефоне), отзыв в Telegram (done_<дело>);
 *   - формат 5 (docs/quest-format.md): реплики, варианты (choice), выбор карточек доски (pick), «вычеркни лишнее» (strike),
 *     ответ из частей (all) и «почти» (replies), вопросы на ходу (walk_ask), письмо-улика в шторке, задание для детей,
 *     «стрелки» показываются один раз; ветки А/Б — прогон с ?flags= (--flags=st4:B).
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
const RAW = JSON.parse(fs.readFileSync(QUEST, 'utf8'));
// Ветки А/Б — как в плеере: элемент списка с "if" остаётся, только если флаг совпал (по умолчанию «A»)
const FLAGS = Object.assign({}, RAW.flags || {});
if (args.flags) args.flags.split(',').forEach(p => { const [k, v] = p.split(/[:=]/); if (k && v) FLAGS[k] = v; });
const flag = k => String(FLAGS[k] || 'A');
const passes = c => {
  if (!c) return true;
  if (typeof c === 'string') { const m = c.match(/^\s*([\w-]+)\s*(!?=)\s*(.+?)\s*$/); if (!m) return true; const hit = m[3].split('|').map(x => x.trim()).includes(flag(m[1])); return m[2] === '=' ? hit : !hit; }
  return Object.entries(c).every(([k, v]) => [].concat(v).map(String).includes(flag(k)));
};
const prune = x => Array.isArray(x) ? x.filter(e => !(e && typeof e === 'object' && !Array.isArray(e) && !passes(e.if))).map(prune)
  : (x && typeof x === 'object') ? Object.fromEntries(Object.entries(x).map(([k, v]) => [k, prune(v)])) : x;
const Q = prune(RAW);
const QS = args.flags ? '?flags=' + encodeURIComponent(args.flags) : '';
// Без --data — как на стенде: дело зашифровано, коды — тестовые, только на время прогона
const SEALED = !args.data;
const BUNDLE = SEALED ? JSON.parse(execFileSync('python3', [path.join(REPO, 'scripts', 'codes.py'), 'selftest-bundle', '--quest', QID,
  '--out', fs.mkdtempSync(path.join(os.tmpdir(), 'dvorami-codes-'))], { encoding: 'utf8' }).trim().split('\n').pop()) : null;
const PORT = 9000 + Math.floor(Math.random() * 900);
const BASE = `http://127.0.0.1:${PORT}`;
const TYPES = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.json': 'application/json', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.png': 'image/png', '.jpg': 'image/jpeg' };

const errors = [];
const err = (where, msg) => errors.push(`${where}: ${msg}`);

// Формат 5: данные сходятся до прогона — карточки по id определены, ответы pick/choice существуют, состояния письма есть
(function validate(q) {
  const defs = new Set(), refs = [], states = new Set(((q.letter || {}).states || []).map(s => s.id));
  const walk = (x, where) => {
    if (Array.isArray(x)) return x.forEach((e, i) => walk(e, where));
    if (!x || typeof x !== 'object') return;
    for (const c of [].concat(x.cards || [])) { if (typeof c === 'string') refs.push([c, where]); else if (c && c.id) defs.add(c.id); }
    for (const id of [].concat(x.strike || [], x.add || [])) refs.push([id, where]);
    if (x.doc === 'card') refs.push([x.id, where]);
    if (x.doc === 'letter' && x.state && !states.has(x.state)) err('данные', `${where}: нет состояния письма «${x.state}»`);
    if (q.letter && (x.type || x.steps) && x.letter && typeof x.letter === 'string' && !states.has(x.letter)) err('данные', `${where}: нет состояния письма «${x.letter}»`);
    if (x.type === 'pick') for (const set of x.answers || []) for (const id of [].concat(set)) refs.push([id, where + ' (pick)']);
    if (x.type === 'choice') { const ids = (x.options || []).map(o => o.id); for (const a of [].concat(x.answer || x.answers || [])) if (!ids.includes(a)) err('данные', `${where}: верный вариант «${a}» не среди вариантов`); }
    if (x.type === 'ask' && !(x.answers || []).length && !(x.all || []).length) err('данные', `${where}: у загадки нет answers и all`);
    for (const [k, v] of Object.entries(x)) if (k !== 'if' && typeof v === 'object') walk(v, x.id && x.n ? `точка ${x.n}` : where);
  };
  walk(q, 'дело');
  for (const [id, where] of refs) if (!defs.has(id)) err('данные', `${where}: карточка «${id}» нигде не определена`);
})(RAW);

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
  // у каждого свёрнутого блока — стандартная треугольная стрелка
  for (const d of root.querySelectorAll('details')) {
    const sm = d.querySelector(':scope > summary');
    if (!sm || !visible(sm)) continue;
    const b = getComputedStyle(sm, '::before');
    if (!d.matches('.pl-more') || !/polygon/.test(b.clipPath) || parseFloat(b.width) < 6) out.push(`свёрнутый блок без стрелки: ${name(sm)}`);
  }
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) {
    const run = document.getAnimations().filter(a => a.animationName && a.playState === 'running').map(a => a.animationName);
    if (run.length) out.push(`анимация при prefers-reduced-motion: ${[...new Set(run)].join(', ')}`);
  }
  const nav = document.getElementById('tabs');
  if (nav && !nav.hidden) {
    const labels = [...nav.querySelectorAll('button span')].map(s => s.textContent).join(' · ');
    if (labels !== 'Точка · Улики · Карта') out.push(`навигация: «${labels}» вместо «Точка · Улики · Карта»`);
    if (nav.querySelectorAll('[aria-current="page"]').length !== 1) out.push('навигация: активный раздел не отмечен');
  }
  return out;
}

// T-60 и мини-шаги: новый экран начинается сверху; главная кнопка («Дальше», «Мы на месте», «Проверить») видна целиком между
// шапкой и навигацией и ничем не закрыта; поле ответа с кнопкой «Ответить» — в верхней части экрана (над будущей клавиатурой)
function stickAudit() {
  if (document.querySelector('dialog[open]')) return [];
  const out = [];
  const nav = document.getElementById('tabs');
  const bottom = nav && !nav.hidden ? nav.getBoundingClientRect().top : innerHeight;
  const top = document.querySelector('.pl-top').getBoundingClientRect().bottom;
  const frame = document.getElementById('frame');
  if (frame) {
    const r = frame.getBoundingClientRect();
    if (scrollY > 1) out.push(`новый экран открылся с прокруткой ${Math.round(scrollY)} px, а не сверху`);
    if (r.top < top - 1 || r.top > innerHeight * .4) out.push(`начало экрана не на виду (${Math.round(r.top)} px)`);
  }
  const form = document.querySelector('#app .pl-form');
  if (form) {
    const r = form.getBoundingClientRect();
    // если над полем картинка или письмо, на которые нужно смотреть, отвечая, — достаточно, чтобы поле было на экране
    const task = form.closest('.pl-task');
    const pic = task && [...task.querySelectorAll('.pl-fig, .pl-letter')].some(e => !e.closest('details') && (e.compareDocumentPosition(form) & Node.DOCUMENT_POSITION_FOLLOWING));
    if (r.top < top || r.bottom > (pic ? bottom : Math.min(bottom, innerHeight * .62))) out.push(`поле ответа не в верхней части экрана (${Math.round(r.top)}–${Math.round(r.bottom)} из ${innerHeight})`);
    if (task && !task.querySelector('.pl-ask, .pl-lines')) out.push('на экране с полем ответа нет вопроса');
    if (getComputedStyle(form).position !== 'static') out.push('поле ответа не в потоке страницы (прилипает — поедет от клавиатуры)');
  }
  const box = document.querySelector('#app .pl-stick');
  const btn = box && box.querySelector('.pl-btn:not(.pl-btn--ghost)');
  if (!btn) return out;
  const r = btn.getBoundingClientRect();
  const name = `«${btn.textContent.trim()}»`;
  if (r.top < top - 1 || r.bottom > bottom + 1) return out.concat(`главная кнопка ${name} не видна без прокрутки (${Math.round(r.top)}–${Math.round(r.bottom)}, видно ${Math.round(top)}–${Math.round(bottom)})`);
  const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
  if (!hit || hit.closest('.pl-btn') !== btn) out.push(`главная кнопка ${name} закрыта другим элементом`);
  return out;
}
const settle = () => new Promise(r => { let y = -1, n = 0; const f = () => { if (scrollY === y) { if (++n > 3) return r(); } else { y = scrollY; n = 0; } requestAnimationFrame(f); }; f(); });

(async () => {
  await new Promise(r => server.listen(PORT, '127.0.0.1', r));
  const browser = await chromium.launch();
  const firstAnswer = st => st.answers && st.answers.length ? String(st.answers[0]).replace(/^~/, '')
    : (st.all || []).map(g => String((Array.isArray(g) ? g : g.answers)[0]).replace(/^~/, '')).join(' ');
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
        // --allow-missing-media: тест заглушек (scripts/fixtures) — отсутствующие картинки в media/ допустимы; в настоящем деле — ошибка
        if ('allow-missing-media' in args && /\/media\//.test((m.location() || {}).url || '')) return;
        err(tag, 'консоль: ' + m.text().slice(0, 200) + (process.env.PC_DEBUG ? ' @ ' + JSON.stringify(m.location()) : ''));
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
      };
      // новый экран (после «Дальше», ответа, перехода): общий аудит + «новое сверху, главная кнопка и поле на виду»
      const fresh = async where => {
        await check(where);
        if (vp.width < 1024) { await page.evaluate(settle); (await page.evaluate(stickAudit)).forEach(m => err(`${tag} · ${where}`, m)); }
      };
      const pos = () => page.evaluate(() => window.__dvorami.pos());
      const FWD = '#app .pl-bar [data-act="fwd"]';
      // листать «Дальше», пока не появится stop (селектор) или кнопка «Дальше» не кончится; каждый экран проверяется
      const flip = async (where, stop) => {
        for (let i = 0; i < 80; i++) {
          if (stop && await page.$(stop)) return true;
          const b = await page.$(FWD);
          if (!b) return false;
          const ps = await pos();
          await fresh(`${where} · экран ${ps.id}`);
          await b.click();
        }
        err(tag, `${where}: «Дальше» не кончается`); return false;
      };
      // Ответить на задание формата 5 в контексте sel («#active» — шаг, «#walk-0» — вопрос на ходу); wrong — сначала неверно
      const solve = async (sel, st, sat, wrong) => {
        if (st.type === 'choice') {
          const f = st.answer_flag && FLAGS[st.answer_flag];
        const right = f && (st.options || []).some(o => o.id === f) ? f : [].concat(st.answer || st.answers)[0];
          const bad = (st.options || []).find(o => o.id !== right);
          if (wrong && bad) {
            await click(`${sel} [data-act="choose"][data-id="${bad.id}"]`);
            if (!(await page.$(`${sel} .pl-wrong`))) err(tag, `${sat}: нет сообщения о неверном варианте`);
            await check(sat + ' · неверный вариант');
          }
          await click(`${sel} [data-act="choose"][data-id="${right}"]`);
          return;
        }
        if (st.type === 'pick' || st.type === 'strike') {
          const want = st.type === 'pick' ? [].concat(st.answers[0]) : (st.items || []).filter(i => !i.keep).map(i => i.id);
          if (wrong) {
            await click(`${sel} [data-act="check"]`);
            if (!(await page.$(`${sel} .pl-wrong`))) err(tag, `${sat}: нет сообщения о неверном выборе`);
          }
          for (const id of want) await click(`${sel} [data-sel="${id}"]`);
          await check(sat + ' · выбрано');
          await click(`${sel} [data-act="check"]`);
          return;
        }
        if (wrong) {
          await page.fill(`${sel} input[name="ans"]`, 'заведомо неверно'); await click(`${sel} button[type="submit"]`);
          if (!(await page.$(`${sel} .pl-wrong`))) err(tag, `${sat}: нет сообщения о неверном ответе`);
        }
        await page.fill(`${sel} input[name="ans"]`, st.type === 'free' ? '10' : firstAnswer(st)); await click(`${sel} button[type="submit"]`);
      };
      // ссылка с кодом (как после оплаты) — в одном прогоне; в остальных — экран кода и ввод руками
      const viaLink = SEALED && vp.width === 390 && theme === 'sun';
      await page.goto(`${BASE}/${PAGE}${QS}` + (viaLink ? `#code=${BUNDLE.code}` : ''), { waitUntil: 'load' });
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
        await tryCode('AB0D-EF1H', 'не подошёл', 'bad_chars');
        await tryCode('ABC', 'В коде 8 знаков', 'length');
        await tryCode('1234-5678-9012', 'Код не подошёл', 'wrong_master');
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
      // скриншоты — JPEG q80 (team/std/site-check.md)
      const shot = async name => { if (args.shots && theme === 'dark') { fs.mkdirSync(args.shots, { recursive: true }); await page.waitForTimeout(150); await page.screenshot({ path: path.join(args.shots, `${name}-${vp.width}.jpg`), type: 'jpeg', quality: 80 }); } };

      // H-45: ветка «по часам» (Q.clock): на дороге — строка «открыт / закрыт» и кнопка «Двери закрыты»; видна ветка по часам Москвы,
      // кнопка переключает реплики дороги и walk_m, выбор переживает перезагрузку и попадает в отчёт полевого теста
      const clockCheck = async (pi, p, at) => {
        const rp = (RAW.points || []).find(x => x.id === p.id && x.n === p.n) || {};
        const conds = [].concat(rp.walk || [], rp.walk_m || []).filter(e => e && typeof e === 'object' && typeof e.if === 'string' && /^\s*([\w-]+)\s*=/.test(e.if) && (RAW.clock || {})[e.if.match(/^\s*([\w-]+)/)[1]]);
        if (!conds.length) return;
        const k = conds[0].if.match(/^\s*([\w-]+)/)[1], def = RAW.clock[k];
        const cases = [[9 * 60 + 59, false], [10 * 60, true], [21 * 60 + 59, true], [22 * 60, false], [3 * 60, false]];
        for (const [m, want] of cases) if (await page.evaluate(([d, x]) => window.__dvorami.clockOpenAt(d, x), [def, m]) !== want) err(tag, `${at}: часы ${def.open}–${def.close}, ${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')} — ожидалось ${want ? 'открыто' : 'закрыто'}`);
        if (await page.evaluate(() => window.__dvorami.clockOpenAt({ open: '20:00', close: '02:00' }, 60)) !== true) err(tag, `${at}: часы через полночь (20:00–02:00) в 01:00 — должно быть открыто`);
        const expectNow = await page.evaluate(d => window.__dvorami.clockOpenAt(d, window.__dvorami.mskMinutes()), def) ? 'open' : 'closed';
        const seen = async () => page.evaluate(key => {
          const box = document.querySelector('#frame .pl-clock[data-clock="' + key + '"]'), dist = document.querySelector('#frame .pl-dist');
          return { v: box && box.dataset.clockV, btn: !!(box && box.querySelector('[data-act="clock"]')), text: (document.getElementById('frame') || {}).textContent || '', dist: dist ? dist.textContent : '' };
        }, k);
        const lineOf = v => (rp.walk || []).filter(e => e && typeof e === 'object' && e.if === `${k}=${v}` && e.text).map(e => e.text);
        const mOf = v => ((rp.walk_m || []).find(e => e && e.if === `${k}=${v}`) || {}).m;
        const verify = async (v, why) => {
          const s0 = await seen();
          if (s0.v !== v) return err(tag, `${at}: ${why}: ветка «${s0.v}», ожидалась «${v}»`);
          if (!s0.btn) err(tag, `${at}: ${why}: нет кнопки «${def.closed_button || 'Двери закрыты'}» / «${def.open_button || 'Двери открыты'}»`);
          const other = v === 'open' ? 'closed' : 'open';
          for (const t of lineOf(v)) if (!s0.text.includes(t)) err(tag, `${at}: ${why}: нет реплики своей ветки «${t.slice(0, 40)}»`);
          for (const t of lineOf(other)) if (s0.text.includes(t)) err(tag, `${at}: ${why}: видна реплика чужой ветки «${t.slice(0, 40)}»`);
          if (mOf(v) && !s0.dist.includes(String(mOf(v)))) err(tag, `${at}: ${why}: расстояние «${s0.dist}», ожидалось ${mOf(v)} м`);
        };
        await verify(expectNow, 'по часам');
        const flipTo = expectNow === 'open' ? 'closed' : 'open';
        await click(`#frame [data-act="clock"][data-k="${k}"]`);
        await verify(flipTo, 'после кнопки');
        await check(at + ' · ветка по часам переключена');
        const st = await state();
        if (!(st.clk && st.clk[pi] && st.clk[pi][k] && st.clk[pi][k].by === 'hand' && st.clk[pi][k].v === flipTo)) err(tag, `${at}: ручной выбор ветки не сохранён`);
        await page.reload({ waitUntil: 'load' }); await page.waitForSelector('#frame');
        await verify(flipTo, 'после перезагрузки');
        if (!(await page.$('#app [data-act="here"]'))) err(tag, `${at}: после переключения ветки пропала кнопка «Мы на месте»`);
      };

      await check('обложка');
      // режим «читаю / слушаю и читаю»: по умолчанию плеер реплик есть; в одном прогоне переключаем на «Читаю» — плеера нет нигде
      const readMode = vp.width === 1024 && theme === 'sun';
      if ((await page.$$('#app [data-act="mode"]')).length !== 2) err(tag, 'обложка: нет выбора «Слушаю и читаю / Читаю»');
      if (readMode) {
        await click('#app [data-act="mode"][data-mode="read"]');
        if ((await pos()).mode !== 'read') err(tag, 'режим «Читаю» не включился');
        await check('обложка · режим «Читаю»');
      }
      await click('[data-act="start"]');
      if (!readMode && Q.format >= 5 && !(await page.$('#frame .pl-voice.is-soon'))) err(tag, 'вступление: в режиме «Слушаю и читаю» нет плеера реплики с плашкой «Аудио скоро»');
      if (!(await page.$('#app .pl-crumb .pl-minis'))) err(tag, 'вступление: нет линии мини-шагов');
      await flip('вступление', '[data-act="go"]');
      await fresh('вступление · конец');
      await click('[data-act="go"]');
      let reviewed = false;
      for (const [pi, p] of Q.points.entries()) {
        const at = `точка ${p.n}`;
        if ((await state()).phase !== 'walk') { err(tag, `${at}: нет экрана дороги`); break; }
        await fresh(at + ' · дорога');
        if (pi === 1) {
          await click('[data-view="map"]'); await check(at + ' · карта');
          await click('[data-view="board"]'); await check(at + ' · улики');
          await click('[data-view="point"]');
          await click('[data-act="menu"]'); await check(at + ' · меню'); await click('[data-act="close"]');
          // место внутри точки (мини-шаг) переживает перезагрузку
          if (await page.$(FWD)) await click(FWD);
          const before = await pos();
          await page.reload({ waitUntil: 'load' }); await page.waitForSelector('#frame');
          const s = await state(), after = await pos();
          if (s.p !== pi || s.phase !== 'walk') err(tag, `${at}: прогресс не пережил перезагрузку`);
          if (after.cur !== before.cur || after.id !== before.id) err(tag, `${at}: мини-шаг не пережил перезагрузку (${before.id} → ${after.id})`);
        }
        // дорога по экранам: разговор в пути, вопросы на ходу (чётный — ответить с неверной попытки, нечётный — пропустить), «идём»
        const asks = [].concat(p.walk_ask || []);
        const seenAsk = new Set();
        for (let g = 0; g < 60; g++) {
          if (await page.$('#app [data-act="here"]')) break;
          const ps = await pos();
          if (ps.kind === 'wask') {
            const wi = +ps.id.slice(2), w = asks[wi], wsel = `#walk-${wi}`, wat = `${at} · на ходу ${wi + 1}`;
            if (!seenAsk.has(wi)) {
              seenAsk.add(wi);
              await fresh(wat);
              if (wi % 2 === 0 && (w.answers || w.all || w.options)) await solve(wsel, w, wat, true);
              else await click(`${wsel} [data-act="skip"]`);
              const ws = await state();
              if (!ws.wa[wi] || !ws.wa[wi].res) err(tag, `${wat}: ответ не засчитан`);
              if (ws.phase !== 'walk') err(tag, `${wat}: вопрос на ходу сдвинул прогресс (${ws.phase})`);
              await check(wat + ' · после ответа');
            }
          } else await fresh(`${at} · дорога · экран ${ps.id}`);
          if (!(await page.$(FWD))) { err(tag, `${at}: на экране дороги ${ps.id} нет ни «Дальше», ни «Мы на месте»`); break; }
          await click(FWD);
        }
        if (seenAsk.size !== asks.length) err(tag, `${at}: вопросов на ходу показано ${seenAsk.size} из ${asks.length}`);
        await fresh(at + ' · идём');
        await clockCheck(pi, p, at);
        await click('[data-act="here"]');
        if ((await pos()).kind !== 'arrive') err(tag, `${at}: после «Мы на месте» открылся не экран точки`);
        await fresh(at + ' · на месте');
        if (p.kids) {
          await page.click('#frame .pl-kids > summary'); await check(at + ' · детям');
          if ((await state()).k !== 0) err(tag, `${at}: задание для детей сдвинуло прогресс`);
          await page.click('#frame .pl-kids > summary');
        }
        for (const [si, st] of p.steps.entries()) {
          const sat = `${at} шаг ${si + 1}`; if (process.env.PC_DEBUG) console.log(tag, sat, st.type);
          const plain = !st.type || st.type === 'info' || st.type === 'board' || st.type === 'say';
          // реплики шага (и разбор предыдущего) листаются до загадки или до последней реплики шага
          await flip(sat, plain ? '#app .pl-bar [data-act="next"]' : '#active');
          const s0 = await state();
          if (s0.phase !== 'step' || s0.k !== si) { err(tag, `${sat}: ожидали шаг ${si + 1}, состояние ${s0.phase}/${s0.k}`); break; }
          await fresh(sat);
          // пройденное: «назад» и оглавление открывают прошлые мини-шаги только для просмотра; непройденного в оглавлении нет
          if (!reviewed && pi === 2 && si === 1) {
            reviewed = true;
            const here = await pos();
            await click('#app [data-act="back"]');
            const pk = await pos();
            if (!pk.peek || pk.f !== here.f - 1 || pk.sec !== here.sec) err(tag, `${sat}: «назад» не открыл предыдущий мини-шаг (${JSON.stringify(pk)})`);
            if (await page.$('#frame form, #frame [data-act="choose"], #frame [data-act="check"], #frame [data-act="hint"]')) err(tag, `${sat}: в пройденном мини-шаге можно отвечать`);
            if (!(await page.$('#app .pl-review'))) err(tag, `${sat}: просмотр пройденного не помечен`);
            await fresh(sat + ' · назад');
            await click('#app .pl-crumb-btn'); await page.waitForSelector('#sheet[open] .pl-toc-sec[open] .pl-toc');
            await check(sat + ' · оглавление'); await shot('player-toc');
            const toc = await page.evaluate(() => ({
              text: document.getElementById('sheet-body').textContent,
              items: [...document.querySelectorAll('#sheet [data-act="jump"]')].map(b => [+b.dataset.sec, +b.dataset.f])
            }));
            if (toc.items.some(([sec, f]) => sec > here.sec || (sec === here.sec && f > here.f))) err(tag, `${sat}: в оглавлении есть непройденные мини-шаги`);
            if (toc.items.filter(([sec]) => sec === here.sec).length !== here.f + 1) err(tag, `${sat}: в оглавлении текущей точки ${toc.items.filter(([sec]) => sec === here.sec).length} мини-шагов, пройдено ${here.f + 1}`);
            for (const fp of Q.points.slice(pi + 1)) for (const w of [fp.title, fp.place]) if (w && toc.text.includes(w.replace(/<[^>]+>/g, ''))) err(tag, `${sat}: оглавление раскрывает то, что впереди: «${w}»`);
            if (!toc.items.some(([sec]) => sec === 0) || !toc.items.some(([sec]) => sec === -1)) err(tag, `${sat}: в оглавлении нет пройденных точек и вступления`);
            // открыть мини-шаг первой точки: виден её экран, состояние дела не меняется
            await page.click('#sheet .pl-toc-sec:nth-of-type(2) > summary');
            await click('#sheet [data-act="jump"][data-sec="0"][data-f="0"]');
            const far = await pos(), sFar = await state();
            if (!far.peek || far.sec !== 0 || far.f !== 0) err(tag, `${sat}: оглавление не открыло мини-шаг первой точки`);
            if (!(await page.$eval('#frame', (e, t) => e.textContent.includes(t), Q.points[0].title).catch(() => false))) err(tag, `${sat}: на экране не первая точка`);
            if (sFar.p !== pi || sFar.k !== si || sFar.phase !== 'step') err(tag, `${sat}: просмотр пройденного сдвинул прогресс`);
            await fresh(sat + ' · пройденная точка');
            await click('#app .pl-bar [data-act="fwd"]');
            if ((await pos()).f !== 1) err(tag, `${sat}: «Дальше» в просмотре не листает пройденное`);
            await click('#app [data-act="current"]');
            const back = await pos();
            if (back.peek || back.f !== here.f || back.sec !== here.sec) err(tag, `${sat}: «К текущему шагу» не вернул на место (${JSON.stringify(back)})`);
          }
          if (plain) { await click('#app .pl-bar [data-act="next"]'); continue; }
          if (st.type === 'free') { await page.fill('#ans', '10'); await click('#active button[type="submit"]'); continue; }
          if (st.type === 'choice' || st.type === 'pick' || st.type === 'strike') {
            await solve('#active', st, sat, si % 2 === 0);
            const sx = await state();
            if (sx.k === si && sx.phase === 'step') err(tag, `${sat}: не принят верный выбор`);
            continue;
          }
          // клавиатура: окно стало ниже (как при открытой клавиатуре) — поле на том же месте страницы, на виду, навигация убрана
          if (vp.width === 390 && pi === 0) {
            await page.focus('#ans'); await page.waitForTimeout(80);
            const m0 = await page.evaluate(() => { const r = document.getElementById('ans').getBoundingClientRect(); return { y: r.top + scrollY, sy: scrollY }; });
            await page.setViewportSize({ width: vp.width, height: 500 }); await page.waitForTimeout(500);
            const m1 = await page.evaluate(() => { const i = document.getElementById('ans'), r = i.getBoundingClientRect(), b = i.form.querySelector('button').getBoundingClientRect();
              return { y: r.top + scrollY, sy: scrollY, top: r.top, bottom: Math.max(r.bottom, b.bottom), h: innerHeight, head: document.querySelector('.pl-top').getBoundingClientRect().bottom,
                nav: getComputedStyle(document.getElementById('tabs')).display, focus: document.activeElement === i }; });
            if (Math.abs(m1.y - m0.y) > 1) err(tag, `${sat}: клавиатура сдвинула поле ответа на странице (${Math.round(m0.y)} → ${Math.round(m1.y)})`);
            if (m1.top < m1.head || m1.bottom > m1.h) err(tag, `${sat}: при клавиатуре поле ответа не на виду (${Math.round(m1.top)}–${Math.round(m1.bottom)} из ${m1.h})`);
            if (m1.nav !== 'none') err(tag, `${sat}: при клавиатуре нижняя навигация осталась на экране`);
            if (!m1.focus) err(tag, `${sat}: поле ответа потеряло фокус`);
            await page.setViewportSize(vp); await page.evaluate(() => { document.activeElement.blur(); scrollTo(0, 0); }); await page.waitForTimeout(200);
          }
          // загадка: неверный ответ не проходит; поле не перерисовывается — фокус и набранное остаются
          if (si % 2 === 0) {
            await page.evaluate(() => { document.getElementById('ans').dataset.same = '1'; });
            await page.fill('#ans', 'заведомо неверно'); await click('#active button[type="submit"]');
            if ((await state()).k !== si) err(tag, `${sat}: принят неверный ответ`);
            if (!(await page.$('.pl-wrong'))) err(tag, `${sat}: нет сообщения о неверном ответе`);
            if (!(await page.evaluate(() => { const i = document.getElementById('ans'); const r = i && i.getBoundingClientRect(), w = document.querySelector('#active .pl-wrong').getBoundingClientRect(); return i && i.dataset.same === '1' && document.activeElement === i && r.top >= 56 && w.bottom <= innerHeight; }))) err(tag, `${sat}: неверный ответ перерисовал поле (фокус потерян) или поле с сообщением ушли с экрана`);
            await check(sat + ' · неверный ответ');
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
            else if ((await pos()).kind === 'result' && !(await page.$('#frame .pl-result-top .pl-stamp'))) err(tag, `${sat}: на экране разбора нет штампа «Верно»`);
          }
        }
        const s1 = await state();
        if (s1.phase !== 'point_done') { err(tag, `${at}: точка не закрылась (${s1.phase}/${s1.k})`); break; }
        await flip(at + ' · разбор', '[data-act="nextpoint"]');
        await fresh(at + ' · пройдена');
        if (pi === 3 || (Q.letter && pi === Q.points.length - 2)) {
          await shot('player-clue');
          await click('[data-view="board"]'); await check(at + ' · улики'); await shot('player-board');
          if (await page.$('[data-act="letter"]')) {
            await click('[data-act="letter"]'); await check(at + ' · письмо'); await shot('player-letter-' + pi); await click('[data-act="close"]');
          }
          const openCard = await page.$('.pl-cardx [data-act="card"]');
          if (openCard) { await openCard.click(); await check(at + ' · карточка'); await click('[data-act="close"]'); }
          await click('[data-view="map"]'); await check(at + ' · карта'); await shot('player-map');
          await click('[data-view="point"]');
        }
        await click('[data-act="nextpoint"]');
      }
      const end = await state();
      const clues = Q.points.filter(p => p.clue).length;
      if (end.phase !== 'done') err(tag, `финал не достигнут: ${end.phase}, точка ${end.p + 1}`);
      else {
        await fresh('финал'); await shot('player-final');
        if (end.board.length !== clues) err(tag, `улик ${end.board.length}, ожидали ${clues}`);
        // «стрелки»: каждая цель показана, и показана один раз (запомнена за одним экраном)
        const targets = new Set(JSON.stringify(Q).match(/"arrow":"[^"]+"/g) || []);
        for (const t of targets) { const k = t.split('"')[3]; if (!end.arrows || !end.arrows[k]) err(tag, `стрелка «${k}» ни разу не показана`); }
        if (Q.letter && !end.letter) err(tag, 'письмо-улика не попало на доску');
        // финальная карточка: номер дела, штамп «Раскрыто», ни одного слова-ответа; оценка звёздами хранится на телефоне; отзыв — в бота
        const pageQid = await page.evaluate(() => document.body.dataset.quest);   // у макета темы папка дела своя
        const card = await page.$eval('#closed-card', e => e.textContent).catch(() => null);
        if (card === null) err(tag, 'финал: нет карточки раскрытого дела');
        else {
          const caseNo = await page.evaluate(() => document.body.dataset.caseNo || '');
          if (!/раскрыто/i.test(card)) err(tag, 'финал: на карточке нет штампа «Раскрыто»');
          if (caseNo && !card.includes('№ ' + caseNo)) err(tag, `финал: на карточке нет номера дела (№ ${caseNo})`);
          const nrm = x => String(x).toLowerCase().replace(/ё/g, 'е').replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
          const safe = nrm([Q.title, Q.city, Q.district, 'дворами городские квесты расследования раскрыто дело дата в пути точек подсказок ни одной из'].join(' '));
          const answers = new Set();
          const collect = x => { if (Array.isArray(x)) return x.forEach(collect); if (!x || typeof x !== 'object') return;
            for (const a of [].concat(x.answers || [])) for (const v of [].concat(a)) { const w = nrm(String(v).replace(/^~/, '')); if (w.length >= 4 && !/^\d+$/.test(w) && !safe.includes(w)) answers.add(w); }
            Object.values(x).forEach(collect); };
          collect(Q.points);
          const leak = [...answers].filter(w => (' ' + nrm(card) + ' ').includes(' ' + w + ' '));
          if (leak.length) err(tag, `финал: на карточке для снимка есть слова-ответы: ${leak.slice(0, 5).join(', ')}`);
          // H-54: открытка «Дело раскрыто» — те же правила: номер и название дела, штамп, ссылка, ни одного слова-ответа
          const pc = await page.evaluate(() => window.__dvorami.postcardLines()).catch(() => null);
          if (!pc) err(tag, 'финал: нет открытки для «Поделиться»');
          else {
            const all = ' ' + nrm(pc.join(' ')) + ' ';
            const pleak = [...answers].filter(w => all.includes(' ' + w + ' '));
            if (pleak.length) err(tag, `финал: на открытке есть слова-ответы: ${pleak.slice(0, 5).join(', ')}`);
            if (!/дело раскрыто/i.test(pc.join(' '))) err(tag, 'финал: на открытке нет «Дело раскрыто»');
            if (!pc.some(x => /moscow\//.test(x))) err(tag, 'финал: на открытке нет ссылки на страницу дела');
            const size = await page.evaluate(() => window.__dvorami.postcard()).catch(() => 0);
            if (!(size > 10000)) err(tag, `финал: открытка не нарисовалась (${size} байт)`);
            const hasShare = await page.evaluate(() => typeof navigator.share === 'function');
            if (!hasShare) {   // без Web Share: открытка скачивается файлом, ссылка копируется
              const dl = page.waitForEvent('download', { timeout: 5000 }).catch(() => null);
              await click('[data-act="sharecase"]');
              const d = await dl;
              if (!d || !/\.png$/.test(d.suggestedFilename())) err(tag, 'финал: «Поделиться» без Web Share не сохранил открытку');
              else if (args.shots && theme === 'dark' && vp.width === 390) await d.saveAs(path.join(args.shots, 'player-postcard.png'));
              await check('финал · поделиться');
            }
          }
        }
        if ((await page.$$('#rate .pl-star')).length !== 5) err(tag, 'финал: нет пяти звёзд оценки');
        else {
          await click('#rate .pl-star[data-v="4"]');
          const saved = await page.evaluate(k => { try { return localStorage.getItem(k); } catch (e) { return null; } }, 'dvorami:rating:' + pageQid);
          if (saved !== '4') err(tag, `финал: оценка не сохранилась на телефоне (${saved})`);
          if ((await page.$$('#rate .pl-star[data-on="true"]')).length !== 4) err(tag, 'финал: звёзды не показывают выбранную оценку');
          await check('финал · оценка');
        }
        const tg = await page.$eval('#rate a[data-track="review_click"]', a => a.textContent.trim() + ' ' + a.href).catch(() => '');
        if (!tg.includes('Оставить отзыв в Telegram') || !tg.includes('start=done_' + pageQid)) err(tag, `финал: нет кнопки «Оставить отзыв в Telegram» со ссылкой done_${pageQid} («${tg}»)`);
        if (await page.$(FWD)) {
          await click(FWD); await fresh('финал · что здесь правда');
          const fact = await page.$('#frame .pl-fact > summary');
          if (fact) { await fact.click(); await check('финал · что здесь правда · раскрыто'); }
          await click('#app [data-act="back"]');
          if ((await pos()).kind !== 'closed') err(tag, 'финал: «назад» не вернул к карточке дела');
        }
        await page.reload({ waitUntil: 'load' }); await page.waitForSelector('#closed-card');
        if ((await page.$$('#rate .pl-star[data-on="true"]')).length !== 4) err(tag, 'финал: оценка не пережила перезагрузку');
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

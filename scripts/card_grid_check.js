#!/usr/bin/env node
/* Единообразие карточек в сетках витрин дел (владелец 27.11: в сетке «художники» ЗИЛАРТа у двух карточек из восьми нет года).
 *
 *   node scripts/card_grid_check.js                 — все страницы дел site/moscow/<slug>/index.html
 *   node scripts/card_grid_check.js --html=копия.html — чужая копия страницы (обратная проверка:
 *        git show 034b5d0:site/moscow/zilart-sinyaya-ptica/index.html > /tmp/z.html — Мельников и Шагал без года краснеют)
 *   node scripts/card_grid_check.js --selftest      — фикстуры: scripts/fixtures/card-grid-zilart-2026-11-27.html и строки ниже
 *
 * Сетки — GRIDS ниже (новая сетка карточек на витрине — добавить туда). Поля карточки — FIELDS: год (.yr), источник (p.credit),
 * картинка (img/svg), снимок или репродукция (img из assets/photo/ или assets/art/). Если поле есть у большинства карточек
 * сетки (больше половины), а у части нет — ошибка со списком карточек. Осознанное исключение — только явное поле в данных
 * дела (platform/site/cases/c*.py): year_none / credit_none / art_none / photo_none: «почему» → build_cases.py ставит
 * data-year-none="…" и т. д. на карточку (art_none снимает и снимок). Исключение без причины (< 8 знаков) или у карточки,
 * у которой поле уже есть («год сверяется», а год вписали), — ошибка «снимите»; исключение, которому нечего снимать
 * (поле не у большинства), — предупреждение.
 * Права (team/std/images.md): снимок или репродукция в карточке сетки — с подписью-атрибуцией (figcaption) рядом,
 * с width/height и loading="lazy"; иначе ошибка.
 * Пользуется site_check.js (и --sync). */
'use strict';
const fs = require('fs');
const path = require('path');

const SITE = path.resolve(__dirname, '..', 'site');
const FIXTURE = path.join(__dirname, 'fixtures', 'card-grid-zilart-2026-11-27.html');

const GRIDS = [
  { cls: 'c-world-grid', name: '«Вокруг дела»' },
  { cls: 'c-track', name: '«Что увидите»' },
];
const PHOTO = /(^|\/)assets\/(photo|art)\//;
const FIELDS = [
  { key: 'year', name: 'год', test: c => some(c, n => hasClass(n, 'yr') && text(n).trim()) },
  { key: 'credit', name: 'источник (p.credit)', test: c => some(c, n => hasClass(n, 'credit') && text(n).trim()) },
  { key: 'art', name: 'картинка', test: c => some(c, n => ['img', 'svg', 'picture'].includes(n.tag)) },
  { key: 'photo', name: 'снимок или репродукция', also: 'art', test: c => some(c, n => n.tag === 'img' && PHOTO.test(n.attrs.src || '')) },
];

// ---------- маленький разбор HTML (сборка build_cases.py даёт правильную разметку) ----------
const VOID = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'source', 'track', 'wbr']);
const ENT = { nbsp: ' ', laquo: '«', raquo: '»', mdash: '—', ndash: '–', amp: '&', quot: '"', hellip: '…', bdquo: '„', ldquo: '“' };
const decode = s => s.replace(/&([a-z]+);/gi, (m, e) => ENT[e.toLowerCase()] != null ? ENT[e.toLowerCase()] : m);
function parse(html) {
  const root = { tag: '#root', attrs: {}, kids: [], parent: null };
  let cur = root;
  const re = /<!--[\s\S]*?-->|<(script|style)\b[^>]*>[\s\S]*?<\/\1\s*>|<\/([a-zA-Z][\w:-]*)\s*>|<([a-zA-Z][\w:-]*)((?:[^>"']|"[^"]*"|'[^']*')*)>|([^<]+)/g;
  let m;
  while ((m = re.exec(html))) {
    if (m[5] != null) { cur.kids.push({ tag: null, text: m[5] }); continue; }
    if (m[2]) { // закрывающий: до ближайшего такого же предка
      const t = m[2].toLowerCase();
      for (let n = cur; n && n !== root; n = n.parent) if (n.tag === t) { cur = n.parent; break; }
      continue;
    }
    if (!m[3]) continue;
    const tag = m[3].toLowerCase(), raw = m[4] || '';
    const attrs = {};
    for (const a of raw.matchAll(/([^\s=/"']+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g)) attrs[a[1].toLowerCase()] = decode(a[2] ?? a[3] ?? a[4] ?? '');
    const node = { tag, attrs, kids: [], parent: cur };
    cur.kids.push(node);
    if (!VOID.has(tag) && !/\/\s*$/.test(raw)) cur = node;
  }
  return root;
}
const hasClass = (n, c) => n.tag && (' ' + (n.attrs.class || '') + ' ').includes(' ' + c + ' ');
function each(n, fn) { for (const k of n.kids || []) if (k.tag) { fn(k); each(k, fn); } }
function findAll(n, pred) { const out = []; each(n, k => { if (pred(k)) out.push(k); }); return out; }
function some(n, pred) { return findAll(n, pred).length > 0; }
function text(n) { return n.tag ? (n.kids || []).map(text).join('') : decode(n.text || ''); }
const closest = (n, tag) => { for (let p = n.parent; p; p = p.parent) if (p.tag === tag) return p; return null; };
function title(card) {
  const h = findAll(card, n => /^h[1-6]$/.test(n.tag))[0];
  const t = (h ? text(h) : text(card)).replace(/\s+/g, ' ').trim();
  return '«' + (t.length > 44 ? t.slice(0, 43) + '…' : t) + '»';
}

// ---------- проверка ----------
function checkHtml(html, label) {
  const errors = [], warns = [];
  const root = parse(html);
  for (const g of GRIDS) for (const grid of findAll(root, n => hasClass(n, g.cls))) {
    const cards = grid.kids.filter(k => k.tag);
    if (cards.length < 2) continue;
    const where = `${label}: ${g.name}`;
    for (const f of FIELDS) {
      const has = cards.map(c => !!f.test(c));
      const n = has.filter(Boolean).length;
      const major = n * 2 > cards.length;
      const exc = c => { for (const k of [f.key, f.also].filter(Boolean)) { const v = c.attrs[`data-${k}-none`]; if (v != null) return { k, v }; } return null; };
      const miss = [];
      cards.forEach((c, i) => {
        const e = exc(c);
        if (e && e.k === f.key) {
          if (e.v.trim().length < 8) errors.push(`${where}, ${title(c)}: ${f.key}_none без причины — напишите, почему у карточки нет поля «${f.name}»`);
          else if (has[i]) errors.push(`${where}, ${title(c)}: ${f.key}_none («${e.v}»), а ${f.name} у карточки уже есть — снимите ${f.key}_none в данных дела`);
          else if (!major) warns.push(`${where}, ${title(c)}: ${f.key}_none («${e.v}») ничего не снимает — поле «${f.name}» не у большинства карточек; снять`);
        }
        if (major && !has[i] && !e) miss.push(title(c));
      });
      if (major && miss.length) errors.push(`${where} — ${f.name}: есть у ${n} из ${cards.length} карточек, нет у ${miss.join(', ')} — добавьте или явное ${f.key}_none: «почему» в данных дела (platform/site/cases/c*.py; владелец 27.11: карточки одной сетки одинаковые)`);
    }
    // права и вес: снимок или репродукция — с атрибуцией рядом, размерами и ленивой загрузкой
    for (const c of cards) for (const img of findAll(c, n => n.tag === 'img' && PHOTO.test(n.attrs.src || ''))) {
      const fig = closest(img, 'figure');
      const cap = fig && findAll(fig, n => n.tag === 'figcaption' && text(n).trim()).length;
      const file = path.basename(img.attrs.src);
      if (!cap) errors.push(`${where}, ${title(c)}: у картинки ${file} нет подписи-атрибуции (figcaption: автор, лицензия, источник — team/std/images.md)`);
      if (!img.attrs.width || !img.attrs.height) errors.push(`${where}, ${title(c)}: у картинки ${file} нет width/height (сдвиг вёрстки)`);
      if (img.attrs.loading !== 'lazy') errors.push(`${where}, ${title(c)}: картинка ${file} без loading="lazy"`);
    }
  }
  return { errors, warns };
}

function casePages() {
  const dir = path.join(SITE, 'moscow');
  return fs.readdirSync(dir).filter(s => fs.existsSync(path.join(dir, s, 'index.html'))).sort().map(s => [`moscow/${s}/`, path.join(dir, s, 'index.html')]);
}

function check(opts = {}) {
  const pages = opts.html ? [[`${path.basename(opts.html)} (копия)`, path.resolve(opts.html)]] : casePages();
  const errors = [], warns = [];
  for (const [label, f] of pages) {
    const r = checkHtml(fs.readFileSync(f, 'utf8'), label);
    errors.push(...r.errors); warns.push(...r.warns);
  }
  return { errors, warns };
}

function selftest() {
  const out = [];
  // обратная проверка на настоящей сетке: «художники» ЗИЛАРТа до правки 27.11 — Мельников и Шагал без года, Мельников без источника
  if (!fs.existsSync(FIXTURE)) out.push(`нет фикстуры ${path.relative(path.dirname(__dirname), FIXTURE)}`);
  else {
    const r = checkHtml(fs.readFileSync(FIXTURE, 'utf8'), 'fx');
    const yr = r.errors.find(e => / год: есть у 8 из 10/.test(e));
    if (!yr || !/Мельников/.test(yr) || !/Шагал/.test(yr)) out.push('фикстура ЗИЛАРТа: сетка без года у Мельникова и Шагала не покраснела');
    if (!r.errors.some(e => /источник.*нет у «Мельников/.test(e))) out.push('фикстура ЗИЛАРТа: карточка Мельникова без источника не покраснела');
  }
  const card = (yr, extra = '', body = '') => `<article class="c-world-card"${extra}>${body}${yr ? `<span class="yr">${yr}</span>` : ''}<h3>Карточка ${yr || 'без года'}</h3><p>текст</p></article>`;
  const grid = cs => `<div class="c-world-grid">${cs.join('')}</div>`;
  const run = h => checkHtml(h, 'fx');
  if (run(grid([card('1913'), card('1920'), card('')])).errors.length !== 1) out.push('год у 2 из 3 — не красное');
  if (run(grid([card('1913'), card('1920'), card('', ' data-year-none="год сверяется у Историка"')])).errors.length) out.push('year_none с причиной не снял находку');
  if (run(grid([card('1913'), card('1920'), card('', ' data-year-none="нет"')])).errors.length !== 1) out.push('year_none без причины не покраснел');
  if (run(grid([card('1913'), card('1920'), card('1931', ' data-year-none="год сверяется у Историка"')])).errors.length !== 1) out.push('year_none у карточки с годом (устаревшее исключение) не покраснел');
  if (run(grid([card('1913'), card(''), card('')])).errors.length) out.push('год у 1 из 3 (не большинство) — ложное красное');
  const r2 = run(grid([card(''), card(''), card('', ' data-year-none="год сверяется у Историка"')]));
  if (r2.errors.length || r2.warns.length !== 1) out.push('year_none, которому нечего снимать, — не предупреждение');
  const art = (cap, attrs = ' width="1200" height="900" loading="lazy"') => `<figure class="c-world-fig"><img class="c-world-art" src="../../assets/art/x/a.jpg" alt="a"${attrs}>${cap ? '<figcaption class="c-credit">Общественное достояние · Третьяковская галерея</figcaption>' : ''}</figure>`;
  if (run(grid([card('1913', '', art(true)), card('1920', '', art(true)), card('1921')])).errors.length !== 2) out.push('картинка у 2 из 3 — не красное (картинка и снимок)');
  if (run(grid([card('1913', '', art(true)), card('1920', '', art(true)), card('1921', ' data-art-none="репродукции нет в свободном доступе"')])).errors.length) out.push('art_none не снял картинку и снимок');
  if (!run(grid([card('1913', '', art(false)), card('1920')])).errors.some(e => /атрибуц/.test(e))) out.push('репродукция без подписи-атрибуции не покраснела');
  if (!run(grid([card('1913', '', art(true, '')), card('1920')])).errors.some(e => /width\/height/.test(e))) out.push('репродукция без width/height не покраснела');
  const spot = (photo, extra = '') => `<li class="c-spot"${extra}><figure>${photo ? '<img src="../../assets/photo/x/p.jpg" alt="" width="1200" height="900" loading="lazy"><figcaption class="c-credit">Фото: автор, CC0</figcaption>' : '<img src="../../assets/ill/spots/p.svg" alt="" width="1200" height="900" loading="lazy">'}</figure><h3>Место</h3><p>т</p></li>`;
  if (run(`<ul class="c-track">${[spot(true), spot(true), spot(false)].join('')}</ul>`).errors.length !== 1) out.push('«Что увидите»: фото у 2 из 3 — не красное');
  if (run(`<ul class="c-track">${[spot(false), spot(false), spot(false)].join('')}</ul>`).errors.length) out.push('«Что увидите»: одни рисунки — ложное красное');
  return out;
}

module.exports = { check, checkHtml, selftest, GRIDS, FIELDS };

if (require.main === module) {
  const args = Object.fromEntries(process.argv.slice(2).map(a => { const m = a.match(/^--([\w-]+)(?:=(.*))?$/); return m ? [m[1], m[2] == null ? true : m[2]] : [a, true]; }));
  if (args.selftest) { const s = selftest(); s.forEach(m => console.log(' ✗ ' + m)); console.log(s.length ? 'card_grid_check --selftest: ОШИБКА' : 'card_grid_check --selftest: OK'); process.exit(s.length ? 1 : 0); }
  const r = check({ html: args.html });
  r.warns.forEach(m => console.log(' ! ' + m));
  r.errors.forEach(m => console.log(' ✗ ' + m));
  console.log(r.errors.length ? `card_grid_check: находок ${r.errors.length}` : 'card_grid_check: OK');
  process.exit(r.errors.length ? 1 : 0);
}

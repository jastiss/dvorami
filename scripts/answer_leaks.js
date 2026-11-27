#!/usr/bin/env node
/* Ответы загадок на витрине дела (гипотеза рецензента, 27.11): слова-ответы берутся из сценария автоматически,
 * а не только из ручного списка scripts/site_spoilers.json.
 *
 *   node scripts/answer_leaks.js                    — все дела: витрина site/moscow/<id>-…/ и карточки дела в каталогах
 *   node scripts/answer_leaks.js --quest=zilart     — одно дело
 *   node scripts/answer_leaks.js --quest=krasnaya-ploshchad --html=путь/index.html — чужая копия страницы (обратная проверка:
 *        git show c54390a~1:site/moscow/krasnaya-ploshchad-imena/index.html > /tmp/p.html — «Иверская» краснеет)
 *   node scripts/answer_leaks.js --terms            — только напечатать, какие ответы проверяются (и каких нет в site_spoilers.json)
 *   node scripts/answer_leaks.js --selftest         — фикстура: ответ в тексте и в alt краснеет, исключение снимает
 *
 * Откуда ответы (по порядку):
 *  1) quests/<id>/quest.json — у полей с вводом (ask, walk_ask, части all) первый вариант answers (канонический ответ;
 *     остальные — падежи и опечатки, по ним витрину не проверяем) и основы «~…» от 4 букв; у choice с одним верным
 *     вариантом — подпись верного (answer_flag — по флагу дела). Не проверяются: choice, где верен любой вариант
 *     (answer — список), pick и strike (ответ — карточки доски), kids (детские задания), replies («почти» — не ответ).
 *  2) нет quest.json — сценарий quests/<id>/story/scenario-v<N>.md с наибольшим N, строки «**Ответ:** …»: ответ в «…»
 *     до «Засчитывается», и основы из «Засчитывается: «…»» от 6 букв, только если основа — начало слова самого ответа
 *     («свадьб» у «…после свадьбы»; «купец» у «Панталоне» — нет: это допуск, а не ответ). Строки 📍 без «…» («вписать
 *     после теста») пропускаются. Нет сценария или строк «Ответ:» — дело пропускается с сообщением.
 * Отсев: числа короче 3 цифр (цифрой и словом: «восемь», «17»), слова короче 3 букв, общие слова из answer_leaks.json → generic.
 * Сравнение — после той же нормализации, что у плеера (site/play/answer.js: регистр, ё/е, знаки, дефисы); фраза — словами
 * подряд с начала слова, последнее слово от 6 букв — без двух последних букв («подпорка» ловит «подпорках»), от 5 — без одной.
 * Где ищем: страница дела — видимый текст (без <script>/<style>), разметка (<title>, alt, title, aria-label, content,
 * placeholder, имена файлов в src/href/srcset, JSON-LD), текст локальных SVG, на которые ссылается страница; карточка
 * дела в site/index.html и site/moscow/index.html (элемент li.qcard со ссылкой на дело) — так же.
 * H-119: ещё site/llms*.txt (пишутся руками) — строка со ссылкой на дело проверяется ответами этого дела, строки без ссылки
 * на дело (шапка, справка) — ответами всех дел; и посты канала docs/marketing/channel/posts/*.md (кроме status: published —
 * они уже вышли) — текст поста без шапки ответами всех дел. Исключения answer_leaks.json → ok действуют и здесь.
 * Обратная проверка: --llms=копия.txt (вместо site/llms*.txt) и --posts=папка (вместо posts/) — подставленный ответ краснеет.
 * Одна находка — одно поле сценария (канонический ответ и его основы вместе; одинаковые поля разных шагов — одной строкой).
 * Исключения — scripts/answer_leaks.json → ok: {"<id дела>": {"<любой ответ или основа поля>": "почему это не спойлер"}};
 * значение-объект {"why": "…", "warn": true} — известная находка ждёт решения (Сценарист): не красное, а жёлтое каждый запуск;
 * {"why": "…", "only": "006-otvet-zil-gagarin.md"} — исключение только для находок в этих местах (тот же ответ на витрине — красное).
 * Причина обязательна (от 15 знаков); исключение, которое больше ничего не снимает, — предупреждение «снять».
 * Пользуется site_check.js (и --sync): найденный ответ без исключения — ошибка. */
'use strict';
const fs = require('fs');
const path = require('path');
const A = require('../site/play/answer.js');

const REPO = path.resolve(__dirname, '..');
const SITE = path.join(REPO, 'site');
const CONF_FILE = path.join(__dirname, 'answer_leaks.json');

const norm = s => A.norm(String(s || ''));
const esc = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function conf() {
  try { return JSON.parse(fs.readFileSync(CONF_FILE, 'utf8')); } catch (e) { return { generic: [], ok: {} }; }
}

// ---------- ответы из сценария ----------
function fromQuest(q) {
  const out = [];
  const flags = q.flags || {};
  const add = (answer, where, kind) => out.push({ answer: String(answer), where, kind });
  const fromAsk = (x, where) => {
    const list = (x.answers || []).filter(a => typeof a === 'string');
    const canon = list.find(a => !a.startsWith('~'));
    if (canon) add(canon, where, 'ответ');
    for (const a of list) if (a.startsWith('~') && a.slice(1).replace(/\s/g, '').length >= 4) add(a, where, 'основа');
  };
  (function walk(x, where) {
    if (Array.isArray(x)) return x.forEach((e, i) => walk(e, `${where}/${i}`));
    if (!x || typeof x !== 'object') return;
    const t = x.type;
    if (t === 'pick' || t === 'strike') return;
    if (Array.isArray(x.answers) && t !== 'choice') fromAsk(x, where);
    if (Array.isArray(x.all)) x.all.forEach((g, i) => fromAsk(Array.isArray(g) ? { answers: g } : g, `${where}/all/${i}`));
    if (t === 'choice' && Array.isArray(x.options) && !Array.isArray(x.answer) && !x.any_answer) {
      const id = x.answer_flag && flags[x.answer_flag] != null ? String(flags[x.answer_flag]) : x.answer;
      const o = x.options.find(o => String(o.id) === String(id));
      if (o && o.label) add(o.label.replace(/^[А-ГA-D1-9]\s*[—–-]\s*/, ''), where, 'верный вариант');
    }
    for (const [k, v] of Object.entries(x)) {
      if (['kids', 'replies', 'all', 'options', 'hints', 'check'].includes(k) || !v || typeof v !== 'object') continue;
      walk(v, x.n && x.id ? `т.${x.n} ${x.id}/${k}` : `${where}/${k}`);
    }
  })(q.points || [], '');
  return out;
}

function scenarioFile(id) {
  const dir = path.join(REPO, 'quests', id, 'story');
  if (!fs.existsSync(dir)) return null;
  const c = fs.readdirSync(dir).map(f => ({ f, m: f.match(/^scenario-v(\d+)\.md$/) })).filter(x => x.m).sort((a, b) => b.m[1] - a.m[1]);
  return c.length ? path.join(dir, c[0].f) : null;
}

function fromScenario(file) {
  const out = [];
  const rel = path.relative(REPO, file);
  fs.readFileSync(file, 'utf8').split('\n').forEach((line, i) => {
    const m = line.match(/Ответ:\**\s*(.*)$/);
    if (!m) return;
    const [main, acc = ''] = m[1].split(/Засчитывается:?/);
    const quoted = [...main.matchAll(/«([^»]+)»/g)].map(x => x[1]);
    if (!quoted.length) return; // 📍 «вписать после теста»
    const where = `${rel}:${i + 1}`;
    const words = new Set(quoted.flatMap(q => norm(q).split(' ')));
    // «б, Славяно-греко-латинская» — буква варианта не ответ
    for (const q of quoted) add(q.replace(/^[а-гa-d]\s*,\s*/i, ''), 'ответ');
    for (const s of [...acc.matchAll(/«([^»]+)»/g)].map(x => norm(x[1]))) {
      if (s.length < 6 || s.includes(' ')) continue; // «палат», «кремл», «круг» — короче 6 букв ловят чужие слова
      if ([...words].some(w => w.startsWith(s))) add('~' + s, 'основа');
    }
    function add(answer, kind) { out.push({ answer, where, kind }); }
  });
  return out;
}

// ---------- термы ----------
function isNumber(n) { return /^\d+$/.test(n); }
function makeTerm(answer, generic) {
  const stem = answer.startsWith('~');
  let n = norm(stem ? answer.slice(1) : answer);
  if (!n) return { skip: 'пусто' };
  const num = A.numeric(n);
  if (isNumber(num.replace(/\s/g, ''))) {
    const d = num.replace(/\s/g, '');
    if (d.length < 3) return { skip: 'число короче 3 цифр' };
    return { key: d, re: new RegExp(`(?:^| )${d}(?= |$)`) };
  }
  if (n.replace(/\s/g, '').length < 3) return { skip: 'короче 3 букв' };
  if (generic.has(n)) return { skip: 'общее слово (generic)' };
  const w = n.split(' ');
  if (stem) return { key: '~' + n, re: new RegExp(`(?:^| )${w.map(esc).join(' ')}`) };
  const last = w[w.length - 1];
  const cut = /\d/.test(last) ? last : last.length >= 6 ? last.slice(0, -2) : last.length === 5 ? last.slice(0, -1) : null;
  const tail = cut == null ? `${esc(last)}(?= |$)` : `${esc(cut)}`;
  return { key: n, re: new RegExp(`(?:^| )${w.slice(0, -1).map(x => esc(x) + ' ').join('')}${tail}`) };
}

// ---------- корпус витрины ----------
const ENT = { nbsp: ' ', laquo: '«', raquo: '»', mdash: '—', ndash: '–', amp: '&', quot: '"', apos: "'", lt: '<', gt: '>', hellip: '…', shy: '' };
const decode = s => String(s).replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
  .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(+d)).replace(/&([a-z]+);/gi, (m, e) => ENT[e.toLowerCase()] != null ? ENT[e.toLowerCase()] : ' ');
const strip = h => decode(h.replace(/<[^>]*>/g, ' '));

function corpusOf(html, baseDir, label) {
  const parts = [];
  const body = html.replace(/<!--[\s\S]*?-->/g, ' ');
  const visible = body.replace(/<head[\s\S]*?<\/head>/i, ' ').replace(/<(script|style|noscript)\b[\s\S]*?<\/\1>/gi, ' ');
  parts.push({ where: `${label}: текст`, text: strip(visible) });
  const t = body.match(/<title>([\s\S]*?)<\/title>/i);
  if (t) parts.push({ where: `${label}: <title>`, text: strip(t[1]) });
  for (const m of body.matchAll(/\s(alt|title|aria-label|content|placeholder)="([^"]*)"/gi)) parts.push({ where: `${label}: ${m[1]}=`, text: decode(m[2]) });
  for (const m of body.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/gi)) parts.push({ where: `${label}: JSON-LD`, text: decode(m[1]) });
  const files = new Set();
  for (const m of body.matchAll(/\s(?:src|href|srcset)="([^"]+)"/gi)) {
    for (const u of m[1].split(',').map(s => s.trim().split(/\s+/)[0])) {
      if (!u || /^(https?:|mailto:|tel:|#|data:)/.test(u)) continue;
      const f = u.split(/[?#]/)[0];
      let name; try { name = decodeURIComponent(path.basename(f)); } catch (e) { name = path.basename(f); }
      parts.push({ where: `${label}: имя файла`, text: name.replace(/[._-]/g, ' ') });
      if (/\.svg$/i.test(f) && baseDir) files.add(path.resolve(baseDir, f));
    }
  }
  for (const f of files) {
    if (!f.startsWith(SITE) || !fs.existsSync(f)) continue;
    const s = fs.readFileSync(f, 'utf8');
    const tx = [...s.matchAll(/<(text|tspan|title|desc)\b[^>]*>([\s\S]*?)<\/\1>/gi)].map(m => strip(m[2])).join(' ');
    if (tx.trim()) parts.push({ where: `${label}: SVG ${path.relative(SITE, f)}`, text: tx });
  }
  return parts.map(p => Object.assign(p, { n: ' ' + norm(p.text) + ' ' }));
}

function caseCorpus(id, htmlOverride) {
  const caseDir = path.join(SITE, 'moscow');
  const slug = fs.readdirSync(caseDir).find(s => s.startsWith(id + '-') && fs.existsSync(path.join(caseDir, s, 'index.html')));
  if (!slug && !htmlOverride) return null;
  const pg = `moscow/${slug}/`;
  const parts = corpusOf(htmlOverride ? fs.readFileSync(htmlOverride, 'utf8') : fs.readFileSync(path.join(caseDir, slug, 'index.html'), 'utf8'),
    path.join(caseDir, slug || '-'), htmlOverride ? `${pg} (копия ${path.basename(htmlOverride)})` : pg);
  if (!htmlOverride && slug) for (const cat of ['index.html', 'moscow/index.html']) {
    const f = path.join(SITE, cat);
    if (!fs.existsSync(f)) continue;
    const h = fs.readFileSync(f, 'utf8');
    for (const li of h.split(/(?=<li class="qcard)/).slice(1)) {
      const card = li.split(/<\/li>/)[0];
      if (card.includes(`${slug}/"`)) parts.push(...corpusOf(card, path.dirname(f), `${cat} (карточка)`));
    }
  }
  return { slug, pg, parts };
}

// ---------- H-119: llms*.txt и посты канала ----------
const POSTS = path.join(REPO, 'docs', 'marketing', 'channel', 'posts');
function caseSlugs() { const d = path.join(SITE, 'moscow'); return fs.readdirSync(d).filter(s => fs.existsSync(path.join(d, s, 'index.html'))); }
// строки llms-файла для дела slug: строка со ссылкой на это дело и строки без ссылки ни на одно дело
function llmsPartsOf(text, label, slug, slugs) {
  const out = [];
  String(text).split('\n').forEach((line, i) => {
    const own = slugs.filter(s => line.includes(`/moscow/${s}/`));
    if (own.length && !own.includes(slug)) return;
    if (!line.trim()) return;
    out.push({ where: `${label}:${i + 1}${own.length ? ' (строка дела)' : ''}`, text: decode(line) });
  });
  return out;
}
function extraParts(slug, opts) {
  const parts = [], slugs = caseSlugs();
  const llms = opts.llms ? [path.resolve(opts.llms)] : fs.readdirSync(SITE).filter(f => /^llms.*\.txt$/.test(f)).map(f => path.join(SITE, f));
  for (const f of llms) parts.push(...llmsPartsOf(fs.readFileSync(f, 'utf8'), opts.llms ? `${path.basename(f)} (копия)` : path.relative(REPO, f), slug, slugs));
  const dir = opts.posts ? path.resolve(opts.posts) : POSTS;
  if (fs.existsSync(dir)) for (const f of fs.readdirSync(dir).filter(f => f.endsWith('.md')).sort()) {
    const t = fs.readFileSync(path.join(dir, f), 'utf8');
    const fm = t.match(/^---\n([\s\S]*?)\n---\n?/);
    const status = fm && (fm[1].match(/^status:\s*"?([\w-]+)/m) || [])[1];
    if (status === 'published') continue;
    parts.push({ where: `${opts.posts ? f + ' (копия)' : path.relative(REPO, path.join(dir, f))} (пост канала${status ? ', ' + status : ''})`, text: strip(fm ? t.slice(fm[0].length) : t) });
  }
  return parts.map(p => Object.assign(p, { n: ' ' + norm(p.text) + ' ' }));
}

// ---------- проверка ----------
function answersFor(id) {
  const qf = path.join(REPO, 'quests', id, 'quest.json');
  if (fs.existsSync(qf)) return { src: path.relative(REPO, qf), list: fromQuest(JSON.parse(fs.readFileSync(qf, 'utf8'))) };
  const sf = scenarioFile(id);
  if (!sf) return { skip: `quests/${id}: нет quest.json и story/scenario-v*.md — ответы не с чем сверить, пропуск` };
  const list = fromScenario(sf);
  if (!list.length) return { skip: `${path.relative(REPO, sf)}: нет строк «Ответ: «…»» — пропуск` };
  return { src: path.relative(REPO, sf), list };
}

// поля сценария → термы; одинаковые поля (тот же набор ответов в двух шагах-ветках) склеиваются
function fieldsOf(list, generic) {
  const byWhere = new Map(), skipped = [];
  for (const r of list) {
    const t = makeTerm(r.answer, generic);
    if (t.skip) { skipped.push(`${r.answer} (${t.skip})`); continue; }
    if (!byWhere.has(r.where)) byWhere.set(r.where, { where: [r.where], kind: r.kind, terms: [] });
    const f = byWhere.get(r.where);
    if (!f.terms.some(x => x.key === t.key)) f.terms.push(Object.assign(t, { answer: r.answer }));
  }
  const bySig = new Map();
  for (const f of byWhere.values()) {
    const sig = f.terms.map(t => t.key).sort().join('|');
    if (bySig.has(sig)) bySig.get(sig).where.push(...f.where); else bySig.set(sig, f);
  }
  return { fields: [...bySig.values()], skipped };
}

function terms(id, c) {
  const a = answersFor(id);
  if (a.skip) return a;
  const { fields, skipped } = fieldsOf(a.list, new Set((c.generic || []).map(norm)));
  return { src: a.src, fields, terms: fields.flatMap(f => f.terms), skipped };
}

function check(ids, opts = {}) {
  const c = opts.conf || conf();
  const errors = [], warns = [], info = [];
  const ok = c.ok || {};
  const why = v => (v && typeof v === 'object' ? v.why : v) || '';
  for (const [qid, ex] of Object.entries(ok)) {
    if (qid.startsWith('_')) continue;
    for (const [ans, v] of Object.entries(ex)) if (String(why(v)).trim().length < 15) errors.push(`scripts/answer_leaks.json: исключение «${ans}» (${qid}) без причины — напишите, почему это не спойлер`);
  }
  for (const id of ids) {
    const T = opts.quest ? Object.assign({ src: '(фикстура)' }, fieldsOf(fromQuest(opts.quest), new Set())) : terms(id, c);
    if (T.skip) { info.push(T.skip); continue; }
    const corp = opts.parts ? { pg: '(фикстура)', parts: opts.parts } : caseCorpus(id, opts.html);
    if (!corp) { info.push(`${T.src}: нет страницы site/moscow/${id}-…/ — пропуск`); continue; }
    if (!opts.parts && !opts.html) corp.parts = corp.parts.concat(extraParts(corp.slug, opts));
    const exc = new Map(Object.entries(ok[id] || {}).map(([k, v]) => [norm(k.replace(/^~/, '')), v]));
    const used = new Set();
    for (const f of T.fields) {
      const hit = f.terms.map(t => ({ t, ps: corp.parts.filter(p => t.re.test(p.n)) })).filter(h => h.ps.length);
      if (!hit.length) continue;
      const { t, ps } = hit[0], p = ps[0], i = p.n.search(t.re);
      const ctx = p.n.slice(Math.max(0, i - 35), i + 45).trim();
      const places = ps.map(h => h.where).filter((v, j, a) => a.indexOf(v) === j);
      const msg = `${places[0].startsWith(corp.pg) ? corp.pg : 'дело ' + id}: ответ «${t.answer}» (${T.src}, ${f.where.join('; ')} · ${f.kind}) — ${places.slice(0, 4).join(', ')}${places.length > 4 ? ` и ещё ${places.length - 4}` : ''}: «…${ctx}…»`;
      // "only": "<часть места>" — исключение только для находок, все места которых его содержат (напр. один пост канала)
      const inScope = v => !(v && typeof v === 'object' && v.only) || places.every(pl => pl.includes(v.only));
      const k = f.terms.map(x => norm(x.answer.replace(/^~/, ''))).find(x => exc.has(x) && inScope(exc.get(x)));
      if (k == null) { errors.push(msg); continue; }
      used.add(k);
      const v = exc.get(k);
      if (v && typeof v === 'object' && v.warn) warns.push(`${msg} — известная находка, ждёт решения: ${v.why}`);
    }
    if (!opts.html && !opts.parts && !opts.llms && !opts.posts) for (const k of exc.keys()) if (!used.has(k)) warns.push(`scripts/answer_leaks.json: исключение «${k}» (${id}) больше ничего не снимает — снять`);
  }
  return { errors, warns, info };
}

function allIds() {
  const dir = path.join(REPO, 'quests');
  const caseDir = path.join(SITE, 'moscow');
  const slugs = fs.readdirSync(caseDir);
  return fs.readdirSync(dir).filter(id => !id.startsWith('_') && slugs.some(s => s.startsWith(id + '-'))).sort();
}

// покрытие ручного списка: ответы сценария, которых нет в site_spoilers.json (браузерная проверка и llms.txt их не ловят)
function coverage(id, c) {
  const T = terms(id, c || conf());
  if (T.skip) return [];
  const sp = JSON.parse(fs.readFileSync(path.join(__dirname, 'site_spoilers.json'), 'utf8'));
  const words = Object.entries(sp).filter(([k, v]) => Array.isArray(v) && (k === '*' || k.includes(`/${id}-`))).flatMap(([, v]) => v).map(norm);
  return T.terms.filter(t => !words.some(w => w && (` ${t.key.replace(/^~/, '')}`.includes(` ${w}`) || w.startsWith(t.key.replace(/^~/, ''))))).map(t => t.answer);
}

function selftest() {
  const out = [];
  const quest = { flags: { s: 'b' }, points: [{ n: 1, id: 'x', steps: [
    { type: 'ask', answers: ['подпорка', 'подпорки', '~подпор'] },
    { type: 'ask', answers: ['17', 'семнадцать'] },
    { type: 'choice', answer: 'a', answer_flag: 's', options: [{ id: 'a', label: 'Ложный путь' }, { id: 'b', label: 'Главная аллея' }] }] }] };
  const page = h => corpusOf(h, null, 'fx');
  const run = (h, okMap) => check(['fx'], { quest, parts: page(h), conf: { ok: okMap ? { fx: okMap } : {} } }).errors;
  if (run('<p>Деревья стоят на подпорках.</p>').length !== 1) out.push('ответ в тексте («подпорках») не найден');
  if (run('<img src="a.jpg" alt="Подпорка у пруда">').length !== 1) out.push('ответ в alt не найден');
  if (run('<p>Главная аллея парка</p>').length !== 1) out.push('верный вариант choice по флагу не найден');
  if (run('<p>Ложный путь, 17 точек, семнадцать минут</p>').length) out.push('ложное срабатывание: неверный вариант или число короче 3 цифр');
  if (run('<p>подпорки</p>', { 'подпорка': 'фикстура: осознанное исключение' }).length) out.push('исключение не снимает находку');
  if (run('<p>подпорки</p>', { 'подпорка': { why: 'фикстура: исключение только для поста', only: 'posts/' } }).length !== 1) out.push('исключение с "only" сняло находку вне своих мест');
  // H-119: строка llms.txt своего дела и общая строка проверяются, строка чужого дела — нет
  const L = llmsPartsOf('# Шапка\n- [Дело 1](https://x/moscow/a-one/): подпорка у пруда\n- [Дело 2](https://x/moscow/b-two/): тоже подпорка\nСправка: подпорки', 'llms.txt', 'a-one', ['a-one', 'b-two']);
  if (L.length !== 3 || L.some(p => p.text.includes('Дело 2'))) out.push('llms.txt: строки дела выбраны неверно (своя + общие, без чужих)');
  const ll = check(['fx'], { quest, parts: L.map(p => Object.assign(p, { n: ' ' + norm(p.text) + ' ' })), conf: { ok: {} } }).errors;
  if (ll.length !== 1 || !/llms\.txt:2/.test(ll[0])) out.push('llms.txt: ответ в строке дела не найден');
  return out;
}

module.exports = { check, allIds, selftest, coverage, terms, conf };

if (require.main === module) {
  const args = Object.fromEntries(process.argv.slice(2).map(a => { const m = a.match(/^--([\w-]+)(?:=(.*))?$/); return m ? [m[1], m[2] == null ? true : m[2]] : [a, true]; }));
  if (args.selftest) { const s = selftest(); s.forEach(m => console.log(' ✗ ' + m)); console.log(s.length ? 'answer_leaks --selftest: ОШИБКА' : 'answer_leaks --selftest: OK'); process.exit(s.length ? 1 : 0); }
  const ids = args.quest ? [args.quest] : allIds();
  if (args.terms) {
    const c = conf();
    for (const id of ids) {
      const T = terms(id, c);
      if (T.skip) { console.log(`${id}: ${T.skip}`); continue; }
      console.log(`${id} (${T.src}): полей ${T.fields.length}, термов ${T.terms.length}: ${T.fields.map(f => f.terms.map(t => t.answer).join(' / ')).join('; ')}`);
      if (T.skipped.length) console.log(`  отсеяно: ${T.skipped.join(', ')}`);
      const cov = coverage(id, c);
      if (cov.length) console.log(`  нет в site_spoilers.json: ${cov.join(', ')}`);
    }
    process.exit(0);
  }
  const r = check(ids, { html: args.html, llms: args.llms, posts: args.posts });
  r.info.forEach(m => console.log(' · ' + m));
  r.warns.forEach(m => console.log(' ! ' + m));
  r.errors.forEach(m => console.log(' ✗ ' + m));
  console.log(r.errors.length ? `answer_leaks: находок ${r.errors.length}` : 'answer_leaks: OK');
  process.exit(r.errors.length ? 1 : 0);
}

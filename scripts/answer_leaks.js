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
 * «Проба» (section#probe на главной и витринах марок, владелец 27.11): её текст не совпадает ни с одним ответом ни одного дела,
 * а вопрос и ответ — с фактами черновиков и сценариев всех версий (draft*.md, scenario-v*.md) — checkProbes(); исключений нет,
 * при совпадении меняется факт пробы.
 * Одна находка — одно поле сценария (канонический ответ и его основы вместе; одинаковые поля разных шагов — одной строкой).
 * Исключения — scripts/answer_leaks.json → ok: {"<id дела>": {"<любой ответ или основа поля>": "почему это не спойлер"}};
 * значение-объект {"why": "…", "warn": true} — известная находка ждёт решения (Сценарист): не красное, а жёлтое каждый запуск;
 * {"why": "…", "only": "006-otvet-zil-gagarin.md"} — исключение только для находок в этих местах (тот же ответ на витрине — красное).
 * Причина обязательна (от 15 знаков); исключение, которое больше ничего не снимает, — предупреждение «снять».
 * Пользуется site_check.js (и --sync): найденный ответ без исключения — ошибка.
 * T-144: scripts/channel_post.py --check берёт ответы отсюда же — node scripts/answer_leaks.js --posts-json=файл,файл|папка
 * (JSON {файл: {errors, warns}}; текст поста и опрос, все дела, исключения ok). Обратная проверка: архивный пост с «космонавтов»
 * (archive/docs/marketing/channel/posts/006-otvet-zil-gagarin.md) краснеет. */
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

// T-144: посты канала для scripts/channel_post.py --check — тот же источник правды, что у витрины и site_check: ответы всех дел,
// исключения answer_leaks.json → ok (с "only"). Каждый файл — отдельно, чтобы находка называла свой пост; статус не смотрим —
// какие посты проверять (не published, или тот, что публикуется), решает channel_post.py.
function postText(t) { const fm = t.match(/^---\n([\s\S]*?)\n---\n?/); return { status: fm && (fm[1].match(/^status:\s*"?([\w-]+)/m) || [])[1], body: fm ? t.slice(fm[0].length) : t, fm: fm ? fm[1] : '' }; }
function checkPosts(files, opts = {}) {
  const out = {}, ids = opts.ids || allIds();
  for (const f of files) {
    const abs = path.resolve(f), rel = abs.startsWith(REPO + path.sep) ? path.relative(REPO, abs) : abs;
    const p = postText(fs.readFileSync(abs, 'utf8'));
    // опрос (poll_question, poll_options) — во frontmatter, а виден в канале так же, как текст
    const poll = (p.fm.match(/^poll_(question|options):.*$/gm) || []).map(l => l.replace(/^poll_\w+:\s*/, '')).join(' ');
    const parts = [{ where: `${rel} (пост канала${p.status ? ', ' + p.status : ''})`, text: strip(p.body + ' ' + poll) }].map(x => Object.assign(x, { n: ' ' + norm(x.text) + ' ' }));
    const r = check(ids, { parts, conf: opts.conf, quest: opts.quest });
    out[rel] = { errors: r.errors, warns: r.warns };
  }
  return out;
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
    // исключения только для картинок сценария ("only": "quest.json") витрину не касаются — их ведёт checkImages
    for (const [k, v] of [...exc]) if (v && typeof v === 'object' && String(v.only || '').includes('quest.json')) exc.delete(k);
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

// Блок «Проба» (section#probe) на витринах вне дел — главная «Дворами», «Следами» (владелец 27.11): проба показывает
// факт сразу, без кода, поэтому он не должен совпадать ни с одним ответом ни одного дела. Исключений нет — меняется проба.
// Продюсер 27.11 (рецензент: проба выдавала ответ т.8 черновика Чистых прудов): ещё и с черновиками и сценариями всех
// версий — quests/*/story/**/draft*.md (строки таблиц), scenario-v*.md (строки «Ответ:») и тексты quest.json: общая пара значимых слов
// (от 5 букв, по основам) у вопроса или ответа пробы и строки — это тот же факт в маршруте, проба его выдаёт.
function probeSection(html) {
  const m = String(html).replace(/<!--[\s\S]*?-->/g, ' ').match(/<section\b[^>]*\sid="probe"[^>]*>[\s\S]*?<\/section>/i);
  return m ? m[0] : '';
}
function probeParts(html, label) {
  const sec = probeSection(html);
  return sec ? corpusOf(sec, null, `${label}, «Проба»`) : [];
}
// вопрос и ответ пробы: .lamp-q/.lamp-a («Дворами»), .sheet-q/.sheet-a («Следами»)
function probeQA(html) {
  return [...probeSection(html).matchAll(/<(\w+)\b[^>]*class="[^"]*\b(?:lamp|sheet)-[qa]\b[^"]*"[^>]*>([\s\S]*?)<\/\1>/gi)].map(m => strip(m[2])).join(' ');
}
const stemOf = w => w.slice(0, Math.max(4, w.length - 2));
function pairsOf(text) {
  const w = norm(text).split(' ').filter(x => x.length >= 5 && !/^\d+$/.test(x)).map(stemOf);
  const out = new Set();
  for (let i = 1; i < w.length; i++) out.add(w[i - 1] + ' ' + w[i]);
  return out;
}
function storyRows() {
  const out = [], QD = path.join(REPO, 'quests');
  const walk = d => fs.readdirSync(d, { withFileTypes: true }).flatMap(e => e.isDirectory() ? walk(path.join(d, e.name)) : /^(draft.*|scenario-v\d+)\.md$/.test(e.name) ? [path.join(d, e.name)] : []);
  for (const id of fs.readdirSync(QD)) {
    const qf = path.join(QD, id, 'quest.json');   // и тексты действующего сценария (реплики, вопросы, факты после ответа)
    if (fs.existsSync(qf)) (function w(x, p) {
      if (typeof x === 'string') { if (x.length >= 20) out.push({ where: `quests/${id}/quest.json ${p}`, text: x }); }
      else if (x && typeof x === 'object') for (const k in x) w(x[k], p + '/' + k);
    })(JSON.parse(fs.readFileSync(qf, 'utf8')), '');
    const sd = path.join(QD, id, 'story');
    if (!fs.existsSync(sd)) continue;
    for (const f of walk(sd)) {
      const draft = /^draft/.test(path.basename(f));
      fs.readFileSync(f, 'utf8').split('\n').forEach((l, i) => {
        if (draft ? /^\|/.test(l) && !/^\|[\s|:-]+$/.test(l) : /Ответ:/.test(l)) out.push({ where: `${path.relative(REPO, f)}:${i + 1}`, text: l });
      });
    }
  }
  return out;
}
function htmlPages(dir = SITE) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap(e => e.isDirectory() ? (e.name === 'play' ? [] : htmlPages(path.join(dir, e.name)))
    : e.name.endsWith('.html') ? [path.join(dir, e.name)] : []);
}
function checkProbes(opts = {}) {
  const c = opts.conf || conf();
  const pages = (opts.pages || htmlPages().map(f => [path.relative(REPO, f), fs.readFileSync(f, 'utf8')])).filter(([, h]) => probeSection(h));
  const parts = pages.flatMap(([label, html]) => probeParts(html, label));
  if (!parts.length) return [];
  const sets = opts.quest ? [Object.assign({ id: 'fx', src: '(фикстура)' }, fieldsOf(fromQuest(opts.quest), new Set()))]
    : allIds().map(id => Object.assign({ id }, terms(id, c))).filter(T => !T.skip);
  const errors = [];
  for (const T of sets) for (const f of T.fields) {
    const hit = f.terms.map(t => ({ t, p: parts.find(p => t.re.test(p.n)) })).find(h => h.p);
    if (hit) errors.push(`${hit.p.where}: совпадает с ответом «${hit.t.answer}» дела ${T.id} (${T.src}, ${f.where.join('; ')}) — проба не должна раскрывать ответ загадки, смените факт пробы`);
  }
  const rows = (opts.rows || storyRows()).map(r => Object.assign(r, { pairs: pairsOf(r.text) }));
  for (const [label, html] of pages) {
    const mine = pairsOf(probeQA(html));
    for (const r of rows) {
      const common = [...r.pairs].filter(x => mine.has(x));
      if (common.length) errors.push(`${label}, «Проба»: тот же факт, что в ${r.where} (общие слова: «${common.slice(0, 3).join('», «')}») — проба выдаёт ход загадки из маршрута или черновика, смените факт пробы`);
    }
  }
  return errors;
}

// ---------- T-159: картинки сценария до загадки ----------
// Подпись, alt и имя файла картинки (и записи) в quest.json не содержат ответа загадки, которая ещё впереди: игрок видит
// картинку до ответа (рецензент 28.11: alt s18 «…рамы…» стоял перед загадкой т.10 с ответом «рама»). Порядок — порядок
// показа в quest.json (вступление → точки → шаги → финал); блок ok шага — после его ответа (там можно называть ответ этого
// шага, но не следующих); картинки вариантов choice не проверяются ответом своего же поля (вариант и так на экране).
// Здесь — канонический ответ, ВСЕ варианты answers (это слова, которые игрок впишет: «рамы» у ответа «рама») и основы «~».
// Не проверяются: подсказки (hints — ведут к ответу намеренно), kids, replies, check (служебное).
// Исключения — answer_leaks.json → ok (как у витрины; только для картинок — "only": "quest.json"). Нашли настоящую утечку —
// правит Автор (alt, подпись, имя файла), не исключение «чтобы позеленело».
const IMG_KEYS = ['alt', 'caption', 'img', 'image', 'audio', 'src'];
// имена файлов — латиницей (s02-amo-1931.webp): ответ ищем и транслитом, по основе (как makeTerm), от 4 знаков
const TR = { а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'e', ж: 'zh', з: 'z', и: 'i', й: 'y', к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p', р: 'r', с: 's', т: 't', у: 'u', ф: 'f', х: 'h', ц: 'ts', ч: 'ch', ш: 'sh', щ: 'sch', ъ: '', ы: 'y', ь: '', э: 'e', ю: 'yu', я: 'ya' };
const translit = s => [...s].map(ch => TR[ch] != null ? TR[ch] : ch).join('');
function latinRe(t) {
  if (!t || /^\d+$/.test(t.key)) return null;
  const stem = t.key.startsWith('~'), w = t.key.replace(/^~/, '').split(' ');
  const last = w[w.length - 1], cut = stem ? last : last.length >= 6 ? last.slice(0, -2) : last.length >= 4 ? last.slice(0, -1) : last;
  const lat = translit(w.slice(0, -1).concat(cut).join(' '));
  if (lat.replace(/\s/g, '').length < 4 || !/[a-z]/.test(lat)) return null;
  const v = esc(lat).replace(/h/g, '(?:h|kh)');
  return new RegExp(`(?:^| )${v}`);
}
function imageEvents(q, rel) {
  const ev = [];
  const fileWords = v => { const b = path.basename(String(v)).replace(/\.[a-z0-9]{2,4}$/i, ''); return b.replace(/[._-]/g, ' '); };
  const fieldTerms = x => {
    const out = [];
    const ask = list => {
      for (const a of (list || []).filter(a => typeof a === 'string')) {
        if (a.startsWith('~')) { if (a.slice(1).replace(/\s/g, '').length >= 4) out.push(a); } else out.push(a);
      }
    };
    if (x.type === 'pick' || x.type === 'strike') return out;
    if (Array.isArray(x.answers) && x.type !== 'choice') ask(x.answers);
    if (Array.isArray(x.all)) x.all.forEach(g => ask(Array.isArray(g) ? g : g && g.answers));
    if (x.type === 'choice' && Array.isArray(x.options) && !Array.isArray(x.answer) && !x.any_answer) {
      const id = x.answer_flag && (q.flags || {})[x.answer_flag] != null ? String(q.flags[x.answer_flag]) : x.answer;
      const o = x.options.find(o => String(o.id) === String(id));
      if (o && o.label) out.push(o.label.replace(/^[А-ГA-D1-9]\s*[—–-]\s*/, ''));
    }
    return out;
  };
  const SKIP = ['kids', 'replies', 'hints', 'check'];
  (function visit(x, where, own) {
    if (Array.isArray(x)) return x.forEach((e, i) => visit(e, `${where}/${i}`, own));
    if (!x || typeof x !== 'object') return;
    const txt = IMG_KEYS.filter(k => typeof x[k] === 'string' && x[k]).map(k => ['img', 'image', 'audio', 'src'].includes(k) ? fileWords(x[k]) : x[k]);
    if (txt.length && (x.img || x.image || x.alt || x.caption || x.audio)) ev.push({ kind: 'img', where: `${rel} ${where}`, text: txt.join(' '), own,
      files: IMG_KEYS.filter(k => ['img', 'image', 'audio', 'src'].includes(k) && typeof x[k] === 'string' && x[k]).map(k => fileWords(x[k]).toLowerCase()).join(' ') });
    const terms = fieldTerms(x);
    const id = terms.length ? `${where}` : null;
    const kids = Object.entries(x).filter(([k, v]) => v && typeof v === 'object' && !SKIP.includes(k));
    const name = (k) => x.n && x.id ? `т.${x.n} ${x.id}/${k}` : `${where}/${k}`;
    for (const [k, v] of kids) if (k !== 'ok') visit(v, name(k), id && k === 'options' ? id : own);
    if (id) ev.push({ kind: 'field', id, where: `${rel} ${where}`, answers: terms });
    for (const [k, v] of kids) if (k === 'ok') visit(v, name(k), own);
  })({ intro: q.intro, points: q.points, finale: q.finale }, '', null);
  return ev;
}
function checkImages(ids, opts = {}) {
  const c = opts.conf || conf(), generic = new Set((c.generic || []).map(norm));
  const errors = [], warns = [];
  const why = v => (v && typeof v === 'object' ? v.why : v) || '';
  for (const id of ids) {
    const qf = opts.questFile ? path.resolve(opts.questFile) : path.join(REPO, 'quests', id, 'quest.json');
    if (!opts.quest && !fs.existsSync(qf)) continue;
    const q = opts.quest || JSON.parse(fs.readFileSync(qf, 'utf8'));
    const rel = opts.quest ? '(фикстура quest.json)' : opts.questFile ? `${path.basename(qf)} (копия)` : path.relative(REPO, qf);
    const ev = imageEvents(q, rel);
    const exc = new Map(Object.entries((c.ok || {})[id] || {}).map(([k, v]) => [norm(k.replace(/^~/, '')), v]));
    const used = new Set();
    const fields = ev.map((e, i) => [e, i]).filter(([e]) => e.kind === 'field').map(([e, i]) => {
      const terms = [];
      for (const a of e.answers) { const t = makeTerm(a, generic); if (!t.skip && !terms.some(x => x.key === t.key)) terms.push(Object.assign(t, { answer: a, lat: latinRe(t) })); }
      return { e, i, terms };
    });
    const seen = new Set();
    ev.forEach((im, i) => {
      if (im.kind !== 'img') return;
      const n = ' ' + norm(im.text) + ' ', fl = ' ' + (im.files || '') + ' ';
      for (const f of fields) {
        if (f.i < i || f.e.id === im.own) continue;
        const t = f.terms.find(t => t.re.test(n) || (t.lat && t.lat.test(fl)));
        if (!t) continue;
        const msg = `${im.where}: «${im.text.slice(0, 80)}» — ответ «${t.answer}» загадки впереди (${f.e.where}) — игрок видит картинку до ответа; поправьте alt, подпись или имя файла (правит Автор)`;
        if (seen.has(msg)) continue; seen.add(msg);
        const inScope = v => !(v && typeof v === 'object' && v.only) || im.where.includes(v.only);
        const k = f.terms.map(x => norm(x.answer.replace(/^~/, ''))).find(x => exc.has(x) && inScope(exc.get(x)));
        if (k == null) { errors.push(msg); continue; }
        used.add(k);
        const v = exc.get(k);
        if (v && typeof v === 'object' && v.warn) warns.push(`${msg} — известная находка, ждёт решения: ${why(v)}`);
      }
    });
    if (!opts.quest && !opts.questFile) for (const [k, v] of exc) if (v && typeof v === 'object' && String(v.only || '').includes('quest.json') && !used.has(k)) warns.push(`scripts/answer_leaks.json: исключение «${k}» (${id}, картинки quest.json) больше ничего не снимает — снять`);
  }
  return { errors, warns };
}

function selftest() {
  const out = [];
  // T-159: картинка до загадки с её ответом (и формой из answers) — красное; после ответа — можно; вариант choice — не своим полем
  const iq = { flags: {}, intro: [{ img: 'media/scenes/s00.webp', alt: 'Двор' }], points: [
    { n: 1, id: 'a', scene: [{ img: 'media/scenes/s01.webp', alt: 'Старые рамы у забора' }], steps: [{ type: 'ask', answers: ['подпорка'], ok: [{ img: 'media/scenes/s02-podporka.webp', alt: 'Подпорка у пруда' }] }] },
    { n: 2, id: 'b', steps: [{ type: 'choice', answer: 'x', options: [{ id: 'x', label: 'Конвейер', img: 'konveyer.webp', alt: 'Конвейер' }, { id: 'y', label: 'Склад' }] },
      { type: 'ask', answers: ['рама', 'рамы', 'раму'] }] }] };
  const ci = (q, ok) => checkImages(['fx'], { quest: q, conf: { ok: ok ? { fx: ok } : {} } }).errors;
  const e1 = ci(iq);
  if (e1.length !== 1 || !/рамы/.test(e1[0])) out.push(`картинки quest.json: alt «рамы» перед загадкой с ответом «рама» не найден или лишние находки (${e1.length})`);
  const iq2 = JSON.parse(JSON.stringify(iq)); iq2.points[0].scene[0].alt = 'Старый забор'; iq2.points[0].scene[0].img = 'media/scenes/s01-podporka.webp';
  const e2 = ci(iq2);
  if (e2.length !== 1 || !/s01 podporka/.test(e2[0])) out.push('картинки quest.json: ответ в имени файла картинки до загадки не найден');
  if (ci(iq, { 'рама': { why: 'фикстура: исключение для картинок сценария', only: 'quest.json' } }).length) out.push('картинки quest.json: исключение с "only": "quest.json" не сняло находку');
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
  // «Проба» вне дел: ответ любого дела в section#probe — ошибка, текст вне пробы — не её дело
  const pr = h => checkProbes({ quest, pages: [['fx.html', h]], conf: { ok: {} } });
  if (pr('<section class="probe" id="probe"><p>Деревья стоят на подпорках</p></section>').length !== 1) out.push('«Проба»: ответ дела в блоке пробы не найден');
  if (pr('<section id="probe"><p>Бульвары на месте стены</p></section><p>подпорка</p>').length) out.push('«Проба»: ложное срабатывание на текст вне блока');
  const rows = [{ where: 'draft-v0.md:8', text: '| 8 | Покровские ворота | Ворот нет. Бульвар на месте стены Белого города (1585–1593) | было/стало |' }];
  const pd = h => checkProbes({ quest, pages: [['fx.html', h]], rows, conf: { ok: {} } });
  if (pd('<section id="probe"><p class="lamp-q">Почему кольцо?</p><p class="lamp-a"><span class="ink">Здесь стояла стена Белого города.</span></p></section>').length !== 1) out.push('«Проба»: факт из черновика маршрута не найден');
  if (pd('<section id="probe"><p class="lamp-q">Как называется форма башни?</p><p class="lamp-a"><span class="ink">Гиперболоид инженера Шухова.</span></p></section>').length) out.push('«Проба»: ложное совпадение с черновиком');
  // T-144: посты канала для channel_post.py — находка называет свой файл, исключение с "only" действует
  const tmp = fs.mkdtempSync(path.join(require('os').tmpdir(), 'leaks-posts-'));
  const pf = path.join(tmp, 'channel', 'posts');
  fs.mkdirSync(pf, { recursive: true });
  fs.writeFileSync(path.join(pf, 'a.md'), '---\nstatus: draft\npoll_question: Что у пруда?\n---\nДеревья стоят на <b>подпорках</b>.');
  fs.writeFileSync(path.join(pf, 'b.md'), '---\nstatus: draft\n---\nСемнадцать точек и ложный путь.');
  const cp = (ok) => checkPosts([path.join(pf, 'a.md'), path.join(pf, 'b.md')], { ids: ['fx'], quest, conf: { ok: ok ? { fx: ok } : {} } });
  const r1 = cp();
  const ka = Object.keys(r1).find(k => k.endsWith('a.md')), kb = Object.keys(r1).find(k => k.endsWith('b.md'));
  if (!ka || r1[ka].errors.length !== 1 || !r1[ka].errors[0].includes('a.md')) out.push('посты канала: ответ в посте не найден или находка не называет пост');
  if (!kb || r1[kb].errors.length) out.push('посты канала: ложное срабатывание (неверный вариант, число словом)');
  if (cp({ 'подпорка': { why: 'фикстура: исключение только для постов', only: 'channel/posts/' } })[ka].errors.length) out.push('посты канала: исключение с "only": "channel/posts/" не сняло находку в посте');
  fs.rmSync(tmp, { recursive: true, force: true });
  return out;
}

module.exports = { checkImages, imageEvents, check, checkPosts, allIds, selftest, coverage, terms, conf, checkProbes, caseCorpus, corpusOf, extraParts, norm, strip }; // корпус витрины — и для scripts/story_drift.js

if (require.main === module) {
  const args = Object.fromEntries(process.argv.slice(2).map(a => { const m = a.match(/^--([\w-]+)(?:=(.*))?$/); return m ? [m[1], m[2] == null ? true : m[2]] : [a, true]; }));
  if (args.selftest) { const s = selftest(); s.forEach(m => console.log(' ✗ ' + m)); console.log(s.length ? 'answer_leaks --selftest: ОШИБКА' : 'answer_leaks --selftest: OK'); process.exit(s.length ? 1 : 0); }
  if (args['posts-json']) { // T-144: для scripts/channel_post.py — файлы постов через запятую (или папка), ответ — JSON по файлам
    const list = String(args['posts-json']).split(',').filter(Boolean).flatMap(f => fs.existsSync(f) && fs.statSync(f).isDirectory() ? fs.readdirSync(f).filter(x => x.endsWith('.md')).sort().map(x => path.join(f, x)) : [f]);
    console.log(JSON.stringify(checkPosts(list)));
    process.exit(0);
  }
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
  if (args.images) { // T-159: только картинки quest.json; --quest-file=копия.json — чужая копия сценария (обратная проверка)
    const r = checkImages(ids, { questFile: args['quest-file'] });
    r.warns.forEach(m => console.log(' ! ' + m)); r.errors.forEach(m => console.log(' ✗ ' + m));
    console.log(r.errors.length ? `answer_leaks --images: находок ${r.errors.length}` : 'answer_leaks --images: OK');
    process.exit(r.errors.length ? 1 : 0);
  }
  const r = check(ids, { html: args.html, llms: args.llms, posts: args.posts });
  r.info.forEach(m => console.log(' · ' + m));
  r.warns.forEach(m => console.log(' ! ' + m));
  r.errors.forEach(m => console.log(' ✗ ' + m));
  console.log(r.errors.length ? `answer_leaks: находок ${r.errors.length}` : 'answer_leaks: OK');
  process.exit(r.errors.length ? 1 : 0);
}

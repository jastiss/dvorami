#!/usr/bin/env node
/* H-111: срок у временных объектов маршрута (выставки под открытым небом, сезонные павильоны, ремонт).
 *
 *   node scripts/temporary_check.js                 — все дела quests/*: сроки и упоминания на витрине (site/)
 *   node scripts/temporary_check.js --quest=zilart  — одно дело;  --data=путь/quest.json — файл дела (фикстура)
 *   node scripts/temporary_check.js --today=2027-01-18 — проверить на другую дату
 *   node scripts/temporary_check.js --selftest      — фикстура с прошедшей датой краснеет, за 30 дней — предупреждение
 *   node scripts/temporary_check.js --json          — записи всех дел с днями до срока (для scripts/temporary_notify.py, H-118)
 *
 * Где срок (docs/quest-format.md, «Временные объекты»): поле "temporary": {"what", "until", "source"} у любого элемента
 * quest.json (реплика, шаг, вариант, карточка, точка); пока quest.json заморожен полевым тестом — те же записи
 * в quests/<id>/temporary.json ("items", у записи ещё "where" — где в деле). "until" — последний день, когда объект на месте
 * (ГГГГ-ММ-ДД, по Москве). "match" (необязательно) — строка для поиска на витрине; по умолчанию — слово в «» из "what".
 * За 30 дней до срока — предупреждение, после срока — ошибка: снять или заменить реплику (ветка Б) и строку витрины,
 * либо продлить срок по источнику. Пользуются site_check.js и player_check.js.
 * H-117: плеер после срока сам снимает элемент с "temporary", а "flag": "st4s=B" (в записи) переключает флаг-факт на ветку Б.
 * Поэтому в player_check (judge(..., {player: true})) прошедший срок у такой записи — предупреждение «плеер скрывает», а не ошибка;
 * запись temporary.json без "flag" плееру не на что опереться — ошибка. Флаг, которого нет в "flags" дела, — ошибка (опечатка).
 */
'use strict';
const fs = require('fs');
const path = require('path');

const REPO = path.resolve(__dirname, '..');
const WARN_DAYS = 30;
const DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

const ru = d => d.split('-').reverse().join('.');
const dayNo = d => { const m = String(d).match(DATE); return m ? Date.UTC(+m[1], +m[2] - 1, +m[3]) / 864e5 : NaN; };
// сегодня по Москве (UTC+3, без перехода на летнее время)
const todayMsk = () => new Date(Date.now() + 3 * 3600e3).toISOString().slice(0, 10);

// записи "temporary" из дела: { what, until, source, match, where }
function collect(q, file) {
  const out = [];
  (function walk(x, where) {
    if (Array.isArray(x)) return x.forEach((e, i) => walk(e, `${where}[${i}]`));
    if (!x || typeof x !== 'object') return;
    if (x.temporary) out.push(Object.assign({}, x.temporary, { where: `${file}, ${where}`, auto: true }));
    for (const [k, v] of Object.entries(x)) if (k !== 'temporary' && v && typeof v === 'object') walk(v, x.id && x.n ? `т.${x.n} ${k}` : `${where}.${k}`.replace(/^\./, ''));
  })(q, '');
  return out;
}

function forQuest(id, data) {
  const qf = data || path.join(REPO, 'quests', id, 'quest.json');
  const rel = path.relative(REPO, qf);
  const q = fs.existsSync(qf) ? JSON.parse(fs.readFileSync(qf, 'utf8')) : {};
  const out = collect(q, rel);
  const side = path.join(REPO, 'quests', id || '-', 'temporary.json');
  if (!data && fs.existsSync(side)) {
    const s = JSON.parse(fs.readFileSync(side, 'utf8'));
    for (const r of s.items || []) out.push(Object.assign({}, r, { where: `quests/${id}/temporary.json${r.where ? ' (' + r.where + ')' : ''}`, auto: !!r.flag }));
  }
  for (const r of out) if (r.flag != null) {
    const k = String(r.flag).split(/[:=]/)[0].trim();
    if (!/^[\w-]+\s*[:=]\s*\S+$/.test(String(r.flag)) || !Object.prototype.hasOwnProperty.call(q.flags || {}, k)) r.flagBad = true;
  }
  return out;
}

function allQuests() {
  const dir = path.join(REPO, 'quests');
  return fs.readdirSync(dir).filter(id => fs.existsSync(path.join(dir, id, 'quest.json'))).sort()
    .flatMap(id => forQuest(id).map(r => Object.assign(r, { quest: id })));
}

// страницы витрины (без плеера и юридических), где упомянут объект
function sitePages(match) {
  const root = path.join(REPO, 'site'), out = [];
  (function walk(d, rel) {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      if (e.isDirectory()) { if (!/^(play|legal|assets)$/.test(e.name) || rel) walk(path.join(d, e.name), rel + e.name + '/'); }
      else if (e.name === 'index.html' || /^llms.*\.txt$/.test(e.name)) {
        const t = fs.readFileSync(path.join(d, e.name), 'utf8').replace(/&nbsp;/g, ' ');
        if (t.includes(match)) out.push(rel + (e.name === 'index.html' ? '' : e.name) || '/');
      }
    }
  })(root, '');
  return out;
}

// { errors, warns } на дату today; site — искать упоминания на витрине; opts.player — проверка плеера (H-117)
function judge(recs, today, site, opts = {}) {
  const errors = [], warns = [], t = dayNo(today || todayMsk());
  for (const r of recs) {
    const what = r.what || '(без what)';
    if (!r.what || !DATE.test(String(r.until || ''))) { errors.push(`${r.where}: temporary — нужны "what" и "until" (ГГГГ-ММ-ДД), сейчас ${JSON.stringify({ what: r.what, until: r.until })}`); continue; }
    if (r.flagBad) { errors.push(`${r.where}: temporary.flag «${r.flag}» — нужен флаг дела в виде "st4s=B" (такого ключа нет в "flags" дела — плеер не переключит ветку)`); continue; }
    const left = dayNo(r.until) - t;
    const match = r.match || ((what.match(/«([^»]+)»/) || [])[1]) || what;
    const pages = site ? sitePages(match) : [];
    const on = pages.length ? `; на витрине: ${pages.join(', ')}` : '';
    const src = r.source ? ` (источник: ${r.source})` : '';
    if (left < 0 && opts.player && r.auto) warns.push(`${what} — срок вышел ${ru(r.until)}: плеер снимает элемент${r.flag ? ` (ветка ${r.flag})` : ''}; после разбора теста — убрать из ${r.where} или продлить срок${src}`);
    else if (left < 0) errors.push(`${what} — срок вышел ${ru(r.until)}: снять или заменить в ${r.where}${on}, либо продлить срок по источнику${src}${opts.player && !r.auto ? '; плеер сам не скроет — добавьте в запись "flag": "<флаг>=B"' : ''}`);
    else if (left <= WARN_DAYS) warns.push(`${what} — до ${ru(r.until)} осталось ${left} дн.: проверить на месте и подготовить замену (${r.where}${on})${src}`);
  }
  return { errors, warns };
}

// самопроверка на фикстуре: тот же срок до, близко к и после даты
function selftest() {
  const fx = path.join(__dirname, 'fixtures', 'quest-format5.json');
  const recs = forQuest(null, fx);
  const bad = [];
  if (!recs.length) bad.push(`в ${path.relative(REPO, fx)} нет записи "temporary" — самопроверке не на чем`);
  else {
    const u = recs[0].until, shift = n => new Date((dayNo(u) + n) * 864e5).toISOString().slice(0, 10);
    const past = judge(recs.slice(0, 1), shift(1)), near = judge(recs.slice(0, 1), shift(-10)), far = judge(recs.slice(0, 1), shift(-60)), last = judge(recs.slice(0, 1), shift(0));
    if (past.errors.length !== 1) bad.push(`прошедшая дата (${ru(shift(1))}) не дала ошибку`);
    if (near.errors.length || near.warns.length !== 1) bad.push('за 10 дней до срока нет предупреждения');
    if (far.errors.length || far.warns.length) bad.push('за 60 дней до срока — лишнее срабатывание');
    if (last.errors.length) bad.push('в последний день срока — ошибка (срок включительно)');
    if (!judge([{ what: 'x', until: '17.01.2027', where: 'тест' }], '2026-01-01').errors.length) bad.push('дата не в формате ГГГГ-ММ-ДД не дала ошибку');
    // H-117: плеер сам снимает элемент — в player_check прошедший срок жёлтый; запись без flag — красная
    const pl = judge(recs.slice(0, 1), shift(1), false, { player: true });
    if (!recs[0].auto || pl.errors.length || pl.warns.length !== 1) bad.push('player_check: элемент с temporary после срока — должно быть предупреждение «плеер снимает», а не ошибка');
    if (!judge([{ what: 'x', until: u, where: 'тест' }], shift(1), false, { player: true }).errors.length) bad.push('player_check: запись temporary.json без flag после срока не дала ошибку');
    if (!judge([{ what: 'x', until: u, where: 'тест', flag: 'st4s=B', flagBad: true }], shift(-60)).errors.length) bad.push('flag с несуществующим ключом не дал ошибку');
  }
  return bad;
}

module.exports = { collect, forQuest, allQuests, judge, selftest, todayMsk, WARN_DAYS };

if (require.main === module) {
  const args = Object.fromEntries(process.argv.slice(2).map(a => a.replace(/^--/, '').split('=')));
  if ('selftest' in args) {
    const bad = selftest();
    bad.forEach(b => console.log(' ✗ ' + b));
    console.log(bad.length ? 'temporary_check --selftest: ОШИБКА' : 'temporary_check --selftest: OK (прошедшая дата — ошибка, за 30 дней — предупреждение)');
    process.exit(bad.length ? 1 : 0);
  }
  const recs = args.data ? forQuest(null, path.resolve(args.data)) : args.quest ? forQuest(args.quest) : allQuests();
  if ('json' in args) {
    const t = dayNo(args.today || todayMsk());
    console.log(JSON.stringify(recs.filter(r => r.what && DATE.test(String(r.until || ''))).map(r => {
      const match = r.match || ((r.what.match(/«([^»]+)»/) || [])[1]) || r.what;
      return { quest: r.quest || args.quest || '', what: r.what, until: r.until, left: dayNo(r.until) - t, flag: r.flag || '', source: r.source || '', pages: sitePages(match) };
    })));
    process.exit(0);
  }
  const r = judge(recs, args.today, !args.data);
  r.warns.forEach(w => console.log(' ! ' + w));
  r.errors.forEach(e => console.log(' ✗ ' + e));
  console.log(`temporary_check: ${recs.length} временных объектов на ${args.today || todayMsk()} — ${r.errors.length ? r.errors.length + ' ошибок' : 'OK'}${r.warns.length ? `, предупреждений ${r.warns.length}` : ''}`);
  process.exit(r.errors.length ? 1 : 0);
}

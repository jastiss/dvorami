#!/usr/bin/env node
/* Витрина дела ↔ сценарий: дрейф сюжета (T-140; CLAUDE.md, «Витрина = квест»).
 *   node scripts/story_drift.js                 — все дела; выход 1 — есть ошибки
 *   node scripts/story_drift.js --selftest      — фикстура: каждое расхождение краснеет
 *   обратная проверка на копиях: --sync=копия.json (вместо platform/site/story-sync.json), --quest=zilart --html=копия.html
 *   (страница дела), --llms=копия.txt, --posts=папка — подставленное расхождение краснеет.
 *
 * (а) Версия. platform/site/story-sync.json → <id дела>.version — версия сценария, с которой сверена витрина дела
 *     (страница, карточки, OG, site/llms*.txt, посты канала). Должна быть = quests/<id>/quest.json → version
 *     (у дела без quest.json — «vN» последнего story/scenario-vN.md). Иначе ошибка «витрина не пересверена со сценарием vX».
 *     Нет записи: у дела с quest.json — ошибка, у дела только со сценарием-текстом — предупреждение.
 * (б) Персонажи. Имена в «Кто ведёт дело» (section#cast: <dt> и подпись цитаты) — среди speakers quests/<id>/quest.json.
 *     Групповая строка («Свидетели», «Помощники»…) — проверяются имена с заглавной буквы в её описании (не в начале фразы).
 * (в) Снятое. quests/<id>/retired.json → items[].text — снятые из сценария имена, годы, фразы. Их не должно быть на витрине
 *     дела и в его карточках (текст и разметка), в OG (platform/site/og-manifest.json), в site/llms*.txt (строка дела и
 *     общие строки) и в постах канала (кроме status: published). Сравнение — как у ответов (answer_leaks.js): нормализация
 *     плеера, фраза с начала слова, последнее слово — как префикс («телеграмм» ловит «телеграммы»); число — целиком.
 *     Кадры плеера на витрине (screens: файл → версия, scripts/player_frame.js) — с той же версии; кадр assets/play/ на главной
 *     или в каталоге без записи в screens — ошибка. Снятое (в) ищется и в общих блоках главной и каталога (текст, alt, JSON-LD).
 * Пользуется site_check.js (и --sync). */
'use strict';
const fs = require('fs');
const path = require('path');
const L = require('./answer_leaks.js');

const REPO = path.resolve(__dirname, '..');
const SYNC = path.join(REPO, 'platform', 'site', 'story-sync.json');
const OG = path.join(REPO, 'platform', 'site', 'og-manifest.json');
const esc = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const rel = f => path.relative(REPO, f);

// ---------- (а) версия сценария ----------
function scenarioVersion(id) {
  const qf = path.join(REPO, 'quests', id, 'quest.json');
  if (fs.existsSync(qf)) return { v: String(JSON.parse(fs.readFileSync(qf, 'utf8')).version || ''), src: rel(qf), json: true };
  const dir = path.join(REPO, 'quests', id, 'story');
  const n = fs.existsSync(dir) ? fs.readdirSync(dir).map(f => (f.match(/^scenario-v(\d+)\.md$/) || [])[1]).filter(Boolean).map(Number) : [];
  if (!n.length) return null;
  const N = Math.max(...n);
  return { v: 'v' + N, src: `quests/${id}/story/scenario-v${N}.md`, json: false };
}
function versionCheck(ids, sync, versionOf = scenarioVersion, syncName = rel(SYNC), exists = f => fs.existsSync(path.join(REPO, f))) {
  const errors = [], warns = [];
  for (const id of ids) {
    const cur = versionOf(id);
    if (!cur) continue;
    const rec = sync[id];
    // кадры плеера на витрине (Продюсер 27.11: на главной висел экран v3 «4 из 12» с землемером) — с той же версии сценария
    for (const [f, v] of Object.entries((rec && rec.screens) || {})) {
      if (!exists(f)) { errors.push(`${syncName}: «${id}».screens — нет файла ${f}`); continue; }
      if (v && typeof v === 'object') { if (!v.mockup || String(v.mockup).length < 10) errors.push(`${syncName}: «${id}».screens ${f} — макет без причины (mockup)`); continue; }
      if (String(v) !== cur.v) errors.push(`кадр плеера ${f} снят со сценария ${v}, а дело «${id}» — ${cur.v} (${cur.src}): переснимите (node scripts/player_frame.js --quest=${id} …) и впишите ${cur.v} в ${syncName} → screens`);
    }
    if (!rec || !rec.version) {
      (cur.json ? errors : warns).push(`${cur.src} (${cur.v}): в ${syncName} нет записи «${id}» — с какой версией сценария сверена витрина дела? Сверьте и впишите`);
      continue;
    }
    if (String(rec.version) !== cur.v) errors.push(`витрина дела «${id}» не пересверена со сценарием ${cur.v} (${cur.src}; сверена с ${rec.version}). Сверьте страницу, карточки, OG, site/llms.txt и посты канала, затем впишите ${cur.v} в ${syncName}`);
  }
  return { errors, warns };
}

// ---------- (б) персонажи ----------
const GROUP = /^(свидетел|помощник|подозреваем|геро|персонаж|сосед|жител)/;
function castOf(html) {
  const m = String(html).match(/<section\b[^>]*\sid="cast"[^>]*>([\s\S]*?)<\/section>/i);
  if (!m) return null;
  const s = m[1];
  const people = [...s.matchAll(/<dt>([\s\S]*?)<\/dt>\s*<dd>([\s\S]*?)<\/dd>/gi)].map(x => ({ dt: L.strip(x[1]).replace(/\s+/g, ' ').trim(), dd: L.strip(x[2]) }));
  const f = s.match(/<blockquote\b[^>]*>[\s\S]*?<footer>([\s\S]*?)<\/footer>/i);
  return { people, quoteBy: f ? L.strip(f[1]).split(',')[0].replace(/\s+/g, ' ').trim() : null };
}
// имена с заглавной не в начале фразы: «заводской оформитель Лёва и испытатель Гоша» → Лёва, Гоша
function capitalNames(text) {
  return String(text).split(/[.!?…:;]\s+/).flatMap(sent => sent.split(/[^\p{L}-]+/u).filter(Boolean).slice(1).filter(w => /^\p{Lu}/u.test(w)));
}
function castCheck(id, html, speakers, where) {
  const out = [];
  const cast = castOf(html);
  if (!cast) return out;
  const names = Object.values(speakers || {}).map(s => L.norm(s.name || '')).filter(Boolean);
  const list = Object.values(speakers || {}).map(s => s.name).join(', ');
  const tok = s => L.norm(s).split(' ').filter(Boolean);
  const isSpeaker = s => { const t = tok(s); return names.some(n => { const nt = n.split(' '); return nt.length > 1 ? (' ' + t.join(' ') + ' ').includes(' ' + n) : t.some(w => w === n || (n.length >= 4 && w.startsWith(n.slice(0, -1)) && w.length <= n.length + 2)); }); };
  const bad = (who, what) => out.push(`${where} «Кто ведёт дело»: ${what} «${who}» — нет среди speakers ${`quests/${id}/quest.json`} (${list}). Персонаж снят или переименован — поправьте витрину (platform/site/cases/c*.py → scripts/build_cases.py) или сценарий`);
  for (const p of cast.people) {
    if (isSpeaker(p.dt)) continue;
    if (GROUP.test(L.norm(p.dt))) { capitalNames(p.dd).filter(n => !isSpeaker(n)).forEach(n => bad(n, `в строке «${p.dt}» назван`)); continue; }
    bad(p.dt, 'персонаж');
  }
  if (cast.quoteBy && !isSpeaker(cast.quoteBy)) bad(cast.quoteBy, 'подпись цитаты');
  return out;
}

// ---------- (в) снятые сущности ----------
function retiredOf(id) {
  const f = path.join(REPO, 'quests', id, 'retired.json');
  if (!fs.existsSync(f)) return { items: [] };
  try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) { return { error: `${rel(f)}: не JSON — ${e.message}` }; }
}
function termOf(text) {
  const n = L.norm(text);
  if (!n) return null;
  return /^\d+$/.test(n.replace(/ /g, '')) ? new RegExp(`(?:^| )${esc(n)}(?= |$)`) : new RegExp(`(?:^| )${esc(n)}`);
}
function ogParts(slug) {
  if (!fs.existsSync(OG)) return [];
  const m = JSON.parse(fs.readFileSync(OG, 'utf8'));
  return Object.entries(m).filter(([, v]) => v && v.slug === slug).map(([file, v]) => ({ where: `${rel(OG)} (${file})`, text: Object.values(v.input || {}).filter(x => typeof x === 'string').join(' · ') }));
}
function retiredCheck(id, R, parts, where) {
  const out = [];
  if (R.error) return [R.error];
  for (const it of R.items || []) {
    const re = termOf(it && it.text);
    if (!re) { out.push(`quests/${id}/retired.json: пустая запись ${JSON.stringify(it)}`); continue; }
    if (!it.why || String(it.why).trim().length < 10) out.push(`quests/${id}/retired.json: «${it.text}» без причины (why) — когда и почему снято`);
    const ps = parts.filter(p => re.test(p.n));
    if (!ps.length) continue;
    const p = ps[0], i = p.n.search(re), ctx = p.n.slice(Math.max(0, i - 30), i + 50).trim();
    const places = [...new Set(ps.map(x => x.where))];
    out.push(`${where}: снятое из сценария «${it.text}» (quests/${id}/retired.json: ${it.why}) — ${places.slice(0, 4).join(', ')}${places.length > 4 ? ` и ещё ${places.length - 4}` : ''}: «…${ctx}…»`);
  }
  return out;
}

// ---------- всё вместе ----------
// кадры плеера (assets/play/…) на главной и в каталоге — каждый записан в story-sync.json → <id>.screens
function screensCheck(sync, pages = HOME.map(f => [f, fs.readFileSync(path.join(REPO, 'site', f), 'utf8')]), syncName = rel(SYNC)) {
  const known = new Set(Object.values(sync).flatMap(r => Object.keys((r && r.screens) || {})));
  const out = [];
  for (const [label, html] of pages) for (const m of String(html).matchAll(/<img\b[^>]*\ssrc="([^"]*assets\/play\/[^"]+)"/gi)) {
    const f = 'site/' + m[1].replace(/^(\.\.\/)+/, '').replace(/^\//, '');
    if (!known.has(f)) out.push(`${label}: кадр плеера ${f} не записан в ${syncName} → screens — с какой версии сценария он снят?`);
  }
  return out;
}
const HOME = ['index.html', 'moscow/index.html'].filter(f => fs.existsSync(path.join(REPO, 'site', f)));

function check(opts = {}) {
  const errors = [], warns = [];
  const ids = opts.quest ? [opts.quest] : L.allIds();
  let sync = {};
  const syncFile = opts.sync ? path.resolve(opts.sync) : SYNC;
  try { sync = JSON.parse(fs.readFileSync(syncFile, 'utf8')); } catch (e) { errors.push(`${rel(syncFile)}: не читается — ${e.message}`); }
  const syncName = opts.sync ? `${path.basename(syncFile)} (копия)` : rel(SYNC);
  const v = versionCheck(ids, sync, scenarioVersion, syncName);
  errors.push(...v.errors); warns.push(...v.warns);
  if (!opts.quest) errors.push(...screensCheck(sync, undefined, syncName));
  // общие блоки главной и каталога (текст, alt, title, JSON-LD — corpusOf) — снятое любого дела тоже не встречается
  const home = opts.html ? [] : HOME.map(f => L.corpusOf(fs.readFileSync(path.join(REPO, 'site', f), 'utf8'), null, f === 'index.html' ? 'главная' : f)).flat();
  for (const id of ids) {
    const corp = L.caseCorpus(id, opts.html);
    if (!corp) continue;
    const pageFile = opts.html ? path.resolve(opts.html) : path.join(REPO, 'site', corp.pg, 'index.html');
    const html = fs.readFileSync(pageFile, 'utf8');
    const qf = path.join(REPO, 'quests', id, 'quest.json');
    if (fs.existsSync(qf)) errors.push(...castCheck(id, html, JSON.parse(fs.readFileSync(qf, 'utf8')).speakers, corp.pg));
    const R = retiredOf(id);
    if (!(R.items || []).length && !R.error) continue;
    const parts = corp.parts.concat(home, opts.html ? [] : L.extraParts(corp.slug, { llms: opts.llms, posts: opts.posts }))
      .concat(ogParts(corp.slug).map(p => Object.assign(p, { n: ' ' + L.norm(p.text) + ' ' })));
    errors.push(...retiredCheck(id, R, parts, corp.pg));
  }
  return { errors, warns };
}

function selftest() {
  const out = [];
  const ver = { zz: { v: '5.6', src: 'quests/zz/quest.json', json: true }, md: { v: 'v3', src: 'quests/md/story/scenario-v3.md', json: false } };
  const vc = (sync) => versionCheck(['zz', 'md'], sync, id => ver[id], 'story-sync.json');
  if (vc({ zz: { version: '5.5' }, md: { version: 'v3' } }).errors.length !== 1) out.push('(а) старая версия витрины не краснеет');
  if (vc({ zz: { version: '5.6' }, md: { version: 'v3' } }).errors.length) out.push('(а) ложное срабатывание на совпавшей версии');
  const nv = vc({ md: { version: 'v3' } });
  if (nv.errors.length !== 1) out.push('(а) дело с quest.json без записи не краснеет');
  if (vc({ zz: { version: '5.6' } }).warns.length !== 1) out.push('(а) дело со сценарием-текстом без записи — нет предупреждения');
  const sc = (screens, v = '5.6') => versionCheck(['zz'], { zz: { version: v, screens } }, id => ver[id], 'story-sync.json', () => true).errors;
  if (sc({ 'site/assets/play/frame-riddle.jpg': '5.5' }).length !== 1) out.push('(а) кадр плеера со старой версии не краснеет');
  if (sc({ 'site/assets/play/frame-riddle.jpg': '5.6', 'site/assets/play/m.jpg': { mockup: 'макет темы для дела без плеера' } }).length) out.push('(а) ложное срабатывание на кадре нужной версии или макете');
  if (screensCheck({ zz: { screens: { 'site/assets/play/a.jpg': '1' } } }, [['fx', '<img src="assets/play/a.jpg"><img src="assets/play/b.jpg">']]).length !== 1) out.push('(а) кадр плеера без записи в screens не замечен');
  const sp = { a: { name: 'Зиля' }, b: { name: 'Тюфель' }, c: { name: 'Лёва' }, d: { name: 'Гоша' }, e: { name: 'Карточка свидетеля' } };
  const page = (dl, by) => `<section id="cast" class="c-sec"><blockquote class="c-quote">«…»<footer>${by}</footer></blockquote><dl class="c-people">${dl}</dl></section>`;
  const ok = page('<div><dt>Зиля</dt><dd>голубь. Ведёт дело.</dd></div><div><dt>Кот Тюфель</dt><dd>рыжий.</dd></div><div><dt>Свидетели</dt><dd>заводской оформитель Лёва и&nbsp;испытатель Гоша. Каждый расскажет своё.</dd></div>', 'Зиля, сыщик Бюро');
  if (castCheck('fx', ok, sp, 'fx').length) out.push('(б) ложное срабатывание: ' + castCheck('fx', ok, sp, 'fx')[0]);
  if (castCheck('fx', page('<div><dt>Кот Пиксель</dt><dd>рыжий.</dd></div>', 'Зиля'), sp, 'fx').length !== 1) out.push('(б) снятый персонаж в <dt> не краснеет');
  if (castCheck('fx', page('<div><dt>Свидетели</dt><dd>землемер Фёдор и испытатель Гоша.</dd></div>', 'Зиля'), sp, 'fx').length !== 1) out.push('(б) снятый свидетель в групповой строке не краснеет');
  if (castCheck('fx', page('<div><dt>Зиля</dt><dd>.</dd></div>', 'Ворона, сыщик'), sp, 'fx').length !== 1) out.push('(б) подпись цитаты не тем героем не краснеет');
  const R = { items: [{ text: 'телеграмм', why: 'артефакт v3 снят в 5.5' }, { text: '1932', why: 'год v3 снят в 5.5' }, { text: 'Синяя птица дома', why: 'текст телеграммы v3' }] };
  const parts = t => [{ where: 'fx', text: t, n: ' ' + L.norm(t) + ' ' }];
  if (retiredCheck('fx', R, parts('Пришли телеграммы с завода'), 'fx').length !== 1) out.push('(в) снятое слово (другая форма) не краснеет');
  if (retiredCheck('fx', R, parts('«СИНЯЯ ПТИЦА ДОМА ТЧК»'), 'fx').length !== 1) out.push('(в) снятая фраза не краснеет');
  if (retiredCheck('fx', R, parts('В 1932 году'), 'fx').length !== 1) out.push('(в) снятый год не краснеет');
  if (retiredCheck('fx', R, parts('19320 км, телевизор, синяя птица и дом'), 'fx').length) out.push('(в) ложное срабатывание на похожем тексте');
  if (retiredCheck('fx', { items: [{ text: 'кот', why: '' }] }, parts('…'), 'fx').length !== 1) out.push('(в) запись без причины не замечена');
  return out;
}

module.exports = { check, selftest };

if (require.main === module) {
  const args = Object.fromEntries(process.argv.slice(2).map(a => { const m = a.match(/^--([\w-]+)(?:=(.*))?$/); return m ? [m[1], m[2] == null ? true : m[2]] : [a, true]; }));
  if (args.selftest) { const s = selftest(); s.forEach(m => console.log(' ✗ ' + m)); console.log(s.length ? 'story_drift --selftest: ОШИБКА' : 'story_drift --selftest: OK'); process.exit(s.length ? 1 : 0); }
  const r = check({ quest: args.quest, html: args.html, llms: args.llms, posts: args.posts, sync: args.sync });
  r.warns.forEach(m => console.log(' ! ' + m));
  r.errors.forEach(m => console.log(' ✗ ' + m));
  console.log(r.errors.length ? `story_drift: расхождений ${r.errors.length}` : 'story_drift: OK');
  process.exit(r.errors.length ? 1 : 0);
}

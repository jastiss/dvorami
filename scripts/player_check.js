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
 *   - ответы (scripts/answer_check.js): нормализация, числа словом и цифрой, «почти»; каждая загадка принимает эталон и формы;
 *     в браузере опечатка даёт «Почти! Проверьте написание» и не засчитывается;
 *   - верный ответ принимается, неверный — нет, подсказки открываются по одной, улики копятся, прогресс переживает перезагрузку;
 *   - код доступа (docs/codes.md): дело шифруется на лету тестовыми кодами (scripts/codes.py selftest-bundle, в репозиторий
 *     не попадают); экран кода проходит аудит, неверный и отозванный код — понятная ошибка, верный (мастер, выпущенный,
 *     из ссылки #code=) открывает дело, код запоминается и переживает перезагрузку;
 *   - мастер-код один на все дела: введён в другом деле — это открывается без экрана кода (выпущенный код другого дела — нет);
 *   - цели Метрики экрана кода (T-69): code_fail с причиной (wrong, bad_chars, length…) на каждую ошибку, code_ok (typed/link)
 *     после верного кода; сам код в параметры целей не попадает;
 *   - на 390 главная кнопка шага видна без прокрутки и не закрыта навигацией (T-60);
 *   - мини-шаги (quests/<id>/field/player-ui-v2.md): каждый новый экран начинается сверху (прокрутка 0, начало экрана на виду),
 *     поле ответа — в верхней части экрана и не сдвигается, когда открывается клавиатура (высота окна уменьшается),
 *     неверный ответ не перерисовывает поле; «назад» и оглавление открывают любой пройденный мини-шаг только для просмотра,
 *     «К текущему шагу» возвращает; в оглавлении нет ни одного непройденного экрана и названий точек впереди;
 *     у каждого свёрнутого блока — треугольная стрелка; режим «Читаю» убирает плеер реплик, «Слушаю и читаю» — показывает;
 *     при prefers-reduced-motion ни одна анимация не идёт; место в точке переживает перезагрузку;
 *   - H-68: неверный ответ — цель answer_wrong (point, step, near 0/1), текста ответа в параметрах нет;
 *   - один индикатор прогресса (владелец 27.11): полоса по точкам в шапке, текущий отрезок заполняется по ходу точки;
 *     второй полосы (мини-шагов) и отдельной кнопки оглавления под меню нет — оглавление открывается по названию экрана;
 *   - финал: карточка «Дело № N · РАСКРЫТО» без слов-ответов, пять звёзд (оценка сохраняется на телефоне), отзыв в Telegram (done_<дело>);
 *   - формат 5 (docs/quest-format.md): реплики, варианты (choice), выбор карточек доски (pick), «вычеркни лишнее» (strike),
 *     ответ из частей (all) и «почти» (replies), вопросы на ходу (walk_ask), письмо-улика в шторке, задание для детей,
 *     «стрелки» показываются один раз; ветки А/Б — прогон с ?flags= (--flags=st4:B);
 *   - T-105: варианты выбора перемешаны (постоянно для игрока, верный не всегда первый, без внутренних id на кнопках);
 *     сохранение старой версии дела — экран «Вышла новая версия дела» (продолжить / заново); последняя подсказка поля с вводом
 *     засчитывается как ответ (поля «любой вариант» — пропуск с пометкой); доля полей «с места» по пометке src (H-72, предупреждение).
 *   - данные: детское задание не на первой точке; «на картинке / на рисунке» в детском задании или вопросе — только при картинке у точки;
 *     предупреждение, если у верного варианта выбора первое слово не такое, как у всех остальных;
 *   - доска формата 5: на 390 в конце дела первая улика — на первом экране доски; опровергнутые версии — строкой, раскрываются;
 *     переключатель «Все · Версии · Улики» показывает своё; развилка (fork): кнопки, выбор меняет ветку дела и пишется в сохранение.
 *   - T-94 (владелец 27.11): нажатия «Дальше» и экраны по точкам — в выводе (прогон 390/тёмная); касание правой трети экрана и свайп
 *     влево листают вперёд, касание слева и по кнопкам — нет; прокрутка экрана на 390×844 (прохождение) и 360×740 (все экраны
 *     в просмотре) — предупреждением со списком экранов, тест не краснеет (длинный текст не всегда помещается);
 *   - H-86: «Новое с прошлого раза» на доске — метка на карточках, легших после прошлого открытия «Улик», при повторном — без меток;
 *   - H-82: развилка (fork) объявлена на обложке дела строкой «Развилка на точке N» с вариантами;
 *   - T-93: у дела без записей нет плашки «Аудио скоро» и выбора «Слушаю/Читаю», в ?field=1 — есть; цель flip (how: button,
 *     tap, swipe) — одна на точку и способ.
 *   - H-62 (субтитры): у звуковой улики без реплики есть transcript; в ?field=1 на каждом экране у плеера реплики все его реплики
 *     с текстом на экране, голос отмечает звучащую и раскрывает её свёрнутый хвост, когда до него дошёл; T-134: плеер звуковой
 *     улики (data-clue) засчитывается только её текстом сразу под ним, реплика с картинкой и текстом — текстом под картинкой;
 *   - H-111: временные объекты ("temporary", scripts/temporary_check.js) — за 30 дней до срока предупреждение, после — ошибка
 *     ([--today=ГГГГ-ММ-ДД] — проверить на другую дату).
 *   - 27.11, офлайн: первый заход с service worker (sw.js) — страница, player.js и дело попадают в кеш (warmCache), без связи
 *     перезагрузка открывает то же место;
 *   - 27.11, чтение с экрана: неверный ответ (поле, вариант, карточки) объявлен в постоянной области #sr-say, поле помечено
 *     aria-invalid и ссылается на сообщение, после перерисовки фокус остаётся на нажатом варианте или «Проверить»; живая
 *     область «где» в шапке не перезаписывается на «Дальше» внутри точки.
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
// H-117: временные объекты — как в плеере: после срока элемент с "temporary" снимается, "flag" записи (в деле или
// quests/<id>/temporary.json) переключает ветку; --today=ГГГГ-ММ-ДД передаётся плееру ссылкой ?today=
const TMP = require('./temporary_check.js');
const TODAY = args.today || TMP.todayMsk();
const gone = t => !!(t && typeof t === 'object' && /^\d{4}-\d{2}-\d{2}$/.test(String(t.until || '')) && String(t.until) < TODAY);
const TMP_RECS = args.data ? TMP.forQuest(null, QUEST) : TMP.forQuest(QID);
const TMP_FLAGS = {};
for (const r of TMP_RECS) if (gone(r) && r.flag && !r.flagBad) { const [k, v] = String(r.flag).split(/[:=]/).map(x => x.trim()); TMP_FLAGS[k] = v; }
Object.assign(FLAGS, TMP_FLAGS);
if (args.flags) args.flags.split(',').forEach(p => { const [k, v] = p.split(/[:=]/); if (k && v) FLAGS[k] = v; });
const flag = k => String(FLAGS[k] || 'A');
const passes = c => {
  if (!c) return true;
  if (typeof c === 'string') { const m = c.match(/^\s*([\w-]+)\s*(!?=)\s*(.+?)\s*$/); if (!m) return true; const hit = m[3].split('|').map(x => x.trim()).includes(flag(m[1])); return m[2] === '=' ? hit : !hit; }
  return Object.entries(c).every(([k, v]) => [].concat(v).map(String).includes(flag(k)));
};
const prune = x => Array.isArray(x) ? x.filter(e => !(e && typeof e === 'object' && !Array.isArray(e) && (gone(e.temporary) || !passes(e.if)))).map(prune)
  : (x && typeof x === 'object') ? Object.fromEntries(Object.entries(x).map(([k, v]) => [k, prune(v)])) : x;
const Q = prune(RAW);
// T-93: плеер реплики «Аудио скоро» и выбор «Слушаю и читаю / Читаю» — только у дела с записями или в ?field=1
const VOICE = /"(walk_)?audio"\s*:\s*"(?!https?:|\/\/)[^"]+"/.test(JSON.stringify(RAW));
const QS = [args.flags ? 'flags=' + encodeURIComponent(args.flags) : '', args.today ? 'today=' + args.today : ''].filter(Boolean).reduce((a, x) => a + (a ? '&' : '?') + x, '');
// Без --data — как на стенде: дело зашифровано, коды — тестовые, только на время прогона
const SEALED = !args.data;
const BUNDLE = SEALED ? JSON.parse(execFileSync('python3', [path.join(REPO, 'scripts', 'codes.py'), 'selftest-bundle', '--quest', QID,
  '--out', fs.mkdtempSync(path.join(os.tmpdir(), 'dvorami-codes-'))], { encoding: 'utf8' }).trim().split('\n').pop()) : null;
const PORT = 9000 + Math.floor(Math.random() * 900);
const BASE = `http://127.0.0.1:${PORT}`;
const TYPES = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.json': 'application/json', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.png': 'image/png', '.jpg': 'image/jpeg' };

const errors = [];
const err = (where, msg) => errors.push(`${where}: ${msg}`);
// предупреждения — не красный тест: печатаются в конце, выкладку не блокируют
const warns = [];
const warn = (where, msg) => warns.push(`${where}: ${msg}`);
const notes = [];

// Проверка ответов без браузера (scripts/answer_check.js): нормализация, «почти», каждая загадка принимает эталон и формы
const ANS = require('../site/play/answer.js');
(function answers() {
  const r = require('./answer_check.js').run({ data: QUEST });
  r.errors.forEach(e => err('ответы', e));
})();
// Опечатка в ответе, которую плеер должен назвать «почти» (проверяется в браузере один раз на прогон)
const nearTypo = st => {
  const a = (st.answers || []).find(x => typeof x === 'string' && x.charAt(0) !== '~' && !/\d/.test(x) && x.length >= 6);
  if (!a) return null;
  const k = Math.floor(a.length / 2), t = a.slice(0, k) + (a[k] === 'ы' ? 'и' : 'ы') + a.slice(k + 1);
  const r = ANS.checkText(st, t);
  return !r.ok && r.near ? t : null;
};
let nearSeen = false;

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
    // H-62: звук без реплики (звуковая улика) — текст под плеером из transcript (или caption); без него на шумной улице смысла нет
    if (x.audio && !x.text && !x.transcript && !x.caption && !x.n && !x.steps && !x.type && !x.scene && !x.ask)
      err('данные', `${where}: звук без текста на экране — добавьте "transcript" (что слышно), H-62`);
    for (const [k, v] of Object.entries(x)) if (k !== 'if' && typeof v === 'object') walk(v, x.id && x.n ? `точка ${x.n}` : where);
  };
  walk(q, 'дело');
  for (const [id, where] of refs) if (!defs.has(id)) err('данные', `${where}: карточка «${id}» нигде не определена`);
})(RAW);

// H-111: временные объекты маршрута ("temporary" в деле, quests/<id>/temporary.json) — за 30 дней предупреждение, после срока ошибка
(function temporary() {
  const r = TMP.judge(TMP_RECS, args.today, false, { player: true });
  r.errors.forEach(e => err('временные объекты', e));
  r.warns.forEach(w => warn('временные объекты', w));
})();

// Поля дела (шаги и вопросы на ходу с заданием) — с местом для сообщений; обе ветки А/Б (RAW) или только текущая (Q)
const fieldsOf = q => {
  const out = [];
  (q.points || []).forEach(p => {
    (p.steps || []).forEach((st, i) => { if (st && st.type && !['info', 'say', 'board'].includes(st.type)) out.push([st, `точка ${p.n} шаг ${i + 1}${st.if ? ` (${typeof st.if === 'string' ? st.if : JSON.stringify(st.if)})` : ''}`]); });
    [].concat(p.walk_ask || []).forEach((w, i) => { if (w) out.push([w, `точка ${p.n} на ходу ${i + 1}`]); });
  });
  return out;
};
const optIds = st => (st.options || []).map(o => String(o.id));
const anyChoice = st => st.type === 'choice' && optIds(st).length > 0 && optIds(st).every(id => [].concat(st.answer || st.answers || []).map(String).includes(id));

// T-105 (в): третья подсказка поля с вводом — это ответ, и он засчитывается: игрок, перепечатавший её в поле, проходит дальше.
// Исключения — «любой вариант» (any_answer: true у ask, choice с засчитанным любым вариантом) — пропускаются явно, с пометкой.
// В сообщениях — только место поля, без текста подсказки (журнал Actions публичный, team/std/spoilers.md).
(function lastHints(q) {
  for (const [st, where] of fieldsOf(q)) {
    const hints = st.hints || [];
    if (hints.length < 3) continue;
    if (st.any_answer || anyChoice(st)) { notes.push(`${where}: третья подсказка не проверяется — засчитывается любой вариант`); continue; }
    if (st.type === 'choice' || st.type === 'pick' || st.type === 'strike' || st.type === 'free') continue;   // без поля ввода
    if (!(st.answers || []).length && !(st.all || []).length) continue;
    const r = ANS.checkText(st, String(hints[hints.length - 1]).replace(/<[^>]+>/g, ''));
    if (!r.ok) err('данные', `${where}: последняя подсказка (ответ) не засчитывается как ответ — впишите в неё эталон из answers или добавьте форму из неё в answers`);
  }
})(RAW);

// H-73: длина вариантов — верный не должен выдаваться длиной (предупреждение: правит автор, не движок)
(function optionLength(q) {
  for (const [st, where] of fieldsOf(q)) {
    if (st.type !== 'choice' || anyChoice(st)) continue;
    const right = [].concat(st.answer || []).map(String);
    const len = o => String(o.label || o.id).replace(/<[^>]+>/g, '').length;
    const r = (st.options || []).filter(o => right.includes(String(o.id))), w = (st.options || []).filter(o => !right.includes(String(o.id)));
    if (r.length === 1 && w.length && len(r[0]) > 1.4 * Math.max(...w.map(len)) && len(r[0]) - Math.max(...w.map(len)) >= 12) warn('данные', `${where}: верный вариант заметно длиннее остальных (${len(r[0])} знаков против ${Math.max(...w.map(len))}) — угадывается по длине (H-73)`);
  }
})(RAW);

// Верный вариант не должен выделяться первым словом: у всех неверных одно первое слово, у верного — другое
// («Главная аллея» против трёх «Проезд …») — угадывается без места (предупреждение: правит автор)
(function optionFirstWord(q) {
  const first = o => String(o.label || o.id).replace(/<[^>]+>/g, '').replace(/[«»"„“”]/g, '').trim().split(/[\s,.:;—-]+/)[0].toLowerCase().replace(/ё/g, 'е');
  for (const [st, where] of fieldsOf(q)) {
    if (st.type !== 'choice' || anyChoice(st)) continue;
    const right = [].concat(st.answer || []).map(String);
    const r = (st.options || []).filter(o => right.includes(String(o.id))), w = (st.options || []).filter(o => !right.includes(String(o.id)));
    if (r.length !== 1 || w.length < 2) continue;
    const ws = new Set(w.map(first));
    if (ws.size === 1 && !ws.has(first(r[0]))) warn('данные', `${where}: у верного варианта первое слово «${first(r[0])}», у всех остальных — «${[...ws][0]}»: угадывается по форме`);
  }
})(RAW);

// Детские задания (team/std/riddles.md, «Детские задания»): не на первой точке дела; «на картинке / на рисунке» — только если у точки есть картинка
(function kidsRules(q) {
  const p0 = (q.points || [])[0];
  if (p0 && p0.kids && [].concat(p0.kids).length) err('данные', `точка ${p0.n}: детское задание на первой точке — дело ещё не началось (первое — со следующей точки)`);
  const PIC = /на\s+(картинке|рисунке)/i;
  const hasPic = x => Array.isArray(x) ? x.some(hasPic) : (x && typeof x === 'object') ? Object.entries(x).some(([k, v]) => ((k === 'img' && typeof v === 'string' && v) || (k === 'layers' && Array.isArray(v) && v.length)) || (k !== 'if' && typeof v === 'object' && hasPic(v))) : false;
  const textOf = x => typeof x === 'string' ? x : Array.isArray(x) ? x.map(textOf).join(' ') : (x && typeof x === 'object') ? [x.text, textOf(x.lines)].filter(Boolean).join(' ') : '';
  for (const p of q.points || []) {
    const pic = hasPic(p);
    if (pic) continue;
    for (const k of [].concat(p.kids || [])) if (PIC.test(textOf(k))) err('данные', `точка ${p.n}: детское задание ссылается на картинку, а картинки у точки нет (img null)`);
    for (const [i, st] of (p.steps || []).entries()) if (st && st.type && !['info', 'say', 'board'].includes(st.type) && PIC.test(textOf(st))) err('данные', `точка ${p.n} шаг ${i + 1}: вопрос ссылается на картинку, а картинки у точки нет (img null)`);
    for (const [i, w] of [].concat(p.walk_ask || []).entries()) if (w && PIC.test(textOf(w))) err('данные', `точка ${p.n} на ходу ${i + 1}: вопрос ссылается на картинку, а картинки у точки нет (img null)`);
  }
})(Q);

// H-72: доля полей «с места». Пометка у поля: "src": "place" — ответ можно получить только на месте; "text" — из текста дела,
// доски или письма; "both" — нужны оба. Считается по ветке, которую проходит тест (флаги по умолчанию / --flags).
// Ниже ⅔ — предупреждение (красным станет, когда разметка пройдёт по всем делам).
const SRC = (function srcShare(q) {
  const all = fieldsOf(q).filter(([st]) => !st.optional && st.type !== 'free' && !anyChoice(st));
  const marked = all.filter(([st]) => st.src);
  for (const [st, where] of marked) if (!['place', 'text', 'both'].includes(st.src)) err('данные', `${where}: "src": "${st.src}" — допустимо place, text, both`);
  if (!marked.length) return `доля полей «с места»: разметки src нет (полей ${all.length})`;
  const place = marked.filter(([st]) => st.src === 'place').length;
  const share = place / marked.length;
  const line = `доля полей «с места»: ${place} из ${marked.length} размеченных (${Math.round(share * 100)}%)` + (marked.length < all.length ? `, без разметки ${all.length - marked.length}` : '');
  if (share < 2 / 3) warn('данные', `${line} — меньше ⅔ (H-72)`);
  return line;
})(Q);

const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]);
  if (p.endsWith('/')) p += 'index.html';
  let f = path.join(REPO, p);
  // офлайн-прогон (sw.js): service worker берёт дело с сервера мимо page.route — сервер отдаёт то же, что route у остальных прогонов
  const own = p === `/${PAGE}quest.locked.json` || p === `/${PAGE}quest.json`;
  if (own) f = p.endsWith('locked.json') ? (SEALED ? BUNDLE.locked : '') : (SEALED ? '' : QUEST);
  if (!f || (!own && !f.startsWith(REPO)) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end(); }
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
  // H-83: служебная плашка «🔶 запасной текст» — только в режиме полевого теста
  const fieldOn = /[?&]field=1(&|$)/.test(location.search) || !!(window.__dvorami && window.__dvorami.state() && window.__dvorami.state().field);
  if (!fieldOn && document.querySelector('.pl-fb')) out.push('плашка полевого теста «🔶 запасной текст» видна игроку без ?field=1');
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
      if (/\p{Extended_Pictographic}/u.test([...el.childNodes].filter(n => n.nodeType === 3).map(n => n.textContent).join('').replace(/[✓]/g, '')) && !el.closest('.pl-fb')) out.push(`эмодзи в интерфейсе: ${name(el)}`);
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
  const ALL_SHUF = {}, ALL_FIRST = [];
  let shufReload = false;
  const firstAnswer = st => st.answers && st.answers.length ? String(st.answers[0]).replace(/^~/, '')
    : (st.all || []).map(g => String((Array.isArray(g) ? g : g.answers)[0]).replace(/^~/, '')).join(' ');
  let screens = 0;
  // T-94: нажатия «Дальше» по точкам и экраны с прокруткой на 390×844 — считаются в прогоне 390/тёмная
  const tally = {}, tallyFrames = {}, scrolled = new Map(), seenFrames = new Set();

  for (const vp of [{ width: 390, height: 844 }, { width: 1024, height: 768 }, { width: 1440, height: 900 }]) {
    for (const theme of ['dark', 'sun']) {
      const tag = `${vp.width}/${theme}`;
      const SHUF = {}, SHUF_FIRST = [];
      const TALLY = vp.width === 390 && theme === 'dark';
      let tallyAt = 'вступление';
      const press = () => { if (TALLY) tally[tallyAt] = (tally[tallyAt] || 0) + 1; };
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
      // 27.11: неверный ответ объявлен для чтения с экрана — текст сообщения появился в постоянной области #sr-say
      const srSaid = async where => {
        const ok = await page.waitForFunction(() => { const s = document.getElementById('sr-say'), w = [...document.querySelectorAll('#app .pl-wrong')].pop(); return !!(s && w && s.textContent && s.textContent === w.textContent); }, null, { timeout: 2000 }).then(() => true, () => false);
        if (!ok) err(`${tag} · ${where}`, 'сообщение о неверном ответе не объявлено для чтения с экрана (#sr-say)');
      };
      const check = async where => {
        screens++; (await page.evaluate(audit)).forEach(m => err(`${tag} · ${where}`, m));
      };
      // новый экран (после «Дальше», ответа, перехода): общий аудит + «новое сверху, главная кнопка и поле на виду»
      const fresh = async where => {
        await check(where);
        if (vp.width < 1024) { await page.evaluate(settle); (await page.evaluate(stickAudit)).forEach(m => err(`${tag} · ${where}`, m)); }
        if (TALLY) {   // экран без прокрутки по вертикали (владелец 27.11): считаем каждый экран прохождения один раз
          const o = await page.evaluate(() => { const f = document.getElementById('frame'); if (!f || !window.__dvorami) return null; const ps = window.__dvorami.pos();
            return { key: ps.sec + ':' + ps.id, kind: ps.kind, over: Math.round(document.documentElement.scrollHeight - innerHeight), pic: !!f.querySelector('.pl-fig, .pl-letter') }; }).catch(() => null);
          if (o && !seenFrames.has(o.key)) { seenFrames.add(o.key); if (o.over > 1) scrolled.set(o.key, `${where} (${o.kind}${o.pic ? ', картинка' : ''}): +${o.over} px`); }
        }
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
          await b.click(); press();
        }
        err(tag, `${where}: «Дальше» не кончается`); return false;
      };
      // H-73: порядок вариантов. Перемешиваемые — постоянный порядок для игрока (переживает перезагрузку), верный не всегда первый
      // (считается по всему прогону); нумерованные (А–Г, 1–3), «любой вариант» и "shuffle": false — порядок как в данных.
      // Метки на кнопках — буквы или свой знак варианта, а не внутренний id (press, water).
      const orderCheck = async (sel, st, sat, rights) => {
        const seen = () => page.$$eval(`${sel} [data-act="choose"]`, bs => bs.map(b => ({ id: b.dataset.id, mark: (b.querySelector('.pl-opt-label b') || {}).textContent || '' })));
        const got = await seen(), ids = optIds(st);
        if (got.map(x => x.id).sort().join('|') !== ids.slice().sort().join('|')) err(tag, `${sat}: на экране не те варианты`);
        for (const x of got) if (x.mark.length > 2) err(tag, `${sat}: на кнопке варианта виден внутренний id «${x.mark}»`);
        const fixed = st.shuffle === false || ids.length < 2 || ids.every(id => /^[0-9A-Za-zА-Яа-яЁё]$/.test(id)) || anyChoice(st);
        if (fixed) { if (got.map(x => x.id).join('|') !== ids.join('|')) err(tag, `${sat}: варианты, которые не перемешиваются, стоят не по порядку данных`); return; }
        const key = sat + sel;
        (SHUF[key] = SHUF[key] || new Set()).add(got.map(x => x.id).join('|'));
        if (rights.length === 1) SHUF_FIRST.push(got[0].id === rights[0]);
        if (!shufReload && sel === '#active') {
          shufReload = true;
          await page.reload({ waitUntil: 'load' }); await page.waitForSelector(`${sel} [data-act="choose"]`);
          const again = await seen();
          if (again.map(x => x.id).join('|') !== got.map(x => x.id).join('|')) err(tag, `${sat}: порядок вариантов изменился после перезагрузки`);
        }
      };
      // Ответить на задание формата 5 в контексте sel («#active» — шаг, «#walk-0» — вопрос на ходу); wrong — сначала неверно
      const solve = async (sel, st, sat, wrong) => {
        if (st.type === 'choice') {
          const f = st.answer_flag && FLAGS[st.answer_flag];
          const rights = f && (st.options || []).some(o => o.id === f) ? [f] : [].concat(st.answer || st.answers).map(String);
          const right = rights[0];
          // вариант «по натуре» до полевого теста (засчитывается любой) — неверного нет, проверять нечего
          const bad = (st.options || []).find(o => !rights.includes(String(o.id)));
          await orderCheck(sel, st, sat, rights);
          if (wrong && bad) {
            await click(`${sel} [data-act="choose"][data-id="${bad.id}"]`);
            if (!(await page.$(`${sel} .pl-wrong`))) err(tag, `${sat}: нет сообщения о неверном варианте`);
            // экран перерисован — фокус остаётся на нажатом варианте, а не уходит в начало страницы (27.11)
            if (!(await page.evaluate(([s2, id]) => { const a = document.activeElement; return !!(a && a.closest(s2) && a.dataset.act === 'choose' && a.dataset.id === id); }, [sel, String(bad.id)]))) err(tag, `${sat}: после неверного варианта фокус потерян`);
            await srSaid(sat + ' · неверный вариант');
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
            if (!(await page.evaluate(s2 => { const a = document.activeElement; return !!(a && a.closest(s2) && a.dataset.act === 'check'); }, sel))) err(tag, `${sat}: после неверного выбора фокус потерян`);
            await srSaid(sat + ' · неверный выбор');
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
      // H-117: плеер на дату TODAY снял элементы с прошедшим сроком и переключил ветку записи "flag" (раз на прогон)
      if (vp.width === 390 && theme === 'dark') {
        const pl = await page.evaluate(() => ({ today: window.__dvorami.today(), flags: window.__dvorami.flags(), q: JSON.stringify(window.__dvorami.quest()) }));
        if (pl.today !== TODAY) err(tag, `временные объекты: плеер считает сегодня ${pl.today}, проверка — ${TODAY} (?today=)`);
        const urlF = {}; if (args.flags) args.flags.split(',').forEach(p => { const [k, v] = p.split(/[:=]/); if (k && v) urlF[k] = v; });
        for (const [k, v] of Object.entries(TMP_FLAGS)) if (!urlF[k] && pl.flags[k] !== v) err(tag, `временные объекты: срок вышел, а флаг ${k} в плеере «${pl.flags[k]}», ожидали «${v}»`);
        const hidden = [];
        (function walk(x) {
          if (Array.isArray(x)) return x.forEach(e => { if (e && typeof e === 'object' && !Array.isArray(e) && (gone(e.temporary) || Object.keys(TMP_FLAGS).some(k => (typeof e.if === 'string' ? new RegExp(`^\\s*${k}\\s*!?=`).test(e.if) : e.if && k in e.if) && !passes(e.if))) && typeof (e.text || e.transcript) === 'string') hidden.push(e.text || e.transcript); walk(e); });
          if (x && typeof x === 'object') Object.values(x).forEach(walk);
        })(RAW.points || []);
        for (const t of hidden) if (pl.q.includes(JSON.stringify(t).slice(1, 60))) err(tag, `временные объекты: срок вышел, а плеер показывает «${t.slice(0, 50)}…»`);
        if (hidden.length) notes.push(`временные объекты на ${TODAY}: в плеере скрыто по сроку ${hidden.length} элем. (${Object.entries(TMP_FLAGS).map(([k, v]) => k + '=' + v).join(', ') || 'по сроку'})`);
      }
      if (viaLink && /code=/.test(page.url())) err(tag, 'код остался в адресе страницы после входа по ссылке');
      if (SEALED) {
        const ok = await lastGoal('code_ok');
        if (!ok || ok[1].source !== (viaLink ? 'link' : 'typed') || ok[1].quest !== QID) err(tag, `после верного кода нет цели code_ok (source=${viaLink ? 'link' : 'typed'}): ${JSON.stringify(ok)}`);
        const codes = [BUNDLE.code, BUNDLE.master, BUNDLE.revoked].map(c => c.replace(/-/g, '').toUpperCase());
        if ((await goals()).some(([, p]) => codes.some(c => JSON.stringify(p).toUpperCase().replace(/-/g, '').includes(c)))) err(tag, 'код доступа ушёл в параметры цели Метрики');
      }
      if (SEALED && !(await page.evaluate(k => { try { return localStorage.getItem(k); } catch (e) { return null; } }, 'dvorami:code:' + QID))) err(tag, 'код не запомнился на устройстве');
      // мастер-код один на все дела (владелец 27.11): введён в другом деле — это дело открывается без экрана кода;
      // выпущенный код другого дела не пробуется. Один раз на прогон (390, тёмная тема)
      if (SEALED && vp.width === 390 && theme === 'dark') {
        const swap = (other) => page.evaluate(([k, o]) => { localStorage.removeItem(k); localStorage.removeItem('dvorami:code:__other'); if (o) localStorage.setItem('dvorami:code:__other', o); }, ['dvorami:code:' + QID, other]);
        await swap(BUNDLE.code); await page.reload({ waitUntil: 'load' });
        if (!(await page.waitForSelector('#code', { timeout: 15000 }).then(() => true, () => false))) err(tag, 'выпущенный код другого дела открыл это дело — пробовать можно только мастер-код');
        await swap(BUNDLE.master.toLowerCase()); await page.reload({ waitUntil: 'load' });
        if (!(await page.waitForSelector('[data-act="start"]', { timeout: 15000 }).then(() => true, () => false))) err(tag, 'мастер-код, введённый в другом деле, не открыл это дело');
        else if (!(await page.evaluate(k => localStorage.getItem(k), 'dvorami:code:' + QID))) err(tag, 'мастер-код другого дела не запомнился для этого');
        await page.evaluate(() => localStorage.removeItem('dvorami:code:__other'));
      }
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
        const lineOf = v => (rp.walk || []).filter(e => e && typeof e === 'object' && e.if === `${k}=${v}` && e.text && !e.who).map(e => e.text);   // абзацы дороги (экран дороги); реплики героев — на следующих экранах
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
        // T-99: ветка зафиксирована событием показа дороги (showWalk), с меткой «по часам»
        const st0 = await state();
        if (!(st0.clk && st0.clk[pi] && st0.clk[pi][k] && st0.clk[pi][k].by === 'time' && st0.clk[pi][k].v === expectNow)) err(tag, `${at}: ветка по часам не зафиксирована при показе дороги`);
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
      // H-82: развилка объявлена на обложке — номер точки и подписи вариантов из данных развилки
      for (const fp of Q.points.filter(x => x.fork && x.fork.flag && (x.fork.options || []).length > 1)) {
        const cov = await page.$eval('#app', e => e.textContent).catch(() => '');
        const lbl = fp.fork.options.map(o => String(o.label).replace(/<[^>]+>/g, ''));
        if (!cov.includes(`Развилка на точке ${fp.n}`) || lbl.some(l => !cov.includes(l))) err(tag, `обложка: развилка точки ${fp.n} не объявлена (H-82)`);
      }
      // H-74: сохранение старой версии дела (5.2 на 5.4) — экран «Вышла новая версия дела»: «Продолжить» оставляет место,
      // «Начать заново» — обложку; выбор не повторяется после перезагрузки. На 390, в тёмной теме — «Продолжить», в светлой — «Начать заново».
      if (vp.width === 390 && RAW.version != null && Q.points.length > 1) {
        const qid = await page.evaluate(() => document.body.dataset.quest);
        const old = String(RAW.version) === '5.2' ? '5.1' : '5.2';
        const put = v => page.evaluate(([k, s]) => { if (s) localStorage.setItem(k, s); else localStorage.removeItem(k); }, ['dvorami:play:' + qid, v]);
        await put(JSON.stringify({ v: 1, quest: qid, version: old, phase: 'walk', p: 1, k: 0, f: 0, t_start: Date.now() - 3600e3, res: [], board: [], events: [] }));
        await page.reload({ waitUntil: 'load' });
        const shown = await page.waitForSelector('[data-act="verkeep"]', { timeout: 15000 }).then(() => true, () => false);
        if (!shown) err(tag, `сохранение версии ${old}: нет экрана «Вышла новая версия дела»`);
        else {
          if (!(await page.$('[data-act="vernew"]'))) err(tag, 'новая версия: нет кнопки «Начать новую версию»');
          // H-74: главная кнопка — новая версия; доиграть старую — второстепенная
          if (await page.$eval('[data-act="vernew"]', b => b.classList.contains('pl-btn--ghost') || !/новую версию/i.test(b.textContent)).catch(() => true)) err(tag, 'новая версия: главная кнопка должна быть «Начать новую версию»');
          if (!(await page.$eval('#tabs', n => n.hidden).catch(() => true))) err(tag, 'новая версия: навигация видна до выбора');
          await fresh('новая версия дела');
          const keep = theme === 'dark';
          await click(keep ? '[data-act="verkeep"]' : '[data-act="vernew"]');
          const sv = await state();
          if (sv.ver_from != null || String(sv.version) !== String(RAW.version)) err(tag, `новая версия: после выбора в сохранении версия ${sv.version}`);
          if (keep && !(sv.p === 1 && sv.phase === 'walk')) err(tag, `новая версия: «Продолжить» не оставил место (${sv.phase}, точка ${sv.p + 1})`);
          if (!keep && sv.phase !== 'idle') err(tag, `новая версия: «Начать заново» не открыл обложку (${sv.phase})`);
          if (!(sv.events || []).some(e => e.kind === 'version')) err(tag, 'новая версия: выбор не записан в события (отчёт полевого теста)');
          await page.reload({ waitUntil: 'load' }); await page.waitForSelector(keep ? '#frame' : '[data-act="start"]');
          if (await page.$('[data-act="verkeep"]')) err(tag, 'новая версия: экран выбора вернулся после перезагрузки');
        }
        await put(null);
        await page.reload({ waitUntil: 'load' }); await page.waitForSelector('[data-act="start"]');
      }
      // Строка «о свете» (5.4): реплика с "sun": N на обложке — только если до захода меньше N минут; {время} подставлено
      const sunLine = [].concat(...[].concat(RAW.intro || []).map(x => [].concat(x))).find(l => l && typeof l === 'object' && typeof l.sun === 'number');
      if (sunLine) {
        const p0 = (RAW.points || [])[0] || {};
        const sn = await page.evaluate(([la, lo]) => ({ set: window.__dvorami.sunsetMsk(la, lo), now: window.__dvorami.mskMinutes(), text: document.getElementById('app').textContent }), [+p0.lat, +p0.lon]);
        if (!(sn.set > 14 * 60 + 30 && sn.set < 22 * 60 + 30)) err(tag, `обложка: заход солнца в Москве посчитан неправдоподобно (${sn.set} мин)`);
        const want = sn.set - sn.now < sunLine.sun, head = sunLine.text.split('{')[0].trim();
        if (want !== sn.text.includes(head)) err(tag, `обложка: строка о свете ${want ? 'не показана' : 'показана'} (до захода ${sn.set - sn.now} мин)`);
        if (sn.text.includes('{время}')) err(tag, 'обложка: в строке о свете не подставлено время');
      }
      // режим «читаю / слушаю и читаю»: по умолчанию плеер реплик есть; в одном прогоне переключаем на «Читаю» — плеера нет нигде
      const readMode = VOICE && vp.width === 1024 && theme === 'sun';
      if (VOICE && (await page.$$('#app [data-act="mode"]')).length !== 2) err(tag, 'обложка: нет выбора «Слушаю и читаю / Читаю»');
      if (!VOICE && (await page.$$('#app [data-act="mode"]')).length) err(tag, 'обложка: выбор «Слушаю и читаю / Читаю» у дела без записей (T-93)');
      if (readMode) {
        await click('#app [data-act="mode"][data-mode="read"]');
        if ((await pos()).mode !== 'read') err(tag, 'режим «Читаю» не включился');
        await check('обложка · режим «Читаю»');
      }
      await click('[data-act="start"]');
      if (VOICE && !readMode && Q.format >= 5 && !(await page.$('#frame .pl-voice.is-soon, #frame .pl-voice[data-srcs]'))) err(tag, 'вступление: в режиме «Слушаю и читаю» нет плеера реплики');
      if (!VOICE && await page.$('#frame .pl-voice.is-soon')) err(tag, 'вступление: плашка «Аудио скоро» у дела без записей (T-93)');
      // владелец 27.11: один индикатор прогресса (полоса по точкам в шапке), оглавление — по названию точки, без отдельной иконки
      if (await page.$('.pl-minis, .pl-toc-btn')) err(tag, 'вступление: вторая полоса прогресса или отдельная кнопка оглавления под меню');
      if (!(await page.$('#app .pl-crumb .pl-crumb-btn[data-act="toc"]'))) err(tag, 'вступление: нет кнопки оглавления (название экрана)');
      await flip('вступление', '[data-act="go"]');
      await fresh('вступление · конец');
      await click('[data-act="go"]');
      let reviewed = false;
      for (const [pi, p] of Q.points.entries()) {
        const at = `точка ${p.n}`;
        tallyAt = p.n;
        if ((await state()).phase !== 'walk') { err(tag, `${at}: нет экрана дороги`); break; }
        {
          const pg = await page.evaluate(() => { const b = document.querySelectorAll('.pl-progress, .pl-minis'), c = document.querySelector('#progress i.cur'); return { bars: b.length, cur: c ? getComputedStyle(c).getPropertyValue('--part').trim() : null, n: document.querySelectorAll('#progress i').length }; });
          if (pg.bars !== 1 || pg.n !== Q.points.length || !pg.cur) err(tag, `${at}: ждали одну полосу прогресса из ${Q.points.length} отрезков с текущим (--part), получили ${JSON.stringify(pg)}`);
        }
        await fresh(at + ' · дорога');
        if (pi === 1) {
          await click('[data-view="map"]'); await check(at + ' · карта');
          await click('[data-view="board"]'); await check(at + ' · улики');
          await click('[data-view="point"]');
          await click('[data-act="menu"]'); await check(at + ' · меню'); await click('[data-act="close"]');
          // место внутри точки (мини-шаг) переживает перезагрузку
          if (await page.$(FWD)) { await click(FWD); press(); }
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
          await click(FWD); press();
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
          if (plain) { await click('#app .pl-bar [data-act="next"]'); press(); continue; }
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
            const g0 = (await goals()).length;
            await page.fill('#ans', 'заведомо неверно'); await click('#active button[type="submit"]');
            if ((await state()).k !== si) err(tag, `${sat}: принят неверный ответ`);
            // H-68: цель answer_wrong — место (point, step) и near=0; текста ответа в параметрах нет
            const gw = (await goals()).slice(g0).filter(([n]) => n === 'answer_wrong');
            if (gw.length !== 1 || gw[0][1].step == null || gw[0][1].point !== p.n || gw[0][1].near !== 0) err(tag, `${sat}: ждали одну цель answer_wrong (point, step, near=0), получили ${JSON.stringify(gw)}`);
            if (gw.some(([, prm]) => JSON.stringify(prm).includes('неверно'))) err(tag, `${sat}: текст ответа ушёл в параметры цели answer_wrong`);
            if (!(await page.$('.pl-wrong'))) err(tag, `${sat}: нет сообщения о неверном ответе`);
            if (!(await page.evaluate(() => { const i = document.getElementById('ans'); const r = i && i.getBoundingClientRect(), w = document.querySelector('#active .pl-wrong').getBoundingClientRect(); return i && i.dataset.same === '1' && document.activeElement === i && r.top >= 56 && w.bottom <= innerHeight; }))) err(tag, `${sat}: неверный ответ перерисовал поле (фокус потерян) или поле с сообщением ушли с экрана`);
            // 27.11: чтение с экрана слышит неверный ответ — поле помечено и ссылается на сообщение, оно объявлено в постоянной области
            if (!(await page.evaluate(() => { const i = document.getElementById('ans'), d = i && document.getElementById(i.getAttribute('aria-describedby') || '-'); return i.getAttribute('aria-invalid') === 'true' && d && d.classList.contains('pl-wrong'); }))) err(tag, `${sat}: поле неверного ответа без aria-invalid / aria-describedby на сообщение`);
            await srSaid(sat + ' · неверный ответ');
            await check(sat + ' · неверный ответ');
            // опечатка — «Почти! Проверьте написание», шаг не засчитан
            const typo = !nearSeen && nearTypo(st);
            if (typo) {
              nearSeen = true;
              const g1 = (await goals()).length;
              await page.fill('#ans', typo); await click('#active button[type="submit"]');
              if ((await state()).k !== si) err(tag, `${sat}: опечатка засчитана как верный ответ`);
              const gn = (await goals()).slice(g1).filter(([n]) => n === 'answer_wrong');
              if (gn.length !== 1 || gn[0][1].near !== 1) err(tag, `${sat}: на опечатку ждали цель answer_wrong с near=1, получили ${JSON.stringify(gn)}`);
              if (gn.some(([, prm]) => JSON.stringify(prm).includes(typo))) err(tag, `${sat}: текст опечатки ушёл в параметры цели`);
              const msg = await page.$eval('#active .pl-wrong', el => el.textContent).catch(() => '');
              if (msg.indexOf(ANS.NEAR_TEXT) === -1) err(tag, `${sat}: на опечатку нет подсказки «${ANS.NEAR_TEXT}»`);
            }
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
        if (TALLY) tallyFrames[p.n] = await page.evaluate(i => window.__dvorami.frames(i), pi);
        // развилка (поле fork): кнопки на последнем экране «точка пройдена»; выбор меняет ветку дела, возврат — восстанавливает
        if (p.fork && p.fork.flag) {
          const fk = p.fork, cur = flag(fk.flag);
          const btns = await page.$$eval('#app [data-act="fork"]', bs => bs.map(b => ({ v: b.dataset.v, on: b.getAttribute('aria-pressed') === 'true' })));
          if (btns.length !== (fk.options || []).length) err(tag, `${at}: развилка — кнопок ${btns.length} из ${(fk.options || []).length}`);
          else if (!btns.some(b => b.on && b.v === cur)) err(tag, `${at}: развилка — не отмечен текущий выбор «${cur}»`);
          const other = (fk.options || []).map(o => String(o.value)).find(v => v !== cur);
          if (other && btns.length) {
            await shot('player-fork');
            const idsFor = v => { const keep = FLAGS[fk.flag]; FLAGS[fk.flag] = v; const ids = prune(RAW).points.map(x => x.id); FLAGS[fk.flag] = keep; return ids.join(','); };
            const qids = () => page.evaluate(() => window.__dvorami.quest().points.map(x => x.id).join(','));
            await click(`#app [data-act="fork"][data-v="${other}"]`); await check(at + ' · развилка');
            if (await qids() !== idsFor(other)) err(tag, `${at}: развилка «${other}» не сменила ветку дела`);
            if (((await state()).fl || {})[fk.flag] !== other) err(tag, `${at}: развилка — выбор не записан в сохранение`);
            if (!(await page.$('#app [data-act="nextpoint"]'))) err(tag, `${at}: после выбора на развилке нет кнопки к следующей точке`);
            await click(`#app [data-act="fork"][data-v="${cur}"]`);
            if (await qids() !== idsFor(cur)) err(tag, `${at}: развилка — возврат к «${cur}» не восстановил ветку`);
          }
        }
        if (pi === 3 || (Q.letter && pi === Q.points.length - 2)) {
          await shot('player-clue');
          const b0 = await state();
          await click('[data-view="board"]'); await check(at + ' · улики'); await shot('player-board');
          // H-86: после прошлого открытия доски легли карточки — у каждой метка «Новое»; повторное открытие — без меток
          if (typeof b0.bseen === 'number' && (b0.cards || []).length) {
            const want = b0.cards.length - b0.bseen, got = await page.$$eval('#app .pl-fresh-tag', e => e.length);
            if (got !== want) err(tag, `${at} · улики: меток «Новое» ${got}, а новых карточек с прошлого открытия ${want} (H-86)`);
            else if (TALLY) notes.push(`H-86: на доске ${b0.cards.length} карточек, с прошлого открытия «Новое» — ${want}`);
            if (want) {
              await click('[data-view="point"]'); await click('[data-view="board"]');
              if ((await page.$$('#app .pl-fresh-tag')).length) err(tag, `${at} · улики: метки «Новое» остались при повторном открытии`);
            }
          }
          // доска: первая улика — на первом экране (на 390, в конце дела: опровергнутые версии — строкой внизу, не сверху)
          if (pi === Q.points.length - 2) {
            const b = await page.evaluate(() => {
              const nav = document.getElementById('tabs'), bottom = nav && !nav.hidden ? nav.getBoundingClientRect().top : innerHeight;
              const clue = [...document.querySelectorAll('#app .pl-cardx')].find(e => !e.closest('.pl-vers, .pl-verx'));
              return { clue: clue ? Math.round(clue.getBoundingClientRect().top) : null, bottom: Math.round(bottom), rows: document.querySelectorAll('#app .pl-verx').length, seg: !!document.querySelector('#app [data-act="bmode"]') };
            });
            if (vp.width === 390 && b.clue != null && b.clue > b.bottom - 60) err(tag, `${at} · улики: первая улика не на первом экране доски (${b.clue} px, видно до ${b.bottom})`);
            if (b.seg) {
              for (const m of ['vers', 'clues', 'all']) {
                await click(`#app [data-act="bmode"][data-mode="${m}"]`); await check(`${at} · улики · ${m}`);
                const v = await page.evaluate(() => ({ vers: document.querySelectorAll('#app .pl-vers').length, clues: [...document.querySelectorAll('#app .pl-cardx')].filter(e => !e.closest('.pl-vers, .pl-verx')).length }));
                if (m === 'vers' && v.clues) err(tag, `${at} · улики: в режиме «Версии» видны улики`);
                if (m === 'clues' && v.vers) err(tag, `${at} · улики: в режиме «Улики» видны версии`);
              }
            }
            if (b.rows) {
              // T-118: штамп отпавшей версии не съедает заголовок — до 24 знаков заголовок виден целиком на 390
              if (vp.width === 390) {
                const cut = await page.$$eval('#app .pl-verx-title', es => es.map(e => ({ t: e.textContent.replace(/^Отпала:\s*/, '').trim(), over: e.scrollWidth > e.clientWidth + 1 })).filter(x => x.t.length <= 24 && x.over).map(x => x.t));
                cut.forEach(t => err(tag, `${at} · улики: заголовок отпавшей версии обрезан на 390 — «${t}» (T-118)`));
                notes.push(`T-118: заголовки отпавших версий на 390 проверены (строк: ${b.rows})`);
                await page.$eval('#app .pl-vers--gone', e => e.scrollIntoView({ block: 'center' })).catch(() => {}); await shot('player-board-gone');
              }
              await click('#app .pl-verx > summary'); await check(at + ' · улики · версия открыта');
              if (!(await page.$('#app .pl-verx[open] .pl-cardx'))) err(tag, `${at} · улики: опровергнутая версия не раскрывается по нажатию`);
              await click('#app .pl-verx > summary');
            }
          }
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
      ALL_FIRST.push(...SHUF_FIRST);
      for (const [k, v] of Object.entries(SHUF)) (ALL_SHUF[k] = ALL_SHUF[k] || new Set()).add([...v][0]);
      const end = await state();
      const clues = Q.points.filter(p => p.clue).length;
      if (end.phase !== 'done') err(tag, `финал не достигнут: ${end.phase}, точка ${end.p + 1}`);
      else {
        await fresh('финал'); await shot('player-final');
        if (end.board.length !== clues) err(tag, `улик ${end.board.length}, ожидали ${clues}`);
        // «стрелки»: каждая цель показана, и показана один раз (запомнена за одним экраном)
        const targets = new Set(JSON.stringify(Q).match(/"arrow":"[^"]+"/g) || []);
        for (const t of targets) { const k = t.split('"')[3]; if (k === 'sound' && (!VOICE || readMode)) continue; if (!end.arrows || !end.arrows[k]) err(tag, `стрелка «${k}» ни разу не показана`); }
        // T-93: без плеера реплики (нет записей или режим «Читаю») совета «Звук» нет
        if ((!VOICE || readMode) && end.arrows && end.arrows.sound) err(tag, 'стрелка «Звук» показана, хотя плеера реплики нет (T-93)');
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
            if (pc.some(x => /from=/.test(x))) err(tag, 'финал: на картинке открытки адрес с меткой from= (метка — только в ссылке)');
            const sl = await page.evaluate(() => window.__dvorami.shareLink()).catch(() => '');
            if (!/\/moscow\/[^?#]+\?(?:.*&)?from=card(?:&|$)/.test(sl)) err(tag, `финал: ссылка «Поделиться» без метки ?from=card («${sl}»)`);
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
  // H-83 и H-85 — отдельный короткий прогон на 390: плашка «🔶 запасной текст» в ?field=1 и «вы здесь» на схеме
  // (геолокация подменена, внешние запросы заблокированы). Вход — сохранённым кодом и сохранением на нужной точке.
  {
    const tag = '390/доп';
    const p0 = Q.points[Math.min(2, Q.points.length - 1)];
    const open = async (extra, qs, statePoint, saved) => {
      const ctx = await browser.newContext(Object.assign({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, reducedMotion: 'reduce', serviceWorkers: 'block' }, extra));
      const page = await ctx.newPage();
      await page.route('**/*', route => {
        const u = route.request().url();
        if (/\/quest\.locked\.json(\?|$)/.test(u) && u.startsWith(BASE)) return SEALED ? route.fulfill({ path: BUNDLE.locked, contentType: 'application/json' }) : route.fulfill({ status: 404 });
        if (/\/quest\.json(\?|$)/.test(u) && u.startsWith(BASE)) return SEALED ? route.fulfill({ status: 404 }) : route.fulfill({ path: QUEST, contentType: 'application/json' });
        return u.startsWith(BASE) ? route.continue() : route.abort();
      });
      page.on('pageerror', e => err(tag, 'JS: ' + e.message));
      page.on('console', m => { if (m.type() === 'error' && !/ERR_FAILED|ERR_BLOCKED|net::|quest\.locked\.json|\/media\//.test(m.text() + ((m.location() || {}).url || ''))) err(tag, 'консоль: ' + m.text().slice(0, 200)); });
      await page.addInitScript(([qid, code, ver, pi, saved]) => {
        try {
          if (code) localStorage.setItem('dvorami:code:' + qid, code);
          localStorage.setItem('dvorami:play:' + qid, JSON.stringify(Object.assign({ v: 1, quest: qid, version: ver, phase: 'walk', p: pi, k: 0, f: 0, t_start: Date.now() - 6e5, field: false }, saved || {})));
        } catch (e) {}
        window.__goals = []; let real = null;
        Object.defineProperty(window, 'dvoramiTrack', { configurable: true, get: () => (g, p) => { window.__goals.push([g, Object.assign({}, p)]); if (real) try { real(g, p); } catch (e) {} }, set: f => { real = f; } });
        // сколько слежений за местом сейчас открыто (watchPosition без clearWatch)
        window.__watch = 0;
        const G = navigator.geolocation;
        if (G) { const w = G.watchPosition.bind(G), c = G.clearWatch.bind(G); const live = new Set();
          G.watchPosition = (...a) => { const id = w(...a); live.add(id); window.__watch = live.size; return id; };
          G.clearWatch = id => { live.delete(id); window.__watch = live.size; return c(id); }; }
      }, [QID, SEALED ? BUNDLE.code : '', RAW.version == null ? null : RAW.version, statePoint, saved || null]);
      await page.goto(`${BASE}/${PAGE}${qs}`, { waitUntil: 'load' });
      await page.waitForSelector('#app .pl-bar, #app [data-view], #tabs:not([hidden])', { timeout: 15000 }).catch(() => {});
      return { ctx, page };
    };
    const audit1 = async (page, where) => (await page.evaluate(audit)).forEach(m => err(`${tag} · ${where}`, m));
    const jpg = async (page, name) => { if (args.shots) { fs.mkdirSync(args.shots, { recursive: true }); await page.waitForTimeout(150); await page.screenshot({ path: path.join(args.shots, `${name}-390.jpg`), type: 'jpeg', quality: 80 }); } };

    // --- H-83: плашка полевого теста у запасного текста ---
    {
      const sep = QS ? '&' : '?';
      let { ctx, page } = await open({}, QS + sep + 'field=1', 0);
      const where = await page.evaluate(() => {
        const Q = window.__dvorami.quest();
        for (let i = 0; i < Q.points.length; i++) if (/"_fb(Gap)?"/.test(JSON.stringify(Q.points[i].walk || []))) return i;
        return -1;
      });
      const total = await page.evaluate(() => (JSON.stringify(window.__dvorami.quest()).match(/"_fb(Gap)?"/g) || []).length);
      if (where < 0) notes.push(`плашка «🔶 запасной текст»: в деле нет текста по флагам-фактам в ветке B (меток: ${total})`);
      else {
        await ctx.close(); ({ ctx, page } = await open({}, QS + sep + 'field=1', where));
        let seen = false;
        for (let i = 0; i < 40 && !seen; i++) {
          await page.$$eval('#app details.pl-more:not([open]) > summary', ss => ss.forEach(s => s.click())).catch(() => {});
          if (await page.$('#app .pl-fb')) { seen = true; break; }
          const b = await page.$('#app .pl-bar [data-act="fwd"]'); if (!b) break; await b.click();
        }
        if (!seen) err(tag, `полевой тест: на дороге к точке ${Q.points[where].n} нет плашки «🔶 запасной текст»`);
        else {
          const t = await page.$eval('#app .pl-fb', e => e.textContent);
          if (!/^🔶 (запасной текст|скрыто до подтверждения): \S+ — .{4,}/.test(t)) err(tag, `полевой тест: плашка без флага или пояснения: «${t}»`);
          await page.$eval('#app .pl-fb', e => e.scrollIntoView({ block: 'center' }));
          await audit1(page, 'полевой тест · плашка'); await jpg(page, 'player-field-fb');
          notes.push(`плашка «🔶 запасной текст» в ?field=1: ${total} меток в деле, проверена на точке ${Q.points[where].n} — «${t.slice(0, 70)}…»`);
          // T-120: в полевом отчёте — блок «Факты 🔶» с флагом этой плашки и его значением
          const rep = await page.evaluate(() => window.__dvorami.report()).catch(() => '');
          const fk = (t.match(/:\s*(\S+)\s—/) || [])[1];
          if (!/ФАКТЫ 🔶/.test(rep) || (fk && !new RegExp('- ' + fk.replace(/[^\w-]/g, '') + ' = [A-Z]').test(rep))) err(tag, `полевой отчёт: нет блока «Факты 🔶» с флагом ${fk} (T-120)`);
        }
        await ctx.close();
        // тот же экран без ?field=1 — плашки нет (сохранение не полевое)
        ({ ctx, page } = await open({}, QS, where));
        for (let i = 0; i < 40; i++) {
          if (await page.$('#app .pl-fb')) { err(tag, 'плашка «🔶 запасной текст» видна без ?field=1'); break; }
          const b = await page.$('#app .pl-bar [data-act="fwd"]'); if (!b) break; await b.click();
        }
      }
      await ctx.close();
    }

    // --- H-85: «вы здесь» на схеме ---
    {
      const pi = Q.points.indexOf(p0);
      let { ctx, page } = await open({ geolocation: { latitude: p0.lat, longitude: p0.lon, accuracy: 25 }, permissions: ['geolocation'] }, QS, pi);
      await page.click('[data-view="map"]');
      if (!(await page.$('#app [data-act="locate"]'))) err(tag, 'карта: нет кнопки «Где я на схеме»');
      else {
        if (await page.evaluate(() => window.__watch)) err(tag, 'карта: геолокация включилась без нажатия');
        await page.click('#app [data-act="locate"]');
        const ok = await page.waitForSelector('#pl-me .pl-me-dot', { timeout: 5000 }).catch(() => null);
        if (!ok) err(tag, 'карта: после «Где я на схеме» нет точки «вы здесь» (игрок у текущей точки)');
        await audit1(page, 'карта · вы здесь'); await jpg(page, 'player-map-me');
        const g = (await page.evaluate(() => window.__goals)).filter(([n]) => n === 'map_locate');
        if (g.length !== 1 || g[0][1].res !== 'in') err(tag, `карта: ожидали одну цель map_locate (res=in), получили ${JSON.stringify(g)}`);
        if (/\d{2}\.\d{3}/.test(JSON.stringify(g))) err(tag, 'карта: координаты ушли в параметры цели map_locate');
        // игрок далеко за рамкой схемы — стрелка у края
        await ctx.setGeolocation({ latitude: p0.lat + 0.03, longitude: p0.lon + 0.03, accuracy: 25 });
        if (!(await page.waitForSelector('#pl-me .pl-me-out', { timeout: 5000 }).catch(() => null))) err(tag, 'карта: игрок за рамкой — нет стрелки-направления у края');
        else { const r = await page.$eval('#pl-me .pl-me-out', e => { const b = e.getBoundingClientRect(), s = e.closest('svg').getBoundingClientRect(); return b.left >= s.left - 1 && b.right <= s.right + 1 && b.top >= s.top - 1 && b.bottom <= s.bottom + 1; }); if (!r) err(tag, 'карта: стрелка «вы здесь» вылезает за схему'); }
        await audit1(page, 'карта · вы за краем'); await jpg(page, 'player-map-out');
        // ушли с карты — слежение снято
        await page.click('[data-view="board"]');
        if (await page.evaluate(() => window.__watch)) err(tag, 'карта: геолокация не выключилась при уходе с карты');
        await page.click('[data-view="map"]');
        if (await page.$('#pl-me .pl-me-dot, #pl-me .pl-me-out')) err(tag, 'карта: «вы здесь» осталось после возврата на карту без нажатия');
      }
      await ctx.close();
      // отказ в геолокации — тихая подсказка, без ошибок
      ({ ctx, page } = await open({}, QS, pi));
      await page.click('[data-view="map"]');
      if (await page.$('#app [data-act="locate"]')) {
        await page.click('#app [data-act="locate"]');
        const note = await page.waitForFunction(() => /не разрешена|не получилось/i.test((document.getElementById('loc-note') || {}).textContent || ''), null, { timeout: 8000 }).then(() => true).catch(() => false);
        if (!note) err(tag, 'карта: при отказе в геолокации нет подсказки');
        if (await page.evaluate(() => window.__watch)) err(tag, 'карта: после отказа слежение не снято');
        await audit1(page, 'карта · отказ');
      }
      await ctx.close();
    }

    // --- T-94: касание правой трети экрана и свайп влево — «Дальше»; касание слева и по кнопкам — нет ---
    {
      const SKIP = 'a, button, input, textarea, select, label, summary, details, [data-act], .pl-form, .pl-opts, .pl-sel, .pl-frame, .pl-letter, .pl-fig, svg, dialog';
      let { ctx, page } = await open({ hasTouch: true }, QS, 0);
      // точка, где у дороги несколько экранов (разговор в пути): там есть «Дальше»
      const wi = await page.evaluate(() => { const D = window.__dvorami, n = D.quest().points.length;
        for (let i = 0; i < n; i++) { const F = D.frames(i); if (F.findIndex(x => x.kind === 'arrive') >= 2) return i; } return -1; });
      if (wi < 0) notes.push('касание и свайп: в деле нет дороги с несколькими экранами — не проверено');
      else {
        if (wi !== 0) { await ctx.close(); ({ ctx, page } = await open({ hasTouch: true }, QS, wi)); }
        const f0 = () => page.evaluate(() => window.__dvorami.pos().f);
        const spot = side => page.evaluate(([side, skip]) => {
          const f = document.getElementById('frame').getBoundingClientRect(), x = side === 'r' ? innerWidth * 0.85 : innerWidth * 0.15;
          const bar = (document.querySelector('#app .pl-bar') || { getBoundingClientRect: () => ({ top: innerHeight }) }).getBoundingClientRect().top;
          for (let y = Math.max(f.top + 4, 70); y < Math.min(bar - 4, innerHeight - 70); y += 6) { const el = document.elementFromPoint(x, y); if (el && el.closest('#app') && !el.closest(skip)) return { x, y }; }
          return null;
        }, [side, SKIP]);
        const flips = async how => (await page.evaluate(() => window.__goals)).filter(([g, p]) => g === 'flip' && p.how === how);
        const a = await f0(), L = await spot('l');
        if (L) { await page.mouse.click(L.x, L.y); if (await f0() !== a) err(tag, 'касание левой части экрана листает вперёд — должно только правой трети'); }
        const R = await spot('r');
        if (!R) err(tag, 'касание: на экране дороги нет свободного места справа (всё занято кнопками)');
        else {
          await page.mouse.click(R.x, R.y);
          if (await f0() !== a + 1) err(tag, `касание правой трети экрана не листает вперёд (экран ${a} → ${await f0()})`);
          const ft = await flips('tap');
          if (ft.length !== 1 || ft[0][1].quest !== QID || ft[0][1].point == null) err(tag, `касание: ждали одну цель flip (how=tap, quest, point), получили ${JSON.stringify(ft)}`);
        }
        const b = await f0(), more = await page.$('#app .pl-bar [data-act="fwd"], #app .pl-bar [data-act="next"]');
        if (more) {
          await page.evaluate(() => {
            const el = document.getElementById('frame'), r = el.getBoundingClientRect(), y = r.top + Math.min(r.height / 2, 120);
            const t = x => new Touch({ identifier: 1, target: el, clientX: x, clientY: y });
            el.dispatchEvent(new TouchEvent('touchstart', { touches: [t(320)], changedTouches: [t(320)], bubbles: true }));
            el.dispatchEvent(new TouchEvent('touchend', { touches: [], changedTouches: [t(150)], bubbles: true }));
          });
          if (await f0() !== b + 1) err(tag, `свайп влево не листает вперёд (экран ${b} → ${await f0()})`);
          if ((await flips('swipe')).length !== 1) err(tag, 'свайп: нет цели flip (how=swipe)');
        }
        // на последнем экране дороги — «Мы на месте»: касание не отмечает прибытие за игрока
        let pressed = 0;
        for (let i = 0; i < 20 && await page.$('#app .pl-bar [data-act="fwd"]'); i++) { await page.click('#app .pl-bar [data-act="fwd"]'); pressed++; }
        const fb = await flips('button');
        if (pressed && fb.length !== 1) err(tag, `кнопка «Дальше»: ждали одну цель flip (how=button) на точку, получили ${fb.length}`);
        const R2 = await spot('r'), ph = (await page.evaluate(() => window.__dvorami.state().phase));
        if (R2) { await page.mouse.click(R2.x, R2.y); if ((await page.evaluate(() => window.__dvorami.state().phase)) !== ph) err(tag, 'касание справа нажало «Мы на месте» за игрока'); }
        await audit1(page, 'касание и свайп');
        notes.push(`касание правой трети и свайп влево листают вперёд, касание слева и «Мы на месте» — нет (точка ${wi + 1})`);
      }
      await ctx.close();
    }

    // --- T-93: в полевом тесте (?field=1) плеер реплики и выбор «Слушаю и читаю / Читаю» есть и без записей ---
    {
      const o = await open({}, QS + (QS ? '&' : '?') + 'field=1', 0);
      await o.page.click('[data-act="menu"]');
      if ((await o.page.$$('#sheet [data-act="mode"]')).length !== 2) err(tag, 'полевой тест: в меню нет выбора «Слушаю и читаю / Читаю» (T-93)');
      await o.ctx.close();
    }

    // --- H-62: субтитры. В полевом тесте (?field=1) плеер реплики стоит на каждом экране с репликами — и с записями, и без.
    // На каждом экране дела: у плеера есть все его реплики с текстом на экране; голос в конце записи отмечает последнюю реплику
    // и раскрывает её свёрнутый хвост («Подробнее»), в начале — первую, хвост закрыт; звуковая улика — с текстом под плеером ---
    {
      const n = Q.points.length, hist = {};
      for (let i = 0; i < n; i++) hist[i] = { res: Array.from({ length: 40 }, () => ({ st: 'ok' })), wa: Array.from({ length: 10 }, () => ({ res: { st: 'ok' } })) };
      const o = await open({}, QS + (QS ? '&' : '?') + 'field=1', n - 1, { phase: 'done', p: n - 1, f: 0, t_end: Date.now(), hist, res: [], board: [], events: [], cards: [], struck: {}, wa: [], field: true });
      const page = o.page;
      let strips = 0, lines = 0, folds = 0;
      for (const sec of [-1].concat(Q.points.map((x, i) => i))) {
        const F = await page.evaluate(s2 => window.__dvorami.frames(s2), sec);
        for (let f = 0; f < F.length; f++) {
          const r = await page.evaluate(([s2, f2]) => {
            const bt = document.createElement('button'); bt.dataset.act = 'jump'; bt.dataset.sec = s2; bt.dataset.f = f2; document.body.appendChild(bt); bt.click(); bt.remove();
            const out = [], fr = document.getElementById('frame');
            if (!fr) return { out, s: 0 };
            const boxes = [...fr.querySelectorAll('.pl-voice[data-n]')];
            // T-134: плеер звуковой улики (data-clue) засчитывается только своим текстом сразу под ним (.pl-sub из transcript),
            // а не любой репликой рядом: раньше улика без transcript под репликой героя проходила проверку
            for (const v of fr.querySelectorAll('.pl-voice[data-clue]')) {
              const nx = v.nextElementSibling;
              if (!(nx && nx.matches('.pl-sub') && nx.textContent.trim())) out.push('звуковая улика без transcript: под плеером нет её текста (H-62)');
            }
            // плеер реплики рассказчика со своим audio — сразу после её текста (data-say); прочие плееры без data-n — без текста
            for (const v of fr.querySelectorAll('.pl-voice:not([data-n]):not([data-clue])')) {
              const pv = v.previousElementSibling;
              if (!(pv && pv.matches('[data-say]') && pv.textContent.trim())) out.push('плеер без текста на экране');
            }
            // реплика с картинкой и текстом (T-134): текст — под картинкой и отмечается плеером (data-say)
            for (const f of fr.querySelectorAll('figure.pl-fig')) if (f.dataset.text === '1' && !(f.nextElementSibling && f.nextElementSibling.matches('[data-say]')))
              out.push('реплика с картинкой: текста под картинкой нет (data-say)');
            const first = boxes[0];
            if (!first) return { out, s: 0 };
            const n0 = +first.dataset.n, whole = first.dataset.whole === '1';
            const a = window.__dvorami.say(0, 0);
            if (!a || a.found < n0) { out.push(`у плеера ${n0} реплик, на экране найдено ${a ? a.found : 0}`); return { out, s: boxes.length }; }
            const vis = [...fr.querySelectorAll('.is-speaking')];
            if (vis.length !== 1) out.push(`в начале записи отмечено реплик: ${vis.length} (нужна одна)`);
            else if (!vis[0].textContent.trim() || vis[0].getBoundingClientRect().height < 4) out.push('отмеченная реплика без видимого текста');
            if (a.open) out.push('хвост «Подробнее» раскрыт в самом начале записи');
            const last = whole ? 0 : n0 - 1;
            const z = window.__dvorami.say(last, 0.999);
            const sp = fr.querySelector('.is-speaking');
            if (!sp) out.push('в конце записи ни одна реплика не отмечена');
            else if (sp.querySelector('details.pl-more--text:not([open])')) out.push('голос дошёл до конца реплики, а её хвост «Подробнее» свёрнут — текст не на экране');
            window.__dvorami.say(null);
            if (document.querySelector('.is-speaking')) out.push('отметка реплики не снимается');
            return { out, s: boxes.length, l: n0, fold: z && z.open ? 1 : 0 };
          }, [sec, f]);
          strips += r.s; lines += r.l || 0; folds += r.fold || 0;
          for (const m of r.out) err(tag, `H-62 ${sec < 0 ? 'вступление' : 'т.' + Q.points[sec].n} ${F[f].id}: ${m}`);
        }
      }
      if (!strips && Q.format >= 5) err(tag, 'H-62: в полевом тесте ни одного плеера реплики — проверка субтитров ничего не проверила');
      notes.push(`H-62 субтитры: плееров ${strips}, реплик под ними ${lines}, хвост «Подробнее» раскрывается голосом на ${folds} экранах`);
      await o.ctx.close();
    }

    // --- 27.11: «где» в шапке — живая область (aria-live); «Дальше» внутри точки её не перезаписывает, иначе чтение с экрана
    //     повторяет «Дело № N · K из M» на каждом экране ---
    {
      const pi = Math.min(1, Q.points.length - 1);
      const o = await open({}, QS, pi);
      const page = o.page;
      await page.evaluate(() => { window.__whereMut = 0; new MutationObserver(m => { window.__whereMut += m.length; }).observe(document.getElementById('where'), { childList: true, characterData: true, subtree: true, attributes: true }); });
      let moved = 0;
      for (let i = 0; i < 3; i++) {
        const b = await page.$('#app .pl-bar [data-act="fwd"]'); if (!b) break;
        const p0 = await page.evaluate(() => window.__dvorami.state().p);
        await b.click();
        if ((await page.evaluate(() => window.__dvorami.state().p)) !== p0) break;
        moved++;
      }
      const n = await page.evaluate(() => window.__whereMut);
      if (!moved) notes.push('шапка «где»: на точке ' + Q.points[pi].n + ' нет экранов для «Дальше» — проверка живой области пропущена');
      else if (n) err(tag, `шапка: «Дальше» внутри точки (${moved} раза) перезаписал живую область «где» (${n} изменений) — чтение с экрана повторяет её на каждом экране`);
      await o.ctx.close();
    }

    // --- офлайн (плейбук Инженера, принцип 1; 27.11): первый заход — sw.js берёт страницу под управление, плеер отдаёт ему
    //     уже загруженное (warmCache); связь пропала — перезагрузка открывает то же место. До 27.11 страница и дело при первом
    //     заходе в кеш не попадали: в арке без связи в первый же день — пустой экран браузера ---
    {
      const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, reducedMotion: 'reduce', serviceWorkers: 'allow' });
      const page = await ctx.newPage();
      page.on('pageerror', e => err(tag, 'офлайн: JS: ' + e.message));
      const pi = Math.min(1, Q.points.length - 1);
      await page.addInitScript(([qid, code, ver, pi2]) => {
        try {
          if (localStorage.getItem('dvorami:play:' + qid)) return;   // перезагрузка — своё сохранение, не подменяем
          if (code) localStorage.setItem('dvorami:code:' + qid, code);
          localStorage.setItem('dvorami:play:' + qid, JSON.stringify({ v: 1, quest: qid, version: ver, phase: 'walk', p: pi2, k: 0, f: 0, t_start: Date.now() - 6e5, field: false }));
        } catch (e) {}
      }, [QID, SEALED ? BUNDLE.code : '', RAW.version == null ? null : RAW.version, pi]);
      await page.goto(`${BASE}/${PAGE}${QS}`, { waitUntil: 'load' });
      const where = () => page.evaluate(() => { const s = window.__dvorami.state(); return `${s.phase} т.${s.p + 1} экран ${s.f}`; });
      if (!(await page.waitForSelector('#tabs:not([hidden])', { timeout: 15000 }).then(() => true, () => false))) err(tag, 'офлайн: плеер с service worker не открылся');
      else {
        const ctl = await page.waitForFunction(() => !!navigator.serviceWorker.controller, null, { timeout: 10000 }).then(() => true, () => false);
        const warm = ctl && await page.waitForFunction(pg => caches.keys().then(ns => Promise.all(ns.map(n => caches.open(n).then(c => c.keys())))).then(all => {
          const u = [].concat(...all).map(r => r.url.split('?')[0]);
          return u.some(x => x.endsWith(pg)) && u.some(x => /\/quest\.(locked\.)?json$/.test(x)) && u.some(x => /\/player\.js$/.test(x));
        }), `/${PAGE}`, { timeout: 10000, polling: 300 }).then(() => true, () => false);
        if (!ctl) err(tag, 'офлайн: sw.js не взял страницу плеера под управление');
        else if (!warm) err(tag, 'офлайн: после первого захода в кеше нет страницы плеера, player.js или дела (warmCache → sw.js)');
        const before = await where();
        await ctx.setOffline(true);
        const back = await page.reload({ waitUntil: 'load' }).then(() => page.waitForSelector('#tabs:not([hidden])', { timeout: 15000 })).then(() => true, () => false);
        if (!back) err(tag, 'офлайн: без связи перезагрузка не открыла плеер (первый заход, сохранение и код на телефоне)');
        else {
          const after = await where();
          if (after !== before) err(tag, `офлайн: без связи открылось не то место (${before} → ${after})`);
          else notes.push(`офлайн: первый заход → связь пропала → перезагрузка открыла то же место (${after})`);
        }
      }
      await ctx.close();
    }

    // --- прокрутка на 360×740 (владелец 27.11): все экраны дела в просмотре пройденного, плашка «Пройденное» скрыта ---
    {
      const n = Q.points.length, hist = {};
      for (let i = 0; i < n; i++) hist[i] = { res: Array.from({ length: 40 }, () => ({ st: 'ok' })), wa: Array.from({ length: 10 }, () => ({ res: { st: 'ok' } })) };
      const o = await open({ viewport: { width: 360, height: 740 } }, QS, n - 1, { phase: 'done', p: n - 1, f: 0, t_end: Date.now(), hist, res: [], board: [], events: [], cards: [], struck: {}, wa: [] });
      const page = o.page;
      await page.addStyleTag({ content: '.pl-review{display:none!important}' });
      const secs = [-1].concat(Q.points.map((x, i) => i));
      let all = 0; const over = [];
      for (const sec of secs) {
        const F = await page.evaluate(s2 => window.__dvorami.frames(s2), sec);
        for (let f = 0; f < F.length; f++) {
          const m = await page.evaluate(([s2, f2]) => { const bt = document.createElement('button'); bt.dataset.act = 'jump'; bt.dataset.sec = s2; bt.dataset.f = f2; document.body.appendChild(bt); bt.click(); bt.remove();
            const fr = document.getElementById('frame'); return { over: Math.round(document.documentElement.scrollHeight - innerHeight), pic: !!(fr && fr.querySelector('.pl-fig, .pl-letter')) }; }, [sec, f]);
          all++;
          if (m.over > 1) over.push(`${sec < 0 ? 'вступление' : 'т.' + Q.points[sec].n} ${F[f].id} (${F[f].kind}${m.pic ? ', картинка' : ''}): +${m.over} px`);
        }
      }
      const pics = over.filter(x => /картинка/.test(x)).length;
      warn('прокрутка 360×740', `экранов с прокруткой ${over.length} из ${all} (с картинкой ${pics})` + (over.length ? ':\n     ' + over.slice(0, 40).join('\n     ') + (over.length > 40 ? '\n     …' : '') : ''));
      await o.ctx.close();
    }
  }

  await browser.close();
  server.close();
  // у разных игроков (новое сохранение в каждом из 6 прогонов) порядок разный хотя бы у одного выбора
  const sk = Object.values(ALL_SHUF);
  const firsts = ALL_FIRST.filter(Boolean).length;   // по всем прогонам: случайно «всегда первый» в 20+ выборах не выпадает
  if (ALL_FIRST.length >= 6 && firsts === ALL_FIRST.length) err('варианты', `верный вариант первым во всех ${firsts} перемешиваемых выборах`);
  if (sk.length && sk.every(v => v.size === 1)) err('варианты', 'порядок вариантов одинаков во всех прогонах — перемешивание не зависит от игрока');
  // T-94: нажатия «Дальше» и экраны по точкам (прогон 390/тёмная), прокрутка на 390×844
  if (Object.keys(tally).length) {
    const pts = Q.points.map(x => x.n), intro = tally['вступление'] || 0;
    const total = pts.reduce((a, n) => a + (tally[n] || 0), 0);
    const line = pts.map(n => { const F = tallyFrames[n] || []; const r = F.filter(x => x.kind === 'result' || (x.kind === 'done' && x.parts)).length; return `т.${n} ${tally[n] || 0} (экранов ${F.length}, разбор ${r})`; }).join(' · ');
    notes.push(`«Дальше» на 390×844 (T-94): ${line}; всего по точкам ${total}, со вступлением ${total + intro}`);
  }
  if (seenFrames.size) {
    const list = [...scrolled.values()], pics = list.filter(x => /картинка/.test(x)).length;
    warn('прокрутка 390×844', `экранов с прокруткой ${list.length} из ${seenFrames.size} (с картинкой ${pics})` + (list.length ? ':\n     ' + list.join('\n     ') : ''));
  }
  [...new Set(notes)].forEach(n => console.log(' · ' + n));
  console.log(' · ' + SRC);
  if (ALL_FIRST.length) console.log(` · варианты перемешаны: верный первым в ${firsts} из ${ALL_FIRST.length} выборов`);
  [...new Set(warns)].forEach(w => console.log(' ! ' + w));
  const uniq = [...new Set(errors)];
  if (uniq.length) {
    console.log(`player_check: ${uniq.length} ошибок\n`);
    uniq.slice(0, 80).forEach(e => console.log(' ✗ ' + e));
    process.exit(1);
  }
  console.log(`player_check: OK — «${Q.title}»: ${Q.points.length} точек пройдено от обложки до финала × 3 ширины × 2 темы, проверено экранов: ${screens}; «почти» на опечатку в браузере: ${nearSeen ? 'проверено' : 'нет подходящей загадки'}`);
  process.exit(0);
})().catch(e => { console.error(e); process.exit(2); });

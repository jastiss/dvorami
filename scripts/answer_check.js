#!/usr/bin/env node
/* Тест проверки ответов загадок (site/play/answer.js): node scripts/answer_check.js [--quest=zilart] [--data=путь/quest.json]
 *   1) нормализация: регистр, ё/е, кавычки, дефисы, пробелы, числа цифрой и словом («3» = «три», «1 931» = «1931»);
 *   2) «почти»: одна опечатка в ответе от 5 букв или верные слова вперемешку с лишними — не засчитывается, мягкая подсказка;
 *   2б) латинская раскладка (H-70): «hfvf» = «рама», и в «почти»; кириллица и латинские ответы не ломаются;
 *   2в) бот (scripts/answer_match.py, quest_bot) засчитывает то же, что плеер: сверка matches() на наборе случаев (нужен python3)
 *       и проверка шага целиком check_text() = checkText() (answers → all → replies → missing → «почти») на каждой загадке дела;
 *   3) каждая загадка дела (шаги ask, вопросы на ходу walk_ask, финал; обе ветки А/Б) принимает свой эталон, все свои
 *      допустимые формы из данных (answers) и их написание с ошибками формы, а явно неверный ответ — нет (ни «верно», ни «почти»).
 * Без зависимостей; вызывается и из scripts/player_check.js (красный — сборка стенда падает). Выход: 0 — чисто, 1 — ошибки.
 * В выводе нет текстов ответов: только место загадки (point/step) — журнал Actions публичный (team/std/spoilers.md). */
'use strict';
const fs = require('fs');
const path = require('path');
const A = require('../site/play/answer.js');

const REPO = path.resolve(__dirname, '..');
const SKIP_TYPES = new Set(['choice', 'pick', 'strike', 'free']);
const WRONG = ['банан', 'zzzz', 'не знаю'];

function unit() {
  const err = [];
  const eq = (got, want, what) => { if (got !== want) err.push(`${what}: получили ${JSON.stringify(got)}, ждали ${JSON.stringify(want)}`); };
  // нормализация
  eq(A.norm('  «ТЮФЕЛЁВА»  роща! '), 'тюфелева роща', 'регистр, ё, кавычки, пробелы');
  eq(A.norm('рама-грузовика'), 'рама грузовика', 'дефис');
  eq(A.norm('рама—грузовика'), 'рама грузовика', 'тире');
  eq(A.norm('"летатлин"'), 'летатлин', 'прямые кавычки');
  eq(A.norm('й'), 'й', 'юникод NFC');
  eq(A.norm('За́мок'), 'замок', 'знак ударения');
  eq(A.norm('ра\u00adма\ufeff'), 'рама', 'мягкий перенос и невидимые знаки');
  eq(A.matches('Лета́тлин', ['~летатлин']), true, 'ответ со знаком ударения принят');
  // числа
  eq(A.numeric('три'), '3', 'число словом');
  eq(A.numeric('1 931'), '1931', 'группы цифр');
  eq(A.numeric('тысяча девятьсот тридцать один'), '1931', 'год словами');
  eq(A.numeric('две тысячи двадцать шесть'), '2026', 'две тысячи');
  eq(A.numeric('сто двадцать пять'), '125', 'составное');
  eq(A.numeric('двадцать три'), '23', 'десятки и единицы');
  eq(A.numeric('три пять'), '3 5', 'два числа подряд не складываются');
  eq(A.numeric('в 1931г'), 'в 1931 г', 'цифры отделяются от букв');
  eq(A.numeric('столбы'), 'столбы', 'слово не число');
  eq(A.matches('три', ['3']), true, '«три» = «3»');
  eq(A.matches('3', ['три']), true, '«3» = «три»');
  eq(A.matches('Это было в 1 931 году', ['1931']), true, '«1 931» в фразе');
  eq(A.matches('тысяча девятьсот пятидесятый', ['1950']), false, 'порядковые не считаем (нет в словаре)');
  eq(A.matches('сорока', ['~сорок']), true, 'основа «~» не ломается числом');
  eq(A.matches('ни одного', ['~ни одно']), true, 'числительное внутри основы');
  eq(A.matches('ни 10', ['~ни одно']), false, 'число в основе не продолжается цифрами');
  eq(A.matches('11 корня', ['~одного корня']), false, 'число в начале основы — с границей');
  eq(A.matches('1 корня', ['~одного корня']), true, 'число в основе цифрой');
  eq(A.matches('Ё', ['е']), true, 'однобуквенный ответ');
  eq(A.matches('это е и ещё много слов', ['е']), false, 'однобуквенный ответ в длинной фразе');
  // «почти»
  eq(A.lev1('летатлин', 'летатлен'), true, 'lev1 замена');
  eq(A.lev1('летатлин', 'летатлинн'), true, 'lev1 вставка');
  eq(A.lev1('летатлин', 'летлин'), false, 'lev1 два');
  const st = { answers: ['рама грузовика', '~летатлин', 'климатическая камера', '1931'] };
  eq(A.checkText(st, 'Летатлен').near, true, 'опечатка в основе');
  eq(A.checkText(st, 'климатическая камерра').near, true, 'опечатка в ответе');
  eq(A.checkText(st, 'рама старого грузовика').near, true, 'верные слова с лишними');
  eq(A.checkText(st, 'рама старого грузовика').ok, false, '«почти» не засчитывается');
  eq(A.checkText(st, 'рама старого грузовика').reply, A.NEAR_TEXT, 'текст «почти»');
  eq(A.checkText(st, '1932').near, undefined, 'год рядом с годом — не «почти»');
  eq(A.checkText({ answers: ['рама'] }, 'рамка').near, undefined, 'короткий ответ (< 5 букв) — без «почти»');
  eq(A.checkText({ answers: ['~камер'] }, 'камень').near, undefined, 'короткая основа (< 6 букв) — без «почти»');
  eq(A.checkText(st, 'банан').ok, false, 'неверный');
  eq(A.checkText(st, 'банан').near, undefined, 'неверный — не «почти»');
  // «почти» не перебивает ответ на типичную ошибку и «половина верна»
  const st2 = { all: [{ answers: ['~лихач'], missing: 'M' }, { answers: ['гдр'], missing: 'M2' }], replies: [{ answers: ['лехачев'], text: 'R' }] };
  eq(A.checkText(st2, 'лехачев').reply, 'R', 'replies раньше «почти»');
  eq(A.checkText(st2, 'лихачев').reply, 'M2', '«половина верна» раньше «почти»');
  eq(A.checkText(st2, 'лихачев и гдр').ok, true, 'ответ из частей');
  // латинская раскладка (H-70)
  eq(A.layout('hfvf'), 'рама', 'раскладка: hfvf → рама');
  eq(A.layout('рама'), null, 'раскладка: кириллицу не трогаем');
  eq(A.matches('hfvf', ['рама']), true, 'ответ латиницей принят');
  eq(A.matches('HFVF UHEPJDBRF', ['рама грузовика']), true, 'латиницей, заглавными, два слова');
  eq(A.matches('ktnfnkby', ['~летатлин']), true, 'основа «~» латиницей');
  eq(A.matches('zil', ['ZIL']), true, 'латинский ответ латиницей — как был');
  eq(A.matches('zzzz', ['рама']), false, 'латинская чушь не принимается');
  eq(A.checkText(st, 'ktnfnkty').near, true, '«почти» в латинской раскладке');
  return err;
}

// Бот и плеер засчитывают одно и то же: те же случаи — в scripts/answer_match.py (через python3)
const PARITY = [
  ['  «ТЮФЕЛЁВА»  роща! ', ['тюфелева роща']], ['рама—грузовика', ['рама грузовика']], ['три', ['3']], ['3', ['три']],
  ['Это было в 1 931 году', ['1931']], ['тысяча девятьсот тридцать один', ['1931']], ['две тысячи двадцать шесть', ['2026']],
  ['сорока', ['~сорок']], ['ни одного', ['~ни одно']], ['ни 10', ['~ни одно']], ['11 корня', ['~одного корня']],
  ['1 корня', ['~одного корня']], ['Ё', ['е']], ['это е и ещё много слов', ['е']], ['hfvf', ['рама']],
  ['HFVF UHEPJDBRF', ['рама грузовика']], ['ktnfnkby', ['~летатлин']], ['zil', ['ZIL']], ['zzzz', ['рама']],
  ['в 1931г', ['1931']], ['банан', ['рама']], ['рама', ['рама']], ['это ржавчина', ['ржавчина']], ['не знаю', ['~зна']],
  // 27.11: знак ударения бот снимал, а плеер оставлял — «Лета́тлин» бот засчитывал, плеер нет
  ['Лета́тлин', ['летатлин']], ['летатлин', ['лета́тлин']], ['за́мок', ['~замок']], ['летатлин\u0301', ['летатлин']], ['ра\u00adма', ['рама']], ['İstanbul', ['istanbul']],
  ['тюфелева\u00a0роща', ['тюфелева роща']], ['рама\u200bгрузовика', ['рама грузовика']]
];
function parity() {
  const err = [];
  let py;
  try {
    py = JSON.parse(require('child_process').execFileSync('python3', ['-c',
      'import sys, json; sys.path.insert(0, sys.argv[1]); from answer_match import matches; ' +
      'print(json.dumps([matches(t, a) for t, a in json.load(sys.stdin)]))', __dirname],
    { input: JSON.stringify(PARITY), encoding: 'utf8' }));
  } catch (e) {
    return ['сверка с ботом не запустилась (python3, scripts/answer_match.py): ' + String(e.message || e).split('\n')[0]];
  }
  PARITY.forEach(([t, a], i) => { const js = A.matches(t, a); if (js !== py[i]) err.push(`бот и плеер расходятся, случай №${i + 1}: плеер ${js}, бот ${py[i]}`); });
  return err;
}

// Проверка шага целиком (answers → all → replies → missing → «почти»): бот (answer_match.check_text) = плеер (checkText).
// Случаи — из каждой загадки дела: эталон, формы, части all по одной и вместе, ответы replies, явно неверные, опечатка, пусто.
// В выводе — только место загадки и номер случая, без текстов (журнал Actions публичный).
function checkCases(st) {
  const out = [];
  const add = t => { if (typeof t === 'string' && !out.includes(t)) out.push(t); };
  const parts = (st.all || []).map(g => groupAns(g).filter(a => typeof a === 'string'));
  (st.answers || []).filter(a => typeof a === 'string').forEach(a => { add(plainOf(a)); add(plainOf(a).toUpperCase()); });
  parts.forEach(p => p.forEach(a => add(plainOf(a))));
  if (parts.length) add(parts.map(p => plainOf(p[0] || '')).join(' и '));
  (st.replies || []).forEach(r => (r.answers || []).forEach(a => add(plainOf(String(a)))));
  if (st.answers || st.all) {
    const et = etalonOf(st), word = et.split(' ').sort((a, b) => b.length - a.length)[0] || '';
    if (word.length >= 4) { const k = Math.floor(word.length / 2); add(et.replace(word, word.slice(0, k) + (word[k] === 'ы' ? 'и' : 'ы') + word.slice(k + 1))); }
    add(`Это ${et}, наверное`);
  }
  WRONG.concat(['', '!!!', '  ']).forEach(add);
  return out;
}
const pyCheck = cases => JSON.parse(require('child_process').execFileSync('python3', ['-c',
  'import sys, json; sys.path.insert(0, sys.argv[1]); from answer_match import check_text; ' +
  'print(json.dumps([check_text(s, t) for s, t in json.load(sys.stdin)]))', __dirname],
{ input: JSON.stringify(cases), encoding: 'utf8', maxBuffer: 64 << 20 }));
const sameCheck = (a, b) => !!a.ok === !!b.ok && (a.reply || '') === (b.reply || '') && !!a.near === !!b.near;
function checkParity(q, label) {
  const cases = [];
  const st0 = { answers: ['рама грузовика', '~летатлин', 'климатическая камера', '1931'] };
  const st2 = { all: [{ answers: ['~лихач'], missing: 'M' }, { answers: ['гдр'], missing: 'M2' }], replies: [{ answers: ['лехачев'], text: 'R' }] };
  [[st0, 'Летатлен'], [st0, 'климатическая камерра'], [st0, 'рама старого грузовика'], [st0, '1932'], [st0, 'ktnfnkty'],
    [{ answers: ['рама'] }, 'рамка'], [{ answers: ['~камер'] }, 'камень'], [st2, 'лехачев'], [st2, 'лихачев'], [st2, 'лихачев и гдр'],
    [{ all: [['изба'], ['петр']] }, 'изба'], [{ all: [['изба'], ['петр']] }, 'изба петра']].forEach(([s, t]) => cases.push({ s, t, where: 'набор' }));
  asksOf(q).forEach(({ st, where }) => checkCases(st).forEach(t => cases.push({ s: st, t, where })));
  let py;
  try { py = pyCheck(cases.map(c => [c.s, c.t])); } catch (e) {
    return ['сверка проверки шага с ботом не запустилась (python3, scripts/answer_match.py): ' + String(e.message || e).split('\n')[0]];
  }
  const err = [];
  cases.forEach((c, i) => {
    const js = A.checkText(c.s, c.t);
    if (!sameCheck(js, py[i])) err.push(`${label}, ${c.where}: бот и плеер по-разному проверяют шаг (случай №${i + 1}: плеер ${js.ok ? 'верно' : js.near ? 'почти' : js.reply ? 'ответ на ошибку' : 'неверно'}, бот ${py[i].ok ? 'верно' : py[i].near ? 'почти' : py[i].reply ? 'ответ на ошибку' : 'неверно'})`);
  });
  return err;
}

function asksOf(q) {
  const out = [];
  const add = (st, where) => {
    if (!st || typeof st !== 'object' || SKIP_TYPES.has(st.type)) return;
    if (!(Array.isArray(st.answers) && st.answers.length && st.answers.every(a => typeof a === 'string')) && !Array.isArray(st.all)) return;
    out.push({ st, where });
  };
  (q.points || []).forEach(p => {
    (p.steps || []).forEach((s, i) => add(s, `точка ${p.n} шаг ${i + 1}`));
    [].concat(p.walk_ask || []).forEach((w, i) => add(w, `точка ${p.n} на ходу ${i + 1}`));
  });
  const fin = q.finale;
  [].concat(Array.isArray(fin) ? fin : (fin && fin.steps) || []).forEach((s, i) => add(s, `финал шаг ${i + 1}`));
  return out;
}
const plainOf = a => (a.charAt(0) === '~' ? a.slice(1) : a);
const groupAns = g => (Array.isArray(g) ? g : g.answers || []);
function etalonOf(st) {
  if (st.answers) return plainOf(st.answers.find(a => a.charAt(0) !== '~') || st.answers[0]);
  return st.all.map(g => { const a = groupAns(g); return plainOf(a.find(x => x.charAt(0) !== '~') || a[0]); }).join(' и ');
}
// Написание той же формы с ошибками формы: регистр, ё, кавычки, дефис, пробелы, знаки, «это …»
function variants(x) {
  const v = [x.toUpperCase(), `  ${x}  `, `«${x}»`, `"${x}"!`, `${x}.`, `Это ${x}`, x.replace(/ /g, '-'), x.replace(/ /g, '   ')];
  if (/е/.test(x)) v.push(x.replace(/е/g, 'ё'));
  if (/ё/.test(x)) v.push(x.replace(/ё/g, 'е'));
  return v;
}

function questCheck(q, label) {
  const err = [];
  const asks = asksOf(q);
  if (!asks.length) err.push(`${label}: не нашлось ни одной загадки с ответом`);
  asks.forEach(({ st, where }) => {
    const at = `${label}, ${where}`;
    const ok = t => A.checkText(st, t).ok;
    const et = etalonOf(st);
    if (!ok(et)) err.push(`${at}: эталон не принимается`);
    variants(et).forEach((v, i) => { if (!ok(v)) err.push(`${at}: эталон в написании №${i + 1} не принимается`); });
    // допустимые формы из данных (answers и части all) — каждая принимается (для all — вместе с эталонами других частей)
    if (st.answers) {
      st.answers.filter(a => a.charAt(0) !== '~').forEach((a, i) => {
        if (!ok(a)) err.push(`${at}: форма №${i + 1} из данных не принимается`);
        if (!ok(a.toUpperCase().replace(/е/g, 'ё'))) err.push(`${at}: форма №${i + 1} заглавными и с «ё» не принимается`);
      });
    } else {
      st.all.forEach((g, gi) => {
        const rest = st.all.filter((_, k) => k !== gi).map(h => { const a = groupAns(h); return plainOf(a.find(x => x.charAt(0) !== '~') || a[0]); });
        groupAns(g).filter(a => a.charAt(0) !== '~').forEach((a, i) => {
          if (!ok([a].concat(rest).join(', '))) err.push(`${at}: часть ${gi + 1}, форма №${i + 1} не принимается`);
        });
      });
    }
    WRONG.forEach(w => {
      const r = A.checkText(st, w);
      if (r.ok) err.push(`${at}: принят явно неверный ответ №${WRONG.indexOf(w) + 1}`);
      if (r.near) err.push(`${at}: явно неверный ответ №${WRONG.indexOf(w) + 1} назван «почти»`);
    });
    // одна опечатка в эталоне от 5 букв — «верно» (основа совпала) или «почти», но не «не подходит»
    const word = et.split(' ').sort((a, b) => b.length - a.length)[0];
    if (!/\d/.test(word) && word.length >= 6) {
      const k = Math.floor(word.length / 2);
      const typo = et.replace(word, word.slice(0, k) + (word[k] === 'ы' ? 'и' : 'ы') + word.slice(k + 1));
      const r = A.checkText(st, typo);
      if (!r.ok && !r.near && !r.reply) err.push(`${at}: эталон с одной опечаткой — «не подходит», ждали «почти»`);
    }
  });
  return { err, n: asks.length };
}

function run(opts) {
  opts = opts || {};
  const qid = opts.quest || 'zilart';
  const file = opts.data || path.join(REPO, 'quests', qid, 'quest.json');
  const err = unit().map(e => 'нормализация — ' + e).concat(parity());
  const q = JSON.parse(fs.readFileSync(file, 'utf8'));
  const r = questCheck(q, path.relative(REPO, file));
  return { errors: err.concat(r.err, checkParity(q, path.relative(REPO, file))), asks: r.n };
}

module.exports = { run };

if (require.main === module) {
  const args = Object.fromEntries(process.argv.slice(2).map(a => a.replace(/^--/, '').split('=')));
  const r = run(args);
  if (r.errors.length) {
    console.log(`answer_check: ${r.errors.length} ошибок`);
    r.errors.forEach(e => console.log(' - ' + e));
    process.exit(1);
  }
  console.log(`answer_check: OK — нормализация и «почти», загадок проверено: ${r.asks}`);
}

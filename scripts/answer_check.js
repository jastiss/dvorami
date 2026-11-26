#!/usr/bin/env node
/* Тест проверки ответов загадок (site/play/answer.js): node scripts/answer_check.js [--quest=zilart] [--data=путь/quest.json]
 *   1) нормализация: регистр, ё/е, кавычки, дефисы, пробелы, числа цифрой и словом («3» = «три», «1 931» = «1931»);
 *   2) «почти»: одна опечатка в ответе от 5 букв или верные слова вперемешку с лишними — не засчитывается, мягкая подсказка;
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
  const err = unit().map(e => 'нормализация — ' + e);
  const q = JSON.parse(fs.readFileSync(file, 'utf8'));
  const r = questCheck(q, path.relative(REPO, file));
  return { errors: err.concat(r.err), asks: r.n };
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

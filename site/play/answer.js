/* Дворами — проверка текстового ответа загадки. Одна функция нормализации на плеер и тесты (scripts/answer_check.js).
   Подключается до player.js (window.DvAnswer); в Node — require('../site/play/answer.js').
   Варианты ответа — в данных дела (answers, all, replies; «~» — основа слова: засчитывается, если стоит в ответе),
   здесь — только то, что прощает форму, а не смысл:
   - регистр, ё/е, кавычки и знаки, дефисы и стрелки, лишние пробелы, юникод-формы (NFC);
   - числа: «3» = «три», «1 931» = «1931», «тысяча девятьсот тридцать один» = «1931» (сверяется и исходная форма, и числовая);
   - «почти» (near): одна опечатка (расстояние Левенштейна ≤ 1) в ответе от 5 букв (у основы «~» — от 6, она короче слова),
     или все слова составного ответа есть, но вперемешку с лишними. Почти — не засчитывается, игрок видит «Почти! Проверьте написание».
   Ответы по-прежнему лежат только внутри зашифрованного дела (quest.locked.json): модуль их не хранит и не выдаёт. */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.DvAnswer = api;
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  var NEAR_TEXT = 'Почти! Проверьте написание.';

  // ---------- нормализация ----------
  function base(s) {
    s = String(s == null ? '' : s);
    try { s = s.normalize('NFC'); } catch (e) { /* старый браузер */ }
    s = s.toLowerCase().replace(/ё/g, 'е');
    s = s.replace(/→/g, ' ').replace(/->/g, ' ').replace(/[-‐‑‒–—]/g, ' ');
    s = s.replace(/[^\p{L}\p{N}\p{M}_\s]/gu, ' ');
    return s.replace(/\s+/g, ' ').trim();
  }

  // Числительные: количественные, частые падежные формы. Значение + «разряд» (чем можно продолжить: двадцать → три).
  var NUM = {};
  function put(words, v) { words.split(' ').forEach(function (w) { NUM[w] = v; }); }
  put('ноль нуль', 0);
  put('один одна одно одного одной одну одним', 1);
  put('два две двух двум двумя', 2);
  put('три трех трем тремя', 3);
  put('четыре четырех четырем четырьмя', 4);
  put('пять пяти пятью', 5); put('шесть шести шестью', 6); put('семь семи семью', 7);
  put('восемь восьми восемью', 8); put('девять девяти девятью', 9); put('десять десяти десятью', 10);
  put('одиннадцать одиннадцати', 11); put('двенадцать двенадцати', 12); put('тринадцать тринадцати', 13);
  put('четырнадцать четырнадцати', 14); put('пятнадцать пятнадцати', 15); put('шестнадцать шестнадцати', 16);
  put('семнадцать семнадцати', 17); put('восемнадцать восемнадцати', 18); put('девятнадцать девятнадцати', 19);
  put('двадцать двадцати', 20); put('тридцать тридцати', 30); put('сорок сорока', 40);
  put('пятьдесят пятидесяти', 50); put('шестьдесят шестидесяти', 60); put('семьдесят семидесяти', 70);
  put('восемьдесят восьмидесяти', 80); put('девяносто девяноста', 90);
  put('сто ста', 100); put('двести двухсот', 200); put('триста трехсот', 300); put('четыреста четырехсот', 400);
  put('пятьсот пятисот', 500); put('шестьсот шестисот', 600); put('семьсот семисот', 700);
  put('восемьсот восьмисот', 800); put('девятьсот девятисот', 900);
  var THOUSAND = { 'тысяча': 1, 'тысячи': 1, 'тысяч': 1, 'тысячу': 1 };
  function room(n) { // сколько ещё можно прибавить словом: 20 → до 9, 100 → до 99, 23 и 11 → ничего
    if (n % 100 === 0) return 99;
    if (n % 10 === 0 && n % 100 >= 20) return 9;
    return 0;
  }
  function numeric(s) {
    var toks = s.replace(/(\d)(\p{L})/gu, '$1 $2').replace(/(\p{L})(\d)/gu, '$1 $2').split(' ');
    var out = [], i = 0;
    while (i < toks.length) {
      var t = toks[i];
      // «1 931», «12 500 000»: группы по три цифры после первой
      if (/^\d{1,3}$/.test(t) && /^\d{3}$/.test(toks[i + 1] || '')) {
        var g = t;
        while (/^\d{3}$/.test(toks[i + 1] || '')) { g += toks[i + 1]; i++; }
        out.push(String(+g)); i++; continue;
      }
      if (t in NUM || t in THOUSAND) {
        var total = 0, cur = null, used = false;
        while (i < toks.length) {
          var w = toks[i];
          if (w in THOUSAND) {
            total += (cur === null ? 1 : cur) * 1000; cur = null; used = true; i++; continue;
          }
          if (!(w in NUM)) break;
          var v = NUM[w];
          if (cur === null) { if (used && total && v >= 1000) break; cur = v; i++; continue; }
          if (v > 0 && v <= room(cur) && String(v).length < String(cur).length) { cur += v; i++; continue; }
          break;
        }
        out.push(String(total + (cur || 0)));
        continue;
      }
      out.push(t); i++;
    }
    return out.join(' ');
  }
  // Формы строки, которые сверяются: исходная и числовая (если отличается)
  function forms(s) {
    var b = base(s);
    var n = numeric(b);
    return n === b ? [b] : [b, n];
  }
  function norm(s) { return base(s); }

  // ---------- совпадение ----------
  function hit(t, a) { // t, a — нормализованные
    if (a.charAt(0) === '~') {
      var st = a.slice(1).trim();
      if (!st) return false;
      // число на краю основы не продолжается цифрами: «~ни 1» (из «~ни одно») не ловит «ни 10», «11 корня» — не «1 корня»
      var d0 = /^\d/.test(st), d1 = /\d$/.test(st);
      for (var p = t.indexOf(st); p !== -1; p = t.indexOf(st, p + 1)) {
        if (d0 && /\d/.test(t.charAt(p - 1))) continue;
        if (d1 && /\d/.test(t.charAt(p + st.length))) continue;
        return true;
      }
      return false;
    }
    if (!a) return false;
    if (t === a) return true;
    var tokens = t.split(' '), at = a.split(' ');
    for (var j = 0; j + at.length <= tokens.length; j++) {
      var same = true;
      for (var x = 0; x < at.length; x++) if (tokens[j + x] !== at[x]) { same = false; break; }
      // однобуквенные ответы — только в коротком сообщении
      if (same && (a.length > 1 || tokens.length <= 2)) return true;
    }
    return false;
  }
  function answerForms(a) {
    a = String(a);
    if (a.charAt(0) === '~') return forms(a.slice(1)).map(function (f) { return '~' + f; });
    return forms(a);
  }
  function matches(text, answers) {
    var ts = forms(text);
    if (!ts[0]) return false;
    for (var i = 0; i < (answers || []).length; i++) {
      var as = answerForms(answers[i]);
      for (var k = 0; k < ts.length; k++) for (var m = 0; m < as.length; m++) if (hit(ts[k], as[m])) return true;
    }
    return false;
  }

  // ---------- «почти» ----------
  function lev1(a, b) { // расстояние Левенштейна ≤ 1?
    if (a === b) return true;
    var la = a.length, lb = b.length;
    if (Math.abs(la - lb) > 1) return false;
    var i = 0, j = 0, diff = 0;
    while (i < la && j < lb) {
      if (a.charAt(i) === b.charAt(j)) { i++; j++; continue; }
      if (++diff > 1) return false;
      if (la > lb) i++; else if (lb > la) j++; else { i++; j++; }
    }
    return diff + (la - i) + (lb - j) <= 1;
  }
  function letters(s) { return (s.match(/\p{L}/gu) || []).length; }
  function nearOne(t, a) {
    var tokens = t.split(' ');
    var stem = a.charAt(0) === '~';
    var s = stem ? a.slice(1).trim() : a;
    if (!s || /\d/.test(s)) return false;          // числа и годы опечаткой не считаем: «1931» рядом с «1932» — другой ответ
    var at = s.split(' ');
    if (letters(s) >= (stem ? 6 : 5)) {
      for (var j = 0; j + at.length <= tokens.length; j++) {
        var w = tokens.slice(j, j + at.length).join(' ');
        if (stem) {
          for (var L = s.length - 1; L <= s.length + 1; L++) if (lev1(s, w.slice(0, L))) return true;
        } else if (lev1(s, w)) return true;
      }
    }
    // все слова составного ответа на месте и по порядку, но с лишними между ними
    if (!stem && at.length > 1) {
      var p = 0;
      for (var q = 0; q < tokens.length && p < at.length; q++) if (tokens[q] === at[p]) p++;
      if (p === at.length) return true;
    }
    return false;
  }
  function near(text, answers) {
    var t = base(text);
    if (!t) return false;
    for (var i = 0; i < (answers || []).length; i++) {
      var a = String(answers[i]);
      if (nearOne(t, a.charAt(0) === '~' ? '~' + base(a.slice(1)) : base(a))) return true;
    }
    return false;
  }

  // ---------- проверка шага ----------
  // answers → ответ из частей (all) → ответ на типичную ошибку (replies) → «половина верна» (all.missing) → «почти»
  function groupAnswers(g) { return Array.isArray(g) ? g : (g && g.answers) || []; }
  function checkText(st, text) {
    st = st || {};
    if (st.answers && matches(text, st.answers)) return { ok: true };
    var all = st.all || [];
    var hits = all.map(function (g) { return matches(text, groupAnswers(g)); });
    if (hits.length && hits.every(Boolean)) return { ok: true };
    var reps = st.replies || [];
    for (var i = 0; i < reps.length; i++) if (matches(text, reps[i].answers)) return { ok: false, reply: reps[i].text };
    if (hits.some(Boolean)) {
      for (var j = 0; j < hits.length; j++) if (!hits[j]) return { ok: false, reply: (all[j] && all[j].missing) || 'Половина ответа верна. Чего не хватает?' };
    }
    var pool = [].concat(st.answers || []);
    all.forEach(function (g) { pool = pool.concat(groupAnswers(g)); });
    if (near(text, pool)) return { ok: false, near: true, reply: NEAR_TEXT };
    return { ok: false };
  }

  return { norm: norm, forms: forms, numeric: numeric, matches: matches, near: near, lev1: lev1, checkText: checkText, NEAR_TEXT: NEAR_TEXT };
}));

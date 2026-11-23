/* Дворами — веб-плеер квеста.
   Читает quest.json из папки страницы (формат как у scripts/quest_bot.py) и повторяет логику бота:
   вступление → точки по порядку (дорога → «Мы на месте» → сцена → шаги) → улика → финал.
   ?field=1 — режим полевого теста: «что проверить», тайминг, ошибки, подсказки, заметки, отчёт.
   Прогресс — в localStorage (если доступен). Без внешних зависимостей.
   «Что-то не так?» на каждой точке: категория + текст → копия в буфер → игровой бот (docs/feedback-bot.md).
   Аналитика: window.dvoramiTrack из site/assets/analytics.js (если подключён и задан счётчик). */
(function () {
  'use strict';

  var QID = document.body.dataset.quest;
  var FIELD = /[?&]field=1(&|$)/.test(location.search);
  var KEY = 'dvorami:play:' + QID;
  var THEME_KEY = 'dvorami:theme';
  var app = document.getElementById('app');
  var sheet = document.getElementById('sheet');
  var Q = null;   // квест
  var S = null;   // состояние игрока
  var sheetKind = null;

  // Игровой бот — то же имя, что BOT в site/assets/site.js (без @). Пусто — ссылки ведут в канал.
  var BOT = 'dvorami_bot';
  var CHANNEL = 'https://t.me/dvorami_quest';
  // Ключи категорий совпадают с REPORT_CATS в scripts/feedback_bot.py
  var ISSUE_CATS = [['fact', 'Факт не тот'], ['riddle', 'Загадка не решается'], ['place', 'Место или объект не там'],
    ['hint', 'Подсказка не помогла'], ['tech', 'Техническая ошибка'], ['other', 'Другое']];
  function botLink(start) { return BOT ? 'https://t.me/' + BOT + '?start=' + start : CHANNEL; }

  // ---------- аналитика: события прохождения → цели Метрики ----------
  var GOALS = { start: 'quest_start', arrive: 'point_arrive', done: 'point_done', hint: 'hint_open',
    reveal: 'answer_reveal', skip: 'step_skip', finish: 'quest_finish', stop: 'quest_pause', resume: 'quest_resume' };
  function track(goal, params) {
    try { if (typeof window.dvoramiTrack === 'function') window.dvoramiTrack(goal, params || {}); } catch (e) { /* без аналитики */ }
  }

  // ---------- хранилище (может быть недоступно) ----------
  var store = {
    get: function (k) { try { return window.localStorage.getItem(k); } catch (e) { return null; } },
    set: function (k, v) { try { window.localStorage.setItem(k, v); } catch (e) { /* без сохранения */ } },
    del: function (k) { try { window.localStorage.removeItem(k); } catch (e) { /* ничего */ } }
  };

  // ---------- текст ----------
  var PICT = /\p{Extended_Pictographic}️?|️|‍/gu;
  function esc(s) {
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  // Текст из quest.json — HTML-разметка Telegram (<b>, <i>, <code>). Всё остальное экранируем.
  function inline(src) {
    var s = String(src || '').replace(PICT, '');
    s = s.replace(/&(?!(?:[a-z]+|#\d+);)/gi, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    s = s.replace(/&lt;(\/?)(b|i|u|s|code)&gt;/g, '<$1$2>');
    s = s.split('\n').map(function (l) { return l.replace(/^[ \t]+/, '').replace(/[ \t]{2,}/g, ' ').replace(/[ \t]+$/, ''); }).join('\n');
    return s.trim();
  }
  function prose(src) {
    var s = inline(src);
    if (!s) return '';
    return s.split(/\n{2,}/).map(function (p) { return '<p>' + p.replace(/\n/g, '<br>') + '</p>'; }).join('');
  }
  function plain(src) {
    return String(src || '').replace(PICT, '').replace(/<[^>]+>/g, '').replace(/&quot;/g, '"').replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>').replace(/&amp;/g, '&').replace(/[ \t]{2,}/g, ' ').trim();
  }
  // 👀 🔄 🧠 🧸 → типографские теги (BRAND.md, раздел 5): эмодзи в интерфейсе не показываем
  var TAGS = [['\u{1F440}', 'Смотри', 'smo'], ['\u{1F504}', 'Крути', 'krut'], ['\u{1F9E0}', 'Думай', 'dum'],
    ['\u{1F9F8}', 'По желанию', 'mal'], ['☕', 'Перерыв', 'brk'], ['\u{1F5C2}', 'Доска', 'brd']];
  function stepTag(text) {
    var t = String(text || '').replace(/^\s+/, '');
    for (var i = 0; i < TAGS.length; i++) {
      if (t.indexOf(TAGS[i][0]) === 0) {
        var rest = t.slice(TAGS[i][0].length).replace(/^️?\s*/, '');
        var m = rest.match(/^<b>([^<]*)<\/b>\s*/);
        if (m && m[1].replace(/[.:!\s]/g, '').toLowerCase() === TAGS[i][1].toLowerCase()) rest = rest.slice(m[0].length);
        return { tag: TAGS[i][1], cls: TAGS[i][2], text: rest };
      }
    }
    return { tag: null, cls: '', text: t };
  }

  // ---------- проверка ответа: как matches() в scripts/quest_bot.py ----------
  function norm(s) {
    s = String(s || '').toLowerCase().replace(/ё/g, 'е');
    s = s.replace(/→/g, ' ').replace(/->/g, ' ').replace(/-/g, ' ');
    s = s.replace(/[^\p{L}\p{N}\p{M}_\s]/gu, ' ');
    return s.replace(/\s+/g, ' ').trim();
  }
  function matches(text, answers) {
    var t = norm(text);
    if (!t) return false;
    var tokens = t.split(' ');
    for (var i = 0; i < (answers || []).length; i++) {
      var a = String(answers[i]);
      if (a.charAt(0) === '~') {
        var na0 = norm(a.slice(1));
        if (na0 && t.indexOf(na0) !== -1) return true;
        continue;
      }
      var na = norm(a);
      if (!na) continue;
      if (t === na) return true;
      var at = na.split(' ');
      for (var j = 0; j + at.length <= tokens.length; j++) {
        var same = true;
        for (var x = 0; x < at.length; x++) if (tokens[j + x] !== at[x]) { same = false; break; }
        if (same && (na.length > 1 || tokens.length <= 2)) return true;
      }
    }
    return false;
  }

  // ---------- время ----------
  function hms(ms) {
    if (!ms) return '—';
    try { return new Date(ms).toLocaleTimeString('ru-RU', { timeZone: 'Europe/Moscow', hour12: false }); }
    catch (e) { return new Date(ms).toTimeString().slice(0, 8); }
  }
  function hm(ms) { return ms ? hms(ms).slice(0, 5) : '—'; }
  function day(ms) {
    try { return new Date(ms).toLocaleDateString('ru-RU', { timeZone: 'Europe/Moscow' }); }
    catch (e) { return new Date(ms).toDateString(); }
  }
  function dur(ms) {
    if (ms == null || ms < 0) return '—';
    var m = Math.round(ms / 60000);
    return m >= 60 ? Math.floor(m / 60) + ' ч ' + String(m % 60).padStart(2, '0') + ' мин' : m + ' мин';
  }

  // ---------- состояние ----------
  function fresh() {
    return { v: 1, quest: QID, version: Q.version, phase: 'idle', p: 0, k: 0, hint: 0, res: [], board: [],
      events: [], t_start: null, t_end: null, sort: false, wrong: null, last: '', paused: false, field: FIELD };
  }
  function load() {
    var raw = store.get(KEY);
    if (raw) {
      try {
        var s = JSON.parse(raw);
        if (s && s.quest === QID && s.v === 1) {
          var n = Q.points.length;
          s.p = Math.max(0, Math.min(s.p | 0, n - 1));
          s.k = Math.max(0, Math.min(s.k | 0, Q.points[s.p].steps.length));
          if (s.phase === 'step' && s.k >= Q.points[s.p].steps.length) s.phase = 'point_done';
          s.res = s.res || []; s.board = s.board || []; s.events = s.events || [];
          if (FIELD) s.field = true;
          return s;
        }
      } catch (e) { /* испорченное сохранение — начинаем заново */ }
    }
    return fresh();
  }
  function save() { store.set(KEY, JSON.stringify(S)); }
  function pt() { return Q.points[S.p]; }
  function curN() { return (S.phase === 'walk' || S.phase === 'step' || S.phase === 'point_done') ? pt().n : null; }
  function log(kind, extra) {
    var e = { t: Date.now(), kind: kind, point: curN() };
    if (extra) for (var k in extra) e[k] = extra[k];
    S.events.push(e);
    if (GOALS[kind]) {
      var gp = { quest: QID, field: S.field ? 1 : 0 };
      if (e.point) gp.point = e.point;
      if (e.step) gp.step = e.step;
      if (e.level) gp.level = e.level;
      if (kind === 'finish' && S.t_start) gp.minutes = Math.round((S.t_end - S.t_start) / 60000);
      track(GOALS[kind], gp);
    }
  }

  // ---------- ход квеста ----------
  function start() {
    S = fresh();
    S.phase = 'intro';
    S.t_start = Date.now();
    log('start');
    commit('top');
  }
  function showWalk() {
    S.phase = 'walk'; S.k = 0; S.hint = 0; S.res = []; S.wrong = null; S.last = '';
    log('walk');
    commit('top');
  }
  function arrive() {
    S.phase = 'step'; S.k = 0; S.hint = 0; S.res = []; S.wrong = null; S.last = '';
    log('arrive');
    commit('top');
  }
  function step() { return pt().steps[S.k]; }
  function resolve(r) {
    S.res[S.k] = r;
    S.k += 1; S.hint = 0; S.wrong = null; S.last = '';
    if (S.k >= pt().steps.length) finishPoint();
    commit('active');
  }
  function finishPoint() {
    var p = pt();
    if (p.clue) S.board.push(Object.assign({ n: p.n }, p.clue));
    if (p.steps.some(function (s) { return s.type === 'board'; })) S.sort = true;
    log('done');
    S.phase = 'point_done';
  }
  function nextPoint() {
    if (S.p + 1 >= Q.points.length) return finishQuest();
    S.p += 1;
    showWalk();
  }
  function finishQuest() {
    S.phase = 'done';
    S.t_end = Date.now();
    log('finish');
    commit('top');
  }
  function answer(text) {
    var st = step();
    text = String(text || '').trim();
    if (!text) return;
    if (st.type === 'free') {
      log('free', { step: S.k + 1, text: text });
      return resolve({ st: 'free', text: text });
    }
    if (matches(text, st.answers)) {
      log('correct', { step: S.k + 1, text: text, hints: S.hint });
      return resolve({ st: 'ok', text: text });
    }
    log('wrong', { step: S.k + 1, text: text });
    S.wrong = text; S.last = text;
    commit('input');
  }
  function hint(level) {
    var hints = step().hints || [];
    if (!hints.length || level !== S.hint || level >= hints.length) return;
    S.hint = level + 1;
    var isAnswer = S.hint >= hints.length;
    log(isAnswer ? 'reveal' : 'hint', { step: S.k + 1, level: S.hint });
    commit('active');
  }
  function reveal() {
    var hints = step().hints || [];
    resolve({ st: 'revealed', text: hints[hints.length - 1] || '' });
  }
  function skip() {
    log('skip', { step: S.k + 1 });
    resolve({ st: 'skipped' });
  }

  // ---------- отрисовка ----------
  var SHAPES = [
    '<svg class="pl-shape" viewBox="0 0 64 64" aria-hidden="true"><circle cx="32" cy="32" r="30" fill="#E1251B"/></svg>',
    '<svg class="pl-shape" viewBox="0 0 64 64" aria-hidden="true"><path d="M32 2l30 58H2z" fill="#E1251B"/></svg>',
    '<svg class="pl-shape" viewBox="0 0 64 64" aria-hidden="true"><rect x="13" y="13" width="38" height="38" transform="rotate(45 32 32)" fill="#E1251B"/></svg>'
  ];
  function head(p, sub) {
    return '<header class="pl-head" id="top">' + SHAPES[(p.n - 1) % 3] +
      '<div class="pl-num">Точка ' + String(p.n).padStart(2, '0') + ' из ' + Q.points.length + (sub ? ' · ' + sub : '') + '</div>' +
      '<h1>' + esc(plain(p.title)) + '</h1><p class="pl-place">' + esc(plain(p.place)) + '</p></header>';
  }
  function checkBlock(p, collapsed) {
    if (!S.field || !p.check || !p.check.length) return '';
    var items = '<ul>' + p.check.map(function (c) { return '<li>' + inline(c) + '</li>'; }).join('') + '</ul>' +
      '<p class="pl-small" style="margin-top:10px">Фотографии сохраняйте в галерею телефона. Замечания записывайте кнопкой «Заметка» внизу — они попадут в отчёт к точке ' + p.n + '.</p>';
    if (collapsed) return '<details class="pl-card pl-field"><summary>Полевой тест: что проверить</summary>' + items + '</details>';
    return '<section class="pl-card pl-field"><span class="pl-label">Полевой тест: что проверить</span>' + items + '</section>';
  }
  function clueCard(c, isNew) {
    return '<div class="pl-card' + (isNew ? ' pl-new' : '') + '"><div class="pl-clue">' +
      '<div class="pl-letter" aria-label="Буква ' + esc(c.letter) + ', ' + esc(c.year) + ' год">' + esc(c.letter) + '<small>' + esc(c.year) + '</small></div>' +
      '<div><div class="who">' + esc(plain(c.who)) + '</div><p class="says">«' + inline(c.says) + '»</p></div></div></div>';
  }
  function doneStep(st, r, i) {
    var t = stepTag(st.text);
    var stamp = '';
    if (r && r.st === 'ok') stamp = '<span class="pl-stamp">Верно · ' + esc(r.text) + '</span>';
    else if (r && r.st === 'revealed') stamp = '<span class="pl-stamp pl-stamp--ans">Ответ · ' + esc(plain(r.text)) + '</span>';
    else if (r && r.st === 'free') stamp = '<span class="pl-stamp">' + esc(r.text) + '</span>';
    else if (r && r.st === 'skipped') stamp = '<span class="pl-stamp pl-stamp--ans">Пропущено</span>';
    var ok = (r && r.st !== 'skipped' && st.ok) ? '<p class="pl-ok">' + inline(st.ok) + '</p>' : '';
    return '<section class="pl-card pl-step pl-done' + (t.cls === 'mal' ? ' pl-step--mal' : '') + '" data-step="' + i + '">' +
      (t.tag ? '<span class="pl-tag pl-tag--' + t.cls + '">' + t.tag + '</span>' : '') +
      '<div class="pl-prose">' + prose(t.text) + '</div>' + stamp + ok + '</section>';
  }
  function ladderLabels(n) {
    if (n === 3) return [['Намёк', 'куда смотреть'], ['Почти решение', 'останется один шаг'], ['Ответ', 'улика всё равно ваша']];
    var out = [];
    for (var i = 0; i < n; i++) out.push(i === n - 1 ? ['Ответ', 'улика всё равно ваша'] : ['Подсказка ' + (i + 1), '']);
    return out;
  }
  function activeStep(st) {
    var t = stepTag(st.text);
    var h = '<section class="pl-card pl-step is-active' + (t.cls === 'mal' ? ' pl-step--mal' : '') + '" id="active" data-step="' + S.k + '">' +
      (t.tag ? '<span class="pl-tag pl-tag--' + t.cls + '">' + t.tag + '</span>' : '') +
      '<div class="pl-prose">' + prose(t.text) + '</div>';
    if (st.type === 'board') h += '<div style="margin-top:16px">' + boardHtml(false) + '</div>';
    if (st.type === 'info' || st.type === 'board') {
      h += '<div class="pl-actions"><button class="pl-btn" type="button" data-act="next">Дальше</button></div>';
      return h + '</section>';
    }
    var hints = st.hints || [];
    var revealed = hints.length && S.hint >= hints.length;
    h += '<form class="pl-form" data-form="answer" autocomplete="off">' +
      '<label class="visually-hidden" for="ans">Ваш ответ</label>' +
      '<input class="pl-input" id="ans" name="ans" type="text" inputmode="text" autocapitalize="off" autocorrect="off" spellcheck="false" enterkeyhint="send" placeholder="' + (st.type === 'free' ? 'Ваш ответ' : 'Ответ в одно-два слова') + '" value="' + esc(S.last) + '">' +
      '<button class="pl-btn" type="submit">Ответить</button></form>';
    if (S.wrong) h += '<p class="pl-wrong" role="status" style="margin-top:12px">«' + esc(S.wrong) + '» — не подходит. Попробуйте ещё раз' + (hints.length ? ' или откройте подсказку.' : '.') + '</p>';
    if (hints.length) {
      var labels = ladderLabels(hints.length);
      h += '<div class="pl-ladder" style="--n:' + hints.length + '">';
      for (var i = 0; i < hints.length; i++) {
        var used = i < S.hint, avail = i === S.hint;
        h += '<button type="button" class="pl-rung' + (used ? ' used' : '') + '" data-act="hint" data-level="' + i + '"' + (avail ? '' : ' disabled') + '>' +
          '<b>' + labels[i][0] + '</b>' + (labels[i][1] ? '<small>' + labels[i][1] + '</small>' : '') + '</button>';
      }
      h += '</div>';
      for (var j = 0; j < Math.min(S.hint, hints.length); j++) {
        h += '<div class="pl-hint"><span class="pl-label">' + labels[j][0] + '</span>' + inline(hints[j]) + '</div>';
      }
      if (revealed) h += '<div class="pl-actions"><button class="pl-btn pl-btn--ghost" type="button" data-act="reveal">Дальше</button></div>';
    }
    if (st.optional || st.type === 'free' || !hints.length) h += '<button type="button" class="pl-skip" data-act="skip">Пропустить</button>';
    return h + '</section>';
  }
  function issueBtn() {
    return '<button type="button" class="pl-issue" data-act="issue">Что-то не так? Напишите нам</button>';
  }
  function boardHtml(inSheet) {
    var b = S.board.slice();
    if (!b.length) return '<p class="pl-empty">Доска улик пока пуста. Первая улика — на точке 1.</p>';
    var byYear = inSheet && S.sort && sortMode === 'year';
    if (byYear) b.sort(function (a, c) { return a.year - c.year; });
    var h = '';
    if (inSheet && S.sort) {
      h += '<div class="pl-seg" role="group" aria-label="Порядок улик"><button type="button" data-act="sort" data-mode="found" aria-pressed="' + !byYear + '">Как нашли</button>' +
        '<button type="button" data-act="sort" data-mode="year" aria-pressed="' + byYear + '">По годам</button></div>';
    }
    h += '<div class="pl-letters" aria-label="Буквы">' + b.map(function (c) { return '<span>' + esc(c.letter) + '</span>'; }).join('') + '</div>';
    if (inSheet) h += '<div class="pl-board">' + b.map(function (c) { return clueCard(c, false); }).join('') + '</div>';
    else h += '<p class="pl-small" style="margin-top:8px">' + b.map(function (c) { return esc(c.year) + ' · ' + esc(c.letter); }).join(' &nbsp; ') + '</p>';
    return h;
  }
  var sortMode = 'found';

  function render() {
    var n = Q.points.length;
    var h = '';
    var tabs = document.getElementById('tabs');
    tabs.hidden = S.phase === 'idle';
    document.getElementById('badge').textContent = S.board.length ? String(S.board.length) : '';
    var shown = S.phase === 'walk' || S.phase === 'step' || S.phase === 'point_done' ? pt().n : (S.phase === 'done' ? n : 0);
    document.getElementById('count').textContent = shown ? String(shown).padStart(2, '0') + '/' + n : '';
    var prog = '';
    for (var i = 0; i < n; i++) {
      var done = S.phase === 'done' || i < S.p || (i === S.p && S.phase === 'point_done');
      var cur = !done && i === S.p && (S.phase === 'walk' || S.phase === 'step');
      prog += '<i class="' + (done ? 'done' : cur ? 'cur' : '') + '"></i>';
    }
    document.getElementById('progress').innerHTML = S.phase === 'idle' ? '' : prog;

    if (S.paused) {
      h = '<header class="pl-head" id="top">' + SHAPES[2] + '<div class="pl-num">Пауза</div><h1>Дело отложено</h1>' +
        '<p class="pl-place">Прогресс сохранён на этом телефоне' + (S.phase === 'done' ? '' : ': точка ' + pt().n + ' из ' + n) + '.</p></header>' +
        '<div class="pl-actions"><button class="pl-btn" type="button" data-act="resume">Продолжить</button>' +
        (S.field ? '<button class="pl-btn pl-btn--ghost" type="button" data-act="report">Отправить отчёт</button>' : '') +
        '<button class="pl-btn pl-btn--ghost" type="button" data-act="restart">Начать заново</button></div>';
    } else if (S.phase === 'idle') {
      h = '<header class="pl-head pl-cover" id="top">' + SHAPES[0] + '<div class="pl-num">' + esc(Q.district || '') + ' · Дело № 1</div>' +
        '<h1>' + esc(plain(Q.title)) + '</h1><p class="pl-place">' + esc(plain(Q.summary || '')) + '</p></header>' +
        (S.field ? '<section class="pl-card pl-field"><span class="pl-label">Режим полевого теста</span><p class="pl-small">На каждой точке — список «что проверить». Время, ошибки, подсказки и заметки сохраняются сами. В конце, а при желании и раньше («Ещё» → «Отправить отчёт»), отправьте отчёт одним сообщением в Telegram.</p></section>' : '') +
        '<div class="pl-actions"><button class="pl-btn" type="button" data-act="start">Открыть дело</button></div>' +
        '<p class="pl-small">Прогресс сохраняется на этом телефоне: можно закрыть страницу и вернуться.</p>';
    } else if (S.phase === 'intro') {
      h = Q.intro.map(function (m, i) {
        return '<section class="pl-card' + (i === Q.intro.length - 1 ? ' pl-card--paper' : '') + '"' + (i === 0 ? ' id="top"' : '') + '><div class="pl-prose">' + prose(m) + '</div></section>';
      }).join('') +
        '<div class="pl-actions"><button class="pl-btn" type="button" data-act="go">К точке 1</button></div>';
    } else if (S.phase === 'walk') {
      var p = pt();
      var link = 'https://yandex.ru/maps/?pt=' + p.lon + ',' + p.lat + '&z=18&l=map';
      h = head(p) +
        '<section class="pl-card"><span class="pl-label">Как дойти</span>' +
        (p.walk_m ? '<div class="pl-dist">≈ ' + p.walk_m + ' м</div>' : '') +
        '<div class="pl-prose">' + prose(p.walk) + '</div>' +
        '<a class="pl-maplink" href="' + esc(link) + '" target="_blank" rel="noopener" data-track="map_open" data-track-point="' + p.n + '">Открыть в Яндекс Картах</a></section>' +
        checkBlock(p, false) +
        '<div class="pl-actions"><button class="pl-btn" type="button" data-act="here">Мы на месте</button></div>' + issueBtn();
    } else if (S.phase === 'step') {
      var p2 = pt();
      h = head(p2) + '<section class="pl-card"><span class="pl-label">Сцена</span><div class="pl-prose">' + prose(p2.scene) + '</div></section>';
      for (var k = 0; k < S.k; k++) h += doneStep(p2.steps[k], S.res[k], k);
      h += activeStep(p2.steps[S.k]);
      h += checkBlock(p2, true);
      h += issueBtn();
    } else if (S.phase === 'point_done') {
      var p3 = pt();
      var last = S.p + 1 >= n;
      h = head(p3, 'пройдена');
      if (p3.clue) h += '<span class="pl-label" id="active" style="margin-top:16px">Улика № ' + S.board.length + '</span>' + clueCard(p3.clue, true);
      if (p3.outro) h += '<section class="pl-card"' + (p3.clue ? '' : ' id="active"') + '><div class="pl-prose">' + prose(p3.outro) + '</div></section>';
      h += '<div class="pl-actions"><button class="pl-btn" type="button" data-act="nextpoint">' + (last ? 'К финалу' : 'К точке ' + (S.p + 2)) + '</button></div>' + issueBtn();
    } else if (S.phase === 'done') {
      h = '<header class="pl-head" id="top">' + SHAPES[1] + '<div class="pl-num">Финал</div><h1>Дело закрыто</h1></header>' +
        (Q.finale || []).map(function (m) { return '<section class="pl-card"><div class="pl-prose">' + prose(m) + '</div></section>'; }).join('') +
        '<section class="pl-card"><span class="pl-label">Время прохождения</span><div class="pl-dist" style="font-size:28px">' + dur((S.t_end || Date.now()) - S.t_start) + '</div></section>' +
        (S.field ? '<section class="pl-card pl-field"><span class="pl-label">Полевой тест окончен</span><p class="pl-small">Напишите заметку с впечатлениями: что понравилось больше всего, где застряли, где было скучно. Потом нажмите «Отправить отчёт» и перешлите его в Telegram.</p>' +
          '<div class="pl-actions"><button class="pl-btn pl-btn--ghost" type="button" data-act="note">Заметка</button><button class="pl-btn" type="button" data-act="report">Отправить отчёт</button></div></section>' : '') +
        '<section class="pl-card"><span class="pl-label">Как вам дело?</span><p class="pl-small">Минута в Telegram: оценка и пара слов. Честный отзыв помогает нам больше всего — особенно если где-то было непонятно.</p>' +
          '<div class="pl-actions"><a class="pl-btn" href="' + esc(botLink('review-' + QID)) + '" target="_blank" rel="noopener" data-track="review_click" data-track-quest="' + esc(QID) + '">Оценить квест</a></div></section>' +
        '<div class="pl-actions"><button class="pl-btn pl-btn--ghost" type="button" data-act="restart">Начать заново</button></div>' + issueBtn();
    }
    app.innerHTML = h;
    var sun = document.documentElement.dataset.theme === 'sun';
    var sb = document.querySelector('.pl-sun'); sb.setAttribute('aria-pressed', String(sun)); sb.textContent = sun ? 'Тёмная тема' : 'Светлая тема';
  }

  function commit(focus) {
    save();
    render();
    if (focus === 'top') {
      window.scrollTo(0, 0);
    } else if (focus === 'active') {
      var el = document.getElementById('active');
      if (el) el.scrollIntoView({ block: 'start', behavior: 'smooth' });
    } else if (focus === 'input') {
      var inp = document.getElementById('ans');
      if (inp) { inp.focus(); inp.select(); }
    }
  }

  // ---------- шторки ----------
  function openSheet(kind) {
    sheetKind = kind;
    var title = '', body = '';
    if (kind === 'board') {
      title = 'Доска улик';
      body = boardHtml(true);
    } else if (kind === 'note') {
      var n = curN();
      title = 'Заметка';
      var notes = S.events.filter(function (e) { return e.kind === 'note' && e.point === n; });
      body = '<form data-form="note"><label class="pl-small" for="note-text">' + (n ? 'Заметка сохранится к точке ' + n + '.' : 'Заметка попадёт в общий список.') +
        (S.field ? ' Она войдёт в отчёт полевого теста.' : '') + '</label>' +
        '<textarea class="pl-textarea" id="note-text" name="note" style="margin-top:8px" placeholder="Что заметили, где застряли, что поправить"></textarea>' +
        '<div class="pl-actions"><button class="pl-btn" type="submit">Сохранить</button></div></form>' +
        (notes.length ? '<span class="pl-label" style="margin-top:20px">Уже записано' + (n ? ' к точке ' + n : '') + '</span><ul class="pl-notes">' +
          notes.map(function (e) { return '<li><time>' + hm(e.t) + '</time>' + esc(e.text) + '</li>'; }).join('') + '</ul>' : '');
    } else if (kind === 'menu') {
      title = 'Ещё';
      var sun = document.documentElement.dataset.theme === 'sun';
      body = '<div class="pl-menu">' +
        '<button class="pl-btn pl-btn--ghost" type="button" data-act="theme">' + (sun ? 'Тёмная тема' : 'Светлая тема — для яркого солнца') + '</button>' +
        (S.field ? '<button class="pl-btn pl-btn--ghost" type="button" data-act="report">Отправить отчёт</button>' : '') +
        '<button class="pl-btn pl-btn--ghost" type="button" data-act="issue">Что-то не так?</button>' +
        (S.phase !== 'idle' && S.phase !== 'done' ? '<button class="pl-btn pl-btn--ghost" type="button" data-act="stop">Закончить</button>' : '') +
        '<button class="pl-btn pl-btn--ghost" type="button" data-act="restart">Начать заново</button></div>' +
        '<p class="pl-small" style="margin-top:16px">Прогресс хранится только на этом телефоне и в этом браузере.</p>';
    } else if (kind === 'issue') {
      title = 'Что-то не так?';
      var w = issueWhere();
      body = '<p class="pl-small">' + (w.point ? 'Точка ' + w.point + ' «' + esc(plain(pt().title)) + '»' + (w.step ? ', шаг ' + w.step : '') : 'Квест «' + esc(plain(Q.title)) + '»') +
        ' — это мы подставим сами. Квест не прервётся.</p>' +
        '<fieldset class="pl-cats"><legend class="pl-label">Что случилось</legend>' +
        ISSUE_CATS.map(function (c) {
          return '<label class="pl-cat"><input type="radio" name="issue-cat" value="' + c[0] + '"' + (issueCat === c[0] ? ' checked' : '') + '><span>' + c[1] + '</span></label>';
        }).join('') + '</fieldset>' +
        '<label class="pl-label" for="issue-text" style="margin-top:16px">Что именно (по желанию)</label>' +
        '<textarea class="pl-textarea" id="issue-text" placeholder="Например: табличка висит на соседнем доме">' + esc(issueDraft) + '</textarea>' +
        '<div class="pl-actions"><a class="pl-btn" id="issue-send" href="' + esc(CHANNEL) + '" target="_blank" rel="noopener" data-issue-send data-track="issue_send" data-track-quest="' + esc(QID) + '"' +
        (w.point ? ' data-track-point="' + w.point + '"' : '') + (issueCat ? ' data-track-category="' + issueCat + '"' : '') + '>Отправить в Telegram</a></div>' +
        '<p class="pl-small">Текст скопируется сам: в Telegram ' + (BOT ? 'нажмите «Запустить», затем ' : '') + 'вставьте его в чат (долгое нажатие → «Вставить») и отправьте.</p>';
    } else if (kind === 'issue_sent') {
      title = 'Почти готово';
      body = '<p>Текст скопирован. В Telegram ' + (BOT ? 'нажмите «Запустить», ' : '') + 'вставьте его в чат и отправьте — мы получим сразу с номером точки.</p>' +
        '<p class="pl-small">Telegram не открылся или текст не вставляется?</p>' +
        '<div class="pl-row"><button class="pl-btn pl-btn--ghost pl-btn--sm" type="button" data-act="issuecopy">Скопировать снова</button>' +
        '<a class="pl-btn pl-btn--ghost pl-btn--sm" href="' + esc(issueLink()) + '" target="_blank" rel="noopener">Открыть Telegram</a></div>' +
        '<div class="pl-actions"><button class="pl-btn" type="button" data-act="close">Вернуться к квесту</button></div>';
    } else if (kind === 'report') {
      title = 'Отчёт';
      body = '<p class="pl-small">Нажмите «Отправить» и выберите Telegram. Если не получается, нажмите «Скопировать» и вставьте текст в чат с ботом.</p>' +
        '<div class="pl-actions"><button class="pl-btn" type="button" data-act="share">Отправить</button>' +
        '<div class="pl-row"><button class="pl-btn pl-btn--ghost pl-btn--sm" type="button" data-act="copy">Скопировать</button>' +
        '<button class="pl-btn pl-btn--ghost pl-btn--sm" type="button" data-act="download">Скачать .txt</button></div></div>' +
        '<pre class="pl-log" id="log-text">' + esc(report()) + '</pre>';
    }
    document.getElementById('sheet-title').textContent = title;
    document.getElementById('sheet-body').innerHTML = body;
    if (!sheet.open) {
      if (typeof sheet.showModal === 'function') sheet.showModal(); else sheet.setAttribute('open', '');
    }
    var ta = document.getElementById('note-text');
    if (ta) ta.focus();
  }

  // ---------- «Что-то не так?» ----------
  var issueCat = '', issueDraft = '', issueLast = '';
  function issueWhere() {
    var n = curN();
    return { point: n, step: n && S.phase === 'step' ? S.k + 1 : null };
  }
  function issueName(key) { for (var i = 0; i < ISSUE_CATS.length; i++) if (ISSUE_CATS[i][0] === key) return ISSUE_CATS[i][1]; return ''; }
  function issueLink() {
    var w = issueWhere();
    return botLink(['report', QID, w.point || 0, w.step || 0, issueCat || 'other'].join('-'));
  }
  function issueText(text) {
    var w = issueWhere();
    var where = w.point ? 'Точка ' + w.point + ' «' + plain(pt().title) + '»' + (w.step ? ', шаг ' + w.step : '') : 'Не на точке (' + S.phase + ')';
    return 'Что-то не так · ' + plain(Q.title) + '\n' +
      'Категория: ' + issueName(issueCat) + '\n' + where + '\n' +
      (text ? 'Что именно: ' + text + '\n' : '') +
      '[report ' + QID + '/' + (w.point || 0) + '/' + (w.step || 0) + '/' + issueCat + ']';
  }
  function closeSheet() {
    sheetKind = null;
    if (typeof sheet.close === 'function' && sheet.open) sheet.close(); else sheet.removeAttribute('open');
  }
  function toast(msg) {
    var t = document.getElementById('toast');
    // Открытая шторка (dialog) лежит в верхнем слое над всей страницей — тост переносим внутрь неё, иначе его не видно
    var host = sheet.open ? sheet : document.body;
    if (t.parentNode !== host) host.appendChild(t);
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(toast.tm);
    toast.tm = setTimeout(function () { t.classList.remove('show'); }, 2400);
  }

  // ---------- отчёт полевого теста ----------
  function report() {
    var ev = S.events;
    var out = [];
    var started = S.t_start;
    out.push('ПОЛЕВОЙ ТЕСТ · ' + plain(Q.title) + ' (' + QID + ', версия ' + (S.version || Q.version) + ')');
    out.push('Дата: ' + (started ? day(started) : '—') + '. Начало: ' + hms(started) + '. Конец: ' + (S.t_end ? hms(S.t_end) : 'не закончен') +
      '. Длительность: ' + (started ? dur((S.t_end || Date.now()) - started) : '—') + '.');
    if (S.version && S.version !== Q.version) out.push('Внимание: начато на версии ' + S.version + ', сейчас загружена ' + Q.version + '.');
    var status = S.phase === 'done' ? 'пройден до финала' : (S.phase === 'idle' ? 'не начат' : 'сейчас точка ' + pt().n + ' из ' + Q.points.length);
    out.push('Статус: ' + status + '.');
    out.push('');
    out.push('ТАЙМИНГ ПО ТОЧКАМ (вышли → на месте → закончили)');
    var totals = { hint: 0, wrong: 0, reveal: 0, skip: 0 };
    Q.points.forEach(function (p) {
      var pe = ev.filter(function (e) { return e.point === p.n; });
      var first = function (k) { for (var i = 0; i < pe.length; i++) if (pe[i].kind === k) return pe[i].t; return null; };
      var lastOf = function (k) { var r = null; pe.forEach(function (e) { if (e.kind === k) r = e.t; }); return r; };
      var w = first('walk'), a = first('arrive'), d = lastOf('done');
      if (!w && !a) return;
      var c = function (k) { return pe.filter(function (e) { return e.kind === k; }).length; };
      var hints = c('hint'), wrong = c('wrong'), rev = c('reveal'), sk = c('skip');
      totals.hint += hints; totals.wrong += wrong; totals.reveal += rev; totals.skip += sk;
      out.push(p.n + '. ' + plain(p.title));
      out.push('   ' + hm(w) + ' → ' + hm(a) + ' → ' + hm(d) +
        ' · дорога ' + (w && a ? dur(a - w) : '—') + ' · на точке ' + (a && d ? dur(d - a) : (a ? 'идёт' : '—')));
      out.push('   ошибок ' + wrong + ' · подсказок ' + hints + ' · ответ показан ' + rev + ' · пропущено ' + sk);
    });
    out.push('Итого: ошибок ' + totals.wrong + ', подсказок ' + totals.hint + ', ответ показан ' + totals.reveal + ', пропущено ' + totals.skip + '.');
    out.push('');
    out.push('ОШИБКИ И ПОДСКАЗКИ');
    var stuck = ev.filter(function (e) { return e.kind === 'wrong' || e.kind === 'hint' || e.kind === 'reveal' || e.kind === 'skip'; });
    if (!stuck.length) out.push('— нет');
    stuck.forEach(function (e) {
      var what = e.kind === 'wrong' ? 'неверно: «' + e.text + '»' : e.kind === 'hint' ? 'подсказка ' + e.level :
        e.kind === 'reveal' ? 'показан ответ' : 'пропуск';
      out.push('- ' + hm(e.t) + ' · т.' + e.point + ' шаг ' + e.step + ': ' + what);
    });
    out.push('');
    out.push('ЗАМЕТКИ');
    var notes = ev.filter(function (e) { return e.kind === 'note'; });
    if (!notes.length) out.push('— нет');
    notes.forEach(function (e) { out.push('- ' + hm(e.t) + ' · ' + (e.point ? 'т.' + e.point : 'общее') + ': ' + e.text); });
    out.push('');
    out.push('ОТВЕТЫ ИГРОКОВ');
    var ans = ev.filter(function (e) { return e.kind === 'correct' || e.kind === 'free'; });
    if (!ans.length) out.push('— нет');
    ans.forEach(function (e) {
      out.push('- ' + hm(e.t) + ' · т.' + e.point + ' шаг ' + e.step + ': ' + (e.kind === 'free' ? 'свободный ответ' : 'верно') + ' «' + e.text + '»' +
        (e.hints ? ' (после ' + e.hints + ' подск.)' : ''));
    });
    var issues = ev.filter(function (e) { return e.kind === 'issue'; });
    if (issues.length) {
      out.push('');
      out.push('«ЧТО-ТО НЕ ТАК»');
      issues.forEach(function (e) {
        out.push('- ' + hm(e.t) + ' · ' + (e.point ? 'т.' + e.point + (e.step ? ' шаг ' + e.step : '') : 'вне точки') + ' · ' + issueName(e.category) + (e.text ? ': ' + e.text : ''));
      });
    }
    var pauses = ev.filter(function (e) { return e.kind === 'stop' || e.kind === 'resume' || e.kind === 'reload'; });
    if (pauses.length) {
      out.push('');
      out.push('ПАУЗЫ И ПЕРЕЗАГРУЗКИ');
      pauses.forEach(function (e) {
        out.push('- ' + hm(e.t) + ' · ' + ({ stop: 'закончили (пауза)', resume: 'продолжили', reload: 'страница открыта заново' })[e.kind] + (e.point ? ' · т.' + e.point : ''));
      });
    }
    out.push('');
    out.push('Браузер: ' + navigator.userAgent.replace(/\s+/g, ' ').slice(0, 160));
    return out.join('\n');
  }
  function reportName() {
    var d = S.t_start ? new Date(S.t_start) : new Date();
    return 'dvorami-' + QID + '-field-' + d.toISOString().slice(0, 10) + '.txt';
  }
  function copyText(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      return navigator.clipboard.writeText(text).then(function () { return true; }, function () { return legacyCopy(text); });
    }
    return Promise.resolve(legacyCopy(text));
  }
  function legacyCopy(text) {
    try {
      var ta = document.createElement('textarea');
      ta.value = text; ta.setAttribute('readonly', ''); ta.style.position = 'fixed'; ta.style.opacity = '0';
      (sheet.open ? sheet : document.body).appendChild(ta);
      ta.select();
      var ok = document.execCommand('copy');
      ta.remove();
      return ok;
    } catch (e) { return false; }
  }
  function download(text) {
    try {
      var blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
      var a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = reportName();
      document.body.appendChild(a);
      a.click();
      setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
      return true;
    } catch (e) { return false; }
  }
  function share() {
    var text = report();
    if (navigator.share) {
      navigator.share({ title: 'Полевой тест: ' + plain(Q.title), text: text }).then(function () {
        log('report'); save();
      }, function (err) {
        if (err && err.name === 'AbortError') return;
        fallbackShare(text);
      });
    } else {
      fallbackShare(text);
    }
  }
  function fallbackShare(text) {
    copyText(text).then(function (ok) {
      if (ok) toast('Отчёт скопирован — вставьте в Telegram');
      else if (download(text)) toast('Отчёт скачан файлом');
      else toast('Не получилось — выделите текст отчёта вручную');
    });
  }

  // ---------- события ----------
  var ACT = {
    start: start,
    go: showWalk,
    here: arrive,
    next: function () { resolve({ st: 'info' }); },
    hint: function (el) { hint(parseInt(el.dataset.level, 10)); },
    reveal: reveal,
    skip: skip,
    nextpoint: nextPoint,
    board: function () { openSheet('board'); },
    note: function () { openSheet('note'); },
    menu: function () { openSheet('menu'); },
    report: function () { openSheet('report'); },
    issue: function () { issueCat = ''; issueDraft = ''; openSheet('issue'); },
    issuecopy: function () { copyText(issueLast).then(function (ok) { toast(ok ? 'Скопировано — вставьте в Telegram' : 'Не получилось скопировать'); }); },
    close: closeSheet,
    sort: function (el) { sortMode = el.dataset.mode; openSheet('board'); },
    repeat: function () {
      closeSheet();
      var el = document.getElementById('active') || document.getElementById('top');
      if (!el) return;
      el.scrollIntoView({ block: 'start', behavior: 'smooth' });
      el.classList.remove('pulse'); void el.offsetWidth; el.classList.add('pulse');
    },
    theme: function () {
      var r = document.documentElement;
      var sun = r.dataset.theme !== 'sun';
      if (sun) r.dataset.theme = 'sun'; else delete r.dataset.theme;
      store.set(THEME_KEY, sun ? 'sun' : 'dark');
      var meta = document.querySelector('meta[name="theme-color"]');
      if (meta) meta.setAttribute('content', sun ? '#F4F1EA' : '#141414');
      render();
      if (sheetKind === 'menu') openSheet('menu');
    },
    stop: function () {
      if (!window.confirm('Закончить прохождение? Прогресс сохранится — можно продолжить позже.')) return;
      log('stop'); S.paused = true; closeSheet(); commit('top');
    },
    resume: function () { S.paused = false; log('resume'); commit('top'); },
    restart: function () {
      if (S.phase !== 'idle' && !window.confirm('Начать квест заново? Прогресс, улики и записи полевого теста будут стёрты.')) return;
      closeSheet(); start();
    },
    share: share,
    copy: function () { copyText(report()).then(function (ok) { toast(ok ? 'Скопировано' : 'Не получилось скопировать'); }); },
    download: function () { toast(download(report()) ? 'Файл сохранён' : 'Не получилось сохранить файл'); }
  };
  document.addEventListener('click', function (e) {
    var el = e.target.closest('[data-act]');
    if (!el || !Q) return;
    var fn = ACT[el.dataset.act];
    if (fn) { e.preventDefault(); fn(el); }
  });
  document.addEventListener('submit', function (e) {
    var f = e.target;
    if (!Q) return;
    if (f.dataset.form === 'answer') {
      e.preventDefault();
      answer(f.elements.ans.value);
    } else if (f.dataset.form === 'note') {
      e.preventDefault();
      var text = f.elements.note.value.trim();
      if (!text) return;
      log('note', { text: text });
      save();
      closeSheet();
      toast(curN() ? 'Заметка сохранена к точке ' + curN() : 'Заметка сохранена');
    }
  });
  sheet.addEventListener('change', function (e) {
    if (e.target.name !== 'issue-cat') return;
    issueCat = e.target.value;
    var a = document.getElementById('issue-send');
    if (a) a.setAttribute('data-track-category', issueCat);
  });
  sheet.addEventListener('input', function (e) { if (e.target.id === 'issue-text') issueDraft = e.target.value; });
  // Ссылка «Отправить в Telegram»: не перехватываем переход, только копируем текст и меняем адрес до перехода
  sheet.addEventListener('click', function (e) {
    var a = e.target.closest('[data-issue-send]');
    if (!a || !Q) return;
    if (!issueCat) {
      e.preventDefault();
      toast('Выберите, что случилось');
      var first = sheet.querySelector('input[name="issue-cat"]');
      if (first) first.focus();
      return;
    }
    var text = issueDraft.trim().slice(0, 1500);
    issueLast = issueText(text);
    a.href = issueLink();
    copyText(issueLast);
    var w = issueWhere();
    log('issue', { category: issueCat, step: w.step, text: text });
    save();
    setTimeout(function () { openSheet('issue_sent'); }, 300);
  });
  sheet.addEventListener('click', function (e) { if (e.target === sheet) closeSheet(); });
  sheet.addEventListener('close', function () { sheetKind = null; });

  // ---------- запуск ----------
  function boot() {
    fetch('quest.json', { cache: 'no-cache' }).then(function (r) {
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.json();
    }).then(function (q) {
      Q = q;
      S = load();
      if (S.phase !== 'idle') { log('reload'); save(); }
      var sun = document.documentElement.dataset.theme === 'sun';
      var meta = document.querySelector('meta[name="theme-color"]');
      if (meta) meta.setAttribute('content', sun ? '#F4F1EA' : '#141414');
      render();
      var el = document.getElementById('active');
      if (el && S.phase === 'step') el.scrollIntoView({ block: 'start' });
    }).catch(function (err) {
      app.innerHTML = '<section class="pl-card"><span class="pl-label">Не загрузилось</span><p>Нет связи или файл квеста недоступен (' + esc(err.message) + '). Проверьте интернет и попробуйте ещё раз.</p>' +
        '<div class="pl-actions"><button class="pl-btn" type="button" onclick="location.reload()">Обновить</button></div></section>';
    });
  }

  // Для проверок: функции сверки ответов и состояние
  window.__dvorami = { norm: norm, matches: matches, state: function () { return S; }, quest: function () { return Q; }, report: function () { return report(); } };

  if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost' || location.hostname === '127.0.0.1')) {
    navigator.serviceWorker.register('../sw.js').catch(function () { /* без офлайна */ });
  }
  boot();
})();

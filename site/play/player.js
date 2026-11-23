/* Дворами — веб-плеер квеста.
   Читает quest.json из папки страницы (формат как у scripts/quest_bot.py) и повторяет логику бота:
   вступление → точки по порядку (дорога → «Мы на месте» → сцена → шаги) → улика → финал.
   Экран — единый каркас для всех дел (platform/design/player-frame.md): страница дела даёт только
   <body data-quest data-case-no>, <main id="app"> и theme.css; шапку, навигацию и шторку строит этот файл.
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
  var CASE_NO = document.body.dataset.caseNo || '';
  var app = document.getElementById('app');
  var view = 'point';   // раздел навигации: point | board | map

  // ---------- каркас: шапка дела, прогресс, навигация, шторка — одинаковые во всех делах ----------
  var ICONS = {
    point: '<path d="M12 21s-6.5-5.6-6.5-10.5a6.5 6.5 0 0 1 13 0C18.5 15.4 12 21 12 21Z"/><circle cx="12" cy="10.5" r="2.3"/>',
    board: '<rect x="3.5" y="7.5" width="12" height="13" rx="1.5"/><path d="M8 7.5V4h12.5v13h-5"/><path d="M6.5 12h6M6.5 16h4"/>',
    map: '<path d="M3.5 6.5 9 4l6 2.5L20.5 4v13.5L15 20l-6-2.5L3.5 20Z"/><path d="M9 4v13.5M15 6.5V20"/>',
    menu: '<path d="M4 7h16M4 12h16M4 17h16"/>',
    close: '<path d="M6 6l12 12M18 6 6 18"/>',
    note: '<path d="m4 20 1-4.5L16.5 4a2.1 2.1 0 0 1 3 3L8 18.5 4 20Z"/><path d="m14.5 6 3.5 3.5"/>',
    sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2.5v2.5M12 19v2.5M2.5 12H5M19 12h2.5M5.3 5.3l1.8 1.8M16.9 16.9l1.8 1.8M5.3 18.7l1.8-1.8M16.9 7.1l1.8-1.8"/>',
    alert: '<path d="M12 4 3 20h18L12 4Z"/><path d="M12 10v5M12 17.4v.2"/>',
    send: '<path d="M4 12 20 4l-5 16-3.5-6.5L4 12Z"/><path d="M11.5 13.5 20 4"/>',
    pause: '<path d="M8.5 5v14M15.5 5v14"/>',
    restart: '<path d="M4.5 12a7.5 7.5 0 1 0 2.4-5.5"/><path d="M4.5 4v5h5"/>',
    hint: '<path d="M9.5 18h5M10.5 21h3M12 3a6 6 0 0 0-3.6 10.8c.7.6 1.1 1.3 1.1 2.2h5c0-.9.4-1.6 1.1-2.2A6 6 0 0 0 12 3Z"/>',
    out: '<path d="M8 16 16 8M9 8h7v7"/>'
  };
  function ico(name) { return '<svg class="pl-ico" viewBox="0 0 24 24" aria-hidden="true" focusable="false">' + ICONS[name] + '</svg>'; }
  (function shell() {
    app.insertAdjacentHTML('beforebegin',
      '<header class="pl-top"><div class="pl-top-in">' +
      '<a class="pl-logo" href="../../" aria-label="Дворами — на главную"><svg viewBox="0 0 48 48" aria-hidden="true" focusable="false"><path fill="currentColor" fill-rule="evenodd" d="M16.5 7H31.5L36.5 34H44V38.5H41.5V44H36V38.5H12V44H6.5V38.5H4V34H11.5ZM18 34L21 17Q24 12 27 17L30 34Z"/><path class="logo-light" d="M20.3 34V26.6Q24 22.2 27.7 26.6V34Z"/></svg><span>дворами</span></a>' +
      '<p class="pl-where" id="where" aria-live="polite"></p>' +
      '<button class="pl-menu-btn" type="button" data-act="menu" aria-label="Меню">' + ico('menu') + '</button>' +
      '</div><div class="pl-progress" id="progress" role="img"></div></header>');
    app.insertAdjacentHTML('afterend',
      '<aside class="pl-side" id="side" aria-label="Досье"></aside>' +
      '<nav class="pl-nav" id="tabs" aria-label="Разделы дела" hidden>' +
      '<button type="button" data-act="view" data-view="point">' + ico('point') + '<span>Точка</span></button>' +
      '<button type="button" data-act="view" data-view="board">' + ico('board') + '<span>Улики</span><b class="pl-badge" id="badge"></b></button>' +
      '<button type="button" data-act="view" data-view="map">' + ico('map') + '<span>Карта</span></button></nav>' +
      '<dialog class="pl-sheet" id="sheet" aria-labelledby="sheet-title"><div class="pl-sheet-head"><h2 id="sheet-title"></h2>' +
      '<button type="button" class="pl-x" data-act="close" aria-label="Закрыть">' + ico('close') + '</button></div>' +
      '<div class="pl-sheet-body" id="sheet-body"></div></dialog>' +
      '<div class="pl-toast" id="toast" role="status" aria-live="polite"></div>');
  })();
  var sheet = document.getElementById('sheet');
  function themeColor() {
    var meta = document.querySelector('meta[name="theme-color"]');
    var bg = getComputedStyle(document.documentElement).getPropertyValue('--bg').trim();
    if (meta && bg) meta.setAttribute('content', bg);
  }
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
    return s.split(/\n{2,}/).map(function (p) {
      var m = p.match(/^<code>([^<]+)<\/code>$/);
      return m ? docLine(m[1]) : '<p>' + p.replace(/\n/g, '<br>') + '</p>';
    }).join('');
  }
  // Абзац из одной строки <code> — документ дела (телеграмма, шифр). Буквы — отдельными элементами: тема может «напечатать» их по одной
  function docLine(t) {
    var i = 0;
    var chars = t.replace(/&[a-z]+;|&#\d+;|[\s\S]/gi, function (ch) { return /^\s$/.test(ch) ? ' ' : '<i style="--i:' + (i++) + '">' + ch + '</i>'; });
    return '<p class="pl-doc"><code><span class="visually-hidden">' + t + '</span><span aria-hidden="true">' + chars + '</span></code></p>';
  }
  function plain(src) {
    return String(src || '').replace(PICT, '').replace(/<[^>]+>/g, '').replace(/&quot;/g, '"').replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>').replace(/&amp;/g, '&').replace(/[ \t]{2,}/g, ' ').trim();
  }
  // Эмодзи в начале шага → текстовый тег (BRAND.md, раздел 5): эмодзи в интерфейсе не показываем.
  // Название тега — жирная подпись после эмодзи («Смотри и считай», «Версия Тюфеля»), иначе — по умолчанию для значка.
  var TAGS = { '\u{1F440}': ['Смотри', 'look'], '\u{1F504}': ['Крути', 'turn'], '\u{1F9E0}': ['Думай', 'think'],
    '\u{1F9F8}': ['По желанию', 'opt'], '➕': ['По желанию', 'opt'], '☕': ['Перерыв', 'brk'],
    '\u{1F5C2}': ['Доска улик', 'think'], '\u{1F408}': ['Версия', 'cat'] };
  function stepTag(text) {
    var t = String(text || '').replace(/^\s+/, '');
    var m = t.match(/^(\p{Extended_Pictographic})️?\s*/u);
    if (!m) return { tag: null, cls: '', text: t };
    var def = TAGS[m[1]], rest = t.slice(m[0].length);
    var tag = def ? def[0] : null, cls = def ? def[1] : 'think';
    var b = rest.match(/^<b>([^<]{2,32})<\/b>\s*/);
    if (b) { tag = b[1].replace(/[.:!\s]+$/, ''); rest = rest.slice(b[0].length); }
    if (/^по желанию/i.test(tag || '')) cls = 'opt';
    return { tag: tag, cls: tag ? cls : '', text: rest };
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

  // ---------- отрисовка: единый каркас (platform/design/player-frame.md) ----------
  // Разметку каркаса тема дела не меняет — только переменные CSS и вид артефакта.
  function head(eyebrow, title, place, shape) {
    return '<header class="pl-head" id="top"><span class="pl-deco" data-shape="' + (shape % 3) + '" aria-hidden="true"></span>' +
      '<p class="pl-eyebrow">' + esc(eyebrow) + '</p><h1>' + esc(plain(title)) + '</h1>' +
      (place ? '<p class="pl-place">' + esc(plain(place)) + '</p>' : '') + '</header>';
  }
  function pointHead(p, stage) { return head('Точка ' + p.n + ' · ' + stage, p.title, p.place, p.n - 1); }
  function caseName() { return CASE_NO ? 'Дело № ' + CASE_NO : 'Дело'; }
  function clueTotal() { return Q.points.filter(function (p) { return p.clue; }).length; }
  function mapLink(p) { return 'https://yandex.ru/maps/?pt=' + p.lon + ',' + p.lat + '&z=18&l=map'; }
  function checkBlock(p, collapsed) {
    if (!S.field || !p.check || !p.check.length) return '';
    var items = '<ul>' + p.check.map(function (c) { return '<li>' + inline(c) + '</li>'; }).join('') + '</ul>' +
      '<p class="pl-small" style="margin-top:10px">Фотографии сохраняйте в галерею телефона. Замечания записывайте через меню → «Заметка» — они попадут в отчёт к точке ' + p.n + '.</p>';
    if (collapsed) return '<details class="pl-field"><summary>Полевой тест: что проверить</summary>' + items + '</details>';
    return '<section class="pl-field"><span class="pl-label">Полевой тест: что проверить</span>' + items + '</section>';
  }
  // Артефакт дела — улика: метка (буква и год) и слова свидетеля
  function clueCard(c, isNew) {
    return '<figure class="pl-art' + (isNew ? ' is-new' : '') + '">' +
      '<div class="pl-art-mark" role="img" aria-label="Буква ' + esc(c.letter) + ', ' + esc(c.year) + ' год"><span aria-hidden="true">' + esc(c.letter) + '</span><small aria-hidden="true">' + esc(c.year) + '</small></div>' +
      '<figcaption><span class="pl-art-who">' + esc(plain(c.who)) + '</span><p class="pl-art-says">«' + inline(c.says) + '»</p></figcaption></figure>';
  }
  function tagHtml(t) { return t.tag ? '<span class="pl-tag pl-tag--' + t.cls + '">' + esc(t.tag) + '</span>' : ''; }
  function doneStep(st, r, i) {
    var t = stepTag(st.text);
    var stamp = '';
    if (r && r.st === 'ok') stamp = '<span class="pl-stamp">Верно · ' + esc(r.text) + '</span>';
    else if (r && r.st === 'revealed') stamp = '<span class="pl-stamp pl-stamp--ans">Ответ · ' + esc(plain(r.text)) + '</span>';
    else if (r && r.st === 'free') stamp = '<span class="pl-stamp">' + esc(r.text) + '</span>';
    else if (r && r.st === 'skipped') stamp = '<span class="pl-stamp pl-stamp--ans">Пропущено</span>';
    var ok = (r && r.st !== 'skipped' && st.ok) ? '<p class="pl-ok">' + inline(st.ok) + '</p>' : '';
    return '<section class="pl-past" data-step="' + i + '">' + (t.tag ? '<div>' + tagHtml(t) + '</div>' : '') +
      '<div class="pl-prose">' + prose(t.text) + '</div>' + stamp + ok + '</section>';
  }
  // Лестница подсказок: у загадки последняя ступень — ответ; у свободного вопроса ответа нет
  function hintSteps(st) {
    var n = (st.hints || []).length, out = [];
    for (var i = 0; i < n; i++) {
      if (st.type !== 'free' && i === n - 1) out.push({ name: 'Ответ', btn: 'Показать ответ', note: 'улика всё равно ваша' });
      else if (n === 3 && i === 0) out.push({ name: 'Намёк', btn: 'Подсказка 1 из 3', note: 'намёк: куда смотреть' });
      else if (n === 3 && i === 1) out.push({ name: 'Почти решение', btn: 'Подсказка 2 из 3', note: 'почти решение: останется один шаг' });
      else out.push({ name: 'Подсказка ' + (i + 1), btn: 'Подсказка ' + (i + 1) + ' из ' + n, note: '' });
    }
    return out;
  }
  function activeStep(st) {
    var t = stepTag(st.text);
    var total = pt().steps.length;
    var h = '<section class="pl-card pl-task' + (t.cls === 'opt' ? ' pl-task--opt' : '') + '" id="active" data-step="' + S.k + '">' +
      '<div class="pl-task-top">' + tagHtml(t) + '<span class="pl-stepno">Шаг ' + (S.k + 1) + ' из ' + total + '</span></div>' +
      '<div class="pl-prose">' + prose(t.text) + '</div>';
    if (st.type === 'board') h += '<div style="margin-top:16px">' + boardLetters(false) + '</div>';
    if (st.type === 'info' || st.type === 'board') {
      return h + '<div class="pl-actions"><button class="pl-btn" type="button" data-act="next">Дальше</button></div></section>';
    }
    var hints = st.hints || [];
    var steps = hintSteps(st);
    var revealed = st.type !== 'free' && hints.length && S.hint >= hints.length;
    if (!revealed) {
      h += '<form class="pl-form" data-form="answer" autocomplete="off">' +
        '<label class="visually-hidden" for="ans">Ваш ответ</label>' +
        '<input class="pl-input" id="ans" name="ans" type="text" inputmode="text" autocapitalize="off" autocorrect="off" spellcheck="false" enterkeyhint="send" placeholder="' + (st.type === 'free' ? 'Ваш ответ' : 'Ответ в одно-два слова') + '" value="' + esc(S.last) + '">' +
        '<button class="pl-btn" type="submit">Ответить</button></form>';
      if (S.wrong) h += '<p class="pl-wrong" role="status">«' + esc(S.wrong) + '» — не подходит. Попробуйте ещё раз' + (hints.length ? ' или откройте подсказку.' : '.') + '</p>';
    }
    if (hints.length) {
      h += '<div class="pl-hints">';
      for (var j = 0; j < Math.min(S.hint, hints.length); j++) h += '<div class="pl-hint"><b>' + steps[j].name + '</b>' + inline(hints[j]) + '</div>';
      if (S.hint < hints.length) {
        var pips = '';
        for (var i = 0; i < hints.length; i++) pips += '<i' + (i < S.hint ? ' class="on"' : '') + '></i>';
        h += '<button type="button" class="pl-hintbtn" data-act="hint" data-level="' + S.hint + '">' + ico('hint') +
          '<span><b>' + steps[S.hint].btn + '</b>' + (steps[S.hint].note ? '<small>' + steps[S.hint].note + '</small>' : '') + '</span>' +
          '<span class="pl-pips" aria-hidden="true">' + pips + '</span></button>';
      }
      h += '</div>';
      if (revealed) h += '<div class="pl-actions"><button class="pl-btn" type="button" data-act="reveal">Дальше</button></div>';
    }
    if (!revealed && (st.optional || st.type === 'free' || !hints.length)) h += '<button type="button" class="pl-skip" data-act="skip">Пропустить</button>';
    return h + '</section>';
  }
  function issueBtn() {
    return '<button type="button" class="pl-issue" data-act="issue">Что-то не так? Напишите нам</button>';
  }
  // Буквы улик; rest — показать пустые места под ещё не найденные улики
  function boardLetters(rest, list) {
    var b = list || S.board;
    var h = '<div class="pl-letters" role="img" aria-label="Буквы улик: ' + (b.length ? esc(b.map(function (c) { return c.letter; }).join(' ')) : 'пока нет') + '">' +
      b.map(function (c) { return '<span aria-hidden="true">' + esc(c.letter) + '</span>'; }).join('');
    if (rest) for (var i = b.length; i < clueTotal(); i++) h += '<span class="todo" aria-hidden="true"></span>';
    h += '</div>';
    if (!rest && b.length) h += '<p class="pl-small" style="margin-top:8px">' + b.map(function (c) { return esc(c.year) + ' · ' + esc(c.letter); }).join(' &nbsp; ') + '</p>';
    return h;
  }
  var sortMode = 'found';
  function boardView() {
    var b = S.board.slice();
    var byYear = S.sort && sortMode === 'year';
    if (byYear) b.sort(function (a, c) { return a.year - c.year; });
    var h = head(caseName(), 'Доска улик', b.length ? 'Собрано ' + b.length + ' из ' + clueTotal() : '', 2);
    if (!b.length) return h + '<p class="pl-empty">Доска пока пуста. Первая улика — на точке 1: за каждую точку вы получаете букву, год и слова свидетеля.</p>' + boardLetters(true);
    if (S.sort) {
      h += '<div class="pl-seg" role="group" aria-label="Порядок улик"><button type="button" data-act="sort" data-mode="found" aria-pressed="' + !byYear + '">Как нашли</button>' +
        '<button type="button" data-act="sort" data-mode="year" aria-pressed="' + byYear + '">По годам</button></div>';
    }
    return h + boardLetters(!byYear, b).replace(/<p class="pl-small"[\s\S]*$/, '') +
      '<div class="pl-board">' + b.map(function (c) { return clueCard(c, false); }).join('') + '</div>';
  }
  // Карта: схема по настоящим координатам. Показываем только пройденные точки и текущую — маршрут вперёд не раскрываем
  function mapView() {
    var n = Q.points.length, all = S.phase === 'done';
    var upto = all ? n - 1 : (S.phase === 'intro' ? 0 : S.p);
    var arrived = S.phase === 'step' || S.phase === 'point_done';
    var known = Q.points.slice(0, upto + 1);
    var cur = all ? null : Q.points[upto];
    var k = Math.cos(Q.points[0].lat * Math.PI / 180);
    // рамка схемы — по известным точкам, а не по всему маршруту: пустое место не подсказывает, куда идёт путь дальше
    var xs = known.map(function (p) { return p.lon * k; }), ys = known.map(function (p) { return -p.lat; });
    var x0 = Math.min.apply(null, xs), x1 = Math.max.apply(null, xs), y0 = Math.min.apply(null, ys), y1 = Math.max.apply(null, ys);
    var W = 320, H = 210, pad = 26;
    var MIN = .004; // ≈ 400 м: первые точки рядом не растягиваются на всю схему
    var sc = Math.min((W - 2 * pad) / Math.max(x1 - x0, MIN), (H - 2 * pad) / Math.max(y1 - y0, MIN));
    var ox = (W - (x1 - x0) * sc) / 2, oy = (H - (y1 - y0) * sc) / 2;
    var pos = known.map(function (p, i) { return [(xs[i] - x0) * sc + ox, (ys[i] - y0) * sc + oy]; });
    // соседние точки ближе диаметра кружка раздвигаем, чтобы номера не слипались
    for (var it = 0; it < 8; it++) for (var a = 0; a < pos.length; a++) for (var b = a + 1; b < pos.length; b++) {
      var dx = pos[b][0] - pos[a][0], dy = pos[b][1] - pos[a][1], d = Math.sqrt(dx * dx + dy * dy);
      if (d >= 25) continue;
      if (d < .01) { dx = 1; dy = 0; d = 1; }
      var push = (25 - d) / 2;
      pos[a][0] -= dx / d * push; pos[a][1] -= dy / d * push; pos[b][0] += dx / d * push; pos[b][1] += dy / d * push;
    }
    var xy = function (i) { return pos[i]; };
    var path = known.map(function (p, i) { var c = xy(i); return (i ? 'L' : 'M') + c[0].toFixed(1) + ' ' + c[1].toFixed(1); }).join('');
    var dots = known.map(function (p, i) {
      var c = xy(i), isCur = cur && i === upto;
      return (isCur ? '<circle class="pl-map-cur" cx="' + c[0].toFixed(1) + '" cy="' + c[1].toFixed(1) + '" r="11"/>' : '') +
        '<circle class="pl-map-dot' + (isCur ? ' pl-map-dot--cur' : '') + '" cx="' + c[0].toFixed(1) + '" cy="' + c[1].toFixed(1) + '" r="11"/>' +
        '<text' + (isCur ? ' class="cur"' : '') + ' x="' + c[0].toFixed(1) + '" y="' + c[1].toFixed(1) + '">' + p.n + '</text>';
    }).join('');
    var done = all ? n : upto + (S.phase === 'point_done' ? 1 : 0);
    var h = head(caseName(), 'Карта', all ? 'Маршрут пройден: ' + n + ' из ' + n + ' точек' : 'Пройдено точек: ' + done + ' из ' + n, 0) +
      '<figure class="pl-map"><svg viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="Схема пути: ' + (all ? 'все точки' : 'точки с 1 по ' + (upto + 1)) + '">' +
      (known.length > 1 ? '<path class="pl-map-path" d="' + path + '"/>' : '') + dots + '</svg></figure>';
    if (cur) h += '<a class="pl-btn pl-btn--ghost pl-btn--sm" href="' + esc(mapLink(cur)) + '" target="_blank" rel="noopener" data-track="map_open" data-track-point="' + cur.n + '">' + ico('out') + 'Точка ' + cur.n + ' в Яндекс Картах</a>';
    h += '<ol class="pl-stops">' + known.map(function (p, i) {
      var isCur = cur && i === upto;
      return '<li' + (isCur ? ' class="cur"' : '') + '><span class="n" aria-hidden="true">' + p.n + '</span><div><b>' + esc(plain(p.title)) + '</b><small>' +
        (isCur ? (arrived ? 'Вы здесь · ' : 'Идёте сюда · ') : '') + esc(plain(p.place)) + '</small></div></li>';
    }).join('') + '</ol>';
    if (!all && n - upto - 1 > 0) h += '<p class="pl-small">Остальные точки появятся на карте по ходу дела.</p>';
    return h;
  }
  function sideHtml() {
    var b = S.board;
    return '<span class="pl-label">' + esc(caseName()) + (Q.district ? ' · ' + esc(Q.district) : '') + '</span><h2>' + esc(plain(Q.title)) + '</h2>' +
      '<span class="pl-label" style="margin-top:20px">Улики: ' + b.length + ' из ' + clueTotal() + '</span>' + boardLetters(true) +
      '<p class="pl-small">' + (b.length ? 'Слова свидетелей — в разделе «Улики».' : 'За каждую точку — буква, год и слова свидетеля.') + '</p>';
  }
  function pointView() {
    var n = Q.points.length, h = '';
    if (S.paused) {
      h = head('Пауза', 'Дело отложено', 'Прогресс сохранён на этом телефоне' + (S.phase === 'done' ? '' : ': точка ' + pt().n + ' из ' + n) + '.', 2) +
        '<div class="pl-actions"><button class="pl-btn" type="button" data-act="resume">Продолжить</button>' +
        (S.field ? '<button class="pl-btn pl-btn--ghost" type="button" data-act="report">Отправить отчёт</button>' : '') +
        '<button class="pl-btn pl-btn--ghost" type="button" data-act="restart">Начать заново</button></div>';
    } else if (S.phase === 'idle') {
      h = head((Q.district ? Q.district + ' · ' : '') + caseName(), Q.title, Q.summary || '', 0) +
        (S.field ? '<section class="pl-field"><span class="pl-label">Режим полевого теста</span><p class="pl-small">На каждой точке — список «что проверить». Время, ошибки, подсказки и заметки сохраняются сами. В конце, а при желании и раньше (меню → «Отправить отчёт»), отправьте отчёт одним сообщением в Telegram.</p></section>' : '') +
        '<div class="pl-actions"><button class="pl-btn" type="button" data-act="start">Открыть дело</button></div>' +
        '<p class="pl-small">Прогресс сохраняется на этом телефоне: можно закрыть страницу и вернуться.</p>';
    } else if (S.phase === 'intro') {
      h = '<h1 class="visually-hidden" id="top">Вступление</h1>' + Q.intro.map(function (m, i) {
        return '<section class="pl-card' + (i === Q.intro.length - 1 ? ' pl-card--paper' : '') + '"><div class="pl-prose">' + prose(m) + '</div></section>';
      }).join('') +
        '<div class="pl-actions"><button class="pl-btn" type="button" data-act="go">К точке 1</button></div>';
    } else if (S.phase === 'walk') {
      var p = pt();
      h = pointHead(p, 'дорога') +
        '<section class="pl-card">' + (p.walk_m ? '<p class="pl-dist">≈ ' + p.walk_m + ' м <span>пешком</span></p>' : '') +
        '<div class="pl-prose">' + prose(p.walk) + '</div>' +
        '<a class="pl-btn pl-btn--ghost pl-btn--sm pl-maplink" href="' + esc(mapLink(p)) + '" target="_blank" rel="noopener" data-track="map_open" data-track-point="' + p.n + '">' + ico('out') + 'Открыть в Яндекс Картах</a></section>' +
        checkBlock(p, false) +
        '<div class="pl-actions"><button class="pl-btn" type="button" data-act="here">Мы на месте</button></div>' + issueBtn();
    } else if (S.phase === 'step') {
      var p2 = pt();
      h = pointHead(p2, 'на месте') + '<section class="pl-scene"><div class="pl-prose">' + prose(p2.scene) + '</div></section>';
      for (var k = 0; k < S.k; k++) h += doneStep(p2.steps[k], S.res[k], k);
      h += activeStep(p2.steps[S.k]);
      h += checkBlock(p2, true);
      h += issueBtn();
    } else if (S.phase === 'point_done') {
      var p3 = pt();
      var last = S.p + 1 >= n;
      h = pointHead(p3, 'пройдена');
      if (p3.clue) h += '<div id="active" style="scroll-margin-top:96px"><span class="pl-label">Улика № ' + S.board.length + ' — на вашей доске</span>' + clueCard(p3.clue, true) + '</div>';
      if (p3.outro) h += '<section class="pl-scene"' + (p3.clue ? '' : ' id="active"') + '><div class="pl-prose">' + prose(p3.outro) + '</div></section>';
      h += '<div class="pl-actions"><button class="pl-btn" type="button" data-act="nextpoint">' + (last ? 'К финалу' : 'К точке ' + (S.p + 2)) + '</button></div>' + issueBtn();
    } else if (S.phase === 'done') {
      h = head('Финал', 'Дело закрыто', '', 1) +
        (Q.finale || []).map(function (m) { return '<section class="pl-card"><div class="pl-prose">' + prose(m) + '</div></section>'; }).join('') +
        '<section class="pl-card"><span class="pl-label">Время прохождения</span><p class="pl-dist" style="font-size:28px;margin:0">' + dur((S.t_end || Date.now()) - S.t_start) + '</p></section>' +
        (S.field ? '<section class="pl-field"><span class="pl-label">Полевой тест окончен</span><p class="pl-small">Напишите заметку с впечатлениями: что понравилось больше всего, где застряли, где было скучно. Потом нажмите «Отправить отчёт» и перешлите его в Telegram.</p>' +
          '<div class="pl-actions"><button class="pl-btn pl-btn--ghost" type="button" data-act="note">Заметка</button><button class="pl-btn" type="button" data-act="report">Отправить отчёт</button></div></section>' : '') +
        '<section class="pl-card"><span class="pl-label">Как вам дело?</span><p class="pl-small">Минута в Telegram: оценка и пара слов. Честный отзыв помогает нам больше всего — особенно если где-то было непонятно.</p>' +
          '<div class="pl-actions"><a class="pl-btn" href="' + esc(botLink('review-' + QID)) + '" target="_blank" rel="noopener" data-track="review_click" data-track-quest="' + esc(QID) + '">Оценить квест</a></div></section>' +
        '<div class="pl-actions"><button class="pl-btn pl-btn--ghost" type="button" data-act="restart">Начать заново</button></div>' + issueBtn();
    }
    return h;
  }

  var lastKey = null, lastBadge = 0;
  function render() {
    var n = Q.points.length;
    var playing = S.phase !== 'idle' && !S.paused;
    if (!playing) view = 'point';
    // шапка дела и прогресс по точкам
    var shown = (S.phase === 'walk' || S.phase === 'step' || S.phase === 'point_done') ? pt().n : (S.phase === 'done' ? n : 0);
    var where = document.getElementById('where');
    where.innerHTML = esc(CASE_NO ? caseName() : '') + (shown ? (CASE_NO ? ' · ' : '') + '<b>' + shown + ' из ' + n + '</b>' : '');
    where.setAttribute('aria-label', (CASE_NO ? caseName() : '') + (shown ? ', точка ' + shown + ' из ' + n : ''));
    var prog = '', passed = 0;
    for (var i = 0; i < n; i++) {
      var done = S.phase === 'done' || i < S.p || (i === S.p && S.phase === 'point_done');
      var cur = !done && i === S.p && (S.phase === 'walk' || S.phase === 'step');
      if (done) passed++;
      prog += '<i class="' + (done ? 'done' : cur ? 'cur' : '') + '"></i>';
    }
    var bar = document.getElementById('progress');
    bar.innerHTML = S.phase === 'idle' ? '' : prog;
    bar.setAttribute('aria-label', 'Пройдено точек: ' + passed + ' из ' + n);
    // навигация
    var nav = document.getElementById('tabs');
    nav.hidden = !playing;
    [].forEach.call(nav.querySelectorAll('button'), function (b) {
      if (b.dataset.view === view) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current');
    });
    var badge = document.getElementById('badge');
    badge.textContent = S.board.length ? String(S.board.length) : '';
    if (S.board.length > lastBadge && lastKey !== null) { badge.classList.remove('bump'); void badge.offsetWidth; badge.classList.add('bump'); }
    lastBadge = S.board.length;
    document.getElementById('side').innerHTML = playing ? sideHtml() : '';
    // «живые» детали играют один раз — когда игрок продвинулся, а не при каждой перерисовке
    var key = [S.phase, S.p, S.k, S.paused].join(':');
    app.classList.toggle('pl-fresh', key !== lastKey && view === 'point');
    lastKey = key;
    app.innerHTML = view === 'board' ? boardView() : view === 'map' ? mapView() : pointView();
  }

  function commit(focus) {
    view = 'point';
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
    if (kind === 'note') {
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
      title = 'Меню';
      var sun = document.documentElement.dataset.theme === 'sun';
      var row = function (act, icon, name, note, extra) {
        return '<button type="button" data-act="' + act + '"' + (extra || '') + '>' + ico(icon) + '<span><b>' + name + '</b>' + (note ? '<small>' + note + '</small>' : '') + '</span>' +
          (act === 'theme' ? '<i class="pl-switch" aria-hidden="true"></i>' : '') + '</button>';
      };
      body = '<div class="pl-menu">' +
        (S.phase !== 'idle' ? row('note', 'note', 'Заметка', curN() ? 'сохранится к точке ' + curN() : 'для себя' + (S.field ? ' и для отчёта' : '')) : '') +
        row('theme', 'sun', 'Светлая тема', 'экран лучше читается на ярком солнце', ' role="switch" aria-checked="' + sun + '"') +
        row('issue', 'alert', 'Сообщить об ошибке', 'квест не прервётся') +
        (S.field ? row('report', 'send', 'Отправить отчёт', 'полевой тест') : '') +
        (S.phase !== 'idle' && S.phase !== 'done' && !S.paused ? row('stop', 'pause', 'Закончить на сегодня', 'прогресс сохранится') : '') +
        (S.phase !== 'idle' ? row('restart', 'restart', 'Начать заново', 'прогресс и улики сотрутся') : '') + '</div>' +
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
    view: function (el) {
      var v = el.dataset.view;
      if (v === view && v !== 'point') return;
      var same = v === view;
      view = v; render();
      if (!same) { window.scrollTo(0, 0); return; }
      // повторное нажатие «Точка» — вернуться к текущему заданию
      var t = document.getElementById('active') || document.getElementById('top');
      if (!t) return;
      t.scrollIntoView({ block: 'start', behavior: 'smooth' });
      t.classList.remove('pulse'); void t.offsetWidth; t.classList.add('pulse');
    },
    note: function () { openSheet('note'); },
    menu: function () { openSheet('menu'); },
    report: function () { openSheet('report'); },
    issue: function () { issueCat = ''; issueDraft = ''; openSheet('issue'); },
    issuecopy: function () { copyText(issueLast).then(function (ok) { toast(ok ? 'Скопировано — вставьте в Telegram' : 'Не получилось скопировать'); }); },
    close: closeSheet,
    sort: function (el) { sortMode = el.dataset.mode; render(); },
    theme: function () {
      var r = document.documentElement;
      var sun = r.dataset.theme !== 'sun';
      if (sun) r.dataset.theme = 'sun'; else delete r.dataset.theme;
      store.set(THEME_KEY, sun ? 'sun' : 'dark');
      themeColor();
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
      themeColor();
      render();
      var el = document.getElementById('active');
      if (el && S.phase === 'step') el.scrollIntoView({ block: 'start' });
    }).catch(function (err) {
      app.innerHTML = '<section class="pl-card" id="top"><span class="pl-label">Не загрузилось</span><p>Нет связи или файл квеста недоступен (' + esc(err.message) + '). Проверьте интернет и попробуйте ещё раз.</p>' +
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

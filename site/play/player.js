/* Дворами — веб-плеер квеста.
   Дело зашифровано (docs/codes.md): читает quest.locked.json из папки страницы и открывает его кодом доступа —
   экран кода, код из ссылки #code=XXXX-XXXX или сохранённый на телефоне. Нет quest.locked.json — читает открытый
   quest.json (локальная разработка, макеты). Данные дела — формат scripts/quest_bot.py; плеер повторяет логику бота:
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
    out: '<path d="M8 16 16 8M9 8h7v7"/>',
    down: '<path d="M12 5v14M6 13l6 6 6-6"/>',
    sound: '<path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4Z"/><path d="M15.5 9a4 4 0 0 1 0 6M18 6.5a7.5 7.5 0 0 1 0 11"/>'
  };
  function ico(name) { return '<svg class="pl-ico" viewBox="0 0 24 24" aria-hidden="true" focusable="false">' + ICONS[name] + '</svg>'; }
  (function shell() {
    app.insertAdjacentHTML('beforebegin',
      '<header class="pl-top"><div class="pl-top-in">' +
      '<a class="pl-logo" href="../../" aria-label="Дворами — на главную"><svg viewBox="0 0 512 512" aria-hidden="true" focusable="false"><path class="logo-key" fill="currentColor" fill-rule="evenodd" d="M230.9 194.4L295.2 258.8L319.5 234.5L313.5 228.5L319.5 222.5L323.6 222.5L373.5 237.5L381.5 264L388.6 257.5L396.5 265.5L385.5 277.1L389.5 290.5L382.5 296.5L378.5 289.5L352.2 315.8L363.7 327.3L446.5 244.5L493.6 291.5L410.8 374.3L421.2 384.8L454.5 351.5L499.6 359.5L508.6 401.6L473.3 436.9L482.6 446.2A30.7 30.7 0 0 1 439.2 489.6L188.2 238.6A121.5 121.5 0 1 1 230.9 194.4ZM316 281L337 260L351 274L330 295ZM440 404L460.5 383.5L474.5 397.5L454 418ZM378.7 331.4L396.1 314L406.1 324L388.7 341.4ZM404.7 305.3L421.8 288.2L431.8 298.3L414.8 315.3ZM430.5 279.5L447 263L457.1 273L440.5 289.6ZM396.7 349.4L414.1 332L424.1 342L406.7 359.4ZM422.8 323.3L439.8 306.3L449.8 316.2L432.8 333.3ZM448.5 297.6L465.1 281L475 291L458.5 307.5Z"/><circle class="logo-light" cx="124.9" cy="134.9" r="67.6" fill="#F9BD39"/></svg><span>дворами</span></a>' +
      '<p class="pl-where" id="where" aria-live="polite"></p>' +
      '<button class="pl-menu-btn" type="button" data-act="menu" aria-label="Меню">' + ico('menu') + '</button>' +
      '</div><div class="pl-progress" id="progress" role="img"></div></header>');
    app.insertAdjacentHTML('afterend',
      '<aside class="pl-side" id="side" aria-label="Досье"></aside>' +
      '<nav class="pl-nav" id="tabs" aria-label="Разделы дела" hidden>' +
      '<button type="button" data-act="view" data-view="point">' + ico('point') + '<span>Точка</span></button>' +
      '<button type="button" data-act="view" data-view="board">' + ico('board') + '<span>Улики</span><b class="pl-badge" id="badge"></b></button>' +
      '<button type="button" data-act="view" data-view="map">' + ico('map') + '<span>Карта</span></button></nav>' +
      // Задание ниже экрана (длинная сцена) — над навигацией кнопка «К заданию» (T-60); у самого задания главная кнопка прилипает сама
      '<div class="pl-float" id="float" hidden><button class="pl-btn" type="button" data-act="totask">' + ico('down') + '<span>К заданию</span></button></div>' +
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

  // ---------- формат 5 (docs/quest-format.md): ветки, реплики, доска карточек, письмо-улика ----------
  // Ветки А/Б: элемент любого списка с полем "if" остаётся, только если флаг совпал. Флаги — Q.flags (по умолчанию «A»),
  // для проверки на месте их можно переключить ссылкой ?flags=st4:B,st10:B (дело уже открыто кодом — тайны в этом нет).
  var FLAGS = {};
  function readFlags(q) {
    var f = {}, d = q.flags || {};
    for (var k in d) if (Object.prototype.hasOwnProperty.call(d, k)) f[k] = String(d[k]);
    var m = location.search.match(/[?&]flags=([^&#]+)/);
    if (m) {
      var raw = m[1];
      try { raw = decodeURIComponent(raw); } catch (e) { /* как есть */ }
      raw.split(',').forEach(function (p) { var kv = p.split(/[:=]/); if (kv[0] && kv[1]) f[kv[0].trim()] = kv[1].trim(); });
    }
    return f;
  }
  function flag(k) { return FLAGS[k] || 'A'; }
  function passes(cond) {
    if (!cond) return true;
    if (typeof cond === 'string') {
      var m = cond.match(/^\s*([\w-]+)\s*(!?=)\s*(.+?)\s*$/);
      if (!m) return true;
      var hit = m[3].split('|').map(function (s) { return s.trim(); }).indexOf(flag(m[1])) !== -1;
      return m[2] === '=' ? hit : !hit;
    }
    for (var k in cond) if ([].concat(cond[k]).map(String).indexOf(flag(k)) === -1) return false;
    return true;
  }
  function prune(x) {
    if (Array.isArray(x)) return x.filter(function (e) { return !(e && typeof e === 'object' && !Array.isArray(e) && !passes(e['if'])); }).map(prune);
    if (x && typeof x === 'object') { var o = {}; for (var k in x) if (Object.prototype.hasOwnProperty.call(x, k)) o[k] = prune(x[k]); return o; }
    return x;
  }
  // Вопросы на ходу (по желанию) — на экране дороги; один объект или список
  function walkAsks(p) { return p && p.walk_ask ? [].concat(p.walk_ask) : []; }
  // Карточки доски: все определения по id — из Q.cards (с начала дела), точек, шагов и вопросов на ходу
  // Индекс строится по делу до отбора веток: карточку можно определить в одной ветке, а сослаться на неё по id — из другой
  var CARDS = {};
  function indexCards(src) {
    CARDS = {};
    var add = function (list, n) { (list || []).forEach(function (c) { if (c && typeof c === 'object' && c.id && !CARDS[c.id]) CARDS[c.id] = Object.assign({ n: n }, c); }); };
    add(src.cards, 0);
    (src.points || []).forEach(function (p) {
      add(p.cards, p.n);
      (p.steps || []).forEach(function (s) { add(s.cards, p.n); });
      walkAsks(p).forEach(function (w) { add(w.cards, p.n); });
    });
  }
  function usesCards() { return !!Q.letter || Object.keys(CARDS).length > 0; }
  function letterState(id) {
    var L = Q.letter, list = (L && L.states) || [];
    for (var i = 0; i < list.length; i++) if (list[i].id === id) return list[i];
    return null;
  }
  function speaker(who) {
    var sp = (Q.speakers || {})[who] || {};
    return { name: sp.name || who, style: sp.style || 'hero' };
  }
  function prepare(q) {
    FLAGS = readFlags(q);
    var p = prune(q);
    p.flags = FLAGS;
    return p;
  }

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
      events: [], t_start: null, t_end: null, sort: false, wrong: null, last: '', paused: false, field: FIELD,
      // формат 5: карточки доски [{id, n}], вычеркнутые {id: true}, состояние письма, увиденные «стрелки», вопросы на ходу
      cards: [], struck: {}, letter: null, arrows: {}, wa: [], reply: '', sel: [] };
  }
  function fill(s) {
    s.res = s.res || []; s.board = s.board || []; s.events = s.events || [];
    s.cards = s.cards || []; s.struck = s.struck || {}; s.arrows = s.arrows || {}; s.wa = s.wa || []; s.sel = s.sel || [];
    if (s.letter === undefined) s.letter = null;
    if (s.reply === undefined) s.reply = '';
    return s;
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
          fill(s);
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
    addCards(Q.cards, 0);
    if (Q.letter && Q.letter.start) S.letter = Q.letter.start;
    log('start');
    commit('top');
  }
  function clearSlot(o) { o.hint = 0; o.wrong = null; o.last = ''; o.reply = ''; o.sel = []; }
  function showWalk() {
    S.phase = 'walk'; S.k = 0; S.res = []; S.wa = []; clearSlot(S);
    log('walk');
    commit('top');
  }
  function arrive() {
    S.phase = 'step'; S.k = 0; S.res = []; clearSlot(S);
    log('arrive');
    enterStep();
    commit('top');
  }
  function step() { return pt().steps[S.k]; }
  // Вход в шаг: письмо-улика переходит в состояние шага (линии на просвет, кружки, оборот)
  function enterStep() {
    var st = step();
    if (st && st.letter) S.letter = st.letter;
  }
  // Последствия шага, вопроса на ходу или точки: карточки на доску, вычёркивания
  function addCards(list, n) {
    (list || []).forEach(function (c) {
      var id = typeof c === 'string' ? c : c && c.id;
      if (!id || !CARDS[id]) return;
      if (S.cards.some(function (x) { return x.id === id; })) return;
      S.cards.push({ id: id, n: n });
    });
  }
  function effects(def, n) {
    if (!def) return;
    addCards(def.cards, n);
    (def.add || []).forEach(function (id) { addCards([id], n); });
    [].concat(def.strike || []).forEach(function (id) { S.struck[id] = true; });
    [].concat(def.unstrike || []).forEach(function (id) { delete S.struck[id]; });
  }
  function resolve(r) {
    S.res[S.k] = r;
    effects(step(), pt().n);
    S.k += 1; clearSlot(S);
    if (S.k >= pt().steps.length) finishPoint(); else enterStep();
    commit('active');
  }
  function finishPoint() {
    var p = pt();
    if (p.clue) S.board.push(Object.assign({ n: p.n }, p.clue));
    effects(p, p.n);
    if (p.letter) S.letter = p.letter;
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
    effects({ cards: Q.finale_cards }, 0);
    if (Q.letter && Q.letter.end) S.letter = Q.letter.end;
    log('finish');
    commit('top');
  }

  // Контекст задания: шаг точки («step») или вопрос на ходу («w:0», «w:1»…) — у каждого своё состояние (подсказки, ошибка, выбор)
  function ctxOf(el) { var c = el && el.closest('[data-ctx]'); return c ? c.dataset.ctx : 'step'; }
  function ctxIndex(ctx) { return parseInt(String(ctx).split(':')[1], 10) || 0; }
  function ctxDef(ctx) { return ctx === 'step' ? step() : walkAsks(pt())[ctxIndex(ctx)]; }
  function ctxSlot(ctx) {
    if (ctx === 'step') return S;
    var i = ctxIndex(ctx);
    if (!S.wa[i]) { S.wa[i] = {}; clearSlot(S.wa[i]); }
    return S.wa[i];
  }
  function ctxLabel(ctx) { return ctx === 'step' ? S.k + 1 : 'w' + (ctxIndex(ctx) + 1); }
  function ctxDone(ctx, r) {
    if (ctx === 'step') return resolve(r);
    var w = ctxSlot(ctx);
    w.res = r; w.wrong = null; w.reply = '';
    effects(ctxDef(ctx), pt().n);
    commit('walk:' + ctxIndex(ctx));
  }
  // Проверка текстового ответа: ответы (answers) → ответ из частей (all) → «почти» (replies) → «половина верна» (all.missing)
  function checkText(st, text) {
    if (st.answers && matches(text, st.answers)) return { ok: true };
    var hits = (st.all || []).map(function (g) { return matches(text, Array.isArray(g) ? g : g.answers); });
    if (hits.length && hits.every(Boolean)) return { ok: true };
    var reps = st.replies || [];
    for (var i = 0; i < reps.length; i++) if (matches(text, reps[i].answers)) return { ok: false, reply: reps[i].text };
    if (hits.some(Boolean)) {
      for (var j = 0; j < hits.length; j++) if (!hits[j]) return { ok: false, reply: (st.all[j] && st.all[j].missing) || 'Половина ответа верна. Чего не хватает?' };
    }
    return { ok: false };
  }
  // Верный вариант: answer, а если задан answer_flag и флаг совпадает с id варианта — по флагу (портрет «по натуре»)
  function rightOptions(st) {
    var f = st.answer_flag && FLAGS[st.answer_flag];
    if (f && (st.options || []).some(function (x) { return String(x.id) === f; })) return [f];
    return [].concat(st.answer || st.answers || []).map(String);
  }
  function answer(text, ctx) {
    ctx = ctx || 'step';
    var st = ctxDef(ctx), o = ctxSlot(ctx), lbl = ctxLabel(ctx);
    text = String(text || '').trim();
    if (!text || !st) return;
    if (st.type === 'free') {
      log('free', { step: lbl, text: text });
      return ctxDone(ctx, { st: 'free', text: text });
    }
    var r = checkText(st, text);
    if (r.ok) {
      log('correct', { step: lbl, text: text, hints: o.hint });
      return ctxDone(ctx, { st: 'ok', text: text });
    }
    log('wrong', { step: lbl, text: text });
    o.wrong = text; o.last = text; o.reply = r.reply || '';
    commit(ctx === 'step' ? 'input' : 'input:' + ctx);
  }
  // Выбор варианта (choice): option.reply — ответ на неверный выбор
  function choose(id, ctx) {
    var st = ctxDef(ctx), o = ctxSlot(ctx), lbl = ctxLabel(ctx);
    var opt = (st.options || []).filter(function (x) { return x.id === id; })[0];
    if (!opt) return;
    if (rightOptions(st).indexOf(String(id)) !== -1) {
      log('correct', { step: lbl, text: opt.label || id, hints: o.hint });
      return ctxDone(ctx, { st: 'ok', text: opt.label || id });
    }
    log('wrong', { step: lbl, text: opt.label || id });
    o.wrong = opt.label || id; o.reply = opt.reply || '';
    commit('active');
  }
  // Выбор нескольких (pick — карточки доски; strike — вычеркнуть лишнее на снимке)
  function toggleSel(id, ctx) {
    var o = ctxSlot(ctx), st = ctxDef(ctx);
    var i = o.sel.indexOf(id);
    if (i !== -1) o.sel.splice(i, 1);
    else {
      if (st.type === 'pick' && o.sel.length >= (st.pick || 2)) o.sel.shift();
      o.sel.push(id);
    }
    o.wrong = null; o.reply = '';
    save(); render(); refocus('[data-sel="' + id + '"]');
  }
  function sameSet(a, b) { if (a.length !== b.length) return false; for (var i = 0; i < a.length; i++) if (b.indexOf(a[i]) === -1) return false; return true; }
  function checkSel(ctx) {
    var st = ctxDef(ctx), o = ctxSlot(ctx), lbl = ctxLabel(ctx), sel = o.sel.slice();
    var label = st.type === 'pick'
      ? sel.map(function (id) { return CARDS[id] ? plain(CARDS[id].title) : id; }).join(' + ')
      : sel.map(function (id) { var it = (st.items || []).filter(function (x) { return x.id === id; })[0]; return it ? plain(it.label) : id; }).join(', ');
    var ok = false, reply = '';
    if (st.type === 'pick') {
      var sets = (st.answers || []).map(function (a) { return [].concat(a); });
      ok = sets.some(function (s) { return sameSet(s, sel); });
      (st.near || []).forEach(function (n) { if (!ok && !reply && sameSet([].concat(n.set), sel)) reply = n.text; });
      if (!ok && !reply && sel.length < (st.pick || 2)) reply = 'Выберите ' + (st.pick || 2) + ' карточки.';
    } else {
      var items = st.items || [];
      var miss = items.filter(function (it) { return !it.keep && sel.indexOf(it.id) === -1; });
      var extra = items.filter(function (it) { return it.keep && sel.indexOf(it.id) !== -1; });
      ok = !miss.length && !extra.length;
      if (!ok) reply = extra.length ? (extra[0].reply || 'Кое-кого вы вычеркнули зря.') : (miss[0].reply || 'Кто-то ещё ушёл с поста.');
    }
    if (ok) { log('correct', { step: lbl, text: label, hints: o.hint }); return ctxDone(ctx, { st: 'ok', text: label }); }
    log('wrong', { step: lbl, text: label || '—' });
    o.wrong = label || '—'; o.reply = reply;
    commit('active');
  }
  function hint(level, ctx) {
    ctx = ctx || 'step';
    var o = ctxSlot(ctx), hints = ctxDef(ctx).hints || [];
    if (!hints.length || level !== o.hint || level >= hints.length) return;
    o.hint = level + 1;
    var isAnswer = o.hint >= hints.length;
    log(isAnswer ? 'reveal' : 'hint', { step: ctxLabel(ctx), level: o.hint });
    commit(ctx === 'step' ? 'active' : 'walk:' + ctxIndex(ctx));
  }
  function reveal(ctx) {
    ctx = ctx || 'step';
    var hints = ctxDef(ctx).hints || [];
    ctxDone(ctx, { st: 'revealed', text: hints[hints.length - 1] || '' });
  }
  function skip(ctx) {
    ctx = ctx || 'step';
    log('skip', { step: ctxLabel(ctx) });
    ctxDone(ctx, { st: 'skipped' });
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
  // Тег шага: явное поле tag ({"tag": "По желанию"}) или эмодзи в начале текста (формат 3)
  function tagOf(st) {
    var t = stepTag(st.text);
    if (st.tag) { t.tag = st.tag; t.cls = st.tag_style || (/^по желанию/i.test(st.tag) ? 'opt' : 'think'); }
    if (st.optional && !t.cls) t.cls = 'opt';
    return t;
  }

  // ---------- формат 5: реплики, картинки, письмо, звук, «стрелки» ----------
  // Текст сцены — строка (формат 3) или список реплик: {who, text} · {arrow, text} · {img|layers, alt, caption} · {doc: "letter"} · {audio}
  function linesHtml(src) {
    if (src == null || src === '') return '';
    if (!Array.isArray(src)) return '<div class="pl-prose">' + prose(src) + '</div>';
    var prev = null;
    return src.map(function (l) {
      // подряд у одного говорящего имя подписано один раз (для чтения с экрана — у каждой реплики)
      var who = l && typeof l === 'object' && !l.arrow && l.text != null ? (l.who || 'zilya') : null;
      var out = lineHtml(l, who && who === prev);
      if (!(l && typeof l === 'object' && l.arrow)) prev = who;
      return out;
    }).join('');
  }
  function lineHtml(l, cont) {
    if (typeof l === 'string') return '<div class="pl-prose">' + prose(l) + '</div>';
    if (!l || typeof l !== 'object') return '';
    if (l.arrow) return arrowHtml(l.arrow, l.text);
    if (l.doc === 'letter') return letterHtml(l.state || S.letter, { reveal: l.reveal });
    if (l.doc === 'card') return CARDS[l.id] ? cardHtml(l.id, { full: true }) : '';
    if (l.img !== undefined || l.layers) return figureHtml(l);
    if (l.audio && !l.text) return audioBtn(l.audio);
    var sp = speaker(l.who || 'zilya');
    var paper = sp.style === 'note' || sp.style === 'letter' || sp.style === 'card';
    var body = (sp.style === 'letter' || l.mono) ? '<div class="pl-prose pl-hand">' + prose(l.text) + '</div>' : '<div class="pl-prose">' + prose(l.text) + '</div>';
    var quiet = sp.style === 'titr' || (cont && !l.note);
    return '<div class="pl-line pl-line--' + esc(sp.style) + (paper ? ' pl-line--paper' : '') + (cont ? ' pl-line--cont' : '') + '" data-who="' + esc(l.who || '') + '">' +
      (quiet ? '<span class="visually-hidden">' + esc(sp.name) + ': </span>' : '<span class="pl-who">' + esc(sp.name) + (l.note ? ' <small>' + esc(plain(l.note)) + '</small>' : '') + '</span>') +
      body + (l.audio ? audioBtn(l.audio) : '') + '</div>';
  }
  // Картинка или заглушка: место под картинку держится всегда (aspect-ratio), нет файла — подпись вместо картинки
  function mediaSrc(src) { return /^(https?:)?\/\//.test(src) ? '' : String(src); }
  function figureHtml(l) {
    var srcs = [].concat(l.layers || l.img || []).filter(Boolean).map(mediaSrc).filter(Boolean);
    var alt = plain(l.alt || l.caption || 'Картинка');
    var ratio = l.ratio || '3 / 2';
    var ph = '<span class="pl-ph" aria-hidden="true"><b>Картинка готовится</b><span>' + esc(alt) + '</span></span>';
    var imgs = srcs.map(function (s, i) {
      return '<img src="' + esc(s) + '" alt="' + (i ? '' : esc(alt)) + '" loading="lazy" decoding="async"' + (i ? ' hidden' : '') + ' data-layer="' + i + '">';
    }).join('');
    var box = srcs.length > 1
      ? '<button type="button" class="pl-frame pl-frame--layers" data-act="layer" data-i="0" data-n="' + srcs.length + '" style="aspect-ratio:' + esc(ratio) + '" aria-label="' + esc(alt) + '. Слой 1 из ' + srcs.length + ', нажмите — следующий">' + ph + imgs +
        '<span class="pl-dots" aria-hidden="true">' + srcs.map(function (s, i) { return '<i' + (i ? '' : ' class="on"') + '></i>'; }).join('') + '</span></button>'
      : '<div class="pl-frame" style="aspect-ratio:' + esc(ratio) + '"' + (srcs.length ? '' : ' role="img" aria-label="' + esc(alt) + ' (картинка готовится)"') + '>' + ph + imgs + '</div>';
    return '<figure class="pl-fig" data-arrow-at="image">' + box + (l.caption ? '<figcaption>' + inline(l.caption) + '</figcaption>' : '') + '</figure>';
  }
  // Звук: путь к файлу — кнопка «Слушать»; true — место под озвучку («Озвучка скоро»)
  function audioBtn(src) {
    if (src === true) return '<button type="button" class="pl-audio" data-act="audio" data-arrow-at="sound" aria-disabled="true">' + ico('sound') + '<span>Озвучка скоро</span></button>';
    var s = mediaSrc(src);
    if (!s) return '';
    return '<button type="button" class="pl-audio" data-act="audio" data-src="' + esc(s) + '" data-arrow-at="sound" aria-pressed="false">' + ico('sound') + '<span>Слушать</span></button>';
  }
  // «Стрелка» — подсказка интерфейса у нужного элемента; показывается один раз (S.arrows), на том экране, где появилась
  var ARROW_NAMES = { sound: 'Звук', image: 'Картинка', board: 'Доска улик', hint: 'Подсказки', plus: 'По желанию', letter: 'Письмо', plan: 'План' };
  function arrowHtml(target, text) {
    return '<aside class="pl-arrow" data-arrow="' + esc(target) + '"><b>' + esc(ARROW_NAMES[target] || 'Подсказка') + '</b><span>' + inline(text) + '</span></aside>';
  }
  function placeArrows(key) {
    var changed = false;
    [].forEach.call(app.querySelectorAll('.pl-arrow'), function (a) {
      var t = a.dataset.arrow, seen = S.arrows[t];
      if (seen && seen !== key) { a.remove(); return; }
      if (!seen) { S.arrows[t] = key; changed = true; }
      var tg = app.querySelector('[data-arrow-at="' + t + '"]');
      if (tg && !a.closest('.pl-past')) { tg.insertAdjacentElement('afterend', a); a.classList.add('is-at'); }
      if (t === 'board') { var nb = document.querySelector('.pl-nav [data-view="board"]'); if (nb) { nb.classList.remove('pl-callme'); void nb.offsetWidth; nb.classList.add('pl-callme'); } }
    });
    if (changed) save();
  }
  // Письмо-улика: строки с пятном (▓ в тексте), линии на просвет, кончик (присох / с кружками), штамп, оборот
  function letterHtml(id, opt) {
    var L = Q.letter, s = letterState(id);
    if (!L || !s) return '';
    opt = opt || {};
    var word = s.reveal || opt.reveal || '';
    var lines = String(s.text || L.text || '').split('\n').map(function (ln) {
      var parts = inline(ln).split('▓');
      return '<span class="pl-letter-ln">' + parts.join(word
        ? '<span class="pl-stain is-light"><span class="visually-hidden">проступило слово: </span>' + esc(word) + '</span>'
        : '<span class="pl-stain" role="img" aria-label="пятно: слово не читается"></span>') + '</span>';
    }).join('');
    // кончик: присох (штриховка) или отошёл — две линии до края и кружки по обе стороны, каждый обведён дважды
    var tip = '';
    var rings = '<svg viewBox="0 0 64 26" aria-hidden="true" focusable="false"><g fill="none" stroke="var(--ink-hand)" stroke-width="1.6">' +
      '<circle cx="18" cy="13" r="7"/><circle cx="18" cy="13" r="9.5"/><circle cx="46" cy="13" r="7"/><circle cx="46" cy="13" r="9.5"/></g></svg>';
    // восьмёрка: два кружка срослись боками, обведены с нажимом (между рядами обычных кружков)
    var eight = '<svg viewBox="0 0 64 26" aria-hidden="true" focusable="false"><g fill="none" stroke="var(--ink-hand)">' +
      '<circle cx="18" cy="13" r="7" stroke-width="1.6"/><circle cx="18" cy="13" r="9.5" stroke-width="1.6"/>' +
      '<circle cx="40" cy="13" r="7" stroke-width="2.8"/><circle cx="52" cy="13" r="7" stroke-width="2.8"/></g></svg>';
    // восьмёрка формата 5.2: по бокам — ряды точек, одна восьмёрка из двух колечек с нажимом, у края — обрывок подписи (tip_note)
    var dots = '<svg viewBox="0 0 64 26" aria-hidden="true" focusable="false"><g fill="var(--ink-hand)"><circle cx="10" cy="13" r="2.6"/><circle cx="25" cy="13" r="2.6"/><circle cx="40" cy="13" r="2.6"/><circle cx="55" cy="13" r="2.6"/></g></svg>';
    var eight2 = '<svg viewBox="0 0 64 26" aria-hidden="true" focusable="false"><g fill="var(--ink-hand)"><circle cx="10" cy="13" r="2.6"/></g>' +
      '<g fill="none" stroke="var(--ink-hand)" stroke-width="2.8"><circle cx="32" cy="13" r="6.5"/><circle cx="44" cy="13" r="6.5"/></g></svg>';
    if (s.tip === 'eight' || s.tip === 'eight-dots') {
      var dotted = s.tip === 'eight-dots';
      var a1 = dotted ? eight2 : eight, a2 = dotted ? dots : rings;
      var top = s.eight_side === 'bottom' ? a2 + a1 : a1 + a2;
      var note = s.tip_note ? '<span class="pl-tip-note">' + esc(s.tip_note) + '</span>' : '';
      tip = '<span class="pl-tip pl-tip--circles' + (note ? ' has-note' : '') + '" role="img" aria-label="кончик полоски: две линии до края, по обе стороны ряды ' + (dotted ? 'точек' : 'кружков') +
        '; в одном месте — два ' + (dotted ? 'колечка' : 'кружка') + ' срослись боками, как восьмёрка, и обведены с нажимом' + (s.tip_note ? '; у края обрывок подписи: ' + esc(s.tip_note) : '') + '">' +
        (note && s.eight_side !== 'bottom' ? note : '') + top + (note && s.eight_side === 'bottom' ? note : '') + '</span>';
    }
    else tip = s.tip === 'circles'
      ? '<span class="pl-tip pl-tip--circles" role="img" aria-label="кончик полоски: две линии до края и кружки по обе стороны, каждый обведён дважды">' + rings + rings + '</span>'
      : s.tip === 'stuck' ? '<span class="pl-tip pl-tip--stuck" role="img" aria-label="кончик присох к трубочке"></span>' : '';
    var desc = [];
    if (s.ruled) desc.push('под буквами — двойная линия по линейке');
    var h = '<figure class="pl-letter' + (s.ruled ? ' is-ruled' : '') + (s.stamp ? ' has-stamp' : '') + '" data-arrow-at="letter">' +
      '<div class="pl-letter-strip"><div class="pl-letter-text">' + lines + '</div>' + tip +
      (s.stamp ? '<span class="pl-letter-stamp">' + esc(s.stamp) + '</span>' : '') + '</div>' +
      (desc.length ? '<span class="visually-hidden">' + esc(desc.join('; ')) + '</span>' : '') +
      (s.back ? '<div class="pl-letter-back"><span class="pl-label">Оборот</span><div class="pl-hand">' + prose(s.back) + '</div></div>' : '') +
      (s.caption ? '<figcaption>' + inline(s.caption) + '</figcaption>' : '') + '</figure>';
    if (s.img) h = figureHtml({ img: s.img, alt: s.alt || 'Письмо' }) + h;
    return h;
  }
  // Карточка доски улик
  function cardHtml(id, opt) {
    var c = CARDS[id];
    if (!c) return '';
    opt = opt || {};
    var struck = !!S.struck[id];
    var src = c.n ? 'Остановка ' + c.n : 'С начала дела';
    var open = (c.kind === 'photo' || c.img !== undefined) && !opt.full;
    var h = '<article class="pl-cardx' + (struck ? ' is-struck' : '') + (opt.isNew ? ' is-new' : '') + (c.kind ? ' pl-cardx--' + esc(c.kind) : '') + '" data-card="' + esc(id) + '">' +
      '<span class="pl-cardx-src">' + esc(c.source || src) + '</span>' +
      '<h3 class="pl-cardx-title">' + (struck ? '<span class="visually-hidden">Вычеркнуто: </span>' : '') + inline(c.title) + '</h3>' +
      (c.text ? '<div class="pl-cardx-text">' + prose(c.text) + '</div>' : '') +
      (opt.full && (c.img !== undefined || c.kind === 'photo') ? figureHtml({ img: c.img || null, alt: c.alt || plain(c.title), caption: c.caption, ratio: c.ratio }) : '') +
      (struck ? '<span class="pl-stamp pl-stamp--ans pl-cardx-x" aria-hidden="true">' + esc(c.struck_label || 'Вычеркнуто') + '</span>' : '') +
      (open ? '<button type="button" class="pl-btn pl-btn--ghost pl-btn--sm" data-act="card" data-id="' + esc(id) + '">Открыть</button>' : '') +
      '</article>';
    return h;
  }
  // Задание для детей: не влияет на прогресс
  function kidsHtml(k) {
    if (!k) return '';
    var list = [].concat(k).map(function (x) { return typeof x === 'string' ? { text: x } : x; });
    return '<details class="pl-kids"><summary>Задание для детей</summary>' + list.map(function (x) {
      return '<div class="pl-kids-item"><div class="pl-prose">' + prose(x.text) + '</div>' +
        (x.answer ? '<details class="pl-kids-ans"><summary>Ответ</summary><p>' + inline(x.answer) + '</p></details>' : '') + '</div>';
    }).join('') + '</details>';
  }
  function resultStamp(r) {
    if (r && r.st === 'ok') return '<span class="pl-stamp">Верно · ' + esc(plain(r.text)) + '</span>';
    if (r && r.st === 'revealed') return '<span class="pl-stamp pl-stamp--ans">Ответ · ' + esc(plain(r.text)) + '</span>';
    if (r && r.st === 'free') return '<span class="pl-stamp">' + esc(r.text) + '</span>';
    if (r && r.st === 'skipped') return '<span class="pl-stamp pl-stamp--ans">Пропущено</span>';
    return '';
  }
  function okHtml(st, r) {
    if (!r || !st.ok) return '';
    if (r.st === 'skipped' && !st.ok_on_skip) return '';
    return Array.isArray(st.ok) ? '<div class="pl-ok">' + linesHtml(st.ok) + '</div>' : '<p class="pl-ok">' + inline(st.ok) + '</p>';
  }
  function doneStep(st, r, i) {
    var t = tagOf(st);
    var body = linesHtml(st.lines) + (t.text ? '<div class="pl-prose">' + prose(t.text) + '</div>' : '');
    // реплики пройденного шага свёрнуты: экран точки не растёт на пять экранов вверх
    if (st.lines && st.lines.length > 1) {
      var who = [];
      st.lines.forEach(function (l) { if (l && l.who) { var n = speaker(l.who).name; if (who.indexOf(n) === -1 && speaker(l.who).style !== 'titr') who.push(n); } });
      body = '<details class="pl-past-more"><summary>' + esc(st.title || (who.length ? who.join(', ') : 'Сцена')) + '</summary>' + body + '</details>';
    }
    return '<section class="pl-past" data-step="' + i + '">' + (t.tag ? '<div>' + tagHtml(t) + '</div>' : '') +
      body + resultStamp(r) + okHtml(st, r) + '</section>';
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
  // Поле ответа, варианты, выбор карточек, подсказки и «Пропустить» — общие для шага точки и вопроса на ходу
  function taskInput(st, o, ctx, main) {
    var h = '';
    var hints = st.hints || [];
    var steps = hintSteps(st);
    var revealed = st.type !== 'free' && hints.length && o.hint >= hints.length;
    var stick = main ? ' pl-stick' : '';
    var aid = ctx === 'step' ? 'ans' : 'ans-' + ctx.replace(':', '');
    if (!revealed) {
      if (st.type === 'choice') {
        h += '<div class="pl-opts' + ((st.options || []).some(function (x) { return x.img !== undefined; }) ? ' pl-opts--img' : '') + '" role="group" aria-label="Варианты ответа">' +
          (st.options || []).map(function (x) {
            return '<button type="button" class="pl-opt" data-act="choose" data-id="' + esc(x.id) + '">' +
              (x.img !== undefined ? figureHtml({ img: x.img, alt: x.alt || x.label || x.id, ratio: x.ratio || '1 / 1' }) : '') +
              '<span class="pl-opt-label"><b>' + esc(x.id) + '</b>' + (x.label ? inline(x.label) : '') + '</span></button>';
          }).join('') + '</div>';
      } else if (st.type === 'pick' || st.type === 'strike') {
        var list = st.type === 'pick'
          ? S.cards.filter(function (c) { return !(CARDS[c.id] && CARDS[c.id].kind === 'version'); }).map(function (c) { return { id: c.id, label: CARDS[c.id] ? CARDS[c.id].title : c.id, sub: CARDS[c.id] && CARDS[c.id].n ? 'Остановка ' + CARDS[c.id].n : '', struck: !!S.struck[c.id] }; })
          : (st.items || []).map(function (x) { return { id: x.id, label: x.label, sub: x.sub || '' }; });
        var need = st.type === 'pick' ? (st.pick || 2) : 0;
        if (st.type === 'strike' && st.img !== undefined) h += figureHtml({ img: st.img, alt: st.alt || 'Снимок', ratio: st.ratio });
        h += '<div class="pl-sel' + (st.type === 'strike' ? ' pl-sel--strike' : '') + '" role="group" aria-label="' + (st.type === 'pick' ? 'Карточки доски: выберите ' + need : 'Вычеркните лишнее') + '">' +
          list.map(function (x) {
            var on = o.sel.indexOf(x.id) !== -1;
            return '<button type="button" class="pl-selb' + (x.struck ? ' is-struck' : '') + '" data-act="sel" data-sel="' + esc(x.id) + '" aria-pressed="' + on + '">' +
              '<span><b>' + inline(x.label) + '</b>' + (x.sub ? '<small>' + esc(x.sub) + (x.struck ? ' · вычеркнута' : '') + '</small>' : '') + '</span>' +
              '<i class="pl-selmark" aria-hidden="true"></i></button>';
          }).join('') + '</div>' +
          '<div class="pl-actions' + stick + '"><button class="pl-btn' + (main ? '' : ' pl-btn--ghost') + '" type="button" data-act="check">' +
          (st.type === 'pick' ? 'Проверить' + (o.sel.length < need ? ' (' + o.sel.length + ' из ' + need + ')' : '') : 'Проверить') + '</button></div>';
      } else {
        h += '<form class="pl-form' + stick + '" data-form="answer" autocomplete="off">' +
          '<label class="visually-hidden" for="' + aid + '">Ваш ответ</label>' +
          '<input class="pl-input" id="' + aid + '" name="ans" type="text" inputmode="text" autocapitalize="off" autocorrect="off" spellcheck="false" enterkeyhint="send" placeholder="' + esc(st.placeholder || (st.type === 'free' ? 'Ваш ответ' : 'Ответ в одно-два слова')) + '" value="' + esc(o.last) + '">' +
          '<button class="pl-btn' + (main ? '' : ' pl-btn--ghost') + '" type="submit">Ответить</button></form>';
      }
      if (o.wrong) {
        h += '<p class="pl-wrong" role="status">' + (o.reply
          ? (st.type === 'pick' || st.type === 'strike' ? '' : '«' + esc(o.wrong) + '» — ') + inline(o.reply)
          : '«' + esc(o.wrong) + '» — не подходит. Попробуйте ещё раз' + (hints.length ? ' или откройте подсказку.' : '.')) + '</p>';
      }
    }
    if (hints.length) {
      h += '<div class="pl-hints">';
      for (var j = 0; j < Math.min(o.hint, hints.length); j++) h += '<div class="pl-hint"><b>' + steps[j].name + '</b>' + inline(hints[j]) + '</div>';
      if (o.hint < hints.length) {
        var pips = '';
        for (var i = 0; i < hints.length; i++) pips += '<i' + (i < o.hint ? ' class="on"' : '') + '></i>';
        h += '<button type="button" class="pl-hintbtn" data-act="hint" data-level="' + o.hint + '" data-arrow-at="hint">' + ico('hint') +
          '<span><b>' + steps[o.hint].btn + '</b>' + (steps[o.hint].note ? '<small>' + steps[o.hint].note + '</small>' : '') + '</span>' +
          '<span class="pl-pips" aria-hidden="true">' + pips + '</span></button>';
      }
      h += '</div>';
      if (revealed) h += '<div class="pl-actions' + stick + '"><button class="pl-btn' + (main ? '' : ' pl-btn--ghost') + '" type="button" data-act="reveal">' + (main ? 'Дальше' : 'Понятно') + '</button></div>';
    }
    if (!revealed && (st.optional || st.type === 'free' || !hints.length)) h += '<button type="button" class="pl-skip" data-act="skip">Пропустить</button>';
    return h;
  }
  function activeStep(st) {
    var t = tagOf(st);
    var total = pt().steps.length;
    var h = '<section class="pl-card pl-task' + (t.cls === 'opt' ? ' pl-task--opt' : '') + '" id="active" data-step="' + S.k + '" data-ctx="step">' +
      '<div class="pl-task-top">' + tagHtml(t) + '<span class="pl-stepno">Шаг ' + (S.k + 1) + ' из ' + total + '</span></div>' +
      (st.audio ? audioBtn(st.audio) : '') + linesHtml(st.lines) +
      (t.text ? '<div class="pl-prose">' + prose(t.text) + '</div>' : '');
    if (st.type === 'board') h += '<div style="margin-top:16px">' + boardLetters(false) + '</div>';
    if (st.type === 'info' || st.type === 'board' || st.type === 'say' || !st.type) {
      return h + '<div class="pl-actions pl-stick"><button class="pl-btn" type="button" data-act="next">' + esc(st.button || 'Дальше') + '</button></div></section>';
    }
    return h + taskInput(st, S, 'step', true) + '</section>';
  }
  // Вопрос на ходу: на экране дороги, по желанию, на прогресс не влияет
  function walkAskHtml(w, i) {
    var ctx = 'w:' + i, o = ctxSlot(ctx), t = tagOf(w);
    if (!t.tag) { t.tag = 'По желанию'; t.cls = 'opt'; }
    var h = '<section class="pl-card pl-task pl-task--opt" id="walk-' + i + '" data-ctx="' + ctx + '" data-arrow-at="plus">' +
      '<div class="pl-task-top">' + tagHtml(t) + '</div>' + (w.audio ? audioBtn(w.audio) : '') + linesHtml(w.lines) +
      (t.text ? '<div class="pl-prose">' + prose(t.text) + '</div>' : '');
    if (o.res) return h + resultStamp(o.res) + okHtml(Object.assign({ ok_on_skip: true }, w), o.res) + '</section>';
    return h + taskInput(Object.assign({ optional: true }, w), o, ctx, false) + '</section>';
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
  function cardCount() { return S.cards.length + (S.letter && Q.letter ? 1 : 0); }
  // Доска улик формата 5: письмо (всегда сверху) и карточки по остановкам; вычеркнутые — штампом, не только цветом
  function cardsBoardView() {
    var n = cardCount();
    var h = head(caseName(), 'Доска улик', n ? 'На доске: ' + n : '', 2);
    if (S.board.length) h += boardLetters(true);
    if (!n) return h + '<p class="pl-empty">' + esc(plain(Q.board_empty || 'Доска пока пуста. Всё, что найдёте, будет ложиться сюда.')) + '</p>';
    h += '<!--vers-->';
    if (S.letter && Q.letter) {
      h += '<section class="pl-card pl-card--letter"><span class="pl-label">' + esc(plain(Q.letter.title || 'Письмо')) + '</span>' + letterHtml(S.letter) +
        '<button type="button" class="pl-btn pl-btn--ghost pl-btn--sm" data-act="letter">Рассмотреть крупно</button></section>';
    }
    var list = S.cards.slice().reverse();
    var isVer = function (c) { return CARDS[c.id] && CARDS[c.id].kind === 'version'; };
    var vers = list.filter(isVer), clues = list.filter(function (c) { return !isVer(c); });
    // версии — над письмом и уликами (доска версий: неверное зачёркивается с причиной)
    var vh = vers.length ? '<section class="pl-vers"><span class="pl-label">Версии</span><div class="pl-cards">' + vers.map(function (c) { return cardHtml(c.id); }).join('') + '</div></section>' : '';
    h = h.replace('<!--vers-->', vh);
    return h + (clues.length ? (vers.length ? '<span class="pl-label">Улики</span>' : '') + '<div class="pl-cards">' + clues.map(function (c) { return cardHtml(c.id); }).join('') + '</div>' : '');
  }
  function boardView() {
    if (usesCards()) return cardsBoardView();
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
    if (usesCards()) {
      return '<span class="pl-label">' + esc(caseName()) + (Q.district ? ' · ' + esc(Q.district) : '') + '</span><h2>' + esc(plain(Q.title)) + '</h2>' +
        '<span class="pl-label" style="margin-top:20px">На доске: ' + cardCount() + '</span>' +
        (S.cards.length ? '<ul class="pl-side-cards">' + S.cards.slice(-6).reverse().map(function (c) {
          var d = CARDS[c.id]; return d ? '<li' + (S.struck[c.id] ? ' class="is-struck"' : '') + '>' + (S.struck[c.id] ? '<span class="visually-hidden">Вычеркнуто: </span>' : '') + esc(plain(d.title)) + '</li>' : '';
        }).join('') + '</ul>' : '<p class="pl-small">Всё, что найдёте, будет ложиться на доску.</p>');
    }
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
        '<div class="pl-actions pl-stick"><button class="pl-btn" type="button" data-act="start">Открыть дело</button></div>' +
        '<p class="pl-small">Прогресс сохраняется на этом телефоне: можно закрыть страницу и вернуться.</p>';
    } else if (S.phase === 'intro') {
      h = '<h1 class="visually-hidden" id="top">Вступление</h1>' + (Q.intro || []).map(function (m, i) {
        if (Array.isArray(m)) return '<section class="pl-card pl-lines">' + linesHtml(m) + '</section>';
        return '<section class="pl-card' + (i === Q.intro.length - 1 ? ' pl-card--paper' : '') + '"><div class="pl-prose">' + prose(m) + '</div></section>';
      }).join('') +
        '<div class="pl-actions pl-stick"><button class="pl-btn" type="button" data-act="go">К точке 1</button></div>';
    } else if (S.phase === 'walk') {
      var p = pt();
      h = pointHead(p, 'дорога') +
        '<section class="pl-card">' + (p.walk_m ? '<p class="pl-dist">≈ ' + p.walk_m + ' м <span>пешком</span></p>' : '') +
        (p.walk_audio ? audioBtn(p.walk_audio) : '') + linesHtml(p.walk) +
        '<a class="pl-btn pl-btn--ghost pl-btn--sm pl-maplink" href="' + esc(mapLink(p)) + '" target="_blank" rel="noopener" data-track="map_open" data-track-point="' + p.n + '">' + ico('out') + 'Открыть в Яндекс Картах</a></section>' +
        walkAsks(p).map(walkAskHtml).join('') +
        checkBlock(p, false) +
        '<div class="pl-actions pl-stick"><button class="pl-btn" type="button" data-act="here">Мы на месте</button></div>' + issueBtn();
    } else if (S.phase === 'step') {
      var p2 = pt();
      h = pointHead(p2, 'на месте') + (p2.scene || p2.audio ? '<section class="pl-scene' + (Array.isArray(p2.scene) ? ' pl-lines' : '') + '">' + (p2.audio ? audioBtn(p2.audio) : '') + linesHtml(p2.scene) + '</section>' : '');
      for (var k = 0; k < S.k; k++) h += doneStep(p2.steps[k], S.res[k], k);
      h += activeStep(p2.steps[S.k]);
      h += kidsHtml(p2.kids);
      h += checkBlock(p2, true);
      h += issueBtn();
    } else if (S.phase === 'point_done') {
      var p3 = pt();
      var last = S.p + 1 >= n;
      h = pointHead(p3, 'пройдена');
      if (p3.clue) h += '<div id="active" style="scroll-margin-top:96px"><span class="pl-label">Улика № ' + S.board.length + ' — на вашей доске</span>' + clueCard(p3.clue, true) + '</div>';
      var fresh3 = S.cards.filter(function (c) { return c.n === p3.n; });
      if (fresh3.length) {
        h += '<div' + (p3.clue ? '' : ' id="active"') + ' style="scroll-margin-top:96px"><span class="pl-label">На доску улик ' + (fresh3.length === 1 ? 'легла карточка' : 'легли карточки') + '</span>' +
          '<div class="pl-cards">' + fresh3.map(function (c) { return cardHtml(c.id, { isNew: true }); }).join('') + '</div></div>';
      }
      if (p3.outro) h += '<section class="pl-scene' + (Array.isArray(p3.outro) ? ' pl-lines' : '') + '"' + (p3.clue || fresh3.length ? '' : ' id="active"') + '>' + linesHtml(p3.outro) + '</section>';
      h += '<div class="pl-actions pl-stick"><button class="pl-btn" type="button" data-act="nextpoint">' + (last ? 'К финалу' : 'К точке ' + (S.p + 2)) + '</button></div>' + issueBtn();
    } else if (S.phase === 'done') {
      h = head('Финал', 'Дело закрыто', '', 1) +
        (Q.finale || []).map(function (m) { return '<section class="pl-card' + (Array.isArray(m) ? ' pl-lines' : '') + '">' + linesHtml(m) + '</section>'; }).join('') +
        '<section class="pl-card"><span class="pl-label">Время прохождения</span><p class="pl-dist" style="font-size:28px;margin:0">' + dur((S.t_end || Date.now()) - S.t_start) + '</p></section>' +
        (S.field ? '<section class="pl-field"><span class="pl-label">Полевой тест окончен</span><p class="pl-small">Напишите заметку с впечатлениями: что понравилось больше всего, где застряли, где было скучно. Потом нажмите «Отправить отчёт» и перешлите его в Telegram.</p>' +
          '<div class="pl-actions"><button class="pl-btn pl-btn--ghost" type="button" data-act="note">Заметка</button><button class="pl-btn" type="button" data-act="report">Отправить отчёт</button></div></section>' : '') +
        '<section class="pl-card"><span class="pl-label">Как вам дело?</span><p class="pl-small">Минута в Telegram: оценка и пара слов. Честный отзыв помогает нам больше всего — особенно если где-то было непонятно.</p>' +
          '<div class="pl-actions"><a class="pl-btn" href="' + esc(botLink('done_' + QID)) + '" target="_blank" rel="noopener" data-track="review_click" data-track-quest="' + esc(QID) + '">Оценить квест</a></div></section>' +
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
    var bn = S.board.length + (usesCards() ? cardCount() : 0);
    badge.textContent = bn ? String(bn) : '';
    if (bn > lastBadge && lastKey !== null) { badge.classList.remove('bump'); void badge.offsetWidth; badge.classList.add('bump'); }
    lastBadge = bn;
    document.getElementById('side').innerHTML = playing ? sideHtml() : '';
    // «живые» детали играют один раз — когда игрок продвинулся, а не при каждой перерисовке
    var key = [S.phase, S.p, S.k, S.paused].join(':');
    app.classList.toggle('pl-fresh', key !== lastKey && view === 'point');
    lastKey = key;
    app.innerHTML = view === 'board' ? boardView() : view === 'map' ? mapView() : pointView();
    if (view === 'point') placeArrows(key); else [].forEach.call(app.querySelectorAll('.pl-arrow'), function (a) { a.remove(); });
    floatSoon();
  }
  // После перерисовки вернуть фокус на ту же кнопку (выбор карточек, варианты) — клавиатура и чтение с экрана не теряют место
  function refocus(sel) { var el = app.querySelector(sel); if (el) { try { el.focus({ preventScroll: true }); } catch (e) { el.focus(); } } }
  // Кнопка «К заданию»: только на телефоне и только пока главная кнопка задания вне экрана
  var floatEl = document.getElementById('float'), floatRaf = 0;
  function updateFloat() {
    floatRaf = 0;
    var btn = view === 'point' && !S.paused ? app.querySelector('.pl-stick .pl-btn') : null;
    var show = false, up = false;
    if (btn && window.innerWidth < 1024) {
      var r = btn.getBoundingClientRect();
      var nav = document.getElementById('tabs');
      var bottom = nav && !nav.hidden ? nav.getBoundingClientRect().top : window.innerHeight;
      var top = document.querySelector('.pl-top').getBoundingClientRect().bottom;
      show = r.top > bottom - 8 || r.bottom < top + 8;
      up = r.bottom < top + 8;
    }
    floatEl.hidden = !show;
    floatEl.classList.toggle('is-up', up);
  }
  function floatSoon() { if (!floatRaf) floatRaf = requestAnimationFrame(updateFloat); }
  window.addEventListener('scroll', function () { if (S) floatSoon(); }, { passive: true });
  window.addEventListener('resize', function () { if (S) floatSoon(); });

  function smooth() {
    try { return window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth'; } catch (e) { return 'auto'; }
  }
  function commit(focus) {
    view = 'point';
    save();
    render();
    if (focus === 'top') {
      window.scrollTo(0, 0);
    } else if (focus === 'active') {
      var el = document.getElementById('active');
      if (el) el.scrollIntoView({ block: 'start', behavior: smooth() });
    } else if (focus === 'input') {
      var inp = document.getElementById('ans');
      if (inp) { inp.focus(); inp.select(); }
    } else if (/^input:w:\d+$/.test(focus || '')) {
      var wi = document.getElementById('ans-w' + focus.split(':')[2]);
      if (wi) { wi.focus(); wi.select(); }
    } else if (/^walk:\d+$/.test(focus || '')) {
      var wc = document.getElementById('walk-' + focus.split(':')[1]);
      if (wc) wc.scrollIntoView({ block: 'start', behavior: smooth() });
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
    } else if (kind === 'letter') {
      title = plain((Q.letter && Q.letter.title) || 'Письмо');
      body = letterHtml(S.letter) + (Q.letter && Q.letter.note ? '<p class="pl-small">' + inline(Q.letter.note) + '</p>' : '');
    } else if (/^card:/.test(kind)) {
      var cid = kind.slice(5);
      title = CARDS[cid] ? plain(CARDS[cid].title) : 'Улика';
      body = cardHtml(cid, { full: true });
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
    hint: function (el) { hint(parseInt(el.dataset.level, 10), ctxOf(el)); },
    reveal: function (el) { reveal(ctxOf(el)); },
    skip: function (el) { skip(ctxOf(el)); },
    choose: function (el) { choose(el.dataset.id, ctxOf(el)); },
    sel: function (el) { toggleSel(el.dataset.sel, ctxOf(el)); },
    check: function (el) { checkSel(ctxOf(el)); },
    letter: function () { openSheet('letter'); },
    card: function (el) { openSheet('card:' + el.dataset.id); },
    layer: function (el) {
      var n = +el.dataset.n || 1, i = ((+el.dataset.i || 0) + 1) % n;
      el.dataset.i = i;
      [].forEach.call(el.querySelectorAll('img[data-layer]'), function (im) { im.hidden = +im.dataset.layer !== i; });
      [].forEach.call(el.querySelectorAll('.pl-dots i'), function (d, j) { d.classList.toggle('on', j === i); });
      el.setAttribute('aria-label', el.getAttribute('aria-label').replace(/Слой \d+ из/, 'Слой ' + (i + 1) + ' из'));
    },
    audio: function (el) { playAudio(el); },
    nextpoint: nextPoint,
    totask: function () {
      var t = document.getElementById('active');
      if (!t) return;
      t.scrollIntoView({ block: 'start', behavior: smooth() });
      var inp = document.getElementById('ans');
      if (inp) { try { inp.focus({ preventScroll: true }); } catch (e) { /* без фокуса */ } }
    },
    view: function (el) {
      var v = el.dataset.view;
      if (v === view && v !== 'point') return;
      var same = v === view;
      view = v; render();
      if (!same) { window.scrollTo(0, 0); return; }
      // повторное нажатие «Точка» — вернуться к текущему заданию
      var t = document.getElementById('active') || document.getElementById('top');
      if (!t) return;
      t.scrollIntoView({ block: 'start', behavior: smooth() });
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
      answer(f.elements.ans.value, ctxOf(f));
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

  // ---------- звук: один плеер на страницу; файла нет — понятный тост, квест не ломается ----------
  var voice = null, voiceBtn = null;
  function playAudio(el) {
    if (el.getAttribute('aria-disabled') === 'true') { toast('Озвучка появится позже — пока читаем глазами'); return; }
    var src = el.dataset.src;
    if (!src) return;
    if (voice && voiceBtn === el && !voice.paused) { voice.pause(); return; }
    if (voice) { voice.pause(); }
    voice = new Audio(src); voiceBtn = el;
    var setOn = function (on) { if (voiceBtn) { voiceBtn.setAttribute('aria-pressed', on ? 'true' : 'false'); var t = voiceBtn.querySelector('span'); if (t) t.textContent = on ? 'Пауза' : 'Слушать'; } };
    voice.addEventListener('play', function () { setOn(true); });
    voice.addEventListener('pause', function () { setOn(false); });
    voice.addEventListener('ended', function () { setOn(false); });
    voice.addEventListener('error', function () { setOn(false); toast('Озвучка ещё не готова — читаем глазами'); });
    var pr = voice.play();
    if (pr && pr.catch) pr.catch(function () { /* ошибку покажет событие error */ });
  }
  // Картинка не загрузилась — остаётся заглушка с подписью, раскладка не прыгает
  document.addEventListener('error', function (e) {
    var t = e.target;
    var fr = t && t.tagName === 'IMG' && t.closest('.pl-frame');
    if (!fr) return;
    t.classList.add('is-broken');
    if (fr.tagName !== 'BUTTON' && t.alt) { fr.setAttribute('role', 'img'); fr.setAttribute('aria-label', t.alt + ' (картинка готовится)'); }
  }, true);

  // ---------- код доступа (docs/codes.md): так же, как scripts/codes.py ----------
  var CODE_KEY = 'dvorami:code:' + QID;
  var CODE_RE = /^[2-9A-HJKMNP-Z]{8}$/;
  var HOMO = { 'А': 'A', 'В': 'B', 'Е': 'E', 'К': 'K', 'М': 'M', 'Н': 'H', 'О': 'O', 'Р': 'P', 'С': 'C', 'Т': 'T', 'Х': 'X', 'У': 'Y' };
  function normCode(s) {
    s = String(s || '');
    try { s = s.normalize('NFKC'); } catch (e) { /* старый браузер */ }
    return s.toUpperCase().replace(/[АВЕКМНОРСТХУ]/g, function (c) { return HOMO[c]; }).replace(/[^\p{L}\p{N}]/gu, '');
  }
  function showCode(s) { var n = normCode(s); return CODE_RE.test(n) ? n.slice(0, 4) + '-' + n.slice(4) : String(s || '').trim(); }
  function bytes(b64) { var bin = atob(b64), out = new Uint8Array(bin.length); for (var i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i); return out; }
  function join(a, b) { var out = new Uint8Array(a.length + b.length); out.set(a, 0); out.set(b, a.length); return out; }
  function hex(buf) { return Array.prototype.map.call(new Uint8Array(buf), function (x) { return ('0' + x.toString(16)).slice(-2); }).join(''); }
  // Код → PBKDF2-SHA256 → идентификатор и ключ-обёртка → ключ содержимого → дело. Неверный код — null
  function unlock(L, code) {
    var sub = window.crypto && window.crypto.subtle;
    if (!sub || !window.TextEncoder) return Promise.reject(new Error('nocrypto'));
    var n = normCode(code);
    if (!n) return Promise.resolve(null);
    var enc = new TextEncoder(), dk;
    return sub.importKey('raw', enc.encode(n), 'PBKDF2', false, ['deriveBits']).then(function (base) {
      return sub.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: bytes(L.kdf.salt), iterations: L.kdf.iter }, base, 256);
    }).then(function (bits) {
      dk = new Uint8Array(bits);
      return sub.digest('SHA-256', join(enc.encode('dvorami:id:'), dk));
    }).then(function (idh) {
      var w = L.keys[hex(idh).slice(0, 32)];
      if (!w) return null;
      w = bytes(w);
      return sub.digest('SHA-256', join(enc.encode('dvorami:wrap:'), dk)).then(function (wk) {
        return sub.importKey('raw', wk, 'AES-GCM', false, ['decrypt']);
      }).then(function (wkey) {
        return sub.decrypt({ name: 'AES-GCM', iv: w.slice(0, 12), additionalData: enc.encode('dvorami:key:' + L.quest) }, wkey, w.slice(12));
      }).then(function (k) {
        return sub.importKey('raw', k, 'AES-GCM', false, ['decrypt']);
      }).then(function (key) {
        return sub.decrypt({ name: 'AES-GCM', iv: bytes(L.iv), additionalData: enc.encode('dvorami:quest:' + L.quest) }, key, bytes(L.data));
      }).then(function (plainBuf) { return JSON.parse(new TextDecoder().decode(plainBuf)); });
    });
  }
  // Код из ссылки …/#code=XXXX-XXXX (или ?code=): страница дела забирает его в <head> и убирает из адреса
  function linkCode() {
    if (window.__dvoramiCode) { var c = window.__dvoramiCode; window.__dvoramiCode = ''; return c; }
    var m = (location.hash + '&' + location.search.replace(/^\?/, '&')).match(/(?:^#|&)code=([^&#]+)/);
    if (!m) return '';
    try { history.replaceState(null, '', location.pathname + location.search.replace(/([?&])code=[^&#]*&?/, '$1').replace(/[?&]$/, '')); } catch (e) { /* адрес не меняем */ }
    try { return decodeURIComponent(m[1]); } catch (e) { return m[1]; }
  }
  var LOCKED = null, codeBusy = false;
  var menuBtn = document.querySelector('.pl-menu-btn');
  function codeError(raw, why) {
    var n = normCode(raw);
    if (why === 'nocrypto') return 'Этот браузер не умеет проверять код. Откройте ссылку в свежем Safari, Chrome или Яндекс Браузере.';
    if (why === 'saved') return 'Код, сохранённый на этом телефоне, больше не открывает дело. Введите код ещё раз или напишите нам.';
    if (!n) return 'Введите код: 8 знаков, например 7K4M-Q2PX.';
    if (/[01OIL]/.test(n) && n.length <= 8) return 'В кодах нет букв O, I, L и цифр 0, 1. Проверьте эти знаки: скорее всего, там другая буква или цифра.';
    if (n.length === 12) return 'Мастер-код не подошёл. Проверьте, что он совпадает с секретом QUEST_MASTER_CODE на GitHub: значение секрета посмотреть нельзя, но его можно задать заново.';
    if (n.length !== 8) return 'В коде 8 знаков: четыре, дефис, ещё четыре. Сейчас введено ' + n.length + '.';
    return 'Код «' + esc(showCode(raw)) + '» не подошёл. Проверьте буквы и цифры или напишите нам — поможем.';
  }
  // Причина отказа для цели Метрики code_fail (T-69, docs/analytics.md) — те же ветки, что в codeError; сам код в Метрику не уходит
  function codeReason(raw, why) {
    var n = normCode(raw);
    if (why === 'nocrypto') return 'nocrypto';
    if (why === 'saved') return 'saved_invalid';
    if (!n) return 'empty';
    if (/[01OIL]/.test(n) && n.length <= 8) return 'bad_chars';
    if (n.length === 12) return 'wrong_master';
    if (n.length !== 8) return 'length';
    return 'wrong';
  }
  function codeFail(raw, source, why) {
    track('code_fail', { quest: QID, source: source, reason: codeReason(raw, why) });
    return codeError(raw, why);
  }
  function codeView(value, error) {
    var where = document.getElementById('where');
    where.textContent = CASE_NO ? caseName() : '';
    if (menuBtn) menuBtn.hidden = true;
    var buy = document.body.dataset.caseUrl;
    var L = LOCKED || {};
    app.innerHTML = head(((L.district ? L.district + ' · ' : '') + caseName()), L.title || 'Дело', '', 0) +
      '<form class="pl-card pl-code" data-form="code" autocomplete="on" novalidate>' +
      '<label class="pl-code-label" for="code">Код доступа</label>' +
      '<p class="pl-small" id="code-help">Он в письме после покупки или у того, кто вас пригласил. Регистр и дефис не важны.</p>' +
      '<input class="pl-input pl-code-input" id="code" name="code" type="text" inputmode="text" autocomplete="one-time-code" autocapitalize="characters" autocorrect="off" spellcheck="false" enterkeyhint="go" maxlength="40" placeholder="XXXX-XXXX" aria-describedby="code-help' + (error ? ' code-err' : '') + '"' + (error ? ' aria-invalid="true"' : '') + ' value="' + esc(value || '') + '">' +
      (error ? '<p class="pl-wrong" id="code-err" role="alert">' + error + '</p>' : '') +
      '<div class="pl-actions"><button class="pl-btn" type="submit" id="code-go">Открыть дело</button></div>' +
      '<p class="pl-small">Код запомнится на этом телефоне — второй раз вводить не придётся.</p></form>' +
      '<p class="pl-small">' + (buy ? 'Нет кода? <a href="' + esc(buy) + '">Как получить дело</a>. ' : '') +
      'Код не подходит — <a href="' + esc(BOT ? 'https://t.me/' + BOT : CHANNEL) + '" target="_blank" rel="noopener">напишите нам в Telegram</a>.</p>';
    var inp = document.getElementById('code');
    if (inp && error) { inp.focus(); inp.select(); }
  }
  function tryCode(raw, source) {
    if (codeBusy) return;
    codeBusy = true;
    var btn = document.getElementById('code-go');
    if (btn) { btn.textContent = 'Проверяем…'; btn.setAttribute('aria-busy', 'true'); }
    unlock(LOCKED, raw).then(function (q) {
      codeBusy = false;
      if (!q) {
        if (source === 'saved') store.del(CODE_KEY);
        return codeView(source === 'saved' ? '' : showCode(raw), codeFail(raw, source, source === 'saved' ? 'saved' : ''));
      }
      // сохранённый код открывает дело при каждом заходе — это не новый ввод, цель не шлём
      if (source !== 'saved') track('code_ok', { quest: QID, source: source });
      store.set(CODE_KEY, normCode(raw));
      if (menuBtn) menuBtn.hidden = false;
      begin(q);
    }, function (e) {
      codeBusy = false;
      codeView(showCode(raw), codeFail(raw, source, e && e.message === 'nocrypto' ? 'nocrypto' : ''));
    });
  }
  document.addEventListener('submit', function (e) {
    var f = e.target;
    if (f.dataset.form !== 'code') return;
    e.preventDefault();
    var v = f.elements.code.value;
    if (!normCode(v)) return codeView('', codeFail(v, 'typed', ''));
    tryCode(v, 'typed');
  });

  // ---------- запуск ----------
  function begin(q) {
    Q = prepare(q);
    indexCards(q);
    S = load();
    if (S.phase !== 'idle') { log('reload'); save(); }
    themeColor();
    render();
    var el = document.getElementById('active');
    if (el && S.phase === 'step') el.scrollIntoView({ block: 'start' });
  }
  function getJSON(url) {
    return fetch(url, { cache: 'no-cache' }).then(function (r) {
      if (r.status === 404) return null;
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.json();
    });
  }
  function boot() {
    var fromLink = linkCode();
    getJSON('quest.locked.json').then(function (L) {
      if (!L) {
        // открытое дело — только локальная разработка и макеты; на стенд quest.json не попадает (pages.yml)
        return getJSON('quest.json').then(function (q) { if (!q) throw new Error('нет файла дела'); begin(q); });
      }
      LOCKED = L;
      themeColor();
      var saved = store.get(CODE_KEY);
      if (fromLink) { codeView(showCode(fromLink)); return tryCode(fromLink, 'link'); }
      if (saved) { codeView(''); return tryCode(saved, 'saved'); }
      codeView('');
    }).catch(function (err) {
      app.innerHTML = '<section class="pl-card" id="top"><span class="pl-label">Не загрузилось</span><p>Нет связи или файл квеста недоступен (' + esc(err.message) + '). Проверьте интернет и попробуйте ещё раз.</p>' +
        '<div class="pl-actions"><button class="pl-btn" type="button" onclick="location.reload()">Обновить</button></div></section>';
    });
  }

  // Для проверок: функции сверки ответов и состояние
  window.__dvorami = { norm: norm, matches: matches, state: function () { return S; }, quest: function () { return Q; }, report: function () { return report(); },
    flags: function () { return FLAGS; }, cards: function () { return CARDS; } };

  if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost' || location.hostname === '127.0.0.1')) {
    navigator.serviceWorker.register('../sw.js').catch(function () { /* без офлайна */ });
  }
  boot();
})();

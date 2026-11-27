/* Дворами — веб-плеер квеста.
   Дело зашифровано (docs/codes.md): читает quest.locked.json из папки страницы и открывает его кодом доступа —
   экран кода, код из ссылки #code=XXXX-XXXX или сохранённый на телефоне. Нет quest.locked.json — читает открытый
   quest.json (локальная разработка, макеты). Данные дела — формат scripts/quest_bot.py; плеер повторяет логику бота:
   вступление → точки по порядку (дорога → «Мы на месте» → сцена → шаги) → улика → финал.
   Экран — единый каркас для всех дел (platform/design/player-frame.md): страница дела даёт только
   <body data-quest data-case-no>, <main id="app"> и theme.css; шапку, навигацию и шторку строит этот файл.
   ?field=1 — режим полевого теста: «что проверить», тайминг, ошибки, подсказки, заметки, отчёт.
   Экран прохождения — по мини-шагам (quests/zilart/field/player-ui-v2.md): один экран — одна реплика, блок, загадка или разбор;
   «Дальше» и «назад», оглавление пройденного, режим «читаю / слушаю и читаю», финальная карточка с оценкой.
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
    sound: '<path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4Z"/><path d="M15.5 9a4 4 0 0 1 0 6M18 6.5a7.5 7.5 0 0 1 0 11"/>',
    back: '<path d="M14.5 5.5 8 12l6.5 6.5"/>',
    list: '<path d="M9 7h11M9 12h11M9 17h11"/><path d="M4.5 7h.1M4.5 12h.1M4.5 17h.1"/>',
    chev: '<path d="m7 10 5 5 5-5"/>',
    play: '<path d="M8.5 5.5v13l10-6.5Z"/>'
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
  var FLAGS = {}, URL_FLAGS = {};
  // Ветки «по часам» (H-45, docs/quest-format.md, раздел 6а): Q.clock = {"zum": {"label": "ТЦ «ЗУМ»", "open": "10:00", "close": "22:00"}}.
  // Флаг такой ветки — "open" / "closed": по местному времени Москвы на подходе к точке или кнопкой «Двери закрыты».
  // Отбор по таким флагам — не при загрузке, а при показе (реплики дороги, сцены, итога точки и walk_m); ?flags=zum:closed — для проверки.
  var CLOCK = {}, CLOCK_SEC = -1;
  function readFlags(q) {
    var f = {}, d = q.flags || {};
    for (var k in d) if (Object.prototype.hasOwnProperty.call(d, k)) f[k] = String(d[k]);
    var m = location.search.match(/[?&]flags=([^&#]+)/);
    if (m) {
      var raw = m[1];
      try { raw = decodeURIComponent(raw); } catch (e) { /* как есть */ }
      raw.split(',').forEach(function (p) { var kv = p.split(/[:=]/); if (kv[0] && kv[1]) { f[kv[0].trim()] = kv[1].trim(); URL_FLAGS[kv[0].trim()] = kv[1].trim(); } });
    }
    return f;
  }
  // Минуты от полуночи по Москве; ?at=21:30 — подставное время для проверки
  function mskMinutes() {
    var m = location.search.match(/[?&]at=(\d{1,2})(?::|%3A)(\d{2})/i);
    if (m) return (+m[1]) * 60 + (+m[2]);
    try {
      var t = new Date().toLocaleTimeString('en-GB', { timeZone: 'Europe/Moscow', hour12: false, hour: '2-digit', minute: '2-digit' }).split(':');
      return ((+t[0]) % 24) * 60 + (+t[1]);
    } catch (e) { var d = new Date(); return ((d.getUTCHours() + 3) % 24) * 60 + d.getUTCMinutes(); }
  }
  function hm2min(s) { var m = String(s || '').match(/^(\d{1,2}):(\d{2})$/); return m ? (+m[1]) * 60 + (+m[2]) : null; }
  // open/close по часам; закрытие после полуночи («10:00–02:00») тоже работает; без часов — считаем открытым
  function openAt(def, min) {
    var a = hm2min(def.open), b = hm2min(def.close);
    if (a == null || b == null || a === b) return true;
    return a < b ? (min >= a && min < b) : (min >= a || min < b);
  }
  // Значение ветки «по часам» для точки: выбор, сделанный на подходе (по часам или рукой), запоминается — экран не меняется на ходу.
  // Чистая функция: запись делает fixClock() в событии показа дороги (T-99), отрисовка состояние не меняет
  function clockVal(k, sec) {
    if (URL_FLAGS[k]) return URL_FLAGS[k];
    var rec = S && S.clk && S.clk[sec] && S.clk[sec][k];
    if (rec) return rec.v;
    return openAt(CLOCK[k], mskMinutes()) ? 'open' : 'closed';
  }
  // T-99: ветка «по часам» фиксируется, когда игрок впервые видит дорогу к точке (showWalk), и при загрузке сохранения без записи
  function fixClock(sec) {
    var p = Q && Q.points[sec];
    if (!p || !S || !S.clk) return;
    pointClockKeys(p).forEach(function (k) {
      if (URL_FLAGS[k]) return;
      var c = S.clk[sec] = S.clk[sec] || {};
      if (!c[k]) c[k] = { v: openAt(CLOCK[k], mskMinutes()) ? 'open' : 'closed', by: 'time' };
    });
  }
  // Строка «о свете» (5.4): реплика с "sun": N остаётся, только если до захода солнца меньше N минут (или он уже был);
  // {время} — заход по дате для координат первой точки, московское время. Без зависимостей: формула NOAA, точность ±2 мин
  function sunsetMsk(lat, lon) {
    var now = new Date(Date.now() + 3 * 3600e3);
    var n = Math.floor((now - Date.UTC(now.getUTCFullYear(), 0, 1)) / 864e5) + 1;
    var g = 2 * Math.PI / 365 * (n - 1), r = Math.PI / 180;
    var eq = 229.18 * (0.000075 + 0.001868 * Math.cos(g) - 0.032077 * Math.sin(g) - 0.014615 * Math.cos(2 * g) - 0.040849 * Math.sin(2 * g));
    var d = 0.006918 - 0.399912 * Math.cos(g) + 0.070257 * Math.sin(g) - 0.006758 * Math.cos(2 * g) + 0.000907 * Math.sin(2 * g) - 0.002697 * Math.cos(3 * g) + 0.00148 * Math.sin(3 * g);
    var c = Math.cos(90.833 * r) / (Math.cos(lat * r) * Math.cos(d)) - Math.tan(lat * r) * Math.tan(d);
    if (!(c >= -1 && c <= 1)) return null;
    return Math.round(720 - 4 * (lon - Math.acos(c) / r) - eq + 180);
  }
  // Строки «о свете» из вступления повторяются на обложке: решать, идти ли сейчас, нужно до «Открыть дело»
  function sunNote() {
    var out = [];
    (function walk(x) { if (Array.isArray(x)) x.forEach(walk); else if (x && typeof x === 'object' && typeof x.sun === 'number' && x.text) out.push(x.text); })(Q.intro);
    return out.map(function (t) { return '<p class="pl-small pl-sun">' + esc(plain(t)) + '</p>'; }).join('');
  }
  function hhmm(min) { min = ((min % 1440) + 1440) % 1440; return Math.floor(min / 60) + ':' + String(min % 60).padStart(2, '0'); }
  function sunLines(x, set) {
    if (Array.isArray(x)) return x.filter(function (e) { return !(e && typeof e === 'object' && typeof e.sun === 'number' && (set == null || set - mskMinutes() >= e.sun)); })
      .map(function (e) { return sunLines(e, set); });
    if (x && typeof x === 'object') {
      var o = {}; for (var k in x) if (Object.prototype.hasOwnProperty.call(x, k)) o[k] = sunLines(x[k], set);
      if (typeof x.sun === 'number' && typeof o.text === 'string') o.text = o.text.replace(/\{время\}/g, hhmm(set));
      return o;
    }
    return x;
  }
  function flag(k) { return CLOCK[k] ? (CLOCK_SEC < 0 ? (URL_FLAGS[k] || 'open') : clockVal(k, CLOCK_SEC)) : (FLAGS[k] || 'A'); }
  function condKeys(cond) {
    if (!cond) return [];
    if (typeof cond === 'string') { var m = cond.match(/^\s*([\w-]+)\s*!?=/); return m ? [m[1]] : []; }
    return Object.keys(cond);
  }
  function isClockCond(cond) { return condKeys(cond).some(function (k) { return !!CLOCK[k]; }); }
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
  // Ветки по часам при загрузке не отбираются (решаются при показе — clockPick)
  function prune(x) {
    if (Array.isArray(x)) return x.filter(function (e) { return !(e && typeof e === 'object' && !Array.isArray(e) && !isClockCond(e['if']) && !passes(e['if'])); }).map(prune);
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
    return { name: sp.name || who, style: sp.style || 'hero', img: sp.img || '' };
  }
  function clockKeysOf(list) {
    var out = [];
    (Array.isArray(list) ? list : []).forEach(function (e) { if (e && typeof e === 'object') condKeys(e['if']).forEach(function (k) { if (CLOCK[k] && out.indexOf(k) === -1) out.push(k); }); });
    return out;
  }
  // Ветка по часам допустима в репликах walk / scene / outro и в walk_m списком; у точки и шага — нет (число шагов не должно меняться на ходу)
  function clockWarn(q) {
    (q.points || []).forEach(function (p) {
      if (p && isClockCond(p['if'])) console.warn('clock: условие по часам у точки ' + p.n + ' не поддерживается — только в walk, scene, outro, walk_m');
      (p.steps || []).forEach(function (st, i) { if (st && isClockCond(st['if'])) console.warn('clock: условие по часам у шага ' + (i + 1) + ' точки ' + p.n + ' не поддерживается'); });
    });
  }
  // Отбор реплик (или вариантов walk_m) по веткам «по часам» для точки sec
  // Строка с условием пишется объектом {"text": "…", "if": "zum=closed"} — после отбора она снова простая строка (абзац дороги)
  function bareText(e) {
    if (!e || typeof e !== 'object' || Array.isArray(e) || typeof e.text !== 'string') return e;
    for (var k in e) if (k !== 'text' && k !== 'if') return e;
    return e.text;
  }
  function clockPick(list, sec) {
    if (!Array.isArray(list) || !clockKeysOf(list).length) return list;
    CLOCK_SEC = sec;
    try { return list.filter(function (e) { return !(e && typeof e === 'object' && !Array.isArray(e) && isClockCond(e['if']) && !passes(e['if'])); }).map(bareText); }
    finally { CLOCK_SEC = -1; }
  }
  function pointClockKeys(p) {
    var ks = [];
    [p.walk, p.scene, p.outro, p.walk_m].forEach(function (l) { clockKeysOf(l).forEach(function (k) { if (ks.indexOf(k) === -1) ks.push(k); }); });
    return ks;
  }
  function walkM(p, sec) {
    var w = p.walk_m;
    if (!Array.isArray(w)) return w;
    var hit = clockPick(w, sec)[0];
    return hit && typeof hit === 'object' ? hit.m : hit;
  }
  function prepare(q) {
    CLOCK = {};
    var cq = q.clock || {};
    for (var ck in cq) if (Object.prototype.hasOwnProperty.call(cq, ck) && cq[ck] && typeof cq[ck] === 'object') CLOCK[ck] = cq[ck];
    FLAGS = readFlags(q);
    clockWarn(q);
    var p = prune(q);
    var p0 = (p.points || [])[0] || {};
    p = sunLines(p, sunsetMsk(+p0.lat || 55.75, +p0.lon || 37.62));
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
    reveal: 'answer_reveal', skip: 'step_skip', finish: 'quest_finish', stop: 'quest_pause', resume: 'quest_resume',
    // H-68: неверный ответ — где застревают и сколько ловит «почти»; текст ответа в Метрику не уходит (только в журнал на телефоне)
    wrong: 'answer_wrong' };
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

  // ---------- проверка ответа: site/play/answer.js (window.DvAnswer, подключается до player.js) ----------
  // Нормализация, числа словом и цифрой, «почти» — там же; тесты — scripts/answer_check.js.
  var ANS = window.DvAnswer || { norm: function (s) { return String(s || "").trim().toLowerCase(); }, checkText: function () { return { ok: false }; }, matches: function () { return false; } }; // answer.js не загрузился — плеер не падает

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
      cards: [], struck: {}, letter: null, arrows: {}, wa: [], reply: '', sel: [],
      // мини-шаги: f — экран, на котором игрок сейчас (в пределах точки); hist — ответы пройденных точек, чтобы их можно было пересмотреть
      f: 0, hist: {}, clk: {},
      // seed — порядок вариантов выбора для этого игрока (H-73): постоянный, переживает перезагрузку
      seed: newSeed() };
  }
  function newSeed() { return Math.floor(Math.random() * 4294967296) >>> 0; }
  function fill(s) {
    s.res = s.res || []; s.board = s.board || []; s.events = s.events || [];
    s.cards = s.cards || []; s.struck = s.struck || {}; s.arrows = s.arrows || {}; s.wa = s.wa || []; s.sel = s.sel || [];
    if (s.letter === undefined) s.letter = null;
    if (s.reply === undefined) s.reply = '';
    s.hist = s.hist || {};
    s.clk = s.clk || {};   // ветки «по часам»: {номер раздела: {ключ: {v: "open"|"closed", by: "time"|"hand"}}}
    if (typeof s.f !== 'number') s.f = -1;   // сохранение до мини-шагов: место подберёт fixCursor()
    if (typeof s.seed !== 'number') s.seed = newSeed();   // сохранение до перемешивания вариантов
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
          // H-74: дело обновилось, а игрок в середине старой версии — спросить: начать заново или продолжить (pointView)
          if (s.phase !== 'idle' && Q.version != null && String(s.version) !== String(Q.version) && s.ver_from == null) s.ver_from = s.version == null ? '' : String(s.version);
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
      if (kind === 'wrong') { gp.near = e.near ? 1 : 0; gp.kind = e.kind_of || 'text'; }
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
    S.phase = 'walk'; S.k = 0; S.res = []; S.wa = []; S.f = 0; clearSlot(S);
    fixClock(S.p);
    log('walk');
    commit('top');
  }
  function arrive() {
    S.phase = 'step'; S.k = 0; S.res = []; clearSlot(S);
    log('arrive');
    enterStep();
    S.f = frameIndex(framesOf(S.p), function (x) { return x.kind === 'arrive'; }, 0);
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
    // следующий экран — разбор ответа, следующий шаг или «точка пройдена»: он уже построен сразу за текущим
    S.f = Math.min(S.f + 1, framesOf(S.p).length - 1);
    moveDir = 'fwd';
    commit('top');
  }
  function finishPoint() {
    var p = pt();
    if (p.clue) S.board.push(Object.assign({ n: p.n }, p.clue));
    effects(p, p.n);
    if (p.letter) S.letter = p.letter;
    if (p.steps.some(function (s) { return s.type === 'board'; })) S.sort = true;
    log('done');
    S.phase = 'point_done';
    S.hist[S.p] = { res: S.res.slice(), wa: S.wa.slice() };
  }
  function nextPoint() {
    if (S.p + 1 >= Q.points.length) return finishQuest();
    S.p += 1;
    showWalk();
  }
  function finishQuest() {
    S.phase = 'done'; S.f = 0;
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
    commit('same', '#walk-' + ctxIndex(ctx) + ' .pl-stamp');
  }
  // Проверка текстового ответа: ответы (answers) → ответ из частей (all) → «почти» (replies) → «половина верна» (all.missing)
  // → опечатка («Почти! Проверьте написание», не засчитывается) — DvAnswer.checkText
  function checkText(st, text) { return ANS.checkText(st, text); }
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
    log('wrong', r.near ? { step: lbl, text: text, near: true } : { step: lbl, text: text });
    o.wrong = text; o.last = text; o.reply = r.reply || '';
    // неверный ответ: экран не перерисовываем — поле остаётся на месте, клавиатура не закрывается, под полем появляется сообщение
    save();
    var box = document.getElementById(ctx === 'step' ? 'active' : 'walk-' + ctxIndex(ctx));
    var form = box && box.querySelector('.pl-form');
    if (!form) return commit('same');
    var old = box.querySelector('.pl-wrong');
    if (old) old.remove();
    form.insertAdjacentHTML('afterend', wrongHtml(st, o));
    var inp = form.elements.ans;
    try { inp.focus({ preventScroll: true }); } catch (e) { inp.focus(); }
    inp.select();
    box.querySelector('.pl-wrong').scrollIntoView({ block: 'nearest', behavior: smooth() });
  }
  // Порядок вариантов (H-73): перемешан, чтобы верный не угадывался по месту; для игрока постоянный — от id дела, точки, шага
  // и его seed в сохранении. Не перемешиваются: "shuffle": false; нумерованные варианты (id из одного знака: А–Г, 1–3 —
  // на них ссылаются рисунки и подписи); вопросы, где засчитывается любой вариант (порядок там — смысловой: 38, 138, 238…).
  function isMarked(ops) { return ops.every(function (x) { return /^[0-9A-Za-zА-Яа-яЁё]$/.test(String(x.id)); }); }
  function fixedOrder(st) {
    var ops = st.options || [], ids = [].concat(st.answer || st.answers || []).map(String);
    return st.shuffle === false || ops.length < 2 || isMarked(ops) || ops.every(function (x) { return ids.indexOf(String(x.id)) !== -1; });
  }
  function seeded(str) {
    var h = 2166136261;
    for (var i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
    return function () {   // mulberry32
      h = (h + 0x6D2B79F5) | 0;
      var t = Math.imul(h ^ (h >>> 15), 1 | h);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function optOrder(st, ctx) {
    var ops = (st.options || []).slice();
    if (fixedOrder(st)) return ops;
    var p = pt() || {}, where = ctx === 'step' ? 's' + (p.steps || []).indexOf(st) : String(ctx);
    var rnd = seeded([QID, p.id || p.n, where, S.seed >>> 0].join('|'));
    for (var i = ops.length - 1; i > 0; i--) { var j = Math.floor(rnd() * (i + 1)), t = ops[i]; ops[i] = ops[j]; ops[j] = t; }
    return ops;
  }
  // Метка варианта: у нумерованных — свой знак (если подпись не начинается с него), у остальных — буква по месту на экране;
  // внутренний id (press, water) игрок не видит
  function optMark(x, i, marked) {
    if (!marked) return 'АБВГДЕЖЗИК'.charAt(i) || String(i + 1);
    var id = String(x.id), lb = plain(x.label || '');
    return lb.indexOf(id + ' ') === 0 || lb.indexOf(id + ' —') === 0 || lb === id ? '' : id;
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
    log('wrong', { step: lbl, text: opt.label || id, kind_of: 'choice' });
    o.wrong = opt.label || id; o.reply = opt.reply || '';
    commit('same', '.pl-wrong');
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
    save(); render(); refocus('#app [data-sel="' + id + '"]');
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
    log('wrong', { step: lbl, text: label || '—', kind_of: st.type === 'pick' ? 'pick' : 'strike' });
    o.wrong = label || '—'; o.reply = reply;
    commit('same', '.pl-wrong');
  }
  function hint(level, ctx) {
    ctx = ctx || 'step';
    var o = ctxSlot(ctx), hints = ctxDef(ctx).hints || [];
    if (!hints.length || level !== o.hint || level >= hints.length) return;
    o.hint = level + 1;
    var isAnswer = o.hint >= hints.length;
    log(isAnswer ? 'reveal' : 'hint', { step: ctxLabel(ctx), level: o.hint });
    commit('same', (ctx === 'step' ? '#active' : '#walk-' + ctxIndex(ctx)) + ' .pl-hint:last-of-type');
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
      (eyebrow ? '<p class="pl-eyebrow">' + esc(eyebrow) + '</p>' : '') + '<h1>' + esc(plain(title)) + '</h1>' +
      (place ? '<p class="pl-place">' + esc(plain(place)) + '</p>' : '') + '</header>';
  }
  // «Точка N · дорога / на месте» стоит в строке мини-шагов над экраном, поэтому в самом заголовке её нет
  function pointHead(p) { return head('', p.title, p.place, p.n - 1); }
  function caseName() { return CASE_NO ? 'Дело № ' + CASE_NO : 'Дело'; }
  function clueTotal() { return Q.points.filter(function (p) { return p.clue; }).length; }
  function mapLink(p) { return 'https://yandex.ru/maps/?pt=' + p.lon + ',' + p.lat + '&z=18&l=map'; }
  function checkBlock(p, collapsed) {
    if (!S.field || !p.check || !p.check.length) return '';
    var items = '<ul>' + p.check.map(function (c) { return '<li>' + inline(c) + '</li>'; }).join('') + '</ul>' +
      '<p class="pl-small" style="margin-top:10px">Фотографии сохраняйте в галерею телефона. Замечания записывайте через меню → «Заметка» — они попадут в отчёт к точке ' + p.n + '.</p>';
    if (collapsed) return '<details class="pl-more pl-field"><summary>Полевой тест: что проверить</summary>' + items + '</details>';
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
    if (!Array.isArray(src)) return '<div class="pl-prose">' + proseFold(src) + '</div>';
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
    if (typeof l === 'string') return '<div class="pl-prose">' + proseFold(l) + '</div>';
    if (!l || typeof l !== 'object') return '';
    if (l.arrow) return arrowHtml(l.arrow, l.text);
    if (l.doc === 'letter') return letterHtml(l.state || LETTER_CTX || S.letter, { reveal: l.reveal });
    if (l.doc === 'card') return CARDS[l.id] ? cardHtml(l.id, { full: true }) : '';
    if (l.img !== undefined || l.layers) return figureHtml(l);
    if (l.audio && !l.text) return typeof l.audio === 'string' && mediaSrc(l.audio) ? voiceStrip([mediaSrc(l.audio)], true) : '';
    var sp = speaker(l.who || 'zilya');
    var paper = sp.style === 'note' || sp.style === 'letter' || sp.style === 'card';
    var body = (sp.style === 'letter' || l.mono) ? '<div class="pl-prose pl-hand">' + prose(l.text) + '</div>' : '<div class="pl-prose">' + proseFold(l.text) + '</div>';
    // место под портрет героя: пока портрета нет — плитка с фигурой его роли (speakers.<id>.img — путь к портрету)
    var ava = paper || sp.style === 'titr' ? '' : '<i class="pl-ava" data-style="' + esc(sp.style) + '" aria-hidden="true">' + (mediaSrc(sp.img) ? '<img src="' + esc(mediaSrc(sp.img)) + '" alt="" loading="lazy" decoding="async">' : '') + '</i>';
    var quiet = sp.style === 'titr' || (cont && !l.note);
    return '<div class="pl-line pl-line--' + esc(sp.style) + (paper ? ' pl-line--paper' : '') + (cont ? ' pl-line--cont' : '') + '" data-who="' + esc(l.who || '') + '">' +
      (quiet ? '<span class="visually-hidden">' + esc(sp.name) + ': </span>' : '<span class="pl-who">' + ava + esc(sp.name) + (l.note ? ' <small>' + esc(plain(l.note)) + '</small>' : '') + '</span>') +
      body + '</div>';
  }
  // Картинка или заглушка: место под картинку держится всегда (aspect-ratio), нет файла — подпись вместо картинки
  function mediaSrc(src) { return /^(https?:)?\/\//.test(src) ? '' : String(src); }
  function figureHtml(l) {
    var srcs = [].concat(l.layers || l.img || []).filter(Boolean).map(mediaSrc).filter(Boolean);
    var alt = plain(l.alt || l.caption || 'Картинка');
    var ratio = l.ratio || '3 / 2';
    var ph = '<span class="pl-ph" aria-hidden="true"><b>Здесь будет иллюстрация</b><span>' + esc(alt) + '</span></span>';
    var imgs = srcs.map(function (s, i) {
      return '<img src="' + esc(s) + '" alt="' + (i ? '' : esc(alt)) + '" loading="lazy" decoding="async"' + (i ? ' hidden' : '') + ' data-layer="' + i + '">';
    }).join('');
    var box = srcs.length > 1
      ? '<button type="button" class="pl-frame pl-frame--layers" data-act="layer" data-i="0" data-n="' + srcs.length + '" style="aspect-ratio:' + esc(ratio) + '" aria-label="' + esc(alt) + '. Слой 1 из ' + srcs.length + ', нажмите — следующий">' + ph + imgs +
        '<span class="pl-dots" aria-hidden="true">' + srcs.map(function (s, i) { return '<i' + (i ? '' : ' class="on"') + '></i>'; }).join('') + '</span></button>'
      : '<div class="pl-frame" style="aspect-ratio:' + esc(ratio) + '"' + (srcs.length ? '' : ' role="img" aria-label="' + esc(alt) + ' (картинка готовится)"') + '>' + ph + imgs + '</div>';
    return '<figure class="pl-fig" data-arrow-at="image">' + box + (l.caption ? '<figcaption>' + inline(l.caption) + '</figcaption>' : '') + '</figure>';
  }
  // Звук: плеер реплики. У всех реплик экрана есть файлы — играет их подряд; нет — то же место с плашкой «Аудио скоро».
  // В режиме «Читаю» плеера нет: текст на экране есть всегда. Отдельная звуковая улика ({audio} без текста) видна в обоих режимах.
  var WAVE = [5, 9, 14, 8, 12, 18, 10, 6, 13, 17, 9, 5, 11, 15, 8, 12, 6, 10, 16, 9, 7, 13, 5, 9];
  function voiceStrip(srcs, force) {
    if (MODE !== 'listen' && !force) return '';
    var ready = srcs.length > 0;
    return '<div class="pl-voice' + (ready ? '' : ' is-soon') + '" data-arrow-at="sound"' + (ready ? ' data-srcs="' + esc(srcs.join('|')) + '"' : '') + '>' +
      '<button type="button" class="pl-voice-btn" data-act="voice" aria-label="' + (ready ? 'Слушать' : 'Слушать: аудио скоро') + '"' + (ready ? ' aria-pressed="false"' : ' aria-disabled="true"') + '>' + ico('play') + ico('pause') + '</button>' +
      '<span class="pl-voice-wave" aria-hidden="true">' + WAVE.map(function (h) { return '<i style="height:' + h + 'px"></i>'; }).join('') + '</span>' +
      '<span class="pl-voice-note">' + (ready ? '0:00' : 'Аудио скоро') + '</span></div>';
  }
  // lines — реплики экрана; whole — одна запись на весь блок (audio у точки, шага, дороги)
  function voiceHtml(lines, whole) {
    var spoken = asLines(lines).filter(function (l) { return l && typeof l === 'object' && !l.arrow && l.text != null; });
    if (!spoken.length) return '';
    if (typeof whole === 'string' && mediaSrc(whole)) return voiceStrip([mediaSrc(whole)]);
    var list = spoken.map(function (l) { return typeof l.audio === 'string' ? mediaSrc(l.audio) : ''; });
    return voiceStrip(list.every(Boolean) ? list : []);
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
      if (tg && !a.closest('details')) { tg.insertAdjacentElement('afterend', a); a.classList.add('is-at'); }
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
    return '<details class="pl-more pl-kids"><summary>Задание для детей</summary>' + list.map(function (x) {
      return '<div class="pl-kids-item"><div class="pl-prose">' + prose(x.text) + '</div>' +
        (x.answer ? '<details class="pl-more pl-kids-ans"><summary>Ответ</summary><p>' + inline(x.answer) + '</p></details>' : '') + '</div>';
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
  function wrongHtml(st, o) {
    return '<p class="pl-wrong" role="status">' + (o.reply
      ? (st.type === 'pick' || st.type === 'strike' ? '' : '«' + esc(o.wrong) + '» — ') + inline(o.reply)
      : '«' + esc(o.wrong) + '» — не подходит. Попробуйте ещё раз' + ((st.hints || []).length ? ' или откройте подсказку.' : '.')) + '</p>';
  }
  // Поле ответа, варианты, выбор карточек, подсказки и «Пропустить» — общие для шага точки и вопроса на ходу.
  // Поле ответа стоит в потоке сразу под вопросом (не прилипает к низу): клавиатура его не двигает. Сообщение об ошибке —
  // рядом с тем, на что смотрит игрок: под полем, а у вариантов и карточек — над ними. recap — свёрнутые реплики шага.
  function taskInput(st, o, ctx, main, recap) {
    var h = '';
    var hints = st.hints || [];
    var steps = hintSteps(st);
    var revealed = st.type !== 'free' && hints.length && o.hint >= hints.length;
    var stick = main ? ' pl-stick' : '';
    var aid = ctx === 'step' ? 'ans' : 'ans-' + ctx.replace(':', '');
    var wrong = o.wrong ? wrongHtml(st, o) : '';
    recap = recap || '';
    if (!revealed) {
      if (st.type === 'choice') {
        h += recap + wrong + '<div class="pl-opts' + ((st.options || []).some(function (x) { return x.img !== undefined; }) ? ' pl-opts--img' : '') + '" role="group" aria-label="Варианты ответа">' +
          (function () {
            var ops = optOrder(st, ctx), marked = isMarked(st.options || []);
            return ops.map(function (x, i) {
              var mk = optMark(x, i, marked);
              return '<button type="button" class="pl-opt" data-act="choose" data-id="' + esc(x.id) + '">' +
                (x.img !== undefined ? figureHtml({ img: x.img, alt: x.alt || x.label || x.id, ratio: x.ratio || '1 / 1' }) : '') +
                '<span class="pl-opt-label">' + (mk ? '<b>' + esc(mk) + '</b>' : '') + (x.label ? inline(x.label) : esc(x.id)) + '</span></button>';
            }).join('');
          })() + '</div>';
      } else if (st.type === 'pick' || st.type === 'strike') {
        var list = st.type === 'pick'
          ? S.cards.filter(function (c) { return !(CARDS[c.id] && CARDS[c.id].kind === 'version'); }).map(function (c) { return { id: c.id, label: CARDS[c.id] ? CARDS[c.id].title : c.id, sub: CARDS[c.id] && CARDS[c.id].n ? 'Остановка ' + CARDS[c.id].n : '', struck: !!S.struck[c.id] }; })
          : (st.items || []).map(function (x) { return { id: x.id, label: x.label, sub: x.sub || '' }; });
        var need = st.type === 'pick' ? (st.pick || 2) : 0;
        h += recap + wrong;
        if (st.type === 'strike' && st.img !== undefined) h += figureHtml({ img: st.img, alt: st.alt || 'Снимок', ratio: st.ratio });
        h += '<div class="pl-sel' + (st.type === 'strike' ? ' pl-sel--strike' : '') + '" role="group" aria-label="' + (st.type === 'pick' ? 'Карточки доски: выберите ' + need : 'Вычеркните лишнее') + '">' +
          list.map(function (x) {
            var on = o.sel.indexOf(x.id) !== -1;
            return '<button type="button" class="pl-selb' + (x.struck ? ' is-struck' : '') + '" data-act="sel" data-sel="' + esc(x.id) + '" aria-pressed="' + on + '">' +
              '<span><b>' + inline(x.label) + '</b>' + (x.sub ? '<small>' + esc(x.sub) + (x.struck ? ' · вычеркнута' : '') + '</small>' : '') + '</span>' +
              '<i class="pl-selmark" aria-hidden="true"></i></button>';
          }).join('') + '</div>' +
          '<div class="pl-actions' + stick + '"><button class="pl-btn" type="button" data-act="check">' +
          (st.type === 'pick' ? 'Проверить' + (o.sel.length < need ? ' (' + o.sel.length + ' из ' + need + ')' : '') : 'Проверить') + '</button></div>';
      } else {
        h += '<form class="pl-form" data-form="answer" autocomplete="off">' +
          '<label class="visually-hidden" for="' + aid + '">Ваш ответ</label>' +
          '<input class="pl-input" id="' + aid + '" name="ans" type="text" inputmode="text" autocapitalize="off" autocorrect="off" spellcheck="false" enterkeyhint="send" placeholder="' + esc(st.placeholder || (st.type === 'free' ? 'Ваш ответ' : 'Одно-два слова')) + '" value="' + esc(o.last) + '">' +
          '<button class="pl-btn" type="submit">Ответить</button></form>' + wrong + recap;
      }
    } else h += recap;
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
      if (revealed) h += '<div class="pl-actions' + stick + '"><button class="pl-btn" type="button" data-act="reveal">' + (ctx === 'step' ? 'Дальше' : 'Понятно') + '</button></div>';
    }
    if (!revealed && (st.optional || st.type === 'free' || !hints.length)) h += '<button type="button" class="pl-skip" data-act="skip">Пропустить</button>';
    return h;
  }
  // Вопрос на ходу: свой экран в дороге, по желанию, на прогресс не влияет. o — его состояние (ответ, подсказки)
  function walkAskHtml(w, fr, o, canAnswer) {
    var i = fr.i, ctx = 'w:' + i, t = tagOf(w);
    if (!t.tag) { t.tag = 'По желанию'; t.cls = 'opt'; }
    var recap = fr.recap && fr.recap.length ? moreHtml('Напомнить, что было сказано', linesHtml(fr.recap), 'pl-recap') : '';
    var h = '<section class="pl-card pl-task pl-task--opt" id="walk-' + i + '" data-ctx="' + ctx + '" data-arrow-at="plus">' +
      '<div class="pl-task-top">' + tagHtml(t) + '<span class="pl-stepno">Вопрос на ходу</span></div>' +
      (fr.inline && fr.inline.length ? voiceHtml(fr.inline, w.audio) + '<div class="pl-lines">' + linesHtml(fr.inline) + '</div>' : '') +
      (t.text ? '<div class="pl-prose pl-ask">' + prose(t.text) + '</div>' : fr.ask ? '<div class="pl-prose pl-ask"><p>' + esc(fr.ask) + '</p></div>' : '');
    var arrows = (fr.arrows || []).map(function (a) { return arrowHtml(a.arrow, a.text); }).join('');
    if (o.res || !canAnswer) return h + resultStamp(o.res) + okHtml(Object.assign({ ok_on_skip: true }, w), o.res) + recap + '</section>' + arrows;
    return h + taskInput(Object.assign({ optional: true }, w), o, ctx, true, recap) + '</section>' + arrows;
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
  // Карта: схема по настоящим координатам, без тайлов и внешних сервисов — работает офлайн.
  // Показываем только пройденные точки и текущую — маршрут вперёд не раскрываем.
  // Подложка — из данных дела (docs/quest-format.md, поле "map"):
  //   "image" + "bounds" [[юг, запад], [север, восток]] — своя картинка-подложка (рисунок или схема района, файл рядом с делом);
  //   "landmarks" — ориентиры простыми формами с подписью: {"kind": "water|park|river|metro|place", "label": "Пруд",
  //     "at": [lat, lon] или "point": N, "r": метры (круг) | "area": [[lat, lon]…] (контур) | "line": [[lat, lon]…] (река, улица),
  //     "from": N — показывать начиная с точки N (чтобы ориентир не подсказывал дорогу вперёд)}.
  // Нет ни картинки, ни ориентиров — схема всё равно не пустая: север, масштаб, пройденный путь.
  var LM_KINDS = { water: 1, park: 1, river: 1, metro: 1, place: 1 };
  function mapView() {
    var n = Q.points.length, all = S.phase === 'done';
    var upto = all ? n - 1 : (S.phase === 'intro' ? 0 : S.p);
    var arrived = S.phase === 'step' || S.phase === 'point_done';
    var known = Q.points.slice(0, upto + 1);
    var cur = all ? null : Q.points[upto];
    var M = Q.map || {};
    var k = Math.cos(Q.points[0].lat * Math.PI / 180);
    // рамка схемы — по известным точкам, а не по всему маршруту: пустое место не подсказывает, куда идёт путь дальше
    var xs = known.map(function (p) { return p.lon * k; }), ys = known.map(function (p) { return -p.lat; });
    var x0 = Math.min.apply(null, xs), x1 = Math.max.apply(null, xs), y0 = Math.min.apply(null, ys), y1 = Math.max.apply(null, ys);
    var W = 320, H = 210, pad = 26;
    var MIN = .004; // ≈ 400 м: первые точки рядом не растягиваются на всю схему
    var sc = Math.min((W - 2 * pad) / Math.max(x1 - x0, MIN), (H - 2 * pad) / Math.max(y1 - y0, MIN));
    var ox = (W - (x1 - x0) * sc) / 2, oy = (H - (y1 - y0) * sc) / 2;
    var proj = function (lat, lon) { return [(lon * k - x0) * sc + ox, (-lat - y0) * sc + oy]; };
    var mpx = sc / 111320;   // пикселей схемы на метр (градус широты ≈ 111,3 км)
    var f1 = function (v) { return v.toFixed(1); };
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
    // подложка-картинка
    var under = '';
    var img = M.image ? mediaSrc(M.image) : '';
    if (img && Array.isArray(M.bounds) && M.bounds.length === 2) {
      var sw = proj(+M.bounds[0][0], +M.bounds[0][1]), ne = proj(+M.bounds[1][0], +M.bounds[1][1]);
      under += '<image class="pl-map-img" href="' + esc(img) + '" x="' + f1(sw[0]) + '" y="' + f1(ne[1]) + '" width="' + f1(ne[0] - sw[0]) + '" height="' + f1(sw[1] - ne[1]) + '" preserveAspectRatio="none"/>';
    }
    // ориентиры: формы — под маршрутом, подписи — поверх, не на точках и не друг на друге
    var shapes = '', labels = [], taken = pos.map(function (c) { return [c[0] - 13, c[1] - 13, c[0] + 13, c[1] + 13]; });
    var LH = 13, CW = 7.6;   // высота подписи и средняя ширина знака в единицах схемы (подпись 13 — как номера точек)
    var free = function (r) {
      if (r[0] < 4 || r[2] > W - 4 || r[1] < 4 || r[3] > H - 4) return false;
      for (var q = 0; q < taken.length; q++) { var t = taken[q]; if (r[0] < t[2] && t[0] < r[2] && r[1] < t[3] && t[1] < r[3]) return false; }
      return true;
    };
    // подпись: ближайшее свободное место у ориентира (у реки — у любого изгиба), не на точках, значках и других подписях
    var GRID = [];
    [0, 1, -1, 2, -2, 3, -3, 4, -4].forEach(function (i) { [0, 1, -1, 2, -2].forEach(function (j) { GRID.push([i * 18, j * 14]); }); });
    GRID.sort(function (u, v) { return (Math.abs(u[0]) + Math.abs(u[1]) * 1.3) - (Math.abs(v[0]) + Math.abs(v[1]) * 1.3); });
    var place = function (txt, anchors, rad, inside) {
      var w = txt.length * CW;
      for (var g = 0; g < GRID.length; g++) for (var q = 0; q < anchors.length; q++) {
        var x = anchors[q][0] + GRID[g][0], y = anchors[q][1] + GRID[g][1];
        if (!inside && rad && Math.abs(GRID[g][1]) < (rad + LH / 2) && Math.abs(GRID[g][0]) < (rad + w / 2) && GRID[g][1] === 0 && GRID[g][0] === 0) continue;
        var r = [x - w / 2, y - LH / 2, x + w / 2, y + LH / 2];
        if (free(r)) { taken.push(r); labels.push('<text class="pl-map-lbl" x="' + f1(x) + '" y="' + f1(y) + '" style="text-anchor:middle">' + esc(txt) + '</text>'); return true; }
      }
      return false;
    };
    // значок ориентира не ложится на точку маршрута: сдвигаем в ближайшее свободное место
    var nudge = function (c, r) {
      var offs = [[0, 0], [0, -24], [24, 0], [-24, 0], [0, 24], [20, -20], [-20, -20], [20, 20], [-20, 20]];
      for (var o = 0; o < offs.length; o++) { var x = c[0] + offs[o][0], y = c[1] + offs[o][1]; if (free([x - r, y - r, x + r, y + r])) return [x, y]; }
      return null;
    };
    // контур парка или воды — сглаженный (углы скруглены), с запасом pad метров от центра, чтобы точки внутри не лежали на краю
    var blob = function (pts, padPx) {
      var cx = 0, cy = 0; pts.forEach(function (q) { cx += q[0]; cy += q[1]; }); cx /= pts.length; cy /= pts.length;
      var P = pts.map(function (q) { var dx = q[0] - cx, dy = q[1] - cy, d = Math.sqrt(dx * dx + dy * dy) || 1; return [q[0] + dx / d * padPx, q[1] + dy / d * padPx]; });
      var mid = function (u, v) { return [(u[0] + v[0]) / 2, (u[1] + v[1]) / 2]; };
      var m0 = mid(P[P.length - 1], P[0]), d = 'M' + f1(m0[0]) + ' ' + f1(m0[1]);
      for (var i = 0; i < P.length; i++) { var m = mid(P[i], P[(i + 1) % P.length]); d += 'Q' + f1(P[i][0]) + ' ' + f1(P[i][1]) + ' ' + f1(m[0]) + ' ' + f1(m[1]); }
      return { d: d + 'Z', c: [cx, cy] };
    };
    var reached = all ? n : upto + 1;
    var lms = (Array.isArray(M.landmarks) ? M.landmarks : []).filter(function (L) {
      return L && LM_KINDS[L.kind] && (L.from == null || +L.from <= reached) && passes(L['if']);
    });
    var later = [];
    lms.forEach(function (L) {
      var at = L.at || null;
      if (!at && L.point != null) { var P = Q.points.filter(function (p) { return p.n === +L.point; })[0]; if (P) at = [P.lat, P.lon]; }
      var cls = 'pl-map-lm pl-map-lm--' + L.kind, c = null, rad = 0;
      if (Array.isArray(L.line) && L.line.length > 1) {
        var pts = L.line.map(function (g) { return proj(+g[0], +g[1]); });
        shapes += '<path class="' + cls + '" d="' + pts.map(function (c2, i) { return (i ? 'L' : 'M') + f1(c2[0]) + ' ' + f1(c2[1]); }).join('') + '"' + (L.width ? ' style="stroke-width:' + Math.max(3, Math.min(40, +L.width * mpx)).toFixed(1) + '"' : '') + '/>';
        c = pts; rad = 8;
      } else if (Array.isArray(L.area) && L.area.length > 2) {
        var bl = blob(L.area.map(function (g) { return proj(+g[0], +g[1]); }), (+L.pad || 0) * mpx);
        shapes += '<path class="' + cls + '" d="' + bl.d + '"/>';
        c = bl.c; rad = 6;
      } else if (at) {
        c = proj(+at[0], +at[1]);
        if (L.kind === 'metro' || L.kind === 'place') {
          c = nudge(c, L.kind === 'metro' ? 9 : 5);
          if (!c) return;   // некуда поставить, не закрыв точку маршрута, — ориентир не рисуем
          rad = L.kind === 'metro' ? 9 : 4;
          taken.push([c[0] - rad, c[1] - rad, c[0] + rad, c[1] + rad]);
          var mk = L.kind === 'metro'
            ? '<g class="pl-map-metro" transform="translate(' + f1(c[0]) + ' ' + f1(c[1]) + ')"><circle r="8"/><path d="M-4.5 3.5V-3.5L0 1.5L4.5-3.5V3.5"/></g>'
            : '<circle class="' + cls + '" cx="' + f1(c[0]) + '" cy="' + f1(c[1]) + '" r="3.5"/>';
          // значок метро понятен и без подписи; точка «место» без подписи — нет
          if (L.kind === 'metro' || !L.label) later.push(mk); else { later.push({ txt: plain(L.label), c: [c], rad: rad, mark: mk }); return; }
        } else {
          rad = Math.max(6, Math.min(60, (+L.r || 40) * mpx));
          shapes += '<ellipse class="' + cls + '" cx="' + f1(c[0]) + '" cy="' + f1(c[1]) + '" rx="' + f1(rad * 1.25) + '" ry="' + f1(rad * .8) + '"/>';
        }
      }
      if (c && L.label) later.push({ txt: plain(L.label), c: Array.isArray(c[0]) ? c : [c], rad: L.kind === 'water' ? rad * 1.25 : rad, inside: L.kind === 'park' });
    });
    // север и масштаб: схема читается и без подложки
    var steps = [50, 100, 200, 500, 1000], m100 = steps[0];
    for (var si = 0; si < steps.length; si++) if (steps[si] * mpx <= 90) m100 = steps[si];
    var sl = m100 * mpx;
    taken.push([W - 30, 4, W - 4, 40], [8, H - 26, 16 + sl, H - 4]);
    var deco = '<g class="pl-map-n" transform="translate(' + (W - 17) + ' 20)"><path d="M0-12 5 2H-5Z"/><text y="13">С</text></g>' +
      '<g class="pl-map-scale" transform="translate(10 ' + (H - 10) + ')"><path d="M0-4V0H' + f1(sl) + 'V-4"/><text x="' + f1(sl + 5) + '" y="-1">' + (m100 >= 1000 ? m100 / 1000 + ' км' : m100 + ' м') + '</text></g>';
    var path = known.map(function (p, i) { var c = xy(i); return (i ? 'L' : 'M') + c[0].toFixed(1) + ' ' + c[1].toFixed(1); }).join('');
    var dots = known.map(function (p, i) {
      var c = xy(i), isCur = cur && i === upto;
      return (isCur ? '<circle class="pl-map-cur" cx="' + c[0].toFixed(1) + '" cy="' + c[1].toFixed(1) + '" r="11"/>' : '') +
        '<circle class="pl-map-dot' + (isCur ? ' pl-map-dot--cur' : '') + '" cx="' + c[0].toFixed(1) + '" cy="' + c[1].toFixed(1) + '" r="11"/>' +
        '<text' + (isCur ? ' class="cur"' : '') + ' x="' + c[0].toFixed(1) + '" y="' + c[1].toFixed(1) + '">' + p.n + '</text>';
    }).join('');
    var marks = later.filter(function (x) { return typeof x === 'string'; }).join('');
    later.forEach(function (x) { if (typeof x === 'object' && place(x.txt, x.c, x.rad, x.inside) && x.mark) marks += x.mark; });
    var lmNames = lms.filter(function (L) { return L.label; }).map(function (L) { return plain(L.label); });
    var done = all ? n : upto + (S.phase === 'point_done' ? 1 : 0);
    var h = head(caseName(), 'Карта', all ? 'Маршрут пройден: ' + n + ' из ' + n + ' точек' : 'Пройдено точек: ' + done + ' из ' + n, 0) +
      '<figure class="pl-map' + (img ? ' pl-map--img' : '') + '"><svg viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="Схема пути: ' + (all ? 'все точки' : 'точки с 1 по ' + (upto + 1)) +
      (lmNames.length ? '; ориентиры: ' + esc(lmNames.join(', ')) : '') + '">' +
      under + shapes + deco + (known.length > 1 ? '<path class="pl-map-path" d="' + path + '"/>' : '') + marks + dots + labels.join('') + '</svg>' +
      '<figcaption class="pl-small">Схема: север сверху, расстояния в масштабе, улиц нет — дорогу ведёт текст точки.</figcaption></figure>';
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
  // ---------- мини-шаги (player-ui-v2): один экран — одна реплика, блок, загадка или разбор ----------
  // Точка раскладывается в ряд экранов: дорога → разговор в пути → вопросы на ходу → «идём» → на месте → сцена →
  // шаги (реплики → загадка → разбор) → «точка пройдена». Игрок видит один экран; новое всегда начинается сверху.
  // S.f — на каком экране игрок сейчас; peek — просмотр пройденного (не сохраняется). Экраны дальше S.f не строятся в оглавление.
  var BUDGET = (window.innerHeight || 700) < 700 ? 330 : 480;   // столько знаков текста помещается на экран телефона без прокрутки; картинка и письмо — как ~250 знаков
  var INLINE = 100;   // реплики короче — на одном экране с загадкой: поле ответа остаётся в верхней половине экрана
  var FOLD = 600;     // текст длиннее сворачивается под «стрелку»: начало видно, остальное — по нажатию
  var MODE_KEY = 'dvorami:mode', RATE_KEY = 'dvorami:rating:' + QID;
  var MODE = store.get(MODE_KEY) === 'read' ? 'read' : 'listen';   // «слушаю и читаю» | «читаю»
  var peek = null, moveDir = 'fwd', LETTER_CTX = null;

  function lineWeight(l) {
    if (typeof l === 'string') return plain(l).length;
    if (!l || typeof l !== 'object' || l.arrow) return 0;
    if (l.img !== undefined || l.layers) return 250;
    if (l.doc === 'letter') return 280;
    if (l.doc === 'card') return 180;
    return plain(l.text).length + 24;
  }
  function asLines(src) { return src == null || src === '' ? [] : (Array.isArray(src) ? src : [src]); }
  // Реплики → экраны: подряд идущие короткие реплики делят экран, длинная или картинка занимает его целиком
  function beatsOf(src) {
    var out = [], cur = [], w = 0;
    asLines(src).forEach(function (l) {
      if (l && typeof l === 'object' && l.arrow) { (cur.length || !out.length ? cur : out[out.length - 1]).push(l); return; }
      var lw = lineWeight(l);
      if (cur.length && w + lw > BUDGET) { out.push(cur); cur = []; w = 0; }
      cur.push(l); w += lw;
    });
    if (cur.length) out.push(cur);
    return out;
  }
  // Состояние письма на момент шага — чтобы в пройденном письмо выглядело так, как тогда
  function letterAt(sec, step) {
    if (!Q.letter) return null;
    var id = Q.letter.start || null;
    for (var i = 0; i <= sec && i < Q.points.length; i++) {
      var p = Q.points[i], all = i < sec || step >= 1e9;
      for (var j = 0; j < p.steps.length && (all || j <= step); j++) if (p.steps[j].letter) id = p.steps[j].letter;
      if (all && p.letter) id = p.letter;
    }
    return id;
  }
  function isVisual(l) { return !!l && typeof l === 'object' && (l.img !== undefined || !!l.layers || !!l.doc); }
  // Реплики загадки делятся на три части: разговор (talk) — отдельными экранами до загадки, если он длинный;
  // то, на что нужно смотреть, отвечая (картинка, письмо, карточка в конце реплик — tail), — на экране самой загадки;
  // «стрелки» к подсказкам и «по желанию» (late) — там, где сама кнопка.
  function taskParts(lines) {
    var ln = asLines(lines);
    var late = ln.filter(function (l) { return l && l.arrow && (l.arrow === 'hint' || l.arrow === 'plus'); });
    var rest = ln.filter(function (l) { return late.indexOf(l) === -1; });
    var cut = rest.length;
    while (cut > 0 && (isVisual(rest[cut - 1]) || (rest[cut - 1] && rest[cut - 1].arrow && rest.slice(0, cut - 1).some(isVisual)))) cut--;
    if (cut < rest.length && !isVisual(rest[cut])) cut++;
    var talk = rest.slice(0, cut), tail = rest.slice(cut);
    var inline = talk.reduce(function (a, l) { return a + lineWeight(l); }, 0) <= INLINE;
    return { talk: talk, tail: tail, late: late, inline: inline };
  }
  // У загадки нет своего текста (вопрос — в конце реплики): на экран с полем ответа выносим последнюю фразу с вопросом
  function askFrom(talk) {
    for (var i = talk.length - 1; i >= 0; i--) {
      var l = talk[i];
      if (!l || typeof l !== 'object' || l.text == null) continue;
      var t = plain(l.text), m = t.match(/[^.!?…]*\?[»"]?\s*$/);
      var q = m && m[0].trim();
      if (q && q.length >= 4 && q.length <= 160) return q;
      return t.length <= 160 ? t : '';
    }
    return '';
  }
  function isInteractive(st) { return !(st.type === 'info' || st.type === 'board' || st.type === 'say' || !st.type); }
  function stepCards(st) {
    var ids = [];
    [].concat(st.cards || [], st.add || []).forEach(function (c) { var id = typeof c === 'string' ? c : c && c.id; if (id && CARDS[id] && ids.indexOf(id) === -1) ids.push(id); });
    return ids;
  }
  function introFrames() {
    var lines = [];
    (Q.intro || []).forEach(function (m) { lines = lines.concat(m); });
    var bs = beatsOf(lines);
    if (!bs.length) bs = [[]];
    return bs.map(function (b, i) { return { id: 'i' + i, kind: 'beat', lines: b }; });
  }
  function finaleFrames() {
    var F = [{ id: 'fc', kind: 'closed' }];
    if ((Q.finale || []).length) F.push({ id: 'ff', kind: 'facts' });
    return F;
  }
  function stepFrames(F, p, i, r) {
    var st = p.steps[i], t = tagOf(st), ln = asLines(st.lines);
    if (!isInteractive(st)) {
      var bs = beatsOf(ln.concat(t.text ? [t.text] : []));
      if (!bs.length) bs = [[]];
      bs.forEach(function (b, j) {
        F.push({ id: 's' + i + 'b' + j, kind: 'beat', step: i, lines: b, tag: j ? null : t, title: j ? null : st.title, audio: j ? null : st.audio,
          board: st.type === 'board' && j === bs.length - 1, gate: j === bs.length - 1, button: st.button });
      });
      return;
    }
    var tp = taskParts(ln);
    if (!tp.inline) beatsOf(tp.talk).forEach(function (b, j) {
      F.push({ id: 's' + i + 'b' + j, kind: 'beat', step: i, lines: b, tag: null, title: j ? null : st.title, audio: j ? null : st.audio });
    });
    F.push({ id: 's' + i + 't', kind: 'task', step: i, inline: (tp.inline ? tp.talk : []).concat(tp.tail), recap: tp.inline ? null : tp.talk, arrows: tp.late,
      ask: t.text ? '' : (tp.inline ? '' : askFrom(tp.talk)), res: r });
    if (!r) return;
    var okl = st.ok && (r.st !== 'skipped' || st.ok_on_skip) ? asLines(st.ok) : [];
    if (r.st !== 'ok' && !okl.length) return;
    var rb = beatsOf(okl);
    if (!rb.length) rb = [[]];
    rb.forEach(function (b, j) { F.push({ id: 's' + i + 'r' + j, kind: 'result', step: i, lines: b, res: j ? null : r }); });
  }
  // stage: 0 — дорога, 1 — на месте (шаги до k включительно), 2 — точка пройдена
  function pointFrames(pi, stage, k, res, wa) {
    var p = Q.points[pi], F = [], road = [], chat = [];
    asLines(clockPick(p.walk, pi)).forEach(function (l) { (typeof l === 'string' || (l && l.arrow && !chat.length) ? road : chat).push(l); });
    F.push({ id: 'w', kind: 'road', lines: road });
    beatsOf(chat).forEach(function (b, i) { F.push({ id: 'wc' + i, kind: 'beat', lines: b, audio: i ? null : p.walk_audio }); });
    walkAsks(p).forEach(function (w, i) {
      if (stage !== 0 && !(wa[i] && wa[i].res)) return;   // после дороги остаются только те вопросы, на которые ответили
      var tp = taskParts(w.lines), t = tagOf(w);
      if (!tp.inline) beatsOf(tp.talk).forEach(function (b, j) { F.push({ id: 'wa' + i + 'b' + j, kind: 'beat', lines: b, audio: j ? null : w.audio, tag: j ? null : { tag: 'По желанию', cls: 'opt' }, title: j ? null : 'Вопрос на ходу' }); });
      F.push({ id: 'wa' + i, kind: 'wask', i: i, inline: (tp.inline ? tp.talk : []).concat(tp.tail), recap: tp.inline ? null : tp.talk, arrows: tp.late,
        ask: t.text ? '' : (tp.inline ? '' : askFrom(tp.talk)) });
    });
    if (stage === 0 && F.length > 1) F.push({ id: 'wg', kind: 'go', lines: road });
    if (stage >= 1) {
      F.push({ id: 'a', kind: 'arrive' });
      beatsOf(clockPick(p.scene, pi)).forEach(function (b, i) { F.push({ id: 'sc' + i, kind: 'beat', lines: b, audio: i ? null : p.audio }); });
      var last = Math.min(k, p.steps.length - 1);
      for (var i = 0; i <= last; i++) stepFrames(F, p, i, i < k ? (res[i] || { st: 'none' }) : null);
    }
    if (stage === 2) {
      F.push({ id: 'd', kind: 'done', end: true });
      beatsOf(clockPick(p.outro, pi)).forEach(function (b, i) { F.push({ id: 'o' + i, kind: 'beat', lines: b, end: true }); });
    }
    return F;
  }
  function liveSec() { return S.phase === 'intro' ? -1 : S.phase === 'done' ? Q.points.length : S.p; }
  function framesOf(sec) {
    var n = Q.points.length;
    if (sec < 0) return introFrames();
    if (sec >= n) return finaleFrames();
    if (sec === liveSec()) return pointFrames(sec, S.phase === 'walk' ? 0 : S.phase === 'step' ? 1 : 2, S.k, S.res, S.wa);
    var h = (S.hist || {})[sec] || {};
    return pointFrames(sec, 2, Q.points[sec].steps.length, h.res || [], h.wa || []);
  }
  function frameIndex(F, test, fallback) { for (var i = 0; i < F.length; i++) if (test(F[i])) return i; return fallback; }
  // Сохранение без S.f (до player-ui-v2) или с устаревшим — ставим на начало текущего шага
  function fixCursor() {
    if (S.phase === 'idle') { S.f = 0; return; }
    var F = framesOf(liveSec());
    if (typeof S.f === 'number' && S.f >= 0 && S.f < F.length) return;
    S.f = S.phase === 'step' ? frameIndex(F, function (x) { return x.step === S.k; }, F.length - 1)
      : S.phase === 'point_done' ? frameIndex(F, function (x) { return x.kind === 'done'; }, F.length - 1) : 0;
  }
  function shownPos() { return peek || { sec: liveSec(), f: S.f }; }
  function secName(sec) {
    if (sec < 0) return 'Вступление';
    if (sec >= Q.points.length) return 'Финал';
    return 'Точка ' + Q.points[sec].n + ' · ' + plain(Q.points[sec].title);
  }
  function clip(s, n) { s = plain(s).replace(/\s+/g, ' '); return s.length > n ? s.slice(0, n).replace(/\s+\S*$/, '').replace(/[\s,.;:!?«»—…-]+$/, '') + '…' : s; }
  function frameLabel(fr, sec) {
    if (fr.kind === 'road') return 'Дорога';
    if (fr.kind === 'go') return 'Идём';
    if (fr.kind === 'wask') return 'Вопрос на ходу';
    if (fr.kind === 'arrive') return 'На месте';
    if (fr.kind === 'done') return 'Точка пройдена';
    if (fr.kind === 'closed') return 'Дело раскрыто';
    if (fr.kind === 'facts') return 'Что здесь правда';
    if (fr.kind === 'result') return 'Разбор';
    if (fr.kind === 'task') {
      var st = Q.points[sec].steps[fr.step], r = fr.res;
      return (tagOf(st).tag || 'Загадка') + (r ? (r.st === 'ok' ? ' · верно' : r.st === 'revealed' ? ' · ответ показан' : r.st === 'skipped' ? ' · пропущено' : '') : '');
    }
    for (var i = 0; i < fr.lines.length; i++) {
      var l = fr.lines[i];
      if (typeof l === 'string') return clip(l, 44);
      if (!l || l.arrow) continue;
      if (l.doc === 'letter') return 'Письмо';
      if (l.doc === 'card') return 'Карточка';
      if (l.img !== undefined || l.layers) return 'Картинка';
      if (l.text != null) { var sp = speaker(l.who || 'zilya'); return (sp.style === 'titr' ? '' : sp.name + ': ') + clip(l.text, 38); }
    }
    return fr.title ? plain(fr.title) : 'Сцена';
  }

  // Длинный текст сворачивается под «стрелку»: начало видно сразу, остальное — по нажатию
  function moreHtml(summary, body, cls, open) {
    return '<details class="pl-more' + (cls ? ' ' + cls : '') + '"' + (open ? ' open' : '') + '><summary>' + summary + '</summary><div class="pl-more-body">' + body + '</div></details>';
  }
  function proseFold(src) {
    var s = String(src || '');
    if (plain(s).length <= FOLD) return prose(s);
    var cut = -1, re = /[.!?…»]\s+(?=[«А-ЯЁA-Z0-9<])/g, m;
    while ((m = re.exec(s))) { var at = m.index + 1; if (at > 260) break; if (at >= 90) cut = at; }
    if (cut < 0) return prose(s);
    var a = s.slice(0, cut), b = s.slice(cut);
    var open = (a.match(/<(b|i|u|s|code)>/g) || []).length, shut = (a.match(/<\/(b|i|u|s|code)>/g) || []).length;
    if (open !== shut) return prose(s);
    return prose(a) + moreHtml('Подробнее', prose(b), 'pl-more--text');
  }
  // Место под иллюстрацию точки: пока картинки нет — плакат с номером в фигурах темы
  function coverHtml(p) {
    if (p.img !== undefined && p.img) return figureHtml({ img: p.img, alt: p.img_alt || plain(p.title), ratio: '16 / 9' });
    return '<div class="pl-poster" data-shape="' + ((p.n - 1) % 3) + '" aria-hidden="true"><i></i><i></i><i></i><b>' + (p.n < 10 ? '0' : '') + p.n + '</b></div>';
  }
  function distHtml(p) { var m = walkM(p, Q.points.indexOf(p)); return m ? '<p class="pl-dist">≈ ' + m + ' м <span>пешком</span></p>' : ''; }
  // H-45: строка «ТЦ «ЗУМ» открыт до 22:00» и кнопка «Двери закрыты» / «Двери открыты» — только на текущей дороге
  function clockHtml(p, live) {
    var sec = Q.points.indexOf(p), ks = pointClockKeys(p);
    if (!ks.length) return '';
    return ks.map(function (k) {
      var d = CLOCK[k], v = clockVal(k, sec), rec = S.clk[sec] && S.clk[sec][k], hand = rec && rec.by === 'hand';
      var label = d.label || 'Вход';
      var txt = v === 'open'
        ? (hand ? (d.hand_open_text || '{label}: вы отметили, что двери открыты') : (d.open_text || '{label} сейчас открыт, до {close}'))
        : (hand ? (d.hand_closed_text || '{label}: вы отметили, что двери закрыты') : (d.closed_text || '{label} сейчас закрыт, откроется в {open}'));
      txt = txt.replace('{label}', label).replace('{open}', d.open || '').replace('{close}', d.close || '');
      var to = v === 'open' ? 'closed' : 'open';
      return '<div class="pl-clock" data-clock="' + esc(k) + '" data-clock-v="' + esc(v) + '"><p class="pl-small">' + esc(txt) + '</p>' +
        (live ? '<button type="button" class="pl-btn pl-btn--ghost pl-btn--sm" data-act="clock" data-k="' + esc(k) + '" data-v="' + to + '">' +
          esc(to === 'closed' ? (d.closed_button || 'Двери закрыты') : (d.open_button || 'Двери открыты')) + '</button>' : '') + '</div>';
    }).join('');
  }
  function mapBtn(p) {
    return '<a class="pl-btn pl-btn--ghost pl-btn--sm pl-maplink" href="' + esc(mapLink(p)) + '" target="_blank" rel="noopener" data-track="map_open" data-track-point="' + p.n + '">' + ico('out') + 'Открыть в Яндекс Картах</a>';
  }
  function taskHtml(fr, c, p) {
    var st = p.steps[fr.step], t = tagOf(st);
    var isLive = c.live && S.phase === 'step' && fr.step === S.k;
    var h = '<section class="pl-card pl-task' + (t.cls === 'opt' ? ' pl-task--opt' : '') + '"' + (isLive ? ' id="active"' : '') + ' data-step="' + fr.step + '" data-ctx="step">' +
      '<div class="pl-task-top">' + tagHtml(t) + '<span class="pl-stepno">Шаг ' + (fr.step + 1) + ' из ' + p.steps.length + '</span></div>' +
      (fr.inline && fr.inline.length ? voiceHtml(fr.inline, st.audio) + '<div class="pl-lines">' + linesHtml(fr.inline) + '</div>' : '') +
      (t.text ? '<div class="pl-prose pl-ask">' + prose(t.text) + '</div>' : fr.ask ? '<div class="pl-prose pl-ask"><p>' + esc(fr.ask) + '</p></div>' : '');
    var recap = fr.recap && fr.recap.length ? moreHtml('Напомнить, что было сказано', linesHtml(fr.recap), 'pl-recap') : '';
    if (!isLive) return h + resultStamp(fr.res) + recap + '</section>';
    return h + taskInput(st, S, 'step', true, recap) + (fr.arrows || []).map(function (a) { return arrowHtml(a.arrow, a.text); }).join('') + '</section>';
  }
  function factsHtml() {
    return (Q.finale || []).map(function (m) {
      if (Array.isArray(m)) return '<div class="pl-lines pl-facts-head">' + linesHtml(m) + '</div>';
      var lead = String(m).match(/^\s*<b>([^<]{2,40}?)[.:]?<\/b>\s*/);
      if (lead && plain(m).length > 160) return moreHtml(esc(plain(lead[1])), prose(String(m).slice(lead[0].length)), 'pl-fact');
      return '<div class="pl-prose pl-fact-open">' + proseFold(m) + '</div>';
    }).join('');
  }
  function starsHtml(v) {
    var h = '';
    for (var i = 1; i <= 5; i++) {
      h += '<button type="button" class="pl-star" role="radio" aria-checked="' + (i === v) + '" data-on="' + (i <= v) + '" data-act="rate" data-v="' + i + '" aria-label="' + i + ' из 5">' +
        '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="m12 3 2.7 5.8 6.3.8-4.6 4.4 1.2 6.3L12 17.2 6.4 20.3l1.2-6.3L3 9.6l6.3-.8L12 3Z"/></svg></button>';
    }
    return h;
  }
  function rateNote(v) {
    return !v ? 'Нажмите на звезду.' : v >= 4 ? 'Спасибо! Пара слов в Telegram поможет другим решиться.' : 'Спасибо за честность. Напишите, что было не так, — поправим.';
  }
  // H-47: оценка со звёзд финала едет в ссылку бота (done_<дело>_<1–5>) — бот не спрашивает её второй раз
  function reviewLink(v) { return botLink('done_' + QID + (v >= 1 && v <= 5 ? '_' + v : '')); }
  // Что дальше после финала: другие дела марки и второй формат (перелинковка «Дворами» ↔ «Следами», docs/sledami/concept.md, «Города и перелинковка»).
  // Марка плеера — <body data-brand>, по умолчанию «Дворами». В «Дворами» о «Следами» — одна строка: название, формат, 18+, без сюжетов.
  var BRAND = document.body.dataset.brand === 'sledami' ? 'sledami' : 'dvorami';
  var CROSS = {
    dvorami: { home: '../../#quests', homeText: 'Другие дела «Дворами»', other: '../../sledami/', otherName: '«Следами»', otherNote: 'вечерние детективные прогулки для взрослых, 18+' },
    sledami: { home: '../../sledami/#cases', homeText: 'Другие дела «Следами»', other: '../../', otherName: '«Дворами»', otherNote: 'семейные квесты-прогулки по районам' }
  };
  function nextHtml() {
    var x = CROSS[BRAND];
    return '<section class="pl-card pl-next"><h2 class="pl-rate-q">Что дальше</h2>' +
      '<div class="pl-actions"><a class="pl-btn pl-btn--ghost pl-btn--sm" href="' + x.home + '" data-track="next_case">' + esc(x.homeText) + '</a></div>' +
      '<p class="pl-small">Другой формат: <a href="' + x.other + '" data-track="brand_cross" data-track-to="' + (BRAND === 'dvorami' ? 'sledami' : 'dvorami') + '">' + esc(x.otherName) + '</a> — ' + esc(x.otherNote) + '.</p></section>';
  }
  function closedHtml() {
    warmPostcard();
    var hints = S.events.filter(function (e) { return e.kind === 'hint' || e.kind === 'reveal'; }).length;
    var rated = Math.max(0, Math.min(5, parseInt(store.get(RATE_KEY), 10) || 0));
    var n = Q.points.length, where = [Q.city, Q.district].filter(Boolean).join(' · ');
    var cell = function (k, v) { return '<div><dt>' + k + '</dt><dd>' + esc(v) + '</dd></div>'; };
    return '<h1 class="visually-hidden">Дело раскрыто</h1>' +
      // карточка для снимка экрана: номер дела, штамп и цифры прохождения — без единого слова разгадки
      '<figure class="pl-closed" id="closed-card">' +
      '<div class="pl-closed-top"><span class="pl-closed-no">' + esc(caseName()) + '</span>' + (where ? '<span class="pl-closed-where">' + esc(where) + '</span>' : '') + '</div>' +
      '<p class="pl-closed-title">' + esc(plain(Q.title)) + '</p>' +
      '<span class="pl-closed-stamp" role="img" aria-label="Штамп: раскрыто"><span aria-hidden="true">Раскрыто</span></span>' +
      '<dl class="pl-closed-facts">' + cell('Дата', day(S.t_end || Date.now())) + cell('В пути', dur((S.t_end || Date.now()) - S.t_start)) +
      cell('Точек', n + ' из ' + n) + cell('Подсказок', hints ? String(hints) : 'ни одной') + '</dl>' +
      '<figcaption class="pl-closed-brand">Дворами · городские квесты-расследования</figcaption></figure>' +
      '<div class="pl-closed-row"><button type="button" class="pl-btn pl-btn--ghost pl-btn--sm" data-act="sharecase">' + ico('send') + 'Поделиться</button>' +
      '<p class="pl-small">Открытка без разгадки — можно отправить друзьям.</p></div>' +
      '<section class="pl-card pl-rate" id="rate"><h2 class="pl-rate-q">Как вам дело?</h2>' +
      '<div class="pl-stars" role="radiogroup" aria-label="Оценка дела, от 1 до 5">' + starsHtml(rated) + '</div>' +
      '<p class="pl-small" id="rate-note" role="status">' + rateNote(rated) + '</p>' +
      '<div class="pl-actions"><a class="pl-btn pl-btn--ghost pl-btn--sm" id="rate-bot" href="' + esc(reviewLink(rated)) + '" target="_blank" rel="noopener" data-track="review_click" data-track-quest="' + esc(QID) + '">' + ico('send') + 'Оставить отзыв в Telegram</a></div></section>' +
      nextHtml() +
      (S.field ? '<section class="pl-field"><span class="pl-label">Полевой тест окончен</span><p class="pl-small">Напишите заметку с впечатлениями: что понравилось больше всего, где застряли, где было скучно. Потом нажмите «Отправить отчёт» и перешлите его в Telegram.</p>' +
        '<div class="pl-actions"><button class="pl-btn pl-btn--ghost" type="button" data-act="note">Заметка</button><button class="pl-btn pl-btn--ghost" type="button" data-act="report">Отправить отчёт</button></div></section>' : '');
  }
  // Один экран. c = {sec, f, F, live}: live — это текущий экран игрока, а не просмотр пройденного
  function frameHtml(fr, c) {
    var n = Q.points.length, p = c.sec >= 0 && c.sec < n ? Q.points[c.sec] : null;
    var now = c.sec === liveSec() && (fr.step == null || fr.step === S.k);
    LETTER_CTX = now ? null : letterAt(c.sec, fr.end ? 1e9 : fr.step == null ? -1 : fr.step);
    var hasGo = c.F.some(function (x) { return x.kind === 'go'; });
    if (fr.kind === 'road') {
      return pointHead(p) + '<section class="pl-card pl-road">' + distHtml(p) + (fr.lines.length ? '<div class="pl-lines">' + linesHtml(fr.lines) + '</div>' : '') + clockHtml(p, now && S.phase === 'walk') + mapBtn(p) + '</section>' +
        (hasGo ? '' : checkBlock(p, false));
    }
    if (fr.kind === 'go') {
      return '<section class="pl-card pl-road pl-road--go"><span class="pl-label">Точка ' + p.n + ' · идём</span>' + (distHtml(p) || '<p class="pl-dist">' + esc(plain(p.place)) + '</p>') +
        (fr.lines.length ? moreHtml('Как дойти', linesHtml(fr.lines)) : '') + clockHtml(p, now && S.phase === 'walk') + mapBtn(p) +
        '<p class="pl-small pl-road-note">Дойдёте — нажмите «Мы на месте».</p></section>' + checkBlock(p, false);
    }
    if (fr.kind === 'arrive') return pointHead(p) + coverHtml(p) + kidsHtml(p.kids) + checkBlock(p, true);
    if (fr.kind === 'wask') {
      var mine = c.sec === liveSec();
      return walkAskHtml(walkAsks(p)[fr.i], fr, mine ? ctxSlot('w:' + fr.i) : ((((S.hist || {})[c.sec] || {}).wa || [])[fr.i] || {}), mine && S.phase === 'walk');
    }
    if (fr.kind === 'task') return taskHtml(fr, c, p);
    if (fr.kind === 'result') {
      var cards = fr.res ? stepCards(p.steps[fr.step]) : [];
      return '<section class="pl-result">' + (fr.res ? '<div class="pl-result-top">' + resultStamp(fr.res) + '</div>' : '') + voiceHtml(fr.lines) +
        (fr.lines.length ? '<div class="pl-lines">' + linesHtml(fr.lines) + '</div>' : '') +
        (cards.length ? '<aside class="pl-toboard"><span class="pl-label">Легло на доску улик</span><ul>' + cards.map(function (id) { return '<li>' + inline(CARDS[id].title) + '</li>'; }).join('') + '</ul></aside>' : '') + '</section>';
    }
    if (fr.kind === 'done') {
      var h = '<div class="pl-result-top"><span class="pl-stamp">Точка ' + p.n + ' пройдена</span></div>';
      var clues = S.board.filter(function (x) { return x.n === p.n; });
      if (p.clue && clues.length) h += '<div><span class="pl-label">Улика № ' + (S.board.indexOf(clues[0]) + 1) + ' — на вашей доске</span>' + clueCard(p.clue, c.live) + '</div>';
      var got = S.cards.filter(function (x) { return x.n === p.n; });
      if (got.length) h += '<div><span class="pl-label">На доску улик ' + (got.length === 1 ? 'легла карточка' : 'легли карточки') + '</span>' +
        '<div class="pl-cards">' + got.map(function (x) { return cardHtml(x.id, { isNew: c.live }); }).join('') + '</div></div>';
      return h + kidsHtml(p.kids);
    }
    if (fr.kind === 'closed') return closedHtml();
    if (fr.kind === 'facts') {
      return '<section class="pl-facts">' + factsHtml() + '</section>' +
        '<div class="pl-actions"><button class="pl-btn pl-btn--ghost pl-btn--sm" type="button" data-act="back">К карточке дела и оценке</button>' +
        '<button class="pl-btn pl-btn--ghost pl-btn--sm" type="button" data-act="restart">Начать заново</button></div>';
    }
    // реплики
    var top = (fr.tag && fr.tag.tag) || fr.title ? '<div class="pl-task-top">' + (fr.tag ? tagHtml(fr.tag) : '') + (fr.title ? '<span class="pl-beat-title">' + esc(plain(fr.title)) + '</span>' : '') + '</div>' : '';
    return top + voiceHtml(fr.lines, fr.audio) + '<section class="pl-lines pl-beat">' + linesHtml(fr.lines) + '</section>' + (fr.board ? '<div class="pl-beat-board">' + boardLetters(false) + '</div>' : '');
  }
  // Строка над экраном: «назад», где мы, линия мини-шагов точки; нажатие — оглавление
  // Строка над экраном: «назад» и где мы. Нажатие на название — оглавление пройденного (стрелка ▾ это показывает).
  // Отдельной линии мини-шагов здесь нет (владелец 27.11: «прогресс-бар под прогресс-баром»): ход внутри точки
  // показывает текущий отрезок общей полосы в шапке (pointPart), а не вторая полоса.
  function crumbHtml(pos, F, fr) {
    var name = fr.kind === 'road' ? 'Точка ' + Q.points[pos.sec].n + ' · дорога' : fr.kind === 'arrive' ? 'Точка ' + Q.points[pos.sec].n + ' · на месте' : secName(pos.sec);
    var canBack = !(pos.sec < 0 && pos.f === 0);
    return '<div class="pl-crumb">' +
      '<button type="button" class="pl-back" data-act="back" aria-label="Назад, к предыдущему шагу"' + (canBack ? '' : ' hidden') + '>' + ico('back') + '</button>' +
      '<button type="button" class="pl-crumb-btn" data-act="toc" aria-haspopup="dialog" aria-label="Оглавление. ' + esc(secName(pos.sec)) + ', экран ' + (pos.f + 1) + '">' +
      '<span class="pl-crumb-t">' + esc(name) + '</span>' + ico('chev') + '</button></div>';
  }
  // Доля пройденного в текущей точке (0…1) — для текущего отрезка полосы в шапке: дорога — первая пятая, дальше — шаги
  function pointPart() {
    if (S.phase === 'walk') {
      var F = framesOf(S.p), f = Math.max(0, S.f);
      return 0.2 * Math.min(1, (f + 1) / Math.max(1, F.length));
    }
    if (S.phase === 'step') { var ns = pt().steps.length || 1; return 0.2 + 0.8 * Math.min(S.k, ns) / ns; }
    return S.phase === 'point_done' ? 1 : 0;
  }
  function barHtml(fr, c) {
    var btn = function (act, label, ghost) { return '<button class="pl-btn' + (ghost ? ' pl-btn--ghost' : '') + '" type="button" data-act="' + act + '">' + esc(label) + '</button>'; };
    if (c.live && fr.kind === 'closed') return c.F.length > 1 ? '<div class="pl-actions pl-bar pl-bar--flow">' + btn('fwd', 'Где правда, а где вымысел', true) + '</div>' : '';
    if (!c.live) return '<div class="pl-actions pl-stick pl-bar pl-bar--review">' + btn('fwd', 'Дальше', true) + btn('current', 'К текущему шагу') + '</div>';
    var last = c.f === c.F.length - 1, h = '';
    if (fr.kind === 'task') return '';
    if (fr.kind === 'wask' && S.phase === 'walk' && !(S.wa[fr.i] && S.wa[fr.i].res)) return '';
    if (!last) h = btn('fwd', 'Дальше');
    else if (S.phase === 'intro') h = btn('go', 'К точке 1');
    else if (S.phase === 'walk') h = btn('here', 'Мы на месте');
    else if (S.phase === 'step') h = fr.gate ? btn('next', fr.button || 'Дальше') : '';
    else if (S.phase === 'point_done') h = btn('nextpoint', S.p + 1 >= Q.points.length ? 'К финалу' : 'К точке ' + (S.p + 2));
    return h ? '<div class="pl-actions pl-stick pl-bar">' + h + '</div>' : '';
  }
  function modeSeg() {
    return '<div class="pl-seg pl-mode" role="group" aria-label="Как проходить">' +
      '<button type="button" data-act="mode" data-mode="listen" aria-pressed="' + (MODE === 'listen') + '">Слушаю и читаю</button>' +
      '<button type="button" data-act="mode" data-mode="read" aria-pressed="' + (MODE === 'read') + '">Читаю</button></div>';
  }
  function pointView() {
    var n = Q.points.length;
    if (S.ver_from != null) {
      var whereNow = S.phase === 'done' ? 'дело уже раскрыто' : S.phase === 'intro' ? 'вступление' : 'точка ' + pt().n + ' из ' + n;
      return head('Обновление', 'Вышла новая версия дела', '', 1) +
        '<section class="pl-card pl-ver"><p>Вы начали дело' + (S.ver_from ? ' в версии ' + esc(S.ver_from) : '') + ', сейчас — версия ' + esc(String(Q.version)) + '. ' +
        'Тексты, загадки или маршрут могли измениться.</p>' +
        '<p class="pl-small">Новая версия начнётся с обложки: улики и записи старой на этом телефоне сотрутся. Можно и доиграть старую с того же места (' + esc(whereNow) + '), но кое-что может не совпасть с тем, что вы уже видели.</p></section>' +
        '<div class="pl-actions pl-stick"><button class="pl-btn" type="button" data-act="vernew">Начать новую версию</button>' +
        '<button class="pl-btn pl-btn--ghost" type="button" data-act="verkeep">Доиграть старую</button>' +
        (S.field ? '<button class="pl-btn pl-btn--ghost" type="button" data-act="report">Отправить отчёт старой версии</button>' : '') + '</div>';
    }
    if (S.paused) {
      return head('Пауза', 'Дело отложено', 'Прогресс сохранён на этом телефоне' + (S.phase === 'done' ? '' : ': точка ' + pt().n + ' из ' + n) + '.', 2) +
        '<div class="pl-actions"><button class="pl-btn" type="button" data-act="resume">Продолжить</button>' +
        (S.field ? '<button class="pl-btn pl-btn--ghost" type="button" data-act="report">Отправить отчёт</button>' : '') +
        '<button class="pl-btn pl-btn--ghost" type="button" data-act="restart">Начать заново</button></div>';
    }
    if (S.phase === 'idle') {
      return head((Q.district ? Q.district + ' · ' : '') + caseName(), Q.title, Q.summary || '', 0) + sunNote() +
        (S.field ? '<section class="pl-field"><span class="pl-label">Режим полевого теста</span><p class="pl-small">На каждой точке — список «что проверить». Время, ошибки, подсказки и заметки сохраняются сами. В конце, а при желании и раньше (меню → «Отправить отчёт»), отправьте отчёт одним сообщением в Telegram.</p></section>' : '') +
        '<section class="pl-how"><span class="pl-label">Как пойдём</span>' + modeSeg() +
        '</section>' +
        '<div class="pl-actions pl-stick"><button class="pl-btn" type="button" data-act="start">Открыть дело</button></div>' +
        '<p class="pl-small">Прогресс сохраняется на этом телефоне: можно закрыть страницу и вернуться.</p>';
    }
    var pos = shownPos(), F = framesOf(pos.sec);
    if (pos.f >= F.length) { pos.f = F.length - 1; }
    var fr = F[pos.f], c = { sec: pos.sec, f: pos.f, F: F, live: !peek };
    var headed = fr.kind === 'road' || fr.kind === 'arrive' || fr.kind === 'closed';
    return crumbHtml(pos, F, fr) +
      (peek ? '<p class="pl-review"><span class="pl-stamp pl-stamp--ans">Пройденное</span> Это вы уже видели: ' + esc(secName(pos.sec)) + '.</p>' : '') +
      '<div class="pl-step" id="frame" tabindex="-1" data-sec="' + pos.sec + '" data-f="' + pos.f + '" data-frame="' + esc(fr.id) + '" data-kind="' + esc(fr.kind) + '" data-dir="' + moveDir + '">' +
      (headed ? '' : '<h1 class="visually-hidden">' + esc(secName(pos.sec)) + '</h1>') + frameHtml(fr, c) + '</div>' +
      (/^(road|go|arrive|task|wask|done)$/.test(fr.kind) ? issueBtn() : '') + barHtml(fr, c);
  }
  // Оглавление: всё пройденное по точкам и мини-шагам; того, что впереди, в нём нет — только число точек
  function tocHtml() {
    var n = Q.points.length, live = liveSec(), pos = shownPos(), h = '';
    for (var sec = -1; sec <= Math.min(live, n); sec++) {
      var F = framesOf(sec), seen = sec === live && S.phase !== 'done' ? S.f : F.length - 1, items = '', lastStep = null;
      for (var i = 0; i <= seen && i < F.length; i++) {
        var fr = F[i];
        if (fr.step != null && fr.step !== lastStep) {
          var st = Q.points[sec].steps[fr.step];
          items += '<li class="pl-toc-h">Шаг ' + (fr.step + 1) + (st.title ? ' · ' + esc(plain(st.title)) : '') + '</li>';
          lastStep = fr.step;
        }
        var here = sec === live && i === S.f;
        items += '<li><button type="button" data-act="jump" data-sec="' + sec + '" data-f="' + i + '"' + (sec === pos.sec && i === pos.f ? ' aria-current="step"' : '') + '>' +
          '<span>' + esc(frameLabel(fr, sec)) + '</span>' + (here ? '<small>вы здесь</small>' : '') + '</button></li>';
      }
      h += moreHtml('<b>' + esc(secName(sec)) + '</b><small>' + (sec < live ? 'пройдено' : S.phase === 'done' ? 'финал' : 'сейчас') + '</small>', '<ol class="pl-toc">' + items + '</ol>', 'pl-toc-sec', sec === pos.sec);
    }
    var ahead = n - 1 - live;
    if (ahead > 0) h += '<p class="pl-small pl-toc-ahead">Впереди ещё ' + ahead + ' ' + (ahead % 10 === 1 && ahead !== 11 ? 'точка' : ahead % 10 >= 2 && ahead % 10 <= 4 && (ahead < 10 || ahead > 20) ? 'точки' : 'точек') + ' — откроются по ходу дела.</p>';
    return h;
  }

  var lastKey = null, lastBadge = 0;
  function render() {
    var n = Q.points.length;
    var playing = S.phase !== 'idle' && !S.paused && S.ver_from == null;
    if (!playing) { view = 'point'; peek = null; }
    // шапка дела и прогресс по точкам
    var shown = (S.phase === 'walk' || S.phase === 'step' || S.phase === 'point_done') ? pt().n : (S.phase === 'done' ? n : 0);
    var where = document.getElementById('where');
    where.innerHTML = esc(CASE_NO ? caseName() : '') + (shown ? (CASE_NO ? ' · ' : '') + '<b>' + shown + ' из ' + n + '</b>' : '');
    where.setAttribute('aria-label', (CASE_NO ? caseName() : '') + (shown ? ', точка ' + shown + ' из ' + n : ''));
    // Один индикатор прогресса: отрезок на точку; текущий заполняется по ходу точки (дорога → шаги)
    var prog = '', passed = 0, part = playing || S.paused ? pointPart() : 0;
    for (var i = 0; i < n; i++) {
      var done = S.phase === 'done' || i < S.p || (i === S.p && S.phase === 'point_done');
      var cur = !done && i === S.p && (S.phase === 'walk' || S.phase === 'step');
      if (done) passed++;
      prog += cur ? '<i class="cur" style="--part:' + Math.round(part * 100) + '%"></i>' : '<i class="' + (done ? 'done' : '') + '"></i>';
    }
    var bar = document.getElementById('progress');
    bar.innerHTML = S.phase === 'idle' ? '' : prog;
    bar.setAttribute('aria-label', 'Пройдено точек: ' + passed + ' из ' + n + (S.phase === 'walk' || S.phase === 'step' ? '; точка ' + pt().n + ' — пройдено около ' + Math.round(part * 100) + '%' : ''));
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
    // «живые» детали и переход экрана играют один раз — когда экран сменился, а не при каждой перерисовке
    var pos = playing ? shownPos() : { sec: -2, f: 0 };
    var key = [S.phase, S.p, S.k, S.paused, pos.sec, pos.f].join(':');
    app.classList.toggle('pl-fresh', key !== lastKey && view === 'point');
    lastKey = key;
    if (voiceBox && !document.contains(voiceBox)) stopVoice();
    app.innerHTML = view === 'board' ? boardView() : view === 'map' ? mapView() : pointView();
    kbGone();
    var fr = document.getElementById('frame');
    if (view === 'point' && fr) placeArrows(fr.dataset.sec + ':' + fr.dataset.frame); else [].forEach.call(app.querySelectorAll('.pl-arrow'), function (a) { a.remove(); });
  }
  // После перерисовки вернуть фокус на ту же кнопку (выбор карточек, варианты) — клавиатура и чтение с экрана не теряют место
  function refocus(sel) { var el = document.querySelector(sel); if (el) { try { el.focus({ preventScroll: true }); } catch (e) { el.focus(); } } }

  function smooth() {
    try { return window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth'; } catch (e) { return 'auto'; }
  }
  // Новый экран всегда начинается сверху: игроку не нужно искать, что появилось
  function toTop() {
    window.scrollTo(0, 0);
    var fr = document.getElementById('frame') || app;
    try { fr.focus({ preventScroll: true }); } catch (e) { /* без фокуса */ }
  }
  // focus: 'top' — новый экран (сверху); иначе экран тот же, прокрутка не трогается; sel — что должно остаться на виду
  function commit(focus, sel) {
    view = 'point';
    if (focus === 'top') peek = null;
    save();
    render();
    if (focus === 'top') {
      toTop();
      if (MODE === 'listen') { var v = app.querySelector('.pl-voice[data-srcs]'); if (v) playVoice(v, true); }
      return;
    }
    var el = sel && app.querySelector(sel);
    if (el) el.scrollIntoView({ block: 'nearest', behavior: smooth() });
  }
  // Показать экран (sec, f): текущий — как есть, пройденный — в режиме просмотра
  function show(sec, f, dir) {
    stopVoice();
    moveDir = dir || 'fwd';
    if (sec === liveSec() && S.phase === 'done') { S.f = f; peek = null; save(); }
    else peek = sec === liveSec() && f === S.f ? null : { sec: sec, f: f };
    view = 'point';
    render();
    toTop();
  }
  function back() {
    var pos = shownPos();
    if (pos.f > 0) return show(pos.sec, pos.f - 1, 'back');
    if (pos.sec < 0) return;
    show(pos.sec - 1, framesOf(pos.sec - 1).length - 1, 'back');
  }
  function fwd() {
    moveDir = 'fwd';
    if (peek) {
      if (peek.f < framesOf(peek.sec).length - 1) return show(peek.sec, peek.f + 1, 'fwd');
      return show(peek.sec + 1, 0, 'fwd');
    }
    if (S.f < framesOf(liveSec()).length - 1) { stopVoice(); S.f += 1; commit('top'); }
  }

  // ---------- клавиатура телефона: экран не ездит ----------
  // Поле ответа стоит в потоке страницы (не прилипает и не position: fixed), поэтому открытая клавиатура ничего не двигает.
  // Пока поле в фокусе, нижняя навигация и прилипшие кнопки убраны (класс pl-kb) — на iOS они «всплывают» поверх текста.
  // Если клавиатура закрыла поле — прокручиваем один раз и ровно настолько, чтобы поле и кнопка «Ответить» были видны.
  var kbEl = null, kbTm = 0, vv = window.visualViewport || null;
  function kbFit() {
    if (!kbEl || !document.contains(kbEl)) return;
    var box = kbEl.closest('.pl-form') || kbEl, r = box.getBoundingClientRect();
    var top = vv ? vv.offsetTop : 0, h = vv ? vv.height : window.innerHeight;
    var need = r.bottom + 12 - (top + h);
    if (need <= 0) return;
    var headB = document.querySelector('.pl-top').getBoundingClientRect().bottom;
    var room = r.top - Math.max(headB, top) - 8;
    if (room > 0) window.scrollBy(0, Math.min(need, room));
  }
  // поле ушло вместе с экраном (верный ответ) — focusout не приходит, режим клавиатуры снимаем сами
  function kbGone() { if (kbEl && !document.contains(kbEl)) { kbEl = null; document.documentElement.classList.remove('pl-kb'); } }
  document.addEventListener('focusin', function (e) {
    var t = e.target;
    if (!t || !t.matches || !t.matches('#app .pl-input')) return;
    kbEl = t;
    document.documentElement.classList.add('pl-kb');
    clearTimeout(kbTm); kbTm = setTimeout(kbFit, 350);
  });
  document.addEventListener('focusout', function (e) {
    if (e.target !== kbEl) return;
    setTimeout(function () {
      if (kbEl && document.activeElement === kbEl) return;
      kbEl = null; document.documentElement.classList.remove('pl-kb');
    }, 120);
  });
  if (vv) vv.addEventListener('resize', function () { if (kbEl) { clearTimeout(kbTm); kbTm = setTimeout(kbFit, 60); } });

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
    } else if (kind === 'toc') {
      title = 'Оглавление';
      body = tocHtml();
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
        '<div class="pl-menu-mode"><span class="pl-label">Как проходить</span>' + modeSeg() + '</div>' +
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
    var cur = kind === 'toc' && sheet.querySelector('[aria-current="step"]');
    if (cur) cur.scrollIntoView({ block: 'center' });
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
      var ck = S.clk[Q.points.indexOf(p)] || {};   // H-45: какая ветка «по часам» была на этой дороге и кто её выбрал
      Object.keys(ck).forEach(function (k) {
        out.push('   ' + plain((CLOCK[k] || {}).label || k) + ': ' + (ck[k].v === 'open' ? 'открыто' : 'закрыто') + (ck[k].by === 'hand' ? ' (отмечено вручную)' : ' (по часам)'));
      });
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
    next: function () {
      if (peek || S.phase !== 'step') return fwd();
      var F = framesOf(S.p);
      if (S.f < F.length - 1) return fwd();
      if (F[S.f].gate) resolve({ st: 'info' });
    },
    fwd: fwd,
    back: back,
    current: function () { show(liveSec(), S.f, 'fwd'); },
    toc: function () { openSheet('toc'); },
    jump: function (el) { closeSheet(); show(parseInt(el.dataset.sec, 10), parseInt(el.dataset.f, 10), 'fwd'); },
    mode: function (el) {
      MODE = el.dataset.mode === 'read' ? 'read' : 'listen';
      store.set(MODE_KEY, MODE);
      if (MODE === 'read') stopVoice();
      render();
      if (sheetKind === 'menu') openSheet('menu');
      refocus((sheetKind === 'menu' ? '#sheet ' : '#app ') + '[data-act="mode"][data-mode="' + MODE + '"]');
    },
    rate: function (el) { rate(parseInt(el.dataset.v, 10)); },
    sharecase: shareCase,
    voice: function (el) { playVoice(el); },
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
    nextpoint: nextPoint,
    clock: function (el) {
      var k = el.dataset.k, v = el.dataset.v === 'closed' ? 'closed' : 'open', sec = liveSec();
      if (!CLOCK[k] || S.phase !== 'walk') return;
      var F0 = framesOf(sec), id = (F0[S.f] || {}).id;
      (S.clk[sec] = S.clk[sec] || {})[k] = { v: v, by: 'hand' };
      log('clock', { key: k, value: v });
      var F1 = framesOf(sec);
      S.f = frameIndex(F1, function (x) { return x.id === id; }, Math.min(S.f, F1.length - 1));
      commit(null, '[data-act="clock"][data-k="' + k + '"]');
      var d = CLOCK[k];
      toast(v === 'closed' ? (d.closed_toast || 'Маршрут обновлён: двери закрыты') : (d.open_toast || 'Маршрут обновлён: двери открыты'));
    },
    view: function (el) {
      var v = el.dataset.view;
      if (v === view && v !== 'point') return;
      var same = v === view;
      view = v; render();
      if (!same) { window.scrollTo(0, 0); return; }
      // повторное нажатие «Точка» — вернуться к текущему шагу
      show(liveSec(), S.f, 'fwd');
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
    // H-74: новая версия дела поверх старого сохранения
    vernew: function () { var from = S.ver_from; S = fresh(); log('version', { from: from, to: Q.version, choice: 'new' }); commit('top'); },
    verkeep: function () {
      var from = S.ver_from; delete S.ver_from; S.version = Q.version;
      log('version', { from: from, to: Q.version, choice: 'keep' });
      if (S.phase === 'walk' || S.phase === 'step' || S.phase === 'point_done') fixClock(S.p);
      fixCursor(); commit('top');
    },
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
  var voice = null, voiceBox = null, voiceList = [], voiceAt = 0;
  function stopVoice() { if (voice) { try { voice.pause(); } catch (e) { /* уже остановлен */ } } voice = null; voiceBox = null; }
  function clock(s) { s = Math.max(0, Math.round(s || 0)); return Math.floor(s / 60) + ':' + ('0' + (s % 60)).slice(-2); }
  function playVoice(el, quiet) {
    var box = el.closest('.pl-voice');
    if (!box) return;
    if (!box.dataset.srcs) { if (!quiet) toast('Озвучка появится позже — пока читаем глазами'); return; }
    if (voice && voiceBox === box) { if (voice.paused) { var p0 = voice.play(); if (p0 && p0.catch) p0.catch(function () {}); } else voice.pause(); return; }
    stopVoice();
    voiceBox = box; voiceList = box.dataset.srcs.split('|'); voiceAt = 0;
    playNext(quiet);
  }
  function playNext(quiet) {
    var box = voiceBox, a = new Audio(voiceList[voiceAt]);
    voice = a;
    var btn = box.querySelector('.pl-voice-btn'), note = box.querySelector('.pl-voice-note'), bars = box.querySelectorAll('.pl-voice-wave i');
    var set = function (on) {
      if (voice !== a) return;
      btn.setAttribute('aria-pressed', on ? 'true' : 'false'); btn.setAttribute('aria-label', on ? 'Пауза' : 'Слушать');
      box.classList.toggle('is-on', on);
    };
    a.addEventListener('play', function () { set(true); });
    a.addEventListener('pause', function () { set(false); });
    a.addEventListener('timeupdate', function () {
      if (voice !== a || !a.duration) return;
      var part = (voiceAt + a.currentTime / a.duration) / voiceList.length, k = Math.round(part * bars.length);
      [].forEach.call(bars, function (b, i) { b.classList.toggle('on', i < k); });
      note.textContent = clock(a.currentTime);
    });
    a.addEventListener('ended', function () {
      if (voice !== a) return;
      if (voiceAt + 1 < voiceList.length) { voiceAt += 1; playNext(quiet); } else set(false);
    });
    a.addEventListener('error', function () { if (voice !== a) return; set(false); if (!quiet) toast('Озвучка ещё не готова — читаем глазами'); });
    var pr = a.play();
    if (pr && pr.catch) pr.catch(function () { /* автозапуск запрещён или файла нет — остаётся кнопка */ });
  }
  // Оценка дела. TODO(сервер): приёма оценок пока нет. Когда появится — отправлять отсюда (sendBeacon/fetch на свой адрес);
  // до тех пор оценка хранится только на телефоне игрока (RATE_KEY), а отзыв уходит через бота (done_<дело>).
  function sendRating(value) { void value; return false; }
  function rate(v) {
    v = Math.max(1, Math.min(5, v | 0));
    store.set(RATE_KEY, String(v));
    sendRating(v);
    log('rate', { value: v }); save();
    var box = document.getElementById('rate');
    if (!box) return;
    box.querySelector('.pl-stars').innerHTML = starsHtml(v);
    var bot = document.getElementById('rate-bot');
    if (bot) bot.setAttribute('href', reviewLink(v));
    document.getElementById('rate-note').textContent = rateNote(v);
    refocus('#app .pl-star[data-v="' + v + '"]');
  }
  // ---------- открытка «Дело раскрыто» (H-54) ----------
  // Картинка для соцсетей и мессенджеров: номер и название дела, штамп, время в пути, ссылка на страницу дела.
  // Без единого слова разгадки: только то, что есть на карточке финала (player_check сверяет строки со словами-ответами).
  // Рисуется заранее, когда открылся финал: в Safari navigator.share работает только сразу после нажатия.
  var POSTCARD = null;   // { key, blob }
  function caseLink() {
    try { return new URL(document.body.dataset.caseUrl || '../../', location.href).href; } catch (e) { return location.href; }
  }
  // Ссылка в «Поделиться» — с меткой ?from=card (H-63): переходы по открыткам видны в Метрике (site/assets/analytics.js).
  // На самой картинке открытки адрес печатается без метки (caseLink).
  function shareLink() {
    try { var u = new URL(caseLink()); u.searchParams.set('from', 'card'); return u.href; } catch (e) { return caseLink(); }
  }
  function shareText() { return 'Мы раскрыли «' + plain(Q.title) + '» — городской квест «Дворами».'; }
  function postcardFacts() {
    var n = Q.points.length;
    return [['В пути', dur((S.t_end || Date.now()) - S.t_start)], ['Точек', n + ' из ' + n], ['Дата', day(S.t_end || Date.now())]];
  }
  function postcardLines() {
    var where = [Q.city, Q.district].filter(Boolean).join(' · ');
    return [caseName(), where, plain(Q.title), 'Дело раскрыто'].concat(postcardFacts().map(function (f) { return f[0] + ' ' + f[1]; }))
      .concat(['Дворами', 'городские квесты-расследования', caseLink().replace(/^https?:\/\//, '').replace(/\/$/, '')]).filter(Boolean);
  }
  function cssVar(name, dflt) {
    var v = '';
    try { v = getComputedStyle(document.documentElement).getPropertyValue(name).trim(); } catch (e) { /* старый браузер */ }
    return v || dflt;
  }
  function wrapText(ctx, text, maxW) {
    var words = String(text).split(/\s+/), lines = [], cur = '';
    words.forEach(function (w) {
      var t = cur ? cur + ' ' + w : w;
      if (cur && ctx.measureText(t).width > maxW) { lines.push(cur); cur = w; } else cur = t;
    });
    if (cur) lines.push(cur);
    return lines;
  }
  function postcardKey() { return QID + '|' + (S.t_end || 0) + '|' + cssVar('--paper', '') + '|' + cssVar('--bg', ''); }
  function postcard() {
    var key = postcardKey();
    if (POSTCARD && POSTCARD.key === key) return Promise.resolve(POSTCARD.blob);
    var W = 1080, H = 1350, cv = document.createElement('canvas');
    cv.width = W; cv.height = H;
    var ctx = cv.getContext && cv.getContext('2d');
    if (!ctx || !cv.toBlob) return Promise.resolve(null);
    var c = { bg: cssVar('--bg', '#141414'), paper: cssVar('--paper', '#F2EFE8'), ink: cssVar('--ink', '#141414'), ink2: cssVar('--ink-2', '#3A3833'),
      accent: cssVar('--accent', '#E1251B'), stamp: cssVar('--stamp', '#B3261E'), text: cssVar('--text', '#F2EFE8'), text2: cssVar('--text-2', '#C9C5BC'),
      fd: cssVar('--font-display', 'sans-serif'), ft: cssVar('--font-text', 'sans-serif'), up: cssVar('--h1-case', 'none') === 'uppercase' };
    var F = function (w, px, fam) { return w + ' ' + px + 'px ' + fam; };
    var lines = postcardLines(), title = plain(Q.title), where = [Q.city, Q.district].filter(Boolean).join(' · ');
    var fonts = document.fonts && document.fonts.load ? Promise.all([F(700, 96, c.fd), F(600, 30, c.ft)].map(function (f) {
      return document.fonts.load(f, lines.join(' ')).catch(function () { return null; });
    })) : Promise.resolve();
    var wait = new Promise(function (ok) { setTimeout(ok, 1500); });   // шрифт не пришёл — рисуем запасным
    return Promise.race([fonts, wait]).then(function () {
      var X = 80, Y = 200, CW = W - 2 * X, PAD = 64, inner = CW - 2 * PAD;
      ctx.fillStyle = c.bg; ctx.fillRect(0, 0, W, H);
      // фигуры, как у заголовка точки: круг и наклонная полоса (декор, за карточкой)
      ctx.fillStyle = c.accent;
      ctx.beginPath(); ctx.arc(W - 150, 170, 200, 0, Math.PI * 2); ctx.fill();
      ctx.save(); ctx.translate(0, H - 30); ctx.rotate(-0.06); ctx.fillRect(-40, 0, W + 80, 10); ctx.restore();   // ниже подписи, не под текстом
      // заголовок: размер подбираем, чтобы название встало в 4 строки
      var size = 104, tl;
      do { size -= 8; ctx.font = F(700, size, c.fd); tl = wrapText(ctx, c.up ? title.toUpperCase() : title, inner); } while (tl.length > 4 && size > 56);
      var CH = PAD + 48 + 56 + tl.length * size * 1.04 + 40 + 120 + 56 + 150 + PAD;
      ctx.fillStyle = c.accent; ctx.fillRect(X + 16, Y + 16, CW, CH);
      ctx.fillStyle = c.paper; ctx.fillRect(X, Y, CW, CH);
      var y = Y + PAD + 40;
      ctx.fillStyle = c.ink; ctx.textBaseline = 'alphabetic'; ctx.textAlign = 'left';
      ctx.font = F(700, 44, c.fd); ctx.fillText(caseName().toUpperCase(), X + PAD, y);
      if (where) { ctx.fillStyle = c.ink2; ctx.font = F(600, 30, c.ft); ctx.textAlign = 'right'; ctx.fillText(where, X + CW - PAD, y); ctx.textAlign = 'left'; }
      y += 56 + size * 0.9;
      ctx.fillStyle = c.ink; ctx.font = F(700, size, c.fd);
      tl.forEach(function (ln, i) { ctx.fillText(ln, X + PAD, y + i * size * 1.04); });
      y += (tl.length - 1) * size * 1.04 + 40;
      // штамп «Дело раскрыто» — двойная рамка, наклон как на карточке финала
      ctx.save();
      ctx.font = F(700, 60, c.fd);
      var st = 'ДЕЛО РАСКРЫТО', sw = ctx.measureText(st).width + 56, sh = 96;
      ctx.translate(X + CW - PAD - sw / 2, y + sh / 2 + 6); ctx.rotate(-7 * Math.PI / 180);
      ctx.strokeStyle = c.stamp; ctx.fillStyle = c.stamp;
      ctx.lineWidth = 5; ctx.strokeRect(-sw / 2, -sh / 2, sw, sh);
      ctx.lineWidth = 3; ctx.strokeRect(-sw / 2 + 11, -sh / 2 + 11, sw - 22, sh - 22);
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(st, 0, 4);
      ctx.restore();
      y += 120 + 24;
      // цифры прохождения под пунктиром
      ctx.strokeStyle = c.ink2; ctx.lineWidth = 3;
      if (ctx.setLineDash) ctx.setLineDash([12, 10]);
      ctx.beginPath(); ctx.moveTo(X + PAD, y); ctx.lineTo(X + CW - PAD, y); ctx.stroke();
      if (ctx.setLineDash) ctx.setLineDash([]);
      var col = inner / 3;
      postcardFacts().forEach(function (f, i) {
        var fx = X + PAD + i * col;
        ctx.fillStyle = c.ink2; ctx.font = F(600, 28, c.ft); ctx.fillText(f[0], fx, y + 58);
        var v = f[1], mw = col - 16, fs = 46;
        ctx.fillStyle = c.ink; ctx.font = F(700, fs, c.fd);
        while (ctx.measureText(v).width > mw && fs > 30) { fs -= 2; ctx.font = F(700, fs, c.fd); }
        ctx.fillText(v, fx, y + 116);
      });
      // подпись и ссылка под карточкой
      var by = Y + CH + 110;
      ctx.fillStyle = c.text; ctx.font = F(700, 52, c.fd); ctx.fillText('ДВОРАМИ', X, by);
      ctx.fillStyle = c.text2; ctx.font = F(600, 30, c.ft); ctx.fillText('городские квесты-расследования', X, by + 48);
      var link = lines[lines.length - 1];
      ctx.font = F(600, 30, c.ft);
      while (ctx.measureText(link).width > CW && link.length > 12) link = link.slice(0, -2);
      ctx.fillText(link, X, by + 100);
      return new Promise(function (ok) { cv.toBlob(function (b) { ok(b); }, 'image/png'); });
    }).then(function (blob) { if (blob) POSTCARD = { key: key, blob: blob }; return blob; }, function () { return null; });
  }
  function warmPostcard() {
    if (POSTCARD || warmPostcard.tm) return;
    warmPostcard.tm = setTimeout(function () { warmPostcard.tm = 0; if (document.getElementById('closed-card')) postcard(); }, 600);
  }
  function postcardName() { return 'dvorami-' + QID + '-raskryto.png'; }
  function saveBlob(blob, name) {
    try {
      var a = document.createElement('a');
      a.href = URL.createObjectURL(blob); a.download = name;
      document.body.appendChild(a); a.click();
      setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
      return true;
    } catch (e) { return false; }
  }
  // Запасной путь без Web Share с файлами: открытка скачивается, ссылка копируется
  function sharePostcardFallback(blob, text, url) {
    var saved = blob ? saveBlob(blob, postcardName()) : false;
    copyText(text + ' ' + url).then(function (ok) {
      toast(saved ? (ok ? 'Открытка сохранена, ссылка скопирована' : 'Открытка сохранена') : ok ? 'Ссылка скопирована — отправьте друзьям' : 'Не получилось — сделайте снимок экрана');
    });
  }
  function shareCase() {
    var url = shareLink(), text = shareText();
    track('final_share', { quest: QID });
    var go = function (blob) {
      var file = null;
      try { if (blob && typeof File === 'function') file = new File([blob], postcardName(), { type: 'image/png' }); } catch (e) { file = null; }
      var canFiles = false;
      try { canFiles = !!(file && navigator.share && navigator.canShare && navigator.canShare({ files: [file] })); } catch (e) { canFiles = false; }
      if (canFiles) {
        // ссылку кладём в текст: с файлом часть приложений поле url не показывает
        return navigator.share({ files: [file], title: plain(Q.title), text: text + ' ' + url }).catch(function (err) {
          if (!err || err.name !== 'AbortError') sharePostcardFallback(blob, text, url);
        });
      }
      if (navigator.share) return navigator.share({ title: plain(Q.title), text: text, url: url }).catch(function () { /* передумали */ });
      sharePostcardFallback(blob, text, url);
    };
    // открытка уже готова — делимся сразу, в том же нажатии (иначе Safari откажет)
    if (POSTCARD && POSTCARD.key === postcardKey()) return go(POSTCARD.blob);
    postcard().then(go);
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
  // Мастер-код один на все дела (владелец 27.11, docs/codes.md): введён в одном деле — следующее дело на этом телефоне
  // пробует его само, без экрана кода. Берём только код длины мастер-кода (12 знаков); не подошёл — обычный экран кода, без ошибки.
  function otherMaster() {
    try {
      for (var i = 0; i < localStorage.length; i++) {
        var k = localStorage.key(i);
        if (k && k.indexOf('dvorami:code:') === 0 && k !== CODE_KEY) { var v = localStorage.getItem(k); if (normCode(v).length === 12) return v; }
      }
    } catch (e) { /* хранилище недоступно */ }
    return null;
  }
  var menuBtn = document.querySelector('.pl-menu-btn');
  function codeError(raw, why) {
    var n = normCode(raw);
    if (why === 'nocrypto') return 'Этот браузер не умеет проверять код. Откройте ссылку в свежем Safari, Chrome или Яндекс Браузере.';
    if (why === 'saved') return 'Код, сохранённый на этом телефоне, больше не открывает дело. Введите код ещё раз или напишите нам.';
    if (!n) return 'Введите код: 8 знаков, например 7K4M-Q2PX.';
    if (n.length === 12) return 'Код не подошёл. Проверьте его или напишите нам — поможем.';
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
        if (source === 'master') return codeView('');   // мастер-код другого дела не подошёл — молча показываем экран кода
        if (source === 'saved') store.del(CODE_KEY);
        return codeView(source === 'saved' ? '' : showCode(raw), codeFail(raw, source, source === 'saved' ? 'saved' : ''));
      }
      // сохранённый код открывает дело при каждом заходе — это не новый ввод, цель не шлём
      if (source !== 'saved' && source !== 'master') track('code_ok', { quest: QID, source: source });
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
    if (S.phase === 'walk' || S.phase === 'step' || S.phase === 'point_done') fixClock(S.p);
    fixCursor();
    if (S.phase !== 'idle') { log('reload'); save(); }
    themeColor();
    render();
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
      var other = otherMaster();
      if (other) { codeView(''); return tryCode(other, 'master'); }
      codeView('');
    }).catch(function (err) {
      app.innerHTML = '<section class="pl-card" id="top"><span class="pl-label">Не загрузилось</span><p>Нет связи или файл квеста недоступен (' + esc(err.message) + '). Проверьте интернет и попробуйте ещё раз.</p>' +
        '<div class="pl-actions"><button class="pl-btn" type="button" onclick="location.reload()">Обновить</button></div></section>';
    });
  }

  // Для проверок: функции сверки ответов и состояние
  window.__dvorami = { norm: ANS.norm, matches: ANS.matches, shareLink: function () { return shareLink(); }, state: function () { return S; }, quest: function () { return Q; }, optOrder: function (st) { return optOrder(st, 'step').map(function (x) { return String(x.id); }); }, report: function () { return report(); },
    flags: function () { return FLAGS; }, cards: function () { return CARDS; },
    postcardLines: function () { return postcardLines(); }, postcard: function () { return postcard().then(function (b) { return b ? b.size : 0; }); },
    clockOpenAt: function (def, min) { return openAt(def, min); }, mskMinutes: function () { return mskMinutes(); }, sunsetMsk: function (lat, lon) { return sunsetMsk(lat, lon); },
    // мини-шаги: где игрок (live), что на экране (shown), сколько экранов в разделе, режим чтения
    pos: function () { var p = shownPos(), F = framesOf(p.sec), x = F[p.f] || {}; return { sec: p.sec, f: p.f, live: liveSec(), cur: S.f, peek: !!peek, total: F.length, mode: MODE, id: x.id, kind: x.kind, step: x.step == null ? null : x.step }; },
    frames: function (sec) { return framesOf(sec).map(function (x) { return { id: x.id, kind: x.kind, step: x.step == null ? null : x.step }; }); } };

  if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost' || location.hostname === '127.0.0.1')) {
    navigator.serviceWorker.register('../sw.js').catch(function () { /* без офлайна */ });
  }
  boot();
})();

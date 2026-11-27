/* «Мои дела» (site/account/): дела, начатые или открытые кодом на этом устройстве. Сервера пока нет (переезд — A-20),
   поэтому список собирается из того, что плеер уже хранит в браузере, — плеер для этого не меняется:
     dvorami:play:<id>   — прогресс (phase idle|intro|walk|step|point_done|done, p, paused, t_start, t_end, version, events[{t, point}])
     dvorami:code:<id>   — код, которым открыли дело на этом устройстве (сам код на экран не выводим)
     dvorami:rating:<id> — оценка игрока в финале (1–5)
   Данные дел (номер, название, обложка, точки, плеер, версия сценария) — #cases-data, его пишет scripts/build_cases.py.
   Состояния и тексты — docs/account.md, «Состояния дела». Ничего не отправляем: всё читается и остаётся на телефоне. */
(function () {
  'use strict';
  var list = document.getElementById('my-list'), empty = document.getElementById('my-empty');
  if (!list || !empty) return;
  var cases = [];
  try { cases = JSON.parse(document.getElementById('cases-data').textContent) || []; } catch (e) { cases = []; }
  var html = document.documentElement;
  var brand = html.dataset.brand === 'sledami' ? 'sledami' : 'dvorami';
  var ROOT = '../';
  var PAUSE_AFTER = 3 * 3600 * 1000;   // без действий дольше трёх часов — «на паузе», даже если игрок не нажал «Закончить на сегодня»
  var now = Date.now();

  function get(k) { try { return window.localStorage.getItem(k); } catch (e) { return null; } }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function track(ev, p) { try { if (window.dvoramiTrack) window.dvoramiTrack(ev, p); } catch (e) { /* без аналитики */ } }
  function fmt(ms, opt) {
    try { return new Date(ms).toLocaleString('ru-RU', Object.assign({ timeZone: 'Europe/Moscow' }, opt)); }
    catch (e) { return new Date(ms).toLocaleString(); }
  }
  function dayKey(ms) { return fmt(ms, { year: 'numeric', month: 'numeric', day: 'numeric' }); }
  // «сегодня в 14:20», «вчера в 19:05», «14 декабря»
  function when(ms) {
    if (!ms) return '';
    var t = fmt(ms, { hour: '2-digit', minute: '2-digit', hour12: false });
    if (dayKey(ms) === dayKey(now)) return 'сегодня в ' + t;
    if (dayKey(ms) === dayKey(now - 864e5)) return 'вчера в ' + t;
    return fmt(ms, { day: 'numeric', month: 'long' });
  }
  function dur(ms) {
    if (!ms || ms < 0) return '';
    var m = Math.round(ms / 60000);
    return m >= 60 ? Math.floor(m / 60) + '&nbsp;ч ' + (m % 60) + '&nbsp;мин' : m + '&nbsp;мин';
  }

  // ---------- состояние дела на этом устройстве ----------
  function stateOf(c) {
    if (!c.play) return null;
    var s = null;
    try { s = JSON.parse(get('dvorami:play:' + c.play) || 'null'); } catch (e) { s = null; }
    if (!s || typeof s !== 'object' || s.quest !== c.play || s.v !== 1) s = null;
    var code = get('dvorami:code:' + c.play);
    var rating = Math.max(0, Math.min(5, parseInt(get('dvorami:rating:' + c.play), 10) || 0));
    if (s && s.phase && s.phase !== 'idle') {
      var ev = Array.isArray(s.events) ? s.events : [], last = +s.t_start || 0, point = null;
      for (var i = ev.length - 1; i >= 0; i--) {
        var e = ev[i] || {};
        if (typeof e.t === 'number' && e.t > last) last = e.t;
        if (point == null && e.point != null && !isNaN(parseInt(e.point, 10))) point = parseInt(e.point, 10);
      }
      var updated = c.version && s.version != null && String(s.version) !== String(c.version);
      if (s.phase === 'done') return { kind: 'done', t: +s.t_end || last, took: s.t_end && s.t_start ? s.t_end - s.t_start : 0, rating: rating };
      if (s.phase === 'intro') point = null;
      else if (point == null) point = (s.p | 0) + 1;
      return { kind: s.paused || now - last > PAUSE_AFTER ? 'paused' : 'active', t: last, point: point, pointDone: s.phase === 'point_done', updated: updated };
    }
    if (code) return { kind: 'ready', t: 0 };
    return null;
  }

  // ---------- карточка ----------
  var PILL = { active: 'Идёт', paused: 'На паузе', ready: 'Готово к старту', done: 'Раскрыто' };
  function cardHtml(c, st) {
    var url = ROOT + c.url, play = ROOT + 'play/' + c.play + '/', total = c.points || 0;
    var detail = '', sub = '', bar = '', actions = '', stateTail = '';
    if (st.kind === 'active' || st.kind === 'paused') {
      var n = st.point, next = n, passed = 0;
      if (n != null) {
        passed = st.pointDone ? n : n - 1;
        next = st.pointDone ? n + 1 : n;
        if (total) passed = Math.min(passed, total);
      }
      var finale = n != null && total && next > total;
      if (n == null) detail = st.kind === 'paused' ? 'Остановились на&nbsp;вступлении.' : 'Вы&nbsp;во&nbsp;вступлении.';
      else if (finale) detail = 'Все точки пройдены, остался финал.';
      else if (st.pointDone) detail = 'Точка&nbsp;' + n + ' пройдена, дальше&nbsp;— точка&nbsp;' + next + '.';
      else detail = (st.kind === 'paused' ? 'Остановились на&nbsp;точке&nbsp;' : 'Сейчас&nbsp;— точка&nbsp;') + n + '.';
      stateTail = st.kind === 'paused' ? when(st.t) : '';
      if (total && n != null) bar = '<div class="my-bar" role="img" aria-label="Пройдено точек: ' + passed + ' из ' + total + '"><i style="--w:' + Math.round(100 * passed / total) + '%"></i></div>';
      if (st.updated) sub = 'Дело обновилось. Откройте его и&nbsp;выберите: доиграть начатое или начать заново.';
      var label = finale ? 'К&nbsp;финалу' : st.kind === 'paused' && n != null ? 'Продолжить с&nbsp;точки&nbsp;' + next : 'Продолжить';
      actions = '<a class="btn" href="' + esc(play) + '" data-track="account_continue" data-track-quest="' + esc(c.slug) + '" data-track-state="' + st.kind + '">' + label + '</a>';
    } else if (st.kind === 'ready') {
      detail = 'Код принят на&nbsp;этом устройстве. Начать можно в&nbsp;любой день, когда придёте к&nbsp;старту.';
      actions = '<a class="btn" href="' + esc(play) + '" data-track="account_continue" data-track-quest="' + esc(c.slug) + '" data-track-state="ready">Начать дело</a>' +
        '<a class="link-plain" href="' + esc(url) + '#practical">Где старт</a>';
    } else if (st.kind === 'done') {
      stateTail = [when(st.t), st.took ? 'за&nbsp;' + dur(st.took) : ''].filter(Boolean).join(' · ');
      if (st.rating) {
        var stars = '';
        for (var i = 1; i <= 5; i++) stars += '<span' + (i > st.rating ? ' class="off"' : '') + '>★</span>';
        detail = 'Ваша оценка: <span class="my-stars" role="img" aria-label="' + st.rating + ' из 5">' + stars + '</span>';
      } else detail = 'Вы ещё не&nbsp;поставили оценку.';
      var nextHref = brand === 'sledami' ? ROOT + 'sledami/#cases' : '#more';
      actions = '<a class="btn" href="' + nextHref + '" data-track="account_next">Выбрать следующее дело</a>' +
        '<a class="link-plain" href="' + esc(play) + '" data-track="account_continue" data-track-quest="' + esc(c.slug) + '" data-track-state="done">' + (st.rating ? 'Открыть финал' : 'Оценить дело') + '</a>';
    }
    return '<li class="my-card" data-state="' + st.kind + '" data-case="' + esc(c.no) + '">' +
      '<a class="my-cover" href="' + esc(url) + '" tabindex="-1" aria-hidden="true"><img src="' + ROOT + 'assets/ill/' + esc(c.img) + '" width="1200" height="900" alt="" loading="lazy"></a>' +
      '<div class="my-head"><p class="my-no">Дело&nbsp;№' + esc(c.no) + (c.brand === 'sledami' ? ' · 18+' : '') + '</p>' +
      '<h2 class="my-title"><a href="' + esc(url) + '">' + esc(c.short) + '</a></h2><p class="my-where">' + esc(c.where) + '</p></div>' +
      '<div class="my-main"><p class="my-state"><span class="my-pill my-pill--' + st.kind + '">' + PILL[st.kind] + '</span>' + (stateTail ? '<span>' + stateTail + '</span>' : '') + '</p>' +
      (detail ? '<p class="my-detail">' + detail + '</p>' : '') + bar + (sub ? '<p class="my-sub">' + sub + '</p>' : '') +
      '<div class="my-actions">' + actions + '</div></div></li>';
  }

  // ---------- список: одна сетка; порядок — начатые, готовые к старту, раскрытые; внутри — свежие первыми ----------
  var ORDER = { active: 0, paused: 0, ready: 1, done: 2 };
  var mine = [];
  cases.forEach(function (c) { var st = stateOf(c); if (st) mine.push({ c: c, st: st }); });
  mine.sort(function (a, b) { return ORDER[a.st.kind] - ORDER[b.st.kind] || (b.st.t || 0) - (a.st.t || 0); });
  var out = '<ul class="my-cards">' + mine.map(function (m) { return cardHtml(m.c, m.st); }).join('') + '</ul>';
  if (mine.length) {
    list.innerHTML = out;
    list.hidden = false;
    empty.hidden = true;
    // в витрине ниже — только дела, которых ещё нет в списке
    var have = {};
    mine.forEach(function (m) { have[m.c.no] = true; });
    [].forEach.call(document.querySelectorAll('#qgrid > .qcard[data-case]'), function (li) { if (have[li.getAttribute('data-case')]) li.hidden = true; });
    var h = document.querySelector('[data-more-h]');
    if (h) h.textContent = 'Другие дела';
  }

  // ---------- «Есть код?»: дела, которые можно открыть кодом и которых нет в списке ----------
  var codeList = document.getElementById('code-list');
  if (codeList) {
    var rows = cases.filter(function (c) { return c.play && !mine.some(function (m) { return m.c.no === c.no; }); });
    codeList.innerHTML = rows.map(function (c) {
      return '<li><a href="' + ROOT + 'play/' + esc(c.play) + '/" data-track="account_code" data-track-quest="' + esc(c.slug) + '"><span>Дело&nbsp;№' + esc(c.no) + ' · ' + esc(c.short) + '</span><b>Ввести код</b></a></li>';
    }).join('');
    codeList.hidden = !rows.length;
  }

  // ---------- тема «Следами»: текущая линия в полосе, адреса и заголовок ----------
  if (brand === 'sledami') {
    [].forEach.call(document.querySelectorAll('.lines .lines-item'), function (a) {
      var href = a.getAttribute('href') || '';
      var isS = /sledami\//.test(href);
      if (isS) { a.setAttribute('aria-current', 'true'); a.setAttribute('href', ROOT + 'sledami/'); }
      else if (a.tagName === 'A') { a.removeAttribute('aria-current'); a.setAttribute('href', ROOT + '?from=sledami'); }
    });
    var my = document.querySelector('.lines .lines-my');
    if (my) my.setAttribute('href', ROOT + 'account/?brand=sledami');
    document.title = 'Мои дела | Следами';
    var tc = document.querySelector('meta[name="theme-color"]');
    if (tc) tc.setAttribute('content', '#12100E');
  }

  track('account_view', { brand: brand, items: mine.length });
})();

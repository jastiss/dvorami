/* «Мои дела» — интерфейс кабинета (docs/account.md, разделы 2, 5, 7). Сеть не знает: всё через window.DvApi (api.js).
   Вход: вход · регистрация · код из письма · забыли пароль · новый пароль · задать пароль (?set=<токен> из письма после покупки).
   Кабинет: #overview (виджеты) · #cases · #purchases · #achievements · #notes · #settings; на телефоне — нижняя панель.
   Дела этого телефона (сохранения плеера dvorami:play|code|rating:<id>) после входа предлагаем перенести в аккаунт.
   Тексты ошибок — без подсказок для перебора (team/std/security.md, п. 7). */
(function () {
  'use strict';
  var api = window.DvApi;
  var doc = document, html = doc.documentElement;
  function $(id) { return doc.getElementById(id); }
  if (!api || !$('acc-app')) return;
  // страница входа не работает во фрейме чужого сайта (кликджекинг); на боевом — ещё и заголовок frame-ancestors
  try { if (window.top !== window.self) { $('login').hidden = true; return; } } catch (e) { return; }

  var brand = html.getAttribute('data-brand') === 'sledami' ? 'sledami' : 'dvorami';
  var ROOT = '../';
  var CASES = [];
  try { CASES = JSON.parse($('cases-data').textContent) || []; } catch (e) { CASES = []; }
  var byQuest = {};
  CASES.forEach(function (c) { if (c.play) byQuest[c.play] = c; });
  var VIEWS = ['overview', 'cases', 'purchases', 'achievements', 'notes', 'settings'];
  var TITLE = { overview: 'Обзор', cases: 'Мои дела', purchases: 'Покупки и подарки', achievements: 'Достижения', notes: 'Заметки', settings: 'Настройки' };
  var BRAND_NAME = brand === 'sledami' ? 'Следами' : 'Дворами';
  var PAUSE_AFTER = 3 * 3600 * 1000;
  var S = { user: null, dash: null, filter: 'all', pending: '', resetEmail: '', invite: '', firstRoute: true, offline: false };
  var R = api.rules;

  // ---------- мелочи ----------
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function track(ev, p) { try { if (window.dvoramiTrack) window.dvoramiTrack(ev, p); } catch (e) { /* без аналитики */ } }
  function say(t) { var el = $('sr-say'); if (!el) return; el.textContent = ''; setTimeout(function () { el.textContent = t; }, 60); }
  function lget(k) { try { return window.localStorage.getItem(k); } catch (e) { return null; } }
  function lset(k, v) { try { window.localStorage.setItem(k, v); } catch (e) { /* без хранилища */ } }
  function sget(k) { try { return window.sessionStorage.getItem(k); } catch (e) { return null; } }
  function sset(k, v) { try { window.sessionStorage.setItem(k, v); } catch (e) { /* без хранилища */ } }
  function fmt(ms, opt) { try { return new Date(ms).toLocaleString('ru-RU', Object.assign({ timeZone: 'Europe/Moscow' }, opt)); } catch (e) { return new Date(ms).toLocaleString(); } }
  function dayKey(ms) { return fmt(ms, { year: 'numeric', month: 'numeric', day: 'numeric' }); }
  function when(ms) {
    if (!ms) return '';
    var t = fmt(ms, { hour: '2-digit', minute: '2-digit', hour12: false }), now = Date.now();
    if (dayKey(ms) === dayKey(now)) return 'сегодня в&nbsp;' + t;
    if (dayKey(ms) === dayKey(now - 864e5)) return 'вчера в&nbsp;' + t;
    return fmt(ms, { day: 'numeric', month: 'long' }).replace(' ', '&nbsp;');
  }
  function date(ms) { return ms ? fmt(ms, { day: 'numeric', month: 'long' }).replace(' ', '&nbsp;') : ''; }
  function dur(ms) {
    if (!ms || ms < 0) return '';
    var m = Math.round(ms / 60000);
    return m >= 60 ? Math.floor(m / 60) + '&nbsp;ч ' + (m % 60) + '&nbsp;мин' : m + '&nbsp;мин';
  }
  function plural(n, f) { var a = Math.abs(n) % 100, b = a % 10; return f[a > 10 && a < 20 ? 2 : b === 1 ? 0 : b >= 2 && b <= 4 ? 1 : 2]; }
  function rub(n) { return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, '&nbsp;') + '&nbsp;₽'; }
  function caseTitle(c) { return 'Дело&nbsp;№' + esc(c.no) + ' · ' + esc(c.short); }
  function emailMasked(e) { var p = String(e).split('@'); return p.length === 2 ? esc(p[0].slice(0, 2)) + '…@' + esc(p[1]) : esc(e); }
  function busy(form, on) {
    var b = form && form.querySelector('button[type="submit"]');
    if (!b) return;
    if (on) { b.dataset.label = b.innerHTML; b.disabled = true; b.setAttribute('aria-busy', 'true'); b.textContent = 'Секунду…'; }
    else if (b.dataset.label) { b.innerHTML = b.dataset.label; b.disabled = false; b.removeAttribute('aria-busy'); }
  }

  // ---------- тексты ошибок ----------
  var PW_WHY = {
    short: 'Пароль короче ' + R.PW_MIN + ' знаков.',
    long: 'Пароль длиннее ' + R.PW_MAX + ' знаков.',
    common: 'Такой пароль подбирают первым. Придумайте другой: например, 3–4 слова через пробел.',
    email: 'Пароль не&nbsp;должен повторять почту.',
    repeat: 'Пароль из&nbsp;одного повторяющегося знака подбирается сразу.'
  };
  function errText(e) {
    var c = e && e.code;
    if (c === 'bad_credentials') return 'Неверная почта или пароль.';
    if (c === 'rate_limited') { var m = Math.max(1, Math.ceil((e.retryAfter || 900) / 60)); return 'Слишком много попыток. Подождите ' + m + '&nbsp;' + plural(m, ['минуту', 'минуты', 'минут']) + ' или восстановите пароль.'; }
    if (c === 'weak_password') return PW_WHY[e.why] || 'Придумайте пароль подлиннее.';
    if (c === 'bad_email') return 'Проверьте почту: нужен адрес вида имя@почта.ру.';
    if (c === 'demo_only') return 'Это демо: настоящую почту здесь не&nbsp;вводите. Подойдёт любой адрес @example.com.';
    if (c === 'bad_code') return 'Код не&nbsp;подошёл. Проверьте его или запросите новый.';
    if (c === 'expired') return 'Срок кода или ссылки истёк. Запросите новый.';
    if (c === 'consent_required') return 'Отметьте согласие на&nbsp;обработку персональных данных.';
    if (c === 'network') return 'Нет связи с&nbsp;сервером. Проверьте интернет и&nbsp;попробуйте ещё раз.';
    if (c === 'unauthorized') return 'Вход истёк. Войдите снова.';
    return 'Не&nbsp;получилось. Попробуйте ещё раз или <a data-tg="channel" href="https://t.me/dvorami_quest" target="_blank" rel="noopener">напишите нам</a>.';
  }
  // e: ApiError | {code: 'local', field, local: текст} (проверка до сервера) | строка | null (убрать ошибку)
  function showErr(form, e) {
    var p = form.querySelector('.f-err');
    form.querySelectorAll('[aria-invalid]').forEach(function (x) { x.removeAttribute('aria-invalid'); });
    if (!e) { if (p) { p.hidden = true; p.innerHTML = ''; } return; }
    var msg = typeof e === 'string' ? e : e.code === 'local' ? e.local : errText(e);
    if (p) { p.innerHTML = msg; p.hidden = false; }
    var inp = typeof e === 'object' && e.field && form.elements[e.field];
    if (inp && inp.setAttribute) {
      inp.setAttribute('aria-invalid', 'true');
      if (p && p.id) inp.setAttribute('aria-describedby', ((inp.getAttribute('aria-describedby') || '').replace(p.id, '') + ' ' + p.id).trim());
      if (e.code === 'local') { try { inp.focus({ preventScroll: false }); } catch (x) { inp.focus(); } }
    }
    say(p ? p.textContent : msg.replace(/<[^>]+>|&nbsp;/g, ' '));
    if (typeof e === 'object' && e.code === 'unauthorized') toLogin();
  }

  // ---------- пароль: показать/скрыть, подсказка ----------
  doc.addEventListener('click', function (ev) {
    var eye = ev.target.closest('.pw-eye');
    if (!eye) return;
    var inp = $(eye.getAttribute('aria-controls'));
    if (!inp) return;
    var show = inp.type === 'password';
    inp.type = show ? 'text' : 'password';
    eye.setAttribute('aria-pressed', show ? 'true' : 'false');
    eye.textContent = show ? 'Скрыть' : 'Показать';
  });
  doc.addEventListener('input', function (ev) {
    var t = ev.target;
    if (t.type === 'password' || (t.closest && t.closest('.pw'))) {
      var hint = doc.querySelector('[data-pw-hint="' + t.id + '"]');
      if (!hint) return;
      if (!hint.dataset.base) hint.dataset.base = hint.innerHTML;
      var n = Array.from ? Array.from(t.value).length : t.value.length;
      if (!n) { hint.innerHTML = hint.dataset.base; hint.classList.remove('is-ok'); return; }
      var left = R.PW_MIN - n;
      hint.innerHTML = left > 0 ? 'Ещё ' + left + '&nbsp;' + plural(left, ['знак', 'знака', 'знаков']) + '.' : 'Длина подходит.';
      hint.classList.toggle('is-ok', left <= 0);
    }
  });

  // =====================================================================
  // Вход
  // =====================================================================
  function showPanel(name, noFocus) {
    $('login').hidden = false;
    $('acc-app').hidden = true;
    doc.querySelectorAll('.auth-panel').forEach(function (p) { p.hidden = p.getAttribute('data-panel') !== name; });
    doc.querySelectorAll('[data-fill="pending-email"]').forEach(function (b) { b.textContent = S.pending; });
    doc.querySelectorAll('[data-fill="reset-email"]').forEach(function (b) { b.textContent = S.resetEmail; });
    $('login').setAttribute('aria-labelledby', 'auth-h-' + name);
    doc.title = ({ login: 'Вход', register: 'Создать аккаунт', verify: 'Проверьте почту', forgot: 'Восстановить доступ', reset: 'Новый пароль', setpw: 'Задайте пароль' }[name] || 'Вход') + ' — Мои дела | ' + BRAND_NAME;
    if (!noFocus) { var h = $('auth-h-' + name); if (h) h.focus({ preventScroll: true }); }
    var first = doc.querySelector('.auth-panel[data-panel="' + name + '"] input:not([hidden])');
    if (!noFocus && first && name !== 'login') setTimeout(function () { try { first.focus({ preventScroll: true }); } catch (e) { first.focus(); } }, 30);
  }
  function toLogin(msg) {
    S.user = null; S.dash = null;
    showPanel('login', true);
    if (msg) { var f = $('f-login'); showErr(f, msg); }
  }
  doc.addEventListener('click', function (ev) {
    var go = ev.target.closest('[data-go]');
    if (go) {
      ev.preventDefault();
      var to = go.getAttribute('data-go');
      var from = doc.querySelector('.auth-panel:not([hidden]) input[type="email"]');
      if (from && from.value) doc.querySelectorAll('.auth-panel[data-panel="' + to + '"] input[type="email"]').forEach(function (i) { if (!i.value) i.value = from.value; });
      showPanel(to);
      if (to === 'register') track('signup_start', { brand: brand });
      if (to === 'forgot') track('reset_start', { brand: brand });
    }
  });

  function bindForm(id, fn) {
    var f = $(id);
    if (!f) return;
    f.addEventListener('submit', function (ev) {
      ev.preventDefault();
      if (f.dataset.busy) return;
      f.dataset.busy = '1'; busy(f, true); showErr(f, null);
      Promise.resolve().then(function () { return fn(f); })
        .catch(function (e) { showErr(f, e); })
        .then(function () { delete f.dataset.busy; busy(f, false); });
    });
  }
  function need(f, name, test, msg) {
    var el = f.elements[name];
    var v = el.type === 'checkbox' ? el.checked : String(el.value || '').trim();
    if (test(v)) return v;
    throw { code: 'local', field: name, local: msg };
  }
  function emailOf(f, name) { return need(f, name || 'email', function (v) { return R.emailOk(R.normEmail(v)); }, v0(f, name || 'email') ? errText({ code: 'bad_email' }) : 'Впишите почту.'); }
  function v0(f, n) { return String(f.elements[n].value || '').trim(); }
  function pwOf(f, email, name) {
    var v = f.elements[name || 'password'].value;
    if (!v) throw { code: 'local', field: name || 'password', local: 'Впишите пароль.' };
    var why = R.passwordIssue(v, email);
    if (why) throw { code: 'local', field: name || 'password', local: PW_WHY[why] };
    return v;
  }

  bindForm('f-login', function (f) {
    var email = emailOf(f);
    var pw = f.elements.password.value;
    if (!pw) throw { code: 'local', field: 'password', local: 'Впишите пароль.' };
    track('login_start', { brand: brand });
    return api.login(email, pw).then(function (r) {
      track('login_ok', { how: 'password', brand: brand });
      f.reset();
      return enter(r.user, true);
    }, function (e) { track('login_fail', { why: e.code }); f.elements.password.value = ''; throw e; });
  });
  bindForm('f-register', function (f) {
    var email = emailOf(f), pw = pwOf(f, email);
    if (!f.elements.consent.checked) throw { code: 'local', field: 'consent', local: errText({ code: 'consent_required' }) };
    return api.register(email, pw, true, v0(f, 'code')).then(function () {
      S.pending = R.normEmail(email);
      f.elements.password.value = '';
      showPanel('verify');
      say('Код отправлен на почту.');
    });
  });
  bindForm('f-verify', function (f) {
    var code = need(f, 'code', function (v) { return /^\d{6}$/.test(v.replace(/\s/g, '')); }, 'Впишите шесть цифр из&nbsp;письма.');
    return api.verify(S.pending, code.replace(/\s/g, '')).then(function (r) {
      track('signup_ok', { brand: brand });
      f.reset();
      return enter(r.user, true);
    });
  });
  bindForm('f-forgot', function (f) {
    var email = emailOf(f);
    return api.forgot(email).then(function () { S.resetEmail = R.normEmail(email); showPanel('reset'); });
  });
  bindForm('f-reset', function (f) {
    var code = need(f, 'code', function (v) { return /^\d{6}$/.test(v.replace(/\s/g, '')); }, 'Впишите шесть цифр из&nbsp;письма.');
    var pw = pwOf(f, S.resetEmail);
    return api.reset(S.resetEmail, code.replace(/\s/g, ''), pw).then(function (r) {
      track('reset_ok', { brand: brand });
      f.reset();
      return enter(r.user, true, 'Пароль изменён. На&nbsp;других устройствах вход закрыт.');
    });
  });
  bindForm('f-setpw', function (f) {
    var pw = pwOf(f, S.inviteEmail || '');
    if (!f.elements.consent.checked) throw { code: 'local', field: 'consent', local: errText({ code: 'consent_required' }) };
    return api.setPassword(S.invite, pw, true).then(function (r) {
      track('login_ok', { how: 'set', brand: brand });
      try { history.replaceState(null, '', location.pathname + (brand === 'sledami' ? '?brand=sledami' : '') + '#overview'); } catch (e) { /* адрес как есть */ }
      f.reset();
      return enter(r.user, true, 'Пароль сохранён. Дело уже в&nbsp;«Моих делах».');
    });
  });
  doc.addEventListener('click', function (ev) {
    var b = ev.target.closest('[data-act="resend"]');
    if (!b) return;
    var email = b.getAttribute('data-purpose') === 'reset' ? S.resetEmail : S.pending;
    if (b.disabled) return;
    b.disabled = true;
    api.resend(email, b.getAttribute('data-purpose')).then(function () {
      var left = 60, base = b.textContent;
      say('Письмо отправлено ещё раз.');
      var t = setInterval(function () {
        left--; b.textContent = left > 0 ? 'Ещё раз — через 0:' + String(left).padStart(2, '0') : base;
        if (left <= 0) { clearInterval(t); b.disabled = false; }
      }, 1000);
    }, function () { b.disabled = false; });
  });

  // ---------- плашка «Демо» ----------
  if (api.mode === 'mock' && api.demo) {
    $('acc-demo').hidden = false;
    doc.addEventListener('click', function (ev) {
      var a = ev.target.closest('[data-act="demo-fill"], [data-act="demo-reset"]');
      if (!a) return;
      if (a.getAttribute('data-act') === 'demo-reset') {
        api.resetDemo().then(function () { try { window.localStorage.removeItem(askedKey()); } catch (e) { /* нет */ } location.hash = ''; location.reload(); });
        return;
      }
      if (S.user) { location.hash = '#overview'; return; }
      showPanel('login', true);
      var f = $('f-login');
      f.elements.email.value = api.demo.email;
      f.elements.password.value = api.demo.password;
      f.querySelector('.auth-go').focus();
      say('Демо-вход подставлен. Нажмите «Войти».');
    });
  }

  // =====================================================================
  // Кабинет
  // =====================================================================
  function enter(user, fromLogin, msg) {
    S.user = user;
    $('nav-email').textContent = user.email;
    $('login').hidden = true;
    $('acc-app').hidden = false;
    if (fromLogin && VIEWS.indexOf(location.hash.slice(1)) < 0) { try { history.replaceState(null, '', '#overview'); } catch (e) { location.hash = '#overview'; } }
    return loadDash().then(function () { route(!fromLogin); if (msg) say(msg.replace(/&nbsp;/g, ' ')); });
  }
  function loadDash() {
    return api.dashboard().then(function (d) {
      S.dash = d; S.offline = false;
      sset('dvorami:acct:dash', JSON.stringify(d));
      $('acc-net').hidden = true;
      return d;
    }, function (e) {
      if (e.code === 'unauthorized') { toLogin(e); throw e; }
      var cached = null;
      try { cached = JSON.parse(sget('dvorami:acct:dash') || 'null'); } catch (x) { cached = null; }
      S.dash = cached || { cases: [], achievements: [], note: null, notes_total: 0, orders: 0, gifts_waiting: 0, settings: {} };
      S.offline = true;
      $('acc-net').hidden = false;
      return S.dash;
    });
  }

  // ---------- состояние дела (сводка progress с сервера → плашка, строка, кнопка) ----------
  function kindOf(c) {
    var p = c.progress;
    if (!p) return 'ready';
    if (p.phase === 'done') return 'done';
    return p.paused || Date.now() - (p.last || 0) > PAUSE_AFTER ? 'paused' : 'active';
  }
  function view(c) {
    var meta = byQuest[c.quest];
    if (!meta) return null;
    var k = kindOf(c), p = c.progress || {}, total = meta.points || 0;
    var n = p.point == null ? null : p.point, passed = 0, next = n;
    if (n != null) { passed = p.point_done ? n : n - 1; next = p.point_done ? n + 1 : n; if (total) passed = Math.min(passed, total); }
    if (k === 'done') passed = total;
    var finale = (k === 'active' || k === 'paused') && n != null && total && next > total;
    var updated = meta.version && p.version != null && String(p.version) !== String(meta.version) && k !== 'done';
    return { c: c, meta: meta, kind: k, n: n, next: next, passed: passed, total: total, finale: finale, updated: updated, last: p.last || c.added_at || 0 };
  }
  function visibleCases() {
    var showS = !S.dash || !S.dash.settings || S.dash.settings.show_sledami !== false;
    return (S.dash ? S.dash.cases : []).map(view).filter(function (v) { return v && (showS || brand !== 'dvorami' || v.meta.brand !== 'sledami'); });
  }
  var ORDER = { active: 0, paused: 0, ready: 1, done: 2 };
  function sorted(list) { return list.slice().sort(function (a, b) { return ORDER[a.kind] - ORDER[b.kind] || (b.last || 0) - (a.last || 0); }); }
  var PILL = { active: 'Идёт', paused: 'На паузе', ready: 'Готово к старту', done: 'Раскрыто' };
  function lineOf(v) {
    if (v.kind === 'ready') return 'Код принят. Начать можно в&nbsp;любой день, когда придёте к&nbsp;старту.';
    if (v.kind === 'done') {
      if (v.c.rating) { var st = ''; for (var i = 1; i <= 5; i++) st += '<span' + (i > v.c.rating ? ' class="off"' : '') + '>★</span>'; return 'Ваша оценка: <span class="my-stars" role="img" aria-label="' + v.c.rating + ' из 5">' + st + '</span>'; }
      return 'Вы ещё не&nbsp;поставили оценку.';
    }
    if (v.n == null) return v.kind === 'paused' ? 'Остановились на&nbsp;вступлении.' : 'Вы&nbsp;во&nbsp;вступлении.';
    if (v.finale) return 'Все точки пройдены, остался финал.';
    if (v.c.progress.point_done) return 'Точка&nbsp;' + v.n + ' пройдена, дальше&nbsp;— точка&nbsp;' + v.next + '.';
    return (v.kind === 'paused' ? 'Остановились на&nbsp;точке&nbsp;' : 'Сейчас&nbsp;— точка&nbsp;') + v.n + '.';
  }
  function tailOf(v) {
    var p = v.c.progress || {};
    if (v.kind === 'paused') return when(p.last);
    if (v.kind === 'done') return [date(p.t_end), p.t_end && p.t_start ? 'за&nbsp;' + dur(p.t_end - p.t_start) : ''].filter(Boolean).join(' · ');
    return '';
  }
  function bar(v) {
    if (!v.total || (v.kind !== 'active' && v.kind !== 'paused') || v.n == null) return '';
    return '<div class="my-bar" role="img" aria-label="Пройдено точек: ' + v.passed + ' из ' + v.total + '"><i style="--w:' + Math.round(100 * v.passed / v.total) + '%"></i></div>' +
      '<p class="my-count">Пройдено ' + v.passed + ' из&nbsp;' + v.total + ' ' + plural(v.total, ['точки', 'точек', 'точек']) + '</p>';
  }
  function mainBtn(v, cls) {
    var play = ROOT + 'play/' + v.meta.play + '/';
    var t = v.kind === 'ready' ? 'Начать дело' : v.kind === 'done' ? 'Выбрать следующее дело'
      : v.finale ? 'К&nbsp;финалу' : v.kind === 'paused' && v.n != null ? 'Продолжить с&nbsp;точки&nbsp;' + v.next : 'Продолжить';
    var href = v.kind === 'done' ? (brand === 'sledami' ? ROOT + 'sledami/#cases' : ROOT + 'moscow/') : play;
    return '<a class="btn' + (cls ? ' ' + cls : '') + '" href="' + esc(href) + '" data-track="' + (v.kind === 'done' ? 'account_next' : 'account_continue') + '" data-track-quest="' + esc(v.meta.slug) + '" data-track-state="' + v.kind + '">' + t + '</a>';
  }
  function cover(v, big) {
    var adultHidden = brand === 'dvorami' && v.meta.brand === 'sledami';
    if (adultHidden) return '<span class="my-cover my-cover--18" aria-hidden="true">18+</span>';
    return '<a class="my-cover' + (big ? ' my-cover--big' : '') + '" href="' + esc(ROOT + v.meta.url) + '" tabindex="-1" aria-hidden="true"><img src="' + ROOT + 'assets/ill/' + esc(v.meta.img) + '" width="1200" height="900" alt="" loading="lazy"></a>';
  }
  function caseCard(v) {
    var tail = tailOf(v), second = '';
    if (v.kind === 'ready') second = '<a class="link-plain" href="' + esc(ROOT + v.meta.url) + '#practical">Где старт</a>';
    else if (v.kind === 'done') second = '<a class="link-plain" href="' + esc(ROOT + 'play/' + v.meta.play + '/') + '" data-track="account_continue" data-track-quest="' + esc(v.meta.slug) + '" data-track-state="done">' + (v.c.rating ? 'Открыть финал' : 'Оценить дело') + '</a>';
    var notes = '<a class="link-plain my-notes" href="#notes" data-note-quest="' + esc(v.c.quest) + '">Заметки' + (v.c.notes ? ' (' + v.c.notes + ')' : '') + '</a>';
    return '<li class="my-card" data-state="' + v.kind + '" data-case="' + esc(v.meta.no) + '">' + cover(v) +
      '<div class="my-head"><p class="my-no">Дело&nbsp;№' + esc(v.meta.no) + (v.meta.brand === 'sledami' ? ' · 18+' : '') + (v.c.code_tail ? ' · <span class="my-tail">код …' + esc(v.c.code_tail) + '</span>' : '') + '</p>' +
      '<h2 class="my-title"><a href="' + esc(ROOT + v.meta.url) + '">' + esc(v.meta.short) + '</a></h2><p class="my-where">' + esc(v.meta.where) + '</p></div>' +
      '<div class="my-main"><p class="my-state"><span class="my-pill my-pill--' + v.kind + '">' + PILL[v.kind] + '</span>' + (tail ? '<span>' + tail + '</span>' : '') + '</p>' +
      '<p class="my-detail">' + lineOf(v) + '</p>' + bar(v) +
      (v.updated ? '<p class="my-sub">Дело обновилось. Откройте его и&nbsp;выберите: доиграть начатое или начать заново.</p>' : '') +
      '<div class="my-actions">' + mainBtn(v) + second + notes + '</div></div></li>';
  }

  // ---------- Обзор: виджеты ----------
  function localItems() {
    var out = [];
    CASES.forEach(function (c) {
      if (!c.play) return;
      var s = null, raw = lget('dvorami:play:' + c.play);
      try { s = JSON.parse(raw || 'null'); } catch (e) { s = null; }
      if (!s || s.quest !== c.play || s.v !== 1 || !s.phase || s.phase === 'idle') s = null;
      var code = lget('dvorami:code:' + c.play);
      var r = parseInt(lget('dvorami:rating:' + c.play), 10);
      if (s || code) out.push({ quest: c.play, code: code || '', state: s, rating: r >= 1 && r <= 5 ? r : 0 });
    });
    return out;
  }
  function askedKey() { return 'dvorami:acct:asked:' + (S.user ? S.user.id : ''); }
  function importOffer() {
    if (!S.user || S.offline) return [];
    var have = {};
    (S.dash.cases || []).forEach(function (c) { have[c.quest] = 1; });
    var asked = (lget(askedKey()) || '').split(',');
    return localItems().filter(function (it) { return !have[it.quest] && asked.indexOf(it.quest) < 0; });
  }
  function localLine(it) {
    var m = byQuest[it.quest], s = it.state;
    var st = !s ? 'код принят' : s.phase === 'done' ? 'раскрыто' : s.phase === 'intro' ? 'вступление' : 'точка ' + ((s.p | 0) + 1);
    return '<li><b>' + esc(m.short) + '</b> · ' + st + (it.code ? '' : ' · <span class="w-muted">без кода&nbsp;— останется на&nbsp;этом телефоне</span>') + '</li>';
  }
  function wImport(items) {
    if (!items.length) return '';
    return '<section class="w-card w-import" aria-labelledby="w-import-h"><h2 class="w-h" id="w-import-h">На&nbsp;этом телефоне ' + items.length + '&nbsp;' + plural(items.length, ['дело', 'дела', 'дел']) + ', которых нет в&nbsp;аккаунте</h2>' +
      '<ul class="w-list">' + items.map(localLine).join('') + '</ul><p>Добавить их&nbsp;в&nbsp;аккаунт&nbsp;— и&nbsp;продолжать с&nbsp;любого телефона?</p>' +
      '<div class="w-actions"><button type="button" class="btn" data-act="import">Добавить</button><button type="button" class="link-plain" data-act="import-skip">Не&nbsp;сейчас</button></div></section>';
  }
  function wContinue(list) {
    var going = list.filter(function (v) { return v.kind === 'active' || v.kind === 'paused'; });
    var v = going[0] || list.filter(function (x) { return x.kind === 'ready'; })[0];
    if (!v) {
      var done = list.filter(function (x) { return x.kind === 'done'; }).length;
      return '<section class="w-card w-continue w-continue--empty" aria-labelledby="w-cont-h"><p class="w-kicker">' + (done ? 'Что дальше' : 'С&nbsp;чего начать') + '</p>' +
        '<h2 class="w-h" id="w-cont-h">' + (done ? 'Все дела раскрыты&nbsp;— выберите следующее' : 'Выберите первое дело') + '</h2>' +
        '<p>Купленное дело появится здесь само: код придёт на&nbsp;почту и&nbsp;привяжется к&nbsp;аккаунту.</p>' +
        '<div class="w-actions"><a class="btn" href="' + (brand === 'sledami' ? ROOT + 'sledami/#cases' : ROOT + 'moscow/') + '" data-track="account_next">Выбрать дело</a><button type="button" class="link-plain" data-act="focus-code">У&nbsp;меня есть код</button></div></section>';
    }
    var tail = tailOf(v);
    return '<section class="w-card w-continue" data-state="' + v.kind + '" aria-labelledby="w-cont-h">' + cover(v, true) +
      '<div class="w-continue-body"><p class="w-kicker">' + (v.kind === 'ready' ? 'Ждёт старта' : 'Продолжить') + '</p>' +
      '<h2 class="w-h" id="w-cont-h">' + caseTitle(v.meta) + '</h2><p class="my-where">' + esc(v.meta.where) + '</p>' +
      '<p class="my-state"><span class="my-pill my-pill--' + v.kind + '">' + PILL[v.kind] + '</span>' + (tail ? '<span>' + tail + '</span>' : '') + '</p>' +
      '<p class="my-detail">' + lineOf(v) + '</p>' + bar(v) +
      '<div class="w-actions">' + mainBtn(v, 'btn--lg') + (going.length > 1 ? '<a class="link-plain" href="#cases">Ещё ' + (going.length - 1) + ' ' + plural(going.length - 1, ['начатое', 'начатых', 'начатых']) + '</a>' : '') + '</div></div></section>';
  }
  function wStats(list) {
    var g = 0, r = 0, d = 0, pts = 0;
    list.forEach(function (v) { if (v.kind === 'done') d++; else if (v.kind === 'ready') r++; else g++; pts += v.passed || 0; });
    function cell(n, t, f) { return '<li><a href="#cases" data-filter-go="' + f + '"><b>' + n + '</b><span>' + t + '</span></a></li>'; }
    return '<section class="w-card w-stats" aria-labelledby="w-stats-h"><h2 class="w-h" id="w-stats-h">Мои дела в&nbsp;цифрах</h2><ul class="stats">' +
      cell(g, plural(g, ['идёт', 'идут', 'идут']), 'going') + cell(r, 'ждут старта', 'ready') + cell(d, plural(d, ['раскрыто', 'раскрыто', 'раскрыто']), 'done') +
      '<li><span class="stats-plain"><b>' + pts + '</b><span>' + plural(pts, ['точка пройдена', 'точки пройдено', 'точек пройдено']) + '</span></span></li></ul></section>';
  }
  function badge(a, small) {
    return '<li class="badge' + (a.at ? ' is-got' : '') + (small ? ' badge--sm' : '') + '"><span class="badge-ico" aria-hidden="true"><svg focusable="false"><use href="#ai-seal"/></svg></span>' +
      '<span class="badge-t"><b>' + esc(a.title) + '</b><span>' + (a.at ? 'получено ' + date(a.at) : esc(a.how)) + '</span></span>' +
      '<span class="visually-hidden">' + (a.at ? ' — получено' : ' — ещё не получено') + '</span></li>';
  }
  function wAch() {
    var all = S.dash.achievements || [], got = all.filter(function (a) { return a.at; }).sort(function (a, b) { return b.at - a.at; });
    var show = got.slice(0, 3);
    if (show.length < 3) show = show.concat(all.filter(function (a) { return !a.at; }).slice(0, 3 - show.length));
    return '<section class="w-card w-ach" aria-labelledby="w-ach-h"><h2 class="w-h" id="w-ach-h">Достижения <span class="w-count">' + got.length + ' из&nbsp;' + all.length + '</span></h2>' +
      '<ul class="badges badges--row">' + show.map(function (a) { return badge(a, true); }).join('') + '</ul><a class="link-plain w-more" href="#achievements">Все достижения</a></section>';
  }
  function wCode() {
    return '<section class="w-card w-code" aria-labelledby="w-code-h"><h2 class="w-h" id="w-code-h" tabindex="-1">Есть код из&nbsp;письма или подарка?</h2>' +
      '<form class="code-form" id="f-code" novalidate><div class="fld"><label for="cd-code">Код дела</label><input id="cd-code" name="code" type="text" autocomplete="off" autocapitalize="characters" spellcheck="false" maxlength="20" required></div>' +
      '<button class="btn btn--ghost" type="submit">Добавить</button><p class="f-err" id="cd-err" hidden></p></form>' +
      '<p class="w-muted">Код потерялся? Напишите нам в&nbsp;<a data-tg="channel" href="https://t.me/dvorami_quest" target="_blank" rel="noopener">Telegram</a>&nbsp;— найдём.</p></section>';
  }
  function wNotes() {
    var n = S.dash.note, m = n && byQuest[n.quest];
    return '<section class="w-card w-notes" aria-labelledby="w-notes-h"><h2 class="w-h" id="w-notes-h">Заметки</h2>' +
      (n && m ? '<blockquote class="w-quote"><p>' + esc(n.text) + '</p><footer>' + esc(m.short) + (n.point ? ', точка&nbsp;' + esc(n.point) : '') + ' · ' + date(n.at) + '</footer></blockquote>'
        : '<p class="w-muted">Пишите заметки по&nbsp;ходу дела в&nbsp;плеере или здесь&nbsp;— они будут на&nbsp;любом телефоне.</p>') +
      '<a class="link-plain w-more" href="#notes">' + (S.dash.notes_total ? 'Все заметки (' + S.dash.notes_total + ')' : 'Написать заметку') + '</a></section>';
  }
  function wGift() {
    var w = S.dash.gifts_waiting || 0;
    return '<section class="w-card w-gift" aria-labelledby="w-gift-h"><svg class="w-ico" aria-hidden="true" focusable="false"><use href="#ai-gift"/></svg><h2 class="w-h" id="w-gift-h">Подарить дело</h2>' +
      '<p>' + (w ? 'Ваш подарок ещё не&nbsp;открыт&nbsp;— можно отправить ссылку ещё раз.' : 'Код и&nbsp;открытка придут вам на&nbsp;почту&nbsp;— отправите, когда захотите.') + '</p>' +
      '<a class="link-plain w-more" href="#purchases">' + (w ? 'Мои подарки' : 'Как подарить') + '</a></section>';
  }
  function wNext(list) {
    var have = {};
    list.forEach(function (v) { have[v.meta.no] = 1; });
    var pick = CASES.filter(function (c) { return !have[c.no] && (brand === 'sledami' ? c.brand === 'sledami' : c.brand !== 'sledami'); })
      .sort(function (a, b) { return (a.status === 'soon' ? 0 : 1) - (b.status === 'soon' ? 0 : 1) || a.no - b.no; }).slice(0, 2);
    if (!pick.length) return '';
    return '<section class="w-card w-next" aria-labelledby="w-next-h"><h2 class="w-h" id="w-next-h">Следующее дело</h2><ul class="w-next-list">' +
      pick.map(function (c) {
        return '<li><a href="' + esc(ROOT + c.url) + '" data-track="account_next" data-track-quest="' + esc(c.slug) + '"><img src="' + ROOT + 'assets/ill/' + esc(c.img) + '" width="1200" height="900" alt="" loading="lazy">' +
          '<span><b>' + caseTitle(c) + '</b><span>' + esc(c.where) + ' · ' + (c.status === 'soon' ? 'скоро в&nbsp;продаже' : 'в&nbsp;разработке') + '</span></span></a></li>';
      }).join('') + '</ul></section>';
  }
  function renderOverview() {
    var list = sorted(visibleCases());
    var going = list.filter(function (v) { return v.kind === 'active' || v.kind === 'paused'; }).length;
    $('ov-sub').innerHTML = esc(S.user.email) + ' · ' + (list.length ? list.length + '&nbsp;' + plural(list.length, ['дело', 'дела', 'дел']) + (going ? ', ' + going + '&nbsp;' + plural(going, ['идёт', 'идут', 'идут']) : '') : 'дел пока нет');
    var box = $('ov-widgets');
    box.innerHTML = wImport(importOffer()) + wContinue(list) + wStats(list) + wAch() + wCode() + wNotes() + wGift() + wNext(list);
    box.removeAttribute('aria-busy');
    bindCode();
  }
  function bindCode() {
    bindFormEl($('f-code'), function (f) {
      var code = need(f, 'code', function (v) { return v.length >= 4; }, 'Впишите код из&nbsp;письма.');
      return api.addCode(code).then(function (r) {
        track('account_code', { quest: r.quest });
        return loadDash().then(function () { renderOverview(); var m = byQuest[r.quest]; say('Дело добавлено' + (m ? ': ' + m.short : '') + '.'); });
      });
    });
  }
  function bindFormEl(f, fn) {
    if (!f || f.dataset.bound) return;
    f.dataset.bound = '1';
    f.addEventListener('submit', function (ev) {
      ev.preventDefault();
      if (f.dataset.busy) return;
      f.dataset.busy = '1'; busy(f, true); showErr(f, null);
      Promise.resolve().then(function () { return fn(f); }).catch(function (e) { showErr(f, e); })
        .then(function () { delete f.dataset.busy; busy(f, false); });
    });
  }
  doc.addEventListener('click', function (ev) {
    var b = ev.target.closest('[data-act="import"], [data-act="import-skip"]');
    if (!b) return;
    var items = importOffer();
    var asked = (lget(askedKey()) || '').split(',').filter(Boolean).concat(items.map(function (i) { return i.quest; }));
    lset(askedKey(), asked.join(','));
    if (b.getAttribute('data-act') === 'import-skip') { renderOverview(); say('Хорошо, дела остаются на этом телефоне.'); return; }
    b.disabled = true; b.textContent = 'Добавляем…';
    $('ov-widgets').setAttribute('aria-busy', 'true');
    api.importLocal(items).then(function (r) {
      track('import_ok', { added: r.added });
      return loadDash().then(function () {
        renderOverview();
        say(r.added ? 'Добавлено: ' + r.added + '.' + (r.skipped ? ' Без кода остались на телефоне: ' + r.skipped + '.' : '') : 'Дела уже были в аккаунте.');
      });
    }, function (e) { $('ov-widgets').removeAttribute('aria-busy'); b.disabled = false; b.textContent = 'Добавить'; say(errText(e).replace(/<[^>]+>|&nbsp;/g, ' ')); });
  });
  doc.addEventListener('click', function (ev) {
    if (ev.target.closest('[data-act="focus-code"]')) { var ci = $('cd-code'); if (ci) { ci.scrollIntoView({ block: 'center' }); ci.focus({ preventScroll: true }); } return; }
    var f = ev.target.closest('[data-filter-go]');
    if (f) S.filter = f.getAttribute('data-filter-go');
    var n = ev.target.closest('[data-note-quest]');
    if (n) S.noteQuest = n.getAttribute('data-note-quest');
  });

  // ---------- Мои дела ----------
  function renderCases() {
    var list = sorted(visibleCases());
    var f = S.filter;
    doc.querySelectorAll('#cases-filter .chip').forEach(function (c) { c.setAttribute('aria-pressed', c.getAttribute('data-filter') === f ? 'true' : 'false'); });
    var show = list.filter(function (v) { return f === 'all' || (f === 'going' ? v.kind === 'active' || v.kind === 'paused' : v.kind === f); });
    $('cases-list').innerHTML = show.map(caseCard).join('');
    var empty = $('cases-empty');
    empty.hidden = !!show.length;
    if (!show.length) empty.innerHTML = list.length ? 'Таких дел нет. <button type="button" class="link-plain" data-filter="all">Показать все</button>'
      : 'Дел пока нет. <a href="' + (brand === 'sledami' ? ROOT + 'sledami/#cases' : ROOT + 'moscow/') + '">Выбрать дело</a> или <a href="#overview">добавить код</a>.';
  }
  doc.addEventListener('click', function (ev) {
    var c = ev.target.closest('#cases [data-filter]');
    if (!c) return;
    S.filter = c.getAttribute('data-filter');
    renderCases();
    say('Показаны: ' + c.textContent.trim().toLowerCase() + '.');
  });

  // ---------- Покупки ----------
  function renderPurchases() {
    var ul = $('orders-list');
    ul.innerHTML = '<li class="view-loading">Загружаем…</li>';
    ul.setAttribute('aria-busy', 'true');
    api.orders().then(function (list) {
      ul.removeAttribute('aria-busy');
      if (!list.length) { ul.innerHTML = '<li class="w-card orders-empty"><p>Покупок пока нет. Дело покупается на&nbsp;его странице: код придёт на&nbsp;почту и&nbsp;сразу появится здесь.</p></li>'; return; }
      ul.innerHTML = list.map(function (o) {
        var m = byQuest[o.quest] || {};
        var gift = o.kind === 'gift';
        var st = o.status === 'refunded' ? 'деньги возвращены' : 'оплачено';
        var giftLine = gift ? '<p class="ord-gift">Подарок' + (o.to ? ' для&nbsp;' + esc(o.to) : '') + ' · ' + (o.opened ? 'открыт ' + date(o.opened) : '<b>код ещё не&nbsp;открыт</b>') + '</p>' : '<p class="ord-gift">Для себя</p>';
        var act = gift && !o.opened && o.status === 'paid' ? '<div class="w-actions"><button type="button" class="btn btn--ghost" data-act="gift-resend" data-id="' + esc(o.id) + '">Отправить подарок ещё раз</button><a class="link-plain" data-tg="channel" href="https://t.me/dvorami_quest" target="_blank" rel="noopener">Вернуть деньги</a></div>' : '';
        return '<li class="w-card ord">' + (m.img ? '<img class="ord-img" src="' + ROOT + 'assets/ill/' + esc(m.img) + '" width="1200" height="900" alt="" loading="lazy">' : '') +
          '<div class="ord-body"><h2 class="w-h">' + (m.no ? caseTitle(m) : esc(o.quest)) + '</h2>' +
          '<p class="ord-meta">' + date(o.at) + ' · ' + rub(o.amount) + ' · ' + st + (o.tail ? ' · код …' + esc(o.tail) : '') + '</p>' + giftLine + act + '</div></li>';
      }).join('');
    }, function (e) { ul.removeAttribute('aria-busy'); ul.innerHTML = '<li class="w-card"><p>' + errText(e) + '</p></li>'; });
  }
  doc.addEventListener('click', function (ev) {
    var b = ev.target.closest('[data-act="gift-resend"]');
    if (!b) return;
    b.disabled = true;
    api.giftResend(b.getAttribute('data-id')).then(function () {
      b.textContent = api.mode === 'mock' ? 'Отправлено (в демо письма не уходят)' : 'Отправлено';
      say('Подарок отправлен ещё раз.');
    }, function (e) { b.disabled = false; say(errText(e).replace(/<[^>]+>|&nbsp;/g, ' ')); });
  });

  // ---------- Достижения ----------
  function renderAch() {
    var all = S.dash.achievements || [];
    var got = all.filter(function (a) { return a.at; }).length;
    $('ach-sub').innerHTML = got ? 'Получено ' + got + ' из&nbsp;' + all.length + '. Остальные&nbsp;— с&nbsp;условием под значком.' : 'Раскройте первое дело&nbsp;— и&nbsp;здесь появится первый значок.';
    $('ach-list').innerHTML = all.slice().sort(function (a, b) { return (b.at ? 1 : 0) - (a.at ? 1 : 0); }).map(function (a) { return badge(a); }).join('');
  }

  // ---------- Заметки ----------
  function renderNotes() {
    var mine = visibleCases();
    var sel = $('nt-case');
    sel.innerHTML = mine.map(function (v) { return '<option value="' + esc(v.c.quest) + '">' + esc(v.meta.short) + '</option>'; }).join('');
    if (S.noteQuest) sel.value = S.noteQuest;
    $('f-note').hidden = !mine.length;
    var box = $('notes-list');
    box.innerHTML = '<p class="view-loading">Загружаем…</p>';
    box.setAttribute('aria-busy', 'true');
    api.notes().then(function (list) {
      box.removeAttribute('aria-busy');
      if (!list.length) { box.innerHTML = '<p class="view-empty">' + (mine.length ? 'Заметок пока нет.' : 'Заметки появятся, когда в&nbsp;аккаунте будет дело.') + '</p>'; return; }
      var by = {};
      list.forEach(function (n) { (by[n.quest] = by[n.quest] || []).push(n); });
      box.innerHTML = Object.keys(by).map(function (q) {
        var m = byQuest[q] || { short: q };
        return '<section class="notes-case" aria-labelledby="nh-' + esc(q) + '"><h2 class="w-h" id="nh-' + esc(q) + '">' + (m.no ? caseTitle(m) : esc(m.short)) + '</h2><ul class="notes">' +
          by[q].map(function (n) {
            return '<li class="note" data-id="' + esc(n.id) + '"><p class="note-t">' + esc(n.text) + '</p><p class="note-meta">' + (n.point ? 'Точка&nbsp;' + esc(n.point) + ' · ' : '') + date(n.at) + (n.from === 'player' ? ' · из&nbsp;плеера' : '') + '</p>' +
              '<div class="note-act"><button type="button" class="link-plain" data-act="note-edit">Изменить</button><button type="button" class="link-plain" data-act="note-del">Удалить</button></div></li>';
          }).join('') + '</ul></section>';
      }).join('');
    }, function (e) { box.removeAttribute('aria-busy'); box.innerHTML = '<p class="view-empty">' + errText(e) + '</p>'; });
  }
  bindFormEl($('f-note'), function (f) {
    var text = need(f, 'text', function (v) { return v.length > 0; }, 'Впишите текст заметки.');
    return api.addNote(f.elements.quest.value, text, null).then(function () {
      track('note_add', { quest: f.elements.quest.value });
      f.elements.text.value = '';
      S.noteQuest = f.elements.quest.value;
      renderNotes(); refreshDashQuiet();
      say('Заметка сохранена.');
    });
  });
  doc.addEventListener('click', function (ev) {
    var b = ev.target.closest('[data-act="note-edit"], [data-act="note-del"], [data-act="note-save"], [data-act="note-cancel"]');
    if (!b) return;
    var li = b.closest('.note'), id = li && li.getAttribute('data-id'), act = b.getAttribute('data-act');
    if (act === 'note-del') {
      b.disabled = true;
      api.deleteNote(id).then(function () { renderNotes(); refreshDashQuiet(); say('Заметка удалена.'); });
    } else if (act === 'note-edit') {
      var t = li.querySelector('.note-t').textContent;
      li.querySelector('.note-t').outerHTML = '<label class="visually-hidden" for="ne-' + esc(id) + '">Текст заметки</label><textarea class="note-ed" id="ne-' + esc(id) + '" rows="3" maxlength="2000">' + esc(t) + '</textarea>';
      li.querySelector('.note-act').innerHTML = '<button type="button" class="btn btn--ghost" data-act="note-save">Сохранить</button><button type="button" class="link-plain" data-act="note-cancel">Отмена</button>';
      li.querySelector('textarea').focus();
    } else if (act === 'note-save') {
      var v = li.querySelector('textarea').value.trim();
      if (!v) return;
      b.disabled = true;
      api.editNote(id, v).then(function () { renderNotes(); refreshDashQuiet(); say('Заметка сохранена.'); });
    } else renderNotes();
  });
  function refreshDashQuiet() { loadDash().catch(function () { /* без обновления */ }); }

  // ---------- Настройки ----------
  function renderSettings() {
    var box = $('settings-body');
    box.innerHTML = '<p class="view-loading">Загружаем…</p>';
    box.setAttribute('aria-busy', 'true');
    Promise.all([api.settings(), api.sessions()]).then(function (r) {
      box.removeAttribute('aria-busy');
      var st = r[0], ss = r[1];
      box.innerHTML =
        '<section class="w-card set" aria-labelledby="st-acc"><h2 class="w-h" id="st-acc">Вход</h2>' +
          '<dl class="set-dl"><dt>Почта</dt><dd><span class="set-email">' + esc(st.email) + '</span> <button type="button" class="link-plain" data-act="email-open">Сменить</button></dd>' +
          '<dt>Пароль</dt><dd>•••••••••• <button type="button" class="link-plain" data-act="pw-open">Сменить</button></dd></dl>' +
          '<form class="set-form" id="f-email" hidden novalidate><div class="fld"><label for="se-email">Новая почта</label><input id="se-email" name="email" type="email" class="ym-disable-keys" autocomplete="email" inputmode="email" autocapitalize="none" spellcheck="false" maxlength="254"></div>' +
            '<div class="fld"><label for="se-cur">Текущий пароль</label><div class="pw"><input id="se-cur" name="current" type="password" class="ym-disable-keys" autocomplete="current-password" maxlength="256"><button type="button" class="pw-eye" aria-controls="se-cur" aria-pressed="false">Показать</button></div></div>' +
            '<p class="f-err" id="se-err" hidden></p><button class="btn" type="submit">Прислать код на&nbsp;новую почту</button></form>' +
          '<form class="set-form" id="f-email2" hidden novalidate><div class="fld"><label for="se-code">Код из&nbsp;письма на&nbsp;новую почту</label><input id="se-code" name="code" class="code-in" type="text" inputmode="numeric" autocomplete="one-time-code" maxlength="6"></div>' +
            '<p class="f-err" id="se2-err" hidden></p><button class="btn" type="submit">Подтвердить</button></form>' +
          '<form class="set-form" id="f-pw" hidden novalidate><input type="email" name="username" autocomplete="username" value="' + esc(st.email) + '" hidden>' +
            '<div class="fld"><label for="sw-cur">Текущий пароль</label><div class="pw"><input id="sw-cur" name="current" type="password" class="ym-disable-keys" autocomplete="current-password" maxlength="256"><button type="button" class="pw-eye" aria-controls="sw-cur" aria-pressed="false">Показать</button></div></div>' +
            '<div class="fld"><label for="sw-new">Новый пароль</label><div class="pw"><input id="sw-new" name="password" type="password" class="ym-disable-keys" autocomplete="new-password" maxlength="256" aria-describedby="sw-new-hint"><button type="button" class="pw-eye" aria-controls="sw-new" aria-pressed="false">Показать</button></div><p class="fld-hint" id="sw-new-hint" data-pw-hint="sw-new">Не короче ' + R.PW_MIN + ' знаков. Вход на&nbsp;других устройствах закроется.</p></div>' +
            '<p class="f-err" id="sw-err" hidden></p><button class="btn" type="submit">Сменить пароль</button></form>' +
        '</section>' +
        '<section class="w-card set" aria-labelledby="st-show"><h2 class="w-h" id="st-show">Что показывать</h2>' +
          (brand === 'dvorami' ? '<label class="tgl"><input type="checkbox" data-set="show_sledami"' + (st.show_sledami !== false ? ' checked' : '') + '><span>Показывать дела «Следами» (18+) в&nbsp;«Дворами»<small>Выключите на&nbsp;семейном телефоне.</small></span></label>' : '') +
          '<label class="tgl"><input type="checkbox" data-set="marketing"' + (st.marketing ? ' checked' : '') + '><span>Писать о&nbsp;новых делах и&nbsp;скидках<small>Отдельное согласие на&nbsp;рассылку; отписаться&nbsp;— здесь или из&nbsp;письма.</small></span></label>' +
        '</section>' +
        '<section class="w-card set" aria-labelledby="st-dev"><h2 class="w-h" id="st-dev">Устройства</h2><ul class="devs">' +
          ss.map(function (s) { return '<li><span><b>' + esc(s.device) + '</b><span>' + (s.current ? 'это устройство' : 'был вход ' + when(s.seen)) + '</span></span>' + (s.current ? '' : '<button type="button" class="link-plain" data-act="end-session" data-id="' + esc(s.id) + '">Выйти на&nbsp;нём</button>') + '</li>'; }).join('') +
          '</ul><button type="button" class="btn btn--ghost" data-act="logout-all">Выйти на&nbsp;всех устройствах</button></section>' +
        '<section class="w-card set" aria-labelledby="st-data"><h2 class="w-h" id="st-data">Мои данные</h2>' +
          '<p>Храним только почту, пароль в&nbsp;зашифрованном виде, коды, прогресс, оценки и&nbsp;заметки. Данные лежат в&nbsp;России. <a href="../legal/privacy/">Политика конфиденциальности</a></p>' +
          '<div class="w-actions"><button type="button" class="btn btn--ghost" data-act="export">Скачать мои данные</button><button type="button" class="link-plain set-danger" data-act="delete-open">Удалить аккаунт</button></div>' +
          '<form class="set-form" id="f-del" hidden novalidate><p><b>Удалить аккаунт навсегда?</b> Сразу удалятся аккаунт, заметки, привязки кодов и&nbsp;прогресс. Купленные коды продолжат работать по&nbsp;ссылке из&nbsp;письма.</p>' +
            '<div class="fld"><label for="sd-cur">Пароль</label><input id="sd-cur" name="current" type="password" class="ym-disable-keys" autocomplete="current-password" maxlength="256"></div>' +
            '<p class="f-err" id="sd-err" hidden></p><button class="btn btn--danger" type="submit">Удалить навсегда</button></form>' +
        '</section>' +
        '<section class="w-card set set-out" aria-labelledby="st-out"><h2 class="w-h" id="st-out">Выход</h2><p>Вы&nbsp;вошли как <b>' + esc(st.email) + '</b>.</p><button type="button" class="btn btn--ghost" data-act="logout">Выйти</button></section>';
      bindSettings();
    }, function (e) { box.removeAttribute('aria-busy'); box.innerHTML = '<p class="view-empty">' + errText(e) + '</p>'; });
  }
  function bindSettings() {
    bindFormEl($('f-email'), function (f) {
      var email = emailOf(f);
      if (!f.elements.current.value) throw { code: 'local', field: 'current', local: 'Впишите текущий пароль.' };
      return api.changeEmail(email, f.elements.current.value).then(function () { f.hidden = true; $('f-email2').hidden = false; $('se-code').focus(); say('Код отправлен на новую почту.'); });
    });
    bindFormEl($('f-email2'), function (f) {
      return api.verifyEmail(f.elements.code.value.replace(/\s/g, '')).then(function (r) { S.user = r.user; $('nav-email').textContent = r.user.email; renderSettings(); say('Почта изменена.'); });
    });
    bindFormEl($('f-pw'), function (f) {
      if (!f.elements.current.value) throw { code: 'local', field: 'current', local: 'Впишите текущий пароль.' };
      var pw = pwOf(f, S.user.email);
      return api.changePassword(f.elements.current.value, pw).then(function () { f.reset(); f.hidden = true; say('Пароль изменён. На других устройствах вход закрыт.'); renderSettings(); });
    });
    bindFormEl($('f-del'), function (f) {
      if (!f.elements.current.value) throw { code: 'local', field: 'current', local: 'Впишите пароль.' };
      return api.deleteAccount(f.elements.current.value).then(function () {
        S.user = null; S.dash = null;
        try { history.replaceState(null, '', location.pathname + location.search.replace(/[?&]set=[^&]*/, '')); } catch (e) { /* адрес как есть */ }
        toLogin('Аккаунт удалён. Коды из&nbsp;писем продолжают работать.');
      });
    });
  }
  doc.addEventListener('click', function (ev) {
    var b = ev.target.closest('[data-act]');
    if (!b) return;
    var a = b.getAttribute('data-act');
    if (a === 'email-open' || a === 'pw-open' || a === 'delete-open') {
      var f = $({ 'email-open': 'f-email', 'pw-open': 'f-pw', 'delete-open': 'f-del' }[a]);
      f.hidden = !f.hidden;
      if (!f.hidden) { var i = f.querySelector('input:not([hidden])'); if (i) i.focus(); }
    } else if (a === 'logout' || a === 'logout-all') {
      b.disabled = true;
      (a === 'logout' ? api.logout() : api.logoutAll()).then(function () {
        track('logout', { all: a === 'logout-all' ? 1 : 0 });
        try { history.replaceState(null, '', location.pathname + (brand === 'sledami' ? '?brand=sledami' : '')); } catch (e) { /* адрес как есть */ }
        toLogin(a === 'logout' ? 'Вы&nbsp;вышли. Дела и&nbsp;прогресс сохранены в&nbsp;аккаунте.' : 'Вы&nbsp;вышли на&nbsp;всех устройствах.');
        b.disabled = false;
      });
    } else if (a === 'end-session') {
      api.endSession(b.getAttribute('data-id')).then(function () { renderSettings(); say('Вход на устройстве закрыт.'); });
    } else if (a === 'export') {
      api.exportData().then(function (d) {
        var blob = new Blob([JSON.stringify(d, null, 2)], { type: 'application/json' });
        var url = URL.createObjectURL(blob), link = doc.createElement('a');
        link.href = url; link.download = 'moi-dela-dannye.json'; doc.body.appendChild(link); link.click();
        setTimeout(function () { URL.revokeObjectURL(url); link.remove(); }, 500);
        say('Файл с данными сохранён.');
      });
    }
  });
  doc.addEventListener('change', function (ev) {
    var t = ev.target;
    if (!t.matches || !t.matches('[data-set]')) return;
    var patch = {}; patch[t.getAttribute('data-set')] = t.checked;
    api.saveSettings(patch).then(function (s) { if (S.dash) S.dash.settings = s; say('Сохранено.'); }, function (e) { t.checked = !t.checked; say(errText(e).replace(/<[^>]+>|&nbsp;/g, ' ')); });
  });

  // ---------- маршрут ----------
  var RENDER = { overview: renderOverview, cases: renderCases, purchases: renderPurchases, achievements: renderAch, notes: renderNotes, settings: renderSettings };
  function route(initial) {
    if (!S.user) return;
    var v = location.hash.slice(1);
    if (VIEWS.indexOf(v) < 0) v = 'overview';
    VIEWS.forEach(function (x) { $(x).hidden = x !== v; });
    doc.querySelectorAll('#acc-nav a[data-view]').forEach(function (a) { if (a.getAttribute('data-view') === v) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current'); });
    doc.title = (v === 'overview' ? '' : TITLE[v] + ' — ') + 'Мои дела | ' + BRAND_NAME;
    RENDER[v]();
    if (!initial) {
      var h = $('h-' + v);
      if (h) { try { h.focus({ preventScroll: true }); } catch (e) { h.focus(); } }
      window.scrollTo(0, 0);
      say(TITLE[v]);
      track('account_nav', { view: v });
    }
  }
  window.addEventListener('hashchange', function () {
    if (!S.user) return;
    var v = location.hash.slice(1);
    if (VIEWS.indexOf(v) >= 0) route(false);
  });

  // ---------- тема «Следами»: текущая линия, адреса ----------
  if (brand === 'sledami') {
    [].forEach.call(doc.querySelectorAll('.lines .lines-item'), function (a) {
      var isS = /sledami\//.test(a.getAttribute('href') || '');
      if (isS) { a.setAttribute('aria-current', 'true'); a.setAttribute('href', ROOT + 'sledami/'); }
      else if (a.tagName === 'A') { a.removeAttribute('aria-current'); a.setAttribute('href', ROOT + '?from=sledami'); }
    });
    var my = doc.querySelector('.lines .lines-my');
    if (my) my.setAttribute('href', ROOT + 'account/?brand=sledami');
    var tc = doc.querySelector('meta[name="theme-color"]');
    if (tc) tc.setAttribute('content', '#12100E');
  }

  // ---------- старт ----------
  var setTok = (location.search.match(/[?&]set=([A-Za-z0-9_-]{1,128})/) || [])[1];
  api.session().then(function (r) {
    if (setTok) {
      S.invite = setTok;
      return api.inviteInfo(setTok).then(function (inv) {
        S.inviteEmail = inv.email;
        doc.querySelectorAll('[data-fill="invite-email"]').forEach(function (b) { b.textContent = inv.email; });
        doc.querySelectorAll('[data-fill-value="invite-email"]').forEach(function (b) { b.value = inv.email; });
        showPanel('setpw', true);
      }, function () { showPanel('login', true); showErr($('f-login'), { code: 'expired' }); });
    }
    if (r.user) return enter(r.user, false);
    showPanel('login', true);
  }, function (e) {
    showPanel('login', true);
    if (e.code === 'network') showErr($('f-login'), e);
  }).then(function () {
    track('account_view', { brand: brand, items: S.dash ? S.dash.cases.length : 0, auth: S.user ? 1 : 0 });
  });
})();

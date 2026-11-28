/* «Мои дела» — обмен с сервером. ЕДИНСТВЕННЫЙ модуль кабинета, который знает про сеть (docs/account.md, ADR-6, раздел 4).
   Режим — <meta name="dv-api" content="…"> на странице:
     mock                          — стенд: демо без сервера. Принимает только адреса @example.com/.org/.net, «письма» не уходят
                                     (код подтверждения показан на плашке «Демо»), всё живёт в sessionStorage этой вкладки,
                                     пароли — только SHA-256. Ничего не отправляет.
     https://api.dvorami.ru/v1     — сервер: fetch с cookie сессии (HttpOnly, её ставит сервер) и заголовком X-CSRF-Token.
   Все методы возвращают Promise: успех — данные, ошибка — ApiError { code, status, retryAfter, field }.
   Коды ошибок (тексты — в app.js, без подсказок для перебора, team/std/security.md п. 7):
     bad_credentials, rate_limited, weak_password, bad_email, bad_code, expired, consent_required, demo_only,
     unauthorized, csrf, network, server. */
(function (w) {
  'use strict';

  function ApiError(code, extra) {
    this.code = code;
    this.status = (extra && extra.status) || 0;
    this.retryAfter = (extra && extra.retryAfter) || 0;
    this.field = (extra && extra.field) || '';
    this.why = (extra && extra.why) || '';   // weak_password: short | long | common | email | repeat
    this.message = code;
  }
  ApiError.prototype = Object.create(Error.prototype);

  var meta = document.querySelector('meta[name="dv-api"]');
  var MODE = (meta && meta.getAttribute('content') || 'mock').trim();

  // ---------- общие правила (те же на сервере) ----------
  var PW_MIN = 10, PW_MAX = 128;
  // частые пароли — короткий список для подсказки на экране; на сервере — 100 тыс. строк (docs/account.md, раздел 3)
  var COMMON = ['1234567890', '0123456789', '1111111111', 'qwertyuiop', 'password12', 'password123', '123456789a', 'йцукенгшщз',
    'qwerty1234', '1q2w3e4r5t', 'zaq12wsxcde', 'iloveyou12', 'dvorami123', 'parol12345', 'пароль1234', 'qwertyqwerty', 'abc1234567'];
  function normEmail(e) {
    e = String(e || '').trim();
    try { e = e.normalize('NFKC'); } catch (x) { /* старый браузер */ }
    return e.toLowerCase();
  }
  function emailOk(e) { return e.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e); }
  // → '' или причина: short | long | common | email | repeat
  function passwordIssue(pw, email) {
    pw = String(pw || '');
    try { pw = pw.normalize('NFKC'); } catch (x) { /* как есть */ }
    var n = Array.from ? Array.from(pw).length : pw.length;
    if (n < PW_MIN) return 'short';
    if (n > PW_MAX) return 'long';
    var low = pw.toLowerCase();
    if (/^(.)\1+$/.test(pw)) return 'repeat';
    if (COMMON.indexOf(low) >= 0) return 'common';
    var local = normEmail(email).split('@')[0];
    if (local && local.length >= 4 && (low === normEmail(email) || low.indexOf(local) >= 0)) return 'email';
    return '';
  }

  var rules = { PW_MIN: PW_MIN, PW_MAX: PW_MAX, normEmail: normEmail, emailOk: emailOk, passwordIssue: passwordIssue };

  // =====================================================================================
  // Сервер (боевой режим). Сессия — cookie HttpOnly на домене API; скрипт её не видит.
  // =====================================================================================
  function httpApi(base) {
    var csrf = '';
    function call(method, path, body) {
      var ctl = typeof AbortController === 'function' ? new AbortController() : null;
      var timer = ctl ? setTimeout(function () { ctl.abort(); }, 12000) : 0;
      var headers = { 'Accept': 'application/json' };
      if (body !== undefined) headers['Content-Type'] = 'application/json';
      if (method !== 'GET' && csrf) headers['X-CSRF-Token'] = csrf;
      return fetch(base + path, { method: method, credentials: 'include', headers: headers, cache: 'no-store',
        body: body === undefined ? undefined : JSON.stringify(body), signal: ctl ? ctl.signal : undefined })
        .then(function (r) {
          clearTimeout(timer);
          if (r.status === 204) return null;
          return r.json().catch(function () { return {}; }).then(function (j) {
            if (r.ok) { if (j && j.csrf) csrf = j.csrf; return j; }
            var ra = parseInt(r.headers.get('Retry-After'), 10) || (j && j.retry_after) || 0;
            var code = (j && j.error) || (r.status === 401 ? 'unauthorized' : r.status === 429 ? 'rate_limited' : 'server');
            throw new ApiError(code, { status: r.status, retryAfter: ra, field: j && j.field, why: j && j.why });
          });
        }, function () { clearTimeout(timer); throw new ApiError('network'); });
    }
    return {
      mode: 'http',
      session: function () { return call('GET', '/session'); },
      login: function (email, password) { return call('POST', '/auth/login', { email: normEmail(email), password: password }); },
      logout: function () { return call('POST', '/auth/logout', {}).then(function () { csrf = ''; }); },
      logoutAll: function () { return call('POST', '/auth/logout-all', {}).then(function () { csrf = ''; }); },
      register: function (email, password, consent, code) { return call('POST', '/auth/register', { email: normEmail(email), password: password, consent: !!consent, code: code || undefined }); },
      verify: function (email, code) { return call('POST', '/auth/verify', { email: normEmail(email), code: code }); },
      resend: function (email, purpose) { return call('POST', '/auth/resend', { email: normEmail(email), purpose: purpose }); },
      forgot: function (email) { return call('POST', '/auth/forgot', { email: normEmail(email) }); },
      reset: function (email, code, password) { return call('POST', '/auth/reset', { email: normEmail(email), code: code, password: password }); },
      setPassword: function (token, password, consent) { return call('POST', '/auth/set-password', { token: token, password: password, consent: !!consent }); },
      inviteInfo: function (token) { return call('GET', '/auth/set-password?token=' + encodeURIComponent(token)); },
      dashboard: function () { return call('GET', '/me/dashboard'); },
      addCode: function (code) { return call('POST', '/me/codes', { code: code }); },
      importLocal: function (items) { return call('POST', '/me/import', { items: items }); },
      orders: function () { return call('GET', '/me/orders'); },
      giftResend: function (id) { return call('POST', '/me/orders/' + encodeURIComponent(id) + '/resend', {}); },
      achievements: function () { return call('GET', '/me/achievements'); },
      notes: function () { return call('GET', '/me/notes'); },
      addNote: function (quest, text, point) { return call('POST', '/me/notes', { quest: quest, text: text, point: point || null }); },
      editNote: function (id, text) { return call('PATCH', '/me/notes/' + encodeURIComponent(id), { text: text }); },
      deleteNote: function (id) { return call('DELETE', '/me/notes/' + encodeURIComponent(id)); },
      settings: function () { return call('GET', '/me/settings'); },
      saveSettings: function (patch) { return call('PATCH', '/me/settings', patch); },
      changePassword: function (current, password) { return call('POST', '/me/password', { current: current, password: password }); },
      changeEmail: function (email, password) { return call('POST', '/me/email', { email: normEmail(email), password: password }); },
      verifyEmail: function (code) { return call('POST', '/me/email/verify', { code: code }); },
      sessions: function () { return call('GET', '/me/sessions'); },
      endSession: function (id) { return call('DELETE', '/me/sessions/' + encodeURIComponent(id)); },
      exportData: function () { return call('GET', '/me/export'); },
      deleteAccount: function (password) { return call('DELETE', '/me', { password: password }); },
      demo: null,
      rules: rules
    };
  }

  // =====================================================================================
  // Заглушка для стенда. Повторяет ответы сервера (docs/account.md, раздел 4), но всё — в этой вкладке.
  // =====================================================================================
  function mockApi() {
    var KEY = 'dvorami:demo-api:v1', SKEY = 'dvorami:demo-api:session';
    var DEMO = { email: 'demo@example.com', password: 'dvorami-demo', code: '246810', invite: 'demo' };
    var mem = {};   // если sessionStorage недоступен (приватный режим) — живём в памяти
    function sget(k) { try { return w.sessionStorage.getItem(k); } catch (e) { return mem[k] == null ? null : mem[k]; } }
    function sset(k, v) { try { w.sessionStorage.setItem(k, v); } catch (e) { mem[k] = v; } }
    function sdel(k) { try { w.sessionStorage.removeItem(k); } catch (e) { delete mem[k]; } }
    function lget(k) { try { return w.localStorage.getItem(k); } catch (e) { return null; } }
    function now() { return Date.now(); }
    function wait(v) { return new Promise(function (res) { setTimeout(function () { res(v); }, 220 + Math.random() * 260); }); }
    function fail(code, extra) { return new Promise(function (res, rej) { setTimeout(function () { rej(new ApiError(code, extra)); }, 220 + Math.random() * 200); }); }
    function rid() { var a = new Uint8Array(12); (w.crypto || {}).getRandomValues ? w.crypto.getRandomValues(a) : a.forEach(function (_, i) { a[i] = Math.random() * 256; }); return Array.prototype.map.call(a, function (b) { return ('0' + b.toString(16)).slice(-2); }).join(''); }
    function sha(s) {
      try {
        if (w.crypto && w.crypto.subtle && w.TextEncoder) return w.crypto.subtle.digest('SHA-256', new TextEncoder().encode('demo:' + s))
          .then(function (b) { return Array.prototype.map.call(new Uint8Array(b), function (x) { return ('0' + x.toString(16)).slice(-2); }).join(''); });
      } catch (e) { /* ниже */ }
      var h = 2166136261; for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
      return Promise.resolve('fnv' + (h >>> 0).toString(16));
    }
    function demoDomain(e) { return /@example\.(com|org|net)$/.test(e); }
    function device() {
      var ua = navigator.userAgent || '';
      var os = /iPhone|iPad/.test(ua) ? 'iPhone' : /Android/.test(ua) ? 'Android' : /Mac OS X/.test(ua) ? 'Mac' : /Windows/.test(ua) ? 'Windows' : /Linux/.test(ua) ? 'Linux' : 'Устройство';
      var br = /YaBrowser/.test(ua) ? 'Яндекс Браузер' : /Edg\//.test(ua) ? 'Edge' : /Firefox\//.test(ua) ? 'Firefox' : /Chrome\//.test(ua) ? 'Chrome' : /Safari\//.test(ua) ? 'Safari' : 'браузер';
      return os + ' · ' + br;
    }
    function cases() { try { return JSON.parse(document.getElementById('cases-data').textContent) || []; } catch (e) { return []; } }
    function caseByQuest(q) { return cases().filter(function (c) { return c.play === q; })[0] || null; }

    // ---------- «база» ----------
    function seedState(q, o) {
      var c = caseByQuest(q) || {};
      return Object.assign({ v: 1, quest: q, version: c.version || null, phase: 'idle', p: 0, k: 0, paused: false, t_start: null, t_end: null, events: [] }, o);
    }
    function seed() {
      var t = now(), H = 36e5, D = 864e5;
      var db = { v: 1, users: {}, sessions: {}, pending: {}, fails: {}, data: {} };
      var uid = 'u-demo';
      db.users[DEMO.email] = { id: uid, email: DEMO.email, pw: null, verified: t - 20 * D, created: t - 20 * D, consent: t - 20 * D };
      var data = { cases: {}, notes: [], orders: [], ach: {}, settings: { show_sledami: true, marketing: false }, imported: false };
      if (caseByQuest('zilart')) {
        data.cases.zilart = { role: 'buyer', tail: 'Q2PX', added: t - 3 * D,
          state: seedState('zilart', { phase: 'walk', p: 4, paused: true, t_start: t - 26 * H,
            events: [{ t: t - 26 * H, kind: 'start', point: null }, { t: t - 25.5 * H, kind: 'walk', point: 4 }, { t: t - 25 * H, kind: 'walk', point: 5 }, { t: t - 25 * H + 6e4, kind: 'stop', point: 5 }] }) };
        data.notes.push({ id: 'n1', quest: 'zilart', point: 3, text: 'Взять воду и зарядку: точек больше, чем кажется. В следующий раз начать пораньше.', at: t - 25.2 * H });
        data.orders.push({ id: 'D-1001', at: t - 3 * D, quest: 'zilart', amount: 990, status: 'paid', kind: 'self', tail: 'Q2PX' });
        data.orders.push({ id: 'D-1002', at: t - 2 * D, quest: 'zilart', amount: 990, status: 'paid', kind: 'gift', to: 'Маше и Пете', opened: null, tail: 'WW9C' });
      }
      if (caseByQuest('kolomenskoe')) {
        data.cases.kolomenskoe = { role: 'member', tail: '7K4M', added: t - 9 * D, rating: 4,
          state: seedState('kolomenskoe', { phase: 'done', p: 7, t_start: t - 8 * D - 2.7 * H, t_end: t - 8 * D,
            events: [{ t: t - 8 * D - 2.7 * H, kind: 'start', point: null }, { t: t - 8 * D, kind: 'finish', point: null }] }) };
        data.notes.push({ id: 'n2', quest: 'kolomenskoe', point: null, text: 'Понравилось всем, даже бабушке. Вернуться весной, когда цветут яблони.', at: t - 8 * D + 3e5 });
      }
      db.data[uid] = data;
      return db;
    }
    function load() {
      var db = null;
      try { db = JSON.parse(sget(KEY) || 'null'); } catch (e) { db = null; }
      if (!db || db.v !== 1) { db = seed(); save(db); }
      return db;
    }
    function save(db) { sset(KEY, JSON.stringify(db)); }
    function me(db) {
      var tok = sget(SKEY), s = tok && db.sessions[tok];
      if (!s) return null;
      var u = null;
      for (var e in db.users) if (db.users[e].id === s.uid) u = db.users[e];
      if (!u) return null;
      s.seen = now();
      return u;
    }
    function pub(u) { return { id: u.id, email: u.email, since: u.created }; }
    function startSession(db, u) {
      var tok = rid();
      db.sessions[tok] = { uid: u.id, created: now(), seen: now(), device: device() };
      u.last = now();
      sset(SKEY, tok);
      save(db);
      return { user: pub(u) };
    }
    function auth() { var db = load(), u = me(db); return u ? { db: db, u: u, d: db.data[u.id] } : null; }
    function needAuth(fn) { return function () { var a = auth(); if (!a) return fail('unauthorized', { status: 401 }); return fn.apply(null, [a].concat([].slice.call(arguments))); }; }
    function newData() { return { cases: {}, notes: [], orders: [], ach: {}, settings: { show_sledami: true, marketing: false }, imported: false }; }

    // ---------- прогресс: «дальше — побеждает» (docs/account.md, раздел 8) ----------
    var RANK = { idle: 0, intro: 1, walk: 2, step: 3, point_done: 4, done: 9 };
    function further(a, b) {   // true, если a дальше b
      if (!b) return true;
      if (!a) return false;
      var ra = RANK[a.phase] || 0, rb = RANK[b.phase] || 0;
      if ((ra === 9) !== (rb === 9)) return ra === 9;
      if ((a.p | 0) !== (b.p | 0)) return (a.p | 0) > (b.p | 0);
      if (ra !== rb) return ra > rb;
      return (a.k | 0) >= (b.k | 0);
    }
    function merge(server, local) {
      if (!server) return local;
      if (!local) return server;
      var base = further(local, server) ? local : server, other = base === local ? server : local;
      var out = JSON.parse(JSON.stringify(base)), seen = {};
      out.events = (base.events || []).concat(other.events || []).filter(function (e) {
        var k = e && e.t + ':' + e.kind + ':' + e.point; if (!e || seen[k]) return false; seen[k] = 1; return true;
      }).sort(function (x, y) { return x.t - y.t; }).slice(-500);
      return out;
    }
    // сводка для кабинета — то же, что сервер пишет в progress.summary
    function summary(s) {
      if (!s || s.phase === 'idle') return null;
      var ev = Array.isArray(s.events) ? s.events : [], last = +s.t_start || 0, point = null, hints = 0, resumed = false;
      for (var i = ev.length - 1; i >= 0; i--) {
        var e = ev[i] || {};
        if (typeof e.t === 'number' && e.t > last) last = e.t;
        if (point == null && e.point != null && !isNaN(parseInt(e.point, 10))) point = parseInt(e.point, 10);
        if (e.kind === 'hint' || e.kind === 'reveal') hints++;
        if (e.kind === 'resume') resumed = true;
      }
      if (s.phase === 'intro') point = null; else if (point == null && s.phase !== 'done') point = (s.p | 0) + 1;
      return { phase: s.phase, point: point, point_done: s.phase === 'point_done', paused: !!s.paused, last: last,
        t_start: +s.t_start || 0, t_end: +s.t_end || 0, version: s.version == null ? null : String(s.version), hints: hints, resumed: resumed };
    }
    // заглушка «синхронизирует» дела аккаунта с сохранениями плеера на этом телефоне — как модуль синхронизации (этап 5)
    function syncLocal(d) {
      Object.keys(d.cases).forEach(function (q) {
        var raw = lget('dvorami:play:' + q), s = null;
        try { s = JSON.parse(raw || 'null'); } catch (e) { s = null; }
        if (s && s.quest === q && s.v === 1 && s.phase && s.phase !== 'idle') d.cases[q].state = merge(d.cases[q].state, s);
        var r = parseInt(lget('dvorami:rating:' + q), 10);
        if (r >= 1 && r <= 5 && !d.cases[q].rating) d.cases[q].rating = r;
      });
    }

    // ---------- достижения (сервер считает так же) ----------
    var ACH = [
      { id: 'first', title: 'Первое дело', how: 'Раскройте первое дело' },
      { id: 'three', title: 'Сыщик района', how: 'Раскройте три дела' },
      { id: 'nohint', title: 'Без подсказок', how: 'Раскройте дело, не открыв ни одной подсказки' },
      { id: 'early', title: 'С утра пораньше', how: 'Начните дело до 10:00' },
      { id: 'back', title: 'Вернулись к делу', how: 'Продолжите дело после паузы' },
      { id: 'rated', title: 'Слово сыщика', how: 'Оцените раскрытое дело' },
      { id: 'lines', title: 'Две линии', how: 'Начните дела двух линий: «Дворами» и «Следами» или «Залами»' },
      { id: 'gift', title: 'Подарок', how: 'Подарите дело' }
    ];
    function moscowHour(ms) { try { return parseInt(new Date(ms).toLocaleString('en-GB', { timeZone: 'Europe/Moscow', hour: '2-digit', hour12: false }), 10); } catch (e) { return new Date(ms).getHours(); } }
    function achievements(d) {
      var list = Object.keys(d.cases).map(function (q) { var c = d.cases[q]; return { q: q, s: summary(c.state), r: c.rating, meta: caseByQuest(q) }; });
      var done = list.filter(function (x) { return x.s && x.s.phase === 'done'; }).sort(function (a, b) { return a.s.t_end - b.s.t_end; });
      var got = {};
      if (done[0]) got.first = done[0].s.t_end;
      if (done[2]) got.three = done[2].s.t_end;
      done.forEach(function (x) { if (!x.s.hints && !got.nohint) got.nohint = x.s.t_end; });
      list.forEach(function (x) { if (x.s && x.s.t_start && moscowHour(x.s.t_start) < 10 && !got.early) got.early = x.s.t_start; });
      list.forEach(function (x) { if (x.s && (x.s.resumed || x.s.paused) && !got.back) got.back = x.s.last; });
      list.forEach(function (x) { if (x.r && x.s && x.s.phase === 'done' && !got.rated) got.rated = x.s.t_end || now(); });
      var brands = {}; list.forEach(function (x) { if (x.s && x.meta) brands[x.meta.brand] = 1; });
      if (Object.keys(brands).length > 1) got.lines = now();
      d.orders.forEach(function (o) { if (o.kind === 'gift' && !got.gift) got.gift = o.at; });
      Object.keys(got).forEach(function (k) { if (!d.ach[k]) d.ach[k] = got[k]; });
      return ACH.map(function (a) { return { id: a.id, title: a.title, how: a.how, at: d.ach[a.id] || null }; });
    }
    function casesOut(d) {
      return Object.keys(d.cases).map(function (q) {
        var c = d.cases[q];
        return { quest: q, role: c.role, code_tail: c.tail || '', added_at: c.added, progress: summary(c.state), rating: c.rating || 0,
          notes: d.notes.filter(function (n) { return n.quest === q; }).length };
      });
    }
    function notesFromEvents(q, s) {
      return (s && Array.isArray(s.events) ? s.events : []).filter(function (e) { return e && e.kind === 'note' && e.text; })
        .map(function (e) { return { id: 'p' + e.t, quest: q, point: e.point || null, text: String(e.text).slice(0, 2000), at: e.t, from: 'player' }; });
    }

    // ---------- методы ----------
    var api = {
      mode: 'mock',
      rules: rules,
      demo: { email: DEMO.email, password: DEMO.password, code: DEMO.code, invite: DEMO.invite },
      session: function () { var db = load(), u = me(db); if (u) save(db); return wait({ user: u ? pub(u) : null, csrf: 'demo' }); },
      login: function (email, password) {
        var db = load(), e = normEmail(email), u = db.users[e], f = (db.fails[e] || []).filter(function (t) { return now() - t < 15 * 6e4; });
        if (f.length >= 5) return fail('rate_limited', { status: 429, retryAfter: Math.ceil((15 * 6e4 - (now() - f[0])) / 1000) });
        var check = !u ? Promise.resolve(false) : u.pw ? sha(password).then(function (h) { return h === u.pw; }) : Promise.resolve(e === DEMO.email && password === DEMO.password);
        return check.then(function (ok) {
          if (!ok || !u.verified) { f.push(now()); db.fails[e] = f; save(db); return fail('bad_credentials', { status: 401 }); }
          delete db.fails[e];
          return wait(startSession(db, u));
        });
      },
      logout: function () { var db = load(), tok = sget(SKEY); if (tok) delete db.sessions[tok]; save(db); sdel(SKEY); return wait(null); },
      logoutAll: needAuth(function (a) { Object.keys(a.db.sessions).forEach(function (t) { if (a.db.sessions[t].uid === a.u.id) delete a.db.sessions[t]; }); save(a.db); sdel(SKEY); return wait(null); }),
      register: function (email, password, consent, code) {
        var e = normEmail(email);
        if (!emailOk(e)) return fail('bad_email', { field: 'email' });
        if (!demoDomain(e)) return fail('demo_only', { field: 'email' });
        var why = passwordIssue(password, e);
        if (why) return fail('weak_password', { field: 'password', why: why });
        if (!consent) return fail('consent_required', { field: 'consent' });
        var db = load();
        if (db.users[e]) return wait({ next: 'verify' });   // как сервер: ответ одинаковый, письмо «у вас уже есть аккаунт»
        return sha(password).then(function (h) {
          db.pending[e] = { kind: 'verify', code: DEMO.code, pw: h, exp: now() + 15 * 6e4, tries: 0, consent: now(), add: code || '' };
          save(db);
          return wait({ next: 'verify' });
        });
      },
      verify: function (email, code) {
        var db = load(), e = normEmail(email), p = db.pending[e];
        if (!p || p.kind !== 'verify') return fail('bad_code', { field: 'code' });
        if (now() > p.exp) { delete db.pending[e]; save(db); return fail('expired', { field: 'code' }); }
        if (String(code).replace(/\D/g, '') !== p.code) { p.tries++; if (p.tries >= 5) delete db.pending[e]; save(db); return fail('bad_code', { field: 'code' }); }
        delete db.pending[e];
        var u = { id: 'u-' + rid().slice(0, 8), email: e, pw: p.pw, verified: now(), created: now(), consent: p.consent };
        db.users[e] = u; db.data[u.id] = newData();
        return wait(startSession(db, u));
      },
      resend: function () { return wait({ ok: true }); },
      forgot: function (email) {
        var db = load(), e = normEmail(email);
        if (db.users[e]) { db.pending[e] = { kind: 'reset', code: DEMO.code, exp: now() + 15 * 6e4, tries: 0 }; save(db); }
        return wait({ next: 'reset' });   // всегда одинаково: по ответу нельзя узнать, есть ли аккаунт
      },
      reset: function (email, code, password) {
        var db = load(), e = normEmail(email), p = db.pending[e], u = db.users[e];
        var why = passwordIssue(password, e);
        if (why) return fail('weak_password', { field: 'password', why: why });
        if (!p || p.kind !== 'reset' || !u) return fail('bad_code', { field: 'code' });
        if (now() > p.exp) { delete db.pending[e]; save(db); return fail('expired', { field: 'code' }); }
        if (String(code).replace(/\D/g, '') !== p.code) { p.tries++; if (p.tries >= 5) delete db.pending[e]; save(db); return fail('bad_code', { field: 'code' }); }
        return sha(password).then(function (h) {
          delete db.pending[e]; delete db.fails[e];
          u.pw = h; u.verified = u.verified || now();
          Object.keys(db.sessions).forEach(function (t) { if (db.sessions[t].uid === u.id) delete db.sessions[t]; });   // сброс закрывает все сессии
          return wait(startSession(db, u));
        });
      },
      inviteInfo: function (token) { return token === DEMO.invite ? wait({ email: 'buyer@example.com', quest: 'zilart' }) : fail('expired'); },
      setPassword: function (token, password, consent) {
        if (token !== DEMO.invite) return fail('expired');
        var e = 'buyer@example.com', why = passwordIssue(password, e);
        if (why) return fail('weak_password', { field: 'password', why: why });
        if (!consent) return fail('consent_required', { field: 'consent' });
        var db = load();
        return sha(password).then(function (h) {
          var u = db.users[e];
          if (!u) {
            u = { id: 'u-buyer', email: e, pw: h, verified: now(), created: now(), consent: now() };
            db.users[e] = u;
            var d = newData();
            if (caseByQuest('zilart')) {
              d.cases.zilart = { role: 'buyer', tail: 'H8TQ', added: now(), state: null };
              d.orders.push({ id: 'D-2001', at: now() - 6e5, quest: 'zilart', amount: 990, status: 'paid', kind: 'self', tail: 'H8TQ' });
            }
            db.data[u.id] = d;
          } else u.pw = h;
          return wait(startSession(db, u));
        });
      },
      dashboard: needAuth(function (a) {
        syncLocal(a.d);
        var ach = achievements(a.d);
        save(a.db);
        var notes = a.d.notes.slice().sort(function (x, y) { return y.at - x.at; });
        return wait({ user: pub(a.u), cases: casesOut(a.d), achievements: ach, note: notes[0] || null, notes_total: notes.length,
          orders: a.d.orders.length, gifts_waiting: a.d.orders.filter(function (o) { return o.kind === 'gift' && !o.opened && o.status === 'paid'; }).length,
          settings: a.d.settings, imported: a.d.imported, synced_at: now() });
      }),
      addCode: needAuth(function (a, code) {
        // демо: подходит любой код вида ZIL-XXXX-XXXX (как напечатано на коде); на сервере — поиск хеша в таблице codes
        var c = String(code || '').toUpperCase().replace(/\s+/g, '').replace(/[–—]/g, '-');
        var m = c.match(/^([A-Z]{3})-?([A-Z0-9]{4})-?([A-Z0-9]{4})$/);
        var q = m && { ZIL: 'zilart', KOL: 'kolomenskoe' }[m[1]];
        if (!q || !caseByQuest(q)) return fail('bad_code', { field: 'code' });
        if (!a.d.cases[q]) a.d.cases[q] = { role: 'member', tail: m[3], added: now(), state: null };
        save(a.db);
        return wait({ quest: q });
      }),
      importLocal: needAuth(function (a, items) {
        var added = 0, merged = 0, skipped = 0;
        (items || []).forEach(function (it) {
          if (!it || !caseByQuest(it.quest)) { skipped++; return; }
          if (!it.code) { skipped++; return; }   // без кода дело не привязать: оно остаётся на этом телефоне
          var c = a.d.cases[it.quest];
          if (!c) { a.d.cases[it.quest] = c = { role: 'member', tail: String(it.code).replace(/[^A-Za-z0-9]/g, '').slice(-4).toUpperCase(), added: now(), state: null }; added++; } else merged++;
          if (it.state) c.state = merge(c.state, it.state);
          if (it.rating && !c.rating) c.rating = it.rating;
          notesFromEvents(it.quest, it.state).forEach(function (n) { if (!a.d.notes.some(function (x) { return x.id === n.id; })) a.d.notes.push(n); });
        });
        a.d.imported = true;
        save(a.db);
        return wait({ added: added, merged: merged, skipped: skipped });
      }),
      orders: needAuth(function (a) { return wait(a.d.orders.slice().sort(function (x, y) { return y.at - x.at; })); }),
      giftResend: needAuth(function (a, id) { return a.d.orders.some(function (o) { return o.id === id; }) ? wait({ ok: true }) : fail('server'); }),
      achievements: needAuth(function (a) { var r = achievements(a.d); save(a.db); return wait(r); }),
      notes: needAuth(function (a) { return wait(a.d.notes.slice().sort(function (x, y) { return y.at - x.at; })); }),
      addNote: needAuth(function (a, quest, text, point) {
        text = String(text || '').trim().slice(0, 2000);
        if (!text || !a.d.cases[quest]) return fail('server', { field: 'text' });
        var n = { id: 'n' + rid().slice(0, 8), quest: quest, point: point || null, text: text, at: now() };
        a.d.notes.push(n); save(a.db); return wait(n);
      }),
      editNote: needAuth(function (a, id, text) {
        var n = a.d.notes.filter(function (x) { return x.id === id; })[0];
        text = String(text || '').trim().slice(0, 2000);
        if (!n || !text) return fail('server');
        n.text = text; n.at = now(); save(a.db); return wait(n);
      }),
      deleteNote: needAuth(function (a, id) { a.d.notes = a.d.notes.filter(function (x) { return x.id !== id; }); save(a.db); return wait(null); }),
      settings: needAuth(function (a) { return wait({ email: a.u.email, show_sledami: a.d.settings.show_sledami, marketing: a.d.settings.marketing }); }),
      saveSettings: needAuth(function (a, patch) {
        if ('show_sledami' in patch) a.d.settings.show_sledami = !!patch.show_sledami;
        if ('marketing' in patch) a.d.settings.marketing = !!patch.marketing;
        save(a.db); return wait(a.d.settings);
      }),
      changePassword: needAuth(function (a, current, password) {
        var why = passwordIssue(password, a.u.email);
        if (why) return fail('weak_password', { field: 'password', why: why });
        var ok = a.u.pw ? sha(current).then(function (h) { return h === a.u.pw; }) : Promise.resolve(current === DEMO.password);
        return ok.then(function (good) {
          if (!good) return fail('bad_credentials', { field: 'current' });
          return sha(password).then(function (h) {
            a.u.pw = h;
            var keep = sget(SKEY);
            Object.keys(a.db.sessions).forEach(function (t) { if (t !== keep && a.db.sessions[t].uid === a.u.id) delete a.db.sessions[t]; });
            save(a.db); return wait(null);
          });
        });
      }),
      changeEmail: needAuth(function (a, email, password) {
        var e = normEmail(email);
        if (!emailOk(e)) return fail('bad_email', { field: 'email' });
        if (!demoDomain(e)) return fail('demo_only', { field: 'email' });
        var ok = a.u.pw ? sha(password).then(function (h) { return h === a.u.pw; }) : Promise.resolve(password === DEMO.password);
        return ok.then(function (good) {
          if (!good) return fail('bad_credentials', { field: 'current' });
          a.db.pending['@' + a.u.id] = { kind: 'email', to: e, code: DEMO.code, exp: now() + 15 * 6e4, tries: 0 };
          save(a.db); return wait({ next: 'verify' });
        });
      }),
      verifyEmail: needAuth(function (a, code) {
        var p = a.db.pending['@' + a.u.id];
        if (!p || String(code).replace(/\D/g, '') !== p.code) return fail('bad_code', { field: 'code' });
        if (a.db.users[p.to]) return fail('bad_code', { field: 'code' });
        delete a.db.pending['@' + a.u.id];
        delete a.db.users[a.u.email]; a.u.email = p.to; a.db.users[p.to] = a.u;
        save(a.db); return wait({ user: pub(a.u) });
      }),
      sessions: needAuth(function (a) {
        var cur = sget(SKEY), out = [];
        Object.keys(a.db.sessions).forEach(function (t) { var s = a.db.sessions[t]; if (s.uid === a.u.id) out.push({ id: t.slice(0, 8), device: s.device, seen: s.seen, current: t === cur }); });
        if (a.u.id === 'u-demo') out.push({ id: 'demo-mac', device: 'Mac · Яндекс Браузер', seen: now() - 2 * 864e5, current: false });
        return wait(out.sort(function (x, y) { return (y.current ? 1 : 0) - (x.current ? 1 : 0) || y.seen - x.seen; }));
      }),
      endSession: needAuth(function (a, id) {
        Object.keys(a.db.sessions).forEach(function (t) { if (t.slice(0, 8) === id && a.db.sessions[t].uid === a.u.id) delete a.db.sessions[t]; });
        save(a.db); return wait(null);
      }),
      exportData: needAuth(function (a) {
        return wait({ account: { email: a.u.email, created: new Date(a.u.created).toISOString(), consent: a.u.consent ? new Date(a.u.consent).toISOString() : null },
          settings: a.d.settings, cases: casesOut(a.d), notes: a.d.notes, orders: a.d.orders,
          note: 'Демо-выгрузка стенда: данные вымышленные. На сервере — то же самое по вашему аккаунту.' });
      }),
      deleteAccount: needAuth(function (a, password) {
        var ok = a.u.pw ? sha(password).then(function (h) { return h === a.u.pw; }) : Promise.resolve(password === DEMO.password);
        return ok.then(function (good) {
          if (!good) return fail('bad_credentials', { field: 'current' });
          Object.keys(a.db.sessions).forEach(function (t) { if (a.db.sessions[t].uid === a.u.id) delete a.db.sessions[t]; });
          delete a.db.data[a.u.id]; delete a.db.users[a.u.email];
          if (a.u.id === 'u-demo') { sdel(KEY); } else save(a.db);   // демо-аккаунт вернётся при следующем открытии
          sdel(SKEY); return wait(null);
        });
      }),
      resetDemo: function () { sdel(KEY); sdel(SKEY); return Promise.resolve(); }
    };
    return api;
  }

  w.DvApi = /^https:\/\//.test(MODE) ? httpApi(MODE.replace(/\/+$/, '')) : mockApi();
  w.DvApi.ApiError = ApiError;
})(window);

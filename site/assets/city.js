/* Города витрин «Дворами» и «Следами» (docs/sledami/concept.md, раздел «Города и перелинковка»).
   Один файл на обе марки. Без внешних сервисов: город берём из адреса (?city=spb, позже — /spb/), из выбора,
   запомненного на устройстве, из часового пояса браузера (различает города в разных поясах; Москву и Петербург — нет),
   иначе — первый открытый город. «Рядом со мной» — геолокация браузера по нажатию, сравнение с центрами городов на телефоне.
   Разметка страницы:
     <span data-city-drum data-form="dat">Москве</span> — барабан с городом в заголовке (кнопка → список городов);
     <span data-city-form="dat">Москве</span>             — слово в нужной форме (name, dat, loc, gen, adj, up);
     data-city-only="moscow" | "live" | "soon"            — блок только для этого города или статуса (soon-блоки в HTML — hidden);
     data-city-set="moscow"                                — кнопка «переключить город»;
     data-city-href                                        — ссылка на вторую марку: к адресу добавится ?city=, если город не основной.
   Без JS страница остаётся московской, как сейчас. При prefers-reduced-motion барабан не крутится. */
(function () {
  'use strict';
  // Данные городов. Новый город: строка здесь + блоки страниц; дела — только настоящие (status "soon", пока их нет).
  var CITIES = [
    { id: 'moscow', status: 'live', name: 'Москва', dat: 'Москве', loc: 'Москве', gen: 'Москвы', adj: 'московские', up: 'МОСКВА',
      tz: ['Europe/Moscow'], center: [55.7558, 37.6173] },
    { id: 'spb', status: 'soon', name: 'Петербург', dat: 'Петербургу', loc: 'Петербурге', gen: 'Петербурга', adj: 'петербургские', up: 'ПЕТЕРБУРГ',
      tz: ['Europe/Moscow'], center: [59.9386, 30.3141] }
  ];
  var KEY = 'dvorami:city', HINT = 'dvorami:city-hint';
  var BASE = CITIES[0];
  var root = document.documentElement;
  var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  function byId(id) { for (var i = 0; i < CITIES.length; i++) if (CITIES[i].id === id) return CITIES[i]; return null; }
  function get(k) { try { return window.localStorage.getItem(k); } catch (e) { return null; } }
  function set(k, v) { try { window.localStorage.setItem(k, v); } catch (e) { /* без запоминания */ } }
  function track(goal, params) { try { if (typeof window.dvoramiTrack === 'function') window.dvoramiTrack(goal, params || {}); } catch (e) { /* без аналитики */ } }

  // ---------- какой город показать ----------
  function fromUrl() {
    var m = location.search.match(/[?&]city=([a-z-]+)/);
    if (m && byId(m[1])) return { c: byId(m[1]), how: 'url' };
    var seg = location.pathname.match(/\/(moscow|spb)\//);   // будущая схема /spb/ — город по адресу
    if (seg && byId(seg[1]) && document.body.hasAttribute('data-city-page')) return { c: byId(seg[1]), how: 'path' };
    return null;
  }
  function fromZone() {
    var tz = '';
    try { tz = Intl.DateTimeFormat().resolvedOptions().timeZone || ''; } catch (e) { return null; }
    var hit = CITIES.filter(function (c) { return c.tz.indexOf(tz) !== -1; });
    return hit.length === 1 ? hit[0] : null;   // один пояс на несколько городов — не угадываем
  }
  function detect() {
    var u = fromUrl();
    if (u) return u;
    var saved = byId(get(KEY));
    if (saved) return { c: saved, how: 'saved' };
    var z = fromZone();
    if (z) return { c: z, how: 'tz' };
    return { c: BASE, how: 'default' };
  }

  // ---------- применить город к странице ----------
  var cur = BASE, baseTitle = document.title;
  function swapForms(text, c) {
    ['gen', 'dat', 'name', 'up'].forEach(function (f) { if (BASE[f] !== c[f]) text = text.split(BASE[f]).join(c[f]); });
    return text;
  }
  function apply(c) {
    cur = c;
    root.setAttribute('data-city', c.id);
    root.setAttribute('data-city-status', c.status);
    document.title = swapForms(baseTitle, c);
    [].forEach.call(document.querySelectorAll('[data-city-form]'), function (el) {
      var v = c[el.getAttribute('data-city-form')];
      if (v) el.textContent = v;
    });
    [].forEach.call(document.querySelectorAll('[data-city-only]'), function (el) {
      var want = el.getAttribute('data-city-only').split(/\s+/);
      el.hidden = !(want.indexOf(c.id) !== -1 || want.indexOf(c.status) !== -1);
    });
    [].forEach.call(document.querySelectorAll('a[data-city-href]'), function (a) {
      var href = a.getAttribute('data-city-href') || a.getAttribute('href').replace(/\?city=[a-z-]+/, '');
      a.setAttribute('data-city-href', href);
      a.setAttribute('href', c.id === BASE.id ? href : href + (href.indexOf('?') === -1 ? '?' : '&') + 'city=' + c.id);
    });
    drums.forEach(function (d) { d.show(c, false); });
  }
  function choose(c, how) {
    if (!c || c === cur) { closeAll(); return; }
    set(KEY, c.id);
    track('city_select', { city: c.id, how: how || 'list' });
    drums.forEach(function (d) { d.show(c, true); });
    apply(c);
    closeAll();
  }

  // ---------- барабан в заголовке ----------
  var drums = [];
  function closeAll(except) { drums.forEach(function (d) { if (d !== except) d.close(); }); }
  function Drum(host) {
    var form = host.getAttribute('data-form') || 'name';
    host.classList.add('city-drum');
    host.textContent = '';
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'city-btn';
    btn.setAttribute('aria-haspopup', 'listbox');
    btn.setAttribute('aria-expanded', 'false');
    var win = document.createElement('span'); win.className = 'city-win'; win.setAttribute('aria-hidden', 'true');
    var reel = document.createElement('span'); reel.className = 'city-reel';
    CITIES.forEach(function (c) { var s = document.createElement('span'); s.textContent = c[form]; reel.appendChild(s); });
    win.appendChild(reel);
    var sr = document.createElement('span'); sr.className = 'visually-hidden';
    btn.appendChild(win); btn.appendChild(sr);
    btn.insertAdjacentHTML('beforeend', '<svg class="city-chev" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="m6 9 6 6 6-6"/></svg>');
    var list = document.createElement('div');
    list.className = 'city-pop'; list.hidden = true;
    var ul = '<ul role="listbox" aria-label="Город">';
    CITIES.forEach(function (c) {
      ul += '<li role="option" tabindex="-1" data-id="' + c.id + '"><span>' + c.name + '</span>' + (c.status === 'soon' ? '<small>скоро</small>' : '') + '</li>';
    });
    ul += '</ul>' + (navigator.geolocation ? '<button type="button" class="city-geo">Рядом со мной</button>' : '');
    list.innerHTML = ul;
    host.appendChild(btn); host.appendChild(list);
    var items = [].slice.call(list.querySelectorAll('[role="option"]'));
    var self = this;
    this.show = function (c, animate) {
      var i = CITIES.indexOf(c), item = reel.children[i];
      reel.classList.toggle('is-still', !animate || reduce);
      reel.style.setProperty('--i', i);
      win.style.width = item.getBoundingClientRect().width + 'px';
      sr.textContent = c[form] + ' — сменить город';
      items.forEach(function (li) { li.setAttribute('aria-selected', String(li.getAttribute('data-id') === c.id)); });
    };
    this.open = function () {
      closeAll(self);
      list.hidden = false; btn.setAttribute('aria-expanded', 'true');
      list.classList.remove('to-left');
      var r = list.getBoundingClientRect();
      if (r.right > (window.innerWidth || 0) - 8) list.classList.add('to-left');
      var sel = list.querySelector('[aria-selected="true"]') || items[0];
      sel.focus();
    };
    this.close = function () { if (!list.hidden) { list.hidden = true; btn.setAttribute('aria-expanded', 'false'); } };
    btn.addEventListener('click', function () { if (list.hidden) self.open(); else self.close(); });
    list.addEventListener('click', function (e) {
      var li = e.target.closest('[role="option"]');
      if (li) { choose(byId(li.getAttribute('data-id')), 'list'); btn.focus(); }
      if (e.target.closest('.city-geo')) near(self, btn);
    });
    list.addEventListener('keydown', function (e) {
      var i = items.indexOf(document.activeElement);
      if (e.key === 'Escape') { self.close(); btn.focus(); e.preventDefault(); }
      else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { var j = (i + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length; items[j].focus(); e.preventDefault(); }
      else if ((e.key === 'Enter' || e.key === ' ') && i !== -1) { choose(byId(items[i].getAttribute('data-id')), 'list'); btn.focus(); e.preventDefault(); }
    });
    // намёк, что город можно сменить: один раз на устройство барабан прокручивается к следующему городу и обратно
    this.hint = function () {
      if (reduce || get(HINT)) return;
      set(HINT, '1');
      var i = CITIES.indexOf(cur), j = (i + 1) % CITIES.length;
      setTimeout(function () {
        if (!list.hidden) return;
        reel.classList.remove('is-still');
        reel.style.setProperty('--i', j);
        win.style.width = reel.children[j].getBoundingClientRect().width + 'px';
        setTimeout(function () { self.show(cur, true); }, 900);
      }, 1400);
    };
  }
  function near(d, btn) {
    var b = btn.parentNode.querySelector('.city-geo');
    if (b) b.textContent = 'Определяем…';
    navigator.geolocation.getCurrentPosition(function (pos) {
      var la = pos.coords.latitude, lo = pos.coords.longitude, best = null, bd = 1e9;
      CITIES.forEach(function (c) {
        var dy = (c.center[0] - la) * 111, dx = (c.center[1] - lo) * 111 * Math.cos(la * Math.PI / 180), dd = Math.sqrt(dx * dx + dy * dy);
        if (dd < bd) { bd = dd; best = c; }
      });
      if (b) b.textContent = bd < 150 ? 'Рядом со мной' : 'Рядом пока нет наших городов';
      if (best && bd < 150) { choose(best, 'geo'); btn.focus(); }
    }, function () { if (b) b.textContent = 'Не получилось — выберите из списка'; }, { maximumAge: 600000, timeout: 10000 });
  }

  document.addEventListener('click', function (e) { if (!e.target.closest('.city-drum')) closeAll(); });
  document.addEventListener('click', function (e) {
    var b = e.target.closest('[data-city-set]');
    if (b) { e.preventDefault(); choose(byId(b.getAttribute('data-city-set')), 'button'); var d = document.querySelector('.city-btn'); if (d) d.scrollIntoView({ block: 'center', behavior: reduce ? 'auto' : 'smooth' }); }
  });

  [].forEach.call(document.querySelectorAll('[data-city-drum]'), function (h) { drums.push(new Drum(h)); });
  var start = detect();
  if (start.how === 'url' || start.how === 'path') set(KEY, start.c.id);
  apply(start.c);
  // шрифты догрузились — ширина окошка барабана по настоящему слову
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(function () { drums.forEach(function (d) { d.show(cur, false); }); });
  drums.forEach(function (d) { d.hint(); });
  window.__dvoramiCity = { cities: CITIES, current: function () { return cur.id; }, choose: function (id) { choose(byId(id), 'test'); } };
})();

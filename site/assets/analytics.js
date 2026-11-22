/* Дворами — аналитика (Яндекс Метрика). Подключение: docs/analytics.md.
   Пока YM_ID пустой — ничего не загружается, cookie не ставятся, баннер не показывается;
   track() просто ничего не делает (с ?debug=analytics пишет события в консоль).

   API: window.dvoramiTrack(event, params) — цель Метрики (reachGoal).
   Разметка: data-track="cta_buy" на кнопке/ссылке → цель при клике;
             data-track-<имя>="значение" → параметры цели (data-track-place="hero" → {place: 'hero'});
             <details data-track="faq_open"> → цель при раскрытии;
             <form data-track="form_submit"> → цель при отправке;
             ссылки на t.me без data-track → цель tg_click автоматически.
   Согласие на cookie (152-ФЗ): CONSENT = 'opt-in' — Метрика грузится только после «Согласен»;
   'notice' — грузится сразу, баннер лишь информирует. Выбор — за владельцем (docs/analytics.md). */
(function () {
  'use strict';

  var YM_ID = '';              // номер счётчика из metrika.yandex.ru, например '98765432'. Пусто — аналитика выключена
  var CONSENT = 'opt-in';      // 'opt-in' | 'notice'
  var WEBVISOR = false;        // запись сессий. Включать только после согласования текста политики (записывает ввод)
  var POLICY_URL = '/privacy/'; // страница политики обработки персональных данных (поправить, когда появится)
  var CONSENT_KEY = 'dvorami:consent';

  var DEBUG = /[?&]debug=analytics(&|$)/.test(location.search);
  var LOCAL = location.protocol === 'file:' || /^(localhost|127\.0\.0\.1|0\.0\.0\.0)$/.test(location.hostname);
  var loaded = false;
  var queue = [];

  function store(k, v) {
    try {
      if (v === undefined) return window.localStorage.getItem(k);
      window.localStorage.setItem(k, v);
    } catch (e) { return null; }
    return null;
  }

  function track(event, params) {
    if (!event) return;
    params = params || {};
    if (DEBUG && window.console) console.log('[analytics]', event, params);
    if (!YM_ID) return;
    if (!loaded) { if (queue.length < 50) queue.push([event, params]); return; }
    try { window.ym(Number(YM_ID), 'reachGoal', event, params); } catch (e) { /* без аналитики */ }
  }
  window.dvoramiTrack = track;

  function load() {
    if (loaded || !YM_ID || LOCAL) return;
    loaded = true;
    /* Официальный код счётчика Метрики (metrika.yandex.ru → «Код счётчика»), без <noscript>-пикселя */
    (function (m, e, t, r, i, k, a) {
      m[i] = m[i] || function () { (m[i].a = m[i].a || []).push(arguments); };
      m[i].l = 1 * new Date();
      k = e.createElement(t); a = e.getElementsByTagName(t)[0];
      k.async = 1; k.src = r; a.parentNode.insertBefore(k, a);
    })(window, document, 'script', 'https://mc.yandex.ru/metrika/tag.js', 'ym');
    window.ym(Number(YM_ID), 'init', {
      clickmap: true, trackLinks: true, accurateTrackBounce: true, webvisor: WEBVISOR
    });
    var q = queue; queue = [];
    q.forEach(function (e) { track(e[0], e[1]); });
  }

  // ---------- согласие на cookie ----------
  function banner() {
    var box = document.createElement('div');
    box.className = 'dv-consent';
    box.setAttribute('role', 'region');
    box.setAttribute('aria-label', 'Cookie');
    box.innerHTML = '<p>Мы используем cookie и Яндекс Метрику, чтобы понимать, что на сайте работает, а что нет. ' +
      '<a href="' + POLICY_URL + '">Подробнее</a></p><div>' +
      (CONSENT === 'opt-in' ? '<button type="button" data-consent="no">Отказаться</button>' : '') +
      '<button type="button" data-consent="yes">' + (CONSENT === 'opt-in' ? 'Согласен' : 'Понятно') + '</button></div>';
    var css = document.createElement('style');
    css.textContent = '.dv-consent{position:fixed;left:8px;right:8px;bottom:8px;z-index:50;max-width:520px;margin:0 auto;' +
      'padding:12px 14px;background:#141414;color:#F2EFE8;border-top:3px solid #E1251B;font:400 14px/1.4 system-ui,sans-serif;' +
      'box-shadow:0 4px 16px rgba(0,0,0,.35)}.dv-consent a{color:#FF5A4E}.dv-consent div{display:flex;gap:8px;margin-top:10px}' +
      '.dv-consent button{flex:1;min-height:44px;border:2px solid #9A968E;background:transparent;color:inherit;font:600 15px/1 system-ui,sans-serif;cursor:pointer}' +
      '.dv-consent button[data-consent="yes"]{background:#C81E17;border-color:#C81E17}';
    document.head.appendChild(css);
    document.body.appendChild(box);
    box.addEventListener('click', function (e) {
      var b = e.target.closest('[data-consent]');
      if (!b) return;
      var yes = b.getAttribute('data-consent') === 'yes';
      store(CONSENT_KEY, yes ? 'yes' : 'no');
      box.remove();
      if (yes) load(); else queue = [];
    });
  }

  function init() {
    if (!YM_ID || LOCAL) return;     // нет счётчика или локальная проверка — ничего не грузим
    var c = store(CONSENT_KEY);
    if (CONSENT === 'notice') { load(); if (!c) banner(); return; }
    if (c === 'yes') load();
    else if (c !== 'no') banner();
  }

  // ---------- делегирование кликов ----------
  function paramsOf(el) {
    var p = {};
    for (var i = 0; i < el.attributes.length; i++) {
      var a = el.attributes[i];
      if (a.name.indexOf('data-track-') === 0) p[a.name.slice(11).replace(/-([a-z])/g, function (m, c) { return c.toUpperCase(); })] = a.value;
    }
    p.page = location.pathname;
    return p;
  }
  document.addEventListener('click', function (e) {
    var el = e.target.closest && e.target.closest('[data-track], a[href*="t.me/"]');
    if (!el || el.tagName === 'DETAILS' || el.tagName === 'FORM') return;
    if (el.closest('details[data-track]') && e.target.closest('summary')) return;   // FAQ считаем по раскрытию
    var name = el.getAttribute('data-track') || 'tg_click';
    var p = paramsOf(el);
    if (el.tagName === 'A' && el.href) p.href = el.href.split('?')[0];
    track(name, p);
  }, true);
  document.addEventListener('toggle', function (e) {
    var d = e.target;
    if (d && d.tagName === 'DETAILS' && d.open && d.hasAttribute('data-track')) {
      var p = paramsOf(d);
      var s = d.querySelector('summary');
      if (s && !p.q) p.q = s.textContent.trim().slice(0, 80);
      track(d.getAttribute('data-track'), p);
    }
  }, true);
  document.addEventListener('submit', function (e) {
    var f = e.target;
    if (f && f.hasAttribute && f.hasAttribute('data-track')) track(f.getAttribute('data-track'), paramsOf(f));
  }, true);

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();

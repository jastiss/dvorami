/* Дворами — аналитика (Яндекс Метрика) и согласие на cookie. Подключение, цели и проверка: docs/analytics.md.
   Юридическая часть (152-ФЗ): docs/legal/checklist.md, страницы /legal/privacy/ и /legal/consent/.

   Как это работает коротко:
   1. Счётчик выбирается по адресу сайта (боевой домен или стенд) — таблица YM_ID_* ниже.
   2. Пока посетитель не нажал «Согласен», НЕ загружается tag.js, не ставятся cookie и не уходит
      ни один запрос к mc.yandex.ru. События до согласия складываются в очередь в памяти и пропадают
      при отказе. Решение хранится в localStorage (не в cookie), ключ CONSENT_KEY.
   3. Отказ можно изменить: на странице политики есть кнопка «Настройки cookie»
      (`<button data-consent-reset>`) — она сбрасывает решение и снова показывает плашку.
      Текущее состояние подставляется в элемент `<span data-consent-state>`.

   API: window.dvoramiTrack(event, params) — цель Метрики (reachGoal).
   Разметка: data-track="cta_buy" на кнопке/ссылке → цель при клике;
             data-track-<имя>="значение" → параметры цели (data-track-place="hero" → {place: 'hero'});
             <details data-track="faq_open"> → цель при раскрытии;
             <form data-track="form_submit"> → цель при отправке;
             ссылки на t.me без data-track → цель tg_click автоматически.

   Отладка (локально и в тестах): ?debug=analytics — события пишутся в консоль;
   ?analytics=on — включить загрузку счётчика на localhost (по умолчанию выключена);
   ?debug=analytics&host=dvorami.ru — проверить, какой счётчик выберется для этого адреса.
   Автотест: node scripts/consent_check.js (плашка, отсутствие запросов до согласия, номер счётчика). */
(function () {
  'use strict';

  /* ---------- настройки: меняются только здесь ---------- */

  /* Счётчики Метрики. Владелец создал два (23.11.2026) и не указал, какой для какого адреса.
     Распределение ниже — ПРЕДПОЛОЖЕНИЕ команды (вопрос владельцу — в APPROVALS.md).
     Если окажется наоборот — поменять значения двух строк местами, больше ничего не трогать. */
  var YM_ID_PROD  = '114590802';                      // боевой домен dvorami.ru и www.dvorami.ru
  var YM_ID_STAND = '114590642';                      // тестовый стенд jastiss.github.io и любой другой адрес
  var PROD_HOSTS  = ['dvorami.ru', 'www.dvorami.ru']; // адреса, которые считаем боевыми

  var CONSENT = 'opt-in';          // 'opt-in' — грузим только после «Согласен»; 'notice' — грузим сразу, плашка информирует.
                                   // Менять только после ответа юриста (docs/legal/checklist.md, пункт 1.3)
  var WEBVISOR_ALLOWED = true;     // запись действий на странице. Описана в политике: /legal/privacy/, раздел «Запись действий».
                                   // Работает только после согласия (CONSENT = 'opt-in')
  var WEBVISOR_SKIP = /\/play\//;  // ...но не в плеере квеста: там игрок вводит ответы на загадки и текст «Что-то не так?»
  var CONSENT_KEY = 'dvorami:consent';

  /* ---------- вычисляемое ---------- */

  var DEBUG = /[?&]debug=analytics(&|$)/.test(location.search);
  var FORCE = /[?&]analytics=on(&|$)/.test(location.search);   // включить аналитику на localhost (только для проверки)
  var LOCAL = !FORCE && (location.protocol === 'file:' ||
    /^(localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\])$/.test(location.hostname));

  /* Адрес, по которому выбираем счётчик. Подмена хоста — только в режиме отладки (для автотеста). */
  var hostOverride = DEBUG && (location.search.match(/[?&]host=([^&#]+)/) || [])[1];
  var HOST = (hostOverride ? decodeURIComponent(hostOverride) : location.hostname).toLowerCase();
  var YM_ID = PROD_HOSTS.indexOf(HOST) >= 0 ? YM_ID_PROD : YM_ID_STAND;

  var WEBVISOR = WEBVISOR_ALLOWED && !WEBVISOR_SKIP.test(location.pathname);

  /* Адрес политики: сайт живёт и в подпапке (/dvorami/ на GitHub Pages), и в корне домена,
     поэтому путь считаем от адреса самого analytics.js (<корень>/assets/analytics.js). */
  function siteRoot() {
    var s = document.currentScript;
    if (!s) {
      var all = document.getElementsByTagName('script');
      for (var i = all.length - 1; i >= 0; i--) {
        if (/\/assets\/analytics\.js(\?|#|$)/.test(all[i].src || '')) { s = all[i]; break; }
      }
    }
    var m = (s && s.src ? s.src : '').match(/^(.*\/)assets\/analytics\.js(?:[?#].*)?$/);
    return m ? m[1] : location.pathname.replace(/[^/]*$/, '');
  }
  var ROOT = siteRoot();
  var POLICY_URL = ROOT + 'legal/privacy/';

  var loaded = false;
  var queue = [];

  function store(k, v) {
    try {
      if (v === undefined) return window.localStorage.getItem(k);
      if (v === null) window.localStorage.removeItem(k);
      else window.localStorage.setItem(k, v);
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

  // Откуда пришёл посетитель по нашей ссылке: ?from=card — открытка «Дело раскрыто» из плеера (H-63).
  // Метка живёт до конца сессии вкладки (согласие на cookie могут дать на следующей странице) и уходит в Метрику
  // параметром визита { from: … } — отчёт «Параметры визитов», цель заводить не нужно. Только [a-z0-9_-], до 32 знаков.
  var FROM_KEY = 'dvorami:from';
  var FROM = (location.search.match(/[?&]from=([a-z0-9_-]{1,32})(?:&|$)/) || [])[1] || '';
  try { if (FROM) window.sessionStorage.setItem(FROM_KEY, FROM); else FROM = window.sessionStorage.getItem(FROM_KEY) || ''; } catch (e) { /* без хранилища */ }
  if (!/^[a-z0-9_-]{1,32}$/.test(FROM)) FROM = '';

  function load() {
    if (loaded || !YM_ID || LOCAL) return;
    loaded = true;
    window.dataLayer = window.dataLayer || [];   // для параметра ecommerce
    /* Официальный код счётчика Метрики (metrika.yandex.ru → «Код счётчика»), без <noscript>-пикселя */
    (function (m, e, t, r, i, k, a) {
      m[i] = m[i] || function () { (m[i].a = m[i].a || []).push(arguments); };
      m[i].l = 1 * new Date();
      k = e.createElement(t); a = e.getElementsByTagName(t)[0];
      k.async = 1; k.src = r; a.parentNode.insertBefore(k, a);
    })(window, document, 'script', 'https://mc.yandex.ru/metrika/tag.js', 'ym');
    /* Параметры — как в сниппете счётчика у владельца (23.11.2026) */
    window.ym(Number(YM_ID), 'init', {
      ssr: true,
      webvisor: WEBVISOR,
      clickmap: true,
      ecommerce: 'dataLayer',
      accurateTrackBounce: true,
      trackLinks: true
    });
    if (DEBUG && window.console) console.log('[analytics] счётчик', YM_ID, 'host', HOST, 'webvisor', WEBVISOR);
    if (FROM) {
      if (DEBUG && window.console) console.log('[analytics] params', { from: FROM });
      try { window.ym(Number(YM_ID), 'params', { from: FROM }); } catch (e) { /* без аналитики */ }
    }
    var q = queue; queue = [];
    q.forEach(function (e) { track(e[0], e[1]); });
  }

  // ---------- согласие на cookie (152-ФЗ) ----------
  var STATE_TEXT = {
    yes: 'Сейчас: вы согласились на cookie для статистики.',
    no: 'Сейчас: вы отказались — Метрика не загружается, cookie не ставятся.',
    none: 'Сейчас: вы ещё не ответили — Метрика не загружается до согласия.'
  };

  function showState() {
    var c = store(CONSENT_KEY);
    var txt = STATE_TEXT[c === 'yes' ? 'yes' : (c === 'no' ? 'no' : 'none')];
    Array.prototype.forEach.call(document.querySelectorAll('[data-consent-state]'), function (el) {
      el.textContent = txt;
    });
  }

  function banner() {
    if (document.querySelector('.dv-consent')) return;
    var box = document.createElement('div');
    box.className = 'dv-consent';
    box.setAttribute('role', 'region');
    box.setAttribute('aria-label', 'Cookie и статистика');
    box.innerHTML = '<p>Сайт использует cookie, чтобы понимать, что работает, а что нет. ' +
      '<a href="' + POLICY_URL + '">Подробнее</a></p><div>' +
      (CONSENT === 'opt-in' ? '<button type="button" data-consent="no">Отказаться</button>' : '') +
      '<button type="button" data-consent="yes">' + (CONSENT === 'opt-in' ? 'Согласен' : 'Понятно') + '</button></div>';
    if (!document.getElementById('dv-consent-css')) {
      var css = document.createElement('style');
      css.id = 'dv-consent-css';
      /* Цвета — токены сайта (site/assets/style.css) с запасными значениями: плашка живёт и в плеере */
      css.textContent = '.dv-consent{position:fixed;left:8px;right:8px;bottom:8px;z-index:60;max-width:560px;margin:0 auto;' +
        'padding:14px 16px;border-radius:12px;background:var(--surface,#17224A);color:var(--text,#F3F1EA);' +
        'border-top:3px solid var(--accent,#FFC53D);font:400 14px/1.45 system-ui,-apple-system,"Segoe UI",sans-serif;' +
        'box-shadow:0 6px 24px rgba(0,0,0,.45)}' +
        '.dv-consent p{margin:0}.dv-consent a{color:var(--accent,#FFC53D)}' +
        '.dv-consent div{display:flex;gap:8px;margin-top:12px}' +
        '.dv-consent button{flex:1;min-height:44px;padding:8px 12px;border-radius:8px;border:2px solid var(--control,#5A6BA6);' +
        'background:transparent;color:inherit;font:600 15px/1.2 system-ui,-apple-system,"Segoe UI",sans-serif;cursor:pointer}' +
        '.dv-consent button[data-consent="yes"]{background:var(--accent,#FFC53D);border-color:var(--accent,#FFC53D);color:var(--on-accent,#0E1630)}' +
        '@media (min-width:600px){.dv-consent{padding:16px 18px}.dv-consent div{margin-top:10px}.dv-consent button{flex:0 0 auto;min-width:150px}}';
      document.head.appendChild(css);
    }
    document.body.appendChild(box);
    box.addEventListener('click', function (e) {
      var b = e.target.closest && e.target.closest('[data-consent]');
      if (!b) return;
      var yes = b.getAttribute('data-consent') === 'yes';
      store(CONSENT_KEY, yes ? 'yes' : 'no');
      box.remove();
      showState();
      if (yes) load(); else queue = [];
    });
  }

  /* «Настройки cookie» на странице политики: сбросить решение и спросить заново */
  function wireSettings() {
    document.addEventListener('click', function (e) {
      var b = e.target.closest && e.target.closest('[data-consent-reset]');
      if (!b) return;
      e.preventDefault();
      store(CONSENT_KEY, null);
      showState();
      banner();
    }, false);
  }

  function init() {
    wireSettings();
    showState();
    if (!YM_ID || LOCAL) return;     // нет счётчика или локальная проверка — ничего не грузим и не спрашиваем
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

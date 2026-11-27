/* «Следами»: лампа в блоке «Проба». Без JS и при prefers-reduced-motion строка видна сразу (см. sledami.css).
   Ничего не сохраняем. A-81: обезличенная цель Метрики probe_reveal (how: button | light) — один раз за открытие
   страницы, через analytics.js и только после согласия на cookie. */
(function () {
  'use strict';
  var sheet = document.querySelector('[data-lamp]');
  if (!sheet) return;
  var ink = sheet.querySelector('.ink');
  var btn = sheet.querySelector('.lamp-btn');
  var raf = 0, last = null, timer = 0, sent = false, links = ink ? ink.querySelectorAll('a') : [];
  function reveal(how) { if (sent) return; sent = true; if (window.dvoramiTrack) window.dvoramiTrack('probe_reveal', { brand: 'sledami', how: how }); }
  // пока строка не освещена, ссылка в ней не ловит Tab (без JS и при reduced-motion строка видна — ссылка как обычно)
  function tab(on) { for (var i = 0; i < links.length; i++) on ? links[i].removeAttribute('tabindex') : links[i].setAttribute('tabindex', '-1'); }
  if (!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches)) tab(false);
  function place() {
    raf = 0;
    if (!last || !ink) return;
    var s = sheet.getBoundingClientRect(), i = ink.getBoundingClientRect();
    sheet.style.setProperty('--gx', (last.x - s.left) + 'px');
    sheet.style.setProperty('--gy', (last.y - s.top) + 'px');
    ink.style.setProperty('--lx', (last.x - i.left) + 'px');
    ink.style.setProperty('--ly', (last.y - i.top) + 'px');
    // свет задержался на строке — ответ проявлен (как на главной: 0,7 с)
    if (!timer && !sent && last.x > i.left && last.x < i.right && last.y > i.top && last.y < i.bottom) timer = setTimeout(function () { reveal('light'); }, 700);
  }
  function move(e) {
    last = { x: e.clientX, y: e.clientY };
    if (!raf) raf = window.requestAnimationFrame(place);
  }
  sheet.addEventListener('pointermove', move);
  sheet.addEventListener('pointerdown', move);
  // свет включён — ссылка снова в Tab-порядке, фокус переходит на строку (кнопка исчезает, фокус не теряется)
  if (btn) btn.addEventListener('click', function () { sheet.classList.add('is-lit'); tab(true); reveal('button'); if (links[0]) links[0].focus(); });
})();

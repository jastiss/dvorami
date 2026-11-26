/* «Следами»: лампа в блоке «Проба». Без JS и при prefers-reduced-motion строка видна сразу (см. sledami.css).
   Ничего не сохраняем и никуда не отправляем. */
(function () {
  'use strict';
  var sheet = document.querySelector('[data-lamp]');
  if (!sheet) return;
  var ink = sheet.querySelector('.ink');
  var btn = sheet.querySelector('.lamp-btn');
  var raf = 0, last = null;
  function place() {
    raf = 0;
    if (!last || !ink) return;
    var s = sheet.getBoundingClientRect(), i = ink.getBoundingClientRect();
    sheet.style.setProperty('--gx', (last.x - s.left) + 'px');
    sheet.style.setProperty('--gy', (last.y - s.top) + 'px');
    ink.style.setProperty('--lx', (last.x - i.left) + 'px');
    ink.style.setProperty('--ly', (last.y - i.top) + 'px');
  }
  function move(e) {
    last = { x: e.clientX, y: e.clientY };
    if (!raf) raf = window.requestAnimationFrame(place);
  }
  sheet.addEventListener('pointermove', move);
  sheet.addEventListener('pointerdown', move);
  if (btn) btn.addEventListener('click', function () { sheet.classList.add('is-lit'); });
})();

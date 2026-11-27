/* Главная: фонарик в «Пробе». Без JS и при reduced-motion ответ виден сразу (style.css). Ничего не сохраняем и не отправляем. */
(function () {
  var box = document.querySelector('[data-lamp]');
  if (!box) return;
  var inks = box.querySelectorAll('.ink'), ans = box.querySelector('.lamp-a .ink'), next = box.querySelector('.lamp-next a');
  var raf = 0, pt, timer, links = ans ? ans.querySelectorAll('a') : [];
  // ссылка в неосвещённом ответе не ловит Tab (при reduced-motion ответ виден — ссылка как обычно)
  function tab(on) { for (var i = 0; i < links.length; i++) on ? links[i].removeAttribute('tabindex') : links[i].setAttribute('tabindex', '-1'); }
  if (!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches)) tab(false);
  function at(el, x, y) { var r = el.getBoundingClientRect(); el.style.setProperty(x, pt.x - r.left + 'px'); el.style.setProperty(y, pt.y - r.top + 'px'); return r; }
  function place() {
    raf = 0;
    at(box, '--gx', '--gy');
    for (var i = 0; i < inks.length; i++) {
      var r = at(inks[i], '--lx', '--ly');
      // свет задержался на ответе — показываем следующий шаг
      if (inks[i] === ans && !timer && pt.x > r.left && pt.x < r.right && pt.y > r.top && pt.y < r.bottom) timer = setTimeout(function () { box.classList.add('is-found'); }, 700);
    }
  }
  function move(e) { pt = { x: e.clientX, y: e.clientY }; if (!raf) raf = requestAnimationFrame(place); }
  function light() { box.classList.add('is-lit', 'is-found'); tab(true); }
  box.addEventListener('pointermove', move);
  box.addEventListener('pointerdown', move);
  box.querySelector('.lamp-btn').addEventListener('click', function () { light(); if (next) next.focus(); });
})();

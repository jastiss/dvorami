/* Дворами: минимум JS. Без него сайт полностью читается; JS добавляет только «живость». */
(function () {
  'use strict';
  var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // Длина рисованных линий — для анимации «от руки»
  document.querySelectorAll('.draw path, .draw ellipse').forEach(function (p) {
    if (p.getTotalLength) {
      try { p.style.setProperty('--len', Math.ceil(p.getTotalLength() + 2)); } catch (e) {}
    }
  });

  // Телеграмма печатается по буквам
  document.querySelectorAll('[data-type]').forEach(function (el) {
    var text = el.textContent; el.setAttribute('aria-label', text); el.textContent = '';
    Array.prototype.forEach.call(text, function (ch, i) {
      var s = document.createElement('span'); s.className = 'ch'; s.setAttribute('aria-hidden', 'true');
      s.style.setProperty('--c', i); s.textContent = ch; el.appendChild(s);
    });
  });

  // Появление при прокрутке
  var targets = document.querySelectorAll('.draw, .rise, [data-reveal]');
  if (!('IntersectionObserver' in window) || reduce) {
    targets.forEach(function (t) { t.classList.add('in-view'); });
  } else {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) { if (e.isIntersecting) { e.target.classList.add('in-view'); io.unobserve(e.target); } });
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0.05 });
    targets.forEach(function (t) { io.observe(t); });
  }

  // Мини-загадка «Улица Родченко»: соберите слово из четырёх букв
  var clue = document.getElementById('clue');
  if (clue) {
    var letters = clue.querySelectorAll('.letter');
    var slots = clue.querySelectorAll('.slot');
    var msg = clue.querySelector('.answer-msg');
    var reset = clue.querySelector('.answer-reset');
    var picked = [];
    var RIGHT = 'ОКНО'; // ответ не светим в разметке
    function render() {
      slots.forEach(function (s, i) { s.textContent = picked[i] ? picked[i].textContent : ''; });
      reset.hidden = picked.length === 0;
    }
    function clear() {
      picked.forEach(function (b) { b.setAttribute('aria-pressed', 'false'); b.disabled = false; });
      picked = []; render(); msg.textContent = 'Нажмите четыре буквы';
    }
    letters.forEach(function (b) {
      b.addEventListener('click', function () {
        if (b.getAttribute('aria-pressed') === 'true' || picked.length >= 4) return;
        b.setAttribute('aria-pressed', 'true'); picked.push(b); render();
        if (picked.length < 4) { msg.textContent = 'Ещё ' + (4 - picked.length); return; }
        var word = picked.map(function (x) { return x.textContent; }).join('');
        if (word === RIGHT) {
          msg.innerHTML = '<span class="stamp-ok">верно!</span> На точке вас ждёт ещё «Думай».';
          letters.forEach(function (x) { x.disabled = true; });
        } else {
          msg.textContent = 'Не то слово. Ещё раз?';
          if (!reduce) { clue.classList.remove('wiggle'); void clue.offsetWidth; clue.classList.add('wiggle'); }
        }
      });
    });
    reset.addEventListener('click', clear);
  }
})();

/* Дворами: минимум JS. Без него сайт полностью читается; JS добавляет только «живость». */
(function () {
  'use strict';

  // Ссылки на Telegram — в одном месте. HTML уже содержит эти адреса (сайт работает и без JS),
  // а здесь их можно поменять разом: например, когда появится бот, впишите его адрес в suggest и review.
  // Элемент получает адрес по атрибуту data-tg="channel|suggest|review".
  var TG = {
    channel: 'https://t.me/dvorami_quest',
    suggest: 'https://t.me/dvorami_quest',  // «Предложите свой квест» → потом бот
    review: 'https://t.me/dvorami_quest'    // «Оставить отзыв» → потом бот
  };
  document.querySelectorAll('[data-tg]').forEach(function (a) {
    var url = TG[a.getAttribute('data-tg')];
    if (url) a.setAttribute('href', url);
  });

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

  // Реперные точки показываем вразнобой: порядок на странице не совпадает с маршрутом
  document.querySelectorAll('[data-shuffle]').forEach(function (list) {
    var items = Array.prototype.slice.call(list.children);
    for (var i = items.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1)); var t = items[i]; items[i] = items[j]; items[j] = t;
    }
    items.forEach(function (li) { list.appendChild(li); });
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

  // Мини-дело на главной: версию можно записать, но ответ сайт не раскрывает и не проверяет.
  // Ничего не сохраняем и никуда не отправляем.
  var form = document.getElementById('version');
  if (form) {
    var input = form.querySelector('input');
    var msg = form.parentNode.querySelector('.version-msg');
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var v = (input.value || '').trim();
      if (!v) { msg.textContent = 'Сначала напишите версию — хотя бы одно слово.'; input.focus(); return; }
      msg.innerHTML = '';
      var st = document.createElement('span'); st.className = 'stamp-ok'; st.textContent = 'записано';
      msg.appendChild(st);
      msg.appendChild(document.createTextNode('«' + v + '». Проверить версию можно только на месте: ответ ждёт у воды.'));
    });
  }

  // Картинки в «Искусстве вокруг»: блок с картинкой показываем, только когда файл загрузился
  document.querySelectorAll('.art-img img').forEach(function (img) {
    var box = img.closest('.art-img'), card = img.closest('.art');
    function ok() { box.classList.add('is-loaded'); if (card) card.classList.add('has-img'); }
    if (img.complete && img.naturalWidth > 0) ok();
    img.addEventListener('load', ok);
  });

  // Каталог дел: фильтр по статусу. Без JS видны все карточки, кнопки фильтра скрыты.
  document.querySelectorAll('[data-filter-group]').forEach(function (group) {
    var grid = document.getElementById(group.getAttribute('data-filter-group'));
    if (!grid) return;
    var btns = group.querySelectorAll('button[data-filter]');
    btns.forEach(function (b) {
      b.addEventListener('click', function () {
        var f = b.getAttribute('data-filter');
        btns.forEach(function (x) { x.setAttribute('aria-pressed', x === b ? 'true' : 'false'); });
        grid.querySelectorAll('[data-status]').forEach(function (card) {
          card.hidden = !(f === 'all' || card.getAttribute('data-status') === f);
        });
      });
    });
  });
})();

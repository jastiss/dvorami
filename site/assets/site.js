/* Дворами: минимум JS. Без него сайт полностью читается; JS добавляет только «живость». */
(function () {
  'use strict';

  // Ссылки на Telegram — в одном месте. HTML уже содержит эти адреса (сайт работает и без JS),
  // а здесь их можно поменять разом: например, когда появится бот, впишите его адрес в suggest и review.
  // Элемент получает адрес по атрибуту data-tg="channel|suggest|review".
  var TG = {
    channel: 'https://t.me/dvorami_quest',
    suggest: 'https://t.me/dvorami_quest',  // «Предложите свой квест» → потом бот
    review: 'https://t.me/dvorami_quest',   // «Оставить отзыв» → потом бот
    want: 'https://t.me/dvorami_quest'      // «Хочу это дело» у дел в разработке → потом бот
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

  // Каталог дел: фильтр по статусу + «Показать все», когда дел больше LIMIT.
  // Без JS видны все карточки, кнопки фильтра скрыты.
  var LIMIT = 24; // до 24 дел видны сразу, дальше — «Показать все»
  document.querySelectorAll('[data-filter-group]').forEach(function (group) {
    var grid = document.getElementById(group.getAttribute('data-filter-group'));
    if (!grid) return;
    var btns = group.querySelectorAll('button[data-filter]');
    var more = grid.parentNode.querySelector('.qmore');
    var f = 'all', expanded = false;
    function apply() {
      var shown = 0, total = 0;
      grid.querySelectorAll('[data-status]').forEach(function (card) {
        var match = f === 'all' || card.getAttribute('data-status') === f;
        if (match) total++;
        card.hidden = !match || (!expanded && total > LIMIT);
        if (!card.hidden) shown++;
      });
      if (more) {
        more.hidden = total <= LIMIT || expanded;
        more.textContent = 'Показать все дела (' + total + ')';
      }
      grid.classList.toggle('qgrid--one', shown < 2);
    }
    btns.forEach(function (b) {
      b.addEventListener('click', function () {
        f = b.getAttribute('data-filter');
        btns.forEach(function (x) { x.setAttribute('aria-pressed', x === b ? 'true' : 'false'); });
        apply();
      });
    });
    if (more) more.addEventListener('click', function () {
      expanded = true; apply();
      var next = grid.querySelectorAll('[data-status]')[LIMIT];
      if (next) { var a = next.querySelector('a'); if (a) a.focus(); }
    });
    apply();
  });

  // Иллюстрации: если файла нет, остаётся оформленный фон обложки, а не значок битой картинки
  document.querySelectorAll('.qc-cover img, .gallery img, .hero-card img, .guide-places img').forEach(function (img) {
    function bad() { img.classList.add('is-broken'); }
    if (img.complete && img.naturalWidth === 0 && img.getAttribute('src')) bad();
    img.addEventListener('error', bad);
  });

  // Лента дел на телефоне: счётчик «3 / 8»
  var lane = document.getElementById('qgrid'), cnt = document.getElementById('qlane-count');
  if (lane && cnt) {
    var upd = function () {
      var items = lane.querySelectorAll(':scope > li:not([hidden])');
      if (!items.length) return;
      var w = items[0].getBoundingClientRect().width + 16;
      var i = Math.min(items.length, Math.round(lane.scrollLeft / w) + 1);
      cnt.textContent = i + ' / ' + items.length;
    };
    lane.addEventListener('scroll', function () { window.requestAnimationFrame(upd); }, { passive: true });
    upd();
  }

  // Плавающая кнопка «Выбрать квест»: видна, только когда на экране нет блока дел
  // и другого целевого действия ([data-cta]) и не виден подвал.
  var fab = document.getElementById('fab');
  if (fab && 'IntersectionObserver' in window) {
    var seen = new Set();
    var cta = document.querySelectorAll('[data-cta], .site-footer, .site-header');
    var fo = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) { if (e.isIntersecting) seen.add(e.target); else seen.delete(e.target); });
      var on = seen.size === 0;
      fab.classList.toggle('is-on', on);
      fab.setAttribute('aria-hidden', on ? 'false' : 'true');
      fab.tabIndex = on ? 0 : -1;
    }, { threshold: 0 });
    cta.forEach(function (el) { fo.observe(el); });
    // Пока читатель листает вниз, кнопка уходит и не закрывает текст; остановился или листает вверх — возвращается
    var lastY = window.scrollY, idle;
    window.addEventListener('scroll', function () {
      var y = window.scrollY;
      if (y > lastY + 4) fab.classList.add('is-away'); else if (y < lastY - 4) fab.classList.remove('is-away');
      lastY = y; clearTimeout(idle);
      idle = setTimeout(function () { fab.classList.remove('is-away'); }, 900);
    }, { passive: true });
  }
})();

/* Игровой бот. BOT — его имя без @ (например 'dvorami_quest_bot'). Пустая строка: кнопки
   «Оставить отзыв» и «Предложить район» ведут в канал, как задано выше. Имя задано: ведут в бота
   (https://t.me/<бот>?start=review|suggest), бот сразу начинает нужный диалог. */
(function () {
  'use strict';
  var BOT = '';
  if (!BOT) return;
  var START = { review: 'review', suggest: 'suggest' };
  document.querySelectorAll('[data-tg]').forEach(function (a) {
    var p = START[a.getAttribute('data-tg')];
    if (p) a.setAttribute('href', 'https://t.me/' + BOT + '?start=' + p);
  });
})();

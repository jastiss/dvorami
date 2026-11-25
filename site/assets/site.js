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


  // Карусели «Что вы увидите»: листаются пальцем, колесом и стрелками; счётчик «2 / 6»; на краю стрелка гаснет
  document.querySelectorAll('[data-carousel]').forEach(function (box) {
    var track = box.querySelector('.c-track');
    var prev = box.querySelector('[data-dir="-1"]'), next = box.querySelector('[data-dir="1"]');
    var count = box.querySelector('.c-car-count');
    if (!track) return;
    // После перемешивания Chrome «держит» прежнюю карточку привязки и уезжает в конец ленты — возвращаем в начало
    track.scrollLeft = 0; requestAnimationFrame(function () { track.scrollLeft = 0; });
    function step() { var li = track.children[0]; return li ? li.getBoundingClientRect().width + parseFloat(getComputedStyle(track).columnGap || 16) : track.clientWidth; }
    function upd() {
      var n = track.children.length, w = step();
      var first = Math.round(track.scrollLeft / w) + 1;
      var visible = Math.max(1, Math.round(track.clientWidth / w));
      var last = Math.min(n, first + visible - 1);
      if (count) count.textContent = (visible > 1 ? first + '–' + last : first) + ' / ' + n;
      var max = track.scrollWidth - track.clientWidth - 2;
      if (prev) prev.disabled = track.scrollLeft <= 2;
      if (next) next.disabled = track.scrollLeft >= max;
      box.classList.toggle('is-static', max <= 0);
    }
    [prev, next].forEach(function (b) {
      if (!b) return;
      b.addEventListener('click', function () {
        track.scrollBy({ left: step() * +b.getAttribute('data-dir'), behavior: reduce ? 'auto' : 'smooth' });
      });
    });
    track.addEventListener('keydown', function (e) {
      if (e.key === 'ArrowRight') { e.preventDefault(); track.scrollBy({ left: step(), behavior: 'smooth' }); }
      if (e.key === 'ArrowLeft') { e.preventDefault(); track.scrollBy({ left: -step(), behavior: 'smooth' }); }
    });
    track.addEventListener('scroll', function () { window.requestAnimationFrame(upd); }, { passive: true });
    window.addEventListener('resize', upd);
    upd();
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
    // Следим за самими кнопками внутри [data-cta], а не за блоком целиком: большой блок может быть на экране,
    // а его кнопка — нет, и тогда CTA пропадал (баг 22.11)
    var cta = document.querySelectorAll('[data-cta] a, [data-cta] button, a[data-cta], .site-footer, .site-header');
    var fo = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) { if (e.isIntersecting) seen.add(e.target); else seen.delete(e.target); });
      var on = seen.size === 0;
      fab.classList.toggle('is-on', on);
      fab.setAttribute('aria-hidden', on ? 'false' : 'true');
      fab.tabIndex = on ? 0 : -1;
    }, { threshold: 0 });
    cta.forEach(function (el) { fo.observe(el); });
    // Раньше кнопка пряталась, пока читатель листает вниз, и появлялась только при прокрутке вверх —
    // владелец принял это за баг (22.11). Теперь она видна всегда, когда на экране нет другого CTA.
  }
})();

/* Игровой бот. BOT — его имя без @ (например 'dvorami_quest_bot'). Пустая строка: кнопки
   «Оставить отзыв» и «Предложить район» ведут в канал, как задано выше. Имя задано: ведут в бота
   (https://t.me/<бот>?start=review|suggest), бот сразу начинает нужный диалог. */
(function () {
  'use strict';
  var BOT = 'dvorami_bot';
  if (!BOT) return;
  var START = { review: 'review', suggest: 'suggest' };
  document.querySelectorAll('[data-tg]').forEach(function (a) {
    var p = START[a.getAttribute('data-tg')];
    if (p) a.setAttribute('href', 'https://t.me/' + BOT + '?start=' + p);
  });
})();

/* Рейтинг дел: свежие настоящие оценки из assets/ratings.json (собирает scripts/build_ratings.py после новых
   отзывов в боте). Страница уже содержит рейтинг на момент сборки — это лишь обновление без пересборки.
   Меньше порога оценок — «Новое дело». Тот же вид, что в build_cases.py (rating_html). */
(function () {
  'use strict';
  var els = document.querySelectorAll('[data-rating]');
  var me = document.currentScript;
  if (!els.length || !me || !window.fetch) return;
  function plural(n, a, b, c) { n = Math.abs(n) % 100; return n > 10 && n < 15 ? c : n % 10 === 1 ? a : n % 10 > 1 && n % 10 < 5 ? b : c; }
  fetch(new URL('ratings.json', me.src).href, { cache: 'no-cache' }).then(function (r) { return r.ok ? r.json() : null; }).then(function (d) {
    if (!d || !d.cases) return;
    var min = d.threshold || 5;
    els.forEach(function (el) {
      var row = d.cases[el.getAttribute('data-rating')];
      if (!row) return;
      var n = row.count || 0;
      if (n < min || n <= 0) { el.innerHTML = '<span class="rating-new">Новое дело</span>'; return; }
      var avg = row.sum / n, v = avg.toFixed(2).replace('.', ',');
      el.innerHTML = '<span class="stars" role="img" aria-label="Оценка ' + v + ' из 5" style="--w:' + (avg / 5 * 100).toFixed(1) + '%"></span>' +
        '<span class="rating-v" aria-hidden="true">' + v + '</span><span class="rating-n">·&nbsp;' + n + '&nbsp;' + plural(n, 'оценка', 'оценки', 'оценок') + '</span>';
    });
  }).catch(function () { /* нет сети — остаётся рейтинг из сборки */ });
})();

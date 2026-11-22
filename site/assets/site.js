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

  // Каталог дел: фильтр по статусу + «Показать все», когда дел больше LIMIT.
  // Без JS видны все карточки, кнопки фильтра скрыты.
  var LIMIT = 6;
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

  // Карусель дел в первом экране. Источник данных — карточки каталога li[data-case]
  // (номер, короткое название, район, статус, ссылка). Новое дело = одна карточка в каталоге.
  // Листается свайпом (нативная прокрутка со снапом), стрелками и точками; клавиатура ←/→. Без автопрокрутки.
  var track = document.getElementById('cases-track');
  var cards = Array.prototype.slice.call(document.querySelectorAll('li[data-case]'));
  if (track && cards.length) {
    var box = track.parentNode;
    var ctrl = box.querySelector('.cases-ctrl');
    var dotsBox = box.querySelector('.cases-dots');
    var live = box.querySelector('.cases-status');
    var txt = function (root, sel) { var el = root.querySelector(sel); return el ? el.textContent.trim() : ''; };
    var mk = function (tag, cls, text) { var el = document.createElement(tag); if (cls) el.className = cls; if (text != null) el.textContent = text; return el; };
    cards.sort(function (a, b) { return (+a.getAttribute('data-case')) - (+b.getAttribute('data-case')); });
    track.innerHTML = '';
    var slides = cards.map(function (c, i) {
      var n = c.getAttribute('data-case'), name = c.getAttribute('data-name');
      var skin = (c.className.match(/qcard--(\w+)/) || [])[1] || 'avangard';
      var s = mk('article', 'case case--' + skin);
      s.id = 'case-' + n;
      s.setAttribute('aria-roledescription', 'слайд');
      s.setAttribute('aria-label', 'Дело №' + n + ' · ' + name + ' (' + (i + 1) + ' из ' + cards.length + ')');
      s.appendChild(mk('p', 'case-where', txt(c, '.qc-where')));
      var h = mk(i === 0 ? 'h2' : 'h3', 'case-title');
      h.appendChild(mk('span', 'case-no', 'Дело №' + n));
      h.appendChild(document.createTextNode(' '));
      var sep = h.appendChild(mk('span', 'case-sep', '·')); sep.setAttribute('aria-hidden', 'true');
      h.appendChild(document.createTextNode(' ' + name));
      s.appendChild(h);
      var wire = c.getAttribute('data-wire');
      if (wire) {
        var w = mk('div', 'wire');
        w.appendChild(mk('small', null, 'Телеграмма · без подписи · без даты'));
        w.appendChild(mk('p', null, wire));
        s.appendChild(w);
      }
      s.appendChild(mk('p', 'case-hook', c.getAttribute('data-hook') || ''));
      var foot = mk('div', 'case-foot');
      foot.appendChild(mk('span', 'case-badge', txt(c, '.qc-badge')));
      var btn = c.querySelector('.qc-btn');
      var a = mk('a', 'btn case-btn', btn ? btn.textContent.trim() : 'Подробнее о деле');
      a.href = btn ? btn.getAttribute('href') : '#quests';
      foot.appendChild(a);
      s.appendChild(foot);
      track.appendChild(s);
      return s;
    });
    if (slides.length > 1 && ctrl) {
      ctrl.hidden = false;
      box.classList.add('is-carousel');
      track.setAttribute('tabindex', '0');
      track.setAttribute('aria-label', 'Дела: листайте влево и вправо');
      var dots = slides.map(function (s, i) {
        var d = mk('button', 'cases-dot');
        d.type = 'button';
        d.setAttribute('aria-label', 'Дело №' + cards[i].getAttribute('data-case') + ' · ' + cards[i].getAttribute('data-name'));
        d.addEventListener('click', function () { go(i); });
        dotsBox.appendChild(d);
        return d;
      });
      var cur = 0;
      var go = function (i) {
        i = Math.max(0, Math.min(slides.length - 1, i));
        track.scrollTo({ left: slides[i].offsetLeft - slides[0].offsetLeft, behavior: reduce ? 'auto' : 'smooth' });
        mark(i);
      };
      var mark = function (i) {
        if (i === cur && dots[i].getAttribute('aria-current')) return;
        cur = i;
        dots.forEach(function (d, k) { if (k === i) d.setAttribute('aria-current', 'true'); else d.removeAttribute('aria-current'); });
        slides.forEach(function (s, k) { s.classList.toggle('is-active', k === i); });
        var arrows = ctrl.querySelectorAll('.cases-arrow');
        arrows[0].disabled = i === 0; arrows[1].disabled = i === slides.length - 1;
        if (live) live.textContent = slides[i].getAttribute('aria-label');
      };
      ctrl.querySelectorAll('.cases-arrow').forEach(function (b) {
        b.addEventListener('click', function () { go(cur + (+b.getAttribute('data-dir'))); });
      });
      track.addEventListener('keydown', function (e) {
        if (e.key === 'ArrowRight') { e.preventDefault(); go(cur + 1); }
        else if (e.key === 'ArrowLeft') { e.preventDefault(); go(cur - 1); }
      });
      var t;
      track.addEventListener('scroll', function () {
        clearTimeout(t);
        t = setTimeout(function () {
          var x = track.scrollLeft, best = 0, dist = Infinity;
          slides.forEach(function (s, k) { var dd = Math.abs(s.offsetLeft - slides[0].offsetLeft - x); if (dd < dist) { dist = dd; best = k; } });
          mark(best);
        }, 80);
      }, { passive: true });
      mark(0);
      if (live) live.textContent = '';
    }
  }
})();

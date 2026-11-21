/* Дворами: минимум JS. Без него сайт полностью читается; JS добавляет только «живость». */
(function () {
  'use strict';

  // Приёмник предложений квестов (форма «Предложите свой квест»).
  // Пустая строка — приём закрыт: кнопка неактивна, черновик хранится только в браузере.
  // Когда появится приёмник, впишите сюда его URL: форма отправит POST с JSON
  // { city, area, places, contact, page } и включит кнопку сама.
  var SUGGEST_ENDPOINT = '';

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

  // Внешние картинки (блок «Искусство вокруг»): если не загрузилась — прячем битую, остаётся подпись-заглушка
  document.querySelectorAll('.art-img img').forEach(function (img) {
    function broken() { img.parentNode.classList.add('is-broken'); }
    if (img.complete && img.naturalWidth === 0) broken();
    img.addEventListener('error', broken);
  });

  // «Предложите свой квест»: черновик в localStorage, отправка — только если задан SUGGEST_ENDPOINT
  var KEY = 'dvorami:suggest';
  function load() { try { return JSON.parse(localStorage.getItem(KEY) || '{}') || {}; } catch (e) { return {}; } }
  function save(d) { try { localStorage.setItem(KEY, JSON.stringify(d)); } catch (e) {} }
  function drop() { try { localStorage.removeItem(KEY); } catch (e) {} }
  document.querySelectorAll('form[data-suggest]').forEach(function (sf) {
    var fields = sf.querySelectorAll('input[name], textarea[name]');
    var btn = sf.querySelector('button[type="submit"]');
    var note = sf.querySelector('.suggest-note');
    var out = sf.querySelector('.suggest-msg');
    var draft = load();
    fields.forEach(function (el) {
      if (draft[el.name]) el.value = draft[el.name];
      el.addEventListener('input', function () { var d = load(); d[el.name] = el.value; save(d); });
    });
    if (SUGGEST_ENDPOINT) {
      btn.disabled = false;
      if (note) note.textContent = 'Предложение прочитает команда «Дворами». Контакт нужен, только если хотите получить ответ.';
    }
    sf.addEventListener('submit', function (e) {
      e.preventDefault();
      if (!SUGGEST_ENDPOINT) return;
      var data = { page: location.pathname };
      fields.forEach(function (el) { data[el.name] = (el.value || '').trim(); });
      if (!data.area && !data.places) { out.textContent = 'Напишите хотя бы район или пару мест.'; return; }
      btn.disabled = true; out.textContent = 'Отправляем…';
      fetch(SUGGEST_ENDPOINT, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) })
        .then(function (r) {
          if (!r.ok) throw new Error(r.status);
          drop(); sf.reset(); out.textContent = 'Спасибо! Предложение у нас.';
        })
        .catch(function () { out.textContent = 'Не получилось отправить. Текст сохранён в браузере, попробуйте чуть позже.'; })
        .then(function () { btn.disabled = false; });
    });
  });
})();

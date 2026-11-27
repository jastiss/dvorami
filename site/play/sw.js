/* Дворами — офлайн для плеера квеста. Сеть в приоритете (всегда свежий quest.locked.json — зашифрованное дело),
   при плохой связи (нет ответа 4 с или ошибка) — последняя сохранённая копия. Область: /play/.
   Первый заход: страница, скрипты, стили и дело грузятся до того, как этот файл начал управлять страницей, и мимо него
   в кеш не попадают — плеер присылает их список сообщением {warm: [адреса]} (player.js, warmCache), они кладутся в кеш,
   и перезагрузка без связи открывает то же место (27.11: без этого первый заход без связи не открывался вовсе).
   В кеш — только полные ответы 200 своего сайта (частичный 206 от звука Cache API не принимает).
   Версия кеша — от выпуска (BUILD: хеш файлов плеера, его вписывает pages.yml — scripts/sw_version.js --write; «dev» —
   локально). Новый выпуск — новый sw.js: install кладёт каркас плеера и открытые страницы дел в новый кеш (без связи
   установка не проходит, и остаётся прежний sw.js со своим кешем), activate удаляет старые кеши dvorami-play-*,
   плеер по controllerchange досылает остальное (warmCache). Проверка — player_check, блок «офлайн». */
var BUILD = 'dev';
var PREFIX = 'dvorami-play-';
var CACHE = PREFIX + BUILD;
var CORE = ['player.js', 'answer.js', 'player.css'];
function keep(cache, req, res) {
  if (res && (res.status === 200 || res.type === 'opaque')) return cache.put(req, res.clone()).catch(function () { /* нет места — без кеша */ });
  return null;
}
// Каркас плеера (обязательно: без сети установка не пройдёт) и открытые страницы дел с их темой и делом (по возможности)
function precache() {
  var scope = self.registration.scope;
  return caches.open(CACHE).then(function (cache) {
    return self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function (list) {
      var pages = [];
      list.forEach(function (c) {
        var u = String(c.url).split('#')[0].split('?')[0];
        if (u.indexOf(scope) !== 0) return;
        [u, new URL('theme.css', u).href, new URL('quest.locked.json', u).href].forEach(function (x) { if (pages.indexOf(x) === -1) pages.push(x); });
      });
      var core = CORE.map(function (f) { return new URL(f, scope).href; });
      return Promise.all(core.map(function (u) { return fetch(u, { cache: 'reload' }).then(function (res) { return keep(cache, u, res); }); }))
        .then(function () {
          return Promise.all(pages.map(function (u) {
            return fetch(u, { cache: 'reload', credentials: 'same-origin' }).then(function (res) { return keep(cache, u, res); }, function () { /* досылает warmCache */ });
          }));
        });
    });
  });
}
self.addEventListener('install', function (e) { e.waitUntil(precache().then(function () { return self.skipWaiting(); })); });
self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (names) {
    return Promise.all(names.filter(function (n) { return n.indexOf(PREFIX) === 0 && n !== CACHE; }).map(function (n) { return caches.delete(n); }));
  }).then(function () { return self.clients.claim(); }));
});
self.addEventListener('message', function (e) {
  var urls = e.data && Array.isArray(e.data.warm) ? e.data.warm : null;
  if (!urls) return;
  var mine = urls.filter(function (u) { try { return new URL(u, self.location.href).origin === self.location.origin; } catch (x) { return false; } }).slice(0, 200);
  e.waitUntil(caches.open(CACHE).then(function (cache) {
    return Promise.all(mine.map(function (u) {
      return cache.match(u, { ignoreSearch: true }).then(function (hit) {
        if (hit) return null;
        return fetch(u, { credentials: 'same-origin' }).then(function (res) { return keep(cache, u, res); }, function () { /* нет связи — в другой раз */ });
      });
    }));
  }));
});
self.addEventListener('fetch', function (e) {
  var req = e.request;
  if (req.method !== 'GET') return;
  var url = new URL(req.url);
  var same = url.origin === self.location.origin;
  if (!same && !/^fonts\.(googleapis|gstatic)\.com$/.test(url.hostname)) return;
  e.respondWith(caches.open(CACHE).then(function (cache) {
    var net = fetch(req).then(function (res) {
      keep(cache, req, res);
      return res;
    });
    var slow = new Promise(function (resolve) { setTimeout(resolve, 4000, null); });
    return Promise.race([net.catch(function () { return null; }), slow]).then(function (first) {
      if (first) return first;
      return cache.match(req, { ignoreSearch: same }).then(function (hit) { return hit || net; });
    });
  }));
});

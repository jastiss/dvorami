/* Дворами — офлайн для плеера квеста. Сеть в приоритете (всегда свежий quest.locked.json — зашифрованное дело),
   при плохой связи (нет ответа 4 с или ошибка) — последняя сохранённая копия. Область: /play/.
   Первый заход: страница, скрипты, стили и дело грузятся до того, как этот файл начал управлять страницей, и мимо него
   в кеш не попадают — плеер присылает их список сообщением {warm: [адреса]} (player.js, warmCache), они кладутся в кеш,
   и перезагрузка без связи открывает то же место (27.11: без этого первый заход без связи не открывался вовсе).
   В кеш — только полные ответы 200 своего сайта (частичный 206 от звука Cache API не принимает). */
var CACHE = 'dvorami-play-v1';
self.addEventListener('install', function () { self.skipWaiting(); });
self.addEventListener('activate', function (e) { e.waitUntil(self.clients.claim()); });
function keep(cache, req, res) {
  if (res && (res.status === 200 || res.type === 'opaque')) cache.put(req, res.clone()).catch(function () { /* нет места — без кеша */ });
}
self.addEventListener('message', function (e) {
  var urls = e.data && Array.isArray(e.data.warm) ? e.data.warm : null;
  if (!urls) return;
  var mine = urls.filter(function (u) { try { return new URL(u, self.location.href).origin === self.location.origin; } catch (x) { return false; } }).slice(0, 200);
  e.waitUntil(caches.open(CACHE).then(function (cache) {
    return Promise.all(mine.map(function (u) {
      return cache.match(u, { ignoreSearch: true }).then(function (hit) {
        if (hit) return null;
        return fetch(u, { credentials: 'same-origin' }).then(function (res) { keep(cache, u, res); }, function () { /* нет связи — в другой раз */ });
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

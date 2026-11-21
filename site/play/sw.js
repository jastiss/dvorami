/* Дворами — офлайн для плеера квеста. Сеть в приоритете (всегда свежий quest.json),
   при плохой связи (нет ответа 4 с или ошибка) — последняя сохранённая копия. Область: /play/. */
var CACHE = 'dvorami-play-v1';
self.addEventListener('install', function () { self.skipWaiting(); });
self.addEventListener('activate', function (e) { e.waitUntil(self.clients.claim()); });
self.addEventListener('fetch', function (e) {
  var req = e.request;
  if (req.method !== 'GET') return;
  var url = new URL(req.url);
  var same = url.origin === self.location.origin;
  if (!same && !/^fonts\.(googleapis|gstatic)\.com$/.test(url.hostname)) return;
  e.respondWith(caches.open(CACHE).then(function (cache) {
    var net = fetch(req).then(function (res) {
      if (res && (res.ok || res.type === 'opaque')) cache.put(req, res.clone());
      return res;
    });
    var slow = new Promise(function (resolve) { setTimeout(resolve, 4000, null); });
    return Promise.race([net.catch(function () { return null; }), slow]).then(function (first) {
      if (first) return first;
      return cache.match(req, { ignoreSearch: same }).then(function (hit) { return hit || net; });
    });
  }));
});

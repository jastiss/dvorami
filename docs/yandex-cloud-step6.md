# Шаг 6 — что сделать сейчас (28.11)

Подробно, с картинкой «что куда» — [docs/yandex-cloud.md, шаг 6](https://github.com/jastiss/dvorami/blob/main/docs/yandex-cloud.md#6-что-сделать-вам--по-шагам). Около 40 минут, по порядку:

1. **reg.ru → «Домены» → dvorami.ru → «DNS-серверы и управление зоной»** — посмотрите список записей. Есть MX или TXT (почта, `yandex-verification`) — запишите их. Только NS, SOA, A, CNAME — переносить нечего. То же для sledami.ru и zalami.ru.
2. **Yandex Cloud → «Cloud DNS» → зона `dvorami.ru.` → «Создать запись»**, две записи (TTL `600`): имя пусто, тип **ANAME**, значение `dvorami.ru.website.yandexcloud.net`; имя `www`, тип **CNAME**, значение `www.dvorami.ru.website.yandexcloud.net`. В зонах `sledami.ru.` и `zalami.ru.` — то же со своим доменом. Плюс MX/TXT из п. 1, если были.
3. **«Object Storage» → три пустых бакета** `www.dvorami.ru`, `www.sledami.ru`, `www.zalami.ru` → в каждом «Веб-сайт» → «Переадресация» → домен без www, протокол HTTPS.
4. **reg.ru → dvorami.ru → «DNS-серверы и управление зоной» → «Изменить» → «Свой список DNS-серверов»** → `ns1.yandexcloud.net`, `ns2.yandexcloud.net` → «Готово». То же для sledami.ru и zalami.ru. **Домены .рф не трогайте** — они остаются в reg.ru с переадресацией (дворами.рф → dvorami.ru, следами.рф → sledami.ru, залами.рф → zalami.ru; можно позже, если бесплатно).
5. **Через час-сутки:** `http://dvorami.ru` показывает ошибку Yandex «NoSuchKey»/404 — правильно, бакет ещё пуст. Напишите в бот «DNS переключён» — пришлём шаг 7 (сертификаты HTTPS).

Застряли на любом пункте — скриншот в бот. Что-то сломалось с почтой — верните в п. 4 серверы `ns1.reg.ru`, `ns2.reg.ru`.

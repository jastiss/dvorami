# Картинки для сайта: что скачать и как они встают на страницу

Арт-директор, обновлено 24.11.2026 (первая версия — 22.11).

## Состояние на 24.11
- **Страница готова к файлам.** `scripts/build_cases.py` сам ставит фото в карточку места и репродукцию в карточку «вокруг дела», как только файл лежит по нужному пути, и сам добавляет подпись. Пока файла нет — в карточке рисунок, битых картинок и заглушек нет. HTML руками не правится: положить файл → `python3 scripts/build_cases.py` → `node scripts/site_check.js`.
- **Файлы не скачаны.** Из среды команды Commons отвечает `429`: сначала ограничение частоты, затем «request does not comply with our robot policy» — Wikimedia требует User-Agent с контактом. Каталог Openverse открывается (оттуда — авторы и лицензии ниже), но сами файлы он не отдаёт (`424`), а `live.staticflickr.com` закрыт для нашего адреса («CIDR range blocked»). Workflow `fetch-media.yml` пропускает только `*.fal.media`. Обходить не стали.
- **Что нужно от владельца (вопрос в APPROVALS):** либо разрешить отдельный workflow для Commons — готовый текст в `docs/fetch-photo.workflow.yml` (только `upload.wikimedia.org`, только в `site/assets/photo|art`, сразу сжимает; нужен контакт для User-Agent), либо скачать 9 файлов руками по таблицам ниже (10 минут).

## 1. Фото мест → `site/assets/photo/zilart/<слот>.jpg`

Формат: 1200×900, JPEG ~80 %, до 250 КБ. Все кандидаты — Wikimedia Commons, автор **Retired electrician**, лицензия **CC0 1.0** (по данным каталога Openverse, 24.11.2026; на странице файла сверить при скачивании). Подпись на сайте: «Фото: Retired electrician, CC0» — без ссылки: CC0 её не требует, а ссылки на вики на сайте запрещены (`team/std/sources.md`). Страница файла записана в `quests/zilart/media/LICENSES.md`.

| Слот | Что | Кандидат (страница файла) | Прямая ссылка | Статус |
|---|---|---|---|---|
| `pergola` | Пергола в парке «Тюфелева роща» | https://commons.wikimedia.org/w/index.php?curid=163994356 («Tyufeleva Roshcha park April 2025 01», 4592×2583) | https://upload.wikimedia.org/wikipedia/commons/9/91/Moscow%2C_Tyufeleva_Roshcha_park_April_2025_01.jpg | **просмотрен**: пергола общим планом через газон, людей и табличек нет. Запасной, не просмотрен — curid=163994355 («…April 2025 03») |
| `arch` | Золотая арка | https://commons.wikimedia.org/w/index.php?curid=163778634 («Marka Shagala Embankment - Golden Arch, April 2025 06», 5184×3456) | https://upload.wikimedia.org/wikipedia/commons/3/30/Moscow%2C_Marka_Shagala_Embankment_-_Golden_Arch%2C_April_2025_06.jpg | не просмотрен; в категории «Golden Arch (Zilart)» ещё ~30 кадров того же автора (08: curid=163778636, 44: curid=164140795) |
| `hares` | Дом с зайцами | https://commons.wikimedia.org/w/index.php?curid=163898721 («Ginzburga Street, Hare building April 2025 01», 4936×3151) | https://upload.wikimedia.org/wikipedia/commons/3/3b/Moscow%2C_Ginzburga_Street%2C_Hare_building_April_2025_01.jpg | не просмотрен |
| `pond` | Пруд в роще | https://commons.wikimedia.org/w/index.php?curid=163994370 («Tyufeleva Roshcha park view to Chagal buildings April 2025 02», 4402×3302) | https://upload.wikimedia.org/wikipedia/commons/f/f9/Moscow%2C_Tyufeleva_Roshcha_park_view_to_Chagal_buildings_April_2025_02.jpg | не просмотрен: есть ли вода в кадре — неизвестно. Кадр с водой точно есть (curid=121748565, август 2022, Nord794ub), но он под CC BY-SA 4.0: нужна ссылка на источник, а она под запретом — не берём |
| `press` | Пресс у музея | категория https://commons.wikimedia.org/wiki/Category:Erfurt_crank_press_in_Zilart | — | список файлов получить не удалось (429). **Спойлер:** в кадре не должно читаться название на станке и табличка с моделью; имя файла на сайте — только `press.jpg` |
| `truck` | «Самосвал» Дельвуа | — | — | не ставим без разрешения музея (`quests/zilart/research/artworks.md`) |

**Перед тем как ставить непросмотренный кадр:** открыть его глазами — без людей крупно, без адресных табличек и номеров домов, без ответа загадки в кадре. Подписи и alt для слотов `pergola`, `arch`, `hares`, `pond` уже записаны в `platform/site/cases/c1_zilart.py` (поле `photo`); для `press` поле добавить, когда будет известен автор.

## 2. «Вокруг дела» → `site/assets/art/zilart/<имя>.jpg`

Формат: до 1200 px по ширине, пропорции не менять (репродукции не кадрируем). Подписи уже стоят в карточках — музеем-владельцем, как требует `team/std/sources.md`.

| Файл | Прямая ссылка (оригинал) | Страница файла | Право |
|---|---|---|---|
| `kandinsky-composition-7.jpg` | https://upload.wikimedia.org/wikipedia/commons/b/b4/Vassily_Kandinsky%2C_1913_-_Composition_7.jpg | https://commons.wikimedia.org/wiki/File:Vassily_Kandinsky,_1913_-_Composition_7.jpg | Общественное достояние: Кандинский умер в 1944 году |
| `lentulov-vasiliy-blazhenny.jpg` | https://upload.wikimedia.org/wikipedia/commons/5/50/Lentulov_Basil.jpg | https://commons.wikimedia.org/wiki/File:Lentulov_Basil.jpg | Общественное достояние с 2018 года. Проверить глазами, что это «Василий Блаженный» 1913 года |
| `lisitsky-klinom-krasnym.jpg` | https://upload.wikimedia.org/wikipedia/commons/9/93/Klinom_Krasnim_by_El_Lisitskiy_%281920%29.jpg | https://commons.wikimedia.org/wiki/File:Klinom_Krasnim_by_El_Lisitskiy_(1920).jpg | Общественное достояние: Лисицкий умер в 1941 году |

Хеш-пути трёх репродукций (`b/b4`, `5/50`, `9/93`) вычислены по правилу Commons и не открывались: не сработает — «Original file» на странице файла. Ссылки на фото мест взяты из каталога Openverse как есть.

Следующие на очереди (нужно открыть страницу файла и записать автора и лицензию; подойдут только CC0 и общественное достояние — иначе нужна ссылка на вики): Дом Мельникова, ДК ЗИЛ, старые снимки рощи и завода из категории «Tyufeleva Grove» («AMO factory construction», «Pond in Tyufeleva Roscha», «Tyufeleva Roscha from the Simonov Monastery»). Снимки PastVu встраивать нельзя: лицензий на страницах нет (`quests/zilart/research/pastvu.md`).

## Как скачать руками
Открыть прямую ссылку → сохранить → `convert in.jpg -resize '1200x900^' -gravity center -extent 1200x900 -quality 80 -strip site/assets/photo/zilart/<слот>.jpg` (репродукции: `-resize '1200x1600>'` без `-extent`) → `python3 scripts/build_cases.py` → `node scripts/site_check.js` → коммит. Можно просто прислать файлы — команда сожмёт и поставит.

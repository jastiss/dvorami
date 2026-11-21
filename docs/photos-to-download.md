# Картинки для сайта: скачать вручную

Арт-директор, 22.11.2026. Из среды команды Wikimedia Commons не открывается: терминал получает `CONNECT 403`, WebFetch возвращает `url_not_found` и для страниц файлов, и для `upload.wikimedia.org`. Обходить блокировку не стали. Скачать нужно вручную, на это уйдёт около 5 минут.

## 1. «Искусство вокруг» — страница уже готова к этим файлам

Разметка уже стоит в `site/moscow/zilart-sinyaya-ptica/index.html`. Пока файла нет, карточка показывает рисованную заглушку, без битой картинки. Подпись «Изображение: Wikimedia Commons, общественное достояние» появляется сама, когда файл загрузился. **HTML править не нужно:** достаточно положить файл с нужным именем и запушить.

| Файл на сайте | Прямая ссылка (оригинал) | Страница файла | Лицензия |
|---|---|---|---|
| `site/assets/art/zilart/kandinsky-composition-7.jpg` | https://upload.wikimedia.org/wikipedia/commons/b/b4/Vassily_Kandinsky%2C_1913_-_Composition_7.jpg (1000×657) | https://commons.wikimedia.org/wiki/File:Vassily_Kandinsky,_1913_-_Composition_7.jpg | Общественное достояние: Кандинский умер в 1944 году, файл — точная репродукция двумерной работы. Проверено по зеркалу страницы (OsmAnd) |
| `site/assets/art/zilart/lentulov-vasiliy-blazhenny.jpg` | https://upload.wikimedia.org/wikipedia/commons/5/50/Lentulov_Basil.jpg (1611×1739) | https://commons.wikimedia.org/wiki/File:Lentulov_Basil.jpg | Общественное достояние: Лентулов умер в 1943 году, в РФ работа свободна с 2018-го. Перед загрузкой проверьте, что на картинке именно «Василий Блаженный» 1913 года |
| `site/assets/art/zilart/lisitsky-klinom-krasnym.jpg` | https://upload.wikimedia.org/wikipedia/commons/9/93/Klinom_Krasnim_by_El_Lisitskiy_%281920%29.jpg (849×685) | https://commons.wikimedia.org/wiki/File:Klinom_Krasnim_by_El_Lisitskiy_(1920).jpg | Общественное достояние: Лисицкий умер в 1941 году. Проверено по зеркалу страницы (OsmAnd) |

Хеш-пути (`b/b4`, `5/50`, `9/93`) вычислены по правилу Commons (md5 от имени файла) и сами не открывались. Если ссылка не работает, откройте страницу файла и нажмите «Original file».

**Сжатие:** ширина не больше 1200 px, JPEG с качеством около 82 %. Пример: `convert in.jpg -resize '1200x1200>' -quality 82 -strip out.jpg`. ImageMagick и Pillow в среде команды есть: можно положить оригиналы в репозиторий и попросить команду сжать.

## 2. Фото реперных точек (слоты на странице ЗИЛАРТа)

Пока фото нет, в слотах стоят оформленные рисунки. Чужое фото можно ставить только после того, как на странице файла открыты **автор и лицензия**: у этих снимков их никто не видел.

| Слот (`data-photo`) | Кандидат на Commons | Что проверить |
|---|---|---|
| `pergola`, `pond` | https://commons.wikimedia.org/wiki/File:Moscow_Tyufeleva_Grove_asv2018-08_img1.jpg и категория https://commons.wikimedia.org/wiki/Category:Tyufeleva_Roshcha_Park | Автор, лицензия; видны ли пергола и пруд (в 2018 году парк только открылся) |
| `arch` | https://commons.wikimedia.org/wiki/File:%D0%9D%D0%B0%D0%B1%D0%B5%D1%80%D0%B5%D0%B6%D0%BD%D0%B0%D1%8F_%D0%9C%D0%B0%D1%80%D0%BA%D0%B0_%D0%A8%D0%B0%D0%B3%D0%B0%D0%BB%D0%B0_20220513_140501.jpg | Автор, лицензия; есть ли в кадре золотая арка |
| `hares`, `press` | свободных фото не нашлось | Только свои снимки. Пресс — без крупной таблички с моделью: это ответ загадки |
| `truck` («Самосвал» Дельвуа) | — | Не ставим (A-10) |

**Как вставить фото со свободной лицензией:** положите файл `site/assets/photo/zilart/<слот>.jpg` (1200×900, около 80 %). В карточке с `data-photo="<слот>"` замените `<div class="ph-empty">…</div>` на `<img src="../../assets/photo/zilart/<слот>.jpg" alt="…" width="1200" height="900" loading="lazy">`, а под `<h3>` добавьте строку `<p class="small">Фото: <автор>, <a href="<страница файла>">CC BY-SA 4.0</a>, Wikimedia Commons</p>`. Без подписи с автором фото под CC BY и CC BY-SA ставить нельзя.

Если удобнее, пришлите в Telegram ссылки на файлы с открытыми лицензиями, и команда вставит их сама.

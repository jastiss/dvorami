# Медиа ЗИЛАРТа: источники и лицензии

Правила — `docs/fal-guide.md`, `team/std/images.md`. Изображения общественного достояния подписывать музеем-владельцем, не Commons. Запись нужна на каждый файл, который может попасть к игроку; отклонённые варианты (`archive/quests/zilart/media/`) — те же условия, что у строки той же модели.

## Сгенерированное (fal), всё — 2026-11-23

Условия коммерческого использования для всех строк — по условиям fal для модели (ElevenLabs — партнёрский API через fal); **подтвердить до публикации**. Тексты — наш сценарий; чужих исходников нет, кроме оговорённых.

| Файл (`assets/…`) | Что | Модель |
|---|---|---|
| `audio/zilya-01-intro-v3b-callum-coo02a-norm.mp3` (+ `-v3b-callum-raw.mp3`) | Реплика Зили, точка 1 — утверждённый голос | `elevenlabs/tts/eleven-v4`, библиотечный голос Callum |
| `audio/pigeon-coo-sfx-02a.mp3` | Воркование голубя | `elevenlabs/sound-effects/v3`, по нашему описанию |
| `test/zilya-portrait-nbpro.png` | Портрет Зили | `fal-ai/nano-banana-pro` |
| `video/zilya-kling-5s.mp4`, `-voice.mp4` | Зиля оживает, 5 с (из портрета; `-voice` — с голосом v3b поверх) | `fal-ai/kling-video/v2.5-turbo/pro/image-to-video` |
| `video/zilya-omnihuman-5s-talking.mp4` | Зиля говорит, 5,4 с | `fal-ai/bytedance/omnihuman/v1.5` |
| `art/kandinsky-blue-rider-9x16.jpg` | «Синий всадник», вертикаль 9:16, экран точки 8: картина вклеена без изменений (1080 px), полосы сверху/снизу дорисованы | `fal-ai/nano-banana-2/edit`; картина — общественное достояние (ниже) |

Подпись к Кандинскому: «В. Кандинский. Синий всадник. 1903. Фонд Э. Г. Бюрле, Цюрих. Верх и низ дорисованы нейросетью».

## Общественное достояние (Wikimedia Commons)

Лицензии подтверждены по викитексту страниц файлов 23.11.2026.

| Работа | Автор, год, владелец | Страница файла | Лицензия | Статус |
|---|---|---|---|---|
| «Бедная Лиза» | О. А. Кипренский (1782–1836), 1827, Третьяковская галерея, инв. 26777 | https://commons.wikimedia.org/wiki/File:%D0%9A%D0%B8%D0%BF%D1%80%D0%B5%D0%BD%D1%81%D0%BA%D0%B8%D0%B9_%D0%B1%D0%B5%D0%B4%D0%BD%D0%B0%D1%8F_%D0%BB%D0%B8%D0%B7%D0%B0.jpg | `PD-Art-two-auto\|1836` | не обработана (Commons ответил 429) |
| «Синий всадник» | В. В. Кандинский (1866–1944), 1903, Фонд собрания Э. Г. Бюрле, Цюрих | https://commons.wikimedia.org/wiki/File:Wassily_Kandinsky,_1903,_The_Blue_Rider_(Der_Blaue_Reiter),_oil_on_canvas,_52.1_x_54.6_cm,_Stiftung_Sammlung_E.G._B%C3%BChrle,_Zurich.jpg | `PD-Art\|PD-old-auto-expired\|deathyear=1944` | обработан → `art/kandinsky-blue-rider-9x16.jpg` |
| Симонов монастырь | Н. А. Найдёнов (1834–1905), 1882, альбом «Москва. Монастыри», т. IV, л. 2 | https://commons.wikimedia.org/wiki/File:Simonov_monastery_moscow_1882.JPG | `PD-old` | не обработан (429) |

## Фото мест для сайта (Wikimedia Commons) — кандидаты, на 24.11.2026 не скачаны

Автор и лицензия — по каталогу Openverse (24.11.2026); при скачивании сверить на странице файла и поставить здесь дату проверки. Файлы на сайте: `site/assets/photo/zilart/<слот>.jpg`; подпись под фото — «Фото: Retired electrician, CC0» (без ссылки: CC0 её не требует, ссылки на вики на сайте запрещены). Порядок работы — `docs/photos-to-download.md`.

| Слот | Название файла на Commons | Автор | Лицензия | Страница файла | Статус |
|---|---|---|---|---|---|
| `pergola` | Moscow, Tyufeleva Roshcha park April 2025 01 | Retired electrician | CC0 1.0 | https://commons.wikimedia.org/w/index.php?curid=163994356 | кадр просмотрен, подходит; не скачан |
| `arch` | Moscow, Marka Shagala Embankment - Golden Arch, April 2025 06 | Retired electrician | CC0 1.0 | https://commons.wikimedia.org/w/index.php?curid=163778634 | не просмотрен |
| `hares` | Moscow, Ginzburga Street, Hare building April 2025 01 | Retired electrician | CC0 1.0 | https://commons.wikimedia.org/w/index.php?curid=163898721 | не просмотрен |
| `pond` | Moscow, Tyufeleva Roshcha park view to Chagal buildings April 2025 02 | Retired electrician | CC0 1.0 | https://commons.wikimedia.org/w/index.php?curid=163994370 | не просмотрен |
| `press` | категория «Erfurt crank press in Zilart» | — | — | https://commons.wikimedia.org/wiki/Category:Erfurt_crank_press_in_Zilart | файл не выбран |

Рисунки мест `site/assets/ill/spots/zilart-*.svg` — свои (`scripts/make_case_art.py`), чужих исходников нет. 24.11 перерисованы пергола (по просмотренному кадру выше), арка и пресс (по описаниям из `research/facts.md`, натуру не видели).


## Кастинг героев (fal), 2026-11-26 — черновики на выбор (A-60)

Условия — как в разделе «Сгенерированное (fal)» выше: по условиям fal для модели, **подтвердить до публикации**. Промпты наши (`specs/02-casting.md`). Чужих исходников нет, кроме прежнего портрета Зили (`assets/test/zilya-portrait-nbpro.png`, наш).

| Файл (`casting/…`) | Что | Модель |
|---|---|---|
| `zilya-1-poster.jpg` | Зиля, плакат: развитие прежнего портрета | `fal-ai/nano-banana-2/edit` |
| `zilya-2…4-*.jpg`, `tyufel-1…4-*.jpg` | Зиля и Тюфель, по 4 стиля | `fal-ai/nano-banana-2` |
| `duo-poster.jpg`, `duo-collage.jpg` | Оба героя вместе | `fal-ai/nano-banana-pro/edit` (из черновиков выше) |
| `voices/tyufel-*.mp3`, `lyova-a-george.mp3`, `gosha-a-roger.mp3` | Пробы голосов | `elevenlabs/tts/eleven-v4`, библиотечные голоса Brian, Bill, Liam, George, Roger |
| `voices/lyova-b-minimax.mp3` | Проба голоса Лёвы | `fal-ai/minimax/speech-2.8-hd`, голос Determined_Man |

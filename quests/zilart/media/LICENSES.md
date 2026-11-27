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

## Кастинг, раунд 2, 2026-11-26 — сцены и голоса на выбор (A-65)

Условия — как выше: по условиям fal для модели, **подтвердить до публикации**. Промпты — `specs/02-casting.md`, раздел «Раунд 2». Исходники — только наши черновики раунда 1.

| Файл (`casting/…`) | Что | Модель |
|---|---|---|
| `round2-tyufel-1-barsky.jpg`, `round2-scene-fly-1.jpg`, `round2-scene-fly-4.jpg` | Тюфель 1 «барин», финальная сцена в двух стилях | `fal-ai/nano-banana-pro/edit` |
| `round2-zilya-*.jpg`, `round2-scene-meet-*.jpg`, `round2-scene-paw-*.jpg` | Зиля без круга, сцены «Встреча» и «Мокрая лапа» | `fal-ai/nano-banana-2/edit` |
| `round2-scene-fly-1.mp4`, `round2-scene-fly-4.mp4` | Анимация 5 с | `fal-ai/kling-video/v2.5-turbo/pro/image-to-video` |
| `voices/tyufel-d-eric.mp3`, `lyova-c-george.mp3`, `lyova-d-daniel.mp3`, `gosha-b-roger.mp3`, `gosha-c-bill.mp3` | Пробы голосов | `elevenlabs/tts/eleven-v4`, библиотечные голоса Eric, George, Daniel, Roger, Bill |
| `voices/tyufel-e-design.mp3` | Голос по текстовому описанию | `fal-ai/qwen-3-tts/voice-design/1.7b` (открытая модель Qwen3-TTS; лицензию модели сверить до публикации) |
| `voices/tyufel-f-minimax.mp3` | Проба голоса | `fal-ai/minimax/speech-2.8-hd`, голос Elegant_Man |
| `scenes/ref-sheet-4.jpg`, `site/play/zilart/media/scenes/s01…s07*.jpg` | Лист героев и 7 сцен квеста, стиль 4 (27.11, A-66) | `fal-ai/nano-banana-pro/edit` — условия те же, что у строк кастинга выше |

## ElevenLabs напрямую, 2026-11-27 — озвучка, звуки, музыка (раунд 4)

Тариф владельца Creator (платный): по условиям ElevenLabs коммерческое использование результатов разрешено на платных тарифах. **Подтвердить до публикации на боевом сайте.** Текст — наш сценарий. Голоса: библиотечные (Callum, Daniel, Roger, Miron, Alexei, Andrii, Max) и созданные по нашему описанию («Дворами · ЗИЛАРТ · Тюфель · дизайн 1/2»). Голос **Tyufel** — клон, его создал владелец: откуда взят образец, не подтверждено (вопрос в `casting/README.md`, раунд 4). До ответа он стоит только на стенде.

| Файл | Что | Модель |
|---|---|---|
| `site/play/zilart/media/audio/p1-01…p1-04-*.mp3` | 4 реплики точки 1 со звуком | `eleven_v4` + наши звуки, сведение ffmpeg |
| `casting/voices/r3-*.mp3` | пробы голосов раунда 4 | `eleven_v4` |
| `assets/audio/sfx/sfx-*.mp3` | голубь, кот, шаги, трамвай, гудок | `eleven_text_to_sound_v3` |
| `assets/audio/sfx/music-courtyard-mystery-30s.mp3` | музыка «тайна во дворе» | `eleven_music_v2_5` |

## Карточки «Искусство вокруг» и подложка карты (fal), 2026-11-28

Основание — A-85 и A-75 (владелец, 27.11). Модель — `fal-ai/nano-banana-pro/edit`, 2K, 4:3; образец техники — фрагмент нашей сцены `s02` (гуашь, стиль 4). Чужих исходников нет: в промптах нет имён художников и названий работ, в кадре — предметы ремесла эпохи, чистые листы и холсты. Условия коммерческого использования — по условиям fal для модели; **подтвердить до публикации** (как выше).

| Файл на сайте | Исходник | Что | request_id |
|---|---|---|---|
| `site/assets/art/zilart/melnikov-desk.jpg` | `cards/melnikov-desk.jpg` | стол архитектора 1920-х: чертёжная доска, рейсшина, циркуль | `01a21f1a-7a64-7270-a49a-0ed630c4b172` |
| `site/assets/art/zilart/tatlin-desk.jpg` | `cards/tatlin-desk.jpg` | верстак: рейки, проволока, пила, отвес (без конструкций) | `01a21f1a-7a9f-7c32-9f1e-2be3f809a014` |
| `site/assets/art/zilart/shagal-desk.jpg` | `cards/shagal-desk.jpg` | мольберт с чистым холстом у окна (за окном только небо) | `01a21f1a-7a9d-7e93-b88b-46bb6f5e1485` |
| `site/assets/art/zilart/rodchenko-desk.jpg` | `cards/rodchenko-desk.jpg` | дальномерный фотоаппарат 1930-х без марки, футляр, плёнка | `01a21f1a-7ab9-7450-9878-d1805bbb6546` |
| `site/assets/art/zilart/stepanova-desk.jpg` | `cards/stepanova-desk.jpg` | рулоны однотонного ситца, ножницы, линейка, циркуль (без узоров) | `01a21f1a-7a9b-7073-b552-266b699261d3` |
| `site/assets/art/zilart/avtozavod-1931.jpg` | `site/play/zilart/media/scenes/s02-amo-1931.jpg` (нижняя часть кадра) | завод в 1931 году, без генерации | сцена s02 (A-66) |
| `site/play/zilart/media/map.jpg` (+ `.webp`) | `map/map-gouache-4.jpg`, маска — `map/mask.py`, сборка — `map/build.py` | подложка схемы в плеере: парк, пруд и река по координатам `quest.json` → `map.landmarks`; улиц и домов нет | `01a21f1c-5008-7c40-9424-5d936eb74dd8` |

Подписи на сайте: «Рисунок „Дворами“… Не работа <автора>» (`art.credit` в `platform/site/cases/c1_zilart.py`).

Репродукции общественного достояния для трёх карточек — ждут скачивания (переменная `MEDIA_UA`, `docs/photos-to-download.md`); при скачивании вписать сюда страницу файла, шаблон лицензии и дату проверки:

| Файл | Работа | Страница файла | Право в РФ | Подпись |
|---|---|---|---|---|
| `kandinsky-composition-7.jpg` | В. Кандинский (1866–1944), «Композиция VII», 1913, ГТГ | https://commons.wikimedia.org/wiki/File:Vassily_Kandinsky,_1913_-_Composition_7.jpg | общественное достояние с 2015 (с +4 — с 2019) | «Василий Кандинский, 1913. Государственная Третьяковская галерея. Общественное достояние» |
| `lentulov-vasiliy-blazhenny.jpg` | А. Лентулов (1882–1943), «Василий Блаженный», 1913, ГТГ | https://commons.wikimedia.org/wiki/File:Lentulov_Basil.jpg | общественное достояние с 2018 | «Аристарх Лентулов, 1913. Государственная Третьяковская галерея. Общественное достояние» |
| `lisitsky-klinom-krasnym.jpg` | Эль Лисицкий (1890–1941), «Клином красным бей белых», 1920 | https://commons.wikimedia.org/wiki/File:Klinom_Krasnim_by_El_Lisitskiy_(1920).jpg | общественное достояние с 2016 | «Эль Лисицкий, 1920. Общественное достояние» (владельца оттиска вписать со страницы файла) |

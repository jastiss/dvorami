# Медиа ЗИЛАРТа: источники и лицензии

Правила — `docs/fal-guide.md`, `team/std/images.md`. Изображения общественного достояния подписывать музеем-владельцем, не Commons.

## Сгенерированное (fal)

| Файл | Что | Сервис / модель | Дата | Условия |
|---|---|---|---|---|
| `assets/test/zilya-portrait-nbpro.png` | Портрет Зили (тест) | fal · `fal-ai/nano-banana-pro` | 2026-11-23 | Оригинальная генерация без чужих исходников. Коммерческое использование — по условиям fal для этой модели; подтвердить на странице модели/условиях fal до публикации |
| `assets/audio/zilya-01-intro-eleven-v4.mp3` (+ `-norm`) | Реплика Зили, точка 1 | fal · `elevenlabs/tts/eleven-v4`, голос Charlie | 2026-11-23 | Текст — наш сценарий; голос — библиотечный ElevenLabs. Коммерческое использование — по условиям fal/ElevenLabs для партнёрского API; подтвердить до публикации |
| `assets/audio/zilya-01-intro-v2a-callum*.mp3` | Реплика Зили, кандидат голоса А | fal · `elevenlabs/tts/eleven-v4`, голос Callum + воркование ниже | 2026-11-23 | как выше |
| `assets/audio/zilya-01-intro-v2b-jessica*.mp3` | Реплика Зили, кандидат голоса Б | fal · `elevenlabs/tts/eleven-v4`, голос Jessica | 2026-11-23 | как выше |
| `assets/audio/pigeon-coo-sfx-01.mp3` | Воркование голубя, 2,5 с | fal · `elevenlabs/sound-effects/v3` | 2026-11-23 | Сгенерированный звук по нашему описанию; условия — как у ElevenLabs через fal; подтвердить до публикации |
| `assets/art/kandinsky-blue-rider-9x16.jpg` | «Синий всадник», вертикаль 9:16 для экрана точки 8 | исходник ниже (вклеен без изменений, уменьшен до 1080 px по ширине) + дорисованные полосы сверху/снизу: fal · `fal-ai/nano-banana-2/edit` | 2026-11-23 | Картина — общественное достояние; дорисовка — генерация fal. Подпись: «В. Кандинский. Синий всадник. 1903. Фонд Э. Г. Бюрле, Цюрих. Верх и низ дорисованы нейросетью» |
| `assets/art/kandinsky-blue-rider-9x16-try1-rejected.jpg` | Отклонённая попытка (модель перерисовала саму картину, добавила фигуры и вторую подпись) | `fal-ai/nano-banana-2/edit` | 2026-11-23 | не использовать; хранится как пример ошибки |

## Общественное достояние (Wikimedia Commons) — исходники для обработки

Лицензии подтверждены по викитексту страниц файлов 23.11.2026. Скачивание оригиналов с `upload.wikimedia.org` упёрлось в 429 (лимит запросов) — у нас и у серверов fal; Кандинский успел загрузиться.

| Работа | Автор, год, владелец | Страница файла на Commons | Оригинал (upload.wikimedia.org) | Лицензия (подтверждена) | Статус |
|---|---|---|---|---|---|
| «Бедная Лиза» | О. А. Кипренский (1782–1836), 1827, холст, масло, 45×39 см, Третьяковская галерея, инв. 26777 | https://commons.wikimedia.org/wiki/File:%D0%9A%D0%B8%D0%BF%D1%80%D0%B5%D0%BD%D1%81%D0%BA%D0%B8%D0%B9_%D0%B1%D0%B5%D0%B4%D0%BD%D0%B0%D1%8F_%D0%BB%D0%B8%D0%B7%D0%B0.jpg | https://upload.wikimedia.org/wikipedia/commons/9/91/%D0%9A%D0%B8%D0%BF%D1%80%D0%B5%D0%BD%D1%81%D0%BA%D0%B8%D0%B9_%D0%B1%D0%B5%D0%B4%D0%BD%D0%B0%D1%8F_%D0%BB%D0%B8%D0%B7%D0%B0.jpg (1721×2018) | `PD-Art-two-auto|1836` | не обработана — 429 при скачивании |
| «Синий всадник» | В. В. Кандинский (1866–1944), 1903, холст, масло, 52,1×54,6 см, Фонд собрания Э. Г. Бюрле, Цюрих | https://commons.wikimedia.org/wiki/File:Wassily_Kandinsky,_1903,_The_Blue_Rider_(Der_Blaue_Reiter),_oil_on_canvas,_52.1_x_54.6_cm,_Stiftung_Sammlung_E.G._B%C3%BChrle,_Zurich.jpg | https://upload.wikimedia.org/wikipedia/commons/7/7b/Wassily_Kandinsky%2C_1903%2C_The_Blue_Rider_%28Der_Blaue_Reiter%29%2C_oil_on_canvas%2C_52.1_x_54.6_cm%2C_Stiftung_Sammlung_E.G._B%C3%BChrle%2C_Zurich.jpg (1232×1183) | `PD-Art|PD-old-auto-expired|deathyear=1944` | **обработан** → `assets/art/kandinsky-blue-rider-9x16.jpg` |
| Симонов монастырь, 1882 | Н. А. Найдёнов (1834–1905), альбом «Москва. Монастыри», т. IV, лист 2 | https://commons.wikimedia.org/wiki/File:Simonov_monastery_moscow_1882.JPG | https://upload.wikimedia.org/wikipedia/commons/1/17/Simonov_monastery_moscow_1882.JPG | `PD-old` | не обработан — 429 |
| то же, другой скан листа | Н. А. Найдёнов, 1882 (т. IV, 1883); на снимке отмечены башня «Дуло» и Успенский собор | https://commons.wikimedia.org/wiki/File:Simonov_Monastery_Naydenov.jpg | https://upload.wikimedia.org/wikipedia/commons/4/42/Simonov_Monastery_Naydenov.jpg (1770×1530) | `PD-Russia-1996` (в поле Permission; источник — ЖЖ) — слабее, брать первый | запасной |

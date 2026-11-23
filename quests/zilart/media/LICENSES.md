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

# Траты на генерацию (fal)

Каждая платная генерация — строка здесь. Без одобрения в APPROVALS.md генераций нет (см. docs/fal-guide.md).

| Дата | Что | Модель | Штук | Оценка $ | request_id | Одобрение | Куда сохранено |
|---|---|---|---|---|---|---|---|
| 2026-11-23 | Тест: портрет Зили (A-FAL-1 п.1) | fal-ai/nano-banana-pro | 1 | 0,15 | 01a2091a-8c1a-7453-8e73-f680fa7d1fcb | A-FAL-1 (владелец в чате 23.11) | `quests/zilart/media/assets/test/zilya-portrait-v1.png` |
| 2026-11-23 | Тест: реплика Зили, озвучка (A-FAL-1 п.2) | elevenlabs/tts/eleven-v4, голос Charlie | 1 (~255 символов, 15 с) | ≈0,02 | 01a20982-9ef8-7f30-b5f2-84579bb8c6e5 | A-FAL-1 (владелец в чате 23.11) | `quests/zilart/media/assets/test/zilya-line-01.mp3` |
| 2026-11-23 | Озвучка (повтор: параллельная сессия уже сделала строку выше): первая реплика Зили, 242 симв., 17,2 с (A-FAL-1, спец 00 п.2) | elevenlabs/tts/eleven-v4 | 1 | 0,02 | 01a20980-e55f-7bf2-a05a-349def82a604 | A-FAL-1 (владелец в чате 23.11) | quests/zilart/media/assets/audio/zilya-01-intro-eleven-v4.mp3 |
| 2026-11-23 | Логотип v2, черновики «Окно» (T-58) | fal-ai/nano-banana-2 | 4 | 0,32 | 01a20981-f83b-71e1-bad9-1e263d57d78e | A-31 | platform/design/logo/fal/draft-a-okno-1…4.webp |
| 2026-11-23 | Логотип v2, черновики «Ключ» (T-58) | fal-ai/nano-banana-2 | 4 | 0,32 | 01a20981-f8b6-7b63-91d1-b8212c8bc3fb | A-31 | platform/design/logo/fal/draft-b-klyuch-1…4.webp |
| 2026-11-23 | Логотип v2, черновики «Кот» (T-58) | fal-ai/nano-banana-2 | 4 | 0,32 | 01a20981-f8a3-77c2-8090-b4347e6f2fa9 | A-31 | platform/design/logo/fal/draft-c-kot-1…4.webp |
| 2026-11-23 | Логотип v2, доработка «Окно» (T-58) | fal-ai/nano-banana-pro | 1 | 0,15 | 01a20983-2e8a-7d43-9852-d7313d97f7e9 | A-31 | platform/design/logo/fal/pro-a-okno.webp |
| 2026-11-23 | Логотип v2, доработка «Ключ» (T-58) | fal-ai/nano-banana-pro | 1 | 0,15 | 01a20983-2e33-7a40-bc05-bdeaa10a48ee | A-31 | platform/design/logo/fal/pro-b-klyuch.webp |
| 2026-11-23 | Логотип v2, доработка «Кот» (T-58) | fal-ai/nano-banana-pro | 1 | 0,15 | 01a20983-2e3f-74f1-9225-f636de4d40ef | A-31 | platform/design/logo/fal/pro-c-kot.webp |
| 2026-11-23 | Логотип, раунд 2: черновики «Золотая арка» (по фото владельца) | fal-ai/nano-banana-2/edit | 4 | 0,32 | 01a209b0-1388-7f40-9dbc-ca4a1c4622c5 | A-35 | platform/design/logo/fal/draft-d-arka-1…4.webp |
| 2026-11-23 | Логотип, раунд 2: черновики «Д-арка» (по эскизу владельца) | fal-ai/nano-banana-2/edit | 4 | 0,32 | 01a209b0-1398-7580-b377-b465c4b5d750 | A-35 | platform/design/logo/fal/draft-e-d-1…4.webp |
| 2026-11-23 | Логотип, раунд 2: доработка «Золотая арка» | fal-ai/nano-banana-pro/edit | 1 | 0,15 | 01a209b0-cdab-7e41-8eac-1bd00eb74c81 | A-35 | platform/design/logo/fal/pro-d-arka.webp |
| 2026-11-23 | Логотип, раунд 2: доработка «Д-арка» | fal-ai/nano-banana-pro/edit | 1 | 0,15 | 01a209b0-cd83-7cf2-9b18-2127af48fbbe | A-35 | platform/design/logo/fal/pro-e-d.webp |
| 2026-11-23 | Голос Зили v2, вариант А «голубиный» (спец 02), 279 симв. | elevenlabs/tts/eleven-v4, голос Callum | 1 | 0,022 | 01a209b0-ff58-7d60-94fe-4a6dfb404f24 | A-35 (голос) | quests/zilart/media/assets/audio/zilya-01-intro-v2a-callum-raw.mp3 |
| 2026-11-23 | Голос Зили v2, вариант Б женский (спец 02), 248 симв. | elevenlabs/tts/eleven-v4, голос Jessica | 1 | 0,020 | 01a209b1-26af-7493-b9e8-bfab59f2cca2 | A-35 (голос) | quests/zilart/media/assets/audio/zilya-01-intro-v2b-jessica.mp3 |
| 2026-11-23 | Воркование голубя, звуковой эффект 2,5 с (спец 02) | elevenlabs/sound-effects/v3 | 1 | 0,005 | 01a209b1-51e2-7c40-bea4-35fd1dbe1827 | A-35 (голос) | quests/zilart/media/assets/audio/pigeon-coo-sfx-01.mp3 |
| 2026-11-23 | Проверка слов в репликах А и Б (распознавание речи) | fal-ai/whisper | 3 | ≈0,01 | 01a209b1-da6b-7bd1-83b0-8dd0634b66e2; 01a209b1-e836-72d0-8c4a-d13a3951e1dd; 01a209b2-7668-7a43-b0ae-66feb99941a0 | A-35 (голос) | — (текст в voices.md) |
| 2026-11-23 | «Синий всадник» → 9:16, попытка 1 (отклонена: перерисовала оригинал) | fal-ai/nano-banana-2/edit | 1 | 0,08 | 01a209b5-c1ef-7713-b833-6a6a1d3dc892 | A-FAL-1 (спец 01) | quests/zilart/media/assets/art/kandinsky-blue-rider-9x16-try1-rejected.jpg |
| 2026-11-23 | «Синий всадник» → 9:16, попытка 2 (дорисовка полос, оригинал вклеен поверх) | fal-ai/nano-banana-2/edit | 1 | 0,08 | 01a209b6-c344-7320-96dd-baefc0233008 | A-FAL-1 (спец 01) | quests/zilart/media/assets/art/kandinsky-blue-rider-9x16.jpg |
| 2026-11-23 | «Бедная Лиза», плакат-черновик — ошибка 422 file_download_error (Commons 429), результата нет, оплата не ожидается | fal-ai/nano-banana-2/edit | 0 | 0 | 01a209bc-4cff-7ba3-bbea-3a1b22be2045 | A-FAL-1 (спец 01) | — |

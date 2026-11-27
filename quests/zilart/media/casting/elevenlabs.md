# ЗИЛАРТ в ElevenLabs: где что лежит

Озвучка, звуки и музыка дела делаются в ElevenLabs напрямую (владелец, 27.11). Аккаунт: тариф Creator, 131 000 кредитов в месяц. Рецепт — `../voices.md`, траты — `state/MEDIA_SPEND.md`.

## Папки

Через API нельзя создать папку голосов или переименовать голос. Поэтому папкой служит **flow** (холст в ElevenLabs → Flows), по одному на героя. Имена устроены так: «Дворами · <дело> · <номер> <герой или тема>». На холсте у каждого узла подпись вида «<герой> <буква> · <голос> · <реплика> · проба / В КВЕСТЕ».

| Flow | Что внутри | Ссылка |
|---|---|---|
| Дворами · ЗИЛАРТ · 1 Зиля | Callum (реплики в квесте) и Miron (кандидат) | [открыть](https://elevenlabs.io/app/flows/cQ7ZaFQhlb0yKutFTQOF) |
| Дворами · ЗИЛАРТ · 2 Тюфель | Tyufel, дизайн 1 и дизайн 2 | [открыть](https://elevenlabs.io/app/flows/96GiXQdBb1DqWSjS59Re) |
| Дворами · ЗИЛАРТ · 3 Лёва и Гоша (свидетели) | Лёва, Гоша, Радио | [открыть](https://elevenlabs.io/app/flows/xb71gaPrnc3UYkSoH0ms) |
| Дворами · ЗИЛАРТ · 4 Звуки и музыка | голубь, кот, шаги, трамвай, гудок, музыка | [открыть](https://elevenlabs.io/app/flows/QZeOQrfKUqSV2uPWKg0Z) |
| Дворами · ЗИЛАРТ · 5 Сведение и проверка | сведённые файлы, расшифровки, эталонное воркование 02a | [открыть](https://elevenlabs.io/app/flows/wQRcNpmZi5gLT0Vdv8i3) |

Следующее дело получает такой же набор: «Дворами · <дело> · 1 <главный герой>» и так далее.

**Голоса в библиотеке (My Voices).** Голоса, которые мы делаем сами, называются «Дворами · <дело> · <герой> · <вариант>». В метках у них стоит `project=dvorami`, `quest=zilart`, `hero=<id>`, `status=candidate`; утверждённому голосу метку `status` меняет владелец. Голос **Tyufel** создал владелец, поэтому имя у него своё. Переименовать его можно только в интерфейсе, например в «Дворами · ЗИЛАРТ · Тюфель · клон».

## Герой → голос → проба

| Герой | Вариант | voice_id | Голос в ElevenLabs | Проба | Статус |
|---|---|---|---|---|---|
| Зиля | A | `N2lVS1w4EtoT3dr4eOWO` | Callum — Husky Trickster (библиотечный) | [r3-zilya-a-callum.mp3](voices/r3-zilya-a-callum.mp3) | утверждён 23.11; 3 реплики в квесте |
| Зиля | B | `VlXLedwkU4YDM3HBGpiI` | Miron — Charismatic Storyteller (носитель русского) | [r3-zilya-b-miron.mp3](voices/r3-zilya-b-miron.mp3) | кандидат |
| Тюфель | G | `WiBxf9yrCDK641YK9Mul` | Tyufel (клон, создал владелец) | [r3-tyufel-g-tyufel-klad.mp3](voices/r3-tyufel-g-tyufel-klad.mp3), [r3-tyufel-g-tyufel-holodilnik.mp3](voices/r3-tyufel-g-tyufel-holodilnik.mp3) | кандидат; 1 реплика в квесте |
| Тюфель | H | `ed2YcN4Zbd3WnUQNcAyv` | Дворами · ЗИЛАРТ · Тюфель · дизайн 1 (бархатный) | [r3-tyufel-h-dizain1.mp3](voices/r3-tyufel-h-dizain1.mp3) | кандидат |
| Тюфель | I | `T0r7K4iw4aOeNHNc2u1e` | Дворами · ЗИЛАРТ · Тюфель · дизайн 2 (хитрый) | [r3-tyufel-i-dizain2.mp3](voices/r3-tyufel-i-dizain2.mp3) | кандидат |
| Лёва | E | `onwK4e9ZLuTAKqWW03F9` | Daniel — Steady Broadcaster (как d-daniel из раунда 2) | [r3-lyova-e-daniel.mp3](voices/r3-lyova-e-daniel.mp3) | кандидат |
| Лёва | F | `AcvYIdxAokX5Ipfbi2t0` | Alexei — Gravelly, Measured (носитель, пожилой) | [r3-lyova-f-alexei.mp3](voices/r3-lyova-f-alexei.mp3) | кандидат |
| Гоша | D | `CwhRBWXzGAHq8TQ4Fs17` | Roger — Laid-Back (как b-roger из раунда 2) | [r3-gosha-d-roger.mp3](voices/r3-gosha-d-roger.mp3) | кандидат |
| Гоша | E | `pbmtwylSjrg30q2xSLkh` | Andrii (носитель) | [r3-gosha-e-andrii.mp3](voices/r3-gosha-e-andrii.mp3) | кандидат |
| Радио | A | `k9ZXleqjmaifvVr58CqH` | Max Indy Travel (диктор, носитель) + фильтр «старое радио» | [r3-radio-a-max.mp3](voices/r3-radio-a-max.mp3) | кандидат |

## Звуки и музыка

Лежат в `../assets/audio/sfx/`. Все сделаны на `eleven_text_to_sound_v3` (по 4 варианта, 17 кредитов за штуку), музыка — на `eleven_music_v2_5` (2 варианта по 900 кредитов). Вариант выбран по замеру (чистота, длительность, темп), а не на слух.

| Файл | Что | Где звучит |
|---|---|---|
| `sfx-cat-purr.mp3` | мурлыканье кота | т.1, перед «Тюфель. Без „рощи“…» |
| `sfx-factory-whistle.mp3` | заводской гудок вдалеке | т.1, перед «Птенцов в нашем роду…» |
| `music-courtyard-mystery-30s.mp3` | «тайна во дворе», 30 с, 80 BPM, пиццикато и кларнет | т.1, тихо под «С этим не поспоришь…» |
| `sfx-pigeon-coo-v2.mp3` | новое воркование, кандидат на замену 02a | пока нигде: в квесте осталось 02a |
| `sfx-courtyard-steps.mp3` | шаги по брусчатке во дворе | пока нигде, это библиотека |
| `sfx-tram-distant.mp3` | далёкий трамвай со звонком | пока нигде, это библиотека |

## Как файл попадает в репозиторий

Сеть среды закрыта для `elevenlabsusercontent.com`. Поэтому сведение делается в песочнице ElevenLabs (`creative_execute_sandbox`, там есть ffmpeg), готовые файлы забирает workflow `fetch-media.yml` (поле `batch`, один коммит), затем файл перекодируется до 80 kbps моно и громкость выравнивается по `ebur128`. Подробно — `../voices.md`.

# Тест fal: портрет Зили + реплика озвучки

Пробная генерация, одобрена владельцем в чате 23.11 («проверь на одной задаче: изображение, короткое аудио»). Ждёт пополнения баланса fal.

## 1. Изображение — сыщик Зиля

- Модель: `fal-ai/nano-banana-pro` (≈ $0,15), запасной вариант — `fal-ai/nano-banana-2` (≈ $0,08)
- Параметры: `aspect_ratio: "4:5"`, `resolution: "1K"`, `num_images: 1`, `output_format: "png"`
- Промпт:

```
Character illustration for a family detective city quest app. A dove-grey pigeon detective named Zilya stands upright in three-quarter view: a bright, kind, curious eye, a small signal-red scarf, holding a large brass magnifying glass in one wing as if examining a clue.
Style: 1920s constructivist avant-garde poster — flat bold geometric shapes, strong diagonal composition, a large red circle behind the bird, two black diagonal bars, subtle halftone paper texture. Limited palette: deep black #111111, off-white #F3F1EA, signal red #E1251B; the pigeon in soft blue-grey is the only cool colour.
Clean, vector-like edges and a strong silhouette that reads at small size on a phone screen. Generous off-white margin around the composition.
No text, no letters, no numbers, no logos, no watermark.
```

## 2. Озвучка — первая реплика Зили (~15 с)

- Модель: `elevenlabs/tts/eleven-v4` (≈ $0,08 за 1000 символов; реплика ~230 символов ≈ $0,02)
- Параметры: `language_code: "ru"`, `voice: "Charlie"`, `stability: 0.4`, `similarity_boost: 0.75`, `output_format: "mp3_44100_128"`
- Текст (из сценария, точка 1):

```
[playful] Курлык. То есть здравствуйте! Сыщик Зиля, отдел пропавших чудес. В архиве завода нашли телеграмму: «Синяя птица дома. Встречайте». Ни подписи, ни даты. [conspiratorial] Поможете? Только поторопимся — птицу ищет ещё кое-кто. С усами.
```

## Итого

Оценка ≈ $0,17–0,20. Результаты сохранить в `quests/zilart/media/assets/test/`, записать в `state/MEDIA_SPEND.md`.

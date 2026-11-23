# Обработка общественного достояния через fal — ЗИЛАРТ

Одобрено: A-FAL-1, потолок $0,70; потрачено $0,16 (п. 3), остаток ≈ $0,54. Исходники и лицензии — `../LICENSES.md`; правила о правах — `docs/fal-guide.md` («Чужие изображения»).
Блокер п. 1–2: `upload.wikimedia.org` отвечал 429 и нам, и серверам fal (23.11) — повторить позже или попросить владельца скачать оригинал.

## Как достраивать формат (урок п. 3)
Правка «одним запросом» перерисовывает всю картину (цвета, лишние фигуры, подпись). Рабочий способ: холст нужного формата, оригинал в центре, размытые полосы-заглушки → модель дорисовывает полосы → **оригинал вклеивается обратно без изменений** (PIL/ffmpeg, мягкий край 28 px; светлую кромку скана убрать до вклейки).

## 1. «Бедная Лиза», Кипренский (1827) → точка 3, пруд
- **1а. Живая картина**, 5 с без звука, перед репликой Лизы: `alibaba/wan-3.0-prime/image-to-video`, `duration: 5`, `audio: false`, `resolution: "720p"` — ≈ $0,25.
  Промпт (фон картины ровный, листвы нет): `a light breeze moves loose strands of hair and the ribbon, the flowers in her hand tremble slightly, she blinks slowly once, soft breathing. Static camera, no zoom, plain dark background stays still, preserve the oil-painting texture and colours exactly.`
- **1б. Плакат «Авангард»** для карточки: `fal-ai/nano-banana-2/edit` (черновик ≈ $0,08), финал `fal-ai/nano-banana-pro/edit` (≈ $0,15), `aspect_ratio: "4:5"`.
  Промпт: `Reinterpret this painting as a 1920s constructivist avant-garde poster: keep the young woman's pose, head tilt and silhouette recognisable; flat geometric shapes, strong diagonal, a large red circle behind her, limited palette black #111111, off-white #F3F1EA, signal red #E1251B, halftone paper texture. No text, no letters, no watermark.`

## 2. Симонов монастырь, Найдёнов (1882) → история Лисьего пруда, «было/стало»
- Исходник — `File:Simonov_monastery_moscow_1882.JPG` (`PD-old`).
- Увеличение и реставрация (`prepare_media_transform` → `upscale_image`, ×2) — центы; по желанию оживление как 1а (≈ $0,25).
- Без колоризации (цвет нейросети — выдумка); если всё же — подпись «колоризация».

## 3. «Синий всадник», Кандинский (1903) → точка 8 — сделано
`assets/art/kandinsky-blue-rider-9x16.jpg`, `fal-ai/nano-banana-2/edit`, способ — выше.

## Бесплатно, кодом
Дуотон, полутон, обрезка, фактура, контраст — ImageMagick/CSS. fal — только для оживления, достраивания формата, реставрации, перерисовки в стиль.

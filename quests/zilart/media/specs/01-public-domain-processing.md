# Обработка общественного достояния через fal — 3 примера для ЗИЛАРТа

Статус (23.11.2026): одобрено (A-FAL-1, потолок $0,70). **Сделан п. 3 «Синий всадник»** ($0,16, 2 попытки) → `assets/art/kandinsky-blue-rider-9x16.jpg`. **П. 1 и 2 заблокированы:** `upload.wikimedia.org` отвечает 429 (лимит запросов) и нам, и серверам fal. Лицензии и адреса оригиналов подтверждены — в `../LICENSES.md`. Осталось из потолка ≈ $0,54.

Уроки исполнения:
- Достраивание формата «одной правкой» модель делает перерисовкой всей картины (меняет цвета, дорисовывает фигуры и подпись). Рабочий способ: холст нужного формата с оригиналом в центре и размытыми полосами-заглушками → модель дорисовывает полосы → **оригинал вклеивается обратно без изменений** (ffmpeg/PIL, мягкий край 28 px). Край холста исходника (светлая полоска) — убрать до вклейки.
- «Бедная Лиза»: фон картины — ровный коричневый, листвы нет; промпт 1а поправить: `a light breeze moves loose strands of hair and the ribbon, the flowers in her hand tremble slightly, she blinks slowly once, soft breathing. Static camera, no zoom, plain dark background stays still, preserve the oil-painting texture and colours exactly.`
- Симонов: брать `File:Simonov_monastery_moscow_1882.JPG` (лицензия `PD-old`).

## Почему именно так (авторское право)

- Обработка нейросетью **не снимает авторское право**: «перерисованная» чужая фотография — производное произведение, права остаются у автора. Поэтому исходники берём только такие:
  1. **Общественное достояние**: автор умер более 70 лет назад (в РФ — с 1 января следующего года; для участников ВОВ +4 года), анонимные фото, опубликованные давно. Картины XIX века — смело; Кандинский (ум. 1944) — в общественном достоянии с 2015 г.
  2. **Свободные лицензии**: CC0 и CC BY / BY-SA (с указанием автора; BY-SA — результат под той же лицензией).
  3. **Собственные фото владельца** (полевой тест, выезды) — лучший источник: прав нет ни у кого, кроме владельца.
- Источник — Wikimedia Commons: на странице файла должна стоять лицензия (PD-old, PD-Art, CC0, CC BY…). Фото музеев с сайтов музеев не брать — музей может заявлять права на снимок.
- В `media/LICENSES.md` для каждого файла: исходник (ссылка на страницу Commons), автор, год, лицензия, что сделано, модель fal.

## Примеры

### 1. «Бедная Лиза» Ореста Кипренского (1827) → точка 3, пруд
- Исходник: Commons, «Kiprensky Poor Liza.jpg» (Третьяковская галерея; PD-Art — художник умер в 1836).
- **1а. Живая картина** — 5 с, без звука: ветер в волосах и листве, медленное моргание, камера неподвижна. Модель `alibaba/wan-3.0-prime/image-to-video`, `duration: 5`, `audio: false`, `resolution: "720p"` — ≈ $0,25. Место: экран точки 3, перед репликой Лизы.
  Промпт: `Subtle living-painting motion: a light breeze moves loose strands of hair and the leaves in the background, she blinks slowly once, soft breathing. Static camera, no zoom, preserve the oil-painting texture and colours exactly.`
- **1б. Плакат «Авангард»** — та же сцена в стиле квеста для карточки на сайте. `fal-ai/nano-banana-2/edit` (черновик, ≈ $0,08), финал — `fal-ai/nano-banana-pro/edit` (≈ $0,15). `aspect_ratio: "4:5"`.
  Промпт: `Reinterpret this painting as a 1920s constructivist avant-garde poster: keep the young woman's pose, head tilt and silhouette recognisable; flat geometric shapes, strong diagonal, a large red circle behind her, limited palette black #111111, off-white #F3F1EA, signal red #E1251B, halftone paper texture. No text, no letters, no watermark.`

### 2. Симонов монастырь, фото 1880-х (колокольня) → история Лисьего пруда, «было/стало»
- Исходник: архивная фотография 1886–1890 из собрания РГБ — **только если** на Commons есть копия с PD-лицензией (автор неизвестен, опубликовано > 70 лет назад). Нет такой — пример заменяем гравюрой XIX века с Commons.
- Обработка: увеличение и реставрация (`prepare_media_transform` → `upscale_image`, ×2) — центы; затем по желанию «оживление» как в 1а (≈ $0,25).
- Без колоризации: цвет «из головы» нейросети выдаёт выдумку за историю. Если колоризуем — подпись «колоризация».

### 3. «Синий всадник» Кандинского (1903) → точка 8, улица Кандинского
- Исходник: Commons, «Wassily Kandinsky, 1903, The Blue Rider (Der Blaue Reiter)…jpg» — общественное достояние (Кандинский ум. 1944).
- Обработка: `outpaint`/edit до вертикали 9:16 для экрана телефона, сохраняя сам холст в центре: `fal-ai/nano-banana-2/edit` ≈ $0,08.
  Промпт: `Extend this painting vertically to a 9:16 phone format: continue the hillside and sky above and below in the same brushwork and palette, keep the original painting untouched in the centre. No text, no frame, no watermark.`

## Что делать без денег (бесплатно, кодом)

Дуотон, полутон, обрезка, «бумажная» фактура, контраст — делаются локально (ImageMagick/CSS) и бесплатно. fal — только там, где ИИ даёт то, чего не сделать фильтром: оживление, достраивание формата, реставрация, перерисовка в стиль.

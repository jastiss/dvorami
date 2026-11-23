# Логотип «Дворами», версия 2 — ТЗ и промпты для fal (T-58, одобрение A-31)

Дата: 23.11.2026 · Арт-директор / Медиапродюсер.
Бюджет: потолок $1,50. Черновики `fal-ai/nano-banana-2` — 3 направления × 4 = 12 картинок (≈ $0,96). Доработка 3 лучших — `fal-ai/nano-banana-pro` (≈ $0,45). Итого ≈ $1,41.

## Что не так с первой версией

Все три отвергнутых знака (`d-arka`, `d-marshrut`, `d-kvartal`) — одна идея: буква «Д», в которую вписан двор. Буква-трапеция на ножках в 16 px читается как «домик» или «стол», арка и точка пропадают. Знак получился про букву, а не про ощущение продукта: в нём нет ни тайны, ни находки, ни живого двора.

## Что знак должен говорить

Дворы (а не «город вообще») · тайна и находка · прогулка · город как загадка · детектив без нуара: тёплый, с улыбкой, для компании и семьи. Знак — один предмет с сильным силуэтом, а не сцена.

## Решение про текст

**Генерируем без текста.** Слово «Дворами» ставится вёрсткой — Unbounded 800 из `BRAND.md`. Модель кириллицу в логотипе рисует неточно, а нам от генерации нужна только идея формы; финальный знак чертится руками в SVG.

## Общие требования к картинке (в каждом промпте)

- плоский векторный знак, 2 цвета: тёмно-синий `#0E1630` и жёлтый `#FFC53D` на светлом фоне `#F3F1EA` (на светлом легче оценить силуэт; на тёмный переведём в SVG);
- одна фигура по центру, поля ≥ 20 %, без градиентов, теней, обводок-«волосков»;
- читается пятном в размере 16 px: не больше 3–4 крупных форм;
- 1:1, 1K, `num_images: 4`.

## Направление A — «Окно» (свет в чужом дворе)

**Идея.** Вечерний двор: тёмный дом и одно горящее окно. Самая короткая формула тайны без нуара — «там кто-то есть, там что-то случилось, пойдём посмотрим». Жёлтый бренда получает смысл: это свет, на который идут.
**Отличие от отвергнутых.** Нет буквы. Знак — сетка окон с одним «не таким»: это уже загадка («найди отличие»), и она собирается из квадратов — чисто ложится в пиксели фавикона.

```
Create an original, non-infringing logo mark for a brand of self-guided city mystery walks through quiet residential courtyards. The mark is a flat vector icon of the front of a small apartment house seen straight on, drawn as one solid dark navy shape (#0E1630) with a simple roof line. The facade holds a small regular grid of square windows cut out of the dark shape, and exactly one window glows in warm yellow (#FFC53D), placed off-centre, as if someone is still awake there. The single lit window is the whole point of the mark: one warm clue in a sleeping house.

Composition: a single centred mark with generous empty padding on a plain warm off-white background (#F3F1EA). Bold geometric shapes, strong silhouette, balanced negative space, at most nine windows, so the icon stays readable when shrunk to a 16-pixel favicon. Two flat colours only, crisp edges, flat fill without gradients, shadows or texture. Friendly and curious mood, like the cover of a clever children's detective book, modern geometric graphic design.

No text, no letters, no numbers, no watermark, no trademarks. Square 1:1.
```

## Направление B — «Ключ» (у каждого двора свой ключ)

**Идея.** Ключ, у которого бородка — силуэт крыш и домов. Двор — закрытое место, квест — ключ к нему; разгадка «открывает» город. Ключ — старый и понятный знак тайны и приключения, без криминала.
**Отличие от отвергнутых.** Предмет, а не буква и не план квартала. Вытянутый диагональный силуэт с круглой головкой узнаётся по контуру даже в 16 px; жёлтый — в кольце головки (двор-колодец, вид сверху).

```
Create an original, non-infringing logo mark for a brand of self-guided city mystery walks through hidden courtyards. The mark is a flat vector icon of an old-fashioned door key drawn as one bold solid dark navy shape (#0E1630). The teeth of the key are shaped like a tiny row of city rooftops: two or three simple house silhouettes of different heights with flat and pitched roofs, so the key bit doubles as a skyline. The round head of the key is a thick ring, and the hole inside the ring is filled with warm yellow (#FFC53D), like a lit courtyard seen from above. The key is tilted diagonally at about 45 degrees, head at the upper left, teeth at the lower right.

Composition: a single centred mark with generous empty padding on a plain warm off-white background (#F3F1EA). Chunky geometric shapes, thick shaft, strong silhouette, balanced negative space, very few details so it stays readable when shrunk to a 16-pixel favicon. Two flat colours only, crisp edges, flat fill without gradients, shadows or texture. Playful and adventurous mood, modern geometric graphic design.

No text, no letters, no numbers, no watermark, no trademarks. Square 1:1.
```

## Направление C — «Кот» (дворовый проводник)

**Идея.** Дворовый кот, чей хвост загнут вопросительным знаком. Кот — настоящий хозяин любого двора и свидетель всего, что там было; хвост-вопрос — загадка. Это характер: тёплый, чуть хитрый — тот самый «детектив без нуара». Даёт бренду персонажа для стикеров, канала, пустых состояний.
**Отличие от отвергнутых.** Живое существо вместо архитектуры и буквы; силуэт с двумя ушами и крючком хвоста не путается ни с «домиком», ни с «булавкой карты». Жёлтый — глаз (или точка под вопросом-хвостом).

```
Create an original, non-infringing logo mark for a brand of self-guided city mystery walks through quiet courtyards. The mark is a flat vector icon of a sitting courtyard cat seen from the side, drawn as one bold solid dark navy silhouette (#0E1630) built from simple geometric shapes: a rounded body, a round head with two sharp triangular ears. The cat's tail rises behind its back and curls into the clear shape of a question mark. The cat looks back over its shoulder at the viewer with a single round eye in warm yellow (#FFC53D). The cat is calm, clever and a little sly, a local who knows every secret of the yard.

Composition: a single centred mark with generous empty padding on a plain warm off-white background (#F3F1EA). Chunky geometric shapes, strong unmistakable silhouette, balanced negative space, very few details so it stays readable when shrunk to a 16-pixel favicon. Two flat colours only, crisp edges, flat fill without gradients, shadows, whiskers or fur texture. Warm and witty mood, modern geometric graphic design.

No text, no letters, no numbers, no watermark, no trademarks. Square 1:1.
```

## Отбор и доработка (nano-banana-pro) — сделано 23.11

Черновики: 12 шт., все три направления дали рабочие эскизы (`fal/draft-*.webp`). Замечания и что ушло в доработку — по одному на направление:

- **A «Окно»** — все 4 черновика вышли «иконкой коттеджа» (двускатная крыша, труба): похоже на сайт недвижимости. В доработке: городской дом в два уступа, плоская кровля, 6 крупных окон, горящее — чуть больше.
- **B «Ключ»** — лучший силуэт у № 1 и № 4, но бородка — каша мелких деталей. В доработке: ровно три глухих домика на стержне, без окон.
- **C «Кот»** — лучший № 2 (хвост-вопрос не отрывается от кота). В доработке: кот анфас, два крупных жёлтых глаза, точка вопроса отдельно.

Промпты доработки — те же три текста с этими уточнениями; точные тексты сохранены в истории fal по `request_id` из `state/MEDIA_SPEND.md`. Результат: `fal/pro-a-okno.webp`, `fal/pro-b-klyuch.webp`, `fal/pro-c-kot.webp`.

Оригиналы PNG (9,5 МБ) в репозиторий не кладём: сохранены копии WebP 1024 px (220 КБ на все 15). Это эскизы, а не исходники знака.

## Перевод в вектор — сделано 23.11

Картинки fal — эскизы; знаки начерчены руками на сетке 48 × 48, 2 цвета (`currentColor` + `#FFC53D`):

| Файл | Что изменено относительно эскиза |
|---|---|
| `v2-okno.svg` | 8 окон 8 × 8 с перемычками 3,5 — в 16 px каждое окно ≈ 2,7 px; горящее окно — верхний этаж высокой части |
| `v2-klyuch.svg` | ключ под 45°, три домика разной высоты (башня, дом со скатной крышей, низкий), кольцо головки толще |
| `v2-kot.svg` | хвост соединён с котом (как в черновике № 2), точка вопроса — жёлтая, глаза — два жёлтых круга |

`v2-*-lockup.svg` — знак + слово «дворами» (Unbounded 800, строчными, как в шапке сайта; шрифт встроен в файл). Перед постановкой на сайт слово перевести в кривые.

Проверка: Playwright, локальный файл `logo-options-v2.html`, 1440 и 390 px, знаки в 16 и 32 px на тёмном и светлом — все три узнаются; горизонтальной прокрутки нет. Скриншоты: `platform/design/screens/2026-11-23/logo-options-v2.png`, `logo-options-v2-390.png`.

Итог трат: 12 × $0,08 + 3 × $0,15 = **$1,41** из $1,50.

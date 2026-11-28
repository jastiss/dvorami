# Сцены ЗИЛАРТа в стиле 4 (гуашь): лист героев и 7 кадров

Основание: A-66 (27.11) — стиль 4 утверждён, потолок $7. Потрачено **$2,55** (17 генераций, по строкам — `state/MEDIA_SPEND.md`).
Модель всех кадров — `fal-ai/nano-banana-pro/edit`, 2K (1792×2400), 3:4, JPEG. Text-to-image не использовался: всё рисуется от листа героев.

## Лист героев — эталон для всех следующих кадров

![Лист героев](ref-sheet-4.jpg)

- Файл: `ref-sheet-4.jpg` (1600 px; оригинал 2400×1792 — fal Assets, `assetRecordId dc4g6tsregj0ilpg3re0`, request `01a21b2e-0329-72e2-9496-ca87fb038058`, seed 2711).
- Референсы: `casting/zilya-4-gouache.jpg`, `casting/tyufel-4-gouache.jpg`, `casting/round2-scene-meet-4.jpg` (соотношение роста).
- Что зафиксировано: стоящий Зиля ≈ 0,6 высоты сидящего Тюфеля (глаз голубя на уровне подбородка кота); голова Зили ≈ 0,55–0,6 головы кота; у Зили шарф, значок на груди, гильза на правой лапе, крылья без «пальцев»; у Тюфеля кремовая грудь, хвост вопросом, на нём ничего не надето. Восемь выражений — все дружелюбные.
- Число для головы на листе (≈ 0,6) меньше, чем в каноне `specs/02-casting.md` (0,8–0,9): на листе герои выглядят естественнее. Канон стоит поправить под лист — вопрос владельцу.

## Кадры

Файл для плеера — `site/play/zilart/media/scenes/<имя>.jpg` (810×1080, ≤ 165 КБ). Исходник 2K для анимации — в fal Assets, коллекция `dc3qu2sregj2mdo1pq3g`; полный текст промпта любого шага — рецепт по `request_id`.

| Кадр | Где в квесте | Исходник 2K (request_id · assetRecordId) | seed | Как получен |
|---|---|---|---|---|
| `s01-kurlyk` | точка 1, сцена: «Курлык! Вы по делу?» | `01a21b2f-b259-7f11-a04e-a0d74fbc5ecf` · `dc4g6u4regjfjkhg3sag` | 2701 | от листа, 1 проход; бумажное поле обрезано |
| `s02-amo-1931` | вступление: голубь Амо несёт письмо над заводом | `01a21b2f-b2ae-7a62-943b-520ce6c4f70a` · `dc4g6ukregjfjkhg3t7g` | 2702 | от листа (стиль и сложение голубя), 1 проход; поле обрезано |
| `s03-bench` | точка 3, сцена: встреча с Тюфелем | `01a21b2f-b2af-7d20-b096-58e71af0a89d` · `dc4g6usregjftvpg3tsg` | 2703 | от листа, 1 проход; поле обрезано |
| `s04-strip` | точка 6, шаг 1: полоска на просвет | `01a21b34-c047-7420-b4ac-a3695af0e2d4` · `dc4g6vcregj0ilpg3uh0` | 2744 | лист + `s03` → `01a21b31-3e49…` (2714) → без поля `01a21b33-f05d…` (2734) → голубь ×1,3 |
| `s05-badge` | точка 8, шаг 5: Тюфель возвращает значок | `01a21b33-1361-7393-97c2-ba9146acb5b8` · `dc4g6vkregj0m3pg3uu0` | 2735 | лист + `s03` → `01a21b31-3e4b…` (2715) → голубь ×1,4 `01a21b32-6121…` (2725) → отъезд на 12% |
| `s06-tree` | точка 10, после протокола: отдых под деревом | `01a21b32-611f-79b0-bf67-0245e5f47fc0` · `dc4g6vsregjfjkhg3vag` | 2726 | лист + `s03` → `01a21b31-3e8b…` (2716) → голубь ×1,4 |
| `s07-flight` | эпилог: Зиля несёт Тюфеля над крышами | `01a21b31-3e85-7f83-a6a8-b6dea26c36e5` · `dc4g70cregj0ilpg40bg` | 2717 | правка `casting/round2-scene-fly-4.jpg` + лист: новые лица, 3:4, без красного мазка |

Брак первого прохода (не сохранён): `s04`–`s07` от одного листа — стиль уплыл в плоский мультфильм, кот худой, шарф и значок оказались на коте (requests `01a21b2f-b2a8…`, `-b2ab…`, `-b2a6…`, `-b2aa…`). Вылечилось вторым референсом — принятой сценой `s03`.

## Промпты

Общий каркас двухгеройной сцены (менялись блоки SCENE и BACKGROUND):

```
Image 1 is the approved character reference sheet; image 2 is an approved finished scene with the same two characters. Paint ONE new scene in exactly the same gouache painting style, character designs and relative sizes as image 2 (do not copy its bench or composition; do not reproduce the sheet layout).
Tyufel is the same huge, fat, lordly ADULT ginger tabby cat as in image 2: massive round body and belly, wide cheeks, half-closed amber eyes, striped question-mark tail. He wears NOTHING: no scarf, no collar, no badge. Zilya is the same plump blue-grey pigeon: ONLY Zilya wears the red scarf, the round brass badge on his chest and the tiny metal tube on his leg.
SIZE CANON: the cat is much bigger and heavier than the pigeon; Zilya's whole body is 0.6-0.7 of Tyufel's body length (tail excluded), Zilya's head is slightly smaller than Tyufel's head.

SCENE: <кто где, поза, выражение каждого; «Exactly two characters; cat: four paws, one tail; pigeon: two wings (no hands), two legs»>
BACKGROUND: very simple, in large soft shapes: <2–3 крупных пятна>. No small details, no signs, no other figures, no recognisable landmarks.
COMPOSITION for later animation: vertical 3:4; the painting fills the entire canvas edge to edge with NO paper border, no white margin, no vignette; both characters fully inside the frame with generous free space around them, tail not cropped.
No text, no letters, no numbers, no logos, no watermark.
```

Блоки SCENE:
- **s01** — Zilya alone, full body, standing on a low stone kerb at the edge of an autumn city park, greeting the viewer like a cheerful little detective who is glad you came; happy, proud, welcoming expression, beak slightly open in a smile; chest puffed out so the brass badge catches the light; one wing lifted a little in a friendly wave (a real feathered wing, never a hand), the other folded.
- **s02** — autumn 1931: a carrier pigeon named Amo, the great-great-grandfather of the pigeon on the sheet: same plump blue-grey body, green-violet neck sheen, round orange-red eyes, but NO scarf and NO badge, a tiny metal message tube on one leg. He flies from left to right in an easy, confident glide, bright, calm, purposeful. Far below: long factory workshops with sawtooth roofs, two tall brick chimneys with thin smoke, a hint of a river, pale dawn sky; muted old-photograph palette, one tiny plain red flag.
- **s03** — first meeting: Tyufel lounges on a wooden park bench like a lord on a sofa, one front paw on his round belly, chin raised, half-closed eyes, calm and dignified with a faint good-natured, slightly sly look. Zilya stands on the armrest, wings folded, leaning toward the cat with a curious, friendly, lively expression.
- **s04** — Zilya stands on a low round stone bollard and holds a long narrow strip of old yellowed paper in his beak; low sun shines through it from behind. Big fat Tyufel sits right next to the bollard and peers up at the strip with one eye narrowed like an expert, a pleased knowing smile, one front paw raised. The strip is completely blank: no writing, no lines, no marks.
- **s05** — river embankment at early dusk: Zilya's brass badge is not on his chest; it lies on the paving between the friends. Tyufel gently pushes it back toward the pigeon with one front paw, with a genuinely warm, kind, encouraging smile. Zilya looks up at him with wide, surprised, hopeful eyes and the beginning of a smile. Tender and hopeful: no tears, no drooping, no frowning.
- **s06** — an old tree whose trunk divides at the ground into two trunks in a narrow V. Tyufel lies on the grass at its foot, paws tucked, eyes closed in a blissful smile. Zilya perches on a low branch directly above, looking down with a happy, proud, peaceful smile.
- **s07** (правка кадра) — keep style, city, body poses, wings, the cat's size; change the faces so that the flight looks light, easy and joyful instead of strained: Zilya — no frown, no worried eyebrows, no gritted beak; happy proud face, beak open in a cheerful laugh, eyes sparkling. Tyufel — big delighted smile, eyes bright with wonder, front paws spread like wings. Remove the red brushstroke and the red tower; 3:4, no border.

Правка размера (s04–s06): `Edit image 1. Keep everything exactly as it is … Change ONLY the pigeon: he is too small. Redraw the same pigeon about 1.4 times bigger … the pigeon's head must be a little more than half the size of the cat's head … exactly like the two full-body figures on the reference sheet in image 2.` Работает с первого раза, остальное в кадре не меняется.

## Под анимацию (image-to-video)

- Один кадр — одна поза; фон из крупных пятен, без мелкого шума; герои целиком в кадре. Исходник — 2K из fal Assets (в плеере лежит уменьшенная копия).
- Тесные места: в `s01` кончик правого крыла, в `s02` кончик левого крыла и в `s05` хвост Зили подходят к краю вплотную — для ролика с движением в ту сторону сначала расширить кадр (`/edit`: «zoom out 12%, extend the scene»), это $0,15.
- Модель и цена — `docs/fal-guide.md` (Kling 2.5 turbo pro, $0,35 за 5 с). Что двигать: `s01` — взмах крыла, моргание; `s02` — крылья, дым, флажок; `s03` — хвост кота, наклон головы Зили; `s04` — полоска качается, свет мерцает; `s05` — лапа двигает значок, блики на воде; `s06` — листья падают, кот дышит; `s07` — крылья, шарф, город уходит назад.
- Negative для всех: `morphing, extra limbs, extra tail, extra wings, hands, text, change of character size`.

## Что проверено глазами

Анатомия (два крыла, две лапы у Зили; четыре лапы и один хвост у Тюфеля), нет букв и подписей, нет ответов загадок: полоска пустая, значок без надписи, дерево с двумя стволами показано только после ответа. Выражения — дружелюбные во всех кадрах. Реальные объекты (пергола, медный дом, набережная с её оградой) не рисовались: фон условный, по правилу от 24.11.

## Очередь 2 (27.11, указание «рисуй все нужные иллюстрации»): ещё 12 кадров

План по экранам, статусы и вторая очередь — `plan-2026-11-27.md`. Потрачено $3,15 (21 генерация), A-66 всего $5,70 из $7. Исходники 2K теперь лежат рядом (`sNN-*.jpg`), версии для плеера — `site/play/zilart/media/scenes/` (810×1080, ≤ 105 КБ).

| Кадр | Где в квесте | request_id (принятый) | seed | Как получен |
|---|---|---|---|---|
| `s00-cover` | вступление, первый экран | `01a21ebe-e45b-76d0-b48a-23134f38ab6a` | 2820 | лист + `s03`, 1 проход |
| `s08-tail` | точка 1, разминка: хвост из-за угла | `01a21ec1-1946-7093-824c-cc830944b2b6` | 2828 | проход 1 (2808) → правка: крыло было «рукой с пальцем» |
| `s09-pond` | точка 2, сцена | `01a21ebe-da6a-7282-a16d-ba1708f83afd` | 2809 | 1 проход |
| `s10-press` | точка 4, «Немец» | `01a21ec1-1a5a-7de3-9204-5fa57c897c40` | 2830 | проход 1 (2810) → голубь ×1,3, значок на груди вместо медали на ленте |
| `s11-doves` | точка 5, сцена | `01a21ebe-d9dc-7931-bbac-3736ed781468` | 2811 | 1 проход |
| `s12-woodpile` | точка 5, поворот: Амо на поленнице, 1931 | `01a21ebe-da1b-72f1-9aba-aa3bbbc578b9` | 2812 | лист + `s03` + `s02` (палитра 1931), 1 проход; бумажное поле обрезано (1541×2054) |
| `s13-arch` | точка 7, под золотым сводом | `01a21ec1-1944-7983-9239-ca8304dfc2a3` | 2833 | проход 1 (2813: пионерский галстук, значок-щит) → голубь перерисован по листу |
| `s14-river` | точка 8, начало | `01a21ec1-196a-72f3-8c89-198767b81430` | 2834 | проход 1 (2814) → голубь ×1,6 |
| `s15-walk` | точка 9, сцена | `01a21ec1-194a-73e1-bc86-4103fcaab9df` | 2835 | проход 1 (2815: мультяшные глаза, медаль на цепочке) → глаза и значок по листу |
| `s17-meeting-1931` | точка 10, развязка: Лиза и Сева под деревом | `01a21ebe-e480-7e82-9b0d-1ed4efafa4cf` | 2817 | `s02` + `s03` (стиль и палитра), без героев-зверей, 1 проход |
| `s18-pergola` | эпилог, сцена | `01a21ec1-1988-7eb2-870c-8cba97253119` | 2838 | проход 1 (2818) → крыло без «пальца», голубь крупнее (вышел ≈ 0,5 кота — на границе канона) |
| `s19-farewell` | финал, последняя строка | `01a21ebe-e3fc-7271-a59f-5b4d7e8dc2fa` + `01a21ec1-1967-7cb2-bce8-2fe789d81aa5` | 2819, 2839 | в правке (фон — высотки, значок на груди) пропал шарф; шарф перенесён из прохода 1 маской по красному (PIL), без генерации |

Брак: `s16-wetpaw` (точка 10, мокрая лапа на обороте письма) — в проходе 1 голубь мал и крыло у клюва «рукой», в правке (`01a21ec1-195e-73f2-8e3e-e8d463cda01d`) — три крыла. Не сохранён; заново — во второй очереди.

Что добавить в каркас промпта (уроки очереди 2):
- «the pigeon is a BIG plump bird» в SIZE CANON не хватает: в 5 кадрах из 8 двухгеройных голубь снова вышел мелким. Правка размера по-прежнему лечит с первого раза.
- Жест крылом («points», «beckons», «salute») почти всегда даёт руку с пальцами. Писать: «one smooth feathered wing … ending in a pointed tip of long flight feathers; no fingers, no thumb». Жест «крыло к клюву» не заказывать.
- Значок: «a small ROUND plain brass badge pinned directly on his chest feathers (no chain, no ribbon, not a hanging medal)» — иначе выходит медаль на ленте.
- В правке «change ONLY these details» перечислять и то, что должно остаться на герое (шарф!): в `s19` шарф пропал, потому что не был назван.
- Вне листа уплывают глаза (белок вокруг зрачка) — «round orange-red eyes with NO white around them».
- Фоны: по-прежнему условные (крупные пятна), реальные фасады не воспроизводились; пергола, золотой проход, бетонные голуби, старый пресс — обобщённые.

## Очередь 3 (28.11): широкий формат 16:9, арка заново, 6 новых сцен

Основание: указания владельца 28.11 («герои обрезаются — делать широкими», «арка не та», «пресс не тот», «делай другие рисунки» = A-88). Потрачено **$1,65** (11 генераций, `state/MEDIA_SPEND.md`), лимит $2,00. Все кадры — `fal-ai/nano-banana-pro/edit`, 2K (2752×1536), **16:9**, JPEG; референсы — `ref-sheet-4.jpg` + `s03-bench`. Версии для плеера — 1080×603, `.webp` 33–64 КБ. Куда ставить — `../placements-5.7.md`.

| Кадр | Где в квесте | request_id (принятый) | seed | Как получен · по чему нарисован реальный объект |
|---|---|---|---|---|
| `s00-cover` | обложка | `01a22061-58e7-7883-a34c-9115d8997ce6` | 2940 | правка прежней обложки 3:4: «repaint as wide 16:9, both characters in the centre, 12% margin» — 1 проход |
| `s13-arch` | т.7, под сводом | `01a2205e-c769-7e81-bd78-4524e1787058` | 2913 | заново, 1 проход. **Арка — по описанию, без фото:** факт 10.3 (`research/facts.md`: «по форме напоминает часть сферы», выше 22 м) + слова владельца 28.11 («округлая, дугой, с одной стороны выше»). Разница высот сторон в кадре не читается — **сверить по фото с выезда** |
| `s10-press` | т.4, «Немец» | `01a22063-653d-7f03-b33f-119b632e4230` | 2950 | заново, 1 проход. **Пресса в кадре нет:** фото и описания нет — объект не рисуем (`team/std/images.md`). Сцена с прессом — после фото владельца |
| `s16-wetpaw` | т.10, оборот письма | `01a2205e-c7a8-7d61-b408-619bb1188045` | 2916 | 1 проход (в очереди 2 — брак дважды). Помогло: «both wings FOLDED, no gesture», лапа кота вместо крыла голубя |
| `s20-delivered` | т.10, штамп «доставлено» | `01a2205f-bd9b-7651-ba0c-3fd17ed0897a` | 2930 | проход 1 (`…c7a4…`, 2920): крыло держало штамп «рукой» → правка: штамп только в клюве, крылья сложены |
| `s21-redstamp` | т.8, красный штамп | `01a2205f-bd9c-7a20-b279-136f96e35a12` | 2931 | проход 1 (`…c7ac…`, 2921): то же → та же правка |
| `s22-conveyor-1931` | т.3, пуск конвейера | `01a2205e-c7aa-72e3-b875-de2b5cc78c1b` | 2922 | `s17` + `s03` (палитра 1931 и стиль), без героев, 1 проход. Грузовики обобщённые (начало 1930-х), без марок и надписей; факт 2.4 |
| `s24-mistake` | т.2, «сыщик ошибся» | `01a2205e-c7a6-7d52-af9b-aeaa4f692328` | 2924 | 1 проход; подпорок у деревьев нет (владелец сомневается, что они есть на месте) |
| `s25-wings` | т.6, после ответа про Татлина | `01a22063-653d-7742-a35e-a941b9078e8e` | 2951 | 1 проход. Аппарата и башни в кадре нет: работы Татлина охраняются до 2028 г. |

Каркас промпта для 16:9 — прежний (см. «Промпты»), блок COMPOSITION заменён:

```
COMPOSITION: wide horizontal 16:9; <кто слева, кто справа>; both characters are complete and sit inside the central part of the frame, with at least 10% free margin from every edge of the canvas, tail and wingtips not cropped. The painting fills the entire canvas edge to edge with NO paper border, no white margin, no vignette.
```

Уроки очереди 3:
- В 16:9 два героя встают рядом без тесноты: 7 из 9 кадров приняты с первого прохода (в 3:4 — 6 из 12).
- Предмет в «руках» голубя: писать «holds … in his BEAK» мало — крыло всё равно обхватывает предмет. В правке: «grips ONLY with his beak; BOTH wings folded flat against his body; nothing touching the stamp except the beak».
- Белок вокруг зрачка и «брови» у Зили проскакивают в эмоциональных кадрах (`s16`, `s24`) — в пределах листа выражений, оставлено.
- Реальный объект словами («golden arched passage») модель рисует правдоподобно, но не точно: без фото — только общий силуэт и пометка «сверить».

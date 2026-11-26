# 02. Кастинг: внешность Зили и Тюфеля, голоса героев

Основание: указание владельца 26.11 01:00 (A-60), потолок раунда $4,50. Выбор владельца — `quests/zilart/media/casting/README.md`. Траты — `state/MEDIA_SPEND.md`.

## Изображения

Черновики — `fal-ai/nano-banana-2` (вариант Зиля 1 — `fal-ai/nano-banana-2/edit` от прежнего портрета `assets/test/zilya-portrait-nbpro.png`), 4:5, 1K, JPEG, по 2 картинки на направление. Общий кадр — `fal-ai/nano-banana-pro/edit` с выбранными черновиками как референсами.

### Постоянные черты (одинаковы во всех стилях)

**Зиля:** Zilya, an original cartoon character: a plump city rock pigeon detective with blue-grey feathers, an iridescent green-violet sheen on the neck, round bright orange-red eyes with an alert, self-ironic, slightly self-important expression. He wears a short red scarf, a small round brass badge pinned to his chest, and a tiny metal message tube strapped to one leg. Anatomically a bird: exactly two feathered wings (no hands) and two pink legs. Full body, standing in three-quarter view, one wing raised as if making a point.

**Тюфель:** Tyufel, an original cartoon character: a large, well-fed ginger tabby cat with orange-and-cream stripes, a big fluffy tail curled into a question mark, half-closed amber eyes and a dry, ironic, slightly offended smile; lazy and dignified, like an old aristocrat who has seen everything. No clothes. Exactly four paws and one tail. Full body, sitting upright in three-quarter view, chin raised.

**Канон пропорций (правка владельца 27.11).** Ориентир — живые звери: сизый голубь ≈ 32–35 см от клюва до хвоста, крупный толстый кот ≈ 45–50 см без хвоста; Тюфель «барский и объёмный», значит:
- **длина Зили = 0,6–0,7 длины Тюфеля** (кот — от носа до крестца, без хвоста); стоящий Зиля ≈ 0,6 высоты сидящего Тюфеля (глаз Зили — на уровне подбородка или рта кота, если стоят на одной опоре);
- **голова Зили ≈ 0,8–0,9 головы Тюфеля** (мультяшная условность: голова голубя крупнее, чем в жизни);
- в полёте крылья могут быть шире кота, но **туловище Зили явно меньше туловища Тюфеля**: маленький упрямый голубь тащит большого тяжёлого кота.
Проверка — на каждом кадре с обоими героями (прикинуть по пикселям). Эталон пропорций — `casting/duo-poster.jpg` и `casting/round2-scene-meet-4.jpg`.
**Фраза в каждый промпт с обоими героями:** `SIZE CANON: Zilya the pigeon is 0.6–0.7 of Tyufel's body length (cat nose to rump, tail excluded); Zilya's head is about 0.8–0.9 the size of Tyufel's head; the cat is always the bigger, heavier character, even in flight.` + референс-кадр с обоими героями (`duo-poster.jpg` или принятая сцена) с пометкой «only a reference for the size ratio». Опыт 27.11: `/edit` держит композицию исходника и меняет размеры неохотно — указывать ещё и «в N раз больше/меньше, чем сейчас» и править того героя, кого надо увеличить; если сцена рисуется заново — пропорции задавать сразу, это дешевле.

**Концовка всех промптов:** Single character alone in the frame, clear readable silhouette for a mobile quest app. No text, no letters, no numbers, no logos, no watermark. Vertical 4:5.

### Стили

1. **Плакат 1920-х** — Style: 1920s Russian constructivist poster graphics — flat geometric shapes built from circles, triangles and diagonal bars, bold black outlines, flat colour fills with subtle halftone dots and aged paper grain. Palette strictly limited to off-white paper #F2EFE8, black #141414, signal red #E1251B, plus the character's own natural colour in muted flat tones. Composition: character centred, a large red circle behind him and one black diagonal bar crossing the background from lower left to upper right; generous margins.
2. **Тёплая книжная графика** — Style: warm mid-century children's book illustration with a lithograph print look — soft pencil and ink linework, textured crayon shading, slightly uneven hand-printed colour registration, matte paper texture. Limited palette: off-white paper #F2EFE8, warm black, signal red #E1251B, muted ochre, plus the character's own natural colours. Composition: character centred on plain cream paper with a small red half-circle on the ground beneath him and lots of empty space.
3. **Вырезка-коллаж** — Style: avant-garde paper cut-out collage — the character assembled from cut and torn pieces of coloured paper, grey newsprint-coloured and kraft paper (blank, unprinted), with visible cut edges, slight paper drop shadows and layered depth, like a handmade 1920s collage. Palette: off-white #F2EFE8 background paper, black, signal red #E1251B, grey and kraft-brown papers, the character's natural colours as cut paper. Composition: character centred, a red paper triangle and a black paper strip placed diagonally behind him.
4. **Гуашь** — Style: expressive matte gouache painting on textured paper — confident visible brushstrokes, opaque colour areas, dry-brush edges, slight imperfection, painterly but readable silhouette. Palette: warm off-white paper #F2EFE8, deep black, signal red #E1251B, plus the character's natural colours; warm late-afternoon light from the left. Composition: character centred, a loose red painted circle behind him, plain paper background.

**Зиля 1 (развитие прежнего портрета, edit):** Reference image: the existing Zilya pigeon detective character. Redraw this same character in the same 1920s constructivist poster style, keeping his blue-grey body shape, red scarf, round orange-red eye, bold black outlines and halftone texture. Changes: full-body standing pose on plain off-white paper #F2EFE8 with a large red circle #E1251B behind him and one black diagonal bar; replace the magnifying glass with a small round brass badge pinned to his chest and a tiny metal message tube strapped to his leg; one wing raised as if making a point. Anatomically correct bird: exactly two feathered wings (no hands, no fingers) and two legs. + концовка.

### Общий кадр (duo)

Reference images: image 1 is Zilya the pigeon, image 2 is Tyufel the ginger cat — keep each character's design, colours and proportions exactly. Draw both together in the style of the references: the cat lounges lazily on a low brick ledge, the pigeon stands on the ground in front of him, looking up with a raised wing as if arguing; the cat looks down at him with half-closed ironic eyes. Off-white paper background #F2EFE8 with one large red geometric shape #E1251B behind them and a black diagonal bar. Both characters fully in frame, clear silhouettes, exactly two characters. No text, no letters, no logos, no watermark. Vertical 4:5.

## Голоса

Текст — дословно из `quests/zilart/story/v5/screenplay-v5.md`. Модели: `elevenlabs/tts/eleven-v4` (`language_code: "ru"`, `stability: 0.45`, `similarity_boost: 0.75`) — как у Зили; один вариант на `fal-ai/minimax/speech-2.8-hd` (`language_boost: "Russian"`) для сравнения.

- **Тюфель** (глава «пергола»): «Клад. Бабушка сказывала: Лиза что-то берегла, а в письме сказано где. Интерес чисто материальный. Мы, коты, существа простые.» (124 симв., ~8 с)
- **Лёва** (у медного дома): «Гляжу на ваших свидетелей. Оба честные. И оба при пуске ещё не родились. А я был — на стремянке, с кистью.» (~105 симв.)
- **Гоша** (у реки): «Синяя птица? Моя, сам водил. Ей что берег, что вода: съехала — и пошла.» (~72 симв.)
- Лиза в сценарии v5 не говорит (только письмо) — не озвучивали.

Параметры по вариантам — в `casting/README.md`.

## Раунд 2 (A-65, 26.11): сцены 1 vs 4, Зиля без круга, голоса

Основание: указание владельца 26.11 23:24, потолок $5. Траты — `state/MEDIA_SPEND.md`, результат — `casting/README.md`, «Раунд 2». Полные промпты — в fal (recipe каждого `request_id`); здесь — суть.

- **Тюфель 1 «барин»:** `/edit` от `tyufel-1-poster.jpg`: «keep his face, eyes, smile, stripes, question-mark tail… make him lordly, languid and voluminous: broad round body, deep fluffy chest, round belly, fuller cheeks, slight double chin»; фон — красный клин и чёрная диагональ, **без круга**. Затем `nano-banana-pro/edit` 2K от лучшего: «both front paws planted together, chest puffed out, chin raised high, looking down his nose with sleepy, condescending eyes».
- **Сцены** (референсы: Зиля + Тюфель своего стиля; одинаковый текст сцены для обоих стилей, меняется только блок стиля): «Встреча» (гл. 3: кот развалился на скамейке, Зиля на подлокотнике, блокнот рядом); «Мокрая лапа» (гл. 10: кот ведёт мокрой лапой по полоске бумаги, каракули наливаются лиловым — `absolutely no readable letters`); «Подвезти до метро» (эпилог: Зиля несёт Тюфеля над крышами, держит лапами за загривок; крыши и бульвар условные, `no recognisable landmarks` — перголу и реальные дома без фото-референса не рисуем).
- **Зиля без «флага Японии»:** тот же кадр через `/edit`, «remove the red circle completely»: (а) красный клин из угла + две чёрные диагонали; (б) наклонная красная плоскость, линия земли, мелкие квадраты; (в, гуашь) один широкий красный мазок по диагонали.
- **Анимация:** Kling 2.5 turbo pro, 5 с, от pro-кадра финала: «pigeon flaps both wings in a steady rhythm… cat slowly blinks, tail sways… city drifts backward. Camera steady. Keep the style unchanged; no new objects, no text», negative: «morphing, extra limbs, extra tail, extra wings, hands, text».
- **Голоса:** реплики дословно из `story/v5/screenplay-5.3.md` (Тюфель — гл. 3 «Мр-р-да. Кино. Послушайте лучше…», Лёва — гл. 4, Гоша — гл. 8); разметка — по правилу `docs/fal-guide.md`, «Ударения и интонация».

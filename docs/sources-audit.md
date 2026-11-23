# Аудит источников на сайте и в research — 23.11.2026

Указание владельца 23.11: ссылки только из надёжных и достоверных источников; Wikipedia и ресурсы со «своеобразным отношением» властей РФ — не упоминать.
Правило теперь записано в `team/roles/historian.md` («Какие источники допустимы») и в критериях `team/reviewer.md`.

Метод: каждая замена найдена через WebSearch (ограничение по доменам из белого списка). Поиск отдаёт заголовок страницы; «проверено» = заголовок найденной страницы прямо называет объект/событие факта. Страницы целиком не открывались (WebFetch запрещён).

## Итог

- **Сайт (`site/`):** заменено **30** ссылок, переподписана 1, убраны 2 ссылки-атрибуции на Commons (картины Кандинского и Лентулова — подпись «общественное достояние» без ссылки). Ссылок на wikipedia/wikimedia/вики, Meduza, The Moscow Times, путеводители-агрегаторы в `site/` больше нет (`grep -riE 'wiki|meduza|moscowtimes|tonkosti|tripster|kudago|rambler|travelto|structurae|azbyka|znanierussia' site/` — пусто). В `site/llms.txt` внешних источников нет.
- **Research (`quests/*/research/facts.md`, `docs/next-quests.md`):** 59 ссылок заменены на надёжные, 9 сняты без замены (зачёркнуты, факт 🔶), 37 оставлены с пометкой «— наводка» (агрегаторы, Знание.Вики). В шапку каждого facts.md добавлено правило: факт, у которого остались только наводки или слово «Wikipedia», — 🔶.
- `quests/zilart/research/artworks.md` и `docs/photos*.md` не менялись: там Commons — это происхождение и лицензия файлов изображений (служебно, игроку не показывается).

## Сайт: было → стало → почему

| Страница | Было | Стало | Почему |
|---|---|---|---|
| arbat-gogol | tonkosti.ru — памятник Гоголю на Никитском | [mos.ru — как в 1909 открывали памятник Гоголю работы Андреева](https://www.mos.ru/news/item/89905073/) | агрегатор → mos.ru |
| arbat-gogol | tonkosti.ru — памятник на Гоголевском | [mos.ru, Главархив — памятник на Гоголевском бульваре](https://www.mos.ru/news/item/70360073/) | агрегатор → Главархив |
| arbat-gogol | tonkosti.ru — доходный дом Филатовой | [Культура.РФ — дом с рыцарями на Арбате](https://www.culture.ru/materials/256620/istoriya-odnogo-zdaniya-dom-s-rycaryami-na-arbate) | агрегатор → Культура.РФ |
| arbat-gogol | wikipedia.com — Melnikov House | [Узнай Москву — дом архитектора Мельникова](https://um.mos.ru/houses/dom_arkhitektora_melnikova/) | Wikipedia |
| arbat-gogol | m24 «Арбат, первая пешеходная улица» | та же ссылка, подпись «m24 — „Московские тусовки“: Арбат» | **нестыковка подписи**: статья — о тусовках на Арбате, а не о пешеходной улице. Факт «первая пешеходная, 1986» на официальном сайте не найден → 🔶 |
| chistye-prudy | en.wikipedia — Menshikov Tower | [БРЭ — церковь Архангела Гавриила](https://bigenc.ru/fine_art/text/1832539) | Wikipedia |
| chistye-prudy | журнал Tripster | [Узнай Москву — Чистые пруды](https://um.mos.ru/places/chistye-prudy/) | коммерческий блог |
| kitay-gorod | Tripster — стена Китай-города | [БРЭ — Петрок Малый](https://bigenc.ru/fine_art/text/3136700) | блог |
| kitay-gorod | en.wikipedia — Tretyakovsky Proyezd | [Узнай Москву — Третьяковский проезд](https://um.mos.ru/places/tretyakovskiy-proezd/) | Wikipedia |
| kitay-gorod | KudaGo — Синодальная типография | [mos.ru — лев и единорог на Никольской](https://www.mos.ru/news/item/96221073/) | агрегатор |
| kitay-gorod | en.wikipedia — Siege of Plevna | [РИО (histrf.ru) — осада Плевны 1877](https://w.histrf.ru/articles/plevny-osada-1877-goda) | Wikipedia |
| kitay-gorod | Rambler — как англичане открыли Россию | [БРЭ — Ченслер](https://bigenc.ru/geography/text/4681877) | агрегатор |
| kitay-gorod | **Meduza** — гостиница «Россия» | [парк «Зарядье» — история Зарядья](https://www.zaryadyepark.ru/history/) | **нежелательная организация (реестр Минюста)** |
| kolomenskoe | en.wikipedia — Kolomenskoye | [Культура.РФ — церковь Вознесения в Коломенском](https://www.culture.ru/institutes/13749/cerkov-vozneseniya-v-kolomenskom) | Wikipedia |
| kolomenskoe | en.wikipedia — Golosov Ravine | [РИА Новости, 2021 — овраг в Коломенском](https://ria.ru/20210420/ovrag-1728983325.html) | Wikipedia. Фраза «геологи считают овраг долиной древней реки» держится теперь на m24 (оставлен) — в надёжном источнике по заголовку не подтверждена → 🔶, см. «Открытые вопросы» |
| kolomenskoe | Travelto | [Узнай Москву — комплекс Передних ворот](https://um.mos.ru/museums/kompleks_perednikh_vorot/) | блог |
| krasnaya-ploshchad | en.wikipedia — Iberian Gate | [Узнай Москву — Воскресенские (Иверские) ворота](https://um.mos.ru/houses/voskresenskie-iverskie-vorota/) | Wikipedia |
| krasnaya-ploshchad | azbyka.ru — Иверская икона | [РГ — Иверская у Кремля](https://rg.ru/2019/02/21/za-chto-liubiat-iverskuiu-u-kremlia.html) | неофициальный портал → федеральное СМИ |
| krasnaya-ploshchad | structurae.net — Manege | [Культура.РФ — экзерциргауз, или просто Манеж](https://www.culture.ru/materials/157829/ekzercirgauz-ili-prosto-manezh) | иностранная база-агрегатор |
| krasnaya-ploshchad | en.wikipedia — Betancourt | [Культура.РФ — Августин Бетанкур](https://www.culture.ru/persons/8424/avgustin-betankur) | Wikipedia |
| krasnaya-ploshchad | en.wikipedia — Kazan Cathedral | [mos.ru, Главархив — судьба Казанского собора](https://www.mos.ru/news/item/131772073/) | Wikipedia |
| krasnaya-ploshchad | Tripster — Александровский сад | [mos.ru, Главархив — мемориал Неизвестному Солдату](https://www.mos.ru/news/item/116923073/) | блог |
| vdnh-sestra | znanierussia.ru — ВДНХ | [Узнай Москву — ВСХВ, ВДНХ, ВВЦ](https://um.mos.ru/houses/vskhv-vdnkh-vvts/) | Знание.Вики — вики-проект |
| vdnh-sestra | tonkosti.ru — фонтан «Дружба народов» | [Узнай Москву — фонтан «Дружба народов»](https://um.mos.ru/monuments/fontan-druzhba-narodov/) | агрегатор |
| vdnh-sestra | **The Moscow Times** — «Шестнадцатая сестра» | [ВДНХ — 16 аллегорических скульптур фонтана](https://vdnh.ru/news/1139/) | **нежелательная организация и иноагент (реестры Минюста)** |
| vdnh-sestra | wikipedia.com — Worker and Kolkhoz Woman | [ВДНХ — как создавался «Рабочий и колхозница»](https://vdnh.ru/news/63846/) | Wikipedia |
| vdnh-sestra | znanierussia.ru — «Каменный цветок» | [mos.ru — фонтаны «Дружба народов» и «Каменный цветок» после реставрации](https://www.mos.ru/mayor/themes/5619050/) | вики-проект |
| vdnh-sestra | en.wikipedia — Conquerors of Space | [Музей космонавтики — «Покорителям космоса» 55 лет](https://kosmo-museum.ru/news/pokoritelyam-kosmosa-55-let) | Wikipedia |
| zilart | Commons — Category:Melnikov House | [Узнай Москву — дом архитектора Мельникова](https://um.mos.ru/houses/dom_arkhitektora_melnikova/) | Wikimedia |
| zilart | Commons — файл Кандинского (атрибуция) | подпись «Изображение: общественное достояние» без ссылки | Wikimedia; владелец указан — Третьяковская галерея |
| zilart | Commons — файл Лентулова (атрибуция) | то же | то же |
| zilart | Commons — плакат Лисицкого | [Российская государственная библиотека — запись плаката](https://search.rsl.ru/ru/record/01004879579) | Wikimedia → фонд РГБ |
| zilart | Commons — «Посмотреть снимок модели» (Татлин) | [Русский музей — о Татлине](https://rusmuseum.ru/news/tatlin/), подпись «Подробнее — на сайте Русского музея» | Wikimedia. Снимка модели по ссылке может не быть — подпись изменена честно |

Оставлены без изменений (проверены по заголовку выдачи или официальные): mos.ru, um.mos.ru, culture.ru, rg.ru, vdnh.ru, zilartmuseum.ru, vakhtangov.ru, moma.org, garagemca.org, pnp.ru, vedomosti.ru, aif.ru, en.scientificrussia.ru, vm.ru, m24.ru, snob.ru (заголовок «В Риме закрылось кафе, где Гоголь писал „Мёртвые души“» — совпадает; дубль есть в [РГ](https://rg.ru/2025/10/12/stradaniia-na-kofejnoj-gushche.html) и [РИА](https://ria.ru/20251010/rim-2047557890.html)), moskvichmag.ru (13 ссылок, зарегистрированное городское СМИ), pastvu.com (2 ссылки на архивные снимки).

## Research: снято без замены (факт 🔶, нужен первоисточник)

- vdnh: Wikipedia — Karelo-Finnish SSR.
- krasnaya-ploshchad: Wikipedia — Alexander Garden Obelisk (×2; рядом есть РГ, 2013), Central Telegraph, Lobnoye Mesto, Kremlin stars (рядом calend.ru — наводка).
- kitay-gorod: The Moscow Times — Gargoyles and Griffins; Wikipedia — Zaikonospassky monastery; Ruwiki — Славяно-греко-латинская академия.
- Кроме того, в `chistye-prudy` и `kolomenskoe` в колонке источников местами стоит просто слово «Wikipedia» без ссылки — по правилу в шапке такие факты 🔶 (на сайт они не выносились как ссылки).

## Открытые вопросы владельцу

1. **«Москвич Mag»** (13 ссылок на сайте) — оставили как зарегистрированное городское СМИ. Если хотите строже — заменим на mos.ru/um.mos.ru (около итерации работы).
2. **PastVu** (2 ссылки «Было/стало» на ЗИЛАРТе) — краудсорсинговый архив старых фото. Не запрещён, но не официальный. Альтернатива — Главархив или Музей Москвы, если найдутся те же снимки.
3. Нужна одна проверка страницей (WebFetch, 1 адрес): [stroi.mos.ru — парк с перголой](https://stroi.mos.ru/news/park-s-piergholoi-i-gholuboi-laghunoi-sozdan-na-zilie) — подтверждает ли «навес больше километра» (фраза на странице ЗИЛАРТа, сейчас держится только на путеводителе).
4. «Голосов овраг — долина древней реки» и «Арбат — первая пешеходная улица (1986)» на сайте держатся на m24. Оставить или убрать фразы, пока нет официального источника? Рекомендуем оставить: m24 — городское СМИ.

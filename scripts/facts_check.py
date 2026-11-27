#!/usr/bin/env python3
"""Колонка «Где у игрока» в quests/<id>/research/facts.md (H-110) ↔ quests/<id>/quest.json.

  python3 scripts/facts_check.py                 — все дела, у которых есть и facts.md, и quest.json
  python3 scripts/facts_check.py --quest zilart  — одно дело
  python3 scripts/facts_check.py --json          — {"errors": [...], "warns": [...], "info": [...]} для site_check.js
  python3 scripts/facts_check.py --selftest      — фикстура: ❌ у игрока краснеет, мёртвый путь — предупреждение (у ❌ — красное)

Формат ссылки (docs/facts-format.md): «т.N id/поле/индекс/…» — N = поле n точки, id — её id (можно не писать),
дальше путь по quest.json через «/» или пробел, индексы с нуля, диапазон «0–2»; «, » — ещё путь от той же точки;
поле, которого нет у текущего узла, ищется выше (у шага, у точки, у дела: «intro», «finale», «summary»).
[флаг=значение] — ветка. Русские слова и текст в (…) и «…» — пояснения, путь не продолжают.

Ошибка (красное): факт ❌ звучит игроку; у факта ❌ ссылка не проверяется (мёртвый путь и т. п. — не узнать, звучит ли он);
съехала колонка таблицы. Предупреждение (T-138, 27.11: выкладку стенда не блокирует — это учёт в research, игрок его
не видит): мёртвый путь (поля или индекса нет), id не той точки, нет точки N, неизвестный флаг; факт не ✅ (⚠️, 🔶)
звучит игроку; ссылка ведёт на текст, где нет ни одного ключевого слова факта (имена, годы, слова в «…») — возможно,
не та реплика.
«Звучит игроку» — ссылка на живой путь при текущих флагах дела (ветки «if» по дороге и [флаг=…] совпадают), или
«финал», «intro», «summary», или «сайт». Ячейка «— …» до первой «;» — нигде.

H-129 (предупреждения): составной статус — в колонке «Статус» вне скобок и подтверждённое (✅, 👀 владелец, 👤), и
сомнительное (🔶, ⚠️, ❌): один факт — один статус, разбейте строку; цитата «…» в части «сайт: …» ячейки «Где у игрока»
(до «;», «·» или конца предложения; скобки с «т.N», «снят», «было», «вместо» — о сценарии и истории, не о витрине)
не найдена на витрине дела (site/moscow/<id>-*/index.html и карточки каталогов; без учёта регистра, кавычек, ё и
окончаний; «…» внутри цитаты — пропуск) — витрина поменялась или цитата не дословная.
H-115 (ошибка): у шага (любого узла) quest.json поле «facts»: ["15.21"] — номера из колонки «#» facts.md дела; факта
с таким номером нет или он не ✅ — красное: реплика опирается на непроверенный факт.
"""
import argparse
import json
import pathlib
import re
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
QUESTS = ROOT / "quests"

HOMO = str.maketrans("АВСЕНКМОРТХаеорсх", "ABCEHKMOPTXaeopcx")
RANGE = re.compile(r"^(\d+)(?:[–-](\d+))?$")
FIELD = re.compile(r"^[a-z_][a-z0-9_]*$")
REF = re.compile(r"т\.\s?(\d+)")


def same(a, b):
    return str(a).translate(HOMO) == str(b).translate(HOMO)


def passes(cond, flags, clock):
    """Как passes() в site/play/player.js; ветки «по часам» (clock) — всегда возможны."""
    if not cond:
        return True
    if isinstance(cond, str):
        m = re.match(r"^\s*([\w-]+)\s*(!?=)\s*(.+?)\s*$", cond)
        if not m:
            return True
        k, op, vals = m.group(1), m.group(2), [v.strip() for v in m.group(3).split("|")]
        if k in clock:
            return True
        hit = any(same(flags.get(k, "A"), v) for v in vals)
        return hit if op == "=" else not hit
    if isinstance(cond, dict):
        return all(k in clock or any(same(flags.get(k, "A"), v) for v in (vs if isinstance(vs, list) else [vs]))
                   for k, vs in cond.items())
    return True


def strip_parens(s):
    quotes = re.findall(r"«([^»]*)»", s)
    prev = None
    while prev != s:
        prev = s
        s = re.sub(r"\([^()]*\)", lambda m: " ✅ " if "✅" in m.group(0) and not re.search("🔶|⚠|❌", m.group(0)) else " ", s)  # «(Б-36 ✅)» — пометка остаётся
    s = re.sub(r"«[^»]*»", " ", s)
    return s, quotes


def texts(x):
    if isinstance(x, str):
        return [x]
    if isinstance(x, list):
        return [t for e in x for t in texts(e)]
    if isinstance(x, dict):
        return [t for k, v in x.items() if k not in ("id", "if", "img", "audio", "who", "facts") for t in texts(v)]
    return []


def low(s):
    return re.sub(r"\s+", " ", re.sub(r"[^\w\s]", " ", str(s).lower().replace("ё", "е")))


_UNITS = ["", "од", "дв", "тр", "чет", "пят", "шест", "сем", "вос", "девят"]
_TEENS = ["десят", "одиннадц", "двенадц", "тринадц", "четырнадц", "пятнадц", "шестнадц", "семнадц", "восемнадц", "девятнадц"]
_TENS = ["", "", "двадц", "тридц", "сорок", "пятьдес", "шестьдес", "семьдес", "восемьдес", "девяност"]
_HUND = ["", "ст", "двест", "трист", "четырест", "пятьс", "шестьс", "семьс", "восемьс", "девятьс"]


def number_words(n):
    """1975 → «семьдес… пят…»: год или число словами, как его говорят реплики (последние два разряда; у трёхзначных — с сотнями)."""
    n = int(n)
    t, u = n % 100 // 10, n % 10
    if t == 1:
        tail = [_TEENS[u]]
    else:
        tail = [x for x in (_TENS[t], _UNITS[u]) if x]
    if n < 1000 and n >= 100:
        tail = [_HUND[n // 100]] + tail
    return r"\w* ".join(tail) if tail else None


def keywords(fact, quotes):
    """Ключевые слова факта → основы-регэкспы: имена (с заглавной от 4 букв), аббревиатуры (АМО, МЦК), слова от 6 букв,
    слова в «…» (из факта и из самой ячейки «Где у игрока») от 4 букв, годы и числа (3–4 цифры — и словами)."""
    words, exact = set(), set()
    plain = re.sub(r"\*\*|`|\[[^\]]*\]\([^)]*\)", " ", fact)
    words.update(re.findall(r"\b[А-ЯЁA-Z][а-яёa-z]{3,}", plain))
    words.update(w for w in re.findall(r"[А-Яа-яЁёA-Za-z]{6,}", plain) if w.lower() not in STOP)
    exact.update(re.findall(r"\b[А-ЯЁA-Z]{2,}\b", plain))
    for q in re.findall(r"«([^»]*)»", plain) + quotes:
        words.update(re.findall(r"[А-Яа-яЁёA-Za-z]{4,}", q))
        exact.update(re.findall(r"\b[А-ЯЁA-Z]{2,}\b", q))
    out = set()
    for w in words:
        w = w.lower().replace("ё", "е")
        out.add(re.escape(w[: max(4, len(w) - 2)]))
    out.update(re.escape(w.lower().replace("ё", "е")) for w in exact)
    for d in re.findall(r"\b\d{3,4}\b", plain):
        out.add(d)
        nw = number_words(d)
        if nw:
            out.add(nw)
    return out


STOP = {"считается", "который", "которая", "которые", "только", "сейчас", "теперь", "называют", "называли", "говорят"}


def _step(chains, tok):
    """Один токен строго от узлов цепочек: поле — ключ словаря, индекс/диапазон — элементы списка (строка = список из одной)."""
    out = []
    m = RANGE.match(tok)
    for ch in chains:
        node = ch[-1][1]
        if m:
            seq = node if isinstance(node, list) else [node]
            a, b = int(m.group(1)), int(m.group(2) or m.group(1))
            out += [ch + [(str(i), seq[i])] for i in range(a, min(b, len(seq) - 1) + 1)]
        elif isinstance(node, dict) and tok in node:
            out.append(ch + [(tok, node[tok])])
    return out


def _strict(chains, toks):
    for tok in toks:
        chains = _step(chains, tok)
        if not chains:
            return []
    return chains


def _descendants(ch, depth=6):
    node = ch[-1][1]
    if depth == 0:
        return
    if isinstance(node, dict):
        yield ch
        items = node.items()
    elif isinstance(node, list):
        items = ((str(i), v) for i, v in enumerate(node))
    else:
        return
    for k, v in items:
        if isinstance(v, (dict, list)):
            yield from _descendants(ch + [(k, v)], depth - 1)


def path_of(ch):
    return "/".join(k for k, _ in ch[2:])


def resolve(q, point, subpaths):
    """subpaths — подпути (по «,»), каждый — токены. → (цепочки [(ключ, узел)…], сокращения [(как написано, кандидаты)], ошибка).
    Поле ищется у текущего узла, потом выше (шаг → точка → дело); не нашлось — ниже точки (сокращённый путь: «т.6 ok/3»
    вместо «т.6 tatlin/steps/0/ok/3») — тогда кандидаты возвращаются для предупреждения."""
    root = [("", q), ("т", point)]
    found, short = [], []
    cur = [root]
    prev = []
    for toks in subpaths:
        if RANGE.match(toks[0]) and prev:  # «walk/0, 8» — тот же список
            base = list(prev)
            while base and RANGE.match(base[-1]):
                base.pop()
            toks = base + toks
            cur = [root]
        prev = toks
        for n, tok in enumerate(toks):
            nxt = _step(cur, tok)
            if not nxt and not RANGE.match(tok):
                for ch in cur:
                    for k in range(len(ch) - 1, -1, -1):
                        if isinstance(ch[k][1], dict) and tok in ch[k][1]:
                            nxt.append(ch[: k + 1] + [(tok, ch[k][1][tok])])
                            break
            if not nxt:
                groups = [g for g in (_strict([d], toks[n:]) for d in _descendants(root[:2]) if len(d) > 2) if g]
                if not groups:
                    what = f"индекса {tok}" if RANGE.match(tok) else f"поля «{tok}»"
                    return found, short, f"{what} нет"
                short.append((" ".join(toks), groups))
                cur = [c for g in groups for c in g]
                break
            cur = nxt
        found += cur
    return found, short, None


def parse_ref(seg):
    """«т.N …» → (N, id или None, [подпути], [(флаг, значение)])."""
    m = REF.match(seg)
    n = int(m.group(1))
    rest = seg[m.end():]
    flags = re.findall(r"\[\s*([\w-]+)\s*=\s*([^\]\s]+)\s*\]", rest)
    rest = re.sub(r"\[[^\]]*\]", " ", rest)
    paths = []
    for part in rest.split(","):
        toks = []
        for t in re.split(r"[\s/]+", part.strip()):
            if not t:
                continue
            if FIELD.match(t) or RANGE.match(t):
                toks.append(t)
            else:
                break  # русское слово — пояснение, путь кончился
        if toks:
            paths.append(toks)
        elif paths and part.strip() and not FIELD.match(part.strip()[:1] or "-"):
            break
    return n, paths, flags


def status_class(st):
    if "❌" in st:
        return "bad"
    if "🔶" in st or "⚠" in st:
        return "doubt"
    if "✅" in st or "👀 владелец" in st or "👤" in st:
        return "ok"
    return "none"


def tables(md):
    hdr = None
    for i, line in enumerate(md.splitlines(), 1):
        if not line.startswith("|"):
            hdr = None
            continue
        cells = [c.strip() for c in line.strip().strip("|").split("|")]
        if any("Где у игрока" in c for c in cells):
            hdr = cells
            continue
        if hdr is None or set(line.strip()) <= set("|-: "):
            continue
        if len(cells) != len(hdr):
            yield i, hdr, None
            continue
        yield i, hdr, dict(zip(hdr, cells))


def plain_status(st):
    """Статус без скобок и цитат — что сказано о факте сейчас, без истории и оговорок."""
    prev = None
    while prev != st:
        prev = st
        st = re.sub(r"\([^()]*\)", " ", st)
    return re.sub(r"«[^»]*»", " ", st)


def composite_status(st):
    """H-129: «✅ …; 🔶 …» в одной ячейке — два статуса у одной строки. → список классов или [] (если строка уже
    разбита: «→ разбит …: X ✅ 15.3, Y 🔶 15.4» — это указатель на новые строки, не статус)."""
    s = plain_status(st)
    if "разбит" in s:
        return []
    cls = [c for c, p in (("✅", r"✅|👀 владелец|👤"), ("🔶", r"🔶|⚠"), ("❌", r"❌")) if re.search(p, s)]
    return cls if len(cls) > 1 else []


def norm_site(s):
    """Текст витрины и цитаты — к одному виду: без тегов и сущностей, регистра, ё, кавычек и знаков препинания."""
    import html as _html
    s = _html.unescape(re.sub(r"<[^>]+>", " ", s)).lower().replace("ё", "е")
    return re.sub(r"\s+", " ", re.sub(r"[^\w\s]", " ", s)).strip()


def showcase_text(qid):
    """Витрина дела: страница site/moscow/<id>-*/ и каталоги с его карточкой (главная, /moscow/). Нет страницы — None."""
    pages = sorted((ROOT / "site" / "moscow").glob(qid + "-*/index.html"))
    if not pages:
        return None
    files = pages + [ROOT / "site" / "index.html", ROOT / "site" / "moscow" / "index.html"]
    return " " + " ".join(norm_site(p.read_text(encoding="utf-8")) for p in files if p.exists()) + " "


def site_quotes(cell):
    """H-129: цитаты из частей «сайт: …» ячейки «Где у игрока». Часть кончается на «;», «·» или конце предложения
    («. Замена: «…»» — предложение, а не текст витрины) вне скобок и кавычек. Цитаты в скобках с «т.N» (о сценарии)
    или «снят/было/вместо» (история) и цитата, за которой «снят(о)», не сверяются."""
    cell = cell.replace("**", "")
    out = []
    for m in re.finditer(r"сайт\s*:", cell):
        part, depth, qd = cell[m.end():], 0, 0
        end = len(part)
        for i, ch in enumerate(part):
            depth += (ch == "(") - (ch == ")")
            qd += (ch == "«") - (ch == "»")
            if depth <= 0 and qd <= 0 and (ch in ";·" or (ch == "." and re.match(r"\.(\s+[А-ЯЁA-Z]|\s*$)", part[i:]))):
                end = i
                break
        part = part[:end]
        skip = []  # интервалы скобок, где цитаты не о витрине
        stack = []
        for i, ch in enumerate(part):
            if ch == "(":
                stack.append(i)
            elif ch == ")" and stack:
                a = stack.pop()
                if re.search(r"т\.\s?\d|снят|было|вместо", part[a:i]):
                    skip.append((a, i))
        for q in re.finditer(r"«((?:[^«»]|«[^»]*»)*)»", part):
            if any(a < q.start() < b for a, b in skip) or re.match(r"\s*(?:—\s*)?снят", part[q.end():]):
                continue
            out.append(q.group(1))
    return out


def on_site(quote, text):
    """Цитата есть на витрине: каждый кусок между «…» — подряд, слова от 5 букв — по основе (падеж: «Кружевного грузовика»)."""
    for frag in re.split(r"…|\.\.\.", quote):
        words = norm_site(frag).split()
        if not words:
            continue
        pat = r"\s+".join(re.escape(w[: max(4, len(w) - 2)]) + r"\w*" if len(w) >= 5 else re.escape(w) for w in words)
        if not re.search(r"(?<!\w)" + pat + r"(?!\w)" if len(words[-1]) < 5 else r"(?<!\w)" + pat, text):
            return False
    return True


def fact_refs(node, path=""):
    """H-115: все узлы quest.json с полем «facts» → [(путь, [номера])]."""
    out = []
    if isinstance(node, dict):
        if "facts" in node:
            v = node["facts"]
            out.append((path or "/", v if isinstance(v, list) else [v]))
        for k, v in node.items():
            if k != "facts":
                out += fact_refs(v, f"{path}/{k}" if path else k)
    elif isinstance(node, list):
        for i, v in enumerate(node):
            out += fact_refs(v, f"{path}/{i}")
    return out


def check_quest(qid, md_path=None, q=None, site=False):
    errors, warns, info = [], [], []
    md_path = md_path or QUESTS / qid / "research" / "facts.md"
    rel = md_path.relative_to(ROOT) if str(md_path).startswith(str(ROOT)) else md_path
    if q is None:
        q = json.loads((QUESTS / qid / "quest.json").read_text(encoding="utf-8"))
    flags, clock = q.get("flags") or {}, q.get("clock") or {}
    known = set(flags) | set(clock) | {"ext"}
    points = q.get("points") or []
    sounding = {"bad": [], "doubt": []}
    rows = 0
    fact_cls = {}  # номер из колонки «#» → (класс статуса, статус) — для H-115
    site_txt = showcase_text(qid) if site is False else site
    for line, hdr, row in tables(md_path.read_text(encoding="utf-8")):
        if row is None:
            errors.append(f"{rel}:{line}: в строке таблицы не столько ячеек, сколько в заголовке — колонка «Где у игрока» съехала")
            continue
        where_col = next(h for h in hdr if "Где у игрока" in h)
        fact_col = next((h for h in hdr if h.startswith("Факт") or h.startswith("Легенда")), hdr[0])
        if "Статус" not in row:
            continue  # таблица легенд: статуса нет, подаётся как предание
        rows += 1
        rid = row.get("#") or re.sub(r"\*\*", "", row[fact_col])[:40]
        tag = f"{rel}:{line} [{rid}]"
        cls = status_class(strip_parens(row["Статус"])[0])  # «✅ (было 🔶)» — ✅: в скобках история и оговорки
        if row.get("#"):
            fact_cls[re.sub(r"\*\*|\s", "", row["#"])] = (cls, row["Статус"][:30].strip())
        comp = composite_status(row["Статус"])
        if comp:
            warns.append(f"{tag}: составной статус ({' и '.join(comp)} в одной ячейке: «{row['Статус'][:60].strip()}») — "
                         f"один факт — один статус: разбейте строку (как 1.5 → 1.5а, 1.5б)")
        if site_txt:
            for qt in site_quotes(row[where_col]):
                if not on_site(qt, site_txt):
                    warns.append(f"{tag}: «сайт: «{qt[:60]}»» — на витрине дела такого текста нет: витрина поменялась "
                                 f"или цитата не дословная — обновите колонку")
        cell = re.sub(r"\*\*|`", "", row[where_col])
        body, quotes = strip_parens(cell)
        segs = re.split(r"[;·]", body)
        if body.strip().startswith("—"):
            segs = segs[1:]
        heard = False
        # T-138: битая ссылка — учёт в research, выкладку не блокирует; у факта ❌ — красное: не узнать, звучит ли он игроку
        stale = (lambda m: errors.append(m + " — у факта ❌: не проверить, звучит ли он игроку")) if cls == "bad" else warns.append
        kw = keywords(row[fact_col], quotes)  # и цитаты из самой ячейки: «(«в семьдесят пятом году»)»
        for seg in segs:
            low_seg = seg.lower()
            confirmed = "✅" in seg  # «финал — только «…» (Б-36 ✅)»: звучит подтверждённая часть — не в счёт
            if not confirmed and re.search(r"сайт|финал|\bintro\b|\bsummary\b|вступлен", low_seg) and "не звучит" not in low_seg:
                heard = True
            starts = [m.start() for m in REF.finditer(seg)]
            for a, b in zip(starts, starts[1:] + [len(seg)]):
                ref_txt = seg[a:b].strip(" ,")
                n, paths, rflags = parse_ref(ref_txt)
                short = re.sub(r"\s+", " ", ref_txt)[:60]
                cands = [p for p in points if p.get("n") == n]
                if not cands:
                    stale(f"{tag}: «{short}» — в quest.json нет точки {n}")
                    continue
                pid = paths[0][0] if paths and paths[0] and FIELD.match(paths[0][0]) else None
                ids = {p.get("id") for p in points}
                if pid in ids:
                    cand = [p for p in cands if p.get("id") == pid]
                    if not cand:
                        other = next(p for p in points if p.get("id") == pid)
                        stale(f"{tag}: «{short}» — {pid} это т.{other.get('n')}, а не т.{n}")
                        continue
                    point = cand[0]
                    paths[0] = paths[0][1:]
                else:
                    point = next((p for p in cands if passes(p.get("if"), flags, clock)), cands[0])
                bad_flag = [k for k, _ in rflags if k not in known]
                if bad_flag:
                    stale(f"{tag}: «{short}» — флага {', '.join(bad_flag)} нет в quest.json (flags/clock)")
                    continue
                paths = [p for p in paths if p]
                nodes, shorts, err = resolve(q, point, paths) if paths else ([[("", q), ("т", point)]], [], None)
                if err:
                    stale(f"{tag}: «{short}» — мёртвый путь: {err} (т.{n} {point.get('id')})")
                    continue
                live_flag = all(k in clock or same(flags.get(k, "A"), v) for k, v in rflags)
                live = live_flag and any(all(passes(x.get("if"), flags, clock) for _, x in ch if isinstance(x, dict)) for ch in nodes)
                for written, cand in shorts:  # cand — группы: одна группа = одно место, где путь подходит целиком
                    keep = cand
                    if rflags:  # ветка в ссылке сужает выбор: путь, где по дороге есть «if» с этим флагом
                        keep = [g for g in cand if any(isinstance(x, dict) and any(k in str(x.get("if", "")) for k, _ in rflags) for c in g for _, x in c)] or cand
                    if len(keep) > 1 and kw:
                        keep = [g for g in keep if any(re.search(r"(?<![\w])" + k, " " + low(" ".join(t for c in g for t in texts(c[-1][1])))) for k in kw)] or keep
                    full = ", ".join(sorted({"+".join(path_of(c) for c in g) for g in keep}))
                    if len(keep) == 1:
                        warns.append(f"{tag}: «т.{n} {written}» — сокращённый путь, полный: т.{n} {point.get('id')}/{full}")
                    else:
                        warns.append(f"{tag}: «т.{n} {written}» — неоднозначно, подходит {len(keep)}: {full[:160]} — напишите полный путь")
                if live and not confirmed and "не звучит" not in low(ref_txt) + low(seg[b:b + 40] if b < len(seg) else ""):
                    heard = True
                if kw and paths:
                    t = " " + low(" ".join(s for ch in nodes for s in texts(ch[-1][1]))) + " "
                    if not any(re.search(r"(?<![\w])" + k, t) for k in kw):
                        warns.append(f"{tag}: «{short}» — в этом тексте нет ни одного ключевого слова факта ({', '.join(sorted(kw)[:5])}) — не та реплика?")
        if heard and cls in sounding:
            sounding[cls].append(f"{rid} ({row['Статус'][:30].strip()})")
            if cls == "bad":
                errors.append(f"{tag}: факт ❌ звучит игроку — снять из текста или исправить")
    for where, ids in fact_refs(q):
        for fid in ids:
            fid = re.sub(r"\s", "", str(fid))
            got = fact_cls.get(fid)
            if got is None:
                errors.append(f"quests/{qid}/quest.json {where}: facts «{fid}» — в {rel} нет факта с таким номером (колонка «#»)")
            elif got[0] != "ok":
                errors.append(f"quests/{qid}/quest.json {where}: опирается на факт {fid} со статусом «{got[1]}» — "
                              f"нужен ✅: подтвердить факт или переписать реплику")
    if sounding["doubt"]:
        warns.append(f"{rel}: не ✅ и звучит игроку ({len(sounding['doubt'])}): {'; '.join(sounding['doubt'])}")
    info.append(f"{rel}: фактов со статусом {rows}")
    return errors, warns, info


def selftest():
    import tempfile
    q = {"flags": {"s": "A"}, "points": [{"n": 1, "id": "a", "walk": ["Набережная Марка Шагала"],
                                          "steps": [{"ok": ["x"], "facts": ["1"]}, {"say": "y", "facts": ["4", "99"]}]}]}
    md = ("| # | Факт | Статус | Где у игрока (H-110) |\n|---|---|---|---|\n"
          "| 1 | Набережная Шагала | ✅ | т.1 a/walk/0 |\n"
          "| 2 | Шагал | ✅ | т.1 a/walk/3 |\n"
          "| 3 | Шагал | ❌ | т.1 walk/0 |\n"
          "| 4 | Кандинский | ⚠️ | т.1 steps/0/ok/0 [s=B] — не звучит |\n"
          "| 5 | Кандинский | ✅ | т.1 a/walk/0 |\n"
          "| 6 | Шагал | ❌ | т.1 a/walk/7 |\n"
          "| 7 | Шагал | 👀 владелец · 🔶 адрес | — |\n"
          "| 8 | Шагал | 🔶 → разбит: дом ✅ 9, сад 🔶 10 | — |\n"
          "| 9 | Шагал | ✅ (было 🔶) | сайт: карточка «Кружевной грузовик», справка («общая кухня») |\n"
          "| 10 | Шагал | ✅ | сайт: «Старт» (т.1 walk/0 — «вдоль воды»); т.1 a/walk/0 |\n"
          "| 11 | Шагал | ✅ | сайт: «Старт» — 🔶. Замена: «Кружевного самосвала нет» |\n")
    site = " " + norm_site("<h3>Старт</h3><p>Там стоит кружевного&nbsp;грузовика нет — общая столовая.</p>") + " "
    with tempfile.TemporaryDirectory() as d:
        p = pathlib.Path(d) / "facts.md"
        p.write_text(md, encoding="utf-8")
        e, w, _ = check_quest("fx", p, q, site=site)
    out = []
    if not any("[7]" in x and "составной статус" in x for x in w):
        out.append("составной статус «👀 владелец · 🔶» не пойман (H-129)")
    if any("[8]" in x and "составной" in x for x in w) or any("[9]" in x and "составной" in x for x in w):
        out.append("составной статус: ложное срабатывание на «→ разбит» или на «✅ (было 🔶)»")
    if not any("[9]" in x and "общая кухня" in x for x in w):
        out.append("цитата «сайт: … «общая кухня»», которой нет на витрине, не поймана (H-129)")
    if any("[9]" in x and "Кружевной" in x for x in w):
        out.append("цитата «Кружевной грузовик» в другом падеже на витрине посчитана расхождением")
    if any(("[10]" in x or "[11]" in x) and "витрине" in x for x in w):
        out.append("цитаты о сценарии (в скобках с «т.N») или из предложения «Замена: …» сверены с витриной")
    if not any("facts «99»" in x for x in e):
        out.append("facts с несуществующим номером факта не красный (H-115)")
    if not any("факт 4 " in x for x in e):
        out.append("facts на факт не ✅ (⚠️) не красный (H-115)")
    if any("факт 1 " in x or "«1»" in x for x in e):
        out.append("facts на факт ✅ дал ошибку (H-115)")
    if not any("[2]" in x and "мёртвый путь" in x for x in w):
        out.append("мёртвый путь (walk/3) не пойман предупреждением")
    if any("[2]" in x for x in e):
        out.append("мёртвый путь у факта ✅ блокирует выкладку (T-138: только предупреждение)")
    if not any("[6]" in x and "мёртвый путь" in x for x in e):
        out.append("мёртвый путь у факта ❌ не красный")
    if not any("[3]" in x and "❌" in x for x in e):
        out.append("❌ у игрока не пойман")
    if any("[1]" in x for x in e + w):
        out.append("ложное срабатывание на живой ссылке")
    if any("4 (" in x for x in w):
        out.append("неактивная ветка [s=B] посчитана звучащей")
    if not any("[5]" in x and "ключевого слова" in x for x in w):
        out.append("ссылка не на тот текст (нет «Кандинский») не поймана")
    return out


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--quest", action="append")
    ap.add_argument("--json", action="store_true")
    ap.add_argument("--selftest", action="store_true")
    a = ap.parse_args(argv)
    if a.selftest:
        s = selftest()
        for m in s:
            print(" ✗ " + m)
        print("facts_check --selftest: " + ("ОШИБКА" if s else "OK"))
        return 1 if s else 0
    ids = a.quest or sorted(p.name for p in QUESTS.iterdir()
                            if (p / "quest.json").exists() and (p / "research" / "facts.md").exists())
    errors, warns, info = [], [], []
    for m in selftest():
        errors.append("facts_check (самопроверка): " + m)
    for qid in ids:
        e, w, i = check_quest(qid)
        errors += e
        warns += w
        info += i
    if not a.quest:  # H-129: составной статус — и у дел без quest.json (сценарий ещё пишется, учёт уже ведётся)
        for md in sorted(QUESTS.glob("*/research/facts.md")):
            if md.parent.parent.name in ids:
                continue
            for line, hdr, row in tables(md.read_text(encoding="utf-8")):
                comp = composite_status(row["Статус"]) if row and "Статус" in row else []
                if comp:
                    warns.append(f"{md.relative_to(ROOT)}:{line}: составной статус ({' и '.join(comp)} в одной ячейке) — "
                                 f"один факт — один статус: разбейте строку")
    if a.json:
        print(json.dumps({"errors": errors, "warns": warns, "info": info}, ensure_ascii=False))
        return 0
    for m in info:
        print(" · " + m)
    for m in warns:
        print(" ! " + m)
    for m in errors:
        print(" ✗ " + m)
    print(f"facts_check: {len(errors)} ошибок" if errors else "facts_check: OK")
    return 1 if errors else 0


if __name__ == "__main__":
    sys.exit(main())

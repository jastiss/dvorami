"""Проверка текстового ответа загадки для Telegram-бота — та же логика, что site/play/answer.js (matches).

Одна логика на плеер и бота: регистр, ё/е, кавычки, дефисы и стрелки, лишние пробелы, NFC, знаки ударения и невидимые символы;
числа («3» = «три», «1 931» = «1931», «тысяча девятьсот тридцать один» = «1931»);
основа «~» с границей для чисел; однобуквенный ответ — только в коротком сообщении;
латинская раскладка («hfvf» = «рама», H-70).
check_text() — проверка шага целиком, как checkText() в answer.js: answers → all → replies → missing → «почти».
Совпадение с answer.js проверяет scripts/answer_check.js (PARITY — matches, CHECK_PARITY — check_text на загадках дела).
"""

import re
import unicodedata

_NUM = {}


def _put(words, v):
    for w in words.split():
        _NUM[w] = v


_put("ноль нуль", 0)
_put("один одна одно одного одной одну одним", 1)
_put("два две двух двум двумя", 2)
_put("три трех трем тремя", 3)
_put("четыре четырех четырем четырьмя", 4)
_put("пять пяти пятью", 5); _put("шесть шести шестью", 6); _put("семь семи семью", 7)
_put("восемь восьми восемью", 8); _put("девять девяти девятью", 9); _put("десять десяти десятью", 10)
_put("одиннадцать одиннадцати", 11); _put("двенадцать двенадцати", 12); _put("тринадцать тринадцати", 13)
_put("четырнадцать четырнадцати", 14); _put("пятнадцать пятнадцати", 15); _put("шестнадцать шестнадцати", 16)
_put("семнадцать семнадцати", 17); _put("восемнадцать восемнадцати", 18); _put("девятнадцать девятнадцати", 19)
_put("двадцать двадцати", 20); _put("тридцать тридцати", 30); _put("сорок сорока", 40)
_put("пятьдесят пятидесяти", 50); _put("шестьдесят шестидесяти", 60); _put("семьдесят семидесяти", 70)
_put("восемьдесят восьмидесяти", 80); _put("девяносто девяноста", 90)
_put("сто ста", 100); _put("двести двухсот", 200); _put("триста трехсот", 300); _put("четыреста четырехсот", 400)
_put("пятьсот пятисот", 500); _put("шестьсот шестисот", 600); _put("семьсот семисот", 700)
_put("восемьсот восьмисот", 800); _put("девятьсот девятисот", 900)
_THOUSAND = {"тысяча", "тысячи", "тысяч", "тысячу"}

_INVISIBLE = {"\u00ad", "\u200c", "\u200d", "\u2060", "\ufeff"}

_LAT = "qwertyuiop[]asdfghjkl;'zxcvbnm,.`{}:\"<>~"
_CYR = "йцукенгшщзхъфывапролджэячсмитьбюёхъжэбюё"


def base(s):
    s = unicodedata.normalize("NFC", str(s or ""))
    s = s.lower().replace("ё", "е")
    # как в answer.js: знаки ударения и надстрочные (категория M) и невидимые мягкий перенос и склейки — убрать
    s = "".join(c for c in s if not unicodedata.category(c).startswith("M") and c not in _INVISIBLE)
    s = s.replace("→", " ").replace("->", " ")
    s = re.sub(r"[-‐‑‒–—]", " ", s)
    s = re.sub(r"[^\w\s]", " ", s)
    return re.sub(r"\s+", " ", s).strip()


norm = base


def _room(n):
    if n % 100 == 0:
        return 99
    if n % 10 == 0 and n % 100 >= 20:
        return 9
    return 0


def numeric(s):
    s = re.sub(r"(\d)([^\W\d_])", r"\1 \2", s)
    s = re.sub(r"([^\W\d_])(\d)", r"\1 \2", s)
    toks = s.split(" ")
    out, i = [], 0
    while i < len(toks):
        t = toks[i]
        nxt = toks[i + 1] if i + 1 < len(toks) else ""
        if re.fullmatch(r"\d{1,3}", t) and re.fullmatch(r"\d{3}", nxt):
            g = t
            while i + 1 < len(toks) and re.fullmatch(r"\d{3}", toks[i + 1]):
                g += toks[i + 1]
                i += 1
            out.append(str(int(g)))
            i += 1
            continue
        if t in _NUM or t in _THOUSAND:
            total, cur, used = 0, None, False
            while i < len(toks):
                w = toks[i]
                if w in _THOUSAND:
                    total += (1 if cur is None else cur) * 1000
                    cur, used = None, True
                    i += 1
                    continue
                if w not in _NUM:
                    break
                v = _NUM[w]
                if cur is None:
                    if used and total and v >= 1000:
                        break
                    cur = v
                    i += 1
                    continue
                if 0 < v <= _room(cur) and len(str(v)) < len(str(cur)):
                    cur += v
                    i += 1
                    continue
                break
            out.append(str(total + (cur or 0)))
            continue
        out.append(t)
        i += 1
    return " ".join(out)


def forms(s):
    b = base(s)
    n = numeric(b)
    return [b] if n == b else [b, n]


def layout(s):
    """Латинская раскладка → русская (те же клавиши); только для текста с латиницей и без кириллицы, иначе None."""
    s = str(s or "")
    if not re.search(r"[a-zA-Z]", s) or re.search(r"[а-яёА-ЯЁ]", s):
        return None
    out = []
    for c in s:
        c = c.lower()
        j = _LAT.find(c)
        out.append(c if j == -1 else _CYR[j])
    return "".join(out)


def text_forms(text):
    ts = forms(text)
    alt = layout(text)
    if alt is not None:
        for f in forms(alt):
            if f not in ts:
                ts.append(f)
    return ts


def _hit(t, a):
    if a.startswith("~"):
        st = a[1:].strip()
        if not st:
            return False
        d0, d1 = st[0].isdigit(), st[-1].isdigit()
        p = t.find(st)
        while p != -1:
            ok = True
            if d0 and p > 0 and t[p - 1].isdigit():
                ok = False
            e = p + len(st)
            if d1 and e < len(t) and t[e].isdigit():
                ok = False
            if ok:
                return True
            p = t.find(st, p + 1)
        return False
    if not a:
        return False
    if t == a:
        return True
    tokens, at = t.split(" "), a.split(" ")
    for j in range(len(tokens) - len(at) + 1):
        if tokens[j:j + len(at)] == at and (len(a) > 1 or len(tokens) <= 2):
            return True
    return False


def _answer_forms(a):
    a = str(a)
    if a.startswith("~"):
        return ["~" + f for f in forms(a[1:])]
    return forms(a)


def matches(text, answers):
    ts = text_forms(text)
    if not ts[0]:
        return False
    for a in answers or []:
        for af in _answer_forms(a):
            for t in ts:
                if _hit(t, af):
                    return True
    return False


# ---------- «почти» и проверка шага — как near() и checkText() в answer.js ----------
NEAR_TEXT = "Почти! Проверьте написание."
HALF_TEXT = "Половина ответа верна. Чего не хватает?"


def lev1(a, b):
    """Расстояние Левенштейна ≤ 1?"""
    if a == b:
        return True
    la, lb = len(a), len(b)
    if abs(la - lb) > 1:
        return False
    i = j = diff = 0
    while i < la and j < lb:
        if a[i] == b[j]:
            i += 1
            j += 1
            continue
        diff += 1
        if diff > 1:
            return False
        if la > lb:
            i += 1
        elif lb > la:
            j += 1
        else:
            i += 1
            j += 1
    return diff + (la - i) + (lb - j) <= 1


def _letters(s):
    return sum(1 for c in s if c.isalpha())


def _near_one(t, a):
    tokens = t.split(" ")
    stem = a.startswith("~")
    s = a[1:].strip() if stem else a
    if not s or re.search(r"[0-9]", s):  # числа и годы опечаткой не считаем
        return False
    at = s.split(" ")
    if _letters(s) >= (6 if stem else 5):
        for j in range(len(tokens) - len(at) + 1):
            w = " ".join(tokens[j:j + len(at)])
            if stem:
                for L in range(len(s) - 1, len(s) + 2):
                    if lev1(s, w[:L]):
                        return True
            elif lev1(s, w):
                return True
    # все слова составного ответа на месте и по порядку, но с лишними между ними
    if not stem and len(at) > 1:
        p = 0
        for tok in tokens:
            if p < len(at) and tok == at[p]:
                p += 1
        if p == len(at):
            return True
    return False


def near(text, answers):
    t = base(text)
    if not t:
        return False
    alt = layout(text)
    ts = [t] if alt is None else [t, base(alt)]
    for a in answers or []:
        a = str(a)
        na = "~" + base(a[1:]) if a.startswith("~") else base(a)
        for x in ts:
            if _near_one(x, na):
                return True
    return False


def _group(g):
    if isinstance(g, list):
        return g
    return (g.get("answers") or []) if isinstance(g, dict) else []


def check_text(st, text):
    """Проверка текстового ответа шага — как checkText() в answer.js:
    answers → ответ из частей (all) → ответ на типичную ошибку (replies) → «половина верна» (all.missing) → «почти».
    Возвращает {"ok": True} или {"ok": False[, "reply": текст][, "near": True]}."""
    st = st or {}
    if st.get("answers") and matches(text, st["answers"]):
        return {"ok": True}
    groups = st.get("all") or []
    hits = [matches(text, _group(g)) for g in groups]
    if hits and all(hits):
        return {"ok": True}
    for r in st.get("replies") or []:
        if matches(text, (r or {}).get("answers")):
            return {"ok": False, "reply": r.get("text")}
    if any(hits):
        for g, h in zip(groups, hits):
            if not h:
                return {"ok": False, "reply": (g.get("missing") if isinstance(g, dict) else None) or HALF_TEXT}
    pool = list(st.get("answers") or [])
    for g in groups:
        pool += _group(g)
    if near(text, pool):
        return {"ok": False, "near": True, "reply": NEAR_TEXT}
    return {"ok": False}

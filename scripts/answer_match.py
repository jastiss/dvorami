"""Проверка текстового ответа загадки для Telegram-бота — та же логика, что site/play/answer.js (matches).

Одна логика на плеер и бота: регистр, ё/е, кавычки, дефисы и стрелки, лишние пробелы, NFC;
числа («3» = «три», «1 931» = «1931», «тысяча девятьсот тридцать один» = «1931»);
основа «~» с границей для чисел; однобуквенный ответ — только в коротком сообщении;
латинская раскладка («hfvf» = «рама», H-70).
Совпадение с answer.js проверяет scripts/answer_check.js (сверка на наборе случаев). «Почти» — только в плеере.
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

_LAT = "qwertyuiop[]asdfghjkl;'zxcvbnm,.`{}:\"<>~"
_CYR = "йцукенгшщзхъфывапролджэячсмитьбюёхъжэбюё"


def base(s):
    s = unicodedata.normalize("NFC", str(s or ""))
    s = s.lower().replace("ё", "е")
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

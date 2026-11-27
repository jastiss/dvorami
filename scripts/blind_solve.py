#!/usr/bin/env python3
"""Слепой решатель (H-81): какие загадки дела решаются «в лоб», без места и без сюжета.

Шаг приёмки сценария (team/reviewer.md, «Сценарий»):
  1. python3 scripts/blind_solve.py task --quest=zilart [--flags=st4:B] [--out=файл.md]
     — файл-задание: только текст вопроса и варианты, без места, реплик, подсказок и картинок.
  2. Продюсер отдаёт файл агенту на haiku: «ответь на каждый вопрос строкой ID: ответ, не зная места; не знаешь — угадай».
  3. python3 scripts/blind_solve.py check --quest=zilart --answers=ответы.txt
     — сверка с верными ответами (та же логика, что в плеере: scripts/answer_match.py), список «лобовых».

Лобовая загадка — та, что решена без места: вопрос с ответом «с места» (src: place) не должен решаться так.
Для выбора печатается и шанс угадать наугад (1 из N): решённый выбор из 2 вариантов — ещё не приговор.
Модель скрипт не вызывает и в сеть не ходит. Ветки — как в плеере: флаги дела, по умолчанию «A», --flags поверх.
"""

import argparse
import json
import random
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from answer_match import matches  # noqa: E402

REPO = Path(__file__).resolve().parent.parent
PICT = re.compile("[\U0001F000-\U0001FAFF☀-➿️‍]")


def plain(s):
    s = re.sub(r"<[^>]+>", "", str(s or ""))
    return re.sub(r"\s+", " ", PICT.sub("", s)).strip()


def load(qid, flags_arg):
    q = json.loads((REPO / "quests" / qid / "quest.json").read_text(encoding="utf-8"))
    flags = {k: str(v) for k, v in (q.get("flags") or {}).items()}
    for part in (flags_arg or "").split(","):
        kv = re.split(r"[:=]", part)
        if len(kv) == 2 and kv[0].strip():
            flags[kv[0].strip()] = kv[1].strip()
    flag = lambda k: flags.get(k, "A")  # noqa: E731

    def passes(c):
        if not c:
            return True
        if isinstance(c, str):
            m = re.match(r"^\s*([\w-]+)\s*(!?=)\s*(.+?)\s*$", c)
            if not m:
                return True
            hit = flag(m.group(1)) in [x.strip() for x in m.group(3).split("|")]
            return hit if m.group(2) == "=" else not hit
        return all(flag(k) in [str(x) for x in (v if isinstance(v, list) else [v])] for k, v in c.items())

    def prune(x):
        if isinstance(x, list):
            return [prune(e) for e in x if not (isinstance(e, dict) and not passes(e.get("if")))]
        if isinstance(x, dict):
            return {k: prune(v) for k, v in x.items()}
        return x

    return prune(q), flags


def ask_text(st):
    """Текст вопроса: последняя реплика перед заданием (сама загадка) и строка задания. Без «стрелок», картинок и места."""
    lines = st.get("lines") or []
    last = ""
    for ln in reversed(lines if isinstance(lines, list) else [lines]):
        if isinstance(ln, dict) and (ln.get("arrow") or ln.get("text") is None):
            continue
        last = plain(ln.get("text") if isinstance(ln, dict) else ln)
        if last:
            break
    text = plain(st.get("text"))
    out = (last + " " + text).strip() if text and text != last else last
    return out[:500]


def items(q, flags):
    """Все вопросы с проверяемым ответом: ask, choice (шаги и вопросы на ходу)."""
    out, skipped = [], {}
    for p in q.get("points") or []:
        fields = [(f"{p.get('n')}.{i + 1}", st) for i, st in enumerate(p.get("steps") or [])]
        wa = p.get("walk_ask")
        wa = wa if isinstance(wa, list) else ([wa] if wa else [])
        fields += [(f"{p.get('n')}.w{i + 1}", w) for i, w in enumerate(wa)]
        for fid, st in fields:
            t = st.get("type") or ("ask" if st.get("answers") or st.get("all") else "info")
            if t == "choice":
                ops = st.get("options") or []
                f = st.get("answer_flag") and flags.get(st["answer_flag"])
                ans = st.get("answer") if st.get("answer") is not None else (st.get("answers") or [])
                right = [f] if f and any(str(o.get("id")) == f for o in ops) else [str(x) for x in (ans if isinstance(ans, list) else [ans])]
                if not right or len(set(right)) >= len(ops):
                    skipped["choice: засчитывается любой"] = skipped.get("choice: засчитывается любой", 0) + 1
                    continue
                order = list(ops)
                random.Random(f"{q.get('id')}:{fid}").shuffle(order)
                letters = "АБВГДЕЖЗИК"[: len(order)]
                out.append({"id": fid, "kind": "choice", "src": st.get("src", ""), "q": ask_text(st),
                            "options": [(letters[i], plain(o.get("label")), str(o.get("id"))) for i, o in enumerate(order)],
                            "right": right})
            elif t == "ask" and (st.get("answers") or st.get("all")) and not st.get("any_answer"):
                out.append({"id": fid, "kind": "ask", "src": st.get("src", ""), "q": ask_text(st),
                            "answers": st.get("answers") or [], "all": st.get("all") or []})
            else:
                skipped[t] = skipped.get(t, 0) + 1
    return out, skipped


def cmd_task(a):
    q, flags = load(a.quest, a.flags)
    its, skipped = items(q, flags)
    lines = [
        f"# Слепое решение: {len(its)} вопросов",
        "",
        "Ты не знаешь, где и о чём эта прогулка. Ответь на каждый вопрос, как сумеешь: по общим знаниям и здравому смыслу.",
        "Не знаешь — всё равно угадай. Для вопроса с вариантами — только буква. Для остальных — одно-три слова.",
        "Формат ответа — только строки `ID: ответ`, по одной на вопрос, без пояснений.",
        "",
    ]
    for it in its:
        lines.append(f"## {it['id']}")
        lines.append(it["q"] or "(вопрос без текста — ответь наугад)")
        for L, label, _ in it.get("options", []):
            lines.append(f"- {L}) {label}")
        lines.append("")
    text = "\n".join(lines)
    if a.out:
        Path(a.out).write_text(text, encoding="utf-8")
        print(f"blind_solve: задание — {a.out} ({len(its)} вопросов; пропущено: " + (", ".join(f"{k} {v}" for k, v in skipped.items()) or "ничего") + ")")
    else:
        print(text)


def cmd_check(a):
    q, flags = load(a.quest, a.flags)
    its, _ = items(q, flags)
    got = {}
    for ln in Path(a.answers).read_text(encoding="utf-8").splitlines():
        m = re.match(r"^\s*[#*`-]*\s*([0-9]+\.w?[0-9]+)\s*[:：)\-—]\s*(.*?)\s*`?$", ln)
        if m:
            got[m.group(1)] = m.group(2)
    hit, miss, empty, luck = [], 0, 0, 0.0
    for it in its:
        ans = got.get(it["id"], "").strip()
        if not ans:
            empty += 1
            continue
        if it["kind"] == "choice":
            letter = ans.strip("«»\"' .)").upper()[:1]
            pick = next((oid for L, label, oid in it["options"] if L == letter or plain(ans).lower() == label.lower()), None)
            ok = pick in it["right"]
            luck += len(it["right"]) / len(it["options"])
        else:
            ok = bool(it["answers"]) and matches(ans, it["answers"])
            if not ok and it["all"]:
                ok = all(matches(ans, part.get("answers") if isinstance(part, dict) else part) for part in it["all"])
        if ok:
            hit.append(it)
        else:
            miss += 1
    n = len(its)
    print(f"blind_solve: решено вслепую {len(hit)} из {n} (не решено {miss}, без ответа {empty}); "
          f"по выбору наугад ожидалось ~{luck:.1f}")
    for it in hit:
        place = " — ⚠ ответ «с места» (src: place)" if it["src"] in ("place", "both") else ""
        extra = f" · вариантов {len(it['options'])}" if it["kind"] == "choice" else ""
        print(f" ✗ лобовой {it['id']} ({it['kind']}{extra}): {it['q'][:90]}{place}")
    asks = [it for it in hit if it["kind"] == "ask"]
    if asks and a.strict:
        sys.exit(1)


def main():
    ap = argparse.ArgumentParser(description="Слепой решатель загадок дела (H-81)")
    sub = ap.add_subparsers(dest="cmd", required=True)
    for name in ("task", "check"):
        s = sub.add_parser(name)
        s.add_argument("--quest", default="zilart")
        s.add_argument("--flags", default="")
        if name == "task":
            s.add_argument("--out", default="")
        else:
            s.add_argument("--answers", required=True)
            s.add_argument("--strict", action="store_true", help="выход 1, если решена вслепую хоть одна загадка со вводом")
    a = ap.parse_args()
    (cmd_task if a.cmd == "task" else cmd_check)(a)


if __name__ == "__main__":
    main()

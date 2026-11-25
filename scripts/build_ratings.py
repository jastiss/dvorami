#!/usr/bin/env python3
"""Рейтинг дел для сайта и бота: site/assets/ratings.json из настоящих оценок игроков.

Источники (только они — выдуманных и «стартовых» оценок нет, см. docs/rating.md):
  * бот — feedback/ГГГГ-ММ.jsonl, записи kind=review с оценкой и confirmed=true (пришли из финала дела);
  * сайт — те же файлы, записи kind=rating, source=site (приём оценок с сайта — docs/rating.md, пока не подключён).
Один игрок (псевдоним user) — одна оценка дела: считается последняя.
В публичный файл попадают только суммы и количества по делам — ни псевдонимов, ни текстов.

Запуск: python3 scripts/build_ratings.py   (его же вызывает scripts/feedback_bot_commit.sh после новых отзывов)
"""

import json
import pathlib
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
FEEDBACK_DIR = ROOT / "feedback"
OUT = ROOT / "site" / "assets" / "ratings.json"
THRESHOLD = 5   # меньше оценок — на сайте и в боте «Новое дело», а не звёзды

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
from feedback_bot import CASES, find_case  # noqa: E402


def counted(rec):
    """Оценка, которая идёт в рейтинг: 1–5, дело известно, финал подтверждён (бот) или пришла с сайта."""
    r = rec.get("rating")
    if not isinstance(r, int) or isinstance(r, bool) or not 1 <= r <= 5:
        return None
    case = find_case(rec.get("quest"))
    if not case or not rec.get("user"):
        return None
    if rec.get("kind") == "review" and rec.get("confirmed") is True:
        return case, r, "bot"
    if rec.get("kind") == "rating" and rec.get("source") == "site":
        return case, r, "site"
    return None


def aggregate(feedback_dir=None):
    """{slug: {quest, sum, count, bot, site}} по всем делам из CASES (дела без оценок — нули)."""
    last = {}   # (user, quest) → (оценка, источник); файлы и строки по времени — побеждает последняя
    newest = ""
    for f in sorted(pathlib.Path(feedback_dir or FEEDBACK_DIR).glob("*.jsonl")):
        for line in f.read_text(encoding="utf-8").splitlines():
            try:
                rec = json.loads(line)
            except ValueError:
                continue
            got = counted(rec) if isinstance(rec, dict) else None
            if got:
                case, r, src = got
                last[(rec["user"], case["id"])] = (r, src)
                newest = max(newest, str(rec.get("ts", ""))[:10])
    cases = {c["slug"]: {"quest": c["id"], "sum": 0, "count": 0, "bot": 0, "site": 0} for c in CASES}
    by_id = {c["id"]: c["slug"] for c in CASES}
    for (_, quest), (r, src) in last.items():
        row = cases[by_id[quest]]
        row["sum"] += r
        row["count"] += 1
        row[src] += 1
    return cases, newest


def build(feedback_dir=None):
    cases, newest = aggregate(feedback_dir)
    return {
        "_about": "Настоящие оценки игроков 1–5: бот после финала дела и сайт. Один игрок — одна оценка дела. "
                  "Меньше threshold оценок — показываем «Новое дело». Собирает scripts/build_ratings.py; руками не править.",
        "threshold": THRESHOLD,
        "updated": newest or None,
        "cases": cases,
    }


def summary(slug_or_id, data=None):
    """(среднее, количество) или None, если оценок меньше порога. Для бота и сборки страниц."""
    data = data or build()
    case = find_case(slug_or_id)
    row = data["cases"].get(case["slug"]) if case else None
    if not row or row["count"] < data.get("threshold", THRESHOLD):
        return None
    return row["sum"] / row["count"], row["count"]


def plural(n, one, few, many):
    n = abs(n) % 100
    if 11 <= n <= 14:
        return many
    return one if n % 10 == 1 else few if 2 <= n % 10 <= 4 else many


def fmt(avg, count):
    """«4,86 · 37 оценок» — сотые через запятую, как на сайте."""
    return f"{avg:.2f}".replace(".", ",") + f" · {count} " + plural(count, "оценка", "оценки", "оценок")


def main():
    data = build()
    text = json.dumps(data, ensure_ascii=False, indent=1, sort_keys=True) + "\n"
    if not OUT.exists() or OUT.read_text(encoding="utf-8") != text:
        OUT.write_text(text, encoding="utf-8")
        print("→", OUT.relative_to(ROOT))
    return 0


if __name__ == "__main__":
    sys.exit(main())

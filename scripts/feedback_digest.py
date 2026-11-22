"""Недельная сводка обратной связи игроков для разбора (Продюсер / Сценарист).

Читает feedback/*.jsonl (пишет scripts/feedback_bot.py) и печатает Markdown:
  * отзывы: сколько, средняя оценка, доля пятёрок, что мешало (поле unclear);
  * «Что-то не так?»: по квесту → точке → категории, с текстами — готово для задачи в бэклог.

Запуск: python3 scripts/feedback_digest.py [--days 7] [--quest zilart]
"""

import argparse
import collections
import datetime
import json
import pathlib
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
FEEDBACK_DIR = ROOT / "feedback"

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
from feedback_bot import REPORT_CATS  # noqa: E402


def load(days, quest=None, today=None):
    today = today or datetime.date.today()
    since = (today - datetime.timedelta(days=days)).isoformat()
    out = []
    for f in sorted(FEEDBACK_DIR.glob("*.jsonl")):
        for line in f.read_text(encoding="utf-8").splitlines():
            if not line.strip():
                continue
            try:
                r = json.loads(line)
            except ValueError:
                continue
            if r.get("ts", "")[:10] < since:
                continue
            if quest and r.get("quest") not in (quest, None):
                continue
            out.append(r)
    return out


def digest(recs, days):
    lines = [f"# Обратная связь игроков за {days} дн.", ""]
    reviews = [r for r in recs if r.get("kind") == "review" and r.get("rating")]
    lines.append("## Отзывы")
    if reviews:
        avg = sum(r["rating"] for r in reviews) / len(reviews)
        fives = sum(1 for r in reviews if r["rating"] == 5)
        lines.append(f"- Всего: {len(reviews)} · средняя {avg:.2f} · пятёрок {fives * 100 // len(reviews)}%")
        for r in reviews:
            if r.get("unclear"):
                lines.append(f"- Мешало ({r['rating']}★, {r.get('quest') or '—'}): {r['unclear']}")
    else:
        lines.append("- нет")
    lines.append("")
    lines.append("## «Что-то не так?» по точкам")
    reports = [r for r in recs if r.get("kind") == "report"]
    if not reports:
        lines.append("- нет")
        return "\n".join(lines) + "\n"
    groups = collections.defaultdict(list)
    for r in reports:
        groups[(r.get("quest") or "—", r.get("point") or 0)].append(r)
    # чаще всего жалуются — наверх
    for (q, p), items in sorted(groups.items(), key=lambda kv: (-len(kv[1]), kv[0])):
        cats = collections.Counter(REPORT_CATS.get(r.get("category"), "без категории") for r in items)
        where = f"точка {p}" if p else "вне точки"
        lines.append(f"### {q} · {where} — {len(items)} шт.: " + ", ".join(f"{c} ×{n}" for c, n in cats.most_common()))
        for r in items:
            step = f"шаг {r['step']}, " if r.get("step") else ""
            text = (r.get("text") or "без комментария").replace("\n", " ")
            lines.append(f"- {r.get('ts', '')} · {step}{REPORT_CATS.get(r.get('category'), '—')}: {text}")
    return "\n".join(lines) + "\n"


def main(argv=None):
    ap = argparse.ArgumentParser()
    ap.add_argument("--days", type=int, default=7)
    ap.add_argument("--quest")
    a = ap.parse_args(argv)
    sys.stdout.write(digest(load(a.days, a.quest), a.days))
    return 0


if __name__ == "__main__":
    sys.exit(main())

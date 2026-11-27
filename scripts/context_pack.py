#!/usr/bin/env python3
"""Пакет контекста: ключевые тексты проекта одним файлом для загрузки в любой ИИ.

Зачем: смысловой бэкап (docs/backup.md). Склеивает CLAUDE.md, docs/CONTEXT.md,
state/ (цели, статус, план, бэклог, гипотезы, хвост журнала решений), APPROVALS.md,
роли, стандарты, брифы и оглавление квестов — с оглавлением и размерами.

Запуск:
  python3 scripts/context_pack.py                      # → /tmp/dvorami-context-ГГГГ-ММ-ДД.md
  python3 scripts/context_pack.py -o ~/pack.md --decisions 30
  python3 scripts/context_pack.py --lite               # без бэклога, гипотез и плейбуков (меньше вдвое)

Результат в репозиторий не кладётся: путь внутри репозитория скрипт отвергает.
Без внешних зависимостей.
"""
import argparse
import datetime as dt
import json
import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent

# Похоже на токен Telegram-бота или ключ — пакет с таким не собирается.
SECRET_RE = re.compile(r"\b\d{8,10}:[A-Za-z0-9_-]{35}\b|\bghp_[A-Za-z0-9]{36}\b|\bsk-[A-Za-z0-9_-]{20,}\b")


def rel(p: Path) -> str:
    return p.relative_to(ROOT).as_posix()


def read(p: Path) -> str:
    return p.read_text(encoding="utf-8").rstrip() + "\n"


def decisions_tail(n: int) -> str:
    """Последние n записей журнала решений (запись начинается с «## »)."""
    text = read(ROOT / "state/DECISIONS.md")
    parts = re.split(r"(?m)^(?=## )", text)
    entries = [p for p in parts if p.startswith("## ")]
    tail = entries[-n:] if n > 0 else []
    head = f"_Последние {len(tail)} из {len(entries)} записей; весь журнал — state/DECISIONS.md._\n\n"
    return head + "".join(tail).rstrip() + "\n"


def first_heading(p: Path) -> str:
    if not p.exists():
        return ""
    for line in p.read_text(encoding="utf-8").splitlines():
        if line.startswith("#"):
            return line.lstrip("#").strip()
    return ""


def quests_index() -> str:
    rows = ["| id | дело | quest.json: версия · точек | файлов в `story/` | файлов в `research/` |",
            "|---|---|---|---|---|"]
    for d in sorted(p for p in (ROOT / "quests").iterdir() if p.is_dir() and not p.name.startswith("_")):
        title = (first_heading(d / "identity.md").replace(" — паспорт стиля", "")
                 or first_heading(d / "research" / "facts.md"))
        qj = d / "quest.json"
        if qj.exists():
            try:
                q = json.loads(qj.read_text(encoding="utf-8"))
                title = title or q.get("title", "")
                ver = f"{q.get('version', '?')} · {len(q.get('points', []))}"
            except (ValueError, OSError) as e:
                ver = f"ошибка чтения: {e.__class__.__name__}"
        else:
            ver = "нет (заготовка)"
        story = len(list((d / "story").rglob("*.md"))) if (d / "story").is_dir() else 0
        research = len(list((d / "research").rglob("*.md"))) if (d / "research").is_dir() else 0
        rows.append(f"| {d.name} | {title or '—'} | {ver} | {story} | {research} |")
    return "\n".join(rows) + "\n\nНомер версии в плеере — `quests/<id>/quest.json`; сценарии для владельца — `docs/drive.md`.\n"


def git_info() -> str:
    try:
        out = subprocess.run(["git", "-C", str(ROOT), "log", "-1", "--format=%h %cd", "--date=format:%Y-%m-%d %H:%M"],
                             capture_output=True, text=True, timeout=10)
        return out.stdout.strip() or "нет данных git"
    except (OSError, subprocess.SubprocessError):
        return "нет данных git"


def sections(lite: bool, n_dec: int):
    """(заголовок, путь-источник, текст) по порядку чтения."""
    def f(path):
        p = ROOT / path
        return (path, path, read(p)) if p.exists() else None

    def glob(pattern):
        return [f(rel(p)) for p in sorted(ROOT.glob(pattern))]

    out = [f("docs/CONTEXT.md"), f("CLAUDE.md"), f("state/GOALS.md"), f("state/STATUS.md"),
           f("state/ROADMAP.md"), f("APPROVALS.md")]
    if not lite:
        out += [f("state/BACKLOG.md"), f("state/HYPOTHESES.md")]
    out.append(("state/DECISIONS.md — хвост", "state/DECISIONS.md", decisions_tail(n_dec)))
    out.append(("Квесты — оглавление", "quests/*/", quests_index()))
    out += glob("briefs/*.md")
    out += glob("team/roles/*.md") + [f("team/reviewer.md")]
    out += glob("team/std/*.md")
    if not lite:
        out += glob("team/playbooks/*.md")
    out += [f("docs/backup.md")]
    return [s for s in out if s]


def main():
    today = dt.date.today().isoformat()
    ap = argparse.ArgumentParser(description="Пакет контекста проекта одним файлом")
    ap.add_argument("-o", "--out", default=f"/tmp/dvorami-context-{today}.md", help="куда записать (вне репозитория)")
    ap.add_argument("--decisions", type=int, default=15, help="сколько последних записей DECISIONS (по умолчанию 15)")
    ap.add_argument("--lite", action="store_true", help="без BACKLOG, HYPOTHESES и плейбуков")
    a = ap.parse_args()

    out = Path(a.out).expanduser().resolve()
    if out == ROOT or ROOT in out.parents:
        sys.exit(f"Пакет не кладётся в репозиторий: {out}. Укажите путь снаружи, например /tmp/…")

    secs = sections(a.lite, a.decisions)
    for title, src, text in secs:
        if SECRET_RE.search(text):
            sys.exit(f"В {src} похоже на токен или ключ — пакет не собран. Уберите секрет из файла.")

    toc = ["| № | раздел | источник | КБ |", "|---|---|---|---|"]
    for i, (title, src, text) in enumerate(secs, 1):
        toc.append(f"| {i} | {title} | `{src}` | {len(text.encode('utf-8')) / 1024:.1f} |")
    body = []
    for i, (title, src, text) in enumerate(secs, 1):
        body.append(f"\n\n---\n\n# {i}. {title}\n_Источник: `{src}`_\n\n{text}")

    total_chars = sum(len(t) for _, _, t in secs)
    head = (f"# Пакет контекста «Дворами»{' (облегчённый)' if a.lite else ''}\n\n"
            f"Собран {today} из репозитория github.com/jastiss/dvorami (коммит {git_info()}).\n"
            f"Как читать: сначала раздел 1 (docs/CONTEXT.md) — что за проект; раздел 2 (CLAUDE.md) — как работает команда; "
            f"текущее состояние — state/STATUS.md. Источник истины — файлы репозитория; этот пакет — их копия на дату сборки.\n"
            f"Объём: {len(secs)} разделов, ≈{total_chars // 1000} тыс. знаков (≈{total_chars * 2 // 5 // 1000} тыс. токенов).\n\n"
            "## Оглавление\n\n" + "\n".join(toc) + "\n")
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(head + "".join(body), encoding="utf-8")
    size = out.stat().st_size
    print(f"Готово: {out} — {size / 1024:.0f} КБ, {len(secs)} разделов, ≈{total_chars * 2 // 5 // 1000} тыс. токенов")


if __name__ == "__main__":
    main()

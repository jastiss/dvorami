"""Отправляет владельцу новые отчёты из reports/.

Режимы:
  python3 scripts/telegram_notify.py          — отчёты, изменённые в последнем пуше
  python3 scripts/telegram_notify.py latest   — последний отчёт
  python3 scripts/telegram_notify.py test     — тестовое сообщение
"""

import os
import pathlib
import subprocess
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import tg  # noqa: E402

ROOT = pathlib.Path(__file__).resolve().parent.parent
REPO = os.environ.get("GITHUB_REPOSITORY", "")


def changed_reports():
    before = os.environ.get("BEFORE", "")
    if not before or set(before) == {"0"}:
        return latest()
    try:
        out = subprocess.run(
            ["git", "diff", "--name-only", "--diff-filter=AM", before, "HEAD", "--", "reports/"],
            cwd=ROOT, capture_output=True, text=True, check=True,
        ).stdout
    except subprocess.CalledProcessError:
        return latest()
    return sorted(p for p in out.split() if p.endswith(".md"))


def latest():
    files = sorted((ROOT / "reports").glob("*.md"))
    files = [f for f in files if f.name.lower() != "readme.md"]
    return [str(files[-1].relative_to(ROOT))] if files else []


def main():
    token, chat_id = tg.env()
    mode = sys.argv[1] if len(sys.argv) > 1 else "changed"

    if mode == "test":
        ok = tg.send(token, chat_id, "✅ <b>Дворами</b>: бот подключён. Отчёты будут приходить сюда, "
                     "а ваши сообщения боту попадут команде как указания.\n\n/help — что умеет бот")
        sys.exit(0 if ok else 1)

    paths = latest() if mode == "latest" else changed_reports()
    if not paths:
        print("Новых отчётов нет.")
        return
    ok = True
    for p in paths:
        html = tg.md_to_html((ROOT / p).read_text(encoding="utf-8"))
        if REPO:
            html += f'\n\n<a href="https://github.com/{REPO}/blob/main/{p}">Открыть в GitHub</a>'
        ok = tg.send(token, chat_id, html) and ok
    sys.exit(0 if ok else 1)


if __name__ == "__main__":
    main()

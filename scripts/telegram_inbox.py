"""Забирает сообщения владельца из Telegram и складывает их в DIRECTIVES.md.

Принимаются сообщения только из чата TELEGRAM_CHAT_ID. Остальные пропускаются.
Команды: /status, /approvals, /help. Любой другой текст — указание команде.
"""

import datetime
import os
import pathlib
import re
import sys
from zoneinfo import ZoneInfo

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import tg  # noqa: E402

ROOT = pathlib.Path(__file__).resolve().parent.parent
OFFSET_FILE = ROOT / ".telegram" / "offset"
DIRECTIVES = ROOT / "DIRECTIVES.md"
STATUS = ROOT / "state" / "STATUS.md"
APPROVALS = ROOT / "APPROVALS.md"
MSK = ZoneInfo("Europe/Moscow")

HELP = (
    "<b>Дворами — бот команды</b>\n\n"
    "Любое сообщение — указание команде. Оно попадёт в DIRECTIVES.md, "
    "команда учтёт его в следующей итерации.\n\n"
    "Ответ на вопрос из отчёта: <code>A-3 да</code> или <code>A-3 нет, лучше …</code>\n"
    "Остаток лимита Claude для отчётов: <code>лимит 40%</code>\n\n"
    "/status — где мы сейчас\n"
    "/approvals — что ждёт вашего решения\n"
    "/help — эта справка\n\n"
    "Пройти квест: GitHub → Actions → «Квест — прохождение» → Run workflow, затем /quest здесь."
)


def read_offset():
    try:
        return int(OFFSET_FILE.read_text().strip())
    except (FileNotFoundError, ValueError):
        return 0


def pending_approvals():
    text = APPROVALS.read_text(encoding="utf-8")
    m = re.search(r"## Ожидают решения\s*(.*?)(?=\n## |\Z)", text, re.S)
    body = m.group(1).strip() if m else ""
    return body or "Ничего не ждёт вашего решения."


def append_directives(entries):
    text = DIRECTIVES.read_text(encoding="utf-8")
    if "## Из Telegram" not in text:
        text = text.rstrip() + "\n\n## Из Telegram\n"
    text = text.rstrip() + "\n" + "\n".join(entries) + "\n"
    DIRECTIVES.write_text(text, encoding="utf-8")


def format_entry(ts, body):
    body = body.replace("<!--", "‹!--").replace("-->", "--›").strip()
    lines = body.splitlines() or [""]
    first = f"- [{ts}] {lines[0]}"
    rest = [f"  {ln}" for ln in lines[1:]]
    return "\n".join([first, *rest])


def main():
    token, chat_id = tg.env()
    offset = read_offset()
    r = tg.call(token, "getUpdates", {"offset": offset, "timeout": 0, "allowed_updates": ["message"]})
    if not r.get("ok"):
        print(f"::error::getUpdates: {r.get('description')}")
        sys.exit(1)

    updates = r.get("result", [])
    if not updates:
        print("Новых сообщений нет.")
        return

    entries = []
    for u in updates:
        offset = max(offset, u["update_id"] + 1)
        msg = u.get("message") or {}
        if str((msg.get("chat") or {}).get("id")) != chat_id:
            continue  # чужие чаты игнорируем
        text = (msg.get("text") or msg.get("caption") or "").strip()
        mid = msg.get("message_id")
        if not text:
            tg.send(token, chat_id, "Пока понимаю только текст.", reply_to=mid)
            continue
        cmd = text.split()[0].split("@")[0].lower()
        if cmd in ("/start", "/help"):
            tg.send(token, chat_id, HELP, reply_to=mid)
        elif cmd == "/status":
            tg.send(token, chat_id, tg.md_to_html(STATUS.read_text(encoding="utf-8")), reply_to=mid)
        elif cmd == "/approvals":
            tg.send(token, chat_id, tg.md_to_html(pending_approvals()), reply_to=mid)
        else:
            ts = datetime.datetime.fromtimestamp(msg.get("date", 0), MSK).strftime("%Y-%m-%d %H:%M")
            entries.append(format_entry(ts, text))
            tg.send(token, chat_id, "📝 Записал. Команда учтёт в следующей итерации.", reply_to=mid)

    if entries:
        append_directives(entries)
        print(f"Добавлено указаний: {len(entries)}")
    OFFSET_FILE.parent.mkdir(exist_ok=True)
    OFFSET_FILE.write_text(f"{offset}\n")


if __name__ == "__main__":
    main()

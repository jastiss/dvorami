"""Принудительный запуск итерации команды через API-триггер запланированной задачи Claude.

Нужны секреты репозитория CLAUDE_FIRE_URL и CLAUDE_FIRE_TOKEN (claude.ai/code/routines → задача → Edit → Trigger + API).

  python3 scripts/fire_team.py   — если есть флаг .telegram/run-requested, запускает команду и сообщает в Telegram
"""

import json
import os
import pathlib
import sys
import urllib.error
import urllib.request

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import tg  # noqa: E402

ROOT = pathlib.Path(__file__).resolve().parent.parent
FLAG = ROOT / ".telegram" / "run-requested"


def fire(reason):
    url = os.environ.get("CLAUDE_FIRE_URL", "").strip()
    token = os.environ.get("CLAUDE_FIRE_TOKEN", "").strip()
    if not url or not token:
        return False, ("Запуск из Telegram ещё не настроен: нет секретов CLAUDE_FIRE_URL и CLAUDE_FIRE_TOKEN. "
                       "Инструкция — в README, раздел «Запуск команды из Telegram».")
    body = json.dumps({"text": reason}).encode("utf-8")
    req = urllib.request.Request(url, data=body, method="POST", headers={
        "Authorization": f"Bearer {token}",
        "anthropic-beta": "experimental-cc-routine-2026-04-01",
        "anthropic-version": "2023-06-01",
        "Content-Type": "application/json",
    })
    try:
        with urllib.request.urlopen(req, timeout=60) as resp:
            data = json.loads(resp.read().decode("utf-8"))
        link = data.get("claude_code_session_url", "")
        return True, f"🚀 Команда запущена. Отчёт придёт сюда по окончании.\n{link}".strip()
    except urllib.error.HTTPError as e:
        detail = e.read().decode("utf-8", "replace")[:300]
        return False, f"Не удалось запустить команду: HTTP {e.code}. {detail}"
    except (urllib.error.URLError, TimeoutError, OSError) as e:
        return False, f"Не удалось запустить команду: {e}"


def main():
    if not FLAG.exists():
        print("Запуск не запрошен.")
        return
    reason = FLAG.read_text(encoding="utf-8").strip() or "Принудительный запуск из Telegram"
    FLAG.unlink()
    ok, msg = fire(reason)
    print(msg)
    token, chat_id = tg.env()
    tg.send(token, chat_id, msg)
    sys.exit(0 if ok else 1)


if __name__ == "__main__":
    main()

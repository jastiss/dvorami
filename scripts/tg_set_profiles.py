"""Тексты профиля в Telegram: описание игрового бота (до /start и в карточке) и описание канала.

Читает docs/marketing/channel/profiles.json:
  bot_description        ≤ 512 — экран «Что умеет этот бот?» перед первым /start  → setMyDescription
  bot_short_description  ≤ 120 — строка в профиле бота и в превью ссылки          → setMyShortDescription
  channel_description    ≤ 255 — описание канала                                  → setChatDescription
Ключа нет — этот шаг пропускается. Длина больше предела — ничего не отправляем, выходим с ошибкой.
Запуск — workflow «Telegram — профили» (секреты PLAYER_BOT_TOKEN, CHANNEL_CHAT_ID).
Проверка без отправки: python3 scripts/tg_set_profiles.py --dry-run
"""

import json
import os
import pathlib
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import tg  # noqa: E402

PROFILES = pathlib.Path(__file__).resolve().parent.parent / "docs" / "marketing" / "channel" / "profiles.json"
# ключ → (предел, метод, имя поля)
FIELDS = {
    "bot_description": (512, "setMyDescription", "description"),
    "bot_short_description": (120, "setMyShortDescription", "short_description"),
    "channel_description": (255, "setChatDescription", "description"),
}


def load(path=PROFILES):
    data = json.loads(pathlib.Path(path).read_text(encoding="utf-8"))
    errors = []
    for key, (limit, _, _) in FIELDS.items():
        val = data.get(key)
        if val is None:
            continue
        if not isinstance(val, str) or not val.strip():
            errors.append(f"{key}: пустое или не строка")
        elif len(val) > limit:
            errors.append(f"{key}: {len(val)} символов, предел {limit}")
    return data, errors


def apply(data, token, channel):
    ok = True
    for key, (_, method, field) in FIELDS.items():
        if data.get(key) is None:
            print(f"{key}: нет в файле — пропускаю")
            continue
        params = {field: data[key].strip()}
        if method == "setChatDescription":
            params["chat_id"] = channel
        r = tg.call(token, method, params)
        print(f"{method} → {r.get('ok')} {r.get('description', '')}")
        ok = ok and bool(r.get("ok"))
    return ok


def main(argv=None):
    argv = sys.argv[1:] if argv is None else argv
    if not PROFILES.exists():
        print(f"::error::нет файла {PROFILES.relative_to(PROFILES.parents[3])} — тексты пишет Маркетолог")
        return 1
    data, errors = load()
    for e in errors:
        print(f"::error::{e}")
    if errors:
        return 1
    if "--dry-run" in argv:
        for key in FIELDS:
            if data.get(key) is not None:
                print(f"{key} ({len(data[key].strip())}): {data[key].strip()}")
        return 0
    token = os.environ.get("PLAYER_BOT_TOKEN", "").strip()
    if not token:
        print("::error::PLAYER_BOT_TOKEN не задан")
        return 1
    channel = os.environ.get("CHANNEL_CHAT_ID", "").strip() or "@dvorami_quest"
    return 0 if apply(data, token, channel) else 1


if __name__ == "__main__":
    sys.exit(main())

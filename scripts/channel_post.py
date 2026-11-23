"""Публикует одобренные посты в канал @dvorami_quest.

Посты: docs/marketing/channel/posts/NNN-*.md — шапка (frontmatter) + текст в Telegram-HTML.
Публикуется пост, только если: status: approved, ещё нет message_id и наступили date + time (МСК).
После успешной отправки в файл пишутся status: published, message_id, published_at.

Режимы:
  python3 scripts/channel_post.py                 — опубликовать (не больше --max за запуск)
  python3 scripts/channel_post.py --dry-run       — показать, что ушло бы, ничего не отправлять и не менять
  python3 scripts/channel_post.py --dry-run --include-drafts --now 2026-12-31T00:00
                                                  — прогнать проверку и «отправку» и для черновиков
  python3 scripts/channel_post.py --check         — только проверки (разметка, длина, картинка, спойлеры)

Токен: PLAYER_BOT_TOKEN — бот для игроков @dvorami_bot (его владелец делает админом канала).
Канал: CHANNEL_ID (по умолчанию @dvorami_quest).
Без внешних зависимостей: на раннере GitHub нужен только python3.
"""

import argparse
import datetime as dt
import glob
import html
import json
import os
import pathlib
import re
import sys
import uuid
import urllib.error
import urllib.request

ROOT = pathlib.Path(__file__).resolve().parent.parent
POSTS = ROOT / "docs" / "marketing" / "channel" / "posts"
MSK = dt.timezone(dt.timedelta(hours=3))  # в Москве нет перехода на летнее время
CAPTION_LIMIT = 1024
TEXT_LIMIT = 4096
ALLOWED_TAGS = {"b", "strong", "i", "em", "u", "ins", "s", "strike", "del", "a", "code", "pre",
                "blockquote", "tg-spoiler", "span"}


# ---------- файл поста ----------

def parse(path):
    raw = path.read_text(encoding="utf-8")
    m = re.match(r"^---\n(.*?)\n---\n?(.*)$", raw, re.S)
    if not m:
        raise ValueError("нет шапки --- … ---")
    meta, key = {}, None
    for line in m.group(1).split("\n"):
        if not line.strip() or line.lstrip().startswith("#"):
            continue
        item = re.match(r"^\s+-\s+(.*)$", line)
        if item and key:
            if not isinstance(meta.get(key), list):
                meta[key] = []
            meta[key].append(_unquote(item.group(1)))
            continue
        kv = re.match(r"^([A-Za-z_]+):\s*(.*)$", line)
        if not kv:
            raise ValueError(f"не понял строку шапки: {line!r}")
        key, val = kv.group(1), kv.group(2).strip()
        meta[key] = _unquote(val) if val else ""
    body = m.group(2)
    # HTML-комментарии — заметки команды, в Telegram не уходят
    body = re.sub(r"<!--.*?-->", "", body, flags=re.S).strip()
    return meta, body, raw


def _unquote(v):
    v = v.strip()
    if len(v) >= 2 and v[0] == v[-1] and v[0] in "\"'":
        return v[1:-1]
    return v


def write_meta(path, raw, updates):
    """Меняет/добавляет поля шапки, не трогая остальной файл."""
    m = re.match(r"^---\n(.*?)\n---\n?", raw, re.S)
    head, rest = m.group(1), raw[m.end():]
    lines = head.split("\n")
    for k, v in updates.items():
        new = f"{k}: {v}"
        for i, line in enumerate(lines):
            if re.match(rf"^{k}:", line):
                lines[i] = new
                break
        else:
            lines.append(new)
    path.write_text("---\n" + "\n".join(lines) + "\n---\n" + rest, encoding="utf-8")


def scheduled_at(meta):
    d = dt.date.fromisoformat(meta["date"])
    h, mi = (int(x) for x in meta.get("time", "09:00").split(":"))
    return dt.datetime(d.year, d.month, d.day, h, mi, tzinfo=MSK)


# ---------- проверки ----------

def visible_len(body):
    return len(html.unescape(re.sub(r"<[^>]+>", "", body)))


def check_html(body):
    errs, stack = [], []
    for m in re.finditer(r"<(/?)([a-zA-Z-]+)([^>]*)>", body):
        closing, tag = m.group(1) == "/", m.group(2).lower()
        if tag not in ALLOWED_TAGS:
            errs.append(f"тег <{tag}> Telegram не поддерживает")
            continue
        if closing:
            if not stack or stack[-1] != tag:
                errs.append(f"лишний или перепутанный </{tag}>")
            else:
                stack.pop()
        else:
            stack.append(tag)
    if stack:
        errs.append(f"не закрыты теги: {', '.join(stack)}")
    if re.search(r"&(?!amp;|lt;|gt;|quot;|#\d+;)", body):
        errs.append("символ & без экранирования (&amp;)")
    return errs


def _norm(s):
    return s.lower().replace("ё", "е")


def spoiler_terms():
    """Слова-ответы и годы-улики всех квестов. Короткие стемы (<5 букв) не берём — слишком шумно."""
    words, stems, years = set(), set(), set()
    for qp in glob.glob(str(ROOT / "quests" / "*" / "quest.json")):
        try:
            q = json.loads(pathlib.Path(qp).read_text(encoding="utf-8"))
        except (OSError, ValueError):
            continue
        for p in q.get("points", []):
            for s in p.get("steps", []):
                for a in s.get("answers") or []:
                    a = _norm(str(a)).strip()
                    if a.startswith("~"):
                        if len(a) - 1 >= 5:
                            stems.add(a[1:])
                    elif len(a) >= 3 and re.search(r"[а-яa-z]", a):
                        words.add(a)
            clue = p.get("clue") or {}
            if clue.get("year"):
                years.add(str(clue["year"]))
    return words, stems, years


def find_spoilers(text, terms, allowed):
    words, stems, years = terms
    t = _norm(re.sub(r"<[^>]+>", " ", html.unescape(text)))
    hits = set()
    for w in words:
        if re.search(rf"(?<![а-яa-z0-9]){re.escape(w)}(?![а-яa-z0-9])", t):
            hits.add(w)
    for st in stems:
        if re.search(rf"(?<![а-яa-z0-9]){re.escape(st)}", t):
            hits.add("~" + st)
    for y in years:
        if re.search(rf"(?<!\d){y}(?!\d)", t):
            hits.add(y)
    ok = {_norm(a).lstrip("~") for a in allowed}
    return sorted(h for h in hits if h.lstrip("~") not in ok)


def validate(path, meta, body, terms):
    errs = []
    for f in ("id", "date", "time", "type", "status"):
        if not meta.get(f):
            errs.append(f"нет поля {f}")
    try:
        scheduled_at(meta)
    except (KeyError, ValueError):
        errs.append("date/time не в формате ГГГГ-ММ-ДД / ЧЧ:ММ")
    typ = meta.get("type")
    if typ not in ("photo", "text", "poll"):
        errs.append("type: photo | text | poll")
    if meta.get("status") not in ("draft", "approved", "published"):
        errs.append("status: draft | approved | published")
    if typ == "photo":
        img = meta.get("image", "")
        if not img or not (ROOT / img).is_file():
            errs.append(f"нет картинки {img!r}")
        if visible_len(body) > CAPTION_LIMIT:
            errs.append(f"подпись {visible_len(body)} > {CAPTION_LIMIT} символов")
    if typ == "text" and visible_len(body) > TEXT_LIMIT:
        errs.append(f"текст {visible_len(body)} > {TEXT_LIMIT} символов")
    if typ in ("photo", "text"):
        if not body:
            errs.append("пустой текст")
        errs += check_html(body)
    if typ == "poll":
        opts = meta.get("options") or []
        if not meta.get("question") or len(meta["question"]) > 300:
            errs.append("question: обязателен, ≤ 300 символов")
        if not isinstance(opts, list) or not 2 <= len(opts) <= 10 or any(len(o) > 100 for o in opts):
            errs.append("options: 2–10 вариантов, каждый ≤ 100 символов")
    if bool(meta.get("button_text")) != bool(meta.get("button_url")):
        errs.append("button_text и button_url задаются вместе")
    allowed = [a.strip() for a in str(meta.get("spoiler_ok", "")).split(",") if a.strip()]
    text_all = " ".join([body, meta.get("question", ""), " ".join(meta.get("options") or [])
                         if isinstance(meta.get("options"), list) else ""])
    sp = find_spoilers(text_all, terms, allowed)
    if sp:
        errs.append("возможный спойлер (слова/годы из ответов квестов): " + ", ".join(sp)
                    + " — убрать или внести в spoiler_ok с объяснением")
    return errs


# ---------- Telegram ----------

def api(token, method, params=None, files=None, timeout=60):
    url = f"https://api.telegram.org/bot{token}/{method}"
    if files:
        boundary = uuid.uuid4().hex
        parts = []
        for k, v in (params or {}).items():
            v = json.dumps(v, ensure_ascii=False) if isinstance(v, (dict, list)) else str(v)
            parts.append(f'--{boundary}\r\nContent-Disposition: form-data; name="{k}"\r\n\r\n{v}\r\n'.encode())
        for k, p in files.items():
            parts.append((f'--{boundary}\r\nContent-Disposition: form-data; name="{k}"; '
                          f'filename="{p.name}"\r\nContent-Type: image/png\r\n\r\n').encode())
            parts.append(p.read_bytes() + b"\r\n")
        parts.append(f"--{boundary}--\r\n".encode())
        data, ctype = b"".join(parts), f"multipart/form-data; boundary={boundary}"
    else:
        data, ctype = json.dumps(params or {}).encode(), "application/json"
    req = urllib.request.Request(url, data=data, headers={"Content-Type": ctype})
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            return json.loads(r.read().decode())
    except urllib.error.HTTPError as e:
        return {"ok": False, "description": e.read().decode("utf-8", "replace")}
    except (urllib.error.URLError, TimeoutError, OSError, ValueError) as e:
        return {"ok": False, "description": f"{type(e).__name__}: {e}"}


def build_request(meta, body, chat):
    params = {"chat_id": chat}
    if meta.get("button_text"):
        params["reply_markup"] = {"inline_keyboard": [[{"text": meta["button_text"], "url": meta["button_url"]}]]}
    typ = meta["type"]
    if typ == "photo":
        params.update(caption=body, parse_mode="HTML")
        return "sendPhoto", params, {"photo": ROOT / meta["image"]}
    if typ == "text":
        params.update(text=body, parse_mode="HTML", link_preview_options={"is_disabled": True})
        return "sendMessage", params, None
    params.update(question=meta["question"], options=[{"text": o} for o in meta["options"]], is_anonymous=True)
    return "sendPoll", params, None


# ---------- main ----------

def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--dry-run", action="store_true", help="ничего не отправлять и не менять файлы")
    ap.add_argument("--check", action="store_true", help="только проверки всех постов")
    ap.add_argument("--include-drafts", action="store_true", help="(только с --dry-run) считать черновики одобренными")
    ap.add_argument("--now", help="подменить текущее время, МСК: 2026-11-25T19:30")
    ap.add_argument("--max", type=int, default=1, help="сколько постов максимум за запуск (по умолчанию 1)")
    a = ap.parse_args()
    if a.include_drafts and not a.dry_run:
        sys.exit("--include-drafts допустим только с --dry-run")

    now = dt.datetime.fromisoformat(a.now).replace(tzinfo=MSK) if a.now else dt.datetime.now(MSK)
    terms = spoiler_terms()
    files = sorted(POSTS.glob("[0-9][0-9][0-9]-*.md"))
    print(f"Сейчас (МСК): {now:%Y-%m-%d %H:%M}. Постов: {len(files)}. "
          f"Слов-ответов в проверке спойлеров: {len(terms[0]) + len(terms[1])}, годов: {len(terms[2])}.")

    bad, due = 0, []
    for p in files:
        try:
            meta, body, raw = parse(p)
        except ValueError as e:
            print(f"✗ {p.name}: {e}")
            bad += 1
            continue
        errs = validate(p, meta, body, terms)
        when = meta.get("date", "?") + " " + meta.get("time", "?")
        mark = "✗" if errs else "✓"
        print(f"{mark} {p.name}  [{meta.get('status')}] {meta.get('type')} {when}"
              + (f"  ({visible_len(body)} симв.)" if meta.get("type") != "poll" else ""))
        for e in errs:
            print(f"    — {e}")
        bad += bool(errs)
        status = meta.get("status")
        ready = status == "approved" or (a.include_drafts and status == "draft")
        if ready and not meta.get("message_id") and not errs and scheduled_at(meta) <= now:
            due.append((p, meta, body, raw))

    if a.check:
        sys.exit(1 if bad else 0)

    if not due:
        print("К публикации сейчас ничего нет (нужны status: approved и наступившее время).")
        return
    due = due[: a.max]

    chat = os.environ.get("CHANNEL_ID", "@dvorami_quest").strip()
    token = os.environ.get("PLAYER_BOT_TOKEN", "").strip()
    if not a.dry_run and not token:
        print("::warning::PLAYER_BOT_TOKEN не задан — публикация пропущена.")
        return

    failed = False
    for p, meta, body, raw in due:
        method, params, upload = build_request(meta, body, chat)
        if a.dry_run:
            shown = {k: v for k, v in params.items()}
            print(f"\n[dry-run] {p.name} → {method} в {chat}"
                  + (f" + файл {upload['photo'].relative_to(ROOT)}" if upload else ""))
            print(json.dumps(shown, ensure_ascii=False, indent=2))
            continue
        r = api(token, method, params, upload)
        if not r.get("ok"):
            print(f"::error::{p.name}: Telegram ответил: {r.get('description')}")
            failed = True
            continue
        mid = r["result"]["message_id"]
        write_meta(p, raw, {"status": "published", "message_id": mid,
                            "published_at": dt.datetime.now(MSK).strftime("%Y-%m-%d %H:%M")})
        print(f"✓ опубликован {p.name}: message_id={mid} https://t.me/{chat.lstrip('@')}/{mid}")
    sys.exit(1 if failed else 0)


if __name__ == "__main__":
    main()

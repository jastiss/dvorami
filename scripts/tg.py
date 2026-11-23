"""Минимальный клиент Telegram Bot API без внешних зависимостей."""

import json
import os
import re
import sys
import urllib.error
import urllib.request

LIMIT = 4000  # у Telegram предел 4096 символов на сообщение


def env():
    token = os.environ.get("TELEGRAM_BOT_TOKEN", "").strip()
    chat_id = os.environ.get("TELEGRAM_CHAT_ID", "").strip()
    if not token or not chat_id:
        print("::warning::TELEGRAM_BOT_TOKEN или TELEGRAM_CHAT_ID не заданы — пропускаю.")
        sys.exit(0)
    return token, chat_id


def call(token, method, params, timeout=None):
    data = json.dumps(params).encode("utf-8")
    req = urllib.request.Request(
        f"https://api.telegram.org/bot{token}/{method}",
        data=data,
        headers={"Content-Type": "application/json"},
    )
    try:
        wait = timeout or (int(params.get("timeout", 0)) + 30)
        with urllib.request.urlopen(req, timeout=wait) as resp:
            return json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        body = e.read().decode("utf-8", "replace")
        return {"ok": False, "error_code": e.code, "description": body}
    except (urllib.error.URLError, TimeoutError, OSError, ValueError) as e:
        return {"ok": False, "description": f"{type(e).__name__}: {e}"}


def _esc(s):
    return s.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")


def md_to_html(md):
    """Упрощённый перевод Markdown отчёта в HTML-разметку Telegram."""
    out = []
    in_code = False
    for line in md.splitlines():
        if line.strip().startswith("```"):
            in_code = not in_code
            continue
        if in_code:
            out.append(f"<code>{_esc(line)}</code>")
            continue
        if re.match(r"^\s*<!--.*-->\s*$", line):
            continue
        s = _esc(line)
        m = re.match(r"^(#{1,6})\s+(.*)$", s)
        if m:
            s = f"<b>{m.group(2)}</b>"
        s = re.sub(r"^(\s*)[-*]\s+\[x\]\s+", r"\1✅ ", s)
        s = re.sub(r"^(\s*)[-*]\s+\[ \]\s+", r"\1▫️ ", s)
        s = re.sub(r"^(\s*)[-*]\s+", r"\1• ", s)
        s = re.sub(r"\*\*(.+?)\*\*", r"<b>\1</b>", s)
        s = re.sub(r"`([^`]+)`", r"<code>\1</code>", s)
        s = re.sub(
            r"\[([^\]]+)\]\((https?://[^)\s]+)\)",
            lambda mm: f'<a href="{mm.group(2).replace(chr(34), "%22")}">{mm.group(1)}</a>',
            s,
        )
        out.append(s)
    text = "\n".join(out)
    return re.sub(r"\n{3,}", "\n\n", text).strip()


def split(text, limit=LIMIT):
    """Режет по строкам, чтобы не рвать HTML-теги внутри строки."""
    chunks, cur = [], ""
    for line in text.split("\n"):
        while len(line) > limit:
            if cur:
                chunks.append(cur)
                cur = ""
            chunks.append(line[:limit])
            line = line[limit:]
        candidate = f"{cur}\n{line}" if cur else line
        if len(candidate) > limit:
            chunks.append(cur)
            cur = line
        else:
            cur = candidate
    if cur:
        chunks.append(cur)
    return chunks


def _strip_tags(s):
    s = re.sub(r"<[^>]+>", "", s)
    return s.replace("&lt;", "<").replace("&gt;", ">").replace("&amp;", "&")


def send(token, chat_id, html, reply_to=None, reply_markup=None):
    ok = True
    for chunk in split(html):
        params = {
            "chat_id": chat_id,
            "text": chunk,
            "parse_mode": "HTML",
            "disable_web_page_preview": True,
        }
        if reply_to:
            params["reply_to_message_id"] = reply_to
            params["allow_sending_without_reply"] = True
        if reply_markup:
            params["reply_markup"] = reply_markup
        r = call(token, "sendMessage", params)
        if not r.get("ok"):
            # запасной вариант: без разметки
            params.pop("parse_mode")
            params["text"] = _strip_tags(chunk)
            r = call(token, "sendMessage", params)
        if not r.get("ok"):
            print(f"::error::Telegram: {r.get('description')}")
            ok = False
    return ok

#!/usr/bin/env python3
"""Публикация постов в канал @dvorami_quest по одобрению.

Посты — файлы docs/marketing/channel/posts/NNN-*.md: frontmatter + HTML-подпись.
Публикуется ТОЛЬКО пост со status: approved, без message_id и с наступившим временем МСК.
За один запуск — максимум один пост (ближайший по дате). После успеха: status: published, message_id.

Токен: PLAYER_BOT_TOKEN — тот же бот @dvorami_bot, что общается с игроками
(docs/feedback-bot.md). Обоснование: отдельный бот для канала не нужен — один бот
и отвечает игрокам, и постит в канал; публикация (sendMessage/Photo/Poll в канал) не
пересекается с getUpdates игрового бота. Нужно лишь сделать @dvorami_bot админом канала.
Канал задаётся CHANNEL_CHAT_ID (по умолчанию @dvorami_quest).

Frontmatter:
    rubric: Вопрос             # рубрика из docs/marketing/content-plan.md (обязательно)
    visual: без картинки       # что за картинка и откуда, или «без картинки» (обязательно)
    slot: Н1 чт                # место в сетке плана; date ставится при одобрении
    date: 2026-11-25          # дата публикации (МСК); у draft может не быть
    time: "19:30"             # время МСК, 24ч
    status: draft|approved|published
    image: img/001-...png     # относительно папки поста; нет — пост текстом
    message_id: 1234          # проставляется скриптом после публикации
    # опциональный опрос (sendPoll; картинку Telegram к опросу не прикрепляет):
    poll_question: "..."
    poll_options: Вариант 1 | Вариант 2 | Вариант 3
    poll_multiple: false
Тело после второго '---' — HTML-подпись/текст (Telegram-HTML).

Флаги:
    --check     проверить все draft/approved посты (разметка, длина, картинка, спойлеры,
                рубрика и визуал, признаки машинного текста) и выйти
    --dry-run   показать, что было бы опубликовано, без отправки
Запуск в CI — без флагов: публикует один готовый пост.

Сеть к Telegram в песочнице закрыта — это нормально: --check и --dry-run работают офлайн.
"""
import glob
import json
import os
import pathlib
import re
import sys
from datetime import datetime
from zoneinfo import ZoneInfo

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from tg import call  # минимальный клиент Bot API, без внешних зависимостей

ROOT = pathlib.Path(__file__).resolve().parent.parent
POSTS = ROOT / "docs" / "marketing" / "channel" / "posts"
MSK = ZoneInfo("Europe/Moscow")
CAPTION_LIMIT = 1024   # подпись к фото
TEXT_LIMIT = 4096      # обычное сообщение
POLL_Q_LIMIT = 300

ALLOWED_TAGS = {"b", "strong", "i", "em", "u", "s", "strike", "del",
                "a", "code", "pre", "blockquote", "tg-spoiler", "span", "br"}

# Короткие и служебные слова-ответы не берём в спойлер-проверку (ловим по site_spoilers.json).
GENERIC = {"вода", "круг", "шар", "линия", "прямая", "замок", "замки", "храм",
           "собор", "церковь", "озеро", "пруд", "талант", "марка", "марки"}


# ---------------------------------------------------------------- frontmatter
def parse(path):
    text = pathlib.Path(path).read_text(encoding="utf-8")
    m = re.match(r"^---\n(.*?)\n---\n?(.*)$", text, re.S)
    if not m:
        raise ValueError(f"{path}: нет frontmatter")
    meta = {}
    for line in m.group(1).splitlines():
        line = line.strip()
        if not line or line.startswith("#") or ":" not in line:
            continue
        k, v = line.split(":", 1)
        v = v.strip().strip('"').strip("'")
        meta[k.strip()] = v
    return meta, m.group(2).strip()


def dump(path, meta, body, order):
    lines = ["---"]
    for k in order:
        if k in meta and meta[k] != "":
            lines.append(f"{k}: {meta[k]}")
    lines.append("---")
    pathlib.Path(path).write_text("\n".join(lines) + "\n" + body + "\n", encoding="utf-8")


FM_ORDER = ["rubric", "slot", "date", "time", "status", "image", "visual", "message_id",
            "poll_question", "poll_options", "poll_multiple"]


# ---------------------------------------------------------------- проверки
def spoiler_terms():
    terms = set()
    sp = ROOT / "scripts" / "site_spoilers.json"
    if sp.exists():
        data = json.loads(sp.read_text(encoding="utf-8"))
        for k, v in data.items():
            if k == "_":
                continue
            for w in v:
                terms.add(w.lower())
    for qf in glob.glob(str(ROOT / "quests" / "*" / "quest.json")):
        try:
            q = json.loads(pathlib.Path(qf).read_text(encoding="utf-8"))
        except Exception:
            continue

        def walk(o):
            if isinstance(o, dict):
                for kk, vv in o.items():
                    if kk in ("answers", "answer"):
                        vals = vv if isinstance(vv, list) else [vv]
                        for a in vals:
                            a = str(a).strip().lower()
                            # ~стем — служебный префикс движка (совпадение по началу слова);
                            # как спойлер-слово он слишком общий, берём только полные слова.
                            if a.startswith("~"):
                                continue
                            if len(a) >= 5 and not a.isdigit() and a not in GENERIC:
                                terms.add(a)
                    walk(vv)
            elif isinstance(o, list):
                for vv in o:
                    walk(vv)
        walk(q)
    return terms


# Признаки машинного текста — docs/marketing/tone-of-voice.md, «Признаки машинного текста».
# Здесь только то, что ловится механически; остальное по списку проверяет человек.
AI_STAMPS = [
    r"давайте\s+(разбер|посмотр|вспомн|узна)", r"представьте", r"\bименно\b", r"а вы знали", r"знаете ли вы", r"оказывается",
    r"в мире, где", r"не просто\b", r"больше,? чем просто", r"стоит отметить", r"важно понимать",
    r"подпишитесь,? чтобы", r"не пропустит", r"а что думаете вы", r"делитесь в комментариях",
    r"уникальн", r"невероятн", r"удивительн", r"легендарн", r"по-настоящему", r"погрузит",
    r"незабываем", r"мало кто знает", r"является", r"в рамках", r"данн(ый|ая|ое|ые)\b",
    # Правки владельца 24.11 (tone-of-voice.md, пункты 15–18 списка).
    # Расписание-обещание: дни недели и «что когда публикуем».
    r"по (понедельникам|вторникам|средам|четвергам|пятницам|субботам|воскресеньям)",
    r"в (понедельник|вторник|среду|четверг|пятницу|субботу|воскресенье) (утром|днём|вечером)",
    r"в остальные дни", r"кажд(ый|ую|ое) (понедельник|вторник|среду|четверг|пятницу|субботу|воскресенье)",
    # Источник отдельной фразой или сноской вместо ссылки на слове.
    r"(^|\n)\s*источник\w*\s*:", r"число не наше", r"пересчитал журнал",
    r"(журнал|газета|издание|портал)\s+«[^»]+»\s+(пишет|писал|рассказывает|сообщает)\s+об?\b",
    # Ненастоящие противопоставления и прилагательные без смысла.
    r"похож\w* на прогулку, только", r"читать самому", r"прочитать самому", r"\bбодр",
    r"не детектив", r"не расследование", r"никого не лов",
    # Неверно по продукту: в делах есть аудио и картинки.
    r"читать вслух",
]
EMOJI_RE = re.compile("[\U0001F000-\U0001FAFF\u2600-\u27BF\u2B00-\u2BFF\uFE0F]")
MAX_DASHES = 3      # длинных тире на пост
MAX_QUESTIONS = 1   # вопросительных знаков на пост


def check_style(body):
    """Механическая часть проверки на «нейросетевой» стиль. Возвращает список ошибок."""
    errs = []
    text = re.sub(r"<[^>]+>", "", body)
    low = text.lower()
    hits = [m.group(0) for p in AI_STAMPS for m in [re.search(p, low)] if m]
    if hits:
        errs.append("штампы машинного текста: " + ", ".join(hits))
    if "!" in text:
        errs.append("восклицательный знак")
    if EMOJI_RE.search(text):
        errs.append("эмодзи в тексте поста")
    if text.count("—") > MAX_DASHES:
        errs.append(f"длинных тире {text.count('—')} > {MAX_DASHES}")
    if text.count("?") > MAX_QUESTIONS:
        errs.append(f"вопросительных знаков {text.count('?')} > {MAX_QUESTIONS}")
    return errs


def check_html(s):
    """Грубая проверка Telegram-HTML: только разрешённые теги, парность."""
    errs = []
    stack = []
    for m in re.finditer(r"<(/?)([a-zA-Z-]+)([^>]*)>", s):
        close, tag, _ = m.group(1), m.group(2).lower(), m.group(3)
        if tag not in ALLOWED_TAGS:
            errs.append(f"тег <{tag}> не поддерживается Telegram")
            continue
        if tag == "br":
            continue
        if close:
            if not stack or stack[-1] != tag:
                errs.append(f"закрывающий </{tag}> без пары")
            else:
                stack.pop()
        else:
            stack.append(tag)
    if stack:
        errs.append(f"не закрыты теги: {', '.join(stack)}")
    # амперсанды должны быть экранированы
    if re.search(r"&(?!amp;|lt;|gt;|quot;|#)", s):
        errs.append("незаэкранированный & (нужен &amp;)")
    return errs


def visible_len(s):
    return len(re.sub(r"<[^>]+>", "", re.sub(r"&(amp|lt|gt|quot);", "x", s)))


def check_post(path, terms):
    meta, body = parse(path)
    errs, warns = [], []
    status = meta.get("status", "draft")
    img = meta.get("image", "")
    has_poll = bool(meta.get("poll_question"))

    if has_poll:
        if len(meta["poll_question"]) > POLL_Q_LIMIT:
            errs.append(f"вопрос опроса > {POLL_Q_LIMIT}")
        opts = [o.strip() for o in meta.get("poll_options", "").split("|") if o.strip()]
        if not 2 <= len(opts) <= 10:
            errs.append("в опросе должно быть 2–10 вариантов (poll_options через |)")
    else:
        # Картинка запланирована (visual не «без картинки»), но файла ещё нет — длину всё равно
        # считаем как у подписи, чтобы текст не пришлось резать, когда картинка появится.
        planned_img = "без картинки" not in meta.get("visual", "без картинки").lower()
        limit = CAPTION_LIMIT if (img or planned_img) else TEXT_LIMIT
        vl = visible_len(body)
        if not body.strip():
            errs.append("пустой текст поста")
        if vl > limit:
            errs.append(f"текст {vl} символов > лимита {limit}")
        errs += check_html(body)
        errs += check_style(body)

    for key in ("rubric", "visual"):
        if not meta.get(key):
            errs.append(f"нет поля {key} (рубрика и визуал обязательны; визуал может быть «без картинки»)")
    if img and "без картинки" in meta.get("visual", "").lower():
        errs.append("visual: «без картинки», но указано поле image")

    if img:
        p = (POSTS.parent / img).resolve()
        if not p.exists():
            errs.append(f"картинка не найдена: {img}")

    low = (body + " " + meta.get("poll_question", "") + " "
           + meta.get("poll_options", "")).lower()
    hits = sorted({t for t in terms if t in low})
    if hits:
        errs.append("возможные спойлеры (ответы/разгадки): " + ", ".join(hits))

    if status not in ("draft", "approved", "published"):
        warns.append(f"неизвестный status: {status}")
    if not meta.get("time"):
        warns.append("нет поля time")
    if not meta.get("date") and status != "draft":
        errs.append("нет поля date (у draft допустимо, у approved обязательно)")
    return errs, warns


# ---------------------------------------------------------------- выбор поста
def due(meta, now):
    try:
        dt = datetime.strptime(f"{meta['date']} {meta.get('time', '00:00')}",
                               "%Y-%m-%d %H:%M").replace(tzinfo=MSK)
    except Exception:
        return False
    return dt <= now


def pick(now):
    ready = []
    for path in sorted(glob.glob(str(POSTS / "*.md"))):
        meta, body = parse(path)
        if meta.get("status") != "approved":
            continue
        if meta.get("message_id"):
            continue
        if not due(meta, now):
            continue
        ready.append((meta["date"], meta.get("time", ""), path, meta, body))
    ready.sort()
    return ready[0] if ready else None


# ---------------------------------------------------------------- отправка
def publish(token, chat, meta, body, path, dry):
    img = meta.get("image", "")
    if meta.get("poll_question"):
        opts = [o.strip() for o in meta.get("poll_options", "").split("|") if o.strip()]
        params = {"chat_id": chat, "question": meta["poll_question"], "options": opts,
                  "is_anonymous": True,
                  "allows_multiple_answers": meta.get("poll_multiple", "false") == "true"}
        method = "sendPoll"
    elif img:
        p = (POSTS.parent / img).resolve()
        # картинку шлём как multipart — но tg.call только JSON; используем InputFile через URL нельзя,
        # поэтому для фото читаем файл и шлём base64 нельзя тоже. Делаем отдельный multipart-запрос.
        return publish_photo(token, chat, str(p), body, dry)
    else:
        params = {"chat_id": chat, "text": body, "parse_mode": "HTML",
                  "disable_web_page_preview": True}
        method = "sendMessage"
    if dry:
        print(f"[dry-run] {method} → {chat}")
        print(json.dumps(params, ensure_ascii=False, indent=2)[:800])
        return None
    r = call(token, method, params)
    if not r.get("ok"):
        print(f"::error::{method}: {r.get('description')}")
        return None
    return r["result"]["message_id"]


def publish_photo(token, chat, img_path, caption, dry):
    """sendPhoto multipart/form-data, без внешних зависимостей."""
    if dry:
        print(f"[dry-run] sendPhoto → {chat} ({img_path}), подпись {visible_len(caption)} симв.")
        return None
    import mimetypes
    import urllib.request
    boundary = "----dvorami" + os.urandom(8).hex()
    data = pathlib.Path(img_path).read_bytes()
    fields = {"chat_id": chat, "caption": caption, "parse_mode": "HTML"}
    body = b""
    for k, v in fields.items():
        body += (f"--{boundary}\r\nContent-Disposition: form-data; name=\"{k}\"\r\n\r\n"
                 f"{v}\r\n").encode("utf-8")
    ctype = mimetypes.guess_type(img_path)[0] or "image/png"
    body += (f"--{boundary}\r\nContent-Disposition: form-data; name=\"photo\"; "
             f"filename=\"{pathlib.Path(img_path).name}\"\r\n"
             f"Content-Type: {ctype}\r\n\r\n").encode("utf-8")
    body += data + f"\r\n--{boundary}--\r\n".encode("utf-8")
    req = urllib.request.Request(
        f"https://api.telegram.org/bot{token}/sendPhoto", data=body,
        headers={"Content-Type": f"multipart/form-data; boundary={boundary}"})
    try:
        import urllib.error
        with urllib.request.urlopen(req, timeout=60) as resp:
            r = json.loads(resp.read().decode("utf-8"))
    except Exception as e:
        print(f"::error::sendPhoto: {e}")
        return None
    if not r.get("ok"):
        print(f"::error::sendPhoto: {r.get('description')}")
        return None
    return r["result"]["message_id"]


# ---------------------------------------------------------------- main
def main(argv):
    check = "--check" in argv
    dry = "--dry-run" in argv
    terms = spoiler_terms()

    if check:
        bad = False
        for path in sorted(glob.glob(str(POSTS / "*.md"))):
            meta, _ = parse(path)
            if meta.get("status") == "published":
                continue
            errs, warns = check_post(path, terms)
            tag = pathlib.Path(path).name
            for w in warns:
                print(f"  ⚠ {tag}: {w}")
            for e in errs:
                print(f"  ✗ {tag}: {e}")
                bad = True
            if not errs:
                print(f"  ✓ {tag}")
        print("Проверка: есть ошибки." if bad else "Проверка пройдена.")
        return 1 if bad else 0

    now = datetime.now(MSK)
    chosen = pick(now)
    if not chosen:
        print("Нет одобренных постов с наступившим временем — выходим.")
        return 0
    _, _, path, meta, body = chosen

    errs, _ = check_post(path, terms)
    if errs:
        print(f"::error::{pathlib.Path(path).name} не прошёл проверку, не публикую:")
        for e in errs:
            print(f"  ✗ {e}")
        return 1

    token = os.environ.get("PLAYER_BOT_TOKEN", "").strip()
    chat = os.environ.get("CHANNEL_CHAT_ID", "@dvorami_quest").strip()
    if not token and not dry:
        print("::warning::PLAYER_BOT_TOKEN не задан — пропускаю (это нормально до настройки).")
        return 0

    print(f"Публикую {pathlib.Path(path).name} → {chat}")
    mid = publish(token, chat, meta, body, path, dry)
    if dry:
        return 0
    if mid is None:
        return 1
    meta["status"] = "published"
    meta["message_id"] = str(mid)
    dump(path, meta, body, FM_ORDER)
    print(f"Опубликовано, message_id={mid}, статус → published.")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))

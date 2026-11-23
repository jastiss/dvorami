"""Игровой бот «Дворами»: отзывы, предложения районов, вопросы команде.

Работает без сервера: GitHub Actions запускает скрипт по расписанию (feedback-bot.yml).
Скрипт забирает новые сообщения (getUpdates), ведёт диалоги по сохранённому состоянию
и POLL_MIN минут слушает дальше, чтобы начатый разговор шёл без задержек.

Сценарии (deep-link https://t.me/<бот>?start=...):
  review[-<квест>] — отзыв после игры: оценка → понравилось → непонятно → можно ли цитировать
  suggest          — предложить район: где → почему → контакт (по желанию)
  question         — вопрос команде → контакт (по желанию) → сразу владельцу
  report-<квест>-<точка>-<шаг>-<категория> — «Что-то не так?» из веб-плеера: категория (если не пришла
                     в ссылке — кнопками) → текст (игрок вставляет из буфера) → владельцу сразу.
                     Точка/шаг 0 — «не на точке». Текст с меткой [report квест/точка/шаг/категория],
                     пришедший без /start, тоже распознаётся как сообщение о проблеме.
  без параметра    — меню из трёх кнопок

Данные: feedback/ГГГГ-ММ.jsonl (репозиторий публичный — пишем минимум).
  * Telegram id не хранится: вместо него HMAC от id с ключом-токеном бота (обратно не восстановить).
  * Имя не хранится. Подпись к цитате — только если игрок сам её написал, разрешив цитату.
  * Контакт (suggest/question) в репозиторий не пишется — уходит только владельцу.

Переменные окружения:
  PLAYER_BOT_TOKEN   — токен игрового бота (нет — тихо выходим с кодом 0)
  TELEGRAM_BOT_TOKEN — бот команды: через него уведомления владельцу (если нет — через игрового)
  TELEGRAM_CHAT_ID   — чат владельца
  POLL_MIN           — сколько минут слушать после первого опроса (0 — один опрос и выход)
"""

import datetime
import hashlib
import hmac
import html
import json
import os
import pathlib
import re
import sys
import time
from zoneinfo import ZoneInfo

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import tg  # noqa: E402

ROOT = pathlib.Path(__file__).resolve().parent.parent
FEEDBACK_DIR = ROOT / "feedback"
STATE_FILE = ROOT / ".telegram" / "feedback-state.json"
OFFSET_FILE = ROOT / ".telegram" / "feedback-offset"
MSK = ZoneInfo("Europe/Moscow")

CHANNEL = "https://t.me/dvorami_quest"
# Квесты для игроков живут в этом боте (указание владельца 22.11: бот команды — только для команды)
QUESTS_URL = "https://jastiss.github.io/dvorami/moscow/"
SITE = "https://jastiss.github.io/dvorami/"
EXPIRE = 24 * 3600   # незаконченный диалог живёт сутки
LOW = 3              # оценка не выше этой — сразу владельцу
MAXLEN = 2000        # обрезаем слишком длинные ответы

FLOWS = ("review", "suggest", "question")   # пункты меню; report — только из плеера

# Категории «Что-то не так?» — те же ключи, что в site/play/player.js (ISSUE_CATS)
REPORT_CATS = {
    "fact": "Факт не тот",
    "riddle": "Загадка не решается",
    "place": "Место или объект не там",
    "hint": "Подсказка не помогла",
    "tech": "Техническая ошибка",
    "other": "Другое",
}
REPORT_TAG = re.compile(r"\[report ([a-z0-9]{1,32})/(\d{0,3})/(\d{0,3})/([a-z]{1,12})\]")
# Репозиторий публичный: из текста сообщения о проблеме убираем похожее на контакты
_PII = [(re.compile(r"[\w.+-]+@[\w-]+\.[\w.]+"), "[почта]"),
        (re.compile(r"(?<!\w)@[A-Za-z0-9_]{4,}"), "[ник]"),
        (re.compile(r"(?:\+7|\b8)[\s(-]*\d{3}[\s)-]*\d{3}[\s-]*\d{2}[\s-]*\d{2}\b"), "[телефон]")]

T = {
    "menu": "Здравствуйте! Это бот <b>Дворами</b> — квестов-прогулок по городу.\nЧем помочь?",
    "menu_quests": "🕊 Выбрать квест",
    "menu_review": "⭐ Оставить отзыв",
    "menu_suggest": "🗺 Предложить район",
    "menu_question": "✉️ Вопрос команде",
    "rating": "Спасибо, что прошли квест! Как вам, от 1 до 5?",
    "liked": "Что понравилось больше всего? Напишите пару слов.",
    "unclear": "А где было непонятно или вы застряли? Это помогает нам больше всего.",
    "quote": "Можно процитировать ваш отзыв на сайте?",
    "sign": "Как подписать цитату? Напишите имя (например, «Анна, Москва») или нажмите «Без имени».",
    "review_done": f"Спасибо! Отзыв у команды. Новые квесты и районы — в канале: {CHANNEL}",
    "where": "Какой район или место? Город, улица, что угодно, чтобы найти.",
    "why": "Чем оно интересно? Истории, дворы, архитектура — что зацепило.",
    "contact": "Оставите контакт, чтобы мы могли ответить? (@ник, телефон или почта) "
               "Он уйдёт только команде и нигде не публикуется.",
    "suggest_done": f"Спасибо! Передали команде. Если район возьмём в работу — расскажем в канале: {CHANNEL}",
    "question": "Напишите вопрос — он сразу уйдёт команде.",
    "question_done": "Спасибо, вопрос у команды. Ответим, если оставили контакт.",
    "message_done": "Спасибо, передали команде.",
    "skip": "Пропустить",
    "yes": "Да", "no": "Нет",
    "noname": "Без имени",
    "nocontact": "Не нужно",
    "report_cat": "Спасибо, что написали! Что случилось?",
    "report_text": "Спасибо, что написали! {where}\n\nВставьте текст из буфера (долгое нажатие → «Вставить») "
                   "или опишите своими словами, что не так. Фото пока не принимаем — опишите словами, что видите.",
    "report_nocomment": "Без комментария",
    "report_done": "Спасибо! Передали команде — поправим. Можно возвращаться к квесту: прогресс на месте.",
    "text_only": "Пока понимаю только текст.",
    "use_buttons": "Нажмите одну из кнопок выше 🙂",
    "cancelled": "Хорошо, отменил.",
}


def now():
    return time.time()


def stamp(t):
    return datetime.datetime.fromtimestamp(t, MSK).strftime("%Y-%m-%d %H:%M")


def esc(s):
    return html.escape(s or "", quote=False)


def redact(text):
    for rx, sub in _PII:
        text = rx.sub(sub, text)
    return text


def parse_report_start(arg):
    """report-zilart-3-2-fact → данные сообщения о проблеме (всё, кроме квеста, необязательно)."""
    parts = arg.lower().replace("_", "-").split("-")[1:]
    data = {}
    if parts and parts[0].isalnum():
        data["quest"] = parts[0][:32]
    for key, val in zip(("point", "step"), parts[1:3]):
        if val.isdigit() and int(val) > 0:
            data[key] = int(val)
    if len(parts) > 3 and parts[3] in REPORT_CATS:
        data["category"] = parts[3]
    return data


def parse_report_tag(text):
    """Метка из текста, который скопировал плеер: [report zilart/3/2/fact]. Возвращает (данные, текст без метки)."""
    m = REPORT_TAG.search(text)
    if not m:
        return None, text
    data = {"quest": m.group(1)}
    for key, val in (("point", m.group(2)), ("step", m.group(3))):
        if val and int(val) > 0:
            data[key] = int(val)
    if m.group(4) in REPORT_CATS:
        data["category"] = m.group(4)
    return data, (text[:m.start()] + text[m.end():]).strip()


class Bot:
    def __init__(self, token, owner_token="", owner_chat=""):
        self.token = token
        self.owner_token = owner_token or token
        self.owner_chat = owner_chat
        self.offset = self._read_offset()
        self.state = self._load_state()

    # ---------- хранение ----------

    def _read_offset(self):
        try:
            return int(OFFSET_FILE.read_text().strip())
        except (FileNotFoundError, ValueError):
            return 0

    def _load_state(self):
        try:
            data = json.loads(STATE_FILE.read_text(encoding="utf-8"))
            if isinstance(data.get("dialogs"), dict):
                return data
        except (FileNotFoundError, ValueError, AttributeError):
            pass
        return {"dialogs": {}, "seq": 0}

    def save(self):
        STATE_FILE.parent.mkdir(exist_ok=True)
        STATE_FILE.write_text(json.dumps(self.state, ensure_ascii=False, indent=1, sort_keys=True) + "\n",
                              encoding="utf-8")
        OFFSET_FILE.write_text(f"{self.offset}\n")

    def uid(self, user_id):
        """Псевдоним игрока: HMAC от id. Без токена бота не восстановить и не сопоставить."""
        return hmac.new(self.token.encode(), str(user_id).encode(), hashlib.sha256).hexdigest()[:16]

    def record(self, d, complete=True):
        rec = {"ts": stamp(now()), "kind": d["flow"], "user": d["user"], "complete": complete}
        rec.update({k: v for k, v in d["data"].items() if not k.startswith("_")})
        FEEDBACK_DIR.mkdir(exist_ok=True)
        path = FEEDBACK_DIR / (datetime.datetime.fromtimestamp(now(), MSK).strftime("%Y-%m") + ".jsonl")
        with path.open("a", encoding="utf-8") as f:
            # Репозиторий публичный: свободный текст вопросов и сообщений вне меню
            # уходит только владельцу, в файл пишется лишь факт обращения.
            if rec["kind"] in ("question", "message"):
                stored = {k: rec[k] for k in ("ts", "kind", "user", "complete", "contact_given") if k in rec}
            elif rec["kind"] == "report":
                stored = dict(rec, text=redact(rec.get("text", "")))
            else:
                stored = rec
            f.write(json.dumps(stored, ensure_ascii=False) + "\n")
        return rec

    # ---------- Telegram ----------

    def send(self, chat, text, buttons=None):
        params = {"chat_id": chat, "text": text, "parse_mode": "HTML", "disable_web_page_preview": True}
        if buttons:
            params["reply_markup"] = {"inline_keyboard": buttons}
        r = tg.call(self.token, "sendMessage", params)
        if not r.get("ok"):
            print(f"::warning::sendMessage: {r.get('description')}")
        return r

    def notify_owner(self, text):
        if not self.owner_chat:
            return
        if not tg.send(self.owner_token, self.owner_chat, text):
            print("::warning::не удалось уведомить владельца")

    @staticmethod
    def btn(label, action, value, sid):
        return {"text": label, "callback_data": f"{action}|{value}|{sid}"}

    # ---------- диалоги ----------

    def menu(self, chat):
        b = [[{"text": T["menu_quests"], "url": QUESTS_URL}]]
        b += [[self.btn(T[f"menu_{f}"], "m", f, 0)] for f in FLOWS]
        self.send(chat, T["menu"], b)

    def begin(self, chat, user, flow, quest=None, data=None):
        self.state["seq"] = self.state.get("seq", 0) + 1
        d = {"flow": flow, "user": user, "sid": self.state["seq"], "ts": now(), "data": dict(data or {})}
        if quest:
            d["data"]["quest"] = quest
        self.state["dialogs"][user] = d
        if flow == "report":
            return self.ask(chat, d, "report_text" if d["data"].get("category") else "report_cat")
        self.ask(chat, d, {"review": "rating", "suggest": "where", "question": "question"}[flow])

    @staticmethod
    def report_where(data):
        bits = []
        if data.get("quest"):
            bits.append(f"квест «{esc(data['quest'])}»")
        if data.get("point"):
            bits.append(f"точка {data['point']}" + (f", шаг {data['step']}" if data.get("step") else ""))
        if data.get("category"):
            bits.append(REPORT_CATS[data["category"]].lower())
        return ("Записали: " + " · ".join(bits) + ".") if bits else ""

    def ask(self, chat, d, step):
        d["step"] = step
        sid = d["sid"]
        b = None
        if step == "rating":
            b = [[self.btn(str(i), "r", i, sid) for i in range(1, 6)]]
        elif step in ("liked", "unclear", "why"):
            b = [[self.btn(T["skip"], "skip", step, sid)]]
        elif step == "quote":
            b = [[self.btn(T["yes"], "q", 1, sid), self.btn(T["no"], "q", 0, sid)]]
        elif step == "sign":
            b = [[self.btn(T["noname"], "skip", step, sid)]]
        elif step == "contact":
            b = [[self.btn(T["nocontact"], "skip", step, sid)]]
        elif step == "report_cat":
            b = [[self.btn(label, "c", key, sid)] for key, label in REPORT_CATS.items()]
        elif step == "report_text":
            b = [[self.btn(T["report_nocomment"], "skip", step, sid)]]
            return self.send(chat, T[step].format(where=self.report_where(d["data"])).strip(), b)
        self.send(chat, T[step], b)

    def advance(self, chat, d, value):
        """Записать ответ на текущий шаг и перейти к следующему."""
        step, data = d["step"], d["data"]
        d["ts"] = now()
        if step == "rating":
            data["rating"] = value
            return self.ask(chat, d, "liked")
        if step == "liked":
            data["liked"] = value
            return self.ask(chat, d, "unclear")
        if step == "unclear":
            data["unclear"] = value
            return self.ask(chat, d, "quote")
        if step == "quote":
            data["quote"] = bool(value)
            return self.ask(chat, d, "sign") if value else self.finish(chat, d)
        if step == "sign":
            if value:
                data["signature"] = value
            return self.finish(chat, d)
        if step == "where":
            data["where"] = value
            return self.ask(chat, d, "why")
        if step == "why":
            data["why"] = value
            return self.ask(chat, d, "contact")
        if step == "question":
            data["text"] = value
            return self.ask(chat, d, "contact")
        if step == "report_cat":
            data["category"] = value
            return self.ask(chat, d, "report_text")
        if step == "report_text":
            tag, value = parse_report_tag(value)
            for k, v in (tag or {}).items():
                data.setdefault(k, v)
            data["text"] = value
            return self.finish(chat, d)
        if step == "contact":
            data["contact_given"] = bool(value)
            if value:
                data["_contact"] = value  # только в уведомление владельцу, в файл не пишется
            return self.finish(chat, d)

    def finish(self, chat, d, complete=True):
        self.state["dialogs"].pop(d["user"], None)
        rec = self.record(d, complete)
        contact = d["data"].get("_contact")
        flow = d["flow"]
        if flow == "review":
            if rec.get("rating") is not None and rec["rating"] <= LOW:
                self.notify_owner(self.owner_text(rec))
            if chat is not None:
                self.send(chat, T["review_done"])
        elif flow == "report":
            self.notify_owner(self.owner_text(rec))
            if chat is not None:
                self.send(chat, T["report_done"])
        else:
            self.notify_owner(self.owner_text(rec, contact))
            if chat is not None:
                self.send(chat, T[f"{flow}_done"])

    @staticmethod
    def owner_text(rec, contact=None):
        k = rec["kind"]
        cat = REPORT_CATS.get(rec.get("category"), "без категории")
        title = {"review": f"⚠️ Низкая оценка: {rec.get('rating')}/5", "suggest": "🗺 Предложили район",
                 "question": "✉️ Вопрос от игрока", "message": "💬 Сообщение в игровой бот",
                 "report": f"🚩 Что-то не так: {cat}"}[k]
        lines = [f"<b>{title}</b>" + ("" if rec.get("complete", True) else " (не дописан)")]
        labels = [("quest", "Квест"), ("point", "Точка"), ("step", "Шаг"), ("liked", "Понравилось"), ("unclear", "Непонятно"),
                  ("where", "Где"), ("why", "Почему"), ("text", "Текст")]
        for key, label in labels:
            if rec.get(key):
                lines.append(f"<b>{label}:</b> {esc(str(rec[key]))}")
        if k == "review":
            lines.append(f"<b>Цитировать:</b> {'да' if rec.get('quote') else 'нет'}")
        if contact:
            lines.append(f"<b>Контакт:</b> {esc(contact)}")
        lines.append(f"<i>игрок {rec['user'][:6]} · {rec['ts']}</i>")
        return "\n".join(lines)

    # ---------- обработка ----------

    def handle_message(self, msg):
        chat = (msg.get("chat") or {}).get("id")
        if (msg.get("chat") or {}).get("type") != "private" or chat is None:
            return  # в группах и каналах бот молчит
        user = self.uid((msg.get("from") or {}).get("id", chat))
        text = (msg.get("text") or msg.get("caption") or "").strip()[:MAXLEN]
        d = self.state["dialogs"].get(user)
        if not text:
            self.send(chat, T["text_only"])
            return
        if text.startswith("/"):
            parts = text.split(maxsplit=1)
            cmd = parts[0].split("@")[0].lower()
            arg = parts[1].strip() if len(parts) > 1 else ""
            if cmd == "/start":
                flow, _, quest = arg.replace("_", "-").partition("-")
                flow = flow.lower()
                if flow == "report":
                    self.begin(chat, user, "report", data=parse_report_start(arg))
                elif flow in FLOWS:
                    quest = "".join(c for c in quest.lower() if c.isalnum())[:32] or None
                    self.begin(chat, user, flow, quest)
                else:
                    self.state["dialogs"].pop(user, None)
                    self.menu(chat)
                return
            if cmd == "/cancel":
                if d:
                    self.state["dialogs"].pop(user, None)
                    self.send(chat, T["cancelled"])
                self.menu(chat)
                return
            if cmd in ("/help", "/menu"):
                self.menu(chat)
                return
        if d is None or d["flow"] != "report":
            # Текст из плеера с меткой [report …] пришёл без /start (например, ссылка открыла канал,
            # а игрок потом написал боту) — это сообщение о проблеме, а не вопрос команде.
            tag, rest = parse_report_tag(text)
            if tag:
                rd = {"flow": "report", "user": user, "sid": 0, "ts": now(), "data": dict(tag, text=rest)}
                self.finish(chat, rd)
                if d is not None:
                    self.state["dialogs"][user] = d  # начатый отзыв не теряем
                return
        if d is None:
            # текст вне диалога не теряем: это вопрос/сообщение команде
            d = {"flow": "message", "user": user, "sid": 0, "ts": now(), "data": {"text": text}}
            rec = self.record(d)
            self.notify_owner(self.owner_text(rec))
            self.send(chat, T["message_done"])
            self.menu(chat)
            return
        if d["step"] in ("rating", "quote", "report_cat"):
            self.send(chat, T["use_buttons"])
            return
        self.advance(chat, d, text)

    def handle_callback(self, cq):
        tg.call(self.token, "answerCallbackQuery", {"callback_query_id": cq.get("id")})
        msg = cq.get("message") or {}
        chat = (msg.get("chat") or {}).get("id")
        if chat is None:
            return
        try:
            action, value, sid = cq.get("data", "").split("|")
            sid = int(sid)
        except ValueError:
            return
        user = self.uid((cq.get("from") or {}).get("id", chat))
        d = self.state["dialogs"].get(user)
        if action == "m" and value in FLOWS:
            self._unbutton(chat, msg)
            self.begin(chat, user, value)
            return
        if not d or d["sid"] != sid:
            return  # кнопка из старого диалога
        step = d["step"]
        ok = ((action == "r" and step == "rating" and value in "12345")
              or (action == "c" and step == "report_cat" and value in REPORT_CATS)
              or (action == "q" and step == "quote" and value in ("0", "1"))
              or (action == "skip" and value == step))
        if not ok:
            return
        self._unbutton(chat, msg)
        if action == "r":
            self.advance(chat, d, int(value))
        elif action == "q":
            self.advance(chat, d, value == "1")
        elif action == "c":
            self.advance(chat, d, value)
        else:
            self.advance(chat, d, "")

    def _unbutton(self, chat, msg):
        if msg.get("message_id"):
            tg.call(self.token, "editMessageReplyMarkup",
                    {"chat_id": chat, "message_id": msg["message_id"], "reply_markup": {"inline_keyboard": []}})

    def sweep(self):
        """Брошенные диалоги: отзыв с оценкой сохраняем как неполный, остальное забываем."""
        for user, d in list(self.state["dialogs"].items()):
            if now() - d.get("ts", 0) <= EXPIRE:
                continue
            data = d["data"]
            if ((d["flow"] == "review" and "rating" in data) or d["flow"] == "report"
                    or data.get("where") or data.get("text")):
                self.finish(None, d, complete=False)
            else:
                self.state["dialogs"].pop(user, None)

    def handle(self, u):
        try:
            if "callback_query" in u:
                self.handle_callback(u["callback_query"])
            elif "message" in u:
                self.handle_message(u["message"])
        except Exception as e:  # одно кривое сообщение не должно ронять бота
            print(f"::warning::update {u.get('update_id')}: {type(e).__name__}: {e}")

    def run(self, poll_seconds=0):
        deadline = now() + poll_seconds
        while True:
            left = deadline - now()
            timeout = int(max(0, min(50, left)))
            r = tg.call(self.token, "getUpdates", {"offset": self.offset, "timeout": timeout,
                                                   "allowed_updates": ["message", "callback_query"]})
            if not r.get("ok"):
                print(f"::warning::getUpdates: {r.get('description')}")
                break
            for u in r.get("result", []):
                self.offset = max(self.offset, u["update_id"] + 1)
                self.handle(u)
            self.save()
            if now() >= deadline:
                break
        self.sweep()
        self.save()


def main():
    token = os.environ.get("PLAYER_BOT_TOKEN", "").strip()
    if not token:
        print("PLAYER_BOT_TOKEN не задан — игровой бот ещё не подключён, выхожу.")
        return 0
    bot = Bot(token, os.environ.get("TELEGRAM_BOT_TOKEN", "").strip(),
              os.environ.get("TELEGRAM_CHAT_ID", "").strip())
    try:
        minutes = float(os.environ.get("POLL_MIN") or 0)
    except ValueError:
        minutes = 0
    bot.run(max(0, min(minutes, 30)) * 60)
    return 0


if __name__ == "__main__":
    sys.exit(main())

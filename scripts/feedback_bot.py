"""Игровой бот «Дворами» (@dvorami_bot): меню, дела, отзывы после финала, предложения, вопросы команде.

Работает без сервера: GitHub Actions держит длинный опрос getUpdates в одном задании ~5 ч 40 мин
(feedback-bot.yml), затем выходит; следующее задание уже стоит в очереди (cron раз в час + concurrency),
поэтому ответ приходит за секунды, а на пересменке — до ~1 мин.

Глубокие ссылки https://t.me/dvorami_bot?start=...:
  done_<дело>       — финал в плеере: «дело закрыто» → оценка → понравилось → непонятно → цитата.
                      Только здесь бот говорит «поздравляем»; запись помечается confirmed: true.
                      Оценку принимаем кнопкой (в т. ч. с более раннего сообщения: дело и финал зашиты
                      в кнопку) и цифрой текстом. Оценки с финала идут в рейтинг дела (scripts/build_ratings.py).
  review[-<дело>]   — отзыв без подтверждения финала: нейтральный текст, confirmed: false,
                      кнопка «Ещё не проходил(а)» уводит в сообщение команде.
  suggest           — предложить квест: где → почему → контакт (по желанию)
  question          — вопрос команде → контакт (по желанию) → сразу владельцу
  remind_<дело>     — напомнить перед прогулкой: когда → в назначенное время памятка (сервисное сообщение
                      по просьбе игрока; включится на сайте после продаж)
  report-<дело>-<точка>-<шаг>-<категория> — «Что-то не так?» из веб-плеера (см. docs/feedback-bot.md)
  cases | how | help — сразу нужный экран меню
  без параметра     — приветствие и меню
/test — только владельцу (TELEGRAM_CHAT_ID): меню, из которого проходится каждый флоу; его ответы
        не пишутся в feedback/, уведомления приходят с пометкой «ТЕСТ».

Данные: feedback/ГГГГ-ММ.jsonl (репозиторий публичный — пишем минимум).
  * Telegram id не хранится: вместо него HMAC от id с ключом-токеном бота (обратно не восстановить).
  * Для напоминаний chat id хранится зашифрованным тем же токеном и удаляется после отправки.
  * Контакт (suggest/question) в репозиторий не пишется — уходит только владельцу.

Переменные окружения:
  PLAYER_BOT_TOKEN   — токен игрового бота (нет — тихо выходим с кодом 0)
  TELEGRAM_BOT_TOKEN — бот команды: через него уведомления владельцу (если нет — через игрового)
  TELEGRAM_CHAT_ID   — чат владельца (личный: он же его Telegram id — по нему открывается /test)
  POLL_MIN           — сколько минут держать опрос (0 — один опрос и выход; не больше 350)
  COMMIT_MIN         — раз в сколько минут сохранять состояние в репозиторий, если оно менялось (0 — только при выходе)
"""

import base64
import datetime
import hashlib
import hmac
import html
import json
import os
import pathlib
import re
import signal
import subprocess
import sys
import time
from zoneinfo import ZoneInfo

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import tg  # noqa: E402

ROOT = pathlib.Path(__file__).resolve().parent.parent
FEEDBACK_DIR = ROOT / "feedback"
STATE_FILE = ROOT / ".telegram" / "feedback-state.json"
OFFSET_FILE = ROOT / ".telegram" / "feedback-offset"
COMMIT_SCRIPT = ROOT / "scripts" / "feedback_bot_commit.sh"
MSK = ZoneInfo("Europe/Moscow")

# Единственный базовый адрес для игроков — боевой домен. Тестовый стенд игрокам не показываем.
SITE = "https://dvorami.ru/"
CITY_URL = SITE + "moscow/"
CHANNEL = "https://t.me/dvorami_quest"
EXPIRE = 24 * 3600   # незаконченный диалог живёт сутки
LOW = 3              # оценка не выше этой — сразу владельцу
MAXLEN = 2000        # обрезаем слишком длинные ответы

# Дела: id = папка quests/<id>, slug = страница site/moscow/<slug>/ (тест сверяет, что страница есть).
# Обновлять вместе с витриной site/moscow/index.html. status: soon — скоро в продаже, dev — в разработке.
CASES = [
    {"id": "zilart", "slug": "zilart-sinyaya-ptica", "title": "Дело о Синей птице", "place": "ЗИЛАРТ",
     "status": "soon", "start": "у метро «ЗИЛ»"},
    {"id": "chistye-prudy", "slug": "chistye-prudy-bashnya", "title": "Дело о башне выше Ивана Великого",
     "place": "Чистые пруды и Покровка", "status": "dev"},
    {"id": "kolomenskoe", "slug": "kolomenskoe-tuman", "title": "Дело о тумане в овраге",
     "place": "Коломенское", "status": "dev"},
    {"id": "krasnaya-ploshchad", "slug": "krasnaya-ploshchad-imena", "title": "Дело о стёртых именах",
     "place": "Красная площадь", "status": "dev"},
    {"id": "kitay-gorod", "slug": "kitay-gorod-list", "title": "Дело о фальшивом листе",
     "place": "Китай-город", "status": "dev"},
    {"id": "arbat", "slug": "arbat-gogol", "title": "Дело о загадках Турандот", "place": "Арбат", "status": "dev"},
    {"id": "vdnh", "slug": "vdnh-sestra", "title": "Дело о шестнадцатой сестре", "place": "ВДНХ", "status": "dev"},
]
STATUS_LABEL = {"soon": "скоро в продаже", "dev": "в разработке"}

COMMANDS = [("start", "Меню"), ("cases", "Выбрать дело"), ("help", "Помощь"), ("cancel", "Прервать разговор")]
OWNER_COMMANDS = COMMANDS + [("test", "Тест всех сценариев (только для владельца)")]

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

# Когда напомнить: ключ → подпись кнопки. «1m» — только в /test.
REMIND_OPTS = [("2h", "Через 2 часа"), ("tom", "Завтра в 10:00"), ("sat", "В субботу в 10:00")]

T = {
    "menu": "Здравствуйте! Это бот <b>Дворами</b> — детективных квестов-прогулок по городу без гида.\n\n"
            "Здесь можно выбрать дело, узнать, как всё устроено, оставить отзыв или предложить место для "
            "нового квеста. Что интересно?",
    "menu_cases": "🕵️ Выбрать дело",
    "menu_how": "❓ Как это работает",
    "menu_review": "⭐ Оставить отзыв",
    "menu_suggest": "🗺 Предложить квест",
    "menu_help": "🆘 Помощь",
    "menu_question": "✉️ Вопрос команде",
    "back": "← Меню",
    "cases": "<b>Дела в Москве</b>\n{lines}\n\nНажмите на дело — откроется его страница: маршрут, время, "
             "с чего начать. Новости о продаже — в канале {channel}",
    "all_cases": "🗺 Все дела на карте",
    "how": "<b>Как это работает</b>\n\n"
           "1. Выбираете дело — одно на компанию, гид не нужен.\n"
           "2. Открываете его в телефоне. Лучше дома по Wi‑Fi: дело сохранится и пойдёт даже при слабой связи.\n"
           "3. Идёте по точкам и разгадываете загадки по тому, что видно вокруг: дома, таблички, детали.\n"
           "4. Застряли — три подсказки, последняя показывает ответ. Проиграть нельзя.\n"
           "5. В финале — разгадка дела. Темп свой, начать можно в любой день.",
    "help": "<b>Помощь</b>\n\n"
            "• Застряли на загадке — в деле есть подсказки, последняя показывает ответ.\n"
            "• Что-то не так с точкой или текстом — кнопка «Что-то не так?» прямо на экране точки: "
            "мы сразу увидим, где именно.\n"
            "• Любой другой вопрос — кнопкой ниже, он сразу уйдёт команде.\n\n"
            "Команды: /start — меню, /cases — дела, /cancel — прервать разговор.",
    "rating_done": "Дело закрыто — поздравляем! 🕊\nКак вам {what}, от 1 до 5?",
    "rating": "Поделитесь впечатлением: как вам {what}, от 1 до 5?",
    "not_played": "Ещё не проходил(а)",
    "not_played_text": "Тогда напишите, что думаете или что хотели бы узнать, — передадим команде.",
    "liked": "Что понравилось больше всего? Напишите пару слов.",
    "unclear": "А где было непонятно или вы застряли? Это помогает нам больше всего.",
    "quote": "Можно процитировать ваш отзыв на сайте?",
    "sign": "Как подписать цитату? Напишите имя (например, «Анна, Москва») или нажмите «Без имени».",
    "review_done": "Спасибо! Отзыв у команды.{rating} Новые дела — в канале: " + CHANNEL,
    "rating_now": " Рейтинг дела сейчас: ★ {value}.",
    "rating_new": " У дела пока мало оценок — ваша среди первых.",
    "where": "Какое место или район стоит сделать квестом? Город, улица — что угодно, чтобы найти.",
    "why": "Чем оно интересно? Истории, дворы, архитектура — что зацепило.",
    "contact": "Оставите контакт, чтобы мы могли ответить? (@ник, телефон или почта) "
               "Он уйдёт только команде и нигде не публикуется.",
    "suggest_done": f"Спасибо! Передали команде. Если возьмём место в работу — расскажем в канале: {CHANNEL}",
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
    "report_done": "Спасибо! Передали команде — поправим. Можно возвращаться к делу: прогресс на месте.",
    "remind_when": "Когда напомнить про {what}? Время московское.",
    "remind_no": "Не нужно",
    "remind_set": "Хорошо, напомню {when}. Передумали — /cancel.",
    "remind_off": "Хорошо, не напоминаю.",
    "reminder": "Напоминаем про {what}.{start}\n\nЧто пригодится: заряженный телефон, 2,5–3 часа, вода по желанию. "
                "Прогулка уличная — оденьтесь по погоде.\nСовет: откройте дело дома по Wi‑Fi — оно сохранится "
                "в телефоне. Хорошей прогулки!",
    "open_case": "Открыть дело",
    "text_only": "Пока понимаю только текст.",
    "use_buttons": "Нажмите одну из кнопок выше 🙂",
    "stale": "Эта кнопка из прошлого разговора",
    "cancelled": "Хорошо, отменил.",
    "test": "🧪 <b>Тест бота</b> (видите только вы)\n\nКаждая кнопка запускает сценарий так, как его увидит игрок. "
            "Ваши ответы не пишутся в отзывы, уведомления приходят с пометкой «ТЕСТ». Оплата не нужна.",
    "test_code": "🧪 Пример: так придёт код после оплаты (код не настоящий)\n\n"
                 "Ваш код к делу «{title}»: <b>ZIL-TEST-0000</b>\nСтарт — {start}. Заложите 2,5–3 часа и возьмите "
                 "заряженный телефон. Начать можно в любой день в течение года. Потеряли код — напишите сюда.",
}

TEST_ITEMS = [
    ("start", "1. /start — как видит новый игрок"),
    ("cases", "2. Выбрать дело"),
    ("done", "3. Финал дела → оценка (done_zilart)"),
    ("review", "4. Отзыв из меню, без финала"),
    ("suggest", "5. Предложить квест"),
    ("question", "6. Вопрос команде"),
    ("report", "7. «Что-то не так?» из плеера"),
    ("remind", "8. Напоминание перед прогулкой"),
    ("code", "9. Код после оплаты (пример)"),
    ("free", "10. Сообщение мимо меню — как работает"),
]


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


def alnum(s):
    return "".join(c for c in (s or "").lower() if c.isalnum())[:32]


def find_case(quest):
    key = alnum(quest)
    return next((c for c in CASES if alnum(c["id"]) == key or alnum(c["slug"]) == key), None) if key else None


def case_url(case):
    return SITE + "moscow/" + case["slug"] + "/"


def case_name(quest):
    c = find_case(quest)
    return f"«{c['title']}»" if c else ("дело" if quest else "наше дело")


_WORDS = {"один": 1, "единица": 1, "кол": 1, "два": 2, "двойка": 2, "три": 3, "тройка": 3, "четыре": 4,
          "четверка": 4, "пять": 5, "пятерка": 5}


def parse_rating(text):
    """Оценка, написанная текстом: «5», «5/5», «4 из 5», «⭐⭐⭐⭐», «пять», «пятёрка». Иначе None."""
    t = (text or "").strip().lower().replace("ё", "е").rstrip(".!) ")
    m = re.fullmatch(r"([1-5])(?:\s*(?:/|из)\s*5)?", t)
    if m:
        return int(m.group(1))
    stars = re.sub(r"[\s\ufe0f]", "", t)
    if stars and set(stars) <= {"⭐", "★"} and len(stars) <= 5:
        return len(stars)
    return _WORDS.get(t)


def rating_button(n, quest, confirmed):
    """Значение кнопки оценки: «5.zilart.1» — оценка, дело, финал подтверждён. Дело и подтверждение зашиты
    в кнопку, чтобы оценка с раннего сообщения (второй переход по ссылке, бот был недоступен, диалог истёк)
    не терялась."""
    return f"{n}.{alnum(quest) if quest else ''}.{1 if confirmed else 0}"


def parse_rating_button(value):
    """«5» (старые кнопки) или «5.zilart.1» → (оценка, дело или None, подтверждено ли) или None."""
    n, _, rest = str(value).partition(".")
    if n not in ("1", "2", "3", "4", "5"):
        return None
    quest, _, conf = rest.partition(".")
    case = find_case(quest)
    return int(n), (case["id"] if case else None), conf == "1"


def rating_text(quest, feedback_dir=None):
    """Текущий рейтинг дела из того же источника, что на сайте (build_ratings): «4,86 · 37 оценок» или None."""
    import build_ratings  # здесь, а не наверху: build_ratings сам импортирует этот модуль
    try:
        got = build_ratings.summary(quest, build_ratings.build(feedback_dir or FEEDBACK_DIR))
    except (OSError, ValueError, KeyError):
        return None
    return build_ratings.fmt(*got) if got else None


def remind_at(key, t):
    """Момент напоминания (unix time) по ключу кнопки; время — московское."""
    d = datetime.datetime.fromtimestamp(t, MSK)
    if key == "1m":
        return t + 60
    if key == "2h":
        return t + 2 * 3600
    if key == "tom":
        x = (d + datetime.timedelta(days=1)).replace(hour=10, minute=0, second=0, microsecond=0)
        return x.timestamp()
    if key == "sat":
        days = (5 - d.weekday()) % 7
        x = (d + datetime.timedelta(days=days)).replace(hour=10, minute=0, second=0, microsecond=0)
        if x.timestamp() <= t:
            x += datetime.timedelta(days=7)
        return x.timestamp()
    return None


def human_time(ts, t):
    d, today = datetime.datetime.fromtimestamp(ts, MSK), datetime.datetime.fromtimestamp(t, MSK).date()
    hm = d.strftime("%H:%M")
    if d.date() == today:
        return f"сегодня в {hm}"
    if d.date() == today + datetime.timedelta(days=1):
        return f"завтра в {hm}"
    return d.strftime("%d.%m в ") + hm


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
        self.owner_chat = str(owner_chat or "").strip()
        self.owner_uid = self.uid(self.owner_chat) if self.owner_chat else None
        self.offset = self._read_offset()
        self.state = self._load_state()
        self.dirty = False          # менялось ли что-то с последнего коммита состояния
        self._toast = None          # текст ответа на нажатие кнопки (answerCallbackQuery)

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
                data.setdefault("reminders", [])
                return data
        except (FileNotFoundError, ValueError, AttributeError):
            pass
        return {"dialogs": {}, "seq": 0, "reminders": []}

    def save(self):
        STATE_FILE.parent.mkdir(exist_ok=True)
        STATE_FILE.write_text(json.dumps(self.state, ensure_ascii=False, indent=1, sort_keys=True) + "\n",
                              encoding="utf-8")
        OFFSET_FILE.write_text(f"{self.offset}\n")

    def uid(self, user_id):
        """Псевдоним игрока: HMAC от id. Без токена бота не восстановить и не сопоставить."""
        return hmac.new(self.token.encode(), str(user_id).encode(), hashlib.sha256).hexdigest()[:16]

    def _stream(self, nonce, n):
        out = b""
        i = 0
        while len(out) < n:
            out += hmac.new(self.token.encode(), b"chat|" + nonce + bytes([i]), hashlib.sha256).digest()
            i += 1
        return out[:n]

    def seal(self, chat):
        """chat id для напоминания: шифруем токеном бота (репозиторий публичный)."""
        nonce = os.urandom(8)
        raw = str(chat).encode()
        ct = bytes(a ^ b for a, b in zip(raw, self._stream(nonce, len(raw))))
        tag = hmac.new(self.token.encode(), nonce + ct, hashlib.sha256).digest()[:8]
        return base64.urlsafe_b64encode(nonce + ct + tag).decode()

    def unseal(self, s):
        try:
            b = base64.urlsafe_b64decode(s.encode())
            nonce, ct, tag = b[:8], b[8:-8], b[-8:]
            if not hmac.compare_digest(tag, hmac.new(self.token.encode(), nonce + ct, hashlib.sha256).digest()[:8]):
                return None
            return int(bytes(a ^ b for a, b in zip(ct, self._stream(nonce, len(ct)))).decode())
        except (ValueError, TypeError):
            return None

    def is_test(self, user):
        return self.owner_uid is not None and user == self.owner_uid

    def record(self, d, complete=True):
        rec = {"ts": stamp(now()), "kind": d["flow"], "user": d["user"], "complete": complete}
        rec.update({k: v for k, v in d["data"].items() if not k.startswith("_")})
        if self.is_test(d["user"]):
            return rec   # ответы владельца — тест, в отзывы не пишем
        self.dirty = True
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

    def notify_owner(self, text, test=False):
        if not self.owner_chat:
            return
        if test:
            text = "🧪 <b>ТЕСТ</b> · " + text
        if not tg.send(self.owner_token, self.owner_chat, text):
            print("::warning::не удалось уведомить владельца")

    def setup(self):
        """Команды в меню Telegram: для всех и расширенные (с /test) — в чате владельца."""
        cmds = [{"command": c, "description": d} for c, d in COMMANDS]
        r = tg.call(self.token, "setMyCommands", {"commands": cmds})
        if not r.get("ok"):
            print(f"::warning::setMyCommands: {r.get('description')}")
        if self.owner_chat:
            own = [{"command": c, "description": d} for c, d in OWNER_COMMANDS]
            r = tg.call(self.token, "setMyCommands", {"commands": own, "scope": {"type": "chat", "chat_id": self.owner_chat}})
            if not r.get("ok"):  # владелец ещё не открывал бота — /test всё равно работает, просто без подсказки
                print(f"::warning::setMyCommands (владелец): {r.get('description')}")

    @staticmethod
    def btn(label, action, value, sid):
        return {"text": label, "callback_data": f"{action}|{value}|{sid}"}

    # ---------- экраны ----------

    def menu(self, chat):
        b = [[self.btn(T[f"menu_{k}"], "m", k, 0)] for k in ("cases", "how", "review", "suggest", "help")]
        self.send(chat, T["menu"], b)

    def cases(self, chat):
        def line(c):
            r = rating_text(c["id"])
            return f"• «{c['title']}» — {c['place']}, {STATUS_LABEL[c['status']]}" + (f" · ★ {r}" if r else "")
        lines = "\n".join(line(c) for c in CASES)
        b = [[{"text": f"{c['place']}: {c['title']}", "url": case_url(c)}] for c in CASES]
        b += [[{"text": T["all_cases"], "url": CITY_URL}], [self.btn(T["back"], "m", "menu", 0)]]
        self.send(chat, T["cases"].format(lines=lines, channel=CHANNEL), b)

    def screen(self, chat, user, key):
        """Пункт меню: экран или начало диалога. False — такого пункта нет."""
        if key == "menu":
            self.menu(chat)
        elif key == "cases":
            self.cases(chat)
        elif key == "how":
            self.send(chat, T["how"], [[self.btn(T["menu_cases"], "m", "cases", 0)], [self.btn(T["back"], "m", "menu", 0)]])
        elif key == "help":
            self.send(chat, T["help"], [[self.btn(T["menu_question"], "m", "question", 0)],
                                        [self.btn(T["back"], "m", "menu", 0)]])
        elif key in ("review", "suggest", "question"):
            self.begin(chat, user, key)
        else:
            return False
        return True

    def test_menu(self, chat):
        b = [[self.btn(label, "t", k, 0)] for k, label in TEST_ITEMS]
        self.send(chat, T["test"], b)

    def test_item(self, chat, user, key):
        if key == "start":
            self.state["dialogs"].pop(user, None)
            self.menu(chat)
        elif key == "done":
            self.begin(chat, user, "review", "zilart", {"confirmed": True})
        elif key == "report":
            self.begin(chat, user, "report", data={"quest": "zilart", "point": 3, "step": 2, "category": "fact"})
        elif key == "remind":
            self.begin(chat, user, "remind", "zilart")
        elif key == "code":
            c = CASES[0]
            self.send(chat, T["test_code"].format(title=c["title"], start=c["start"]),
                      [[{"text": T["open_case"], "url": case_url(c)}]])
        elif key == "free":
            self.send(chat, "🧪 Напишите боту любой текст вне разговора — он придёт вам как «Сообщение в игровой "
                            "бот», а игрок увидит «Спасибо, передали команде» и меню.")
        else:
            self.screen(chat, user, key)

    # ---------- диалоги ----------

    def begin(self, chat, user, flow, quest=None, data=None):
        self.state["seq"] = self.state.get("seq", 0) + 1
        d = {"flow": flow, "user": user, "sid": self.state["seq"], "ts": now(), "data": dict(data or {})}
        if quest:
            d["data"]["quest"] = quest
        if flow == "review":
            d["data"]["confirmed"] = bool(d["data"].get("confirmed"))
        self.state["dialogs"][user] = d
        if flow == "report":
            return self.ask(chat, d, "report_text" if d["data"].get("category") else "report_cat")
        self.ask(chat, d, {"review": "rating", "suggest": "where", "question": "question", "remind": "when"}[flow])

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
        text = T.get(step, "")
        if step == "rating":
            quest, conf = d["data"].get("quest"), d["data"].get("confirmed")
            b = [[self.btn(str(i), "r", rating_button(i, quest, conf), sid) for i in range(1, 6)]]
            what = case_name(quest)
            if d["data"].get("confirmed"):
                text = T["rating_done"].format(what=what)
            else:  # финал не подтверждён: без «поздравляем» и с выходом для тех, кто ещё не играл
                text = T["rating"].format(what=what)
                b.append([self.btn(T["not_played"], "np", 0, sid)])
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
            text = T[step].format(where=self.report_where(d["data"])).strip()
        elif step == "when":
            opts = list(REMIND_OPTS)
            if self.is_test(d["user"]):
                opts.insert(0, ("1m", "🧪 Через 1 минуту"))
            b = [[self.btn(label, "w", k, sid)] for k, label in opts] + [[self.btn(T["remind_no"], "w", "no", sid)]]
            text = T["remind_when"].format(what=case_name(d["data"].get("quest")))
        elif step == "not_played":
            text = T["not_played_text"]
        self.send(chat, text, b)

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
        if step in ("question", "not_played"):
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
        if step == "when":
            self.state["dialogs"].pop(d["user"], None)
            at = remind_at(value, now())
            if at is None:
                return self.send(chat, T["remind_off"])
            self.state["reminders"].append({"at": at, "c": self.seal(chat), "u": d["user"],
                                            "quest": data.get("quest")})
            return self.send(chat, T["remind_set"].format(when=human_time(at, now())))

    def finish(self, chat, d, complete=True):
        self.state["dialogs"].pop(d["user"], None)
        rec = self.record(d, complete)
        test = self.is_test(d["user"])
        contact = d["data"].get("_contact")
        flow = d["flow"]
        if flow == "review":
            if rec.get("rating") is not None and rec["rating"] <= LOW:
                self.notify_owner(self.owner_text(rec), test)
            if chat is not None:
                extra = ""
                if rec.get("quest") and rec.get("rating") is not None:
                    r = rating_text(rec["quest"])
                    extra = T["rating_now"].format(value=r) if r else T["rating_new"]
                self.send(chat, T["review_done"].format(rating=extra))
        elif flow == "report":
            self.notify_owner(self.owner_text(rec), test)
            if chat is not None:
                self.send(chat, T["report_done"])
        else:
            self.notify_owner(self.owner_text(rec, contact), test)
            if chat is not None:
                self.send(chat, T[f"{flow}_done"])

    @staticmethod
    def owner_text(rec, contact=None):
        k = rec["kind"]
        cat = REPORT_CATS.get(rec.get("category"), "без категории")
        title = {"review": f"⚠️ Низкая оценка: {rec.get('rating')}/5", "suggest": "🗺 Предложили квест",
                 "question": "✉️ Вопрос от игрока", "message": "💬 Сообщение в игровой бот",
                 "report": f"🚩 Что-то не так: {cat}"}[k]
        lines = [f"<b>{title}</b>" + ("" if rec.get("complete", True) else " (не дописан)")]
        if k == "review":
            lines.append("<i>финал подтверждён плеером</i>" if rec.get("confirmed") else "<i>без подтверждения финала</i>")
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

    def start(self, chat, user, arg):
        flow, _, quest = arg.replace("_", "-").partition("-")
        flow = flow.lower()
        quest = alnum(quest) or None
        if quest and find_case(quest):
            quest = find_case(quest)["id"]
        self.state["dialogs"].pop(user, None)
        if flow == "report":
            self.begin(chat, user, "report", data=parse_report_start(arg))
        elif flow == "done":
            self.begin(chat, user, "review", quest, {"confirmed": True})
        elif flow == "review":
            self.begin(chat, user, "review", quest)
        elif flow == "remind":
            self.begin(chat, user, "remind", quest)
        elif flow in ("suggest", "question"):
            self.begin(chat, user, flow, quest)
        elif not self.screen(chat, user, flow if flow in ("cases", "how", "help") else "menu"):
            self.menu(chat)

    def handle_message(self, msg):
        chat = (msg.get("chat") or {}).get("id")
        if (msg.get("chat") or {}).get("type") != "private" or chat is None:
            return  # в группах и каналах бот молчит
        self.dirty = True
        from_id = (msg.get("from") or {}).get("id", chat)
        user = self.uid(from_id)
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
                return self.start(chat, user, arg)
            if cmd == "/cancel":
                self.state["dialogs"].pop(user, None)
                self.state["reminders"] = [r for r in self.state["reminders"] if r.get("u") != user]
                self.send(chat, T["cancelled"])
                return self.menu(chat)
            if cmd in ("/help", "/menu", "/cases"):
                return self.screen(chat, user, {"/menu": "menu", "/help": "help", "/cases": "cases"}[cmd])
            if cmd == "/test" and self.is_test(user):
                return self.test_menu(chat)
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
            self.notify_owner(self.owner_text(rec), self.is_test(user))
            self.send(chat, T["message_done"])
            self.menu(chat)
            return
        if d["step"] == "rating" and parse_rating(text):
            return self.advance(chat, d, parse_rating(text))   # «5» текстом — тоже оценка
        if d["step"] in ("rating", "quote", "report_cat", "when"):
            self.send(chat, T["use_buttons"])
            return
        self.advance(chat, d, text)

    def handle_callback(self, cq):
        """Нажатие inline-кнопки. Каждое нажатие подтверждается answerCallbackQuery, иначе кнопка «висит»."""
        self._toast = None
        try:
            self._callback(cq)
        finally:
            params = {"callback_query_id": cq.get("id")}
            if self._toast:
                params["text"] = self._toast
            tg.call(self.token, "answerCallbackQuery", params)

    def _callback(self, cq):
        msg = cq.get("message") or {}
        chat = (msg.get("chat") or {}).get("id")
        if chat is None:
            return
        self.dirty = True
        try:
            action, value, sid = cq.get("data", "").split("|")
            sid = int(sid)
        except ValueError:
            return
        user = self.uid((cq.get("from") or {}).get("id", chat))
        d = self.state["dialogs"].get(user)
        if action == "m":
            if value in ("review", "suggest", "question"):
                self._unbutton(chat, msg)
            if not self.screen(chat, user, value):
                self.menu(chat)
            return
        if action == "t":
            if self.is_test(user):
                self.test_item(chat, user, value)
            return
        if action == "r" and (not d or d["sid"] != sid):
            d = self._rating_dialog(user, d, value)   # оценка с более раннего сообщения — не теряем
            if d:
                sid = d["sid"]
        if not d or d["sid"] != sid:
            self._toast = T["stale"]   # старая кнопка: объясняем и даём меню, а не молчим
            if not d:
                self.menu(chat)
            return
        step = d["step"]
        ok = ((action == "r" and step == "rating" and parse_rating_button(value))
              or (action == "np" and step == "rating")
              or (action == "c" and step == "report_cat" and value in REPORT_CATS)
              or (action == "q" and step == "quote" and value in ("0", "1"))
              or (action == "w" and step == "when" and (value == "no" or remind_at(value, 0) is not None))
              or (action == "skip" and value == step))
        if not ok:
            return
        self._unbutton(chat, msg)
        if action == "r":
            self.advance(chat, d, parse_rating_button(value)[0])
        elif action == "np":   # ещё не играл: не оценка, а сообщение команде
            d["flow"] = "question"
            d["data"] = {k: v for k, v in d["data"].items() if k == "quest"}
            self.ask(chat, d, "not_played")
        elif action == "q":
            self.advance(chat, d, value == "1")
        elif action in ("c", "w"):
            self.advance(chat, d, value)
        else:
            self.advance(chat, d, "")

    def _rating_dialog(self, user, d, value):
        """Кнопка оценки не из текущего диалога. Раньше это было «из прошлого разговора» и оценка терялась:
        игрок дважды открыл ссылку из финала (первый раз бот не ответил сразу) и нажал оценку в первом
        сообщении, или диалог истёк, пока бот был недоступен. Теперь:
          * идёт отзыв и ждёт оценку — принимаем в него (дело из кнопки, если в диалоге его нет);
          * диалога нет, а в кнопке есть дело — начинаем отзыв заново с этой оценкой;
          * игрок посреди другого разговора или кнопка старого образца без дела — как раньше, «из прошлого»."""
        got = parse_rating_button(value)
        if not got:
            return None
        _, quest, conf = got
        if d and d["flow"] == "review" and d.get("step") == "rating":
            if quest and not d["data"].get("quest"):
                d["data"]["quest"] = quest
            d["data"]["confirmed"] = bool(d["data"].get("confirmed") or conf)
            return d
        if d is None and quest:
            self.state["seq"] = self.state.get("seq", 0) + 1
            d = {"flow": "review", "user": user, "sid": self.state["seq"], "ts": now(), "step": "rating",
                 "data": {"quest": quest, "confirmed": conf}}
            self.state["dialogs"][user] = d
            return d
        return None

    def _unbutton(self, chat, msg):
        if msg.get("message_id"):
            tg.call(self.token, "editMessageReplyMarkup",
                    {"chat_id": chat, "message_id": msg["message_id"], "reply_markup": {"inline_keyboard": []}})

    def deliver(self):
        """Отправить напоминания, время которых пришло. Возвращает ближайшее будущее время (или None)."""
        keep, nxt = [], None
        for r in self.state.get("reminders", []):
            if r["at"] > now():
                keep.append(r)
                nxt = r["at"] if nxt is None else min(nxt, r["at"])
                continue
            self.dirty = True
            chat = self.unseal(r.get("c", ""))
            if chat is None:
                continue
            c = find_case(r.get("quest"))
            start = f" Старт — {c['start']}." if c and c.get("start") else ""
            b = [[{"text": T["open_case"], "url": case_url(c) if c else CITY_URL}]]
            self.send(chat, T["reminder"].format(what=case_name(r.get("quest")), start=start), b)
        self.state["reminders"] = keep
        return nxt

    def sweep(self):
        """Брошенные диалоги: отзыв с оценкой сохраняем как неполный, остальное забываем."""
        for user, d in list(self.state["dialogs"].items()):
            if now() - d.get("ts", 0) <= EXPIRE:
                continue
            self.dirty = True
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

    def commit(self):
        """Сохранить состояние в репозиторий (scripts/feedback_bot_commit.sh), только если оно менялось."""
        self.sweep()
        self.save()
        if not self.dirty:
            return
        r = subprocess.run(["bash", str(COMMIT_SCRIPT)], cwd=ROOT)
        if r.returncode == 0:
            self.dirty = False
        else:
            print("::warning::не удалось сохранить состояние бота, повторю позже")

    def run(self, poll_seconds=0, commit_seconds=0):
        """Длинный опрос до дедлайна. Ошибки сети — повтор с паузой; 401/404 (токен) и 409 (второй опрос) — выход."""
        deadline = now() + poll_seconds
        last_commit = now()
        pause = 5
        try:
            while True:
                nxt = self.deliver()
                left = deadline - now()
                timeout = max(0, min(50, left, (nxt - now()) if nxt else 50))
                r = tg.call(self.token, "getUpdates", {"offset": self.offset, "timeout": int(timeout),
                                                       "allowed_updates": ["message", "callback_query"]})
                if not r.get("ok"):
                    print(f"::warning::getUpdates: {r.get('error_code', '')} {r.get('description')}")
                    if r.get("error_code") in (401, 404, 409) or now() + pause >= deadline:
                        break
                    time.sleep(pause)
                    pause = min(pause * 2, 60)
                    continue
                pause = 5
                for u in r.get("result", []):
                    self.offset = max(self.offset, u["update_id"] + 1)
                    self.handle(u)
                self.deliver()
                self.save()
                if commit_seconds and now() - last_commit >= commit_seconds:
                    self.commit()
                    last_commit = now()
                if now() >= deadline:
                    break
        finally:
            self.sweep()
            self.save()


def _stop(signum, frame):
    raise SystemExit(0)   # отмена задания: finally в run() успеет сохранить состояние


def main():
    token = os.environ.get("PLAYER_BOT_TOKEN", "").strip()
    if not token:
        print("PLAYER_BOT_TOKEN не задан — игровой бот ещё не подключён, выхожу.")
        return 0

    def minutes(name, cap):
        try:
            return max(0.0, min(float(os.environ.get(name) or 0), cap))
        except ValueError:
            return 0.0

    signal.signal(signal.SIGTERM, _stop)
    bot = Bot(token, os.environ.get("TELEGRAM_BOT_TOKEN", "").strip(),
              os.environ.get("TELEGRAM_CHAT_ID", "").strip())
    bot.setup()
    bot.run(minutes("POLL_MIN", 350) * 60, minutes("COMMIT_MIN", 120) * 60)
    return 0


if __name__ == "__main__":
    sys.exit(main())

"""Живой Telegram-бот, который ведёт квест. Запускается в GitHub Actions на несколько часов.

Сценарий — тот же quests/<id>/quest.json, что у веб-плеера site/play/ (формат 5, docs/quest-format.md; формат 3 тоже):
ветки А/Б (`if`, флаги дела), временные объекты (`temporary`, quests/<id>/temporary.json), ветки по часам (`clock`),
развилка (`fork`), реплики, письмо и карточки доски. Шаги — все, что понимает плеер: info/say/board («Дальше»),
ask (ответ словами: answers → all → replies → missing → «почти», scripts/answer_match.check_text = checkText в answer.js),
free (любой ответ), choice (варианты кнопками), pick (карточки доски), strike (вычеркнуть лишнее); вопросы на ходу (walk_ask).
Тест без сети: python3 scripts/test_quest_bot.py (проходит оба дела правильными ответами, неверные не засчитываются).

Режим полевого теста (по умолчанию): на каждой точке бот показывает, что проверить на месте,
сохраняет фото, голосовые, геометки и заметки владельца в quests/<id>/field/<дата>/
и записывает время прохождения каждой точки.

Переменные окружения:
  TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID — как у остальных скриптов
  QUEST        — id квеста (папка в quests/), по умолчанию zilart
  DURATION_MIN — сколько минут работать, по умолчанию 300
  IDLE_MIN     — выключиться после стольких минут тишины, по умолчанию 90
  FIELD_MODE   — 1: полевой тест (подсказки «что проверить», сохранение заметок), 0: обычная игра
  RESTART      — 1: начать квест заново, игнорируя сохранённый прогресс
  COMMIT       — 1: периодически коммитить и пушить заметки (в Actions), 0: не трогать git
  FLAGS        — ветки для проверки, как ?flags= у плеера: «st4:B,st10:B» (необязательно)
  QUEST_DATA   — другой файл дела (черновик), как --data у player_check (необязательно)
"""

import datetime
import html
import json
import math
import os
import pathlib
import random
import re
import subprocess
import sys
import time
import urllib.request
from zoneinfo import ZoneInfo

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import tg  # noqa: E402
import telegram_inbox  # noqa: E402
import fire_team  # noqa: E402
from answer_match import check_text, norm  # noqa: E402

ROOT = pathlib.Path(__file__).resolve().parent.parent
MSK = ZoneInfo("Europe/Moscow")
QUEST_ID = os.environ.get("QUEST", "zilart")
DURATION = int(os.environ.get("DURATION_MIN", "300")) * 60
IDLE = int(os.environ.get("IDLE_MIN", "90")) * 60
FIELD = os.environ.get("FIELD_MODE", "1") == "1"
RESTART = os.environ.get("RESTART", "0") == "1"
COMMIT = os.environ.get("COMMIT", "0") == "1"
COMMIT_EVERY = 10 * 60

KB_BOARD = "🗂 Улики"
KB_NOTE = "📝 Заметка"
KB_REPEAT = "🔁 Повторить"
KB_STOP = "⏹ Закончить"
REPLY_KB = {
    "keyboard": [[{"text": KB_BOARD}, {"text": KB_NOTE}], [{"text": KB_REPEAT}, {"text": KB_STOP}]],
    "resize_keyboard": True,
    "is_persistent": True,
}
EMPTY_TEXT = "Впишите ответ."   # как в плеере (site/play/player.js, answer): пустой ответ или одни знаки
MARKS = "АБВГДЕЖЗИК"
TASK_TYPES = ("ask", "free", "choice", "pick", "strike")


def now():
    return datetime.datetime.now(MSK)


def ts():
    return now().strftime("%H:%M:%S")


# ---------- дело формата 5 → то, что видит игрок (как prepare() в site/play/player.js) ----------

def quest_file(qid):
    return ROOT / "quests" / qid / "quest.json"


def with_temporary(q, qid):
    """Сроки временных объектов из quests/<id>/temporary.json — как codes.py with_temporary для зашифрованного дела."""
    side = ROOT / "quests" / qid / "temporary.json"
    if side.exists():
        items = json.loads(side.read_text(encoding="utf-8")).get("items") or []
        if items:
            q = dict(q)
            q["temporary"] = list(q.get("temporary") or []) + items
    return q


def gone(t, today):
    """H-117: временный объект увезли (until — последний день на месте, по Москве)."""
    return isinstance(t, dict) and bool(re.fullmatch(r"\d{4}-\d{2}-\d{2}", str(t.get("until") or ""))) and str(t["until"]) < today


def gone_flags(q, today):
    recs = [t for t in (q.get("temporary") or []) if isinstance(t, dict)]

    def walk(x):
        if isinstance(x, list):
            for e in x:
                walk(e)
        elif isinstance(x, dict):
            if isinstance(x.get("temporary"), dict):
                recs.append(x["temporary"])
            for k, v in x.items():
                if k != "temporary" and isinstance(v, (list, dict)):
                    walk(v)
    walk(q.get("points") or [])
    out = {}
    for t in recs:
        kv = re.split(r"[:=]", str(t.get("flag"))) if gone(t, today) and t.get("flag") else []
        if len(kv) >= 2 and kv[0].strip() and kv[1].strip():
            out[kv[0].strip()] = kv[1].strip()
    return out


def parse_flags(raw):
    out = {}
    for part in str(raw or "").split(","):
        kv = re.split(r"[:=]", part)
        if len(kv) >= 2 and kv[0].strip() and kv[1].strip():
            out[kv[0].strip()] = kv[1].strip()
    return out


def cond_keys(cond):
    if not cond:
        return []
    if isinstance(cond, str):
        m = re.match(r"^\s*([\w-]+)\s*!?=", cond)
        return [m.group(1)] if m else []
    return list(cond.keys()) if isinstance(cond, dict) else []


def passes(cond, fv):
    """Условие ветки: "st4=B", "st4!=B", "st4=A|A2" или {"st4": ["A", "A2"]}; fv(ключ) — значение флага."""
    if not cond:
        return True
    if isinstance(cond, str):
        m = re.match(r"^\s*([\w-]+)\s*(!?=)\s*(.+?)\s*$", cond)
        if not m:
            return True
        hit = fv(m.group(1)) in [x.strip() for x in m.group(3).split("|")]
        return hit if m.group(2) == "=" else not hit
    if isinstance(cond, dict):
        return all(fv(k) in [str(x) for x in (v if isinstance(v, list) else [v])] for k, v in cond.items())
    return True


def sunset_msk(lat, lon, day):
    """Заход солнца, минуты от полуночи по Москве (формула NOAA, как sunsetMsk в плеере)."""
    n = day.timetuple().tm_yday
    g = 2 * math.pi / 365 * (n - 1)
    r = math.pi / 180
    eq = 229.18 * (0.000075 + 0.001868 * math.cos(g) - 0.032077 * math.sin(g) - 0.014615 * math.cos(2 * g) - 0.040849 * math.sin(2 * g))
    d = (0.006918 - 0.399912 * math.cos(g) + 0.070257 * math.sin(g) - 0.006758 * math.cos(2 * g) + 0.000907 * math.sin(2 * g)
         - 0.002697 * math.cos(3 * g) + 0.00148 * math.sin(3 * g))
    c = math.cos(90.833 * r) / (math.cos(lat * r) * math.cos(d)) - math.tan(lat * r) * math.tan(d)
    if not -1 <= c <= 1:
        return None
    return math.floor(720 - 4 * (lon - math.acos(c) / r) - eq + 180 + 0.5)


def hhmm(m):
    m = m % 1440
    return f"{m // 60}:{m % 60:02d}"


def sun_lines(x, set_min, now_min):
    """Строка «о свете» ({"sun": N}) остаётся, только если до захода меньше N минут; {время} — время захода."""
    if isinstance(x, list):
        return [sun_lines(e, set_min, now_min) for e in x
                if not (isinstance(e, dict) and isinstance(e.get("sun"), (int, float)) and not isinstance(e.get("sun"), bool)
                        and (set_min is None or set_min - now_min >= e["sun"]))]
    if isinstance(x, dict):
        o = {k: sun_lines(v, set_min, now_min) for k, v in x.items()}
        if isinstance(x.get("sun"), (int, float)) and isinstance(o.get("text"), str) and set_min is not None:
            o["text"] = o["text"].replace("{время}", hhmm(set_min))
        return o
    return x


def as_lines(src):
    if src is None or src == "":
        return []
    return src if isinstance(src, list) else [src]


def walk_asks(p):
    w = (p or {}).get("walk_ask")
    return [] if not w else (w if isinstance(w, list) else [w])


def plain(s):
    s = re.sub(r"<[^>]+>", "", str(s or ""))
    return html.unescape(s).strip()


def inline(src):
    """Текст дела → HTML Telegram: <b> <i> <u> <s> <code> и ссылки https остаются, всё остальное экранируется."""
    s = html.unescape(str(src or ""))
    s = s.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
    s = re.sub(r"&lt;(/?)(b|i|u|s|code)&gt;", r"<\1\2>", s)

    def link(m):
        href, text = m.group(2), m.group(3)
        if re.match(r"^https://[^/\s]", href, re.I):
            return f'<a href="{href.replace(chr(34), "%22")}">{text}</a>'
        return text
    s = re.sub(r"&lt;a\s+href=([\"'])([^\"'<>\s]+)\1\s*&gt;([\s\S]*?)&lt;/a&gt;", link, s)
    s = "\n".join(re.sub(r"[ \t]{2,}", " ", ln.strip(" \t")) for ln in s.split("\n"))
    return s.strip()


def esc(s):
    return html.escape(str(s or ""), quote=False)


def hint_steps(st):
    """Лестница подсказок, как hintSteps в плеере: (название, надпись кнопки); у загадки последняя ступень — ответ."""
    n = len(st.get("hints") or [])
    out = []
    for i in range(n):
        if st.get("type") != "free" and i == n - 1:
            out.append(("Ответ", "Показать ответ"))
        elif n == 3 and i == 0:
            out.append(("Намёк", "Подсказка 1 из 3"))
        elif n == 3 and i == 1:
            out.append(("Почти решение", "Подсказка 2 из 3"))
        else:
            out.append((f"Подсказка {i + 1}", f"Подсказка {i + 1} из {n}"))
    return out


def is_marked(ops):
    return bool(ops) and all(re.fullmatch(r"[0-9A-Za-zА-Яа-яЁё]", str(x.get("id"))) for x in ops)


class Bot:
    def __init__(self, quest_id=None, state_dir=None, field=None, commit=None, restart=None, flags=None, clock=None, data=None):
        self.token, self.chat_id = tg.env()
        self.qid = quest_id or QUEST_ID
        self.field = FIELD if field is None else field
        self.commit_on = COMMIT if commit is None else commit
        self.state_file = pathlib.Path(state_dir or ROOT / ".telegram") / f"quest-{self.qid}-state.json"
        self.offset_file = pathlib.Path(state_dir or ROOT / ".telegram") / "offset"
        self.url_flags = parse_flags(os.environ.get("FLAGS", "") if flags is None else flags)
        self.clock_now = clock or now   # подставное время — для проверки веток по часам и строки «о свете»
        data = data or os.environ.get("QUEST_DATA") or None   # черновик дела — как --data у player_check
        raw = json.loads(pathlib.Path(data or quest_file(self.qid)).read_text(encoding="utf-8"))
        self.raw = raw if data else with_temporary(raw, self.qid)
        self.cards = self._index_cards(self.raw)
        self.day = self.clock_now().strftime("%Y-%m-%d")
        self.field_dir = ROOT / "quests" / self.qid / "field" / self.day
        self.offset = self._read_offset()
        self.started = time.time()
        self.last_activity = time.time()
        self.last_commit = time.time()
        self.dirty = False
        self.stop = False
        self.ver_note = ""
        self.s = None
        self.prepare({})
        self.s = self._load_state(RESTART if restart is None else restart)
        self.prepare(self.s.get("fl") or {})

    # ---------- дело: ветки, часы, карточки ----------

    def prepare(self, fork):
        q = self.raw
        today = self.clock_now().strftime("%Y-%m-%d")
        self.clock = {k: v for k, v in (q.get("clock") or {}).items() if isinstance(v, dict)}
        f = {k: str(v) for k, v in (q.get("flags") or {}).items()}
        f.update(gone_flags(q, today))
        f.update({k: v for k, v in self.url_flags.items()})
        f.update({k: str(v) for k, v in (fork or {}).items() if k not in self.clock})
        self.flags = f

        def keep(e):
            if gone(e.get("temporary"), today):
                return False
            if any(k in self.clock for k in cond_keys(e.get("if"))):
                return True   # ветка по часам решается при показе (clock_pick)
            return passes(e.get("if"), lambda k: self.flags.get(k, "A"))

        def prune(x):
            if isinstance(x, list):
                return [prune(e) for e in x if not (isinstance(e, dict) and not keep(e))]
            if isinstance(x, dict):
                return {k: prune(v) for k, v in x.items()}
            return x
        p = prune(q)
        p0 = (p.get("points") or [{}])[0]
        t = self.clock_now()
        p = sun_lines(p, sunset_msk(float(p0.get("lat") or 55.75), float(p0.get("lon") or 37.62), t), t.hour * 60 + t.minute)
        self.q = p
        self.points = p["points"]

    def _index_cards(self, src):
        out = {}

        def add(lst, n):
            for c in lst or []:
                if isinstance(c, dict) and c.get("id") and c["id"] not in out:
                    out[c["id"]] = dict(c, n=n)
        add(src.get("cards"), 0)
        for p in src.get("points") or []:
            add(p.get("cards"), p.get("n"))
            for st in p.get("steps") or []:
                add(st.get("cards"), p.get("n"))
            for w in walk_asks(p):
                add(w.get("cards"), p.get("n"))
        return out

    def flag(self, k, sec=None):
        if k in self.clock:
            if k in self.url_flags:
                return self.url_flags[k]
            rec = ((self.s or {}).get("clk") or {}).get(str(sec), {}).get(k) if sec is not None else None
            return rec["v"] if rec else ("open" if self.open_now(self.clock[k]) else "closed")
        return self.flags.get(k, "A")

    def open_now(self, d):
        def m(x):
            mm = re.fullmatch(r"(\d{1,2}):(\d{2})", str(x or ""))
            return int(mm.group(1)) * 60 + int(mm.group(2)) if mm else None
        a, b = m(d.get("open")), m(d.get("close"))
        if a is None or b is None or a == b:
            return True
        t = self.clock_now()
        x = t.hour * 60 + t.minute
        return a <= x < b if a < b else (x >= a or x < b)

    def clock_pick(self, src, sec):
        """Реплики (и walk_m) по веткам «по часам» для точки sec; абзац {"text", "if"} снова простая строка."""
        if not isinstance(src, list):
            return src
        out = []
        for e in src:
            if isinstance(e, dict) and any(k in self.clock for k in cond_keys(e.get("if"))):
                if not passes(e.get("if"), lambda k: self.flag(k, sec)):
                    continue
                if isinstance(e.get("text"), str) and set(e.keys()) <= {"text", "if"}:
                    e = e["text"]
            out.append(e)
        return out

    def point_clock_keys(self, p):
        ks = []
        for lst in (p.get("walk"), p.get("scene"), p.get("outro"), p.get("walk_m")):
            for e in lst if isinstance(lst, list) else []:
                if isinstance(e, dict):
                    for k in cond_keys(e.get("if")):
                        if k in self.clock and k not in ks:
                            ks.append(k)
        return ks

    def fix_clock(self, sec):
        """Ветка по часам фиксируется, когда игрок впервые видит дорогу к точке (как fixClock в плеере, T-99)."""
        for k in self.point_clock_keys(self.points[sec]):
            if k in self.url_flags:
                continue
            c = self.s["clk"].setdefault(str(sec), {})
            if k not in c:
                c[k] = {"v": "open" if self.open_now(self.clock[k]) else "closed", "by": "time"}

    def walk_m(self, p, sec):
        w = p.get("walk_m")
        if not isinstance(w, list):
            return w
        hit = (self.clock_pick(w, sec) or [None])[0]
        return hit.get("m") if isinstance(hit, dict) else hit

    def right_options(self, st):
        f = st.get("answer_flag") and self.flags.get(st["answer_flag"])
        if f and any(str(x.get("id")) == f for x in st.get("options") or []):
            return [f]
        a = st.get("answer") if st.get("answer") is not None else st.get("answers")
        return [str(x) for x in (a if isinstance(a, list) else [a] if a is not None else [])]

    # ---------- состояние ----------

    def _read_offset(self):
        try:
            return int(self.offset_file.read_text().strip())
        except (FileNotFoundError, ValueError):
            return 0

    def _fresh(self):
        return {
            "quest": self.qid, "version": self.q.get("version"), "pid": None, "day": self.day,
            "phase": "idle",  # idle → intro → walk → step → (fork) → … → done
            "p": 0, "k": 0, "hint": 0, "await_note": False,
            "board": [], "events": [], "files": 0, "finished": False,
            "t_start": None, "t_end": None,
            # формат 5: карточки доски [{id, n}], вычеркнутые, письмо, выбор в pick/strike, итоги шагов,
            # вопросы на ходу [{res, hint}], открытый вопрос на ходу, ветки по часам, выбор на развилках, порядок вариантов
            "cards": [], "struck": {}, "letter": None, "sel": [], "res": [], "wa": [], "wa_open": None,
            "clk": {}, "fl": {}, "seed": random.randrange(2 ** 32),
        }

    def _fill(self, s):
        for k, v in self._fresh().items():
            if k not in s:
                s[k] = v
        return s

    def _load_state(self, restart):
        if self.state_file.exists() and not restart:
            try:
                s = json.loads(self.state_file.read_text(encoding="utf-8"))
                if s.get("quest") == self.qid and not s.get("finished"):
                    s = self._fill(s)
                    self.prepare(s.get("fl") or {})
                    if s["phase"] in ("walk", "step", "fork") and str(s.get("version")) != str(self.q.get("version")):
                        # H-74: сценарий обновился посреди прохождения — то же место по id точки, шаг ограничен новым числом шагов
                        ids = [p.get("id") for p in self.points]
                        p = ids.index(s["pid"]) if s.get("pid") in ids else min(int(s.get("p") or 0), len(self.points) - 1)
                        s["p"] = p
                        s["k"] = min(int(s.get("k") or 0), len(self.points[p].get("steps") or []))
                        self.ver_note = (f"Сценарий обновился ({s.get('version') or '—'} → {self.q.get('version')}): "
                                         f"продолжаем с точки {self.points[p]['n']}. /restart — начать заново.")
                        s["version"] = self.q.get("version")
                    return s
            except ValueError:
                pass
        return self._fresh()

    def save(self):
        self.state_file.parent.mkdir(parents=True, exist_ok=True)
        if self.s["phase"] in ("walk", "step", "fork") and self.s["p"] < len(self.points):
            self.s["pid"] = self.points[self.s["p"]].get("id")
        self.state_file.write_text(json.dumps(self.s, ensure_ascii=False, indent=1), encoding="utf-8")
        self.offset_file.write_text(f"{self.offset}\n")
        if self.field and self.s["events"]:
            self.field_dir.mkdir(parents=True, exist_ok=True)
            (self.field_dir / "log.md").write_text(self.render_log(), encoding="utf-8")
        self.dirty = True

    def log(self, kind, **kw):
        e = {"t": ts(), "kind": kind, "point": self.cur_point_n()}
        e.update(kw)
        self.s["events"].append(e)

    def cur_point_n(self):
        if self.s["phase"] in ("walk", "step", "fork") and self.s["p"] < len(self.points):
            return self.points[self.s["p"]]["n"]
        return None

    def pt(self):
        return self.points[self.s["p"]]

    def step(self):
        steps = self.pt().get("steps") or []
        return steps[self.s["k"]] if self.s["k"] < len(steps) else None

    # ---------- отправка ----------

    def send(self, text, buttons=None, reply_kb=False):
        chunks = tg.split(text) or [""]
        r = {}
        for i, chunk in enumerate(chunks):
            params = {"chat_id": self.chat_id, "text": chunk, "parse_mode": "HTML", "disable_web_page_preview": True}
            if i == len(chunks) - 1:
                if buttons:
                    params["reply_markup"] = {"inline_keyboard": buttons}
                elif reply_kb:
                    params["reply_markup"] = REPLY_KB
            r = tg.call(self.token, "sendMessage", params)
            if not r.get("ok"):
                params.pop("parse_mode")
                params["text"] = re.sub(r"<[^>]+>", "", chunk)
                r = tg.call(self.token, "sendMessage", params)
        return r

    def btn(self, label, action, arg=""):
        # к действию добавляем «где мы», чтобы старые кнопки не срабатывали
        data = f"{action}|{self.s['p']}|{self.s['k']}" + (f"|{arg}" if arg != "" else "")
        return {"text": label, "callback_data": data[:64]}

    # ---------- реплики, письмо, карточки ----------

    def speaker(self, who):
        sp = (self.q.get("speakers") or {}).get(who) or {}
        return sp.get("name") or who, sp.get("style") or "hero"

    def render_lines(self, src, sec=None):
        if sec is not None:
            src = self.clock_pick(src, sec)
        out, prev = [], None
        for ln in as_lines(src):
            who = ln.get("who") if isinstance(ln, dict) and not ln.get("arrow") and ln.get("text") is not None else None
            h = self.line_html(ln, cont=bool(who) and who == prev)
            if h:
                out.append(h)
            if not (isinstance(ln, dict) and ln.get("arrow")):
                prev = who
        return "\n\n".join(out)

    def line_html(self, ln, cont=False):
        if isinstance(ln, str):
            return inline(ln)
        if isinstance(ln, list):
            return self.render_lines(ln)
        if not isinstance(ln, dict) or ln.get("arrow"):
            return ""   # «стрелки» — подсказки интерфейса плеера, в чате их нет
        if ln.get("doc") == "letter":
            return self.letter_html(ln.get("state") or self.s.get("letter"), reveal=ln.get("reveal"))
        if ln.get("doc") == "card":
            return self.card_html(ln.get("id"), full=True)
        parts = []
        if "img" in ln or ln.get("layers"):
            cap = ln.get("caption") or ln.get("alt")
            if cap:
                parts.append(f"🖼 <i>{inline(cap)}</i>")
            if ln.get("text") or ln.get("audio"):
                rest = {k: v for k, v in ln.items() if k not in ("img", "layers", "caption", "alt")}
                h = self.line_html(rest, cont)
                if h:
                    parts.append(h)
            return "\n".join(parts)
        if ln.get("audio") and not ln.get("text"):
            sub = ln.get("transcript") or ln.get("caption") or ""
            return f"🔊 <i>{inline(sub)}</i>" if sub else ""
        text = inline(ln.get("text"))
        if not text:
            return ""
        if not ln.get("who"):
            return text
        name, style = self.speaker(ln["who"])
        if style == "titr":
            return f"<i>{text}</i>"
        if style in ("letter", "note", "card"):
            return f"<b>{esc(name)}</b>" + (f" <i>{esc(plain(ln['note']))}</i>" if ln.get("note") else "") + f"\n<i>{text}</i>"
        if cont and not ln.get("note"):
            return text
        return f"<b>{esc(name)}</b>" + (f" <i>({esc(plain(ln['note']))})</i>" if ln.get("note") else "") + f": {text}"

    def letter_state(self, sid):
        for st in ((self.q.get("letter") or {}).get("states") or []):
            if st.get("id") == sid:
                return st
        return None

    def letter_html(self, sid, reveal=None):
        L, st = self.q.get("letter"), self.letter_state(sid)
        if not L or not st:
            return ""
        word = st.get("reveal") or reveal or ""
        stain = f"<u>{esc(word)}</u>" if word else "▓▓▓"
        body = "\n".join(inline(ln).replace("▓", stain) for ln in str(st.get("text") or L.get("text") or "").split("\n"))
        notes = []
        if st.get("ruled"):
            notes.append("под буквами — двойная линия по линейке")
        tip = st.get("tip")
        if tip == "stuck":
            notes.append("кончик присох к трубочке")
        elif tip == "circles":
            notes.append("кончик: две линии до края и кружки по обе стороны, каждый обведён дважды")
        elif tip in ("eight", "eight-dots"):
            dots = tip == "eight-dots"
            notes.append("кончик: две линии до края, по обе стороны ряды " + ("точек" if dots else "кружков")
                         + "; в одном месте два " + ("колечка" if dots else "кружка") + " срослись боками, как восьмёрка, и обведены с нажимом"
                         + (f"; у края обрывок подписи: {esc(st['tip_note'])}" if st.get("tip_note") else ""))
        out = [f"✉️ <b>{inline(L.get('title') or 'Письмо')}</b>", f"<i>{body}</i>"]
        if notes:
            out.append("(" + "; ".join(notes) + ")")
        if st.get("stamp"):
            out.append(f"Штамп: <b>{esc(st['stamp'])}</b>")
        if st.get("back"):
            out.append(f"Оборот: <i>{inline(st['back'])}</i>")
        if st.get("caption"):
            out.append(inline(st["caption"]))
        return "\n".join(out)

    def card_html(self, cid, full=False):
        c = self.cards.get(cid)
        if not c:
            return ""
        struck = bool(self.s["struck"].get(cid))
        src = c.get("source") or (f"Остановка {c['n']}" if c.get("n") else "С начала дела")
        title = inline(c.get("title"))
        head = (f"<s>{title}</s> — {esc(c.get('struck_label') or 'Вычеркнуто')}" if struck else f"<b>{title}</b>") + f" · <i>{esc(src)}</i>"
        parts = [head]
        if c.get("text") and (full or not struck):
            parts.append(inline(c["text"]))
        if full and (c.get("caption") or c.get("alt")) and ("img" in c or c.get("kind") == "photo"):
            parts.append(f"🖼 <i>{inline(c.get('caption') or c.get('alt'))}</i>")
        return "\n".join(parts)

    def add_cards(self, lst, n):
        added = []
        for c in lst or []:
            cid = c if isinstance(c, str) else (c or {}).get("id") if isinstance(c, dict) else None
            if not cid or cid not in self.cards or any(x["id"] == cid for x in self.s["cards"]):
                continue
            self.s["cards"].append({"id": cid, "n": n})
            added.append(cid)
        return added

    def effects(self, d, n):
        """Последствия шага, вопроса на ходу или точки: карточки на доску, вычёркивания. Возвращает строку для игрока."""
        if not d:
            return ""
        added = self.add_cards(d.get("cards"), n) + self.add_cards(d.get("add"), n)
        struck = []
        for cid in as_lines(d.get("strike")):
            if not self.s["struck"].get(cid):
                struck.append(cid)
            self.s["struck"][cid] = True
        for cid in as_lines(d.get("unstrike")):
            self.s["struck"].pop(cid, None)
        out = []
        added = [c for c in added if c not in struck]   # версия легла и сразу отпала — одной строкой «Вычеркнуто»
        if added:
            out.append("🗂 На доску: " + ", ".join(f"«{esc(plain(self.cards[c].get('title')))}»" for c in added))
        if struck:
            out.append("✖️ Вычеркнуто: " + ", ".join(f"«{esc(plain(self.cards[c].get('title')))}»" for c in struck if c in self.cards))
        return "\n".join(out)

    # ---------- ход квеста ----------

    def start_quest(self):
        s = self.s
        s.clear()
        s.update(self._fresh())
        self.prepare({})
        s["phase"] = "intro"
        s["t_start"] = now().isoformat(timespec="seconds")
        self.add_cards(self.q.get("cards"), 0)
        if (self.q.get("letter") or {}).get("start"):
            s["letter"] = self.q["letter"]["start"]
        self.log("start")
        for m in as_lines(self.q.get("intro")):
            text = self.render_lines(m)
            if text:
                self.send(text, reply_kb=True)
        self.show_walk()

    def clear_slot(self, o):
        o["hint"] = 0
        o["sel"] = []

    def show_walk(self):
        s = self.s
        s["phase"] = "walk"
        s["k"] = 0
        s["res"] = []
        s["wa"] = [{} for _ in walk_asks(self.pt())]
        s["wa_open"] = None
        self.clear_slot(s)
        self.fix_clock(s["p"])
        self.log("walk")
        self.send_walk()
        pt = self.pt()
        if self.field and pt.get("check"):
            items = "\n".join(f"• {esc(c)}" for c in pt["check"])
            self.send(f"🔎 <b>Полевой тест — проверьте на месте:</b>\n{items}\n\n"
                      f"Фото и голосовые просто присылайте сюда — сохраню к точке {pt['n']}.")

    def walk_buttons(self):
        s, pt = self.s, self.pt()
        rows = [[self.btn("📍 Мы на месте", "here")]]
        for k in self.point_clock_keys(pt):
            d, v = self.clock[k], self.flag(k, s["p"])
            label = (d.get("closed_button") or "Двери закрыты") if v == "open" else (d.get("open_button") or "Двери открыты")
            rows.append([self.btn(label, "clk", k)])
        was = walk_asks(pt)
        for i, _ in enumerate(was):
            if not (s["wa"][i] if i < len(s["wa"]) else {}).get("res"):
                rows.append([self.btn("➕ Вопрос на ходу" + (f" {i + 1}" if len(was) > 1 else ""), "wa", i)])
        return rows

    def clock_note(self, sec):
        out = []
        for k in self.point_clock_keys(self.points[sec]):
            d, v = self.clock[k], self.flag(k, sec)
            rec = self.s["clk"].get(str(sec), {}).get(k) or {}
            hand = rec.get("by") == "hand"
            if v == "open":
                t = (d.get("hand_open_text") or "{label}: вы отметили, что двери открыты") if hand else (d.get("open_text") or "{label} сейчас открыт, до {close}")
            else:
                t = (d.get("hand_closed_text") or "{label}: вы отметили, что двери закрыты") if hand else (d.get("closed_text") or "{label} сейчас закрыт, откроется в {open}")
            out.append("🕘 " + esc(t.replace("{label}", d.get("label") or "Вход").replace("{open}", d.get("open") or "").replace("{close}", d.get("close") or "")))
        return "\n".join(out)

    def send_walk(self):
        s, pt = self.s, self.pt()
        link = f"https://yandex.ru/maps/?pt={pt['lon']},{pt['lat']}&z=18&l=map"
        m = self.walk_m(pt, s["p"])
        head = (f"📍 <b>Точка {pt['n']} из {len(self.points)}. {inline(pt['title'])}</b>\n{inline(pt.get('place'))}"
                + (f"\n≈ {m} м пешком" if m else ""))
        parts = [head, self.render_lines(pt.get("walk"), s["p"]), self.clock_note(s["p"]), f'<a href="{link}">Открыть на Яндекс Картах</a>']
        self.send("\n\n".join(x for x in parts if x), buttons=self.walk_buttons())

    def arrive(self):
        s = self.s
        s["phase"] = "step"
        s["k"] = 0
        s["res"] = []
        s["wa_open"] = None
        self.clear_slot(s)
        self.log("arrive")
        scene = self.render_lines(self.pt().get("scene"), s["p"])
        if scene:
            self.send(scene)
        self.enter_step()
        self.show_step()

    def enter_step(self):
        st = self.step()
        if st and st.get("letter"):
            self.s["letter"] = st["letter"]

    def can_skip(self, st):
        return bool(st.get("optional")) or st.get("type") == "free" or not st.get("hints")

    def revealed(self, st, o):
        return st.get("type") != "free" and bool(st.get("hints")) and o.get("hint", 0) >= len(st["hints"])

    def opt_order(self, st, where):
        ops = list(st.get("options") or [])
        ids = [str(a) for a in as_lines(st.get("answer") or st.get("answers"))]
        # порядок данных: "shuffle": false, нумерованные варианты, засчитывается любой вариант (как fixedOrder в плеере)
        fixed = st.get("shuffle") is False or len(ops) < 2 or is_marked(ops) or all(str(x.get("id")) in ids for x in ops)
        if fixed:
            return ops
        rnd = random.Random("|".join([self.qid, str(self.pt().get("id") or self.pt().get("n")), where, str(self.s["seed"])]))
        rnd.shuffle(ops)
        return ops

    def opt_mark(self, x, i, marked):
        if not marked:
            return MARKS[i] if i < len(MARKS) else str(i + 1)
        oid, lb = str(x.get("id")), plain(x.get("label"))
        return "" if lb.startswith(oid + " ") or lb.startswith(oid + " —") or lb == oid else oid

    def pick_list(self):
        return [c["id"] for c in self.s["cards"] if (self.cards.get(c["id"]) or {}).get("kind") != "version"]

    def task_buttons(self, st, o, ctx="step"):
        """Кнопки задания по его состоянию: варианты / выбор карточек, подсказка или «Дальше» после ответа, «Пропустить»."""
        t, rows = st.get("type"), []
        w = ctx != "step"
        hints = st.get("hints") or []
        if self.revealed(st, o):
            return [[self.btn("Дальше ▶" if not w else "Понятно ▶", "wrev" if w else "reveal", ctx[2:] if w else "")]]
        if t == "choice":
            ops = self.opt_order(st, ctx if w else f"s{self.s['k']}")
            marked = is_marked(st.get("options") or [])
            for i, x in enumerate(ops):
                j = (st.get("options") or []).index(x)
                mk = self.opt_mark(x, i, marked)
                label = plain(x.get("label")) or str(x.get("id"))
                rows.append([self.btn(((mk + ". ") if mk else "") + label[:60], "wopt" if w else "opt", f"{ctx[2:]}:{j}" if w else j)])
        elif t in ("pick", "strike"):
            if t == "pick":
                for i, cid in enumerate(self.pick_list()):
                    c = self.cards[cid]
                    on = cid in o["sel"]
                    sub = f" · ост. {c['n']}" if c.get("n") else ""
                    rows.append([self.btn(("✅ " if on else "▫️ ") + plain(c.get("title"))[:50] + sub + (" · вычеркнута" if self.s["struck"].get(cid) else ""), "sel", i)])
                need = st.get("pick") or 2
                rows.append([self.btn("Проверить" + (f" ({len(o['sel'])} из {need})" if len(o["sel"]) < need else ""), "chk")])
            else:
                for i, it in enumerate(st.get("items") or []):
                    on = it.get("id") in o["sel"]
                    rows.append([self.btn(("✖️ " if on else "▫️ ") + plain(it.get("label"))[:50], "sel", i)])
                rows.append([self.btn("Проверить", "chk")])
        extra = []
        if hints and o.get("hint", 0) < len(hints):
            extra.append(self.btn("💡 " + hint_steps(st)[o.get("hint", 0)][1], "whint" if w else "hint", ctx[2:] if w else ""))
        if w or self.can_skip(st):
            extra.append(self.btn("⏭ Пропустить", "wskip" if w else "skip", ctx[2:] if w else ""))
        if extra:
            rows.append(extra)
        return rows

    def task_text(self, st, ctx="step"):
        parts = []
        if st.get("tag"):
            parts.append(f"<b>{esc(st['tag'])}</b>")
        elif ctx != "step":
            parts.append("<b>Вопрос на ходу</b> · по желанию")
        lines = self.render_lines(st.get("lines"))
        if lines:
            parts.append(lines)
        if st.get("text"):
            parts.append(inline(st["text"]))
        t = st.get("type")
        if t == "board":
            parts.append(self.board_text())
        elif t in ("ask", "free"):
            ph = st.get("placeholder")
            parts.append("<i>✍️ Ответ — сообщением" + (f" ({esc(ph)})" if ph else "") + "</i>")
        elif t == "choice":
            ops = self.opt_order(st, ctx if ctx != "step" else f"s{self.s['k']}")
            marked = is_marked(st.get("options") or [])
            if any(len(plain(x.get("label"))) > 30 for x in ops):
                parts.append("\n".join(((f"<b>{self.opt_mark(x, i, marked)}.</b> " if self.opt_mark(x, i, marked) else "")
                                        + inline(x.get("label") or x.get("id"))) for i, x in enumerate(ops)))
        elif t == "pick":
            parts.append(f"<i>Выберите {st.get('pick') or 2} карточки доски и нажмите «Проверить».</i>")
        elif t == "strike":
            if "img" in st and (st.get("alt") or st.get("caption")):
                parts.append(f"🖼 <i>{inline(st.get('caption') or st.get('alt'))}</i>")
            parts.append("<i>Отметьте лишнее и нажмите «Проверить».</i>")
        return "\n\n".join(p for p in parts if p)

    def show_step(self):
        s = self.s
        st = self.step()
        if st is None:
            return self.finish_point()
        t = st.get("type")
        if t in TASK_TYPES:
            self.send(self.task_text(st), buttons=self.task_buttons(st, s))
        else:
            self.send(self.task_text(st) or "…", buttons=[[self.btn((st.get("button") or "Дальше") + " ▶", "next")]])

    def ok_text(self, st, r):
        ok = st.get("ok")
        if not ok or (r.get("st") == "skipped" and not st.get("ok_on_skip")):
            return ""
        return self.render_lines(ok) if isinstance(ok, list) else inline(ok)

    def result_text(self, st, r, fx=""):
        head = {"ok": f"✅ <b>Верно</b> · {esc(plain(r.get('text')))}", "revealed": f"🔓 <b>Ответ</b> · {inline(r.get('text'))}",
                "free": "✍️ <b>Записано</b>", "skipped": "⏭ <b>Пропущено</b>"}.get(r.get("st"), "")
        return "\n\n".join(x for x in (head, self.ok_text(st, r), fx) if x)

    def resolve(self, r):
        s, st, n = self.s, self.step(), self.pt()["n"]
        while len(s["res"]) <= s["k"]:
            s["res"].append(None)
        s["res"][s["k"]] = r
        fx = self.effects(st, n)
        self.send(self.result_text(st, r, fx))
        s["k"] += 1
        self.clear_slot(s)
        if s["k"] >= len(self.pt().get("steps") or []):
            return self.finish_point()
        self.enter_step()
        self.show_step()

    def next_step(self):
        st = self.step()
        fx = self.effects(st, self.pt()["n"]) if st else ""
        if fx:
            self.send(fx)
        self.s["k"] += 1
        self.clear_slot(self.s)
        if self.s["k"] >= len(self.pt().get("steps") or []):
            return self.finish_point()
        self.enter_step()
        self.show_step()

    def wrong_text(self, st, given, reply):
        if reply:
            return ("" if st.get("type") in ("pick", "strike") else f"«{esc(given)}» — ") + inline(reply)
        return f"«{esc(given)}» — не подходит. Попробуйте ещё раз" + (" или откройте подсказку." if st.get("hints") else ".")

    def answer(self, text):
        s, st = self.s, self.step()
        text = text.strip()
        lbl = s["k"] + 1
        if st.get("type") == "free":
            if not text:
                return self.send(EMPTY_TEXT, buttons=self.task_buttons(st, s))
            self.log("free", step=lbl, text=text)
            return self.resolve({"st": "free", "text": text})
        if not norm(text):
            return self.send(EMPTY_TEXT, buttons=self.task_buttons(st, s))
        r = check_text(st, text)
        if r.get("ok"):
            self.log("correct", step=lbl, text=text, hints=s["hint"])
            return self.resolve({"st": "ok", "text": text})
        self.log("wrong", step=lbl, text=text, **({"near": True} if r.get("near") else {}))
        self.send(self.wrong_text(st, text, r.get("reply")), buttons=self.task_buttons(st, s))

    def choose(self, j):
        s, st = self.s, self.step()
        ops = st.get("options") or []
        if not 0 <= j < len(ops):
            return
        x = ops[j]
        label = plain(x.get("label")) or str(x.get("id"))
        if str(x.get("id")) in self.right_options(st):
            self.log("correct", step=s["k"] + 1, text=label, hints=s["hint"])
            return self.resolve({"st": "ok", "text": label})
        self.log("wrong", step=s["k"] + 1, text=label, kind_of="choice")
        self.send(self.wrong_text(st, label, x.get("reply")), buttons=self.task_buttons(st, s))

    def toggle(self, i, msg_id=None):
        s, st = self.s, self.step()
        ids = self.pick_list() if st.get("type") == "pick" else [x.get("id") for x in st.get("items") or []]
        if not 0 <= i < len(ids):
            return
        cid = ids[i]
        if cid in s["sel"]:
            s["sel"].remove(cid)
        else:
            if st.get("type") == "pick" and len(s["sel"]) >= (st.get("pick") or 2):
                s["sel"].pop(0)
            s["sel"].append(cid)
        if msg_id:
            tg.call(self.token, "editMessageReplyMarkup",
                    {"chat_id": self.chat_id, "message_id": msg_id, "reply_markup": {"inline_keyboard": self.task_buttons(st, s)}})

    def check_sel(self):
        s, st = self.s, self.step()
        sel = list(s["sel"])
        if st.get("type") == "pick":
            label = " + ".join(plain(self.cards[c].get("title")) if c in self.cards else c for c in sel)
            need = st.get("pick") or 2
            ok = any(sorted(as_lines(a)) == sorted(sel) for a in st.get("answers") or [])
            reply = ""
            for nr in st.get("near") or []:
                if not ok and not reply and sorted(as_lines(nr.get("set"))) == sorted(sel):
                    reply = nr.get("text")
            if not ok and not reply and len(sel) < need:
                reply = f"Выберите {need} карточки."
        else:
            items = st.get("items") or []
            label = ", ".join(plain(it.get("label")) for it in items if it.get("id") in sel)
            miss = [it for it in items if not it.get("keep") and it.get("id") not in sel]
            extra = [it for it in items if it.get("keep") and it.get("id") in sel]
            ok = not miss and not extra
            reply = "" if ok else ((extra[0].get("reply") or "Кое-кого вы вычеркнули зря.") if extra else (miss[0].get("reply") or "Кто-то ещё ушёл с поста."))
        if ok:
            self.log("correct", step=s["k"] + 1, text=label, hints=s["hint"])
            return self.resolve({"st": "ok", "text": label})
        self.log("wrong", step=s["k"] + 1, text=label or "—", kind_of=st.get("type"))
        self.send(self.wrong_text(st, label or "—", reply), buttons=self.task_buttons(st, s))

    def hint(self):
        s, st = self.s, self.step()
        hints = st.get("hints") or []
        if not hints:
            return self.send("Здесь подсказок нет — можно пропустить.", buttons=self.task_buttons(st, s))
        if s["hint"] >= len(hints):
            return self.send(self.task_text(st), buttons=self.task_buttons(st, s))
        lvl = s["hint"]
        s["hint"] = lvl + 1
        name = hint_steps(st)[lvl][0]
        self.log("reveal" if name == "Ответ" else "hint", step=s["k"] + 1, level=lvl + 1)
        self.send(f"💡 <b>{esc(name)}:</b> {inline(hints[lvl])}", buttons=self.task_buttons(st, s))

    def reveal(self):
        hints = self.step().get("hints") or []
        self.resolve({"st": "revealed", "text": hints[-1] if hints else ""})

    def skip(self):
        self.log("skip", step=self.s["k"] + 1)
        self.resolve({"st": "skipped"})

    def finish_point(self):
        s = self.s
        pt = self.pt()
        clue = pt.get("clue")
        if clue:
            s["board"].append({"n": pt["n"], **clue})
            self.send(f"🗂 <b>Улика №{len(s['board'])}</b> · {esc(clue.get('year'))} · буква <b>{esc(clue.get('letter'))}</b>\n"
                      f"<i>{esc(clue.get('who'))}:</i> «{inline(clue.get('says'))}»")
        fx = self.effects(pt, pt["n"])
        if pt.get("letter"):
            s["letter"] = pt["letter"]
        self.log("done")
        outro = self.render_lines(pt.get("outro"), s["p"])
        done = "\n\n".join(x for x in (f"🏁 <b>Точка {pt['n']} пройдена.</b>", fx, outro) if x)
        self.send(done)
        kids = [x if isinstance(x, dict) else {"text": x} for x in as_lines(pt.get("kids"))]
        if kids:
            self.send("🧒 <b>Задание для детей</b> (по желанию)\n\n" + "\n\n".join(
                inline(k.get("text")) + (f"\nОтвет: <tg-spoiler>{inline(k['answer'])}</tg-spoiler>" if k.get("answer") else "") for k in kids))
        fk = pt.get("fork") or {}
        if fk.get("flag") and len(fk.get("options") or []) >= 2:
            s["phase"] = "fork"
            return self.send_fork()
        self.next_point()

    def send_fork(self):
        """Развилка (fork, docs/quest-format.md, 6б): ветку выбирает игрок, выбор — в сохранении (fl) и в журнале."""
        fk = self.pt().get("fork") or {}
        cur = self.flags.get(fk["flag"], "A")
        text = f"🔀 <b>{inline(fk.get('title') or 'Куда дальше?')}</b>" + (f"\n\n{inline(fk['text'])}" if fk.get("text") else "")
        text += "\n\n" + "\n".join(f"<b>{inline(o.get('label'))}</b>" + (f" — {inline(o['note'])}" if o.get("note") else "") for o in fk["options"])
        rows = [[self.btn(("• " if str(o.get("value")) == cur else "") + plain(o.get("label")), "fork", j)] for j, o in enumerate(fk["options"])]
        self.send(text, buttons=rows)

    def choose_fork(self, j):
        s, fk = self.s, self.pt().get("fork") or {}
        ops = fk.get("options") or []
        if not 0 <= j < len(ops):
            return
        s["fl"][fk["flag"]] = str(ops[j].get("value"))
        self.log("fork", flag=fk["flag"], value=s["fl"][fk["flag"]])
        self.prepare(s["fl"])
        self.send(f"Выбрано: <b>{inline(ops[j].get('label'))}</b>.")
        self.next_point()

    def next_point(self):
        s = self.s
        s["p"] += 1
        if s["p"] >= len(self.points):
            return self.finish_quest()
        self.show_walk()

    def finish_quest(self):
        s = self.s
        s["phase"] = "done"
        s["finished"] = True
        s["t_end"] = now().isoformat(timespec="seconds")
        self.effects({"cards": self.q.get("finale_cards")}, 0)
        if (self.q.get("letter") or {}).get("end"):
            s["letter"] = self.q["letter"]["end"]
        self.log("finish")
        for m in as_lines(self.q.get("finale")):
            text = self.render_lines(m)
            if text:
                self.send(text)
        dur = self.duration_str()
        msg = f"🏁 Дело раскрыто. ⏱ Время прохождения: <b>{dur}</b>."
        if self.field:
            msg += ("\n\nПолевой тест окончен. Пришлите голосовое с впечатлениями или нажмите «📝 Заметка» и напишите: "
                    "что было лучшим, где застряли, что скучно. Всё сохраню к итогам теста. Когда закончите — «⏹ Закончить».")
        self.send(msg, reply_kb=True)

    # ---------- вопросы на ходу (по желанию, на прогресс не влияют) ----------

    def wa_slot(self, i):
        while len(self.s["wa"]) <= i:
            self.s["wa"].append({})
        o = self.s["wa"][i]
        o.setdefault("hint", 0)
        o.setdefault("sel", [])
        return o

    def open_wa(self, i):
        was = walk_asks(self.pt())
        if not 0 <= i < len(was):
            return
        w, o = dict(was[i], optional=True), self.wa_slot(i)
        if o.get("res"):
            return self.send("На этот вопрос вы уже ответили.", buttons=self.walk_buttons())
        self.s["wa_open"] = i
        self.send(self.task_text(w, f"w:{i}"), buttons=self.task_buttons(w, o, f"w:{i}"))

    def wa_done(self, i, r):
        w, o = walk_asks(self.pt())[i], self.wa_slot(i)
        o["res"] = r
        self.s["wa_open"] = None
        fx = self.effects(w, self.pt()["n"])
        self.send(self.result_text(dict(w, ok_on_skip=True), r, fx) or "…", buttons=self.walk_buttons())

    def wa_answer(self, i, text):
        w, o = dict(walk_asks(self.pt())[i], optional=True), self.wa_slot(i)
        text = text.strip()
        if w.get("type") == "free":
            self.log("free", step=f"w{i + 1}", text=text)
            return self.wa_done(i, {"st": "free", "text": text})
        if not norm(text):
            return self.send(EMPTY_TEXT, buttons=self.task_buttons(w, o, f"w:{i}"))
        r = check_text(w, text)
        if r.get("ok"):
            self.log("correct", step=f"w{i + 1}", text=text, hints=o["hint"])
            return self.wa_done(i, {"st": "ok", "text": text})
        self.log("wrong", step=f"w{i + 1}", text=text, **({"near": True} if r.get("near") else {}))
        self.send(self.wrong_text(w, text, r.get("reply")), buttons=self.task_buttons(w, o, f"w:{i}"))

    def wa_choose(self, i, j):
        w, o = dict(walk_asks(self.pt())[i], optional=True), self.wa_slot(i)
        ops = w.get("options") or []
        if not 0 <= j < len(ops):
            return
        label = plain(ops[j].get("label")) or str(ops[j].get("id"))
        if str(ops[j].get("id")) in self.right_options(w):
            self.log("correct", step=f"w{i + 1}", text=label, hints=o["hint"])
            return self.wa_done(i, {"st": "ok", "text": label})
        self.log("wrong", step=f"w{i + 1}", text=label, kind_of="choice")
        self.send(self.wrong_text(w, label, ops[j].get("reply")), buttons=self.task_buttons(w, o, f"w:{i}"))

    def wa_hint(self, i):
        w, o = dict(walk_asks(self.pt())[i], optional=True), self.wa_slot(i)
        hints = w.get("hints") or []
        if o["hint"] >= len(hints):
            return
        lvl = o["hint"]
        o["hint"] = lvl + 1
        name = hint_steps(w)[lvl][0]
        self.log("reveal" if name == "Ответ" else "hint", step=f"w{i + 1}", level=lvl + 1)
        self.send(f"💡 <b>{esc(name)}:</b> {inline(hints[lvl])}", buttons=self.task_buttons(w, o, f"w:{i}"))

    # ---------- доска ----------

    def board_text(self):
        s, out = self.s, []
        if self.q.get("letter") and s.get("letter"):
            out.append(self.letter_html(s["letter"]))
        ids = [c["id"] for c in s["cards"] if c["id"] in self.cards]
        vers = [c for c in ids if self.cards[c].get("kind") == "version"]
        live = [c for c in vers if not s["struck"].get(c)]
        dead = [c for c in vers if s["struck"].get(c)]
        clues = [c for c in ids if c not in vers]
        if live:
            out.append("<b>Версии</b>\n" + "\n\n".join(self.card_html(c) for c in reversed(live)))
        if clues:
            out.append("<b>Улики</b>\n" + "\n\n".join(self.card_html(c) for c in reversed(clues)))
        if dead:
            out.append("<b>Отпали</b>\n" + "\n".join(f"<s>{inline(self.cards[c].get('title'))}</s>" for c in dead))
        b = s["board"]
        if b:
            rows = "\n".join(f"{esc(c.get('year'))} · <b>{esc(c.get('letter'))}</b> — {esc(c.get('who'))}" for c in b)
            letters = " ".join(esc(c.get("letter")) for c in b)
            out.append(f"🗂 <b>Доска улик</b> (в порядке находок)\n{rows}\n\nБуквы: <code>{letters}</code>")
        if not out:
            return "🗂 " + (inline(self.q.get("board_empty")) if self.q.get("board_empty") else "Доска улик пока пуста.")
        return "🗂 <b>Доска улик</b>\n\n" + "\n\n".join(out)

    def repeat(self):
        s = self.s
        if s["phase"] == "walk":
            if s.get("wa_open") is not None:
                return self.open_wa(s["wa_open"])
            self.send_walk()
        elif s["phase"] == "step":
            self.show_step()
        elif s["phase"] == "fork":
            self.send_fork()
        elif s["phase"] == "done":
            self.send("Квест пройден! /quest — начать заново.")
        else:
            self.send("Квест ещё не начат. /quest — начать.")

    # ---------- полевые заметки ----------

    def save_note(self, text, kind="note", tail=""):
        self.log(kind, text=text)
        n = self.cur_point_n()
        where = f"к точке {n}" if n else "в общий список"
        self.send(f"📝 Сохранил {where}." + tail)

    def save_file(self, file_id, ext, caption, kind):
        r = tg.call(self.token, "getFile", {"file_id": file_id})
        if not r.get("ok"):
            self.send("Не смог скачать файл. Попробуйте ещё раз.")
            return
        path = r["result"]["file_path"]
        self.s["files"] += 1
        n = self.cur_point_n() or 0
        name = f"{n:02d}-{self.s['files']:03d}{ext}"
        self.field_dir.mkdir(parents=True, exist_ok=True)
        url = f"https://api.telegram.org/file/bot{self.token}/{path}"
        with urllib.request.urlopen(url, timeout=60) as resp:
            (self.field_dir / name).write_bytes(resp.read())
        self.log(kind, file=name, text=caption or "")
        label = {"photo": "📸 Фото", "voice": "🎙 Голосовое", "video": "🎬 Видео"}.get(kind, "📎 Файл")
        where = f"к точке {n}" if n else "в общий список"
        self.send(f"{label} сохранил {where}.")

    # ---------- журнал ----------

    def render_log(self):
        s = self.s
        out = [f"# Полевой тест: {plain(self.q['title'])} — {self.day}", "",
               f"Версия квеста: {self.q.get('version')}. Начало: {s.get('t_start') or '—'}. "
               f"Конец: {s.get('t_end') or 'не закончен'}. Длительность: {self.duration_str()}.", ""]
        forks = [e for e in s["events"] if e["kind"] == "fork"]
        if forks:
            out += ["Развилка: " + ", ".join(f"{e.get('flag')} = {e.get('value')}" for e in forks) + ".", ""]
        # тайминг по точкам
        arrive, done, walk = {}, {}, {}
        for e in s["events"]:
            if e["kind"] == "walk":
                walk.setdefault(e["point"], e["t"])
            if e["kind"] == "arrive":
                arrive.setdefault(e["point"], e["t"])
            if e["kind"] == "done":
                done[e["point"]] = e["t"]
        out += ["## Тайминг", "", "| Точка | Вышли к точке | На месте | Закончили | Подсказок | Ошибок | Пропусков |", "|---|---|---|---|---|---|---|"]
        for pt in self.points:
            n = pt["n"]
            ev = [e for e in s["events"] if e.get("point") == n]
            out.append(f"| {n}. {plain(pt['title'])} | {walk.get(n, '—')} | {arrive.get(n, '—')} | {done.get(n, '—')} | "
                       f"{sum(1 for e in ev if e['kind'] in ('hint', 'reveal'))} | {sum(1 for e in ev if e['kind'] == 'wrong')} | "
                       f"{sum(1 for e in ev if e['kind'] == 'skip')} |")
        out += ["", "## Заметки, фото и голосовые", ""]
        any_note = False
        for e in s["events"]:
            if e["kind"] in ("note", "photo", "voice", "video", "location", "file"):
                any_note = True
                p = f"точка {e['point']}" if e.get("point") else "общее"
                body = html.unescape(e.get("text") or "")
                if e.get("file"):
                    f = e["file"]
                    link = f"![{f}]({f})" if f.endswith(".jpg") else f"[{f}]({f})"
                    body = f"{link} {body}".strip()
                out.append(f"- **{e['t']}** · {p} · {e['kind']}: {body}")
        if not any_note:
            out.append("_пока нет_")
        out += ["", "## Ответы игроков", ""]
        for e in s["events"]:
            if e["kind"] in ("correct", "wrong", "free"):
                mark = {"correct": "✅", "wrong": "❌", "free": "✍️"}[e["kind"]]
                out.append(f"- {e['t']} · точка {e['point']}, шаг {e['step']}: {mark} «{e['text']}»")
        return "\n".join(out) + "\n"

    def duration_str(self):
        if not self.s.get("t_start"):
            return "—"
        a = datetime.datetime.fromisoformat(self.s["t_start"])
        b = datetime.datetime.fromisoformat(self.s["t_end"]) if self.s.get("t_end") else now()
        m = int((b - a).total_seconds() // 60)
        return f"{m // 60} ч {m % 60:02d} мин"

    # ---------- git ----------

    def commit(self, final=False):
        if not self.commit_on or not self.dirty:
            return
        try:
            subprocess.run(["git", "add", "-A", "quests", ".telegram", "DIRECTIVES.md"], cwd=ROOT, check=True)
            if subprocess.run(["git", "diff", "--cached", "--quiet"], cwd=ROOT).returncode == 0:
                self.dirty = False
                return
            msg = "Полевой тест: итог" if final else "Полевой тест: заметки"
            subprocess.run(["git", "commit", "-q", "-m", msg], cwd=ROOT, check=True)
            for _ in range(3):
                if subprocess.run(["git", "pull", "-q", "--rebase"], cwd=ROOT).returncode == 0 and \
                        subprocess.run(["git", "push", "-q"], cwd=ROOT).returncode == 0:
                    break
                time.sleep(5)
            self.dirty = False
            self.last_commit = time.time()
        except subprocess.CalledProcessError as e:
            print(f"::warning::git: {e}")

    # ---------- обработка входящих ----------

    FINAL = {"here", "next", "hint", "reveal", "skip", "opt", "chk", "fork", "wopt", "whint", "wskip", "wrev"}

    def handle_callback(self, cq):
        tg.call(self.token, "answerCallbackQuery", {"callback_query_id": cq["id"]})
        msg = cq.get("message") or {}
        if str((msg.get("chat") or {}).get("id")) != self.chat_id:
            return
        try:
            parts = cq.get("data", "").split("|", 3)
            action, p, k = parts[0], int(parts[1]), int(parts[2])
            arg = parts[3] if len(parts) > 3 else ""
        except (ValueError, IndexError):
            return
        s = self.s
        if p != s["p"] or k != s["k"]:
            return  # устаревшая кнопка
        if action in self.FINAL:
            # убираем кнопки у нажатого сообщения (выбор карточек и «Вопрос на ходу» их оставляют)
            tg.call(self.token, "editMessageReplyMarkup",
                    {"chat_id": self.chat_id, "message_id": msg.get("message_id"), "reply_markup": {"inline_keyboard": []}})
        st = self.step() if s["phase"] == "step" else None
        try:
            if action == "here" and s["phase"] == "walk":
                self.arrive()
            elif action == "next" and st and st.get("type") not in TASK_TYPES:
                self.next_step()
            elif action == "hint" and st:
                self.hint()
            elif action == "reveal" and st and self.revealed(st, s):
                self.reveal()
            elif action == "skip" and st and self.can_skip(st):
                self.skip()
            elif action == "opt" and st and st.get("type") == "choice":
                self.choose(int(arg))
            elif action == "sel" and st and st.get("type") in ("pick", "strike"):
                self.toggle(int(arg), msg.get("message_id"))
            elif action == "chk" and st and st.get("type") in ("pick", "strike"):
                self.check_sel()
            elif action == "fork" and s["phase"] == "fork":
                self.choose_fork(int(arg))
            elif action == "clk" and s["phase"] == "walk" and arg in self.clock:
                c = s["clk"].setdefault(str(s["p"]), {})
                c[arg] = {"v": "closed" if self.flag(arg, s["p"]) == "open" else "open", "by": "hand"}
                self.log("clock", key=arg, value=c[arg]["v"])
                self.send_walk()
            elif s["phase"] == "walk" and action in ("wa", "wopt", "whint", "wskip", "wrev"):
                i = int(arg.split(":")[0])
                if not 0 <= i < len(walk_asks(self.pt())) or (self.wa_slot(i).get("res") and action != "wa"):
                    return
                if action == "wa":
                    self.open_wa(i)
                elif action == "wopt":
                    self.wa_choose(i, int(arg.split(":")[1]))
                elif action == "whint":
                    self.wa_hint(i)
                elif action == "wskip":
                    self.log("skip", step=f"w{i + 1}")
                    self.wa_done(i, {"st": "skipped"})
                elif action == "wrev":
                    hints = walk_asks(self.pt())[i].get("hints") or []
                    self.wa_done(i, {"st": "revealed", "text": hints[-1] if hints else ""})
        except ValueError:
            return

    def handle_message(self, msg):
        s = self.s
        if msg.get("photo"):
            return self.save_file(msg["photo"][-1]["file_id"], ".jpg", msg.get("caption"), "photo")
        if msg.get("voice"):
            return self.save_file(msg["voice"]["file_id"], ".ogg", msg.get("caption"), "voice")
        if msg.get("video_note"):
            return self.save_file(msg["video_note"]["file_id"], ".mp4", "", "video")
        if msg.get("video"):
            return self.save_file(msg["video"]["file_id"], ".mp4", msg.get("caption"), "video")
        if msg.get("document"):
            d = msg["document"]
            ext = pathlib.Path(d.get("file_name") or "").suffix or ".bin"
            return self.save_file(d["file_id"], ext, msg.get("caption"), "file")
        if msg.get("location"):
            loc = msg["location"]
            self.log("location", text=f"{loc['latitude']:.5f}, {loc['longitude']:.5f}")
            return self.send("📍 Геометку сохранил.")

        text = (msg.get("text") or "").strip()
        if not text:
            return
        cmd = text.split()[0].split("@")[0].lower()

        if s["await_note"]:
            s["await_note"] = False
            return self.save_note(text)
        if text == KB_NOTE:
            s["await_note"] = True
            return self.send("Пишите заметку — следующее сообщение сохраню как есть.")
        if text == KB_BOARD or cmd == "/board":
            return self.send(self.board_text())
        if text == KB_REPEAT or cmd == "/where":
            return self.repeat()
        if text == KB_STOP or cmd == "/stop":
            self.log("stop")
            self.send("⏹ Бот выключается, прогресс сохранён. Чтобы продолжить — снова запустите «Квест — прохождение» в GitHub Actions.")
            self.stop = True
            return
        if cmd in ("/quest", "/start"):
            if s["phase"] in ("idle", "done"):
                return self.start_quest()
            self.send(f"Продолжаем с точки {self.pt()['n']}.", reply_kb=True)
            return self.repeat()
        if cmd == "/restart":
            return self.start_quest()
        if telegram_inbox.is_run(text):
            telegram_inbox.record_directive(msg.get("date", time.time()), "Принудительный запуск итерации (из бота квеста): " + text)
            self.save()
            self.commit()
            ok, info = fire_team.fire("Принудительный запуск из Telegram (во время работы бота квеста)")
            return self.send(info)
        low = text.lower()
        if low.startswith(("команде:", "команде ", "/team")):
            body = text.split(maxsplit=1)[1] if len(text.split(maxsplit=1)) > 1 else ""
            telegram_inbox.record_directive(msg.get("date", time.time()), body)
            self.dirty = True
            return self.send("📨 Передал команде — учтут в следующей итерации.")
        if cmd == "/help":
            return self.send("/quest — начать или продолжить\n/restart — начать заново\n"
                             "🗂 Улики · 📝 Заметка · 🔁 Повторить · ⏹ Закончить\n"
                             "Фото, голосовые и геометки сохраняются к текущей точке.\n"
                             "«команде: …» — передать указание команде прямо во время квеста. /run — запустить команду.")
        if text.startswith(("!", "#")) and norm(text):
            return self.save_note(text.lstrip("!# "))

        if s["phase"] == "step":
            st = self.step()
            if st and st.get("type") in ("ask", "free"):
                return self.answer(text)
            if st and st.get("type") in ("choice", "pick", "strike"):
                return self.save_note(text, tail=" Чтобы ответить на вопрос, нажмите кнопку под ним.")
        if s["phase"] == "walk" and s.get("wa_open") is not None:
            i = s["wa_open"]
            was = walk_asks(self.pt())
            if i < len(was) and was[i].get("type", "ask") in ("ask", "free") and not self.wa_slot(i).get("res"):
                return self.wa_answer(i, text)
        # всё остальное — заметка (на шагах без вопроса, по дороге, после финала)
        if s["phase"] in ("walk", "step", "fork"):
            return self.save_note(text)
        # квест не идёт или уже закончен — это указание команде, а не заметка
        telegram_inbox.record_directive(msg.get("date", time.time()), text)
        self.dirty = True
        self.send("📨 Записал как указание команде. Чтобы начать квест, отправьте /quest.")

    def handle_update(self, u):
        self.offset = max(self.offset, u["update_id"] + 1)
        try:
            if "callback_query" in u:
                self.last_activity = time.time()
                self.handle_callback(u["callback_query"])
            elif "message" in u:
                m = u["message"]
                if str((m.get("chat") or {}).get("id")) != self.chat_id:
                    return
                self.last_activity = time.time()
                self.handle_message(m)
        except Exception as e:  # бот не должен падать посреди квеста
            print(f"::error::{type(e).__name__}: {e}")
            self.send("Что-то пошло не так, но прогресс цел. Нажмите «🔁 Повторить».")
        self.save()

    # ---------- главный цикл ----------

    def greet(self):
        s = self.s
        if s["phase"] in ("walk", "step", "fork"):
            self.send(f"🕊 Бот квеста снова на связи. {self.ver_note or ''}".strip()
                      + ("" if self.ver_note else f" Продолжаем с точки {self.pt()['n']}."), reply_kb=True)
            self.repeat()
        else:
            self.send(f"🕊 Бот квеста «<b>{inline(self.q.get('title'))}</b>» на связи"
                      + (" (режим полевого теста)" if self.field else "") + ".\n\nОтправьте /quest, чтобы начать.",
                      reply_kb=True)

    def run(self):
        self.greet()
        while not self.stop:
            if time.time() - self.started > DURATION:
                self.send("⏳ Время сессии бота вышло, прогресс сохранён. Чтобы продолжить — запустите «Квест — прохождение» ещё раз.")
                break
            if time.time() - self.last_activity > IDLE:
                self.send("💤 Долго тишина — бот засыпает, прогресс сохранён. Чтобы продолжить — запустите «Квест — прохождение» ещё раз.")
                break
            r = tg.call(self.token, "getUpdates", {"offset": self.offset, "timeout": 50,
                                                    "allowed_updates": ["message", "callback_query"]})
            if not r.get("ok"):
                print(f"::warning::getUpdates: {r.get('description')}")
                time.sleep(5)
                continue
            for u in r.get("result", []):
                self.handle_update(u)
                if self.stop:
                    break
            if time.time() - self.last_commit > COMMIT_EVERY:
                self.commit()
        self.save()
        self.commit(final=True)


if __name__ == "__main__":
    Bot().run()

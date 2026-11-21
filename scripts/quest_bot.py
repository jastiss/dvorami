"""Живой Telegram-бот, который ведёт квест. Запускается в GitHub Actions на несколько часов.

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
"""

import datetime
import html
import json
import os
import pathlib
import re
import subprocess
import sys
import time
import urllib.request
from zoneinfo import ZoneInfo

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import tg  # noqa: E402

ROOT = pathlib.Path(__file__).resolve().parent.parent
MSK = ZoneInfo("Europe/Moscow")
QUEST_ID = os.environ.get("QUEST", "zilart")
QUEST_FILE = ROOT / "quests" / QUEST_ID / "quest.json"
STATE_FILE = ROOT / ".telegram" / f"quest-{QUEST_ID}-state.json"
OFFSET_FILE = ROOT / ".telegram" / "offset"
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


def now():
    return datetime.datetime.now(MSK)


def ts():
    return now().strftime("%H:%M:%S")


def norm(s):
    s = s.lower().replace("ё", "е")
    s = s.replace("→", " ").replace("->", " ").replace("-", " ")
    s = re.sub(r"[^\w\s]", " ", s)
    return re.sub(r"\s+", " ", s).strip()


def matches(text, answers):
    t = norm(text)
    if not t:
        return False
    tokens = t.split()
    for a in answers:
        if a.startswith("~"):
            if norm(a[1:]) and norm(a[1:]) in t:
                return True
            continue
        na = norm(a)
        if not na:
            continue
        if t == na:
            return True
        at = na.split()
        # ответ целиком встречается в сообщении как последовательность слов: «это ржавчина»
        for i in range(len(tokens) - len(at) + 1):
            if tokens[i:i + len(at)] == at:
                # однобуквенные ответы засчитываем только если сообщение короткое
                if len(na) > 1 or len(tokens) <= 2:
                    return True
    return False


class Bot:
    def __init__(self):
        self.token, self.chat_id = tg.env()
        self.q = json.loads(QUEST_FILE.read_text(encoding="utf-8"))
        self.points = self.q["points"]
        self.day = now().strftime("%Y-%m-%d")
        self.field_dir = ROOT / "quests" / QUEST_ID / "field" / self.day
        self.offset = self._read_offset()
        self.started = time.time()
        self.last_activity = time.time()
        self.last_commit = time.time()
        self.dirty = False
        self.stop = False
        self.s = self._load_state()

    # ---------- состояние ----------

    def _read_offset(self):
        try:
            return int(OFFSET_FILE.read_text().strip())
        except (FileNotFoundError, ValueError):
            return 0

    def _fresh(self):
        return {
            "quest": QUEST_ID, "version": self.q.get("version"), "day": self.day,
            "phase": "idle",  # idle → intro → walk → step → done
            "p": 0, "k": 0, "hint": 0, "await_note": False,
            "board": [], "events": [], "files": 0, "finished": False,
            "t_start": None, "t_end": None,
        }

    def _load_state(self):
        if STATE_FILE.exists() and not RESTART:
            try:
                s = json.loads(STATE_FILE.read_text(encoding="utf-8"))
                if s.get("quest") == QUEST_ID and not s.get("finished"):
                    return s
            except ValueError:
                pass
        return self._fresh()

    def save(self):
        STATE_FILE.parent.mkdir(exist_ok=True)
        STATE_FILE.write_text(json.dumps(self.s, ensure_ascii=False, indent=1), encoding="utf-8")
        OFFSET_FILE.write_text(f"{self.offset}\n")
        if FIELD and self.s["events"]:
            self.field_dir.mkdir(parents=True, exist_ok=True)
            (self.field_dir / "log.md").write_text(self.render_log(), encoding="utf-8")
        self.dirty = True

    def log(self, kind, **kw):
        e = {"t": ts(), "kind": kind, "point": self.cur_point_n()}
        e.update(kw)
        self.s["events"].append(e)

    def cur_point_n(self):
        if self.s["phase"] in ("walk", "step") and self.s["p"] < len(self.points):
            return self.points[self.s["p"]]["n"]
        return None

    # ---------- отправка ----------

    def send(self, text, buttons=None, reply_kb=False):
        params = {"chat_id": self.chat_id, "text": text, "parse_mode": "HTML", "disable_web_page_preview": True}
        if buttons:
            params["reply_markup"] = {"inline_keyboard": buttons}
        elif reply_kb:
            params["reply_markup"] = REPLY_KB
        r = tg.call(self.token, "sendMessage", params)
        if not r.get("ok"):
            params.pop("parse_mode")
            params["text"] = re.sub(r"<[^>]+>", "", text)
            r = tg.call(self.token, "sendMessage", params)
        return r

    def btn(self, label, action):
        # к действию добавляем «где мы», чтобы старые кнопки не срабатывали
        return {"text": label, "callback_data": f"{action}|{self.s['p']}|{self.s['k']}"}

    # ---------- ход квеста ----------

    def start_quest(self):
        s = self.s
        s.update(self._fresh())
        s["phase"] = "intro"
        s["t_start"] = now().isoformat(timespec="seconds")
        self.log("start")
        for m in self.q["intro"]:
            self.send(m, reply_kb=True)
        self.show_walk()

    def show_walk(self):
        s = self.s
        s["phase"] = "walk"
        s["k"] = 0
        s["hint"] = 0
        pt = self.points[s["p"]]
        link = f"https://yandex.ru/maps/?pt={pt['lon']},{pt['lat']}&z=18&l=map"
        text = (f"📍 <b>Точка {pt['n']} из {len(self.points)}. {html.escape(pt['title'])}</b>\n"
                f"{html.escape(pt['place'])}\n\n{pt['walk']}\n\n<a href=\"{link}\">Открыть на Яндекс Картах</a>")
        self.send(text, buttons=[[self.btn("📍 Мы на месте", "here")]])
        if FIELD and pt.get("check"):
            items = "\n".join(f"• {html.escape(c)}" for c in pt["check"])
            self.send(f"🔎 <b>Полевой тест — проверьте на месте:</b>\n{items}\n\n"
                      f"Фото и голосовые просто присылайте сюда — сохраню к точке {pt['n']}.")
        self.log("walk")

    def arrive(self):
        s = self.s
        pt = self.points[s["p"]]
        s["phase"] = "step"
        s["k"] = 0
        self.log("arrive")
        self.send(pt["scene"])
        self.show_step()

    def show_step(self):
        s = self.s
        pt = self.points[s["p"]]
        if s["k"] >= len(pt["steps"]):
            return self.finish_point()
        st = pt["steps"][s["k"]]
        s["hint"] = 0
        t = st["type"]
        if t in ("info", "board"):
            text = st["text"]
            if t == "board":
                text += "\n\n" + self.board_text()
            self.send(text, buttons=[[self.btn("Дальше ▶", "next")]])
        else:
            buttons = [[self.btn("💡 Подсказка", "hint")]]
            if t == "ask":
                buttons[0].append(self.btn("⏭ Пропустить", "skip"))
            self.send(st["text"], buttons=buttons)

    def next_step(self):
        self.s["k"] += 1
        self.show_step()

    def answer(self, text):
        s = self.s
        pt = self.points[s["p"]]
        st = pt["steps"][s["k"]]
        if st["type"] == "free":
            self.log("free", step=s["k"] + 1, text=text)
            if st.get("ok"):
                self.send(f"✅ {st['ok']}")
            return self.next_step()
        if matches(text, st.get("answers", [])):
            self.log("correct", step=s["k"] + 1, text=text, hints=s["hint"])
            if st.get("ok"):
                self.send(f"✅ {st['ok']}")
            return self.next_step()
        self.log("wrong", step=s["k"] + 1, text=text)
        self.send("Не то. Попробуйте ещё — или возьмите 💡 подсказку.",
                  buttons=[[self.btn("💡 Подсказка", "hint"), self.btn("⏭ Пропустить", "skip")]])

    def hint(self):
        s = self.s
        st = self.points[s["p"]]["steps"][s["k"]]
        hints = st.get("hints") or []
        if not hints:
            self.send("Здесь подсказок нет — любой ответ подойдёт.")
            return
        lvl = min(s["hint"], len(hints) - 1)
        s["hint"] = lvl + 1
        self.log("hint", step=s["k"] + 1, level=lvl + 1)
        last = s["hint"] >= len(hints)
        label = "Ответ" if last else f"Подсказка {lvl + 1} из {len(hints)}"
        if last:
            self.send(f"💡 <b>{label}:</b> {hints[lvl]}", buttons=[[self.btn("Дальше ▶", "reveal")]])
        else:
            self.send(f"💡 <b>{label}:</b> {hints[lvl]}",
                      buttons=[[self.btn("💡 Ещё подсказка", "hint"), self.btn("⏭ Пропустить", "skip")]])

    def reveal(self):
        st = self.points[self.s["p"]]["steps"][self.s["k"]]
        if st.get("ok"):
            self.send(f"✅ {st['ok']}")
        self.next_step()

    def skip(self):
        s = self.s
        st = self.points[s["p"]]["steps"][s["k"]]
        self.log("skip", step=s["k"] + 1)
        hints = st.get("hints") or []
        if hints and not st.get("optional"):
            self.send(f"⏭ Пропускаем. Ответ: {hints[-1]}")
        else:
            self.send("⏭ Пропускаем.")
        self.next_step()

    def finish_point(self):
        s = self.s
        pt = self.points[s["p"]]
        clue = pt.get("clue")
        if clue:
            s["board"].append({"n": pt["n"], **clue})
            self.send(f"🗂 <b>Улика №{len(s['board'])}</b> · {clue['year']} · буква <b>{clue['letter']}</b>\n"
                      f"<i>{html.escape(clue['who'])}:</i> «{html.escape(clue['says'])}»")
        self.log("done")
        if pt.get("outro"):
            self.send(pt["outro"])
        s["p"] += 1
        if s["p"] >= len(self.points):
            return self.finish_quest()
        self.show_walk()

    def finish_quest(self):
        s = self.s
        s["phase"] = "done"
        s["finished"] = True
        s["t_end"] = now().isoformat(timespec="seconds")
        self.log("finish")
        for m in self.q.get("finale", []):
            self.send(m)
        dur = self.duration_str()
        msg = f"⏱ Время прохождения: <b>{dur}</b>."
        if FIELD:
            msg += ("\n\nПолевой тест окончен. Пришлите голосовое или текст с впечатлениями: "
                    "что было лучшим, где застряли, что скучно. Всё сохраню. Когда закончите — кнопка «⏹ Закончить».")
        self.send(msg, reply_kb=True)

    def duration_str(self):
        if not self.s.get("t_start"):
            return "—"
        a = datetime.datetime.fromisoformat(self.s["t_start"])
        b = datetime.datetime.fromisoformat(self.s["t_end"]) if self.s.get("t_end") else now()
        m = int((b - a).total_seconds() // 60)
        return f"{m // 60} ч {m % 60:02d} мин"

    def board_text(self):
        b = self.s["board"]
        if not b:
            return "🗂 Доска улик пока пуста."
        rows = "\n".join(f"{c['year']} · <b>{c['letter']}</b> — {html.escape(c['who'])}" for c in b)
        letters = " ".join(c["letter"] for c in b)
        return f"🗂 <b>Доска улик</b> (в порядке находок)\n{rows}\n\nБуквы: <code>{letters}</code>"

    def repeat(self):
        s = self.s
        if s["phase"] == "walk":
            self.show_walk()
        elif s["phase"] == "step":
            self.show_step()
        elif s["phase"] == "done":
            self.send("Квест пройден! /quest — начать заново.")
        else:
            self.send("Квест ещё не начат. /quest — начать.")

    # ---------- полевые заметки ----------

    def save_note(self, text, kind="note"):
        self.log(kind, text=text)
        n = self.cur_point_n()
        where = f"к точке {n}" if n else "в общий список"
        self.send(f"📝 Сохранил {where}.")

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
        out = [f"# Полевой тест: {self.q['title']} — {self.day}", "",
               f"Версия квеста: {self.q.get('version')}. Начало: {s.get('t_start') or '—'}. "
               f"Конец: {s.get('t_end') or 'не закончен'}. Длительность: {self.duration_str()}.", ""]
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
            out.append(f"| {n}. {pt['title']} | {walk.get(n, '—')} | {arrive.get(n, '—')} | {done.get(n, '—')} | "
                       f"{sum(1 for e in ev if e['kind'] == 'hint')} | {sum(1 for e in ev if e['kind'] == 'wrong')} | "
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

    # ---------- git ----------

    def commit(self, final=False):
        if not COMMIT or not self.dirty:
            return
        try:
            subprocess.run(["git", "add", "-A", "quests", ".telegram"], cwd=ROOT, check=True)
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

    def handle_callback(self, cq):
        tg.call(self.token, "answerCallbackQuery", {"callback_query_id": cq["id"]})
        msg = cq.get("message") or {}
        if str((msg.get("chat") or {}).get("id")) != self.chat_id:
            return
        # убираем кнопки у нажатого сообщения
        tg.call(self.token, "editMessageReplyMarkup",
                {"chat_id": self.chat_id, "message_id": msg.get("message_id"), "reply_markup": {"inline_keyboard": []}})
        try:
            action, p, k = cq.get("data", "").split("|")
            p, k = int(p), int(k)
        except ValueError:
            return
        s = self.s
        if p != s["p"] or k != s["k"]:
            return  # устаревшая кнопка
        if action == "here" and s["phase"] == "walk":
            self.arrive()
        elif action == "next" and s["phase"] == "step":
            self.next_step()
        elif action == "hint" and s["phase"] == "step":
            self.hint()
        elif action == "reveal" and s["phase"] == "step":
            self.reveal()
        elif action == "skip" and s["phase"] == "step":
            self.skip()

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
            self.send(f"Продолжаем с точки {self.points[s['p']]['n']}.", reply_kb=True)
            return self.repeat()
        if cmd == "/restart":
            return self.start_quest()
        if cmd == "/help":
            return self.send("/quest — начать или продолжить\n/restart — начать заново\n"
                             "🗂 Улики · 📝 Заметка · 🔁 Повторить · ⏹ Закончить\n"
                             "Фото, голосовые и геометки сохраняются автоматически.")
        if text.startswith(("!", "#")):
            return self.save_note(text.lstrip("!# "))

        if s["phase"] == "step":
            st = self.points[s["p"]]["steps"][s["k"]]
            if st["type"] in ("ask", "free"):
                return self.answer(text)
        # всё остальное — заметка (на шагах без вопроса, по дороге, после финала)
        if s["phase"] in ("walk", "step", "done"):
            return self.save_note(text)
        self.send("Чтобы начать квест, отправьте /quest")

    # ---------- главный цикл ----------

    def run(self):
        s = self.s
        if s["phase"] in ("walk", "step"):
            self.send(f"🕊 Бот квеста снова на связи. Продолжаем с точки {self.points[s['p']]['n']}.", reply_kb=True)
            self.repeat()
        else:
            self.send("🕊 Бот квеста «<b>Дело о Синей птице</b>» на связи"
                      + (" (режим полевого теста)" if FIELD else "") + ".\n\nОтправьте /quest, чтобы начать.",
                      reply_kb=True)
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
                self.offset = max(self.offset, u["update_id"] + 1)
                try:
                    if "callback_query" in u:
                        self.last_activity = time.time()
                        self.handle_callback(u["callback_query"])
                    elif "message" in u:
                        m = u["message"]
                        if str((m.get("chat") or {}).get("id")) != self.chat_id:
                            continue
                        self.last_activity = time.time()
                        self.handle_message(m)
                except Exception as e:  # бот не должен падать посреди квеста
                    print(f"::error::{type(e).__name__}: {e}")
                    self.send("Что-то пошло не так, но прогресс цел. Нажмите «🔁 Повторить».")
                self.save()
                if self.stop:
                    break
            if time.time() - self.last_commit > COMMIT_EVERY:
                self.commit()
        self.save()
        self.commit(final=True)


if __name__ == "__main__":
    Bot().run()

"""Тесты бота-ведущего квеста (scripts/quest_bot.py) без сети: Telegram API подменён, в Telegram ничего не уходит.

Главный тест — прохождение «вслепую»: водитель видит только сообщения и кнопки бота (как игрок) и отвечает по данным
quests/<id>/quest.json — правильными ответами (эталон, как scripts/answer_check.js), а перед ними неверными: пустой ответ
из одних знаков, «банан», часть ответа из частей (all), неверный вариант, неверный набор карточек. Неверное не засчитывается,
верное ведёт дальше, дело доходит до финала. ЗИЛАРТ — в двух наборах веток (и после срока «Самосвала», ночью — ЗУМ закрыт),
Коломенское — обе ветки развилки. Запуск: python3 scripts/test_quest_bot.py
"""

import datetime
import html.parser
import json
import os
import pathlib
import re
import sys
import tempfile
import unittest
from unittest import mock
from zoneinfo import ZoneInfo

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
os.environ.setdefault("TELEGRAM_BOT_TOKEN", "TEST:TOKEN")
os.environ.setdefault("TELEGRAM_CHAT_ID", "4242")
import tg  # noqa: E402
import quest_bot as qb  # noqa: E402

ROOT = pathlib.Path(__file__).resolve().parent.parent
MSK = ZoneInfo("Europe/Moscow")
CHAT = os.environ["TELEGRAM_CHAT_ID"]
FIXTURE = str(ROOT / "scripts" / "fixtures" / "quest-format5.json")
TG_TAGS = {"b", "strong", "i", "em", "u", "ins", "s", "strike", "del", "code", "pre", "a", "tg-spoiler", "blockquote"}


class HtmlCheck(html.parser.HTMLParser):
    """Разметка, которую примет Telegram: только его теги, закрыты по порядку."""

    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.stack, self.errors = [], []

    def handle_starttag(self, tag, attrs):
        if tag not in TG_TAGS:
            self.errors.append(f"тег <{tag}> Telegram не понимает")
        self.stack.append(tag)

    def handle_endtag(self, tag):
        if not self.stack or self.stack[-1] != tag:
            self.errors.append(f"</{tag}> не по порядку ({self.stack})")
        else:
            self.stack.pop()


class FakeTelegram:
    """Подменяет tg.call: копит сообщения бота с кнопками, правит кнопки по editMessageReplyMarkup."""

    def __init__(self):
        self.msgs = {}      # message_id → {"text", "kb"}
        self.order = []
        self.calls = []
        self.html_errors = []
        self.uid = 0
        self.queue = []

    def call(self, token, method, params, timeout=None):
        self.calls.append((method, json.loads(json.dumps(params))))
        if method == "sendMessage":
            assert str(params["chat_id"]) == CHAT
            mid = len(self.order) + 1
            kb = ((params.get("reply_markup") or {}).get("inline_keyboard")) or []
            self.msgs[mid] = {"text": params["text"], "kb": kb}
            self.order.append(mid)
            if len(params["text"]) > 4096:
                self.html_errors.append(f"сообщение длиннее 4096: {len(params['text'])}")
            if params.get("parse_mode") == "HTML":
                p = HtmlCheck()
                p.feed(params["text"])
                p.close()
                if p.stack:
                    p.errors.append(f"не закрыты {p.stack}")
                self.html_errors += [f"{e} — «{params['text'][:80]}»" for e in p.errors]
            return {"ok": True, "result": {"message_id": mid}}
        if method == "getUpdates":
            res = [u for u in self.queue if u["update_id"] >= params.get("offset", 0)]
            self.queue = []
            return {"ok": True, "result": res}
        if method == "editMessageReplyMarkup":
            m = self.msgs.get(params.get("message_id"))
            if m is not None:
                m["kb"] = params["reply_markup"].get("inline_keyboard") or []
        return {"ok": True, "result": True}

    # что видит игрок
    def texts(self, since=0):
        return [self.msgs[i]["text"] for i in self.order[since:]]

    def last_text(self):
        return self.msgs[self.order[-1]]["text"] if self.order else ""

    def current(self):
        """Последнее сообщение с кнопками — на него игрок и нажимает."""
        for mid in reversed(self.order):
            if self.msgs[mid]["kb"]:
                return mid, self.msgs[mid]
        return None, None

    def buttons(self):
        _, m = self.current()
        return [b for row in (m or {}).get("kb", []) for b in row]


class Player:
    """Игрок у телефона: пишет текстом и нажимает кнопки последнего сообщения."""

    def __init__(self, bot, fake):
        self.bot, self.fake = bot, fake

    def _upd(self, body):
        self.fake.uid += 1
        self.bot.handle_update(dict({"update_id": self.fake.uid}, **body))

    def say(self, text):
        self._upd({"message": {"message_id": self.fake.uid, "chat": {"id": int(CHAT)}, "date": 0, "text": text}})

    def press(self, test, what=""):
        mid, m = self.fake.current()
        hits = [b for row in (m or {}).get("kb", []) for b in row if test(b)]
        if not hits:
            raise AssertionError(f"нет кнопки {what}: {[b['text'] for b in self.fake.buttons()]} — «{(m or {}).get('text', '')[:200]}»")
        self.press_data(hits[0]["callback_data"], mid)

    def press_data(self, data, mid=1):
        self._upd({"callback_query": {"id": "cb", "data": data, "message": {"message_id": mid, "chat": {"id": int(CHAT)}}}})

    def act(self, action, label=None):
        return self.press(lambda b: b["callback_data"].split("|")[0] == action and (label is None or label in b["text"]),
                          f"{action} {label or ''}".strip())


# ---------- независимая модель дела: что игрок должен пройти (ветки — как в плеере) ----------

def plain(s):
    return re.sub(r"<[^>]+>", "", str(s or "")).strip()


def model(qid, flags, today, data=None):
    raw = json.loads(pathlib.Path(data or ROOT / "quests" / qid / "quest.json").read_text(encoding="utf-8"))
    f = {k: str(v) for k, v in (raw.get("flags") or {}).items()}
    side = ROOT / "quests" / qid / "temporary.json"
    if side.exists() and not data:
        for t in json.loads(side.read_text(encoding="utf-8")).get("items") or []:
            if t.get("flag") and str(t.get("until")) < today:
                k, v = re.split(r"[:=]", t["flag"])
                f[k.strip()] = v.strip()
    f.update(flags)
    clock = set((raw.get("clock") or {}).keys())

    def ok(c):
        if not c:
            return True
        if isinstance(c, str):
            m = re.match(r"^\s*([\w-]+)\s*(!?=)\s*(.+?)\s*$", c)
            if not m or m.group(1) in clock:
                return True
            hit = f.get(m.group(1), "A") in [x.strip() for x in m.group(3).split("|")]
            return hit if m.group(2) == "=" else not hit
        return all(f.get(k, "A") in [str(x) for x in (v if isinstance(v, list) else [v])] for k, v in c.items())

    def prune(x):
        if isinstance(x, list):
            return [prune(e) for e in x if not (isinstance(e, dict) and not ok(e.get("if")))]
        if isinstance(x, dict):
            return {k: prune(v) for k, v in x.items()}
        return x
    return prune(raw), f, raw


def strip(a):
    return a[1:] if a.startswith("~") else a


def group(g):
    return g if isinstance(g, list) else g.get("answers") or []


def etalon(st):
    if st.get("answers"):
        return strip(next((a for a in st["answers"] if not a.startswith("~")), st["answers"][0]))
    return " и ".join(strip(next((a for a in group(g) if not a.startswith("~")), group(g)[0])) for g in st["all"])


def walk_ask_of(p):
    w = p.get("walk_ask")
    return [] if not w else (w if isinstance(w, list) else [w])


def right_ids(st, flags):
    f = st.get("answer_flag") and flags.get(st["answer_flag"])
    if f and any(str(x["id"]) == f for x in st.get("options") or []):
        return [f]
    a = st.get("answer") or st.get("answers")
    return [str(x) for x in (a if isinstance(a, list) else [a])]


class QuestBotTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.fake = FakeTelegram()
        self.patch = mock.patch.object(tg, "call", self.fake.call)
        self.patch.start()
        self.addCleanup(self.patch.stop)
        self.addCleanup(self.tmp.cleanup)

    def make(self, qid, flags="", when=datetime.datetime(2026, 12, 5, 12, 0, tzinfo=MSK), restart=True, data=None):
        bot = qb.Bot(quest_id=qid, state_dir=self.tmp.name, field=False, commit=False, restart=restart,
                     flags=flags, clock=lambda: when, data=data)
        return bot, Player(bot, self.fake)

    def advanced(self, bot, before):
        return (bot.s["phase"], bot.s["p"], bot.s["k"]) != before

    def where(self, bot):
        return (bot.s["phase"], bot.s["p"], bot.s["k"])

    # ---------- прохождение вслепую ----------

    def play(self, qid, flags=None, fork=None, when=datetime.datetime(2026, 12, 5, 12, 0, tzinfo=MSK), data=None):
        flags = flags or {}
        bot, pl = self.make(qid, ",".join(f"{k}:{v}" for k, v in flags.items()), when, data=data)
        q, f, raw = model(qid, dict(flags, **(fork or {})), when.strftime("%Y-%m-%d"), data)
        stats = {"ask": 0, "all": 0, "choice": 0, "pick": 0, "strike": 0, "free": 0, "say": 0, "walk_ask": 0, "reveal": 0, "clock": 0}
        pl.say("/quest")
        wa_done = False
        for pi, p in enumerate(q["points"]):
            at = f"{qid} т.{p['n']}"
            _, cur = self.fake.current()
            # число точек — по текущим веткам бота: до развилки он показывает ветку по умолчанию, как плеер
            self.assertIn(f"Точка {p['n']} из {len(bot.points)}", cur["text"], at + ": нет экрана дороги")
            self.assertEqual(bot.s["phase"], "walk", at)
            # ветка по часам: кнопка переключает текст дороги (ЗУМ открыт/закрыт) и запоминается
            if any(b["callback_data"].startswith("clk|") for b in self.fake.buttons()):
                k0 = next(iter(bot.s["clk"][str(bot.s["p"])]))
                v0 = bot.s["clk"][str(bot.s["p"])][k0]["v"]
                pl.act("clk")
                self.assertNotEqual(bot.s["clk"][str(bot.s["p"])][k0]["v"], v0, at + ": кнопка часов не переключила ветку")
                pl.act("clk")
                self.assertEqual(bot.s["clk"][str(bot.s["p"])][k0]["v"], v0)
                stats["clock"] += 1
            # вопрос на ходу — один раз за дело: неверно, потом верно; на прогресс не влияет
            was = [w for w in (p.get("walk_ask") if isinstance(p.get("walk_ask"), list) else [p["walk_ask"]] if p.get("walk_ask") else [])]
            if was and not wa_done and was[0].get("type", "ask") == "ask":
                pl.act("wa")
                before = self.where(bot)
                pl.say("банан")
                self.assertFalse(bot.s["wa"][0].get("res"), at + ": вопрос на ходу принял неверный ответ")
                pl.say(etalon(was[0]))
                self.assertEqual((bot.s["wa"][0].get("res") or {}).get("st"), "ok", at + ": вопрос на ходу не принял эталон")
                self.assertEqual(self.where(bot), before, at + ": вопрос на ходу сдвинул прогресс")
                self.assertIn("Верно", self.fake.texts()[-1])
                wa_done = True
                stats["walk_ask"] += 1
            pl.act("here")
            self.assertEqual(bot.s["phase"], "step", at)
            for si, st in enumerate(p.get("steps") or []):
                sat = f"{at} шаг {si + 1} ({st.get('type')})"
                self.assertEqual((bot.s["p"], bot.s["k"]), (pi, si), sat + ": бот не на этом шаге")
                t = st.get("type")
                before = self.where(bot)
                if t in (None, "info", "say", "board"):
                    pl.act("next")
                    stats["say"] += 1
                elif t == "ask":
                    # пустой ответ из одних знаков — подсказка «Впишите ответ», не ошибка
                    n0 = len(bot.s["events"])
                    pl.say("?!…")
                    self.assertEqual(self.where(bot), before, sat + ": ответ из одних знаков сдвинул шаг")
                    self.assertEqual(self.fake.last_text(), qb.EMPTY_TEXT, sat)
                    self.assertFalse([e for e in bot.s["events"][n0:] if e["kind"] == "wrong"], sat + ": пустой ответ записан ошибкой")
                    pl.say("банан")
                    self.assertEqual(self.where(bot), before, sat + ": принят неверный ответ")
                    self.assertTrue(any(x in self.fake.last_text() for x in ("не подходит", "Почти")) or bot.s["events"][-1]["kind"] == "wrong", sat)
                    if st.get("all"):
                        # часть ответа из частей — «чего не хватает», шаг не засчитан; затем весь ответ — дальше
                        for gi, g in enumerate(st["all"]):
                            part = strip(next((a for a in group(g) if not a.startswith("~")), group(g)[0]))
                            pl.say(part)
                            self.assertEqual(self.where(bot), before, sat + f": засчитана одна часть №{gi + 1}")
                            other = st["all"][1 - gi] if len(st["all"]) == 2 else None
                            if isinstance(other, dict) and other.get("missing"):
                                self.assertIn(plain(other["missing"])[:20], plain(self.fake.last_text()), sat + ": нет «чего не хватает»")
                        stats["all"] += 1
                    if stats["ask"] % 4 == 2 and st.get("hints") and not st.get("all"):
                        # путь через подсказки: по одной, последняя — ответ, «Дальше»
                        for h in range(len(st["hints"])):
                            self.assertEqual(bot.s["hint"], h, sat)
                            pl.act("hint")
                        pl.act("reveal")
                        stats["reveal"] += 1
                    else:
                        n0 = len(self.fake.order)
                        pl.say(etalon(st))
                        self.assertTrue(any("Верно" in x for x in self.fake.texts(n0)), sat + ": нет «Верно» на эталон")
                    stats["ask"] += 1
                elif t == "free":
                    pl.say("Мой ответ: дом с часами")
                    stats["free"] += 1
                elif t == "choice":
                    right = right_ids(st, f)
                    labels = {str(x["id"]): plain(x.get("label")) or str(x["id"]) for x in st["options"]}
                    wrong = [i for i in labels if i not in right]
                    if wrong:
                        pl.press(lambda b, lb=labels[wrong[0]]: b["callback_data"].startswith("opt|") and lb[:60] in b["text"], "неверный вариант")
                        self.assertEqual(self.where(bot), before, sat + ": принят неверный вариант")
                    pl.press(lambda b, lb=labels[right[0]]: b["callback_data"].startswith("opt|") and b["text"].endswith(lb[:60]), "верный вариант")
                    stats["choice"] += 1
                elif t == "pick":
                    titles = {c["id"]: plain(bot.cards[c["id"]]["title"]) for c in bot.s["cards"]}
                    good = [list(a) for a in st["answers"]][0]
                    bad = [c for c in titles if c not in good and bot.cards[c].get("kind") != "version"][:2]
                    for c in bad:
                        pl.press(lambda b, lb=titles[c]: b["callback_data"].startswith("sel|") and lb[:50] in b["text"], "карточка")
                    if len(bad) == (st.get("pick") or 2):
                        pl.act("chk")
                        self.assertEqual(self.where(bot), before, sat + ": принят неверный набор карточек")
                    for c in good:
                        pl.press(lambda b, lb=titles[c]: b["callback_data"].startswith("sel|") and lb[:50] in b["text"], "карточка")
                    pl.act("chk")
                    stats["pick"] += 1
                elif t == "strike":
                    keep = [it for it in st["items"] if it.get("keep")]
                    drop = [it for it in st["items"] if not it.get("keep")]
                    if keep:
                        pl.press(lambda b, lb=plain(keep[0]["label"]): b["callback_data"].startswith("sel|") and b["text"].endswith(lb[:50]), "пункт")
                        pl.act("chk")
                        self.assertEqual(self.where(bot), before, sat + ": вычеркнуто лишнее, а засчитано")
                        pl.press(lambda b, lb=plain(keep[0]["label"]): b["callback_data"].startswith("sel|") and b["text"].endswith(lb[:50]), "пункт")
                    for it in drop:
                        pl.press(lambda b, lb=plain(it["label"]): b["callback_data"].startswith("sel|") and b["text"].endswith(lb[:50]), "пункт")
                    pl.act("chk")
                    stats["strike"] += 1
                else:
                    self.fail(f"{sat}: тип шага, которого нет в тесте")
                self.assertTrue(self.advanced(bot, before), sat + ": верный ответ не продвинул бота")
            fk = p.get("fork") or {}
            if fk.get("flag"):
                self.assertEqual(bot.s["phase"], "fork", at + ": нет развилки")
                want = (fork or {}).get(fk["flag"], f.get(fk["flag"], "A"))
                lb = plain(next(o["label"] for o in fk["options"] if str(o["value"]) == want))
                pl.press(lambda b: b["callback_data"].startswith("fork|") and b["text"].endswith(lb), "развилка")
                self.assertEqual(bot.s["fl"].get(fk["flag"]), want)
        self.assertEqual(bot.s["phase"], "done", f"{qid}: дело не дошло до финала")
        self.assertTrue(bot.s["finished"])
        self.assertIn("Дело раскрыто", self.fake.last_text())
        self.assertEqual(len([e for e in bot.s["events"] if e["kind"] == "done"]), len(q["points"]))
        self.assertFalse(self.fake.html_errors, "\n".join(self.fake.html_errors[:10]))
        return bot, stats

    def test_zilart_blind(self):
        bot, st = self.play("zilart")
        for k in ("ask", "choice", "pick", "strike", "say", "walk_ask", "reveal"):
            self.assertGreater(st[k], 0, f"ЗИЛАРТ: не встретился шаг {k}")
        self.assertGreater(st["clock"], 0, "ЗИЛАРТ: нет кнопки «по часам» (ЗУМ)")

    def test_zilart_other_branches_after_samosval_at_night(self):
        alt = {"st1": "B", "st2": "A2", "st3": "B", "st4": "B", "st5": "B", "st6": "B", "st10": "A", "st10h": "B", "stE": "A",
               "f_golosov": "A", "f_kand": "A", "f_ginz": "A", "f_obs": "B", "f_towers": "A", "st4c": "B", "st4v": "A"}
        bot, st = self.play("zilart", alt, when=datetime.datetime(2027, 1, 20, 23, 10, tzinfo=MSK))
        self.assertGreater(st["free"], 0, "ЗИЛАРТ, ветка A2: не встретился свободный ответ (free)")
        self.assertEqual(bot.flags.get("st4s"), "B", "после срока «Самосвала» флаг st4s не переключён на ветку Б")
        self.assertTrue(all(v["zum"]["v"] == "closed" for v in bot.s["clk"].values() if "zum" in v), "в 23:10 ЗУМ не закрыт")

    def test_kolomenskoe_blind_both_forks(self):
        for v in ("A", "B"):
            with self.subTest(ext=v):
                self.fake.__init__()
                bot, st = self.play("kolomenskoe", fork={"ext": v})
                self.assertGreater(st["all"], 0, "Коломенское: не встретился ответ из частей (all)")
                self.assertEqual(len(bot.points), 9 if v == "B" else 8)

    def test_kolomenskoe_all_step(self):
        """Шаг /points/6/steps/0 Коломенского (ответ из частей) — проходится текстом в боте, а не только подсказкой."""
        raw = json.loads((ROOT / "quests" / "kolomenskoe" / "quest.json").read_text(encoding="utf-8"))
        st = raw["points"][6]["steps"][0]
        self.assertTrue(st.get("all"), "в Коломенском на точке 7 больше нет ответа из частей — поправьте тест")
        bot, pl = self.make("kolomenskoe")
        bot.s.update(phase="step", p=6, k=0)
        part = strip(group(st["all"][0])[0])
        pl.say(part)
        self.assertEqual(bot.s["k"], 0, "одна часть ответа засчитана")
        pl.say(etalon(st))
        self.assertEqual(bot.s["res"][0]["st"], "ok", "весь ответ из частей не засчитан")

    # ---------- мелочи ----------

    def test_stale_button_ignored(self):
        bot, pl = self.make("zilart")
        pl.say("/quest")
        mid, _ = self.fake.current()
        old = next(b["callback_data"] for b in self.fake.buttons() if b["callback_data"].startswith("here|"))
        pl.press_data(old, mid)
        k0 = self.where(bot)
        pl.press_data(old, mid)
        self.assertEqual(self.where(bot), k0, "старая кнопка сработала второй раз")

    def test_old_state_format3_migrates(self):
        state = pathlib.Path(self.tmp.name) / "quest-zilart-state.json"
        state.write_text(json.dumps({"quest": "zilart", "version": "3.0-field", "phase": "walk", "p": 4, "k": 0, "hint": 0,
                                     "await_note": False, "board": [], "events": [], "files": 0, "finished": False,
                                     "t_start": "2026-11-21T10:00:00+03:00", "t_end": None}), encoding="utf-8")
        bot, pl = self.make("zilart", restart=False)
        self.assertEqual(bot.s["p"], 4)
        self.assertIn("Сценарий обновился", bot.ver_note)
        bot.greet()
        self.assertIn("Точка 5", self.fake.last_text())
        self.assertFalse(self.fake.html_errors, self.fake.html_errors)

    def test_board_and_letter(self):
        bot, pl = self.make("zilart")
        pl.say("/quest")
        pl.say(qb.KB_BOARD)
        self.assertIn("пуста", self.fake.last_text(), "в начале дела доска не пустая")
        bot, _ = self.play("zilart")
        Player(bot, self.fake).say(qb.KB_BOARD)
        board = self.fake.last_text()
        for part in ("Доска улик", "✉️", "Улики", "Отпали"):
            self.assertIn(part, board, f"на доске в конце дела нет «{part}»")
        self.assertFalse(self.fake.html_errors, self.fake.html_errors)

    def test_format5_fixture_blind(self):
        """Все возможности формата 5 (scripts/fixtures/quest-format5.json) — в обеих ветках t1."""
        for t1 in ("A", "B"):
            with self.subTest(t1=t1):
                self.fake.__init__()
                bot, st = self.play("zilart", {"t1": t1}, data=FIXTURE)
                for k in ("ask", "choice", "pick", "strike", "free", "say", "walk_ask"):
                    self.assertGreater(st[k], 0, f"фикстура: не встретился шаг {k}")

    def test_walk_ask_hints_skip_repeat_and_notes(self):
        bot, pl = self.make("zilart", data=FIXTURE)
        pl.say("/quest")
        while not [w for w in walk_ask_of(bot.pt()) if w.get("hints")]:
            bot.s["p"] += 1
            bot.show_walk()
        i = next(j for j, w in enumerate(walk_ask_of(bot.pt())) if w.get("hints"))
        w = walk_ask_of(bot.pt())[i]
        pl.act("wa", "Вопрос на ходу" + (f" {i + 1}" if len(walk_ask_of(bot.pt())) > 1 else ""))
        for h in range(len(w["hints"])):
            pl.act("whint")
        pl.act("wrev")
        self.assertEqual(bot.s["wa"][i]["res"]["st"], "revealed")
        self.assertTrue(any(b["callback_data"].startswith("here|") for b in self.fake.buttons()), "после вопроса на ходу нет «Мы на месте»")
        pl.say("заметка по дороге")
        self.assertIn("Сохранил к точке", self.fake.last_text())
        pl.say(qb.KB_REPEAT)
        self.assertIn(f"Точка {bot.pt()['n']}", self.fake.last_text())
        j = next(j for j, x in enumerate(walk_ask_of(bot.pt())) if not bot.s["wa"][j].get("res"))
        pl.act("wa")
        pl.act("wskip")
        self.assertEqual(bot.s["wa"][j]["res"]["st"], "skipped")
        pl.act("here")
        pl.say(qb.KB_REPEAT)
        self.assertEqual(bot.s["phase"], "step")
        self.assertFalse(self.fake.html_errors, self.fake.html_errors)

    def test_run_loop_offline(self):
        bot, pl = self.make("kolomenskoe")
        for t in ("/quest", qb.KB_STOP):
            self.fake.uid += 1
            self.fake.queue.append({"update_id": self.fake.uid, "message": {"message_id": self.fake.uid, "chat": {"id": int(CHAT)}, "date": 0, "text": t}})
        bot.run()
        self.assertTrue(bot.stop)
        self.assertEqual(bot.s["phase"], "walk")
        self.assertIn("Бот выключается", self.fake.last_text())
        self.assertTrue((pathlib.Path(self.tmp.name) / "quest-kolomenskoe-state.json").exists())

    def test_inline_markup(self):
        self.assertEqual(qb.inline("A & B <b>жирно</b> <script>x</script>"), "A &amp; B <b>жирно</b> &lt;script&gt;x&lt;/script&gt;")
        self.assertEqual(qb.inline('<a href="javascript:alert(1)">ссылка</a>'), "ссылка")
        self.assertEqual(qb.inline('<a href="https://example.org/x">ссылка</a>'), '<a href="https://example.org/x">ссылка</a>')


if __name__ == "__main__":
    unittest.main(verbosity=1)

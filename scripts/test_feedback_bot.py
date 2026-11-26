"""Тесты игрового бота без сети: HTTP к Telegram подменён. Запуск: python3 scripts/test_feedback_bot.py"""

import json
import os
import pathlib
import sys
import tempfile
import unittest
from unittest import mock

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import feedback_bot as fb  # noqa: E402

PLAYER = "PLAYER:TOKEN"
OWNER = "OWNER:TOKEN"
OWNER_CHAT = "999"
USER = 555000111


class FakeTelegram:
    """Подменяет tg.call: отдаёт очередь апдейтов и записывает исходящие."""

    def __init__(self):
        self.queue = []
        self.calls = []
        self.uid = 0

    def call(self, token, method, params, timeout=None):
        self.calls.append((token, method, json.loads(json.dumps(params))))
        if method == "getUpdates":
            res = [u for u in self.queue if u["update_id"] >= params.get("offset", 0)]
            self.queue = []
            return {"ok": True, "result": res}
        return {"ok": True, "result": {"message_id": len(self.calls)}}

    def _next(self):
        self.uid += 1
        return self.uid

    def text(self, text, user=USER, chat_type="private"):
        self.queue.append({"update_id": self._next(), "message": {
            "message_id": self.uid, "from": {"id": user, "first_name": "Анна"},
            "chat": {"id": user, "type": chat_type}, "text": text}})

    def press(self, data, user=USER):
        self.queue.append({"update_id": self._next(), "callback_query": {
            "id": f"cb{self.uid}", "from": {"id": user, "first_name": "Анна"}, "data": data,
            "message": {"message_id": 1, "chat": {"id": user, "type": "private"}}}})

    # что видел игрок / владелец
    def sent(self, token=PLAYER, chat=USER):
        return [p for t, m, p in self.calls if t == token and m == "sendMessage" and str(p["chat_id"]) == str(chat)]

    def owner_msgs(self):
        return self.sent(OWNER, OWNER_CHAT)

    def last_buttons(self):
        for p in reversed(self.sent()):
            if "reply_markup" in p:
                return [b.get("callback_data") or "url:" + b["url"] for row in p["reply_markup"]["inline_keyboard"] for b in row]
        return []


class FeedbackBotTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        root = pathlib.Path(self.tmp.name)
        self.patches = [
            mock.patch.object(fb, "FEEDBACK_DIR", root / "feedback"),
            mock.patch.object(fb, "STATE_FILE", root / ".telegram" / "feedback-state.json"),
            mock.patch.object(fb, "OFFSET_FILE", root / ".telegram" / "feedback-offset"),
        ]
        for p in self.patches:
            p.start()
        self.root = root
        self.tg = FakeTelegram()
        self.call_patch = mock.patch.object(fb.tg, "call", self.tg.call)
        self.call_patch.start()

    def tearDown(self):
        self.call_patch.stop()
        for p in self.patches:
            p.stop()
        self.tmp.cleanup()

    def step(self):
        """Один запуск workflow: новый процесс бота читает состояние с диска."""
        fb.Bot(PLAYER, OWNER, OWNER_CHAT).run(0)

    def records(self):
        files = list((self.root / "feedback").glob("*.jsonl"))
        out = []
        for f in files:
            out += [json.loads(ln) for ln in f.read_text(encoding="utf-8").splitlines() if ln]
        return out

    def press_button(self, prefix):
        data = next(b for b in self.tg.last_buttons() if b.startswith(prefix))
        self.tg.press(data)

    # ---------- меню ----------

    def test_menu_on_plain_start(self):
        self.tg.text("/start")
        self.step()
        self.assertIn("Здравствуйте", self.tg.sent()[-1]["text"])
        self.assertEqual(self.tg.last_buttons(), ["m|cases|0", "m|how|0", "m|review|0", "m|suggest|0", "m|help|0"])
        self.tg.press("m|suggest|0")
        self.step()
        self.assertIn("Какое место", self.tg.sent()[-1]["text"])

    def test_every_menu_button_answers(self):
        for key, expect in (("cases", "Дела в Москве"), ("how", "Как это работает"), ("help", "Помощь"),
                            ("menu", "Здравствуйте"), ("question", "Напишите вопрос")):
            self.tg.press(f"m|{key}|0")
            self.step()
            self.assertIn(expect, self.tg.sent()[-1]["text"], key)
        answered = [p["callback_query_id"] for t, m, p in self.tg.calls if m == "answerCallbackQuery"]
        self.assertEqual(len(answered), 5)   # каждое нажатие подтверждено — кнопки не «висят»

    def test_callback_answered_even_on_garbage(self):
        self.tg.press("мусор")
        self.step()
        self.assertEqual([m for t, m, p in self.tg.calls].count("answerCallbackQuery"), 1)

    def test_stale_button_without_dialog_shows_menu(self):
        self.tg.press("r|5|42")   # кнопка из диалога, которого уже нет (например, состояние потерялось)
        self.step()
        [ans] = [p for t, m, p in self.tg.calls if m == "answerCallbackQuery"]
        self.assertIn("прошлого разговора", ans["text"])
        self.assertIn("Здравствуйте", self.tg.sent()[-1]["text"])

    def test_deep_links_open_screens(self):
        for arg, expect in (("cases", "Дела в Москве"), ("how", "Как это работает"), ("help", "Помощь"),
                            ("question", "Напишите вопрос"), ("suggest", "Какое место"), ("непонятно", "Здравствуйте")):
            self.tg.text(f"/start {arg}")
            self.step()
            self.assertIn(expect, self.tg.sent()[-1]["text"], arg)

    def test_links_go_to_target_site_not_stand(self):
        self.assertEqual(fb.SITE, "https://dvorami.ru/")
        self.tg.text("/start cases")
        self.step()
        urls = [b[4:] for b in self.tg.last_buttons() if b.startswith("url:")]
        self.assertEqual(len(urls), len(fb.CASES) + 1)
        self.assertTrue(all(u.startswith("https://dvorami.ru/moscow/") for u in urls), urls)
        src = pathlib.Path(fb.__file__).read_text(encoding="utf-8")
        self.assertNotIn("github.io", src)
        for c in fb.CASES:   # каждая ссылка — на существующую страницу дела
            self.assertTrue((fb.ROOT / "site" / "moscow" / c["slug"] / "index.html").exists(), c["slug"])

    def test_commands_registered_with_owner_test(self):
        fb.Bot(PLAYER, OWNER, OWNER_CHAT).setup()
        calls = [p for t, m, p in self.tg.calls if m == "setMyCommands"]
        self.assertEqual(len(calls), 2)
        self.assertNotIn("test", [c["command"] for c in calls[0]["commands"]])
        self.assertIn("test", [c["command"] for c in calls[1]["commands"]])
        self.assertEqual(calls[1]["scope"], {"type": "chat", "chat_id": OWNER_CHAT})

    # ---------- финал и отзыв ----------

    def test_done_deeplink_confirmed_review(self):
        self.tg.text("/start done_zilart")
        self.step()
        ask = self.tg.sent()[-1]["text"]
        self.assertIn("поздравляем", ask)
        self.assertIn("Синей птице", ask)
        self.assertNotIn("r|", " ".join(b for b in self.tg.last_buttons() if b.startswith("np|")))
        self.assertFalse(any(b.startswith("np|") for b in self.tg.last_buttons()))
        self.press_button("r|5.")
        self.step()
        self.press_button("skip|liked|")
        self.step()
        self.press_button("skip|unclear|")
        self.step()
        self.press_button("q|0|")
        self.step()
        [rec] = self.records()
        self.assertEqual((rec["quest"], rec["rating"], rec["confirmed"]), ("zilart", 5, True))

    def test_unconfirmed_review_is_neutral(self):
        for arg in ("review", "review-zilart"):
            self.tg.text(f"/start {arg}")
            self.step()
            ask = self.tg.sent()[-1]["text"].lower()
            self.assertNotIn("спасибо, что прошли", ask)
            self.assertNotIn("поздравляем", ask)
            self.assertNotIn("закрыто", ask)
            self.assertTrue(any(b.startswith("np|") for b in self.tg.last_buttons()))
        self.assertFalse(any("спасибо, что прошли" in v.lower() for v in fb.T.values()))

    def test_not_played_turns_into_message_to_team(self):
        self.tg.text("/start review")
        self.step()
        self.press_button("np|")
        self.step()
        self.assertIn("передадим команде", self.tg.sent()[-1]["text"])
        self.tg.text("Ещё не ходили, а с собакой можно?")
        self.step()
        self.press_button("skip|contact|")
        self.step()
        [rec] = self.records()
        self.assertEqual(rec["kind"], "question")
        self.assertNotIn("rating", rec)
        [note] = self.tg.owner_msgs()
        self.assertIn("собакой", note["text"])

    # ---------- отзыв ----------

    def test_review_low_rating_full_flow(self):
        self.tg.text("/start review-zilart")
        self.step()
        self.assertIn("от 1 до 5", self.tg.sent()[-1]["text"])
        self.tg.text("сложно сказать")  # текст вместо кнопки, но не оценка
        self.step()
        self.assertIn("кнопок", self.tg.sent()[-1]["text"])
        self.press_button("r|2.")
        self.step()
        self.tg.text("Дворы и загадки")
        self.step()
        self.tg.text("Застряли на <третьей> точке")
        self.step()
        self.press_button("q|1|")
        self.step()
        self.assertIn("подписать", self.tg.sent()[-1]["text"])
        self.tg.text("Анна, Москва")
        self.step()
        self.assertIn(fb.CHANNEL, self.tg.sent()[-1]["text"])

        [rec] = self.records()
        self.assertEqual(rec["kind"], "review")
        self.assertEqual(rec["quest"], "zilart")
        self.assertFalse(rec["confirmed"])
        self.assertEqual(rec["rating"], 2)
        self.assertEqual(rec["liked"], "Дворы и загадки")
        self.assertTrue(rec["quote"])
        self.assertEqual(rec["signature"], "Анна, Москва")
        self.assertTrue(rec["complete"])
        # без персональных данных
        raw = json.dumps(rec, ensure_ascii=False)
        self.assertNotIn(str(USER), raw)
        self.assertNotIn("first_name", raw)
        self.assertEqual(len(rec["user"]), 16)
        # низкая оценка — сразу владельцу, HTML экранирован
        [note] = self.tg.owner_msgs()
        self.assertIn("2/5", note["text"])
        self.assertIn("&lt;третьей&gt;", note["text"])
        # диалог закрыт
        state = json.loads((self.root / ".telegram" / "feedback-state.json").read_text())
        self.assertEqual(state["dialogs"], {})

    def test_review_high_rating_skips_and_no_owner_ping(self):
        self.tg.text("/start review")
        self.step()
        self.press_button("r|5.")
        self.step()
        self.press_button("skip|liked|")
        self.step()
        self.press_button("skip|unclear|")
        self.step()
        self.press_button("q|0|")
        self.step()
        [rec] = self.records()
        self.assertEqual((rec["rating"], rec["liked"], rec["quote"]), (5, "", False))
        self.assertNotIn("signature", rec)
        self.assertEqual(self.tg.owner_msgs(), [])

    def test_stale_button_ignored(self):
        self.tg.text("/start review")
        self.step()
        old = self.tg.last_buttons()[0]  # r|1.…|<sid>
        self.tg.text("/start suggest")  # ушёл в другой разговор — оценка из старого сообщения его не ломает
        self.step()
        self.tg.press(old)
        self.step()
        state = json.loads((self.root / ".telegram" / "feedback-state.json").read_text())
        [d] = state["dialogs"].values()
        self.assertEqual((d["flow"], d["step"]), ("suggest", "where"))
        [ans] = [p for t, m, p in self.tg.calls if m == "answerCallbackQuery"]
        self.assertIn("прошлого разговора", ans["text"])

    # ---------- баг 25.11: «Не могу поставить оценку после квеста в боте» ----------

    def finish_review(self):
        for prefix in ("skip|liked|", "skip|unclear|", "q|0|"):
            self.press_button(prefix)
            self.step()

    def test_rating_from_first_prompt_after_second_deeplink(self):
        """Игрок нажал «Оценить квест» в плеере, бот не ответил сразу (задание GitHub ещё не стартовало),
        нажал ещё раз — пришли два сообщения «Дело закрыто». Оценка в первом раньше давала только
        «кнопка из прошлого разговора»: оценить было нельзя. На старом коде этот тест красный."""
        self.tg.text("/start done_zilart")
        self.tg.text("/start done_zilart")
        self.step()
        prompts = [p for p in self.tg.sent() if "поздравляем" in p["text"]]
        self.assertEqual(len(prompts), 2)
        first = prompts[0]["reply_markup"]["inline_keyboard"][0][4]["callback_data"]  # «5» в первом сообщении
        self.tg.press(first)
        self.step()
        self.assertIn("понравилось", self.tg.sent()[-1]["text"])
        self.finish_review()
        [rec] = self.records()
        self.assertEqual((rec["quest"], rec["rating"], rec["confirmed"]), ("zilart", 5, True))

    def test_rating_typed_as_text(self):
        self.tg.text("/start done_zilart")
        self.step()
        self.tg.text("5")
        self.step()
        self.assertIn("понравилось", self.tg.sent()[-1]["text"])
        self.finish_review()
        [rec] = self.records()
        self.assertEqual(rec["rating"], 5)

    def test_rating_button_after_dialog_expired(self):
        """Диалог истёк (сутки без ответа, бот был недоступен) — кнопка оценки всё равно работает: дело в кнопке."""
        self.tg.text("/start done_zilart")
        self.step()
        btn = next(b for b in self.tg.last_buttons() if b.startswith("r|4."))
        with mock.patch.object(fb, "now", return_value=fb.time.time() + fb.EXPIRE + 60):
            self.step()   # sweep: диалог без оценки забыт
            self.assertEqual(json.loads((self.root / ".telegram" / "feedback-state.json").read_text())["dialogs"], {})
            self.tg.press(btn)
            self.step()
            self.assertIn("понравилось", self.tg.sent()[-1]["text"])
            self.finish_review()
        [rec] = self.records()
        self.assertEqual((rec["quest"], rec["rating"], rec["confirmed"]), ("zilart", 4, True))

    def test_deeplink_variants_from_player(self):
        """Плеер шлёт done_<id квеста> (data-quest); slug страницы и дефис тоже работают."""
        for arg in ("done_zilart", "done-zilart", "done_zilart-sinyaya-ptica"):
            self.tg.text(f"/start {arg}")
            self.step()
            self.assertIn("Синей птице", self.tg.sent()[-1]["text"], arg)
            self.assertTrue(any(b.startswith("r|5.zilart.1|") for b in self.tg.last_buttons()), arg)
        player = pathlib.Path(fb.ROOT, "site", "play", "player.js").read_text(encoding="utf-8")
        self.assertIn("botLink('done_' + QID + (v >= 1 && v <= 5 ? '_' + v : ''))", player)  # H-47
        self.assertIn("var BOT = 'dvorami_bot'", player)

    def test_rating_from_player_link_not_asked_again(self):
        """H-47: оценка со звёзд финала приходит в ссылке (done_<дело>_<1–5>) — бот не спрашивает её
        повторно, сразу благодарит и просит текст; запись — с этой оценкой и подтверждённым финалом."""
        for arg, n in (("done_zilart_4", 4), ("done-zilart-2", 2), ("done_zilart-sinyaya-ptica_5", 5)):
            self.tg.text(f"/start {arg}")
            self.step()
            msg = self.tg.sent()[-1]["text"]
            self.assertIn("поздравляем", msg, arg)
            self.assertIn(f"Спасибо за оценку: {'⭐' * n} {n} из 5", msg, arg)
            self.assertIn("понравилось", msg, arg)
            self.assertNotIn("от 1 до 5", msg, arg)
            self.assertFalse(any(b.startswith("r|") for b in self.tg.last_buttons()), arg)
            self.assertEqual(self.tg.last_buttons()[0][:11], "skip|liked|", arg)
            self.tg.text("Понравился кот-обманщик")
            self.step()
            self.assertIn("непонятно", self.tg.sent()[-1]["text"])
            self.press_button("skip|unclear|")
            self.step()
            self.press_button("q|0|")
            self.step()
        recs = self.records()
        self.assertEqual([(r["quest"], r["rating"], r["confirmed"], r.get("liked")) for r in recs],
                         [("zilart", n, True, "Понравился кот-обманщик") for n in (4, 2, 5)])
        low = [m["text"] for m in self.mod_cards() if "Низкая оценка: 2/5" in m["text"]]
        self.assertEqual(len(low), 1)   # низкая оценка из плеера тоже сразу владельцу — карточкой модерации
        self.assertEqual(len(self.mod_cards()), 3)   # каждая оценка с финала — на модерацию
        self.assertEqual(self.tg.owner_msgs(), [])    # и не дублируется через бота команды

    def test_rating_in_link_out_of_range_falls_back_to_question(self):
        """Оценка вне 1–5 в ссылке не принимается — бот спрашивает оценку как обычно."""
        for arg in ("done_zilart_9", "done_zilart_0"):
            self.tg.text(f"/start {arg}")
            self.step()
            self.assertIn("от 1 до 5", self.tg.sent()[-1]["text"], arg)

    def test_rating_shown_from_ratings_source(self):
        """Рейтинг дела в боте — из того же источника, что на сайте; меньше 5 оценок — «мало оценок»."""
        self.tg.text("/start done_zilart")
        self.step()
        self.press_button("r|5.")
        self.step()
        self.finish_review()
        self.assertIn("мало оценок", self.tg.sent()[-1]["text"])
        import build_ratings
        f = self.root / "feedback" / "2026-11.jsonl"
        with f.open("a", encoding="utf-8") as fh:
            for i, r in enumerate((4, 5, 5, 4)):
                fh.write(json.dumps({"ts": "2026-11-25 10:00", "kind": "review", "user": f"u{i}", "quest": "zilart",
                                     "confirmed": True, "rating": r}) + "\n")
            fh.write(json.dumps({"kind": "review", "user": "u0", "quest": "zilart", "confirmed": True, "rating": 5}) + "\n")
            # не идут в рейтинг: без финала, повтор того же игрока (считается последняя), неизвестное дело
            fh.write(json.dumps({"kind": "review", "user": "x", "quest": "zilart", "confirmed": False, "rating": 1}) + "\n")
            fh.write(json.dumps({"kind": "review", "user": "y", "quest": "nope", "confirmed": True, "rating": 1}) + "\n")
        self.assertEqual(build_ratings.build(self.root / "feedback")["cases"]["zilart-sinyaya-ptica"]["count"], 0)
        self.approve_all()   # без решения владельца — ни одной оценки в рейтинге
        data = build_ratings.build(self.root / "feedback")
        row = data["cases"]["zilart-sinyaya-ptica"]
        self.assertEqual((row["count"], row["sum"]), (5, 24))
        raw = json.dumps(data, ensure_ascii=False)
        self.assertNotIn("u0", raw)   # в публичном файле нет псевдонимов
        self.tg.text("/cases")
        self.step()
        self.assertIn("★ 4,80 · 5 оценок", self.tg.sent()[-1]["text"])

    def test_ratings_json_in_site_is_real(self):
        """site/assets/ratings.json = сборка из feedback/: никаких «стартовых» оценок руками."""
        import build_ratings
        shipped = json.loads((fb.ROOT / "site" / "assets" / "ratings.json").read_text(encoding="utf-8"))
        self.assertEqual(shipped, build_ratings.build(fb.ROOT / "feedback"))
        self.assertEqual(set(shipped["cases"]), {c["slug"] for c in fb.CASES})

    def test_abandoned_review_saved_as_partial(self):
        self.tg.text("/start review")
        self.step()
        self.press_button("r|1.")
        self.step()
        with mock.patch.object(fb, "now", return_value=fb.time.time() + fb.EXPIRE + 60):
            self.step()
        [rec] = self.records()
        self.assertFalse(rec["complete"])
        self.assertEqual(rec["rating"], 1)
        self.assertIn("не дописан", self.tg.owner_msgs()[0]["text"])

    # ---------- предложить район ----------

    def test_suggest_contact_goes_to_owner_not_file(self):
        self.tg.text("/start suggest")
        self.step()
        self.tg.text("Москва, Хамовники")
        self.step()
        self.tg.text("Фабричные дворы")
        self.step()
        self.assertIn("контакт", self.tg.sent()[-1]["text"])
        self.tg.text("@anna_walks")
        self.step()
        [rec] = self.records()
        self.assertEqual(rec["where"], "Москва, Хамовники")
        self.assertTrue(rec["contact_given"])
        self.assertNotIn("anna_walks", json.dumps(rec, ensure_ascii=False))
        [note] = self.tg.owner_msgs()
        self.assertIn("@anna_walks", note["text"])
        self.assertIn("Хамовники", note["text"])
        self.assertIn("Спасибо", self.tg.sent()[-1]["text"])

    # ---------- вопрос ----------

    def test_question_forwarded_to_owner(self):
        self.tg.text("/start question")
        self.step()
        self.tg.text("Можно пройти с ребёнком 8 лет?")
        self.step()
        self.press_button("skip|contact|")
        self.step()
        [rec] = self.records()
        self.assertEqual((rec["kind"], rec["contact_given"]), ("question", False))
        self.assertNotIn("ребёнком", json.dumps(rec, ensure_ascii=False))  # текст — только владельцу
        [note] = self.tg.owner_msgs()
        self.assertIn("ребёнком", note["text"])
        self.assertIn("вопрос у команды", self.tg.sent()[-1]["text"])

    def test_free_text_outside_dialog_not_lost(self):
        self.tg.text("Привет, а когда новый квест?")
        self.step()
        [rec] = self.records()
        self.assertEqual(rec["kind"], "message")
        self.assertNotIn("квест", json.dumps(rec, ensure_ascii=False))
        self.assertEqual(len(self.tg.owner_msgs()), 1)

    # ---------- «Что-то не так?» из плеера ----------

    def test_report_from_player_deeplink(self):
        self.tg.text("/start report-zilart-3-2-fact")
        self.step()
        ask = self.tg.sent()[-1]["text"]
        self.assertIn("точка 3, шаг 2", ask)
        self.assertIn("факт не тот", ask)
        # игрок вставил текст из буфера — с меткой и контактом
        self.tg.text("Что-то не так · Дело о Синей птице\nТабличка висит на другом доме, пишите anna@mail.ru\n"
                     "[report zilart/3/2/fact]")
        self.step()
        self.assertIn("поправим", self.tg.sent()[-1]["text"])
        [rec] = self.records()
        self.assertEqual((rec["kind"], rec["quest"], rec["point"], rec["step"], rec["category"]),
                         ("report", "zilart", 3, 2, "fact"))
        self.assertTrue(rec["complete"])
        self.assertNotIn("[report", rec["text"])
        self.assertNotIn("anna@mail.ru", rec["text"])   # в публичный файл — без контактов
        self.assertIn("[почта]", rec["text"])
        [note] = self.tg.owner_msgs()                   # владельцу — сразу и полностью
        self.assertIn("Что-то не так: Факт не тот", note["text"])
        self.assertIn("anna@mail.ru", note["text"])

    def test_report_without_category_asks_buttons(self):
        self.tg.text("/start report-zilart-5")
        self.step()
        self.assertIn("Что случилось", self.tg.sent()[-1]["text"])
        self.assertEqual(len(self.tg.last_buttons()), len(fb.REPORT_CATS))
        self.press_button("c|riddle|")
        self.step()
        self.press_button("skip|report_text|")
        self.step()
        [rec] = self.records()
        self.assertEqual((rec["point"], rec["category"], rec["text"]), (5, "riddle", ""))
        self.assertNotIn("step", rec)

    def test_report_tag_without_start_is_report_not_message(self):
        self.tg.text("Загадка не решается: нет такой цифры\n[report zilart/4/0/riddle]")
        self.step()
        [rec] = self.records()
        self.assertEqual((rec["kind"], rec["point"], rec["category"]), ("report", 4, "riddle"))
        self.assertEqual(rec["text"], "Загадка не решается: нет такой цифры")

    def test_report_tag_keeps_open_review(self):
        self.tg.text("/start review")
        self.step()
        self.tg.text("[report zilart/1/1/tech] не грузится карта")
        self.step()
        state = json.loads((self.root / ".telegram" / "feedback-state.json").read_text())
        [d] = state["dialogs"].values()
        self.assertEqual((d["flow"], d["step"]), ("review", "rating"))
        self.assertEqual(self.records()[0]["category"], "tech")

    def test_abandoned_report_kept_with_category(self):
        self.tg.text("/start report-zilart-2-0-place")
        self.step()
        with mock.patch.object(fb, "now", return_value=fb.time.time() + fb.EXPIRE + 60):
            self.step()
        [rec] = self.records()
        self.assertEqual((rec["category"], rec["point"], rec["complete"]), ("place", 2, False))

    # ---------- напоминание перед прогулкой ----------

    def test_reminder_scheduled_sealed_and_delivered(self):
        self.tg.text("/start remind_zilart")
        self.step()
        self.assertIn("Когда напомнить", self.tg.sent()[-1]["text"])
        self.assertNotIn("w|1m|", " ".join(self.tg.last_buttons()))   # минутка — только владельцу
        self.press_button("w|2h|")
        self.step()
        self.assertIn("напомню", self.tg.sent()[-1]["text"])
        raw = (self.root / ".telegram" / "feedback-state.json").read_text()
        self.assertNotIn(str(USER), raw)   # chat id в публичном файле — только зашифрованным
        [r] = json.loads(raw)["reminders"]
        with mock.patch.object(fb, "now", return_value=r["at"] + 1):
            self.step()
        msg = self.tg.sent()[-1]
        self.assertIn("Напоминаем", msg["text"])
        self.assertIn("заряженный телефон", msg["text"])
        self.assertEqual(json.loads((self.root / ".telegram" / "feedback-state.json").read_text())["reminders"], [])

    def test_cancel_drops_reminder(self):
        self.tg.text("/start remind_zilart")
        self.step()
        self.press_button("w|tom|")
        self.step()
        self.tg.text("/cancel")
        self.step()
        self.assertEqual(json.loads((self.root / ".telegram" / "feedback-state.json").read_text())["reminders"], [])

    def test_seal_roundtrip_and_tamper(self):
        b = fb.Bot(PLAYER)
        s = b.seal(USER)
        self.assertEqual(b.unseal(s), USER)
        self.assertIsNone(fb.Bot("OTHER:TOKEN").unseal(s))

    # ---------- /test для владельца ----------

    def owner_text(self, text):
        self.tg.text(text, user=int(OWNER_CHAT))

    def test_test_menu_only_for_owner(self):
        self.tg.text("/test")
        self.step()
        self.assertNotIn("Тест бота", self.tg.sent()[-1]["text"])
        self.owner_text("/test")
        self.step()
        last = self.tg.sent(chat=OWNER_CHAT)[-1]
        self.assertIn("Тест бота", last["text"])
        self.assertEqual(len(last["reply_markup"]["inline_keyboard"]), len(fb.TEST_ITEMS))
        # чужое нажатие тестовой кнопки ничего не запускает
        n = len(self.tg.sent())
        self.tg.press("t|done|0")
        self.step()
        self.assertEqual(len(self.tg.sent()), n)

    def test_every_test_item_runs_and_writes_nothing(self):
        for key, _ in fb.TEST_ITEMS:
            self.tg.press(f"t|{key}|0", user=int(OWNER_CHAT))
            self.step()
        texts = [p["text"] for p in self.tg.sent(chat=OWNER_CHAT)]
        self.assertEqual(len(texts), len(fb.TEST_ITEMS))
        self.assertIn("поздравляем", texts[2])
        self.assertIn("ZIL-TEST", texts[8])
        # пройти финал с низкой оценкой: уведомление с пометкой ТЕСТ, в feedback/ — ничего
        self.tg.press("t|done|0", user=int(OWNER_CHAT))
        self.step()
        sid = self.last_owner_buttons()[0].split("|")[2]
        for data in (f"r|1|{sid}", f"skip|liked|{sid}", f"skip|unclear|{sid}", f"q|0|{sid}"):
            self.tg.press(data, user=int(OWNER_CHAT))
            self.step()
        self.assertEqual(self.records(), [])
        [card] = self.mod_cards()
        self.assertIn("ТЕСТ", card["text"])
        self.assertIn("1/5", card["text"])
        # кнопка тестовой карточки отвечает, но ничего не пишет
        self.tg.press(self.card_buttons(card)[0], user=int(OWNER_CHAT))
        self.step()
        self.assertIn("ТЕСТ", self.toasts()[-1])
        self.assertFalse(fb.moderation_path().exists())

    def test_owner_reminder_in_one_minute(self):
        self.tg.press("t|remind|0", user=int(OWNER_CHAT))
        self.step()
        self.tg.press(next(b for b in self.last_owner_buttons() if b.startswith("w|1m|")), user=int(OWNER_CHAT))
        self.step()
        with mock.patch.object(fb, "now", return_value=fb.time.time() + 61):
            self.step()
        self.assertIn("Напоминаем", self.tg.sent(chat=OWNER_CHAT)[-1]["text"])

    # ---------- модерация оценок ----------

    def mod_cards(self):
        """Карточки модерации: их шлёт игровой бот в чат владельца (нажатие должно прийти ему же)."""
        return [p for p in self.tg.sent(PLAYER, OWNER_CHAT)
                if any(b.get("callback_data", "").startswith("mod|") for row in p.get("reply_markup", {}).get("inline_keyboard", []) for b in row)]

    @staticmethod
    def card_buttons(p):
        return [b["callback_data"] for row in p["reply_markup"]["inline_keyboard"] for b in row]

    def toasts(self):
        return [p.get("text", "") for t, m, p in self.tg.calls if m == "answerCallbackQuery"]

    def markups(self):
        return [[b["callback_data"] for row in p["reply_markup"]["inline_keyboard"] for b in row]
                for t, m, p in self.tg.calls if m == "editMessageReplyMarkup" and str(p["chat_id"]) == OWNER_CHAT]

    def approve_all(self):
        import build_ratings
        bot = fb.Bot(PLAYER, OWNER, OWNER_CHAT)
        for r in fb.feedback_records():
            if build_ratings.counted(r):
                bot.set_moderation(fb.review_id(r), "approved", r)

    def rate_from_player(self, n=5, user=USER):
        self.tg.text(f"/start done_zilart_{n}", user=user)
        self.step()
        for prefix in ("skip|liked|", "skip|unclear|", "q|0|"):
            data = next(b for b in reversed([b for p in self.tg.sent(chat=user) if "reply_markup" in p
                                             for row in p["reply_markup"]["inline_keyboard"] for b in
                                             [x.get("callback_data", "") for x in row]]) if b.startswith(prefix))
            self.tg.press(data, user=user)
            self.step()

    def zilart(self):
        import build_ratings
        return build_ratings.build(self.root / "feedback")["cases"]["zilart-sinyaya-ptica"]

    def test_moderation_card_approve_and_reject(self):
        """Указание 26.11: каждая оценка с финала — владельцу с кнопками; в рейтинг идёт только «✅ В рейтинг»."""
        self.rate_from_player(4)
        [card] = self.mod_cards()
        self.assertIn("Оценка 4/5", card["text"])
        self.assertIn("финал подтверждён", card["text"])
        yes, no = self.card_buttons(card)
        self.assertTrue(yes.startswith("mod|a.") and no.startswith("mod|x."))
        self.assertEqual(self.zilart()["count"], 0)            # pending — не считается
        self.tg.press(yes, user=int(OWNER_CHAT))
        self.step()
        self.assertEqual((self.zilart()["count"], self.zilart()["sum"]), (1, 4))
        self.assertIn("Учтено", self.toasts()[-1])
        self.assertEqual(self.markups()[-1], [no])               # кнопка «убрать» на месте двух
        mod = json.loads(fb.moderation_path().read_text(encoding="utf-8"))
        self.assertEqual([v["status"] for v in mod["reviews"].values()], ["approved"])
        self.assertNotIn(str(USER), json.dumps(mod))             # в публичном файле нет id игрока
        self.tg.press(no, user=int(OWNER_CHAT))                  # передумал — убрал
        self.step()
        self.assertEqual(self.zilart()["count"], 0)
        self.assertEqual(self.markups()[-1], [yes])

    def test_moderation_repeat_press_changes_nothing(self):
        self.rate_from_player(5)
        yes = self.card_buttons(self.mod_cards()[0])[0]
        self.tg.press(yes, user=int(OWNER_CHAT))
        self.step()
        before = fb.moderation_path().read_text(encoding="utf-8")
        with mock.patch.object(fb, "now", return_value=fb.time.time() + 3600):
            self.tg.press(yes, user=int(OWNER_CHAT))
            self.step()
        self.assertIn("Уже отмечено", self.toasts()[-1])
        self.assertEqual(fb.moderation_path().read_text(encoding="utf-8"), before)   # не перезаписан
        self.assertEqual(self.zilart()["count"], 1)

    def test_moderation_only_owner(self):
        """Чужой пользователь (в т. ч. подделав callback_data) модерировать не может."""
        self.rate_from_player(1)
        yes = self.card_buttons(self.mod_cards()[0])[0]
        self.tg.press(yes)                                        # игрок, не владелец
        self.step()
        self.assertIn("для команды", self.toasts()[-1])
        self.assertFalse(fb.moderation_path().exists())
        self.assertEqual(self.zilart()["count"], 0)
        self.tg.text("/moderate")                                 # и очередь ему не показывается
        self.step()
        self.assertFalse(any("модерации" in p["text"] for p in self.tg.sent()))
        self.tg.press("mod|a.zzzzzzzzzz|0", user=int(OWNER_CHAT))   # мусор от владельца — тоже ничего
        self.tg.press("mod|a.0123456789|0", user=int(OWNER_CHAT))   # несуществующий отзыв
        self.step()
        self.assertIn("не найден", self.toasts()[-1])
        self.assertFalse(fb.moderation_path().exists())

    def test_moderate_command_lists_pending_queue(self):
        self.owner_text("/moderate")
        self.step()
        self.assertIn("пусто", self.tg.sent(chat=OWNER_CHAT)[-1]["text"])
        self.rate_from_player(5)
        self.rate_from_player(3, user=USER + 1)
        self.tg.text("/start review-zilart")                      # без финала — не модерируется, в рейтинг не идёт
        self.step()
        self.press_button("r|2.")
        self.step()
        self.finish_review()
        first = self.card_buttons(self.mod_cards()[0])[0]
        self.tg.press(first, user=int(OWNER_CHAT))
        self.step()
        n = len(self.mod_cards())
        self.owner_text("/moderate")
        self.step()
        sent = self.tg.sent(chat=OWNER_CHAT)
        head = [p for p in sent if "На модерации" in p["text"]][-1]
        self.assertIn("На модерации: 1", head["text"])
        new = self.mod_cards()[n:]
        self.assertEqual(len(new), 1)
        self.assertIn("3/5", new[0]["text"])
        self.assertEqual(fb.T["mod_empty"] in [p["text"] for p in sent], True)   # первая попытка — пустая очередь

    def test_moderation_card_falls_back_without_buttons(self):
        """Владелец ещё не открывал игрового бота — sendMessage не проходит; оценка не теряется:
        текст приходит через бота команды с подсказкой про /moderate, а в очереди она остаётся."""
        real = self.tg.call

        def call(token, method, params, timeout=None):
            if token == PLAYER and method == "sendMessage" and str(params["chat_id"]) == OWNER_CHAT:
                self.tg.calls.append((token, method, json.loads(json.dumps(params))))
                return {"ok": False, "description": "Forbidden: bot can't initiate conversation"}
            return real(token, method, params, timeout)
        with mock.patch.object(fb.tg, "call", call):
            self.rate_from_player(5)
        [note] = self.tg.owner_msgs()
        self.assertIn("/moderate", note["text"])
        self.assertIn("5/5", note["text"])

    def test_old_records_without_moderation_not_counted(self):
        """Записи до модерации тоже получают id и ждут решения — в рейтинг сами не попадают."""
        f = self.root / "feedback"
        f.mkdir()
        (f / "2026-11.jsonl").write_text(json.dumps({"ts": "2026-11-20 10:00", "kind": "review", "user": "aa",
                                                     "quest": "zilart", "confirmed": True, "rating": 5}) + "\n" +
                                         json.dumps({"ts": "2026-11-20 11:00", "kind": "rating", "source": "site",
                                                     "user": "bb", "quest": "zilart", "rating": 4}) + "\n", encoding="utf-8")
        self.assertEqual(self.zilart()["count"], 0)
        self.owner_text("/moderate")
        self.step()
        self.assertEqual(len(self.mod_cards()), 2)
        self.assertTrue(any("с сайта" in c["text"] for c in self.mod_cards()))
        self.approve_all()
        self.assertEqual((self.zilart()["count"], self.zilart()["bot"], self.zilart()["site"]), (2, 1, 1))

    def last_owner_buttons(self):
        for p in reversed(self.tg.sent(chat=OWNER_CHAT)):
            if "reply_markup" in p:
                return [b.get("callback_data") or "" for row in p["reply_markup"]["inline_keyboard"] for b in row]
        return []

    # ---------- длинный опрос ----------

    def test_long_poll_retries_network_errors_and_stops_on_conflict(self):
        replies = iter([{"ok": False, "description": "URLError"},
                        {"ok": True, "result": []},
                        {"ok": False, "error_code": 409, "description": "Conflict"}])
        calls = []

        def fake(token, method, params, timeout=None):
            calls.append(method)
            return next(replies) if method == "getUpdates" else {"ok": True}
        with mock.patch.object(fb.tg, "call", fake), mock.patch.object(fb.time, "sleep"):
            fb.Bot(PLAYER).run(poll_seconds=3600)
        self.assertEqual(calls.count("getUpdates"), 3)
        self.assertTrue((self.root / ".telegram" / "feedback-offset").exists())

    def test_periodic_commit_only_when_dirty(self):
        clock = [1000.0]
        with mock.patch.object(fb, "now", lambda: clock[0]), mock.patch.object(fb.subprocess, "run") as run, \
                mock.patch.object(fb.time, "sleep"):
            run.return_value.returncode = 0
            def fake(token, method, params, timeout=None):
                clock[0] += 600
                if method == "getUpdates" and clock[0] < 2300:
                    return {"ok": True, "result": [{"update_id": 1, "message": {
                        "message_id": 1, "from": {"id": USER}, "chat": {"id": USER, "type": "private"},
                        "text": "/start"}}]}
                return {"ok": True, "result": []}
            with mock.patch.object(fb.tg, "call", fake):
                fb.Bot(PLAYER).run(poll_seconds=7200, commit_seconds=1800)
        # апдейты были только в первые полчаса: один коммит, дальше состояние не менялось — коммитов нет
        self.assertEqual(run.call_count, 1)

    # ---------- профили ----------

    def test_profiles_limits_and_calls(self):
        import tg_set_profiles as tp
        f = self.root / "profiles.json"
        f.write_text(json.dumps({"bot_description": "Д" * 512, "bot_short_description": "Коротко",
                                 "channel_description": "Канал"}), encoding="utf-8")
        data, errors = tp.load(f)
        self.assertEqual(errors, [])
        tp.apply(data, PLAYER, "@dvorami_quest")
        methods = {m: p for t, m, p in self.tg.calls}
        self.assertEqual(set(methods), {"setMyDescription", "setMyShortDescription", "setChatDescription"})
        self.assertEqual(methods["setChatDescription"]["chat_id"], "@dvorami_quest")
        f.write_text(json.dumps({"bot_short_description": "x" * 121}), encoding="utf-8")
        self.assertTrue(tp.load(f)[1])

    # ---------- служебное ----------

    def test_group_messages_ignored_and_offset_saved(self):
        self.tg.text("/start", chat_type="group")
        self.step()
        self.assertEqual(self.tg.sent(), [])
        self.assertEqual((self.root / ".telegram" / "feedback-offset").read_text().strip(), "2")
        self.step()
        offsets = [p["offset"] for t, m, p in self.tg.calls if m == "getUpdates"]
        self.assertEqual(offsets, [0, 2])

    def test_no_token_exits_zero(self):
        with mock.patch.dict(os.environ, {"PLAYER_BOT_TOKEN": ""}):
            self.assertEqual(fb.main(), 0)
        self.assertEqual(self.tg.calls, [])
        self.assertFalse((self.root / ".telegram").exists())


if __name__ == "__main__":
    unittest.main(verbosity=2)

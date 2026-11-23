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
        self.assertIn("Чем помочь", self.tg.sent()[-1]["text"])
        self.assertEqual(self.tg.last_buttons(), ["url:https://jastiss.github.io/dvorami/moscow/", "m|review|0", "m|suggest|0", "m|question|0"])
        self.tg.press("m|suggest|0")
        self.step()
        self.assertIn("Какой район", self.tg.sent()[-1]["text"])

    # ---------- отзыв ----------

    def test_review_low_rating_full_flow(self):
        self.tg.text("/start review-zilart")
        self.step()
        self.assertIn("от 1 до 5", self.tg.sent()[-1]["text"])
        self.tg.text("пять")  # текст вместо кнопки
        self.step()
        self.assertIn("кнопок", self.tg.sent()[-1]["text"])
        self.press_button("r|2|")
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
        self.press_button("r|5|")
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
        old = self.tg.last_buttons()[0]  # r|1|<sid>
        self.tg.text("/start review")  # начал заново — новый sid
        self.step()
        self.tg.press(old)
        self.step()
        state = json.loads((self.root / ".telegram" / "feedback-state.json").read_text())
        [d] = state["dialogs"].values()
        self.assertEqual(d["step"], "rating")

    def test_abandoned_review_saved_as_partial(self):
        self.tg.text("/start review")
        self.step()
        self.press_button("r|1|")
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

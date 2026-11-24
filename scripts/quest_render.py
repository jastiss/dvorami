"""Собирает из quests/<id>/quest.json читаемый сценарий в Markdown.

  python3 scripts/quest_render.py zilart  → quests/zilart/story/scenario-current.md
"""

import html
import json
import pathlib
import re
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent


def md(text):
    text = text.replace("<b>", "**").replace("</b>", "**").replace("<i>", "_").replace("</i>", "_")
    text = text.replace("<code>", "`").replace("</code>", "`")
    text = re.sub(r"<[^>]+>", "", text)
    return html.unescape(text)


def quote(text):
    return "\n".join("> " + line if line else ">" for line in md(text).split("\n"))


def main():
    qid = sys.argv[1] if len(sys.argv) > 1 else "zilart"
    # рендер понимает формат 3: копия quest-v3.1.json (quest.json — формат 5, docs/quest-format.md)
    src = ROOT / "quests" / qid / "quest-v3.1.json"
    if not src.exists():
        src = ROOT / "quests" / qid / "quest.json"
    q = json.loads(src.read_text(encoding="utf-8"))
    out = [f"# {q['title']}", "",
           f"_Собрано из `{src.relative_to(ROOT)}`, версия {q.get('version')}. Не редактировать вручную — правки вносятся в quest.json._",
           "", q.get("summary", ""), "", "## Вступление", ""]
    for m in q["intro"]:
        out += [quote(m), ""]
    for pt in q["points"]:
        out += [f"## {pt['n']}. {pt['title']}", "", f"**Где:** {pt['place']} · "
                f"[{pt['lat']}, {pt['lon']}](https://yandex.ru/maps/?pt={pt['lon']},{pt['lat']}&z=18&l=map)", "",
                f"**Дорога:** {md(pt['walk'])}", "", quote(pt["scene"]), ""]
        for i, st in enumerate(pt["steps"], 1):
            out.append(f"**Шаг {i}.** {md(st['text'])}")
            if st.get("answers"):
                shown = [a for a in st["answers"] if not a.startswith("~")]
                out.append(f"- Ответ: **{shown[0]}**" + (f" (принимается также: {', '.join(shown[1:])})" if len(shown) > 1 else ""))
            if st["type"] == "free":
                out.append("- Ответ: любой")
            for j, h in enumerate(st.get("hints") or [], 1):
                out.append(f"- Подсказка {j}: {md(h)}")
            if st.get("ok"):
                out.append(f"- После ответа: {md(st['ok'])}")
            out.append("")
        if pt.get("clue"):
            c = pt["clue"]
            out += [f"**Улика:** {c['year']} · буква **{c['letter']}** ({c['how']}). {c['who']}: «{c['says']}»", ""]
        if pt.get("outro"):
            out += [quote(pt["outro"]), ""]
        if pt.get("check"):
            out += ["_Проверить на месте:_"] + [f"- {c}" for c in pt["check"]] + [""]
    out += ["## Финал", ""]
    for m in q.get("finale", []):
        out += [quote(m), ""]
    board = sorted((p["clue"] for p in q["points"] if p.get("clue")), key=lambda c: c["year"])
    out += ["## Проверка шифра", "", "| Год | Буква | Откуда |", "|---|---|---|"]
    out += [f"| {c['year']} | {c['letter']} | {c['how']} |" for c in board]
    out += ["", f"По годам: **{''.join(c['letter'] for c in board)}**", ""]
    dest = ROOT / "quests" / qid / "story" / "scenario-current.md"
    dest.write_text("\n".join(out), encoding="utf-8")
    print(dest)


if __name__ == "__main__":
    main()

#!/usr/bin/env python3
"""Крючок дела (H-128): механическая часть стандарта «Крючок дела» (team/roles/marketer.md, пункты 1 и 7).

  python3 scripts/hook_check.py            — все дела platform/site/cases/c*.py
  python3 scripts/hook_check.py --json     — {"errors": [], "warns": [...]} для site_check.js (и --sync)
  python3 scripts/hook_check.py --selftest — фикстура: каждое нарушение ловится, верный крючок — нет

Проверяется (пока ПРЕДУПРЕЖДЕНИЕ, выкладку не блокирует; станет пусто — сделать ошибкой):
  - вопрос дела — первая фраза card.teaser — кончается «?» и не длиннее 70 знаков;
  - card.teaser ≤ 120 знаков (≤ 4 строк в карточке на 390);
  - og_description начинается тем же вопросом (дословно, без учёта тегов и неразрывных пробелов) и ≤ 200 знаков;
  - card.ask (текст кнопки карточки) есть и ≤ 20 знаков.
Смысловые пункты 2–6 (место и действие, один герой, ставка, понятно без сюжета, не ответ) — вслух, Маркетолог.
Данные правятся в platform/site/cases/c*.py → python3 scripts/build_cases.py.
"""
import argparse
import json
import os
import re
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import build_cases  # noqa: E402  (load() — данные дела из исходника, без __pycache__)

TEASER_MAX, QUESTION_MAX, OG_MAX, ASK_MAX = 120, 70, 200, 20


def plain(s):
    s = re.sub(r"<[^>]+>", "", str(s or "")).replace("&nbsp;", " ").replace(" ", " ")
    s = s.replace("&laquo;", "«").replace("&raquo;", "»").replace("&mdash;", "—").replace("&ndash;", "–")
    return re.sub(r"\s+", " ", s).strip()


def question_of(teaser):
    m = re.match(r"[^.?!…]*[.?!…]", teaser)
    return (m.group(0) if m else teaser).strip()


def check_case(c):
    tag = f"дело №{c.get('no')} ({c.get('slug')})"
    k = c.get("card") or {}
    teaser, og, ask = plain(k.get("teaser")), plain(c.get("og_description")), plain(k.get("ask"))
    q = question_of(teaser)
    out = []
    if not q.endswith("?"):
        out.append(f"{tag}: первая фраза тизера не вопрос — «{q[:60]}»")
    elif len(q) > QUESTION_MAX:
        out.append(f"{tag}: вопрос дела {len(q)} знаков (нужно ≤ {QUESTION_MAX}) — «{q}»")
    if len(teaser) > TEASER_MAX:
        out.append(f"{tag}: card.teaser {len(teaser)} знаков (нужно ≤ {TEASER_MAX}) — «{teaser[:60]}…»")
    if not og:
        out.append(f"{tag}: нет og_description")
    elif q.endswith("?") and not og.startswith(q):
        out.append(f"{tag}: og_description начинается не вопросом тизера — «{question_of(og)[:80]}» вместо «{q}»")
    if len(og) > OG_MAX:
        out.append(f"{tag}: og_description {len(og)} знаков (нужно ≤ {OG_MAX})")
    if not ask:
        out.append(f"{tag}: нет card.ask — на кнопке карточки «Подробнее о деле» вместо вопроса дела")
    elif len(ask) > ASK_MAX:
        out.append(f"{tag}: card.ask {len(ask)} знаков (нужно ≤ {ASK_MAX}) — «{ask}»")
    return out


def all_cases():
    files = sorted(f for f in os.listdir(build_cases.DATA) if re.match(r"c\d+_.*\.py$", f))
    return [build_cases.load(os.path.join(build_cases.DATA, f)) for f in files]


def selftest():
    good = {"no": 1, "slug": "fx", "card": {"teaser": "Кто дал&nbsp;слово? Выясните на улицах.", "ask": "Кто дал слово?"},
            "og_description": "Кто дал слово? Выясните на улицах. Квест-прогулка без гида."}
    out = []
    if check_case(good):
        out.append(f"ложное срабатывание на верном крючке: {check_case(good)}")
    bad = [
        ("og не с вопроса", dict(good, og_description="Квест-прогулка. Кто дал слово?"), "начинается не вопросом"),
        ("тизер не вопрос", dict(good, card=dict(good["card"], teaser="Прогулка по ЗИЛАРТу. Кто дал слово?")), "не вопрос"),
        ("тизер > 120", dict(good, card=dict(good["card"], teaser="Кто дал слово? " + "а" * 120)), "card.teaser"),
        ("кнопка > 20", dict(good, card=dict(good["card"], ask="Кто дал честное слово в письме?")), "card.ask"),
        ("нет кнопки", dict(good, card={"teaser": good["card"]["teaser"]}), "нет card.ask"),
        ("og > 200", dict(good, og_description="Кто дал слово? " + "б" * 200), "og_description 2"),
    ]
    for name, c, want in bad:
        if not any(want in m for m in check_case(c)):
            out.append(f"не пойман случай «{name}»")
    return out


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--json", action="store_true")
    ap.add_argument("--selftest", action="store_true")
    a = ap.parse_args(argv)
    errors = ["hook_check (самопроверка): " + m for m in selftest()]
    if a.selftest:
        for m in errors:
            print(" ✗ " + m)
        print("hook_check --selftest: " + ("ОШИБКА" if errors else "OK"))
        return 1 if errors else 0
    warns = [m for c in all_cases() for m in check_case(c)]
    if a.json:
        print(json.dumps({"errors": errors, "warns": warns}, ensure_ascii=False))
        return 0
    for m in warns:
        print(" ! " + m)
    for m in errors:
        print(" ✗ " + m)
    print(f"hook_check: {len(errors)} ошибок" if errors else f"hook_check: OK, предупреждений {len(warns)}")
    return 1 if errors else 0


if __name__ == "__main__":
    sys.exit(main())

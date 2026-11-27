"""H-118: владельцу в Telegram — один раз за 30 дней до срока временного объекта маршрута ("until", H-111) и один раз,
если срок уже вышел, а предупреждения не было. Записи — scripts/temporary_check.js --json (поле "temporary" в деле
и quests/<id>/temporary.json, docs/quest-format.md, «Временные объекты»).

  python3 scripts/temporary_notify.py                      — отправить (workflow «Telegram — входящие», по расписанию)
  python3 scripts/temporary_notify.py --dry --today=2026-12-18 — печать вместо отправки; отметки — во временном файле
  [--marks=путь] — файл отметок (по умолчанию .telegram/temporary-sent.json; в --dry — во временной папке)

Отметка: ключ «дело|что|until|warn или gone» → дата отправки. Продлили срок (новый until) — предупреждение придёт снова.
Отметка пишется только после удачной отправки; нет секретов TELEGRAM_* — тихий выход, отметок нет.
"""

import json
import os
import pathlib
import subprocess
import sys
import tempfile

ROOT = pathlib.Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "scripts"))
import tg  # noqa: E402

WARN_DAYS = 30
STAND = "https://jastiss.github.io/dvorami/"


def ru(d):
    return ".".join(reversed(d.split("-")))


def records(today):
    cmd = ["node", str(ROOT / "scripts" / "temporary_check.js"), "--json"] + ([f"--today={today}"] if today else [])
    return json.loads(subprocess.run(cmd, cwd=ROOT, capture_output=True, text=True, check=True).stdout or "[]")


def message(r, kind):
    e = tg._esc
    if kind == "warn":
        flag = f" Плеер сам переключит на запасную ветку ({e(r['flag'])}) после {ru(r['until'])}." if r.get("flag") else \
            " Плеер сам реплику не снимет — нужна замена в деле."
    else:
        flag = f" Плеер уже показывает запасную ветку ({e(r['flag'])})." if r.get("flag") else \
            " Плеер сам реплику не снимает — нужна замена в деле."
    pages = ", ".join(f'<a href="{STAND}{e(p)}">{e(p)}</a>' for p in r.get("pages") or [])
    head = (f"⏳ <b>Временный объект</b>, дело {e(r['quest'])}: {e(r['what'])} — до {ru(r['until'])} осталось {r['left']} дн."
            if kind == "warn" else
            f"⚠️ <b>Срок временного объекта вышел</b>, дело {e(r['quest'])}: {e(r['what'])} — {ru(r['until'])}.")
    body = ("\nПроверьте на месте, стоит ли он, и решите: продлить срок по источнику или убрать из дела и с витрины." + flag)
    tail = (f"\nНа витрине: {pages}." if pages else "") + (f"\nИсточник срока: {e(r['source'])}." if r.get("source") else "")
    return head + body + tail


def main(argv):
    dry = "--dry" in argv
    opt = dict(a[2:].split("=", 1) for a in argv if a.startswith("--") and "=" in a)
    marks_path = pathlib.Path(opt.get("marks") or (pathlib.Path(tempfile.gettempdir()) / "dvorami-temporary-sent.json" if dry
                                                    else ROOT / ".telegram" / "temporary-sent.json"))
    marks = json.loads(marks_path.read_text(encoding="utf-8")) if marks_path.exists() else {}
    due = []
    for r in records(opt.get("today")):
        kind = "warn" if 0 <= r["left"] <= WARN_DAYS else "gone" if r["left"] < 0 else None
        key = f"{r['quest']}|{r['what']}|{r['until']}|{kind}"
        # предупреждение уже было — о выходе срока ещё раз не пишем (плеер и site_check скажут сами)
        if kind and key not in marks and not (kind == "gone" and f"{r['quest']}|{r['what']}|{r['until']}|warn" in marks):
            due.append((key, r, kind))
    if not due:
        print("temporary_notify: отправлять нечего")
        return 0
    token = chat = None
    if not dry:
        token, chat = tg.env()  # нет секретов — тихий выход, отметок нет
    today = opt.get("today") or subprocess.run(["date", "-u", "+%F"], capture_output=True, text=True).stdout.strip()
    sent = 0
    for key, r, kind in due:
        html = message(r, kind)
        if dry:
            print("[сухой режим] сообщение владельцу:\n" + html)
        elif not tg.send(token, chat, html):
            print(f"::warning::temporary_notify: не отправлено — {r['what']}, попробую в следующий запуск")
            continue
        marks[key] = today
        sent += 1
    marks_path.parent.mkdir(parents=True, exist_ok=True)
    if sent: marks_path.write_text(json.dumps(marks, ensure_ascii=False, indent=1, sort_keys=True) + "\n", encoding="utf-8")
    print(f"temporary_notify: отправлено {sent} из {len(due)}; отметки — {marks_path}")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))

"""Выкладка стенда (workflow Pages, .github/workflows/pages.yml): обновлён ли стенд и что упало.

  python3 scripts/pages_status.py               — Продюсеру ДО отчёта: дошёл ли до стенда последний коммит, который его меняет
  python3 scripts/pages_status.py --alarm       — в pages.yml (job alarm, if: failure()): владельцу в Telegram «Стенд НЕ обновлён»
  python3 scripts/pages_status.py --alarm --dry --run=<id> — то же без отправки: печатает сообщение (проверка на старом запуске)

Выход (режим по умолчанию): 0 — стенд обновлён; 1 — выкладка красная, на стенде старая версия; 2 — выкладка ещё идёт
или для коммита нет запуска; 3 — API GitHub недоступен (смотрите вкладку Actions).
Публичный API GitHub; токен (GITHUB_TOKEN / GH_TOKEN) — только если есть в окружении, не печатается.
Красная выкладка = в отчёте «на стенде старая версия», а не «витрина синхронизирована» (team/std/site-check.md).
"""

import json
import os
import pathlib
import re
import subprocess
import sys
import urllib.error
import urllib.request

ROOT = pathlib.Path(__file__).resolve().parent.parent
REPO = os.environ.get("GITHUB_REPOSITORY") or "jastiss/dvorami"
WF = "pages.yml"
ACTIONS = f"https://github.com/{REPO}/actions/workflows/{WF}"


def api(path):
    req = urllib.request.Request(f"https://api.github.com/repos/{REPO}/{path}",
                                 headers={"Accept": "application/vnd.github+json", "User-Agent": "pages-status"})
    tok = (os.environ.get("GITHUB_TOKEN") or os.environ.get("GH_TOKEN") or "").strip()
    if tok:
        req.add_header("Authorization", f"Bearer {tok}")
    with urllib.request.urlopen(req, timeout=20) as r:
        return json.loads(r.read().decode("utf-8"))


def git(*a):
    return subprocess.run(["git", *a], cwd=ROOT, capture_output=True, text=True).stdout.strip()


def watched_paths():
    """paths: из on.push в pages.yml — те же, что запускают выкладку."""
    text = (ROOT / ".github" / "workflows" / WF).read_text(encoding="utf-8")
    m = re.search(r"\n\s+paths:\s*\n((?:\s+-\s+.+\n)+)", text)
    paths = re.findall(r"-\s+\"?([^\"\n]+)\"?", m.group(1)) if m else ["site/**"]
    return [f":(glob){p.strip()}" for p in paths]


def failed_steps(run_id):
    out = []
    for j in api(f"actions/runs/{run_id}/jobs?per_page=50").get("jobs", []):
        for s in j.get("steps") or []:
            if s.get("conclusion") == "failure":
                out.append((j.get("name", ""), s.get("name", "")))
        if j.get("conclusion") == "failure" and not any(n == j.get("name") for n, _ in out):
            out.append((j.get("name", ""), ""))
    return out


def is_ancestor(a, b):
    if a == b:
        return True
    return subprocess.run(["git", "merge-base", "--is-ancestor", a, b], cwd=ROOT, capture_output=True).returncode == 0


def status():
    need = git("log", "-1", "--format=%H", "HEAD", "--", *watched_paths())
    if not need:
        print("pages_status: в истории нет коммитов, меняющих стенд")
        return 0
    subj = git("log", "-1", "--format=%h %cd %s", "--date=format:%d.%m %H:%M", need)
    try:
        runs = api(f"actions/workflows/{WF}/runs?branch=main&per_page=30").get("workflow_runs", [])
    except (urllib.error.URLError, TimeoutError, OSError, ValueError) as e:
        print(f"pages_status: не могу проверить ({type(e).__name__}) — смотрите вкладку Actions: {ACTIONS}")
        print("  До проверки в отчёте не писать «стенд обновлён».")
        return 3
    print(f"Последний коммит, меняющий стенд: {subj}")
    covering = [r for r in runs if is_ancestor(need, r.get("head_sha", ""))]
    done = [r for r in covering if r.get("status") == "completed"]
    ok = next((r for r in done if r.get("conclusion") == "success"), None)
    if ok:
        print(f"OK: стенд обновлён — запуск {ok['head_sha'][:7]} зелёный: {ok['html_url']}")
        return 0
    going = [r for r in covering if r.get("status") != "completed"]
    if going:
        print(f"ЖДЁМ: выкладка идёт ({going[0]['status']}): {going[0]['html_url']} — проверьте через пару минут")
        return 2
    if not done:
        print(f"ЖДЁМ: для {need[:7]} запуска Pages ещё нет (не запушено или в очереди) — {ACTIONS}")
        return 2
    bad = done[0]
    last_ok = next((r for r in runs if r.get("status") == "completed" and r.get("conclusion") == "success"), None)
    try:
        steps = failed_steps(bad["id"])
    except (urllib.error.URLError, TimeoutError, OSError, ValueError):
        steps = []
    what = "; ".join(f"{j}: {s}" if s else j for j, s in steps) or bad.get("conclusion", "?")
    print(f"КРАСНАЯ: стенд НЕ обновлён — упал шаг «{what}»: {bad['html_url']}")
    if last_ok:
        print(f"  На стенде старая версия: {last_ok['head_sha'][:7]} от {last_ok.get('updated_at', '')[:16].replace('T', ' ')} UTC.")
    print("  В отчёте: «на стенде старая версия», ссылку на стенд как на новую — не давать. "
          "Шаг воспроизводится локально: node scripts/site_check.js --sync, node scripts/player_check.js, python3 scripts/codes.py leakcheck site")
    return 1


def alarm(dry, run_id):
    run_id = run_id or os.environ.get("GITHUB_RUN_ID", "")
    url = f"https://github.com/{REPO}/actions/runs/{run_id}" if run_id else ACTIONS
    sha = (os.environ.get("GITHUB_SHA") or "")[:7]
    try:
        steps = failed_steps(run_id) if run_id else []
    except (urllib.error.URLError, TimeoutError, OSError, ValueError) as e:
        print(f"::warning::шаги запуска не прочитаны: {type(e).__name__}")
        steps = []
    sys.path.insert(0, str(ROOT / "scripts"))
    import tg  # noqa: E402
    what = "; ".join(f"«{s}»" if s else f"job {j}" for j, s in steps) or "(шаг не определён)"
    html = (f"⚠️ <b>Стенд НЕ обновлён</b>: упал шаг {tg._esc(what)}{' · ' + sha if sha else ''}.\n"
            f"На стенде остаётся прежняя версия.\n<a href=\"{url}\">Запуск в Actions</a>")
    if dry:
        print("[сухой режим] сообщение владельцу:\n" + html)
        return 0
    token, chat_id = tg.env()  # нет секретов — тихий выход (код 0)
    return 0 if tg.send(token, chat_id, html) else 1


if __name__ == "__main__":
    args = sys.argv[1:]
    run = next((a.split("=", 1)[1] for a in args if a.startswith("--run=")), "")
    sys.exit(alarm("--dry" in args, run) if "--alarm" in args else status())

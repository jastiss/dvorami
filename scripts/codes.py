#!/usr/bin/env python3
"""Коды доступа к делам «Дворами» — без сервера (этап до оплаты, A-17). Как устроено и как пользоваться — docs/codes.md.

Коротко:
  * при сборке стенда (pages.yml) дело шифруется AES-GCM случайным ключом содержимого K → site/play/<id>/quest.locked.json;
  * каждый код через PBKDF2-SHA256 (200 000 итераций, соль дела) даёт идентификатор и ключ-обёртку, которым обёрнут K;
    в опубликованном файле — только таблица «идентификатор → обёрнутый K», самих кодов нет нигде;
  * мастер-код владельца — секрет GitHub QUEST_MASTER_CODE; из него же выводится ключ выпуска (X25519):
    выпущенный код хранится в quests/<id>/codes.json только как идентификатор и запечатанный под ключ выпуска ключ-обёртка,
    распечатать его может лишь сборка, знающая мастер-код.

Команды:
  python3 scripts/codes.py master                       — придумать надёжный мастер-код (12 знаков) — для секрета
  QUEST_MASTER_CODE=… python3 scripts/codes.py issuer   — открытый ключ выпуска (печатает и сборка) → в реестр
  python3 scripts/codes.py set-issuer --quest zilart KEY — записать открытый ключ выпуска в реестр дела
  python3 scripts/codes.py issue --quest zilart -n 5 --label "полевой тест" [--out ~/codes.txt]
  python3 scripts/codes.py revoke --quest zilart (КОД | --n 3)
  python3 scripts/codes.py list --quest zilart
  QUEST_MASTER_CODE=… python3 scripts/codes.py seal --quest zilart --out site/play/zilart/quest.locked.json
  python3 scripts/codes.py leakcheck site               — в каталоге нет открытого текста точек и ответов
  python3 scripts/codes.py selftest-bundle --quest zilart --out DIR — тестовый набор для player_check (коды на лету)

Нужен пакет cryptography (pip install cryptography). Коды выводятся в stdout или в файл ВНЕ репозитория
(внутри — только в .codes/, она в .gitignore).
"""

import argparse
import base64
import datetime
import hashlib
import html
import json
import os
import pathlib
import re
import secrets
import sys
import unicodedata

ROOT = pathlib.Path(__file__).resolve().parent.parent
ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ"   # без 0/O, 1/I/L — путать нечего
ITER = 200_000
ISSUER_SALT = b"dvorami:issuer:v1"
# Кириллица, похожая на латиницу, — игрок может набрать код на русской раскладке
HOMO = str.maketrans("АВЕКМНОРСТХУ", "ABEKMHOPCTXY")


def crypto():
    try:
        from cryptography.hazmat.primitives.ciphers.aead import AESGCM
        from cryptography.hazmat.primitives.asymmetric.x25519 import X25519PrivateKey, X25519PublicKey
        from cryptography.hazmat.primitives import serialization
    except ImportError:
        sys.exit("Нужен пакет cryptography: pip install cryptography")
    return AESGCM, X25519PrivateKey, X25519PublicKey, serialization


def b64(b):
    return base64.b64encode(b).decode()


def unb64(s):
    return base64.b64decode(s)


# ---------- коды ----------
def normalize(code):
    """Так же, как normCode() в site/play/player.js: регистр, дефисы, пробелы и русская раскладка не важны."""
    s = unicodedata.normalize("NFKC", str(code or "")).upper().translate(HOMO)
    return "".join(ch for ch in s if ch.isalnum())


def new_code(groups=2):
    raw = "".join(secrets.choice(ALPHABET) for _ in range(4 * groups))
    return "-".join(raw[i:i + 4] for i in range(0, len(raw), 4))


def derive(code, salt, iterations=ITER):
    """Код → (идентификатор, ключ-обёртка). Медленно нарочно: перебор кодов по опубликованной таблице дорог."""
    dk = hashlib.pbkdf2_hmac("sha256", normalize(code).encode(), salt, iterations, 32)
    ident = hashlib.sha256(b"dvorami:id:" + dk).digest()[:16].hex()
    wrap = hashlib.sha256(b"dvorami:wrap:" + dk).digest()
    return ident, wrap


# ---------- ключ выпуска: X25519 из мастер-кода ----------
def issuer_private(master):
    _, X25519PrivateKey, _, _ = crypto()
    seed = hashlib.pbkdf2_hmac("sha256", normalize(master).encode(), ISSUER_SALT, ITER, 32)
    return X25519PrivateKey.from_private_bytes(seed)


def raw_pub(key):
    _, _, _, ser = crypto()
    if hasattr(key, "public_key"):
        key = key.public_key()
    return key.public_bytes(ser.Encoding.Raw, ser.PublicFormat.Raw)


def seal(wrap, issuer_b64, aad):
    AESGCM, X25519PrivateKey, X25519PublicKey, _ = crypto()
    pub = unb64(issuer_b64)
    eph = X25519PrivateKey.generate()
    eph_pub = raw_pub(eph)
    kek = hashlib.sha256(b"dvorami:seal:" + eph.exchange(X25519PublicKey.from_public_bytes(pub)) + eph_pub + pub).digest()
    iv = secrets.token_bytes(12)
    return b64(eph_pub + iv + AESGCM(kek).encrypt(iv, wrap, aad))


def unseal(sealed, priv, aad):
    AESGCM, _, X25519PublicKey, _ = crypto()
    blob = unb64(sealed)
    eph_pub, iv, ct = blob[:32], blob[32:44], blob[44:]
    pub = raw_pub(priv)
    kek = hashlib.sha256(b"dvorami:seal:" + priv.exchange(X25519PublicKey.from_public_bytes(eph_pub)) + eph_pub + pub).digest()
    return AESGCM(kek).decrypt(iv, ct, aad)


# ---------- реестр дела: quests/<id>/codes.json (в репозитории; секретов в нём нет) ----------
def registry_path(quest):
    return ROOT / "quests" / quest / "codes.json"


def load_registry(quest, path=None):
    p = pathlib.Path(path) if path else registry_path(quest)
    if p.exists():
        return json.loads(p.read_text(encoding="utf-8"))
    return {"quest": quest, "kdf": {"salt": b64(secrets.token_bytes(16)), "iter": ITER}, "issuer": None, "codes": []}


def save_registry(reg, path=None):
    p = pathlib.Path(path) if path else registry_path(reg["quest"])
    p.write_text(json.dumps(reg, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")


def code_aad(quest, ident):
    return f"dvorami:code:{quest}:{ident}".encode()


def issue(reg, n, label):
    if not reg.get("issuer"):
        sys.exit("В реестре нет ключа выпуска. Он появится после того, как владелец заведёт секрет QUEST_MASTER_CODE:\n"
                 "сборка Pages печатает его в журнале («ключ выпуска: …») — запишите: codes.py set-issuer --quest <id> КЛЮЧ")
    salt = unb64(reg["kdf"]["salt"])
    known = {c["id"] for c in reg["codes"]}
    out = []
    num = max([c["n"] for c in reg["codes"]] + [0])
    today = datetime.date.today().isoformat()
    while len(out) < n:
        code = new_code()
        ident, wrap = derive(code, salt, reg["kdf"]["iter"])
        if ident in known:
            continue
        num += 1
        known.add(ident)
        reg["codes"].append({"n": num, "id": ident, "label": label, "created": today, "revoked": None,
                             "seal": seal(wrap, reg["issuer"], code_aad(reg["quest"], ident))})
        out.append((num, code))
    return out


# ---------- сборка: зашифрованное дело для плеера ----------
SPOIL_FIELDS = ("scene", "walk", "outro", "place")


def build_locked(quest_json, reg, master, priv=None, log=print):
    """Возвращает словарь quest.locked.json. Без мастер-кода — таблица пуста: плеер покажет экран кода, ни один код не подойдёт."""
    AESGCM, _, _, _ = crypto()
    q = json.loads(quest_json) if isinstance(quest_json, (str, bytes)) else quest_json
    quest = reg["quest"]
    salt, it = unb64(reg["kdf"]["salt"]), reg["kdf"]["iter"]
    K = AESGCM.generate_key(bit_length=256)
    keys = {}

    def put(ident, wrap):
        iv = secrets.token_bytes(12)
        keys[ident] = b64(iv + AESGCM(wrap).encrypt(iv, K, f"dvorami:key:{quest}".encode()))

    if master:
        ident, wrap = derive(master, salt, it)
        put(ident, wrap)
        priv = priv or issuer_private(master)
        pub = b64(raw_pub(priv))
        log(f"ключ выпуска: {pub}")
        if reg.get("issuer") and reg["issuer"] != pub:
            log("::warning::ключ выпуска в реестре не совпадает с мастер-кодом — выпущенные коды не откроют дело "
                "(мастер-код сменили?). См. docs/codes.md, «Смена мастер-кода».")
        ok = bad = 0
        for c in reg["codes"]:
            if c.get("revoked"):
                continue
            try:
                put(c["id"], unseal(c["seal"], priv, code_aad(quest, c["id"])))
                ok += 1
            except Exception:
                bad += 1
        log(f"{quest}: мастер-код и {ok} выпущенных кодов" + (f", не распечатано {bad}" if bad else ""))
    else:
        log(f"::warning::{quest}: секрета QUEST_MASTER_CODE нет — дело зашифровано, но ни один код его не откроет "
            "(экран кода работает). Инструкция для владельца — docs/codes.md")
    iv = secrets.token_bytes(12)
    data = json.dumps(q, ensure_ascii=False, separators=(",", ":")).encode()
    return {"v": 1, "quest": quest, "title": q.get("title", ""), "district": q.get("district", ""),
            "kdf": {"name": "PBKDF2-SHA256", "salt": reg["kdf"]["salt"], "iter": it},
            "keys": keys, "iv": b64(iv), "data": b64(AESGCM(K).encrypt(iv, data, f"dvorami:quest:{quest}".encode())),
            "built": datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")}


def open_locked(locked, code):
    """Проверка в Python — то же, что unlock() в player.js (для тестов)."""
    AESGCM, _, _, _ = crypto()
    ident, wrap = derive(code, unb64(locked["kdf"]["salt"]), locked["kdf"]["iter"])
    w = locked["keys"].get(ident)
    if not w:
        return None
    w = unb64(w)
    K = AESGCM(wrap).decrypt(w[:12], w[12:], f"dvorami:key:{locked['quest']}".encode())
    return json.loads(AESGCM(K).decrypt(unb64(locked["iv"]), unb64(locked["data"]), f"dvorami:quest:{locked['quest']}".encode()))


# ---------- проверка утечки: в собранном сайте нет открытого текста дела ----------
def plain(s):
    s = re.sub(r"<[^>]+>", "", html.unescape(str(s or "")))
    s = re.sub(r"[\U0001F000-\U0001FFFF☀-➿️‍]", "", s)   # эмодзи шагов
    return re.sub(r"\s+", " ", s).strip()


def leak_needles(q):
    """Отрывки, которых не должно быть в опубликованных файлах: сцены, задания, подсказки, улики, финал; ответы (≥ 5 букв)."""
    texts, answers = [], set()

    # формат 5 (docs/quest-format.md): реплики, карточки, письмо, варианты, вопросы на ходу — тексты в любых вложенных полях
    def deep(x):
        if isinstance(x, str):
            texts.append(x)
        elif isinstance(x, list):
            for e in x:
                deep(e)
        elif isinstance(x, dict):
            for k, v in x.items():
                if k in ("text", "ok", "hints", "says", "scene", "outro", "lines", "back", "reply", "missing", "caption", "kids", "answer", "title", "label"):
                    deep(v)
                elif k in ("answers", "all", "replies", "options", "items", "near", "cards", "states", "walk_ask", "steps"):
                    if k in ("answers",):
                        for a in (v if isinstance(v, list) else [v]):
                            if isinstance(a, str):
                                a = plain(a).lstrip("~").lower()
                                if len(a) >= 5:
                                    answers.add(a)
                    else:
                        deep(v)

    for pt in q.get("points", []):
        for f in ("scene", "outro"):
            deep(pt.get(f))
        for st in pt.get("steps", []):
            deep(st)
        deep(pt.get("walk_ask"))
        deep(pt.get("cards"))
        deep(pt.get("kids"))
        c = pt.get("clue") or {}
        texts.append(c.get("says"))
    deep(q.get("finale"))
    deep(q.get("cards"))
    deep((q.get("letter") or {}).get("states"))
    snippets = set()
    for t in texts:
        if not isinstance(t, str):
            continue
        t = plain(t)
        for part in re.split(r"(?<=[.!?…»])\s+", t):
            part = part.strip()
            if len(part) >= 32:
                snippets.add(part[:48])
    return sorted(snippets), sorted(answers)


def leakcheck(site_dir, quests):
    site = pathlib.Path(site_dir)
    files = [p for p in site.rglob("*") if p.is_file() and p.suffix in (".html", ".js", ".json", ".css", ".txt", ".xml", ".md", ".svg")]
    corpus = {p: re.sub(r"\s+", " ", html.unescape(p.read_text(encoding="utf-8", errors="ignore"))) for p in files}
    problems = []
    for qid in quests:
        qf = ROOT / "quests" / qid / "quest.json"
        if not qf.exists():
            continue
        snippets, answers = leak_needles(json.loads(qf.read_text(encoding="utf-8")))
        for p, text in corpus.items():
            low = text.lower()
            for s in snippets:
                if s in text:
                    problems.append(f"{p.relative_to(site)}: текст дела {qid} в открытом виде: «{s}…»")
                    break
            # ответы ищем в данных и страницах плеера (не в коде интерфейса: «по годам» там — кнопка);
            # на страницах дел их ловит site_check по scripts/site_spoilers.json
            if "play" in p.relative_to(site).parts and p.suffix in (".json", ".html"):
                for a in answers:
                    if re.search(r"(?<![\w])" + re.escape(a) + r"(?![\w])", low):
                        problems.append(f"{p.relative_to(site)}: ответ дела {qid} в открытом виде: «{a}»")
        for p in site.glob(f"play/{qid}/quest.json"):
            problems.append(f"{p.relative_to(site)}: открытый quest.json в сайте")
    return problems


# ---------- команды ----------
def safe_out(path):
    p = pathlib.Path(path).expanduser().resolve()
    inside = ROOT in p.parents
    if inside and (ROOT / ".codes") not in p.parents:
        sys.exit(f"Файл с кодами нельзя класть в репозиторий ({p}). Укажите путь вне его или в .codes/ (она в .gitignore).")
    return p


def env_master():
    return (os.environ.get("QUEST_MASTER_CODE") or "").strip()


def main(argv=None):
    ap = argparse.ArgumentParser(description="Коды доступа к делам «Дворами» (docs/codes.md)")
    sub = ap.add_subparsers(dest="cmd", required=True)
    sub.add_parser("master", help="новый надёжный мастер-код")
    sub.add_parser("issuer", help="открытый ключ выпуска из QUEST_MASTER_CODE")
    s = sub.add_parser("set-issuer"); s.add_argument("--quest", default="zilart"); s.add_argument("key")
    s = sub.add_parser("issue"); s.add_argument("--quest", default="zilart"); s.add_argument("-n", type=int, default=1)
    s.add_argument("--label", default=""); s.add_argument("--out")
    s = sub.add_parser("revoke"); s.add_argument("--quest", default="zilart"); s.add_argument("code", nargs="?"); s.add_argument("--n", type=int)
    s = sub.add_parser("list"); s.add_argument("--quest", default="zilart")
    s = sub.add_parser("seal"); s.add_argument("--quest", default="zilart"); s.add_argument("--out", required=True)
    s.add_argument("--registry")
    s = sub.add_parser("leakcheck"); s.add_argument("site", nargs="?", default=str(ROOT / "site")); s.add_argument("--quest", action="append")
    s = sub.add_parser("selftest-bundle"); s.add_argument("--quest", default="zilart"); s.add_argument("--out", required=True)
    s.add_argument("--data")
    a = ap.parse_args(argv)

    if a.cmd == "master":
        print(new_code(3))
        print("Это мастер-код: вставьте его в секрет QUEST_MASTER_CODE (docs/codes.md) и сохраните в менеджере паролей. "
              "Никому не пересылайте и не пишите в чаты.", file=sys.stderr)
    elif a.cmd == "issuer":
        m = env_master()
        if not m:
            sys.exit("Задайте QUEST_MASTER_CODE в окружении")
        print(b64(raw_pub(issuer_private(m))))
    elif a.cmd == "set-issuer":
        reg = load_registry(a.quest)
        if len(unb64(a.key)) != 32:
            sys.exit("Ключ выпуска — 32 байта в base64 (строка из журнала сборки)")
        reg["issuer"] = a.key
        save_registry(reg)
        print(f"{registry_path(a.quest).relative_to(ROOT)}: ключ выпуска записан")
    elif a.cmd == "issue":
        reg = load_registry(a.quest)
        out = issue(reg, a.n, a.label)
        save_registry(reg)
        lines = [f"{a.quest} · {code} · № {n}" + (f" · {a.label}" if a.label else "") for n, code in out]
        if a.out:
            p = safe_out(a.out)
            p.parent.mkdir(parents=True, exist_ok=True)
            with open(p, "a", encoding="utf-8") as f:
                f.write("\n".join(lines) + "\n")
            os.chmod(p, 0o600)
            print(f"Выпущено {len(out)}: коды — в {p}; реестр — {registry_path(a.quest).relative_to(ROOT)} (закоммитить)")
        else:
            print("\n".join(lines))
            print(f"Реестр обновлён: {registry_path(a.quest).relative_to(ROOT)} — закоммитить; коды заработают после сборки стенда.", file=sys.stderr)
    elif a.cmd == "revoke":
        reg = load_registry(a.quest)
        target = None
        if a.n:
            target = next((c for c in reg["codes"] if c["n"] == a.n), None)
        elif a.code:
            ident, _ = derive(a.code, unb64(reg["kdf"]["salt"]), reg["kdf"]["iter"])
            target = next((c for c in reg["codes"] if c["id"] == ident), None)
        if not target:
            sys.exit("Код не найден в реестре (мастер-код отзывается сменой секрета — docs/codes.md)")
        target["revoked"] = datetime.date.today().isoformat()
        save_registry(reg)
        print(f"Код № {target['n']} отозван; перестанет открывать дело после следующей сборки стенда.")
    elif a.cmd == "list":
        reg = load_registry(a.quest)
        print(f"{a.quest}: ключ выпуска {'есть' if reg.get('issuer') else 'нет'}, кодов {len(reg['codes'])}")
        for c in reg["codes"]:
            print(f"  № {c['n']:>3} · {c['created']} · {'отозван ' + c['revoked'] if c.get('revoked') else 'действует'} · {c.get('label') or ''}")
    elif a.cmd == "seal":
        reg = load_registry(a.quest, a.registry)
        q = (ROOT / "quests" / a.quest / "quest.json").read_text(encoding="utf-8")
        locked = build_locked(q, reg, env_master())
        out = pathlib.Path(a.out)
        out.write_text(json.dumps(locked, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
        print(f"{a.quest}: зашифровано → {out} ({out.stat().st_size // 1024} КБ, кодов в таблице: {len(locked['keys'])})")
    elif a.cmd == "leakcheck":
        quests = a.quest or [p.parent.name for p in (ROOT / "quests").glob("*/quest.json")]
        problems = leakcheck(a.site, quests)
        if problems:
            print(f"leakcheck: {len(problems)} утечек")
            for p in problems[:40]:
                print(" ✗ " + p)
            sys.exit(1)
        print(f"leakcheck: OK — в {a.site} нет открытого текста дел ({', '.join(quests)})")
    elif a.cmd == "selftest-bundle":
        # Тест плеера: временный мастер-код и выпущенные коды — только в памяти и во временной папке, не в репозитории
        out = pathlib.Path(a.out)
        out.mkdir(parents=True, exist_ok=True)
        master = new_code(3)
        priv = issuer_private(master)
        reg = load_registry(a.quest)
        reg = {"quest": a.quest, "kdf": reg["kdf"], "issuer": b64(raw_pub(priv)), "codes": []}
        (n1, good), (n2, revoked) = issue(reg, 2, "selftest")
        reg["codes"][1]["revoked"] = datetime.date.today().isoformat()
        qf = pathlib.Path(a.data) if a.data else ROOT / "quests" / a.quest / "quest.json"
        locked = build_locked(qf.read_text(encoding="utf-8"), reg, master, priv, log=lambda *_: None)
        assert open_locked(locked, good) is not None and open_locked(locked, master.lower().replace("-", " ")) is not None
        assert open_locked(locked, revoked) is None and open_locked(locked, new_code()) is None
        (out / "quest.locked.json").write_text(json.dumps(locked, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
        print(json.dumps({"locked": str(out / "quest.locked.json"), "master": master, "code": good, "revoked": revoked}))


if __name__ == "__main__":
    main()

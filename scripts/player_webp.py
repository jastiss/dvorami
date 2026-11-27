#!/usr/bin/env python3
"""Лёгкие копии картинок плеера: рядом с каждой .jpg/.png в site/play/<дело>/media/ кладёт .webp.

  python3 scripts/player_webp.py [дело …]     — недостающие и устаревшие копии (без аргументов — все дела)
  python3 scripts/player_webp.py --check      — только проверить: 1, если копии нет или она старше исходника

Плеер берёт .webp, когда страница дела объявляет <body data-webp="1"> (site/play/player.js, picHtml); браузер без WebP и дело
без копии получают исходный файл. Длинная сторона — не больше 1080 px, качество 78: сцена 810×1080 весит 30–70 КБ вместо
90–160 КБ. Вес каждой копии (≤ 200 КБ) и её наличие сверяет scripts/player_check.js.
"""
import pathlib
import sys

from PIL import Image

ROOT = pathlib.Path(__file__).resolve().parent.parent
SIDE, QUALITY, LIMIT = 1080, 78, 200 * 1024


def main():
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    check = "--check" in sys.argv
    play = ROOT / "site" / "play"
    ids = args or sorted(p.name for p in play.iterdir() if (p / "media").is_dir())
    bad = 0
    for qid in ids:
        for src in sorted((play / qid / "media").rglob("*")):
            if src.suffix.lower() not in (".jpg", ".jpeg", ".png"):
                continue
            out = src.with_suffix(".webp")
            if out.exists() and out.stat().st_mtime >= src.stat().st_mtime:
                continue
            if check:
                print(f"нет свежей копии: {out.relative_to(ROOT)}")
                bad += 1
                continue
            im = Image.open(src)
            im = im.convert("RGBA" if im.mode in ("RGBA", "LA", "P") else "RGB")
            im.thumbnail((SIDE, SIDE), Image.LANCZOS)
            quality = QUALITY
            while True:
                im.save(out, "WEBP", quality=quality, method=6)
                if out.stat().st_size <= LIMIT or quality <= 50:
                    break
                quality -= 8
            print(f"{out.relative_to(ROOT)}: {out.stat().st_size // 1024} КБ (исходник {src.stat().st_size // 1024} КБ)")
    return 1 if bad else 0


if __name__ == "__main__":
    sys.exit(main())

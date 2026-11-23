"""Рисует картинки канала: docs/marketing/channel/img/src/*.html → docs/marketing/channel/img/*.png.

Размер берётся из <meta name="size" content="1080x1350">. Все запросы, кроме локальных файлов, блокируются.
  python3 scripts/channel_render.py            — все
  python3 scripts/channel_render.py 003        — только файлы, начинающиеся с 003
  python3 scripts/channel_render.py --preview  — ещё и превью 360 px (проверка «читается на телефоне»)
"""
import pathlib
import re
import sys

from playwright.sync_api import sync_playwright

ROOT = pathlib.Path(__file__).resolve().parent.parent
SRC = ROOT / "docs" / "marketing" / "channel" / "img" / "src"
OUT = SRC.parent


def main():
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    preview = "--preview" in sys.argv
    pages = [p for p in sorted(SRC.glob("*.html")) if not args or any(p.name.startswith(a) for a in args)]
    with sync_playwright() as pw:
        br = pw.chromium.launch()
        for src in pages:
            m = re.search(r'name="size" content="(\d+)x(\d+)"', src.read_text(encoding="utf-8"))
            w, h = (int(m.group(1)), int(m.group(2))) if m else (1080, 1350)
            ctx = br.new_context(viewport={"width": w, "height": h}, device_scale_factor=1)
            page = ctx.new_page()
            page.route("**/*", lambda r: r.continue_() if r.request.url.startswith(("file:", "data:")) else r.abort())
            page.goto(src.as_uri())
            page.evaluate("document.fonts.ready")
            page.wait_for_timeout(300)
            out = OUT / (src.stem + ".png")
            page.screenshot(path=str(out))
            print(f"{out.relative_to(ROOT)}  {w}×{h}")
            if preview:
                from PIL import Image  # превью как на экране телефона: 360 px по ширине
                Image.open(out).resize((360, round(360 * h / w)), Image.LANCZOS).save(
                    SRC / f"_preview-{src.stem}.png")
            ctx.close()
        br.close()


if __name__ == "__main__":
    main()

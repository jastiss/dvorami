import sys
from playwright.sync_api import sync_playwright
F='file:///home/claude/dvorami/site/assets/fonts/'
svg=open('pilaster.svg').read()
html=f'''<!doctype html><meta charset=utf-8><style>
@font-face{{font-family:Alegreya;font-weight:700;src:url({F}alegreya-cyrillic-700-normal.woff2)}}
@font-face{{font-family:'Alegreya Sans';font-weight:500;src:url({F}alegreya-sans-cyrillic-500-normal.woff2)}}
@font-face{{font-family:'Alegreya Sans';font-weight:700;src:url({F}alegreya-sans-cyrillic-700-normal.woff2)}}
html,body{{margin:0}}</style><body>{svg}<script>document.fonts.ready.then(()=>document.title='ok')</script>'''
open('pil.html','w').write(html)
with sync_playwright() as p:
    b=p.chromium.launch(); pg=b.new_page(viewport={'width':1200,'height':900})
    pg.route('**/*', lambda r: r.continue_() if r.request.url.startswith('file:') else r.abort())
    pg.goto('file://'+__import__('os').path.abspath('pil.html')); pg.wait_for_function("document.title=='ok'"); pg.wait_for_timeout(200)
    pg.screenshot(path=sys.argv[1], type='jpeg', quality=84, clip={'x':0,'y':0,'width':1200,'height':900}); b.close()

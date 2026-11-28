#!/usr/bin/env python3
"""Сценарий для чтения из quests/<id>/quest.json формата 5 (docs/quest-format.md): то, что увидит игрок, по порядку.

  python3 scripts/screenplay.py zilart                 → quests/zilart/story/v5/screenplay-<версия>.md
  python3 scripts/screenplay.py zilart --out путь.md   [--prev 5.6] [--date 28.11.2026] [--flags st2:A,st5:A]

Показана действующая ветка (флаги дела; --flags — посмотреть другую). Метки сцен (3.1, 10.2) — номер точки и шага
в действующей ветке; w1 — вопрос на ходу. 🔊 — у реплики есть запись. Файл не правится руками: правки — в quest.json.
(quest_render.py понимает только формат 3.)
"""
import argparse
import datetime
import html
import json
import pathlib
import re

ROOT = pathlib.Path(__file__).resolve().parent.parent
SRC = {'place': 'ответ — с места', 'text': 'ответ — из текста дела', 'both': 'нужны и место, и текст'}
KIND = {'ask': 'Вопрос (ответ вписывают)', 'free': 'Вопрос (ответ свободный, засчитывается любой)', 'choice': 'Выбор',
        'pick': 'Выбор двух улик', 'strike': 'Вычёркивание на плане'}


def md(text):
    t = str(text or '')
    t = re.sub(r'</?b>', '**', t)
    t = re.sub(r'</?i>', '_', t)
    t = re.sub(r'<[^>]+>', '', t)
    return html.unescape(t).replace('\n', '  \n')


class Render:
    def __init__(self, q, flags):
        self.q, self.flags, self.out = q, flags, []
        self.cards = {}
        self._scan(q)

    def _scan(self, x):
        if isinstance(x, list):
            for v in x:
                self._scan(v)
        elif isinstance(x, dict):
            if x.get('id') and x.get('title') and 'text' in x and 'type' not in x:
                self.cards.setdefault(x['id'], x)
            for v in x.values():
                self._scan(v)

    def ok(self, cond):
        if not cond or not isinstance(cond, str):
            return True
        m = re.match(r'^\s*([\w-]+)\s*(!?=)\s*(.+?)\s*$', cond)
        if not m:
            return True
        k, op, vals = m.group(1), m.group(2), [v.strip() for v in m.group(3).split('|')]
        if k in (self.q.get('clock') or {}):          # ветка по часам: в сценарии — «открыто»
            cur = 'open'
        else:
            cur = str(self.flags.get(k, 'A'))
        return (cur in vals) if op == '=' else (cur not in vals)

    def live(self, items):
        return [x for x in (items if isinstance(items, list) else [items]) if not (isinstance(x, dict) and not self.ok(x.get('if')))]

    def w(self, s=''):
        self.out.append(s)

    def line(self, l):
        if isinstance(l, str):
            self.w(md(l)); self.w(); return
        if l.get('arrow'):
            self.w(f"*Стрелка-подсказка интерфейса: {md(l['text'])}*"); self.w(); return
        if l.get('doc') == 'letter':
            self.w('*[На экране — письмо' + ('; линии «на просвет» открываются касанием' if l.get('tap') else '') + ']*'); self.w(); return
        if l.get('doc') == 'card':
            c = self.cards.get(l.get('id'), {})
            self.w('*[На экране — ' + ('план завода из картотеки' if l.get('id') == 'c-zilplan' else 'карточка «' + md(c.get('title', '')) + '»') + ']*'); self.w(); return
        if 'img' in l or l.get('layers'):
            cap = (' — ' + md(l['caption'])) if l.get('caption') else ''
            none = '' if (l.get('img') or l.get('layers')) else ' · картинки пока нет'
            self.w(f"*[Кадр: {md(l.get('alt', ''))}{cap}{none}]*"); self.w()
            if not l.get('text'):
                return
        if l.get('text') is None:
            return
        if not l.get('who'):
            self.w(md(l['text'])); self.w(); return
        sp = (self.q.get('speakers') or {}).get(l['who'], {})
        name = sp.get('name', l['who'])
        note = f" *({md(l['note'])})*" if l.get('note') else ''
        snd = ' 🔊' if isinstance(l.get('audio'), str) and l['audio'] else ''
        self.w(f"**{name}**{note}{snd}: {md(l['text'])}"); self.w()

    def lines(self, items):
        for l in self.live(items or []):
            self.line(l)

    def cards_out(self, st):
        for c in st.get('cards') or []:
            c = self.cards.get(c if isinstance(c, str) else c.get('id'), c if isinstance(c, dict) else {})
            if c.get('title'):
                self.w(f"*На доску: «{md(c['title'])}» — {md(c.get('text', ''))}*"); self.w()

    def field(self, st, label):
        kind = KIND.get(st.get('type'), st.get('type', ''))
        opt = ' · по желанию' if st.get('optional') else ''
        src = (' · ' + SRC[st['src']]) if st.get('src') in SRC else ''
        self.w(f"**{label} {kind}{opt}{src}**" if not label.endswith('желанию.') else f"**{label} {kind}{src}**"); self.w()
        self.lines(st.get('lines'))
        ph = f" *({md(st['placeholder'])})*" if st.get('placeholder') else ''
        self.w(f"> **{md(st.get('text', ''))}**{ph}"); self.w()
        t = st.get('type')
        if t == 'choice':
            right = st.get('answer') if isinstance(st.get('answer'), list) else [st.get('answer')]
            opts = self.live(st.get('options') or [])
            anyone = len(right) >= len(opts)
            for o in opts:
                mark = ' ✅' if (o.get('id') in right and not anyone) else ''
                rep = f" — *«{md(o['reply'])}»*" if o.get('reply') else ''
                self.w(f"> - {md(o.get('label', ''))}{mark}{rep}"); self.w()
            if anyone:
                self.w('> *Засчитывается любой вариант.*'); self.w()
        elif t == 'pick':
            names = ['«' + md(self.cards.get(i, {}).get('title', i)) + '»' for i in (st.get('answers') or [[]])[0]]
            self.w('> Ответ: улики ' + ' и '.join(names) + '.'); self.w()
        elif t == 'strike':
            items = st.get('items') or []
            self.w('> Вычеркнуть: ' + ', '.join(md(i['label']) for i in items if not i.get('keep')) + '. Оставить: ' + ', '.join(md(i['label']) for i in items if i.get('keep')) + '.'); self.w()
        elif t == 'ask':
            ans = [a for a in st.get('answers') or [] if isinstance(a, str)]
            if ans:
                more = f" (принимается ещё {len(ans) - 1} форм)" if len(ans) > 1 else ''
                self.w(f"> Ответ: **{md(ans[0])}**{more}"); self.w()
        for r in st.get('replies') or []:
            first = [a for a in r.get('answers') or [] if isinstance(a, str)]
            if first:
                self.w(f"> «Почти» на «{md(first[0].lstrip('~'))}…»: *{md(r.get('text', ''))}*"); self.w()
        for i, h in enumerate(st.get('hints') or [], 1):
            self.w(f"> Подсказка {i}: {md(h)}"); self.w()
        if st.get('ok'):
            self.w(); self.w('После ответа:'); self.w()
            self.lines(st['ok'] if isinstance(st['ok'], list) else [st['ok']])
        self.cards_out(st)
        self.w()

    def point(self, p):
        self.w(f"## {p['n']}. {md(p['title'])}"); self.w()
        dist = p.get('walk_m')
        if isinstance(dist, list):
            dist = next((d.get('m') for d in self.live(dist) if isinstance(d, dict)), None)
        self.w(f"*{md(p.get('place', ''))}*" + (f" · идти {dist} м" if dist else '')); self.w(); self.w()
        self.w('**Дорога**'); self.w()
        self.lines(p.get('walk') if isinstance(p.get('walk'), list) else [p.get('walk')])
        self.w()
        asks = p.get('walk_ask') or []
        for i, a in enumerate(self.live(asks if isinstance(asks, list) else [asks]), 1):
            a = dict(a); a.setdefault('type', 'choice' if a.get('options') else 'ask')
            self.field(a, f"{p['n']}.w{i} На ходу, по желанию.")
        if p.get('scene'):
            self.w('**На месте**'); self.w()
            self.lines(p['scene']); self.w()
        k = 0
        for st in self.live(p.get('steps') or []):
            k += 1
            if st.get('type') in ('say', 'info', 'board'):
                self.w(f"**{p['n']}.{k}. {md(st.get('title') or 'Сцена')}**" + (' · по желанию' if st.get('optional') else '')); self.w()
                self.lines(st.get('lines')); self.cards_out(st); self.w()
            else:
                self.field(st, f"{p['n']}.{k}.")
        for kid in ([p['kids']] if isinstance(p.get('kids'), (str, dict)) else p.get('kids') or []):
            kid = {'text': kid} if isinstance(kid, str) else kid
            self.w('*Для самых маленьких: ' + md(kid.get('text', '')) + (f" — {md(kid['answer'])}" if kid.get('answer') else '') + '*'); self.w(); self.w()

    def run(self, head):
        self.w(head); self.w()
        self.w('## Вступление'); self.w()
        for block in self.q.get('intro') or []:
            self.lines(block if isinstance(block, list) else [block])
        self.w()
        for p in self.q.get('points') or []:
            self.point(p)
        self.w('## Финал'); self.w()
        for block in self.q.get('finale') or []:
            self.lines(block if isinstance(block, list) else [block])
        return re.sub(r'\n{4,}', '\n\n\n', '\n'.join(self.out)).rstrip() + '\n'


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('quest', nargs='?', default='zilart')
    ap.add_argument('--out'); ap.add_argument('--prev'); ap.add_argument('--date'); ap.add_argument('--flags', default='')
    a = ap.parse_args()
    qf = ROOT / 'quests' / a.quest / 'quest.json'
    q = json.loads(qf.read_text(encoding='utf-8'))
    flags = dict(q.get('flags') or {})
    for pair in filter(None, a.flags.split(',')):
        k, v = re.split(r'[:=]', pair, maxsplit=1); flags[k] = v
    ver = q.get('version', '')
    date = a.date or datetime.date.today().strftime('%d.%m.%Y')
    title = re.sub(r'^Дело\b', 'Дело', q.get('title', ''))
    head = (f"# {(q.get('district') or a.quest).upper()} {ver} · «{title}» · сценарий для чтения\n\n"
            f"Собран из `quests/{a.quest}/quest.json` {ver} ({date}) скриптом `scripts/screenplay.py`: это ровно то, что увидит игрок, в порядке прохождения. "
            f"Показана действующая ветка (флаги натуры — как в деле сейчас; запасные ветки — в quest.json"
            + (f"; здесь с флагами {a.flags}" if a.flags else '') + '). '
            + (f"Что изменилось против {a.prev} — `quests/{a.quest}/story/changes-{ver}.md`. " if a.prev else '')
            + 'Метки сцен (3.1, 10.2) — чтобы комментировать по номеру. 🔊 — реплика уже озвучена.')
    out = pathlib.Path(a.out) if a.out else ROOT / 'quests' / a.quest / 'story' / 'v5' / f'screenplay-{ver}.md'
    out.write_text(Render(q, flags).run(head), encoding='utf-8')
    print(out)


if __name__ == '__main__':
    main()

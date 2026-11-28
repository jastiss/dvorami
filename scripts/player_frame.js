#!/usr/bin/env node
/* Кадр плеера для витрины («Как это выглядит» на главной): экран дела в настоящем плеере site/play/<id>/.
 *   node scripts/player_frame.js --quest=zilart --point=0 --step=3 --out=site/assets/play/frame-riddle.jpg
 *   node scripts/player_frame.js --quest=zilart --point=2 --phase=walk --open --out=site/assets/play/frame-walk.jpg
 *   [--theme=dark|light] [--quality=80]
 * Дело открывается без кода (данные quests/<id>/quest.json подставляются, как в player_check --data), прогресс — точка
 * --point (индекс с нуля) и шаг --step; плеер листается «Дальше» до поля ответа (phase=step) или до «Мы на месте» (walk).
 * Подсказки интерфейса («стрелки») считаются увиденными. Окно 390×780 @2x → JPEG 780×1560 (team/std/site-check.md).
 * Внешние запросы блокируются. Ответов на экране нет: поле пустое, подсказки закрыты.
 * Сменилась версия сценария — переснять кадры и вписать версию в platform/site/story-sync.json → <id>.screens (story_drift.js). */
'use strict';
const { chromium } = require('playwright');
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

const args = Object.fromEntries(process.argv.slice(2).map(a => { const m = a.match(/^--([\w-]+)(?:=(.*))?$/); return m ? [m[1], m[2] == null ? true : m[2]] : [a, true]; }));
const REPO = path.resolve(__dirname, '..');
const QID = args.quest || 'zilart';
const QF = path.join(REPO, 'quests', QID, 'quest.json');
const phase = args.phase || 'step';
if (!args.out || !fs.existsSync(QF)) { console.error('нужно --out=путь.jpg и quests/<id>/quest.json'); process.exit(2); }
const PORT = 8000 + Math.floor(Math.random() * 900);

(async () => {
  const srv = spawn('python3', ['-m', 'http.server', String(PORT), '--bind', '127.0.0.1'], { cwd: path.join(REPO, 'site'), stdio: 'ignore' });
  await new Promise(r => setTimeout(r, 800));
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 390, height: 780 }, deviceScaleFactor: 2, reducedMotion: 'reduce' });
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', e => errs.push(String(e)));
  await page.route('**/*', r => {
    const u = r.request().url();
    if (!u.startsWith(`http://127.0.0.1:${PORT}`)) return r.abort();
    if (/quest\.locked\.json/.test(u)) return r.fulfill({ status: 404 });
    if (/\/quest\.json(\?|$)/.test(u)) return r.fulfill({ path: QF, contentType: 'application/json' });
    return r.continue();
  });
  const q = JSON.parse(fs.readFileSync(QF, 'utf8'));
  const seen = Object.fromEntries(['sound', 'image', 'board', 'hint', 'plus', 'letter', 'plan'].map(k => [k, 'shown']));
  const st = { v: 1, quest: QID, version: q.version, phase, p: +(args.point || 0), k: +(args.step || 0), hint: 0, res: [], board: [], events: [],
    t_start: Date.now() - 1800000, f: -1, seed: 12345, arrows: seen };
  await page.addInitScript(([t, key, s]) => { try { localStorage.setItem('dvorami:theme', t); localStorage.setItem(key, s); } catch (e) {} },
    [args.theme || 'dark', 'dvorami:play:' + QID, JSON.stringify(st)]);
  await page.goto(`http://127.0.0.1:${PORT}/play/${QID}/`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(800);
  const target = phase === 'step' ? '#ans' : '[data-act="here"]';
  for (let i = 0; i < 15 && !(await page.$(target)); i++) {
    const n = await page.$('#app .pl-bar [data-act="next"], #app .pl-bar [data-act="fwd"]');
    if (!n) break;
    await n.click(); await page.waitForTimeout(350);
  }
  if (!(await page.$(target))) { console.error(`не дошли до экрана ${target}`); await b.close(); srv.kill(); process.exit(1); }
  // --open: раскрыть «Напомнить дорогу» на экране «идём» — в кадре видно расстояние, маршрут и кнопку карты
  if (args.open) await page.evaluate(() => [].forEach.call(document.querySelectorAll('#frame .pl-road--go details'), d => { d.open = true; }));
  await page.evaluate(() => { if (document.activeElement) document.activeElement.blur(); scrollTo(0, 0); });
  await page.waitForTimeout(250);
  await page.screenshot({ path: args.out, type: 'jpeg', quality: +(args.quality || 80) });
  const head = await page.$eval('.pl-top', e => e.innerText.replace(/\s+/g, ' ')).catch(() => '');
  console.log(`${args.out}: ${QID} ${q.version}, ${head}${errs.length ? ' · ошибки JS: ' + errs.join('; ') : ''}`);
  await b.close(); srv.kill();
  process.exit(errs.length ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });

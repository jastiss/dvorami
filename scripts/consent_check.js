#!/usr/bin/env node
/* Проверка согласия на cookie и подключения Метрики: node scripts/consent_check.js [--shots=папка]
 *
 * Зачем отдельный скрипт: в site_check.js аналитика не проверяется — на localhost она намеренно выключена
 * (флаг LOCAL в site/assets/analytics.js), иначе каждый запуск автотеста слал бы данные в Метрику.
 * Здесь мы включаем её отладочным параметром ?analytics=on и смотрим главное (152-ФЗ, docs/legal/checklist.md):
 *   1. до согласия — ни одного запроса к mc.yandex.ru и ни одной cookie;
 *   2. плашка видна на 390 и 1440, обе кнопки с текстом;
 *   3. «Согласен» → грузится tag.js и вызывается init с номером счётчика, который положен этому адресу
 *      (dvorami.ru → боевой счётчик, остальное → счётчик стенда; подмена адреса — ?debug=analytics&host=…);
 *   4. «Отказаться» → по-прежнему ни запросов, ни cookie; решение помнится после перезагрузки;
 *   5. кнопка «Настройки cookie» на странице политики показывает плашку снова.
 * Внешние запросы блокируются: до Метрики реально ничего не доходит, мы лишь считаем попытки.
 * Выход: 0 — всё чисто, 1 — список ошибок.
 */
'use strict';
const { chromium } = require('playwright');
const { spawn } = require('child_process');
const http = require('http');
const path = require('path');
const fs = require('fs');

const ROOT = path.resolve(__dirname, '..', 'site');
const PORT = 9000 + Math.floor(Math.random() * 900);
const BASE = `http://127.0.0.1:${PORT}`;
const PAGE = '/legal/privacy/';
const ID_PROD = '114590802';
const ID_STAND = '114590642';
const args = Object.fromEntries(process.argv.slice(2).map(a => a.replace(/^--/, '').split('=')));

const errors = [];
const err = m => errors.push(m);
const ok = m => console.log('   · ' + m);

function status(url) {
  return new Promise(res => { http.get(url, r => { r.resume(); res(r.statusCode); }).on('error', () => res(0)); });
}
async function waitServer() {
  for (let i = 0; i < 50; i++) { if (await status(BASE + '/') === 200) return; await new Promise(r => setTimeout(r, 150)); }
  throw new Error('локальный сервер не поднялся');
}

/* Открывает страницу, считая внешние запросы; возвращает контекст с хелперами */
async function open(browser, vp, url) {
  const ctx = await browser.newContext({ viewport: vp, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  const ym = [];            // запросы к mc.yandex.ru
  const consoleErr = [];
  await page.route('**/*', route => {
    const u = route.request().url();
    if (/mc\.yandex\.ru/.test(u)) { ym.push(u); return route.abort(); }
    if (u.startsWith(BASE)) return route.continue();
    return route.abort();
  });
  page.on('console', m => { if (m.type() === 'error' && !/ERR_FAILED|ERR_BLOCKED|net::/.test(m.text())) consoleErr.push(m.text()); });
  page.on('pageerror', e => consoleErr.push('JS: ' + e.message));
  await page.goto(BASE + url, { waitUntil: 'load' });
  await page.waitForTimeout(500);
  return { ctx, page, ym, consoleErr };
}

const banner = page => page.locator('.dv-consent');
const initCalls = page => page.evaluate(() =>
  (window.ym && window.ym.a ? Array.prototype.map.call(window.ym.a, a => Array.prototype.slice.call(a)) : [])
    .filter(c => c[1] === 'init'));

(async () => {
  const server = spawn('python3', ['-m', 'http.server', String(PORT), '--bind', '127.0.0.1'], { cwd: ROOT, stdio: 'ignore' });
  process.on('exit', () => { try { server.kill(); } catch (e) {} });
  await waitServer();
  for (const p of [PAGE, '/legal/consent/']) {
    const st = await status(BASE + p);
    if (st !== 200) err(`страница ${p} → ${st}`);
  }

  const browser = await chromium.launch();
  const shots = args.shots;
  if (shots) fs.mkdirSync(shots, { recursive: true });

  for (const vp of [{ width: 390, height: 844 }, { width: 1440, height: 900 }]) {
    const tag = vp.width;
    console.log(`\n— ${tag} px`);

    /* 1–3. Плашка, отсутствие запросов до согласия, согласие → счётчик стенда */
    let s = await open(browser, vp, PAGE + '?analytics=on&debug=analytics');
    if (!(await banner(s.page).isVisible())) err(`${tag}: плашка согласия не показалась`);
    else ok('плашка видна');
    for (const sel of ['[data-consent="yes"]', '[data-consent="no"]']) {
      const b = s.page.locator('.dv-consent ' + sel);
      const t = (await b.count()) ? (await b.innerText()).trim() : '';
      if (!t) err(`${tag}: кнопка ${sel} без текста`);
    }
    if (s.ym.length) err(`${tag}: до согласия ушёл запрос к Метрике: ${s.ym[0]}`); else ok('до согласия запросов к mc.yandex.ru нет');
    const cookies = await s.ctx.cookies();
    if (cookies.length) err(`${tag}: до согласия поставлены cookie: ${cookies.map(c => c.name).join(', ')}`); else ok('cookie не поставлены');
    const docCookie = await s.page.evaluate(() => document.cookie);
    if (docCookie) err(`${tag}: document.cookie не пуст: ${docCookie}`);
    if (shots) await s.page.screenshot({ path: path.join(shots, `privacy-${tag}-banner.png`) });

    await s.page.locator('.dv-consent [data-consent="yes"]').click();
    await s.page.waitForTimeout(600);
    if (await banner(s.page).isVisible()) err(`${tag}: после «Согласен» плашка не исчезла`);
    if (!s.ym.some(u => /\/metrika\/tag\.js/.test(u))) err(`${tag}: после «Согласен» tag.js не запрашивался`);
    else ok('после «Согласен» запрошен mc.yandex.ru/metrika/tag.js');
    let inits = await initCalls(s.page);
    if (!inits.length) err(`${tag}: не вызван ym(init)`);
    else {
      if (String(inits[0][0]) !== ID_STAND) err(`${tag}: на стенде счётчик ${inits[0][0]}, ожидался ${ID_STAND}`);
      else ok(`init со счётчиком стенда ${ID_STAND}`);
      const o = inits[0][2] || {};
      for (const [k, v] of [['ssr', true], ['clickmap', true], ['trackLinks', true], ['accurateTrackBounce', true], ['ecommerce', 'dataLayer']]) {
        if (o[k] !== v) err(`${tag}: в init нет параметра ${k}=${v} (сейчас ${JSON.stringify(o[k])})`);
      }
      if (o.webvisor !== true) err(`${tag}: вебвизор должен быть включён на обычной странице (сейчас ${JSON.stringify(o.webvisor)})`);
    }
    const state = await s.page.locator('[data-consent-state]').innerText();
    if (!/согласились/.test(state)) err(`${tag}: состояние согласия на странице: «${state}»`);
    if (shots) { await s.page.evaluate(() => window.scrollTo(0, 0)); await s.page.screenshot({ path: path.join(shots, `privacy-${tag}-full.jpg`), fullPage: true, quality: 80 }); }

    /* Решение помнится после перезагрузки */
    await s.page.reload({ waitUntil: 'load' });
    await s.page.waitForTimeout(500);
    if (await banner(s.page).isVisible()) err(`${tag}: после перезагрузки плашка показалась снова, хотя согласие уже дано`);

    /* 5. «Настройки cookie» → плашка снова, «Отказаться» → ничего не грузится */
    await s.page.locator('[data-consent-reset]').click();
    await s.page.waitForTimeout(300);
    if (!(await banner(s.page).isVisible())) err(`${tag}: «Настройки cookie» не показали плашку снова`);
    else ok('«Настройки cookie» показывают плашку снова');
    if (shots) await s.page.screenshot({ path: path.join(shots, `privacy-${tag}-cookie-settings.png`) });
    await s.page.locator('.dv-consent [data-consent="no"]').click();
    await s.page.waitForTimeout(300);
    const before = s.ym.length;
    await s.page.reload({ waitUntil: 'load' });
    await s.page.waitForTimeout(700);
    if (await banner(s.page).isVisible()) err(`${tag}: после отказа плашка показывается снова`);
    if (s.ym.length > before) err(`${tag}: после отказа ушёл запрос к Метрике: ${s.ym[before]}`);
    else ok('после отказа запросов к Метрике нет');
    const state2 = await s.page.locator('[data-consent-state]').innerText();
    if (!/отказались/.test(state2)) err(`${tag}: состояние после отказа: «${state2}»`);
    s.consoleErr.forEach(e => err(`${tag}: консоль: ${e.slice(0, 200)}`));
    await s.ctx.close();

    /* 3б. Боевой адрес → боевой счётчик (адрес подменён отладочным параметром) */
    s = await open(browser, vp, PAGE + '?analytics=on&debug=analytics&host=dvorami.ru');
    await s.page.locator('.dv-consent [data-consent="yes"]').click();
    await s.page.waitForTimeout(600);
    inits = await initCalls(s.page);
    if (!inits.length) err(`${tag}: (боевой адрес) не вызван ym(init)`);
    else if (String(inits[0][0]) !== ID_PROD) err(`${tag}: для dvorami.ru счётчик ${inits[0][0]}, ожидался ${ID_PROD}`);
    else ok(`для dvorami.ru init со счётчиком ${ID_PROD}`);
    s.consoleErr.forEach(e => err(`${tag}: консоль (боевой адрес): ${e.slice(0, 200)}`));
    await s.ctx.close();

    /* В плеере вебвизор не включаем: там вводят ответы */
    s = await open(browser, vp, '/play/zilart/?analytics=on&debug=analytics');
    if (await banner(s.page).isVisible()) await s.page.locator('.dv-consent [data-consent="yes"]').click();
    else err(`${tag}: в плеере плашка согласия не показалась`);
    await s.page.waitForTimeout(600);
    inits = await initCalls(s.page);
    if (inits.length && inits[0][2] && inits[0][2].webvisor !== false) err(`${tag}: в плеере вебвизор включён (${JSON.stringify(inits[0][2].webvisor)})`);
    else if (inits.length) ok('в плеере вебвизор выключен');
    await s.ctx.close();

    /* Страница согласия: скриншоты и отсутствие ошибок */
    s = await open(browser, vp, '/legal/consent/');
    if (shots) { await s.page.screenshot({ path: path.join(shots, `consent-${tag}-full.jpg`), fullPage: true, quality: 80 }); }
    s.consoleErr.forEach(e => err(`${tag}: консоль (/legal/consent/): ${e.slice(0, 200)}`));
    await s.ctx.close();
  }

  await browser.close();
  try { server.kill(); } catch (e) {}
  const uniq = [...new Set(errors)];
  if (uniq.length) {
    console.log(`\nconsent_check: ${uniq.length} ошибок\n`);
    uniq.forEach(e => console.log(' ✗ ' + e));
    process.exit(1);
  }
  console.log('\nconsent_check: OK — согласие спрашивается, до согласия Метрика не грузится, счётчики по адресу верные');
  process.exit(0);
})().catch(e => { console.error(e); process.exit(2); });

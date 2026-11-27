#!/usr/bin/env node
/* Версия офлайн-кеша плеера (site/play/sw.js; плейбук Инженера, «Типовые ошибки»: каждый выпуск меняет версию кеша).
 *   node scripts/sw_version.js          — печатает версию: первые 12 знаков sha256 файлов плеера
 *   node scripts/sw_version.js --write  — вписывает её в site/play/sw.js (var BUILD = '…'); pages.yml — перед выкладкой
 * Хеш — от того, что плеер кладёт в кеш и что меняет его поведение: site/play/*.js и *.css, страницы и темы дел
 * (site/play/<id>/index.html, theme.css), шрифты и аналитика страницы (site/assets/fonts.css, analytics.js). Строка BUILD в sw.js
 * в хеш не входит — повторный --write ничего не меняет. Дело (quest.locked.json) и картинки в хеш не входят: их sw.js берёт из
 * сети в первую очередь, а новое шифрование дела при каждой сборке не должно сбрасывать кеш у игроков.
 * Новый хеш → новый sw.js → браузер ставит его: install кладёт каркас и открытые страницы в новый кеш, activate удаляет
 * старые dvorami-play-*, плеер по controllerchange досылает остальное (warmCache). Проверка — player_check, блок «офлайн». */
'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const REPO = path.resolve(__dirname, '..');
const SW = path.join(REPO, 'site', 'play', 'sw.js');
const LINE = /var BUILD = '[^'\n]*';/;

function files(root) {
  root = root || REPO;
  const play = path.join(root, 'site', 'play');
  const out = [];
  for (const f of fs.readdirSync(play)) {
    const p = path.join(play, f);
    if (fs.statSync(p).isFile() && /\.(js|css)$/.test(f)) out.push(p);
    else if (fs.statSync(p).isDirectory()) for (const g of ['index.html', 'theme.css']) if (fs.existsSync(path.join(p, g))) out.push(path.join(p, g));
  }
  for (const g of ['fonts.css', 'analytics.js']) { const p = path.join(root, 'site', 'assets', g); if (fs.existsSync(p)) out.push(p); }
  return out.sort();
}

function version(root) {
  root = root || REPO;
  const h = crypto.createHash('sha256');
  for (const f of files(root)) {
    let body = fs.readFileSync(f);
    if (path.basename(f) === 'sw.js') body = Buffer.from(body.toString('utf8').replace(LINE, "var BUILD = 'dev';"));
    h.update(path.relative(root, f).split(path.sep).join('/') + '\0');
    h.update(body);
    h.update('\0');
  }
  return h.digest('hex').slice(0, 12);
}

function stamp(src, ver) {
  if (!LINE.test(src)) throw new Error("в sw.js нет строки var BUILD = '…'; — версию кеша некуда вписать");
  if (!/^[0-9A-Za-z_-]{1,40}$/.test(ver)) throw new Error('версия кеша — только буквы, цифры, «-» и «_»');
  return src.replace(LINE, `var BUILD = '${ver}';`);
}

module.exports = { version, stamp, files };

if (require.main === module) {
  const v = version();
  if (process.argv.includes('--write')) {
    fs.writeFileSync(SW, stamp(fs.readFileSync(SW, 'utf8'), v));
    console.log(`sw_version: site/play/sw.js — кеш dvorami-play-${v}`);
  } else console.log(v);
}

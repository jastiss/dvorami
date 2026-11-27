#!/usr/bin/env node
/* Версия офлайн-кеша плеера (site/play/sw.js; плейбук Инженера, «Типовые ошибки»: каждый выпуск меняет версию кеша).
 *   node scripts/sw_version.js          — печатает версию: первые 12 знаков sha256 файлов плеера
 *   node scripts/sw_version.js --write  — вписывает её в site/play/sw.js (var BUILD = '…'); pages.yml — перед выкладкой
 * Хеш — от того, что плеер кладёт в кеш и что меняет его поведение: site/play/*.js и *.css, страницы и темы дел
 * (site/play/<id>/index.html, theme.css), медиа дел (site/play/<id>/media/** — картинки и звук), шрифты и аналитика страницы
 * (site/assets/fonts.css, analytics.js). Строка BUILD в sw.js в хеш не входит — повторный --write ничего не меняет.
 * Медиа — в хеше (T-160, рецензент 28.11): sw.js отдаёт их сначала из кеша и обновляет один раз за жизнь sw.js, так что
 * заменённая картинка или запись с тем же именем без новой версии кеша доходила до игрока только со следующим выпуском плеера.
 * Дело (quest.locked.json) в хеш не входит: его sw.js берёт из сети в первую очередь, а новое шифрование дела при каждой
 * сборке не должно сбрасывать кеш у игроков. Самопроверка — selftest() (идёт в каждом player_check).
 * Новый хеш → новый sw.js → браузер ставит его: install кладёт каркас и открытые страницы в новый кеш, activate удаляет
 * старые dvorami-play-*, плеер по controllerchange досылает остальное (warmCache). Проверка — player_check, блок «офлайн». */
'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const REPO = path.resolve(__dirname, '..');
const SW = path.join(REPO, 'site', 'play', 'sw.js');
const LINE = /var BUILD = '[^'\n]*';/;

// все файлы папки медиа дела, с подпапками (scenes/, audio/…); скрытые (.DS_Store) — нет
function walk(dir, out) {
  if (!fs.existsSync(dir)) return;
  for (const f of fs.readdirSync(dir)) {
    if (f.startsWith('.')) continue;
    const p = path.join(dir, f);
    if (fs.statSync(p).isDirectory()) walk(p, out); else out.push(p);
  }
}

function files(root) {
  root = root || REPO;
  const play = path.join(root, 'site', 'play');
  const out = [];
  for (const f of fs.readdirSync(play)) {
    const p = path.join(play, f);
    if (fs.statSync(p).isFile() && /\.(js|css)$/.test(f)) out.push(p);
    else if (fs.statSync(p).isDirectory()) {
      for (const g of ['index.html', 'theme.css']) if (fs.existsSync(path.join(p, g))) out.push(path.join(p, g));
      walk(path.join(p, 'media'), out);
    }
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

// T-160: замена картинки или записи дела меняет версию кеша, новое шифрование дела — нет. Пусто — всё верно.
function selftest() {
  const os = require('os');
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'dvorami-swv-'));
  const put = (rel, body) => { const f = path.join(root, rel); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, body); };
  const out = [];
  try {
    put('site/play/sw.js', "var BUILD = 'dev';\n"); put('site/play/player.js', '//');
    put('site/play/x/index.html', '<p>'); put('site/play/x/quest.locked.json', '{"a":1}');
    put('site/play/x/media/scenes/s01.webp', 'A'); put('site/play/x/media/audio/a.mp3', 'A');
    const v0 = version(root);
    put('site/play/x/quest.locked.json', '{"a":2}');
    if (version(root) !== v0) out.push('sw_version: новое шифрование дела (quest.locked.json) сменило версию кеша — у игроков сбросится офлайн при каждой сборке');
    put('site/play/x/media/scenes/s01.webp', 'B');
    const v1 = version(root);
    if (v1 === v0) out.push('sw_version: замена картинки в site/play/<дело>/media/ не меняет версию кеша (T-160) — игрок увидит старую');
    put('site/play/x/media/audio/a.mp3', 'B');
    if (version(root) === v1) out.push('sw_version: замена записи в site/play/<дело>/media/audio/ не меняет версию кеша (T-160)');
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
  return out;
}

module.exports = { version, stamp, files, selftest };

if (require.main === module) {
  const bad = selftest();
  if (bad.length) { bad.forEach(m => console.error('✗ ' + m)); process.exit(1); }
  const v = version();
  if (process.argv.includes('--write')) {
    fs.writeFileSync(SW, stamp(fs.readFileSync(SW, 'utf8'), v));
    console.log(`sw_version: site/play/sw.js — кеш dvorami-play-${v}`);
  } else console.log(v);
}

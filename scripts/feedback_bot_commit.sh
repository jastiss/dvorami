#!/usr/bin/env bash
# Сохранить состояние игрового бота в main: feedback/, offset, состояние диалогов.
# Вызывают scripts/feedback_bot.py (раз в COMMIT_MIN минут, если что-то менялось) и шаг workflow при выходе.
# Эти файлы пишет только бот (опрос один — concurrency), поэтому его версия главная: берём свежий main,
# кладём поверх свои файлы и пушим. Так не бывает конфликтов rebase и потерянного состояния.
set -u
# reset --hard ниже может переписать этот файл на диске — выполняем копию из /tmp.
if [ -z "${_BOT_COMMIT_ROOT:-}" ]; then
  _c=$(mktemp); cp "$0" "$_c"
  _BOT_COMMIT_ROOT="$(cd "$(dirname "$0")/.." && pwd)" exec bash "$_c" "$@"
fi
cd "$_BOT_COMMIT_ROOT"
paths=""
for p in feedback .telegram/feedback-offset .telegram/feedback-state.json; do
  [ -e "$p" ] && paths="$paths $p"
done
[ -z "$paths" ] && exit 0
[ -z "$(git status --porcelain -- $paths)" ] && exit 0
tmp=$(mktemp -d)
cp -a --parents $paths "$tmp"/
git config user.name "dvorami-bot"
git config user.email "41898282+github-actions[bot]@users.noreply.github.com"
for i in 1 2 3 4 5; do
  git fetch -q origin main && git reset -q --hard origin/main || { sleep 5; continue; }
  cp -a "$tmp"/. .
  git add -A -- $paths
  if git diff --cached --quiet; then rm -rf "$tmp"; exit 0; fi
  git commit -q -m "Игровой бот: отзывы и состояние" && git push -q origin HEAD:main && { rm -rf "$tmp"; exit 0; }
  sleep $((i * 5))
done
cp -a "$tmp"/. .   # не удалось — файлы остаются на диске, бот попробует снова
rm -rf "$tmp"
exit 1

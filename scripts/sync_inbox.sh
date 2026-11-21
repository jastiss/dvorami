#!/usr/bin/env bash
# Шаг 0 каждой итерации: забрать свежие сообщения владельца из Telegram, не дожидаясь расписания.
# Запускает workflow «Telegram — входящие», ждёт до ~3 минут и подтягивает изменения.
# Если сейчас работает бот квеста, он сам пишет указания в DIRECTIVES.md — ждать не нужно.
set -u
REPO="${REPO:-jastiss/dvorami}"
cd "$(dirname "$0")/.."

active=$(gh api "repos/$REPO/actions/workflows/quest-play.yml/runs?status=in_progress" -q '.total_count' 2>/dev/null || echo 0)
if [ "${active:-0}" != "0" ]; then
  echo "Идёт квест — бот сам передаёт указания. Только git pull."
  git pull -q --rebase
  exit 0
fi

since=$(date -u +%Y-%m-%dT%H:%M:%SZ)
if ! gh api -X POST "repos/$REPO/actions/workflows/telegram-inbox.yml/dispatches" -f ref=main >/dev/null 2>&1; then
  echo "Не удалось запустить проверку входящих — продолжаю с тем, что есть в репозитории."
  git pull -q --rebase
  exit 0
fi

for _ in $(seq 1 18); do
  sleep 10
  status=$(gh api "repos/$REPO/actions/workflows/telegram-inbox.yml/runs?event=workflow_dispatch&created=%3E%3D$since" \
    -q '.workflow_runs[0].status // "none"' 2>/dev/null || echo none)
  if [ "$status" = "completed" ]; then
    echo "Входящие забраны."
    break
  fi
done
git pull -q --rebase

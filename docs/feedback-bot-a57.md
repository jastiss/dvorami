# A-57: бот без «окон тишины» — правка на вставку

Автоматическая проверка снова не дала команде менять workflow (27.11). Вставьте руками (2 минуты): откройте
https://github.com/jastiss/dvorami/edit/main/.github/workflows/feedback-bot.yml

**1.** Блок `permissions` замените на:
```yaml
permissions:
  contents: write
  actions: write
```

**2.** Перед шагом `- name: Отвечать игрокам` вставьте:
```yaml
      - name: Время старта
        run: echo "START_TS=$(date +%s)" >> "$GITHUB_ENV"
```

**3.** В самый конец файла (после шага «Сохранить в репозиторий») добавьте:
```yaml
      - name: Перезапустить себя
        if: always()
        env:
          GH_TOKEN: ${{ github.token }}
        run: |
          if [ $(( $(date +%s) - START_TS )) -ge 3600 ]; then gh workflow run feedback-bot.yml --ref main -R "$GITHUB_REPOSITORY"; fi
```
Отступы — как у соседних шагов (6 пробелов перед `- name`). «Commit changes» → готово.

Что это даёт: после каждого опроса (~5 ч 40 мин) бот сам ставит следующий в очередь, не дожидаясь cron GitHub, который срабатывает раз в 5–10 часов. Если запуск упал быстрее часа (ошибка, нет токена) — не перезапускается, чтобы не крутиться в цикле.

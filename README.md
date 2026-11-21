# Дворами

Платформа самостоятельных городских квестов. Первый квест — ЗИЛАРТ (Москва).

Проект ведёт команда агентов: одна итерация в день, отчёт приходит в Telegram.

## Как управлять командой

- **Указания** — сообщение боту в Telegram или запись в `DIRECTIVES.md`. Команда прочитает в начале следующей итерации.
- **Решения** — вопросы копятся в `APPROVALS.md`. Ответ в Telegram: `A-3 да` или `A-3 нет, лучше …`.
- **Статус** — команда `/status` в боте или файл `state/STATUS.md`.

## Команда

| Роль | Файл |
|---|---|
| Продюсер | `team/roles/producer.md` |
| Историк | `team/roles/historian.md` |
| Автор | `team/roles/author.md` |
| Режиссёр | `team/roles/director.md` |
| Арт-директор | `team/roles/art-director.md` |
| Инженер | `team/roles/engineer.md` |
| Маркетолог | `team/roles/marketer.md` |
| Медиапродюсер | `team/roles/media-producer.md` |
| Рецензент (приёмка) | `team/reviewer.md` |

Протокол итерации — `CLAUDE.md`.

## Структура

```
briefs/        требования владельца
state/         цели, статус, бэклог, решения
team/          роли
quests/<id>/   квесты: исследование, сюжет, станции, медиа
platform/      сайт и движок
reports/       ежедневные отчёты
scripts/, .github/workflows/   Telegram-бот
```

## Настройка Telegram-бота

1. В Telegram откройте @BotFather → `/newbot` → получите токен.
2. Напишите своему боту любое сообщение.
3. Узнайте свой chat id: откройте `https://api.telegram.org/bot<ТОКЕН>/getUpdates`, найдите `"chat":{"id":…}`.
4. В репозитории: Settings → Secrets and variables → Actions → New repository secret:
   - `TELEGRAM_BOT_TOKEN` — токен;
   - `TELEGRAM_CHAT_ID` — ваш chat id.
5. Actions → «Telegram — проверка» → Run workflow. Должно прийти тестовое сообщение.

Бот отвечает только на сообщения из вашего чата, остальные игнорирует.

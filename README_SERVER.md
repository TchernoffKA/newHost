# Сервер для ToDo (Telegram Mini App)

## Переменные окружения

Создайте файл `.env` в корне проекта на основе примера:

```
PORT=8787
# Токен вашего Telegram бота (BotFather)
BOT_TOKEN=<ВАШ_BOT_TOKEN>
# Для подключения удалённой БД Postgres:
# Пример: postgres://user:pass@host:5432/dbname?sslmode=require
DATABASE_URL=<ВАШ_CONNECTION_STRING>
```

## Установка и запуск

1. Установка зависимостей:
```
npm install
```

2. Подготовка хранилища:
```
npm run server:migrate
```
При наличии `DATABASE_URL` миграция создаст таблицы в Postgres.
3. Запуск API:
```
npm run server:start
```

API поднимется на `http://localhost:8787`.

## Маршруты

- GET `/api/tasks` — получить задачи пользователя
- POST `/api/tasks` — создать `{ title, due_at }`
- PATCH `/api/tasks/:id` — обновить `{ title?, due_at?, completed? }`
- DELETE `/api/tasks/:id` — удалить

Дополнительно (при MySQL и наличии таблиц):
- GET `/api/projects` — список проектов
- POST `/api/projects` — создать `{ name, color? }`
- PATCH `/api/projects/:id` — обновить
- DELETE `/api/projects/:id` — удалить

- GET `/api/tags` — список тегов
- POST `/api/tags` — создать `{ name, color? }`
- PATCH `/api/tags/:id` — обновить
- DELETE `/api/tags/:id` — удалить

- GET `/api/tasks/:id/comments` — комментарии задачи
- POST `/api/tasks/:id/comments` — `{ content, parent_comment_id? }`
- DELETE `/api/tasks/:id/comments/:commentId`

- GET `/api/tasks/:id/tags` — теги задачи
- POST `/api/tasks/:id/tags` — `{ tag_id }`
- DELETE `/api/tasks/:id/tags/:tagId`

Все методы требуют заголовок `x-telegram-init-data` с неизменённой строкой initData из Telegram WebApp. Подпись проверяется по `BOT_TOKEN`.

## База данных

Приоритет хранилища: Postgres → SQLite → JSON.

1) Postgres (`pg`) — при наличии `DATABASE_URL`.
2) SQLite (`better-sqlite3`) — если модуль доступен.
3) JSON — резервный режим.

- Схема SQLite создаётся командой `npm run server:migrate` (если модуль доступен).
- Данные всегда привязаны к `user_id` из Telegram.
- Режим хранения выводится в лог при старте: `storage: sqlite` или `storage: json`.

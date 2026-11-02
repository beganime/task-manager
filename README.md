# Elite Task

Локальный MVP корпоративного таск-менеджера по предоставленному техническому заданию.

## Что уже входит

- авторизация и роли `руководитель`, `администратор`, `менеджер`;
- проекты, участники и задачи;
- создание, редактирование и архивирование проектов с управлением участниками;
- единый раздел «Мои задачи» с быстрыми фильтрами;
- глобальный поиск по задачам, проектам и сотрудникам с учётом прав доступа;
- карточка задачи, подзадачи, чек-лист, файлы, заметки, комментарии и история изменений;
- статусы, приоритеты, дедлайны и обязательная причина для статуса «Ожидание»;
- панель команды для руководителя с детализацией по сотруднику;
- уведомления и WebSocket-канал для мгновенных событий;
- профессиональный мобильный интерфейс в стиле современных корпоративных таск-менеджеров;
- демонстрационные данные для локального запуска.

Подробная последовательность реализации и дальнейших этапов находится в `docs/IMPLEMENTATION_PLAN.md`.

## Быстрый старт

### 1. API

```powershell
cd apps/api
py -3 -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements-dev.txt
Copy-Item .env.example .env
.\.venv\Scripts\python.exe -m uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

Swagger: `http://localhost:8000/docs`

### 2. Мобильное приложение

В новом окне PowerShell:

```powershell
cd apps/mobile
npm install
Copy-Item .env.example .env
npm run start:lts
```

На текущем ПК системный Node 24 вызывает ошибку памяти Metro. Команда `start:lts` автоматически запускает Expo через Node 22 LTS и один worker.

Для Android-эмулятора используйте `EXPO_PUBLIC_API_URL=http://10.0.2.2:8000`.
Для физического телефона укажите в `apps/mobile/.env` IP компьютера в локальной сети, например `EXPO_PUBLIC_API_URL=http://192.168.1.20:8000`. Компьютер и телефон должны быть подключены к одной Wi-Fi сети.

После запуска Expo:

- Android/iOS: откройте Expo Go и отсканируйте QR-код из терминала;
- Android-эмулятор: нажмите `a` в терминале Expo;
- браузер: выполните `npm run web:lts` и откройте `http://localhost:8081`.

## Демо-пользователи

Пароль у всех: `demo12345`.

- `leader@elite-task.ru` — руководитель;
- `admin@elite-task.ru` — администратор;
- `olesya@elite-task.ru` — менеджер;
- `maya@elite-task.ru` — менеджер.

## Проверки

```powershell
cd apps/api
.\.venv\Scripts\python.exe -m pytest

cd ..\mobile
npm run typecheck
npm run doctor:lts
npm run export:android:lts
```


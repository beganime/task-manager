# API v2

Базовый URL: `http://localhost:8000`. Полная схема — Swagger на `/docs`.
Авторизация: заголовок `Authorization: Bearer <access_token>`.
API v2 обратно совместим с v1: новые поля добавлены как необязательные.

## Авторизация и профиль

| Метод | Путь | Описание |
|---|---|---|
| POST | `/auth/login` | `{email,password,timezone?}` → `TokenResponse{access_token,token_type,user}`. Ограничение перебора: `LOGIN_MAX_ATTEMPTS` за `LOGIN_WINDOW_SECONDS` |
| POST | `/auth/register` | `{email,password,full_name,timezone}` → `TokenResponse`, роль `personal`, 201. Отключается через `ALLOW_REGISTRATION=false` |
| GET | `/auth/me` | `MeOut`: `timezone`, `reminder_time` ("HH:MM"), `reminder_enabled`, `workday_minutes` |
| PATCH | `/auth/me` | частичное обновление `full_name`, `timezone`, `reminder_time`, `reminder_enabled`, `workday_minutes` |
| POST | `/auth/change-password` | `{current_password,new_password}` → новый `TokenResponse`, старые токены отзываются |
| POST | `/auth/logout-all` | 204, отзывает все токены (увеличивает версию токена) |
| POST | `/auth/ws-ticket` | одноразовый билет для WebSocket на `WS_TICKET_EXPIRE_SECONDS` |

## Ритуал (привычки)

| Метод | Путь | Описание |
|---|---|---|
| GET | `/routines?day=YYYY-MM-DD` | `Ritual`: привычки с сериями, итоги дня, `week` — 7 дней с понедельника |
| POST | `/routines` | создать привычку → `Routine`, 201 |
| PATCH | `/routines/{id}` | изменить → `Ritual` |
| DELETE | `/routines/{id}` | 204 |
| POST | `/routines/{id}/check` | `{day}` → `Ritual`. День в будущем или старше 7 дней → 422 |
| DELETE | `/routines/{id}/check?day=` | снять отметку → `Ritual` |

## «Мой день»

`GET /dashboard/my-day` — счётчики, приоритетные задачи, `local_date`, `timezone` и `workload`. В `workload`: `workday_minutes`, `ritual_minutes`, `planned_minutes`, `free_minutes`, `deadlines_today`, `overloaded`, `message`.

## Задачи

| Метод | Путь | Описание |
|---|---|---|
| GET | `/tasks?view=` | `all`, `today`, `week`, `overdue`, `done`, `favorites` |
| POST | `/tasks` | создать задачу. Поле `estimate_minutes` необязательное |
| GET/PATCH | `/tasks/{id}` | карточка / изменение (ограничения менеджера описаны в `ROLES.md`) |
| GET | `/tasks/{id}/subtasks` | подзадачи |
| POST/PATCH/DELETE | `/tasks/{id}/checklist[/{item_id}]` | чек-лист |
| POST | `/tasks/{id}/notes`, `/tasks/{id}/comments` | заметки и комментарии |
| POST/GET | `/tasks/{id}/attachments[/{attachment_id}]` | файлы, лимит `MAX_UPLOAD_MB` |

## Проекты

| Метод | Путь | Описание |
|---|---|---|
| GET | `/projects?include_archived=` | доступные проекты |
| POST | `/projects` | `{name,description,is_personal?,color?}` |
| GET/PATCH | `/projects/{id}` | карточка / изменение |
| GET | `/projects/{id}/members` | участники |
| POST | `/projects/{id}/members` | `{user_id}` или `{email}` |
| DELETE | `/projects/{id}/members/{user_id}` | 204 |
| GET | `/projects/{id}/tasks` | задачи проекта |

## Календарь

| Метод | Путь | Описание |
|---|---|---|
| GET | `/calendar?from=&to=` | задачи со сроком и события за период (не больше 366 дней) |
| POST | `/calendar/calculate` | `{start_date,days,mode:"calendar"|"business"}` → дата результата |
| POST | `/calendar/events` | `{title,description,starts_at,ends_at,all_day=true,project_id?,task_id?,color?}`, 201 |
| GET/PATCH/DELETE | `/calendar/events/{id}` | событие |

## Уведомления, поиск, команда

| Метод | Путь | Описание |
|---|---|---|
| GET | `/notifications` | список уведомлений |
| POST | `/notifications/{id}/read`, `/notifications/read-all` | отметить прочитанным |
| WS | `/notifications/ws?ticket=` | события в реальном времени; неверный билет — закрытие с кодом 4401 |
| GET | `/search?query=` | задачи, проекты, люди с учётом прав |
| GET | `/users` | справочник видимых пользователей |
| GET | `/team/summary`, `/team/{user_id}/tasks` | только `leader` и `admin` |

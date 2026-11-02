import re
from datetime import date, datetime

from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator, model_validator

from app.enums import DateCalcMode, NotificationKind, TaskPriority, TaskStatus, UserRole

HEX_COLOR = re.compile(r"^#[0-9A-Fa-f]{6}$")
HH_MM = re.compile(r"^([01]\d|2[0-3]):[0-5]\d$")


def _reject_nulls(model: BaseModel, fields: tuple[str, ...]) -> None:
    """PATCH-схемы: поле можно не передавать, но нельзя явно передать null."""
    for name in fields:
        if name in model.model_fields_set and getattr(model, name) is None:
            raise ValueError(f"Поле «{name}» не может быть пустым")


class ORMModel(BaseModel):
    model_config = ConfigDict(from_attributes=True)


# ---------------------------------------------------------------------------
# Пользователи и авторизация
# ---------------------------------------------------------------------------


class LoginRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)
    timezone: str | None = Field(default=None, max_length=64)


class RegisterRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)
    full_name: str = Field(min_length=2, max_length=160)
    timezone: str | None = Field(default=None, max_length=64)

    @field_validator("full_name")
    @classmethod
    def strip_name(cls, value: str) -> str:
        value = value.strip()
        if len(value) < 2:
            raise ValueError("Укажите имя")
        return value

    @field_validator("password")
    @classmethod
    def strong_password(cls, value: str) -> str:
        if value.isdigit() or value.isalpha():
            raise ValueError("Пароль должен содержать буквы и цифры")
        return value


class ChangePasswordRequest(BaseModel):
    current_password: str = Field(min_length=8, max_length=128)
    new_password: str = Field(min_length=8, max_length=128)

    @field_validator("new_password")
    @classmethod
    def strong_password(cls, value: str) -> str:
        if value.isdigit() or value.isalpha():
            raise ValueError("Пароль должен содержать буквы и цифры")
        return value


class UserBrief(ORMModel):
    id: int
    full_name: str
    role: UserRole


class UserOut(UserBrief):
    # email раскрывается только руководителю/администратору и самому пользователю.
    email: str | None = None
    is_active: bool


class MeOut(UserOut):
    timezone: str
    reminder_time: str | None
    reminder_enabled: bool
    workday_minutes: int


class MeUpdate(BaseModel):
    full_name: str | None = Field(default=None, min_length=2, max_length=160)
    timezone: str | None = Field(default=None, max_length=64)
    reminder_time: str | None = None
    reminder_enabled: bool | None = None
    workday_minutes: int | None = Field(default=None, ge=60, le=960)

    @field_validator("reminder_time")
    @classmethod
    def valid_time(cls, value: str | None) -> str | None:
        if value is not None and not HH_MM.match(value):
            raise ValueError("Время напоминания в формате ЧЧ:ММ")
        return value

    @model_validator(mode="after")
    def no_nulls(self) -> "MeUpdate":
        _reject_nulls(self, ("full_name", "timezone", "reminder_enabled", "workday_minutes"))
        return self


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: MeOut


class WsTicketOut(BaseModel):
    ticket: str
    expires_in: int


# ---------------------------------------------------------------------------
# Проекты
# ---------------------------------------------------------------------------


class ProjectCreate(BaseModel):
    name: str = Field(min_length=2, max_length=200)
    description: str = Field(default="", max_length=5000)
    member_ids: list[int] = Field(default_factory=list, max_length=200)
    is_personal: bool = False
    color: str | None = None

    @field_validator("color")
    @classmethod
    def valid_color(cls, value: str | None) -> str | None:
        if value is not None and not HEX_COLOR.match(value):
            raise ValueError("Цвет в формате #RRGGBB")
        return value


class ProjectUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=2, max_length=200)
    description: str | None = Field(default=None, max_length=5000)
    is_archived: bool | None = None
    color: str | None = None

    @field_validator("color")
    @classmethod
    def valid_color(cls, value: str | None) -> str | None:
        if value is not None and not HEX_COLOR.match(value):
            raise ValueError("Цвет в формате #RRGGBB")
        return value

    @model_validator(mode="after")
    def no_nulls(self) -> "ProjectUpdate":
        _reject_nulls(self, ("name", "description", "is_archived", "color"))
        return self


class ProjectOut(ORMModel):
    id: int
    name: str
    description: str
    owner_id: int
    is_archived: bool
    is_personal: bool = False
    color: str = "#F07A2B"
    member_ids: list[int] = Field(default_factory=list)
    created_at: datetime
    updated_at: datetime


class MemberUpdate(BaseModel):
    """Добавить участника по id (корпоративные проекты) или по email (приглашение в личный)."""

    user_id: int | None = None
    email: EmailStr | None = None

    @model_validator(mode="after")
    def one_of(self) -> "MemberUpdate":
        if (self.user_id is None) == (self.email is None):
            raise ValueError("Укажите user_id или email")
        return self


# ---------------------------------------------------------------------------
# Задачи
# ---------------------------------------------------------------------------


class ChecklistCreate(BaseModel):
    title: str = Field(min_length=1, max_length=300)
    position: int = Field(default=0, ge=0)


class ChecklistUpdate(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=300)
    is_done: bool | None = None
    position: int | None = Field(default=None, ge=0)

    @model_validator(mode="after")
    def no_nulls(self) -> "ChecklistUpdate":
        _reject_nulls(self, ("title", "is_done", "position"))
        return self


class ChecklistOut(ORMModel):
    id: int
    title: str
    is_done: bool
    position: int


class TaskCreate(BaseModel):
    project_id: int
    title: str = Field(min_length=2, max_length=240)
    description: str = Field(default="", max_length=20_000)
    primary_assignee_id: int
    collaborator_ids: list[int] = Field(default_factory=list, max_length=50)
    parent_task_id: int | None = None
    due_at: datetime | None = None
    priority: TaskPriority = TaskPriority.MEDIUM
    status: TaskStatus = TaskStatus.NEW
    waiting_reason: str | None = Field(default=None, max_length=2000)
    estimate_minutes: int | None = Field(default=None, ge=5, le=24 * 60)

    @field_validator("title")
    @classmethod
    def strip_title(cls, value: str) -> str:
        value = value.strip()
        if len(value) < 2:
            raise ValueError("Название слишком короткое")
        return value

    @model_validator(mode="after")
    def validate_waiting_reason(self) -> "TaskCreate":
        if self.status == TaskStatus.WAITING and not (self.waiting_reason or "").strip():
            raise ValueError("Для статуса ожидания укажите причину")
        return self


class TaskUpdate(BaseModel):
    title: str | None = Field(default=None, min_length=2, max_length=240)
    description: str | None = Field(default=None, max_length=20_000)
    primary_assignee_id: int | None = None
    collaborator_ids: list[int] | None = Field(default=None, max_length=50)
    parent_task_id: int | None = None
    due_at: datetime | None = None
    priority: TaskPriority | None = None
    status: TaskStatus | None = None
    waiting_reason: str | None = Field(default=None, max_length=2000)
    estimate_minutes: int | None = Field(default=None, ge=5, le=24 * 60)
    # Персональное избранное текущего пользователя (не меняет задачу для других).
    is_favorite: bool | None = None

    @model_validator(mode="after")
    def no_nulls(self) -> "TaskUpdate":
        # Раньше {"title": null} доходил до БД и падал IntegrityError (500).
        _reject_nulls(
            self,
            (
                "title",
                "description",
                "primary_assignee_id",
                "collaborator_ids",
                "priority",
                "status",
                "is_favorite",
            ),
        )
        if self.title is not None:
            self.title = self.title.strip()
            if len(self.title) < 2:
                raise ValueError("Название слишком короткое")
        return self


class TaskListItem(ORMModel):
    id: int
    project_id: int
    project_name: str
    title: str
    status: TaskStatus
    priority: TaskPriority
    due_at: datetime | None
    primary_assignee: UserBrief
    is_favorite: bool
    estimate_minutes: int | None = None
    completed_at: datetime | None = None
    updated_at: datetime


class AuthorEntry(ORMModel):
    id: int
    body: str
    author: UserBrief
    created_at: datetime


class ActivityOut(ORMModel):
    id: int
    action: str
    details: dict
    actor: UserBrief
    created_at: datetime


class AttachmentOut(ORMModel):
    id: int
    original_name: str
    content_type: str
    size: int
    created_at: datetime


class TaskOut(ORMModel):
    id: int
    project_id: int
    project_name: str
    parent_task_id: int | None
    creator: UserBrief
    primary_assignee: UserBrief
    collaborators: list[UserBrief]
    title: str
    description: str
    status: TaskStatus
    priority: TaskPriority
    due_at: datetime | None
    waiting_reason: str | None
    is_favorite: bool
    estimate_minutes: int | None = None
    completed_at: datetime | None = None
    checklist: list[ChecklistOut]
    notes: list[AuthorEntry]
    comments: list[AuthorEntry]
    activities: list[ActivityOut]
    attachments: list[AttachmentOut]
    created_at: datetime
    updated_at: datetime


class TextCreate(BaseModel):
    body: str = Field(min_length=1, max_length=10_000)

    @field_validator("body")
    @classmethod
    def not_blank(cls, value: str) -> str:
        if not value.strip():
            raise ValueError("Текст не может быть пустым")
        return value.strip()


# ---------------------------------------------------------------------------
# Уведомления, дашборд, команда, поиск
# ---------------------------------------------------------------------------


class NotificationOut(ORMModel):
    id: int
    task_id: int | None
    kind: NotificationKind
    title: str
    body: str
    is_read: bool
    created_at: datetime


class WorkloadOut(BaseModel):
    """Нагрузка дня: время ритуала вычитается из рабочего дня."""

    workday_minutes: int
    ritual_minutes: int
    free_minutes: int
    planned_minutes: int
    deadlines_today: int
    overloaded: bool
    message: str | None


class DashboardOut(BaseModel):
    today: int
    overdue: int
    waiting: int
    done_this_week: int
    priorities: list[TaskListItem]
    local_date: date | None = None
    timezone: str | None = None
    workload: WorkloadOut | None = None


class TeamMemberSummary(BaseModel):
    user: UserBrief
    total: int
    in_progress: int
    overdue: int
    waiting: int


class SearchResponse(BaseModel):
    tasks: list[TaskListItem]
    projects: list[ProjectOut]
    users: list[UserOut]


# ---------------------------------------------------------------------------
# Утренний ритуал
# ---------------------------------------------------------------------------


class RoutineCreate(BaseModel):
    title: str = Field(min_length=1, max_length=120)
    icon: str = Field(default="sun", min_length=1, max_length=40, pattern=r"^[a-z0-9-]+$")
    color: str = "#F07A2B"
    duration_minutes: int = Field(default=5, ge=1, le=240)
    position: int | None = Field(default=None, ge=0)

    @field_validator("color")
    @classmethod
    def valid_color(cls, value: str) -> str:
        if not HEX_COLOR.match(value):
            raise ValueError("Цвет в формате #RRGGBB")
        return value

    @field_validator("title")
    @classmethod
    def strip_title(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("Название не может быть пустым")
        return value


class RoutineUpdate(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=120)
    icon: str | None = Field(default=None, min_length=1, max_length=40, pattern=r"^[a-z0-9-]+$")
    color: str | None = None
    duration_minutes: int | None = Field(default=None, ge=1, le=240)
    position: int | None = Field(default=None, ge=0)

    @field_validator("color")
    @classmethod
    def valid_color(cls, value: str | None) -> str | None:
        if value is not None and not HEX_COLOR.match(value):
            raise ValueError("Цвет в формате #RRGGBB")
        return value

    @model_validator(mode="after")
    def no_nulls(self) -> "RoutineUpdate":
        _reject_nulls(self, ("title", "icon", "color", "duration_minutes", "position"))
        return self


class RoutineOut(BaseModel):
    id: int
    title: str
    icon: str
    color: str
    duration_minutes: int
    position: int
    done: bool
    streak: int


class RoutineDay(BaseModel):
    day: date
    done: int
    total: int


class RitualOut(BaseModel):
    day: date
    timezone: str
    routines: list[RoutineOut]
    total_minutes: int
    done_minutes: int
    streak: int
    best_streak: int
    week: list[RoutineDay]
    reminder_time: str | None
    reminder_enabled: bool


class CheckinRequest(BaseModel):
    day: date | None = None


# ---------------------------------------------------------------------------
# Календарь
# ---------------------------------------------------------------------------


class DateCalcRequest(BaseModel):
    start_date: date | None = None
    days: int = Field(ge=-3650, le=3650)
    mode: DateCalcMode = DateCalcMode.CALENDAR


class DateCalcOut(BaseModel):
    start_date: date
    result_date: date
    days: int
    mode: DateCalcMode
    weekday: int
    calendar_days: int
    business_days: int
    timezone: str


class EventCreate(BaseModel):
    title: str = Field(min_length=1, max_length=200)
    description: str = Field(default="", max_length=5000)
    starts_at: datetime
    ends_at: datetime | None = None
    all_day: bool = True
    project_id: int | None = None
    task_id: int | None = None
    color: str | None = None

    @field_validator("color")
    @classmethod
    def valid_color(cls, value: str | None) -> str | None:
        if value is not None and not HEX_COLOR.match(value):
            raise ValueError("Цвет в формате #RRGGBB")
        return value

    @field_validator("title")
    @classmethod
    def strip_title(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("Название не может быть пустым")
        return value

    @model_validator(mode="after")
    def valid_range(self) -> "EventCreate":
        if self.starts_at.tzinfo is None:
            raise ValueError("Укажите дату с часовым поясом (ISO 8601 с Z или смещением)")
        if self.ends_at is not None:
            if self.ends_at.tzinfo is None:
                raise ValueError("Укажите дату окончания с часовым поясом")
            if self.ends_at < self.starts_at:
                raise ValueError("Окончание раньше начала")
        return self


class EventUpdate(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=200)
    description: str | None = Field(default=None, max_length=5000)
    starts_at: datetime | None = None
    ends_at: datetime | None = None
    all_day: bool | None = None
    color: str | None = None

    @field_validator("color")
    @classmethod
    def valid_color(cls, value: str | None) -> str | None:
        if value is not None and not HEX_COLOR.match(value):
            raise ValueError("Цвет в формате #RRGGBB")
        return value

    @model_validator(mode="after")
    def no_nulls(self) -> "EventUpdate":
        _reject_nulls(self, ("title", "description", "starts_at", "all_day", "color"))
        for value in (self.starts_at, self.ends_at):
            if value is not None and value.tzinfo is None:
                raise ValueError("Укажите дату с часовым поясом")
        return self


class EventOut(BaseModel):
    id: int
    owner_id: int
    project_id: int | None
    project_name: str | None
    task_id: int | None
    title: str
    description: str
    starts_at: datetime
    ends_at: datetime | None
    all_day: bool
    color: str
    can_edit: bool
    created_at: datetime


class CalendarItem(BaseModel):
    kind: str  # "event" | "task"
    id: int
    title: str
    day: date
    starts_at: datetime
    ends_at: datetime | None
    all_day: bool
    color: str
    project_id: int | None
    project_name: str | None
    task_id: int | None
    status: TaskStatus | None = None
    priority: TaskPriority | None = None


class CalendarOut(BaseModel):
    from_date: date
    to_date: date
    timezone: str
    items: list[CalendarItem]

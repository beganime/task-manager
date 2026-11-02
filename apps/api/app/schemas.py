from datetime import datetime

from pydantic import BaseModel, ConfigDict, EmailStr, Field, model_validator

from app.enums import NotificationKind, TaskPriority, TaskStatus, UserRole


class ORMModel(BaseModel):
    model_config = ConfigDict(from_attributes=True)


class LoginRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)


class UserBrief(ORMModel):
    id: int
    full_name: str
    role: UserRole


class UserOut(UserBrief):
    email: EmailStr
    is_active: bool


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserOut


class ProjectCreate(BaseModel):
    name: str = Field(min_length=2, max_length=200)
    description: str = Field(default="", max_length=5000)
    member_ids: list[int] = Field(default_factory=list)


class ProjectUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=2, max_length=200)
    description: str | None = Field(default=None, max_length=5000)
    is_archived: bool | None = None


class ProjectOut(ORMModel):
    id: int
    name: str
    description: str
    owner_id: int
    is_archived: bool
    member_ids: list[int] = Field(default_factory=list)
    created_at: datetime
    updated_at: datetime


class MemberUpdate(BaseModel):
    user_id: int


class ChecklistCreate(BaseModel):
    title: str = Field(min_length=1, max_length=300)
    position: int = Field(default=0, ge=0)


class ChecklistUpdate(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=300)
    is_done: bool | None = None
    position: int | None = Field(default=None, ge=0)


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
    collaborator_ids: list[int] = Field(default_factory=list)
    parent_task_id: int | None = None
    due_at: datetime | None = None
    priority: TaskPriority = TaskPriority.MEDIUM
    status: TaskStatus = TaskStatus.NEW
    waiting_reason: str | None = Field(default=None, max_length=2000)

    @model_validator(mode="after")
    def validate_waiting_reason(self) -> "TaskCreate":
        if self.status == TaskStatus.WAITING and not (self.waiting_reason or "").strip():
            raise ValueError("Для статуса ожидания укажите причину")
        return self


class TaskUpdate(BaseModel):
    title: str | None = Field(default=None, min_length=2, max_length=240)
    description: str | None = Field(default=None, max_length=20_000)
    primary_assignee_id: int | None = None
    collaborator_ids: list[int] | None = None
    due_at: datetime | None = None
    priority: TaskPriority | None = None
    status: TaskStatus | None = None
    waiting_reason: str | None = Field(default=None, max_length=2000)
    is_favorite: bool | None = None


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
    checklist: list[ChecklistOut]
    notes: list[AuthorEntry]
    comments: list[AuthorEntry]
    activities: list[ActivityOut]
    attachments: list[AttachmentOut]
    created_at: datetime
    updated_at: datetime


class TextCreate(BaseModel):
    body: str = Field(min_length=1, max_length=10_000)


class NotificationOut(ORMModel):
    id: int
    task_id: int | None
    kind: NotificationKind
    title: str
    body: str
    is_read: bool
    created_at: datetime


class DashboardOut(BaseModel):
    today: int
    overdue: int
    waiting: int
    done_this_week: int
    priorities: list[TaskListItem]


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


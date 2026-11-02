from __future__ import annotations

from datetime import UTC, date, datetime
from typing import Any

from sqlalchemy import (
    JSON,
    Boolean,
    Date,
    Enum,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    UniqueConstraint,
    text,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db import Base
from app.db_types import UTCDateTime
from app.enums import NotificationKind, TaskPriority, TaskStatus, UserRole


def utcnow() -> datetime:
    return datetime.now(UTC)


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(primary_key=True)
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True)
    full_name: Mapped[str] = mapped_column(String(160))
    password_hash: Mapped[str] = mapped_column(String(255))
    role: Mapped[UserRole] = mapped_column(Enum(UserRole, native_enum=False, length=20), index=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(UTCDateTime, default=utcnow)
    # IANA-часовой пояс, определяется автоматически на устройстве пользователя.
    timezone: Mapped[str] = mapped_column(String(64), default="UTC", server_default="UTC")
    # Увеличивается при выходе со всех устройств — старые токены перестают работать.
    token_version: Mapped[int] = mapped_column(Integer, default=0, server_default=text("0"))
    reminder_time: Mapped[str | None] = mapped_column(String(5), nullable=True)
    reminder_enabled: Mapped[bool] = mapped_column(
        Boolean, default=False, server_default=text("0")
    )
    workday_minutes: Mapped[int] = mapped_column(Integer, default=480, server_default=text("480"))

    memberships: Mapped[list[ProjectMember]] = relationship(back_populates="user")

    @property
    def is_personal(self) -> bool:
        return self.role == UserRole.PERSONAL


class Project(Base):
    __tablename__ = "projects"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(200), index=True)
    description: Mapped[str] = mapped_column(Text, default="")
    owner_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    is_archived: Mapped[bool] = mapped_column(Boolean, default=False, index=True)
    # Личный проект виден только своим участникам — даже руководитель компании его не видит.
    is_personal: Mapped[bool] = mapped_column(
        Boolean, default=False, server_default=text("0"), index=True
    )
    color: Mapped[str] = mapped_column(String(16), default="#F07A2B", server_default="#F07A2B")
    created_at: Mapped[datetime] = mapped_column(UTCDateTime, default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(UTCDateTime, default=utcnow, onupdate=utcnow)

    owner: Mapped[User] = relationship(foreign_keys=[owner_id])
    members: Mapped[list[ProjectMember]] = relationship(
        back_populates="project", cascade="all, delete-orphan"
    )
    tasks: Mapped[list[Task]] = relationship(back_populates="project")


class ProjectMember(Base):
    __tablename__ = "project_members"
    __table_args__ = (UniqueConstraint("project_id", "user_id"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    project_id: Mapped[int] = mapped_column(ForeignKey("projects.id"), index=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    joined_at: Mapped[datetime] = mapped_column(UTCDateTime, default=utcnow)

    project: Mapped[Project] = relationship(back_populates="members")
    user: Mapped[User] = relationship(back_populates="memberships")


class Task(Base):
    __tablename__ = "tasks"
    __table_args__ = (
        Index("ix_tasks_assignee_status_due", "primary_assignee_id", "status", "due_at"),
        Index("ix_tasks_project_updated", "project_id", "updated_at"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    project_id: Mapped[int] = mapped_column(ForeignKey("projects.id"), index=True)
    parent_task_id: Mapped[int | None] = mapped_column(ForeignKey("tasks.id"), nullable=True)
    creator_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    primary_assignee_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    title: Mapped[str] = mapped_column(String(240), index=True)
    description: Mapped[str] = mapped_column(Text, default="")
    status: Mapped[TaskStatus] = mapped_column(
        Enum(TaskStatus, native_enum=False), default=TaskStatus.NEW, index=True
    )
    priority: Mapped[TaskPriority] = mapped_column(
        Enum(TaskPriority, native_enum=False), default=TaskPriority.MEDIUM, index=True
    )
    due_at: Mapped[datetime | None] = mapped_column(UTCDateTime, nullable=True, index=True)
    waiting_reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    # Устаревшее общее поле. Избранное теперь персональное (TaskFavorite).
    # Колонка оставлена для совместимости со старыми локальными БД.
    is_favorite: Mapped[bool] = mapped_column(Boolean, default=False)
    estimate_minutes: Mapped[int | None] = mapped_column(Integer, nullable=True)
    completed_at: Mapped[datetime | None] = mapped_column(UTCDateTime, nullable=True, index=True)
    created_at: Mapped[datetime] = mapped_column(UTCDateTime, default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        UTCDateTime, default=utcnow, onupdate=utcnow, index=True
    )

    project: Mapped[Project] = relationship(back_populates="tasks")
    creator: Mapped[User] = relationship(foreign_keys=[creator_id])
    primary_assignee: Mapped[User] = relationship(foreign_keys=[primary_assignee_id])
    collaborators: Mapped[list[TaskCollaborator]] = relationship(
        back_populates="task", cascade="all, delete-orphan"
    )
    checklist: Mapped[list[ChecklistItem]] = relationship(
        back_populates="task", cascade="all, delete-orphan", order_by="ChecklistItem.position"
    )
    notes: Mapped[list[TaskNote]] = relationship(
        back_populates="task", cascade="all, delete-orphan"
    )
    comments: Mapped[list[Comment]] = relationship(
        back_populates="task", cascade="all, delete-orphan"
    )
    activities: Mapped[list[ActivityLog]] = relationship(
        back_populates="task", cascade="all, delete-orphan"
    )
    attachments: Mapped[list[Attachment]] = relationship(
        back_populates="task", cascade="all, delete-orphan"
    )


class TaskFavorite(Base):
    __tablename__ = "task_favorites"
    __table_args__ = (UniqueConstraint("task_id", "user_id"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    task_id: Mapped[int] = mapped_column(ForeignKey("tasks.id", ondelete="CASCADE"), index=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    created_at: Mapped[datetime] = mapped_column(UTCDateTime, default=utcnow)


class TaskCollaborator(Base):
    __tablename__ = "task_collaborators"
    __table_args__ = (UniqueConstraint("task_id", "user_id"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    task_id: Mapped[int] = mapped_column(ForeignKey("tasks.id"), index=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)

    task: Mapped[Task] = relationship(back_populates="collaborators")
    user: Mapped[User] = relationship()


class TaskDependency(Base):
    __tablename__ = "task_dependencies"
    __table_args__ = (UniqueConstraint("task_id", "depends_on_task_id"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    task_id: Mapped[int] = mapped_column(ForeignKey("tasks.id"), index=True)
    depends_on_task_id: Mapped[int] = mapped_column(ForeignKey("tasks.id"), index=True)


class ChecklistItem(Base):
    __tablename__ = "checklist_items"

    id: Mapped[int] = mapped_column(primary_key=True)
    task_id: Mapped[int] = mapped_column(ForeignKey("tasks.id"), index=True)
    title: Mapped[str] = mapped_column(String(300))
    is_done: Mapped[bool] = mapped_column(Boolean, default=False)
    position: Mapped[int] = mapped_column(Integer, default=0)

    task: Mapped[Task] = relationship(back_populates="checklist")


class TaskNote(Base):
    __tablename__ = "task_notes"

    id: Mapped[int] = mapped_column(primary_key=True)
    task_id: Mapped[int] = mapped_column(ForeignKey("tasks.id"), index=True)
    author_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    body: Mapped[str] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(UTCDateTime, default=utcnow)

    task: Mapped[Task] = relationship(back_populates="notes")
    author: Mapped[User] = relationship()


class Comment(Base):
    __tablename__ = "comments"

    id: Mapped[int] = mapped_column(primary_key=True)
    task_id: Mapped[int] = mapped_column(ForeignKey("tasks.id"), index=True)
    author_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    body: Mapped[str] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(UTCDateTime, default=utcnow)

    task: Mapped[Task] = relationship(back_populates="comments")
    author: Mapped[User] = relationship()


class Attachment(Base):
    __tablename__ = "attachments"

    id: Mapped[int] = mapped_column(primary_key=True)
    task_id: Mapped[int] = mapped_column(ForeignKey("tasks.id"), index=True)
    uploader_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    original_name: Mapped[str] = mapped_column(String(255))
    storage_name: Mapped[str] = mapped_column(String(255), unique=True)
    content_type: Mapped[str] = mapped_column(String(160), default="application/octet-stream")
    size: Mapped[int] = mapped_column(Integer)
    created_at: Mapped[datetime] = mapped_column(UTCDateTime, default=utcnow)

    task: Mapped[Task] = relationship(back_populates="attachments")


class ActivityLog(Base):
    __tablename__ = "activity_log"

    id: Mapped[int] = mapped_column(primary_key=True)
    task_id: Mapped[int] = mapped_column(ForeignKey("tasks.id"), index=True)
    actor_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    action: Mapped[str] = mapped_column(String(80), index=True)
    details: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)
    created_at: Mapped[datetime] = mapped_column(UTCDateTime, default=utcnow)

    task: Mapped[Task] = relationship(back_populates="activities")
    actor: Mapped[User] = relationship()


class Notification(Base):
    __tablename__ = "notifications"
    __table_args__ = (Index("ix_notifications_user_read_created", "user_id", "is_read", "created_at"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    task_id: Mapped[int | None] = mapped_column(ForeignKey("tasks.id"), nullable=True)
    kind: Mapped[NotificationKind] = mapped_column(Enum(NotificationKind, native_enum=False))
    title: Mapped[str] = mapped_column(String(240))
    body: Mapped[str] = mapped_column(Text, default="")
    is_read: Mapped[bool] = mapped_column(Boolean, default=False, index=True)
    created_at: Mapped[datetime] = mapped_column(UTCDateTime, default=utcnow)

    user: Mapped[User] = relationship()


# ---------------------------------------------------------------------------
# Утренний ритуал
# ---------------------------------------------------------------------------


class Routine(Base):
    __tablename__ = "routines"
    __table_args__ = (Index("ix_routines_user_active_position", "user_id", "is_active", "position"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    title: Mapped[str] = mapped_column(String(120))
    icon: Mapped[str] = mapped_column(String(40), default="sun")
    color: Mapped[str] = mapped_column(String(16), default="#F07A2B")
    duration_minutes: Mapped[int] = mapped_column(Integer, default=5)
    position: Mapped[int] = mapped_column(Integer, default=0)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(UTCDateTime, default=utcnow)

    checkins: Mapped[list[RoutineCheckin]] = relationship(
        back_populates="routine", cascade="all, delete-orphan"
    )


class RoutineCheckin(Base):
    __tablename__ = "routine_checkins"
    __table_args__ = (
        UniqueConstraint("routine_id", "day"),
        Index("ix_routine_checkins_user_day", "user_id", "day"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    routine_id: Mapped[int] = mapped_column(ForeignKey("routines.id"), index=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    day: Mapped[date] = mapped_column(Date)
    created_at: Mapped[datetime] = mapped_column(UTCDateTime, default=utcnow)

    routine: Mapped[Routine] = relationship(back_populates="checkins")


# ---------------------------------------------------------------------------
# Календарь событий
# ---------------------------------------------------------------------------


class Event(Base):
    __tablename__ = "events"
    __table_args__ = (
        Index("ix_events_owner_start", "owner_id", "starts_at"),
        Index("ix_events_project_start", "project_id", "starts_at"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    owner_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    project_id: Mapped[int | None] = mapped_column(ForeignKey("projects.id"), nullable=True)
    task_id: Mapped[int | None] = mapped_column(ForeignKey("tasks.id"), nullable=True)
    title: Mapped[str] = mapped_column(String(200))
    description: Mapped[str] = mapped_column(Text, default="")
    starts_at: Mapped[datetime] = mapped_column(UTCDateTime)
    ends_at: Mapped[datetime | None] = mapped_column(UTCDateTime, nullable=True)
    all_day: Mapped[bool] = mapped_column(Boolean, default=True)
    color: Mapped[str] = mapped_column(String(16), default="#F07A2B")
    created_at: Mapped[datetime] = mapped_column(UTCDateTime, default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(UTCDateTime, default=utcnow, onupdate=utcnow)

    owner: Mapped[User] = relationship(foreign_keys=[owner_id])
    project: Mapped[Project | None] = relationship()

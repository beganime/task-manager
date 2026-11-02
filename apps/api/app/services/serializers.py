from collections import defaultdict
from collections.abc import Iterable, Sequence

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.enums import COMPANY_MANAGERS
from app.models import (
    ActivityLog,
    Comment,
    Project,
    ProjectMember,
    Task,
    TaskCollaborator,
    TaskFavorite,
    TaskNote,
    User,
)
from app.schemas import (
    ActivityOut,
    AttachmentOut,
    AuthorEntry,
    ChecklistOut,
    MeOut,
    ProjectOut,
    TaskListItem,
    TaskOut,
    UserBrief,
    UserOut,
)

# Для списков грузим только то, что реально отображается в карточке.
LIST_OPTIONS = (
    selectinload(Task.project),
    selectinload(Task.primary_assignee),
)

# Полная карточка задачи.
TASK_OPTIONS = (
    selectinload(Task.project),
    selectinload(Task.creator),
    selectinload(Task.primary_assignee),
    selectinload(Task.collaborators).selectinload(TaskCollaborator.user),
    selectinload(Task.checklist),
    selectinload(Task.notes).selectinload(TaskNote.author),
    selectinload(Task.comments).selectinload(Comment.author),
    selectinload(Task.activities).selectinload(ActivityLog.actor),
    selectinload(Task.attachments),
)


async def load_task(session: AsyncSession, task_id: int) -> Task | None:
    return await session.scalar(
        select(Task)
        .where(Task.id == task_id)
        .options(*TASK_OPTIONS)
        .execution_options(populate_existing=True)
    )


async def favorite_ids(session: AsyncSession, user_id: int, task_ids: Iterable[int]) -> set[int]:
    ids = list(task_ids)
    if not ids:
        return set()
    return set(
        await session.scalars(
            select(TaskFavorite.task_id).where(
                TaskFavorite.user_id == user_id, TaskFavorite.task_id.in_(ids)
            )
        )
    )


def task_list_item(task: Task, favorites: set[int] | None = None) -> TaskListItem:
    return TaskListItem(
        id=task.id,
        project_id=task.project_id,
        project_name=task.project.name,
        title=task.title,
        status=task.status,
        priority=task.priority,
        due_at=task.due_at,
        primary_assignee=UserBrief.model_validate(task.primary_assignee),
        is_favorite=task.id in (favorites or set()),
        estimate_minutes=task.estimate_minutes,
        completed_at=task.completed_at,
        updated_at=task.updated_at,
    )


async def task_list(
    session: AsyncSession, viewer: User, tasks: Sequence[Task]
) -> list[TaskListItem]:
    favorites = await favorite_ids(session, viewer.id, (task.id for task in tasks))
    return [task_list_item(task, favorites) for task in tasks]


def task_detail(task: Task, is_favorite: bool = False) -> TaskOut:
    return TaskOut(
        id=task.id,
        project_id=task.project_id,
        project_name=task.project.name,
        parent_task_id=task.parent_task_id,
        creator=UserBrief.model_validate(task.creator),
        primary_assignee=UserBrief.model_validate(task.primary_assignee),
        collaborators=[UserBrief.model_validate(item.user) for item in task.collaborators],
        title=task.title,
        description=task.description,
        status=task.status,
        priority=task.priority,
        due_at=task.due_at,
        waiting_reason=task.waiting_reason,
        is_favorite=is_favorite,
        estimate_minutes=task.estimate_minutes,
        completed_at=task.completed_at,
        checklist=[ChecklistOut.model_validate(item) for item in task.checklist],
        notes=[
            AuthorEntry(id=item.id, body=item.body, author=item.author, created_at=item.created_at)
            for item in sorted(task.notes, key=lambda value: value.created_at, reverse=True)
        ],
        comments=[
            AuthorEntry(id=item.id, body=item.body, author=item.author, created_at=item.created_at)
            for item in sorted(task.comments, key=lambda value: value.created_at, reverse=True)
        ],
        activities=[
            ActivityOut(
                id=item.id,
                action=item.action,
                details=item.details,
                actor=item.actor,
                created_at=item.created_at,
            )
            for item in sorted(task.activities, key=lambda value: value.created_at, reverse=True)
        ],
        attachments=[AttachmentOut.model_validate(item) for item in task.attachments],
        created_at=task.created_at,
        updated_at=task.updated_at,
    )


async def task_detail_for(session: AsyncSession, viewer: User, task_id: int) -> TaskOut:
    task = await load_task(session, task_id)
    assert task is not None
    favorites = await favorite_ids(session, viewer.id, [task_id])
    return task_detail(task, task_id in favorites)


def _project_out(project: Project, member_ids: list[int]) -> ProjectOut:
    return ProjectOut(
        id=project.id,
        name=project.name,
        description=project.description,
        owner_id=project.owner_id,
        is_archived=project.is_archived,
        is_personal=project.is_personal,
        color=project.color,
        member_ids=member_ids,
        created_at=project.created_at,
        updated_at=project.updated_at,
    )


async def projects_out(session: AsyncSession, projects: Sequence[Project]) -> list[ProjectOut]:
    """Один запрос на участников всех проектов вместо N+1."""
    if not projects:
        return []
    members: dict[int, list[int]] = defaultdict(list)
    rows = await session.execute(
        select(ProjectMember.project_id, ProjectMember.user_id)
        .where(ProjectMember.project_id.in_([project.id for project in projects]))
        .order_by(ProjectMember.user_id)
    )
    for project_id, user_id in rows:
        members[project_id].append(user_id)
    return [_project_out(project, members[project.id]) for project in projects]


async def project_out(session: AsyncSession, project: Project) -> ProjectOut:
    return (await projects_out(session, [project]))[0]


def user_out(user: User, viewer: User) -> UserOut:
    """Email видят только руководитель/администратор и сам пользователь."""
    show_email = viewer.id == user.id or viewer.role in COMPANY_MANAGERS
    return UserOut(
        id=user.id,
        full_name=user.full_name,
        role=user.role,
        email=user.email if show_email else None,
        is_active=user.is_active,
    )


def me_out(user: User) -> MeOut:
    return MeOut(
        id=user.id,
        full_name=user.full_name,
        role=user.role,
        email=user.email,
        is_active=user.is_active,
        timezone=user.timezone or "UTC",
        reminder_time=user.reminder_time,
        reminder_enabled=user.reminder_enabled,
        workday_minutes=user.workday_minutes,
    )

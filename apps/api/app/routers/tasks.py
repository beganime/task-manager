from datetime import datetime, timedelta, timezone
from pathlib import Path
from uuid import uuid4

from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile
from fastapi.responses import FileResponse
from sqlalchemy import and_, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.db import get_session
from app.dependencies import get_current_user
from app.enums import NotificationKind, TaskStatus, UserRole
from app.models import (
    ActivityLog,
    Attachment,
    ChecklistItem,
    Comment,
    ProjectMember,
    Task,
    TaskCollaborator,
    TaskNote,
    User,
    utcnow,
)
from app.schemas import (
    AttachmentOut,
    AuthorEntry,
    ChecklistCreate,
    ChecklistOut,
    ChecklistUpdate,
    TaskCreate,
    TaskListItem,
    TaskOut,
    TaskUpdate,
    TextCreate,
)
from app.services.access import (
    ensure_assignment_allowed,
    ensure_project_access,
    ensure_task_access,
)
from app.services.notifications import create_notification
from app.services.serializers import TASK_OPTIONS, load_task, task_detail, task_list_item


router = APIRouter(prefix="/tasks", tags=["tasks"])
UPLOAD_DIR = Path("data/uploads")
MAX_UPLOAD_SIZE = 20 * 1024 * 1024


async def ensure_task_participant(session: AsyncSession, user: User, task: Task) -> None:
    if user.role in (UserRole.LEADER, UserRole.ADMIN):
        return
    if user.id in (task.creator_id, task.primary_assignee_id):
        return
    collaborator = await session.scalar(
        select(TaskCollaborator.id).where(
            TaskCollaborator.task_id == task.id,
            TaskCollaborator.user_id == user.id,
        )
    )
    if collaborator is None:
        raise HTTPException(status_code=403, detail="Изменять задачу может участник задачи")


@router.get("", response_model=list[TaskListItem])
async def list_my_tasks(
    view: str = Query(default="all", pattern="^(all|today|week|overdue|done)$"),
    project_id: int | None = None,
    status: TaskStatus | None = None,
    limit: int = Query(default=100, ge=1, le=200),
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> list[TaskListItem]:
    collaborator_task_ids = select(TaskCollaborator.task_id).where(
        TaskCollaborator.user_id == user.id
    )
    statement = (
        select(Task)
        .where(
            or_(
                Task.primary_assignee_id == user.id,
                Task.id.in_(collaborator_task_ids),
            )
        )
        .options(*TASK_OPTIONS)
    )
    now = datetime.now(timezone.utc)
    today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
    tomorrow = today_start + timedelta(days=1)
    if view == "today":
        statement = statement.where(Task.due_at >= today_start, Task.due_at < tomorrow)
    elif view == "week":
        statement = statement.where(Task.due_at >= today_start, Task.due_at < today_start + timedelta(days=7))
    elif view == "overdue":
        statement = statement.where(
            Task.due_at < now,
            Task.status.notin_([TaskStatus.DONE, TaskStatus.CANCELLED]),
        )
    elif view == "done":
        statement = statement.where(Task.status == TaskStatus.DONE)
    if project_id is not None:
        await ensure_project_access(session, user, project_id)
        statement = statement.where(Task.project_id == project_id)
    if status is not None:
        statement = statement.where(Task.status == status)
    tasks = list(
        await session.scalars(
            statement.order_by(Task.is_favorite.desc(), Task.due_at.asc()).limit(limit)
        )
    )
    return [task_list_item(task) for task in tasks]


@router.post("", response_model=TaskOut, status_code=201)
async def create_task(
    payload: TaskCreate,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> TaskOut:
    await ensure_project_access(session, user, payload.project_id)
    await ensure_assignment_allowed(session, user, payload.project_id, payload.primary_assignee_id)
    if payload.parent_task_id:
        parent = await ensure_task_access(session, user, payload.parent_task_id)
        if parent.project_id != payload.project_id:
            raise HTTPException(status_code=422, detail="Подзадача должна быть в том же проекте")
    collaborator_ids = set(payload.collaborator_ids)
    for collaborator_id in collaborator_ids:
        await ensure_assignment_allowed(session, user, payload.project_id, collaborator_id)
    task = Task(
        project_id=payload.project_id,
        parent_task_id=payload.parent_task_id,
        creator_id=user.id,
        primary_assignee_id=payload.primary_assignee_id,
        title=payload.title,
        description=payload.description,
        status=payload.status,
        priority=payload.priority,
        due_at=payload.due_at,
        waiting_reason=payload.waiting_reason,
    )
    session.add(task)
    await session.flush()
    session.add_all(
        [
            TaskCollaborator(task_id=task.id, user_id=collaborator_id)
            for collaborator_id in collaborator_ids
            if collaborator_id != payload.primary_assignee_id
        ]
    )
    session.add(
        ActivityLog(
            task_id=task.id,
            actor_id=user.id,
            action="task.created",
            details={"assignee_id": payload.primary_assignee_id},
        )
    )
    if payload.primary_assignee_id != user.id:
        await create_notification(
            session,
            payload.primary_assignee_id,
            NotificationKind.ASSIGNED,
            "Назначена новая задача",
            task.title,
            task.id,
        )
    await session.commit()
    loaded = await load_task(session, task.id)
    assert loaded is not None
    return task_detail(loaded)


@router.get("/{task_id}", response_model=TaskOut)
async def get_task(
    task_id: int,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> TaskOut:
    await ensure_task_access(session, user, task_id)
    task = await load_task(session, task_id)
    assert task is not None
    return task_detail(task)


@router.get("/{task_id}/subtasks", response_model=list[TaskListItem])
async def list_subtasks(
    task_id: int,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> list[TaskListItem]:
    await ensure_task_access(session, user, task_id)
    tasks = list(
        await session.scalars(
            select(Task)
            .where(Task.parent_task_id == task_id)
            .options(*TASK_OPTIONS)
            .order_by(Task.is_favorite.desc(), Task.due_at.asc())
        )
    )
    return [task_list_item(task) for task in tasks]


@router.patch("/{task_id}", response_model=TaskOut)
async def update_task(
    task_id: int,
    payload: TaskUpdate,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> TaskOut:
    task = await ensure_task_access(session, user, task_id)
    fields = payload.model_fields_set
    manager_owns_personal_task = (
        task.creator_id == user.id and task.primary_assignee_id == user.id
    )
    if user.role == UserRole.MANAGER and not manager_owns_personal_task:
        allowed = {"status", "waiting_reason", "is_favorite"}
        if fields - allowed:
            raise HTTPException(
                status_code=403,
                detail="В назначенной задаче менеджер меняет только выполнение",
            )
        await ensure_task_participant(session, user, task)

    if payload.primary_assignee_id is not None:
        await ensure_assignment_allowed(
            session, user, task.project_id, payload.primary_assignee_id
        )

    effective_status = payload.status if "status" in fields else task.status
    effective_reason = payload.waiting_reason if "waiting_reason" in fields else task.waiting_reason
    if effective_status == TaskStatus.WAITING and not (effective_reason or "").strip():
        raise HTTPException(status_code=422, detail="Для статуса ожидания укажите причину")

    changes: dict[str, dict[str, object]] = {}
    for field in (
        "title",
        "description",
        "primary_assignee_id",
        "due_at",
        "priority",
        "status",
        "waiting_reason",
        "is_favorite",
    ):
        if field in fields:
            old_value = getattr(task, field)
            new_value = getattr(payload, field)
            if old_value != new_value:
                changes[field] = {
                    "from": getattr(old_value, "value", old_value.isoformat() if hasattr(old_value, "isoformat") else old_value),
                    "to": getattr(new_value, "value", new_value.isoformat() if hasattr(new_value, "isoformat") else new_value),
                }
                setattr(task, field, new_value)

    if "collaborator_ids" in fields and payload.collaborator_ids is not None:
        collaborator_ids = set(payload.collaborator_ids)
        for collaborator_id in collaborator_ids:
            await ensure_assignment_allowed(session, user, task.project_id, collaborator_id)
        current_ids = set(
            await session.scalars(
                select(TaskCollaborator.user_id).where(TaskCollaborator.task_id == task.id)
            )
        )
        if current_ids != collaborator_ids:
            existing = list(
                await session.scalars(
                    select(TaskCollaborator).where(TaskCollaborator.task_id == task.id)
                )
            )
            for item in existing:
                await session.delete(item)
            session.add_all(
                [
                    TaskCollaborator(task_id=task.id, user_id=collaborator_id)
                    for collaborator_id in collaborator_ids
                    if collaborator_id != task.primary_assignee_id
                ]
            )
            changes["collaborator_ids"] = {
                "from": sorted(current_ids),
                "to": sorted(collaborator_ids),
            }

    if changes:
        task.updated_at = utcnow()
        session.add(
            ActivityLog(
                task_id=task.id,
                actor_id=user.id,
                action="task.updated",
                details=changes,
            )
        )
        if "primary_assignee_id" in changes and task.primary_assignee_id != user.id:
            await create_notification(
                session,
                task.primary_assignee_id,
                NotificationKind.ASSIGNED,
                "Вам переназначена задача",
                task.title,
                task.id,
            )
        elif "status" in changes and task.primary_assignee_id != user.id:
            await create_notification(
                session,
                task.primary_assignee_id,
                NotificationKind.STATUS,
                "Изменён статус задачи",
                task.title,
                task.id,
            )
    await session.commit()
    loaded = await load_task(session, task.id)
    assert loaded is not None
    return task_detail(loaded)


@router.post("/{task_id}/checklist", response_model=ChecklistOut, status_code=201)
async def add_checklist_item(
    task_id: int,
    payload: ChecklistCreate,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> ChecklistOut:
    task = await ensure_task_access(session, user, task_id)
    await ensure_task_participant(session, user, task)
    item = ChecklistItem(task_id=task.id, title=payload.title, position=payload.position)
    session.add(item)
    task.updated_at = utcnow()
    await session.commit()
    await session.refresh(item)
    return ChecklistOut.model_validate(item)


@router.patch("/{task_id}/checklist/{item_id}", response_model=ChecklistOut)
async def update_checklist_item(
    task_id: int,
    item_id: int,
    payload: ChecklistUpdate,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> ChecklistOut:
    task = await ensure_task_access(session, user, task_id)
    await ensure_task_participant(session, user, task)
    item = await session.scalar(
        select(ChecklistItem).where(
            ChecklistItem.id == item_id,
            ChecklistItem.task_id == task_id,
        )
    )
    if not item:
        raise HTTPException(status_code=404, detail="Пункт чек-листа не найден")
    for field in payload.model_fields_set:
        setattr(item, field, getattr(payload, field))
    task.updated_at = utcnow()
    await session.commit()
    await session.refresh(item)
    return ChecklistOut.model_validate(item)


@router.post("/{task_id}/notes", response_model=AuthorEntry, status_code=201)
async def add_note(
    task_id: int,
    payload: TextCreate,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> AuthorEntry:
    task = await ensure_task_access(session, user, task_id)
    await ensure_task_participant(session, user, task)
    note = TaskNote(task_id=task.id, author_id=user.id, body=payload.body)
    session.add(note)
    task.updated_at = utcnow()
    await session.commit()
    await session.refresh(note)
    return AuthorEntry(id=note.id, body=note.body, author=user, created_at=note.created_at)


@router.post("/{task_id}/comments", response_model=AuthorEntry, status_code=201)
async def add_comment(
    task_id: int,
    payload: TextCreate,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> AuthorEntry:
    task = await ensure_task_access(session, user, task_id)
    comment = Comment(task_id=task.id, author_id=user.id, body=payload.body)
    session.add(comment)
    task.updated_at = utcnow()
    if task.primary_assignee_id != user.id:
        await create_notification(
            session,
            task.primary_assignee_id,
            NotificationKind.COMMENT,
            "Новый комментарий",
            task.title,
            task.id,
        )
    await session.commit()
    await session.refresh(comment)
    return AuthorEntry(id=comment.id, body=comment.body, author=user, created_at=comment.created_at)


@router.post("/{task_id}/attachments", response_model=AttachmentOut, status_code=201)
async def upload_attachment(
    task_id: int,
    file: UploadFile = File(...),
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> AttachmentOut:
    task = await ensure_task_access(session, user, task_id)
    await ensure_task_participant(session, user, task)
    content = await file.read(MAX_UPLOAD_SIZE + 1)
    if len(content) > MAX_UPLOAD_SIZE:
        raise HTTPException(status_code=413, detail="Максимальный размер файла 20 МБ")
    UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
    suffix = Path(file.filename or "file").suffix[:20]
    storage_name = f"{uuid4().hex}{suffix}"
    path = UPLOAD_DIR / storage_name
    path.write_bytes(content)
    attachment = Attachment(
        task_id=task.id,
        uploader_id=user.id,
        original_name=Path(file.filename or "file").name,
        storage_name=storage_name,
        content_type=file.content_type or "application/octet-stream",
        size=len(content),
    )
    session.add(attachment)
    task.updated_at = utcnow()
    await session.commit()
    await session.refresh(attachment)
    return AttachmentOut.model_validate(attachment)


@router.get("/{task_id}/attachments/{attachment_id}")
async def download_attachment(
    task_id: int,
    attachment_id: int,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> FileResponse:
    await ensure_task_access(session, user, task_id)
    attachment = await session.scalar(
        select(Attachment).where(
            Attachment.id == attachment_id,
            Attachment.task_id == task_id,
        )
    )
    if not attachment:
        raise HTTPException(status_code=404, detail="Файл не найден")
    path = UPLOAD_DIR / attachment.storage_name
    if not path.exists():
        raise HTTPException(status_code=404, detail="Файл отсутствует в хранилище")
    return FileResponse(path, media_type=attachment.content_type, filename=attachment.original_name)


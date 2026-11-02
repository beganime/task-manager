from datetime import timedelta
from typing import Any

from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile
from fastapi.responses import FileResponse
from sqlalchemy import delete, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import get_session
from app.dependencies import get_current_user
from app.enums import NotificationKind, TaskStatus, UserRole
from app.models import (
    ActivityLog,
    Attachment,
    ChecklistItem,
    Comment,
    Project,
    Task,
    TaskCollaborator,
    TaskFavorite,
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
    ensure_no_parent_cycle,
    ensure_project_access,
    ensure_project_writable,
    ensure_task_access,
    ensure_task_editor,
    is_task_participant,
    task_visibility_clause,
)
from app.services.notifications import commit_and_notify, create_notification
from app.services.serializers import LIST_OPTIONS, task_detail_for, task_list
from app.services.timeutils import day_bounds, local_today
from app.services.uploads import resolve_storage_path, store_upload

router = APIRouter(prefix="/tasks", tags=["tasks"])

CLOSED_STATUSES = (TaskStatus.DONE, TaskStatus.CANCELLED)
# Поля, которые менеджер может менять в назначенной ему корпоративной задаче.
MANAGER_EXECUTION_FIELDS = {"status", "waiting_reason", "is_favorite", "estimate_minutes"}


def favorite_order(user: User):
    return (
        select(TaskFavorite.id)
        .where(TaskFavorite.task_id == Task.id, TaskFavorite.user_id == user.id)
        .exists()
        .desc()
    )


def _serialize(value: Any) -> Any:
    if hasattr(value, "value"):
        return value.value
    if hasattr(value, "isoformat"):
        return value.isoformat()
    return value


async def set_favorite(session: AsyncSession, user: User, task_id: int, value: bool) -> None:
    existing = await session.scalar(
        select(TaskFavorite).where(TaskFavorite.task_id == task_id, TaskFavorite.user_id == user.id)
    )
    if value and existing is None:
        session.add(TaskFavorite(task_id=task_id, user_id=user.id))
    elif not value and existing is not None:
        await session.delete(existing)


@router.get("", response_model=list[TaskListItem])
async def list_my_tasks(
    view: str = Query(default="all", pattern="^(all|today|week|overdue|done|favorites)$"),
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
        .join(Project, Project.id == Task.project_id)
        .where(
            or_(
                Task.primary_assignee_id == user.id,
                Task.id.in_(collaborator_task_ids),
            ),
            task_visibility_clause(user),
        )
        .options(*LIST_OPTIONS)
    )
    # «Сегодня» и «неделя» считаются в часовом поясе пользователя, а не по UTC.
    today = local_today(user)
    today_start, tomorrow = day_bounds(user, today)
    now = utcnow()
    if view == "today":
        statement = statement.where(Task.due_at >= today_start, Task.due_at < tomorrow)
    elif view == "week":
        week_end, _ = day_bounds(user, today + timedelta(days=7))
        statement = statement.where(Task.due_at >= today_start, Task.due_at < week_end)
    elif view == "overdue":
        statement = statement.where(Task.due_at < now, Task.status.notin_(CLOSED_STATUSES))
    elif view == "done":
        statement = statement.where(Task.status == TaskStatus.DONE)
    elif view == "favorites":
        statement = statement.where(
            Task.id.in_(select(TaskFavorite.task_id).where(TaskFavorite.user_id == user.id))
        )
    if project_id is not None:
        await ensure_project_access(session, user, project_id)
        statement = statement.where(Task.project_id == project_id)
    if status is not None:
        statement = statement.where(Task.status == status)
    tasks = list(
        await session.scalars(
            statement.order_by(favorite_order(user), Task.due_at.is_(None), Task.due_at.asc()).limit(
                limit
            )
        )
    )
    return await task_list(session, user, tasks)


@router.post("", response_model=TaskOut, status_code=201)
async def create_task(
    payload: TaskCreate,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> TaskOut:
    project = await ensure_project_access(session, user, payload.project_id)
    ensure_project_writable(project)
    await ensure_assignment_allowed(session, user, project, payload.primary_assignee_id)
    if payload.parent_task_id:
        parent, _ = await ensure_task_access(session, user, payload.parent_task_id)
        if parent.project_id != payload.project_id:
            raise HTTPException(status_code=422, detail="Подзадача должна быть в том же проекте")
        await ensure_no_parent_cycle(session, None, parent.id)
    collaborator_ids = set(payload.collaborator_ids)
    for collaborator_id in collaborator_ids:
        await ensure_assignment_allowed(session, user, project, collaborator_id)
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
        estimate_minutes=payload.estimate_minutes,
        completed_at=utcnow() if payload.status == TaskStatus.DONE else None,
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
    await commit_and_notify(session)
    return await task_detail_for(session, user, task.id)


@router.get("/{task_id}", response_model=TaskOut)
async def get_task(
    task_id: int,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> TaskOut:
    await ensure_task_access(session, user, task_id)
    return await task_detail_for(session, user, task_id)


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
            .join(Project, Project.id == Task.project_id)
            .where(Task.parent_task_id == task_id, task_visibility_clause(user))
            .options(*LIST_OPTIONS)
            .order_by(favorite_order(user), Task.due_at.is_(None), Task.due_at.asc())
        )
    )
    return await task_list(session, user, tasks)


@router.patch("/{task_id}", response_model=TaskOut)
async def update_task(
    task_id: int,
    payload: TaskUpdate,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> TaskOut:
    task, project = await ensure_task_access(session, user, task_id)
    fields = set(payload.model_fields_set)

    # Избранное — персональная отметка, её можно ставить даже в архивном проекте.
    if "is_favorite" in fields and payload.is_favorite is not None:
        await set_favorite(session, user, task.id, payload.is_favorite)
    fields.discard("is_favorite")

    if fields:
        ensure_project_writable(project)

    restricted = (
        not project.is_personal
        and user.role == UserRole.MANAGER
        and not (task.creator_id == user.id and task.primary_assignee_id == user.id)
    )
    if restricted:
        if fields - MANAGER_EXECUTION_FIELDS:
            raise HTTPException(
                status_code=403,
                detail="В назначенной задаче менеджер меняет только выполнение",
            )
        if not await is_task_participant(session, user.id, task):
            raise HTTPException(status_code=403, detail="Изменять задачу может участник задачи")

    if "primary_assignee_id" in fields and payload.primary_assignee_id is not None:
        await ensure_assignment_allowed(session, user, project, payload.primary_assignee_id)

    if "parent_task_id" in fields and payload.parent_task_id is not None:
        parent, _ = await ensure_task_access(session, user, payload.parent_task_id)
        if parent.project_id != task.project_id:
            raise HTTPException(status_code=422, detail="Подзадача должна быть в том же проекте")
        await ensure_no_parent_cycle(session, task.id, parent.id)

    effective_status = payload.status if "status" in fields else task.status
    effective_reason = payload.waiting_reason if "waiting_reason" in fields else task.waiting_reason
    if effective_status == TaskStatus.WAITING and not (effective_reason or "").strip():
        raise HTTPException(status_code=422, detail="Для статуса ожидания укажите причину")

    changes: dict[str, dict[str, object]] = {}
    for field in (
        "title",
        "description",
        "primary_assignee_id",
        "parent_task_id",
        "due_at",
        "priority",
        "status",
        "waiting_reason",
        "estimate_minutes",
    ):
        if field in fields:
            old_value = getattr(task, field)
            new_value = getattr(payload, field)
            if old_value != new_value:
                changes[field] = {"from": _serialize(old_value), "to": _serialize(new_value)}
                setattr(task, field, new_value)

    if "status" in changes:
        # Точное время завершения — для честной статистики «сделано за неделю».
        task.completed_at = utcnow() if task.status == TaskStatus.DONE else None

    if "collaborator_ids" in fields and payload.collaborator_ids is not None:
        collaborator_ids = set(payload.collaborator_ids)
        for collaborator_id in collaborator_ids:
            await ensure_assignment_allowed(session, user, project, collaborator_id)
        current_ids = set(
            await session.scalars(
                select(TaskCollaborator.user_id).where(TaskCollaborator.task_id == task.id)
            )
        )
        target_ids = {item for item in collaborator_ids if item != task.primary_assignee_id}
        if current_ids != target_ids:
            await session.execute(
                delete(TaskCollaborator).where(TaskCollaborator.task_id == task.id)
            )
            session.add_all(
                [TaskCollaborator(task_id=task.id, user_id=item) for item in sorted(target_ids)]
            )
            changes["collaborator_ids"] = {"from": sorted(current_ids), "to": sorted(target_ids)}

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
        elif "status" in changes:
            recipients = {task.primary_assignee_id, task.creator_id} - {user.id}
            for recipient in sorted(recipients):
                await create_notification(
                    session,
                    recipient,
                    NotificationKind.STATUS,
                    "Изменён статус задачи",
                    task.title,
                    task.id,
                )
    await commit_and_notify(session)
    return await task_detail_for(session, user, task.id)


@router.post("/{task_id}/checklist", response_model=ChecklistOut, status_code=201)
async def add_checklist_item(
    task_id: int,
    payload: ChecklistCreate,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> ChecklistOut:
    task, project = await ensure_task_access(session, user, task_id)
    await ensure_task_editor(session, user, task, project)
    item = ChecklistItem(task_id=task.id, title=payload.title.strip(), position=payload.position)
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
    task, project = await ensure_task_access(session, user, task_id)
    await ensure_task_editor(session, user, task, project)
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


@router.delete("/{task_id}/checklist/{item_id}", status_code=204)
async def delete_checklist_item(
    task_id: int,
    item_id: int,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> None:
    task, project = await ensure_task_access(session, user, task_id)
    await ensure_task_editor(session, user, task, project)
    result = await session.execute(
        delete(ChecklistItem).where(ChecklistItem.id == item_id, ChecklistItem.task_id == task_id)
    )
    if not result.rowcount:  # type: ignore[attr-defined]
        raise HTTPException(status_code=404, detail="Пункт чек-листа не найден")
    task.updated_at = utcnow()
    await session.commit()


@router.post("/{task_id}/notes", response_model=AuthorEntry, status_code=201)
async def add_note(
    task_id: int,
    payload: TextCreate,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> AuthorEntry:
    task, project = await ensure_task_access(session, user, task_id)
    await ensure_task_editor(session, user, task, project)
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
    task, project = await ensure_task_access(session, user, task_id)
    ensure_project_writable(project)
    comment = Comment(task_id=task.id, author_id=user.id, body=payload.body)
    session.add(comment)
    task.updated_at = utcnow()
    recipients = {task.primary_assignee_id, task.creator_id} - {user.id}
    for recipient in sorted(recipients):
        await create_notification(
            session,
            recipient,
            NotificationKind.COMMENT,
            "Новый комментарий",
            task.title,
            task.id,
        )
    await commit_and_notify(session)
    await session.refresh(comment)
    return AuthorEntry(id=comment.id, body=comment.body, author=user, created_at=comment.created_at)


@router.post("/{task_id}/attachments", response_model=AttachmentOut, status_code=201)
async def upload_attachment(
    task_id: int,
    file: UploadFile = File(...),
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> AttachmentOut:
    task, project = await ensure_task_access(session, user, task_id)
    await ensure_task_editor(session, user, task, project)
    original_name, storage_name, content_type, size = await store_upload(file)
    attachment = Attachment(
        task_id=task.id,
        uploader_id=user.id,
        original_name=original_name,
        storage_name=storage_name,
        content_type=content_type,
        size=size,
    )
    session.add(attachment)
    task.updated_at = utcnow()
    try:
        await session.commit()
    except Exception:
        resolve_storage_path(storage_name).unlink(missing_ok=True)
        raise
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
    path = resolve_storage_path(attachment.storage_name)
    if not path.exists():
        raise HTTPException(status_code=404, detail="Файл отсутствует в хранилище")
    return FileResponse(
        path,
        media_type=attachment.content_type,
        filename=attachment.original_name,
        content_disposition_type="attachment",
        headers={
            "X-Content-Type-Options": "nosniff",
            "Content-Security-Policy": "default-src 'none'; sandbox",
            "Cache-Control": "private, no-store",
        },
    )

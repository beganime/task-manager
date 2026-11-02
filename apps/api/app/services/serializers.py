from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models import (
    ActivityLog,
    Attachment,
    Comment,
    Project,
    ProjectMember,
    Task,
    TaskCollaborator,
    TaskNote,
)
from app.schemas import (
    ActivityOut,
    AttachmentOut,
    AuthorEntry,
    ChecklistOut,
    ProjectOut,
    TaskListItem,
    TaskOut,
    UserBrief,
)


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
    return await session.scalar(select(Task).where(Task.id == task_id).options(*TASK_OPTIONS))


def task_list_item(task: Task) -> TaskListItem:
    return TaskListItem(
        id=task.id,
        project_id=task.project_id,
        project_name=task.project.name,
        title=task.title,
        status=task.status,
        priority=task.priority,
        due_at=task.due_at,
        primary_assignee=UserBrief.model_validate(task.primary_assignee),
        is_favorite=task.is_favorite,
        updated_at=task.updated_at,
    )


def task_detail(task: Task) -> TaskOut:
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
        is_favorite=task.is_favorite,
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


async def project_out(session: AsyncSession, project: Project) -> ProjectOut:
    member_ids = list(
        await session.scalars(
            select(ProjectMember.user_id).where(ProjectMember.project_id == project.id)
        )
    )
    return ProjectOut(
        id=project.id,
        name=project.name,
        description=project.description,
        owner_id=project.owner_id,
        is_archived=project.is_archived,
        member_ids=member_ids,
        created_at=project.created_at,
        updated_at=project.updated_at,
    )


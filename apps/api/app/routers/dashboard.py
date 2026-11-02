from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends
from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import get_session
from app.dependencies import get_current_user
from app.enums import TaskStatus
from app.models import Task, TaskCollaborator, User
from app.schemas import DashboardOut
from app.services.serializers import TASK_OPTIONS, task_list_item


router = APIRouter(prefix="/dashboard", tags=["dashboard"])


@router.get("/my-day", response_model=DashboardOut)
async def my_day(
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> DashboardOut:
    now = datetime.now(timezone.utc)
    today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
    tomorrow = today_start + timedelta(days=1)
    week_start = today_start - timedelta(days=today_start.weekday())
    collaborator_tasks = select(TaskCollaborator.task_id).where(
        TaskCollaborator.user_id == user.id
    )
    mine = or_(Task.primary_assignee_id == user.id, Task.id.in_(collaborator_tasks))

    async def count(*conditions) -> int:
        value = await session.scalar(select(func.count(Task.id)).where(mine, *conditions))
        return int(value or 0)

    today = await count(Task.due_at >= today_start, Task.due_at < tomorrow)
    overdue = await count(
        Task.due_at < now,
        Task.status.notin_([TaskStatus.DONE, TaskStatus.CANCELLED]),
    )
    waiting = await count(Task.status == TaskStatus.WAITING)
    done_this_week = await count(
        Task.status == TaskStatus.DONE,
        Task.updated_at >= week_start,
    )
    priorities = list(
        await session.scalars(
            select(Task)
            .where(
                mine,
                Task.status.notin_([TaskStatus.DONE, TaskStatus.CANCELLED]),
            )
            .options(*TASK_OPTIONS)
            .order_by(Task.is_favorite.desc(), Task.priority.desc(), Task.due_at.asc())
            .limit(3)
        )
    )
    return DashboardOut(
        today=today,
        overdue=overdue,
        waiting=waiting,
        done_this_week=done_this_week,
        priorities=[task_list_item(task) for task in priorities],
    )


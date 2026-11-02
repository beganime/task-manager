from datetime import timedelta

from fastapi import APIRouter, Depends
from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import get_session
from app.dependencies import get_current_user
from app.enums import TaskPriority, TaskStatus
from app.models import Project, Task, TaskCollaborator, TaskFavorite, User, utcnow
from app.schemas import DashboardOut, WorkloadOut
from app.services.access import task_visibility_clause
from app.services.ritual import ritual_minutes
from app.services.serializers import LIST_OPTIONS, task_list
from app.services.timeutils import day_bounds, local_today, week_start

router = APIRouter(prefix="/dashboard", tags=["dashboard"])

CLOSED = (TaskStatus.DONE, TaskStatus.CANCELLED)
# Оценка по умолчанию для задачи с дедлайном сегодня, если исполнитель её не указал.
DEFAULT_TASK_MINUTES = 60

PRIORITY_RANK = {
    TaskPriority.CRITICAL: 0,
    TaskPriority.HIGH: 1,
    TaskPriority.MEDIUM: 2,
    TaskPriority.LOW: 3,
}


def _hours(minutes: int) -> str:
    hours, rest = divmod(max(minutes, 0), 60)
    return f"{hours} ч {rest:02d} мин" if rest else f"{hours} ч"


def build_workload(
    workday_minutes: int, ritual: int, estimates: list[int | None]
) -> WorkloadOut:
    free = max(workday_minutes - ritual, 0)
    planned = sum(value or DEFAULT_TASK_MINUTES for value in estimates)
    overloaded = planned > free
    message = None
    if overloaded:
        message = (
            f"На сегодня запланировано {_hours(planned)}, а свободно {_hours(free)} "
            f"(рабочий день минус {ritual} мин ритуала). Перенесите часть дедлайнов."
        )
    return WorkloadOut(
        workday_minutes=workday_minutes,
        ritual_minutes=ritual,
        free_minutes=free,
        planned_minutes=planned,
        deadlines_today=len(estimates),
        overloaded=overloaded,
        message=message,
    )


@router.get("/my-day", response_model=DashboardOut)
async def my_day(
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> DashboardOut:
    now = utcnow()
    today = local_today(user)
    today_start, tomorrow = day_bounds(user, today)
    week_begin, _ = day_bounds(user, week_start(today))
    collaborator_tasks = select(TaskCollaborator.task_id).where(
        TaskCollaborator.user_id == user.id
    )
    mine = or_(Task.primary_assignee_id == user.id, Task.id.in_(collaborator_tasks))
    visible = task_visibility_clause(user)

    def base(*columns):
        return select(*columns).join(Project, Project.id == Task.project_id).where(mine, visible)

    async def count(*conditions) -> int:
        value = await session.scalar(base(func.count(Task.id)).where(*conditions))
        return int(value or 0)

    today_count = await count(Task.due_at >= today_start, Task.due_at < tomorrow)
    overdue = await count(Task.due_at < now, Task.status.notin_(CLOSED))
    waiting = await count(Task.status == TaskStatus.WAITING)
    # Раньше считалось по updated_at: любая правка старой задачи попадала в «сделано за неделю».
    done_this_week = await count(Task.status == TaskStatus.DONE, Task.completed_at >= week_begin)

    estimates = list(
        await session.scalars(
            base(Task.estimate_minutes).where(
                Task.due_at >= today_start,
                Task.due_at < tomorrow,
                Task.status.notin_(CLOSED),
            )
        )
    )
    workload = build_workload(user.workday_minutes, await ritual_minutes(session, user), estimates)

    favorite = (
        select(TaskFavorite.id)
        .where(TaskFavorite.task_id == Task.id, TaskFavorite.user_id == user.id)
        .exists()
    )
    candidates = list(
        await session.scalars(
            base(Task)
            .where(Task.status.notin_(CLOSED))
            .options(*LIST_OPTIONS)
            .order_by(favorite.desc(), Task.due_at.is_(None), Task.due_at.asc())
            .limit(30)
        )
    )
    favorites_first = await task_list(session, user, candidates)
    # Приоритет сортируем в Python: enum хранится строкой, и SQL-сортировка была алфавитной.
    favorites_first.sort(
        key=lambda item: (
            not item.is_favorite,
            item.due_at is None or item.due_at >= tomorrow,
            PRIORITY_RANK[item.priority],
            item.due_at or now + timedelta(days=36500),
        )
    )
    return DashboardOut(
        today=today_count,
        overdue=overdue,
        waiting=waiting,
        done_this_week=done_this_week,
        priorities=favorites_first[:3],
        local_date=today,
        timezone=user.timezone,
        workload=workload,
    )

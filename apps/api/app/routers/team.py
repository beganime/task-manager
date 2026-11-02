from datetime import datetime, timezone

from fastapi import APIRouter, Depends
from sqlalchemy import case, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import get_session
from app.dependencies import require_roles
from app.enums import TaskStatus, UserRole
from app.models import Task, User
from app.schemas import TaskListItem, TeamMemberSummary, UserBrief
from app.services.serializers import TASK_OPTIONS, task_list_item


router = APIRouter(prefix="/team", tags=["team"])


@router.get("/summary", response_model=list[TeamMemberSummary])
async def team_summary(
    _: User = Depends(require_roles(UserRole.LEADER, UserRole.ADMIN)),
    session: AsyncSession = Depends(get_session),
) -> list[TeamMemberSummary]:
    now = datetime.now(timezone.utc)
    rows = (
        await session.execute(
            select(
                User,
                func.count(Task.id).label("total"),
                func.sum(case((Task.status == TaskStatus.IN_PROGRESS, 1), else_=0)).label(
                    "in_progress"
                ),
                func.sum(
                    case(
                        (
                            (Task.due_at < now)
                            & Task.status.notin_([TaskStatus.DONE, TaskStatus.CANCELLED]),
                            1,
                        ),
                        else_=0,
                    )
                ).label("overdue"),
                func.sum(case((Task.status == TaskStatus.WAITING, 1), else_=0)).label(
                    "waiting"
                ),
            )
            .outerjoin(Task, Task.primary_assignee_id == User.id)
            .where(User.role == UserRole.MANAGER, User.is_active.is_(True))
            .group_by(User.id)
            .order_by(User.full_name)
        )
    ).all()
    return [
        TeamMemberSummary(
            user=UserBrief.model_validate(user),
            total=int(total or 0),
            in_progress=int(in_progress or 0),
            overdue=int(overdue or 0),
            waiting=int(waiting or 0),
        )
        for user, total, in_progress, overdue, waiting in rows
    ]


@router.get("/{user_id}/tasks", response_model=list[TaskListItem])
async def team_member_tasks(
    user_id: int,
    _: User = Depends(require_roles(UserRole.LEADER, UserRole.ADMIN)),
    session: AsyncSession = Depends(get_session),
) -> list[TaskListItem]:
    tasks = list(
        await session.scalars(
            select(Task)
            .where(Task.primary_assignee_id == user_id)
            .options(*TASK_OPTIONS)
            .order_by(Task.due_at.asc())
        )
    )
    return [task_list_item(task) for task in tasks]


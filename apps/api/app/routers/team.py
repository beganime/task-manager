from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import and_, case, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import get_session
from app.dependencies import require_roles
from app.enums import TaskStatus, UserRole
from app.models import Project, Task, User, utcnow
from app.schemas import TaskListItem, TeamMemberSummary, UserBrief
from app.services.serializers import LIST_OPTIONS, task_list

router = APIRouter(prefix="/team", tags=["team"])

# Статистика команды учитывает только корпоративные проекты: личные проекты
# сотрудников руководителю не видны.
CORPORATE_TASKS = select(Project.id).where(Project.is_personal.is_(False))


@router.get("/summary", response_model=list[TeamMemberSummary])
async def team_summary(
    _: User = Depends(require_roles(UserRole.LEADER, UserRole.ADMIN)),
    session: AsyncSession = Depends(get_session),
) -> list[TeamMemberSummary]:
    now = utcnow()
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
            .outerjoin(
                Task,
                and_(
                    Task.primary_assignee_id == User.id,
                    Task.project_id.in_(CORPORATE_TASKS),
                ),
            )
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
    viewer: User = Depends(require_roles(UserRole.LEADER, UserRole.ADMIN)),
    session: AsyncSession = Depends(get_session),
) -> list[TaskListItem]:
    member = await session.get(User, user_id)
    if member is None or member.role == UserRole.PERSONAL:
        raise HTTPException(status_code=404, detail="Сотрудник не найден")
    tasks = list(
        await session.scalars(
            select(Task)
            .where(Task.primary_assignee_id == user_id, Task.project_id.in_(CORPORATE_TASKS))
            .options(*LIST_OPTIONS)
            .order_by(Task.due_at.is_(None), Task.due_at.asc())
        )
    )
    return await task_list(session, viewer, tasks)

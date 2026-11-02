from fastapi import APIRouter, Depends, Query
from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import get_session
from app.dependencies import get_current_user
from app.models import Project, Task, User
from app.routers.users import visible_users_statement
from app.schemas import SearchResponse
from app.services.access import accessible_projects_clause, task_visibility_clause
from app.services.serializers import LIST_OPTIONS, projects_out, task_list, user_out

router = APIRouter(prefix="/search", tags=["search"])


def like_pattern(query: str) -> str:
    """Экранирует спецсимволы LIKE: раньше запрос `%%` возвращал всё."""
    escaped = query.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
    return f"%{escaped}%"


@router.get("", response_model=SearchResponse)
async def global_search(
    query: str = Query(min_length=2, max_length=100),
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> SearchResponse:
    cleaned = query.strip()
    if len(cleaned) < 2:
        return SearchResponse(tasks=[], projects=[], users=[])
    pattern = like_pattern(cleaned)

    project_statement = select(Project).where(
        Project.is_archived.is_(False),
        accessible_projects_clause(user),
        or_(
            Project.name.ilike(pattern, escape="\\"),
            Project.description.ilike(pattern, escape="\\"),
        ),
    )
    task_statement = (
        select(Task)
        .join(Project, Project.id == Task.project_id)
        .where(
            task_visibility_clause(user),
            or_(
                Task.title.ilike(pattern, escape="\\"),
                Task.description.ilike(pattern, escape="\\"),
            ),
        )
        .options(*LIST_OPTIONS)
    )
    projects = list(await session.scalars(project_statement.order_by(Project.name).limit(20)))
    tasks = list(await session.scalars(task_statement.order_by(Task.updated_at.desc()).limit(30)))
    users = list(
        await session.scalars(
            visible_users_statement(user)
            .where(User.full_name.ilike(pattern, escape="\\"))
            .order_by(User.full_name)
            .limit(20)
        )
    )
    return SearchResponse(
        tasks=await task_list(session, user, tasks),
        projects=await projects_out(session, projects),
        users=[user_out(item, user) for item in users],
    )

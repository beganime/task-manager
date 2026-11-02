from fastapi import APIRouter, Depends, Query
from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import get_session
from app.dependencies import get_current_user
from app.enums import UserRole
from app.models import Project, ProjectMember, Task, User
from app.schemas import SearchResponse, UserOut
from app.services.serializers import TASK_OPTIONS, project_out, task_list_item


router = APIRouter(prefix="/search", tags=["search"])


@router.get("", response_model=SearchResponse)
async def global_search(
    query: str = Query(min_length=2, max_length=100),
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> SearchResponse:
    pattern = f"%{query.strip()}%"
    project_statement = select(Project).where(
        Project.is_archived.is_(False),
        or_(Project.name.ilike(pattern), Project.description.ilike(pattern)),
    )
    task_statement = (
        select(Task)
        .join(Project, Project.id == Task.project_id)
        .where(or_(Task.title.ilike(pattern), Task.description.ilike(pattern)))
        .options(*TASK_OPTIONS)
    )
    if user.role == UserRole.MANAGER:
        accessible_projects = select(ProjectMember.project_id).where(
            ProjectMember.user_id == user.id
        )
        project_statement = project_statement.where(Project.id.in_(accessible_projects))
        task_statement = task_statement.where(Task.project_id.in_(accessible_projects))

    projects = list(await session.scalars(project_statement.order_by(Project.name).limit(20)))
    tasks = list(await session.scalars(task_statement.order_by(Task.updated_at.desc()).limit(30)))
    users = list(
        await session.scalars(
            select(User)
            .where(User.is_active.is_(True), User.full_name.ilike(pattern))
            .order_by(User.full_name)
            .limit(20)
        )
    )
    return SearchResponse(
        tasks=[task_list_item(task) for task in tasks],
        projects=[await project_out(session, project) for project in projects],
        users=[UserOut.model_validate(item) for item in users],
    )

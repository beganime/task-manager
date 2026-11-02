from fastapi import APIRouter, Depends, HTTPException, Response
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import get_session
from app.dependencies import get_current_user, require_roles
from app.enums import UserRole
from app.models import Project, ProjectMember, Task, User
from app.schemas import MemberUpdate, ProjectCreate, ProjectOut, ProjectUpdate, TaskListItem, UserOut
from app.services.access import ensure_project_access, ensure_project_manager
from app.services.serializers import TASK_OPTIONS, project_out, task_list_item


router = APIRouter(prefix="/projects", tags=["projects"])


@router.get("", response_model=list[ProjectOut])
async def list_projects(
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> list[ProjectOut]:
    statement = select(Project).where(Project.is_archived.is_(False)).order_by(Project.updated_at.desc())
    if user.role == UserRole.MANAGER:
        statement = statement.join(ProjectMember).where(ProjectMember.user_id == user.id)
    projects = list(await session.scalars(statement))
    return [await project_out(session, project) for project in projects]


@router.post("", response_model=ProjectOut, status_code=201)
async def create_project(
    payload: ProjectCreate,
    user: User = Depends(require_roles(UserRole.LEADER, UserRole.ADMIN)),
    session: AsyncSession = Depends(get_session),
) -> ProjectOut:
    member_ids = set(payload.member_ids)
    member_ids.add(user.id)
    existing_ids = set(
        await session.scalars(
            select(User.id).where(User.id.in_(member_ids), User.is_active.is_(True))
        )
    )
    if member_ids != existing_ids:
        raise HTTPException(status_code=422, detail="Один или несколько участников не найдены")
    project = Project(name=payload.name, description=payload.description, owner_id=user.id)
    session.add(project)
    await session.flush()
    session.add_all(
        [ProjectMember(project_id=project.id, user_id=user_id) for user_id in sorted(member_ids)]
    )
    await session.commit()
    await session.refresh(project)
    return await project_out(session, project)


@router.get("/{project_id}", response_model=ProjectOut)
async def get_project(
    project_id: int,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> ProjectOut:
    project = await ensure_project_access(session, user, project_id)
    return await project_out(session, project)


@router.patch("/{project_id}", response_model=ProjectOut)
async def update_project(
    project_id: int,
    payload: ProjectUpdate,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> ProjectOut:
    project = await ensure_project_manager(session, user, project_id)
    for field in payload.model_fields_set:
        setattr(project, field, getattr(payload, field))
    await session.commit()
    await session.refresh(project)
    return await project_out(session, project)


@router.get("/{project_id}/members", response_model=list[UserOut])
async def project_members(
    project_id: int,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> list[UserOut]:
    await ensure_project_access(session, user, project_id)
    members = list(
        await session.scalars(
            select(User)
            .join(ProjectMember, ProjectMember.user_id == User.id)
            .where(ProjectMember.project_id == project_id)
            .order_by(User.full_name)
        )
    )
    return [UserOut.model_validate(member) for member in members]


@router.post("/{project_id}/members", response_model=ProjectOut)
async def add_member(
    project_id: int,
    payload: MemberUpdate,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> ProjectOut:
    project = await ensure_project_manager(session, user, project_id)
    member = await session.get(User, payload.user_id)
    if not member or not member.is_active:
        raise HTTPException(status_code=422, detail="Пользователь не найден")
    existing = await session.scalar(
        select(ProjectMember).where(
            ProjectMember.project_id == project_id,
            ProjectMember.user_id == payload.user_id,
        )
    )
    if not existing:
        session.add(ProjectMember(project_id=project_id, user_id=payload.user_id))
        await session.commit()
    return await project_out(session, project)


@router.delete("/{project_id}/members/{member_id}", status_code=204)
async def remove_member(
    project_id: int,
    member_id: int,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> Response:
    project = await ensure_project_manager(session, user, project_id)
    if project.owner_id == member_id:
        raise HTTPException(status_code=422, detail="Нельзя удалить владельца проекта")
    await session.execute(
        delete(ProjectMember).where(
            ProjectMember.project_id == project_id,
            ProjectMember.user_id == member_id,
        )
    )
    await session.commit()
    return Response(status_code=204)


@router.get("/{project_id}/tasks", response_model=list[TaskListItem])
async def project_tasks(
    project_id: int,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> list[TaskListItem]:
    await ensure_project_access(session, user, project_id)
    tasks = list(
        await session.scalars(
            select(Task)
            .where(Task.project_id == project_id)
            .options(*TASK_OPTIONS)
            .order_by(Task.is_favorite.desc(), Task.due_at.asc())
        )
    )
    return [task_list_item(task) for task in tasks]


from fastapi import APIRouter, Depends, HTTPException, Query, Response
from sqlalchemy import delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import get_session
from app.dependencies import get_current_user
from app.enums import CORPORATE_ROLES, UserRole
from app.models import Project, ProjectMember, Task, TaskFavorite, User
from app.schemas import (
    MemberUpdate,
    ProjectCreate,
    ProjectOut,
    ProjectUpdate,
    TaskListItem,
    UserOut,
)
from app.services.access import (
    accessible_projects_clause,
    ensure_project_access,
    ensure_project_manager,
    is_company_manager,
    task_visibility_clause,
)
from app.services.serializers import LIST_OPTIONS, project_out, projects_out, task_list, user_out

router = APIRouter(prefix="/projects", tags=["projects"])


@router.get("", response_model=list[ProjectOut])
async def list_projects(
    include_archived: bool = False,
    personal: bool | None = Query(default=None, description="Фильтр: только личные/корпоративные"),
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> list[ProjectOut]:
    statement = select(Project).where(accessible_projects_clause(user))
    if not include_archived:
        statement = statement.where(Project.is_archived.is_(False))
    if personal is not None:
        statement = statement.where(Project.is_personal.is_(personal))
    projects = list(await session.scalars(statement.order_by(Project.updated_at.desc())))
    return await projects_out(session, projects)


@router.post("", response_model=ProjectOut, status_code=201)
async def create_project(
    payload: ProjectCreate,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> ProjectOut:
    # Личный аккаунт создаёт только личные проекты. Любой сотрудник может завести
    # себе личный проект; корпоративный — только leader/admin.
    is_personal = payload.is_personal or user.role == UserRole.PERSONAL
    if not is_personal and not is_company_manager(user):
        raise HTTPException(status_code=403, detail="Создавать проекты компании может руководитель")

    member_ids = set(payload.member_ids)
    member_ids.add(user.id)
    if is_personal:
        # В личный проект участников приглашают по email после создания —
        # так нельзя «перебрать» id чужих пользователей.
        member_ids = {user.id}
    else:
        existing_ids = set(
            await session.scalars(
                select(User.id).where(
                    User.id.in_(member_ids),
                    User.is_active.is_(True),
                    User.role.in_(CORPORATE_ROLES),
                )
            )
        )
        if member_ids != existing_ids:
            raise HTTPException(status_code=422, detail="Один или несколько участников не найдены")

    project = Project(
        name=payload.name.strip(),
        description=payload.description,
        owner_id=user.id,
        is_personal=is_personal,
        color=payload.color or ("#2F7D5B" if not is_personal else "#F07A2B"),
    )
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
    fields = payload.model_fields_set
    if project.is_archived and fields - {"is_archived"}:
        raise HTTPException(
            status_code=409, detail="Проект в архиве. Сначала верните его из архива"
        )
    for field in fields:
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
    return [user_out(member, user) for member in members]


@router.post("/{project_id}/members", response_model=ProjectOut)
async def add_member(
    project_id: int,
    payload: MemberUpdate,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> ProjectOut:
    project = await ensure_project_manager(session, user, project_id)
    if project.is_archived:
        raise HTTPException(status_code=409, detail="Проект в архиве")
    if payload.email is not None:
        member = await session.scalar(
            select(User).where(func.lower(User.email) == payload.email.lower())
        )
    else:
        member = await session.get(User, payload.user_id)
    if not member or not member.is_active:
        raise HTTPException(status_code=422, detail="Пользователь не найден")
    if not project.is_personal and member.role not in CORPORATE_ROLES:
        raise HTTPException(
            status_code=422, detail="В проект компании можно добавить только сотрудника"
        )
    existing = await session.scalar(
        select(ProjectMember).where(
            ProjectMember.project_id == project_id,
            ProjectMember.user_id == member.id,
        )
    )
    if not existing:
        session.add(ProjectMember(project_id=project_id, user_id=member.id))
        await session.commit()
    return await project_out(session, project)


@router.delete("/{project_id}/members/{member_id}", status_code=204)
async def remove_member(
    project_id: int,
    member_id: int,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> Response:
    if member_id == user.id:
        # Участник может сам выйти из проекта.
        project = await ensure_project_access(session, user, project_id)
    else:
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
    favorite = (
        select(TaskFavorite.id)
        .where(TaskFavorite.task_id == Task.id, TaskFavorite.user_id == user.id)
        .exists()
    )
    tasks = list(
        await session.scalars(
            select(Task)
            .join(Project, Project.id == Task.project_id)
            .where(Task.project_id == project_id, task_visibility_clause(user))
            .options(*LIST_OPTIONS)
            .order_by(favorite.desc(), Task.due_at.is_(None), Task.due_at.asc())
        )
    )
    return await task_list(session, user, tasks)

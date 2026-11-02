from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.enums import UserRole
from app.models import Project, ProjectMember, Task, User


async def get_project_or_404(session: AsyncSession, project_id: int) -> Project:
    project = await session.get(Project, project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Проект не найден")
    return project


async def can_access_project(session: AsyncSession, user: User, project_id: int) -> bool:
    if user.role in (UserRole.LEADER, UserRole.ADMIN):
        return True
    membership = await session.scalar(
        select(ProjectMember.id).where(
            ProjectMember.project_id == project_id,
            ProjectMember.user_id == user.id,
        )
    )
    return membership is not None


async def ensure_project_access(session: AsyncSession, user: User, project_id: int) -> Project:
    project = await get_project_or_404(session, project_id)
    if not await can_access_project(session, user, project_id):
        raise HTTPException(status_code=403, detail="Нет доступа к проекту")
    return project


async def ensure_project_manager(session: AsyncSession, user: User, project_id: int) -> Project:
    project = await ensure_project_access(session, user, project_id)
    if user.role not in (UserRole.LEADER, UserRole.ADMIN) and project.owner_id != user.id:
        raise HTTPException(status_code=403, detail="Управлять проектом может руководитель")
    return project


async def ensure_task_access(session: AsyncSession, user: User, task_id: int) -> Task:
    task = await session.get(Task, task_id)
    if not task:
        raise HTTPException(status_code=404, detail="Задача не найдена")
    await ensure_project_access(session, user, task.project_id)
    return task


async def ensure_assignment_allowed(
    session: AsyncSession,
    actor: User,
    project_id: int,
    assignee_id: int,
) -> User:
    assignee = await session.get(User, assignee_id)
    if not assignee or not assignee.is_active:
        raise HTTPException(status_code=422, detail="Исполнитель не найден")
    if actor.role == UserRole.MANAGER and assignee.id != actor.id:
        raise HTTPException(status_code=403, detail="Менеджер может назначить задачу только себе")
    if actor.role == UserRole.ADMIN and assignee.role == UserRole.LEADER:
        raise HTTPException(status_code=403, detail="Администратор не назначает задачи руководителю")
    if assignee.role == UserRole.MANAGER:
        member = await session.scalar(
            select(ProjectMember.id).where(
                ProjectMember.project_id == project_id,
                ProjectMember.user_id == assignee.id,
            )
        )
        if member is None:
            raise HTTPException(status_code=422, detail="Исполнитель не состоит в проекте")
    return assignee


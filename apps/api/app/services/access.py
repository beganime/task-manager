"""Единая точка проверки прав доступа.

Матрица ролей (проверяется только на сервере):

* Корпоративный проект (`Project.is_personal = False`):
  - leader/admin видят и меняют всё;
  - manager видит проект, если он участник, и только «свои» задачи —
    где он исполнитель, соисполнитель или автор;
  - personal-пользователь корпоративные проекты не видит вообще.
* Личный проект (`Project.is_personal = True`):
  - видят только участники, даже leader/admin компании без членства его не видят;
  - участники видят все задачи проекта и могут их менять;
  - управляет проектом (переименовать, архивировать, приглашать) только владелец.
* Архивный проект доступен только на чтение (409 на запись).
"""

from fastapi import HTTPException
from sqlalchemy import ColumnElement, and_, exists, false, or_, select, true
from sqlalchemy.ext.asyncio import AsyncSession

from app.enums import COMPANY_MANAGERS, CORPORATE_ROLES, UserRole
from app.models import Project, ProjectMember, Task, TaskCollaborator, User


def is_company_manager(user: User) -> bool:
    return user.role in COMPANY_MANAGERS


def is_corporate(user: User) -> bool:
    return user.role in CORPORATE_ROLES


async def get_project_or_404(session: AsyncSession, project_id: int) -> Project:
    project = await session.get(Project, project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Проект не найден")
    return project


async def is_project_member(session: AsyncSession, user_id: int, project_id: int) -> bool:
    membership = await session.scalar(
        select(ProjectMember.id).where(
            ProjectMember.project_id == project_id,
            ProjectMember.user_id == user_id,
        )
    )
    return membership is not None


async def can_access_project(session: AsyncSession, user: User, project: Project) -> bool:
    if project.is_personal:
        return await is_project_member(session, user.id, project.id)
    if user.role == UserRole.PERSONAL:
        return False
    if is_company_manager(user):
        return True
    return await is_project_member(session, user.id, project.id)


def accessible_projects_clause(user: User) -> ColumnElement[bool]:
    """SQL-условие «проект доступен пользователю» для списков и поиска."""
    member_of = select(ProjectMember.project_id).where(ProjectMember.user_id == user.id)
    if is_company_manager(user):
        return or_(Project.is_personal.is_(False), Project.id.in_(member_of))
    if user.role == UserRole.PERSONAL:
        return and_(Project.is_personal.is_(True), Project.id.in_(member_of))
    return Project.id.in_(member_of)


def task_visibility_clause(user: User) -> ColumnElement[bool]:
    """SQL-условие «задача видна пользователю». Требует join с Project."""
    if is_company_manager(user):
        own_scope: ColumnElement[bool] = true()
    elif user.role == UserRole.MANAGER:
        own_scope = or_(
            Project.is_personal.is_(True),
            Task.primary_assignee_id == user.id,
            Task.creator_id == user.id,
            exists().where(
                TaskCollaborator.task_id == Task.id,
                TaskCollaborator.user_id == user.id,
            ),
        )
    elif user.role == UserRole.PERSONAL:
        own_scope = Project.is_personal.is_(True)
    else:
        own_scope = false()
    return and_(accessible_projects_clause(user), own_scope)


async def ensure_project_access(session: AsyncSession, user: User, project_id: int) -> Project:
    project = await get_project_or_404(session, project_id)
    if not await can_access_project(session, user, project):
        # Личные проекты чужих людей не раскрываем даже фактом существования.
        if project.is_personal:
            raise HTTPException(status_code=404, detail="Проект не найден")
        raise HTTPException(status_code=403, detail="Нет доступа к проекту")
    return project


def ensure_project_writable(project: Project) -> None:
    if project.is_archived:
        raise HTTPException(
            status_code=409,
            detail="Проект в архиве. Верните его из архива, чтобы вносить изменения",
        )


async def ensure_project_manager(session: AsyncSession, user: User, project_id: int) -> Project:
    project = await ensure_project_access(session, user, project_id)
    if project.is_personal:
        if project.owner_id != user.id:
            raise HTTPException(status_code=403, detail="Управлять проектом может только владелец")
        return project
    if not is_company_manager(user) and project.owner_id != user.id:
        raise HTTPException(status_code=403, detail="Управлять проектом может руководитель")
    return project


async def is_task_participant(session: AsyncSession, user_id: int, task: Task) -> bool:
    if user_id in (task.creator_id, task.primary_assignee_id):
        return True
    collaborator = await session.scalar(
        select(TaskCollaborator.id).where(
            TaskCollaborator.task_id == task.id,
            TaskCollaborator.user_id == user_id,
        )
    )
    return collaborator is not None


async def ensure_task_access(
    session: AsyncSession, user: User, task_id: int
) -> tuple[Task, Project]:
    task = await session.get(Task, task_id)
    if not task:
        raise HTTPException(status_code=404, detail="Задача не найдена")
    project = await get_project_or_404(session, task.project_id)
    if not await can_access_project(session, user, project):
        raise HTTPException(status_code=404, detail="Задача не найдена")
    if (
        user.role == UserRole.MANAGER
        and not project.is_personal
        and not await is_task_participant(session, user.id, task)
    ):
        # Менеджер в корпоративном проекте видит только свои задачи.
        raise HTTPException(status_code=404, detail="Задача не найдена")
    return task, project


async def ensure_task_editor(
    session: AsyncSession, user: User, task: Task, project: Project
) -> None:
    """Право вносить изменения в содержимое задачи (чек-лист, заметки, файлы)."""
    ensure_project_writable(project)
    if project.is_personal:
        return  # доступ участника уже проверен в ensure_task_access
    if is_company_manager(user):
        return
    if not await is_task_participant(session, user.id, task):
        raise HTTPException(status_code=403, detail="Изменять задачу может участник задачи")


async def ensure_assignment_allowed(
    session: AsyncSession,
    actor: User,
    project: Project,
    assignee_id: int,
) -> User:
    assignee = await session.get(User, assignee_id)
    if not assignee or not assignee.is_active:
        raise HTTPException(status_code=422, detail="Исполнитель не найден")

    if project.is_personal:
        if not await is_project_member(session, assignee.id, project.id):
            raise HTTPException(status_code=422, detail="Исполнитель не состоит в проекте")
        return assignee

    if assignee.role == UserRole.PERSONAL:
        raise HTTPException(
            status_code=422, detail="Личный аккаунт нельзя назначить на задачу компании"
        )
    if actor.role == UserRole.MANAGER and assignee.id != actor.id:
        raise HTTPException(status_code=403, detail="Менеджер может назначить задачу только себе")
    if actor.role == UserRole.ADMIN and assignee.role == UserRole.LEADER:
        raise HTTPException(status_code=403, detail="Администратор не назначает задачи руководителю")
    if assignee.role == UserRole.MANAGER and not await is_project_member(
        session, assignee.id, project.id
    ):
        raise HTTPException(status_code=422, detail="Исполнитель не состоит в проекте")
    return assignee


async def ensure_no_parent_cycle(
    session: AsyncSession, task_id: int | None, parent_id: int
) -> None:
    """Запрещает циклы A → B → A в дереве подзадач и ограничивает глубину."""
    max_depth = 10
    current: int | None = parent_id
    depth = 0
    while current is not None:
        if task_id is not None and current == task_id:
            raise HTTPException(status_code=422, detail="Задача не может быть подзадачей самой себя")
        depth += 1
        if depth > max_depth:
            raise HTTPException(status_code=422, detail="Слишком глубокая вложенность подзадач")
        current = await session.scalar(select(Task.parent_task_id).where(Task.id == current))

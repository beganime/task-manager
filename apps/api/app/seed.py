from datetime import timedelta

from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.enums import NotificationKind, TaskPriority, TaskStatus, UserRole
from app.models import (
    ActivityLog,
    ChecklistItem,
    Comment,
    Notification,
    Project,
    ProjectMember,
    Task,
    TaskNote,
    User,
    utcnow,
)
from app.security import hash_password


async def seed_database(session: AsyncSession) -> None:
    existing = await session.scalar(select(User.id).limit(1))
    if existing:
        legacy_domains = {
            "leader@elite.local": "leader@elite-task.ru",
            "admin@elite.local": "admin@elite-task.ru",
            "olesya@elite.local": "olesya@elite-task.ru",
            "maya@elite.local": "maya@elite-task.ru",
        }
        for old_email, new_email in legacy_domains.items():
            await session.execute(
                update(User).where(User.email == old_email).values(email=new_email)
            )
        await session.commit()
        return

    users = [
        User(
            email="leader@elite-task.ru",
            full_name="Алишер Ахмедов",
            password_hash=hash_password("demo12345"),
            role=UserRole.LEADER,
        ),
        User(
            email="admin@elite-task.ru",
            full_name="Администратор Elite",
            password_hash=hash_password("demo12345"),
            role=UserRole.ADMIN,
        ),
        User(
            email="olesya@elite-task.ru",
            full_name="Олеся Иванова",
            password_hash=hash_password("demo12345"),
            role=UserRole.MANAGER,
        ),
        User(
            email="maya@elite-task.ru",
            full_name="Мая Каримова",
            password_hash=hash_password("demo12345"),
            role=UserRole.MANAGER,
        ),
    ]
    session.add_all(users)
    await session.flush()
    leader, admin, olesya, maya = users

    project = Project(
        name="Поступление студентов 2027/2028",
        description="Подготовка и подача документов студентов в университеты.",
        owner_id=leader.id,
    )
    session.add(project)
    await session.flush()
    session.add_all(
        [ProjectMember(project_id=project.id, user_id=user.id) for user in users]
    )

    now = utcnow()
    tasks = [
        Task(
            project_id=project.id,
            creator_id=leader.id,
            primary_assignee_id=olesya.id,
            title="Подготовить документы для поступления",
            description="Проверить комплект документов и подготовить заявление.",
            status=TaskStatus.IN_PROGRESS,
            priority=TaskPriority.HIGH,
            due_at=now + timedelta(days=1),
            is_favorite=True,
        ),
        Task(
            project_id=project.id,
            creator_id=leader.id,
            primary_assignee_id=maya.id,
            title="Проверить сроки подачи",
            description="Сверить сроки подачи по выбранным университетам.",
            status=TaskStatus.NEW,
            priority=TaskPriority.MEDIUM,
            due_at=now + timedelta(days=3),
        ),
        Task(
            project_id=project.id,
            creator_id=leader.id,
            primary_assignee_id=olesya.id,
            title="Получить подтверждение оплаты",
            description="Запросить квитанцию у клиента.",
            status=TaskStatus.WAITING,
            waiting_reason="Ожидаем подтверждение оплаты от клиента",
            priority=TaskPriority.CRITICAL,
            due_at=now - timedelta(days=1),
        ),
    ]
    session.add_all(tasks)
    await session.flush()

    session.add_all(
        [
            ChecklistItem(task_id=tasks[0].id, title="Проверить паспорт", is_done=True, position=1),
            ChecklistItem(task_id=tasks[0].id, title="Проверить аттестат", is_done=True, position=2),
            ChecklistItem(task_id=tasks[0].id, title="Сделать перевод", position=3),
            ChecklistItem(task_id=tasks[0].id, title="Подготовить заявление", position=4),
            TaskNote(
                task_id=tasks[0].id,
                author_id=olesya.id,
                body="Получила паспорт и аттестат, ожидаю перевод.",
            ),
            Comment(
                task_id=tasks[0].id,
                author_id=leader.id,
                body="Пожалуйста, дополнительно проверь сроки подачи.",
            ),
            ActivityLog(
                task_id=tasks[0].id,
                actor_id=leader.id,
                action="task.created",
                details={"assignee_id": olesya.id},
            ),
            Notification(
                user_id=olesya.id,
                task_id=tasks[0].id,
                kind=NotificationKind.ASSIGNED,
                title="Назначена новая задача",
                body=tasks[0].title,
            ),
        ]
    )
    await session.commit()


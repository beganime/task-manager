from datetime import timedelta

from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.enums import NotificationKind, TaskPriority, TaskStatus, UserRole
from app.models import (
    ActivityLog,
    ChecklistItem,
    Comment,
    Event,
    Notification,
    Project,
    ProjectMember,
    Routine,
    RoutineCheckin,
    Task,
    TaskFavorite,
    TaskNote,
    User,
    utcnow,
)
from app.security import hash_password
from app.services.onboarding import create_personal_space, default_routines
from app.services.timeutils import local_today

DEMO_PASSWORD = "demo12345"
DEMO_TIMEZONE = "Europe/Moscow"
PERSONAL_DEMO_EMAIL = "mira@elite-task.ru"


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
        # Старая локальная БД: дозаливаем демо-данные v2 (ритуал, события, личный аккаунт).
        if await session.scalar(select(User.id).where(User.email == PERSONAL_DEMO_EMAIL)) is None:
            await seed_v2_extras(session)
        return

    users = [
        User(
            email="leader@elite-task.ru",
            full_name="Алишер Ахмедов",
            password_hash=hash_password(DEMO_PASSWORD),
            role=UserRole.LEADER,
            timezone=DEMO_TIMEZONE,
        ),
        User(
            email="admin@elite-task.ru",
            full_name="Администратор Elite",
            password_hash=hash_password(DEMO_PASSWORD),
            role=UserRole.ADMIN,
            timezone=DEMO_TIMEZONE,
        ),
        User(
            email="olesya@elite-task.ru",
            full_name="Олеся Иванова",
            password_hash=hash_password(DEMO_PASSWORD),
            role=UserRole.MANAGER,
            timezone=DEMO_TIMEZONE,
            reminder_time="07:30",
            reminder_enabled=True,
        ),
        User(
            email="maya@elite-task.ru",
            full_name="Мая Каримова",
            password_hash=hash_password(DEMO_PASSWORD),
            role=UserRole.MANAGER,
            timezone=DEMO_TIMEZONE,
        ),
    ]
    session.add_all(users)
    await session.flush()
    leader, admin, olesya, maya = users

    project = Project(
        name="Поступление студентов 2027/2028",
        description="Подготовка и подача документов студентов в университеты.",
        owner_id=leader.id,
        color="#2F7D5B",
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
            estimate_minutes=120,
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
            TaskFavorite(task_id=tasks[0].id, user_id=olesya.id),
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
            Event(
                owner_id=leader.id,
                project_id=project.id,
                title="Планёрка по поступлению",
                description="Статус документов по каждому студенту.",
                starts_at=now + timedelta(days=2),
                all_day=False,
                color="#2F7D5B",
            ),
        ]
    )
    await session.commit()
    await seed_v2_extras(session)


async def seed_v2_extras(session: AsyncSession) -> None:
    """Утренний ритуал для Олеси и личный демо-аккаунт «Мира»."""
    olesya = await session.scalar(select(User).where(User.email == "olesya@elite-task.ru"))
    if olesya is not None:
        has_routines = await session.scalar(
            select(Routine.id).where(Routine.user_id == olesya.id).limit(1)
        )
        if has_routines is None:
            session.add_all(default_routines(olesya))
            await session.flush()

    mira = User(
        email=PERSONAL_DEMO_EMAIL,
        full_name="Мира Соколова",
        password_hash=hash_password(DEMO_PASSWORD),
        role=UserRole.PERSONAL,
        timezone=DEMO_TIMEZONE,
        reminder_time="07:00",
        reminder_enabled=True,
    )
    session.add(mira)
    await session.flush()
    personal = await create_personal_space(session, mira)
    routines = default_routines(mira)
    session.add_all(routines)
    await session.flush()

    # Серия 3 дня: отмечены три предыдущих дня.
    today = local_today(mira)
    for offset in (1, 2, 3):
        for routine in routines[:3]:
            session.add(
                RoutineCheckin(
                    routine_id=routine.id, user_id=mira.id, day=today - timedelta(days=offset)
                )
            )

    now = utcnow()
    session.add_all(
        [
            Task(
                project_id=personal.id,
                creator_id=mira.id,
                primary_assignee_id=mira.id,
                title="Записаться на курс английского",
                description="Сравнить три школы и выбрать удобное расписание.",
                status=TaskStatus.NEW,
                priority=TaskPriority.MEDIUM,
                due_at=now + timedelta(days=2),
                estimate_minutes=45,
            ),
            Task(
                project_id=personal.id,
                creator_id=mira.id,
                primary_assignee_id=mira.id,
                title="Оплатить коммунальные услуги",
                status=TaskStatus.NEW,
                priority=TaskPriority.HIGH,
                due_at=now + timedelta(hours=6),
                estimate_minutes=15,
            ),
            Event(
                owner_id=mira.id,
                title="День рождения мамы",
                description="Купить цветы и торт.",
                starts_at=now + timedelta(days=5),
                all_day=True,
                color="#F07A2B",
            ),
        ]
    )
    await session.commit()

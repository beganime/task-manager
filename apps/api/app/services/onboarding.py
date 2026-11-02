"""Стартовый набор для нового пользователя: личный проект и утренний ритуал."""

from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Project, ProjectMember, Routine, User

DEFAULT_ROUTINES: tuple[tuple[str, str, str, int], ...] = (
    ("Стакан воды", "droplet", "#4FA3D9", 2),
    ("Зарядка", "activity", "#F07A2B", 10),
    ("Медитация", "wind", "#8C7AE6", 5),
    ("План на день", "edit-3", "#2F7D5B", 5),
)


async def create_personal_space(session: AsyncSession, user: User) -> Project:
    project = Project(
        name="Личные дела",
        description="Ваши личные цели и небольшие проекты. Видите их только вы.",
        owner_id=user.id,
        is_personal=True,
        color="#F07A2B",
    )
    session.add(project)
    await session.flush()
    session.add(ProjectMember(project_id=project.id, user_id=user.id))
    return project


def default_routines(user: User) -> list[Routine]:
    return [
        Routine(
            user_id=user.id,
            title=title,
            icon=icon,
            color=color,
            duration_minutes=minutes,
            position=index,
        )
        for index, (title, icon, color, minutes) in enumerate(DEFAULT_ROUTINES)
    ]

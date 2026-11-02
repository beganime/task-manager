from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import get_session
from app.dependencies import get_current_user
from app.enums import CORPORATE_ROLES
from app.models import ProjectMember, User
from app.schemas import UserOut
from app.services.access import is_company_manager
from app.services.serializers import user_out

router = APIRouter(prefix="/users", tags=["users"])


def visible_users_statement(viewer: User):
    """Кого пользователь может видеть в справочнике.

    * leader/admin — все активные сотрудники компании (личные аккаунты скрыты);
    * manager — коллеги по общим проектам;
    * personal — участники своих личных проектов.
    Email раскрывается только leader/admin (см. `user_out`).
    """
    statement = select(User).where(User.is_active.is_(True))
    if is_company_manager(viewer):
        return statement.where(User.role.in_(CORPORATE_ROLES))
    my_projects = select(ProjectMember.project_id).where(ProjectMember.user_id == viewer.id)
    colleagues = select(ProjectMember.user_id).where(ProjectMember.project_id.in_(my_projects))
    return statement.where(User.id.in_(colleagues) | (User.id == viewer.id))


@router.get("", response_model=list[UserOut])
async def list_users(
    viewer: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> list[UserOut]:
    users = list(await session.scalars(visible_users_statement(viewer).order_by(User.full_name)))
    return [user_out(user, viewer) for user in users]

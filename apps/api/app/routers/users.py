from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import get_session
from app.dependencies import get_current_user
from app.models import User
from app.schemas import UserOut


router = APIRouter(prefix="/users", tags=["users"])


@router.get("", response_model=list[UserOut])
async def list_users(
    _: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> list[UserOut]:
    users = list(
        await session.scalars(
            select(User).where(User.is_active.is_(True)).order_by(User.full_name)
        )
    )
    return [UserOut.model_validate(user) for user in users]


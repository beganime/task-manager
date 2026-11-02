import jwt
from fastapi import APIRouter, Depends, HTTPException, Query, WebSocket, WebSocketDisconnect
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import SessionLocal, get_session
from app.dependencies import get_current_user
from app.models import Notification, User
from app.realtime import manager
from app.schemas import NotificationOut
from app.security import decode_token

router = APIRouter(prefix="/notifications", tags=["notifications"])


@router.get("", response_model=list[NotificationOut])
async def list_notifications(
    unread_only: bool = False,
    limit: int = Query(default=100, ge=1, le=200),
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> list[NotificationOut]:
    statement = select(Notification).where(Notification.user_id == user.id)
    if unread_only:
        statement = statement.where(Notification.is_read.is_(False))
    items = list(
        await session.scalars(statement.order_by(Notification.created_at.desc()).limit(limit))
    )
    return [NotificationOut.model_validate(item) for item in items]


@router.post("/{notification_id}/read", response_model=NotificationOut)
async def mark_read(
    notification_id: int,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> NotificationOut:
    notification = await session.scalar(
        select(Notification).where(
            Notification.id == notification_id,
            Notification.user_id == user.id,
        )
    )
    if not notification:
        raise HTTPException(status_code=404, detail="Уведомление не найдено")
    notification.is_read = True
    await session.commit()
    await session.refresh(notification)
    return NotificationOut.model_validate(notification)


@router.post("/read-all", status_code=204)
async def mark_all_read(
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> None:
    await session.execute(
        update(Notification)
        .where(Notification.user_id == user.id, Notification.is_read.is_(False))
        .values(is_read=True)
    )
    await session.commit()


@router.websocket("/ws")
async def notifications_websocket(websocket: WebSocket, ticket: str | None = None) -> None:
    """Подключение по короткоживущему билету из `POST /auth/ws-ticket`.

    Долгоживущий access-токен в query больше не принимается.
    """
    if not ticket:
        await websocket.close(code=4401)
        return
    try:
        payload = decode_token(ticket, expected_type="ws")
    except (jwt.InvalidTokenError, ValueError, KeyError):
        await websocket.close(code=4401)
        return
    async with SessionLocal() as session:
        user = await session.get(User, payload.user_id)
        if not user or not user.is_active or user.token_version != payload.token_version:
            await websocket.close(code=4401)
            return
    await manager.connect(payload.user_id, websocket)
    try:
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        pass
    finally:
        manager.disconnect(payload.user_id, websocket)

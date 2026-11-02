from sqlalchemy.ext.asyncio import AsyncSession

from app.enums import NotificationKind
from app.models import Notification
from app.realtime import manager


async def create_notification(
    session: AsyncSession,
    user_id: int,
    kind: NotificationKind,
    title: str,
    body: str = "",
    task_id: int | None = None,
) -> Notification:
    notification = Notification(
        user_id=user_id,
        task_id=task_id,
        kind=kind,
        title=title,
        body=body,
    )
    session.add(notification)
    await session.flush()
    await manager.send(
        user_id,
        {
            "event": "notification.created",
            "data": {
                "id": notification.id,
                "task_id": task_id,
                "kind": kind.value,
                "title": title,
                "body": body,
                "is_read": False,
                "created_at": notification.created_at.isoformat(),
            },
        },
    )
    return notification


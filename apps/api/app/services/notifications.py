"""Уведомления.

Раньше событие уходило в WebSocket до `commit`: если транзакция падала,
клиент получал уведомление, которого нет в БД. Теперь уведомления
копятся в `session.info` и рассылаются только после успешного commit
через `dispatch_pending_notifications`.
"""

from sqlalchemy.ext.asyncio import AsyncSession

from app.enums import NotificationKind
from app.models import Notification
from app.realtime import manager

_PENDING_KEY = "pending_notifications"


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
    pending: list[Notification] = session.info.setdefault(_PENDING_KEY, [])
    pending.append(notification)
    return notification


def discard_pending_notifications(session: AsyncSession) -> None:
    session.info.pop(_PENDING_KEY, None)


async def dispatch_pending_notifications(session: AsyncSession) -> None:
    """Вызывать строго после успешного `session.commit()`."""
    pending: list[Notification] = session.info.pop(_PENDING_KEY, [])
    for notification in pending:
        if notification.id is None:
            continue
        await manager.send(
            notification.user_id,
            {
                "event": "notification.created",
                "data": {
                    "id": notification.id,
                    "task_id": notification.task_id,
                    "kind": notification.kind.value,
                    "title": notification.title,
                    "body": notification.body,
                    "is_read": False,
                    "created_at": notification.created_at.isoformat(),
                },
            },
        )


async def commit_and_notify(session: AsyncSession) -> None:
    try:
        await session.commit()
    except Exception:
        discard_pending_notifications(session)
        raise
    await dispatch_pending_notifications(session)

import logging
from collections import defaultdict
from typing import Any

from fastapi import WebSocket

logger = logging.getLogger("elite_task.realtime")


class ConnectionManager:
    def __init__(self) -> None:
        self.connections: dict[int, set[WebSocket]] = defaultdict(set)

    async def connect(self, user_id: int, websocket: WebSocket) -> None:
        await websocket.accept()
        self.connections[user_id].add(websocket)

    def disconnect(self, user_id: int, websocket: WebSocket) -> None:
        sockets = self.connections.get(user_id)
        if sockets is None:
            return
        sockets.discard(websocket)
        if not sockets:
            self.connections.pop(user_id, None)

    async def send(self, user_id: int, payload: dict[str, Any]) -> None:
        stale: list[WebSocket] = []
        for websocket in list(self.connections.get(user_id, set())):
            try:
                await websocket.send_json(payload)
            except Exception:  # noqa: BLE001 — сокет мог закрыться любым способом
                logger.debug("Удаляем закрытое WebSocket-подключение пользователя %s", user_id)
                stale.append(websocket)
        for websocket in stale:
            self.disconnect(user_id, websocket)

    async def close_user(self, user_id: int, code: int = 4401) -> None:
        for websocket in list(self.connections.get(user_id, set())):
            try:
                await websocket.close(code=code)
            except Exception:  # noqa: BLE001
                pass
            self.disconnect(user_id, websocket)


manager = ConnectionManager()

import hashlib
import hmac
import secrets
import time
from collections import defaultdict, deque
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from typing import Any

import jwt

from app.config import get_settings

ALGORITHM = "HS256"
PBKDF2_ITERATIONS = 310_000


def hash_password(password: str) -> str:
    salt = secrets.token_bytes(16)
    digest = hashlib.pbkdf2_hmac("sha256", password.encode(), salt, PBKDF2_ITERATIONS)
    return f"pbkdf2_sha256${PBKDF2_ITERATIONS}${salt.hex()}${digest.hex()}"


# Хеш-заглушка: проверяется, когда пользователя нет, чтобы время ответа
# не выдавало существование email (защита от перебора аккаунтов).
_DUMMY_HASH = hash_password(secrets.token_urlsafe(16))


def verify_password(password: str, encoded: str) -> bool:
    try:
        algorithm, raw_iterations, salt_hex, digest_hex = encoded.split("$", 3)
        if algorithm != "pbkdf2_sha256":
            return False
        digest = hashlib.pbkdf2_hmac(
            "sha256", password.encode(), bytes.fromhex(salt_hex), int(raw_iterations)
        )
        return hmac.compare_digest(digest.hex(), digest_hex)
    except (ValueError, TypeError):
        return False


def burn_password_check(password: str) -> None:
    verify_password(password, _DUMMY_HASH)


@dataclass(frozen=True)
class TokenPayload:
    user_id: int
    token_version: int
    token_type: str


def _encode(user_id: int, token_version: int, token_type: str, lifetime: timedelta) -> str:
    settings = get_settings()
    now = datetime.now(UTC)
    payload: dict[str, Any] = {
        "sub": str(user_id),
        "ver": token_version,
        "type": token_type,
        "iat": now,
        "exp": now + lifetime,
        "jti": secrets.token_hex(8),
    }
    return jwt.encode(payload, settings.jwt_secret, algorithm=ALGORITHM)


def create_access_token(user_id: int, token_version: int = 0) -> str:
    settings = get_settings()
    return _encode(
        user_id, token_version, "access", timedelta(minutes=settings.jwt_expire_minutes)
    )


def create_ws_ticket(user_id: int, token_version: int = 0) -> str:
    settings = get_settings()
    return _encode(
        user_id, token_version, "ws", timedelta(seconds=settings.ws_ticket_expire_seconds)
    )


def decode_token(token: str, expected_type: str = "access") -> TokenPayload:
    settings = get_settings()
    payload = jwt.decode(
        token,
        settings.jwt_secret,
        algorithms=[ALGORITHM],
        options={"require": ["exp", "sub", "type"]},
    )
    if payload.get("type") != expected_type:
        raise jwt.InvalidTokenError("Invalid token type")
    return TokenPayload(
        user_id=int(payload["sub"]),
        token_version=int(payload.get("ver", 0)),
        token_type=str(payload["type"]),
    )


def decode_access_token(token: str) -> int:
    """Обратная совместимость со старым API модуля."""
    return decode_token(token).user_id


class RateLimiter:
    """Простое ограничение попыток в памяти процесса (скользящее окно).

    Для нескольких воркеров в production замените на Redis.
    """

    def __init__(self) -> None:
        self._hits: dict[str, deque[float]] = defaultdict(deque)

    def _prune(self, key: str, window: float, now: float) -> deque[float]:
        hits = self._hits[key]
        while hits and now - hits[0] > window:
            hits.popleft()
        if not hits:
            self._hits.pop(key, None)
            hits = self._hits[key]
        return hits

    def is_blocked(self, key: str, limit: int, window: float) -> int:
        """Возвращает количество секунд до разблокировки или 0."""
        now = time.monotonic()
        hits = self._prune(key, window, now)
        if len(hits) >= limit:
            return max(1, int(window - (now - hits[0])))
        return 0

    def hit(self, key: str) -> None:
        self._hits[key].append(time.monotonic())

    def reset(self, key: str) -> None:
        self._hits.pop(key, None)

    def clear(self) -> None:
        self._hits.clear()


login_limiter = RateLimiter()

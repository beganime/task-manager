from fastapi import APIRouter, Depends, HTTPException, Request, Response
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.db import get_session
from app.dependencies import get_current_user
from app.enums import UserRole
from app.models import User
from app.realtime import manager
from app.schemas import (
    ChangePasswordRequest,
    LoginRequest,
    MeOut,
    MeUpdate,
    RegisterRequest,
    TokenResponse,
    WsTicketOut,
)
from app.security import (
    burn_password_check,
    create_access_token,
    create_ws_ticket,
    hash_password,
    login_limiter,
    verify_password,
)
from app.services.onboarding import create_personal_space, default_routines
from app.services.serializers import me_out
from app.services.timeutils import is_valid_timezone

router = APIRouter(prefix="/auth", tags=["auth"])


def _client_ip(request: Request) -> str:
    return request.client.host if request.client else "unknown"


def _check_rate_limit(keys: list[tuple[str, int]]) -> None:
    settings = get_settings()
    for key, limit in keys:
        retry_after = login_limiter.is_blocked(key, limit, settings.login_window_seconds)
        if retry_after:
            raise HTTPException(
                status_code=429,
                detail="Слишком много попыток. Попробуйте позже",
                headers={"Retry-After": str(retry_after)},
            )


def _token_response(user: User) -> TokenResponse:
    return TokenResponse(
        access_token=create_access_token(user.id, user.token_version),
        user=me_out(user),
    )


@router.post("/login", response_model=TokenResponse)
async def login(
    payload: LoginRequest,
    request: Request,
    session: AsyncSession = Depends(get_session),
) -> TokenResponse:
    settings = get_settings()
    email = payload.email.lower()
    ip = _client_ip(request)
    account_key = f"login:{ip}:{email}"
    ip_key = f"login-ip:{ip}"
    _check_rate_limit(
        [(account_key, settings.login_max_attempts), (ip_key, settings.login_max_attempts * 6)]
    )

    user = await session.scalar(select(User).where(func.lower(User.email) == email))
    if user is None:
        burn_password_check(payload.password)
        valid = False
    else:
        valid = verify_password(payload.password, user.password_hash) and user.is_active
    if not valid or user is None:
        login_limiter.hit(account_key)
        login_limiter.hit(ip_key)
        raise HTTPException(status_code=401, detail="Неверная почта или пароль")

    login_limiter.reset(account_key)
    if payload.timezone and is_valid_timezone(payload.timezone) and payload.timezone != user.timezone:
        user.timezone = payload.timezone
        await session.commit()
        await session.refresh(user)
    return _token_response(user)


@router.post("/register", response_model=TokenResponse, status_code=201)
async def register(
    payload: RegisterRequest,
    request: Request,
    session: AsyncSession = Depends(get_session),
) -> TokenResponse:
    """Регистрация личного аккаунта (роль `personal`).

    Корпоративные аккаунты создаёт администратор — роль здесь выбрать нельзя.
    """
    settings = get_settings()
    if not settings.allow_registration:
        raise HTTPException(status_code=403, detail="Регистрация отключена")
    ip_key = f"register-ip:{_client_ip(request)}"
    _check_rate_limit([(ip_key, settings.login_max_attempts * 2)])
    login_limiter.hit(ip_key)

    email = payload.email.lower()
    exists = await session.scalar(select(User.id).where(func.lower(User.email) == email))
    if exists is not None:
        raise HTTPException(status_code=409, detail="Пользователь с такой почтой уже существует")

    timezone_name = (
        payload.timezone if payload.timezone and is_valid_timezone(payload.timezone) else "UTC"
    )
    user = User(
        email=email,
        full_name=payload.full_name,
        password_hash=hash_password(payload.password),
        role=UserRole.PERSONAL,
        timezone=timezone_name,
        reminder_time="07:00",
        reminder_enabled=False,
    )
    session.add(user)
    await session.flush()
    await create_personal_space(session, user)
    session.add_all(default_routines(user))
    await session.commit()
    await session.refresh(user)
    return _token_response(user)


@router.get("/me", response_model=MeOut)
async def me(user: User = Depends(get_current_user)) -> MeOut:
    return me_out(user)


@router.patch("/me", response_model=MeOut)
async def update_me(
    payload: MeUpdate,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> MeOut:
    fields = payload.model_fields_set
    if "timezone" in fields and payload.timezone is not None:
        if not is_valid_timezone(payload.timezone):
            raise HTTPException(status_code=422, detail="Неизвестный часовой пояс")
        user.timezone = payload.timezone
    if "full_name" in fields and payload.full_name is not None:
        user.full_name = payload.full_name.strip()
    if "reminder_time" in fields:
        user.reminder_time = payload.reminder_time
    if "reminder_enabled" in fields and payload.reminder_enabled is not None:
        if payload.reminder_enabled and not (payload.reminder_time or user.reminder_time):
            raise HTTPException(status_code=422, detail="Укажите время напоминания")
        user.reminder_enabled = payload.reminder_enabled
    if "workday_minutes" in fields and payload.workday_minutes is not None:
        user.workday_minutes = payload.workday_minutes
    await session.commit()
    await session.refresh(user)
    return me_out(user)


@router.post("/change-password", response_model=TokenResponse)
async def change_password(
    payload: ChangePasswordRequest,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> TokenResponse:
    if not verify_password(payload.current_password, user.password_hash):
        raise HTTPException(status_code=422, detail="Текущий пароль указан неверно")
    user.password_hash = hash_password(payload.new_password)
    user.token_version += 1
    await session.commit()
    await session.refresh(user)
    await manager.close_user(user.id)
    return _token_response(user)


@router.post("/logout-all", status_code=204)
async def logout_all(
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> Response:
    user.token_version += 1
    await session.commit()
    await manager.close_user(user.id)
    return Response(status_code=204)


@router.post("/ws-ticket", response_model=WsTicketOut)
async def ws_ticket(user: User = Depends(get_current_user)) -> WsTicketOut:
    """Короткоживущий билет для WebSocket.

    Долгоживущий JWT больше не передаётся в query-строке (она попадает
    в логи прокси и историю браузера).
    """
    settings = get_settings()
    return WsTicketOut(
        ticket=create_ws_ticket(user.id, user.token_version),
        expires_in=settings.ws_ticket_expire_seconds,
    )

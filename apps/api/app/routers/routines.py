from datetime import date, timedelta

from fastapi import APIRouter, Depends, HTTPException, Query, Response
from sqlalchemy import delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import get_session
from app.dependencies import get_current_user
from app.models import Routine, RoutineCheckin, User
from app.schemas import (
    CheckinRequest,
    RitualOut,
    RoutineCreate,
    RoutineDay,
    RoutineOut,
    RoutineUpdate,
)
from app.services.ritual import (
    HISTORY_DAYS,
    active_routines,
    best_streak,
    checkins_since,
    current_streak,
)
from app.services.timeutils import local_today

router = APIRouter(prefix="/routines", tags=["routines"])

MAX_ROUTINES = 20
# Отметить можно сегодня и до 7 дней назад (забыл нажать), но не будущее.
BACKFILL_DAYS = 7


async def build_ritual(session: AsyncSession, user: User, day: date | None = None) -> RitualOut:
    today = local_today(user)
    target = day or today
    routines = await active_routines(session, user)
    history = await checkins_since(session, user, today - timedelta(days=HISTORY_DAYS))
    all_days: set[date] = set().union(*history.values()) if history else set()

    items = [
        RoutineOut(
            id=routine.id,
            title=routine.title,
            icon=routine.icon,
            color=routine.color,
            duration_minutes=routine.duration_minutes,
            position=routine.position,
            done=target in history.get(routine.id, set()),
            streak=current_streak(history.get(routine.id, set()), today),
        )
        for routine in routines
    ]
    active_ids = {routine.id for routine in routines}
    monday = target - timedelta(days=target.weekday())
    week = []
    for offset in range(7):
        current = monday + timedelta(days=offset)
        done = sum(1 for routine_id in active_ids if current in history.get(routine_id, set()))
        week.append(RoutineDay(day=current, done=done, total=len(active_ids)))

    return RitualOut(
        day=target,
        timezone=user.timezone,
        routines=items,
        total_minutes=sum(item.duration_minutes for item in items),
        done_minutes=sum(item.duration_minutes for item in items if item.done),
        streak=current_streak(all_days, today),
        best_streak=best_streak(all_days),
        week=week,
        reminder_time=user.reminder_time,
        reminder_enabled=user.reminder_enabled,
    )


async def get_own_routine(session: AsyncSession, user: User, routine_id: int) -> Routine:
    routine = await session.get(Routine, routine_id)
    # Чужие рутины не раскрываем: 404 вместо 403.
    if routine is None or routine.user_id != user.id or not routine.is_active:
        raise HTTPException(status_code=404, detail="Привычка не найдена")
    return routine


def validate_checkin_day(user: User, day: date | None) -> date:
    today = local_today(user)
    target = day or today
    if target > today:
        raise HTTPException(status_code=422, detail="Нельзя отметить привычку в будущем")
    if target < today - timedelta(days=BACKFILL_DAYS):
        raise HTTPException(
            status_code=422, detail=f"Отметить можно не раньше чем за {BACKFILL_DAYS} дней"
        )
    return target


@router.get("", response_model=RitualOut)
async def get_ritual(
    day: date | None = Query(default=None),
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> RitualOut:
    return await build_ritual(session, user, day)


@router.post("", response_model=RoutineOut, status_code=201)
async def create_routine(
    payload: RoutineCreate,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> RoutineOut:
    count = await session.scalar(
        select(func.count(Routine.id)).where(Routine.user_id == user.id, Routine.is_active.is_(True))
    )
    if int(count or 0) >= MAX_ROUTINES:
        raise HTTPException(status_code=422, detail=f"Не больше {MAX_ROUTINES} привычек")
    position = payload.position
    if position is None:
        last = await session.scalar(
            select(func.max(Routine.position)).where(Routine.user_id == user.id)
        )
        position = int(last if last is not None else -1) + 1
    routine = Routine(
        user_id=user.id,
        title=payload.title,
        icon=payload.icon,
        color=payload.color,
        duration_minutes=payload.duration_minutes,
        position=position,
    )
    session.add(routine)
    await session.commit()
    await session.refresh(routine)
    return RoutineOut(
        id=routine.id,
        title=routine.title,
        icon=routine.icon,
        color=routine.color,
        duration_minutes=routine.duration_minutes,
        position=routine.position,
        done=False,
        streak=0,
    )


@router.patch("/{routine_id}", response_model=RitualOut)
async def update_routine(
    routine_id: int,
    payload: RoutineUpdate,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> RitualOut:
    routine = await get_own_routine(session, user, routine_id)
    for field in payload.model_fields_set:
        setattr(routine, field, getattr(payload, field))
    await session.commit()
    return await build_ritual(session, user)


@router.delete("/{routine_id}", status_code=204)
async def delete_routine(
    routine_id: int,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> Response:
    routine = await get_own_routine(session, user, routine_id)
    # Мягкое удаление: история отметок сохраняется для лучшей серии.
    routine.is_active = False
    await session.commit()
    return Response(status_code=204)


@router.post("/{routine_id}/check", response_model=RitualOut)
async def check_routine(
    routine_id: int,
    payload: CheckinRequest | None = None,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> RitualOut:
    routine = await get_own_routine(session, user, routine_id)
    target = validate_checkin_day(user, payload.day if payload else None)
    exists = await session.scalar(
        select(RoutineCheckin.id).where(
            RoutineCheckin.routine_id == routine.id, RoutineCheckin.day == target
        )
    )
    if exists is None:  # идемпотентно: повторная отметка не создаёт дубль
        session.add(RoutineCheckin(routine_id=routine.id, user_id=user.id, day=target))
        await session.commit()
    return await build_ritual(session, user, target)


@router.delete("/{routine_id}/check", response_model=RitualOut)
async def uncheck_routine(
    routine_id: int,
    day: date | None = Query(default=None),
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> RitualOut:
    routine = await get_own_routine(session, user, routine_id)
    target = validate_checkin_day(user, day)
    await session.execute(
        delete(RoutineCheckin).where(
            RoutineCheckin.routine_id == routine.id, RoutineCheckin.day == target
        )
    )
    await session.commit()
    return await build_ritual(session, user, target)

"""Утренний ритуал: серии (streak) считаются только на сервере.

День засчитывается в серию, если в этот локальный день пользователя есть
хотя бы одна отметка. Серия не обрывается, пока «сегодня» не закончилось:
если сегодня ещё нет отметок, счёт идёт от вчерашнего дня.
"""

from collections import defaultdict
from collections.abc import Iterable
from datetime import date, timedelta

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Routine, RoutineCheckin, User

HISTORY_DAYS = 400


def current_streak(days: Iterable[date], today: date) -> int:
    marked = set(days)
    cursor = today if today in marked else today - timedelta(days=1)
    streak = 0
    while cursor in marked:
        streak += 1
        cursor -= timedelta(days=1)
    return streak


def best_streak(days: Iterable[date]) -> int:
    ordered = sorted(set(days))
    best = run = 0
    previous: date | None = None
    for day in ordered:
        run = run + 1 if previous is not None and day - previous == timedelta(days=1) else 1
        best = max(best, run)
        previous = day
    return best


async def active_routines(session: AsyncSession, user: User) -> list[Routine]:
    return list(
        await session.scalars(
            select(Routine)
            .where(Routine.user_id == user.id, Routine.is_active.is_(True))
            .order_by(Routine.position, Routine.id)
        )
    )


async def checkins_since(
    session: AsyncSession, user: User, since: date
) -> dict[int, set[date]]:
    rows = await session.execute(
        select(RoutineCheckin.routine_id, RoutineCheckin.day).where(
            RoutineCheckin.user_id == user.id, RoutineCheckin.day >= since
        )
    )
    result: dict[int, set[date]] = defaultdict(set)
    for routine_id, day in rows:
        result[routine_id].add(day)
    return result


async def ritual_minutes(session: AsyncSession, user: User) -> int:
    return sum(routine.duration_minutes for routine in await active_routines(session, user))

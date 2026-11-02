"""Работа с часовым поясом пользователя.

Все даты в БД хранятся в UTC. «Сегодня», «эта неделя», серии ритуала и
календарь считаются в IANA-поясе пользователя (User.timezone), который
мобильное приложение передаёт автоматически.
"""

from datetime import UTC, date, datetime, time, timedelta
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError, available_timezones

from app.models import User


def is_valid_timezone(name: str) -> bool:
    if not name or len(name) > 64:
        return False
    if name == "UTC":
        return True
    try:
        ZoneInfo(name)
    except (ZoneInfoNotFoundError, ValueError):
        return False
    return name in available_timezones() or "/" in name


def user_zone(user: User) -> ZoneInfo:
    try:
        return ZoneInfo(user.timezone or "UTC")
    except (ZoneInfoNotFoundError, ValueError):
        return ZoneInfo("UTC")


def local_now(user: User) -> datetime:
    return datetime.now(UTC).astimezone(user_zone(user))


def local_today(user: User) -> date:
    return local_now(user).date()


def day_start_utc(user: User, day: date) -> datetime:
    """Начало локального дня пользователя, выраженное в UTC."""
    return datetime.combine(day, time.min, tzinfo=user_zone(user)).astimezone(UTC)


def day_bounds(user: User, day: date) -> tuple[datetime, datetime]:
    return day_start_utc(user, day), day_start_utc(user, day + timedelta(days=1))


def local_date_of(user: User, moment: datetime) -> date:
    if moment.tzinfo is None:
        moment = moment.replace(tzinfo=UTC)
    return moment.astimezone(user_zone(user)).date()


def week_start(day: date) -> date:
    return day - timedelta(days=day.weekday())

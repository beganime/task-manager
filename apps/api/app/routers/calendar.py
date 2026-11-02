from datetime import date, timedelta

from fastapi import APIRouter, Depends, HTTPException, Query, Response
from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.db import get_session
from app.dependencies import get_current_user
from app.enums import DateCalcMode, NotificationKind, TaskStatus
from app.models import Event, Project, ProjectMember, Task, TaskCollaborator, User
from app.schemas import (
    CalendarItem,
    CalendarOut,
    DateCalcOut,
    DateCalcRequest,
    EventCreate,
    EventOut,
    EventUpdate,
)
from app.services.access import (
    ensure_project_access,
    ensure_project_writable,
    ensure_task_access,
    is_company_manager,
    is_project_member,
    task_visibility_clause,
)
from app.services.notifications import commit_and_notify, create_notification
from app.services.timeutils import day_bounds, local_date_of, local_today

router = APIRouter(prefix="/calendar", tags=["calendar"])

MAX_RANGE_DAYS = 366
MAX_EVENT_SPAN_DAYS = 62
PRIORITY_COLORS = {
    "critical": "#D9534F",
    "high": "#F07A2B",
    "medium": "#E0A82E",
    "low": "#7A8B99",
}


# ---------------------------------------------------------------------------
# Калькулятор дат
# ---------------------------------------------------------------------------


def is_business_day(day: date) -> bool:
    return day.weekday() < 5


def add_days(start: date, days: int, mode: DateCalcMode) -> date:
    if mode == DateCalcMode.CALENDAR:
        return start + timedelta(days=days)
    step = 1 if days >= 0 else -1
    remaining = abs(days)
    current = start
    while remaining:
        current += timedelta(days=step)
        if is_business_day(current):
            remaining -= 1
    return current


def business_days_between(start: date, end: date) -> int:
    """Рабочие дни в (start; end] со знаком: сколько рабочих дней «прошагали»."""
    if start == end:
        return 0
    step = 1 if end > start else -1
    total = 0
    current = start
    while current != end:
        current += timedelta(days=step)
        if is_business_day(current):
            total += 1
    return total * step


@router.post("/calculate", response_model=DateCalcOut)
async def calculate(
    payload: DateCalcRequest,
    user: User = Depends(get_current_user),
) -> DateCalcOut:
    start = payload.start_date or local_today(user)
    try:
        result = add_days(start, payload.days, payload.mode)
    except OverflowError:
        raise HTTPException(status_code=422, detail="Дата выходит за допустимый диапазон") from None
    return DateCalcOut(
        start_date=start,
        result_date=result,
        days=payload.days,
        mode=payload.mode,
        weekday=result.isoweekday(),
        calendar_days=(result - start).days,
        business_days=business_days_between(start, result),
        timezone=user.timezone,
    )


# ---------------------------------------------------------------------------
# События
# ---------------------------------------------------------------------------


def visible_events_clause(user: User):
    """Личные события + события проектов, где пользователь — участник."""
    member_of = select(ProjectMember.project_id).where(ProjectMember.user_id == user.id)
    return or_(Event.owner_id == user.id, Event.project_id.in_(member_of))


async def can_edit_event(session: AsyncSession, user: User, event: Event) -> bool:
    if event.owner_id == user.id:
        return True
    if event.project_id is None:
        return False
    project = await session.get(Project, event.project_id)
    if project is None:
        return False
    if project.owner_id == user.id:
        return True
    return not project.is_personal and is_company_manager(user)


async def event_out(session: AsyncSession, user: User, event: Event) -> EventOut:
    project_name = None
    if event.project_id is not None:
        project = await session.get(Project, event.project_id)
        project_name = project.name if project else None
    return EventOut(
        id=event.id,
        owner_id=event.owner_id,
        project_id=event.project_id,
        project_name=project_name,
        task_id=event.task_id,
        title=event.title,
        description=event.description,
        starts_at=event.starts_at,
        ends_at=event.ends_at,
        all_day=event.all_day,
        color=event.color,
        can_edit=await can_edit_event(session, user, event),
        created_at=event.created_at,
    )


async def get_visible_event(session: AsyncSession, user: User, event_id: int) -> Event:
    event = await session.scalar(
        select(Event).where(Event.id == event_id, visible_events_clause(user))
    )
    if event is None:
        raise HTTPException(status_code=404, detail="Событие не найдено")
    return event


def check_span(starts_at, ends_at) -> None:
    if ends_at is not None and (ends_at - starts_at).days > MAX_EVENT_SPAN_DAYS:
        raise HTTPException(
            status_code=422, detail=f"Событие не может длиться дольше {MAX_EVENT_SPAN_DAYS} дней"
        )
    if ends_at is not None and ends_at < starts_at:
        raise HTTPException(status_code=422, detail="Окончание раньше начала")


@router.get("", response_model=CalendarOut)
async def calendar_range(
    from_date: date = Query(alias="from"),
    to_date: date = Query(alias="to"),
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> CalendarOut:
    """События и дедлайны задач за период [from; to] в часовом поясе пользователя."""
    if to_date < from_date:
        raise HTTPException(status_code=422, detail="Дата «to» раньше «from»")
    if (to_date - from_date).days > MAX_RANGE_DAYS:
        raise HTTPException(status_code=422, detail=f"Период не больше {MAX_RANGE_DAYS} дней")
    range_start, _ = day_bounds(user, from_date)
    _, range_end = day_bounds(user, to_date)

    items: list[CalendarItem] = []
    events = list(
        await session.scalars(
            select(Event)
            .where(
                visible_events_clause(user),
                Event.starts_at < range_end,
                func.coalesce(Event.ends_at, Event.starts_at) >= range_start,
            )
            .options(selectinload(Event.project))
            .order_by(Event.starts_at)
        )
    )
    for event in events:
        first = max(local_date_of(user, event.starts_at), from_date)
        last = min(local_date_of(user, event.ends_at or event.starts_at), to_date)
        current = first
        while current <= last:
            items.append(
                CalendarItem(
                    kind="event",
                    id=event.id,
                    title=event.title,
                    day=current,
                    starts_at=event.starts_at,
                    ends_at=event.ends_at,
                    all_day=event.all_day,
                    color=event.color,
                    project_id=event.project_id,
                    project_name=event.project.name if event.project else None,
                    task_id=event.task_id,
                )
            )
            current += timedelta(days=1)

    collaborator_tasks = select(TaskCollaborator.task_id).where(
        TaskCollaborator.user_id == user.id
    )
    tasks = list(
        await session.scalars(
            select(Task)
            .join(Project, Project.id == Task.project_id)
            .where(
                task_visibility_clause(user),
                or_(
                    Task.primary_assignee_id == user.id,
                    Task.creator_id == user.id,
                    Task.id.in_(collaborator_tasks),
                ),
                Task.status != TaskStatus.CANCELLED,
                Task.due_at >= range_start,
                Task.due_at < range_end,
            )
            .options(selectinload(Task.project))
            .order_by(Task.due_at)
        )
    )
    for task in tasks:
        assert task.due_at is not None
        items.append(
            CalendarItem(
                kind="task",
                id=task.id,
                title=task.title,
                day=local_date_of(user, task.due_at),
                starts_at=task.due_at,
                ends_at=None,
                all_day=False,
                color=PRIORITY_COLORS.get(task.priority.value, "#F07A2B"),
                project_id=task.project_id,
                project_name=task.project.name,
                task_id=task.id,
                status=task.status,
                priority=task.priority,
            )
        )
    items.sort(key=lambda item: (item.day, item.kind != "event", item.starts_at))
    return CalendarOut(from_date=from_date, to_date=to_date, timezone=user.timezone, items=items)


@router.post("/events", response_model=EventOut, status_code=201)
async def create_event(
    payload: EventCreate,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> EventOut:
    check_span(payload.starts_at, payload.ends_at)
    project: Project | None = None
    if payload.project_id is not None:
        project = await ensure_project_access(session, user, payload.project_id)
        ensure_project_writable(project)
        if not await is_project_member(session, user.id, project.id):
            raise HTTPException(
                status_code=403, detail="Событие проекта может создать участник проекта"
            )
    if payload.task_id is not None:
        task, task_project = await ensure_task_access(session, user, payload.task_id)
        if project is not None and task.project_id != project.id:
            raise HTTPException(status_code=422, detail="Задача из другого проекта")
        ensure_project_writable(task_project)

    event = Event(
        owner_id=user.id,
        project_id=payload.project_id,
        task_id=payload.task_id,
        title=payload.title,
        description=payload.description,
        starts_at=payload.starts_at,
        ends_at=payload.ends_at,
        all_day=payload.all_day,
        color=payload.color or (project.color if project else "#F07A2B"),
    )
    session.add(event)
    await session.flush()
    if project is not None:
        member_ids = list(
            await session.scalars(
                select(ProjectMember.user_id).where(
                    ProjectMember.project_id == project.id, ProjectMember.user_id != user.id
                )
            )
        )
        day_label = local_date_of(user, payload.starts_at).strftime("%d.%m.%Y")
        for member_id in member_ids:
            await create_notification(
                session,
                member_id,
                NotificationKind.EVENT,
                f"Новое событие в проекте «{project.name}»",
                f"{payload.title} — {day_label}",
                payload.task_id,
            )
    await commit_and_notify(session)
    await session.refresh(event)
    return await event_out(session, user, event)


@router.get("/events/{event_id}", response_model=EventOut)
async def get_event(
    event_id: int,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> EventOut:
    event = await get_visible_event(session, user, event_id)
    return await event_out(session, user, event)


@router.patch("/events/{event_id}", response_model=EventOut)
async def update_event(
    event_id: int,
    payload: EventUpdate,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> EventOut:
    event = await get_visible_event(session, user, event_id)
    if not await can_edit_event(session, user, event):
        raise HTTPException(status_code=403, detail="Изменять событие может его автор")
    if event.project_id is not None:
        project = await session.get(Project, event.project_id)
        if project is not None:
            ensure_project_writable(project)
    for field in payload.model_fields_set:
        setattr(event, field, getattr(payload, field))
    check_span(event.starts_at, event.ends_at)
    await session.commit()
    await session.refresh(event)
    return await event_out(session, user, event)


@router.delete("/events/{event_id}", status_code=204)
async def delete_event(
    event_id: int,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
) -> Response:
    event = await get_visible_event(session, user, event_id)
    if not await can_edit_event(session, user, event):
        raise HTTPException(status_code=403, detail="Удалить событие может его автор")
    await session.delete(event)
    await session.commit()
    return Response(status_code=204)

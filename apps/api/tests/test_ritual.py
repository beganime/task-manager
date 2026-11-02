"""Утренний ритуал: привычки, отметки, серии, нагрузка дня."""

from datetime import date, timedelta

from fastapi.testclient import TestClient

from app.services.ritual import best_streak, current_streak
from tests.helpers import leader, mira, olesya, register


def test_streak_math() -> None:
    today = date(2026, 3, 10)
    days = [today - timedelta(days=i) for i in (1, 2, 3)]
    assert current_streak(days, today) == 3  # сегодня ещё не отмечено — серия жива
    assert current_streak(days + [today], today) == 4
    assert current_streak([today - timedelta(days=2)], today) == 0
    assert best_streak(days + [today - timedelta(days=10)]) == 3


def test_seeded_streak_and_check(client: TestClient) -> None:
    headers = mira(client)
    ritual = client.get("/routines", headers=headers).json()
    assert ritual["streak"] == 3
    assert ritual["total_minutes"] == 22
    first = ritual["routines"][0]
    checked = client.post(f"/routines/{first['id']}/check", headers=headers).json()
    assert checked["streak"] == 4
    assert next(r for r in checked["routines"] if r["id"] == first["id"])["done"] is True
    assert checked["done_minutes"] == first["duration_minutes"]
    # Идемпотентность.
    again = client.post(f"/routines/{first['id']}/check", headers=headers).json()
    assert again["done_minutes"] == first["duration_minutes"]
    unchecked = client.delete(f"/routines/{first['id']}/check", headers=headers).json()
    assert unchecked["streak"] == 3
    assert len(unchecked["week"]) == 7


def test_cannot_check_future_or_too_old(client: TestClient) -> None:
    headers = mira(client)
    ritual = client.get("/routines", headers=headers).json()
    routine_id = ritual["routines"][0]["id"]
    today = date.fromisoformat(ritual["day"])
    future = client.post(
        f"/routines/{routine_id}/check", headers=headers, json={"day": str(today + timedelta(days=1))}
    )
    assert future.status_code == 422
    old = client.post(
        f"/routines/{routine_id}/check", headers=headers, json={"day": str(today - timedelta(days=30))}
    )
    assert old.status_code == 422


def test_routines_are_private(client: TestClient) -> None:
    mira_routine = client.get("/routines", headers=mira(client)).json()["routines"][0]
    other = olesya(client)
    assert client.post(f"/routines/{mira_routine['id']}/check", headers=other).status_code == 404
    assert client.patch(f"/routines/{mira_routine['id']}", headers=other, json={"title": "x"}).status_code == 404
    assert client.delete(f"/routines/{mira_routine['id']}", headers=other).status_code == 404


def test_routine_crud(client: TestClient) -> None:
    headers = register(client, "crud@example.com")
    created = client.post(
        "/routines",
        headers=headers,
        json={"title": "Чтение", "icon": "book", "color": "#2F7D5B", "duration_minutes": 15},
    )
    assert created.status_code == 201
    routine_id = created.json()["id"]
    updated = client.patch(f"/routines/{routine_id}", headers=headers, json={"duration_minutes": 20})
    assert any(r["id"] == routine_id and r["duration_minutes"] == 20 for r in updated.json()["routines"])
    assert client.patch(f"/routines/{routine_id}", headers=headers, json={"title": None}).status_code == 422
    assert client.post("/routines", headers=headers, json={"title": "x", "color": "red"}).status_code == 422
    assert client.delete(f"/routines/{routine_id}", headers=headers).status_code == 204
    assert all(r["id"] != routine_id for r in client.get("/routines", headers=headers).json()["routines"])


def test_ritual_time_reduces_free_hours(client: TestClient) -> None:
    headers = olesya(client)
    workload = client.get("/dashboard/my-day", headers=headers).json()["workload"]
    assert workload["ritual_minutes"] == 22
    assert workload["free_minutes"] == workload["workday_minutes"] - 22


def test_overload_warning(client: TestClient) -> None:
    headers = mira(client)
    client.patch("/auth/me", headers=headers, json={"workday_minutes": 60})
    me = client.get("/auth/me", headers=headers).json()
    project = client.get("/projects", headers=headers).json()[0]
    ritual = client.get("/routines", headers=headers).json()
    today = date.fromisoformat(ritual["day"])
    # Дедлайн на сегодняшний вечер по поясу пользователя (Москва, UTC+3): 20:00 МСК = 17:00 UTC.
    due = f"{today.isoformat()}T17:00:00Z"
    for title in ("Отчёт", "Презентация"):
        client.post(
            "/tasks",
            headers=headers,
            json={
                "project_id": project["id"],
                "title": title,
                "primary_assignee_id": me["id"],
                "due_at": due,
                "estimate_minutes": 30,
            },
        )
    workload = client.get("/dashboard/my-day", headers=headers).json()["workload"]
    assert workload["overloaded"] is True
    assert workload["free_minutes"] == 60 - 22
    assert "ритуала" in workload["message"]


def test_today_uses_user_timezone(client: TestClient) -> None:
    """Дедлайн в 23:30 по Москве = 20:30 UTC: для москвича это «сегодня»."""
    headers = leader(client)
    me = client.get("/auth/me", headers=headers).json()
    project = next(p for p in client.get("/projects", headers=headers).json() if not p["is_personal"])
    day = client.get("/dashboard/my-day", headers=headers).json()["local_date"]
    created = client.post(
        "/tasks",
        headers=headers,
        json={
            "project_id": project["id"],
            "title": "Поздний дедлайн",
            "primary_assignee_id": me["id"],
            "due_at": f"{day}T23:30:00+03:00",
        },
    )
    assert created.status_code == 201
    today = client.get("/tasks", headers=headers, params={"view": "today"}).json()
    assert any(task["id"] == created.json()["id"] for task in today)

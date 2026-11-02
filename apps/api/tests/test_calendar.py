"""Калькулятор дат и календарь событий."""

from datetime import date, timedelta

from fastapi.testclient import TestClient

from tests.helpers import corporate_project, leader, maya, mira, olesya, register


def calc(client: TestClient, headers: dict, **body) -> dict:
    response = client.post("/calendar/calculate", headers=headers, json=body)
    assert response.status_code == 200, response.text
    return response.json()


def test_calendar_days(client: TestClient) -> None:
    result = calc(client, mira(client), start_date="2026-01-30", days=30, mode="calendar")
    assert result["result_date"] == "2026-03-01"
    assert result["calendar_days"] == 30


def test_business_days_skip_weekends(client: TestClient) -> None:
    headers = mira(client)
    # Пятница + 1 рабочий день = понедельник.
    assert calc(client, headers, start_date="2026-03-06", days=1, mode="business")["result_date"] == "2026-03-09"
    # Понедельник − 1 рабочий день = пятница.
    back = calc(client, headers, start_date="2026-03-09", days=-1, mode="business")
    assert back["result_date"] == "2026-03-06"
    assert back["business_days"] == -1
    ten = calc(client, headers, start_date="2026-03-02", days=10, mode="business")
    assert ten["result_date"] == "2026-03-16"
    assert ten["calendar_days"] == 14


def test_calc_defaults_to_today_in_user_timezone(client: TestClient) -> None:
    headers = mira(client)
    today = client.get("/routines", headers=headers).json()["day"]
    assert calc(client, headers, days=0)["start_date"] == today


def test_calc_limits(client: TestClient) -> None:
    response = client.post("/calendar/calculate", headers=mira(client), json={"days": 100000})
    assert response.status_code == 422


def test_calendar_merges_events_and_deadlines(client: TestClient) -> None:
    headers = mira(client)
    today = date.fromisoformat(client.get("/routines", headers=headers).json()["day"])
    response = client.get(
        "/calendar",
        headers=headers,
        params={"from": str(today), "to": str(today + timedelta(days=10))},
    )
    assert response.status_code == 200
    kinds = {item["kind"] for item in response.json()["items"]}
    assert kinds == {"event", "task"}


def test_create_event_on_date(client: TestClient) -> None:
    headers = mira(client)
    created = client.post(
        "/calendar/events",
        headers=headers,
        json={"title": "Стоматолог", "starts_at": "2026-04-15T09:00:00+03:00", "all_day": False},
    )
    assert created.status_code == 201, created.text
    items = client.get("/calendar", headers=headers, params={"from": "2026-04-01", "to": "2026-04-30"}).json()["items"]
    assert any(item["title"] == "Стоматолог" and item["day"] == "2026-04-15" for item in items)


def test_event_requires_timezone(client: TestClient) -> None:
    response = client.post(
        "/calendar/events", headers=mira(client), json={"title": "Без пояса", "starts_at": "2026-04-15T09:00:00"}
    )
    assert response.status_code == 422


def test_personal_events_are_private(client: TestClient) -> None:
    created = client.post(
        "/calendar/events",
        headers=mira(client),
        json={"title": "Личное", "starts_at": "2026-05-01T00:00:00Z"},
    ).json()
    other = register(client, "stranger@example.com")
    assert client.get(f"/calendar/events/{created['id']}", headers=other).status_code == 404
    assert client.delete(f"/calendar/events/{created['id']}", headers=other).status_code == 404
    items = client.get("/calendar", headers=leader(client), params={"from": "2026-05-01", "to": "2026-05-02"}).json()["items"]
    assert all(item["title"] != "Личное" for item in items)


def test_project_events_visible_to_members_and_notify(client: TestClient) -> None:
    leader_headers = leader(client)
    project = corporate_project(client, leader_headers)
    created = client.post(
        "/calendar/events",
        headers=leader_headers,
        json={"title": "Дедлайн подачи", "starts_at": "2026-06-10T00:00:00Z", "project_id": project["id"]},
    )
    assert created.status_code == 201
    for headers in (olesya(client), maya(client)):
        items = client.get("/calendar", headers=headers, params={"from": "2026-06-09", "to": "2026-06-11"}).json()["items"]
        assert any(item["title"] == "Дедлайн подачи" for item in items)
    notes = client.get("/notifications", headers=olesya(client)).json()
    assert any(n["kind"] == "event" for n in notes)
    # Менеджер видит событие проекта, но не может его изменить.
    event_id = created.json()["id"]
    assert client.get(f"/calendar/events/{event_id}", headers=olesya(client)).json()["can_edit"] is False
    assert client.patch(f"/calendar/events/{event_id}", headers=olesya(client), json={"title": "x"}).status_code == 403
    assert client.delete(f"/calendar/events/{event_id}", headers=leader_headers).status_code == 204


def test_outsider_cannot_create_event_in_foreign_project(client: TestClient) -> None:
    project = corporate_project(client, leader(client))
    response = client.post(
        "/calendar/events",
        headers=mira(client),
        json={"title": "Взлом", "starts_at": "2026-06-10T00:00:00Z", "project_id": project["id"]},
    )
    assert response.status_code == 403


def test_calendar_range_limits(client: TestClient) -> None:
    headers = mira(client)
    assert client.get("/calendar", headers=headers, params={"from": "2026-02-01", "to": "2026-01-01"}).status_code == 422
    assert client.get("/calendar", headers=headers, params={"from": "2026-01-01", "to": "2028-01-01"}).status_code == 422


def test_multi_day_event_spans_days(client: TestClient) -> None:
    headers = mira(client)
    client.post(
        "/calendar/events",
        headers=headers,
        json={"title": "Отпуск", "starts_at": "2026-07-01T00:00:00+03:00", "ends_at": "2026-07-03T23:00:00+03:00"},
    )
    items = client.get("/calendar", headers=headers, params={"from": "2026-07-01", "to": "2026-07-05"}).json()["items"]
    days = sorted(item["day"] for item in items if item["title"] == "Отпуск")
    assert days == ["2026-07-01", "2026-07-02", "2026-07-03"]

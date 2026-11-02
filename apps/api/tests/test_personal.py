"""Личные аккаунты (роль personal) и личные проекты."""

from fastapi.testclient import TestClient

from tests.helpers import corporate_project, leader, mira, olesya, register, user_id


def test_register_creates_personal_space(client: TestClient) -> None:
    headers = register(client, "ivan@example.com", "Иван Петров")
    me = client.get("/auth/me", headers=headers).json()
    assert me["role"] == "personal"
    assert me["timezone"] == "Asia/Tashkent"
    projects = client.get("/projects", headers=headers).json()
    assert len(projects) == 1 and projects[0]["is_personal"] is True
    ritual = client.get("/routines", headers=headers).json()
    assert len(ritual["routines"]) == 4


def test_register_duplicate_email(client: TestClient) -> None:
    register(client, "dup@example.com")
    again = client.post(
        "/auth/register",
        json={"email": "DUP@example.com", "password": "secret123", "full_name": "Дубль"},
    )
    assert again.status_code == 409


def test_register_cannot_choose_role(client: TestClient) -> None:
    response = client.post(
        "/auth/register",
        json={"email": "hacker@example.com", "password": "secret123", "full_name": "Хакер", "role": "leader"},
    )
    assert response.status_code == 201
    assert response.json()["user"]["role"] == "personal"


def test_register_weak_password(client: TestClient) -> None:
    response = client.post(
        "/auth/register",
        json={"email": "weak@example.com", "password": "12345678", "full_name": "Слабый"},
    )
    assert response.status_code == 422


def test_registration_can_be_disabled(client: TestClient, monkeypatch) -> None:
    from app.config import get_settings

    monkeypatch.setattr(get_settings(), "allow_registration", False)
    response = client.post(
        "/auth/register",
        json={"email": "off@example.com", "password": "secret123", "full_name": "Выкл"},
    )
    assert response.status_code == 403


def test_personal_user_cannot_see_company(client: TestClient) -> None:
    headers = mira(client)
    projects = client.get("/projects", headers=headers).json()
    assert all(project["is_personal"] for project in projects)
    company = corporate_project(client, leader(client))
    assert client.get(f"/projects/{company['id']}", headers=headers).status_code == 403
    assert client.get("/team/summary", headers=headers).status_code == 403
    users = client.get("/users", headers=headers).json()
    assert [item["id"] for item in users] == [user_id(client, headers)]
    assert client.get("/search", headers=headers, params={"query": "документ"}).json()["tasks"] == []


def test_leader_cannot_see_personal_projects(client: TestClient) -> None:
    mira_project = client.get("/projects", headers=mira(client)).json()[0]
    leader_headers = leader(client)
    assert all(p["id"] != mira_project["id"] for p in client.get("/projects", headers=leader_headers).json())
    assert client.get(f"/projects/{mira_project['id']}", headers=leader_headers).status_code == 404
    mira_task = client.get("/tasks", headers=mira(client)).json()[0]
    assert client.get(f"/tasks/{mira_task['id']}", headers=leader_headers).status_code == 404
    summary = client.get("/team/summary", headers=leader_headers).json()
    assert all(row["user"]["role"] == "manager" for row in summary)


def test_personal_user_creates_only_personal_projects(client: TestClient) -> None:
    headers = mira(client)
    created = client.post("/projects", headers=headers, json={"name": "Ремонт кухни"})
    assert created.status_code == 201
    assert created.json()["is_personal"] is True


def test_manager_can_create_personal_but_not_company_project(client: TestClient) -> None:
    headers = olesya(client)
    assert client.post("/projects", headers=headers, json={"name": "Компания"}).status_code == 403
    personal = client.post("/projects", headers=headers, json={"name": "Спорт", "is_personal": True})
    assert personal.status_code == 201


def test_invite_to_personal_project_by_email(client: TestClient) -> None:
    owner = mira(client)
    friend = register(client, "friend@example.com", "Друг Миры")
    project = client.post("/projects", headers=owner, json={"name": "Поездка в Казань"}).json()
    invited = client.post(
        f"/projects/{project['id']}/members", headers=owner, json={"email": "friend@example.com"}
    )
    assert invited.status_code == 200
    friend_id = user_id(client, friend)
    task = client.post(
        "/tasks",
        headers=owner,
        json={"project_id": project["id"], "title": "Купить билеты", "primary_assignee_id": friend_id},
    )
    assert task.status_code == 201, task.text
    assert client.get(f"/tasks/{task.json()['id']}", headers=friend).status_code == 200
    # Друг не управляет чужим проектом.
    assert client.patch(f"/projects/{project['id']}", headers=friend, json={"name": "Моё"}).status_code == 403


def test_personal_user_cannot_join_company_project(client: TestClient) -> None:
    headers = leader(client)
    project = corporate_project(client, headers)
    response = client.post(
        f"/projects/{project['id']}/members", headers=headers, json={"email": "mira@elite-task.ru"}
    )
    assert response.status_code == 422


def test_assignee_outside_personal_project_rejected(client: TestClient) -> None:
    headers = mira(client)
    project = client.get("/projects", headers=headers).json()[0]
    outsider = user_id(client, olesya(client))
    response = client.post(
        "/tasks",
        headers=headers,
        json={"project_id": project["id"], "title": "Чужому", "primary_assignee_id": outsider},
    )
    assert response.status_code == 422


def test_update_me_timezone_and_reminder(client: TestClient) -> None:
    headers = mira(client)
    ok = client.patch(
        "/auth/me",
        headers=headers,
        json={"timezone": "Asia/Almaty", "reminder_time": "06:45", "reminder_enabled": True},
    )
    assert ok.status_code == 200
    assert ok.json()["timezone"] == "Asia/Almaty"
    assert ok.json()["reminder_time"] == "06:45"
    assert client.patch("/auth/me", headers=headers, json={"timezone": "Mars/Base"}).status_code == 422
    assert client.patch("/auth/me", headers=headers, json={"reminder_time": "25:00"}).status_code == 422


def test_login_updates_timezone(client: TestClient) -> None:
    response = client.post(
        "/auth/login",
        json={"email": "maya@elite-task.ru", "password": "demo12345", "timezone": "Asia/Tashkent"},
    )
    assert response.json()["user"]["timezone"] == "Asia/Tashkent"

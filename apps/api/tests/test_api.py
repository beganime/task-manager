from fastapi.testclient import TestClient

from tests.conftest import login_headers


def test_login_and_dashboard(client: TestClient) -> None:
    headers = login_headers(client, "olesya@elite-task.ru")
    response = client.get("/dashboard/my-day", headers=headers)

    assert response.status_code == 200
    payload = response.json()
    assert payload["overdue"] == 1
    assert payload["waiting"] == 1
    assert len(payload["priorities"]) >= 1


def test_waiting_status_requires_reason(client: TestClient) -> None:
    headers = login_headers(client, "leader@elite-task.ru")
    project = client.get("/projects", headers=headers).json()[0]
    users = client.get("/users", headers=headers).json()
    manager_id = next(user["id"] for user in users if user["email"] == "olesya@elite-task.ru")

    response = client.post(
        "/tasks",
        headers=headers,
        json={
            "project_id": project["id"],
            "title": "Задача без причины",
            "primary_assignee_id": manager_id,
            "status": "waiting",
        },
    )

    assert response.status_code == 422


def test_manager_cannot_rewrite_assigned_task(client: TestClient) -> None:
    headers = login_headers(client, "olesya@elite-task.ru")
    task = client.get("/tasks", headers=headers).json()[0]

    response = client.patch(
        f"/tasks/{task['id']}",
        headers=headers,
        json={"title": "Самовольно изменённое название"},
    )

    assert response.status_code == 403


def test_manager_can_report_waiting_with_reason(client: TestClient) -> None:
    headers = login_headers(client, "olesya@elite-task.ru")
    task = next(
        item for item in client.get("/tasks", headers=headers).json() if item["status"] != "waiting"
    )

    response = client.patch(
        f"/tasks/{task['id']}",
        headers=headers,
        json={
            "status": "waiting",
            "waiting_reason": "Ожидаем перевод от подрядчика",
        },
    )

    assert response.status_code == 200
    assert response.json()["status"] == "waiting"
    assert response.json()["waiting_reason"] == "Ожидаем перевод от подрядчика"


def test_leader_can_archive_project(client: TestClient) -> None:
    headers = login_headers(client, "leader@elite-task.ru")
    project = client.get("/projects", headers=headers).json()[0]

    response = client.patch(
        f"/projects/{project['id']}",
        headers=headers,
        json={"is_archived": True},
    )

    assert response.status_code == 200
    assert response.json()["is_archived"] is True
    assert client.get("/projects", headers=headers).json() == []


def test_search_and_subtasks(client: TestClient) -> None:
    headers = login_headers(client, "leader@elite-task.ru")
    project = client.get("/projects", headers=headers).json()[0]
    users = client.get("/users", headers=headers).json()
    manager_id = next(user["id"] for user in users if user["email"] == "olesya@elite-task.ru")
    parent = client.post(
        "/tasks",
        headers=headers,
        json={
            "project_id": project["id"],
            "title": "Собрать уникальный пакет документов",
            "primary_assignee_id": manager_id,
        },
    ).json()
    child = client.post(
        "/tasks",
        headers=headers,
        json={
            "project_id": project["id"],
            "parent_task_id": parent["id"],
            "title": "Проверить уникальный паспорт",
            "primary_assignee_id": manager_id,
        },
    )

    assert child.status_code == 201
    subtasks = client.get(f"/tasks/{parent['id']}/subtasks", headers=headers)
    search = client.get("/search", headers=headers, params={"query": "уникальный"})
    assert subtasks.status_code == 200
    assert len(subtasks.json()) == 1
    assert search.status_code == 200
    assert len(search.json()["tasks"]) == 2


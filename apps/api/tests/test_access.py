"""Матрица ролей и бизнес-правила задач."""

from fastapi.testclient import TestClient

from tests.helpers import corporate_project, leader, maya, olesya, user_id


def test_manager_sees_only_own_tasks_in_project(client: TestClient) -> None:
    headers = olesya(client)
    me = user_id(client, headers)
    project = corporate_project(client, headers)
    tasks = client.get(f"/projects/{project['id']}/tasks", headers=headers).json()
    assert tasks, "у Олеси есть свои задачи"
    assert all(task["primary_assignee"]["id"] == me for task in tasks)


def test_manager_cannot_open_foreign_task(client: TestClient) -> None:
    leader_headers = leader(client)
    project = corporate_project(client, leader_headers)
    maya_id = user_id(client, maya(client))
    foreign = next(
        task
        for task in client.get(f"/projects/{project['id']}/tasks", headers=leader_headers).json()
        if task["primary_assignee"]["id"] == maya_id
    )
    assert client.get(f"/tasks/{foreign['id']}", headers=olesya(client)).status_code == 404


def test_manager_search_excludes_foreign_tasks(client: TestClient) -> None:
    results = client.get("/search", headers=olesya(client), params={"query": "сроки"}).json()
    assert results["tasks"] == []


def test_manager_sees_task_where_collaborator(client: TestClient) -> None:
    leader_headers = leader(client)
    project = corporate_project(client, leader_headers)
    olesya_id = user_id(client, olesya(client))
    maya_id = user_id(client, maya(client))
    created = client.post(
        "/tasks",
        headers=leader_headers,
        json={
            "project_id": project["id"],
            "title": "Совместная задача",
            "primary_assignee_id": maya_id,
            "collaborator_ids": [olesya_id],
        },
    ).json()
    assert client.get(f"/tasks/{created['id']}", headers=olesya(client)).status_code == 200


def test_archived_project_is_read_only(client: TestClient) -> None:
    headers = leader(client)
    project = corporate_project(client, headers)
    olesya_id = user_id(client, olesya(client))
    task = client.get(f"/projects/{project['id']}/tasks", headers=headers).json()[0]
    client.patch(f"/projects/{project['id']}", headers=headers, json={"is_archived": True})

    created = client.post(
        "/tasks",
        headers=headers,
        json={"project_id": project["id"], "title": "В архив", "primary_assignee_id": olesya_id},
    )
    assert created.status_code == 409
    assert client.patch(f"/tasks/{task['id']}", headers=headers, json={"title": "Новое"}).status_code == 409
    assert client.post(f"/tasks/{task['id']}/comments", headers=headers, json={"body": "x"}).status_code == 409
    renamed = client.patch(f"/projects/{project['id']}", headers=headers, json={"name": "Другое"})
    assert renamed.status_code == 409
    restored = client.patch(f"/projects/{project['id']}", headers=headers, json={"is_archived": False})
    assert restored.status_code == 200


def test_favorite_is_personal(client: TestClient) -> None:
    leader_headers = leader(client)
    olesya_headers = olesya(client)
    task = next(t for t in client.get("/tasks", headers=olesya_headers).json() if t["is_favorite"])
    before = client.get(f"/tasks/{task['id']}", headers=leader_headers).json()
    assert before["is_favorite"] is False
    client.patch(f"/tasks/{task['id']}", headers=leader_headers, json={"is_favorite": True})
    client.patch(f"/tasks/{task['id']}", headers=olesya_headers, json={"is_favorite": False})
    assert client.get(f"/tasks/{task['id']}", headers=leader_headers).json()["is_favorite"] is True
    assert client.get(f"/tasks/{task['id']}", headers=olesya_headers).json()["is_favorite"] is False


def test_subtask_cycle_rejected(client: TestClient) -> None:
    headers = leader(client)
    project = corporate_project(client, headers)
    olesya_id = user_id(client, olesya(client))

    def create(title: str, parent: int | None = None) -> dict:
        response = client.post(
            "/tasks",
            headers=headers,
            json={
                "project_id": project["id"],
                "title": title,
                "primary_assignee_id": olesya_id,
                "parent_task_id": parent,
            },
        )
        assert response.status_code == 201, response.text
        return response.json()

    a = create("Задача А")
    b = create("Задача Б", a["id"])
    c = create("Задача В", b["id"])
    loop = client.patch(f"/tasks/{a['id']}", headers=headers, json={"parent_task_id": c["id"]})
    assert loop.status_code == 422
    self_loop = client.patch(f"/tasks/{a['id']}", headers=headers, json={"parent_task_id": a["id"]})
    assert self_loop.status_code == 422


def test_done_sets_completed_at_and_week_counter(client: TestClient) -> None:
    headers = olesya(client)
    before = client.get("/dashboard/my-day", headers=headers).json()["done_this_week"]
    task = next(t for t in client.get("/tasks", headers=headers).json() if t["status"] == "in_progress")
    done = client.patch(f"/tasks/{task['id']}", headers=headers, json={"status": "done"}).json()
    assert done["completed_at"] is not None
    assert client.get("/dashboard/my-day", headers=headers).json()["done_this_week"] == before + 1
    reopened = client.patch(f"/tasks/{task['id']}", headers=headers, json={"status": "in_progress"}).json()
    assert reopened["completed_at"] is None


def test_editing_old_done_task_does_not_count_this_week(client: TestClient) -> None:
    headers = olesya(client)
    task = next(t for t in client.get("/tasks", headers=headers).json() if t["status"] == "in_progress")
    client.patch(f"/tasks/{task['id']}", headers=headers, json={"status": "done"})
    count = client.get("/dashboard/my-day", headers=headers).json()["done_this_week"]
    client.patch(f"/tasks/{task['id']}", headers=headers, json={"estimate_minutes": 30})
    assert client.get("/dashboard/my-day", headers=headers).json()["done_this_week"] == count


def test_status_change_notifies_creator(client: TestClient) -> None:
    headers = olesya(client)
    task = next(t for t in client.get("/tasks", headers=headers).json() if t["status"] == "in_progress")
    client.patch(f"/tasks/{task['id']}", headers=headers, json={"status": "review"})
    notes = client.get("/notifications", headers=leader(client)).json()
    assert any(n["kind"] == "status" and n["task_id"] == task["id"] for n in notes)


def test_team_summary_still_leader_only(client: TestClient) -> None:
    assert client.get("/team/summary", headers=olesya(client)).status_code == 403
    assert client.get("/team/summary", headers=leader(client)).status_code == 200

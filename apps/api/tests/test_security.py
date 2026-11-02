"""Исправления безопасности из аудита."""

from fastapi.testclient import TestClient

from tests.conftest import login_headers
from tests.helpers import corporate_project, leader, olesya, user_id


def test_datetimes_are_timezone_aware(client: TestClient) -> None:
    headers = olesya(client)
    task = client.get("/tasks", headers=headers).json()[0]
    assert task["due_at"].endswith("Z") or task["due_at"].endswith("+00:00")


def test_patch_null_title_is_422_not_500(client: TestClient) -> None:
    headers = leader(client)
    task = client.get(f"/projects/{corporate_project(client, headers)['id']}/tasks", headers=headers).json()[0]
    response = client.patch(f"/tasks/{task['id']}", headers=headers, json={"title": None})
    assert response.status_code == 422


def test_login_rate_limit(client: TestClient) -> None:
    for _ in range(5):
        response = client.post(
            "/auth/login", json={"email": "leader@elite-task.ru", "password": "wrongpass1"}
        )
        assert response.status_code == 401
    blocked = client.post(
        "/auth/login", json={"email": "leader@elite-task.ru", "password": "wrongpass1"}
    )
    assert blocked.status_code == 429
    assert "retry-after" in {key.lower() for key in blocked.headers}


def test_unknown_email_and_wrong_password_same_answer(client: TestClient) -> None:
    unknown = client.post("/auth/login", json={"email": "nobody@x.ru", "password": "whatever1"})
    wrong = client.post("/auth/login", json={"email": "maya@elite-task.ru", "password": "whatever1"})
    assert unknown.status_code == wrong.status_code == 401
    assert unknown.json() == wrong.json()


def test_logout_all_revokes_tokens(client: TestClient) -> None:
    headers = olesya(client)
    assert client.post("/auth/logout-all", headers=headers).status_code == 204
    assert client.get("/auth/me", headers=headers).status_code == 401


def test_change_password_revokes_old_token(client: TestClient) -> None:
    headers = olesya(client)
    response = client.post(
        "/auth/change-password",
        headers=headers,
        json={"current_password": "demo12345", "new_password": "newpass123"},
    )
    assert response.status_code == 200
    assert client.get("/auth/me", headers=headers).status_code == 401
    fresh = {"Authorization": f"Bearer {response.json()['access_token']}"}
    assert client.get("/auth/me", headers=fresh).status_code == 200
    login_headers(client, "olesya@elite-task.ru", "newpass123")


def test_change_password_requires_current(client: TestClient) -> None:
    response = client.post(
        "/auth/change-password",
        headers=olesya(client),
        json={"current_password": "wrongpass1", "new_password": "newpass123"},
    )
    assert response.status_code == 422


def test_websocket_requires_ticket_not_access_token(client: TestClient) -> None:
    headers = olesya(client)
    access = headers["Authorization"].split()[1]
    from starlette.websockets import WebSocketDisconnect

    try:
        with client.websocket_connect(f"/notifications/ws?ticket={access}") as ws:
            ws.receive_text()
        raise AssertionError("access-токен не должен открывать WebSocket")
    except WebSocketDisconnect as exc:
        assert exc.code == 4401

    ticket = client.post("/auth/ws-ticket", headers=headers).json()["ticket"]
    with client.websocket_connect(f"/notifications/ws?ticket={ticket}") as ws:
        ws.send_text("ping")


def test_ws_ticket_cannot_be_used_as_bearer(client: TestClient) -> None:
    ticket = client.post("/auth/ws-ticket", headers=olesya(client)).json()["ticket"]
    response = client.get("/auth/me", headers={"Authorization": f"Bearer {ticket}"})
    assert response.status_code == 401


def test_search_escapes_like_wildcards(client: TestClient) -> None:
    response = client.get("/search", headers=leader(client), params={"query": "%%"})
    assert response.status_code == 200
    payload = response.json()
    assert payload["tasks"] == [] and payload["projects"] == [] and payload["users"] == []


def test_users_hide_emails_from_manager(client: TestClient) -> None:
    users = client.get("/users", headers=olesya(client)).json()
    me = user_id(client, olesya(client))
    for item in users:
        if item["id"] == me:
            assert item["email"] == "olesya@elite-task.ru"
        else:
            assert item["email"] is None
    leader_view = client.get("/users", headers=leader(client)).json()
    assert all(item["email"] for item in leader_view)


def test_upload_rejects_dangerous_types(client: TestClient) -> None:
    headers = olesya(client)
    task = client.get("/tasks", headers=headers).json()[0]
    response = client.post(
        f"/tasks/{task['id']}/attachments",
        headers=headers,
        files={"file": ("evil.html", b"<script>alert(1)</script>", "text/html")},
    )
    assert response.status_code == 415


def test_upload_and_download_are_safe(client: TestClient) -> None:
    headers = olesya(client)
    task = client.get("/tasks", headers=headers).json()[0]
    uploaded = client.post(
        f"/tasks/{task['id']}/attachments",
        headers=headers,
        # Клиент врёт про MIME — сервер определяет тип сам по расширению.
        files={"file": ("../../report.pdf", b"%PDF-1.4 test", "text/html")},
    )
    assert uploaded.status_code == 201, uploaded.text
    body = uploaded.json()
    assert body["original_name"] == "report.pdf"
    assert body["content_type"] == "application/pdf"
    download = client.get(f"/tasks/{task['id']}/attachments/{body['id']}", headers=headers)
    assert download.status_code == 200
    assert download.headers["x-content-type-options"] == "nosniff"
    assert download.headers["content-disposition"].startswith("attachment")


def test_upload_size_limit(client: TestClient, monkeypatch) -> None:
    from app.config import get_settings

    monkeypatch.setattr(get_settings(), "max_upload_mb", 1)
    headers = olesya(client)
    task = client.get("/tasks", headers=headers).json()[0]
    response = client.post(
        f"/tasks/{task['id']}/attachments",
        headers=headers,
        files={"file": ("big.txt", b"x" * (1024 * 1024 + 10), "text/plain")},
    )
    assert response.status_code == 413


def test_security_headers(client: TestClient) -> None:
    response = client.get("/health")
    assert response.headers["x-content-type-options"] == "nosniff"
    assert response.headers["x-frame-options"] == "DENY"


def test_production_rejects_weak_secret() -> None:
    import pytest

    from app.config import Settings

    with pytest.raises(ValueError):
        Settings(environment="production", jwt_secret="short", auto_seed=False, cors_origins="https://a.ru")
    with pytest.raises(ValueError):
        Settings(environment="production", jwt_secret="x" * 40, auto_seed=False, cors_origins="*")
    ok = Settings(
        environment="production", jwt_secret="x" * 40, auto_seed=False, cors_origins="https://a.ru"
    )
    assert ok.is_production

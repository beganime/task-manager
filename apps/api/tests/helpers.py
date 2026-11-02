from fastapi.testclient import TestClient

from tests.conftest import login_headers


def leader(client: TestClient) -> dict[str, str]:
    return login_headers(client, "leader@elite-task.ru")


def olesya(client: TestClient) -> dict[str, str]:
    return login_headers(client, "olesya@elite-task.ru")


def maya(client: TestClient) -> dict[str, str]:
    return login_headers(client, "maya@elite-task.ru")


def mira(client: TestClient) -> dict[str, str]:
    return login_headers(client, "mira@elite-task.ru")


def corporate_project(client: TestClient, headers: dict[str, str]) -> dict:
    return next(p for p in client.get("/projects", headers=headers).json() if not p["is_personal"])


def user_id(client: TestClient, headers: dict[str, str]) -> int:
    return client.get("/auth/me", headers=headers).json()["id"]


def register(client: TestClient, email: str, name: str = "Новый Пользователь") -> dict[str, str]:
    response = client.post(
        "/auth/register",
        json={
            "email": email,
            "password": "secret123",
            "full_name": name,
            "timezone": "Asia/Tashkent",
        },
    )
    assert response.status_code == 201, response.text
    return {"Authorization": f"Bearer {response.json()['access_token']}"}

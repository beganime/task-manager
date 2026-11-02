import asyncio
from collections.abc import AsyncIterator, Iterator

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.config import get_settings
from app.db import create_schema, get_session
from app.main import app
from app.security import login_limiter
from app.seed import seed_database


@pytest.fixture
def client(tmp_path, monkeypatch) -> Iterator[TestClient]:
    database_path = tmp_path / "test.db"
    test_engine = create_async_engine(f"sqlite+aiosqlite:///{database_path}")
    test_session = async_sessionmaker(test_engine, expire_on_commit=False, class_=AsyncSession)
    monkeypatch.setattr(get_settings(), "upload_dir", str(tmp_path / "uploads"))
    login_limiter.clear()

    async def prepare() -> None:
        await create_schema(test_engine)
        async with test_session() as session:
            await seed_database(session)

    async def override_session() -> AsyncIterator[AsyncSession]:
        async with test_session() as session:
            yield session

    asyncio.run(prepare())
    app.dependency_overrides[get_session] = override_session
    with TestClient(app) as test_client:
        yield test_client
    app.dependency_overrides.clear()
    login_limiter.clear()
    asyncio.run(test_engine.dispose())


def login_headers(client: TestClient, email: str, password: str = "demo12345") -> dict[str, str]:
    response = client.post(
        "/auth/login",
        json={"email": email, "password": password},
    )
    assert response.status_code == 200, response.text
    token = response.json()["access_token"]
    return {"Authorization": f"Bearer {token}"}

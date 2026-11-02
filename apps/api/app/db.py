import logging
from collections.abc import AsyncIterator
from pathlib import Path

from sqlalchemy import inspect
from sqlalchemy.engine import Connection
from sqlalchemy.ext.asyncio import (
    AsyncEngine,
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)
from sqlalchemy.orm import DeclarativeBase

from app.config import get_settings

logger = logging.getLogger("elite_task.db")


class Base(DeclarativeBase):
    pass


settings = get_settings()
if settings.database_url.startswith("sqlite"):
    Path("data").mkdir(parents=True, exist_ok=True)

engine = create_async_engine(
    settings.database_url,
    echo=False,
    pool_pre_ping=True,
)
SessionLocal = async_sessionmaker(engine, expire_on_commit=False, class_=AsyncSession)


async def get_session() -> AsyncIterator[AsyncSession]:
    async with SessionLocal() as session:
        yield session


def _add_missing_columns(connection: Connection) -> None:
    """Аддитивное обновление локальной схемы.

    `create_all` создаёт только новые таблицы и не добавляет колонки в уже
    существующие. Для локального MVP без Alembic добавляем недостающие
    колонки (только nullable или с server_default). Перед production
    необходимо перейти на Alembic — см. docs/IMPLEMENTATION_PLAN.md, этап E.
    """
    inspector = inspect(connection)
    existing_tables = set(inspector.get_table_names())
    preparer = connection.dialect.identifier_preparer
    for table in Base.metadata.sorted_tables:
        if table.name not in existing_tables:
            continue
        present = {column["name"] for column in inspector.get_columns(table.name)}
        for column in table.columns:
            if column.name in present:
                continue
            if not column.nullable and column.server_default is None:
                logger.warning(
                    "Колонка %s.%s требует ручной миграции", table.name, column.name
                )
                continue
            column_type = column.type.compile(dialect=connection.dialect)
            ddl = f"ALTER TABLE {preparer.quote(table.name)} ADD COLUMN {preparer.quote(column.name)} {column_type}"
            if column.server_default is not None:
                default_value = column.server_default.arg  # type: ignore[attr-defined]
                default_sql = getattr(default_value, "text", None)
                if default_sql is None:
                    default_sql = f"'{default_value}'"
                ddl += f" DEFAULT {default_sql}"
            connection.exec_driver_sql(ddl)
            logger.info("Добавлена колонка %s.%s", table.name, column.name)


async def create_schema(target: AsyncEngine | None = None) -> None:
    async with (target or engine).begin() as connection:
        await connection.run_sync(Base.metadata.create_all)
        await connection.run_sync(_add_missing_columns)

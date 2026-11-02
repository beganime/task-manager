import logging
import secrets
from functools import lru_cache

from pydantic import model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

logger = logging.getLogger("elite_task.config")

DEFAULT_DEV_SECRET = "local-development-secret-change-before-deployment"
DEV_CORS_ORIGINS = (
    "http://localhost:8081,http://127.0.0.1:8081,"
    "http://localhost:19006,http://127.0.0.1:19006,"
    "http://localhost:3000,http://127.0.0.1:3000"
)


class Settings(BaseSettings):
    app_name: str = "Elite Task API"
    environment: str = "development"
    database_url: str = "sqlite+aiosqlite:///./data/elite_task.db"
    jwt_secret: str = DEFAULT_DEV_SECRET
    jwt_expire_minutes: int = 60 * 24
    ws_ticket_expire_seconds: int = 60
    cors_origins: str = DEV_CORS_ORIGINS
    auto_seed: bool = True
    allow_registration: bool = True
    login_max_attempts: int = 5
    login_window_seconds: int = 15 * 60
    upload_dir: str = "data/uploads"
    max_upload_mb: int = 20

    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8")

    @property
    def is_production(self) -> bool:
        return self.environment.lower() in {"production", "prod"}

    @model_validator(mode="after")
    def validate_secrets(self) -> "Settings":
        weak = self.jwt_secret == DEFAULT_DEV_SECRET or len(self.jwt_secret) < 32
        if self.is_production:
            if weak:
                raise ValueError(
                    "JWT_SECRET должен быть уникальным и содержать не менее 32 символов"
                )
            if self.cors_origins.strip() == "*":
                raise ValueError("В production CORS_ORIGINS не может быть '*'")
            if self.auto_seed:
                raise ValueError("В production AUTO_SEED должен быть выключен")
        elif weak:
            logger.warning(
                "Используется слабый JWT_SECRET. Для локальной разработки это допустимо, "
                "для сервера задайте JWT_SECRET в .env"
            )
        return self

    @property
    def cors_origin_list(self) -> list[str]:
        if self.cors_origins.strip() == "*":
            return ["*"]
        return [origin.strip() for origin in self.cors_origins.split(",") if origin.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()


def generate_secret() -> str:
    """Утилита для генерации JWT_SECRET: python -c 'from app.config import generate_secret; print(generate_secret())'"""
    return secrets.token_urlsafe(48)

from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    app_name: str = "Elite Task API"
    environment: str = "development"
    database_url: str = "sqlite+aiosqlite:///./data/elite_task.db"
    jwt_secret: str = "local-development-secret-change-before-deployment"
    jwt_expire_minutes: int = 60 * 24 * 7
    cors_origins: str = "*"
    auto_seed: bool = True

    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8")

    @property
    def cors_origin_list(self) -> list[str]:
        if self.cors_origins.strip() == "*":
            return ["*"]
        return [origin.strip() for origin in self.cors_origins.split(",") if origin.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()


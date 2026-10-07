from functools import lru_cache
from pathlib import Path

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    database_url: str = "sqlite:///./smart_event.db"
    secret_key: str = "change-this-secret-in-production"
    algorithm: str = "HS256"
    access_token_expire_minutes: int = 60 * 24 * 7
    frontend_origin: str = "http://localhost:5173"
    jwt_token: str = Field(default="", exclude=True)

    @property
    def app_root(self) -> Path:
        return Path(__file__).resolve().parent.parent


@lru_cache

def get_settings() -> Settings:
    return Settings()

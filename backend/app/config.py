import secrets
from functools import lru_cache
from pathlib import Path
from typing import Literal

from pydantic import Field, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    database_url: str = "sqlite:///./smart_event.db"
    secret_key: str = ""
    environment: Literal["development", "production"] = "development"
    algorithm: str = "HS256"
    access_token_expire_minutes: int = 60 * 24 * 7
    frontend_origin: str = "http://localhost:5173"
    jwt_token: str = Field(default="", exclude=True)

    @model_validator(mode="after")
    def validate_secret_key(self):
        if not self.secret_key:
            if self.environment == "production":
                raise ValueError("SECRET_KEY must be configured in production")
            self.secret_key = secrets.token_urlsafe(48)
        if len(self.secret_key) < 32:
            raise ValueError("SECRET_KEY must contain at least 32 characters")
        return self

    @property
    def app_root(self) -> Path:
        return Path(__file__).resolve().parent.parent


@lru_cache

def get_settings() -> Settings:
    return Settings()

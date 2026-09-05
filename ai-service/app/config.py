"""AI Service configuration."""

import os
from functools import lru_cache
from pydantic import AliasChoices, Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict
from typing import Optional


class Settings(BaseSettings):
    """Application settings loaded from environment variables."""

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
        populate_by_name=True,
    )

    # Service
    service_name: str = "flight-tracking-ai-service"
    host: str = "0.0.0.0"
    port: int = 8001
    environment: str = "development"

    # LLM Provider (abstracted)
    llm_provider: Optional[str] = None
    llm_api_key: Optional[str] = None
    llm_model: Optional[str] = None
    llm_base_url: Optional[str] = None

    # AI Service Authentication
    ai_service_api_key: Optional[str] = None

    # Database
    database_url: Optional[str] = None

    # Vector Database (pgvector)
    vector_database_url: Optional[str] = None

    # Spring Boot Backend
    # Primary env var: SPRING_BOOT_BASE_URL
    # Aliases accepted for backwards/forwards compatibility if Render was configured with an alternate name.
    # Do NOT hardcode production URLs — value must come from environment.
    spring_boot_base_url: Optional[str] = Field(
        default=None,
        validation_alias=AliasChoices(
            "SPRING_BOOT_BASE_URL",
            "SPRING_BOOT_URL",
            "BACKEND_URL",
            "BACKEND_BASE_URL",
        ),
    )

    # Observability
    log_level: str = "INFO"
    # Pricing per 1M tokens (USD) — None means unavailable / not configured
    llm_input_cost_per_1m: Optional[float] = None
    llm_output_cost_per_1m: Optional[float] = None
    # Prompt versioning
    prompt_version: str = "ai-10-v1"

    # CORS
    cors_origins: str = "http://localhost:3000,http://localhost:5173"

    @field_validator("spring_boot_base_url", mode="before")
    @classmethod
    def _normalize_spring_boot_base_url(cls, v):
        """Normalize Spring Boot base URL: blank/whitespace -> None, strip trailing slash."""
        if v is None:
            return None
        if isinstance(v, str):
            stripped = v.strip()
            if not stripped:
                return None
            return stripped.rstrip("/")
        return v

    @property
    def effective_spring_boot_base_url(self) -> Optional[str]:
        """Return normalized Spring Boot base URL or None if not configured."""
        return self.spring_boot_base_url


@lru_cache
def get_settings() -> Settings:
    """Cached settings instance."""
    return Settings()
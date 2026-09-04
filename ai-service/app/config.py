"""AI Service configuration."""

import os
from functools import lru_cache
from pydantic_settings import BaseSettings, SettingsConfigDict
from typing import Optional


class Settings(BaseSettings):
    """Application settings loaded from environment variables."""

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
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
    spring_boot_base_url: Optional[str] = None

    # Observability
    log_level: str = "INFO"
    # Pricing per 1M tokens (USD) — None means unavailable / not configured
    llm_input_cost_per_1m: Optional[float] = None
    llm_output_cost_per_1m: Optional[float] = None
    # Prompt versioning
    prompt_version: str = "ai-10-v1"

    # CORS
    cors_origins: str = "http://localhost:3000,http://localhost:5173"


@lru_cache
def get_settings() -> Settings:
    """Cached settings instance."""
    return Settings()
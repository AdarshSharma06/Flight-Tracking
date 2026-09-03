"""Factory for creating LLM clients based on configuration."""

import logging
from typing import Optional

from app.config import get_settings
from app.llm.base import LLMClient

logger = logging.getLogger(__name__)

# Base URLs for well-known providers
PROVIDER_BASE_URLS = {
    "openai": "https://api.openai.com/v1",
    "ollama": "http://localhost:11434/v1",
}


def create_llm_client() -> Optional[LLMClient]:
    """Create an LLM client from environment configuration.

    Returns None if no LLM provider is configured.
    """
    settings = get_settings()

    if not settings.llm_api_key:
        logger.warning("No LLM_API_KEY configured — AI chat will not be available")
        return None

    provider = (settings.llm_provider or "openai").lower()
    base_url = PROVIDER_BASE_URLS.get(provider, settings.llm_base_url or PROVIDER_BASE_URLS["openai"])
    model = settings.llm_model or "gpt-4o-mini"

    if provider in ("openai", "ollama", "openai-compatible"):
        from app.llm.openai_compatible import OpenAICompatibleClient

        return OpenAICompatibleClient(
            api_key=settings.llm_api_key,
            base_url=base_url,
            default_model=model,
        )

    logger.warning("Unknown LLM provider '%s' — attempting OpenAI-compatible", provider)
    from app.llm.openai_compatible import OpenAICompatibleClient

    return OpenAICompatibleClient(
        api_key=settings.llm_api_key,
        base_url=base_url,
        default_model=model,
    )

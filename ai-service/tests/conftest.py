"""Pytest configuration for AI Service tests."""

import pytest
import sys
from pathlib import Path
from unittest.mock import patch, MagicMock

# Ensure app module is importable
sys.path.insert(0, str(Path(__file__).parent.parent))

# Enable pytest-asyncio for async tests
pytest_plugins = ("pytest_asyncio",)


def pytest_configure(config):
    """Configure pytest-asyncio."""
    config.option.asyncio_mode = "auto"


@pytest.fixture(scope="session")
def event_loop():
    """Create an instance of the default event loop for the test session."""
    import asyncio
    loop = asyncio.get_event_loop_policy().new_event_loop()
    yield loop
    loop.close()


@pytest.fixture
def mock_settings():
    """Provide a mock settings object with ai_service_api_key disabled."""
    mock = MagicMock()
    mock.ai_service_api_key = None
    mock.spring_boot_base_url = "http://localhost:8080"
    mock.cors_origins = "http://localhost:3000"
    mock.log_level = "INFO"
    mock.environment = "test"
    mock.service_name = "test-service"
    return mock


@pytest.fixture
async def async_client(mock_settings):
    from httpx import AsyncClient, ASGITransport
    from app.main import app
    from app.config import get_settings
    # Clear lru_cache so our mock takes effect
    get_settings.cache_clear()
    with patch("app.config.get_settings", return_value=mock_settings), \
         patch("app.main.get_settings", return_value=mock_settings):
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            yield client
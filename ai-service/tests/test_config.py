"""Tests for configuration loading."""

import os
from app.config import Settings, get_settings


def test_settings_defaults():
    """Test default settings values."""
    # Clear env vars that might affect test
    for key in ["SERVICE_NAME", "HOST", "PORT", "ENVIRONMENT"]:
        if key in os.environ:
            del os.environ[key]

    settings = Settings()
    assert settings.service_name == "flight-tracking-ai-service"
    assert settings.host == "0.0.0.0"
    assert settings.port == 8001
    assert settings.environment == "development"
    assert settings.log_level == "INFO"


def test_settings_from_env():
    """Test settings loaded from environment variables."""
    os.environ["SERVICE_NAME"] = "test-service"
    os.environ["PORT"] = "9000"
    os.environ["ENVIRONMENT"] = "production"
    os.environ["LOG_LEVEL"] = "DEBUG"

    try:
        settings = Settings()
        assert settings.service_name == "test-service"
        assert settings.port == 9000
        assert settings.environment == "production"
        assert settings.log_level == "DEBUG"
    finally:
        for key in ["SERVICE_NAME", "PORT", "ENVIRONMENT", "LOG_LEVEL"]:
            if key in os.environ:
                del os.environ[key]


def test_get_settings_cached():
    """Test get_settings returns cached instance."""
    settings1 = get_settings()
    settings2 = get_settings()
    assert settings1 is settings2
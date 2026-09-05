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


def test_spring_boot_base_url_from_env():
    """SPRING_BOOT_BASE_URL is loaded from configuration (canonical var)."""
    os.environ["SPRING_BOOT_BASE_URL"] = "https://api.example.com"
    try:
        settings = Settings()
        assert settings.spring_boot_base_url == "https://api.example.com"
    finally:
        if "SPRING_BOOT_BASE_URL" in os.environ:
            del os.environ["SPRING_BOOT_BASE_URL"]


def test_spring_boot_base_url_blank_treated_as_none():
    """Blank / whitespace URL is normalized to None (handled clearly)."""
    os.environ["SPRING_BOOT_BASE_URL"] = "   "
    try:
        settings = Settings()
        assert settings.spring_boot_base_url is None
    finally:
        if "SPRING_BOOT_BASE_URL" in os.environ:
            del os.environ["SPRING_BOOT_BASE_URL"]

    os.environ["SPRING_BOOT_BASE_URL"] = ""
    try:
        settings = Settings()
        assert settings.spring_boot_base_url is None
    finally:
        if "SPRING_BOOT_BASE_URL" in os.environ:
            del os.environ["SPRING_BOOT_BASE_URL"]


def test_spring_boot_base_url_trailing_slash_stripped():
    """Trailing slash is stripped for consistent URL construction."""
    os.environ["SPRING_BOOT_BASE_URL"] = "https://api.example.com/"
    try:
        settings = Settings()
        assert settings.spring_boot_base_url == "https://api.example.com"
    finally:
        if "SPRING_BOOT_BASE_URL" in os.environ:
            del os.environ["SPRING_BOOT_BASE_URL"]

    os.environ["SPRING_BOOT_BASE_URL"] = "https://api.example.com///"
    try:
        settings = Settings()
        assert settings.spring_boot_base_url == "https://api.example.com"
    finally:
        if "SPRING_BOOT_BASE_URL" in os.environ:
            del os.environ["SPRING_BOOT_BASE_URL"]


def test_spring_boot_base_url_alias_backend_url():
    """Alias BACKEND_URL is accepted for backwards compatibility."""
    # Ensure canonical is not set
    if "SPRING_BOOT_BASE_URL" in os.environ:
        del os.environ["SPRING_BOOT_BASE_URL"]
    os.environ["BACKEND_URL"] = "https://backend.example.com"
    try:
        settings = Settings()
        assert settings.spring_boot_base_url == "https://backend.example.com"
    finally:
        if "BACKEND_URL" in os.environ:
            del os.environ["BACKEND_URL"]


def test_spring_boot_base_url_alias_spring_boot_url():
    """Alias SPRING_BOOT_URL is accepted."""
    if "SPRING_BOOT_BASE_URL" in os.environ:
        del os.environ["SPRING_BOOT_BASE_URL"]
    os.environ["SPRING_BOOT_URL"] = "https://alt.example.com"
    try:
        settings = Settings()
        assert settings.spring_boot_base_url == "https://alt.example.com"
    finally:
        if "SPRING_BOOT_URL" in os.environ:
            del os.environ["SPRING_BOOT_URL"]


def test_spring_boot_base_url_alias_backend_base_url():
    """Alias BACKEND_BASE_URL is accepted."""
    if "SPRING_BOOT_BASE_URL" in os.environ:
        del os.environ["SPRING_BOOT_BASE_URL"]
    os.environ["BACKEND_BASE_URL"] = "https://backend2.example.com"
    try:
        settings = Settings()
        assert settings.spring_boot_base_url == "https://backend2.example.com"
    finally:
        if "BACKEND_BASE_URL" in os.environ:
            del os.environ["BACKEND_BASE_URL"]
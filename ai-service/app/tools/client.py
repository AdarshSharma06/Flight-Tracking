"""HTTP client for communicating with the Spring Boot backend."""

import logging
from typing import Any, Optional

import httpx

from app.config import get_settings

logger = logging.getLogger(__name__)

_client: Optional[httpx.AsyncClient] = None

# Fallback only for local development when no explicit URL is configured.
_DEFAULT_LOCAL_BASE_URL = "http://localhost:8080"

# The single canonical env var — keep naming explicit and consistent.
_EXPECTED_ENV_VAR = "SPRING_BOOT_BASE_URL"


def get_spring_boot_base_url() -> Optional[str]:
    """Resolve the Spring Boot base URL from configuration.

    Returns normalized URL without trailing slash, or None if not configured / blank.
    Handles blank/whitespace as missing.
    """
    settings = get_settings()
    url = settings.spring_boot_base_url
    if url is None:
        return None
    normalized = url.strip()
    if not normalized:
        return None
    return normalized.rstrip("/")


def _resolve_base_url_for_client() -> str:
    """Resolve base URL for httpx client, falling back to localhost only for local dev."""
    url = get_spring_boot_base_url()
    if url:
        return url
    # Explicit fallback with warning — production must set SPRING_BOOT_BASE_URL.
    # Do not log secrets; only log the fallback URL which is not sensitive.
    logger.warning(
        "%s not configured — falling back to %s (set %s to the deployed Spring Boot URL in production)",
        _EXPECTED_ENV_VAR,
        _DEFAULT_LOCAL_BASE_URL,
        _EXPECTED_ENV_VAR,
    )
    return _DEFAULT_LOCAL_BASE_URL


async def get_client() -> httpx.AsyncClient:
    """Get or create the shared HTTP client for Spring Boot communication."""
    global _client
    resolved = _resolve_base_url_for_client()
    # Recreate client if base_url changed (handles config reload in tests / redeploy).
    if _client is not None and not _client.is_closed:
        current_base = str(_client.base_url).rstrip("/")
        if current_base != resolved:
            try:
                await _client.aclose()
            except Exception:
                pass
            _client = None
    if _client is None or _client.is_closed:
        _client = httpx.AsyncClient(
            base_url=resolved,
            headers={"Content-Type": "application/json"},
            timeout=httpx.Timeout(15.0, connect=5.0),
        )
    return _client


async def close_client() -> None:
    """Close the shared HTTP client."""
    global _client
    if _client and not _client.is_closed:
        await _client.aclose()
        _client = None


async def request(
    method: str,
    path: str,
    params: Optional[dict[str, Any]] = None,
) -> dict[str, Any]:
    """Make a request to the Spring Boot backend.

    All requests go through the proxy endpoints which validate the AI service key.
    Returns the JSON response or an error dict.
    """
    settings = get_settings()
    base_url = get_spring_boot_base_url()
    # Clear, actionable error when URL not configured — do not attempt network call with None.
    # In development, allow localhost fallback (via _resolve_base_url_for_client) for convenience.
    if not base_url:
        if settings.environment == "production":
            logger.error(
                "%s not configured — cannot reach Spring Boot for %s %s",
                _EXPECTED_ENV_VAR,
                method,
                path,
            )
            return {"error": f"{_EXPECTED_ENV_VAR} not configured — backend unavailable"}
        # In non-production, fall through to client with localhost fallback; warning already emitted by _resolve_base_url_for_client.

    client = await get_client()

    headers = {}
    if settings.ai_service_api_key:
        headers["X-AI-Service-Key"] = settings.ai_service_api_key

    try:
        response = await client.request(
            method,
            path,
            params=params,
            headers=headers,
        )
        response.raise_for_status()
        return response.json()
    except httpx.TimeoutException:
        logger.error("Spring Boot request timed out: %s %s", method, path)
        return {"error": "Backend request timed out"}
    except httpx.HTTPStatusError as e:
        logger.error(
            "Spring Boot HTTP error: %s %s -> %s",
            method, path, e.response.status_code,
        )
        try:
            return e.response.json()
        except Exception:
            return {"error": f"Backend returned HTTP {e.response.status_code}"}
    except httpx.ConnectError:
        # Never log None; log the resolved (or fallback) URL string.
        display_url = base_url or _resolve_base_url_for_client()
        logger.error("Cannot connect to Spring Boot at %s", display_url)
        return {"error": "Cannot connect to backend service"}
    except Exception as e:
        logger.exception("Unexpected error calling Spring Boot: %s", e)
        return {"error": f"Backend request failed: {e}"}


async def get(path: str, params: Optional[dict[str, Any]] = None) -> dict[str, Any]:
    """GET request to Spring Boot."""
    return await request("GET", path, params=params)

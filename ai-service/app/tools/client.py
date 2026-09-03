"""HTTP client for communicating with the Spring Boot backend."""

import logging
from typing import Any, Optional

import httpx

from app.config import get_settings

logger = logging.getLogger(__name__)

_client: Optional[httpx.AsyncClient] = None


async def get_client() -> httpx.AsyncClient:
    """Get or create the shared HTTP client for Spring Boot communication."""
    global _client
    if _client is None or _client.is_closed:
        settings = get_settings()
        _client = httpx.AsyncClient(
            base_url=settings.spring_boot_base_url or "http://localhost:8080",
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
        logger.error("Cannot connect to Spring Boot at %s", settings.spring_boot_base_url)
        return {"error": "Cannot connect to backend service"}
    except Exception as e:
        logger.exception("Unexpected error calling Spring Boot: %s", e)
        return {"error": f"Backend request failed: {e}"}


async def get(path: str, params: Optional[dict[str, Any]] = None) -> dict[str, Any]:
    """GET request to Spring Boot."""
    return await request("GET", path, params=params)

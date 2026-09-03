"""Tests for AI Service health endpoint."""

import pytest


@pytest.mark.asyncio
async def test_health_endpoint(async_client):
    """Test /health endpoint returns 200 with correct structure."""
    response = await async_client.get("/health")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "UP"
    assert data["service"] == "flight-tracking-ai-service"


@pytest.mark.asyncio
async def test_readiness_endpoint(async_client):
    """Test /health/ready endpoint returns 200."""
    response = await async_client.get("/health/ready")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "READY"
    assert data["service"] == "flight-tracking-ai-service"
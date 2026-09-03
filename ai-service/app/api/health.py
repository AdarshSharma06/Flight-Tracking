"""Health check endpoint."""

from fastapi import APIRouter
from app.config import get_settings

router = APIRouter(tags=["health"])


@router.get("/health")
async def health_check():
    """Health check endpoint."""
    settings = get_settings()
    return {
        "status": "UP",
        "service": settings.service_name,
    }


@router.get("/health/ready")
async def readiness_check():
    """Readiness check endpoint."""
    # Could add database connectivity checks here later
    return {
        "status": "READY",
        "service": "flight-tracking-ai-service",
    }
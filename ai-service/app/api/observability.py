"""Observability API — metrics and recent traces (protected by X-AI-Service-Key via main middleware)."""

from fastapi import APIRouter, Query
from app.observability.tracer import get_metrics, get_recent_events

router = APIRouter(tags=["observability"])


@router.get("/observability/metrics")
async def observability_metrics():
    """Aggregate AI observability metrics.

    Protected by the X-AI-Service-Key middleware for /api/ routes.
    Returns counts, avg latencies, tokens, cost, etc.
    No secrets are exposed.
    """
    return get_metrics()


@router.get("/observability/traces")
async def observability_traces(limit: int = Query(default=50, ge=1, le=200)):
    """Recent observability events (in-memory ring buffer)."""
    return {"events": get_recent_events(limit=limit)}

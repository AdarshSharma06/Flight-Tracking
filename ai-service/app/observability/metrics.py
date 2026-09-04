"""Compatibility shim — metrics exposed via tracer.get_metrics."""

from app.observability.tracer import get_metrics, get_recent_events  # noqa: F401

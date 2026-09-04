"""Request context for observability — contextvars-based, async-safe."""

import contextvars
import uuid
from typing import Optional

# Each async task gets its own value; no global mutable state.
_request_id_ctx: contextvars.ContextVar[Optional[str]] = contextvars.ContextVar("request_id", default=None)
_trace_id_ctx: contextvars.ContextVar[Optional[str]] = contextvars.ContextVar("trace_id", default=None)
# Per-request event buffer (list) stored in contextvar for isolation.
_events_ctx: contextvars.ContextVar[Optional[list]] = contextvars.ContextVar("request_events", default=None)


def get_request_id() -> Optional[str]:
    return _request_id_ctx.get()


def set_request_id(request_id: str) -> None:
    _request_id_ctx.set(request_id)
    _trace_id_ctx.set(request_id)


def clear_request_id() -> None:
    _request_id_ctx.set(None)
    _trace_id_ctx.set(None)
    _events_ctx.set(None)


def generate_request_id() -> str:
    return str(uuid.uuid4())


def get_trace_id() -> Optional[str]:
    return _trace_id_ctx.get()


def get_or_create_request_id(incoming: Optional[str] = None) -> str:
    """Return incoming if present, otherwise generate. Also sets contextvars."""
    rid = incoming.strip() if incoming and incoming.strip() else generate_request_id()
    set_request_id(rid)
    return rid


def get_request_events() -> Optional[list]:
    return _events_ctx.get()


def set_request_events(events: list) -> None:
    _events_ctx.set(events)


def append_request_event(event) -> None:
    buf = _events_ctx.get()
    if buf is not None:
        buf.append(event)

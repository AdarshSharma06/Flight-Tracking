"""Tracer — in-process event recording and metrics aggregation (no external SaaS)."""

import time
import threading
import logging
from typing import Optional, Any
from collections import deque, defaultdict

from app.observability.context import get_request_id, get_request_events, set_request_events, append_request_event
from app.observability.events import ObservabilityEvent

logger = logging.getLogger(__name__)

# Global ring buffer for recent events (for metrics endpoint)
_MAX_EVENTS = 5000
_global_events: deque = deque(maxlen=_MAX_EVENTS)
_global_lock = threading.Lock()

# Aggregate counters (in-memory, process-local)
_counters: dict[str, int] = defaultdict(int)
_counters_lock = threading.Lock()


def _now() -> float:
    return time.time()


def _mono() -> float:
    return time.perf_counter()


def init_request(request_id: str) -> None:
    """Initialize per-request event buffer (call at request start).

    Idempotent — if a buffer already exists for this context, it is retained.
    This prevents middleware → service handoff from erasing request_started.
    """
    if get_request_events() is None:
        set_request_events([])


def ensure_request_context(request_id: Optional[str] = None) -> str:
    """Ensure a request ID and event buffer exist (for direct unit-test calls).

    If context already has a request ID/buffer (middleware case), it is preserved.
    Otherwise a new ID is generated and a fresh buffer is created.
    Returns the effective request ID.
    """
    from app.observability.context import get_request_id, set_request_id, get_or_create_request_id
    existing = get_request_id()
    if existing:
        if get_request_events() is None:
            set_request_events([])
        return existing
    # No context — create one (direct invocation)
    rid = get_or_create_request_id(request_id)
    if get_request_events() is None:
        set_request_events([])
    return rid


def get_events_for_request(request_id: Optional[str] = None) -> list[ObservabilityEvent]:
    buf = get_request_events()
    return list(buf) if buf is not None else []


def emit(event: ObservabilityEvent) -> None:
    """Record event to per-request buffer + global ring + structured log (no secrets)."""
    # Per-request isolation
    try:
        append_request_event(event)
    except Exception:
        pass
    with _global_lock:
        _global_events.append(event)
    # Metrics counters
    with _counters_lock:
        _counters["total_events"] += 1
        _counters[f"event:{event.event_type}"] += 1
        if event.status == "failure":
            _counters["failures"] += 1
        if event.event_type == "request_started":
            _counters["request_count"] += 1
        if event.event_type == "tool_started":
            _counters["tool_call_count"] += 1
        if event.event_type == "llm_completed":
            _counters["llm_call_count"] += 1
        if event.event_type == "rag_retrieval":
            _counters["rag_count"] += 1
        if event.event_type == "agent_step":
            _counters["agent_step_count"] += 1
        if event.event_type == "guardrail_decision" and event.status == "BLOCK":
            _counters["guardrail_block_count"] += 1
    # Structured log suitable for Render (no secrets)
    try:
        logger.info(event.to_log_line())
    except Exception:
        pass


def start_timer() -> float:
    return _mono()


def elapsed_ms(start: float) -> float:
    return (_mono() - start) * 1000.0


def record_request_started(request_id: str, operation: str, route: Optional[str] = None) -> None:
    emit(ObservabilityEvent(
        request_id=request_id,
        event_type="request_started",
        operation=operation,
        component="router",
        metadata={"route": route} if route else {},
    ))


def record_request_completed(request_id: str, operation: str, duration_ms: float, status: str = "success", **meta) -> None:
    emit(ObservabilityEvent(
        request_id=request_id,
        event_type="request_completed",
        operation=operation,
        duration_ms=duration_ms,
        status=status,
        metadata=meta,
    ))


def record_request_failed(request_id: str, operation: str, duration_ms: float, error_category: str = "unknown") -> None:
    emit(ObservabilityEvent(
        request_id=request_id,
        event_type="request_failed",
        operation=operation,
        duration_ms=duration_ms,
        status="failure",
        error_category=error_category,
    ))


def record_llm_started(request_id: str, model: Optional[str] = None, provider: Optional[str] = None, prompt_version: Optional[str] = None) -> None:
    emit(ObservabilityEvent(
        request_id=request_id,
        event_type="llm_started",
        operation="llm",
        component="llm",
        metadata={"model": model, "provider": provider, "prompt_version": prompt_version},
    ))


def record_llm_completed(request_id: str, model: Optional[str], duration_ms: float, success: bool,
                         prompt_tokens: Optional[int] = None, completion_tokens: Optional[int] = None, total_tokens: Optional[int] = None,
                         estimated_cost: Optional[float] = None, prompt_version: Optional[str] = None) -> None:
    meta: dict[str, Any] = {"model": model, "prompt_version": prompt_version}
    # Distinguish available vs unavailable
    meta["prompt_tokens"] = prompt_tokens if prompt_tokens is not None and prompt_tokens != 0 else ("unavailable" if not prompt_tokens else prompt_tokens)
    meta["completion_tokens"] = completion_tokens if completion_tokens is not None and completion_tokens != 0 else ("unavailable" if not completion_tokens else completion_tokens)
    meta["total_tokens"] = total_tokens if total_tokens is not None and total_tokens != 0 else ("unavailable" if not total_tokens else total_tokens)
    meta["estimated_cost"] = estimated_cost if estimated_cost is not None else "unavailable"
    emit(ObservabilityEvent(
        request_id=request_id,
        event_type="llm_completed",
        operation="llm",
        component="llm",
        duration_ms=duration_ms,
        status="success" if success else "failure",
        metadata=meta,
    ))


def record_tool_started(request_id: str, tool_name: str) -> None:
    emit(ObservabilityEvent(
        request_id=request_id,
        event_type="tool_started",
        operation=tool_name,
        component="tool",
    ))


def record_tool_completed(request_id: str, tool_name: str, duration_ms: float, success: bool, result_size: Optional[int] = None, status: Optional[str] = None) -> None:
    emit(ObservabilityEvent(
        request_id=request_id,
        event_type="tool_completed",
        operation=tool_name,
        component="tool",
        duration_ms=duration_ms,
        status="success" if success else "failure",
        metadata={"result_size": result_size, "result_status": status},
    ))


def record_tool_failed(request_id: str, tool_name: str, duration_ms: float, error_category: str = "tool_error") -> None:
    emit(ObservabilityEvent(
        request_id=request_id,
        event_type="tool_failed",
        operation=tool_name,
        component="tool",
        duration_ms=duration_ms,
        status="failure",
        error_category=error_category,
    ))


def record_rag_retrieval(request_id: str, duration_ms: float, used: bool, chunk_count: int = 0, scores: Optional[list] = None, query_len: Optional[int] = None) -> None:
    meta: dict[str, Any] = {"used": used, "chunk_count": chunk_count}
    if query_len is not None:
        meta["query_len"] = query_len
    if scores is not None:
        meta["scores"] = scores[:5]  # at most 5
    emit(ObservabilityEvent(
        request_id=request_id,
        event_type="rag_retrieval",
        operation="rag",
        component="rag",
        duration_ms=duration_ms,
        status="success",
        metadata=meta,
    ))


def record_agent_step(request_id: str, step_name: str, order: int, duration_ms: float, success: bool, status: Optional[str] = None) -> None:
    emit(ObservabilityEvent(
        request_id=request_id,
        event_type="agent_step",
        operation=step_name,
        component="agent",
        duration_ms=duration_ms,
        status="success" if success else "failure",
        metadata={"order": order, "step_status": status},
    ))


def record_guardrail_decision(request_id: str, stage: str, decision: str, violation_category: Optional[str] = None, duration_ms: Optional[float] = None) -> None:
    # decision: PASS / BLOCK / SANITIZE
    meta = {"stage": stage, "decision": decision}
    if violation_category:
        meta["violation_category"] = violation_category
    emit(ObservabilityEvent(
        request_id=request_id,
        event_type="guardrail_decision",
        operation=f"guardrail:{stage}",
        component="guardrail",
        duration_ms=duration_ms,
        status=decision,
        metadata=meta,
    ))


def record_router_decision(request_id: str, decision: str, reason: Optional[str] = None) -> None:
    emit(ObservabilityEvent(
        request_id=request_id,
        event_type="router_decision",
        operation="router",
        component="router",
        status=decision,
        metadata={"reason": reason} if reason else {},
    ))


def get_metrics() -> dict:
    with _counters_lock:
        c = dict(_counters)
    with _global_lock:
        events = list(_global_events)
    # Compute avg latencies from global events
    def avg(event_type: str) -> Optional[float]:
        vals = [e.duration_ms for e in events if e.event_type == event_type and e.duration_ms is not None]
        return round(sum(vals) / len(vals), 2) if vals else None

    total_tokens = sum(
        (e.metadata.get("total_tokens") for e in events if e.event_type == "llm_completed" and isinstance(e.metadata.get("total_tokens"), int)),
        0
    )
    cost_vals = [e.metadata.get("estimated_cost") for e in events if e.event_type == "llm_completed" and isinstance(e.metadata.get("estimated_cost"), float)]
    total_cost = round(sum(cost_vals), 6) if cost_vals else ("unavailable" if not cost_vals else 0)

    return {
        "request_count": c.get("request_count", 0),
        "success_count": sum(1 for e in events if e.event_type == "request_completed" and e.status == "success"),
        "failure_count": sum(1 for e in events if e.event_type in ("request_failed",) or (e.event_type == "request_completed" and e.status == "failure")),
        "total_events": c.get("total_events", 0),
        "average_request_latency_ms": avg("request_completed"),
        "average_llm_latency_ms": avg("llm_completed"),
        "average_tool_latency_ms": avg("tool_completed"),
        "average_rag_latency_ms": avg("rag_retrieval"),
        "tool_call_count": c.get("tool_call_count", 0),
        "llm_call_count": c.get("llm_call_count", 0),
        "rag_count": c.get("rag_count", 0),
        "agent_step_count": c.get("agent_step_count", 0),
        "guardrail_block_count": c.get("guardrail_block_count", 0),
        "total_tokens": total_tokens if total_tokens else "unavailable" if not any(isinstance(e.metadata.get("total_tokens"), int) for e in events if e.event_type == "llm_completed") else total_tokens,
        "total_estimated_cost": total_cost,
    }


def get_recent_events(limit: int = 100) -> list[dict]:
    with _global_lock:
        evts = list(_global_events)[-limit:]
    return [e.to_dict() for e in evts]


def clear_all() -> None:
    """For tests only."""
    with _global_lock:
        _global_events.clear()
    with _counters_lock:
        _counters.clear()

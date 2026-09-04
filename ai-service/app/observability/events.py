"""Structured observability events — no secrets."""

from dataclasses import dataclass, field, asdict
from typing import Optional, Any
import time


@dataclass
class ObservabilityEvent:
    """Single observability event.

    Secrets must never be placed in `metadata`.
    """
    request_id: str
    event_type: str  # request_started, request_completed, request_failed, router_decision, llm_started, llm_completed, tool_started, tool_completed, tool_failed, rag_retrieval, agent_step, guardrail_decision
    timestamp: float = field(default_factory=lambda: time.time())
    operation: Optional[str] = None  # component / operation name
    component: Optional[str] = None  # chat, atc, recommendation, rag, tool, guardrail, agent, llm, memory, mcp
    duration_ms: Optional[float] = None
    status: Optional[str] = None  # success, failure, blocked, pass, sanitized
    error_category: Optional[str] = None  # safe error category, no exception class to user
    metadata: dict = field(default_factory=dict)  # safe, non-secret fields only

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)

    def to_log_line(self) -> str:
        parts = [f"event={self.event_type}", f"request_id={self.request_id}"]
        if self.operation:
            parts.append(f"operation={self.operation}")
        if self.component:
            parts.append(f"component={self.component}")
        if self.duration_ms is not None:
            parts.append(f"duration_ms={self.duration_ms:.2f}")
        if self.status:
            parts.append(f"status={self.status}")
        if self.error_category:
            parts.append(f"error_category={self.error_category}")
        for k, v in self.metadata.items():
            # Ensure no secret keys leak (defense-in-depth)
            if k.lower() in ("api_key", "authorization", "password", "token", "secret", "jwt"):
                continue
            parts.append(f"{k}={v}")
        return " ".join(parts)

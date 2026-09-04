"""Evaluation case and result models for AI-9."""

from dataclasses import dataclass, field, asdict
from enum import Enum
from typing import Optional, Any
import uuid


class Category(str, Enum):
    RAG = "RAG"
    TOOL = "TOOL"
    AGENT = "AGENT"
    GUARDRAIL = "GUARDRAIL"


@dataclass
class EvaluationCase:
    """Structured evaluation case.

    Categories:
      - RAG: aviation knowledge question
      - TOOL: question requiring tool selection
      - AGENT: natural language recommendation request
      - GUARDRAIL: input/output that should be blocked or passed
    """
    id: str
    category: str  # Category value
    input: str  # question / user message / LLM output (for grounding)
    description: str = ""
    # Expected behavior
    expected_answer_keywords: list[str] = field(default_factory=list)
    expected_topics: list[str] = field(default_factory=list)
    expected_sources: list[str] = field(default_factory=list)
    expected_tools: list[str] = field(default_factory=list)
    expected_should_use_rag: Optional[bool] = None
    expected_guardrail: Optional[str] = None  # "BLOCK" or "PASS"
    expected_agent_success: Optional[bool] = None
    grounding_context: Optional[dict] = None  # for hallucination checks
    metadata: dict = field(default_factory=dict)
    tags: list[str] = field(default_factory=list)

    def validate(self) -> list[str]:
        errors = []
        if not self.id:
            errors.append("id is required")
        if self.category not in [c.value for c in Category]:
            errors.append(f"invalid category: {self.category}")
        if not self.input:
            errors.append("input is required")
        if self.expected_guardrail and self.expected_guardrail not in ("BLOCK", "PASS"):
            errors.append("expected_guardrail must be BLOCK or PASS")
        return errors


@dataclass
class EvaluationResult:
    """Per-case evaluation result."""
    case_id: str
    category: str
    input: str
    expected: dict
    actual: dict
    passed: bool
    metrics: dict = field(default_factory=dict)
    failure_reason: Optional[str] = None
    raw: dict = field(default_factory=dict)


@dataclass
class CategoryReport:
    category: str
    total: int = 0
    passed: int = 0
    failed: int = 0
    pass_rate: float = 0.0
    metrics: dict = field(default_factory=dict)


@dataclass
class EvaluationReport:
    """Aggregate evaluation report."""
    run_id: str = field(default_factory=lambda: str(uuid.uuid4())[:8])
    total: int = 0
    passed: int = 0
    failed: int = 0
    pass_rate: float = 0.0
    by_category: dict = field(default_factory=dict)  # category -> CategoryReport
    results: list[EvaluationResult] = field(default_factory=list)

    def to_dict(self) -> dict:
        return {
            "run_id": self.run_id,
            "total": self.total,
            "passed": self.passed,
            "failed": self.failed,
            "pass_rate": round(self.pass_rate, 4),
            "by_category": {
                k: asdict(v) if hasattr(v, "__dict__") else v
                for k, v in self.by_category.items()
            },
            "results": [asdict(r) for r in self.results],
        }

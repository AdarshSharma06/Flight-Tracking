"""Guardrail data models."""

from dataclasses import dataclass, field
from enum import Enum
from typing import Optional


class ViolationSeverity(str, Enum):
    BLOCK = "block"
    WARN = "warn"


class ViolationType(str, Enum):
    PROMPT_INJECTION = "prompt_injection"
    SYSTEM_PROMPT_EXTRACTION = "system_prompt_extraction"
    MALICIOUS_INSTRUCTION = "malicious_instruction"
    INPUT_TOO_LONG = "input_too_long"
    INPUT_EMPTY = "input_empty"
    TOOL_ABUSE = "tool_abuse"
    UNKNOWN_TOOL = "unknown_tool"
    SECRET_LEAKAGE = "secret_leakage"
    SYSTEM_PROMPT_LEAKAGE = "system_prompt_leakage"
    FABRICATED_DATA = "fabricated_data"
    UNSUPPORTED_CLAIM = "unsupported_claim"
    INTERNAL_DETAIL_LEAKAGE = "internal_detail_leakage"


@dataclass
class GuardrailViolation:
    """A single guardrail violation detected."""
    violation_type: ViolationType
    severity: ViolationSeverity
    message: str
    detail: Optional[str] = None


@dataclass
class GuardrailResult:
    """Result of a guardrail check."""
    passed: bool
    violations: list[GuardrailViolation] = field(default_factory=list)
    sanitized_text: Optional[str] = None

    @property
    def blocked(self) -> bool:
        return any(v.severity == ViolationSeverity.BLOCK for v in self.violations)

    @property
    def has_warnings(self) -> bool:
        return any(v.severity == ViolationSeverity.WARN for v in self.violations)

    def add_violation(self, violation: GuardrailViolation) -> None:
        self.violations.append(violation)
        if violation.severity == ViolationSeverity.BLOCK:
            self.passed = False

    def to_safe_refusal(self) -> str:
        """Generate a user-safe refusal message."""
        if self.blocked:
            return (
                "I can help with aviation questions, but I can't follow instructions "
                "that attempt to override my operating rules. "
                "Please ask a genuine aviation-related question."
            )
        return ""

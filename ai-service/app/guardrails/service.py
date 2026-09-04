"""Guardrail service — orchestrates input/output guardrails across all AI paths."""

import logging
from typing import Optional

from app.guardrails.input import InputGuardrails
from app.guardrails.output import OutputGuardrails
from app.guardrails.models import (
    GuardrailResult,
    GuardrailViolation,
    ViolationSeverity,
    ViolationType,
)

logger = logging.getLogger(__name__)


class GuardrailService:
    """Central guardrail service for all AI interactions."""

    def __init__(self):
        self.input_guardrails = InputGuardrails()
        self.output_guardrails = OutputGuardrails()

    def validate_input(self, message: str) -> GuardrailResult:
        """Validate user input before LLM processing."""
        return self.input_guardrails.validate(message)

    def validate_output(
        self,
        text: str,
        has_tool_data: bool = False,
        has_rag_data: bool = False,
        is_atc_explanation: bool = False,
        grounding_context: Optional[dict] = None,
    ) -> GuardrailResult:
        """Validate LLM output before returning to user."""
        return self.output_guardrails.validate(
            text,
            has_tool_data=has_tool_data,
            has_rag_data=has_rag_data,
            is_atc_explanation=is_atc_explanation,
            grounding_context=grounding_context,
        )

    def validate_tool_call(self, tool_name: str, tool_names: list[str]) -> Optional[GuardrailViolation]:
        """Validate that a tool call targets a registered tool."""
        if tool_name not in tool_names:
            return GuardrailViolation(
                violation_type=ViolationType.UNKNOWN_TOOL,
                severity=ViolationSeverity.BLOCK,
                message=f"Tool '{tool_name}' is not registered.",
                detail=f"Available tools: {', '.join(tool_names)}",
            )
        return None

    def validate_tool_result(self, tool_result: str) -> str:
        """Validate tool result is treated as data, not instructions.

        Tool results are external data that should not override system instructions.
        We scan for obvious injection attempts in tool output.
        """
        if not tool_result:
            return tool_result

        # Check for injection patterns in tool output
        from app.guardrails.policies import PROMPT_INJECTION_PATTERNS, MALICIOUS_INSTRUCTION_PATTERNS

        for pattern in PROMPT_INJECTION_PATTERNS + MALICIOUS_INSTRUCTION_PATTERNS:
            if pattern.search(tool_result):
                logger.warning(
                    "Suspicious content detected in tool result, treating as data only"
                )
                # Don't block — tool results are always data, just log the warning
                break

        return tool_result

    def get_safe_refusal(self, result: GuardrailResult) -> str:
        """Generate a safe refusal message for blocked requests."""
        if not result.blocked:
            return ""

        # Determine the most appropriate refusal
        violation_types = [v.violation_type for v in result.violations]

        if ViolationType.PROMPT_INJECTION in violation_types:
            return (
                "I can help with aviation questions, but I can't follow instructions "
                "that attempt to override my operating rules. "
                "Please ask a genuine aviation-related question."
            )

        if ViolationType.SYSTEM_PROMPT_EXTRACTION in violation_types:
            return (
                "I can't provide hidden system instructions or internal configuration. "
                "I'm here to help with aviation questions. What would you like to know?"
            )

        if ViolationType.MALICIOUS_INSTRUCTION in violation_types:
            return (
                "I can only assist with legitimate aviation-related questions. "
                "I can't follow instructions that attempt to bypass my safety guidelines."
            )

        if ViolationType.INPUT_EMPTY in violation_types:
            return "Please provide a message so I can help you with aviation questions."

        if ViolationType.INPUT_TOO_LONG in violation_types:
            return "Your message is too long. Please shorten it and try again."

        if ViolationType.UNSUPPORTED_CLAIM in violation_types or ViolationType.FABRICATED_DATA in violation_types:
            return (
                "I don't have verified live data for that specific detail, so I can't provide "
                "a confirmed value. The available data for that field is unavailable or unverified. "
                "Please check the flight data dashboard for authoritative information."
            )

        # Generic safe refusal
        return (
            "I can help with aviation questions, but I can't follow instructions "
            "that attempt to override my operating rules."
        )


# Module-level singleton
guardrail_service = GuardrailService()

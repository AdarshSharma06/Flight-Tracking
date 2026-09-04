"""Input guardrails — validates user input before it reaches the LLM."""

import logging
import re
from typing import Optional

from app.guardrails.models import (
    GuardrailResult,
    GuardrailViolation,
    ViolationSeverity,
    ViolationType,
)
from app.guardrails.policies import (
    MALICIOUS_INSTRUCTION_PATTERNS,
    MAX_INPUT_LENGTH,
    PROMPT_INJECTION_PATTERNS,
    SYSTEM_PROMPT_EXTRACTION_PATTERNS,
)

logger = logging.getLogger(__name__)


class InputGuardrails:
    """Validates and sanitizes user input before LLM processing."""

    def validate(self, message: str) -> GuardrailResult:
        """Run all input guardrail checks on a user message.

        Returns a GuardrailResult. If passed is False, the message should be
        refused with a safe response. If only warnings, the message may proceed
        but with awareness.
        """
        result = GuardrailResult(passed=True)

        # 1. Empty/whitespace check
        if not message or not message.strip():
            result.add_violation(GuardrailViolation(
                violation_type=ViolationType.INPUT_EMPTY,
                severity=ViolationSeverity.BLOCK,
                message="Input is empty or contains only whitespace.",
            ))
            return result

        # 2. Length check
        if len(message) > MAX_INPUT_LENGTH:
            result.add_violation(GuardrailViolation(
                violation_type=ViolationType.INPUT_TOO_LONG,
                severity=ViolationSeverity.BLOCK,
                message=f"Input exceeds maximum length of {MAX_INPUT_LENGTH} characters.",
            ))
            return result

        # 3. Prompt injection detection
        injection_result = self._check_prompt_injection(message)
        if injection_result:
            result.add_violation(injection_result)
            return result

        # 4. System prompt extraction detection
        extraction_result = self._check_system_prompt_extraction(message)
        if extraction_result:
            result.add_violation(extraction_result)
            return result

        # 5. Malicious instruction detection
        malicious_result = self._check_malicious_instructions(message)
        if malicious_result:
            result.add_violation(malicious_result)
            return result

        return result

    def _check_prompt_injection(self, message: str) -> Optional[GuardrailViolation]:
        """Detect prompt injection attempts."""
        for pattern in PROMPT_INJECTION_PATTERNS:
            match = pattern.search(message)
            if match:
                logger.warning(
                    "Prompt injection detected: '%s' matched pattern '%s'",
                    message[:80],
                    pattern.pattern[:50],
                )
                return GuardrailViolation(
                    violation_type=ViolationType.PROMPT_INJECTION,
                    severity=ViolationSeverity.BLOCK,
                    message="Prompt injection attempt detected.",
                    detail=f"Matched: {match.group()[:50]}",
                )
        return None

    def _check_system_prompt_extraction(self, message: str) -> Optional[GuardrailViolation]:
        """Detect attempts to extract the system prompt."""
        for pattern in SYSTEM_PROMPT_EXTRACTION_PATTERNS:
            match = pattern.search(message)
            if match:
                logger.warning(
                    "System prompt extraction attempt detected: '%s'",
                    message[:80],
                )
                return GuardrailViolation(
                    violation_type=ViolationType.SYSTEM_PROMPT_EXTRACTION,
                    severity=ViolationSeverity.BLOCK,
                    message="System prompt extraction attempt detected.",
                    detail=f"Matched: {match.group()[:50]}",
                )
        return None

    def _check_malicious_instructions(self, message: str) -> Optional[GuardrailViolation]:
        """Detect malicious instruction attempts."""
        for pattern in MALICIOUS_INSTRUCTION_PATTERNS:
            match = pattern.search(message)
            if match:
                logger.warning(
                    "Malicious instruction detected: '%s'",
                    message[:80],
                )
                return GuardrailViolation(
                    violation_type=ViolationType.MALICIOUS_INSTRUCTION,
                    severity=ViolationSeverity.BLOCK,
                    message="Potentially malicious instruction detected.",
                    detail=f"Matched: {match.group()[:50]}",
                )
        return None


# Convenience function
def validate_input(message: str) -> GuardrailResult:
    """Validate a user input message through all input guardrails."""
    guardrails = InputGuardrails()
    return guardrails.validate(message)

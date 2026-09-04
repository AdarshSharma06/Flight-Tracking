"""Output guardrails — validates and sanitizes LLM output before returning to user."""

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
    FABRICATED_DATA_PATTERNS,
    GROUNDING_CLAIM_PATTERNS,
    INTERNAL_DETAIL_PATTERNS,
    SECRET_PATTERNS,
)

logger = logging.getLogger(__name__)


class OutputGuardrails:
    """Validates and sanitizes LLM output before returning to the user."""

    def validate(
        self,
        text: str,
        has_tool_data: bool = False,
        has_rag_data: bool = False,
        is_atc_explanation: bool = False,
        grounding_context: Optional[dict] = None,
    ) -> GuardrailResult:
        """Run all output guardrail checks on LLM response text.

        Args:
            text: The LLM response text to validate.
            has_tool_data: Whether tool results were used in generating this response.
            has_rag_data: Whether RAG context was used.
            is_atc_explanation: Whether this is an ATC explanation response.
            grounding_context: Optional dict mapping field names to actual values.
                A value of None means the field is unavailable — any claim about
                it in the output is an unsupported hallucination.
                A numeric value enables mismatch detection (e.g., altitude 10000
                but output claims 35000).
        """
        result = GuardrailResult(passed=True)

        if not text:
            return result

        # 1. Secret leakage check
        secret_violations = self._check_secret_leakage(text)
        for v in secret_violations:
            result.add_violation(v)

        # 2. Internal detail leakage check
        internal_violations = self._check_internal_details(text)
        for v in internal_violations:
            result.add_violation(v)

        # 3. System prompt leakage check
        prompt_leak = self._check_system_prompt_leakage(text)
        if prompt_leak:
            result.add_violation(prompt_leak)

        # 4. Grounding check — compares output claims against structured data
        if grounding_context:
            grounding_violations = self._check_grounding(text, grounding_context)
            for v in grounding_violations:
                result.add_violation(v)

        # 5. Legacy fabricated-data pattern check
        # Only as standalone defense when no grounding context is supplied,
        # or when grounding confirms live is unavailable. If live is
        # explicitly available, position claims are legitimate and not fabricated.
        should_check_fabricated = True
        if grounding_context is not None:
            live_val = grounding_context.get("live")
            if live_val is not None and live_val is not False:
                should_check_fabricated = False
        if should_check_fabricated:
            fabricated = self._check_fabricated_patterns(text)
            if fabricated:
                result.add_violation(fabricated)

        # 6. Sanitize / flag
        if result.violations:
            result.sanitized_text = self._sanitize_text(text)
            logger.warning(
                "Output guardrail violations detected: %s",
                [v.violation_type.value for v in result.violations],
            )
        else:
            result.sanitized_text = text

        return result

    def _check_secret_leakage(self, text: str) -> list[GuardrailViolation]:
        """Detect API keys, credentials, and other secrets in the text."""
        violations = []
        for pattern in SECRET_PATTERNS:
            match = pattern.search(text)
            if match:
                violations.append(GuardrailViolation(
                    violation_type=ViolationType.SECRET_LEAKAGE,
                    severity=ViolationSeverity.BLOCK,
                    message="Potential secret or credential detected in response.",
                ))
                break
        return violations

    def _check_internal_details(self, text: str) -> list[GuardrailViolation]:
        """Detect internal exception details, hostnames, file paths."""
        violations = []
        for pattern in INTERNAL_DETAIL_PATTERNS:
            match = pattern.search(text)
            if match:
                violations.append(GuardrailViolation(
                    violation_type=ViolationType.INTERNAL_DETAIL_LEAKAGE,
                    severity=ViolationSeverity.BLOCK,
                    message="Internal implementation detail detected in response.",
                ))
                break
        return violations

    def _check_system_prompt_leakage(self, text: str) -> Optional[GuardrailViolation]:
        """Detect if the response appears to contain the system prompt."""
        # Check for common system prompt fragments that shouldn't appear in responses
        suspicious_fragments = [
            "You are an aviation assistant for a flight tracking application",
            "You help users with aviation knowledge, flight information",
            "RULES FOR LIVE DATA",
            "GENERAL AVIATION KNOWLEDGE",
            "RETRIEVED AVIATION KNOWLEDGE",
            "CAPABILITIES:",
            "You have access to live flight data tools",
            "ATC (Air Traffic Control) anomaly explanation assistant",
            "Your role is to explain an anomaly that has ALREADY been detected",
            "CRITICAL RULES:",
        ]

        for fragment in suspicious_fragments:
            if fragment.lower() in text.lower():
                return GuardrailViolation(
                    violation_type=ViolationType.SYSTEM_PROMPT_LEAKAGE,
                    severity=ViolationSeverity.BLOCK,
                    message="System prompt content detected in response.",
                )
        return None

    def _check_grounding(
        self, text: str, grounding_context: dict
    ) -> list[GuardrailViolation]:
        """Compare output claims against structured grounding data.

        For each field in grounding_context:
        - If value is None / False (unavailable) and output contains a claim
          pattern for that field → UNSUPPORTED_CLAIM violation.
        - If value is numeric and output contains a numeric claim for that
          field with a contradicting number → UNSUPPORTED_CLAIM violation.
        """
        violations: list[GuardrailViolation] = []

        for field, actual_value in grounding_context.items():
            patterns = GROUNDING_CLAIM_PATTERNS.get(field)
            if not patterns:
                continue

            # Check if the field is considered "unavailable"
            # None, False, or explicit "unavailable" markers
            is_unavailable = actual_value is None or actual_value is False

            if is_unavailable:
                # Any claim about an unavailable field is a hallucination
                for pattern in patterns:
                    if pattern.search(text):
                        violations.append(GuardrailViolation(
                            violation_type=ViolationType.UNSUPPORTED_CLAIM,
                            severity=ViolationSeverity.BLOCK,
                            message=f"Unsupported claim about '{field}': field is unavailable but output asserts a value.",
                            detail=pattern.pattern[:80],
                        ))
                        logger.warning(
                            "Grounding violation: field '%s' is unavailable but output matched '%s'",
                            field, pattern.pattern[:60],
                        )
                        break
            else:
                # Field has an actual numeric value — detect contradicting numeric claims
                # Only for numeric fields (altitude, speed, heading, windSpeed, temperature, price, delay_probability)
                numeric_fields = {"altitude", "speed", "heading", "windSpeed", "temperature", "price", "delay_probability"}
                if field in numeric_fields and isinstance(actual_value, (int, float)):
                    claimed_numbers = self._extract_claimed_numbers(text, field)
                    for num in claimed_numbers:
                        # Allow small rounding tolerance; flag clear contradictions
                        if abs(num - float(actual_value)) > max(1.0, abs(float(actual_value)) * 0.05):
                            violations.append(GuardrailViolation(
                                violation_type=ViolationType.UNSUPPORTED_CLAIM,
                                severity=ViolationSeverity.BLOCK,
                                message=(
                                    f"Contradicting claim about '{field}': actual value is {actual_value} "
                                    f"but output claims {num}."
                                ),
                                detail=f"actual={actual_value}, claimed={num}",
                            ))
                            logger.warning(
                                "Grounding mismatch: field '%s' actual=%s claimed=%s",
                                field, actual_value, num,
                            )
                            break

        return violations

    def _extract_claimed_numbers(self, text: str, field: str) -> list[float]:
        """Extract numeric values claimed for a specific field from text."""
        import re as _re

        numbers: list[float] = []
        # Field-anchored extraction: look for the field name near a number
        field_keywords = {
            "altitude": [r"altitude", r"flying\s+at", r"at\s+\d+.*feet"],
            "speed": [r"speed"],
            "heading": [r"heading", r"direction"],
            "windSpeed": [r"wind"],
            "temperature": [r"temperature", r"°C"],
            "price": [r"₹", r"Rs\.?", r"price", r"costs?", r"\$"],
            "delay_probability": [r"delay", r"probability", r"%"],
        }
        keywords = field_keywords.get(field, [])

        # Extract numbers that appear near field keywords
        for kw in keywords:
            # Pattern: keyword ... number  OR  number ... keyword
            for m in _re.finditer(r"(\d[\d,]*\.?\d*)", text):
                num_str = m.group(1).replace(",", "")
                try:
                    num = float(num_str)
                except ValueError:
                    continue
                # Check proximity: is keyword within 40 chars of the number?
                start = max(0, m.start() - 40)
                end = min(len(text), m.end() + 40)
                window = text[start:end]
                if _re.search(kw, window, _re.IGNORECASE):
                    numbers.append(num)

        return numbers

    def _check_fabricated_patterns(self, text: str) -> Optional[GuardrailViolation]:
        """Check legacy fabricated-data patterns (defense-in-depth)."""
        for pattern in FABRICATED_DATA_PATTERNS:
            if pattern.search(text):
                return GuardrailViolation(
                    violation_type=ViolationType.FABRICATED_DATA,
                    severity=ViolationSeverity.BLOCK,
                    message="Potential fabricated live-position data detected.",
                    detail=pattern.pattern[:80],
                )
        return None

    def _sanitize_text(self, text: str) -> str:
        """Remove or mask sensitive content from the text."""
        sanitized = text

        # Mask API keys
        for pattern in SECRET_PATTERNS:
            sanitized = pattern.sub("[REDACTED]", sanitized)

        # Mask internal details
        for pattern in INTERNAL_DETAIL_PATTERNS:
            sanitized = pattern.sub("[REDACTED]", sanitized)

        # Redact unsupported grounding claims — replace hallucinated values
        # with a safe unavailable-data marker.
        for field, patterns in GROUNDING_CLAIM_PATTERNS.items():
            for pattern in patterns:
                sanitized = pattern.sub("[UNAVAILABLE — not in source data]", sanitized)

        # Also redact legacy fabricated-data patterns
        for pattern in FABRICATED_DATA_PATTERNS:
            sanitized = pattern.sub("[UNAVAILABLE — not in source data]", sanitized)

        return sanitized


def validate_output(
    text: str,
    has_tool_data: bool = False,
    has_rag_data: bool = False,
    is_atc_explanation: bool = False,
    grounding_context: Optional[dict] = None,
) -> GuardrailResult:
    """Validate LLM output through all output guardrails."""
    guardrails = OutputGuardrails()
    return guardrails.validate(
        text,
        has_tool_data=has_tool_data,
        has_rag_data=has_rag_data,
        is_atc_explanation=is_atc_explanation,
        grounding_context=grounding_context,
    )

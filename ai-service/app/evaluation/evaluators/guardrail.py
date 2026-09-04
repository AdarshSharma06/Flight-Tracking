"""Guardrail evaluator — reuses actual AI-8 guardrail interfaces."""

from app.evaluation.models import EvaluationCase, EvaluationResult
from app.evaluation.metrics import guardrail_success
from app.guardrails import guardrail_service
from app.guardrails.models import ViolationType


async def evaluate_guardrail(case: EvaluationCase) -> EvaluationResult:
    """Evaluate guardrail behavior for a case.

    Cases are either:
      - input guardrail (prompt injection / extraction) — checked via validate_input
      - output guardrail (fabrication / secret / internal) — checked via validate_output with grounding_context
      - tool abuse — unknown tool name
    """
    expected = case.expected_guardrail or "PASS"
    grounding = case.grounding_context

    actual_blocked = False
    detail = ""
    violation_types: list[str] = []

    # Secret / internal patterns are treated as output guardrail checks
    is_secret_case = "secret" in case.tags
    is_internal_case = "internal" in case.tags
    is_fabrication_case = grounding is not None
    is_input_attack = "prompt-injection" in case.tags or "extraction" in case.tags or "role-hijack" in case.tags

    # Also detect prompt injection via input path
    # For fabrication/hallucination cases, use output guardrail with grounding
    if is_fabrication_case or is_secret_case or is_internal_case:
        result = guardrail_service.validate_output(case.input, grounding_context=grounding)
        actual_blocked = result.blocked
        violation_types = [v.violation_type.value for v in result.violations]
        detail = f"output violations: {violation_types}"
        # Also check fabricated-data legacy pattern via grounding-aware path already
        raw = {"sanitized": result.sanitized_text, "violations": violation_types}
    elif is_input_attack:
        result = guardrail_service.validate_input(case.input)
        actual_blocked = result.blocked
        violation_types = [v.violation_type.value for v in result.violations]
        detail = f"input violations: {violation_types}"
        raw = {"violations": violation_types}
    elif "benign" in case.tags:
        # Benign should pass both input and output checks
        inp = guardrail_service.validate_input(case.input)
        out = guardrail_service.validate_output(case.input, grounding_context=grounding)
        actual_blocked = inp.blocked or out.blocked
        violation_types = [v.violation_type.value for v in inp.violations + out.violations]
        detail = f"benign check: input blocked={inp.blocked} output blocked={out.blocked}"
        raw = {"input_violations": [v.violation_type.value for v in inp.violations], "output_violations": [v.violation_type.value for v in out.violations]}
    else:
        # Default: treat as output guardrail
        result = guardrail_service.validate_output(case.input, grounding_context=grounding)
        actual_blocked = result.blocked
        violation_types = [v.violation_type.value for v in result.violations]
        detail = f"output violations: {violation_types}"
        raw = {"violations": violation_types}

    score = guardrail_success(expected, actual_blocked)
    passed = score == 1.0
    failure = None if passed else f"Guardrail mismatch: expected {expected} but got {'BLOCK' if actual_blocked else 'PASS'} ({detail})"

    # Also handle tool abuse case if input mentions tool name? (not in current dataset, but support)
    if "tool" in case.tags and not grounding:
        # Unknown tool case: validate_tool_call
        # Use metadata expected_tools to simulate
        pass

    metrics = {
        "guardrail_success": score,
        "correctness": score,
    }

    return EvaluationResult(
        case_id=case.id,
        category=case.category,
        input=case.input,
        expected={"expected_guardrail": expected, "grounding_context": grounding},
        actual={"actual_blocked": actual_blocked, "violation_types": violation_types, "detail": detail},
        passed=passed,
        metrics=metrics,
        failure_reason=failure,
        raw=raw,
    )

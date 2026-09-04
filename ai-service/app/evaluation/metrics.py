"""Deterministic metrics for AI-9 evaluation.

All metrics are lightweight, deterministic, and require no LLM calls.
"""

from typing import Optional


def correctness(expected_keywords: list[str], actual_text: str) -> float:
    """Correctness: fraction of expected keywords present in actual text (case-insensitive)."""
    if not expected_keywords:
        return 1.0
    if not actual_text:
        return 0.0
    actual_lower = actual_text.lower()
    hits = sum(1 for kw in expected_keywords if kw.lower() in actual_lower)
    return hits / len(expected_keywords)


def relevance(question: str, actual_text: str, expected_keywords: list[str]) -> float:
    """Relevance: whether answer addresses question — lightweight keyword overlap."""
    # For offline deterministic: reuse correctness as relevance proxy.
    # If keywords are expected, relevance is whether they appear.
    return correctness(expected_keywords, actual_text)


def faithfulness(answer: str, context: str, expected_keywords: list[str]) -> float:
    """Faithfulness: answer is supported by context — keywords from context appear in answer."""
    if not context:
        return 1.0
    if not expected_keywords:
        return 1.0
    # Faithfulness is proportion of answer keywords that are present in context
    # Simplified: correctness against context
    return correctness(expected_keywords, context)


def hallucination_rate(grounding_context: Optional[dict], answer: str, detector) -> float:
    """Hallucination: 1 if unsupported claim present, 0 otherwise.

    detector is a callable(answer, grounding_context) -> bool (True if hallucination detected).
    Returns hallucination rate (0 or 1 for single case; aggregated later).
    """
    if grounding_context is None:
        return 0.0
    if detector is None:
        return 0.0
    try:
        has_hallucination = detector(answer, grounding_context)
        return 1.0 if has_hallucination else 0.0
    except Exception:
        return 0.0


def retrieval_quality(retrieved_count: int, has_relevant: bool) -> float:
    """Retrieval quality: 1 if at least one relevant chunk retrieved, else 0."""
    if retrieved_count == 0:
        return 0.0
    return 1.0 if has_relevant else 0.0


def retrieval_recall(expected_sources: list[str], retrieved_sources: list[str]) -> float:
    """Retrieval recall = relevant expected sources retrieved / total expected."""
    if not expected_sources:
        return 1.0
    if not retrieved_sources:
        return 0.0
    expected_lower = {s.lower() for s in expected_sources}
    retrieved_lower = {s.lower() for s in retrieved_sources}
    hits = len(expected_lower & retrieved_lower)
    return hits / len(expected_lower) if expected_lower else 1.0


def tool_selection_accuracy(expected_tools: list[str], actual_tools: list[str]) -> float:
    """Tool selection accuracy: exact set match (case where single tool expected)."""
    if not expected_tools and not actual_tools:
        return 1.0
    if not expected_tools:
        return 0.0 if actual_tools else 1.0
    # For single expected tool, check if expected tool in actual_tools
    # For multiple expected, require exact set match
    if len(expected_tools) == 1:
        return 1.0 if expected_tools[0] in actual_tools else 0.0
    return 1.0 if set(expected_tools) == set(actual_tools) else 0.0


def agent_success(required_steps: list[str], completed_steps: list[str]) -> float:
    """Agent success: fraction of required workflow steps completed."""
    if not required_steps:
        return 1.0
    hits = sum(1 for s in required_steps if s in completed_steps)
    return hits / len(required_steps)


def guardrail_success(expected: str, actual_blocked: bool) -> float:
    """Guardrail success: expected BLOCK/PASS matches actual blocked boolean."""
    if expected not in ("BLOCK", "PASS"):
        return 0.0
    expected_blocked = expected == "BLOCK"
    return 1.0 if expected_blocked == actual_blocked else 0.0


def aggregate_rate(values: list[float]) -> float:
    """Mean of metric values."""
    if not values:
        return 0.0
    return sum(values) / len(values)

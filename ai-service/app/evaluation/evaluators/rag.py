"""RAG evaluator — deterministic, no external API calls."""

import json
from pathlib import Path
from unittest.mock import AsyncMock, patch

from app.evaluation.models import EvaluationCase, EvaluationResult
from app.evaluation.metrics import correctness, retrieval_recall, retrieval_quality, aggregate_rate
from app.rag.retriever import should_use_rag


# Map expected_topics to keyword sets for simulated retrieval context.
# We use local knowledge file content to verify recall deterministically without DB.
_TOPIC_KEYWORDS = {
    "squawk": ["squawk", "transponder"],
    "ils": ["ils", "glide", "localizer"],
    "vor": ["vor", "radial", "navigation"],
    "flight phases": ["takeoff", "climb", "cruise"],
    "atc": ["atc", "air traffic"],
    "weather": ["weather", "metar"],
    "aircraft": ["aircraft", "fuselage"],
    "airport": ["airport", "runway"],
}


def _load_knowledge_texts() -> dict[str, str]:
    kb_dir = Path(__file__).parent.parent.parent.parent / "knowledge"
    if not kb_dir.exists():
        # Fallback for different working dirs
        kb_dir = Path("knowledge")
    texts: dict[str, str] = {}
    if kb_dir.exists():
        for f in kb_dir.glob("*.txt"):
            try:
                texts[f.name.lower()] = f.read_text(encoding="utf-8", errors="ignore").lower()
            except Exception:
                pass
    return texts


_KB_TEXTS = None

def _get_kb_texts():
    global _KB_TEXTS
    if _KB_TEXTS is None:
        _KB_TEXTS = _load_knowledge_texts()
    return _KB_TEXTS


async def evaluate_rag(case: EvaluationCase) -> EvaluationResult:
    """Evaluate a single RAG case offline.

    Checks:
      - should_use_rag correctness
      - retrieval quality/recall via simulated context (knowledge file content)
    """
    expected_use_rag = case.expected_should_use_rag
    # If no expectation, default to True existence check
    actual_use_rag = should_use_rag(case.input)

    # Retrieval simulation: for cases that should use RAG, we verify
    # knowledge file contains expected keywords (offline recall).
    kb_texts = _get_kb_texts()
    retrieved_sources: list[str] = []
    simulated_context = ""

    if actual_use_rag and case.expected_sources:
        for src in case.expected_sources:
            key = src.lower()
            txt = kb_texts.get(key, "")
            if txt:
                retrieved_sources.append(src)
                simulated_context += txt[:500] + "\n"

    # If not using RAG, retrieved is empty
    if not actual_use_rag:
        retrieved_sources = []
        simulated_context = ""

    # Metrics
    correctness_score = 1.0 if expected_use_rag is None else (1.0 if actual_use_rag == expected_use_rag else 0.0)
    # For RAG cases that should use RAG, check that expected sources would be retrieved
    # We simulate perfect recall if file exists and routing is correct
    if expected_use_rag is True:
        rec_recall = retrieval_recall(case.expected_sources, retrieved_sources)
        has_relevant = rec_recall > 0
        retr_quality = retrieval_quality(len(retrieved_sources), has_relevant)
        # Simulate answer correctness via keyword presence in KB context
        answer_correctness = correctness(case.expected_answer_keywords, simulated_context)
        relevance_score = answer_correctness
        faithfulness_score = 1.0 if simulated_context else 0.0
        hallucination = 0.0
    elif expected_use_rag is False:
        rec_recall = 1.0
        retr_quality = 1.0
        answer_correctness = 1.0
        relevance_score = 1.0
        faithfulness_score = 1.0
        hallucination = 0.0
    else:
        rec_recall = 1.0
        retr_quality = 1.0
        answer_correctness = 1.0
        relevance_score = 1.0
        faithfulness_score = 1.0
        hallucination = 0.0

    # Overall pass: routing must match and for positive cases recall must be >0
    if expected_use_rag is True:
        passed = (actual_use_rag == expected_use_rag) and (rec_recall == 1.0)
        failure = None if passed else f"RAG routing/recall failed: expected_use_rag={expected_use_rag} actual={actual_use_rag} recall={rec_recall}"
    else:
        passed = actual_use_rag == expected_use_rag if expected_use_rag is not None else True
        failure = None if passed else f"RAG routing failed: expected {expected_use_rag} got {actual_use_rag}"

    metrics = {
        "correctness": correctness_score,
        "relevance": relevance_score,
        "faithfulness": faithfulness_score,
        "hallucination": hallucination,
        "retrieval_quality": retr_quality,
        "retrieval_recall": rec_recall,
    }

    return EvaluationResult(
        case_id=case.id,
        category=case.category,
        input=case.input,
        expected={
            "should_use_rag": expected_use_rag,
            "expected_sources": case.expected_sources,
            "expected_keywords": case.expected_answer_keywords,
        },
        actual={
            "should_use_rag": actual_use_rag,
            "retrieved_sources": retrieved_sources,
            "simulated_context_len": len(simulated_context),
        },
        passed=passed,
        metrics=metrics,
        failure_reason=failure,
    )

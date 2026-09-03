"""RAG retrieval pipeline: query → embed → search → context."""

import logging
from typing import Optional

from app.rag.embedding import embed_query
from app.rag.store import search_similar
from app.rag.models import RetrievalResult

logger = logging.getLogger(__name__)


async def retrieve(
    query: str,
    top_k: int = 5,
    similarity_threshold: float = 0.3,
) -> list[RetrievalResult]:
    """Retrieve relevant chunks for a query.

    Args:
        query: User query text.
        top_k: Maximum number of results.
        similarity_threshold: Minimum cosine similarity.

    Returns:
        List of RetrievalResult, sorted by relevance descending.
    """
    if not query or not query.strip():
        return []

    try:
        query_embedding = embed_query(query)
    except Exception as e:
        logger.error("Query embedding failed: %s", e)
        return []

    try:
        results = await search_similar(
            query_embedding=query_embedding,
            top_k=top_k,
            similarity_threshold=similarity_threshold,
        )
    except Exception as e:
        logger.error("Vector search failed: %s", e)
        return []

    logger.debug(
        "Retrieved %d chunks for query '%s...' (threshold=%.2f)",
        len(results),
        query[:50],
        similarity_threshold,
    )
    return results


def format_retrieval_context(results: list[RetrievalResult]) -> str:
    """Format retrieval results into a context string for the LLM.

    Args:
        results: List of RetrievalResult from retrieve().

    Returns:
        Formatted context string, or empty string if no results.
    """
    if not results:
        return ""

    parts = []
    for i, result in enumerate(results, 1):
        source = result.document_title or "Unknown"
        doc_type = result.document_type or ""
        score_pct = int(result.score * 100)
        parts.append(
            f"[{i}] {source} ({doc_type}, relevance: {score_pct}%)\n"
            f"{result.chunk.content}"
        )

    return "\n\n".join(parts)


def should_use_rag(query: str) -> bool:
    """Determine if a query should use RAG retrieval.

    RAG is appropriate for aviation knowledge questions.
    It is NOT appropriate for:
    - Live flight data queries
    - Application-specific queries (bookings, user data)
    - General conversation

    Args:
        query: User query text.

    Returns:
        True if RAG should be used.
    """
    query_lower = query.lower().strip()

    # Knowledge-seeking question patterns
    knowledge_patterns = [
        "what is", "what are", "what does", "what do",
        "explain", "describe", "how does", "how do", "how is",
        "define", "meaning of", "difference between", "types of",
        "tell me about", "tell me about",
    ]

    # Aviation-specific terms (used WITH knowledge patterns)
    aviation_terms = [
        "airport", "aircraft", "airline", "aviation",
        "ils", "vor", "ndb", "localizer", "glide slope",
        "squawk", "transponder", "altitude", "flight level",
        "atc", "air traffic control", "tower", "runway", "taxiway",
        "metar", "taf", "turbulence", "wind shear", "microburst", "icing",
        "ifr", "vfr", "notam", "icao", "iata",
        "regulation", "certificate", "navigation", "waypoint", "airway",
        "airspace", "mayday", "pan-pan",
    ]

    # Must have a knowledge-seeking pattern
    has_knowledge_pattern = any(p in query_lower for p in knowledge_patterns)
    if not has_knowledge_pattern:
        return False

    # Must also mention an aviation term
    return any(t in query_lower for t in aviation_terms)

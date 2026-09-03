"""RAG package — Retrieval-Augmented Generation for aviation knowledge."""

from app.rag.retriever import retrieve, format_retrieval_context, should_use_rag
from app.rag.ingestion import ingest_text, ingest_file, ingest_directory, get_knowledge_base_stats
from app.rag.embedding import embed_query, embed_texts, is_available as embedding_available

__all__ = [
    "retrieve",
    "format_retrieval_context",
    "should_use_rag",
    "ingest_text",
    "ingest_file",
    "ingest_directory",
    "get_knowledge_base_stats",
    "embed_query",
    "embed_texts",
    "embedding_available",
]

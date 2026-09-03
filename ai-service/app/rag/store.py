"""Vector store for RAG using PostgreSQL + pgvector."""

import hashlib
import json
import logging
from typing import Optional
from uuid import UUID, uuid4

import asyncpg

from app.config import get_settings
from app.rag.models import RagDocument, RagChunk, RetrievalResult

logger = logging.getLogger(__name__)

_pool: Optional[asyncpg.Pool] = None


async def get_pool() -> asyncpg.Pool:
    """Get or create the asyncpg connection pool."""
    global _pool
    if _pool is None:
        settings = get_settings()
        dsn = settings.database_url
        if not dsn:
            raise RuntimeError("DATABASE_URL not configured — cannot access RAG store")
        _pool = await asyncpg.create_pool(dsn=dsn, min_size=1, max_size=5)
        logger.info("RAG database pool created")
    return _pool


async def close_pool():
    """Close the connection pool."""
    global _pool
    if _pool:
        await _pool.close()
        _pool = None
        logger.info("RAG database pool closed")


def compute_checksum(content: str) -> str:
    """Compute SHA-256 checksum of content for deduplication."""
    return hashlib.sha256(content.encode("utf-8")).hexdigest()


async def insert_document(doc: RagDocument) -> RagDocument:
    """Insert a RAG document record.

    If a document with the same checksum already exists, returns the existing one.
    """
    pool = await get_pool()

    if doc.checksum:
        existing = await pool.fetchrow(
            "SELECT id, title, source, document_type, language, checksum, metadata "
            "FROM rag_document WHERE checksum = $1",
            doc.checksum,
        )
        if existing:
            logger.info("Document with checksum %s already exists, skipping", doc.checksum)
            return RagDocument(
                id=existing["id"],
                title=existing["title"],
                source=existing["source"],
                document_type=existing["document_type"],
                language=existing["language"],
                checksum=existing["checksum"],
                metadata=json.loads(existing["metadata"]) if existing["metadata"] else {},
            )

    doc_id = doc.id
    await pool.execute(
        "INSERT INTO rag_document (id, title, source, document_type, language, checksum, metadata) "
        "VALUES ($1, $2, $3, $4, $5, $6, $7)",
        doc_id,
        doc.title,
        doc.source,
        doc.document_type,
        doc.language,
        doc.checksum,
        json.dumps(doc.metadata),
    )
    logger.info("Inserted RAG document: %s (id=%s)", doc.title, doc_id)
    return doc


async def insert_chunks(chunks: list[RagChunk]) -> int:
    """Bulk insert RAG chunks with embeddings.

    Returns the number of chunks inserted.
    """
    if not chunks:
        return 0

    pool = await get_pool()

    records = [
        (
            chunk.id,
            chunk.document_id,
            chunk.chunk_index,
            chunk.content,
            json.dumps(chunk.metadata),
            "[" + ",".join(str(v) for v in chunk.embedding) + "]" if chunk.embedding else None,
        )
        for chunk in chunks
    ]

    await pool.executemany(
        "INSERT INTO rag_chunk (id, document_id, chunk_index, content, metadata, embedding) "
        "VALUES ($1, $2, $3, $4, $5, $6::vector)",
        records,
    )
    logger.info("Inserted %d RAG chunks", len(records))
    return len(records)


async def search_similar(
    query_embedding: list[float],
    top_k: int = 5,
    similarity_threshold: float = 0.3,
) -> list[RetrievalResult]:
    """Search for similar chunks using cosine distance.

    Args:
        query_embedding: The query vector (384 dims).
        top_k: Number of results to return.
        similarity_threshold: Minimum similarity score (0-1).

    Returns:
        List of RetrievalResult sorted by similarity descending.
    """
    pool = await get_pool()

    embedding_str = "[" + ",".join(str(v) for v in query_embedding) + "]"

    rows = await pool.fetch(
        """
        SELECT
            rc.id, rc.document_id, rc.chunk_index, rc.content, rc.metadata,
            rd.title, rd.document_type,
            1 - (rc.embedding <=> $1::vector) AS similarity
        FROM rag_chunk rc
        JOIN rag_document rd ON rc.document_id = rd.id
        WHERE rc.embedding IS NOT NULL
        ORDER BY rc.embedding <=> $1::vector
        LIMIT $2
        """,
        embedding_str,
        top_k,
    )

    results = []
    for row in rows:
        score = float(row["similarity"])
        if score < similarity_threshold:
            continue
        results.append(
            RetrievalResult(
                chunk=RagChunk(
                    id=row["id"],
                    document_id=row["document_id"],
                    chunk_index=row["chunk_index"],
                    content=row["content"],
                    metadata=json.loads(row["metadata"]) if row["metadata"] else {},
                ),
                score=score,
                document_title=row["title"],
                document_type=row["document_type"],
            )
        )

    return results


async def get_document_count() -> int:
    """Return the number of RAG documents."""
    pool = await get_pool()
    row = await pool.fetchrow("SELECT COUNT(*) AS cnt FROM rag_document")
    return row["cnt"]


async def get_chunk_count() -> int:
    """Return the number of RAG chunks."""
    pool = await get_pool()
    row = await pool.fetchrow("SELECT COUNT(*) AS cnt FROM rag_chunk")
    return row["cnt"]


async def delete_document(doc_id: UUID) -> bool:
    """Delete a document and its chunks. Returns True if document existed."""
    pool = await get_pool()
    result = await pool.execute("DELETE FROM rag_document WHERE id = $1", doc_id)
    deleted = result.endswith("1")
    if deleted:
        logger.info("Deleted RAG document %s", doc_id)
    return deleted

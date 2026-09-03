"""RAG ingestion pipeline: document → chunk → embed → store."""

import hashlib
import logging
from pathlib import Path
from typing import Optional
from uuid import uuid4

from app.rag.chunking import chunk_text
from app.rag.embedding import embed_texts
from app.rag.models import RagDocument, RagChunk
from app.rag.store import (
    compute_checksum,
    insert_document,
    insert_chunks,
    get_document_count,
)

logger = logging.getLogger(__name__)


async def ingest_text(
    title: str,
    content: str,
    document_type: str = "manual",
    source: Optional[str] = None,
    metadata: Optional[dict] = None,
    chunk_size: int = 500,
    chunk_overlap: int = 100,
) -> dict:
    """Ingest a text document into the RAG knowledge base.

    Args:
        title: Document title.
        content: Full document text.
        document_type: Category (manual, regulation, faq, etc.).
        source: Source URL or origin.
        metadata: Additional metadata.
        chunk_size: Maximum characters per chunk.
        chunk_overlap: Overlap between chunks.

    Returns:
        dict with ingestion summary.
    """
    checksum = compute_checksum(content)

    doc = RagDocument(
        id=uuid4(),
        title=title,
        source=source,
        document_type=document_type,
        checksum=checksum,
        metadata=metadata or {},
    )

    doc = await insert_document(doc)

    # Check if document was skipped (duplicate)
    existing_chunks = await _count_chunks_for_document(doc.id)
    if existing_chunks > 0:
        logger.info("Document '%s' already has %d chunks, skipping ingestion", title, existing_chunks)
        return {
            "status": "skipped",
            "document_id": str(doc.id),
            "title": title,
            "chunks": existing_chunks,
        }

    # Chunk the text
    text_chunks = chunk_text(content, chunk_size=chunk_size, chunk_overlap=chunk_overlap)

    if not text_chunks:
        logger.warning("No chunks produced for document '%s'", title)
        return {
            "status": "empty",
            "document_id": str(doc.id),
            "title": title,
            "chunks": 0,
        }

    # Generate embeddings
    try:
        embeddings = embed_texts(text_chunks)
    except Exception as e:
        logger.error("Embedding generation failed for '%s': %s", title, e)
        return {
            "status": "error",
            "document_id": str(doc.id),
            "title": title,
            "error": str(e),
        }

    # Create chunk objects
    rag_chunks = [
        RagChunk(
            id=uuid4(),
            document_id=doc.id,
            chunk_index=i,
            content=chunk_text_val,
            metadata={"chunk_size": len(chunk_text_val)},
            embedding=embedding,
        )
        for i, (chunk_text_val, embedding) in enumerate(zip(text_chunks, embeddings))
    ]

    # Store chunks
    count = await insert_chunks(rag_chunks)

    logger.info("Ingested '%s': %d chunks", title, count)
    return {
        "status": "success",
        "document_id": str(doc.id),
        "title": title,
        "chunks": count,
    }


async def ingest_file(file_path: str, **kwargs) -> dict:
    """Ingest a text file into the RAG knowledge base.

    Args:
        file_path: Path to the text file.
        **kwargs: Additional arguments passed to ingest_text.

    Returns:
        dict with ingestion summary.
    """
    path = Path(file_path)
    if not path.exists():
        return {"status": "error", "error": f"File not found: {file_path}"}

    content = path.read_text(encoding="utf-8")
    title = kwargs.pop("title", path.stem)

    return await ingest_text(title=title, content=content, source=str(path), **kwargs)


async def ingest_directory(
    dir_path: str,
    document_type: str = "manual",
    pattern: str = "*.txt",
    **kwargs,
) -> list[dict]:
    """Ingest all matching files from a directory.

    Args:
        dir_path: Path to the directory.
        document_type: Default document type for files.
        pattern: Glob pattern for file selection.
        **kwargs: Additional arguments passed to ingest_text.

    Returns:
        List of ingestion results.
    """
    path = Path(dir_path)
    if not path.is_dir():
        return [{"status": "error", "error": f"Not a directory: {dir_path}"}]

    results = []
    for file_path in sorted(path.glob(pattern)):
        if file_path.is_file():
            result = await ingest_file(
                str(file_path),
                document_type=document_type,
                **kwargs,
            )
            results.append(result)

    return results


async def _count_chunks_for_document(document_id) -> int:
    """Count chunks for a given document."""
    from app.rag.store import get_pool

    pool = await get_pool()
    row = await pool.fetchrow(
        "SELECT COUNT(*) AS cnt FROM rag_chunk WHERE document_id = $1",
        document_id,
    )
    return row["cnt"]


async def get_knowledge_base_stats() -> dict:
    """Get statistics about the RAG knowledge base."""
    doc_count = await get_document_count()
    chunk_count = await _count_all_chunks()
    return {
        "documents": doc_count,
        "chunks": chunk_count,
    }


async def _count_all_chunks() -> int:
    """Count total chunks."""
    from app.rag.store import get_pool

    pool = await get_pool()
    row = await pool.fetchrow("SELECT COUNT(*) AS cnt FROM rag_chunk")
    return row["cnt"]
